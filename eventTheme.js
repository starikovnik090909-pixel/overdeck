// eventTheme.js
// "Тема ивента" — оформление для алертов вкладки "Ивент" (MVP, Факт, Сбор,
// Алерт о донате, Карточки команд, Турнирная сетка).
//
// ВАЖНО, часть 5 (переезд на независимые темы по виджетам): раньше была ОДНА
// общая тема, накладывавшаяся сразу на все отмеченные галочкой виджеты — из-за
// этого тема выглядела по-разному на разных виджетах (у каждого свои базовые
// настройки, с которыми накладывалась одна и та же тема) и правка одного поля
// сразу меняла все отмеченные виджеты одновременно, что и создавало путаницу
// в интерфейсе. Теперь у КАЖДОГО из APPLICABLE_WIDGETS — своя ПОЛНОСТЬЮ
// независимая копия темы и свой отдельный переключатель "включено". Редактируется
// по одному: выбрал виджет в интерфейсе — правишь именно его набор, остальные
// не трогаются. Тема по-прежнему НЕ хранится внутри mvpData.js/factData.js/
// fundData.js/fundAlertData.js/teamData.js/bracketData.js и не трогает их
// локальные настройки — применяется только поверх, в момент рассылки по
// WebSocket (см. getOverlayFor() + вызовы в server.js), и только если для
// этого виджета включено (widgets[key].enabled). Выключил — у алерта остаются
// ровно те локальные настройки, что были независимо от темы.
//
// Часть 5: настройки свечения (glowEnabled/glowIntensity, "золотые элементы"
// как цвет свечения) убраны целиком по прямому запросу — виджеты, читавшие
// themeGlowEnabled/themeGlowColor/themeGlowIntensity, теперь их не получают.
//
// Шрифты Beaufort for LOL и Spiegel — собственность Riot, здесь не
// поставляются: см. fonts.js — сервер сам находит их по подстроке в имени
// файла среди уже загруженных в fonts/, если пользователь их туда положит.
// Если не найдены — CSS сам откатится на fallback-шрифты (Cinzel/Marcellus/
// serif и Inter/Roboto/sans-serif) — рендер не ломается.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'event_theme.json');

const APPLICABLE_WIDGETS = ['mvp', 'fact', 'fund', 'fundAlert', 'teamCards', 'bracket'];
// Подписи для интерфейса — список виджетов внизу панели ("Виджет для настройки").
const WIDGET_LABELS = {
  mvp: 'MVP', fact: 'Факт', fund: 'Сбор', fundAlert: 'Алерт доната', teamCards: 'Карточки команд', bracket: 'Турнирная сетка',
};

const COLOR_DEFAULTS = {
  bgColor: '#1a1f3d',
  bgColorEnd: '#3a2560', // второй стоп градиента фона — отдельное поле (не считается автоматически от bgColor, плохо работает для уже тёмных пресетов вроде Hextech)
  accentColor: '#c9a24a',
  textColor: '#f0e6d2',
  goldColor: '#ffd700',
  labelTextColor: '#b9a8e0', // вторичный текст (роль игрока, подписи "KDA"/"Крипы", заголовок плашки сбора)
};

const NUMERIC_DEFAULTS = {
  borderRadius: 14,
  borderWidth: 2,
  textureIntensity: 50, // % — насколько заметна текстура (0 = почти не видна, 100 = заметная)
  panelOpacity: 100, // % — прозрачность панели этого виджета (0=прозрачно, 100=непрозрачно)
  titleFontWeight: 400,
  dataFontWeight: 400,
  bgImageOpacity: 100, // % — прозрачность ТОЛЬКО фонового изображения/видео плашки, текст/обводка/плашка не затрагиваются
  bgImageDarken: 0, // % — затемняющий слой поверх фона плашки, под текстом
};
const NUMERIC_LIMITS = {
  borderRadius: [0, 40],
  borderWidth: [0, 8],
  textureIntensity: [0, 100],
  panelOpacity: [0, 100],
  titleFontWeight: [100, 900],
  dataFontWeight: [100, 900],
  bgImageOpacity: [0, 100],
  bgImageDarken: [0, 100],
};

const BOOLEAN_DEFAULTS = {
  textureEnabled: false,
};

