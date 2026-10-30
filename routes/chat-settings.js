// routes/chat-settings.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { config, saveConfigToDisk, DEFAULT_CHAT_SETTINGS, app, broadcastChatSettings } = ctx;
app.get('/api/chat-settings', (req, res) => {
  res.json({ settings: config.chatSettings, defaults: DEFAULT_CHAT_SETTINGS });
});

app.post('/api/chat-settings', (req, res) => {
  const b = req.body || {};
  // Принимаем только известные поля и только булевы значения; остальное остаётся как было.
  config.chatSettings = Object.fromEntries(Object.keys(DEFAULT_CHAT_SETTINGS).map((k) => [k, (k === 'platformTagStyle' ? ['outline', 'icon'].includes(b[k]) : typeof b[k] === 'boolean') ? b[k] : config.chatSettings[k]]));
  saveConfigToDisk();
  broadcastChatSettings();
  res.json({ success: true, settings: config.chatSettings });
});
  return {  };
}

module.exports = { main };
