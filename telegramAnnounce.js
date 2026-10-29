'use strict';
// Анонс стрима в Telegram: когда трансляция начинается, бот пишет в канал название, категорию
// и (по желанию) присылает скриншот с эфира. Настройки лежат в telegram.json (в .gitignore).
const fs = require('fs');
const path = require('path');
const pageShot = require('./pageShot');

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

let cfg = { mode: 'relay', relayKey: '', relayTitle: '', linkCode: '', enabled: false, token: '', chatId: '', withScreen: true, delaySec: 90, template: DEFAULT_TEMPLATE, withButton: true, onCategory: 'replace', afterEnd: 'keep', liveUpdate: true, endPost: true, endShot: true, chrPost: false, posts: [], post: null, lastGame: '', lastSentAt: 0, lastError: '' };
let getInfo = async () => null; // ({light}) => { info, channel, gameArt }
let ext = { getTotalMessages: () => 0, getTopChatters: () => [], port: 3001, chroniclesUrl: () => '', getChronicle: () => null, posterFile: () => null };
let live = null, liveTimer = null; // трекер текущего эфира: зрители, игры, события
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

async function deliver(text, img, url, btn) {
  if (btn === undefined) btn = cfg.withButton;
  if (cfg.mode === 'relay') {
    const fd = new FormData();
    fd.append('key', cfg.relayKey); fd.append('text', text);
    if (btn) fd.append('button', url);
    if (img) fd.append('photo', new Blob([img], { type: 'image/jpeg' }), 'stream.jpg');
    const r = await fetch(RELAY_URL + '/send', { method: 'POST', body: fd, signal: AbortSignal.timeout(40000) });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) throw new Error((j && j.error) || 'Сервер анонсов не ответил.');
    return { kind: img ? 'photo' : 'text', id: j.id };
  }
  const markup = btn ? JSON.stringify({ inline_keyboard: [[{ text: '▶ Смотреть стрим', url }]] }) : null;
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
  const run = async (t) => ({ ...(await deliver(t, img, v.url)), html: t, url: v.url });
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


// ---------- живой анонс и итог стрима ----------
const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? `${h} ч ${m % 60} мин` : `${m} мин`; };
const fmtNum = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function noteInfo(info) {
  if (!live || !info) return;
  live.cur = info.viewer_count || 0; live.samples++; live.sum += live.cur; live.peak = Math.max(live.peak, live.cur);
  if (info.title) live.title = info.title;
  if (info.user_name) { live.userName = info.user_name; live.login = info.user_login; }
  const g = info.game_name || '';
  if (g) { const last = live.games[live.games.length - 1]; if (!last || last.name !== g) live.games.push({ name: g, at: Date.now() }); }
}
function startTracking(info) {
  if (live) return;
  live = { startedAt: info && info.started_at ? Date.parse(info.started_at) || Date.now() : Date.now(), samples: 0, sum: 0, peak: 0, cur: 0, ticks: 0, title: '', userName: '', login: '', games: [], follows: 0, subs: 0, donations: 0, donRub: 0, msgStart: ext.getTotalMessages() };
  noteInfo(info);
  clearInterval(liveTimer); liveTimer = setInterval(liveTick, 60 * 1000); liveTimer.unref && liveTimer.unref();
}
/** Вызывается каждый опрос статуса стрима: если эфир идёт, а слежения ещё нет (сервер запущен посреди стрима), начинаем. */
function noteLive(isLive) {
  if (!isLive || live || !cfg.enabled || !ready()) return;
  getInfo({ light: true }).then((d) => { if (d && d.info) startTracking(d.info); }).catch(() => {});
}
function noteEvent(kind, data) {
  if (!live) return;
  if (kind === 'follow') live.follows++;
  else if (kind === 'sub') live.subs += (data && data.count) || 1;
  else if (kind === 'donation') { live.donations++; live.donRub += (data && data.rub) || 0; }
}
const liveLine = () => `\n\n🕒 <i>В эфире ${fmtDur(Date.now() - live.startedAt)} · 👁 ${live.cur}</i>`;
const endLine = (L) => `\n\n⚫ <i>Эфир завершён · ${fmtDur(Date.now() - L.startedAt)}</i>`;

