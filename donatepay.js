// donatepay.js
// Интеграция с DonatePay (donatepay.ru) через API-ключ — без OAuth.
// Ключ стример берёт на странице https://donatepay.ru/page/api («Ваш API ключ»).
//
// Как получаем донаты: раз в ~21 секунду спрашиваем у DonatePay список новых
// транзакций (GET /api/v1/transactions?after=<последний id>). У DonatePay лимит
// «один запрос одного метода раз в 20 секунд», поэтому чаще нельзя — задержка
// алерта до ~20 секунд. (Мгновенная доставка через Centrifugo в их документации
// есть, но формат сообщений не описан — это возможное улучшение на будущее.)
// При подключении история НЕ озвучивается: запоминаем id самой свежей
// транзакции и дальше берём только то, что новее (после простоя тоже).
//
// Формат транзакции (из документации): id, what (ник), sum (в рублях), comment,
// status (success | wait | cancel | user = тестовый донат из кабинета), type, vars.

const notifyUi = require('./notify');
const BASE = process.env.DONATEPAY_API_BASE || 'https://donatepay.ru/api/v1';
const POLL_MS = Number(process.env.DONATEPAY_POLL_MS) || 21000;
const BACKOFF_MS = 45000;      // после 429 («слишком много запросов»)
const WAIT_HOLD_MS = 60 * 60 * 1000; // транзакция «в ожидании» держит курсор не дольше часа
const MAX_FAILS_TO_WARN = 3;

let apiKey = null;
let onDonation = null;
let onAuthError = null;
let timer = null;
let running = false;
let busy = false;
let lastId = 0;
let userName = '';
let userId = null;
let fails = 0;
let waitSince = 0;
let lastError = '';
let lastPollAt = 0;

/** Ошибка с признаком «ключ не подходит» — переподключаться бессмысленно. */
class DpError extends Error {
  constructor(message, fatal) { super(message); this.fatal = !!fatal; }
}

async function api(method, params) {
  const qs = new URLSearchParams({ access_token: apiKey, ...(params || {}) });
  let res, txt = '';
  try {
    res = await fetch(`${BASE}/${method}?${qs.toString()}`, { headers: { Accept: 'application/json', 'User-Agent': 'Overdeck/1.0' }, signal: AbortSignal.timeout(15000) });
    txt = await res.text();
  } catch (e) {
    throw new DpError('Нет связи с DonatePay: ' + e.message, false);
  }
  let json = null;
  try { json = JSON.parse(txt); } catch (e) { /* ниже */ }
  const retry = Number(res.headers.get('retry-after')) || 0;
  const code = Number((json && json.status) || res.status) || res.status;
  // Лимит «1 запрос метода в 20 секунд» сайт иногда отдаёт HTML-страницей с кодом 200: это не ошибка ключа.
  if (res.status === 429 || code === 429 || (!json && (retry || /<html/i.test(txt)))) {
    throw Object.assign(new DpError('Слишком много запросов к DonatePay, подожди немного', false), { rate: true, retry });
  }
  if (res.status === 401 || res.status === 403 || code === 401 || code === 403 || /incorrect token|invalid token|неверн\w* (токен|ключ)/i.test((json && json.message) || '')) {
    throw new DpError('DonatePay не принял API-ключ: проверь, что он скопирован целиком (страница donatepay.ru/page/api, поле «Ваш API ключ»).', true);
  }
  if (!res.ok || !json || (typeof json.status === 'string' && json.status !== 'success')) {
    const msg = (json && json.message) ? String(json.message) : `ответ ${res.status}`;
    throw new DpError('DonatePay: ' + msg, false);
  }
  return json.data;
}

