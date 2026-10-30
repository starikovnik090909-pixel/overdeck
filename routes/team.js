// routes/team.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { teamData, app, teamUpload, validSide, broadcastTeamUpdate } = ctx;
app.post('/api/team/:side/save', (req, res) => {
  const { side } = req.params;
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  const { teamName, players } = req.body || {};
  teamData.updateText(side, { teamName, players });
  broadcastTeamUpdate(side);
  res.json({ success: true, team: teamData.getSide(side) });
});

app.post('/api/team/:side/photo/:slot', (req, res) => {
  const { side, slot } = req.params;
  const slotIndex = Number(slot);
  if (!validSide(side) || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= teamData.PLAYERS_PER_TEAM) {
    return res.status(400).json({ success: false, error: 'Некорректная команда или номер слота' });
  }
  teamUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить фото' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не подходит (нужен .png/.jpg/.jpeg/.webp)' });
    const url = `/uploads/team/${req.file.filename}`;
    teamData.setPlayerPhoto(side, slotIndex, url);
    broadcastTeamUpdate(side);
    res.json({ success: true, url });
  });
});

/** Кадрирование фото игрока: { x, y, zoom }. Сохраняется вместе с командой (и попадает в «Сохранить команду»). */
app.post('/api/team/:side/photo/:slot/crop', (req, res) => {
  const { side, slot } = req.params;
  const slotIndex = Number(slot);
  if (!validSide(side) || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= teamData.PLAYERS_PER_TEAM) {
    return res.status(400).json({ success: false, error: 'Некорректная команда или номер слота' });
  }
  if (!teamData.setPlayerCrop(side, slotIndex, req.body)) return res.status(400).json({ success: false, error: 'Нужны x, y (0…1) и zoom (1…4).' });
  broadcastTeamUpdate(side);
  res.json({ success: true, crop: teamData.getSide(side).players[slotIndex].crop });
});

/** Размер и положение логотипа этой команды: { size, x, y } или { reset: true } — вернуть к общим настройкам. */
app.post('/api/team/:side/logo-layout', (req, res) => {
  const { side } = req.params;
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  const b = req.body || {};
  if (!teamData.setLogoLayout(side, b.reset === true ? null : b)) return res.status(400).json({ success: false, error: 'Нужны size (20…320), x и y (0…100).' });
  broadcastTeamUpdate(side);
  res.json({ success: true, logoLayout: teamData.getSide(side).logoLayout });
});

app.post('/api/team/:side/logo', (req, res) => {
  const { side } = req.params;
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  teamUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить логотип' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не подходит (нужен .png/.jpg/.jpeg/.webp)' });
    const url = `/uploads/team/${req.file.filename}`;
    teamData.setLogo(side, url);
    broadcastTeamUpdate(side);
    res.json({ success: true, url });
  });
});
  return {  };
}

function part2(ctx) {
  const { mvpData, app, mvpUpload, broadcastMvpUpdate } = ctx;
app.get('/api/mvp', (req, res) => {
  res.json({ mvp: mvpData.get() });
});

app.post('/api/mvp/save', (req, res) => {
  const mvp = mvpData.updateText(req.body || {});
  broadcastMvpUpdate();
  res.json({ success: true, mvp });
});

app.post('/api/mvp/photo', (req, res) => {
  mvpUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить фото' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не подходит (нужен .png/.jpg/.jpeg/.webp)' });
    const url = `/uploads/mvp/${req.file.filename}`;
    mvpData.setPhoto(url);
    broadcastMvpUpdate();
    res.json({ success: true, url });
  });
});

let mvpAutoHideTimer = null;

app.post('/api/mvp/show', (req, res) => {
  clearTimeout(mvpAutoHideTimer); // повторный клик "Показать" перезапускает отсчёт с начала
  const mvp = mvpData.setVisible(true);
  broadcastMvpUpdate();
  mvpAutoHideTimer = setTimeout(() => {
    mvpData.setVisible(false);
    broadcastMvpUpdate();
  }, (mvp.settings.displaySeconds || 10) * 1000);
  res.json({ success: true, mvp });
});

app.post('/api/mvp/hide', (req, res) => {
  clearTimeout(mvpAutoHideTimer); // ручное скрытие раньше времени — автоскрытие по таймеру больше не нужно
  const mvp = mvpData.setVisible(false);
  broadcastMvpUpdate();
  res.json({ success: true, mvp });
});

app.post('/api/mvp/settings', (req, res) => {
  const settings = mvpData.updateSettings(req.body || {});
  broadcastMvpUpdate();
  res.json({ success: true, settings });
});

app.post('/api/mvp/settings/reset', (req, res) => {
  const settings = mvpData.resetSettings();
  broadcastMvpUpdate();
  res.json({ success: true, settings });
});
  return {  };
}

function part3(ctx) {
  const { teamData, teamPresets, app, validSide, broadcastTeamUpdate } = ctx;
app.get('/api/team', (req, res) => {
  res.json({ teams: teamData.getAll(), recommendedSize: teamData.getRecommendedSize() });
});

app.post('/api/team/settings', (req, res) => {
  const settings = teamData.updateSettings(req.body || {});
  broadcastTeamUpdate('left');
  broadcastTeamUpdate('right');
  res.json({ success: true, settings, recommendedSize: teamData.getRecommendedSize() });
});

app.post('/api/team/settings/reset', (req, res) => {
  const settings = teamData.resetSettings();
  broadcastTeamUpdate('left');
  broadcastTeamUpdate('right');
  res.json({ success: true, settings, recommendedSize: teamData.getRecommendedSize() });
});

app.post('/api/team/settings/save-as-default', (req, res) => {
  const settingsDefaults = teamData.saveCurrentAsDefaults();
  res.json({ success: true, settingsDefaults });
});

// ---------- REST API: сохранённые пресеты команд ("Сохранить команду"/"Загрузить команду") ----------

app.get('/api/team/presets', (req, res) => {
  res.json({ presets: teamPresets.list() });
});

app.post('/api/team/presets/save', (req, res) => {
  const { side, name } = req.body || {};
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Укажи имя пресета' });
  const team = teamData.getSide(side);
  const preset = teamPresets.save(name, team);
  res.json({ success: true, preset });
});

app.post('/api/team/presets/load', (req, res) => {
  const { side, id } = req.body || {};
  if (!validSide(side)) return res.status(400).json({ success: false, error: 'side должен быть left или right' });
  const preset = teamPresets.load(id);
  if (!preset) return res.status(404).json({ success: false, error: 'Пресет не найден' });

  teamData.updateText(side, { teamName: preset.teamName, players: preset.players });
  preset.players.forEach((p, i) => teamData.setPlayerPhoto(side, i, p.photoUrl, p.crop));   // кадрирование фото — из пресета (у старых пресетов его нет → по центру)
  teamData.setLogo(side, preset.logoUrl);
  teamData.setLogoLayout(side, preset.logoLayout || null);   // размер/положение логотипа этой команды (нет → общие настройки)
  broadcastTeamUpdate(side);
  res.json({ success: true, team: teamData.getSide(side) });
});

app.post('/api/team/presets/delete', (req, res) => {
  const { id } = req.body || {};
  const removed = teamPresets.remove(id);
  res.json({ success: removed });
});
  return {  };
}

module.exports = { main, part2, part3 };
