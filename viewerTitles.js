// viewerTitles.js — звания зрителей для афиши с титрами («Главный диджей», «Главный транжира», «Меценат вечера»…).
// Чистая функция: берёт журнал стрима (чат + события), заказы музыки и считает, кому какое звание. Никаких побочных эффектов.
'use strict';

// Звания за музыку (!муз и похожие команды) по числу заказов. Какое из звания тира достанется — выбирается по нику, чтобы разные вечера отличались.
const BANK = require('./viewerTitleBank');
const MUSIC_TIERS = [
  { min: 15, titles: BANK.music15 },
  { min: 10, titles: BANK.music10 },
  { min: 5, titles: BANK.music5 },
  { min: 3, titles: BANK.music3 },
];

const plural = (n, f) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? f[0] : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? f[1] : f[2]; };
const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
// название из банка: зависит от ника и даты стрима, так что в разные вечера звания разные
const pick = (kind, user, t0) => { const l = BANK[kind]; return l[hash(String(user) + ':' + Math.floor((t0 || 0) / 86400000)) % l.length]; };
const rub = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
const isEmoteWord = (w) => /^[a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(w) && w.length >= 3;

/**
 * S: { startTs, endTs, chat:[{ts,user,text}], events:[{ts,type,user,amount,count,reward,cost}] }
 * ctx: { music:[{name,login,count}], quote:{user}|null, streamer:'ник' }
 * Возвращает [{ user, title, note, kind }] — не больше max строк, не больше двух званий на человека.
 */
function compute(S, ctx) {
  ctx = ctx || {};
  const chat = S.chat || [], ev = S.events || [], t0 = S.startTs, t1 = Math.max(S.endTs || 0, t0 + 60000);
  const span = Math.max(1, t1 - t0);
  const skip = new Set([String(ctx.streamer || '').toLowerCase()].filter(Boolean));
  const ok = (u) => u && !skip.has(String(u).toLowerCase());
  const out = [];
  const add = (user, title, note, kind, prio) => { if (ok(user)) out.push({ user, title, note: note || '', kind, prio }); };

  // --- музыка ---
  const music = (ctx.music || []).filter((m) => m && m.count >= 3 && ok(m.name || m.login)).sort((a, b) => b.count - a.count).slice(0, 2);
  music.forEach((m, i) => {
    const tier = MUSIC_TIERS.find((x) => m.count >= x.min);
    const name = m.name || m.login;
    add(name, tier.titles[hash(name + ':' + Math.floor(t0 / 86400000)) % tier.titles.length], m.count + ' ' + plural(m.count, ['заказ', 'заказа', 'заказов']) + ' музыки', 'music', 100 - i * 10);
  });

  // --- донаты ---
  const don = {};
  ev.filter((e) => e.type === 'donation' && ok(e.user)).forEach((e) => { const d = don[e.user] || (don[e.user] = { sum: 0, n: 0 }); d.sum += e.amount || 0; d.n++; });
  const donors = Object.entries(don).sort((a, b) => b[1].sum - a[1].sum);
  if (donors.length) add(donors[0][0], pick('donor', donors[0][0], t0), rub(donors[0][1].sum), 'donor', 95);
  const dons = ev.filter((e) => e.type === 'donation' && ok(e.user));
  if (dons.length) {
    const first = dons[0], big = dons.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
    if (dons.length >= 2) add(first.user, pick('firstdon', first.user, t0), rub(first.amount || 0), 'firstdon', 60);
    if (big && dons.length >= 2) add(big.user, pick('bigdon', big.user, t0), rub(big.amount || 0), 'bigdon', 70);
  }
  donors.filter((d) => d[1].n >= 3).slice(0, 1).forEach((d) => add(d[0], pick('generous', d[0], t0), d[1].n + ' доната за вечер', 'generous', 65));

  // --- баллы канала и награды ---
  const red = ev.filter((e) => e.type === 'redeem' && ok(e.user));
  const ru = {};
  red.forEach((e) => { const r = ru[e.user] || (ru[e.user] = { n: 0, sum: 0, by: {} }); r.n++; r.sum += e.cost || 0; r.by[e.reward || '?'] = (r.by[e.reward || '?'] || 0) + 1; });
  const ruList = Object.entries(ru);
  const spender = ruList.slice().sort((a, b) => b[1].sum - a[1].sum)[0];
  if (spender && spender[1].sum >= 1000) add(spender[0], pick('spender', spender[0], t0), spender[1].sum.toLocaleString('ru-RU').replace(/ /g, ' ') + ' баллов', 'spender', 85);
  const king = ruList.slice().sort((a, b) => b[1].n - a[1].n)[0];
  if (king && king[1].n >= 3) add(king[0], pick('king', king[0], t0), king[1].n + ' ' + plural(king[1].n, ['награда', 'награды', 'наград']), 'king', 80);
  const fan = ruList.map(([u, r]) => { const top = Object.entries(r.by).sort((a, b) => b[1] - a[1])[0]; return { u, reward: top[0], n: top[1] }; }).filter((x) => x.n >= 3 && x.reward !== '?').sort((a, b) => b.n - a.n)[0];
  if (fan) add(fan.u, pick('fan', fan.u, t0), '«' + fan.reward + '» ×' + fan.n, 'fan', 62);
  const hunter = ruList.map(([u, r]) => ({ u, k: Object.keys(r.by).length })).filter((x) => x.k >= 3).sort((a, b) => b.k - a.k)[0];
  if (hunter) add(hunter.u, pick('hunter', hunter.u, t0), hunter.k + ' разных награды', 'hunter', 58);
  const shopper = ruList.map(([u, r]) => ({ u, k: Object.keys(r.by).length, n: r.n })).filter((x) => x.k >= 4).sort((a, b) => b.k - a.k)[0];
  if (shopper) add(shopper.u, pick('shopper', shopper.u, t0), shopper.k + ' разных награды', 'shopper', 56);

  // --- подписки и рейды ---
  const subs = ev.filter((e) => (e.type === 'sub' || e.type === 'giftsub') && ok(e.user));
  if (subs.length) add(subs[0].user, pick('firstsub', subs[0].user, t0), '', 'firstsub', 55);
  const gifts = {};
  ev.filter((e) => e.type === 'giftsub' && ok(e.user)).forEach((e) => { gifts[e.user] = (gifts[e.user] || 0) + Math.max(1, e.count || 1); });
  const gifter = Object.entries(gifts).sort((a, b) => b[1] - a[1])[0];
  if (gifter) add(gifter[0], pick('gifter', gifter[0], t0), gifter[1] + ' ' + plural(gifter[1], ['подписка', 'подписки', 'подписок']) + ' в подарок', 'gifter', 75);
  const raid = ev.filter((e) => e.type === 'raid' && ok(e.user)).sort((a, b) => (b.viewers || 0) - (a.viewers || 0))[0];
  if (raid && (raid.viewers || 0) >= 3) add(raid.user, pick('raider', raid.user, t0), 'привёл ' + raid.viewers + ' ' + plural(raid.viewers, ['зрителя', 'зрителей', 'зрителей']), 'raider', 72);

  // --- чат ---
  const msgs = chat.filter((m) => ok(m.user) && !/^[!/]/.test(m.text));
  const cnt = {}, first = {}, last = {}, mentions = {}, emotes = {};
  msgs.forEach((m) => {
    cnt[m.user] = (cnt[m.user] || 0) + 1; if (!(m.user in first)) first[m.user] = m.ts; last[m.user] = m.ts;
    (m.text.match(/@([\wЀ-ӿ]{2,25})/g) || []).forEach((x) => { const u = x.slice(1).toLowerCase(); mentions[u] = (mentions[u] || 0) + 1; });
    const e = m.text.split(/\s+/).filter(isEmoteWord).length; if (e) emotes[m.user] = (emotes[m.user] || 0) + e;
  });
  const users = Object.keys(cnt);
  const talker = users.sort((a, b) => cnt[b] - cnt[a])[0];
  if (talker && cnt[talker] >= 15) add(talker, pick('talker', talker, t0), cnt[talker] + ' ' + plural(cnt[talker], ['сообщение', 'сообщения', 'сообщений']), 'talker', 50);
  const early = msgs.find((m) => m.ts - t0 <= 15 * 60000 && cnt[m.user] >= 3);
  if (early) add(early.user, pick('early', early.user, t0), '', 'early', 40);
  const late = users.filter((u) => first[u] - t0 > span * 0.6 && last[u] - t0 > span * 0.85 && cnt[u] >= 4).sort((a, b) => cnt[b] - cnt[a])[0];
  if (late) add(late, pick('late', late, t0), 'пришёл поздно и остался', 'late', 45);
  const endure = users.filter((u) => cnt[u] >= 8 && last[u] - first[u] >= span * 0.7).sort((a, b) => (last[b] - first[b]) - (last[a] - first[a]))[0];
  if (endure) add(endure, pick('endure', endure, t0), 'почти весь стрим в чате', 'endure', 48);
  const voice = Object.entries(mentions).filter(([u, n]) => n >= 5 && ok(u)).sort((a, b) => b[1] - a[1])[0];
  if (voice) { const real = users.find((u) => u.toLowerCase() === voice[0]) || voice[0]; add(real, pick('voice', real, t0), 'ему отвечали ' + voice[1] + ' ' + plural(voice[1], ['раз', 'раза', 'раз']), 'voice', 52); }
  const emoter = Object.entries(emotes).sort((a, b) => b[1] - a[1])[0];
  if (emoter && emoter[1] >= 15) add(emoter[0], pick('emoter', emoter[0], t0), emoter[1] + ' смайлов', 'emoter', 42);
  if (ctx.quote && ctx.quote.user && ok(ctx.quote.user) && (cnt[ctx.quote.user] || 0) <= 4) add(ctx.quote.user, pick('quiet', ctx.quote.user, t0), 'автор цитаты вечера', 'quiet', 66);

  // не больше двух званий на человека, не больше max строк, по важности
  const per = {};
  const picked = out.sort((a, b) => b.prio - a.prio).filter((x) => { per[x.user] = (per[x.user] || 0) + 1; return per[x.user] <= 2; });
  return picked.slice(0, ctx.max || 8).map(({ user, title, note, kind }) => ({ user, title, note, kind }));
}

module.exports = { compute, MUSIC_TIERS };
