// routes/voicefx.js — голосовые фильтры: настройки, текущий фильтр для страниц, OBS, награда за баллы.
function main(ctx) {
  const { vf, vfReward, obs, app, port } = ctx;
  const ok = (res, extra) => res.json(Object.assign({ success: true }, vf.state(), { obs: obs.getStatus(), reward: vfReward.getStatus() }, extra || {}));
  const fail = (res, e, code) => res.status(code || 400).json({ success: false, error: e.message || String(e) });
  const micUrl = () => 'http://localhost:' + port + '/voicemic.html';
  app.get('/api/voicefx/state', (req, res) => ok(res, { micUrl: micUrl() }));
  app.get('/api/voicefx/active', (req, res) => res.json(vf.active()));
  app.post('/api/voicefx/settings', (req, res) => { vf.update(req.body); vfReward.sync(vf).catch(() => {}); ok(res, { micUrl: micUrl() }); });
  app.post('/api/voicefx/trigger', (req, res) => { const b = req.body || {}; const r = vf.trigger(b.filter, b.seconds || 30, 'Стример', 'manual'); if (!r) return fail(res, new Error('Фильтры выключены')); ok(res); });
  app.post('/api/voicefx/reset', (req, res) => { vf.reset(); ok(res); });
  app.post('/api/voicefx/reward/sync', async (req, res) => { await vfReward.sync(vf).catch(() => {}); ok(res); });
  app.get('/api/voicefx/obs/inputs', async (req, res) => { try { res.json({ success: true, inputs: await obs.listInputs() }); } catch (e) { res.json({ success: false, error: e.message }); } });
  app.post('/api/voicefx/obs/create', async (req, res) => { try { const r = await obs.createFxSource(micUrl()); ok(res, { created: r.created }); } catch (e) { fail(res, e); } });
  app.post('/api/voicefx/obs/test', async (req, res) => { try { await obs.switchMic(!!(req.body || {}).on); ok(res); } catch (e) { fail(res, e); } });
  return {};
}
module.exports = { main };
