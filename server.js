// server.js — twitch-overlay-v2
// Связывает воедино: чат Twitch, статистику, таймлайн, категории,
// раздачу оверлея и панели управления.

require('./depsCheck').ensure(); // автоустановка зависимостей, если список в package.json изменился
require('dotenv').config();

// Баннер «STARIKOV» — первое, что видно в консоли при запуске (до остальных сообщений).
require('./banner').print();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const multer = require('multer');
const { WebSocketServer } = require('ws');

const twitch = require('./twitch');
const stats = require('./stats');
const timeline = require('./timeline');
const categories = require('./categories');
const eventsub = require('./eventsub');
const widgets = require('./widgets');
const widgetsPersistence = require('./widgetsPersistence');
const tts = require('./tts');
const thirdPartyEmotes = require('./thirdPartyEmotes');
const customFonts = require('./fonts');
const donations = require('./donations');
const donationCredentials = require('./donationCredentials');
const authCredentials = require('./authCredentials');
const helpTexts = require('./helpTexts');
const tabLock = require('./lock');
const themes = require('./themes');
const teamData = require('./teamData');
const teamPresets = require('./teamPresets');
const mvpData = require('./mvpData');
const chronicles = require('./chronicles');
const factData = require('./factData');
const factPresets = require('./factPresets');
const fundData = require('./fundData');
const fundAlertData = require('./fundAlertData');
const fundBoxData = require('./fundBoxData');
const goalData = require('./goalData');
const timerData = require('./timerData');
const eventCover = require('./eventCover');
const chatRoles = require('./chatRoles').createTracker();
const pixelHeroesModule = require('./pixelHeroes');
const twitchExtensionModule = require('./extension');
const awardsModule = require('./awards');
// isLive: идёт ли стрим (для опыта чаттеров). Пока статус неизвестен — нет входа в Twitch, чтобы его спрашивать — считаем, что идёт: иначе опыт не копился бы вовсе.
const pixelHeroes = pixelHeroesModule.createState(undefined, { file: pixelHeroesModule.SETTINGS_FILE, profilesFile: pixelHeroesModule.PROFILES_FILE, isLive: () => streamIsLive || !twitch.hasCredentials(config) });
// Расширение Twitch (кнопка сбоку плеера): шлёт в Twitch снимок сцены и топа. Подробнее — extension.js и README §99.
const awards = awardsModule.createAwards({ recentLogins: (ms) => pixelHeroes.recentLogins(ms), hasProfile: (l) => pixelHeroes.hasProfile(l) });
const twitchExt = twitchExtensionModule.createExtension({ pixelHeroes, awards, getChooseCommand: () => { try { const c = avatarCommands.getState().commands.find((x) => x.action === 'choose' && x.enabled); return c && c.names[0] ? c.names[0] : ''; } catch (e) { return ''; } }, getOwnerId: () => (config.twitchAuth && config.twitchAuth.userId) || '', isLive: () => streamIsLive });
const predictions = require('./predictions');
const polls = require('./polls');
const eventTheme = require('./eventTheme');
const overlayStyle = require('./overlayStyle');
const fakeStream = require('./fakeStream');
const currency = require('./currency');
const backgroundData = require('./backgroundData');
const bracketData = require('./bracketData');
const adminThemes = require('./adminThemes');
const chatBot = require('./chatBot');
const botCommands = require('./botCommands');
const { createAvatarCommands } = require('./avatarCommands');
const botTimers = require('./botTimers');
const autoMod = require('./autoMod');
const donorLeaderboard = require('./donorLeaderboard');
const donateX = require('./donatex');
const donatePay = require('./donatepay');
const externalChat = require('./externalChat');
const donationAlerts = require('./donationAlerts');

// config.json — личный файл пользователя (имя канала, вход через Twitch, настройки), в архивы проекта он НЕ кладётся, чтобы обновление не затирало
// данные. При самом первом запуске файла ещё нет — создаём его из config.example.json (дальше сработает обычная подсказка «укажи имя канала»).
const CONFIG_FILE = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_FILE)) {
  const exampleFile = path.join(__dirname, 'config.example.json');
  if (fs.existsSync(exampleFile)) {
    fs.copyFileSync(exampleFile, CONFIG_FILE);
    console.log('[Старт] config.json не найден — создан из config.example.json.');
  }
}
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
// заглушки из config.example.json («ВСТАВЬ_…») — это подсказки, а не значения
if (config.twitch) ['clientId', 'clientSecret'].forEach((k) => { if (/^ВСТАВЬ/.test(String(config.twitch[k] || ''))) config.twitch[k] = ''; });

// Пустое приложение (канал не задан): сервер всё равно стартует, чтобы в админке можно было открыть файл авторизации (⚙ → «Ключ авторизации»).
const SETUP_MODE = !config.channel || config.channel === 'ВСТАВЬ_СВОЙ_КАНАЛ';
if (SETUP_MODE) {
  console.warn('\n[Старт] Канал ещё не задан — открой админку → ⚙ → «Ключ авторизации» и загрузи файл авторизации (или впиши имя канала там же).\n');
}

// Если Client ID/Secret заданы через .env — они имеют приоритет над config.json
// и в админке не редактируются (поля скрываются).
const CREDENTIALS_FROM_ENV = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
if (CREDENTIALS_FROM_ENV) {
  config.twitch = config.twitch || {};
  config.twitch.clientId = process.env.TWITCH_CLIENT_ID;
  config.twitch.clientSecret = process.env.TWITCH_CLIENT_SECRET;
}

if (config.twitchAuth === undefined) config.twitchAuth = null;
let oauthState = null;
let donationAlertsOauthState = null;

// ---------- Учётные данные интеграций с опциональным "Запомнить" (свой файл auth_credentials.json) ----------
// Присутствие непустого значения в этом файле и есть признак "запомнено" — отдельного флага нет.
// Если галочка выключена, значения живут только в памяти на время текущего запуска сервера.

const authCredentialsFileExisted = fs.existsSync(authCredentials.FILE_PATH);
authCredentials.init();

if (!CREDENTIALS_FROM_ENV) {
  if (authCredentialsFileExisted) {
    // файл уже был раньше — он источник правды для того, что реально "запомнено"
    const savedTwitch = authCredentials.get().twitch;
    config.twitch.clientId = savedTwitch.clientId || '';
    config.twitch.clientSecret = savedTwitch.clientSecret || '';
  } else if (config.twitch.clientId || config.twitch.clientSecret) {
    // миграция: раньше Client ID/Secret всегда сохранялись в config.json — переносим
    // один раз в новый файл, считая, что раз они там были, значит "запомнены"
    authCredentials.setRemembered('twitch', true, {
      clientId: config.twitch.clientId || '',
      clientSecret: config.twitch.clientSecret || '',
    });
  }
}

// Общее приложение Overdeck (публичное, без секрета): если своих ключей нет — работаем через него, вход по коду.
const overdeckApp = require('./overdeckApp');
const PUBLIC_CLIENT_ID = overdeckApp.twitchClientId();
if (PUBLIC_CLIENT_ID && !CREDENTIALS_FROM_ENV && !config.twitch.clientId && !config.twitch.clientSecret) config.twitch.clientId = PUBLIC_CLIENT_ID;
const usingPublicApp = () => !!PUBLIC_CLIENT_ID && config.twitch.clientId === PUBLIC_CLIENT_ID && !config.twitch.clientSecret;

const TOP_CHATTERS_COUNT = config.topChattersCount || 10;
const WORD_CLOUD_SIZE = config.wordCloudSize || 50;
const statsPath = path.join(__dirname, config.statsFile || 'stats.json');
const configPath = path.join(__dirname, 'config.json');

function saveConfigToDisk() {
  // Client ID/Secret Twitch больше не хранятся в config.json — только в auth_credentials.json,
  // и только если включено "Запомнить" (см. authCredentials.js). Здесь всегда пишем пусто,
  // независимо от того, что сейчас в памяти, чтобы не тянуть их обратно на диск случайно.
  const toWrite = { ...config, twitch: { ...config.twitch, clientId: '', clientSecret: '' } };
  fs.writeFile(configPath, JSON.stringify(toWrite, null, 2), (err) => {
    if (err) console.error('Ошибка сохранения config.json:', err);
  });
}

function getCallbackUrl() {
  return `http://localhost:${config.port || 3001}/auth/twitch/callback`;
}

function getDonationAlertsCallbackUrl() {
  return `http://localhost:${config.port || 3001}/auth/donationalerts/callback`;
}

function maskClientId(id) {
  if (!id) return '';
  if (id.length <= 8) return id[0] + '••••';
  return id.slice(0, 4) + '••••' + id.slice(-4);
}

// ---------- Тема оверлея (цвета/шрифты/размеры) ----------

const DEFAULT_THEME = {
  accent: '#B14846',
  textMain: '#E0E0E0',
  bgPanelRGB: [20, 20, 25],
  bgPanelAlpha: 0.55,
  fontMain: 'Unbounded',
  fontText: 'Inter',
  fontSizeMain: 16,
  fontSizeText: 14,
  // Структурные параметры, которыми могут управлять темы (см. themes.js) —
  // значения по умолчанию ничего не меняют в текущем виде оверлея.
  borderRadius: 16,
  glassEffect: false,
  showHeaderIcon: false,
};

if (!config.theme) {
  config.theme = { ...DEFAULT_THEME };
  saveConfigToDisk();
}
if (!config.selectedTheme) {
  config.selectedTheme = 'default'; // какая тема выбрана в блоке "Темы" — чисто информационно для UI, см. themes.js
}

// ---------- Раскладка виджетов оверлея (позиция/размер/вкл-выкл) — свой файл widgets_layout.json ----------

{
  const loadedLayout = widgetsPersistence.loadLayout() || config.layout; // миграция: раньше лежало в config.json
  if (!loadedLayout) {
    config.layout = widgets.getDefaultLayout();
  } else {
    const { layout } = widgets.fillMissingWidgets(loadedLayout);
    config.layout = layout;
  }
  widgetsPersistence.saveLayoutDebounced(config.layout);
}

/**
 * Разовое переключение на новые значения по умолчанию таймлайна (2026-10): кружки живут 5 минут вместо 10, донат — «денежный» зелёный.
 * Срабатывает один раз (отметка в migrations_done.json) и только для СТАРЫХ значений по умолчанию (10 минут / #3FBF6B),
 * поэтому уже подобранные вручную значения не трогаются. После этого настройки меняются в админке как обычно.
 */
