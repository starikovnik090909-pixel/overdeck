// obsRefresh.js — обновление браузерных источников в OBS через obs-websocket v5 (OBS 28+, порт 4455).
// По таймеру и по кнопке из админки. Подключается на время обновления и сразу отключается.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const notify = require('./notify');

const FILE = path.join(__dirname, 'obs_refresh.json');
const DEFAULTS = { enabled: false, host: '127.0.0.1', port: 4455, password: '', intervalMin: 10, filter: 'localhost:3001' };

let cfg = Object.assign({}, DEFAULTS);
let timer = null;
let busy = false;
let last = { at: 0, ok: null, count: 0, error: '', reason: '' };

const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');

function sanitize(src, base) {
  const out = Object.assign({}, base); const b = src || {};
  if (typeof b.enabled === 'boolean') out.enabled = b.enabled;
  if (typeof b.host === 'string' && /^[\w.\-]{1,100}$/.test(b.host.trim())) out.host = b.host.trim();
  if (b.port != null && Number(b.port) >= 1 && Number(b.port) <= 65535) out.port = Math.round(Number(b.port));
  if (typeof b.password === 'string') out.password = b.password.slice(0, 200);
  if (b.intervalMin != null && isFinite(Number(b.intervalMin))) out.intervalMin = Math.max(1, Math.min(240, Math.round(Number(b.intervalMin))));
  if (typeof b.filter === 'string') out.filter = b.filter.trim().slice(0, 200);
  return out;
}
function load() { try { cfg = sanitize(JSON.parse(fs.readFileSync(FILE, 'utf8')), DEFAULTS); } catch (e) { cfg = Object.assign({}, DEFAULTS); } }
function save() { try { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(cfg, null, 2)); fs.renameSync(t, FILE); } catch (e) { console.warn('[OBS] не удалось сохранить:', e.message); } }

// Клиент: открывает соединение, проходит авторизацию, отдаёт функцию request(type, data).
function connect(c, timeoutMs) {
  return new Promise((resolve, reject) => {
    let ws; let done = false; const pend = new Map(); let n = 0;
    const fail = (m) => { if (done) return; done = true; clearTimeout(tm); try { ws && ws.close(); } catch (e) { /* уже закрыт */ } reject(new Error(m)); };
    const tm = setTimeout(() => fail('OBS не отвечает'), timeoutMs || 6000);
    try { ws = new WebSocket('ws://' + c.host + ':' + c.port, 'obswebsocket.json'); } catch (e) { return fail('Неверный адрес OBS'); }
    ws.on('error', (e) => fail(e && e.code === 'ECONNREFUSED' ? 'OBS не запущен или WebSocket выключен (Инструменты → Настройки WebSocket-сервера)' : 'Ошибка связи с OBS'));
    ws.on('close', (code) => { if (!done) fail(code === 4009 ? 'Неверный пароль OBS' : 'OBS закрыл соединение'); pend.forEach((p) => p.rej(new Error('Соединение закрыто'))); });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.op === 0) {
        const id = { rpcVersion: 1, eventSubscriptions: 0 };
        const a = m.d && m.d.authentication;
        if (a) {
          if (!c.password) return fail('OBS просит пароль — введи его в настройках');
          id.authentication = sha(sha(c.password + a.salt) + a.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d: id }));
      } else if (m.op === 2 && !done) {
        done = true; clearTimeout(tm);
        resolve({
          request: (type, data) => new Promise((res, rej) => {
            const requestId = 'r' + (++n); pend.set(requestId, { res, rej });
            ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId, requestData: data || {} } }));
            setTimeout(() => { if (pend.delete(requestId)) rej(new Error('OBS не ответил на ' + type)); }, 6000);
          }),
          close: () => { try { ws.close(); } catch (e) { /* уже закрыт */ } },
        });
      } else if (m.op === 7 && m.d) {
        const p = pend.get(m.d.requestId); if (!p) return; pend.delete(m.d.requestId);
        if (m.d.requestStatus && m.d.requestStatus.result) p.res(m.d.responseData || {}); else p.rej(new Error((m.d.requestStatus && m.d.requestStatus.comment) || 'Ошибка запроса OBS'));
      }
    });
  });
}

async function refreshNow(reason) {
  if (busy) return { success: false, error: 'Обновление уже идёт' };
  busy = true; let cli = null;
  try {
    cli = await connect(cfg);
    const list = await cli.request('GetInputList', { inputKind: 'browser_source' });
    const names = (list.inputs || []).map((i) => i.inputName).filter(Boolean);
    let n = 0;
    for (const name of names) {
      if (cfg.filter) {
        const s = await cli.request('GetInputSettings', { inputName: name }).catch(() => ({}));
        const url = String((s.inputSettings && s.inputSettings.url) || '');
        if (!url.includes(cfg.filter)) continue;
      }
      await cli.request('PressInputPropertiesButton', { inputName: name, propertyName: 'refreshnocache' });
      n++;
    }
    last = { at: Date.now(), ok: true, count: n, error: '', reason: reason || 'кнопка' };
    notify.emit('obs.refreshed', { count: n }, { silent: reason === 'по таймеру' }); // таймер молчит, пока всё хорошо
    return { success: true, count: n, total: names.length };
  } catch (e) {
    last = { at: Date.now(), ok: false, count: 0, error: e.message, reason: reason || 'кнопка' };
    notify.emit(/пароль/i.test(e.message) ? 'obs.auth' : 'obs.unreachable', {});
    return { success: false, error: e.message };
  } finally { if (cli) cli.close(); busy = false; }
}

function restart() {
  if (timer) { clearInterval(timer); timer = null; }
  if (cfg.enabled) { timer = setInterval(() => { refreshNow('по таймеру'); }, cfg.intervalMin * 60 * 1000); if (timer.unref) timer.unref(); }
}
function init(opts) { load(); if (opts && opts.defaultFilter && !fs.existsSync(FILE)) cfg.filter = opts.defaultFilter; restart(); }
function state() { const o = Object.assign({}, cfg); delete o.password; o.hasPassword = !!cfg.password; o.last = last; return o; }
function update(b) {
  const next = sanitize(b, cfg);
  if (b && b.clearPassword === true) next.password = '';
  else if (!(b && typeof b.password === 'string' && b.password)) next.password = cfg.password; // пустое поле — пароль не трогаем
  cfg = next; save(); restart(); return state();
}

module.exports = { init, state, update, refreshNow, _connect: connect };
