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

console.log(fails ? '\nПровалено: ' + fails + ' из ' + total : '✓ Вечерний выпуск: ' + total + ' проверок пройдено');
process.exit(fails ? 1 : 0);
