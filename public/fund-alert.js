// public/fund-alert.js — fund-alert.html: алерт "Ник вносит сумму в
// призовой фонд!". Та же схема выезда/уезда, что и у mvp.js/fact.js —
// transform+transition, сдвиг в vw/vh. Очередь показов (чтобы алерты при
// частых донатах не перекрывали друг друга) считается сервером — этот файл
// просто реагирует на visible:true/false, которые приходят по очереди.

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
  const rootEl = document.getElementById('fundAlertRoot');
  const cardEl = document.getElementById('fundAlertCard');
  const textEl = document.getElementById('fundAlertText');

  let currentSide = null;
  let hasRenderedOnce = false;

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
    r.setProperty('--fa-card-w', settings.cardWidth + 'px');
    r.setProperty('--fa-card-h', settings.cardHeight + 'px');
    r.setProperty('--fa-text-size', settings.textFontSize + 'px');
    r.setProperty('--fa-padding', settings.padding + 'px');
    r.setProperty('--fa-anim-duration', settings.animationDurationMs + 'ms');
    r.setProperty('--fa-fill-start', settings.cardFillStart);
    r.setProperty('--fa-fill-end', settings.cardFillEnd);
    r.setProperty('--fa-border-start', settings.cardBorderStart);
    r.setProperty('--fa-border-end', settings.cardBorderEnd);

    // "Тема ивента" — см. подробный комментарий в mvp.js, тот же принцип.
    if (settings.themeTextColor) r.setProperty('--fa-text-color', settings.themeTextColor);
    if (settings.themeTitleFont) r.setProperty('--fa-font', buildFontStack(settings.themeTitleFont));
    if (settings.themeTitleFontWeight != null) r.setProperty('--fa-weight', settings.themeTitleFontWeight);
    if (settings.themePanelOpacity != null) r.setProperty('--fa-panel-opacity', settings.themePanelOpacity / 100);
    if (settings.themeBorderRadius != null) r.setProperty('--fa-radius', settings.themeBorderRadius + 'px');
    if (settings.themeBorderWidth != null) r.setProperty('--fa-border-w', settings.themeBorderWidth + 'px');
    if (settings.themeBorderStyle) rootEl.dataset.borderStyle = settings.themeBorderStyle;
    if (settings.themeCornerStyle) rootEl.dataset.cornerStyle = settings.themeCornerStyle;
    if (settings.themeChamferCorners) r.setProperty('--fa-chamfer-points', buildChamferPoints(settings.themeBorderRadius, settings.themeChamferCorners));
    if (settings.themeTextureEnabled != null) {
      r.setProperty('--fa-texture-opacity', settings.themeTextureEnabled ? ((settings.themeTextureIntensity || 50) / 100 * 0.7).toFixed(2) : '0');
      if (settings.themeTextureType) rootEl.dataset.texture = settings.themeTextureType;
    }
    applyThemeBackgroundLayer(cardEl, settings);

    if (isPreview) return; // предпросмотр не выезжает — сторона роли не играет

    if (settings.slideSide !== currentSide) {
      currentSide = settings.slideSide;
      rootEl.classList.add('fa-no-transition');
      rootEl.dataset.side = currentSide;
      void rootEl.offsetHeight;
      rootEl.classList.remove('fa-no-transition');
    }
  }

  function render(alert) {
    if (!alert) return;
    applySettings(alert.settings);
    textEl.textContent = alert.text || '';

    if (isPreview) return; // предпросмотр: статичный вид, без выезда

    rootEl.classList.toggle('fa-hidden', !alert.visible);

    if (!hasRenderedOnce) {
      hasRenderedOnce = true;
      requestAnimationFrame(() => rootEl.classList.remove('fa-no-transition'));
    }
  }

  if (isPreview) {
    rootEl.classList.add('fa-no-transition');
    rootEl.dataset.side = 'right';
    window.addEventListener('message', (evt) => {
      if (evt.data && evt.data.type === 'fund_alert_preview_update') render(evt.data.alert);
    });
    if (window.parent) window.parent.postMessage({ type: 'fund_alert_preview_ready' }, '*');
    return;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=fundalert`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'fund_alert_data') render(data.alert);
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }

  rootEl.classList.add('fa-hidden', 'fa-no-transition');
  rootEl.dataset.side = 'right';
  currentSide = 'right';

  connect();
})();
