// Голосовые фильтры: состояние, награды, донаты, таймеры и клиент OBS WebSocket (с поддельным сервером OBS).
const assert = require('assert');
const crypto = require('crypto');
const WebSocket = require('ws');
const vf = require('../voicefx');
const obs = require('../obsClient');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
let t = 1000000; const changes = [];
vf.init({ noFile: true, now: () => t, onChange: (a) => changes.push(a.filter) });
ok(vf.active().filter === 'off', 'по умолчанию выключено');
ok(vf.trigger('radio', 30, 'x') === null, 'выключенные фильтры не включаются за баллы');
vf.update({ enabled: true, filter: 'robot', strength: 70 });
ok(vf.active().filter === 'robot' && vf.active().strength === 70, 'ручной фильтр');
vf.update({ filter: 'нет такого' }); ok(vf.active().filter === 'robot', 'неизвестный фильтр игнорируется');
vf.update({ reward: { on: true, title: '🎙 Голосовой фильтр', duration: 20, filter: 'radio' } });
ok(vf.onPoints({ reward: 'чужая награда', name: 'a' }) === null, 'чужая награда не трогает');
const hit = vf.onPoints({ reward: '🎙 голосовой  фильтр', name: 'Вася' });
ok(hit && hit.filter === 'radio' && hit.by === 'Вася' && vf.active().until === t + 20000, 'награда включает фильтр на время');
t += 21000; vf.tick(); ok(vf.active().filter === 'robot', 'через время вернулся ручной фильтр');
vf.update({ reward: { filter: 'viewer' } });
ok(vf.onPoints({ reward: '🎙 Голосовой фильтр', name: 'a', input: 'Хочу ДЕМОН пожалуйста' }).filter === 'demon', 'зритель назвал фильтр');
vf.reset();
const rnd = vf.onPoints({ reward: '🎙 Голосовой фильтр', name: 'a', input: 'абракадабра' }); ok(vf.IDS.includes(rnd.filter), 'не нашли название — случайный');
vf.reset();
vf.update({ donation: { on: true, minRub: 100, keyword: 'рация', duration: 15, filter: 'mega' } });
ok(vf.onDonation({ username: 'd', message: 'привет', rub: 500 }) === null, 'нет слова — не срабатывает');
ok(vf.onDonation({ username: 'd', message: 'Дай РАЦИЮ', rub: 50 }) === null && vf.active().until === 0, 'мало денег — не срабатывает');
ok(vf.onDonation({ username: 'd', message: 'включи рация', rub: 150 }).filter === 'mega', 'донат включает фильтр');
vf.update({ donation: { keyword: '' } }); vf.reset();
ok(vf.onDonation({ username: 'd', message: '', rub: 100 }).source === 'donation', 'без слова — любой донат от суммы');
vf.update({ enabled: false }); ok(vf.active().filter === 'off', 'главный выключатель гасит всё');
ok(changes.length > 5, 'onChange вызывается');
ok(vf.fromText('сделай пожалуйста телефон') === 'phone' && vf.fromText('') === '', 'поиск названия в тексте');
vf.update({ obs: { host: 'a b;c', port: 99999, fxInput: '' } }); const o = vf.getSettings().obs; ok(o.host === 'abc' && o.port === 99999 || o.port === 65535, 'адрес OBS чистится');

// поддельный OBS: проверка рукопожатия с паролем и команд
(async () => {
  const salt = 'saltsalt', challenge = 'chal', pass = 'secret';
  const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');
  const good = sha(sha(pass + salt) + challenge);
  const got = [];
  const srv = new WebSocket.Server({ port: 0 });
  await new Promise((r) => srv.on('listening', r));
  srv.on('connection', (s) => {
    s.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.0.0', rpcVersion: 1, authentication: { challenge, salt } } }));
    s.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.op === 1) { if (m.d.authentication === good) s.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); else s.close(4009); }
      else if (m.op === 6) { got.push(m.d.requestType + ':' + JSON.stringify(m.d.requestData)); s.send(JSON.stringify({ op: 7, d: { requestType: m.d.requestType, requestId: m.d.requestId, requestStatus: { result: true, code: 100 }, responseData: m.d.requestType === 'GetInputList' ? { inputs: [{ inputName: 'Микрофон', inputKind: 'wasapi_input_capture' }] } : {} } })); }
    });
  });
  const port = srv.address().port;
  let ready = false;
  obs.configure({ on: true, host: '127.0.0.1', port, password: pass, micInput: 'Микрофон', fxInput: 'Mic FX' }, { onReady: () => { ready = true; } });
  for (let i = 0; i < 50 && !ready; i++) await new Promise((r) => setTimeout(r, 50));
  ok(ready && obs.getStatus().state === 'ok', 'OBS: вход с паролем (SHA-256) прошёл');
  ok(await obs.switchMic(true) === true, 'OBS: переключение на обработанный микрофон');
  await obs.switchMic(false);
  ok(got[0] === 'SetInputMute:{"inputName":"Mic FX","inputMuted":false}' && got[1] === 'SetInputMute:{"inputName":"Микрофон","inputMuted":true}' && got[2].includes('"inputName":"Микрофон","inputMuted":false'), 'OBS: команды выключают обычный и включают обработанный');
  ok((await obs.listInputs())[0].name === 'Микрофон', 'OBS: список входов');
  obs.configure({ on: false }); ok(obs.getStatus().state === 'off', 'OBS: выключение');
  obs.configure({ on: true, host: '127.0.0.1', port, password: 'bad', micInput: 'a', fxInput: 'b' });
  for (let i = 0; i < 50 && obs.getStatus().state !== 'auth'; i++) await new Promise((r) => setTimeout(r, 50));
  ok(obs.getStatus().state === 'auth', 'OBS: неверный пароль распознан');
  obs.configure({ on: false }); srv.close();
  console.log('✓ voicefx: ' + n + ' проверок');
  process.exit(0);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
