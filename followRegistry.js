'use strict';
// Стена фолловеров: все фолловеры и даты фоллоу за всё время (follow_registry.json в корне проекта, в архив релиза не попадает).
// Новые добавляются по событию channel.follow, уже существующих можно подтянуть одним разом из Twitch API (syncFrom).

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'follow_registry.json');
let data = { followers: {}, syncedAt: 0 }; // followers: login → { n: ник, at: ISO-дата }
let sortedCache = null;

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      if (raw && typeof raw.followers === 'object' && raw.followers) data = { followers: raw.followers, syncedAt: Number(raw.syncedAt) || 0 };
    }
  } catch (e) {
    console.warn('[Фолловеры] Не удалось прочитать follow_registry.json, начинаем заново:', e.message);
    data = { followers: {}, syncedAt: 0 };
  }
}
function save() {
  try { fs.writeFileSync(FILE_PATH, JSON.stringify(data)); } catch (e) { console.warn('[Фолловеры] Не удалось сохранить follow_registry.json:', e.message); }
}
load();

const keyOf = (l) => String(l || '').toLowerCase().trim();
const validAt = (a) => { const t = Date.parse(a); return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(); };
function sorted() {
  if (!sortedCache) sortedCache = Object.entries(data.followers).sort((a, b) => (a[1].at < b[1].at ? -1 : a[1].at > b[1].at ? 1 : a[0] < b[0] ? -1 : 1));
  return sortedCache;
}
function count() { return Object.keys(data.followers).length; }

/** Добавляет фолловера; повторный фоллоу (отписался и вернулся) не плодит дубль. Возвращает { isNew, no }. */
function add(login, name, at) {
  const k = keyOf(login || name);
  if (!k) return { isNew: false, no: 0 };
  if (data.followers[k]) return { isNew: false, no: rankOf(k) };
  data.followers[k] = { n: String(name || login).slice(0, 40), at: validAt(at) };
  sortedCache = null; save();
  return { isNew: true, no: rankOf(k) };
}
function rankOf(k) { const i = sorted().findIndex((e) => e[0] === k); return i < 0 ? 0 : i + 1; }
const fmtDate = (iso) => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`; };

/** Последние n фолловеров (новые первыми), кроме excludeLogin: [{ n, d, no }]. */
function recent(n, excludeLogin) {
  const ex = keyOf(excludeLogin), all = sorted(), out = [];
  for (let i = all.length - 1; i >= 0 && out.length < n; i--) { if (all[i][0] === ex) continue; out.push({ n: all[i][1].n, d: fmtDate(all[i][1].at), no: i + 1 }); }
  return out;
}
function dateOf(login) { const r = data.followers[keyOf(login)]; return r ? fmtDate(r.at) : ''; }
function stats() { return { count: count(), syncedAt: data.syncedAt }; }

/** Подтягивает всех фолловеров постранично. fetchPage(cursor) → { items: [{ login, name, at }], cursor, total }. */
async function syncFrom(fetchPage) {
  let cursor = '', added = 0, twitchTotal = 0, guard = 0;
  do {
    const page = await fetchPage(cursor);
    twitchTotal = page.total || twitchTotal;
    (page.items || []).forEach((it) => { const k = keyOf(it.login || it.name); if (k && !data.followers[k]) { data.followers[k] = { n: String(it.name || it.login).slice(0, 40), at: validAt(it.at) }; added++; } });
    cursor = page.cursor || '';
  } while (cursor && ++guard < 2000);
  sortedCache = null; data.syncedAt = Date.now(); save();
  return { added, total: count(), twitchTotal };
}

module.exports = { add, recent, count, stats, dateOf, syncFrom, fmtDate };
