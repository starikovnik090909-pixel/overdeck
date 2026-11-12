// routes/vk.js — маршруты вкладки «ВКонтакте».
function main(ctx) {
  const { vkIntegration: vk, app } = ctx;
  const wrap = (fn) => async (req, res) => {
    try { res.json({ success: true, ...(await fn(req.body || {})) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  };
  app.get('/api/vk', (req, res) => res.json({ success: true, ...vk.publicState() }));
  app.post('/api/vk', wrap((b) => vk.update(b)));
  app.post('/api/vk/test', wrap((b) => (b.end ? vk.testEnd() : vk.test())));
  app.post('/api/vk/check', wrap(() => vk.check()));
  return {};
}
module.exports = { main };
