// achievements.js — ступенчатые достижения зрителей (5 ступеней, значок = ступень, в профиле висит только текущая):
//   «Ветеран» — уровень аватара; «Завсегдатай» — число трансляций, на которых человек писал; «Убийца монстров» — победы над боссами в составе героев;
//   «Меценат» — число аукционов, куда он внёс взнос; «Золотой лот» — сколько его лотов победило (отмечает стример в админке).
// После высшей ступени значок не меняется, растёт только счётчик (его показывают бот и профиль). «Коллекционер» живёт отдельно (collectorProgress.js).
// Хранение: achievement_stats.json ({ counters: { имя: { login: число } }, tracks: { ключ: [id награды × 5] } }); иконки — achievementIcons.json (tools/gen-achievement-icons.py).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'achievement_stats.json');
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const TRACKS = [
  { key: 'veteran', counter: 'level', title: 'Ветеран', unit: 'уровень аватара', howTo: 'Расти в уровне: ступени на 10, 25, 50, 75 и 99 уровне.',
    tiers: [[10, 'Бывалый'], [25, 'Опытный'], [50, 'Закалённый'], [75, 'Старейшина'], [99, 'Легенда']] },
  { key: 'regular', counter: 'streams', title: 'Завсегдатай', unit: 'трансляций с тобой в чате', howTo: 'Заходи и пиши в чат на стримах: ступени за 1, 5, 20, 50 и 100 трансляций.',
    tiers: [[1, 'Гость'], [5, 'Знакомый'], [20, 'Свой'], [50, 'Постоянный'], [100, 'Старожил']] },
  { key: 'monster', counter: 'kills', title: 'Убийца монстров', unit: 'побед над боссами', howTo: 'Сражайся с боссами и побеждай: ступени за 1, 5, 15, 30 и 50 побед.',
    tiers: [[1, 'Охотник'], [5, 'Истребитель'], [15, 'Гроза чудовищ'], [30, 'Победитель титанов'], [50, 'Убийца монстров']] },
  { key: 'patron', counter: 'contribs', title: 'Меценат', unit: 'аукционов с твоим взносом', howTo: 'Вноси взнос в аукцион наградой «Аукцион»: ступени за 1, 3, 10, 25 и 50 аукционов.',
    tiers: [[1, 'Вкладчик'], [3, 'Спонсор'], [10, 'Покровитель'], [25, 'Благодетель'], [50, 'Меценат']] },
  { key: 'golot', counter: 'wins', title: 'Золотой лот', unit: 'победивших лотов', howTo: 'Предлагай лоты в аукционе: ступени за 1, 3, 5, 10 и 25 победивших лотов.',
    tiers: [[1, 'Находка'], [3, 'Удачный выбор'], [5, 'Чутьё'], [10, 'Знаток вкуса'], [25, 'Золотой лот']] },
];
const tierOf = (track, value) => { let t = 0; track.tiers.forEach(([n], i) => { if (value >= n) t = i + 1; }); return t; };
const titleOf = (track, tier) => `${track.title} ${ROMAN[tier]} · ${track.tiers[tier - 1][1]}`;

function createAchievements(deps = {}) {
  const file = deps.file === undefined ? FILE : deps.file;
  const awards = deps.awards;
  const icons = deps.icons || (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'achievementIcons.json'), 'utf8')); } catch (e) { return {}; } })();
  const counters = { streams: new Map(), kills: new Map(), contribs: new Map(), wins: new Map() };
  const ids = {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && raw.counters) for (const k of Object.keys(counters)) if (raw.counters[k]) for (const [l, n] of Object.entries(raw.counters[k])) if (Number.isInteger(n) && n > 0) counters[k].set(l, n);
    if (raw && raw.tracks) for (const [k, v] of Object.entries(raw.tracks)) if (Array.isArray(v)) ids[k] = v.slice(0, 5);
  } catch (e) { /* файла нет */ }
  let timer = null;
  function save() { if (!file) return; try { const o = { counters: {}, tracks: ids }; for (const k of Object.keys(counters)) o.counters[k] = Object.fromEntries(counters[k]); fs.writeFileSync(file + '.tmp', JSON.stringify(o)); fs.renameSync(file + '.tmp', file); } catch (e) { console.warn('[Достижения] Не удалось сохранить:', e.message); } }
  function saveSoon() { if (!file || timer) return; timer = setTimeout(() => { timer = null; save(); }, 2000); if (timer.unref) timer.unref(); }

  function ensureAwards() {
    if (!awards) return;
    let changed = false;
    for (const tr of TRACKS) {
      ids[tr.key] = ids[tr.key] || [];
      tr.tiers.forEach(([n, name], i) => {
        const id = ids[tr.key][i];
        if (id && awards.getAward(id)) return;
        const next = tr.tiers[i + 1];
        const ic = (icons[tr.key] || [])[i] || {};
        const r = awards.createAward({
          title: titleOf(tr, i + 1),
          description: `${tr.unit[0].toUpperCase() + tr.unit.slice(1)}: ${n}+. ` + (next ? `Следующая ступень — ${next[0]}.` : 'Высшая ступень: значок больше не меняется, считается только число.'),
          howTo: tr.howTo, icon: ic.icon || '', iconSmall: ic.iconSmall || '',
        });
        if (r.ok) { ids[tr.key][i] = r.award.id; changed = true; }
      });
    }
    if (changed) save();
  }

  /** Приводит значок зрителя в соответствие со значением: выдаёт нужную ступень, снимает остальные. Возвращает { tier, tierUp? }. */
  function apply(track, login, value) {
    const tier = tierOf(track, value), list = ids[track.key] || [];
    if (!awards) return { tier, tierUp: null };
    const have = awards.awardsOf(login), target = tier ? list[tier - 1] : null;
    const others = list.filter((id) => id && id !== target && have.includes(id));
    if ((!tier || have.includes(target)) && !others.length) return { tier, tierUp: null };
    const before = list.reduce((m, id, i) => (id && have.includes(id) ? i + 1 : m), 0);
    others.forEach((id) => awards.revoke(id, login));
    if (target && !have.includes(target)) awards.grant(target, [login]);
    return { tier, tierUp: tier > before ? { tier, name: track.tiers[tier - 1][1], title: titleOf(track, tier) } : null };
  }
  const byCounter = (c) => TRACKS.find((t) => t.counter === c);

  return {
    TRACKS, ensureAwards, tierOf, titleOf,
    /** Счётчик +delta (delta может быть отрицательной: снять победу). Возвращает { value, tier, tierUp }. */
    add(counter, login, delta = 1) {
      const m = counters[counter]; if (!m || !login) return null;
      const key = String(login).toLowerCase(), v = Math.max(0, (m.get(key) || 0) + delta);
      if (v) m.set(key, v); else m.delete(key);
      saveSoon();
      return { value: v, ...apply(byCounter(counter), key, v) };
    },
    get: (counter, login) => (counters[counter] && counters[counter].get(String(login || '').toLowerCase())) || 0,
    /** Уровень героя вырос (или стал известен). */
    onLevel(login, level) { return apply(byCounter('level'), String(login).toLowerCase(), level | 0); },
    summary(login) { const k = String(login || '').toLowerCase(); return { streams: this.get('streams', k), kills: this.get('kills', k), contribs: this.get('contribs', k), wins: this.get('wins', k) }; },
    flush() { if (timer) { clearTimeout(timer); timer = null; } save(); },
    awardIds: () => JSON.parse(JSON.stringify(ids)),
  };
}
module.exports = { createAchievements, TRACKS, tierOf };
