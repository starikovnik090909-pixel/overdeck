// auctionBridge.js — награда «Аукцион»: зритель активирует одну награду за баллы канала и пишет название лота, а Overdeck считает его взнос
// (подписка + VIP + уровень аватара) и отправляет в PointAuc (pointauc.com). Награда открыта только пока аукцион идёт; один взнос на человека за аукцион.
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'auction_bridge.json');
const POINTAUC_URL = process.env.POINTAUC_URL || 'https://pointauc.com/api/oshino/bids';
const MAX_LOG = 60;
const DEFAULTS = {
  token: '',                 // личный токен PointAuc (pointauc.com/settings → «Personal Token»); наружу не отдаётся
  rewardTitle: 'Аукцион', rewardCost: 100, rewardId: '',
  subBonus: 130, vipBonus: 400,
  perLevel: 10, levelStep: 5, levelCap: 500,   // уровень N стоит perLevel + levelStep × (N − 1), но не больше levelCap: 1-й — 10, 2-й — 15, 3-й — 20 … 99-й — 500
  chatReply: true,
};
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function clean(s, prev) {
  const o = { ...prev };
  if (typeof s.token === 'string') o.token = s.token.trim().slice(0, 300);
  if (typeof s.rewardTitle === 'string' && s.rewardTitle.trim()) o.rewardTitle = cleanText(s.rewardTitle, 45);
  if (s.rewardCost !== undefined) o.rewardCost = num(s.rewardCost, 1, 10000000, prev.rewardCost);
  if (s.subBonus !== undefined) o.subBonus = num(s.subBonus, 0, 1000000, prev.subBonus);
  if (s.vipBonus !== undefined) o.vipBonus = num(s.vipBonus, 0, 1000000, prev.vipBonus);
  if (s.perLevel !== undefined) o.perLevel = num(s.perLevel, 0, 100000, prev.perLevel);
  if (s.levelStep !== undefined) o.levelStep = num(s.levelStep, 0, 100000, prev.levelStep);
  if (s.levelCap !== undefined) o.levelCap = num(s.levelCap, 0, 10000000, prev.levelCap);
  if (typeof s.chatReply === 'boolean') o.chatReply = s.chatReply;
  return o;
}

/**
 * deps.file — файл настроек (null — не сохранять, тесты); deps.now; deps.getProfile(login) → { level, flags:{sub,vip} } | null;
 * deps.send(bid, token) → Promise (отправка в PointAuc; по умолчанию fetch); deps.cancel(rewardId, redemptionId) / deps.fulfil(...) — вернуть баллы / отметить выполненной.
 */
