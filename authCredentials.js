// authCredentials.js
// Опциональное «Запомнить» для ключей трёх интеграций (Twitch,
// DonationAlerts, DonateX) — отдельный файл auth_credentials.json,
// НЕ config.json и НЕ donation_credentials.json. Присутствие непустого
// значения в файле и есть признак "запомнено"; так что отдельного флага
// remember внутри файла нет — сама структура ровно та, что в задании.
//
// Если галочка "Запомнить" выключена — значения используются только в
// текущей сессии (в памяти) и в этот файл не попадают вовсе; если раньше
// были запомнены, а галочку сняли — при следующем сохранении стираются.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'auth_credentials.json');

function emptyData() {
  return {
    twitch: { clientId: '', clientSecret: '' },
    donationAlerts: { clientId: '', clientSecret: '' },
    donateX: { apiToken: '' },
  };
}

let data = null;

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      const base = emptyData();
      data = {
        twitch: { ...base.twitch, ...(raw.twitch || {}) },
        donationAlerts: { ...base.donationAlerts, ...(raw.donationAlerts || {}) },
        donateX: { ...base.donateX, ...(raw.donateX || {}) },
      };
      return;
    }
  } catch (e) {
    console.warn('[Учётные данные] Не удалось прочитать auth_credentials.json:', e.message);
  }
  data = emptyData();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Учётные данные] Не удалось сохранить auth_credentials.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

/** remember=true — записывает fields в файл под этим ключом; remember=false — стирает то, что там было. */
function setRemembered(key, remember, fields) {
  if (!Object.prototype.hasOwnProperty.call(data, key)) return;
  data[key] = remember ? { ...data[key], ...fields } : Object.keys(data[key]).reduce((acc, k) => { acc[k] = ''; return acc; }, {});
  save();
}

/** Есть ли реально запомненные (непустые) данные для этого ключа — для галочки "Запомнить" в форме при загрузке. */
function isRemembered(key) {
  const entry = data[key];
  if (!entry) return false;
  return Object.values(entry).some((v) => !!v);
}

module.exports = { init, get, setRemembered, isRemembered, FILE_PATH };