function applyOneTimeTimelineMigration(settings) {
  const file = path.join(__dirname, 'migrations_done.json');
  let done = {};
  try { done = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { done = {}; }
  if (done.timeline2026_10) return;
  const tl = settings && settings.timeline;
  if (tl) {
    if (tl.activityLifetimeMin === 10) tl.activityLifetimeMin = 5;
    if (typeof tl.donationColor === 'string' && tl.donationColor.toUpperCase() === '#3FBF6B') tl.donationColor = '#4FAE5A';
  }
  done.timeline2026_10 = true;
  try { fs.writeFileSync(file, JSON.stringify(done, null, 2)); } catch (e) { console.warn('[Миграция] Не удалось записать migrations_done.json:', e.message); }
}

// ---------- Настройки содержимого виджетов (размер аватарок/ника/полоски и т.п.) — свой файл widgets_settings.json ----------

{
  const loadedSettings = widgetsPersistence.loadSettings() || config.widgetSettings; // миграция из config.json
  if (!loadedSettings) {
    config.widgetSettings = widgets.getDefaultWidgetSettings();
  } else {
    const { settings } = widgets.fillMissingWidgetSettings(loadedSettings);
    config.widgetSettings = settings;
    applyOneTimeTimelineMigration(config.widgetSettings);
  }
  widgetsPersistence.saveSettingsDebounced(config.widgetSettings);
}
currency.setOverrides(config.currencyRates); // свои курсы валют для пересчёта донатов в рубли на таймлайне (необязательно)

// ---------- Алерт доната ----------
const donationAlert = require('./donationAlert');
config.donationAlert = donationAlert.sanitize(config.donationAlert, donationAlert.DEFAULTS);

/** Показывает на оверлее карточку доната (и озвучивает текст). Оверлей сам ставит алерты в очередь. */
function fireDonationAlert(record, force) {
  const s = config.donationAlert;
  if (!s.enabled && !force) return;
  const rub = currency.toRub(record.amount, record.currency).rub;
  if (!force && rub < s.minAmount) return;
  // статистика донатера по истории (тест — без неё, запись уже добавлена в историю)
  let stat = force && s.donorStat !== false ? 'Донат №3 · всего 1 500 ₽' : '';
  let donNo = force ? 3 : 0;
  if (!force && s.donorStat !== false) {
    try {
      const nick = String(record.username || '').toLowerCase();
      const mine = donations.getHistory().filter((d) => String(d.username || '').toLowerCase() === nick);
      const total = mine.reduce((a, d) => a + currency.toRub(d.amount, d.currency).rub, 0);
      donNo = mine.length;
      stat = mine.length <= 1 ? 'Первый донат' : `Донат №${mine.length} · всего ${Math.round(total).toLocaleString('ru-RU')} ₽`;
    } catch (_) { stat = ''; }
  }
  const card = donationAlert.buildCard(record, s, { rub, stat, no: donNo });
  const speech = s.speak ? donationAlert.buildSpeech(record, s) : '';
  deliverAlert(card, speech, s.voice);
}

/** Отправляет готовую карточку на оверлей: озвучивает speech (голос voice или общий из «Озвучки чата»), печать текста синхронизируется с речью. */
function deliverAlert(card, speech, voice) {
  // доля озвучки, которая приходится на «ник задонатил N» — до этого момента текст сообщения ещё не читается
  if (speech && card.message) { const at = speech.lastIndexOf(card.message.replace(/…$/, '')); card.typeLead = at > 0 ? Math.min(0.9, at / speech.length) : 0; }
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  if (!speech) { sendToOverlay({ type: 'donation_alert', id, card }); return; }
  // озвучка в общей очереди; если движка нет — карточка всё равно показывается, просто без голоса
  let sent = false;
  const send = (audio) => { if (sent) return; sent = true; sendToOverlay({ type: 'donation_alert', id, card, audio: audio || null }); };
  tts.enqueue({ text: speech, ttsConfig: voice ? { ...config.tts, voice } : config.tts, onDone: (buf, mime) => send(`data:${mime || 'audio/wav'};base64,` + buf.toString('base64')), onError: () => send(null) });
  setTimeout(() => send(null), 15000); // страховка: движок завис или не ответил
}

// ---------- Алерты событий Twitch (подписки, рейд, фоллоу, Hype Train, награды) ----------
const eventAlerts = require('./eventAlerts');
const subRegistry = require('./subRegistry');
const followRegistry = require('./followRegistry');
config.eventAlerts = eventAlerts.sanitizeAll(config.eventAlerts, null);

/** data — описание события (см. eventAlerts.describe); force — тест: показать даже если событие выключено. */
const WALL_SAMPLE = ['Kotik_Mia', 'ZloyPelmen', 'Toki0FF', 'Maslino44ka', 'NeoSamurai', 'Shadow_Fox', 'Lemonade', 'Vasya_Pro', 'Ledi_Noir', 'Gromov', 'PixelBear', 'Sunny_D', 'Raccoon42', 'Nastya_K', 'Moroz', 'Bublik', 'CyberBabka', 'Orion'];
/** Данные стены для алерта фоллоу: persist — записать фолловера в реестр (реальное событие), иначе только посчитать (тест/предпросмотр). */
function followWallData(login, name, at, persist) {
  let no, total, date;
  if (persist) { const r = followRegistry.add(login, name, at); no = r.no; total = followRegistry.count(); date = followRegistry.dateOf(login); }
  else { total = followRegistry.count() + 1; no = total; date = followRegistry.fmtDate(new Date().toISOString()); }
  let recent = followRegistry.recent(20, login);
  if (!persist && recent.length < 20) { // тест на пустой стене: добиваем примерами, чтобы было видно, как выглядит
    const have = recent.length; total = Math.max(total, 20 + 1); no = total;
    for (let i = 0; recent.length < 20; i++) recent.push({ n: WALL_SAMPLE[i % WALL_SAMPLE.length], d: followRegistry.fmtDate(new Date(Date.now() - (have + i + 1) * 86400000 * 3).toISOString()), no: Math.max(1, total - recent.length - 1) });
  }
  return { no, total, date, recent };
}
function withWall(kind, data, persist) {
  if (kind !== 'follow') return data;
  const d = { ...(data || {}) };
  if (!d.wall) d.wall = followWallData(d.login || d.username, d.username, d.at, persist);
  return d;
}
/** Аватарка Twitch: из кэша или запросом к Helix (login в нижнем регистре); '' если не нашлась. */
async function avatarUrlFor(login) {
  const k = String(login || '').toLowerCase(); if (!k) return '';
  if (avatarCache[k]) return avatarCache[k];
  try { const r = await twitch.fetchAvatars(config, [k]); avatarCache = { ...avatarCache, ...r }; return r[k] || ''; } catch (e) { return ''; }
}
/** Рейд: аватарка рейдера и во что он играл (Helix channels). В тесте — аватарка и категория твоего канала. */
async function raidExtras(data, force) {
  const out = {};
  out.avatar = await avatarUrlFor(force ? config.channel : (data.login || data.username)).catch(() => '');
  if (!data.game) {
    try {
      const bid = force ? await twitch.resolveBroadcasterId(config, config.channel) : data.id;
      const ci = bid ? await twitch.fetchChannelInfo(config, bid) : null;
      if (ci) { out.game = ci.game_name || ''; out.title = ci.title || ''; }
    } catch (e) { /* без игры — строка просто не покажется */ }
  }
  return out;
}
function fireEventAlert(kind, data, force) {
  const cfg = config.eventAlerts[kind];
  if (!cfg) return false;
  if (!force && (kind === 'follow' || kind === 'sub') && !(data && data.type === 'resub')) telegramAnnounce.noteEvent(kind, data); // счётчики для итога стрима в Телеграм
  if (kind === 'raid' && data && data.avatar === undefined && cfg.style !== 'plain') {
    if (!force && !eventAlerts.shouldShow(kind, data, cfg)) return false;
    raidExtras(data, force).then((x) => fireEventAlert(kind, { ...data, ...x }, force)).catch(() => fireEventAlert(kind, { ...data, avatar: '' }, force));
    return true;
  }
  // бейдж фоллоу показывает аватарку: в тесте — твою (канала), в реальном событии — фолловера
  if (kind === 'follow' && cfg.style === 'badge' && data && data.avatar === undefined) {
    avatarUrlFor(force ? config.channel : (data.login || data.username)).then((url) => fireEventAlert(kind, { ...data, avatar: url, channel: config.channel }, force));
    return true;
  }
  if (!force && !eventAlerts.shouldShow(kind, data, cfg)) return false;
  const built = eventAlerts.buildCard(kind, withWall(kind, data, !force), cfg, config.donationAlert);
  if (!built) return false;
  deliverAlert(built.card, cfg.speak ? built.speech : '', cfg.voice || config.donationAlert.voice);
  return true;
}

// ---------- «Сейчас играет»: что играет в браузере/плеере (nowPlaying.js, только Windows) ----------
const nowPlaying = require('./nowPlaying');
let npLast = { sig: '', at: 0, pos: 0, rate: 1, playing: false, sentAt: 0 };
function nowPlayingPayload() {
  const cfg = config.eventAlerts.nowplaying;
  const state = nowPlaying.getState(cfg);
  return { type: 'nowplaying', enabled: !!(cfg.enabled || state.demo), settings: cfg, state };
}
/** Шлёт состояние оверлею, если оно заметно изменилось (время между рассылками оверлей считает сам). force — всем безусловно. */
function broadcastNowPlaying(force) {
  const p = nowPlayingPayload(), s = p.state, c = s.current, now = Date.now();
  const sig = JSON.stringify([p.enabled, s.supported, s.fresh, s.demo, c && [c.key, c.status, c.title, c.artist, c.dur, !!c.cover], s.others.map((o) => [o.key, o.status, o.title]), p.settings]);
  let drift = false;
  if (c && npLast.sig && !force) { const pred = npLast.pos + (npLast.playing ? (now - npLast.sentAt) / 1000 * npLast.rate : 0); drift = Math.abs(pred - c.pos) > 2; }
  if (!force && sig === npLast.sig && !drift && now - npLast.sentAt < 15000) return;
  npLast = { sig, pos: c ? c.pos : 0, rate: c ? c.rate : 1, playing: !!(c && c.playing), sentAt: now };
  const json = JSON.stringify(p);
  overlayClients.forEach((ws) => {
    if (ws.readyState !== ws.OPEN || ws.view === 'preview') return;
    if (!ws.view) return;                                      // основной оверлей алертов не показывает — у каждого вида свой источник
    if (ws.view === 'alerts' && ws.kind && ws.kind !== 'nowplaying') return;
    ws.send(json);
  });
}
function applyNowPlayingConfig() {
  if (config.eventAlerts.nowplaying.enabled) nowPlaying.start(() => broadcastNowPlaying(false)); else nowPlaying.stop();
  broadcastNowPlaying(true);
}
setInterval(() => { try { broadcastNowPlaying(false); } catch (e) { /* не мешаем оверлею */ } }, 1000);
process.on('exit', () => { try { nowPlaying.stop(); } catch (e) { /* уже закрываемся */ } });
let hypeLevel = 0;
/** Сырое уведомление EventSub → алерт события. */
function handleEventAlertRaw(type, e) {
  e = e || {};
  switch (type) {
    case 'channel.subscribe':
      if (e.is_gift) return;                       // подарочная подписка приходит отдельно как channel.subscription.gift
      fireEventAlert('sub', { type: 'new', username: e.user_name, tier: e.tier, no: subRegistry.assign(e.user_login || e.user_name, config.eventAlerts.sub.numberStart) }); break;
    case 'channel.subscription.message':
      fireEventAlert('sub', { type: 'resub', username: e.user_name, tier: e.tier, months: e.cumulative_months, streak: e.streak_months, message: e.message && e.message.text, no: subRegistry.assign(e.user_login || e.user_name, config.eventAlerts.sub.numberStart) }); break;
    case 'channel.subscription.gift':
      fireEventAlert('sub', { type: 'gift', username: e.is_anonymous ? 'Аноним' : e.user_name, anonymous: !!e.is_anonymous, count: e.total, tier: e.tier }); break;
    case 'channel.raid':
      fireEventAlert('raid', { username: e.from_broadcaster_user_name, login: e.from_broadcaster_user_login, id: e.from_broadcaster_user_id, viewers: e.viewers }); break;
    case 'channel.follow':
      fireEventAlert('follow', { username: e.user_name, login: e.user_login, at: e.followed_at }); break;
    case 'channel.hype_train.begin':
      hypeLevel = Number(e.level) || 1;
      fireEventAlert('hype', { phase: 'begin', level: hypeLevel, total: e.total }); break;
    case 'channel.hype_train.progress':
      if ((Number(e.level) || 0) > hypeLevel) { hypeLevel = Number(e.level); fireEventAlert('hype', { phase: 'level', level: hypeLevel, total: e.total }); } break;
    case 'channel.hype_train.end':
      fireEventAlert('hype', { phase: 'end', level: e.level, total: e.total }); hypeLevel = 0; break;
    case 'channel.channel_points_custom_reward_redemption.add':
      fireEventAlert('points', { username: e.user_name, reward: e.reward && e.reward.title, cost: e.reward && e.reward.cost, input: e.user_input }); break;
    default: break;
  }
}

// ---------- Озвучка чата (Piper) ----------

if (!config.tts) {
  config.tts = tts.getDefaultTts();
  saveConfigToDisk();
} else {
  config.tts = tts.sanitizeTts(config.tts, tts.getDefaultTts());
}

if (!config.ttsEngine) {
  config.ttsEngine = { piperPath: 'piper', voicesDir: './voices' };
  saveConfigToDisk();
}
tts.configurePaths(config.ttsEngine);

// ---------- Токен стримера: автообновление (оба режима; у публичного приложения — без секрета) ----------
let userTokenRefreshing = null;
async function ensureUserToken(force) {
  const a = config.twitchAuth;
  if (!a || !a.accessToken) return null;
  const soon = !a.expiresAt || a.expiresAt - Date.now() < 10 * 60 * 1000;
  if (!force && !soon) return a.accessToken;
  if (!a.refreshToken) return a.expiresAt && a.expiresAt > Date.now() ? a.accessToken : (a.expiresAt ? null : a.accessToken);
  if (userTokenRefreshing) return userTokenRefreshing;
  userTokenRefreshing = (async () => {
    const r = await twitch.refreshUserToken(config.twitch.clientId, config.twitch.clientSecret || '', a.refreshToken);
    if (r.data && r.data.access_token) {
      a.accessToken = r.data.access_token;
      if (r.data.refresh_token) a.refreshToken = r.data.refresh_token;
      a.expiresAt = Date.now() + (r.data.expires_in || 3600) * 1000;
      saveConfigToDisk();
      return a.accessToken;
    }
    console.warn('[Twitch] Не удалось обновить токен входа:', (r.data && r.data.message) || r.status, '— нужно войти через Twitch ещё раз.');
    if (r.status === 400 || r.status === 401) { twitchAuthState = { connected: false, validatedAt: null, error: 'Вход через Twitch устарел — войди ещё раз.' }; broadcastAdminStatus(); }
    return null;
  })();
  try { return await userTokenRefreshing; } finally { userTokenRefreshing = null; }
}
twitch.setUserTokenProvider(() => ensureUserToken());
setInterval(() => { if (config.twitchAuth && config.twitchAuth.refreshToken) ensureUserToken(); }, 5 * 60 * 1000);

// ---------- Авторизация Twitch: состояние + проверка при старте ----------

let twitchAuthState = { connected: false, validatedAt: null, error: null };

async function validateStoredCredentials() {
  await null; // рассылка статуса — только после того, как сервер целиком инициализирован
  if (usingPublicApp()) {
    const tok = config.twitchAuth ? await ensureUserToken() : null;
    twitchAuthState = tok ? { connected: true, validatedAt: Date.now(), error: null } : { connected: false, validatedAt: null, error: config.twitchAuth ? 'Вход через Twitch устарел — войди по коду ещё раз.' : null };
    broadcastAdminStatus();
    return;
  }
  if (!twitch.hasCredentials(config)) {
    twitchAuthState = { connected: false, validatedAt: null, error: null };
    return;
  }
  const result = await twitch.validateCredentials(config.twitch.clientId, config.twitch.clientSecret);
  twitchAuthState = result.valid
    ? { connected: true, validatedAt: Date.now(), error: null }
    : { connected: false, validatedAt: null, error: result.error };
  broadcastAdminStatus();
}
validateStoredCredentials();

// Если позже Twitch перестал принимать ключи приложения канала (секрет пересоздан и т.п.), показываем это в админке: пилюля «Twitch» гаснет,
// причина видна на вкладке «Подключения». Когда токен снова получается — статус возвращается. twitchAuthState только отображается.
twitch.setAppTokenListener((event) => {
  twitchAuthState = event.ok
    ? { connected: true, validatedAt: Date.now(), error: null }
    : { connected: false, validatedAt: null, error: event.message };
  broadcastAdminStatus();
});

// ---------- Загрузка сохранённого состояния ----------

let saved = null;
if (fs.existsSync(statsPath)) {
  try {
    saved = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  } catch (e) {
    console.warn('Не удалось прочитать stats.json, начинаю с нуля.');
  }
}

stats.init(saved);
timeline.init(config, saved ? saved.timeline : null);
categories.init(saved ? saved.categories : null);

function saveStats() {
  const toSave = {
    ...stats.getPersistData(),
    timeline: timeline.getPersistData(),
    categories: categories.getPersistData(),
    savedAt: Date.now(),
  };
  fs.writeFile(statsPath, JSON.stringify(toSave, null, 2), (err) => {
    if (err) console.error('Ошибка сохранения статистики:', err);
  });
}
setInterval(saveStats, config.saveIntervalMs || 15000);
process.on('SIGINT', () => { saveStats(); process.exit(0); });

// ---------- Аватарки (кэш только в памяти) ----------

let avatarCache = {};
let avatarQueue = new Set();

async function fetchQueuedAvatars() {
  if (avatarQueue.size === 0) return;
  const usernames = Array.from(avatarQueue);
  avatarQueue.clear();
  const result = await twitch.fetchAvatars(config, usernames);
  avatarCache = { ...avatarCache, ...result };
}
setInterval(fetchQueuedAvatars, 5000);

function queueAvatarsFor(usernames) {
  usernames.forEach((u) => {
    if (!avatarCache[u.toLowerCase()]) avatarQueue.add(u.toLowerCase());
  });
}

// ---------- Взвешенные события таймлайна (сообщения/эмодзи/баллы/сабы/рейды/категория) ----------

/** Сколько миллисекунд кружок активности живёт на таймлайне (настройка «Сколько минут кружок виден»). */
function timelineLifetimeMs() {
  const w = (config.widgetSettings && config.widgetSettings.timeline) || {};
  const min = Number(w.activityLifetimeMin);
  return (Number.isFinite(min) && min > 0 ? min : 5) * 60 * 1000;
}

const eventFeed = require('./eventFeed').createFeed();
function handleTimelineWeightedEvent(evt) {
  if (evt && evt.type === 'participation') { // участие в голосовании (ставка закончилась): опыт участникам, на таймлайн это не влияет
    let changed = false;
    (Array.isArray(evt.users) ? evt.users : []).forEach((u) => { awards.noteActivity(u.login); if (pixelHeroes.onParticipation({ login: u.login, name: u.name }).changed) changed = true; });
    if (changed) broadcastPixelHeroes();
    return;
  }
  if (evt && evt.type === 'channelpoints') unlockAvatarForReward(evt);   // награда за баллы «Разблокировать аватар» открывает зрителю случайный закрытый аватар
  if (evt && evt.type === 'raid') chatRoles.noteRaid(); // открывает окно, в котором первые сообщения новых людей считаются рейдерскими
  timeline.addEvent({ ...evt, weight: timelineWeightFor(evt.type) });
  eventFeed.add(evt);
  dirty = true;
}

/** Вес события типа type на линии активности — по текущим настройкам «Веса событий» виджета «Таймлайн» (общий для живых событий и фейк-режима). */
function timelineWeightFor(type) {
  const w = (config.widgetSettings && config.widgetSettings.timeline) || {};
  const weightByType = {
    message: w.weightMessage,
    emote: w.weightMessage,
    channelpoints: w.weightPoints,
    sub: w.weightSub,
    giftsub: w.weightSub,
    raid: w.weightRaid,
    category: w.weightCategory,
    donation: w.weightDonation,
    watchstreak: w.weightStreak,
  };
  return typeof weightByType[type] === 'number' ? weightByType[type] : 1;
}

// ---------- Категории + статус трансляции (онлайн/офлайн): периодический опрос ----------

let streamIsLive = false;
let streamStatusKnown = false; // первый опрос после запуска сервера только узнаёт статус: данные идущего стрима не стираем

async function pollCategoryOnce() {
  if (SETUP_MODE) return;
  const { changed, entry } = await categories.poll(config, config.channel);
  if (changed && entry) {
    if (streamIsLive) telegramAnnounce.onCategoryChange();
    handleTimelineWeightedEvent({ type: 'category', meta: { name: entry.name } });
  }
  if (resolvedBroadcasterId && twitch.hasCredentials(config)) {
    const wasLive = streamIsLive;
    streamIsLive = await twitch.fetchStreamStatus(config, resolvedBroadcasterId);
    pixelHeroes.noteLive(streamIsLive); // идёт стрим — трансляция для опыта чаттеров продолжается (или начинается новая)
    if (streamIsLive && fakeStream.isActive()) { fakeStream.stop(); broadcast(); console.log('[Фейк-режим] Начался настоящий стрим — фейк-режим выключен.'); } // фейк-данные не должны попасть в эфир
    if (streamIsLive && !wasLive && config.autoRecord && !replayActive) { if (streamStatusKnown) resetStreamSession('автозапись при начале стрима'); else startNewRecording('автозапись при запуске во время стрима'); } // стрим только что начался — история для воспроизведения пишется заново
    if (streamIsLive && !wasLive && streamStatusKnown) telegramAnnounce.onStreamStart();
    if (!streamIsLive && wasLive) telegramAnnounce.onStreamEnd(); // сервер, запущенный посреди стрима, повторно не анонсирует
    telegramAnnounce.noteLive(streamIsLive);
    streamStatusKnown = true;
    if (streamIsLive !== wasLive) broadcastAdminStatus(); // статус в шапке админки обновится сразу, не дожидаясь следующего периодического тика
  }
}
setInterval(pollCategoryOnce, (config.categoryPollSec || 60) * 1000);
pollCategoryOnce();

// ---------- Настройки отображения чата ----------

const DEFAULT_CHAT_SETTINGS = {
  showBadges: true, showAvatars: true, showThirdPartyEmotes: true,
  animateMessages: true,        // новое сообщение появляется маленьким и плавно вырастает до обычного размера
  hideLinks: false,             // ссылки в тексте не показываются (сообщение, где была только ссылка, не показывается совсем)
  highlightMods: false, highlightVips: false, highlightNewChatters: false, highlightRaiders: false, // подсветка сообщений по ролям автора
  platformTagStyle: 'outline',  // вид метки платформы (Kick / YouTube / VK Live) в чате: 'outline' — контур, 'icon' — значок + подпись
};
{
  // Настройки, сохранённые до появления новых полей, дополняем значениями по умолчанию (старые значения не трогаем).
  const merged = { ...DEFAULT_CHAT_SETTINGS, ...(config.chatSettings || {}) };
  if (JSON.stringify(merged) !== JSON.stringify(config.chatSettings)) { config.chatSettings = merged; saveConfigToDisk(); }
}

// ---------- Донатный хаб: подключения платформ (свой файл, не config.json) ----------

donationCredentials.init();

{
  const da = donationCredentials.get().donationAlerts;
  const dx = donationCredentials.get().donateX;
  const dp = donationCredentials.get().donatePay;
  if (authCredentialsFileExisted) {
    const savedDa = authCredentials.get().donationAlerts;
    const savedDx = authCredentials.get().donateX;
    const savedDp = authCredentials.get().donatePay || {};
    dp.apiKey = savedDp.apiKey || null;
    da.clientId = savedDa.clientId || '';
    da.clientSecret = savedDa.clientSecret || '';
    dx.apiToken = savedDx.apiToken || null;
  } else {
    // миграция: то, что уже лежало в donation_credentials.json, считаем "запомненным"
    if (da.clientId || da.clientSecret) {
      authCredentials.setRemembered('donationAlerts', true, { clientId: da.clientId || '', clientSecret: da.clientSecret || '' });
    }
    if (dx.apiToken) {
      authCredentials.setRemembered('donateX', true, { apiToken: dx.apiToken });
    }
  }
}
helpTexts.init();
teamData.init();
teamPresets.init();
mvpData.init();
chronicles.init();
const telegramAnnounce = require('./telegramAnnounce');
telegramAnnounce.init(async (opts) => {
  const info = resolvedBroadcasterId && twitch.hasCredentials(config) ? await twitch.fetchStreamInfo(config, resolvedBroadcasterId) : null;
  const gameArt = !(opts && opts.light) && info && info.game_id ? await twitch.fetchGameArt(config, info.game_id).catch(() => null) : null; // запасная картинка, если скриншот эфира не получится
  return { channel: config.channel, info, gameArt };
}, {
  port: config.port || 3001,
  getTotalMessages: () => stats.getTotalMessages(),
  getTopChatters: (n) => stats.getTopChatters(n),
  chroniclesUrl: () => { try { return chrPublish.status().url || ''; } catch (e) { return ''; } },
  getChronicle: (id) => chronicles.list().find((x) => x.id === id) || null,
  posterFile: (name) => { const f = path.join(chronicles.POSTERS_DIR, path.basename(String(name))); return fs.existsSync(f) ? f : null; },
});
const chrPublish = require('./chrPublish');
chrPublish.init(chronicles);
factData.init();
factPresets.init();
fundData.init();
fundAlertData.init();
fundBoxData.init();
goalData.init();
timerData.init();
eventCover.init();
predictions.init();
eventTheme.init();
overlayStyle.init();
backgroundData.init();
let backgroundRotateTimer = null; // должна быть объявлена ДО первого вызова scheduleBackgroundRotation() ниже — let не поднимается как объявление функции, вызов до этой строки падал с ReferenceError
scheduleBackgroundRotation(); // на случай если автосмена уже была включена до перезапуска сервера
bracketData.init();
adminThemes.init();
botCommands.init(); // команды подгружаются из bot_commands.json при старте
// Команды чат-аватаров (!аватар, !прыжок…) — avatar_commands.json; слова не должны пересекаться с командами бота в обе стороны.
const avatarCommands = createAvatarCommands({ botHas: (name) => !!botCommands.findByToken(name) });
botCommands.setReservedChecker((name) => avatarCommands.hasName(name));
botTimers.init(); // сообщения по таймеру — из bot_timers.json
autoMod.init(); // список автомодерации — из banned_words.json (нет файла — создаётся со списком по умолчанию)
// Автообновление токена бота использует Client ID/Secret приложения из вкладки «Подключения» (те же, что для входа в админку).
chatBot.setAppCredentialsProvider(() => ({ clientId: config.twitch.clientId || '', clientSecret: config.twitch.clientSecret || '' }));
chatBot.setLiveProvider(() => streamIsLive); // нужно только настройке «отправлять сообщения по таймеру, пока идёт стрим»
chatBot.init();

donations.init();
donorLeaderboard.init();

// ---------- Бейджи чата (подписки/VIP/модератор/кастомные) ----------

let badgeMap = new Map(); // "set_id:version_id" -> imageUrl

function indexBadgeSets(sets, map) {
  (sets || []).forEach((set) => {
    (set.versions || []).forEach((v) => {
      map.set(`${set.set_id}:${v.id}`, v.image_url_2x || v.image_url_1x);
    });
  });
}

function getBadgeUrls(tagsBadges) {
  if (!tagsBadges) return [];
  return Object.entries(tagsBadges)
    .map(([set, version]) => badgeMap.get(`${set}:${version}`))
    .filter(Boolean);
}

let resolvedBroadcasterId = null;

async function initBadgesAndThirdPartyEmotes() {
  if (twitch.hasCredentials(config)) {
    resolvedBroadcasterId = await twitch.resolveBroadcasterId(config, config.channel);
    try {
      const [globalBadges, channelBadges] = await Promise.all([
        twitch.fetchGlobalBadges(config),
        resolvedBroadcasterId ? twitch.fetchChannelBadges(config, resolvedBroadcasterId) : Promise.resolve([]),
      ]);
      const map = new Map();
      indexBadgeSets(globalBadges, map);
      indexBadgeSets(channelBadges, map); // канальные бейджи поверх глобальных
      badgeMap = map;
      console.log(`[Чат] Загружено бейджей: ${badgeMap.size}`);
    } catch (e) {
      console.warn('[Чат] Не удалось загрузить бейджи Twitch:', e.message);
    }
  }

  try {
    await thirdPartyEmotes.loadForChannel(resolvedBroadcasterId);
  } catch (e) {
    console.warn('[Эмодзи] Не удалось загрузить сторонние смайлы (7TV/BTTV/FFZ):', e.message);
  }

  attemptEventSubConnect();
}
initBadgesAndThirdPartyEmotes();

// ---------- Донатный хаб: автоподключение при старте, если уже был вход раньше ----------

/** Вызывается donationAlerts.js, когда автопереподключение само остановилось (невалидный токен и т.п.). */
function handleDonationAlertsAuthError(message) {
  console.warn('[DonationAlerts]', message);
  const da = donationCredentials.get().donationAlerts;
  da.connected = false;
  da.socketToken = null;
  donationCredentials.save();
  broadcastAdminStatus();
}

if (donationCredentials.get().donateX.apiToken) {
  donateX.connect(donationCredentials.get().donateX.apiToken, handleDonation).catch((e) => {
    console.warn('[DonateX] Не удалось восстановить подключение при старте сервера:', e.message);
    donationCredentials.get().donateX.connected = false;
    donationCredentials.save();
  });
}

/** Вызывается donatepay.js, если DonatePay перестал принимать ключ (опрос остановлен). */
function handleDonatePayAuthError(message) {
  console.warn('[DonatePay] Подключение остановлено:', message);
  donationCredentials.get().donatePay.connected = false;
  donationCredentials.save();
  broadcastAdminStatus();
}

if (donationCredentials.get().donatePay.apiKey) {
  donatePay.connect(donationCredentials.get().donatePay.apiKey, handleDonation, handleDonatePayAuthError).then(() => {
    donationCredentials.get().donatePay.connected = true;
    donationCredentials.save();
  }).catch((e) => {
    console.warn('[DonatePay] Не удалось восстановить подключение при старте сервера:', e.message);
    donationCredentials.get().donatePay.connected = false;
    donationCredentials.save();
  });
}

/** При старте: если токен DonationAlerts истёк/скоро истечёт — сначала пробуем обновить по refresh_token,
    не удаляя сохранённые данные; если обновить нечем/не удалось — просто не переподключаемся молча,
    статус в админке останется "не подключено" (нужен повторный вход), но ключи/токены никуда не пропадают. */
async function reconnectDonationAlertsAtStartup() {
  const da = donationCredentials.get().donationAlerts;
  if (!da.connected || !da.socketToken) return;

  const expiringSoon = da.expiresAt && Date.now() > da.expiresAt - 60000;
  if (expiringSoon && da.refreshToken && da.clientId && da.clientSecret) {
    try {
      const tokenData = await donationAlerts.refreshAccessToken(da.clientId, da.clientSecret, da.refreshToken);
      da.accessToken = tokenData.access_token;
      da.refreshToken = tokenData.refresh_token || da.refreshToken;
      da.expiresAt = Date.now() + (tokenData.expires_in || 0) * 1000;
      donationCredentials.save();
      console.log('[DonationAlerts] Токен обновлён по refresh_token.');
    } catch (e) {
      console.warn('[DonationAlerts] Не удалось обновить токен — нужен повторный вход через «Войти через DonationAlerts»:', e.message);
      da.connected = false;
      donationCredentials.save();
      return;
    }
  } else if (expiringSoon) {
    console.warn('[DonationAlerts] Токен истёк, а обновить нечем (нет refresh_token/Client ID/Secret) — нужен повторный вход.');
    da.connected = false;
    donationCredentials.save();
    return;
  }

  donationAlerts.connectSocket(da.socketToken, da.accessToken, da.userId, handleDonation, handleDonationAlertsAuthError);
}
reconnectDonationAlertsAtStartup();

/** Подписывается на EventSub (баллы/сабы/рейды), если есть OAuth-вход и известен канал. Безопасно вызывать повторно. */
function attemptEventSubConnect() {
  eventsub.connect(config, resolvedBroadcasterId, handleTimelineWeightedEvent, handleEventAlertRaw);
}

// ---------- Чат Twitch ----------

let dirty = false;
let pendingEmoteDrops = []; // очищается при каждой рассылке снапшота

// ---------- История сессии (для ускоренного воспроизведения) + сброс на новый стрим ----------

let replayActive = false;
let sessionHistory = []; // [{ts, topChatters, topEmotes}] — периодические срезы для "Воспроизвести историю"
const SESSION_HISTORY_INTERVAL_MS = 15000;
const MAX_HISTORY_FRAMES = 3000; // ~12.5 часов при шаге 15с — с запасом на любой стрим

/** Начинает запись истории с чистого листа (кадры прошлой записи удаляются). */
function startNewRecording(reason) {
  sessionHistory = [];
  recordingStartedAt = Date.now();
  console.log(`[История] Новая запись истории: ${reason}.`);
}
let recordingStartedAt = Date.now();

setInterval(() => {
  if (replayActive) return; // не пишем историю поверх самой себя во время воспроизведения
  sessionHistory.push({
    ts: Date.now(),
    topChatters: stats.getTopChatters(TOP_CHATTERS_COUNT, avatarCache),
    topEmotes: stats.getTopEmotes(config.topEmotesCount || 25),
    wordCloud: stats.getWordCloud(WORD_CLOUD_SIZE),
  });
  if (sessionHistory.length > MAX_HISTORY_FRAMES) sessionHistory.shift();
}, SESSION_HISTORY_INTERVAL_MS);

/**
 * Разбивает сырое сообщение на чередующиеся текст/эмодзи-сегменты для зеркала чата:
 * сначала по нативным twitch-эмодзи (позиции из tags.emotes), затем внутри
 * оставшегося текста ищет слова, совпадающие со сторонними смайлами
 * (7TV/BTTV/FFZ). Zero-width смайлы 7TV (обычно идут сразу после другого
 * смайла без пробела) складываются как оверлей поверх предыдущего смайла,
 * а не отдельным элементом.
 */
function buildMessageParts(message, tagsEmotes) {
  // 1) нативные twitch-эмодзи по позициям
  let baseParts;
  if (!tagsEmotes || Object.keys(tagsEmotes).length === 0) {
    baseParts = [{ type: 'text', text: message }];
  } else {
    const ranges = [];
    Object.entries(tagsEmotes).forEach(([id, rs]) => {
      rs.forEach((r) => {
        const [s, e] = r.split('-').map((n) => parseInt(n, 10));
        if (!Number.isNaN(s) && !Number.isNaN(e)) ranges.push({ start: s, end: e, id });
      });
    });
    ranges.sort((a, b) => a.start - b.start);

    baseParts = [];
    let cursor = 0;
    ranges.forEach((r) => {
      if (r.start > cursor) baseParts.push({ type: 'text', text: message.slice(cursor, r.start) });
      baseParts.push({
        type: 'emote',
        source: 'twitch',
        id: r.id,
        name: message.slice(r.start, r.end + 1),
        imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/3.0`,
      });
      cursor = r.end + 1;
    });
    if (cursor < message.length) baseParts.push({ type: 'text', text: message.slice(cursor) });
  }

  // 2) внутри текстовых сегментов ищем сторонние смайлы по словам
  const expanded = [];
  baseParts.forEach((part) => {
    if (part.type !== 'text') { expanded.push(part); return; }
    const tokens = part.text.split(/(\s+)/); // сохраняем пробелы как отдельные токены
    tokens.forEach((tok) => {
      if (tok === '') return;
      if (/^\s+$/.test(tok)) { expanded.push({ type: 'text', text: tok }); return; }
      const emote = thirdPartyEmotes.getEmote(tok);
      if (emote) {
        expanded.push({ type: 'emote', source: 'third-party', name: tok, imageUrl: emote.url, zeroWidth: emote.zeroWidth });
      } else {
        expanded.push({ type: 'text', text: tok });
      }
    });
  });

  // 3) zero-width смайлы 7TV — не отдельным элементом, а оверлеем на предыдущий смайл
  const stacked = [];
  expanded.forEach((part) => {
    const prev = stacked[stacked.length - 1];
    if (part.type === 'emote' && part.zeroWidth && prev && prev.type === 'emote') {
      if (!prev.overlays) prev.overlays = [];
      prev.overlays.push({ name: part.name, imageUrl: part.imageUrl });
    } else {
      stacked.push(part);
    }
  });

  return stacked;
}

const CHAT_HISTORY_MAX = 50;
let chatHistory = []; // для зеркала чата (вкладка "Чат" в админке, виджет OBS)

function pushChatHistory(chatMsg) {
  chatHistory.push(chatMsg);
  if (chatHistory.length > CHAT_HISTORY_MAX) chatHistory.shift();
}

/** Одно сообщение чата (из Twitch IRC; в тестовом режиме OVERLAY_TEST=1 — из /__test/chat). */
function onChatMessage(tags, message) {
    const username = tags['display-name'] || tags.username;
    const userId = tags['user-id'];

    // Сообщения собственного чат-бота (вкладка "Чат бот" → Bot Username) не должны попадать ни в одну
    // статистику — активность зрителей, топ слов, топ эмодзи, таймлайн. Сравниваем ЛОГИН (tags.username,
    // регистронезависимо, как и сами логины Twitch), а не отображаемое имя. Зеркало чата и TTS сообщения
    // бота при этом всё равно показывают/озвучивают как обычно — исключение только из статистики.
    const botUsername = chatBot.getPublic().botUsername;
    const botPub = chatBot.getPublic();
    // «Свой аккаунт»: бот и стример — один человек, его обычные сообщения в статистике нужны
    const isBotMessage = !!botUsername && !botPub.ownAccount && tags.username && tags.username.toLowerCase() === botUsername.toLowerCase();

    let clean;
    if (isBotMessage) {
      clean = stats.stripEmotesForDisplay(message, tags.emotes);
    } else {
      const result = stats.recordMessage(username, userId, message, tags.emotes);
      clean = result.clean;
      handleTimelineWeightedEvent({ type: 'message', userId, username });
      result.emoteEvents.forEach((e) => {
        handleTimelineWeightedEvent({ type: 'emote', userId, username, emote: e });
        pendingEmoteDrops.push({
          id: e.id,
          name: e.name,
          imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/3.0`,
        });
      });
    }

    // Зеркало чата (вкладка "Чат" в админке, виджет OBS)
    queueAvatarsFor([username]);
    const chatMsg = {
      username,
      color: tags.color || null, // если пусто — клиент подберёт цвет по нику сам
      avatarUrl: avatarCache[username.toLowerCase()] || null,
      badges: getBadgeUrls(tags.badges),
      parts: buildMessageParts(message, tags.emotes),
      roles: chatRoles.rolesFor(tags), // { mod, vip, first, raider } — для подсветки в зеркале чата
      login: String(tags.username || '').toLowerCase(), // логин — по нему страница пиксельного алерта находит героя этого человека
      ts: Date.now(),
    };
    // Герой чаттера: каждому, кто написал, при первом сообщении выдаётся случайный герой (свой чат-бот не в счёт). Сначала страницам алерта уходит список героев,
    // потом само сообщение — к его приходу герой уже в списке.
    if (!isBotMessage) {
      // роли для множителя опыта — по значкам чата: подписка любого уровня (уровень подписки в тегах чата не передаётся), VIP, модератор; команды (!…) опыта не дают
      const bdg = tags.badges || {};
      const roles = { sub: !!(bdg.subscriber || bdg.founder), vip: !!bdg.vip, mod: !!bdg.moderator || String(tags.mod) === '1' };
      const given = pixelHeroes.onChatter({ login: chatMsg.login, name: username, color: tags.color, roles, isCommand: /^\s*!/.test(message), userId: tags['user-id'] });
      awards.noteActivity(chatMsg.login);
      if (given.changed) broadcastPixelHeroes();
      runAvatarCommand(chatMsg.login, username, message);
    }
    pushChatHistory(chatMsg);
    broadcastChat(chatMsg);

    const ttsText = tts.applyCommandMode(clean, config.tts); // «только по команде»: нужен префикс «!!», он не озвучивается
    if (ttsText !== null && tts.shouldSpeak(username, ttsText, config.tts)) {
      const speechText = tts.buildSpeechText(username, ttsText, config.tts);
      tts.enqueue({
        text: speechText,
        ttsConfig: config.tts,
        onDone: (wavBuffer, mime) => {
          sendToOverlay({ type: 'tts', audio: `data:${mime || 'audio/wav'};base64,` + wavBuffer.toString('base64') });
        },
      });
    }

    dirty = true;
}

const seenMilestones = new Set();
/** Серия просмотров зрителя (watch streak) из чата: линия активности, лента «События» и алерт. */
function handleWatchStreak(m) {
  if (!m || !(m.streak > 0)) return;
  if (m.id) { if (seenMilestones.has(m.id)) return; seenMilestones.add(m.id); if (seenMilestones.size > 200) seenMilestones.delete(seenMilestones.values().next().value); }
  handleTimelineWeightedEvent({ type: 'watchstreak', username: m.username, login: m.login, meta: { streak: m.streak, points: m.points } });
  fireEventAlert('streak', { username: m.username, streak: m.streak, points: m.points });
}
if (!SETUP_MODE) twitch.connectChat(config.channel, onChatMessage, () => console.log(`Подключено к чату канала "${config.channel}".`), handleWatchStreak);


// ---------- Сборка снапшота для клиентов ----------

function buildSnapshot() {
  queueAvatarsFor(stats.getAllUsernames());

  const timelineSnapshot = timeline.getSnapshot({ lifetimeMs: timelineLifetimeMs() });
  // Аватарки для плавающих маркеров сообщений на таймлайне — берём из того же
  // кэша, что и топ зрителей, на случай, если он подгрузился позже записи события.
  timelineSnapshot.recentEvents = timelineSnapshot.recentEvents.map((e) => (
    e.username ? { ...e, avatarUrl: avatarCache[e.username.toLowerCase()] || null } : e
  ));

  const snapshot = {
    channel: config.channel,
    theme: config.theme,
    customFonts: customFonts.listFonts(),
    donorTops: {
      session: donorLeaderboard.getTop('session', 10),
      allTime: donorLeaderboard.getTop('allTime', 10),
    },
    layout: config.layout,
    widgetSettings: config.widgetSettings,
    overlayStyle: overlayStyle.get(),
    tts: config.tts,
    topChatters: stats.getTopChatters(TOP_CHATTERS_COUNT, avatarCache),
    wordCloud: stats.getWordCloud(WORD_CLOUD_SIZE),
    topEmotes: stats.getTopEmotes(config.topEmotesCount || 25),
    timeline: timelineSnapshot,
    category: categories.getSnapshot(),
    newEmoteDrops: pendingEmoteDrops,
    emoteTotal: stats.getTotalEmotes(),
    eventFeed: eventFeed.getList(15),
    emoteBoxConfig: {
      maxCount: config.emoteBoxMaxCount || 60,
      gravity: config.emoteBoxGravity || 0.5,
      bounce: config.emoteBoxBounce || 0.4,
      friction: config.emoteBoxFriction || 0.98,
    },
  };

  pendingEmoteDrops = [];
  // Фейк-режим: вместо настоящих данных — данные виртуальной трансляции (настоящие при этом не меняются)
  if (fakeStream.isActive()) {
    Object.assign(snapshot, fakeStream.getOverlayData({
      lifetimeMs: timelineLifetimeMs(), topChatters: TOP_CHATTERS_COUNT, wordCloud: WORD_CLOUD_SIZE, topEmotes: config.topEmotesCount || 25,
    }));
  }
  return snapshot;
}

// ---------- HTTP + WebSocket ----------

const app = express();
const netGuard = require('./netGuard');
app.disable('x-powered-by');
app.use(netGuard.middleware(() => config)); // доступ только с этого ПК + защита от чужих сайтов (см. netGuard.js)
// ---------- Ключ авторизации (файл со всеми данными и настройками) ----------
// Маршруты стоят ДО общего express.json(): у файла свой, большой лимит тела запроса.
const keyBundle = require('./keyBundle');
function restartAfterKey(res, extra) {
  const auto = !!process.env.OVERDECK_LAUNCHER;
  res.json(Object.assign({ success: true, restart: auto ? 'auto' : 'manual' }, extra || {}));
  if (auto) setTimeout(() => process.exit(75), 800); // лаунчер Overdeck.exe перезапустит сервер сам
}
app.get('/api/key/status', (req, res) => res.json({ setup: SETUP_MODE, channel: SETUP_MODE ? '' : config.channel, launcher: !!process.env.OVERDECK_LAUNCHER }));
app.post('/api/key/export', express.json({ limit: '1mb' }), (req, res) => {
  try {
    const { password, includeMedia } = req.body || {};
    if (!password || String(password).length < 6) return res.status(400).json({ success: false, error: 'Задай пароль для файла — минимум 6 символов. В файле лежат все ключи и токены.' });
    const r = keyBundle.create({ password: password ? String(password) : '', includeMedia: !!includeMedia, appVersion: require('./package.json').version });
    const d = new Date();
    const name = 'overdeck-key-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.overdeckkey';
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + name + '"', 'X-Key-Files': String(r.count) });
    res.send(r.text);
  } catch (e) { res.status(500).json({ success: false, error: 'Не удалось создать файл: ' + e.message }); }
});
app.post('/api/key/import', express.json({ limit: '600mb' }), (req, res) => {
  try {
    const { text, password, dryRun } = req.body || {};
    const inner = keyBundle.open(String(text || ''), password);
    if (dryRun) return res.json({ success: true, summary: keyBundle.summarize(inner) });
    const r = keyBundle.apply(inner);
    console.log('[Ключ] Файл авторизации применён: записано файлов — ' + r.written + (r.backup ? ', старые данные сохранены в ' + r.backup : ''));
    restartAfterKey(res, r);
  } catch (e) { res.status(400).json({ success: false, error: e.message, needPassword: !!e.needPassword }); }
});
app.post('/api/key/channel', express.json({ limit: '10kb' }), (req, res) => {
  const ch = String((req.body || {}).channel || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(ch)) return res.status(400).json({ success: false, error: 'Имя канала: латиница, цифры и _, 3–25 символов.' });
  try {
    const cur = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    cur.channel = ch;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cur, null, 2));
    restartAfterKey(res);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------- Хроники: подключение таблицы (до общего express.json(): у файла свой лимит) ----------
const chrJson = express.json({ limit: '10mb' });
const chrFail = (res, e) => res.status(400).json({ success: false, error: (e && e.message) || 'Не удалось выполнить.' });
app.post('/api/chronicles/source/preview', chrJson, async (req, res) => {
  try {
    const b = req.body || {};
    const text = b.url ? await chronicles.fetchSheet(b.url) : String(b.text || '');
    const r = chronicles.previewTable(text);
    if (r.error) return res.status(400).json({ success: false, error: r.error });
    res.json({ success: true, ...r });
  } catch (e) { chrFail(res, e); }
});
app.post('/api/chronicles/source/import', chrJson, (req, res) => {
  const b = req.body || {};
  const r = chronicles.importPreviewed(b.token, b.type, b.mapping, b.reverse, b.remember ? String(b.url || '') : '');
  if (r.error) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, ...r, sources: chronicles.sourcesInfo() });
});
app.post('/api/chronicles/source/sync', chrJson, async (req, res) => {
  try {
    const r = await chronicles.sync((req.body || {}).type);
    if (r.error) return res.status(400).json({ success: false, error: r.error });
    res.json({ success: true, ...r, sources: chronicles.sourcesInfo() });
  } catch (e) { chrFail(res, e); }
});
app.delete('/api/chronicles/source/:type', (req, res) => { chronicles.forgetSource(req.params.type); res.json({ success: true, sources: chronicles.sourcesInfo() }); });

