// adminThemes.js
// "Настройки админки" — именованные темы ОФОРМЛЕНИЯ САМОЙ ПАНЕЛИ управления
// (фон/текст/акцент интерфейса), НЕ путать с двумя уже существующими в
// проекте штуками с похожим названием: themes.js (тема оверлея для OBS) и
// eventTheme.js ("Тема ивента" — оформление алертов вкладки "Ивент"). Тоже
// не связано с переключателем светлая/тёмная (тот остаётся как был,
// чисто на localStorage, без сервера) — пользовательские темы работают
// НАД ним отдельным слоем: встроенная тема "Starikov" не переопределяет
// встроенные светлую/тёмную CSS-переменные вообще (undefined ниже), любая
// СОЗДАННАЯ пользователем тема — переопределяет все три цвета явно.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'admin_themes.json');
const DEFAULT_THEME_ID = 'starikov';

function generateId(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug || 'theme'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

// Готовые темы (спокойные сочетания). Из трёх цветов клиент сам выводит всю палитру панели.
const PRESETS = [
  { id: 'p-grafit', name: 'Графит', bgColor: '#0F1013', textColor: '#ECEDF1', accentColor: '#7C8CF8' },
  { id: 'p-polnoch', name: 'Полночь', bgColor: '#0A0F1E', textColor: '#E4E9F7', accentColor: '#4F9DFF' },
  { id: 'p-hvoya', name: 'Хвоя', bgColor: '#0C1411', textColor: '#E3EFE8', accentColor: '#3DD68C' },
  { id: 'p-okean', name: 'Океан', bgColor: '#091518', textColor: '#E0F0F2', accentColor: '#2DC4D6' },
  { id: 'p-yantar', name: 'Янтарь', bgColor: '#14110C', textColor: '#F1EBDD', accentColor: '#F2A93B' },
  { id: 'p-sliva', name: 'Слива', bgColor: '#130F19', textColor: '#EEE8F6', accentColor: '#B58CFF' },
  { id: 'p-mono', name: 'Моно', bgColor: '#0A0A0A', textColor: '#F2F2F2', accentColor: '#FFFFFF' },
  { id: 'p-bumaga', name: 'Бумага', bgColor: '#F3F0EA', textColor: '#1F1D1A', accentColor: '#D4553B' },
  { id: 'p-sneg', name: 'Снег', bgColor: '#F2F4F8', textColor: '#14181F', accentColor: '#3B6EF5' },
  { id: 'p-myata', name: 'Мята', bgColor: '#EDF3F0', textColor: '#10201A', accentColor: '#1F9D6B' },
].map((t) => ({ ...t, isDefault: false, isBuiltin: true }));
const PRESET_IDS = new Set(PRESETS.map((t) => t.id));

function defaultData() {
  return {
    activeThemeId: DEFAULT_THEME_ID,
    picked: false,
    themes: [
      // Значения ниже — null: "Starikov" сознательно НЕ переопределяет
      // встроенные CSS-переменные светлой/тёмной темы (см. admin/style.css,
      // :root[data-theme="dark|light"]) — она и есть тот самый уже
      // существующий внешний вид, который просто ничего не трогает.
      { id: DEFAULT_THEME_ID, name: 'Overdeck', bgColor: null, textColor: null, accentColor: null, isDefault: true },
    ],
  };
}

let data = null;

function normalizeTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!isHexColor(raw.bgColor) || !isHexColor(raw.textColor) || !isHexColor(raw.accentColor)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(raw.name),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : 'Без названия',
    bgColor: raw.bgColor,
    textColor: raw.textColor,
    accentColor: raw.accentColor,
    isDefault: false,
  };
}

function normalize(raw) {
  const base = defaultData();
  raw = raw && typeof raw === 'object' ? raw : {};
  const customThemes = Array.isArray(raw.themes)
    ? raw.themes.filter((t) => t && t.id !== DEFAULT_THEME_ID && !PRESET_IDS.has(t.id)).map(normalizeTheme).filter(Boolean)
    : [];
  const themes = [base.themes[0], ...PRESETS, ...customThemes]; // «Overdeck» всегда первой, дальше готовые темы, потом свои
  const activeThemeId = themes.some((t) => t.id === raw.activeThemeId) ? raw.activeThemeId : DEFAULT_THEME_ID;
  // кто уже менял тему раньше (своя тема или не дефолтная активная), окно выбора не показываем
  const picked = raw.picked === true || customThemes.length > 0 || activeThemeId !== DEFAULT_THEME_ID;
  return { activeThemeId, picked, themes };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) { data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))); return; }
  } catch (e) {
    console.warn('[Настройки админки] Не удалось прочитать admin_themes.json, начинаем с дефолтов:', e.message);
  }
  data = normalize({});
  save();
}

function save() {
  try { fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2)); } catch (e) {
    console.warn('[Настройки админки] Не удалось сохранить admin_themes.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

/** Добавляет новую тему и сразу делает её активной (естественное продолжение действия "Сохранить" в форме создания). */
function addTheme(name, bgColor, textColor, accentColor) {
  const theme = normalizeTheme({ name, bgColor, textColor, accentColor });
  if (!theme) return { success: false, data };
  data.themes.push(theme);
  data.activeThemeId = theme.id;
  data.picked = true;
  save();
  return { success: true, data, theme };
}

/** «Overdeck» и готовые темы не удаляются (проверка тут же, а не только в интерфейсе). */
function deleteTheme(id) {
  if (id === DEFAULT_THEME_ID || PRESET_IDS.has(id)) return { success: false, error: 'Эту тему удалить нельзя.', data };
  const existed = data.themes.some((t) => t.id === id);
  if (!existed) return { success: false, error: 'Тема не найдена.', data };
  data.themes = data.themes.filter((t) => t.id !== id);
  if (data.activeThemeId === id) data.activeThemeId = DEFAULT_THEME_ID;
  save();
  return { success: true, data };
}

function setActiveTheme(id) {
  if (!data.themes.some((t) => t.id === id)) return { success: false, error: 'Тема не найдена.', data };
  data.activeThemeId = id;
  data.picked = true;
  save();
  return { success: true, data };
}

/** Отмечает, что окно выбора темы уже показывали (даже если оставили «Overdeck»). */
function markPicked() { data.picked = true; save(); return { success: true, data }; }

module.exports = { init, get, addTheme, deleteTheme, setActiveTheme, markPicked, DEFAULT_THEME_ID, FILE_PATH };
