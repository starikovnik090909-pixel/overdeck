// Запасной сервер анонсов на Vercel (Edge). Код тот же, что у Cloudflare-воркера (lib/worker.js).
import worker from '../lib/worker.js';
export const config = { runtime: 'edge' };
export default function handler(req) {
  const u = new URL(req.url);
  u.pathname = u.pathname.replace(/^\/api\/relay/, '') || '/';
  return worker.fetch(new Request(u.toString(), req), { BOT_TOKEN: process.env.BOT_TOKEN });
}
