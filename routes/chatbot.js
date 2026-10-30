// routes/chatbot.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { chatBot, app } = ctx;
// Написать в чат от имени бота (поле ввода в доке чата для OBS и в админке)
app.post('/api/chat-bot/say', async (req, res) => {
  const text = String((req.body && req.body.text) || '').replace(/\s+/g, ' ').trim().slice(0, 450);
  if (!text) return res.status(400).json({ success: false, error: 'Пустое сообщение.' });
  try {
    const ok = await chatBot.say(text);
    if (!ok) return res.status(409).json({ success: false, error: 'Бот не подключён к чату. Подключи его на вкладке «Чат-бот».' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'Не удалось отправить: ' + (e && e.message || 'ошибка') }); }
});

app.post('/api/chat-bot/disconnect', (req, res) => {
  chatBot.disconnect();
  res.json({ success: true, chatBot: chatBot.getPublic() });
});
  return {  };
}

function part2(ctx) {
  const { autoMod, app } = ctx;
app.get('/api/automod', (req, res) => {
  res.json(autoMod.getState());
});

app.get('/api/automod/defaults', (req, res) => {
  res.json({ words: autoMod.getDefaults() });
});

app.post('/api/automod', (req, res) => {
  const { words, enabled } = req.body || {};
  const result = autoMod.save({ words, enabled });
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, wordCount: result.wordCount, enabled: autoMod.isEnabled() });
});
  return {  };
}

function part3(ctx) {
  const { chatBot, botTimers, app, botTimersPayload } = ctx;
app.get('/api/bot-timers', (req, res) => {
  res.json(botTimersPayload());
});

app.post('/api/bot-timers/settings', (req, res) => {
  botTimers.setSettings(req.body || {});
  chatBot.syncTimers();
  res.json({ success: true, ...botTimersPayload() });
});

app.post('/api/bot-timers', (req, res) => {
  const { text, intervalMinutes, enabled } = req.body || {};
  const result = botTimers.add(text, intervalMinutes, enabled);
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  chatBot.syncTimers();
  res.json({ success: true, ...botTimersPayload(), item: result.item });
});

app.post('/api/bot-timers/:id/update', (req, res) => {
  const { text, intervalMinutes, enabled } = req.body || {};
  const result = botTimers.update(req.params.id, text, intervalMinutes, enabled);
  if (!result.ok) return res.status(result.error === 'Сообщение не найдено.' ? 404 : 400).json({ success: false, error: result.error });
  chatBot.syncTimers();
  res.json({ success: true, ...botTimersPayload(), item: result.item });
});

app.post('/api/bot-timers/:id/delete', (req, res) => {
  const result = botTimers.remove(req.params.id);
  if (!result.ok) return res.status(404).json({ success: false, error: result.error });
  chatBot.syncTimers();
  res.json({ success: true, ...botTimersPayload() });
});
  return {  };
}

function part4(ctx) {
  const { avatarCommands, app } = ctx;
app.post('/api/avatar-commands', (req, res) => {
  const b = req.body || {};
  if ('enabled' in b && !avatarCommands.setEnabled(b.enabled)) return res.status(400).json({ success: false, error: 'Включено или нет — нужно да/нет.' });
  if ('commands' in b) {
    const r = avatarCommands.setCommands(b.commands);
    if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  }
  res.json({ success: true, ...avatarCommands.getState() });
});

app.post('/api/avatar-commands/reset', (req, res) => {
  res.json({ success: true, ...avatarCommands.reset() });
});
  return {  };
}

function part5(ctx) {
  const { botCommands, app } = ctx;
app.get('/api/bot-commands', (req, res) => {
  res.json({ commands: botCommands.list() });
});

app.post('/api/bot-commands', (req, res) => {
  const { command, response } = req.body || {};
  const result = botCommands.add(command, response);
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, commands: botCommands.list(), item: result.item });
});

app.post('/api/bot-commands/:id/update', (req, res) => {
  const { command, response } = req.body || {};
  const result = botCommands.update(req.params.id, command, response);
  if (!result.ok) return res.status(result.error === 'Команда не найдена.' ? 404 : 400).json({ success: false, error: result.error });
  res.json({ success: true, commands: botCommands.list(), item: result.item });
});

app.post('/api/bot-commands/:id/delete', (req, res) => {
  const result = botCommands.remove(req.params.id);
  if (!result.ok) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true, commands: botCommands.list() });
});
  return {  };
}

function part6(ctx) {
  const { chatBot, app } = ctx;
app.get('/api/chat-bot', (req, res) => {
  res.json({ chatBot: chatBot.getPublic() });
});

app.post('/api/chat-bot/save', (req, res) => {
  const result = chatBot.save(req.body || {});
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, chatBot: chatBot.getPublic() });
});

app.post('/api/chat-bot/connect', async (req, res) => {
  const result = await chatBot.connect();
  // Проверка токена/полей — синхронная часть; сама подписка на чат подтвердится чуть позже (статус connecting → connected), админка его опрашивает.
  res.status(result.ok ? 200 : 400).json({ success: result.ok, error: result.error, chatBot: chatBot.getPublic() });
});
  return {  };
}

module.exports = { main, part2, part3, part4, part5, part6 };
