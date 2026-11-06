// bossEngine.js — бой героев с боссом «по D&D», автоматический (чистая функция, без состояния и часов).
// Герои: HP = 20 + 3·уровень; бонус мастерства 2 + ⌊ур/20⌋; КД = 11 + бонус мастерства; атака d20 + мастерство + 2 против КД босса;
// урон — кость оружия по уровню (d6 / d8 / d10 / d12 на 1–20 / 21–50 / 51–80 / 81–99) + 2 + ⌊ур/5⌋. Крит на 20 — двойной урон, 1 — промах.
// Босс: HP = hpPerPlayer × число героев (чем больше зрителей, тем он здоровее, больше на сцене и сильнее: +1 к атаке и урону за каждые 30 героев).
// scaleByLevel (по умолчанию да): средний уровень героев тоже делает босса крепче (HP ×(1+ур/12), +1 за каждые 8 уровней), чтобы высокие уровни не сносили его с первого раунда.
// Каждый раунд босс бьёт ⌈героев / attackEvery⌉ случайных живых героев; у него могут быть способности (abilities).
// Побеждённый герой (0 HP) выбывает. Победа героев — босс на 0 HP; поражение — пали все или вышли 40 раундов (босс уходит).
const { mulberry32 } = require('./duelEngine');

const ABILITIES = {
  power:  { title: 'Мощный удар',     hint: 'Каждый 4-й раунд первый удар босса наносит двойной урон.' },
  rage:   { title: 'Ярость',          hint: 'Ниже половины здоровья: +2 к атаке и урону.' },
  breath: { title: 'Дыхание',         hint: 'Каждый 5-й раунд задевает 30% героев (d8 урона, без броска).' },
  regen:  { title: 'Регенерация',     hint: 'Каждый раунд лечит 3% здоровья.' },
};
const BOSS_DEFAULT = { scaleByLevel: true, hpPerPlayer: 50, ac: 13, hit: 5, dmgDie: 8, dmgBonus: 3, attackEvery: 4, abilities: [], maxRounds: 40 };

const die = (rnd, n) => 1 + Math.floor(rnd() * n);
const prof = (lvl) => 2 + Math.floor(lvl / 20);
const weaponDie = (lvl) => (lvl <= 20 ? 6 : lvl <= 50 ? 8 : lvl <= 80 ? 10 : 12);
const heroHp = (lvl) => 20 + 3 * lvl;
const heroAc = (lvl) => 11 + prof(lvl);

/** Характеристики босса для n героев: { hp, ac, hit, dmgDie, dmgBonus, attacks, scale }. scale — во сколько раз рисовать крупнее (1…3). */
function bossStats(def, n, avgLevel) {
  const d = Object.assign({}, BOSS_DEFAULT, def || {}), lv = d.scaleByLevel ? Math.max(0, avgLevel || 0) : 0;
  const hp = Math.max(1, Math.round(d.hpPerPlayer * n * Math.min(4, 1 + lv / 12))), bonus = Math.floor(n / 30) + Math.floor(lv / 8);
  return { hp, ac: d.ac + Math.floor(lv / 25), hit: d.hit + bonus, dmgDie: d.dmgDie, dmgBonus: d.dmgBonus + bonus, attacks: Math.max(1, Math.ceil(n / d.attackEvery)),
    abilities: (d.abilities || []).filter((a) => ABILITIES[a]), maxRounds: d.maxRounds, scale: Math.min(3, 1 + hp / 1500) };
}

/** heroes: [{ login, level }]. Возвращает { won, rounds:[…], heroes:[…], boss, mvp, lastHit, damage:{login:n}, downed:[login], seed }.
 *  Раунд: { n, hits:[{a, roll, hit, crit, dmg}], bossHits:[{t, roll, hit, crit, dmg, ab}], bossHp, hp:{login:hp}, note? } — оверлей проигрывает как есть. */
