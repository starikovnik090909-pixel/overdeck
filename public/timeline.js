// public/timeline.js — Блок 2: таймлайн стрима.
//
// Что рисуется (снизу вверх):
//  1) ФОН ИЗ ОБЛОЖЕК КАТЕГОРИЙ — на каждом отрезке стрима обложка текущей категории повторяется плиткой, пока категория
//     не сменится; на стыке — тонкая яркая вертикальная линия, внизу отрезка — название категории (настройка
//     showCategoryBackground; выключена — работает прежнее оформление с обложкой сверху).
//  2) Плавная линия активности (Catmull-Rom) и заливка под ней.
//  3) КРУЖКИ АКТИВНОСТИ — аватарки сообщений, точки баллов/подписок/рейдов и ЗЕЛЁНЫЕ ПРЯМОУГОЛЬНИКИ С СУММОЙ для донатов.
//     Они не приклеены к линии: свободно плавают вокруг неё (по обе стороны, на расстоянии от линии), по горизонтали —
//     на том времени, когда событие произошло. Каждый кружок живёт ограниченное время (activityLifetimeMin, по умолчанию
//     10 минут) и затем исчезает с таймлайна. В «Повторе» (кнопка «Воспроизвести историю») сервер присылает для каждого
//     кадра кружки, «жившие» в этот момент (tl.replayTs), — получается плавно плывущее вдоль стрима облако.
//  4) Часы стрима (чч:мм:сс) на тёмной полупрозрачной плашке в правом верхнем углу; в повторе показывают время кадра.
//
// Виджет перерисовывается непрерывно (requestAnimationFrame) — вся анимация внутри canvas и не влияет на layout панели
// (её размер по-прежнему задаёт только ResizeObserver).
//
// Ось времени всегда растягивает весь стрим (от первой реальной точки данных до сейчас) на ширину канваса: график не
// скроллится, а сжимается по мере того, как стрим становится длиннее. Ручного скролла/зума нет.

