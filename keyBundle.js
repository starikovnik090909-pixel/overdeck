// keyBundle.js — «файл авторизации» (.overdeckkey): все личные данные и настройки оверлея в одном файле.
// Создаётся на одном ПК, открывается на другом (в пустом приложении) — всё подтягивается. Можно защитить паролем (AES-256-GCM).
// В файле лежат ключи Twitch/донатов и токены — храни его как пароль и никому не отправляй.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const FORMAT = 'overdeck-key';
const VERSION = 1;
const MAX_FILE = 300 * 1024 * 1024;

// корневые .json, которые НЕ входят в ключ (это часть самого приложения)
const ROOT_DENY = new Set(['stream_journal.json', 'package.json', 'package-lock.json', 'config.example.json', 'launcher.json']);
// папки с пользовательскими файлами; media=true — только по галочке «картинки и фоны»
const DIRS = [
  { dir: 'uploads', media: false },
  { dir: 'saved_brackets', media: false },
  { dir: 'fonts', media: false },
  { dir: 'backgrounds', media: true },
];

function isRootDataFile(name) {
  if (name.includes('/') || name.includes('\\')) return false;
  if (name === '.env') return true;
  return /\.json$/i.test(name) && !ROOT_DENY.has(name) && !/\.tmp$/i.test(name);
}

function allowedName(rel, includeMedia) {
  const n = rel.replace(/\\/g, '/');
  if (n.startsWith('/') || n.split('/').some((p) => p === '..' || p === '')) return false;
  if (!n.includes('/')) return isRootDataFile(n);
  const top = n.split('/')[0];
  const d = DIRS.find((x) => x.dir === top);
  return !!d && (includeMedia || !d.media);
}

function walk(absDir, relDir, out) {
  let list = [];
  try { list = fs.readdirSync(absDir, { withFileTypes: true }); } catch (e) { return; }
  list.forEach((e) => {
    const rel = relDir + '/' + e.name;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) walk(abs, rel, out);
    else if (e.isFile()) out.push(rel);
  });
}

/** Список файлов, которые попадут в ключ. */
function listFiles(includeMedia) {
  const out = [];
  try {
    fs.readdirSync(ROOT, { withFileTypes: true }).forEach((e) => {
      if (e.isFile() && (isRootDataFile(e.name) || e.name === 'config.json')) out.push(e.name);
    });
  } catch (e) { /* нет — пусто */ }
  DIRS.forEach((d) => { if (includeMedia || !d.media) walk(path.join(ROOT, d.dir), d.dir, out); });
  return out.filter((r) => { try { return fs.statSync(path.join(ROOT, r)).size <= MAX_FILE; } catch (e) { return false; } });
}

function encrypt(buf, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(buf), c.final()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function decrypt(env, password) {
  const key = crypto.scryptSync(String(password || ''), Buffer.from(env.salt, 'base64'), 32);
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  d.setAuthTag(Buffer.from(env.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(env.data, 'base64')), d.final()]);
}

/** Собирает файл ключа. Возвращает { text, count, bytes }. */
function create({ password, includeMedia, appVersion }) {
  const files = {};
  const names = listFiles(!!includeMedia);
  names.forEach((rel) => { files[rel] = fs.readFileSync(path.join(ROOT, rel)).toString('base64'); });
  const inner = Buffer.from(JSON.stringify({ created: new Date().toISOString(), appVersion: appVersion || '', files }), 'utf8');
  const doc = { format: FORMAT, v: VERSION };
  if (password) Object.assign(doc, { encrypted: true }, encrypt(inner, password));
  else Object.assign(doc, { encrypted: false, data: inner.toString('base64') });
  const text = JSON.stringify(doc);
  return { text, count: names.length, bytes: Buffer.byteLength(text) };
}

/** Разбирает файл ключа. Бросает Error с понятным текстом. */
function open(text, password) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error('Это не файл авторизации (не читается).'); }
  if (!doc || doc.format !== FORMAT) throw new Error('Это не файл авторизации Overdeck.');
  if (doc.v > VERSION) throw new Error('Файл создан более новой версией Overdeck — обнови оверлей.');
  let buf;
  if (doc.encrypted) {
    if (!password) { const e = new Error('Файл защищён паролем.'); e.needPassword = true; throw e; }
    try { buf = decrypt(doc, password); } catch (e) { const er = new Error('Неверный пароль.'); er.needPassword = true; throw er; }
  } else buf = Buffer.from(doc.data, 'base64');
  let inner;
  try { inner = JSON.parse(buf.toString('utf8')); } catch (e) { throw new Error('Файл повреждён.'); }
  return inner;
}

/** Краткое описание содержимого (без записи на диск). */
function summarize(inner) {
  const names = Object.keys(inner.files || {});
  let channel = '';
  try { channel = JSON.parse(Buffer.from(inner.files['config.json'], 'base64').toString('utf8')).channel || ''; } catch (e) { /* нет */ }
  return { created: inner.created, appVersion: inner.appVersion, count: names.length, channel, hasMedia: names.some((n) => n.startsWith('backgrounds/')) };
}

/** Записывает файлы на диск. Старые корневые файлы перед заменой копируются в backup_before_import/<время>/. */
function apply(inner) {
  const names = Object.keys(inner.files || {});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(ROOT, 'backup_before_import', stamp);
  let written = 0;
  let skipped = 0;
  names.forEach((rel) => {
    if (!allowedName(rel, true) && rel !== 'config.json') { skipped++; return; }
    const abs = path.join(ROOT, rel);
    if (!abs.startsWith(ROOT + path.sep)) { skipped++; return; }
    try {
      if (fs.existsSync(abs) && !rel.includes('/')) {
        fs.mkdirSync(backupDir, { recursive: true });
        fs.copyFileSync(abs, path.join(backupDir, rel));
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const tmp = abs + '.import.tmp';
      fs.writeFileSync(tmp, Buffer.from(inner.files[rel], 'base64'));
      fs.renameSync(tmp, abs);
      written++;
    } catch (e) { skipped++; }
  });
  return { written, skipped, backup: fs.existsSync(backupDir) ? path.relative(ROOT, backupDir) : '' };
}

module.exports = { create, open, summarize, apply, listFiles };
