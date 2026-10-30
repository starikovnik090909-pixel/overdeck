// routes/telegram.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { chronicles, telegramAnnounce, app } = ctx;
app.get('/api/telegram', (req, res) => res.json({ success: true, ...telegramAnnounce.publicState() }));
app.post('/api/telegram', (req, res) => res.json({ success: true, ...telegramAnnounce.update(req.body) }));
app.post('/api/telegram/chronicle', async (req, res) => {
  try {
    const it = chronicles.list().find((x) => x.id === (req.body && req.body.id));
    if (!it) return res.status(404).json({ success: false, error: 'Запись не найдена.' });
    res.json({ success: true, ...(await telegramAnnounce.postChronicle(it)) });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/telegram/check', async (req, res) => {
  try { res.json({ success: true, ...(await telegramAnnounce.check()) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/telegram/link/start', async (req, res) => {
  try { res.json({ success: true, ...(await telegramAnnounce.linkStart()) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/telegram/link/check', async (req, res) => {
  try { res.json({ success: true, ...(await telegramAnnounce.linkCheck()) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/telegram/test', async (req, res) => {
  try { res.json({ success: true, ...(await (req.body && req.body.end ? telegramAnnounce.testEnd() : telegramAnnounce.test())) }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
  return {  };
}

module.exports = { main };
