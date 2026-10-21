// fundBoxData.js
// Данные виджета "Коробочка сбора" (внутри блока "Сбор") — коробка, в
// которую падают монетки при донатах, с уровнями номинала (1000₽, 2000₽,
// 3000₽...). Курс: 1 монетка = coinValue рублей. При заполнении уровня —
// коробка "переполняется" и начинается заново со следующим номиналом;
// остаток монет от доната, который перевалил через край уровня, уходит
// уже в СЛЕДУЮЩИЙ уровень (см. addDonationAmount).

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'fund_box_data.json');

const NUMERIC_DEFAULTS = {
  startDenomination: 1000,
  levelStep: 1000,
  coinValue: 100,
};
const NUMERIC_LIMITS = {
  startDenomination: [100, 1000000],
  levelStep: [0, 1000000], // 0 = номинал не растёт от уровня к уровню
  coinValue: [1, 100000],
};

const SETTINGS_NUMERIC_DEFAULTS = {
  bounciness: 40, // % — restitution в matter.js считается как bounciness/100
  friction: 30, // % — friction в matter.js считается как friction/100
  // Плашка-подложка позади коробки, чтобы не терялась на фоне игры — простой прямоугольник, без
  // картинки (в отличие от "Фон плашек" в "Теме ивента" — тут по прямому запросу нужен именно квадрат).
  // По умолчанию 0 — для тех, у кого уже настроен виджет, ничего не появится молча за спиной.
  backgroundOpacity: 0, // % — прозрачность самой плашки (0 = не видна вообще)
  backgroundDarken: 0, // % — отдельный затемняющий слой поверх плашки, под текстом/коробкой (тот же приём, что и у "Фон плашек")
};
const SETTINGS_NUMERIC_LIMITS = {
  bounciness: [0, 100],
  friction: [0, 100],
  backgroundOpacity: [0, 100],
  backgroundDarken: [0, 100],
};
const SETTINGS_COLOR_DEFAULTS = {
  boxColor: '#c9a24a',
  coinColor: '#ffd700',
  coinTextColor: '#5a3d0a', // номинал НА монете — тёмное золото, читается на золотой монете
  textColor: '#f0e6d2', // подпись под коробкой и номинал уровня НАД коробкой
};
const SETTINGS_BOOLEAN_DEFAULTS = {
  // Раньше коробка была видна на экране всегда. При включении — виджет скрыт, пока не пришёл донат:
  // тогда появляется, проигрывает падение монеток и через паузу после того, как они улеглись, прячется
  // снова (см. fund-box.js). "enabled" (общий выключатель ниже) при этом всё так же имеет приоритет —
  // если он выключен, виджет не покажется, даже если донат пришёл.
  showOnlyOnDonation: false,
};

function defaultSettings() {
  return { ...SETTINGS_NUMERIC_DEFAULTS, ...SETTINGS_COLOR_DEFAULTS, ...SETTINGS_BOOLEAN_DEFAULTS };
}

function defaultData() {
  return {
    enabled: true,
    textTemplate: 'Что будет за наполнение',
    currentLevel: 1,
    collectedAmount: 0,
    totalCollectedAmount: 0, // сколько собрано ВСЕГО, за всё время (не сбрасывается при переходе на новый уровень — см. addDonationAmount) — именно это число теперь показывается над коробкой
    ...NUMERIC_DEFAULTS,
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
  Object.entries(SETTINGS_NUMERIC_DEFAULTS).forEach(([key, fallback]) => {
    const [min, max] = SETTINGS_NUMERIC_LIMITS[key];
    result[key] = clampNum(raw[key], min, max, fallback);
  });
  Object.entries(SETTINGS_COLOR_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = isValidColor(raw[key]) ? raw[key] : fallback;
  });
  Object.entries(SETTINGS_BOOLEAN_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback;
  });
  return result;
}

