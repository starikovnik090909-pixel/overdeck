const { runDuel, DUEL } = require('../duelEngine.js'); let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log('FAIL', n)); };
const N = 200000; let aw = 0, rs = 0, tb = 0, long = 0, maxR = 0, crit = 0, sw = 0, hits = 0, ties = 0; const hist = {};
for (let s = 1; s <= N; s++) { const r = runDuel(s * 7919); aw += r.winner === 'a'; const n = r.rounds.filter(x => x.a).length; rs += n; maxR = Math.max(maxR, n); hist[n] = (hist[n] || 0) + 1; if (r.rounds.some(x => x.tiebreak)) tb++; if (n >= 15) long++;
  r.rounds.forEach(x => { if (x.a) [x.a, x.b].forEach(y => { sw++; hits += y.swing.hit; crit += y.swing.crit; }); }); }
const p = aw / N, se = Math.sqrt(0.25 / N);
console.log('winA', p.toFixed(4), 'avgRounds', (rs / N).toFixed(2), 'maxR', maxR, '>=15r', (long / N * 100).toFixed(2) + '%', 'tiebreak', (tb / N * 100).toFixed(2) + '%', 'hit%', (hits / sw * 100).toFixed(1), 'crit%', (crit / sw * 100).toFixed(1));
t('симметрия (|p-0.5|<4σ)', Math.abs(p - 0.5) < 4 * se);
const r1 = runDuel(12345), r2 = runDuel(12345); t('воспроизводимость по сиду', JSON.stringify(r1) === JSON.stringify(r2));
t('всегда есть победитель', ['a', 'b'].includes(r1.winner)); t('бой не бесконечный', maxR <= DUEL.maxRounds);
console.log(ok + ' ok, ' + bad + ' fail'); process.exit(bad ? 1 : 0);
