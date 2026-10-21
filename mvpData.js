// mvpData.js
// Данные виджета "MVP матча" (вкладка "Ивент") — одна панель, заполняется
// вручную через админку (никакого автоматического получения данных из игры
// больше нет в проекте — см. память проекта). Фото — в uploads/mvp/,
// текстовые данные и настройки размеров/надписи — здесь, в mvp_data.json.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'mvp_data.json');

const ROLES = ['', 'Топ', 'Лес', 'Мид', 'АДК', 'Сапорт'];

// Числовые настройки размеров/позиции/анимации.
const NUMERIC_DEFAULTS = {
  cardWidth: 420,
  cardHeight: 150,
  photoSize: 150,
  nickFontSize: 33,
  dataFontSize: 16,
  labelFontSize: 29,
  // Позиция надписи "MVP" — в процентах от размеров панели, но диапазон
  // шире 0-100: может заступать на панель или висеть над/под/сбоку от неё.
  labelPositionX: 51,
  labelPositionY: -2,
  // Анимация выезда/уезда панели.
  animationDurationMs: 1650,
  displaySeconds: 300,
  // Лучи/прожекторы — интенсивность и скорость как проценты 0-100,
  // переводятся в реальные opacity/длительность на клиенте.
  raysIntensity: 50,
  raysSpeed: 50,
  raysFadeInDelayMs: 400, // сколько ждать ПОСЛЕ окончания выезда, прежде чем начать зажигать лучи
  raysFadeOutLeadMs: 400, // за сколько МС до начала уезда лучи должны погаснуть
};

const NUMERIC_LIMITS = {
  cardWidth: [280, 700],
  cardHeight: [100, 300],
  photoSize: [80, 260],
  nickFontSize: [12, 40],
  dataFontSize: [9, 24],
  labelFontSize: [10, 60],
  labelPositionX: [-50, 150],
  labelPositionY: [-80, 150],
  animationDurationMs: [0, 3000],
  displaySeconds: [1, 300],
  raysIntensity: [0, 100],
  raysSpeed: [0, 100],
  raysFadeInDelayMs: [0, 2000],
  raysFadeOutLeadMs: [0, 2000],
};

// Цветовые настройки.
const COLOR_DEFAULTS = {
  labelColor: '#FFD700',
  raysColor: '#FFD700',
  // Вторичный текст ("герой · роль" и подписи "KDA"/"Крипы"/"Урон"/"Золото")
  // раньше был зашит в CSS напрямую (#b9a8e0/#8f88a8) — теперь настраиваемое
  // поле, как и просили. Не путать с labelColor выше — тот про надпись "MVP".
  statLabelColor: '#b9a8e0',
};

// Тумблеры (булевы настройки).
const BOOLEAN_DEFAULTS = {
  showCreepScore: true,
  raysEnabled: true,
};

// Текстовые настройки (не размер/цвет/тумблер — просто строка).
const TEXT_DEFAULTS = {
  labelText: 'MVP',
};

// Настройки с фиксированным набором значений.
const SLIDE_SIDES = ['left', 'right', 'top', 'bottom'];
const ENUM_DEFAULTS = {
  slideSide: 'left',
};
const ENUM_OPTIONS = {
  slideSide: SLIDE_SIDES,
};

function defaultSettings() {
  return { ...NUMERIC_DEFAULTS, ...COLOR_DEFAULTS, ...BOOLEAN_DEFAULTS, ...TEXT_DEFAULTS, ...ENUM_DEFAULTS };
}

// Сохранено для обратной совместимости — где-то может использоваться извне.
const SETTINGS_LIMITS = NUMERIC_LIMITS;

function defaultData() {
  return {
    visible: false,
    photoUrl: null,
    nickname: '',
    hero: '',
    role: '',
    kills: 0,
    deaths: 0,
    assists: 0,
    creepScore: 0,
    damage: 0,
    gold: 0,
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
  Object.entries(BOOLEAN_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback;
  });
  Object.entries(TEXT_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = typeof raw[key] === 'string' ? raw[key] : fallback;
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
    photoUrl: typeof raw.photoUrl === 'string' ? raw.photoUrl : null,
    nickname: typeof raw.nickname === 'string' ? raw.nickname : '',
    hero: typeof raw.hero === 'string' ? raw.hero : '',
    role: ROLES.includes(raw.role) ? raw.role : '',
    kills: clampNum(raw.kills, 0, 99, 0),
    deaths: clampNum(raw.deaths, 0, 99, 0),
    assists: clampNum(raw.assists, 0, 99, 0),
    creepScore: clampNum(raw.creepScore, 0, 999, 0),
    damage: clampNum(raw.damage, 0, 999999, 0),
    gold: clampNum(raw.gold, 0, 999999, 0),
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
    console.warn('[MVP] Не удалось прочитать mvp_data.json, начинаем с пустой панели:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[MVP] Не удалось сохранить mvp_data.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

/** fields: {nickname?, hero?, role?, kills?, deaths?, assists?, creepScore?, damage?, gold?}. */
function updateText(fields) {
  const merged = { ...data, ...(fields || {}) };
  data = normalize(merged);
  save();
  return data;
}

function setPhoto(url) {
  data.photoUrl = url;
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

/** Сбрасывает размеры/анимацию/надпись к стандартным значениям (данные самого MVP — ник/фото и т.п. — не трогает). */
function resetSettings() {
  data.settings = defaultSettings();
  save();
  return data.settings;
}

module.exports = {
  init, get, updateText, setPhoto, setVisible, updateSettings, resetSettings,
  ROLES, SLIDE_SIDES, SETTINGS_LIMITS, FILE_PATH,
};
