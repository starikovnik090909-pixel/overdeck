// categories.js
// Опрашивает текущую категорию трансляции через Twitch Helix и хранит историю смен.

const twitch = require('./twitch');

let broadcasterId = null;
let current = null;      // { name, boxArtUrl, startedAt }
let history = [];        // [{ name, boxArtUrl, startedAt }], history[0] — текущая/самая новая

function init(saved) {
  if (!saved) return;
  current = saved.current || null;
  history = saved.history || [];
}

/**
 * Опрашивает Twitch API. Возвращает { changed, entry } — entry заполнен,
 * если категория изменилась (используется вызывающим кодом, чтобы добавить
 * событие в таймлайн).
 */
async function poll(config, channel) {
  if (!twitch.hasCredentials(config)) return { changed: false };

  if (!broadcasterId) {
    broadcasterId = await twitch.resolveBroadcasterId(config, channel);
    if (!broadcasterId) return { changed: false };
  }

  const info = await twitch.fetchChannelInfo(config, broadcasterId);
  if (!info) return { changed: false };

  const gameName = info.game_name || 'Без категории';
  if (current && current.name === gameName) return { changed: false };

  const boxArtUrl = await twitch.fetchGameArt(config, info.game_id);
  const entry = { name: gameName, boxArtUrl, startedAt: Date.now() };

  current = entry;
  history.unshift(entry);
  if (history.length > 60) history.length = 60; // раньше 6 — но для фона из обложек нужны ВСЕ смены категорий за стрим (клиентская полоса превью сама берёт только 6 свежих)

  return { changed: true, entry };
}

function getSnapshot() {
  return { current, history };
}

function getPersistData() {
  return { current, history };
}

/** Полный сброс истории категорий — новый стрим начинается с нуля (текущая категория подхватится следующим опросом). */
function reset() {
  current = null;
  history = [];
}

module.exports = { init, poll, getSnapshot, getPersistData, reset };
