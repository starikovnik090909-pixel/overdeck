// soundpad.js — саундпад: кнопки с мемными звуками (10 встроенных + свои), звук играет на странице soundpad.html в OBS.
// Звук можно привязать к награде за баллы канала: зритель купил награду → звук сыграл.
'use strict';
const fs = require('fs');
const path = require('path');

let DIR = __dirname;
let useFile = true;
const UP_DIR = () => path.join(DIR, 'uploads', 'soundpad');

const BUILTIN = [
  { id: 'zdorovo', name: 'Здорово, заебал', emoji: '😒', file: 'zdorovo.mp3' },
  { id: 'goodmorning', name: 'Гуд монинг', emoji: '☀️', file: 'goodmorning.mp3' },
  { id: 'datyche', name: 'Да ты чё', emoji: '😮', file: 'datyche.mp3' },
  { id: 'fbi', name: 'FBI, откройте!', emoji: '🚔', file: 'fbi.mp3' },
  { id: 'onlything', name: 'Единственное, что мы получим', emoji: '🤌', file: 'onlything.mp3' },
  { id: 'silence', name: 'Тишина, проснутся', emoji: '🤫', file: 'silence.mp3' },
  { id: 'mishka', name: 'Давай по новой, Миша', emoji: '🐻', file: 'mishka.mp3' },
  { id: 'penetration', name: 'Есть пробитие!', emoji: '🎯', file: 'penetration.mp3' },
  { id: 'batya', name: 'Батя дома', emoji: '🥃', file: 'batya.mp3' },
  { id: 'klass', name: 'В натуре класс', emoji: '👌', file: 'klass.mp3' },
  { id: 'devochka', name: 'Доброе утро, моя девочка', emoji: '💐', file: 'devochka.mp3' },
  { id: 'notunderstand', name: 'Я не понимаю', emoji: '🤷', file: 'notunderstand.mp3' },
  { id: 'zaika', name: 'Давай, Зайка!', emoji: '🐰', file: 'zaika.mp3' },
  { id: 'aura', name: 'Аура', emoji: '🌌', file: 'aura.mp3' },
  { id: 'newproject', name: 'Новый проект', emoji: '🆕', file: 'newproject.mp3' },
  { id: 'king', name: 'Короля не убить', emoji: '👑', file: 'king.mp3' },
];
const RETIRED = ['airhorn', 'trombone', 'rimshot', 'boom', 'scratch', 'error', 'fanfare', 'siren', 'doorbell', 'honk'];
const EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'];
const MAX_SOUNDS = 60;

const DEFAULTS = { enabled: true, volume: 80, overlap: true };
const REWARD_DEFAULT = { on: false, title: '', cost: 100, cooldown: 0, id: '' };

let cfg = Object.assign({}, DEFAULTS);
let sounds = [];            // { id, name, emoji, file, builtin, volume, reward }
let events = [];            // последние запуски для страницы OBS: { seq, id, url, vol, at }
let seq = 0;
let onChange = () => {};

const clamp = (v, a, b, f) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, Math.round(n))) : f; };
const str = (v, n, f) => (typeof v === 'string' ? v.trim().slice(0, n) : f);

function cleanReward(r, base) {
  const b = base || REWARD_DEFAULT, s = r && typeof r === 'object' ? r : {};
  return {
    on: typeof s.on === 'boolean' ? s.on : b.on,
    title: str(s.title, 45, b.title),
    cost: clamp(s.cost, 1, 10000000, b.cost),
    cooldown: clamp(s.cooldown, 0, 86400, b.cooldown),
    id: typeof s.id === 'string' && /^[A-Za-z0-9\-]{0,64}$/.test(s.id) ? s.id : b.id,
  };
}
function cleanSound(s, base) {
  const b = base || {};
  return {
    id: b.id, builtin: !!b.builtin, file: b.file,
    name: str(s.name, 40, b.name) || b.name || 'Звук',
    emoji: typeof s.emoji === 'string' ? [...s.emoji.trim()].slice(0, 2).join('') || b.emoji || '🔊' : (b.emoji || '🔊'),
    volume: clamp(s.volume, 0, 100, b.volume == null ? 100 : b.volume),
    reward: cleanReward(s.reward, b.reward),
  };
}
function mergeBuiltin() {
  BUILTIN.forEach((d) => {
    const have = sounds.find((x) => x.id === d.id);
    if (!have) sounds.push(cleanSound({}, Object.assign({ builtin: true, volume: 100, reward: Object.assign({}, REWARD_DEFAULT, { title: d.emoji + ' ' + d.name }) }, d)));
    else { have.builtin = true; have.file = d.file; }
  });
  // порядок: сначала встроенные в исходном порядке, потом свои как добавлены
  const order = new Map(BUILTIN.map((d, i) => [d.id, i]));
  sounds.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1000) - (order.has(b.id) ? order.get(b.id) : 1000) || 0);
}
function file(n) { return path.join(DIR, n); }
function load() {
  sounds = [];
  try {
    const j = JSON.parse(fs.readFileSync(file('soundpad_settings.json'), 'utf8'));
    cfg = Object.assign({}, DEFAULTS, { enabled: j.enabled !== false, volume: clamp(j.volume, 0, 100, DEFAULTS.volume), overlap: j.overlap !== false });
    (Array.isArray(j.sounds) ? j.sounds : []).slice(0, MAX_SOUNDS).forEach((x) => {
      if (!x || typeof x.id !== 'string' || !/^[a-z0-9_\-]{1,40}$/i.test(x.id)) return;
      if (RETIRED.includes(x.id)) return;
      const bi = BUILTIN.find((d) => d.id === x.id);
      if (bi) sounds.push(cleanSound(x, Object.assign({ builtin: true, volume: 100, reward: REWARD_DEFAULT }, bi)));
      else if (typeof x.file === 'string' && /^[A-Za-z0-9_.\-]{1,90}$/.test(x.file) && EXT.includes(path.extname(x.file).toLowerCase())) sounds.push(cleanSound(x, { id: x.id, file: x.file, builtin: false, name: x.name, emoji: '🔊', volume: 100, reward: REWARD_DEFAULT }));
    });
  } catch (e) { cfg = Object.assign({}, DEFAULTS); }
  mergeBuiltin();
}
function persist() {
  if (!useFile) return;
  try { const tmp = file('soundpad_settings.json.tmp'); fs.writeFileSync(tmp, JSON.stringify({ ...cfg, sounds }, null, 2)); fs.renameSync(tmp, file('soundpad_settings.json')); } catch (e) { /* не критично */ }
}
function init(o) {
  const x = o || {};
  if (x.dir) DIR = x.dir;
  useFile = !x.noFile;
  if (x.onChange) onChange = x.onChange;
  if (useFile) { try { fs.mkdirSync(UP_DIR(), { recursive: true }); } catch (e) { /* ничего */ } load(); } else { cfg = Object.assign({}, DEFAULTS); sounds = []; mergeBuiltin(); }
  events = []; seq = 0;
}
const urlOf = (s) => (s.builtin ? 'soundpad/' + s.file : 'uploads/soundpad/' + encodeURIComponent(s.file));
function view(s) { return { id: s.id, name: s.name, emoji: s.emoji, builtin: s.builtin, volume: s.volume, reward: s.reward, url: urlOf(s) }; }
function state() { return { settings: { ...cfg }, sounds: sounds.map(view), max: MAX_SOUNDS }; }
function find(id) { return sounds.find((s) => s.id === id) || null; }

