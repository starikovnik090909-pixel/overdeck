// chatBot.js
// Вкладка «Чат-бот»: отдельный Twitch-аккаунт бота + его User Access Token.
// Сейчас — только подключение и ЧТЕНИЕ сообщений (без команд и ответов).
//
// Как это работает (по официальному руководству Twitch по чат-ботам):
//   1. Токен проверяется через https://id.twitch.tv/oauth2/validate — оттуда же
//      берём client_id приложения, которое выдало токен, user_id бота и список
//      scope (отдельное поле Client ID пользователю вводить не нужно).
//   2. Открывается EventSub WebSocket (wss://eventsub.wss.twitch.tv/ws).
//   3. После session_welcome — POST /helix/eventsub/subscriptions на
//      channel.chat.message: broadcaster_user_id = канал, user_id = бот
//      (владелец токена). Для пользовательского токена достаточно scope
//      user:read:chat; user:write:chat понадобится позже для ответов в чат,
//      user:bot — для работы бота как "бота" (значок/EventSub-режим).
//
// Токен бота — секрет: хранится только в chat_bot.json (в .gitignore) и НИКОГДА
// не отдаётся в админку обратно (только флаг "есть токен" и последние 4 символа).

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const botCommands = require('./botCommands');
const botTimers = require('./botTimers');
const autoMod = require('./autoMod');
const crypto = require('crypto');

const FILE_PATH = path.join(__dirname, 'chat_bot.json');
const EVENTSUB_WS_URL = process.env.TWITCH_EVENTSUB_WS_URL || 'wss://eventsub.wss.twitch.tv/ws'; // переменная — только для локальных тестов с mock-сервером
const REQUIRED_SCOPE = 'user:read:chat'; // без него подписка на чат невозможна
const RECOMMENDED_SCOPES = ['user:write:chat', 'user:bot']; // нужны боту дальше (ответы/статус бота) — их отсутствие только предупреждение
const MAX_RECENT = 30;
const HELIX_URL = process.env.TWITCH_HELIX_URL || 'https://api.twitch.tv/helix'; // переменная — только для локальных тестов с mock-сервером
const COMMAND_COOLDOWN_MS = 3000; // одну и ту же команду бот повторно не отправляет чаще, чем раз в 3 секунды (защита от спама и лимитов Twitch)
const SEND_SCOPE = 'user:write:chat';
// Удаление сообщений (DELETE /helix/moderation/chat) требует ИМЕННО это право (не channel:moderate) и чтобы владелец токена был модератором канала.
const AUTOMOD_SCOPE = 'moderator:manage:chat_messages';
// Бейджи, чьи сообщения удалить нельзя (Twitch отвечает ошибкой) — такие сообщения автомодерация пропускает.
const AUTOMOD_EXEMPT_BADGES = ['broadcaster', 'moderator', 'staff', 'admin', 'global_mod'];
const TIMER_TICK_MS = 10000; // как часто проверяем, не пора ли отправить сообщение по таймеру
const TIMER_SEND_GAP_MS = 5000; // если сразу несколько сообщений «созрели» — между ними пауза, чтобы не вываливать очередь разом
const ID_URL = process.env.TWITCH_ID_URL || 'https://id.twitch.tv/oauth2'; // переменная — только для локальных тестов с mock-сервером
// За сколько до конца жизни access-токена обновлять его заранее (по умолчанию за 5 минут). Переменная — для тестов.
const REFRESH_MARGIN_MS = (Number(process.env.CHATBOT_REFRESH_MARGIN_SEC) || 300) * 1000;
const MIN_TIMER_MS = Number(process.env.CHATBOT_MIN_TIMER_MS) || 30000; // нижняя граница задержки таймера обновления (тоже настраивается только для тестов)

// botToken — access-токен бота (живёт около часа), refreshToken — им обновляется; tokenExpiresAt — когда access-токен истекает (мс, 0 = неизвестно).
// botClientId/botClientSecret — приложение, которым получен токен БОТА (может отличаться от приложения канала из вкладки «Подключения»).
// Пусто → для обновления токена используются общие Client ID/Secret (см. effectiveCredentials()).
let data = { botUsername: '', botToken: '', refreshToken: '', tokenExpiresAt: 0, botClientId: '', botClientSecret: '', channelName: '', channelId: '' };

// Состояние соединения — только в памяти.
let status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
let statusMessage = 'Не подключён';
let session = null; // { clientId, botUserId, botLogin, scopes, channelId } — результат последней успешной проверки
let socket = null;
let stopped = true;
let generation = 0; // защита от «залётных» событий старых сокетов после отключения/переподключения
let keepaliveTimer = null;
let reconnectTimer = null;
const recentMessages = [];
let lastCommand = null; // { command, user, ok, error?, at } — что бот ответил на последнюю команду (для админки)
const commandCooldowns = new Map(); // id команды -> время последней отправки

