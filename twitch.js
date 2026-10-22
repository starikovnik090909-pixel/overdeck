// twitch.js
// Подключение к чату Twitch (анонимно, justinfan, только чтение)
// и обёртки над Twitch Helix API (App Access Token, аватарки, категории).

const tmi = require('tmi.js');

/**
 * Подключиться к чату канала. onMessage(tags, message) вызывается на каждое
 * сообщение (кроме своих же, self всегда false для анонимного клиента).
 */
function connectChat(channel, onMessage, onConnected) {
  const client = new tmi.Client({ channels: [channel] });

  client.on('message', (ch, tags, message, self) => {
    if (self) return;
    onMessage(tags, message);
  });

  client.on('connected', () => {
    if (onConnected) onConnected();
  });

  client.connect().catch((err) => {
    console.error('Не удалось подключиться к чату Twitch:', err.message || err);
  });

  return client;
}

// ---------- Helix API ----------

let appToken = null;
let appTokenExpiresAt = 0;

const ID_URL = process.env.TWITCH_ID_URL || 'https://id.twitch.tv'; // переменные — только для тестов
const API_URL = process.env.TWITCH_API_URL || 'https://api.twitch.tv';

// Публичное приложение (без Client Secret): вместо токена приложения Helix-запросы идут с токеном стримера.
let userTokenProvider = null;
function setUserTokenProvider(fn) { userTokenProvider = fn; }
function isPublicMode(config) {
  const { clientId, clientSecret } = config.twitch || {};
  return !!(clientId && !clientSecret);
}

function hasCredentials(config) {
  const { clientId, clientSecret } = config.twitch || {};
  if (!clientId || clientId.startsWith('ВСТАВЬ')) return false;
  if (clientSecret) return true;
  return !!(config.twitchAuth && config.twitchAuth.accessToken);
}

// Если Twitch отверг Client ID/Secret (например, секрет пересоздан в консоли), каждый следующий вызов helixGet (проверка стрима,
// значки, аватарки… — их десятки в минуту) раньше заново стучался за токеном и печатал предупреждение: консоль забивалась, а Twitch
// получал лишние запросы. Теперь: пауза после отказа, один общий запрос вместо параллельных и одно понятное сообщение на «эпизод» отказа.
const APP_TOKEN_RETRY_MS = Number(process.env.TWITCH_APP_TOKEN_RETRY_MS) || 5 * 60 * 1000; // переменная — только для тестов
const APP_TOKEN_NETWORK_RETRY_MS = 30 * 1000; // сетевой сбой — вероятно временный, пробуем чаще
let appTokenFailure = null; // { key, at, message, retryMs } — последний отказ для ТЕКУЩЕЙ пары ключей
let appTokenInFlight = null; // { key, promise }
let appTokenListener = null;
let appTokenErrorReported = false; // слушателю (админке) сообщили об ошибке и ещё не сообщили о восстановлении — не зависит от паузы, которую сбрасывает invalidateToken()

/** server.js подписывается, чтобы показать в админке, что ключи приложения канала не приняты (и убрать сообщение, когда всё наладилось). */
function setAppTokenListener(fn) {
  appTokenListener = fn;
}

function appTokenErrorText(status, message) {
  const base = `Twitch не принимает Client ID/Secret приложения канала (${status ? status + ': ' : ''}${message}).`;
  return /client secret/i.test(String(message))
    ? `${base} Client ID верный, но секрет не подходит — его могли пересоздать в консоли Twitch или вставить секрет другого приложения. Проверь ключи во вкладке «Подключения».`
    : `${base} Проверь Client ID и Client Secret во вкладке «Подключения».`;
}

function recordAppTokenFailure(key, message, retryMs) {
  const isNewEpisode = !appTokenFailure || appTokenFailure.key !== key || appTokenFailure.message !== message;
  appTokenFailure = { key, at: Date.now(), message, retryMs };
  if (isNewEpisode) {
    console.warn(`${message} Повторные попытки — не чаще раза в ${Math.round(retryMs / 1000)} с, это сообщение не повторяется.`);
    appTokenErrorReported = true;
    if (appTokenListener) appTokenListener({ ok: false, message });
  }
}