async function editPost(post, html) {
  if (!post || !post.id || !ready()) return;
  if (post.kind === 'photo' && html.length > 1024) return;
  const btn = cfg.withButton && post.url ? post.url : '';
  if (cfg.mode === 'relay') { await relayPost('/edit', { key: cfg.relayKey, id: post.id, text: html, kind: post.kind, button: btn }); return; }
  const markup = btn ? { inline_keyboard: [[{ text: '▶ Смотреть стрим', url: btn }]] } : { inline_keyboard: [] };
  try {
    if (post.kind === 'photo') await tg('editMessageCaption', { chat_id: cfg.chatId, message_id: post.id, caption: html, parse_mode: 'HTML', reply_markup: markup });
    else await tg('editMessageText', { chat_id: cfg.chatId, message_id: post.id, text: html, parse_mode: 'HTML', reply_markup: markup });
  } catch (e) { if (!/not modified/i.test(e.message)) throw e; }
}

async function liveTick() {
  if (!live) return;
  try {
    const d = await getInfo({ light: true });
    if (!d || !d.info) return;
    noteInfo(d.info); live.ticks++;
    if (cfg.enabled && cfg.liveUpdate && cfg.post && live.ticks % 5 === 0) await editPost(cfg.post, cfg.post.html + liveLine());
  } catch (e) { /* сеть моргнула: следующая попытка через минуту */ }
}

function summaryText(L) {
  const dur = Date.now() - L.startedAt, avg = L.samples ? Math.round(L.sum / L.samples) : 0;
  const lines = ['⚫ <b>Стрим закончился</b>'];
  if (L.title) lines.push('', `<blockquote>${esc(L.title)}</blockquote>`);
  lines.push('', `⏱ ${fmtDur(dur)} · 👁 пик ${fmtNum(L.peak)}${avg ? ` · в среднем ${fmtNum(avg)}` : ''}`);
  if (L.games.length) {
    const g = L.games.map((x, i) => { const end = i + 1 < L.games.length ? L.games[i + 1].at : Date.now(); return `${esc(x.name)}${L.games.length > 1 ? ` (${fmtDur(end - x.at)})` : ''}`; });
    lines.push(`🎮 ${g.join(' → ')}`);
  }
  const msgs = Math.max(0, ext.getTotalMessages() - L.msgStart);
  const top = msgs ? ext.getTopChatters(3).map((c) => esc(c.username)) : [];
  if (msgs) lines.push(`💬 ${fmtNum(msgs)} сообщений${top.length ? ` · активнее всех: ${top.join(', ')}` : ''}`);
  const ev = [];
  if (L.follows) ev.push(`+${fmtNum(L.follows)} фолловеров`);
  if (L.subs) ev.push(`подписок: ${fmtNum(L.subs)}`);
  if (L.donations) ev.push(`донатов: ${fmtNum(L.donations)}${L.donRub ? ` на ${fmtNum(L.donRub)} ₽` : ''}`);
  if (ev.length) lines.push(`👥 ${ev.join(' · ')}`);
  lines.push('', `https://twitch.tv/${L.login || ''}`);
  return lines.join('\n').replace(/twitch\.tv\/$/, 'twitch.tv');
}

async function sendSummary(L, sample) {
  const text = summaryText(L);
  let img = null;
  if (cfg.endShot) {
    try { img = await pageShot.capture(`http://127.0.0.1:${ext.port}/summary-shot.html`); if (img.length > 4.5 * 1024 * 1024) img = null; }
    catch (e) { console.warn('[Telegram] Снимок сцены статистики не получился:', e.message); cfg.lastError = 'Снимок сцены статистики не получился: ' + e.message; save(); }
  }
  if (img && text.length > 1000) img = null;
  const r = await deliver(text, img, '', false);
  return { kind: r.kind, id: r.id };
}

