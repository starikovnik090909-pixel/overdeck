// routes/obsRefresh.js — настройки и кнопка «Обновить источники в OBS».
function main(ctx) {
  const { obsRefresh, app } = ctx;
  app.get('/api/obs-refresh', (req, res) => res.json({ success: true, ...obsRefresh.state() }));
  app.post('/api/obs-refresh/settings', (req, res) => res.json({ success: true, ...obsRefresh.update(req.body) }));
  app.post('/api/obs-refresh/now', async (req, res) => { const r = await obsRefresh.refreshNow('кнопка'); res.status(r.success ? 200 : 502).json(r); });
  return {};
}
module.exports = { main };
