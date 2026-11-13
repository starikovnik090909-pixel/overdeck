// ВКонтакте: пост на стену и сообщение в беседу, ошибки API, события только в беседу, ключ не отдаётся наружу.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vk = require('../vkIntegration');

const FILE = path.join(__dirname, '..', 'vk.json');
const had = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
const calls = [];
let reply = () => ({ response: 1 });
global.fetch = async (url, o) => { const b = Object.fromEntries(new URLSearchParams(String(o.body))); calls.push({ url, b }); return { status: 200, text: async () => JSON.stringify(reply(b)) }; };

(async () => {
  vk.init({ channel: () => 'starlkov', getInfo: async () => ({ channel: 'starlkov', info: { title: 'Тест', game_name: 'Doom', viewer_count: 5 } }) });
  assert.throws(() => vk.update({ groupId: 'abc' }));
  assert.throws(() => vk.update({ chat: 'x' }));
  let s = vk.update({ token: 'vk1.a.' + 'x'.repeat(40), groupId: '-123456', chat: '2', enabled: true });
  assert.strictEqual(s.groupId, '123456'); assert.ok(!JSON.stringify(s).includes('xxxxxxxx'), 'ключ не отдаётся');
  const r = await vk.test();
  assert.strictEqual(r.live, true);
  assert.strictEqual(calls.length, 2);
  assert.ok(calls[0].url.endsWith('wall.post')); assert.ok(!('attachments' in calls[0].b), 'без вложения-ссылки'); assert.strictEqual(calls[0].b.owner_id, '-123456'); assert.strictEqual(calls[0].b.from_group, '1');
  assert.ok(calls[1].url.endsWith('messages.send')); assert.strictEqual(calls[1].b.peer_id, '2000000002');
  assert.ok(calls[0].b.message.includes('twitch.tv/starlkov'));
  assert.ok(!calls[0].url.includes('access_token'), 'ключ не в адресе');
  // событие уходит только в беседу
  calls.length = 0; vk.onEvent('raid', { username: 'Вася', viewers: 7 });
  await new Promise((x) => setTimeout(x, 20));
  assert.strictEqual(calls.length, 1); assert.ok(calls[0].url.endsWith('messages.send')); assert.ok(calls[0].b.message.includes('Вася'));
  // без беседы события молчат
  vk.update({ chat: '' }); calls.length = 0; vk.onEvent('raid', { username: 'Петя', viewers: 3 });
  await new Promise((x) => setTimeout(x, 20)); assert.strictEqual(calls.length, 0);
  // ошибка API
  reply = () => ({ error: { error_code: 5, error_msg: 'bad' } });
  await assert.rejects(() => vk.test(), /не принял ключ/);
  assert.ok(vk.publicState().lastError);
  reply = () => ({ response: { groups: [{ name: 'Моё сообщество' }] } });
  assert.strictEqual((await vk.check()).name, 'Моё сообщество');
  assert.ok(vk._summaryText({ startedAt: Date.now() - 3600000, title: 'T', games: ['A', 'B'], peak: 10, follows: 1, subs: 2, donations: 1, donRub: 100 }).includes('A → B'));
  if (had) fs.writeFileSync(FILE, had); else fs.rmSync(FILE, { force: true });
  console.log('vk: ok');
})().catch((e) => { if (had) fs.writeFileSync(FILE, had); else fs.rmSync(FILE, { force: true }); console.error(e); process.exit(1); });

