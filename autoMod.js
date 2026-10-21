// autoMod.js
// Автомодерация чата: список запрещённых слов (оскорбления по расе и ориентации), его хранение и проверка сообщений.
// Само удаление сообщений через Twitch API делает chatBot.js (боту нужны право moderator:manage:chat_messages и статус модератора).
//
// КАК СРАВНИВАЕМ — это главное, ради чего модуль написан аккуратно:
//  * ЦЕЛЫМИ СЛОВАМИ, а не частями слов. Поиск подстроки удалял бы «жидкость» (жид), «хачапури» (хач), «педикюр» (педик),
//    «гейм/геймер/гейзер» (гей), «Нигерию» (нигер), «гомогенный» (гомо) — то есть массу нормальных сообщений.
//  * Регистр не важен; «ё» = «е»; растянутые буквы («пиииидор») и задвоения схлопываются (одинаково в тексте и в списке).
//  * Подмена букв другим алфавитом внутри слова («пидoр» с латинской o, «nіgga» с кириллической і) приводится к одному алфавиту.
//  * Невидимые символы внутри слова и «разбивка» буквами через пробел/точки («п и д о р», «п.и.д.о.р») тоже ловятся.
//  * Запись со звёздочкой в конце («пидор*») — «начинается с»: ловит окончания и производные (пидоры, пидорасы). Использовать
//    осознанно: короткая основа с * заденет и нормальные слова, поэтому для таких записей нужно минимум 3 буквы.
//  * Запись из нескольких слов — фраза (слова подряд).
// Чего это НЕ ловит: слова с окончаниями, которых нет в списке и нет * (пидорам, негров…), цифры вместо букв («п1дор»),
// сложные обходы. Список нужно пополнять по мере появления новых вариантов.
//
// Хранение: banned_words.json → { "enabled": true, "words": [ ... ] }. Файл в .gitignore и в архивы проекта не попадает,
// чтобы обновление не затирало ваш список; если файла нет — создаётся со списком по умолчанию.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'banned_words.json');
const MAX_WORDS = 2000;
const MAX_ENTRY_LENGTH = 40;
const MIN_WILDCARD_CORE = 4; // «жид*»/«хач*»/«гей*» заденут «жидкость»/«хачапури»/«гейм» — короткие основы со звёздочкой запрещены

// Список по умолчанию — только оскорбления по расе и ориентации (дубликат «педик» из задания убран).
const DEFAULT_WORDS = [
  'пидор', 'пидар', 'пидорас', 'педик', 'pidor', 'pidar', 'педераст', 'педирас', 'гомосек', 'гомик', 'гомо',
  'гей', 'гея', 'геи', 'петух', 'петушара',
  'негр', 'негры', 'нигер', 'ниггер', 'нигга', 'nigga', 'nigger', 'черножопый',
  'чурка', 'чурбан', 'хач', 'хачик', 'узкоглазый', 'жид', 'жиды', 'жидяра',
];

/* ---------- Нормализация ---------- */

const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;
const COMBINING = /[\u0300-\u036F]/g;
// Похожие по начертанию буквы разных алфавитов.
const LAT_TO_CYR = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', i: 'и' };
const CYR_TO_LAT = { 'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y', 'к': 'k', 'і': 'i' };

/** Одно слово → канонический вид для сравнения. */
function normalizeToken(token) {
  let t = String(token).toLowerCase().normalize('NFC').replace(COMBINING, '').replace(/ё/g, 'е');
  const cyr = (t.match(/[\u0400-\u04FF]/g) || []).length;
  const lat = (t.match(/[a-z]/g) || []).length;
  if (cyr && lat) {
    // смесь алфавитов внутри одного слова — признак обхода: приводим к тому алфавиту, которого в слове больше
    if (cyr >= lat) t = t.replace(/[a-z]/g, (ch) => LAT_TO_CYR[ch] || ch);
    else t = t.replace(/[\u0400-\u04FF]/g, (ch) => CYR_TO_LAT[ch] || ch);
  }
  if (cyr >= lat && cyr > 0) t = t.replace(/і/g, 'и'); // украинское «і»: «підор» = «пидор»
  return t.replace(/(.)\1+/gu, '$1'); // «пиииидор» → «пидор», «нигга» → «нига» (и в тексте, и в списке одинаково)
}

/** Текст → массив нормализованных слов (невидимые символы вырезаются ДО разбиения, чтобы не рвать слова). */
function tokenize(text) {
  const cleaned = String(text == null ? '' : text).replace(INVISIBLE, '');
  return (cleaned.match(/[\p{L}\p{M}\p{N}]+/gu) || []).map(normalizeToken).filter(Boolean);
}

/** Строки-кандидаты для проверки: сами слова + «склеенные» серии из 3+ одиночных букв («п и д о р», «п.и.д.о.р»). */
function candidateStrings(text) {
  const tokens = tokenize(text);
  const candidates = [tokens.join(' ')];
  let run = [];
  const flush = () => {
    if (run.length >= 3) candidates.push(run.join('').replace(/(.)\1+/gu, '$1'));
    run = [];
  };
  tokens.forEach((t) => { if ([...t].length === 1) run.push(t); else flush(); });
  flush();
  return candidates;
}

/* ---------- Список ---------- */

let enabled = true;
let words = [];        // как хранится и показывается в окне: строки в нижнем регистре
let compiled = [];     // [{ raw, norm, prefix }]

