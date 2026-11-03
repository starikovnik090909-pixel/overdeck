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
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('✓ mods: ' + n + ' проверок'); process.exit(0);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
