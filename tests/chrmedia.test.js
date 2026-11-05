// Хроники: автозаполнение по ссылке Steam и Кинопоиска (на подставных серверах, без сети).
const assert = require('assert');
const http = require('http');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const key = req.headers['x-api-key'];
    if (key === 'bad') { res.statusCode = 401; return res.end('{}'); }
    if (key === 'limit') { res.statusCode = 402; return res.end('{}'); }
    if (req.url.endsWith('/404')) { res.statusCode = 404; return res.end('{}'); }
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ kinopoiskId: 326, nameRu: 'Побег из Шоушенка', nameOriginal: 'The Shawshank Redemption', year: 1994, posterUrl: 'http://x/p.jpg', type: 'FILM' }));
  }
  if (req.url.startsWith('/page/777/')) { res.setHeader('content-type', 'text/html'); return res.end('<html><head><meta property="og:title" content="Игра престолов (сериал, 2011 – 2019) — Кинопоиск"><meta property="og:image" content="//avatars.example/poster/300x450"></head></html>'); }
  if (req.url.startsWith('/page/326/')) { res.setHeader('content-type', 'text/html'); return res.end('<html><head><meta content="Побег из Шоушенка (1994) — Кинопоиск" property="og:title"><meta property="og:image" content="https://a.example/p.jpg"></head></html>'); }
  res.setHeader('content-type', 'text/html'); res.end('<html><body>Вы не робот? captcha</body></html>');
});
srv.listen(0, async () => {
  const port = srv.address().port;
  process.env.OV_KP_API = `http://127.0.0.1:${port}/api/`; process.env.OV_KP_PAGE = `http://127.0.0.1:${port}/page/`;
  const c = require('../chronicles');
  try {
    ok(c.kpId('https://www.kinopoisk.ru/film/326/') === '326' && c.kpId('kinopoisk.ru/series/77044/') === '77044' && c.kpId('https://www.kinopoisk.ru/level/1/film/326/sr/1/') === '326', 'id из ссылок');
    ok(c.kpId('https://google.com/film/1') === null && c.kpId('') === null, 'чужие ссылки не подходят');
    ok(c.steamAppId('https://store.steampowered.com/app/1245620/ELDEN_RING/') === '1245620' && c.steamAppId('https://steamcommunity.com/app/105600') === '105600', 'id Steam');
    const a = await c.kpLookup('https://www.kinopoisk.ru/film/326/', 'good');
    ok(a.title === 'Побег из Шоушенка' && a.year === '1994' && a.poster === 'http://x/p.jpg' && a.kind === 'film', 'через API: название, год, обложка');
    let e = null; try { await c.kpLookup('https://www.kinopoisk.ru/film/326/', 'bad'); } catch (x) { e = x; } ok(e && e.needKey && /Ключ не подошёл/.test(e.message), 'неверный ключ → просим ключ');
    e = null; try { await c.kpLookup('https://www.kinopoisk.ru/film/326/', 'limit'); } catch (x) { e = x; } ok(e && !e.needKey && /лимит/i.test(e.message), 'лимит ключа — без повторного запроса ключа');
    e = null; try { await c.kpLookup('https://www.kinopoisk.ru/film/404/', 'good'); } catch (x) { e = x; } ok(e && /не знает/.test(e.message), '404 → понятное сообщение');
    const p1 = await c.kpLookup('https://www.kinopoisk.ru/film/326/', '');
    ok(p1.title === 'Побег из Шоушенка' && p1.year === '1994' && p1.poster === 'https://a.example/p.jpg', 'без ключа: разбор страницы (атрибуты в любом порядке)');
    const p2 = await c.kpLookup('https://www.kinopoisk.ru/series/777/', '');
    ok(p2.title === 'Игра престолов' && p2.year === '2011' && p2.kind === 'series' && p2.poster === 'https://avatars.example/poster/300x450', 'без ключа: сериал, год начала, // в ссылке картинки');
    e = null; try { await c.kpLookup('https://www.kinopoisk.ru/film/999/', ''); } catch (x) { e = x; } ok(e && e.needKey, 'капча → нужен ключ');
    e = null; try { await c.kpLookup('https://example.com/', 'good'); } catch (x) { e = x; } ok(e && !e.needKey, 'не ссылка Кинопоиска');
    console.log('chrmedia: ' + n + ' проверок ок');
  } catch (x) { console.error('FAIL', x.message); process.exitCode = 1; }
  srv.close(); setTimeout(() => process.exit(process.exitCode || 0), 100);
});