async function requestAppToken(config, key) {
  const { clientId, clientSecret } = config.twitch;
  try {
    const url = `${ID_URL}/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (!data.access_token) {
      recordAppTokenFailure(key, appTokenErrorText(data.status || res.status, data.message || 'нет access_token в ответе'), APP_TOKEN_RETRY_MS);
      return null;
    }
    appToken = data.access_token;
    appTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    appTokenFailure = null;
    if (appTokenErrorReported) {
      appTokenErrorReported = false;
      console.log('Токен приложения канала Twitch снова получен — ключи приняты.');
      if (appTokenListener) appTokenListener({ ok: true });
    }
    return appToken;
  } catch (e) {
    recordAppTokenFailure(key, `Ошибка получения Twitch app access token: ${e.message}.`, APP_TOKEN_NETWORK_RETRY_MS);
    return null;
  }
}

async function getAppAccessToken(config) {
  if (!hasCredentials(config)) return null;
  if (isPublicMode(config)) {
    try { return userTokenProvider ? await userTokenProvider() : config.twitchAuth.accessToken; } catch (e) { return null; }
  }
  if (appToken && Date.now() < appTokenExpiresAt - 60000) return appToken;

  const key = `${config.twitch.clientId}|${config.twitch.clientSecret}`;
  // Пауза после отказа — только для той же пары ключей: смена ключей пробуется сразу.
  if (appTokenFailure && appTokenFailure.key === key && Date.now() - appTokenFailure.at < appTokenFailure.retryMs) return null;
  if (appTokenInFlight && appTokenInFlight.key === key) return appTokenInFlight.promise;

  const promise = requestAppToken(config, key);
  appTokenInFlight = { key, promise };
  try {
    return await promise;
  } finally {
    if (appTokenInFlight && appTokenInFlight.promise === promise) appTokenInFlight = null;
  }
}

async function helixGet(config, endpoint, params) {
  if (!hasCredentials(config)) return null;
  const token = await getAppAccessToken(config);
  if (!token) return null;
  try {
    const qs = params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/helix/${endpoint}?${qs}`, {
      headers: {
        'Client-ID': config.twitch.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });
    return await res.json();
  } catch (e) {
    console.warn(`Ошибка Helix запроса (${endpoint}):`, e.message);
    return null;
  }
}

/** Возвращает { username(lower): avatarUrl } для списка логинов (максимум 100 за раз). */
async function fetchAvatars(config, usernames) {
  if (!hasCredentials(config) || usernames.length === 0) return {};
  const params = new URLSearchParams();
  usernames.slice(0, 100).forEach((u) => params.append('login', u));
  const data = await helixGet(config, 'users', params);
  const result = {};
  if (data && Array.isArray(data.data)) {
    data.data.forEach((u) => { result[u.login.toLowerCase()] = u.profile_image_url; });
  }
  return result;
}

async function resolveBroadcasterId(config, channel) {
  const data = await helixGet(config, 'users', new URLSearchParams({ login: channel }));
  if (data && data.data && data.data[0]) return data.data[0].id;
  return null;
}

async function fetchChannelInfo(config, broadcasterId) {
  const data = await helixGet(config, 'channels', new URLSearchParams({ broadcaster_id: broadcasterId }));
  return (data && data.data && data.data[0]) || null;
}

/** true/false — идёт ли трансляция прямо сейчас (Get Streams: пустой массив = офлайн). */
async function fetchStreamStatus(config, broadcasterId) {
  const data = await helixGet(config, 'streams', new URLSearchParams({ user_id: broadcasterId }));
  return !!(data && Array.isArray(data.data) && data.data.length > 0);
}

async function fetchGameArt(config, gameId) {
  if (!gameId) return null;
  const data = await helixGet(config, 'games', new URLSearchParams({ id: gameId }));
  const game = data && data.data && data.data[0];
  if (!game || !game.box_art_url) return null;
  // 285x380 — стандартный размер обложки Twitch. Раньше было 144x192, но теперь обложка растягивается плиткой на всю высоту
  // блока таймлайна (фон из категорий), и на такой высоте 144x192 выглядело бы мыльным. Старые записи истории остаются как были.
  return game.box_art_url.replace('{width}', '285').replace('{height}', '380');
}

async function fetchGlobalBadges(config) {
  const data = await helixGet(config, 'chat/badges/global', new URLSearchParams());
  return (data && data.data) || [];
}

async function fetchChannelBadges(config, broadcasterId) {
  const data = await helixGet(config, 'chat/badges', new URLSearchParams({ broadcaster_id: broadcasterId }));
  return (data && data.data) || [];
}

/** Сбрасывает кэш App Access Token — вызывать сразу после смены clientId/clientSecret. */
function invalidateToken() {
  appToken = null;
  appTokenExpiresAt = 0;
  appTokenFailure = null; // новые/перепроверенные ключи — пробуем сразу, а не ждём конца паузы
}
/**
 * Проверяет пару Client ID / Client Secret напрямую (не трогая закэшированный
 * appToken — это отдельный, "пробный" запрос токена, годится и для непосохранённых
 * значений). Возвращает { valid, error? }.
 */
