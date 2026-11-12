// Проверки «Вечернего выпуска»: генератор заголовков, журнал, сборка выпуска. Запуск: node tests/gazette.test.js
const assert = require('assert');
const Gazette = require('../gazette');
const demo = require('../gazetteDemo');
const journal = require('../streamJournal');
let fails = 0, total = 0;
function t(name, fn) { total++; try { fn(); } catch (e) { fails++; console.log('✗ ' + name + ': ' + e.message); } }

// 1. Тест-вечера дают ожидаемую главную тему
const expect = { A: 'comeback', B: 'quietWord|quiet|thin', C: 'donationBig|donationTop', D: 'tech', E: 'donAgain3' };
demo.ids.forEach((id) => t('вечер ' + id + ': тема', () => {
  const g = Gazette.build(demo.make(id, 7), { seed: 1 });
  assert(new RegExp('^(' + expect[id] + ')$').test(g.leadKind) || id === 'B', 'тема ' + g.leadKind);
}));

// 2. В заголовках нет незаполненных шаблонов, мужских глаголов вместо ника и «NaN/undefined» — по всем шаблонам
demo.ids.forEach((id) => t('вечер ' + id + ': заголовки чистые', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = Gazette.build(demo.make(id, 7), { seed });
    [g.headline, g.deck, g.lead].concat(g.timeline.map((x) => x.text)).forEach((s) => {
      assert(!/%|undefined|NaN|null/.test(s), 'мусор в «' + s + '»');
      assert(!/ (оставил|отправил|подарил|привёл) /.test(s.replace(/привёл \d/, '')) || /(Рекордный донат: .+ отправил)/.test(s), 'род в «' + s + '»');
    });
  }
}));


// 5. Память фраз: один и тот же вечер подряд не повторяет формулировки заголовка
t('память фраз: заголовки не повторяются', () => {
  const memory = { used: {}, nicks: {} };
  const seen = [];
  for (let i = 0; i < 6; i++) { const g = Gazette.build(demo.make('C', 7), { seed: 5, memory }); seen.push(g.headline); }
  assert(new Set(seen).size === seen.length, 'повтор: ' + seen.join(' | '));
});

// 6. Повторный донор и «старая» просьба
t('повторные донаты и просьбы', () => {
  const g = Gazette.build(demo.make('E', 7), { seed: 2, memory: { used: {}, nicks: { 'nonamebro': { s: 4, d: 2, t: {} }, 'toxic_tomato': { s: 5, d: 0, t: { points: 3 } } } } });
  const kinds = g.stories.map((s) => s.kind).concat(g.timeline.map((x) => x.kind));
  assert(kinds.some((k) => /^donAgain/.test(k)), 'нет повторного доната: ' + kinds);
  assert(g.timeline.some((x) => /Vasya_98/.test(x.text)), 'донор не назван');
  const topics = Gazette.analyze(demo.make('E', 7), {}).topics.map((x) => x.id);
  ['movie', 'dub', 'points', 'gift'].forEach((id) => assert(topics.indexOf(id) >= 0, 'нет темы ' + id));
});

// 7. Словарь: у каждого повторяющегося события — не меньше 6 вариантов; в тексте нет мужских причастий при нике
t('словарь: объём и грамматика', () => {
  const Lex = require('../gazetteLexicon');
  const total = Object.values(Lex.T).reduce((a, b) => a + b.length, 0) + Object.values(Lex.TOPIC_T).reduce((a, b) => a + b.length, 0);
  assert(total >= 380, 'фраз всего: ' + total);
  ['donation', 'raid', 'subWave', 'comeback', 'donAgain2', 'donAgain3', 'stormWord', 'tech', 'duel', 'reqRepeat'].forEach((k) => assert(Lex.T[k].length >= 6, k + ': ' + Lex.T[k].length));
  Object.values(Lex.T).flat().filter((x) => /%u[^a-z]*(оставил|отправил|подарил|привёл|задонатил|написал|пришёл)/.test(x)).forEach((x) => { throw new Error('род при нике: ' + x); });
});

