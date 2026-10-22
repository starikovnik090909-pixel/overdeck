// botCommands.js
// Конструктор команд чат-бота: список "!команда → ответ", хранится в bot_commands.json
// и подгружается при старте сервера. Здесь — только данные и подстановка
// плейсхолдеров; чтение чата и отправку ответа делает chatBot.js.
//
// Правила:
//  - команда начинается с "!", без пробелов, 2–32 символа (кириллица разрешена);
//    хранится в нижнем регистре, сравнение без учёта регистра ("!Привет" = "!привет");
//  - ответ — до 500 символов (лимит одного сообщения Twitch); переносы строк при
//    отправке склеиваются пробелом — в чате Twitch нет многострочных сообщений;
//  - плейсхолдеры: {user} — ник написавшего, {channel} — название канала.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'bot_commands.json');
const COMMAND_MAX_LENGTH = 32;
const RESPONSE_MAX_LENGTH = 500;

let commands = []; // [{ id, command, response }]
let isReserved = () => false; // (команда) → true, если слово занято другим модулем (команды чат-аватаров) — дубль в списке бота не допускается

function generateId() {
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Приводит ввод к виду "!команда" (нижний регистр, "!" добавляется, если забыли). Пустой ввод остаётся пустым. */
function normalizeCommand(raw) {
  const t = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!t) return '';
  return t.startsWith('!') ? t : `!${t}`;
}

/** Возвращает { ok, error?, command?, response? } — проверяет и нормализует поля; excludeId — что не считать дублем при редактировании. */
function validate(rawCommand, rawResponse, excludeId) {
  const command = normalizeCommand(rawCommand);
  const response = String(rawResponse == null ? '' : rawResponse).trim();
  if (command.length < 2) return { ok: false, error: 'Укажи команду, например !привет.' };
  if (command.length > COMMAND_MAX_LENGTH) return { ok: false, error: `Команда длиннее ${COMMAND_MAX_LENGTH} символов.` };
  if (/\s/.test(command)) return { ok: false, error: 'В команде не должно быть пробелов.' };
  if (!response) return { ok: false, error: 'Укажи текст ответа.' };
  if (response.length > RESPONSE_MAX_LENGTH) return { ok: false, error: `Ответ длиннее ${RESPONSE_MAX_LENGTH} символов (лимит одного сообщения Twitch).` };
  if (isReserved(command)) return { ok: false, error: `Команда ${command} занята командами чат-аватаров (вкладка «Чат-бот» → «Команды чат-аватаров»).` };
  if (commands.some((c) => c.command === command && c.id !== excludeId)) {
    return { ok: false, error: `Команда ${command} уже есть в списке.` };
  }
  return { ok: true, command, response };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.commands) ? raw.commands : []);
      const seen = new Set();
      commands = [];
      list.forEach((item) => {
        if (!item) return;
        const command = normalizeCommand(item.command);
        const response = String(item.response == null ? '' : item.response).trim();
        // повреждённые/дублирующиеся записи в файле молча отбрасываем — сервер должен стартовать при любом содержимом
        if (command.length < 2 || command.length > COMMAND_MAX_LENGTH || /\s/.test(command) || !response || seen.has(command)) return;
        seen.add(command);
        commands.push({ id: typeof item.id === 'string' && item.id ? item.id : generateId(), command, response: response.slice(0, RESPONSE_MAX_LENGTH) });
      });
      return;
    }
  } catch (e) {
    console.warn('[Команды бота] Не удалось прочитать bot_commands.json, начинаем с пустого списка:', e.message);
  }
  commands = [];
  persist();
}

function persist() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify({ commands }, null, 2));
  } catch (e) {
    console.warn('[Команды бота] Не удалось сохранить bot_commands.json:', e.message);
  }
}

function init() {
  load();
}

function list() {
  return commands.map((c) => ({ ...c }));
}

function add(rawCommand, rawResponse) {
  const v = validate(rawCommand, rawResponse, null);
  if (!v.ok) return v;
  const item = { id: generateId(), command: v.command, response: v.response };
  commands.push(item);
  persist();
  return { ok: true, item: { ...item } };
}

function update(id, rawCommand, rawResponse) {
  const item = commands.find((c) => c.id === id);
  if (!item) return { ok: false, error: 'Команда не найдена.' };
  const v = validate(rawCommand, rawResponse, id);
  if (!v.ok) return v;
  item.command = v.command;
  item.response = v.response;
  persist();
  return { ok: true, item: { ...item } };
}

function remove(id) {
  const before = commands.length;
  commands = commands.filter((c) => c.id !== id);
  if (commands.length === before) return { ok: false, error: 'Команда не найдена.' };
  persist();
  return { ok: true };
}

/** Ищет команду по первому слову сообщения. Возвращает запись или null (нет в списке — бот игнорирует сообщение). */
function findByToken(token) {
  const key = String(token || '').toLowerCase();
  if (!key.startsWith('!')) return null;
  return commands.find((c) => c.command === key) || null;
}

/** Подставляет {user}/{channel} (без учёта регистра в названии плейсхолдера), склеивает строки в одну и обрезает до лимита Twitch. */
function renderResponse(response, values) {
  const v = values || {};
  const text = String(response)
    .replace(/\{user\}/gi, v.user || '')
    .replace(/\{channel\}/gi, v.channel || '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim();
  return text.slice(0, RESPONSE_MAX_LENGTH);
}

function setReservedChecker(fn) { isReserved = typeof fn === 'function' ? fn : () => false; }

module.exports = {
  setReservedChecker, init, list, add, update, remove, findByToken, renderResponse, normalizeCommand,
  COMMAND_MAX_LENGTH, RESPONSE_MAX_LENGTH, FILE_PATH,
};
