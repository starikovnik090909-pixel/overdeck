'use strict';
// Интеграция с Discord.
//  1) Вебхук: анонс стрима, события (донаты, рейды, подписки, фолловеры) и итог стрима пишутся в канал сервера.
//  2) Бот (по желанию): подключается к Discord и отвечает на слэш-команды /status, /donors и /points.
// Настройки лежат в discord.json (в .gitignore): там же вебхук и токен бота, наружу они не отдаются.
const fs = require('fs');
const notifyUi = require('./notify');
const path = require('path');
const WebSocket = require('ws');

const FILE = path.join(__dirname, 'discord.json');
const API = 'https://discord.com/api/v10';
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
const COLOR = 0x2BC4B4;
const COOLDOWN_MS = 30 * 60 * 1000; // обрыв связи на стриме: заново не анонсируем
const WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?(?:discord|discordapp)\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/;

const DEFAULTS = {
  enabled: false,           // главный выключатель вебхука
  webhookUrl: '',
  username: '',             // имя отправителя (пусто = как в настройках вебхука)
  announce: true,           // анонс при старте стрима
  mention: 'none',          // none | here | everyone | id роли
  template: '🔴 **{channel}** в эфире!\n{title}',
  events: { donation: true, raid: true, sub: true, follow: false, end: true },
  minDonation: 0,           // донаты меньше этой суммы (в рублях) не публикуем
  botEnabled: false,
  botToken: '',
  guildId: '',              // если указан, команды появляются на сервере мгновенно
  lastSentAt: 0,
  lastError: '',
};

let cfg = JSON.parse(JSON.stringify(DEFAULTS));
let ext = { channel: () => '', getInfo: async () => null, getTopDonors: () => [], getTopPoints: () => [], port: 3001 };
let live = null;         // данные идущего стрима для итога
let liveTimer = null;
let lastAnnounceAt = 0;
const recent = new Map(); // защита от двойной отправки одного события

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cfg = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...j, events: { ...DEFAULTS.events, ...(j.events || {}) } };
  } catch (e) { /* файла ещё нет */ }
}
function save() { try { fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 }); } catch (e) { console.warn('[Discord] не удалось сохранить:', e.message); } }

const hint = (s) => (s ? '…' + String(s).slice(-4) : '');
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
function fmtDur(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; }
function render(tpl, v) { return String(tpl || '').replace(/\{(title|game|channel|url)\}/g, (m, k) => v[k] == null ? '' : v[k]); }

// ---------- сеть ----------
async function http(url, opt, ms) {
  const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(ms || 12000) });
  let j = null; const t = await r.text(); try { j = t ? JSON.parse(t) : null; } catch (e) { /* не json */ }
  return { ok: r.ok, status: r.status, json: j, retry: r.headers.get('retry-after') };
}
function netErr(e) {
  const m = (e && e.cause && e.cause.code) || (e && e.name) || '';
  if (/Timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR|fetch failed/i.test(m + (e && e.message))) return 'Не удалось связаться с Discord. Проверь интернет, VPN или DNS.';
  return e.message || String(e);
}
const hookOk = () => WEBHOOK_RE.test(cfg.webhookUrl);

function mentionPart() {
  const m = cfg.mention;
  if (m === 'here') return { text: '@here ', allowed: { parse: ['everyone'] } };
  if (m === 'everyone') return { text: '@everyone ', allowed: { parse: ['everyone'] } };
  if (/^\d{5,25}$/.test(m)) return { text: `<@&${m}> `, allowed: { roles: [m] } };
  return { text: '', allowed: { parse: [] } };
}

