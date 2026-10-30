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
const selfCheck = require('./selfCheck');
const backupAuto = require('./backupAuto');
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
app.get('/api/backup/auto', (req, res) => res.json({ list: backupAuto.list() }));
app.post('/api/backup/auto', (req, res) => { try { res.json({ success: true, ...backupAuto.run(require('./package.json').version), list: backupAuto.list() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
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

require('./routes/chronicles').source({ express, chronicles, app });

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

require('./routes/chatbot').part6({ chatBot, app });

// ---------- REST API: конструктор команд чат-бота ("!команда" → ответ) ----------

require('./routes/chatbot').part5({ botCommands, app });

// ---------- REST API: команды чат-аватаров («!аватар» → случайный герой, «!прыжок»…) ----------

app.get('/api/avatar-commands', (req, res) => {
  res.json({ success: true, ...avatarCommands.getState(), actions: avatarCommands.getActions(), chatters: pixelHeroes.getSettings().chatters, unlock: pixelHeroes.getUnlock() });
});

require('./routes/pixel').part3({ pixelHeroes, chatBot, app, unlockAvatarFor });

require('./routes/chatbot').part4({ avatarCommands, app });

// ---------- REST API: сообщения чат-бота по таймеру (раз в 15–60 минут) ----------

function botTimersPayload() {
  return { timers: botTimers.list(), settings: botTimers.getSettings(), limits: { minMinutes: botTimers.INTERVAL_MIN, maxMinutes: botTimers.INTERVAL_MAX, maxLength: botTimers.TEXT_MAX_LENGTH } };
}

require('./routes/chatbot').part3({ chatBot, botTimers, app, botTimersPayload });

// ---------- REST API: автомодерация (список запрещённых слов) ----------
// Сам список отдаётся ТОЛЬКО этим запросом — его использует модальное окно «Автомодерация»; в остальные ответы (статус бота и т.п.) слова не попадают.

require('./routes/chatbot').part2({ autoMod, app });

require('./routes/chatbot').main({ chatBot, app });

// ---------- REST API: "Настройки админки" — темы оформления самой панели ----------

require('./routes/themes').part4({ themes, adminThemes, app });

require('./routes/misc').part3({ tabLock, app });

require('./routes/misc').part2({ helpTexts, app });

// ---------- REST API: "Панель команды" (вкладка "Ивент") ----------

function validSide(side) {
  return side === 'left' || side === 'right';
}

require('./routes/team').part3({ teamData, teamPresets, app, validSide, broadcastTeamUpdate });

// ---------- REST API: виджет "MVP матча" (заполняется вручную) ----------


const { chroniclesUpload } = require('./routes/chronicles').upload({ path, express, multer, chronicles, app });
require('./routes/telegram').main({ chronicles, telegramAnnounce, app });
require('./routes/chronicles').main({ fs, path, http, chronicles, polls, chatBot, telegramAnnounce, chrPublish, app, chroniclesUpload, getPollCredentials, pollErrorMessage });

require('./routes/team').part2({ mvpData, app, mvpUpload, broadcastMvpUpdate });

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

require('./routes/fund').part5({ fundData, currency, app, broadcastFundUpdate });

// ---------- REST API: «Цель сбора» (красная шкала с делениями, всегда на экране) ----------

require('./routes/fund').part4({ goalData, app, broadcastGoal });

// ---------- REST API: алерт о донате для плашки "Сбор" ----------

require('./routes/fund').part3({ fundData, fundAlertData, app, enqueueFundAlert });

// ---------- REST API: "Коробочка сбора" (внутри блока "Сбор") ----------

require('./routes/fund').part2({ fundBoxData, app });

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

require('./routes/polls').part4({ predictions, app, getPredictionCredentials });

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

require('./routes/polls').part3({ predictions, app, getPredictionCredentials });

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

require('./routes/polls').part2({ polls, app, getPollCredentials, pollErrorMessage });

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

require('./routes/polls').main({ polls, app, getPollCredentials, pollErrorMessage });

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

require('./routes/event').part2({ eventTheme, app, themeBackgroundUpload, deleteOldThemeBackgroundFile, rebroadcastAllThemedWidgets, validThemeWidget });

// ---------- REST API: обложка вкладки «Ивент» (только админка) ----------

require('./routes/event').main({ eventCover, app, eventCoverUpload, deleteOldEventCoverFile });

// ---------- REST API: герои пиксельного алерта «ЧатАватары» (карточки в админке, «Показать в оверлее») ----------

require('./routes/pixel').part2({ pixelHeroes, app, broadcastPixelHeroes });

// Топ чат-аватаров (вкладка «ЧатАватары»): по уровню, затем по опыту; в каждой записи — всё для профиля (ник, герой-аватар, уровень, опыт и длина шкалы).
// ---------- REST API: расширение Twitch (только админка; секрет наружу не отдаётся) ----------

require('./routes/misc').main({ twitchExt, config, app });


require('./routes/awards').main({ pixelHeroes, awards, app });

const withAwards = (p) => (p ? { ...p, awards: awards.awardsOf(p.login).map((id) => awards.getAward(id)).filter(Boolean).map((a) => ({ id: a.id, title: a.title, description: a.description, icon: a.icon })) } : p);
require('./routes/pixel').main({ twitch, pixelHeroes, app, withAwards, broadcastPixelHeroes });

require('./routes/fund').main({ fundBoxData, app, broadcastFundBoxState, broadcastFundBoxEvents });

// ---------- REST API: "Таймер" (обратный отсчёт мм:сс) ----------

require('./routes/timer').main({ timerData, app, broadcastTimerUpdate });

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

require('./routes/background').main({ backgroundData, app, backgroundUpload, scheduleBackgroundRotation, broadcastBackgroundUpdate });

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

require('./routes/team').main({ teamData, app, teamUpload, validSide, broadcastTeamUpdate });

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

require('./routes/donations').part6({ donations, donationCredentials, authCredentials, donateX, donatePay, donationAlerts, app });

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

require('./routes/donations').part5({ donations, app });

// ---------- Топ донатеров: сброс только топа за стрим + ручное добавление ----------

require('./routes/donations').part4({ donorLeaderboard, app, broadcast });

require('./routes/donations').part3({ donations, donationCredentials, authCredentials, currency, donateX, donatePay, handleDonatePayAuthError, app, broadcastAdminStatus, handleDonation });

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

require('./routes/donations').part2({ donations, donationCredentials, authCredentials, donationAlerts, app });

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

require('./routes/donations').main({ donations, donationCredentials, donationAlerts, app, broadcastAdminStatus });

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

require('./routes/themes').part3({ config, saveConfigToDisk, DEFAULT_THEME, app, sanitizeTheme, broadcast });

// ---------- REST API: готовые темы (блок "Темы" в Основных настройках) ----------

require('./routes/themes').part2({ timeline, widgets, widgetsPersistence, themes, config, saveConfigToDisk, DEFAULT_THEME, app, broadcast });

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
require('./routes/fonts').main({ customFonts, app, fontUpload, GOOGLE_FONT_WEIGHTS, broadcast });

// ---------- REST API: виджеты оверлея (позиция/размер/вкл-выкл) ----------

app.get('/api/widgets', (req, res) => {
  res.json({
    widgets: widgets.WIDGET_DEFS,
    layout: config.layout,
    defaults: widgets.DEFAULT_LAYOUT,
  });
});

require('./routes/widgets').part2({ widgets, widgetsPersistence, config, app, broadcast });

// ---------- REST API: стиль оформления виджетов оверлея ----------

require('./routes/themes').main({ overlayStyle, app, broadcast });

// ---------- REST API: настройки СОДЕРЖИМОГО виджетов (аватарки/ник/полоска и т.п.) ----------

require('./routes/widgets').main({ timeline, widgets, widgetsPersistence, config, app, broadcastAdminStatus, broadcast });

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
require('./routes/alerts').part7({ config, saveConfigToDisk, donationAlert, app, alertTexUpload, removeAlertTexture });
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
require('./routes/alerts').part6({ currency, config, saveConfigToDisk, donationAlert, fireDonationAlert, app, CUSTOM_KINDS, customUploads, removeCustomFile });
require('./routes/alerts').part5({ fs, path, config, saveConfigToDisk, eventAlerts, applyNowPlayingConfig, app, ALERT_CUSTOM_DIR, CUSTOM_KINDS, customUploads });
require('./routes/alerts').part4({ fs, path, express, config, nowPlaying, nowPlayingPayload, app });

/** Тест: показывает алерт события на оверлее (даже если событие выключено). */
app.post('/api/event-alerts/:kind/test', (req, res) => {
  const k = req.params.kind;
  if (!eventAlerts.KINDS.includes(k)) return res.status(404).json({ success: false, error: 'Неизвестное событие' });
  if (k === 'nowplaying') { nowPlaying.setDemo(25); broadcastNowPlaying(true); return res.json({ success: true }); }
  fireEventAlert(k, req.body || {}, true);
  res.json({ success: true });
});
/** Стена фолловеров: статистика и разовая подгрузка всех текущих фолловеров из Twitch (нужно право moderator:read:followers). */
require('./routes/alerts').part3({ config, followRegistry, app });
/** Карточка события для предпросмотра в админке (по сохранённым настройкам). */
require('./routes/alerts').part2({ config, eventAlerts, withWall, avatarUrlFor, raidExtras, app });
/** Библиотека звуков алертов: готовые (public/alert-sounds/manifest.json) + любые свои .ogg/.mp3/.wav, положенные в ту же папку. */
require('./routes/alerts').main({ fs, path, app });
app.post('/api/donation-alert/skip', (req, res) => { sendToOverlay({ type: 'donation_alert_skip' }); res.json({ success: true });});


// ---------- REST API: озвучка чата (Piper) ----------

require('./routes/tts').main({ tts, config, saveConfigToDisk, app, broadcast, sendToOverlay });

// ---------- REST API: настройки отображения чата ----------

require('./routes/chat-settings').main({ config, saveConfigToDisk, DEFAULT_CHAT_SETTINGS, app, broadcastChatSettings });

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
    selfCheck: selfCheck.get(), // тихие автопроверки: админка показывает плашку, только если есть проблемы
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
app.post('/api/selfcheck/run', async (req, res) => { try { const s = await selfCheck.runAll(port); broadcastAdminStatus(); res.json(s); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
server.listen(port, netGuard.listenHost(config), () => {
  try { if (config.eventAlerts.nowplaying.enabled) nowPlaying.start(() => broadcastNowPlaying(false)); } catch (e) { console.log('[Сейчас играет] не запустилось:', e.message); }
  console.log(`\nOverdeck запущен: http://localhost:${port}` + (config.allowLan ? '  (виджеты доступны из локальной сети)' : ''));
  console.log(`Оверлей (OBS Browser Source): http://localhost:${port}/overlay.html  (1920x1080)`);
  console.log(`Панель управления: http://localhost:${port}/admin`);
  console.log('Остановить сервер — закрой это окно или нажми Ctrl+C.\n');
  backupAuto.start(require('./package.json').version);
  selfCheck.start(port, () => { if (adminClients.size > 0) broadcastAdminStatus(); });
});
