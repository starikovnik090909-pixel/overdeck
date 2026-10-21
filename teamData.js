// teamData.js
// Данные виджета "Панель команды" (вкладка "Ивент") — два зеркальных
// виджета, left и right, каждый со своими 5 игроками и названием, плюс
// ОБЩИЕ настройки размеров/цветов (одни на обе стороны, чтобы команды
// визуально совпадали). Текстовые данные, ссылки на файлы и настройки —
// здесь, в team_data.json; сами файлы (фото/логотипы) лежат в
// uploads/team/ (см. server.js).

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'team_data.json');
const PLAYERS_PER_TEAM = 5;

/** Кадрирование фото: x, y — какая точка снимка (0…1) стоит в центре рамки; zoom — приближение (1 = как «заполнить рамку»). */
const CROP_DEFAULT = { x: 0.5, y: 0.5, zoom: 1 };
const CROP_ZOOM_MAX = 4;

function normalizeCrop(raw) {
  if (!raw || typeof raw !== 'object') return { ...CROP_DEFAULT };
  const num = (v, min, max, fb, digits) => { const n = Number(v); if (!Number.isFinite(n)) return fb; const k = 10 ** digits; return Math.round(Math.max(min, Math.min(max, n)) * k) / k; };
  return { x: num(raw.x, 0, 1, CROP_DEFAULT.x, 4), y: num(raw.y, 0, 1, CROP_DEFAULT.y, 4), zoom: num(raw.zoom, 1, CROP_ZOOM_MAX, 1, 2) };
}

/** Размер и положение логотипа ИМЕННО этой команды (px размера, % положения на карточке). null — своих значений нет, берутся общие настройки. */
function normalizeLogoLayout(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const size = Number(raw.size), x = Number(raw.x), y = Number(raw.y);
  if (![size, x, y].every(Number.isFinite)) return null;
  return {
    size: Math.round(Math.max(20, Math.min(320, size))),
    x: Math.round(Math.max(0, Math.min(100, x)) * 10) / 10,
    y: Math.round(Math.max(0, Math.min(100, y)) * 10) / 10,
  };
}

function emptyTeam() {
  return {
    teamName: '',
    logoUrl: null,
    logoLayout: null,
    players: Array.from({ length: PLAYERS_PER_TEAM }, () => ({
      nickname: '', role: '', about: '', photoUrl: null, crop: { ...CROP_DEFAULT },
    })),
  };
}

// Числовые настройки размеров/позиции — одни на оба виджета (left/right).
const NUMERIC_DEFAULTS = {
  cardWidth: 275,
  cardHeight: 410,
  cardGap: 20,
  logoSize: 90,
  nameFontSize: 28,
  nickFontSize: 27,
  roleFontSize: 12, // раньше было жёстко 45% от nickFontSize (~12px при 27px) — теперь отдельная настраиваемая величина
  aboutLabelFontSize: 9, // заголовок "О ИГРОКЕ" — раньше зашит в CSS
  aboutFontSize: 14,
  // Позиция логотипа внутри карточки, в процентах от её ширины/высоты —
  // логотип свободно "плавает" поверх фото/середины/низа, не привязан к слоту.
  logoPositionX: 78,
  logoPositionY: 62,
};

// Список шрифтов — тот же, что и в "Теме ивента" (eventTheme.js). Не переиспользуем импортом оттуда:
// в проекте так и с остальными виджетами — каждый держит свою копию маленьких констант, а не общий модуль.
const FONT_OPTIONS = ['Inter', 'Cinzel', 'Georgia', 'Rubik', 'Beaufort for LOL', 'Spiegel'];

// Свой выбор шрифта панели команды — базовый; если для "Карточек команд" включена "Тема ивента", её шрифты
// перекрывают эти (как и раньше — themeTitleFont/themeDataFont в overlay имеют приоритет), см. public/team-panel.js.
const FONT_DEFAULTS = {
  nameFont: 'Inter', // название команды
  bodyFont: 'Inter', // ник, роль, "о игроке"
};

