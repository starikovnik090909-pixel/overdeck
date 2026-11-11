// routes/obsRefresh.js — настройки и кнопка «Обновить источники в OBS».
function main(ctx) {
  const { obsRefresh, app } = ctx;
  app.get('/api/obs-refresh', (req, res) => res.json({ success: true, ...obsRefresh.state() }));
  app.post('/api/obs-refresh/settings', (req, res) => res.json({ success: true, ...obsRefresh.update(req.body) }));
  app.post('/api/obs-refresh/now', async (req, res) => { const r = await obsRefresh.refreshNow('кнопка'); res.status(r.success ? 200 : 502).json(r); });
  // Готовый скрипт для OBS (работает без WebSocket и без запущенного Overdeck)
  app.get('/api/obs-refresh/script', (req, res) => {
    const f = require('path').join(__dirname, '..', 'obs-scripts', 'overdeck-refresh.lua');
    res.download(f, 'overdeck-refresh.lua', (e) => { if (e && !res.headersSent) res.status(404).json({ success: false, error: 'Скрипт не найден' }); });
  });
  return {};
}
module.exports = { main };