async function finalizeStream() {
  const L = live; live = null; clearInterval(liveTimer); liveTimer = null;
  const ids = cfg.posts, post = cfg.post;
  try {
    if (cfg.afterEnd === 'delete') { cfg.posts = []; cfg.post = null; save(); await deletePosts(ids); }
    else if (post && cfg.liveUpdate && L) { cfg.post = null; save(); await editPost(post, post.html + endLine(L)).catch(() => {}); }
    else { cfg.post = null; save(); }
    if (cfg.endPost && L && L.samples) { await sendSummary(L); cfg.lastError = cfg.lastError && /Снимок/.test(cfg.lastError) ? cfg.lastError : ''; save(); }
  } catch (e) { cfg.lastError = e.message; save(); console.warn('[Telegram] Итог стрима:', e.message); }
}

/** Пример итога для кнопки «Отправить пример»: по идущему стриму или с выдуманными цифрами. */
async function testEnd() {
  if (!ready()) throw new Error(cfg.mode === 'relay' ? 'Сначала привяжи канал.' : 'Укажи токен бота и канал.');
  const d = await getInfo({ light: true }).catch(() => null);
  const L = live ? { ...live } : { startedAt: Date.now() - (3 * 60 + 12) * 60000, samples: 190, sum: 190 * 210, peak: 340, title: (d && d.info && d.info.title) || 'Проходим Resident Evil 4', login: (d && d.channel) || 'channel', games: [{ name: 'Resident Evil 4', at: Date.now() - 192 * 60000 }], follows: 12, subs: 3, donations: 4, donRub: 2300, msgStart: ext.getTotalMessages() - 1240 };
  const r = await sendSummary(L);
  return { kind: r.kind, live: !!live };
}

// ---------- карточки из «Хроник» ----------
const chrTimers = new Map();
function chronicleText(it) {
  const icon = it.type === 'game' ? '🎮' : '🎬';
  const lines = [`${icon} <b>${esc(it.title)}</b>${it.year ? ` (${esc(it.year)})` : ''}`];
  if (it.genres && it.genres.length) lines.push(`🏷 ${it.genres.map(esc).join(', ')}`);
  const sc = [];
  if (it.rating != null) sc.push(`⭐ Моя оценка: ${String(Math.min(10, it.rating)).replace('.', ',')}/10`);
  if (it.chatRating != null && it.type !== 'game') sc.push(`💬 чат: ${String(it.chatRating).replace('.', ',')}/10`);
  if (sc.length) lines.push(sc.join(' · '));
  if (it.type === 'game' && it.hours != null) lines.push(`⏱ Пройдено за ${String(it.hours).replace('.', ',')} ч`);
  if (it.by) lines.push(`🙋 Заказал: ${esc(it.by)}`);
  if (it.comment) lines.push('', `<blockquote>${esc(it.comment.length > 450 ? it.comment.slice(0, 450).replace(/\s+\S*$/, '') + '…' : it.comment)}</blockquote>`);
  const site = ext.chroniclesUrl();
  if (site) lines.push('', `📖 Весь журнал: ${site}`);
  return lines.join('\n');
}
async function postChronicle(it) {
  if (!ready()) throw new Error(cfg.mode === 'relay' ? 'Сначала привяжи канал в разделе «Телеграм».' : 'Укажи токен бота и канал в разделе «Телеграм».');
  let img = null;
  const f = it.poster && ext.posterFile(it.poster);
  if (f) { try { const b = fs.readFileSync(f); if (b.length < 4.5 * 1024 * 1024) img = b; } catch (e) { /* файла нет */ } }
  let text = chronicleText(it);
  if (img && text.length > 1000) img = null;
  const r = await deliver(text, img, '', false);
  return { kind: r.kind };
}
/** Новая запись добавлена в «Хроники»: через 25 секунд (успеть загрузить обложку) шлём карточку в канал. */
function scheduleChronicle(id) {
  if (!cfg.chrPost || !ready()) return;
  clearTimeout(chrTimers.get(id));
  const t = setTimeout(async () => {
    chrTimers.delete(id);
    const it = ext.getChronicle(id); if (!it) return;
    try { await postChronicle(it); cfg.lastError = ''; } catch (e) { cfg.lastError = 'Хроники: ' + e.message; }
    save();
  }, 25 * 1000);
  t.unref && t.unref(); chrTimers.set(id, t);
}

