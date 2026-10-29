'use strict';
// Анонс стрима в Telegram: когда трансляция начинается, бот пишет в канал название, категорию
// и (по желанию) присылает скриншот с эфира. Настройки лежат в telegram.json (в .gitignore).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'telegram.json');
const COOLDOWN_MS = 30 * 60 * 1000; // повторный старт стрима в течение 30 минут (обрыв связи) заново не анонсируем
// Общий бот Overdeck: сообщения отправляет маленький Cloudflare Worker (код в telegram-relay/), токен бота лежит только у него.
const RELAY_URL = 'https://overdeck-telegram.starikovnik090909.workers.dev';
const OLD_DEFAULT = '🔴 {channel} в эфире!\n\n{title}\n🎮 {game}\n\n{url}';
// Готовые шаблоны анонса. Разрешены теги <b> <i> <u> <s> <code> <blockquote> <tg-spoiler>.
const PRESETS = [
  { id: 'quote', name: 'Цитата', desc: 'Название в блоке-цитате', template: '🔴 <b>{channel}</b> вышел в эфир\n\n<blockquote>{title}</blockquote>\n🎮 {game}\n\n{url}' },
  { id: 'classic', name: 'Классика', desc: 'Простой текст', template: OLD_DEFAULT },
  { id: 'min', name: 'Минимал', desc: 'Только суть', template: '🔴 <b>{title}</b>\n{url}' },
  { id: 'big', name: 'Крупно', desc: 'Жирный заголовок', template: '<b>🔴 СТРИМ НАЧАЛСЯ</b>\n\n<b>{title}</b>\n\n🎮 {game}\n👉 {url}' },
  { id: 'hype', name: 'Хайп', desc: 'Много эмодзи', template: '🔥🔥🔥 ЭФИР ПОШЁЛ 🔥🔥🔥\n\n🎬 {title}\n🕹 {game}\n\n🚀 Залетай: {url}' },
  { id: 'calm', name: 'Тихий', desc: 'Спокойный тон', template: 'Привет! Я в эфире.\n\nСегодня: <i>{title}</i>\nИграем в {game}.\n\nЗаходи, буду рад: {url}' },
  { id: 'list', name: 'Список', desc: 'Структурный', template: '🔴 <b>LIVE · {channel}</b>\n\n▫️ <b>Тема:</b> {title}\n▫️ <b>Игра:</b> {game}\n▫️ <b>Где:</b> {url}' },
  { id: 'spoiler', name: 'Интрига', desc: 'Игра под спойлером', template: '🔴 {channel} в эфире\n\n{title}\n\nВо что играем? <tg-spoiler>{game}</tg-spoiler>\n\n{url}' },
  { id: 'news', name: 'Новости', desc: 'Как заголовок', template: '<b>В ЭФИРЕ</b> · {game}\n\n{title}\n\nСмотреть: {url}' },
  { id: 'short', name: 'Короткий', desc: 'Одна строка', template: '🔴 {channel}: {title} ({game}) {url}' },
];
const DEFAULT_TEMPLATE = PRESETS[0].template;

let cfg = { mode: 'relay', relayKey: '', relayTitle: '', linkCode: '', enabled: false, token: '', chatId: '', withScreen: true, delaySec: 90, template: DEFAULT_TEMPLATE, withButton: true, onCategory: 'replace', afterEnd: 'keep', posts: [], lastGame: '', lastSentAt: 0, lastError: '' };
let getInfo = async () => null; // () => { info, channel }
let timer = null, catTimer = null, endTimer = null;

const ready = () => (cfg.mode === 'relay' ? !!cfg.relayKey : !!(cfg.token && cfg.chatId));