function list(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

/** Приводит транзакцию DonatePay к общему формату донатов проекта. */
function mapDonation(tx) {
  const vars = (tx && typeof tx.vars === 'object' && tx.vars) || {};
  const cur = typeof vars.currency === 'string' && /^[A-Za-z]{3}$/.test(vars.currency) ? vars.currency.toUpperCase() : 'RUB';
  return {
    platform: 'donatepay',
    username: String(tx.what || vars.name || 'Аноним').slice(0, 60),
    amount: Number(tx.sum) || 0,
    currency: cur,
    message: String(tx.comment || vars.comment || ''),
  };
}

/** Один проход: берёт транзакции новее lastId и отдаёт новые донаты. */
async function poll() {
  const rows = list(await api('transactions', { type: 'donation', order: 'ASC', limit: 100, after: lastId }))
    .filter((t) => t && Number(t.id) > lastId)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const out = [];
  for (const tx of rows) {
    const id = Number(tx.id);
    if (tx.status === 'wait') {                 // оплата ещё идёт — курсор не двигаем, подождём
      if (!waitSince) waitSince = Date.now();
      if (Date.now() - waitSince < WAIT_HOLD_MS) break;
      lastId = id; waitSince = 0; continue;      // висит больше часа — пропускаем
    }
    waitSince = 0;
    lastId = id;
    if (tx.status === 'cancel') continue;
    if (!(Number(tx.sum) > 0)) continue;
    out.push(mapDonation(tx));
  }
  lastPollAt = Date.now();
  return out;
}

function schedule(ms) {
  if (!running) return;
  clearTimeout(timer);
  timer = setTimeout(tick, ms);
}

async function tick() {
  if (!running || busy) return;
  busy = true;
  let next = POLL_MS;
  try {
    const found = await poll();
    fails = 0; lastError = '';
    for (const d of found) {
      try { onDonation(d); } catch (e) { console.warn('[DonatePay] Ошибка обработки доната:', e.message); }
    }
  } catch (e) {
    lastError = e.message;
    if (e.fatal) {
      console.warn('[DonatePay]', e.message);
      stop();
      if (onAuthError) { try { onAuthError(e.message); } catch (e2) { /* ок */ } }
      busy = false;
      return;
    }
    if (e.rate) next = BACKOFF_MS;
    else if (++fails === MAX_FAILS_TO_WARN) { notifyUi.emit('dp.fail', {}); console.warn('[DonatePay] Не получается обновить донаты несколько раз подряд:', e.message); }
  }
  busy = false;
  schedule(next);
}

function stop() {
  running = false;
  clearTimeout(timer);
  timer = null;
}

function disconnect() {
  stop();
  apiKey = null; onDonation = null; onAuthError = null;
  lastId = 0; userName = ''; userId = null; fails = 0; waitSince = 0; lastError = '';
}

function isConnected() { return running; }
function info() { return { connected: running, userName, userId, lastError, lastPollAt }; }

/**
 * Проверяет ключ (GET /user), запоминает id самой свежей транзакции (старые донаты не озвучиваем)
 * и запускает опрос. onDonation(donation) — на каждый новый донат; onAuthError(msg) — если ключ
 * перестал подходить. Бросает ошибку с понятным текстом, если ключ не принят.
 */
async function connect(key, donationCb, authErrorCb) {
  const k = String(key || '').trim().replace(/^access_token=/i, '').replace(/^bearer\s+/i, '').replace(/\s+/g, '');
  if (!k) throw new Error('Не указан API-ключ DonatePay');
  disconnect();
  apiKey = k; onDonation = donationCb; onAuthError = authErrorCb || null;
  const withRetry = async (fn) => { try { return await fn(); } catch (e) { if (!e.rate) throw e; await new Promise((ok) => setTimeout(ok, Math.min(Math.max(e.retry || 0, 5), 25) * 1000)); return fn(); } };
  try {
    const user = await withRetry(() => api('user'));
    userName = String((user && user.name) || '');
    userId = user && user.id != null ? user.id : null;
    const newest = list(await withRetry(() => api('transactions', { type: 'donation', order: 'DESC', limit: 1 })));
    lastId = newest.length ? Number(newest[0].id) || 0 : 0;
  } catch (e) {
    disconnect();
    throw new Error(e.message);
  }
  running = true;
  console.log(`[DonatePay] Подключено${userName ? ' (' + userName + ')' : ''}, слушаем донаты.`);
  schedule(POLL_MS);
  return { userName, userId };
}

module.exports = { connect, disconnect, isConnected, info, mapDonation, _poll: poll, _tick: tick };