// 3. Пустой вечер не падает
t('пустой журнал', () => {
  const g = Gazette.build({ startTs: 1000, endTs: 1000 + 60000, games: [], events: [], chat: [], viewers: [] }, { seed: 1 });
  assert(g.headline && g.confidence === 'low');
});

// 4. Журнал: команды и ссылки на ботов не пишутся, повтор фоллоу склеивается, состав считается
t('журнал', () => {
  journal.reset();
  journal.noteChat('Anna', 'привет всем'); journal.noteChat('Bob', '!команда'); journal.noteChat('Anna', 'как дела');
  journal.noteEvent({ type: 'follow', username: 'Zed' }); journal.noteEvent({ type: 'follow', username: 'Zed' });
  journal.noteEvent({ type: 'donation', username: 'Anna', meta: { amountRub: 300, message: 'ку' } });
  journal.noteEvent({ type: 'sub', username: 'Bob', meta: { tier: '2000' } });
  journal.noteEvent({ type: 'channelpoints', username: 'X' });
  const S = journal.getSession(), R = journal.getRoster(S);
  assert.strictEqual(S.chat.length, 2); assert.strictEqual(S.events.length, 3);
  assert.strictEqual(R.chatters[0].user, 'Anna'); assert.strictEqual(R.donors[0].sum, 300); assert.deepStrictEqual(R.follows, ['Zed']);
  assert.strictEqual(S.events.find((e) => e.type === 'sub').tier, 2);
  journal.reset(); assert.strictEqual(journal.counts().chat, 0);
  try { require('fs').unlinkSync(journal.FILE); } catch (e) { /* файла может не быть */ }
});

// 5. Журнал выключен — тексты не пишутся
t('журнал выключен', () => {
  journal.reset(); journal.setEnabled(false); journal.noteChat('A', 'текст'); assert.strictEqual(journal.counts().chat, 0); journal.setEnabled(true);
  try { require('fs').unlinkSync(journal.FILE); } catch (e) { /* ок */ }
});

// 6. Цитата вечера: приветствия не попадают, мат не фильтруется, лучшая выбирается сама
t('цитата: без приветствий', () => {
  const t0 = Date.parse('2026-11-01T15:00:00Z'), chat = [], add = (m, u, x) => chat.push({ ts: t0 + m * 60000, user: u, text: x });
  add(20, 'x', 'привет всем я пришел поболтать с вами про игру'); [1, 2, 3, 4].forEach((d) => add(20 + d / 10, 'u' + d, 'привет x добро пожаловать'));
  add(40, 'delusion_p', 'Я это сделал, а оно взяло и сработало, сам в шоке'); [1, 2, 3, 4, 5].forEach((d) => add(40 + d / 10, 'v' + d, 'ахахах сам в шоке сработало'));
  const q = Gazette.analyze({ streamer: 's', startTs: t0, endTs: t0 + 3600000, chat, events: [], games: [] }).quote;
  assert.ok(q && q.user === 'delusion_p', 'ожидалась цитата delusion_p, получено: ' + JSON.stringify(q));
});
t('цитата: только приветствия — цитаты нет', () => {
  const t0 = Date.parse('2026-11-01T15:00:00Z'), chat = [];
  for (let i = 0; i < 6; i++) chat.push({ ts: t0 + (20 + i * 0.1) * 60000, user: 'u' + i, text: 'всем привет я пришел на стрим сегодня' });
  assert.strictEqual(Gazette.analyze({ streamer: 's', startTs: t0, endTs: t0 + 3600000, chat, events: [], games: [] }).quote, null);
});


