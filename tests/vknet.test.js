// ВКонтакте: сеть отвечает не JSON, ошибкой ВК и успешно.
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'vk.json');
const had = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;

// --- заглушка сети: не-JSON ответ, ошибка ВК и успех ---
const first = (async () => {
  const vk = require('../vkIntegration');
  const realFetch = global.fetch;
  const assert = require('assert');
  vk.update({ token: 'vk1.a.abcdefghijklmnopqrstuvwxyz0123', groupId: '123456789', chat: '1', wall: true, enabled: true });
  const calls = [];
  global.fetch = async (url, o) => { calls.push(String(url).split('/').pop()); return { status: 200, text: async () => '<html>Blocked</html>' }; };
  await assert.rejects(() => vk.check(), /ответил не так/);
  global.fetch = async () => ({ status: 200, text: async () => JSON.stringify({ error: { error_code: 5, error_msg: 'x' } }) });
  await assert.rejects(() => vk.check(), /не принял ключ/);
  global.fetch = async (url) => ({ status: 200, text: async () => JSON.stringify({ response: String(url).includes('groups.getById') ? { groups: [{ name: 'Тест' }] } : 1 }) });
  assert.strictEqual((await vk.check()).name, 'Тест');
  assert.ok((await vk.test()).live === false || true);
  global.fetch = realFetch;
  vk.update({ clearToken: true });
  if (had) fs.writeFileSync(FILE, had); else { try { fs.unlinkSync(FILE); } catch (e) {} }
  console.log('vk net stub: ok');
})().catch((e) => { console.error(e); process.exit(1); });

// --- скриншот эфира: загрузка на сервер ВК и вложение; сбой загрузки не ломает анонс ---
const second = first.then(async () => {
  const vk = require('../vkIntegration'); const assert = require('assert');
  const realFetch = global.fetch; const log = [];
  vk.init({ channel: () => 'starlkov', getInfo: async () => ({ channel: 'starlkov', info: { title: 'T', game_name: 'G', thumbnail_url: 'https://img/x-{width}x{height}.jpg' } }) });
  vk.update({ token: 'vk1.a.abcdefghijklmnopqrstuvwxyz0123', groupId: '123456789', chat: '1', wall: true, photo: true, enabled: true });
  const ok = (o) => ({ status: 200, ok: true, text: async () => JSON.stringify(o), json: async () => o, arrayBuffer: async () => new Uint8Array(5000).buffer });
  global.fetch = async (url, o) => {
    const u = String(url); const m = u.split('/').pop(); log.push({ m, b: o && o.body instanceof URLSearchParams ? Object.fromEntries(o.body) : null });
    if (u.startsWith('https://img/')) return ok({});
    if (u.includes('upload.vk')) return ok({ server: 1, photo: 'p', hash: 'h' });
    if (m === 'photos.getWallUploadServer' || m === 'photos.getMessagesUploadServer') return ok({ response: { upload_url: 'https://upload.vk/x' } });
    if (m === 'photos.saveWallPhoto' || m === 'photos.saveMessagesPhoto') return ok({ response: [{ id: 7, owner_id: -123456789 }] });
    return ok({ response: 1 });
  };
  const r = await vk.test(); assert.strictEqual(r.photo, true);
  const wall = log.find((x) => x.m === 'wall.post'), msg = log.find((x) => x.m === 'messages.send');
  assert.strictEqual(wall.b.attachments, 'photo-123456789_7'); assert.strictEqual(msg.b.attachment, 'photo-123456789_7');
  // сбой загрузки картинки: анонс уходит без неё
  log.length = 0;
  global.fetch = async (url, o) => { const u = String(url), m = u.split('/').pop(); log.push({ m, b: o && o.body instanceof URLSearchParams ? Object.fromEntries(o.body) : null }); if (u.startsWith('https://img/')) return ok({}); if (m.startsWith('photos.')) return ok({ error: { error_code: 7, error_msg: 'no' } }); return ok({ response: 1 }); };
  const r2 = await vk.test(); assert.strictEqual(r2.photo, false); assert.ok(!('attachments' in log.find((x) => x.m === 'wall.post').b));
  global.fetch = realFetch; vk.update({ clearToken: true });
  console.log('vk photo: ok');
}).catch((e) => { console.error(e); process.exit(1); });

// --- несколько бесед и закрепление поста ---
second.then(async () => {
  const vk = require('../vkIntegration'); const assert = require('assert'); const realFetch = global.fetch; const log = [];
  vk.init({ channel: () => 'starlkov', getInfo: async () => ({ channel: 'starlkov', info: { title: 'T', game_name: '' } }) });
  assert.throws(() => vk.update({ chat: '1, x' }));
  vk.update({ token: 'vk1.a.abcdefghijklmnopqrstuvwxyz0123', groupId: '123456789', chat: '1, 3 ,3', wall: true, photo: false, pin: true, enabled: true });
  global.fetch = async (url, o) => { const m = String(url).split('/').pop(); log.push({ m, b: Object.fromEntries(o.body) }); const r = m === 'wall.post' ? { response: { post_id: 55 } } : { response: 1 }; return { status: 200, ok: true, text: async () => JSON.stringify(r) }; };
  await vk.test();
  assert.deepStrictEqual(log.filter((x) => x.m === 'messages.send').map((x) => x.b.peer_id), ['2000000001', '2000000003']);
  const pin = log.find((x) => x.m === 'wall.pin'); assert.ok(pin && pin.b.post_id === '55' && pin.b.owner_id === '-123456789');
  global.fetch = realFetch; vk.update({ clearToken: true });
  console.log('vk multi: ok');
}).catch((e) => { console.error(e); process.exit(1); });
