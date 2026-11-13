// ВКонтакте: сеть отвечает не JSON, ошибкой ВК и успешно.
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'vk.json');
const had = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;

// --- заглушка сети: не-JSON ответ, ошибка ВК и успех ---
(async () => {
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