async function announce() {
  if (!cfg.enabled || !ready()) return;
  if (Date.now() - cfg.lastSentAt < COOLDOWN_MS) return;
  try {
    const data = await getInfo();
    if (!data || !data.info) { cfg.lastError = 'Стрим уже не идёт, анонс не отправлен.'; save(); return; }
    const r = await send(data);
    cfg.lastSentAt = Date.now(); cfg.lastError = ''; cfg.lastGame = data.info.game_name || '';
    cfg.posts = r.id ? [r.id] : []; cfg.post = r.id ? { id: r.id, kind: r.kind, html: r.html, url: r.url } : null; save();
    startTracking(data.info);
    console.log('[Telegram] Анонс стрима отправлен.');
  } catch (e) { cfg.lastError = e.message; save(); console.warn('[Telegram] Анонс не отправлен:', e.message); }
}

/** Вызывается, когда стрим только что начался. */
function onStreamStart() {
  clearTimeout(endTimer); endTimer = null; // стрим вернулся (обрыв связи): посты не удаляем
  if (!cfg.enabled || !ready()) return;
  noteLive(true);
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
      const prev = cfg.post;
      cfg.posts = (cfg.onCategory === 'replace' ? [] : old).concat(r.id ? [r.id] : []).slice(-20); cfg.post = r.id ? { id: r.id, kind: r.kind, html: r.html, url: r.url } : null; save();
      if (cfg.onCategory === 'replace') await deletePosts(old);
      else if (prev && cfg.liveUpdate) await editPost(prev, prev.html).catch(() => {}); // у старого поста убираем строку «в эфире»
    } catch (e) { cfg.lastError = e.message; save(); }
  }, 20000);
  catTimer.unref && catTimer.unref();
}

/** Стрим закончился: по желанию удаляем все анонсы этой трансляции (с запасом на обрыв связи). */
function onStreamEnd() {
  clearTimeout(timer); clearTimeout(catTimer);
  if (!cfg.enabled || !ready()) return;
  if (!live && !cfg.posts.length) return;
  clearTimeout(endTimer);
  endTimer = setTimeout(() => { endTimer = null; finalizeStream(); }, 2 * 60 * 1000); // с запасом на обрыв связи: вернулся стрим — ничего не делаем
  endTimer.unref && endTimer.unref();
}

function publicState() {
  return {
    mode: cfg.mode, relayLinked: !!cfg.relayKey, relayTitle: cfg.relayTitle, linkCode: cfg.linkCode, relayAvailable: !!RELAY_URL,
    enabled: !!cfg.enabled, hasToken: !!cfg.token, tokenHint: cfg.token ? '…' + cfg.token.slice(-4) : '', chatId: cfg.chatId,
    withScreen: !!cfg.withScreen, delaySec: cfg.delaySec, template: cfg.template, lastSentAt: cfg.lastSentAt, lastError: cfg.lastError,
    defaultTemplate: DEFAULT_TEMPLATE, presets: PRESETS,
    withButton: !!cfg.withButton, onCategory: cfg.onCategory, afterEnd: cfg.afterEnd,
    liveUpdate: !!cfg.liveUpdate, endPost: !!cfg.endPost, endShot: !!cfg.endShot, chrPost: !!cfg.chrPost, browserFound: !!pageShot.findBrowser(),
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
  ['liveUpdate', 'endPost', 'endShot', 'chrPost'].forEach((k) => { if (typeof b[k] === 'boolean') cfg[k] = b[k]; });
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

function init(infoGetter, extra) { getInfo = infoGetter; if (extra) ext = { ...ext, ...extra }; load(); }

module.exports = { _finalize: () => finalizeStream(), _tick: () => liveTick(), _live: () => live, init, onStreamStart, onCategoryChange, onStreamEnd, noteLive, noteEvent, testEnd, postChronicle, scheduleChronicle, summaryText, chronicleText, publicState, update, check, test, linkStart, linkCheck, DEFAULT_TEMPLATE };
