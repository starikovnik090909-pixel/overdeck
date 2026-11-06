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
  const { tabLock, timeline, widgets, widgetsPersistence, themes, config, saveConfigToDisk, DEFAULT_THEME, app, broadcast } = ctx;
app.get('/api/themes', (req, res) => {
  const open = tabLock.isValidToken(req.get('X-Lock-Token')); // закрытые темы (locked) видны только после пароля
  const list = themes.listThemes().filter((t) => open || !t.locked);
  const sel = config.selectedTheme || 'default';
  res.json({ themes: list, selected: list.some((t) => t.id === sel) ? sel : 'default' });
});

app.post('/api/themes/apply', (req, res) => {
  const { themeId } = req.body || {};
  const preset = themes.getTheme(themeId);
  if (!preset) {
    return res.status(400).json({ success: false, error: 'Такой темы не найдено' });
  }
  if (preset.locked && !tabLock.isValidToken(req.get('X-Lock-Token'))) return res.status(403).json({ success: false, error: 'Тема закрыта. Введи пароль на закрытых вкладках.' });
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
  const { themes, adminThemes, tabLock, app } = ctx;
  const open = (req) => tabLock.isValidToken(req.get('X-Lock-Token'));
app.get('/api/admin-themes', (req, res) => {
  res.json({ adminThemes: adminThemes.visible(open(req)) });
});

app.post('/api/admin-themes', (req, res) => {
  const { name, bgColor, textColor, accentColor } = req.body || {};
  const result = adminThemes.addTheme(name, bgColor, textColor, accentColor);
  if (!result.success) return res.status(400).json({ success: false, error: 'Проверь название и все три цвета (формат #rrggbb).' });
  res.json({ success: true, adminThemes: adminThemes.visible(open(req)), theme: result.theme });
});

app.post('/api/admin-themes/:id/activate', (req, res) => {
  if (adminThemes.isLocked(req.params.id) && !open(req)) return res.status(403).json({ success: false, error: 'Тема закрыта. Введи пароль на закрытых вкладках.' });
  const result = adminThemes.setActiveTheme(req.params.id);
  if (!result.success) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true, adminThemes: adminThemes.visible(open(req)) });
});

app.post('/api/admin-themes/picked', (req, res) => res.json({ success: true, adminThemes: (adminThemes.markPicked(), adminThemes.visible(open(req))) }));

app.post('/api/admin-themes/:id/delete', (req, res) => {
  const result = adminThemes.deleteTheme(req.params.id);
  if (!result.success) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, adminThemes: adminThemes.visible(open(req)) });
});
  return {  };
}

module.exports = { main, part2, part3, part4 };
