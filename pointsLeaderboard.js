// pointsLeaderboard.js
// Потраченные баллы канала по зрителям для виджета "Топ по баллам" — два независимых
// топа: "за стрим" (сбрасывается вместе с общей статистикой, живёт в памяти)
// и "за всё время" (никогда не сбрасывается, хранится в points_alltime.json).
//

const fs = require('fs');
const path = require('path');

const ALLTIME_FILE = path.join(__dirname, 'points_alltime.json');

let allTimeTotals = {}; // usernameLower -> {username, amount, platform}
let sessionTotals = {};

function load() {
  try {
    if (fs.existsSync(ALLTIME_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ALLTIME_FILE, 'utf8'));
      if (raw && typeof raw === 'object') allTimeTotals = raw;
    }
  } catch (e) {
    console.warn('[Топ по баллам] Не удалось прочитать points_alltime.json, начинаем с пустого топа:', e.message);
    allTimeTotals = {};
  }
}

function saveAllTime() {
  try {
    fs.writeFileSync(ALLTIME_FILE, JSON.stringify(allTimeTotals, null, 2));
  } catch (e) {
    console.warn('[Топ по баллам] Не удалось сохранить points_alltime.json:', e.message);
  }
}

function init() {
  load();
}

/** donation: {username, amount, platform}. Добавляет и в топ за стрим, и в топ за всё время. */
function addPoints(donation) {
  const key = (donation.username || 'Аноним').toLowerCase();
  const amount = Math.round(Number(donation.amount) || 0);
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

/** Сбрасывает только топ за стрим — файл points_alltime.json не трогает. */
function resetSession() {
  sessionTotals = {};
}

/** Удаляет одного зрителя из указанного топа. scope: 'session' | 'allTime'. */
function deleteUser(scope, username) {
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

module.exports = { init, addPoints, getTop, resetSession, deleteUser, clearAllTime };