function createAuctionBridge(deps = {}) {
  const file = deps.file === undefined ? FILE : deps.file;
  const now = deps.now || (() => Date.now());
  const getProfile = deps.getProfile || (() => null);
  const send = deps.send || defaultSend;
  const cancel = deps.cancel || (async () => false), fulfil = deps.fulfil || (async () => false);
  let settings = { ...DEFAULTS };
  let session = null;                    // { id, startedAt, contributors: { login: { amount, lot, at } } } — идущий аукцион
  let log = [];
  let last = null;                       // последний закончившийся аукцион — в нём стример отмечает победившие лоты
  const onContribution = deps.onContribution || (() => {}), onWin = deps.onWin || (() => null);
  try { const raw = JSON.parse(fs.readFileSync(file, 'utf8')); if (raw.settings) settings = clean(raw.settings, settings); if (Array.isArray(raw.log)) log = raw.log.slice(0, MAX_LOG); if (raw.session && raw.session.id) session = raw.session; if (raw.last && raw.last.id) last = raw.last; } catch (e) { /* первый запуск */ }
  function save() { if (!file) return; try { fs.writeFileSync(file + '.tmp', JSON.stringify({ settings, session, last, log })); fs.renameSync(file + '.tmp', file); } catch (e) { console.warn('[Аукцион] Не удалось сохранить:', e.message); } }
  function note(e) { log.unshift({ at: now(), ...e }); if (log.length > MAX_LOG) log.length = MAX_LOG; }

  /** Цена уровня в аукционе: 1-й — perLevel, каждый следующий дороже на levelStep, потолок levelCap (уровень 0 — 0). */
  const levelValue = (level) => (level >= 1 ? Math.min(settings.levelCap, settings.perLevel + settings.levelStep * (level - 1)) : 0);

  /** Взнос зрителя: подписка + VIP + цена уровня (см. levelValue). */
  function compute(p) {
    const flags = (p && p.flags) || {}, level = Math.max(0, (p && p.level) | 0);
    const sub = flags.sub === true, vip = flags.vip === true;
    const levelBonus = levelValue(level);
    const subPart = sub ? settings.subBonus : 0, vipPart = vip ? settings.vipBonus : 0;
    return { sub, vip, level, subPart, vipPart, levelBonus, total: subPart + vipPart + levelBonus };
  }

  /** Событие «награда активирована». Возвращает { handled:false } для чужих наград, иначе { handled:true, status:'sent'|'closed'|'duplicate'|'empty'|'error', ... }. */
  async function onRedeem(e) {
    const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    const mine = (settings.rewardId && e.rewardId === settings.rewardId) || (!settings.rewardId && same(e.reward, settings.rewardTitle));
    if (!mine) return { handled: false };
    const login = String(e.login || '').toLowerCase(), name = e.name || login;
    const back = async (status, text) => { try { await cancel(e.rewardId, e.redemptionId); } catch (x) { /* вернуть баллы не вышло — награда останется в очереди Twitch */ } note({ login, name, status, text }); save(); return { handled: true, status, text, refunded: true }; };
    if (!session) return back('closed', 'Аукцион сейчас не идёт.');
    if (session.contributors[login]) return back('duplicate', 'Взнос в этот аукцион уже внесён.');
    const c = compute(getProfile(login));
    if (c.total <= 0) return back('empty', 'Взносу нечего считать: нет подписки, VIP и уровня аватара.');
    const lot = cleanText(e.input, 100) || ('Лот от ' + name);
    // сразу занимаем место: второй клик, пришедший во время отправки, не должен пройти
    session.contributors[login] = { amount: c.total, lot, at: now(), pending: true };
    try {
      await send({ id: 'od-' + (e.redemptionId || session.id + '-' + login), username: name, cost: c.total, message: lot, investorId: login, isDonation: false }, settings.token);
    } catch (err) {
      delete session.contributors[login];
      note({ login, name, status: 'error', text: 'PointAuc не принял ставку: ' + err.message }); save();
      try { await cancel(e.rewardId, e.redemptionId); } catch (x) { /* см. выше */ }
      return { handled: true, status: 'error', text: err.message, refunded: true };
    }
    session.contributors[login].pending = false;
    try { onContribution(login, name); } catch (x) { /* достижение не должно ломать взнос */ }
    note({ login, name, status: 'sent', amount: c.total, lot, parts: { sub: c.subPart, vip: c.vipPart, level: c.levelBonus, lvl: c.level } }); save();
    try { await fulfil(e.rewardId, e.redemptionId); } catch (x) { /* не критично */ }
    return { handled: true, status: 'sent', amount: c.total, lot, calc: c, name };
  }

  return {
    compute, onRedeem, levelValue,
    /** Правило цены уровня для расширения Twitch: [первый уровень, шаг, потолок]; null — взнос не настроен (нет токена PointAuc), расширение ничего не показывает. */
    levelRule: () => (settings.token ? [settings.perLevel, settings.levelStep, settings.levelCap] : null),
    getSettings: () => ({ ...settings, token: undefined, hasToken: !!settings.token, tokenPreview: settings.token ? '…' + settings.token.slice(-4) : '' }),
    setSettings(s) { settings = clean(s || {}, settings); save(); },
    setRewardId(id) { settings.rewardId = String(id || ''); save(); },
    isActive: () => !!session,
    start() { if (session) return { ok: false, error: 'Аукцион уже идёт.' }; session = { id: String(now()), startedAt: now(), contributors: {} }; save(); return { ok: true }; },
    stop() { if (!session) return { ok: false, error: 'Аукцион не идёт.' }; const s = session; session = null; last = s; save(); const list = Object.values(s.contributors); return { ok: true, count: list.length, total: list.reduce((a, c) => a + c.amount, 0) }; },
    state() {
      const list = session ? Object.entries(session.contributors).map(([login, c]) => ({ login, amount: c.amount, lot: c.lot, at: c.at })).sort((a, b) => b.at - a.at) : [];
      const src = session || last;   // отметка победивших лотов — в идущем аукционе или (если не идёт) в последнем законченном
      const marks = src ? Object.entries(src.contributors).filter(([, c]) => !c.pending).map(([login, c]) => ({ login, lot: c.lot, amount: c.amount, won: !!c.won })).sort((a, b) => b.amount - a.amount) : [];
      return { active: !!session, markable: marks, markOf: src ? (session ? 'current' : 'last') : '', startedAt: session ? session.startedAt : 0, contributors: list, total: list.reduce((a, c) => a + c.amount, 0), log: log.slice(0, 30) };
    },
    /** Отметить (won=true) или снять отметку «лот победил» у взноса зрителя — в идущем аукционе или в последнем законченном. { ok, lot, wins } */
    markWin(login, won) {
      const src = session || last, key = String(login || '').toLowerCase();
      const c = src && src.contributors[key];
      if (!c || c.pending) return { ok: false, error: 'Такого взноса нет.' };
      if (!!c.won === !!won) return { ok: true, lot: c.lot, same: true, wins: null };
      c.won = !!won; save();
      const r = onWin(key, won ? 1 : -1, c);
      return { ok: true, lot: c.lot, wins: r ? r.value : null };
    },
    /** Расчёт для проверки в админке: «а сколько внесёт такой зритель». */
    preview(p) { return compute(p); },
  };
}

/** Отправка ставки в PointAuc. Ошибки — понятным текстом. */
async function defaultSend(bid, token) {
  if (!token) throw new Error('не указан токен PointAuc');
  const res = await fetch(POINTAUC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ bids: [bid] }), signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new Error('PointAuc не принял токен (проверь «Personal Token» на pointauc.com/settings)');
  if (!res.ok) throw new Error('PointAuc ответил ' + res.status);
  return res.json().catch(() => null);
}

module.exports = { createAuctionBridge, DEFAULTS, POINTAUC_URL };
