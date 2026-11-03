// routes/mods.js — моды Overdeck. Сейчас один: «Овервойс» (нейроголос).
function main(ctx) {
  const { mod, app } = ctx;
  const send = async (res, extra) => res.json(Object.assign({ success: true }, await mod.state(), extra || {}));
  app.get('/api/mods/overvoice', (req, res) => send(res));
  app.post('/api/mods/overvoice/settings', async (req, res) => { const b = req.body || {}; mod.update({ autostart: b.autostart }); send(res); });
  app.post('/api/mods/overvoice/start', async (req, res) => { try { await mod.start(); send(res); } catch (e) { res.status(400).json(Object.assign({ success: false, error: e.message }, await mod.state())); } });
  app.post('/api/mods/overvoice/stop', async (req, res) => { await mod.stop(); send(res); });
  return {};
}
module.exports = { main };
