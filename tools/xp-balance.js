#!/usr/bin/env node
// Калькулятор баланса опыта чат-аватаров: за сколько часов берутся уровни при разном поведении зрителя и ролях.
// Запуск: node tools/xp-balance.js      Ставки и множители берутся из xpRules.js — поменяли их там, перезапустили калькулятор.
const R = require('../xpRules');
const X = R.XP;
const perHourPresence = X.presence * (60 / (X.presenceEveryMs / 60000));                       // присутствие: тиков в час × ставка (пока человек пишет хотя бы раз в окно)
const msgs = (n) => Math.min(X.messageCapPerHour, n * X.message);                              // опыт за сообщения за час: не больше потолка (паузу 90 с учитываем границей n)
const viewers = {
  'тихий (3 сообщения в час)': perHourPresence + msgs(3),
  'активный (15 сообщений в час)': perHourPresence + msgs(15),
  'болтун (сообщение каждые 30 секунд)': perHourPresence + X.messageCapPerHour,
};
const roles = { 'без ролей': {}, 'подписка': { sub: 1 }, 'VIP': { vip: 1 }, 'модератор': { mod: 1 }, 'все три': { sub: 1, vip: 1, mod: 1 } };
const levels = [1, 2, 5, 10, 25, 50, 75, 99];
console.log(`Ставки: заход ${X.join}, присутствие ${X.presence}/${X.presenceEveryMs / 60000} мин, сообщение ${X.message} (пауза ${X.messageCooldownMs / 1000} с, потолок ${X.messageCapPerHour}/час), ставка ${X.participation}.`);
console.log(`Опыта на уровень: ${levels.map((n) => n + '-й: ' + R.needForLevel(n)).join(', ')}. Всего до 99-го: ${R.totalForLevel(99)}.\n`);
for (const [vName, perHour] of Object.entries(viewers)) {
  console.log(`== ${vName}: ${perHour} опыта в час (без ролей)`);
  for (const [rName, r] of Object.entries(roles)) {
    const rate = perHour * R.multiplier(r);
    console.log(`   ${rName.padEnd(10)} ×${R.multiplier(r).toFixed(1)}  ${levels.map((n) => n + ' ур.: ' + (R.totalForLevel(n) / rate < 10 ? (R.totalForLevel(n) / rate).toFixed(1) : Math.round(R.totalForLevel(n) / rate)) + ' ч').join(' | ')}`);
  }
}