/** Отправка в вебхук. opts: {content, embeds, mention:true}. Возвращает true/бросает ошибку с понятным текстом. */
async function hook(opts) {
  if (!hookOk()) throw new Error('Вставь ссылку вебхука: «Настройки канала → Интеграции → Вебхуки → Копировать URL».');
  const mp = opts.mention ? mentionPart() : { text: '', allowed: { parse: [] } };
  const body = { content: clip(mp.text + (opts.content || ''), 1900), embeds: opts.embeds || [], allowed_mentions: mp.allowed };
  if (cfg.username) body.username = clip(cfg.username, 80);
  for (let k = 0; k < 2; k++) {
    let r;
    try { r = await http(cfg.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { cfg.lastError = netErr(e); save(); throw new Error(cfg.lastError); }
    if (r.status === 429 && k === 0) { await new Promise((s) => setTimeout(s, Math.min(8000, (Number(r.retry) || 1) * 1000))); continue; }
    if (!r.ok) {
      cfg.lastError = r.status === 404 ? 'Вебхук не найден: его удалили. Создай новый.' : r.status === 401 ? 'Вебхук недействителен.' : 'Discord ответил ошибкой ' + r.status + ((r.json && r.json.message) ? ': ' + r.json.message : '');
      save(); throw new Error(cfg.lastError);
    }
    cfg.lastSentAt = Date.now(); cfg.lastError = ''; save();
    return true;
  }
  throw new Error('Discord просит подождать, попробуй через минуту.');
}
const safe = (p) => p.catch((e) => console.warn('[Discord]', e.message));
const on = () => cfg.enabled && hookOk();
function once(key) { const n = Date.now(); for (const [k, t] of recent) if (n - t > 8000) recent.delete(k); if (recent.has(key)) return false; recent.set(key, n); return true; }

// ---------- вебхук: анонс и события ----------
function twitchUrl(login) { return 'https://twitch.tv/' + (login || ext.channel() || ''); }

async function announce(force) {
  const d = await ext.getInfo({});
  const info = d && d.info, channel = (d && d.channel) || ext.channel();
  const v = { channel, title: info ? info.title : 'Стрим начался', game: info ? info.game_name : '', url: twitchUrl(channel) };
  const emb = { color: COLOR, title: clip(v.title || channel, 250), url: v.url, footer: { text: 'Overdeck' }, timestamp: new Date().toISOString() };
  if (v.game) emb.fields = [{ name: 'Категория', value: clip(v.game, 100), inline: true }];
  if (d && d.gameArt && /^https:/.test(d.gameArt)) emb.thumbnail = { url: d.gameArt };
  try { await hook({ content: render(cfg.template, v) + '\n' + v.url, embeds: [emb], mention: true }); }
  catch (e) { notifyUi.emit('dc.fail', { reason: e.message }); throw e; }
  notifyUi.emit('dc.sent', {});
  return { live: !!info };
}

function onStreamStart() {
  startTracking();
  if (!on() || !cfg.announce) return;
  if (Date.now() - lastAnnounceAt < COOLDOWN_MS) return;
  lastAnnounceAt = Date.now();
  safe(announce());
}

function startTracking() {
  live = { startedAt: Date.now(), title: '', games: [], peak: 0, follows: 0, subs: 0, donations: 0, donRub: 0, login: ext.channel() };
  clearInterval(liveTimer);
  const tick = async () => {
    try { const d = await ext.getInfo({ light: true }); if (d && d.info && live) { live.peak = Math.max(live.peak, Number(d.info.viewer_count) || 0); live.title = d.info.title || live.title; const g = d.info.game_name; if (g && (!live.games.length || live.games[live.games.length - 1] !== g)) live.games.push(g); } } catch (e) { /* сеть моргнула */ }
  };
  tick(); liveTimer = setInterval(tick, 60000); if (liveTimer.unref) liveTimer.unref();
}

function onEvent(kind, data) {
  data = data || {};
  if (live) {
    if (kind === 'follow') live.follows++;
    if (kind === 'sub' && data.type !== 'resub') live.subs += data.type === 'gift' ? (Number(data.count) || 1) : 1;
  }
  if (!on() || !cfg.events[kind]) return;
  const who = clip(data.username || 'Аноним', 60);
  if (!once(kind + ':' + who + ':' + (data.viewers || data.type || ''))) return;
  const emb = { color: COLOR, timestamp: new Date().toISOString() };
  if (kind === 'raid') { emb.title = '⚔️ Рейд!'; emb.description = `**${who}** привёл **${fmtNum(data.viewers)}** зрителей`; }
  else if (kind === 'sub') {
    emb.title = data.type === 'gift' ? '🎁 Подаренные подписки' : data.type === 'resub' ? '⭐ Продление подписки' : '💜 Новая подписка';
    emb.description = data.type === 'gift' ? `**${who}** подарил подписок: **${fmtNum(data.count || 1)}**` : `**${who}**` + (data.type === 'resub' && data.months ? ` · ${fmtNum(data.months)} мес.` : '');
    if (data.message) emb.description += '\n> ' + clip(data.message, 300).replace(/\n/g, ' ');
  } else if (kind === 'follow') { emb.title = '👋 Новый фолловер'; emb.description = `**${who}**`; }
  else return;
  safe(hook({ embeds: [emb] }));
}

function onDonation(rec, rub) {
  rec = rec || {};
  const r = Number(rub) || 0;
  if (live) { live.donations++; live.donRub += r; }
  if (!on() || !cfg.events.donation) return;
  if (r < (Number(cfg.minDonation) || 0)) return;
  const who = clip(rec.username || 'Аноним', 60);
  if (!once('don:' + who + ':' + rec.amount + ':' + (rec.id || ''))) return;
  const emb = { color: COLOR, title: '💸 Донат', description: `**${who}** · **${fmtNum(rec.amount)} ${clip(rec.currency || '₽', 6)}**`, timestamp: new Date().toISOString() };
  if (rec.message) emb.description += '\n> ' + clip(rec.message, 400).replace(/\n/g, ' ');
  safe(hook({ embeds: [emb] }));
}

function summaryEmbed(L) {
  const lines = [];
  if (L.title) lines.push(`**${clip(L.title, 200)}**`);
  const f = [{ name: 'Длительность', value: fmtDur(Date.now() - L.startedAt), inline: true }];
  if (L.peak) f.push({ name: 'Пик зрителей', value: fmtNum(L.peak), inline: true });
  if (L.games.length) f.push({ name: 'Категории', value: clip(L.games.join(' → '), 300), inline: false });
  const ev = [];
  if (L.follows) ev.push(`+${fmtNum(L.follows)} фолловеров`);
  if (L.subs) ev.push(`подписок: ${fmtNum(L.subs)}`);
  if (L.donations) ev.push(`донатов: ${fmtNum(L.donations)}${L.donRub ? ` на ${fmtNum(L.donRub)} ₽` : ''}`);
  if (ev.length) f.push({ name: 'Сообщество', value: ev.join(' · '), inline: false });
  return { color: COLOR, title: '⚫ Стрим закончился', description: lines.join('\n') || undefined, fields: f, footer: { text: 'Overdeck' }, timestamp: new Date().toISOString() };
}
function onStreamEnd() {
  const L = live; live = null; clearInterval(liveTimer); liveTimer = null;
  if (L && on() && cfg.events.end && Date.now() - L.startedAt > 60000) safe(hook({ embeds: [summaryEmbed(L)] }));
}

// ---------- бот: слэш-команды через gateway ----------
let ws = null, hb = null, seq = null, botState = { status: 'off', name: '', appId: '', error: '' }, retryT = null, stopping = false, registered = false;

function botHeaders() { return { 'Content-Type': 'application/json', Authorization: 'Bot ' + cfg.botToken }; }
const COMMANDS = [
  { name: 'status', description: 'Идёт ли стрим, что за игра и сколько зрителей', name_localizations: { ru: 'статус' } },
  { name: 'donors', description: 'Топ донатеров за всё время', name_localizations: { ru: 'донатеры' } },
  { name: 'points', description: 'Топ зрителей по баллам канала', name_localizations: { ru: 'баллы' } },
];
async function registerCommands(appId) {
  const url = cfg.guildId && /^\d{5,25}$/.test(cfg.guildId) ? `${API}/applications/${appId}/guilds/${cfg.guildId}/commands` : `${API}/applications/${appId}/commands`;
  const r = await http(url, { method: 'PUT', headers: botHeaders(), body: JSON.stringify(COMMANDS) });
  if (!r.ok) throw new Error('Не удалось зарегистрировать команды: ' + (r.json && r.json.message || r.status));
}
async function respond(it, data) {
  try { await http(`${API}/interactions/${it.id}/${it.token}/callback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 4, data }) }); }
  catch (e) { console.warn('[Discord бот] не удалось ответить:', e.message); }
}
async function answer(it) {
  const name = it.data && it.data.name;
  const e = { color: COLOR, footer: { text: 'Overdeck' } };
  if (name === 'status') {
    let d = null; try { d = await Promise.race([ext.getInfo({ light: true }), new Promise((r) => setTimeout(() => r(null), 2200))]); } catch (er) { /* нет данных */ }
    const info = d && d.info, ch = (d && d.channel) || ext.channel();
    e.title = info ? '🔴 В эфире' : '⚫ Сейчас не в эфире';
    e.url = twitchUrl(ch);
    e.description = info ? `**${clip(info.title, 200)}**` : `Загляни позже: ${twitchUrl(ch)}`;
    if (info) e.fields = [{ name: 'Категория', value: clip(info.game_name || '—', 100), inline: true }, { name: 'Зрители', value: fmtNum(info.viewer_count), inline: true }];
  } else if (name === 'donors' || name === 'points') {
    const list = (name === 'donors' ? ext.getTopDonors(10) : ext.getTopPoints(10)) || [];
    e.title = name === 'donors' ? '💸 Топ донатеров' : '⭐ Топ по баллам';
    e.description = list.length ? list.map((x, i) => `${['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`} ${clip(x.username, 40).replace(/[*_`~|>]/g, '')} · ${fmtNum(x.amount)}`).join('\n') : 'Пока пусто.';
  } else { e.description = 'Неизвестная команда.'; }
  await respond(it, { embeds: [e], allowed_mentions: { parse: [] } });
}

function botStop() {
  stopping = true; clearTimeout(retryT); clearInterval(hb); hb = null; registered = false;
  if (ws) { try { ws.removeAllListeners(); ws.on('error', () => {}); ws.close(1000); } catch (e) { /* уже закрыт */ } ws = null; }
  botState.status = 'off';
}
function botStart() {
  botStop();
  if (!cfg.botEnabled || !cfg.botToken) return;
  stopping = false; seq = null; botState = { ...botState, status: 'connecting', error: '' };
  let sock;
  try { sock = new WebSocket(GATEWAY); } catch (e) { botState.error = netErr(e); botState.status = 'error'; return; }
  ws = sock;
  const send = (o) => { try { if (sock.readyState === 1) sock.send(JSON.stringify(o)); } catch (e) { /* закрыт */ } };
  sock.on('message', async (buf) => {
    let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
    if (m.s != null) seq = m.s;
    if (m.op === 10) {
      clearInterval(hb); hb = setInterval(() => send({ op: 1, d: seq }), m.d.heartbeat_interval); if (hb.unref) hb.unref();
      send({ op: 2, d: { token: cfg.botToken, intents: 0, properties: { os: process.platform, browser: 'overdeck', device: 'overdeck' } } });
    } else if (m.op === 7 || m.op === 9) { try { sock.close(4000); } catch (e) { /* переподключимся */ } }
    else if (m.op === 0 && m.t === 'READY') {
      botState = { status: 'online', name: (m.d.user && m.d.user.username) || '', appId: (m.d.application && m.d.application.id) || '', error: '' };
      if (!registered) { registered = true; try { await registerCommands(botState.appId); } catch (e) { botState.error = e.message; } }
    } else if (m.op === 0 && m.t === 'INTERACTION_CREATE' && m.d && m.d.type === 2) { safe(answer(m.d)); }
  });
  sock.on('close', (code) => {
    clearInterval(hb); hb = null;
    if (stopping || ws !== sock) return;
    if (code === 4004) { botState.status = 'error'; botState.error = 'Discord не принял токен бота. Скопируй его заново (вкладка Bot → Reset Token).'; cfg.botEnabled = false; save(); return; }
    botState.status = 'connecting';
    retryT = setTimeout(botStart, 8000); if (retryT.unref) retryT.unref();
  });
  sock.on('error', (e) => { botState.error = netErr(e); });
}

// ---------- API для админки ----------
function publicState() {
  return {
    enabled: cfg.enabled, hasWebhook: hookOk(), webhookHint: hookOk() ? hint(cfg.webhookUrl) : '', username: cfg.username,
    announce: cfg.announce, mention: cfg.mention, template: cfg.template, defaultTemplate: DEFAULTS.template, events: { ...cfg.events },
    minDonation: cfg.minDonation, botEnabled: cfg.botEnabled, hasToken: !!cfg.botToken, tokenHint: hint(cfg.botToken), guildId: cfg.guildId,
    bot: { status: botState.status, name: botState.name, error: botState.error }, lastSentAt: cfg.lastSentAt, lastError: cfg.lastError,
  };
}
function update(b) {
  b = b || {};
  if (typeof b.webhookUrl === 'string' && b.webhookUrl.trim()) {
    const u = b.webhookUrl.trim();
    if (!WEBHOOK_RE.test(u)) throw new Error('Это не похоже на ссылку вебхука Discord. Она начинается с https://discord.com/api/webhooks/…');
    cfg.webhookUrl = u;
  }
  if (b.clearWebhook) { cfg.webhookUrl = ''; cfg.enabled = false; }
  if (typeof b.enabled === 'boolean') cfg.enabled = b.enabled;
  if (typeof b.announce === 'boolean') cfg.announce = b.announce;
  if (typeof b.username === 'string') cfg.username = clip(b.username.trim(), 80);
  if (typeof b.mention === 'string') cfg.mention = (/^(none|here|everyone)$/.test(b.mention) || /^\d{5,25}$/.test(b.mention)) ? b.mention : 'none';
  if (typeof b.template === 'string') cfg.template = clip(b.template, 1000) || DEFAULTS.template;
  if (b.events && typeof b.events === 'object') for (const k of Object.keys(DEFAULTS.events)) if (typeof b.events[k] === 'boolean') cfg.events[k] = b.events[k];
  if (b.minDonation != null) cfg.minDonation = Math.max(0, Math.min(1e7, Number(b.minDonation) || 0));
  let botChanged = false;
  if (typeof b.botToken === 'string' && b.botToken.trim()) { cfg.botToken = b.botToken.trim(); botChanged = true; }
  if (b.clearToken) { cfg.botToken = ''; cfg.botEnabled = false; botChanged = true; }
  if (typeof b.guildId === 'string') { const g = b.guildId.trim(); if (g && !/^\d{5,25}$/.test(g)) throw new Error('ID сервера — только цифры.'); if (g !== cfg.guildId) { cfg.guildId = g; botChanged = true; registered = false; } }
  if (typeof b.botEnabled === 'boolean' && b.botEnabled !== cfg.botEnabled) { cfg.botEnabled = b.botEnabled; botChanged = true; }
  save();
  if (botChanged) { if (cfg.botEnabled && cfg.botToken) botStart(); else botStop(); }
  return publicState();
}

async function test() {
  if (!hookOk()) throw new Error('Сначала вставь ссылку вебхука.');
  const r = await announce(true);
  return r;
}
async function testEnd() {
  const L = { startedAt: Date.now() - 95 * 60000, title: 'Пример итога стрима', games: ['Resident Evil 4'], peak: 128, follows: 12, subs: 3, donations: 2, donRub: 800 };
  await hook({ embeds: [summaryEmbed(L)] });
  return { ok: true };
}
async function check() {
  if (!cfg.botToken) throw new Error('Вставь токен бота.');
  let r;
  try { r = await http(API + '/oauth2/applications/@me', { headers: botHeaders() }); } catch (e) { throw new Error(netErr(e)); }
  if (r.status === 401) throw new Error('Discord не принял токен. Скопируй его заново: вкладка Bot → Reset Token.');
  if (!r.ok || !r.json) throw new Error('Discord ответил ошибкой ' + r.status);
  const id = r.json.id;
  return { name: r.json.name, inviteUrl: `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=2048` };
}

function init(extra) { ext = { ...ext, ...extra }; load(); if (cfg.botEnabled && cfg.botToken) botStart(); }

module.exports = { init, onStreamStart, onStreamEnd, onEvent, onDonation, publicState, update, test, testEnd, check, botStop, _summaryEmbed: summaryEmbed, _hookOk: hookOk, _answer: answer, _cfg: () => cfg };
