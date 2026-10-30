// routes/timer.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { timerData, app, broadcastTimerUpdate } = ctx;
app.get('/api/timer', (req, res) => {
  res.json({ state: timerData.get() });
});

app.post('/api/timer/save', (req, res) => {
  const state = timerData.updateText({ enabled: req.body && req.body.enabled, labelText: req.body && req.body.labelText });
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

app.post('/api/timer/settings', (req, res) => {
  const settings = timerData.updateSettings(req.body || {});
  broadcastTimerUpdate();
  res.json({ success: true, settings });
});

app.post('/api/timer/set', (req, res) => {
  const seconds = Number(req.body && req.body.seconds);
  if (!Number.isFinite(seconds) || seconds < timerData.DURATION_LIMITS[0]) {
    return res.status(400).json({ success: false, error: 'Укажи время больше 0.' });
  }
  const state = timerData.setDuration(seconds);
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

app.post('/api/timer/start', (req, res) => {
  const state = timerData.start();
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

app.post('/api/timer/pause', (req, res) => {
  const state = timerData.pause();
  broadcastTimerUpdate();
  res.json({ success: true, state });
});

app.post('/api/timer/reset', (req, res) => {
  const state = timerData.reset();
  broadcastTimerUpdate();
  res.json({ success: true, state });
});
  return {  };
}

module.exports = { main };