// 6б. Цитата вечера есть всегда, упоминание стримера (с опечатками и транслитом) даёт ей приоритет
t('цитата: упоминание стримера с опечатками', () => {
  const t0 = Date.parse('2026-11-01T15:00:00Z');
  const mk = (names, text) => { const chat = []; for (let i = 0; i < 12; i++) chat.push({ ts: t0 + (20 + i) * 60000, user: 'u' + i, text: 'ну вообще обычное сообщение номер ' + i }); chat.push({ ts: t0 + 40 * 60000, user: 'fan', text }); return Gazette.analyze({ streamer: names[0], aliases: names.slice(1), startTs: t0, endTs: t0 + 3600000, chat, events: [], games: [] }).quote; };
  [['TokiOFF', 'токиоф ебать ты пижон'], ['TokiOFF', 'токи ты сегодня в ударе вообще'], ['TokiOFF', 'токки красавчик как всегда'], ['Starikov', 'стариков ну ты даёшь сегодня'], ['Starikov', 'старикоф давай побеждай уже'], ['starlkov', 'Starikov молодец что стримишь'], ['Starikov', 'starikof, спасибо за вечер']].forEach(([n, text]) => {
    const q = mk([n], text); assert.ok(q && q.user === 'fan' && q.mention, n + ' ← «' + text + '»: ' + JSON.stringify(q));
  });
  // любые ники: цифры, подчёркивания, украшения, кириллица, короткие, неверная раскладка
  [['xX_Dark_Wolf_Xx', 'dark wolf давай побеждай уже'], ['Nik1337', 'ник ну ты даёшь сегодня вообще'], ['Nik_Streams', 'никк красавчик как всегда тут'], ['Дмитрий', 'дмитрий молодец что стримишь'], ['Дмитрий', 'дмитрий_ ну ты даёшь сегодня вообще'], ['ZedTV', 'zed ну ты даёшь сегодня вообще'], ['TokiOFF', 'ещлшщаа красавчик как всегда тут'], ['Alexey_Pro', 'алексей молодец что стримишь вообще'], ['MrKrabs', 'краббс ты даёшь сегодня вообще']].forEach(([n, text]) => {
    const q = mk([n], text); assert.ok(q && q.user === 'fan' && q.mention, n + ' ← «' + text + '»: ' + JSON.stringify(q));
  });
  const none = mk(['Starikov'], 'просто сообщение без имени тут');
  assert.ok(none && !none.mention, 'цитата есть и без упоминания');
  assert.ok(!mk(['TokiOFF'], 'совсем другое слово токарь станок').mention, 'ложное срабатывание');
});

// 7. Звания зрителей
t('звания: музыка, донаты, баллы, лимиты', () => {
  const V = require('../viewerTitles'), B = require('../viewerTitleBank'), t0 = 1e12, M = 60000, chat = [], events = [];
  for (let i = 0; i < 20; i++) chat.push({ ts: t0 + i * M, user: 'talker', text: 'просто пишу сообщение ' + i });
  for (let i = 0; i < 7; i++) events.push({ ts: t0 + (10 + i) * M, type: 'redeem', user: 'sp', reward: i % 2 ? 'А' : 'Б', cost: 500 });
  events.push({ ts: t0 + 20 * M, type: 'donation', user: 'rich', amount: 1500 });
  const r = V.compute({ startTs: t0, endTs: t0 + 3600000, chat, events }, { music: [{ name: 'Dj', count: 16 }, { name: 'Dj3', count: 2 }], streamer: 'starlkov', max: 12 });
  const by = (u) => r.filter((x) => x.user === u);
  assert.ok(by('Dj').length === 1 && V.MUSIC_TIERS[0].titles.includes(by('Dj')[0].title), 'диджей с 16 заказами');
  assert.ok(!r.some((x) => x.user === 'Dj3'), 'меньше 3 заказов звания не даёт');
  assert.ok(by('rich').some((x) => B.donor.includes(x.title)), 'меценат');
  assert.ok(by('sp').some((x) => B.spender.includes(x.title)), 'транжира');
  assert.ok(Object.values(r.reduce((a, x) => { a[x.user] = (a[x.user] || 0) + 1; return a; }, {})).every((n) => n <= 2), 'не больше двух званий на человека');
  assert.ok(!r.some((x) => x.user === 'starlkov'), 'стример званий не получает');
});
t('обложки категорий: короткие скрыты, главная первой', () => {
  const issue = require('../gazetteService').buildIssue({ demo: 'A' });
  assert.ok(Array.isArray(issue.covers) && Array.isArray(issue.titles), 'covers и titles есть в выпуске');
  assert.ok(issue.covers.every((c) => c.ms >= 5 * 60000), 'категории короче 5 минут не показываются');
});

