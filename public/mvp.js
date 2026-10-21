// public/mvp.js — mvp.html: горизонтальная панель "MVP матча" + надпись
// "MVP" + лучи/прожекторы позади панели. Появление/исчезание панели —
// выезд/уезд сбоку экрана через CSS transform+transition (не display,
// это нельзя анимировать). Панель всегда остаётся в DOM; когда
// visible=false, она просто сдвинута за пределы окна.
//
// Лучи синхронизированы с циклом выезд→показ→уезд СВОИМИ таймерами на
// клиенте (setTimeout), а не событиями от сервера — сервер знает только
// "видимо"/"не видимо", а не "когда именно начнётся уезд". Момент показа
// (получение visible:true) и известная длительность показа (displaySeconds)
// достаточно, чтобы точно посчитать: когда закончится выезд → тогда, спустя
// задержку, зажечь лучи; и когда должен начаться уезд → чуть раньше начать
// гасить лучи, чтобы к этому моменту они уже погасли.

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
  const rootEl = document.getElementById('mvpRoot');
  const cardEl = document.getElementById('mvpCard');
  const labelEl = document.getElementById('mvpLabel');
  const raysEl = document.getElementById('mvpRays');

  let currentSide = null; // чтобы не дёргать data-side/transition без надобности
  let hasRenderedOnce = false;
  let wasVisible = false; // чтобы ловить именно ПЕРЕХОД скрыто->видимо, а не повтор на каждое обновление
  let rayInTimer = null;
  let rayOutTimer = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /**
   * "Тема ивента" — фон плашки. Картинка/GIF — через CSS background-image
   * (--theme-bg-image, унаследуется вниз до .mvp-card::before, отдельным
   * слоем под текстом — см. mvp.css). Видео (.mp4/.webm) CSS background-image
   * проигрывать не умеет — вставляем настоящий <video> первым ребёнком
   * карточки, тоже с отрицательным z-index в CSS. Функция сама решает, какой
   * из двух путей нужен, по расширению файла.
   */
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
    r.setProperty('--mvp-card-w', settings.cardWidth + 'px');
    r.setProperty('--mvp-card-h', settings.cardHeight + 'px');
    r.setProperty('--mvp-photo-size', settings.photoSize + 'px');
    r.setProperty('--mvp-nick-size', settings.nickFontSize + 'px');
    r.setProperty('--mvp-data-size', settings.dataFontSize + 'px');
    r.setProperty('--mvp-label-size', settings.labelFontSize + 'px');
    r.setProperty('--mvp-label-color', settings.labelColor);
    r.setProperty('--mvp-label-x', settings.labelPositionX + '%');
    r.setProperty('--mvp-label-y', settings.labelPositionY + '%');
    r.setProperty('--mvp-anim-duration', settings.animationDurationMs + 'ms');
    labelEl.textContent = settings.labelText || '';

    // Лучи: интенсивность/скорость — проценты 0-100 с админки, переводим в
    // реальные opacity/длительность вращения. Длительность самого перехода
    // прозрачности (fade-in и fade-out) — из raysFadeOutLeadMs (см. header).
    r.setProperty('--mvp-rays-color', settings.raysColor);
    r.setProperty('--mvp-label-text-color', settings.statLabelColor);
    r.setProperty('--mvp-rays-intensity', (0.05 + (settings.raysIntensity / 100) * 0.30).toFixed(3));
    r.setProperty('--mvp-rays-duration', (40 - (settings.raysSpeed / 100) * 35) + 's');
    r.setProperty('--mvp-rays-fade-ms', settings.raysFadeOutLeadMs + 'ms');

    // "Тема ивента" — сервер подмешивает эти поля в settings ТОЛЬКО если у
    // MVP стоит галочка применения темы (см. eventTheme.js на сервере);
    // если их нет — ничего не делаем, CSS-переменные остаются на своих
    // значениях по умолчанию/из локальных настроек MVP, вид не меняется.
    if (settings.cardFillStart) r.setProperty('--mvp-fill-start', settings.cardFillStart);
    if (settings.cardFillEnd) r.setProperty('--mvp-fill-end', settings.cardFillEnd);
    if (settings.cardBorderStart) r.setProperty('--mvp-border-start', settings.cardBorderStart);
    if (settings.cardBorderEnd) r.setProperty('--mvp-border-end', settings.cardBorderEnd);
    if (settings.themeTextColor) r.setProperty('--mvp-text-color', settings.themeTextColor);
    if (settings.themeLabelColor) r.setProperty('--mvp-label-text-color', settings.themeLabelColor);
    if (settings.themeTitleFont) r.setProperty('--mvp-title-font', buildFontStack(settings.themeTitleFont));
    if (settings.themeDataFont) r.setProperty('--mvp-data-font', buildFontStack(settings.themeDataFont));
    if (settings.themeTitleFontWeight) r.setProperty('--mvp-title-weight', settings.themeTitleFontWeight);
    if (settings.themeDataFontWeight) r.setProperty('--mvp-data-weight', settings.themeDataFontWeight);
    if (settings.themePanelOpacity != null) r.setProperty('--mvp-panel-opacity', settings.themePanelOpacity / 100);
    if (settings.themeBorderRadius != null) r.setProperty('--mvp-radius', settings.themeBorderRadius + 'px');
    if (settings.themeBorderWidth != null) r.setProperty('--mvp-border-w', settings.themeBorderWidth + 'px');
    if (settings.themeBorderStyle) rootEl.dataset.borderStyle = settings.themeBorderStyle;
    if (settings.themeCornerStyle) rootEl.dataset.cornerStyle = settings.themeCornerStyle;
    if (settings.themeChamferCorners) r.setProperty('--mvp-chamfer-points', buildChamferPoints(settings.themeBorderRadius, settings.themeChamferCorners));
    if (settings.themeTextureEnabled != null) {
      r.setProperty('--mvp-texture-opacity', settings.themeTextureEnabled ? ((settings.themeTextureIntensity || 50) / 100 * 0.7).toFixed(2) : '0');
      if (settings.themeTextureType) rootEl.dataset.texture = settings.themeTextureType;
    }
    applyThemeBackgroundLayer(cardEl, settings);

    // Смена стороны выезда — применяем мгновенно, без transition (иначе при
    // смене стороны, пока панель скрыта, она бы "проехала по диагонали").
    if (isPreview) return; // в предпросмотре панель не выезжает — сторона роли не играет
    if (settings.slideSide !== currentSide) {
      currentSide = settings.slideSide;
      rootEl.classList.add('mvp-no-transition');
      rootEl.dataset.side = currentSide;
      void rootEl.offsetHeight; // форсируем применение стиля до снятия no-transition
      rootEl.classList.remove('mvp-no-transition');
    }
  }

  function clearRayTimers() {
    clearTimeout(rayInTimer);
    clearTimeout(rayOutTimer);
    rayInTimer = null;
    rayOutTimer = null;
  }

  /** Планирует зажигание/гашение лучей относительно момента, когда панель стала видимой. */
  function scheduleRays(settings) {
    clearRayTimers();
    if (!settings.raysEnabled) return;

    const slideMs = settings.animationDurationMs;
    const displayMs = settings.displaySeconds * 1000;
    const fadeInDelay = slideMs + settings.raysFadeInDelayMs; // ждём конца выезда + доп. задержку
    const fadeOutStart = Math.max(fadeInDelay, displayMs - settings.raysFadeOutLeadMs); // не раньше, чем зажглись

    rayInTimer = setTimeout(() => raysEl.classList.add('mvp-rays-on'), fadeInDelay);
    rayOutTimer = setTimeout(() => raysEl.classList.remove('mvp-rays-on'), fadeOutStart);
  }

  function render(mvp) {
    if (!mvp) return;
    applySettings(mvp.settings);

    const heroRole = [mvp.hero, mvp.role].filter(Boolean).join(' · ');
    const extraItems = [];
    if (mvp.settings.showCreepScore) {
      extraItems.push(`<div class="mvp-stats-item"><span class="mvp-stat-label">Крипы</span><span>${mvp.creepScore}</span></div>`);
    }
    if (mvp.damage) extraItems.push(`<div class="mvp-stats-item"><span class="mvp-stat-label">Урон</span><span>${mvp.damage}</span></div>`);
    if (mvp.gold) extraItems.push(`<div class="mvp-stats-item"><span class="mvp-stat-label">Золото</span><span>${mvp.gold}</span></div>`);

    // Контент обновляем всегда, даже пока панель скрыта за экраном — чтобы
    // к моменту показа она уже была с актуальными данными.
    cardEl.innerHTML = `
      <div class="mvp-badge">👑</div>
      <div class="mvp-photo">${mvp.photoUrl ? `<img src="${mvp.photoUrl}" alt="">` : ''}</div>
      <div class="mvp-info">
        <div class="mvp-nick">${escapeHtml(mvp.nickname)}</div>
        <div class="mvp-hero-role">${escapeHtml(heroRole)}</div>
        <div class="mvp-stats">
          <div class="mvp-stats-item mvp-kda-main"><span class="mvp-stat-label">KDA</span><span>${mvp.kills}/${mvp.deaths}/${mvp.assists}</span></div>
          ${extraItems.join('')}
        </div>
      </div>
    `;

    rootEl.classList.toggle('mvp-hidden', !mvp.visible);

    if (isPreview) {
      // Лучи можно показать статично (просто вкл/выкл по тумблеру) — их
      // собственное вращение/пульсация не являются "анимацией выезда",
      // так что не нарушают требование "предпросмотр без анимации".
      raysEl.classList.toggle('mvp-rays-on', !!mvp.settings.raysEnabled);
      return;
    }

    // Лучи планируются только на РЕАЛЬНЫЙ переход скрыто->видимо — иначе
    // правка любой настройки во время показа перезапускала бы весь цикл
    // зажигания/гашения заново.
    if (mvp.visible && !wasVisible) {
      scheduleRays(mvp.settings);
    } else if (!mvp.visible && wasVisible) {
      // Скрыли раньше срока (кнопка "Скрыть") — лучи гасим сразу, без
      // отдельного плавного перехода (сама панель тоже уезжает немедленно).
      clearRayTimers();
      raysEl.classList.remove('mvp-rays-on');
    }
    wasVisible = mvp.visible;

    if (!hasRenderedOnce) {
      hasRenderedOnce = true;
      // Первая реальная отрисовка — снимаем блокировку transition (могли
      // поставить её при загрузке страницы, ещё не зная реальную сторону).
      requestAnimationFrame(() => rootEl.classList.remove('mvp-no-transition'));
    }
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=mvp`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'mvp_data') render(data.mvp);
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }

  if (isPreview) {
    // Предпросмотр в админке: без WS, без выезда/лучей — статичный вид,
    // обновляется по postMessage от родительской страницы (форма настроек).
    rootEl.classList.add('mvp-no-transition');
    rootEl.dataset.side = 'right';
    window.addEventListener('message', (evt) => {
      if (evt.data && evt.data.type === 'mvp_preview_update') render(evt.data.mvp);
    });
    if (window.parent) window.parent.postMessage({ type: 'mvp_preview_ready' }, '*');
    return;
  }

  // Пока не пришли реальные данные — панель точно должна быть скрыта (иначе
  // между загрузкой страницы и первым сообщением мелькнёт пустая рамка
  // ровно в центре, до того как встанет на сторону выезда).
  rootEl.classList.add('mvp-hidden', 'mvp-no-transition');
  rootEl.dataset.side = 'right';
  currentSide = 'right';

  connect();
})();
