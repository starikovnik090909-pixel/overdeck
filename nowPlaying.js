// nowPlaying.js — «Сейчас играет»: что играет в браузере и плеерах на этом компьютере.
// Источник — медиа-сессии Windows (System Media Transport Controls): их публикуют Chrome, Edge, Firefox, Яндекс Браузер,
// Spotify, VLC и др. Читаем через PowerShell (nowplaying.ps1, одна строка JSON в секунду). Только Windows 10/11.
// Модуль хранит список сессий, выбирает «текущую» по настройкам и отдаёт состояние оверлею. Обложки отдаются по HTTP.

const path = require('path');
const { spawn } = require('child_process');

const SCRIPT = path.join(__dirname, 'nowplaying.ps1');
const STALE_MS = 6000;      // нет свежих данных дольше — считаем, что читалка встала

let child = null;
let wantRunning = false;
let scriptErrs = [];
let extItems = []; let extAt = 0; let extBrowser = '';   // данные от расширения браузера
let sessions = [];          // последний снимок, уже с локальным временем получения (at)
let lastLineAt = 0;
let lastError = '';
let covers = new Map();     // key -> { buf, mime, v }
let demo = null;            // { until, sessions } — тестовые данные
let restartTimer = null;
let onChange = () => {};

const BROWSERS = [
  ['yandex', 'Яндекс Браузер'], ['msedge', 'Microsoft Edge'], ['edge', 'Microsoft Edge'], ['chrome', 'Google Chrome'], ['firefox', 'Firefox'],
  ['opera', 'Opera'], ['brave', 'Brave'], ['vivaldi', 'Vivaldi'],
];
const PLAYERS = [
  ['spotify', 'Spotify'], ['vlc', 'VLC'], ['music.ui', 'Музыка (Windows)'], ['zunemusic', 'Музыка (Windows)'], ['itunes', 'iTunes'], ['musicbee', 'MusicBee'],
  ['aimp', 'AIMP'], ['foobar', 'foobar2000'], ['potplayer', 'PotPlayer'], ['mpc', 'MPC'], ['yandexmusic', 'Яндекс Музыка'], ['telegram', 'Telegram'], ['discord', 'Discord'],
];

/** Понятное название источника по идентификатору приложения Windows (SourceAppUserModelId). */
function appName(id) {
  const raw = String(id || ''); const low = raw.toLowerCase();
  for (const [k, n] of PLAYERS) if (low.includes(k)) return n;
  for (const [k, n] of BROWSERS) if (low.includes(k)) return n;
  const clean = raw.split('!')[0].replace(/\.exe$/i, '').replace(/^.*[\\/]/, '').split('_')[0];
  return clean || 'Неизвестный источник';
}
const isBrowser = (id) => BROWSERS.some(([k]) => String(id || '').toLowerCase().includes(k));

