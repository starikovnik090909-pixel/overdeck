// modOvervoice.js — мод «Овервойс»: нейроголос для микрофона (отдельная программа, ставится из лаунчера, раздел «Моды»).
// Overdeck находит установленный Овервойс, при желании запускает его сам вместе с собой и показывает его в админке.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFile } = require('child_process');

const PORT = 3055;
let ROOT = __dirname, OD_PORT = 3001, useFile = true;
let cfg = { dir: '', autostart: true, port: PORT };
let child = null, starting = null;

const cfgFile = () => path.join(ROOT, 'mods.json');
function load() { try { const j = (JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) || {}).overvoice || {}; cfg = clean(j); } catch (e) { cfg = clean({}); } }
function clean(j) {
  const o = j && typeof j === 'object' ? j : {};
  const port = Number(o.port);
  return { dir: typeof o.dir === 'string' ? o.dir.trim().slice(0, 300) : cfg.dir, autostart: typeof o.autostart === 'boolean' ? o.autostart : cfg.autostart, port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : cfg.port };
}
function persist() { if (!useFile) return; try { fs.writeFileSync(cfgFile(), JSON.stringify({ overvoice: cfg }, null, 2)); } catch (e) { /* не критично */ } }
const dir = () => cfg.dir || path.join(ROOT, 'mods', 'overvoice');
const serverFile = () => path.join(dir(), 'server.js');
const installed = () => { try { return fs.statSync(serverFile()).isFile(); } catch (e) { return false; } };
function version() { try { return JSON.parse(fs.readFileSync(path.join(dir(), 'package.json'), 'utf8')).version || ''; } catch (e) { return ''; } }

function init(o) {
  const x = o || {}; if (x.root) ROOT = x.root; if (x.port) OD_PORT = x.port; useFile = !x.noFile;
  cfg = clean({}); if (useFile) load();
}
const getSettings = () => ({ ...cfg });
function update(b) { cfg = clean(Object.assign({}, cfg, b || {})); persist(); return state(); }

/** Отвечает ли Овервойс на своём порту. */
function alive(ms) {
  return new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port: cfg.port, path: '/api/link', timeout: ms || 1200 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    r.on('timeout', () => { r.destroy(); resolve(false); }); r.on('error', () => resolve(false));
  });
}
async function state() {
  const run = await alive();
  return { installed: installed(), running: run, starting: !!starting && !run, autostart: cfg.autostart, dir: dir(), version: version(), url: 'http://localhost:' + cfg.port + '/', port: cfg.port };
}

/** Запустить Овервойс в фоне (без окон). Если уже запущен, ничего не делает. */
function start() {
  if (starting) return starting;
  starting = (async () => {
    try {
      if (!installed()) throw new Error('Овервойс не установлен. Поставь его в лаунчере, раздел «Моды».');
      if (await alive()) return;
      child = spawn(process.execPath, ['server.js'], { cwd: dir(), windowsHide: true, stdio: 'ignore', env: Object.assign({}, process.env, { OVERVOICE_PORT: String(cfg.port), OVERVOICE_NO_OPEN: '1', OVERVOICE_OVERDECK_URL: 'http://localhost:' + OD_PORT }) });
      child.on('exit', () => { child = null; });
      child.on('error', () => { child = null; });
      for (let i = 0; i < 40; i++) { if (await alive(500)) return; await new Promise((r) => setTimeout(r, 250)); }
      throw new Error('Овервойс не отвечает после запуска');
    } finally { starting = null; }
  })();
  return starting;
}

/** Остановить: сначала просим Овервойс выключить движок и закрыться, затем добиваем процесс. */
function stop() {
  return new Promise((resolve) => {
    const done = () => { const c = child; child = null; if (c && c.exitCode === null) { try { if (process.platform === 'win32') execFile('taskkill', ['/PID', String(c.pid), '/T', '/F'], { windowsHide: true }, () => resolve()); else { c.kill(); resolve(); } } catch (e) { resolve(); } } else resolve(); };
    const req = http.request({ host: '127.0.0.1', port: cfg.port, path: '/api/shutdown', method: 'POST', headers: { 'X-Overvoice': '1', 'Content-Length': 0 }, timeout: 1500 }, (res) => { res.resume(); setTimeout(done, 700); });
    req.on('timeout', () => { req.destroy(); done(); }); req.on('error', done); req.end();
  });
}

/** Вызывается при старте Overdeck: если мод стоит и автозапуск включён, поднимает Овервойс. */
function autostart() { if (cfg.autostart && installed()) return start().catch((e) => console.warn('[Овервойс]', e.message)); return Promise.resolve(); }
/** Синхронная остановка при выходе Overdeck: процесс, запущенный нами, закрывается вместе с ним. */
function stopSync() {
  const c = child; child = null;
  if (!c || c.exitCode !== null) return;
  try { if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { windowsHide: true }); else c.kill(); } catch (e) { /* закрываемся */ }
}
module.exports = { init, state, start, stop, stopSync, autostart, update, getSettings };
