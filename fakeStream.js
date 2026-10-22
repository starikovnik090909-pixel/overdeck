// fakeStream.js
// «Фейк-режим» для проверки оверлея без настоящего стрима: виртуальная трансляция, где зрители пишут сообщения,
// донатят, тратят баллы канала, дарят подписки, приводят рейды и меняется категория.
//
// Полностью изолирован от настоящих данных: у него своя статистика, свой экземпляр таймлайна (timeline.createTimeline()),
// свой топ донатеров. Настоящие stats/timeline/герои/донаты/озвучка не затрагиваются и после остановки возвращаются как были.
// server.js на время работы подменяет в снапшоте оверлея поля topChatters / wordCloud / topEmotes / timeline / category /
// donorTops / newEmoteDrops данными отсюда — поэтому виджеты рисуют их тем же кодом, что и живые, а смена стиля или
// настроек виджета во время теста видна сразу.

const { createTimeline } = require('./timeline');
const { createFeed } = require('./eventFeed');
const currency = require('./currency');

const PREFILL_MS = 20 * 60 * 1000; // сколько «уже прошедшего» стрима досчитываем при запуске, чтобы линия и кружки были сразу
const STEP_MS = 1000;

const NAMES = [
  'ШтурмоваяБелка', 'NightOwl_77', 'Печенька', 'xX_Dimon_Xx', 'ТёмныйРыцарь', 'Kotik_Murr', 'Лунная', 'Gr1mReaper',
  'Саня_Бро', 'PixelWitch', 'Борщ', 'Kira_Chan', 'DedInside', 'Ромашка', 'Snezhok', 'ProstoVasya', 'MrFrost',
  'Алиса_в_Танках', 'Fenix', 'ЗЛОЙ_ОГУРЕЦ', 'tanya_play', 'Vovchik', 'Мяу', 'CyberBabka', 'Лещ', 'SonyaTV',
  'Hacker404', 'Тоха', 'Zefir', 'Банан', 'Wolfik', 'Маруся', 'Stalker_Max', 'Улитка', 'Ninja_Kolya', 'Дзен',
];

const PHRASES = [
  'привет всем', 'как дела на стриме', 'вот это момент', 'ну ты даёшь', 'красиво сыграл', 'не сдавайся',
  'классная музыка', 'когда следующий стрим', 'сильно', 'жёстко', 'давай ещё раз', 'не повезло', 'ахаха это смешно',
  'лучший стример', 'пасхалка за углом', 'смотри налево', 'хорошая игра', 'какой билд', 'ультимейт готов',
  'добавь в плейлист', 'всем добра', 'нужно больше огня', 'кто смотрит с телефона', 'видно плохо?', 'звук норм',
  'ставь лайк', 'это было близко', 'гоу гоу гоу', 'крутой оверлей', 'сегодня огонь', 'жду рейд', 'спасибо за стрим',
];

// Классические глобальные смайлы Twitch (идентификаторы стабильны, картинки берутся с CDN Twitch, как и у настоящих).
const EMOTES = [
  { id: '25', name: 'Kappa' }, { id: '354', name: '4Head' }, { id: '425618', name: 'LUL' }, { id: '41', name: 'Kreygasm' },
  { id: '1902', name: 'Keepo' }, { id: '65', name: 'FrankerZ' }, { id: '245', name: 'ResidentSleeper' },
  { id: '33', name: 'DansGame' }, { id: '52', name: 'SMOrc' }, { id: '356', name: 'OpieOP' },
];
const emoteUrl = (id) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`;

const REWARDS = ['Выбрать музыку', 'Разблокировать аватар', 'Сказать привет в эфире', 'Выпей воды', 'Сменить цвет ника', 'Мини-квест'];
const DONATION_AMOUNTS = [50, 100, 100, 150, 300, 500, 1000, 2500];
const CATEGORIES = [
  { name: 'Just Chatting', art: 509658 }, { name: 'Dota 2', art: 29595 }, { name: 'Counter-Strike', art: 32399 },
  { name: 'Minecraft', art: 27471 }, { name: 'VALORANT', art: 516575 }, { name: 'Music', art: 26936 },
];
const boxArt = (id) => `https://static-cdn.jtvnw.net/ttv-boxart/${id}-285x380.jpg`;
const COLORS = ['#FF4D4D', '#4DA3FF', '#5BD16F', '#FFB84D', '#B16BFF', '#FF6BC1', '#3DD6D0', '#E6E64D'];

