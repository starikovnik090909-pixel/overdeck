// timeline.js
// Хронология событий стрима для виджета "Таймлайн": сообщения чата, эмодзи,
// траты баллов канала, подписки/гифт-сабы, рейды, смена категории.
//
// Плавная линия активности = скользящая сумма ВЕСОВ всех событий за окно
// windowSec (по умолчанию 60с). Вес фиксируется в момент записи события (по
// текущим настройкам весов на тот момент) — сервер (server.js) сам решает,
// какой вес приписать событию, этот модуль просто хранит историю и считает
// сумму. Если веса потом поменяют в админке — новые события учтут новые
// веса, уже записанные в истории сохранят свои.

const MAX_EVENTS = 20000;      // ограничение памяти на длинных стримах

// Какие события рисуются на виджете кружками/маркерами, плавающими вокруг линии. 'emote' и 'category' сюда не входят:
// эмодзи уже учтены в весе линии и в маркере самого сообщения, а смена категории рисуется фоном-обложкой (см. categories.js).
const BUBBLE_TYPES = new Set(['message', 'channelpoints', 'sub', 'giftsub', 'raid', 'donation']);
const DEFAULT_LIFETIME_MS = 10 * 60 * 1000; // сколько кружок живёт на таймлайне (в эфире и в повторе)
const MAX_BUBBLES_PER_FRAME = 240;          // потолок кружков в одном снимке/кадре повтора — защита от спама чата (рассылка раз в секунду)
const MAX_LINE_POINTS = 5000;
const RECENT_FULL_RES_POINTS = 2500; // последние ~83 минуты хранятся с полным шагом, всё, что старше, при переполнении прореживается
const SNAPSHOT_LINE_POINTS = 3000;   // потолок точек линии в одном снимке/кадре повтора (размер сообщения по сети)

/** Равномерно прореживает массив до не более maxCount элементов, сохраняя первый и последний — чтобы снимок охватывал ВЕСЬ стрим. */
function thinPoints(points, maxCount) {
  if (points.length <= maxCount) return points.slice();
  const out = [];
  const step = (points.length - 1) / (maxCount - 1);
  for (let i = 0; i < maxCount; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/**
 * Один независимый таймлайн (свои события и линия). Основной — экземпляр по умолчанию, функции которого экспортируются ниже;
 * createTimeline() нужен фейк-режиму (fakeStream.js): он гоняет собственный таймлайн и не трогает настоящий.
 */
function createTimeline() {
  let startedAt = Date.now();
  let events = [];      // {ts, type, weight, username?, meta?} — история событий сессии
  let linePoints = [];  // {ts, value} — сэмплы скользящей суммы весов для линии

  let windowSec = 60;
  let sampleIntervalMs = 2000;

  function init(config, saved) {
    const tlSettings = config && config.widgetSettings && config.widgetSettings.timeline;
    windowSec = (tlSettings && tlSettings.windowSec) || 60;

    if (saved) {
      startedAt = saved.startedAt || Date.now();
      events = saved.events || [];
      linePoints = saved.linePoints || [];
    }

    setInterval(() => sampleLine(), sampleIntervalMs);
  }

  /** Вызывать при изменении настройки "окно сглаживания" в админке. */
  function setWindowSec(sec) {
    const n = Number(sec);
    if (Number.isFinite(n) && n > 0) windowSec = n;
  }

  /** evt: {type, weight, username?, meta?} — ts проставляется здесь. */
  function addEvent(evt) {
    events.push({ ts: Date.now(), weight: 0, ...evt });
    if (events.length > MAX_EVENTS) events.shift();
  }

  /** Скользящая сумма весов за последние windowSec секунд — считаем с конца, дёшево. */
  function sampleLine(atTs) {
    const now = Number.isFinite(atTs) ? atTs : Date.now(); // atTs нужен только фейк-режиму (досчитать линию «задним числом»)
    const cutoff = now - windowSec * 1000;
    let sum = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].ts < cutoff) break;
      sum += events[i].weight || 0;
    }
    linePoints.push({ ts: now, value: sum });
    compactLinePoints();
  }

  /**
   * Хранилище линии ограничено MAX_LINE_POINTS. Раньше при переполнении просто выбрасывалась самая старая точка — и на стриме
   * дольше ~2.8 часов начало графика пропадало насовсем. Теперь при переполнении СТАРАЯ часть прореживается вдвое (каждая вторая
   * точка), а последние RECENT_FULL_RES_POINTS остаются с полным шагом: график охватывает стрим целиком, свежие минуты — детально,
   * давние — грубее (по ним всё равно рисуется общий рельеф). Клиент считает по метке времени, а не по номеру точки, неравномерный шаг ему не мешает.
   */
  function compactLinePoints() {
    if (linePoints.length <= MAX_LINE_POINTS) return;
    const recent = linePoints.slice(-RECENT_FULL_RES_POINTS);
    const older = linePoints.slice(0, linePoints.length - RECENT_FULL_RES_POINTS).filter((_, i) => i % 2 === 0);
    linePoints = older.concat(recent);
  }

  /**
   * События-кружки в диапазоне времени [fromTs, toTs], самые свежие (не больше limit штук), по возрастанию времени.
   * events по построению отсортированы по ts (push в хронологическом порядке), поэтому идём с конца и останавливаемся,
   * как только вышли за fromTs — на длинном стриме не перебираем всю историю.
   */
  function getBubbleEventsInRange(fromTs, toTs, limit = MAX_BUBBLES_PER_FRAME) {
    const out = [];
    for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
      const e = events[i];
      if (e.ts < fromTs) break;
      if (e.ts > toTs || !BUBBLE_TYPES.has(e.type)) continue;
      out.push(e);
    }
    return out.reverse();
  }

  /**
   * Снимок для живого оверлея. recentEvents — только кружки за последние lifetimeMs (раньше было "последние 400 событий
   * любого типа", из-за чего на оживлённом чате старые кружки пропадали раньше срока, а ненужные эмодзи занимали место).
   * Кружок старше lifetimeMs на живом таймлайне уже не показывается — его можно увидеть только в повторе.
   */
  function getSnapshot(opts) {
    const lifetimeMs = (opts && opts.lifetimeMs) || DEFAULT_LIFETIME_MS;
    const now = Date.now();
    return {
      startedAt,
      recentEvents: getBubbleEventsInRange(now - lifetimeMs, now),
      linePoints: thinPoints(linePoints, SNAPSHOT_LINE_POINTS), // раньше slice(-3000) — только последние ~100 минут; теперь весь стрим, прореженный
    };
  }

  function getPersistData() {
    return {
      startedAt,
      events: events.slice(-MAX_EVENTS),
      linePoints: linePoints.slice(-MAX_LINE_POINTS),
    };
  }

  /** Полный сброс истории таймлайна — новый стрим начинается с нуля. */
  function reset(atTs) {
    startedAt = Number.isFinite(atTs) ? atTs : Date.now();
    events = [];
    linePoints = [];
  }


  return { init, addEvent, setWindowSec, sampleLine, getSnapshot, getBubbleEventsInRange, getPersistData, reset, compactLinePoints,
    _getLinePointsForTest: () => linePoints, _setLinePointsForTest: (p) => { linePoints = p; } };
}

const main = createTimeline();
module.exports = { ...main, createTimeline, DEFAULT_LIFETIME_MS, thinPoints };
