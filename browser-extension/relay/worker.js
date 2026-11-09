// Релей плейлиста Twitch для 1080p (бета). Cloudflare Worker: получает запрос от расширения, сам запрашивает
// плейлист у Twitch и возвращает его. Сами видеосегменты расширение качает напрямую, через релей идёт только короткий текст.
// Как развернуть: dash.cloudflare.com → Workers & Pages → Create → Hello World → Edit code → вставить этот файл → Deploy.
// Адрес вида https://имя.твой-аккаунт.workers.dev вставь в окошке расширения. Никакие данные аккаунта не передаются.
export default {
  async fetch(req) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': '*' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return new Response('method', { status: 405, headers: cors });
    const u = new URL(req.url);
    if (!/^\/api\/(v2\/)?channel\/hls\/[A-Za-z0-9_]{1,25}\.m3u8$/.test(u.pathname)) return new Response('not allowed', { status: 403, headers: cors });
    const r = await fetch('https://usher.ttvnw.net' + u.pathname + u.search, { headers: { Accept: '*/*' } });
    const h = new Headers(cors); h.set('Content-Type', r.headers.get('Content-Type') || 'application/vnd.apple.mpegurl'); h.set('Cache-Control', 'no-store');
    return new Response(r.body, { status: r.status, headers: h });
  },
};
