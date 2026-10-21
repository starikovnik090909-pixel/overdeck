// public/team-panel.js — team-left.html / team-right.html.
// 5 карточек игроков (фото + ник/роль + "о себе"); логотип команды — один
// свободно позиционируемый слой на каждой карточке (поверх всего, без
// подложки); название команды — отдельной строкой над рядом карточек,
// зеркально. Чисто отображение (редактирование — только в админке, вкладка
// "Ивент"), обновляется в реальном времени через WebSocket. window.TEAM_SIDE
// ('left' | 'right') задаётся в самой HTML-странице перед подключением
// этого файла.

(function () {
  const side = window.TEAM_SIDE === 'right' ? 'right' : 'left';
  const root = document.getElementById('teamPanel');
  root.classList.add(side === 'right' ? 'side-right' : 'side-left');

  // Фоллбэк-цепочки для шрифтов темы — те же, что и у остальных виджетов.
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
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
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
    r.setProperty('--tp-card-w', settings.cardWidth + 'px');
    r.setProperty('--tp-card-h', settings.cardHeight + 'px');
    r.setProperty('--tp-card-gap', settings.cardGap + 'px');
    root.classList.toggle('layout-vertical', !!settings.verticalLayout);
    r.setProperty('--tp-logo-size', settings.logoSize + 'px');
    r.setProperty('--tp-logo-x', settings.logoPositionX + '%');
    r.setProperty('--tp-logo-y', settings.logoPositionY + '%');
    r.setProperty('--tp-name-size', settings.nameFontSize + 'px');
    r.setProperty('--tp-nick-size', settings.nickFontSize + 'px');
    r.setProperty('--tp-role-size', settings.roleFontSize + 'px');
    r.setProperty('--tp-about-label-size', settings.aboutLabelFontSize + 'px');
    r.setProperty('--tp-about-size', settings.aboutFontSize + 'px');
    // Свой шрифт панели (nameFont/bodyFont) — базовый; "Тема ивента" (themeTitleFont/themeDataFont, ниже),
    // если включена для "Карточек команд", перекрывает его — как и раньше для остальных полей темы.
    r.setProperty('--tp-title-font', buildFontStack(settings.nameFont || 'Inter'));
    r.setProperty('--tp-data-font', buildFontStack(settings.bodyFont || 'Inter'));
    r.setProperty('--tp-fill-start', settings.cardFillStart);
    r.setProperty('--tp-fill-end', settings.cardFillEnd);
    r.setProperty('--tp-border-start', settings.cardBorderStart);
    r.setProperty('--tp-border-end', settings.cardBorderEnd);
    r.setProperty('--tp-label-text-color', settings.labelTextColor);

    // "Тема ивента" — поля присутствуют только если у "Карточек команд"
    // стоит галочка применения (см. подробный комментарий в mvp.js).
    if (settings.themeTextColor) r.setProperty('--tp-text-color', settings.themeTextColor);
    if (settings.themeLabelColor) r.setProperty('--tp-label-text-color', settings.themeLabelColor);
    if (settings.themeTitleFont) r.setProperty('--tp-title-font', buildFontStack(settings.themeTitleFont));
    if (settings.themeDataFont) r.setProperty('--tp-data-font', buildFontStack(settings.themeDataFont));
    if (settings.themeTitleFontWeight) r.setProperty('--tp-title-weight', settings.themeTitleFontWeight);
    if (settings.themeDataFontWeight) r.setProperty('--tp-data-weight', settings.themeDataFontWeight);
    if (settings.themeBorderRadius != null) r.setProperty('--tp-radius', settings.themeBorderRadius + 'px');
    if (settings.themeBorderWidth != null) r.setProperty('--tp-border-w', settings.themeBorderWidth + 'px');
    if (settings.themeBorderStyle) root.dataset.borderStyle = settings.themeBorderStyle;
    if (settings.themeCornerStyle) root.dataset.cornerStyle = settings.themeCornerStyle;
    if (settings.themeChamferCorners) r.setProperty('--tp-chamfer-points', buildChamferPoints(settings.themeBorderRadius, settings.themeChamferCorners));
    if (settings.themeTextureEnabled != null) {
      r.setProperty('--tp-texture-opacity', settings.themeTextureEnabled ? ((settings.themeTextureIntensity || 50) / 100 * 0.7).toFixed(2) : '0');
      if (settings.themeTextureType) root.dataset.texture = settings.themeTextureType;
    }
    if (settings.themePanelOpacity != null) r.setProperty('--tp-panel-opacity', settings.themePanelOpacity / 100);
    lastThemeSettings = settings;
    applyThemeBackgroundVars(settings);
  }

  /**
   * "Тема ивента" — фон плашки, часть 1: CSS-переменные (безопасно вызывать
   * в любой момент — cascade вниз по DOM, картам-карточкам физически
   * существовать необязательно). Видео — отдельно, см.
   * applyThemeBackgroundVideoToCards(): карточки этой страницы каждый раз
   * пересоздаются через innerHTML в render() ПОСЛЕ applySettings(), так что
   * вставлять <video> внутрь них нужно уже после этого пересоздания, иначе
   * innerHTML тут же уничтожит только что вставленный элемент.
   */
  let lastThemeSettings = null;
  function applyThemeBackgroundVars(settings) {
    const root = document.documentElement.style;
    const url = settings.themeBgImageUrl;
    if (!url) {
      root.setProperty('--theme-bg-image', 'none');
      root.setProperty('--theme-bg-darken', '0');
      return;
    }
    const opacity = (settings.themeBgImageOpacity != null ? settings.themeBgImageOpacity : 100) / 100;
    const darken = (settings.themeBgImageDarken != null ? settings.themeBgImageDarken : 0) / 100;
    const fit = settings.themeBgImageFit || 'cover';
    root.setProperty('--theme-bg-opacity', opacity);
    root.setProperty('--theme-bg-darken', darken);
    if (/\.(mp4|webm)$/i.test(url)) {
      root.setProperty('--theme-bg-image', 'none'); // видео идёт отдельным <video>, не через CSS
    } else {
      root.setProperty('--theme-bg-image', `url('${url}')`);
      root.setProperty('--theme-bg-size', fit === 'stretch' ? '100% 100%' : fit);
    }
  }

  /** Часть 2: вставляет/обновляет <video> в КАЖДОЙ .tp-card — вызывается после render(), когда карточки уже точно в DOM. */
  function applyThemeBackgroundVideoToCards() {
    const settings = lastThemeSettings;
    const url = settings && settings.themeBgImageUrl;
    if (!url || !/\.(mp4|webm)$/i.test(url)) return; // не видео (картинка идёт через CSS, applyThemeBackgroundVars уже отработала) или фона нет вообще
    const fit = settings.themeBgImageFit || 'cover';
    root.querySelectorAll('.tp-card').forEach((cardEl) => {
      let holder = cardEl.querySelector('.theme-bg-video-holder');
      if (!holder) {
        holder = document.createElement('div');
        holder.className = 'theme-bg-video-holder';
        cardEl.insertBefore(holder, cardEl.firstChild);
      }
      if (holder.dataset.src !== url) {
        holder.innerHTML = `<video autoplay muted loop playsinline style="object-fit:${fit === 'stretch' ? 'fill' : fit};"><source src="${url}"></video>`;
        holder.dataset.src = url;
      }
      holder.style.display = 'block';
    });
  }

  function buildCard(player, team) {
    // размер/положение логотипа этой команды (если заданы); иначе — общие настройки через CSS-переменные
    const ll = team.logoLayout;
    const logoStyle = ll ? ` style="left:${Number(ll.x)}%;top:${Number(ll.y)}%;width:${Number(ll.size)}px;height:${Number(ll.size)}px;"` : '';
    const logoHtml = team.logoUrl ? `<div class="tp-logo"${logoStyle}><img src="${team.logoUrl}" alt=""></div>` : '';
    const aboutHtml = player.about
      ? `<div class="tp-about-label">О игроке</div><div class="tp-about-text">${escapeHtml(player.about)}</div>`
      : '';
    return `
      <div class="tp-card">
        <div class="tp-photo">${player.photoUrl ? `<img src="${player.photoUrl}" alt="">` : ''}</div>
        <div class="tp-player-info">
          <div class="tp-nick">${escapeHtml(player.nickname)}</div>
          <div class="tp-role">${escapeHtml(player.role)}</div>
        </div>
        <div class="tp-about">${aboutHtml}</div>
        ${logoHtml}
      </div>
    `;
  }

  function render(team) {
    if (!team) return;
    // Правая команда — карточки идут справа налево (визуальное зеркало левой).
    const vertical = root.classList.contains('layout-vertical');
    const players = side === 'right' && !vertical ? team.players.slice().reverse() : team.players; // в столбике порядок один и тот же сверху вниз у обеих команд
    const cardsHtml = players.map((p) => buildCard(p, team)).join('');
    root.innerHTML = `
      <div class="tp-team-name-header">${escapeHtml(team.teamName)}</div>
      <div class="tp-cards-row">${cardsHtml}</div>
    `;
    // кадрирование фото: каждое фото ставится в рамку по своим x/y/zoom
    root.querySelectorAll('.tp-card').forEach((cardEl, i) => {
      const img = cardEl.querySelector('.tp-photo img');
      if (img && window.PhotoCrop) window.PhotoCrop.apply(cardEl.querySelector('.tp-photo'), img, players[i].crop);
    });
    fitVertical();
  }

  /** Столбик из 5 карточек часто выше окна источника — тогда уменьшаем его целиком (по высоте), чтобы ничего не обрезалось. */
  function fitVertical() {
    if (!root.classList.contains('layout-vertical')) { root.style.transform = ''; return; }
    root.style.transform = '';
    const natural = root.scrollHeight;
    const k = natural > window.innerHeight && window.innerHeight > 0 ? window.innerHeight / natural : 1;
    root.style.transform = k < 1 ? `scale(${k.toFixed(4)})` : '';
  }
  window.addEventListener('resize', fitVertical);

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=team&side=${side}`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'team_data' && data.side === side) {
        applySettings(data.settings);
        render(data.team);
        applyThemeBackgroundVideoToCards();
      }
    };
    ws.onclose = () => setTimeout(connect, 2000); // сервер перезапустился/сеть моргнула — пробуем снова
    ws.onerror = () => ws.close();
  }
  connect();
})();