// Цветовые настройки — два независимых градиента (заливка карточки, обводка).
const COLOR_DEFAULTS = {
  cardFillStart: '#1a1f3d',
  cardFillEnd: '#3a2560',
  cardBorderStart: '#c9a24a',
  cardBorderEnd: '#6a5acd',
  // Роль игрока и текст "О игроке" раньше были зашиты в CSS напрямую
  // (#b9a8e0/#e7dcf5) — теперь одно настраиваемое поле на оба места.
  labelTextColor: '#b9a8e0',
};

// Расположение карточек: false — в ряд по горизонтали (как было), true — столбиком сверху вниз. Тумблер вверху вкладки «Команды».
const BOOLEAN_DEFAULTS = { verticalLayout: false };

function defaultSettings() {
  return { ...NUMERIC_DEFAULTS, ...FONT_DEFAULTS, ...COLOR_DEFAULTS, ...BOOLEAN_DEFAULTS };
}

function defaults() {
  return { left: emptyTeam(), right: emptyTeam(), settings: defaultSettings(), settingsDefaults: defaultSettings() };
}

let data = null;

function normalizeTeam(raw) {
  const base = emptyTeam();
  if (!raw || typeof raw !== 'object') return base;
  return {
    teamName: typeof raw.teamName === 'string' ? raw.teamName : '',
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    logoLayout: normalizeLogoLayout(raw.logoLayout),
    players: base.players.map((p, i) => {
      const rp = Array.isArray(raw.players) ? raw.players[i] : null;
      return {
        nickname: rp && typeof rp.nickname === 'string' ? rp.nickname : '',
        role: rp && typeof rp.role === 'string' ? rp.role : '',
        about: rp && typeof rp.about === 'string' ? rp.about : '',
        photoUrl: rp && typeof rp.photoUrl === 'string' ? rp.photoUrl : null,
        crop: normalizeCrop(rp && rp.crop),
      };
    }),
  };
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isValidColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

const SETTINGS_LIMITS = {
  cardWidth: [120, 400],
  cardHeight: [220, 560],
  cardGap: [-60, 40], // отрицательный зазор = карточки лежат внахлёст
  logoSize: [20, 320],
  nameFontSize: [11, 100],
  nickFontSize: [14, 40],
  roleFontSize: [6, 30],
  aboutLabelFontSize: [6, 20],
  aboutFontSize: [9, 26],
  logoPositionX: [0, 100],
  logoPositionY: [0, 100],
};

function normalizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const result = {};
  Object.entries(NUMERIC_DEFAULTS).forEach(([key, fallback]) => {
    const [min, max] = SETTINGS_LIMITS[key];
    result[key] = clampNum(raw[key], min, max, fallback);
  });
  Object.entries(FONT_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = FONT_OPTIONS.includes(raw[key]) ? raw[key] : fallback;
  });
  Object.entries(COLOR_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = isValidColor(raw[key]) ? raw[key] : fallback;
  });
  Object.entries(BOOLEAN_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback;
  });
  return result;
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      data = {
        left: normalizeTeam(raw.left),
        right: normalizeTeam(raw.right),
        settings: normalizeSettings(raw.settings),
        settingsDefaults: normalizeSettings(raw.settingsDefaults),
      };
      return;
    }
  } catch (e) {
    console.warn('[Панель команды] Не удалось прочитать team_data.json, начинаем с пустых команд:', e.message);
  }
  data = defaults();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Панель команды] Не удалось сохранить team_data.json:', e.message);
  }
}

function init() {
  load();
}

function getAll() {
  return data;
}

function getSide(side) {
  return data[side] || null;
}

function getSettings() {
  return data.settings;
}

