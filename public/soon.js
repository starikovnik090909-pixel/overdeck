// soon.js — экран «Скоро начнём» для OBS. Раз в 2 секунды спрашивает /api/soon/state (настройки, таймер, название и категория с Twitch).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const preview = /[?&]preview=1/.test(location.search);
  let S = null, srvOffset = 0, emb = [], lastEmb = 0;

  function fit() { stage.style.transform = 'scale(' + (innerWidth / 1920) + ')'; }
  addEventListener('resize', fit); fit();

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',') + ')'; };
  const rgba = (h, a) => { const x = hex(h); return 'rgba(' + x.join(',') + ',' + a + ')'; };
  const p2 = (n) => (n < 10 ? '0' : '') + n;

  function paint(st) {
    const s = st.settings, ch = st.channel || {};
    S = st;
    const style = stage.style;
    style.setProperty('--accent', s.accent); style.setProperty('--accent2', s.accent2); style.setProperty('--bg', s.bg); style.setProperty('--text', s.text);
    style.setProperty('--kick', mix(s.accent, '#ffffff', 0.35));
    style.setProperty('--g1', mix(s.accent2, '#ffffff', 0.45));
    style.setProperty('--soft', rgba(s.text, 0.62));
    style.setProperty('--glow', rgba(s.accent2, 0.5));
    style.setProperty('--chatline', rgba(s.accent, 0.55));
    style.setProperty('--chat-w', s.chatWidth + 'px');
    const blur = s.layout === 'blurcol', isCol = s.layout === 'column' || blur;
    stage.dataset.layout = blur ? 'column' : s.layout; stage.classList.toggle('blur', blur);
    let left = s.chat === 'left' ? s.chatWidth + 120 : 100, right = s.chat === 'right' ? 1920 - 60 - s.chatWidth - 40 : 1860;
    const colSide = s.chat === 'left' ? 'r' : 'l'; // обложка стоит с противоположной от чата стороны
    if (isCol) { if (colSide === 'l') left = Math.max(left, 580); else right = Math.min(right, 1920 - 480 - 40); }
    style.setProperty('--tx-left', left + 'px'); style.setProperty('--tx-w', Math.max(400, right - left) + 'px');
    style.setProperty('--card-glow', rgba(s.cardColor || s.accent2, 0.5));
    const pz = $('poster'), isPoster = s.layout === 'poster';
    if (isPoster) { // карточка 3:4; если места под текст мало, уменьшаем её
      const pm = 100; let H = 760, W;
      for (;;) {
        W = Math.round(H * 0.75);
        if (colSide === 'l') { left = pm + W + 90; } else { right = Math.min(right, 1920 - pm - W - 90); }
        if (right - left >= 640 || H <= 420) break;
        H -= 20; left = s.chat === 'left' ? s.chatWidth + 120 : 100; right = s.chat === 'right' ? 1920 - 60 - s.chatWidth - 40 : 1860;
      }
      pz.style.width = W + 'px'; pz.style.height = H + 'px'; pz.style.top = Math.round((1080 - H) / 2) + 'px';
      pz.style.left = colSide === 'l' ? pm + 'px' : 'auto'; pz.style.right = colSide === 'r' ? pm + 'px' : 'auto';
      const pu = ch.art ? ch.art.replace(/\d+x\d+(?=\.\w+$)/, '600x800') : '';
      pz.classList.toggle('noart', !pu);
      if (pz.dataset.u !== pu) { pz.dataset.u = pu; pz.style.backgroundImage = pu ? 'url("' + pu + '")' : ''; }
      style.setProperty('--tx-left', left + 'px'); style.setProperty('--tx-w', Math.max(400, right - left) + 'px');
    }
    ['colp', 'edge'].forEach((id) => { $(id).className = id + ' ' + colSide; });
    const cp = $('colpost'), cu = (blur && ch.art) ? ch.art.replace(/\d+x\d+(?=\.\w+$)/, '600x800') : '';
    cp.classList.toggle('noart', blur && !cu);
    if (cp.dataset.u !== cu) { cp.dataset.u = cu; cp.style.backgroundImage = cu ? 'url("' + cu + '")' : ''; }
    const art = $('colart'), au = (ch.art && isCol) ? ch.art : '';
    if (art.dataset.u !== au) { art.dataset.u = au; art.style.backgroundImage = au ? 'url("' + au + '")' : 'none'; }
    $('base').style.background = 'radial-gradient(ellipse at 40% 130%,' + mix(s.bg, s.accent, 0.55) + ' 0,' + mix(s.bg, s.accent, 0.18) + ' 45%,' + s.bg + ' 100%)';
    const img = $('bgimg'), dim = $('dim');
    if (st.bgUrl) { img.style.display = 'block'; if (img.dataset.u !== st.bgUrl) { img.style.backgroundImage = 'url("' + st.bgUrl + '")'; img.dataset.u = st.bgUrl; } img.style.filter = s.bgBlur ? 'blur(' + s.bgBlur + 'px)' : 'none'; img.style.transform = s.bgBlur ? 'scale(1.06)' : 'none'; dim.style.display = 'block'; dim.style.opacity = s.bgDim / 100; }
    else { img.style.display = 'none'; img.dataset.u = ''; dim.style.display = 'none'; }
    $('glow').hidden = !s.glow;
    $('embers').hidden = !s.embers;
    const chat = $('chat'); chat.className = 'chat ' + s.chat + (s.chatBorder ? ' b' : '');
    const k = $('kicker'); k.hidden = !s.showKicker; k.textContent = s.kicker;
    $('catLabel').hidden = !s.showCategory; $('catLabel').textContent = s.categoryLabel;
    const c = $('cat'); c.hidden = !s.showCategory; c.textContent = s.categoryText || ch.game || 'Без категории'; c.classList.toggle('grad', !!s.gradientTitle);
    const t = $('title'); t.hidden = !s.showTitle; t.textContent = s.titleText || ch.title || '';
    fitName(s);
    $('footer').hidden = !s.showFooter; $('footer').textContent = (s.footer || ((ch.login || '') + ' · OVERDECK')).toUpperCase();
    srvOffset = st.timer.now - Date.now();
    tick();
  }

  const isCol0 = (s) => s.layout === 'column' || s.layout === 'blurcol' || s.layout === 'poster';
  /** Длинное название категории уменьшаем, пока оно не поместится в строку. */
  function fitName(s) {
    const c = $('cat'), tx = $('tx'); if (c.hidden) return;
    c.style.whiteSpace = 'nowrap';
    let size = isCol0(s) ? 104 : 150; c.style.fontSize = size + 'px';
    const max = tx.clientWidth || 1160;
    while (c.scrollWidth > max && size > 76) { size -= 4; c.style.fontSize = size + 'px'; }
    if (c.scrollWidth > max) { c.style.whiteSpace = 'normal'; c.style.fontSize = '72px'; } // совсем длинное название: в две строки
  }

  if (document.fonts) { const re = () => { if (S) fitName(S.settings); }; document.fonts.ready.then(re); document.fonts.load('700 100px Oswald').then(re, () => {}); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', re); }

  function target() {
    const s = S.settings;
    if (s.timerMode === 'clock') {
      const m = /^(\d\d):(\d\d)$/.exec(s.clock) || [0, 20, 0];
      const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
      return d.getTime();
    }
    return S.timer.endAt || 0;
  }
  function tick() {
    if (!S) return;
    const s = S.settings, tm = $('timer'), lb = $('timerLabel');
    tm.hidden = lb.hidden = !s.showTimer;
    if (!s.showTimer) return;
    const tg = target(), now = Date.now() + srvOffset;
    let left;
    if (s.timerMode === 'minutes' && !tg) left = s.minutes * 60000; // таймер ещё не запущен: показываем стартовое значение
    else left = tg - now;
    if (s.timerMode === 'clock' && left < -60000) left = 0;
    if (left <= 0 && (tg || s.timerMode === 'clock')) { tm.textContent = s.timerEndText || '00:00'; tm.classList.add('end'); lb.textContent = ''; return; }
    tm.classList.remove('end');
    const sec = Math.ceil(left / 1000), h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    tm.textContent = (h ? h + ':' + p2(m) : p2(m)) + ':' + p2(x);
    lb.textContent = s.timerLabel;
  }
  setInterval(tick, 250);

  function poll() {
    fetch('/api/soon/state').then((r) => r.json()).then((st) => { if (st && st.success) paint(st); }).catch(() => {});
  }
  poll(); setInterval(poll, preview ? 1500 : 2500);

  // искры
  const cv = $('embers'), cx = cv.getContext('2d');
  function frame(t) {
    requestAnimationFrame(frame);
    if (!S || !S.settings.embers) { cx.clearRect(0, 0, 1920, 1080); return; }
    const want = S.settings.emberCount;
    while (emb.length < want) emb.push({ x: Math.random() * 1920, y: Math.random() * 1080, v: 0.6 + Math.random() * 1.8, r: 1 + Math.random() * 3.2, s: Math.random() * 6 });
    if (emb.length > want) emb.length = want;
    cx.clearRect(0, 0, 1920, 1080);
    const c1 = S.settings.ember1 || S.settings.accent2, c2 = S.settings.ember2 || mix(S.settings.accent2, '#ffffff', 0.6);
    emb.forEach((p) => {
      p.y -= p.v; p.x += Math.sin(t / 700 + p.s) * 0.7;
      if (p.y < -10) { p.y = 1090; p.x = Math.random() * 1920; }
      cx.globalAlpha = Math.min(1, p.y / 500) * 0.9; cx.fillStyle = p.r > 2.5 ? c2 : c1;
      cx.shadowColor = c1; cx.shadowBlur = 12; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.3); cx.fill();
    });
  }
  requestAnimationFrame(frame);
})();
