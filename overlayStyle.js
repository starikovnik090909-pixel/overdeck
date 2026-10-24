// overlayStyle.js
// Оформление виджетов оверлея: выбранный стиль (default — классический, a…e — см. public/overlay-styles.css) и тумблер «стекло».
// Хранится в overlay_style.json, уходит на оверлей в каждом снапшоте (поле overlayStyle) и применяется там на лету.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'overlay_style.json');
const STYLES = [
  { id: 'default', num: 0, label: 'Классический', hint: 'как раньше' },
  { id: 'a', num: 1, label: 'Frost', hint: 'матовое стекло, Apple' },
  { id: 'b', num: 2, label: 'Razer', hint: 'скошенные углы, зелёный неон' },
  { id: 'c', num: 3, label: 'HUD', hint: 'рамки-уголки, сегментные полосы' },
  { id: 'd', num: 4, label: 'Soft', hint: 'мягкие «квадратики», градиент' },
  { id: 'e', num: 5, label: 'Arcade', hint: 'пиксельный, жёсткие тени' },
  { id: 'f', num: 6, label: 'Discord', hint: 'тёмные карточки, сине-фиолетовый' },
  { id: 'g', num: 7, label: 'Dota 2', hint: 'сталь, золото и красный' },
  { id: 'h', num: 8, label: 'League of Legends', hint: 'Hextech: синий и золото' },
  { id: 'i', num: 9, label: 'Counter-Strike 2', hint: 'прозрачные плашки, жёлтая метка' },
  { id: 'j', num: 10, label: 'World of Warcraft', hint: 'пергамент, золото, цвета редкости' },
  { id: 'k', num: 11, label: 'Valorant', hint: 'красный, косые срезы' },
  { id: 'l', num: 12, label: 'Minecraft', hint: 'слоты с фасками, полоска опыта' },
  { id: 'm', num: 13, label: 'Строгий Mono', hint: 'чёрный, тонкие линии, моноширинный' },
  { id: 'n', num: 14, label: 'Строгий Light', hint: 'светлая карточка, графит' },
  { id: 'o', num: 15, label: 'Cyberpunk 2077', hint: 'жёлтый и бирюзовый на чёрном' },
  { id: 'p', num: 16, label: 'Dead by Daylight', hint: 'чёрные чернила, красное свечение, шестиугольники' },
];
const DEFAULT = { style: 'default', glass: true };
let state = { ...DEFAULT };
let saveTimer = null;

function sanitize(raw, base) {
  const out = { ...(base || DEFAULT) };
  if (raw && typeof raw === 'object') {
    if (typeof raw.style === 'string' && STYLES.some((s) => s.id === raw.style)) out.style = raw.style;
    if (typeof raw.glass === 'boolean') out.glass = raw.glass;
  }
  return out;
}

function init() {
  try {
    if (fs.existsSync(FILE_PATH)) state = sanitize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')), DEFAULT);
  } catch (e) { console.warn('[Стиль оверлея] Не удалось прочитать overlay_style.json:', e.message); }
}
function get() { return { ...state }; }
function update(raw) {
  state = sanitize(raw, state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(FILE_PATH, JSON.stringify(state, null, 2)); } catch (e) { console.warn('[Стиль оверлея] Не удалось сохранить:', e.message); }
  }, 300);
  return get();
}

module.exports = { init, get, update, STYLES };