// Автообновление токена: Client ID/Secret берём у приложения из вкладки «Подключения» (их даёт server.js), а не заводим второй раз.
let appCredentials = () => ({ clientId: '', clientSecret: '' });
let refreshInFlight = null; // одновременные обновления схлопываются в один запрос (иначе при ротации refresh-токена второй запрос мог бы его «сжечь»)
let refreshTimer = null;
// Сообщения по таймеру: расписание живёт в памяти, пока бот подключён (сами сообщения и интервалы — в botTimers.js / bot_timers.json).
const timerState = new Map(); // id сообщения -> { nextAt, intervalMs, lastAt, lastError }
let timerTickHandle = null;
let timerTickBusy = false;
let liveProvider = () => true; // server.js подставляет проверку «идёт ли стрим» — нужна только при включённой настройке «только пока идёт стрим»
let lastTimerMessage = null; // { id, text, ok, error?, at } — итог последней отправки по таймеру (для админки)
// Автомодерация: счётчики и текущая проблема (нет права / бот не модератор…) — показывается предупреждением в админке.
const autoModState = { deleted: 0, lastDeleteAt: null, problem: null, loggedKey: null };
let lastRefresh = null; // { ok, at, error? } — итог последнего обновления (для админки)
let lastRevocationRecoveryAt = 0;

let onStatusChange = null; // server.js подписывается, чтобы шапка админки обновлялась сразу, а не в ближайший 2-секундный тик

function setStatus(next, message) {
  const changed = next !== status;
  status = next;
  statusMessage = message;
  if (changed && onStatusChange) onStatusChange();
}

/** Лёгкая версия для общей рассылки статусов админки (без списка сообщений и полей). */
function getStatus() {
  return { status, statusMessage };
}

function setOnStatusChange(fn) {
  onStatusChange = fn;
}

/** server.js передаёт функцию, отдающую { clientId, clientSecret } приложения Twitch (то же, что для входа в админку). */
function setAppCredentialsProvider(fn) {
  appCredentials = fn;
}

/* ---------- Хранение ---------- */

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      data = {
        botUsername: typeof raw.botUsername === 'string' ? raw.botUsername : '',
        botToken: typeof raw.botToken === 'string' ? raw.botToken : '',
        refreshToken: typeof raw.refreshToken === 'string' ? raw.refreshToken : '',
        tokenExpiresAt: Number.isFinite(Number(raw.tokenExpiresAt)) ? Number(raw.tokenExpiresAt) : 0,
        botClientId: typeof raw.botClientId === 'string' ? raw.botClientId : '',
        botClientSecret: typeof raw.botClientSecret === 'string' ? raw.botClientSecret : '',
        channelName: typeof raw.channelName === 'string' ? raw.channelName : '',
        channelId: typeof raw.channelId === 'string' ? raw.channelId : '',
      };
    }
  } catch (e) {
    console.warn('[Чат бот] Не удалось прочитать chat_bot.json:', e.message);
  }
}

/** Пишем во временный файл и переименовываем: после обновления токена Twitch может считать старый refresh-токен недействительным, поэтому оборванная посреди записи chat_bot.json оставила бы бота без рабочей пары токенов. */
function persist() {
  try {
    const tmp = `${FILE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE_PATH);
  } catch (e) {
    console.warn('[Чат бот] Не удалось сохранить chat_bot.json:', e.message);
  }
}

function init() {
  load();
}

/** Что видит админка: всё, КРОМЕ самого токена. */
function getPublic() {
  return {
    botUsername: data.botUsername,
    channelName: data.channelName,
    channelId: data.channelId,
    hasToken: !!data.botToken,
    tokenPreview: data.botToken ? `…${data.botToken.slice(-4)}` : '',
    hasRefreshToken: !!data.refreshToken,
    refreshTokenPreview: data.refreshToken ? `…${data.refreshToken.slice(-4)}` : '',
    tokenExpiresAt: data.tokenExpiresAt || 0,
    botClientId: data.botClientId,
    hasBotClientSecret: !!data.botClientSecret,
    botClientSecretPreview: data.botClientSecret ? `…${data.botClientSecret.slice(-4)}` : '',
    autoRefresh: { enabled: canRefresh(), reason: refreshBlockReason(), source: effectiveCredentials().source },
    lastRefresh,
    status,
    statusMessage,
    botUserId: session ? session.botUserId : null,
    scopes: session ? session.scopes : [],
    recentMessages: recentMessages.slice(-MAX_RECENT),
    lastCommand,
    serverNow: Date.now(), // чтобы админка считала «через N мин» по часам сервера, а не своим
    timers: [...timerState.entries()].map(([id, st]) => ({ id, nextAt: st.nextAt, lastAt: st.lastAt, lastError: st.lastError })),
    lastTimerMessage,
    autoMod: { ...autoMod.getSummary(), deleted: autoModState.deleted, lastDeleteAt: autoModState.lastDeleteAt, warning: autoModWarning() },
  };
}

function normalizeToken(value) {
  return String(value || '').trim().replace(/^oauth:/i, '');
}

/**
 * Сохраняет поля. Пустой токен в запросе = "оставить прежний" (иначе каждое
 * сохранение без повторного ввода токена стирало бы его). Возвращает
 * { ok, error? } — ошибка валидации не пишет ничего.
 */
function save(fields) {
  const f = fields || {};
  const has = (k) => f[k] !== undefined; // обновляем только присланные поля — остальные остаются как были
  const botUsername = has('botUsername') ? String(f.botUsername || '').trim().replace(/^@/, '') : data.botUsername;
  const channelName = has('channelName') ? String(f.channelName || '').trim().replace(/^@/, '').toLowerCase() : data.channelName;
  const channelId = has('channelId') ? String(f.channelId || '').trim() : data.channelId;
  if (channelId && !/^\d+$/.test(channelId)) {
    return { ok: false, error: 'Channel ID — это числовой ID канала (только цифры).' };
  }
  const newToken = has('botToken') ? normalizeToken(f.botToken) : '';
  const newRefresh = has('refreshToken') ? normalizeToken(f.refreshToken) : '';
  const tokenChanged = !!newToken && newToken !== data.botToken;
  const botClientId = has('botClientId') ? String(f.botClientId || '').trim() : data.botClientId;
  const typedSecret = has('botClientSecret') ? String(f.botClientSecret || '').trim() : '';
  let botClientSecret = typedSecret || data.botClientSecret; // пустое поле секрета = «не менять»
  // Очистили Bot Client ID (и не ввели новый секрет) — значит, возвращаемся к общим данным: секрет без ID бессмыслен, стираем и его.
  if (has('botClientId') && !botClientId && !typedSecret) botClientSecret = '';
  data = {
    botUsername,
    botToken: newToken || data.botToken,
    refreshToken: newRefresh || data.refreshToken,
    tokenExpiresAt: tokenChanged ? 0 : data.tokenExpiresAt, // новый access-токен — срок неизвестен, пока его не проверили
    botClientId,
    botClientSecret,
    channelName,
    channelId,
  };
  persist();
  if (session && !stopped) scheduleRefresh(); // бот уже подключён, а Refresh Token только что добавили — сразу ставим автообновление на таймер
  return { ok: true };
}

/* ---------- Twitch API ---------- */

async function validateToken(token) {
  const res = await fetch(`${ID_URL}/validate`, { headers: { Authorization: `OAuth ${token}` } });
  if (res.status === 401) {
    const err = new Error('Токен недействителен или истёк (Twitch вернул 401). Получи новый токен бота.');
    err.expired = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Не удалось проверить токен (Twitch ответил ${res.status}).`);
  return res.json(); // { client_id, login, user_id, scopes, expires_in }
}

