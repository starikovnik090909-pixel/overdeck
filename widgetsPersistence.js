// widgetsPersistence.js
// Раскладка виджетов (позиция/размер/вкл-выкл) и их настройки (цвета,
// размеры, период переключения и т.п.) — в ДВУХ отдельных файлах, а не
// внутри config.json:
//   widgets_layout.json   — раскладка
//   widgets_settings.json — настройки содержимого виджетов
// Так они переживают что угодно, что может случиться с config.json, и не
// теряются при перезапуске сервера. Запись — с дебаунсом (300мс после
// последнего изменения), чтобы частые правки ползунков не заваливали диск
// записями на каждое движение мыши.

const fs = require('fs');
const path = require('path');

const LAYOUT_FILE = path.join(__dirname, 'widgets_layout.json');
const SETTINGS_FILE = path.join(__dirname, 'widgets_settings.json');
const SAVE_DEBOUNCE_MS = 300;

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.warn(`[Виджеты] Не удалось прочитать ${path.basename(filePath)}:`, e.message);
  }
  return null;
}

/** Возвращает debounced-функцию сохранения для конкретного файла — свой независимый таймер на каждый. */
function makeDebouncedSaver(filePath) {
  let timer = null;
  let pending = null;
  return function saveDebounced(data) {
    pending = data;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        fs.writeFileSync(filePath, JSON.stringify(pending, null, 2));
      } catch (e) {
        console.warn(`[Виджеты] Не удалось сохранить ${path.basename(filePath)}:`, e.message);
      }
    }, SAVE_DEBOUNCE_MS);
  };
}

const saveLayoutDebounced = makeDebouncedSaver(LAYOUT_FILE);
const saveSettingsDebounced = makeDebouncedSaver(SETTINGS_FILE);

function loadLayout() { return loadJson(LAYOUT_FILE); }
function loadSettings() { return loadJson(SETTINGS_FILE); }

module.exports = {
  loadLayout,
  loadSettings,
  saveLayoutDebounced,
  saveSettingsDebounced,
  LAYOUT_FILE,
  SETTINGS_FILE,
};
