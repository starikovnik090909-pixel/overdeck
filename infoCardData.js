// infoCardData.js
// Содержимое виджета «Инфо-карточка»: список карточек (картинка + заголовок + текст), между которыми виджет переворачивается.
// Поведение (таймер выезда, сторона, скорость переворота) и вид — это НАСТРОЙКИ виджета (widgets.js, схема `infocard`),
// а здесь только то, что показывать. Картинки лежат в uploads/infocard/ (раздаются как /uploads/infocard/...), тут хранится лишь путь.
// rev растёт при любом изменении — оверлей по нему понимает, что карточки поменялись, и не перерисовывает их зря на каждом снапшоте.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'info_cards.json');
const MAX_CARDS = 20;
const TITLE_MAX = 80;
const TEXT_MAX = 400;

let data = { rev: 1, cards: [] };

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

/** Только наш путь /uploads/infocard/<имя файла> — ни выхода из папки, ни чужих адресов. */
function cleanImageUrl(url) {
  return typeof url === 'string' && /^\/uploads\/infocard\/[^/\\]+$/.test(url) && !url.includes('..') ? url : null;
}

function newId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const cards = (Array.isArray(r.cards) ? r.cards : []).slice(0, MAX_CARDS).map((c) => {
    const card = c && typeof c === 'object' ? c : {};
    let id = typeof card.id === 'string' && /^[\w-]{1,40}$/.test(card.id) ? card.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    return { id, title: cleanText(card.title, TITLE_MAX), text: cleanText(card.text, TEXT_MAX), imageUrl: cleanImageUrl(card.imageUrl) };
  });
  return { rev: Number.isInteger(r.rev) && r.rev > 0 ? r.rev : 1, cards };
}

function save() {
  try { fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2)); } catch (e) {
    console.warn('[Инфо-карточка] Не удалось сохранить info_cards.json:', e.message);
  }
}

function touch() { data.rev += 1; save(); }

function init() {
  try {
    if (fs.existsSync(FILE_PATH)) { data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))); return; }
  } catch (e) {
    console.warn('[Инфо-карточка] Не удалось прочитать info_cards.json, начинаем с пустого списка:', e.message);
  }
  data = { rev: 1, cards: [] };
}

function get() { return { rev: data.rev, cards: data.cards.map((c) => ({ ...c })) }; }
function find(id) { return data.cards.find((c) => c.id === id) || null; }

/** Новая карточка в конец списка. null — если достигнут предел MAX_CARDS. */
function addCard(fields) {
  if (data.cards.length >= MAX_CARDS) return null;
  const f = fields || {};
  const card = { id: newId(), title: cleanText(f.title, TITLE_MAX), text: cleanText(f.text, TEXT_MAX), imageUrl: null };
  data.cards.push(card);
  touch();
  return { ...card };
}

/** Меняет заголовок и/или текст. null — карточки нет. */
function updateCard(id, fields) {
  const card = find(id);
  if (!card) return null;
  const f = fields || {};
  if (f.title !== undefined) card.title = cleanText(f.title, TITLE_MAX);
  if (f.text !== undefined) card.text = cleanText(f.text, TEXT_MAX);
  touch();
  return { ...card };
}

/** Удаляет карточку; возвращает её (чтобы вызывающий мог стереть файл картинки с диска) или null. */
function removeCard(id) {
  const i = data.cards.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const [removed] = data.cards.splice(i, 1);
  touch();
  return removed;
}

/** Сдвигает карточку на шаг вверх (-1) или вниз (+1) в порядке показа. false — карточки нет или двигать некуда. */
function moveCard(id, dir) {
  const i = data.cards.findIndex((c) => c.id === id);
  const j = i + (Number(dir) < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= data.cards.length) return false;
  [data.cards[i], data.cards[j]] = [data.cards[j], data.cards[i]];
  touch();
  return true;
}

/** Путь картинки карточки (или null — убрать). Возвращает прежний путь, чтобы стереть старый файл; undefined — карточки нет. */
function setCardImage(id, url) {
  const card = find(id);
  if (!card) return undefined;
  const prev = card.imageUrl;
  card.imageUrl = cleanImageUrl(url);
  touch();
  return prev;
}

module.exports = { init, get, addCard, updateCard, removeCard, moveCard, setCardImage, MAX_CARDS, TITLE_MAX, TEXT_MAX, FILE_PATH };
