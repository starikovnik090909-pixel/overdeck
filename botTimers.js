// botTimers.js
// Сообщения чат-бота «по таймеру»: пользователь сам вводит текст и выбирает, как часто бот его повторяет (раз в 15–60 минут).
// Здесь — только данные и правила; расписание и отправку делает chatBot.js (пока бот подключён).
//
// Правила:
//  - интервал — целое число минут от 15 до 60 (чаще нельзя: сообщения по таймеру раздражают зрителей и упираются в лимиты Twitch);
//  - текст — до 500 символов (лимит одного сообщения Twitch); строки многострочного текста склеиваются пробелом
//    (в чате Twitch нет переноса строк); доступен плейсхолдер {channel} — название канала;
//  - сообщений не больше MAX_TIMERS;
//  - настройка «только пока идёт стрим» — общая для всех сообщений.
// Хранится в bot_timers.json (в .gitignore и не попадает в архивы проекта, чтобы обновление не затирало ваши сообщения).

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'bot_timers.json');
const INTERVAL_MIN = 15;
const INTERVAL_MAX = 60;
const TEXT_MAX_LENGTH = 500;
const MAX_TIMERS = 20;

let timers = []; // [{ id, text, intervalMinutes, enabled }]
let settings = { onlyWhenLive: false };

function generateId() {
  return `tmr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Приводит интервал к целому числу минут или возвращает null, если это не целое число в допустимых пределах. */
function parseInterval(raw) {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < INTERVAL_MIN || n > INTERVAL_MAX) return null;
  return n;
}

/** { ok, text?, intervalMinutes?, error? } — проверка и нормализация полей одного сообщения. */
function validate(rawText, rawInterval) {
  const text = String(rawText == null ? '' : rawText).trim();
  if (!text) return { ok: false, error: 'Введи текст сообщения.' };
  if (text.length > TEXT_MAX_LENGTH) return { ok: false, error: `Сообщение длиннее ${TEXT_MAX_LENGTH} символов (лимит одного сообщения Twitch).` };
  const intervalMinutes = parseInterval(rawInterval);
  if (intervalMinutes === null) return { ok: false, error: `Интервал — целое число минут от ${INTERVAL_MIN} до ${INTERVAL_MAX}.` };
  return { ok: true, text, intervalMinutes };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      const list = raw && Array.isArray(raw.timers) ? raw.timers : [];
      timers = [];
      list.forEach((item) => {
        if (!item || timers.length >= MAX_TIMERS) return;
        const v = validate(item.text, item.intervalMinutes);
        if (!v.ok) return; // повреждённые записи молча отбрасываем — сервер должен стартовать при любом содержимом файла
        timers.push({ id: typeof item.id === 'string' && item.id ? item.id : generateId(), text: v.text, intervalMinutes: v.intervalMinutes, enabled: item.enabled !== false });
      });
      settings = { onlyWhenLive: !!(raw && raw.settings && raw.settings.onlyWhenLive) };
      return;
    }
  } catch (e) {
    console.warn('[Таймеры бота] Не удалось прочитать bot_timers.json, начинаем с пустого списка:', e.message);
  }
  timers = [];
  settings = { onlyWhenLive: false };
  persist();
}

function persist() {
  try {
    const tmp = `${FILE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ settings, timers }, null, 2));
    fs.renameSync(tmp, FILE_PATH);
  } catch (e) {
    console.warn('[Таймеры бота] Не удалось сохранить bot_timers.json:', e.message);
  }
}

function init() {
  load();
}

function list() {
  return timers.map((t) => ({ ...t }));
}

function getSettings() {
  return { ...settings };
}

function setSettings(fields) {
  if (fields && fields.onlyWhenLive !== undefined) settings.onlyWhenLive = !!fields.onlyWhenLive;
  persist();
  return { ...settings };
}

function add(rawText, rawInterval, enabled) {
  if (timers.length >= MAX_TIMERS) return { ok: false, error: `Можно не больше ${MAX_TIMERS} сообщений по таймеру.` };
  const v = validate(rawText, rawInterval);
  if (!v.ok) return v;
  const item = { id: generateId(), text: v.text, intervalMinutes: v.intervalMinutes, enabled: enabled !== false };
  timers.push(item);
  persist();
  return { ok: true, item: { ...item } };
}

function update(id, rawText, rawInterval, enabled) {
  const item = timers.find((t) => t.id === id);
  if (!item) return { ok: false, error: 'Сообщение не найдено.' };
  const v = validate(rawText, rawInterval);
  if (!v.ok) return v;
  item.text = v.text;
  item.intervalMinutes = v.intervalMinutes;
  if (enabled !== undefined) item.enabled = !!enabled;
  persist();
  return { ok: true, item: { ...item } };
}

function remove(id) {
  const before = timers.length;
  timers = timers.filter((t) => t.id !== id);
  if (timers.length === before) return { ok: false, error: 'Сообщение не найдено.' };
  persist();
  return { ok: true };
}

/** Подставляет {channel}, склеивает строки в одну и обрезает до лимита Twitch. */
function renderMessage(text, values) {
  const v = values || {};
  return String(text)
    .replace(/\{channel\}/gi, v.channel || '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
    .slice(0, TEXT_MAX_LENGTH);
}

module.exports = {
  init, list, add, update, remove, getSettings, setSettings, renderMessage,
  INTERVAL_MIN, INTERVAL_MAX, TEXT_MAX_LENGTH, MAX_TIMERS, FILE_PATH,
};
