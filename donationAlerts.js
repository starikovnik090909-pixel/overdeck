// donationAlerts.js
// DonationAlerts: OAuth (Authorization Code, как у Twitch в twitch.js) +
// подключение к Centrifugo для получения донатов в реальном времени.
//
// ИСТОРИЯ ОТЛАДКИ ПРОТОКОЛА (важно для дальнейших правок):
//   1) Новый JSON API Centrifugo v3+ ({connect:{...}, id}) → код 3003
//      (DisconnectBadRequest) — сервер DonationAlerts работает на Centrifugo
//      v2.5.1, формат нового протокола не совпал.
//   2) Легаси-конверт {method, params, uid} вручную на голом ws → код 3007.
//   3) Формат {"params":{"token":...},"id":1} вручную на голом ws — снова
//      код 3003 — ручная реализация поверх голого WebSocket не воспроизводит
//      протокол 2.x один в один (тайминги/квитирование/фрейминг).
//   4) Перешли на настоящий клиент `centrifuge@2.6.0` (ближайшая к серверной
//      2.5.1) — САМО ПОДКЛЮЧЕНИЕ и рукопожатие наконец заработали (дошло до
//      subscribe, а не падало на connect) — но подписка на приватный канал
//      упала с "global.ActiveXObject is not a constructor": библиотека
//      чисто браузерная и её механизм авторизации приватных каналов
//      (subscribeEndpoint) сам делает AJAX-запрос через XMLHttpRequest,
//      которого в Node.js нет — а не то, что мы сами вручную вызывали не
//      тот метод (setOnPrivateChannel в этой версии не тот путь).
//   5) Подложили полифилл global.XMLHttpRequest через пакет `xmlhttprequest`
//      — не помогло, ошибка та же самая ("ActiveXObject is not a
//      constructor"): собранный (browserify) бандл centrifuge.js, похоже, не
//      видит присвоение через сторонний пакет так, как ожидалось (или сам
//      пакет экспортирует не то, что мы думали) — а без сети это никак не
//      продиагностировать со стороны.
//   6) ТЕКУЩАЯ ВЕРСИЯ — вместо стороннего пакета-полифилла пишем свой
//      минимальный XMLHttpRequest прямо здесь, на встроенном `https`, и
//      явно логируем каждый запрос/ответ. Это убирает зависимость от
//      непрозрачного стороннего пакета и заодно впервые покажет в консоли
//      реальный запрос, который библиотека шлёт на subscribeEndpoint —
//      после первого же реального лога можно будет свериться, что именно
//      ожидает DonationAlerts, и поправить прицельно, а не гадать.
//
// Написано без доступа в сеть для живой проверки (среда разработки без
// интернета) — если снова что-то упадёт, следующий кандидат для правки:
// формат тела/заголовков, который subscribeEndpoint библиотеки реально
// отправляет — теперь это будет видно прямо в логе полифилла ниже.

/** Минимальный XMLHttpRequest на встроенном https — только то, что нужно
    centrifuge.js для его внутреннего _ajax (open/setRequestHeader/send,
    readyState/status/responseText/onreadystatechange). Логирует запрос и
    ответ целиком — это и есть способ увидеть реальный контракт DA. */
