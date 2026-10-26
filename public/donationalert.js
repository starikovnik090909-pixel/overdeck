// public/donationalert.js — алерт доната: вертикальная карточка появляется в центре, вращаясь «подлетает» к экрану,
// зависает на время чтения (чуть покачиваясь, здесь же играет озвучка), затем резко улетает вбок.
// Приходит от сервера сообщением {type:'donation_alert', id, card, audio}; алерты идут по одному (локальная очередь).
// Оформление (цвет, шрифты, скругление) берётся из темы и стиля оверлея; цвет можно переопределить в настройках алерта.

(function () {
  // &mute=1 — встроенный предпросмотр на странице «Ссылки для OBS»: крутится сам по кругу и должен быть беззвучным
  if (new URLSearchParams(location.search).get('mute') === '1') { try { HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return Promise.resolve(); }; } catch (_) {} }
  const layer = document.getElementById('daLayer');
  if (!layer) { window.DonationAlertModule = { show() {}, skip() {} }; return; }

  const card = layer.querySelector('.da-card');
  const wave = layer.querySelector('.da-wave');
  const elNick = layer.querySelector('.da-nick');
  const elAmount = layer.querySelector('.da-amount');
  const elMsg = layer.querySelector('.da-msg');
  const elMsgWrap = layer.querySelector('.da-msgwrap');
  const elSrc = layer.querySelector('.da-src');
  const elTex = layer.querySelector('.da-tex');
  const elStat = layer.querySelector('.da-stat');
  const elKicker = layer.querySelector('.da-kicker');
  const elBar = layer.querySelector('.da-timebar i');
  const BASE_W = 420, BASE_H = 620;
  const EXIT_SEC = 0.5, GAP_SEC = 0.5, MAX_QUEUE = 20;

  const queue = [];
  let busy = false;
  let skipFlag = false;
  let audio = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;

  /** Длинный текст не сжимаем: обрезаем по ширине контейнера и медленно прокручиваем туда-обратно (≈38 px/с, паузы по краям). */
  function scrollIfLong(sp, box) {
    const ov = sp.offsetWidth - box.clientWidth;
    if (ov <= 1) return;
    const ms = (2 * ov / 38) * 1000 + 3200, p = 1400 / ms;
    sp.animate([{ transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(0)', offset: p }, { transform: `translateX(${-ov}px)`, offset: 0.5 }, { transform: `translateX(${-ov}px)`, offset: 0.5 + p }, { transform: 'translateX(0)', offset: 1 }], { duration: ms, iterations: Infinity, easing: 'ease-in-out' });
  }
  function fitText() {
    // ник: одна строка, уменьшаем, пока не влезет
    let fs = 38; elNick.style.fontSize = fs + 'px';
    { const txt = elNick.textContent; elNick.textContent = ''; const sp = document.createElement('span'); sp.textContent = txt; sp.style.display = 'inline-block'; sp.style.whiteSpace = 'nowrap'; elNick.style.overflow = 'hidden'; elNick.style.textOverflow = 'clip'; elNick.appendChild(sp); scrollIfLong(sp, elNick); }
    // сумма
    fs = 78; elAmount.style.fontSize = fs + 'px';
    const avail = elAmount.clientWidth; elAmount.style.width = 'max-content'; // запас 10% под пульсацию
    while (elAmount.offsetWidth > avail * 0.9 && fs > 28) { fs -= 3; elAmount.style.fontSize = fs + 'px'; }
    elAmount.style.width = '';
    // сообщение: уменьшаем, пока не влезет в отведённую область
    fs = 30; elMsg.style.fontSize = fs + 'px';
    while (elMsg.scrollHeight > elMsgWrap.clientHeight && fs > 12) { fs -= 1; elMsg.style.fontSize = fs + 'px'; }
  }

  function readTime(c) { return 2.2 + (c.message ? c.message.length * 0.06 : 0); }

  function audioDuration(src) {
    return new Promise((resolve) => {
      const a = new Audio();
      let done = false;
      const fin = (d) => { if (!done) { done = true; resolve(d); } };
      a.addEventListener('loadedmetadata', () => fin(isFinite(a.duration) ? a.duration : 0));
      a.addEventListener('error', () => fin(0));
      setTimeout(() => fin(0), 1500);
      a.src = src;
    });
  }

  async function run(item) {
    const c = item.card;
    layer.style.setProperty('--da-c', c.color || '');
    layer.classList.toggle('da-custom', !!c.color);
    layer.classList.toggle('da-plain', c.themed === false);
    if (c.font) {
      if (typeof ensureFontLoaded === 'function' && !/^Ovl/.test(c.font)) ensureFontLoaded(c.font);
      const ff = "'" + c.font + "', system-ui, sans-serif";
      layer.style.setProperty('--font-main', ff); layer.style.setProperty('--font-text', ff);
    } else { layer.style.removeProperty('--font-main'); layer.style.removeProperty('--font-text'); }
    layer.style.setProperty('--da-op', String(clamp((c.plateOpacity == null ? 100 : c.plateOpacity) / 100, 0, 1)));
    layer.classList.toggle('da-pulse', c.pulse !== false);
    layer.classList.remove('da-live');
    elSrc.textContent = c.source || '';
    // текстура фона: картинка + затемнение + непрозрачность
    layer.classList.toggle('da-hastex', !!c.texture);
    elTex.style.backgroundImage = c.texture ? `url("${c.texture}")` : '';
    layer.style.setProperty('--da-dim', String(clamp((c.texDim == null ? 35 : c.texDim) / 100, 0, 1)));
    layer.style.setProperty('--da-texop', String(clamp((c.texOpacity == null ? 100 : c.texOpacity) / 100, 0, 1)));
    // анимированная рамка и мягкий свет за карточкой
    if (c.frame) layer.dataset.frame = c.frame; else delete layer.dataset.frame;
    layer.style.setProperty('--da-fw', clamp(c.frameW || 4, 1, 12) + 'px');
    layer.classList.toggle('da-glow', c.glow !== false && (c.glowPower == null ? 70 : c.glowPower) > 0);
    layer.style.setProperty('--da-glow', String(clamp((c.glowPower == null ? 70 : c.glowPower) / 100, 0, 1)));
    // уровень доната, статистика, полоска времени
    [1, 2, 3].forEach((n) => layer.classList.toggle('da-t' + n, c.tier === n));
    elKicker.textContent = c.tierLabel || 'донат';
    elStat.textContent = c.stat || '';
    layer.classList.toggle('da-nostat', !c.stat);
    layer.classList.toggle('da-notimebar', c.timeBar === false);
    elBar.style.transform = 'scaleX(1)';
    layer.classList.toggle('da-nosrc', !c.source);
    elNick.textContent = c.username;
    elAmount.textContent = c.amountText;
    const msgText = c.message || '';
    const typing = c.typeText !== false && !!msgText;
    elMsg.textContent = '';
    const spShown = document.createElement('span'), spHid = document.createElement('span');
    spHid.className = 'da-t-hid';
    if (typing) { spHid.textContent = msgText; } else { spShown.textContent = msgText; }
    elMsg.append(spShown, spHid);
    // показывает первые n символов, остальное скрыто (но место занимает — вёрстка не прыгает)
    let shownN = 0;
    const reveal = (n) => { n = Math.max(0, Math.min(msgText.length, Math.floor(n))); if (n === shownN) return; shownN = n; spShown.textContent = msgText.slice(0, n); spHid.textContent = msgText.slice(n); };
    layer.classList.toggle('da-nomsg', !c.message);
    const s = clamp((c.scale || 100) / 100, 0.4, 1.8);
    card.style.width = BASE_W + 'px'; card.style.height = BASE_H + 'px';
    card.style.opacity = '0';
    layer.style.display = 'block';
    fitText();

    let flySfxDone = false, landSfxDone = false;
    const sfx = (file) => { if (!file) return; try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((c.soundVolume == null ? 70 : c.soundVolume) / 100, 0, 1); a.play().catch(() => {}); } catch (_) {} };

    let dur = 0;
    if (item.audio) dur = await audioDuration(item.audio);
    const hold = clamp(Math.max(c.holdMin, dur ? dur + 0.9 : readTime(c)), c.holdMin, c.holdMax);
    const fly = c.flySec;
    const total = fly + hold + EXIT_SEC;

    const dir = Math.random() < 0.5 ? 1 : -1; // улетает вправо или влево
    let audioStarted = false, landAt = 0;
    skipFlag = false;
    const t0 = performance.now();

    await new Promise((resolve) => {
      function frame(now) {
        let t = (now - t0) / 1000;
        if (skipFlag && item._skipAt == null && t < fly + hold) { skipFlag = false; item._skipAt = now / 1000 - fly - hold + 0; item._skipBase = now; }
        // пропуск: сразу переходим к фазе вылета
        if (item._skipAt != null) { t = fly + hold + (now - item._skipBase) / 1000; }
        let x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sc = 1, op = 1;
        if (!flySfxDone && t >= 0) { flySfxDone = true; sfx(c.soundFly); }
        if (t < fly) {
          const p = easeOut(t / fly), q = 1 - p;
          z = -2600 * q; ry = 900 * q; rz = 28 * q; x = Math.sin(p * Math.PI) * 140 * dir * 0.6; y = -Math.sin(p * Math.PI) * 60;
          op = clamp(t / (fly * 0.12), 0, 1);
        } else if (t < fly + hold) {
          const u = t - fly, amp = Math.min(1, u / 0.7);
          x = Math.sin(u * 0.9) * 7 * amp; y = Math.sin(u * 1.35) * 9 * amp;
          ry = Math.sin(u * 1.1) * 8 * amp; rx = Math.sin(u * 0.8) * 4 * amp; rz = Math.sin(u * 0.7) * 1.6 * amp;
          sc = 1 + 0.018 * Math.sin(u * 1.2) * amp;
          if (!audioStarted) {
            audioStarted = true; landAt = now; layer.classList.add('da-live');
            if (!landSfxDone) { landSfxDone = true; sfx(c.soundLand); }
            wave.classList.remove('go'); void wave.offsetWidth; wave.classList.add('go');
            if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); }
          }
        } else {
          const p = easeIn(clamp((t - fly - hold) / EXIT_SEC, 0, 1));
          const u = hold;
          x = (Math.sin(u * 0.9) * 7) * (1 - p) + dir * 2800 * p; y = (Math.sin(u * 1.35) * 9) * (1 - p) - 120 * p;
          ry = (Math.sin(u * 1.1) * 8) + dir * 220 * p; rz = dir * 38 * p; rx = 0;
          op = 1;
        }
        if (typing && audioStarted) {
          // текст печатается по мере озвучки: начало — когда прочитан «ник задонатил N», окно — остаток записи; без озвучки — за время чтения
          const el = (now - landAt) / 1000;
          const lead = dur && c.typeLead ? dur * c.typeLead : 0.35;
          const win = dur ? Math.max(0.6, dur * (1 - (c.typeLead || 0)) * 0.92) : Math.max(0.8, Math.min(hold * 0.6, msgText.length / 28));
          reveal(((el - lead) / win) * msgText.length);
        }
        if (c.timeBar !== false && t >= fly && t < fly + hold) elBar.style.transform = `scaleX(${clamp(1 - (t - fly) / hold, 0, 1)})`;
        card.style.opacity = String(op);
        card.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s * sc})`;
        if (t >= total) { resolve(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
    layer.classList.remove('da-live');
    card.style.opacity = '0';
  }


  /** Подгоняет ник по ширине: ждёт загрузки шрифтов (иначе мерим запасным), уменьшает кегль, а если и мелкий не влез — обрезает «…». */
  async function fitNick(el, maxW, fs0, min) {
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]); } catch (_) {}
    el.style.maxWidth = maxW + 'px'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis'; el.style.display = 'inline-block'; el.style.verticalAlign = 'top';
    let fs = fs0; el.style.fontSize = fs + 'px';
    while (el.scrollWidth > maxW && fs > min) { fs -= 2; el.style.fontSize = fs + 'px'; }
  }
  // ---------- билет-абонемент (алерт подписки) ----------
  const tk = {
    layer: document.getElementById('tkLayer'), ticket: document.getElementById('tkTicket'),
  };
  const tkEl = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let tkShapes = false;
  /** Контур билета: скруглённые углы, «надкусы» на углах у перфорации и полукруглые вырезы по линии отрыва. */
  function tkPath(w, h, r, stub) {
    const n = 13, s = 7, ys = [];
    for (let yc = n + 12; yc + s <= h - n; yc += 24) ys.push(yc);
    let d;
    if (!stub) {
      d = `M${r},0 H${w - n} A${n},${n} 0 0 0 ${w},${n}`;
      ys.forEach((yc) => { d += ` L${w},${yc - s} A${s},${s} 0 0 0 ${w},${yc + s}`; });
      d += ` L${w},${h - n} A${n},${n} 0 0 0 ${w - n},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
    } else {
      d = `M${n},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${n} A${n},${n} 0 0 0 0,${h - n}`;
      ys.slice().reverse().forEach((yc) => { d += ` L0,${yc + s} A${s},${s} 0 0 0 0,${yc - s}`; });
      d += ` L0,${n} A${n},${n} 0 0 0 ${n},0 Z`;
    }
    return d;
  }
  function tkInitShapes() {
    if (tkShapes) return; tkShapes = true;
    const H = 360;
    tk.layer.querySelector('.tk-main .tk-face').style.clipPath = `path('${tkPath(740, H, 26, false)}')`;
    tk.layer.querySelector('.tk-stub .tk-face').style.clipPath = `path('${tkPath(230, H, 26, true)}')`;
  }
  const MONTHS_W = (n) => { const a = n % 100, b = n % 10; return (a > 10 && a < 15) ? 'МЕСЯЦЕВ' : b === 1 ? 'МЕСЯЦ' : (b > 1 && b < 5) ? 'МЕСЯЦА' : 'МЕСЯЦЕВ'; };
  const SUBS_W = (n) => { const a = n % 100, b = n % 10; return (a > 10 && a < 15) ? 'ПОДПИСОК' : b === 1 ? 'ПОДПИСКА' : (b > 1 && b < 5) ? 'ПОДПИСКИ' : 'ПОДПИСОК'; };

  async function runTicket(item) {
    const c = item.card, k = c.ticket;
    tkInitShapes();
    const L = tk.layer, T = tk.ticket;
    L.style.display = 'block'; T.className = 'tk-ticket';
    const gift = k.type === 'gift';
    L.className = 'tk-layer tk-t' + (k.tier === 2 ? 2 : k.tier === 3 ? 3 : 1) + (gift ? ' tk-gift' : '') + (c.glow === false || !(c.glowPower > 0) ? ' tk-nohalo' : '');
    if (k.tier === 1 && k.color) L.style.setProperty('--tk-acc', k.color); else L.style.removeProperty('--tk-acc');
    L.style.setProperty('--tk-glow', String(clamp((c.glowPower == null ? 70 : c.glowPower) / 100, 0, 1)));
    T.className = 'tk-ticket';
    // тексты
    const nick = tkEl('tkNick'); nick.textContent = ''; nick.style.fontSize = ''; nick.style.maxWidth = '395px'; nick.style.overflow = 'hidden'; nick.style.verticalAlign = 'top'; nick.style.boxSizing = 'content-box'; nick.style.padding = '0 24px 8px'; nick.style.margin = '0 -24px -8px';
    { const sp = document.createElement('span'); sp.textContent = k.nick; sp.style.display = 'inline-block'; sp.style.whiteSpace = 'nowrap'; nick.appendChild(sp);
      try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]); } catch (_) {}
      const ov = sp.offsetWidth - 395; // не влезло: ник не сжимаем, а медленно прокручиваем туда-обратно
      if (ov > 0) { const ms = (2 * ov / 38) * 1000 + 3200, p = 1400 / ms; sp.animate([{ transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(0)', offset: p }, { transform: `translateX(${-ov}px)`, offset: 0.5 }, { transform: `translateX(${-ov}px)`, offset: 0.5 + p }, { transform: 'translateX(0)', offset: 1 }], { duration: ms, iterations: Infinity, easing: 'ease-in-out' }); } }
    tkEl('tkTop').textContent = gift ? 'Подарочный абонемент' : 'Абонемент подписчика';
    tkEl('tkMonth').textContent = k.label;
    tkEl('tkMeta').textContent = k.meta;
    tkEl('tkQuote').textContent = k.message ? '«' + k.message + '»' : '';
    const sn = tkEl('tkSn'), sl = tkEl('tkSl');
    sn.textContent = gift ? '×' + k.count : String(k.months); sn.setAttribute('font-size', sn.textContent.length > 2 ? '46' : '62');
    sl.textContent = gift ? SUBS_W(k.count) : MONTHS_W(k.months);
    tkEl('tkRing').textContent = gift ? 'СПАСИБО ЗА ЩЕДРОСТЬ ✦ ПОДАРОК ДЛЯ ВСЕХ ✦' : (k.type === 'resub' ? 'СПАСИБО ЗА ПОДДЕРЖКУ ✦ ПОДПИСКА ПРОДЛЕНА ✦' : 'ДОБРО ПОЖАЛОВАТЬ ✦ ПОДПИСКА ОФОРМЛЕНА ✦');
    const num = tkEl('tkNo'), lab = tkEl('tkNoLab');
    if (gift) { lab.textContent = 'подарено'; num.textContent = '×' + k.count; num.style.fontSize = ''; }
    else if (k.no) { lab.textContent = 'подписчик №'; num.textContent = String(k.no).padStart(4, '0'); num.style.fontSize = ''; }
    else { lab.textContent = 'уровень'; num.textContent = k.tierText; num.style.fontSize = '34px'; }
    // слоты-штампы: 12 штук, пройденные горят; новый «хлопается» вместе с печатью
    const slots = tkEl('tkSlots'); slots.textContent = '';
    const filled = Math.min(k.months, 12); let lastSlot = null;
    for (let i = 1; i <= 12; i++) {
      const s = document.createElement('div'); s.className = 'tk-slot'; s.textContent = String(i);
      if (!gift && i <= filled) { if (i === filled) lastSlot = s; else { s.classList.add('on', 'old'); s.style.animationDelay = (0.55 + i * 0.045) + 's'; } }
      slots.appendChild(s);
    }
    if (!gift && k.months > 12) { const m = document.createElement('div'); m.className = 'tk-more'; m.textContent = '+' + (k.months - 12); slots.appendChild(m); }
    // штрих-код из ника
    let h = 2166136261; for (const ch of k.nick + k.no + k.months) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const bars = tkEl('tkBars'); bars.querySelectorAll('b').forEach((b) => b.remove());
    const scan = bars.querySelector('.tk-scan'); let x = 0;
    while (x < 168) { const w = [2, 3, 4, 6][Math.floor(rnd() * 4)], g = [2, 3, 4][Math.floor(rnd() * 3)]; const b = document.createElement('b'); b.style.width = w + 'px'; b.style.marginRight = g + 'px'; bars.insertBefore(b, scan); x += w + g; }
    tkEl('tkCode').textContent = k.nick.toUpperCase().slice(0, 8) + '·' + (k.no ? String(k.no).padStart(4, '0') : '0000');
    L.style.display = 'block';

    const sfx = (file) => { if (!file) return; try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((c.soundVolume == null ? 70 : c.soundVolume) / 100, 0, 1); a.play().catch(() => {}); } catch (_) {} };
    let dur = 0; if (item.audio) dur = await audioDuration(item.audio);
    const hold = Math.max(3.9, k.hold || 6, dur ? dur + 0.9 : 0);
    skipFlag = false;
    // ждёт секунды; true — нажали «пропустить»
    const wait = async (sec) => { const end = performance.now() + sec * 1000; while (performance.now() < end) { if (skipFlag) { skipFlag = false; return true; } await sleep(40); } return false; };
    const sn_ = k.sounds || {};
    let skipped = false;
    if (sn_.pre) { sfx(sn_.pre); const pd = await audioDuration('alert-sounds/' + encodeURIComponent(sn_.pre)); skipped = await wait(clamp(pd || 0.5, 0.25, 1.1)); }
    if (!skipped) { sfx(sn_.fly == null ? c.soundFly : sn_.fly); T.classList.add('tk-enter'); skipped = await wait(0.95); }
    if (!skipped) {
      L.classList.add('tk-stamp');
      if (lastSlot) { lastSlot.classList.add('on', 'pop'); }
      sfx(sn_.stamp == null ? c.soundLand : sn_.stamp);
      if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); }
      skipped = await wait(1.4);
      if (!skipped) { L.classList.add('tk-tear'); sfx(sn_.tear); await wait(Math.max(1, hold - 1.4)); }
    }
    T.classList.remove('tk-enter'); T.classList.add('tk-exit');
    await sleep(720);
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
  }


  // ---------- алерт фоллоу «Стена»: стикеры всех фолловеров ----------
  const fwL = document.getElementById('fwLayer');
  async function runWall(item) {
    const c = item.card, w = c.wall, L = fwL;
    L.className = 'fw-layer';
    L.style.setProperty('--fw-acc', w.color || '#3ba7ff');
    L.style.display = 'block';
    const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
    const fmt = (n) => Number(n).toLocaleString('ru-RU');
    tkEl('fwTotal').innerHTML = w.total ? 'всего <b>' + fmt(w.total) + '</b>' : '';
    const grid = tkEl('fwGrid'); grid.textContent = '';
    const list = w.recent.slice(0, 20); let li = 0;
    for (let i = 0; i < 21; i++) {
      const d = document.createElement('div'); d.className = 'fw-tile';
      if (i === 10) { d.style.visibility = 'hidden'; d.style.animation = 'none'; grid.appendChild(d); continue; } // под новым стикером
      const r = list[li++];
      if (!r) { d.style.visibility = 'hidden'; grid.appendChild(d); continue; }
      const hh = hash(r.n), hue = hh % 360;
      d.style.setProperty('--t1', `hsl(${hue} 78% 80%)`); d.style.setProperty('--t2', `hsl(${(hue + 28) % 360} 70% 68%)`);
      d.style.setProperty('--rot', (((hh >> 8) % 51) / 10 - 2.5).toFixed(1) + 'deg'); d.style.setProperty('--i', String(i));
      d.innerHTML = '<span class="fw-tno"></span><div class="fw-tn"></div><div class="fw-td"></div>';
      d.querySelector('.fw-tn').textContent = r.n; d.querySelector('.fw-td').textContent = r.d; d.querySelector('.fw-tno').textContent = r.no ? '#' + r.no : '';
      grid.appendChild(d);
    }
    const nn = tkEl('fwNn'); nn.textContent = w.nick; nn.style.fontSize = '56px';
    await fitNick(nn, 335, 56, 22);
    tkEl('fwNm').textContent = w.no ? 'фолловер №' + fmt(w.no) : 'добро пожаловать';
    tkEl('fwNd').textContent = w.date ? 'с ' + w.date : '';
    const sfx = (file) => { if (!file) return; try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((c.soundVolume == null ? 70 : c.soundVolume) / 100, 0, 1); a.play().catch(() => {}); } catch (_) {} };
    let dur = 0; if (item.audio) dur = await audioDuration(item.audio);
    const hold = Math.max(3.5, w.hold || 7, dur ? dur + 0.9 : 0);
    skipFlag = false;
    const wait = async (sec) => { const end = performance.now() + sec * 1000; while (performance.now() < end) { if (skipFlag) { skipFlag = false; return true; } await sleep(40); } return false; };
    void L.offsetWidth; L.classList.add('fw-in');
    let skipped = await wait(1.0);
    if (!skipped) {
      L.classList.add('fw-slap'); setTimeout(() => { L.classList.add('fw-shake'); sfx(w.sound); }, 330);
      if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); }
      skipped = await wait(hold);
    }
    L.classList.add('fw-out'); await sleep(650);
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
  }


  // ---------- алерт фоллоу «Пропуск на ленте» ----------
  const bdL = document.getElementById('bdLayer');
  async function runBadge(item) {
    const c = item.card, b = c.badge, L = bdL;
    L.className = 'bd-layer'; L.style.setProperty('--bd-acc', b.color || '#3ba7ff'); L.style.display = 'block';
    const fmt = (n) => Number(n).toLocaleString('ru-RU');
    tkEl('bdStrap').textContent = ((b.channel || 'STREAM').toUpperCase() + ' ✦ FOLLOWER ✦ ').repeat(3);
    const ava = tkEl('bdAva'); ava.textContent = '';
    const initial = (b.nick || '?').trim().charAt(0).toUpperCase();
    if (b.avatar) { const im = new Image(); im.alt = ''; im.onerror = () => { ava.textContent = initial; }; im.src = b.avatar; ava.appendChild(im); } else ava.textContent = initial;
    const nm = tkEl('bdNm'); nm.textContent = b.nick; nm.style.fontSize = '54px';
    { const box = nm.parentElement; box.style.overflow = 'hidden'; box.style.margin = '148px 34px -12px'; box.style.padding = '0'; nm.style.fontSize = '54px'; await Promise.race([document.fonts ? document.fonts.ready : 0, new Promise((r) => setTimeout(r, 600))]).catch(() => {}); scrollIfLong(nm, box); }
    tkEl('bdNo').textContent = b.no ? 'ФОЛЛОВЕР №' + fmt(b.no) : 'НОВЫЙ ФОЛЛОВЕР';
    tkEl('bdDt').textContent = b.date ? 'с ' + b.date : '';
    const sfx = (file) => { if (!file) return; try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((c.soundVolume == null ? 70 : c.soundVolume) / 100, 0, 1); a.play().catch(() => {}); } catch (_) {} };
    let dur = 0; if (item.audio) dur = await audioDuration(item.audio);
    const hold = Math.max(3.5, b.hold || 7, dur ? dur + 0.9 : 0);
    skipFlag = false;
    const wait = async (sec) => { const end = performance.now() + sec * 1000; while (performance.now() < end) { if (skipFlag) { skipFlag = false; return true; } await sleep(40); } return false; };
    void L.offsetWidth; L.classList.add('bd-go'); sfx(b.soundFly);
    let skipped = await wait(2.45);
    if (!skipped) {
      L.classList.add('bd-stamped'); sfx(b.soundStamp);
      if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); }
      skipped = await wait(hold);
    }
    L.classList.add('bd-out'); await sleep(800);
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
  }


  // ---------- серия просмотров: небольшая плашка в углу ----------
  const tsL = document.getElementById('tsLayer');
  const FLAME = '<svg class="ts-fl" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.9 3.6-3.2 5.6-3.2 10.1 0 1.3.5 2.3 1.3 3-.1-1.6.7-2.8 1.9-3.6 0 2.6 2.6 3 2.6 5.6 0 1.5-.9 2.6-2.3 3 3.4-.2 6.2-2.6 6.2-6.4 0-2.4-1.1-4-2.4-5.6-.2 1.3-.8 2-1.6 2.4.4-3-.8-6.5-4.5-8.5z" fill="#ff9a3d"></path></svg>';
  function toastHtml(t) {
    const nick = escH(t.nick), n = t.n, word = escH(t.word), pts = t.points ? '<em>+' + Number(t.points).toLocaleString('ru-RU') + ' баллов</em>' : '';
    switch (t.style) {
      case 'chat': return `<div class="ts-bub"><div class="ts-av">${escH((t.nick || '?').trim().charAt(0).toUpperCase())}</div><div class="ts-bubT"><b>${nick}</b><span>с нами уже ${n} ${word} подряд!</span>${pts}</div></div>`;
      case 'ring': {
        const off = (182.2 * (1 - (((n - 1) % 10) + 1) / 10)).toFixed(1);
        return `<div class="ts-ringBox"><svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="29" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="6"></circle><circle class="ts-rg" style="--off:${off}" cx="36" cy="36" r="29" fill="none" stroke="${escH(t.color)}" stroke-width="6" stroke-linecap="round" stroke-dasharray="182.2" transform="rotate(-90 36 36)"></circle></svg><div class="ts-ringNum">${n}</div></div><div class="ts-tx"><b>${nick}</b><span>серия просмотров</span>${pts}</div>`;
      }
      case 'checkin': return `<div class="ts-chk"><div class="ts-chkC"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></div><div><b>${nick}</b><span>чек-ин: ${n} ${word} подряд</span>${pts}</div><div class="ts-chkBar" style="animation-duration:${t.hold}s"></div></div>`;
      case 'flip': {
        const cur = n % 10, prev = (n + 9) % 10, head = String(n).slice(0, -1).split('').map((d) => `<div class="ts-dg">${d}</div>`).join('');
        return `<div class="ts-flip">${head}<div class="ts-dg"><div class="ts-dgCol"><div>${prev}</div><div>${cur}</div></div></div><div class="ts-lb"><b>${nick}</b>${word} подряд${pts}</div></div>`;
      }
      case 'glass': return `<div class="ts-glass">${FLAME}<b>${nick}</b><span>${n}-й стрим подряд</span>${pts}<div class="ts-glassBar" style="animation-duration:${t.hold}s"></div></div>`;
      default: return `<div class="ts-pill">${FLAME}<b>${nick}</b><span>${n} ${word} подряд</span>${pts}</div>`;
    }
  }
  async function runToast(item) {
    const c = item.card, t = c.toast, L = tsL;
    L.className = 'ts-layer ts-' + (['bl', 'br', 'tl', 'tr'].includes(t.corner) ? t.corner : 'bl');
    L.style.setProperty('--ts-k', String(clamp((t.size || 100) / 100, 0.5, 2)));
    L.innerHTML = '<div class="ts-box ts-s-' + escH(t.style) + '">' + toastHtml(t) + '</div>';
    L.style.display = 'block';
    const sfx = (file) => { if (!file) return; try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((c.soundVolume == null ? 70 : c.soundVolume) / 100, 0, 1); a.play().catch(() => {}); } catch (_) {} };
    let dur = 0; if (item.audio) dur = await audioDuration(item.audio);
    const hold = clamp(Math.max(t.hold || 6, dur ? dur + 0.9 : 0), 3, 40);
    skipFlag = false;
    const wait = async (sec) => { const end = performance.now() + sec * 1000; while (performance.now() < end) { if (skipFlag) { skipFlag = false; return true; } await sleep(40); } return false; };
    const box = L.firstChild; void box.offsetWidth; box.classList.add('ts-in'); sfx(c.soundFly);
    let skipped = await wait(0.6);
    if (!skipped) {
      sfx(c.soundLand);
      if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); }
      skipped = await wait(hold);
    }
    box.classList.remove('ts-in'); box.classList.add('ts-out'); await sleep(550);
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
    L.innerHTML = '';
  }

  // ---------- алерт доната «Чек» ----------
  const rcL = document.getElementById('rcLayer');
  async function runReceipt(item) {
    const c = item.card, r = c.receipt, L = rcL, paper = tkEl('rcPaper'), win = tkEl('rcWin');
    paper.getAnimations().forEach((a) => a.cancel());
    L.className = 'rc-layer'; L.style.display = 'block'; win.style.overflow = 'hidden'; paper.classList.remove('rc-torn'); paper.style.transform = 'translateY(-110%)';
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const row = (l, v) => { const d = mk('div', 'rc-row'); d.appendChild(mk('span', '', l)); const b = mk('span', 'v'); b.appendChild(mk('span', '', v)); d.appendChild(b); return d; };
    const now = new Date(), p2 = (n) => String(n).padStart(2, '0');
    paper.textContent = '';
    paper.appendChild(mk('h3', '', r.title || 'ДОНАТ-КАССА'));
    paper.appendChild(mk('div', 'c', r.no ? 'ЧЕК №' + String(r.no).padStart(4, '0') : 'ЧЕК'));
    paper.appendChild(mk('div', 'c', `${p2(now.getDate())}.${p2(now.getMonth() + 1)}.${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`));
    paper.appendChild(mk('hr'));
    const nickRow = row('ДОНАТЕР', c.username); paper.appendChild(nickRow); paper.appendChild(row('ТОВАР', 'Донат x1'));
    paper.appendChild(mk('hr'));
    paper.appendChild(row('ИТОГО', '')); const big = mk('div', 'rc-big', c.amountText); paper.appendChild(big);
    paper.appendChild(mk('hr'));
    if (c.message) { const l = mk('div', 'c', 'СООБЩЕНИЕ:'); l.style.textAlign = 'left'; paper.appendChild(l); paper.appendChild(mk('div', 'rc-msg', c.message)); paper.appendChild(mk('hr')); }
    if (c.tier > 0 && c.tierLabel) paper.appendChild(row('ТАРИФ', c.tierLabel));
    if (c.stat) paper.appendChild(mk('div', 'c', c.stat));
    paper.appendChild(mk('div', 'rc-bars')); const th = mk('div', 'c', 'СПАСИБО ЗА ПОКУПКУ!'); th.style.marginTop = '10px'; paper.appendChild(th);
    const stamp = mk('div', 'rc-stamp', 'ОПЛАЧЕНО'); paper.appendChild(stamp);
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((x) => setTimeout(x, 600))]); } catch (_) {}
    { let fs = 48; while (big.scrollWidth > 372 && fs > 24) { fs -= 2; big.style.fontSize = fs + 'px'; } }
    scrollIfLong(nickRow.querySelector('.v span'), nickRow.querySelector('.v'));
    const H = paper.offsetHeight, feed = clamp(0.9 + H / 300, 2, 4.2);
    const sfx = (file) => { if (!file) return; try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((c.soundVolume == null ? 70 : c.soundVolume) / 100, 0, 1); a.play().catch(() => {}); } catch (_) {} };
    let dur = 0; if (item.audio) dur = await audioDuration(item.audio);
    const hold = clamp(Math.max(c.holdMin, dur ? dur + 0.9 : readTime(c)), c.holdMin, c.holdMax);
    skipFlag = false;
    const wait = async (sec) => { const end = performance.now() + sec * 1000; while (performance.now() < end) { if (skipFlag) { skipFlag = false; return true; } await sleep(40); } return false; };
    void L.offsetWidth; L.classList.add('rc-in');
    let skipped = await wait(0.5);
    if (!skipped) {
      sfx(r.soundPrint);
      const an = paper.animate([{ transform: `translateY(${-H - 10}px)` }, { transform: 'translateY(0)' }], { duration: feed * 1000, easing: `steps(${Math.max(8, Math.round(H / 34))}, end)`, fill: 'forwards' });
      if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); }
      skipped = await wait(feed);
      if (skipped) an.finish();
      if (!skipped) { L.classList.add('rc-stamped'); sfx(c.soundLand); skipped = await wait(hold); }
    }
    L.classList.add('rc-out'); win.style.overflow = 'visible'; paper.classList.add('rc-torn'); sfx(r.soundTear);
    paper.animate([{ transform: 'translateY(0) rotate(0)', offset: 0 }, { transform: 'translateY(-8px) rotate(-1.5deg)', offset: 0.14 }, { transform: 'translateY(0) rotate(0.5deg)', offset: 0.22 }, { transform: 'translateY(1200px) rotate(6deg)', offset: 1 }], { duration: 950, easing: 'ease-in', fill: 'forwards' });
    await sleep(1050);
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
  }

  // ---------- алерт доната «Игровой автомат» ----------
  const slL = document.getElementById('slLayer');
  async function runSlots(item) {
    const c = item.card, L = slL, reels = tkEl('slReels');
    L.className = 'sl-layer'; L.style.setProperty('--sl-acc', c.color || '#ff3fa4'); L.style.display = 'block';
    const syms = Array.from(String(c.amountText || '').replace(/[\s  ]/g, '')).slice(0, 9), n = Math.max(1, syms.length);
    L.style.setProperty('--sl-fs', (n <= 5 ? 110 : n === 6 ? 96 : n === 7 ? 84 : 72) + 'px');
    tkEl('slMq').textContent = '★ ' + String(c.tierLabel || 'донат').toUpperCase() + ' ★';
    tkEl('slWinMark').textContent = (c.tier || 0) >= 2 ? 'ДЖЕК-ПОТ!' : 'WIN!';
    const pool = ['7', '3', '9', '2', '8', '4', '6', '1', '5', '0'];
    reels.textContent = ''; const strips = [];
    syms.forEach((f, i) => {
      const reel = document.createElement('div'); reel.className = 'sl-reel'; const st = document.createElement('div'); st.className = 'sl-strip';
      for (let k = 0; k < 14; k++) { const s = k === 12 ? f : pool[(k * 5 + i * 3 + 1) % pool.length]; const d = document.createElement('div'); d.className = 'sl-sym' + (k === 12 && !/\d/.test(f) ? ' r' : ''); d.textContent = s; st.appendChild(d); }
      reel.appendChild(st); reels.appendChild(reel); strips.push(st);
    });
    const nickEl = tkEl('slNick'); nickEl.textContent = c.username; nickEl.style.fontSize = '';
    tkEl('slMsg').textContent = c.message ? '«' + c.message + '»' : '';
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((x) => setTimeout(x, 600))]); } catch (_) {}
    scrollIfLong(nickEl, nickEl.parentElement);
    const sfx = (file) => { if (!file) return; try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((c.soundVolume == null ? 70 : c.soundVolume) / 100, 0, 1); a.play().catch(() => {}); } catch (_) {} };
    let dur = 0; if (item.audio) dur = await audioDuration(item.audio);
    const hold = clamp(Math.max(c.holdMin, dur ? dur + 0.9 : readTime(c)), c.holdMin, c.holdMax);
    skipFlag = false;
    const wait = async (sec) => { const end = performance.now() + sec * 1000; while (performance.now() < end) { if (skipFlag) { skipFlag = false; return true; } await sleep(40); } return false; };
    void L.offsetWidth; L.classList.add('sl-in'); sfx(c.soundFly);
    let skipped = await wait(0.5);
    if (!skipped) {
      L.classList.add('sl-pull');
      const step = n > 5 ? 0.3 : 0.4; let total = 0;
      strips.forEach((st, i) => { const d = 1800 + i * step * 1000; total = Math.max(total, 300 + d); st.animate([{ transform: 'translateY(0)', filter: 'blur(0)' }, { transform: 'translateY(-1650px)', filter: 'blur(3px)', offset: 0.8 }, { transform: 'translateY(-1650px)', filter: 'blur(0)' }], { duration: d, delay: 300, fill: 'both', easing: 'cubic-bezier(.25,.6,.3,1)' }); });
      skipped = await wait(total / 1000);
      if (!skipped) {
        L.classList.add('sl-win'); sfx(c.soundLand);
        if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); }
        skipped = await wait(hold);
      }
    }
    L.classList.add('sl-out'); await sleep(650);
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
  }

  // ---------- алерт рейда: «Радар» и «Билет» ----------
  const rdL = document.getElementById('rdLayer'), rjL = document.getElementById('rjLayer');
  const escH = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function raidSfx(r) {
    let last = 0;
    const play = (file, k, minGap) => {
      if (!file) return; const now = performance.now(); if (minGap && now - (play.t || 0) < minGap) return; play.t = now;
      try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((r.volume == null ? 70 : r.volume) / 100 * (k || 1), 0, 1); a.play().catch(() => {}); return a; } catch (_) {}
    };
    return { siren: () => play(r.soundSiren, 1), ping: () => play(r.soundPing, 1), cardIn: () => play(r.soundIn, 1), cardDone: () => play(r.soundDone, 1), tick: () => { const n = performance.now(); if (n - last < 75) return; last = n; play(r.soundTick, 1); } };
  }
  function avatarHtml(r) { return r.avatar ? `<img src="${escH(r.avatar)}" alt="" onerror="this.remove()">` : ''; }
  async function runRadar(item) {
    const c = item.card, r = c.raid, L = rdL, stage = tkEl('rdStage'), sx = raidSfx(r);
    L.className = 'rd-layer'; L.style.setProperty('--rd', r.color || '#35e08a'); L.style.display = 'block';
    const N = clamp(r.viewers, 6, 150), SP = 120, nRev = clamp(Math.ceil(N / 70), 1, 3), T0 = 0.7, tEnd = T0 + nRev * 3 + 0.35;
    const R = 380, dots = [];
    stage.innerHTML = `<div class="rd-panel rd-left"><div class="t" id="rdT">▶ ВХОДЯЩИЙ РЕЙД</div><div class="k">ИСТОЧНИК</div><div class="v" id="rdNb"><span id="rdN"></span></div>${r.game ? '<div class="k">ИГРА</div><div class="v" id="rdGb"><span id="rdG"></span></div>' : ''}</div>
      <div class="rd-disc" id="rdDisc"><div class="rd-ring" style="inset:95px"></div><div class="rd-ring" style="inset:190px"></div><div class="rd-ring" style="inset:285px"></div><div class="rd-hl"></div><div class="rd-vl"></div><div class="rd-sweep" id="rdSw"></div><div id="rdDots"></div><div class="rd-ping" id="rdPing"></div><div class="rd-av">${r.nick ? escH(r.nick.charAt(0).toUpperCase()) : ''}${''}</div></div>
      <div class="rd-panel rd-right"><div class="k">ЦЕЛЕЙ НА РАДАРЕ</div><div class="n" id="rdC">0</div><div class="u">ЗРИТЕЛЕЙ В РЕЙДЕ</div></div>`;
    const av = stage.querySelector('.rd-av'); if (r.avatar) { av.innerHTML = avatarHtml(r); }
    stage.querySelector('#rdN').textContent = r.nick; if (r.game) stage.querySelector('#rdG').textContent = r.game;
    const dd = stage.querySelector('#rdDots'), cEl = stage.querySelector('#rdC'), sw = stage.querySelector('#rdSw'), ping = stage.querySelector('#rdPing'), ttl = stage.querySelector('#rdT');
    let seed = (r.viewers * 7919 + 13) % 2147483647 || 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) { const a = rnd() * 360, rr = Math.sqrt(0.04 + rnd() * 0.9) * (R - 26), rev = i % nRev, ang = a * Math.PI / 180, e = document.createElement('div'); e.className = 'rd-dot'; e.style.left = (R + Math.sin(ang) * rr) + 'px'; e.style.top = (R - Math.cos(ang) * rr) + 'px'; dd.appendChild(e); dots.push({ e, lit: T0 + (rev * 360 + a) / SP }); }
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((x) => setTimeout(x, 600))]); } catch (_) {}
    { const nb = stage.querySelector('#rdNb'); scrollIfLong(stage.querySelector('#rdN'), nb); const gb = stage.querySelector('#rdGb'); if (gb) scrollIfLong(stage.querySelector('#rdG'), gb); }
    let dur = 0; if (item.audio) dur = await audioDuration(item.audio);
    const hold = clamp(Math.max(r.hold, dur ? dur + 0.9 : 0), r.hold, 40);
    skipFlag = false;
    void L.offsetWidth; L.classList.add('rd-in'); if (r.siren) { L.classList.add('rd-siren'); sx.siren(); }
    const t0 = performance.now(); let shown = 0, pings = 0, ended = false, voiced = false;
    while (true) {
      const t = (performance.now() - t0) / 1000;
      if (skipFlag) { skipFlag = false; break; }
      if (t >= T0) sw.style.transform = `rotate(${(t - T0) * SP}deg)`;
      sw.style.opacity = t < T0 ? 0 : t > tEnd ? Math.max(0, 1 - (t - tEnd) / 0.5) : 1;
      if (t >= T0 + pings * 3 && pings < nRev) { pings++; sx.ping(); }
      let n = 0; for (const d of dots) { const k = t - d.lit; if (k < 0) continue; n++; const f = clamp(k / 0.6, 0, 1); d.e.style.opacity = 0.55 + 0.45 * (1 - f); d.e.style.transform = f < 1 ? `scale(${1 + 2.2 * (1 - f)})` : ''; }
      const cnt = Math.round(r.viewers * n / N); if (cnt !== shown) { shown = cnt; cEl.textContent = cnt; sx.tick(); }
      if (t >= tEnd && !ended) { ended = true; shown = r.viewers; cEl.textContent = r.viewers; ttl.textContent = '✔ РЕЙД ПРИНЯТ'; sx.ping(); L.classList.remove('rd-siren'); ping.animate([{ width: '0px', height: '0px', opacity: 1 }, { width: '760px', height: '760px', opacity: 0 }], { duration: 1300, easing: 'ease-out', fill: 'forwards' }); }
      if (ended && !voiced && t >= tEnd + 0.4) { voiced = true; if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); } }
      if (ended && t >= tEnd + hold) break;
      await new Promise((x) => requestAnimationFrame(x));
    }
    L.classList.remove('rd-siren'); L.classList.add('rd-out'); await sleep(600);
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
  }
  async function runRaidCard(item) {
    const c = item.card, r = c.raid, L = rjL, stage = tkEl('rjStage'), sx = raidSfx(r);
    L.className = 'rj-layer'; L.style.setProperty('--rj', r.color || '#ff8a1f'); L.style.display = 'block';
    const ini = (r.game || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
    const NI = 36, person = '<svg viewBox="0 0 20 30"><circle cx="10" cy="7" r="6"/><path d="M2 29 C2 17 18 17 18 29 Z"/></svg>';
    stage.innerHTML = `<div class="rj-halo"></div><div class="rj-line"></div><div class="rj-panel"><div class="rj-shape"></div><div class="rj-face"><div class="rj-scan"></div><i class="rj-br a"></i><i class="rj-br b"></i>
      <div class="rj-top rj-fade" style="animation-delay:.8s"><span class="rj-chip">РЕЙД</span><span>входящий сигнал</span><span class="rj-live"><i></i>в эфире</span></div>
      <div class="rj-avwrap"><div class="rj-ring"></div><div class="rj-pulse"></div><div class="rj-av"><div>${escH((r.nick || '?').charAt(0).toUpperCase())}</div></div></div>
      <div class="rj-nickbox rj-fade" id="rjNb" style="animation-delay:.95s"><span class="rj-nick" id="rjN"></span></div>
      <div class="rj-sub rj-fade" style="animation-delay:1.05s">приводит своё комьюнити</div>
      <div class="rj-crowd rj-fade" id="rjCrowd" style="animation-delay:1.1s">${person.repeat(NI)}</div>
      <div class="rj-count rj-fade" style="animation-delay:1.0s"><div class="rj-num" id="rjC">0</div><div class="rj-lab">ЗРИТЕЛЕЙ</div></div>
      ${r.game ? `<div class="rj-game rj-fade" style="animation-delay:1.2s"><div class="rj-art">${escH(ini)}</div><div class="rj-gt"><div class="rj-gk">ИГРАЛИ В</div><div class="rj-gn" id="rjG"></div>${r.title ? '<div class="rj-gs" id="rjS"></div>' : ''}</div></div>` : ''}
      </div></div>`;
    stage.querySelector('#rjN').textContent = r.nick; if (r.game) { stage.querySelector('#rjG').textContent = r.game; const s2 = stage.querySelector('#rjS'); if (s2) s2.textContent = r.title; }
    if (r.avatar) stage.querySelector('.rj-av > div').innerHTML = avatarHtml(r);
    const cEl = stage.querySelector('#rjC'), icons = Array.from(stage.querySelectorAll('#rjCrowd svg'));
    let fs = 150; while (cEl.scrollWidth > 240 && fs > 60) { fs -= 6; cEl.style.fontSize = fs + 'px'; }
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((x) => setTimeout(x, 600))]); } catch (_) {}
    scrollIfLong(stage.querySelector('#rjN'), stage.querySelector('#rjNb'));
    let dur = 0; if (item.audio) dur = await audioDuration(item.audio);
    const hold = clamp(Math.max(r.hold, dur ? dur + 0.9 : 0), r.hold, 40);
    skipFlag = false;
    void L.offsetWidth; L.classList.add('rj-in'); sx.cardIn();
    let skipped = false;
    const wait = async (sec) => { const end = performance.now() + sec * 1000; while (performance.now() < end) { if (skipFlag) { skipFlag = false; return true; } await sleep(40); } return false; };
    skipped = await wait(1.4);
    if (!skipped) {
      const t0 = performance.now(), D = clamp(1.6 + r.viewers * 0.012, 1.8, 3.4); let shown = 0, lit = 0;
      while (true) {
        const k = (performance.now() - t0) / 1000 / D; if (skipFlag) { skipFlag = false; skipped = true; break; }
        const e = 1 - Math.pow(1 - clamp(k, 0, 1), 2.4), v = Math.round(r.viewers * e); if (v !== shown) { shown = v; cEl.textContent = v; sx.tick(); }
        const want = Math.round(NI * e); while (lit < want) icons[lit++].classList.add('on');
        if (k >= 1) break; await new Promise((x) => requestAnimationFrame(x));
      }
      cEl.textContent = r.viewers; icons.forEach((i2) => i2.classList.add('on'));
      if (!skipped) {
        L.classList.add('rj-done'); cEl.classList.add('pop'); sx.cardDone();
        if (item.audio) { audio = new Audio(item.audio); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); }
        skipped = await wait(hold);
      }
    }
    L.classList.add('rj-out'); await sleep(650);
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
  }

  /** Помощники для новых видов алерта (donation-looks.js). */
  function lookHelpers(c) {
    skipFlag = false; // залипший «пропуск» с прошлого алерта не должен сразу закрывать новый
    return {
      audioDuration,
      takeSkip: () => { if (skipFlag) { skipFlag = false; return true; } return false; },
      playAudio: (src) => { try { audio = new Audio(src); audio.volume = clamp((c.volume == null ? 100 : c.volume) / 100, 0, 1); audio.play().catch(() => {}); } catch (_) {} },
      stopAudio: () => { if (audio) { try { audio.pause(); } catch (_) {} audio = null; } },
      sfx: (file) => { if (!file) return; try { const a = new Audio('alert-sounds/' + encodeURIComponent(file)); a.volume = clamp((c.soundVolume == null ? 70 : c.soundVolume) / 100, 0, 1); a.play().catch(() => {}); } catch (_) {} },
    };
  }

  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const item = queue.shift();
      try { if (item.card && item.card.ticket) await runTicket(item); else if (item.card && item.card.wall) await runWall(item); else if (item.card && item.card.toast) await runToast(item); else if (item.card && item.card.badge) await runBadge(item); else if (item.card && item.card.dlook && window.DonationLooks) await window.DonationLooks.run(item, lookHelpers(item.card)); else if (item.card && item.card.receipt) await runReceipt(item); else if (item.card && item.card.slots) await runSlots(item); else if (item.card && item.card.raid && item.card.raid.style === 'card') await runRaidCard(item); else if (item.card && item.card.raid) await runRadar(item); else await run(item); } catch (e) { console.error('DL', e && e.stack); }
      if (item.onEnd) item.onEnd();
      layer.style.display = 'none';
      if (tk.layer) tk.layer.style.display = 'none';
      if (fwL) fwL.style.display = 'none';
      if (bdL) bdL.style.display = 'none';
      if (tsL) tsL.style.display = 'none';
      if (rcL) rcL.style.display = 'none';
      if (slL) slL.style.display = 'none';
      if (rdL) rdL.style.display = 'none';
      if (rjL) rjL.style.display = 'none';
      if (window.DonationLooks) window.DonationLooks.hide();
      if (queue.length) await new Promise((r) => setTimeout(r, GAP_SEC * 1000));
    }
    busy = false;
  }

  function show(msg) {
    if (!msg || !msg.card) return;
    queue.push({ card: msg.card, audio: msg.audio || null });
    if (queue.length > MAX_QUEUE) queue.shift();
    pump();
  }
  function skip() { skipFlag = true; }

  // предпросмотр в админке: карточка собирается из полей формы, звук не играет
  if (new URLSearchParams(location.search).get('preview') === '1') {
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (!m || m.type !== 'da_preview' || !m.card) return;
      queue.length = 0;
      skip();
      queue.push({ card: m.card, audio: null, onEnd: () => { try { parent.postMessage({ type: 'da_preview_done' }, '*'); } catch (_) {} } });
      pump();
    });
  }

  window.DonationAlertModule = { show, skip };
})();
