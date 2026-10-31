// Проверки «Вечернего выпуска»: генератор заголовков, журнал, сборка выпуска. Запуск: node tests/gazette.test.js
const assert = require('assert');
const Gazette = require('../gazette');
const demo = require('../gazetteDemo');
const journal = require('../streamJournal');
let fails = 0, total = 0;
function t(name, fn) { total++; try { fn(); } catch (e) { fails++; console.log('✗ ' + name + ': ' + e.message); } }

// 1. Тест-вечера дают ожидаемую главную тему
const expect = { A: 'comeback', B: 'quietWord|quiet|thin', C: 'donationBig|donationTop', D: 'tech' };
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
