// bosses.js — боссы чат-аватаров: каталог, вызов вручную и по случайному таймеру, итоги и награды.
// Бой считает bossEngine (автоматически, D&D). Модуль ничего не рассылает сам: summon() возвращает { event, announce, finish }.
// Участники — все, кто сейчас на сцене (роster из pixelHeroes), до MAX_HEROES. Награда опытом — только за победу: выжившим полная,
// выбывшим 60 %, MVP (больше всех урона) +50 %, добившему +25. Награда-предмет с монстра пока не реализована (reward: null).
// Хранение: boss_data.json (в .gitignore): { settings, bosses, log }.
const fs = require('fs');
const path = require('path');
const { runBoss, bossStats, ABILITIES, BOSS_DEFAULT } = require('./bossEngine');

const FILE = path.join(__dirname, 'boss_data.json');
const MAX_HEROES = 40, MAX_BOSSES = 12, MAX_LOG = 20;
const TIMING = { runInMs: 4000, roundMs: 1900, endMs: 4500 };
const SETTINGS_DEFAULT = { random: false, minMinutes: 30, maxMinutes: 90, minViewers: 3, announce: true };
const ID_RE = /^[a-z0-9_-]{1,40}$/;
const clean = (s, n) => String(s == null ? '' : s).replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, n);
const num = (v, lo, hi, def) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def; };

function defaultBosses() { return [{ id: 'golem', name: 'Лесной голем', pack: 'demon1', enabled: true, hpPerPlayer: 50, ac: 13, hit: 5, dmgDie: 8, dmgBonus: 3, attackEvery: 4, scaleByLevel: true, abilities: [], xp: 60, reward: null }]; }

/** Приводит присланное из админки к допустимому виду. { ok, boss?, error? } */
function validBoss(b, knownPack) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Нет данных босса.' };
  const name = clean(b.name, 40); if (!name) return { ok: false, error: 'Укажи имя босса.' };
  const id = String(b.id || '').toLowerCase(); if (!ID_RE.test(id)) return { ok: false, error: 'Неверный код босса.' };
  const pack = String(b.pack || ''); if (!pack || (knownPack && !knownPack(pack))) return { ok: false, error: 'Выбери героя-внешность для босса.' };
  const ab = Array.isArray(b.abilities) ? [...new Set(b.abilities.filter((a) => ABILITIES[a]))] : [];
  return { ok: true, boss: { id, name, pack, enabled: b.enabled !== false, hpPerPlayer: num(b.hpPerPlayer, 5, 500, 50), ac: Math.round(num(b.ac, 5, 25, 13)), hit: Math.round(num(b.hit, 0, 15, 5)),
    dmgDie: [4, 6, 8, 10, 12, 20].includes(Number(b.dmgDie)) ? Number(b.dmgDie) : 8, dmgBonus: Math.round(num(b.dmgBonus, 0, 15, 3)), attackEvery: Math.round(num(b.attackEvery, 1, 20, 4)),
    scaleByLevel: b.scaleByLevel !== false, abilities: ab, xp: Math.round(num(b.xp, 0, 1000, 60)), reward: null } };
}

