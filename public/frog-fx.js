/* Лягушачье болото: изредка на ОДНОЙ случайной плашке — взгляд из темноты, прыжок или (редко) испуг. Никогда на нескольких сразу. */
(function () {
  let busy = false;
  const active = () => document.body.getAttribute('data-ostyle') === 'r';
  function panels() {
    return [...document.querySelectorAll('.panel[data-widget]')].filter((p) => {
      const r = p.getBoundingClientRect();
      return r.width > 120 && r.height > 70 && getComputedStyle(p).visibility !== 'hidden' && getComputedStyle(p).display !== 'none';
    });
  }
  function play(panel, kind) {
    busy = true;
    if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
    const fx = document.createElement('div');
    fx.className = 'frog-fx ' + kind;
    fx.appendChild(document.createElement('i'));
    const w = panel.getBoundingClientRect().width;
    const dur = kind === 'hop' ? 5500 + Math.random() * 1500 : kind === 'stare' ? 4700 : 800;
    if (kind === 'hop') {
      const fw = Math.min(w * 0.17, 78);
      fx.style.setProperty('--frog-d', dur + 'ms');
      fx.style.setProperty('--frog-w', Math.round(((w + fw) / fw) * 100) + '%');
    }
    panel.appendChild(fx);
    setTimeout(() => { fx.remove(); busy = false; }, dur + 150);
  }
  function tick() {
    if (active() && !busy) {
      const list = panels();
      if (list.length) {
        const r = Math.random();
        play(list[Math.floor(Math.random() * list.length)], r < 0.5 ? 'stare' : r < 0.85 ? 'hop' : 'scare');
      }
    }
    setTimeout(tick, 9000 + Math.random() * 5000);
  }
  setTimeout(tick, 5000);
  window.__frogPlay = (kind, i) => { const l = panels(); if (!busy && l.length) play(l[i != null ? i : Math.floor(Math.random() * l.length)], kind || 'stare'); };
})();
