const { createAchievements, TRACKS, tierOf } = require('../achievements');
const { createAwards } = require('../awards');
const { createAuctionBridge } = require('../auctionBridge');
let ok = 0, fail = 0; const t = (n, c) => { if (c) ok++; else { fail++; console.log('FAIL', n); } };
const aw = createAwards({ file: null });
const ac = createAchievements({ awards: aw, file: null, icons: {} });
ac.ensureAwards(); ac.ensureAwards();
const all = Object.values(ac.awardIds()).flat();
t('25 awards unique', all.length === 25 && new Set(all).size === 25);
const cur = (l, key) => aw.awardsOf(l).filter((id) => ac.awardIds()[key].includes(id));
t('veteran 9 none', ac.onLevel('a', 9).tier === 0 && cur('a', 'veteran').length === 0);
let r = ac.onLevel('a', 10); t('veteran 10', r.tierUp && r.tierUp.tier === 1 && cur('a', 'veteran').length === 1);
r = ac.onLevel('a', 20); t('no repeat', r.tierUp === null);
r = ac.onLevel('a', 99); t('veteran 99', r.tier === 5 && cur('a', 'veteran')[0] === ac.awardIds().veteran[4] && cur('a', 'veteran').length === 1);
for (let i = 0; i < 4; i++) ac.add('streams', 'b');
r = ac.add('streams', 'b'); t('regular 5 streams → tier 2', r.value === 5 && r.tier === 2 && r.tierUp.tier === 2);
for (let i = 0; i < 300; i++) r = ac.add('streams', 'b'); t('regular capped, counter grows', r.tier === 5 && r.value === 305 && cur('b', 'regular').length === 1);
// золотой лот: отметка и снятие
r = ac.add('wins', 'c', 1); t('golot 1', r.tier === 1 && cur('c', 'golot').length === 1);
r = ac.add('wins', 'c', -1); t('golot unmark', r.value === 0 && cur('c', 'golot').length === 0);
t('kills', ac.add('kills', 'd', 1).tier === 1 && ac.add('contribs', 'd', 1).tier === 1 && ac.summary('d').kills === 1);
// мост: победа лота
let wins = [], contribs = [];
const br = createAuctionBridge({ file: null, getProfile: () => ({ level: 10, flags: { sub: true, vip: false } }), send: async () => {}, onContribution: (l) => contribs.push(l), onWin: (l, d, c) => { wins.push([l, d, c.lot]); return { value: d }; } });
(async () => {
  br.start();
  await br.onRedeem({ reward: 'Аукцион', login: 'zed', name: 'Zed', input: 'Фильм Икс', redemptionId: '1', rewardId: 'r' });
  t('contribution counted', contribs.join() === 'zed');
  t('markable while active', br.state().markable.length === 1 && br.state().markOf === 'current');
  br.stop(); t('last markable after stop', br.state().markOf === 'last' && br.state().markable[0].lot === 'Фильм Икс');
  let m = br.markWin('zed', true); t('mark win', m.ok && wins.length === 1 && wins[0][2] === 'Фильм Икс');
  m = br.markWin('zed', true); t('double mark no-op', m.same && wins.length === 1);
  m = br.markWin('zed', false); t('unmark', m.ok && wins.length === 2 && wins[1][1] === -1);
  t('unknown', !br.markWin('nobody', true).ok);
  console.log(ok + ' ok, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
