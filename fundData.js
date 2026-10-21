// fundData.js
// Данные виджета "Сбор" (вкладка "Ивент") — плашка призового фонда, висит
// в OBS постоянно (не выезжает, не скрывается). Сумма растёт автоматически
// при каждом донате (см. handleDonation в server.js, который дёргает
// addAmount() рядом с уже существующей обработкой донатов — сам приём
// донатов через DonationAlerts/DonateX не трогается, только добавляется
// ещё один получатель тех же событий). Плюс ручная корректировка и сброс.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'fund_data.json');

const NUMERIC_DEFAULTS = {
  cardWidth: 340,
  cardHeight: 110,
  titleFontSize: 16,
  amountFontSize: 32,
  padding: 20,
};

const NUMERIC_LIMITS = {
  cardWidth: [180, 700],
  cardHeight: [70, 300],
  titleFontSize: [10, 32],
  amountFontSize: [16, 64],
  padding: [4, 50],
};

const COLOR_DEFAULTS = {
  cardFillStart: '#1a1f3d',
  cardFillEnd: '#3a2560',
  cardBorderStart: '#c9a24a',
  cardBorderEnd: '#6a5acd',
  // Заголовок плашки ("Призовой фонд NEXUS CUP") раньше был зашит в CSS
  // напрямую (#b9a8e0) — теперь настраиваемое поле.
  titleLabelColor: '#b9a8e0',
};

function defaultSettings() {
  return { ...NUMERIC_DEFAULTS, ...COLOR_DEFAULTS };
}

function defaultData() {
  return {
    title: 'Призовой фонд NEXUS CUP',
    currency: '₽',
    amount: 0,
    settings: defaultSettings(),
  };
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
  return result;
}

function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  return {
    title: typeof raw.title === 'string' ? raw.title : base.title,
    currency: typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency : base.currency,
    amount: Number.isFinite(Number(raw.amount)) ? Number(raw.amount) : 0,
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
    console.warn('[Сбор] Не удалось прочитать fund_data.json, начинаем с нуля:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Сбор] Не удалось сохранить fund_data.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

/** fields: {title?, currency?}. */
function updateText(fields) {
  const merged = { ...data, ...(fields || {}) };
  data = normalize(merged);
  save();
  return data;
}

/** Ручная установка суммы (не прибавление — именно "поправить на конкретное число"). */
function setAmount(amount) {
  const n = Number(amount);
  data.amount = Number.isFinite(n) ? n : data.amount;
  save();
  return data;
}

/** Прибавляет сумму доната к текущему сбору — вызывается из handleDonation. */
function addAmount(amount) {
  const n = Number(amount);
  if (Number.isFinite(n) && n > 0) {
    data.amount += n;
    save();
  }
  return data;
}

function resetAmount() {
  data.amount = 0;
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
  init, get, updateText, setAmount, addAmount, resetAmount, updateSettings, resetSettings,
  FILE_PATH,
};