let active = false;
let timer = null;
let tl = null;
let feed = createFeed();
let deps = null;
let users = [];
let perUser = {};
let wordCounts = {};
let emoteCounts = {};
let sessionDonors = {};
let allTimeDonors = {};
let categoryHistory = [];
let pendingDrops = [];
let pendingChat = [];
let tickCount = 0;
let burstUntil = 0;
let lastTs = 0;
let nextAt = {};
let startedAtTs = 0;
let counters = { messages: 0, points: 0, donations: 0, subs: 0, raids: 0 };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Распределение Пуассона для небольших средних: сколько событий случилось за секунду. */
function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k += 1; p *= Math.random(); } while (p > L && k < 50);
  return k - 1;
}

/** Зрители пишут неравномерно: у одних много сообщений, у других мало (убывающие веса). */
function pickUser() {
  let r = Math.random() * users.totalWeight;
  for (const u of users) { r -= u.weight; if (r <= 0) return u; }
  return users[0];
}

function weightFor(type) {
  const w = deps && typeof deps.weightFor === 'function' ? deps.weightFor(type) : null;
  return typeof w === 'number' ? w : 1;
}

function addEvent(evt, ts) {
  const t = Math.max(ts, lastTs);
  lastTs = t;
  tl.addEvent({ ...evt, ts: t, weight: weightFor(evt.type) });
  feed.add(evt, t);
}

function recordWords(text) {
  text.toLowerCase().split(/[^a-zа-яё0-9]+/i).forEach((w) => {
    if (w.length < 3) return;
    if (!wordCounts[w]) wordCounts[w] = { count: 0, original: w };
    wordCounts[w].count += 1;
  });
}

function makeMessage(ts, live) {
  const u = pickUser();
  const phrase = pick(PHRASES);
  const emotesInMsg = [];
  const roll = Math.random();
  const inBurst = ts < burstUntil;
  const n = inBurst ? (roll < 0.15 ? 1 : roll < 0.6 ? 2 : 3) : (roll < 0.4 ? 0 : roll < 0.8 ? 1 : roll < 0.95 ? 2 : 3);
  // во время всплеска чат спамит одним смайлом — видно «серии» в виджете эмодзи
  const hot = EMOTES[Math.floor(burstUntil / 1000) % EMOTES.length];
  for (let i = 0; i < n; i++) emotesInMsg.push(inBurst && Math.random() < 0.7 ? hot : pick(EMOTES));
  const text = emotesInMsg.length ? `${phrase} ${emotesInMsg.map((e) => e.name).join(' ')}` : phrase;

  if (!perUser[u.name]) perUser[u.name] = { messages: 0 };
  perUser[u.name].messages += 1;
  recordWords(phrase);
  counters.messages += 1;
  addEvent({ type: 'message', userId: u.id, username: u.name }, ts);
  emotesInMsg.forEach((e) => {
    if (!emoteCounts[e.id]) emoteCounts[e.id] = { name: e.name, count: 0 };
    emoteCounts[e.id].count += 1;
    addEvent({ type: 'emote', userId: u.id, username: u.name, emote: { id: e.id, name: e.name } }, ts);
    if (live) pendingDrops.push({ id: e.id, name: e.name, imageUrl: emoteUrl(e.id) });
  });

  if (live && deps && typeof deps.onChat === 'function') {
    const parts = [{ type: 'text', text: phrase }]; // фраза целиком одним куском, смайлы — отдельными частями
    emotesInMsg.forEach((e) => {
      parts.push({ type: 'text', text: ' ' });
      parts.push({ type: 'emote', source: 'twitch', id: e.id, name: e.name, imageUrl: emoteUrl(e.id) });
    });
    pendingChat.push({
      username: u.name, color: u.color, avatarUrl: null, badges: [], parts, roles: {}, login: u.name.toLowerCase(), ts,
    });
  }
}

function addDonor(map, name, amount) {
  const key = name.toLowerCase();
  if (!map[key]) map[key] = { username: name, amount: 0, platform: 'fake' };
  map[key].amount += amount;
}

