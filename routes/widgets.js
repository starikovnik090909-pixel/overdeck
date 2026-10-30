// routes/widgets.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { timeline, widgets, widgetsPersistence, config, app, broadcastAdminStatus, broadcast } = ctx;
app.get('/api/widget-settings', (req, res) => {
  res.json({
    schema: widgets.WIDGET_SETTINGS_SCHEMA,
    settings: config.widgetSettings,
    defaults: widgets.getDefaultWidgetSettings(),
  });
});

app.post('/api/widget-settings', (req, res) => {
  const widgetId = req.body && req.body.widgetId;
  if (!widgetId || !widgets.WIDGET_SETTINGS_SCHEMA[widgetId]) {
    return res.status(400).json({ success: false, error: 'Неизвестный виджет или у него нет настроек' });
  }
  const patch = { [widgetId]: (req.body && req.body.settings) || {} };
  config.widgetSettings = widgets.sanitizeWidgetSettings(patch, config.widgetSettings);
  if (widgetId === 'timeline') timeline.setWindowSec(config.widgetSettings.timeline.windowSec);
  widgetsPersistence.saveSettingsDebounced(config.widgetSettings);
  broadcast(); // применяем на оверлее сразу же
  broadcastAdminStatus(); // и в живом превью админки (другие открытые вкладки/устройства)
  res.json({ success: true, settings: config.widgetSettings });
});

app.post('/api/widget-settings/reset', (req, res) => {
  const widgetId = req.body && req.body.widgetId;
  const defaults = widgets.getDefaultWidgetSettings();
  if (widgetId) {
    if (!widgets.WIDGET_SETTINGS_SCHEMA[widgetId]) {
      return res.status(400).json({ success: false, error: 'Неизвестный виджет или у него нет настроек' });
    }
    config.widgetSettings[widgetId] = defaults[widgetId];
  } else {
    config.widgetSettings = defaults;
  }
  widgetsPersistence.saveSettingsDebounced(config.widgetSettings);
  timeline.setWindowSec(config.widgetSettings.timeline.windowSec);
  broadcast();
  broadcastAdminStatus();
  res.json({ success: true, settings: config.widgetSettings });
});
  return {  };
}

function part2(ctx) {
  const { widgets, widgetsPersistence, config, app, broadcast } = ctx;
app.post('/api/layout', (req, res) => {
  const rawLayout = (req.body && req.body.layout) || {};
  config.layout = widgets.sanitizeLayout(rawLayout, config.layout);
  widgetsPersistence.saveLayoutDebounced(config.layout);
  broadcast(); // применяем на оверлее сразу же
  res.json({ success: true, layout: config.layout });
});

app.post('/api/layout/reset', (req, res) => {
  const id = req.body && req.body.id;
  if (id) {
    if (!widgets.DEFAULT_LAYOUT[id]) {
      return res.status(400).json({ success: false, error: 'Неизвестный виджет' });
    }
    config.layout[id] = { ...widgets.DEFAULT_LAYOUT[id] };
  } else {
    config.layout = widgets.getDefaultLayout();
  }
  widgetsPersistence.saveLayoutDebounced(config.layout);
  broadcast();
  res.json({ success: true, layout: config.layout });
});
  return {  };
}

module.exports = { main, part2 };
