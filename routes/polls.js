// routes/polls.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { polls, app, getPollCredentials, pollErrorMessage } = ctx;
app.get('/api/polls/active', async (req, res) => {
  const creds = getPollCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });
  try {
    const { active, last } = await polls.getActiveAndLast(creds);
    res.json({ success: true, poll: active, lastPoll: last });
  } catch (e) {
    res.status(502).json({ success: false, error: pollErrorMessage(e) });
  }
});
  return {  };
}

function part2(ctx) {
  const { polls, app, getPollCredentials, pollErrorMessage } = ctx;
app.post('/api/polls/create', async (req, res) => {
  const { title, choices, durationSeconds } = req.body || {};
  const errors = polls.validateCreateInput({ title, choices, durationSeconds });
  if (errors.length) return res.status(400).json({ success: false, error: errors.join(' ') });

  const creds = getPollCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });

  try {
    const poll = await polls.createPoll({ ...creds, title, choices, durationSeconds });
    res.json({ success: true, poll });
  } catch (e) {
    res.status(502).json({ success: false, error: pollErrorMessage(e) });
  }
});
  return {  };
}

function part3(ctx) {
  const { predictions, app, getPredictionCredentials } = ctx;
app.get('/api/predictions/active', async (req, res) => {
  const creds = getPredictionCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });

  try {
    const prediction = await predictions.getActivePrediction(creds);
    res.json({ success: true, prediction });
  } catch (e) {
    res.status(502).json({ success: false, error: `Twitch отклонил запрос: ${e.message}` });
  }
});
  return {  };
}

function part4(ctx) {
  const { predictions, app, getPredictionCredentials } = ctx;
app.get('/api/predictions/templates', (req, res) => {
  res.json({ templates: predictions.listTemplates() });
});

app.post('/api/predictions/templates/delete', (req, res) => {
  const removed = predictions.deleteTemplate(req.body && req.body.id);
  res.json({ success: removed });
});

app.post('/api/predictions/create', async (req, res) => {
  const { title, option1, option2, windowSeconds } = req.body || {};
  const errors = predictions.validateCreateInput({ title, option1, option2, windowSeconds });
  if (errors.length) return res.status(400).json({ success: false, error: errors.join(' ') });

  const creds = getPredictionCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });

  try {
    const prediction = await predictions.createPrediction({ ...creds, title, option1, option2, windowSeconds });
    predictions.saveAsTemplate(title, option1, option2); // "все созданные вопросы должны сохраняться" — сохраняем автоматически при успешном запуске
    res.json({ success: true, prediction });
  } catch (e) {
    res.status(502).json({ success: false, error: `Twitch отклонил запрос: ${e.message}` });
  }
});
  return {  };
}

module.exports = { main, part2, part3, part4 };
