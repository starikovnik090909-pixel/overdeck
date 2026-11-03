// soundpadReward.js — награды за баллы канала для звуков саундпада. Награды создаёт и меняет само приложение
// (Twitch разрешает менять только свои). Нужен scope channel:manage:redemptions (один раз войти через Twitch заново).
'use strict';
const mr = require('./musicReward');

let status = { state: 'idle', text: '' };
let busy = null;
let lastArgs = null;
const setStatus = (state, text) => { status = { state, text: text || '' }; };
const getStatus = () => Object.assign({}, status);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** sp — модуль soundpad. Приводит награды в соответствие со звуками: нужные создаёт/правит, лишние выключает. */
async function sync(sp) {
  lastArgs = sp || lastArgs;
  const S = lastArgs; if (!S) return getStatus();
  if (busy) await busy.catch(() => {});
  busy = (async () => {
    const cfg = S.getSettings(), list = S.listSounds();
    if (!list.some((s) => s.reward.on || s.reward.id)) { setStatus('idle', ''); return; }
    const all = cfg.enabled && cfg.rewardsOn;
    try {
      const mine = ((await mr.call('GET', '/channel_points/custom_rewards?only_manageable_rewards=true')) || {}).data || [];
      let made = 0, upd = 0, off = 0, foreign = 0;
      for (const s of list) {
        const r = s.reward; let ex = mine.find((x) => (r.id && x.id === r.id)) || mine.find((x) => same(x.title, S.rewardTitle(s)));
        const want = !!(all && r.on);
        const cost = S.rewardCost(s), cd = S.rewardCooldown(s);
        if (!r.on) { if (ex && ex.is_enabled) { await mr.call('PATCH', '/channel_points/custom_rewards?id=' + ex.id, { is_enabled: false }); off++; } continue; }
        const title = S.rewardTitle(s);
        const body = { title, cost, is_enabled: want, is_global_cooldown_enabled: cd > 0, global_cooldown_seconds: Math.max(1, cd || 1), prompt: 'Звук «' + s.name + '» прозвучит на стриме' };
        if (!ex) {
          try { const j = await mr.call('POST', '/channel_points/custom_rewards', body); ex = j && j.data && j.data[0]; if (ex) { S.setRewardId(s.id, ex.id); made++; } }
          catch (e) { if (e.status === 400) foreign++; else throw e; }
        } else {
          if (!r.id || r.id !== ex.id) S.setRewardId(s.id, ex.id);
          if (ex.cost !== cost || ex.is_enabled !== want || !same(ex.title, title) || !!(ex.global_cooldown_setting || {}).is_enabled !== (cd > 0) || (cd > 0 && (ex.global_cooldown_setting || {}).global_cooldown_seconds !== cd)) {
            await mr.call('PATCH', '/channel_points/custom_rewards?id=' + ex.id, body); upd++;
          }
        }
      }
      setStatus(foreign ? 'foreign' : 'ok', foreign ? 'У части звуков награда с таким названием уже есть на канале (создана вручную). Переименуй звук или удали ту награду в Twitch.' : (made || upd || off ? 'Награды обновлены на Twitch' + (made ? ': создано ' + made : '') + '.' : 'Награды на Twitch в порядке.'));
    } catch (e) { const [st, tx] = mr.explain(e); setStatus(st, tx); }
  })();
  try { await busy; } finally { busy = null; }
  return getStatus();
}
/** Удалить награду звука на Twitch (звук удалён из саундпада). */
async function dropReward(rewardId) {
  if (!rewardId) return false;
  try { await mr.call('DELETE', '/channel_points/custom_rewards?id=' + encodeURIComponent(rewardId)); return true; } catch (e) { return false; }
}
/** Отметить выполнение награды (баллы списаны окончательно). */
async function fulfil(rewardId, redemptionId) {
  if (!rewardId || !redemptionId) return false;
  try { await mr.call('PATCH', '/channel_points/custom_rewards/redemptions?id=' + encodeURIComponent(redemptionId) + '&reward_id=' + encodeURIComponent(rewardId), { status: 'FULFILLED' }); return true; } catch (e) { return false; }
}
module.exports = { sync, dropReward, fulfil, getStatus };
