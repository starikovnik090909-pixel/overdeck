// gazette.js — сборщик «газеты стрима» из журнала событий. Чистые функции, без зависимостей:
// работает и в Node (require), и в браузере (window.Gazette).
//
// Вход (session):
//   { streamer, startTs, endTs, tzOffsetMin?,
//     games:  [{name, from}],                      // from — ts начала категории
//     events: [{ts, type, user, amount?, count?, tier?, viewers?, text?}],
//             // type: follow | sub | giftsub | donation | raid | hype
//     chat:   [{ts, user, text}],
//     viewers:[{ts, n}] }
// Выход: { headline, deck, lead, stories, timeline, word, emote, quote, heroes, weather, confidence, trace }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gazette = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const Lex = (typeof require === 'function' && typeof module === 'object') ? require('./gazetteLexicon') : self.GazetteLex;

  // ---------- утилиты ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function plural(n, f) {
    n = Math.abs(n); const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return f[0];
    if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return f[1];
    return f[2];
  }
  const NB = ' ';
  const cnt = (n, f) => n + NB + plural(n, f);
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const money = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + NB + '₽';

  const STOP = new Set(('и в не на я что он с как а то все она так его но да ты к у же вы за бы по только ее её мне было вот от меня еще ещё нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это тоже просто типа блин щас ща короче вообще тебе тебя своего очень будем будешь давай стример стрим стриме играть играет сегодня тут тоже опять'
  ).split(' '));

  function tokens(text) {
    const out = [];
    for (const raw of String(text).split(/[\s,.!?;:()«»"'…—-]+/)) {
      if (!raw) continue;
      out.push(raw);
    }
    return out;
  }
  const isEmote = w => /^[A-Za-z][A-Za-z0-9]{2,}$/.test(w) && (/[A-Z]{2,}/.test(w) || /^[a-z]+[A-Z]/.test(w) || /^[A-Z][a-z]+[A-Z]/.test(w));
  const FILLER = /^(а?ха)+х?а?$|^(ха)+$|^ахах|^хаха|^ор+у+$|^лол|^кек|^ееее|^ура+$|^осталось$|^давай|^ладно|^нормально/i;
  const isWord = w => /^[а-яёА-ЯЁa-z]{4,}$/i.test(w) && !isEmote(w) && !STOP.has(w.toLowerCase()) && !FILLER.test(w);
  function stem(w) { // грубое «обрезание» окончаний, чтобы «босс/боссу/боссом» считались вместе
    w = w.toLowerCase().replace(/ё/g, 'е');
    if (w.length > 6) w = w.replace(/(ами|ями|ого|его|ому|ему|ыми|ими|ать|ять|ить|еть|ует|ают)$/, '');
    if (w.length > 4) w = w.replace(/(ов|ев|ах|ях|ой|ей|ом|ем|ам|ям|ы|и|а|я|у|ю|е|о|ь|й)$/, '');
    return w;
  }


  // ---------- упоминание стримера (с опечатками, транслитом и кириллицей) ----------
  const TR = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'i', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'sh', ъ:'', ы:'i', ь:'', э:'e', ю:'u', я:'a' };
  // «звуковая» форма слова: Starikov = Стариков = старикоф = starrikov
  function phon(w) {
    w = String(w).toLowerCase().replace(/[а-яё]/g, c => TR[c] != null ? TR[c] : '');
    w = w.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[cq]/g, 'k').replace(/x/g, 'ks').replace(/w/g, 'v').replace(/[jy]/g, 'i').replace(/f/g, 'v').replace(/l(?=[kv])/g, 'i').replace(/[^a-z0-9]/g, '');
    return w.replace(/(.)\1+/g, '$1');
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 9;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  function nameAliases(names) {
    const out = new Set();
    (names || []).forEach(n => {
      n = String(n || '').trim(); if (!n || /^(стример|streamer)$/i.test(n)) return;
      const whole = phon(n); if (whole.length >= 4) out.add(whole);
      const parts = n.match(/[A-ZА-ЯЁ][a-zа-яё]+|[A-ZА-ЯЁ]+(?![a-zа-яё])|[a-zа-яё]+|\d+/g) || [];
      if (parts.length > 1 && parts[0].length >= 4) out.add(phon(parts[0]));
    });
    return Array.from(out);
  }
  function mentionTest(names) {
    const al = nameAliases(names);
    if (!al.length) return () => false;
    return function (text) {
      return tokens(text).some(raw => {
        const t = phon(raw.replace(/^@/, '')); if (t.length < 4) return false;
        return al.some(a => {
          if (t === a) return true;
          if (t.length >= 4 && a.startsWith(t) && a.length - t.length <= 3) return true;     // «токи», «стари»
          if (t.startsWith(a) && t.length - a.length <= 3) return true;                      // «стариков(у)», «токиофа»
          const d = lev(t, a); return a.length >= 9 ? d <= 2 : a.length >= 5 ? d <= 1 : false; // опечатки
        });
      });
    };
  }

  // ---------- важность событий ----------
  function importance(e) {
    switch (e.type) {
      case 'raid': return 40 + (e.viewers || e.count || 0) / 2;
      case 'donation': return Math.min(70, 12 + (e.amount || 0) / 80);
      case 'sub': return 8 + ((e.tier || 1) - 1) * 5;
      case 'giftsub': return 10 + (e.count || 1) * 3;
      case 'hype': return 55;
      case 'follow': return 1;
      default: return 2;
    }
  }

  // ---------- анализ ----------
  function analyze(S, opts) {
    const trace = [];
    const tz = (S.tzOffsetMin || 0) * 60000;
    const clock = ts => { const d = new Date(ts + tz); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
    const t0 = S.startTs, t1 = Math.max(S.endTs || 0, ...(S.chat || []).map(m => m.ts), t0 + 60000);
    const mins = Math.max(1, Math.ceil((t1 - t0) / 60000));
    const chat = (S.chat || []).filter(m => m.ts >= t0 && m.ts <= t1 && !/^[!/]/.test(m.text));
    const events = (S.events || []).filter(e => e.ts >= t0 && e.ts <= t1);
    const A = { clock, t0, t1, mins, chat, events, trace };

    // чат по минутам
    const buckets = new Array(mins).fill(0);
    chat.forEach(m => { buckets[Math.min(mins - 1, Math.floor((m.ts - t0) / 60000))]++; });
    const live = buckets.filter(x => x > 0);
    const base = Math.max(1, median(live.length ? live : [1]));
    A.base = base; A.buckets = buckets;
    A.peakRate = Math.max(0, ...buckets);

    // зрители
    const vs = (S.viewers || []).filter(v => v.ts >= t0 && v.ts <= t1);
    A.peakViewers = vs.length ? vs.reduce((a, v) => v.n > a.n ? v : a, vs[0]) : null;
    A.avgViewers = vs.length ? Math.round(vs.reduce((a, v) => a + v.n, 0) / vs.length) : 0;
    A.firstViewers = vs.length ? vs[0].n : 0;
    A.lastViewers = vs.length ? vs[vs.length - 1].n : 0;

    // игры
    const games = (S.games || []).slice().sort((a, b) => a.from - b.from);
    A.games = games;
    A.mainGame = (() => {
      if (!games.length) return null;
      let best = null, bd = -1;
      games.forEach((g, i) => { const d = (games[i + 1] ? games[i + 1].from : t1) - g.from; if (d > bd) { bd = d; best = g.name; } });
      return best;
    })();

    // слово и эмоут вечера
    const wc = {}, ec = {}, form = {};
    chat.forEach(m => {
      const seen = new Set();
      tokens(m.text).forEach(w => {
        if (isEmote(w)) { ec[w] = (ec[w] || 0) + 1; return; }
        if (!isWord(w)) return;
        const s = stem(w); if (seen.has(s)) return; seen.add(s);
        wc[s] = (wc[s] || 0) + 1; (form[s] = form[s] || {})[w.toLowerCase()] = (form[s][w.toLowerCase()] || 0) + 1;
      });
    });
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const tw = top(wc)[0];
    A.word = tw && tw[1] >= 5 ? { w: Object.entries(form[tw[0]]).sort((a, b) => b[1] - a[1])[0][0], n: tw[1] } : null;
    const te = top(ec)[0];
    A.emote = te && te[1] >= 8 ? { w: te[0], n: te[1] } : null;
    A.wc = wc; A.form = form;
    trace.push('Слово вечера: ' + (A.word ? '«' + A.word.w + '» ×' + A.word.n + ' (по основе слова, без стоп-слов)' : 'нет — ни одно слово не набрало 5 повторов'));

    // герои
    const byUser = {};
    chat.forEach(m => byUser[m.user] = (byUser[m.user] || 0) + 1);
    const tu = top(byUser)[0];
    const donors = {};
    events.filter(e => e.type === 'donation').forEach(e => donors[e.user] = (donors[e.user] || 0) + (e.amount || 0));
    const td = top(donors)[0];
    A.heroes = { talker: tu ? { user: tu[0], n: tu[1] } : null, donor: td ? { user: td[0], sum: td[1] } : null };
    A.donationTotal = Object.values(donors).reduce((a, b) => a + b, 0);

    // цитата вечера: сообщение, на которое чат «отозвался» (эхо) + смех
    const LAUGH = /(ха){2,}|ахах|хах|kekw|lul|lol|лол|ору|умер(ла|ли)? со смеху|😂|🤣/i;
    // приветствия («привет всем», «здарова», o/) в цитату не попадают: на них отвечает весь чат, но смысла в них нет
    const GREET = /^\s*(?:[!.,:;)\s]*)(?:всем\s+)?(?:прив(?:ет|етик|ед)?|здаро(?:ва|вa)?|здравствуй(?:те)?|дарова?|хай|хей|ку|куку|салам|добр(?:ый|ое|ой|ого)\s+(?:вечер|день|утро|ночи|вечерочек)|доброго\s+(?:времени|вечера|дня|утра)|hello|hi|hey|qq|o\/|\\o|ку-ку|всем\s+(?:хай|ку|привет|здарова|добр\S*)|с\s+началом|добро\s+пожаловать|welcome|ку\s+всем)(?![а-яёa-z0-9])/i;
    const hasGreet = t => GREET.test(t) || /^\s*(?:[\w\u0400-\u04ff]{2,25}[,:]?\s+)?(?:прив(?:ет|етик)?|здаро(?:ва)?|хай|ку)(?![а-яёa-z0-9])/i.test(t) || /(?:^|\s)(?:o\/|\\o|👋)(?:\s|$)/.test(t);
    const firstSeen = {}; chat.forEach(m => { if (!(m.user in firstSeen)) firstSeen[m.user] = m.ts; });
    const earlyEnd = t0 + 5 * 60000;
    const raidTs = A.events.filter(e => e.type === 'raid').map(e => e.ts);
    const isMention = mentionTest([].concat(S.streamer || [], S.aliases || []));
    // кандидаты: каждая «живая» реплика получает очки за отклик чата (эхо, смех), длину и упоминание стримера
    const cands = [];
    for (let i = 0; i < chat.length; i++) {
      const m = chat[i];
      if (m.text.length < 14 || m.text.length > 110) continue;
      if (hasGreet(m.text)) continue;
      if (/(http|www\.|\.ru|\.com)/i.test(m.text)) continue;
      if (/^[A-Za-z0-9\s]+$/.test(m.text) && tokens(m.text).every(isEmote)) continue;
      const wn = tokens(m.text).filter(w => /^[а-яёa-z]{3,}$/i.test(w) && !isEmote(w)).length;
      const mention = isMention(m.text);
      if (wn < (mention ? 3 : 4)) continue;
      const strict = m.ts >= earlyEnd && !raidTs.some(r => m.ts >= r && m.ts - r < 3 * 60000) && !(firstSeen[m.user] === m.ts && wn < 5) && m.text.length <= 95;
      const mine = new Set(tokens(m.text).filter(isWord).map(stem));
      let echo = 0, laugh = 0;
      for (let j = i + 1; j < chat.length && chat[j].ts - m.ts <= 25000; j++) {
        if (chat[j].user === m.user) continue;
        if (hasGreet(chat[j].text)) continue;
        if (LAUGH.test(chat[j].text)) laugh++;
        if (tokens(chat[j].text).some(w => isWord(w) && mine.has(stem(w)))) echo++;
      }
      const score = echo * 1.5 + laugh * 2 + (m.text.length > 30 ? 1 : 0);
      cands.push({ score, user: m.user, text: m.text, ts: m.ts, echo, laugh, mention, strict, wn });
    }
    const rank = c => c.score + (c.mention ? 5 : 0);
    const pickBest = list => list.slice().sort((x, y) => rank(y) - rank(x) || y.wn - x.wn || x.ts - y.ts)[0] || null;
    // 1) отклик чата или упоминание стримера; 2) любая живая реплика: цитата вечера есть всегда, пока в чате хоть что-то писали по делу
    let bestQ = pickBest(cands.filter(c => c.strict && rank(c) >= 6)) || pickBest(cands.filter(c => c.mention)) || pickBest(cands.filter(c => c.strict)) || pickBest(cands);
    A.quote = bestQ ? { score: bestQ.score, user: bestQ.user, text: bestQ.text, ts: bestQ.ts, echo: bestQ.echo, laugh: bestQ.laugh, mention: !!bestQ.mention } : null;
    trace.push('Цитата: ' + (A.quote ? '«' + A.quote.text + '» — ' + (A.quote.mention ? 'упомянут стример, ' : '') + 'эхо ' + A.quote.echo + ', смех ' + A.quote.laugh : 'нет — не нашлось подходящих реплик'));

    // всплески чата
    const thr = Math.max(base * 3, base + 10, 14);
    const sp = []; let cur = null;
    for (let i = 0; i < mins; i++) {
      if (buckets[i] >= thr) {
        if (cur && i - cur.to <= 2) { cur.to = i; cur.total += buckets[i]; cur.peak = Math.max(cur.peak, buckets[i]); }
        else { cur = { from: i, to: i, total: buckets[i], peak: buckets[i] }; sp.push(cur); }
      }
    }
    sp.forEach(s => {
      s.ts = t0 + s.from * 60000; s.te = t0 + (s.to + 1) * 60000;
      const ev = events.filter(e => e.ts >= s.ts - 90000 && e.ts <= s.te + 30000 && importance(e) >= 8).sort((a, b) => importance(b) - importance(a))[0];
      s.cause = ev || null;
      const msgs = chat.filter(m => m.ts >= s.ts && m.ts < s.te);
      const lc = {}, lf = {}, le = {};
      msgs.forEach(m => { const seen = new Set(); tokens(m.text).forEach(w => {
        if (isEmote(w)) { le[w] = (le[w] || 0) + 1; return; }
        if (!isWord(w)) return; const st = stem(w); if (seen.has(st)) return; seen.add(st); lc[st] = (lc[st] || 0) + 1; lf[st] = lf[st] || w.toLowerCase(); }); });
      const w = top(lc)[0], e = top(le)[0];
      s.word = w && w[1] >= Math.max(5, msgs.length * 0.3) ? { w: lf[w[0]], n: w[1] } : null;
      s.emote = e && e[1] >= Math.max(5, msgs.length * 0.15) ? { w: e[0], n: e[1] } : null;
      s.msgs = msgs;
      s.mult = +(s.peak / base).toFixed(1);
      trace.push('Всплеск ' + clock(s.ts) + ': ' + s.peak + ' сообщ/мин (×' + s.mult + ' от нормы ' + base + ') → причина: ' +
        (s.cause ? s.cause.type + ' от ' + s.cause.user : s.word ? 'слово «' + s.word.w + '»' : s.emote ? 'эмоут ' + s.emote.w : 'не найдена'));
    });
    A.spikes = sp;
    // трек, под который случился всплеск (трек начался за ≤3 минуты до всплеска или в его ходе)
    const plays = (S.plays || []).filter(p => p && p.title);
    const cleanTrack = t => String(t).replace(/[\(\[][^\)\]]*[\)\]]/g, ' ').replace(/\b(official|video|audio|lyrics?|клип|hd|hq|4k)\b/ig, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—]+|[\s\-–—]+$/g, '').slice(0, 60);
    sp.forEach(s => { const pl = plays.filter(p => p.ts >= s.ts - 180000 && p.ts <= s.te).sort((a, b) => b.ts - a.ts)[0]; s.play = pl ? { track: cleanTrack(pl.title), user: pl.user } : null; });
    A.plays = plays;
    const trAgain = {}; plays.forEach(p => { const k = cleanTrack(p.title); if (k) trAgain[k] = (trAgain[k] || 0) + 1; });
    const ta = Object.entries(trAgain).filter(e => e[1] >= 3).sort((a, b) => b[1] - a[1])[0];
    A.trackAgain = ta ? { track: ta[0], n: ta[1] } : null;
    // тематические волны: смех, «+», капс, наплыв новичков
    const win = (pred, w, minN, minU) => { let best = null; for (let i = 0; i < chat.length; i++) { if (!pred(chat[i])) continue; let n = 0; const us = new Set(); for (let j = i; j < chat.length && chat[j].ts - chat[i].ts <= w; j++) if (pred(chat[j])) { n++; us.add(chat[j].user); } if (n >= minN && us.size >= minU && (!best || n > best.n)) best = { ts: chat[i].ts, n, users: us.size }; } return best; };
    const isCaps = m => { const l = m.text.replace(/[^A-Za-zА-Яа-яЁё]/g, ''); return l.length >= 6 && l === l.toUpperCase() && !/^[A-Z0-9]+$/.test(l); };
    A.waves = {
      laugh: win(m => LAUGH.test(m.text), 60000, 7, 5),
      plus: win(m => /^\s*\+{1,3}\s*1?\s*$/.test(m.text), 90000, 7, 5),
      caps: win(isCaps, 60000, 6, 4)
    };
    const newbies = chat.filter(m => firstSeen[m.user] === m.ts && m.ts - t0 > 8 * 60000);
    A.newcomers = null;
    for (let i = 0; i < newbies.length; i++) { let n = 0; for (let j = i; j < newbies.length && newbies[j].ts - newbies[i].ts <= 10 * 60000; j++) n++; if (n >= 6 && (!A.newcomers || n > A.newcomers.n)) A.newcomers = { ts: newbies[i].ts, n }; }

    // «F» — отпевание стримера
    const deaths = chat.filter(m => /^\s*(f|ф|rip|рип)\s*[!.]*\s*$/i.test(m.text));
    const dBuckets = {};
    deaths.forEach(m => { const b = Math.floor((m.ts - t0) / 60000 / 3); dBuckets[b] = (dBuckets[b] || 0) + 1; });
    const waves = Object.entries(dBuckets).filter(x => x[1] >= 4).length;
    A.deaths = { msgs: deaths.length, waves };
    trace.push('Отпевания («F»): ' + deaths.length + ' сообщ., ' + waves + ' волн');

    // победный клич
    const WIN = /(^|\s)(гг|gg|победа|победил|выиграл|смог|смогли|красав|наконец|ура|е{3,}|vs|вин|win)/i;
    A.win = null;
    if (deaths.length >= 12) {
      for (const s of sp.slice().reverse()) {
        const hit = s.msgs.filter(m => WIN.test(m.text)).length;
        if (hit >= Math.max(5, s.msgs.length * 0.25)) { A.win = s; break; }
      }
    }
    if (A.win) trace.push('Камбэк: победный всплеск в ' + clock(A.win.ts) + ' после ' + deaths.length + ' «F»');

    // технические жалобы
    const TECH = /(лаг|фриз|тормоз|завис|не слышн|звука нет|звук пропал|пропал звук|нет звука|мик|рассинхрон|качество|пиксел|квадрат)/i;
    const tech = chat.filter(m => TECH.test(m.text));
    A.tech = { n: tech.length, first: tech[0] ? tech[0].ts : null };
    trace.push('Жалобы на техничку: ' + tech.length);

    // волна подписок
    const subs = events.filter(e => e.type === 'sub' || e.type === 'giftsub').sort((a, b) => a.ts - b.ts);
    A.subWave = null;
    for (let i = 0; i < subs.length; i++) {
      let n = 0, j = i;
      while (j < subs.length && subs[j].ts - subs[i].ts <= 5 * 60000) { n += subs[j].type === 'giftsub' ? (subs[j].count || 1) : 1; j++; }
      if (n >= 4 && (!A.subWave || n > A.subWave.n)) A.subWave = { n, ts: subs[i].ts, te: subs[j - 1].ts };
    }
    if (A.subWave) trace.push('Волна подписок: ' + A.subWave.n + ' за ≤5 мин в ' + clock(A.subWave.ts));

    // ---------- темы чата: просьбы и разговоры ----------
    A.topics = []; A.userTopics = {};
    Lex.TOPICS.forEach(tp => {
      const ms = chat.filter(m => tp.rx.test(m.text));
      if (!ms.length) return;
      const byU = {}; ms.forEach(m => { byU[m.user] = (byU[m.user] || 0) + 1; });
      Object.keys(byU).forEach(u => { if (byU[u] >= 2 && tp.repeat < 99) (A.userTopics[u] = A.userTopics[u] || {})[tp.id] = byU[u]; });
      const users = Object.keys(byU).length;
      if (ms.length >= tp.minMsgs && users >= tp.minUsers) {
        const tu = top(byU)[0];
        A.topics.push({ id: tp.id, what: tp.what, n: ms.length, users, top: { user: tu[0], n: tu[1] }, first: ms[0].ts, byU, rep: tp.repeat });
        trace.push('Тема «' + tp.id + '»: ' + ms.length + ' сообщ. от ' + users + ' зрителей');
      }
    });

    // дуэль: два ника почти монополизируют чат в окне 8 минут
    A.duel = null;
    for (let w = 0; w + 8 <= mins + 1; w += 2) {
      const ws = t0 + w * 60000, we = ws + 8 * 60000;
      const msgs = chat.filter(m => m.ts >= ws && m.ts < we);
      if (msgs.length < 14) continue;
      const cu = {}; msgs.forEach(m => { cu[m.user] = (cu[m.user] || 0) + 1; });
      const tt = top(cu); if (tt.length < 2) continue;
      const [[ua, na], [ub, nb]] = tt;
      let turns = 0, prevU = null; msgs.forEach(m => { if (m.user !== ua && m.user !== ub) return; if (prevU && prevU !== m.user) turns++; prevU = m.user; });
      if (na >= 10 && nb >= 10 && (na + nb) / msgs.length >= 0.45 && turns >= 16 && (!A.duel || na + nb > A.duel.n)) {
        const wc2 = {}, f2 = {};
        msgs.filter(m => m.user === ua || m.user === ub).forEach(m => { const seen = new Set(); tokens(m.text).forEach(x => { if (!isWord(x)) return; const st = stem(x); if (seen.has(st)) return; seen.add(st); wc2[st] = (wc2[st] || 0) + 1; f2[st] = f2[st] || x.toLowerCase(); }); });
        const tw2 = top(wc2)[0];
        A.duel = { a: ua, b: ub, n: na + nb, ts: ws, word: tw2 && tw2[1] >= 3 ? f2[tw2[0]] : null };
      }
    }
    if (A.duel) trace.push('Дуэль: ' + A.duel.a + ' и ' + A.duel.b + ', ' + A.duel.n + ' реплик' + (A.duel.word ? ', слово «' + A.duel.word + '»' : ''));

    // смена темы: самое частое слово начала vs конца вечера
    A.shift = null;
    if (mins >= 45 && chat.length >= 120) {
      const part = (from, to) => { const c = {}, f = {}; const pm = chat.filter(m => m.ts >= t0 + from * mins * 60000 && m.ts < t0 + to * mins * 60000); pm.forEach(m => { const seen = new Set(); tokens(m.text).forEach(x => { if (!isWord(x)) return; const st = stem(x); if (seen.has(st)) return; seen.add(st); c[st] = (c[st] || 0) + 1; f[st] = f[st] || x.toLowerCase(); }); }); const t1w = top(c)[0]; return t1w ? { st: t1w[0], w: f[t1w[0]], n: t1w[1], share: t1w[1] / Math.max(1, pm.length) } : null; };
      const p1 = part(0, 0.34), p3 = part(0.66, 1.01);
      if (p1 && p3 && p1.st !== p3.st && p1.n >= 6 && p3.n >= 6 && p1.share >= 0.12 && p3.share >= 0.12 && (wc[p1.st] || 0) < 3 * p1.n) A.shift = { a: p1.w, b: p3.w };
    }

    // самая длинная пауза в чате
    A.silence = null;
    for (let i = 1; i < chat.length; i++) { const g = chat[i].ts - chat[i - 1].ts; if (g >= 8 * 60000 && (!A.silence || g > A.silence.g)) A.silence = { g, ts: chat[i - 1].ts }; }
    A.byUser = byUser;

    return A;
  }

  // ---------- шаблоны заголовков ----------
  // Банки фраз лежат в gazetteLexicon.js. %u — ник (не склоняется), %n — число и т.д.; без рода при нике.
  const T = Object.assign({}, Lex.T);
  Object.keys(Lex.TOPIC_T).forEach(k => { T['topic_' + k] = Lex.TOPIC_T[k]; });
  const DECK = Lex.DECK;

  // ---------- приоритеты и разнообразие ----------
  // Семейство истории: одинаковые по сути темы считаются одной, чтобы не ставить их в заголовок вечер за вечером.
  function family(kind) {
    if (/^duel/.test(kind)) return 'duel';
    if (/^topic_|^req/.test(kind)) return 'request';
    if (/^donation|^donAgain|^donReturn/.test(kind)) return 'donation';
    if (/^storm/.test(kind)) return 'storm';
    if (/^music|^trackAgain|^jukebox/.test(kind)) return 'music';
    if (/^(laughWave|plusWall|capsWave)$/.test(kind)) return 'wave';
    if (/^(sub|subWave|gift)$/.test(kind)) return 'subs';
    if (/^(follow|followWave)$/.test(kind)) return 'follows';
    if (/^game/.test(kind)) return 'game';
    return kind;
  }
  // Болтовня чата — второй эшелон: события канала (рейд, донат, подписки, камбэк, трек…) всегда важнее переписки двух зрителей.
  const CHAT_TIER = /^(duel|duelWord|topic_.+|reqRepeat|reqAgain|laughWave|plusWall|capsWave|newcomers|regulars|silence|topicShift|chatterKing|wordDay|stormCause)$/;
  const CHAT_CAP = 32;
  const RECENT_PENALTY = [16, 10, 6, 3]; // штраф за тему, которая уже была главной в последних выпусках (от самого свежего)

  // ---------- сборка ----------
  // Память фраз: memory.used[key] — индексы недавно использованных; берём случайную из свободных.
  function pickTpl(pool, key, rand, memory, picks) {
    const keep = Math.max(1, Math.min(pool.length - 1, Math.ceil(pool.length * 0.75)));
    const used = ((memory && memory.used && memory.used[key]) || []).slice(-keep);
    let free = [];
    for (let i = 0; i < pool.length; i++) if (used.indexOf(i) < 0) free.push(i);
    if (!free.length) free = pool.map((_, i) => i);
    const idx = free[Math.floor(rand() * free.length)];
    if (memory) {
      memory.used = memory.used || {};
      const arr = (memory.used[key] = memory.used[key] || []);
      arr.push(idx); while (arr.length > keep) arr.shift();
    }
    if (picks) picks.push({ key, idx });
    return pool[idx];
  }
  function fill(tpl, v) {
    return tpl.replace(/%(\w+)/g, (m, k) => (v[k] != null ? v[k] : m));
  }

  function build(S, opts) {
    opts = opts || {};
    const rand = rng(opts.seed || 1);
    const A = analyze(S, opts);
    const { clock, trace } = A;
    const memory = opts.memory || null;
    const nicks = (memory && memory.nicks) || {};
    const picks = [];
    const stories = [];

    // кандидаты на главную тему
    if (A.win) {
      stories.push({ kind: 'comeback', score: 90 + Math.min(A.deaths.msgs, 40), ts: A.win.ts, v: { n: A.deaths.waves, nw: cnt(A.deaths.waves, ['раз', 'раза', 'раз']), time: clock(A.win.ts) }, why: 'победный всплеск после ' + A.deaths.waves + ' волн «F» (' + A.deaths.msgs + ' сообщ.)' });
    }
    A.events.filter(e => e.type === 'raid').forEach(e => stories.push({ kind: 'raid', score: importance(e) + 20, ts: e.ts, v: { u: e.user, n: e.viewers || e.count || 0, viewers: plural(e.viewers || e.count || 0, ['зритель', 'зрителя', 'зрителей']) }, why: 'рейд ' + (e.viewers || e.count) }));
    const dons = A.events.filter(e => e.type === 'donation').sort((a, b) => b.amount - a.amount);
    // донаты по людям: повтор за вечер и возвращение с прошлых стримов
    const perU = {};
    A.events.filter(e => e.type === 'donation' && e.user).sort((a, b) => a.ts - b.ts).forEach(e => { const p = (perU[e.user] = perU[e.user] || { n: 0, sum: 0, last: e }); p.n++; p.sum += e.amount || 0; p.last = e; });
    const again = new Set();
    Object.keys(perU).forEach(u => {
      const p = perU[u]; if (p.n < 2) return;
      again.add(u);
      const kind = p.n === 2 ? 'donAgain2' : p.n === 3 ? 'donAgain3' : p.n <= 5 ? 'donAgain4' : 'donAgainMany';
      stories.push({ kind, score: 30 + p.n * 5 + Math.min(20, p.sum / 400), ts: p.last.ts, v: { u, n: p.n, sum: money(p.sum), amount: money(p.last.amount || 0) }, why: p.n + ' доната от ' + u + ' за вечер' });
    });
    dons.slice(0, 3).forEach((e, i) => {
      if (e.amount < 300) return;
      if (again.has(e.user) && i > 0) return;
      stories.push({ kind: i === 0 ? (e.amount >= 3000 ? 'donationBig' : 'donationTop') : 'donation', score: importance(e) + 15 - i * 5, ts: e.ts, v: { u: e.user, amount: money(e.amount), text: e.text || '' }, why: 'донат ' + e.amount, text: e.text });
    });
    let ret = 0;
    dons.forEach(e => {
      const nk = nicks[String(e.user || '').toLowerCase()];
      if (!nk || !nk.d || ret >= 2 || again.has(e.user) || e.amount < 100) return;
      if (stories.some(x => x.v && x.v.u === e.user && /^donation/.test(x.kind) && x.ts === e.ts)) { const x = stories.find(y => y.v && y.v.u === e.user && y.ts === e.ts && /^donation/.test(y.kind)); if (x && x.kind === 'donation') x.kind = 'donReturn'; ret++; return; }
      stories.push({ kind: 'donReturn', score: 24, ts: e.ts, v: { u: e.user, amount: money(e.amount) }, why: e.user + ' донатил на прошлых стримах' }); ret++;
    });
    if (A.subWave) stories.push({ kind: 'subWave', score: 40 + A.subWave.n * 4, ts: A.subWave.ts, v: { n: A.subWave.n, subs: cnt(A.subWave.n, ['подписка', 'подписки', 'подписок']), min: (A.subWave.te - A.subWave.ts) <= 120000 ? 'пару минут' : cnt(Math.round((A.subWave.te - A.subWave.ts) / 60000), ['минуту', 'минуты', 'минут']) }, why: 'волна подписок' });
    A.events.filter(e => e.type === 'sub').slice(0, 4).forEach(e => stories.push({ kind: 'sub', score: 16, ts: e.ts, v: { u: e.user }, why: 'подписка' }));
    A.spikes.forEach(s => {
      if (A.win && s === A.win) return;
      if (s.play && !(s.cause && (s.cause.type === 'raid' || s.cause.type === 'donation'))) {
        const bm = 30 + Math.min(30, s.mult * 2), pv = { track: s.play.track, u: s.play.user || 'зритель', time: clock(s.ts), rate: s.peak };
        if (s.word) { stories.push({ kind: 'musicWord', score: bm + 12, ts: s.ts, v: Object.assign({ word: s.word.w }, pv), why: 'слово «' + s.word.w + '» под трек «' + s.play.track + '»' }); return; }
        stories.push({ kind: 'musicWave', score: bm + 8, ts: s.ts, v: pv, why: 'всплеск чата под трек «' + s.play.track + '»' }); return;
      }
      if (s.cause && (s.cause.type === 'raid' || s.cause.type === 'donation')) return; // уже есть своя история
      const base = 25 + Math.min(30, s.mult * 2);
      if (s.word) stories.push({ kind: 'stormWord', score: base + 8, ts: s.ts, v: { rate: s.peak, word: s.word.w }, why: 'всплеск ×' + s.mult + ' про «' + s.word.w + '»' });
      else stories.push({ kind: 'stormCause', score: base - 6, ts: s.ts, v: { rate: s.peak, time: clock(s.ts) }, why: 'всплеск без явной причины' });
    });
    if (A.deaths.msgs >= 12 && !A.win) stories.push({ kind: 'deaths', score: 30 + Math.min(25, A.deaths.msgs / 2), ts: A.t0, v: { n: A.deaths.waves, nw: cnt(A.deaths.waves, ['раз', 'раза', 'раз']) }, why: A.deaths.waves + ' волн «F»' });
    if (A.tech.n >= 8) stories.push({ kind: 'tech', score: 28 + Math.min(40, A.tech.n * 1.5), ts: A.tech.first, v: { n: A.tech.n, compl: cnt(A.tech.n, ['жалоба', 'жалобы', 'жалоб']), time: clock(A.tech.first) }, why: A.tech.n + ' жалоб на техничку' });
    if (A.peakViewers && A.avgViewers && !A.events.some(e => e.type === 'raid' && A.peakViewers.ts - e.ts >= 0 && A.peakViewers.ts - e.ts < 15 * 60000) && A.peakViewers.n >= A.avgViewers * 1.35 && A.peakViewers.n >= 15 && A.peakViewers.ts - A.t0 > 15 * 60000) {
      stories.push({ kind: 'peak', score: 30 + (A.peakViewers.n / A.avgViewers) * 6, ts: A.peakViewers.ts, v: { n: A.peakViewers.n, viewers: plural(A.peakViewers.n, ['зритель', 'зрителя', 'зрителей']), time: clock(A.peakViewers.ts) }, why: 'пик ' + A.peakViewers.n + ' при среднем ' + A.avgViewers });
    }
    A.games.slice(1).forEach((g, i) => stories.push({ kind: 'game', score: 22, ts: g.from, v: { a: A.games[i].name, b: g.name, time: clock(g.from) }, why: 'смена категории' }));
    if (A.games.length >= 3) stories.push({ kind: 'gameTour', score: 32, ts: A.games[0].from, v: { games: A.games.map(x => '«' + x.name + '»').join(', ').replace(/, ([^,]*)$/, ' и $1') }, why: A.games.length + ' игры за вечер' });
    if (A.mins >= 240) stories.push({ kind: 'marathon', score: 21, ts: A.t0, v: { dur: Math.floor(A.mins / 60) + NB + plural(Math.floor(A.mins / 60), ['час', 'часа', 'часов']) }, why: 'марафон ' + A.mins + ' мин' });
    if (A.duel) stories.push({ kind: A.duel.word ? 'duelWord' : 'duel', score: 22 + Math.min(8, A.duel.n / 4), ts: A.duel.ts, v: { a: A.duel.a, b: A.duel.b, n: A.duel.n, reps: plural(A.duel.n, ['реплика', 'реплики', 'реплик']), word: A.duel.word || '', time: clock(A.duel.ts) }, why: 'диалог двух зрителей, ' + A.duel.n + ' реплик' });
    if (A.waves.laugh) stories.push({ kind: 'laughWave', score: 27 + Math.min(14, A.waves.laugh.n), ts: A.waves.laugh.ts, v: { n: A.waves.laugh.n, users: cnt(A.waves.laugh.users, ['зритель', 'зрителя', 'зрителей']), msgs: plural(A.waves.laugh.n, ['сообщение', 'сообщения', 'сообщений']), reps: plural(A.waves.laugh.n, ['реплика', 'реплики', 'реплик']), pl: plural(A.waves.laugh.n, ['плюс', 'плюса', 'плюсов']), time: clock(A.waves.laugh.ts) }, why: 'смех: ' + A.waves.laugh.n + ' сообщ. от ' + A.waves.laugh.users });
    if (A.waves.plus) stories.push({ kind: 'plusWall', score: 26 + Math.min(14, A.waves.plus.n), ts: A.waves.plus.ts, v: { n: A.waves.plus.n, users: cnt(A.waves.plus.users, ['зритель', 'зрителя', 'зрителей']), msgs: plural(A.waves.plus.n, ['сообщение', 'сообщения', 'сообщений']), reps: plural(A.waves.plus.n, ['реплика', 'реплики', 'реплик']), pl: plural(A.waves.plus.n, ['плюс', 'плюса', 'плюсов']), time: clock(A.waves.plus.ts) }, why: 'стена «+»: ' + A.waves.plus.n });
    if (A.waves.caps) stories.push({ kind: 'capsWave', score: 25 + Math.min(12, A.waves.caps.n), ts: A.waves.caps.ts, v: { n: A.waves.caps.n, users: cnt(A.waves.caps.users, ['зритель', 'зрителя', 'зрителей']), msgs: plural(A.waves.caps.n, ['сообщение', 'сообщения', 'сообщений']), reps: plural(A.waves.caps.n, ['реплика', 'реплики', 'реплик']), pl: plural(A.waves.caps.n, ['плюс', 'плюса', 'плюсов']), time: clock(A.waves.caps.ts) }, why: 'капс: ' + A.waves.caps.n });
    if (A.newcomers) stories.push({ kind: 'newcomers', score: 26 + Math.min(14, A.newcomers.n * 2), ts: A.newcomers.ts, v: { n: A.newcomers.n, nn: cnt(A.newcomers.n, ['новичок', 'новичка', 'новичков']), time: clock(A.newcomers.ts) }, why: A.newcomers.n + ' новичков за 10 минут' });
    if (A.trackAgain) stories.push({ kind: 'trackAgain', score: 24 + A.trackAgain.n * 2, ts: A.t0, v: { track: A.trackAgain.track, n: A.trackAgain.n, nw: cnt(A.trackAgain.n, ['раз', 'раза', 'раз']) }, why: 'трек «' + A.trackAgain.track + '» ' + A.trackAgain.n + ' раз' });
    if (A.shift) stories.push({ kind: 'topicShift', score: 27, ts: A.t0 + A.mins * 30000, v: { a: A.shift.a, b: A.shift.b }, why: 'тема сменилась с «' + A.shift.a + '» на «' + A.shift.b + '»' });
    if (A.silence) stories.push({ kind: 'silence', score: 17, ts: A.silence.ts, v: { min: cnt(Math.round(A.silence.g / 60000), ['минуту', 'минуты', 'минут']), time: clock(A.silence.ts) }, why: 'пауза в чате ' + Math.round(A.silence.g / 60000) + ' мин' });
    const regs = Object.keys(A.byUser || {}).filter(u => (nicks[u.toLowerCase()] || {}).s >= 3).sort((a, b) => A.byUser[b] - A.byUser[a]).slice(0, 3);
    if (regs.length >= 2) stories.push({ kind: 'regulars', score: 20, ts: A.t0, v: { names: regs.join(', ').replace(/, ([^,]*)$/, ' и $1') }, why: 'завсегдатаи: ' + regs.join(', ') });
    let reqN = 0;
    A.topics.forEach(tp => {
      const light = ['hello', 'sleep', 'food', 'pets', 'back', 'support'].indexOf(tp.id) >= 0;
      stories.push({ kind: 'topic_' + tp.id, score: (light ? 6 : 20) + Math.min(light ? 10 : 14, tp.users * 2.5 + tp.n * 0.8), ts: tp.first, v: { n: tp.n, msgs: plural(tp.n, ['сообщение', 'сообщения', 'сообщений']), reps: plural(tp.n, ['реплика', 'реплики', 'реплик']), users: cnt(tp.users, ['зритель', 'зрителя', 'зрителей']), u: tp.top.user }, why: 'тема «' + tp.id + '»: ' + tp.n + ' сообщ., ' + tp.users + ' зрителей' });
      const rep = Object.entries(tp.byU).sort((a, b) => b[1] - a[1])[0];
      if (rep && tp.rep < 99 && reqN < 2) {
        const was = ((nicks[rep[0].toLowerCase()] || {}).t || {})[tp.id] || 0;
        if (was >= 2 && rep[1] >= 2) { stories.push({ kind: 'reqAgain', score: 33, ts: tp.first, v: { u: rep[0], what: tp.what }, why: rep[0] + ' просил это и раньше' }); reqN++; }
        else if (rep[1] >= tp.rep) { stories.push({ kind: 'reqRepeat', score: 30 + rep[1] * 2, ts: tp.first, v: { u: rep[0], n: rep[1], nw: cnt(rep[1], ['раз', 'раза', 'раз']), what: tp.what }, why: rep[0] + ' просит ' + tp.what + ' ×' + rep[1] }); reqN++; }
      }
    });


    // ---------- новые события вечера ----------
    const hypes = A.events.filter(e => e.type === 'hype');
    if (hypes.length) stories.push({ kind: 'hype', score: 52, ts: hypes[0].ts, v: { time: clock(hypes[0].ts) }, why: 'хайп-трейн' });
    const gifts = A.events.filter(e => e.type === 'giftsub');
    const giftN = gifts.reduce((a, e) => a + (e.count || 1), 0);
    if (giftN >= 3) stories.push({ kind: 'gift', score: 30 + Math.min(24, giftN * 2), ts: gifts[0].ts, v: { n: giftN, gifts: plural(giftN, ['подарочная подписка', 'подарочные подписки', 'подарочных подписок']), u: gifts.slice().sort((a, b) => (b.count || 1) - (a.count || 1))[0].user || 'зритель' }, why: giftN + ' подарочных подписок' });
    const fols = A.events.filter(e => e.type === 'follow').sort((a, b) => a.ts - b.ts);
    for (let i = 0, best = null; i < fols.length; i++) {
      let j = i; while (j < fols.length && fols[j].ts - fols[i].ts <= 10 * 60000) j++;
      const n = j - i; if (n >= 5 && (!best || n > best.n)) best = { n, ts: fols[i].ts };
      if (i === fols.length - 1 && best) stories.push({ kind: 'followWave', score: 27 + Math.min(18, best.n * 2), ts: best.ts, v: { n: best.n, fol: cnt(best.n, ['новый фолловер', 'новых фолловера', 'новых фолловеров']), time: clock(best.ts) }, why: best.n + ' фолловеров за 10 минут' });
    }
    if (A.word && A.word.n >= 15) stories.push({ kind: 'wordDay', score: 19 + Math.min(12, A.word.n / 3), ts: A.t0, v: { word: A.word.w, n: A.word.n }, why: 'слово вечера «' + A.word.w + '» ×' + A.word.n });
    if (A.plays.length >= 5) {
      const pu = {}; A.plays.forEach(p => { if (p.user) pu[p.user] = (pu[p.user] || 0) + 1; });
      const tpu = Object.entries(pu).sort((a, b) => b[1] - a[1])[0];
      stories.push({ kind: 'jukebox', score: 26 + Math.min(16, A.plays.length * 1.5), ts: A.t0, v: { n: A.plays.length, tracks: plural(A.plays.length, ['трек', 'трека', 'треков']), u: tpu ? tpu[0] : 'зритель' }, why: A.plays.length + ' заказанных треков' });
    }
    if (A.firstViewers >= 5 && A.lastViewers >= A.firstViewers * 1.6) stories.push({ kind: 'growth', score: 28 + Math.min(14, (A.lastViewers / A.firstViewers) * 3), ts: A.t1, v: { a: A.firstViewers, b: A.lastViewers }, why: 'аудитория ' + A.firstViewers + ' → ' + A.lastViewers });
    const h0 = Number(clock(A.t0).slice(0, 2));
    if (h0 >= 0 && h0 < 5 && A.mins >= 60) stories.push({ kind: 'nightOwl', score: 23, ts: A.t0, v: { time: clock(A.t0) }, why: 'ночной эфир, старт в ' + clock(A.t0) });
    const tk = A.heroes.talker;
    if (tk && A.chat.length >= 60 && tk.n >= 40 && tk.n / A.chat.length >= 0.2) stories.push({ kind: 'chatterKing', score: 22 + Math.min(10, tk.n / A.chat.length * 20), ts: A.t0, v: { u: tk.user, n: tk.n, msgs: plural(tk.n, ['сообщение', 'сообщения', 'сообщений']) }, why: tk.user + ' написал ' + tk.n + ' из ' + A.chat.length });

    // приоритет: переписка зрителей — второй эшелон, события канала важнее
    stories.forEach(st => { if (CHAT_TIER.test(st.kind)) st.score = Math.min(st.score, CHAT_CAP); });
    // разнообразие: тема (её семейство), которая уже была главной в последних выпусках, теряет очки
    const recent = ((memory && memory.kinds) || []).slice(-RECENT_PENALTY.length).reverse();
    stories.forEach(st => {
      const i = recent.indexOf(family(st.kind));
      st.eff = st.score - (i >= 0 ? RECENT_PENALTY[i] : 0);
    });

    stories.sort((a, b) => b.eff - a.eff);
    stories.forEach(s => { s.title = fill(pickTpl(T[s.kind] || T.thin, s.kind, rand, memory, picks), Object.assign({}, s.v)); });
    // при почти равных кандидатах главную тему выбираем случайно (по зерну выпуска), а не всегда первую
    if (stories.length > 1) {
      const cands = stories.filter(x => x.eff >= stories[0].eff - 4 && x.eff >= 35);
      if (cands.length > 1) { const pick = cands[Math.floor(rand() * cands.length)]; stories.splice(stories.indexOf(pick), 1); stories.unshift(pick); }
    }

    // лид
    let lead = stories[0];
    let confidence = 'high';
    if (!lead || lead.score < 35) {
      confidence = 'low';
      const q = A.chat.length < 40 || A.mins < 25;
      const base = {
        kind: 'quiet', score: 10, ts: A.t0, why: 'громких событий нет — запасной шаблон',
        v: { game: A.mainGame || 'эфир', n: A.chat.length, msgs: plural(A.chat.length, ['сообщение', 'сообщения', 'сообщений']) },
      };
      base.title = fill(pickTpl(A.mainGame && !q ? T.quiet : T.thin, A.mainGame && !q ? 'quiet' : 'thin', rand, memory, picks), base.v);
      if (A.word && !q && rand() < 0.6) { base.kind = 'quietWord'; base.v.word = A.word.w; base.v.wn = A.word.n; base.title = fill(pickTpl(T.quietWord, 'quietWord', rand, memory, picks), base.v); }
      if (!lead || lead.score < 26) { stories.unshift(base); lead = base; }
      else confidence = 'mid';
      trace.push('⚠ Сильной темы нет → запасной заголовок, уверенность: ' + confidence);
    }
    trace.push('Главная тема: ' + lead.kind + ' (вес ' + Math.round(lead.score) + ') — ' + lead.why);

    // подзаголовок
    const dkey = DECK[lead.kind] ? lead.kind : /^topic_/.test(lead.kind) ? 'topic' : /^duel/.test(lead.kind) ? 'duel' : /^req/.test(lead.kind) ? 'reqRepeat' : /^music|^trackAgain/.test(lead.kind) ? 'music' : /^(laughWave|plusWall|capsWave)$/.test(lead.kind) ? 'wave' : lead.kind === 'newcomers' ? 'newcomers' : 'default';
    let deck = fill(pickTpl(DECK[dkey], 'deck_' + dkey, rand, memory, picks), { text: lead.v.text || '', time: lead.v.time || '', u: lead.v.u || '' });
    if (lead.kind === 'donation' || lead.kind === 'donationBig' || lead.kind === 'donationTop') deck = lead.text ? '«' + lead.text + '»' : 'Сообщение к донату не приложено.';

    // хроника
    const tl = stories.slice().sort((a, b) => b.score - a.score).filter(s => s.score >= 16 && s.kind !== 'stormCause' && s.kind !== 'quietWord' && s.kind !== 'quiet' && s.kind !== 'thin').slice(0, 8).sort((a, b) => a.ts - b.ts)
      .map(s => ({ time: clock(s.ts), score: Math.round(s.score), kind: s.kind, text: s.title.replace(/ /g, ' ') }));

    // лид-абзац
    const dur = A.mins >= 90 ? (Math.floor(A.mins / 60) + ' ' + plural(Math.floor(A.mins / 60), ['час', 'часа', 'часов']) + (A.mins % 60 >= 15 ? ' ' + (A.mins % 60) + ' мин' : '')) : A.mins + ' мин';
    const s1 = (S.streamer || 'Стример') + ' провёл в эфире ' + dur + (A.mainGame ? ', главным блюдом была «' + A.mainGame + '»' : '') + '.';
    const s2 = A.peakViewers ? 'В среднем смотрели ' + A.avgViewers + ', пик — ' + A.peakViewers.n + ' в ' + clock(A.peakViewers.ts) + '.' : '';
    const s3 = A.chat.length ? 'Чат набрал ' + A.chat.length + ' ' + plural(A.chat.length, ['сообщение', 'сообщения', 'сообщений']) + (A.peakRate > A.base * 2.5 ? ', в самый жаркий момент — ' + A.peakRate + ' в минуту' : '') + '.' : '';
    const sub = A.events.filter(e => e.type === 'sub' || e.type === 'giftsub').reduce((a, e) => a + (e.type === 'giftsub' ? e.count || 1 : 1), 0);
    const fol = A.events.filter(e => e.type === 'follow').length;
    const s4 = [sub ? cnt(sub, ['новая подписка', 'новые подписки', 'новых подписок']) : '', fol ? cnt(fol, ['новый фолловер', 'новых фолловера', 'новых фолловеров']) : '', A.donationTotal ? 'донатов на ' + money(A.donationTotal) : ''].filter(Boolean);
    const leadText = [s1, s2, s3, s4.length ? 'Итог по аудитории: ' + s4.join(', ') + '.' : ''].filter(Boolean).join(' ');

    // погода
    const storm = A.spikes.length + (A.peakRate / Math.max(1, A.base) > 5 ? 2 : 0);
    let weather;
    if (A.win || lead.kind === 'comeback') weather = { icon: '☀', label: 'Ясно после грозы', note: 'Долгие тучи «F» разошлись к финалу.' };
    else if (A.tech.n >= 8) weather = { icon: '🌫', label: 'Туман, видимость плохая', note: 'Чат жаловался на картинку и звук.' };
    else if (A.donationTotal >= 5000) weather = { icon: '🌤', label: 'Золотой дождь, +' + Math.round(A.donationTotal / 1000) + ' тыс.', note: 'Осадки в виде донатов.' };
    else if (storm >= 3) weather = { icon: '⛈', label: 'Грозовой фронт', note: 'Всплесков чата за вечер: ' + A.spikes.length + '.' };
    else if (A.chat.length / Math.max(1, A.mins) < 2.5) weather = { icon: '🌙', label: 'Ясно, штиль', note: 'Чат шёл вполголоса.' };
    else weather = { icon: '⛅', label: 'Переменная облачность', note: 'Без резких перемен.' };

    return {
      masthead: opts.masthead || 'ВЕСТНИК ' + String(S.streamer || '').toUpperCase(),
      headline: lead.title, deck, lead: leadText, leadKind: lead.kind, stories: stories.slice(0, 6),
      timeline: tl, word: A.word, emote: A.emote, quote: A.quote, heroes: A.heroes, weather, confidence,
      facts: { mins: A.mins, chat: A.chat.length, avg: A.avgViewers, peak: A.peakViewers && A.peakViewers.n, donations: A.donationTotal, subs: sub, follows: fol },
      trace, picks, userTopics: A.userTopics, byUser: A.byUser, buckets: A.buckets, clock: A.clock,
    };
  }

  return { build, analyze, rng, plural, importance, family };
});
