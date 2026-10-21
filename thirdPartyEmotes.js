// thirdPartyEmotes.js
// Смайлы 7TV / BetterTTV / FrankerFaceZ через @mkody/twitch-emoticons.
// Twitch-ключи этой библиотеке не нужны — они требуются только для НАТИВНЫХ
// twitch-эмодзи, а те мы и так получаем из tags.emotes (tmi.js). Если сеть
// или API недоступны — просто работаем без сторонних смайлов, чат не ломается.

const { EmoteFetcher } = require('@mkody/twitch-emoticons');

const fetcher = new EmoteFetcher();

let emoteMap = new Map(); // name -> { url, zeroWidth }
let loaded = false;

function extractZeroWidth(emote) {
  return !!(
    emote.zeroWidth ||
    emote.zero_width ||
    (emote.flags && (emote.flags.zeroWidth || emote.flags.zero_width))
  );
}

function rebuildIndex() {
  const map = new Map();
  fetcher.emotes.forEach((emote, name) => {
    try {
      map.set(name, { url: emote.toLink(), zeroWidth: extractZeroWidth(emote) });
    } catch (e) {
      // пропускаем смайлы, у которых почему-то нет валидной ссылки
    }
  });
  emoteMap = map;
}

/**
 * Загружает глобальные + (если передан channelId) канальные смайлы
 * BTTV/FFZ/7TV. channelId — числовой Twitch ID канала, не имя.
 * Ничего не бросает наружу — при ошибке отдельного провайдера просто
 * пропускает его, чат продолжает работать.
 */
async function loadForChannel(channelId) {
  const tasks = [
    fetcher.fetchBTTVEmotes().catch(() => null),
    fetcher.fetchFFZEmotes().catch(() => null),
    fetcher.fetchSevenTVEmotes().catch(() => null),
  ];
  if (channelId) {
    tasks.push(fetcher.fetchBTTVEmotes(channelId).catch(() => null));
    tasks.push(fetcher.fetchFFZEmotes(channelId).catch(() => null));
    tasks.push(fetcher.fetchSevenTVEmotes(channelId).catch(() => null));
  }
  await Promise.all(tasks);
  rebuildIndex();
  loaded = true;
  console.log(`[Эмодзи] Загружено сторонних смайлов (7TV/BTTV/FFZ): ${emoteMap.size}`);
}

function isLoaded() { return loaded; }
function getEmote(name) { return emoteMap.get(name); }
function size() { return emoteMap.size; }

module.exports = { loadForChannel, isLoaded, getEmote, size };