(function () {
  const canvas = document.getElementById('timelineCanvas');
  const wrap = document.getElementById('timelineWrap');
  const ctx = canvas.getContext('2d');

  const MAX_MARKERS = 240; // держим в паре с потолком кружков на сервере (timeline.js MAX_BUBBLES_PER_FRAME)
  const imageCache = new Map(); // url -> HTMLImageElement (аватарки + обложки категорий)
  const markers = new Map();    // key -> состояние плавающего маркера

  // Масштаб кружков от высоты блока: в узкой полоске кружки мельче, чем в высоком окне (SIZE_REF_H — высота, при которой размер ровно такой, как в настройках).
  const SIZE_REF_H = 400;
  let sizeK = 1;
  function computeSizeK(canvasH, dpr) { return Math.max(0.45, Math.min(1.2, (canvasH / dpr) / SIZE_REF_H)); }

  let latest = null;
  let streamStartedAt = Date.now();

  const DEFAULT_TL_SETTINGS = {
    bgColor: '#141419', bgAlpha: 55,
    lineColor: '#B14846', fillColor: '#B14846', textColor: '#E0E0E0',
    messageColor: '#9A9A9A', pointsColor: '#00D4FF',
    subColor: '#FFD700', raidColor: '#FF3B3B', categoryColor: '#00D4B8',
    avatarSize: 26, eventDotSize: 9, categoryImageSize: 40,
    showCategoryThumbnails: false, showTimecodes: false,
    useWaveGradient: false, waveGradientStart: '#B14846', waveGradientEnd: '#E07A3F',
    useUnifiedDotColor: false, dotColor: '#FFFFFF',
    donationColor: '#4FAE5A', activityLifetimeMin: 5, activityFloatSpread: 36,
    showCategoryBackground: true, categoryBgOpacity: 55,
    showClockPlate: true, clockPlateOpacity: 60,
  };

  function rgbArrayToHex([r, g, b]) {
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /** Настройки таймлайна: если включена "Использовать общую палитру" — фон/линия/текст/прозрачность
      берутся из общей темы оверлея ("Основные настройки"), а не из локальных полей виджета. */
  function getTlSettings() {
    const s = { ...DEFAULT_TL_SETTINGS, ...((window.widgetSettings && window.widgetSettings.timeline) || {}) };
    if (s.useGlobalPalette !== false) {
      const theme = window.overlayTheme;
      if (theme) {
        if (Array.isArray(theme.bgPanelRGB)) s.bgColor = rgbArrayToHex(theme.bgPanelRGB);
        if (typeof theme.bgPanelAlpha === 'number') s.bgAlpha = theme.bgPanelAlpha * 100;
        if (theme.accent) s.lineColor = theme.accent;
        if (theme.textMain) s.textColor = theme.textMain;
      }
    }
    return s;
  }

  function getImage(url) {
    let img = imageCache.get(url);
    if (!img) { img = new Image(); img.src = url; imageCache.set(url, img); }
    return img;
  }

  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = Math.max(1, Math.round(entry.contentRect.width));
      const h = Math.max(1, Math.round(entry.contentRect.height));
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
  });
  ro.observe(wrap);

  function render(data) {
    latest = data;
    streamStartedAt = (data.timeline && data.timeline.startedAt) || streamStartedAt;
    syncMarkers();
  }

  function formatClock(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Часы стрима с секундами: 00:00:00 (часы не обрезаются на 99 — на длинных стримах будет 100:00:00 и т.д.). */
  function formatClockHMS(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  /** Сумма доната для прямоугольника — просто число, без валюты ("1 000"). */
  /** Подпись доната: сумма в рублях (пересчитана сервером); если валюту пересчитать не удалось — сумма с кодом валюты. */
  function donationLabel(meta) {
    const m = meta || {};
    const cur = String(m.currency || 'RUB').toUpperCase();
    if (Number.isFinite(Number(m.amountRub))) return `${formatAmount(m.amountRub)} ₽`;
    if (cur === 'RUB' || cur === '₽') return `${formatAmount(m.amount)} ₽`;
    return `${formatAmount(m.amount)} ${cur}`;
  }

  function formatAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    return Math.round(n).toLocaleString('ru-RU');
  }

  function hexToRgba(hex, alpha) {
    const clean = (hex || '#000000').replace('#', '');
    const num = parseInt(clean, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Сглаживает резкие ступени скользящей суммы скользящим средним по соседним сэмплам. */
  function smoothValues(points, radius) {
    if (points.length <= 2) return points;
    const result = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(points.length - 1, i + radius); j++) {
        sum += points[j].value;
        count++;
      }
      result[i] = { ts: points[i].ts, value: sum / count };
    }
    return result;
  }

  /** Плавная кривая через все точки — Catmull-Rom, переведённая в кубические Безье. */
  function traceSmoothPath(points, xFor, yFor) {
    const pts = points.map((p) => ({ x: xFor(p.ts), y: yFor(p.value) }));
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  /** Значение сглаженной линии в произвольный момент времени — линейная интерполяция между сэмплами. */
  function valueAtTime(smoothed, ts) {
    if (smoothed.length === 0) return 0;
    if (ts <= smoothed[0].ts) return smoothed[0].value;
    const last = smoothed[smoothed.length - 1];
    if (ts >= last.ts) return last.value;
    for (let i = 1; i < smoothed.length; i++) {
      if (smoothed[i].ts >= ts) {
        const p0 = smoothed[i - 1], p1 = smoothed[i];
        const t = (ts - p0.ts) / ((p1.ts - p0.ts) || 1);
        return p0.value + (p1.value - p0.value) * t;
      }
    }
    return last.value;
  }

  // 'emote' сюда намеренно не входит: у каждого сообщения уже есть свой
  // маркер типа 'message' (одна аватарка на сообщение), а использованные в
  // нём эмодзи по-прежнему учитываются в весе линии (см. backend timeline.js),
  // просто не рисуются отдельным дублирующим маркером поверх той же аватарки.
  // 'donation' — зелёный прямоугольник с суммой.
  const FLOATING_TYPES = new Set(['message', 'channelpoints', 'sub', 'giftsub', 'raid', 'donation']);

  /** Сверяет набор плавающих маркеров с присланными событиями — заводит новые, гасит лишние. */
  function syncMarkers() {
    if (!latest) return;
    const tl = latest.timeline || {};
    const recentEvents = tl.recentEvents || [];
    const relevant = recentEvents.filter((e) => FLOATING_TYPES.has(e.type)).slice(-MAX_MARKERS);
    const keys = new Set();

    relevant.forEach((e) => {
      const key = `${e.ts}-${e.type}-${e.username || ''}`;
      keys.add(key);
      let m = markers.get(key);
      if (!m) {
        // Постоянные для этого кружка «характер» и «полоса»: на какой стороне линии (lane<0 — выше, >0 — ниже) и на
        // каком удалении от неё он плавает, плюс собственные медленные частоты дрейфа — чтобы кружки не двигались хором.
        const side = Math.random() < 0.5 ? -1 : 1;
        m = {
          key, offsetX: 0, offsetY: 0, vx: 0, vy: 0, alpha: 0, dying: false,
          lane: side * (0.15 + Math.random() * 0.85),
          phaseX: Math.random() * Math.PI * 2, phaseY: Math.random() * Math.PI * 2,
          freqX: 0.25 + Math.random() * 0.35, freqY: 0.2 + Math.random() * 0.35, // рад/с → период дрейфа 10–30 секунд
        };
        markers.set(key, m);
      }
      m.type = e.type;
      m.ts = e.ts;
      m.username = e.username;
      m.avatarUrl = e.avatarUrl;
      m.amount = e.meta && e.meta.amount;
      m.amountLabel = donationLabel(e.meta);
      m.dying = false;
    });

    markers.forEach((m, key) => { if (!keys.has(key)) m.dying = true; });
  }

  function colorForType(type, s) {
    if (type === 'donation') return s.donationColor; // донат всегда зелёный — единый цвет точек на него не распространяется
    if (s.useUnifiedDotColor) return s.dotColor; // тема просит один цвет для всех точек активности (не для аватарок)
    if (type === 'channelpoints') return s.pointsColor;
    if (type === 'sub' || type === 'giftsub') return s.subColor;
    if (type === 'raid') return s.raidColor;
    return s.messageColor;
  }

  function radiusForType(m, s, dpr) {
    const type = m.type;
    if (type === 'donation') return donationGeometry(m, s, dpr).collideR;
    if (type === 'message' || type === 'emote') return (s.avatarSize / 2) * dpr * sizeK;
    if (type === 'raid') return s.eventDotSize * dpr * sizeK * 1.2; // рейд чуть заметнее; кружок с иконкой, поэтому радиус = размер точки (раньше точка была вдвое меньше)
    return s.eventDotSize * dpr * sizeK;
  }

  /** Размеры прямоугольника доната — зависят от длины суммы, поэтому считаются по тексту и кешируются на маркере. */
  function donationGeometry(m, s, dpr) {
    const text = m.amountLabel || `${formatAmount(m.amount)} ₽`;
    const key = `${text}|${s.avatarSize}|${dpr}|${sizeK.toFixed(2)}`;
    if (m._geoKey === key) return m;
    const h = Math.max(13, s.avatarSize * 0.85 * sizeK) * dpr;
    ctx.save();
    ctx.font = `700 ${Math.round(h * 0.52)}px Inter, sans-serif`;
    const w = Math.max(h * 1.5, ctx.measureText(text).width + h * 0.9);
    ctx.restore();
    m.rectH = h; m.rectW = w; m.amountText = text;
    m.collideR = Math.max(w, h) / 2 * 0.9; // для отталкивания прямоугольник приближаем кругом чуть меньше его половины ширины
    m._geoKey = key;
    return m;
  }

  function drawAvatarMarker(m, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const img = m.avatarUrl ? getImage(m.avatarUrl) : null;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = (window.colorForName && m.username) ? window.colorForName(m.username) : '#B14846';
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      if (m.username) {
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.max(9, r)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.username[0].toUpperCase(), x, y);
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.restore();
  }

  function drawDotMarker(x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 1.6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /** Осветляет (amount > 0) или затемняет (amount < 0) цвет #rrggbb. */
  function shade(hex, amount) {
    const clean = (hex || '#000000').replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
    const mix = (c) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
    const r = mix((num >> 16) & 255), g = mix((num >> 8) & 255), b = mix(num & 255);
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }

  /** Донат: «денежная» плашка — зелёная с лёгким градиентом, тёмной обводкой и тонкой внутренней рамкой, как у купюры; внутри сумма в рублях. */
  function drawDonationMarker(m, x, y, color, alpha, dpr) {
    const mk = markerStyle();
    const dn = mk && mk.don;
    if (dn && dn.fill) color = dn.fill;
    const w = m.rectW, h = m.rectH, rad = h * (dn ? dn.r : 0.28);
    const left = x - w / 2, top = y - h / 2;
    const roundRect = (l, t, ww, hh, rr) => {
      ctx.beginPath();
      ctx.moveTo(l + rr, t);
      ctx.arcTo(l + ww, t, l + ww, t + hh, rr);
      ctx.arcTo(l + ww, t + hh, l, t + hh, rr);
      ctx.arcTo(l, t + hh, l, t, rr);
      ctx.arcTo(l, t, l + ww, t, rr);
      ctx.closePath();
    };
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const mode = dn ? dn.mode : 'classic';
    let textCol = '#ffffff', textShadow = shade(color, -0.7);
    if (dn && dn.pixel) { roundRect(left + h * 0.14, top + h * 0.14, w, h, rad); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill(); }
    roundRect(left, top, w, h, rad);
    if (mode === 'classic' || mode === 'grad') {
      const grad = ctx.createLinearGradient(0, top, 0, top + h);
      grad.addColorStop(0, shade(color, 0.18)); grad.addColorStop(1, shade(color, -0.12));
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = h * 0.35; ctx.shadowOffsetY = h * 0.08;
      ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = (dn && dn.border) || shade(color, -0.6); // тёмная обводка — тот же зелёный, но заметно темнее
      ctx.lineWidth = Math.max(1.5 * dpr, h * 0.07); ctx.stroke();
    } else if (mode === 'flat') {
      ctx.fillStyle = color; ctx.fill();
      if (dn.border !== 'none') { ctx.strokeStyle = dn.border || shade(color, -0.5); ctx.lineWidth = Math.max(1.5 * dpr, h * 0.07); ctx.stroke(); }
      textCol = dn.text || (lum(color) > 0.62 ? '#10201a' : '#fff'); textShadow = 'rgba(0,0,0,0)';
    } else if (mode === 'glass') {
      ctx.fillStyle = hexToRgba(color, 0.38); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1 * dpr, h * 0.05); ctx.stroke();
    } else if (mode === 'outline') {
      ctx.fillStyle = hexToRgba(color, 0.14); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1 * dpr, h * (dn.thin ? 0.035 : 0.06)); ctx.stroke();
      textCol = shade(color, 0.35); textShadow = 'rgba(0,0,0,0.5)';
    } else if (mode === 'dark') {
      ctx.fillStyle = dn.bg || '#111'; ctx.fill();
      ctx.strokeStyle = dn.border || color; ctx.lineWidth = Math.max(1.5 * dpr, h * 0.07); ctx.stroke();
      textCol = shade(color, 0.45); textShadow = 'rgba(0,0,0,0.6)';
    } else if (mode === 'light') {
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = h * 0.35; ctx.shadowOffsetY = h * 0.1; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1 * dpr; ctx.stroke();
      textCol = shade(color, -0.35); textShadow = 'rgba(0,0,0,0)';
    } else if (mode === 'slot') {
      ctx.fillStyle = '#8b8b8b'; ctx.fill();
      ctx.strokeStyle = '#373737'; ctx.lineWidth = Math.max(2 * dpr, h * 0.09); ctx.stroke();
      ctx.fillStyle = '#c6c6c6'; ctx.fillRect(left, top, w, Math.max(2 * dpr, h * 0.09));
      textCol = '#55ff55'; textShadow = '#143314';
    }
    if (mode === 'classic' || mode === 'grad') {
      // тонкая светлая внутренняя рамка (как кайма на купюре)
      const inset = Math.max(2 * dpr, h * 0.14);
      if (w > inset * 3 && h > inset * 3) {
        roundRect(left + inset, top + inset, w - inset * 2, h - inset * 2, Math.max(1, rad - inset * 0.6));
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1 * dpr; ctx.stroke();
      }
    }
    ctx.fillStyle = textCol;
    ctx.font = `800 ${Math.round(h * 0.5)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = textShadow;
    ctx.shadowBlur = 2 * dpr;
    ctx.fillText(m.amountText, x, y + 0.5 * dpr);
    ctx.restore();
  }

  // Иконки внутри кружков событий (баллы, подписка, подарок, рейд): рисуются по путям в сетке 24×24.
  const ICON_PATHS = {
    channelpoints: { path: new Path2D('M13.2 2.5 5 13.6h5.6L9.8 21.5 19 9.8h-5.7z'), fill: true },                                  // молния — «баллы»
    sub: { path: new Path2D('M12 2.8l2.8 5.9 6.4.9-4.7 4.5 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.6l6.4-.9z'), fill: true },     // звезда — подписка
    giftsub: { path: new Path2D('M4 9.5h16v3H4zM5.2 12.5h13.6V20H5.2zM12 9.5V20M12 9.5c-2.6 0-4.4-.8-4.4-2.4S9.3 4.8 10.6 6c.8.7 1.4 2 1.4 3.5zM12 9.5c2.6 0 4.4-.8 4.4-2.4S14.7 4.8 13.4 6c-.8.7-1.4 2-1.4 3.5z'), fill: false }, // подарок
    raid: { path: new Path2D('M5.5 6.5 11 12l-5.5 5.5M12.5 6.5 18 12l-5.5 5.5'), fill: false },                                      // стрелки вперёд — рейд
    // дополнительные иконки — их выбирают стили оформления вместо стандартных (см. MARKER_STYLES)
    heart: { path: new Path2D('M12 20.6 4 12.7a4.7 4.7 0 0 1 6.6-6.6L12 7.5l1.4-1.4A4.7 4.7 0 0 1 20 12.7z'), fill: true },
    gem: { path: new Path2D('M7.2 4h9.6l4.2 5.2L12 20.5 3 9.2z'), fill: true },
    crown: { path: new Path2D('M3.3 18.6h17.4l1-10.6-5 4.1L12 5.2 7.3 12.1 2.3 8z'), fill: true },
    shield: { path: new Path2D('M12 3 5 6v5.6c0 4.3 3 7.7 7 9.1 4-1.4 7-4.8 7-9.1V6z'), fill: true },
    coin: { path: new Path2D('M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'), fill: false },
    crosshair: { path: new Path2D('M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z'), fill: false },
    swords: { path: new Path2D('M4.5 4.5l11 11M19.5 4.5l-11 11M12.5 18l3-3M11.5 18l-3-3M4.5 20l2.5-2.5M19.5 20 17 17.5'), fill: false },
  };

  // ---- Оформление маркеров событий по стилям оформления (body[data-ostyle]) ----
  // shape: форма; fill: способ заливки; pal: цвета типов (p — баллы, s — подписка, g — подарки, r — рейд; если нет — цвета из настроек виджета);
  // ic: цвет иконки ('white' | 'dark' | 'auto' по яркости | 'col' цвет типа | '#hex'); icons: замена иконок; border/bg/glow/shadow — детали.
  // Классический стиль и неизвестные — без настроек, рисуется как раньше (цветной кружок). Донаты — поле don: режим плашки и скругление.
  const MARKER_STYLES = {
    a: { shape: 'circle', fill: 'glass', ic: 'white', don: { mode: 'glass', r: 0.5 } },
    b: { shape: 'hex', fill: 'solid', pal: { p: '#44D62C', s: '#44D62C', g: '#8dff75', r: '#2bd1a3' }, ic: '#06140a', glow: 1.4, don: { mode: 'flat', r: 0, text: '#06140a', fill: '#44D62C' } },
    c: { shape: 'square', fill: 'outline', accent: true, ic: 'col', don: { mode: 'outline', r: 0.12 } },
    d: { shape: 'rsq', fill: 'grad', ic: 'white', don: { mode: 'grad', r: 0.5 } },
    e: { shape: 'square', fill: 'solid', pal: { p: '#ffd84d', s: '#ff5ca8', g: '#7df9ff', r: '#ff8a3d' }, ic: '#15122a', border: '#0b0820', pixel: true, don: { mode: 'flat', r: 0, text: '#15122a', border: '#0b0820', pixel: true } },
    f: { shape: 'circle', fill: 'solid', pal: { p: '#5865F2', s: '#EB459E', g: '#57F287', r: '#FEE75C' }, ic: 'auto', glow: 0, border: 'none', don: { mode: 'flat', r: 0.5, fill: '#23a55a', border: 'none' } },
    g: { shape: 'oct', fill: 'dark', bg: '#241008', pal: { p: '#c8a24a', s: '#c8a24a', g: '#c8a24a', r: '#d9402e' }, ic: 'col', icons: { sub: 'shield', raid: 'swords' }, don: { mode: 'dark', r: 0.12, bg: '#241008', border: '#c8a24a' } },
    h: { shape: 'diamond', fill: 'dark', bg: '#0a1428', pal: { p: '#c8aa6e', s: '#c8aa6e', g: '#c8aa6e', r: '#0ac8b9' }, ic: 'col', icons: { channelpoints: 'gem', sub: 'crown', raid: 'swords' }, don: { mode: 'dark', r: 0, bg: '#0a1428', border: '#c8aa6e' } },
    i: { shape: 'square', fill: 'outline', pal: { p: '#f0c14b', s: '#f0c14b', g: '#f0c14b', r: '#f0c14b' }, ic: 'col', icons: { channelpoints: 'coin', raid: 'crosshair' }, don: { mode: 'outline', r: 0 } },
    j: { shape: 'circle', fill: 'grad', pal: { p: '#0070dd', s: '#a335ee', g: '#1eff00', r: '#ff8000' }, ic: 'white', border: '#000', icons: { channelpoints: 'coin', sub: 'gem', raid: 'swords' }, don: { mode: 'grad', r: 0.2, border: '#000' } },
    k: { shape: 'para', fill: 'solid', pal: { p: '#ece8e1', s: '#ff4655', g: '#ff4655', r: '#ff4655' }, ic: 'auto', border: 'none', icons: { raid: 'crosshair' }, don: { mode: 'flat', r: 0, fill: '#4fb87a', border: 'none' } },
    l: { shape: 'square', fill: 'slot', pal: { p: '#4be3d8', s: '#ff5555', g: '#55ff55', r: '#ffaa00' }, ic: 'col', icons: { channelpoints: 'gem', sub: 'heart', raid: 'swords' }, don: { mode: 'slot', r: 0 } },
    m: { shape: 'circle', fill: 'outline', pal: { p: '#c4c4c4', s: '#c4c4c4', g: '#c4c4c4', r: '#c4c4c4' }, ic: 'col', thin: true, glow: 0, don: { mode: 'outline', r: 0, thin: true } },
    n: { shape: 'circle', fill: 'light', ic: 'col', don: { mode: 'light', r: 0.5 } },
    o: { shape: 'cyber', fill: 'solid', pal: { p: '#00f0ff', s: '#fcee0a', g: '#ff003c', r: '#ff003c' }, ic: '#0a0a0a', glow: 1.2, border: 'none', icons: { raid: 'crosshair' }, don: { mode: 'flat', r: 0, fill: '#00f08a', text: '#04140c', border: 'none' } },
  };

  let mkCache = { key: null, cfg: null, accent: '#B14846', at: 0 };
  /** Настройки маркеров для текущего стиля (или null — классический вид). Акцент темы перечитывается раз в секунду. */
  function markerStyle() {
    const id = document.body.getAttribute('data-ostyle');
    const now = performance.now();
    if (mkCache.key !== id || now - mkCache.at > 1000) {
      let accent = mkCache.accent;
      try { accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || accent; } catch (e) { /* ignore */ }
      mkCache = { key: id, cfg: (id && MARKER_STYLES[id]) || null, accent, at: now };
    }
    return mkCache.cfg ? Object.assign({}, mkCache.cfg, { _accent: mkCache.accent }) : null;
  }
  const PAL_KEY = { channelpoints: 'p', sub: 's', giftsub: 'g', raid: 'r' };
  const lum = (hex) => { const c = (hex || '#000').replace('#', ''); const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c.slice(0, 6), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  /** Цвет маркера события с учётом стиля: палитра стиля, акцент темы или цвет из настроек виджета. */
  function styledColor(type, base) {
    const mk = markerStyle();
    if (!mk) return base;
    if (mk.pal && mk.pal[PAL_KEY[type]]) return mk.pal[PAL_KEY[type]];
    if (mk.accent) return mk._accent;
    return base;
  }

  /** Контур формы маркера. */
  function shapePath(shape, x, y, r) {
    ctx.beginPath();
    const h = r * 0.92;
    if (shape === 'circle') { ctx.arc(x, y, r, 0, Math.PI * 2); return; }
    if (shape === 'square') { ctx.rect(x - h, y - h, h * 2, h * 2); return; }
    if (shape === 'rsq') { ctx.roundRect(x - h, y - h, h * 2, h * 2, h * 0.5); return; }
    if (shape === 'hex') { for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; const px = x + Math.cos(a) * r * 1.08, py = y + Math.sin(a) * r * 1.08; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); return; }
    if (shape === 'diamond') { const d = r * 1.28; ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); return; }
    if (shape === 'oct') { const c = h * 0.42; ctx.moveTo(x - h + c, y - h); ctx.lineTo(x + h - c, y - h); ctx.lineTo(x + h, y - h + c); ctx.lineTo(x + h, y + h - c); ctx.lineTo(x + h - c, y + h); ctx.lineTo(x - h + c, y + h); ctx.lineTo(x - h, y + h - c); ctx.lineTo(x - h, y - h + c); ctx.closePath(); return; }
    if (shape === 'para') { const k = h * 0.32; ctx.moveTo(x - h + k, y - h); ctx.lineTo(x + h + k, y - h); ctx.lineTo(x + h - k, y + h); ctx.lineTo(x - h - k, y + h); ctx.closePath(); return; }
    if (shape === 'cyber') { const c = h * 0.5; ctx.moveTo(x - h, y - h); ctx.lineTo(x + h - c, y - h); ctx.lineTo(x + h, y - h + c); ctx.lineTo(x + h, y + h); ctx.lineTo(x - h + c, y + h); ctx.lineTo(x - h, y + h - c); ctx.closePath(); return; }
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  /** Маркер события в оформлении стиля: форма, заливка, иконка. */
  function drawStyledMarker(mk, type, x, y, r, color, alpha, dpr) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const lw = Math.max(1 * dpr, r * (mk.thin ? 0.06 : 0.11));
    const border = mk.border === 'none' ? null : (mk.border || null);
    if (mk.pixel) { shapePath(mk.shape, x + r * 0.28, y + r * 0.28, r); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill(); }
    shapePath(mk.shape, x, y, r);
    let iconCol = '#fff';
    if (mk.fill === 'solid') {
      ctx.fillStyle = color;
      if (mk.glow !== 0) { ctx.shadowColor = color; ctx.shadowBlur = r * (mk.glow == null ? 0.7 : mk.glow); }
      ctx.fill(); ctx.shadowBlur = 0;
      if (border !== null || mk.border == null) { ctx.strokeStyle = border || shade(color, -0.5); ctx.lineWidth = lw; ctx.stroke(); }
      iconCol = mk.ic === 'auto' ? (lum(color) > 0.62 ? '#15151a' : '#fff') : mk.ic;
    } else if (mk.fill === 'grad') {
      const g = ctx.createLinearGradient(x, y - r, x, y + r); g.addColorStop(0, shade(color, 0.25)); g.addColorStop(1, shade(color, -0.15));
      ctx.fillStyle = g; ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = r * 0.5; ctx.shadowOffsetY = r * 0.12; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = border || shade(color, -0.45); ctx.lineWidth = lw; ctx.stroke();
      iconCol = '#fff';
    } else if (mk.fill === 'glass') {
      ctx.fillStyle = hexToRgba(color, 0.62); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = lw; ctx.stroke();
      iconCol = '#fff';
    } else if (mk.fill === 'outline') {
      ctx.fillStyle = hexToRgba(color, mk.thin ? 0.1 : 0.28); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = lw * (mk.thin ? 1.2 : 1.3); ctx.stroke();
      iconCol = mk.ic === 'col' ? color : (mk.ic || color);
    } else if (mk.fill === 'dark') {
      ctx.fillStyle = mk.bg || '#111'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = lw * 1.2; ctx.stroke();
      iconCol = color;
    } else if (mk.fill === 'light') {
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = r * 0.6; ctx.shadowOffsetY = r * 0.15; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = lw; ctx.stroke();
      iconCol = shade(color, -0.25);
    } else if (mk.fill === 'slot') { // «слот» майнкрафта: серый с фасками, иконка цветная
      ctx.fillStyle = '#8b8b8b'; ctx.fill();
      ctx.strokeStyle = '#373737'; ctx.lineWidth = lw * 1.3; ctx.stroke();
      const h = r * 0.92;
      ctx.fillStyle = '#c6c6c6'; ctx.fillRect(x - h, y - h, h * 2, lw * 1.3);
      ctx.fillRect(x - h, y - h, lw * 1.3, h * 2);
      iconCol = color;
    }
    const key = (mk.icons && mk.icons[type]) || type;
    const icon = ICON_PATHS[key];
    if (icon && r >= 5 * dpr) {
      const size = r * 1.3;
      ctx.translate(x - size / 2, y - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.fillStyle = iconCol; ctx.strokeStyle = iconCol;
      ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (icon.fill) ctx.fill(icon.path); else ctx.stroke(icon.path);
    }
    ctx.restore();
  }

  /** Кружок события: цвет типа, тёмный ободок и белая иконка по смыслу. Для неизвестного типа — просто цветной кружок. */
  function drawIconMarker(type, x, y, r, color, alpha, dpr) {
    const mk = markerStyle();
    if (mk) { drawStyledMarker(mk, type, x, y, r, styledColor(type, color), alpha, dpr); return; }
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 0.9;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = shade(color, -0.45);
    ctx.lineWidth = Math.max(1 * dpr, r * 0.1);
    ctx.stroke();
    const icon = ICON_PATHS[type];
    if (icon && r >= 5 * dpr) {
      const size = r * 1.35; // сторона области иконки внутри кружка
      ctx.translate(x - size / 2, y - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 1.5;
      if (icon.fill) ctx.fill(icon.path); else ctx.stroke(icon.path);
    }
    ctx.restore();
  }

  /** Обрезает строку многоточием, чтобы она поместилась в maxWidth (для подписей категорий в узких отрезках). */
  function fitText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return t + '…';
  }

  /**
   * ФОН ИЗ ОБЛОЖЕК КАТЕГОРИЙ. Отрезок стрима от смены до смены закрашивается плиткой из обложки этой категории
   * (плитка повторяется, пока категория не сменится), на стыке — тонкая яркая линия, внизу отрезка — название.
   * frontTs — «до какого момента есть данные»: в эфире это сейчас, в повторе — время кадра.
   */
  function drawCategoryBackground(s, categoryHistory, xFor, rangeStart, frontTs, W, H, baseline, bottomReserve, dpr) {
    const cats = categoryHistory.filter((c) => c && c.startedAt && c.startedAt <= frontTs).sort((a, b) => a.startedAt - b.startedAt);
    if (!cats.length) return;
    const segs = cats.map((cat, i) => {
      // Первая известная категория считается действующей с самого начала графика (сервер мог узнать её чуть позже первой точки).
      const startTs = i === 0 ? rangeStart : Math.max(cat.startedAt, rangeStart);
      const endTs = cats[i + 1] ? cats[i + 1].startedAt : frontTs;
      return { cat, x0: Math.max(0, xFor(startTs)), x1: Math.min(W, xFor(endTs)), isChange: i > 0 };
    }).filter((g) => g.x1 - g.x0 >= 1);

    // 1) плитки обложек, 2) затемнение сверху-вниз, чтобы линия и подписи читались поверх яркой картинки
    segs.forEach((g) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.x0, 0, g.x1 - g.x0, H);
      ctx.clip();
      const img = g.cat.boxArtUrl ? getImage(g.cat.boxArtUrl) : null;
      if (img && img.complete && img.naturalWidth > 0) {
        const tileW = H * (img.naturalWidth / img.naturalHeight); // плитка на всю высоту блока, пропорции обложки сохраняем
        ctx.globalAlpha = Math.max(0, Math.min(1, s.categoryBgOpacity / 100));
        for (let tx = g.x0; tx < g.x1; tx += tileW) ctx.drawImage(img, tx, 0, tileW, H);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = hexToRgba(s.categoryColor, 0.12); // обложка ещё грузится или Twitch её не отдал — нейтральная подложка
        ctx.fillRect(g.x0, 0, g.x1 - g.x0, H);
      }
      const shade = ctx.createLinearGradient(0, 0, 0, H);
      shade.addColorStop(0, 'rgba(0,0,0,0.10)');
      shade.addColorStop(1, 'rgba(0,0,0,0.60)');
      ctx.fillStyle = shade;
      ctx.fillRect(g.x0, 0, g.x1 - g.x0, H);
      ctx.restore();
    });
    return segs;
  }

  /** Тонкие яркие линии на стыках отрезков и названия категорий внизу — рисуются ПОВЕРХ линии активности. */
  function drawCategoryDividersAndLabels(s, segs, H, bottomReserve, dpr) {
    if (!segs) return;
    segs.forEach((g) => {
      if (g.isChange) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(g.x0, 0);
        ctx.lineTo(g.x0, H);
        ctx.strokeStyle = s.categoryColor;
        ctx.lineWidth = 1.5 * dpr;
        ctx.shadowColor = s.categoryColor;
        ctx.shadowBlur = 6 * dpr;
        ctx.stroke();
        ctx.restore();
      }
    });
    ctx.save();
    ctx.font = `600 ${11 * dpr}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 3 * dpr;
    segs.forEach((g) => {
      const avail = g.x1 - g.x0 - 14 * dpr;
      if (avail < 28 * dpr) return; // отрезок слишком узкий для читаемой подписи
      ctx.fillText(fitText(g.cat.name || '', avail), g.x0 + 8 * dpr, H - bottomReserve - 8 * dpr);
    });
    ctx.restore();
  }

  /** Часы стрима: чч:мм:сс на тёмной полупрозрачной скруглённой плашке (или просто текстом, если плашка выключена). */
  function drawStreamClock(s, text, W, dpr) {
    ctx.save();
    ctx.font = `700 ${13 * dpr}px Unbounded, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    if (s.showClockPlate) {
      // Ширину плашки берём по самой широкой возможной строке — шрифт непропорциональный, и плашка не должна «дышать» при смене цифр.
      const textW = Math.max(ctx.measureText('00:00:00').width, ctx.measureText(text).width);
      const padX = 10 * dpr, h = 28 * dpr;
      const w = textW + padX * 2;
      const left = W - 8 * dpr - w, top = 6 * dpr, rad = 8 * dpr;
      ctx.beginPath();
      ctx.moveTo(left + rad, top);
      ctx.arcTo(left + w, top, left + w, top + h, rad);
      ctx.arcTo(left + w, top + h, left, top + h, rad);
      ctx.arcTo(left, top + h, left, top, rad);
      ctx.arcTo(left, top, left + w, top, rad);
      ctx.closePath();
      ctx.fillStyle = `rgba(10,10,14,${Math.max(0, Math.min(1, s.clockPlateOpacity / 100))})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
      ctx.fillStyle = s.textColor;
      ctx.fillText(text, left + w / 2, top + h / 2 + 0.5 * dpr);
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = s.textColor;
      ctx.fillText(text, W - 6 * dpr, 18 * dpr);
    }
    ctx.restore();
  }

  function tick(t) {
    requestAnimationFrame(tick);
    const dpr = devicePixelRatio;
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    if (!latest) return;

    const s = getTlSettings();
    const tl = latest.timeline || {};
    const linePoints = tl.linePoints || [];
    const categoryHistory = (latest.category && latest.category.history) || [];

    const padTop = (34 + (s.showCategoryThumbnails ? 50 : 0)) * dpr;
    const bottomReserve = s.showTimecodes ? 22 * dpr : 0;
    const baseline = H - bottomReserve; // график "приклеен" к нижнему краю блока (минус место под шкалу времени, если включена)

    if (linePoints.length < 2) {
      ctx.fillStyle = hexToRgba(s.textColor, 0.5);
      ctx.font = `500 ${13 * dpr}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Ждём активность в чате…', W / 2, H / 2);
      return;
    }

    const now = Date.now();
    // «Текущий момент» стрима: в эфире — настоящее время, в повторе — время воспроизводимого кадра. От него считаются
    // возраст кружков (срок их жизни) и часы стрима. Сама ось X в повторе остаётся прежней (до настоящего "сейчас"):
    // линия просто дорисовывается слева направо, как и раньше.
    const isReplay = tl.replayTs != null;
    const refTime = isReplay ? tl.replayTs : now;
    const lifetimeMs = Math.max(1, s.activityLifetimeMin) * 60000;

    // Ось X — от самой первой реальной точки данных до сейчас (см. комментарий в шапке файла).
    const rangeStart = linePoints[0].ts;
    const totalSpan = Math.max(now - rangeStart, 1000);
    const smoothed = smoothValues(linePoints, 3);
    const maxValue = Math.max(...smoothed.map((p) => p.value), 3);

    const xFor = (ts) => ((ts - rangeStart) / totalSpan) * W;
    const yFor = (value) => baseline - (value / maxValue) * (baseline - padTop);

    // --- фон из обложек категорий (под линией) ---
    const categorySegs = s.showCategoryBackground
      ? drawCategoryBackground(s, categoryHistory, xFor, rangeStart, refTime, W, H, baseline, bottomReserve, dpr)
      : null;

    // Цвет волны — либо сплошной (как раньше), либо горизонтальный градиент из двух
    // цветов темы (Modern Glass и подобные); заливка использует тот же градиент как
    // верхний цвет, плавно уходящий в прозрачность вниз.
    const waveColor = s.useWaveGradient
      ? (() => { const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, s.waveGradientStart); g.addColorStop(1, s.waveGradientEnd); return g; })()
      : s.lineColor;

    // --- заливка под плавной линией, до самого нижнего края блока ---
    const grad = ctx.createLinearGradient(0, padTop, 0, baseline);
    if (s.useWaveGradient) {
      grad.addColorStop(0, hexToRgba(s.waveGradientStart, 0.5));
      grad.addColorStop(1, hexToRgba(s.waveGradientEnd, 0));
    } else {
      grad.addColorStop(0, hexToRgba(s.fillColor, 0.55));
      grad.addColorStop(1, hexToRgba(s.fillColor, 0));
    }
    ctx.beginPath();
    ctx.moveTo(xFor(smoothed[0].ts), baseline);
    traceSmoothPath(smoothed, xFor, yFor);
    ctx.lineTo(xFor(smoothed[smoothed.length - 1].ts), baseline);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // --- сама линия ---
    ctx.beginPath();
    traceSmoothPath(smoothed, xFor, yFor);
    ctx.strokeStyle = waveColor;
    ctx.lineWidth = 2.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // --- полоса превью категорий сверху (тема Modern Glass и подобные) ---
    // Отдельно от фона-обложек — это именно горизонтальный ряд последних игр, как на референсе мокапа.
    if (s.showCategoryThumbnails && categoryHistory.length) {
      const stripY = 8 * dpr;
      const stripSize = 40 * dpr;
      const stripGap = 8 * dpr;
      const recent = categoryHistory.slice(0, 6); // самые свежие — история отсортирована новыми вперёд
      const totalWidth = recent.length * stripSize + (recent.length - 1) * stripGap;
      let x = (W - totalWidth) / 2;
      recent.slice().reverse().forEach((cat) => {
        const img = cat.boxArtUrl ? getImage(cat.boxArtUrl) : null;
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          const r = 6 * dpr;
          ctx.moveTo(x + r, stripY);
          ctx.arcTo(x + stripSize, stripY, x + stripSize, stripY + stripSize, r);
          ctx.arcTo(x + stripSize, stripY + stripSize, x, stripY + stripSize, r);
          ctx.arcTo(x, stripY + stripSize, x, stripY, r);
          ctx.arcTo(x, stripY, x + stripSize, stripY, r);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, x, stripY, stripSize, stripSize);
          ctx.restore();
        } else {
          ctx.fillStyle = hexToRgba(s.categoryColor, 0.2);
          ctx.fillRect(x, stripY, stripSize, stripSize);
        }
        x += stripSize + stripGap;
      });
    }

    // --- шкала времени под линией (тема Modern Glass и подобные) ---
    if (s.showTimecodes) {
      const tickCount = 6;
      ctx.fillStyle = hexToRgba(s.textColor, 0.6);
      ctx.font = `500 ${10 * dpr}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      for (let i = 0; i <= tickCount; i++) {
        const frac = i / tickCount;
        const ts = rangeStart + totalSpan * frac;
        ctx.fillText(formatClock(ts - rangeStart), frac * W, baseline + 15 * dpr);
      }
    }

    if (s.showCategoryBackground) {
      // --- новое оформление: тонкие яркие линии на стыках обложек + названия категорий внизу ---
      drawCategoryDividersAndLabels(s, categorySegs, H, bottomReserve, dpr);
    } else {
      // --- прежнее оформление: статичная вертикальная линия + обложка игры сверху (без физики) ---
      // Название и верх картинки закреплены у самого верха блока фиксированно —
      // при увеличении размера картинка растёт ВНИЗ, а не вверх за границу.
      ctx.textAlign = 'center';
      const categoryNameY = 12 * dpr;
      const categoryImgTop = categoryNameY + 6 * dpr;
      categoryHistory.forEach((cat) => {
        if (!cat.startedAt || cat.startedAt < rangeStart || cat.startedAt > refTime) return;
        const x = xFor(cat.startedAt);
        const imgW = s.categoryImageSize * dpr;
        const imgH = imgW * 1.35;

        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, baseline);
        ctx.strokeStyle = hexToRgba(s.categoryColor, 0.8);
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();

        const img = cat.boxArtUrl ? getImage(cat.boxArtUrl) : null;
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, x - imgW / 2, categoryImgTop, imgW, imgH);
        } else {
          ctx.fillStyle = hexToRgba(s.categoryColor, 0.25);
          ctx.fillRect(x - imgW / 2, categoryImgTop, imgW, imgH);
        }

        ctx.fillStyle = hexToRgba(s.textColor, 0.8);
        ctx.font = `600 ${10.5 * dpr}px Inter, sans-serif`;
        ctx.fillText(cat.name, x, categoryNameY);
      });
    }

    // --- плавающие кружки: свободный дрейф вокруг линии (на своей «полосе»), взаимное отталкивание, ограниченный срок жизни ---
    const list = Array.from(markers.values());
    const time = t / 1000;
    const labelZone = s.showCategoryBackground ? 22 * dpr : 0; // снизу — названия категорий, кружки их не закрывают
    const floorY = baseline - labelZone;
    const ceilY = 4 * dpr;
    sizeK = computeSizeK(H, dpr); // размер кружков зависит от высоты блока
    const spreadMax = s.activityFloatSpread * dpr * sizeK;

    list.forEach((m) => {
      const r = radiusForType(m, s, dpr);
      const lineY = yFor(valueAtTime(smoothed, m.ts));
      // Кружок держится НЕ на самой линии, а на своей «полосе» выше или ниже неё. Минимальное расстояние от центра до линии —
      // радиус + 14px: это больше размаха вертикального дрейфа (±10px), так что даже в крайней точке дрейфа кружок
      // линии не касается. Дальше полоса шириной spreadMax (настройка «Как далеко плавают от линии») — у каждого кружка своя доля.
      const gap = r + Math.max(8, 14 * sizeK) * dpr;
      const laneY = Math.sign(m.lane) * (gap + spreadMax * Math.abs(m.lane));
      m.anchorX = xFor(m.ts); // по горизонтали — на том времени, когда событие было
      m.anchorY = lineY;
      // медленный независимый дрейф вокруг своей точки — отсюда «плавающее» движение, а не покачивание на пружинке у линии
      const driftX = Math.sin(time * m.freqX + m.phaseX) * 9 * dpr * sizeK;
      const driftY = Math.cos(time * m.freqY + m.phaseY) * 10 * dpr * sizeK;
      m.vx += (driftX - m.offsetX) * 0.02;
      m.vy += (laneY + driftY - m.offsetY) * 0.02;
    });

    // взаимное отталкивание (по текущим экранным позициям anchor+offset)
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ax = a.anchorX + a.offsetX, ay = a.anchorY + a.offsetY;
        const bx = b.anchorX + b.offsetX, by = b.anchorY + b.offsetY;
        let dx = ax - bx, dy = ay - by;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const ra = radiusForType(a, s, dpr), rb = radiusForType(b, s, dpr);
        const minDist = ra + rb + 4 * dpr;
        if (dist < minDist) {
          // Два кружка родились в одной точке (одно и то же мгновение): направления «друг от друга» нет — берём своё у каждой пары
          // (из их фаз), а не делим на почти-ноль. БАГ, который это чинит: раньше push = (minDist - dist) / dist давал при dist≈0
          // гигантский импульс, и кружок улетал через весь блок к левому краю.
          if (dist < 0.5) { const ang = a.phaseX - b.phaseX; dx = Math.cos(ang); dy = Math.sin(ang); dist = 1; }
          const push = Math.min((minDist - dist) / dist, 1.5) * 0.5; // и ограничиваем силу — при сильном перекрытии она не растёт безгранично
          const nx = dx / dist, ny = dy / dist;
          a.vx += nx * push * 0.6; a.vy += ny * push * 0.6;
          b.vx -= nx * push * 0.6; b.vy -= ny * push * 0.6;
        }
      }
    }

    const drawQueue = []; // порядок отрисовки отдельно от порядка физики — см. ниже: важное (донат) должно лежать поверх остальных
    const maxSpeed = 7 * dpr;        // px за кадр — кружок не может «выстрелить» через весь блок
    const maxDriftX = 140 * dpr;     // облако может расползаться при скученности, но остаётся рядом со своим временем на оси
    list.forEach((m) => {
      m.vx *= 0.85; m.vy *= 0.85;
      m.vx = Math.max(-maxSpeed, Math.min(maxSpeed, m.vx));
      m.vy = Math.max(-maxSpeed, Math.min(maxSpeed, m.vy));
      m.offsetX = Math.max(-maxDriftX, Math.min(maxDriftX, m.offsetX + m.vx));
      m.offsetY += m.vy;
      const r = radiusForType(m, s, dpr);

      // не даём кружку выйти за границы блока (по высоте — между верхом и зоной подписей категорий); состояние
      // смещения подправляем вместе с позицией, чтобы пружина не «тянула» его обратно сквозь границу
      const x = Math.max(r, Math.min(W - r, m.anchorX + m.offsetX));
      const y = Math.max(ceilY + r, Math.min(floorY - r, m.anchorY + m.offsetY));
      m.offsetX = x - m.anchorX; m.offsetY = y - m.anchorY;

      // срок жизни: старше activityLifetimeMin (по «текущему моменту» эфира или кадра повтора) — исчезает; в последние 20 секунд — плавно
      const age = refTime - m.ts;
      const expired = age > lifetimeMs || age < 0;
      const lifeFade = Math.max(0, Math.min(1, (lifetimeMs - age) / 20000));
      if (m.dying || expired) {
        m.alpha -= 0.07;
        if (m.alpha <= 0) { markers.delete(m.key); return; }
      } else if (m.alpha < 1) {
        m.alpha += 0.07;
      }
      const alpha = m.alpha * (expired ? 1 : lifeFade);
      m.drawX = x; m.drawY = y; m.drawR = r; m.drawAlpha = alpha; m.lineY = m.anchorY; // для тестового хука ниже

      drawQueue.push({ m, x, y, r, alpha });
    });

    // Сначала аватарки сообщений (их много), поверх — точки баллов/подписок/рейдов, самым верхним слоем — донаты:
    // раньше слой определялся порядком событий, и донат мог оказаться наполовину закрыт более поздним сообщением.
    const layerOf = (type) => (type === 'donation' ? 3 : (type === 'message' || type === 'emote') ? 0 : 1);
    drawQueue.sort((a, b) => layerOf(a.m.type) - layerOf(b.m.type));
    drawQueue.forEach(({ m, x, y, r, alpha }) => {
      if (m.type === 'message' || m.type === 'emote') {
        drawAvatarMarker(m, x, y, r, alpha);
      } else if (m.type === 'donation') {
        drawDonationMarker(m, x, y, colorForType(m.type, s), alpha, dpr);
      } else {
        drawIconMarker(m.type, x, y, r, colorForType(m.type, s), alpha, dpr);
      }
    });

    // --- часы стрима поверх всего, правый верхний угол ---
    drawStreamClock(s, formatClockHMS(refTime - streamStartedAt), W, dpr);
  }
  requestAnimationFrame(tick);

  // _debugMarkers — только для автотестов в настоящем браузере (читает реальные позиции кружков); в работе виджета не используется.
  window.TimelineModule = {
    render,
    _debugMarkers: () => Array.from(markers.values()).map((m) => ({
      type: m.type, ts: m.ts, x: m.drawX, y: m.drawY, r: m.drawR, alpha: m.drawAlpha, lineY: m.lineY, amount: m.amount, dying: m.dying,
    })),
  };
})();
