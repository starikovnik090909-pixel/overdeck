// auctionReward.js — награда «Аукцион» на Twitch: включена, только пока аукцион идёт. Создаёт и меняет её само приложение (Twitch разрешает менять только свои награды).
// Нужен scope channel:manage:redemptions (он уже запрашивается при входе через Twitch).
'use strict';
const mr = require('./musicReward');

let status = { state: 'idle', text: '' };
let busy = null;
const setStatus = (state, text) => { status = { state, text: text || '' }; };
const getStatus = () => Object.assign({}, status);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

async function findMine(cfg) {
  const mine = ((await mr.call('GET', '/channel_points/custom_rewards?only_manageable_rewards=true')) || {}).data || [];
  return mine.find((x) => cfg.rewardId && x.id === cfg.rewardId) || mine.find((x) => same(x.title, cfg.rewardTitle)) || null;
}

/** bridge — модуль auctionBridge. Включает награду, если аукцион идёт, и выключает, если нет; название и цену подтягивает из настроек. */
async function sync(bridge) {
  if (busy) await busy.catch(() => {});
  busy = (async () => {
    const cfg = bridge.getSettings(), want = bridge.isActive();
    try {
      const r = await findMine(cfg);
      if (!r) {
        const all = ((await mr.call('GET', '/channel_points/custom_rewards')) || {}).data || [];
        setStatus(all.some((x) => same(x.title, cfg.rewardTitle)) ? 'foreign' : 'missing', all.some((x) => same(x.title, cfg.rewardTitle)) ? 'Награда создана вручную, Twitch не даёт программе её менять. Удали её в Twitch и нажми «Создать награду».' : 'Награды на канале нет. Нажми «Создать награду».');
        return;
      }
      if (cfg.rewardId !== r.id) bridge.setRewardId(r.id);
      const patch = {};
      if (r.is_enabled !== want) patch.is_enabled = want;
      if (r.cost !== cfg.rewardCost) patch.cost = cfg.rewardCost;
      if (!same(r.title, cfg.rewardTitle)) patch.title = cfg.rewardTitle;
      if (Object.keys(patch).length) await mr.call('PATCH', '/channel_points/custom_rewards?id=' + r.id, patch);
      setStatus('ok', want ? 'Награда включена: зрители могут вносить взнос.' : 'Награда выключена до начала аукциона.');
    } catch (e) { const [st, tx] = mr.explain(e); setStatus(st, tx); }
  })();
  try { await busy; } finally { busy = null; }
  return getStatus();
}

async function create(bridge) {
  const cfg = bridge.getSettings();
  try {
    const j = await mr.call('POST', '/channel_points/custom_rewards', { title: cfg.rewardTitle, cost: cfg.rewardCost, prompt: 'Напиши название лота (фильм, игра…). В аукцион попадёт твой взнос: подписка, VIP и уровень аватара.', is_user_input_required: true, is_enabled: bridge.isActive() });
    const r = j && j.data && j.data[0]; if (r) bridge.setRewardId(r.id);
    await sync(bridge);
    return { ok: true, status: getStatus() };
  } catch (e) {
    if (e.status === 400 && /duplicate|уже|unique/i.test(e.message)) { setStatus('foreign', 'Награда с таким названием уже есть. Удали её в Twitch или выбери другое название.'); return { ok: false, error: status.text, status: getStatus() }; }
    const [st, tx] = mr.explain(e); setStatus(st, tx); return { ok: false, error: tx, status: getStatus() };
  }
}
module.exports = { sync, create, getStatus, refund: mr.refund };
