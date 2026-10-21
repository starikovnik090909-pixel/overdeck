// awards.js — награды (медали) в профиле игрока и события, по итогам которых они выдаются.
//
// Событие: стример вводит название, описание и иконку награды и запускает его на N минут. Награду получают все, кто был в чате во время события:
// написал сообщение (или участвовал в голосовании) в окне события либо был «в чате» перед стартом (писал в последние PRESENT_BEFORE_MS).
// Молчаливых зрителей без подключения к Twitch по API сервер увидеть не может — это ограничение, а не ошибка.
//
// Хранение: awards.json — каталог наград, выдачи (login -> [id награды]), текущее событие и короткий журнал.
// Модуль не зависит от pixelHeroes: нужные данные приходят через deps.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'awards.json');
const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
const TITLE_MAX = 40, DESC_MAX = 200, HOWTO_MAX = 160, ICON_MAX = 8000, ICON_SMALL_MAX = 3000, MAX_AWARDS = 60, MAX_LOG = 30;
const DURATION_MIN = 1, DURATION_MAX = 240;
const PRESENT_BEFORE_MS = 20 * 60 * 1000;
const ICON_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const clean = (s, n) => String(s == null ? '' : s).replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, n);

function createAwards(deps = {}) {
  const file = deps.file === undefined ? FILE : deps.file;
  const now = deps.now || (() => Date.now());
  const recentLogins = typeof deps.recentLogins === 'function' ? deps.recentLogins : () => [];   // (sinceMs) -> [login]
  const hasProfile = typeof deps.hasProfile === 'function' ? deps.hasProfile : () => true;

  let awards = new Map();       // id -> { id, title, description, icon, createdAt }
  let grants = new Map();       // login -> [awardId]
  let event = null;             // { awardId, durationMin, startedAt, endsAt, participants: Set }
  let log = [];                 // [{ awardId, title, at, count, how }]
  let counter = 0;

  function load() {
    if (!file) return;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      (Array.isArray(raw.awards) ? raw.awards : []).forEach((a) => {
        const v = validAward(a); if (v && /^a[0-9a-z]{1,8}$/.test(String(a.id))) awards.set(a.id, { id: a.id, ...v, available: a.available !== false, issuedAt: Number.isFinite(a.issuedAt) ? a.issuedAt : 0, createdAt: Number.isFinite(a.createdAt) ? a.createdAt : 0 });
      });
      if (raw.grants && typeof raw.grants === 'object') for (const [k, v] of Object.entries(raw.grants)) {
        if (!LOGIN_RE.test(k) || !Array.isArray(v)) continue;
        const ids = [...new Set(v.filter((id) => awards.has(id)))]; if (ids.length) grants.set(k, ids);
      }
      if (raw.event && awards.has(raw.event.awardId) && Number.isFinite(raw.event.endsAt) && Number.isFinite(raw.event.startedAt)) {
        event = { awardId: raw.event.awardId, durationMin: raw.event.durationMin, startedAt: raw.event.startedAt, endsAt: raw.event.endsAt, participants: new Set((raw.event.participants || []).filter((l) => LOGIN_RE.test(l))) };
      }
      if (Array.isArray(raw.log)) log = raw.log.slice(0, MAX_LOG);
      counter = Number.isInteger(raw.counter) ? raw.counter : awards.size;
    } catch (e) { /* файла нет или он повреждён — всё с нуля */ }
  }
  function save() {
    if (!file) return;
    try {
      const data = {
        counter, awards: [...awards.values()], grants: Object.fromEntries(grants), log,
        event: event ? { awardId: event.awardId, durationMin: event.durationMin, startedAt: event.startedAt, endsAt: event.endsAt, participants: [...event.participants] } : null,
      };
      fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file);
    } catch (e) { console.warn('[Награды] Не удалось сохранить:', e.message); }
  }
  load();

  function validAward(a) {
    if (!a || typeof a !== 'object') return null;
    const title = clean(a.title, TITLE_MAX); if (!title) return null;
    const description = clean(a.description, DESC_MAX);
    let icon = '', iconSmall = '';
    if (a.icon) { if (typeof a.icon !== 'string' || a.icon.length > ICON_MAX || !ICON_RE.test(a.icon)) return null; icon = a.icon; }
    if (a.iconSmall) { if (typeof a.iconSmall !== 'string' || a.iconSmall.length > ICON_SMALL_MAX || !ICON_RE.test(a.iconSmall)) return null; iconSmall = a.iconSmall; }   // маленькая копия для расширения Twitch (лимит сообщения 5 КБ)
    const howTo = clean(a.howTo, HOWTO_MAX);
    return { title, description, howTo, icon, iconSmall };
  }
  const newId = () => { let id; do { counter++; id = 'a' + counter.toString(36); } while (awards.has(id)); return id; };

  function addGrant(login, awardId) {
    const cur = grants.get(login) || [];
    if (cur.includes(awardId)) return false;
    grants.set(login, [...cur, awardId]); return true;
  }
  const pushLog = (entry) => { log = [entry, ...log].slice(0, MAX_LOG); };

  return {
    limits: { TITLE_MAX, DESC_MAX, HOWTO_MAX, ICON_MAX, ICON_SMALL_MAX, DURATION_MIN, DURATION_MAX, PRESENT_BEFORE_MS },
    /** Каталог: награды и сколько человек получили каждую. */
    list() {
      const cnt = new Map();
      for (const ids of grants.values()) for (const id of ids) cnt.set(id, (cnt.get(id) || 0) + 1);
      return [...awards.values()].map((a) => ({ ...a, holders: cnt.get(a.id) || 0 }));
    },
    getLog: () => log.slice(),
    getEvent() {
      if (!event) return null;
      const a = awards.get(event.awardId);
      return { awardId: event.awardId, title: a ? a.title : '', durationMin: event.durationMin, startedAt: event.startedAt, endsAt: event.endsAt, leftMs: Math.max(0, event.endsAt - now()), participants: event.participants.size };
    },
    /** id наград игрока (для профиля и снимка расширения). */
    awardsOf: (login) => (grants.get(String(login || '').toLowerCase()) || []).slice(),
    getAward: (id) => awards.get(id) || null,

    /** Создаёт награду без события (потом можно выдать вручную). { ok, award?, error? } */
    createAward(a) {
      const v = validAward(a);
      if (!v) return { ok: false, error: 'Нужно название (до ' + TITLE_MAX + ' символов); описание — до ' + DESC_MAX + '; иконка — картинка PNG/JPEG/WEBP небольшого размера.' };
      if (awards.size >= MAX_AWARDS) return { ok: false, error: 'Слишком много наград (максимум ' + MAX_AWARDS + '). Удалите ненужные.' };
      const award = { id: newId(), ...v, available: true, issuedAt: 0, createdAt: now() };
      awards.set(award.id, award); save();
      return { ok: true, award };
    },
    deleteAward(id) {
      if (!awards.has(id)) return false;
      if (event && event.awardId === id) return false;                      // награду идущего события удалить нельзя
      awards.delete(id);
      for (const [l, ids] of [...grants]) { const rest = ids.filter((x) => x !== id); if (rest.length) grants.set(l, rest); else grants.delete(l); }
      save(); return true;
    },

    /**
     * Запуск события. input: { awardId } (существующая награда) или { title, description, icon } (новая), durationMin.
     * Сразу попадают те, кто был в чате в последние PRESENT_BEFORE_MS. { ok, event?, error? }
     */
    startEvent(input = {}) {
      if (event) return { ok: false, error: 'Событие уже идёт. Дождитесь конца или остановите его.' };
      const d = Number(input.durationMin);
      if (!Number.isInteger(d) || d < DURATION_MIN || d > DURATION_MAX) return { ok: false, error: 'Длительность — целое число минут от ' + DURATION_MIN + ' до ' + DURATION_MAX + '.' };
      let awardId = input.awardId;
      if (awardId) { if (!awards.has(awardId)) return { ok: false, error: 'Такой награды нет.' }; awards.get(awardId).available = true; }
      else { const r = this.createAward(input); if (!r.ok) return r; awardId = r.award.id; }
      const t = now();
      const participants = new Set(recentLogins(PRESENT_BEFORE_MS).filter((l) => LOGIN_RE.test(l)));
      event = { awardId, durationMin: d, startedAt: t, endsAt: t + d * 60 * 1000, participants };
      save();
      return { ok: true, event: this.getEvent() };
    },
    /** Человек был активен в чате: во время события он считается присутствующим. */
    noteActivity(login) {
      if (!event) return false;
      const k = String(login || '').toLowerCase();
      if (!LOGIN_RE.test(k) || event.participants.has(k)) return false;
      event.participants.add(k);
      if (event.participants.size % 10 === 0) save();
      return true;
    },
    /** Закрывает событие: grant — выдать награду всем присутствующим, иначе отменить без выдачи. { ok, granted, awardId? } */
    finishEvent(grant) {
      if (!event) return { ok: false, granted: 0 };
      const a = awards.get(event.awardId);
      let granted = 0;
      if (grant && a) { for (const l of event.participants) if (hasProfile(l) && addGrant(l, a.id)) granted++; a.available = false; a.issuedAt = now(); }   // событие прошло: получить награду больше нельзя, дата выдачи запоминается
      pushLog({ awardId: event.awardId, title: a ? a.title : '', at: now(), count: granted, how: grant ? 'event' : 'cancelled' });
      const awardId = event.awardId;
      event = null; save();
      return { ok: true, granted, awardId };
    },
    /** Раз в несколько секунд: если время вышло — выдаёт награду. Возвращает { finished, granted, awardId } или { finished:false }. */
    tick() {
      if (!event || now() < event.endsAt) return { finished: false };
      const r = this.finishEvent(true);
      return { finished: true, granted: r.granted, awardId: r.awardId };
    },

    /** Ручная выдача (например, участникам турнира): logins — список ников. Возвращает { ok, granted, skipped:[ники без профиля] }. */
    grant(awardId, logins) {
      const a = awards.get(awardId);
      if (!a) return { ok: false, error: 'Такой награды нет.' };
      const list = [...new Set((Array.isArray(logins) ? logins : []).map((l) => String(l || '').trim().toLowerCase().replace(/^@/, '')).filter(Boolean))].slice(0, 20000);
      if (!list.length) return { ok: false, error: 'Список ников пуст.' };
      let granted = 0; const skipped = [];
      for (const l of list) {
        if (!LOGIN_RE.test(l) || !hasProfile(l)) { skipped.push(l); continue; }
        if (addGrant(l, awardId)) granted++;
      }
      if (granted) { pushLog({ awardId, title: a.title, at: now(), count: granted, how: 'manual' }); save(); }
      return { ok: true, granted, skipped };
    },
    /** Правка награды: { title?, description?, howTo?, icon?, iconSmall?, available? }. Иконку можно не присылать — останется прежняя. */
    updateAward(id, patch = {}) {
      const a = awards.get(id); if (!a) return { ok: false, error: 'Такой награды нет.' };
      const merged = { title: 'title' in patch ? patch.title : a.title, description: 'description' in patch ? patch.description : a.description, howTo: 'howTo' in patch ? patch.howTo : a.howTo,
        icon: 'icon' in patch ? patch.icon : a.icon, iconSmall: 'iconSmall' in patch ? patch.iconSmall : a.iconSmall };
      const v = validAward(merged);
      if (!v) return { ok: false, error: 'Название — до ' + TITLE_MAX + ' символов, описание — до ' + DESC_MAX + ', «как получить» — до ' + HOWTO_MAX + '; иконка — небольшая картинка.' };
      Object.assign(a, v);
      if ('available' in patch) {
        if (typeof patch.available !== 'boolean') return { ok: false, error: 'Доступность — «да» или «нет».' };
        if (event && event.awardId === id && !patch.available) return { ok: false, error: 'Награда идущего события закроется сама, когда оно закончится.' };
        if (a.available && !patch.available && !a.issuedAt) a.issuedAt = now();   // закрыли вручную — запоминаем дату
        a.available = patch.available;
      }
      save(); return { ok: true, award: a };
    },
    /** Выдать награду всем, у кого есть профиль (logins — список всех известных ников из pixelHeroes). */
    grantAll(awardId, logins) { return this.grant(awardId, logins); },
    revoke(awardId, login) {
      const k = String(login || '').toLowerCase();
      const cur = grants.get(k); if (!cur || !cur.includes(awardId)) return false;
      const rest = cur.filter((x) => x !== awardId); if (rest.length) grants.set(k, rest); else grants.delete(k);
      save(); return true;
    },

    /**
     * Каталог для расширения Twitch — список сообщений { v:1, k:'aw', a:[[id, название, описание, иконка]] }, каждое не больше maxBytes (лимит Twitch — 5 КБ).
     * Награды раскладываются по сообщениям; расширение сливает их по id. Иконка берётся маленькая (iconSmall), если её нет — обычная, если и она не помещается — награда идёт без иконки.
     * Только награды, которые у кого-то есть.
     */
    buildCatalog(maxBytes = 4800) {
      const size = (m) => Buffer.byteLength(JSON.stringify(m), 'utf8');
      const mk = (rows, first) => (first ? { v: 1, k: 'aw', r: 1, a: rows } : { v: 1, k: 'aw', a: rows });
      const msgs = []; let cur = [];
      for (const a of awards.values()) {
        const ev = event && event.awardId === a.id;
        let row = [a.id, a.title, a.description, a.iconSmall || a.icon || '', a.howTo || '', a.available || ev ? 1 : 0, a.issuedAt ? Math.floor(a.issuedAt / 1000) : 0];
        while (size(mk([row], true)) > maxBytes && row[3]) row = [row[0], row[1], row[2], '', row[4], row[5], row[6]];                  // не влезает с иконкой — без неё
        while (size(mk([row], true)) > maxBytes && (row[2].length > 20 || row[4].length > 20)) row = [row[0], row[1], row[2].slice(0, Math.max(20, Math.floor(row[2].length * 0.7))), row[3], row[4].slice(0, Math.max(20, Math.floor(row[4].length * 0.7))), row[5], row[6]];
        if (size(mk([row], true)) > maxBytes) continue;
        if (cur.length && size(mk([...cur, row], msgs.length === 0)) > maxBytes) { msgs.push(mk(cur, msgs.length === 0)); cur = []; }
        cur.push(row);
      }
      if (cur.length) msgs.push(mk(cur, msgs.length === 0));
      return msgs;
    },
    isRunning: () => !!event,
  };
}

module.exports = { createAwards, FILE, TITLE_MAX, DESC_MAX, HOWTO_MAX, ICON_MAX, ICON_SMALL_MAX, DURATION_MIN, DURATION_MAX, PRESENT_BEFORE_MS };
