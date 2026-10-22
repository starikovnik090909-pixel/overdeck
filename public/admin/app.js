// public/admin/app.js
// UI-каркас (тема/вкладки) + рабочая вкладка авторизации Twitch:
// сохранение и проверка ключей через REST, живой статус через WebSocket.

(function () {
  const root = document.documentElement;
  const THEME_KEY = 'overlayStudio.theme';
  const TAB_KEY = 'overlayStudio.activeTab';

  /* ---------- Тема ---------- */

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);

  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = root.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* ---------- "Настройки админки" — собственные цветовые темы панели ---------- */
  /* Отдельная штука от переключателя выше (тот остаётся как есть, на
     localStorage) и от "Темы ивента"/темы оверлея — это только фон/текст/
     акцент САМОЙ панели управления, хранится на сервере в JSON. */

  const adminThemeList = document.getElementById('adminThemeList');
  const adminThemeFormCard = document.getElementById('adminThemeFormCard');
  const adminThemeName = document.getElementById('adminThemeName');
  const adminThemeBgColor = document.getElementById('adminThemeBgColor');
  const adminThemeTextColor = document.getElementById('adminThemeTextColor');
  const adminThemeAccentColor = document.getElementById('adminThemeAccentColor');
  const adminThemeMessage = document.getElementById('adminThemeMessage');

  document.getElementById('adminSettingsGear').addEventListener('click', () => activateTab('admin-settings'));

  function showAdminThemeMessage(text, kind) {
    adminThemeMessage.textContent = text;
    adminThemeMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function escapeHtmlAdminTheme(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** Применяет активную тему поверх светлой/тёмной — Starikov (все цвета null) ничего не переопределяет, своя тема выставляет все три CSS-переменные напрямую инлайн-стилем на <html> (приоритет выше, чем у :root[data-theme]). */
  function applyActiveAdminTheme(adminThemeData) {
    const active = adminThemeData.themes.find((t) => t.id === adminThemeData.activeThemeId) || adminThemeData.themes[0];
    const themeToggleEl = document.getElementById('themeToggle');
    if (!active || active.isDefault) {
      root.style.removeProperty('--bg-app');
      root.style.removeProperty('--text-primary');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-soft');
      themeToggleEl.style.display = ''; // Starikov ничего не переопределяет — переключатель светлая/тёмная снова имеет смысл
      return;
    }
    root.style.setProperty('--bg-app', active.bgColor);
    root.style.setProperty('--text-primary', active.textColor);
    root.style.setProperty('--accent', active.accentColor);
    root.style.setProperty('--accent-soft', hexToRgba(active.accentColor, 0.15));
    // БАГ, который тут чинится: инлайн-стиль на <html> имеет приоритет выше,
    // чем :root[data-theme="dark"/"light"], поэтому пока активна СВОЯ тема,
    // клик по солнцу/луне визуально ничего не менял — data-theme менялся, а
    // цвета оставались зафиксированы этой темой. Раз своя тема сама решает
    // фон/текст/акцент, кнопка на время её активности прячется, а не
    // притворяется рабочей.
    themeToggleEl.style.display = 'none';
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function renderAdminThemeList(adminThemeData) {
    adminThemeList.innerHTML = adminThemeData.themes.map((t) => `
      <div class="admin-theme-row">
        <div class="admin-theme-swatch">
          <span style="background:${t.isDefault ? '#0E0E10' : t.bgColor}"></span>
          <span style="background:${t.isDefault ? '#EFEFF1' : t.textColor}"></span>
          <span style="background:${t.isDefault ? '#B14846' : t.accentColor}"></span>
        </div>
        <span class="admin-theme-row-name">${escapeHtmlAdminTheme(t.name)}${t.isDefault ? '<span class="admin-theme-default-tag">по умолчанию</span>' : ''}</span>
        ${t.id === adminThemeData.activeThemeId
          ? '<span class="badge">Активна</span>'
          : `<button class="btn btn-secondary" type="button" data-activate-theme="${t.id}">Выбрать</button>`}
        ${!t.isDefault ? `<button class="btn-tiny" type="button" data-delete-theme="${t.id}">Удалить</button>` : ''}
      </div>
    `).join('');
    adminThemeList.querySelectorAll('[data-activate-theme]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const { ok, data } = await postJSON(`/api/admin-themes/${btn.dataset.activateTheme}/activate`, {});
          if (ok && data.success) { renderAdminThemeList(data.adminThemes); applyActiveAdminTheme(data.adminThemes); }
        } catch (e) {
          showAdminThemeMessage('Сетевая ошибка при обращении к серверу.', 'error');
        }
      });
    });
    adminThemeList.querySelectorAll('[data-delete-theme]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!await ui3Confirm('Удалить эту тему?')) return;
        try {
          const { ok, data } = await postJSON(`/api/admin-themes/${btn.dataset.deleteTheme}/delete`, {});
          if (ok && data.success) { renderAdminThemeList(data.adminThemes); applyActiveAdminTheme(data.adminThemes); }
        } catch (e) {
          showAdminThemeMessage('Сетевая ошибка при обращении к серверу.', 'error');
        }
      });
    });
  }

  document.getElementById('btnAdminThemeAdd').addEventListener('click', () => {
    adminThemeName.value = '';
    adminThemeMessage.textContent = '';
    adminThemeFormCard.style.display = 'block';
    adminThemeName.focus();
  });
  document.getElementById('btnAdminThemeCancel').addEventListener('click', () => {
    adminThemeFormCard.style.display = 'none';
  });
  document.getElementById('btnAdminThemeSave').addEventListener('click', async () => {
    const name = adminThemeName.value.trim();
    if (!name) { showAdminThemeMessage('Укажи название темы.', 'error'); return; }
    try {
      const { ok, data } = await postJSON('/api/admin-themes', {
        name, bgColor: adminThemeBgColor.value, textColor: adminThemeTextColor.value, accentColor: adminThemeAccentColor.value,
      });
      if (ok && data.success) {
        renderAdminThemeList(data.adminThemes);
        applyActiveAdminTheme(data.adminThemes);
        adminThemeFormCard.style.display = 'none';
      } else {
        showAdminThemeMessage((data && data.error) || 'Не удалось сохранить тему.', 'error');
      }
    } catch (e) {
      showAdminThemeMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  (async function loadAdminThemes() {
    try {
      const res = await fetch('/api/admin-themes');
      const data = await res.json();
      renderAdminThemeList(data.adminThemes);
      applyActiveAdminTheme(data.adminThemes);
    } catch (e) {
      // не критично — просто останется встроенная тема Starikov (ничего не переопределено)
    }
  })();

  /* ---------- Вкладка «ЧатАватары»: плашка с адресом алерта для OBS ---------- */

  const pixelAvatarUrlField = document.getElementById('pixelAvatarUrl');
  const btnCopyPixelAvatarUrl = document.getElementById('btnCopyPixelAvatarUrl');
  pixelAvatarUrlField.value = `http://localhost:${location.port || 3001}/pixel-avatar.html`;
  btnCopyPixelAvatarUrl.addEventListener('click', () => copyToField(pixelAvatarUrlField, btnCopyPixelAvatarUrl));

  /* ---------- Карточки героев: кто сейчас на оверлее ---------- */
  const pixelHeroGrid = document.getElementById('pixelHeroGrid');
  const pixelHeroMessage = document.getElementById('pixelHeroMessage');
  const TAG_DEFAULT = { nickColorMode: 'twitch', nickColor: '#ffffff', levelColor: '#1b1b2f', levelBg: '#ffd34d' };
  let pixelHeroesState = { heroes: [], active: [], settings: { chatters: true, plane2d: false, xpOnlyLive: true }, groupScale: {}, heroScale: {}, tag: { ...TAG_DEFAULT }, behavior: null };
  const pixelChattersToggle = document.getElementById('pixelChattersToggle');
  const pixelPlaneToggle = document.getElementById('pixelPlaneToggle');
  const pixelXpLiveToggle = document.getElementById('pixelXpLiveToggle');

  const pixelSettingsMessage = document.getElementById('pixelSettingsMessage');
  function showPixelHeroMessage(text, kind) {
    // сообщение показывается и под плитками, и в «Настройках» — видно на той вкладке, где человек сейчас
    [pixelHeroMessage, pixelSettingsMessage].forEach((m) => { m.textContent = text; m.className = 'form-message' + (kind ? ' ' + kind : ''); });
  }

  async function pixelHeroRequest(url, body) {
    const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error((data && data.error) || 'Не удалось выполнить действие.');
    return data;
  }

  /* ---------- Плитки героев: квадратики по плашкам категорий ---------- */
  let pixelPopover = null; // открытая плашка (превью героя или ввод его размера) — одна на экране
  function closePixelPopover() { if (pixelPopover) { pixelPopover.remove(); pixelPopover = null; } }
  /** Плашка рядом с anchor: под ним (или над, если снизу не хватает места), прижата к краям окна. build(pop) наполняет её. */
  function openPixelPopover(anchor, build, cls) {
    closePixelPopover();
    const pop = document.createElement('div');
    pop.className = 'pixel-popover ' + (cls || '');
    pop.setAttribute('role', 'dialog');
    build(pop);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, hgt = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    const wantTop = r.bottom + 8 + hgt > innerHeight - 8 ? r.top - hgt - 8 : r.bottom + 8;   // под плиткой, а если снизу не хватает места — над ней
    pop.style.top = Math.max(8, Math.min(innerHeight - hgt - 8, wantTop)) + 'px';           // и в любом случае целиком в окне (даже если плитка сейчас за краем экрана)
    pop._anchor = anchor;
    pixelPopover = pop;
  }
  document.addEventListener('mousedown', (e) => { if (pixelPopover && !pixelPopover.contains(e.target) && !(pixelPopover._anchor && pixelPopover._anchor.contains(e.target))) closePixelPopover(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePixelPopover(); });
  window.addEventListener('scroll', (e) => { if (pixelPopover && !pixelPopover.contains(e.target)) closePixelPopover(); }, true); // плашка закреплена за окном — при прокрутке закрываем, чтобы не «уплыла»

  /** Размер героя на оверлее в долях: размер категории × размер героя. */
  const heroSizeFactor = (hero) => ((pixelHeroesState.groupScale[hero.group] || 100) / 100) * ((pixelHeroesState.heroScale[hero.id] || 100) / 100);

  /** Спрайт героя: стойка лицом к зрителю — кадры атласа листаются чистым CSS (steps); масштаб — как на оверлее, но вписан в maxW × maxH. animated=false — кадр стоит (листается при наведении). */
  function buildPixelSprite(hero, maxW, maxH, animated) {
    const sprite = document.createElement('div');
    sprite.className = 'pixel-hero-sprite' + (animated ? '' : ' is-thumb');
    sprite.style.width = hero.cell.w + 'px';
    sprite.style.height = hero.cell.h + 'px';
    const zoom = Math.min(hero.scale * heroSizeFactor(hero), maxW / hero.cell.w, maxH / hero.cell.h);
    if (Math.abs(zoom - 1) > 1e-6) { sprite.style.zoom = String(zoom); sprite.style.imageRendering = Number.isInteger(zoom) && zoom > 1 ? 'pixelated' : 'auto'; }
    sprite.style.backgroundImage = `url(/pixel-avatar/${hero.id}/${hero.preview.file})`;
    sprite.style.setProperty('--frames', String(hero.preview.frames));
    sprite.style.setProperty('--end', `-${hero.preview.frames * hero.cell.w}px`);
    sprite.style.setProperty('--dur', `${(hero.preview.frames / hero.fps).toFixed(3)}s`);
    return sprite;
  }
  /** Блок превью (фон + анимированная стойка): в плашке героя и в профиле игрока. */
  function buildPixelPreview(hero) {
    const preview = document.createElement('div');
    preview.className = 'pixel-hero-preview';
    preview.appendChild(buildPixelSprite(hero, 176, 190, true));
    return preview;
  }

  /** Плашка превью: крупная анимированная стойка и краткие данные героя. */
  function buildPreviewPlate(pop, hero) {
    const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
    pop.append(el('div', 'pixel-pop-title', hero.title), el('div', 'pixel-pop-sub', hero.group), buildPixelPreview(hero),
      el('div', 'pixel-pop-info', `Размер на оверлее: ${Math.round(heroSizeFactor(hero) * 100)}%`), el('div', 'pixel-pop-info', `Скорость: ${hero.speed} px/с` + (hero.afk ? ' · умеет отдыхать' : '')));
    // Дополнительные анимации героя (прыжки, удары, жесты…): кнопка ▶ проигрывает анимацию в превью один раз, потом снова стойка
    const extras = Array.isArray(hero.extras) ? hero.extras : [];
    pop.append(el('div', 'pixel-pop-extras-title', extras.length ? 'Дополнительные анимации:' : 'Дополнительных анимаций нет.'));
    if (!extras.length) return;
    const KIND = { jump: 'прыжок', attack: 'удар', emote: 'жест', cast: 'заклинание' };
    const box = el('div', 'pixel-pop-extras');
    const preview = pop.querySelector('.pixel-hero-preview');
    extras.forEach((ex) => {
      const b = el('button', 'btn-tiny', `▶ ${ex.title}`); b.type = 'button'; b.title = `${KIND[ex.kind] || ex.kind}, ${ex.frames} кадр.`; b.dataset.extra = ex.name;
      b.addEventListener('click', () => playExtraInPreview(hero, ex, preview));
      box.appendChild(b);
    });
    pop.appendChild(box);
  }

  /** Проигрывает доп. анимацию в блоке превью один раз: ноги совмещаются по опорной точке со стойкой, потом возвращается стойка. */
  function playExtraInPreview(hero, ex, preview) {
    if (!preview) return;
    const idle = preview.firstElementChild;
    if (!idle) return;
    if (preview._restore) preview._restore();
    const base = Math.min(hero.scale * heroSizeFactor(hero), 176 / hero.cell.w, 190 / hero.cell.h);
    const zoom = Math.min(base, 176 / ex.cell.w, 190 / ex.cell.h);
    const sprite = document.createElement('div');
    sprite.className = 'pixel-hero-sprite is-once';
    sprite.dataset.extraSprite = ex.name;
    sprite.style.width = ex.cell.w + 'px'; sprite.style.height = ex.cell.h + 'px';
    sprite.style.zoom = String(zoom); sprite.style.imageRendering = Number.isInteger(zoom) && zoom > 1 ? 'pixelated' : 'auto';
    sprite.style.backgroundImage = `url(/pixel-avatar/${hero.id}/${ex.file})`;
    sprite.style.setProperty('--frames', String(ex.frames));
    sprite.style.setProperty('--end', `-${ex.frames * ex.cell.w}px`);
    sprite.style.setProperty('--dur', `${(ex.frames / (ex.fps || hero.fps)).toFixed(3)}s`);
    const baseGround = hero.cell.h - (hero.pivot ? hero.pivot.y : hero.cell.h), exGround = ex.cell.h - ex.pivot.y;   // сколько пикселей под ногами в ячейке стойки и в ячейке анимации
    sprite.style.marginBottom = `${Math.max(0, (baseGround * base - exGround * zoom) / zoom)}px`;                     // zoom применяется и к отступу — переводим в пиксели ячейки
    idle.style.display = 'none';
    preview.appendChild(sprite);
    const restore = () => { sprite.remove(); idle.style.display = ''; preview._restore = null; };
    preview._restore = restore;
    sprite.addEventListener('animationend', restore, { once: true });
  }

  /** Плашка ввода размера героя (25–300 %). Итог на оверлее = размер категории × размер героя. */
  function buildSizePlate(pop, hero) {
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    pop.append(el('div', 'pixel-pop-title', 'Размер героя'), el('div', 'pixel-pop-sub', hero.title));
    const field = el('label', 'pixel-pop-field');
    const input = document.createElement('input');
    input.type = 'number'; input.min = '25'; input.max = '300'; input.step = '5'; input.className = 'pixel-hero-size-input';
    input.value = String(pixelHeroesState.heroScale[hero.id] || 100);
    input.setAttribute('aria-label', `Размер героя «${hero.title}», %`);
    field.append('Размер ', input, ' %');
    const reset = el('button', 'btn-tiny', 'Сбросить (100%)'); reset.type = 'button';
    const hint = el('div', 'pixel-pop-info');
    const showHint = () => { hint.textContent = `Итог на оверлее: размер категории «${hero.group}» (${pixelHeroesState.groupScale[hero.group] || 100}%) × размер героя (${pixelHeroesState.heroScale[hero.id] || 100}%).`; };
    showHint();
    const apply = async (v) => {
      const before = pixelHeroesState.heroScale[hero.id] || 100;
      if (!Number.isInteger(v) || v < 25 || v > 300) { input.value = String(before); showPixelHeroMessage('Размер — целое число процентов от 25 до 300.', 'error'); return; }
      input.disabled = true;
      try {
        const data = await pixelHeroRequest('/api/pixel-heroes/hero-scale', { id: hero.id, percent: v });
        pixelHeroesState.heroScale = data.heroScale;
        input.value = String(v);
        showPixelHeroMessage(`«${hero.title}»: размер героя ${v}%.`, 'success');
        renderPixelHeroes(); // картинки на плитках пересоберутся в новом размере; плашка остаётся
      } catch (e) {
        input.value = String(before);
        showPixelHeroMessage(e.message, 'error');
      }
      input.disabled = false;
      showHint();
    };
    input.addEventListener('change', () => apply(Number(input.value)));
    reset.addEventListener('click', () => apply(100));
    pop.append(field, reset, hint);
    setTimeout(() => input.focus(), 0);
  }

  /** Плитка героя — квадрат: картинка (нажать — превью), в углу кружок «обс» и маленький ползунок «выдавать чаттерам», в другом углу кружок «%» (размер героя). */
  function buildPixelHeroTile(hero) {
    const active = pixelHeroesState.active.includes(hero.id);
    const order = pixelHeroesState.active.indexOf(hero.id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const tile = el('div', 'pixel-hero-tile' + (active ? ' is-active' : ''));
    tile.dataset.id = hero.id;

    const main = el('button', 'pixel-tile-main');
    main.type = 'button';
    main.title = 'Нажмите — откроется превью';
    main.setAttribute('aria-label', `Превью: ${hero.title}`);
    const thumb = el('span', 'pixel-tile-thumb');
    thumb.appendChild(buildPixelSprite(hero, 88, 72, false));
    main.append(thumb, el('span', 'pixel-tile-name', hero.title));
    main.addEventListener('click', () => openPixelPopover(tile, (pop) => buildPreviewPlate(pop, hero), 'pixel-pop-preview'));

    // кружок «обс»: вывести героя на оверлей вручную (декорация). В режиме героев чаттеров такие герои молчат; в старом режиме первый из них произносит сообщения стримера.
    const speaks = active && order === 0 && !pixelHeroesState.settings.chatters;
    const obs = el('button', 'pixel-dot pixel-dot-obs' + (active ? ' is-on' : ''), 'обс');
    obs.type = 'button';
    obs.setAttribute('aria-pressed', active ? 'true' : 'false');
    obs.title = active ? (speaks ? 'На оверлее — говорит ваши сообщения. Нажмите, чтобы убрать' : 'На оверлее. Нажмите, чтобы убрать') : 'Показать на оверлее';
    obs.addEventListener('click', async () => {
      obs.disabled = true;
      try {
        const data = await pixelHeroRequest(active ? '/api/pixel-heroes/hide' : '/api/pixel-heroes/show', { id: hero.id });
        pixelHeroesState.active = data.active;
        showPixelHeroMessage(active ? `${hero.title} ушёл с оверлея.` : `${hero.title} выходит на оверлей.`, 'success');
      } catch (e) {
        showPixelHeroMessage(e.message, 'error');
      }
      renderPixelHeroes();
    });

    // ползунок «выдавать чаттерам»: входит ли герой в число тех, кого сервер выдаёт зрителям (на героев, уже стоящих на сцене, не влияет)
    const give = el('label', 'pixel-give-switch');
    give.title = 'Выдавать чаттерам';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = hero.give !== false;
    box.setAttribute('aria-label', `Выдавать чаттерам: ${hero.title}`);
    box.addEventListener('change', async () => {
      box.disabled = true;
      try {
        const data = await pixelHeroRequest('/api/pixel-heroes/pool', { id: hero.id, enabled: box.checked });
        pixelHeroesState.heroes = data.heroes;
        showPixelHeroMessage(box.checked ? `${hero.title} теперь выдаётся чаттерам.` : `${hero.title} больше не выдаётся чаттерам.`, 'success');
      } catch (e) {
        box.checked = !box.checked; // не сохранилось — возвращаем ползунок как был
        showPixelHeroMessage(e.message, 'error');
      }
      box.disabled = false;
    });
    give.append(box, el('span', 'pixel-give-slider'));

    // кружок «%»: размер этого героя (открывается плашка с вводом)
    const size = el('button', 'pixel-dot pixel-dot-size' + (pixelHeroesState.heroScale[hero.id] ? ' is-set' : ''), '%');
    size.type = 'button';
    size.title = pixelHeroesState.heroScale[hero.id] ? `Размер героя: ${pixelHeroesState.heroScale[hero.id]}%` : 'Размер героя';
    size.setAttribute('aria-label', `Размер героя: ${hero.title}`);
    size.addEventListener('click', () => openPixelPopover(size, (pop) => buildSizePlate(pop, hero), 'pixel-pop-size'));

    const controls = el('div', 'pixel-tile-controls');
    controls.append(obs, give);
    tile.append(main, controls, size);
    return tile;
  }

  /* ---------- Цвета подписи над героем (ник и «lvl N») ---------- */
  const pixelNickMode = document.getElementById('pixelNickMode');
  const pixelNickColor = document.getElementById('pixelNickColor');
  const pixelLevelColor = document.getElementById('pixelLevelColor');
  const pixelLevelBg = document.getElementById('pixelLevelBg');

  /** Показывает в полях и в предпросмотре то, что лежит в состоянии (цвет ника «как в Twitch» в предпросмотре — условный). */
  function syncTagControls() {
    const t = pixelHeroesState.tag;
    pixelNickMode.value = t.nickColorMode;
    pixelNickColor.value = t.nickColor; pixelNickColor.disabled = t.nickColorMode !== 'custom';
    pixelLevelColor.value = t.levelColor; pixelLevelBg.value = t.levelBg;
    drawTagPreview(t);
  }
  function drawTagPreview(t) {
    const nick = document.getElementById('pixelTagPreviewNick'), lvl = document.getElementById('pixelTagPreviewLvl');
    nick.style.color = t.nickColorMode === 'custom' ? t.nickColor : '#B14846'; // как в Twitch — цвет у каждого свой; в предпросмотре условный
    lvl.style.color = t.levelColor; lvl.style.background = t.levelBg;
  }
  const currentTagInputs = () => ({ nickColorMode: pixelNickMode.value, nickColor: pixelNickColor.value, levelColor: pixelLevelColor.value, levelBg: pixelLevelBg.value });
  async function saveTagStyle() {
    const wanted = currentTagInputs();
    try {
      const data = await pixelHeroRequest('/api/pixel-heroes/tag-style', wanted);
      pixelHeroesState.tag = data.tag;
      showPixelHeroMessage('Цвета подписи сохранены.', 'success');
    } catch (e) {
      showPixelHeroMessage(e.message, 'error');
    }
    syncTagControls();
  }
  [pixelNickColor, pixelLevelColor, pixelLevelBg].forEach((i) => i.addEventListener('input', () => drawTagPreview(currentTagInputs()))); // предпросмотр — пока двигаешь цвет
  [pixelNickMode, pixelNickColor, pixelLevelColor, pixelLevelBg].forEach((i) => i.addEventListener('change', saveTagStyle));          // сохранение — когда выбрал
  document.getElementById('btnPixelTagReset').addEventListener('click', async () => {
    try {
      const data = await pixelHeroRequest('/api/pixel-heroes/tag-style', { ...TAG_DEFAULT });
      pixelHeroesState.tag = data.tag;
      showPixelHeroMessage('Цвета подписи сброшены.', 'success');
    } catch (e) {
      showPixelHeroMessage(e.message, 'error');
    }
    syncTagControls();
  });

  /** Переключатели «Выдавать героев чаттерам» и «Режим 2D» — сохраняются на сервере и сразу применяются на оверлее. */
  function syncPixelToggles() {
    pixelChattersToggle.checked = !!pixelHeroesState.settings.chatters;
    pixelPlaneToggle.checked = !!pixelHeroesState.settings.plane2d;
    pixelXpLiveToggle.checked = pixelHeroesState.settings.xpOnlyLive !== false;
  }
  async function savePixelSetting(patch, okText) {
    try {
      const data = await pixelHeroRequest('/api/pixel-heroes/settings', patch);
      pixelHeroesState.settings = data.settings;
      showPixelHeroMessage(okText(data.settings), 'success');
    } catch (e) {
      showPixelHeroMessage(e.message, 'error');
    }
    syncPixelToggles();
    renderPixelHeroes(); // подписи на карточках зависят от режима («Говорит ваши сообщения» только в старом режиме)
  }
  pixelChattersToggle.addEventListener('change', () => savePixelSetting({ chatters: pixelChattersToggle.checked }, (s) => (s.chatters ? 'Герои чаттерам выдаются.' : 'Герои чаттерам больше не выдаются: остались только показанные вручную.')));
  pixelXpLiveToggle.addEventListener('change', () => savePixelSetting({ xpOnlyLive: pixelXpLiveToggle.checked }, (s) => (s.xpOnlyLive ? 'Опыт идёт только пока идёт стрим.' : 'Опыт идёт всегда, даже без трансляции.')));
  pixelPlaneToggle.addEventListener('change', () => savePixelSetting({ plane2d: pixelPlaneToggle.checked }, (s) => (s.plane2d ? 'Режим 2D включён: все ходят по низу экрана.' : 'Режим 2D выключен: герои ходят по всей плоскости.')));

  /* ---------- Поведение героев ---------- */
  const pxb = (id) => document.getElementById(id);
  const BEH_DEFAULT = { mode: 'limited', walksMin: 2, walksMax: 5, restMin: 8, restMax: 25, pauseMin: 1, pauseMax: 3, extraChance: 35, afkChance: 35, reactChance: 30, kinds: { jump: true, attack: true, emote: true, cast: true } };
  const BEH_KINDS = { jump: 'pxbKindJump', attack: 'pxbKindAttack', emote: 'pxbKindEmote', cast: 'pxbKindCast' };
  function syncBehaviorControls() {
    const b = pixelHeroesState.behavior || BEH_DEFAULT;
    pxb('pxbMode').value = b.mode;
    [['pxbWalksMin', 'walksMin'], ['pxbWalksMax', 'walksMax'], ['pxbRestMin', 'restMin'], ['pxbRestMax', 'restMax'], ['pxbPauseMin', 'pauseMin'], ['pxbPauseMax', 'pauseMax'], ['pxbExtra', 'extraChance'], ['pxbAfk', 'afkChance'], ['pxbReact', 'reactChance']].forEach(([id, k]) => { pxb(id).value = String(b[k]); });
    Object.entries(BEH_KINDS).forEach(([k, id]) => { pxb(id).checked = !!b.kinds[k]; });
    const box = pxb('pixelBehavior'); box.classList.toggle('is-stay', b.mode === 'stay'); box.classList.toggle('is-roam', b.mode === 'roam');
    ['pxbWalksMin', 'pxbWalksMax', 'pxbRestMin', 'pxbRestMax'].forEach((id) => { pxb(id).disabled = b.mode !== 'limited'; });
  }
  function readBehaviorControls() {
    const n = (id) => Number(pxb(id).value);
    return { mode: pxb('pxbMode').value, walksMin: n('pxbWalksMin'), walksMax: n('pxbWalksMax'), restMin: n('pxbRestMin'), restMax: n('pxbRestMax'), pauseMin: n('pxbPauseMin'), pauseMax: n('pxbPauseMax'),
      extraChance: n('pxbExtra'), afkChance: n('pxbAfk'), reactChance: n('pxbReact'), kinds: Object.fromEntries(Object.entries(BEH_KINDS).map(([k, id]) => [k, pxb(id).checked])) };
  }
  async function saveBehavior(payload, okText) {
    try {
      const data = await pixelHeroRequest('/api/pixel-heroes/behavior', payload);
      pixelHeroesState.behavior = data.behavior;
      showPixelHeroMessage(okText, 'success');
    } catch (e) {
      showPixelHeroMessage(e.message, 'error');
    }
    syncBehaviorControls();
  }
  pxb('btnPixelBehaviorSave').addEventListener('click', () => saveBehavior(readBehaviorControls(), 'Поведение героев сохранено.'));
  pxb('btnPixelBehaviorReset').addEventListener('click', () => saveBehavior(BEH_DEFAULT, 'Поведение героев сброшено к настройкам по умолчанию.'));
  pxb('pxbMode').addEventListener('change', () => { // режим применяется сразу, остальные поля — кнопкой «Сохранить»
    const mode = pxb('pxbMode').value;
    saveBehavior({ mode }, mode === 'roam' ? 'Герои бродят без остановки.' : mode === 'stay' ? 'Герои стоят на месте (анимации и афк-действия остаются).' : 'Герои гуляют порциями и отдыхают.');
  });

  function renderPixelHeroes() {
    pixelHeroGrid.replaceChildren();
    if (!pixelHeroesState.heroes.length) {
      const p = document.createElement('p');
      p.className = 'card-hint';
      p.textContent = 'Героев пока нет — положите папку героя (с manifest.json) в public/pixel-avatar/.';
      pixelHeroGrid.appendChild(p);
      return;
    }
    // плитки по плашкам категорий: заголовок категории (с её размером) и под ним квадратики героев
    const groups = [];
    pixelHeroesState.heroes.forEach((hero) => {
      let g = groups.find((x) => x.name === hero.group);
      if (!g) { g = { name: hero.group, heroes: [] }; groups.push(g); }
      g.heroes.push(hero);
    });
    groups.forEach((g) => {
      const section = document.createElement('section');
      section.className = 'pixel-hero-group';
      const head = document.createElement('div');
      head.className = 'pixel-hero-group-head';
      const title = document.createElement('h3');
      title.className = 'pixel-hero-group-title';
      title.textContent = g.name;
      // Размер героев категории в процентах (25–300): применяется на оверлее на лету; 100 — как нарисовано
      const sizeLabel = document.createElement('label');
      sizeLabel.className = 'pixel-group-size';
      const sizeInput = document.createElement('input');
      sizeInput.type = 'number'; sizeInput.min = '25'; sizeInput.max = '300'; sizeInput.step = '5';
      sizeInput.className = 'pixel-group-size-input';
      sizeInput.value = String(pixelHeroesState.groupScale[g.name] || 100);
      sizeInput.setAttribute('aria-label', `Размер категории «${g.name}», %`);
      sizeInput.addEventListener('change', async () => {
        const before = pixelHeroesState.groupScale[g.name] || 100;
        const v = Number(sizeInput.value);
        if (!Number.isInteger(v) || v < 25 || v > 300) { sizeInput.value = String(before); showPixelHeroMessage('Размер — целое число процентов от 25 до 300.', 'error'); return; }
        sizeInput.disabled = true;
        try {
          const data = await pixelHeroRequest('/api/pixel-heroes/group-scale', { group: g.name, percent: v });
          pixelHeroesState.groupScale = data.groupScale;
          showPixelHeroMessage(`«${g.name}»: размер героев ${v}%.`, 'success');
        } catch (e) {
          sizeInput.value = String(before);
          showPixelHeroMessage(e.message, 'error');
        }
        sizeInput.disabled = false;
        renderPixelHeroes(); // превью раскрытых героев пересоберутся в новом размере
      });
      sizeLabel.append('Размер ', sizeInput, ' %');
      head.append(title, sizeLabel);
      const cards = document.createElement('div');
      cards.className = 'pixel-hero-tiles';
      g.heroes.forEach((hero) => cards.appendChild(buildPixelHeroTile(hero)));
      section.append(head, cards);
      pixelHeroGrid.appendChild(section);
    });
  }

  /* ---------- Подсказка с характеристиками героя при наведении на плитку ---------- */
  const RARE_MAX_HEROES = 3;          // анимация «редкая», если такая есть не больше чем у стольких героев
  const EXTRA_KIND_LABEL = { jump: 'прыжки', attack: 'удары', emote: 'жесты', cast: 'заклинания' };
  /** Сколько героев умеет каждую доп. анимацию (по названию) — по этому числу решаем, что редкое. */
  function extraTitleCounts() {
    const counts = {};
    pixelHeroesState.heroes.forEach((h) => { new Set((h.extras || []).map((e) => e.title)).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }); });
    return counts;
  }
  /** Характеристики героя: число анимаций, редкие (★), закрыт ли за баллы. Единый источник для подсказки. */
  function pixelHeroStats(hero) {
    const extras = Array.isArray(hero.extras) ? hero.extras : [];
    const counts = extraTitleCounts();
    const rare = extras.filter((e) => counts[e.title] <= RARE_MAX_HEROES).map((e) => ({ title: e.title, owners: counts[e.title] }));
    const kinds = {};
    extras.forEach((e) => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
    return { total: 2 + extras.length + (hero.afk ? 1 : 0), extras: extras.length, kinds, afk: !!hero.afk, rare, closed: hero.give === false };
  }
  let pixelTip = null;
  function hidePixelTip() { if (pixelTip) { pixelTip.remove(); pixelTip = null; } }
  function showPixelTip(tile) {
    const hero = pixelHeroesState.heroes.find((h) => h.id === tile.dataset.id);
    if (!hero) return;
    hidePixelTip();
    const st = pixelHeroStats(hero);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const tip = el('div', 'pixel-hover-tip');
    tip.setAttribute('role', 'tooltip');
    tip.append(el('div', 'pixel-tip-title', hero.title), el('div', 'pixel-tip-sub', hero.group));
    const rows = el('div', 'pixel-tip-rows');
    const row = (k, v) => { const r = el('div', 'pixel-tip-row'); r.append(el('span', 'pixel-tip-k', k), el('span', 'pixel-tip-v', v)); rows.appendChild(r); };
    row('Анимаций', `${st.total} (ходьба, стойка${st.extras ? `, доп.: ${st.extras}` : ''}${st.afk ? ', афк' : ''})`);
    const kindText = Object.keys(st.kinds).map((k) => `${EXTRA_KIND_LABEL[k] || k} ×${st.kinds[k]}`).join(', ');
    if (kindText) row('Доп. анимации', kindText);
    row('Скорость', `${hero.speed} px/с`);
    row('Размер', `${Math.round(heroSizeFactor(hero) * 100)}%`);
    row('Выдаётся чаттерам', st.closed ? 'нет — закрытый (за баллы)' : 'да');
    tip.appendChild(rows);
    if (st.rare.length) {
      const box = el('div', 'pixel-tip-rare');
      box.appendChild(el('div', 'pixel-tip-rare-title', '★ Редкие анимации'));
      st.rare.forEach((r) => box.appendChild(el('span', 'pixel-tip-chip', `${r.title} · у ${r.owners} из ${pixelHeroesState.heroes.length}`)));
      tip.appendChild(box);
    } else {
      tip.appendChild(el('div', 'pixel-tip-none', st.extras ? 'Редких анимаций нет.' : 'Дополнительных анимаций нет.'));
    }
    document.body.appendChild(tip);
    const r = tile.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;   // над плиткой, а если сверху нет места — под ней
    tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, top)) + 'px';
    pixelTip = tip;
  }
  pixelHeroGrid.addEventListener('mouseover', (e) => {
    const tile = e.target.closest && e.target.closest('.pixel-hero-tile');
    if (!tile || (e.relatedTarget && tile.contains(e.relatedTarget))) return;
    if (pixelPopover) return;           // открыто превью — подсказка не нужна
    showPixelTip(tile);
  });
  pixelHeroGrid.addEventListener('mouseout', (e) => {
    const tile = e.target.closest && e.target.closest('.pixel-hero-tile');
    if (tile && !(e.relatedTarget && tile.contains(e.relatedTarget))) hidePixelTip();
  });
  pixelHeroGrid.addEventListener('click', hidePixelTip);
  window.addEventListener('scroll', hidePixelTip, true);

  /* ---------- Топ чат-аватаров: слева список игроков, справа профиль выбранного ---------- */
  const pixelTopList = document.getElementById('pixelTopList');
  const pixelProfilePane = document.getElementById('pixelProfilePane');
  let selectedTopLogin = null;       // чей профиль открыт справа (запоминается между обновлениями списка)
  let renderedProfileKey = '';       // снимок данных открытого профиля — не перестраиваем его зря, пока человек правит поля
  let pixelTop = [];

  function formatSeen(ms) {
    if (!ms) return 'ещё не писал';
    return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  let pixelTopMsgTimer = null;
  function showPixelTopMessage(text, type) {
    const m = document.getElementById('pixelTopMessage');
    m.textContent = text;
    m.className = 'form-message ' + type;
    clearTimeout(pixelTopMsgTimer);
    pixelTopMsgTimer = setTimeout(() => { m.textContent = ''; m.className = 'form-message'; }, 5000);
  }
  /** Обновляет запись игрока в топе данными, которые вернул сервер (профиль), не теряя место и раскрытость. */
  function mergeTopEntry(profile) {
    const i = pixelTop.findIndex((x) => x.login === profile.login);
    if (i >= 0) pixelTop[i] = { ...pixelTop[i], ...profile };
  }

  /** Ручные правки профиля: смена аватара (героя) и уровня (−/+ или число). Опыт при смене уровня ставится на начало выбранного уровня. */
  function buildPixelProfileEdit(p, hero) {
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const box = el('div', 'pixel-profile-edit');

    // аватар: список всех героев по категориям
    const avField = el('label', 'pixel-profile-field');
    avField.append(el('span', 'pixel-profile-field-label', 'Аватар'));
    const sel = document.createElement('select');
    sel.className = 'pixel-profile-hero-select';
    sel.setAttribute('aria-label', `Аватар игрока ${p.name}`);
    if (!p.hero || !hero) { const o = document.createElement('option'); o.value = ''; o.textContent = p.hero ? 'Герой убран из папки — выберите другого' : '— героя ещё нет —'; sel.appendChild(o); }
    const groups = [];
    pixelHeroesState.heroes.forEach((x) => { let g = groups.find((y) => y.name === x.group); if (!g) { g = { name: x.group, heroes: [] }; groups.push(g); } g.heroes.push(x); });
    groups.forEach((g) => {
      const og = document.createElement('optgroup');
      og.label = g.name;
      g.heroes.forEach((x) => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.title; og.appendChild(o); });
      sel.appendChild(og);
    });
    sel.value = hero ? hero.id : '';
    sel.addEventListener('change', async () => {
      if (!sel.value) return;
      const before = hero ? hero.id : '';
      sel.disabled = true;
      try {
        const data = await pixelHeroRequest('/api/pixel-heroes/profile/hero', { login: p.login, hero: sel.value });
        mergeTopEntry(data.profile);
        const t = pixelHeroesState.heroes.find((x) => x.id === sel.value);
        showPixelTopMessage(`Аватар игрока ${p.name}: ${t ? t.title : sel.value}.`, 'success');
        renderPixelTop(); // профиль перестроится с новым героем
        renderPixelProfilePane(true);
        return;
      } catch (e) {
        sel.value = before;
        showPixelTopMessage(e.message, 'error');
      }
      sel.disabled = false;
    });
    avField.appendChild(sel);

    // уровень: − / число / +
    const lvField = el('div', 'pixel-profile-field');
    lvField.append(el('span', 'pixel-profile-field-label', 'Уровень'));
    const row = el('div', 'pixel-level-edit');
    const minus = el('button', 'pixel-level-btn', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Понизить уровень');
    const plus = el('button', 'pixel-level-btn', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Повысить уровень');
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.max = '99'; inp.step = '1'; inp.className = 'pixel-level-input'; inp.value = String(p.level);
    inp.setAttribute('aria-label', `Уровень игрока ${p.name}`);
    minus.disabled = p.level <= 0; plus.disabled = p.level >= 99;
    const setLevel = async (v) => {
      if (!Number.isInteger(v) || v < 0 || v > 99) { inp.value = String(p.level); showPixelTopMessage('Уровень — целое число от 0 до 99.', 'error'); return; }
      if (v === p.level) return;
      [minus, plus, inp].forEach((x) => { x.disabled = true; });
      try {
        const data = await pixelHeroRequest('/api/pixel-heroes/profile/level', { login: p.login, level: v });
        mergeTopEntry(data.profile);
        showPixelTopMessage(`Уровень игрока ${p.name}: lvl ${v} (опыт — на начало уровня).`, 'success');
        await loadPixelTop(); // место в топе изменилось; раскрытый профиль остаётся раскрытым
        return;
      } catch (e) {
        inp.value = String(p.level);
        showPixelTopMessage(e.message, 'error');
      }
      inp.disabled = false; minus.disabled = p.level <= 0; plus.disabled = p.level >= 99;
    };
    minus.addEventListener('click', () => setLevel(p.level - 1));
    plus.addEventListener('click', () => setLevel(p.level + 1));
    inp.addEventListener('change', () => setLevel(inp.value.trim() === '' ? NaN : Number(inp.value))); // пустое поле — не «0», а ошибка (иначе случайно сбросило бы уровень)
    row.append(minus, inp, plus);
    lvField.appendChild(row);
    box.append(avField, lvField, el('div', 'pixel-profile-hint', 'Опыт при смене уровня ставится на начало выбранного уровня.'));
    return box;
  }

  /** Профиль: ник, аватар (герой этого человека), уровень и шкала опыта (опыт / длина шкалы). */
  function buildPixelProfile(p) {
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const box = el('div', 'pixel-profile');
    const hero = pixelHeroesState.heroes.find((x) => x.id === p.hero);
    const avatar = el('div', 'pixel-profile-avatar');
    if (hero) avatar.appendChild(buildPixelPreview(hero)); else avatar.appendChild(el('span', 'pixel-profile-noavatar', p.hero ? 'Герой убран из папки' : 'Героя ещё нет'));
    const nick = el('div', 'pixel-profile-nick', p.name);
    if (p.color) nick.style.color = p.color;
    const sub = el('div', 'pixel-profile-sub');
    sub.append(el('span', 'pixel-level', 'lvl ' + p.level), el('span', '', hero ? hero.title : ''));
    const need = p.maxed ? Math.max(1, p.xp) : Math.max(1, p.xpNeed);
    const pct = p.maxed ? 100 : Math.max(0, Math.min(100, p.xp / need * 100));
    const xp = el('div', 'pixel-xp');
    const track = el('div', 'pixel-xp-track'), fill = el('div', 'pixel-xp-fill');
    fill.style.width = pct + '%';
    track.appendChild(fill);
    track.setAttribute('role', 'progressbar'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(need)); track.setAttribute('aria-valuenow', String(p.xp));
    xp.append(track, el('div', 'pixel-xp-label', p.maxed ? 'Максимальный уровень' : `Опыт: ${p.xp} / ${need}`));
    const total = el('div', 'pixel-profile-total', `Всего опыта: ${p.totalXp}`);
    const roles = [p.flags && p.flags.sub ? 'подписка' : '', p.flags && p.flags.vip ? 'VIP' : '', p.flags && p.flags.mod ? 'модератор' : ''].filter(Boolean);
    const bonus = el('div', 'pixel-profile-bonus', p.multiplier > 1 ? `Бонус опыта: ×${p.multiplier} (${roles.join(' + ')})` : 'Бонус опыта: нет');
    const meta = el('div', 'pixel-profile-meta', p.onStage ? 'Сейчас на сцене' : 'Был в чате: ' + formatSeen(p.lastSeen));
    const awardsBox = el('div', 'pixel-profile-awards');
    (p.awards || []).forEach((w) => {
      const m = el('div', 'pixel-profile-award', w.icon ? '' : '🏅');
      if (w.icon) m.style.backgroundImage = `url("${w.icon}")`;
      m.title = w.title + (w.description ? ' — ' + w.description : ''); m.setAttribute('role', 'img'); m.setAttribute('aria-label', m.title);
      awardsBox.appendChild(m);
    });
    box.append(avatar, nick, sub, xp, total, bonus, meta);
    if ((p.awards || []).length) box.append(el('div', 'pixel-profile-field-label', 'Награды'), awardsBox);
    box.append(buildPixelProfileEdit(p, hero));
    return box;
  }

  /** Правая панель: профиль выбранного игрока. force — перестроить даже если данные не менялись. */
  function renderPixelProfilePane(force) {
    const p = pixelTop.find((x) => x.login === selectedTopLogin);
    if (!p) {
      renderedProfileKey = '';
      const e = document.createElement('p');
      e.className = 'pixel-top-empty';
      e.textContent = selectedTopLogin ? 'Этого игрока больше нет в топе.' : 'Выберите игрока в списке слева — здесь откроется его профиль.';
      pixelProfilePane.replaceChildren(e);
      return;
    }
    const key = JSON.stringify(p) + '|' + pixelHeroesState.heroes.length;   // список героев догрузился — профиль надо перестроить (аватар)
    if (!force && key === renderedProfileKey) return;
    if (!force && pixelProfilePane.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName)) return; // человек сейчас правит поле — не сбиваем
    renderedProfileKey = key;
    pixelProfilePane.replaceChildren(buildPixelProfile(p));
  }

  function renderPixelTop() {
    pixelTopList.replaceChildren();
    if (!pixelTop.length) {
      const p = document.createElement('p');
      p.className = 'pixel-top-empty';
      p.textContent = 'Пока никого: профили появятся, когда зрители начнут писать в чат (при включённой выдаче героев чаттерам).';
      pixelTopList.appendChild(p);
      renderPixelProfilePane(true);
      return;
    }
    pixelTop.forEach((p) => {
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'pixel-top-rowhead' + (p.login === selectedTopLogin ? ' is-selected' : '');
      head.dataset.login = p.login;
      head.setAttribute('aria-pressed', p.login === selectedTopLogin ? 'true' : 'false');
      const rank = document.createElement('span'); rank.className = 'pixel-top-rank'; rank.textContent = String(p.rank);
      const name = document.createElement('span'); name.className = 'pixel-top-name'; name.textContent = p.name; if (p.color) name.style.color = p.color;
      const lvl = document.createElement('span'); lvl.className = 'pixel-level'; lvl.textContent = 'lvl ' + p.level;
      head.append(rank, name, lvl);
      if (p.onStage) { const dot = document.createElement('span'); dot.className = 'pixel-top-dot'; dot.title = 'Сейчас на сцене'; head.appendChild(dot); }
      head.addEventListener('click', () => {
        selectedTopLogin = p.login;
        pixelTopList.querySelectorAll('.pixel-top-rowhead').forEach((b) => { const on = b.dataset.login === p.login; b.classList.toggle('is-selected', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        renderPixelProfilePane(true);
      });
      pixelTopList.appendChild(head);
    });
    renderPixelProfilePane(false);
  }

  /** Справка «Как начисляется опыт» — из правил, которые присылает сервер (числа не зашиты в страницу). */
  function renderPixelRules(r) {
    const list = document.getElementById('pixelXpRulesList');
    list.replaceChildren();
    if (!r) return;
    const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    const first = r.curve.find((c) => c.level === 1), second = r.curve.find((c) => c.level === 2), third = r.curve.find((c) => c.level === 3), last = r.curve.find((c) => c.level === r.levelCap);
    [
      `Заход на стрим: +${r.xp.join} (один раз за трансляцию).`,
      `Присутствие: +${r.xp.presence} каждые ${r.xp.presenceEveryMin} минут, пока человек писал в чат за последние ${r.xp.presenceWindowMin} минут.`,
      `Сообщение: +${r.xp.message} (не чаще раза в ${r.xp.messageCooldownSec} с и не больше ${r.xp.messageCapPerHour} опыта в час; команды «!» не считаются).`,
      `Участие в ставке: +${r.xp.participation} (Twitch отдаёт топ-предсказателей; кто голосовал в обычном опросе, он не сообщает).`,
      `Бонусы складываются: подписка ×${(1 + r.bonus.sub).toFixed(1)}, VIP ×${(1 + r.bonus.vip).toFixed(1)}, модератор ×${(1 + r.bonus.mod).toFixed(1)}.`,
      `Уровни: 1-й — ${first.need}, 2-й — ${second.need}, 3-й — ${third.need} … ${r.levelCap}-й — ${fmt(last.need)}; до ${r.levelCap}-го всего ${fmt(last.total)} опыта.`,
      `Ориентир: первый уровень — примерно за час просмотра с перепиской.`,
    ].forEach((t) => { const li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
  }

  async function loadPixelTop() {
    try {
      const data = await pixelHeroRequest('/api/pixel-heroes/top');
      pixelTop = data.top;
      renderPixelRules(data.rules);
    } catch (e) {
      pixelTopList.replaceChildren();
      const p = document.createElement('p');
      p.className = 'pixel-top-empty';
      p.textContent = 'Не удалось загрузить топ — нет связи с сервером.';
      pixelTopList.appendChild(p);
      return;
    }
    renderPixelTop();
  }
  document.getElementById('btnPixelTopRefresh').addEventListener('click', loadPixelTop);
  // пока открыта вкладка «ЧатАватары», топ обновляется сам раз в 10 секунд (профили растут, пока идёт стрим)
  setInterval(() => { if (!document.hidden && document.getElementById('tab-chatavatars').classList.contains('active') && document.getElementById('pixelPane-top').classList.contains('active')) loadPixelTop(); }, 10000);


  /* ---------- События и награды ---------- */
  const awdEl = (id) => document.getElementById(id);
  let awdState = { awards: [], event: null, log: [], limits: {} };
  let awdIcon = '', awdIconSmall = '';
  let awdTimer = null;
  function awdMsg(text, kind) { const m = awdEl('awdMessage'); m.textContent = text || ''; m.className = 'form-message' + (kind ? ' ' + kind : ''); }
  function setAwdIcon(url, small) { awdIcon = url || ''; awdIconSmall = url ? (small || '') : ''; const p = awdEl('awdIconPreview'); p.style.backgroundImage = url ? `url("${url}")` : ''; }
  /** Уменьшает выбранную картинку до квадрата 48×48 и делает маленькую копию 32×32 для расширения Twitch (WebP с прозрачностью, если браузер умеет, иначе PNG). */
  function shrinkIcon(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      const draw = (size) => {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        const k = Math.min(size / img.width, size / img.height), w = img.width * k, h = img.height * k;
        g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        const webp = c.toDataURL('image/webp', 0.85);
        return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
      };
      img.onload = () => {
        URL.revokeObjectURL(url);
        const lim = awdState.limits;
        let icon = '', small = '';
        for (const size of [48, 40, 32, 24]) { const o = draw(size); if (o.length <= (lim.ICON_MAX || 8000)) { icon = o; break; } }
        for (const size of [32, 28, 24, 20]) { const o = draw(size); if (o.length <= (lim.ICON_SMALL_MAX || 3000)) { small = o; break; } }
        if (!icon) return reject(new Error('Картинка слишком сложная даже после уменьшения. Возьмите более простую.'));
        resolve({ icon, small });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть картинку.')); };
      img.src = url;
    });
  }
  const awdIconEl = (a, cls) => { const d = document.createElement('div'); d.className = cls; if (a.icon) d.style.backgroundImage = `url("${a.icon}")`; else d.textContent = '🏅'; return d; };
  function renderAwards() {
    const ev = awdState.event, now = awdEl('awdNow');
    now.textContent = '';
    if (ev) {
      const b = document.createElement('b'); b.textContent = ev.title;
      const bar = document.createElement('div'); bar.className = 'awd-bar'; const fill = document.createElement('i');
      const total = ev.durationMin * 60000; fill.style.width = Math.max(0, Math.min(100, 100 - ev.leftMs / total * 100)) + '%'; bar.appendChild(fill);
      const left = document.createElement('div'); const m = Math.floor(ev.leftMs / 60000), s = Math.floor(ev.leftMs % 60000 / 1000);
      left.textContent = `Идёт. Осталось ${m}:${String(s).padStart(2, '0')}. Участников пока: ${ev.participants}.`;
      const row = document.createElement('div'); row.className = 'awd-actions';
      const done = document.createElement('button'); done.className = 'btn-tiny'; done.type = 'button'; done.textContent = 'Завершить сейчас и выдать';
      const stop = document.createElement('button'); stop.className = 'btn-tiny'; stop.type = 'button'; stop.textContent = 'Отменить без награды';
      done.addEventListener('click', () => finishAwardEvent(false)); stop.addEventListener('click', () => finishAwardEvent(true));
      row.append(done, stop); now.append(b, bar, left, row);
    } else now.textContent = 'Событие не идёт.';
    awdEl('btnAwdStart').disabled = !!ev;
    const sel = awdEl('awdGrantAward'), keep = sel.value; sel.textContent = '';
    awdState.awards.forEach((a) => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.title; sel.appendChild(o); });
    if (keep) sel.value = keep;
    const list = awdEl('awdList'); list.textContent = '';
    if (!awdState.awards.length) { const e = document.createElement('p'); e.className = 'awd-empty'; e.textContent = 'Наград пока нет. Создайте первую слева.'; list.appendChild(e); }
    awdState.awards.forEach((a) => {
      const it = document.createElement('div'); it.className = 'awd-item';
      const tx = document.createElement('div');
      const t = document.createElement('b'); t.textContent = a.title;
      const st = document.createElement('span'); st.className = 'awd-st ' + (a.available ? 'open' : 'closed');
      st.textContent = a.available ? 'Можно получить' : 'Закрыта' + (a.issuedAt ? ' · выдавалась ' + new Date(a.issuedAt).toLocaleDateString('ru-RU') : '');
      const d = document.createElement('small'); d.textContent = a.description || 'Без описания';
      const w = document.createElement('small'); w.textContent = a.howTo ? 'Как получить: ' + a.howTo : 'Как получить: не указано';
      const h = document.createElement('small'); h.textContent = `Получили: ${a.holders}`;
      const row = document.createElement('div'); row.className = 'awd-btns';
      const mkBtn = (label, fn) => { const x = document.createElement('button'); x.className = 'btn-tiny'; x.type = 'button'; x.textContent = label; x.addEventListener('click', fn); return x; };
      const toggle = mkBtn(a.available ? 'Закрыть выдачу' : 'Открыть выдачу', async () => {
        try { const r = await pixelHeroRequest('/api/awards/update', { id: a.id, available: !a.available }); awdState.awards = r.awards; renderAwards(); awdMsg(a.available ? 'Выдача закрыта.' : 'Выдача открыта.', 'success'); } catch (e) { awdMsg(e.message, 'error'); }
      });
      const edit = mkBtn('Изменить', () => startAwardEdit(a));
      const del = mkBtn('Удалить', async () => {
        if (!await ui3Confirm(`Удалить награду «${a.title}»? Она пропадёт и у всех, кто её получил (${a.holders}).`)) return;
        try { const r = await pixelHeroRequest('/api/awards/delete', { id: a.id }); awdState.awards = r.awards; renderAwards(); awdMsg('Награда удалена.', 'success'); } catch (e) { awdMsg(e.message, 'error'); }
      });
      row.append(toggle, edit, del);
      tx.append(t, document.createElement('br'), st, d, w, h, row); it.append(awdIconEl(a, 'awd-ic'), tx); list.appendChild(it);
    });
    const lg = awdEl('awdLog'); lg.textContent = '';
    awdState.log.forEach((x) => { const li = document.createElement('li'); li.textContent = `${new Date(x.at).toLocaleString('ru-RU')} — «${x.title}»: ${x.how === 'cancelled' ? 'отменено' : x.count + ' чел.' + (x.how === 'manual' ? ' (вручную)' : '')}`; lg.appendChild(li); });
    if (!awdState.log.length) { const li = document.createElement('li'); li.textContent = 'Пока пусто.'; lg.appendChild(li); }
    clearTimeout(awdTimer);
    if (ev) awdTimer = setTimeout(loadAwards, 5000);
  }
  async function loadAwards() {
    try { const r = await pixelHeroRequest('/api/awards'); awdState = { awards: r.awards, event: r.event, log: r.log, limits: r.limits }; renderAwards(); }
    catch (e) { awdMsg('Не удалось загрузить награды: ' + e.message, 'error'); }
  }
  async function finishAwardEvent(cancel) {
    try { const r = await pixelHeroRequest('/api/awards/event/finish', { cancel }); awdMsg(cancel ? 'Событие отменено, награда не выдана.' : `Событие завершено. Награду получили: ${r.granted}.`, 'success'); await loadAwards(); }
    catch (e) { awdMsg(e.message, 'error'); }
  }
  awdEl('awdIconFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { const r = await shrinkIcon(f); setAwdIcon(r.icon, r.small); awdMsg(''); } catch (err) { setAwdIcon(''); awdMsg(err.message, 'error'); }
  });
  awdEl('btnAwdIconClear').addEventListener('click', () => { setAwdIcon(''); awdEl('awdIconFile').value = ''; });
  const awdForm = () => ({ title: awdEl('awdTitle').value, description: awdEl('awdDesc').value, howTo: awdEl('awdHowTo').value, icon: awdIcon, iconSmall: awdIconSmall });
  const awdResetForm = () => { awdEl('awdTitle').value = ''; awdEl('awdDesc').value = ''; awdEl('awdHowTo').value = ''; setAwdIcon(''); awdEl('awdIconFile').value = ''; };
  awdEl('btnAwdStart').addEventListener('click', async () => {
    const mins = Number(awdEl('awdMinutes').value);
    try { const r = await pixelHeroRequest('/api/awards/event/start', { ...awdForm(), durationMin: mins }); awdMsg(`Событие запущено на ${mins} мин. Уже участвуют: ${r.event.participants}.`, 'success'); awdResetForm(); await loadAwards(); }
    catch (e) { awdMsg(e.message, 'error'); }
  });
  awdEl('btnAwdCreate').addEventListener('click', async () => {
    try { await pixelHeroRequest('/api/awards/create', awdForm()); awdMsg('Награда создана. Её можно выдать вручную.', 'success'); awdResetForm(); await loadAwards(); }
    catch (e) { awdMsg(e.message, 'error'); }
  });

  /* правка существующей награды: форма переходит в режим редактирования; иконку менять не обязательно */
  let awdEditId = null;
  function setAwdEditMode(on) {
    ['btnAwdStart', 'btnAwdCreate'].forEach((id) => { awdEl(id).hidden = on; });
    awdEl('btnAwdSave').hidden = !on; awdEl('btnAwdCancelEdit').hidden = !on;
    awdEl('awdFormTitle').textContent = on ? 'Изменить награду' : 'Новое событие';
    if (!on) awdEditId = null;
  }
  function startAwardEdit(a) {
    awdEditId = a.id; setAwdEditMode(true);
    awdEl('awdTitle').value = a.title; awdEl('awdDesc').value = a.description || ''; awdEl('awdHowTo').value = a.howTo || '';
    setAwdIcon('', ''); awdEl('awdIconFile').value = '';
    awdEl('awdIconPreview').style.backgroundImage = a.icon ? `url("${a.icon}")` : '';
    awdMsg('Меняете награду «' + a.title + '». Иконку можно не выбирать — останется прежняя.');
    awdEl('awdTitle').focus();
  }
  awdEl('btnAwdCancelEdit').addEventListener('click', () => { awdResetForm(); setAwdEditMode(false); awdMsg(''); });
  awdEl('btnAwdSave').addEventListener('click', async () => {
    const f = awdForm(); const body = { id: awdEditId, title: f.title, description: f.description, howTo: f.howTo };
    if (f.icon) { body.icon = f.icon; body.iconSmall = f.iconSmall; }
    try { const r = await pixelHeroRequest('/api/awards/update', body); awdState.awards = r.awards; awdMsg('Изменения сохранены.', 'success'); awdResetForm(); setAwdEditMode(false); renderAwards(); }
    catch (e) { awdMsg(e.message, 'error'); }
  });
  awdEl('btnAwdGrantAll').addEventListener('click', async () => {
    const id = awdEl('awdGrantAward').value; if (!id) { awdMsg('Сначала создайте награду.', 'error'); return; }
    const a = awdState.awards.find((x) => x.id === id);
    if (!await ui3Confirm(`Выдать награду «${a ? a.title : ''}» ВСЕМ, у кого есть профиль (весь список игроков)?`)) return;
    try { const r = await pixelHeroRequest('/api/awards/grant-all', { awardId: id }); awdMsg(`Выдано: ${r.granted} из ${r.total}` + (r.granted < r.total ? ' (у остальных награда уже была).' : '.'), 'success'); await loadAwards(); }
    catch (e) { awdMsg(e.message, 'error'); }
  });
  awdEl('btnAwdGrant').addEventListener('click', async () => {
    const id = awdEl('awdGrantAward').value; if (!id) { awdMsg('Сначала создайте награду.', 'error'); return; }
    try {
      const r = await pixelHeroRequest('/api/awards/grant', { awardId: id, logins: awdEl('awdGrantLogins').value });
      awdMsg(`Выдано: ${r.granted}.` + (r.skipped.length ? ` Не найдены профили у: ${r.skipped.slice(0, 20).join(', ')}${r.skipped.length > 20 ? '…' : ''} (они ещё ни разу не писали в чат).` : ''), r.granted ? 'success' : 'error');
      awdEl('awdGrantLogins').value = ''; await loadAwards();
    } catch (e) { awdMsg(e.message, 'error'); }
  });

  /* ---------- Внутренние вкладки ЧатАватаров: Аватары / Топ игроков / Настройки ---------- */
  const PIXEL_PANE_KEY = 'pixelSubtab';
  const pixelSubtabs = document.querySelectorAll('.pixel-subtab');
  function activatePixelPane(name) {
    if (!document.getElementById('pixelPane-' + name)) name = 'heroes';
    pixelSubtabs.forEach((b) => { const on = b.dataset.pixelPane === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.querySelectorAll('.pixel-pane').forEach((pane) => { const on = pane.id === 'pixelPane-' + name; pane.classList.toggle('active', on); pane.hidden = !on; });
    hidePixelTip(); closePixelPopover();
    try { localStorage.setItem(PIXEL_PANE_KEY, name); } catch (e) { /* без хранилища просто не запомним */ }
    if (name === 'top') loadPixelTop();
    if (name === 'events') loadAwards();
  }
  pixelSubtabs.forEach((b) => b.addEventListener('click', () => activatePixelPane(b.dataset.pixelPane)));
  let savedPixelPane = 'heroes';
  try { savedPixelPane = localStorage.getItem(PIXEL_PANE_KEY) || 'heroes'; } catch (e) { /* ок */ }
  activatePixelPane(savedPixelPane);

  (async function loadPixelHeroes() {
    try {
      const data = await pixelHeroRequest('/api/pixel-heroes');
      pixelHeroesState = { heroes: data.heroes, active: data.active, settings: data.settings || pixelHeroesState.settings, groupScale: data.groupScale || {}, heroScale: data.heroScale || {}, tag: { ...TAG_DEFAULT, ...(data.tag || {}) }, behavior: data.behavior || null };
      syncPixelToggles();
      syncTagControls();
      syncBehaviorControls();
    } catch (e) {
      showPixelHeroMessage('Не удалось загрузить список героев — нет связи с сервером.', 'error');
    }
    renderPixelHeroes();
    loadPixelTop(); // топ строится после списка героев: аватару профиля нужны данные героя
  })();

  /* ---------- Расширение Twitch: настройки и состояние отправки ---------- */
  (function setupTwitchExt() {
    const $ = (id) => document.getElementById(id);
    const msg = $('extMessage');
    let msgTimer = null;
    const say = (text, kind) => { msg.textContent = text; msg.className = 'form-message' + (kind ? ' ' + kind : ''); clearTimeout(msgTimer); if (kind === 'success') msgTimer = setTimeout(() => { msg.textContent = ''; msg.className = 'form-message'; }, 6000); };
    async function api(url, body) {
      const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { const e = new Error((data && data.error) || 'Не удалось выполнить действие.'); e.data = data; throw e; }
      return data;
    }
    const ago = (ms) => { if (!ms) return '—'; const s2 = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s2 < 5 ? 'только что' : s2 < 90 ? s2 + ' с назад' : s2 < 5400 ? Math.round(s2 / 60) + ' мин назад' : new Date(ms).toLocaleString('ru-RU'); };
    let formDirty = false;       // пока человек правит поля, автообновление их не перезаписывает
    ['extEnabled', 'extClientId', 'extSecret', 'extOwnerId', 'extTopSize', 'extInterval', 'extMaxBytes'].forEach((id) => $(id).addEventListener('input', () => { formDirty = true; }));

    function fillForm(c) {
      $('extEnabled').checked = !!c.enabled;
      $('extClientId').value = c.clientId || '';
      $('extSecret').value = '';
      $('extSecret').placeholder = c.hasSecret ? 'Key сохранён (введите новый, чтобы заменить)' : 'Вставьте Key расширения';
      $('extSecretStatus').textContent = c.hasSecret ? 'сохранён' : 'не задан';
      $('extOwnerId').value = c.ownerId || '';
      $('extOwnerHint').textContent = c.ownerIdEffective ? 'Сейчас используется ID канала: ' + c.ownerIdEffective + '.' : 'ID канала пока неизвестен: выполните вход через Twitch на вкладке «Подключения» или впишите ID вручную.';
      $('extTopSize').value = c.topSize; $('extInterval').value = c.intervalSec; $('extMaxBytes').value = c.maxBytes;
    }
    function renderState(d) {
      const c = d.config, st = d.status, pv = d.preview || {};
      const dot = $('extStatusDot'), text = $('extStatusText');
      dot.className = 'status-summary-dot';
      if (!c.configured) text.textContent = 'Не настроено: укажите Client ID и Key расширения' + (c.ownerIdEffective ? '.' : ' и выполните вход через Twitch.');
      else if (!c.enabled) text.textContent = 'Настроено, но отправка выключена.';
      else if (st.lastError && st.lastErrorAt >= st.lastOkAt) { dot.classList.add('error'); text.textContent = 'Ошибка отправки: ' + st.lastError; }
      else if (st.lastOkAt) { dot.classList.add('online'); text.textContent = 'Отправка работает · последняя ' + ago(st.lastOkAt); }
      else text.textContent = 'Включено — ждём первую отправку.';
      const rows = [
        ['На сцене сейчас', pv.stage], ['В топе (в снимке)', pv.top], ['Игроков в снимке', pv.players],
        ['Размер снимка', pv.bytes !== undefined ? pv.bytes + ' из ' + pv.maxBytes + ' байт' : '—'],
        ['Урезано из-за размера', pv.trimmedTop || pv.trimmedStage ? 'топ −' + (pv.trimmedTop || 0) + ', сцена −' + (pv.trimmedStage || 0) : 'нет'],
        ['Отправок с запуска сервера', st.sent], ['Последняя успешная', ago(st.lastOkAt)],
      ];
      const box = $('extStats'); box.replaceChildren();
      rows.forEach(([k, v]) => { const a = document.createElement('span'); a.className = 'k'; a.textContent = k; const b = document.createElement('span'); b.className = 'v'; b.textContent = String(v === undefined ? '—' : v); box.append(a, b); });
      if (st.lastError) { const a = document.createElement('span'); a.className = 'k'; a.textContent = 'Последняя ошибка'; const b = document.createElement('span'); b.className = 'v err'; b.textContent = st.lastError; box.append(a, b); }
    }
    async function refresh(fill) {
      try { const d = await api('/api/extension'); if (fill || !formDirty) fillForm(d.config); renderState(d); }
      catch (e) { $('extStatusText').textContent = 'Нет связи с сервером.'; }
    }
    const readForm = () => ({ enabled: $('extEnabled').checked, clientId: $('extClientId').value.trim(), secret: $('extSecret').value.trim(), ownerId: $('extOwnerId').value.trim(), topSize: Number($('extTopSize').value), intervalSec: Number($('extInterval').value), maxBytes: Number($('extMaxBytes').value) });
    async function save() {
      try { const d = await api('/api/extension', readForm()); formDirty = false; fillForm(d.config); say('Сохранено.', 'success'); await refresh(true); return true; }
      catch (e) { say(e.message, 'error'); return false; }
    }
    $('btnExtSave').addEventListener('click', save);
    $('btnExtSend').addEventListener('click', async () => {
      if (formDirty && !(await save())) return;
      const btn = $('btnExtSend'); btn.disabled = true;
      try { const d = await api('/api/extension/send', {}); say('Отправлено в Twitch (' + d.result.bytes + ' байт).', 'success'); }
      catch (e) { say(e.message, 'error'); }
      btn.disabled = false; refresh(false);
    });
    refresh(true);
    setInterval(() => { if (!document.hidden && $('tab-twitchext').classList.contains('active')) refresh(false); }, 5000);
  })();

  /* ---------- Вкладки ---------- */

  const navItems = document.querySelectorAll('.nav-item');
  const tabSections = document.querySelectorAll('.tab-section');

  let currentTabId = 'auth';
  function activateTab(tabName) {
    currentTabId = tabName;
    navItems.forEach((item) => item.classList.toggle('active', item.dataset.tab === tabName));
    tabSections.forEach((section) => section.classList.toggle('active', section.id === `tab-${tabName}`));
    localStorage.setItem(TAB_KEY, tabName);
  }

  navItems.forEach((item) => {
    item.addEventListener('click', () => activateTab(item.dataset.tab));
  });

  const savedTab = localStorage.getItem(TAB_KEY);
  if (savedTab && document.getElementById(`tab-${savedTab}`)) {
    activateTab(savedTab);
  }

  // Возврат из OAuth-редиректа (/auth/twitch/callback или /auth/donationalerts/callback)
  // может нести ?tab=...&authError=... / ?tab=donations&donationsError=...
  const urlParams = new URLSearchParams(location.search);
  const paramTab = urlParams.get('tab');
  const paramAuthError = urlParams.get('authError');
  const paramDonationsError = urlParams.get('donationsError');
  if (paramTab && document.getElementById(`tab-${paramTab}`)) {
    activateTab(paramTab);
  }
  if (paramTab || paramAuthError || paramDonationsError) {
    // подчищаем URL, чтобы при обновлении страницы не срабатывало повторно
    history.replaceState({}, '', location.pathname);
  }

  /* ---------- Показать/скрыть Client Secret ---------- */

  const clientIdInput = document.getElementById('clientId');
  const secretInput = document.getElementById('clientSecret');
  const twitchRememberToggle = document.getElementById('twitchRememberToggle');
  const toggleSecretBtn = document.getElementById('toggleSecret');
  toggleSecretBtn.addEventListener('click', () => {
    secretInput.type = secretInput.type === 'password' ? 'text' : 'password';
  });

  /* ---------- Живой статус: сайдбар + сводка на вкладке авторизации ---------- */

  const sidebarDot = document.getElementById('statusDot');
  const sidebarText = document.getElementById('statusText');
  const authDot = document.getElementById('authStatusDot');
  const authText = document.getElementById('authStatusText');
  const formMessage = document.getElementById('authFormMessage');

  const envCredentialsCard = document.getElementById('envCredentialsCard');
  const credentialsCard = document.getElementById('credentialsCard');
  const clientIdStatus = document.getElementById('clientIdStatus');
  const clientSecretStatus = document.getElementById('clientSecretStatus');

  const oauthConnected = document.getElementById('oauthConnected');
  const oauthDisconnected = document.getElementById('oauthDisconnected');
  const oauthAvatar = document.getElementById('oauthAvatar');
  const oauthName = document.getElementById('oauthName');
  const oauthConnectedSince = document.getElementById('oauthConnectedSince');
  const btnOauthLogin = document.getElementById('btnOauthLogin');
  const btnOauthLogout = document.getElementById('btnOauthLogout');
  const callbackUrlField = document.getElementById('callbackUrlField');
  const btnCopyCallback = document.getElementById('btnCopyCallback');

  function setSidebarStatus(overlayOnline) {
    sidebarDot.classList.toggle('offline', !overlayOnline);
    sidebarText.textContent = overlayOnline ? 'Оверлей: онлайн' : 'Оверлей: офлайн';
  }

  const twitchStatusPill = document.getElementById('twitchStatusPill');
  const streamStatusPill = document.getElementById('streamStatusPill');

  function applyStatusPills(twitchConnected, streamLive) {
    twitchStatusPill.classList.toggle('active', !!twitchConnected);
    twitchStatusPill.querySelector('.status-pill-text').textContent = twitchConnected ? 'Подключён' : 'Не подключён';
    streamStatusPill.classList.toggle('active', !!streamLive);
    streamStatusPill.querySelector('.status-pill-text').textContent = streamLive ? 'Онлайн' : 'Офлайн';
  }


  function setAuthSummary(twitch) {
    authDot.classList.remove('online', 'error');
    if (twitch.connected) {
      authDot.classList.add('online');
      const when = twitch.validatedAt ? new Date(twitch.validatedAt).toLocaleString('ru-RU') : '';
      authText.textContent = `Подключено${when ? ' · проверено ' + when : ''}`;
    } else if (twitch.error) {
      authDot.classList.add('error');
      authText.textContent = `Не подключено — ${twitch.error}`;
    } else {
      authText.textContent = 'Не подключено';
    }

    // индикаторы у полей Client ID / Client Secret отражают тот же результат
    // проверки (Twitch подтверждает пару целиком, а не поля по отдельности)
    [clientIdStatus, clientSecretStatus].forEach((el) => {
      el.classList.remove('valid', 'invalid');
      if (twitch.connected) { el.classList.add('valid'); el.textContent = '✓'; }
      else if (twitch.error) { el.classList.add('invalid'); el.textContent = '✗'; }
      else { el.textContent = '★'; }
    });
  }

  function setOauthUI(oauth) {
    if (oauth && oauth.connected) {
      oauthConnected.style.display = 'flex';
      oauthDisconnected.style.display = 'none';
      oauthAvatar.src = oauth.avatarUrl || '';
      oauthName.textContent = oauth.displayName || oauth.login || '';
      oauthConnectedSince.textContent = oauth.connectedAt
        ? 'Подключено · ' + new Date(oauth.connectedAt).toLocaleString('ru-RU')
        : 'Подключено';
    } else {
      oauthConnected.style.display = 'none';
      oauthDisconnected.style.display = 'block';
    }
  }

  function setCredentialsSourceUI(source) {
    const fromEnv = source === 'env';
    envCredentialsCard.style.display = fromEnv ? 'block' : 'none';
    credentialsCard.style.display = fromEnv ? 'none' : 'block';
  }

  function showFormMessage(text, kind) {
    formMessage.textContent = text;
    formMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  // Живое обновление статуса — WebSocket, без перезагрузки страницы/оверлея.
  function connectStatusSocket() {
    const ws = new WebSocket(`ws://${location.host}/?type=admin`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'status') {
        setSidebarStatus(data.overlayOnline);
        setAuthSummary(data.twitch);
        setOauthUI(data.twitch.oauth);
        setCredentialsSourceUI(data.twitch.credentialsSource);
        applyStatusPills(data.twitch.connected, data.streamLive);
        if (data.chatBot) applyChatBotIndicators(data.chatBot); // индикатор «Чат-бот» в шапке + точка на кнопке авторизации

        // Живое превью на вкладке "Виджеты оверлея" — свежие данные зрителей
        // и текущие настройки содержимого виджетов (определены ниже по файлу,
        // но к моменту прихода этого сообщения уже проинициализированы).
        //
        // ВАЖНО: сюда прилетает и наша же собственная рассылка после сохранения
        // (сервер шлёт broadcastAdminStatus всем админ-клиентам, включая того,
        // кто сохранял) плюс холостой тик раз в 2 сек. Поэтому здесь НИКОГДА не
        // перерисовываем панель настроек/ползунки — только фоновые данные и
        // само превью виджета. Ползунок трогает только пользователь руками
        // (см. renderWidgetContentSettingsPanel) — иначе он будет дёргаться
        // обратно на старое значение прямо во время перетаскивания.
        if (data.topChatters) {
          latestTopChatters = data.topChatters;
          refreshLivePreview('activity');
        }
        if (data.widgetSettings) {
          Object.keys(data.widgetSettings).forEach((id) => {
            // не затираем виджет, который сейчас редактируется (ждёт дебаунс-сохранения) —
            // иначе можно потерять локальное движение ползунка гонкой состояний
            if (id === widgetSettingsPendingId) return;
            widgetSettingsState[id] = data.widgetSettings[id];
          });
          refreshLivePreview(selectedWidgetId);
        }
        if (data.donations) applyDonationsStatus(data.donations);
      } else if (data.type === 'donation') {
        onDonationReceived(data.donation);
      }
    };
    ws.onclose = () => {
      setSidebarStatus(false);
      setTimeout(connectStatusSocket, 3000); // переподключение, если сервер моргнул
    };
  }
  connectStatusSocket();

  /* ---------- Загрузка текущего состояния при открытии вкладки ---------- */

  async function loadStatus() {
    try {
      const res = await fetch('/api/twitch/status');
      const data = await res.json();
      setAuthSummary(data);
      setOauthUI(data.oauth);
      setCredentialsSourceUI(data.credentialsSource);
      applyStatusPills(data.connected, data.streamLive);
      callbackUrlField.value = data.callbackUrl || '';
      clientIdInput.value = data.clientId || '';
      secretInput.value = '';
      secretInput.placeholder = data.hasSecret
        ? 'Сохранён — введите новый, чтобы заменить'
        : 'Вставьте Client Secret';
      twitchRememberToggle.checked = !!data.remembered;
    } catch (e) {
      authText.textContent = 'Не удалось получить статус с сервера';
    }
  }
  loadStatus();

  if (paramAuthError) {
    showFormMessage(paramAuthError, 'error');
  }

  btnOauthLogin.addEventListener('click', () => {
    window.location.href = '/auth/twitch/login';
  });

  btnOauthLogout.addEventListener('click', async () => {
    btnOauthLogout.disabled = true;
    try {
      await postJSON('/api/twitch/logout', {});
      await loadStatus();
      showFormMessage('Канал отключён.', 'success');
    } catch (e) {
      showFormMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnOauthLogout.disabled = false;
    }
  });

  btnCopyCallback.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(callbackUrlField.value);
      const original = btnCopyCallback.textContent;
      btnCopyCallback.textContent = 'Скопировано';
      setTimeout(() => { btnCopyCallback.textContent = original; }, 1500);
    } catch (e) {
      callbackUrlField.select();
    }
  });

  /* ---------- Кнопки: Подключиться / Проверить / Отключить ---------- */

  const btnConnect = document.getElementById('btnConnect');
  const btnVerify = document.getElementById('btnVerify');
  const btnDisconnect = document.getElementById('btnDisconnect');
  const allButtons = [btnConnect, btnVerify, btnDisconnect];

  function setButtonsDisabled(disabled) {
    allButtons.forEach((b) => { b.disabled = disabled; b.style.opacity = disabled ? '0.6' : ''; });
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return { ok: res.ok, data: await res.json() };
  }

  btnConnect.addEventListener('click', async () => {
    const clientId = clientIdInput.value.trim();
    const clientSecret = secretInput.value;
    if (!clientId || !clientSecret) {
      showFormMessage('Заполните оба поля — Client ID и Client Secret.', 'error');
      return;
    }
    setButtonsDisabled(true);
    showFormMessage('Проверяем ключи через Twitch…', '');
    try {
      const { ok, data } = await postJSON('/api/twitch/connect', { clientId, clientSecret, remember: twitchRememberToggle.checked });
      if (ok && data.success) {
        showFormMessage('Подключено и сохранено. Оверлей подхватит ключи без перезапуска.', 'success');
        await loadStatus();
      } else {
        showFormMessage(data.error || 'Не удалось подключиться.', 'error');
      }
    } catch (e) {
      showFormMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      setButtonsDisabled(false);
    }
  });

  btnVerify.addEventListener('click', async () => {
    const clientId = clientIdInput.value.trim();
    const clientSecret = secretInput.value;
    if (!clientId || !clientSecret) {
      showFormMessage('Заполните оба поля, чтобы проверить.', 'error');
      return;
    }
    setButtonsDisabled(true);
    showFormMessage('Проверяем…', '');
    try {
      const { data } = await postJSON('/api/twitch/verify', { clientId, clientSecret });
      showFormMessage(data.valid ? 'Ключи верные.' : (data.error || 'Ключи не подошли.'), data.valid ? 'success' : 'error');
    } catch (e) {
      showFormMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      setButtonsDisabled(false);
    }
  });

  btnDisconnect.addEventListener('click', async () => {
    setButtonsDisabled(true);
    showFormMessage('Отключаем…', '');
    try {
      await postJSON('/api/twitch/disconnect', {});
      clientIdInput.value = '';
      secretInput.value = '';
      showFormMessage('Отключено. Оверлей продолжит работать без аватарок и категорий.', 'success');
      await loadStatus();
    } catch (e) {
      showFormMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      setButtonsDisabled(false);
    }
  });

  /* ================================================================
     Вкладка "Основные настройки" — цвета, шрифты, размеры
  ================================================================ */

  const FONT_LIST = [
    'Inter', 'Unbounded', 'Roboto', 'Montserrat', 'Oswald', 'Rubik',
    'JetBrains Mono', 'Playfair Display', 'Poppins', 'Bebas Neue',
    'Comfortaa', 'Press Start 2P', 'Nunito', 'Manrope', 'Space Grotesk',
  ];

  const themeAccent = document.getElementById('themeAccent');
  const themeTextMain = document.getElementById('themeTextMain');
  const themeBgPanel = document.getElementById('themeBgPanel');
  const themeBgAlpha = document.getElementById('themeBgAlpha');
  const themeBgAlphaValue = document.getElementById('themeBgAlphaValue');
  const themeFontMain = document.getElementById('themeFontMain');
  const themeFontText = document.getElementById('themeFontText');
  const themeFontSizeMain = document.getElementById('themeFontSizeMain');
  const themeFontSizeMainValue = document.getElementById('themeFontSizeMainValue');
  const themeFontSizeText = document.getElementById('themeFontSizeText');
  const themeFontSizeTextValue = document.getElementById('themeFontSizeTextValue');
  const fontPreviewMain = document.getElementById('fontPreviewMain');
  const fontPreviewText = document.getElementById('fontPreviewText');
  const btnThemeSave = document.getElementById('btnThemeSave');
  const btnThemeReset = document.getElementById('btnThemeReset');
  const themeFormMessage = document.getElementById('themeFormMessage');

  FONT_LIST.forEach((font) => {
    [themeFontMain, themeFontText].forEach((select) => {
      const opt = document.createElement('option');
      opt.value = font;
      opt.textContent = font;
      select.appendChild(opt.cloneNode(true));
    });
  });

  /* --- Свои шрифты (загрузка .ttf/.otf/.woff/.woff2 через админку) --- */

  const btnAddFont = document.getElementById('btnAddFont');
  const fontUploadInput = document.getElementById('fontUploadInput');
  const fontUploadMessage = document.getElementById('fontUploadMessage');
  const customFontsById = new Map(); // name -> {name, file, url, format}

  function showFontUploadMessage(text, kind) {
    fontUploadMessage.textContent = text;
    fontUploadMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  /** Подключает @font-face, чтобы свой шрифт можно было реально показать в превью/списках. */
  function injectCustomFontFace(font) {
    const styleId = 'customfont-' + font.name.replace(/\s+/g, '-');
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@font-face { font-family: '${font.name}'; src: url('${font.url}') format('${font.format}'); font-display: swap; }`;
    document.head.appendChild(style);
  }

  /** Перестраивает выпадающие списки: встроенные шрифты + отдельная группа "Свои шрифты". */
  function rebuildFontOptions(customFontsList) {
    [themeFontMain, themeFontText].forEach((select) => {
      const current = select.value;
      const oldGroup = select.querySelector('optgroup[data-custom-fonts]');
      if (oldGroup) oldGroup.remove();
      if (customFontsList.length) {
        const group = document.createElement('optgroup');
        group.label = 'Свои шрифты';
        group.dataset.customFonts = '1';
        customFontsList.forEach((f) => {
          const opt = document.createElement('option');
          opt.value = f.name;
          opt.textContent = f.name;
          group.appendChild(opt);
        });
        select.appendChild(group);
      }
      // сохраняем текущий выбор, если он всё ещё существует в списке (включая только что добавленные)
      if (current && [...select.options].some((o) => o.value === current)) select.value = current;
    });
    // На случай гонки при первой загрузке: если тема уже подгрузилась раньше списка своих
    // шрифтов и ссылалась на кастомный шрифт, которого тогда ещё не было в <select> —
    // досинхронизируем выбор теперь, когда шрифт наконец появился в списке.
    if (lastLoadedTheme) {
      if ([...themeFontMain.options].some((o) => o.value === lastLoadedTheme.fontMain)) {
        themeFontMain.value = lastLoadedTheme.fontMain;
      }
      if ([...themeFontText.options].some((o) => o.value === lastLoadedTheme.fontText)) {
        themeFontText.value = lastLoadedTheme.fontText;
      }
      updatePreview();
    }
  }

  function applyCustomFonts(list) {
    customFontsById.clear();
    (list || []).forEach((f) => {
      customFontsById.set(f.name, f);
      injectCustomFontFace(f);
    });
    rebuildFontOptions(list || []);
  }

  async function loadCustomFonts() {
    try {
      const res = await fetch('/api/fonts/list');
      const data = await res.json();
      applyCustomFonts(data.fonts || []);
    } catch (e) {
      // не критично — просто не увидим свои шрифты в списке, пока не перезагрузим страницу
    }
  }
  loadCustomFonts();

  btnAddFont.addEventListener('click', () => fontUploadInput.click());

  fontUploadInput.addEventListener('change', async () => {
    const files = fontUploadInput.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('fonts', file));

    btnAddFont.disabled = true;
    showFontUploadMessage('Загружаем шрифты…', '');
    try {
      const res = await fetch('/api/fonts/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        applyCustomFonts(data.fonts || []);
        showFontUploadMessage('Шрифты загружены — уже доступны в списках выше.', 'success');
      } else {
        showFontUploadMessage((data && data.error) || 'Не удалось загрузить шрифты.', 'error');
      }
    } catch (e) {
      showFontUploadMessage('Сетевая ошибка при загрузке шрифтов.', 'error');
    } finally {
      btnAddFont.disabled = false;
      fontUploadInput.value = ''; // сброс — иначе повторный выбор тех же файлов не даст событие change
    }
  });

  function rgbArrayToHex([r, g, b]) {
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  function hexToRgbArray(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function showThemeMessage(text, kind) {
    themeFormMessage.textContent = text;
    themeFormMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function updatePreview() {
    fontPreviewMain.style.fontFamily = `'${themeFontMain.value}', sans-serif`;
    fontPreviewMain.style.color = themeAccent.value;
    fontPreviewMain.style.fontSize = themeFontSizeMain.value + 'px';
    fontPreviewText.style.fontFamily = `'${themeFontText.value}', sans-serif`;
    fontPreviewText.style.color = themeTextMain.value;
    fontPreviewText.style.fontSize = themeFontSizeText.value + 'px';
    themeBgAlphaValue.textContent = themeBgAlpha.value + '%';
    themeFontSizeMainValue.textContent = themeFontSizeMain.value + 'px';
    themeFontSizeTextValue.textContent = themeFontSizeText.value + 'px';
  }

  let lastLoadedTheme = null;

  function applyThemeToForm(theme) {
    lastLoadedTheme = theme;
    themeAccent.value = theme.accent;
    themeTextMain.value = theme.textMain;
    themeBgPanel.value = rgbArrayToHex(theme.bgPanelRGB);
    themeBgAlpha.value = Math.round(theme.bgPanelAlpha * 100);
    themeFontMain.value = theme.fontMain;
    themeFontText.value = theme.fontText;
    themeFontSizeMain.value = theme.fontSizeMain;
    themeFontSizeText.value = theme.fontSizeText;
    updatePreview();
  }

  [themeAccent, themeTextMain, themeBgPanel, themeBgAlpha,
    themeFontMain, themeFontText, themeFontSizeMain, themeFontSizeText].forEach((el) => {
    el.addEventListener('input', updatePreview);
  });

  async function loadTheme() {
    try {
      const res = await fetch('/api/theme');
      const data = await res.json();
      applyThemeToForm(data.theme);
    } catch (e) {
      showThemeMessage('Не удалось загрузить настройки с сервера.', 'error');
    }
  }
  loadTheme();

  /* --- Блок "Темы" — готовые пресеты (цвета+прозрачность+шрифты+размеры одним кликом) --- */

  const themePresetSelect = document.getElementById('themePresetSelect');
  const themePresetMessage = document.getElementById('themePresetMessage');

  function showThemePresetMessage(text, kind) {
    themePresetMessage.textContent = text;
    themePresetMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  async function loadThemePresets() {
    try {
      const res = await fetch('/api/themes');
      const data = await res.json();
      themePresetSelect.innerHTML = '';
      (data.themes || []).forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        themePresetSelect.appendChild(opt);
      });
      if (data.selected) themePresetSelect.value = data.selected;
    } catch (e) {
      showThemePresetMessage('Не удалось загрузить список тем.', 'error');
    }
  }
  loadThemePresets();

  themePresetSelect.addEventListener('change', async () => {
    const themeId = themePresetSelect.value;
    showThemePresetMessage('Применяем…', '');
    try {
      const { ok, data } = await postJSON('/api/themes/apply', { themeId });
      if (ok && data.success) {
        applyThemeToForm(data.theme); // подставляем новые значения в поля выше — оверлей уже обновлён сервером
        showThemePresetMessage(`Тема «${themePresetSelect.selectedOptions[0].textContent}» применена.`, 'success');
      } else {
        showThemePresetMessage((data && data.error) || 'Не удалось применить тему.', 'error');
      }
    } catch (e) {
      showThemePresetMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });


  btnThemeSave.addEventListener('click', async () => {
    const body = {
      accent: themeAccent.value,
      textMain: themeTextMain.value,
      bgPanelRGB: hexToRgbArray(themeBgPanel.value),
      bgPanelAlpha: Number(themeBgAlpha.value) / 100,
      fontMain: themeFontMain.value,
      fontText: themeFontText.value,
      fontSizeMain: Number(themeFontSizeMain.value),
      fontSizeText: Number(themeFontSizeText.value),
    };
    btnThemeSave.disabled = true;
    btnThemeReset.disabled = true;
    showThemeMessage('Сохраняем…', '');
    try {
      const { ok, data } = await postJSON('/api/theme', body);
      if (ok && data.success) {
        applyThemeToForm(data.theme);
        showThemeMessage('Сохранено и применено на оверлее.', 'success');
      } else {
        showThemeMessage('Не удалось сохранить настройки.', 'error');
      }
    } catch (e) {
      showThemeMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnThemeSave.disabled = false;
      btnThemeReset.disabled = false;
    }
  });

  btnThemeReset.addEventListener('click', async () => {
    btnThemeSave.disabled = true;
    btnThemeReset.disabled = true;
    showThemeMessage('Сбрасываем…', '');
    try {
      const { ok, data } = await postJSON('/api/theme/reset', {});
      if (ok && data.success) {
        applyThemeToForm(data.theme);
        showThemeMessage('Возвращены значения по умолчанию.', 'success');
      } else {
        showThemeMessage('Не удалось сбросить настройки.', 'error');
      }
    } catch (e) {
      showThemeMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnThemeSave.disabled = false;
      btnThemeReset.disabled = false;
    }
  });

  /* ================================================================
     Вкладка "Виджеты оверлея" — позиция/размер/вкл-выкл, drag-n-drop
  ================================================================ */

  const SCENE_W = 1920, SCENE_H = 1080, EDGE_SNAP = 10, MIN_SIZE = 40;
  // Варианты сетки привязки: шаг по X и по Y в пикселях сцены 1920×1080.
  const GRID_MODES = [
    { id: 'off', label: 'Без сетки (свободно)', sx: 1, sy: 1 },
    { id: '10', label: 'Мелкая 10×10', sx: 10, sy: 10 },
    { id: '20', label: 'Стандартная 20×20', sx: 20, sy: 20 },
    { id: '40', label: 'Крупная 40×40', sx: 40, sy: 40 },
    { id: '60', label: 'Очень крупная 60×60', sx: 60, sy: 60 },
    { id: '120', label: 'Блоки 120×120 (16×9)', sx: 120, sy: 120 },
    { id: 'c24', label: '24 колонки × 12 рядов (80×90)', sx: 80, sy: 90 },
    { id: 'c12', label: '12 колонок × 12 рядов (160×90)', sx: 160, sy: 90 },
    { id: 'c8', label: '8 колонок × 6 рядов (240×180)', sx: 240, sy: 180 },
    { id: 'c4', label: '4 колонки × 4 ряда (480×270)', sx: 480, sy: 270 },
  ];
  function loadGridPrefs() { try { return { mode: localStorage.getItem('ovlGridMode') || '20', show: localStorage.getItem('ovlGridShow') !== '0' }; } catch (e) { return { mode: '20', show: true }; } }
  function saveGridPref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища не страшно */ } }
  const gridPrefs = loadGridPrefs();

  let widgetDefs = [];      // [{id, label}] — приходит с сервера, не хардкодим
  let layoutState = {};     // {id: {x,y,w,h,enabled}} — рабочая (несохранённая) копия
  let defaultsState = {};   // {id: {x,y,w,h,enabled}} — дефолты с сервера
  let selectedWidgetId = null;
  let previewScale = 1;
  let gridMode = GRID_MODES.find((g) => g.id === gridPrefs.mode) || GRID_MODES[2];
  let gridShow = gridPrefs.show;

  // Настройки СОДЕРЖИМОГО виджетов (не позиция/размер) — универсально по схеме с сервера.
  let widgetSettingsSchema = {};   // {widgetId: {key: {label, unit, min, max, step, default}}}
  let widgetSettingsState = {};    // {widgetId: {key: value}} — рабочая (несохранённая) копия
  let latestTopChatters = [];      // для живого превью блока "Активность", обновляется по WS
  let widgetSettingsPendingId = null; // id виджета, для которого сейчас "висит" дебаунс-сохранение
  let widgetSettingsSaveTimer = null;

  const widgetListEl = document.getElementById('widgetList');
  const overlayWidgetUrlField = document.getElementById('overlayWidgetUrl');
  const btnCopyOverlayWidgetUrl = document.getElementById('btnCopyOverlayWidgetUrl');
  overlayWidgetUrlField.value = `http://localhost:${location.port || 3001}/overlay.html`;
  const obsCopyIcon = btnCopyOverlayWidgetUrl.innerHTML;
  const obsCopyTitle = btnCopyOverlayWidgetUrl.title;
  btnCopyOverlayWidgetUrl.addEventListener('click', async () => {
    let ok = true;
    try { await navigator.clipboard.writeText(overlayWidgetUrlField.value); } catch (e) { ok = false; }
    // Подписи у кнопки нет — на секунду заменяем иконку на галочку (или показываем ссылку в подсказке, если буфер недоступен)
    btnCopyOverlayWidgetUrl.innerHTML = ok
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : obsCopyIcon;
    btnCopyOverlayWidgetUrl.title = ok ? 'Ссылка скопирована' : 'Не удалось скопировать. Ссылка: ' + overlayWidgetUrlField.value;
    btnCopyOverlayWidgetUrl.classList.toggle('on', ok);
    setTimeout(() => { btnCopyOverlayWidgetUrl.innerHTML = obsCopyIcon; btnCopyOverlayWidgetUrl.title = obsCopyTitle; btnCopyOverlayWidgetUrl.classList.remove('on'); }, 1800);
  });

  const previewFrame = document.getElementById('previewFrame');
  const previewScene = document.getElementById('previewScene');
  const gridModeSelect = document.getElementById('gridMode');
  const gridShowToggle = document.getElementById('gridShowToggle');
  const btnLayoutResetAll = document.getElementById('btnLayoutResetAll');
  const layoutFormMessage = document.getElementById('layoutFormMessage');

  const widgetContentSettings = document.getElementById('widgetContentSettings');
  const widgetContentSettingsTitle = document.getElementById('widgetContentSettingsTitle');
  const widgetContentFields = document.getElementById('widgetContentFields');
  const btnWidgetSettingsSave = document.getElementById('btnWidgetSettingsSave');
  const btnWidgetSettingsReset = document.getElementById('btnWidgetSettingsReset');
  const widgetSettingsMessage = document.getElementById('widgetSettingsMessage');

  function showLayoutMessage(text, kind) {
    layoutFormMessage.textContent = text;
    layoutFormMessage.className = 'wtool-msg form-message' + (kind ? ' ' + kind : '');
  }

  GRID_MODES.forEach((g) => { const o = document.createElement('option'); o.value = g.id; o.textContent = g.label; gridModeSelect.appendChild(o); });
  gridModeSelect.value = gridMode.id;
  gridShowToggle.checked = gridShow;
  gridModeSelect.addEventListener('change', () => { gridMode = GRID_MODES.find((g) => g.id === gridModeSelect.value) || GRID_MODES[2]; saveGridPref('ovlGridMode', gridMode.id); updateGridOverlay(); });
  gridShowToggle.addEventListener('change', () => { gridShow = gridShowToggle.checked; saveGridPref('ovlGridShow', gridShow ? '1' : '0'); updateGridOverlay(); });

  function updateGridOverlay() {
    let g = previewScene.querySelector('.preview-grid');
    if (!g) { g = document.createElement('div'); g.className = 'preview-grid'; previewScene.insertBefore(g, previewScene.firstChild); }
    const on = gridShow && gridMode.sx > 1;
    g.style.display = on ? 'block' : 'none';
    if (on) {
      g.style.backgroundSize = `${gridMode.sx}px ${gridMode.sy}px`;
    }
  }

  // Изменения раскладки уходят на оверлей сразу (с небольшой задержкой, чтобы не засыпать сервер при перетаскивании).
  let layoutSaveTimer = null;
  function scheduleLayoutSave() {
    clearTimeout(layoutSaveTimer);
    layoutSaveTimer = setTimeout(async () => {
      try {
        const { ok, data } = await postJSON('/api/layout', { layout: layoutState });
        if (ok && data.success) showLayoutMessage('Применено на оверлее.', 'success');
        else showLayoutMessage('Не удалось применить раскладку.', 'error');
      } catch (e) { showLayoutMessage('Сетевая ошибка при обращении к серверу.', 'error'); }
    }, 120);
  }

  /* --- Стиль оформления виджетов в OBS: выбор сразу применяется на оверлее --- */
  const ostyleList = document.getElementById('ostyleList');
  const ostyleGlass = document.getElementById('ostyleGlass');
  const ostyleMessage = document.getElementById('ostyleMessage');
  let ostyleState = { style: 'default', glass: true };

  function renderOverlayStyleList(styles) {
    ostyleList.innerHTML = '';
    styles.forEach((st) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ostyle-item' + (ostyleState.style === st.id ? ' active' : '');
      b.dataset.id = st.id;
      b.innerHTML = `<span class="ostyle-num">${st.num}</span><span class="ostyle-text"><b>${st.label}</b><small>${st.hint}</small></span>`;
      b.addEventListener('click', () => saveOverlayStyle({ style: st.id }));
      ostyleList.appendChild(b);
    });
    ostyleGlass.checked = ostyleState.glass !== false;
  }
  let ostyleDefs = [];
  async function loadOverlayStyle() {
    try {
      const res = await fetch('/api/overlay-style');
      const data = await res.json();
      ostyleDefs = data.styles; ostyleState = data.current;
      renderOverlayStyleList(ostyleDefs);
    } catch (e) { ostyleMessage.textContent = 'Не удалось загрузить стили.'; }
  }
  async function saveOverlayStyle(patch) {
    ostyleState = { ...ostyleState, ...patch };
    renderOverlayStyleList(ostyleDefs);
    try {
      const { ok, data } = await postJSON('/api/overlay-style', patch);
      if (ok && data.success) { ostyleState = data.current; ostyleMessage.textContent = 'Применено на оверлее.'; ostyleMessage.className = 'form-message success'; }
      else { ostyleMessage.textContent = 'Не удалось применить стиль.'; ostyleMessage.className = 'form-message error'; }
    } catch (e) { ostyleMessage.textContent = 'Сетевая ошибка.'; ostyleMessage.className = 'form-message error'; }
  }
  ostyleGlass.addEventListener('change', () => saveOverlayStyle({ glass: ostyleGlass.checked }));
  loadOverlayStyle();

  // Полноэкранный предпросмотр: сцена (с мини-панелью сетки) разворачивается на весь экран отдельным слоем, перетаскивание и растяжка работают как обычно.
  const previewStage = document.getElementById('previewStage');
  const btnWidgetsWide = document.getElementById('btnWidgetsWide');
  const gridModeFs = document.getElementById('gridModeFs');
  const gridShowFs = document.getElementById('gridShowFs');
  GRID_MODES.forEach((g) => { const o = document.createElement('option'); o.value = g.id; o.textContent = g.label; gridModeFs.appendChild(o); });
  function syncGridControls() { gridModeSelect.value = gridMode.id; gridModeFs.value = gridMode.id; gridShowToggle.checked = gridShow; gridShowFs.checked = gridShow; }
  syncGridControls();
  gridModeFs.addEventListener('change', () => { gridModeSelect.value = gridModeFs.value; gridModeSelect.dispatchEvent(new Event('change')); });
  gridShowFs.addEventListener('change', () => { gridShowToggle.checked = gridShowFs.checked; gridShowToggle.dispatchEvent(new Event('change')); });
  gridModeSelect.addEventListener('change', syncGridControls);
  gridShowToggle.addEventListener('change', syncGridControls);
  btnWidgetsWide.addEventListener('click', () => {
    if (previewStage.requestFullscreen) previewStage.requestFullscreen().catch(() => showLayoutMessage('Браузер не дал открыть полный экран.', 'error'));
    else showLayoutMessage('Этот браузер не поддерживает полноэкранный режим.', 'error');
  });
  document.getElementById('btnPreviewExit').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); });
  document.addEventListener('fullscreenchange', () => { setTimeout(computeScale, 30); });

  function computeScale() {
    const fs = document.fullscreenElement === previewStage;
    const col = previewStage.parentElement;
    const maxByHeight = fs ? (window.innerHeight - 64) * (SCENE_W / SCENE_H) : Math.max(480, (window.innerHeight - 170) * (SCENE_W / SCENE_H)); // кадр целиком помещается в окно по высоте
    const cs = getComputedStyle(previewStage);
    const inner = fs ? window.innerWidth - 24 : (previewStage.clientWidth || col.clientWidth) - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const frameWidth = Math.floor(Math.max(200, Math.min(inner, maxByHeight)));
    previewFrame.style.width = frameWidth + 'px';
    previewScale = frameWidth / SCENE_W;
    previewScene.style.transform = `scale(${previewScale})`;
    previewFrame.style.height = (SCENE_H * previewScale) + 'px';
  }
  window.addEventListener('resize', () => { computeScale(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => computeScale()).observe(previewStage.parentElement);

  function widgetLabel(id) {
    const def = widgetDefs.find((w) => w.id === id);
    return def ? def.label : id;
  }

  // Иконки кнопок-виджетов (24×24, штрих). Для неизвестного id — нейтральный квадрат.
  const WIDGET_ICONS = {
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    timeline: '<path d="M3 20h18"/><path d="M4 15l4-5 4 3 5-7 3 4"/>',
    emotebox: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.5 2.2 2.2 3.5 2.2s2.5-.7 3.5-2.2"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>',
    wordcloud: '<path d="M4 5h16v11H9.5L5 19.5V16H4z"/><path d="M8 9h8M8 12.3h5"/>',
    eventfeed: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M6 8v8M11 6h9M11 18h9M11 12h6"/>',
    chat: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
    donortop: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  };
  const WIDGET_ICON_FALLBACK = '<rect x="4" y="4" width="16" height="16" rx="3"/>';

  function renderWidgetList() {
    widgetListEl.innerHTML = '';
    widgetDefs.forEach((w) => {
      const rect = layoutState[w.id];
      const on = rect.enabled !== false;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wicon' + (on ? ' on' : '') + (selectedWidgetId === w.id ? ' sel' : '');
      btn.dataset.id = w.id;
      btn.dataset.tip = `${w.label}\n${on ? 'Нажми — выбрать блок. «на сцене» справа — скрыть' : 'Скрыт — нажми, чтобы показать на сцене'}`;
      btn.setAttribute('aria-label', w.label);
      btn.setAttribute('aria-pressed', String(on));
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WIDGET_ICONS[w.id] || WIDGET_ICON_FALLBACK}</svg><span class="wlab">${w.label}</span><span class="wstate">${on ? 'на сцене' : 'скрыт'}</span>`;
      btn.addEventListener('click', (ev) => {
        // клик по строке выбирает блок (редактируется положение и размер); «глаз» справа — показать/скрыть
        const eye = ev.target.closest && ev.target.closest('.wstate');
        if (!eye && layoutState[w.id].enabled !== false) { selectWidget(w.id); return; }
        const nowOn = layoutState[w.id].enabled === false; // был выключен → включаем
        layoutState[w.id].enabled = nowOn;
        if (!nowOn && selectedWidgetId === w.id) {
          selectedWidgetId = null; // выключенный виджет пропадает из превью — редактировать в нём нечего
        }
        renderWidgetList();
        renderPreviewWidgets();
        updateFieldsFromSelected();
        renderWidgetContentSettingsPanel();
        scheduleLayoutSave();
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (layoutState[w.id].enabled === false) return; // у выключенного виджета на сцене нечего настраивать
        selectWidget(w.id);
      });
      widgetListEl.appendChild(btn);
    });
  }

  // 8 ручек: 4 угла и 4 стороны — тянуть можно за любую.
  const RESIZE_HANDLES_HTML = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((d) => `<div class="resize-handle" data-dir="${d}"></div>`).join('');

  function renderPreviewWidgets() {
    previewScene.innerHTML = '';
    updateGridOverlay();
    widgetDefs.forEach((w) => {
      const rect = layoutState[w.id];
      if (rect.enabled === false) return; // выключенный виджет полностью убирается из превью, а не просто гаснет

      const el = document.createElement('div');
      el.className = 'preview-widget' + (selectedWidgetId === w.id ? ' selected' : '');
      el.dataset.id = w.id;
      el.style.left = rect.x + 'px';
      el.style.top = rect.y + 'px';
      el.style.width = rect.w + 'px';
      el.style.height = rect.h + 'px';

      if (w.id === 'activity') {
        // Настоящее содержимое вместо ярлыка — реально реагирует на изменение
        // размера блока (см. refreshActivityPreview), как и на оверлее в OBS.
        el.classList.add('preview-widget-live');
        el.innerHTML = `<div class="preview-widget-label pv-live-label">${w.label}</div><div class="pv-activity-list"></div>${RESIZE_HANDLES_HTML}`;
      } else {
        el.innerHTML = `<div class="preview-widget-label">${w.label}</div>${RESIZE_HANDLES_HTML}`;
      }
      previewScene.appendChild(el);
    });
    // обновляем подсветку в списке слева тоже
    widgetListEl.querySelectorAll('.wicon').forEach((row) => {
      row.classList.toggle('sel', row.dataset.id === selectedWidgetId);
    });
    refreshLivePreview('activity');
  }

  function selectWidget(id) {
    selectedWidgetId = id;
    renderPreviewWidgets();
    updateFieldsFromSelected();
    renderWidgetContentSettingsPanel();
  }

  // Панели координат больше нет — функция только подсвечивает выбранный виджет в сетке кнопок.
  function updateFieldsFromSelected() {
    widgetListEl.querySelectorAll('.wicon').forEach((el) => el.classList.toggle('sel', el.dataset.id === selectedWidgetId));
    const rb = document.getElementById('btnWidgetResetSel');
    if (rb) rb.disabled = !selectedWidgetId;
    syncWidgetProps();
  }
  // панель «Положение и размер»: числа выбранного блока, правятся с клавиатуры и обновляются при перетаскивании
  const wpIds = { x: 'wpX', y: 'wpY', w: 'wpW', h: 'wpH' };
  function syncWidgetProps() {
    const box = document.getElementById('widgetProps'); if (!box) return;
    const rect = selectedWidgetId && layoutState[selectedWidgetId];
    const def = rect && widgetDefs.find((w) => w.id === selectedWidgetId);
    document.getElementById('wpTitle').textContent = def ? def.label : 'Выберите блок на сцене';
    document.getElementById('wpSub').textContent = def ? 'Положение и размер на экране 1920 × 1080' : 'Нажмите на блок или на строку в списке слоёв';
    Object.keys(wpIds).forEach((k) => { const el = document.getElementById(wpIds[k]); if (!el) return; el.disabled = !rect; if (rect && document.activeElement !== el) el.value = Math.round(rect[k]); if (!rect) el.value = ''; });
  }
  Object.keys(wpIds).forEach((k) => {
    const el = document.getElementById(wpIds[k]); if (!el) return;
    el.addEventListener('change', () => {
      const id = selectedWidgetId; if (!id || !layoutState[id]) return;
      const cur = layoutState[id];
      const next = normalizeRect({ x: Number(document.getElementById('wpX').value), y: Number(document.getElementById('wpY').value), w: Number(document.getElementById('wpW').value), h: Number(document.getElementById('wpH').value) });
      if (Object.values(next).some((v) => Number.isNaN(v))) { syncWidgetProps(); return; }
      Object.assign(cur, next); updateWidgetDiv(id); syncWidgetProps(); scheduleLayoutSave();
    });
  });
  document.getElementById('btnWidgetResetSel').addEventListener('click', () => { if (selectedWidgetId) resetSingleWidget(selectedWidgetId); });

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function snapVal(v, axis) { const st = axis === 'y' ? gridMode.sy : gridMode.sx; return st > 1 ? Math.round(v / st) * st : Math.round(v); }

  function normalizeRect(rect) {
    let { x, y, w, h } = rect;
    w = clamp(w, MIN_SIZE, SCENE_W);
    h = clamp(h, MIN_SIZE, SCENE_H);
    x = clamp(x, 0, SCENE_W - w);
    y = clamp(y, 0, SCENE_H - h);
    return { x, y, w, h };
  }

  function applyEdgeSnap(rect) {
    if (Math.abs(rect.x) <= EDGE_SNAP) rect.x = 0;
    if (Math.abs(rect.y) <= EDGE_SNAP) rect.y = 0;
    if (Math.abs((rect.x + rect.w) - SCENE_W) <= EDGE_SNAP) rect.x = SCENE_W - rect.w;
    if (Math.abs((rect.y + rect.h) - SCENE_H) <= EDGE_SNAP) rect.y = SCENE_H - rect.h;
    return rect;
  }

  function updateWidgetDiv(id) {
    const el = previewScene.querySelector(`.preview-widget[data-id="${id}"]`);
    if (!el) return;
    const rect = layoutState[id];
    el.style.left = rect.x + 'px';
    el.style.top = rect.y + 'px';
    el.style.width = rect.w + 'px';
    el.style.height = rect.h + 'px';
    refreshLivePreview(id); // содержимое (например, число видимых строк) может зависеть от размера
    if (id === selectedWidgetId && typeof syncWidgetProps === 'function') syncWidgetProps();
  }

  /** Изменение размера за любую из 8 ручек: двигаются только те края, за которые тянут; край «прилипает» к сетке и к границам сцены. */
  function resizeRect(start, dir, dx, dy) {
    let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
    const nearEdge = (v, edge) => Math.abs(v - edge) <= EDGE_SNAP;
    if (dir.includes('w')) { left = snapVal(left + dx, 'x'); if (nearEdge(left, 0)) left = 0; left = clamp(left, 0, right - MIN_SIZE); }
    if (dir.includes('e')) { right = snapVal(right + dx, 'x'); if (nearEdge(right, SCENE_W)) right = SCENE_W; right = clamp(right, left + MIN_SIZE, SCENE_W); }
    if (dir.includes('n')) { top = snapVal(top + dy, 'y'); if (nearEdge(top, 0)) top = 0; top = clamp(top, 0, bottom - MIN_SIZE); }
    if (dir.includes('s')) { bottom = snapVal(bottom + dy, 'y'); if (nearEdge(bottom, SCENE_H)) bottom = SCENE_H; bottom = clamp(bottom, top + MIN_SIZE, SCENE_H); }
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  /* --- Drag / resize --- */

  let dragMode = null; // 'move' | 'resize' | null
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartRect = null;
  let dragId = null;
  let dragDir = 'se';

  previewScene.addEventListener('mousedown', (e) => {
    const widgetEl = e.target.closest('.preview-widget');
    if (!widgetEl) return;
    const id = widgetEl.dataset.id;
    selectWidget(id);

    dragId = id;
    dragStartMouse = { x: e.clientX, y: e.clientY };
    dragStartRect = { ...layoutState[id] };
    dragMode = e.target.classList.contains('resize-handle') ? 'resize' : 'move';
    dragDir = dragMode === 'resize' ? (e.target.dataset.dir || 'se') : '';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragMode || !dragId) return;
    const dxScene = (e.clientX - dragStartMouse.x) / previewScale;
    const dyScene = (e.clientY - dragStartMouse.y) / previewScale;

    let rect;
    if (dragMode === 'move') {
      rect = {
        x: snapVal(dragStartRect.x + dxScene, 'x'),
        y: snapVal(dragStartRect.y + dyScene, 'y'),
        w: dragStartRect.w,
        h: dragStartRect.h,
      };
      rect = normalizeRect(rect);
      rect = applyEdgeSnap(rect);
      rect = normalizeRect(rect); // на случай, если edge-snap увёл за границу
    } else {
      rect = resizeRect(dragStartRect, dragDir, dxScene, dyScene);
    }

    layoutState[dragId] = { ...layoutState[dragId], ...rect };
    updateWidgetDiv(dragId);
    if (selectedWidgetId === dragId) updateFieldsFromSelected();
    scheduleLayoutSave();
  });

  document.addEventListener('mouseup', () => {
    dragMode = null;
    dragId = null;
  });

  /* --- Живое превью содержимого виджета (реагирует на реальный размер блока) ---
     Универсальный диспетчер: у виджета есть свой рендерер в WIDGET_PREVIEW_RENDERERS
     (сейчас только "activity") — если есть, вызываем; для остальных виджетов
     пока просто ничего не делаем (у них обычный ярлык-заглушка). Чтобы дать
     новому виджету живое превью — добавляешь сюда одну функцию и одну запись
     в реестр, остальной механизм (пересчёт при resize/данных/настройках) уже общий. */

  function refreshActivityPreview() {
    const el = previewScene.querySelector('.preview-widget[data-id="activity"]');
    if (!el) return;
    const listEl = el.querySelector('.pv-activity-list');
    if (!listEl) return;

    const settings = widgetSettingsState.activity || { avatarSize: 44, nameSize: 14, barThickness: 6 };
    const chatters = latestTopChatters || [];
    const maxMessages = Math.max(...chatters.map((c) => c.messages), 1);

    const rowHeight = settings.avatarSize;
    const gap = 8;
    const verticalPadding = 32; // соответствует padding блока в CSS (.preview-widget-live)
    const availableHeight = Math.max(0, el.clientHeight - verticalPadding);
    const maxRows = Math.max(0, Math.floor((availableHeight + gap) / (rowHeight + gap)));
    const visible = chatters.slice(0, maxRows);

    listEl.innerHTML = '';
    visible.forEach((c) => {
      const pct = Math.max(2, Math.round((c.messages / maxMessages) * 100));
      const row = document.createElement('div');
      row.className = 'pv-chatter-row';
      row.style.height = rowHeight + 'px';
      const avatarHtml = c.avatarUrl
        ? `<img class="pv-chatter-avatar" style="width:${settings.avatarSize}px;height:${settings.avatarSize}px;" src="${c.avatarUrl}">`
        : `<div class="pv-chatter-avatar" style="width:${settings.avatarSize}px;height:${settings.avatarSize}px;background:${colorForNameFallback(c.username)};font-size:${Math.max(10, Math.round(settings.avatarSize * 0.4))}px;">${c.username[0].toUpperCase()}</div>`;
      row.innerHTML = `
        ${avatarHtml}
        <div class="pv-chatter-name" style="font-size:${settings.nameSize}px;">${c.username}</div>
        <div class="pv-chatter-bar-track" style="height:${settings.barThickness}px;"><div class="pv-chatter-bar-fill" style="width:${pct}%;"></div></div>
        <div class="pv-chatter-count" style="font-size:${settings.nameSize}px;">${c.messages}</div>
      `;
      listEl.appendChild(row);
    });
  }

  const WIDGET_PREVIEW_RENDERERS = {
    activity: refreshActivityPreview,
  };

  function refreshLivePreview(widgetId) {
    if (widgetId && WIDGET_PREVIEW_RENDERERS[widgetId]) WIDGET_PREVIEW_RENDERERS[widgetId]();
  }

  /* --- Панель "Настройки виджета" — универсальная, строится по схеме с сервера --- */

  function showWidgetSettingsMessage(text, kind) {
    widgetSettingsMessage.textContent = text;
    widgetSettingsMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  // Какие группы сейчас развёрнуты — ключ "widgetId::группа". По умолчанию
  // (ключа нет в множестве) группа считается свёрнутой.
  const expandedSettingsGroups = new Set();
  function groupKey(widgetId, groupName) { return `${widgetId}::${groupName}`; }

  /** Строит один <div class="field"> (цветовой пикер или слайдер) с обработчиком изменения. */
  // Человекочитаемые подписи для значений полей типа "select" (по умолчанию
  // просто показывается само значение). Сейчас в схеме нет ни одного такого
  // поля — раньше здесь были подписи анимаций "Топа донатеров", убранных
  // из виджета целиком; сам механизм select-полей в панели настроек остался
  // как есть на случай, если он понадобится для чего-то другого.
  const SELECT_OPTION_LABELS = {
    // Инфо-карточка (значения уникальны на весь проект — таблица общая для всех виджетов)
    'from-left': 'Слева', 'from-right': 'Справа', 'from-top': 'Сверху', 'from-bottom': 'Снизу',
    'from-cycle': 'По кругу (слева → справа → сверху → снизу)', 'from-random': 'Случайно',
    'flip-horizontal': 'По горизонтали (↔)', 'flip-vertical': 'По вертикали (↕)', 'flip-alternate': 'Чередовать',
    'img-top': 'Картинка сверху', 'img-left': 'Картинка слева', 'img-right': 'Картинка справа', 'img-bg': 'Картинка на фоне (текст поверх)',
    'fit-cover': 'Заполнять область (с обрезкой)', 'fit-contain': 'Вписывать целиком',
  };

  function buildSettingField(key, def, currentValues) {
    const field = document.createElement('div');
    field.className = 'field';

    if (def.type === 'color') {
      const value = typeof currentValues[key] === 'string' ? currentValues[key] : def.default;
      field.innerHTML = `
        <div class="color-field-row">
          <label>${def.label}</label>
          <input type="color" value="${value}" data-key="${key}">
        </div>
      `;
      const input = field.querySelector('input');
      input.addEventListener('input', () => {
        if (!widgetSettingsState[selectedWidgetId]) widgetSettingsState[selectedWidgetId] = {};
        widgetSettingsState[selectedWidgetId][key] = input.value;
        refreshLivePreview(selectedWidgetId);
        scheduleWidgetSettingsSave(selectedWidgetId);
      });
    } else if (def.type === 'toggle') {
      const value = typeof currentValues[key] === 'boolean' ? currentValues[key] : def.default;
      field.innerHTML = `
        <div class="color-field-row">
          <label>${def.label}</label>
          <label class="toggle-switch">
            <input type="checkbox" ${value ? 'checked' : ''} data-key="${key}">
            <span class="toggle-slider"></span>
          </label>
        </div>
      `;
      const input = field.querySelector('input');
      input.addEventListener('change', () => {
        if (!widgetSettingsState[selectedWidgetId]) widgetSettingsState[selectedWidgetId] = {};
        widgetSettingsState[selectedWidgetId][key] = input.checked;
        refreshLivePreview(selectedWidgetId);
        scheduleWidgetSettingsSave(selectedWidgetId);
        // Тумблер вроде "Использовать общую палитру" меняет, какие ещё поля
        // видны (syncable) — перерисовываем панель целиком, чтобы это учесть.
        renderWidgetContentSettingsPanel();
      });
    } else if (def.type === 'select') {
      const value = (def.options || []).includes(currentValues[key]) ? currentValues[key] : def.default;
      const optionsHtml = (def.options || []).map((opt) => {
        const label = (SELECT_OPTION_LABELS[opt] || opt);
        return `<option value="${opt}" ${opt === value ? 'selected' : ''}>${label}</option>`;
      }).join('');
      field.innerHTML = `
        <label>${def.label}</label>
        <select data-key="${key}">${optionsHtml}</select>
      `;
      const input = field.querySelector('select');
      input.addEventListener('change', () => {
        if (!widgetSettingsState[selectedWidgetId]) widgetSettingsState[selectedWidgetId] = {};
        widgetSettingsState[selectedWidgetId][key] = input.value;
        refreshLivePreview(selectedWidgetId);
        scheduleWidgetSettingsSave(selectedWidgetId);
      });
    } else {
      const value = typeof currentValues[key] === 'number' ? currentValues[key] : def.default;
      field.innerHTML = `
        <label>${def.label}</label>
        <div class="slider-row">
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}" data-key="${key}">
          <span class="slider-value">${value}${def.unit || ''}</span>
        </div>
      `;
      const input = field.querySelector('input');
      const valueEl = field.querySelector('.slider-value');
      input.addEventListener('input', () => {
        const v = Number(input.value);
        valueEl.textContent = v + (def.unit || '');
        if (!widgetSettingsState[selectedWidgetId]) widgetSettingsState[selectedWidgetId] = {};
        widgetSettingsState[selectedWidgetId][key] = v;
        // Только превью виджета — саму панель/ползунки здесь НЕ трогаем и не
        // перерисовываем, иначе ползунок будет дёргаться обратно при движении.
        refreshLivePreview(selectedWidgetId);
        scheduleWidgetSettingsSave(selectedWidgetId);
      });
    }
    return field;
  }

  function renderWidgetContentSettingsPanel() {
    const schema = selectedWidgetId && widgetSettingsSchema[selectedWidgetId];
    if (!schema) {
      widgetContentSettings.style.display = 'none';
      return;
    }
    widgetContentSettings.style.display = 'block';
    widgetContentSettingsTitle.textContent = `Настройки: ${widgetLabel(selectedWidgetId)}`;
    widgetContentFields.innerHTML = '';
    showWidgetSettingsMessage('', '');

    const currentValues = widgetSettingsState[selectedWidgetId] || {};
    const entries = Object.entries(schema);

    // Если у виджета есть тумблер "Использовать общую палитру" — читаем его
    // текущее значение, чтобы решить, показывать ли поля с syncable: true.
    const useGlobalPaletteDef = schema.useGlobalPalette;
    const useGlobalPaletteOn = useGlobalPaletteDef
      ? (typeof currentValues.useGlobalPalette === 'boolean' ? currentValues.useGlobalPalette : useGlobalPaletteDef.default)
      : false;

    // Поля без группы (например, "Использовать общую палитру", "Прозрачность фона") —
    // всегда видимые, наверху, без сворачивания. syncable-поля прячутся, пока
    // включена общая палитра — их тогда заменяют значения из "Основных настроек".
    const topLevel = entries.filter(([, def]) => {
      if (def.group) return false;
      if (def.syncable && useGlobalPaletteOn) return false;
      return true;
    });
    if (topLevel.length) {
      const topContainer = document.createElement('div');
      topContainer.className = 'settings-group-toplevel';
      topLevel.forEach(([key, def]) => topContainer.appendChild(buildSettingField(key, def, currentValues)));
      widgetContentFields.appendChild(topContainer);
    }

    // Остальные поля группируем по def.group, сохраняя порядок появления в схеме.
    const groups = []; // [{ name, fields: [[key, def], ...] }]
    entries.forEach(([key, def]) => {
      if (!def.group) return;
      let group = groups.find((g) => g.name === def.group);
      if (!group) { group = { name: def.group, fields: [] }; groups.push(group); }
      group.fields.push([key, def]);
    });

    groups.forEach((group) => {
      const expanded = expandedSettingsGroups.has(groupKey(selectedWidgetId, group.name));
      const colorCount = group.fields.filter(([, def]) => def.type === 'color').length;

      const block = document.createElement('div');
      block.className = 'settings-group-block' + (expanded ? ' expanded' : '');

      const header = document.createElement('div');
      header.className = 'settings-group-header';
      header.innerHTML = `<span class="chevron">▸</span><span class="group-title-text">${group.name}</span>`;
      header.addEventListener('click', () => {
        const key = groupKey(selectedWidgetId, group.name);
        if (expandedSettingsGroups.has(key)) expandedSettingsGroups.delete(key);
        else expandedSettingsGroups.add(key);
        renderWidgetContentSettingsPanel(); // перерисовать с учётом новой раскрытости
      });
      block.appendChild(header);

      const content = document.createElement('div');
      content.className = 'settings-group-content' + (colorCount >= 4 ? ' two-col' : '');
      group.fields.forEach(([key, def]) => content.appendChild(buildSettingField(key, def, currentValues)));
      block.appendChild(content);

      widgetContentFields.appendChild(block);
    });

    // "Топ донатеров" — единственный виджет с доп. кнопками помимо обычных
    // полей схемы: сброс топа за стрим и ручное добавление донатера.
    if (selectedWidgetId === 'donortop') {
      widgetContentFields.appendChild(buildDonorTopExtraSection());
    }
  }

  /** Доп. блок для "Топ донатеров": сброс топа за стрим + форма ручного добавления. */
  function buildDonorTopExtraSection() {
    const wrap = document.createElement('div');
    wrap.className = 'settings-group-block expanded';
    wrap.innerHTML = `
      <div class="settings-group-header" style="cursor:default;">
        <span class="chevron">▾</span><span class="group-title-text">Топ донатеров: данные</span>
      </div>
      <div class="settings-group-content">
        <div class="field">
          <button class="btn btn-danger" type="button" id="btnDonorTopResetSession">Сбросить топ за стрим</button>
          <p class="card-hint after-button">Топ «за всё время» (в отдельном файле) этим не затрагивается.</p>
        </div>
        <div class="field">
          <label>Добавить донатера вручную</label>
          <div class="donor-manual-form">
            <input type="text" id="donorManualUsername" placeholder="Ник">
            <input type="number" id="donorManualAmount" placeholder="Сумма" min="0" step="1">
            <input type="text" id="donorManualCurrency" placeholder="Валюта (RUB)" style="width:90px;">
            <select id="donorManualPlatform">
              <option value="donationalerts">DonationAlerts</option>
              <option value="donatex">DonateX</option>
            </select>
            <button class="btn btn-secondary" type="button" id="btnDonorManualAdd">Добавить</button>
          </div>
        </div>
        <div class="form-message" id="donorTopExtraMessage"></div>
        <div class="field">
          <label>Топ за стрим — текущий список</label>
          <div class="donor-manage-list" id="donorManageSession"><p class="card-hint">Загружаем…</p></div>
        </div>
        <div class="field">
          <label>Топ за всё время — текущий список</label>
          <div class="donor-manage-list" id="donorManageAllTime"><p class="card-hint">Загружаем…</p></div>
          <button class="btn btn-danger" type="button" id="btnDonorClearAllTime">Очистить историю за всё время</button>
          <p class="card-hint after-button">Необратимо: полностью стирает файл <code>donations_alltime.json</code>.</p>
        </div>
      </div>
    `;

    const message = wrap.querySelector('#donorTopExtraMessage');
    const showMessage = (text, kind) => {
      message.textContent = text;
      message.className = 'form-message' + (kind ? ' ' + kind : '');
    };

    const sessionListEl = wrap.querySelector('#donorManageSession');
    const allTimeListEl = wrap.querySelector('#donorManageAllTime');

    function renderManageList(container, donors, scope) {
      container.innerHTML = '';
      if (!donors || donors.length === 0) {
        container.innerHTML = '<p class="card-hint">Пока пусто.</p>';
        return;
      }
      donors.forEach((donor) => {
        const row = document.createElement('div');
        row.className = 'donor-manage-row';
        row.innerHTML = `
          <span class="donor-manage-name">${String(donor.username).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))}</span>
          <span class="donor-manage-amount">${Math.round(donor.amount)}</span>
          <button class="btn-tiny" type="button">Удалить</button>
        `;
        row.querySelector('button').addEventListener('click', async () => {
          if (!await ui3Confirm(`Удалить «${donor.username}» из топа ${scope === 'session' ? 'за стрим' : 'за всё время'}?`)) return;
          try {
            const { ok } = await postJSON('/api/donortop/delete', { scope, username: donor.username });
            if (ok) {
              showMessage('Удалено.', 'success');
              loadManageLists();
            } else {
              showMessage('Не удалось удалить.', 'error');
            }
          } catch (e) {
            showMessage('Сетевая ошибка при обращении к серверу.', 'error');
          }
        });
        container.appendChild(row);
      });
    }

    async function loadManageLists() {
      try {
        const res = await fetch('/api/donortop/list');
        const data = await res.json();
        renderManageList(sessionListEl, data.session, 'session');
        renderManageList(allTimeListEl, data.allTime, 'allTime');
      } catch (e) {
        sessionListEl.innerHTML = '<p class="card-hint">Не удалось загрузить.</p>';
        allTimeListEl.innerHTML = '<p class="card-hint">Не удалось загрузить.</p>';
      }
    }
    loadManageLists();

    wrap.querySelector('#btnDonorClearAllTime').addEventListener('click', async () => {
      if (!await ui3Confirm('Полностью стереть топ донатеров за всё время? Это необратимо, файл donations_alltime.json будет очищен.')) return;
      try {
        const { ok } = await postJSON('/api/donortop/clear-alltime', {});
        showMessage(ok ? 'Топ за всё время очищен.' : 'Не удалось очистить.', ok ? 'success' : 'error');
        loadManageLists();
      } catch (e) {
        showMessage('Сетевая ошибка при обращении к серверу.', 'error');
      }
    });

    wrap.querySelector('#btnDonorTopResetSession').addEventListener('click', async () => {
      if (!await ui3Confirm('Сбросить топ донатеров за стрим? Топ «за всё время» не тронется.')) return;
      try {
        const { ok } = await postJSON('/api/donortop/reset-session', {});
        showMessage(ok ? 'Топ за стрим сброшен.' : 'Не удалось сбросить.', ok ? 'success' : 'error');
        loadManageLists();
      } catch (e) {
        showMessage('Сетевая ошибка при обращении к серверу.', 'error');
      }
    });

    wrap.querySelector('#btnDonorManualAdd').addEventListener('click', async () => {
      const username = wrap.querySelector('#donorManualUsername').value.trim();
      const amount = wrap.querySelector('#donorManualAmount').value;
      const currency = wrap.querySelector('#donorManualCurrency').value.trim();
      const platform = wrap.querySelector('#donorManualPlatform').value;
      if (!username || !amount) {
        showMessage('Укажи ник и сумму.', 'error');
        return;
      }
      showMessage('Добавляем…', '');
      try {
        const { ok, data } = await postJSON('/api/donations/add-manual', { username, amount, currency, platform });
        if (ok && data.success) {
          showMessage('Донатер добавлен в топ.', 'success');
          wrap.querySelector('#donorManualUsername').value = '';
          wrap.querySelector('#donorManualAmount').value = '';
          wrap.querySelector('#donorManualCurrency').value = '';
        } else {
          showMessage((data && data.error) || 'Не удалось добавить.', 'error');
        }
      } catch (e) {
        showMessage('Сетевая ошибка при обращении к серверу.', 'error');
      }
    });

    return wrap;
  }

  async function loadWidgetSettings() {
    try {
      const res = await fetch('/api/widget-settings');
      const data = await res.json();
      widgetSettingsSchema = data.schema;
      widgetSettingsState = JSON.parse(JSON.stringify(data.settings));
    } catch (e) {
      // не критично — панель настроек виджета просто не покажется, пока не подгрузится
    }
  }

  /** Сохраняет настройки виджета на сервере: дебаунс 250мс после последнего движения ползунка. */
  function scheduleWidgetSettingsSave(widgetId) {
    widgetSettingsPendingId = widgetId;
    clearTimeout(widgetSettingsSaveTimer);
    widgetSettingsSaveTimer = setTimeout(() => { saveWidgetSettings(widgetId); }, 250);
  }

  async function saveWidgetSettings(widgetId) {
    showWidgetSettingsMessage('Сохраняем…', '');
    try {
      const { ok, data } = await postJSON('/api/widget-settings', {
        widgetId,
        settings: widgetSettingsState[widgetId],
      });
      if (ok && data.success) {
        // Обновляем только фоновое состояние (сервер мог обрезать значение по
        // границам схемы) — DOM ползунков не трогаем, чтобы не сбивать палец
        // пользователя, если он как раз начал двигать следующий ползунок.
        widgetSettingsState[widgetId] = data.settings[widgetId];
        refreshLivePreview(widgetId);
        showWidgetSettingsMessage('Сохранено и применено на оверлее.', 'success');
      } else {
        showWidgetSettingsMessage((data && data.error) || 'Не удалось сохранить настройки.', 'error');
      }
    } catch (e) {
      showWidgetSettingsMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      if (widgetSettingsPendingId === widgetId) widgetSettingsPendingId = null;
    }
  }

  btnWidgetSettingsSave.addEventListener('click', async () => {
    if (!selectedWidgetId) return;
    clearTimeout(widgetSettingsSaveTimer); // не ждём дебаунс — сохраняем прямо сейчас
    btnWidgetSettingsSave.disabled = true;
    btnWidgetSettingsReset.disabled = true;
    try {
      await saveWidgetSettings(selectedWidgetId);
    } finally {
      btnWidgetSettingsSave.disabled = false;
      btnWidgetSettingsReset.disabled = false;
    }
  });

  btnWidgetSettingsReset.addEventListener('click', async () => {
    if (!selectedWidgetId) return;
    clearTimeout(widgetSettingsSaveTimer);
    widgetSettingsPendingId = null;
    btnWidgetSettingsSave.disabled = true;
    btnWidgetSettingsReset.disabled = true;
    showWidgetSettingsMessage('Сбрасываем…', '');
    try {
      const { ok, data } = await postJSON('/api/widget-settings/reset', { widgetId: selectedWidgetId });
      if (ok && data.success) {
        widgetSettingsState = data.settings;
        renderWidgetContentSettingsPanel(); // сброс — осознанное действие, здесь перерисовать ползунки можно и нужно
        refreshLivePreview(selectedWidgetId);
        showWidgetSettingsMessage('Возвращены значения по умолчанию.', 'success');
      } else {
        showWidgetSettingsMessage((data && data.error) || 'Не удалось сбросить настройки.', 'error');
      }
    } catch (e) {
      showWidgetSettingsMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnWidgetSettingsSave.disabled = false;
      btnWidgetSettingsReset.disabled = false;
    }
  });

  /* --- Загрузка с сервера --- */

  async function loadWidgets() {
    try {
      const res = await fetch('/api/widgets');
      const data = await res.json();
      widgetDefs = data.widgets;
      layoutState = JSON.parse(JSON.stringify(data.layout));
      defaultsState = data.defaults;
      await loadWidgetSettings();
      renderWidgetList();
      computeScale();
      renderPreviewWidgets();
      updateFieldsFromSelected();
      renderWidgetContentSettingsPanel();
    } catch (e) {
      showLayoutMessage('Не удалось загрузить список виджетов с сервера.', 'error');
    }
  }
  loadWidgets();
  // preview-frame может ещё не иметь ширины при первой загрузке (скрытая вкладка) —
  // пересчитываем масштаб, когда пользователь реально открывает вкладку "Виджеты".
  document.querySelector('.nav-item[data-tab="widgets"]').addEventListener('click', () => {
    setTimeout(computeScale, 0);
  });

  /* --- Сброс одного виджета (сразу на сервер) --- */

  async function resetSingleWidget(id) {
    showLayoutMessage('Сбрасываем виджет…', '');
    try {
      const { ok, data } = await postJSON('/api/layout/reset', { id });
      if (ok && data.success) {
        layoutState = JSON.parse(JSON.stringify(data.layout));
        renderWidgetList();
        renderPreviewWidgets();
        updateFieldsFromSelected();
        showLayoutMessage(`«${widgetLabel(id)}» сброшен к дефолту.`, 'success');
      } else {
        showLayoutMessage('Не удалось сбросить виджет.', 'error');
      }
    } catch (e) {
      showLayoutMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }

  /* --- Сохранить / Сбросить всё --- */

  btnLayoutResetAll.addEventListener('click', async () => {
    if (!await ui3Confirm('Вернуть расположение и размер ВСЕХ виджетов к значениям по умолчанию?')) return;
    btnLayoutResetAll.disabled = true;
    showLayoutMessage('Сбрасываем всё…', '');
    try {
      const { ok, data } = await postJSON('/api/layout/reset', {});
      if (ok && data.success) {
        layoutState = JSON.parse(JSON.stringify(data.layout));
        renderWidgetList();
        renderPreviewWidgets();
        updateFieldsFromSelected();
        showLayoutMessage('Раскладка сброшена к дефолту.', 'success');
      } else {
        showLayoutMessage('Не удалось сбросить раскладку.', 'error');
      }
    } catch (e) {
      showLayoutMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnLayoutResetAll.disabled = false;
    }
  });

  /* ================================================================
     Вкладка "Озвучка чата" — Piper TTS
  ================================================================ */

  let ttsIgnoredWords = [];

  const ttsEnabled = document.getElementById('ttsEnabled');
  const ttsReadNickname = document.getElementById('ttsReadNickname');
  const ttsIgnoreBots = document.getElementById('ttsIgnoreBots');
  const ttsOnlyOnCommand = document.getElementById('ttsOnlyOnCommand');
  const ttsMaxLength = document.getElementById('ttsMaxLength');
  const ttsQueueEnabled = document.getElementById('ttsQueueEnabled');
  const ttsWordInput = document.getElementById('ttsWordInput');
  const btnAddWord = document.getElementById('btnAddWord');
  const ttsWordChips = document.getElementById('ttsWordChips');
  const ttsVoiceSelect = document.getElementById('ttsVoice');
  const ttsLengthScale = document.getElementById('ttsLengthScale');
  const ttsLengthScaleValue = document.getElementById('ttsLengthScaleValue');
  const ttsNoiseScale = document.getElementById('ttsNoiseScale');
  const ttsNoiseScaleValue = document.getElementById('ttsNoiseScaleValue');
  const ttsNoiseWScale = document.getElementById('ttsNoiseWScale');
  const ttsNoiseWScaleValue = document.getElementById('ttsNoiseWScaleValue');
  const ttsVolume = document.getElementById('ttsVolume');
  const ttsVolumeValue = document.getElementById('ttsVolumeValue');
  const ttsSentenceSilence = document.getElementById('ttsSentenceSilence');
  const ttsSentenceSilenceValue = document.getElementById('ttsSentenceSilenceValue');
  const btnTtsSave = document.getElementById('btnTtsSave');
  const btnTtsReset = document.getElementById('btnTtsReset');
  const btnTtsStop = document.getElementById('btnTtsStop');
  const ttsFormMessage = document.getElementById('ttsFormMessage');

  function showTtsMessage(text, kind) {
    ttsFormMessage.textContent = text;
    ttsFormMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function updateSliderLabels() {
    ttsLengthScaleValue.textContent = Number(ttsLengthScale.value).toFixed(2);
    ttsNoiseScaleValue.textContent = Number(ttsNoiseScale.value).toFixed(2);
    ttsNoiseWScaleValue.textContent = Number(ttsNoiseWScale.value).toFixed(2);
    ttsVolumeValue.textContent = Number(ttsVolume.value).toFixed(2);
    ttsSentenceSilenceValue.textContent = Number(ttsSentenceSilence.value).toFixed(2) + ' с';
  }
  [ttsLengthScale, ttsNoiseScale, ttsNoiseWScale, ttsVolume, ttsSentenceSilence].forEach((el) => {
    el.addEventListener('input', updateSliderLabels);
  });

  function renderWordChips() {
    ttsWordChips.innerHTML = '';
    ttsIgnoredWords.forEach((word) => {
      const chip = document.createElement('div');
      chip.className = 'word-chip';
      chip.innerHTML = `<span>${word}</span><button type="button" aria-label="Удалить">×</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        ttsIgnoredWords = ttsIgnoredWords.filter((w) => w !== word);
        renderWordChips();
      });
      ttsWordChips.appendChild(chip);
    });
  }

  function addWordsFromInput() {
    const raw = ttsWordInput.value.trim();
    if (!raw) return;
    raw.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean).forEach((w) => {
      if (!ttsIgnoredWords.includes(w)) ttsIgnoredWords.push(w);
    });
    ttsWordInput.value = '';
    renderWordChips();
  }
  btnAddWord.addEventListener('click', addWordsFromInput);
  ttsWordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addWordsFromInput(); }
  });

  function applyTtsToForm(ttsData) {
    ttsEnabled.checked = ttsData.enabled;
    ttsReadNickname.checked = ttsData.readNickname;
    ttsIgnoreBots.checked = ttsData.ignoreBots;
    ttsOnlyOnCommand.checked = !!ttsData.onlyOnCommand;
    ttsMaxLength.value = ttsData.maxLength;
    ttsQueueEnabled.checked = ttsData.queueEnabled;
    ttsIgnoredWords = Array.isArray(ttsData.ignoredWords) ? [...ttsData.ignoredWords] : [];
    renderWordChips();
    ttsVoiceSelect.value = ttsData.voice;
    ttsLengthScale.value = ttsData.lengthScale;
    ttsNoiseScale.value = ttsData.noiseScale;
    ttsNoiseWScale.value = ttsData.noiseWScale;
    ttsVolume.value = ttsData.volume;
    ttsSentenceSilence.value = ttsData.sentenceSilence;
    updateSliderLabels();
  }

  async function loadTts() {
    try {
      const res = await fetch('/api/tts');
      const data = await res.json();
      ttsVoiceSelect.innerHTML = '';
      data.voices.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.label;
        ttsVoiceSelect.appendChild(opt);
      });
      applyTtsToForm(data.tts);
    } catch (e) {
      showTtsMessage('Не удалось загрузить настройки озвучки с сервера.', 'error');
    }
  }
  loadTts();

  function collectTtsFormData() {
    return {
      enabled: ttsEnabled.checked,
      readNickname: ttsReadNickname.checked,
      ignoreBots: ttsIgnoreBots.checked,
      onlyOnCommand: ttsOnlyOnCommand.checked,
      maxLength: Number(ttsMaxLength.value),
      queueEnabled: ttsQueueEnabled.checked,
      ignoredWords: ttsIgnoredWords,
      voice: ttsVoiceSelect.value,
      lengthScale: Number(ttsLengthScale.value),
      noiseScale: Number(ttsNoiseScale.value),
      noiseWScale: Number(ttsNoiseWScale.value),
      volume: Number(ttsVolume.value),
      sentenceSilence: Number(ttsSentenceSilence.value),
    };
  }

  btnTtsSave.addEventListener('click', async () => {
    btnTtsSave.disabled = true;
    btnTtsReset.disabled = true;
    showTtsMessage('Сохраняем…', '');
    try {
      const { ok, data } = await postJSON('/api/tts', collectTtsFormData());
      if (ok && data.success) {
        applyTtsToForm(data.tts);
        showTtsMessage('Сохранено и применено на оверлее.', 'success');
      } else {
        showTtsMessage('Не удалось сохранить настройки.', 'error');
      }
    } catch (e) {
      showTtsMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnTtsSave.disabled = false;
      btnTtsReset.disabled = false;
    }
  });

  btnTtsReset.addEventListener('click', async () => {
    btnTtsSave.disabled = true;
    btnTtsReset.disabled = true;
    showTtsMessage('Сбрасываем…', '');
    try {
      const { ok, data } = await postJSON('/api/tts/reset', {});
      if (ok && data.success) {
        applyTtsToForm(data.tts);
        showTtsMessage('Возвращены значения по умолчанию.', 'success');
      } else {
        showTtsMessage('Не удалось сбросить настройки.', 'error');
      }
    } catch (e) {
      showTtsMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnTtsSave.disabled = false;
      btnTtsReset.disabled = false;
    }
  });

  btnTtsStop.addEventListener('click', async () => {
    btnTtsStop.disabled = true;
    showTtsMessage('Останавливаем озвучку…', '');
    try {
      await postJSON('/api/tts/stop', {});
      showTtsMessage('Озвучка остановлена, очередь очищена.', 'success');
    } catch (e) {
      showTtsMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnTtsStop.disabled = false;
    }
  });

  /* ================================================================
     Вкладка "Виджеты оверлея" → "Управление стримом" — сброс статистики
     и ускоренное воспроизведение истории (топ зрителей/таймлайн/эмодзи).
  ================================================================ */

  const btnStreamReset = document.getElementById('btnStreamReset');
  const btnReplayStart = document.getElementById('btnReplayStart');
  const btnAutoRecord = document.getElementById('btnAutoRecord');
  const streamControlMessage = layoutFormMessage; // одна строка статуса справа от кнопок над предпросмотром
  let replayRunning = false;
  let streamStateTimer = null;

  function showStreamControlMessage(text, kind) {
    streamControlMessage.textContent = text;
    streamControlMessage.className = 'wtool-msg form-message' + (kind ? ' ' + kind : '');
    clearTimeout(streamStateTimer);
    if (text) streamStateTimer = setTimeout(() => { streamControlMessage.textContent = ''; }, 6000);
  }

  const REPLAY_ICON_PLAY = '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>';
  const REPLAY_ICON_STOP = '<rect x="6.5" y="6.5" width="11" height="11" rx="1.6" fill="currentColor"/>';
  function renderStreamButtons(state) {
    if (typeof state.fakeActive === 'boolean') renderFakeButton(state.fakeActive);
    if (typeof state.autoRecord === 'boolean') {
      btnAutoRecord.classList.toggle('on', state.autoRecord);
      btnAutoRecord.title = state.autoRecord
        ? 'Автозапись истории при начале стрима: ВКЛ (при старте стрима запись начнётся заново)'
        : 'Автозапись истории при начале стрима: выкл';
      btnAutoRecord.setAttribute('aria-pressed', String(state.autoRecord));
    }
    if (typeof state.replayActive === 'boolean') {
      replayRunning = state.replayActive;
      btnReplayStart.classList.toggle('on', replayRunning);
      btnReplayStart.querySelector('svg').innerHTML = replayRunning ? REPLAY_ICON_STOP : REPLAY_ICON_PLAY;
      btnReplayStart.title = replayRunning ? 'Остановить воспроизведение истории' : 'Воспроизвести историю стрима на оверлее (повторное нажатие остановит)';
    }
  }
  const btnFakeMode = document.getElementById('btnFakeMode');
  const fakeBanner = document.getElementById('fakeBanner');
  let fakeRunning = false;
  function renderFakeButton(active) {
    fakeRunning = active;
    btnFakeMode.classList.toggle('on', active);
    btnFakeMode.setAttribute('aria-pressed', String(active));
    fakeBanner.hidden = !active;
  }
  btnFakeMode.addEventListener('click', async () => {
    btnFakeMode.disabled = true;
    try {
      if (fakeRunning) {
        await postJSON('/api/fake/stop', {});
        renderFakeButton(false);
        showStreamControlMessage('Фейк-режим выключен, на оверлее снова настоящие данные.', 'success');
      } else {
        showStreamControlMessage('Запускаем фейк-режим…', '');
        let { ok, data } = await postJSON('/api/fake/start', {});
        if (!ok && data && data.needConfirm) {
          if (!await ui3Confirm('Сейчас идёт настоящий стрим.\n\nФейк-данные заменят живые на оверлее в OBS, зрители увидят их. Всё равно запустить?')) { showStreamControlMessage('', ''); return; }
          ({ ok, data } = await postJSON('/api/fake/start', { force: true }));
        }
        if (ok && data.success) {
          renderFakeButton(true);
          showStreamControlMessage('Фейк-режим запущен: зрители пишут, донатят и тратят баллы.', 'success');
        } else {
          showStreamControlMessage((data && data.error) || 'Не удалось запустить фейк-режим.', 'error');
        }
      }
    } catch (e) {
      showStreamControlMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnFakeMode.disabled = false;
    }
  });

  async function loadStreamState() {
    try { renderStreamButtons(await (await fetch('/api/stream/state')).json()); } catch (e) { /* панель останется в исходном виде */ }
  }

  btnAutoRecord.addEventListener('click', async () => {
    const enabled = !btnAutoRecord.classList.contains('on');
    renderStreamButtons({ autoRecord: enabled });
    try {
      const { ok, data } = await postJSON('/api/stream/auto-record', { enabled });
      if (ok && data.success) showStreamControlMessage(enabled ? 'Автозапись включена: история начнётся заново, когда стрим стартует.' : 'Автозапись выключена.', 'success');
      else { renderStreamButtons({ autoRecord: !enabled }); showStreamControlMessage('Не удалось переключить автозапись.', 'error'); }
    } catch (e) { renderStreamButtons({ autoRecord: !enabled }); showStreamControlMessage('Сетевая ошибка при обращении к серверу.', 'error'); }
  });

  btnStreamReset.addEventListener('click', async () => {
    const confirmed = await ui3Confirm(
      'Точно сбросить статистику текущего стрима?\n\n' +
      'Топ зрителей, таймлайн, счётчики эмодзи и облако слов обнулятся. Отменить это нельзя.'
    );
    if (!confirmed) return;

    btnStreamReset.disabled = true;
    showStreamControlMessage('Сбрасываем статистику…', '');
    try {
      const { ok, data } = await postJSON('/api/stream/reset', {});
      if (ok && data.success) {
        showStreamControlMessage('Готово — статистика сброшена, стрим начат заново.', 'success');
      } else {
        showStreamControlMessage((data && data.error) || 'Не удалось сбросить статистику.', 'error');
      }
    } catch (e) {
      showStreamControlMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnStreamReset.disabled = false;
    }
  });

  // Одна кнопка: запускает воспроизведение, а при повторном нажатии останавливает.
  btnReplayStart.addEventListener('click', async () => {
    btnReplayStart.disabled = true;
    try {
      if (replayRunning) {
        await postJSON('/api/replay/stop', {});
        renderStreamButtons({ replayActive: false });
        showStreamControlMessage('Воспроизведение остановлено.', 'success');
      } else {
        showStreamControlMessage('Запускаем воспроизведение на оверлее…', '');
        const { ok, data } = await postJSON('/api/replay/start', {});
        if (ok && data.success) {
          renderStreamButtons({ replayActive: true });
          showStreamControlMessage(`Воспроизведение запущено (${data.frames} кадров) — смотри на оверлей в OBS.`, 'success');
        } else {
          showStreamControlMessage((data && data.error) || 'Не удалось запустить воспроизведение.', 'error');
        }
      }
    } catch (e) {
      showStreamControlMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnReplayStart.disabled = false;
    }
  });

  // Выпадающие вкладки «Стиль» и «Сетка»: одновременно открыта только одна,
  // закрываются повторным нажатием на кнопку, нажатием на другую кнопку, кликом мимо и Esc.
  const wtoolPops = [
    { btn: document.getElementById('btnStylePop'), pop: document.getElementById('stylePop') },
    { btn: document.getElementById('btnGridPop'), pop: document.getElementById('gridPop') },
  ];
  function closeWtoolPops(except) {
    wtoolPops.forEach((p) => {
      if (p === except) return;
      p.pop.hidden = true;
      p.btn.setAttribute('aria-expanded', 'false');
      p.btn.classList.remove('on');
    });
  }
  wtoolPops.forEach((p) => {
    p.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = p.pop.hidden;
      closeWtoolPops(open ? p : null);
      p.pop.hidden = !open;
      p.btn.setAttribute('aria-expanded', String(open));
      p.btn.classList.toggle('on', open);
    });
  });
  document.addEventListener('click', (e) => {
    if (wtoolPops.some((p) => !p.pop.hidden && p.pop.contains(e.target))) return;
    closeWtoolPops(null);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWtoolPops(null); });
  // Любая другая кнопка панели тоже сворачивает открытую вкладку
  document.querySelectorAll('#wtoolBar .wtool-btn').forEach((b) => {
    if (!wtoolPops.some((p) => p.btn === b)) b.addEventListener('click', () => closeWtoolPops(null));
  });
  loadStreamState();
  setInterval(() => { if (!document.hidden) loadStreamState(); }, 10000); // фейк-режим мог выключиться сам (начался настоящий стрим)

  /* ================================================================
     Вкладка "Чат" — зеркало чата, настройки отображения, ссылка на виджет OBS
  ================================================================ */

  const chatMirror = document.getElementById('chatMirror');
  const chatMirrorEmpty = document.getElementById('chatMirrorEmpty');
  const chatWidgetUrlField = document.getElementById('chatWidgetUrl');
  const btnCopyWidgetUrl = document.getElementById('btnCopyWidgetUrl');
  const chatShowBadges = document.getElementById('chatShowBadges');
  const chatShowAvatars = document.getElementById('chatShowAvatars');
  const chatShowThirdPartyEmotes = document.getElementById('chatShowThirdPartyEmotes');
  const chatSettingsMessage = document.getElementById('chatSettingsMessage');
  const CHAT_MIRROR_LIMIT = 60;

  let chatDisplaySettings = { showBadges: true, showAvatars: true, showThirdPartyEmotes: true, animateMessages: true, hideLinks: false, highlightMods: false, highlightVips: false, highlightNewChatters: false, highlightRaiders: false };
  // Все переключатели шестерёнки «Отображение чата»: id поля -> ключ настройки на сервере
  const CHAT_TOGGLES = { chatShowBadges: 'showBadges', chatShowAvatars: 'showAvatars', chatShowThirdPartyEmotes: 'showThirdPartyEmotes', chatAnimateMessages: 'animateMessages', chatHideLinks: 'hideLinks', chatHighlightMods: 'highlightMods', chatHighlightVips: 'highlightVips', chatHighlightNewChatters: 'highlightNewChatters', chatHighlightRaiders: 'highlightRaiders' };
  let chatMessagesCache = []; // чтобы перерисовать всё при смене настроек, не только новые сообщения

  const CHAT_COLORS = ['#B14846','#00D4FF','#FF5C8A','#4ADE80','#FFB454','#60A5FA','#F472B6','#34D399','#FBBF24','#A78BFA'];
  function colorForNameFallback(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
  }

  function renderEmotePartMirror(part) {
    const isThirdParty = part.source === 'third-party';
    if (isThirdParty && !chatDisplaySettings.showThirdPartyEmotes) {
      return document.createTextNode(part.name);
    }
    const wrap = document.createElement('span');
    wrap.className = 'emote-wrap';
    const img = document.createElement('img');
    img.className = 'chat-emote';
    img.src = part.imageUrl;
    img.alt = part.name;
    wrap.appendChild(img);
    if (chatDisplaySettings.showThirdPartyEmotes && part.overlays && part.overlays.length) {
      part.overlays.forEach((ov) => {
        const ovImg = document.createElement('img');
        ovImg.className = 'chat-emote chat-emote-overlay';
        ovImg.src = ov.imageUrl;
        ovImg.alt = ov.name;
        wrap.appendChild(ovImg);
      });
    }
    return wrap;
  }

  /** Строка сообщения или null, если её показывать не нужно (включено «скрывать ссылки», а в сообщении была только ссылка). */
  function renderChatLine(msg) {
    let parts = msg.parts || [];
    if (chatDisplaySettings.hideLinks) {
      const r = window.ChatFormat.stripLinks(parts);
      if (r.hadLink && r.empty) return null;
      parts = r.parts;
    }
    const line = document.createElement('div');
    line.className = 'chat-mirror-line';

    if (chatDisplaySettings.showAvatars && msg.avatarUrl) {
      const avatar = document.createElement('img');
      avatar.className = 'chat-avatar';
      avatar.src = msg.avatarUrl;
      line.appendChild(avatar);
    }

    if (chatDisplaySettings.showBadges && msg.badges && msg.badges.length) {
      msg.badges.forEach((url) => {
        const badge = document.createElement('img');
        badge.className = 'chat-badge';
        badge.src = url;
        line.appendChild(badge);
      });
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'chat-username';
    nameEl.textContent = msg.username;
    nameEl.style.color = msg.color || colorForNameFallback(msg.username);
    line.appendChild(nameEl);
    window.ChatFormat.decorateLine(line, msg, chatDisplaySettings, nameEl); // подсветка и метки ролей (если включены в настройках)

    parts.forEach((part) => {
      if (part.type === 'emote') {
        line.appendChild(renderEmotePartMirror(part));
      } else if (part.text) {
        line.appendChild(document.createTextNode(part.text));
      }
    });
    return line;
  }

  function renderChatMirrorAll() {
    chatMirror.innerHTML = '';
    if (chatMessagesCache.length === 0) {
      chatMirror.appendChild(chatMirrorEmpty);
      return;
    }
    chatMessagesCache.slice(-CHAT_MIRROR_LIMIT).forEach((msg) => {
      const line = renderChatLine(msg); // перерисовка уже показанных сообщений — без анимации
      if (line) chatMirror.appendChild(line);
    });
    chatMirror.scrollTop = chatMirror.scrollHeight;
  }

  function addChatMirrorMessage(msg) {
    chatMessagesCache.push(msg);
    if (chatMessagesCache.length > CHAT_MIRROR_LIMIT) chatMessagesCache.shift();
    if (chatMirrorEmpty.parentNode) chatMirrorEmpty.remove();
    const wasAtBottom = chatMirror.scrollTop + chatMirror.clientHeight >= chatMirror.scrollHeight - 40;
    const line = renderChatLine(msg);
    if (line) {
      if (chatDisplaySettings.animateMessages) {
        line.classList.add('chat-enter');
        line.addEventListener('animationend', () => line.classList.remove('chat-enter'), { once: true });
      }
      chatMirror.appendChild(line);
    }
    while (chatMirror.children.length > CHAT_MIRROR_LIMIT) {
      chatMirror.removeChild(chatMirror.firstChild);
    }
    if (wasAtBottom) chatMirror.scrollTop = chatMirror.scrollHeight;
  }

  function applyChatSettingsToForm(settings) {
    chatDisplaySettings = { ...chatDisplaySettings, ...settings };
    Object.entries(CHAT_TOGGLES).forEach(([id, key]) => { document.getElementById(id).checked = !!chatDisplaySettings[key]; });
  }

  function connectChatMirror() {
    const ws = new WebSocket(`ws://${location.host}/?type=chat&view=admin`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat_history') {
        if (data.settings) applyChatSettingsToForm(data.settings);
        chatMessagesCache = data.messages || [];
        renderChatMirrorAll();
      } else if (data.type === 'chat') {
        addChatMirrorMessage(data);
      } else if (data.type === 'chat_settings') {
        applyChatSettingsToForm(data.settings);
        renderChatMirrorAll(); // уже показанные сообщения тоже перерисовываются с новыми настройками
      }
    };
    ws.onclose = () => setTimeout(connectChatMirror, 3000);
  }
  connectChatMirror();

  function showChatSettingsMessage(text, kind) {
    chatSettingsMessage.textContent = text;
    chatSettingsMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  async function saveChatSetting(patch) {
    showChatSettingsMessage('Сохраняем…', '');
    try {
      const { ok, data } = await postJSON('/api/chat-settings', patch);
      if (ok && data.success) {
        applyChatSettingsToForm(data.settings);
        renderChatMirrorAll();
        showChatSettingsMessage('Сохранено и применено.', 'success');
      } else {
        showChatSettingsMessage('Не удалось сохранить настройки.', 'error');
      }
    } catch (e) {
      showChatSettingsMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }

  Object.entries(CHAT_TOGGLES).forEach(([id, key]) => {
    const input = document.getElementById(id);
    input.addEventListener('change', () => saveChatSetting({ [key]: input.checked }));
  });

  async function loadChatSettings() {
    try {
      const res = await fetch('/api/chat-settings');
      const data = await res.json();
      applyChatSettingsToForm(data.settings);
    } catch (e) {
      // WS-канал (chat_history) тоже принесёт настройки чуть позже — не критично
    }
  }
  loadChatSettings();

  chatWidgetUrlField.value = `http://localhost:${location.port || 3001}/chat-widget.html`;

  async function copyToField(field, btn) {
    try {
      await navigator.clipboard.writeText(field.value);
      const original = btn.textContent;
      btn.textContent = 'Скопировано';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch (e) {
      field.select();
    }
  }
  // Кнопка OBS у окна чата: круглая иконка, при наведении разворачивается в «Скопировать URL». copyToField тут не подходит —
  // он перезаписывает textContent кнопки и стёр бы иконку, поэтому меняем только подпись.
  btnCopyWidgetUrl.addEventListener('click', async () => {
    const label = btnCopyWidgetUrl.querySelector('.chat-obs-btn-label');
    try {
      await navigator.clipboard.writeText(chatWidgetUrlField.value);
      label.textContent = 'Скопировано!';
    } catch (e) {
      label.textContent = 'Не удалось скопировать';
    }
    setTimeout(() => { label.textContent = 'Скопировать URL'; }, 1500);
  });

  /* ================================================================
     Вкладка "Донатный хаб" — подключение DonationAlerts/DonateX, лента донатов
  ================================================================ */

  const donationsFeed = document.getElementById('donationsFeed');
  const donationsFeedEmpty = document.getElementById('donationsFeedEmpty');
  const btnDonationsReset = document.getElementById('btnDonationsReset');

  const donateXDot = document.getElementById('donateXDot');
  const donateXToken = document.getElementById('donateXToken');
  const donateXRememberToggle = document.getElementById('donateXRememberToggle');
  const btnDonateXConnect = document.getElementById('btnDonateXConnect');
  const btnDonateXDisconnect = document.getElementById('btnDonateXDisconnect');
  const donateXMessage = document.getElementById('donateXMessage');

  const daDot = document.getElementById('daDot');
  const daClientId = document.getElementById('daClientId');
  const daClientSecret = document.getElementById('daClientSecret');
  const daRememberToggle = document.getElementById('daRememberToggle');
  const daCallbackUrl = document.getElementById('daCallbackUrl');
  const btnCopyDaCallback = document.getElementById('btnCopyDaCallback');
  const btnDaSaveCredentials = document.getElementById('btnDaSaveCredentials');
  const btnDaLogin = document.getElementById('btnDaLogin');
  const btnDaDisconnect = document.getElementById('btnDaDisconnect');
  const daMessage = document.getElementById('daMessage');

  daCallbackUrl.value = `http://localhost:${location.port || 3001}/auth/donationalerts/callback`;
  btnCopyDaCallback.addEventListener('click', () => copyToField(daCallbackUrl, btnCopyDaCallback));

  if (paramDonationsError) {
    daMessage.textContent = paramDonationsError;
    daMessage.className = 'form-message error';
  }

  // Аккордеон карточек платформ — клик по заголовку разворачивает/сворачивает
  document.querySelectorAll('.platform-card-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.closest('.platform-card').classList.toggle('expanded');
    });
  });

  const PLATFORM_LABELS = { donationalerts: 'DA', donatex: 'DX' };

  function formatDonationTime(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function renderDonationItem(donation) {
    const item = document.createElement('div');
    item.className = 'donation-item';
    item.dataset.platform = donation.platform;
    // ник и сообщение пишет донатер — только как текст, без HTML
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    item.innerHTML = `
      <div class="donation-icon">${PLATFORM_LABELS[donation.platform] || '?'}</div>
      <div class="donation-body">
        <div class="donation-top">
          <span class="donation-username">${esc(donation.username)}</span>
          <span class="donation-amount">${esc(Number(donation.amount).toLocaleString('ru-RU'))} ${donation.currency === 'RUB' || !donation.currency ? '₽' : esc(donation.currency)}</span>
          <span class="donation-time">${formatDonationTime(donation.ts)}</span>
        </div>
        ${donation.message ? `<div class="donation-message">${esc(donation.message)}</div>` : ''}
      </div>
    `;
    item.dataset.ts = donation.ts; item.dataset.amount = donation.amount; item.dataset.currency = donation.currency || 'RUB'; item.dataset.user = donation.username || '';
    return item;
  }

  function onDonationReceived(donation) {
    if (donationsFeedEmpty.parentNode) donationsFeedEmpty.remove();
    donationsFeed.insertBefore(renderDonationItem(donation), donationsFeed.firstChild);
    if (window.ui3DonationsChanged) window.ui3DonationsChanged();
  }

  async function loadDonationHistory() {
    try {
      const res = await fetch('/api/donations/history');
      const data = await res.json();
      const list = data.donations || [];
      donationsFeed.innerHTML = '';
      if (list.length === 0) {
        donationsFeed.appendChild(donationsFeedEmpty);
      } else {
        list.forEach((donation) => donationsFeed.appendChild(renderDonationItem(donation)));
      }
    } catch (e) {
      // не критично — лента просто останется пустой, пока не придёт первый живой донат
    }
  }
  loadDonationHistory();

  btnDonationsReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Точно очистить всю историю донатов? Отменить это нельзя.')) return;
    btnDonationsReset.disabled = true;
    try {
      const { ok } = await postJSON('/api/donations/reset', {});
      if (ok) {
        donationsFeed.innerHTML = '';
        donationsFeed.appendChild(donationsFeedEmpty);
      }
    } catch (e) {
      // сетевая ошибка — просто не сбросили, лента останется как была
    } finally {
      btnDonationsReset.disabled = false;
    }
  });

  function applyDonationsStatus(data) {
    donateXDot.classList.toggle('connected', !!data.donateX.connected);
    btnDonateXConnect.disabled = !!data.donateX.connected;
    btnDonateXDisconnect.disabled = !data.donateX.connected;
    if (data.donateX.remembered !== undefined) donateXRememberToggle.checked = !!data.donateX.remembered;
    if (!data.donateX.available) {
      donateXMessage.textContent = 'Пакет @hitomihiumi/donatex.js не установлен на сервере — выполни npm install.';
      donateXMessage.className = 'form-message error';
    }

    daDot.classList.toggle('connected', !!data.donationAlerts.connected);
    btnDaLogin.disabled = !data.donationAlerts.hasCredentials;
    btnDaDisconnect.disabled = !data.donationAlerts.connected;
    if (data.donationAlerts.remembered !== undefined) daRememberToggle.checked = !!data.donationAlerts.remembered;
    if (data.donationAlerts.clientId !== undefined && !daClientId.value) daClientId.value = data.donationAlerts.clientId;
    if (data.donationAlerts.connected && data.donationAlerts.userName) {
      daMessage.textContent = `Подключено: ${data.donationAlerts.userName}`;
      daMessage.className = 'form-message success';
    } else if (!data.donationAlerts.connected && daDot.dataset.wasConnected === '1') {
      // соединение только что пропало (например, автопереподключение само сдалось после невалидного токена)
      daMessage.textContent = 'Соединение с DonationAlerts потеряно — попробуй войти заново.';
      daMessage.className = 'form-message error';
    }
    daDot.dataset.wasConnected = data.donationAlerts.connected ? '1' : '0';
  }

  async function loadDonationsStatus() {
    try {
      const res = await fetch('/api/donations/status');
      const data = await res.json();
      applyDonationsStatus(data);
    } catch (e) {
      // не критично — статус просто не обновится до следующей перезагрузки вкладки
    }
  }
  loadDonationsStatus();

  btnDonateXConnect.addEventListener('click', async () => {
    const token = donateXToken.value.trim();
    if (!token) {
      donateXMessage.textContent = 'Вставь API-токен DonateX.';
      donateXMessage.className = 'form-message error';
      return;
    }
    btnDonateXConnect.disabled = true;
    donateXMessage.textContent = 'Подключаемся…';
    donateXMessage.className = 'form-message';
    try {
      const { ok, data } = await postJSON('/api/donations/donatex/connect', { apiToken: token, remember: donateXRememberToggle.checked });
      if (ok && data.success) {
        donateXMessage.textContent = 'Подключено — донаты DonateX будут появляться в ленте.';
        donateXMessage.className = 'form-message success';
        donateXDot.classList.add('connected');
        btnDonateXDisconnect.disabled = false;
      } else {
        donateXMessage.textContent = (data && data.error) || 'Не удалось подключиться.';
        donateXMessage.className = 'form-message error';
      }
    } catch (e) {
      donateXMessage.textContent = 'Сетевая ошибка при обращении к серверу.';
      donateXMessage.className = 'form-message error';
    } finally {
      btnDonateXConnect.disabled = false;
    }
  });

  btnDonateXDisconnect.addEventListener('click', async () => {
    btnDonateXDisconnect.disabled = true;
    try {
      await postJSON('/api/donations/donatex/disconnect', {});
      donateXDot.classList.remove('connected');
      btnDonateXConnect.disabled = false;
      donateXMessage.textContent = 'Отключено.';
      donateXMessage.className = 'form-message';
    } catch (e) {
      // сетевая ошибка — статус мог не обновиться, ничего страшного
    } finally {
      btnDonateXDisconnect.disabled = false;
    }
  });

  btnDaSaveCredentials.addEventListener('click', async () => {
    const clientId = daClientId.value.trim();
    const clientSecret = daClientSecret.value.trim();
    daMessage.textContent = 'Сохраняем…';
    daMessage.className = 'form-message';
    try {
      const { ok } = await postJSON('/api/donations/donationalerts/credentials', { clientId, clientSecret, remember: daRememberToggle.checked });
      if (ok) {
        daMessage.textContent = 'Сохранено — теперь можно нажать «Войти через DonationAlerts».';
        daMessage.className = 'form-message success';
        btnDaLogin.disabled = !(clientId && clientSecret);
      } else {
        daMessage.textContent = 'Не удалось сохранить.';
        daMessage.className = 'form-message error';
      }
    } catch (e) {
      daMessage.textContent = 'Сетевая ошибка при обращении к серверу.';
      daMessage.className = 'form-message error';
    }
  });

  btnDaLogin.addEventListener('click', () => {
    window.location.href = '/auth/donationalerts/login';
  });

  btnDaDisconnect.addEventListener('click', async () => {
    btnDaDisconnect.disabled = true;
    try {
      await postJSON('/api/donations/donationalerts/disconnect', {});
      daDot.classList.remove('connected');
      daMessage.textContent = 'Отключено.';
      daMessage.className = 'form-message';
    } catch (e) {
      // сетевая ошибка — статус мог не обновиться, ничего страшного
    } finally {
      btnDaDisconnect.disabled = false;
    }
  });

  // Кнопка «Помощь» и гайды вынесены в guides.js / guides-data.js

  /* ================================================================
     Вкладка "Ивент" — редактор "Панель команды" (левая/правая).
     Один и тот же код обслуживает обе стороны — разница только в
     префиксе id элементов ("teamLeft.../teamRight...") и в side для API.
  ================================================================ */

  /* --- Окна «Положение фото» и «Размер и положение логотипа» (общие на обе команды) --- */

  const ZOOM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M10.5 7.8v5.4M7.8 10.5h5.4"/></svg>';
  const cropUi = {
    overlay: document.getElementById('cropModalOverlay'), title: document.getElementById('cropModalTitle'),
    frame: document.getElementById('cropFrame'), img: document.getElementById('cropImg'),
    zoom: document.getElementById('cropZoom'), zoomVal: document.getElementById('cropZoomValue'),
  };
  let cropState = null;
  function cropClose() { cropUi.overlay.classList.remove('open'); cropState = null; }
  function cropRender() {
    if (!cropState || !cropState.nw) return;
    window.PhotoCrop.apply(cropUi.frame, cropUi.img, cropState.crop);
    cropUi.zoom.value = cropState.crop.zoom; cropUi.zoomVal.textContent = cropState.crop.zoom.toFixed(2) + '×';
  }
  function cropSet(next) {
    const st = cropState; if (!st || !st.nw) return;
    st.crop = window.PhotoCrop.fit(st.fw, st.fh, st.nw, st.nh, next);
    cropRender();
  }
  /** ratio — ширина/высота рамки фото на карточке в оверлее; crop — текущее {x,y,zoom}; onDone(crop) — по «Готово». */
  function openCropEditor({ title, url, ratio, crop, onDone }) {
    const PC = window.PhotoCrop;
    let fw = Math.min(520, window.innerWidth - 90), fh = fw / ratio;
    const maxH = Math.max(160, window.innerHeight * 0.5);
    if (fh > maxH) { fh = maxH; fw = fh * ratio; }
    cropState = { crop: PC.norm(crop), onDone, nw: 0, nh: 0, fw: Math.round(fw), fh: Math.round(fh) };
    cropUi.title.textContent = title;
    cropUi.frame.style.width = cropState.fw + 'px'; cropUi.frame.style.height = cropState.fh + 'px';
    cropUi.img.removeAttribute('style');
    cropUi.overlay.classList.add('open');
    const st = cropState;
    cropUi.img.onload = () => { if (cropState !== st) return; st.fw = cropUi.frame.clientWidth; st.fh = cropUi.frame.clientHeight; st.nw = cropUi.img.naturalWidth; st.nh = cropUi.img.naturalHeight; cropSet(st.crop); };
    cropUi.img.src = url;
    if (cropUi.img.complete && cropUi.img.naturalWidth) cropUi.img.onload();
  }
  (function wireCrop() {
    const f = cropUi.frame; let drag = null;
    f.addEventListener('pointerdown', (e) => {
      const st = cropState; if (!st || !st.nw) return;
      const L = window.PhotoCrop.layout(st.fw, st.fh, st.nw, st.nh, st.crop);
      drag = { x: e.clientX, y: e.clientY, L }; f.setPointerCapture(e.pointerId); f.classList.add('dragging');
    });
    f.addEventListener('pointermove', (e) => {
      if (!drag || !cropState) return;
      const st = cropState, L = drag.L;
      const left = L.left + (e.clientX - drag.x), top = L.top + (e.clientY - drag.y);
      cropSet({ x: (st.fw / 2 - left) / L.dw, y: (st.fh / 2 - top) / L.dh, zoom: st.crop.zoom });
    });
    const end = () => { drag = null; f.classList.remove('dragging'); };
    f.addEventListener('pointerup', end); f.addEventListener('pointercancel', end);
    f.addEventListener('wheel', (e) => {
      if (!cropState) return; e.preventDefault();
      cropSet({ ...cropState.crop, zoom: cropState.crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) });
    }, { passive: false });
    cropUi.zoom.addEventListener('input', () => { if (cropState) cropSet({ ...cropState.crop, zoom: Number(cropUi.zoom.value) }); });
    document.getElementById('cropReset').addEventListener('click', () => { if (cropState) cropSet({ x: 0.5, y: 0.5, zoom: 1 }); });
    document.getElementById('cropCancel').addEventListener('click', cropClose);
    document.getElementById('cropModalClose').addEventListener('click', cropClose);
    cropUi.overlay.addEventListener('click', (e) => { if (e.target === cropUi.overlay) cropClose(); });
    document.getElementById('cropDone').addEventListener('click', () => { const st = cropState; cropClose(); if (st && st.onDone) st.onDone(st.crop); });
  })();

  const logoUi = {
    overlay: document.getElementById('logoModalOverlay'), title: document.getElementById('logoModalTitle'),
    card: document.getElementById('logoCard'), photo: document.getElementById('logoCardPhoto'), handle: document.getElementById('logoHandle'),
    size: document.getElementById('logoSizeRange'), sizeVal: document.getElementById('logoSizeValue'),
  };
  let logoState = null;
  function logoClose() { logoUi.overlay.classList.remove('open'); logoState = null; }
  function logoRender() {
    const st = logoState; if (!st) return;
    const l = st.layout, k = st.k;
    logoUi.handle.style.width = logoUi.handle.style.height = (l.size * k) + 'px';
    logoUi.handle.style.left = l.x + '%'; logoUi.handle.style.top = l.y + '%';
    logoUi.size.value = l.size; logoUi.sizeVal.textContent = Math.round(l.size) + ' px';
  }
  /** card — размер карточки в оверлее (px), layout — {size,x,y}; photoUrl/photoCrop — для наглядности (фото первого игрока); onDone(layout|null). */
  function openLogoEditor({ title, logoUrl, photoUrl, photoCrop, card, layout, onDone }) {
    const maxH = Math.max(260, Math.min(460, window.innerHeight * 0.55)), k = maxH / card.h;
    logoState = { layout: { ...layout }, k, onDone };
    logoUi.title.textContent = title;
    logoUi.card.style.width = Math.round(card.w * k) + 'px'; logoUi.card.style.height = Math.round(card.h * k) + 'px';
    logoUi.photo.innerHTML = '';
    if (photoUrl) { const im = document.createElement('img'); im.alt = ''; im.src = photoUrl; logoUi.photo.appendChild(im); window.PhotoCrop.apply(logoUi.photo, im, photoCrop); }
    logoUi.handle.src = logoUrl;
    logoUi.overlay.classList.add('open');
    logoRender();
    if (photoUrl) setTimeout(() => { const im = logoUi.photo.querySelector('img'); if (im && logoState) window.PhotoCrop.apply(logoUi.photo, im, photoCrop); }, 0);
  }
  (function wireLogo() {
    let drag = null;
    logoUi.handle.addEventListener('pointerdown', (e) => {
      if (!logoState) return;
      const r = logoUi.card.getBoundingClientRect();
      drag = { dx: e.clientX - (r.left + logoState.layout.x / 100 * r.width), dy: e.clientY - (r.top + logoState.layout.y / 100 * r.height) };
      logoUi.handle.setPointerCapture(e.pointerId); logoUi.handle.classList.add('dragging'); e.preventDefault();
    });
    logoUi.handle.addEventListener('pointermove', (e) => {
      if (!drag || !logoState) return;
      const r = logoUi.card.getBoundingClientRect();
      const x = ((e.clientX - drag.dx - r.left) / r.width) * 100, y = ((e.clientY - drag.dy - r.top) / r.height) * 100;
      logoState.layout.x = Math.round(Math.max(0, Math.min(100, x)) * 10) / 10; logoState.layout.y = Math.round(Math.max(0, Math.min(100, y)) * 10) / 10;
      logoRender();
    });
    const end = () => { drag = null; logoUi.handle.classList.remove('dragging'); };
    logoUi.handle.addEventListener('pointerup', end); logoUi.handle.addEventListener('pointercancel', end);
    logoUi.size.addEventListener('input', () => { if (logoState) { logoState.layout.size = Number(logoUi.size.value); logoRender(); } });
    logoUi.card.addEventListener('wheel', (e) => { if (!logoState) return; e.preventDefault(); logoState.layout.size = Math.max(20, Math.min(320, Math.round(logoState.layout.size * (e.deltaY < 0 ? 1.06 : 1 / 1.06)))); logoRender(); }, { passive: false });
    document.getElementById('logoCancel').addEventListener('click', logoClose);
    document.getElementById('logoModalClose').addEventListener('click', logoClose);
    logoUi.overlay.addEventListener('click', (e) => { if (e.target === logoUi.overlay) logoClose(); });
    document.getElementById('logoDone').addEventListener('click', () => { const st = logoState; logoClose(); if (st && st.onDone) st.onDone({ ...st.layout }); });
    document.getElementById('logoResetShared').addEventListener('click', () => { const st = logoState; logoClose(); if (st && st.onDone) st.onDone(null); });
  })();

  function setupTeamEditor(side) {
    const prefix = side === 'left' ? 'teamLeft' : 'teamRight';
    const nameInput = document.getElementById(`${prefix}Name`);
    const logoEl = document.getElementById(`${prefix}Logo`);
    const logoInput = document.getElementById(`${prefix}LogoInput`);
    const btnLogoUpload = document.getElementById(`btnTeam${side === 'left' ? 'Left' : 'Right'}LogoUpload`);
    const btnSave = document.getElementById(`btnTeam${side === 'left' ? 'Left' : 'Right'}Save`);
    const messageEl = document.getElementById(`${prefix}Message`);

    const photoEls = [0, 1, 2, 3, 4].map((i) => document.getElementById(`${prefix}Photo${i}`));
    const fileInputs = [0, 1, 2, 3, 4].map((i) => document.getElementById(`${prefix}FileInput${i}`));
    const nickInputs = [0, 1, 2, 3, 4].map((i) => document.getElementById(`${prefix}Nick${i}`));
    const roleInputs = [0, 1, 2, 3, 4].map((i) => document.getElementById(`${prefix}Role${i}`));
    const aboutInputs = [0, 1, 2, 3, 4].map((i) => document.getElementById(`${prefix}About${i}`));

    function showMessage(text, kind) {
      messageEl.textContent = text;
      messageEl.className = 'form-message' + (kind ? ' ' + kind : '');
    }

    function fillSlot(el, url, placeholderText) {
      el.innerHTML = url
        ? `<img src="${url}" alt="">`
        : `<span class="team-editor-photo-placeholder">${placeholderText}</span>`;
    }

    // Состояние этой команды, которого нет в полях ввода: адреса фото и логотипа, кадрирование каждого фото, свой размер/положение логотипа.
    const photoUrls = [null, null, null, null, null];
    const crops = [0, 1, 2, 3, 4].map(() => ({ x: 0.5, y: 0.5, zoom: 1 }));
    let logoUrl = null;
    let logoLayout = null; // null — свои значения не заданы, действуют общие настройки

    /** Миниатюра фото с кружком-лупой (открывает окно кадрирования) и применённым кадрированием. */
    function fillPhotoSlot(i) {
      const el = photoEls[i], url = photoUrls[i];
      fillSlot(el, url, 'Фото');
      if (!url) return;
      const img = el.querySelector('img');
      window.PhotoCrop.apply(el, img, crops[i]);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'team-zoom-btn'; btn.title = 'Положение фото: сдвинуть и приблизить'; btn.innerHTML = ZOOM_ICON;
      btn.addEventListener('click', (e) => { e.stopPropagation(); openPhotoCrop(i); });
      el.appendChild(btn);
    }
    function refreshThumbs() { for (let i = 0; i < 5; i++) fillPhotoSlot(i); }
    // вкладка могла быть скрыта в момент заполнения (у скрытого элемента нет размера) — когда рамка получает размер, кадрирование ставится заново
    if (typeof ResizeObserver !== 'undefined') photoEls.forEach((el, i) => new ResizeObserver(() => { const im = el.querySelector('img'); if (im) window.PhotoCrop.apply(el, im, crops[i]); }).observe(el));

    function cardRatio() { const s = lastTeamSettings || { cardWidth: 275, cardHeight: 410 }; return s.cardWidth / (s.cardHeight * 0.52); }

    async function openPhotoCrop(i) {
      if (!photoUrls[i]) return;
      const nick = nickInputs[i].value.trim();
      openCropEditor({
        title: 'Положение фото' + (nick ? ' — ' + nick : ' — игрок ' + (i + 1)),
        url: photoUrls[i], ratio: cardRatio(), crop: crops[i],
        onDone: async (crop) => {
          showMessage('Сохраняем положение фото…', '');
          try {
            const { ok, data } = await postJSON(`/api/team/${side}/photo/${i}/crop`, crop);
            if (!ok || !data.success) throw new Error((data && data.error) || 'Не удалось сохранить');
            crops[i] = data.crop; fillPhotoSlot(i);
            showMessage('Положение фото сохранено (только для этой команды).', 'success');
          } catch (e) { showMessage(e.message || 'Не удалось сохранить положение фото.', 'error'); }
        },
      });
    }

    function sharedLogoLayout() { const s = lastTeamSettings || { logoSize: 90, logoPositionX: 78, logoPositionY: 62 }; return { size: s.logoSize, x: s.logoPositionX, y: s.logoPositionY }; }

    function openLogoLayout() {
      if (!logoUrl) { showMessage('Сначала загрузите логотип.', 'error'); return; }
      const s = lastTeamSettings || { cardWidth: 275, cardHeight: 410 };
      openLogoEditor({
        title: 'Размер и положение логотипа', logoUrl, photoUrl: photoUrls[0], photoCrop: crops[0],
        card: { w: s.cardWidth, h: s.cardHeight }, layout: logoLayout || sharedLogoLayout(),
        onDone: async (layout) => {
          showMessage('Сохраняем логотип…', '');
          try {
            const { ok, data } = await postJSON(`/api/team/${side}/logo-layout`, layout ? layout : { reset: true });
            if (!ok || !data.success) throw new Error((data && data.error) || 'Не удалось сохранить');
            logoLayout = data.logoLayout;
            showMessage(layout ? 'Размер и положение логотипа сохранены (только для этой команды).' : 'Логотип снова берёт общие настройки размеров.', 'success');
          } catch (e) { showMessage(e.message || 'Не удалось сохранить логотип.', 'error'); }
        },
      });
    }

    function applyTeam(team) {
      if (!team) return;
      nameInput.value = team.teamName || '';
      logoUrl = team.logoUrl || null;
      logoLayout = team.logoLayout || null;
      fillSlot(logoEl, logoUrl, 'Лого');
      team.players.forEach((p, i) => {
        nickInputs[i].value = p.nickname || '';
        roleInputs[i].value = p.role || '';
        aboutInputs[i].value = p.about || '';
        photoUrls[i] = p.photoUrl || null;
        crops[i] = window.PhotoCrop.norm(p.crop);
        fillPhotoSlot(i);
      });
    }

    async function uploadFile(url, fieldName, file) {
      const formData = new FormData();
      formData.append(fieldName, file);
      const res = await fetch(url, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error((data && data.error) || 'Не удалось загрузить файл');
      return data.url;
    }

    photoEls.forEach((el, i) => {
      el.addEventListener('click', () => fileInputs[i].click());
      fileInputs[i].addEventListener('change', async () => {
        const file = fileInputs[i].files[0];
        if (!file) return;
        showMessage('Загружаем фото…', '');
        try {
          const url = await uploadFile(`/api/team/${side}/photo/${i}`, 'photo', file);
          photoUrls[i] = url; crops[i] = { x: 0.5, y: 0.5, zoom: 1 }; // новое фото — кадрирование с нуля (так же делает сервер)
          fillPhotoSlot(i);
          showMessage('Фото загружено. Кружок с лупой на фото — сдвинуть и приблизить.', 'success');
        } catch (e) {
          showMessage(e.message, 'error');
        } finally {
          fileInputs[i].value = '';
        }
      });
    });

    logoEl.addEventListener('click', () => logoInput.click());
    btnLogoUpload.addEventListener('click', () => logoInput.click());
    logoInput.addEventListener('change', async () => {
      const file = logoInput.files[0];
      if (!file) return;
      showMessage('Загружаем логотип…', '');
      try {
        const url = await uploadFile(`/api/team/${side}/logo`, 'logo', file);
        logoUrl = url; fillSlot(logoEl, url, 'Лого');
        showMessage('Логотип загружен.', 'success');
      } catch (e) {
        showMessage(e.message, 'error');
      } finally {
        logoInput.value = '';
      }
    });

    btnSave.addEventListener('click', async () => {
      showMessage('Сохраняем…', '');
      try {
        const body = {
          teamName: nameInput.value,
          players: nickInputs.map((input, i) => ({ nickname: input.value, role: roleInputs[i].value, about: aboutInputs[i].value })),
        };
        const { ok, data } = await postJSON(`/api/team/${side}/save`, body);
        showMessage(ok && data.success ? 'Сохранено.' : 'Не удалось сохранить.', ok ? 'success' : 'error');
      } catch (e) {
        showMessage('Сетевая ошибка при обращении к серверу.', 'error');
      }
    });

    const cap = side === 'left' ? 'Left' : 'Right';
    const btnPresetSave = document.getElementById(`btnTeam${cap}PresetSave`);
    const btnPresetLoad = document.getElementById(`btnTeam${cap}PresetLoad`);

    btnPresetSave.addEventListener('click', async () => {
      const name = prompt('Имя пресета (например, «Team Spirit»):');
      if (!name || !name.trim()) return;
      showMessage('Сохраняем пресет…', '');
      try {
        const { ok, data } = await postJSON('/api/team/presets/save', { side, name: name.trim() });
        if (ok && data.success) {
          showMessage(`Пресет «${data.preset.name}» сохранён.`, 'success');
        } else {
          showMessage((data && data.error) || 'Не удалось сохранить пресет.', 'error');
        }
      } catch (e) {
        showMessage('Сетевая ошибка при обращении к серверу.', 'error');
      }
    });

    // кружок с лупой рядом с логотипом: размер и положение логотипа этой команды
    const btnLogoLayout = document.createElement('button');
    btnLogoLayout.type = 'button'; btnLogoLayout.className = 'team-zoom-btn team-zoom-btn-inline';
    btnLogoLayout.title = 'Размер и положение логотипа (для этой команды)'; btnLogoLayout.innerHTML = ZOOM_ICON;
    btnLogoLayout.addEventListener('click', openLogoLayout);
    btnLogoUpload.insertAdjacentElement('afterend', btnLogoLayout);

    btnPresetLoad.addEventListener('click', () => {
      openTeamPresetModal(side, (team) => {
        applyTeam(team);
        showMessage('Команда загружена из пресета.', 'success');
      });
    });

    return { applyTeam, refreshThumbs };
  }

  const teamEditors = { left: setupTeamEditor('left'), right: setupTeamEditor('right') };

  /* --- Модалка "Загрузить команду" — общая на обе стороны --- */

  const teamPresetModalOverlay = document.getElementById('teamPresetModalOverlay');
  const teamPresetModalClose = document.getElementById('teamPresetModalClose');
  const teamPresetListEl = document.getElementById('teamPresetList');

  function closeTeamPresetModal() {
    teamPresetModalOverlay.classList.remove('open');
  }
  teamPresetModalClose.addEventListener('click', closeTeamPresetModal);
  teamPresetModalOverlay.addEventListener('click', (e) => {
    if (e.target === teamPresetModalOverlay) closeTeamPresetModal();
  });

  async function openTeamPresetModal(side, onLoaded) {
    teamPresetModalOverlay.classList.add('open');
    teamPresetListEl.innerHTML = '<p class="card-hint">Загружаем список…</p>';
    try {
      const res = await fetch('/api/team/presets');
      const data = await res.json();
      const presets = data.presets || [];
      if (presets.length === 0) {
        teamPresetListEl.innerHTML = '<p class="card-hint">Пока нет сохранённых команд.</p>';
        return;
      }
      teamPresetListEl.innerHTML = '';
      presets.forEach((preset) => {
        const row = document.createElement('div');
        row.className = 'team-preset-row';
        row.innerHTML = `
          <span class="team-preset-row-name">${preset.name}</span>
          <span class="team-preset-row-actions">
            <button class="btn btn-primary" type="button">Загрузить</button>
            <button class="btn-tiny" type="button">Удалить</button>
          </span>
        `;
        const [loadBtn, deleteBtn] = row.querySelectorAll('button');
        loadBtn.addEventListener('click', async () => {
          try {
            const { ok, data: loadData } = await postJSON('/api/team/presets/load', { side, id: preset.id });
            if (ok && loadData.success) {
              onLoaded(loadData.team);
              closeTeamPresetModal();
            }
          } catch (e) {
            // не критично — модалка просто останется открытой
          }
        });
        deleteBtn.addEventListener('click', async () => {
          if (!await ui3Confirm(`Удалить сохранённую команду «${preset.name}» навсегда?`)) return;
          try {
            await postJSON('/api/team/presets/delete', { id: preset.id });
            row.remove();
          } catch (e) {
            // не критично
          }
        });
        teamPresetListEl.appendChild(row);
      });
    } catch (e) {
      teamPresetListEl.innerHTML = '<p class="card-hint">Не удалось загрузить список.</p>';
    }
  }

  /* --- Общие настройки размеров панели команды --- */

  const teamSizeSliders = {
    cardWidth: document.getElementById('teamSizeCardWidth'),
    cardHeight: document.getElementById('teamSizeCardHeight'),
    cardGap: document.getElementById('teamSizeCardGap'),
    logoSize: document.getElementById('teamSizeLogoSize'),
    logoPositionX: document.getElementById('teamSizeLogoX'),
    logoPositionY: document.getElementById('teamSizeLogoY'),
  };
  const teamSizeValueEls = {
    cardWidth: document.getElementById('teamSizeCardWidthValue'),
    cardHeight: document.getElementById('teamSizeCardHeightValue'),
    cardGap: document.getElementById('teamSizeCardGapValue'),
    logoSize: document.getElementById('teamSizeLogoSizeValue'),
    logoPositionX: document.getElementById('teamSizeLogoXValue'),
    logoPositionY: document.getElementById('teamSizeLogoYValue'),
  };
  const teamSizeUnits = { logoPositionX: '%', logoPositionY: '%' }; // остальные — px по умолчанию
  const teamColorPickers = {
    cardFillStart: document.getElementById('teamColorFillStart'),
    cardFillEnd: document.getElementById('teamColorFillEnd'),
    cardBorderStart: document.getElementById('teamColorBorderStart'),
    cardBorderEnd: document.getElementById('teamColorBorderEnd'),
    labelTextColor: document.getElementById('teamColorLabelText'),
  };
  const teamObsSizeValueEl = document.getElementById('teamObsSizeValue');
  const teamVerticalLayout = document.getElementById('teamVerticalLayout');
  teamVerticalLayout.addEventListener('change', async () => {
    try {
      const { ok, data } = await postJSON('/api/team/settings', { verticalLayout: teamVerticalLayout.checked });
      if (ok && data.success) applyRecommendedSize(data.recommendedSize);
      else teamVerticalLayout.checked = !teamVerticalLayout.checked;
    } catch (e) {
      teamVerticalLayout.checked = !teamVerticalLayout.checked; // не сохранилось — тумблер не должен врать
    }
  });
  const btnTeamSizeReset = document.getElementById('btnTeamSizeReset');

  let lastTeamSettings = null; // полный набор настроек с сервера — нужен модальному окну «Настройки текста»
  function applyTeamSizeSettings(settings) {
    lastTeamSettings = settings;
    document.documentElement.style.setProperty('--team-photo-ratio', (settings.cardWidth / (settings.cardHeight * 0.52)).toFixed(4)); // пропорция миниатюр фото = как на карточке
    if (typeof teamEditors !== 'undefined') { teamEditors.left.refreshThumbs(); teamEditors.right.refreshThumbs(); }
    Object.entries(teamSizeSliders).forEach(([key, input]) => {
      input.value = settings[key];
      teamSizeValueEls[key].textContent = settings[key] + (teamSizeUnits[key] || 'px');
    });
    Object.entries(teamColorPickers).forEach(([key, input]) => { input.value = settings[key]; });
    teamVerticalLayout.checked = !!settings.verticalLayout;
    if (teamTextOverlay.style.display === 'flex') fillTeamTextForm(settings); // окно открыто — обновляем и его (например, после «Сбросить»)
  }

  function applyRecommendedSize(size) {
    if (!size) return;
    teamObsSizeValueEl.textContent = `${size.width} × ${size.height} px`;
  }

  let teamSizeSaveTimer = null;
  function scheduleTeamSizeSave() {
    clearTimeout(teamSizeSaveTimer);
    teamSizeSaveTimer = setTimeout(async () => {
      const body = {};
      Object.entries(teamSizeSliders).forEach(([key, input]) => { body[key] = Number(input.value); });
      Object.entries(teamColorPickers).forEach(([key, input]) => { body[key] = input.value; });
      try {
        const { ok, data } = await postJSON('/api/team/settings', body);
        if (ok && data.success) applyRecommendedSize(data.recommendedSize);
      } catch (e) {
        // не критично — просто не сохранится в этот раз, значения останутся в памяти браузера
      }
    }, 250);
  }

  Object.entries(teamSizeSliders).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      teamSizeValueEls[key].textContent = input.value + (teamSizeUnits[key] || 'px');
      scheduleTeamSizeSave();
    });
  });
  Object.values(teamColorPickers).forEach((input) => {
    input.addEventListener('input', scheduleTeamSizeSave);
  });

  btnTeamSizeReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Сбросить размеры и цвета панели команды к стандартным значениям?')) return;
    try {
      const { ok, data } = await postJSON('/api/team/settings/reset', {});
      if (ok && data.success) {
        applyTeamSizeSettings(data.settings);
        applyRecommendedSize(data.recommendedSize);
      }
    } catch (e) {
      // не критично — можно повторить позже
    }
  });

  const btnTeamSizeSaveDefault = document.getElementById('btnTeamSizeSaveDefault');
  btnTeamSizeSaveDefault.addEventListener('click', async () => {
    if (!await ui3Confirm('Сохранить текущие размеры и цвета как новый стандарт по умолчанию? Именно они будут применяться по кнопке «Сбросить».')) return;
    try {
      const { ok } = await postJSON('/api/team/settings/save-as-default', {});
      if (ok) ui3Alert('Сохранено как стандартные значения.');
    } catch (e) {
      // не критично — можно повторить позже
    }
  });

  async function loadTeamData() {
    try {
      const res = await fetch('/api/team');
      const data = await res.json();
      teamEditors.left.applyTeam(data.teams.left);
      teamEditors.right.applyTeam(data.teams.right);
      applyTeamSizeSettings(data.teams.settings);
      applyRecommendedSize(data.recommendedSize);
    } catch (e) {
      // не критично — поля просто останутся пустыми, пока не подгрузятся
    }
  }
  loadTeamData();

  /* --- «Настройки текста» — отдельное окно: шрифты и размеры текста панели команды --- */
  const teamTextOverlay = document.getElementById('teamTextOverlay');
  const teamTextFields = {
    nameFont: document.getElementById('teamTextNameFont'),
    bodyFont: document.getElementById('teamTextBodyFont'),
    nameFontSize: document.getElementById('teamTextNameFontSize'),
    nickFontSize: document.getElementById('teamTextNickFontSize'),
    roleFontSize: document.getElementById('teamTextRoleFontSize'),
    aboutLabelFontSize: document.getElementById('teamTextAboutLabelFontSize'),
    aboutFontSize: document.getElementById('teamTextAboutFontSize'),
  };
  const teamTextMessage = document.getElementById('teamTextMessage');

  function showTeamTextMessage(text, kind) {
    teamTextMessage.textContent = text;
    teamTextMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function fillTeamTextForm(settings) {
    Object.entries(teamTextFields).forEach(([key, input]) => { input.value = settings[key]; });
  }

  document.getElementById('btnTeamTextSettings').addEventListener('click', () => {
    if (lastTeamSettings) fillTeamTextForm(lastTeamSettings);
    showTeamTextMessage('', '');
    teamTextOverlay.style.display = 'flex';
  });
  function closeTeamTextModal() {
    teamTextOverlay.style.display = 'none';
  }
  document.getElementById('teamTextClose').addEventListener('click', closeTeamTextModal);
  teamTextOverlay.addEventListener('click', (e) => { if (e.target === teamTextOverlay) closeTeamTextModal(); });

  /** Отправляет поля окна на сервер (частичное обновление — остальные настройки команды не трогает). */
  async function saveTeamTextFields() {
    const body = {};
    Object.entries(teamTextFields).forEach(([key, input]) => { body[key] = input.tagName === 'SELECT' ? input.value : Number(input.value); });
    const { ok, data } = await postJSON('/api/team/settings', body);
    if (!ok || !data.success) throw new Error('Не удалось сохранить.');
    applyTeamSizeSettings(data.settings);
    return data.settings;
  }

  document.getElementById('btnTeamTextSave').addEventListener('click', async () => {
    try {
      await saveTeamTextFields();
      closeTeamTextModal();
    } catch (e) {
      showTeamTextMessage(e.message || 'Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  document.getElementById('btnTeamTextSaveDefault').addEventListener('click', async () => {
    if (!await ui3Confirm('Сохранить текущие шрифты и размеры текста как новый стандарт по умолчанию? Именно они будут применяться по кнопке «Сбросить».')) return;
    try {
      await saveTeamTextFields();
      await postJSON('/api/team/settings/save-as-default', {});
      closeTeamTextModal();
    } catch (e) {
      showTeamTextMessage(e.message || 'Сетевая ошибка при обращении к серверу.', 'error');
    }
  });


  /* ================================================================
     Вкладка "Ивент" — аккордеон "Команды" / "MVP" (по умолчанию обе свёрнуты,
     открытие одной сворачивает другую; повторный клик по открытой — закрывает).
  ================================================================ */

  const eventAccordionButtons = document.querySelectorAll('.event-accordion-btn');
  const eventAccordionPanels = {
    teams: document.getElementById('eventAccordionTeams'),
    mvp: document.getElementById('eventAccordionMvp'),
    fact: document.getElementById('eventAccordionFact'),
    fund: document.getElementById('eventAccordionFund'),
    theme: document.getElementById('eventAccordionTheme'),
    background: document.getElementById('eventAccordionBackground'),
    bracket: document.getElementById('eventAccordionBracket'),
  };

  /* ---------- Обложка ивента ----------
     Большая плашка с фотографией (и названием). Клик по ней сворачивает её в плашечку с названием (анимацию делает CSS: высота,
     ширина и скругление плавно сходятся к «пилюле»), а под ней раскрывается меню разделов. Клик по плашечке — обратно:
     обложка разворачивается, меню прячется. Картинка и название хранятся на сервере (event_cover.json, uploads/event/). */
  const eventCoverEl = document.getElementById('eventCover');
  const eventCoverPlate = document.getElementById('eventCoverPlate');
  const eventCoverImg = document.getElementById('eventCoverImg');
  const eventCoverActions = document.getElementById('eventCoverActions');
  const eventCoverNameInput = document.getElementById('eventCoverNameInput');
  const eventCoverPill = document.getElementById('eventCoverPill');
  const eventCoverPillText = document.getElementById('eventCoverPillText');
  const eventCoverFile = document.getElementById('eventCoverFile');
  const eventCoverMessage = document.getElementById('eventCoverMessage');
  const eventAccordionReveal = document.getElementById('eventAccordionReveal');
  const EVENT_COVER_PLACEHOLDER_NAME = 'Название';
  const EVENT_COVER_MAX_BYTES = 10 * 1024 * 1024;
  const EVENT_COVER_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

  function setEventCoverCollapsed(collapsed) {
    eventCoverEl.classList.toggle('is-collapsed', collapsed);
    eventAccordionReveal.classList.toggle('is-open', collapsed);
    eventAccordionReveal.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
    eventAccordionReveal.inert = !collapsed; // пока меню закрыто, его кнопки не фокусируются и не кликаются
    eventCoverPlate.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
    eventCoverPlate.title = collapsed ? 'Нажмите, чтобы развернуть обложку' : 'Нажмите, чтобы свернуть обложку и открыть разделы';
    if (collapsed) updateEventCoverPillWidth();
  }

  /** Ширина плашечки = ширине её подписи (имя + стрелка + отступы); считается по самой подписи, поэтому подстраивается под любое название. */
  function updateEventCoverPillWidth() {
    const w = Math.ceil(eventCoverPill.getBoundingClientRect().width);
    const max = Math.floor(eventCoverEl.clientWidth);
    if (w > 0) eventCoverEl.style.setProperty('--pill-w', Math.min(w, max || w) + 'px');
  }

  function applyEventCoverName(name) {
    eventCoverPillText.textContent = name || EVENT_COVER_PLACEHOLDER_NAME; // textContent, не innerHTML — название вводит пользователь
    updateEventCoverPillWidth();
  }

  function applyEventCover(cover) {
    const hasImage = !!(cover && cover.imageUrl);
    eventCoverEl.classList.toggle('has-image', hasImage);
    document.getElementById('eventCoverPlaceholder').hidden = hasImage;
    eventCoverActions.hidden = !hasImage;
    eventCoverImg.hidden = !hasImage;
    if (hasImage) eventCoverImg.src = cover.imageUrl; else eventCoverImg.removeAttribute('src');
    if (document.activeElement !== eventCoverNameInput) eventCoverNameInput.value = (cover && cover.name) || '';
    applyEventCoverName((cover && cover.name) || '');
  }

  let eventCoverMessageTimer = null;
  function showEventCoverMessage(text, kind) {
    eventCoverMessage.textContent = text;
    eventCoverMessage.className = 'form-message' + (kind ? ' ' + kind : '');
    clearTimeout(eventCoverMessageTimer);
    // Успех сам исчезает через 5 секунд (строка тогда схлопывается); ошибка остаётся, пока не будет следующее действие.
    if (kind === 'success') eventCoverMessageTimer = setTimeout(() => { if (eventCoverMessage.textContent === text) eventCoverMessage.textContent = ''; }, 5000);
  }

  eventCoverPlate.addEventListener('click', (evt) => {
    if (evt.target.closest('.event-cover-btn, .event-cover-name-input')) return; // кнопки и поле названия — не сворачивают
    setEventCoverCollapsed(!eventCoverEl.classList.contains('is-collapsed'));
  });
  eventCoverPlate.addEventListener('keydown', (evt) => {
    if (evt.target !== eventCoverPlate) return; // Enter/пробел в поле названия — обычный ввод
    if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); setEventCoverCollapsed(!eventCoverEl.classList.contains('is-collapsed')); }
  });

  async function uploadEventCover(file) {
    const ext = ('.' + (file.name.split('.').pop() || '')).toLowerCase();
    if (!EVENT_COVER_EXT.includes(ext)) { showEventCoverMessage('Нужна картинка: png, jpg, webp или gif.', 'error'); return; }
    if (file.size > EVENT_COVER_MAX_BYTES) { showEventCoverMessage('Файл больше 10 МБ — выберите картинку поменьше.', 'error'); return; }
    showEventCoverMessage('Загружаем обложку…', '');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/event-cover/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error((data && data.error) || 'Не удалось загрузить обложку.');
      applyEventCover(data.cover);
      showEventCoverMessage('Обложка загружена.', 'success');
    } catch (e) {
      showEventCoverMessage(e.message, 'error');
    }
  }
  ['eventCoverUploadCenter', 'eventCoverUpload'].forEach((id) => {
    document.getElementById(id).addEventListener('click', () => eventCoverFile.click());
  });
  eventCoverFile.addEventListener('change', async () => {
    const file = eventCoverFile.files[0];
    eventCoverFile.value = ''; // тот же файл можно выбрать повторно
    if (file) await uploadEventCover(file);
  });
  document.getElementById('eventCoverRemove').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/event-cover/remove', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error((data && data.error) || 'Не удалось убрать обложку.');
      applyEventCover(data.cover);
      showEventCoverMessage('Обложка убрана.', 'success');
    } catch (e) {
      showEventCoverMessage(e.message, 'error');
    }
  });

  let eventCoverNameTimer = null;
  eventCoverNameInput.addEventListener('input', () => {
    applyEventCoverName(eventCoverNameInput.value.trim()); // плашечка обновляется сразу, на сервер — с задержкой
    clearTimeout(eventCoverNameTimer);
    const value = eventCoverNameInput.value;
    eventCoverNameTimer = setTimeout(async () => {
      try {
        await fetch('/api/event-cover/name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value }) });
      } catch (e) {
        showEventCoverMessage('Не удалось сохранить название — нет связи с сервером.', 'error');
      }
    }, 400);
  });

  (async function loadEventCover() {
    try {
      const res = await fetch('/api/event-cover');
      const data = await res.json();
      if (data && data.cover) applyEventCover(data.cover);
    } catch (e) {
      // не критично — обложка просто останется пустой, пока сервер не ответит
    }
  })();
  // Шрифт подгружается позже разметки — после этого подпись плашечки может стать шире, чем мы измерили.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateEventCoverPillWidth);

  eventAccordionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.accordion;
      const isOpen = btn.classList.contains('active');
      eventAccordionButtons.forEach((b) => b.classList.remove('active'));
      Object.values(eventAccordionPanels).forEach((p) => { p.style.display = 'none'; });
      if (!isOpen) {
        btn.classList.add('active');
        eventAccordionPanels[key].style.display = '';
        // Холст раскладки панелей сетки меряет свою ширину через clientWidth —
        // пока блок свёрнут (display:none), она равна 0, и масштаб застревает
        // на scale(0) навсегда (пересчёт раньше происходил только один раз при
        // загрузке страницы и по window resize — но раскрытие аккордеона ни то,
        // ни другое не вызывает). Пересчитываем явно в момент открытия.
        if (key === 'bracket' && typeof computeBracketPanelScale === 'function') {
          requestAnimationFrame(computeBracketPanelScale);
        }
      }
    });
  });

  /* ================================================================
     Виджет "MVP матча"
  ================================================================ */

  const mvpPhotoEl = document.getElementById('mvpPhoto');
  const mvpFileInput = document.getElementById('mvpFileInput');
  const mvpNickname = document.getElementById('mvpNickname');
  const mvpHero = document.getElementById('mvpHero');
  const mvpRole = document.getElementById('mvpRole');
  const mvpKills = document.getElementById('mvpKills');
  const mvpDeaths = document.getElementById('mvpDeaths');
  const mvpAssists = document.getElementById('mvpAssists');
  const mvpCreepScore = document.getElementById('mvpCreepScore');
  const mvpDamage = document.getElementById('mvpDamage');
  const mvpGold = document.getElementById('mvpGold');
  const mvpKdaHint = document.getElementById('mvpKdaHint');
  const mvpShowCreepScore = document.getElementById('mvpShowCreepScore');
  const mvpMessage = document.getElementById('mvpMessage');
  const mvpLabelText = document.getElementById('mvpLabelText');
  const mvpLabelColor = document.getElementById('mvpLabelColor');
  const mvpStatLabelColor = document.getElementById('mvpStatLabelColor');
  const mvpSlideSide = document.getElementById('mvpSlideSide');
  const mvpRaysEnabled = document.getElementById('mvpRaysEnabled');
  const mvpRaysColor = document.getElementById('mvpRaysColor');
  const btnMvpSave = document.getElementById('btnMvpSave');
  const btnMvpShow = document.getElementById('btnMvpShow');
  const btnMvpHide = document.getElementById('btnMvpHide');
  const btnMvpSaveAll = document.getElementById('btnMvpSaveAll');
  const btnMvpSizeReset = document.getElementById('btnMvpSizeReset');

  function showMvpMessage(text, kind) {
    mvpMessage.textContent = text;
    mvpMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function updateMvpKdaHint() {
    const k = Number(mvpKills.value) || 0;
    const d = Number(mvpDeaths.value) || 0;
    const a = Number(mvpAssists.value) || 0;
    const kda = d === 0 ? (k + a) : ((k + a) / d);
    mvpKdaHint.textContent = `KDA: ${kda.toFixed(2)} (считается автоматически из убийств/смертей/помощи)`;
  }
  [mvpKills, mvpDeaths, mvpAssists].forEach((input) => input.addEventListener('input', updateMvpKdaHint));

  function fillMvpPhoto(url) {
    mvpPhotoEl.innerHTML = url
      ? `<img src="${url}" alt="">`
      : '<span class="team-editor-photo-placeholder">Фото</span>';
  }

  function applyMvp(mvp) {
    fillMvpPhoto(mvp.photoUrl);
    mvpNickname.value = mvp.nickname || '';
    mvpHero.value = mvp.hero || '';
    mvpRole.value = mvp.role || '';
    mvpKills.value = mvp.kills || 0;
    mvpDeaths.value = mvp.deaths || 0;
    mvpAssists.value = mvp.assists || 0;
    mvpCreepScore.value = mvp.creepScore || 0;
    mvpDamage.value = mvp.damage || '';
    mvpGold.value = mvp.gold || '';
    updateMvpKdaHint();
  }

  mvpPhotoEl.addEventListener('click', () => mvpFileInput.click());
  mvpFileInput.addEventListener('change', async () => {
    const file = mvpFileInput.files[0];
    if (!file) return;
    showMvpMessage('Загружаем фото…', '');
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch('/api/mvp/photo', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        fillMvpPhoto(data.url);
        showMvpMessage('Фото загружено.', 'success');
      } else {
        showMvpMessage((data && data.error) || 'Не удалось загрузить фото.', 'error');
      }
    } catch (e) {
      showMvpMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      mvpFileInput.value = '';
    }
  });

  btnMvpSave.addEventListener('click', async () => {
    showMvpMessage('Сохраняем…', '');
    try {
      const body = {
        nickname: mvpNickname.value,
        hero: mvpHero.value,
        role: mvpRole.value,
        kills: Number(mvpKills.value) || 0,
        deaths: Number(mvpDeaths.value) || 0,
        assists: Number(mvpAssists.value) || 0,
        creepScore: Number(mvpCreepScore.value) || 0,
        damage: Number(mvpDamage.value) || 0,
        gold: Number(mvpGold.value) || 0,
      };
      const { ok, data } = await postJSON('/api/mvp/save', body);
      showMvpMessage(ok && data.success ? 'Сохранено.' : 'Не удалось сохранить.', ok ? 'success' : 'error');
    } catch (e) {
      showMvpMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnMvpShow.addEventListener('click', async () => {
    try {
      await postJSON('/api/mvp/show', {});
      showMvpMessage('Выезд в OBS запущен — уедет само через заданное время показа.', 'success');
    } catch (e) {
      showMvpMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnMvpHide.addEventListener('click', async () => {
    try {
      await postJSON('/api/mvp/hide', {});
      showMvpMessage('Скрыто.', 'success');
    } catch (e) {
      showMvpMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnMvpSaveAll.addEventListener('click', async () => {
    showMvpMessage('Сохраняем всё…', '');
    try {
      const textBody = {
        nickname: mvpNickname.value,
        hero: mvpHero.value,
        role: mvpRole.value,
        kills: Number(mvpKills.value) || 0,
        deaths: Number(mvpDeaths.value) || 0,
        assists: Number(mvpAssists.value) || 0,
        creepScore: Number(mvpCreepScore.value) || 0,
        damage: Number(mvpDamage.value) || 0,
        gold: Number(mvpGold.value) || 0,
      };
      const sizesBody = {};
      Object.entries(mvpSizeSliders).forEach(([key, input]) => { sizesBody[key] = Number(input.value); });
      sizesBody.labelText = mvpLabelText.value;
      sizesBody.labelColor = mvpLabelColor.value;
      sizesBody.statLabelColor = mvpStatLabelColor.value;
      sizesBody.showCreepScore = mvpShowCreepScore.checked;
      sizesBody.slideSide = mvpSlideSide.value;
      sizesBody.raysEnabled = mvpRaysEnabled.checked;
      sizesBody.raysColor = mvpRaysColor.value;

      const [{ ok: ok1, data: data1 }, { ok: ok2, data: data2 }] = await Promise.all([
        postJSON('/api/mvp/save', textBody),
        postJSON('/api/mvp/settings', sizesBody),
      ]);
      showMvpMessage(
        ok1 && data1.success && ok2 && data2.success ? 'Всё сохранено — переживёт перезапуск сервера.' : 'Не удалось сохранить часть настроек.',
        ok1 && ok2 ? 'success' : 'error'
      );
    } catch (e) {
      showMvpMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnMvpSizeReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Сбросить размеры, анимацию и надпись MVP к стандартным значениям?')) return;
    try {
      const { ok, data } = await postJSON('/api/mvp/settings/reset', {});
      if (ok && data.success) {
        applyMvpSizeSettings(data.settings);
        showMvpMessage('Сброшено к стандартным значениям.', 'success');
      } else {
        showMvpMessage('Не удалось сбросить.', 'error');
      }
    } catch (e) {
      showMvpMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  /* --- Размеры карточки MVP --- */

  const mvpSizeSliders = {
    photoSize: document.getElementById('mvpSizePhoto'),
    cardWidth: document.getElementById('mvpSizeCardWidth'),
    cardHeight: document.getElementById('mvpSizeCardHeight'),
    nickFontSize: document.getElementById('mvpSizeNickFont'),
    dataFontSize: document.getElementById('mvpSizeDataFont'),
    labelFontSize: document.getElementById('mvpSizeLabelFont'),
    labelPositionX: document.getElementById('mvpLabelX'),
    labelPositionY: document.getElementById('mvpLabelY'),
    animationDurationMs: document.getElementById('mvpAnimDuration'),
    displaySeconds: document.getElementById('mvpDisplaySeconds'),
    raysIntensity: document.getElementById('mvpRaysIntensity'),
    raysSpeed: document.getElementById('mvpRaysSpeed'),
    raysFadeInDelayMs: document.getElementById('mvpRaysFadeInDelay'),
    raysFadeOutLeadMs: document.getElementById('mvpRaysFadeOutLead'),
  };
  const mvpSizeValueEls = {
    photoSize: document.getElementById('mvpSizePhotoValue'),
    cardWidth: document.getElementById('mvpSizeCardWidthValue'),
    cardHeight: document.getElementById('mvpSizeCardHeightValue'),
    nickFontSize: document.getElementById('mvpSizeNickFontValue'),
    dataFontSize: document.getElementById('mvpSizeDataFontValue'),
    labelFontSize: document.getElementById('mvpSizeLabelFontValue'),
    labelPositionX: document.getElementById('mvpLabelXValue'),
    labelPositionY: document.getElementById('mvpLabelYValue'),
    animationDurationMs: document.getElementById('mvpAnimDurationValue'),
    displaySeconds: document.getElementById('mvpDisplaySecondsValue'),
    raysIntensity: document.getElementById('mvpRaysIntensityValue'),
    raysSpeed: document.getElementById('mvpRaysSpeedValue'),
    raysFadeInDelayMs: document.getElementById('mvpRaysFadeInDelayValue'),
    raysFadeOutLeadMs: document.getElementById('mvpRaysFadeOutLeadValue'),
  };
  const mvpSizeUnits = {
    labelPositionX: '%', labelPositionY: '%',
    raysIntensity: '%', raysSpeed: '%',
    raysFadeInDelayMs: ' мс', raysFadeOutLeadMs: ' мс',
    animationDurationMs: ' мс', displaySeconds: ' сек',
  }; // остальные — px по умолчанию

  function applyMvpSizeSettings(settings) {
    Object.entries(mvpSizeSliders).forEach(([key, input]) => {
      input.value = settings[key];
      mvpSizeValueEls[key].textContent = settings[key] + (mvpSizeUnits[key] || 'px');
    });
    mvpLabelText.value = settings.labelText || '';
    mvpLabelColor.value = settings.labelColor || '#FFD700';
    mvpStatLabelColor.value = settings.statLabelColor || '#b9a8e0';
    mvpShowCreepScore.checked = !!settings.showCreepScore;
    mvpSlideSide.value = settings.slideSide || 'right';
    mvpRaysEnabled.checked = !!settings.raysEnabled;
    mvpRaysColor.value = settings.raysColor || '#FFD700';
  }

  let mvpSizeSaveTimer = null;
  function scheduleMvpSizeSave() {
    clearTimeout(mvpSizeSaveTimer);
    mvpSizeSaveTimer = setTimeout(async () => {
      const body = {};
      Object.entries(mvpSizeSliders).forEach(([key, input]) => { body[key] = Number(input.value); });
      body.labelText = mvpLabelText.value;
      body.labelColor = mvpLabelColor.value;
      body.statLabelColor = mvpStatLabelColor.value;
      body.showCreepScore = mvpShowCreepScore.checked;
      body.slideSide = mvpSlideSide.value;
      body.raysEnabled = mvpRaysEnabled.checked;
      body.raysColor = mvpRaysColor.value;
      try {
        await postJSON('/api/mvp/settings', body);
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 250);
  }

  Object.entries(mvpSizeSliders).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      mvpSizeValueEls[key].textContent = input.value + (mvpSizeUnits[key] || 'px');
      scheduleMvpSizeSave();
    });
  });
  [mvpLabelText, mvpLabelColor, mvpShowCreepScore, mvpSlideSide, mvpRaysEnabled, mvpRaysColor].forEach((el) => {
    el.addEventListener('input', scheduleMvpSizeSave);
    el.addEventListener('change', scheduleMvpSizeSave);
  });

  async function loadMvpData() {
    try {
      const res = await fetch('/api/mvp');
      const data = await res.json();
      applyMvp(data.mvp);
      applyMvpSizeSettings(data.mvp.settings);
    } catch (e) {
      // не критично — поля просто останутся пустыми, пока не подгрузятся
    }
  }
  loadMvpData();

  /* ================================================================
     Виджет "Факт / Инфо-панель"
  ================================================================ */

  function escapeHtmlLocal(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  const factTitle = document.getElementById('factTitle');
  const factText = document.getElementById('factText');
  const factMessage = document.getElementById('factMessage');
  const btnFactSave = document.getElementById('btnFactSave');
  const btnFactShow = document.getElementById('btnFactShow');
  const btnFactHide = document.getElementById('btnFactHide');
  const btnFactPickFromLibrary = document.getElementById('btnFactPickFromLibrary');
  const btnFactSizeReset = document.getElementById('btnFactSizeReset');
  const factSlideSide = document.getElementById('factSlideSide');

  function showFactMessage(text, kind) {
    factMessage.textContent = text;
    factMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  const factSizeSliders = {
    cardWidth: document.getElementById('factSizeCardWidth'),
    cardHeight: document.getElementById('factSizeCardHeight'),
    titleFontSize: document.getElementById('factSizeTitleFont'),
    textFontSize: document.getElementById('factSizeTextFont'),
    padding: document.getElementById('factSizePadding'),
    animationDurationMs: document.getElementById('factAnimDuration'),
    displaySeconds: document.getElementById('factDisplaySeconds'),
  };
  const factSizeValueEls = {
    cardWidth: document.getElementById('factSizeCardWidthValue'),
    cardHeight: document.getElementById('factSizeCardHeightValue'),
    titleFontSize: document.getElementById('factSizeTitleFontValue'),
    textFontSize: document.getElementById('factSizeTextFontValue'),
    padding: document.getElementById('factSizePaddingValue'),
    animationDurationMs: document.getElementById('factAnimDurationValue'),
    displaySeconds: document.getElementById('factDisplaySecondsValue'),
  };
  const factSizeUnits = { animationDurationMs: ' мс', displaySeconds: ' сек' };

  function applyFactSizeSettings(settings) {
    Object.entries(factSizeSliders).forEach(([key, input]) => {
      input.value = settings[key];
      factSizeValueEls[key].textContent = settings[key] + (factSizeUnits[key] || 'px');
    });
    factSlideSide.value = settings.slideSide || 'right';
  }

  let factSizeSaveTimer = null;
  function scheduleFactSizeSave() {
    clearTimeout(factSizeSaveTimer);
    factSizeSaveTimer = setTimeout(async () => {
      const body = {};
      Object.entries(factSizeSliders).forEach(([key, input]) => { body[key] = Number(input.value); });
      body.slideSide = factSlideSide.value;
      try {
        await postJSON('/api/fact/settings', body);
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 250);
  }

  Object.entries(factSizeSliders).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      factSizeValueEls[key].textContent = input.value + (factSizeUnits[key] || 'px');
      scheduleFactSizeSave();
    });
  });
  factSlideSide.addEventListener('change', scheduleFactSizeSave);

  btnFactSizeReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Сбросить размеры и анимацию панели «Факт» к стандартным значениям?')) return;
    try {
      const { ok, data } = await postJSON('/api/fact/settings/reset', {});
      if (ok && data.success) {
        applyFactSizeSettings(data.settings);
        showFactMessage('Сброшено к стандартным значениям.', 'success');
      }
    } catch (e) {
      showFactMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFactSave.addEventListener('click', async () => {
    showFactMessage('Сохраняем…', '');
    try {
      const { ok, data } = await postJSON('/api/fact/save', { title: factTitle.value, text: factText.value });
      showFactMessage(ok && data.success ? 'Сохранено.' : 'Не удалось сохранить.', ok ? 'success' : 'error');
    } catch (e) {
      showFactMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFactShow.addEventListener('click', async () => {
    showFactMessage('Запускаем выезд…', '');
    try {
      await postJSON('/api/fact/save', { title: factTitle.value, text: factText.value });
      await postJSON('/api/fact/show', {});
      showFactMessage('Выезд в OBS запущен — уедет само через заданное время показа.', 'success');
    } catch (e) {
      showFactMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFactHide.addEventListener('click', async () => {
    try {
      await postJSON('/api/fact/hide', {});
      showFactMessage('Скрыто.', 'success');
    } catch (e) {
      showFactMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  async function loadFactData() {
    try {
      const res = await fetch('/api/fact');
      const data = await res.json();
      factTitle.value = data.fact.title || '';
      factText.value = data.fact.text || '';
      applyFactSizeSettings(data.fact.settings);
    } catch (e) {
      // не критично — поля просто останутся пустыми, пока не подгрузятся
    }
  }
  loadFactData();

  /* --- Библиотека сохранённых плашек --- */

  let factPresetsCache = [];
  const factPresetList = document.getElementById('factPresetList');
  const factLibrarySearch = document.getElementById('factLibrarySearch');
  const factLibrarySort = document.getElementById('factLibrarySort');
  const btnFactAddPreset = document.getElementById('btnFactAddPreset');

  function sortFactPresets(list) {
    const sorted = list.slice();
    const mode = factLibrarySort.value;
    if (mode === 'date-asc') sorted.sort((a, b) => a.createdAt - b.createdAt);
    else if (mode === 'alpha') sorted.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    else sorted.sort((a, b) => b.createdAt - a.createdAt);
    return sorted;
  }

  function filterFactPresets(list) {
    const q = factLibrarySearch.value.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.title.toLowerCase().includes(q));
  }

  function renderFactPresetList() {
    const list = sortFactPresets(filterFactPresets(factPresetsCache));
    factPresetList.innerHTML = '';
    if (list.length === 0) {
      factPresetList.innerHTML = '<p class="card-hint">Пока нет сохранённых плашек.</p>';
      return;
    }
    list.forEach((preset) => {
      const row = document.createElement('div');
      row.className = 'fact-preset-row';
      row.innerHTML = `
        <div class="fact-preset-row-text">
          <div class="fact-preset-row-title">${escapeHtmlLocal(preset.title)}</div>
          <div class="fact-preset-row-body">${escapeHtmlLocal(preset.text)}</div>
        </div>
        <div class="fact-preset-row-actions">
          <button class="btn btn-primary" type="button">Показать</button>
          <button class="btn-tiny" type="button">Редактировать</button>
          <button class="btn-tiny" type="button">Удалить</button>
        </div>
      `;
      const [showBtn, editBtn, deleteBtn] = row.querySelectorAll('button');
      showBtn.addEventListener('click', async () => {
        try {
          const { ok } = await postJSON(`/api/fact/presets/${preset.id}/show`, {});
          if (ok) {
            factTitle.value = preset.title;
            factText.value = preset.text;
            showFactMessage(`Плашка «${preset.title}» отправлена в OBS.`, 'success');
          }
        } catch (e) {
          showFactMessage('Сетевая ошибка при обращении к серверу.', 'error');
        }
      });
      deleteBtn.addEventListener('click', async () => {
        if (!await ui3Confirm(`Удалить плашку «${preset.title}» навсегда?`)) return;
        try {
          await postJSON(`/api/fact/presets/${preset.id}/delete`, {});
          await loadFactPresets();
        } catch (e) {
          // не критично
        }
      });
      editBtn.addEventListener('click', () => {
        row.innerHTML = `
          <div class="fact-preset-edit-fields">
            <input type="text" value="${escapeHtmlLocal(preset.title)}" class="fp-edit-title">
            <textarea rows="2" class="fp-edit-text">${escapeHtmlLocal(preset.text)}</textarea>
          </div>
          <div class="fact-preset-row-actions">
            <button class="btn btn-primary" type="button">Сохранить</button>
            <button class="btn-tiny" type="button">Отмена</button>
          </div>
        `;
        const titleInput = row.querySelector('.fp-edit-title');
        const textInput = row.querySelector('.fp-edit-text');
        const [saveBtn, cancelBtn] = row.querySelectorAll('.fact-preset-row-actions button');
        saveBtn.addEventListener('click', async () => {
          try {
            await postJSON(`/api/fact/presets/${preset.id}/update`, { title: titleInput.value, text: textInput.value });
            await loadFactPresets();
          } catch (e) {
            // не критично
          }
        });
        cancelBtn.addEventListener('click', renderFactPresetList);
      });
      factPresetList.appendChild(row);
    });
  }

  async function loadFactPresets() {
    try {
      const res = await fetch('/api/fact/presets');
      const data = await res.json();
      factPresetsCache = data.presets || [];
      renderFactPresetList();
    } catch (e) {
      factPresetList.innerHTML = '<p class="card-hint">Не удалось загрузить список.</p>';
    }
  }
  loadFactPresets();

  factLibrarySearch.addEventListener('input', renderFactPresetList);
  factLibrarySort.addEventListener('change', renderFactPresetList);

  btnFactAddPreset.addEventListener('click', async () => {
    const title = prompt('Заголовок плашки:');
    if (!title || !title.trim()) return;
    const text = prompt('Текст плашки:') || '';
    try {
      await postJSON('/api/fact/presets', { title: title.trim(), text });
      await loadFactPresets();
    } catch (e) {
      ui3Alert('Не удалось добавить плашку.');
    }
  });

  /* --- Модалка выбора плашки из библиотеки (кнопка "Выбрать из библиотеки" в основной форме) --- */

  const factPresetModalOverlay = document.getElementById('factPresetModalOverlay');
  const factPresetModalClose = document.getElementById('factPresetModalClose');
  const factPresetModalList = document.getElementById('factPresetModalList');

  function closeFactPresetModal() {
    factPresetModalOverlay.classList.remove('open');
  }
  factPresetModalClose.addEventListener('click', closeFactPresetModal);
  factPresetModalOverlay.addEventListener('click', (e) => {
    if (e.target === factPresetModalOverlay) closeFactPresetModal();
  });

  btnFactPickFromLibrary.addEventListener('click', async () => {
    factPresetModalOverlay.classList.add('open');
    factPresetModalList.innerHTML = '<p class="card-hint">Загружаем список…</p>';
    try {
      const res = await fetch('/api/fact/presets');
      const data = await res.json();
      const list = data.presets || [];
      if (list.length === 0) {
        factPresetModalList.innerHTML = '<p class="card-hint">Пока нет сохранённых плашек.</p>';
        return;
      }
      factPresetModalList.innerHTML = '';
      list.forEach((preset) => {
        const row = document.createElement('div');
        row.className = 'team-preset-row';
        row.innerHTML = `<span class="team-preset-row-name">${escapeHtmlLocal(preset.title)}</span><span class="team-preset-row-actions"><button class="btn btn-primary" type="button">Показать</button></span>`;
        row.querySelector('button').addEventListener('click', async () => {
          try {
            await postJSON(`/api/fact/presets/${preset.id}/show`, {});
            factTitle.value = preset.title;
            factText.value = preset.text;
            closeFactPresetModal();
            showFactMessage(`Плашка «${preset.title}» отправлена в OBS.`, 'success');
          } catch (e) {
            // не критично — модалка просто останется открытой
          }
        });
        factPresetModalList.appendChild(row);
      });
    } catch (e) {
      factPresetModalList.innerHTML = '<p class="card-hint">Не удалось загрузить список.</p>';
    }
  });

  /* ================================================================
     Живой предпросмотр (MVP и Факт) — iframe того же widget.html?preview=1,
     обновляется по таймеру (не на каждое нажатие клавиши — так не нужно
     вручную развешивать слушатели на все 20+ полей формы, и это надёжнее).
  ================================================================ */

  const mvpPreviewFrame = document.getElementById('mvpPreviewFrame');
  const factPreviewFrame = document.getElementById('factPreviewFrame');

  function scaleIframeToFit(iframe, contentW, contentH) {
    const box = iframe.closest('.widget-preview-box');
    if (!box) return;
    iframe.width = contentW;
    iframe.height = contentH;
    const boxRect = box.getBoundingClientRect();
    const scale = Math.max(0.05, Math.min(1, (boxRect.width - 24) / contentW, (boxRect.height - 24) / contentH));
    iframe.style.transform = `scale(${scale})`;
  }

  function updateMvpPreview() {
    if (!mvpPreviewFrame.contentWindow) return;
    const settings = {};
    Object.entries(mvpSizeSliders).forEach(([key, input]) => { settings[key] = Number(input.value); });
    settings.labelText = mvpLabelText.value;
    settings.labelColor = mvpLabelColor.value;
    settings.statLabelColor = mvpStatLabelColor.value;
    settings.showCreepScore = mvpShowCreepScore.checked;
    settings.slideSide = mvpSlideSide.value;
    settings.raysEnabled = mvpRaysEnabled.checked;
    settings.raysColor = mvpRaysColor.value;

    const photoImg = mvpPhotoEl.querySelector('img');
    const mvp = {
      visible: true,
      photoUrl: photoImg ? photoImg.src : null,
      nickname: mvpNickname.value,
      hero: mvpHero.value,
      role: mvpRole.value,
      kills: Number(mvpKills.value) || 0,
      deaths: Number(mvpDeaths.value) || 0,
      assists: Number(mvpAssists.value) || 0,
      creepScore: Number(mvpCreepScore.value) || 0,
      damage: Number(mvpDamage.value) || 0,
      gold: Number(mvpGold.value) || 0,
      settings,
    };
    mvpPreviewFrame.contentWindow.postMessage({ type: 'mvp_preview_update', mvp }, '*');
    scaleIframeToFit(mvpPreviewFrame, settings.cardWidth + 220, settings.cardHeight + 220);
  }

  function updateFactPreview() {
    if (!factPreviewFrame.contentWindow) return;
    const settings = {};
    Object.entries(factSizeSliders).forEach(([key, input]) => { settings[key] = Number(input.value); });
    settings.slideSide = factSlideSide.value;
    const fact = { visible: true, title: factTitle.value, text: factText.value, settings };
    factPreviewFrame.contentWindow.postMessage({ type: 'fact_preview_update', fact }, '*');
    scaleIframeToFit(factPreviewFrame, settings.cardWidth + 40, settings.cardHeight + 40);
  }

  window.addEventListener('message', (evt) => {
    if (!evt.data) return;
    if (evt.data.type === 'mvp_preview_ready') updateMvpPreview();
    if (evt.data.type === 'fact_preview_ready') updateFactPreview();
  });

  setInterval(() => {
    if (eventAccordionPanels.mvp.style.display !== 'none') updateMvpPreview();
    if (eventAccordionPanels.fact.style.display !== 'none') updateFactPreview();
  }, 400);

  /* ================================================================
     Плашка "Сбор" (призовой фонд) — висит постоянно, растёт от донатов
  ================================================================ */

  const fundTitleInput = document.getElementById('fundTitleInput');
  const fundCurrencyInput = document.getElementById('fundCurrencyInput');
  const fundAmountInput = document.getElementById('fundAmountInput');
  const fundMessage = document.getElementById('fundMessage');
  const btnFundSaveText = document.getElementById('btnFundSaveText');
  const btnFundSetAmount = document.getElementById('btnFundSetAmount');
  const btnFundReset = document.getElementById('btnFundReset');
  const btnFundSizeReset = document.getElementById('btnFundSizeReset');

  function showFundMessage(text, kind) {
    fundMessage.textContent = text;
    fundMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  const fundSizeSliders = {
    cardWidth: document.getElementById('fundSizeCardWidth'),
    cardHeight: document.getElementById('fundSizeCardHeight'),
    titleFontSize: document.getElementById('fundSizeTitleFont'),
    amountFontSize: document.getElementById('fundSizeAmountFont'),
    padding: document.getElementById('fundSizePadding'),
  };
  const fundSizeValueEls = {
    cardWidth: document.getElementById('fundSizeCardWidthValue'),
    cardHeight: document.getElementById('fundSizeCardHeightValue'),
    titleFontSize: document.getElementById('fundSizeTitleFontValue'),
    amountFontSize: document.getElementById('fundSizeAmountFontValue'),
    padding: document.getElementById('fundSizePaddingValue'),
  };
  const fundColorPickers = {
    cardFillStart: document.getElementById('fundColorFillStart'),
    cardFillEnd: document.getElementById('fundColorFillEnd'),
    cardBorderStart: document.getElementById('fundColorBorderStart'),
    cardBorderEnd: document.getElementById('fundColorBorderEnd'),
    titleLabelColor: document.getElementById('fundColorTitleLabel'),
  };

  function applyFundSettings(settings) {
    Object.entries(fundSizeSliders).forEach(([key, input]) => {
      input.value = settings[key];
      fundSizeValueEls[key].textContent = settings[key] + 'px';
    });
    Object.entries(fundColorPickers).forEach(([key, input]) => { input.value = settings[key]; });
  }

  let fundSizeSaveTimer = null;
  function scheduleFundSizeSave() {
    clearTimeout(fundSizeSaveTimer);
    fundSizeSaveTimer = setTimeout(async () => {
      const body = {};
      Object.entries(fundSizeSliders).forEach(([key, input]) => { body[key] = Number(input.value); });
      Object.entries(fundColorPickers).forEach(([key, input]) => { body[key] = input.value; });
      try {
        await postJSON('/api/fund/settings', body);
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 250);
  }

  Object.entries(fundSizeSliders).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      fundSizeValueEls[key].textContent = input.value + 'px';
      scheduleFundSizeSave();
    });
  });
  Object.values(fundColorPickers).forEach((input) => {
    input.addEventListener('input', scheduleFundSizeSave);
  });

  btnFundSizeReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Сбросить размеры и цвета плашки «Сбор» к стандартным значениям?')) return;
    try {
      const { ok, data } = await postJSON('/api/fund/settings/reset', {});
      if (ok && data.success) {
        applyFundSettings(data.settings);
        showFundMessage('Сброшено к стандартным значениям.', 'success');
      }
    } catch (e) {
      showFundMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFundSaveText.addEventListener('click', async () => {
    showFundMessage('Сохраняем…', '');
    try {
      const { ok, data } = await postJSON('/api/fund/save', { title: fundTitleInput.value, currency: fundCurrencyInput.value });
      showFundMessage(ok && data.success ? 'Сохранено.' : 'Не удалось сохранить.', ok ? 'success' : 'error');
    } catch (e) {
      showFundMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFundSetAmount.addEventListener('click', async () => {
    try {
      const { ok, data } = await postJSON('/api/fund/amount', { amount: Number(fundAmountInput.value) || 0 });
      showFundMessage(ok && data.success ? 'Сумма применена.' : 'Не удалось применить.', ok ? 'success' : 'error');
    } catch (e) {
      showFundMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFundReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Сбросить сбор до нуля? Действие необратимо.')) return;
    try {
      const { ok, data } = await postJSON('/api/fund/reset', {});
      if (ok && data.success) {
        fundAmountInput.value = 0;
        showFundMessage('Сбор сброшен.', 'success');
      }
    } catch (e) {
      showFundMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  async function loadFundData() {
    try {
      const res = await fetch('/api/fund');
      const data = await res.json();
      fundTitleInput.value = data.fund.title || '';
      fundCurrencyInput.value = data.fund.currency || '₽';
      fundAmountInput.value = data.fund.amount || 0;
      applyFundSettings(data.fund.settings);
    } catch (e) {
      // не критично — поля просто останутся пустыми, пока не подгрузятся
    }
  }
  loadFundData();

  /* --- Предпросмотр плашки "Сбор" --- */

  const fundPreviewFrame = document.getElementById('fundPreviewFrame');

  function updateFundPreview() {
    if (!fundPreviewFrame.contentWindow) return;
    const settings = {};
    Object.entries(fundSizeSliders).forEach(([key, input]) => { settings[key] = Number(input.value); });
    Object.entries(fundColorPickers).forEach(([key, input]) => { settings[key] = input.value; });
    const fund = {
      title: fundTitleInput.value,
      currency: fundCurrencyInput.value || '₽',
      amount: Number(fundAmountInput.value) || 0,
      settings,
    };
    fundPreviewFrame.contentWindow.postMessage({ type: 'fund_preview_update', fund }, '*');
    scaleIframeToFit(fundPreviewFrame, settings.cardWidth + 40, settings.cardHeight + 40);
  }

  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'fund_preview_ready') updateFundPreview();
  });

  setInterval(() => {
    if (eventAccordionPanels.fund.style.display !== 'none') updateFundPreview();
  }, 400);

  /* ================================================================
     Алерт о донате (внутри блока "Сбор")
  ================================================================ */

  const fundAlertTemplate = document.getElementById('fundAlertTemplate');
  const fundAlertMessage = document.getElementById('fundAlertMessage');
  const btnFundAlertSave = document.getElementById('btnFundAlertSave');
  const btnFundAlertTest = document.getElementById('btnFundAlertTest');
  const btnFundAlertReset = document.getElementById('btnFundAlertReset');
  const fundAlertSlideSide = document.getElementById('fundAlertSlideSide');

  function showFundAlertMessage(text, kind) {
    fundAlertMessage.textContent = text;
    fundAlertMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  const fundAlertSizeSliders = {
    cardWidth: document.getElementById('fundAlertSizeWidth'),
    cardHeight: document.getElementById('fundAlertSizeHeight'),
    textFontSize: document.getElementById('fundAlertSizeFont'),
    padding: document.getElementById('fundAlertSizePadding'),
    animationDurationMs: document.getElementById('fundAlertAnimDuration'),
    displaySeconds: document.getElementById('fundAlertDisplaySeconds'),
  };
  const fundAlertSizeValueEls = {
    cardWidth: document.getElementById('fundAlertSizeWidthValue'),
    cardHeight: document.getElementById('fundAlertSizeHeightValue'),
    textFontSize: document.getElementById('fundAlertSizeFontValue'),
    padding: document.getElementById('fundAlertSizePaddingValue'),
    animationDurationMs: document.getElementById('fundAlertAnimDurationValue'),
    displaySeconds: document.getElementById('fundAlertDisplaySecondsValue'),
  };
  const fundAlertSizeUnits = { animationDurationMs: ' мс', displaySeconds: ' сек' };
  const fundAlertColorPickers = {
    cardFillStart: document.getElementById('fundAlertColorFillStart'),
    cardFillEnd: document.getElementById('fundAlertColorFillEnd'),
    cardBorderStart: document.getElementById('fundAlertColorBorderStart'),
    cardBorderEnd: document.getElementById('fundAlertColorBorderEnd'),
  };

  function applyFundAlertSettings(settings) {
    fundAlertTemplate.value = settings.template || '';
    fundAlertSlideSide.value = settings.slideSide || 'right';
    Object.entries(fundAlertSizeSliders).forEach(([key, input]) => {
      input.value = settings[key];
      fundAlertSizeValueEls[key].textContent = settings[key] + (fundAlertSizeUnits[key] || 'px');
    });
    Object.entries(fundAlertColorPickers).forEach(([key, input]) => { input.value = settings[key]; });
  }

  async function saveFundAlertSettings() {
    const body = { template: fundAlertTemplate.value, slideSide: fundAlertSlideSide.value };
    Object.entries(fundAlertSizeSliders).forEach(([key, input]) => { body[key] = Number(input.value); });
    Object.entries(fundAlertColorPickers).forEach(([key, input]) => { body[key] = input.value; });
    return postJSON('/api/fund/alert/settings', body);
  }

  let fundAlertSaveTimer = null;
  function scheduleFundAlertSave() {
    clearTimeout(fundAlertSaveTimer);
    fundAlertSaveTimer = setTimeout(() => { saveFundAlertSettings().catch(() => {}); }, 250);
  }

  Object.entries(fundAlertSizeSliders).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      fundAlertSizeValueEls[key].textContent = input.value + (fundAlertSizeUnits[key] || 'px');
      scheduleFundAlertSave();
    });
  });
  Object.values(fundAlertColorPickers).forEach((input) => input.addEventListener('input', scheduleFundAlertSave));
  fundAlertSlideSide.addEventListener('change', scheduleFundAlertSave);
  fundAlertTemplate.addEventListener('input', scheduleFundAlertSave);

  btnFundAlertSave.addEventListener('click', async () => {
    showFundAlertMessage('Сохраняем…', '');
    try {
      const { ok } = await saveFundAlertSettings();
      showFundAlertMessage(ok ? 'Сохранено.' : 'Не удалось сохранить.', ok ? 'success' : 'error');
    } catch (e) {
      showFundAlertMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFundAlertTest.addEventListener('click', async () => {
    try {
      await postJSON('/api/fund/alert/test', {});
      showFundAlertMessage('Тестовый алерт отправлен в OBS.', 'success');
    } catch (e) {
      showFundAlertMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFundAlertReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Сбросить настройки алерта о донате к стандартным значениям?')) return;
    try {
      const { ok, data } = await postJSON('/api/fund/alert/settings/reset', {});
      if (ok && data.success) {
        applyFundAlertSettings(data.settings);
        showFundAlertMessage('Сброшено к стандартным значениям.', 'success');
      }
    } catch (e) {
      showFundAlertMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  async function loadFundAlertSettings() {
    try {
      const res = await fetch('/api/fund/alert/settings');
      const data = await res.json();
      applyFundAlertSettings(data.alert.settings);
    } catch (e) {
      // не критично — поля просто останутся пустыми, пока не подгрузятся
    }
  }
  loadFundAlertSettings();

  const fundAlertPreviewFrame = document.getElementById('fundAlertPreviewFrame');

  function updateFundAlertPreview() {
    if (!fundAlertPreviewFrame.contentWindow) return;
    const settings = { template: fundAlertTemplate.value, slideSide: fundAlertSlideSide.value };
    Object.entries(fundAlertSizeSliders).forEach(([key, input]) => { settings[key] = Number(input.value); });
    Object.entries(fundAlertColorPickers).forEach(([key, input]) => { settings[key] = input.value; });
    const previewText = settings.template
      .replace(/\{nick\}/g, 'TestUser')
      .replace(/\{amount\}/g, '500')
      .replace(/\{currency\}/g, fundCurrencyInput.value || '₽');
    const alert = { visible: true, text: previewText, settings };
    fundAlertPreviewFrame.contentWindow.postMessage({ type: 'fund_alert_preview_update', alert }, '*');
    scaleIframeToFit(fundAlertPreviewFrame, settings.cardWidth + 40, settings.cardHeight + 40);
  }

  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'fund_alert_preview_ready') updateFundAlertPreview();
  });

  setInterval(() => {
    if (eventAccordionPanels.fund.style.display !== 'none') updateFundAlertPreview();
  }, 400);

  /* ================================================================
     Коробочка сбора (внутри блока "Сбор")
  ================================================================ */

  const fundBoxEnabled = document.getElementById('fundBoxEnabled');
  const fundBoxShowOnlyOnDonation = document.getElementById('fundBoxShowOnlyOnDonation');
  const fundBoxTextTemplate = document.getElementById('fundBoxTextTemplate');
  const fundBoxStartDenom = document.getElementById('fundBoxStartDenom');
  const fundBoxLevelStep = document.getElementById('fundBoxLevelStep');
  const fundBoxCoinValue = document.getElementById('fundBoxCoinValue');
  const fundBoxMessage = document.getElementById('fundBoxMessage');
  const btnFundBoxSave = document.getElementById('btnFundBoxSave');
  const btnFundBoxTest = document.getElementById('btnFundBoxTest');
  const btnFundBoxReset = document.getElementById('btnFundBoxReset');
  const btnFundBoxSizeReset = document.getElementById('btnFundBoxSizeReset');

  function showFundBoxMessage(text, kind) {
    fundBoxMessage.textContent = text;
    fundBoxMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  const fundBoxSizeSliders = {
    bounciness: document.getElementById('fundBoxBounciness'),
    friction: document.getElementById('fundBoxFriction'),
    backgroundOpacity: document.getElementById('fundBoxBgOpacity'),
    backgroundDarken: document.getElementById('fundBoxBgDarken'),
  };
  const fundBoxSizeValueEls = {
    bounciness: document.getElementById('fundBoxBouncinessValue'),
    friction: document.getElementById('fundBoxFrictionValue'),
    backgroundOpacity: document.getElementById('fundBoxBgOpacityValue'),
    backgroundDarken: document.getElementById('fundBoxBgDarkenValue'),
  };
  const fundBoxSizeUnits = { bounciness: '%', friction: '%', backgroundOpacity: '%', backgroundDarken: '%' };
  const fundBoxComputedSize = document.getElementById('fundBoxComputedSize');
  const fundBoxColorPickers = {
    boxColor: document.getElementById('fundBoxColorBox'),
    coinColor: document.getElementById('fundBoxColorCoin'),
    coinTextColor: document.getElementById('fundBoxColorCoinText'),
    textColor: document.getElementById('fundBoxColorText'),
  };

  function applyFundBoxState(state) {
    fundBoxEnabled.checked = !!state.enabled;
    fundBoxShowOnlyOnDonation.checked = !!state.settings.showOnlyOnDonation;
    fundBoxTextTemplate.value = state.textTemplate || '';
    fundBoxStartDenom.value = state.startDenomination;
    fundBoxLevelStep.value = state.levelStep;
    fundBoxCoinValue.value = state.coinValue;
    Object.entries(fundBoxSizeSliders).forEach(([key, input]) => {
      input.value = state.settings[key];
      fundBoxSizeValueEls[key].textContent = state.settings[key] + (fundBoxSizeUnits[key] || 'px');
    });
    Object.entries(fundBoxColorPickers).forEach(([key, input]) => { input.value = state.settings[key]; });
  }

  let fundBoxSaveTimer = null;
  function scheduleFundBoxSettingsSave() {
    clearTimeout(fundBoxSaveTimer);
    fundBoxSaveTimer = setTimeout(async () => {
      const body = { showOnlyOnDonation: fundBoxShowOnlyOnDonation.checked };
      Object.entries(fundBoxSizeSliders).forEach(([key, input]) => { body[key] = Number(input.value); });
      Object.entries(fundBoxColorPickers).forEach(([key, input]) => { body[key] = input.value; });
      try {
        await postJSON('/api/fundbox/settings', body);
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 250);
  }

  Object.entries(fundBoxSizeSliders).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      fundBoxSizeValueEls[key].textContent = input.value + (fundBoxSizeUnits[key] || 'px');
      scheduleFundBoxSettingsSave();
    });
  });
  Object.values(fundBoxColorPickers).forEach((input) => input.addEventListener('input', scheduleFundBoxSettingsSave));
  fundBoxShowOnlyOnDonation.addEventListener('change', scheduleFundBoxSettingsSave);

  btnFundBoxSave.addEventListener('click', async () => {
    showFundBoxMessage('Сохраняем…', '');
    try {
      const { ok, data } = await postJSON('/api/fundbox/save', {
        enabled: fundBoxEnabled.checked,
        textTemplate: fundBoxTextTemplate.value,
        startDenomination: Number(fundBoxStartDenom.value) || 1000,
        levelStep: Number(fundBoxLevelStep.value) || 0,
        coinValue: Number(fundBoxCoinValue.value) || 100,
      });
      showFundBoxMessage(ok && data.success ? 'Сохранено.' : 'Не удалось сохранить.', ok ? 'success' : 'error');
    } catch (e) {
      showFundBoxMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFundBoxTest.addEventListener('click', async () => {
    try {
      await postJSON('/api/fundbox/test', {});
      showFundBoxMessage('Тестовые монетки отправлены в OBS.', 'success');
    } catch (e) {
      showFundBoxMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFundBoxReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Сбросить коробочку к начальному уровню? Собранный прогресс текущего уровня будет потерян.')) return;
    try {
      await postJSON('/api/fundbox/reset', {});
      showFundBoxMessage('Коробочка сброшена к начальному уровню.', 'success');
    } catch (e) {
      showFundBoxMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnFundBoxSizeReset.addEventListener('click', async () => {
    if (!await ui3Confirm('Сбросить размеры и цвета коробочки к стандартным значениям?')) return;
    try {
      const { ok, data } = await postJSON('/api/fundbox/settings/reset', {});
      if (ok && data.success) {
        Object.entries(fundBoxSizeSliders).forEach(([key, input]) => {
          input.value = data.settings[key];
          fundBoxSizeValueEls[key].textContent = data.settings[key] + (fundBoxSizeUnits[key] || 'px');
        });
        Object.entries(fundBoxColorPickers).forEach(([key, input]) => { input.value = data.settings[key]; });
        showFundBoxMessage('Оформление сброшено к стандартному.', 'success');
      }
    } catch (e) {
      showFundBoxMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  /* ================================================================
     Цель сбора (красная шкала с делениями, внутри блока "Сбор")
  ================================================================ */

  const goalEls = {
    enabled: document.getElementById('goalEnabled'),
    title: document.getElementById('goalTitle'),
    target: document.getElementById('goalTarget'),
    currency: document.getElementById('goalCurrency'),
    amount: document.getElementById('goalAmount'),
    soundEnabled: document.getElementById('goalSoundEnabled'),
    volume: document.getElementById('goalVolume'),
    scale: document.getElementById('goalScale'),
    shared: document.getElementById('goalShared'),
    posX: document.getElementById('goalPosX'),
    posY: document.getElementById('goalPosY'),
  };
  const goalSharedHint = document.getElementById('goalSharedHint');
  const goalSeparateBox = document.getElementById('goalSeparateBox');
  const goalPosBox = document.getElementById('goalPosBox');
  const goalPosXValue = document.getElementById('goalPosXValue');
  const goalPosYValue = document.getElementById('goalPosYValue');
  const goalVolumeValue = document.getElementById('goalVolumeValue');
  const goalScaleValue = document.getElementById('goalScaleValue');
  const goalMessage = document.getElementById('goalMessage');
  const goalObsSize = document.getElementById('goalObsSize');
  const goalPreviewFrame = document.getElementById('goalPreviewFrame');
  const goalPrevBox = document.getElementById('goalPrev');
  const btnGoalShared = document.getElementById('btnGoalShared');
  const goalObsUrl = document.getElementById('goalObsUrl');
  goalObsUrl.value = `http://localhost:${location.port || 3001}/goal.html`;
  // предпросмотр — сцена 1920×1080 в 16:9, как у донат-алерта (плашка стоит там, где её увидит зритель)
  function fitGoalPreview() {
    const k = goalPrevBox.clientWidth / 1920;
    goalPreviewFrame.style.transform = `scale(${k})`;
    goalPrevBox.style.height = (1080 * k) + 'px';
  }
  fitGoalPreview();
  window.addEventListener('resize', fitGoalPreview);
  new ResizeObserver(fitGoalPreview).observe(goalPrevBox);

  function showGoalMessage(text, kind) {
    goalMessage.textContent = text;
    goalMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function goalFromForm() {
    return {
      enabled: goalEls.enabled.checked,
      title: goalEls.title.value,
      target: Number(goalEls.target.value) || 1,
      currency: goalEls.currency.value,
      amount: Number(goalEls.amount.value) || 0,
      soundEnabled: goalEls.soundEnabled.checked,
      volume: Number(goalEls.volume.value),
      scale: Number(goalEls.scale.value),
      shared: goalEls.shared.checked,
      posX: Number(goalEls.posX.value),
      posY: Number(goalEls.posY.value),
    };
  }

  function updateGoalLabels() {
    goalVolumeValue.textContent = goalEls.volume.value + '%';
    goalScaleValue.textContent = goalEls.scale.value + '%';
    goalPosXValue.textContent = goalEls.posX.value + ' px';
    goalPosYValue.textContent = goalEls.posY.value + ' px';
    const shared = goalEls.shared.checked;
    btnGoalShared.classList.toggle('on', shared);
    btnGoalShared.setAttribute('aria-pressed', String(shared));
    goalSharedHint.style.display = shared ? '' : 'none';
    goalPosBox.style.display = shared ? '' : 'none';
    goalSeparateBox.style.display = shared ? 'none' : '';
    const k = Number(goalEls.scale.value) / 100;
    goalObsSize.textContent = Math.ceil(680 * k) + ' × ' + Math.ceil(250 * k);
  }

  function updateGoalPreview() {
    updateGoalLabels();
    if (!goalPreviewFrame.contentWindow) return;
    const goal = goalFromForm();
    goalPreviewFrame.contentWindow.postMessage({ type: 'goal_preview_update', goal: { ...goal, enabled: true, title: goal.title || 'Новый микрофон', currency: goal.currency || '₽' } }, '*');
    fitGoalPreview();
  }

  function applyGoalState(goal) {
    goalEls.enabled.checked = !!goal.enabled;
    goalEls.title.value = goal.title;
    goalEls.target.value = goal.target;
    goalEls.currency.value = goal.currency;
    goalEls.amount.value = goal.amount;
    goalEls.soundEnabled.checked = !!goal.soundEnabled;
    goalEls.volume.value = goal.volume;
    goalEls.scale.value = goal.scale;
    goalEls.shared.checked = !!goal.shared;
    goalEls.posX.value = goal.posX;
    goalEls.posY.value = goal.posY;
    updateGoalPreview();
  }

  async function loadGoalState() {
    try {
      const res = await fetch('/api/goal');
      const data = await res.json();
      if (data.goal) applyGoalState(data.goal);
    } catch (e) {
      // не критично — поля подгрузятся при следующем открытии
    }
  }
  loadGoalState();

  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'goal_preview_ready') updateGoalPreview();
  });
  Object.values(goalEls).forEach((input) => {
    input.addEventListener('input', updateGoalPreview);
    input.addEventListener('change', updateGoalPreview);
  });

  // переключатель «общий алерт» действует сразу (без кнопки «Сохранить»): иначе легко оставить плашку в двух источниках или ни в одном
  btnGoalShared.addEventListener('click', () => { goalEls.shared.checked = !goalEls.shared.checked; goalEls.shared.dispatchEvent(new Event('change')); });
  document.getElementById('btnGoalCopyUrl').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(goalObsUrl.value); } catch (e) { goalObsUrl.select(); document.execCommand('copy'); }
    showGoalMessage('Ссылка скопирована.', 'success');
  });
  goalEls.shared.addEventListener('change', async () => {
    try {
      const { ok, data } = await postJSON('/api/goal/save', { shared: goalEls.shared.checked });
      showGoalMessage(ok && data.success ? (goalEls.shared.checked ? 'Цель сбора теперь в общем алерте.' : 'Цель сбора вынесена в отдельный источник goal.html.') : 'Не удалось переключить.', ok ? 'success' : 'error');
    } catch (e) {
      showGoalMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  document.getElementById('btnGoalSave').addEventListener('click', async () => {
    showGoalMessage('Сохраняем…', '');
    const f = goalFromForm();
    try {
      const { ok, data } = await postJSON('/api/goal/save', {
        enabled: f.enabled, title: f.title, target: f.target, currency: f.currency,
        soundEnabled: f.soundEnabled, volume: f.volume, scale: f.scale,
        shared: f.shared, posX: f.posX, posY: f.posY,
      });
      if (ok && data.success) { applyGoalState(data.goal); showGoalMessage('Сохранено.', 'success'); } else showGoalMessage('Не удалось сохранить.', 'error');
    } catch (e) {
      showGoalMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  document.getElementById('btnGoalSetAmount').addEventListener('click', async () => {
    try {
      const { ok, data } = await postJSON('/api/goal/amount', { amount: Number(goalEls.amount.value) });
      if (ok && data.success) { goalEls.amount.value = data.goal.amount; showGoalMessage('Сумма поправлена.', 'success'); } else showGoalMessage((data && data.error) || 'Не удалось поправить сумму.', 'error');
    } catch (e) {
      showGoalMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  function runGoalTest(kind) {
    // сначала сохраняем текущие настройки (громкость/звук нужны оверлею), потом гоняем тест и в предпросмотре, и в OBS
    const f = goalFromForm();
    postJSON('/api/goal/save', { enabled: f.enabled, title: f.title, target: f.target, currency: f.currency, soundEnabled: f.soundEnabled, volume: f.volume, scale: f.scale, shared: f.shared, posX: f.posX, posY: f.posY })
      .then(() => postJSON('/api/goal/test', { kind }))
      .then(() => {
        if (goalPreviewFrame.contentWindow) goalPreviewFrame.contentWindow.postMessage({ type: 'goal_preview_demo', kind }, '*');
        showGoalMessage(kind === 'finale' ? 'Тест финала отправлен в OBS.' : 'Тестовый донат +1 500 отправлен в OBS.', 'success');
      })
      .catch(() => showGoalMessage('Сетевая ошибка при обращении к серверу.', 'error'));
  }
  document.getElementById('btnGoalTestDonation').addEventListener('click', () => runGoalTest('donation'));
  document.getElementById('btnGoalTestFinale').addEventListener('click', () => runGoalTest('finale'));

  document.getElementById('btnGoalReset').addEventListener('click', async () => {
    if (!await ui3Confirm('Обнулить собранную сумму цели? Планка и текст останутся.')) return;
    try {
      const { ok, data } = await postJSON('/api/goal/reset', {});
      if (ok && data.success) { goalEls.amount.value = 0; showGoalMessage('Сумма обнулена.', 'success'); }
    } catch (e) {
      showGoalMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  async function loadFundBoxState() {
    try {
      const res = await fetch('/api/fundbox');
      const data = await res.json();
      applyFundBoxState(data.state);
    } catch (e) {
      // не критично — поля просто останутся пустыми, пока не подгрузятся
    }
  }
  loadFundBoxState();

  const fundBoxPreviewFrame = document.getElementById('fundBoxPreviewFrame');

  async function updateFundBoxPreview() {
    if (!fundBoxPreviewFrame.contentWindow) return;
    const settings = {};
    Object.entries(fundBoxSizeSliders).forEach(([key, input]) => { settings[key] = Number(input.value); });
    Object.entries(fundBoxColorPickers).forEach(([key, input]) => { settings[key] = input.value; });
    const startDenom = Number(fundBoxStartDenom.value) || 1000;
    const coinValue = Number(fundBoxCoinValue.value) || 100;

    let boxSize = { width: 260, height: 220, coinSize: 22, coinsPerLevel: Math.round(startDenom / coinValue) };
    try {
      const res = await fetch('/api/fundbox/preview-size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denomination: startDenom, coinValue }),
      });
      const data = await res.json();
      if (data.boxSize) boxSize = data.boxSize;
    } catch (e) {
      // не критично — используем запасной размер, посчитанный выше
    }
    fundBoxComputedSize.textContent = `коробка ${boxSize.width} × ${boxSize.height} px, монетка ${boxSize.coinSize} px (${boxSize.coinsPerLevel} монет на уровень)`;

    const state = {
      enabled: true, // в предпросмотре показываем всегда, вне зависимости от тумблера — иначе нечего было бы предпросматривать
      textTemplate: fundBoxTextTemplate.value,
      coinValue,
      collectedAmount: 0,
      settings,
    };
    fundBoxPreviewFrame.contentWindow.postMessage({ type: 'fund_box_preview_update', state, denomination: startDenom, boxSize }, '*');
    scaleIframeToFit(fundBoxPreviewFrame, boxSize.width + 60, boxSize.height + 100);
  }

  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'fund_box_preview_ready') updateFundBoxPreview();
  });

  setInterval(() => {
    if (eventAccordionPanels.fund.style.display !== 'none') updateFundBoxPreview();
  }, 400);

  /* ================================================================
     Таймер (обратный отсчёт мм:сс) — вкладка "Ивент" → "Фон", плашка справа
     от "Фона трансляции". Отсчёт ведёт СЕРВЕР; админка держит СВОЙ WebSocket
     (тот же тип, что и у самого виджета) только чтобы видеть тик вживую —
     Старт/Пауза/Сброс шлются на сервер как есть, ничего не симулируется
     локально. Внешний вид (цвет/шрифт/размер/плашка) сохраняется как обычно,
     с debounce, и сразу виден в предпросмотре — он получает то же состояние.
  ================================================================ */
  const timerEnabled = document.getElementById('timerEnabled');
  const timerSetInput = document.getElementById('timerSetInput');
  const btnTimerSetTime = document.getElementById('btnTimerSetTime');
  const btnTimerStart = document.getElementById('btnTimerStart');
  const btnTimerPause = document.getElementById('btnTimerPause');
  const btnTimerReset = document.getElementById('btnTimerReset');
  const timerLiveStatus = document.getElementById('timerLiveStatus');
  const timerMessage = document.getElementById('timerMessage');
  const timerPreviewFrame = document.getElementById('timerPreviewFrame');
  const timerDigitSize = document.getElementById('timerDigitSize');
  const timerDigitSizeValue = document.getElementById('timerDigitSizeValue');
  const timerFont = document.getElementById('timerFont');
  const timerDigitColor = document.getElementById('timerDigitColor');
  const timerBgOpacity = document.getElementById('timerBgOpacity');
  const timerBgOpacityValue = document.getElementById('timerBgOpacityValue');
  const timerBgDarken = document.getElementById('timerBgDarken');
  const timerBgDarkenValue = document.getElementById('timerBgDarkenValue');
  const timerLabelText = document.getElementById('timerLabelText');
  const timerLabelPosition = document.getElementById('timerLabelPosition');
  const timerLabelSize = document.getElementById('timerLabelSize');
  const timerLabelSizeValue = document.getElementById('timerLabelSizeValue');
  const timerLabelFont = document.getElementById('timerLabelFont');
  const timerLabelColor = document.getElementById('timerLabelColor');

  function showTimerMessage(text, kind) {
    timerMessage.textContent = text;
    timerMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  /** "мм:сс" (строка из поля) -> целые секунды, или null, если формат не годится. Принимает и голое число секунд ("90"). */
  function parseTimerInput(raw) {
    const s = String(raw || '').trim();
    if (/^\d+$/.test(s)) return Number(s); // просто число — считаем секундами
    const m = /^(\d{1,3}):([0-5]?\d)$/.exec(s);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function formatMMSS(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  let timerLiveState = null; // последнее состояние с сервера (через WS ниже) — источник правды для предпросмотра и статуса

  function timerSettingsFromForm() {
    return {
      digitSize: Number(timerDigitSize.value),
      font: timerFont.value,
      digitColor: timerDigitColor.value,
      bgOpacity: Number(timerBgOpacity.value),
      bgDarken: Number(timerBgDarken.value),
      labelPosition: timerLabelPosition.value,
      labelSize: Number(timerLabelSize.value),
      labelFont: timerLabelFont.value,
      labelColor: timerLabelColor.value,
    };
  }

  function applyTimerSettingsToForm(settings) {
    timerDigitSize.value = settings.digitSize;
    timerDigitSizeValue.textContent = settings.digitSize + 'px';
    timerFont.value = settings.font;
    timerDigitColor.value = settings.digitColor;
    timerBgOpacity.value = settings.bgOpacity;
    timerBgOpacityValue.textContent = settings.bgOpacity + '%';
    timerBgDarken.value = settings.bgDarken;
    timerBgDarkenValue.textContent = settings.bgDarken + '%';
    timerLabelPosition.value = settings.labelPosition;
    timerLabelSize.value = settings.labelSize;
    timerLabelSizeValue.textContent = settings.labelSize + 'px';
    timerLabelFont.value = settings.labelFont;
    timerLabelColor.value = settings.labelColor;
  }

  function renderTimerLiveStatus() {
    if (!timerLiveState) { timerLiveStatus.textContent = '—'; return; }
    const time = formatMMSS(timerLiveState.remainingSeconds);
    timerLiveStatus.textContent = timerLiveState.running ? `Идёт: ${time}` : `Остановлен: ${time}`;
  }

  function updateTimerPreview() {
    if (!timerLiveState || !timerPreviewFrame.contentWindow) return;
    // labelText — тоже из формы (не дожидаясь ответа сервера) — как и settings: правка сразу видна в предпросмотре.
    const state = { ...timerLiveState, labelText: timerLabelText.value, settings: timerSettingsFromForm() };
    timerPreviewFrame.contentWindow.postMessage({ type: 'timer_preview_update', state }, '*');
  }

  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'timer_preview_ready') updateTimerPreview();
  });

  let timerSaveTimer = null;
  function scheduleTimerSettingsSave() {
    updateTimerPreview();
    clearTimeout(timerSaveTimer);
    timerSaveTimer = setTimeout(async () => {
      try {
        await postJSON('/api/timer/settings', timerSettingsFromForm());
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 250);
  }
  timerDigitSize.addEventListener('input', () => { timerDigitSizeValue.textContent = timerDigitSize.value + 'px'; scheduleTimerSettingsSave(); });
  timerFont.addEventListener('change', scheduleTimerSettingsSave);
  timerDigitColor.addEventListener('input', scheduleTimerSettingsSave);
  timerBgOpacity.addEventListener('input', () => { timerBgOpacityValue.textContent = timerBgOpacity.value + '%'; scheduleTimerSettingsSave(); });
  timerBgDarken.addEventListener('input', () => { timerBgDarkenValue.textContent = timerBgDarken.value + '%'; scheduleTimerSettingsSave(); });
  timerLabelPosition.addEventListener('change', scheduleTimerSettingsSave);
  timerLabelSize.addEventListener('input', () => { timerLabelSizeValue.textContent = timerLabelSize.value + 'px'; scheduleTimerSettingsSave(); });
  timerLabelFont.addEventListener('change', scheduleTimerSettingsSave);
  timerLabelColor.addEventListener('input', scheduleTimerSettingsSave);

  let timerLabelSaveTimer = null;
  function scheduleTimerLabelSave() {
    updateTimerPreview();
    clearTimeout(timerLabelSaveTimer);
    timerLabelSaveTimer = setTimeout(async () => {
      try {
        // enabled шлём вместе с labelText — иначе на сервере поле enabled могло бы случайно откатиться к дефолту (см. timerData.js).
        await postJSON('/api/timer/save', { enabled: timerEnabled.checked, labelText: timerLabelText.value });
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 250);
  }
  timerLabelText.addEventListener('input', scheduleTimerLabelSave);

  timerEnabled.addEventListener('change', async () => {
    try {
      await postJSON('/api/timer/save', { enabled: timerEnabled.checked });
    } catch (e) {
      showTimerMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnTimerSetTime.addEventListener('click', async () => {
    const seconds = parseTimerInput(timerSetInput.value);
    if (seconds === null || seconds < 1) {
      showTimerMessage('Формат — мм:сс (например, 05:00) или просто секунды.', 'error');
      return;
    }
    try {
      const { ok, data } = await postJSON('/api/timer/set', { seconds });
      if (ok && data.success) {
        timerSetInput.value = formatMMSS(seconds);
        showTimerMessage('Время задано.', 'success');
      } else {
        showTimerMessage((data && data.error) || 'Не удалось задать время.', 'error');
      }
    } catch (e) {
      showTimerMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });
  btnTimerStart.addEventListener('click', () => postJSON('/api/timer/start', {}).catch(() => showTimerMessage('Сетевая ошибка при обращении к серверу.', 'error')));
  btnTimerPause.addEventListener('click', () => postJSON('/api/timer/pause', {}).catch(() => showTimerMessage('Сетевая ошибка при обращении к серверу.', 'error')));
  btnTimerReset.addEventListener('click', () => postJSON('/api/timer/reset', {}).catch(() => showTimerMessage('Сетевая ошибка при обращении к серверу.', 'error')));

  (async function loadTimerState() {
    try {
      const res = await fetch('/api/timer');
      const data = await res.json();
      timerEnabled.checked = !!data.state.enabled;
      timerSetInput.value = formatMMSS(data.state.durationSeconds);
      timerLabelText.value = data.state.labelText || '';
      applyTimerSettingsToForm(data.state.settings);
    } catch (e) {
      // не критично — поля просто останутся пустыми, пока не подгрузятся
    }
  })();

  // Свой лёгкий WS — тот же канал, что слушает и сам виджет для OBS — только чтобы видеть тик вживую в админке
  // (статус-строка и предпросмотр). Настройки внешнего вида по-прежнему берутся из формы (см. updateTimerPreview),
  // а не из этого состояния — иначе несохранённая правка слетала бы с каждым тиком раз в секунду.
  (function connectTimerLive() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=timer`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'timer_state') {
        timerLiveState = data.state;
        renderTimerLiveStatus();
        updateTimerPreview();
      }
    };
    ws.onclose = () => setTimeout(connectTimerLive, 2000);
    ws.onerror = () => ws.close();
  })();

  /* ================================================================
     Ставки (Twitch Channel Points Predictions) и опросы (Twitch Polls) — вкладка "Чат"
  ================================================================ */

  const predictionTitle = document.getElementById('predictionTitle');
  const predictionOption1 = document.getElementById('predictionOption1');
  const predictionOption2 = document.getElementById('predictionOption2');
  const predictionDuration = document.getElementById('predictionDuration');
  const predictionDurationUnit = document.getElementById('predictionDurationUnit');
  const predictionDurationHint = document.getElementById('predictionDurationHint');
  const predictionMessage = document.getElementById('predictionMessage');
  const btnPredictionStart = document.getElementById('btnPredictionStart');
  const predictionActiveBox = document.getElementById('predictionActiveBox');
  const predictionTemplateList = document.getElementById('predictionTemplateList');

  function escapeHtmlPred(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** Индикатор активности карточки: 'active' — горит зелёным, 'locked' — жёлтым (приём ставок закрыт), 'idle' — серый. */
  /** Короткая версия ошибки для тесных панелей: длинное объяснение про вход через Twitch сводим к одной строке (полный текст — во всплывающей подсказке). */
  function shortenGameError(message) {
    if (!message) return 'Не удалось получить статус.';
    if (/войди через Twitch/i.test(message)) return 'Нужен вход через Twitch («Подключения» → «Войти через Twitch»). Если входил раньше — войди ещё раз: нужно новое право доступа.';
    return message;
  }

  function setActivityState(cardId, state) {
    const card = document.getElementById(cardId);
    if (card) card.dataset.state = state;
  }

  function formatWindow(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} сек`;
    return s === 0 ? `${m} мин` : `${m} мин ${s} сек`;
  }

  /** Длительность в форме — число + единица (сек/мин); наружу всегда отдаём секунды. */
  function durationSeconds(numberEl, unitEl) {
    return Math.round((Number(numberEl.value) || 0) * Number(unitEl.value));
  }
  function bindDurationHint(numberEl, unitEl, hintEl, limits) {
    const update = () => {
      const s = durationSeconds(numberEl, unitEl);
      const ok = s >= limits[0] && s <= limits[1];
      hintEl.textContent = ok ? `= ${formatWindow(s)}` : `нужно от ${limits[0]} до ${limits[1]} сек`;
      hintEl.style.color = ok ? '' : '#F87171';
    };
    numberEl.addEventListener('input', update);
    unitEl.addEventListener('change', update);
    update();
  }
  bindDurationHint(predictionDuration, predictionDurationUnit, predictionDurationHint, [30, 1800]);

  function showPredictionMessage(text, kind) {
    predictionMessage.textContent = text;
    predictionMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  async function startPrediction() {
    showPredictionMessage('Запускаем на Twitch…', '');
    btnPredictionStart.disabled = true;
    try {
      const { ok, data } = await postJSON('/api/predictions/create', {
        title: predictionTitle.value,
        option1: predictionOption1.value,
        option2: predictionOption2.value,
        windowSeconds: durationSeconds(predictionDuration, predictionDurationUnit),
      });
      if (ok && data.success) {
        showPredictionMessage('', '');
        closeGameForms();
        showChatGamesMessage('Ставка запущена на Twitch.', 'success', 'prediction');
        loadActivePrediction();
        loadPredictionTemplates();
      } else {
        showPredictionMessage((data && data.error) || 'Не удалось запустить ставку.', 'error');
      }
    } catch (e) {
      showPredictionMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnPredictionStart.disabled = false;
    }
  }
  btnPredictionStart.addEventListener('click', startPrediction);

  async function resolvePrediction(predictionId, winningOutcomeId) {
    showPredictionMessage('Фиксируем результат…', '');
    try {
      const res = await fetch('/api/predictions/resolve', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId, winningOutcomeId, status: 'RESOLVED' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showPredictionMessage('Результат зафиксирован, баллы распределены.', 'success');
        loadActivePrediction();
      } else {
        showPredictionMessage((data && data.error) || 'Не удалось зафиксировать результат.', 'error');
      }
    } catch (e) {
      showPredictionMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }

  function renderActivePrediction(prediction) {
    if (!prediction) {
      setActivityState('predictionActiveCard', 'idle');
      predictionActiveBox.innerHTML = '<p class="card-hint">Сейчас активных ставок нет.</p>';
      return;
    }
    setActivityState('predictionActiveCard', prediction.status === 'LOCKED' ? 'locked' : 'active');
    const statusLabel = prediction.status === 'LOCKED' ? 'Заблокирована (приём ставок закрыт)' : 'Активна';
    const [o1, o2] = prediction.outcomes || [];
    const stats = (prediction.outcomes || []).map((o) => `<div class="poll-result-row"><div class="poll-result-head"><span>${escapeHtmlPred(o.title)}</span><span>${Number(o.channel_points || 0).toLocaleString('ru-RU')} баллов · ${Number(o.users || 0)} чел.</span></div></div>`).join('');
    predictionActiveBox.innerHTML = `
      <p class="fact-preset-row-title" style="margin-bottom:4px;">${escapeHtmlPred(prediction.title)}</p>
      <p class="card-hint" style="margin-bottom:10px;">Статус: <b>${statusLabel}</b></p>
      ${stats}
      <div class="actions" style="margin-top:12px;">
        ${o1 ? `<button class="btn btn-primary" id="btnResolveOutcome1" type="button">Зафиксировать «${escapeHtmlPred(o1.title)}»</button>` : ''}
        ${o2 ? `<button class="btn btn-primary" id="btnResolveOutcome2" type="button">Зафиксировать «${escapeHtmlPred(o2.title)}»</button>` : ''}
      </div>
    `;
    if (o1) document.getElementById('btnResolveOutcome1').addEventListener('click', () => resolvePrediction(prediction.id, o1.id));
    if (o2) document.getElementById('btnResolveOutcome2').addEventListener('click', () => resolvePrediction(prediction.id, o2.id));
  }

  async function loadActivePrediction() {
    try {
      const res = await fetch('/api/predictions/active');
      const data = await res.json();
      if (res.ok && data.success) {
        renderActivePrediction(data.prediction);
      } else {
        setActivityState('predictionActiveCard', 'idle');
        predictionActiveBox.innerHTML = `<p class="card-hint" title="${escapeHtmlPred((data && data.error) || '')}">${escapeHtmlPred(shortenGameError(data && data.error))}</p>`;
      }
    } catch (e) {
      predictionActiveBox.innerHTML = '<p class="card-hint">Сетевая ошибка при обращении к серверу.</p>';
    }
  }

  function renderPredictionTemplates(templates) {
    if (!templates || templates.length === 0) {
      predictionTemplateList.innerHTML = '<p class="card-hint">Пока нет сохранённых шаблонов — появятся после первого запуска ставки.</p>';
      return;
    }
    predictionTemplateList.innerHTML = '';
    templates.forEach((tpl) => {
      const row = document.createElement('div');
      row.className = 'fact-preset-row';
      row.innerHTML = `
        <div class="fact-preset-row-text">
          <div class="fact-preset-row-title">${escapeHtmlPred(tpl.title)}</div>
          <div class="fact-preset-row-body">${escapeHtmlPred(tpl.option1)} / ${escapeHtmlPred(tpl.option2)}</div>
        </div>
        <div class="fact-preset-row-actions">
          <button class="btn btn-primary" type="button">Загрузить шаблон</button>
          <button class="btn-tiny" type="button">Удалить</button>
        </div>
      `;
      const [loadBtn, deleteBtn] = row.querySelectorAll('button');
      loadBtn.addEventListener('click', () => {
        predictionTitle.value = tpl.title;
        predictionOption1.value = tpl.option1;
        predictionOption2.value = tpl.option2;
        closeGameForms();
        predictionFormCard.style.display = 'block'; // форма ставки по умолчанию скрыта — шаблон открывает её сам
        positionGameForm(predictionFormCard, predictionPanel);
        btnToggleCreatePrediction.setAttribute('aria-expanded', 'true');
        renderPredictionPreview();
        predictionFormCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        showPredictionMessage('Шаблон загружен в форму — проверь и нажми «Запустить».', 'success');
      });
      deleteBtn.addEventListener('click', async () => {
        if (!await ui3Confirm(`Удалить шаблон «${tpl.title}» навсегда?`)) return;
        try {
          await postJSON('/api/predictions/templates/delete', { id: tpl.id });
          loadPredictionTemplates();
        } catch (e) {
          // не критично
        }
      });
      predictionTemplateList.appendChild(row);
    });
  }

  async function loadPredictionTemplates() {
    try {
      const res = await fetch('/api/predictions/templates');
      const data = await res.json();
      renderPredictionTemplates(data.templates);
    } catch (e) {
      predictionTemplateList.innerHTML = '<p class="card-hint">Не удалось загрузить список.</p>';
    }
  }

  loadActivePrediction();
  loadPredictionTemplates();

  // Ставки и опросы обновляются опросом Twitch API раз в 5 секунд, пока открыта вкладка "Чат" (своего
  // WebSocket-канала под это нет — Twitch отдаёт это только через Helix; для результатов "в реальном времени" 5 с достаточно).
  setInterval(() => {
    if (currentTabId === 'chat') { loadActivePrediction(); loadActivePoll(); }
  }, 5000);

  /* --- Кнопки «Создать ставку» / «Создать опрос» (формы прячутся, пока не нажата кнопка) --- */
  const predictionFormCard = document.getElementById('predictionFormCard');
  const pollFormCard = document.getElementById('pollFormCard');
  const btnToggleCreatePrediction = document.getElementById('btnToggleCreatePrediction');
  const btnToggleCreatePoll = document.getElementById('btnToggleCreatePoll');
  const predictionStatusMessage = document.getElementById('predictionStatusMessage');
  const pollStatusMessage = document.getElementById('pollStatusMessage');

  /** Сообщение под шапкой нужной панели: target — 'prediction' или 'poll'. */
  function showChatGamesMessage(text, kind, target) {
    const el = target === 'poll' ? pollStatusMessage : predictionStatusMessage;
    el.textContent = text;
    el.className = 'form-message' + (kind ? ' ' + kind : '');
  }
  function closeGameForms() {
    predictionFormCard.style.display = 'none';
    pollFormCard.style.display = 'none';
    btnToggleCreatePrediction.setAttribute('aria-expanded', 'false');
    btnToggleCreatePoll.setAttribute('aria-expanded', 'false');
  }
  // Форма раскрывается вправо от своей панели, в свободное место между панелями и чатом: верх формы = верх панели
  // (панель и область форм лежат в .chat-main-body с position:relative, поэтому offsetTop у панели — та же система координат).
  const predictionPanel = document.getElementById('predictionActiveCard');
  const pollPanel = document.getElementById('pollActiveCard');
  function positionGameForm(form, panel) {
    form.style.top = panel.offsetTop + 'px';
  }
  function toggleGameForm(form, btn, panel) {
    const willOpen = form.style.display === 'none';
    closeGameForms(); // одновременно открыта только одна форма
    form.style.display = willOpen ? 'block' : 'none';
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    showChatGamesMessage('', '', 'prediction');
    showChatGamesMessage('', '', 'poll');
    if (willOpen) {
      positionGameForm(form, panel);
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  btnToggleCreatePrediction.addEventListener('click', () => toggleGameForm(predictionFormCard, btnToggleCreatePrediction, predictionPanel));
  btnToggleCreatePoll.addEventListener('click', () => toggleGameForm(pollFormCard, btnToggleCreatePoll, pollPanel));
  window.addEventListener('resize', () => {
    if (predictionFormCard.style.display !== 'none') positionGameForm(predictionFormCard, predictionPanel);
    if (pollFormCard.style.display !== 'none') positionGameForm(pollFormCard, pollPanel);
  });
  document.getElementById('btnPredictionCancelForm').addEventListener('click', closeGameForms);
  document.getElementById('btnPollCancelForm').addEventListener('click', closeGameForms);

  /* --- Шестерёнка у окна чата: «Отображение чата» спрятано во всплывающую панель --- */
  const btnChatGear = document.getElementById('btnChatGear');
  const chatDisplayPanel = document.getElementById('chatDisplayPanel');
  function setChatDisplayPanelOpen(open) {
    chatDisplayPanel.style.display = open ? 'block' : 'none';
    btnChatGear.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btnChatGear.addEventListener('click', () => setChatDisplayPanelOpen(chatDisplayPanel.style.display === 'none'));
  document.addEventListener('click', (e) => {
    if (chatDisplayPanel.style.display === 'none') return;
    if (chatDisplayPanel.contains(e.target) || btnChatGear.contains(e.target)) return;
    setChatDisplayPanelOpen(false); // клик мимо панели закрывает её
  });

  /* --- «Отделить чат»: окно чата выносится в отдельное окно, которое не пропадает, когда сворачиваешь браузер с админкой ---
     Основной способ — Document Picture-in-Picture (Chrome/Edge 116+): плавающее окно с произвольным HTML, висит поверх
     остальных окон. Если API нет (Firefox, Safari) или браузер отказал — обычное отдельное окно (window.open). Само окно
     чата (#chatMirror) физически переносится в новое окно, поэтому новые сообщения продолжают приходить туда же — обновляет
     его эта же страница админки, так что её вкладка должна оставаться открытой (закроешь вкладку — окно чата закроется). */
  const btnChatDetach = document.getElementById('btnChatDetach');
  const chatDetachLabel = document.getElementById('chatDetachLabel');
  const chatDetachedNote = document.getElementById('chatDetachedNote');
  const btnChatReattach = document.getElementById('btnChatReattach');
  const chatMirrorHome = chatMirror.parentElement;
  let detachedWin = null;

  /** Переносит оформление админки в новое окно: тему (data-theme + переменные своей темы) и стили — таблицы с адресом подключаются ссылкой (так не ломаются относительные пути шрифтов), встроенные копируются текстом. */
  function copyDocumentStyles(targetDoc) {
    targetDoc.documentElement.setAttribute('data-theme', root.getAttribute('data-theme') || 'dark');
    targetDoc.documentElement.style.cssText = root.style.cssText;
    Array.from(document.styleSheets).forEach((sheet) => {
      if (sheet.href) {
        const link = targetDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
        return;
      }
      try {
        const style = targetDoc.createElement('style');
        style.textContent = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
        targetDoc.head.appendChild(style);
      } catch (e) {
        // недоступную таблицу пропускаем — остальные стили всё равно применятся
      }
    });
  }

  async function openDetachedWindow() {
    if ('documentPictureInPicture' in window) {
      try {
        return await window.documentPictureInPicture.requestWindow({ width: 380, height: 640 });
      } catch (e) {
        // браузер отказал — пробуем обычное окно
      }
    }
    return window.open('', 'detachedChat', 'popup=yes,width=400,height=680');
  }

  async function detachChat() {
    try {
      const win = await openDetachedWindow();
      if (!win) {
        ui3Alert('Браузер не дал открыть окно чата. Разреши всплывающие окна для этого адреса и попробуй ещё раз.');
        return;
      }
      detachedWin = win;
      win.document.title = 'Чат';
      copyDocumentStyles(win.document);
      win.document.body.style.cssText = 'margin:0;background:var(--bg-app);';
      chatMirror.classList.add('chat-detached');
      win.document.body.appendChild(chatMirror);
      chatMirror.scrollTop = chatMirror.scrollHeight;
      chatDetachedNote.style.display = 'flex';
      chatDetachLabel.textContent = 'Вернуть чат';
      btnChatDetach.setAttribute('aria-pressed', 'true');
      win.addEventListener('pagehide', reattachChat); // окно закрыли крестиком — чат сам возвращается на место
    } catch (e) {
      console.warn('[Чат] Не удалось отделить чат:', e);
      reattachChat();
    }
  }

  function reattachChat() {
    if (!detachedWin) return;
    const win = detachedWin;
    detachedWin = null;
    chatMirror.classList.remove('chat-detached');
    chatMirrorHome.appendChild(chatMirror);
    chatMirror.scrollTop = chatMirror.scrollHeight;
    chatDetachedNote.style.display = 'none';
    chatDetachLabel.textContent = 'Отделить чат';
    btnChatDetach.setAttribute('aria-pressed', 'false');
    try { win.close(); } catch (e) { /* уже закрыто */ }
  }

  btnChatDetach.addEventListener('click', () => { if (detachedWin) reattachChat(); else detachChat(); });
  btnChatReattach.addEventListener('click', reattachChat);
  window.addEventListener('pagehide', () => { if (detachedWin) { try { detachedWin.close(); } catch (e) { /* уже закрыто */ } } });

  /* --- Живой предпросмотр ставки (обновляется при вводе); примерный вид, не точная копия интерфейса Twitch --- */
  const predictionPreview = document.getElementById('predictionPreview');
  function renderPredictionPreview() {
    const title = predictionTitle.value.trim();
    const o1 = predictionOption1.value.trim();
    const o2 = predictionOption2.value.trim();
    const secs = durationSeconds(predictionDuration, predictionDurationUnit);
    predictionPreview.innerHTML = `
      <div class="game-preview-label">Предпросмотр — примерно так ставку увидят зрители</div>
      <div class="game-preview-box">
        <div class="gp-title${title ? '' : ' gp-empty'}">${escapeHtmlPred(title || 'Название ставки')}</div>
        <div class="gp-sub">Приём ставок: ${secs > 0 ? formatWindow(secs) : '—'}</div>
        <div class="gp-outcomes">
          <div class="gp-outcome gp-blue"><div class="${o1 ? '' : 'gp-choice-name gp-empty'}">${escapeHtmlPred(o1 || 'Вариант 1')}</div><span>0 баллов · 0 чел.</span></div>
          <div class="gp-outcome gp-pink"><div class="${o2 ? '' : 'gp-choice-name gp-empty'}">${escapeHtmlPred(o2 || 'Вариант 2')}</div><span>0 баллов · 0 чел.</span></div>
        </div>
      </div>`;
  }
  [predictionTitle, predictionOption1, predictionOption2, predictionDuration].forEach((el) => el.addEventListener('input', renderPredictionPreview));
  predictionDurationUnit.addEventListener('change', renderPredictionPreview);
  renderPredictionPreview();

  /* --- Опросы (Twitch Polls) --- */
  const pollTitle = document.getElementById('pollTitle');
  const pollChoicesList = document.getElementById('pollChoicesList');
  const btnPollAddChoice = document.getElementById('btnPollAddChoice');
  const pollDuration = document.getElementById('pollDuration');
  const pollDurationUnit = document.getElementById('pollDurationUnit');
  const pollDurationHint = document.getElementById('pollDurationHint');
  const pollMessage = document.getElementById('pollMessage');
  const btnPollStart = document.getElementById('btnPollStart');
  const pollActiveBox = document.getElementById('pollActiveBox');
  const pollPreview = document.getElementById('pollPreview');
  const POLL_CHOICES_MIN = 2, POLL_CHOICES_MAX = 5;

  bindDurationHint(pollDuration, pollDurationUnit, pollDurationHint, [15, 1800]);

  function showPollMessage(text, kind) {
    pollMessage.textContent = text;
    pollMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  /** Строки вариантов: минимум 2, максимум 5; "удалить" скрыто, когда осталось 2, "добавить" — когда уже 5. */
  function refreshPollChoiceControls() {
    const rows = pollChoicesList.querySelectorAll('.poll-choice-row');
    rows.forEach((row, i) => {
      row.querySelector('input').placeholder = `Вариант ${i + 1}`;
      row.querySelector('button').style.visibility = rows.length > POLL_CHOICES_MIN ? 'visible' : 'hidden';
    });
    btnPollAddChoice.style.display = rows.length >= POLL_CHOICES_MAX ? 'none' : '';
    renderPollPreview();
  }

  /** Живой предпросмотр опроса: вопрос, введённые варианты (пустые пропускаются, как и при отправке) и длительность. */
  function renderPollPreview() {
    const title = pollTitle.value.trim();
    const choices = Array.from(pollChoicesList.querySelectorAll('input')).map((i) => i.value.trim());
    const shown = choices.map((c, i) => c || `Вариант ${i + 1}`);
    const secs = durationSeconds(pollDuration, pollDurationUnit);
    pollPreview.innerHTML = `
      <div class="game-preview-label">Предпросмотр — примерно так опрос увидят зрители</div>
      <div class="game-preview-box">
        <div class="gp-title${title ? '' : ' gp-empty'}">${escapeHtmlPred(title || 'Вопрос опроса')}</div>
        <div class="gp-sub">Опрос · ${secs > 0 ? formatWindow(secs) : '—'}</div>
        ${shown.map((c, i) => `<div class="gp-choice"><div class="gp-choice-head"><span class="${choices[i] ? '' : 'gp-choice-name gp-empty'}">${escapeHtmlPred(c)}</span><span>0%</span></div><div class="gp-choice-bar"></div></div>`).join('')}
      </div>`;
  }
  [pollTitle, pollDuration].forEach((el) => el.addEventListener('input', renderPollPreview));
  pollDurationUnit.addEventListener('change', renderPollPreview);
  pollChoicesList.addEventListener('input', renderPollPreview);
  function addPollChoiceRow(value) {
    if (pollChoicesList.children.length >= POLL_CHOICES_MAX) return;
    const row = document.createElement('div');
    row.className = 'poll-choice-row';
    row.innerHTML = '<input type="text" maxlength="25"><button class="btn-tiny" type="button" title="Удалить вариант">✕</button>';
    row.querySelector('input').value = value || '';
    row.querySelector('button').addEventListener('click', () => {
      if (pollChoicesList.children.length <= POLL_CHOICES_MIN) return;
      row.remove();
      refreshPollChoiceControls();
    });
    pollChoicesList.appendChild(row);
    refreshPollChoiceControls();
  }
  btnPollAddChoice.addEventListener('click', () => addPollChoiceRow(''));
  addPollChoiceRow(''); addPollChoiceRow('');

  btnPollStart.addEventListener('click', async () => {
    showPollMessage('Запускаем на Twitch…', '');
    btnPollStart.disabled = true;
    try {
      const choices = Array.from(pollChoicesList.querySelectorAll('input')).map((i) => i.value);
      const { ok, data } = await postJSON('/api/polls/create', {
        title: pollTitle.value, choices, durationSeconds: durationSeconds(pollDuration, pollDurationUnit),
      });
      if (ok && data.success) {
        showPollMessage('', '');
        closeGameForms();
        showChatGamesMessage('Опрос запущен на Twitch.', 'success', 'poll');
        loadActivePoll();
      } else {
        showPollMessage((data && data.error) || 'Не удалось запустить опрос.', 'error');
      }
    } catch (e) {
      showPollMessage('Сетевая ошибка при обращении к серверу.', 'error');
    } finally {
      btnPollStart.disabled = false;
    }
  });

  async function endPoll(pollId, status) {
    try {
      const res = await fetch('/api/polls/end', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pollId, status }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showChatGamesMessage(status === 'ARCHIVED' ? 'Опрос убран из чата.' : 'Опрос завершён, итоги показаны в чате.', 'success', 'poll');
        loadActivePoll();
      } else {
        showChatGamesMessage((data && data.error) || 'Не удалось завершить опрос.', 'error', 'poll');
      }
    } catch (e) {
      showChatGamesMessage('Сетевая ошибка при обращении к серверу.', 'error', 'poll');
    }
  }

  /** Результаты опроса: голоса и доля по каждому варианту (доли считаем сами из votes — Twitch их не присылает). */
  function pollResultsHtml(poll) {
    const total = (poll.choices || []).reduce((sum, c) => sum + Number(c.votes || 0), 0);
    return (poll.choices || []).map((c) => {
      const votes = Number(c.votes || 0);
      const pct = total ? Math.round((votes / total) * 100) : 0;
      return `<div class="poll-result-row"><div class="poll-result-head"><span>${escapeHtmlPred(c.title)}</span><span>${votes} · ${pct}%</span></div><div class="poll-result-bar"><span style="width:${pct}%"></span></div></div>`;
    }).join('') + `<p class="card-hint" style="margin-top:6px;">Всего голосов: ${total}</p>`;
  }

  function renderActivePoll(poll, lastPoll) {
    if (!poll) {
      setActivityState('pollActiveCard', 'idle');
      pollActiveBox.innerHTML = '<p class="card-hint">Сейчас активных опросов нет.</p>' + (lastPoll
        ? `<p class="fact-preset-row-title" style="margin:10px 0 6px;">Последний опрос: ${escapeHtmlPred(lastPoll.title)}</p>${pollResultsHtml(lastPoll)}` : '');
      return;
    }
    setActivityState('pollActiveCard', 'active');
    pollActiveBox.innerHTML = `
      <p class="fact-preset-row-title" style="margin-bottom:10px;">${escapeHtmlPred(poll.title)}</p>
      ${pollResultsHtml(poll)}
      <div class="actions" style="margin-top:12px;">
        <button class="btn btn-primary" id="btnPollEnd" type="button">Завершить и показать итоги</button>
        <button class="btn btn-secondary" id="btnPollArchive" type="button">Убрать из чата</button>
      </div>
    `;
    document.getElementById('btnPollEnd').addEventListener('click', () => endPoll(poll.id, 'TERMINATED'));
    document.getElementById('btnPollArchive').addEventListener('click', () => endPoll(poll.id, 'ARCHIVED'));
  }

  async function loadActivePoll() {
    try {
      const res = await fetch('/api/polls/active');
      const data = await res.json();
      if (res.ok && data.success) renderActivePoll(data.poll, data.lastPoll);
      else { setActivityState('pollActiveCard', 'idle'); pollActiveBox.innerHTML = `<p class="card-hint" title="${escapeHtmlPred((data && data.error) || '')}">${escapeHtmlPred(shortenGameError(data && data.error))}</p>`; }
    } catch (e) {
      pollActiveBox.innerHTML = '<p class="card-hint">Сетевая ошибка при обращении к серверу.</p>';
    }
  }
  loadActivePoll();

  /* ================================================================
     "Тема ивента" — общее оформление для алертов вкладки "Ивент"
  ================================================================ */

  const themeColorInputs = {
    bgColor: document.getElementById('themeBgColor'),
    bgColorEnd: document.getElementById('themeBgColorEnd'),
    accentColor: document.getElementById('themeAccentColor'),
    textColor: document.getElementById('themeTextColor'),
    goldColor: document.getElementById('themeGoldColor'),
    labelTextColor: document.getElementById('themeLabelTextColor'),
  };
  const themeFontInputs = {
    titleFont: document.getElementById('themeTitleFont'),
    dataFont: document.getElementById('themeDataFont'),
  };
  const themeTitleFontWeight = document.getElementById('themeTitleFontWeight');
  const themeDataFontWeight = document.getElementById('themeDataFontWeight');
  const themeSliders = {
    borderRadius: document.getElementById('themeBorderRadius'),
    borderWidth: document.getElementById('themeBorderWidth'),
    textureIntensity: document.getElementById('themeTextureIntensity'),
    panelOpacity: document.getElementById('themePanelOpacity'),
  };
  const themeSliderValueEls = {
    borderRadius: document.getElementById('themeBorderRadiusValue'),
    borderWidth: document.getElementById('themeBorderWidthValue'),
    textureIntensity: document.getElementById('themeTextureIntensityValue'),
    panelOpacity: document.getElementById('themePanelOpacityValue'),
  };
  const themeSliderUnits = { borderRadius: 'px', borderWidth: 'px', textureIntensity: '%', panelOpacity: '%' };
  const themeBorderStyle = document.getElementById('themeBorderStyle');
  const themeCornerStyle = document.getElementById('themeCornerStyle');
  const themeBorderRadiusLabel = document.getElementById('themeBorderRadiusLabel');
  const themeChamferCornersField = document.getElementById('themeChamferCornersField');
  const themeChamferInputs = {
    topLeft: document.getElementById('themeChamferTopLeft'),
    topRight: document.getElementById('themeChamferTopRight'),
    bottomLeft: document.getElementById('themeChamferBottomLeft'),
    bottomRight: document.getElementById('themeChamferBottomRight'),
  };

  /** Та же геометрия среза углов, что и в public/*.js (mvp.js и т.д.) — здесь используется только для предпросмотра. */
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
  const themeTextureEnabled = document.getElementById('themeTextureEnabled');
  const themeTextureType = document.getElementById('themeTextureType');
  const eventThemePresetSelect = document.getElementById('eventThemePresetSelect');
  const themeMessage = document.getElementById('themeMessage');
  const btnEventThemeSave = document.getElementById('btnEventThemeSave');
  const themePreviewPanel = document.getElementById('themePreviewPanel');
  const themeActiveWidgetName = document.getElementById('themeActiveWidgetName');

  // Часть 5: у каждого виджета — своя независимая копия темы (см. eventTheme.js). eventThemeData хранит ответ сервера
  // целиком ({widgets: {mvp: {enabled, theme}, ...}}); currentThemeWidget — какой из них сейчас показан в форме выше.
  const THEME_WIDGET_NAMES = {
    mvp: 'MVP', fact: 'Факт', fund: 'Сбор', fundAlert: 'Алерт о донате', teamCards: 'Карточки команд', bracket: 'Турнирная сетка',
  };
  const themeWidgetToggles = {};
  Object.keys(THEME_WIDGET_NAMES).forEach((key) => { themeWidgetToggles[key] = document.getElementById(`themeWidgetToggle-${key}`); });
  let eventThemeData = null;
  let currentThemeWidget = 'mvp';

  function showEventThemeMessage(text, kind) {
    themeMessage.textContent = text;
    themeMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  async function populateFontWeightSelect(selectEl, fontName, currentWeight) {
    let weights = [{ weight: 400, label: 'Regular' }];
    try {
      const res = await fetch(`/api/fonts/weights?font=${encodeURIComponent(fontName)}`);
      const data = await res.json();
      if (data.weights && data.weights.length) weights = data.weights;
    } catch (e) {
      // не критично — останется дефолтный Regular
    }
    selectEl.innerHTML = weights.map((w) => `<option value="${w.weight}">${w.label} (${w.weight})</option>`).join('');
    const hasCurrent = weights.some((w) => w.weight === currentWeight);
    selectEl.value = hasCurrent ? currentWeight : weights[0].weight;
  }

  /** Заполняет ВСЕ поля формы (кроме тумблеров списка виджетов — те показывают своё состояние независимо от того, какой виджет сейчас выбран для редактирования). */
  function applyEventThemeToForm(theme) {
    Object.entries(themeColorInputs).forEach(([key, input]) => { input.value = theme[key]; });
    Object.entries(themeFontInputs).forEach(([key, input]) => { input.value = theme[key]; });
    Object.entries(themeSliders).forEach(([key, input]) => {
      input.value = theme[key];
      themeSliderValueEls[key].textContent = theme[key] + themeSliderUnits[key];
    });
    themeBorderStyle.value = theme.borderStyle;
    themeCornerStyle.value = theme.cornerStyle;
    themeBorderRadiusLabel.textContent = theme.cornerStyle === 'chamfer' ? 'Размер среза угла' : 'Скругление углов';
    themeChamferCornersField.style.display = theme.cornerStyle === 'chamfer' ? '' : 'none';
    Object.entries(themeChamferInputs).forEach(([key, input]) => { input.checked = theme.chamferCorners ? !!theme.chamferCorners[key] : true; });
    themeTextureEnabled.checked = !!theme.textureEnabled;
    themeTextureType.value = theme.textureType;
    eventThemePresetSelect.value = theme.activePreset || '';
    populateFontWeightSelect(themeTitleFontWeight, theme.titleFont, theme.titleFontWeight);
    populateFontWeightSelect(themeDataFontWeight, theme.dataFont, theme.dataFontWeight);
    applyThemeBgToForm(theme);
    updateThemePreview();
  }

  function updateThemePreview() {
    const s = themePreviewPanel.style;
    s.setProperty('--theme-preview-bg-start', themeColorInputs.bgColor.value);
    s.setProperty('--theme-preview-bg-end', themeColorInputs.bgColorEnd.value);
    s.setProperty('--theme-preview-accent', themeColorInputs.accentColor.value);
    s.setProperty('--theme-preview-gold', themeColorInputs.goldColor.value);
    s.setProperty('--theme-preview-text', themeColorInputs.textColor.value);
    s.setProperty('--theme-preview-title-font', `'${themeFontInputs.titleFont.value}', sans-serif`);
    s.setProperty('--theme-preview-data-font', `'${themeFontInputs.dataFont.value}', sans-serif`);
    s.setProperty('--theme-preview-title-weight', themeTitleFontWeight.value || 400);
    s.setProperty('--theme-preview-data-weight', themeDataFontWeight.value || 400);
    s.setProperty('--theme-preview-opacity', (Number(themeSliders.panelOpacity.value) / 100).toFixed(2));
    s.setProperty('--theme-preview-radius', themeSliders.borderRadius.value + 'px');
    s.setProperty('--theme-preview-border-w', themeSliders.borderWidth.value + 'px');
    s.setProperty('--theme-preview-chamfer-points', buildChamferPoints(Number(themeSliders.borderRadius.value), { topLeft: themeChamferInputs.topLeft.checked, topRight: themeChamferInputs.topRight.checked, bottomLeft: themeChamferInputs.bottomLeft.checked, bottomRight: themeChamferInputs.bottomRight.checked }));
    s.setProperty('--theme-preview-texture-opacity', themeTextureEnabled.checked ? (Number(themeSliders.textureIntensity.value) / 100 * 0.7).toFixed(2) : '0');
    themePreviewPanel.classList.toggle('border-style-solid', themeBorderStyle.value === 'solid');
    themePreviewPanel.classList.toggle('border-style-double', themeBorderStyle.value === 'double');
    themePreviewPanel.classList.toggle('corner-chamfer', themeCornerStyle.value === 'chamfer');
    themePreviewPanel.classList.toggle('texture-metal', themeTextureEnabled.checked && themeTextureType.value === 'metal');
    themePreviewPanel.classList.toggle('texture-runes', themeTextureEnabled.checked && themeTextureType.value === 'runes');
    themePreviewPanel.classList.toggle('texture-noise', themeTextureEnabled.checked && themeTextureType.value === 'noise');
  }

  function collectThemeFieldsFromForm() {
    const theme = {};
    Object.entries(themeColorInputs).forEach(([key, input]) => { theme[key] = input.value; });
    Object.entries(themeFontInputs).forEach(([key, input]) => { theme[key] = input.value; });
    Object.entries(themeSliders).forEach(([key, input]) => { theme[key] = Number(input.value); });
    theme.borderStyle = themeBorderStyle.value;
    theme.cornerStyle = themeCornerStyle.value;
    theme.chamferCorners = { topLeft: themeChamferInputs.topLeft.checked, topRight: themeChamferInputs.topRight.checked, bottomLeft: themeChamferInputs.bottomLeft.checked, bottomRight: themeChamferInputs.bottomRight.checked };
    theme.textureEnabled = themeTextureEnabled.checked;
    theme.textureType = themeTextureType.value;
    theme.titleFontWeight = Number(themeTitleFontWeight.value) || 400;
    theme.dataFontWeight = Number(themeDataFontWeight.value) || 400;
    return theme;
  }

  /** Сохраняет форму ИМЕННО за тем виджетом, что был текущим на момент вызова (важно при быстром переключении — см. flushPendingThemeSave). */
  async function saveWidgetTheme(widgetKey) {
    const { ok, data } = await postJSON(`/api/event-theme/${widgetKey}`, { theme: collectThemeFieldsFromForm() });
    if (ok && data.success && eventThemeData) eventThemeData.widgets[widgetKey] = data.eventTheme.widgets[widgetKey];
    return { ok, data };
  }

  let themeSaveTimer = null;
  function scheduleThemeSave() {
    updateThemePreview();
    eventThemePresetSelect.value = ''; // ручная правка любого поля снимает пометку "выбран пресет X" — сервер делает то же самое
    clearTimeout(themeSaveTimer);
    const widgetKey = currentThemeWidget;
    themeSaveTimer = setTimeout(() => { themeSaveTimer = null; saveWidgetTheme(widgetKey).catch(() => {}); }, 250);
  }

  /** Если есть отложенное сохранение — досылает его НЕМЕДЛЕННО (за старый виджет), прежде чем форма переключится на другой: иначе быстрое переключение виджетов роняло бы последнюю правку. */
  function flushPendingThemeSave() {
    if (!themeSaveTimer) return;
    clearTimeout(themeSaveTimer);
    themeSaveTimer = null;
    saveWidgetTheme(currentThemeWidget).catch(() => {});
  }

  Object.values(themeColorInputs).forEach((input) => input.addEventListener('input', scheduleThemeSave));
  themeFontInputs.titleFont.addEventListener('change', async () => {
    await populateFontWeightSelect(themeTitleFontWeight, themeFontInputs.titleFont.value, Number(themeTitleFontWeight.value));
    scheduleThemeSave();
  });
  themeFontInputs.dataFont.addEventListener('change', async () => {
    await populateFontWeightSelect(themeDataFontWeight, themeFontInputs.dataFont.value, Number(themeDataFontWeight.value));
    scheduleThemeSave();
  });
  themeTitleFontWeight.addEventListener('change', scheduleThemeSave);
  themeDataFontWeight.addEventListener('change', scheduleThemeSave);
  Object.entries(themeSliders).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      themeSliderValueEls[key].textContent = input.value + themeSliderUnits[key];
      scheduleThemeSave();
    });
  });
  themeBorderStyle.addEventListener('change', scheduleThemeSave);
  themeCornerStyle.addEventListener('change', () => {
    themeBorderRadiusLabel.textContent = themeCornerStyle.value === 'chamfer' ? 'Размер среза угла' : 'Скругление углов';
    themeChamferCornersField.style.display = themeCornerStyle.value === 'chamfer' ? '' : 'none';
    scheduleThemeSave();
  });
  Object.values(themeChamferInputs).forEach((input) => input.addEventListener('change', scheduleThemeSave));
  themeTextureEnabled.addEventListener('change', scheduleThemeSave);
  themeTextureType.addEventListener('change', scheduleThemeSave);

  eventThemePresetSelect.addEventListener('change', async () => {
    if (!eventThemePresetSelect.value) return; // выбрали пустой пункт "— выбрать пресет —" — ничего не делаем
    showEventThemeMessage('Применяем пресет…', '');
    try {
      const { ok, data } = await postJSON(`/api/event-theme/${currentThemeWidget}/preset`, { preset: eventThemePresetSelect.value });
      if (ok && data.success) {
        if (eventThemeData) eventThemeData.widgets[currentThemeWidget].theme = data.theme;
        applyEventThemeToForm(data.theme);
        showEventThemeMessage('Пресет применён — можно донастроить поля вручную.', 'success');
      } else {
        showEventThemeMessage((data && data.error) || 'Не удалось применить пресет.', 'error');
      }
    } catch (e) {
      showEventThemeMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnEventThemeSave.addEventListener('click', async () => {
    showEventThemeMessage('Сохраняем…', '');
    try {
      const { ok } = await saveWidgetTheme(currentThemeWidget);
      showEventThemeMessage(ok ? 'Тема сохранена и разослана, если включена для этого виджета.' : 'Не удалось сохранить.', ok ? 'success' : 'error');
    } catch (e) {
      showEventThemeMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  /* --- Список виджетов внизу: тумблер = включена ли тема для НЕГО, клик по строке = какой виджет показан в форме выше --- */
  function selectThemeWidget(key) {
    if (key === currentThemeWidget && eventThemeData) return; // уже выбран — переключать нечего
    flushPendingThemeSave();
    currentThemeWidget = key;
    document.querySelectorAll('.theme-widget-row').forEach((el) => { el.classList.toggle('active', el.dataset.widget === key); });
    themeActiveWidgetName.textContent = THEME_WIDGET_NAMES[key] || key;
    showEventThemeMessage('', '');
    if (eventThemeData && eventThemeData.widgets[key]) applyEventThemeToForm(eventThemeData.widgets[key].theme);
  }
  document.querySelectorAll('.theme-widget-row').forEach((row) => {
    row.addEventListener('click', () => selectThemeWidget(row.dataset.widget));
  });

  /* --- Экспорт/импорт настроек ОДНОГО виджета в файл (та самая кнопка «выгрузить настройки») ---
     Экспорт — целиком на клиенте (данные уже загружены в eventThemeData, серверный round-trip не нужен).
     Импорт читает выбранный файл и отправляет его содержимое через уже существующий /api/event-theme/:widget —
     отдельный серверный эндпоинт под это не нужен, это тот же самый "обновить тему виджета". */
  function exportWidgetTheme(key) {
    const entry = eventThemeData && eventThemeData.widgets[key];
    if (!entry) return;
    const blob = new Blob([JSON.stringify({ enabled: entry.enabled, theme: entry.theme }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theme-${key}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importWidgetTheme(key, file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (e) {
      showEventThemeMessage('Файл повреждён или это не JSON — экспортированный отсюда же файл откроется без проблем.', 'error');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.theme) {
      showEventThemeMessage('В файле нет поля theme — похоже, это не файл настроек виджета.', 'error');
      return;
    }
    try {
      const { ok, data } = await postJSON(`/api/event-theme/${key}`, { enabled: parsed.enabled, theme: parsed.theme });
      if (ok && data.success) {
        eventThemeData.widgets[key] = data.eventTheme.widgets[key];
        themeWidgetToggles[key].checked = data.eventTheme.widgets[key].enabled;
        if (key === currentThemeWidget) applyEventThemeToForm(data.eventTheme.widgets[key].theme);
        showEventThemeMessage(`Настройки загружены в «${THEME_WIDGET_NAMES[key] || key}».`, 'success');
      } else {
        showEventThemeMessage((data && data.error) || 'Не удалось применить загруженный файл.', 'error');
      }
    } catch (e) {
      showEventThemeMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }

  document.querySelectorAll('.theme-widget-row').forEach((row) => {
    const key = row.dataset.widget;
    const fileInput = row.querySelector('.theme-widget-import-input');
    row.querySelectorAll('.theme-widget-io-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // не переключаем редактируемый виджет — кнопки сами по себе, не выбор строки
        if (btn.dataset.io === 'export') exportWidgetTheme(key);
        else fileInput.click();
      });
    });
    fileInput.addEventListener('click', (e) => e.stopPropagation());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (file) await importWidgetTheme(key, file);
    });
  });
  Object.entries(themeWidgetToggles).forEach(([key, input]) => {
    input.addEventListener('change', async () => {
      try {
        const { ok, data } = await postJSON(`/api/event-theme/${key}`, { enabled: input.checked });
        if (ok && data.success && eventThemeData) eventThemeData.widgets[key].enabled = input.checked;
      } catch (e) {
        input.checked = !input.checked; // не сохранилось — откатываем визуально, чтобы тумблер не врал
      }
    });
  });

  /* --- Фон плашек (своя картинка/GIF/видео у КАЖДОГО виджета — сохраняется и грузится за currentThemeWidget) --- */
  const btnThemeBgUpload = document.getElementById('btnThemeBgUpload');
  const btnThemeBgRemove = document.getElementById('btnThemeBgRemove');
  const themeBgFileInput = document.getElementById('themeBgFileInput');
  const themeBgMessage = document.getElementById('themeBgMessage');
  const themeBgPreviewBox = document.getElementById('themeBgPreviewBox');
  const themeBgPreviewImg = document.getElementById('themeBgPreviewImg');
  const themeBgPreviewVideo = document.getElementById('themeBgPreviewVideo');
  const themeBgOpacity = document.getElementById('themeBgOpacity');
  const themeBgOpacityValue = document.getElementById('themeBgOpacityValue');
  const themeBgDarken = document.getElementById('themeBgDarken');
  const themeBgDarkenValue = document.getElementById('themeBgDarkenValue');
  const themeBgFit = document.getElementById('themeBgFit');

  function showThemeBgMessage(text, kind) {
    themeBgMessage.textContent = text;
    themeBgMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function applyThemeBgToForm(theme) {
    themeBgOpacity.value = theme.bgImageOpacity;
    themeBgOpacityValue.textContent = theme.bgImageOpacity + '%';
    themeBgDarken.value = theme.bgImageDarken;
    themeBgDarkenValue.textContent = theme.bgImageDarken + '%';
    themeBgFit.value = theme.bgImageFit;
    if (theme.bgImageUrl) {
      themeBgPreviewBox.style.display = 'flex';
      themeBgPreviewBox.style.alignItems = 'center';
      themeBgPreviewBox.style.justifyContent = 'center';
      const objectFit = theme.bgImageFit === 'stretch' ? 'fill' : theme.bgImageFit;
      if (/\.(mp4|webm)$/i.test(theme.bgImageUrl)) {
        themeBgPreviewVideo.src = theme.bgImageUrl;
        themeBgPreviewVideo.style.objectFit = objectFit;
        themeBgPreviewVideo.style.display = 'block';
        themeBgPreviewImg.style.display = 'none';
      } else {
        themeBgPreviewImg.src = theme.bgImageUrl;
        themeBgPreviewImg.style.objectFit = objectFit;
        themeBgPreviewImg.style.display = 'block';
        themeBgPreviewVideo.style.display = 'none';
      }
      themeBgPreviewBox.style.opacity = theme.bgImageOpacity / 100;
    } else {
      themeBgPreviewBox.style.display = 'none';
      themeBgPreviewImg.src = '';
      themeBgPreviewVideo.src = '';
    }
  }

  btnThemeBgUpload.addEventListener('click', () => themeBgFileInput.click());
  themeBgFileInput.addEventListener('change', async () => {
    const file = themeBgFileInput.files[0];
    themeBgFileInput.value = '';
    if (!file) return;
    showThemeBgMessage('Загружаем фон…', '');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/event-theme/${currentThemeWidget}/background/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        eventThemeData.widgets[currentThemeWidget] = data.eventTheme.widgets[currentThemeWidget];
        applyThemeBgToForm(data.eventTheme.widgets[currentThemeWidget].theme);
        showThemeBgMessage('Фон загружен.', 'success');
      } else {
        showThemeBgMessage((data && data.error) || 'Не удалось загрузить фон.', 'error');
      }
    } catch (e) {
      showThemeBgMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnThemeBgRemove.addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/event-theme/${currentThemeWidget}/background/remove`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        eventThemeData.widgets[currentThemeWidget] = data.eventTheme.widgets[currentThemeWidget];
        applyThemeBgToForm(data.eventTheme.widgets[currentThemeWidget].theme);
        showThemeBgMessage('Фон удалён.', 'success');
      }
    } catch (e) {
      showThemeBgMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  let themeBgSaveTimer = null;
  function scheduleThemeBgSave() {
    themeBgOpacityValue.textContent = themeBgOpacity.value + '%';
    themeBgDarkenValue.textContent = themeBgDarken.value + '%';
    themeBgPreviewBox.style.opacity = Number(themeBgOpacity.value) / 100;
    const objectFit = themeBgFit.value === 'stretch' ? 'fill' : themeBgFit.value;
    themeBgPreviewImg.style.objectFit = objectFit;
    themeBgPreviewVideo.style.objectFit = objectFit;
    clearTimeout(themeBgSaveTimer);
    const widgetKey = currentThemeWidget;
    themeBgSaveTimer = setTimeout(async () => {
      try {
        const { ok, data } = await postJSON(`/api/event-theme/${widgetKey}`, {
          theme: {
            bgImageOpacity: Number(themeBgOpacity.value),
            bgImageDarken: Number(themeBgDarken.value),
            bgImageFit: themeBgFit.value,
          },
        });
        if (ok && data.success) {
          eventThemeData.widgets[widgetKey] = data.eventTheme.widgets[widgetKey];
          if (widgetKey === currentThemeWidget) applyThemeBgToForm(data.eventTheme.widgets[widgetKey].theme);
        }
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 300);
  }
  [themeBgOpacity, themeBgDarken].forEach((el) => el.addEventListener('input', scheduleThemeBgSave));
  themeBgFit.addEventListener('change', scheduleThemeBgSave);

  async function loadEventTheme() {
    try {
      const res = await fetch('/api/event-theme');
      const data = await res.json();
      eventThemeData = data.eventTheme;
      Object.entries(themeWidgetToggles).forEach(([key, input]) => {
        input.checked = !!(eventThemeData.widgets[key] && eventThemeData.widgets[key].enabled);
      });
      document.querySelectorAll('.theme-widget-row').forEach((el) => { el.classList.toggle('active', el.dataset.widget === currentThemeWidget); });
      themeActiveWidgetName.textContent = THEME_WIDGET_NAMES[currentThemeWidget] || currentThemeWidget;
      if (eventThemeData.widgets[currentThemeWidget]) applyEventThemeToForm(eventThemeData.widgets[currentThemeWidget].theme);
    } catch (e) {
      // не критично — поля просто останутся пустыми, пока не подгрузятся
    }
  }
  loadEventTheme();

  /* ================================================================
     "Фон" — библиотека фонов трансляции (background.html)
  ================================================================ */

  const backgroundMessage = document.getElementById('backgroundMessage');
  const btnBackgroundUpload = document.getElementById('btnBackgroundUpload');
  const backgroundUploadInput = document.getElementById('backgroundUploadInput');
  const backgroundList = document.getElementById('backgroundList');
  const backgroundAutoRotate = document.getElementById('backgroundAutoRotate');
  const backgroundInterval = document.getElementById('backgroundInterval');
  const backgroundIntervalValue = document.getElementById('backgroundIntervalValue');
  const backgroundBlur = document.getElementById('backgroundBlur');
  const backgroundBlurValue = document.getElementById('backgroundBlurValue');
  const backgroundDarken = document.getElementById('backgroundDarken');
  const backgroundDarkenValue = document.getElementById('backgroundDarkenValue');
  const backgroundFitMode = document.getElementById('backgroundFitMode');
  const backgroundPreviewFrame = document.getElementById('backgroundPreviewFrame');

  let currentBackground = { activeFile: null, activeUrl: null, activeType: null, files: [], settings: { blur: 0, darken: 0, fitMode: 'cover', autoRotate: false, intervalMinutes: 5 } };

  function showBackgroundMessage(text, kind) {
    backgroundMessage.textContent = text;
    backgroundMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function escapeHtmlBackground(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function typeIcon(type) {
    if (type === 'video') return '🎬';
    if (type === 'gif') return '🎞️';
    return '🖼️';
  }

  function renderBackgroundList() {
    const files = currentBackground.files;
    if (!files.length) {
      backgroundList.innerHTML = '<p class="card-hint">Пока нет загруженных фонов — загрузи первый кнопкой выше.</p>';
      return;
    }
    backgroundList.innerHTML = '';
    files.forEach((bg) => {
      const isActive = bg.file === currentBackground.activeFile;
      const row = document.createElement('div');
      row.className = 'fact-preset-row';
      const thumb = bg.type === 'video'
        ? `<div style="width:48px;height:36px;display:flex;align-items:center;justify-content:center;background:#000;border-radius:4px;font-size:18px;">${typeIcon(bg.type)}</div>`
        : `<img src="${bg.url}" alt="" style="width:48px;height:36px;object-fit:cover;border-radius:4px;">`;
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
          ${thumb}
          <div class="fact-preset-row-text">
            <div class="fact-preset-row-title">${isActive ? '✓ ' : ''}${escapeHtmlBackground(bg.file)}</div>
            <div class="fact-preset-row-body">${bg.type}${isActive ? ' — активен сейчас' : ''}</div>
          </div>
        </div>
        <div class="fact-preset-row-actions">
          <button class="btn ${isActive ? 'btn-secondary' : 'btn-primary'}" type="button" ${isActive ? 'disabled' : ''}>Выбрать</button>
          <button class="btn-tiny" type="button">Удалить</button>
        </div>
      `;
      const [selectBtn, deleteBtn] = row.querySelectorAll('button');
      selectBtn.addEventListener('click', async () => {
        try {
          const { ok, data } = await postJSON('/api/background/select', { file: bg.file });
          if (ok && data.success) {
            applyBackgroundToForm(data.background);
            showBackgroundMessage(`Активный фон: ${bg.file}`, 'success');
          }
        } catch (e) {
          showBackgroundMessage('Сетевая ошибка при обращении к серверу.', 'error');
        }
      });
      deleteBtn.addEventListener('click', async () => {
        if (!await ui3Confirm(`Удалить фон «${bg.file}» навсегда?`)) return;
        try {
          const { ok, data } = await postJSON('/api/background/delete', { file: bg.file });
          if (ok && data.success) {
            applyBackgroundToForm(data.background);
            showBackgroundMessage('Фон удалён.', 'success');
          }
        } catch (e) {
          showBackgroundMessage('Сетевая ошибка при обращении к серверу.', 'error');
        }
      });
      backgroundList.appendChild(row);
    });
  }

  function applyBackgroundToForm(bg) {
    currentBackground = bg;
    renderBackgroundList();
    backgroundAutoRotate.checked = !!bg.settings.autoRotate;
    backgroundInterval.value = bg.settings.intervalMinutes;
    backgroundIntervalValue.textContent = bg.settings.intervalMinutes + ' мин';
    backgroundBlur.value = bg.settings.blur;
    backgroundBlurValue.textContent = bg.settings.blur + '%';
    backgroundDarken.value = bg.settings.darken;
    backgroundDarkenValue.textContent = bg.settings.darken + '%';
    backgroundFitMode.value = bg.settings.fitMode;
    updateBackgroundPreview();
  }

  function updateBackgroundPreview() {
    if (!backgroundPreviewFrame.contentWindow) return;
    const background = {
      activeType: currentBackground.activeType,
      activeUrl: currentBackground.activeUrl,
      settings: {
        blur: Number(backgroundBlur.value),
        darken: Number(backgroundDarken.value),
        fitMode: backgroundFitMode.value,
      },
    };
    backgroundPreviewFrame.contentWindow.postMessage({ type: 'background_preview_update', background }, '*');
  }

  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'background_preview_ready') updateBackgroundPreview();
  });

  let backgroundSettingsSaveTimer = null;
  function scheduleBackgroundSettingsSave() {
    updateBackgroundPreview();
    clearTimeout(backgroundSettingsSaveTimer);
    backgroundSettingsSaveTimer = setTimeout(async () => {
      try {
        const { ok, data } = await postJSON('/api/background/settings', {
          autoRotate: backgroundAutoRotate.checked,
          intervalMinutes: Number(backgroundInterval.value),
          blur: Number(backgroundBlur.value),
          darken: Number(backgroundDarken.value),
          fitMode: backgroundFitMode.value,
        });
        if (ok && data.success) currentBackground.settings = data.settings;
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 250);
  }

  backgroundAutoRotate.addEventListener('change', scheduleBackgroundSettingsSave);
  backgroundInterval.addEventListener('input', () => {
    backgroundIntervalValue.textContent = backgroundInterval.value + ' мин';
    scheduleBackgroundSettingsSave();
  });
  backgroundBlur.addEventListener('input', () => {
    backgroundBlurValue.textContent = backgroundBlur.value + '%';
    scheduleBackgroundSettingsSave();
  });
  backgroundDarken.addEventListener('input', () => {
    backgroundDarkenValue.textContent = backgroundDarken.value + '%';
    scheduleBackgroundSettingsSave();
  });
  backgroundFitMode.addEventListener('change', scheduleBackgroundSettingsSave);

  btnBackgroundUpload.addEventListener('click', () => backgroundUploadInput.click());
  backgroundUploadInput.addEventListener('change', async () => {
    const file = backgroundUploadInput.files[0];
    backgroundUploadInput.value = '';
    if (!file) return;
    showBackgroundMessage('Загружаем фон…', '');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/background/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        applyBackgroundToForm(data.background);
        showBackgroundMessage('Фон загружен и добавлен в библиотеку.', 'success');
      } else {
        showBackgroundMessage((data && data.error) || 'Не удалось загрузить фон.', 'error');
      }
    } catch (e) {
      showBackgroundMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  async function loadBackground() {
    try {
      const res = await fetch('/api/background');
      const data = await res.json();
      applyBackgroundToForm(data.background);
    } catch (e) {
      // не критично — поля просто останутся дефолтными, пока не подгрузятся
    }
  }
  loadBackground();

  // Пока открыта вкладка "Фон", подтягиваем актуальное состояние раз в 5
  // секунд — так видно, когда сервер сам переключил фон по автосмене (сама
  // смена приходит и мгновенно через WebSocket на background.html, но
  // список/подсветку активного файла в АДМИНКЕ проще досверять поллингом,
  // чем заводить для неё отдельный WS-канал ради одной галочки "✓ активен").
  setInterval(() => {
    if (eventAccordionPanels.background.style.display !== 'none') loadBackground();
  }, 5000);

  setInterval(() => {
    if (eventAccordionPanels.background.style.display !== 'none') updateBackgroundPreview();
  }, 400);

  /* ================================================================
     "Турнирная сетка" — редактор: три перетаскиваемые/растягиваемые
     панели (Матчи / Решающие матчи / Турнирная таблица), тот же
     drag-and-resize механизм, что и у "Виджетов оверлея" (SCENE_W/H,
     snap, normalizeRect — см. секцию виджетов оверлея выше в этом файле).
  ================================================================ */

  const BRACKET_SCENE_W = 1920, BRACKET_SCENE_H = 1080, BRACKET_MIN_SIZE = 100;

  const bracketMessage = document.getElementById('bracketMessage');
  const bracketPreviewGroupLabel = document.getElementById('bracketPreviewGroupLabel');
  const bracketPreviewMatchesTitle = document.getElementById('bracketPreviewMatchesTitle');
  const bracketPreviewGroupGrid = document.getElementById('bracketPreviewGroupGrid');
  const bracketPreviewStandingsBody = document.getElementById('bracketPreviewStandingsBody');
  const bracketPreviewPlayoffBoxes = document.getElementById('bracketPreviewPlayoffBoxes');
  const bracketPreviewPlayoffTitle = document.getElementById('bracketPreviewPlayoffTitle');
  const bracketPreviewStandingsTitle = document.getElementById('bracketPreviewStandingsTitle');
  const bracketPreviewDeUpper = document.getElementById('bracketPreviewDeUpper');
  const bracketPreviewDeLower = document.getElementById('bracketPreviewDeLower');
  const bracketPreviewDeFinal = document.getElementById('bracketPreviewDeFinal');
  const bracketFormat = document.getElementById('bracketFormat');
  const bracketDoubleHint = document.getElementById('bracketDoubleHint');
  const bracketFinalBo3Field = document.getElementById('bracketFinalBo3Field');
  const bracketMatchesTitleField = document.getElementById('bracketMatchesTitleField');
  const bracketTeamList = document.getElementById('bracketTeamList');
  const bracketTeamLogoInput = document.getElementById('bracketTeamLogoInput');
  const bracketTeamCount = document.getElementById('bracketTeamCount');
  const bracketGroupLabelInput = document.getElementById('bracketGroupLabelInput');
  const bracketMatchesTitleInput = document.getElementById('bracketMatchesTitleInput');
  const bracketFinalBo3 = document.getElementById('bracketFinalBo3');
  const btnBracketFinalResetGames = document.getElementById('btnBracketFinalResetGames');
  const btnBracketGenerate = document.getElementById('btnBracketGenerate');
  const btnBracketSave = document.getElementById('btnBracketSave');
  const btnBracketLoad = document.getElementById('btnBracketLoad');
  const btnBracketClear = document.getElementById('btnBracketClear');
  const btnBracketResetSeeding = document.getElementById('btnBracketResetSeeding');

  const bracketSizeInputs = {
    nameFontSize: document.getElementById('bracketSizeNameFont'),
    scoreFontSize: document.getElementById('bracketSizeScoreFont'),
    tableFontSize: document.getElementById('bracketSizeTableFont'),
    columns: document.getElementById('bracketSizeColumns'),
    plateMaxWidth: document.getElementById('bracketSizePlateMaxWidth'),
    panelPadding: document.getElementById('bracketSizePanelPadding'),
    platePadding: document.getElementById('bracketSizePlatePadding'),
    plateInnerGap: document.getElementById('bracketSizePlateInnerGap'),
    plateHeight: document.getElementById('bracketSizePlateHeight'),
    logoSize: document.getElementById('bracketSizeLogo'),
    gapY: document.getElementById('bracketSizeGapY'),
    gapX: document.getElementById('bracketSizeGapX'),
    tableRowHeight: document.getElementById('bracketSizeTableRowHeight'),
    tableRowGap: document.getElementById('bracketSizeTableRowGap'),
  };
  const bracketOpacitySlider = document.getElementById('bracketSizePanelOpacity');
  const bracketOpacityValueEl = document.getElementById('bracketSizePanelOpacityValue');
  const bracketPulseSlider = document.getElementById('bracketSizePulseSpeed');
  const bracketPulseValueEl = document.getElementById('bracketSizePulseSpeedValue');
  const btnBracketSaveDefaults = document.getElementById('btnBracketSaveDefaults');

  const bracketColorInputs = {
    bgColor: document.getElementById('bracketColorBg'),
    textColor: document.getElementById('bracketColorText'),
    titleColor: document.getElementById('bracketColorTitle'),
    borderColor: document.getElementById('bracketColorBorder'),
    accentColor: document.getElementById('bracketColorAccent'),
    winColor: document.getElementById('bracketColorWin'),
    loseColor: document.getElementById('bracketColorLose'),
  };
  const bracketFontTitle = document.getElementById('bracketFontTitle');
  const bracketFontData = document.getElementById('bracketFontData');
  const bracketWeightTitle = document.getElementById('bracketWeightTitle');
  const bracketWeightData = document.getElementById('bracketWeightData');

  // --- Раскладка панелей ---
  const bracketPanelsFrame = document.getElementById('bracketPanelsFrame');
  const bracketPanelsScene = document.getElementById('bracketPanelsScene');
  const bracketPanelFieldsTitle = document.getElementById('bracketPanelFieldsTitle');
  const bracketPanelFieldX = document.getElementById('bracketPanelFieldX');
  const bracketPanelFieldY = document.getElementById('bracketPanelFieldY');
  const bracketPanelFieldW = document.getElementById('bracketPanelFieldW');
  const bracketPanelFieldH = document.getElementById('bracketPanelFieldH');
  const bracketPreviewPanels = {
    matches: document.getElementById('bracketPreviewPanelMatches'),
    playoff: document.getElementById('bracketPreviewPanelPlayoff'),
    standings: document.getElementById('bracketPreviewPanelStandings'),
  };
  const bracketPanelEnableInputs = {
    matches: document.getElementById('bracketPanelEnableMatches'),
    playoff: document.getElementById('bracketPanelEnablePlayoff'),
    standings: document.getElementById('bracketPanelEnableStandings'),
  };
  const BRACKET_PANEL_LABELS_RR = { matches: 'Матчи', playoff: 'Решающие матчи', standings: 'Турнирная таблица' };
  const BRACKET_PANEL_LABELS_DE = { matches: 'Верхняя сетка', playoff: 'Гранд-финал', standings: 'Нижняя сетка' };
  function bracketPanelLabels() { return bracketState.mode === 'double' ? BRACKET_PANEL_LABELS_DE : BRACKET_PANEL_LABELS_RR; }
  let selectedPanelId = null;
  let bracketPanelScale = 1;

  let bracketState = { mode: 'roundrobin', teamCount: 0, teams: [], nodes: [], connections: [], sizeSettings: {}, colorSettings: {}, panelLayout: {}, themeOverlay: null, groupLabel: '' };
  let bracketPendingLogoTeamId = null;
  let bracketLastMode = null;

  function showBracketMessage(text, kind) {
    bracketMessage.textContent = text;
    bracketMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }
  function escapeHtmlBracket(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function bracketTeamById(id) { return bracketState.teams.find((t) => t.id === id) || null; }
  function bracketLogoHtml(team) { return team && team.logoUrl ? `<img src="${team.logoUrl}" alt="">` : `<div class="bracket-logo-placeholder"></div>`; }
  /** Плашка одной команды — общая для матчей группы и плей-офф (раньше были две почти одинаковые версии кода).
      data-team-id/data-match-id нужны для навешивания кликов ниже — placeholder используется только в плей-офф,
      пока соперник ещё не определился по итогам группы/предыдущего матча. */
  async function setBracketMatchWinner(matchId, winnerTeamId) {
    try {
      const { ok, data } = await postJSON(`/api/bracket/match/${matchId}/result`, { winnerTeamId });
      if (ok && data.success) { bracketState = data.bracket; renderBracketContent(); }
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }

  function renderBracketMatchPlate(node, teamId, isWinner, isLoser, placeholderLabel) {
    const team = bracketTeamById(teamId);
    if (!team) return `<div class="bracket-match-plate bracket-row-empty">${bracketLogoHtml(null)}<span class="bracket-team-name bracket-tbd">${escapeHtmlBracket(placeholderLabel || '—')}</span></div>`;
    const rowClass = isWinner ? 'bracket-row-winner' : isLoser ? 'bracket-row-loser' : '';
    const badge = isWinner ? 'W' : isLoser ? 'L' : '';
    return `<div class="bracket-match-plate ${rowClass}" data-match-id="${node.id}" data-team-id="${team.id}">${bracketLogoHtml(team)}<span class="bracket-team-name">${escapeHtmlBracket(team.name)}</span>${badge ? `<span class="bracket-team-badge">${badge}</span>` : ''}</div>`;
  }

  /* ---------- Панель "Матчи" — группа "все против всех" ---------- */
  function renderBracketGroupGrid() {
    const groupMatches = bracketState.nodes.filter((n) => n.bracket === 'roundrobin' || n.bracket === 'winners');
    bracketPreviewGroupGrid.innerHTML = '';
    groupMatches.forEach((node) => {
      const el = document.createElement('div');
      el.className = 'bracket-match-row';
      el.innerHTML = `${renderBracketMatchPlate(node, node.teamAId, node.winnerId === node.teamAId, node.loserId === node.teamAId)}<span class="bracket-match-vs">VS</span>${renderBracketMatchPlate(node, node.teamBId, node.winnerId === node.teamBId, node.loserId === node.teamBId)}`;
      bracketPreviewGroupGrid.appendChild(el);
      el.querySelectorAll('[data-team-id]').forEach((rowEl) => {
        if (node.winnerId) return;
        const teamId = rowEl.dataset.teamId;
        rowEl.addEventListener('click', (evt) => { evt.stopPropagation(); setBracketMatchWinner(node.id, teamId); });
        rowEl.style.pointerEvents = 'auto'; // сама панель pointer-events:none (см. CSS) — включаем обратно только на кликабельных строках
        rowEl.style.cursor = 'pointer';
      });
    });
  }

  /* ---------- Панель "Турнирная таблица" ---------- */
  // Те же 3 очка за победу / 1 за поражение и та же сортировка, что и на сервере (bracketData.js) и в самом
  // виджете (public/bracket.js) — держим в трёх местах умышленно, но значения должны совпадать буква в букву.
  function computeBracketStandings() {
    const stats = new Map();
    bracketState.teams.forEach((t) => stats.set(t.id, { team: t, wins: 0, losses: 0, points: 0 }));
    bracketState.nodes.forEach((n) => {
      if ((n.bracket !== 'roundrobin' && n.bracket !== 'winners') || !n.winnerId) return;
      if (stats.has(n.winnerId)) { stats.get(n.winnerId).wins += 1; stats.get(n.winnerId).points += 3; }
      if (stats.has(n.loserId)) { stats.get(n.loserId).losses += 1; stats.get(n.loserId).points += 1; }
    });
    return Array.from(stats.values()).sort((a, b) => (b.points - a.points) || (b.wins - a.wins));
  }
  function renderBracketStandings() {
    bracketPreviewStandingsBody.innerHTML = computeBracketStandings().map((s, i) => `
      <tr><td>${i + 1}</td><td>${escapeHtmlBracket(s.team.name)}</td><td>${s.wins}–${s.losses}</td><td>${s.points}</td></tr>
    `).join('');
  }

  /* ---------- Панель "Решающие матчи" (плей-офф) ---------- */
  function attachBracketPlayoffRowClicks(container, node) {
    if (node.winnerId) return;
    const isBo3Final = node.playoffSlot === 'final' && bracketState.finalFormat === 'bo3';
    container.querySelectorAll('[data-team-id]').forEach((rowEl) => {
      rowEl.addEventListener('click', (evt) => {
        evt.stopPropagation();
        if (isBo3Final) addBracketFinalGameWin(rowEl.dataset.teamId); // BO3: клик = +1 победа в серии (см. addBracketFinalGameWin выше)
        else setBracketMatchWinner(node.id, rowEl.dataset.teamId); // как и раньше — клик сразу назначает победителя матча
      });
      rowEl.style.pointerEvents = 'auto';
      rowEl.style.cursor = 'pointer';
    });
  }
  function renderBracketPlayoff() {
    const matchForFinal = bracketState.nodes.find((n) => n.playoffSlot === 'match_for_final');
    const final = bracketState.nodes.find((n) => n.playoffSlot === 'final');
    bracketPreviewPlayoffBoxes.innerHTML = '';
    if (matchForFinal) {
      const box = document.createElement('div');
      box.className = 'bracket-playoff-box' + (matchForFinal.teamAId && matchForFinal.teamBId && !matchForFinal.winnerId ? ' bracket-match-current' : '');
      box.innerHTML = `<h5>МАТЧ ЗА ФИНАЛ</h5><div class="bracket-match-row">${renderBracketMatchPlate(matchForFinal, matchForFinal.teamAId, matchForFinal.winnerId === matchForFinal.teamAId, matchForFinal.loserId === matchForFinal.teamAId, '2-е место группы')}<span class="bracket-match-vs">VS</span>${renderBracketMatchPlate(matchForFinal, matchForFinal.teamBId, matchForFinal.winnerId === matchForFinal.teamBId, matchForFinal.loserId === matchForFinal.teamBId, '3-е место группы')}</div>`;
      bracketPreviewPlayoffBoxes.appendChild(box);
      attachBracketPlayoffRowClicks(box, matchForFinal);
    }
    if (final) {
      const box = document.createElement('div');
      box.className = 'bracket-playoff-box' + (final.teamAId && final.teamBId && !final.winnerId ? ' bracket-match-current' : '');
      const isBo3 = bracketState.finalFormat === 'bo3';
      const title = isBo3 && !final.winnerId ? `ФИНАЛ · BO3 (${final.scoreA || 0}:${final.scoreB || 0})` : 'ФИНАЛ';
      box.innerHTML = `<h5>${escapeHtmlBracket(title)}</h5><div class="bracket-match-row">${renderBracketMatchPlate(final, final.teamAId, final.winnerId === final.teamAId, final.loserId === final.teamAId, '1-е место группы')}<span class="bracket-match-vs">VS</span>${renderBracketMatchPlate(final, final.teamBId, final.winnerId === final.teamBId, final.loserId === final.teamBId, 'Победитель матча за финал')}</div>`;
      bracketPreviewPlayoffBoxes.appendChild(box);
      attachBracketPlayoffRowClicks(box, final);
    }
  }

  /** Double Elimination: отдельная отрисовка (public/bracket-de.js, общая с виджетом OBS). Клик по плашке — победитель, правая кнопка по сыгранному матчу — отмена результата. */
  async function resetBracketMatchResult(matchId) {
    if (!await ui3Confirm('Отменить результат этого матча? Всё, что из него вытекало (дальнейшие матчи этих команд), тоже будет сброшено.')) return;
    try {
      const { ok, data } = await postJSON(`/api/bracket/match/${matchId}/reset`, {});
      if (ok && data.success) { bracketState = data.bracket; renderBracketContent(); }
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }
  function renderBracketContentDouble() {
    bracketPreviewMatchesTitle.textContent = window.BracketDE.TITLES.upper;
    bracketPreviewPlayoffTitle.textContent = window.BracketDE.TITLES.final;
    bracketPreviewStandingsTitle.textContent = window.BracketDE.TITLES.lower;
    window.BracketDE.render({
      bracket: bracketState, upperEl: bracketPreviewDeUpper, lowerEl: bracketPreviewDeLower, finalEl: bracketPreviewDeFinal, esc: escapeHtmlBracket,
      interactive: { onPick: (matchId, teamId) => setBracketMatchWinner(matchId, teamId), onReset: resetBracketMatchResult },
    });
  }

  function renderBracketContent() {
    const isDouble = bracketState.mode === 'double';
    bracketPanelsScene.classList.toggle('de-mode', isDouble);
    bracketDoubleHint.style.display = isDouble ? '' : 'none';
    bracketFinalBo3Field.style.display = isDouble ? 'none' : '';
    bracketMatchesTitleField.style.display = isDouble ? 'none' : '';
    Object.entries(bracketPanelLabels()).forEach(([id, label]) => {
      const row = document.querySelector(`.widget-row[data-panel-id="${id}"] .widget-row-label`);
      if (row) row.textContent = label;
    });
    bracketPreviewGroupLabel.textContent = bracketState.groupLabel || '';
    if (isDouble) { renderBracketContentDouble(); return; }
    bracketPreviewMatchesTitle.textContent = bracketState.matchesTitle || 'Матчи';
    bracketPreviewPlayoffTitle.textContent = 'Решающие матчи';
    bracketPreviewStandingsTitle.textContent = 'Турнирная таблица';
    renderBracketGroupGrid();
    renderBracketStandings();
    renderBracketPlayoff();
  }

  /**
   * Рендер сетки (цвета/шрифты/размеры + содержимое трёх панелей) —
   * вызывается после КАЖДОГО изменения данных, включая ответ на сохранение
   * имени команды. НЕ трогает список команд ниже — см. renderBracketTeamList().
   */
  function renderBracketGrid() {
    const s = bracketState.sizeSettings;
    const root = document.documentElement.style;
    root.setProperty('--bracket-editor-logo', s.logoSize + 'px');
    root.setProperty('--bracket-editor-name', s.nameFontSize + 'px');
    root.setProperty('--bracket-editor-score', s.scoreFontSize + 'px');
    root.setProperty('--bracket-editor-table', s.tableFontSize + 'px');
    root.setProperty('--bracket-editor-columns', s.columns);
    root.setProperty('--bracket-editor-plate-max-width', (s.plateMaxWidth > 0 ? s.plateMaxWidth : 100000) + 'px'); // 0 = без ограничения
    root.setProperty('--bracket-editor-panel-padding', s.panelPadding + 'px');
    root.setProperty('--bracket-editor-plate-padding', s.platePadding + 'px');
    root.setProperty('--bracket-editor-plate-gap', s.plateInnerGap + 'px');
    root.setProperty('--bracket-editor-plate-height', s.plateHeight + 'px');
    root.setProperty('--bracket-editor-gap-x', s.gapX + 'px');
    root.setProperty('--bracket-editor-gap-y', s.gapY + 'px');
    root.setProperty('--bracket-editor-table-row-h', s.tableRowHeight + 'px');
    root.setProperty('--bracket-editor-table-row-gap', s.tableRowGap + 'px');
    root.setProperty('--bracket-editor-panel-opacity', s.panelOpacity / 100);
    root.setProperty('--bracket-editor-pulse-speed', s.pulseSpeed + 'ms');

    const overlay = bracketState.themeOverlay;
    const c = bracketState.colorSettings;
    if (c) {
      root.setProperty('--bracket-editor-bg', overlay ? overlay.cardFillStart : c.bgColor);
      root.setProperty('--bracket-editor-text', overlay ? overlay.themeTextColor : c.textColor);
      root.setProperty('--bracket-editor-title-color', overlay ? overlay.themeTextColor : c.titleColor);
      root.setProperty('--bracket-editor-border', overlay ? overlay.cardBorderStart : c.borderColor);
      root.setProperty('--bracket-editor-accent', overlay ? overlay.cardBorderEnd : c.accentColor); // БАГ из раздела 59: тут оставался overlay.themeGlowColor — поле убрано вместе со свечением темы, попутно чиню и здесь
      root.setProperty('--bracket-editor-win-color', c.winColor);
      root.setProperty('--bracket-editor-lose-color', c.loseColor);
      root.setProperty('--bracket-editor-title-font', `'${overlay ? overlay.themeTitleFont : c.titleFont}', system-ui, sans-serif`);
      root.setProperty('--bracket-editor-data-font', `'${overlay ? overlay.themeDataFont : c.dataFont}', system-ui, sans-serif`);
      root.setProperty('--bracket-editor-title-weight', overlay ? overlay.themeTitleFontWeight : c.titleFontWeight);
      root.setProperty('--bracket-editor-data-weight', overlay ? overlay.themeDataFontWeight : c.dataFontWeight);
    }

    if (bracketState.mode !== bracketLastMode) { // подставляем формат в выпадающий список только когда он реально сменился (загрузка/генерация), чтобы не затирать выбор, ещё не применённый кнопкой «Сгенерировать»
      bracketLastMode = bracketState.mode;
      if (bracketState.mode === 'double' || bracketState.mode === 'roundrobin') bracketFormat.value = bracketState.mode;
    }
    renderBracketContent();
    applyPanelLayoutToPreview();
  }

  /* ---------- Раскладка панелей: drag/resize (тот же принцип, что у "Виджетов оверлея") ---------- */

  const BRACKET_PANEL_REFERENCE = {
    matches: { w: 1000, h: 700 },
    playoff: { w: 760, h: 500 },
    standings: { w: 1000, h: 240 },
  };
  // Эталонные размеры панелей Double Elimination (= её раскладка по умолчанию, DEFAULT_PANEL_LAYOUT_DE в bracketData.js)
  const BRACKET_PANEL_REFERENCE_DE = {
    matches: { w: 1380, h: 480 },
    playoff: { w: 380, h: 480 },
    standings: { w: 1380, h: 440 },
  };
  function bracketPanelReference(id) { return (bracketState.mode === 'double' ? BRACKET_PANEL_REFERENCE_DE : BRACKET_PANEL_REFERENCE)[id]; }
  const bracketPanelResizeObservers = {};
  function setupBracketPanelScaleObserver(id) {
    if (bracketPanelResizeObservers[id]) return;
    const el = bracketPreviewPanels[id];
    bracketPanelResizeObservers[id] = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      const ref = bracketPanelReference(id); // эталон зависит от формата — читаем в момент пересчёта
      const scale = Math.min(width / ref.w, height / ref.h);
      el.style.setProperty('--panel-scale', scale.toFixed(3));
    });
    bracketPanelResizeObservers[id].observe(el);
  }

  function computeBracketPanelScale() {
    bracketPanelScale = bracketPanelsFrame.clientWidth / BRACKET_SCENE_W;
    bracketPanelsScene.style.transform = `scale(${bracketPanelScale})`;
    bracketPanelsFrame.style.height = (BRACKET_SCENE_H * bracketPanelScale) + 'px';
  }
  window.addEventListener('resize', computeBracketPanelScale);

  function applyPanelLayoutToPreview() {
    const layout = bracketState.panelLayout;
    if (!layout) return;
    Object.entries(bracketPreviewPanels).forEach(([id, el]) => {
      const rect = layout[id];
      if (!rect) return;
      el.dataset.enabled = rect.enabled !== false ? 'true' : 'false';
      el.style.left = rect.x + 'px';
      el.style.top = rect.y + 'px';
      el.style.width = rect.w + 'px';
      el.style.height = rect.h + 'px';
      el.classList.toggle('selected', selectedPanelId === id);
      setupBracketPanelScaleObserver(id);
      // при смене формата размер панели мог не измениться (наблюдатель молчит), а эталон — другой: пересчитываем масштаб сами
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        const ref = bracketPanelReference(id);
        el.style.setProperty('--panel-scale', Math.min(el.clientWidth / ref.w, el.clientHeight / ref.h).toFixed(3));
      }
    });
    if (bracketPanelEnableInputs.matches) {
      Object.entries(bracketPanelEnableInputs).forEach(([id, input]) => { if (layout[id]) input.checked = layout[id].enabled !== false; });
    }
  }

  function normalizeBracketPanelRect(rect) {
    let { x, y, w, h } = rect;
    w = Math.max(BRACKET_MIN_SIZE, Math.min(w, BRACKET_SCENE_W));
    h = Math.max(BRACKET_MIN_SIZE, Math.min(h, BRACKET_SCENE_H));
    x = Math.max(0, Math.min(x, BRACKET_SCENE_W - w));
    y = Math.max(0, Math.min(y, BRACKET_SCENE_H - h));
    return { x, y, w, h };
  }

  function updateBracketPanelFieldsFromSelected() {
    const disabled = !selectedPanelId;
    [bracketPanelFieldX, bracketPanelFieldY, bracketPanelFieldW, bracketPanelFieldH].forEach((f) => { f.disabled = disabled; });
    if (!selectedPanelId) {
      bracketPanelFieldsTitle.textContent = 'Выберите панель на сцене';
      bracketPanelFieldX.value = bracketPanelFieldY.value = bracketPanelFieldW.value = bracketPanelFieldH.value = '';
      return;
    }
    const rect = bracketState.panelLayout[selectedPanelId];
    bracketPanelFieldsTitle.textContent = bracketPanelLabels()[selectedPanelId];
    bracketPanelFieldX.value = rect.x;
    bracketPanelFieldY.value = rect.y;
    bracketPanelFieldW.value = rect.w;
    bracketPanelFieldH.value = rect.h;
  }

  function selectBracketPanel(id) {
    selectedPanelId = id;
    Object.entries(bracketPreviewPanels).forEach(([pid, el]) => el.classList.toggle('selected', pid === id));
    updateBracketPanelFieldsFromSelected();
  }

  let bracketPanelLayoutSaveTimer = null;
  function scheduleBracketPanelLayoutSave() {
    clearTimeout(bracketPanelLayoutSaveTimer);
    bracketPanelLayoutSaveTimer = setTimeout(async () => {
      try {
        const { ok, data } = await postJSON('/api/bracket/panel-layout', { panelLayout: bracketState.panelLayout });
        if (ok && data.success) bracketState = data.bracket;
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 300);
  }

  let bracketPanelDragMode = null; // 'move' | 'resize' | null
  let bracketPanelDragStartMouse = { x: 0, y: 0 };
  let bracketPanelDragStartRect = null;
  let bracketPanelDragId = null;

  bracketPanelsScene.addEventListener('mousedown', (e) => {
    const panelEl = e.target.closest('.bracket-panel');
    if (!panelEl) return;
    const id = panelEl.dataset.panelId;
    selectBracketPanel(id);
    bracketPanelDragId = id;
    bracketPanelDragStartMouse = { x: e.clientX, y: e.clientY };
    bracketPanelDragStartRect = { ...bracketState.panelLayout[id] };
    bracketPanelDragMode = e.target.classList.contains('resize-handle') ? 'resize' : 'move';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!bracketPanelDragMode || !bracketPanelDragId) return;
    const dx = (e.clientX - bracketPanelDragStartMouse.x) / bracketPanelScale;
    const dy = (e.clientY - bracketPanelDragStartMouse.y) / bracketPanelScale;
    let rect;
    if (bracketPanelDragMode === 'move') {
      rect = { x: Math.round(bracketPanelDragStartRect.x + dx), y: Math.round(bracketPanelDragStartRect.y + dy), w: bracketPanelDragStartRect.w, h: bracketPanelDragStartRect.h };
    } else {
      rect = { x: bracketPanelDragStartRect.x, y: bracketPanelDragStartRect.y, w: Math.round(bracketPanelDragStartRect.w + dx), h: Math.round(bracketPanelDragStartRect.h + dy) };
    }
    rect = normalizeBracketPanelRect(rect);
    bracketState.panelLayout[bracketPanelDragId] = { ...bracketState.panelLayout[bracketPanelDragId], ...rect };
    applyPanelLayoutToPreview();
    if (selectedPanelId === bracketPanelDragId) updateBracketPanelFieldsFromSelected();
  });
  document.addEventListener('mouseup', () => {
    if (bracketPanelDragMode) scheduleBracketPanelLayoutSave();
    bracketPanelDragMode = null;
    bracketPanelDragId = null;
  });

  [[bracketPanelFieldX, 'x'], [bracketPanelFieldY, 'y'], [bracketPanelFieldW, 'w'], [bracketPanelFieldH, 'h']].forEach(([input, key]) => {
    input.addEventListener('input', () => {
      if (!selectedPanelId) return;
      const rect = { ...bracketState.panelLayout[selectedPanelId] };
      rect[key] = Number(input.value) || 0;
      bracketState.panelLayout[selectedPanelId] = { ...bracketState.panelLayout[selectedPanelId], ...normalizeBracketPanelRect(rect) };
      applyPanelLayoutToPreview();
      scheduleBracketPanelLayoutSave();
    });
  });

  Object.entries(bracketPanelEnableInputs).forEach(([id, input]) => {
    input.addEventListener('change', () => {
      bracketState.panelLayout[id] = { ...bracketState.panelLayout[id], enabled: input.checked };
      if (!input.checked && selectedPanelId === id) { selectedPanelId = null; updateBracketPanelFieldsFromSelected(); }
      applyPanelLayoutToPreview();
      scheduleBracketPanelLayoutSave();
    });
  });

  /* ---------- Модалка "Заполнить слот" --- (не используется в текущей версии, слоты заполняются через список команд ниже) */

  function applyBracketColorSettingsToForm() {
    const c = bracketState.colorSettings;
    if (!c) return;
    Object.entries(bracketColorInputs).forEach(([key, input]) => { input.value = c[key]; });
    bracketFontTitle.value = c.titleFont;
    bracketFontData.value = c.dataFont;
    bracketWeightTitle.value = c.titleFontWeight;
    bracketWeightData.value = c.dataFontWeight;
  }

  function applyBracketSizeSettingsToForm() {
    const s = bracketState.sizeSettings;
    if (!s) return;
    Object.entries(bracketSizeInputs).forEach(([key, input]) => { input.value = s[key]; });
    bracketOpacitySlider.value = s.panelOpacity;
    bracketPulseSlider.value = s.pulseSpeed;
    bracketPulseValueEl.textContent = s.pulseSpeed + ' мс';
    bracketOpacityValueEl.textContent = s.panelOpacity + '%';
  }

  btnBracketGenerate.addEventListener('click', async () => {
    const mode = bracketFormat.value === 'double' ? 'double' : 'roundrobin';
    const teamCount = mode === 'double'
      ? Math.max(4, Math.min(16, Math.round(Number(bracketTeamCount.value) || 4)))
      : Math.max(3, Math.min(32, Math.round(Number(bracketTeamCount.value) || 3)));
    bracketTeamCount.value = teamCount;
    if (bracketState.nodes.length && !await ui3Confirm('Сгенерировать новую сетку? Текущая (если не сохранена) будет потеряна.')) return;
    showBracketMessage('Генерируем…', '');
    try {
      const { ok, data } = await postJSON('/api/bracket/generate', { mode, teamCount });
      if (ok && data.success) {
        bracketState = data.bracket;
        bracketGroupLabelInput.value = bracketState.groupLabel || '';
        bracketMatchesTitleInput.value = bracketState.matchesTitle || 'Матчи';
        bracketFinalBo3.checked = bracketState.finalFormat === 'bo3';
        applyBracketColorSettingsToForm();
        applyBracketSizeSettingsToForm();
        renderBracketGrid();
        renderBracketTeamList();
        showBracketMessage(`Сетка на ${bracketState.teamCount} команд сгенерирована.`, 'success');
      }
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  btnBracketResetSeeding.addEventListener('click', async () => {
    if (!await ui3Confirm('Вернуть все команды на исходные места (как при генерации)? Результаты всех матчей будут сброшены.')) return;
    try {
      const { ok, data } = await postJSON('/api/bracket/reset-seeding', {});
      if (ok && data.success) { bracketState = data.bracket; renderBracketGrid(); renderBracketTeamList(); showBracketMessage('Расположение возвращено к исходному.', 'success'); }
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  /* ---------- Размеры ---------- */
  let bracketSizeSaveTimer = null;
  function scheduleBracketSizeSave() {
    bracketState.sizeSettings = Object.fromEntries(Object.entries(bracketSizeInputs).map(([key, input]) => [key, Number(input.value) || 0]));
    bracketState.sizeSettings.panelOpacity = Number(bracketOpacitySlider.value);
    bracketOpacityValueEl.textContent = bracketOpacitySlider.value + '%';
    bracketState.sizeSettings.pulseSpeed = Number(bracketPulseSlider.value);
    bracketPulseValueEl.textContent = bracketPulseSlider.value + ' мс';
    renderBracketGrid();
    clearTimeout(bracketSizeSaveTimer);
    bracketSizeSaveTimer = setTimeout(async () => {
      try {
        const { ok, data } = await postJSON('/api/bracket/size-settings', bracketState.sizeSettings);
        if (ok && data.success) {
          bracketState = data.bracket;
          Object.entries(bracketSizeInputs).forEach(([key, input]) => { input.value = bracketState.sizeSettings[key]; });
        }
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 300);
  }
  Object.values(bracketSizeInputs).forEach((input) => input.addEventListener('input', scheduleBracketSizeSave));
  bracketOpacitySlider.addEventListener('input', scheduleBracketSizeSave);
  bracketPulseSlider.addEventListener('input', scheduleBracketSizeSave);

  btnBracketSaveDefaults.addEventListener('click', async () => {
    try {
      await postJSON('/api/bracket/size-defaults', {});
      await postJSON('/api/bracket/panel-layout-defaults', {});
      showBracketMessage('Текущие размеры и раскладка панелей сохранены как дефолтные.', 'success');
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  /* ---------- Цвет и шрифт (локальные — пока тема не применена к сетке) ---------- */
  let bracketColorSaveTimer = null;
  function scheduleBracketColorSave() {
    const fields = {};
    Object.entries(bracketColorInputs).forEach(([key, input]) => { fields[key] = input.value; });
    fields.titleFont = bracketFontTitle.value;
    fields.dataFont = bracketFontData.value;
    fields.titleFontWeight = Number(bracketWeightTitle.value);
    fields.dataFontWeight = Number(bracketWeightData.value);
    bracketState.colorSettings = { ...bracketState.colorSettings, ...fields };
    renderBracketGrid();
    clearTimeout(bracketColorSaveTimer);
    bracketColorSaveTimer = setTimeout(async () => {
      try {
        const { ok, data } = await postJSON('/api/bracket/color-settings', fields);
        if (ok && data.success) bracketState = data.bracket;
      } catch (e) {
        // не критично — можно повторить позже
      }
    }, 300);
  }
  Object.values(bracketColorInputs).forEach((input) => input.addEventListener('input', scheduleBracketColorSave));
  [bracketFontTitle, bracketFontData, bracketWeightTitle, bracketWeightData].forEach((el) => el.addEventListener('change', scheduleBracketColorSave));

  /* ---------- Список команд (переименование/лого) — отдельно от самих панелей ---------- */
  function renderBracketTeamList() {
    if (!bracketState.teams.length) { bracketTeamList.innerHTML = '<p class="card-hint">Сгенерируй сетку — тут появится список команд.</p>'; return; }
    bracketTeamList.innerHTML = '';
    bracketState.teams.forEach((team) => {
      const row = document.createElement('div');
      row.className = 'bracket-team-row';
      row.innerHTML = `
        ${bracketLogoHtml(team)}
        <input type="text" value="${escapeHtmlBracket(team.name)}" data-team-id="${team.id}">
        <button class="btn btn-secondary" type="button" data-logo-team-id="${team.id}">Лого</button>
      `;
      const input = row.querySelector('input');
      let currentValue = team.name;
      let saveTimer = null;
      input.addEventListener('input', () => {
        currentValue = input.value;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          try {
            const { ok, data } = await postJSON(`/api/bracket/team/${team.id}/update`, { name: currentValue });
            if (ok && data.success) { bracketState = data.bracket; renderBracketGrid(); } // ТОЛЬКО панели — список команд не трогаем, инпут не пересобираем
          } catch (e) {
            showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
          }
        }, 500);
      });
      row.querySelector('[data-logo-team-id]').addEventListener('click', () => {
        bracketPendingLogoTeamId = team.id;
        bracketTeamLogoInput.click();
      });
      bracketTeamList.appendChild(row);
    });
  }

  bracketTeamLogoInput.addEventListener('change', async () => {
    const file = bracketTeamLogoInput.files[0];
    bracketTeamLogoInput.value = '';
    const teamId = bracketPendingLogoTeamId;
    bracketPendingLogoTeamId = null;
    if (!file || !teamId) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/bracket/logo', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        const { ok, data: updateData } = await postJSON(`/api/bracket/team/${teamId}/update`, { logoUrl: data.logoUrl });
        if (ok && updateData.success) { bracketState = updateData.bracket; renderBracketGrid(); renderBracketTeamList(); }
      } else {
        showBracketMessage((data && data.error) || 'Не удалось загрузить логотип.', 'error');
      }
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  /* ---------- Подпись над сеткой ---------- */
  let bracketGroupLabelTimer = null;
  bracketGroupLabelInput.addEventListener('input', () => {
    clearTimeout(bracketGroupLabelTimer);
    const value = bracketGroupLabelInput.value;
    bracketGroupLabelTimer = setTimeout(async () => {
      try {
        const { ok, data } = await postJSON('/api/bracket/group-label', { text: value });
        if (ok && data.success) { bracketState = data.bracket; renderBracketGrid(); }
      } catch (e) {
        showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
      }
    }, 500);
  });

  let bracketMatchesTitleTimer = null;
  bracketMatchesTitleInput.addEventListener('input', () => {
    clearTimeout(bracketMatchesTitleTimer);
    const value = bracketMatchesTitleInput.value;
    bracketMatchesTitleTimer = setTimeout(async () => {
      try {
        const { ok, data } = await postJSON('/api/bracket/matches-title', { text: value });
        if (ok && data.success) { bracketState = data.bracket; renderBracketGrid(); }
      } catch (e) {
        showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
      }
    }, 500);
  });

  /* ---------- Финал: BO1/BO3 ---------- */
  bracketFinalBo3.addEventListener('change', async () => {
    try {
      const { ok, data } = await postJSON('/api/bracket/final-format', { format: bracketFinalBo3.checked ? 'bo3' : 'bo1' });
      if (ok && data.success) { bracketState = data.bracket; renderBracketContent(); }
      else { bracketFinalBo3.checked = !bracketFinalBo3.checked; showBracketMessage((data && data.error) || 'Не удалось изменить формат финала.', 'error'); }
    } catch (e) {
      bracketFinalBo3.checked = !bracketFinalBo3.checked;
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });
  btnBracketFinalResetGames.addEventListener('click', async () => {
    try {
      const { ok, data } = await postJSON('/api/bracket/final/reset-games', {});
      if (ok && data.success) { bracketState = data.bracket; renderBracketContent(); }
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });
  async function addBracketFinalGameWin(teamId) {
    try {
      const { ok, data } = await postJSON('/api/bracket/final/game-win', { teamId });
      if (ok && data.success) { bracketState = data.bracket; renderBracketContent(); }
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }

  /* ---------- "Сохранить сетку" / "Загрузить сетку" / "Очистить сетку" ---------- */
  btnBracketSave.addEventListener('click', async () => {
    const name = prompt('Название сетки для сохранения:');
    if (!name || !name.trim()) return;
    try {
      await postJSON('/api/bracket/saved', { name: name.trim() });
      showBracketMessage(`Сетка «${name.trim()}» сохранена.`, 'success');
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  const bracketSavedModalOverlay = document.getElementById('bracketSavedModalOverlay');
  const bracketSavedModalClose = document.getElementById('bracketSavedModalClose');
  const bracketSavedModalList = document.getElementById('bracketSavedModalList');
  function closeBracketSavedModal() { bracketSavedModalOverlay.classList.remove('open'); }
  bracketSavedModalClose.addEventListener('click', closeBracketSavedModal);
  bracketSavedModalOverlay.addEventListener('click', (e) => { if (e.target === bracketSavedModalOverlay) closeBracketSavedModal(); });

  async function refreshBracketSavedModal() {
    bracketSavedModalList.innerHTML = '<p class="card-hint">Загружаем список…</p>';
    try {
      const res = await fetch('/api/bracket/saved');
      const data = await res.json();
      const list = data.saved || [];
      if (!list.length) { bracketSavedModalList.innerHTML = '<p class="card-hint">Пока нет сохранённых сеток.</p>'; return; }
      bracketSavedModalList.innerHTML = '';
      list.forEach((saved) => {
        const row = document.createElement('div');
        row.className = 'team-preset-row';
        row.innerHTML = `<span class="team-preset-row-name">${escapeHtmlBracket(saved.name)}</span><span class="team-preset-row-actions"><button class="btn btn-primary" type="button">Загрузить</button><button class="btn-tiny" type="button">Удалить</button></span>`;
        const [loadBtn, delBtn] = row.querySelectorAll('button');
        loadBtn.addEventListener('click', async () => {
          try {
            const { ok, data: loadData } = await postJSON(`/api/bracket/saved/${saved.id}/load`, {});
            if (ok && loadData.success) {
              bracketState = loadData.bracket;
              bracketGroupLabelInput.value = bracketState.groupLabel || '';
        bracketMatchesTitleInput.value = bracketState.matchesTitle || 'Матчи';
              bracketFinalBo3.checked = bracketState.finalFormat === 'bo3';
              applyBracketColorSettingsToForm();
              applyBracketSizeSettingsToForm();
              selectedPanelId = null;
              renderBracketGrid();
              renderBracketTeamList();
              updateBracketPanelFieldsFromSelected();
              closeBracketSavedModal();
              showBracketMessage(`Сетка «${saved.name}» загружена.`, 'success');
            }
          } catch (e) {
            showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
          }
        });
        delBtn.addEventListener('click', async () => {
          if (!await ui3Confirm(`Удалить сохранённую сетку «${saved.name}» навсегда?`)) return;
          await postJSON(`/api/bracket/saved/${saved.id}/delete`, {});
          refreshBracketSavedModal();
        });
        bracketSavedModalList.appendChild(row);
      });
    } catch (e) {
      bracketSavedModalList.innerHTML = '<p class="card-hint">Не удалось загрузить список.</p>';
    }
  }
  btnBracketLoad.addEventListener('click', () => {
    bracketSavedModalOverlay.classList.add('open');
    refreshBracketSavedModal();
  });

  btnBracketClear.addEventListener('click', async () => {
    if (!await ui3Confirm('Полностью очистить текущую сетку? Несохранённые изменения потеряются.')) return;
    try {
      const { ok, data } = await postJSON('/api/bracket/clear', {});
      if (ok && data.success) {
        bracketState = data.bracket;
        bracketGroupLabelInput.value = bracketState.groupLabel || '';
        bracketMatchesTitleInput.value = bracketState.matchesTitle || 'Матчи';
        bracketFinalBo3.checked = bracketState.finalFormat === 'bo3';
        applyBracketColorSettingsToForm();
        applyBracketSizeSettingsToForm();
        selectedPanelId = null;
        renderBracketGrid();
        renderBracketTeamList();
        updateBracketPanelFieldsFromSelected();
        showBracketMessage('Сетка очищена.', 'success');
      }
    } catch (e) {
      showBracketMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  async function loadBracketEditor() {
    try {
      const res = await fetch('/api/bracket');
      const data = await res.json();
      bracketState = data.bracket;
      bracketGroupLabelInput.value = bracketState.groupLabel || '';
        bracketMatchesTitleInput.value = bracketState.matchesTitle || 'Матчи';
      bracketFinalBo3.checked = bracketState.finalFormat === 'bo3';
      applyBracketColorSettingsToForm();
      applyBracketSizeSettingsToForm();
      computeBracketPanelScale();
      renderBracketGrid();
      renderBracketTeamList();
      updateBracketPanelFieldsFromSelected();
    } catch (e) {
      // не критично — редактор просто останется пустым, пока не подгрузится
    }
  }
  loadBracketEditor();

  /* ================================================================
     Вкладка "Чат бот": поля авторизации бота, подключение к чату через
     EventSub WebSocket (см. chatBot.js). Токен бота с сервера НЕ приходит
     никогда — поле остаётся пустым, "сохранён …1234" видно только в подсказке.
  ================================================================ */

  const chatBotUsername = document.getElementById('chatBotUsername');
  const chatBotToken = document.getElementById('chatBotToken');
  const chatBotTokenHint = document.getElementById('chatBotTokenHint');
  const chatBotRefreshToken = document.getElementById('chatBotRefreshToken');
  const chatBotRefreshHint = document.getElementById('chatBotRefreshHint');
  const chatBotRefreshStatus = document.getElementById('chatBotRefreshStatus');
  const chatBotClientId = document.getElementById('chatBotClientId');
  const chatBotClientSecret = document.getElementById('chatBotClientSecret');
  const chatBotClientHint = document.getElementById('chatBotClientHint');
  const chatBotChannelName = document.getElementById('chatBotChannelName');
  const chatBotChannelId = document.getElementById('chatBotChannelId');
  const chatBotStatusEl = document.getElementById('chatBotStatus');
  const chatBotStatusText = document.getElementById('chatBotStatusText');
  const chatBotMessage = document.getElementById('chatBotMessage');
  const chatBotLog = document.getElementById('chatBotLog');
  const chatBotStatusPill = document.getElementById('chatBotStatusPill');
  const btnChatBotAuthToggle = document.getElementById('btnChatBotAuthToggle');
  const chatBotAuthPanel = document.getElementById('chatBotAuthPanel');

  const CHAT_BOT_STATE_TITLES = { disconnected: 'не подключён', connecting: 'подключается…', connected: 'подключён', error: 'ошибка' };

  /** Один источник правды для трёх индикаторов: пилюля «Чат-бот» в шапке, точка на свёрнутой кнопке «Авторизация бота» и статус внутри панели. */
  function applyChatBotIndicators(bot) {
    const title = `Чат бот: ${CHAT_BOT_STATE_TITLES[bot.status] || bot.status}${bot.statusMessage ? ' — ' + bot.statusMessage : ''}`;
    chatBotStatusPill.dataset.state = bot.status;
    chatBotStatusPill.title = title;
    btnChatBotAuthToggle.dataset.state = bot.status;
    btnChatBotAuthToggle.title = title;
  }

  btnChatBotAuthToggle.addEventListener('click', () => {
    const willOpen = chatBotAuthPanel.style.display === 'none';
    chatBotAuthPanel.style.display = willOpen ? 'block' : 'none';
    btnChatBotAuthToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  function showChatBotMessage(text, kind) {
    chatBotMessage.textContent = text;
    chatBotMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function escapeHtmlChatBot(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** Время для строки о токене: только часы:минуты, а если это не сегодня — с датой. */
  function formatTokenTime(ts) {
    const d = new Date(ts);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /** Строка под кнопками: до какого часа действует access-токен, включено ли автообновление (и почему нет), чем закончилось последнее обновление. */
  function renderChatBotRefreshStatus(bot) {
    const parts = [];
    if (bot.hasToken && bot.tokenExpiresAt) parts.push(`Access-токен действует до ${formatTokenTime(bot.tokenExpiresAt)}.`);
    if (bot.hasToken || bot.hasRefreshToken) {
      parts.push(bot.autoRefresh && bot.autoRefresh.enabled
        ? `Автообновление включено (${bot.autoRefresh.source === 'bot' ? 'Client ID/Secret бота' : 'общие Client ID/Secret из «Авторизации»'}).`
        : `Автообновление выключено: ${bot.autoRefresh ? bot.autoRefresh.reason : 'нет данных'}.`);
    }
    const last = bot.lastRefresh;
    if (last && last.ok) parts.push(`Токен обновлён в ${formatTokenTime(last.at)}.`);
    const failed = !!(last && !last.ok);
    if (failed) parts.push(last.error);
    chatBotRefreshStatus.textContent = parts.join(' ');
    chatBotRefreshStatus.className = 'form-message' + (failed ? ' error' : '');
  }

  /** Обновляет статус/лог; поля формы трогает только при fillFields=true (первая загрузка/после сохранения), иначе опрос стёр бы то, что человек печатает. */
  function renderChatBot(bot, fillFields) {
    if (fillFields) {
      chatBotUsername.value = bot.botUsername;
      chatBotChannelName.value = bot.channelName;
      chatBotChannelId.value = bot.channelId;
      chatBotToken.value = '';
      chatBotTokenHint.textContent = bot.hasToken ? `Токен сохранён (${bot.tokenPreview}). Оставь поле пустым, чтобы не менять.` : 'Токен пока не сохранён.';
      chatBotRefreshToken.value = '';
      chatBotClientId.value = bot.botClientId || '';
      chatBotClientSecret.value = '';
      chatBotClientHint.textContent = bot.hasBotClientSecret
        ? `Секрет сохранён (${bot.botClientSecretPreview}). Оставь поле пустым, чтобы не менять. Чтобы вернуться к общим данным из «Авторизации» — очисти Bot Client ID и сохрани (секрет сбросится вместе с ним).`
        : 'Оба поля пусты — токен бота обновляется общими Client ID/Secret из вкладки «Подключения». Если токен бота получен другим приложением — впиши его Client ID и Secret (заполни оба).';
      chatBotRefreshHint.textContent = bot.hasRefreshToken
        ? `Refresh Token сохранён (${bot.refreshTokenPreview}). Оставь поле пустым, чтобы не менять.`
        : 'Refresh Token не указан — когда access-токен истечёт, его придётся вставлять заново.';
    }
    chatBotStatusEl.dataset.state = bot.status;
    chatBotStatusText.textContent = bot.statusMessage;
    applyChatBotIndicators(bot);
    renderLastBotCommand(bot.lastCommand);
    renderChatBotRefreshStatus(bot);
    renderBotTimersState(bot);
    renderAutoModStatus(bot);
    const messages = bot.recentMessages || [];
    if (!messages.length) {
      chatBotLog.innerHTML = '<p class="card-hint">' + (bot.status === 'connected' ? 'Пока тихо — жду сообщений…' : 'Подключи бота — здесь появятся сообщения.') + '</p>';
    } else {
      const stick = chatBotLog.scrollTop + chatBotLog.clientHeight >= chatBotLog.scrollHeight - 30;
      chatBotLog.innerHTML = messages.map((m) => `<div class="chatbot-log-line"><span class="chatbot-log-user" style="color:${/^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : 'var(--accent)'}">${escapeHtmlChatBot(m.user)}:</span>${escapeHtmlChatBot(m.text)}</div>`).join('');
      if (stick) chatBotLog.scrollTop = chatBotLog.scrollHeight;
    }
  }

  function chatBotFormFields() {
    return {
      botUsername: chatBotUsername.value,
      botToken: chatBotToken.value, // пусто = оставить сохранённый
      refreshToken: chatBotRefreshToken.value, // пусто = оставить сохранённый
      botClientId: chatBotClientId.value, // пусто = очистить (вернуться к общим данным)
      botClientSecret: chatBotClientSecret.value, // пусто = оставить сохранённый
      channelName: chatBotChannelName.value,
      channelId: chatBotChannelId.value,
    };
  }

  async function saveChatBotFields() {
    const { ok, data } = await postJSON('/api/chat-bot/save', chatBotFormFields());
    if (!ok || !data.success) throw new Error((data && data.error) || 'Не удалось сохранить.');
    // Сервер отдаёт Bot Client ID обратно. Если отправили ID, а вернулось другое — сервер поля бота не принял (обычно: сервер не перезапущен после обновления).
    const sentClientId = chatBotClientId.value.trim();
    if (sentClientId && data.chatBot.botClientId !== sentClientId) {
      throw new Error('Сервер не сохранил Bot Client ID/Secret — похоже, он запущен со старой версией. Перезапусти сервер и повтори.');
    }
    renderChatBot(data.chatBot, true);
  }

  document.getElementById('btnChatBotSave').addEventListener('click', async () => {
    try {
      await saveChatBotFields();
      showChatBotMessage('Сохранено.', 'success');
    } catch (e) {
      showChatBotMessage(e.message || 'Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  document.getElementById('btnChatBotConnect').addEventListener('click', async () => {
    showChatBotMessage('Проверяю токен…', '');
    try {
      await saveChatBotFields(); // подключаемся с тем, что сейчас в форме
      const { ok, data } = await postJSON('/api/chat-bot/connect', {});
      renderChatBot(data.chatBot, true);
      showChatBotMessage(ok ? '' : (data.error || 'Не удалось подключиться.'), ok ? '' : 'error');
    } catch (e) {
      showChatBotMessage(e.message || 'Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  document.getElementById('btnChatBotDisconnect').addEventListener('click', async () => {
    try {
      const { data } = await postJSON('/api/chat-bot/disconnect', {});
      renderChatBot(data.chatBot, false);
      showChatBotMessage('', '');
    } catch (e) {
      showChatBotMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  async function pollChatBot(fillFields) {
    try {
      const res = await fetch('/api/chat-bot');
      const data = await res.json();
      renderChatBot(data.chatBot, fillFields);
    } catch (e) {
      // не критично — следующий опрос попробует снова
    }
  }
  pollChatBot(true);
  // Статус/сообщения обновляем, только пока открыта вкладка "Чат бот" — на других вкладках лишние запросы не нужны.
  setInterval(() => { if (currentTabId === 'chatbot') pollChatBot(false); }, 3000);

  /* --- Конструктор команд бота: "!команда" → ответ (хранится на сервере в bot_commands.json) --- */
  const botCommandsBody = document.getElementById('botCommandsBody');
  const botCommandForm = document.getElementById('botCommandForm');
  const botCmdFormTitle = document.getElementById('botCmdFormTitle');
  const botCmdCommand = document.getElementById('botCmdCommand');
  const botCmdResponse = document.getElementById('botCmdResponse');
  const botCmdMessage = document.getElementById('botCmdMessage');
  const botCommandsStatus = document.getElementById('botCommandsStatus');
  let botCommandsList = [];
  let editingBotCommandId = null; // null — создаём новую, иначе id редактируемой

  function showBotCmdMessage(text, kind) {
    botCmdMessage.textContent = text;
    botCmdMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  /** Что бот ответил на последнюю команду — успех или причина ошибки (например, нет права user:write:chat). */
  function renderLastBotCommand(last) {
    if (!last) { botCommandsStatus.textContent = ''; botCommandsStatus.className = 'form-message'; return; }
    botCommandsStatus.textContent = last.ok
      ? `Последний ответ: ${last.command} (запросил ${last.user}) — отправлен.`
      : `Не удалось ответить на ${last.command}: ${last.error}`;
    botCommandsStatus.className = 'form-message' + (last.ok ? ' success' : ' error');
  }

  function renderBotCommands() {
    if (!botCommandsList.length) {
      botCommandsBody.innerHTML = '<tr><td colspan="3" class="card-hint">Команд пока нет — нажми «Добавить команду».</td></tr>';
      return;
    }
    botCommandsBody.innerHTML = botCommandsList.map((c) => `
      <tr>
        <td class="bot-cmd-code">${escapeHtmlChatBot(c.command)}</td>
        <td class="bot-cmd-response">${escapeHtmlChatBot(c.response)}</td>
        <td class="bot-cmd-actions">
          <button class="btn-tiny" type="button" data-bot-cmd-edit="${c.id}">Редактировать</button>
          <button class="btn-tiny" type="button" data-bot-cmd-delete="${c.id}">Удалить</button>
        </td>
      </tr>`).join('');
    botCommandsBody.querySelectorAll('[data-bot-cmd-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openBotCommandForm(botCommandsList.find((c) => c.id === btn.dataset.botCmdEdit)));
    });
    botCommandsBody.querySelectorAll('[data-bot-cmd-delete]').forEach((btn) => {
      btn.addEventListener('click', () => deleteBotCommand(botCommandsList.find((c) => c.id === btn.dataset.botCmdDelete)));
    });
  }

  function openBotCommandForm(item) {
    editingBotCommandId = item ? item.id : null;
    botCmdFormTitle.textContent = item ? 'Команда (редактирование)' : 'Команда';
    botCmdCommand.value = item ? item.command : '';
    botCmdResponse.value = item ? item.response : '';
    showBotCmdMessage('', '');
    botCommandForm.style.display = 'block';
    botCmdCommand.focus();
  }
  function closeBotCommandForm() {
    botCommandForm.style.display = 'none';
    editingBotCommandId = null;
  }

  document.getElementById('btnBotCommandAdd').addEventListener('click', () => openBotCommandForm(null));
  document.getElementById('btnBotCmdCancel').addEventListener('click', closeBotCommandForm);

  // Кнопки {user}/{channel} вставляют плейсхолдер в позицию курсора (или заменяют выделенное).
  document.querySelectorAll('[data-bot-placeholder]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ph = btn.dataset.botPlaceholder;
      const start = botCmdResponse.selectionStart;
      const end = botCmdResponse.selectionEnd;
      botCmdResponse.value = botCmdResponse.value.slice(0, start) + ph + botCmdResponse.value.slice(end);
      botCmdResponse.focus();
      botCmdResponse.selectionStart = botCmdResponse.selectionEnd = start + ph.length;
    });
  });

  document.getElementById('btnBotCmdSave').addEventListener('click', async () => {
    const url = editingBotCommandId ? `/api/bot-commands/${editingBotCommandId}/update` : '/api/bot-commands';
    try {
      const { ok, data } = await postJSON(url, { command: botCmdCommand.value, response: botCmdResponse.value });
      if (ok && data.success) {
        botCommandsList = data.commands;
        renderBotCommands();
        closeBotCommandForm();
      } else {
        showBotCmdMessage((data && data.error) || 'Не удалось сохранить команду.', 'error');
      }
    } catch (e) {
      showBotCmdMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  async function deleteBotCommand(item) {
    if (!item || !await ui3Confirm(`Удалить команду ${item.command}?`)) return;
    try {
      const { ok, data } = await postJSON(`/api/bot-commands/${item.id}/delete`, {});
      if (ok && data.success) {
        botCommandsList = data.commands;
        renderBotCommands();
        if (editingBotCommandId === item.id) closeBotCommandForm(); // удалили ту, что открыта в форме
      } else {
        botCommandsStatus.textContent = (data && data.error) || 'Не удалось удалить команду.';
        botCommandsStatus.className = 'form-message error';
      }
    } catch (e) {
      botCommandsStatus.textContent = 'Сетевая ошибка при обращении к серверу.';
      botCommandsStatus.className = 'form-message error';
    }
  }

  (async function loadBotCommands() {
    try {
      const res = await fetch('/api/bot-commands');
      const data = await res.json();
      botCommandsList = data.commands || [];
      renderBotCommands();
    } catch (e) {
      botCommandsBody.innerHTML = '<tr><td colspan="3" class="card-hint">Не удалось загрузить команды.</td></tr>';
    }
  })();

  /* --- Команды чат-аватаров: «!аватар» → случайный герой, «!прыжок»… (хранятся на сервере в avatar_commands.json) --- */
  const avatarCmdList = document.getElementById('avatarCmdList');
  const avatarCmdMessage = document.getElementById('avatarCmdMessage');
  const avatarCmdEnabled = document.getElementById('avatarCmdEnabled');
  let avatarCmdState = null; // { enabled, commands: [{ action, enabled, names, cooldownSec, reply, text }], actions: [{ id, title, hint, args, defaults }], chatters }
  function showAvatarCmdMessage(text, kind) { avatarCmdMessage.textContent = text; avatarCmdMessage.className = 'form-message' + (kind ? ' ' + kind : ''); }

  function renderAvatarCommands() {
    const st = avatarCmdState;
    avatarCmdList.replaceChildren();
    if (!st) return;
    avatarCmdEnabled.checked = !!st.enabled;
    const warn = document.getElementById('avatarCmdWarning');
    warn.textContent = st.chatters ? '' : 'Сейчас выключено «Выдавать героев чаттерам» (вкладка «ЧатАватары») — у зрителей нет героев, команды ничего не делают.';
    warn.className = 'form-message' + (st.chatters ? '' : ' error');
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    st.actions.forEach((a) => {
      const c = st.commands.find((x) => x.action === a.id);
      if (!c) return;
      const row = el('div', 'avatar-cmd-row' + (c.enabled ? '' : ' is-off'));
      row.dataset.action = a.id;
      const sw = el('label', 'toggle-switch'); sw.title = 'Команда включена';
      const on = document.createElement('input'); on.type = 'checkbox'; on.checked = c.enabled; on.className = 'avatar-cmd-on'; on.setAttribute('aria-label', `Включить: ${a.title}`);
      sw.append(on, el('span', 'toggle-slider'));
      on.addEventListener('change', () => row.classList.toggle('is-off', !on.checked));
      const body = el('div', 'avatar-cmd-body');
      body.append(el('div', 'avatar-cmd-title', a.title), el('div', 'avatar-cmd-hint', a.hint));
      const fields = el('div', 'avatar-cmd-fields');
      const names = document.createElement('input'); names.type = 'text'; names.className = 'avatar-cmd-names'; names.value = c.names.join(', '); names.maxLength = 200; names.placeholder = a.defaults.names.join(', ');
      names.setAttribute('aria-label', `Команды: ${a.title}`);
      const l1 = el('label'); l1.append('Команды ', names);
      const cool = document.createElement('input'); cool.type = 'number'; cool.min = '0'; cool.max = '3600'; cool.step = '1'; cool.className = 'avatar-cmd-cool'; cool.value = String(c.cooldownSec);
      cool.setAttribute('aria-label', `Пауза в секундах: ${a.title}`);
      const l2 = el('label'); l2.append('Пауза ', cool, ' с');
      const reply = document.createElement('input'); reply.type = 'checkbox'; reply.checked = c.reply; reply.className = 'avatar-cmd-reply';
      const l3 = el('label'); l3.append(reply, ' Отвечать в чат');
      const text = document.createElement('input'); text.type = 'text'; text.className = 'avatar-cmd-text'; text.value = c.text; text.maxLength = 300; text.placeholder = a.kind ? 'Текст ответа (можно оставить пустым — тогда только анимация)' : 'Текст ответа';
      text.setAttribute('aria-label', `Текст ответа: ${a.title}`);
      fields.append(l1, l2, l3, text);
      body.appendChild(fields);
      row.append(sw, body);
      avatarCmdList.appendChild(row);
    });
  }
  function readAvatarCommands() {
    return [...avatarCmdList.querySelectorAll('.avatar-cmd-row')].map((row) => ({
      action: row.dataset.action, enabled: row.querySelector('.avatar-cmd-on').checked,
      names: row.querySelector('.avatar-cmd-names').value.split(/[\s,;]+/).filter(Boolean), cooldownSec: Number(row.querySelector('.avatar-cmd-cool').value),
      reply: row.querySelector('.avatar-cmd-reply').checked, text: row.querySelector('.avatar-cmd-text').value,
    }));
  }
  async function avatarCmdRequest(url, body) {
    const res = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error((data && data.error) || 'Не удалось выполнить действие.');
    return data;
  }
  async function loadAvatarCommands() {
    try {
      avatarCmdState = await avatarCmdRequest('/api/avatar-commands');
      renderAvatarCommands();
      syncUnlockControls();
    } catch (e) {
      avatarCmdList.innerHTML = '<p class="card-hint">Не удалось загрузить команды аватаров.</p>';
    }
  }
  document.getElementById('btnAvatarCmdSave').addEventListener('click', async () => {
    try {
      const data = await avatarCmdRequest('/api/avatar-commands', { enabled: avatarCmdEnabled.checked, commands: readAvatarCommands() });
      avatarCmdState = { ...avatarCmdState, ...data };
      renderAvatarCommands();
      showAvatarCmdMessage('Команды аватаров сохранены.', 'success');
    } catch (e) {
      showAvatarCmdMessage(e.message, 'error'); // поля остаются как были — можно поправить и сохранить снова
    }
  });
  document.getElementById('btnAvatarCmdReset').addEventListener('click', async () => {
    try {
      const data = await avatarCmdRequest('/api/avatar-commands/reset', {});
      avatarCmdState = { ...avatarCmdState, ...data };
      renderAvatarCommands();
      showAvatarCmdMessage('Команды аватаров возвращены к настройкам по умолчанию.', 'success');
    } catch (e) {
      showAvatarCmdMessage(e.message, 'error');
    }
  });
  avatarCmdEnabled.addEventListener('change', async () => { // главный переключатель — сохраняется сразу
    try {
      await avatarCmdRequest('/api/avatar-commands', { enabled: avatarCmdEnabled.checked });
      showAvatarCmdMessage(avatarCmdEnabled.checked ? 'Команды аватаров включены.' : 'Команды аватаров выключены.', 'success');
    } catch (e) {
      avatarCmdEnabled.checked = !avatarCmdEnabled.checked;
      showAvatarCmdMessage(e.message, 'error');
    }
  });
  /* --- Разблокировка аватаров за баллы канала (настройки хранятся в pixel_heroes_settings.json) --- */
  const unlockMsg = document.getElementById('unlockMessage');
  const showUnlockMessage = (text, kind) => { unlockMsg.textContent = text; unlockMsg.className = 'form-message' + (kind ? ' ' + kind : ''); };
  function syncUnlockControls() {
    const u = avatarCmdState && avatarCmdState.unlock; if (!u) return;
    document.getElementById('unlockLock').checked = !!u.lock;
    document.getElementById('unlockReward').value = u.rewardTitle || '';
    document.getElementById('unlockText').value = u.text || '';
  }
  document.getElementById('btnUnlockSave').addEventListener('click', async () => {
    try {
      const data = await avatarCmdRequest('/api/pixel-heroes/unlock-settings', { lock: document.getElementById('unlockLock').checked, rewardTitle: document.getElementById('unlockReward').value, text: document.getElementById('unlockText').value });
      avatarCmdState = { ...avatarCmdState, unlock: data.unlock };
      showUnlockMessage(data.unlock.rewardTitle ? `Сохранено. Награда «${data.unlock.rewardTitle}» открывает случайный аватар.` : 'Сохранено, но название награды пустое — за баллы ничего открываться не будет.', 'success');
    } catch (e) { showUnlockMessage(e.message, 'error'); }
    syncUnlockControls();
  });
  document.getElementById('unlockLock').addEventListener('change', async (e) => { // замок — сразу
    const want = e.target.checked;
    try {
      const data = await avatarCmdRequest('/api/pixel-heroes/unlock-settings', { lock: want });
      avatarCmdState = { ...avatarCmdState, unlock: data.unlock };
      showUnlockMessage(want ? 'Аватары закрыты: менять можно только на открытые.' : 'Аватары открыты всем, как раньше.', 'success');
    } catch (err) { e.target.checked = !want; showUnlockMessage(err.message, 'error'); }
  });
  document.getElementById('btnUnlockGive').addEventListener('click', async () => {
    const input = document.getElementById('unlockGiveLogin');
    try {
      const d = await avatarCmdRequest('/api/pixel-heroes/unlock', { login: input.value });
      showUnlockMessage(`Открыт аватар «${d.title}» (открыто ${d.unlocked} из ${d.total}).` + (d.botConnected ? ' Бот написал об этом в чат.' : ' Бот не подключён — в чат ничего не отправлено.'), 'success');
    } catch (e) { showUnlockMessage(e.message, 'error'); }
  });
  loadAvatarCommands();

  /* --- Сообщения бота по таймеру (раз в 15–60 минут; хранятся на сервере в bot_timers.json) --- */
  const botTimersBody = document.getElementById('botTimersBody');
  const botTimersOnlyLive = document.getElementById('botTimersOnlyLive');
  const botTimerForm = document.getElementById('botTimerForm');
  const botTimerFormTitle = document.getElementById('botTimerFormTitle');
  const botTimerText = document.getElementById('botTimerText');
  const botTimerInterval = document.getElementById('botTimerInterval');
  const botTimerEnabled = document.getElementById('botTimerEnabled');
  const botTimerMessage = document.getElementById('botTimerMessage');
  const botTimersStatus = document.getElementById('botTimersStatus');
  let botTimersList = [];
  let botTimerRuntime = {}; // id -> { nextAt, lastAt, lastError } — расписание с сервера (приходит вместе со статусом бота)
  let botTimerServerNow = 0;
  let botTimerBotConnected = false;
  let editingBotTimerId = null; // null — создаём новое, иначе id редактируемого

  function showBotTimerMessage(text, kind) {
    botTimerMessage.textContent = text;
    botTimerMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }
  function showBotTimersStatus(text, kind) {
    botTimersStatus.textContent = text;
    botTimersStatus.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  /** «через 12 мин» по часам СЕРВЕРА (serverNow приходит вместе со статусом), а не по часам браузера. */
  function formatBotTimerEta(nextAt) {
    const ms = nextAt - botTimerServerNow;
    if (ms < 60000) return 'меньше минуты';
    return `через ${Math.round(ms / 60000)} мин`;
  }

  function renderBotTimers() {
    if (!botTimersList.length) {
      botTimersBody.innerHTML = '<tr><td colspan="5" class="card-hint">Сообщений пока нет — нажми «Добавить сообщение».</td></tr>';
      return;
    }
    botTimersBody.innerHTML = botTimersList.map((t) => {
      const st = botTimerRuntime[t.id];
      let next = '—';
      if (!t.enabled) next = 'выключено';
      else if (!botTimerBotConnected) next = 'бот не подключён';
      else if (st) next = formatBotTimerEta(st.nextAt);
      const err = t.enabled && st && st.lastError ? `<div class="form-message error" style="margin:4px 0 0;">Последняя отправка не удалась: ${escapeHtmlChatBot(st.lastError)}</div>` : '';
      return `
      <tr>
        <td class="bot-cmd-response">${escapeHtmlChatBot(t.text)}${err}</td>
        <td style="white-space:nowrap;">${t.intervalMinutes} мин</td>
        <td style="white-space:nowrap;">${escapeHtmlChatBot(next)}</td>
        <td><label class="toggle-switch"><input type="checkbox" data-bot-timer-toggle="${t.id}"${t.enabled ? ' checked' : ''}><span class="toggle-slider"></span></label></td>
        <td class="bot-cmd-actions">
          <button class="btn-tiny" type="button" data-bot-timer-edit="${t.id}">Редактировать</button>
          <button class="btn-tiny" type="button" data-bot-timer-delete="${t.id}">Удалить</button>
        </td>
      </tr>`;
    }).join('');
    botTimersBody.querySelectorAll('[data-bot-timer-toggle]').forEach((box) => {
      box.addEventListener('change', () => toggleBotTimer(botTimersList.find((t) => t.id === box.dataset.botTimerToggle), box.checked));
    });
    botTimersBody.querySelectorAll('[data-bot-timer-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openBotTimerForm(botTimersList.find((t) => t.id === btn.dataset.botTimerEdit)));
    });
    botTimersBody.querySelectorAll('[data-bot-timer-delete]').forEach((btn) => {
      btn.addEventListener('click', () => deleteBotTimer(botTimersList.find((t) => t.id === btn.dataset.botTimerDelete)));
    });
  }

  /** Вызывается при каждом опросе статуса бота: время следующей отправки, подключён ли бот, итог последней отправки. */
  function renderBotTimersState(bot) {
    botTimerRuntime = Object.fromEntries((bot.timers || []).map((t) => [t.id, t]));
    botTimerServerNow = bot.serverNow || Date.now();
    botTimerBotConnected = bot.status === 'connected';
    renderBotTimers();
    const last = bot.lastTimerMessage;
    if (!last) showBotTimersStatus('', '');
    else if (last.ok) showBotTimersStatus('Последнее сообщение по таймеру отправлено.', 'success');
    else showBotTimersStatus(`Сообщение по таймеру не отправлено: ${last.error}`, 'error');
  }

  function applyBotTimersPayload(data) {
    botTimersList = data.timers || [];
    botTimersOnlyLive.checked = !!(data.settings && data.settings.onlyWhenLive);
    renderBotTimers();
  }

  function botTimerFormFields() {
    return { text: botTimerText.value, intervalMinutes: Number(botTimerInterval.value), enabled: botTimerEnabled.checked };
  }

  function openBotTimerForm(item) {
    editingBotTimerId = item ? item.id : null;
    botTimerFormTitle.textContent = item ? 'Сообщение (редактирование)' : 'Сообщение';
    botTimerText.value = item ? item.text : '';
    botTimerInterval.value = item ? item.intervalMinutes : 20;
    botTimerEnabled.checked = item ? item.enabled : true;
    showBotTimerMessage('', '');
    botTimerForm.style.display = 'block';
    botTimerText.focus();
  }
  function closeBotTimerForm() {
    botTimerForm.style.display = 'none';
    editingBotTimerId = null;
  }

  async function saveBotTimer() {
    const url = editingBotTimerId ? `/api/bot-timers/${editingBotTimerId}/update` : '/api/bot-timers';
    const { ok, data } = await postJSON(url, botTimerFormFields());
    if (!ok || !data.success) throw new Error((data && data.error) || 'Не удалось сохранить сообщение.');
    applyBotTimersPayload(data);
    closeBotTimerForm();
  }

  async function toggleBotTimer(item, enabled) {
    if (!item) return;
    try {
      const { ok, data } = await postJSON(`/api/bot-timers/${item.id}/update`, { text: item.text, intervalMinutes: item.intervalMinutes, enabled });
      if (ok && data.success) applyBotTimersPayload(data);
      else showBotTimersStatus((data && data.error) || 'Не удалось изменить сообщение.', 'error');
    } catch (e) {
      showBotTimersStatus('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }

  async function deleteBotTimer(item) {
    if (!item || !await ui3Confirm('Удалить это сообщение по таймеру?')) return;
    try {
      const { ok, data } = await postJSON(`/api/bot-timers/${item.id}/delete`, {});
      if (ok && data.success) {
        applyBotTimersPayload(data);
        if (editingBotTimerId === item.id) closeBotTimerForm();
      } else {
        showBotTimersStatus((data && data.error) || 'Не удалось удалить сообщение.', 'error');
      }
    } catch (e) {
      showBotTimersStatus('Сетевая ошибка при обращении к серверу.', 'error');
    }
  }

  document.getElementById('btnBotTimerAdd').addEventListener('click', () => openBotTimerForm(null));
  document.getElementById('btnBotTimerCancel').addEventListener('click', closeBotTimerForm);
  document.getElementById('btnBotTimerSave').addEventListener('click', async () => {
    try {
      await saveBotTimer();
    } catch (e) {
      showBotTimerMessage(e.message || 'Сетевая ошибка при обращении к серверу.', 'error');
    }
  });
  botTimersOnlyLive.addEventListener('change', async () => {
    try {
      const { ok, data } = await postJSON('/api/bot-timers/settings', { onlyWhenLive: botTimersOnlyLive.checked });
      if (ok && data.success) applyBotTimersPayload(data);
    } catch (e) {
      showBotTimersStatus('Сетевая ошибка при обращении к серверу.', 'error');
    }
  });

  (async function loadBotTimers() {
    try {
      const res = await fetch('/api/bot-timers');
      applyBotTimersPayload(await res.json());
    } catch (e) {
      botTimersBody.innerHTML = '<tr><td colspan="5" class="card-hint">Не удалось загрузить сообщения.</td></tr>';
    }
  })();

  /* --- Автомодерация: кнопка на странице + модальное окно со списком слов ---
     Сам список показывается ТОЛЬКО в модальном окне и загружается только при его открытии; при закрытии поле очищается, так что слова
     не остаются в странице. На странице — лишь статус («включена, слов: N»), число удалённых и предупреждение о правах. */
  const autoModOverlay = document.getElementById('autoModOverlay');
  const autoModWords = document.getElementById('autoModWords');
  const autoModEnabled = document.getElementById('autoModEnabled');
  const autoModMessage = document.getElementById('autoModMessage');
  const autoModStatus = document.getElementById('autoModStatus');
  const autoModWarning = document.getElementById('autoModWarning');

  function showAutoModMessage(text, kind) {
    autoModMessage.textContent = text;
    autoModMessage.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function autoModStatusText(am, botStatus) {
    if (!am) return '';
    if (!am.enabled) return 'Автомодерация выключена.';
    const parts = [`Включена · слов в списке: ${am.wordCount}`];
    if (botStatus !== 'connected') parts.push('бот не подключён — пока не работает');
    if (am.deleted) parts.push(`удалено сообщений с запуска: ${am.deleted}`);
    return parts.join(' · ') + '.';
  }

  /** Вызывается при каждом опросе статуса бота (и сразу после сохранения — со своей сводкой). Слов из списка здесь нет и быть не может. */
  function renderAutoModStatus(bot) {
    const am = bot.autoMod;
    autoModStatus.dataset.botStatus = bot.status; // запоминаем, чтобы сводка сразу после сохранения знала, подключён ли бот
    autoModStatus.textContent = autoModStatusText(am, bot.status);
    autoModStatus.className = 'form-message';
    const warning = am && am.warning ? am.warning : '';
    autoModWarning.textContent = warning ? `⚠ ${warning}` : '';
    autoModWarning.className = 'form-message' + (warning ? ' error' : '');
  }

  function closeAutoMod() {
    autoModOverlay.style.display = 'none';
    autoModWords.value = ''; // список не остаётся в странице после закрытия окна
    showAutoModMessage('', '');
  }

  async function openAutoMod() {
    showAutoModMessage('', '');
    try {
      const res = await fetch('/api/automod');
      const data = await res.json();
      autoModWords.value = (data.words || []).join('\n');
      autoModEnabled.checked = data.enabled !== false;
      autoModOverlay.style.display = 'flex';
      autoModWords.focus();
    } catch (e) {
      ui3Alert('Не удалось загрузить список автомодерации.');
    }
  }

  async function saveAutoMod() {
    try {
      const { ok, data } = await postJSON('/api/automod', { words: autoModWords.value, enabled: autoModEnabled.checked });
      if (ok && data.success) {
        closeAutoMod();
        // сразу показываем новую сводку, не дожидаясь очередного опроса статуса бота
        autoModStatus.textContent = autoModStatusText({ enabled: data.enabled, wordCount: data.wordCount }, autoModStatus.dataset.botStatus);
        return true;
      }
      showAutoModMessage((data && data.error) || 'Не удалось сохранить список.', 'error');
    } catch (e) {
      showAutoModMessage('Сетевая ошибка при обращении к серверу.', 'error');
    }
    return false;
  }

  /** Подставляет список по умолчанию в поле окна; сохраняется он, только если нажать «Сохранить». */
  async function loadAutoModDefaults() {
    try {
      const res = await fetch('/api/automod/defaults');
      const data = await res.json();
      autoModWords.value = (data.words || []).join('\n');
      showAutoModMessage('Подставлен список по умолчанию — нажми «Сохранить», чтобы применить.', '');
    } catch (e) {
      showAutoModMessage('Не удалось загрузить список по умолчанию.', 'error');
    }
  }

  document.getElementById('btnAutoMod').addEventListener('click', openAutoMod);
  document.getElementById('btnAutoModSave').addEventListener('click', saveAutoMod);
  document.getElementById('btnAutoModCancel').addEventListener('click', closeAutoMod);
  document.getElementById('autoModClose').addEventListener('click', closeAutoMod);
  document.getElementById('btnAutoModDefaults').addEventListener('click', loadAutoModDefaults);
  autoModOverlay.addEventListener('click', (e) => { if (e.target === autoModOverlay) closeAutoMod(); }); // клик мимо окна = «Отмена»
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && autoModOverlay.style.display === 'flex') closeAutoMod(); });
})();

/* ===================== Вкладка «Донаты» → «Донат»: настройки алерта и тест ===================== */
(function () {
  const form = document.getElementById('daForm');
  if (!form) return;
  const msgEl = document.getElementById('daMessage');
  const FIELDS = [
    { k: 'enabled', t: 'toggle', l: 'Показывать алерт при донате' },
    { k: 'inMain', t: 'toggle', l: 'Показывать в основном оверлее (выключи, если используешь отдельный источник OBS)' },
    { k: 'minAmount', t: 'number', l: 'Показывать от суммы', suf: '₽', min: 0, max: 1000000 },
    { k: 'themed', t: 'toggle', l: 'Привязать к теме оверлея (стиль, цвет, шрифт; выкл — нейтральный вид)' },
    { k: 'font', t: 'font', l: '', noRow: true },
    { k: 'typeText', t: 'toggle', l: 'Печатать текст сообщения на карточке во время озвучки' },
    { k: 'pulse', t: 'toggle', l: 'Пульсация и лёгкая подсветка суммы' },
    { k: 'showSource', t: 'toggle', l: 'Значок площадки (DA / DX) в углу карточки' },
    { k: 'plateOpacity', t: 'range', l: 'Непрозрачность плашки (0% — как у виджетов стиля; при привязке к теме)', suf: '%', min: 0, max: 100, step: 5 },
    { k: 'texture', t: 'texture', l: 'Текстура фона карточки (картинка JPG/PNG/WEBP/GIF до 10 МБ)' },
    { k: 'texDim', t: 'range', l: 'Затемнение текстуры (чтобы текст читался)', suf: '%', min: 0, max: 100, step: 5 },
    { k: 'texOpacity', t: 'range', l: 'Непрозрачность текстуры', suf: '%', min: 0, max: 100, step: 5 },
    { k: 'glow', t: 'toggle', l: 'Мягкий свет за карточкой (подсвечивает её от фона)' },
    { k: 'glowPower', t: 'range', l: 'Сила света', suf: '%', min: 0, max: 100, step: 5 },
    { k: 'look', t: 'select', l: 'Вид алерта', opts: [['card', 'Карточка'], ['receipt', 'Кассовый чек'], ['slots', 'Игровой автомат'], ['random', 'Случайный из трёх']] },
    { k: 'receiptTitle', t: 'text', l: 'Шапка чека (для вида «Кассовый чек»)' },
    { k: 'frame', t: 'select', l: 'Анимированная рамка', opts: [['', 'без рамки'], ['tier', 'по уровню доната'], ['flow', 'Бегущий свет'], ['comet', 'Комета по контуру'], ['neon', 'Неон с пульсацией'], ['rainbow', 'Радуга'], ['gold', 'Золото'], ['dashes', 'Бегущие штрихи']] },
    { k: 'frameW', t: 'range', l: 'Толщина рамки', suf: 'px', min: 1, max: 12, step: 1 },
    { k: 'tiers', t: 'toggle', l: 'Уровни доната: подпись над ником («крупный», «огромный», «легендарный») и свечение' },
    { k: 'tier1', t: 'number', l: '— «крупный донат» от', suf: '₽', min: 1, max: 100000000 },
    { k: 'tier2', t: 'number', l: '— «огромный донат» от', suf: '₽', min: 1, max: 100000000 },
    { k: 'tier3', t: 'number', l: '— «легендарный донат» (золото) от', suf: '₽', min: 1, max: 100000000 },
    { k: 'donorStat', t: 'toggle', l: 'Строка под суммой: «Первый донат» / «Донат №N · всего …»' },
    { k: 'timeBar', t: 'toggle', l: 'Полоска оставшегося времени внизу карточки' },
    { k: 'speak', t: 'toggle', l: 'Озвучивать алерт' },
    { k: 'voice', t: 'voice', l: 'Голос алерта' },
    { k: 'readNick', t: 'toggle', l: 'Читать «ник задонатил N рублей»' },
    { k: 'genderVerb', t: 'toggle', l: 'Род по нику: «задонатил» / «задонатила» (эвристика по имени, окончанию, транслиту)' },
    { k: 'genderUnknown', t: 'select', l: 'Если род по нику не определился', opts: [['male', 'задонатил'], ['female', 'задонатила']] },
    { k: 'genderList', t: 'textarea', l: 'Ручные исключения (по строке: ник = м или ник = ж)' },
    { k: 'readMessage', t: 'toggle', l: 'Читать текст сообщения' },
    { k: 'volume', t: 'range', l: 'Громкость озвучки', suf: '%', min: 0, max: 100, step: 5 },
    { k: 'soundFly', t: 'sound', l: 'Звук подлёта (когда карточка появляется)' },
    { k: 'soundLand', t: 'sound', l: 'Звук, когда карточка долетела до экрана (у чека — штамп «Оплачено»)' },
    { k: 'soundPrint', t: 'sound', l: 'Чек: звук печати' },
    { k: 'soundTear', t: 'sound', l: 'Чек: звук отрыва' },
    { k: 'soundVolume', t: 'range', l: 'Громкость звуков', suf: '%', min: 0, max: 100, step: 5 },
    { k: 'maxLength', t: 'number', l: 'Максимум символов в сообщении', suf: 'симв.', min: 20, max: 500 },
    { k: 'flySec', t: 'range', l: 'Длительность подлёта', suf: 'с', min: 0.8, max: 4, step: 0.1 },
    { k: 'holdMinSec', t: 'range', l: 'Минимум на экране', suf: 'с', min: 2, max: 60, step: 1 },
    { k: 'holdMaxSec', t: 'range', l: 'Максимум на экране (длинный текст)', suf: 'с', min: 5, max: 120, step: 1 },
    { k: 'scale', t: 'range', l: 'Размер карточки', suf: '%', min: 40, max: 180, step: 5 },
    { k: 'cardColor', t: 'color', l: 'Цвет карточки (пусто — цвет темы)' },
  ];
  const GROUPS = [
    ['show', 'Показ и тайминг', 'когда показывать, размер, время на экране', ["enabled", "look", "receiptTitle", "inMain", "minAmount", "scale", "flySec", "holdMinSec", "holdMaxSec", "maxLength"]],
    ['look', 'Оформление карточки', 'тема, цвет, плашка, текстура, рамка, свет', ["themed", "cardColor", "plateOpacity", "showSource", "texture", "texDim", "texOpacity", "frame", "frameW", "glow", "glowPower"]],
    ['fx', 'Элементы и эффекты', 'уровни доната, пульсация, печать текста, статистика', ["typeText", "pulse", "tiers", "tier1", "tier2", "tier3", "donorStat", "timeBar"]],
    ['voice', 'Озвучка', 'голос, громкость, что читать, «задонатил / задонатила»', ["speak", "voice", "volume", "readNick", "genderVerb", "genderUnknown", "genderList", "readMessage"]],
    ['sfx', 'Звуки', 'подлёт и приземление', ["soundFly", "soundLand", "soundPrint", "soundTear", "soundVolume"]],
  ];
  const groupOf = (k) => (GROUPS.find((g) => g[3].includes(k)) || GROUPS[0])[0];
  const groupBody = {};
  GROUPS.forEach(([id, title, sub]) => {
    const d = document.createElement('details'); d.className = 'da-group'; d.dataset.g = id;
    let open = false; try { open = localStorage.getItem('daGroup_' + id) === '1'; } catch (e) {}
    d.open = open;
    d.innerHTML = `<summary><span class="da-group-t">${title}</span><span class="da-group-s">${sub}</span></summary><div class="da-group-body"></div>`;
    d.addEventListener('toggle', () => { try { localStorage.setItem('daGroup_' + id, d.open ? '1' : '0'); } catch (e) {} });
    form.appendChild(d); groupBody[id] = d.querySelector('.da-group-body');
  });
  const inputs = {};
  FIELDS.forEach((f) => {
    const id = 'da_' + f.k;
    if (f.noRow) { inputs[f.k] = document.getElementById(id); return; }
    const row = document.createElement('div');
    row.className = 'toggle-row';
    let ctrl = '';
    if (f.t === 'toggle') ctrl = `<label class="toggle-switch"><input type="checkbox" id="${id}"><span class="toggle-slider"></span></label>`;
    else if (f.t === 'number') ctrl = `<div class="toggle-row-extra"><input type="number" id="${id}" min="${f.min}" max="${f.max}"><span class="toggle-row-suffix">${f.suf || ''}</span></div>`;
    else if (f.t === 'range') ctrl = `<div class="toggle-row-extra"><input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}"><span class="toggle-row-suffix" id="${id}_v" style="min-width:56px;text-align:right"></span></div>`;
    else if (f.t === 'sound') ctrl = `<div class="toggle-row-extra"><select id="${id}" style="max-width:230px"></select><button class="btn-tiny" type="button" id="${id}_pv">▶</button></div>`;
    else if (f.t === 'voice') ctrl = `<div class="toggle-row-extra"><select id="${id}" style="max-width:230px"></select><button class="btn-tiny" type="button" id="${id}_pv">▶</button></div>`;
    else if (f.t === 'texture') ctrl = `<div class="toggle-row-extra"><img id="${id}_img" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;display:none;border:1px solid var(--border,#444)"><input type="hidden" id="${id}"><button class="btn-tiny" type="button" id="${id}_up">Загрузить</button><button class="btn-tiny" type="button" id="${id}_del">Убрать</button><input type="file" id="${id}_file" accept=".jpg,.jpeg,.png,.webp,.gif,image/*" hidden></div>`;
    else if (f.t === 'select') ctrl = `<div class="toggle-row-extra"><select id="${id}">${f.opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></div>`;
    else if (f.t === 'text') ctrl = `<div class="toggle-row-extra"><input type="text" id="${id}" maxlength="30" style="width:200px"></div>`;
    else if (f.t === 'textarea') ctrl = `<div class="toggle-row-extra"><textarea id="${id}" rows="3" style="width:230px" placeholder="Maslino44ka = ж&#10;Toki0FF = м"></textarea></div>`;
    else if (f.t === 'color') ctrl = `<div class="toggle-row-extra"><input type="color" id="${id}"><button class="btn-tiny" type="button" id="${id}_clr">Из темы</button></div>`;
    row.innerHTML = `<span class="toggle-row-label">${f.l}</span>${ctrl}`;
    groupBody[groupOf(f.k)].appendChild(row);
    inputs[f.k] = row.querySelector('#' + id);
    if (f.t === 'range') inputs[f.k].addEventListener('input', () => { document.getElementById(id + '_v').textContent = inputs[f.k].value + ' ' + f.suf; });
    if (f.t === 'color') {
      inputs[f.k].addEventListener('input', () => { inputs[f.k].dataset.empty = ''; });
      row.querySelector('#' + id + '_clr').addEventListener('click', () => { inputs[f.k].dataset.empty = '1'; inputs[f.k].value = '#b14846'; });
    }
  });
  const say = (t, c) => { msgEl.textContent = t; msgEl.className = 'form-message' + (c ? ' ' + c : ''); };
  const api = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return r.json(); };
  function apply(s) {
    FIELDS.forEach((f) => {
      const el = inputs[f.k]; const v = s[f.k];
      if (f.t === 'toggle') el.checked = !!v;
      else if (f.t === 'voice' || f.t === 'sound' || f.t === 'font' || f.t === 'select' || f.t === 'text' || f.t === 'textarea' || f.t === 'texture') { el.value = v || ''; if (f.t === 'texture') showTex(); }
      else if (f.t === 'color') { el.dataset.empty = v ? '' : '1'; el.value = v || '#b14846'; }
      else { el.value = v; if (f.t === 'range') document.getElementById('da_' + f.k + '_v').textContent = v + ' ' + f.suf; }
    });
    syncBtns(); fontPreview(); const fb = document.getElementById('btnDaFont'); if (fb) fb.classList.toggle('on', !!inputs.font.value);
  }
  function syncBtns() {
    [['btnDaTheme', 'themed'], ['btnDaVoice', 'speak'], ['btnDaType', 'typeText']].forEach(([b, k]) => { const el = document.getElementById(b); if (!el) return; el.classList.toggle('on', !!inputs[k].checked); el.setAttribute('aria-pressed', String(!!inputs[k].checked)); });
  }
  function collect() {
    const o = {};
    FIELDS.forEach((f) => {
      const el = inputs[f.k];
      o[f.k] = f.t === 'toggle' ? el.checked : f.t === 'voice' || f.t === 'sound' || f.t === 'font' || f.t === 'select' || f.t === 'text' || f.t === 'textarea' || f.t === 'texture' ? el.value : f.t === 'color' ? (el.dataset.empty === '1' ? '' : el.value) : Number(el.value);
    });
    return o;
  }
  // текстура фона карточки: загрузка/удаление сразу на сервер, картинка попадает в настройки и в предпросмотр
  function showTex() {
    const img = document.getElementById('da_texture_img'); if (!img) return;
    const v = inputs.texture.value;
    img.style.display = v ? 'inline-block' : 'none'; img.src = v ? '/uploads/alert-texture/' + encodeURIComponent(v) : '';
    document.getElementById('da_texture_del').style.display = v ? '' : 'none';
  }
  document.getElementById('da_texture_up').addEventListener('click', () => document.getElementById('da_texture_file').click());
  document.getElementById('da_texture_file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    say('Загружаем текстуру…', '');
    try {
      const d = await (await fetch('/api/donation-alert/texture', { method: 'POST', body: fd })).json();
      if (!d.success) { say(d.error || 'Не удалось загрузить.', 'error'); return; }
      inputs.texture.value = d.settings.texture; showTex(); say('Текстура загружена.', 'success'); if (window.daPreviewPlay) window.daPreviewPlay();
    } catch (err) { say('Сетевая ошибка.', 'error'); }
  });
  document.getElementById('da_texture_del').addEventListener('click', async () => {
    try {
      const d = await (await fetch('/api/donation-alert/texture', { method: 'DELETE' })).json();
      if (d.success) { inputs.texture.value = ''; showTex(); say('Текстура убрана.', 'success'); if (window.daPreviewPlay) window.daPreviewPlay(); }
    } catch (err) { say('Сетевая ошибка.', 'error'); }
  });
  FIELDS.filter((f) => ['texDim', 'texOpacity', 'glowPower', 'frame', 'frameW'].includes(f.k)).forEach((f) => inputs[f.k].addEventListener('change', () => { if (window.daPreviewPlay) window.daPreviewPlay(); }));
  const voiceSel = inputs.voice;
  const loadVoices = () => fetch('/api/tts/catalog').then((r) => r.json()).then((d) => { const cur = voiceSel.value; voiceSel.innerHTML = '<option value="">Как в «Озвучке чата»</option>' + d.voices.map((v) => `<option value="${v.id}">${v.label}${v.experimental ? ' · экспериментальный' : ''}</option>`).join(''); voiceSel.value = cur; }).catch(() => {});
  document.getElementById('da_voice_pv').addEventListener('click', () => window.previewTtsVoice && window.previewTtsVoice(voiceSel.value, say));
  window.refreshAlertVoices = loadVoices;
  // библиотека звуков: два выпадающих списка с группами, ▶ — прослушать
  let sndAudio = null;
  const loadSounds = () => fetch('/api/alert-sounds').then((r) => r.json()).then((d) => {
    const groups = {};
    d.sounds.forEach((x) => { (groups[x.group] = groups[x.group] || []).push(x); });
    const html = '<option value="">— без звука —</option>' + Object.entries(groups).map(([g, a]) => `<optgroup label="${g}">${a.map((x) => `<option value="${x.file}">${x.label}${x.sec ? ' · ' + x.sec + ' с' : ''}</option>`).join('')}</optgroup>`).join('');
    ['soundFly', 'soundLand', 'soundPrint', 'soundTear'].forEach((k) => { const cur = inputs[k].value; inputs[k].innerHTML = html; inputs[k].value = cur; });
  }).catch(() => {});
  ['soundFly', 'soundLand', 'soundPrint', 'soundTear'].forEach((k) => document.getElementById('da_' + k + '_pv').addEventListener('click', () => {
    if (!inputs[k].value) return;
    if (sndAudio) sndAudio.pause();
    sndAudio = new Audio('/alert-sounds/' + encodeURIComponent(inputs[k].value)); sndAudio.volume = Math.min(1, Number(inputs.soundVolume.value) / 100); sndAudio.play().catch(() => {});
  }));
  loadSounds().then(loadVoices).then(() => (window.refreshAlertFonts ? window.refreshAlertFonts() : null)).then(() => fetch('/api/donation-alert')).then((r) => r.json()).then((d) => apply(d.settings)).catch(() => say('Не удалось загрузить настройки алерта.', 'error'));
  // шрифт алерта: встроенный список + свои шрифты; кнопка «Aa» открывает выбор, изменение сохраняется сразу
  const FONTS = ['Inter', 'Unbounded', 'Roboto', 'Montserrat', 'Oswald', 'Rubik', 'JetBrains Mono', 'Playfair Display', 'Poppins', 'Bebas Neue', 'Comfortaa', 'Press Start 2P', 'Nunito', 'Manrope', 'Space Grotesk'];
  // шрифты, которые стили оверлея подключают сами (файлы лежат в проекте): значение — имя семейства в стиле, подпись — шрифт и стиль
  const STYLE_FONTS = [['OvlInter', 'Inter — стили A Frost и F Discord'], ['OvlPlay', 'Play — стиль B Razer'], ['OvlTektur', 'Tektur — стиль C HUD'], ['OvlManrope', 'Manrope — стиль D Soft'], ['OvlPixel', 'Press Start 2P — стиль E Arcade'], ['OvlOswald', 'Oswald — стиль G Dota 2'], ['OvlForum', 'Forum — стиль H League of Legends'], ['OvlRobotoC', 'Roboto Condensed — стиль I Counter-Strike 2'], ['OvlPhilo', 'Philosopher — стиль J World of Warcraft'], ['OvlRusso', 'Russo One — стиль K Valorant'], ['OvlPixelify', 'Pixelify Sans — стиль L Minecraft'], ['OvlPlexMono', 'IBM Plex Mono — стиль M Строгий Mono'], ['OvlPlexSans', 'IBM Plex Sans — стиль N Строгий Light'], ['OvlExo', 'Exo 2 — стиль O Cyberpunk 2077']];
  const CLASSIC_NOTE = { Unbounded: 'заголовки классической темы', Inter: 'текст классической темы' };
  const fontSel = inputs.font;
  function fontPreview() {
    const pv = document.getElementById('daFontPreview'); if (!pv) return;
    pv.style.fontFamily = fontSel.value ? `'${fontSel.value}', system-ui, sans-serif` : '';
  }
  const loadFonts = () => fetch('/api/fonts/list').then((r) => r.json()).catch(() => ({ fonts: [] })).then((d) => {
    const cur = fontSel.value;
    const custom = (d.fonts || []);
    custom.forEach((f) => {
      if (document.getElementById('dafont-' + f.name.replace(/\s+/g, '-'))) return;
      const st = document.createElement('style'); st.id = 'dafont-' + f.name.replace(/\s+/g, '-');
      st.textContent = `@font-face { font-family: '${f.name}'; src: url('${f.url}') format('${f.format}'); font-display: swap; }`; document.head.appendChild(st);
    });
    const opt = (v, t) => `<option value="${v}">${t}</option>`;
    fontSel.innerHTML = '<option value="">Как в теме / стиле оверлея</option>'
      + '<optgroup label="Шрифты стилей оверлея (как у виджетов)">' + STYLE_FONTS.map(([v, t]) => opt(v, t)).join('') + '</optgroup>'
      + '<optgroup label="Классическая тема и обычные шрифты">' + FONTS.map((f) => opt(f, f + (CLASSIC_NOTE[f] ? ' — ' + CLASSIC_NOTE[f] : ''))).join('') + '</optgroup>'
      + (custom.length ? '<optgroup label="Свои шрифты">' + custom.map((f) => opt(f.name, f.name)).join('') + '</optgroup>' : '');
    fontSel.value = cur; fontPreview();
  });
  FONTS.forEach((f) => { if (!document.getElementById('dafontg-' + f.replace(/\s+/g, '-'))) { const l = document.createElement('link'); l.id = 'dafontg-' + f.replace(/\s+/g, '-'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;700&display=swap'; document.head.appendChild(l); } });
  const fontBtn = document.getElementById('btnDaFont'), fontPop = document.getElementById('daFontPop');
  fontBtn.addEventListener('click', () => { const open = fontPop.hidden; fontPop.hidden = !open; fontBtn.classList.toggle('on', open || !!fontSel.value); fontBtn.setAttribute('aria-pressed', String(open)); });
  fontSel.addEventListener('change', async () => {
    fontPreview(); fontBtn.classList.toggle('on', !!fontSel.value);
    try { const d = await api('/api/donation-alert', { font: fontSel.value }); if (d.success) { say('Шрифт алерта: ' + (d.settings.font || 'как в теме') + '.', 'success'); if (window.daPreviewPlay) window.daPreviewPlay(); } } catch (e) { say('Сетевая ошибка.', 'error'); }
  });
  window.refreshAlertFonts = loadFonts;
  // кнопки сверху: тема и озвучка сохраняются сразу (остальные поля формы не трогаем)
  const quick = (btnId, key, label) => document.getElementById(btnId).addEventListener('click', async () => {
    const want = !inputs[key].checked;
    try {
      const d = await api('/api/donation-alert', { [key]: want });
      if (d.success) { inputs[key].checked = !!d.settings[key]; syncBtns(); say(label + (d.settings[key] ? ': включено.' : ': выключено.'), 'success'); if (key === 'themed' && window.daPreviewPlay) window.daPreviewPlay(); }
    } catch (e) { say('Сетевая ошибка.', 'error'); }
  });
  quick('btnDaTheme', 'themed', 'Привязка к теме оверлея');
  quick('btnDaVoice', 'speak', 'Озвучка алерта');
  quick('btnDaType', 'typeText', 'Печать текста');
  FIELDS.filter((f) => f.k === 'themed' || f.k === 'speak' || f.k === 'typeText').forEach((f) => inputs[f.k].addEventListener('change', syncBtns));
  const cfgCard = document.getElementById('daCfgCard'), cfgBtn = document.getElementById('btnDaCfg');
  cfgBtn.addEventListener('click', () => { const open = cfgCard.hidden; cfgCard.hidden = !open; cfgBtn.classList.toggle('on', open); cfgBtn.setAttribute('aria-pressed', String(open)); if (open) cfgCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  document.getElementById('btnDaSave').addEventListener('click', async () => {
    try { const d = await api('/api/donation-alert', collect()); if (d.success) { apply(d.settings); say('Сохранено.', 'success'); } else say('Не удалось сохранить.', 'error'); } catch (e) { say('Сетевая ошибка.', 'error'); }
  });
  document.getElementById('btnDaReset').addEventListener('click', async () => {
    try { const d = await api('/api/donation-alert/reset'); if (d.success) { apply(d.settings); say('Возвращены значения по умолчанию.', 'success'); } } catch (e) { say('Сетевая ошибка.', 'error'); }
  });
  document.getElementById('btnDaTest').addEventListener('click', () => {
    api('/api/donation-alert/test', { username: document.getElementById('daTestNick').value, amount: Number(document.getElementById('daTestAmount').value), message: document.getElementById('daTestMsg').value, platform: document.getElementById('daTestPlatform').value }).catch(() => {});
  });
  document.getElementById('btnDaSkip').addEventListener('click', () => { api('/api/donation-alert/skip').catch(() => {}); });
})();

/* Алерт доната: ссылка для OBS и предпросмотр анимации */
(function () {
  const obsBtn = document.getElementById('btnDaObs');
  if (!obsBtn) return;
  const obsUrl = `http://localhost:${location.port || 3001}/overlay.html?only=donation`;
  obsBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(obsUrl); } catch (e) { const ta = document.createElement('textarea'); ta.value = obsUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    const old = obsBtn.dataset.tip; obsBtn.dataset.tip = 'Ссылка скопирована ✓\n' + obsUrl; obsBtn.classList.add('on');
    setTimeout(() => { obsBtn.dataset.tip = old; obsBtn.classList.remove('on'); }, 2200);
  });
  const box = document.getElementById('daPrev');
  const frame = document.getElementById('daPrevFrame');
  const fit = () => { const k = box.clientWidth / 1920; frame.style.transform = `scale(${k})`; box.style.height = (1080 * k) + 'px'; };
  fit(); window.addEventListener('resize', fit);
  new ResizeObserver(fit).observe(box);
  const val = (k, d) => { const el = document.getElementById('da_' + k); return el ? Number(el.value) : d; };
  function buildCard() {
    const amount = Math.max(1, Number(document.getElementById('daTestAmount').value) || 500);
    let msg = String(document.getElementById('daTestMsg').value || '').replace(/\s+/g, ' ').trim();
    const maxLen = val('maxLength', 200); if (msg.length > maxLen) msg = msg.slice(0, maxLen).trim() + '…';
    const colorEl = document.getElementById('da_cardColor');
    const chk = (k) => !document.getElementById('da_' + k) || document.getElementById('da_' + k).checked;
    const tiersOn = chk('tiers');
    const card = {
      username: document.getElementById('daTestNick').value || 'Аноним', amount,
      amountText: amount.toLocaleString('ru-RU') + ' ₽', message: msg,
      holdMin: val('holdMinSec', 5), holdMax: val('holdMaxSec', 25), flySec: val('flySec', 1.8), scale: val('scale', 100),
      color: colorEl && colorEl.dataset.empty !== '1' ? colorEl.value : '', volume: 0,
      soundFly: document.getElementById('da_soundFly').value, soundLand: document.getElementById('da_soundLand').value, soundVolume: val('soundVolume', 70),
      font: document.getElementById('da_font') ? document.getElementById('da_font').value : '',
      plateOpacity: val('plateOpacity', 100), pulse: !document.getElementById('da_pulse') || document.getElementById('da_pulse').checked,
      typeText: !document.getElementById('da_typeText') || document.getElementById('da_typeText').checked, typeLead: 0.3,
      source: (!document.getElementById('da_showSource') || document.getElementById('da_showSource').checked) ? (document.getElementById('daTestPlatform').value === 'donatex' ? 'DX' : 'DA') : '',
      themed: !document.getElementById('da_themed') || document.getElementById('da_themed').checked,
      texture: document.getElementById('da_texture') && document.getElementById('da_texture').value ? '/uploads/alert-texture/' + encodeURIComponent(document.getElementById('da_texture').value) : '',
      texDim: val('texDim', 35), texOpacity: val('texOpacity', 100),
      tier: tiersOn ? (amount >= val('tier3', 15000) ? 3 : amount >= val('tier2', 5000) ? 2 : amount >= val('tier1', 1000) ? 1 : 0) : 0,
      glow: chk('glow'), glowPower: val('glowPower', 70), frameW: val('frameW', 4),
      timeBar: chk('timeBar'), stat: chk('donorStat') ? 'Донат №3 · всего 1 500 ₽' : '',
    };
    { const fr = document.getElementById('da_frame') ? document.getElementById('da_frame').value : 'tier'; card.frame = fr === 'tier' ? ['', 'flow', 'comet', 'gold'][card.tier] : fr; }
    card.tierLabel = ['донат', 'крупный донат', 'огромный донат', 'легендарный донат'][card.tier];
    const val_s = (k) => (document.getElementById('da_' + k) || {}).value || '';
    { let lk = document.getElementById('da_look') ? document.getElementById('da_look').value : 'card'; if (lk === 'random') lk = 'card';
      if (lk === 'receipt') card.receipt = { soundPrint: val_s('soundPrint'), soundTear: val_s('soundTear'), title: (document.getElementById('da_receiptTitle') || {}).value || 'ДОНАТ-КАССА', no: 3 };
      if (lk === 'slots') card.slots = true; }
    return card;
  }
  let ready = false;
  frame.addEventListener('load', () => { ready = true; });
  const play = () => { if (ready) frame.contentWindow.postMessage({ type: 'da_preview', card: buildCard() }, '*'); };
  window.daPreviewPlay = play;
  document.getElementById('btnDaPrevPlay').addEventListener('click', play);
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'da_preview_done' && document.getElementById('daPrevLoop').checked) setTimeout(play, 900);
  });
})();

/* Озвучка: прослушивание голоса и каталог голосов (скачивание в папку voices) */
(function () {
  const box = document.getElementById('ttsCatalog');
  if (!box) return;
  let audio = null;
  window.previewTtsVoice = async (voice, say) => {
    const msg = (t, c) => { if (say) say(t, c); else { const m = document.getElementById('ttsCatalogMessage'); m.textContent = t; m.className = 'form-message' + (c ? ' ' + c : ''); } };
    msg('Озвучиваем пример…', '');
    try {
      const r = await fetch('/api/tts/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice }) });
      const d = await r.json();
      if (!d.success) { msg(d.error || 'Не удалось озвучить.', 'error'); return; }
      if (audio) audio.pause();
      audio = new Audio(d.audio); audio.play().catch(() => {});
      msg('', '');
    } catch (e) { msg('Сетевая ошибка.', 'error'); }
  };
  document.getElementById('btnTtsVoicePreview').addEventListener('click', () => window.previewTtsVoice(document.getElementById('ttsVoice').value));
  document.getElementById('ttsVoice').addEventListener('change', () => setTimeout(load, 50));
  window.reloadTtsCatalog = () => load();
  let timer = null;
  async function load() {
    let d;
    try { d = await (await fetch('/api/tts/catalog')).json(); } catch (e) { return; }
    const curVoice = (document.getElementById('ttsVoice') || {}).value;
    const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>';
    box.innerHTML = d.catalog.map((c) => {
      const st = c.install;
      const ready = c.online || c.installed;
      const on = ready && c.id === curVoice;
      let right;
      if (on) right = '<span class="ui3-chip acc">Выбран</span>';
      else if (ready) right = `<button class="btn btn-secondary btn-sm" data-use="${c.id}" type="button">Выбрать</button>`;
      else if (st && st.state === 'run') right = `<span class="ui3-chip">Скачивается… ${Math.min(99, Math.round(st.done / st.total * 100))}%</span>`;
      else right = `<button class="btn btn-secondary btn-sm" data-dl="${c.id}" type="button">Скачать</button>`;
      const eng = c.engine.toLowerCase();
      const tags = [c.engine === 'Edge' ? 'Edge · онлайн' : c.engine === 'Silero' ? 'Silero · нужен Python' : 'Piper · без интернета', c.lang === 'ru' ? 'Русский' : 'Многоязычный'];
      if (c.experimental) tags.push('Экспериментальный');
      return `<div class="ui3-voice${on ? ' on' : ''}" data-engine="${eng}" data-search="${(c.label + ' ' + c.gender + ' ' + c.engine + ' ' + (c.note || '')).toLowerCase().replace(/"/g, '')}">
        <div class="ui3-voice-top"><button class="ui3-play" type="button" ${ready ? `data-pv="${c.id}"` : 'disabled'} title="${ready ? 'Прослушать' : 'Сначала скачай голос'}">${PLAY}</button>
        <div class="l"><b>${c.label}</b><span>${c.gender}</span></div>${right}</div>
        <div class="ui3-voice-tags">${tags.map((t) => `<span class="ui3-chip">${t}</span>`).join('')}</div>
        ${st && st.state === 'error' ? `<div class="ui3-voice-err">Ошибка: ${st.error}</div>` : c.note ? `<div class="ui3-voice-note">${c.note}</div>` : ''}
      </div>`;
    }).join('');
    box.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
      const sel = document.getElementById('ttsVoice');
      if (!sel) return;
      if (![...sel.options].some((o) => o.value === b.dataset.use)) { const o = document.createElement('option'); o.value = b.dataset.use; o.textContent = b.dataset.use; sel.appendChild(o); }
      sel.value = b.dataset.use;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      load();
    }));
    box.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      await fetch('/api/tts/voices/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.dl }) });
      load();
    }));
    box.querySelectorAll('[data-pv]').forEach((b) => b.addEventListener('click', () => window.previewTtsVoice(b.dataset.pv)));
    const running = d.catalog.some((c) => c.install && c.install.state === 'run');
    clearTimeout(timer);
    if (running) timer = setTimeout(load, 1500);
    else {
      // список голосов в выпадающих списках обновляем после установки
      const sel = document.getElementById('ttsVoice');
      if (sel) { const cur = sel.value; sel.innerHTML = d.voices.map((v) => `<option value="${v.id}">${v.label}${v.experimental ? ' · экспериментальный' : ''}</option>`).join(''); if (d.voices.some((v) => v.id === cur)) sel.value = cur; }
      if (window.refreshAlertVoices) window.refreshAlertVoices();
    }
  }
  load();
})();


/* Вкладка «Алерты»: переключение разделов (Донат, Подписка, …) */
(function () {
  const tabs = document.querySelectorAll('#tab-donalerts .pixel-subtab[data-da-pane]');
  if (!tabs.length) return;
  const show = (id) => {
    tabs.forEach((b) => { const on = b.dataset.daPane === id; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('#tab-donalerts .da-pane').forEach((p) => { p.hidden = p.dataset.daPane !== id; });
    try { localStorage.setItem('daPane', id); } catch (e) {}
  };
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.daPane)));
  show('donation');
})();

/* Вкладка «Алерты»: события Twitch — подписки, рейд, фоллоу, Hype Train, баллы канала (общий конструктор панелей) */
(function () {
  const panes = document.querySelectorAll('#tab-donalerts .da-evpane');
  if (!panes.length) return;
  const T = (k, l, v, extra) => ({ k, l, v, ...(extra || {}) });
  const tierOpts = [['1000', 'Tier 1'], ['2000', 'Tier 2'], ['3000', 'Tier 3'], ['prime', 'Prime']];
  const PH = 'Подстановки: {user} — ник; {а} — окончание «а» для женских ников (оформил{а}).';
  const EV = {
    sub: {
      note: 'Новая подписка, продление и подарок подписки в одном алерте. События Twitch: channel.subscribe, channel.subscription.message, channel.subscription.gift. Нужен вход через Twitch.',
      test: [T('type', 'Событие', 'new', { t: 'select', opts: [['new', 'Новая подписка'], ['resub', 'Продление подписки'], ['gift', 'Подарок подписки']] }), T('username', 'Ник', 'MrFrost'), T('tier', 'Уровень', '1000', { t: 'select', opts: tierOpts }),
        T('months', 'Месяцев всего (продление)', 6, { t: 'number' }), T('streak', 'Месяцев подряд (продление)', 6, { t: 'number' }), T('count', 'Сколько подарено', 5, { t: 'number' }), T('no', '№ подписчика', 147, { t: 'number' })],
      fields: [['enabled', 'toggle', 'Показывать алерты подписок'], ['style', 'select', 'Вид алерта', [['ticket', 'Билет-абонемент'], ['card', 'Карточка']]], ['showNumber', 'toggle', '№ подписчика на билете'], ['numberStart', 'number', 'Нумерация после № (0 — с первого)'], ['holdSec', 'number', 'Сколько секунд билет на экране (3–30)'],
        ['soundPre', 'sound', 'Звук перед вылетом (оповещение)'], ['soundFly', 'sound', 'Звук вылета билета'], ['soundStamp', 'sound', 'Звук штампа'], ['soundTear', 'sound', 'Звук отрыва корешка'], ['showNew', 'toggle', 'Новая подписка'], ['showResub', 'toggle', 'Продление подписки'], ['showGift', 'toggle', 'Подарок подписки'],
        ['soundVolume', 'range', 'Громкость звуков'], ['voiceVolume', 'range', 'Громкость озвучки'], ['speak', 'toggle', 'Озвучивать'], ['voice', 'voice', 'Голос'], ['color', 'color', 'Цвет карточки'],
        ['speechNew', 'text', 'Текст озвучки: новая подписка'], ['speechResub', 'text', 'Текст озвучки: продление'], ['speechGift', 'text', 'Текст озвучки: подарок']],
      hint: PH + ' Ещё: {tier}, {months}, {monthsWord}, {streak}, {count}, {subsWord}.',
    },
    raid: {
      note: 'К вам пришёл рейд. Событие Twitch: channel.raid.',
      test: [T('username', 'Канал рейдера', 'NeoSamurai'), T('viewers', 'Зрителей', 127, { t: 'number' }), T('game', 'Во что играли', 'Elden Ring'), T('title', 'Название стрима', 'Первое прохождение без смертей')],
      fields: [['enabled', 'toggle', 'Показывать алерт рейда'], ['style', 'select', 'Вид алерта', [['radar', 'Радар (зрители — точки на радаре)'], ['card', 'Табло (HUD-карточка с «толпой» зрителей)'], ['plain', 'Простая карточка']]], ['minViewers', 'number', 'Показывать от (зрителей)'], ['holdSec', 'number', 'Сколько секунд держать после подсчёта (3–30)'], ['showGame', 'toggle', 'Показывать, во что играл рейдер'], ['siren', 'toggle', 'Радар: тихая сирена-тревога в начале'],
        ['soundSiren', 'sound', 'Радар: звук сирены'], ['soundPing', 'sound', 'Радар: звук пинга'], ['soundIn', 'sound', 'Табло: звук появления'], ['soundDone', 'sound', 'Табло: звук, когда счётчик досчитал'], ['soundTick', 'sound', 'Звук счётчика (оба вида)'], ['soundVolume', 'range', 'Громкость звуков'], ['voiceVolume', 'range', 'Громкость озвучки'], ['speak', 'toggle', 'Озвучивать'], ['voice', 'voice', 'Голос'], ['color', 'color', 'Цвет (пусто — зелёный у радара, оранжевый у билета)'], ['speech', 'text', 'Текст озвучки']],
      hint: PH + ' Ещё: {viewers}, {viewersWord}.',
    },
    follow: {
      note: 'Новый фолловер. Все фолловеры и даты фоллоу хранятся навсегда (follow_registry.json): новые добавляются по событию, уже существующих можно подтянуть кнопкой. Событие Twitch: channel.follow (v2). Нужно право moderator:read:followers — после обновления войдите через Twitch заново.',
      test: [T('username', 'Ник', 'MrFrost')],
      fields: [['enabled', 'toggle', 'Показывать алерт фоллоу'], ['style', 'select', 'Вид алерта', [['wall', 'Стена стикеров (все фолловеры)'], ['badge', 'Пропуск на ленте (с аватаркой)'], ['card', 'Карточка']]], ['holdSec', 'number', 'Сколько секунд на экране (3–30)'], ['soundFly', 'sound', 'Звук появления (пропуск)'], ['soundStick', 'sound', 'Звук шлепка стикера / штампа'], ['wallsync', 'sync', 'Фолловеры в стене'], ['soundVolume', 'range', 'Громкость звуков'], ['voiceVolume', 'range', 'Громкость озвучки'], ['speak', 'toggle', 'Озвучивать'], ['voice', 'voice', 'Голос'], ['color', 'color', 'Цвет карточки'], ['big', 'text', 'Крупный текст на карточке'], ['speech', 'text', 'Текст озвучки']],
      hint: PH,
    },
    hype: {
      note: 'Hype Train: начало, новый уровень и завершение. События Twitch: channel.hype_train.begin / progress / end (v2). Нужно право channel:read:hype_train — после обновления войдите через Twitch заново.',
      test: [T('phase', 'Этап', 'begin', { t: 'select', opts: [['begin', 'Начало'], ['level', 'Новый уровень'], ['end', 'Завершение']] }), T('level', 'Уровень', 2, { t: 'number' }), T('total', 'Всего очков', 1800, { t: 'number' })],
      fields: [['enabled', 'toggle', 'Показывать алерты Hype Train'], ['onBegin', 'toggle', 'Начало'], ['onLevel', 'toggle', 'Новый уровень'], ['onEnd', 'toggle', 'Завершение'], ['soundFly', 'sound', 'Звук появления карточки'], ['soundLand', 'sound', 'Звук приземления карточки'], ['soundVolume', 'range', 'Громкость звуков'], ['voiceVolume', 'range', 'Громкость озвучки'], ['speak', 'toggle', 'Озвучивать'], ['voice', 'voice', 'Голос'], ['color', 'color', 'Цвет карточки'],
        ['speechBegin', 'text', 'Текст озвучки: начало'], ['speechLevel', 'text', 'Текст озвучки: уровень'], ['speechEnd', 'text', 'Текст озвучки: завершение']],
      hint: 'Подстановки: {level} — уровень, {points} — очки.',
    },
    points: {
      note: 'Награды за баллы канала. Событие Twitch: channel.channel_points_custom_reward_redemption.add.',
      test: [T('username', 'Ник', 'MrFrost'), T('reward', 'Награда', 'Выпей воды'), T('cost', 'Стоимость, баллов', 500, { t: 'number' }), T('input', 'Сообщение зрителя', 'Пей воду!')],
      fields: [['enabled', 'toggle', 'Показывать алерты наград'], ['minCost', 'number', 'Показывать от (баллов)'], ['rewards', 'textarea', 'Только эти награды (по строке; пусто — все)'], ['soundFly', 'sound', 'Звук появления карточки'], ['soundLand', 'sound', 'Звук приземления карточки'], ['soundVolume', 'range', 'Громкость звуков'], ['voiceVolume', 'range', 'Громкость озвучки'], ['speak', 'toggle', 'Озвучивать'], ['voice', 'voice', 'Голос'], ['readMessage', 'toggle', 'Читать сообщение зрителя'], ['color', 'color', 'Цвет карточки'], ['speech', 'text', 'Текст озвучки']],
      hint: PH + ' Ещё: {reward} — название награды, {cost} — стоимость.',
    },
    streak: {
      note: 'Серия просмотров зрителя (watch streak): Twitch пишет в чат, когда зритель смотрит стримы подряд, и даёт ему баллы. Алерт показывается, когда зритель сам делится серией в чате. Событие приходит из чата, отдельный вход через Twitch не нужен.',
      test: [T('username', 'Ник', 'MrFrost'), T('streak', 'Стримов подряд', 7, { t: 'number' }), T('points', 'Баллов канала', 450, { t: 'number' })],
      fields: [['enabled', 'toggle', 'Показывать алерты серий просмотров'], ['style', 'select', 'Вид плашки', [['pill', 'Огонёк-пилюля'], ['chat', 'Реплика в чате'], ['ring', 'Кольцо серии'], ['checkin', 'Чек-ин'], ['flip', 'Табло с цифрами'], ['glass', 'Матовое стекло']]], ['corner', 'select', 'Угол экрана', [['bl', 'Слева внизу'], ['br', 'Справа внизу'], ['tl', 'Слева вверху'], ['tr', 'Справа вверху']]], ['holdSec', 'number', 'Сколько секунд показывать'], ['size', 'number', 'Размер плашки, % (50–200)'], ['minStreak', 'number', 'Показывать от (стримов подряд)'], ['showPoints', 'toggle', 'Показывать полученные баллы'], ['soundFly', 'sound', 'Звук появления карточки'], ['soundLand', 'sound', 'Звук приземления карточки'], ['soundVolume', 'range', 'Громкость звуков'], ['voiceVolume', 'range', 'Громкость озвучки'], ['speak', 'toggle', 'Озвучивать'], ['voice', 'voice', 'Голос'], ['color', 'color', 'Цвет карточки'],
        ['speech', 'text', 'Текст озвучки']],
      hint: PH + ' Ещё: {streak} — стримов подряд, {streamsWord} — «стрим/стрима/стримов», {points} — баллы.',
    },
    nowplaying: {
      note: 'Закреплённая карточка «Сейчас играет»: обложка, название, сколько прошло и сколько всего. Данные берутся из медиа-сессий Windows (Chrome, Edge, Яндекс Браузер, Spotify, VLC и другие плееры) и из расширения браузера, которое читает видео и аудио на любом сайте (установка — в блоке «Расширение браузера» выше). Системное чтение работает только на Windows 10/11, расширение — на любой системе.',
      test: [],
      preview: '/nowplaying-preview.html',
      fields: [['enabled', 'toggle', 'Показывать «Сейчас играет»'], ['style', 'select', 'Вид', [['card', 'Широкая лента (обложка, название, время)'], ['cols', 'Две колонки (крупное время слева)'], ['mini', 'Мини: скраббер (название, время, шкала)'], ['vbar', 'Мини: вертикальный акцент'], ['bigtime', 'Мини: крупное время'], ['corners', 'Мини: уголки']]], ['bgOpacity', 'range', 'Непрозрачность фона (лента и две колонки), % (0 — без фона)'], ['corner', 'select', 'Угол экрана', [['bl', 'Слева внизу'], ['br', 'Справа внизу'], ['tl', 'Слева вверху'], ['tr', 'Справа вверху']]], ['size', 'number', 'Размер карточки, % (50–200)'], ['showCover', 'toggle', 'Показывать обложку (если у трека/фильма она есть)'], ['showSource', 'toggle', 'Показывать, откуда играет (Chrome, Spotify…)'], ['showOthers', 'toggle', 'Показывать «Ещё открыто» (другие источники)'], ['hideWhenPaused', 'toggle', 'Прятать, когда ничего не играет (пауза)'], ['hideDelaySec', 'number', 'Через сколько секунд прятать'], ['minDurationSec', 'number', 'Не показывать короче N секунд (0 — всё)'], ['color', 'color', 'Цвет полоски и акцентов'],
        ['browsers', 'text', 'Искать только в этих браузерах (через запятую: chrome, firefox, edge, yandex, opera; пусто — во всех)'],
        ['byTitle', 'toggle', 'Распознавать сайты по заголовку вкладки (если браузер не отдаёт данные о воспроизведении; времени и обложки тогда нет)'],
        ['sites', 'text', 'Свои сайты для распознавания по заголовку (через запятую, часть названия вкладки: например, mysite, kino)'],
        ['ignoreApps', 'text', 'Не показывать эти источники (через запятую, например: spotify, discord)']],
      hint: 'Если ничего не отображается: убедись, что в браузере реально играет видео или музыка и вкладка не заглушена. Сайты без поддержки управления медиа (редкие плееры) Windows не видит. Прямые трансляции показывают только время «прошло».',
    },
  };
  const api = async (url, body, method) => { const r = await fetch(url, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) }); return r.json(); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let voiceOptions = '<option value="">Как у доната / из «Озвучки чата»</option>';
  fetch('/api/tts/catalog').then((r) => r.json()).then((d) => { voiceOptions += d.voices.map((v) => `<option value="${v.id}">${v.label}</option>`).join(''); document.querySelectorAll('.ev-voice').forEach((s) => { const c = s.value; s.innerHTML = voiceOptions; s.value = c; }); }).catch(() => {});

  panes.forEach((root) => {
    const kind = root.dataset.kind, cfg = EV[kind];
    const tests = cfg.test.map((f) => {
      const id = `ev_${kind}_t_${f.k}`;
      const ctl = f.t === 'select' ? `<select id="${id}">${f.opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>` : `<input type="${f.t === 'number' ? 'number' : 'text'}" id="${id}" value="${esc(f.v)}">`;
      return `<div class="field"><label for="${id}">${f.l}</label>${ctl}</div>`;
    }).join('');
    const rows = cfg.fields.map(([k, t, l, opts]) => {
      const id = `ev_${kind}_${k}`; let ctl = '';
      if (t === 'toggle') ctl = `<label class="toggle-switch"><input type="checkbox" id="${id}"><span class="toggle-slider"></span></label>`;
      else if (t === 'number') ctl = `<div class="toggle-row-extra"><input type="number" id="${id}" min="0"></div>`;
      else if (t === 'range') ctl = `<div class="toggle-row-extra"><input type="range" id="${id}" min="0" max="100" step="5" style="width:170px"><span id="${id}_v" style="min-width:42px;text-align:right;font-variant-numeric:tabular-nums"></span></div>`;
      else if (t === 'text') return `<div class="field" style="margin:10px 0 0"><label for="${id}">${l}</label><input type="text" id="${id}" maxlength="200"></div>`;
      else if (t === 'textarea') return `<div class="field" style="margin:10px 0 0"><label for="${id}">${l}</label><textarea id="${id}" rows="3" style="width:100%"></textarea></div>`;
      else if (t === 'sync') ctl = `<div class="toggle-row-extra"><span class="card-hint" id="${id}_st" style="margin:0 10px 0 0"></span><button class="btn-tiny" type="button" id="${id}">Подтянуть всех из Twitch</button></div>`;
      else if (t === 'sound') ctl = `<div class="toggle-row-extra"><select id="${id}" class="ev-snd" style="max-width:230px"></select><button class="btn-tiny" type="button" id="${id}_pv">▶</button></div>`;
      else if (t === 'select') ctl = `<div class="toggle-row-extra"><select id="${id}">${opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></div>`;
      else if (t === 'voice') ctl = `<div class="toggle-row-extra"><select id="${id}" class="ev-voice" style="max-width:230px">${voiceOptions}</select></div>`;
      else if (t === 'color') ctl = `<div class="toggle-row-extra"><input type="color" id="${id}"><button class="btn-tiny" type="button" id="${id}_clr">Из темы</button></div>`;
      return `<div class="toggle-row"><span class="toggle-row-label">${l}</span>${ctl}</div>`;
    }).join('');
    root.innerHTML = `
      <div class="da-main"><div class="card">${tests}${kind === 'nowplaying' ? `<div class="np-extbox" style="margin:0 0 12px;padding:12px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:10px"><b>Расширение браузера</b>
          <p class="card-hint" style="margin:4px 0 8px" data-a="extst">Проверяю…</p>
          <ol class="card-hint" style="margin:0 0 8px;padding-left:18px;line-height:1.6">
            <li>Нажми «Открыть страницу расширений» и включи там «Режим разработчика» (переключатель вверху справа).</li>
            <li>Нажми «Загрузить распакованное».</li>
            <li>Выбери папку с расширением. Её путь:</li></ol>
          <div class="toggle-row-extra" style="margin:0 0 8px"><input type="text" readonly data-a="extdir" style="flex:1;min-width:0" value="…"><button class="btn-tiny" type="button" data-a="extcopy">Копировать</button><button class="btn-tiny" type="button" data-a="extfolder">Открыть папку</button></div>
          <div class="actions" style="margin:0"><select data-a="extbr" style="max-width:150px"><option value="chrome">Google Chrome</option><option value="edge">Microsoft Edge</option><option value="other">Другой браузер</option></select><button class="btn btn-primary" type="button" data-a="extinstall">Открыть страницу расширений</button></div>
          <p class="card-hint" style="margin:8px 0 0">В другом браузере открой страницу расширений сам (Яндекс: browser://extensions, Opera: opera://extensions, Brave: brave://extensions). Расширение ставится один раз, потом статус выше станет «подключено».</p></div>` : ''}
        <div class="actions"><button class="btn btn-primary" type="button" data-a="test">Тест алерта</button><button class="btn btn-secondary" type="button" data-a="skip">Пропустить текущий</button></div>
        <p class="card-hint" style="margin:8px 0 0">Тест и предпросмотр используют сохранённые настройки. Внешний вид (тема, рамка, свет, шрифт, звуки, время на экране) общий с разделом «Донат».</p></div></div>
      <div class="da-mid"><div class="card" data-a="cfgcard" hidden><h2 class="section-title">Настройки события</h2><p class="card-hint">${esc(cfg.note)}</p>${rows}
        <p class="card-hint" style="margin-top:10px">${esc(cfg.hint)}</p>
        <div class="actions"><button class="btn btn-primary" type="button" data-a="save">Сохранить</button><button class="btn btn-secondary" type="button" data-a="reset">Сбросить</button></div>
        <div class="form-message" data-a="msg"></div></div></div>
      <div class="da-side"><div class="da-prev"><iframe src="${cfg.preview || '/overlay.html?only=donation&preview=1'}" title="Предпросмотр"></iframe></div>
        <div class="da-ctrl"><button class="dbtn" data-a="cfg" type="button" aria-pressed="false" data-tip="Настройки алерта"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg></button><button class="dbtn" data-a="obs" type="button" data-tip="Скопировать ссылку для OBS&#10;Источник «Браузер» 1920×1080, фон прозрачный"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1"/></svg></button><span class="da-ctrl-gap"></span><button class="btn-tiny" type="button" data-a="play">▶ Анимация</button><label class="da-loop"><input type="checkbox" data-a="loop"> ↻</label></div></div>`;
    const $ = (sel) => root.querySelector(sel);
    const btn = (a) => root.querySelector(`[data-a="${a}"]`);
    const el = (k) => document.getElementById(`ev_${kind}_${k}`);
    const say = (t, c) => { const m = btn('msg'); m.textContent = t; m.className = 'form-message' + (c ? ' ' + c : ''); };
    const testData = () => { const o = {}; cfg.test.forEach((f) => { const v = document.getElementById(`ev_${kind}_t_${f.k}`).value; o[f.k] = f.t === 'number' ? Number(v) : v; }); return o; };
    const apply = (s) => cfg.fields.forEach(([k, t]) => {
      const e = el(k); if (!e) return; const v = s[k];
      if (t === 'toggle') e.checked = !!v; else if (t === 'range') { e.value = v == null ? 100 : v; const lv = document.getElementById(`ev_${kind}_${k}_v`); if (lv) lv.textContent = e.value + '%'; } else if (t === 'color') { e.dataset.empty = v ? '' : '1'; e.value = v || '#b14846'; } else e.value = v == null ? '' : v;
    });
    const collect = () => { const o = {}; cfg.fields.forEach(([k, t]) => { const e = el(k); o[k] = t === 'toggle' ? e.checked : (t === 'number' || t === 'range') ? Number(e.value) : t === 'color' ? (e.dataset.empty === '1' ? '' : e.value) : e.value; }); return o; };
    if (kind === 'nowplaying') {
      const est = $('[data-a="extst"]');
      const refreshExt = () => { if (!root.isConnected) return; fetch('/api/nowplaying').then((r) => r.json()).then((d) => { const x = d.state && d.state.diag && d.state.diag.ext; est.textContent = x && x.fresh ? 'Расширение подключено' + (x.browser ? ' (' + x.browser + ')' : '') + ', видео и аудио на вкладках: ' + x.count + '.' : 'Расширение не подключено.'; est.style.color = x && x.fresh ? '#4cc38a' : ''; }).catch(() => {}); };
      refreshExt(); setInterval(refreshExt, 2500);
      let extDir = '';
      fetch('/api/nowplaying/extension').then((r) => r.json()).then((d) => { extDir = d.dir || ''; $('[data-a="extdir"]').value = extDir; if (d.store) { const bt = btn('extinstall'); bt.textContent = 'Открыть магазин расширений'; bt.dataset.store = d.store; } }).catch(() => {});
      btn('extcopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(extDir); } catch (e) { $('[data-a="extdir"]').select(); } btn('extcopy').textContent = 'Скопировано'; setTimeout(() => { btn('extcopy').textContent = 'Копировать'; }, 1500); });
      btn('extfolder').addEventListener('click', async () => { let d = {}; try { d = await api('/api/nowplaying/extension/install', { what: 'folder' }); } catch (e) { d = {}; } if (!d.dir && !extDir) say('Не удалось открыть папку', 'error'); else if (!d.opened && window.navigator.platform && !/win/i.test(window.navigator.platform)) say('Путь к папке скопируй из поля выше.'); });
      btn('extinstall').addEventListener('click', async () => {
        const bt = btn('extinstall');
        if (bt.dataset.store) { window.open(bt.dataset.store, '_blank', 'noopener'); return; }
        const b = btn('extbr').value;
        let d = {}; try { d = await api('/api/nowplaying/extension/install', { browser: b, what: 'page' }); } catch (e) { d = {}; }
        if (!d.opened) { try { await navigator.clipboard.writeText(d.page || 'chrome://extensions'); } catch (e) { /* вручную */ } window.ui3Alert('Страницу расширений браузер открыть не позволяет\n\nАдрес ' + (d.page || 'chrome://extensions') + ' скопирован в буфер: вставь его в адресную строку браузера и нажми Enter. Дальше идут шаги 1–3 из списка.'); }
      });
    }
    if (kind === 'follow') {
      const sb = el('wallsync'), st = document.getElementById('ev_follow_wallsync_st');
      const showStat = () => fetch('/api/follow-wall').then((r) => r.json()).then((d) => { st.textContent = d.count ? `в базе: ${d.count}` + (d.syncedAt ? '' : ' (из Twitch ещё не подтягивали)') : 'пока пусто'; }).catch(() => {});
      showStat();
      sb.addEventListener('click', async () => {
        sb.disabled = true; st.textContent = 'загружаю…';
        try { const d = await api('/api/follow-wall/sync'); st.textContent = d.success ? `готово: +${d.added}, всего ${d.count}` : (d.error || 'ошибка'); if (!d.success) say(d.error || 'Не удалось подтянуть фолловеров.', 'error'); else say('Фолловеры подтянуты.', 'success'); }
        catch (e) { st.textContent = 'сетевая ошибка'; }
        sb.disabled = false;
      });
    }
    cfg.fields.filter((f) => f[1] === 'range').forEach(([k]) => { const e = el(k), lv = document.getElementById(`ev_${kind}_${k}_v`); e.addEventListener('input', () => { if (lv) lv.textContent = e.value + '%'; }); });
    const sndKeys = cfg.fields.filter((f) => f[1] === 'sound').map((f) => f[0]);
    if (sndKeys.length) {
      let sa = null;
      sndKeys.forEach((k) => document.getElementById(`ev_${kind}_${k}_pv`).addEventListener('click', () => {
        if (!el(k).value) return; if (sa) sa.pause();
        sa = new Audio('/alert-sounds/' + encodeURIComponent(el(k).value)); sa.volume = 0.7; sa.play().catch(() => {});
      }));
      window.evLoadSounds = window.evLoadSounds || {};
      window.evLoadSounds[kind] = () => fetch('/api/alert-sounds').then((r) => r.json()).then((d) => {
        const groups = {}; d.sounds.forEach((x) => { (groups[x.group] = groups[x.group] || []).push(x); });
        const mine = (g) => /^Билет/.test(g);
        const ord = Object.entries(groups).sort((a, b) => (mine(b[0]) - mine(a[0])));
        const html = '<option value="">— без звука —</option>' + ord.map(([g, a]) => `<optgroup label="${g}">${a.map((x) => `<option value="${x.file}">${x.label}${x.sec ? ' · ' + x.sec + ' с' : ''}</option>`).join('')}</optgroup>`).join('');
        sndKeys.forEach((k) => { const cur = el(k).value; el(k).innerHTML = html; el(k).value = cur; });
      }).catch(() => {});
    }
    cfg.fields.filter((f) => f[1] === 'color').forEach(([k]) => {
      el(k).addEventListener('input', () => { el(k).dataset.empty = ''; });
      document.getElementById(`ev_${kind}_${k}_clr`).addEventListener('click', () => { el(k).dataset.empty = '1'; el(k).value = '#b14846'; });
    });
    // предпросмотр: карточка строится на сервере по сохранённым настройкам и отправляется в iframe
    const box = $('.da-prev'), frame = box.querySelector('iframe');
    const fit = () => { const k = box.clientWidth / 1920; frame.style.transform = `scale(${k})`; box.style.height = (1080 * k) + 'px'; };
    fit(); window.addEventListener('resize', fit); new ResizeObserver(fit).observe(box);
    let ready = false; frame.addEventListener('load', () => { ready = true; });
    const play = async () => {
      if (!ready) return;
      try { const d = await api(`/api/event-alerts/${kind}/card`, testData()); if (d.success) frame.contentWindow.postMessage({ type: 'da_preview', card: d.card }, '*'); } catch (e) { /* нет связи */ }
    };
    window.addEventListener('message', (e) => { if (e.source === frame.contentWindow && e.data && e.data.type === 'da_preview_done' && btn('loop').checked && !root.closest('.da-pane').hidden) setTimeout(play, 900); });
    const cfgCard = btn('cfgcard'), cfgBtn = btn('cfg'), obsBtn = btn('obs');
    cfgBtn.addEventListener('click', () => { const open = cfgCard.hidden; cfgCard.hidden = !open; cfgBtn.classList.toggle('on', open); if (open) cfgCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    const obsUrl = `http://localhost:${location.port || 3001}/overlay.html?only=donation`;
    obsBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(obsUrl); } catch (e) { const ta = document.createElement('textarea'); ta.value = obsUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      const old = obsBtn.dataset.tip; obsBtn.dataset.tip = 'Ссылка скопирована ✓\n' + obsUrl; obsBtn.classList.add('on');
      setTimeout(() => { obsBtn.dataset.tip = old; obsBtn.classList.remove('on'); }, 2200);
    });
    btn('play').addEventListener('click', play);
    btn('test').addEventListener('click', async () => { try { await api(`/api/event-alerts/${kind}/test`, testData()); } catch (e) { say('Сетевая ошибка.', 'error'); } });
    btn('skip').addEventListener('click', () => { api('/api/donation-alert/skip').catch(() => {}); });
    btn('save').addEventListener('click', async () => {
      try { const d = await api(`/api/event-alerts/${kind}`, collect()); if (d.success) { apply(d.settings); say('Сохранено.', 'success'); play(); } else say(d.error || 'Не удалось сохранить.', 'error'); } catch (e) { say('Сетевая ошибка.', 'error'); }
    });
    btn('reset').addEventListener('click', async () => {
      try { const d = await api(`/api/event-alerts/${kind}/reset`); if (d.success) { apply(d.settings); say('Сброшено к значениям по умолчанию.', 'success'); play(); } } catch (e) { say('Сетевая ошибка.', 'error'); }
    });
    (window.evLoadSounds && window.evLoadSounds[kind] ? window.evLoadSounds[kind]() : Promise.resolve()).then(() => fetch('/api/event-alerts')).then((r) => r.json()).then((d) => apply(d.settings[kind])).catch(() => say('Не удалось загрузить настройки.', 'error'));
    // при открытии раздела — показать пример
    document.querySelectorAll(`#tab-donalerts .pixel-subtab[data-da-pane="${kind}"]`).forEach((b) => b.addEventListener('click', () => setTimeout(play, 350)));
    // тип/этап меняют вид карточки — сразу показываем
    cfg.test.filter((f) => f.t === 'select').forEach((f) => document.getElementById(`ev_${kind}_t_${f.k}`).addEventListener('change', play));
  });
})();
