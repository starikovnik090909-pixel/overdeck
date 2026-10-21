// donations.js
// История донатов ("Донатный хаб" в админке) — не пропадает при перезапуске
// сервера, хранится в donations.json в корне проекта. Каждый новый донат
// дописывается и файл перезаписывается целиком — донаты редкие, лишний
// I/O не проблема, зато не нужен отдельный механизм догрузки/консистентности.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'donations.json');
const MAX_HISTORY = 500;

let history = []; // [{id, platform, username, amount, currency, message, ts}], новые — в конец

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      if (Array.isArray(raw)) history = raw;
    }
  } catch (e) {
    console.warn('[Донаты] Не удалось прочитать donations.json, начинаем с пустой истории:', e.message);
    history = [];
  }
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(history, null, 2));
  } catch (e) {
    console.warn('[Донаты] Не удалось сохранить donations.json:', e.message);
  }
}

function init() {
  load();
}

/** donation: {platform, username, amount, currency, message}. Возвращает запись с id/ts. */
function addDonation(donation) {
  const record = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    platform: donation.platform,
    username: donation.username || 'Аноним',
    amount: donation.amount,
    currency: donation.currency || 'RUB',
    message: donation.message || '',
  };
  history.push(record);
  if (history.length > MAX_HISTORY) history.shift();
  save();
  return record;
}

/** Новые донаты первыми — как в ленте. */
function getHistory() {
  return history.slice().reverse();
}

function reset() {
  history = [];
  save();
}

module.exports = { init, addDonation, getHistory, reset };
