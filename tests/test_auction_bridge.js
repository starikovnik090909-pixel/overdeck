const { createAuctionBridge } = require('../auctionBridge.js'); let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log('FAIL', n)); };
(async () => {
  const profiles = { sub1: { level: 3, flags: { sub: true } }, vip1: { level: 0, flags: { vip: true } }, big: { level: 99, flags: { sub: true, vip: true } }, zero: { level: 0, flags: {} }, lv10: { level: 10, flags: {} } };
  const sent = [], refunded = [], done = []; let failNext = false;
  const mk = () => createAuctionBridge({ file: null, getProfile: (l) => profiles[l] || null,
    send: async (bid, token) => { if (failNext) { failNext = false; throw new Error('нет связи'); } sent.push({ bid, token }); },
    cancel: async (r, id) => { refunded.push(id); return true; }, fulfil: async (r, id) => { done.push(id); return true; } });
  const b = mk(); b.setSettings({ token: 'tok123' });
  const ev = (login, extra) => Object.assign({ login, name: login.toUpperCase(), input: 'Фильм', reward: 'Аукцион', rewardId: 'r1', redemptionId: 'x' + Math.random() }, extra);
  // расчёт
  t('подписка + 3 уровня = 160', b.compute(profiles.sub1).total === 160);
  t('VIP = 400', b.compute(profiles.vip1).total === 400);
  t('10 уровней = 100', b.compute(profiles.lv10).total === 100);
  t('потолок уровней 500, всё вместе 1030', b.compute(profiles.big).total === 1030 && b.compute(profiles.big).levelBonus === 500);
  t('нет профиля — 0', b.compute(null).total === 0);
  // чужая награда
  t('чужая награда не трогается', (await b.onRedeem(ev('sub1', { reward: 'Другая' }))).handled === false);
  // аукцион закрыт
  let r = await b.onRedeem(ev('sub1')); t('закрыт: отказ и возврат баллов', r.status === 'closed' && refunded.length === 1 && sent.length === 0);
  t('старт', b.start().ok && b.isActive() && !b.start().ok);
  r = await b.onRedeem(ev('sub1', { input: 'Матрица' })); t('взнос отправлен', r.status === 'sent' && r.amount === 160 && sent.length === 1 && done.length === 1);
  const bid = sent[0].bid; t('в PointAuc: ник, сумма, лот, investorId, токен', bid.username === 'SUB1' && bid.cost === 160 && bid.message === 'Матрица' && bid.investorId === 'sub1' && sent[0].token === 'tok123' && bid.isDonation === false);
  r = await b.onRedeem(ev('sub1')); t('второй раз за аукцион — отказ, баллы вернулись', r.status === 'duplicate' && sent.length === 1 && refunded.length === 2);
  r = await b.onRedeem(ev('zero')); t('нет ни подписки, ни VIP, ни уровня — отказ', r.status === 'empty' && sent.length === 1);
  r = await b.onRedeem(ev('nobody')); t('неизвестный зритель — отказ', r.status === 'empty');
  r = await b.onRedeem(ev('big', { input: '' })); t('без названия — лот по умолчанию', r.status === 'sent' && sent[1].bid.message === 'Лот от BIG' && r.amount === 1030);
  // два клика одновременно: проходит один
  const a = ev('vip1'), a2 = ev('vip1'); const both = await Promise.all([b.onRedeem(a), b.onRedeem(a2)]);
  t('одновременные клики — один взнос', both.filter((x) => x.status === 'sent').length === 1 && both.filter((x) => x.status === 'duplicate').length === 1);
  // ошибка PointAuc: баллы возвращаются, можно повторить
  failNext = true; r = await b.onRedeem(ev('lv10')); t('ошибка PointAuc: возврат', r.status === 'error' && /нет связи/.test(r.text));
  r = await b.onRedeem(ev('lv10')); t('после ошибки взнос можно внести', r.status === 'sent' && r.amount === 100);
  const st = b.state(); t('состояние: взносы и сумма', st.contributors.length === 4 && st.total === 160 + 1030 + 400 + 100);
  const fin = b.stop(); t('стоп: итог', fin.ok && fin.count === 4 && !b.isActive());
  // новый аукцион — снова можно
  b.start(); r = await b.onRedeem(ev('sub1')); t('в новом аукционе снова можно', r.status === 'sent');
  // настройки
  const s = b.getSettings(); t('токен наружу не отдаётся', s.token === undefined && s.hasToken && s.tokenPreview === '…k123');
  b.setSettings({ levelCap: 300, subBonus: 50 }); t('настройки меняют расчёт', b.compute(profiles.big).total === 300 + 50 + 400);
  b.setSettings({ perLevel: -5, rewardCost: 0 }); t('кривые значения не ломают', b.getSettings().perLevel === 0 && b.getSettings().rewardCost === 1);
  // без токена
  const b2 = createAuctionBridge({ file: null, getProfile: (l) => profiles[l] || null, cancel: async () => true }); b2.start();
  r = await b2.onRedeem(ev('sub1')); t('без токена: ошибка понятным текстом, возврат', r.status === 'error' && /токен/.test(r.text));
  console.log(bad ? 'ПРОВАЛ ' + bad : 'ok ' + ok); process.exit(bad ? 1 : 0);
})();
