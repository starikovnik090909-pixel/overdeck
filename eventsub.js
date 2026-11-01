// eventsub.js
// Twitch EventSub через WebSocket — траты баллов канала, подписки, гифт-сабы,
// рейды. Работает поверх уже пройденного OAuth-входа ("Войти через Twitch" на
// вкладке "Авторизация Twitch") — нужен его access token с расширенными
// scope (channel:read:redemptions, channel:read:subscriptions). Если вход не
// пройден или токен без нужных scope — модуль просто не подписывается и
// логирует предупреждение один раз; остальной проект работает как обычно.
//
// Смена категории НЕ идёт через EventSub здесь — она уже определяется
// существующим опросом Helix (categories.js) и подмешивается в вес линии
// таймлайна отдельно, в server.js.

const WebSocket = require('ws');

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';

const SUB_TYPES = [
  { type: 'channel.channel_points_custom_reward_redemption.add', version: '1' },
  { type: 'channel.subscribe', version: '1' },
  { type: 'channel.subscription.gift', version: '1' },
  { type: 'channel.raid', version: '1' },
  // Для алертов: продление подписки (с сообщением), фоллоу (нужен scope moderator:read:followers), Hype Train (scope channel:read:hype_train).
  // Нет права — только предупреждение в консоли, остальное работает; после добавления прав нужно заново войти через Twitch.
  { type: 'channel.subscription.message', version: '1' },
  { type: 'channel.follow', version: '2' },
  { type: 'channel.hype_train.begin', version: '2' },
  { type: 'channel.hype_train.progress', version: '2' },
  { type: 'channel.hype_train.end', version: '2' },
  // Ставка закончилась: Twitch отдаёт топ-10 предсказателей каждого исхода (всех участников — нет) — им начисляется опыт чат-аватаров за участие. Нужен scope
  // channel:read:predictions (или channel:manage:predictions). Нет scope — только предупреждение в консоли, остальное работает.
  { type: 'channel.prediction.end', version: '1' },
];

let ws = null;
let stopped = true;
let warnedNoAuth = false;
let getToken = null;      // (force) => Promise<string|null> — свежий токен стримера (server.js обновляет его сам)
let retryAttempt = 0;     // подряд неудачных сессий — пауза растёт, чтобы не долбить Twitch
let retryTimer = null;
let watchdog = null;
let authWarnedAt = 0;
const seenMessages = new Set();   // id уже обработанных уведомлений

async function createSubscription(config, subType, sessionId, broadcasterId, token) {
  const condition = subType.type === 'channel.raid'
    ? { to_broadcaster_user_id: broadcasterId }
    : subType.type === 'channel.follow'
      ? { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId }
      : { broadcaster_user_id: broadcasterId };

  try {
    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Client-ID': config.twitch.clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: subType.type,
        version: subType.version,
        condition,
        transport: { method: 'websocket', session_id: sessionId },
      }),
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* пустое тело */ }
    if (!res.ok) {
      if (res.status !== 401) console.warn(`[EventSub] Не удалось подписаться на ${subType.type}: ${data.message || res.status} (нужен scope? см. README)`);
      return res.status;
    }
    return 200;
  } catch (e) {
    console.warn(`[EventSub] Ошибка подписки на ${subType.type}:`, e.message);
    return 0;
  }
}

/** Превращает уведомление EventSub в событие для взвешенной линии таймлайна, либо null (игнор). */
function mapEvent(subscriptionType, payload) {
  switch (subscriptionType) {
    case 'channel.channel_points_custom_reward_redemption.add':
      return { type: 'channelpoints', id: payload.id, username: payload.user_name, login: String(payload.user_login || '').toLowerCase(), meta: { reward: payload.reward && payload.reward.title } };
    case 'channel.subscribe':
      if (payload.is_gift) return null; // придёт отдельно как channel.subscription.gift
      return { type: 'sub', username: payload.user_name, meta: { tier: payload.tier } };
    case 'channel.subscription.gift':
      return { type: 'giftsub', username: payload.user_name, meta: { total: payload.total, tier: payload.tier } };
    case 'channel.raid':
      return { type: 'raid', username: payload.from_broadcaster_user_name, meta: { viewers: payload.viewers } };
    case 'channel.prediction.end': {
      // участники ставки (топ-предсказатели обоих исходов, без повторов); отменённая ставка (status: canceled) участием не считается
      if (payload.status === 'canceled') return null;
      const seen = new Set(), users = [];
      (Array.isArray(payload.outcomes) ? payload.outcomes : []).forEach((o) => (Array.isArray(o && o.top_predictors) ? o.top_predictors : []).forEach((u) => {
        const login = String((u && u.user_login) || '').toLowerCase();
        if (login && !seen.has(login)) { seen.add(login); users.push({ login, name: u.user_name || login }); }
      }));
      return users.length ? { type: 'participation', kind: 'prediction', users } : null;
    }
    default:
      return null;
  }
}

function armWatchdog(socket, seconds) {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (stopped || ws !== socket) return;
    console.warn('[EventSub] Twitch молчит дольше положенного — переподключение…');
    try { socket.terminate(); } catch (e) { /* уже закрыт */ }
  }, seconds * 1000);
}

