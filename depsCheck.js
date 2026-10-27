'use strict';
// Автоустановка зависимостей при старте сервера: если список dependencies в package.json изменился
// (например, обновился msedge-tts для голосов Edge) или node_modules ещё нет — выполняется npm install.
// Метка последней успешной установки лежит в node_modules/.overdeck-deps. Нужен только встроенный node, без сторонних пакетов.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

function ensure() {
  if (process.env.OVERDECK_SKIP_DEPS) return;
  try {
    const root = __dirname;
    const deps = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies || {});
    const stamp = crypto.createHash('sha1').update(deps).digest('hex');
    const nm = path.join(root, 'node_modules');
    const file = path.join(nm, '.overdeck-deps');
    let cur = ''; try { cur = fs.readFileSync(file, 'utf8').trim(); } catch (_) { /* метки ещё нет */ }
    if (fs.existsSync(nm) && cur === stamp) return;
    console.log('[Overdeck] Проверяю и обновляю зависимости (npm install). Это нужно один раз после обновления, подожди минуту…');
    const r = cp.spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: root, stdio: 'inherit', shell: true, timeout: 10 * 60 * 1000 });
    if (r.status === 0) { try { fs.mkdirSync(nm, { recursive: true }); fs.writeFileSync(file, stamp); } catch (_) { /* не критично */ } console.log('[Overdeck] Зависимости в порядке.'); }
    else console.log('[Overdeck] npm install не удался (нет интернета?). Сервер запускается как есть, при следующем старте попробую снова.');
  } catch (e) { console.log('[Overdeck] Проверка зависимостей пропущена: ' + (e && e.message)); }
}
module.exports = { ensure };
