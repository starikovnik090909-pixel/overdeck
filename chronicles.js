// chronicles.js — «Хроники»: журнал пройденных игр и просмотренных фильмов.
// Записи лежат в chronicles.json (у каждого стримера свои, в репозиторий не попадают), постеры — в uploads/chronicles/.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_PATH = path.join(__dirname, 'chronicles.json');
const events = new (require('events'))();
const POSTERS_DIR = path.join(__dirname, 'uploads', 'chronicles');
const TYPES = ['game', 'movie'];
const MAX_ITEMS = 2000;

let items = [];
let sources = {}; // { game|movie: { url, mapping, reverse, at } } — подключённые таблицы для синхронизации

function str(v, max) { return String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max); }
function num(v, min, max) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : null;
}
/** Оценка в звёздах: 0..10 с шагом 0.5. */
function stars(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n * 2) / 2)) : null;
}
function strList(v, max, len) {
  const arr = typeof v === 'string' ? v.split(',') : v;
  return (Array.isArray(arr) ? arr : []).map((t) => str(t, len)).filter(Boolean).slice(0, max);
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
  const tags = strList(has('tags') ? r.tags : p.tags, 6, 30);
  const genres = strList(has('genres') ? r.genres : p.genres, 6, 30);
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
      genres,
      chatRating: has('chatRating') ? stars(r.chatRating) : p.chatRating == null ? null : p.chatRating,
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
      if (raw && raw.sources && typeof raw.sources === 'object') sources = raw.sources;
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
    fs.writeFileSync(tmp, JSON.stringify({ items, sources }, null, 2));
    fs.renameSync(tmp, FILE_PATH);
    events.emit('change');
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

/** Массовая вставка (импорт из таблицы). Дубли по типу+названию пропускаем. reverse — в таблице новые записи внизу. */
function importMany(list, reverse) {
  const added = []; let skipped = 0;
  const key = (it) => `${it.type}|${it.title.toLowerCase()}`;
  const seen = new Set(items.map(key));
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const r = sanitize(raw, null);
    if (r.error || seen.has(key(r.item))) { skipped += 1; return; }
    if (items.length + added.length >= MAX_ITEMS) { skipped += 1; return; }
    seen.add(key(r.item));
    if (raw.addedAt) r.item.addedAt = Number(raw.addedAt) || r.item.addedAt;
    r.item._posterUrl = cleanLink(raw.posterUrl);
    added.push(r.item);
  });
  if (added.length) {
    const ordered = reverse ? added.slice().reverse() : added;
    const posters = ordered.filter((it) => it._posterUrl).map((it) => ({ id: it.id, url: it._posterUrl }));
    ordered.forEach((it) => { delete it._posterUrl; });
    items = reverse ? ordered.concat(items) : items.concat(ordered);
    persist();
    queuePosters(posters);
    return { added: added.length, skipped, posters: posters.length };
  }
  return { added: 0, skipped, posters: 0 };
}

/* ---------- Обложки по ссылке ---------- */
async function downloadPoster(urlStr) {
  const u = new URL(String(urlStr || '').trim());
  const host = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/.test(host)) {
    throw new Error('Нужна обычная ссылка на картинку (http/https).');
  }
  const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 Overdeck' } });
  const type = String(r.headers.get('content-type') || '').toLowerCase();
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('jpeg') || type.includes('jpg') ? '.jpg' : '';
  if (!r.ok || !ext) throw new Error('По ссылке не картинка (PNG, JPG или WebP).');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error('Картинка больше 8 МБ.');
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  fs.writeFileSync(path.join(POSTERS_DIR, name), buf);
  return name;
}
const posterQueue = []; let posterRunning = false;
function queuePosters(list) {
  posterQueue.push(...list);
  if (posterRunning) return;
  posterRunning = true;
  (async () => {
    while (posterQueue.length) {
      const { id, url } = posterQueue.shift();
      try {
        const f = await downloadPoster(url);
        if (!setPoster(id, f)) { try { fs.unlinkSync(path.join(POSTERS_DIR, f)); } catch (e) { /* уже нет */ } }
      } catch (e) { /* обложка не скачалась — запись остаётся без неё */ }
    }
    posterRunning = false;
  })();
}

