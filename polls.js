// polls.js
// Обёртка над Twitch Helix Polls API (опросы в чате). Пользовательский OAuth-токен
// со scope channel:manage:polls (см. twitch.js:buildAuthorizeUrl — уже
// подключённым каналам нужно войти через Twitch ещё раз, старый токен этого
// права не получит сам). broadcaster_id должен совпадать с владельцем токена.
//
// Лимиты Twitch (по документации): вопрос — до 60 символов; вариантов 2–5;
// название варианта — до 25 символов; длительность — 15–1800 секунд.
//
// ЧЕСТНАЯ ОГОВОРКА: сети в среде разработки нет — логика проверена на
// mock-сервере, но не против настоящего Twitch. Формат запросов/ответов взят
// из официальной документации; при первом запуске на реальном канале стоит
// убедиться, что опрос создаётся и завершается.

const TITLE_MAX_LENGTH = 60;
const CHOICE_MAX_LENGTH = 25;
const CHOICES_LIMITS = [2, 5];
const DURATION_LIMITS = [15, 1800];
const DEFAULT_DURATION_SECONDS = 60;
const HELIX_URL = process.env.TWITCH_HELIX_URL || 'https://api.twitch.tv/helix'; // переменная — только для локальных тестов с mock-сервером

function cleanChoices(choices) {
  return (Array.isArray(choices) ? choices : []).map((c) => String(c == null ? '' : c).trim()).filter(Boolean);
}

/** Возвращает массив ошибок (пустой — всё в порядке). */
function validateCreateInput({ title, choices, durationSeconds }) {
  const errors = [];
  const t = String(title || '').trim();
  if (!t) errors.push('Укажи вопрос опроса.');
  else if (t.length > TITLE_MAX_LENGTH) errors.push(`Вопрос длиннее ${TITLE_MAX_LENGTH} символов.`);

  const list = cleanChoices(choices);
  if (list.length < CHOICES_LIMITS[0] || list.length > CHOICES_LIMITS[1]) {
    errors.push(`Нужно от ${CHOICES_LIMITS[0]} до ${CHOICES_LIMITS[1]} непустых вариантов ответа.`);
  }
  list.forEach((c, i) => {
    if (c.length > CHOICE_MAX_LENGTH) errors.push(`Вариант ${i + 1} длиннее ${CHOICE_MAX_LENGTH} символов.`);
  });

  const d = Number(durationSeconds);
  if (!Number.isFinite(d) || d < DURATION_LIMITS[0] || d > DURATION_LIMITS[1]) {
    errors.push(`Длительность должна быть от ${DURATION_LIMITS[0]} до ${DURATION_LIMITS[1]} секунд.`);
  }
  return errors;
}

async function callHelix(method, query, creds, body) {
  const res = await fetch(`${HELIX_URL}/polls${query || ''}`, {
    method,
    headers: {
      'Client-Id': creds.clientId,
      Authorization: `Bearer ${creds.accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* пустое тело */ }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Twitch вернул ошибку (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** POST /helix/polls — создать опрос. */
async function createPoll({ clientId, accessToken, broadcasterId, title, choices, durationSeconds }) {
  const data = await callHelix('POST', '', { clientId, accessToken }, {
    broadcaster_id: broadcasterId,
    title: String(title).trim(),
    choices: cleanChoices(choices).map((c) => ({ title: c })),
    duration: Math.round(Number(durationSeconds)),
  });
  return data.data && data.data[0];
}

/** PATCH /helix/polls — завершить: TERMINATED (итог остаётся в чате на время) или ARCHIVED (убрать из чата). */
async function endPoll({ clientId, accessToken, broadcasterId, pollId, status }) {
  const data = await callHelix('PATCH', '', { clientId, accessToken }, {
    broadcaster_id: broadcasterId,
    id: pollId,
    status: status === 'ARCHIVED' ? 'ARCHIVED' : 'TERMINATED',
  });
  return data.data && data.data[0];
}

/** GET /helix/polls — последние опросы (самый свежий первый). */
async function getPolls({ clientId, accessToken, broadcasterId }) {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId, first: '5' });
  const data = await callHelix('GET', `?${params.toString()}`, { clientId, accessToken });
  return data.data || [];
}

/** Активный опрос (если есть) + последний завершённый (чтобы итоги не пропадали из админки сразу после конца опроса). */
async function getActiveAndLast(creds) {
  const list = await getPolls(creds);
  const active = list.find((p) => p.status === 'ACTIVE') || null;
  const last = list.find((p) => p.status === 'COMPLETED' || p.status === 'TERMINATED') || null;
  return { active, last };
}

module.exports = {
  validateCreateInput, createPoll, endPoll, getPolls, getActiveAndLast,
  TITLE_MAX_LENGTH, CHOICE_MAX_LENGTH, CHOICES_LIMITS, DURATION_LIMITS, DEFAULT_DURATION_SECONDS,
};
