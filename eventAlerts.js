'use strict';
// Алерты событий Twitch (EventSub): подписки (новая / продление / подарок), рейд, фоллоу, Hype Train, награды за баллы канала.
// Карточка и озвучка — те же, что у доната (donationAlert.js): внешний вид (тема, рамка, свет, шрифт, звуки, время) общий,
// здесь только то, что относится к самому событию: включено ли, озвучка, голос, цвет, тексты и фильтры.

const donationAlert = require('./donationAlert');
const gender = require('./gender');
const { plural, numberWords, cleanMessage } = donationAlert;

const KINDS = ['sub', 'raid', 'follow', 'hype', 'points', 'streak', 'nowplaying'];
const TIER_NAMES = { '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3', prime: 'Prime' };

const DEFAULTS = {
  sub: {
    enabled: true, showNew: true, showResub: true, showGift: true,
    style: 'ticket', showNumber: true, numberStart: 0, holdSec: 6,
    soundPre: 'tk-pre-1.ogg', soundFly: 'tk-fly-1.ogg', soundStamp: 'tk-stamp-1.ogg', soundTear: 'tk-tear-1.ogg',
    speak: true, voice: '', color: '#9146ff', soundVolume: 70, voiceVolume: 100,
    speechNew: '{user} оформил{а} подписку! Спасибо!',
    speechResub: '{user} продлил{а} подписку на {months} {monthsWord}!',
    speechGift: '{user} подарил{а} {count} {subsWord}! Спасибо!',
  },
  raid: {
    enabled: true, speak: true, voice: '', color: '#ff8a1f', minViewers: 1, voiceVolume: 100,
    style: 'radar', holdSec: 7, showGame: true, siren: true, soundVolume: 70,
    soundPing: 'rd-ping-1.ogg', soundTick: 'rd-tick-1.ogg', soundSiren: 'rd-siren-1.ogg', soundIn: 'tk-fly-3.ogg', soundDone: 'tk-pre-3.ogg',
    speech: 'К нам пришёл рейд от {user}: {viewers} {viewersWord}! Добро пожаловать!',
  },
  follow: {
    enabled: true, speak: false, voice: '', color: '#3ba7ff', soundVolume: 70, voiceVolume: 100,
    style: 'wall', holdSec: 7, soundStick: 'tk-stamp-3.ogg', soundFly: 'tk-fly-2.ogg',
    big: 'Добро пожаловать!', speech: '{user}, добро пожаловать на канал!',
  },
  hype: {
    enabled: true, speak: true, voice: '', color: '#ff5a1f', soundFly: 'power-up.ogg', soundLand: 'bell.ogg', soundVolume: 70, voiceVolume: 100,
    onBegin: true, onLevel: true, onEnd: true,
    speechBegin: 'Начался хайп-трейн!', speechLevel: 'Хайп-трейн, уровень {level}!', speechEnd: 'Хайп-трейн завершён на {level} уровне!',
  },
  points: {
    enabled: true, speak: true, voice: '', color: '#00c8a0', readMessage: true, minCost: 0, soundFly: 'power-up.ogg', soundLand: 'bell.ogg', soundVolume: 70, voiceVolume: 100,
    rewards: '',
    speech: '{user} получил{а} награду {reward}.',
  },
  nowplaying: { // «Сейчас играет»: закреплённая карточка с тем, что играет в браузере/плеере (nowPlaying.js)
    enabled: false, style: 'card', corner: 'bl', size: 100, showCover: true, showSource: true, showOthers: true, bgOpacity: 90, hideWhenPaused: false, hideDelaySec: 8, minDurationSec: 0, ignoreApps: '', color: '#a970ff',
  },
  streak: {
    style: 'pill', corner: 'bl', holdSec: 6, size: 100,
    enabled: true, speak: true, voice: '', color: '#a970ff', minStreak: 2, showPoints: true, soundFly: 'power-up.ogg', soundLand: 'bell.ogg', soundVolume: 70, voiceVolume: 100,
    speech: '{user} с нами уже {streak} {streamsWord} подряд!',
  },
};

