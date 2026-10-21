// donorLeaderboard.js
// Суммы донатов по донатерам для виджета "Топ донатеров" — два независимых
// топа: "за стрим" (сбрасывается вместе с общей статистикой, живёт в памяти)
// и "за всё время" (никогда не сбрасывается, хранится в donations_alltime.json).
//
// Упрощение: суммы по разным валютам складываются как есть, без конвертации —
// если донатят в нескольких валютах, сумма будет не совсем точной. Для
// большинства каналов, где донаты идут в одной валюте, это не проблема.

const fs = require('fs');
const path = require('path');

const ALLTIME_FILE = path.join(__dirname, 'donations_alltime.json');

let allTimeTotals = {}; // usernameLower -> {username, amount, platform}
let sessionTotals = {};

function load() {
  try {
    if (fs.existsSync(ALLTIME_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ALLTIME_FILE, 'utf8'));
      if (raw && typeof raw === 'object') allTimeTotals = raw;
    }
  } catch (e) {
    console.warn('[Топ донатеров] Не удалось прочитать donations_alltime.json, начинаем с пустого топа:', e.message);
    allTimeTotals = {};
  }
}

function saveAllTime() {
  try {
    fs.writeFileSync(ALLTIME_FILE, JSON.stringify(allTimeTotals, null, 2));
  } catch (e) {
    console.warn('[Топ донатеров] Не удалось сохранить donations_alltime.json:', e.message);
  }
}

function init() {
  load();
}

/** donation: {username, amount, platform}. Добавляет и в топ за стрим, и в топ за всё время. */
function addDonation(donation) {
  const key = (donation.username || 'Аноним').toLowerCase();
  const amount = Number(donation.amount) || 0;
  if (amount <= 0) return;

  if (!allTimeTotals[key]) allTimeTotals[key] = { username: donation.username, amount: 0, platform: donation.platform };
  allTimeTotals[key].amount += amount;
  allTimeTotals[key].username = donation.username; // подтягиваем актуальное написание ника
  allTimeTotals[key].platform = donation.platform;
  saveAllTime();

  if (!sessionTotals[key]) sessionTotals[key] = { username: donation.username, amount: 0, platform: donation.platform };
  sessionTotals[key].amount += amount;
  sessionTotals[key].username = donation.username;
  sessionTotals[key].platform = donation.platform;
}

/** scope: 'session' | 'allTime'. */
function getTop(scope, count) {
  const totals = scope === 'allTime' ? allTimeTotals : sessionTotals;
  return Object.values(totals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, count || 10);
}

/** Сбрасывает только топ за стрим — файл donations_alltime.json не трогает. */
function resetSession() {
  sessionTotals = {};
}

/** Удаляет одного донатера из указанного топа. scope: 'session' | 'allTime'. */
function deleteDonor(scope, username) {
  const key = (username || '').toLowerCase();
  if (scope === 'allTime') {
    delete allTimeTotals[key];
    saveAllTime();
  } else {
    delete sessionTotals[key];
  }
}

/** Полностью очищает топ за всё время (и файл) — необратимо. */
function clearAllTime() {
  allTimeTotals = {};
  saveAllTime();
}

module.exports = { init, addDonation, getTop, resetSession, deleteDonor, clearAllTime };