/**
 * Чьи Client ID/Secret использовать для обновления токена БОТА. Если заполнено хоть одно из полей Bot Client ID/Secret — используем ТОЛЬКО их
 * (source 'bot'; половинки разных приложений не смешиваем — неполная пара считается ошибкой заполнения, а не тихо дополняется общими).
 * Оба пусты — откат на общие данные приложения канала из вкладки «Подключения» (source 'shared'), как было раньше.
 */
function effectiveCredentials() {
  if (data.botClientId || data.botClientSecret) {
    return { clientId: data.botClientId, clientSecret: data.botClientSecret, source: 'bot' };
  }
  const shared = appCredentials();
  return { clientId: shared.clientId || '', clientSecret: shared.clientSecret || '', source: 'shared' };
}

/** Почему автообновление сейчас невозможно ('' — возможно). Показывается в админке. */
function refreshBlockReason() {
  if (!data.refreshToken) return 'не указан Refresh Token';
  const c = effectiveCredentials();
  if (c.source === 'bot' && (!c.clientId || !c.clientSecret)) {
    return 'заполни оба поля Bot Client ID и Bot Client Secret (или очисти Bot Client ID — тогда будут использоваться общие данные из вкладки «Подключения»)';
  }
  if (!c.clientId || !c.clientSecret) {
    return 'не заданы Client ID и Client Secret: заполни Bot Client ID и Bot Client Secret приложения бота (или общие данные во вкладке «Подключения»)';
  }
  if (session && session.clientId && session.clientId !== c.clientId) {
    return c.source === 'bot'
      ? `токен бота выдан приложением ${session.clientId}, а в поле Bot Client ID указано ${c.clientId}`
      : `токен бота выдан приложением ${session.clientId}, а во вкладке «Подключения» указано ${c.clientId} — заполни Bot Client ID и Bot Client Secret приложения бота`;
  }
  return '';
}
function canRefresh() {
  return refreshBlockReason() === '';
}

/**
 * Обновляет access-токен по Refresh Token: POST {ID_URL}/token (grant_type=refresh_token + client_id/client_secret).
 * Новые access_token и refresh_token (если Twitch прислал новый) сразу пишутся в chat_bot.json — чтобы пережить перезапуск.
 * Параллельные вызовы делят один запрос. Ошибка с permanent=true — Twitch отверг сам refresh-токен/приложение (повторять бессмысленно).
 */
