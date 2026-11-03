// routes/soundpad.js — саундпад: звуки, загрузка своих, запуск, награды за баллы. Зависимости приходят из server.js через ctx.
function main(ctx) {
  const { sp, spReward, app, upload } = ctx;
  const ok = (res, extra) => res.json(Object.assign({ success: true }, sp.state(), { reward: spReward.getStatus() }, extra || {}));
  const fail = (res, e, code) => res.status(code || 400).json({ success: false, error: e.message || String(e) });
  const resync = () => spReward.sync(sp).catch(() => {});
  app.get('/api/soundpad/state', (req, res) => ok(res));
  app.get('/api/soundpad/poll', (req, res) => res.json(sp.poll(req.query.after)));
  app.post('/api/soundpad/settings', (req, res) => { sp.update(req.body); resync(); ok(res); });
  app.post('/api/soundpad/mark', (req, res) => { const b = req.body || {}; const n = sp.mark(b.all ? 'all' : (Array.isArray(b.ids) ? b.ids : []), !!b.on); resync(); ok(res, { marked: n }); });
  app.post('/api/soundpad/play', (req, res) => { try { const r = sp.play((req.body || {}).id, 'Стример'); ok(res, { played: r.played }); } catch (e) { fail(res, e); } });
  app.post('/api/soundpad/stop', (req, res) => { sp.stopAll(); ok(res); });
  app.post('/api/soundpad/sound', (req, res) => { try { const b = req.body || {}; sp.updateSound(b.id, b); resync(); ok(res); } catch (e) { fail(res, e); } });
  app.post('/api/soundpad/delete', async (req, res) => {
    try { const r = sp.remove((req.body || {}).id); if (r.reward && r.reward.id) await spReward.dropReward(r.reward.id); ok(res); } catch (e) { fail(res, e); }
  });
  app.post('/api/soundpad/upload', upload.single('file'), (req, res) => {
    try {
      if (!req.file) throw new Error('Файл не принят: нужен mp3, wav, ogg или m4a до 5 МБ');
      const body = req.body || {};
      const fix = (v) => { try { return Buffer.from(String(v), 'latin1').toString('utf8'); } catch (e) { return String(v); } };   // имя файла от браузера приходит как latin1
      const name = String(body.name || '').trim() || (/[\u00C0-\u00FF]/.test(req.file.originalname) ? fix(req.file.originalname) : req.file.originalname);
      const s = sp.addUploaded(req.file.filename, name, name);
      ok(res, { added: s });
    } catch (e) { fail(res, e); }
  });
  app.post('/api/soundpad/reward/sync', async (req, res) => { await spReward.sync(sp).catch(() => {}); ok(res); });
  return {};
}
module.exports = { main };
