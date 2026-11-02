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

  fresh(async () => [hits[1]]); await m.onChat(msg('!муз длинный')); ok(!m.state().current && /не принят: найденные ролики длиннее/.test(said[0]), 'слишком длинный клип отклоняется');
  fresh(async () => { throw new Error('net'); }); await m.onChat(msg('!муз x')); ok(/не принят: не получилось найти/.test(said[0]), 'ошибка сети');

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
  fresh(); m.update({ skin: 99, skinTheme: 9, view: 'zzz', line: 'top', accent: 'red', volume: 500 }); const s = m.getSettings(); ok(s.skin === 13 && s.skinTheme === 3 && s.view === 'clip' && s.line === 'top' && s.accent === '#e5484d' && s.volume === 100, 'настройки ограничиваются');
  fresh(); await m.addByQuery('x', 'Я'); m.setShow(true); ok(m.state().settings.showVideo, 'показ клипа'); m.stop(); ok(!m.state().current, 'стоп');

  // --- чёрный список ---
  fresh(); m.update({ blWords: 'казино, 18+' });
  await m.onChat(msg('!муз казино тест')); ok(!m.state().current && /запрещён/.test(said[said.length - 1]), 'слово из запроса в чёрном списке');
  fresh(async () => [{ id: 'CCCCCCCCCCC', title: 'Видео про КАЗИНО', channel: 'x', seconds: 100 }, hits[0]]); m.update({ blWords: 'казино' });
  await m.onChat(msg('!муз песня')); ok(m.state().current.id === 'AAAAAAAAAAA', 'трек с запрещённым словом в названии пропускается, берётся следующий');
  fresh(); await m.onChat(msg('!муз a')); m.banTrack('AAAAAAAAAAA', 'Дорадура'); ok(!m.state().current && m.getSettings().blTracks.length === 1, 'бан играющего трека пропускает его');
  await m.onChat(msg('!муз b', { login: 'z', name: 'Z' })); ok(!m.state().current && /не принят/.test(said[said.length - 1]), 'забаненный трек не ставится');
  m.unbanTrack('AAAAAAAAAAA'); ok(m.getSettings().blTracks.length === 0, 'разбан');

  // --- приоритеты и перестановка ---
  fresh(async (q) => [{ id: 'ID' + q.padEnd(9, 'x').slice(0, 9), title: 'T ' + q, channel: '', seconds: 100 }]); m.update({ cooldown: 0, perUser: 9 });
  await m.onChat(msg('!муз one', { login: 'a', name: 'A' })); await m.onChat(msg('!муз two', { login: 'b', name: 'B' })); await m.onChat(msg('!муз three', { login: 'c', name: 'C' }));
  await m.onChat(msg('!муз vip', { login: 'v', name: 'V', roles: { vip: true } }));
  ok(m.state().queue.map((q) => q.by).join() === 'B,C,V', 'VIP встаёт в общую очередь, без приоритета (текущий — A)');
  await m.onChat(msg('!муз sub2', { login: 's', name: 'S', roles: { sub: true } })); ok(m.state().queue.map((q) => q.by).join() === 'B,C,V,S', 'подписчик тоже без приоритета');
  const last = m.state().queue[3].uid; m.move(last, 0); ok(m.state().queue[0].by === 'S', 'перетаскивание в начало');
  await m.onChat(msg('!отмена', { login: 'c', name: 'C' })); ok(m.state().queue.every((q) => q.by !== 'C'), '!отмена убирает свой заказ');

  // --- баллы канала ---
  fresh(); m.update({ pointsOn: true, pointsReward: 'Заказать песню' });
  ok(!(await m.onPoints({ name: 'P', login: 'p', reward: 'Другая награда', input: 'x' })) && !m.state().current, 'чужая награда игнорируется');
  ok(await m.onPoints({ name: 'P', login: 'p', reward: 'заказать песню', input: 'Дора' }) && m.state().current.by === 'P', 'заказ за баллы');
  fresh(); m.update({ pointsOn: false, pointsReward: 'R' }); ok(await m.onPoints({ name: 'P', login: 'p', reward: 'R', input: 'x' }) === 'off' && !m.state().current, 'баллы выключены');

  // --- донаты ---
  fresh(); m.update({ donateOn: true, donateMinRub: 50, donatePrioRub: 200, cooldown: 0, perUser: 1 });
  ok(!(await m.onDonation({ username: 'D', message: 'Дора', rub: 10 })), 'мало для заказа');
  ok(!(await m.onDonation({ username: 'D', message: '', rub: 500 })), 'без текста заказа нет');
  m.update({ donateOn: false }); await m.onChat(msg('!муз first', { login: 'a', name: 'A' })); await m.onChat(msg('!муз second', { login: 'b', name: 'B' })); m.update({ donateOn: true });
  await m.onDonation({ username: 'D1', message: '!муз Дора', rub: 100 }); ok(m.state().queue.map((q) => q.by).join() === 'D1,B', 'обычный донат встаёт выше чата');
  await m.onDonation({ username: 'D2', message: 'Дора', rub: 300 }); ok(m.state().queue[0].by === 'D2', 'крупный донат — вне очереди');
  await m.onDonation({ username: 'D2', message: 'ещё', rub: 300 }); ok(m.state().queue.filter((q) => q.by === 'D2').length === 2, 'донат снимает лимит заказов от зрителя');

  // --- сохранение очереди и история ---
  const fs = require('fs'), os = require('os'), pth = require('path');
  const dir = fs.mkdtempSync(pth.join(os.tmpdir(), 'music-'));
  m.reset(); m.init({ dir, search: async (q) => [{ id: 'ID' + q.padEnd(9, 'x').slice(0, 9), title: 'T ' + q, channel: '', seconds: 100 }], say: async () => true });
  m.update({ cooldown: 0, perUser: 9, blWords: 'abc' }); m.banTrack('ZZZZZZZZZZZ', 'bad');
  await m.onChat(msg('!муз one', { login: 'a', name: 'A' })); await m.onChat(msg('!муз two', { login: 'b', name: 'B' })); await m.onChat(msg('!муз three', { login: 'c', name: 'C' }));
  m.flush(); const before = m.state();
  m.reset(); m.init({ dir, say: async () => true });
  const after = m.state();
  ok(after.current.uid === before.current.uid && after.queue.length === 2 && after.queue[0].by === 'B', 'очередь и текущий трек переживают перезапуск');
  ok(after.settings.blWords === 'abc' && after.settings.blTracks.length === 1, 'чёрный список и настройки сохраняются');
  m.ended(after.current.uid); m.flush();
  const st = m.stats(0); ok(st.total === 2 && st.tracks.length === 2 && st.recent.length === 2, 'история воспроизведений сохраняется');
  m.reset(); m.init({ dir, say: async () => true }); ok(m.stats(0).total === 2, 'история после перезапуска');
  ok(m.stats(Date.now() + 1000).total === 0, 'фильтр по периоду');
  // чарт для виджета: похожие названия склеиваются
  const nt = m.normTitle;
  ok(m.sameSong(nt('Кино - Группа крови (Official Video)'), nt('Группа крови')), 'чарт: «Артист - Песня (Official Video)» = «Песня»');
  ok(m.sameSong(nt('Queen - Bohemian Rhapsody'), nt('Bohemian Rhapsody - Queen')), 'чарт: порядок «артист/песня» не важен');
  ok(m.sameSong(nt('Believer'), nt('Beliver')), 'чарт: опечатка — та же песня');
  ok(!m.sameSong(nt('Капли вниз'), nt('Вечеринка')), 'чарт: разные песни не склеиваются');
  fs.rmSync(dir, { recursive: true, force: true });

  // YouTube не дал проиграть (возрастное ограничение): берём другую версию, потом честно пропускаем с объяснением
  const A1 = { id: 'AAAAAAAAAAA', title: 'Фараон — Порнозвезда', channel: 'x', seconds: 130 }, A2 = { id: 'CCCCCCCCCCC', title: 'Фараон — Порнозвезда (аудио)', channel: 'y', seconds: 131 };
  fresh(async () => [A1, A2]); await m.onChat(msg('!муз Фараон Порнозвезда'));
  ok(m.state().current.id === 'AAAAAAAAAAA' && m.state().current.alts.length === 1, 'в заказе сохранена запасная версия, мат в названии не блокирует');
  await m.playFailed(m.state().current.uid, 150);
  ok(m.state().current.id === 'CCCCCCCCCCC' && /другую версию/.test(said[said.length - 1]), 'после ошибки плеера включилась запасная версия');
  await m.playFailed(m.state().current.uid, 150);
  ok(!m.state().current && /не получилось проиграть/.test(said[said.length - 1]), 'запасных нет — заказ пропущен с объяснением в чате');

  // платный режим: при заказе за баллы/донат команда закрыта для всех, кроме владельца
  fresh(); m.update({ pointsOn: true, pointsReward: 'Песня', cooldown: 0 });
  ok(await m.onChat(msg('!муз x')) && !m.state().current && /отключён: музыку заказывают за баллы канала/.test(said[0]), 'команда закрыта при заказе за баллы');
  ok(m.state().paid === true, 'state.paid');
  await m.onChat(msg('!муз x', { roles: { mod: true, broadcaster: true }, login: 'other', name: 'Other' })); ok(!m.state().current, 'модератор тоже не обходит');
  await m.onChat(msg('!муз owner track', { login: 'Starlkov', name: 'Starlkov' })); ok(m.state().current && m.state().current.by === 'Starlkov', 'владелец заказывает всегда');
  m.update({ pointsOn: false, donateOn: true }); await m.onChat(msg('!муз y')); ok(/донатом/.test(said[said.length - 1]), 'то же при заказе за донат');
  m.update({ enabled: false }); await m.onChat(msg('!муз owner two', { login: 'starlkov', name: 'starlkov' })); ok(m.state().queue.length === 1, 'владелец заказывает даже при выключенном заказе');
  // награда при выключенном заказе: баллы не принимаются, песни в очереди остаются
  const qBefore = m.state().queue.length; fresh(); m.update({ pointsOn: true, pointsReward: 'Песня', enabled: false });
  ok(await m.onPoints({ name: 'V', login: 'v', reward: 'Песня', input: 'x' }) === 'off' && /отключён/.test(said[0]) && !m.state().current, 'награда при выключенном заказе');
  ok(qBefore === 1, 'очередь не сбрасывается при смене режима');
  fresh(); m.update({ pointsOn: true, pointsReward: 'Песня', enabled: true }); ok(await m.onPoints({ name: 'V', login: 'v', reward: 'Песня', input: 'x' }) === true && !!m.state().current, 'награда при включённом заказе');

  console.log('music.test: ' + n + ' проверок ок');
})().catch((e) => { console.error(e); process.exit(1); });