function makeDonation(ts) {
  const u = pickUser();
  // каждый пятый донат — в валюте (проверка пересчёта в рубли на таймлайне)
  const foreign = Math.random() < 0.2;
  const cur = foreign ? pick(['USD', 'EUR']) : 'RUB';
  const amount = foreign ? pick([1, 2, 5, 10, 25]) : pick(DONATION_AMOUNTS);
  const rub = currency.toRub(amount, cur).rub;
  counters.donations += 1;
  addDonor(sessionDonors, u.name, rub);
  addDonor(allTimeDonors, u.name, rub);
  addEvent({ type: 'donation', username: u.name, meta: { amount, currency: cur, amountRub: rub, message: Math.random() < 0.5 ? pick(['Лучший стрим!', 'На печеньки', 'Го дальше']) : '' } }, ts);
}

function changeCategory(ts) {
  const cur = categoryHistory[0];
  const next = pick(CATEGORIES.filter((c) => !cur || c.name !== cur.name));
  categoryHistory.unshift({ name: next.name, boxArtUrl: boxArt(next.art), startedAt: ts });
  addEvent({ type: 'category', meta: { name: next.name } }, ts);
}

/** Один шаг виртуального времени: что произошло за STEP_MS, заканчивающиеся в момент ts. */
function step(ts, live) {
  // Чат «дышит» волнами + редкие всплески — чтобы на линии были и пики, и спады.
  const wave = 0.32 + 0.22 * Math.sin(ts / 45000) + 0.1 * Math.sin(ts / 11000); // в среднем ~20 сообщений в минуту, как у небольшого канала
  if (ts > burstUntil && Math.random() < 0.006) burstUntil = ts + rnd(6000, 14000);
  const rate = Math.max(0.06, wave) * (ts < burstUntil ? 4 : 1);
  const n = poisson(rate);
  for (let i = 0; i < n; i++) makeMessage(ts - Math.floor(rnd(0, STEP_MS - 1)), live);

  const due = (key, minMs, maxMs) => {
    if (ts < (nextAt[key] || 0)) return false;
    nextAt[key] = ts + rnd(minMs, maxMs);
    return true;
  };
  if (due('points', 12000, 35000)) {
    counters.points += 1;
    const u = pickUser();
    addEvent({ type: 'channelpoints', username: u.name, login: u.name.toLowerCase(), meta: { reward: pick(REWARDS) } }, ts);
  }
  if (due('donation', 50000, 130000)) makeDonation(ts);
  if (due('follow', 25000, 70000)) addEvent({ type: 'follow', username: pickUser().name }, ts);
  if (due('sub', 70000, 160000)) {
    counters.subs += 1;
    addEvent({ type: 'sub', username: pickUser().name }, ts);
  }
  if (due('giftsub', 200000, 420000)) {
    counters.subs += 1;
    addEvent({ type: 'giftsub', username: pickUser().name, meta: { total: Math.floor(rnd(2, 11)) } }, ts);
  }
  if (due('watchstreak', 45000, 110000)) addEvent({ type: 'watchstreak', username: pickUser().name, meta: { streak: Math.floor(rnd(2, 31)), points: pick([300, 450, 450, 500]) } }, ts);
  if (due('raid', 300000, 600000)) {
    counters.raids += 1;
    addEvent({ type: 'raid', username: pick(NAMES), meta: { viewers: Math.floor(rnd(8, 140)) } }, ts);
  }
  if (due('category', 240000, 420000)) changeCategory(ts);
}

function buildUsers() {
  const names = NAMES.slice().sort(() => Math.random() - 0.5);
  users = names.map((name, i) => ({
    name, id: `fake-${i}`, color: COLORS[i % COLORS.length], weight: 1 / (1 + i * 0.45),
  }));
  users.totalWeight = users.reduce((a, u) => a + u.weight, 0);
}

function resetState() {
  tl = createTimeline();
  feed = createFeed();
  perUser = {}; wordCounts = {}; emoteCounts = {}; sessionDonors = {}; allTimeDonors = {};
  categoryHistory = []; pendingDrops = []; pendingChat = []; tickCount = 0; burstUntil = 0; lastTs = 0; nextAt = {};
  counters = { messages: 0, points: 0, donations: 0, subs: 0, raids: 0 };
  buildUsers();
  // «За всё время» — несколько старых донатеров, чтобы второй вид виджета не был пустым
  [['Dedushka_Gamer', 15000], ['Королева_Ночи', 9200], ['AlexTheGreat', 6400], ['Печенье_с_чаем', 3100]].forEach(([n, a]) => addDonor(allTimeDonors, n, a));
}