function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const reason = refreshBlockReason();
    if (reason) throw new Error(`Обновить токен бота нельзя: ${reason}.`);
    const c = effectiveCredentials();
    const res = await fetch(`${ID_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: data.refreshToken,
        client_id: c.clientId,
        client_secret: c.clientSecret,
      }).toString(),
    });
    let body = null;
    try { body = await res.json(); } catch (e) { /* пустое тело */ }
    if (!res.ok || !body || !body.access_token) {
      const detail = (body && (body.message || body.error_description)) || `HTTP ${res.status}`;
      // Называем, ЧЬИ данные использовались: самая частая причина «Invalid refresh token» — токен бота получен одним приложением, а обновляют его данными другого.
      const used = c.source === 'bot' ? `Bot Client ID ${c.clientId}` : 'общие Client ID/Secret из вкладки «Подключения» (Bot Client ID не заполнен)';
      const advice = c.source === 'bot'
        ? 'Проверь, что Bot Client ID/Secret — от того же приложения, которым получен токен бота, и что Refresh Token от этой же пары; если доступ отозван — получи новую пару токенов.'
        : 'Если токен бота получен другим приложением (не тем, что для канала) — заполни Bot Client ID и Bot Client Secret этого приложения в панели «Авторизация бота». Иначе проверь Refresh Token; если доступ отозван — получи новую пару токенов.';
      const err = new Error(`Twitch не обновил токен бота (${detail}). Использованы: ${used}. ${advice}`);
      err.permanent = res.status === 400 || res.status === 401;
      throw err;
    }
    data.botToken = body.access_token;
    if (body.refresh_token) data.refreshToken = body.refresh_token; // Twitch может как вернуть новый refresh-токен, так и оставить прежний
    data.tokenExpiresAt = Number(body.expires_in) > 0 ? Date.now() + Number(body.expires_in) * 1000 : 0;
    persist();
    lastRefresh = { ok: true, at: Date.now() };
    console.log('[Чат бот] Токен бота обновлён по Refresh Token.');
    scheduleRefresh();
  })();
  const p = refreshInFlight;
  const done = () => { if (refreshInFlight === p) refreshInFlight = null; };
  p.then(done, (e) => { lastRefresh = { ok: false, at: Date.now(), error: e.message }; done(); });
  return p;
}

/** Перед запросом к Twitch: если токен истёк или истекает в ближайшие REFRESH_MARGIN_MS — обновляем. Если обновить не вышло, а токен ещё жив — продолжаем со старым. */
async function ensureFreshToken() {
  if (!data.tokenExpiresAt || data.tokenExpiresAt - Date.now() > REFRESH_MARGIN_MS || !canRefresh()) return;
  try {
    await refreshAccessToken();
  } catch (e) {
    if (data.tokenExpiresAt > Date.now()) return;
    throw e;
  }
}

/** Запрос к Helix от имени бота: свежий токен перед отправкой; если всё равно 401 (токен отозвали/истёк раньше срока) — один раз обновляем и повторяем. */
async function authedFetch(url, init) {
  await ensureFreshToken();
  const make = () => fetch(url, { ...init, headers: { ...init.headers, 'Client-Id': session.clientId, Authorization: `Bearer ${data.botToken}` } });
  let res = await make();
  if (res.status === 401 && canRefresh()) {
    await refreshAccessToken();
    res = await make();
  }
  return res;
}

function armRefreshTimer(delayMs) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (stopped) return;
    try {
      await refreshAccessToken();
    } catch (e) {
      console.warn('[Чат бот]', e.message);
      if (!e.permanent && !stopped) armRefreshTimer(60000); // сеть/5xx — повторим через минуту, пока текущий токен ещё жив
    }
  }, Math.min(Math.max(delayMs, 100), 2147000000));
  if (refreshTimer.unref) refreshTimer.unref();
}

/** Ставит обновление на таймер за REFRESH_MARGIN_MS до конца жизни токена — бот не «просыпается» с истёкшим токеном. */
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  if (stopped || !data.tokenExpiresAt || !canRefresh()) return;
  const remaining = data.tokenExpiresAt - Date.now();
  // Обычно — за REFRESH_MARGIN_MS до конца. Если токен живёт меньше двух запасов (странно короткий срок) — на середине жизни, но не чаще MIN_TIMER_MS,
  // иначе вместо экономного обновления получился бы цикл запросов к Twitch.
  armRefreshTimer(remaining > REFRESH_MARGIN_MS * 2 ? remaining - REFRESH_MARGIN_MS : Math.max(remaining / 2, MIN_TIMER_MS));
}

/** Проверка токена при «Подключить»: если access-токен пуст или истёк — сначала пробуем получить/обновить его по Refresh Token. */
async function validateWithRefresh() {
  if (!data.botToken && canRefresh()) {
    setStatus('connecting', 'Получаю токен бота по Refresh Token…');
    await refreshAccessToken();
  }
  try {
    return await validateToken(data.botToken);
  } catch (e) {
    if (!e.expired) throw e;
    if (canRefresh()) {
      setStatus('connecting', 'Токен истёк — обновляю по Refresh Token…');
      await refreshAccessToken();
      return validateToken(data.botToken);
    }
    const reason = refreshBlockReason();
    throw new Error(`${e.message} Автообновление недоступно: ${reason}.`);
  }
}

/** Ищет пользователя Twitch по логину ({ login }) или числовому ID ({ id }); возвращает { id, login, display_name }. */
async function lookupUser(by, clientId, token) {
  const query = by.login ? `login=${encodeURIComponent(by.login)}` : `id=${encodeURIComponent(by.id)}`;
  const label = by.login ? `«${by.login}»` : `с ID ${by.id}`;
  const res = await fetch(`${HELIX_URL}/users?${query}`, {
    headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Не удалось найти канал ${label} (Twitch ответил ${res.status}).`);
  const body = await res.json();
  const user = body.data && body.data[0];
  if (!user) throw new Error(`Канал ${label} не найден на Twitch — проверь ${by.login ? 'название' : 'ID'}.`);
  return user;
}