app.use(express.json());

// Тестовый вход для автотестов (только при OVERLAY_TEST=1; в обычной работе маршрута нет): подставляет сообщение так, как будто оно пришло из чата Twitch.
if (process.env.OVERLAY_TEST === '1') {
  app.post('/__test/streak', (req, res) => { const b = req.body || {}; handleWatchStreak({ id: b.id ? String(b.id) : '', username: String(b.username || 'MrFrost'), login: String(b.username || 'mrfrost').toLowerCase(), streak: Number(b.streak) || 7, points: Number(b.points) || 450 }); res.json({ success: true }); });
  app.post('/__test/redeem', (req, res) => { const b = req.body || {}; handleTimelineWeightedEvent({ type: 'channelpoints', id: b.id ? String(b.id) : undefined, username: String(b.name || b.login), login: String(b.login || ''), meta: { reward: String(b.reward || '') } }); res.json({ success: true }); });
  app.post('/__test/chat', (req, res) => {
    const b = req.body || {};
    onChatMessage({ username: String(b.login || 'tester'), 'display-name': String(b.name || b.login || 'Tester'), 'user-id': String(b.userId || b.login || '1'), color: b.color || null, badges: b.badges || {}, mod: b.mod ? '1' : '0' }, String(b.message || ''));
    res.json({ success: true });
  });
}

// Файлы админки отдаём с "no-cache" (браузер каждый раз сверяет версию, при отсутствии изменений — быстрый ответ 304): иначе после обновления
// проекта браузер мог показать новую разметку со СТАРЫМ скриптом из кэша — поля есть, а работать не работают.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}admin${path.sep}`)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
customFonts.ensureFontsDir();
app.use('/fonts', express.static(customFonts.FONTS_DIR));

const TEAM_UPLOADS_DIR = path.join(__dirname, 'uploads', 'team');
fs.mkdirSync(TEAM_UPLOADS_DIR, { recursive: true });
app.use('/uploads/team', express.static(TEAM_UPLOADS_DIR));
app.use('/uploads/teams', express.static(teamPresets.PRESETS_DIR));

const teamUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEAM_UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.png', '.jpg', '.jpeg', '.webp'].includes(ext));
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

const MVP_UPLOADS_DIR = path.join(__dirname, 'uploads', 'mvp');
fs.mkdirSync(MVP_UPLOADS_DIR, { recursive: true });
app.use('/uploads/mvp', express.static(MVP_UPLOADS_DIR));

const mvpUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, MVP_UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.png', '.jpg', '.jpeg', '.webp'].includes(ext));
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

// Библиотека фонов — папка backgrounds/ в КОРНЕ проекта (не uploads/background/,
// как было раньше в единичной версии этой фичи — теперь это полноценная папка
// с несколькими файлами, сканируется на лету, см. backgroundData.js:listBackgrounds()).
fs.mkdirSync(backgroundData.BACKGROUNDS_DIR, { recursive: true });
app.use('/backgrounds', express.static(backgroundData.BACKGROUNDS_DIR));

const backgroundUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, backgroundData.BACKGROUNDS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_').slice(0, 40) || 'background';
      cb(null, `${base}-${Date.now()}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    cb(null, backgroundData.ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase()));
  },
  limits: { fileSize: 300 * 1024 * 1024 }, // с запасом на самое тяжёлое — зацикленное видео
});

// Логотипы команд турнирной сетки — по заданию "PNG без фона", но по факту
// принимаем любой формат с прозрачностью (webp тоже умеет), проверка "без
// фона" средствами сервера невозможна — доверяем пользователю.
app.use('/uploads/bracket-logos', express.static(bracketData.LOGOS_DIR));

const bracketLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, bracketData.LOGOS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    cb(null, ['.png', '.webp'].includes(path.extname(file.originalname).toLowerCase()));
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

// "Тема ивента" — фон плашек (картинка/GIF/видео), общий для всех отмеченных
// в теме алертов. Отдельная папка uploads/theme/, а не fonts/ или другая
// уже занятая — специально под этот файл (в любой момент только один).
const THEME_UPLOADS_DIR = path.join(__dirname, 'uploads', 'theme');
fs.mkdirSync(THEME_UPLOADS_DIR, { recursive: true });
app.use('/uploads/theme', express.static(THEME_UPLOADS_DIR));

const THEME_BG_ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm'];
const themeBackgroundUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, THEME_UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    cb(null, THEME_BG_ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase()));
  },
  limits: { fileSize: 300 * 1024 * 1024 }, // с запасом на видео-фон, тот же потолок, что у фона трансляции
});

// Обложка вкладки «Ивент» в админке — отдельная папка uploads/event/, одна актуальная картинка за раз.
const EVENT_COVER_DIR = path.join(__dirname, 'uploads', 'event');
fs.mkdirSync(EVENT_COVER_DIR, { recursive: true });
app.use('/uploads/event', express.static(EVENT_COVER_DIR));

const EVENT_COVER_ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const EVENT_COVER_MAX_BYTES = 10 * 1024 * 1024;
const eventCoverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, EVENT_COVER_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    cb(null, EVENT_COVER_ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase()));
  },
  limits: { fileSize: EVENT_COVER_MAX_BYTES },
});

/** Прежняя обложка удаляется с диска при замене/сбросе — как и у остальных «один файл за раз» загрузок. */
function deleteOldEventCoverFile() {
  const prevUrl = eventCover.get().imageUrl;
  if (!prevUrl) return;
  fs.unlink(path.join(EVENT_COVER_DIR, path.basename(prevUrl)), () => {}); // не критично, если файла уже нет
}

/** Старый файл фона плашек (если был) удаляем с диска при замене/сбросе — та же логика, что и у остальных "один файл в любой момент" загрузок в проекте. */
function deleteOldThemeBackgroundFile(widgetKey) {
  const widget = eventTheme.getWidget(widgetKey);
  const prevUrl = widget && widget.theme.bgImageUrl;
  if (!prevUrl) return;
  const prevPath = path.join(THEME_UPLOADS_DIR, path.basename(prevUrl));
  fs.unlink(prevPath, () => {}); // не критично, если файла уже нет
}

// Панель управления — отдельный роут, существующие роуты (/overlay.html, статика) не трогаем.
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// ---------- REST API: тексты кнопки "Помощь" на вкладках админки ----------

// ---------- REST API: вкладка "Чат бот" ----------
// Токен бота — секрет: наружу не отдаётся никогда (только hasToken/tokenPreview).

app.get('/api/chat-bot', (req, res) => {
  res.json({ chatBot: chatBot.getPublic() });
});

app.post('/api/chat-bot/save', (req, res) => {
  const result = chatBot.save(req.body || {});
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, chatBot: chatBot.getPublic() });
});

app.post('/api/chat-bot/connect', async (req, res) => {
  const result = await chatBot.connect();
  // Проверка токена/полей — синхронная часть; сама подписка на чат подтвердится чуть позже (статус connecting → connected), админка его опрашивает.
  res.status(result.ok ? 200 : 400).json({ success: result.ok, error: result.error, chatBot: chatBot.getPublic() });
});

// ---------- REST API: конструктор команд чат-бота ("!команда" → ответ) ----------

app.get('/api/bot-commands', (req, res) => {
  res.json({ commands: botCommands.list() });
});

app.post('/api/bot-commands', (req, res) => {
  const { command, response } = req.body || {};
  const result = botCommands.add(command, response);
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, commands: botCommands.list(), item: result.item });
});

app.post('/api/bot-commands/:id/update', (req, res) => {
  const { command, response } = req.body || {};
  const result = botCommands.update(req.params.id, command, response);
  if (!result.ok) return res.status(result.error === 'Команда не найдена.' ? 404 : 400).json({ success: false, error: result.error });
  res.json({ success: true, commands: botCommands.list(), item: result.item });
});

app.post('/api/bot-commands/:id/delete', (req, res) => {
  const result = botCommands.remove(req.params.id);
  if (!result.ok) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true, commands: botCommands.list() });
});

// ---------- REST API: команды чат-аватаров («!аватар» → случайный герой, «!прыжок»…) ----------

app.get('/api/avatar-commands', (req, res) => {
  res.json({ success: true, ...avatarCommands.getState(), actions: avatarCommands.getActions(), chatters: pixelHeroes.getSettings().chatters, unlock: pixelHeroes.getUnlock() });
});

// Разблокировка аватаров за баллы канала: замок (менять можно только на открытые), название награды, текст сообщения бота.
app.post('/api/pixel-heroes/unlock-settings', (req, res) => {
  const u = pixelHeroes.setUnlock(req.body);
  if (!u) return res.status(400).json({ success: false, error: 'Не удалось сохранить: название награды — до 60 символов, текст сообщения — от 1 до 300 символов, замок — да/нет.' });
  res.json({ success: true, unlock: u });
});

// Выдать аватар вручную (проверка награды или подарок): { login } — ник зрителя; открывает случайный закрытый аватар, бот пишет об этом в чат (если подключён).
app.post('/api/pixel-heroes/unlock', (req, res) => {
  const login = String((req.body && req.body.login) || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,40}$/.test(login)) return res.status(400).json({ success: false, error: 'Нужен ник зрителя (латиница, цифры и «_», как логин на Twitch).' });
  const r = unlockAvatarFor(login, login);
  if (!r.ok && r.reason === 'none-left') return res.status(409).json({ success: false, error: 'У этого зрителя уже открыты все закрытые аватары.' });
  if (!r.ok && r.reason === 'no-closed') return res.status(409).json({ success: false, error: 'Закрытых аватаров нет: у всех героев стоит галочка «выдавать». Сними её у тех, кого хочешь отдавать только за награду.' });
  res.json({ success: true, hero: r.hero, title: r.title, unlocked: r.unlocked, total: r.total, text: r.text, botConnected: chatBot.getPublic().status === 'connected' });
});

app.post('/api/avatar-commands', (req, res) => {
  const b = req.body || {};
  if ('enabled' in b && !avatarCommands.setEnabled(b.enabled)) return res.status(400).json({ success: false, error: 'Включено или нет — нужно да/нет.' });
  if ('commands' in b) {
    const r = avatarCommands.setCommands(b.commands);
    if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  }
  res.json({ success: true, ...avatarCommands.getState() });
});

app.post('/api/avatar-commands/reset', (req, res) => {
  res.json({ success: true, ...avatarCommands.reset() });
});

// ---------- REST API: сообщения чат-бота по таймеру (раз в 15–60 минут) ----------

function botTimersPayload() {
  return { timers: botTimers.list(), settings: botTimers.getSettings(), limits: { minMinutes: botTimers.INTERVAL_MIN, maxMinutes: botTimers.INTERVAL_MAX, maxLength: botTimers.TEXT_MAX_LENGTH } };
}

app.get('/api/bot-timers', (req, res) => {
  res.json(botTimersPayload());
});

app.post('/api/bot-timers/settings', (req, res) => {
  botTimers.setSettings(req.body || {});
  chatBot.syncTimers();
  res.json({ success: true, ...botTimersPayload() });
});

app.post('/api/bot-timers', (req, res) => {
  const { text, intervalMinutes, enabled } = req.body || {};
  const result = botTimers.add(text, intervalMinutes, enabled);
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  chatBot.syncTimers();
  res.json({ success: true, ...botTimersPayload(), item: result.item });
});

app.post('/api/bot-timers/:id/update', (req, res) => {
  const { text, intervalMinutes, enabled } = req.body || {};
  const result = botTimers.update(req.params.id, text, intervalMinutes, enabled);
  if (!result.ok) return res.status(result.error === 'Сообщение не найдено.' ? 404 : 400).json({ success: false, error: result.error });
  chatBot.syncTimers();
  res.json({ success: true, ...botTimersPayload(), item: result.item });
});

app.post('/api/bot-timers/:id/delete', (req, res) => {
  const result = botTimers.remove(req.params.id);
  if (!result.ok) return res.status(404).json({ success: false, error: result.error });
  chatBot.syncTimers();
  res.json({ success: true, ...botTimersPayload() });
});

// ---------- REST API: автомодерация (список запрещённых слов) ----------
// Сам список отдаётся ТОЛЬКО этим запросом — его использует модальное окно «Автомодерация»; в остальные ответы (статус бота и т.п.) слова не попадают.

app.get('/api/automod', (req, res) => {
  res.json(autoMod.getState());
});

app.get('/api/automod/defaults', (req, res) => {
  res.json({ words: autoMod.getDefaults() });
});

app.post('/api/automod', (req, res) => {
  const { words, enabled } = req.body || {};
  const result = autoMod.save({ words, enabled });
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, wordCount: result.wordCount, enabled: autoMod.isEnabled() });
});

// Написать в чат от имени бота (поле ввода в доке чата для OBS и в админке)
app.post('/api/chat-bot/say', async (req, res) => {
  const text = String((req.body && req.body.text) || '').replace(/\s+/g, ' ').trim().slice(0, 450);
  if (!text) return res.status(400).json({ success: false, error: 'Пустое сообщение.' });
  try {
    const ok = await chatBot.say(text);
    if (!ok) return res.status(409).json({ success: false, error: 'Бот не подключён к чату. Подключи его на вкладке «Чат-бот».' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'Не удалось отправить: ' + (e && e.message || 'ошибка') }); }
});

app.post('/api/chat-bot/disconnect', (req, res) => {
  chatBot.disconnect();
  res.json({ success: true, chatBot: chatBot.getPublic() });
});

// ---------- REST API: "Настройки админки" — темы оформления самой панели ----------

app.get('/api/admin-themes', (req, res) => {
  res.json({ adminThemes: adminThemes.get() });
});

app.post('/api/admin-themes', (req, res) => {
  const { name, bgColor, textColor, accentColor } = req.body || {};
  const result = adminThemes.addTheme(name, bgColor, textColor, accentColor);
  if (!result.success) return res.status(400).json({ success: false, error: 'Проверь название и все три цвета (формат #rrggbb).' });
  res.json({ success: true, adminThemes: result.data, theme: result.theme });
});

app.post('/api/admin-themes/:id/activate', (req, res) => {
  const result = adminThemes.setActiveTheme(req.params.id);
  if (!result.success) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true, adminThemes: result.data });
});

app.post('/api/admin-themes/:id/delete', (req, res) => {
  const result = adminThemes.deleteTheme(req.params.id);
  if (!result.success) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, adminThemes: result.data });
});

// Замок на личные вкладки админки (пароль хранится только в виде хеша, см. lock.js)
app.get('/api/lock/status', (req, res) => {
  res.json({ lockedTabs: tabLock.LOCKED_TABS, unlocked: tabLock.isValidToken(req.get('X-Lock-Token')) });
});
app.post('/api/lock/unlock', (req, res) => {
  const r = tabLock.verify((req.body || {}).password);
  if (!r.ok) return res.status(r.error.startsWith('Слишком') ? 429 : 401).json({ success: false, error: r.error });
  res.json({ success: true, token: r.token });
});

app.get('/api/help-texts', (req, res) => {
  res.json({ texts: helpTexts.getAll() });
});

app.post('/api/help-texts', (req, res) => {
  const { tabId, text } = req.body || {};
  if (!helpTexts.setText(tabId, text)) {
    return res.status(400).json({ success: false, error: 'Неизвестная вкладка' });
  }
  res.json({ success: true });
});

// ---------- REST API: "Панель команды" (вкладка "Ивент") ----------

function validSide(side) {
  return side === 'left' || side === 'right';
}

app.get('/api/team', (req, res) => {
  res.json({ teams: teamData.getAll(), recommendedSize: teamData.getRecommendedSize() });
});

app.post('/api/team/settings', (req, res) => {
  const settings = teamData.updateSettings(req.body || {});
  broadcastTeamUpdate('left');
  broadcastTeamUpdate('right');
  res.json({ success: true, settings, recommendedSize: teamData.getRecommendedSize() });
});

app.post('/api/team/settings/reset', (req, res) => {
  const settings = teamData.resetSettings();
  broadcastTeamUpdate('left');
  broadcastTeamUpdate('right');
  res.json({ success: true, settings, recommendedSize: teamData.getRecommendedSize() });
});

app.post('/api/team/settings/save-as-default', (req, res) => {
  const settingsDefaults = teamData.saveCurrentAsDefaults();
  res.json({ success: true, settingsDefaults });
});

// ---------- REST API: сохранённые пресеты команд ("Сохранить команду"/"Загрузить команду") ----------

app.get('/api/team/presets', (req, res) => {
  res.json({ presets: teamPresets.list() });
});

app.post('/api/team/presets/save', (req, res) => {
  const { side, name } = req.body || {};
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Укажи имя пресета' });
  const team = teamData.getSide(side);
  const preset = teamPresets.save(name, team);
  res.json({ success: true, preset });
});

app.post('/api/team/presets/load', (req, res) => {
  const { side, id } = req.body || {};
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  const preset = teamPresets.load(id);
  if (!preset) return res.status(404).json({ success: false, error: 'Пресет не найден' });

  teamData.updateText(side, { teamName: preset.teamName, players: preset.players });
  preset.players.forEach((p, i) => teamData.setPlayerPhoto(side, i, p.photoUrl, p.crop));   // кадрирование фото — из пресета (у старых пресетов его нет → по центру)
  teamData.setLogo(side, preset.logoUrl);
  teamData.setLogoLayout(side, preset.logoLayout || null);   // размер/положение логотипа этой команды (нет → общие настройки)
  broadcastTeamUpdate(side);
  res.json({ success: true, team: teamData.getSide(side) });
});

app.post('/api/team/presets/delete', (req, res) => {
  const { id } = req.body || {};
  const removed = teamPresets.remove(id);
  res.json({ success: removed });
});

// ---------- REST API: виджет "MVP матча" (заполняется вручную) ----------


// ---------- Хроники: игры и фильмы ----------
app.use('/uploads/chronicles', express.static(chronicles.POSTERS_DIR));
const chroniclesUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, chronicles.POSTERS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => cb(null, ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase())),
  limits: { fileSize: 8 * 1024 * 1024 },
});
app.get('/api/telegram', (req, res) => res.json({ success: true, ...telegramAnnounce.publicState() }));
app.post('/api/telegram', (req, res) => res.json({ success: true, ...telegramAnnounce.update(req.body) }));
app.post('/api/telegram/chronicle', async (req, res) => {
  try {
    const it = chronicles.list().find((x) => x.id === (req.body && req.body.id));
    if (!it) return res.status(404).json({ success: false, error: 'Запись не найдена.' });
    res.json({ success: true, ...(await telegramAnnounce.postChronicle(it)) });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/telegram/check', async (req, res) => {
  try { res.json({ success: true, ...(await telegramAnnounce.check()) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/telegram/link/start', async (req, res) => {
  try { res.json({ success: true, ...(await telegramAnnounce.linkStart()) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/telegram/link/check', async (req, res) => {
  try { res.json({ success: true, ...(await telegramAnnounce.linkCheck()) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/telegram/test', async (req, res) => {
  try { res.json({ success: true, ...(await (req.body && req.body.end ? telegramAnnounce.testEnd() : telegramAnnounce.test())) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.get('/api/chronicles/publish', (req, res) => res.json({ success: true, ...chrPublish.status() }));
app.post('/api/chronicles/publish/login', async (req, res) => {
  try { res.json({ success: true, ...(await chrPublish.startLogin(req.body && req.body.clientId)), ...chrPublish.status() }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/chronicles/publish/now', async (req, res) => {
  try { await chrPublish.publish(true); res.json({ success: true, ...chrPublish.status() }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/chronicles/publish/auto', (req, res) => { chrPublish.setAuto(!!(req.body && req.body.auto)); res.json({ success: true, ...chrPublish.status() }); });
app.delete('/api/chronicles/publish', (req, res) => { chrPublish.disconnect(); res.json({ success: true, ...chrPublish.status() }); });
app.get('/api/chronicles', (req, res) => res.json({ items: chronicles.list(), sources: chronicles.sourcesInfo() }));
app.post('/api/chronicles', (req, res) => {
  const r = chronicles.save(req.body || {});
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  if (!(req.body && req.body.id)) telegramAnnounce.scheduleChronicle(r.item.id); // новая запись → карточка в Телеграм (если включено)
  res.json({ success: true, item: r.item });
});
// Голосование чата «Оценка чата» для записи из «Хроник»: опрос Twitch с вариантами 1-2, 3-4, 5-6, 7-8, 9-10.
// Итог (среднее по серединам диапазонов, округлённое до 0,5) пишется в оценку чата. Нужен вход через Twitch с правом channel:manage:polls (как у опросов во вкладке «Чат»).
const CHR_BINS = ['1-2', '3-4', '5-6', '7-8', '9-10'];
const CHR_MID = [1.5, 3.5, 5.5, 7.5, 9.5];
const CHR_POLL_SECONDS = 60;
let chrPoll = null; // { id, itemId, title, short, seconds, endsAt, poll, timer, busy, cancelled }
function chrPollSummary(p) {
  const dist = CHR_BINS.map((_, i) => ((p && p.choices && p.choices[i] && p.choices[i].votes) || 0));
  const count = dist.reduce((s2, n) => s2 + n, 0);
  const avg = count ? Math.round(dist.reduce((s2, n, i) => s2 + n * CHR_MID[i], 0) / count * 10) / 10 : null;
  return { count, avg, rating: avg == null ? null : Math.round(avg * 2) / 2, dist };
}
function chrPollStatus() {
  if (!chrPoll) return { active: false };
  return { active: true, id: chrPoll.itemId, title: chrPoll.title, seconds: chrPoll.seconds, endsAt: chrPoll.endsAt, left: Math.max(0, Math.round((chrPoll.endsAt - Date.now()) / 1000)), ...chrPollSummary(chrPoll.poll) };
}
function chrPollFinish(p) {
  const cp = chrPoll; if (!cp) return null;
  clearInterval(cp.timer); chrPoll = null;
  if (cp.cancelled) return null;
  const r = chrPollSummary(p || cp.poll);
  if (!r.count) { chatBot.say(`Оценка чата для «${cp.short}»: никто не проголосовал.`).catch(() => {}); return r; }
  chronicles.save({ id: cp.itemId, chatRating: r.rating });
  chatBot.say(`Оценка чата для «${cp.short}»: около ${String(r.avg).replace('.', ',')} из 10 (голосов: ${r.count}). Спасибо!`).catch(() => {});
  return r;
}
async function chrPollTick() {
  const cp = chrPoll; if (!cp || cp.busy) return;
  cp.busy = true;
  try {
    const creds = getPollCredentials();
    if (creds.ok) {
      const p = (await polls.getPolls(creds)).find((x) => x.id === cp.id);
      if (p) { cp.poll = p; if (p.status !== 'ACTIVE') chrPollFinish(p); }
      else if (Date.now() > cp.endsAt + 15000) chrPollFinish(null);
    }
  } catch (e) { /* сеть моргнула — следующий тик */ }
  cp.busy = false;
}
app.get('/api/chronicles/vote', (req, res) => res.json({ success: true, vote: chrPollStatus() }));
app.post('/api/chronicles/vote/stop', async (req, res) => {
  if (!chrPoll) return res.json({ success: true, result: null });
  const cancel = !!(req.body || {}).cancel;
  const cp = chrPoll;
  const creds = getPollCredentials();
  try {
    if (creds.ok) {
      const p = await polls.endPoll({ ...creds, pollId: cp.id, status: cancel ? 'ARCHIVED' : 'TERMINATED' });
      if (cancel) cp.cancelled = true;
      const r = chrPollFinish(cancel ? null : (p || cp.poll));
      return res.json({ success: true, result: r });
    }
  } catch (e) { return res.status(502).json({ success: false, error: pollErrorMessage(e) }); }
  cp.cancelled = cancel; const r = chrPollFinish(cancel ? null : cp.poll);
  res.json({ success: true, result: r });
});
app.post('/api/chronicles/:id/vote', async (req, res) => {
  const it = chronicles.list().find((x) => x.id === req.params.id);
  if (!it) return res.status(404).json({ success: false, error: 'Запись не найдена.' });
  if (chrPoll) return res.status(400).json({ success: false, error: `Голосование уже идёт: «${chrPoll.title}».` });
  const creds = getPollCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });
  const short = it.title.length > 30 ? it.title.slice(0, 29) + '…' : it.title;
  try {
    const poll = await polls.createPoll({ ...creds, title: 'Оценка чата', choices: CHR_BINS, durationSeconds: CHR_POLL_SECONDS });
    chrPoll = { id: poll.id, itemId: it.id, title: it.title, short, seconds: CHR_POLL_SECONDS, endsAt: Date.now() + CHR_POLL_SECONDS * 1000, poll, timer: null, busy: false, cancelled: false };
    chrPoll.timer = setInterval(chrPollTick, 3000);
    res.json({ success: true, vote: chrPollStatus() });
  } catch (e) { res.status(502).json({ success: false, error: pollErrorMessage(e) }); }
});
app.post('/api/chronicles/:id/poster', (req, res) => {
  chroniclesUpload.single('poster')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'Нужна картинка PNG, JPG или WebP до 8 МБ.' });
    const item = chronicles.setPoster(req.params.id, req.file.filename);
    if (!item) { try { fs.unlinkSync(req.file.path); } catch (e) {} return res.status(404).json({ success: false, error: 'Запись не найдена.' }); }
    res.json({ success: true, item });
  });
});
// Постер по ссылке: скачиваем картинку на сервер (только http/https, не локальные адреса, до 8 МБ)
app.post('/api/chronicles/:id/poster-url', async (req, res) => {
  let name = '';
  try {
    name = await chronicles.downloadPoster((req.body || {}).url);
    const item = chronicles.setPoster(req.params.id, name);
    if (!item) { try { fs.unlinkSync(path.join(chronicles.POSTERS_DIR, name)); } catch (e) {} return res.status(404).json({ success: false, error: 'Запись не найдена.' }); }
    res.json({ success: true, item });
  } catch (e) {
    res.status(400).json({ success: false, error: e.name === 'TimeoutError' ? 'Не удалось скачать картинку: сайт долго отвечает.' : (e.message && !/fetch failed|Invalid URL/i.test(e.message) ? e.message : 'Не удалось скачать картинку: проверь ссылку.') });
  }
});
app.delete('/api/chronicles/:id', (req, res) => {
  if (!chronicles.remove(req.params.id)) return res.status(404).json({ success: false, error: 'Запись не найдена.' });
  res.json({ success: true });
});

app.get('/api/mvp', (req, res) => {
  res.json({ mvp: mvpData.get() });
});

app.post('/api/mvp/save', (req, res) => {
  const mvp = mvpData.updateText(req.body || {});
  broadcastMvpUpdate();
  res.json({ success: true, mvp });
});

app.post('/api/mvp/photo', (req, res) => {
  mvpUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить фото' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не подходит (нужен .png/.jpg/.jpeg/.webp)' });
    const url = `/uploads/mvp/${req.file.filename}`;
    mvpData.setPhoto(url);
    broadcastMvpUpdate();
    res.json({ success: true, url });
  });
});

let mvpAutoHideTimer = null;

app.post('/api/mvp/show', (req, res) => {
  clearTimeout(mvpAutoHideTimer); // повторный клик "Показать" перезапускает отсчёт с начала
  const mvp = mvpData.setVisible(true);
  broadcastMvpUpdate();
  mvpAutoHideTimer = setTimeout(() => {
    mvpData.setVisible(false);
    broadcastMvpUpdate();
  }, (mvp.settings.displaySeconds || 10) * 1000);
  res.json({ success: true, mvp });
});

app.post('/api/mvp/hide', (req, res) => {
  clearTimeout(mvpAutoHideTimer); // ручное скрытие раньше времени — автоскрытие по таймеру больше не нужно
  const mvp = mvpData.setVisible(false);
  broadcastMvpUpdate();
  res.json({ success: true, mvp });
});

app.post('/api/mvp/settings', (req, res) => {
  const settings = mvpData.updateSettings(req.body || {});
  broadcastMvpUpdate();
  res.json({ success: true, settings });
});

app.post('/api/mvp/settings/reset', (req, res) => {
  const settings = mvpData.resetSettings();
  broadcastMvpUpdate();
  res.json({ success: true, settings });
});

// ---------- REST API: виджет "Факт / Инфо-панель" ----------

let factAutoHideTimer = null;

/** Общая логика показа — используется и обычной кнопкой "Показать", и показом пресета из библиотеки. */
function showFactNow() {
  clearTimeout(factAutoHideTimer);
  const fact = factData.setVisible(true);
  broadcastFactUpdate();
  factAutoHideTimer = setTimeout(() => {
    factData.setVisible(false);
    broadcastFactUpdate();
  }, (fact.settings.displaySeconds || 12) * 1000);
  return fact;
}

app.get('/api/fact', (req, res) => {
  res.json({ fact: factData.get() });
});

app.post('/api/fact/save', (req, res) => {
  const { title, text } = req.body || {};
  const fact = factData.updateText({ title, text });
  broadcastFactUpdate();
  res.json({ success: true, fact });
});

app.post('/api/fact/show', (req, res) => {
  const fact = showFactNow();
  res.json({ success: true, fact });
});

app.post('/api/fact/hide', (req, res) => {
  clearTimeout(factAutoHideTimer);
  const fact = factData.setVisible(false);
  broadcastFactUpdate();
  res.json({ success: true, fact });
});

app.post('/api/fact/settings', (req, res) => {
  const settings = factData.updateSettings(req.body || {});
  broadcastFactUpdate();
  res.json({ success: true, settings });
});

app.post('/api/fact/settings/reset', (req, res) => {
  const settings = factData.resetSettings();
  broadcastFactUpdate();
  res.json({ success: true, settings });
});

// ---------- REST API: библиотека сохранённых плашек "Факт" ----------

app.get('/api/fact/presets', (req, res) => {
  res.json({ presets: factPresets.list() });
});

app.post('/api/fact/presets', (req, res) => {
  const { title, text } = req.body || {};
  const preset = factPresets.add(title, text);
  res.json({ success: true, preset });
});

app.post('/api/fact/presets/:id/update', (req, res) => {
  const { title, text } = req.body || {};
  const preset = factPresets.update(req.params.id, { title, text });
  if (!preset) return res.status(404).json({ success: false, error: 'Плашка не найдена' });
  res.json({ success: true, preset });
});

app.post('/api/fact/presets/:id/delete', (req, res) => {
  const removed = factPresets.remove(req.params.id);
  res.json({ success: removed });
});

app.post('/api/fact/presets/:id/show', (req, res) => {
  const preset = factPresets.get(req.params.id);
  if (!preset) return res.status(404).json({ success: false, error: 'Плашка не найдена' });
  factData.updateText({ title: preset.title, text: preset.text });
  const fact = showFactNow();
  res.json({ success: true, fact });
});

// ---------- REST API: плашка "Сбор" (призовой фонд, всегда на экране) ----------

app.get('/api/fund', (req, res) => {
  res.json({ fund: fundData.get() });
});

app.post('/api/fund/save', (req, res) => {
  const { title, currency } = req.body || {};
  const fund = fundData.updateText({ title, currency });
  broadcastFundUpdate();
  res.json({ success: true, fund });
});

app.post('/api/fund/amount', (req, res) => {
  const { amount } = req.body || {};
  const fund = fundData.setAmount(amount);
  broadcastFundUpdate();
  res.json({ success: true, fund });
});

app.post('/api/fund/reset', (req, res) => {
  const fund = fundData.resetAmount();
  broadcastFundUpdate();
  res.json({ success: true, fund });
});

app.post('/api/fund/settings', (req, res) => {
  const settings = fundData.updateSettings(req.body || {});
  broadcastFundUpdate();
  res.json({ success: true, settings });
});

app.post('/api/fund/settings/reset', (req, res) => {
  const settings = fundData.resetSettings();
  broadcastFundUpdate();
  res.json({ success: true, settings });
});

// ---------- REST API: «Цель сбора» (красная шкала с делениями, всегда на экране) ----------

app.get('/api/goal', (req, res) => {
  res.json({ goal: goalData.get() });
});

// текст, цель, валюта, тумблеры, громкость, размер (сумму не трогает)
app.post('/api/goal/save', (req, res) => {
  const goal = goalData.update(req.body || {});
  broadcastGoal();
  res.json({ success: true, goal });
});

app.post('/api/goal/amount', (req, res) => {
  const n = Number((req.body || {}).amount);
  if (!Number.isFinite(n) || n < 0) return res.status(400).json({ success: false, error: 'Сумма должна быть числом от 0' });
  const goal = goalData.setAmount(n);
  broadcastGoal();
  res.json({ success: true, goal });
});

app.post('/api/goal/reset', (req, res) => {
  const goal = goalData.resetAmount();
  broadcastGoal();
  res.json({ success: true, goal });
});

// тест: оверлей локально проигрывает донат (+1 500) или финал и возвращается к настоящей сумме — ничего не сохраняется
app.post('/api/goal/test', (req, res) => {
  const kind = (req.body || {}).kind === 'finale' ? 'finale' : 'donation';
  broadcastGoal({ kind }, 'goal_test');
  res.json({ success: true, kind });
});

// ---------- REST API: алерт о донате для плашки "Сбор" ----------

app.get('/api/fund/alert/settings', (req, res) => {
  res.json({ alert: fundAlertData.get() });
});

app.post('/api/fund/alert/settings', (req, res) => {
  const settings = fundAlertData.updateSettings(req.body || {});
  res.json({ success: true, settings });
});

app.post('/api/fund/alert/settings/reset', (req, res) => {
  const settings = fundAlertData.resetSettings();
  res.json({ success: true, settings });
});

app.post('/api/fund/alert/test', (req, res) => {
  const text = fundAlertData.buildText('TestUser', 500, fundData.get().currency);
  enqueueFundAlert(text);
  res.json({ success: true, text });
});

// ---------- REST API: "Коробочка сбора" (внутри блока "Сбор") ----------

app.get('/api/fundbox', (req, res) => {
  res.json({ state: fundBoxData.get(), denomination: fundBoxData.getCurrentDenomination(), boxSize: fundBoxData.getCurrentBoxSize() });
});

app.post('/api/fundbox/preview-size', (req, res) => {
  const { denomination, coinValue } = req.body || {};
  const boxSize = fundBoxData.computeBoxAndCoinSize(Number(denomination) || 1000, Number(coinValue) || 100);
  res.json({ boxSize });
});

// ---------- REST API: "Ставки" (Twitch Channel Points Predictions) ----------

/** broadcaster_id для Predictions ДОЛЖЕН совпадать с владельцем OAuth-токена — поэтому берём именно config.twitchAuth, а не общий resolvedBroadcasterId. */
function getPredictionCredentials() {
  if (!config.twitch.clientId) {
    return { ok: false, error: 'Не заполнен Client ID Twitch на вкладке «Подключения».' };
  }
  if (!config.twitchAuth || !config.twitchAuth.accessToken || !config.twitchAuth.userId) {
    return { ok: false, error: 'Сначала войди через Twitch (вкладка «Подключения» → «Войти через Twitch») — ставкам нужен твой личный токен с правом channel:manage:predictions. Если уже входил раньше, войди ещё раз: старое подключение могло быть выдано без этого права.' };
  }
  return {
    ok: true,
    clientId: config.twitch.clientId,
    accessToken: config.twitchAuth.accessToken,
    broadcasterId: config.twitchAuth.userId,
  };
}

app.get('/api/predictions/templates', (req, res) => {
  res.json({ templates: predictions.listTemplates() });
});

app.post('/api/predictions/templates/delete', (req, res) => {
  const removed = predictions.deleteTemplate(req.body && req.body.id);
  res.json({ success: removed });
});

app.post('/api/predictions/create', async (req, res) => {
  const { title, option1, option2, windowSeconds } = req.body || {};
  const errors = predictions.validateCreateInput({ title, option1, option2, windowSeconds });
  if (errors.length) return res.status(400).json({ success: false, error: errors.join(' ') });

  const creds = getPredictionCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });

  try {
    const prediction = await predictions.createPrediction({ ...creds, title, option1, option2, windowSeconds });
    predictions.saveAsTemplate(title, option1, option2); // "все созданные вопросы должны сохраняться" — сохраняем автоматически при успешном запуске
    res.json({ success: true, prediction });
  } catch (e) {
    res.status(502).json({ success: false, error: `Twitch отклонил запрос: ${e.message}` });
  }
});

app.patch('/api/predictions/resolve', async (req, res) => {
  const { predictionId, winningOutcomeId, status } = req.body || {};
  if (!predictionId) return res.status(400).json({ success: false, error: 'Не указан ID ставки.' });

  const creds = getPredictionCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });

  try {
    const prediction = await predictions.resolvePrediction({
      ...creds,
      predictionId,
      status: status || 'RESOLVED',
      winningOutcomeId,
    });
    res.json({ success: true, prediction });
  } catch (e) {
    res.status(502).json({ success: false, error: `Twitch отклонил запрос: ${e.message}` });
  }
});

app.get('/api/predictions/active', async (req, res) => {
  const creds = getPredictionCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });

  try {
    const prediction = await predictions.getActivePrediction(creds);
    res.json({ success: true, prediction });
  } catch (e) {
    res.status(502).json({ success: false, error: `Twitch отклонил запрос: ${e.message}` });
  }
});

// ---------- REST API: "Опросы" (Twitch Polls, вкладка "Чат") ----------

/** Как и у ставок: broadcaster_id должен совпадать с владельцем OAuth-токена, поэтому берём config.twitchAuth. */
function getPollCredentials() {
  if (!config.twitch.clientId) {
    return { ok: false, error: 'Не заполнен Client ID Twitch на вкладке «Подключения».' };
  }
  if (!config.twitchAuth || !config.twitchAuth.accessToken || !config.twitchAuth.userId) {
    return { ok: false, error: 'Сначала войди через Twitch (вкладка «Подключения» → «Войти через Twitch») — опросам нужен твой личный токен с правом channel:manage:polls. Если уже входил раньше, войди ещё раз: старое подключение выдано без этого права.' };
  }
  return { ok: true, clientId: config.twitch.clientId, accessToken: config.twitchAuth.accessToken, broadcasterId: config.twitchAuth.userId };
}

/** 401/403 от Twitch почти всегда значит "у токена нет права channel:manage:polls" — говорим об этом прямо, а не голым текстом Twitch. */
function pollErrorMessage(e) {
  const hint = (e.status === 401 || e.status === 403) ? ' Похоже, токен выдан без права channel:manage:polls — войди через Twitch ещё раз (вкладка «Подключения»).' : '';
  return `Twitch отклонил запрос: ${e.message}.${hint}`;
}

app.post('/api/polls/create', async (req, res) => {
  const { title, choices, durationSeconds } = req.body || {};
  const errors = polls.validateCreateInput({ title, choices, durationSeconds });
  if (errors.length) return res.status(400).json({ success: false, error: errors.join(' ') });

  const creds = getPollCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });

  try {
    const poll = await polls.createPoll({ ...creds, title, choices, durationSeconds });
    res.json({ success: true, poll });
  } catch (e) {
    res.status(502).json({ success: false, error: pollErrorMessage(e) });
  }
});

app.patch('/api/polls/end', async (req, res) => {
  const { pollId, status } = req.body || {};
  if (!pollId) return res.status(400).json({ success: false, error: 'Не указан ID опроса.' });
  const creds = getPollCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });
  try {
    const poll = await polls.endPoll({ ...creds, pollId, status });
    res.json({ success: true, poll });
  } catch (e) {
    res.status(502).json({ success: false, error: pollErrorMessage(e) });
  }
});

app.get('/api/polls/active', async (req, res) => {
  const creds = getPollCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });
  try {
    const { active, last } = await polls.getActiveAndLast(creds);
    res.json({ success: true, poll: active, lastPoll: last });
  } catch (e) {
    res.status(502).json({ success: false, error: pollErrorMessage(e) });
  }
});

// ---------- REST API: "Тема ивента" (общее оформление для MVP/Факта/Сбора/Алерта доната) ----------

/** Тема могла затронуть любой из 4 виджетов (галочка снялась/появилась, или сам виджет уже был отмечен) — просто перерассылаем все 4, это дёшево и надёжнее, чем high считать, что именно изменилось. */
function rebroadcastAllThemedWidgets() {
  broadcastMvpUpdate();
  broadcastFactUpdate();
  broadcastFundUpdate();
  broadcastFundAlertUpdate();
  broadcastTeamUpdate('left');
  broadcastTeamUpdate('right');
  broadcastBracketUpdate();
}

function validThemeWidget(key) {
  return eventTheme.APPLICABLE_WIDGETS.includes(key);
}

app.get('/api/event-theme', (req, res) => {
  res.json({ eventTheme: eventTheme.get(), widgetLabels: eventTheme.WIDGET_LABELS });
});

app.post('/api/event-theme/:widget', (req, res) => {
  const { widget } = req.params;
  if (!validThemeWidget(widget)) return res.status(400).json({ success: false, error: `Неизвестный виджет: ${widget}` });
  const data = eventTheme.update(widget, req.body || {});
  rebroadcastAllThemedWidgets();
  res.json({ success: true, eventTheme: data });
});

app.post('/api/event-theme/:widget/preset', (req, res) => {
  const { widget } = req.params;
  const { preset } = req.body || {};
  if (!validThemeWidget(widget)) return res.status(400).json({ success: false, error: `Неизвестный виджет: ${widget}` });
  if (!eventTheme.PRESET_NAMES.includes(preset)) {
    return res.status(400).json({ success: false, error: `Неизвестный пресет: ${preset}` });
  }
  const theme = eventTheme.applyPreset(widget, preset);
  rebroadcastAllThemedWidgets();
  res.json({ success: true, theme });
});

app.post('/api/event-theme/:widget/background/upload', (req, res) => {
  const { widget } = req.params;
  if (!validThemeWidget(widget)) return res.status(400).json({ success: false, error: `Неизвестный виджет: ${widget}` });
  themeBackgroundUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить фон (проверь формат — jpg/png/gif/webp/mp4/webm — и что он не больше 300 МБ).' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не получен.' });
    deleteOldThemeBackgroundFile(widget);
    const data = eventTheme.setBackgroundImageUrl(widget, `/uploads/theme/${req.file.filename}`);
    rebroadcastAllThemedWidgets();
    res.json({ success: true, eventTheme: data });
  });
});

app.post('/api/event-theme/:widget/background/remove', (req, res) => {
  const { widget } = req.params;
  if (!validThemeWidget(widget)) return res.status(400).json({ success: false, error: `Неизвестный виджет: ${widget}` });
  deleteOldThemeBackgroundFile(widget);
  const data = eventTheme.setBackgroundImageUrl(widget, null);
  rebroadcastAllThemedWidgets();
  res.json({ success: true, eventTheme: data });
});

// ---------- REST API: обложка вкладки «Ивент» (только админка) ----------

app.get('/api/event-cover', (req, res) => {
  res.json({ success: true, cover: eventCover.get() });
});

app.post('/api/event-cover/name', (req, res) => {
  const cover = eventCover.setName(req.body && req.body.name);
  res.json({ success: true, cover });
});

app.post('/api/event-cover/upload', (req, res) => {
  eventCoverUpload.single('file')(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ success: false, error: tooBig ? 'Файл больше 10 МБ — выберите картинку поменьше.' : (err.message || 'Не удалось загрузить обложку.') });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не принят — нужна картинка png, jpg, webp или gif.' });
    deleteOldEventCoverFile();
    const cover = eventCover.setImageUrl(`/uploads/event/${req.file.filename}`);
    res.json({ success: true, cover });
  });
});

app.post('/api/event-cover/remove', (req, res) => {
  deleteOldEventCoverFile();
  const cover = eventCover.setImageUrl(null);
  res.json({ success: true, cover });
});

// ---------- REST API: герои пиксельного алерта «ЧатАватары» (карточки в админке, «Показать в оверлее») ----------

app.get('/api/pixel-heroes', (req, res) => {
  res.json({ success: true, heroes: pixelHeroes.list(), active: pixelHeroes.getActive(), settings: pixelHeroes.getSettings(), groupScale: pixelHeroes.getGroupScales(), heroScale: pixelHeroes.getHeroScales(), tag: pixelHeroes.getTagStyle(), behavior: pixelHeroes.getBehavior(), unlock: pixelHeroes.getUnlock(), chatters: pixelHeroes.getRoster() });
});

// Настройки поведения героев: режим (бродят всегда / порциями / стоят), число прогулок, отдых, шансы доп. анимаций; любая часть полей, недопустимое — 400 и ничего не меняется.
app.post('/api/pixel-heroes/behavior', (req, res) => {
  const b = pixelHeroes.setBehavior(req.body);
  if (!b) return res.status(400).json({ success: false, error: 'Не удалось сохранить поведение: проверь числа (прогулки 1–20, отдых 1–600 с, паузы 0–60 с, шансы 0–100 %), «от» не больше «до».' });
  broadcastPixelHeroes();
  res.json({ success: true, behavior: b });
});

app.post('/api/pixel-heroes/show', (req, res) => {
  if (!pixelHeroes.show(req.body && req.body.id)) return res.status(404).json({ success: false, error: 'Такого героя нет.' });
  broadcastPixelHeroes();
  res.json({ success: true, active: pixelHeroes.getActive() });
});

// Топ чат-аватаров (вкладка «ЧатАватары»): по уровню, затем по опыту; в каждой записи — всё для профиля (ник, герой-аватар, уровень, опыт и длина шкалы).
// ---------- REST API: расширение Twitch (только админка; секрет наружу не отдаётся) ----------

app.get('/api/extension', (req, res) => {
  res.json({ success: true, config: twitchExt.getPublic(), status: twitchExt.getStatus(), preview: (({ snapshot, ...rest }) => rest)(twitchExt.preview()) });
});

app.get('/api/extension/snapshot', (req, res) => {
  res.json({ success: true, ...twitchExt.preview() });
});

app.post('/api/extension', (req, res) => {
  const r = twitchExt.update(req.body || {});
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, config: r.config, status: twitchExt.getStatus() });
});

/** «Отправить сейчас»: проверочная отправка снимка (даже если расширение выключено, но данные заданы) — чтобы сразу увидеть ошибку Twitch. */
app.post('/api/extension/send', async (req, res) => {
  const r = await twitchExt.tick(true);
  if (r.ok === false) return res.status(502).json({ success: false, error: r.error, status: twitchExt.getStatus() });
  res.json({ success: true, result: r, status: twitchExt.getStatus() });
});


// ---------- Награды и события (ЧатАватары → «События») ----------
app.get('/api/awards', (req, res) => {
  res.json({ success: true, awards: awards.list(), event: awards.getEvent(), log: awards.getLog(), limits: awards.limits });
});
app.post('/api/awards/event/start', (req, res) => {
  const b = req.body || {};
  const r = awards.startEvent({ awardId: b.awardId, title: b.title, description: b.description, icon: b.icon, iconSmall: b.iconSmall, howTo: b.howTo, durationMin: b.durationMin });
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, event: r.event, awards: awards.list() });
});
app.post('/api/awards/event/finish', (req, res) => {
  const r = awards.finishEvent(!(req.body && req.body.cancel === true));
  if (!r.ok) return res.status(400).json({ success: false, error: 'Сейчас нет идущего события.' });
  res.json({ success: true, granted: r.granted, awards: awards.list() });
});
app.post('/api/awards/create', (req, res) => {
  const b = req.body || {};
  const r = awards.createAward({ title: b.title, description: b.description, howTo: b.howTo, icon: b.icon, iconSmall: b.iconSmall });
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, award: r.award, awards: awards.list() });
});
app.post('/api/awards/delete', (req, res) => {
  if (!awards.deleteAward(req.body && req.body.id)) return res.status(400).json({ success: false, error: 'Не удалось удалить: награды нет или она сейчас в идущем событии.' });
  res.json({ success: true, awards: awards.list() });
});
app.post('/api/awards/grant', (req, res) => {
  const b = req.body || {};
  const logins = Array.isArray(b.logins) ? b.logins : String(b.logins || '').split(/[\s,;]+/);
  const r = awards.grant(b.awardId, logins);
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, granted: r.granted, skipped: r.skipped, awards: awards.list() });
});
app.post('/api/awards/update', (req, res) => {
  const b = req.body || {}; const patch = {};
  for (const k of ['title', 'description', 'howTo', 'icon', 'iconSmall', 'available']) if (k in b) patch[k] = b[k];
  const r = awards.updateAward(b.id, patch);
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, awards: awards.list() });
});
app.post('/api/awards/grant-all', (req, res) => {
  const r = awards.grantAll(req.body && req.body.awardId, pixelHeroes.allLogins());
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, granted: r.granted, total: pixelHeroes.allLogins().length, awards: awards.list() });
});
app.post('/api/awards/revoke', (req, res) => {
  const b = req.body || {};
  if (!awards.revoke(b.awardId, b.login)) return res.status(400).json({ success: false, error: 'У этого игрока нет такой награды.' });
  res.json({ success: true, awards: awards.list() });
});

const withAwards = (p) => (p ? { ...p, awards: awards.awardsOf(p.login).map((id) => awards.getAward(id)).filter(Boolean).map((a) => ({ id: a.id, title: a.title, description: a.description, icon: a.icon })) } : p);
app.get('/api/pixel-heroes/top', (req, res) => {
  const limit = parseInt(req.query && req.query.limit, 10);
  res.json({ success: true, top: pixelHeroes.getTop(Number.isFinite(limit) ? limit : 50).map(withAwards), rules: pixelHeroes.getRules() });
});

app.post('/api/pixel-heroes/settings', (req, res) => {
  const settings = pixelHeroes.setSettings(req.body);
  broadcastPixelHeroes();
  res.json({ success: true, settings, active: pixelHeroes.getActive() });
});

// Размер героев категории (в %, 25–300): применяется на оверлее на лету, в том числе к героям, уже стоящим на сцене.
app.post('/api/pixel-heroes/group-scale', (req, res) => {
  const b = req.body || {};
  if (!pixelHeroes.setGroupScale(b.group, b.percent)) return res.status(400).json({ success: false, error: 'Не удалось изменить размер: нет такой категории или значение не от 25 до 300 %.' });
  broadcastPixelHeroes();
  res.json({ success: true, groupScale: pixelHeroes.getGroupScales() });
});

// Размер одного героя (в %, 25–300): итоговый размер = категория × герой; применяется на оверлее на лету.
app.post('/api/pixel-heroes/hero-scale', (req, res) => {
  const b = req.body || {};
  if (!pixelHeroes.setHeroScale(b.id, b.percent)) return res.status(400).json({ success: false, error: 'Не удалось изменить размер: нет такого героя или значение не от 25 до 300 %.' });
  broadcastPixelHeroes();
  res.json({ success: true, heroScale: pixelHeroes.getHeroScales() });
});

// Ручные правки профиля игрока из админки: смена аватара (героя) и уровня. Уровень ставится целым 0–99, опыт — на начало этого уровня.
app.post('/api/pixel-heroes/profile/hero', (req, res) => {
  const b = req.body || {};
  const r = pixelHeroes.setProfileHero(b.login, b.hero);
  if (!r.ok) return res.status(400).json({ success: false, error: 'Не удалось сменить аватар: нет такого игрока или героя.' });
  if (r.changed) broadcastPixelHeroes();
  res.json({ success: true, profile: withAwards(pixelHeroes.getProfile(b.login)) });
});
app.post('/api/pixel-heroes/profile/level', (req, res) => {
  const b = req.body || {};
  if (!pixelHeroes.hasProfile(b.login) || !Number.isInteger(b.level) || b.level < 0 || b.level > 99) {
    return res.status(400).json({ success: false, error: 'Не удалось изменить уровень: нет такого игрока или уровень не целое число от 0 до 99.' });
  }
  pixelHeroes.setLevel(b.login, b.level);
  broadcastPixelHeroes(); // уровень изменился — подпись над героем (если игрок на сцене) обновится
  res.json({ success: true, profile: withAwards(pixelHeroes.getProfile(b.login)) });
});

// Цвета подписи над героем (ник и уровень «lvl N»).
app.post('/api/pixel-heroes/tag-style', (req, res) => {
  if (!pixelHeroes.setTagStyle(req.body)) return res.status(400).json({ success: false, error: 'Не удалось сохранить цвета: нужны цвета вида #rrggbb и режим ника «twitch» или «custom».' });
  broadcastPixelHeroes();
  res.json({ success: true, tag: pixelHeroes.getTagStyle() });
});

// Галочка героя «выдавать чаттерам»: влияет только на будущие выдачи, героев, уже стоящих на сцене, не трогает.
app.post('/api/pixel-heroes/pool', (req, res) => {
  const b = req.body || {};
  if (!pixelHeroes.setPool(b.id, b.enabled)) return res.status(400).json({ success: false, error: 'Не удалось изменить: нет такого героя или значение не «да/нет».' });
  res.json({ success: true, heroes: pixelHeroes.list() });
});

app.post('/api/pixel-heroes/hide', (req, res) => {
  if (!pixelHeroes.hide(req.body && req.body.id)) return res.status(404).json({ success: false, error: 'Такого героя нет.' });
  broadcastPixelHeroes();
  res.json({ success: true, active: pixelHeroes.getActive() });
});

app.post('/api/fundbox/save', (req, res) => {
  const { textTemplate, startDenomination, levelStep, coinValue, enabled } = req.body || {};
  const state = fundBoxData.updateText({ textTemplate, startDenomination, levelStep, coinValue, enabled });
  broadcastFundBoxState();
  res.json({ success: true, state });
});

app.post('/api/fundbox/settings', (req, res) => {
  const settings = fundBoxData.updateSettings(req.body || {});
  broadcastFundBoxState();
  res.json({ success: true, settings });
});

app.post('/api/fundbox/settings/reset', (req, res) => {
  const settings = fundBoxData.resetSettings();
  broadcastFundBoxState();
  res.json({ success: true, settings });
});

app.post('/api/fundbox/reset', (req, res) => {
  const state = fundBoxData.resetProgress();
  broadcastFundBoxState();
  res.json({ success: true, state });
});

app.post('/api/fundbox/test', (req, res) => {
  const events = fundBoxData.addDonationAmount(500);
  broadcastFundBoxEvents(events);
  res.json({ success: true, events });
});

// ---------- REST API: "Таймер" (обратный отсчёт мм:сс) ----------

app.get('/api/timer', (req, res) => {
  res.json({ state: timerData.get() });
});

app.post('/api/timer/save', (req, res) => {
  const state = timerData.updateText({ enabled: req.body && req.body.enabled, labelText: req.body && req.body.labelText });
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

app.post('/api/timer/settings', (req, res) => {
  const settings = timerData.updateSettings(req.body || {});
  broadcastTimerUpdate();
  res.json({ success: true, settings });
});

app.post('/api/timer/set', (req, res) => {
  const seconds = Number(req.body && req.body.seconds);
  if (!Number.isFinite(seconds) || seconds < timerData.DURATION_LIMITS[0]) {
    return res.status(400).json({ success: false, error: 'Укажи время больше 0.' });
  }
  const state = timerData.setDuration(seconds);
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

app.post('/api/timer/start', (req, res) => {
  const state = timerData.start();
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

app.post('/api/timer/pause', (req, res) => {
  const state = timerData.pause();
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

app.post('/api/timer/reset', (req, res) => {
  const state = timerData.reset();
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

// ---------- REST API: полноэкранный фон трансляции (библиотека фонов) ----------

/** Перезапускает таймер автосмены с нуля — вызывается после любого изменения (настройки/файлы/ручной выбор), чтобы всегда считать интервал от последнего события, а не от случайного момента в прошлом цикле. */
function scheduleBackgroundRotation() {
  clearTimeout(backgroundRotateTimer);
  const state = backgroundData.get();
  if (!state.settings.autoRotate || state.files.length < 2) return; // нечего крутить — выключено или только один фон
  backgroundRotateTimer = setTimeout(() => {
    const next = backgroundData.getNextFile(backgroundData.get().activeFile);
    if (next) {
      backgroundData.setActiveFile(next);
      broadcastBackgroundUpdate();
    }
    scheduleBackgroundRotation(); // следующий виток цикла
  }, state.settings.intervalMinutes * 60 * 1000);
}

app.get('/api/background', (req, res) => {
  res.json({ background: backgroundData.get() });
});

app.post('/api/background/upload', (req, res) => {
  backgroundUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить файл (проверь формат — gif/mp4/webm/mov/png/jpg/webp — и что он не больше 300 МБ).' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не получен.' });
    broadcastBackgroundUpdate();
    scheduleBackgroundRotation(); // список фонов только что вырос — если автосмена включена и раньше был только 1 файл, она теперь может заработать
    res.json({ success: true, background: backgroundData.get() });
  });
});

app.post('/api/background/select', (req, res) => {
  const background = backgroundData.setActiveFile((req.body && req.body.file) || null);
  broadcastBackgroundUpdate();
  scheduleBackgroundRotation(); // ручной выбор — отсчёт интервала до следующей автосмены начинается заново от этого момента
  res.json({ success: true, background });
});

app.post('/api/background/delete', (req, res) => {
  const file = req.body && req.body.file;
  if (!file) return res.status(400).json({ success: false, error: 'Не указан файл.' });
  const background = backgroundData.deleteFile(file);
  broadcastBackgroundUpdate();
  scheduleBackgroundRotation(); // список фонов мог сократиться до одного — автосмена должна остановиться
  res.json({ success: true, background });
});

app.post('/api/background/settings', (req, res) => {
  const background = backgroundData.updateSettings(req.body || {});
  broadcastBackgroundUpdate();
  scheduleBackgroundRotation(); // интервал/тумблер автосмены могли измениться
  res.json({ success: true, settings: background.settings });
});

// ---------- REST API: "Турнирная сетка" (генерация по количеству команд) ----------

app.get('/api/bracket', (req, res) => {
  res.json({ bracket: bracketWithTheme() });
});

app.post('/api/bracket/logo', (req, res) => {
  bracketLogoUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить логотип (проверь, что это .png или .webp и он не больше 8 МБ).' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не получен.' });
    res.json({ success: true, logoUrl: `/uploads/bracket-logos/${req.file.filename}` });
  });
});

app.post('/api/bracket/generate', (req, res) => {
  const { mode, teamCount } = req.body || {};
  if (!bracketData.MODES.includes(mode)) return res.status(400).json({ success: false, error: `Неизвестный режим: ${mode}` });
  const bracket = bracketData.generateBracket(mode, teamCount);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/match/:id/slot/:slot/fill', (req, res) => {
  const { name, logoUrl } = req.body || {};
  const bracket = bracketData.fillSlot(req.params.id, req.params.slot.toUpperCase(), name, logoUrl);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/team/:id/update', (req, res) => {
  const { name, logoUrl } = req.body || {};
  const bracket = bracketData.updateTeamInfo(req.params.id, name, logoUrl);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/match/:id/result', (req, res) => {
  const bracket = bracketData.setMatchResult(req.params.id, req.body && req.body.winnerTeamId);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/match/:id/reset', (req, res) => {
  const bracket = bracketData.resetMatchResult(req.params.id); // только Double Elimination: отмена результата матча и всего, что из него вытекало
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/match/:id/score', (req, res) => {
  const { scoreA, scoreB } = req.body || {};
  const bracket = bracketData.setMatchScore(req.params.id, scoreA, scoreB);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/final-format', (req, res) => {
  const { format } = req.body || {};
  if (!bracketData.FINAL_FORMATS.includes(format)) {
    return res.status(400).json({ success: false, error: `format должен быть одним из: ${bracketData.FINAL_FORMATS.join(', ')}` });
  }
  const bracket = bracketData.setFinalFormat(format);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/final/game-win', (req, res) => {
  const bracket = bracketData.addFinalGameWin(req.body && req.body.teamId);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/final/reset-games', (req, res) => {
  const bracket = bracketData.resetFinalGames();
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/size-settings', (req, res) => {
  const bracket = bracketData.updateSizeSettings(req.body || {});
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/color-settings', (req, res) => {
  const bracket = bracketData.updateColorSettings(req.body || {});
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/size-defaults', (req, res) => {
  const sizeDefaults = bracketData.saveSizeSettingsAsDefault();
  res.json({ success: true, sizeDefaults });
});

app.post('/api/bracket/panel-layout', (req, res) => {
  const rawLayout = (req.body && req.body.panelLayout) || {};
  const bracket = bracketData.updatePanelLayout(rawLayout);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/panel-layout-defaults', (req, res) => {
  const panelLayoutDefaults = bracketData.savePanelLayoutAsDefault();
  res.json({ success: true, panelLayoutDefaults });
});

app.post('/api/bracket/group-label', (req, res) => {
  const bracket = bracketData.setGroupLabel(req.body && req.body.text);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/matches-title', (req, res) => {
  const bracket = bracketData.setMatchesTitle(req.body && req.body.text);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/swap-slots', (req, res) => {
  const { matchIdA, slotA, matchIdB, slotB } = req.body || {};
  const bracket = bracketData.swapSlots(matchIdA, slotA, matchIdB, slotB);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/reset-seeding', (req, res) => {
  const bracket = bracketData.resetToOriginalSeeding();
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/clear', (req, res) => {
  const bracket = bracketData.clearBracket();
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.get('/api/bracket/saved', (req, res) => {
  res.json({ saved: bracketData.listSavedBrackets() });
});

app.post('/api/bracket/saved', (req, res) => {
  const saved = bracketData.saveBracketAs(req.body && req.body.name);
  res.json({ success: true, saved });
});

app.post('/api/bracket/saved/:id/load', (req, res) => {
  const bracket = bracketData.loadSavedBracket(req.params.id);
  if (!bracket) return res.status(404).json({ success: false, error: 'Сетка не найдена.' });
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/saved/:id/delete', (req, res) => {
  const saved = bracketData.deleteSavedBracket(req.params.id);
  res.json({ success: true, saved });
});

app.get('/api/bracket/teams-roster', (req, res) => {
  res.json({ teams: bracketData.listSavedTeams() });
});

app.post('/api/bracket/teams-roster', (req, res) => {
  const { name, logoUrl } = req.body || {};
  const team = bracketData.saveTeamToRoster(name, logoUrl);
  res.json({ success: true, team });
});

app.post('/api/bracket/teams-roster/:id/delete', (req, res) => {
  const teams = bracketData.deleteSavedTeam(req.params.id);
  res.json({ success: true, teams });
});

app.post('/api/team/:side/save', (req, res) => {
  const { side } = req.params;
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  const { teamName, players } = req.body || {};
  teamData.updateText(side, { teamName, players });
  broadcastTeamUpdate(side);
  res.json({ success: true, team: teamData.getSide(side) });
});

app.post('/api/team/:side/photo/:slot', (req, res) => {
  const { side, slot } = req.params;
  const slotIndex = Number(slot);
  if (!validSide(side) || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= teamData.PLAYERS_PER_TEAM) {
    return res.status(400).json({ success: false, error: 'Некорректная команда или номер слота' });
  }
  teamUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить фото' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не подходит (нужен .png/.jpg/.jpeg/.webp)' });
    const url = `/uploads/team/${req.file.filename}`;
    teamData.setPlayerPhoto(side, slotIndex, url);
    broadcastTeamUpdate(side);
    res.json({ success: true, url });
  });
});

/** Кадрирование фото игрока: { x, y, zoom }. Сохраняется вместе с командой (и попадает в «Сохранить команду»). */
app.post('/api/team/:side/photo/:slot/crop', (req, res) => {
  const { side, slot } = req.params;
  const slotIndex = Number(slot);
  if (!validSide(side) || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= teamData.PLAYERS_PER_TEAM) {
    return res.status(400).json({ success: false, error: 'Некорректная команда или номер слота' });
  }
  if (!teamData.setPlayerCrop(side, slotIndex, req.body)) return res.status(400).json({ success: false, error: 'Нужны x, y (0…1) и zoom (1…4).' });
  broadcastTeamUpdate(side);
  res.json({ success: true, crop: teamData.getSide(side).players[slotIndex].crop });
});

/** Размер и положение логотипа этой команды: { size, x, y } или { reset: true } — вернуть к общим настройкам. */
app.post('/api/team/:side/logo-layout', (req, res) => {
  const { side } = req.params;
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  const b = req.body || {};
  if (!teamData.setLogoLayout(side, b.reset === true ? null : b)) return res.status(400).json({ success: false, error: 'Нужны size (20…320), x и y (0…100).' });
  broadcastTeamUpdate(side);
  res.json({ success: true, logoLayout: teamData.getSide(side).logoLayout });
});

app.post('/api/team/:side/logo', (req, res) => {
  const { side } = req.params;
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  teamUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить логотип' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не подходит (нужен .png/.jpg/.jpeg/.webp)' });
    const url = `/uploads/team/${req.file.filename}`;
    teamData.setLogo(side, url);
    broadcastTeamUpdate(side);
    res.json({ success: true, url });
  });
});

// ---------- REST API: авторизация Twitch (для панели управления) ----------

function getOauthStatusPayload() {
  return config.twitchAuth
    ? {
        connected: true,
        login: config.twitchAuth.login,
        displayName: config.twitchAuth.displayName,
        avatarUrl: config.twitchAuth.avatarUrl,
        connectedAt: config.twitchAuth.connectedAt,
      }
    : { connected: false };
}

app.get('/api/twitch/status', (req, res) => {
  res.json({
    connected: twitchAuthState.connected,
    validatedAt: twitchAuthState.validatedAt,
    error: twitchAuthState.error,
    channel: config.channel,
    streamLive: streamIsLive,
    clientId: config.twitch.clientId || '',
    clientIdMasked: maskClientId(config.twitch.clientId),
    hasSecret: !!config.twitch.clientSecret,
    credentialsSource: CREDENTIALS_FROM_ENV ? 'env' : 'config',
    remembered: authCredentials.isRemembered('twitch'),
    callbackUrl: getCallbackUrl(),
    oauth: getOauthStatusPayload(),
  });
});

app.post('/api/twitch/verify', async (req, res) => {
  const { clientId, clientSecret } = req.body || {};
  const result = await twitch.validateCredentials(clientId, clientSecret);
  res.json(result);
});

app.post('/api/twitch/connect', async (req, res) => {
  if (CREDENTIALS_FROM_ENV) {
    return res.status(400).json({ success: false, error: 'Client ID/Secret заданы через .env — измени .env и перезапусти сервер.' });
  }

  const { clientId, clientSecret, remember } = req.body || {};
  const result = await twitch.validateCredentials(clientId, clientSecret);

  if (!result.valid) {
    twitchAuthState = { connected: false, validatedAt: null, error: result.error };
    broadcastAdminStatus();
    return res.status(400).json({ success: false, error: result.error });
  }

  config.twitch.clientId = clientId;
  config.twitch.clientSecret = clientSecret;
  twitch.invalidateToken(); // сбрасываем кэш токена — дальше всё подхватится само, без рестарта
  saveConfigToDisk(); // config.json больше не хранит сами ключи (см. saveConfigToDisk) — это ниже, отдельно
  authCredentials.setRemembered('twitch', !!remember, { clientId, clientSecret });

  twitchAuthState = { connected: true, validatedAt: Date.now(), error: null };
  broadcastAdminStatus();
  res.json({ success: true, clientIdMasked: maskClientId(clientId) });
});

app.post('/api/twitch/disconnect', (req, res) => {
  if (CREDENTIALS_FROM_ENV) {
    return res.status(400).json({ success: false, error: 'Client ID/Secret заданы через .env — измени .env и перезапусти сервер.' });
  }

  config.twitch.clientId = '';
  config.twitch.clientSecret = '';
  twitch.invalidateToken();
  saveConfigToDisk();

  twitchAuthState = { connected: false, validatedAt: null, error: null };
  broadcastAdminStatus();
  res.json({ success: true });
});

app.post('/api/twitch/logout', async (req, res) => {
  if (config.twitchAuth && config.twitchAuth.accessToken) {
    await twitch.revokeToken(config.twitch.clientId, config.twitchAuth.accessToken);
  }
  eventsub.stop();
  config.twitchAuth = null;
  saveConfigToDisk();
  broadcastAdminStatus();
  res.json({ success: true });
});

// ---------- OAuth: "Войти через Twitch" (подтверждение подключения канала) ----------

// Вход «своим аккаунтом» для чат-бота (свои ключи приложения): те же redirect и callback, но с правами бота
let botOauthState = null;
app.get('/auth/twitch/bot-login', (req, res) => {
  if (!twitch.hasCredentials(config)) return res.redirect('/admin?tab=chatbot&botAuthError=' + encodeURIComponent('Сначала укажи Client ID и Client Secret во вкладке «Подключения»'));
  botOauthState = crypto.randomBytes(16).toString('hex');
  res.redirect(twitch.buildAuthorizeUrl(config.twitch.clientId, getCallbackUrl(), botOauthState, twitch.BOT_SCOPES));
});

app.get('/auth/twitch/login', (req, res) => {
  if (usingPublicApp() || (PUBLIC_CLIENT_ID && !config.twitch.clientSecret)) return res.redirect('/admin?tab=auth&device=1'); // публичное приложение: вход по коду
  if (!twitch.hasCredentials(config)) {
    return res.redirect('/admin?tab=auth&authError=' + encodeURIComponent('Сначала укажи Client ID и Client Secret'));
  }
  oauthState = crypto.randomBytes(16).toString('hex');
  const url = twitch.buildAuthorizeUrl(config.twitch.clientId, getCallbackUrl(), oauthState);
  res.redirect(url);
});

app.get('/auth/twitch/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (state && botOauthState && state === botOauthState) { // это вход для чат-бота, не для канала
    botOauthState = null;
    const back = (q) => res.redirect('/admin?tab=chatbot&' + q);
    if (error || !code) return back('botAuthError=' + encodeURIComponent(errorDescription || String(error || 'Вход отменён')));
    const td = await twitch.exchangeCodeForToken(config.twitch.clientId, config.twitch.clientSecret, code, getCallbackUrl());
    if (!td || !td.access_token) return back('botAuthError=' + encodeURIComponent((td && td.message) || 'Не удалось получить токен от Twitch'));
    const u = await twitch.getOwnUser(config.twitch.clientId, td.access_token);
    if (!u) return back('botAuthError=' + encodeURIComponent('Не удалось получить данные аккаунта от Twitch'));
    chatBot.useOwn({ login: u.login, accessToken: td.access_token, refreshToken: td.refresh_token, expiresIn: td.expires_in, clientId: config.twitch.clientId, clientSecret: config.twitch.clientSecret, publicApp: false });
    chatBot.connect().catch(() => {});
    return back('botAuthOk=1');
  }

  if (error) {
    return res.redirect('/admin?tab=auth&authError=' + encodeURIComponent(errorDescription || String(error)));
  }
  if (!code || !state || state !== oauthState) {
    return res.redirect('/admin?tab=auth&authError=' + encodeURIComponent('Неверный или устаревший запрос — попробуй войти ещё раз'));
  }
  oauthState = null;

  const tokenData = await twitch.exchangeCodeForToken(config.twitch.clientId, config.twitch.clientSecret, code, getCallbackUrl());
  if (!tokenData || !tokenData.access_token) {
    return res.redirect('/admin?tab=auth&authError=' + encodeURIComponent((tokenData && tokenData.message) || 'Не удалось получить токен от Twitch'));
  }

  const user = await twitch.getOwnUser(config.twitch.clientId, tokenData.access_token);
  if (!user) {
    return res.redirect('/admin?tab=auth&authError=' + encodeURIComponent('Не удалось получить данные канала от Twitch'));
  }

  config.twitchAuth = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    expiresAt: Date.now() + (tokenData.expires_in || 0) * 1000,
    userId: user.id,
    login: user.login,
    displayName: user.display_name,
    avatarUrl: user.profile_image_url,
    connectedAt: Date.now(),
  };
  saveConfigToDisk();
  if (!resolvedBroadcasterId) resolvedBroadcasterId = user.id; // это и есть broadcaster (сам себя логинил)
  attemptEventSubConnect();
  broadcastAdminStatus();
  res.redirect('/admin?tab=auth');
});

// ---------- Вход по коду (Device Code Flow, общее приложение Overdeck) ----------
let deviceSession = null; // { deviceCode, userCode, uri, expiresAt, interval, state, error, login, restart }
function finishTwitchLogin(tokenData, user, clientId) {
  config.twitchAuth = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    expiresAt: Date.now() + (tokenData.expires_in || 0) * 1000,
    userId: user.id, login: user.login, displayName: user.display_name, avatarUrl: user.profile_image_url,
    connectedAt: Date.now(), clientId,
  };
}
async function pollDevice(sess) {
  while (deviceSession === sess && sess.state === 'pending') {
    await new Promise((r) => setTimeout(r, Math.max(1, sess.interval) * 1000));
    if (deviceSession !== sess) return;
    if (Date.now() > sess.expiresAt) { sess.state = 'expired'; return; }
    const r = await twitch.pollDeviceAuth(config.twitch.clientId, sess.deviceCode);
    const d = r.data || {};
    if (d.access_token) {
      const user = await twitch.getOwnUser(config.twitch.clientId, d.access_token);
      if (!user) { sess.state = 'error'; sess.error = 'Twitch не отдал данные канала — попробуй ещё раз.'; return; }
      finishTwitchLogin(d, user, config.twitch.clientId);
      twitchAuthState = { connected: true, validatedAt: Date.now(), error: null };
      sess.login = user.login; sess.displayName = user.display_name;
      if (SETUP_MODE) {
        config.channel = user.login; // пустое приложение: канал = аккаунт, которым вошли
        sess.restart = process.env.OVERDECK_LAUNCHER ? 'auto' : 'manual';
      } else {
        if (!resolvedBroadcasterId) resolvedBroadcasterId = user.id;
        attemptEventSubConnect();
      }
      saveConfigToDisk();
      broadcastAdminStatus();
      sess.state = 'done';
      if (sess.restart === 'auto') setTimeout(() => process.exit(75), 2500); // лаунчер перезапустит сервер уже с каналом
      return;
    }
    const msg = String(d.message || '');
    if (/pending/i.test(msg)) continue;
    if (/slow_down/i.test(msg)) { sess.interval += 5; continue; }
    if (/expired|invalid device code/i.test(msg)) { sess.state = 'expired'; return; }
    if (r.status === 0) continue; // сеть моргнула — пробуем дальше
    sess.state = 'error'; sess.error = msg || ('Twitch ответил ' + r.status); return;
  }
}
app.post('/api/twitch/device/start', async (req, res) => {
  if (!config.twitch.clientId) return res.status(400).json({ success: false, error: 'В этой сборке нет общего приложения Overdeck — используй свои ключи («Расширенный режим»).' });
  if (config.twitch.clientSecret) return res.status(400).json({ success: false, error: 'Указаны свои ключи приложения — входи кнопкой «Войти через Twitch».' });
  const r = await twitch.startDeviceAuth(config.twitch.clientId);
  const d = r.data || {};
  if (!d.device_code) return res.status(502).json({ success: false, error: 'Twitch не выдал код: ' + (d.message || r.status) });
  deviceSession = { deviceCode: d.device_code, userCode: d.user_code, uri: d.verification_uri, expiresAt: Date.now() + (d.expires_in || 1800) * 1000, interval: d.interval || 5, state: 'pending' };
  pollDevice(deviceSession);
  res.json({ success: true, userCode: d.user_code, uri: d.verification_uri, expiresIn: d.expires_in || 1800 });
});
app.get('/api/twitch/device/status', (req, res) => {
  const s = deviceSession;
  if (!s) return res.json({ state: 'none' });
  res.json({ state: s.state, error: s.error || null, login: s.login || null, displayName: s.displayName || null, restart: s.restart || null, userCode: s.userCode, uri: s.uri, left: Math.max(0, Math.round((s.expiresAt - Date.now()) / 1000)) });
});
// Бот своим аккаунтом по коду (общее приложение Overdeck)
let botDeviceSession = null;
async function pollBotDevice(sess) {
  while (botDeviceSession === sess && sess.state === 'pending') {
    await new Promise((r) => setTimeout(r, Math.max(1, sess.interval) * 1000));
    if (botDeviceSession !== sess) return;
    if (Date.now() > sess.expiresAt) { sess.state = 'expired'; return; }
    const r = await twitch.pollDeviceAuth(config.twitch.clientId, sess.deviceCode, twitch.BOT_SCOPES);
    const d = r.data || {};
    if (d.access_token) {
      const user = await twitch.getOwnUser(config.twitch.clientId, d.access_token);
      if (!user) { sess.state = 'error'; sess.error = 'Twitch не отдал данные аккаунта — попробуй ещё раз.'; return; }
      chatBot.useOwn({ login: user.login, accessToken: d.access_token, refreshToken: d.refresh_token, expiresIn: d.expires_in, clientId: config.twitch.clientId, publicApp: true });
      sess.login = user.login; sess.state = 'done';
      chatBot.connect().catch(() => {});
      return;
    }
    const msg = String(d.message || '');
    if (/pending/i.test(msg)) continue;
    if (/slow_down/i.test(msg)) { sess.interval += 5; continue; }
    if (/expired|invalid device code/i.test(msg)) { sess.state = 'expired'; return; }
    if (r.status === 0) continue;
    sess.state = 'error'; sess.error = msg || ('Twitch ответил ' + r.status); return;
  }
}
app.post('/api/chat-bot/own/start', async (req, res) => {
  if (!config.twitch.clientId) return res.status(400).json({ success: false, error: 'Сначала подключи Twitch во вкладке «Подключения».' });
  if (config.twitch.clientSecret) return res.json({ success: true, mode: 'redirect', url: '/auth/twitch/bot-login' }); // свои ключи — обычный вход со страницей Twitch
  const r = await twitch.startDeviceAuth(config.twitch.clientId, twitch.BOT_SCOPES);
  const d = r.data || {};
  if (!d.device_code) return res.status(502).json({ success: false, error: 'Twitch не выдал код: ' + (d.message || r.status) });
  botDeviceSession = { deviceCode: d.device_code, userCode: d.user_code, uri: d.verification_uri, expiresAt: Date.now() + (d.expires_in || 1800) * 1000, interval: d.interval || 5, state: 'pending' };
  pollBotDevice(botDeviceSession);
  res.json({ success: true, mode: 'device', userCode: d.user_code, uri: d.verification_uri, expiresIn: d.expires_in || 1800 });
});
app.get('/api/chat-bot/own/status', (req, res) => {
  const s = botDeviceSession;
  if (!s) return res.json({ state: 'none' });
  res.json({ state: s.state, error: s.error || null, login: s.login || null, userCode: s.userCode, uri: s.uri, left: Math.max(0, Math.round((s.expiresAt - Date.now()) / 1000)) });
});
app.post('/api/chat-bot/own/cancel', (req, res) => { botDeviceSession = null; res.json({ success: true }); });
app.post('/api/twitch/device/cancel', (req, res) => { deviceSession = null; res.json({ success: true }); });
app.get('/api/twitch/mode', (req, res) => res.json({ publicApp: !!PUBLIC_CLIENT_ID, usingPublicApp: usingPublicApp(), ownKeys: !!config.twitch.clientSecret, setup: SETUP_MODE, loggedIn: !!(config.twitchAuth && config.twitchAuth.accessToken), launcher: !!process.env.OVERDECK_LAUNCHER }));

// ---------- Донатный хаб: статус, история, сброс ----------

app.get('/api/donations/status', (req, res) => {
  const da = donationCredentials.get().donationAlerts;
  const dx = donationCredentials.get().donateX;
  res.json({
    donationAlerts: {
      connected: da.connected,
      userName: da.userName,
      hasCredentials: !!(da.clientId && da.clientSecret),
      clientId: da.clientId || '',
      remembered: authCredentials.isRemembered('donationAlerts'),
    },
    donateX: {
      connected: dx.connected,
      available: donateX.isAvailable(),
      remembered: authCredentials.isRemembered('donateX'),
    },
    donatePay: {
      connected: !!donationCredentials.get().donatePay.connected,
      userName: donatePay.info().userName || '',
      lastError: donatePay.info().lastError || '',
      remembered: authCredentials.isRemembered('donatePay'),
    },
  });
});

// ---------- Главная (3.0): сводка для первого экрана админки ----------
app.get('/api/home', (req, res) => {
  const now = Date.now(), day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const hist = donations.getHistory();
  const rub = (d) => (!d.currency || d.currency === 'RUB') ? Number(d.amount) || 0 : 0;
  const week = hist.filter((d) => now - d.ts < 7 * 864e5);
  const today = hist.filter((d) => d.ts >= day0.getTime());
  const sum = (arr) => Math.round(arr.reduce((a, d) => a + rub(d), 0));
  const live = (set) => [...set].filter((c) => c.readyState === 1 && c.isObs).length; // только источники OBS, не превью в админке
  const dc = donationCredentials.get();
  const bot = chatBot.getPublic ? chatBot.getPublic() : {};
  let cmds = 0, tmrs = 0;
  try { cmds = botCommands.list().length; } catch (e) {}
  try { tmrs = botTimers.list().length; } catch (e) {}
  const obs = {
    overlay: [...overlayClients].filter((c) => c.readyState === 1 && c.isObs && c.view !== 'preview' && c.view !== 'alerts' && !c.w).length,
    ...Object.fromEntries(['activity', 'timeline', 'emotebox', 'wordcloud', 'donortop', 'eventfeed', 'chat'].map((k) => ['w_' + k, [...overlayClients].filter((c) => c.readyState === 1 && c.isObs && c.w === k).length])),
    ...Object.fromEntries(['donation', 'sub', 'raid', 'follow', 'hype', 'points', 'streak', 'nowplaying'].map((k) => ['k_' + k, [...overlayClients].filter((c) => c.readyState === 1 && c.isObs && c.view === 'alerts' && c.kind === k).length])),
    chat: [...chatClients].filter((c) => c.readyState === 1 && c.isObs && !c.view).length, goal: live(goalClients), fundbox: live(fundBoxClients), fundalert: live(fundAlertClients),
    fund: live(fundClients), timer: live(timerClients), fact: live(factClients), background: live(backgroundClients),
    mvp: live(mvpClients), bracket: live(bracketClients), team: live(teamClients.left) + live(teamClients.right),
  };
  const oauth = getOauthStatusPayload();
  res.json({
    version: require('./package.json').version,
    setup: SETUP_MODE,
    channel: SETUP_MODE ? '' : config.channel,
    twitch: { appOk: !!twitchAuthState.connected, oauth },
    streamLive: !!streamIsLive,
    bot: { status: chatBot.getStatus().status, username: bot.botUsername || '', commands: cmds, timers: tmrs },
    donations: {
      today: sum(today), todayCount: today.length, week: sum(week), weekCount: week.length,
      daConnected: !!(dc.donationAlerts && dc.donationAlerts.connected), dxConnected: !!(dc.donateX && dc.donateX.connected), dpConnected: !!(dc.donatePay && dc.donatePay.connected),
    },
    events: eventFeed.getList(8),
    obs,
    checklist: {
      twitch: !!oauth.connected,
      obs: Object.values(obs).some((n) => n > 0),
      donations: !!((dc.donationAlerts && dc.donationAlerts.connected) || (dc.donateX && dc.donateX.connected) || (dc.donatePay && dc.donatePay.connected)),
      tts: !!(config.tts && config.tts.enabled),
      alerts: !!(config.donationAlert && config.donationAlert.enabled) || eventAlerts.KINDS.some((k) => config.eventAlerts && config.eventAlerts[k] && config.eventAlerts[k].enabled),
    },
  });
});

app.get('/api/donations/history', (req, res) => {
  res.json({ donations: donations.getHistory() });
});

app.post('/api/donations/reset', (req, res) => {
  donations.reset();
  res.json({ success: true });
});

// ---------- Топ донатеров: сброс только топа за стрим + ручное добавление ----------

app.post('/api/donortop/reset-session', (req, res) => {
  donorLeaderboard.resetSession();
  broadcast();
  res.json({ success: true });
});

app.get('/api/donortop/list', (req, res) => {
  res.json({
    session: donorLeaderboard.getTop('session', 50),
    allTime: donorLeaderboard.getTop('allTime', 50),
  });
});

app.post('/api/donortop/delete', (req, res) => {
  const { scope, username } = req.body || {};
  if (!username || (scope !== 'session' && scope !== 'allTime')) {
    return res.status(400).json({ success: false, error: 'Нужны username и scope ("session" или "allTime")' });
  }
  donorLeaderboard.deleteDonor(scope, username);
  broadcast();
  res.json({ success: true });
});

app.post('/api/donortop/clear-alltime', (req, res) => {
  donorLeaderboard.clearAllTime();
  broadcast();
  res.json({ success: true });
});

app.post('/api/donations/add-manual', (req, res) => {
  const { username, amount, currency, platform } = req.body || {};
  const cleanUsername = typeof username === 'string' ? username.trim() : '';
  const cleanAmount = Number(amount);
  if (!cleanUsername) {
    return res.status(400).json({ success: false, error: 'Укажи ник донатера' });
  }
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Сумма должна быть положительным числом' });
  }
  const cleanPlatform = (platform === 'donatex' || platform === 'donatepay') ? platform : 'donationalerts'; // на что похоже больше — то и берём по умолчанию
  handleDonation({
    platform: cleanPlatform,
    username: cleanUsername,
    amount: cleanAmount,
    currency: (typeof currency === 'string' && currency.trim()) || 'RUB',
    message: '(добавлено вручную)',
  });
  res.json({ success: true });
});

// ---------- Донатный хаб: DonateX (API-токен, без OAuth) ----------

app.post('/api/donations/donatex/connect', async (req, res) => {
  const apiToken = req.body && req.body.apiToken;
  const remember = req.body && req.body.remember;
  if (!apiToken) {
    return res.status(400).json({ success: false, error: 'Не указан API-токен DonateX' });
  }
  try {
    await donateX.connect(apiToken, handleDonation);
    donationCredentials.get().donateX = { apiToken, connected: true };
    donationCredentials.save(); // сам токен сюда уже не попадёт (см. donationCredentials.js) — ниже отдельно
    authCredentials.setRemembered('donateX', !!remember, { apiToken });
    broadcastAdminStatus();
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/donations/donatex/disconnect', (req, res) => {
  donateX.disconnect();
  donationCredentials.get().donateX.connected = false;
  donationCredentials.save();
  broadcastAdminStatus();
  res.json({ success: true });
});

// ---------- Донатный хаб: DonatePay (API-ключ, без OAuth; опрос транзакций) ----------

app.post('/api/donations/donatepay/connect', async (req, res) => {
  const apiKey = String((req.body && req.body.apiKey) || '').trim();
  const remember = req.body && req.body.remember;
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'Вставь API-ключ DonatePay' });
  }
  try {
    const user = await donatePay.connect(apiKey, handleDonation, handleDonatePayAuthError);
    donationCredentials.get().donatePay = { apiKey, connected: true };
    donationCredentials.save(); // сам ключ в этот файл не попадёт — см. donationCredentials.js
    authCredentials.setRemembered('donatePay', !!remember, { apiKey });
    broadcastAdminStatus();
    res.json({ success: true, userName: (user && user.userName) || '' });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/donations/donatepay/disconnect', (req, res) => {
  donatePay.disconnect();
  donationCredentials.get().donatePay.connected = false;
  donationCredentials.get().donatePay.apiKey = null;
  donationCredentials.save();
  broadcastAdminStatus();
  res.json({ success: true });
});

// ---------- Чат с других платформ (Kick, YouTube, VK Live) ----------

const EXT_CHAT_FILE = path.join(__dirname, 'external_chat.json');
let extChatSaved = { kick: '', youtube: '', vk: '', on: {} }; // что подключено и к чему — запоминается, чтобы после перезапуска чаты вернулись сами
try { extChatSaved = { ...extChatSaved, ...JSON.parse(fs.readFileSync(EXT_CHAT_FILE, 'utf8')) }; } catch (e) { /* первый запуск */ }
function saveExtChat() { try { fs.writeFileSync(EXT_CHAT_FILE, JSON.stringify(extChatSaved, null, 2)); } catch (e) { console.warn('[Чат] Не удалось сохранить external_chat.json:', e.message); } }
let ytChatKey = ((authCredentials.get().youtubeChat || {}).apiKey) || ''; // ключ YouTube: в файл попадает только с галочкой «Запомнить»

/** Сообщение с другой платформы: зеркало чата, статистика активности, озвучка. Героев, аватарки Twitch и пиксельные алерты не трогает — логины чужих платформ могут совпасть с логинами Twitch. */
function onExternalChat(m) {
  const username = String(m.username || '').slice(0, 40) || 'Зритель';
  const userId = m.platform + ':' + (m.login || username);
  const result = stats.recordMessage(username, userId, m.text, null);
  handleTimelineWeightedEvent({ type: 'message', userId, username });
  const chatMsg = {
    username,
    platform: m.platform,
    color: m.color || null,
    avatarUrl: m.avatarUrl || null,
    badges: [],
    parts: m.parts && m.parts.length ? m.parts : [{ type: 'text', text: m.text }],
    roles: { mod: !!(m.roles && m.roles.mod), vip: !!(m.roles && m.roles.vip), first: false, raider: false },
    login: String(m.login || '').toLowerCase(),
    ts: Date.now(),
  };
  pushChatHistory(chatMsg);
  broadcastChat(chatMsg);
  const ttsText = tts.applyCommandMode(result.clean, config.tts);
  if (ttsText !== null && tts.shouldSpeak(username, ttsText, config.tts)) {
    tts.enqueue({
      text: tts.buildSpeechText(username, ttsText, config.tts),
      ttsConfig: config.tts,
      onDone: (wavBuffer, mime) => { sendToOverlay({ type: 'tts', audio: `data:${mime || 'audio/wav'};base64,` + wavBuffer.toString('base64') }); },
    });
  }
  dirty = true;
}

function extChatStatus() {
  const info = externalChat.info();
  const out = {};
  externalChat.PLATFORMS.forEach((p) => {
    out[p] = { ...info[p], target: info[p].target || extChatSaved[p] || '' };
  });
  out.youtubeKeyRemembered = authCredentials.isRemembered('youtubeChat');
  out.youtubeKeySet = !!ytChatKey;
  return out;
}

function extChatStart(platform, target) {
  externalChat.start(platform, target, onExternalChat, { apiKey: ytChatKey });
  extChatSaved[platform] = String(target || '').trim();
  extChatSaved.on[platform] = true;
  saveExtChat();
}

if (!SETUP_MODE) {
  externalChat.PLATFORMS.forEach((p) => {
    if (extChatSaved.on && extChatSaved.on[p] && extChatSaved[p] && (p !== 'youtube' || ytChatKey)) {
      try { extChatStart(p, extChatSaved[p]); } catch (e) { console.warn('[Чат ' + p + '] ' + e.message); }
    }
  });
}

app.get('/api/chat/external', (req, res) => res.json({ success: true, ...extChatStatus() }));

app.post('/api/chat/external/connect', (req, res) => {
  const b = req.body || {};
  const platform = String(b.platform || '');
  if (!externalChat.PLATFORMS.includes(platform)) return res.status(400).json({ success: false, error: 'Неизвестная платформа' });
  const target = String(b.target || '').trim();
  if (!target) return res.status(400).json({ success: false, error: platform === 'youtube' ? 'Вставь ссылку на трансляцию YouTube' : 'Укажи канал' });
  try {
    if (platform === 'youtube') {
      const key = String(b.apiKey || '').trim();
      if (key) ytChatKey = key;
      if (!ytChatKey) return res.status(400).json({ success: false, error: 'Нужен API-ключ YouTube (YouTube Data API v3) — бесплатно создаётся в Google Cloud (Credentials → API key).' });
      authCredentials.setRemembered('youtubeChat', !!b.remember, { apiKey: ytChatKey });
    }
    extChatStart(platform, target);
    res.json({ success: true, ...extChatStatus() });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/chat/external/disconnect', (req, res) => {
  const platform = String((req.body || {}).platform || '');
  if (!externalChat.PLATFORMS.includes(platform)) return res.status(400).json({ success: false, error: 'Неизвестная платформа' });
  externalChat.stop(platform);
  extChatSaved.on[platform] = false;
  saveExtChat();
  res.json({ success: true, ...extChatStatus() });
});

// ---------- Донатный хаб: DonationAlerts (Client ID/Secret + OAuth + Centrifugo) ----------

app.post('/api/donations/donationalerts/credentials', (req, res) => {
  const { clientId, clientSecret, remember } = req.body || {};
  const da = donationCredentials.get().donationAlerts;
  if (typeof clientId === 'string') da.clientId = clientId.trim();
  if (typeof clientSecret === 'string') da.clientSecret = clientSecret.trim();
  donationCredentials.save(); // сами ключи сюда уже не попадут (см. donationCredentials.js) — ниже отдельно
  authCredentials.setRemembered('donationAlerts', !!remember, { clientId: da.clientId, clientSecret: da.clientSecret });
  res.json({ success: true });
});

app.get('/auth/donationalerts/login', (req, res) => {
  const da = donationCredentials.get().donationAlerts;
  if (!da.clientId || !da.clientSecret) {
    return res.redirect('/admin?tab=donations&donationsError=' + encodeURIComponent('Сначала укажи Client ID и Client Secret для DonationAlerts'));
  }
  donationAlertsOauthState = crypto.randomBytes(16).toString('hex');
  const url = donationAlerts.buildAuthorizeUrl(da.clientId, getDonationAlertsCallbackUrl(), donationAlertsOauthState);
  res.redirect(url);
});

app.get('/auth/donationalerts/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  const da = donationCredentials.get().donationAlerts;

  if (error) {
    return res.redirect('/admin?tab=donations&donationsError=' + encodeURIComponent(errorDescription || String(error)));
  }
  if (!code || !state || state !== donationAlertsOauthState) {
    return res.redirect('/admin?tab=donations&donationsError=' + encodeURIComponent('Неверный или устаревший запрос — попробуй войти ещё раз'));
  }
  donationAlertsOauthState = null;

  try {
    const tokenData = await donationAlerts.exchangeCodeForToken(da.clientId, da.clientSecret, getDonationAlertsCallbackUrl(), code);
    const user = await donationAlerts.fetchUserInfo(tokenData.access_token);

    da.accessToken = tokenData.access_token;
    da.refreshToken = tokenData.refresh_token || null;
    da.expiresAt = Date.now() + (tokenData.expires_in || 0) * 1000;
    da.userId = user.id;
    da.userName = user.name || user.code || null;
    da.socketToken = user.socket_connection_token || null;
    da.connected = true;
    donationCredentials.save();

    donationAlerts.connectSocket(da.socketToken, da.accessToken, da.userId, handleDonation, handleDonationAlertsAuthError);
    broadcastAdminStatus();
    res.redirect('/admin?tab=donations');
  } catch (e) {
    res.redirect('/admin?tab=donations&donationsError=' + encodeURIComponent(e.message));
  }
});

app.post('/api/donations/donationalerts/disconnect', (req, res) => {
  donationAlerts.disconnect();
  const da = donationCredentials.get().donationAlerts;
  da.connected = false;
  da.accessToken = null;
  da.socketToken = null;
  donationCredentials.save();
  broadcastAdminStatus();
  res.json({ success: true });
});

// ---------- REST API: тема оверлея ----------

app.get('/api/theme', (req, res) => {
  res.json({ theme: config.theme, defaults: DEFAULT_THEME });
});

function sanitizeTheme(body, base) {
  const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
  return {
    accent: isHex(body.accent) ? body.accent : base.accent,
    textMain: isHex(body.textMain) ? body.textMain : base.textMain,
    bgPanelRGB: Array.isArray(body.bgPanelRGB) && body.bgPanelRGB.length === 3
      ? body.bgPanelRGB.map((n) => Math.max(0, Math.min(255, Math.round(Number(n)) || 0)))
      : base.bgPanelRGB,
    bgPanelAlpha: typeof body.bgPanelAlpha === 'number'
      ? Math.max(0, Math.min(1, body.bgPanelAlpha))
      : base.bgPanelAlpha,
    fontMain: typeof body.fontMain === 'string' && body.fontMain.trim() ? body.fontMain.trim() : base.fontMain,
    fontText: typeof body.fontText === 'string' && body.fontText.trim() ? body.fontText.trim() : base.fontText,
    fontSizeMain: typeof body.fontSizeMain === 'number' ? Math.max(10, Math.min(40, body.fontSizeMain)) : base.fontSizeMain,
    fontSizeText: typeof body.fontSizeText === 'number' ? Math.max(10, Math.min(40, body.fontSizeText)) : base.fontSizeText,
  };
}

app.post('/api/theme', (req, res) => {
  config.theme = sanitizeTheme(req.body || {}, config.theme);
  saveConfigToDisk();
  broadcast(); // немедленно применяем на оверлее, без ожидания следующего тика
  res.json({ success: true, theme: config.theme });
});

app.post('/api/theme/reset', (req, res) => {
  config.theme = { ...DEFAULT_THEME };
  saveConfigToDisk();
  broadcast();
  res.json({ success: true, theme: config.theme });
});

// ---------- REST API: готовые темы (блок "Темы" в Основных настройках) ----------

app.get('/api/themes', (req, res) => {
  res.json({ themes: themes.listThemes(), selected: config.selectedTheme || 'default' });
});

app.post('/api/themes/apply', (req, res) => {
  const { themeId } = req.body || {};
  const preset = themes.getTheme(themeId);
  if (!preset) {
    return res.status(400).json({ success: false, error: 'Такой темы не найдено' });
  }
  const defaultTimelineSettings = widgets.getDefaultWidgetSettings().timeline;
  const { theme, timeline: timelinePatch } = themes.applyPreset(preset.params, DEFAULT_THEME, defaultTimelineSettings);

  config.theme = theme;
  config.widgetSettings = widgets.sanitizeWidgetSettings({ timeline: timelinePatch }, config.widgetSettings);
  config.selectedTheme = themeId;

  saveConfigToDisk();
  widgetsPersistence.saveSettingsDebounced(config.widgetSettings);
  broadcast();
  res.json({ success: true, theme: config.theme, widgetSettings: config.widgetSettings, selected: themeId });
});

// ---------- REST API: свои шрифты (загрузка в fonts/) ----------

const fontUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, customFonts.FONTS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext)
        .replace(/[^a-zA-Zа-яА-ЯёЁ0-9_\- ]/g, '_')
        .trim()
        .slice(0, 100) || 'font';
      cb(null, `${base}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, customFonts.ALLOWED_EXT.includes(ext)); // неподходящие файлы просто пропускаются, не роняя всю загрузку
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 20 }, // 10 МБ на файл, до 20 файлов за раз
});

