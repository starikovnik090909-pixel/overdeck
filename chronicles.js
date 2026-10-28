// chronicles.js — «Хроники»: журнал пройденных игр и просмотренных фильмов.
// Записи лежат в chronicles.json (у каждого стримера свои, в репозиторий не попадают), постеры — в uploads/chronicles/.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_PATH = path.join(__dirname, 'chronicles.json');
const POSTERS_DIR = path.join(__dirname, 'uploads', 'chronicles');
const TYPES = ['game', 'movie'];
const MAX_ITEMS = 2000;

let items = [];

function str(v, max) { return String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max); }
function num(v, min, max) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : null;
}
function cleanLink(v) {
  const s = str(v, 500);
  return /^https?:\/\//i.test(s) ? s : '';
}
/** Постер — только файл из нашей папки (по имени), чужие пути и URL не принимаем. */
function cleanPoster(v) {
  const s = path.basename(str(v, 200));
  return s && /^[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(s) ? s : '';
}

function sanitize(raw, prev) {
  const r = raw || {};
  const p = prev || {};
  const has = (k) => r[k] !== undefined;
  const type = has('type') ? (TYPES.includes(r.type) ? r.type : p.type || 'movie') : (p.type || 'movie');
  const title = has('title') ? str(r.title, 200) : p.title || '';
  if (!title) return { error: 'Укажи название.' };
  let tags = has('tags') ? r.tags : p.tags;
  if (typeof tags === 'string') tags = tags.split(',');
  tags = (Array.isArray(tags) ? tags : []).map((t) => str(t, 30)).filter(Boolean).slice(0, 6);
  return {
    item: {
      id: p.id || crypto.randomBytes(6).toString('hex'),
      type,
      title,
      year: has('year') ? str(r.year, 30) : p.year || '',
      origin: has('origin') ? str(r.origin, 40) : p.origin || '',
      by: has('by') ? str(r.by, 60) : p.by || '',
      percent: has('percent') ? num(r.percent, 0, 100) : p.percent == null ? null : p.percent,
      rating: has('rating') ? num(r.rating, 0, 99) : p.rating == null ? null : p.rating,
      hours: type === 'game' ? (has('hours') ? num(r.hours, 0, 99999) : p.hours == null ? null : p.hours) : null,
      extra: has('extra') ? str(r.extra, 80) : p.extra || '',
      tags,
      comment: has('comment') ? str(r.comment, 4000) : p.comment || '',
      link: has('link') ? cleanLink(r.link) : p.link || '',
      poster: has('poster') ? cleanPoster(r.poster) : p.poster || '',
      addedAt: p.addedAt || Date.now(),
    },
  };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      const list = Array.isArray(raw) ? raw : raw.items;
      let fresh = false; // записи без id (например, подложенные файлом) получают id и сразу сохраняются
      items = (Array.isArray(list) ? list : []).map((it) => {
        if (!it.id) fresh = true;
        const r = sanitize(it, { id: it.id, addedAt: Number(it.addedAt) || Date.now() });
        return r.item;
      }).filter(Boolean).slice(0, MAX_ITEMS);
      if (fresh) persist();
    }
  } catch (e) { console.warn('[Хроники] Не удалось прочитать chronicles.json:', e.message); }
}
function persist() {
  try {
    const tmp = `${FILE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ items }, null, 2));
    fs.renameSync(tmp, FILE_PATH);
  } catch (e) { console.warn('[Хроники] Не удалось сохранить chronicles.json:', e.message); }
}

function init() { fs.mkdirSync(POSTERS_DIR, { recursive: true }); load(); }
function list() { return items.slice(); }

function removePosterFile(name) {
  if (!name) return;
  if (items.some((it) => it.poster === name)) return; // постером пользуется другая запись
  try { fs.unlinkSync(path.join(POSTERS_DIR, path.basename(name))); } catch (e) { /* файла уже нет */ }
}

/** Добавить (без id) или обновить (с id). → { ok, item } | { ok:false, error } */
function save(body) {
  const b = body || {};
  const idx = b.id ? items.findIndex((it) => it.id === b.id) : -1;
  if (b.id && idx < 0) return { ok: false, error: 'Запись не найдена.' };
  if (idx < 0 && items.length >= MAX_ITEMS) return { ok: false, error: 'Слишком много записей.' };
  const r = sanitize(b, idx >= 0 ? items[idx] : null);
  if (r.error) return { ok: false, error: r.error };
  if (idx >= 0) items[idx] = r.item; else items.unshift(r.item);
  persist();
  return { ok: true, item: r.item };
}

function setPoster(id, fileName) {
  const idx = items.findIndex((it) => it.id === id);
  if (idx < 0) return null;
  const old = items[idx].poster;
  items[idx] = { ...items[idx], poster: cleanPoster(fileName) };
  if (old && old !== items[idx].poster) removePosterFile(old);
  persist();
  return items[idx];
}

function remove(id) {
  const idx = items.findIndex((it) => it.id === id);
  if (idx < 0) return false;
  const [gone] = items.splice(idx, 1);
  persist();
  removePosterFile(gone.poster);
  return true;
}

/** Массовая вставка (импорт из таблицы). Дубли по типу+названию пропускаем. */
function importMany(list) {
  let added = 0; let skipped = 0;
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const r = sanitize(raw, null);
    if (r.error) { skipped += 1; return; }
    const key = (it) => `${it.type}|${it.title.toLowerCase()}`;
    if (items.some((it) => key(it) === key(r.item))) { skipped += 1; return; }
    if (raw.addedAt) r.item.addedAt = Number(raw.addedAt) || r.item.addedAt;
    items.push(r.item); added += 1;
  });
  if (added) persist();
  return { added, skipped };
}

module.exports = { init, list, save, setPoster, remove, importMany, POSTERS_DIR };
