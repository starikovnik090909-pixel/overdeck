// public/fund.js — fund.html: плашка "Сбор" (призовой фонд). Висит на
// экране постоянно — нет show/hide, нет выезда. При росте суммы — плавный
// прогон счётчика от старого значения к новому (около 1 секунды) плюс
// короткий "bump" эффект масштаба, чтобы рост доната был заметен зрителю.
//
// Режим предпросмотра (?preview=1) — как у mvp.js/fact.js: без WS, данные
// приходят через postMessage от админки, но плашка и так всегда видна —
// разница только в том, что в предпросмотре не нужен плавный прогон счётчика
// при каждой правке слайдера (это раздражало бы), поэтому там сумма
// проставляется мгновенно.

(function () {
  // Фоллбэк-цепочки для шрифтов темы — у фирменных Riot-шрифтов свои
  // (Beaufort for LOL -> Cinzel/Marcellus/serif, Spiegel -> Inter/Roboto/
  // sans-serif), остальные — обычный системный фоллбэк.
  const THEME_FONT_FALLBACKS = {
    'Beaufort for LOL': 'Cinzel, Marcellus, serif',
    'Spiegel': 'Inter, Roboto, sans-serif',
    'Cinzel': 'Marcellus, serif',
    'Georgia': 'serif',
    'Rubik': 'system-ui, sans-serif',
    'Inter': 'system-ui, sans-serif',
  };
  function buildFontStack(name) {
    return `'${name}', ${THEME_FONT_FALLBACKS[name] || 'system-ui, sans-serif'}`;
  }
  // Свечение — два слоя (яркое тесное ядро + широкий мягкий ореол), а не
  // одно резкое кольцо: по мотивам референса TearsheetMagic (мягкие,
  // рассеянные светящиеся нити), приближено средствами обычного box-shadow.
  const isPreview = new URLSearchParams(location.search).get('preview') === '1';
  const cardEl = document.getElementById('fundCard');
  const titleEl = document.getElementById('fundTitle');
  const amountEl = document.getElementById('fundAmount');

  let displayedAmount = null; // текущее ПОКАЗЫВАЕМОЕ (уже дошедшее) значение — для прогона счётчика
  let countRaf = null;
  let currency = '₽';

  function formatAmount(n) {
    return Math.round(n).toLocaleString('ru-RU') + ' ' + currency;
  }

  function applyThemeBackgroundLayer(cardEl, settings) {
    const root = document.documentElement.style;
    const url = settings.themeBgImageUrl;
    if (!url) {
      root.setProperty('--theme-bg-image', 'none');
      root.setProperty('--theme-bg-darken', '0');
      const oldHolder = cardEl.querySelector('.theme-bg-video-holder');
      if (oldHolder) { oldHolder.style.display = 'none'; oldHolder.innerHTML = ''; oldHolder.dataset.src = ''; }
      return;
    }
    const opacity = (settings.themeBgImageOpacity != null ? settings.themeBgImageOpacity : 100) / 100;
    const darken = (settings.themeBgImageDarken != null ? settings.themeBgImageDarken : 0) / 100;
    const fit = settings.themeBgImageFit || 'cover';
    root.setProperty('--theme-bg-opacity', opacity);
    root.setProperty('--theme-bg-darken', darken);

    let holder = cardEl.querySelector('.theme-bg-video-holder');
    if (!holder) {
      holder = document.createElement('div');
      holder.className = 'theme-bg-video-holder';
      cardEl.insertBefore(holder, cardEl.firstChild);
    }
    if (/\.(mp4|webm)$/i.test(url)) {
      root.setProperty('--theme-bg-image', 'none');
      if (holder.dataset.src !== url) {
        holder.innerHTML = `<video autoplay muted loop playsinline style="object-fit:${fit === 'stretch' ? 'fill' : fit};"><source src="${url}"></video>`;
        holder.dataset.src = url;
      }
      holder.style.display = 'block';
    } else {
      holder.style.display = 'none';
      holder.innerHTML = '';
      holder.dataset.src = '';
      root.setProperty('--theme-bg-image', `url('${url}')`);
      root.setProperty('--theme-bg-size', fit === 'stretch' ? '100% 100%' : fit);
    }
  }

    /**
   * Считает точки clip-path для скошенных углов — по одному отрезку "вход/выход" на каждый СРЕЗАННЫЙ угол,
   * и одну обычную точку (сам угол) на КАЖДЫЙ обычный. Порядок обхода не важен для формы (полигон одинаков
   * при любой стартовой вершине), поэтому список просто идёт по углам TL→TR→BR→BL.
   */
  function buildChamferPoints(radiusPx, corners) {
    const r = `${radiusPx}px`;
    const rc = `calc(100% - ${r})`;
    const list = [
      { on: corners.topLeft, enter: `0 ${r}`, exit: `${r} 0`, plain: '0 0' },
      { on: corners.topRight, enter: `${rc} 0`, exit: `100% ${r}`, plain: '100% 0' },
      { on: corners.bottomRight, enter: `100% ${rc}`, exit: `${rc} 100%`, plain: '100% 100%' },
      { on: corners.bottomLeft, enter: `${r} 100%`, exit: `0 ${rc}`, plain: '0 100%' },
    ];
    const points = [];
    list.forEach((c) => { if (c.on) { points.push(c.enter, c.exit); } else { points.push(c.plain); } });
    return points.join(', ');
  }


function applySettings(settings) {
    if (!settings) return;
    const r = document.documentElement.style;
    r.setProperty('--fund-card-w', settings.cardWidth + 'px');
    r.setProperty('--fund-card-h', settings.cardHeight + 'px');
    r.setProperty('--fund-title-size', settings.titleFontSize + 'px');
    r.setProperty('--fund-amount-size', settings.amountFontSize + 'px');
    r.setProperty('--fund-padding', settings.padding + 'px');
    r.setProperty('--fund-fill-start', settings.cardFillStart);
    r.setProperty('--fund-fill-end', settings.cardFillEnd);
    r.setProperty('--fund-border-start', settings.cardBorderStart);
    r.setProperty('--fund-border-end', settings.cardBorderEnd);
    r.setProperty('--fund-label-text-color', settings.titleLabelColor);

    // "Тема ивента" — см. подробный комментарий в mvp.js, тот же принцип.
    // cardFillStart/End и cardBorderStart/End у "Сбора" — это уже штатные
    // локальные настройки (см. выше), поэтому цвета тема получает "бесплатно"
    // через них же; здесь добавляем только то, чего раньше не было.
    if (settings.themeTextColor) r.setProperty('--fund-text-color', settings.themeTextColor);
    if (settings.themeLabelColor) r.setProperty('--fund-label-text-color', settings.themeLabelColor);
    if (settings.themeTitleFont) r.setProperty('--fund-title-font', buildFontStack(settings.themeTitleFont));
    if (settings.themeDataFont) r.setProperty('--fund-data-font', buildFontStack(settings.themeDataFont));
    if (settings.themeTitleFontWeight) r.setProperty('--fund-title-weight', settings.themeTitleFontWeight);
    if (settings.themeDataFontWeight) r.setProperty('--fund-data-weight', settings.themeDataFontWeight);
    if (settings.themePanelOpacity != null) r.setProperty('--fund-panel-opacity', settings.themePanelOpacity / 100);
    if (settings.themeBorderRadius != null) r.setProperty('--fund-radius', settings.themeBorderRadius + 'px');
    if (settings.themeBorderWidth != null) r.setProperty('--fund-border-w', settings.themeBorderWidth + 'px');
    if (settings.themeBorderStyle) cardEl.dataset.borderStyle = settings.themeBorderStyle;
    if (settings.themeCornerStyle) cardEl.dataset.cornerStyle = settings.themeCornerStyle;
    if (settings.themeChamferCorners) r.setProperty('--fund-chamfer-points', buildChamferPoints(settings.themeBorderRadius, settings.themeChamferCorners));
    if (settings.themeTextureEnabled != null) {
      r.setProperty('--fund-texture-opacity', settings.themeTextureEnabled ? ((settings.themeTextureIntensity || 50) / 100 * 0.7).toFixed(2) : '0');
      if (settings.themeTextureType) cardEl.dataset.texture = settings.themeTextureType;
    }
    applyThemeBackgroundLayer(cardEl, settings);
  }

  function animateTo(target) {
    cancelAnimationFrame(countRaf);
    const start = displayedAmount == null ? target : displayedAmount;
    const startTs = performance.now();
    const durationMs = 1000;

    function tick(now) {
      const t = Math.min(1, (now - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out — быстрый старт, плавное замедление
      const value = start + (target - start) * eased;
      amountEl.textContent = formatAmount(value);
      if (t < 1) {
        countRaf = requestAnimationFrame(tick);
      } else {
        displayedAmount = target;
        amountEl.textContent = formatAmount(target);
      }
    }
    countRaf = requestAnimationFrame(tick);
  }

  function render(fund) {
    if (!fund) return;
    applySettings(fund.settings);
    currency = fund.currency || '₽';
    titleEl.textContent = fund.title || '';

    if (isPreview || displayedAmount === null) {
      // Предпросмотр — мгновенно, без прогона (иначе каждая правка слайдера
      // запускала бы анимацию счётчика). Первая реальная загрузка страницы —
      // тоже мгновенно, прогон нужен только для ПОСЛЕДУЮЩИХ приростов.
      displayedAmount = fund.amount;
      amountEl.textContent = formatAmount(fund.amount);
      return;
    }

    if (fund.amount !== displayedAmount) {
      animateTo(fund.amount);
      amountEl.classList.remove('fund-bump');
      void amountEl.offsetWidth; // перезапуск CSS-анимации
      amountEl.classList.add('fund-bump');
    }
  }

  if (isPreview) {
    window.addEventListener('message', (evt) => {
      if (evt.data && evt.data.type === 'fund_preview_update') render(evt.data.fund);
    });
    if (window.parent) window.parent.postMessage({ type: 'fund_preview_ready' }, '*');
    return;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=fund`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'fund_data') render(data.fund);
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }
  connect();
})();
