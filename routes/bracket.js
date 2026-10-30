// routes/bracket.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { bracketData, app, bracketLogoUpload, bracketWithTheme, broadcastBracketUpdate } = ctx;
app.get('/api/bracket', (req, res) => {
  res.json({ bracket: bracketWithTheme() });
});

app.post('/api/bracket/logo', (req, res) => {
  bracketLogoUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить логотип (проверь, что это .png или .webp и он не больше 8 МБ).' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не получен.' });
    res.json({ success: true, logoUrl: `/uploads/bracket-logos/${req.file.filename}` });
  });
});

app.post('/api/bracket/generate', (req, res) => {
  const { mode, teamCount } = req.body || {};
  if (!bracketData.MODES.includes(mode)) return res.status(400).json({ success: false, error: `Неизвестный режим: ${mode}` });
  const bracket = bracketData.generateBracket(mode, teamCount);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/match/:id/slot/:slot/fill', (req, res) => {
  const { name, logoUrl } = req.body || {};
  const bracket = bracketData.fillSlot(req.params.id, req.params.slot.toUpperCase(), name, logoUrl);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/team/:id/update', (req, res) => {
  const { name, logoUrl } = req.body || {};
  const bracket = bracketData.updateTeamInfo(req.params.id, name, logoUrl);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/match/:id/result', (req, res) => {
  const bracket = bracketData.setMatchResult(req.params.id, req.body && req.body.winnerTeamId);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/match/:id/reset', (req, res) => {
  const bracket = bracketData.resetMatchResult(req.params.id); // только Double Elimination: отмена результата матча и всего, что из него вытекало
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/match/:id/score', (req, res) => {
  const { scoreA, scoreB } = req.body || {};
  const bracket = bracketData.setMatchScore(req.params.id, scoreA, scoreB);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/final-format', (req, res) => {
  const { format } = req.body || {};
  if (!bracketData.FINAL_FORMATS.includes(format)) {
    return res.status(400).json({ success: false, error: `format должен быть одним из: ${bracketData.FINAL_FORMATS.join(', ')}` });
  }
  const bracket = bracketData.setFinalFormat(format);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/final/game-win', (req, res) => {
  const bracket = bracketData.addFinalGameWin(req.body && req.body.teamId);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/final/reset-games', (req, res) => {
  const bracket = bracketData.resetFinalGames();
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/size-settings', (req, res) => {
  const bracket = bracketData.updateSizeSettings(req.body || {});
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/color-settings', (req, res) => {
  const bracket = bracketData.updateColorSettings(req.body || {});
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/size-defaults', (req, res) => {
  const sizeDefaults = bracketData.saveSizeSettingsAsDefault();
  res.json({ success: true, sizeDefaults });
});

app.post('/api/bracket/panel-layout', (req, res) => {
  const rawLayout = (req.body && req.body.panelLayout) || {};
  const bracket = bracketData.updatePanelLayout(rawLayout);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/panel-layout-defaults', (req, res) => {
  const panelLayoutDefaults = bracketData.savePanelLayoutAsDefault();
  res.json({ success: true, panelLayoutDefaults });
});

app.post('/api/bracket/group-label', (req, res) => {
  const bracket = bracketData.setGroupLabel(req.body && req.body.text);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/matches-title', (req, res) => {
  const bracket = bracketData.setMatchesTitle(req.body && req.body.text);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/swap-slots', (req, res) => {
  const { matchIdA, slotA, matchIdB, slotB } = req.body || {};
  const bracket = bracketData.swapSlots(matchIdA, slotA, matchIdB, slotB);
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/reset-seeding', (req, res) => {
  const bracket = bracketData.resetToOriginalSeeding();
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/clear', (req, res) => {
  const bracket = bracketData.clearBracket();
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.get('/api/bracket/saved', (req, res) => {
  res.json({ saved: bracketData.listSavedBrackets() });
});

app.post('/api/bracket/saved', (req, res) => {
  const saved = bracketData.saveBracketAs(req.body && req.body.name);
  res.json({ success: true, saved });
});

app.post('/api/bracket/saved/:id/load', (req, res) => {
  const bracket = bracketData.loadSavedBracket(req.params.id);
  if (!bracket) return res.status(404).json({ success: false, error: 'Сетка не найдена.' });
  broadcastBracketUpdate();
  res.json({ success: true, bracket });
});

app.post('/api/bracket/saved/:id/delete', (req, res) => {
  const saved = bracketData.deleteSavedBracket(req.params.id);
  res.json({ success: true, saved });
});

app.get('/api/bracket/teams-roster', (req, res) => {
  res.json({ teams: bracketData.listSavedTeams() });
});

app.post('/api/bracket/teams-roster', (req, res) => {
  const { name, logoUrl } = req.body || {};
  const team = bracketData.saveTeamToRoster(name, logoUrl);
  res.json({ success: true, team });
});

app.post('/api/bracket/teams-roster/:id/delete', (req, res) => {
  const teams = bracketData.deleteSavedTeam(req.params.id);
  res.json({ success: true, teams });
});
  return {  };
}

module.exports = { main };