function compileEntry(raw) {
  const prefix = /\*+$/.test(raw);
  const core = raw.replace(/\*+$/, '').trim();
  const norm = tokenize(core).join(' ');
  return norm ? { raw, norm, prefix } : null;
}

function recompile() {
  const seen = new Set();
  compiled = [];
  words.forEach((w) => {
    const c = compileEntry(w);
    if (!c) return;
    const key = (c.prefix ? '*' : '=') + c.norm;
    if (seen.has(key)) return;
    seen.add(key);
    compiled.push(c);
  });
}

/**
 * Разбор введённого списка: по одному слову на строку или через запятую/точку с запятой. Возвращает { ok, words } или { ok:false, error }.
 * Одинаковые записи убираются. «ниггер» и «нигер» остаются оба (для сравнения это одно и то же, но в списке вы видите то, что ввели).
 */
function parseWords(input) {
  const rawItems = Array.isArray(input) ? input.map(String) : String(input == null ? '' : input).split(/[\r\n,;]+/);
  const out = [];
  const seen = new Set();
  for (const item of rawItems) {
    const w = item.trim().replace(/^["'«»“”„]+|["'«»“”„]+$/g, '').replace(/\s+/g, ' ').toLowerCase();
    if (!w) continue;
    if (w.length > MAX_ENTRY_LENGTH) return { ok: false, error: `Одна из записей длиннее ${MAX_ENTRY_LENGTH} символов — в списке должны быть слова (или короткие фразы), по одному на строку.` };
    const c = compileEntry(w);
    if (!c) continue; // одни знаки препинания — пропускаем
    if ([...c.norm.replace(/ /g, '')].length < 2) return { ok: false, error: 'Запись из одной буквы не годится — она задела бы массу нормальных сообщений.' };
    if (c.prefix && [...c.norm.replace(/ /g, '')].length < MIN_WILDCARD_CORE) return { ok: false, error: `Для записи со звёздочкой (*) нужно минимум ${MIN_WILDCARD_CORE} буквы до неё — короткая основа с * заденет нормальные слова.` };
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length > MAX_WORDS) return { ok: false, error: `В списке не больше ${MAX_WORDS} записей.` };
  }
  return { ok: true, words: out };
}

/* ---------- Хранение ---------- */

function persist() {
  try {
    const tmp = `${FILE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ enabled, words }, null, 2));
    fs.renameSync(tmp, FILE_PATH);
  } catch (e) {
    console.warn('[Автомодерация] Не удалось сохранить banned_words.json:', e.message);
  }
}

function useDefaults() {
  enabled = true;
  words = DEFAULT_WORDS.slice();
  recompile();
}

function load() {
  if (!fs.existsSync(FILE_PATH)) {
    useDefaults();
    persist(); // файла нет — создаём со списком по умолчанию
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.words) ? raw.words : []);
    // Плохие записи (одна буква, слишком длинные, не строки) отбрасываем ПО ОДНОЙ — одна кривая запись не должна обнулять весь список.
    const kept = [];
    list.forEach((item) => {
      if (typeof item !== 'string') return;
      const one = parseWords([item]);
      if (one.ok) one.words.forEach((w) => { if (!kept.includes(w) && kept.length < MAX_WORDS) kept.push(w); });
    });
    words = kept;
    enabled = Array.isArray(raw) ? true : raw.enabled !== false;
    recompile();
  } catch (e) {
    // Файл повреждён — работаем со списком по умолчанию, но сам файл НЕ перезаписываем (там могли быть ваши слова: их можно починить руками).
    console.warn('[Автомодерация] banned_words.json не читается, используется список по умолчанию (файл не тронут):', e.message);
    useDefaults();
  }
}

function init() {
  load();
}

function getState() {
  return { enabled, words: words.slice() };
}

function getSummary() {
  return { enabled, wordCount: words.length };
}

function isEnabled() {
  return enabled;
}

function getDefaults() {
  return DEFAULT_WORDS.slice();
}

/** Сохраняет список и переключатель. Возвращает { ok, wordCount } или { ok:false, error } (при ошибке ничего не меняется). */
function save(fields) {
  const f = fields || {};
  let nextWords = words;
  if (f.words !== undefined) {
    const parsed = parseWords(f.words);
    if (!parsed.ok) return parsed;
    nextWords = parsed.words;
  }
  words = nextWords;
  if (f.enabled !== undefined) enabled = !!f.enabled;
  recompile();
  persist();
  return { ok: true, wordCount: words.length };
}

/** Найденная запись списка или null. (Само слово наружу не логируем — только для тестов и отладки.) */
function findMatch(text) {
  if (!enabled || !compiled.length) return null;
  const candidates = candidateStrings(text);
  for (const c of compiled) {
    for (const s of candidates) {
      if (c.prefix ? (` ${s}`).includes(` ${c.norm}`) : (` ${s} `).includes(` ${c.norm} `)) return c.raw;
    }
  }
  return null;
}

function matches(text) {
  return findMatch(text) !== null;
}

module.exports = {
  init, getState, getSummary, isEnabled, getDefaults, save, parseWords, findMatch, matches,
  normalizeToken, tokenize, DEFAULT_WORDS, MAX_WORDS, MAX_ENTRY_LENGTH, FILE_PATH,
};