app.get('/api/fonts/list', (req, res) => {
  res.json({ fonts: customFonts.listFonts() });
});

// Часть 4 темы ивента: список реально доступных начертаний для конкретного
// шрифта — для Beaufort for LOL/Spiegel сканирует файлы в fonts/ (может быть
// пусто, если файлы ещё не загружены), для шрифтов с Google Fonts — фиксированный
// набор, ровно тот, что подключён в <link> у каждого виджета (public/*.html).
const GOOGLE_FONT_WEIGHTS = {
  'Inter': [{ weight: 400, label: 'Regular' }, { weight: 500, label: 'Medium' }, { weight: 600, label: 'SemiBold' }, { weight: 700, label: 'Bold' }, { weight: 800, label: 'ExtraBold' }],
  'Cinzel': [{ weight: 600, label: 'SemiBold' }, { weight: 800, label: 'ExtraBold' }],
  'Rubik': [{ weight: 500, label: 'Medium' }, { weight: 700, label: 'Bold' }],
  'Georgia': [{ weight: 400, label: 'Regular' }, { weight: 700, label: 'Bold' }],
};
app.get('/api/fonts/weights', (req, res) => {
  const font = req.query.font || '';
  if (font === 'Beaufort for LOL') {
    const weights = customFonts.getAvailableWeights('beaufort');
    return res.json({ weights: weights.length ? weights : [{ weight: 400, label: 'Regular (файл ещё не загружен)' }] });
  }
  if (font === 'Spiegel') {
    const weights = customFonts.getAvailableWeights('spiegel');
    return res.json({ weights: weights.length ? weights : [{ weight: 400, label: 'Regular (файл ещё не загружен)' }] });
  }
  res.json({ weights: GOOGLE_FONT_WEIGHTS[font] || [{ weight: 400, label: 'Regular' }] });
});