const BORDER_STYLES = ['gradient', 'solid', 'double'];
const TEXTURE_TYPES = ['metal', 'runes', 'noise'];
// Реальные панели в UI-ките LoL используют скошенные (шамферные) углы, а не
// скруглённые — отдельный переключатель формы, независимый от borderStyle.
// При cornerStyle='chamfer' значение borderRadius переиспользуется как
// размер среза угла в px (тот же слайдер, другой смысл).
const CORNER_STYLES = ['round', 'chamfer'];
// Часть 6: при cornerStyle='chamfer' раньше срезались ВСЕ 4 угла сразу — теперь можно выбрать любое подмножество.
const CORNER_KEYS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const DEFAULT_CHAMFER_CORNERS = { topLeft: true, topRight: true, bottomLeft: true, bottomRight: true }; // все 4 — как было раньше, чтобы у существующих тем ничего не поменялось молча
const BG_IMAGE_FITS = ['cover', 'stretch', 'contain']; // "Фон плашек" — режим заполнения (stretch = CSS background-size:100% 100%)
const ENUM_DEFAULTS = {
  borderStyle: 'gradient',
  textureType: 'metal',
  cornerStyle: 'round',
  bgImageFit: 'cover',
};
const ENUM_OPTIONS = {
  borderStyle: BORDER_STYLES,
  textureType: TEXTURE_TYPES,
  cornerStyle: CORNER_STYLES,
  bgImageFit: BG_IMAGE_FITS,
};

// 'Beaufort for LOL'/'Spiegel' — фирменные шрифты Riot, физически не
// поставляются (см. шапку файла); фоллбэки — в CSS-стеках каждого виджета.
const FONT_OPTIONS = ['Inter', 'Cinzel', 'Georgia', 'Rubik', 'Beaufort for LOL', 'Spiegel'];
const TEXT_DEFAULTS = {
  titleFont: 'Inter',
  dataFont: 'Inter',
};

const PRESET_NAMES = ['hextech', 'minimal', 'default'];

function baselineTheme() {
  return {
    bgColor: '#1a1f3d', bgColorEnd: '#3a2560',
    accentColor: '#c9a24a', textColor: '#f0e6d2', goldColor: '#ffd700', labelTextColor: '#b9a8e0',
    titleFont: 'Inter', dataFont: 'Inter', titleFontWeight: 400, dataFontWeight: 400,
    borderStyle: 'gradient', cornerStyle: 'round', borderWidth: 2, borderRadius: 14,
    textureEnabled: false, textureType: 'metal', textureIntensity: 50,
    panelOpacity: 100,
    bgImageUrl: null, bgImageOpacity: 100, bgImageDarken: 0, bgImageFit: 'cover',
    chamferCorners: { ...DEFAULT_CHAMFER_CORNERS },
  };
}

/** { topLeft, topRight, bottomLeft, bottomRight } — каждое либо явный boolean из raw, либо дефолт (true). Отдельная функция, т.к. это объект, а не примитив — общий цикл по *_DEFAULTS в normalizeTheme() для объектов не годится. */
function normalizeChamferCorners(raw) {
  const result = {};
  CORNER_KEYS.forEach((key) => {
    result[key] = raw && typeof raw === 'object' && typeof raw[key] === 'boolean' ? raw[key] : DEFAULT_CHAMFER_CORNERS[key];
  });
  return result;
}

// Пресет 1 — Hextech (League of Legends), по официальным ассетам Riot
// (HT_MetalLibrary.ai — реальный UI-кит клиента LoL). Цвета сняты напрямую с
// этих файлов через анализ гистограммы пикселей: #1e282d — доминирующий фон
// панели; #172023 — тон закраски шестигранников (второй стоп градиента);
// #f0e6d2 — самый частый "кремовый" тон текста; #cdbe91 — золотой цвет текста
// кнопки "OK" в модальном окне. Скошенные (не скруглённые) углы — тоже с
// натуры: угловые скобки на странице "Frames/Dividers" срезаны, не закруглены.
const HEXTECH_PRESET = {
  bgColor: '#1e282d', bgColorEnd: '#172023',
  accentColor: '#172023', textColor: '#f0e6d2', goldColor: '#cdbe91', labelTextColor: '#8e9396',
  titleFont: 'Beaufort for LOL', dataFont: 'Spiegel', titleFontWeight: 700, dataFontWeight: 400,
  borderStyle: 'double', cornerStyle: 'chamfer', borderWidth: 2, borderRadius: 10,
  textureEnabled: true, textureType: 'metal', textureIntensity: 35,
  panelOpacity: 100,
};

