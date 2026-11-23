// routes/launcher.js — настройки лаунчера (звук и анимация запуска) для карточки в «Настройках админки».
function main(ctx) {
  const { launcherSettings, app } = ctx;
  app.get('/api/launcher-settings', (req, res) => res.json({ success: true, ...launcherSettings.state() }));
  app.post('/api/launcher-settings', (req, res) => {
    try { res.json({ success: true, ...launcherSettings.update(req.body) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  return {};
}
module.exports = { main };