async function subscribeToChat(sessionId) {
  const res = await authedFetch(`${HELIX_URL}/eventsub/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'channel.chat.message',
      version: '1',
      condition: { broadcaster_user_id: session.channelId, user_id: session.botUserId },
      transport: { method: 'websocket', session_id: sessionId },
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* тела нет */ }
    throw new Error(`Twitch отклонил подписку на чат (${res.status}${detail ? `: ${detail}` : ''}).`);
  }
}

/**
 * Отправляет сообщение в чат от имени бота (POST /helix/chat/messages). Нужен scope user:write:chat; sender_id
 * обязан совпадать с владельцем токена (это и есть бот). Twitch может принять запрос, но не отправить сообщение
 * (is_sent=false — например, слишком частая отправка или режим уникальных сообщений) — это тоже считаем ошибкой.
 */
async function sendChatMessage(text) {
  if (!session) throw new Error('Бот не подключён.');
  if (!session.scopes.includes(SEND_SCOPE)) {
    throw new Error(`У токена бота нет права ${SEND_SCOPE} — ответить в чат нельзя. Получи токен заново с этим правом (см. «Где взять токен») и подключись ещё раз.`);
  }
  const res = await authedFetch(`${HELIX_URL}/chat/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ broadcaster_id: session.channelId, sender_id: session.botUserId, message: text }),
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* пустое тело */ }
  if (!res.ok) {
    throw new Error(`Twitch отклонил отправку (${res.status}${body && body.message ? `: ${body.message}` : ''}).`);
  }
  const result = body && body.data && body.data[0];
  if (result && result.is_sent === false) {
    const reason = result.drop_reason;
    throw new Error(`Twitch не отправил сообщение${reason && (reason.message || reason.code) ? `: ${reason.message || reason.code}` : ''}.`);
  }
}

/** Короткий ответ в чат от бота для других модулей (команды чат-аватаров). false — бот не подключён или Twitch не принял сообщение; сам по себе не бросает. */
async function say(text) {
  const msg = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!msg || !session || status !== 'connected') return false;
  try { await sendChatMessage(msg); return true; } catch (e) { console.warn('[Чат бот] Ответ не отправлен:', e.message); return false; }
}

/* ---------- Автомодерация ---------- */

/** Предупреждение для админки: почему автомодерация сейчас не может удалять сообщения ('' — всё в порядке или она выключена/бот не подключён). */
function autoModWarning() {
  if (!autoMod.isEnabled() || status !== 'connected' || !session) return '';
  if (!session.scopes.includes(AUTOMOD_SCOPE)) return autoModProblemText('scope');
  return autoModState.problem ? autoModState.problem.message : '';
}

function autoModProblemText(key, detail) {
  const d = detail ? ` (${detail})` : '';
  switch (key) {
    case 'scope':
      return `Автомодерация не может удалять сообщения: у токена бота нет права ${AUTOMOD_SCOPE}. Получи токен заново с этим правом (см. «Где взять токен») и подключи бота ещё раз.`;
    case 'not_moderator':
      return `Автомодерация не может удалять сообщения: аккаунт бота${session ? ` (${session.botLogin})` : ''} не модератор канала. Сделай его модератором (в чате канала: /mod ${session ? session.botLogin : 'имя_бота'}).`;
    case 'rate':
      return `Twitch временно ограничил удаление сообщений (слишком часто)${d}.`;
    default:
      return `Автомодерация не смогла удалить сообщение${d}.`;
  }
}

/** Запоминает проблему и пишет о ней в консоль ОДИН раз (пока проблема не сменится) — иначе на каждое подходящее сообщение шла бы новая строка. */
function noteAutoModProblem(key, detail) {
  const message = autoModProblemText(key, detail);
  autoModState.problem = { key, message };
  if (autoModState.loggedKey !== key) {
    autoModState.loggedKey = key;
    console.warn(`[Автомодерация] ${message}`);
  }
}

function clearAutoModProblem() {
  autoModState.problem = null;
  autoModState.loggedKey = null;
}

/** Подменяет текст сообщения в ленте «Последние сообщения чата» на вкладке бота: оскорбление, которое автомодерация удалила в Twitch, не должно светиться на странице админки. */
function maskRecentMessage(messageId, text) {
  const entry = recentMessages.find((m) => m.id === messageId);
  if (entry) { entry.text = text; entry.moderated = true; }
}

/** DELETE /helix/moderation/chat: удаляет сообщение от имени бота (moderator_id = владелец токена). Ошибка несёт status и detail от Twitch. */
async function deleteChatMessage(messageId) {
  const q = new URLSearchParams({ broadcaster_id: session.channelId, moderator_id: session.botUserId, message_id: messageId });
  const res = await authedFetch(`${HELIX_URL}/moderation/chat?${q.toString()}`, { method: 'DELETE', headers: {} });
  if (res.ok) return;
  let body = null;
  try { body = await res.json(); } catch (e) { /* пустое тело */ }
  const err = new Error(`Twitch отклонил удаление (${res.status}${body && body.message ? `: ${body.message}` : ''})`);
  err.status = res.status;
  err.detail = (body && body.message) || '';
  throw err;
}

/** Разбор отказа Twitch: 403 — бот не модератор, 401 — нет права/токен, 429 — слишком часто, 400/404 — сообщения уже нет или оно от модератора (не проблема). */
function classifyDeleteFailure(err) {
  if (err.status === 403) return 'not_moderator';
  if (err.status === 401) return 'scope';
  if (err.status === 429) return 'rate';
  if (err.status === 400 || err.status === 404) return 'ignorable';
  return 'other';
}

/**
 * Автомодерация одного сообщения. Возвращает true, если сообщение содержит слово из списка (тогда команды бота для него не выполняются),
 * false — если оно чистое, модерация выключена или это сообщение нельзя удалять (стример, модератор, сам бот).
 */
