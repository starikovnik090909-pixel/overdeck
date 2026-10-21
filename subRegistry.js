'use strict';
// Нумерация подписчиков для билета: «подписчик №N». Twitch такого номера не отдаёт, поэтому считаем сами:
// первый увиденный подписчик получает номер 1 (плюс стартовое смещение из настроек), дальше по порядку; номер у человека не меняется.
// Хранится в sub_registry.json в корне проекта (в архив релиза не попадает).

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'sub_registry.json');
let data = { count: 0, numbers: {} }; // numbers: login → номер

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      if (raw && typeof raw === 'object' && raw.numbers && typeof raw.numbers === 'object') data = { count: Number(raw.count) || 0, numbers: raw.numbers };
    }
  } catch (e) {
    console.warn('[Подписчики] Не удалось прочитать sub_registry.json, начинаем заново:', e.message);
    data = { count: 0, numbers: {} };
  }
}
function save() {
  try { fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2)); } catch (e) { console.warn('[Подписчики] Не удалось сохранить sub_registry.json:', e.message); }
}
load();

/** Номер подписчика: уже известному — прежний, новому — следующий (start — смещение для уже существующих подписчиков). */
function assign(login, start) {
  const key = String(login || '').toLowerCase().trim();
  if (!key) return null;
  if (data.numbers[key]) return data.numbers[key];
  data.count += 1;
  data.numbers[key] = (Number(start) || 0) + data.count;
  save();
  return data.numbers[key];
}
function peek(login) { return data.numbers[String(login || '').toLowerCase().trim()] || null; }
function stats() { return { count: data.count }; }

module.exports = { assign, peek, stats };