async function validateCredentials(clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    return { valid: false, error: 'Заполните Client ID и Client Secret' };
  }
  try {
    const url = `${ID_URL}/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (!data.access_token) {
      return { valid: false, error: data.message || 'Twitch отклонил Client ID/Client Secret' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: `Сетевая ошибка при обращении к Twitch: ${e.message}` };
  }
}

// ---------- OAuth Authorization Code flow ("Войти через Twitch") ----------
// Используется для подтверждения подключения конкретного канала (аватарка,
// имя) — отдельно от App Access Token (client_credentials), который нужен
// для чтения публичных данных (аватарки чаттеров, категории).

const SCOPES = 'channel:read:redemptions channel:read:subscriptions channel:manage:predictions channel:read:predictions channel:manage:polls channel:read:hype_train moderator:read:followers';

// ---------- Device Code Flow (вход по коду для публичного приложения) ----------
async function postForm(url, params) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { message: e.message } };
  }
}
/** → { device_code, user_code, verification_uri, expires_in, interval } */
function startDeviceAuth(clientId) {
  return postForm(`${ID_URL}/oauth2/device`, { client_id: clientId, scopes: SCOPES });
}
/** → { status, data }: data.access_token при успехе; data.message === 'authorization_pending', пока стример не ввёл код */
function pollDeviceAuth(clientId, deviceCode) {
  return postForm(`${ID_URL}/oauth2/token`, { client_id: clientId, scopes: SCOPES, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
}
/** Обновление токена стримера; у публичного приложения — без секрета. */
function refreshUserToken(clientId, clientSecret, refreshToken) {
  const p = { client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken };
  if (clientSecret) p.client_secret = clientSecret;
  return postForm(`${ID_URL}/oauth2/token`, p);
}

function buildAuthorizeUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // channel:read:redemptions/subscriptions — для EventSub (таймлайн).
    // channel:manage:predictions — создание/завершение ставок (вкладка "Ставки");
    // этот же scope, по документации Twitch, покрывает и чтение (GET), так что
    // отдельный channel:read:predictions не обязателен, но добавлен явно —
    // хуже не будет, а по духу задания он был запрошен отдельно.
    // ВАЖНО: это меняет набор прав — уже подключённым каналам нужно будет
    // переподключиться ("Войти через Twitch" ещё раз), чтобы Twitch выдал
    // токен с новыми правами; старый токен их не получит сам по себе.
    // channel:manage:polls — создание/завершение опросов (вкладка "Чат"); покрывает и чтение опросов. Как и с прогнозами —
    // уже подключённым каналам нужно войти через Twitch ещё раз, чтобы получить токен с этим правом.
    // channel:read:hype_train и moderator:read:followers — для алертов Hype Train и фоллоу (нужен повторный вход через Twitch).
    scope: SCOPES,
    state,
  });
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(clientId, clientSecret, code, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  try {
    const res = await fetch(`${ID_URL}/oauth2/token?${params.toString()}`, { method: 'POST' });
    return await res.json();
  } catch (e) {
    return { error: 'network_error', message: e.message };
  }
}

/** С пользовательским access token'ом (без ?login=) — вернёт данные ВЛАДЕЛЬЦА токена. */
async function getOwnUser(clientId, userAccessToken) {
  try {
    const res = await fetch(`${API_URL}/helix/users`, {
      headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${userAccessToken}` },
    });
    const data = await res.json();
    return (data && data.data && data.data[0]) || null;
  } catch (e) {
    return null;
  }
}

async function revokeToken(clientId, token) {
  try {
    await fetch(`${ID_URL}/oauth2/revoke?client_id=${encodeURIComponent(clientId)}&token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch (e) {
    // best effort — если Twitch недоступен, просто забываем токен локально
  }
}

module.exports = {
  SCOPES, startDeviceAuth, pollDeviceAuth, refreshUserToken, setUserTokenProvider, isPublicMode,
  connectChat,
  hasCredentials,
  fetchAvatars,
  resolveBroadcasterId,
  fetchChannelInfo,
  fetchStreamStatus,
  fetchGameArt,
  fetchGlobalBadges,
  fetchChannelBadges,
  invalidateToken,
  setAppTokenListener,
  validateCredentials,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getOwnUser,
  revokeToken,
};
