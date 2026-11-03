// routes/nv.js — NV (нейроголос): установка и запуск движка, настройки, пропуск запросов страницы NV к движку.
function main(ctx) {
  const { nv, app } = ctx;
  const ok = (res, extra) => res.json(Object.assign({ success: true }, nv.state(), extra || {}));
  app.get('/api/nv/state', async (req, res) => { let voices = []; try { if (nv.state().status.running) voices = await nv.voices(); } catch (e) { /* движок занят */ } ok(res, { voices }); });
  app.post('/api/nv/settings', (req, res) => { nv.update(Object.assign({}, nv.getSettings(), req.body || {})); ok(res); });
  app.post('/api/nv/install', (req, res) => { nv.install(); setTimeout(() => ok(res), 300); });
  app.post('/api/nv/start', async (req, res) => { nv.start().catch(() => {}); setTimeout(() => ok(res), 300); });
  app.post('/api/nv/stop', (req, res) => { nv.stop(); ok(res); });
  app.get('/api/nv/voices', async (req, res) => { try { res.json({ success: true, voices: await nv.voices() }); } catch (e) { res.json({ success: false, voices: [], error: e.message }); } });
  app.all('/api/nv/engine/*', (req, res) => nv.proxy(req, res, req.originalUrl.replace(/^\/api\/nv\/engine/, '') || '/'));
  return {};
}
module.exports = { main };
