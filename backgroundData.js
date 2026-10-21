// backgroundData.js
// Полноэкранный фон трансляции (1920×1080) — виджет background.html.
// Изменено: раньше это был один загруженный файл, теперь — БИБЛИОТЕКА фонов,
// сканируемая прямо из папки backgrounds/ в корне проекта (та же идея, что
// и у fonts.js — папка маленькая, читать с диска на каждый запрос дешевле,
// чем городить кэш с инвалидацией). Сам этот модуль хранит только настройки
// (какой файл сейчас активен, автосмена, интервал, размытие/затемнение/
// вписывание) — НЕ список файлов, он всегда живой, из самой папки.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'background_data.json');
const BACKGROUNDS_DIR = path.join(__dirname, 'backgrounds');

// Тип определяется расширением файла — отдельно хранить не нужно.
const EXT_TYPE = {
  '.gif': 'gif',
  '.mp4': 'video', '.webm': 'video', '.mov': 'video',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image',
};
const ALLOWED_EXT = Object.keys(EXT_TYPE);

const FIT_MODES = ['cover', 'contain', 'stretch'];

const NUMERIC_DEFAULTS = {
  blur: 0, // % — 0-100, переводится в реальный px размытия на клиенте
  darken: 0, // % — 0-100, непрозрачность чёрного оверлея поверх фона
  intervalMinutes: 5, // автосмена — раз в сколько минут переключать (1-10)
};
const NUMERIC_LIMITS = {
  blur: [0, 100],
  darken: [0, 100],
  intervalMinutes: [1, 10],
};

const BOOLEAN_DEFAULTS = { autoRotate: false };
const ENUM_DEFAULTS = { fitMode: 'cover' };
const ENUM_OPTIONS = { fitMode: FIT_MODES };

function defaultSettings() {
  return { ...NUMERIC_DEFAULTS, ...BOOLEAN_DEFAULTS, ...ENUM_DEFAULTS };
}

function defaultData() {
  return { activeFile: null, settings: defaultSettings() }; // activeFile: null = дефолтный тёмно-серый фон
}

let data = null;

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function ensureDir() {
  if (!fs.existsSync(BACKGROUNDS_DIR)) fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
}

/** [{file, url, type}] — сканируется с диска на каждый вызов, список никогда не хранится в JSON. */
function listBackgrounds() {
  ensureDir();
  return fs.readdirSync(BACKGROUNDS_DIR)
    .filter((file) => ALLOWED_EXT.includes(path.extname(file).toLowerCase()))
    .sort()
    .map((file) => ({
      file,
      url: `/backgrounds/${encodeURIComponent(file)}`,
      type: EXT_TYPE[path.extname(file).toLowerCase()],
    }));
}

function normalizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const result = {};
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
  return result;
}

/** activeFile валиден, только если такой файл реально существует в backgrounds/ — иначе тихо откатываемся на "нет фона" (файл могли удалить руками с диска). */
function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const files = listBackgrounds().map((b) => b.file);
  return {
    activeFile: typeof raw.activeFile === 'string' && files.includes(raw.activeFile) ? raw.activeFile : null,
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
    console.warn('[Фон] Не удалось прочитать background_data.json, начинаем с дефолтов:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Фон] Не удалось сохранить background_data.json:', e.message);
  }
}

function init() {
  ensureDir();
  load();
}

/** Полное состояние для рассылки — settings + activeFile + свежий список файлов + разрешённый тип текущего файла (или null). */
function get() {
  const files = listBackgrounds();
  const active = files.find((f) => f.file === data.activeFile) || null;
  return { activeFile: data.activeFile, activeUrl: active ? active.url : null, activeType: active ? active.type : null, files, settings: data.settings };
}

/** Выбрать активный фон по имени файла — null сбрасывает на дефолтный серый. */
function setActiveFile(file) {
  const files = listBackgrounds().map((f) => f.file);
  data.activeFile = file && files.includes(file) ? file : null;
  save();
  return get();
}

/** Удаляет файл с диска; если он был активным — сбрасывает на дефолтный серый. */
function deleteFile(file) {
  ensureDir();
  const target = path.join(BACKGROUNDS_DIR, file);
  // На всякий случай не даём выйти за пределы папки через "../" в имени файла.
  if (!target.startsWith(BACKGROUNDS_DIR)) return get();
  try { fs.unlinkSync(target); } catch (e) { /* файла и так могло не быть — не критично */ }
  if (data.activeFile === file) data.activeFile = null;
  save();
  return get();
}

/** Следующий по кругу файл после currentFile — для автосмены. Если фонов меньше двух — вернёт null (крутить нечего). */
function getNextFile(currentFile) {
  const files = listBackgrounds();
  if (files.length < 2) return null;
  const idx = files.findIndex((f) => f.file === currentFile);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % files.length;
  return files[nextIdx].file;
}

function updateSettings(fields) {
  data.settings = normalizeSettings({ ...data.settings, ...(fields || {}) });
  save();
  return get();
}

module.exports = {
  init, get, listBackgrounds, setActiveFile, deleteFile, getNextFile, updateSettings,
  BACKGROUNDS_DIR, ALLOWED_EXT, EXT_TYPE, FIT_MODES, FILE_PATH,
};
