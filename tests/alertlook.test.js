// Алерт доната: вид по сумме (lookRules).
const assert = require('assert');
const d = require('../donationAlert');
let n = 0; const ok = (c, msg) => { assert(c, msg); n++; };
const rules = d.cleanRules([{ from: 1000, look: 'hijack' }, { from: 50, look: 'receipt' }, { from: 50, look: 'cinema' }, { from: 0, look: 'card' }, { from: 5, look: 'нет такого' }]);
ok(rules.length === 2 && rules[0].from === 50 && rules[1].from === 1000, 'правила: порядок, дубли и мусор отброшены');
const s = Object.assign({}, d.DEFAULTS, { look: 'card', lookRules: rules });
ok(d.lookFor(10, s) === 'card' && d.lookFor(50, s) === 'receipt' && d.lookFor(999, s) === 'receipt' && d.lookFor(1000, s) === 'hijack' && d.lookFor(99999, s) === 'hijack', 'вид по порогам');
ok(d.lookFor(5000, Object.assign({}, s, { lookRules: [] })) === 'card', 'без правил — общий вид');
ok(d.buildCard({ username: 'a', amount: 1500, currency: 'RUB' }, s, { rub: 1500 }).dlook === 'hijack', 'карточка получает вид «hijack»');
ok(d.buildCard({ username: 'a', amount: 70, currency: 'RUB' }, s, { rub: 70 }).receipt, 'на 70 ₽ — чек');
ok(d.sanitize({ lookRules: 'мусор' }).lookRules.length === 0, 'не массив — пусто');
ok(d.sanitize({ lookRules: new Array(20).fill(0).map((_, i) => ({ from: i + 1, look: 'card' })) }).lookRules.length === 8, 'не больше 8 правил');
console.log('alertlook.test: ' + n + ' проверок ок');
