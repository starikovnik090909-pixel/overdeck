// DonatePay: лимит запросов (HTML-страница) не считается ошибкой ключа; обычный донат доходит.
const assert = require('assert');
const dp = require('../donatepay');
const real = global.fetch;
const H = (o) => ({ get: (k) => (o || {})[k.toLowerCase()] || null });
const json = (o) => ({ status: 200, ok: true, headers: H(), text: async () => JSON.stringify(o) });
(async () => {
  // 1) первый ответ — HTML с retry-after (лимит), второй нормальный: connect переживает
  let n = 0;
  global.fetch = async (url) => {
    const m = String(url).split('?')[0].split('/').pop();
    if (m === 'user' && n++ === 0) return { status: 200, ok: true, headers: H({ 'retry-after': '1' }), text: async () => '<!DOCTYPE html><html></html>' };
    if (m === 'user') return json({ status: 'success', data: { id: 1, name: 'starlkov' } });
    return json({ status: 'success', data: [{ id: 10, what: 'Вася', sum: 150, comment: 'привет', status: 'success' }] });
  };
  const r = await dp.connect('key', () => {});
  assert.strictEqual(r.userName, 'starlkov');
  // 2) новый донат после курсора 10
  const got = [];
  global.fetch = async () => json({ status: 'success', data: [{ id: 11, what: 'Петя', sum: 300, comment: 'тест', status: 'success' }, { id: 12, what: 'X', sum: 5, status: 'cancel' }] });
  const found = await dp._poll(); assert.strictEqual(found.length, 1); assert.strictEqual(found[0].username, 'Петя'); assert.strictEqual(found[0].amount, 300);
  dp.disconnect();
  // 3) неверный ключ: фатально и по-русски
  global.fetch = async () => json({ status: 'error', message: 'Incorrect token' });
  await assert.rejects(() => dp.connect('bad', () => {}), /не принял API-ключ/);
  global.fetch = real;
  console.log('donatepay net: ok');
})().catch((e) => { console.error(e); process.exit(1); });
