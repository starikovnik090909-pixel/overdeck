// public/donortop.js — Топ донатеров.
// Статичное отображение содержимого (без анимации смены "за стрим"/"за всё
// время" — см. README/память проекта: попытка сделать эту смену через
// animate.css дважды ломала обновление в реальном времени, поэтому она
// убрана совсем). Но перестановка МЕСТ внутри одного топа — плавная, через
// чистый CSS transform/transition без единого слушателя событий: это не тот
// механизм, который ломался, и ни при каких обстоятельствах не может
// заблокировать обновление данных — доиграет анимация или нет, на итоговую
// позицию/данные это не влияет.

(function () {
  const listEl = document.getElementById('donorTopList');
  const labelEl = document.getElementById('donorTopLabel');

  let latest = null;
  let scope = 'session'; // 'session' | 'allTime'
  let switchTimer = null;
  let currentIntervalSec = null;
  let rowElements = new Map(); // username -> DOM-строка, только для ТЕКУЩЕГО scope

  const DEFAULT_SETTINGS = {
    switchIntervalSec: 10,
    circleSize: 40,
    rankNumberColor: '#FFFFFF',
    innerCircleDarken: 45,
    showDividers: true,
    top1Glow: true,
    top1GlowSpeedMs: 2800,
    otherTextColor: '#E0E0E0',
    top1Color: '#FFD700',
    top2Color: '#C0C0C0',
    top3Color: '#CD7F32',
    defaultCircleColor: '#B14846',
  };

  function getSettings() {
    return { ...DEFAULT_SETTINGS, ...((window.widgetSettings && window.widgetSettings.donortop) || {}) };
  }

  function ensureSwitchTimer() {
    const s = getSettings();
    if (currentIntervalSec === s.switchIntervalSec && switchTimer) return;
    currentIntervalSec = s.switchIntervalSec;
    clearInterval(switchTimer);
    switchTimer = setInterval(() => {
      scope = scope === 'session' ? 'allTime' : 'session';
      rowElements = new Map(); // другой топ — начинаем с чистого листа, старые позиции ни при чём
      listEl.innerHTML = '';
      draw();
    }, Math.max(3, s.switchIntervalSec) * 1000);
  }

  function circleColorFor(rank, s) {
    if (rank === 1) return s.top1Color;
    if (rank === 2) return s.top2Color;
    if (rank === 3) return s.top3Color;
    return s.defaultCircleColor;
  }

  const INNER_RATIO = 0.66; // диаметр внутреннего (тёмного) кружка относительно внешнего

  /** Ник приходит из платёжных систем и может содержать что угодно — в разметку вставляем только экранированным (раньше вставлялся как есть). */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Затемняет цвет #RRGGBB на pct процентов (смешивание с чёрным). Считаем в JS, а не через CSS color-mix: он не везде есть в встроенном браузере OBS. */
  function darken(hex, pct) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#000000';
    const n = parseInt(m[1], 16);
    const k = 1 - Math.max(0, Math.min(100, pct)) / 100;
    const ch = (v) => Math.round(v * k).toString(16).padStart(2, '0');
    return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
  }

  function fillRow(el, donor, rank, s) {
    const circleColor = circleColorFor(rank, s);
    const textColor = rank <= 3 ? circleColor : s.otherTextColor;
    const glow = rank === 1 && s.top1Glow;
    const glowMs = Math.max(500, s.top1GlowSpeedMs);

    // Подпись содержимого строки: если ничего из отображаемого не изменилось (а снапшот приходит раз в 1–5 секунд и почти всегда
    // не меняет топ), строку не пересобираем. Иначе каждый снапшот пересоздавал бы кружок, а вместе с ним — и CSS-анимацию мерцания
    // топ-1 (она начиналась бы заново, свечение дёргалось бы).
    const sig = [rank, donor.username, Math.round(donor.amount), circleColor, textColor, s.circleSize, s.innerCircleDarken, s.rankNumberColor, glow, glowMs].join('|');
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;

    const size = s.circleSize;
    const innerSize = Math.round(size * INNER_RATIO);
    // Если строка всё-таки пересобирается (изменилась сумма и т.п.), мерцание продолжается с того же места: фаза берётся от общих
    // часов (Date.now() по модулю периода) через отрицательную задержку анимации, а не с нуля.
    const glowStyle = glow ? `--glow-color:${circleColor};--glow-ms:${glowMs}ms;--glow-delay:-${Date.now() % glowMs}ms;` : '';
    el.innerHTML = `
      <div class="donor-circle${glow ? ' donor-circle-glow' : ''}" style="width:${size}px;height:${size}px;background:${circleColor};${glowStyle}">
        <div class="donor-circle-inner" style="width:${innerSize}px;height:${innerSize}px;background:${darken(circleColor, s.innerCircleDarken)};color:${s.rankNumberColor};font-size:${Math.round(size * 0.4)}px;">${rank}</div>
      </div>
      <div class="donor-name" style="color:${textColor};">${escapeHtml(donor.username)}</div>
      <div class="donor-amount" style="color:${textColor};">${Math.round(donor.amount)}</div>
    `;
  }

  function draw() {
    if (!latest) return;
    const s = getSettings();
    const tops = latest.donorTops || { session: [], allTime: [] };
    const list = (scope === 'session' ? tops.session : tops.allTime) || [];

    labelEl.textContent = scope === 'session' ? '(за стрим)' : '(за всё время)';
    listEl.classList.toggle('donor-dividers', !!s.showDividers); // тонкие линии между местами — включаются классом, см. style.css

    // FIRST — запоминаем текущие позиции существующих строк
    const firstRects = new Map();
    rowElements.forEach((el, username) => { firstRects.set(username, el.getBoundingClientRect()); });

    const usedUsernames = new Set();
    const orderedEls = list.map((donor, i) => {
      const rank = i + 1;
      let el = rowElements.get(donor.username);
      if (!el) {
        el = document.createElement('div');
        el.className = 'donor-row';
        el.dataset.username = donor.username;
        rowElements.set(donor.username, el);
      }
      fillRow(el, donor, rank, s);
      usedUsernames.add(donor.username);
      return el;
    });

    // убираем тех, кого больше нет в топе (удалили вручную, выпал из топ-10 и т.п.)
    rowElements.forEach((el, username) => {
      if (!usedUsernames.has(username)) {
        el.remove();
        rowElements.delete(username);
      }
    });

    if (list.length === 0) { listEl.innerHTML = ''; return; }

    // LAST — расставляем DOM-узлы в нужном порядке (appendChild переносит уже существующие)
    orderedEls.forEach((el) => listEl.appendChild(el));

    // INVERT + PLAY — считаем разницу и анимируем через transform/transition
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

  function render(data) {
    latest = data;
    ensureSwitchTimer();
    draw(); // без всяких условий/флагов — каждый снапшот сразу применяется
  }

  window.DonorTopModule = { render };
})();