const TEXT_MAX = 200;
const bool = (v, f) => (typeof v === 'boolean' ? v : f);
const str = (v, f, max) => (typeof v === 'string' ? v.slice(0, max || TEXT_MAX) : f);
const num = (v, a, b, f) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : f; };
const colorOf = (v, f) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : (v === '' ? '' : f));
const voiceOf = (v, f) => (typeof v === 'string' && (v === '' || /^[A-Za-z0-9_.:\-]{1,80}$/.test(v)) ? v : f);

/** Проверяет настройки одного события; недостающее берётся из base (или значений по умолчанию). */
function sanitizeKind(kind, raw, base) {
  const d = DEFAULTS[kind];
  if (!d) return null;
  const b = { ...d, ...(base || {}) };
  const r = raw || {};
  const out = {};
  Object.keys(d).forEach((k) => {
    const def = d[k];
    if (typeof def === 'boolean') out[k] = bool(r[k], b[k]);
    else if (k === 'color') out[k] = colorOf(r[k], b[k]);
    else if (k === 'voice') out[k] = voiceOf(r[k], b[k]);
    else if (k === 'style' && kind === 'nowplaying') out[k] = ['card', 'cols', 'mini', 'vbar', 'bigtime', 'corners'].includes(r[k]) ? r[k] : b[k];
    else if (k === 'style' && kind === 'streak') out[k] = ['pill', 'chat', 'ring', 'checkin', 'flip', 'glass'].includes(r[k]) ? r[k] : b[k];
    else if (k === 'corner') out[k] = ['bl', 'br', 'tl', 'tr'].includes(r[k]) ? r[k] : b[k];
    else if (k === 'size') out[k] = Math.round(num(r[k], 50, 200, b[k]));
    else if (k === 'style' && kind === 'raid') out[k] = ['radar', 'card', 'plain'].includes(r[k]) ? r[k] : b[k];
    else if (k === 'style') out[k] = (r[k] === 'card' || r[k] === 'ticket' || r[k] === 'wall' || r[k] === 'badge') && (kind === 'follow' ? r[k] !== 'ticket' : (r[k] !== 'wall' && r[k] !== 'badge')) ? r[k] : b[k];
    else if (/^sound(Pre|Fly|Land|Stamp|Tear|Stick|Ping|Tick|Siren|In|Done)$/.test(k)) out[k] = r[k] === '' ? '' : (typeof r[k] === 'string' && /^[A-Za-z0-9_.\- ]{1,80}\.(ogg|mp3|wav)$/i.test(r[k]) ? r[k] : b[k]);
    else if (k === 'soundVolume' || k === 'voiceVolume') out[k] = Math.round(num(r[k], 0, 100, b[k]));
    else if (k === 'holdSec') out[k] = Math.round(num(r[k], 3, 30, b[k]) * 10) / 10;
    else if (k === 'numberStart') out[k] = Math.round(num(r[k], 0, 10000000, b[k]));
    else if (k === 'minViewers') out[k] = Math.round(num(r[k], 0, 1000000, b[k]));
    else if (k === 'bgOpacity') out[k] = Math.round(num(r[k], 0, 100, b[k]));
    else if (k === 'hideDelaySec') out[k] = Math.round(num(r[k], 0, 600, b[k]));
    else if (k === 'minDurationSec') out[k] = Math.round(num(r[k], 0, 7200, b[k]));
    else if (k === 'minStreak') out[k] = Math.round(num(r[k], 0, 100000, b[k]));
    else if (k === 'minCost') out[k] = Math.round(num(r[k], 0, 100000000, b[k]));
    else if (k === 'rewards') out[k] = str(r[k], b[k], 3000);
    else out[k] = str(r[k], b[k]);
  });
  return out;
}

function sanitizeAll(raw, base) {
  const out = {};
  KINDS.forEach((k) => { out[k] = sanitizeKind(k, raw && raw[k], base && base[k]); });
  return out;
}

/** Подставляет {плейсхолдеры}; {а} превращается в «а» для женского ника. */
function fill(tpl, vars, fem) {
  return String(tpl || '').replace(/\{([^{}]+)\}/g, (m, k) => {
    if (k === 'а') return fem ? 'а' : '';
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
  }).replace(/\s+/g, ' ').trim();
}

