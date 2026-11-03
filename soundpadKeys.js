// soundpadKeys.js — глобальные горячие клавиши для звуков саундпада (работают поверх игр, только Windows).
// Клавиши ловит маленький помощник на PowerShell (soundpadkeys.ps1, RegisterHotKey из user32): он печатает по строке JSON на нажатие.
// Формат сочетания: «Ctrl+Alt+F5», «Ctrl+Shift+1», «Num3». Буквы, цифры и пробел требуют хотя бы одного модификатора,
// чтобы не перехватывать обычный набор текста.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const SCRIPT = path.join(__dirname, 'soundpadkeys.ps1');
const MODS = { ctrl: 2, alt: 1, shift: 4, win: 8 };
const NAMED = { space: 0x20, insert: 0x2D, delete: 0x2E, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, up: 0x26, down: 0x28, left: 0x25, right: 0x27, pause: 0x13, scrolllock: 0x91 };
const NAMED_TITLE = { space: 'Space', insert: 'Insert', delete: 'Delete', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', up: 'Up', down: 'Down', left: 'Left', right: 'Right', pause: 'Pause', scrolllock: 'ScrollLock' };

/** «ctrl + alt+f5» → { text: 'Ctrl+Alt+F5', mods, vk } или null, если сочетание не подходит. */
function parse(input) {
  if (typeof input !== 'string') return null;
  const parts = input.split('+').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!parts.length || parts.length > 5) return null;
  let mods = 0; const seen = new Set(); let key = '';
  for (const p of parts) {
    if (MODS[p]) { if (seen.has(p)) return null; seen.add(p); mods |= MODS[p]; } else if (!key) key = p; else return null;
  }
  if (!key) return null;
  let vk = 0, title = '', free = false;   // free — можно без модификатора
  if (/^[a-z]$/.test(key)) { vk = key.toUpperCase().charCodeAt(0); title = key.toUpperCase(); }
  else if (/^[0-9]$/.test(key)) { vk = 0x30 + Number(key); title = key; }
  else if (/^f([1-9]|1[0-9]|2[0-4])$/.test(key)) { vk = 0x6F + Number(key.slice(1)); title = 'F' + key.slice(1); free = true; }
  else if (/^num[0-9]$/.test(key)) { vk = 0x60 + Number(key.slice(3)); title = 'Num' + key.slice(3); free = true; }
  else if (NAMED[key]) { vk = NAMED[key]; title = NAMED_TITLE[key]; free = !['space'].includes(key); }
  else return null;
  if (!mods && !free) return null;
  const order = ['ctrl', 'alt', 'shift', 'win'].filter((m) => seen.has(m)).map((m) => m[0].toUpperCase() + m.slice(1));
  return { text: order.concat(title).join('+'), mods, vk };
}

let child = null, lastKey = '', timer = null, startedAt = 0, wanted = [], handlers = null;
let status = { supported: process.platform === 'win32', running: false, text: '', failed: [] };
const getStatus = () => ({ supported: status.supported, running: status.running, text: status.text, failed: status.failed.slice() });

function stop() {
  clearTimeout(timer);
  if (child) { const c = child; child = null; try { c.removeAllListeners('exit'); c.kill(); } catch (e) { /* уже закрыт */ } }
  status.running = false;
}
function launch() {
  const o = handlers; if (!o || !wanted.length) return;
  const cfgFile = path.join(o.dir || __dirname, 'soundpad_keys.json');
  try { fs.writeFileSync(cfgFile, JSON.stringify(wanted.map((w) => ({ mods: w.k.mods | 0x4000, vk: w.k.vk })))); } catch (e) { status.text = 'Не удалось записать настройки клавиш'; return; }
  let c;
  try { c = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', SCRIPT, '-ParentPid', String(process.pid), '-Config', cfgFile], { windowsHide: true }); }
  catch (e) { status.text = 'PowerShell не запустился'; return; }
  child = c; startedAt = Date.now(); status.running = true; status.text = ''; status.failed = [];
  let buf = '';
  c.stdout.on('data', (d) => {
    buf += d.toString('utf8'); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/^﻿/, '').trim(); buf = buf.slice(i + 1);
      if (line[0] !== '{') continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      const w = wanted[m.i];
      if (m.t === 'hit' && w) { try { o.onHit(w.id); } catch (e) { /* звук не должен ронять помощника */ } }
      else if (m.t === 'fail' && w) { if (!status.failed.includes(w.id)) status.failed.push(w.id); }
      else if (m.t === 'err') status.text = String(m.msg || 'ошибка').slice(0, 200);
    }
  });
  c.stderr.on('data', () => {});
  c.on('error', () => { status.running = false; status.text = 'PowerShell не запустился'; });
  c.on('exit', () => {
    status.running = false; child = null;
    if (Date.now() - startedAt > 8000) timer = setTimeout(launch, 3000);   // помощник упал не сразу: поднимаем снова
    else status.text = status.text || 'Помощник горячих клавиш остановился';
  });
}
/** Привести клавиши в соответствие со списком звуков. o: { dir, onHit(id), force } — force только для проверок. */
function sync(sounds, o) {
  handlers = o || handlers || {};
  const list = (sounds || []).map((s) => ({ id: s.id, k: parse(s.hotkey) })).filter((x) => x.k);
  const key = JSON.stringify(list.map((x) => [x.id, x.k.mods, x.k.vk]));
  if (key === lastKey && (child || !list.length)) return getStatus();
  lastKey = key; wanted = list; stop();
  status.failed = []; status.text = '';
  if (!list.length) return getStatus();
  if (process.platform !== 'win32' && !(handlers && handlers.force)) { status.supported = false; status.text = 'Горячие клавиши работают только на Windows'; return getStatus(); }
  clearTimeout(timer); timer = setTimeout(launch, 400);
  return getStatus();
}
module.exports = { parse, sync, stop, getStatus };
