const { buildSnapshot } = require('../extension.js');
const { createAwards } = require('../awards.js');
const { createAchievements } = require('../achievements.js');
const { createCollectorProgress } = require('../collectorProgress.js');
const { createDuelProgress } = require('../duelProgress.js');
let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log('FAIL', n)); };
const awards = createAwards({ file: null, hasProfile: () => true });
const ach = createAchievements({ awards, file: null }); ach.ensureAwards();
const col = createCollectorProgress({ awards, file: null, pixel: { bonusXp() {} } }); col.ensureAwards();
const dp = createDuelProgress({ file: null, awards, pixel: { bonusXp() {} } }); dp.ensureAwards();
const list = awards.list();
t('наград 35 (25+5+5)', list.length === 35);
t('у всех есть иконка', list.every((a) => /^data:image\/png/.test(a.icon || '')));
const msgs = awards.buildCatalog(4800);
const rows = msgs.flatMap((m) => JSON.parse(typeof m === 'string' ? m : JSON.stringify(m)).a);
t('каталог содержит все 35', rows.length === 35 && rows.every((r) => r[3] && r[3].length <= 8000));
t('каждое сообщение ≤ 4800 байт', msgs.every((m) => Buffer.byteLength(typeof m === 'string' ? m : JSON.stringify(m)) <= 4800));
for (let i = 0; i < 7; i++) dp.recordResult('al', 'bob');
const profiles = {}; const mk = (l, n) => ({ login: l, name: n, hero: 'demon1', level: 5, xp: 3, xpNeed: 40, maxed: false, color: '#2BC4B4', uid: '1', totalXp: 100, multiplier: 1 });
const ph = { getProfile: (l) => profiles[l] || null, stageProfiles: () => [], topProfiles: () => [], listStage: () => [], list: () => [], usableFlags: () => [] };
['al', 'bob'].forEach((l) => { profiles[l] = mk(l, l); });
let snap;
try {
  const px = { ...ph, getTop: () => [{ ...profiles.al, rank: 1 }, { ...profiles.bob, rank: 2 }], getRoster: () => [{ login: 'al' }] };
  snap = buildSnapshot(px, { topSize: 25, maxBytes: 4500, live: true, now: 1000, awardsOf: (l) => awards.awardsOf(l), heroIds: [], duelWinsOf: (l) => dp.statsOf(l).wins, boss: { n: 'Лесной голем', k: 'demon1', t0: 900, track: [300, 250, 200, 120, 40, 0], d: [4000, 1900, 4500] }, pa: [10, 5, 500] }).snapshot;
} catch (e) { console.log('buildSnapshot error', e.message); }
t('снимок построен', !!snap);
if (snap) {
  const al = snap.p.find((r) => r[0] === 'al');
  t('победы в дуэлях в строке (7)', al && al[14] === 7);
  t('босс и правило цены в снимке', snap.bs && snap.bs.n === 'Лесной голем' && JSON.stringify(snap.pa) === '[10,5,500]');
  t('снимок < 4500 байт', Buffer.byteLength(JSON.stringify(snap)) <= 4500);
}
console.log(ok + ' ok, ' + bad + ' fail'); process.exit(bad ? 1 : 0);
