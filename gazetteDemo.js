// Синтетические вечера для теста газеты (не реальные данные). UMD.
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.Scen = f(); })(typeof self !== 'undefined' ? self : this, function () {
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const USERS = ['Dimych','CatLady','NoNameBro','Vasya_98','kotleta_','MrFreeman','Sonya','Tolyan','xX_Ghost_Xx','Лена','Gamer4ik','borsch','Pasha','Irina_K','toxic_tomato','Max','ded_inside','Аня','Kolya','pixel_fox'];
  const T0 = Date.UTC(2026, 9, 30, 19, 0);
  const M = 60000;

  function make(id, seed) {
    const r = rng(seed || 7);
    const pick = a => a[Math.floor(r() * a.length)];
    const S = { streamer: 'Starikov', startTs: T0, endTs: 0, games: [], events: [], chat: [], viewers: [], id };
    const say = (min, text, user, sec) => S.chat.push({ ts: T0 + min * M + (sec != null ? sec * 1000 : Math.floor(r() * 59000)), user: user || pick(USERS), text });
    const ev = (min, o) => S.events.push(Object.assign({ ts: T0 + min * M + 5000 }, o));
    const phase = (a, b, rate, pool) => { for (let m = a; m < b; m++) { const n = Math.max(0, Math.round(rate + (r() - 0.5) * rate * 0.8)); for (let i = 0; i < n; i++) say(m, pick(pool)); } };
    const curve = (len, pts) => { for (let m = 0; m <= len; m += 5) { let v = 0; for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; if (m >= x0 && m <= x1) v = y0 + (y1 - y0) * (m - x0) / (x1 - x0); } S.viewers.push({ ts: T0 + m * M, n: Math.round(v + (r() - 0.5) * 4) }); } };

    if (id === 'A') {
      S.title = 'Камбэк'; S.games = [{ name: 'Just Chatting', from: T0 }, { name: 'Elden Ring', from: T0 + 15 * M }];
      const LEN = 190; S.endTs = T0 + LEN * M;
      phase(0, 15, 5, ['привет', 'здарова всем', 'как дела?', 'о, стрим начался', 'хай', 'ну что, сегодня босса добиваем?', 'надеюсь сегодня получится']);
      phase(15, 150, 6, ['ну ты чего', 'смотри на перекат', 'сложный босс', 'ловушка а не босс', 'не жадничай', 'попробуй другой билд', 'жди окно', 'босс читерит', 'я бы уже бросил', 'терпение', 'ты сможешь', 'ну еще раз', 'не сдавайся стример']);
      const deathMins = [24, 31, 39, 47, 55, 63, 70, 78, 86, 93, 101, 108, 115, 122, 129, 136, 142, 148, 153, 156];
      deathMins.forEach(d => { for (let i = 0; i < 9; i++) say(d, pick(['F', 'F', 'f', 'F', 'ф', 'RIP', 'F F F']), pick(USERS)); say(d, 'КОНЕЦ', 'ded_inside'); });
      phase(150, 157, 7, ['ну давай', 'последняя фаза', 'ты уже близко', 'дыши', 'чуть-чуть осталось']);
      say(156, 'это было смешно как он орал на экран', 'toxic_tomato', 10); for (let i = 0; i < 6; i++) say(156, pick(['ахах точно', 'ору', 'ХАХАХА', 'это лучшее']), null, 12 + i * 2);
      for (let m = 158; m < 161; m++) for (let i = 0; i < 50; i++) say(m, pick(['ЕЕЕЕЕЕ', 'ПОБЕДА', 'GG', 'КРАСАВА', 'наконец-то!!!', 'ура ура ура', 'ПОБЕДИЛ', 'gg wp', 'смог всё-таки']));
      phase(161, 175, 9, ['это было эпично', 'я аж вспотел', 'gg', 'поздравляю!', 'крутой камбэк', 'теперь следующий босс', 'ты молодец']);
      ev(158, { type: 'sub', user: 'Pasha', tier: 1 }); ev(158, { type: 'sub', user: 'Sonya', tier: 1 }); ev(159, { type: 'giftsub', user: 'MrFreeman', count: 5 }); ev(159, { type: 'sub', user: 'borsch', tier: 2 });
      ev(159, { type: 'donation', user: 'Dimych', amount: 500, text: 'На победную сорокатышь' });
      ev(176, { type: 'raid', user: 'CatLady', viewers: 87 });
      [10, 33, 66, 90, 120].forEach((m, i) => ev(m, { type: 'follow', user: 'user' + i }));
      for (let m = 176; m < 190; m++) for (let i = 0; i < 6; i++) say(m, pick(['привет рейд!', 'всем привет от CatLady', 'добро пожаловать', 'что тут происходит?', 'о, босс побежден!', 'ура рейдерам']));
      curve(LEN, [[0, 22], [15, 28], [60, 31], [120, 34], [150, 40], [160, 96], [175, 90], [176, 170], [190, 160]]);
    }
    if (id === 'B') {
      S.title = 'Тихий вечер'; S.games = [{ name: 'Stardew Valley', from: T0 }]; const LEN = 120; S.endTs = T0 + LEN * M;
      phase(0, LEN, 1.6, ['урожай хороший', 'у меня кот на клавиатуре', 'какая музыка играет?', 'уютно', 'поливай грядки', 'сделай кофе', 'урожай клубники скоро', 'в этой игре так спокойно', 'расскажи про кота', 'мой кот тоже любит ночью бегать', 'добавь рыбалку', 'осень лучшее время года', 'хороший урожай в этом году']);
      ev(30, { type: 'sub', user: 'Sonya', tier: 1 }); ev(77, { type: 'sub', user: 'Max', tier: 1 });
      ev(12, { type: 'follow', user: 'a1' }); ev(44, { type: 'follow', user: 'a2' }); ev(90, { type: 'follow', user: 'a3' });
      curve(LEN, [[0, 14], [50, 20], [80, 23], [120, 17]]);
    }
    if (id === 'C') {
      S.title = 'Донат-вечер'; S.games = [{ name: 'Just Chatting', from: T0 }, { name: 'Dota 2', from: T0 + 50 * M }]; const LEN = 150; S.endTs = T0 + LEN * M;
      phase(0, LEN, 4, ['пикай нормального героя', 'ну и пик', 'сегодня слив', 'ща разнесем', 'мид сильный', 'саппорт опять на фарм', 'ну это уже слишком', 'ахах', 'ладно играй', 'рейтинг растет', 'ты тильтуешь']);
      const donors = [['NoNameBro', 5000, 'Играй уже нормально'], ['Vasya_98', 300, 'на печеньки'], ['kotleta_', 150, ''], ['Лена', 700, 'привет из Казани!'], ['Max', 200, ''], ['Gamer4ik', 100, ''], ['Аня', 1000, 'удачи на ранге'], ['Tolyan', 250, ''], ['Pasha', 400, 'за мид'], ['MrFreeman', 150, ''], ['Irina_K', 300, ''], ['borsch', 120, ''], ['Kolya', 500, 'держись'], ['pixel_fox', 180, '']];
      donors.forEach((d, i) => ev(8 + i * 10, { type: 'donation', user: d[0], amount: d[1], text: d[2] }));
      for (let i = 0; i < 6; i++) say(8 + 0 * 10, 'ВАУ 5000'); for (let i = 0; i < 30; i++) say(9, pick(['5000!!!', 'ВАУ', 'богач', 'вот это донат', 'оооо', 'ЩЕДРО']));
      say(100, 'если он проиграет этот пик я съем свою шапку', 'toxic_tomato'); for (let i = 0; i < 8; i++) say(100, pick(['ахаха', 'записали', 'ору с шапки', 'ждем']));
      curve(LEN, [[0, 40], [60, 55], [120, 62], [150, 50]]);
    }
    if (id === 'D') {
      S.title = 'Слив'; S.games = [{ name: 'Cyberpunk 2077', from: T0 }]; const LEN = 120; S.endTs = T0 + LEN * M;
      phase(0, 25, 4, ['привет', 'ого графика', 'красиво', 'что за мод?']);
      phase(25, 90, 5, ['лагает', 'у меня фризит', 'звук пропал', 'опять тормозит', 'рассинхрон звука', 'квадраты вместо картинки', 'качество 360p?', 'не слышно', 'лагает капец', 'мик пропал', 'нет звука', 'ну когда починишь', 'выключил, пойду спать']);
      phase(90, LEN, 2, ['наконец-то нормально', 'ну вот', 'уже лучше', 'я ушел']);
      ev(95, { type: 'follow', user: 'z1' });
      curve(LEN, [[0, 70], [25, 80], [60, 52], [90, 32], [120, 28]]);
    }
    S.chat.sort((a, b) => a.ts - b.ts);
    return S;
  }
  return { make, ids: ['A', 'B', 'C', 'D'], names: { A: 'Камбэк', B: 'Тихий вечер', C: 'Донат-вечер', D: 'Слив' }, T0 };
});