function runBoss(seed, def, heroes) {
  const rnd = mulberry32(seed), B = bossStats(def, heroes.length, heroes.reduce((a, h) => a + h.level, 0) / Math.max(1, heroes.length));
  let bossHp = B.hp; const H = heroes.map((h) => ({ login: h.login, level: h.level, hp: heroHp(h.level), max: heroHp(h.level), dmg: 0 }));
  const damage = {}, rounds = []; let lastHit = '', won = false;
  for (let n = 1; n <= B.maxRounds; n++) {
    const alive = H.filter((h) => h.hp > 0); if (!alive.length) break;
    const round = { n, hits: [], bossHits: [], note: '' };
    // 1) герои бьют босса (порядок случайный: кто добил, решает очерёдность)
    for (const h of alive.slice().sort(() => rnd() - 0.5)) {
      if (bossHp <= 0) break;
      const roll = die(rnd, 20), crit = roll === 20, fumble = roll === 1, hit = !fumble && (crit || roll + prof(h.level) + 2 >= B.ac);
      let dmg = 0; if (hit) { dmg = die(rnd, weaponDie(h.level)) + 2 + Math.floor(h.level / 5); if (crit) dmg += die(rnd, weaponDie(h.level)) + 2 + Math.floor(h.level / 5); }
      bossHp -= dmg; h.dmg += dmg; damage[h.login] = (damage[h.login] || 0) + dmg;
      round.hits.push({ a: h.login, roll, hit, crit, dmg }); if (bossHp <= 0) { lastHit = h.login; won = true; }
    }
    if (bossHp <= 0) { round.bossHp = 0; round.hp = Object.fromEntries(H.map((h) => [h.login, h.hp])); rounds.push(round); break; }
    // 2) босс отвечает
    const enraged = B.abilities.includes('rage') && bossHp < B.hp / 2, hitB = B.hit + (enraged ? 2 : 0), dmgB = B.dmgBonus + (enraged ? 2 : 0);
    const targets = H.filter((h) => h.hp > 0); if (enraged && n > 0) round.note = 'rage';
    for (let k = 0; k < B.attacks && targets.length; k++) {
      const h = targets[Math.floor(rnd() * targets.length)];
      const roll = die(rnd, 20), crit = roll === 20, fumble = roll === 1, hit = !fumble && (crit || roll + hitB >= heroAc(h.level));
      let dmg = 0, ab = '';
      if (hit) { dmg = die(rnd, B.dmgDie) + dmgB; if (crit) dmg += die(rnd, B.dmgDie) + dmgB; if (k === 0 && B.abilities.includes('power') && n % 4 === 0) { dmg *= 2; ab = 'power'; } }
      h.hp -= dmg; round.bossHits.push({ t: h.login, roll, hit, crit, dmg, ab });
      if (h.hp <= 0) targets.splice(targets.indexOf(h), 1);
    }
    if (B.abilities.includes('breath') && n % 5 === 0) {
      const live = H.filter((h) => h.hp > 0); const cnt = Math.max(1, Math.round(live.length * 0.3));
      live.sort(() => rnd() - 0.5).slice(0, cnt).forEach((h) => { const dmg = die(rnd, 8) + dmgB; h.hp -= dmg; round.bossHits.push({ t: h.login, roll: 0, hit: true, crit: false, dmg, ab: 'breath' }); });
    }
    if (B.abilities.includes('regen')) bossHp = Math.min(B.hp, bossHp + Math.round(B.hp * 0.03));
    round.bossHp = Math.max(0, bossHp); round.hp = Object.fromEntries(H.map((h) => [h.login, Math.max(0, h.hp)]));
    rounds.push(round);
  }
  const mvp = Object.entries(damage).sort((a, b) => b[1] - a[1])[0];
  return { won, rounds, seed, boss: B, heroes: H.map((h) => ({ login: h.login, level: h.level, max: h.max })), mvp: mvp ? mvp[0] : '', lastHit, damage,
    downed: H.filter((h) => h.hp <= 0).map((h) => h.login), bossHpLeft: Math.max(0, bossHp) };
}
module.exports = { runBoss, bossStats, ABILITIES, BOSS_DEFAULT, heroHp, heroAc, prof, weaponDie };
