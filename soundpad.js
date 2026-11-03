// soundpad.js — саундпад: кнопки с мемными звуками (10 встроенных + свои), звук играет на странице soundpad.html в OBS.
// Звук можно привязать к награде за баллы канала: зритель купил награду → звук сыграл.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Keys = require('./soundpadKeys');

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

const DEFAULTS = { enabled: true, volume: 80, overlap: true, rewardsOn: false, rewardCost: 100, rewardCooldown: 0, hitKey: '' };
// reward.on — звук отмечен для наград; cost 0 — «как у всех» (цена по умолчанию); cooldown -1 — «как у всех»; title пустой — название звука
const REWARD_DEFAULT = { on: false, title: '', cost: 0, cooldown: -1, id: '' };

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
    cost: clamp(s.cost, 0, 10000000, b.cost),
    cooldown: clamp(s.cooldown, -1, 86400, b.cooldown),
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
    hotkey: s.hotkey === undefined ? (b.hotkey || '') : ((Keys.parse(s.hotkey) || {}).text || ''),
  };
}
function mergeBuiltin() {
  BUILTIN.forEach((d) => {
    const have = sounds.find((x) => x.id === d.id);
    if (!have) sounds.push(cleanSound({}, Object.assign({ builtin: true, volume: 100, reward: Object.assign({}, REWARD_DEFAULT) }, d)));
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
    cfg = Object.assign({}, DEFAULTS, { enabled: j.enabled !== false, volume: clamp(j.volume, 0, 100, DEFAULTS.volume), overlap: j.overlap !== false, rewardsOn: j.rewardsOn === true, rewardCost: clamp(j.rewardCost, 1, 10000000, DEFAULTS.rewardCost), rewardCooldown: clamp(j.rewardCooldown, 0, 86400, DEFAULTS.rewardCooldown), hitKey: typeof j.hitKey === 'string' && /^[a-f0-9]{16,64}$/.test(j.hitKey) ? j.hitKey : '' });
    (Array.isArray(j.sounds) ? j.sounds : []).slice(0, MAX_SOUNDS).forEach((x) => {
      if (!x || typeof x.id !== 'string' || !/^[a-z0-9_\-]{1,40}$/i.test(x.id)) return;
      if (RETIRED.includes(x.id)) return;
      const bi = BUILTIN.find((d) => d.id === x.id);
      if (bi) sounds.push(cleanSound(x, Object.assign({ builtin: true, volume: 100, reward: REWARD_DEFAULT }, bi)));
      else if (typeof x.file === 'string' && /^[A-Za-z0-9_.\-]{1,90}$/.test(x.file) && EXT.includes(path.extname(x.file).toLowerCase())) sounds.push(cleanSound(x, { id: x.id, file: x.file, builtin: false, name: x.name, emoji: '🔊', volume: 100, reward: REWARD_DEFAULT }));
    });
  } catch (e) { cfg = Object.assign({}, DEFAULTS); }
  if (!cfg.hitKey) cfg.hitKey = crypto.randomBytes(12).toString('hex');
  mergeBuiltin();
  sounds.forEach((x) => { if (x.reward.title === x.emoji + ' ' + x.name || x.reward.title === '🔊 ' + x.name) x.reward.title = ''; if (x.reward.cost === 100 && x.reward.cooldown === 0 && !x.reward.id) { x.reward.cost = 0; x.reward.cooldown = -1; } });
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
  if (useFile) { try { fs.mkdirSync(UP_DIR(), { recursive: true }); } catch (e) { /* ничего */ } load(); } else { cfg = Object.assign({}, DEFAULTS, { hitKey: crypto.randomBytes(12).toString('hex') }); sounds = []; mergeBuiltin(); }
  events = []; seq = 0;
}
const urlOf = (s) => (s.builtin ? 'soundpad/' + s.file : 'uploads/soundpad/' + encodeURIComponent(s.file));
const rewardTitle = (s) => (s.reward.title || (s.emoji + ' ' + s.name)).slice(0, 45);
const rewardCost = (s) => (s.reward.cost > 0 ? s.reward.cost : cfg.rewardCost);
const rewardCooldown = (s) => (s.reward.cooldown >= 0 ? s.reward.cooldown : cfg.rewardCooldown);
function view(s) { return { id: s.id, name: s.name, emoji: s.emoji, builtin: s.builtin, volume: s.volume, reward: Object.assign({}, s.reward, { effTitle: rewardTitle(s), effCost: rewardCost(s), effCooldown: rewardCooldown(s) }), hotkey: s.hotkey || '', url: urlOf(s) }; }
function state() { return { settings: { ...cfg }, sounds: sounds.map(view), max: MAX_SOUNDS }; }
function find(id) { return sounds.find((s) => s.id === id) || null; }

function update(body) {
  const b = body || {};
  if (typeof b.enabled === 'boolean') cfg.enabled = b.enabled;
  if (b.volume != null) cfg.volume = clamp(b.volume, 0, 100, cfg.volume);
  if (typeof b.overlap === 'boolean') cfg.overlap = b.overlap;
  if (typeof b.rewardsOn === 'boolean') cfg.rewardsOn = b.rewardsOn;
  if (b.rewardCost != null) cfg.rewardCost = clamp(b.rewardCost, 1, 10000000, cfg.rewardCost);
  if (b.rewardCooldown != null) cfg.rewardCooldown = clamp(b.rewardCooldown, 0, 86400, cfg.rewardCooldown);
  persist(); onChange(); return state();
}
function updateSound(id, body) {
  const s = find(id); if (!s) throw new Error('Такого звука нет');
  if (body && body.hotkey !== undefined && String(body.hotkey).trim() !== '') {
    const k = Keys.parse(body.hotkey); if (!k) throw new Error('Такое сочетание не подойдёт: для букв, цифр и пробела нужен Ctrl, Alt или Shift');
    const other = sounds.find((x) => x !== s && x.hotkey === k.text); if (other) throw new Error('Это сочетание уже занято звуком «' + other.name + '»');
  }
  const n = cleanSound(body || {}, s); Object.assign(s, n);
  if (s.reward.title === s.emoji + ' ' + s.name) s.reward.title = '';
  persist(); onChange(); return view(s);
}
/** Отметить звук (или все) для наград за баллы. */
function mark(ids, on) {
  const all = ids === 'all'; let n = 0;
  sounds.forEach((x) => { if ((all || (ids || []).includes(x.id)) && x.reward.on !== !!on) { x.reward.on = !!on; n++; } });
  persist(); onChange(); return n;
}
function addUploaded(fileName, original, name) {
  if (sounds.length >= MAX_SOUNDS) throw new Error('Слишком много звуков (до ' + MAX_SOUNDS + ')');
  const ext = path.extname(fileName).toLowerCase();
  if (!EXT.includes(ext)) throw new Error('Формат не поддерживается (mp3, wav, ogg, m4a)');
  const base = String(name || original || 'Звук').replace(/\.[^.]+$/, '').slice(0, 40) || 'Звук';
  const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const s = cleanSound({ name: base, emoji: '🔊', volume: 100 }, { id, file: fileName, builtin: false, name: base, emoji: '🔊', volume: 100, reward: Object.assign({}, REWARD_DEFAULT) });
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
  if (!cfg.rewardsOn) return null;
  const rid = p && p.rewardId, t = String((p && p.reward) || '').trim().toLowerCase();
  const s = sounds.find((x) => x.reward.on && ((rid && x.reward.id && x.reward.id === rid) || (rewardTitle(x).toLowerCase() === t)));
  if (!s) return null;
  const r = play(s.id, p.name);
  return { sound: s, played: r.played };
}
function setRewardId(id, rewardId) { const s = find(id); if (s) { s.reward.id = rewardId || ''; persist(); } }
function reset() { cfg = Object.assign({}, DEFAULTS, { hitKey: crypto.randomBytes(12).toString('hex') }); sounds = []; events = []; seq = 0; mergeBuiltin(); }
function getSettings() { return { ...cfg }; }
function listSounds() { return sounds; }

module.exports = { rewardTitle, rewardCost, rewardCooldown, mark, BUILTIN, EXT, MAX_SOUNDS, init, state, update, updateSound, addUploaded, remove, play, stopAll, poll, onPoints, setRewardId, reset, getSettings, listSounds, UP_DIR };
