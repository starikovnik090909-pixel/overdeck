#!/usr/bin/env node
/**
 * Сборка расширения Twitch: файлы из extension/ + картинки героев из public/pixel-avatar/ → twitch-extension.zip (корень проекта).
 * Этот zip загружается в консоли Twitch Developers: расширение → Версия → Файлы (Assets) → загрузить. Запуск: node tools/build-extension.js
 * Пересобирайте архив, когда добавили новых героев в public/pixel-avatar/ и хотите, чтобы они были видны зрителям в расширении.
 * Без внешних пакетов: zip пишется здесь же (deflate из встроенного zlib).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'extension');
const HEROES = path.join(ROOT, 'public', 'pixel-avatar');
const OUT = path.join(ROOT, 'twitch-extension.zip');
const FRONT = ['viewer.html', 'viewer.css', 'viewer.js', 'config.html'];

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** Минимальный zip: файлы в корне архива без папки-обёртки (Twitch ждёт viewer.html в корне). */
function makeZip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8'), comp = zlib.deflateRawSync(data, { level: 9 }), useDeflate = comp.length < data.length, body = useDeflate ? comp : data;
    const crc = crc32(data), method = useDeflate ? 8 : 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function build() {
  const entries = [], heroes = {}; let skipped = 0;
  for (const f of FRONT) entries.push({ name: f, data: fs.readFileSync(path.join(SRC, f)) });
  for (const id of fs.readdirSync(HEROES).sort()) {
    const dir = path.join(HEROES, id), mf = path.join(dir, 'manifest.json');
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || !fs.existsSync(mf)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
      const pack = (a) => ({ f: a.file, fr: a.frames });
      if (!m.walk || !m.idle || !fs.existsSync(path.join(dir, m.walk.file)) || !fs.existsSync(path.join(dir, m.idle.file))) { skipped++; continue; }
      heroes[id] = { t: m.title || id, g: m.group || '', w: m.cell.w, h: m.cell.h, fps: m.fps || 12, s: m.scale || 1, sp: m.speed || 80, d: m.directions, idle: pack(m.idle), walk: pack(m.walk) };
      for (const file of new Set([m.walk.file, m.idle.file, 'LICENSE.txt'])) { const p = path.join(dir, file); if (fs.existsSync(p)) entries.push({ name: `heroes/${id}/${file}`, data: fs.readFileSync(p) }); }
    } catch (e) { skipped++; }
  }
  const SCENES = path.join(SRC, 'scenes');
  if (fs.existsSync(SCENES)) for (const f of fs.readdirSync(SCENES).sort()) if (/^[a-z0-9_-]+\.png$/i.test(f)) entries.push({ name: `scenes/${f}`, data: fs.readFileSync(path.join(SCENES, f)) });
  entries.push({ name: 'heroes.json', data: Buffer.from(JSON.stringify(heroes)) });
  const zip = makeZip(entries);
  fs.writeFileSync(OUT, zip);
  console.log(`Готово: ${OUT}\n  файлов: ${entries.length}, героев: ${Object.keys(heroes).length}${skipped ? ' (пропущено битых: ' + skipped + ')' : ''}, размер: ${(zip.length / 1e6).toFixed(1)} МБ`);
  return { zip, entries, heroes };
}

if (require.main === module) build();
module.exports = { build, makeZip, crc32 };
