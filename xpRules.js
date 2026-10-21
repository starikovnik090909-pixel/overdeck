// xpRules.js — правила опыта и уровней чат-аватаров (чистые функции и константы, без состояния и без часов).
//
// КРИВАЯ УРОВНЕЙ. Чтобы перейти на уровень n, нужно need(n) опыта: 1-й — 100, 2-й — 150, 3-й — 210 … Формула
//     need(n) = round5( 100 + 50·(n−1) + 2·(n−1)² ),   n = 1…99
// — шаг между уровнями растёт с каждым уровнем (+50, +60, +60, +60, +70 … у 99-го уровня +440; ступеньки — из-за округления до 5), поэтому первые уровни берутся быстро, а 99-й почти недостижим:
// всего до 99-го уровня нужно 889 550 опыта (≈ 9 200 часов у активного зрителя, а если выжимать из каждого часа максимум — болтун со всеми бонусами ×1.9 — не меньше ≈ 4 000 часов).
//
// БАЛАНС (базовые числа, до множителей; всё рассчитано так, чтобы 1-й уровень (100 опыта) брался примерно за ЧАС просмотра с перепиской):
//   • заход на стрим           +10   один раз за трансляцию (при первом сообщении в ней);
//   • присутствие              +6    каждые 10 минут, пока человек «в чате» (писал за последние 20 минут): за час — 6 раз = 36;
//   • сообщение                +4    не чаще раза в 90 секунд и не больше 80 опыта (20 сообщений) за скользящий час — спамом быстрее не прокачаться;
//   • участие в голосовании    +15   (ставка: топ-предсказатели; обычный опрос Twitch не сообщает, кто голосовал, — там начислять нечем).
//   Активный зритель (15 сообщений за час): 10 + 36 + 60 = 106 → 1-й уровень примерно за 55 минут. Тихий (3 сообщения): 58 за час → ≈ 1 ч 45 мин.
// МНОЖИТЕЛИ (складываются ПРИБАВКАМИ к единице): подписка +0.2 (×1.2), VIP +0.3 (×1.3), модератор +0.4 (×1.4); все три сразу — ×1.9.
//   Подписка любого уровня считается как подписка 1-го уровня: уровень подписки в тегах чата не передаётся.

const LEVEL_CAP = 99;

const XP = {
  join: 10,
  presence: 6,
  presenceEveryMs: 10 * 60 * 1000,
  presenceWindowMs: 20 * 60 * 1000,
  message: 4,
  messageCooldownMs: 90 * 1000,
  messageCapPerHour: 80,
  participation: 15,
};
const BONUS = { sub: 0.2, vip: 0.3, mod: 0.4 };

const round5 = (x) => Math.round(x / 5) * 5;
/** Сколько опыта нужно, чтобы перейти на уровень n (n = 1…LEVEL_CAP). */
function needForLevel(n) {
  if (!Number.isInteger(n) || n < 1 || n > LEVEL_CAP) return NaN;
  return round5(100 + 50 * (n - 1) + 2 * (n - 1) * (n - 1));
}

// CUM[n] — сколько опыта всего нужно набрать, чтобы стать уровня n (CUM[0] = 0).
const CUM = [0];
for (let n = 1; n <= LEVEL_CAP; n++) CUM.push(CUM[n - 1] + needForLevel(n));

/** Сколько всего опыта нужно для уровня n (0 — для нулевого). */
function totalForLevel(n) { return Number.isInteger(n) && n >= 0 && n <= LEVEL_CAP ? CUM[n] : NaN; }

/** Уровень по общему опыту: наибольший n, для которого набрано CUM[n]. Не больше LEVEL_CAP. */
function levelFromTotal(total) {
  const t = Number.isFinite(total) && total > 0 ? total : 0;
  let lo = 0, hi = LEVEL_CAP;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (CUM[mid] <= t) lo = mid; else hi = mid - 1; }
  return lo;
}

/** Прогресс: уровень, опыт внутри уровня и сколько нужно до следующего (need = 0 на максимальном уровне — шкала заполнена). */
function progress(total) {
  const t = Number.isFinite(total) && total > 0 ? total : 0;
  const level = levelFromTotal(t);
  return level >= LEVEL_CAP ? { level, xp: t - CUM[level], need: 0, maxed: true } : { level, xp: t - CUM[level], need: needForLevel(level + 1), maxed: false };
}

/** Множитель опыта по ролям { sub, vip, mod }: 1 + прибавки (подписка +0.2, VIP +0.3, модератор +0.4). */
function multiplier(roles) {
  const r = roles || {};
  return Math.round((1 + (r.sub ? BONUS.sub : 0) + (r.vip ? BONUS.vip : 0) + (r.mod ? BONUS.mod : 0)) * 100) / 100;
}

module.exports = { LEVEL_CAP, XP, BONUS, needForLevel, totalForLevel, levelFromTotal, progress, multiplier };
