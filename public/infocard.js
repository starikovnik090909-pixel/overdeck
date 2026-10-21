// public/infocard.js — Виджет «Инфо-карточка».
//
// Карточка (картинка + заголовок + текст) переворачивается на следующую и выезжает на сцену по таймеру.
//  • ВЫЕЗД: раз в intervalMin минут (1–60) карточка выезжает с выбранной стороны (слева / справа / сверху / снизу / по кругу /
//    случайно), остаётся visibleSec секунд и уезжает обратно той же стороной. «Выезжать по таймеру» выключено — карточка
//    просто всегда на сцене. Пока карточек нет, на сцене ничего нет.
//  • ПЕРЕВОРОТ: каждые flipEverySec секунд на видимой стороне оказывается следующая карточка (3D-поворот на 180°: по горизонтали,
//    по вертикали или чередуя). Стороны всего две, а поворот всегда в одну и ту же сторону (углы копятся: 180, 360, 540…), поэтому
//    карточка не «раскручивается» обратно. Чтобы после любого числа переворотов содержимое стояло ровно, у скрытой стороны перед
//    переворотом выставляется собственный базовый поворот: повороты на 180° вокруг осей X/Y образуют четвёрку {ничего, X, Y, X+Y},
//    так что достаточно помнить чётность по каждой оси (bits) — скрытая сторона получает ту же чётность, что будет у карточки
//    после переворота, и композиция «поворот карточки × базовый поворот стороны» всегда равна единичной.
//  • Все таймеры — на стороне оверлея (по Date.now()), снапшот раз в 1–5 секунд их не сбрасывает: карточки перерисовываются только
//    при смене rev, настройки — только при реальном изменении значений.

