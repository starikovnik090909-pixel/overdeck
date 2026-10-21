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

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

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
    const data = await res.json();
    if (!res.ok) {
      console.warn(`[EventSub] Не удалось подписаться на ${subType.type}: ${data.message || res.status} (нужен scope? см. README)`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[EventSub] Ошибка подписки на ${subType.type}:`, e.message);
    return false;
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

function openSocket(config, broadcasterId, token, url, onEvent, onRaw) {
  if (stopped) return;

  const socket = new WebSocket(url);
  ws = socket;

  socket.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    const messageType = msg.metadata && msg.metadata.message_type;

    if (messageType === 'session_welcome') {
      const sessionId = msg.payload.session.id;
      console.log('[EventSub] Подключено, подписываемся на события (баллы/сабы/рейды/фоллоу/Hype Train)…');
      for (const subType of SUB_TYPES) {
        // eslint-disable-next-line no-await-in-loop
        await createSubscription(config, subType, sessionId, broadcasterId, token);
      }
    } else if (messageType === 'session_reconnect') {
      const reconnectUrl = msg.payload.session.reconnect_url;
      const oldSocket = socket;
      openSocket(config, broadcasterId, token, reconnectUrl, onEvent, onRaw);
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
      console.warn('[EventSub] Соединение закрыто, переподключение через 5с…');
      setTimeout(() => openSocket(config, broadcasterId, token, EVENTSUB_WS_URL, onEvent, onRaw), 5000);
    }
  });

  socket.on('error', (err) => {
    console.warn('[EventSub] Ошибка соединения:', err.message);
  });
}

/** Запускает EventSub, если есть OAuth-вход и известен broadcasterId. Безопасно вызывать повторно. */
function connect(config, broadcasterId, onEvent, onRaw) {
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
  openSocket(config, broadcasterId, token, EVENTSUB_WS_URL, onEvent, onRaw);
}

function stop() {
  stopped = true;
  if (ws) {
    try { ws.close(); } catch (e) { /* уже закрыт */ }
    ws = null;
  }
}

module.exports = { connect, stop };