/* ---------- Подключение таблицы (CSV / JSON / Google Таблицы) ---------- */
const HEADS = {
  title: ['название', 'фильм', 'игра', 'фильмы', 'игры', 'name', 'title', 'movie', 'game'],
  year: ['год', 'year', 'год выхода'],
  genres: ['жанр', 'жанры', 'genre', 'genres'],
  rating: ['оценка', 'моя оценка', 'рейтинг', 'rating', 'score', 'оценка стримера'],
  chatRating: ['оценка чата', 'чат', 'рейтинг чата', 'chat rating'],
  comment: ['рецензия', 'комментарий', 'комментарии', 'отзыв', 'мнение', 'review', 'comment', 'notes'],
  by: ['заказал', 'кто заказал', 'заказчик', 'ник', 'by'],
  percent: ['лот', 'лот %', 'лот, %', 'процент', '%'],
  hours: ['часы', 'часов', 'время', 'наиграно', 'hours'],
  origin: ['источник', 'откуда', 'origin', 'source'],
  link: ['ссылка', 'запись', 'запись стрима', 'vod', 'link'],
  poster: ['постер', 'обложка', 'картинка', 'poster', 'cover', 'image'],
  extra: ['пометка', 'заметка', 'extra'],
  tags: ['теги', 'тег', 'tags'],
};
const FIELD_LABELS = { title: 'Название', year: 'Год', genres: 'Жанры', rating: 'Моя оценка', chatRating: 'Оценка чата', comment: 'Рецензия', by: 'Заказал', percent: 'Лот, %', hours: 'Часы', origin: 'Источник', link: 'Ссылка на запись', poster: 'Обложка (ссылка)', extra: 'Пометка', tags: 'Теги' };

function parseCsv(text) {
  const t = String(text || '').replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}
