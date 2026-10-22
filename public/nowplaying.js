// public/nowplaying.js — алерт «Сейчас играет»: закреплённая карточка с обложкой, названием и временем (сколько прошло / всего).
// Данные приходят от сервера сообщением {type:'nowplaying', enabled, settings, state} (см. nowPlaying.js); время между сообщениями считаем сами.
(function () {
  const layer = document.getElementById('npLayer');
  if (!layer) { window.NowPlayingModule = { set() {} }; return; }
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (sec) => { sec = Math.max(0, Math.floor(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  const NOTE = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="16.5" cy="16" r="2.5"></circle></svg>';
  let P = null, recvAt = 0, shownKey = '', hideTimer = null, visible = false, lastNoCur = 0;

  function build(c, cfg) {
    const cover = cfg.showCover !== false ? `<div class="np-cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" onerror="this.remove()">` : ''}<span class="np-note">${NOTE}</span></div>` : '';
    const src = cfg.showSource !== false ? `<div class="np-src"><i class="np-dot"></i><span class="np-app">${esc(c.app)}</span><span class="np-st"></span></div>` : '';
    const title = esc(c.title || c.artist || 'Без названия');
    const artist = c.title && c.artist ? `<div class="np-artist">${esc(c.artist)}</div>` : '';
    layer.innerHTML = `<div class="np-card">${cover}<div class="np-info">${src}<div class="np-title">${title}</div>${artist}<div class="np-bar"><i></i></div><div class="np-times"><span class="np-pos">0:00</span><span class="np-dur"></span></div></div></div><div class="np-others"></div>`;
  }

  function tick() {
    if (!visible || !P || !P.state.current) return;
    const c = P.state.current, cfg = P.settings;
    const pos0 = c.pos + (c.playing ? (Date.now() - recvAt) / 1000 * (c.rate || 1) : 0);
    const pos = c.dur > 0 ? Math.min(c.dur, pos0) : pos0;
    const q = (s) => layer.querySelector(s);
    const bar = q('.np-bar i'); if (bar) bar.style.width = c.dur > 0 ? (100 * pos / c.dur).toFixed(2) + '%' : '0%';
    const bw = q('.np-bar'); if (bw) bw.classList.toggle('np-live', !(c.dur > 0));
    const pe = q('.np-pos'); if (pe) pe.textContent = fmt(pos);
    const de = q('.np-dur'); if (de) de.textContent = c.dur > 0 ? fmt(c.dur) : 'в эфире';
    const st = q('.np-st'); if (st) st.textContent = c.playing ? ' · играет' : ' · пауза';
    const card = q('.np-card'); if (card) card.classList.toggle('np-paused', !c.playing);
  }

  function renderOthers(cfg, others) {
    const o = layer.querySelector('.np-others'); if (!o) return;
    if (cfg.showOthers === false || !others.length) { o.style.display = 'none'; return; }
    o.style.display = '';
    o.innerHTML = '<b>Ещё открыто:</b>' + others.slice(0, 3).map((x) => `<span>${esc(x.app)}${x.title ? ' — ' + esc(x.title) : ''}</span>`).join('');
  }

  function show() { visible = true; layer.style.display = 'block'; requestAnimationFrame(() => layer.classList.add('np-on')); }
  function hide() { visible = false; layer.classList.remove('np-on'); setTimeout(() => { if (!visible) { layer.style.display = 'none'; layer.innerHTML = ''; shownKey = ''; } }, 650); }

  function set(p) {
    P = p; recvAt = Date.now();
    const cfg = p.settings || {}, st = p.state || {}, c = st.current;
    layer.className = 'np-layer np-' + (['bl', 'br', 'tl', 'tr'].includes(cfg.corner) ? cfg.corner : 'bl') + (visible ? ' np-on' : '');
    layer.style.setProperty('--np-k', String(Math.max(0.5, Math.min(2, (cfg.size || 100) / 100))));
    layer.style.setProperty('--np-acc', cfg.color || '#a970ff');
    if (!p.enabled || !st.supported || !c) {
      if (!visible) return;
      if (!p.enabled || !st.supported) { clearTimeout(hideTimer); hide(); return; }
      if (!hideTimer) hideTimer = setTimeout(() => { hideTimer = null; hide(); }, Math.max(0, (cfg.hideDelaySec == null ? 8 : cfg.hideDelaySec)) * 1000);
      return;
    }
    clearTimeout(hideTimer); hideTimer = null;
    const key = c.key + '|' + c.title + '|' + !!c.cover;
    if (!visible || key !== shownKey) { build(c, cfg); shownKey = key; if (!visible) show(); else { const card = layer.querySelector('.np-card'); card.classList.add('np-swap'); setTimeout(() => card.classList.remove('np-swap'), 600); } }
    renderOthers(cfg, st.others || []);
    tick();
  }
  setInterval(tick, 250);
  window.NowPlayingModule = { set };
})();
