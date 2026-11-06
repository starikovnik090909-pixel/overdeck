// lock.js — пароль на личные вкладки админки («Ивент», «ЧатАватары», «Аукцион»).
// Сам пароль нигде не хранится — только соль и хеш scrypt. Проверка идёт на сервере; после верного пароля админка получает токен
// (HMAC от хеша) и хранит его в браузере, поэтому повторно пароль спрашивается только на новом браузере/ПК или после «Заблокировать».
// ВАЖНО: это защита интерфейса админки (вкладки закрыты, пока не введён пароль). Сервер слушает localhost, API самих виджетов не закрыт.

const crypto = require('crypto');

const LOCKED_TABS = ['event', 'chatavatars', 'twitchext', 'auctionbridge'];
const SALT = Buffer.from('cf7fc96ee31ac83eef4f870078f9cdaa', 'hex');
const HASH = Buffer.from('a23e85f26c28cff1eba5f272e86a00de09f23394a6bad37d897531688060292c', 'hex');
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
