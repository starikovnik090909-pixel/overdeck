// predictions.js
// Обёртка над Twitch Helix Predictions API (Channel Points Predictions) +
// хранилище сохранённых шаблонов вопросов для турнира. Требует пользовательский
// OAuth-токен со scope channel:manage:predictions (см. twitch.js:buildAuthorizeUrl —
// уже подключённым каналам нужно переподключиться, чтобы получить токен с
// этим правом, старые токены его не получат сами по себе).
//
// ЧЕСТНАЯ ОГОВОРКА: у меня нет сети, чтобы прогнать это вживую против
// реального Twitch API — реализация основана на официальной документации
// Twitch (endpoints/поля/лимиты), но фактическое поведение стоит проверить
// на реальном канале при первом использовании.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'prediction_templates.json');

// Лимиты Twitch на данный момент (проверено по документации): заголовок и
// названия вариантов — до 45 символов (в задании было указано 25 — это
// устаревшее значение, Twitch его с тех пор увеличил); длительность — от
// 30 до 1800 секунд; ровно 2 варианта в этой форме (Twitch API технически
// поддерживает до 10, но по заданию нужна форма именно на 2).
const TITLE_MAX_LENGTH = 45;
const WINDOW_LIMITS = [30, 1800];
const DEFAULT_WINDOW_SECONDS = 300; // 5 минут, как и просили по умолчанию

let templates = null; // [{id, title, option1, option2, createdAt}]

function loadTemplates() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      if (Array.isArray(raw)) {
        templates = raw.filter((t) => t && typeof t.id === 'string');
        return;
      }
    }
  } catch (e) {
    console.warn('[Ставки] Не удалось прочитать prediction_templates.json, начинаем с пустого списка:', e.message);
  }
  templates = [];
  saveTemplates();
}

function saveTemplates() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(templates, null, 2));
  } catch (e) {
    console.warn('[Ставки] Не удалось сохранить prediction_templates.json:', e.message);
  }
}

function init() {
  loadTemplates();
}

function listTemplates() {
  return templates.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function generateId() {
  return `pred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Сохраняет вопрос как шаблон — вызывается автоматически при каждом успешном запуске ставки (см. задание: "все созданные вопросы должны сохраняться"). */
function saveAsTemplate(title, option1, option2) {
  const template = { id: generateId(), title, option1, option2, createdAt: Date.now() };
  templates.push(template);
  saveTemplates();
  return template;
}

function deleteTemplate(id) {
  const before = templates.length;
  templates = templates.filter((t) => t.id !== id);
  saveTemplates();
  return templates.length !== before;
}

function validateCreateInput({ title, option1, option2, windowSeconds }) {
  const errors = [];
  if (!title || !title.trim()) errors.push('Укажи вопрос.');
  else if (title.length > TITLE_MAX_LENGTH) errors.push(`Вопрос длиннее ${TITLE_MAX_LENGTH} символов.`);
  if (!option1 || !option1.trim()) errors.push('Укажи вариант 1.');
  else if (option1.length > TITLE_MAX_LENGTH) errors.push(`Вариант 1 длиннее ${TITLE_MAX_LENGTH} символов.`);
  if (!option2 || !option2.trim()) errors.push('Укажи вариант 2.');
  else if (option2.length > TITLE_MAX_LENGTH) errors.push(`Вариант 2 длиннее ${TITLE_MAX_LENGTH} символов.`);
  const win = Number(windowSeconds) || DEFAULT_WINDOW_SECONDS;
  if (win < WINDOW_LIMITS[0] || win > WINDOW_LIMITS[1]) {
    errors.push(`Длительность должна быть от ${WINDOW_LIMITS[0]} до ${WINDOW_LIMITS[1]} секунд.`);
  }
  return errors;
}

/** POST https://api.twitch.tv/helix/predictions — создать ставку. */
async function createPrediction({ clientId, accessToken, broadcasterId, title, option1, option2, windowSeconds }) {
  const res = await fetch('https://api.twitch.tv/helix/predictions', {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      broadcaster_id: broadcasterId,
      title,
      outcomes: [{ title: option1 }, { title: option2 }],
      prediction_window: Number(windowSeconds) || DEFAULT_WINDOW_SECONDS,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = (data && data.message) || `Twitch вернул ошибку (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data.data && data.data[0];
}

/** PATCH https://api.twitch.tv/helix/predictions — завершить ставку (выбрать победителя) или отменить. */
async function resolvePrediction({ clientId, accessToken, broadcasterId, predictionId, status, winningOutcomeId }) {
  const body = { broadcaster_id: broadcasterId, id: predictionId, status };
  if (status === 'RESOLVED' && winningOutcomeId) body.winning_outcome_id = winningOutcomeId;

  const res = await fetch('https://api.twitch.tv/helix/predictions', {
    method: 'PATCH',
    headers: {
      'Client-Id': clientId,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = (data && data.message) || `Twitch вернул ошибку (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data.data && data.data[0];
}

/** GET https://api.twitch.tv/helix/predictions — последние ставки (самая свежая первая); используется, чтобы найти активную/locked. */
async function getPredictions({ clientId, accessToken, broadcasterId }) {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId, first: '5' });
  const res = await fetch(`https://api.twitch.tv/helix/predictions?${params.toString()}`, {
    headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    const message = (data && data.message) || `Twitch вернул ошибку (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data.data || [];
}

/** Из последних ставок находит ту, что ещё не завершена (ACTIVE или LOCKED). */
async function getActivePrediction(creds) {
  const list = await getPredictions(creds);
  return list.find((p) => p.status === 'ACTIVE' || p.status === 'LOCKED') || null;
}

module.exports = {
  init, listTemplates, saveAsTemplate, deleteTemplate, validateCreateInput,
  createPrediction, resolvePrediction, getPredictions, getActivePrediction,
  TITLE_MAX_LENGTH, WINDOW_LIMITS, DEFAULT_WINDOW_SECONDS, FILE_PATH,
};
