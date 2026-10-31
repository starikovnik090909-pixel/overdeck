// routes/gazette.js — вкладка «Доп. функционал»: вечерний выпуск (афиша с титрами, газета, эфир).
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { gazetteService, app } = ctx;
  const svc = gazetteService;

  app.get('/api/gazette/state', (req, res) => res.json({ success: true, ...svc.state() }));
  app.get('/api/gazette/issue', (req, res) => {
    try { res.json({ success: true, issue: svc.buildIssue({ demo: req.query.demo, seed: req.query.seed }) }); }
    catch (e) { res.status(500).json({ success: false, error: 'Не удалось собрать выпуск: ' + e.message }); }
  });
  app.post('/api/gazette/show', (req, res) => {
    const b = req.body || {};
    if (!['credits', 'gazette'].includes(b.format)) return res.status(400).json({ success: false, error: 'Неизвестный экран' });
    res.json({ success: true, ...svc.show(b.format, b.demo) });
  });
  app.post('/api/gazette/hide', (req, res) => res.json({ success: true, ...svc.hide() }));
  app.post('/api/gazette/pulse', (req, res) => res.json({ success: true, ...svc.firePulse(req.body && req.body.demo) }));
  app.get('/api/gazette/settings', (req, res) => res.json({ success: true, settings: svc.getSettings(), defaults: svc.DEFAULTS, studio: svc.state().studio }));
  app.post('/api/gazette/settings', (req, res) => res.json({ success: true, settings: svc.update(req.body), studio: svc.state().studio }));
  app.get('/api/gazette/journal', (req, res) => res.json({ success: true, ...svc.journal.counts() }));
  app.post('/api/gazette/journal/clear', (req, res) => { svc.journal.reset(); res.json({ success: true, ...svc.journal.counts() }); });
  return {};
}

module.exports = { main };