/** Запускает фейк-стрим. d: { weightFor(type), onTick(), onChat(msg), windowSec() }. */
function start(d) {
  if (active) return false;
  deps = d || {};
  resetState();
  const now = Date.now();
  startedAtTs = now - PREFILL_MS;
  tl.reset(startedAtTs);
  if (typeof deps.windowSec === 'function') tl.setWindowSec(deps.windowSec());
  // первая категория — с начала «стрима», дальше сменяются по таймеру
  const first = pick(CATEGORIES);
  categoryHistory.unshift({ name: first.name, boxArtUrl: boxArt(first.art), startedAt: startedAtTs });
  addEvent({ type: 'category', meta: { name: first.name } }, startedAtTs);
  nextAt = { points: startedAtTs + 5000, donation: startedAtTs + 30000, sub: startedAtTs + 40000, giftsub: startedAtTs + 100000, raid: startedAtTs + 150000, watchstreak: startedAtTs + 60000, category: startedAtTs + 300000 };
  // Досчитываем прошедшие 20 минут: события — с прошлыми метками времени, линия — каждые 2 с
  for (let t = startedAtTs + STEP_MS; t <= now; t += STEP_MS) {
    step(t, false);
    if (((t - startedAtTs) / STEP_MS) % 2 === 0) tl.sampleLine(t);
  }
  // два заметных события «прямо сейчас», чтобы сразу было что увидеть
  makeDonation(now - 1500);
  addEvent({ type: 'channelpoints', username: pickUser().name, meta: { reward: pick(REWARDS) } }, now - 800);
  active = true;
  timer = setInterval(tick, STEP_MS);
  return true;
}

function tick() {
  if (!active) return;
  const now = Date.now();
  step(now, true);
  tickCount += 1;
  if (tickCount % 2 === 0) tl.sampleLine(now);
  if (deps && typeof deps.onChat === 'function') {
    pendingChat.splice(0).forEach((m) => deps.onChat(m));
  } else pendingChat = [];
  if (deps && typeof deps.onTick === 'function') deps.onTick();
}

function stop() {
  if (!active) return false;
  active = false;
  clearInterval(timer);
  timer = null;
  tl = null;
  pendingDrops = []; pendingChat = [];
  return true;
}

function isActive() { return active; }

const toList = (map, n) => Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, n);

/**
 * Данные для снапшота оверлея вместо настоящих. o: { lifetimeMs, topChatters, wordCloud, topEmotes, donors }.
 * Аватарок у фейковых зрителей нет — оверлей рисует буквенные кружки, как для людей без аватарки.
 */
function getOverlayData(o) {
  const opts = o || {};
  const timeline = tl.getSnapshot({ lifetimeMs: opts.lifetimeMs });
  timeline.recentEvents = timeline.recentEvents.map((e) => (e.username ? { ...e, avatarUrl: null } : e));
  const drops = pendingDrops;
  pendingDrops = [];
  return {
    topChatters: Object.entries(perUser).sort((a, b) => b[1].messages - a[1].messages).slice(0, opts.topChatters || 10)
      .map(([username, d]) => ({ username, messages: d.messages, avatarUrl: null })),
    wordCloud: Object.values(wordCounts).sort((a, b) => b.count - a.count).slice(0, opts.wordCloud || 50)
      .map((w) => ({ word: w.original, count: w.count })),
    topEmotes: Object.entries(emoteCounts).sort((a, b) => b[1].count - a[1].count).slice(0, opts.topEmotes || 25)
      .map(([id, d]) => ({ id, name: d.name, count: d.count, imageUrl: emoteUrl(id) })),
    timeline,
    category: { current: categoryHistory[0] || null, history: categoryHistory.slice(0, 60) },
    donorTops: { session: toList(sessionDonors, opts.donors || 10), allTime: toList(allTimeDonors, opts.donors || 10) },
    newEmoteDrops: drops,
    eventFeed: feed.getList(15),
    emoteTotal: Object.values(emoteCounts).reduce((a, d) => a + d.count, 0),
  };
}

function getState() {
  return { active, startedAt: active ? startedAtTs : null, counters: { ...counters }, viewers: users.length };
}

module.exports = { start, stop, isActive, getOverlayData, getState };
