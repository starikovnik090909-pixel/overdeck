// musicReward.js — награда за баллы канала для заказа музыки: включается и выключается вместе с заказом.
// Twitch разрешает приложению менять только те награды, которые создало оно само (тот же Client ID),
// поэтому награду лучше создать кнопкой в настройках. Чужую (созданную вручную) можно только найти и подсказать, что делать.
// Нужен scope channel:manage:redemptions — после обновления нужно один раз заново войти через Twitch.
'use strict';

const HELIX = process.env.TWITCH_HELIX_URL || 'https://api.twitch.tv/helix';

let getToken = async () => null;
let getBroadcasterId = () => null;
let getClientId = () => '';
let status = { state: 'idle', text: '' };   // idle | wait | ok | missing | foreign | scope | error
let busy = null;
let applied = null;                          // { id, enabled }
let lastCfg = null;

function init(o) {
  if (o.getToken) getToken = o.getToken;
  if (o.getBroadcasterId) getBroadcasterId = o.getBroadcasterId;
  if (o.getClientId) getClientId = o.getClientId;
}
function setStatus(state, text) { status = { state, text: text || '' }; }
function getStatus() { return Object.assign({}, status); }

async function call(method, path, body) {
  const token = await getToken(false);
  const bid = getBroadcasterId();
  if (!token || !bid) { const e = new Error('wait'); e.code = 'wait'; throw e; }
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(HELIX + path + sep + 'broadcaster_id=' + encodeURIComponent(bid), {
    method, headers: { 'Client-ID': getClientId(), Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  let j = null; try { j = await res.json(); } catch (e) { /* пустой ответ */ }
  if (!res.ok) { const e = new Error((j && (j.message || j.error)) || 'HTTP ' + res.status); e.status = res.status; throw e; }
  return j;
}
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
function explain(e) {
  if (e.code === 'wait') return ['wait', 'Ждём вход через Twitch.'];
  if (e.status === 401 || e.status === 403) return ['scope', 'Нет права управлять наградами. Один раз заново войди через Twitch (вкладка «Авторизация Twitch»), права добавятся сами.'];
  return ['error', 'Twitch не ответил: ' + (e.message || e)];
}

/** Привести награду в соответствие с настройками: включена только когда заказ включён и «За баллы канала» тоже. */
async function sync(cfg) {
  lastCfg = cfg || lastCfg;
  const c = lastCfg;
  if (!c || !c.pointsReward) { setStatus('idle', ''); return getStatus(); }
  if (busy) { await busy.catch(() => {}); }
  busy = (async () => {
    const want = !!(c.enabled && c.pointsOn);
    try {
      const mine = ((await call('GET', '/channel_points/custom_rewards?only_manageable_rewards=true')) || {}).data || [];
      const r = mine.find((x) => same(x.title, c.pointsReward));
      if (!r) {
        const all = ((await call('GET', '/channel_points/custom_rewards')) || {}).data || [];
        if (all.some((x) => same(x.title, c.pointsReward))) setStatus('foreign', 'Награда создана вручную, Twitch не даёт программе её выключать. Удали её в Twitch и нажми «Создать награду здесь».');
        else setStatus('missing', 'Награды с таким названием на канале нет. Нажми «Создать награду здесь».');
        return;
      }
      if (r.is_enabled !== want) await call('PATCH', '/channel_points/custom_rewards?id=' + r.id, { is_enabled: want });
      applied = { id: r.id, enabled: want };
      setStatus('ok', want ? 'Награда включена и доступна зрителям.' : 'Награда выключена: зрители её не видят, пока заказ отключён.');
    } catch (e) { const [st, tx] = explain(e); setStatus(st, tx); }
  })();
  try { await busy; } finally { busy = null; }
  return getStatus();
}

/** Создать награду от имени приложения (с полем ввода текста). */
async function create(cfg, cost) {
  const title = String((cfg && cfg.pointsReward) || '').trim() || 'Заказать песню';
  try {
    await call('POST', '/channel_points/custom_rewards', { title, cost: Math.max(1, Math.min(10000000, Math.round(Number(cost) || 500))), prompt: 'Напиши название песни или вставь ссылку на YouTube', is_user_input_required: true, is_enabled: !!(cfg && cfg.enabled && cfg.pointsOn) });
    await sync(cfg);
    return { ok: true, title, status: getStatus() };
  } catch (e) {
    if (e.status === 400 && /duplicate|уже|unique/i.test(e.message)) { setStatus('foreign', 'Награда с таким названием уже есть. Удали её в Twitch или выбери другое название.'); return { ok: false, error: status.text, status: getStatus() }; }
    const [st, tx] = explain(e); setStatus(st, tx); return { ok: false, error: tx, status: getStatus() };
  }
}

/** Вернуть баллы за заказ, который принять нельзя (только для наград приложения). Не получилось — тихо ничего. */
async function refund(rewardId, redemptionId) {
  if (!rewardId || !redemptionId) return false;
  try { await call('PATCH', '/channel_points/custom_rewards/redemptions?id=' + encodeURIComponent(redemptionId) + '&reward_id=' + encodeURIComponent(rewardId), { status: 'CANCELED' }); return true; } catch (e) { return false; }
}

module.exports = { init, sync, create, refund, getStatus, call, explain };