function createBosses(deps = {}) {
  const file = deps.file === undefined ? FILE : deps.file;
  const now = deps.now || (() => Date.now());
  const rand = deps.random || Math.random;
  const roster = deps.roster || (() => []);                 // () → [{ login, name, level }] — кто на сцене
  const bonusXp = deps.bonusXp || (() => {});
  const knownPack = deps.knownPack || null;
  let settings = { ...SETTINGS_DEFAULT }, bosses = defaultBosses(), log = [];
  let busyUntil = 0, nextAt = 0, current = null, seq = 0;

  try { const raw = JSON.parse(fs.readFileSync(file, 'utf8')); if (raw.settings) settings = { ...settings, ...cleanSettings(raw.settings) };
    if (Array.isArray(raw.bosses) && raw.bosses.length) { const ok = raw.bosses.map((b) => validBoss(b, null)).filter((r) => r.ok).map((r) => r.boss); if (ok.length) bosses = ok; }
    if (Array.isArray(raw.log)) log = raw.log.slice(0, MAX_LOG); } catch (e) { /* первый запуск */ }
  function cleanSettings(s) { return { random: !!s.random, minMinutes: Math.round(num(s.minMinutes, 5, 600, 30)), maxMinutes: Math.round(num(s.maxMinutes, 5, 1200, 90)), minViewers: Math.round(num(s.minViewers, 1, MAX_HEROES, 3)), announce: s.announce !== false }; }
  function save() { if (!file) return; try { fs.writeFileSync(file + '.tmp', JSON.stringify({ settings, bosses, log })); fs.renameSync(file + '.tmp', file); } catch (e) { console.warn('[Боссы] Не удалось сохранить:', e.message); } }
  const scheduleNext = () => { const lo = settings.minMinutes, hi = Math.max(lo, settings.maxMinutes); nextAt = now() + (lo + rand() * (hi - lo)) * 60000; };

  /** Запуск боя. who — кто вызвал (ник или 'random'/'admin'). { ok, error? } или { ok, event, announce, finish() }. */
  function summon(id, who) {
    if (now() < busyUntil) return { ok: false, error: 'Бой с боссом уже идёт.' };
    const pool = bosses.filter((b) => b.enabled);
    const def = id && id !== 'random' ? bosses.find((b) => b.id === id) : pool[Math.floor(rand() * pool.length)];
    if (!def) return { ok: false, error: 'Нет доступных боссов.' };
    let list = roster().filter((h) => h && h.login).map((h) => ({ login: h.login, name: h.name || h.login, level: Math.max(0, h.level | 0) }));
    if (!list.length) return { ok: false, error: 'На сцене нет героев — босс не с кем драться.' };
    if (list.length > MAX_HEROES) list = list.sort(() => rand() - 0.5).slice(0, MAX_HEROES);
    const seed = Math.floor(rand() * 4294967296), res = runBoss(seed, def, list.map((h) => ({ login: h.login, level: h.level })));
    const total = TIMING.runInMs + res.rounds.length * TIMING.roundMs + TIMING.endMs; busyUntil = now() + total; scheduleNext();
    const names = Object.fromEntries(list.map((h) => [h.login, h.name]));
    const event = { id: ++seq, boss: { id: def.id, name: def.name, pack: def.pack, hp: res.boss.hp, scale: res.boss.scale, abilities: res.boss.abilities }, heroes: res.heroes, names, rounds: res.rounds, won: res.won, mvp: res.mvp, lastHit: res.lastHit, timing: { ...TIMING, totalMs: total } };
    current = { id: event.id, boss: def.name, heroes: list.length, hp: res.boss.hp, until: busyUntil };
    const announce = `👹 Появляется босс «${def.name}»! Здоровье ${res.boss.hp}, героев в бою: ${list.length}.`;
    function finish() {                                      // вызывается, когда бой на оверлее закончился
      current = null; const rewards = [];
      if (res.won) {
        const down = new Set(res.downed);
        for (const h of list) { let xp = def.xp * (down.has(h.login) ? 0.6 : 1); if (h.login === res.mvp) xp += def.xp * 0.5; if (h.login === res.lastHit) xp += 25; xp = Math.round(xp); if (xp > 0) { bonusXp(h.login, xp); rewards.push({ login: h.login, xp }); } }
      }
      const entry = { at: now(), boss: def.name, heroes: list.length, won: res.won, rounds: res.rounds.length, mvp: res.mvp ? (names[res.mvp] || res.mvp) : '', who: String(who || 'admin'), xpTotal: rewards.reduce((a, r) => a + r.xp, 0) };
      log = [entry, ...log].slice(0, MAX_LOG); save();
      const text = res.won ? `🏆 Босс «${def.name}» повержен! MVP: ${entry.mvp || '—'}${res.lastHit ? `, добил: ${names[res.lastHit] || res.lastHit}` : ''}. Участники получили опыт.` : `☠ Босс «${def.name}» победил героев и ушёл. Попробуйте снова!`;
      return { text, entry, rewards };
    }
    return { ok: true, event, announce, finish };
  }

  return {
    summon, MAX_HEROES, TIMING,
    isBusy: () => now() < busyUntil,
    getState: () => ({ settings: { ...settings }, bosses: bosses.map((b) => ({ ...b })), log: log.slice(), current: current && now() < current.until ? { ...current } : null, nextInMs: settings.random && nextAt ? Math.max(0, nextAt - now()) : null, abilities: ABILITIES, defaults: BOSS_DEFAULT, maxHeroes: MAX_HEROES }),
    setSettings(p) { settings = { ...settings, ...cleanSettings({ ...settings, ...(p || {}) }) }; if (settings.maxMinutes < settings.minMinutes) settings.maxMinutes = settings.minMinutes; if (settings.random) scheduleNext(); else nextAt = 0; save(); return { ...settings }; },
    saveBoss(b) { const v = validBoss(b, knownPack); if (!v.ok) return v; const i = bosses.findIndex((x) => x.id === v.boss.id); if (i >= 0) bosses[i] = v.boss; else { if (bosses.length >= MAX_BOSSES) return { ok: false, error: 'Слишком много боссов (максимум ' + MAX_BOSSES + ').' }; bosses.push(v.boss); } save(); return { ok: true, boss: v.boss }; },
    removeBoss(id) { if (bosses.length <= 1) return { ok: false, error: 'Нужен хотя бы один босс.' }; const n = bosses.length; bosses = bosses.filter((b) => b.id !== id); if (bosses.length === n) return { ok: false, error: 'Такого босса нет.' }; save(); return { ok: true }; },
    /** Проверка баланса для админки: n героев среднего уровня lvl, N симуляций → доля побед, средняя длина, выжившие. */
    balance(def, n, lvl, N = 400) {
      const v = validBoss({ id: 'tmp', ...def }, null); if (!v.ok) return v;
      let w = 0, r = 0, sv = 0; const heroes = Array.from({ length: n }, (_, i) => ({ login: 'p' + i, level: lvl }));
      for (let s = 1; s <= N; s++) { const x = runBoss(s * 104729, v.boss, heroes); w += x.won; r += x.rounds.length; sv += (n - x.downed.length) / n; }
      const st = bossStats(v.boss, n, lvl); return { ok: true, winPct: Math.round(w / N * 100), rounds: Math.round(r / N * 10) / 10, survivePct: Math.round(sv / N * 100), hp: st.hp, scale: Math.round(st.scale * 100) / 100 };
    },
    /** Раз в ~30 секунд: пора ли случайному боссу. Возвращает результат summon или null. */
    tick(onStageCount) {
      if (!settings.random) return null;
      if (!nextAt) { scheduleNext(); return null; }
      if (now() < nextAt || now() < busyUntil || onStageCount < settings.minViewers) return null;
      return summon('random', 'random');
    },
  };
}
module.exports = { createBosses, validBoss, TIMING, MAX_HEROES, SETTINGS_DEFAULT };