function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const result = { ...base };
  result.enabled = typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled;
  result.textTemplate = typeof raw.textTemplate === 'string' ? raw.textTemplate : base.textTemplate;
  result.currentLevel = clampNum(raw.currentLevel, 1, 100000, 1);
  Object.entries(NUMERIC_DEFAULTS).forEach(([key, fallback]) => {
    const [min, max] = NUMERIC_LIMITS[key];
    result[key] = clampNum(raw[key], min, max, fallback);
  });
  result.collectedAmount = clampNum(raw.collectedAmount, 0, 100000000, 0);
  result.totalCollectedAmount = clampNum(raw.totalCollectedAmount, 0, 1000000000, 0);
  result.settings = normalizeSettings(raw.settings);
  return result;
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')));
      return;
    }
  } catch (e) {
    console.warn('[Коробочка сбора] Не удалось прочитать fund_box_data.json, начинаем с дефолтов:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Коробочка сбора] Не удалось сохранить fund_box_data.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

function getCurrentDenomination() {
  return data.startDenomination + (data.currentLevel - 1) * data.levelStep;
}

// Автоматический размер коробки И монеток — под конкретный номинал уровня.
//
// Раньше коробка считалась под ФИКСИРОВАННЫЙ (заданный вручную) размер
// монетки, а в высоту закладывался отдельный "запас на падение" — из-за
// этого запаса коробка визуально заполнялась монетками только процентов на
// 60% даже когда уровень уже закрыт (сам запас никуда не девался, просто
// торчал пустым сверху). На самом деле падать монеткам есть где и без
// этого запаса — они стартуют ВЫШЕ канвы (см. fund-box.js: spawnCoin создаёт
// монетку с y < 0, то есть уже за пределами видимой коробки), так что
// резервировать под это ещё и высоту самой коробки было лишним — это и
// было причиной жалобы "заполняется только на 60%".
//
// Теперь наоборот: РАЗМЕР МОНЕТКИ считается так, чтобы ровно "нужное
// количество" монет (номинал / стоимость монетки) плотно заполнило сетку
// внутри коробки — и одновременно с ростом количества монет сама монетка
// становится МЕНЬШЕ (чем их больше — тем они мельче), а коробка растёт
// лишь очень умеренно (пропорционально количеству монет в степени 0.15,
// а не напрямую) — именно так, как и было явно запрошено.
const REF_COINS = 10; // "опорное" количество монет — на нём коробка использует REF_COIN_SIZE как есть
const REF_COIN_SIZE = 30; // размер монетки при REF_COINS монетках, px
const COIN_SHRINK_EXPONENT = 0.35; // насколько быстро мельчает монетка с ростом количества
const GRID_ASPECT_BIAS = 1.3; // сетка чуть шире, чем выше — коробка смотрится естественнее
const GRID_PACK_FACTOR = 1.05; // небольшой зазор между монетками в сетке (не идеальная упаковка впритык)
const GRID_BUFFER_RATIO = 0.25; // запас на стенки/воздух — доля от диаметра монеты, а не фиксированные пиксели
const COIN_SIZE_LIMITS = [8, 48];
const BOX_WIDTH_LIMITS = [100, 400]; // верхняя граница — как и было явно предложено в задании
const BOX_HEIGHT_LIMITS = [80, 300];

function computeBoxAndCoinSize(denomination, coinValue) {
  const coinsPerLevel = Math.max(1, Math.round(denomination / coinValue));

  const rawCoinSize = REF_COIN_SIZE * (REF_COINS / coinsPerLevel) ** COIN_SHRINK_EXPONENT;
  const coinSize = clampNum(rawCoinSize, COIN_SIZE_LIMITS[0], COIN_SIZE_LIMITS[1], REF_COIN_SIZE);

  const columns = Math.max(1, Math.ceil(Math.sqrt(coinsPerLevel * GRID_ASPECT_BIAS)));
  const rows = Math.max(1, Math.ceil(coinsPerLevel / columns));
  const buffer = coinSize * GRID_BUFFER_RATIO;
  const width = clampNum(columns * coinSize * GRID_PACK_FACTOR + buffer, BOX_WIDTH_LIMITS[0], BOX_WIDTH_LIMITS[1], 160);
  const height = clampNum(rows * coinSize * GRID_PACK_FACTOR + buffer, BOX_HEIGHT_LIMITS[0], BOX_HEIGHT_LIMITS[1], 120);

  return { width, height, coinSize, coinsPerLevel };
}

function getBoxSize(denomination) {
  return computeBoxAndCoinSize(denomination, data.coinValue);
}

function getCurrentBoxSize() {
  return getBoxSize(getCurrentDenomination());
}

/** fields: {textTemplate?, startDenomination?, levelStep?, coinValue?, enabled?}. */
function updateText(fields) {
  const merged = { ...data, ...(fields || {}) };
  data = normalize(merged);
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

/** Сбрасывает коробку к начальному уровню (уровень 1, ничего не собрано). Настройки/шаблон текста не трогает. */
function resetProgress() {
  data.currentLevel = 1;
  data.collectedAmount = 0;
  data.totalCollectedAmount = 0;
  save();
  return data;
}

/**
 * Добавляет донат в виде монеток. Может пересечь границу нескольких
 * уровней за один донат — тогда события идут по порядку: пачка монет в
 * текущий уровень, "levelup", пачка монет в следующий уровень, и т.д.
 * Возвращает массив событий для анимации на клиенте:
 *   {type:'coins', count, level, denomination}
 *   {type:'levelup', newLevel, newDenomination}
 */
function addDonationAmount(amount) {
  let coinsToAdd = Math.floor(Number(amount) / data.coinValue);
  const events = [];
  let guard = 0; // защита от бесконечного цикла, если levelStep=0 и coinValue гигантский относительно суммы — практически недостижимо, но на всякий случай
  while (coinsToAdd > 0 && guard < 10000) {
    guard += 1;
    const denomination = getCurrentDenomination();
    const remaining = Math.max(0, denomination - data.collectedAmount);
    const coinsNeededToFill = Math.max(1, Math.ceil(remaining / data.coinValue));
    const coinsThisBatch = Math.min(coinsToAdd, coinsNeededToFill);

    data.collectedAmount += coinsThisBatch * data.coinValue;
    data.totalCollectedAmount += coinsThisBatch * data.coinValue;
    events.push({ type: 'coins', count: coinsThisBatch, level: data.currentLevel, denomination });
    coinsToAdd -= coinsThisBatch;

    if (data.collectedAmount >= denomination) {
      data.currentLevel += 1;
      data.collectedAmount = 0;
      const newDenomination = getCurrentDenomination();
      events.push({ type: 'levelup', newLevel: data.currentLevel, newDenomination, newBoxSize: getBoxSize(newDenomination) });
    }
  }
  save();
  return events;
}

module.exports = {
  init, get, getCurrentDenomination, getBoxSize, getCurrentBoxSize, computeBoxAndCoinSize, updateText, updateSettings, resetSettings, resetProgress, addDonationAmount,
  FILE_PATH,
};
