// factData.js
// Данные виджета "Факт / Инфо-панель" (вкладка "Ивент") — одна панель:
// заголовок + текст, заполняется вручную через админку либо подгружается
// из сохранённой плашки (см. factPresets.js). Настройки размеров и
// анимации — здесь же, в fact_data.json. Без лучей и без свободной надписи
// (в отличие от MVP) — тут это не нужно по заданию.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'fact_data.json');

const NUMERIC_DEFAULTS = {
  cardWidth: 480,
  cardHeight: 160,
  titleFontSize: 20,
  textFontSize: 16,
  padding: 24,
  animationDurationMs: 600,
  displaySeconds: 12,
};

const NUMERIC_LIMITS = {
  cardWidth: [240, 900],
  cardHeight: [100, 400],
  titleFontSize: [12, 40],
  textFontSize: [10, 32],
  padding: [8, 60],
  animationDurationMs: [0, 3000],
  displaySeconds: [1, 300],
};

const SLIDE_SIDES = ['left', 'right', 'top', 'bottom'];
const ENUM_DEFAULTS = { slideSide: 'right' };
const ENUM_OPTIONS = { slideSide: SLIDE_SIDES };

function defaultSettings() {
  return { ...NUMERIC_DEFAULTS, ...ENUM_DEFAULTS };
}

function defaultData() {
  return {
    visible: false,
    title: 'Занимательный факт',
    text: '',
    settings: defaultSettings(),
  };
}

let data = null;

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const result = {};
  Object.entries(NUMERIC_DEFAULTS).forEach(([key, fallback]) => {
    const [min, max] = NUMERIC_LIMITS[key];
    result[key] = clampNum(raw[key], min, max, fallback);
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
    title: typeof raw.title === 'string' ? raw.title : base.title,
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
    console.warn('[Факт] Не удалось прочитать fact_data.json, начинаем с пустой панели:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Факт] Не удалось сохранить fact_data.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

/** fields: {title?, text?}. */
function updateText(fields) {
  const merged = { ...data, ...(fields || {}) };
  data = normalize(merged);
  save();
  return data;
}

function setVisible(visible) {
  data.visible = !!visible;
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
  init, get, updateText, setVisible, updateSettings, resetSettings,
  SLIDE_SIDES, FILE_PATH,
};
