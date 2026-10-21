// stats.js
// Считает сообщения, топ чаттеров, частоту слов и использование эмодзи.

const STOPWORDS = new Set([
  'и','в','на','я','ты','он','она','они','мы','вы','это','не','да','нет','за','по','с','к','у','о','а',
  'но','же','бы','ли','что','как','так','все','всё','ещё','уже','то','из','от','для','до','при','без',
  'над','под','про','через','их','его','её','мой','твой','наш','ваш','этот','тот','кто','где','когда',
  'почему','потому','если','чем','тут','там','вот','ну','эй','ага','ок','окей','просто','очень',
  'быть','был','была','было','были','есть','себя','себе','надо','нужно','можно','нельзя',
  'the','a','an','and','or','but','is','are','was','were','be','been','to','of','in','on','at','for',
  'with','this','that','it','you','i','he','she','they','we','not','just','like','what','all','get',
  'got','can','will','so','if','do','does','did','have','has','had','yo','lol',
]);

let perUser = {};       // username -> { userId, messages }
let wordCounts = {};    // lower -> { count, original }
let emoteCounts = {};   // id -> { name, count }
let totalMessages = 0;

function init(saved) {
  if (!saved) return;
  perUser = saved.perUser || {};
  wordCounts = saved.wordCounts || {};
  emoteCounts = saved.emoteCounts || {};
  totalMessages = saved.totalMessages || 0;
}

/**
 * Обрабатывает одно сообщение чата: считает сообщения, слова, эмодзи.
 * Возвращает { emoteEvents: [{id, name}] } — по одному элементу на каждое
 * фактическое использование эмодзи в этом сообщении (для таймлайна/коробки).
 */
function recordMessage(username, userId, message, tagsEmotes) {
  totalMessages += 1;

  if (!perUser[username]) perUser[username] = { userId, messages: 0 };
  perUser[username].messages += 1;
  perUser[username].userId = userId;

  const emoteEvents = [];
  const excludedRanges = [];

  if (tagsEmotes) {
    Object.entries(tagsEmotes).forEach(([emoteId, ranges]) => {
      if (!emoteCounts[emoteId]) emoteCounts[emoteId] = { name: null, count: 0 };
      ranges.forEach((range) => {
        const [s, e] = range.split('-').map((n) => parseInt(n, 10));
        if (Number.isNaN(s) || Number.isNaN(e)) return;
        excludedRanges.push([s, e]);
        const name = message.slice(s, e + 1);
        if (!emoteCounts[emoteId].name) emoteCounts[emoteId].name = name;
        emoteCounts[emoteId].count += 1;
        emoteEvents.push({ id: emoteId, name });
      });
    });
  }

  let clean = message;
  if (excludedRanges.length > 0) {
    const chars = message.split('');
    excludedRanges.forEach(([s, e]) => { for (let i = s; i <= e && i < chars.length; i++) chars[i] = ' '; });
    clean = chars.join('');
  }

  const words = clean.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

  words.forEach((w) => {
    if (!wordCounts[w]) {
      const match = message.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      wordCounts[w] = { count: 0, original: match ? match[0] : w };
    }
    wordCounts[w].count += 1;
  });

  return { emoteEvents, clean: clean.trim() };
}

/**
 * То же, что делает recordMessage с текстом (вычищает диапазоны эмодзи, чтобы TTS не зачитывал их код),
 * но БЕЗ побочных эффектов — счётчики (сообщения/слова/эмодзи) не трогает. Нужна для сообщений, которые
 * не должны попадать в статистику (например, свой чат-бот — см. server.js), но зеркало чата и TTS всё
 * равно должны получить нормальный текст.
 */
function stripEmotesForDisplay(message, tagsEmotes) {
  if (!tagsEmotes) return message.trim();
  const excludedRanges = [];
  Object.values(tagsEmotes).forEach((ranges) => {
    ranges.forEach((range) => {
      const [s, e] = range.split('-').map((n) => parseInt(n, 10));
      if (!Number.isNaN(s) && !Number.isNaN(e)) excludedRanges.push([s, e]);
    });
  });
  if (!excludedRanges.length) return message.trim();
  const chars = message.split('');
  excludedRanges.forEach(([s, e]) => { for (let i = s; i <= e && i < chars.length; i++) chars[i] = ' '; });
  return chars.join('').trim();
}

function getTopChatters(limit, avatarMap) {
  return Object.entries(perUser)
    .sort((a, b) => b[1].messages - a[1].messages)
    .slice(0, limit)
    .map(([username, data]) => ({
      username,
      messages: data.messages,
      avatarUrl: (avatarMap && avatarMap[username.toLowerCase()]) || null,
    }));
}

function getWordCloud(limit) {
  return Object.values(wordCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((w) => ({ word: w.original, count: w.count }));
}

function getTopEmotes(limit) {
  return Object.entries(emoteCounts)
    .filter(([, d]) => d.name)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([id, d]) => ({
      id, name: d.name, count: d.count,
      imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`,
    }));
}

function getAllUsernames() {
  return Object.keys(perUser);
}

function getTotalMessages() { return totalMessages; }

function getTotalEmotes() { return Object.values(emoteCounts).reduce((a, d) => a + (d.count || 0), 0); }

function getPersistData() {
  return { perUser, wordCounts, emoteCounts, totalMessages };
}

/** Полный сброс статистики — использовать в начале нового стрима. */
function reset() {
  perUser = {};
  wordCounts = {};
  emoteCounts = {};
  totalMessages = 0;
}

module.exports = { getTotalEmotes,
  init, recordMessage, stripEmotesForDisplay, getTopChatters, getWordCloud, getTopEmotes,
  getAllUsernames, getTotalMessages, getPersistData, reset,
};