async function moderateMessage(event) {
  if (!session || !autoMod.isEnabled()) return false;
  const text = event.message && event.message.text;
  if (!text) return false;
  if (event.chatter_user_id === session.botUserId || event.chatter_user_id === session.channelId) return false;
  const badges = Array.isArray(event.badges) ? event.badges : [];
  if (badges.some((b) => AUTOMOD_EXEMPT_BADGES.includes(b.set_id))) return false;
  if (!autoMod.matches(text)) return false;

  const user = event.chatter_user_name || event.chatter_user_login || '';
  maskRecentMessage(event.message_id, '[удалено автомодерацией]'); // сразу, до запроса к Twitch — лента на странице не должна показать текст даже на долю секунды
  if (!session.scopes.includes(AUTOMOD_SCOPE)) { maskRecentMessage(event.message_id, '[запрещённое слово — удалить не удалось]'); noteAutoModProblem('scope'); return true; }
  try {
    await deleteChatMessage(event.message_id);
    autoModState.deleted += 1;
    autoModState.lastDeleteAt = Date.now();
    clearAutoModProblem();
    console.log(`[Автомодерация] Удалено: ${user}`);
  } catch (e) {
    const kind = classifyDeleteFailure(e);
    if (kind !== 'ignorable') {
      maskRecentMessage(event.message_id, '[запрещённое слово — удалить не удалось]');
      noteAutoModProblem(kind, e.detail || e.message);
    }
  }
  return true;
}

/**
 * Проверка сразу после подключения (чтобы предупреждение в админке появилось ДО первого оскорбления, а не после): пробуем удалить
 * несуществующее сообщение. 403 — бот не модератор, 401 — нет права; 400/404 («такого сообщения нет») — значит, права есть.
 * Предположение: Twitch сначала проверяет права модератора, а уже потом существование сообщения — на настоящем Twitch не проверялось;
 * если это не так, проверка просто ничего не покажет, а реальные ошибки всё равно будут пойманы при первом удалении.
 */
async function probeAutoMod() {
  if (!session || !autoMod.isEnabled() || !session.scopes.includes(AUTOMOD_SCOPE)) return;
  try {
    await deleteChatMessage(crypto.randomUUID());
    clearAutoModProblem();
  } catch (e) {
    const kind = classifyDeleteFailure(e);
    if (kind === 'not_moderator' || kind === 'scope') noteAutoModProblem(kind, e.detail || e.message);
    else if (kind === 'ignorable') clearAutoModProblem();
  }
}

/**
 * Реакция на сообщение зрителя: если первое слово — команда из списка, отвечаем; нет в списке — игнорируем.
 * Свои сообщения бота пропускаем (иначе ответ вида "!привет ..." мог бы запустить сам себя) и не отвечаем на одну и ту же
 * команду чаще, чем раз в COMMAND_COOLDOWN_MS.
 */
async function handleChatMessage(event) {
  // Сначала автомодерация: сообщение с запрещённым словом удаляем, а команды в нём не выполняем.
  let flagged = false;
  try { flagged = await moderateMessage(event); } catch (e) { console.warn('[Автомодерация] Ошибка:', e.message); }
  if (flagged) return;
  const text = ((event.message && event.message.text) || '').trim();
  if (!text.startsWith('!')) return;
  if (session && event.chatter_user_id === session.botUserId) return;
  const cmd = botCommands.findByToken(text.split(/\s+/)[0]);
  if (!cmd) return;
  const now = Date.now();
  if (now - (commandCooldowns.get(cmd.id) || 0) < COMMAND_COOLDOWN_MS) return;
  commandCooldowns.set(cmd.id, now);

  const user = event.chatter_user_name || event.chatter_user_login || '';
  const reply = botCommands.renderResponse(cmd.response, { user, channel: session.channelDisplay });
  try {
    await sendChatMessage(reply);
    lastCommand = { command: cmd.command, user, ok: true, at: Date.now() };
    console.log(`[Чат бот] ${cmd.command} от ${user} → ответ отправлен`);
  } catch (e) {
    lastCommand = { command: cmd.command, user, ok: false, error: e.message, at: Date.now() };
    console.warn(`[Чат бот] ${cmd.command}: ${e.message}`);
  }
}

/* ---------- Сообщения по таймеру ---------- */

function setLiveProvider(fn) {
  liveProvider = fn;
}

/** Приводит расписание в соответствие со списком сообщений: у новых/включённых — первая отправка через один интервал (а не сразу), у изменивших интервал — отсчёт заново, у удалённых/выключенных — забываем. */
function syncTimerState(now) {
  const active = new Set();
  botTimers.list().forEach((t) => {
    if (!t.enabled) return;
    active.add(t.id);
    const intervalMs = t.intervalMinutes * 60000;
    const st = timerState.get(t.id);
    if (!st || st.intervalMs !== intervalMs) {
      timerState.set(t.id, { nextAt: now + intervalMs, intervalMs, lastAt: st ? st.lastAt : null, lastError: st ? st.lastError : null });
    }
  });
  [...timerState.keys()].forEach((id) => { if (!active.has(id)) timerState.delete(id); });
}

/** Вызывать после любого изменения списка/настроек сообщений (server.js) — расписание и колонка «следующее» в админке обновляются сразу. */
function syncTimers() {
  syncTimerState(Date.now());
}

