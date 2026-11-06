// duelProgress.js — прогресс дуэлянта: победы, опыт за победу и медаль «Дуэлянт» из 5 ступеней (железо → бронза → серебро → золото → алмаз).
// Победы считаются по логину. Ступень растёт от числа побед: 1 / 5 / 15 / 50 / 100; после 100 побед значок больше не обновляется.
// В профиле игрока висит ТОЛЬКО текущая ступень (младшие снимаются), за каждую новую ступень — разовый бонус опыта.
// Хранение: duel_stats.json ({ players: { login: { wins, losses } }, awardIds: [id×5] }); иконки — duelMedalIcons.json (рисуются tools/…, 96×96 и 48×48).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'duel_stats.json');
const WIN_XP = 20;                                          // опыт за победу в дуэли (небольшой, без множителей ролей)
const TIERS = [
  { n: 1, wins: 1,   xp: 100, name: 'Новичок' },
  { n: 2, wins: 5,   xp: 150, name: 'Боец' },
  { n: 3, wins: 15,  xp: 250, name: 'Ветеран' },
  { n: 4, wins: 50,  xp: 400, name: 'Мастер' },
  { n: 5, wins: 100, xp: 600, name: 'Легенда' },
];
const tierFor = (wins) => { let t = 0; for (const x of TIERS) if (wins >= x.wins) t = x.n; return t; };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

function createDuelProgress(deps = {}) {
  const file = deps.file === undefined ? FILE : deps.file;
  const awards = deps.awards, pixel = deps.pixel;
  const icons = deps.icons || (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'duelMedalIcons.json'), 'utf8')); } catch (e) { return []; } })();
  let players = new Map(), awardIds = [];

  try { const raw = JSON.parse(fs.readFileSync(file, 'utf8')); if (raw && raw.players) for (const [k, v] of Object.entries(raw.players)) players.set(k, { wins: v.wins | 0, losses: v.losses | 0 }); if (Array.isArray(raw.awardIds)) awardIds = raw.awardIds.slice(0, 5); } catch (e) { /* нет файла — начинаем с нуля */ }
  function save() { if (!file) return; try { fs.writeFileSync(file + '.tmp', JSON.stringify({ players: Object.fromEntries(players), awardIds })); fs.renameSync(file + '.tmp', file); } catch (e) { console.warn('[Дуэли] Не удалось сохранить:', e.message); } }

  /** Создаёт в каталоге наград 5 ступеней, если их ещё нет (повторный вызов ничего не дублирует). */
  function ensureAwards() {
    if (!awards) return;
    let changed = false;
    TIERS.forEach((t, i) => {
      if (awardIds[i] && awards.getAward(awardIds[i])) return;
      const next = TIERS[i + 1];
      const r = awards.createAward({
        title: `Дуэлянт ${ROMAN[t.n]} · ${t.name}`,
        description: `Побед в дуэлях: ${t.wins}+. ` + (next ? `Следующая ступень — ${next.wins} побед.` : 'Высшая ступень, значок больше не меняется.'),
        howTo: `Побеждай в дуэлях (!пвп ник): ступени за 1, 5, 15, 50 и 100 побед.`,
        icon: (icons[i] || {}).icon || '', iconSmall: (icons[i] || {}).iconSmall || '',
      });
      if (r.ok) { awardIds[i] = r.award.id; changed = true; }
    });
    if (changed) save();
  }

  /** Победа: +опыт, счётчик, при новой ступени — медаль и бонус. Возвращает { wins, winXp, tierUp? }. */
  function recordResult(winner, loser) {
    const w = players.get(winner) || { wins: 0, losses: 0 }, l = players.get(loser) || { wins: 0, losses: 0 };
    const before = tierFor(w.wins);
    w.wins++; l.losses++; players.set(winner, w); players.set(loser, l);
    let xp = WIN_XP, tierUp = null;
    if (pixel && pixel.bonusXp) pixel.bonusXp(winner, WIN_XP);
    const after = tierFor(w.wins);
    if (after > before) {
      const t = TIERS[after - 1];
      if (pixel && pixel.bonusXp) pixel.bonusXp(winner, t.xp);
      xp += t.xp;
      if (awards) {
        const id = awardIds[after - 1];
        if (id) { awardIds.slice(0, after - 1).forEach((old) => old && awards.revoke(old, winner)); awards.grant(id, [winner]); }
      }
      tierUp = { tier: after, name: t.name, xp: t.xp, title: `Дуэлянт ${ROMAN[after]} · ${t.name}` };
    }
    save();
    return { wins: w.wins, winXp: WIN_XP, totalXp: xp, tierUp };
  }

  return { recordResult, ensureAwards, statsOf: (l) => ({ ...(players.get(l) || { wins: 0, losses: 0 }) }), awardIds: () => awardIds.slice(), TIERS, WIN_XP, tierFor };
}
module.exports = { createDuelProgress, TIERS, WIN_XP, tierFor };
