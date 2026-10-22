// public/nowplaying.js — алерт «Сейчас играет»: закреплённая карточка с обложкой, названием и временем (сколько прошло / всего).
// Данные приходят от сервера сообщением {type:'nowplaying', enabled, settings, state} (см. nowPlaying.js); время между сообщениями считаем сами.
(function () {
  const layer = document.getElementById('npLayer');
  if (!layer) { window.NowPlayingModule = { set() {} }; return; }
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (sec) => { sec = Math.max(0, Math.floor(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  const NOTE = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="16.5" cy="16" r="2.5"></circle></svg>';
  let P = null, recvAt = 0, shownKey = '', hideTimer = null, visible = false, lastNoCur = 0;

  const EQ = '<span class="np-eq"><b></b><b></b><b></b><b></b></span>';
  function build(c, cfg) {
    const cv = cfg.showCover !== false && c.cover ? `<img class="np-cv" src="${esc(c.cover)}" alt="" onerror="this.remove()">` : ''; // нет обложки — место под неё не занимаем
    const name = esc(c.title || c.artist || 'Без названия');
    if (cfg.style === 'mini') { // миниатюрный: мини-обложка (по настройке), название, время и шкала с бегунком
      layer.innerHTML = `<div class="np-mini">${cv}<div class="np-minfo"><div class="np-title">${name}</div><div class="np-mrow"><span class="np-pos">0:00</span><div class="np-bar"><i></i></div><span class="np-dur"></span></div></div></div><div class="np-others" style="display:none"></div>`;
      return;
    }
    const src = cfg.showSource !== false ? `<div class="np-src">${EQ}<span class="np-app">${esc(c.app)}</span><span class="np-st"></span></div>` : '';
    const artist = c.title && c.artist ? `<div class="np-artist">${esc(c.artist)}</div>` : '';
    layer.innerHTML = `<div class="np-card"><div class="np-row">${cv}<div class="np-info">${src}<div class="np-title">${name}</div>${artist}</div><div class="np-time"><span class="np-pos">0:00</span><small class="np-dur"></small></div></div><div class="np-bar"><i></i></div></div><div class="np-others"></div>`;
  }

  function tick() {
    if (!visible || !P || !P.state.current) return;
    const c = P.state.current;
    const pos0 = c.pos + (c.playing ? (Date.now() - recvAt) / 1000 * (c.rate || 1) : 0);
    const pos = c.dur > 0 ? Math.min(c.dur, pos0) : pos0;
    const q = (s) => layer.querySelector(s);
    const bar = q('.np-bar i'); if (bar) bar.style.width = c.dur > 0 ? (100 * pos / c.dur).toFixed(2) + '%' : '0%';
    const bw = q('.np-bar'); if (bw) bw.classList.toggle('np-live', !(c.dur > 0));
    const pe = q('.np-pos'); if (pe) pe.textContent = fmt(pos);
    const mini = !!q('.np-mini');
    const de = q('.np-dur'); if (de) de.textContent = c.dur > 0 ? (mini ? fmt(c.dur) : 'из ' + fmt(c.dur)) : (mini ? '' : 'в эфире');
    const st = q('.np-st'); if (st) st.textContent = c.playing ? '' : ' · пауза';
    const card = q('.np-card, .np-mini'); if (card) card.classList.toggle('np-paused', !c.playing);
  }

  function renderOthers(cfg, others) {
    const o = layer.querySelector('.np-others'); if (!o) return;
    if (cfg.style === 'mini' || cfg.showOthers === false || !others.length) { o.style.display = 'none'; return; }
    o.style.display = '';
    o.innerHTML = '<b>Ещё открыто:</b>' + others.slice(0, 3).map((x) => `<span>${esc(x.app)}${x.title ? ' — ' + esc(x.title) : ''}</span>`).join('');
  }

  function show() { visible = true; layer.style.display = 'block'; requestAnimationFrame(() => layer.classList.add('np-on')); }
  function hide() { visible = false; layer.classList.remove('np-on'); setTimeout(() => { if (!visible) { layer.style.display = 'none'; layer.innerHTML = ''; shownKey = ''; } }, 650); }

  function set(p) {
    P = p; recvAt = Date.now();
    const cfg = p.settings || {}, st = p.state || {}, c = st.current;
    layer.className = 'np-layer np-s-' + (cfg.style === 'mini' ? 'mini' : 'card') + ' np-' + (['bl', 'br', 'tl', 'tr'].includes(cfg.corner) ? cfg.corner : 'bl') + (visible ? ' np-on' : '') + ((cfg.bgOpacity == null ? 90 : cfg.bgOpacity) < 45 ? ' np-thin' : '');
    layer.style.setProperty('--np-bga', String((cfg.bgOpacity == null ? 90 : Math.max(0, Math.min(100, cfg.bgOpacity))) / 100));
    layer.style.setProperty('--np-k', String(Math.max(0.5, Math.min(2, (cfg.size || 100) / 100))));
    layer.style.setProperty('--np-acc', cfg.color || '#a970ff');
    if (!p.enabled || !st.supported || !c) {
      if (!visible) return;
      if (!p.enabled || !st.supported) { clearTimeout(hideTimer); hide(); return; }
      if (!hideTimer) hideTimer = setTimeout(() => { hideTimer = null; hide(); }, Math.max(0, (cfg.hideDelaySec == null ? 8 : cfg.hideDelaySec)) * 1000);
      return;
    }
    clearTimeout(hideTimer); hideTimer = null;
    const key = c.key + '|' + c.title + '|' + !!c.cover + '|' + cfg.style + '|' + (cfg.showCover !== false);
    if (!visible || key !== shownKey) { build(c, cfg); shownKey = key; if (!visible) show(); else { const card = layer.querySelector('.np-card, .np-mini'); if (card) { card.classList.add('np-swap'); setTimeout(() => card.classList.remove('np-swap'), 600); } } }
    renderOthers(cfg, st.others || []);
    tick();
  }
  setInterval(tick, 250);
  window.NowPlayingModule = { set };
})();