function parseIgnore(s) { return String(s || '').split(/[,;\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean); }

function handleLine(line) {
  line = line.replace(/^﻿/, '').trim();
  if (!line || line[0] !== '{') return;
  let m; try { m = JSON.parse(line); } catch (_) { return; }
  if (m.t === 'c' && m.key && m.b64) {
    try {
      const buf = Buffer.from(m.b64, 'base64');
      covers.set(m.key, { buf, mime: /^image\//.test(m.mime || '') ? m.mime : 'image/jpeg', v: Date.now().toString(36) });
      if (covers.size > 60) covers.delete(covers.keys().next().value);
    } catch (_) { /* битая обложка — просто без неё */ }
    return;
  }
  if (m.t === 'err') { lastError = String(m.msg || 'ошибка чтения медиа-сессий').slice(0, 300); return; }
  if (m.t === 's') {
    lastLineAt = Date.now(); lastError = '';
    const arr = Array.isArray(m.sessions) ? m.sessions : (m.sessions ? [m.sessions] : []);
    scriptErrs = (Array.isArray(m.errs) ? m.errs : (m.errs ? [m.errs] : [])).map(String).slice(0, 3);
    sessions = arr.map((s) => ({ id: String(s.id || ''), title: String(s.title || ''), artist: String(s.artist || ''), album: String(s.album || ''), status: String(s.status || ''),
      pos: Number(s.pos) || 0, dur: Number(s.dur) || 0, rate: Number(s.rate) || 1, key: String(s.key || ''), current: !!s.current, at: lastLineAt }));
    onChange();
  }
}

const EXT_STALE_MS = 5000;
/** Данные от расширения: { browser, items: [{ id, title, artist, site, playing, pos, dur, rate, cover, tabActive }] } */
function setBrowser(b) {
  const items = Array.isArray(b.items) ? b.items : [];
  extBrowser = String(b.browser || '').slice(0, 40);
  extAt = Date.now();
  extItems = items.slice(0, 20).map((s, i) => ({ id: String(s.id || extBrowser || 'browser').slice(0, 60), title: String(s.title || '').slice(0, 300), artist: String(s.artist || '').slice(0, 200), album: '', site: String(s.site || '').slice(0, 100),
    status: s.playing ? 'Playing' : 'Paused', pos: Math.max(0, Number(s.pos) || 0), dur: Number.isFinite(Number(s.dur)) && Number(s.dur) > 0 ? Number(s.dur) : 0, rate: Number(s.rate) || 1,
    key: 'ext|' + String(s.id || '') + '|' + String(s.title || '').slice(0, 80) + '|' + i, current: !!s.tabActive && !!s.playing, at: extAt, cover: /^https?:\/\//.test(String(s.cover || '')) ? String(s.cover).slice(0, 600) : '', ext: true }));
  onChange();
}
const extFresh = () => extAt > 0 && Date.now() - extAt < EXT_STALE_MS;

function start(cb) {
  if (cb) onChange = cb;
  wantRunning = true;
  if (process.platform !== 'win32' || child) return;
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-ParentPid', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { lastError = 'не удалось запустить PowerShell: ' + e.message; child = null; return; }
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const ln = buf.slice(0, i); buf = buf.slice(i + 1); handleLine(ln); } });
  child.stderr.on('data', (d) => { lastError = String(d).slice(0, 300); });
  child.on('error', (e) => { lastError = 'PowerShell: ' + e.message; });
  child.on('exit', () => {
    child = null; sessions = [];
    if (wantRunning) { clearTimeout(restartTimer); restartTimer = setTimeout(() => { if (wantRunning) start(); }, 5000); }
    onChange();
  });
}

function stop() {
  wantRunning = false; clearTimeout(restartTimer);
  if (child) { try { child.kill(); } catch (_) {} child = null; }
  sessions = [];
}

function setDemo(sec) {
  const now = Date.now();
  demo = { until: now + (sec || 25) * 1000, at: now, sessions: [
    { id: 'Chrome', title: 'Lofi Hip Hop Radio — beats to relax/study to', artist: 'Lofi Girl', album: '', status: 'Playing', pos: 754, dur: 2465, rate: 1, key: 'demo1', current: true, at: now },
    { id: 'Spotify.exe', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We\'re Dreaming', status: 'Paused', pos: 83, dur: 243, rate: 1, key: 'demo2', current: false, at: now },
    { id: 'firefox', title: 'Интервью: как делают оверлеи', artist: '', album: '', status: 'Paused', pos: 600, dur: 3600, rate: 1, key: 'demo3', current: false, at: now },
  ] };
  onChange();
}
const demoActive = () => !!(demo && demo.until > Date.now());

const diag = () => ({ ext: { fresh: extFresh(), count: extItems.length, browser: extBrowser }, win: process.platform === 'win32', running: !!child, lastLineAgoSec: lastLineAt ? Math.round((Date.now() - lastLineAt) / 1000) : null, raw: sessions.length, titles: sessions.slice(0, 4).map((s) => (appName(s.id) + ': ' + (s.title || '(без названия)') + ' [' + s.status + ']')), errs: scriptErrs });

/** Состояние для оверлея по настройкам cfg (config.eventAlerts.nowplaying). */
function getState(cfg) {
  cfg = cfg || {};
  const isDemo = demoActive();
  let src = isDemo ? demo.sessions : sessions;
  if (!isDemo && extFresh() && extItems.length) {
    // расширение знает точное время и название видео на странице — его данные важнее заголовка окна/системных сессий того же видео
    const same = (a, b) => a && b && (a === b || a.includes(b) || b.includes(a));
    src = src.filter((s) => !(isBrowser(s.id) && extItems.some((e) => same(e.title.toLowerCase(), s.title.toLowerCase()))));
    src = src.concat(extItems);
  }
  const brs = parseIgnore(cfg.browsers);
  if (!isDemo) {
    if (brs.length) src = src.filter((s) => !isBrowser(s.id) || brs.some((x) => String(s.id).toLowerCase().includes(x) || appName(s.id).toLowerCase().includes(x)));
  }
  const ignore = parseIgnore(cfg.ignoreApps);
  const minDur = Number(cfg.minDurationSec) || 0;
  const list = src.filter((s) => (s.title || s.artist) && !ignore.some((x) => (s.id + ' ' + appName(s.id)).toLowerCase().includes(x))
    && !(minDur > 0 && s.dur > 0 && s.dur < minDur)).map((s) => {
    const c = s.ext ? null : covers.get(s.key);
    return { ext: !!s.ext, site: s.site || '', id: s.id, app: s.ext && s.site ? appName(s.id) + ' · ' + s.site : appName(s.id), browser: isBrowser(s.id) || !!s.ext, title: s.title, artist: s.artist, album: s.album, status: s.status, playing: s.status === 'Playing',
      pos: s.pos, dur: s.dur, rate: s.rate, cover: s.ext ? s.cover : c ? '/api/nowplaying/cover?k=' + encodeURIComponent(s.key) + '&v=' + c.v : (isDemo ? '/api/nowplaying/cover?k=' + encodeURIComponent(s.key) : ''), current: s.current, key: s.key, at: s.at };
  });
  const pickKey = (s) => s.app + '|' + (s.site || '') + '|' + s.title;
  const sources = list.map((s) => ({ key: pickKey(s), app: s.app, site: s.site, title: s.title, artist: s.artist, status: s.status, playing: s.playing, pos: s.pos, dur: s.dur, ext: s.ext, at: s.at }));
  if (cfg.sourceMode === 'manual') {
    // ручной выбор: показываем только выбранный источник (по сайту и названию; если название сменилось — тот же сайт и браузер)
    const [pa, ps, ...pt] = String(cfg.pick || '').split('|'); const ptitle = pt.join('|');
    const m = list.find((s) => pickKey(s) === cfg.pick) || list.find((s) => s.app === pa && (s.site || '') === ps && ps) || null;
    return { supported: process.platform === 'win32' || isDemo || extFresh(), demo: isDemo, error: lastError, fresh: isDemo || extFresh() || (lastLineAt > 0 && Date.now() - lastLineAt < STALE_MS),
      diag: diag(), now: Date.now(), current: m, others: [], count: list.length, sources, picked: m ? pickKey(m) : '' };
  }
  // текущая: играющая, которую Windows считает главной → любая играющая → (если не скрываем паузу) главная/последняя
  let cur = list.find((s) => s.playing && s.current) || list.find((s) => s.playing) || null;
  if (!cur && !cfg.hideWhenPaused) cur = list.find((s) => s.current) || list[0] || null;
  return {
    supported: process.platform === 'win32' || isDemo || extFresh(), demo: isDemo, error: lastError,
    fresh: isDemo || extFresh() || (lastLineAt > 0 && Date.now() - lastLineAt < STALE_MS),
    diag: diag(), sources, picked: cur ? pickKey(cur) : '',
    now: Date.now(), current: cur, others: list.filter((s) => cur && s !== cur), count: list.length,
  };
}
const DEMO_COLORS = { demo1: ['#ff9a3d', '#a970ff'], demo2: ['#1db954', '#0b5d2a'], demo3: ['#3ba7ff', '#1a2a6c'] };
function getCover(key) {
  key = String(key || '');
  const d = DEMO_COLORS[key];
  if (d) return { mime: 'image/svg+xml', buf: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${d[0]}"/><stop offset="1" stop-color="${d[1]}"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="120" cy="120" r="54" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="10"/><circle cx="120" cy="120" r="12" fill="rgba(255,255,255,.7)"/></svg>`) };
  return covers.get(key) || null;
}

module.exports = { setBrowser, start, stop, setDemo, getState, getCover, appName, _handleLine: handleLine, _setSessions: (s) => { sessions = s; lastLineAt = Date.now(); } };
