const { runBoss, bossStats, BOSS_DEFAULT } = require('../bossEngine.js'); let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log('FAIL', n)); };
const mk = (n, lv) => Array.from({ length: n }, (_, i) => ({ login: 'p' + i, level: typeof lv === 'function' ? lv(i) : lv }));
function sim(n, lv, def, N = 4000) { let w = 0, r = 0, sv = 0; for (let s = 1; s <= N; s++) { const x = runBoss(s * 104729, def, mk(n, lv)); w += x.won; r += x.rounds.length; sv += (n - x.downed.length) / n; } return { win: (w / N * 100).toFixed(1) + '%', rounds: (r / N).toFixed(1), surv: (sv / N * 100).toFixed(0) + '%' }; }
for (const [n, lv] of [[3, 1], [5, 1], [10, 5], [20, 5], [20, 15], [40, 10], [40, 30], [10, 40]]) console.log('n=' + n, 'lvl=' + lv, JSON.stringify(sim(n, lv)));
console.log('с способностями power+rage+breath:', JSON.stringify(sim(20, 8, { abilities: ['power', 'rage', 'breath'] })));
const a = runBoss(5, null, mk(8, 3)), b = runBoss(5, null, mk(8, 3));
t('воспроизводится по сиду', JSON.stringify(a) === JSON.stringify(b));
t('нет отрицательного HP босса в раундах', a.rounds.every((r) => r.bossHp >= 0));
t('рост HP и размера с числом героев', bossStats(null, 40).hp > bossStats(null, 5).hp && bossStats(null, 40).scale > bossStats(null, 5).scale && bossStats(null, 40).scale <= 3);
t('сильнее: +1 за 30 героев', bossStats({ scaleByLevel: false }, 60).hit === BOSS_DEFAULT.hit + 2);
t('рейд не бесконечный', a.rounds.length <= 40); t('mvp есть', !!a.mvp || !a.won);
console.log(ok + ' ok, ' + bad + ' fail'); process.exit(bad ? 1 : 0);
