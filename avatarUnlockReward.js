// avatarUnlockReward.js — награда за баллы канала «Разблокировать аватар»: создаётся кнопкой в админке.
// Зритель тратит баллы — сервер открывает ему случайный ЗАКРЫТЫЙ аватар (не из обычных и не из тех, что выдаются случайно). Логика открытия — в server.js (unlockAvatarForReward).
// Twitch разрешает менять только награды, созданные самим приложением, поэтому награду создаём отсюда. Нужен scope channel:manage:redemptions.
'use strict';
const mr = require('./musicReward');

let status = { state: 'idle', text: '' };
const setStatus = (state, text) => { status = { state, text: text || '' }; };
const getStatus = () => Object.assign({}, status);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** cfg — pixelHeroes.getUnlock(). Смотрит, есть ли награда на канале, и подтягивает цену и название. */
async function sync(cfg) {
  if (!cfg.rewardTitle) { setStatus('idle', 'Название награды пустое.'); return getStatus(); }
  try {
    const mine = ((await mr.call('GET', '/channel_points/custom_rewards?only_manageable_rewards=true')) || {}).data || [];
    const r = mine.find((x) => same(x.title, cfg.rewardTitle));
    if (!r) {
      const all = ((await mr.call('GET', '/channel_points/custom_rewards')) || {}).data || [];
      if (all.some((x) => same(x.title, cfg.rewardTitle))) setStatus('foreign', 'Награда создана вручную. Она тоже работает (аватар откроется), но цену из админки Twitch не даёт менять программе.');
      else setStatus('missing', 'Награды на канале нет. Нажми «Создать награду на Twitch».');
      return getStatus();
    }
    if (r.cost !== cfg.rewardCost) await mr.call('PATCH', '/channel_points/custom_rewards?id=' + r.id, { cost: cfg.rewardCost });
    setStatus('ok', 'Награда «' + r.title + '» есть на канале, цена ' + cfg.rewardCost + '.');
  } catch (e) { const [st, tx] = mr.explain(e); setStatus(st, tx); }
  return getStatus();
}

async function create(cfg) {
  try {
    await mr.call('POST', '/channel_points/custom_rewards', { title: cfg.rewardTitle, cost: cfg.rewardCost, prompt: 'Откроет случайный закрытый аватар, которого нет у обычных зрителей.', is_enabled: true });
    return { ok: true, status: await sync(cfg) };
  } catch (e) {
    if (e.status === 400 && /duplicate|уже|unique/i.test(e.message)) { setStatus('foreign', 'Награда с таким названием уже есть. Она работает; чтобы управлять ею отсюда, удали её в Twitch и создай заново.'); return { ok: false, error: status.text, status: getStatus() }; }
    const [st, tx] = mr.explain(e); setStatus(st, tx); return { ok: false, error: tx, status: getStatus() };
  }
}
module.exports = { sync, create, getStatus };
