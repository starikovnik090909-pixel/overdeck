// voicefxReward.js — награда за баллы «Голосовой фильтр». Создаёт и обновляет её само приложение (нужен вход через Twitch).
'use strict';
const mr = require('./musicReward');
let status = { state: 'idle', text: '' }, busy = null;
const set = (state, text) => { status = { state, text: text || '' }; };
const getStatus = () => Object.assign({}, status);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

async function sync(vf) {
  if (busy) await busy.catch(() => {});
  busy = (async () => {
    const c = vf.getSettings(), r = c.reward;
    if (!r.on && !r.id) { set('idle', ''); return; }
    try {
      const mine = ((await mr.call('GET', '/channel_points/custom_rewards?only_manageable_rewards=true')) || {}).data || [];
      let ex = mine.find((x) => r.id && x.id === r.id) || mine.find((x) => same(x.title, r.title));
      const want = !!(c.enabled && r.on);
      const needText = r.filter === 'viewer';
      const body = {
        title: r.title, cost: r.cost, is_enabled: want, is_global_cooldown_enabled: r.cooldown > 0, global_cooldown_seconds: Math.max(1, r.cooldown || 1),
        prompt: needText ? 'Напиши название фильтра: рация, робот, демон, пещера…' : 'Голос стримера и озвучка зазвучат с эффектом на ' + r.duration + ' сек', is_user_input_required: needText,
      };
      if (!r.on) { if (ex && ex.is_enabled) await mr.call('PATCH', '/channel_points/custom_rewards?id=' + ex.id, { is_enabled: false }); set('ok', 'Награда выключена'); return; }
      if (!ex) {
        try { const j = await mr.call('POST', '/channel_points/custom_rewards', body); ex = j && j.data && j.data[0]; if (ex) { vf.setRewardId(ex.id); set('ok', 'Награда создана на Twitch'); } }
        catch (e) { if (e.status === 400) { set('foreign', 'Награда с таким названием уже есть на канале (создана вручную). Переименуй её здесь или удали в Twitch.'); return; } throw e; }
      } else {
        if (r.id !== ex.id) vf.setRewardId(ex.id);
        await mr.call('PATCH', '/channel_points/custom_rewards?id=' + ex.id, body); set('ok', 'Награда на Twitch в порядке');
      }
    } catch (e) { const [st, tx] = mr.explain(e); set(st, tx); }
  })();
  try { await busy; } finally { busy = null; }
  return getStatus();
}
async function fulfil(rewardId, redemptionId) {
  if (!rewardId || !redemptionId) return false;
  try { await mr.call('PATCH', '/channel_points/custom_rewards/redemptions?id=' + encodeURIComponent(redemptionId) + '&reward_id=' + encodeURIComponent(rewardId), { status: 'FULFILLED' }); return true; } catch (e) { return false; }
}
module.exports = { sync, fulfil, getStatus };
