// routes/background.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { backgroundData, app, backgroundUpload, scheduleBackgroundRotation, broadcastBackgroundUpdate } = ctx;
app.get('/api/background', (req, res) => {
  res.json({ background: backgroundData.get() });
});

app.post('/api/background/upload', (req, res) => {
  backgroundUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить файл (проверь формат — gif/mp4/webm/mov/png/jpg/webp — и что он не больше 300 МБ).' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не получен.' });
    broadcastBackgroundUpdate();
    scheduleBackgroundRotation(); // список фонов только что вырос — если автосмена включена и раньше был только 1 файл, она теперь может заработать
    res.json({ success: true, background: backgroundData.get() });
  });
});

app.post('/api/background/select', (req, res) => {
  const background = backgroundData.setActiveFile((req.body && req.body.file) || null);
  broadcastBackgroundUpdate();
  scheduleBackgroundRotation(); // ручной выбор — отсчёт интервала до следующей автосмены начинается заново от этого момента
  res.json({ success: true, background });
});

app.post('/api/background/delete', (req, res) => {
  const file = req.body && req.body.file;
  if (!file) return res.status(400).json({ success: false, error: 'Не указан файл.' });
  const background = backgroundData.deleteFile(file);
  broadcastBackgroundUpdate();
  scheduleBackgroundRotation(); // список фонов мог сократиться до одного — автосмена должна остановиться
  res.json({ success: true, background });
});

app.post('/api/background/settings', (req, res) => {
  const background = backgroundData.updateSettings(req.body || {});
  broadcastBackgroundUpdate();
  scheduleBackgroundRotation(); // интервал/тумблер автосмены могли измениться
  res.json({ success: true, settings: background.settings });
});
  return {  };
}

module.exports = { main };
