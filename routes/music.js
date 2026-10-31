// routes/music.js — заказ музыки: очередь, настройки, управление плеером. Зависимости приходят из server.js через ctx.
function main(ctx) {
  const { music, app } = ctx;
  const ok = (res, extra) => res.json(Object.assign({ success: true }, music.state(), extra || {}));
  const fail = (res, e, code) => res.status(code || 400).json({ success: false, error: e.message || String(e) });
  app.get('/api/music/state', (req, res) => ok(res));
  app.post('/api/music/settings', (req, res) => { music.update(req.body); ok(res); });
  app.post('/api/music/add', async (req, res) => {
    try { await music.addByQuery((req.body || {}).query, 'Стример'); ok(res); } catch (e) { fail(res, e); }
  });
  app.post('/api/music/skip', (req, res) => { music.skip(); ok(res); });
  app.post('/api/music/ended', (req, res) => { music.ended((req.body || {}).uid); ok(res); });
  app.post('/api/music/pause', (req, res) => { music.setPaused(!!(req.body || {}).paused); ok(res); });
  app.post('/api/music/show', (req, res) => { music.setShow(!!(req.body || {}).show); ok(res); });
  app.post('/api/music/remove', (req, res) => { music.remove((req.body || {}).uid); ok(res); });
  app.post('/api/music/clear', (req, res) => { music.clear(); ok(res); });
  app.post('/api/music/stop', (req, res) => { music.stop(); ok(res); });
  return {};
}
module.exports = { main };