/** fields: {teamName?, players?: [{nickname, role, about}, ...]} — частичное обновление текстовых полей одной команды. */
function updateText(side, fields) {
  if (side !== 'left' && side !== 'right') return false;
  const team = data[side];
  if (typeof fields.teamName === 'string') team.teamName = fields.teamName;
  if (Array.isArray(fields.players)) {
    fields.players.forEach((p, i) => {
      if (!team.players[i] || !p) return;
      if (typeof p.nickname === 'string') team.players[i].nickname = p.nickname;
      if (typeof p.role === 'string') team.players[i].role = p.role;
      if (typeof p.about === 'string') team.players[i].about = p.about;
    });
  }
  save();
  return true;
}

/** Новое фото — новое кадрирование: по умолчанию сбрасывается (crop можно передать, например при загрузке пресета). */
function setPlayerPhoto(side, slot, url, crop) {
  if (side !== 'left' && side !== 'right') return false;
  const team = data[side];
  if (!team.players[slot]) return false;
  team.players[slot].photoUrl = url;
  team.players[slot].crop = normalizeCrop(crop);
  save();
  return true;
}

/** Кадрирование фото одного игрока этой команды. false — нет такой команды/слота или нечего кадрировать. */
function setPlayerCrop(side, slot, crop) {
  if (side !== 'left' && side !== 'right') return false;
  const p = data[side].players[slot];
  if (!p || !crop || typeof crop !== 'object') return false;
  p.crop = normalizeCrop(crop);
  save();
  return true;
}

/** Размер/положение логотипа этой команды; null — вернуть к общим настройкам. false — недопустимо. */
function setLogoLayout(side, layout) {
  if (side !== 'left' && side !== 'right') return false;
  if (layout === null) data[side].logoLayout = null;
  else { const l = normalizeLogoLayout(layout); if (!l) return false; data[side].logoLayout = l; }
  save();
  return true;
}

function setLogo(side, url) {
  if (side !== 'left' && side !== 'right') return false;
  data[side].logoUrl = url;
  save();
  return true;
}

/** fields — частичное обновление настроек размеров/цветов/позиции (общих для обеих сторон). */
function updateSettings(fields) {
  data.settings = normalizeSettings({ ...data.settings, ...(fields || {}) });
  save();
  return data.settings;
}

/** Сбрасывает настройки размеров/цветов/позиции к (пользовательскому) дефолту — данные команд не трогает. */
function resetSettings() {
  data.settings = { ...data.settingsDefaults, verticalLayout: data.settings.verticalLayout }; // расположение (ряд/столбик) — не размер и не цвет, сбросом не затрагивается
  save();
  return data.settings;
}

/** Запоминает текущие значения размеров/цветов как новый дефолт — именно они будут применяться по "Сбросить к дефолту". */
function saveCurrentAsDefaults() {
  data.settingsDefaults = { ...data.settings };
  save();
  return data.settingsDefaults;
}

/** Рекомендуемый размер источника "Браузер" в OBS для текущих настроек размеров. */
function getRecommendedSize() {
  const s = data.settings;
  const containerPadding = 24; // 12px с каждой стороны — см. #teamPanel в team-panel.css
  const nameHeaderHeight = Math.round(s.nameFontSize * 1.5) + 14;
  if (s.verticalLayout) { // столбиком: ширина — одна карточка, высота — пять карточек друг под другом
    return {
      width: s.cardWidth + containerPadding,
      height: PLAYERS_PER_TEAM * s.cardHeight + (PLAYERS_PER_TEAM - 1) * s.cardGap + nameHeaderHeight + containerPadding,
    };
  }
  const width = PLAYERS_PER_TEAM * s.cardWidth + (PLAYERS_PER_TEAM - 1) * s.cardGap + containerPadding;
  const height = s.cardHeight + nameHeaderHeight + containerPadding;
  return { width: Math.max(width, s.cardWidth + containerPadding), height };
}

module.exports = {
  init, getAll, getSide, getSettings, updateText, setPlayerPhoto, setLogo, updateSettings, resetSettings, saveCurrentAsDefaults, getRecommendedSize, setPlayerCrop, setLogoLayout, normalizeCrop, normalizeLogoLayout,
  PLAYERS_PER_TEAM, FILE_PATH, SETTINGS_LIMITS, FONT_OPTIONS,
};
