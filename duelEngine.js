// duelEngine.js — автоматическая дуэль чат-аватаров «по D&D» (чистая функция, без состояния и часов).
// У обоих бойцов ОДИНАКОВЫЕ статы (уровень, герой, роль не влияют), исход решают кубики.
// Раунд одновременный: оба бросают d20 + бонус против КД соперника, урон применяется сразу.
// Если оба упали в одном раунде — побеждает у кого осталось больше HP (отрицательное считается), при равенстве — d20.
const DUEL = { hp: 25, ac: 12, hit: 3, dmgDie: 8, dmgBonus: 2, maxRounds: 40 };

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const die = (rnd, n) => 1 + Math.floor(rnd() * n);

/** Один удар: { roll, hit, crit, fumble, dmg }. */
function swing(rnd, cfg) {
  const roll = die(rnd, 20), fumble = roll === 1, crit = roll === 20;
  const hit = !fumble && (crit || roll + cfg.hit >= cfg.ac);
  let dmg = 0;
  if (hit) { dmg = die(rnd, cfg.dmgDie) + cfg.dmgBonus; if (crit) dmg += die(rnd, cfg.dmgDie) + cfg.dmgBonus; }
  return { roll, hit, crit, fumble, dmg };
}

/** Полный бой. Возвращает { winner:'a'|'b', rounds:[{n, a:{swing,hp}, b:{swing,hp}}], hp:{a,b}, seed }.
 *  Сид хранится в журнале: по нему бой воспроизводится бит в бит. Оверлей проигрывает rounds как есть. */
function runDuel(seed, opts) {
  const cfg = Object.assign({}, DUEL, opts || {}), rnd = mulberry32(seed);
  let a = cfg.hp, b = cfg.hp; const rounds = [];
  for (let n = 1; n <= cfg.maxRounds; n++) {
    const sa = swing(rnd, cfg), sb = swing(rnd, cfg);
    b -= sa.dmg; a -= sb.dmg;
    rounds.push({ n, a: { swing: sa, hp: Math.max(a, 0) }, b: { swing: sb, hp: Math.max(b, 0) } });
    if (a <= 0 || b <= 0) break;
  }
  let winner;
  if (a !== b) winner = a > b ? 'a' : 'b';
  else { let x, y; do { x = die(rnd, 20); y = die(rnd, 20); } while (x === y); winner = x > y ? 'a' : 'b'; rounds.push({ n: rounds.length + 1, tiebreak: { a: x, b: y } }); }
  return { winner, rounds, hp: { a, b }, seed };
}
module.exports = { DUEL, runDuel, swing, mulberry32 };
