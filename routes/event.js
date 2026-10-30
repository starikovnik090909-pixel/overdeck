// routes/event.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { eventCover, app, eventCoverUpload, deleteOldEventCoverFile } = ctx;
app.get('/api/event-cover', (req, res) => {
  res.json({ success: true, cover: eventCover.get() });
});

app.post('/api/event-cover/name', (req, res) => {
  const cover = eventCover.setName(req.body && req.body.name);
  res.json({ success: true, cover });
});

app.post('/api/event-cover/upload', (req, res) => {
  eventCoverUpload.single('file')(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ success: false, error: tooBig ? 'Файл больше 10 МБ — выберите картинку поменьше.' : (err.message || 'Не удалось загрузить обложку.') });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не принят — нужна картинка png, jpg, webp или gif.' });
    deleteOldEventCoverFile();
    const cover = eventCover.setImageUrl(`/uploads/event/${req.file.filename}`);
    res.json({ success: true, cover });
  });
});

app.post('/api/event-cover/remove', (req, res) => {
  deleteOldEventCoverFile();
  const cover = eventCover.setImageUrl(null);
  res.json({ success: true, cover });
});
  return {  };
}

function part2(ctx) {
  const { eventTheme, app, themeBackgroundUpload, deleteOldThemeBackgroundFile, rebroadcastAllThemedWidgets, validThemeWidget } = ctx;
app.get('/api/event-theme', (req, res) => {
  res.json({ eventTheme: eventTheme.get(), widgetLabels: eventTheme.WIDGET_LABELS });
});

app.post('/api/event-theme/:widget', (req, res) => {
  const { widget } = req.params;
  if (!validThemeWidget(widget)) return res.status(400).json({ success: false, error: `Неизвестный виджет: ${widget}` });
  const data = eventTheme.update(widget, req.body || {});
  rebroadcastAllThemedWidgets();
  res.json({ success: true, eventTheme: data });
});

app.post('/api/event-theme/:widget/preset', (req, res) => {
  const { widget } = req.params;
  const { preset } = req.body || {};
  if (!validThemeWidget(widget)) return res.status(400).json({ success: false, error: `Неизвестный виджет: ${widget}` });
  if (!eventTheme.PRESET_NAMES.includes(preset)) {
    return res.status(400).json({ success: false, error: `Неизвестный пресет: ${preset}` });
  }
  const theme = eventTheme.applyPreset(widget, preset);
  rebroadcastAllThemedWidgets();
  res.json({ success: true, theme });
});

app.post('/api/event-theme/:widget/background/upload', (req, res) => {
  const { widget } = req.params;
  if (!validThemeWidget(widget)) return res.status(400).json({ success: false, error: `Неизвестный виджет: ${widget}` });
  themeBackgroundUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить фон (проверь формат — jpg/png/gif/webp/mp4/webm — и что он не больше 300 МБ).' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не получен.' });
    deleteOldThemeBackgroundFile(widget);
    const data = eventTheme.setBackgroundImageUrl(widget, `/uploads/theme/${req.file.filename}`);
    rebroadcastAllThemedWidgets();
    res.json({ success: true, eventTheme: data });
  });
});

app.post('/api/event-theme/:widget/background/remove', (req, res) => {
  const { widget } = req.params;
  if (!validThemeWidget(widget)) return res.status(400).json({ success: false, error: `Неизвестный виджет: ${widget}` });
  deleteOldThemeBackgroundFile(widget);
  const data = eventTheme.setBackgroundImageUrl(widget, null);
  rebroadcastAllThemedWidgets();
  res.json({ success: true, eventTheme: data });
});
  return {  };
}

module.exports = { main, part2 };
