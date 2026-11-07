// history.js — история изменений: тихие снимки настроек каждые пару минут (только если что-то поменялось).
// Хранятся в backups/history/, последние 40. Формат тот же, что у ключа авторизации без пароля.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const keyBundle = require('./keyBundle');

const ROOT = __dirname;
const DIR = path.join(__dirname, 'backups', 'history');
const KEEP = 40;
const EVERY_MS = 2 * 60 * 1000;
let lastHash = '';

function hashNow() {
  const h = crypto.createHash('sha1');
  keyBundle.listFiles(false).forEach((rel) => {
    try { h.update(rel); h.update(fs.readFileSync(path.join(ROOT, rel))); } catch (e) { /* файл исчез */ }
  });
  return h.digest('hex');
}

function list() {
  try {
    return fs.readdirSync(DIR).filter((n) => /^h-\d+\.overdeckkey$/.test(n)).sort().reverse().map((n) => {
      const st = fs.statSync(path.join(DIR, n));
      return { name: n, at: Number(n.slice(2, -12)), bytes: st.size };
    });
  } catch (e) { return []; }
}

function snapshot(appVersion, force) {
  const hash = hashNow();
  if (!force && hash === lastHash) return null;
  fs.mkdirSync(DIR, { recursive: true });
  const r = keyBundle.create({ password: '', includeMedia: false, appVersion: appVersion || '' });
  const name = 'h-' + Date.now() + '.overdeckkey';
  const tmp = path.join(DIR, name + '.tmp');
  fs.writeFileSync(tmp, r.text);
  fs.renameSync(tmp, path.join(DIR, name));
  lastHash = hash;
  list().slice(KEEP).forEach((f) => { try { fs.unlinkSync(path.join(DIR, f.name)); } catch (e) { /* не страшно */ } });
  return { name, bytes: r.bytes };
}

function start(appVersion) {
  const tick = () => { try { snapshot(appVersion, false); } catch (e) { console.log('[История] не получилась:', e.message); } };
  setTimeout(tick, 15000);
  const t = setInterval(tick, EVERY_MS);
  if (t.unref) t.unref();
}

function read(name) {
  if (!/^h-\d+\.overdeckkey$/.test(String(name))) throw new Error('Нет такой точки.');
  return fs.readFileSync(path.join(DIR, name), 'utf8');
}

module.exports = { start, snapshot, list, read };
