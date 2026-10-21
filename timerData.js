// timerData.js
// Виджет "Таймер" (вкладка "Ивент" → "Фон", плашка справа от "Фона трансляции") —
// управляемый обратный отсчёт мм:сс с настраиваемым видом цифр и анимацией смены
// разряда (см. public/timer.js/.css). Отсчёт ведёт СЕРВЕР (setInterval раз в
// секунду, см. server.js) — виджет и админка только отображают то, что он
// прислал; при перезагрузке страницы OBS-источника (или самого сервера — тут
// прогресс уже не переживёт рестарт, см. README) отсчёт не сбивается и не
// стартует заново сам по себе.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'timer_data.json');

const DURATION_LIMITS = [1, 5999]; // секунды: от 0:01 до 99:59 — формат виджета всегда мм:сс (см. public/timer.js), часы не выводятся
const NUMERIC_DEFAULTS = {
  digitSize: 64, // px
  bgOpacity: 0, // % — плашка-подложка позади таймера (как у "Коробочки сбора") — по умолчанию не видна
  bgDarken: 0,
  labelSize: 18, // px — подпись над/под цифрами ("Стрим начнётся через" и т.п.)
};
const NUMERIC_LIMITS = {
  digitSize: [16, 200],
  bgOpacity: [0, 100],
  bgDarken: [0, 100],
  labelSize: [10, 80],
};
const COLOR_DEFAULTS = {
  digitColor: '#f0e6d2',
  labelColor: '#f0e6d2',
};
const FONT_OPTIONS = ['Inter', 'Cinzel', 'Georgia', 'Rubik', 'Beaufort for LOL', 'Spiegel']; // тот же список, что и везде в проекте
const FONT_DEFAULTS = { font: 'Inter', labelFont: 'Inter' };
const LABEL_POSITIONS = ['top', 'bottom'];
const ENUM_DEFAULTS = { labelPosition: 'top' };

function defaultSettings() {
  return { ...NUMERIC_DEFAULTS, ...COLOR_DEFAULTS, ...FONT_DEFAULTS, ...ENUM_DEFAULTS };
}

function defaultData() {
  return {
    enabled: true,
    durationSeconds: 300, // 5:00 — то, на что сбрасывает кнопка "Сброс" и что подставляется при вводе нового времени
    remainingSeconds: 300,
    running: false,
    labelText: '', // подпись над/под цифрами, например "Стрим начнётся через" — пусто = подпись не показывается
    settings: defaultSettings(),
  };
}

let data = null;

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isValidColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function normalizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const result = {};
  Object.entries(NUMERIC_DEFAULTS).forEach(([key, fallback]) => {
    const [min, max] = NUMERIC_LIMITS[key];
    result[key] = clampNum(raw[key], min, max, fallback);
  });
  Object.entries(COLOR_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = isValidColor(raw[key]) ? raw[key] : fallback;
  });
  Object.entries(FONT_DEFAULTS).forEach(([key, fallback]) => {
    result[key] = FONT_OPTIONS.includes(raw[key]) ? raw[key] : fallback;
  });
  result.labelPosition = LABEL_POSITIONS.includes(raw.labelPosition) ? raw.labelPosition : ENUM_DEFAULTS.labelPosition;
  return result;
}

function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const durationSeconds = clampNum(raw.durationSeconds, DURATION_LIMITS[0], DURATION_LIMITS[1], base.durationSeconds);
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    durationSeconds,
    // remainingSeconds не выше durationSeconds — иначе после уменьшения заданного времени отсчёт мог бы
    // показывать больше, чем только что установленный "полный" таймер.
    remainingSeconds: clampNum(raw.remainingSeconds, 0, durationSeconds, durationSeconds),
    running: typeof raw.running === 'boolean' ? raw.running : false,
    labelText: typeof raw.labelText === 'string' ? raw.labelText.slice(0, 100) : base.labelText,
    settings: normalizeSettings(raw.settings),
  };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')));
      // Сервер мог быть выключен сколько угодно — досчитывать "в уме" не пытаемся (это не было явно
      // запрошено, а неверный самостоятельный досчёт при неизвестном простое хуже честной паузы), поэтому
      // после перезапуска отсчёт всегда стартует остановленным на том значении, что было сохранено.
      data.running = false;
      return;
    }
  } catch (e) {
    console.warn('[Таймер] Не удалось прочитать timer_data.json, начинаем с дефолтов:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Таймер] Не удалось сохранить timer_data.json:', e.message);
  }
}

function init() {
  load();
}

function get() {
  return data;
}

/** fields: {enabled?, labelText?} — трогает только те ключи, что реально переданы (не перезаписывает остальные значением undefined). */
function updateText(fields) {
  const patch = {};
  if (fields && fields.enabled !== undefined) patch.enabled = fields.enabled;
  if (fields && fields.labelText !== undefined) patch.labelText = fields.labelText;
  data = normalize({ ...data, ...patch });
  save();
  return data;
}

function updateSettings(fields) {
  data.settings = normalizeSettings({ ...data.settings, ...(fields || {}) });
  save();
  return data.settings;
}

/** Задаёт новую длительность (мм:сс, целиком в секундах) — останавливает отсчёт и сразу выставляет "полное" оставшееся время. */
function setDuration(seconds) {
  const durationSeconds = clampNum(seconds, DURATION_LIMITS[0], DURATION_LIMITS[1], data.durationSeconds);
  data.durationSeconds = durationSeconds;
  data.remainingSeconds = durationSeconds;
  data.running = false;
  save();
  return data;
}

function start() {
  if (data.remainingSeconds <= 0) return data; // нечего отсчитывать — сперва "Сброс" или новое время
  data.running = true;
  save();
  return data;
}

function pause() {
  data.running = false;
  save();
  return data;
}

/** Возвращает к заданной длительности (durationSeconds) и останавливает — то же, что и setDuration(durationSeconds), но не трогает саму длительность отдельным полем на случай, если понадобится различать эти действия в будущем. */
function reset() {
  data.remainingSeconds = data.durationSeconds;
  data.running = false;
  save();
  return data;
}

/** Вызывается сервером раз в секунду, пока running. Возвращает true, если что-то изменилось (стоит разослать). */
function tick() {
  if (!data.running) return false;
  if (data.remainingSeconds <= 0) { data.running = false; return true; }
  data.remainingSeconds -= 1;
  if (data.remainingSeconds <= 0) { data.remainingSeconds = 0; data.running = false; }
  save();
  return true;
}

module.exports = {
  init, get, updateText, updateSettings, setDuration, start, pause, reset, tick,
  FONT_OPTIONS, DURATION_LIMITS, FILE_PATH,
};
