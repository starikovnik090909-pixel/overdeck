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

function defaultData() {
  return {
    activeThemeId: DEFAULT_THEME_ID,
    themes: [
      // Значения ниже — null: "Starikov" сознательно НЕ переопределяет
      // встроенные CSS-переменные светлой/тёмной темы (см. admin/style.css,
      // :root[data-theme="dark|light"]) — она и есть тот самый уже
      // существующий внешний вид, который просто ничего не трогает.
      { id: DEFAULT_THEME_ID, name: 'Starikov', bgColor: null, textColor: null, accentColor: null, isDefault: true },
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
  if (!raw || typeof raw !== 'object') return defaultData();
  const base = defaultData();
  const customThemes = Array.isArray(raw.themes)
    ? raw.themes.filter((t) => t && t.id !== DEFAULT_THEME_ID).map(normalizeTheme).filter(Boolean)
    : [];
  const themes = [base.themes[0], ...customThemes]; // Starikov всегда первым и всегда присутствует
  const activeThemeId = themes.some((t) => t.id === raw.activeThemeId) ? raw.activeThemeId : DEFAULT_THEME_ID;
  return { activeThemeId, themes };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) { data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))); return; }
  } catch (e) {
    console.warn('[Настройки админки] Не удалось прочитать admin_themes.json, начинаем с дефолтов:', e.message);
  }
  data = defaultData();
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
  save();
  return { success: true, data, theme };
}

/** Тема "Starikov" — дефолтная, не удаляется (проверка тут же, а не только в интерфейсе). */
function deleteTheme(id) {
  if (id === DEFAULT_THEME_ID) return { success: false, error: 'Тема "Starikov" не удаляется.', data };
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
  save();
  return { success: true, data };
}

module.exports = { init, get, addTheme, deleteTheme, setActiveTheme, DEFAULT_THEME_ID, FILE_PATH };
