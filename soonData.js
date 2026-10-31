// soonData.js — экран «Скоро начнём» (опенинг): настройки, таймер, фон-картинка/гиф. Страница OBS: public/soon.html.
// Категория и название берутся с Twitch (работает и до начала стрима), любое поле можно заменить своим текстом.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'soon_settings.json');
const DIR = path.join(__dirname, 'uploads', 'soon');
const EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

const DEFAULTS = {
  showKicker: true, kicker: 'СТРИМ СКОРО НАЧНЁТСЯ',
  showCategory: true, categoryLabel: 'КАТЕГОРИЯ', categoryText: '',   // пусто — берётся из Twitch
  showTitle: true, titleText: '',                                       // пусто — название стрима из Twitch
  showTimer: true, timerMode: 'minutes', minutes: 10, clock: '20:00', timerLabel: 'ДО ЭФИРА', timerEndText: 'НАЧИНАЕМ',
  showFooter: true, footer: '',                                         // пусто — «ИМЯ КАНАЛА · OVERDECK»
  accent: '#e5484d', accent2: '#ff6a3c', bg: '#0b0305', text: '#ffffff',
  gradientTitle: true, glow: true, embers: true, emberCount: 110,
  chat: 'right', chatBorder: true, chatWidth: 520,
  bgImage: '', bgDim: 35, bgBlur: 0,
};
const ENUM = { timerMode: ['minutes', 'clock'], chat: ['right', 'left', 'off'] };
const BOOL = ['showKicker', 'showCategory', 'showTitle', 'showTimer', 'showFooter', 'gradientTitle', 'glow', 'embers', 'chatBorder'];
const STR = { kicker: 60, categoryLabel: 30, categoryText: 80, titleText: 140, timerLabel: 30, timerEndText: 30, footer: 60 };
const COLOR = ['accent', 'accent2', 'bg', 'text'];
const NUM = { minutes: [1, 600], emberCount: [0, 300], chatWidth: [300, 800], bgDim: [0, 90], bgBlur: [0, 30] };

let cfg = JSON.parse(JSON.stringify(DEFAULTS));
let endAt = 0; // момент, когда таймер дойдёт до нуля (мс), 0 — не запущен
let provider = async () => null;
let cache = { at: 0, val: null };

function sanitize(src, base) {
  const out = Object.assign({}, base);
  const b = src || {};
  BOOL.forEach((k) => { if (typeof b[k] === 'boolean') out[k] = b[k]; });
  Object.keys(STR).forEach((k) => { if (typeof b[k] === 'string') out[k] = b[k].replace(/[\r\n]+/g, ' ').slice(0, STR[k]); });
  COLOR.forEach((k) => { if (typeof b[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(b[k])) out[k] = b[k].toLowerCase(); });
  Object.keys(NUM).forEach((k) => { if (b[k] != null && isFinite(Number(b[k]))) out[k] = Math.max(NUM[k][0], Math.min(NUM[k][1], Math.round(Number(b[k])))); });
  Object.keys(ENUM).forEach((k) => { if (ENUM[k].includes(b[k])) out[k] = b[k]; });
  if (typeof b.clock === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.clock)) out.clock = b.clock;
  if (typeof b.bgImage === 'string' && (b.bgImage === '' || /^bg-\d+\.(png|jpe?g|webp|gif)$/.test(b.bgImage))) out.bgImage = b.bgImage;
  return out;
}
function load() {
  try { cfg = sanitize(JSON.parse(fs.readFileSync(FILE, 'utf8')), DEFAULTS); } catch (e) { cfg = JSON.parse(JSON.stringify(DEFAULTS)); }
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) { /* папка создастся при загрузке */ }
}
function save() {
  try { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2)); fs.renameSync(tmp, FILE); } catch (e) { console.warn('[Скоро начнём] не удалось сохранить:', e.message); }
}
function init(getChannelInfo) { if (getChannelInfo) provider = getChannelInfo; load(); }

function getSettings() { return JSON.parse(JSON.stringify(cfg)); }
function update(b) {
  const bg = cfg.bgImage; // фон меняется только загрузкой/удалением, не общим сохранением
  cfg = sanitize(b, cfg); cfg.bgImage = bg; save(); return getSettings();
}
function resetColors() { ['accent', 'accent2', 'bg', 'text'].forEach((k) => { cfg[k] = DEFAULTS[k]; }); save(); return getSettings(); }

function startTimer(minutes) {
  const m = Number(minutes) > 0 ? Math.min(600, Number(minutes)) : cfg.minutes;
  endAt = Date.now() + m * 60000; return endAt;
}
function resetTimer() { endAt = 0; }

function removeBgFile(name) { if (name && /^bg-\d+\.(png|jpe?g|webp|gif)$/.test(name)) { try { fs.unlinkSync(path.join(DIR, name)); } catch (e) { /* уже нет */ } } }
function setBackground(filename) { removeBgFile(cfg.bgImage); cfg.bgImage = filename; save(); return getSettings(); }
function clearBackground() { removeBgFile(cfg.bgImage); cfg.bgImage = ''; save(); return getSettings(); }

/** Название и категория канала (Twitch отдаёт их и до начала стрима). Кэш 20 секунд. */
async function channelInfo() {
  if (Date.now() - cache.at < 20000) return cache.val;
  let v = null;
  try { v = await provider(); } catch (e) { v = null; }
  if (v || !cache.val) cache = { at: Date.now(), val: v }; else cache.at = Date.now();
  return cache.val;
}
async function state() {
  const ci = await channelInfo();
  return { settings: getSettings(), timer: { endAt, now: Date.now() }, channel: ci || { title: '', game: '', login: '' }, bgUrl: cfg.bgImage ? '/uploads/soon/' + cfg.bgImage : '' };
}

module.exports = { DEFAULTS, DIR, EXT, init, getSettings, update, resetColors, startTimer, resetTimer, setBackground, clearBackground, state };
