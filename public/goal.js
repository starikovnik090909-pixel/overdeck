// public/goal.js — goal.html: «Цель сбора». Компактная красная плашка со шкалой, висит на экране постоянно.
// Каждый донат: плашка пульсирует, сумма считается вверх, шкала заполняется с бликом и искрами на краю,
// над плашкой всплывает «+N ₽». Когда донат пересекает планку — «цель достигнута»: вспышка, кольцо по рамке,
// искры вдоль шкалы; потом плашка остаётся в состоянии «собрано».
// Данные приходят по WebSocket (?type=goal): goal_state {goal, added?, reached?} и goal_test {kind}.
// Звук: тик на заполнении, «чип» на донат, финальный аккорд — громкость и выключатель в настройках (goal.soundEnabled / goal.volume).
// Предпросмотр в админке (?preview=1): без WebSocket, данные и тесты приходят через postMessage.

(function () {
  const Q = new URLSearchParams(location.search);
  const isPreview = Q.get('preview') === '1';
  const stage = document.getElementById('gStage');
  // embed — плашка внутри overlay.html: рисуется только в общем источнике алертов (?only=donation), не в предпросмотре и не в полном оверлее
  const embed = stage.dataset.embed === '1';
  if (embed && (Q.get('only') !== 'donation' || isPreview)) return;
  const card = document.getElementById('gCard');
  const cv = document.getElementById('gCv');
  const g = cv.getContext('2d');
  const el = {
    kick: document.getElementById('gKick'), pc: document.getElementById('gPc'), amt: document.getElementById('gAmt'),
    of: document.getElementById('gOf'), fill: document.getElementById('gFill'), sheen: document.getElementById('gSheen'),
    pops: document.getElementById('gPops'), head: card.querySelector('.g-head'), ticks: [...card.querySelectorAll('.g-tk')],
  };

  const FD = 1.4; // длительность заполнения шкалы на один донат, сек
  const STAGE_W = 680, STAGE_H = 250, TRACK_X = 86, TRACK_W = 508, TRACK_Y = 171;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const eio = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const back = (x) => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const hh = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const nowSec = () => performance.now() / 1000;

  let goal = null; // последние настоящие данные с сервера
  let shown = 0; // показываемая сумма (идёт к anim.to)
  let anim = null; // { from, to, t0, dur }
  let pulseT0 = -99; // момент последнего доната (пульс плашки)
  let celeT0 = null; // момент начала финала (может быть в будущем — когда дозаполнится шкала)
  let celeSound = false;
  let lastTick = 0;
  let tickN = 0;
  let pops = []; // { elm, t0, slot }
  let simTimer = null;
  let soundAllowed = !isPreview; // в предпросмотре админки звук — только на тестах
  let hidden = true; // плашка сейчас не на экране (выключена, или показывается в другом источнике) — не рисуем и не звучим

  function fmt(n) { return Math.round(n).toLocaleString('ru-RU'); }

  function playSound(name, base) {
    if (!goal || hidden || !goal.soundEnabled || !soundAllowed) return;
    const vol = clamp((base * (goal.volume || 0)) / 100);
    if (vol <= 0) return;
    try {
      const a = new Audio('/alert-sounds/' + name + '.ogg');
      a.volume = vol;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* нет звука — не критично */ }
  }

  function addPop(added) {
    const t = nowSec();
    pops = pops.filter((p) => t - p.t0 < 2);
    const elm = document.createElement('div');
    elm.className = 'g-pop';
    elm.textContent = '+' + fmt(added) + ' ' + goal.currency;
    el.pops.appendChild(elm);
    pops.push({ elm, t0: t, slot: pops.length });
  }

  function currentShown(t) {
    if (!anim) return shown;
    const k = (t - anim.t0) / anim.dur;
    return k >= 1 ? anim.to : anim.from + (anim.to - anim.from) * eio(k);
  }

  /** Запускает заполнение до to (added > 0 — настоящий донат: пульс, «+N», звук; reached — потом финал). */
  function startFill(to, added, reached) {
    const t = nowSec();
    const dur = added > 0 ? FD : 0.7;
    anim = { from: currentShown(t), to, t0: t, dur };
    if (added > 0) {
      pulseT0 = t;
      addPop(added);
      playSound('chip-1', 0.7);
    }
    if (reached) { celeT0 = t + dur; celeSound = false; } else if (to < goal.target) celeT0 = null;
  }

  function applyGoal(next, ev) {
    const first = !goal;
    goal = next;
    const sc = (goal.scale || 100) / 100;
    stage.style.transform = 'scale(' + sc + ')';
    // общий источник алертов (shared) — плашка в overlay.html?only=donation по координатам posX/posY (положение карточки внутри сцены 60/80 px); иначе — отдельная страница goal.html
    hidden = !isPreview && !(goal.enabled && (embed ? goal.shared : !goal.shared));
    stage.classList.toggle('g-off', hidden);
    // предпросмотр-сцена админки (?preview=1&frame=1): показывает, где плашка стоит на экране 1920×1080 (общий алерт) или в углу (отдельный источник)
    if (embed || (isPreview && Q.get('frame') === '1')) {
      const at = goal.shared ? { x: goal.posX, y: goal.posY } : { x: 60 * sc, y: 80 * sc };
      stage.style.left = at.x - 60 * sc + 'px';
      stage.style.top = at.y - 80 * sc + 'px';
    }
    if (first || (ev && ev.instant)) {
      anim = null;
      shown = goal.amount;
      celeT0 = null;
      return;
    }
    const prevTo = anim ? anim.to : shown;
    if (goal.amount !== prevTo) startFill(goal.amount, ev && ev.added > 0 ? ev.added : 0, !!(ev && ev.reached));
    else if (ev && ev.reached) celeT0 = nowSec();
  }

  /** Тест из админки: локальная симуляция (на сервере ничего не меняется), потом плашка возвращается к настоящей сумме. */
  function simulate(kind) {
    if (!goal) return;
    clearTimeout(simTimer);
    soundAllowed = true;
    const t = nowSec();
    let to; let added;
    if (kind === 'finale') {
      shown = Math.round(goal.target * 0.88); anim = null; celeT0 = null;
      to = goal.target; added = Math.max(1, to - shown);
    } else {
      added = 1500; to = (anim ? anim.to : shown) + added;
    }
    startFill(to, added, (anim ? anim.from : shown) < goal.target && to >= goal.target && goal.target > 0);
    simTimer = setTimeout(() => {
      anim = { from: currentShown(nowSec()), to: goal.amount, t0: nowSec(), dur: 0.7 };
      celeT0 = null;
      if (isPreview) soundAllowed = false;
    }, kind === 'finale' ? 6500 : 4500);
    void t;
  }

  // ----- кадр -----
  function sparks(t, fx, fy) {
    for (let k = 0; k < 12; k += 1) {
      const ph = (t * 2.6 + k / 12) % 1;
      const id = Math.floor(t * 2.6 + k / 12) * 31 + k;
      const x = fx + (hh(id) - 0.5) * 10 - ph * hh(id + 1) * 34;
      const y = fy + (hh(id + 2) - 0.5) * 8 - ph * 26 * (0.3 + hh(id + 3));
      g.globalAlpha = (1 - ph) * 0.9;
      g.fillStyle = k % 3 ? '#ffd2d4' : '#fff';
      g.beginPath(); g.arc(x, y, 1.5 + hh(id + 4) * 2.2 * (1 - ph), 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }

  function goalFx(a) {
    if (a < 0 || a > 3) return;
    for (let k = 0; k < 34; k += 1) {
      const ph = clamp((a - hh(k + 50) * 0.5) / 1.8);
      if (ph <= 0 || ph >= 1) continue;
      const x = TRACK_X + hh(k) * TRACK_W;
      const y = TRACK_Y - 7 - ph * (40 + hh(k + 9) * 50);
      g.globalAlpha = (1 - ph) * 0.95;
      g.fillStyle = k % 2 ? '#ffd2d4' : '#fff';
      g.beginPath(); g.arc(x + Math.sin(ph * 6 + k) * 6, y, 1.6 + hh(k + 3) * 2.4 * (1 - ph), 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    const kk = clamp(a / 1.2);
    g.strokeStyle = 'rgba(255,110,120,' + 0.9 * (1 - kk) + ')';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(60 - kk * 22, 80 - kk * 22, 560 + kk * 44, 118 + kk * 44, 16 + kk * 22);
    g.stroke();
  }

  let lastKick = ''; let lastAmt = ''; let lastPc = ''; let lastOf = '';
  function frame() {
    requestAnimationFrame(frame);
    if (!goal || hidden) return;
    const t = nowSec();
    if (anim && t - anim.t0 >= anim.dur) { shown = anim.to; anim = null; }
    const cur = currentShown(t);
    const target = Math.max(1, goal.target);
    const p = clamp(cur / target);
    const filling = !!anim && anim.to > anim.from;
    const done = !anim && cur >= goal.target;
    const dp = t - pulseT0;
    const pulse = ease(dp / 0.2) * (1 - ease((dp - 0.2) / 0.9));
    const a = celeT0 === null ? -1 : t - celeT0;
    const gp = a < 0 ? 0 : ease(a / 0.35) * (1 - ease((a - 0.5) / 1.6));
    if (a >= 0 && !celeSound) {
      celeSound = true;
      playSound('power-up', 0.6); playSound('bell', 0.6); playSound('coins', 0.5);
    }
    if (filling && t - lastTick > 0.12) {
      lastTick = t; tickN += 1;
      playSound('rd-tick-' + ((tickN % 3) + 1), 0.4);
    }

    const kick = a >= 0 && a < 3 ? 'цель достигнута' : 'сбор · ' + (done ? 'собрано' : goal.title);
    const amtTxt = fmt(cur) + ' ' + goal.currency;
    const pcTxt = Math.round(p * 100) + '%';
    const ofTxt = done ? '' : 'из ' + fmt(goal.target) + ' ' + goal.currency;
    if (kick !== lastKick) { el.kick.textContent = kick; lastKick = kick; }
    if (amtTxt !== lastAmt) { el.amt.textContent = amtTxt; lastAmt = amtTxt; }
    if (pcTxt !== lastPc) { el.pc.textContent = pcTxt; lastPc = pcTxt; }
    if (ofTxt !== lastOf) { el.of.textContent = ofTxt; lastOf = ofTxt; }
    el.fill.style.width = p * 100 + '%';
    el.fill.style.filter = 'brightness(' + (1 + pulse * 0.25 + gp * 0.5) + ')';
    el.head.style.opacity = done ? 0.4 : 1;
    el.ticks.forEach((tk) => tk.classList.toggle('on', p >= Number(tk.dataset.q)));
    card.style.transform = 'scale(' + (1 + pulse * 0.015) + ')';
    card.style.boxShadow = '0 0 ' + (38 + pulse * 30 + gp * 50) + 'px rgba(255,70,80,' + (0.22 + pulse * 0.25 + gp * 0.4) + '), 0 16px 30px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.12)';
    el.amt.style.transform = 'scale(' + (1 + pulse * 0.04) + ')';

    // блик: идёт по плашке во время заполнения и при финале
    let sx = -1;
    if (filling) sx = clamp((t - anim.t0) / anim.dur);
    else if (a >= 0 && a < 0.9) sx = a / 0.9;
    if (sx >= 0 && sx <= 1) { el.sheen.style.opacity = 1; el.sheen.style.left = -120 + sx * 680 + 'px'; } else el.sheen.style.opacity = 0;

    g.clearRect(0, 0, STAGE_W, STAGE_H);
    if (filling) sparks(t, TRACK_X + TRACK_W * p, TRACK_Y);
    goalFx(a);

    pops = pops.filter((pp) => {
      const age = t - pp.t0;
      if (age > 2) { pp.elm.remove(); return false; }
      const k = ease(age / 0.5);
      pp.elm.style.opacity = ease(age / 0.15) * (1 - ease((age - 1.3) / 0.7));
      pp.elm.style.transform = 'translateY(' + (-k * 34 - pp.slot * 36) + 'px) scale(' + (0.7 + back(age / 0.4) * 0.3) + ')';
      return true;
    });
  }
  requestAnimationFrame(frame);

  // ----- источники данных -----
  if (isPreview) {
    window.addEventListener('message', (evt) => {
      const d = evt.data;
      if (!d) return;
      if (d.type === 'goal_preview_update' && d.goal) applyGoal(d.goal, { instant: true });
      else if (d.type === 'goal_preview_demo') simulate(d.kind);
    });
    if (window.parent) window.parent.postMessage({ type: 'goal_preview_ready' }, '*');
    return;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(proto + '://' + location.host + '?type=goal');
    ws.onmessage = (evt) => {
      let d;
      try { d = JSON.parse(evt.data); } catch (e) { return; }
      if (d.type === 'goal_state' && d.goal) applyGoal(d.goal, { added: d.added, reached: d.reached });
      else if (d.type === 'goal_test') simulate(d.kind);
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }
  connect();
})();
