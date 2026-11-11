// Обновление источников OBS: авторизация obs-websocket v5, фильтр по адресу, пароль не утекает в состояние.
const assert = require('assert');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const obs = require('../obsRefresh');
const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');

const pressed = [];
function fakeObs(port, pass) {
  const wss = new WebSocketServer({ port, handleProtocols: () => 'obswebsocket.json' });
  wss.on('connection', (ws) => {
    const salt = 'SALT', challenge = 'CHAL';
    ws.send(JSON.stringify({ op: 0, d: pass ? { rpcVersion: 1, authentication: { challenge, salt } } : { rpcVersion: 1 } }));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.op === 1) {
        if (pass && m.d.authentication !== sha(sha(pass + salt) + challenge)) return ws.close(4009);
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      } else if (m.op === 6) {
        const { requestType: t, requestId: id, requestData: d } = m.d; let data = {};
        if (t === 'GetInputList') data = { inputs: [{ inputName: 'Алерты' }, { inputName: 'Чужой' }] };
        if (t === 'GetInputSettings') data = { inputSettings: { url: d.inputName === 'Алерты' ? 'http://localhost:3001/overlay.html' : 'https://example.com' } };
        if (t === 'PressInputPropertiesButton') pressed.push(d.inputName + ':' + d.propertyName);
        ws.send(JSON.stringify({ op: 7, d: { requestType: t, requestId: id, requestStatus: { result: true, code: 100 }, responseData: data } }));
      }
    });
  });
  return wss;
}

(async () => {
  const srv = fakeObs(45551, 'secret');
  obs.update({ port: 45551, password: 'secret', filter: 'localhost:3001', enabled: false });
  assert.strictEqual(obs.state().password, undefined, 'пароль не отдаётся наружу');
  assert.strictEqual(obs.state().hasPassword, true);
  let r = await obs.refreshNow();
  assert.deepStrictEqual(pressed, ['Алерты:refreshnocache'], 'обновлён только источник с адресом Overdeck');
  assert.strictEqual(r.count, 1);
  obs.update({ filter: '' }); pressed.length = 0;
  r = await obs.refreshNow(); assert.strictEqual(r.count, 2, 'пустой фильтр — все браузерные источники');
  obs.update({ password: 'wrong' });
  r = await obs.refreshNow(); assert.strictEqual(r.success, false); assert.ok(/пароль/i.test(r.error), r.error);
  obs.update({ password: '' }); // пустое поле пароль не стирает
  assert.strictEqual(obs.state().hasPassword, true);
  obs.update({ clearPassword: true }); assert.strictEqual(obs.state().hasPassword, false);
  srv.close();
  obs.update({ port: 45599 });
  r = await obs.refreshNow(); assert.strictEqual(r.success, false); assert.ok(/OBS/.test(r.error), r.error);
  obs.update({ enabled: false, port: 4455, filter: 'localhost:3001' });
  require('fs').rmSync(require('path').join(__dirname, '..', 'obs_refresh.json'), { force: true });
  console.log('obsrefresh: ok'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
