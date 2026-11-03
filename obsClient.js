// obsClient.js — минимальный клиент OBS WebSocket 5 (встроен в OBS 28+, порт 4455). Нужен, чтобы подменять микрофон на обработанный
// и создавать источник с фильтром. Своих зависимостей нет: используется уже подключённый пакет ws.
'use strict';
const crypto = require('crypto');
const WebSocket = require('ws');

const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');
let ws = null, cfg = null, status = { state: 'off', text: '' }, pending = new Map(), seq = 0, retry = null, ready = false, wantKey = '', onReady = () => {};
const setStatus = (state, text) => { status = { state, text: text || '' }; };
const getStatus = () => Object.assign({}, status);

function request(type, data, ms) {
  return new Promise((res, rej) => {
    if (!ws || !ready) return rej(new Error('OBS не подключён'));
    const id = 'r' + (++seq);
    const t = setTimeout(() => { pending.delete(id); rej(new Error('OBS не ответил')); }, ms || 5000);
    pending.set(id, { res, rej, t });
    ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
  });
}
function closeNow() { clearTimeout(retry); retry = null; ready = false; if (ws) { try { ws.removeAllListeners(); ws.on('error', () => {}); ws.close(); } catch (e) { /* уже закрыт */ } ws = null; } pending.forEach((p) => { clearTimeout(p.t); p.rej(new Error('Соединение закрыто')); }); pending.clear(); }
function connect() {
  closeNow();
  if (!cfg || !cfg.on) { setStatus('off', ''); return; }
  wantKey = [cfg.host, cfg.port, cfg.password].join('|');
  setStatus('connecting', 'Подключаюсь к OBS…');
  let sock;
  try { sock = new WebSocket('ws://' + cfg.host + ':' + cfg.port, { handshakeTimeout: 4000 }); } catch (e) { setStatus('error', 'Неверный адрес OBS'); return; }
  ws = sock;
  sock.on('message', (raw) => {
    let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
    if (m.op === 0) {   // Hello
      const d = { rpcVersion: 1, eventSubscriptions: 0 };
      const a = m.d && m.d.authentication;
      if (a) { if (!cfg.password) { setStatus('auth', 'OBS просит пароль WebSocket: впиши его ниже'); sock.close(); return; } d.authentication = sha(sha(cfg.password + a.salt) + a.challenge); }
      sock.send(JSON.stringify({ op: 1, d }));
    } else if (m.op === 2) { ready = true; setStatus('ok', 'OBS подключён'); try { onReady(); } catch (e) { /* не критично */ } }
    else if (m.op === 7) {
      const p = pending.get(m.d.requestId); if (!p) return; pending.delete(m.d.requestId); clearTimeout(p.t);
      const st = m.d.requestStatus || {};
      if (st.result) p.res(m.d.responseData || {}); else p.rej(Object.assign(new Error(st.comment || 'Ошибка OBS'), { code: st.code }));
    }
  });
  sock.on('close', (code) => {
    const was = ready; ready = false; if (ws === sock) ws = null;
    pending.forEach((p) => { clearTimeout(p.t); p.rej(new Error('Соединение закрыто')); }); pending.clear();
    if (!cfg || !cfg.on) return;
    if (code === 4009) setStatus('auth', 'Неверный пароль OBS WebSocket');
    else if (status.state !== 'auth') setStatus('error', was ? 'Связь с OBS потеряна, переподключаюсь…' : 'OBS не отвечает. Он запущен? В OBS: Инструменты → Настройки WebSocket-сервера → включить');
    clearTimeout(retry); retry = setTimeout(connect, 8000); if (retry.unref) retry.unref();
  });
  sock.on('error', () => { /* разберёт close */ });
}
/** Применить настройки (подключиться заново, если поменялись адрес/пароль/включение). */
function configure(c, opts) {
  const key = c && c.on ? [c.host, c.port, c.password].join('|') : '';
  const was = cfg; cfg = c ? Object.assign({}, c) : null; if (opts && opts.onReady) onReady = opts.onReady;
  if (!cfg || !cfg.on) { closeNow(); setStatus('off', ''); return; }
  if (!ws || key !== wantKey || !was || !was.on) connect();
}
/** Включить обработанный микрофон (on) или вернуть обычный. */
async function switchMic(on) {
  if (!cfg || !cfg.on || !ready) return false;
  const mic = cfg.micInput, fx = cfg.fxInput;
  if (!mic || !fx) return false;
  const mute = (name, m) => request('SetInputMute', { inputName: name, inputMuted: m });
  if (on) { await mute(fx, false); await mute(mic, true); } else { await mute(mic, false); await mute(fx, true); }
  return true;
}
/** Список входов OBS: микрофоны и источники «Браузер». */
async function listInputs() {
  const r = await request('GetInputList', {});
  return (r.inputs || []).map((i) => ({ name: i.inputName, kind: i.inputKind }));
}
/** Создать в текущей сцене источник «Браузер» со страницей микрофона с обработкой. */
async function createFxSource(url) {
  const sc = await request('GetCurrentProgramScene', {});
  const name = cfg.fxInput;
  try {
    await request('CreateInput', { sceneName: sc.currentProgramSceneName || sc.sceneName, inputName: name, inputKind: 'browser_source', inputSettings: { url, width: 320, height: 120, reroute_audio: true, shutdown: false, restart_when_active: false }, sceneItemEnabled: true });
    return { created: true };
  } catch (e) {
    if (e.code === 601) { await request('SetInputSettings', { inputName: name, inputSettings: { url, reroute_audio: true }, overlay: true }); return { created: false }; }   // уже есть: обновили ссылку
    throw e;
  }
}
module.exports = { configure, getStatus, switchMic, listInputs, createFxSource, request, _sha: sha };
