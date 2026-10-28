// chatVote.js — голосование зрителей «число от 1 до 10» прямо в чате (нативные опросы Twitch держат максимум 5 вариантов).
// Один зритель — один голос (последний), учитываются сообщения, где написано только число 1–10 (можно «8/10»).

const RE = /^\s*(10|[1-9])\s*(?:\/\s*10)?\s*$/;
let cur = null;

function summary(c) {
  const dist = Array(10).fill(0);
  c.votes.forEach((n) => { dist[n - 1] += 1; });
  const count = c.votes.size;
  const sum = [...c.votes.values()].reduce((s, n) => s + n, 0);
  const avg = count ? Math.round((sum / count) * 10) / 10 : null;
  return { count, avg, rating: avg == null ? null : Math.round(avg * 2) / 2, dist };
}

/** Запустить голосование. onEnd(result) вызывается, когда время вышло или его завершили кнопкой «Завершить» (не при отмене). */
function start({ id, title, seconds, onEnd }) {
  if (cur) return { error: `Голосование уже идёт: «${cur.title}».` };
  const sec = Math.min(600, Math.max(15, Math.round(Number(seconds) || 60)));
  cur = { id, title, seconds: sec, startedAt: Date.now(), endsAt: Date.now() + sec * 1000, votes: new Map(), onEnd };
  cur.timer = setTimeout(() => finish(false), sec * 1000);
  return { ok: true, status: status() };
}

/** Сообщение из чата. Возвращает true, если это был голос. */
function feed(login, text) {
  if (!cur || !login) return false;
  const m = RE.exec(String(text || ''));
  if (!m) return false;
  cur.votes.set(String(login).toLowerCase(), Number(m[1]));
  return true;
}

function finish(cancel) {
  if (!cur) return null;
  const c = cur; cur = null;
  clearTimeout(c.timer);
  const r = summary(c);
  if (!cancel && c.onEnd) { try { c.onEnd(r, c); } catch (e) { console.warn('[Голосование] Ошибка завершения:', e.message); } }
  return { ...r, id: c.id, title: c.title, cancelled: !!cancel };
}

function status() {
  if (!cur) return { active: false };
  return { active: true, id: cur.id, title: cur.title, seconds: cur.seconds, endsAt: cur.endsAt, left: Math.max(0, Math.round((cur.endsAt - Date.now()) / 1000)), ...summary(cur) };
}

module.exports = { start, feed, finish, status };
