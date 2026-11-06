// pvp.js — команда «!пвп ник» для чат-аватаров: нападение на другого зрителя, бой считает duelEngine (автоматический, по D&D).
// handle() ничего не рассылает сам: возвращает { reply?, duel? } — серверу остаётся разослать duel оверлею и ответить в чат.
// ПРАВИЛА: цель должна быть на сцене; нельзя нападать на себя; пока идёт бой, оба заняты; НА ОДНОГО И ТОГО ЖЕ участника
// нападать можно раз в 5 минут (таймер считается от начала последнего боя с ним, кто бы ни нападал); бой нельзя в паузу стрима выключить — только флаг enabled.
const { runDuel } = require('./duelEngine');

const WORDS = ['!пвп', '!pvp'];
const TARGET_COOLDOWN_MS = 5 * 60 * 1000;
const RUN_IN_MS = 3500, ROUND_MS = 1700, END_MS = 2500;   // подбегание, один раунд, расхождение — для «занятости» бойцов и таймингов оверлея

function createPvp(opts = {}) {
  const now = opts.now || (() => Date.now());
  const rand = opts.random || Math.random;
  const isOnStage = opts.isOnStage || (() => true);        // (login) → на сцене ли герой
  const nameOf = opts.nameOf || ((l) => l);
  const isBlocked = opts.isBlocked || (() => false);       // () → true, пока идёт бой с боссом: дуэли ждут
  let enabled = opts.enabled !== false;
  const lastAttacked = new Map();                          // login цели → время начала последнего боя с ней
  const busyUntil = new Map();                             // login → до какого времени занят боем
  let seq = 0;

  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/^@/, '');

  function handle({ login, name, message }) {
    if (!enabled) return null;
    const parts = String(message || '').trim().split(/\s+/);
    if (!WORDS.includes((parts[0] || '').toLowerCase())) return null;
    const me = norm(login), t = now(), who = name || login;
    const target = norm(parts[1]);
    if (isBlocked()) return { reply: `@${who}, сейчас идёт бой с боссом — дуэли подождут.` };
    if (!target) return { reply: `@${who}, напиши, на кого напасть: ${WORDS[0]} ник` };
    if (target === me) return { reply: `@${who}, с самим собой драться нельзя.` };
    if (!isOnStage(target)) return { reply: `@${who}, ${target} сейчас нет на сцене (нужно недавно написать в чат).` };
    if ((busyUntil.get(me) || 0) > t) return { reply: `@${who}, ты уже в бою.` };
    if ((busyUntil.get(target) || 0) > t) return { reply: `@${who}, ${nameOf(target)} уже дерётся.` };
    const wait = (lastAttacked.get(target) || 0) + TARGET_COOLDOWN_MS - t;
    if (wait > 0) return { reply: `@${who}, на ${nameOf(target)} уже нападали, подожди ещё ${Math.ceil(wait / 1000)} с.` };

    const seed = Math.floor(rand() * 4294967296);
    const res = runDuel(seed);
    const rounds = res.rounds.filter((r) => r.a).length;
    const total = RUN_IN_MS + rounds * ROUND_MS + END_MS;
    lastAttacked.set(target, t); busyUntil.set(me, t + total); busyUntil.set(target, t + total);
    if (lastAttacked.size > 500) for (const [k, v] of lastAttacked) if (t - v > TARGET_COOLDOWN_MS) lastAttacked.delete(k);
    const winnerLogin = res.winner === 'a' ? me : target, loserLogin = res.winner === 'a' ? target : me;
    const duel = { id: ++seq, a: { login: me, name: who }, b: { login: target, name: nameOf(target) }, winner: res.winner, rounds: res.rounds, seed,
      timing: { runInMs: RUN_IN_MS, roundMs: ROUND_MS, endMs: END_MS, totalMs: total } };
    return { duel, winnerLogin, loserLogin, reply: '', announce: { winnerName: res.winner === 'a' ? who : nameOf(target), loserName: res.winner === 'a' ? nameOf(target) : who, afterMs: total } };
  }

  return { handle, setEnabled(v) { enabled = !!v; }, isEnabled: () => enabled, TARGET_COOLDOWN_MS };
}
module.exports = { createPvp, WORDS, TARGET_COOLDOWN_MS };