/**
 * Один проход расписания: отправляет «созревшие» сообщения. now и gapMs можно передать явно — так расписание проверяется тестами без ожидания минут.
 * Не отправляет, пока бот не подключён. При включённой настройке «только пока идёт стрим» и офлайн-стриме «созревшие» сообщения не отправляются,
 * а откладываются на следующий интервал (чтобы при выходе в эфир не хлынули все разом).
 */
async function tickTimers(now = Date.now(), gapMs = TIMER_SEND_GAP_MS) {
  if (status !== 'connected' || !session || timerTickBusy) return;
  timerTickBusy = true;
  try {
    syncTimerState(now);
    const due = botTimers.list().filter((t) => t.enabled && timerState.has(t.id) && timerState.get(t.id).nextAt <= now);
    if (!due.length) return;
    if (botTimers.getSettings().onlyWhenLive && !liveProvider()) {
      due.forEach((t) => { const st = timerState.get(t.id); st.nextAt = now + st.intervalMs; });
      return;
    }
    for (let i = 0; i < due.length; i++) {
      const t = due[i];
      const st = timerState.get(t.id);
      if (!st) continue; // удалили, пока шла отправка предыдущего
      st.nextAt = now + st.intervalMs; // следующий раз — через полный интервал, даже если эта отправка не удастся (без повторов подряд)
      const text = botTimers.renderMessage(t.text, { channel: session.channelDisplay });
      try {
        await sendChatMessage(text);
        st.lastAt = Date.now();
        st.lastError = null;
        lastTimerMessage = { id: t.id, text, ok: true, at: Date.now() };
        console.log('[Чат бот] Сообщение по таймеру отправлено.');
      } catch (e) {
        st.lastError = e.message;
        lastTimerMessage = { id: t.id, text, ok: false, error: e.message, at: Date.now() };
        console.warn(`[Чат бот] Сообщение по таймеру не отправлено: ${e.message}`);
      }
      if (gapMs > 0 && i < due.length - 1) await new Promise((r) => setTimeout(r, gapMs));
    }
  } finally {
    timerTickBusy = false;
  }
}

function startTimers() {
  if (timerTickHandle) return; // уже идёт (например, после короткого переподключения) — расписание не сбрасываем
  syncTimerState(Date.now());
  timerTickHandle = setInterval(() => {
    tickTimers().catch((e) => console.warn('[Чат бот] Ошибка расписания:', e.message));
  }, TIMER_TICK_MS);
  if (timerTickHandle.unref) timerTickHandle.unref();
}

function stopTimers() {
  clearInterval(timerTickHandle);
  timerTickHandle = null;
  timerState.clear(); // при новом подключении отсчёт начинается заново
}

/* ---------- Соединение ---------- */

function clearTimers() {
  clearTimeout(keepaliveTimer);
  clearTimeout(reconnectTimer);
  clearTimeout(refreshTimer);
  keepaliveTimer = null;
  reconnectTimer = null;
  refreshTimer = null;
  stopTimers();
}

function closeSocket() {
  if (socket) {
    const s = socket;
    socket = null;
    try { s.close(); } catch (e) { /* уже закрыт */ }
  }
}

function pushMessage(event) {
  recentMessages.push({
    id: event.message_id,
    user: event.chatter_user_name || event.chatter_user_login,
    color: event.color || '',
    text: (event.message && event.message.text) || '',
    at: Date.now(),
  });
  if (recentMessages.length > MAX_RECENT * 2) recentMessages.splice(0, recentMessages.length - MAX_RECENT);
}

/** Watchdog: Twitch шлёт session_keepalive; если тишина дольше таймаута (+запас) — соединение мёртвое, переоткрываем. */
function armKeepalive(gen, seconds) {
  clearTimeout(keepaliveTimer);
  keepaliveTimer = setTimeout(() => {
    if (gen !== generation || stopped) return;
    console.warn('[Чат бот] Нет keepalive от Twitch — переподключение…');
    if (socket) { try { socket.terminate(); } catch (e) { /* уже закрыт */ } }
  }, (seconds + 5) * 1000);
}

