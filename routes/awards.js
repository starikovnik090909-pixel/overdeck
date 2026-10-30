// routes/awards.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { pixelHeroes, awards, app } = ctx;
// ---------- Награды и события (ЧатАватары → «События») ----------
app.get('/api/awards', (req, res) => {
  res.json({ success: true, awards: awards.list(), event: awards.getEvent(), log: awards.getLog(), limits: awards.limits });
});
app.post('/api/awards/event/start', (req, res) => {
  const b = req.body || {};
  const r = awards.startEvent({ awardId: b.awardId, title: b.title, description: b.description, icon: b.icon, iconSmall: b.iconSmall, howTo: b.howTo, durationMin: b.durationMin });
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, event: r.event, awards: awards.list() });
});
app.post('/api/awards/event/finish', (req, res) => {
  const r = awards.finishEvent(!(req.body && req.body.cancel === true));
  if (!r.ok) return res.status(400).json({ success: false, error: 'Сейчас нет идущего события.' });
  res.json({ success: true, granted: r.granted, awards: awards.list() });
});
app.post('/api/awards/create', (req, res) => {
  const b = req.body || {};
  const r = awards.createAward({ title: b.title, description: b.description, howTo: b.howTo, icon: b.icon, iconSmall: b.iconSmall });
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, award: r.award, awards: awards.list() });
});
app.post('/api/awards/delete', (req, res) => {
  if (!awards.deleteAward(req.body && req.body.id)) return res.status(400).json({ success: false, error: 'Не удалось удалить: награды нет или она сейчас в идущем событии.' });
  res.json({ success: true, awards: awards.list() });
});
app.post('/api/awards/grant', (req, res) => {
  const b = req.body || {};
  const logins = Array.isArray(b.logins) ? b.logins : String(b.logins || '').split(/[\s,;]+/);
  const r = awards.grant(b.awardId, logins);
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, granted: r.granted, skipped: r.skipped, awards: awards.list() });
});
app.post('/api/awards/update', (req, res) => {
  const b = req.body || {}; const patch = {};
  for (const k of ['title', 'description', 'howTo', 'icon', 'iconSmall', 'available']) if (k in b) patch[k] = b[k];
  const r = awards.updateAward(b.id, patch);
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, awards: awards.list() });
});
app.post('/api/awards/grant-all', (req, res) => {
  const r = awards.grantAll(req.body && req.body.awardId, pixelHeroes.allLogins());
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, granted: r.granted, total: pixelHeroes.allLogins().length, awards: awards.list() });
});
app.post('/api/awards/revoke', (req, res) => {
  const b = req.body || {};
  if (!awards.revoke(b.awardId, b.login)) return res.status(400).json({ success: false, error: 'У этого игрока нет такой награды.' });
  res.json({ success: true, awards: awards.list() });
});
  return {  };
}

module.exports = { main };
