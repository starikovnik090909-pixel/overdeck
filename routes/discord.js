// routes/discord.js — маршруты вкладки «Discord».
function main(ctx) {
  const { discordIntegration: dc, app } = ctx;
  const wrap = (fn) => async (req, res) => {
    try { res.json({ success: true, ...(await fn(req.body || {})) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  };
  app.get('/api/discord', (req, res) => res.json({ success: true, ...dc.publicState() }));
  app.post('/api/discord', wrap((b) => dc.update(b)));
  app.post('/api/discord/test', wrap((b) => (b.end ? dc.testEnd() : dc.test())));
  app.post('/api/discord/check', wrap(() => dc.check()));
  return {};
}
module.exports = { main };
