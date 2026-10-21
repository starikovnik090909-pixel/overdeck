// public/fact.js — fact.html: "Факт / Инфо-панель". Появление/исчезание —
// выезд/уезд сбоку экрана (тот же приём, что и у mvp.js — transform+
// transition, без display, сдвиг в vw/vh). Заполнение — только в админке
// (вкладка "Ивент"), обновляется в реальном времени через WebSocket.
//
// Режим предпросмотра (?preview=1): используется админкой внутри <iframe>,
// чтобы показать статичный вид панели с текущими настройками БЕЗ реального
// WebSocket-подключения и БЕЗ анимации выезда — просто мгновенно "на месте"
// с обновлением по postMessage от родительской страницы. Один и тот же файл
// обслуживает и реальный OBS-виджет, и предпросмотр — переключение только
// по URL-параметру, вся разметка/CSS общие, поэтому предпросмотр гарантированно
// выглядит так же, как в OBS.

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
  const rootEl = document.getElementById('factRoot');
  const cardEl = document.getElementById('factCard');

  let currentSide = null;
  let hasRenderedOnce = false;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
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
    r.setProperty('--fact-card-w', settings.cardWidth + 'px');
    r.setProperty('--fact-card-h', settings.cardHeight + 'px');
    r.setProperty('--fact-title-size', settings.titleFontSize + 'px');
    r.setProperty('--fact-text-size', settings.textFontSize + 'px');
    r.setProperty('--fact-padding', settings.padding + 'px');
    r.setProperty('--fact-anim-duration', settings.animationDurationMs + 'ms');

    // "Тема ивента" — см. подробный комментарий в mvp.js, тот же принцип:
    // поля присутствуют только когда у Факта стоит галочка применения темы.
    if (settings.cardFillStart) r.setProperty('--fact-fill-start', settings.cardFillStart);
    if (settings.cardFillEnd) r.setProperty('--fact-fill-end', settings.cardFillEnd);
    if (settings.cardBorderStart) r.setProperty('--fact-border-start', settings.cardBorderStart);
    if (settings.cardBorderEnd) r.setProperty('--fact-border-end', settings.cardBorderEnd);
    if (settings.themeTextColor) {
      r.setProperty('--fact-title-color', settings.themeTextColor);
      r.setProperty('--fact-text-color', settings.themeTextColor);
    }
    if (settings.themeTitleFont) r.setProperty('--fact-title-font', buildFontStack(settings.themeTitleFont));
    if (settings.themeDataFont) r.setProperty('--fact-data-font', buildFontStack(settings.themeDataFont));
    if (settings.themeBorderRadius != null) r.setProperty('--fact-radius', settings.themeBorderRadius + 'px');
    if (settings.themeBorderWidth != null) r.setProperty('--fact-border-w', settings.themeBorderWidth + 'px');
    if (settings.themeBorderStyle) rootEl.dataset.borderStyle = settings.themeBorderStyle;
    if (settings.themeCornerStyle) rootEl.dataset.cornerStyle = settings.themeCornerStyle;
    if (settings.themeChamferCorners) r.setProperty('--fact-chamfer-points', buildChamferPoints(settings.themeBorderRadius, settings.themeChamferCorners));
    if (settings.themeTextureEnabled != null) {
      r.setProperty('--fact-texture-opacity', settings.themeTextureEnabled ? ((settings.themeTextureIntensity || 50) / 100 * 0.7).toFixed(2) : '0');
      if (settings.themeTextureType) rootEl.dataset.texture = settings.themeTextureType;
    }
    applyThemeBackgroundLayer(cardEl, settings);

    if (isPreview) return; // предпросмотр не выезжает — сторона не нужна

    if (settings.slideSide !== currentSide) {
      currentSide = settings.slideSide;
      rootEl.classList.add('fact-no-transition');
      rootEl.dataset.side = currentSide;
      void rootEl.offsetHeight;
      rootEl.classList.remove('fact-no-transition');
    }
  }

  function render(fact) {
    if (!fact) return;
    applySettings(fact.settings);

    cardEl.innerHTML = `
      <div class="fact-title">${escapeHtml(fact.title)}</div>
      <div class="fact-text">${escapeHtml(fact.text)}</div>
    `;

    if (isPreview) return; // в предпросмотре панель всегда статично "на месте"

    rootEl.classList.toggle('fact-hidden', !fact.visible);

    if (!hasRenderedOnce) {
      hasRenderedOnce = true;
      requestAnimationFrame(() => rootEl.classList.remove('fact-no-transition'));
    }
  }

  if (isPreview) {
    // Предпросмотр: без WS, без выезда — панель всегда видна "на месте",
    // сторона выезда роли не играет (в реальном OBS-виджете играет).
    rootEl.classList.add('fact-no-transition');
    window.addEventListener('message', (evt) => {
      if (evt.data && evt.data.type === 'fact_preview_update') render(evt.data.fact);
    });
    // Сообщаем родителю, что готовы принимать данные (на случай если он
    // отправил первое сообщение до того, как этот скрипт успел подписаться).
    if (window.parent) window.parent.postMessage({ type: 'fact_preview_ready' }, '*');
    return;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=fact`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'fact_data') render(data.fact);
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }

  rootEl.classList.add('fact-hidden', 'fact-no-transition');
  rootEl.dataset.side = 'right';
  currentSide = 'right';

  connect();
})();