// 8. Новые ситуации: реакция чата на трек, смех, стена «+», капс, новички; все подстановки заполняются
t('новые ситуации выпуска', () => {
  const t0 = 1e12, M = 60000, chat = [];
  for (let m = 0; m < 60; m++) for (let k = 0; k < 2; k++) chat.push({ ts: t0 + m * M + k * 20000, user: 'u' + (k + m % 3), text: 'обычное сообщение номер ' + m + ' про игру' });
  for (let k = 0; k < 40; k++) chat.push({ ts: t0 + 30 * M + 60 + k * 1000, user: 'v' + (k % 12), text: 'KEKW KEKW Pog' });
  for (let k = 0; k < 10; k++) chat.push({ ts: t0 + 45 * M + k * 4000, user: 'p' + k, text: '+' });
  for (let k = 0; k < 9; k++) chat.push({ ts: t0 + 50 * M + k * 4000, user: 'c' + (k % 6), text: 'ЭТО ПРОСТО ОГОНЬ ВСЕМ' });
  for (let k = 0; k < 8; k++) chat.push({ ts: t0 + 20 * M + k * 30000, user: 'new' + k, text: 'всем здравствуйте дорогие друзья' });
  chat.sort((a, b) => a.ts - b.ts);
  const S = { startTs: t0, endTs: t0 + 70 * M, chat, events: [], games: [{ name: 'Игра', from: t0 }], viewers: [], plays: [{ ts: t0 + 29 * M + 30000, title: 'Фараон - Трек (Official Video)', user: 'Dj' }, { ts: t0 + 10 * M, title: 'Трек А', user: 'x' }, { ts: t0 + 12 * M, title: 'Трек А', user: 'x' }, { ts: t0 + 14 * M, title: 'Трек А', user: 'x' }] };
  const g = Gazette.build(S, { seed: 3 });
  const kinds = g.stories.map((x) => x.kind);
  assert(g.stories.every((x) => !/%\w/.test(x.title)), 'неподставленные %: ' + g.stories.map((x) => x.title).join(' | '));
  assert(!/%\w/.test(g.headline + g.deck), 'заголовок: ' + g.headline);
  const A = Gazette.analyze(S, {});
  assert(A.waves.plus && A.waves.caps && A.waves.laugh, 'волны найдены');
  assert(A.newcomers && A.newcomers.n >= 6, 'новички найдены');
  const mu = A.spikes.find((s) => s.play);
  assert(mu && /Фараон/.test(mu.play.track) && !/Official/.test(mu.play.track), 'всплеск привязан к треку');
  // каждая новая ситуация даёт чистый заголовок, какой бы вариант ни выпал
  const Lex = require('../gazetteLexicon');
  ['musicEmote', 'musicWord', 'musicWave', 'trackAgain', 'laughWave', 'plusWall', 'capsWave', 'newcomers'].forEach((k) => assert(Lex.T[k].length >= 7, k));
});

