// routes/themes.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { overlayStyle, app, broadcast } = ctx;
app.get('/api/overlay-style', (req, res) => {
  res.json({ styles: overlayStyle.STYLES, current: overlayStyle.get() });
});

app.post('/api/overlay-style', (req, res) => {
  const current = overlayStyle.update(req.body || {});
  broadcast(); // применяем на оверлее сразу
  res.json({ success: true, current });
});
  return {  };
}

function part2(ctx) {
  const { timeline, widgets, widgetsPersistence, themes, config, saveConfigToDisk, DEFAULT_THEME, app, broadcast } = ctx;
app.get('/api/themes', (req, res) => {
  res.json({ themes: themes.listThemes(), selected: config.selectedTheme || 'default' });
});

app.post('/api/themes/apply', (req, res) => {
  const { themeId } = req.body || {};
  const preset = themes.getTheme(themeId);
  if (!preset) {
    return res.status(400).json({ success: false, error: 'Такой темы не найдено' });
  }
  const defaultTimelineSettings = widgets.getDefaultWidgetSettings().timeline;
  const { theme, timeline: timelinePatch } = themes.applyPreset(preset.params, DEFAULT_THEME, defaultTimelineSettings);

  config.theme = theme;
  config.widgetSettings = widgets.sanitizeWidgetSettings({ timeline: timelinePatch }, config.widgetSettings);
  config.selectedTheme = themeId;

  saveConfigToDisk();
  widgetsPersistence.saveSettingsDebounced(config.widgetSettings);
  broadcast();
  res.json({ success: true, theme: config.theme, widgetSettings: config.widgetSettings, selected: themeId });
});
  return {  };
}

function part3(ctx) {
  const { config, saveConfigToDisk, DEFAULT_THEME, app, sanitizeTheme, broadcast } = ctx;
app.post('/api/theme', (req, res) => {
  config.theme = sanitizeTheme(req.body || {}, config.theme);
  saveConfigToDisk();
  broadcast(); // немедленно применяем на оверлее, без ожидания следующего тика
  res.json({ success: true, theme: config.theme });
});

app.post('/api/theme/reset', (req, res) => {
  config.theme = { ...DEFAULT_THEME };
  saveConfigToDisk();
  broadcast();
  res.json({ success: true, theme: config.theme });
});
  return {  };
}

function part4(ctx) {
  const { themes, adminThemes, app } = ctx;
app.get('/api/admin-themes', (req, res) => {
  res.json({ adminThemes: adminThemes.get() });
});

app.post('/api/admin-themes', (req, res) => {
  const { name, bgColor, textColor, accentColor } = req.body || {};
  const result = adminThemes.addTheme(name, bgColor, textColor, accentColor);
  if (!result.success) return res.status(400).json({ success: false, error: 'Проверь название и все три цвета (формат #rrggbb).' });
  res.json({ success: true, adminThemes: result.data, theme: result.theme });
});

app.post('/api/admin-themes/:id/activate', (req, res) => {
  const result = adminThemes.setActiveTheme(req.params.id);
  if (!result.success) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true, adminThemes: result.data });
});

app.post('/api/admin-themes/picked', (req, res) => res.json({ success: true, adminThemes: adminThemes.markPicked().data }));

app.post('/api/admin-themes/:id/delete', (req, res) => {
  const result = adminThemes.deleteTheme(req.params.id);
  if (!result.success) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, adminThemes: result.data });
});
  return {  };
}

module.exports = { main, part2, part3, part4 };
