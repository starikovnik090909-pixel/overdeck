'use strict';
// netGuard.js — кто может обращаться к серверу Overdeck.
//
// По умолчанию сервер слушает только 127.0.0.1: админка, API и виджеты доступны лишь с этого ПК.
// config.allowLan = true — сервер слушает всю сеть (для схемы «два ПК»: OBS на другом компьютере),
// но с чужих адресов можно только СМОТРЕТЬ виджеты (GET-страницы, картинки, WebSocket оверлея);
// админка, файл авторизации и любые изменяющие запросы — только с этого ПК.
//
// Плюс защита от чужих сайтов в браузере стримера:
//  - Host должен быть localhost или IP-адресом (защита от DNS rebinding);
//  - изменяющие запросы (POST/PUT/PATCH/DELETE) с заголовком Origin принимаются,
//    только если Origin — сам Overdeck (localhost / 127.0.0.1 / [::1] / IP этого сервера).

const net = require('net');

function isLoopback(addr) {
  if (!addr) return false;
  const a = String(addr).replace(/^::ffff:/, '');
  return a === '127.0.0.1' || a === '::1' || a.startsWith('127.');
}

function hostName(h) {
  if (!h) return '';
  h = String(h).trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']'));
  const i = h.lastIndexOf(':');
  return i > -1 && h.indexOf(':') === i ? h.slice(0, i) : h;
}

function isSafeHost(h) {
  const n = hostName(h);
  return n === 'localhost' || n.endsWith('.localhost') || net.isIP(n) !== 0;
}

function originOk(origin) {
  if (!origin || origin === 'null') return true; // OBS / прямые запросы без Origin
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return isSafeHost(u.host);
  } catch (e) { return false; }
}

const ADMIN_ONLY = [/^\/admin(\/|$)/, /^\/api\/key\//, /^\/api\/lock\//];
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function middleware(getConfig) {
  return function netGuard(req, res, next) {
    if (!isSafeHost(req.headers.host)) {
      res.status(403).type('text/plain').send('Overdeck: недопустимый адрес. Открой http://localhost:' + ((getConfig() || {}).port || 3001) + '/admin');
      return;
    }
    const local = isLoopback(req.socket.remoteAddress);
    if (!local) {
      const p = req.path || '';
      if (MUTATING.has(req.method) || ADMIN_ONLY.some(r => r.test(p))) {
        res.status(403).type('text/plain').send('Overdeck: админка и настройки доступны только на компьютере, где запущен Overdeck.');
        return;
      }
    }
    // расширение браузера «Overdeck — Сейчас играет» шлёт данные с Origin chrome-extension://… — разрешаем только этот один адрес
    const extOk = /^(chrome|moz)-extension:\/\//.test(String(req.headers.origin || '')) && req.path === '/api/nowplaying/browser' && local;
    if (MUTATING.has(req.method) && !originOk(req.headers.origin) && !extOk) {
      res.status(403).json({ success: false, error: 'Запрос с чужого сайта отклонён.' });
      return;
    }
    next();
  };
}

// для WebSocket: чужие сайты не подключаются; с других ПК — только если включён allowLan
function wsAllowed(req, cfg) {
  if (!isSafeHost(req.headers.host)) return false;
  if (!originOk(req.headers.origin)) return false;
  if (!isLoopback(req.socket.remoteAddress) && !(cfg && cfg.allowLan)) return false;
  return true;
}

function listenHost(cfg) {
  return cfg && cfg.allowLan ? '0.0.0.0' : '127.0.0.1';
}

module.exports = { middleware, wsAllowed, listenHost, isLoopback, isSafeHost, originOk };