function openSocket(url, gen, isReconnect) {
  const s = new WebSocket(url);
  socket = s;
  let keepaliveSeconds = 10;

  s.on('message', async (raw) => {
    if (gen !== generation || stopped) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    armKeepalive(gen, keepaliveSeconds);
    const type = msg.metadata && msg.metadata.message_type;

    if (type === 'session_welcome') {
      keepaliveSeconds = msg.payload.session.keepalive_timeout_seconds || 10;
      armKeepalive(gen, keepaliveSeconds);
      if (isReconnect) return; // при session_reconnect Twitch переносит подписки сам — заново подписываться нельзя
      try {
        await subscribeToChat(msg.payload.session.id);
        if (gen !== generation || stopped) return;
        setStatus('connected', `Подключён как ${session.botLogin} к каналу ${data.channelName || session.channelId}. Читаю сообщения.`);
        console.log(`[Чат бот] Подключён: бот ${session.botLogin} → канал ${session.channelId}`);
        startTimers();
        probeAutoMod().catch(() => {});
      } catch (e) {
        if (gen !== generation) return;
        stopped = true;
        clearTimers();
        closeSocket();
        setStatus('error', e.message);
        console.warn('[Чат бот]', e.message);
      }
    } else if (type === 'session_reconnect') {
      const old = s;
      openSocket(msg.payload.session.reconnect_url, gen, true);
      setTimeout(() => { try { old.close(); } catch (e) { /* уже закрыт */ } }, 5000);
    } else if (type === 'notification') {
      if (msg.payload.subscription.type === 'channel.chat.message') {
        pushMessage(msg.payload.event);
        handleChatMessage(msg.payload.event).catch((e) => console.warn('[Чат бот] Ошибка обработки команды:', e.message));
      }
    } else if (type === 'revocation') {
      if (canRefresh() && Date.now() - lastRevocationRecoveryAt > 60000) {
        // Подписку могли снять из-за токена — при наличии Refresh Token пробуем один раз переподключиться сами (connect() обновит токен, если он истёк).
        lastRevocationRecoveryAt = Date.now();
        console.warn('[Чат бот] Twitch отозвал подписку — пробую переподключиться с обновлённым токеном…');
        connect();
        return;
      }
      stopped = true;
      clearTimers();
      closeSocket();
      setStatus('error', `Twitch отозвал подписку на чат (${msg.payload.subscription.status}) — токен мог быть отозван. Получи новый токен и подключись заново.`);
    }
  });

  s.on('close', () => {
    if (gen !== generation || stopped || socket !== s) return;
    setStatus('connecting', 'Соединение потеряно, переподключаюсь…');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (gen !== generation || stopped) return;
      openSocket(EVENTSUB_WS_URL, gen, false);
    }, 5000);
  });

  s.on('error', (err) => {
    console.warn('[Чат бот] Ошибка соединения:', err.message);
  });
}

/**
 * «Подключить»: проверяет токен и поля, открывает EventSub WebSocket.
 * Возвращает { ok, error? } — само подключение к чату подтверждается позже
 * (статус станет 'connected' после успешной подписки), см. getPublic().
 */
async function connect() {
  disconnect(true);
  if (!data.botToken && !data.refreshToken) return failConnect('Не указан Bot OAuth Token (или Refresh Token).');
  if (!data.channelName && !data.channelId) return failConnect('Укажи Channel Name или Channel ID канала, где работает бот.');

  setStatus('connecting', 'Проверяю токен…');
  const gen = ++generation;
  try {
    const info = await validateWithRefresh();
    if (gen !== generation) return { ok: false, error: 'Отменено.' };
    data.tokenExpiresAt = Number(info.expires_in) > 0 ? Date.now() + Number(info.expires_in) * 1000 : 0; // validate отдаёт остаток жизни токена в секундах
    persist();
    const scopes = info.scopes || [];
    if (!scopes.includes(REQUIRED_SCOPE)) {
      throw new Error(`У токена нет обязательного scope ${REQUIRED_SCOPE} (есть: ${scopes.join(', ') || 'ничего'}). Получи токен с scope user:read:chat user:write:chat user:bot.`);
    }
    if (data.botUsername && info.login.toLowerCase() !== data.botUsername.toLowerCase()) {
      throw new Error(`Токен выдан аккаунту «${info.login}», а в поле Bot Username указан «${data.botUsername}». Проверь, что токен получен под бот-аккаунтом.`);
    }

    let channelId = data.channelId;
    let channelDisplay = data.channelName; // подставляется вместо {channel} в ответах на команды
    if (data.channelName) {
      const user = await lookupUser({ login: data.channelName }, info.client_id, data.botToken);
      if (channelId && channelId !== user.id) {
        throw new Error(`Channel ID ${channelId} не совпадает с каналом «${data.channelName}» (его ID — ${user.id}). Исправь одно из полей или очисти Channel ID.`);
      }
      if (!channelId) { channelId = user.id; data.channelId = user.id; persist(); } // подставляем найденный ID
      channelDisplay = user.display_name || user.login || data.channelName;
    } else if (channelId) {
      const user = await lookupUser({ id: channelId }, info.client_id, data.botToken);
      channelDisplay = user.display_name || user.login || channelId;
    }
    if (gen !== generation) return { ok: false, error: 'Отменено.' };

    session = { clientId: info.client_id, botUserId: info.user_id, botLogin: info.login, scopes, channelId, channelDisplay };
    const missing = RECOMMENDED_SCOPES.filter((sc) => !scopes.includes(sc));
    stopped = false;
    scheduleRefresh();
    setStatus('connecting', missing.length
      ? `Токен принят, подключаюсь… (нет scope: ${missing.join(', ')} — для чтения не нужны, но понадобятся боту позже)`
      : 'Токен принят, подключаюсь к EventSub…');
    openSocket(EVENTSUB_WS_URL, gen, false);
    return { ok: true };
  } catch (e) {
    if (gen !== generation) return { ok: false, error: 'Отменено.' };
    return failConnect(e.message);
  }
}

function failConnect(message) {
  stopped = true;
  clearTimers();
  closeSocket();
  setStatus('error', message);
  return { ok: false, error: message };
}

/** «Отключить». silent=true — внутренний вызов перед новым connect(), без смены статуса на "не подключён". */
function disconnect(silent) {
  generation += 1;
  stopped = true;
  clearTimers();
  closeSocket();
  if (!silent) {
    session = null;
    setStatus('disconnected', 'Не подключён');
  }
}

module.exports = { say, init, getPublic, getStatus, setOnStatusChange, setAppCredentialsProvider, setLiveProvider, syncTimers, tickTimers, save, connect, disconnect, FILE_PATH };
