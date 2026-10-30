// backupAuto.js — автокопия настроек раз в сутки в папку backups/ (последние 7).
// Это тот же формат, что у «Ключа авторизации» (.overdeckkey), только без пароля и без картинок трансляции.
// Открывается обычной кнопкой «Открыть файл авторизации». Папка лежит рядом с приложением, туда же, где и сами данные.

const fs = require('fs');
const path = require('path');
const keyBundle = require('./keyBundle');

const DIR = path.join(__dirname, 'backups');
const KEEP = 7;
const PREFIX = 'auto-';

function stamp(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }

function list() {
  try {
    return fs.readdirSync(DIR).filter((n) => n.startsWith(PREFIX) && n.endsWith('.overdeckkey')).sort().reverse().map((n) => {
      const st = fs.statSync(path.join(DIR, n));
      return { name: n, bytes: st.size, at: st.mtimeMs };
    });
  } catch (e) { return []; }
}

/** Делает копию (одна в сутки, повторный вызов в тот же день перезаписывает файл). Возвращает { name, count, bytes }. */
function run(appVersion) {
  fs.mkdirSync(DIR, { recursive: true });
  const r = keyBundle.create({ password: '', includeMedia: false, appVersion: appVersion || '' });
  const name = PREFIX + stamp(new Date()) + '.overdeckkey';
  const tmp = path.join(DIR, name + '.tmp');
  fs.writeFileSync(tmp, r.text);
  fs.renameSync(tmp, path.join(DIR, name));
  list().slice(KEEP).forEach((f) => { try { fs.unlinkSync(path.join(DIR, f.name)); } catch (e) { /* не страшно */ } });
  return { name, count: r.count, bytes: r.bytes };
}

/** Старт: если сегодня копии ещё нет, делает её через минуту после запуска; потом проверяет раз в 6 часов. */
function start(appVersion) {
  const tick = () => {
    try {
      const today = PREFIX + stamp(new Date()) + '.overdeckkey';
      if (!list().some((f) => f.name === today)) { const r = run(appVersion); console.log('[Автокопия] ' + r.name + ': файлов ' + r.count); }
    } catch (e) { console.log('[Автокопия] не получилась:', e.message); }
  };
  setTimeout(tick, 60000);
  const t = setInterval(tick, 6 * 3600 * 1000);
  if (t.unref) t.unref();
}

module.exports = { start, run, list, DIR };