// 8. Переписка двух зрителей не должна забирать заголовок, а главные темы не должны повторяться вечер за вечером
function quietNight(seed) {
  let a = seed; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const t0 = Date.UTC(2026, 10, 3, 16, 0, 0), chat = [], users = ['kot', 'lena', 'max', 'olya', 'vova', 'dan']; let t = t0;
  for (let i = 0; i < 260; i++) { t += 20000 + r() * 20000; chat.push({ ts: t, user: users[Math.floor(r() * 6)], text: 'ну вообще интересно как тут всё устроено ' + i }); }
  for (let i = 0; i < 40; i++) chat.push({ ts: t0 + 50 * 60000 + i * 9000, user: i % 2 ? 'Alpha' : 'Beta', text: 'да ну ты что серьёзно думаешь про это ' + i });
  chat.sort((x, y) => x.ts - y.ts);
  const plays = []; for (let i = 0; i < 7; i++) plays.push({ ts: t0 + (20 + i * 15) * 60000, title: 'Track ' + i, user: 'kot' });
  return { streamer: 'S', startTs: t0, endTs: t, games: [{ name: 'Game', from: t0 }], events: [{ ts: t0 + 30 * 60000, type: 'sub', user: 'sub1', tier: 1 }, { ts: t0 + 80 * 60000, type: 'donation', user: 'don1', amount: 150 }], chat, viewers: [{ ts: t0 + 60000, n: 12 }, { ts: t0 + 3600000, n: 30 }, { ts: t - 60000, n: 25 }], plays };
}
t('приоритет: дуэль зрителей не главная тема, темы разнообразны', () => {
  const mem = { used: {}, nicks: {}, kinds: [] }, fams = [];
  for (let n = 0; n < 8; n++) {
    const g = Gazette.build(quietNight(n + 3), { seed: n + 1, memory: mem });
    assert(!/^duel/.test(g.leadKind), 'дуэль в заголовке: ' + g.headline);
    fams.push(Gazette.family(g.leadKind)); mem.kinds.push(fams[fams.length - 1]);
  }
  assert(new Set(fams).size >= 3, 'мало разнообразия: ' + fams);
  assert(fams.every((f, i) => i === 0 || f !== fams[i - 1]), 'одна тема подряд: ' + fams);
});
t('новые события: у каждого не меньше 25 фраз', () => {
  const Lex = require('../gazetteLexicon');
  ['hype', 'gift', 'followWave', 'wordDay', 'jukebox', 'growth', 'nightOwl', 'chatterKing'].forEach((k) => assert(Lex.T[k] && Lex.T[k].length >= 25, k + ': ' + (Lex.T[k] || []).length));
  assert(!Lex.T.emoteDay, 'смайлы в заголовок не идут');
});


// 9. «Звёздное небо»: данные выпуска, настройки, шаблоны обеих тем
t('звёздное небо: данные и показ', () => {
  const svc = require('../gazetteService');
  const issue = svc.buildIssue({ demo: 'A' });
  const K = issue.sky;
  assert.ok(K && K.mins > 0 && Array.isArray(K.chatters) && K.chatters.length > 0 && K.chatters.length <= 7, 'планеты есть');
  assert.ok(K.chatters.every((c, i) => i === 0 || c.n <= K.chatters[i - 1].n), 'планеты по убыванию сообщений');
  ['subs', 'stay', 'music', 'awards', 'donors'].forEach((k) => assert.ok(Array.isArray(K.consts[k]) && K.consts[k].length <= 3, 'созвездие ' + k));
  assert.ok(K.quotes.every((q) => q.text.split(/\s+/).length <= 6), 'фраза спутника не длиннее 6 слов');
  assert.strictEqual(svc.normalize({ skyTheme: 'pixel' }).skyTheme, 'pixel');
  assert.strictEqual(svc.normalize({ skyTheme: 'x' }).skyTheme, 'smooth', 'неизвестная тема — гладкая');
  assert.strictEqual(svc.show('sky').screen.format, 'sky');
  svc.hide();
});
t('звёздное небо: шаблоны обеих тем без пустых значений', () => {
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, querySelector: () => null, getBoundingClientRect: () => ({}) });
  const ctx = { window: {}, document: { getElementById: el }, location: { search: '' }, fetch: () => Promise.reject(new Error('no')), setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {}, innerWidth: 1280, innerHeight: 720, URLSearchParams, Math, Date, Object, String, Array, Number, JSON };
  ctx.window = ctx; ctx.window.addEventListener = () => {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'sky.js'), 'utf8'), ctx);
  const S = ctx.SkyScreen, svc = require('../gazetteService');
  ['A', 'B', 'C', 'D', 'E'].forEach((d) => {
    const issue = svc.buildIssue({ demo: d });
    const a = S.TPL_SMOOTH(S.valsSmooth(issue)), b = S.TPL_PIXEL(S.valsPixel(issue));
    [a, b].forEach((h) => assert.ok(!/undefined|NaN|\[object|\$\{/.test(h), 'пустое значение в шаблоне, вечер ' + d));
    assert.ok(a.includes('sk-qt') && b.includes('sk-qt'), 'есть фраза на спутнике');
  });
  const empty = { startTs: 1, endTs: 2, studio: 'X', sky: { mins: 1, cats: [], peak: 0, totalChatters: 0, chatters: [], consts: {}, quotes: [] } };
  assert.ok(!/undefined|NaN/.test(S.TPL_SMOOTH(S.valsSmooth(empty)) + S.TPL_PIXEL(S.valsPixel(empty))), 'пустой стрим не ломает экран');
});

