// public/musicchart.js — «Муз чарт»: песни с обложками. «За стрим» — если не влезает, плавно прокручивается вниз и обратно;
// «за всё время» — статично, показывает только те песни, что целиком влезают. Данные: snapshot.musicTops (склейка дублей — на сервере).
(function () {
  const listEl = document.getElementById('musicChartList');
  const innerEl = document.getElementById('musicChartInner');
  const labelEl = document.getElementById('musicChartLabel');
  if (!listEl) return;

  let latest = null, scope = 'session', switchTimer = null, curInterval = null, lastSig = '';
  const D = { switchIntervalSec: 20, coverSize: 44, showCount: true, scrollSpeed: 30, top1Color: '#FFD700', top2Color: '#C0C0C0', top3Color: '#CD7F32', topGlow: true };
  const S = () => ({ ...D, ...((window.widgetSettings && window.widgetSettings.musicchart) || {}) });
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rgba = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 'transparent'; const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const tops = () => (latest && latest.musicTops) || { session: [], allTime: [] };

  function effScope() {
    const t = tops(), a = !!(t.session && t.session.length), b = !!(t.allTime && t.allTime.length);
    if (!a && b) return 'allTime';
    if (!b && a) return 'session';
    return scope;
  }
  function ensureTimer() {
    const s = S();
    if (curInterval === s.switchIntervalSec && switchTimer) return;
    curInterval = s.switchIntervalSec;
    clearInterval(switchTimer);
    switchTimer = setInterval(() => {
      const t = tops();
      if (!(t.session && t.session.length) || !(t.allTime && t.allTime.length)) return;
      scope = scope === 'session' ? 'allTime' : 'session';
      lastSig = ''; draw();
    }, Math.max(5, s.switchIntervalSec) * 1000);
  }

  // ---- прокрутка (только «за стрим») ----
  let scroll = { on: false, y: 0, dir: 1, wait: 0, last: 0, max: 0 };
  function tick(ts) {
    requestAnimationFrame(tick);
    const dt = scroll.last ? Math.min(100, ts - scroll.last) : 0; scroll.last = ts;
    if (!scroll.on || scroll.max <= 0) { if (scroll.y !== 0) { scroll.y = 0; innerEl.style.transform = ''; } return; }
    if (scroll.wait > 0) { scroll.wait -= dt; return; }
    scroll.y += scroll.dir * S().scrollSpeed * dt / 1000;
    if (scroll.y >= scroll.max) { scroll.y = scroll.max; scroll.dir = -1; scroll.wait = 2000; }
    else if (scroll.y <= 0) { scroll.y = 0; scroll.dir = 1; scroll.wait = 2500; }
    innerEl.style.transform = `translateY(${-scroll.y}px)`;
  }
  requestAnimationFrame(tick);

  function fit() {
    const rows = [...innerEl.children];
    rows.forEach((r) => { r.style.display = ''; });
    if (scope === 'allTime') {
      // статично: прячем песни, которые целиком не влезли
      const h = listEl.clientHeight; let hide = false;
      rows.forEach((r) => { if (hide || r.offsetTop + r.offsetHeight > h + 1) { hide = true; r.style.display = 'none'; } });
      scroll.on = false; scroll.max = 0;
    } else {
      scroll.max = Math.max(0, innerEl.scrollHeight - listEl.clientHeight);
      scroll.on = scroll.max > 2;
      if (scroll.y > scroll.max) scroll.y = scroll.max;
    }
  }

  function draw() {
    if (!latest) return;
    const want = effScope(); if (want !== scope) { scope = want; lastSig = ''; }
    const s = S(), list = (scope === 'session' ? tops().session : tops().allTime) || [];
    labelEl.textContent = scope === 'session' ? '(за стрим)' : '(за всё время)';
    const sig = [scope, s.coverSize, s.showCount, s.topGlow, s.top1Color, s.top2Color, s.top3Color, listEl.clientHeight, list.map((t) => t.id + ':' + t.count + ':' + t.title).join('|')].join('#');
    if (sig === lastSig) return;
    const scopeChanged = !lastSig || lastSig.split('#')[0] !== scope;
    lastSig = sig;
    if (scopeChanged) { scroll.y = 0; scroll.dir = 1; scroll.wait = 2500; innerEl.style.transform = ''; }
    const cols = [s.top1Color, s.top2Color, s.top3Color], sz = s.coverSize;
    innerEl.innerHTML = list.map((t, i) => {
      const top = i < 3;
      const cover = t.id ? `background-image:url(https://i.ytimg.com/vi/${encodeURIComponent(t.id)}/mqdefault.jpg);` : '';
      return `<div class="mc-row${top ? ' mc-top' + (s.topGlow ? ' mc-glow' : '') : ''}"${top ? ` style="--mc-c:${cols[i]};--mc-c60:${rgba(cols[i], .6)};--mc-c30:${rgba(cols[i], .3)};--mc-c16:${rgba(cols[i], .16)};--mc-c12:${rgba(cols[i], .12)}"` : ''}>
        <div class="mc-rank" style="font-size:${Math.round(sz * 0.36)}px">${i + 1}</div>
        <div class="mc-cover" style="width:${Math.round(sz * 1.2)}px;height:${sz}px;${cover}">${t.id ? '' : '♪'}</div>
        <div class="mc-name" style="font-size:${Math.max(12, Math.round(sz * 0.32))}px">${esc(t.title)}</div>
        ${s.showCount ? `<div class="mc-count" style="font-size:${Math.max(12, Math.round(sz * 0.36))}px">×${t.count}</div>` : ''}
      </div>`;
    }).join('');
    fit();
  }

  function render(data) { latest = data; ensureTimer(); draw(); }
  window.addEventListener('resize', () => { lastSig = ''; draw(); });
  window.MusicChartModule = { render };
})();
