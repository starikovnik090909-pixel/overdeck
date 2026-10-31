// routes/soon.js — экран «Скоро начнём»: настройки, таймер, фон. Зависимости приходят из server.js через ctx.
const path = require('path');
const multer = require('multer');

function main(ctx) {
  const { soonData, app } = ctx;
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, soonData.DIR),
      filename: (req, file, cb) => cb(null, 'bg-' + Date.now() + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(soonData.EXT.includes(path.extname(file.originalname).toLowerCase()) ? null : new Error('Нужна картинка PNG, JPG, WEBP или GIF.'), soonData.EXT.includes(path.extname(file.originalname).toLowerCase())),
  });
  app.get('/api/soon/state', async (req, res) => res.json({ success: true, ...(await soonData.state()) }));
  app.get('/api/soon/settings', (req, res) => res.json({ success: true, settings: soonData.getSettings(), defaults: soonData.DEFAULTS }));
  app.post('/api/soon/settings', (req, res) => res.json({ success: true, settings: soonData.update(req.body) }));
  app.post('/api/soon/colors/reset', (req, res) => res.json({ success: true, settings: soonData.resetColors() }));
  app.post('/api/soon/sync', async (req, res) => {
    const ch = await soonData.sync();
    if (!ch) return res.status(502).json({ success: false, error: 'Не удалось получить данные с Twitch. Проверь, что Overdeck подключён к Twitch (вкладка «Подключения»).' });
    res.json({ success: true, channel: ch });
  });
  app.post('/api/soon/timer', (req, res) => {
    const b = req.body || {};
    if (b.action === 'reset') soonData.resetTimer(); else soonData.startTimer(b.minutes);
    res.json({ success: true });
  });
  app.post('/api/soon/background', (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 15 МБ.' : err.message });
      if (!req.file) return res.status(400).json({ success: false, error: 'Файл не получен.' });
      res.json({ success: true, settings: soonData.setBackground(req.file.filename) });
    });
  });
  app.delete('/api/soon/background', (req, res) => res.json({ success: true, settings: soonData.clearBackground() }));
  return {};
}

module.exports = { main };
