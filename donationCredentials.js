// donationCredentials.js
// Ключи и токены DonationAlerts/DonateX — в ОТДЕЛЬНОМ файле
// (donation_credentials.json), а не внутри config.json. Так они не
// теряются, если кто-то сбросит или перезапишет основной конфиг — сброс
// настроек оверлея (тема/раскладка/статистика) этот файл не трогает вообще.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'donation_credentials.json');

function defaults() {
  return {
    donationAlerts: {
      clientId: '', clientSecret: '',
      accessToken: null, refreshToken: null, expiresAt: null,
      userId: null, userName: null, socketToken: null,
      connected: false,
    },
    donateX: {
      apiToken: null,
      connected: false,
    },
    donatePay: {
      apiKey: null,
      connected: false,
    },
  };
}

let data = null;

function load() {
  const base = defaults();
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      data = {
        donationAlerts: { ...base.donationAlerts, ...(raw.donationAlerts || {}) },
        donateX: { ...base.donateX, ...(raw.donateX || {}) },
        donatePay: { ...base.donatePay, ...(raw.donatePay || {}) },
      };
      return;
    }
  } catch (e) {
    console.warn('[Донаты] Не удалось прочитать donation_credentials.json, использую значения по умолчанию:', e.message);
  }
  data = base;
  save();
}

function save() {
  // Client ID/Secret DonationAlerts и API-токен DonateX больше не хранятся здесь —
  // только в auth_credentials.json, и только если включено "Запомнить". Этот файл
  // по-прежнему хранит OAuth-состояние DonationAlerts (access/refresh-токен и
  // т.п.) — это отдельная история, не завязанная на галочку "Запомнить".
  const toWrite = {
    donationAlerts: { ...data.donationAlerts, clientId: '', clientSecret: '' },
    donateX: { ...data.donateX, apiToken: null },
    donatePay: { ...data.donatePay, apiKey: null },
  };
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(toWrite, null, 2));
  } catch (e) {
    console.warn('[Донаты] Не удалось сохранить donation_credentials.json:', e.message);
  }
}

function init() {
  load();
}

/** Возвращает живой объект {donationAlerts, donateX} — мутировать его напрямую можно, не забывай звать save() после. */
function get() {
  return data;
}

module.exports = { init, get, save };
