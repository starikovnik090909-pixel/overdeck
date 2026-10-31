// lock.js — пароль на личные вкладки админки («Ивент», «ЧатАватары»).
// Сам пароль нигде не хранится — только соль и хеш scrypt. Проверка идёт на сервере; после верного пароля админка получает токен
// (HMAC от хеша) и хранит его в браузере, поэтому повторно пароль спрашивается только на новом браузере/ПК или после «Заблокировать».
// ВАЖНО: это защита интерфейса админки (вкладки закрыты, пока не введён пароль). Сервер слушает localhost, API самих виджетов не закрыт.

const crypto = require('crypto');

const LOCKED_TABS = ['event', 'chatavatars', 'twitchext'];
const SALT = Buffer.from('a2d53e6bc49b247f69cf19434dec2841', 'hex');
const HASH = Buffer.from('76bd1ef0d0b2b113830d8b1aaf00092f9692bc2c5512f9b4087a53dd0ac0dd2e', 'hex');
const TOKEN = crypto.createHmac('sha256', HASH).update('overlay-tab-lock-v1').digest('hex');

let fails = []; // времена неудачных попыток (мс) — не больше 5 в минуту

function tooMany() {
  const now = Date.now();
  fails = fails.filter((t) => now - t < 60000);
  return fails.length >= 5;
}

/** Возвращает { ok, token?, error? }. */
function verify(password) {
  if (tooMany()) return { ok: false, error: 'Слишком много попыток — подождите минуту.' };
  let ok = false;
  try {
    const h = crypto.scryptSync(String(password || ''), SALT, 32);
    ok = crypto.timingSafeEqual(h, HASH);
  } catch (e) { ok = false; }
  if (!ok) { fails.push(Date.now()); return { ok: false, error: 'Неверный пароль.' }; }
  fails = [];
  return { ok: true, token: TOKEN };
}

function isValidToken(token) {
  const a = Buffer.from(String(token || ''));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { LOCKED_TABS, verify, isValidToken };
