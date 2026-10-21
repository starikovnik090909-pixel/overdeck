// factPresets.js
// Библиотека сохранённых плашек для виджета "Факт / Инфо-панель" — можно
// заранее заготовить много плашек и показывать их в OBS по одному клику.
// Список — в fact_presets.json, подгружается при старте сервера.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'fact_presets.json');

let presets = null; // [{id, title, text, createdAt}]

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      if (Array.isArray(raw)) {
        presets = raw.filter((p) => p && typeof p.id === 'string');
        return;
      }
    }
  } catch (e) {
    console.warn('[Факт] Не удалось прочитать fact_presets.json, начинаем с пустого списка:', e.message);
  }
  presets = [];
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(presets, null, 2));
  } catch (e) {
    console.warn('[Факт] Не удалось сохранить fact_presets.json:', e.message);
  }
}

function init() {
  load();
}

function list() {
  return presets;
}

function generateId() {
  return `fact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function add(title, text) {
  const preset = { id: generateId(), title: String(title || '').trim() || 'Без названия', text: String(text || ''), createdAt: Date.now() };
  presets.push(preset);
  save();
  return preset;
}

function update(id, fields) {
  const preset = presets.find((p) => p.id === id);
  if (!preset) return null;
  if (typeof fields.title === 'string') preset.title = fields.title;
  if (typeof fields.text === 'string') preset.text = fields.text;
  save();
  return preset;
}

function remove(id) {
  const before = presets.length;
  presets = presets.filter((p) => p.id !== id);
  save();
  return presets.length !== before;
}

function get(id) {
  return presets.find((p) => p.id === id) || null;
}

module.exports = { init, list, add, update, remove, get, FILE_PATH };