// Пресет 2 — Минимализм: нейтральный, без эффектов.
const MINIMAL_PRESET = {
  bgColor: '#1a1a1a', bgColorEnd: '#1a1a1a',
  accentColor: '#cccccc', textColor: '#ffffff', goldColor: '#cccccc', labelTextColor: '#999999',
  titleFont: 'Inter', dataFont: 'Inter', titleFontWeight: 500, dataFontWeight: 400,
  borderStyle: 'solid', cornerStyle: 'round', borderWidth: 1, borderRadius: 8,
  textureEnabled: false, textureType: 'metal', textureIntensity: 0,
  panelOpacity: 100,
};

const PRESETS = { hextech: HEXTECH_PRESET, minimal: MINIMAL_PRESET, default: baselineTheme() };

function defaultTheme() {
  return { ...baselineTheme(), activePreset: null };
}

/** Один виджет: включён ли для него оверлей темы + своя, независимая от остальных виджетов, копия темы. */
function defaultWidgetEntry() {
  return { enabled: false, theme: defaultTheme() };
}

function defaultData() {
  const widgets = {};
  APPLICABLE_WIDGETS.forEach((key) => { widgets[key] = defaultWidgetEntry(); });
  return { widgets };
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

function normalizeTheme(raw) {
  const base = defaultTheme();
  if (!raw || typeof raw !== 'object') return base;
  const result = {};
  Object.entries(COLOR_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = isValidColor(raw[key]) ? raw[key] : fallback;
  });
  Object.entries(NUMERIC_DEFAULTS).forEach(([key, fallback]) => {
    const [min, max] = NUMERIC_LIMITS[key];
    result[key] = clampNum(raw[key], min, max, fallback);
  });
  Object.entries(BOOLEAN_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback;
  });
  Object.entries(ENUM_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = ENUM_OPTIONS[key].includes(raw[key]) ? raw[key] : fallback;
  });
  Object.entries(TEXT_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = FONT_OPTIONS.includes(raw[key]) ? raw[key] : fallback;
  });
  result.activePreset = PRESET_NAMES.includes(raw.activePreset) ? raw.activePreset : null;
  result.bgImageUrl = typeof raw.bgImageUrl === 'string' && raw.bgImageUrl.trim() ? raw.bgImageUrl : null;
  result.chamferCorners = normalizeChamferCorners(raw.chamferCorners);
  return result;
}

function normalizeWidgetEntry(raw) {
  return { enabled: !!(raw && raw.enabled), theme: normalizeTheme(raw && raw.theme) };
}

/**
 * Миграция со старого формата ({appliesTo, theme} — одна общая тема на все отмеченные виджеты) на новый
 * ({widgets: {ключ: {enabled, theme}}} — своя копия на каждый виджет): у виджетов, где раньше стояла
 * галочка, новая копия темы стартует СО СТАРЫМИ значениями (не с дефолта) — настройка не теряется, просто
 * с этого момента у каждого виджета она правится независимо от остальных.
 */
function migrateLegacyFormat(raw) {
  if (!raw || typeof raw !== 'object' || raw.widgets) return null; // уже новый формат или пусто
  if (!raw.appliesTo && !raw.theme) return null;
  const legacyTheme = normalizeTheme(raw.theme);
  const widgets = {};
  APPLICABLE_WIDGETS.forEach((key) => {
    const wasEnabled = !!(raw.appliesTo && raw.appliesTo[key]);
    widgets[key] = { enabled: wasEnabled, theme: { ...legacyTheme } };
  });
  return { widgets };
}