class NodeXMLHttpRequest {
  constructor() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.onreadystatechange = null;
    this._method = 'GET';
    this._url = '';
    this._headers = {};
  }

  open(method, url) {
    this._method = method;
    this._url = url;
    this.readyState = 1;
    if (this.onreadystatechange) this.onreadystatechange();
  }

  setRequestHeader(name, value) {
    this._headers[name] = value;
  }

  send(body) {
    // eslint-disable-next-line global-require
    const https = require('https');
    // eslint-disable-next-line global-require
    const { URL } = require('url');
    let target;
    try {
      target = new URL(this._url);
    } catch (e) {
      console.warn('[DonationAlerts][XHR] Некорректный URL запроса:', this._url);
      this.status = 0;
      this.readyState = 4;
      if (this.onreadystatechange) this.onreadystatechange();
      return;
    }

    console.log(`[DonationAlerts][XHR] → ${this._method} ${this._url} | заголовки: ${JSON.stringify(this._headers)} | тело: ${body}`);

    const req = https.request({
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: this._method,
      headers: this._headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        this.status = res.statusCode;
        this.responseText = data;
        this.readyState = 4;
        console.log(`[DonationAlerts][XHR] ← ${this.status} ${data}`);
        if (this.onreadystatechange) this.onreadystatechange();
      });
    });

    req.on('error', (err) => {
      console.warn('[DonationAlerts][XHR] Ошибка запроса:', err.message);
      this.status = 0;
      this.readyState = 4;
      if (this.onreadystatechange) this.onreadystatechange();
    });

    if (body) req.write(body);
    req.end();
  }
}

global.XMLHttpRequest = NodeXMLHttpRequest;

const Centrifuge = require('centrifuge');

const AUTHORIZE_URL = 'https://www.donationalerts.com/oauth/authorize';
const TOKEN_URL = 'https://www.donationalerts.com/oauth/token';
const USER_URL = 'https://www.donationalerts.com/api/v1/user/oauth';
const SUBSCRIBE_TOKEN_URL = 'https://www.donationalerts.com/api/v1/centrifuge/subscribe';
const CENTRIFUGO_URL = 'wss://centrifugo.donationalerts.com/connection/websocket';

function buildAuthorizeUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'oauth-user-show oauth-donation-subscribe',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(clientId, clientSecret, redirectUri, code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error_description || 'Не удалось получить токен DonationAlerts');
  return data; // { access_token, refresh_token, expires_in, token_type }
}

/** Обновляет access_token по refresh_token — вызывать перед подключением, если срок действия истёк/истекает. */
async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error_description || 'Не удалось обновить токен DonationAlerts');
  return data; // { access_token, refresh_token, expires_in, token_type }
}

async function fetchUserInfo(accessToken) {
  const res = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || 'Не удалось получить данные пользователя DonationAlerts');
  return data.data; // { id, code, name, avatar, socket_connection_token, ... }
}

let centrifuge = null;
let stopped = true; // true = отключено осознанно (disconnect()) — не переподключаемся
let currentParams = null; // {socketConnectionToken, accessToken, userId, onDonation, onAuthError}
let consecutiveFailures = 0; // подряд неудачных попыток без единой успешной подписки
let hasSubscribedOnce = false;

const MAX_CONSECUTIVE_FAILURES = 5; // после стольких подряд неудач — просим войти заново, не долбимся вечно

function disconnect() {
  stopped = true;
  currentParams = null;
  consecutiveFailures = 0;
  hasSubscribedOnce = false;
  if (centrifuge) {
    try { centrifuge.disconnect(); } catch (e) { /* уже отключено */ }
    centrifuge = null;
  }
}

function isConnected() {
  return !!centrifuge;
}

/** Приводит сырые данные пуша Centrifuge к общему формату донатов проекта. */
function mapDonation(raw) {
  return {
    platform: 'donationalerts',
    username: raw.username || (raw.user && raw.user.name) || 'Аноним',
    amount: Number(raw.amount) || 0,
    currency: raw.currency || (raw.amount_data && raw.amount_data.currency) || 'RUB',
    message: raw.message || '',
  };
}

function failAuth(onAuthError, message) {
  console.warn('[DonationAlerts]', message);
  stopped = true; // явная ошибка авторизации — сами больше не переподключаемся
  disconnect();
  if (typeof onAuthError === 'function') onAuthError(message);
}