function isFemale(nick, s) {
  if (!s || s.genderVerb === false) return false;
  return gender.resolve(nick, { genderDetect: true, genderUnknown: s.genderUnknown, genderOverrides: gender.parseOverrides(s.genderList) }) === 'f';
}

const monthsWord = (n) => plural(n, 'месяц', 'месяца', 'месяцев');
const subsWord = (n) => plural(n, 'подписку', 'подписки', 'подписок');
const subsWordNom = (n) => plural(n, 'подписка', 'подписки', 'подписок');
const streamsWord = (n) => plural(n, 'стрим', 'стрима', 'стримов');
const viewersWord = (n) => plural(n, 'зритель', 'зрителя', 'зрителей');
const ORD = ['', 'Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый', 'Шестой', 'Седьмой', 'Восьмой', 'Девятый', 'Десятый', 'Одиннадцатый', 'Двенадцатый'];
const monthLabel = (n) => (n <= 12 ? `${ORD[n]} месяц` : `${n} ${monthsWord(n)} с нами`);
const tierCode = (tier) => (String(tier) === '2000' ? 2 : String(tier) === '3000' ? 3 : 1);
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Список названий наград из настройки (по строке). */
function rewardList(text) {
  return String(text || '').split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

/** Нужно ли показывать событие вообще (включено, пороги, фильтры, фаза Hype Train). Возвращает true/false. */
function shouldShow(kind, data, cfg) {
  if (!cfg || !cfg.enabled) return false;
  const d = data || {};
  if (kind === 'sub') return d.type === 'resub' ? cfg.showResub : d.type === 'gift' ? cfg.showGift : cfg.showNew;
  if (kind === 'raid') return (Number(d.viewers) || 0) >= cfg.minViewers;
  if (kind === 'hype') return d.phase === 'end' ? cfg.onEnd : d.phase === 'level' ? cfg.onLevel : cfg.onBegin;
  if (kind === 'streak') return (Number(d.streak) || 0) >= cfg.minStreak;
  if (kind === 'points') {
    if ((Number(d.cost) || 0) < cfg.minCost) return false;
    const list = rewardList(cfg.rewards);
    return !list.length || list.includes(String(d.reward || '').trim().toLowerCase());
  }
  return true;
}

/**
 * Описание события для карточки и озвучки:
 * { kicker, nick, big, stat, message, speech, user }.
 * s — настройки доната (род по нику, длина сообщения).
 */
function describe(kind, data, cfg, s) {
  const d = data || {};
  const st = s || {};
  const maxLen = st.maxLength || 200;
  const user = String(d.username || 'Аноним').slice(0, 40);
  const fem = isFemale(d.username, st);
  const msg = kind === 'sub' ? '' : cleanMessage(d.message || d.input || '', maxLen);
  const readMsg = cfg.readMessage !== false;
  const say = (tpl, vars) => fill(tpl, { user, ...vars }, fem);
  let out;
  if (kind === 'sub') {
    const type = d.type === 'resub' || d.type === 'gift' ? d.type : 'new';
    const tier = TIER_NAMES[String(d.tier)] || String(d.tier || 'Tier 1');
    if (type === 'gift') {
      const count = Math.max(1, Math.round(Number(d.count) || 1));
      const who = d.anonymous ? 'Аноним' : user;
      out = { kicker: 'подарок подписки', nick: who, big: `${count} ${subsWordNom(count)}`, stat: tier, message: '',
        speech: fill(cfg.speechGift, { user: who, count: numberWords(count, true), subsWord: subsWord(count), tier }, d.anonymous ? false : fem) };
    } else if (type === 'resub') {
      const months = Math.max(1, Math.round(Number(d.months) || 1));
      const streak = Math.round(Number(d.streak) || 0);
      out = { kicker: 'продление подписки', nick: user, big: `${months} ${monthsWord(months)}`, stat: streak > 1 ? `${tier} · подряд ${streak} ${monthsWord(streak)}` : tier, message: msg,
        speech: say(cfg.speechResub, { months: numberWords(months), monthsWord: monthsWord(months), streak: numberWords(streak), tier }) };
    } else {
      out = { kicker: 'новая подписка', nick: user, big: tier, stat: '', message: msg, speech: say(cfg.speechNew, { tier }) };
    }
    if (readMsg && out.message) out.speech = (out.speech + ' ' + out.message).trim();
    // данные для билета-абонемента
    const months = type === 'new' ? 1 : Math.max(1, Math.round(Number(d.months) || 1));
    const count = Math.max(1, Math.round(Number(d.count) || 1));
    const no = cfg.showNumber !== false && type !== 'gift' && Number(d.no) > 0 ? Math.round(Number(d.no)) : 0;
    out.ticket = {
      type, nick: out.nick, tier: tierCode(d.tier), tierText: tier, months, count, no,
      label: type === 'gift' ? 'Подарок сообществу' : monthLabel(months),
      meta: type === 'gift' ? `${tier} · подарочные подписки` : `${tier} · ${type === 'resub' ? 'продление подписки' : 'новая подписка'}`,
      message: '',
      hold: Math.max(3, Math.min(30, Number(cfg.holdSec) || 6)),
      color: cfg.color || '',
      sounds: { pre: cfg.soundPre || '', fly: cfg.soundFly || '', stamp: cfg.soundStamp || '', tear: cfg.soundTear || '' },
    };
  } else if (kind === 'raid') {
    const v = Math.max(0, Math.round(Number(d.viewers) || 0));
    out = { kicker: 'рейд', nick: user, big: `${v} ${viewersWord(v)}`, stat: '', message: '',
      speech: say(cfg.speech, { viewers: numberWords(v), viewersWord: viewersWord(v) }) };
    const style = cfg.style === 'card' ? 'card' : cfg.style === 'radar' ? 'radar' : '';
    if (style) {
      // цвет по умолчанию (старый оранжевый) у радара заменяется зелёным; свой выбранный цвет работает у обоих видов
      const own = cfg.color && cfg.color !== '#ff8a1f';
      out.raid = { style, nick: user, viewers: v, avatar: typeof d.avatar === 'string' && /^https:\/\//.test(d.avatar) ? d.avatar : '',
        game: cfg.showGame === false ? '' : String(d.game || '').slice(0, 60), title: cfg.showGame === false ? '' : String(d.title || '').slice(0, 120),
        hold: Math.max(3, Math.min(30, Number(cfg.holdSec) || 7)), siren: cfg.siren !== false && style === 'radar', volume: Math.max(0, Math.min(100, Number(cfg.soundVolume) || 0)),
        soundPing: cfg.soundPing || '', soundTick: cfg.soundTick || '', soundSiren: cfg.soundSiren || '', soundIn: cfg.soundIn || '', soundDone: cfg.soundDone || '', color: own ? cfg.color : (style === 'radar' ? '#35e08a' : '#ff8a1f') };
    }
  } else if (kind === 'follow') {
    out = { kicker: 'новый фолловер', nick: user, big: cfg.big || 'Добро пожаловать!', stat: '', message: '', speech: say(cfg.speech, {}) };
    const w = d.wall || {};
    out.wall = { nick: user, no: Number(w.no) || 0, total: Number(w.total) || 0, date: w.date || '', recent: Array.isArray(w.recent) ? w.recent.slice(0, 20) : [],
      hold: Math.max(3, Math.min(30, Number(cfg.holdSec) || 7)), sound: cfg.soundStick || '', color: cfg.color || '' };
    out.badge = { nick: user, no: out.wall.no, total: out.wall.total, date: out.wall.date, avatar: typeof d.avatar === 'string' && /^https:\/\//.test(d.avatar) ? d.avatar : '', channel: String(d.channel || '').slice(0, 30),
      hold: out.wall.hold, soundFly: cfg.soundFly || '', soundStamp: cfg.soundStick || '', color: cfg.color || '' };
  } else if (kind === 'hype') {
    const level = Math.max(1, Math.round(Number(d.level) || 1));
    const total = Math.round(Number(d.total) || 0);
    const ph = d.phase === 'end' ? 'end' : d.phase === 'level' ? 'level' : 'begin';
    const tpl = ph === 'end' ? cfg.speechEnd : ph === 'level' ? cfg.speechLevel : cfg.speechBegin;
    out = { kicker: 'hype train', nick: ph === 'end' ? 'Хайп-трейн завершён' : ph === 'level' ? 'Новый уровень!' : 'Хайп-трейн начался!', big: `Уровень ${level}`,
      stat: total ? `Всего очков: ${total.toLocaleString('ru-RU')}` : '', message: '', speech: fill(tpl, { level: numberWords(level), points: numberWords(total) }, false) };
    out.user = 'Hype Train';
  } else if (kind === 'points') {
    const cost = Math.round(Number(d.cost) || 0);
    const reward = String(d.reward || 'Награда').slice(0, 80);
    out = { kicker: 'награда за баллы', nick: user, big: reward, stat: cost ? `${cost.toLocaleString('ru-RU')} баллов` : '', message: msg,
      speech: say(cfg.speech, { reward, cost: numberWords(cost) }) };
    if (readMsg && out.message) out.speech = (out.speech + ' ' + out.message).trim();
  } else if (kind === 'streak') {
    const n = Math.max(1, Math.round(Number(d.streak) || 1));
    const pts = Math.max(0, Math.round(Number(d.points) || 0));
    out = { kicker: 'серия просмотров', nick: user, big: `${n} ${streamsWord(n)} подряд`, stat: cfg.showPoints !== false && pts ? `+${pts.toLocaleString('ru-RU')} баллов канала` : '', message: '',
      speech: say(cfg.speech, { streak: numberWords(n), streamsWord: streamsWord(n), points: numberWords(pts) }) };
  } else return null;
  out.user = out.user || user;
  return out;
}

/** Карточка для оверлея (тот же формат, что у доната). */
function buildCard(kind, data, cfg, s) {
  const info = describe(kind, data, cfg, s);
  if (!info) return null;
  const base = donationAlert.buildCard({ username: info.nick, amount: 0, currency: 'RUB', message: info.message, platform: '' }, { ...s, showSource: false, donorStat: false, tiers: false, look: 'card' }, {});
  base.username = info.nick;
  base.amountText = info.big;
  base.message = info.message;
  base.tier = 0;
  base.tierLabel = info.kicker;
  base.stat = info.stat || '';
  base.source = '';
  base.color = cfg.color || s.cardColor || '';
  base.eventKind = kind;
  // громкости: звуки и озвучка у каждого события свои
  if (typeof cfg.soundVolume === 'number') base.soundVolume = cfg.soundVolume;
  if (typeof cfg.voiceVolume === 'number') base.volume = cfg.voiceVolume;
  // свои звуки подлёта/приземления карточки — у событий без собственного оформления звука (Hype Train, баллы, серия просмотров)
  if (kind === 'hype' || kind === 'points' || kind === 'streak') { base.soundFly = cfg.soundFly || ''; base.soundLand = cfg.soundLand || ''; }
  if (kind === 'streak') { // небольшая плашка в углу вместо большой карточки (public/donationalert.js → runToast)
    const n = Math.max(1, Math.round(Number(data.streak) || 1));
    base.toast = { style: cfg.style || 'pill', corner: cfg.corner || 'bl', size: cfg.size || 100, hold: cfg.holdSec || 6, color: cfg.color || '#a970ff',
      nick: info.nick, n, word: streamsWord(n), points: cfg.showPoints !== false ? Math.max(0, Math.round(Number(data.points) || 0)) : 0 };
  }
  if (kind === 'sub' && cfg.style === 'ticket' && info.ticket) base.ticket = info.ticket;
  if (kind === 'follow' && cfg.style === 'wall' && info.wall) base.wall = info.wall;
  if (kind === 'follow' && cfg.style === 'badge' && info.badge) base.badge = info.badge;
  if (kind === 'raid' && info.raid) base.raid = info.raid;
  // при выборе рамки «по уровню доната» событиям достаётся спокойная «Бегущий свет»
  base.frame = s.frame === 'tier' ? 'flow' : (s.frame || '');
  return { card: base, speech: info.speech, message: info.message };
}

module.exports = { monthLabel, KINDS, DEFAULTS, TIER_NAMES, sanitizeKind, sanitizeAll, shouldShow, describe, buildCard, fill, rewardList };
