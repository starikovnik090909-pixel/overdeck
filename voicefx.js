// voicefx.js — голосовые фильтры: какой фильтр сейчас включён (вручную или временно за баллы/донат) и кому он достаётся.
// Сам звук обрабатывают страницы (public/voicefx.js); здесь только состояние, правила и таймеры.
'use strict';
const fs = require('fs');
const path = require('path');

const FILTERS = [
  ['radio', 'Рация'], ['phone', 'Телефон'], ['mega', 'Мегафон'], ['robot', 'Робот'], ['cave', 'Пещера'], ['demon', 'Демон'], ['chip', 'Бурундук'], ['am', 'Старое радио'],
  ['water', 'Под водой'], ['announcer', 'Диктор'], ['bit8', '8-бит'], ['ghost', 'Призрак'], ['stadium', 'Стадион'], ['troll', 'Тролль'], ['drunk', 'Пьяный'], ['alien', 'Пришелец'], ['choir', 'Хор'],
].map(([id, name]) => ({ id, name }));
const IDS = FILTERS.map((f) => f.id);
const isNv = (f) => /^nv:\d{1,2}$/.test(String(f));   // голос нейросети NV (номер слота в движке)

const DEFAULTS = {
  enabled: false, filter: 'off', strength: 60,
  targets: { tts: true, alert: true, mic: true },
  reward: { on: false, title: '🎙 Голосовой фильтр', cost: 300, cooldown: 60, duration: 60, filter: 'random', id: '' },
  donation: { on: false, minRub: 100, keyword: '', duration: 30, filter: 'random' },
  obs: { on: false, host: '127.0.0.1', port: 4455, password: '', micInput: '', fxInput: 'Overdeck Mic FX' },
};

let DIR = __dirname, useFile = true, cfg = clone(DEFAULTS), temp = null, onChange = () => {}, timer = null, now = () => Date.now();
function clone(o) { return JSON.parse(JSON.stringify(o)); }
const clamp = (v, a, b, f) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, Math.round(n))) : f; };
const str = (v, n, f) => (typeof v === 'string' ? v.trim().slice(0, n) : f);
const bool = (v, f) => (typeof v === 'boolean' ? v : f);
const pickFilter = (v, f) => (IDS.includes(v) || isNv(v) || v === 'random' || v === 'viewer' ? v : f);

function clean(b, base) {
  const s = b && typeof b === 'object' ? b : {}, o = base || cfg, r = s.reward || {}, d = s.donation || {}, ob = s.obs || {}, t = s.targets || {};
  return {
    enabled: bool(s.enabled, o.enabled),
    filter: s.filter === 'off' ? 'off' : (IDS.includes(s.filter) || isNv(s.filter) ? s.filter : o.filter),
    strength: clamp(s.strength, 0, 100, o.strength),
    targets: { tts: bool(t.tts, o.targets.tts), alert: bool(t.alert, o.targets.alert), mic: bool(t.mic, o.targets.mic) },
    reward: {
      on: bool(r.on, o.reward.on), title: str(r.title, 45, o.reward.title) || DEFAULTS.reward.title, cost: clamp(r.cost, 1, 10000000, o.reward.cost), cooldown: clamp(r.cooldown, 0, 86400, o.reward.cooldown),
      duration: clamp(r.duration, 5, 3600, o.reward.duration), filter: pickFilter(r.filter, o.reward.filter),
      id: typeof r.id === 'string' && /^[A-Za-z0-9\-]{0,64}$/.test(r.id) ? r.id : o.reward.id,
    },
    donation: {
      on: bool(d.on, o.donation.on), minRub: clamp(d.minRub, 1, 10000000, o.donation.minRub), keyword: str(d.keyword, 40, o.donation.keyword), duration: clamp(d.duration, 5, 3600, o.donation.duration),
      filter: pickFilter(d.filter, o.donation.filter),
    },
    obs: {
      on: bool(ob.on, o.obs.on), host: str(ob.host, 80, o.obs.host).replace(/[^A-Za-z0-9.\-:]/g, '') || '127.0.0.1', port: clamp(ob.port, 1, 65535, o.obs.port),
      password: typeof ob.password === 'string' ? ob.password.slice(0, 200) : o.obs.password, micInput: str(ob.micInput, 120, o.obs.micInput), fxInput: str(ob.fxInput, 120, o.obs.fxInput) || DEFAULTS.obs.fxInput,
    },
  };
}
const file = () => path.join(DIR, 'voicefx_settings.json');
function load() { try { cfg = clean(JSON.parse(fs.readFileSync(file(), 'utf8')), clone(DEFAULTS)); } catch (e) { cfg = clone(DEFAULTS); } }
function persist() { if (!useFile) return; try { const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2)); fs.renameSync(tmp, file()); } catch (e) { /* не критично */ } }

