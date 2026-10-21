// eventCover.js
// Обложка вкладки «Ивент» в админке: большая плашка с загруженной фотографией, которая по клику сворачивается в
// плашечку с названием (см. public/admin — блок .event-cover). Хранится одно название и одна картинка; сама картинка
// лежит в uploads/event/ (раздаётся как /uploads/event/...), здесь — только путь к ней.
// Это настройка ТОЛЬКО админки: на оверлей/OBS она не влияет и никуда не рассылается.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'event_cover.json');
const NAME_MAX = 60;

let data = { name: '', imageUrl: null };

function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const url = typeof r.imageUrl === 'string' && /^\/uploads\/event\/[^/\\]+$/.test(r.imageUrl) ? r.imageUrl : null; // только наш путь, ничего постороннего
  return { name: typeof r.name === 'string' ? r.name.trim().slice(0, NAME_MAX) : '', imageUrl: url };
}

function save() {
  try { fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2)); } catch (e) {
    console.warn('[Обложка ивента] Не удалось сохранить event_cover.json:', e.message);
  }
}

function init() {
  try {
    if (fs.existsSync(FILE_PATH)) { data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))); return; }
  } catch (e) {
    console.warn('[Обложка ивента] Не удалось прочитать event_cover.json, начинаем с пустой обложки:', e.message);
  }
  data = { name: '', imageUrl: null };
}

function get() { return { ...data }; }

/** Пустое название допустимо — в админке тогда показывается подсказка «Название». */
function setName(name) {
  data.name = String(name == null ? '' : name).trim().slice(0, NAME_MAX);
  save();
  return get();
}

function setImageUrl(url) {
  data.imageUrl = normalize({ imageUrl: url }).imageUrl;
  save();
  return get();
}

module.exports = { init, get, setName, setImageUrl, NAME_MAX, FILE_PATH };
