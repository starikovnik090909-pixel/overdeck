// Мод «Овервойс»: поиск установки, запуск в фоне, статус, остановка по запросу (с поддельным Овервойсом).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mod = require('../modOvervoice');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mods-'));
  const fake = path.join(tmp, 'mods', 'overvoice'); fs.mkdirSync(fake, { recursive: true });
  fs.writeFileSync(path.join(fake, 'package.json'), '{"version":"9.9.9"}');
  fs.writeFileSync(path.join(fake, 'server.js'), `
    const http=require('http');const port=Number(process.env.OVERVOICE_PORT);
    global.od=process.env.OVERVOICE_OVERDECK_URL;
    http.createServer((q,r)=>{
      if(q.url==='/api/link'){r.setHeader('Content-Type','application/json');return r.end(JSON.stringify({connected:true,url:global.od}));}
      if(q.url==='/api/shutdown'&&q.method==='POST'){if(q.headers['x-overvoice']!=='1'){r.statusCode=403;return r.end('{}');}r.end('{"success":true}');return setTimeout(()=>process.exit(0),100);}
      r.statusCode=404;r.end();}).listen(port,'127.0.0.1');`);
  mod.init({ root: tmp, port: 3333, noFile: true });
  mod.update({ port: 3957 });
  let s = await mod.state();
  ok(s.installed && !s.running && s.version === '9.9.9' && s.autostart === true, 'найден установленный мод, пока выключен');
  mod.update({ autostart: false }); ok((await mod.state()).autostart === false && mod.getSettings().autoupdate === true, 'автозапуск выключается, автообновление не слетает');
  await mod.autostart(); ok(!(await mod.state()).running, 'при выключенном автозапуске не стартует');
  mod.update({ autostart: true });
  await mod.autostart(); s = await mod.state(); ok(s.running, 'автозапуск поднимает Овервойс');
  await mod.start(); ok((await mod.state()).running, 'повторный запуск ничего не ломает');
  await mod.stop(); await new Promise((r) => setTimeout(r, 600)); ok(!(await mod.state()).running, 'остановка по запросу');
  mod.update({ dir: path.join(tmp, 'нет') }); s = await mod.state(); ok(!s.installed, 'нет установки: не найден');
  let err = ''; try { await mod.start(); } catch (e) { err = e.message; } ok(/не установлен/.test(err), 'запуск без установки даёт понятную ошибку');
  mod.update({ port: 80 }); ok(mod.getSettings().port === 3957, 'плохой порт игнорируется');
  // прокси админки к Овервойсу
  const http = require('http'), express = require('express');
  const ov = http.createServer((q, r) => { const c = []; q.on('data', (x) => c.push(x)); q.on('end', () => { const b = Buffer.concat(c); r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ m: q.method, u: q.url, len: b.length, ct: q.headers['content-type'] || '', body: /json/.test(q.headers['content-type'] || '') ? JSON.parse(b.toString()) : null })); }); }).listen(3957, '127.0.0.1');
  await new Promise((r) => ov.on('listening', r));
  mod.update({ port: 3957 });
  const app = express(); app.use(express.json()); require('../routes/mods').main({ mod, app });
  const ps = app.listen(0, '127.0.0.1'); await new Promise((r) => ps.on('listening', r)); const base = 'http://127.0.0.1:' + ps.address().port + '/api/mods/overvoice/p';
  let j = await (await fetch(base + '/api/nv/library')).json(); ok(j.m === 'GET' && j.u === '/api/nv/library', 'прокси: GET доходит');
  j = await (await fetch(base + '/api/nv/library/%D0%9C/model.pth', { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(500000, 1) })).json(); ok(j.m === 'PUT' && j.len === 500000 && j.u === '/api/nv/library/%D0%9C/model.pth', 'прокси: PUT с большим файлом проходит целиком');
  j = await (await fetch(base + '/api/nv/library/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1 }) })).json(); ok(j.body && j.body.a === 1, 'прокси: JSON-тело проходит');
  ok((await fetch(base + '/api/shutdown', { method: 'POST' })).status === 404, 'прокси: только /api/nv/*, остановка Овервойса закрыта');
  ok((await fetch(base + '/server.js')).status === 404, 'прокси: чужие пути закрыты');
  ov.close(); await new Promise((r) => setTimeout(r, 100)); ok((await fetch(base + '/api/nv/library')).status === 502, 'прокси: Овервойс выключен, понятная ошибка');
  ps.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('✓ mods: ' + n + ' проверок'); process.exit(0);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
