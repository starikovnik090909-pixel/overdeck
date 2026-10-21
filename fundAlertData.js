// fundAlertData.js
// Настройки и текущее состояние показа алерта "Ник вносит сумму в призовой
// фонд!" (виджет fund-alert.html). Сама ОЧЕРЕДЬ показов (чтобы алерты при
// частых донатах не перекрывали друг друга — та же идея, что и в очереди
// озвучки чата, tts.js) живёт в server.js, этот модуль — только данные:
// настройки (шаблон текста, размеры, цвета, анимация) и то, что сейчас
// показано (или ничего).

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'fund_alert_data.json');

const NUMERIC_DEFAULTS = {
  cardWidth: 420,
  cardHeight: 100,
  textFontSize: 20,
  padding: 20,
  animationDurationMs: 500,
  displaySeconds: 4,
};

const NUMERIC_LIMITS = {
  cardWidth: [200, 800],
  cardHeight: [60, 300],
  textFontSize: [10, 40],
  padding: [4, 50],
  animationDurationMs: [0, 3000],
  displaySeconds: [1, 60],
};

const COLOR_DEFAULTS = {
  cardFillStart: '#1a1f3d',
  cardFillEnd: '#3a2560',
  cardBorderStart: '#c9a24a',
  cardBorderEnd: '#6a5acd',
};

const TEXT_DEFAULTS = {
  template: '{nick} вносит {amount} {currency} в призовой фонд!',
};

const SLIDE_SIDES = ['left', 'right', 'top', 'bottom'];
const ENUM_DEFAULTS = { slideSide: 'right' };
const ENUM_OPTIONS = { slideSide: SLIDE_SIDES };

function defaultSettings() {
  return { ...NUMERIC_DEFAULTS, ...COLOR_DEFAULTS, ...TEXT_DEFAULTS, ...ENUM_DEFAULTS };
}

function defaultData() {
  return { visible: false, text: '', settings: defaultSettings() };
}

let data = null;

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isValidColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function normalizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const result = {};
  Object.entries(NUMERIC_DEFAULTS).forEach(([key, fallback]) => {
    const [min, max] = NUMERIC_LIMITS[key];
    result[key] = clampNum(raw[key], min, max, fallback);
  });
  Object.entries(COLOR_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = isValidColor(raw[key]) ? raw[key] : fallback;
  });
  Object.entries(TEXT_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = typeof raw[key] === 'string' && raw[key].trim() ? raw[key] : fallback;
  });
  Object.entries(ENUM_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = ENUM_OPTIONS[key].includes(raw[key]) ? raw[key] : fallback;
  });
  return result;
}

function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  return {
    visible: !!raw.visible,
    text: typeof raw.text === 'string' ? raw.text : '',
    settings: normalizeSettings(raw.settings),
  };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')));
      return;
    }
  } catch (e) {
    console.warn('[Алерт сбора] Не удалось прочитать fund_alert_data.json, начинаем с дефолтов:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Алерт сбора] Не удалось сохранить fund_alert_data.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

/** Собирает готовый текст алерта из шаблона (плейсхолдеры {nick}/{amount}/{currency}). */
function buildText(nick, amount, currency) {
  const formattedAmount = Number.isFinite(Number(amount)) ? Math.round(Number(amount)).toLocaleString('ru-RU') : String(amount);
  return data.settings.template
    .replace(/\{nick\}/g, nick || 'Аноним')
    .replace(/\{amount\}/g, formattedAmount)
    .replace(/\{currency\}/g, currency || '');
}

/** text === null скрывает алерт; строка — показывает именно этот текст. Само хранение видимости живёт здесь, очередь/таймеры — в server.js. */
function setVisible(text) {
  data.visible = text !== null;
  data.text = text || '';
  save();
  return data;
}

function updateSettings(fields) {
  data.settings = normalizeSettings({ ...data.settings, ...(fields || {}) });
  save();
  return data.settings;
}

function resetSettings() {
  data.settings = defaultSettings();
  save();
  return data.settings;
}

module.exports = {
  init, get, buildText, setVisible, updateSettings, resetSettings,
  SLIDE_SIDES, FILE_PATH,
};
