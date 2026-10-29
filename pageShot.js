'use strict';
// Снимок страницы через установленный на ПК Chrome/Edge (без лишних зависимостей): запускаем браузер без окна,
// подключаемся по протоколу отладки (ws уже есть в проекте), ждём загрузки данных и снимаем кадр.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

function candidates() {
  if (process.env.OVERDECK_BROWSER) return [process.env.OVERDECK_BROWSER];
  const e = process.env;
  if (process.platform === 'win32') {
    const pf = [e['ProgramFiles'], e['ProgramFiles(x86)'], e['LOCALAPPDATA']].filter(Boolean);
    const out = [];
    pf.forEach((b) => { out.push(path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(b, 'Yandex', 'YandexBrowser', 'Application', 'browser.exe')); });
    return out;
  }
  if (process.platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
}
function findBrowser() { return candidates().find((p) => { try { return fs.statSync(p).isFile(); } catch (x) { return false; } }) || null; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** → Buffer (JPEG) или бросает ошибку. */
async function capture(url, { width = 1920, height = 1080, waitMs = 6000, quality = 85 } = {}) {
  const exe = findBrowser();
  if (!exe) throw new Error('Не найден Chrome или Edge для снимка страницы.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overdeck-shot-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    `--window-size=${width},${height}`, '--remote-allow-origins=*', '--disable-extensions', '--no-sandbox', 'about:blank'];
  const proc = spawn(exe, args, { stdio: 'ignore', windowsHide: true });
  let ws = null;
  const cleanup = () => { try { ws && ws.close(); } catch (x) {} try { proc.kill(); } catch (x) {} setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (x) {} }, 2000); };
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(500);
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = list.find((t) => t.type === 'page'); } catch (x) { /* браузер ещё запускается */ }
    }
    if (!target) throw new Error('Браузер для снимка не запустился.');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    let id = 0; const pending = new Map();
    ws.on('message', (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
    const call = (method, params) => new Promise((res, rej) => { const n = ++id; pending.set(n, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: n, method, params })); setTimeout(() => { if (pending.delete(n)) rej(new Error('Браузер не ответил.')); }, 30000); });
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url });
    await sleep(waitMs);
    const r = await call('Page.captureScreenshot', { format: 'jpeg', quality });
    return Buffer.from(r.data, 'base64');
  } finally { cleanup(); }
}

module.exports = { capture, findBrowser };
