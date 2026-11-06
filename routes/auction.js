// routes/auction.js — вкладка «Аукцион»: мост Overdeck → PointAuc (взнос по награде, старт и стоп аукциона).
function main({ app, bridge, reward, pixel }) {
  const state = () => ({ success: true, settings: bridge.getSettings(), state: bridge.state(), reward: reward.getStatus() });
  const resync = () => reward.sync(bridge).catch(() => {});
  app.get('/api/auction-bridge', (req, res) => res.json(state()));
  app.post('/api/auction-bridge/settings', async (req, res) => { bridge.setSettings(req.body || {}); await resync(); res.json(state()); });
  app.post('/api/auction-bridge/start', async (req, res) => { const r = bridge.start(); if (!r.ok) return res.status(400).json({ success: false, error: r.error }); await resync(); res.json(state()); });
  app.post('/api/auction-bridge/stop', async (req, res) => { const r = bridge.stop(); if (!r.ok) return res.status(400).json({ success: false, error: r.error }); await resync(); res.json({ ...state(), finished: r }); });
  app.post('/api/auction-bridge/reward/create', async (req, res) => { const r = await reward.create(bridge); res.json({ ...state(), success: r.ok, error: r.error }); });
  app.post('/api/auction-bridge/reward/sync', async (req, res) => { await resync(); res.json(state()); });
  // «А сколько внесёт зритель?» — по нику (из профилей аватаров) или вручную (уровень, подписка, VIP)
  app.post('/api/auction-bridge/preview', (req, res) => {
    const b = req.body || {}, login = String(b.login || '').trim().toLowerCase();
    const p = login ? pixel.getProfile(login) : { level: Math.max(0, parseInt(b.level, 10) || 0), flags: { sub: !!b.sub, vip: !!b.vip } };
    res.json({ success: true, found: !!p, calc: bridge.preview(p || { level: 0, flags: {} }) });
  });
}
module.exports = { main };
