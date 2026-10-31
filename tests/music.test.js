// Заказ музыки: разбор поиска, очередь, правила чата.
const assert = require('assert');
const m = require('../musicRequests');
let n = 0; const ok = (c, msg) => { assert(c, msg); n++; };
const hits = [{ id: 'AAAAAAAAAAA', title: 'Дора — Дорадура', channel: 'дора', seconds: 130 }, { id: 'BBBBBBBBBBB', title: 'Длинный', channel: 'x', seconds: 5000 }];
let said = [];
function fresh(search) { m.reset(); said = []; m.init({ noFile: true, search: search || (async () => hits), say: async (t) => { said.push(t); return true; } }); }
const msg = (message, extra) => Object.assign({ login: 'viewer', name: 'Viewer', message, roles: {} }, extra || {});

(async () => {
  ok(m.videoIdFrom('https://youtu.be/dQw4w9WgXcQ?t=5') === 'dQw4w9WgXcQ', 'youtu.be');
  ok(m.videoIdFrom('https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=1') === 'dQw4w9WgXcQ', 'watch');
  ok(m.videoIdFrom('Дора дура') === '', 'не ссылка');
  ok(m.parseSeconds('3:05') === 185 && m.parseSeconds('1:02:03') === 3723, 'длительность');
  const html = '<script>var ytInitialData = ' + JSON.stringify({ a: [{ videoRenderer: { videoId: 'XYZXYZXYZXY', title: { runs: [{ text: 'Песня' }] }, ownerText: { runs: [{ text: 'Канал' }] }, lengthText: { simpleText: '2:10' } } }, { videoRenderer: { videoId: 'LIVELIVELIV', title: { runs: [{ text: 'Эфир' }] } } }] }) + ';</script>';
  const r = m.parseResults(html); ok(r.length === 1 && r[0].id === 'XYZXYZXYZXY' && r[0].seconds === 130, 'разбор выдачи (эфиры без длины пропускаются)');

  fresh(); ok(!(await m.onChat(msg('привет'))), 'обычное сообщение игнорируется');
  ok(await m.onChat(msg('!муз Дора дура')) && m.state().current.id === 'AAAAAAAAAAA', 'первый заказ сразу играет');
  ok(/Играет/.test(said[0]), 'ответ про старт');
  ok(await m.onChat(msg('!муз ещё', { login: 'b', name: 'B' })) && m.state().queue.length === 1, 'второй в очередь');
  await m.onChat(msg('!муз опять')); ok(/подожди/.test(said[said.length - 1]) && m.state().queue.length === 1, 'пауза между заказами');
  ok(await m.onChat(msg('!муз')) && /напиши/.test(said[said.length - 1]), 'пустой заказ');

  fresh(async () => [hits[1]]); await m.onChat(msg('!муз длинный')); ok(!m.state().current && /ничего не нашлось/.test(said[0]), 'слишком длинный клип отклоняется');
  fresh(async () => { throw new Error('net'); }); await m.onChat(msg('!муз x')); ok(/не получилось/.test(said[0]), 'ошибка сети');

  fresh(); m.update({ who: 'sub' }); await m.onChat(msg('!муз x')); ok(!m.state().current && /не всем/.test(said[0]), 'только подписчики');
  await m.onChat(msg('!муз x', { roles: { sub: true } })); ok(!!m.state().current, 'подписчик может');
  fresh(); m.update({ perUser: 1, cooldown: 0 }); await m.onChat(msg('!муз a')); await m.onChat(msg('!муз b')); await m.onChat(msg('!муз c'));
  ok(m.state().queue.length === 1 && /уже 1/.test(said[said.length - 1]), 'лимит заказов на зрителя');

  fresh(); m.update({ cooldown: 0 }); await m.onChat(msg('!муз a')); await m.onChat(msg('!муз b', { login: 'o', name: 'O' }));
  await m.onChat(msg('!скип')); ok(m.state().current.by === 'Viewer' && m.state().queue.length === 1, 'скип зрителя игнорируется');
  await m.onChat(msg('!скип', { roles: { mod: true } })); ok(m.state().current.by === 'O', 'скип модератора');
  const uid = m.state().current.uid; m.ended(uid + 99); ok(m.state().current.uid === uid, 'чужой ended не переключает');
  m.ended(uid); ok(m.state().current === null, 'конец трека, очередь пуста');

  fresh(); m.update({ enabled: false }); ok(!(await m.onChat(msg('!муз x'))) && !m.state().current, 'выключено');
  fresh(); m.update({ skin: 99, view: 'zzz', line: 'top', accent: 'red', volume: 500 }); const s = m.getSettings(); ok(s.skin === 10 && s.view === 'clip' && s.line === 'top' && s.accent === '#e5484d' && s.volume === 100, 'настройки ограничиваются');
  fresh(); await m.addByQuery('x', 'Я'); m.setShow(true); ok(m.state().settings.showVideo, 'показ клипа'); m.stop(); ok(!m.state().current, 'стоп');
  console.log('music.test: ' + n + ' проверок ок');
})().catch((e) => { console.error(e); process.exit(1); });
