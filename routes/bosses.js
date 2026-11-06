// routes/bosses.js — маршруты вкладки «Боссы» в админке ЧатАватаров.
function main({ app, bosses, startBossFight }) {
  const ok = (res, extra) => res.json({ success: true, ...extra });
  const fail = (res, error, code) => res.status(code || 400).json({ success: false, error });
  app.get('/api/bosses', (req, res) => ok(res, bosses.getState()));
  app.post('/api/bosses/settings', (req, res) => { bosses.setSettings(req.body || {}); ok(res, bosses.getState()); });
  app.post('/api/bosses/save', (req, res) => { const r = bosses.saveBoss(req.body || {}); if (!r.ok) return fail(res, r.error); ok(res, bosses.getState()); });
  app.post('/api/bosses/delete', (req, res) => { const r = bosses.removeBoss(String((req.body || {}).id || '')); if (!r.ok) return fail(res, r.error); ok(res, bosses.getState()); });
  app.post('/api/bosses/summon', (req, res) => { const r = startBossFight(bosses.summon(String((req.body || {}).id || 'random'), 'admin')); if (!r || !r.ok) return fail(res, (r && r.error) || 'Не удалось вызвать босса.'); ok(res, { announce: r.announce, state: bosses.getState() }); });
  app.post('/api/bosses/balance', (req, res) => {
    const b = req.body || {}, n = Math.max(1, Math.min(bosses.MAX_HEROES, parseInt(b.heroes, 10) || 10)), lvl = Math.max(0, Math.min(99, parseInt(b.level, 10) || 5));
    const r = bosses.balance(b.boss || {}, n, lvl); if (!r.ok) return fail(res, r.error); ok(res, { result: r });
  });
}
module.exports = { main };