function load() {
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) { /* нет файла */ }
  if (cfg.template === OLD_DEFAULT) cfg.template = DEFAULT_TEMPLATE; // старый шаблон по умолчанию заменён на «Цитату»
  if (!Array.isArray(cfg.posts)) cfg.posts = [];
}
function save() { try { fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 }); } catch (e) { console.warn('[Telegram] не удалось сохранить:', e.message); } }

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TAGS = 'b|i|u|s|code|blockquote';
/** Шаблон → HTML для Telegram: всё экранируется, разрешены только безопасные теги; данные эфира подставляются уже экранированными. */
function render(tpl, v) {
  let t = esc(String(tpl || DEFAULT_TEMPLATE));
  t = t.replace(new RegExp('&lt;(/?)(' + TAGS + ')&gt;', 'g'), '<$1$2>').replace(/&lt;(\/?)tg-spoiler&gt;/g, '<$1tg-spoiler>');
  return t.replace(/\{(title|game|channel|url)\}/g, (m, k) => esc(v[k] || ''));
}
const stripTags = (h) => h.replace(/<\/?(?:b|i|u|s|code|blockquote|tg-spoiler)>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function tg(method, body, isForm) {
  const r = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: 'POST', headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) throw new Error(tgError(j));
  return j.result;
}
function tgError(j) {
  const d = (j && j.description) || 'нет ответа от Telegram';
  if (/chat not found/i.test(d)) return 'Чат не найден. Проверь @имя канала и что бот добавлен в канал админом.';
  if (/not enough rights|have no rights|CHAT_WRITE_FORBIDDEN|bot is not a member/i.test(d)) return 'У бота нет прав писать в канал. Добавь его админом с правом публикации.';
  if (/Unauthorized|not found/i.test(d) && j && j.error_code === 401) return 'Неверный токен бота.';
  return d;
}

async function download(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 2000 ? buf : null;
  } catch (e) { return null; }
}
/** Картинка анонса: скриншот эфира, а если не получился — обложка категории. */
async function pickImage(data) {
  if (!cfg.withScreen) return null;
  const info = data.info;
  if (info && info.thumbnail_url) {
    const shot = await download(info.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') + '?t=' + Date.now());
    if (shot) return shot;
  }
  if (data.gameArt) return download(String(data.gameArt).replace('285x380', '600x800'));
  return null;
}

async function relayPost(path, body) {
  const r = await fetch(RELAY_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) throw new Error((j && j.error) || 'Сервер анонсов не ответил.');
  return j;
}

async function deliver(text, img, url) {
  if (cfg.mode === 'relay') {
    const fd = new FormData();
    fd.append('key', cfg.relayKey); fd.append('text', text);
    if (cfg.withButton) fd.append('button', url);
    if (img) fd.append('photo', new Blob([img], { type: 'image/jpeg' }), 'stream.jpg');
    const r = await fetch(RELAY_URL + '/send', { method: 'POST', body: fd, signal: AbortSignal.timeout(40000) });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) throw new Error((j && j.error) || 'Сервер анонсов не ответил.');
    return { kind: img ? 'photo' : 'text', id: j.id };
  }
  const markup = cfg.withButton ? JSON.stringify({ inline_keyboard: [[{ text: '▶ Смотреть стрим', url }]] }) : null;
  if (img) {
    const fd = new FormData();
    fd.append('chat_id', cfg.chatId); fd.append('parse_mode', 'HTML'); fd.append('caption', text);
    if (markup) fd.append('reply_markup', markup);
    fd.append('photo', new Blob([img], { type: 'image/jpeg' }), 'stream.jpg');
    const res = await tg('sendPhoto', fd, true);
    return { kind: 'photo', id: res.message_id };
  }
  const res = await tg('sendMessage', { chat_id: cfg.chatId, text, parse_mode: 'HTML', disable_web_page_preview: false, ...(markup ? { reply_markup: JSON.parse(markup) } : {}) });
  return { kind: 'text', id: res.message_id };
}

