// routes/faceswap.js — мод «Замена лица»: запуск локального движка (modules/faceswap/worker.py), загрузка фото, поток для OBS.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFile } = require('child_process');
const multer = require('multer');

const MOD = path.join(__dirname, '..', 'modules', 'faceswap');
const PORT = 5177;
const isWin = process.platform === 'win32';
const STATUS = path.join(MOD, 'install_status.json');
const RT_PY = isWin ? path.join(MOD, 'runtime', 'python.exe') : path.join(MOD, 'runtime', 'bin', 'python');

function main({ app, dataDir }) {
  const dir = dataDir || path.join(__dirname, '..');
  const SETTINGS = path.join(dir, 'faceswap_settings.json');
  const SOURCE = path.join(dir, 'faceswap_source.jpg');        // старый путь: одно фото (переносится в папку)
  const SRC_DIR = path.join(dir, 'faceswap_sources');
  const MAX_PHOTOS = 12;
  const photos = () => { try { return fs.readdirSync(SRC_DIR).filter((f) => /^p\d+\.jpg$/.test(f)).sort(); } catch (e) { return []; } };
  try { fs.mkdirSync(SRC_DIR, { recursive: true }); if (fs.existsSync(SOURCE) && !photos().length) fs.copyFileSync(SOURCE, path.join(SRC_DIR, 'p1.jpg')); } catch (e) { /* без фото */ }
  let worker = null, log = [], lastErr = '';
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

  const read = () => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (e) { return {}; } };
  const write = (o) => { try { fs.writeFileSync(SETTINGS, JSON.stringify(o, null, 2)); } catch (e) {} };
  const pythonPath = () => (process.env.FACESWAP_PY || (fs.existsSync(RT_PY) ? RT_PY : ''));
  const readInstall = () => {
    try {
      const o = JSON.parse(fs.readFileSync(STATUS, 'utf8').replace(/^\uFEFF/, ''));
      o.running = !o.done && !o.error && o.step > 0 && (Math.floor(Date.now() / 1000) - o.ts) < 120;
      o.elapsed = Math.max(0, Math.floor(Date.now() / 1000) - (o.started || o.ts));
      return o;
    } catch (e) { return null; }
  };
  const installed = () => !!process.env.FACESWAP_PY || !!(readInstall() && readInstall().done && fs.existsSync(RT_PY));
  const addLog = (s) => { log.push(String(s).trim()); if (log.length > 60) log.shift(); };

  function call(method, p, body, ct) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, timeout: 10000,
        headers: body ? { 'Content-Type': ct || 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, (r) => {
        let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({}); } });
      });
      req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout')));
      if (body) req.write(body); req.end();
    });
  }

  const cfgOf = (st) => ({ swap: st.swap !== false, mirror: !!st.mirror, blend: st.blend == null ? 1 : +st.blend, camera: st.camera || 0,
    model: ['fast', 'hyper', 'hyper_b', 'hyper_c'].includes(st.model) ? st.model : 'hyper', mouth: st.mouth == null ? 0.9 : +st.mouth,
    enhance: !!st.enhance, enh: st.enh == null ? 0.8 : +st.enh, window: !!st.window, vcam: !!st.vcam });

  function start() {
    if (worker) return true;
    const py = pythonPath();
    if (!py) return false;
    lastErr = '';
    const args = [path.join(MOD, 'worker.py'), '--port', String(PORT), '--models', path.join(MOD, 'models')];
    if (photos().length) args.push('--sources', SRC_DIR);
    const st = read();
    if (st.camera != null) args.push('--camera', String(st.camera));
    if (st.demo) args.push('--demo');
    args.push('--cfg', JSON.stringify(cfgOf(st)));
    worker = spawn(py, args, { cwd: MOD, windowsHide: true });
    worker.stdout.on('data', (d) => addLog(d));
    worker.stderr.on('data', (d) => addLog(d));   // предупреждения MediaPipe и т.п. — не ошибки, только в журнал
    const me = worker;
    me.on('exit', (code) => {
      if (worker === me) worker = null;
      if (code && !me.__stopped) {
        const bad = log.slice().reverse().join('\n').split('\n').find((l) => /(Error|Exception)\b/.test(l));
        lastErr = (bad || ('Движок завершился с кодом ' + code)).trim();
      }
    });
    worker.on('error', (e) => { lastErr = e.message; worker = null; });
    return true;
  }
  function stop() { if (worker) { worker.__stopped = true; try { worker.kill(); } catch (e) {} worker = null; } }
  process.on('exit', stop);

  app.get('/api/faceswap/state', async (req, res) => {
    const st = read();
    let w = null;
    if (worker) { try { w = await call('GET', '/status'); } catch (e) { w = { state: 'start', msg: 'Запускаю движок…' }; } }
    res.json({ success: true, installed: installed(), install: readInstall(), running: !!worker,
      consent: !!st.consent, hasSource: photos().length > 0, photos: photos().length, settings: st, worker: w, error: lastErr, log: log.slice(-12) });
  });

  app.post('/api/faceswap/settings', (req, res) => {
    const st = Object.assign(read(), req.body || {});
    write(st);
    if (worker && req.body) call('POST', '/config', JSON.stringify(cfgOf(st))).catch(() => {});
    res.json({ success: true, settings: st });
  });

  const reload = () => { if (worker) call('POST', '/reload', '{}').catch(() => {}); };
  app.post('/api/faceswap/source', upload.array('photo', MAX_PHOTOS), (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, error: 'Нет файла' });
    let n = photos().reduce((m, f) => Math.max(m, parseInt(f.slice(1), 10) || 0), 0), added = 0;
    for (const f of files) {
      if (photos().length >= MAX_PHOTOS) break;
      fs.writeFileSync(path.join(SRC_DIR, 'p' + (++n) + '.jpg'), f.buffer); added++;
    }
    reload();
    res.json({ success: true, added, total: photos().length, max: MAX_PHOTOS });
  });
  app.get('/api/faceswap/sources', (req, res) => res.json({ success: true, items: photos().map((f) => f.slice(1, -4)), max: MAX_PHOTOS }));
  app.get('/api/faceswap/source/:id.jpg', (req, res) => {
    const f = path.join(SRC_DIR, 'p' + String(req.params.id).replace(/\D/g, '') + '.jpg');
    fs.existsSync(f) ? res.sendFile(f) : res.status(404).end();
  });
  app.post('/api/faceswap/source/:id/delete', (req, res) => {
    const f = path.join(SRC_DIR, 'p' + String(req.params.id).replace(/\D/g, '') + '.jpg');
    try { fs.unlinkSync(f); } catch (e) { /* уже нет */ }
    try { if (!photos().length && fs.existsSync(SOURCE)) fs.unlinkSync(SOURCE); } catch (e) { /* ok */ }
    reload(); res.json({ success: true, total: photos().length });
  });
  app.get('/api/faceswap/source.jpg', (req, res) => { const p = photos()[0]; p ? res.sendFile(path.join(SRC_DIR, p)) : res.status(404).end(); });

  app.post('/api/faceswap/start', (req, res) => {
    if (!read().consent) return res.status(400).json({ success: false, error: 'Сначала подтверди условия: лицо своё или с разрешения человека.' });
    if (!installed()) return res.status(400).json({ success: false, error: 'Мод не установлен.' });
    start(); res.json({ success: true });
  });
  app.post('/api/faceswap/stop', (req, res) => { stop(); res.json({ success: true }); });

  app.post('/api/faceswap/install', (req, res) => {
    const cur = readInstall();
    if (cur && cur.running) return res.json({ success: true, already: true });
    if (!isWin) return res.status(400).json({ success: false, error: 'Установщик рассчитан на Windows. Для разработки задай FACESWAP_PY.' });
    try { fs.unlinkSync(STATUS); } catch (e) {}
    const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(MOD, 'install.ps1')],
      { cwd: MOD, windowsHide: true, detached: true, stdio: 'ignore' });
    p.on('error', (e) => { lastErr = e.message; });
    p.unref();
    res.json({ success: true });
  });
  app.post('/api/faceswap/install/cancel', (req, res) => {
    const cur = readInstall();
    if (cur && cur.running && cur.pid && isWin) {
      execFile('taskkill', ['/PID', String(cur.pid), '/T', '/F'], () => {
        try { fs.writeFileSync(STATUS, JSON.stringify(Object.assign(cur, { running: undefined, error: 'Установка отменена', pct: 0 }))); } catch (e) {}
      });
    }
    res.json({ success: true });
  });

  // поток для OBS и превью: перекладываем MJPEG из движка
  app.get('/api/faceswap/stream', (req, res) => {
    if (!worker) return res.status(503).end('движок не запущен');
    const r = http.get({ host: '127.0.0.1', port: PORT, path: '/stream' }, (up) => {
      res.writeHead(200, { 'Content-Type': up.headers['content-type'], 'Cache-Control': 'no-store' });
      up.pipe(res);
      req.on('close', () => up.destroy());
    });
    r.on('error', () => res.end());
  });

  if (read().autostart && read().consent && installed()) setTimeout(start, 3000);
}

module.exports = { main };
