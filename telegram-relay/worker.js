// Overdeck Telegram relay (Cloudflare Worker).
// Хранит токен бота (секрет BOT_TOKEN) и пишет анонсы в каналы пользователей Overdeck.
// Состояния нет: канал подтверждается кодом, который владелец публикует в своём канале,
// а выданный ключ — это подписанный (HMAC) chat_id, проверяемый секретом воркера.
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacKey(env) {
  const base = await crypto.subtle.digest('SHA-256', enc.encode('overdeck-relay:' + env.BOT_TOKEN));
  return crypto.subtle.importKey('raw', base, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(env, chatId) {
  const id = String(chatId);
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(id));
  return b64u(enc.encode(id)) + '.' + b64u(mac);
}
async function verify(env, token) {
  const [a, m] = String(token || '').split('.');
  if (!a || !m) return null;
  try {
    const id = new TextDecoder().decode(unb64u(a));
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(m), enc.encode(id));
    return ok ? id : null;
  } catch (e) { return null; }
}

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const tg = async (env, method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) { const e = new Error((j && j.description) || 'Telegram не ответил'); e.code = j && j.error_code; throw e; }
  return j.result;
};
const friendly = (e) => /not enough rights|have no rights|CHAT_WRITE_FORBIDDEN|bot is not a member|kicked|chat not found/i.test(e.message) ? 'Бот больше не админ в канале. Привяжи канал заново.' : e.message;

export default {
  async fetch(req, env) {
    if (!env.BOT_TOKEN) return json({ ok: false, error: 'Не задан секрет BOT_TOKEN.' }, 500);
    const url = new URL(req.url);
    try {
      if (req.method === 'GET' && url.pathname === '/info') {
        const me = await tg(env, 'getMe');
        return json({ ok: true, bot: me.username });
      }
      // Подтверждение канала: ищем в последних постах каналов код, который пользователь опубликовал.
      if (req.method === 'POST' && url.pathname === '/link') {
        const { code } = await req.json().catch(() => ({}));
        if (!/^OV-[A-Za-z0-9]{10,32}$/.test(code || '')) return json({ ok: false, error: 'Неверный код.' }, 400);
        const ups = await tg(env, 'getUpdates', { offset: -100, limit: 100, timeout: 0, allowed_updates: ['channel_post'] });
        const post = ups.map((u) => u.channel_post).reverse().find((p) => p && typeof p.text === 'string' && p.text.trim() === code);
        if (!post) return json({ ok: false, pending: true }, 404);
        const chat = post.chat;
        const me = await tg(env, 'getMe');
        const m = await tg(env, 'getChatMember', { chat_id: chat.id, user_id: me.id }).catch(() => null);
        if (!m || (m.status !== 'administrator' && m.status !== 'creator')) return json({ ok: false, error: 'Бот в канале, но не админ. Дай ему право публиковать сообщения.' }, 400);
        await tg(env, 'deleteMessage', { chat_id: chat.id, message_id: post.message_id }).catch(() => {});
        return json({ ok: true, key: await sign(env, chat.id), title: chat.title || chat.username || String(chat.id) });
      }
      if (req.method === 'POST' && url.pathname === '/send') {
        const ct = req.headers.get('content-type') || '';
        let key, text, button = '', photo = null;
        if (ct.includes('multipart/form-data')) {
          const f = await req.formData(); key = f.get('key'); text = f.get('text'); button = f.get('button') || ''; const p = f.get('photo');
          if (p && typeof p !== 'string') photo = p;
        } else { const b = await req.json(); key = b.key; text = b.text; button = b.button || ''; }
        const chatId = await verify(env, key);
        if (!chatId) return json({ ok: false, error: 'Ключ канала недействителен. Привяжи канал заново.' }, 401);
        text = String(text || '').slice(0, 3500);
        if (!text) return json({ ok: false, error: 'Пустой текст.' }, 400);
        const markup = /^https:\/\/(www\.)?twitch\.tv\//.test(String(button)) ? { inline_keyboard: [[{ text: '▶ Смотреть стрим', url: String(button) }]] } : null;
        let res;
        try {
          if (photo) {
            if (photo.size > 5 * 1024 * 1024) return json({ ok: false, error: 'Картинка больше 5 МБ.' }, 413);
            const fd = new FormData();
            fd.append('chat_id', chatId); fd.append('parse_mode', 'HTML'); fd.append('caption', text.slice(0, 1024));
            if (markup) fd.append('reply_markup', JSON.stringify(markup));
            fd.append('photo', photo, 'stream.jpg');
            res = await tg(env, 'sendPhoto', fd);
          } else res = await tg(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false, ...(markup ? { reply_markup: markup } : {}) });
        } catch (e) { return json({ ok: false, error: friendly(e) }, 400); }
        return json({ ok: true, id: res.message_id });
      }
      // Удаление постов, которые бот сам сделал в этом канале (не больше 30 за раз).
      if (req.method === 'POST' && url.pathname === '/delete') {
        const b = await req.json().catch(() => ({}));
        const chatId = await verify(env, b.key);
        if (!chatId) return json({ ok: false, error: 'Ключ канала недействителен. Привяжи канал заново.' }, 401);
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 30);
        let done = 0;
        for (const id of ids) { try { await tg(env, 'deleteMessage', { chat_id: chatId, message_id: id }); done++; } catch (e) { /* уже удалён */ } }
        return json({ ok: true, deleted: done });
      }
      if (url.pathname === '/') return new Response('Overdeck Telegram relay: работает.', { status: 200 });
      return json({ ok: false, error: 'Не найдено.' }, 404);
    } catch (e) { return json({ ok: false, error: friendly(e) }, 502); }
  },
};
