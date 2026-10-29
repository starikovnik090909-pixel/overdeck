'use strict';
// Анонс стрима в Telegram: когда трансляция начинается, бот пишет в канал название, категорию
// и (по желанию) присылает скриншот с эфира. Настройки лежат в telegram.json (в .gitignore).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'telegram.json');
const COOLDOWN_MS = 30 * 60 * 1000; // повторный старт стрима в течение 30 минут (обрыв связи) заново не анонсируем
const DEFAULT_TEMPLATE = '🔴 {channel} в эфире!\n\n{title}\n🎮 {game}\n\n{url}';

let cfg = { enabled: false, token: '', chatId: '', withScreen: true, delaySec: 90, template: DEFAULT_TEMPLATE, lastSentAt: 0, lastError: '' };
let getInfo = async () => null; // () => { info, channel }
let timer = null;

function load() { try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) { /* нет файла */ } }
function save() { try { fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 }); } catch (e) { console.warn('[Telegram] не удалось сохранить:', e.message); } }

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(tpl, v) {
  return String(tpl || DEFAULT_TEMPLATE).replace(/\{(title|game|channel|url)\}/g, (m, k) => esc(v[k] || ''));
}

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

async function fetchThumb(info) {
  if (!info || !info.thumbnail_url) return null;
  const url = info.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') + '?t=' + Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 2000 ? buf : null;
  } catch (e) { return null; }
}

async function send({ info, channel }, preview) {
  const v = {
    title: (info && info.title) || 'Без названия', game: (info && info.game_name) || 'Без категории',
    channel: (info && info.user_name) || channel, url: `https://twitch.tv/${(info && info.user_login) || channel}`,
  };
  const text = render(cfg.template, v);
  if (cfg.withScreen) {
    const img = await fetchThumb(info);
    if (img) {
      const fd = new FormData();
      fd.append('chat_id', cfg.chatId); fd.append('parse_mode', 'HTML');
      fd.append('caption', text.slice(0, 1024));
      fd.append('photo', new Blob([img], { type: 'image/jpeg' }), 'stream.jpg');
      await tg('sendPhoto', fd, true);
      return 'photo';
    }
  }
  await tg('sendMessage', { chat_id: cfg.chatId, text, parse_mode: 'HTML', disable_web_page_preview: false });
  return 'text';
}

async function announce() {
  if (!cfg.enabled || !cfg.token || !cfg.chatId) return;
  if (Date.now() - cfg.lastSentAt < COOLDOWN_MS) return;
  try {
    const data = await getInfo();
    if (!data || !data.info) { cfg.lastError = 'Стрим уже не идёт, анонс не отправлен.'; save(); return; }
    await send(data);
    cfg.lastSentAt = Date.now(); cfg.lastError = ''; save();
    console.log('[Telegram] Анонс стрима отправлен.');
  } catch (e) { cfg.lastError = e.message; save(); console.warn('[Telegram] Анонс не отправлен:', e.message); }
}

/** Вызывается, когда стрим только что начался. */
function onStreamStart() {
  if (!cfg.enabled || !cfg.token || !cfg.chatId) return;
  clearTimeout(timer);
  timer = setTimeout(announce, Math.max(0, Math.min(600, Number(cfg.delaySec) || 0)) * 1000);
  timer.unref && timer.unref();
}

function publicState() {
  return {
    enabled: !!cfg.enabled, hasToken: !!cfg.token, tokenHint: cfg.token ? '…' + cfg.token.slice(-4) : '', chatId: cfg.chatId,
    withScreen: !!cfg.withScreen, delaySec: cfg.delaySec, template: cfg.template, lastSentAt: cfg.lastSentAt, lastError: cfg.lastError,
    defaultTemplate: DEFAULT_TEMPLATE,
  };
}

function update(b) {
  b = b || {};
  if (typeof b.token === 'string' && b.token.trim()) cfg.token = b.token.trim().slice(0, 200);
  if (typeof b.chatId === 'string') cfg.chatId = b.chatId.trim().slice(0, 100);
  if (typeof b.enabled === 'boolean') cfg.enabled = b.enabled;
  if (typeof b.withScreen === 'boolean') cfg.withScreen = b.withScreen;
  if (b.delaySec != null) cfg.delaySec = Math.max(0, Math.min(600, Number(b.delaySec) || 0));
  if (typeof b.template === 'string') cfg.template = b.template.slice(0, 900) || DEFAULT_TEMPLATE;
  if (b.clearToken) { cfg.token = ''; cfg.enabled = false; }
  save(); return publicState();
}

/** Проверка токена и доступа бота к каналу. */
async function check() {
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
  if (!cfg.token || !cfg.chatId) throw new Error('Укажи токен бота и канал.');
  let data = await getInfo();
  if (!data || !data.info) data = { channel: (data && data.channel) || 'channel', info: null };
  const kind = await send(data);
  return { kind, live: !!data.info };
}

function init(infoGetter) { getInfo = infoGetter; load(); }

module.exports = { init, onStreamStart, publicState, update, check, test, DEFAULT_TEMPLATE };