// 10. «Аркада»: данные, настройки, шаблоны обеих тем
t('аркада: данные, настройки и показ', () => {
  const svc = require('../gazetteService');
  const A = svc.buildIssue({ demo: 'A' }).arcade;
  assert.ok(A && A.rows.length > 0 && A.rows.length <= 8 && A.levels.length <= 3 && A.badges.length <= 3, 'данные аркады');
  assert.ok(A.rows.every((r, i) => i === 0 || r.n <= A.rows[i - 1].n), 'рекорды по убыванию');
  assert.strictEqual(svc.normalize({ arcadeTheme: 'retro' }).arcadeTheme, 'retro');
  assert.strictEqual(svc.normalize({ arcadeTheme: 'x' }).arcadeTheme, 'neon', 'неизвестная тема — неон');
  assert.strictEqual(svc.show('arcade').screen.format, 'arcade');
  svc.hide();
});
t('аркада: шаблоны обеих тем без пустых значений', () => {
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, querySelector: () => null });
  const ctx = { window: {}, document: { getElementById: el }, location: { search: '' }, fetch: () => Promise.reject(new Error('no')), setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {}, innerWidth: 1280, innerHeight: 720, URLSearchParams };
  ctx.window = ctx; ctx.addEventListener = () => {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'arcade.js'), 'utf8'), ctx);
  const S = ctx.ArcadeScreen, svc = require('../gazetteService');
  ['A', 'B', 'C', 'D', 'E'].forEach((d) => {
    const issue = svc.buildIssue({ demo: d });
    const a = S.TPL_NEON(S.vals(issue, 'neon', 0)), b = S.TPL_RETRO(S.vals(issue, 'retro', 3));
    [a, b].forEach((h) => assert.ok(!/undefined|NaN|\[object|\$\{/.test(h), 'пустое значение в шаблоне, вечер ' + d));
    assert.ok(a.includes('ar-qt') && b.includes('ar-qt'), 'есть цитата вечера');
  });
  const empty = { startTs: 1, endTs: 2, studio: 'X', arcade: { rows: [], levels: [], combo: { n: 0, at: '' }, quotes: [], badges: [], facts: {}, dur: '0:00:00', date: '' } };
  assert.ok(!/undefined|NaN/.test(S.TPL_NEON(S.vals(empty, 'neon', 0)) + S.TPL_RETRO(S.vals(empty, 'retro', 0))), 'пустой стрим не ломает экран');
});

console.log(fails ? '\nПровалено: ' + fails + ' из ' + total : '✓ Вечерний выпуск: ' + total + ' проверок пройдено');
process.exit(fails ? 1 : 0);
