// routes/misc.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { twitchExt, config, app } = ctx;
app.get('/api/extension', (req, res) => {
  res.json({ success: true, config: twitchExt.getPublic(), status: twitchExt.getStatus(), preview: (({ snapshot, ...rest }) => rest)(twitchExt.preview()) });
});

app.get('/api/extension/snapshot', (req, res) => {
  res.json({ success: true, ...twitchExt.preview() });
});

app.post('/api/extension', (req, res) => {
  const r = twitchExt.update(req.body || {});
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, config: r.config, status: twitchExt.getStatus() });
});

/** «Отправить сейчас»: проверочная отправка снимка (даже если расширение выключено, но данные заданы) — чтобы сразу увидеть ошибку Twitch. */
app.post('/api/extension/send', async (req, res) => {
  const r = await twitchExt.tick(true);
  if (r.ok === false) return res.status(502).json({ success: false, error: r.error, status: twitchExt.getStatus() });
  res.json({ success: true, result: r, status: twitchExt.getStatus() });
});
  return {  };
}

function part2(ctx) {
  const { helpTexts, app } = ctx;
app.get('/api/help-texts', (req, res) => {
  res.json({ texts: helpTexts.getAll() });
});

app.post('/api/help-texts', (req, res) => {
  const { tabId, text } = req.body || {};
  if (!helpTexts.setText(tabId, text)) {
    return res.status(400).json({ success: false, error: 'Неизвестная вкладка' });
  }
  res.json({ success: true });
});
  return {  };
}

function part3(ctx) {
  const { tabLock, app } = ctx;
// Замок на личные вкладки админки (пароль хранится только в виде хеша, см. lock.js)
app.get('/api/lock/status', (req, res) => {
  res.json({ lockedTabs: tabLock.LOCKED_TABS, unlocked: tabLock.isValidToken(req.get('X-Lock-Token')) });
});
app.post('/api/lock/unlock', (req, res) => {
  const r = tabLock.verify((req.body || {}).password);
  if (!r.ok) return res.status(r.error.startsWith('Слишком') ? 429 : 401).json({ success: false, error: r.error });
  res.json({ success: true, token: r.token });
});
  return {  };
}

module.exports = { main, part2, part3 };
