// goalData.js
// Данные виджета "Цель сбора" (блок "Сбор" во вкладке "Ивент") — компактная красная плашка со шкалой,
// которая висит на экране постоянно и заполняется от донатов (handleDonation в server.js дёргает addAmount()).
// Свой счётчик, независимый от плашки "Сбор": у цели своя сумма и своя планка (target), её можно поправить
// руками и сбросить, не трогая призовой фонд. Звук (тики заполнения, финал) — можно выключить или убавить.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'goal_data.json');

const LIMITS = {
  target: [1, 100000000],
  volume: [0, 100],
  scale: [50, 200],
  posX: [0, 3840],
  posY: [0, 2160],
};

function defaultData() {
  return {
    enabled: true,
    title: 'Новый микрофон',
    currency: '₽',
    target: 50000,
    amount: 0,
    soundEnabled: true,
    volume: 70, // % — общая громкость звуков виджета
    scale: 100, // % — размер плашки
    shared: true, // true — плашка рисуется в общем источнике алертов (overlay.html?only=donation); false — отдельный источник goal.html
    posX: 40, // px — левый край плашки на экране 1920×1080 (только в общем источнике)
    posY: 40, // px — верхний край плашки на экране (только в общем источнике)
  };
}

let data = null;

function clampInt(v, [min, max], fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const amount = Number(raw.amount);
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 60) : base.title;
  return {
    enabled: raw.enabled === undefined ? base.enabled : !!raw.enabled,
    title: title || base.title,
    currency: typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency.trim().slice(0, 4) : base.currency,
    target: clampInt(raw.target, LIMITS.target, base.target),
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0,
    soundEnabled: raw.soundEnabled === undefined ? base.soundEnabled : !!raw.soundEnabled,
    volume: clampInt(raw.volume, LIMITS.volume, base.volume),
    scale: clampInt(raw.scale, LIMITS.scale, base.scale),
    shared: raw.shared === undefined ? base.shared : !!raw.shared,
    posX: clampInt(raw.posX, LIMITS.posX, base.posX),
    posY: clampInt(raw.posY, LIMITS.posY, base.posY),
  };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')));
      return;
    }
  } catch (e) {
    console.warn('[Цель сбора] Не удалось прочитать goal_data.json, начинаем с нуля:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Цель сбора] Не удалось сохранить goal_data.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

/** Текст, цель, валюта, переключатели, громкость и размер. Сумму не трогает (для неё — setAmount/addAmount/resetAmount). */
function update(fields) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const merged = { ...data };
  ['enabled', 'title', 'currency', 'target', 'soundEnabled', 'volume', 'scale', 'shared', 'posX', 'posY'].forEach((k) => {
    if (f[k] !== undefined) merged[k] = f[k];
  });
  data = normalize(merged);
  save();
  return data;
}

/** Ручная установка суммы ("поправить на конкретное число"). */
function setAmount(amount) {
  const n = Number(amount);
  if (Number.isFinite(n) && n >= 0) data.amount = Math.round(n);
  save();
  return data;
}

/**
 * Прибавляет донат к цели. Возвращает { added, reached }: reached = true, если этим донатом цель
 * ПЕРЕСЕКЛА планку (а не была уже закрыта раньше) — по нему оверлей запускает финальную анимацию.
 */
function addAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return { added: 0, reached: false };
  const before = data.amount;
  data.amount = Math.round(before + n);
  save();
  return { added: Math.round(n), reached: before < data.target && data.amount >= data.target };
}

function resetAmount() {
  data.amount = 0;
  save();
  return data;
}

module.exports = {
  init, get, update, setAmount, addAmount, resetAmount, normalize, defaultData,
  FILE_PATH, LIMITS,
};
