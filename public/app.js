// app.js — точка входа фронтенда. Держит WebSocket-соединение и рендерит
// блок 1 (активность). Полностью статично — без анимаций и перестроений
// позиций, чтобы исключить любое влияние на layout.

const AVATAR_COLORS = ['#B14846','#00D4FF','#FF5C8A','#4ADE80','#FFB454','#60A5FA','#F472B6','#34D399','#FBBF24','#A78BFA'];
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
window.colorForName = colorForName;

/* ===================== Тема: приходит в каждом снапшоте ===================== */

function hexToRgb(hex) {
  const clean = (hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
window.hexToRgba = hexToRgba;

const loadedFonts = new Set();
let customFontsMap = new Map(); // name -> {url, format} — свои шрифты, загруженные через админку

/** Обновляет карту своих шрифтов из снапшота — вызывать до ensureFontLoaded(). */
function setCustomFonts(list) {
  customFontsMap = new Map((list || []).map((f) => [f.name, f]));
}

function ensureFontLoaded(family) {
  if (!family || loadedFonts.has(family)) return;
  loadedFonts.add(family);

  const custom = customFontsMap.get(family);
  if (custom) {
    // Свой загруженный шрифт — раздаётся сервером как статика из /fonts/…
    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: '${family}'; src: url('${custom.url}') format('${custom.format}'); font-display: swap; }`;
    document.head.appendChild(style);
    return;
  }

  const id = 'font-' + family.replace(/\s+/g, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

const DEFAULT_THEME = {
  accent: '#B14846', textMain: '#E0E0E0',
  bgPanelRGB: [20, 20, 25], bgPanelAlpha: 0.55,
  fontMain: 'Unbounded', fontText: 'Inter',
  fontSizeMain: 16, fontSizeText: 14,
  borderRadius: 16, glassEffect: false, showHeaderIcon: false,
};

function applyTheme(theme) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) };
  const root = document.documentElement;
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-soft', hexToRgba(t.accent, 0.18));
  root.style.setProperty('--accent-40', hexToRgba(t.accent, 0.4));
  root.style.setProperty('--accent-60', hexToRgba(t.accent, 0.6));
  root.style.setProperty('--text-main', t.textMain);
  const [r, g, b] = t.bgPanelRGB;
  root.style.setProperty('--bg-panel', `rgba(${r},${g},${b},${t.bgPanelAlpha})`);
  root.style.setProperty('--font-main', `'${t.fontMain}', system-ui, sans-serif`);
  root.style.setProperty('--font-text', `'${t.fontText}', system-ui, sans-serif`);
  root.style.setProperty('--font-size-main', t.fontSizeMain + 'px');
  root.style.setProperty('--font-size-text', t.fontSizeText + 'px');
  root.style.setProperty('--panel-radius', t.borderRadius + 'px');
  document.body.classList.toggle('glass-effect', !!t.glassEffect);
  document.body.classList.toggle('show-header-icons', !!t.showHeaderIcon);

  ensureFontLoaded(t.fontMain);
  ensureFontLoaded(t.fontText);

  window.overlayTheme = t;
}

/* ===================== Стиль оформления виджетов (см. overlay-styles.css) ===================== */

function applyOverlayStyle(os) {
  const q = new URLSearchParams(location.search);
  const style = q.get('ostyle') || (os && os.style) || 'default'; // адресная строка важнее — удобно для проверок
  const glass = q.get('glass') ? q.get('glass') !== 'off' : !(os && os.glass === false);
  const b = document.body;
  if (/^[a-o]$/.test(style)) {
    b.setAttribute('data-ostyle', style);
    b.setAttribute('data-glass', glass ? 'on' : 'off');
    b.classList.add('show-header-icons'); // иконки у заголовков — часть стилей
  } else {
    b.removeAttribute('data-ostyle');
    b.removeAttribute('data-glass');
  }
}

/* ===================== Раскладка виджетов: приходит в каждом снапшоте ===================== */

function applyLayout(layout) {
  if (!layout) return;
  document.querySelectorAll('[data-widget]').forEach((el) => {
    const rect = layout[el.dataset.widget];
    if (!rect) return;
    el.style.left = rect.x + 'px';
    el.style.top = rect.y + 'px';
    el.style.width = rect.w + 'px';
    el.style.height = rect.h + 'px';
    el.style.display = rect.enabled === false ? 'none' : 'flex';
  });
}

/* ===================== Настройки содержимого виджетов (аватарки/ник/полоска, цвета таймлайна и т.п.) =====================
   Один общий применятель для всех виджетов: для каждого id смотрим, есть ли
   для него запись в WIDGET_CSS_VARS (какое поле настроек → какая CSS-переменная
   на элементе виджета), и выставляем её. Чтобы дать новому виджету свои
   настройки — добавляешь одну запись сюда плюс использование var(--...) в
   style.css, JS-логику трогать не нужно. Полный объект настроек также
   складывается в window.widgetSettings — им пользуются canvas-модули
   (например, таймлайн), которым нужны сырые значения, а не только CSS. */

const WIDGET_CSS_VARS = {
  activity: {
    avatarSize: { var: '--chatter-avatar-size', unit: 'px' },
    nameSize: { var: '--chatter-name-size', unit: 'px' },
    barThickness: { var: '--chatter-bar-thickness', unit: 'px' },
    goldColor1: { var: '--chatter-gold-1' },
    goldColor2: { var: '--chatter-gold-2' },
  },
};

function applyWidgetSettings(widgetSettings) {
  if (!widgetSettings) return;
  window.widgetSettings = widgetSettings; // для canvas-модулей (таймлайн и т.п.)

  Object.entries(widgetSettings).forEach(([widgetId, fields]) => {
    const varMap = WIDGET_CSS_VARS[widgetId];
    const el = document.querySelector(`[data-widget="${widgetId}"]`);
    if (!varMap || !el) return;
    Object.entries(fields).forEach(([key, value]) => {
      const spec = varMap[key];
      if (spec) el.style.setProperty(spec.var, spec.unit ? value + spec.unit : value);
    });
  });

  // Таймлайн — фон панели: локальный (цвет+прозрачность из настроек виджета)
  // только когда выключена "Использовать общую палитру"; иначе наследует
  // общий --bg-panel из "Основных настроек" темы (снимаем локальный оверрайд).
  if (widgetSettings.timeline) {
    const el = document.querySelector('[data-widget="timeline"]');
    if (el) {
      const tl = widgetSettings.timeline;
      if (tl.useGlobalPalette === false && tl.bgColor) {
        const alpha = typeof tl.bgAlpha === 'number' ? tl.bgAlpha / 100 : 0.55;
        el.style.setProperty('--bg-panel', hexToRgba(tl.bgColor, alpha));
      } else {
        el.style.removeProperty('--bg-panel');
      }
    }
  }
}

/* ===================== Озвучка чата (TTS) ===================== */

let currentTtsSettings = { queueEnabled: true };
let ttsQueue = [];
let ttsPlaying = false;
const ttsAudioEl = new Audio();

function playNextTts() {
  if (ttsPlaying || ttsQueue.length === 0) return;
  ttsPlaying = true;
  const src = ttsQueue.shift();
  ttsAudioEl.src = src;
  ttsAudioEl.play().catch(() => { ttsPlaying = false; playNextTts(); });
}
ttsAudioEl.addEventListener('ended', () => { ttsPlaying = false; playNextTts(); });

function handleTtsAudio(audioDataUri) {
  if (currentTtsSettings.queueEnabled) {
    ttsQueue.push(audioDataUri);
    if (ttsQueue.length > 10) ttsQueue.shift(); // переполнение — выкидываем самое старое
    playNextTts();
  } else {
    // без очереди: новое сообщение сразу перекрывает текущее, но никогда не накладывается
    ttsQueue = [];
    ttsAudioEl.pause();
    ttsAudioEl.src = audioDataUri;
    ttsPlaying = true;
    ttsAudioEl.play().catch(() => { ttsPlaying = false; });
  }
}

function stopTts() {
  ttsQueue = [];
  ttsPlaying = false;
  ttsAudioEl.pause();
  ttsAudioEl.currentTime = 0;
}

const PAGE_Q = new URLSearchParams(location.search);
const ONLY_DONATION = PAGE_Q.get('only') === 'donation';        // отдельный источник OBS: только алерт доната
const DA_PREVIEW = PAGE_Q.get('preview') === '1';               // предпросмотр в админке (алерты приходят через postMessage)
if (ONLY_DONATION || DA_PREVIEW) document.body.classList.add('only-donation');
if (DA_PREVIEW) document.body.classList.add('da-preview');
const ws = new WebSocket(`ws://${location.host}/?type=overlay${DA_PREVIEW ? '&view=preview' : ONLY_DONATION ? '&view=alerts' : ''}`);
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'tts') { handleTtsAudio(data.audio); return; }
  if (data.type === 'tts_stop') { stopTts(); return; }
  if (data.type === 'donation_alert') { if (window.DonationAlertModule) window.DonationAlertModule.show(data); return; }
  if (data.type === 'donation_alert_skip') { if (window.DonationAlertModule) window.DonationAlertModule.skip(); return; }

  // Ускоренное воспроизведение истории стрима ("Воспроизвести историю" в админке):
  // сервер на время останавливает обычные живые тики и шлёт только эти кадры —
  // рендерим их теми же функциями, что и обычный снапшот, просто без темы/раскладки
  // (они не меняются во время воспроизведения).
  if (data.type === 'replay_start') return;
  if (data.type === 'replay_end') return; // следующий обычный снапшот придёт сам и всё восстановит
  if (data.type === 'replay_frame') {
    renderChatters(data.topChatters || []);
    if (window.TimelineModule) window.TimelineModule.render({ timeline: data.timeline, category: data.category });
    if (window.WordcloudModule) window.WordcloudModule.render(data.wordCloud || []);
    if (window.EmoteBoxModule) window.EmoteBoxModule.render({ topEmotes: data.topEmotes });
    return;
  }

  currentTtsSettings = data.tts || currentTtsSettings;
  setCustomFonts(data.customFonts);
  applyTheme(data.theme);
  applyOverlayStyle(data.overlayStyle);
  applyLayout(data.layout);
  applyWidgetSettings(data.widgetSettings);
  renderChatters(data.topChatters || []);
  if (window.TimelineModule) window.TimelineModule.render(data);
  if (window.WordcloudModule) window.WordcloudModule.render(data.wordCloud || []);
  if (window.EmoteBoxModule) window.EmoteBoxModule.render(data);
  if (window.DonorTopModule) window.DonorTopModule.render(data);
  if (window.EventFeedModule) window.EventFeedModule.render(data);
};

/* ===================== BLOCK 1 — АКТИВНОСТЬ (статично) ===================== */

const chattersList = document.getElementById('chattersList');
let chatterRowElements = new Map(); // username -> DOM-строка, для плавной перестановки мест без пересоздания

function renderChatters(topChatters) {
  const maxMessages = Math.max(...topChatters.map(u => u.messages), 1);

  // FIRST — запоминаем текущие позиции существующих строк
  const firstRects = new Map();
  chatterRowElements.forEach((el, username) => { firstRects.set(username, el.getBoundingClientRect()); });

  const usedUsernames = new Set();
  const orderedEls = topChatters.map((user, index) => {
    const pct = Math.max(2, Math.round((user.messages / maxMessages) * 100));
    const avatarHtml = user.avatarUrl
      ? `<img class="chatter-avatar" src="${user.avatarUrl}">`
      : `<div class="chatter-avatar fallback" style="background:${colorForName(user.username)}">${user.username[0].toUpperCase()}</div>`;

    let row = chatterRowElements.get(user.username);
    if (!row) {
      row = document.createElement('div');
      row.dataset.username = user.username;
      chatterRowElements.set(user.username, row);
    }
    row.className = `chatter-row rank-${index}`;
    row.innerHTML = `
      ${avatarHtml}
      <div class="chatter-name">${user.username}</div>
      <div class="chatter-bar-track"><div class="chatter-bar-fill" style="width:${pct}%"></div></div>
      <div class="chatter-count">${user.messages}</div>
    `;
    usedUsernames.add(user.username);
    return row;
  });

  // убираем тех, кто выпал из топа
  chatterRowElements.forEach((el, username) => {
    if (!usedUsernames.has(username)) {
      el.remove();
      chatterRowElements.delete(username);
    }
  });

  // LAST — расставляем DOM-узлы в новом порядке (appendChild переносит уже существующие)
  orderedEls.forEach((el) => chattersList.appendChild(el));

  // INVERT + PLAY — считаем разницу и анимируем через transform/transition.
  // Никаких слушателей событий здесь нет и не нужно: доиграет анимация или нет —
  // на итоговую позицию/данные это никак не влияет, поэтому ничего не может зависнуть.
  orderedEls.forEach((el) => {
    const first = firstRects.get(el.dataset.username);
    if (!first) return; // новая строка — появляется сразу на своём месте, без рывка
    const last = el.getBoundingClientRect();
    const deltaY = first.top - last.top;
    if (Math.abs(deltaY) > 0.5) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${deltaY}px)`;
      void el.offsetHeight; // форсируем reflow перед снятием transform
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.3s ease';
        el.style.transform = '';
      });
    }
  });
}