(function () {
  const panel = document.querySelector('[data-widget="infocard"]');
  const flipEl = document.getElementById('infoCardFlip');
  const faces = [document.getElementById('infoCardFaceA'), document.getElementById('infoCardFaceB')];
  if (!panel || !flipEl || !faces[0] || !faces[1]) return;

  const SCENE_W = 1920, SCENE_H = 1080;
  const SIDES = ['left', 'right', 'top', 'bottom'];
  const DEFAULTS = {
    autoShow: true, intervalMin: 10, visibleSec: 30, showOnStart: false, slideFrom: 'from-left', slideMs: 800,
    flipEverySec: 8, flipAxis: 'flip-horizontal', flipMs: 900,
    imageLayout: 'img-top', imageFit: 'fit-cover', imageOnly: false, titleSize: 26, textSize: 16, titleColor: '#ffffff', textColor: '#d9d9d9',
  };

  let cards = [];
  let rev = 0;
  let cardIdx = 0;            // какая карточка сейчас на видимой стороне
  let visibleFace = 0;        // 0 — A, 1 — B
  let bits = { x: 0, y: 0 };  // чётность накопленных поворотов карточки по осям
  let ang = { x: 0, y: 0 };   // накопленные углы (кратны 180) — нужны, чтобы вращение шло всегда в одну сторону
  let flipping = false;
  let alternateAxis = false;
  let state = 'hidden';       // hidden | showing | visible | hiding
  let stateUntil = 0;         // когда закончится выезд/уезд (по Date.now())
  let hiddenSince = Date.now();
  let shownAt = 0;
  let lastFlipAt = 0;
  let sideCursor = 0;
  let currentSide = 'left';
  let initialised = false;
  let lastAutoShow = null;
  let settingsSig = '';

  function getSettings() {
    return { ...DEFAULTS, ...((window.widgetSettings && window.widgetSettings.infocard) || {}) };
  }

  /* ---------- Содержимое одной стороны ---------- */

  function renderCard(face, card, s) {
    face.replaceChildren();
    const hasImage = !!(card && card.imageUrl);
    // «Только картинка»: на всю сторону, без заголовка и текста. У карточки без картинки так показывать нечего — для неё остаётся обычный вид с текстом.
    const onlyImage = !!s.imageOnly && hasImage;
    face.className = `infocard-face ${s.imageLayout} ${s.imageFit}${hasImage ? '' : ' no-image'}${onlyImage ? ' image-only' : ''}`;
    if (!card) return;
    if (onlyImage) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = card.imageUrl;
      const media = document.createElement('div'); media.className = 'infocard-media'; media.appendChild(img); face.appendChild(media);
      return;
    }

    const text = document.createElement('div');
    text.className = 'infocard-text';
    if (card.title) { const t = document.createElement('div'); t.className = 'infocard-title'; t.textContent = card.title; text.appendChild(t); }
    if (card.text) { const b = document.createElement('div'); b.className = 'infocard-body'; b.textContent = card.text; text.appendChild(b); } // textContent: тексты вводит пользователь

    if (hasImage) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = card.imageUrl;
      if (s.imageLayout === 'img-bg') {
        img.className = 'infocard-bgimg';
        face.appendChild(img);
        const shade = document.createElement('div'); shade.className = 'infocard-shade'; face.appendChild(shade);
      } else {
        const media = document.createElement('div'); media.className = 'infocard-media'; media.appendChild(img); face.appendChild(media);
      }
    }
    face.appendChild(text);
  }

  function setFaceBase(face, b) {
    face.style.transform = `rotateX(${b.x * 180}deg) rotateY(${b.y * 180}deg)`;
  }

  /** Ждёт, пока на стороне загрузится картинка (но не дольше 1.2 с) — чтобы переворот не показал пустое место. */
  function whenImageReady(face, done) {
    const img = face.querySelector('img');
    if (!img || img.complete) { done(); return; }
    let finished = false;
    const finish = () => { if (!finished) { finished = true; done(); } };
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
    setTimeout(finish, 1200);
  }

  /* ---------- Настройки (CSS-переменные + перерисовка только при реальном изменении) ---------- */

  function applySettings(s) {
    const sig = [s.imageLayout, s.imageFit, s.imageOnly, s.titleSize, s.textSize, s.titleColor, s.textColor].join('|');
    if (sig === settingsSig) return;
    settingsSig = sig;
    panel.style.setProperty('--ic-title-size', s.titleSize + 'px');
    panel.style.setProperty('--ic-text-size', s.textSize + 'px');
    panel.style.setProperty('--ic-title-color', s.titleColor);
    panel.style.setProperty('--ic-text-color', s.textColor);
    renderCard(faces[visibleFace], cards[cardIdx], s); // только видимая сторона; скрытую перепишет следующий переворот
  }

  /* ---------- Выезд / уезд ---------- */

  function offscreenTransform(side) {
    const left = panel.offsetLeft, top = panel.offsetTop, w = panel.offsetWidth, h = panel.offsetHeight;
    if (side === 'left') return `translate(${-(left + w + 40)}px, 0px)`;
    if (side === 'right') return `translate(${SCENE_W - left + 40}px, 0px)`;
    if (side === 'top') return `translate(0px, ${-(top + h + 40)}px)`;
    return `translate(0px, ${SCENE_H - top + 40}px)`; // bottom
  }

  function pickSide(s) {
    switch (s.slideFrom) {
      case 'from-right': return 'right';
      case 'from-top': return 'top';
      case 'from-bottom': return 'bottom';
      case 'from-cycle': return SIDES[sideCursor++ % SIDES.length];
      case 'from-random': return SIDES[Math.floor(Math.random() * SIDES.length)];
      default: return 'left';
    }
  }

  function show(s, now) {
    currentSide = pickSide(s);
    state = 'showing';
    stateUntil = now + s.slideMs;
    shownAt = now;
    lastFlipAt = now;
    panel.style.transition = 'none'; // сначала мгновенно ставим за край, потом уже плавно выезжаем
    panel.style.transform = offscreenTransform(currentSide);
    panel.style.visibility = 'visible';
    void panel.offsetWidth; // фиксируем стартовую позицию перед включением перехода
    panel.style.transition = `transform ${s.slideMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    panel.style.transform = 'translate(0px, 0px)';
  }

  function hide(s, now) {
    state = 'hiding';
    stateUntil = now + s.slideMs;
    panel.style.transition = `transform ${s.slideMs}ms cubic-bezier(0.55, 0, 0.78, 0.3)`;
    panel.style.transform = offscreenTransform(currentSide); // уезжает туда же, откуда выехала
  }

  function finishHide(now) {
    state = 'hidden';
    hiddenSince = now;
    panel.style.visibility = 'hidden';
    // Следующий выезд начнётся уже со следующей карточки — чтобы раз за разом показывать разное.
    if (cards.length > 1) { cardIdx = (cardIdx + 1) % cards.length; renderCard(faces[visibleFace], cards[cardIdx], getSettings()); }
  }

  function hideInstant(now) {
    state = 'hidden';
    hiddenSince = now;
    panel.style.transition = 'none';
    panel.style.visibility = 'hidden';
  }

  /* ---------- Переворот ---------- */

  function flipToNext(s, now) {
    const nextIdx = (cardIdx + 1) % cards.length;
    flipping = true;
    lastFlipAt = now;
    let axis = 'y';
    if (s.flipAxis === 'flip-vertical') axis = 'x';
    else if (s.flipAxis === 'flip-alternate') { alternateAxis = !alternateAxis; axis = alternateAxis ? 'y' : 'x'; }
    const newBits = { x: bits.x ^ (axis === 'x' ? 1 : 0), y: bits.y ^ (axis === 'y' ? 1 : 0) };
    const hiddenFace = faces[1 - visibleFace];
    setFaceBase(hiddenFace, newBits);
    renderCard(hiddenFace, cards[nextIdx], s);
    whenImageReady(hiddenFace, () => {
      ang[axis] += 180;
      flipEl.style.transition = `transform ${s.flipMs}ms cubic-bezier(0.45, 0.05, 0.25, 1)`;
      flipEl.style.transform = `rotateX(${ang.x}deg) rotateY(${ang.y}deg)`;
      visibleFace = 1 - visibleFace;
      bits = newBits;
      cardIdx = nextIdx;
      setTimeout(() => { flipping = false; }, s.flipMs + 30);
    });
  }

  /* ---------- Тик: решает, показывать, прятать или переворачивать ---------- */

  function tick() {
    const s = getSettings();
    const now = Date.now();

    if (!cards.length) { if (state !== 'hidden') hideInstant(now); return; }

    if (state === 'showing' && now >= stateUntil) state = 'visible';
    if (state === 'hiding' && now >= stateUntil) finishHide(now);

    if (!s.autoShow) {
      if (state === 'hidden') show(s, now);
    } else {
      if (lastAutoShow === false && state === 'visible') shownAt = now; // только что включили таймер, а карточка уже на экране — отсчёт «сколько показывать» с этого момента
      if (state === 'hidden' && now - hiddenSince >= s.intervalMin * 60000) show(s, now);
      else if (state === 'visible' && now - shownAt >= s.visibleSec * 1000) hide(s, now);
    }
    lastAutoShow = s.autoShow;

    if (state === 'visible' && cards.length > 1 && !flipping && now - lastFlipAt >= s.flipEverySec * 1000) flipToNext(s, now);
  }

  /* ---------- Вход: снапшот оверлея и сигнал «показать сейчас» ---------- */

  function render(data) {
    const s = getSettings();
    if (!initialised) {
      initialised = true;
      // «Выехать сразу при запуске»: делаем вид, что интервал уже прошёл. Иначе первый выезд — через intervalMin минут после запуска.
      hiddenSince = s.showOnStart ? Date.now() - s.intervalMin * 60000 : Date.now();
    }
    const ic = data && data.infoCards;
    if (ic && ic.rev !== rev) {
      rev = ic.rev;
      cards = Array.isArray(ic.cards) ? ic.cards : [];
      if (cardIdx >= cards.length) cardIdx = 0;
      renderCard(faces[visibleFace], cards[cardIdx], s);
    }
    applySettings(s);
  }

  function showNow() {
    if (!cards.length || state !== 'hidden') return;
    show(getSettings(), Date.now());
  }

  setFaceBase(faces[0], bits);
  // Скрытая сторона с самого начала повёрнута «спиной» (на 180° по Y). Иначе до первого переворота обе стороны смотрели бы на зрителя, и пустая
  // сторона B (у неё свой фон) лежала бы поверх карточки A. Это же то самое состояние, какого перед переворотом по горизонтали ожидает flipToNext.
  setFaceBase(faces[1], { x: bits.x, y: bits.y ^ 1 });
  setInterval(tick, 250);

  // _debug — только для автотестов в настоящем браузере; в работе виджета не используется.
  window.InfoCardModule = { render, showNow, _debug: () => ({ state, cardIdx, visibleFace, bits: { ...bits }, ang: { ...ang }, side: currentSide, flipping, cards: cards.length, rev }) };
})();