function update(body) {
  const b = body || {};
  if (typeof b.enabled === 'boolean') cfg.enabled = b.enabled;
  if (b.volume != null) cfg.volume = clamp(b.volume, 0, 100, cfg.volume);
  if (typeof b.overlap === 'boolean') cfg.overlap = b.overlap;
  persist(); onChange(); return state();
}
function updateSound(id, body) {
  const s = find(id); if (!s) throw new Error('Такого звука нет');
  const n = cleanSound(body || {}, s); Object.assign(s, n);
  persist(); onChange(); return view(s);
}
function addUploaded(fileName, original, name) {
  if (sounds.length >= MAX_SOUNDS) throw new Error('Слишком много звуков (до ' + MAX_SOUNDS + ')');
  const ext = path.extname(fileName).toLowerCase();
  if (!EXT.includes(ext)) throw new Error('Формат не поддерживается (mp3, wav, ogg, m4a)');
  const base = String(name || original || 'Звук').replace(/\.[^.]+$/, '').slice(0, 40) || 'Звук';
  const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const s = cleanSound({ name: base, emoji: '🔊', volume: 100 }, { id, file: fileName, builtin: false, name: base, emoji: '🔊', volume: 100, reward: Object.assign({}, REWARD_DEFAULT, { title: '🔊 ' + base }) });
  sounds.push(s); persist(); onChange(); return view(s);
}
function remove(id) {
  const s = find(id); if (!s) throw new Error('Такого звука нет');
  if (s.builtin) throw new Error('Встроенный звук удалить нельзя');
  sounds = sounds.filter((x) => x !== s);
  if (useFile) { try { fs.unlinkSync(path.join(UP_DIR(), s.file)); } catch (e) { /* файла уже нет */ } }
  persist(); onChange(); return { removed: s.id, reward: s.reward };
}

/** Сыграть звук на странице OBS. by — кто запустил (для журнала). */
function play(id, by) {
  const s = find(id); if (!s) throw new Error('Такого звука нет');
  if (!cfg.enabled) return { played: false, reason: 'off' };
  seq += 1;
  const now = Date.now();
  events = events.filter((e) => now - e.at < 30000).slice(-30);
  events.push({ seq, id: s.id, url: urlOf(s), vol: Math.round(cfg.volume * s.volume / 100), overlap: cfg.overlap, name: s.name, by: by || '', at: now });
  return { played: true, seq };
}
function stopAll() { seq += 1; events.push({ seq, stop: true, at: Date.now() }); return { seq }; }
/** Для страницы OBS: события после номера after. */
function poll(after) {
  const a = Number(after) || 0; const now = Date.now();
  return { seq, enabled: cfg.enabled, events: events.filter((e) => e.seq > a && now - e.at < 30000) };
}

/** Награда за баллы сыграна: найти звук по id награды или названию. */
function onPoints(p) {
  const rid = p && p.rewardId, t = String((p && p.reward) || '').trim().toLowerCase();
  const s = sounds.find((x) => x.reward.on && ((rid && x.reward.id && x.reward.id === rid) || (x.reward.title && x.reward.title.toLowerCase() === t)));
  if (!s) return null;
  const r = play(s.id, p.name);
  return { sound: s, played: r.played };
}
function setRewardId(id, rewardId) { const s = find(id); if (s) { s.reward.id = rewardId || ''; persist(); } }
function reset() { cfg = Object.assign({}, DEFAULTS); sounds = []; events = []; seq = 0; mergeBuiltin(); }
function getSettings() { return { ...cfg }; }
function listSounds() { return sounds; }

module.exports = { BUILTIN, EXT, MAX_SOUNDS, init, state, update, updateSound, addUploaded, remove, play, stopAll, poll, onPoints, setRewardId, reset, getSettings, listSounds, UP_DIR };