// Генерируется на лету при каждом запросе (не кэшируется) — как только шрифты
// Riot появляются в fonts/, эта CSS подхватывает их без перезапуска сервера.
app.get('/api/fonts/riot.css', (req, res) => {
  res.type('text/css').send(customFonts.generateRiotFontFaceCss());
});

app.post('/api/fonts/upload', (req, res) => {
  fontUpload.array('fonts', 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить файлы.' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Не выбрано ни одного подходящего файла шрифта (.ttf, .otf, .woff, .woff2).',
      });
    }
    broadcast(); // оверлей сразу узнаёт о новых шрифтах через customFonts в снапшоте
    res.json({ success: true, fonts: customFonts.listFonts() });
  });
});

// ---------- REST API: виджеты оверлея (позиция/размер/вкл-выкл) ----------

app.get('/api/widgets', (req, res) => {
  res.json({
    widgets: widgets.WIDGET_DEFS,
    layout: config.layout,
    defaults: widgets.DEFAULT_LAYOUT,
  });
});

app.post('/api/layout', (req, res) => {
  const rawLayout = (req.body && req.body.layout) || {};
  config.layout = widgets.sanitizeLayout(rawLayout, config.layout);
  widgetsPersistence.saveLayoutDebounced(config.layout);
  broadcast(); // применяем на оверлее сразу же
  res.json({ success: true, layout: config.layout });
});

