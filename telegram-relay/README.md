# Сервер анонсов Overdeck

Основной: Cloudflare Worker (`worker.js`). Запасные: `vercel/` и `netlify/` (в них копия `worker.js` в `lib/`).
Менять код только в `worker.js`, потом `node sync.js` копирует его в запасные.
У каждого хостинга нужен один секрет: `BOT_TOKEN` (токен бота от @BotFather, тот же, что у основного).