function parseTable(text) {
  const t = String(text || '').trim();
  if (/^[[{]/.test(t)) {
    const j = JSON.parse(t);
    const arr = Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : []);
    const heads = [...new Set(arr.flatMap((o) => Object.keys(o || {})))];
    return { headers: heads, rows: arr.map((o) => heads.map((h) => (o && o[h] != null ? (Array.isArray(o[h]) ? o[h].join(', ') : String(o[h])) : ''))) };
  }
  const rows = parseCsv(t);
  if (!rows.length) return { headers: [], rows: [] };
  const norm = (v) => String(v || '').trim().toLowerCase();
  const known = new Set(Object.values(HEADS).flat());
  let h = rows.slice(0, 6).findIndex((r) => r.some((c) => HEADS.title.includes(norm(c))) && r.filter((c) => known.has(norm(c))).length >= 1);
  if (h < 0) { // таблица без шапки: все строки — данные
    const w = Math.max(...rows.map((r) => r.length));
    return { headers: Array.from({ length: w }, (_, i) => `Колонка ${i + 1}`), rows, headless: true };
  }
  const headers = rows[h].map((c, i) => String(c).trim() || `Колонка ${i + 1}`);
  return { headers, rows: rows.slice(h + 1) };
}
function autoMap(headers) {
  const map = {}; const used = new Set();
  Object.keys(HEADS).forEach((f) => {
    const i = headers.findIndex((h, idx) => !used.has(idx) && HEADS[f].includes(String(h).trim().toLowerCase()));
    if (i >= 0) { map[f] = headers[i]; used.add(i); }
  });
  return map;
}
/** Таблица без шапки: угадываем колонки по содержимому (Респект/Аукцион, «55.8% 8/10», ссылки, длинный текст). */
function guessMap(table) {
  const n = table.headers.length; const rows = table.rows.slice(0, 60); const map = {};
  const col = (i) => rows.map((r) => String(r[i] == null ? '' : r[i]).trim()).filter(Boolean);
  const share = (i, re) => { const c = col(i); return c.length ? c.filter((v) => re.test(v)).length / c.length : 0; };
  const find = (re, min) => { let best = -1; let bs = 0; for (let i = 0; i < n; i += 1) { const x = share(i, re); if (x > bs && x >= min) { best = i; bs = x; } } return best; };
  const o = find(/^(респект|аукцион)$/i, 0.6); const sc = find(/\d\s*\/\s*10/, 0.5); const lk = find(/^https?:\/\//i, 0.5);
  let t = -1; { let bs = 0; for (let i = 0; i < n; i += 1) { if (i === o || i === sc || i === lk) continue; const c = col(i); if (!c.length) continue; const avg = c.reduce((a, v) => a + v.length, 0) / c.length; const hasYear = share(i, /\(\d{4}/) ; const k = hasYear * 100 + (avg < 120 ? avg : 0); if (k > bs) { bs = k; t = i; } } }
  let cm = -1; { let bs = 0; for (let i = 0; i < n; i += 1) { if ([o, sc, lk, t].includes(i)) continue; const c = col(i); const avg = c.length ? c.reduce((a, v) => a + v.length, 0) / c.length : 0; if (avg > bs && avg > 40) { bs = avg; cm = i; } } }
  const by = (() => { for (let i = 0; i < n; i += 1) { if ([o, sc, lk, t, cm].includes(i)) continue; if (col(i).length) return i; } return -1; })();
  const H = (i) => table.headers[i];
  if (t >= 0) map.title = H(t); if (o >= 0) map.origin = H(o); if (by >= 0) map.by = H(by);
  if (sc >= 0) { map.rating = H(sc); map.percent = H(sc); } if (cm >= 0) map.comment = H(cm); if (lk >= 0) map.link = H(lk);
  return map;
}
/** Из «55.8% 8/10» достаём оценку (перед /10) и процент лота. */
function ratingFrom(v) { const m = String(v == null ? '' : v).match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*10/); return m ? Number(m[1].replace(',', '.')) : numFrom(v); }
function percentFrom(v) { const m = String(v == null ? '' : v).match(/(-?\d+(?:[.,]\d+)?)\s*%/); return m ? Number(m[1].replace(',', '.')) : (/\//.test(String(v)) ? null : numFrom(v)); }
function numFrom(v) { const m = String(v == null ? '' : v).match(/-?\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : null; }
function toRaw(table, mapping, type) {
  const idx = {};
  Object.keys(mapping || {}).forEach((f) => { const i = table.headers.indexOf(mapping[f]); if (i >= 0) idx[f] = i; });
  if (idx.title == null) return [];
  const get = (r, f) => (idx[f] == null ? '' : String(r[idx[f]] == null ? '' : r[idx[f]]).trim());
  return table.rows.map((r) => {
    const o = { type, title: get(r, 'title') };
    ['year', 'by', 'origin', 'extra', 'comment', 'link'].forEach((f) => { o[f] = get(r, f); });
    o.genres = get(r, 'genres').replace(/[;/|]/g, ',');
    o.tags = get(r, 'tags').replace(/[;/|]/g, ',');
    const cl = (v) => { const n = numFrom(v); return n == null ? '' : Math.min(10, Math.max(0, n)); };
    o.rating = (() => { const n = ratingFrom(get(r, 'rating')); return n == null ? '' : Math.min(10, Math.max(0, n)); })(); o.chatRating = cl(get(r, 'chatRating'));
    const pc = percentFrom(get(r, 'percent')); o.percent = pc == null ? '' : pc;
    const hr = numFrom(get(r, 'hours')); o.hours = hr == null ? '' : hr;
    o.posterUrl = get(r, 'poster');
    return o;
  }).filter((o) => o.title);
}

const cache = new Map(); // token → { table, at }
function remember(table) {
  const now = Date.now();
  [...cache.keys()].forEach((k) => { if (now - cache.get(k).at > 30 * 60 * 1000) cache.delete(k); });
  const token = crypto.randomBytes(8).toString('hex');
  cache.set(token, { table, at: now });
  return token;
}
function previewTable(text) {
  let table;
  try { table = parseTable(text); } catch (e) { return { error: 'Не удалось прочитать файл. Нужен CSV или JSON.' }; }
  if (!table.headers.length || !table.rows.length) return { error: 'В файле нет строк с данными.' };
  let mapping = autoMap(table.headers);
  if (!mapping.title && table.headless) mapping = guessMap(table);
  return { token: remember(table), headers: table.headers, mapping, total: table.rows.length, sample: table.rows.slice(0, 3), labels: FIELD_LABELS };
}
function sheetCsvUrl(link) {
  let u; try { u = new URL(String(link || '').trim()); } catch (e) { return ''; }
  if (u.hostname !== 'docs.google.com') return '';
  const m = u.pathname.match(/\/spreadsheets\/d\/([\w-]+)/); if (!m) return '';
  const g = (u.hash + u.search).match(/gid=(\d+)/);
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${g ? g[1] : '0'}`;
}
async function fetchSheet(link) {
  const url = sheetCsvUrl(link);
  if (!url) throw new Error('Нужна ссылка на Google Таблицу (docs.google.com/spreadsheets/…).');
  let r;
  try { r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 Overdeck' } }); }
  catch (e) { throw new Error('Не удалось открыть таблицу: нет связи с Google.'); }
  const text = await r.text();
  if (!r.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error('Таблица закрыта. Открой доступ: «Поделиться» → «Все, у кого есть ссылка» → «Читатель».');
  return text;
}
function applyImport(table, type, mapping, reverse) {
  if (!TYPES.includes(type)) return { error: 'Выбери: игры или фильмы.' };
  if (!mapping || !mapping.title) return { error: 'Укажи колонку с названием.' };
  const raw = toRaw(table, mapping, type);
  if (!raw.length) return { error: 'Не нашёл ни одной записи. Проверь колонку «Название».' };
  return { ...importMany(raw, reverse), total: raw.length };
}
function importPreviewed(token, type, mapping, reverse, url) {
  const c = cache.get(token);
  if (!c) return { error: 'Предпросмотр устарел, загрузи файл заново.' };
  const r = applyImport(c.table, type, mapping, !!reverse);
  if (r.error) return r;
  if (url) { sources[type] = { url, mapping, reverse: !!reverse, at: Date.now() }; persist(); }
  cache.delete(token);
  return r;
}
async function sync(type) {
  const src = sources[type];
  if (!src) return { error: 'Таблица не подключена.' };
  const text = await fetchSheet(src.url);
  const table = parseTable(text);
  const r = applyImport(table, type, src.mapping, src.reverse);
  if (r.error) return r;
  src.at = Date.now(); persist();
  return r;
}
function forgetSource(type) { delete sources[type]; persist(); }
function sourcesInfo() { const o = {}; Object.keys(sources).forEach((k) => { o[k] = { url: sources[k].url, at: sources[k].at }; }); return o; }

module.exports = { init, list, save, setPoster, remove, importMany, downloadPoster, previewTable, fetchSheet, importPreviewed, sync, forgetSource, sourcesInfo, POSTERS_DIR, events };
