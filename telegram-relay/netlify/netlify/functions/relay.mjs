// Запасной сервер анонсов на Netlify. Код тот же, что у Cloudflare-воркера (lib/worker.js).
import worker from '../../lib/worker.js';
export const config = { path: '/*' };
export default async (req) => worker.fetch(req, { BOT_TOKEN: process.env.BOT_TOKEN });
