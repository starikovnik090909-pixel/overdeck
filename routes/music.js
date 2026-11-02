// routes/music.js — заказ музыки: очередь, настройки, управление плеером. Зависимости приходят из server.js через ctx.
function main(ctx) {
  const { music, musicReward, app } = ctx;
  const ok = (res, extra) => res.json(Object.assign({ success: true }, music.state(), { reward: musicReward ? musicReward.getStatus() : null }, extra || {}));
  const fail = (res, e, code) => res.status(code || 400).json({ success: false, error: e.message || String(e) });
  app.get('/api/music/state', (req, res) => ok(res));
  app.post('/api/music/settings', (req, res) => { music.update(req.body); ok(res); });
  app.post('/api/music/add', async (req, res) => {
    try { await music.addByQuery((req.body || {}).query, 'Стример'); ok(res); } catch (e) { fail(res, e); }
  });
  app.post('/api/music/reward/create', async (req, res) => {
    try { const r = await musicReward.create(music.getSettings(), (req.body || {}).cost); ok(res, { created: r }); } catch (e) { fail(res, e); }
  });
  app.post('/api/music/reward/sync', async (req, res) => { try { await musicReward.sync(music.getSettings()); } catch (e) { /* статус отдаём как есть */ } ok(res); });
  app.post('/api/music/pl/select', (req, res) => { music.playlistSelect((req.body || {}).id); ok(res); });
  app.post('/api/music/pl/add', async (req, res) => { try { await music.playlistAdd((req.body || {}).url); ok(res); } catch (e) { fail(res, e); } });
  app.post('/api/music/pl/delete', (req, res) => { music.playlistDelete((req.body || {}).id); ok(res); });
  app.post('/api/music/pl/remove', (req, res) => { const b = req.body || {}; music.playlistRemove(b.list, b.id); ok(res); });
  app.post('/api/music/pl/like', (req, res) => { music.like(); ok(res); });
  app.post('/api/music/skip', (req, res) => { music.skip(); ok(res); });
  app.post('/api/music/ended', (req, res) => { const b = req.body || {}; if (b.error) music.playFailed(b.uid, b.error).catch(() => {}); else music.ended(b.uid); ok(res); });
  app.post('/api/music/progress', (req, res) => { const b = req.body || {}; music.setPos(b.uid, b.t, b.d); res.json({ success: true }); });
  app.post('/api/music/move', (req, res) => { const b = req.body || {}; music.move(b.uid, b.to); ok(res); });
  app.post('/api/music/ban', (req, res) => { const b = req.body || {}; try { music.banTrack(b.id, b.title); ok(res); } catch (e) { fail(res, e); } });
  app.post('/api/music/unban', (req, res) => { music.unbanTrack((req.body || {}).id); ok(res); });
  app.get('/api/music/stats', (req, res) => res.json(Object.assign({ success: true }, music.stats(req.query.since))));
  app.post('/api/music/check', async (req, res) => res.json(Object.assign({ success: true }, await music.checkYoutube())));
  app.post('/api/music/chart/say', async (req, res) => { const sent = await music.sayChart((req.body || {}).since); res.json({ success: sent !== false && !!sent, error: sent ? undefined : 'Бот не подключён к чату или чарт пока пуст.' }); });
  app.post('/api/music/pause', (req, res) => { music.setPaused(!!(req.body || {}).paused); ok(res); });
  app.post('/api/music/show', (req, res) => { music.setShow(!!(req.body || {}).show); ok(res); });
  app.post('/api/music/remove', (req, res) => { music.remove((req.body || {}).uid); ok(res); });
  app.post('/api/music/clear', (req, res) => { music.clear(); ok(res); });
  app.post('/api/music/stop', (req, res) => { music.stop(); ok(res); });
  return {};
}
module.exports = { main };