/** Следующая попытка — с паузой 5 → 10 → 20 → 40 с … до 10 минут (когда токен не принимается, Twitch иначе закрывал сокет каждые 10 с, и мы переподключались бесконечно). */
function scheduleRetry(config, broadcasterId, onEvent, onRaw, longDelay) {
  if (stopped) return;
  clearTimeout(retryTimer);
  const delay = longDelay ? 10 * 60 * 1000 : Math.min(10 * 60 * 1000, 5000 * Math.pow(2, Math.min(retryAttempt, 7)));
  retryAttempt += 1;
  console.warn(`[EventSub] Переподключение через ${Math.round(delay / 1000)} с…`);
  retryTimer = setTimeout(() => openSocket(config, broadcasterId, EVENTSUB_WS_URL, onEvent, onRaw), delay);
}

async function currentToken(config, force) {
  if (getToken) { try { const t = await getToken(force); if (t) return t; } catch (e) { /* ниже — запасной вариант */ } }
  return config.twitchAuth && config.twitchAuth.accessToken;
}

function openSocket(config, broadcasterId, url, onEvent, onRaw, isReconnect) {
  if (stopped) return;

  const socket = new WebSocket(url);
  ws = socket;
  let authFailed = false;
  armWatchdog(socket, 25);

  socket.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (ws !== socket) return;
    const messageType = msg.metadata && msg.metadata.message_type;
    armWatchdog(socket, 40);

    if (messageType === 'session_welcome') {
      if (isReconnect) return; // при session_reconnect подписки переносятся сами
      const sessionId = msg.payload.session.id;
      console.log('[EventSub] Подключено, подписываемся на события (баллы/сабы/рейды/фоллоу/Hype Train)…');
      let token = await currentToken(config, false);
      let ok = 0, unauthorized = 0;
      for (const subType of SUB_TYPES) {
        if (ws !== socket || stopped) return;
        // eslint-disable-next-line no-await-in-loop
        let st = await createSubscription(config, subType, sessionId, broadcasterId, token);
        if (st === 401 && !unauthorized) { // токен устарел — один раз берём свежий и повторяем
          // eslint-disable-next-line no-await-in-loop
          token = await currentToken(config, true);
          // eslint-disable-next-line no-await-in-loop
          st = await createSubscription(config, subType, sessionId, broadcasterId, token);
        }
        if (st === 200) ok++; else if (st === 401) unauthorized++;
      }
      if (ok) { retryAttempt = 0; return; }
      if (unauthorized) {
        authFailed = true;
        if (Date.now() - authWarnedAt > 30 * 60 * 1000) { authWarnedAt = Date.now(); console.warn('[EventSub] Twitch не принимает токен входа (Invalid OAuth token) — баллы, сабы, рейды и фоллоу не придут. Войди через Twitch ещё раз на вкладке «Авторизация». Повторю попытку через 10 минут.'); }
      }
    } else if (messageType === 'session_reconnect') {
      const reconnectUrl = msg.payload.session.reconnect_url;
      const oldSocket = socket;
      openSocket(config, broadcasterId, reconnectUrl, onEvent, onRaw, true);
      setTimeout(() => { try { oldSocket.close(); } catch (e) { /* уже закрыт */ } }, 5000);
    } else if (messageType === 'notification') {
      const mid = msg.metadata && msg.metadata.message_id;   // при переподключении Twitch может прислать одно уведомление дважды
      if (mid) { if (seenMessages.has(mid)) return; seenMessages.add(mid); if (seenMessages.size > 300) seenMessages.delete(seenMessages.values().next().value); }
      const subType = msg.payload.subscription.type;
      if (onRaw) { try { onRaw(subType, msg.payload.event); } catch (e) { console.warn('[EventSub] Ошибка обработчика алерта:', e.message); } }
      const event = mapEvent(subType, msg.payload.event);
      if (event && onEvent) onEvent(event);
    } else if (messageType === 'revocation') {
      console.warn('[EventSub] Подписка отозвана Twitch:', msg.payload.subscription.type, '—', msg.payload.subscription.status);
    }
    // session_keepalive — ничего делать не нужно, просто держит соединение живым
  });

  socket.on('close', () => {
    if (!stopped && ws === socket) {
      clearTimeout(watchdog);
      console.warn('[EventSub] Соединение закрыто.');
      scheduleRetry(config, broadcasterId, onEvent, onRaw, authFailed);
    }
  });

  socket.on('error', (err) => {
    console.warn('[EventSub] Ошибка соединения:', err.message);
  });
}

/** Запускает EventSub, если есть OAuth-вход и известен broadcasterId. Безопасно вызывать повторно. */
function connect(config, broadcasterId, onEvent, onRaw, tokenProvider) {
  if (tokenProvider) getToken = tokenProvider;
  const token = config.twitchAuth && config.twitchAuth.accessToken;
  if (!token || !broadcasterId) {
    if (!warnedNoAuth) {
      console.log('[EventSub] Нет активного входа через Twitch ("Войти через Twitch" на вкладке авторизации) — траты баллов/подписки/рейды на таймлайне отображаться не будут. Остальное работает как обычно.');
      warnedNoAuth = true;
    }
    return;
  }
  if (!stopped && ws) return; // уже подключены/подключаемся

  stopped = false;
  retryAttempt = 0;
  openSocket(config, broadcasterId, EVENTSUB_WS_URL, onEvent, onRaw);
}

function stop() {
  stopped = true;
  clearTimeout(retryTimer); clearTimeout(watchdog);
  if (ws) {
    try { ws.close(); } catch (e) { /* уже закрыт */ }
    ws = null;
  }
}

module.exports = { connect, stop };
