// collectorProgress.js — достижение «Коллекционер»: сколько закрытых аватаров зритель открыл наградой за баллы.
// 5 ступеней (значок = ступень): 1 / 5 / 15 / 30 / 50 открытых. После 50 значок больше не меняется, даже если закрытых аватаров станет больше —
// дальше растёт только счётчик «открыто N из M» (в сообщении бота {count}/{total} и в профиле: collected / collectedTotal).
// В профиле висит ТОЛЬКО текущая ступень (младшие снимаются). Иконки — collectorMedalIcons.json (tools/gen-collector-icons.py).
// Хранение: collector_stats.json ({ awardIds: [id×5] }) — сами счётчики считает pixelHeroes (earnedOf), здесь только награды.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'collector_stats.json');
const TIERS = [
  { n: 1, count: 1,  name: 'Искатель' },
  { n: 2, count: 5,  name: 'Собиратель' },
  { n: 3, count: 15, name: 'Знаток' },
  { n: 4, count: 30, name: 'Хранитель' },
  { n: 5, count: 50, name: 'Легенда' },
];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const tierFor = (count) => { let t = 0; for (const x of TIERS) if (count >= x.count) t = x.n; return t; };

function createCollectorProgress(deps = {}) {
  const file = deps.file === undefined ? FILE : deps.file;
  const awards = deps.awards;
  const icons = deps.icons || (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'collectorMedalIcons.json'), 'utf8')); } catch (e) { return []; } })();
  let awardIds = [];
  try { const raw = JSON.parse(fs.readFileSync(file, 'utf8')); if (raw && Array.isArray(raw.awardIds)) awardIds = raw.awardIds.slice(0, 5); } catch (e) { /* файла нет */ }
  function save() { if (!file) return; try { fs.writeFileSync(file + '.tmp', JSON.stringify({ awardIds })); fs.renameSync(file + '.tmp', file); } catch (e) { console.warn('[Коллекционер] Не удалось сохранить:', e.message); } }

  function ensureAwards() {
    if (!awards) return;
    let changed = false;
    TIERS.forEach((t, i) => {
      if (awardIds[i] && awards.getAward(awardIds[i])) return;
      const next = TIERS[i + 1];
      const r = awards.createAward({
        title: `Коллекционер ${ROMAN[t.n]} · ${t.name}`,
        description: `Открыто закрытых аватаров: ${t.count}+. ` + (next ? `Следующая ступень — ${next.count}.` : 'Высшая ступень: значок больше не меняется, считается только число аватаров.'),
        howTo: 'Открывай аватары наградой за баллы канала: ступени за 1, 5, 15, 30 и 50.',
        icon: (icons[i] || {}).icon || '', iconSmall: (icons[i] || {}).iconSmall || '',
      });
      if (r.ok) { awardIds[i] = r.award.id; changed = true; }
    });
    if (changed) save();
  }

  /** После открытия аватара: count — сколько закрытых у зрителя теперь открыто. Выдаёт/меняет значок, если ступень выросла. Возвращает { tier, tierUp? }. */
  function onUnlock(login, count) {
    const tier = tierFor(count);
    if (!tier || !awards) return { tier, tierUp: null };
    const id = awardIds[tier - 1];
    if (!id) return { tier, tierUp: null };
    const had = (awards.awardsOf ? awards.awardsOf(login) : []).includes(id);
    if (had) return { tier, tierUp: null };
    awardIds.slice(0, tier - 1).forEach((old) => old && awards.revoke(old, login));
    awards.grant(id, [login]);
    const t = TIERS[tier - 1];
    return { tier, tierUp: { tier, name: t.name, title: `Коллекционер ${ROMAN[tier]} · ${t.name}` } };
  }
  return { ensureAwards, onUnlock, awardIds: () => awardIds.slice(), TIERS, tierFor };
}
module.exports = { createCollectorProgress, TIERS, tierFor };