function init(o) {
  const x = o || {};
  if (x.dir) DIR = x.dir; useFile = !x.noFile; if (x.onChange) onChange = x.onChange; if (x.now) now = x.now;
  cfg = clone(DEFAULTS); temp = null; if (useFile) load();
  clearInterval(timer); timer = setInterval(tick, 1000); if (timer.unref) timer.unref();
}
function tick() { if (temp && temp.until <= now()) { temp = null; onChange(active()); } }

/** Что играет прямо сейчас: временный фильтр (награда/донат) важнее ручного. */
function active() {
  if (!cfg.enabled) return { filter: 'off', strength: cfg.strength, targets: { ...cfg.targets }, until: 0, by: '', source: '' };
  if (temp && temp.until > now()) return { filter: temp.filter, strength: cfg.strength, targets: { ...cfg.targets }, until: temp.until, by: temp.by, source: temp.source };
  return { filter: cfg.filter, strength: cfg.strength, targets: { ...cfg.targets }, until: 0, by: '', source: cfg.filter === 'off' ? '' : 'manual' };
}
const getSettings = () => clone(cfg);
function state() { return { settings: getSettings(), active: active(), filters: FILTERS }; }
function update(body) { cfg = clean(body, cfg); persist(); onChange(active()); return state(); }
/** Временно включить фильтр (seconds сек). */
function trigger(filter, seconds, by, source) {
  if (!cfg.enabled) return null;
  const f = IDS.includes(filter) || isNv(filter) ? filter : IDS[Math.floor(Math.random() * IDS.length)];
  temp = { filter: f, until: now() + clamp(seconds, 5, 3600, 30) * 1000, by: String(by || '').slice(0, 40), source: source || 'reward' };
  onChange(active()); return active();
}
function reset() { temp = null; onChange(active()); }
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
/** Фильтр, который зритель назвал в сообщении ("рация", "робот"). */
function fromText(text) {
  const t = ' ' + norm(text) + ' ';
  const hit = FILTERS.find((f) => t.includes(' ' + norm(f.name) + ' ')) || FILTERS.find((f) => norm(f.name).length > 3 && t.includes(norm(f.name).slice(0, Math.max(4, norm(f.name).length - 2))));
  return hit ? hit.id : '';
}
function choose(setting, text) { if (IDS.includes(setting) || isNv(setting)) return setting; if (setting === 'viewer') return fromText(text) || 'random'; return 'random'; }
/** Награда за баллы куплена. */
function onPoints(e) {
  const r = cfg.reward; if (!cfg.enabled || !r.on) return null;
  const hit = (r.id && e.rewardId === r.id) || norm(e.reward) === norm(r.title); if (!hit) return null;
  return trigger(choose(r.filter, e.input), r.duration, e.name, 'reward');
}
/** Пришёл донат. */
function onDonation(e) {
  const d = cfg.donation; if (!cfg.enabled || !d.on) return null;
  if ((Number(e.rub) || 0) < d.minRub) return null;
  if (d.keyword && !norm(e.message).includes(norm(d.keyword))) return null;
  return trigger(choose(d.filter, e.message), d.duration, e.username, 'donation');
}
function setRewardId(id) { cfg.reward.id = id || ''; persist(); }
module.exports = { init, state, update, active, trigger, reset, onPoints, onDonation, fromText, setRewardId, isNv, getSettings, tick, FILTERS, IDS };