async function send({ info, channel, gameArt }) {
  const v = {
    title: (info && info.title) || 'Без названия', game: (info && info.game_name) || 'Без категории',
    channel: (info && info.user_name) || channel, url: `https://twitch.tv/${(info && info.user_login) || channel}`,
  };
  const html = render(cfg.template, v);
  let img = await pickImage({ info, gameArt });
  if (img && html.length > 1000) img = null; // подпись к фото не длиннее 1024 знаков
  const run = (t) => deliver(t, img, v.url);
  try { return await run(html); }
  catch (e) { if (/parse entities|can't parse/i.test(e.message)) return run(stripTags(html)); throw e; } // кривые теги в своём шаблоне: шлём без форматирования
}

async function deletePosts(ids) {
  ids = (ids || []).filter(Boolean);
  if (!ids.length || !ready()) return;
  try {
    if (cfg.mode === 'relay') await relayPost('/delete', { key: cfg.relayKey, ids });
    else for (const id of ids) await tg('deleteMessage', { chat_id: cfg.chatId, message_id: id }).catch(() => {});
  } catch (e) { cfg.lastError = 'Не удалось удалить пост: ' + e.message; save(); }
}

async function announce() {
  if (!cfg.enabled || !ready()) return;
  if (Date.now() - cfg.lastSentAt < COOLDOWN_MS) return;
  try {
    const data = await getInfo();
    if (!data || !data.info) { cfg.lastError = 'Стрим уже не идёт, анонс не отправлен.'; save(); return; }
    const r = await send(data);
    cfg.lastSentAt = Date.now(); cfg.lastError = ''; cfg.lastGame = data.info.game_name || '';
    cfg.posts = r.id ? [r.id] : []; save();
    console.log('[Telegram] Анонс стрима отправлен.');
  } catch (e) { cfg.lastError = e.message; save(); console.warn('[Telegram] Анонс не отправлен:', e.message); }
}

/** Вызывается, когда стрим только что начался. */
function onStreamStart() {
  clearTimeout(endTimer); endTimer = null; // стрим вернулся (обрыв связи): посты не удаляем
  if (!cfg.enabled || !ready()) return;
  clearTimeout(timer);
  timer = setTimeout(announce, Math.max(0, Math.min(600, Number(cfg.delaySec) || 0)) * 1000);
  timer.unref && timer.unref();
}

/** Категория на идущем стриме сменилась: новый анонс, старый удаляется или остаётся. */
function onCategoryChange() {
  if (!cfg.enabled || !ready() || cfg.onCategory === 'off' || !cfg.posts.length) return;
  clearTimeout(catTimer);
  catTimer = setTimeout(async () => {
    try {
      const data = await getInfo();
      if (!data || !data.info || !cfg.posts.length) return;
      if ((data.info.game_name || '') === cfg.lastGame) return;
      const old = cfg.posts;
      const r = await send(data);
      cfg.lastGame = data.info.game_name || ''; cfg.lastSentAt = Date.now(); cfg.lastError = '';
      cfg.posts = (cfg.onCategory === 'replace' ? [] : old).concat(r.id ? [r.id] : []).slice(-20); save();
      if (cfg.onCategory === 'replace') await deletePosts(old);
    } catch (e) { cfg.lastError = e.message; save(); }
  }, 20000);
  catTimer.unref && catTimer.unref();
}

/** Стрим закончился: по желанию удаляем все анонсы этой трансляции (с запасом на обрыв связи). */
function onStreamEnd() {
  clearTimeout(timer); clearTimeout(catTimer);
  if (!cfg.enabled || cfg.afterEnd !== 'delete' || !cfg.posts.length) return;
  clearTimeout(endTimer);
  endTimer = setTimeout(async () => { const ids = cfg.posts; cfg.posts = []; save(); await deletePosts(ids); }, 2 * 60 * 1000);
  endTimer.unref && endTimer.unref();
}

function publicState() {
  return {
    mode: cfg.mode, relayLinked: !!cfg.relayKey, relayTitle: cfg.relayTitle, linkCode: cfg.linkCode, relayAvailable: !!RELAY_URL,
    enabled: !!cfg.enabled, hasToken: !!cfg.token, tokenHint: cfg.token ? '…' + cfg.token.slice(-4) : '', chatId: cfg.chatId,
    withScreen: !!cfg.withScreen, delaySec: cfg.delaySec, template: cfg.template, lastSentAt: cfg.lastSentAt, lastError: cfg.lastError,
    defaultTemplate: DEFAULT_TEMPLATE, presets: PRESETS,
    withButton: !!cfg.withButton, onCategory: cfg.onCategory, afterEnd: cfg.afterEnd,
  };
}

function update(b) {
  b = b || {};
  if (typeof b.token === 'string' && b.token.trim()) cfg.token = b.token.trim().slice(0, 200);
  if (b.mode === 'relay' || b.mode === 'own') cfg.mode = b.mode;
  if (b.unlink) { cfg.relayKey = ''; cfg.relayTitle = ''; cfg.linkCode = ''; cfg.enabled = cfg.mode === 'relay' ? false : cfg.enabled; }
  if (typeof b.chatId === 'string') cfg.chatId = b.chatId.trim().slice(0, 100);
  if (typeof b.enabled === 'boolean') cfg.enabled = b.enabled;
  if (typeof b.withScreen === 'boolean') cfg.withScreen = b.withScreen;
  if (b.delaySec != null) cfg.delaySec = Math.max(0, Math.min(600, Number(b.delaySec) || 0));
  if (typeof b.withButton === 'boolean') cfg.withButton = b.withButton;
  if (['off', 'replace', 'new'].includes(b.onCategory)) cfg.onCategory = b.onCategory;
  if (['keep', 'delete'].includes(b.afterEnd)) cfg.afterEnd = b.afterEnd;
  if (typeof b.template === 'string') cfg.template = b.template.slice(0, 900) || DEFAULT_TEMPLATE;
  if (b.clearToken) { cfg.token = ''; cfg.enabled = false; }
  save(); return publicState();
}

/** Проверка токена и доступа бота к каналу. */
async function relayCall(path, opt) {
  let r; try { r = await fetch(RELAY_URL + path, { ...opt, signal: AbortSignal.timeout(20000) }); } catch (e) { throw new Error('Сервер анонсов Overdeck недоступен.'); }
  const j = await r.json().catch(() => null);
  return { status: r.status, j: j || {} };
}

/** Шаг 1 привязки через общего бота: ссылка «добавить бота в канал» и код для публикации в канале. */
async function linkStart() {
  const { j } = await relayCall('/info');
  if (!j.ok) throw new Error(j.error || 'Сервер анонсов не настроен.');
  cfg.linkCode = 'OV-' + require('crypto').randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 14);
  save();
  return { bot: j.bot, addUrl: `https://t.me/${j.bot}?startchannel=1&admin=post_messages`, code: cfg.linkCode };
}

/** Шаг 2: сервер ищет в канале пост с кодом и подтверждает, что канал твой. */
async function linkCheck() {
  if (!cfg.linkCode) throw new Error('Сначала нажми «Добавить бота в канал».');
  const { status, j } = await relayCall('/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: cfg.linkCode }) });
  if (j.ok) { cfg.relayKey = j.key; cfg.relayTitle = j.title; cfg.linkCode = ''; cfg.lastError = ''; save(); return { linked: true, title: j.title }; }
  if (status === 404 && j.pending) return { linked: false };
  throw new Error(j.error || 'Не удалось подтвердить канал.');
}

async function check() {
  if (cfg.mode === 'relay') {
    const { j } = await relayCall('/info');
    if (!j.ok) throw new Error(j.error || 'Сервер анонсов не настроен.');
    return { bot: '@' + j.bot, chat: cfg.relayTitle };
  }
  if (!cfg.token) throw new Error('Вставь токен бота от @BotFather.');
  const me = await tg('getMe', {});
  let chat = null;
  if (cfg.chatId) {
    chat = await tg('getChat', { chat_id: cfg.chatId });
    const m = await tg('getChatMember', { chat_id: cfg.chatId, user_id: me.id }).catch(() => null);
    if (m && m.status !== 'administrator' && m.status !== 'creator') throw new Error('Бот в канале, но не админ. Дай ему право публиковать сообщения.');
  }
  return { bot: '@' + me.username, chat: chat ? (chat.title || chat.username || String(chat.id)) : '' };
}

/** Тестовый анонс: берёт данные идущего стрима или подставляет пример, если стрим офлайн. */
async function test() {
  if (!ready()) throw new Error(cfg.mode === 'relay' ? 'Сначала привяжи канал.' : 'Укажи токен бота и канал.');
  let data = await getInfo();
  if (!data || !data.info) data = { channel: (data && data.channel) || 'channel', info: null };
  const kind = await send(data);
  return { kind, live: !!data.info };
}

function init(infoGetter) { getInfo = infoGetter; load(); }

module.exports = { init, onStreamStart, onCategoryChange, onStreamEnd, publicState, update, check, test, linkStart, linkCheck, DEFAULT_TEMPLATE };
