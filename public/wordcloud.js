// public/wordcloud.js — виджет «Облако слов» в виде плаката «Слово дня».
// Сверху — самое частое слово чата крупно (подгоняется под ширину блока), число упоминаний и темп «▲ +N за минуту»;
// ниже — список следующих слов: чем дальше, тем мельче, справа полоска доли от лидера и число.
// Слова при обгоне плавно меняются местами, лидер при смене «выезжает» заново.
// Цвета, шрифты, скругления и регистр берутся из темы и выбранного стиля оформления (CSS-переменные в style.css / overlay-styles.css),
// размеры — из размера блока: число строк списка и шрифты считаются по высоте и ширине, при ресайзе пересчитываются.
// Данные: wordCloud = [{ word, count }], уже отсортирован по count.

(function () {
  const host = document.getElementById('wordcloudPoster');
  if (!host) { window.WordcloudModule = { render() {} }; return; }

  host.innerHTML =
    '<div class="wc-hero">' +
      '<div class="wc-kicker">слово дня</div>' +
      '<div class="wc-big"></div>' +
      '<div class="wc-meta"><b class="wc-count"></b><span class="wc-unit">раз в чате</span><span class="wc-rate"></span></div>' +
    '</div>' +
    '<div class="wc-stack"></div>';
  const heroEl = host.querySelector('.wc-hero');
  const kickEl = host.querySelector('.wc-kicker');
  const bigEl = host.querySelector('.wc-big');
  const countEl = host.querySelector('.wc-count');
  const unitEl = host.querySelector('.wc-unit');
  const rateEl = host.querySelector('.wc-rate');
  const stackEl = host.querySelector('.wc-stack');

  const MAX_ROWS = 8;
  const HIST_MS = 70000;          // окно для темпа «за минуту»
  const rows = new Map();         // слово -> { el, ... }
  const hist = new Map();         // слово -> [[t, count], ...]
  let list = [];                  // последний wordCloud
  let heroWord = null, lastHeroCount = null;
  let layout = { rowH: 0, n: 0, w: 0, h: 0 };

  const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');

  function trackHistory(now) {
    const keep = new Set();
    list.slice(0, MAX_ROWS + 2).forEach((e) => {
      keep.add(e.word);
      let a = hist.get(e.word);
      if (!a) { a = []; hist.set(e.word, a); }
      const last = a[a.length - 1];
      if (!last || now - last[0] > 900) a.push([now, e.count]);
      while (a.length > 2 && now - a[0][0] > HIST_MS) a.shift();
    });
    hist.forEach((_, k) => { if (!keep.has(k)) hist.delete(k); });
  }

  /** Темп «упоминаний за минуту» по накопленной истории; пока данных мало (<8 с) — пусто. */
  function ratePerMinute(word, count) {
    const a = hist.get(word);
    if (!a || a.length < 2) return null;
    const first = a[0], dt = (a[a.length - 1][0] - first[0]) / 1000;
    if (dt < 8) return null;
    const d = count - first[1];
    return d < 0 ? null : Math.round(d / dt * 60);
  }

  /** Подбирает размеры под текущий размер блока: высота героя, число строк списка, шрифты. */
  function computeLayout() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    const k = Math.max(0.65, Math.min(1.5, Math.min(w / 540, h / 380)));
    const heroH = Math.max(70 * k, Math.min(h * 0.42, 240 * k));
    const avail = h - heroH - 16 * k;
    const minRow = 30 * k;
    const n = Math.max(0, Math.min(MAX_ROWS, Math.floor(avail / minRow)));
    layout = { w, h, k, heroH, n, rowH: n ? avail / n : 0 };
    heroEl.style.height = heroH + 'px';
    kickEl.style.display = heroH < 95 ? 'none' : '';
    kickEl.style.fontSize = Math.round(11 * k + 1) + 'px';
    countEl.style.fontSize = Math.round(19 * k) + 'px';
    unitEl.style.fontSize = rateEl.style.fontSize = Math.round(12.5 * k) + 'px';
    stackEl.style.height = Math.max(0, avail) + 'px';
    stackEl.style.marginTop = (16 * k) + 'px';
    stackEl.style.display = n ? '' : 'none';
    host.classList.toggle('wc-narrow', w < 330);
    return true;
  }

  function fitHero(text) {
    const maxW = layout.w - 4;
    const maxH = layout.heroH - (kickEl.offsetHeight + (countEl.parentElement.offsetHeight || 24) + 14 * layout.k);
    let fs = Math.max(22, Math.min(maxH / 1.15, 150));
    bigEl.style.fontSize = fs + 'px';
    let guard = 0;
    while (bigEl.scrollWidth > maxW && fs > 18 && guard++ < 40) { fs = Math.max(18, fs * 0.93 - 1); bigEl.style.fontSize = fs + 'px'; }
  }

  function setHero(entry) {
    if (!entry) { heroWord = null; bigEl.textContent = ''; countEl.textContent = ''; rateEl.textContent = ''; return; }
    const changed = entry.word !== heroWord;
    if (changed) {
      heroWord = entry.word; lastHeroCount = null;
      bigEl.textContent = entry.word;
      fitHero(entry.word);
      if (bigEl.animate) bigEl.animate([{ transform: 'scale(0.86)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1)' });
    }
    countEl.textContent = fmt(entry.count);
    if (lastHeroCount !== null && entry.count > lastHeroCount && countEl.animate) {
      countEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
    }
    lastHeroCount = entry.count;
    const r = ratePerMinute(entry.word, entry.count);
    rateEl.textContent = r === null || r <= 0 ? '' : `▲ +${fmt(r)} за минуту`;
  }

  function setStack() {
    const items = list.slice(1, 1 + layout.n);
    const max = items.length ? items[0].count || 1 : 1;
    const seen = new Set();
    items.forEach((e, i) => {
      seen.add(e.word);
      let r = rows.get(e.word);
      if (!r) {
        const el = document.createElement('div');
        el.className = 'wc-row';
        el.innerHTML = '<span class="wc-n"></span><span class="wc-w"></span><span class="wc-ln"><i></i></span><span class="wc-c"></span>';
        el.style.top = (i * layout.rowH) + 'px';
        el.style.opacity = '0';
        stackEl.appendChild(el);
        r = { el, n: el.children[0], w: el.children[1], fill: el.children[2].firstChild, c: el.children[3] };
        rows.set(e.word, r);
        r.w.textContent = e.word;
        requestAnimationFrame(() => { r.el.style.opacity = ''; });
      }
      const fs = Math.max(12, Math.min(layout.rowH * 0.66, 38 * layout.k) * (1 - i * 0.07));
      r.el.style.height = layout.rowH + 'px';
      r.el.style.top = (i * layout.rowH) + 'px';
      r.el.style.opacity = String(Math.max(0.5, 1 - i * 0.07));
      r.n.textContent = i + 2;
      r.w.style.fontSize = fs + 'px';
      r.fill.style.width = Math.max(3, e.count / max * 100) + '%';
      r.c.textContent = fmt(e.count);
      r.c.style.fontSize = Math.max(11, Math.min(15 * layout.k, layout.rowH * 0.5)) + 'px';
    });
    rows.forEach((r, word) => {
      if (!seen.has(word)) { rows.delete(word); r.el.style.opacity = '0'; setTimeout(() => r.el.remove(), 450); }
    });
  }

  function apply() {
    if (!computeLayout()) return;
    setHero(list[0]);
    setStack();
  }

  function render(wordCloud) {
    list = (wordCloud || []).filter((e) => e && e.word).slice();
    trackHistory(performance.now());
    apply();
  }

  new ResizeObserver(() => { if (list.length) { heroWord = null; apply(); } else computeLayout(); }).observe(host);

  window.WordcloudModule = { render };
})();