app.post('/api/layout/reset', (req, res) => {
  const id = req.body && req.body.id;
  if (id) {
    if (!widgets.DEFAULT_LAYOUT[id]) {
      return res.status(400).json({ success: false, error: 'Неизвестный виджет' });
    }
    config.layout[id] = { ...widgets.DEFAULT_LAYOUT[id] };
  } else {
    config.layout = widgets.getDefaultLayout();
  }
  widgetsPersistence.saveLayoutDebounced(config.layout);
  broadcast();
  res.json({ success: true, layout: config.layout });
});

// ---------- REST API: стиль оформления виджетов оверлея ----------

app.get('/api/overlay-style', (req, res) => {
  res.json({ styles: overlayStyle.STYLES, current: overlayStyle.get() });
});

app.post('/api/overlay-style', (req, res) => {
  const current = overlayStyle.update(req.body || {});
  broadcast(); // применяем на оверлее сразу
  res.json({ success: true, current });
});

// ---------- REST API: настройки СОДЕРЖИМОГО виджетов (аватарки/ник/полоска и т.п.) ----------

app.get('/api/widget-settings', (req, res) => {
  res.json({
    schema: widgets.WIDGET_SETTINGS_SCHEMA,
    settings: config.widgetSettings,
    defaults: widgets.getDefaultWidgetSettings(),
  });
});

app.post('/api/widget-settings', (req, res) => {
  const widgetId = req.body && req.body.widgetId;
  if (!widgetId || !widgets.WIDGET_SETTINGS_SCHEMA[widgetId]) {
    return res.status(400).json({ success: false, error: 'Неизвестный виджет или у него нет настроек' });
  }
  const patch = { [widgetId]: (req.body && req.body.settings) || {} };
  config.widgetSettings = widgets.sanitizeWidgetSettings(patch, config.widgetSettings);
  if (widgetId === 'timeline') timeline.setWindowSec(config.widgetSettings.timeline.windowSec);
  widgetsPersistence.saveSettingsDebounced(config.widgetSettings);
  broadcast(); // применяем на оверлее сразу же
  broadcastAdminStatus(); // и в живом превью админки (другие открытые вкладки/устройства)
  res.json({ success: true, settings: config.widgetSettings });
});

app.post('/api/widget-settings/reset', (req, res) => {
  const widgetId = req.body && req.body.widgetId;
  const defaults = widgets.getDefaultWidgetSettings();
  if (widgetId) {
    if (!widgets.WIDGET_SETTINGS_SCHEMA[widgetId]) {
      return res.status(400).json({ success: false, error: 'Неизвестный виджет или у него нет настроек' });
    }
    config.widgetSettings[widgetId] = defaults[widgetId];
  } else {
    config.widgetSettings = defaults;
  }
  widgetsPersistence.saveSettingsDebounced(config.widgetSettings);
  timeline.setWindowSec(config.widgetSettings.timeline.windowSec);
  broadcast();
  broadcastAdminStatus();
  res.json({ success: true, settings: config.widgetSettings });
});

// ---------- REST API: алерт доната ----------
app.get('/api/donation-alert', (req, res) => { res.json({ settings: config.donationAlert, defaults: donationAlert.DEFAULTS }); });
app.post('/api/donation-alert', (req, res) => {
  config.donationAlert = donationAlert.sanitize(req.body || {}, config.donationAlert);
  saveConfigToDisk();
  res.json({ success: true, settings: config.donationAlert });
});
app.post('/api/donation-alert/reset', (req, res) => {
  try { removeAlertTexture(); removeCustomFile('image'); removeCustomFile('audio'); } catch (_) {}
  config.donationAlert = { ...donationAlert.DEFAULTS };
  saveConfigToDisk();
  res.json({ success: true, settings: config.donationAlert });
});
// Текстура фона карточки: одна картинка за раз в uploads/alert-texture/
const ALERT_TEX_DIR = path.join(__dirname, 'uploads', 'alert-texture');
fs.mkdirSync(ALERT_TEX_DIR, { recursive: true });
app.use('/uploads/alert-texture', express.static(ALERT_TEX_DIR));
const alertTexUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ALERT_TEX_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (req, file, cb) => cb(null, ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(file.originalname).toLowerCase())),
  limits: { fileSize: 10 * 1024 * 1024 },
});
const removeAlertTexture = () => {
  const old = config.donationAlert.texture;
  if (old && /^[A-Za-z0-9_.\-]+$/.test(old)) fs.unlink(path.join(ALERT_TEX_DIR, old), () => {});
};
app.post('/api/donation-alert/texture', alertTexUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Нужна картинка JPG, PNG, WEBP или GIF до 10 МБ.' });
  removeAlertTexture();
  config.donationAlert = donationAlert.sanitize({ texture: req.file.filename }, config.donationAlert);
  saveConfigToDisk();
  res.json({ success: true, settings: config.donationAlert });
});
app.delete('/api/donation-alert/texture', (req, res) => {
  removeAlertTexture();
  config.donationAlert = donationAlert.sanitize({ texture: '' }, config.donationAlert);
  saveConfigToDisk();
  res.json({ success: true, settings: config.donationAlert });
});
// Свои файлы стандартного алерта: картинка/гиф и звук в uploads/alert-custom/ (по одному каждого вида)
const ALERT_CUSTOM_DIR = path.join(__dirname, 'uploads', 'alert-custom');
fs.mkdirSync(ALERT_CUSTOM_DIR, { recursive: true });
app.use('/uploads/alert-custom', express.static(ALERT_CUSTOM_DIR));
const CUSTOM_KINDS = {
  image: { key: 'customImage', exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.apng', '.avif'], max: 15, err: 'Нужна картинка или гифка (PNG, JPG, WEBP, GIF) до 15 МБ.' },
  audio: { key: 'customAudio', exts: ['.mp3', '.ogg', '.wav', '.m4a', '.aac'], max: 15, err: 'Нужен звук MP3, OGG, WAV или M4A до 15 МБ.' },
};
const customUploads = {};
Object.entries(CUSTOM_KINDS).forEach(([kind, k]) => {
  customUploads[kind] = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, ALERT_CUSTOM_DIR),
      filename: (req, file, cb) => cb(null, `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${path.extname(file.originalname).toLowerCase()}`),
    }),
    fileFilter: (req, file, cb) => cb(null, k.exts.includes(path.extname(file.originalname).toLowerCase())),
    limits: { fileSize: k.max * 1024 * 1024 },
  }).single('file');
});
const removeCustomFile = (kind) => {
  const old = config.donationAlert[CUSTOM_KINDS[kind].key];
  if (old && /^[A-Za-z0-9_.\-]+$/.test(old)) fs.unlink(path.join(ALERT_CUSTOM_DIR, old), () => {});
};
app.post('/api/donation-alert/custom/:kind', (req, res) => {
  const k = CUSTOM_KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, error: 'Неизвестный тип файла' });
  customUploads[req.params.kind](req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ success: false, error: k.err });
    removeCustomFile(req.params.kind);
    config.donationAlert = donationAlert.sanitize({ [k.key]: req.file.filename }, config.donationAlert);
    saveConfigToDisk();
    res.json({ success: true, settings: config.donationAlert });
  });
});
app.delete('/api/donation-alert/custom/:kind', (req, res) => {
  const k = CUSTOM_KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, error: 'Неизвестный тип файла' });
  removeCustomFile(req.params.kind);
  config.donationAlert = donationAlert.sanitize({ [k.key]: '' }, config.donationAlert);
  saveConfigToDisk();
  res.json({ success: true, settings: config.donationAlert });
});
/** Тестовый алерт: в историю донатов и в «Топ донатеров» не попадает. */
app.post('/api/donation-alert/card', (req, res) => {   // карточка по сохранённым настройкам — для предпросмотра на странице «Ссылки для OBS»
  const s = config.donationAlert;
  const rec = { username: 'Тестовый зритель', amount: 1500, currency: 'RUB', message: 'Привет! Держи на новый микрофон', platform: 'donationalerts' };
  res.json({ success: true, card: donationAlert.buildCard(rec, s, { rub: 1500, stat: s.donorStat !== false ? 'Донат №3 · всего 1 500 ₽' : '', no: 3 }) });
});
app.post('/api/donation-alert/test', (req, res) => {
  const b = req.body || {};
  fireDonationAlert({ username: String(b.username || 'Тестовый зритель').slice(0, 40), amount: Number(b.amount) > 0 ? Number(b.amount) : 500, currency: String(b.currency || 'RUB'), message: String(b.message == null ? 'Привет, как дела, чем занимаешься, держи деньги на трусы новые, всем удачи!' : b.message), platform: (b.platform === 'donatex' || b.platform === 'donatepay') ? b.platform : 'donationalerts' }, true);
  res.json({ success: true });
});
// ---------- REST API: алерты событий ----------
app.get('/api/event-alerts', (req, res) => { res.json({ settings: config.eventAlerts, defaults: eventAlerts.DEFAULTS }); });
// Свои картинка/гифка и звук для алерта фоллоу (стандартный вид): те же файлы в uploads/alert-custom/
const removeEventCustomFile = (ev, kind) => {
  const old = config.eventAlerts[ev][CUSTOM_KINDS[kind].key];
  if (old && /^[A-Za-z0-9_.\-]+$/.test(old)) fs.unlink(path.join(ALERT_CUSTOM_DIR, old), () => {});
};
app.post('/api/event-alerts/:ev(follow|sub)/custom/:kind', (req, res) => {
  const ev = req.params.ev, k = CUSTOM_KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, error: 'Неизвестный тип файла' });
  customUploads[req.params.kind](req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ success: false, error: k.err });
    removeEventCustomFile(ev, req.params.kind);
    config.eventAlerts[ev] = eventAlerts.sanitizeKind(ev, { [k.key]: req.file.filename }, config.eventAlerts[ev]);
    saveConfigToDisk();
    res.json({ success: true, settings: config.eventAlerts[ev] });
  });
});
app.delete('/api/event-alerts/:ev(follow|sub)/custom/:kind', (req, res) => {
  const ev = req.params.ev, k = CUSTOM_KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, error: 'Неизвестный тип файла' });
  removeEventCustomFile(ev, req.params.kind);
  config.eventAlerts[ev] = eventAlerts.sanitizeKind(ev, { [k.key]: '' }, config.eventAlerts[ev]);
  saveConfigToDisk();
  res.json({ success: true, settings: config.eventAlerts[ev] });
});
app.post('/api/event-alerts/:kind', (req, res) => {
  const k = req.params.kind;
  if (!eventAlerts.KINDS.includes(k)) return res.status(404).json({ success: false, error: 'Неизвестное событие' });
  config.eventAlerts[k] = eventAlerts.sanitizeKind(k, req.body || {}, config.eventAlerts[k]);
  saveConfigToDisk();
  if (k === 'nowplaying') applyNowPlayingConfig();
  res.json({ success: true, settings: config.eventAlerts[k] });
});
app.post('/api/event-alerts/:kind/reset', (req, res) => {
  const k = req.params.kind;
  if (!eventAlerts.KINDS.includes(k)) return res.status(404).json({ success: false, error: 'Неизвестное событие' });
  config.eventAlerts[k] = eventAlerts.sanitizeKind(k, {}, null);
  saveConfigToDisk();
  if (k === 'nowplaying') applyNowPlayingConfig();
  res.json({ success: true, settings: config.eventAlerts[k] });
});
// данные от расширения браузера: что играет на открытых вкладках (video/audio на любом сайте)
app.post('/api/nowplaying/browser', express.json({ limit: '200kb' }), (req, res) => {
  try { nowPlaying.setBrowser(req.body || {}); res.json({ success: true, enabled: !!config.eventAlerts.nowplaying.enabled }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
// кнопка «Установить расширение» в админке: открывает страницу расширений браузера и папку с расширением (Windows). Магазин — если задан extensionStoreUrl в config.json.
app.get('/api/nowplaying/extension', (req, res) => { res.json({ success: true, dir: path.join(__dirname, 'browser-extension'), store: /^https:\/\//.test(String(config.nowplayingExtensionStoreUrl || '')) ? config.nowplayingExtensionStoreUrl : '' }); });
app.post('/api/nowplaying/extension/install', express.json({ limit: '5kb' }), (req, res) => {
  const dir = path.join(__dirname, 'browser-extension');
  const b = String((req.body && req.body.browser) || '');
  const BR = { chrome: ['chrome', 'chrome://extensions'], edge: ['msedge', 'edge://extensions'], yandex: [path.join(process.env.LOCALAPPDATA || '', 'Yandex', 'YandexBrowser', 'Application', 'browser.exe'), 'browser://extensions/'] };
  if (b === 'yandex' && process.platform === 'win32' && !require('fs').existsSync(BR.yandex[0])) BR.yandex[0] = 'browser';   // нестандартная установка: пробуем через PATH
  const store = String(config.nowplayingExtensionStoreUrl || '');
  if (/^https:\/\//.test(store)) return res.json({ success: true, store, dir });
  let opened = false;
  const what = String((req.body && req.body.what) || 'both');
  if (process.platform === 'win32') {
    if (what !== 'page') { try { require('child_process').spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { /* не критично */ } }
    if (what !== 'folder' && BR[b]) { try { require('child_process').spawn('cmd.exe', ['/c', 'start', '', BR[b][0], BR[b][1]], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); opened = true; } catch (e) { /* откроют сами */ } }
  }
  res.json({ success: true, dir, opened, page: BR[b] ? BR[b][1] : 'chrome://extensions' });
});
app.get('/api/nowplaying', (req, res) => { res.json({ success: true, ...nowPlayingPayload() }); });
app.get('/api/nowplaying/cover', (req, res) => {
  const c = nowPlaying.getCover(req.query.k);
  if (!c) return res.status(404).end();
  res.set('Content-Type', c.mime); res.set('Cache-Control', 'no-cache'); res.send(c.buf);
});

/** Тест: показывает алерт события на оверлее (даже если событие выключено). */
app.post('/api/event-alerts/:kind/test', (req, res) => {
  const k = req.params.kind;
  if (!eventAlerts.KINDS.includes(k)) return res.status(404).json({ success: false, error: 'Неизвестное событие' });
  if (k === 'nowplaying') { nowPlaying.setDemo(25); broadcastNowPlaying(true); return res.json({ success: true }); }
  fireEventAlert(k, req.body || {}, true);
  res.json({ success: true });
});
/** Стена фолловеров: статистика и разовая подгрузка всех текущих фолловеров из Twitch (нужно право moderator:read:followers). */
app.get('/api/follow-wall', (req, res) => { res.json({ success: true, ...followRegistry.stats() }); });
app.post('/api/follow-wall/sync', async (req, res) => {
  const a = config.twitchAuth;
  if (!config.twitch.clientId || !a || !a.accessToken || !a.userId) return res.status(400).json({ success: false, error: 'Сначала войди через Twitch (вкладка «Подключения»).' });
  try {
    const r = await followRegistry.syncFrom(async (cursor) => {
      const qs = new URLSearchParams({ broadcaster_id: a.userId, first: '100' }); if (cursor) qs.set('after', cursor);
      const resp = await fetch('https://api.twitch.tv/helix/channels/followers?' + qs, { headers: { 'Client-ID': config.twitch.clientId, Authorization: 'Bearer ' + a.accessToken } });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) { const e = new Error(j.message || ('HTTP ' + resp.status)); e.status = resp.status; throw e; }
      return { items: (j.data || []).map((x) => ({ login: x.user_login, name: x.user_name, at: x.followed_at })), cursor: j.pagination && j.pagination.cursor, total: j.total };
    });
    res.json({ success: true, ...r, count: followRegistry.count() });
  } catch (e) {
    const hint = (e.status === 401 || e.status === 403) ? ' Похоже, токен выдан без права moderator:read:followers — войди через Twitch заново (вкладка «Подключения»).' : '';
    res.status(500).json({ success: false, error: 'Twitch отклонил запрос: ' + e.message + '.' + hint });
  }
});
/** Карточка события для предпросмотра в админке (по сохранённым настройкам). */
app.post('/api/event-alerts/:kind/card', async (req, res) => {
  const k = req.params.kind;
  if (!eventAlerts.KINDS.includes(k)) return res.status(404).json({ success: false, error: 'Неизвестное событие' });
  const body = { ...(req.body || {}) };
  if (k === 'follow' && config.eventAlerts.follow.style === 'badge') { body.avatar = await avatarUrlFor(config.channel); body.channel = config.channel; }
  if (k === 'raid' && body.avatar === undefined && config.eventAlerts.raid.style !== 'plain') Object.assign(body, await raidExtras(body, true));
  const built = eventAlerts.buildCard(k, withWall(k, body, false), config.eventAlerts[k], config.donationAlert);
  res.json({ success: !!built, card: built && built.card });
});
/** Библиотека звуков алертов: готовые (public/alert-sounds/manifest.json) + любые свои .ogg/.mp3/.wav, положенные в ту же папку. */
app.get('/api/alert-sounds', (req, res) => {
  const dir = path.join(__dirname, 'public', 'alert-sounds');
  let manifest = [];
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch (e) { manifest = []; }
  const known = new Set(manifest.map((m) => m.file));
  let own = [];
  try { own = fs.readdirSync(dir).filter((f) => /\.(ogg|mp3|wav)$/i.test(f) && !known.has(f)).map((f) => ({ id: f, label: f.replace(/\.[^.]+$/, ''), group: 'Мои звуки', file: f })); } catch (e) { own = []; }
  res.json({ sounds: manifest.concat(own) });
});
app.post('/api/donation-alert/skip', (req, res) => { sendToOverlay({ type: 'donation_alert_skip' }); res.json({ success: true });});


// ---------- REST API: озвучка чата (Piper) ----------

app.get('/api/tts', (req, res) => {
  res.json({ tts: config.tts, defaults: tts.getDefaultTts(), voices: tts.getVoices(), catalog: tts.getCatalog() });
});

app.post('/api/tts', (req, res) => {
  config.tts = tts.sanitizeTts(req.body || {}, config.tts);
  saveConfigToDisk();
  broadcast(); // настройки едут в общем снапшоте оверлея
  res.json({ success: true, tts: config.tts });
});

app.post('/api/tts/reset', (req, res) => {
  config.tts = tts.getDefaultTts();
  saveConfigToDisk();
  broadcast();
  res.json({ success: true, tts: config.tts });
});

app.get('/api/tts/catalog', (req, res) => { res.json({ voices: tts.getVoices(), catalog: tts.getCatalog() }); });
app.post('/api/tts/voices/install', (req, res) => { res.json(tts.installVoice(String((req.body || {}).id || ''))); });
/** Прослушать голос: короткая фраза, синтез тем же Piper; звук возвращается в админку и играет там. */
app.post('/api/tts/preview', async (req, res) => {
  const b = req.body || {};
  const voice = String(b.voice || config.tts.voice);
  if (!/^[A-Za-z0-9_.:\-]{1,80}$/.test(voice)) return res.status(400).json({ success: false, error: 'bad voice' });
  try {
    const r = await tts.synthesize(String(b.text || 'Привет! Это проверка голоса. Спасибо за донат!').slice(0, 200), { ...config.tts, voice });
    res.json({ success: true, audio: `data:${r.mime};base64,` + r.buffer.toString('base64') });
  } catch (e) {
    res.json({ success: false, error: voice.startsWith('edge:') ? 'Не удалось озвучить через Edge: ' + String(e.message || e).slice(0, 160) : voice.startsWith('silero:') ? 'Silero: ' + String(e.message || e).slice(0, 200) : 'Не удалось озвучить: голос не установлен или не найден Piper' });
  }
});
app.post('/api/tts/stop', (req, res) => {
  tts.clearQueue();
  sendToOverlay({ type: 'tts_stop' });
  res.json({ success: true });
});

// ---------- REST API: настройки отображения чата ----------

app.get('/api/chat-settings', (req, res) => {
  res.json({ settings: config.chatSettings, defaults: DEFAULT_CHAT_SETTINGS });
});

app.post('/api/chat-settings', (req, res) => {
  const b = req.body || {};
  // Принимаем только известные поля и только булевы значения; остальное остаётся как было.
  config.chatSettings = Object.fromEntries(Object.keys(DEFAULT_CHAT_SETTINGS).map((k) => [k, (k === 'platformTagStyle' ? ['outline', 'icon'].includes(b[k]) : typeof b[k] === 'boolean') ? b[k] : config.chatSettings[k]]));
  saveConfigToDisk();
  broadcastChatSettings();
  res.json({ success: true, settings: config.chatSettings });
});

// ---------- REST API: управление стримом (сброс статистики, воспроизведение истории) ----------

/** Начинает новую трансляцию с нуля: статистика, таймлайн, лента событий, история для воспроизведения. */
function resetStreamSession(reason) {
  stats.reset();
  timeline.reset();
  eventFeed.reset();
  categories.reset();
  donorLeaderboard.resetSession(); // топ за всё время (donations_alltime.json) не трогаем
  chatHistory = [];
  chatRoles.reset();
  pixelHeroes.newSession(); // новая трансляция: «заход на стрим» снова засчитывается всем
  if (pixelHeroes.clearRoster()) broadcastPixelHeroes(); // новая «сессия» — герои чаттеров прошлого стрима уходят со сцены
  sessionHistory = [];
  recordingStartedAt = Date.now();
  pendingEmoteDrops = [];
  saveStats();
  broadcast();
  broadcastAdminStatus();
  if (reason) console.log(`[История] Новая трансляция с нуля: ${reason}.`);
}

app.post('/api/stream/reset', (req, res) => {
  if (replayActive) {
    return res.status(400).json({ success: false, error: 'Сейчас идёт воспроизведение истории — сначала останови его' });
  }
  resetStreamSession();
  res.json({ success: true });
});

// Состояние панели кнопок над предпросмотром: автозапись, число записанных кадров, идёт ли воспроизведение.
app.get('/api/stream/state', (req, res) => {
  res.json({ autoRecord: !!config.autoRecord, frames: sessionHistory.length, replayActive, fakeActive: fakeStream.isActive(), recordingStartedAt, streamLive: streamIsLive });
});

app.post('/api/stream/auto-record', (req, res) => {
  config.autoRecord = !!(req.body && req.body.enabled);
  saveConfigToDisk();
  res.json({ success: true, autoRecord: config.autoRecord });
});

app.post('/api/replay/start', (req, res) => {
  if (fakeStream.isActive()) {
    return res.status(400).json({ success: false, error: 'Сейчас идёт фейк-режим — сначала останови его' });
  }
  if (replayActive) {
    return res.status(400).json({ success: false, error: 'Воспроизведение уже идёт' });
  }
  if (sessionHistory.length === 0) {
    return res.status(400).json({ success: false, error: 'Пока нет истории для воспроизведения — подожди немного после начала стрима' });
  }
  res.json({ success: true, frames: sessionHistory.length });
  runReplay();
});

app.post('/api/replay/stop', (req, res) => {
  replayActive = false; // цикл воспроизведения сам остановится на следующем кадре
  res.json({ success: true });
});

// ---------- Фейк-режим: виртуальная трансляция для проверки оверлея (см. fakeStream.js) ----------

app.post('/api/fake/start', (req, res) => {
  if (replayActive) return res.status(400).json({ success: false, error: 'Сейчас идёт воспроизведение истории — сначала останови его' });
  if (fakeStream.isActive()) return res.status(400).json({ success: false, error: 'Фейк-режим уже запущен' });
  if (streamIsLive && !(req.body && req.body.force)) {
    return res.status(409).json({ success: false, needConfirm: true, error: 'Сейчас идёт настоящий стрим — фейк-данные заменят живые на оверлее в OBS' });
  }
  fakeStream.start({
    weightFor: timelineWeightFor,
    windowSec: () => ((config.widgetSettings && config.widgetSettings.timeline && config.widgetSettings.timeline.windowSec) || 60),
    onChat: (msg) => broadcastChat(msg), // только зеркало чата, в историю чата и озвучку не попадает
    onTick: () => broadcast(),
  });
  broadcast();
  res.json({ success: true, state: fakeStream.getState() });
});

app.post('/api/fake/stop', (req, res) => {
  fakeStream.stop();
  pendingEmoteDrops = [];
  broadcast(); // сразу возвращаем настоящие данные
  res.json({ success: true });
});

app.get('/api/fake/state', (req, res) => { res.json(fakeStream.getState()); });

/** Прогоняет записанную историю сессии ускоренно поверх оверлея, затем возвращает живые данные. */
/** Прогоняет записанную историю сессии ускоренно поверх оверлея по кругу, пока не остановят вручную. */
async function runReplay() {
  replayActive = true;
  sendToOverlay({ type: 'replay_start' });

  const frameDelayMs = 150;
  const loopPauseMs = 500; // короткая пауза перед тем, как начать проигрывать сначала
  const frames = sessionHistory.slice(); // снапшот истории на момент старта — во время воспроизведения запись истории приостановлена (см. replayActive-guard у setInterval выше), так что кадры не меняются посреди цикла
  const fullTimeline = timeline.getSnapshot({ lifetimeMs: timelineLifetimeMs() });
  const lifetimeMs = timelineLifetimeMs();
  const withAvatar = (e) => (e.username ? { ...e, avatarUrl: avatarCache[e.username.toLowerCase()] || null } : e);
  const categorySnapshot = categories.getSnapshot();

  while (replayActive) {
    for (const frame of frames) {
      if (!replayActive) break; // остановили вручную через /api/replay/stop
      sendToOverlay({
        type: 'replay_frame',
        topChatters: frame.topChatters,
        topEmotes: frame.topEmotes,
        wordCloud: frame.wordCloud || [], // старые записи истории (до этого обновления) могут не иметь этого поля
        timeline: {
          startedAt: fullTimeline.startedAt,
          linePoints: fullTimeline.linePoints.filter((p) => p.ts <= frame.ts),
          // Кружки, которые «жили» в момент этого кадра: ровно окно lifetimeMs до frame.ts. Так в повторе видно облако,
          // плывущее вдоль стрима — кружки появляются на своём времени и пропадают через lifetimeMs стримового времени.
          recentEvents: timeline.getBubbleEventsInRange(frame.ts - lifetimeMs, frame.ts).map(withAvatar),
          replayTs: frame.ts, // «текущее время» кадра: от него клиент считает возраст кружков и часы стрима
        },
        category: categorySnapshot,
      });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, frameDelayMs));
    }
    if (replayActive) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, loopPauseMs));
    }
  }

  sendToOverlay({ type: 'replay_end' });
  replayActive = false;
  broadcast(); // возвращаемся к живым данным сразу после показа
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, verifyClient: (info) => netGuard.wsAllowed(info.req, config) });

const overlayClients = new Set();
const adminClients = new Set();
const chatClients = new Set();
const teamClients = { left: new Set(), right: new Set() }; // отдельные зеркала team-left.html / team-right.html
const mvpClients = new Set(); // mvp.html
const factClients = new Set(); // fact.html
const fundClients = new Set(); // fund.html
const fundAlertClients = new Set(); // fund-alert.html
const fundBoxClients = new Set(); // fund-box.html
const goalClients = new Set(); // goal.html (цель сбора)
const timerClients = new Set(); // timer.html
const backgroundClients = new Set(); // background.html
const bracketClients = new Set(); // bracket.html

function getAdminStatusPayload() {
  return {
    type: 'status',
    chatBot: chatBot.getStatus(),
    overlayOnline: [...overlayClients].some((c) => c.view !== 'preview'), // предпросмотр в админке не считается
    twitch: {
      connected: twitchAuthState.connected,
      validatedAt: twitchAuthState.validatedAt,
      error: twitchAuthState.error,
      clientIdMasked: maskClientId(config.twitch.clientId),
      hasSecret: !!config.twitch.clientSecret,
      credentialsSource: CREDENTIALS_FROM_ENV ? 'env' : 'config',
      oauth: getOauthStatusPayload(),
    },
    channel: config.channel,
    streamLive: streamIsLive,
    widgetSettings: config.widgetSettings,
    donations: {
      donateX: {
        connected: donationCredentials.get().donateX.connected,
        available: donateX.isAvailable(),
      },
      donatePay: {
        connected: !!donationCredentials.get().donatePay.connected,
        userName: donatePay.info().userName || '',
        lastError: donatePay.info().lastError || '',
        remembered: authCredentials.isRemembered('donatePay'),
      },
      donationAlerts: {
        connected: donationCredentials.get().donationAlerts.connected,
        userName: donationCredentials.get().donationAlerts.userName,
        hasCredentials: !!(donationCredentials.get().donationAlerts.clientId && donationCredentials.get().donationAlerts.clientSecret),
      },
    },
    // лёгкая копия топ-чаттеров — только для живого превью на вкладке "Виджеты оверлея",
    // без полного снапшота оверлея
    topChatters: stats.getTopChatters(TOP_CHATTERS_COUNT, avatarCache),
  };
}

function broadcastAdminStatus() {
  const payload = JSON.stringify(getAdminStatusPayload());
  adminClients.forEach((ws) => { if (ws.readyState === ws.OPEN) ws.send(payload); });
}

chatBot.setOnStatusChange(() => { if (adminClients.size > 0) broadcastAdminStatus(); });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  ws.isObs = /\bOBS\//.test(String(req.headers['user-agent'] || '')); // браузер-источник OBS добавляет «OBS/версия» в User-Agent — для статуса «Открыт в OBS»
  const clientType = url.searchParams.get('type');

  if (clientType === 'admin') {
    if (!netGuard.isLoopback(req.socket.remoteAddress)) { ws.close(1008, 'admin only on this PC'); return; }
    adminClients.add(ws);
    ws.send(JSON.stringify(getAdminStatusPayload()));
    ws.on('close', () => adminClients.delete(ws));
  } else if (clientType === 'chat') {
    ws.view = url.searchParams.get('view') || ''; // '' — виджет чата в OBS, 'admin' — зеркало в админке, 'pixel' — пиксельные аватары
    chatClients.add(ws);
    ws.send(JSON.stringify({ type: 'chat_history', messages: chatHistory, settings: config.chatSettings }));
    ws.send(JSON.stringify({ type: 'pixel_heroes', ...pixelHeroes.getPayload() })); // страница пиксельного алерта (она тоже слушает чат) получает, каких героев показать
    ws.on('close', () => chatClients.delete(ws));
  } else if (clientType === 'team') {
    const side = url.searchParams.get('side') === 'right' ? 'right' : 'left';
    teamClients[side].add(ws);
    ws.send(JSON.stringify({ type: 'team_data', side, team: teamData.getSide(side), settings: applyThemeOverlayToSettings('teamCards', teamData.getSettings()) })); // тема ивента применяется и при подключении (раньше — только при следующей рассылке, из-за чего её приходилось «прокликивать»)
    ws.on('close', () => teamClients[side].delete(ws));
  } else if (clientType === 'mvp') {
    mvpClients.add(ws);
    ws.send(JSON.stringify({ type: 'mvp_data', mvp: applyThemeOverlay('mvp', mvpData.get()) }));
    ws.on('close', () => mvpClients.delete(ws));
  } else if (clientType === 'fact') {
    factClients.add(ws);
    ws.send(JSON.stringify({ type: 'fact_data', fact: applyThemeOverlay('fact', factData.get()) }));
    ws.on('close', () => factClients.delete(ws));
  } else if (clientType === 'fund') {
    fundClients.add(ws);
    ws.send(JSON.stringify({ type: 'fund_data', fund: applyThemeOverlay('fund', fundData.get()) }));
    ws.on('close', () => fundClients.delete(ws));
  } else if (clientType === 'fundalert') {
    fundAlertClients.add(ws);
    ws.send(JSON.stringify({ type: 'fund_alert_data', alert: applyThemeOverlay('fundAlert', fundAlertData.get()) }));
    ws.on('close', () => fundAlertClients.delete(ws));
  } else if (clientType === 'fundbox') {
    fundBoxClients.add(ws);
    ws.send(JSON.stringify({ type: 'fund_box_state', state: fundBoxData.get(), denomination: fundBoxData.getCurrentDenomination(), boxSize: fundBoxData.getCurrentBoxSize() }));
    ws.on('close', () => fundBoxClients.delete(ws));
  } else if (clientType === 'goal') {
    goalClients.add(ws);
    ws.send(JSON.stringify({ type: 'goal_state', goal: goalData.get() }));
    ws.on('close', () => goalClients.delete(ws));
  } else if (clientType === 'timer') {
    timerClients.add(ws);
    ws.send(JSON.stringify({ type: 'timer_state', state: timerData.get() }));
    ws.on('close', () => timerClients.delete(ws));
  } else if (clientType === 'background') {
    backgroundClients.add(ws);
    ws.send(JSON.stringify({ type: 'background_data', background: backgroundData.get() }));
    ws.on('close', () => backgroundClients.delete(ws));
  } else if (clientType === 'bracket') {
    bracketClients.add(ws);
    ws.send(JSON.stringify({ type: 'bracket_data', bracket: bracketWithTheme() }));
    ws.on('close', () => bracketClients.delete(ws));
  } else {
    ws.w = (url.searchParams.get('w') || '').replace(/[^a-z]/g, '');
    ws.view = url.searchParams.get('view') || ''; // '' — основной оверлей, 'alerts' — отдельный источник алертов, 'preview' — предпросмотр в админке
    ws.kind = url.searchParams.get('kind') || (ws.view === 'alerts' ? 'donation' : ''); // для view=alerts: источник одного вида алертов (donation, sub, raid, follow, hype, points, streak, nowplaying); пусто — все алерты вместе
    overlayClients.add(ws);
    ws.send(JSON.stringify(buildSnapshot()));
    if (ws.view !== 'preview' && ws.view && !(ws.view === 'alerts' && ws.kind && ws.kind !== 'nowplaying')) { try { ws.send(JSON.stringify(nowPlayingPayload())); } catch (e) { /* не критично */ } }
    ws.on('close', () => { overlayClients.delete(ws); broadcastAdminStatus(); });
    broadcastAdminStatus(); // новый оверлей-клиент — статус в админке меняется на "онлайн"
  }
});

function broadcast() {
  const payload = JSON.stringify(buildSnapshot());
  overlayClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  });
}

