// public/fund-box.js — "Коробочка сбора" на НАСТОЯЩЕЙ физике: matter.js
// (подключается через CDN в fund-box.html — см. README за объяснением,
// почему через CDN, а не локальным файлом). Монетки — реальные круглые
// тела с массой/трением/упругостью, стенки коробки — статические тела,
// монетки падают под гравитацией, сталкиваются друг с другом и оседают
// слоями на дне, как и было явно запрошено.

(function () {
  const isPreview = new URLSearchParams(location.search).get('preview') === '1';
  const rootEl = document.getElementById('fundBoxRoot');
  const canvas = document.getElementById('fbCanvas');
  const ctx = canvas.getContext('2d');
  const denominationEl = document.getElementById('fbDenomination');
  const captionEl = document.getElementById('fbCaption');

  const { Engine, World, Bodies, Body } = Matter;

  const engine = Engine.create();
  engine.gravity.y = 1;
  const world = engine.world;

  let wallBodies = [];
  let coinBodies = [];
  let boxW = 260, boxH = 220, coinRadius = 11;
  let coinValue = 100;
  let restitution = 0.4, friction = 0.3;
  let coinColor = '#ffd700', coinTextColor = '#5a3d0a';
  let coinsPerLevel = 10;
  let showOnlyOnDonation = false;
  let hideTimer = null; // отложенное скрытие после того, как монетки улеглись (режим "только после доната")
  const HIDE_DELAY_MS = 4000; // сколько виджет остаётся на экране после последней монетки, прежде чем спрятаться

  function shadeColor(hex, percent) {
    // percent > 0 — светлее, < 0 — темнее. hex — "#rrggbb".
    const num = parseInt(hex.replace('#', ''), 16);
    let r = (num >> 16) + Math.round(255 * (percent / 100));
    let g = ((num >> 8) & 0xff) + Math.round(255 * (percent / 100));
    let b = (num & 0xff) + Math.round(255 * (percent / 100));
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  }

  function rebuildWalls() {
    if (wallBodies.length) World.remove(world, wallBodies);
    const t = 60; // толщина стен с запасом — монетки точно не проваливаются и не вылетают по бокам
    wallBodies = [
      Bodies.rectangle(boxW / 2, boxH + t / 2, boxW + t * 2, t, { isStatic: true, label: 'wall' }), // пол
      Bodies.rectangle(-t / 2, boxH / 2, t, boxH * 3, { isStatic: true, label: 'wall' }), // левая стена
      Bodies.rectangle(boxW + t / 2, boxH / 2, t, boxH * 3, { isStatic: true, label: 'wall' }), // правая стена
    ];
    World.add(world, wallBodies);
  }

  function applySettings(state, denomination, boxSize) {
    const r = document.documentElement.style;
    r.setProperty('--fb-box-w', boxSize.width + 'px');
    r.setProperty('--fb-box-h', boxSize.height + 'px');
    r.setProperty('--fb-coin-size', boxSize.coinSize + 'px');
    r.setProperty('--fb-box-color', state.settings.boxColor);
    r.setProperty('--fb-coin-color', state.settings.coinColor);
    r.setProperty('--fb-text-color', state.settings.textColor);
    r.setProperty('--fb-bg-opacity', (state.settings.backgroundOpacity || 0) / 100);
    r.setProperty('--fb-bg-darken', (state.settings.backgroundDarken || 0) / 100);

    const sizeChanged = boxW !== boxSize.width || boxH !== boxSize.height;
    boxW = boxSize.width;
    boxH = boxSize.height;
    coinRadius = boxSize.coinSize / 2;
    canvas.width = boxW;
    canvas.height = boxH;
    if (sizeChanged || wallBodies.length === 0) rebuildWalls();

    coinValue = state.coinValue;
    coinColor = state.settings.coinColor;
    coinTextColor = state.settings.coinTextColor;
    restitution = state.settings.bounciness / 100;
    friction = state.settings.friction / 100;

    coinsPerLevel = boxSize.coinsPerLevel || Math.max(1, Math.round(denomination / state.coinValue));
    // Раньше тут было число уровня (сколько нужно набрать) — легко перепутать с "уже собрано".
    // Теперь над коробкой — сколько собрано ВСЕГО за всё время; номинал каждой монетки виден на ней самой.
    denominationEl.textContent = (state.totalCollectedAmount || 0).toLocaleString('ru-RU') + ' ₽';
    captionEl.textContent = state.textTemplate || '';
    showOnlyOnDonation = !!state.settings.showOnlyOnDonation;

    rootEl.style.display = state.enabled ? 'flex' : 'none';
  }

  function spawnCoin(startAtRestApprox) {
    const x = coinRadius * 1.3 + Math.random() * (boxW - coinRadius * 2.6);
    const y = startAtRestApprox ? boxH - coinRadius * 2 : -coinRadius - Math.random() * 40;
    const body = Bodies.circle(x, y, coinRadius, {
      restitution,
      friction,
      frictionAir: 0.01,
      density: 0.0018,
      angle: Math.random() * Math.PI * 2,
      label: 'coin',
    });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
    World.add(world, body);
    coinBodies.push(body);
  }

  function clearCoins() {
    if (coinBodies.length) World.remove(world, coinBodies);
    coinBodies = [];
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const lightShade = shadeColor(coinColor, 28);
    const darkShade = shadeColor(coinColor, -22);
    const fontSize = Math.max(7, coinRadius * 0.72);

    coinBodies.forEach((body) => {
      ctx.save();
      ctx.translate(body.position.x, body.position.y);

      // тень для объёма — до поворота, чуть смещена вниз-вправо
      ctx.beginPath();
      ctx.ellipse(coinRadius * 0.15, coinRadius * 0.7, coinRadius * 0.85, coinRadius * 0.32, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();

      ctx.rotate(body.angle);

      const grad = ctx.createRadialGradient(-coinRadius * 0.3, -coinRadius * 0.3, coinRadius * 0.15, 0, 0, coinRadius);
      grad.addColorStop(0, lightShade);
      grad.addColorStop(0.65, coinColor);
      grad.addColorStop(1, darkShade);

      ctx.beginPath();
      ctx.arc(0, 0, coinRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = Math.max(1, coinRadius * 0.12);
      ctx.strokeStyle = darkShade;
      ctx.stroke();

      ctx.fillStyle = coinTextColor;
      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(coinValue), 0, 0);

      ctx.restore();
    });
  }

  let lastTs = null;
  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(33, ts - lastTs); // мс за кадр, ограничено — иначе скачок после сворачивания вкладки "телепортирует" монетки
    lastTs = ts;
    Engine.update(engine, dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Роняет count монеток с небольшим интервалом, ждёт, пока улягутся. */
  async function dropCoins(count) {
    for (let i = 0; i < count; i += 1) {
      spawnCoin(false);
      await sleep(90);
    }
    await sleep(700); // дать физике доосесть после последней монетки
  }

  /** Коробка пружинисто растёт до нового реального размера, монетки исчезают, номинал переключается. */
  async function playLevelUp(newDenomination, newState, newBoxSize) {
    clearCoins(); // сначала убираем старые монетки — не хотим, чтобы они "поплыли" вместе с ростом коробки
    const r = document.documentElement.style;
    r.setProperty('--fb-box-w', newBoxSize.width + 'px');
    r.setProperty('--fb-box-h', newBoxSize.height + 'px');
    r.setProperty('--fb-coin-size', newBoxSize.coinSize + 'px');
    await sleep(650); // ждём завершения CSS-перехода роста коробки
    boxW = newBoxSize.width;
    boxH = newBoxSize.height;
    coinRadius = newBoxSize.coinSize / 2;
    canvas.width = boxW;
    canvas.height = boxH;
    rebuildWalls();
    coinsPerLevel = newBoxSize.coinsPerLevel || Math.max(1, Math.round(newDenomination / newState.coinValue));
    denominationEl.textContent = (newState.totalCollectedAmount || 0).toLocaleString('ru-RU') + ' ₽'; // тот же переход на "собрано всего", что и в applySettings
    await sleep(200);
  }

  /** Режим "показывать только после доната": появляется перед тем, как посыпятся монетки. В предпросмотре не прячем — см. renderFullState. */
  function showForDonation() {
    if (!showOnlyOnDonation || isPreview) return;
    clearTimeout(hideTimer);
    rootEl.classList.remove('fb-hidden');
  }
  /** ...и прячется снова через паузу после того, как последняя монетка улеглась. Обычный режим и предпросмотр не трогает. */
  function scheduleHideAfterDonation() {
    if (!showOnlyOnDonation || isPreview) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { rootEl.classList.add('fb-hidden'); }, HIDE_DELAY_MS);
  }

  let eventQueue = [];
  let processingEvents = false;
  async function processEvents() {
    if (processingEvents) return;
    processingEvents = true;
    showForDonation(); // до первой упавшей монетки — если режим "только после доната" включён
    while (eventQueue.length > 0) {
      const { events, state, denomination, boxSize } = eventQueue.shift();
      for (const ev of events) {
        if (ev.type === 'coins') {
          await dropCoins(ev.count);
        } else if (ev.type === 'levelup') {
          await playLevelUp(ev.newDenomination, state, ev.newBoxSize);
        }
      }
      applySettings(state, denomination, boxSize);
    }
    processingEvents = false;
    scheduleHideAfterDonation(); // все события очереди отыграны — через паузу прячемся обратно
  }

  function renderFullState(state, denomination, boxSize) {
    applySettings(state, denomination, boxSize);
    clearCoins();

    // В обычном режиме — восстанавливаем уже собранные монеты текущего уровня, сразу почти на месте (не с
    // потолка), затем "прокручиваем" физику на секунду вперёд синхронно, чтобы к первому кадру они уже
    // физически улеглись. В режиме "только после доната" виджет и так должен быть скрыт до следующего
    // доната — довосстанавливать монетки, которые всё равно не видно, смысла нет. В ПРЕДПРОСМОТРЕ админки
    // это скрытие не применяем — иначе включивший режим не смог бы увидеть и настроить сам виджет вообще.
    if (showOnlyOnDonation && !isPreview) {
      clearTimeout(hideTimer);
      rootEl.classList.add('fb-hidden');
      return;
    }
    rootEl.classList.remove('fb-hidden');
    const alreadyCollected = Math.floor(state.collectedAmount / state.coinValue);
    for (let i = 0; i < alreadyCollected; i += 1) spawnCoin(true);
    for (let i = 0; i < 60; i += 1) Engine.update(engine, 16.66);
  }

  if (isPreview) {
    window.addEventListener('message', (evt) => {
      if (!evt.data) return;
      if (evt.data.type === 'fund_box_preview_update') {
        renderFullState(evt.data.state, evt.data.denomination, evt.data.boxSize);
      }
    });
    if (window.parent) window.parent.postMessage({ type: 'fund_box_preview_ready' }, '*');
    return;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=fundbox`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'fund_box_state') {
        renderFullState(data.state, data.denomination, data.boxSize);
      } else if (data.type === 'fund_box_events') {
        eventQueue.push({ events: data.events, state: data.state, denomination: data.denomination, boxSize: data.boxSize });
        processEvents();
      }
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }
  connect();
})();
