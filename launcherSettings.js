// launcherSettings.js — настройки лаунчера (Overdeck.exe), которые лежат в launcher.json рядом с server.js.
// Лаунчер читает файл при запуске, поэтому изменения применяются со следующего запуска лаунчера.
// Чужие поля (updateUrl, autoUpdate) не трогаем.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'launcher.json');
const DEFAULT_URL = 'https://api.github.com/repos/starikovnik090909-pixel/overdeck/releases/latest';

function read() {
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^﻿/, '')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; }
  catch (e) { return {}; }
}

function state() {
  const j = read();
  return { introSound: j.introMute !== true, skipIntro: j.skipIntro === true };
}

function update(b) {
  b = b || {};
  const j = read();
  if (typeof j.updateUrl !== 'string') j.updateUrl = DEFAULT_URL;
  if (typeof j.autoUpdate !== 'boolean') j.autoUpdate = true;
  if (typeof b.introSound === 'boolean') j.introMute = !b.introSound;
  if (typeof b.skipIntro === 'boolean') j.skipIntro = b.skipIntro;
  if (typeof j.introMute !== 'boolean') j.introMute = false;
  if (typeof j.skipIntro !== 'boolean') j.skipIntro = false;
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(j, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, FILE);
  return state();
}

module.exports = { state, update, FILE };