/** Шлёт произвольное сообщение (не полный снапшот) всем оверлей-клиентам — используется для TTS-аудио и сигнала "остановить". */
function sendToOverlay(payload) {
  const json = JSON.stringify(payload);
  const isAlert = payload && (payload.type === 'donation_alert' || payload.type === 'donation_alert_skip');
  overlayClients.forEach((ws) => {
    if (ws.readyState !== ws.OPEN) return;
    if (ws.view === 'preview') return;                                  // предпросмотр в админке получает только снапшоты (тему)
    if (ws.view === 'alerts' && !isAlert) return;                       // источник «только алерты» не играет озвучку чата и т.п.
    if (ws.view === 'alerts' && ws.kind && payload.type === 'donation_alert' && ((payload.card && payload.card.eventKind) || 'donation') !== ws.kind) return;   // отдельный источник одного вида
    if (!ws.view && isAlert) return;                                    // основной оверлей не показывает алерты — у каждого вида свой источник
    ws.send(json);
  });
}

/** Шлёт новое сообщение чата всем зеркалам (вкладка "Чат" в админке, виджет OBS). */
function broadcastChat(chatMsg) {
  const json = JSON.stringify({ type: 'chat', ...chatMsg });
  chatClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт свежие данные одной команды только её собственным зеркалам (team-left.html / team-right.html). */
/** То же самое, что applyThemeOverlay(), но когда под рукой не единый dataObj с .settings, а сам settings-объект отдельно (так устроена рассылка команд — team и settings разделены). */
function applyThemeOverlayToSettings(widgetKey, settings) {
  const overlay = eventTheme.getOverlayFor(widgetKey);
  if (!overlay) return settings;
  return { ...settings, ...overlay };
}

function broadcastTeamUpdate(side) {
  const json = JSON.stringify({ type: 'team_data', side, team: teamData.getSide(side), settings: applyThemeOverlayToSettings('teamCards', teamData.getSettings()) });
  teamClients[side].forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Накладывает тему ивента поверх .settings объекта виджета — НЕ мутирует исходный объект (локальные настройки на диске не трогаются), просто возвращает новую копию для рассылки. Если у виджета не стоит галочка в теме — возвращает dataObj как есть. */
function applyThemeOverlay(widgetKey, dataObj) {
  const overlay = eventTheme.getOverlayFor(widgetKey);
  if (!overlay) return dataObj;
  return { ...dataObj, settings: { ...dataObj.settings, ...overlay } };
}

/** Шлёт свежие данные MVP-карточки на mvp.html. */
function broadcastMvpUpdate() {
  const json = JSON.stringify({ type: 'mvp_data', mvp: applyThemeOverlay('mvp', mvpData.get()) });
  mvpClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт свежие данные панели "Факт / Инфо-панель" на fact.html. */
function broadcastFactUpdate() {
  const json = JSON.stringify({ type: 'fact_data', fact: applyThemeOverlay('fact', factData.get()) });
  factClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт свежие данные плашки "Сбор" на fund.html. */
function broadcastFundUpdate() {
  const json = JSON.stringify({ type: 'fund_data', fund: applyThemeOverlay('fund', fundData.get()) });
  fundClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт состояние «Цели сбора» на goal.html. extra: { added, reached } — при донате (по ним оверлей рисует «+N ₽» и финал) либо { kind } для теста. */
function broadcastGoal(extra, type) {
  const json = JSON.stringify({ type: type || 'goal_state', goal: goalData.get(), ...(extra || {}) });
  goalClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт текущее состояние алерта доната на fund-alert.html. */
function broadcastFundAlertUpdate() {
  const json = JSON.stringify({ type: 'fund_alert_data', alert: applyThemeOverlay('fundAlert', fundAlertData.get()) });
  fundAlertClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт полное состояние "Коробочки сбора" (настройки/уровень) — при подключении или правке настроек. */
function broadcastFundBoxState() {
  const json = JSON.stringify({ type: 'fund_box_state', state: fundBoxData.get(), denomination: fundBoxData.getCurrentDenomination(), boxSize: fundBoxData.getCurrentBoxSize() });
  fundBoxClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт текущее состояние "Таймера" (виджет + собственный WS-канал админки для живого тика в её превью). */
function broadcastTimerUpdate() {
  const json = JSON.stringify({ type: 'timer_state', state: timerData.get() });
  timerClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

// Отсчёт "Таймера" ведёт сервер — раз в секунду, пока running. Виджет/админка только отображают
// присланное значение, поэтому у них не может "разъехаться" отсчёт между несколькими открытыми вкладками.
setInterval(() => {
  if (timerData.tick()) broadcastTimerUpdate();
}, 1000);

/** Шлёт последовательность событий (падение монеток/переполнение уровня) — для анимации на клиенте. */
function broadcastFundBoxEvents(events) {
  if (!events || events.length === 0) return;
  const json = JSON.stringify({ type: 'fund_box_events', events, state: fundBoxData.get(), denomination: fundBoxData.getCurrentDenomination(), boxSize: fundBoxData.getCurrentBoxSize() });
  fundBoxClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт текущий фон (тип/файл/настройки) на background.html. */
function broadcastBackgroundUpdate() {
  const json = JSON.stringify({ type: 'background_data', background: backgroundData.get() });
  backgroundClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт текущую турнирную сетку на bracket.html. */
/** Тема ивента (галочка "Турнирная сетка") накладывается отдельным полем themeOverlay, а не поверх самих данных — иначе имена полей темы (mode, teams и т.п. в теории могли бы) пересеклись бы со структурой сетки. Клиент сам решает: есть themeOverlay — берёт цвета/шрифты из него, нет — использует свои colorSettings. */
function bracketWithTheme() {
  return { ...bracketData.get(), themeOverlay: eventTheme.getOverlayFor('bracket') };
}

function broadcastBracketUpdate() {
  const json = JSON.stringify({ type: 'bracket_data', bracket: bracketWithTheme() });
  bracketClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Живое обновление настроек отображения чата — без переподключения зеркал. */
function broadcastChatSettings() {
  const json = JSON.stringify({ type: 'chat_settings', settings: config.chatSettings });
  chatClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

// Герои тех, кто молчит дольше IDLE_MS, уходят со сцены (проверка раз в 30 секунд).
setInterval(() => { if (pixelHeroes.prune()) broadcastPixelHeroes(); }, 30 * 1000).unref();
// расширение Twitch: раз в 2 секунды проверяем, не пора ли отправить свежий снимок (сам модуль следит за интервалом, изменениями и паузой после ошибок)
setInterval(() => { twitchExt.tick().catch((e) => console.warn('[Расширение Twitch]', e && e.message)); }, 2000).unref();
// Опыт за присутствие (каждые 10 минут тем, кто писал в последние 20) — проверка раз в минуту; сменился уровень — подпись над героем обновляется.
setInterval(() => { if (pixelHeroes.presenceTick().changed) broadcastPixelHeroes(); }, 60 * 1000).unref();
setInterval(() => { const r = awards.tick(); if (r.finished) console.log('[Награды] Событие завершено, награду получили: ' + r.granted); }, 5 * 1000).unref();

/** Команды чат-аватаров: «!аватар» и др. Выполняются после выдачи героя; ответ шлёт бот (если подключён). */
function runAvatarCommand(login, name, message) {
  let r = null;
  try { r = avatarCommands.handle({ login, name, message, pixel: pixelHeroes }); } catch (e) { console.warn('[Команды аватаров] Ошибка:', e.message); }
  if (!r) return;
  if (r.changed) broadcastPixelHeroes();
  if (r.play) broadcastPixelAction(r.play);
  if (r.reply) chatBot.say(r.reply).catch(() => {});
}

/** Открывает игроку случайный закрытый аватар и пишет об этом в чат (бот): какой аватар и какой командой на него сменить. Возвращает результат pixelHeroes.unlockRandom + текст. */
function unlockAvatarFor(login, name) {
  const r = pixelHeroes.unlockRandom(login, name);
  const user = name || login;
  let text;
  if (r.ok) text = String(pixelHeroes.getUnlock().text).replace(/\{user\}/gi, user).replace(/\{hero\}/gi, r.title).replace(/\{command\}/gi, avatarCommands.commandWord('choose')).slice(0, 500);
  else if (r.reason === 'none-left') text = `@${user}, у тебя уже открыты все закрытые аватары!`;
  else return { ...r, text: '' };   // 'login' и 'no-closed' (закрытых героев нет) — молча
  chatBot.say(text).catch(() => {});
  return { ...r, text };
}

/** Награда за баллы канала из EventSub (title награды совпал с настроенным в админке) — открыть аватар тому, кто её получил. */
const seenRewardKeys = new Map();   // защита от повторной доставки одного и того же события награды (id → время)
function unlockAvatarForReward(evt) {
  const title = evt.meta && evt.meta.reward;
  if (!pixelHeroes.matchesReward(title)) return;
  const login = String(evt.login || evt.username || '').toLowerCase();
  // одно получение награды = один аватар: повтор с тем же id (или без id — тот же ник в течение 3 с) игнорируется
  const t = Date.now(), key = evt.id ? 'id:' + evt.id : 'u:' + login;
  const prev = seenRewardKeys.get(key);
  if (prev !== undefined && (evt.id || t - prev < 3000)) { console.log(`[Аватары] Повтор события награды от ${evt.username} — пропущен.`); return; }
  seenRewardKeys.set(key, t);
  if (seenRewardKeys.size > 500) for (const [k, v] of seenRewardKeys) if (t - v > 10 * 60 * 1000) seenRewardKeys.delete(k);
  const r = unlockAvatarFor(login, evt.username);
  console.log(`[Аватары] Награда «${title}» от ${evt.username}: ` + (r.ok ? `открыт ${r.title}` : (r.reason === 'none-left' ? 'уже открыты все закрытые' : (r.reason === 'no-closed' ? 'закрытых аватаров нет (у всех стоит галочка «выдавать»)' : 'не удалось (ник)'))));
}

/** Герою чаттера — сыграть доп. анимацию: { login, kind, name } (страница выбирает кадры по manifest.extras героя). */
function broadcastPixelAction(play) {
  const json = JSON.stringify({ type: 'pixel_action', login: play.login, kind: play.kind, name: play.name });
  chatClients.forEach((ws) => { if (ws.readyState === ws.OPEN) ws.send(json); });
}

/** Какие герои сейчас на оверлее — странице пиксельного алерта (тем же каналом, что и чат; зеркала чата это сообщение игнорируют). */
function broadcastPixelHeroes() {
  const json = JSON.stringify({ type: 'pixel_heroes', ...pixelHeroes.getPayload() });
  chatClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

/** Шлёт новый донат всем открытым вкладкам админки (лента "Донатный хаб" обновляется сразу). */
function broadcastDonation(record) {
  const json = JSON.stringify({ type: 'donation', donation: record });
  adminClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(json);
  });
}

// ---------- Очередь алертов "Сбор" ----------
// Та же идея, что и в очереди озвучки чата (tts.js): при частых донатах
// подряд алерты складываются в очередь и показываются строго по одному,
// чтобы не перекрывать друг друга анимацией выезда.

const fundAlertQueue = [];
let fundAlertProcessing = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueFundAlert(text) {
  fundAlertQueue.push(text);
  processFundAlertQueue();
}

async function processFundAlertQueue() {
  if (fundAlertProcessing) return;
  fundAlertProcessing = true;
  while (fundAlertQueue.length > 0) {
    const text = fundAlertQueue.shift();
    fundAlertData.setVisible(text);
    broadcastFundAlertUpdate();
    const s = fundAlertData.get().settings;
    // Ждём: выезд + время показа + уезд + небольшой зазор перед следующим —
    // так следующий алерт не начнёт выезжать, пока этот ещё не скрылся.
    await sleep(s.animationDurationMs + s.displaySeconds * 1000 + s.animationDurationMs + 300);
    fundAlertData.setVisible(null);
    broadcastFundAlertUpdate();
    await sleep(150);
  }
  fundAlertProcessing = false;
}

/** Общий обработчик для донатов с любой платформы: сохраняет в историю, обновляет топ донатеров и рассылает в реальном времени. */
function handleDonation(donation) {
  const record = donations.addDonation(donation);
  try { telegramAnnounce.noteEvent('donation', { rub: currency.toRub(record.amount, record.currency).rub }); } catch (e) { /* счётчик необязателен */ }
  donorLeaderboard.addDonation(record);
  handleTimelineWeightedEvent({ type: 'donation', username: record.username, meta: { amount: record.amount, currency: record.currency, amountRub: currency.toRub(record.amount, record.currency).rub, message: record.message || '' } }); // зелёный прямоугольник с суммой на таймлайне
  broadcastDonation(record);
  fireDonationAlert(record);
  fundData.addAmount(record.amount); // плашка "Сбор" растёт от того же события, ничего в приёме донатов не меняем
  broadcastFundUpdate();
  enqueueFundAlert(fundAlertData.buildText(record.username, record.amount, fundData.get().currency));
  const goalRes = goalData.addAmount(record.amount); // «Цель сбора» (красная шкала) растёт от того же события
  if (goalRes.added > 0) broadcastGoal(goalRes);
  const boxEvents = fundBoxData.addDonationAmount(record.amount);
  broadcastFundBoxEvents(boxEvents);
  dirty = true; // виджет "Топ донатеров" на оверлее подхватит новую сумму на ближайшем снапшоте
}

setInterval(() => {
  if (replayActive) return; // во время воспроизведения истории живые тики не мешаются с кадрами
  if (dirty) { broadcast(); dirty = false; }
}, config.broadcastIntervalMs || 1000);

// холостой тик — двигает таймлайн/аватарки, даже если чат молчит
setInterval(() => {
  if (!replayActive) broadcast();
}, 5000);

// обновляет топ-чаттеров в живом превью на вкладке "Виджеты оверлея", если админка открыта
setInterval(() => {
  if (adminClients.size > 0) broadcastAdminStatus();
}, 2000);

const port = config.port || 3001;
server.listen(port, netGuard.listenHost(config), () => {
  try { if (config.eventAlerts.nowplaying.enabled) nowPlaying.start(() => broadcastNowPlaying(false)); } catch (e) { console.log('[Сейчас играет] не запустилось:', e.message); }
  console.log(`\nOverdeck запущен: http://localhost:${port}` + (config.allowLan ? '  (виджеты доступны из локальной сети)' : ''));
  console.log(`Оверлей (OBS Browser Source): http://localhost:${port}/overlay.html  (1920x1080)`);
  console.log(`Панель управления: http://localhost:${port}/admin`);
  console.log('Остановить сервер — закрой это окно или нажми Ctrl+C.\n');
});