function normalize(raw) {
  const migrated = migrateLegacyFormat(raw);
  const source = migrated || raw;
  if (!source || typeof source !== 'object') return defaultData();
  const widgets = {};
  APPLICABLE_WIDGETS.forEach((key) => {
    widgets[key] = normalizeWidgetEntry(source.widgets && source.widgets[key]);
  });
  return { widgets };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      const migrated = migrateLegacyFormat(raw);
      data = normalize(raw);
      if (migrated) { save(); console.log('[Тема ивента] Старый формат файла (общая тема на все виджеты) переведён на независимые темы по виджетам.'); }
      return;
    }
  } catch (e) {
    console.warn('[Тема ивента] Не удалось прочитать event_theme.json, начинаем с дефолтов:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Тема ивента] Не удалось сохранить event_theme.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

function getWidget(widgetKey) {
  return data.widgets[widgetKey] || null;
}

/** Ручное изменение полей ОДНОГО виджета — сбрасывает его activePreset в null (кроме случая, когда сам fields.theme его явно переустанавливает, см. applyPreset). Другие виджеты не трогает. */
function update(widgetKey, fields) {
  if (!APPLICABLE_WIDGETS.includes(widgetKey)) return data;
  const current = data.widgets[widgetKey];
  const incomingTheme = (fields || {}).theme || {};
  const mergedEntry = {
    enabled: 'enabled' in (fields || {}) ? !!fields.enabled : current.enabled,
    theme: { ...current.theme, ...incomingTheme, activePreset: 'activePreset' in incomingTheme ? incomingTheme.activePreset : null },
  };
  data.widgets[widgetKey] = normalizeWidgetEntry(mergedEntry);
  save();
  return data;
}

/** Применяет пресет целиком к ОДНОМУ виджету — дальше можно поправить руками, правка любого поля снимет activePreset (см. update()). Другие виджеты не трогает. */
function applyPreset(widgetKey, name) {
  if (!APPLICABLE_WIDGETS.includes(widgetKey)) return null;
  const preset = PRESETS[name];
  if (!preset) return data.widgets[widgetKey].theme;
  const current = data.widgets[widgetKey];
  data.widgets[widgetKey] = { enabled: current.enabled, theme: normalizeTheme({ ...current.theme, ...preset, activePreset: name }) };
  save();
  return data.widgets[widgetKey].theme;
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0xff) + Math.round(255 * (percent / 100));
  let b = (num & 0xff) + Math.round(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Возвращает набор полей для НАЛОЖЕНИЯ поверх локальных settings конкретного
 * виджета перед рассылкой — или null, если у этого виджета тема выключена.
 * Поля называются так, как их уже понимают public/*.js. (themeGlow* больше
 * не возвращается — свечение как настройка темы убрано.)
 */
function getOverlayFor(widgetKey) {
  const entry = data.widgets[widgetKey];
  if (!entry || !entry.enabled) return null;
  const t = entry.theme;
  return {
    cardFillStart: t.bgColor,
    cardFillEnd: t.bgColorEnd,
    cardBorderStart: t.accentColor,
    cardBorderEnd: t.goldColor,
    themeTextColor: t.textColor,
    themeLabelColor: t.labelTextColor,
    themeTitleFont: t.titleFont,
    themeDataFont: t.dataFont,
    themeTitleFontWeight: t.titleFontWeight,
    themeDataFontWeight: t.dataFontWeight,
    themeBorderRadius: t.borderRadius,
    themeBorderWidth: t.borderWidth,
    themeBorderStyle: t.borderStyle,
    themeCornerStyle: t.cornerStyle,
    themeChamferCorners: t.chamferCorners,
    themeTextureEnabled: t.textureEnabled,
    themeTextureType: t.textureType,
    themeTextureIntensity: t.textureIntensity,
    themePanelOpacity: t.panelOpacity,
    themeBgImageUrl: t.bgImageUrl,
    themeBgImageOpacity: t.bgImageOpacity,
    themeBgImageDarken: t.bgImageDarken,
    themeBgImageFit: t.bgImageFit,
  };
}

/** Устанавливает/сбрасывает (null) фон плашек ОДНОГО виджета — обёртка над update() (в server.js там же удаляется старый файл с диска при замене/сбросе). */
function setBackgroundImageUrl(widgetKey, url) {
  return update(widgetKey, { theme: { bgImageUrl: url } });
}

module.exports = {
  init, get, getWidget, update, applyPreset, getOverlayFor, shadeColor, setBackgroundImageUrl,
  APPLICABLE_WIDGETS, WIDGET_LABELS, FONT_OPTIONS, BORDER_STYLES, TEXTURE_TYPES, PRESET_NAMES, NUMERIC_LIMITS, BG_IMAGE_FITS,
  FILE_PATH,
};