/**
 * Подключается через библиотеку centrifuge@2.6.0 и подписывается на канал
 * донатов. Авторизацию приватного канала (получение subscription_token)
 * делает САМА библиотека штатным механизмом subscribeEndpoint — она сама
 * дергает POST на реальный API DonationAlerts с нужными заголовками, нам
 * не нужно вручную ходить за токеном (см. историю отладки в шапке файла).
 * Переподключение при обрыве полностью отдано библиотеке — своя логика
 * следит только за тем, не подряд ли идут неудачи ещё до первой успешной
 * подписки (например, невалидный токен), и тогда останавливает всё сама.
 */
function openSocket() {
  if (stopped || !currentParams) return;
  if (centrifuge) {
    try { centrifuge.disconnect(); } catch (e) { /* уже отключено */ }
    centrifuge = null;
  }

  const { socketConnectionToken, accessToken, userId, onDonation, onAuthError } = currentParams;
  const channel = `$alerts:donation_${userId}`;

  centrifuge = new Centrifuge(CENTRIFUGO_URL, {
    subscribeEndpoint: SUBSCRIBE_TOKEN_URL,
    subscribeHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  centrifuge.setToken(socketConnectionToken);

  ['setToken', 'subscribe', 'connect', 'disconnect', 'on'].forEach((method) => {
    if (typeof centrifuge[method] !== 'function') {
      console.warn(`[DonationAlerts] У установленной версии пакета centrifuge нет метода "${method}" — проверь node_modules/centrifuge на реальный API.`);
    }
  });

  centrifuge.on('connect', (ctx) => {
    console.log('[DonationAlerts] Подключено к Centrifugo, client_id:', ctx && ctx.client);
    const sub = centrifuge.subscribe(channel, (message) => {
      try {
        onDonation(mapDonation(message.data !== undefined ? message.data : message));
      } catch (e) {
        console.warn('[DonationAlerts] Ошибка обработки доната:', e.message);
      }
    });

    if (sub && typeof sub.on === 'function') {
      sub.on('subscribe', () => {
        console.log('[DonationAlerts] Подписаны на канал донатов, слушаем.');
        hasSubscribedOnce = true;
        consecutiveFailures = 0;
      });
      sub.on('error', (err) => {
        console.warn('[DonationAlerts] Ошибка подписки на канал донатов:', JSON.stringify(err));
      });
    }
  });

  centrifuge.on('disconnect', (ctx) => {
    console.warn('[DonationAlerts] Отключено от Centrifugo:', JSON.stringify(ctx));
    if (stopped) return;

    if (!hasSubscribedOnce) {
      consecutiveFailures += 1;
      console.warn(`[DonationAlerts] Не успели подписаться на донаты, попытка ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}.`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        failAuth(onAuthError, 'Не получается подключиться к DonationAlerts несколько раз подряд — попробуй войти заново.');
      }
    } else {
      hasSubscribedOnce = false; // штатный разрыв после успешной подписки — библиотека сама переподключится
    }
  });

  centrifuge.on('error', (ctx) => {
    console.warn('[DonationAlerts] Ошибка Centrifuge:', JSON.stringify(ctx));
  });

  centrifuge.connect();
}

/**
 * Подключается к Centrifugo и подписывается на канал донатов пользователя.
 * socketConnectionToken — socket_connection_token из GET /api/v1/user/oauth
 * (см. fetchUserInfo выше). accessToken — OAuth access_token, идёт заголовком
 * Authorization в запрос subscribeEndpoint — это НЕ Client ID/Secret приложения.
 *
 * onAuthError(message) — необязательный колбэк, вызывается, когда автосвязь
 * останавливается сама (невалидный токен / много неудач подряд), чтобы
 * вызывающий код (server.js) мог сбросить статус "подключено" в админке.
 */
function connectSocket(socketConnectionToken, accessToken, userId, onDonation, onAuthError) {
  stopped = false;
  consecutiveFailures = 0;
  hasSubscribedOnce = false;
  currentParams = { socketConnectionToken, accessToken, userId, onDonation, onAuthError };
  openSocket();
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchUserInfo,
  connectSocket,
  disconnect,
  isConnected,
};
