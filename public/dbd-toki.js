/* DBD-стиль: Токи изредка появляется на ОДНОЙ случайной плашке — скример или медленный проплыв. Никогда на нескольких сразу. */
(function () {
  let busy = false;
  const active = () => document.body.getAttribute('data-ostyle') === 'p';
  function panels() {
    return [...document.querySelectorAll('.panel[data-widget]')].filter((p) => {
      const r = p.getBoundingClientRect();
      return r.width > 80 && r.height > 50 && getComputedStyle(p).visibility !== 'hidden' && getComputedStyle(p).display !== 'none';
    });
  }
  function play(panel, kind) {
    busy = true;
    if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
    const fx = document.createElement('div');
    fx.className = 'toki-fx ' + kind;
    const i = document.createElement('i');
    fx.appendChild(i);
    const w = panel.getBoundingClientRect().width;
    const dur = kind === 'drift' ? 7000 + Math.random() * 2000 : 700;
    if (kind === 'drift') { fx.style.setProperty('--toki-d', dur + 'ms'); fx.style.setProperty('--toki-w', Math.round(w) + 'px'); }
    panel.appendChild(fx);
    setTimeout(() => { fx.remove(); busy = false; }, dur + 150);
  }
  function tick() {
    if (active() && !busy) {
      const list = panels();
      if (list.length) play(list[Math.floor(Math.random() * list.length)], Math.random() < 0.45 ? 'scare' : 'drift');
    }
    setTimeout(tick, 8000 + Math.random() * 4000); // примерно раз в 10 с
  }
  setTimeout(tick, 4000);
  window.__tokiPlay = (kind) => { const l = panels(); if (!busy && l.length) play(l[Math.floor(Math.random() * l.length)], kind || 'scare'); };
})();
