// routes/fund.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { fundBoxData, app, broadcastFundBoxState, broadcastFundBoxEvents } = ctx;
app.post('/api/fundbox/save', (req, res) => {
  const { textTemplate, startDenomination, levelStep, coinValue, enabled } = req.body || {};
  const state = fundBoxData.updateText({ textTemplate, startDenomination, levelStep, coinValue, enabled });
  broadcastFundBoxState();
  res.json({ success: true, state });
});

app.post('/api/fundbox/settings', (req, res) => {
  const settings = fundBoxData.updateSettings(req.body || {});
  broadcastFundBoxState();
  res.json({ success: true, settings });
});

app.post('/api/fundbox/settings/reset', (req, res) => {
  const settings = fundBoxData.resetSettings();
  broadcastFundBoxState();
  res.json({ success: true, settings });
});

app.post('/api/fundbox/reset', (req, res) => {
  const state = fundBoxData.resetProgress();
  broadcastFundBoxState();
  res.json({ success: true, state });
});

app.post('/api/fundbox/test', (req, res) => {
  const events = fundBoxData.addDonationAmount(500);
  broadcastFundBoxEvents(events);
  res.json({ success: true, events });
});
  return {  };
}

function part2(ctx) {
  const { fundBoxData, app } = ctx;
app.get('/api/fundbox', (req, res) => {
  res.json({ state: fundBoxData.get(), denomination: fundBoxData.getCurrentDenomination(), boxSize: fundBoxData.getCurrentBoxSize() });
});

app.post('/api/fundbox/preview-size', (req, res) => {
  const { denomination, coinValue } = req.body || {};
  const boxSize = fundBoxData.computeBoxAndCoinSize(Number(denomination) || 1000, Number(coinValue) || 100);
  res.json({ boxSize });
});
  return {  };
}

function part3(ctx) {
  const { fundData, fundAlertData, app, enqueueFundAlert } = ctx;
app.get('/api/fund/alert/settings', (req, res) => {
  res.json({ alert: fundAlertData.get() });
});

app.post('/api/fund/alert/settings', (req, res) => {
  const settings = fundAlertData.updateSettings(req.body || {});
  res.json({ success: true, settings });
});

app.post('/api/fund/alert/settings/reset', (req, res) => {
  const settings = fundAlertData.resetSettings();
  res.json({ success: true, settings });
});

app.post('/api/fund/alert/test', (req, res) => {
  const text = fundAlertData.buildText('TestUser', 500, fundData.get().currency);
  enqueueFundAlert(text);
  res.json({ success: true, text });
});
  return {  };
}

function part4(ctx) {
  const { goalData, app, broadcastGoal } = ctx;
app.get('/api/goal', (req, res) => {
  res.json({ goal: goalData.get() });
});

// текст, цель, валюта, тумблеры, громкость, размер (сумму не трогает)
app.post('/api/goal/save', (req, res) => {
  const goal = goalData.update(req.body || {});
  broadcastGoal();
  res.json({ success: true, goal });
});

app.post('/api/goal/amount', (req, res) => {
  const n = Number((req.body || {}).amount);
  if (!Number.isFinite(n) || n < 0) return res.status(400).json({ success: false, error: 'Сумма должна быть числом от 0' });
  const goal = goalData.setAmount(n);
  broadcastGoal();
  res.json({ success: true, goal });
});

app.post('/api/goal/reset', (req, res) => {
  const goal = goalData.resetAmount();
  broadcastGoal();
  res.json({ success: true, goal });
});

// тест: оверлей локально проигрывает донат (+1 500) или финал и возвращается к настоящей сумме — ничего не сохраняется
app.post('/api/goal/test', (req, res) => {
  const kind = (req.body || {}).kind === 'finale' ? 'finale' : 'donation';
  broadcastGoal({ kind }, 'goal_test');
  res.json({ success: true, kind });
});
  return {  };
}

function part5(ctx) {
  const { fundData, currency, app, broadcastFundUpdate } = ctx;
app.get('/api/fund', (req, res) => {
  res.json({ fund: fundData.get() });
});

app.post('/api/fund/save', (req, res) => {
  const { title, currency } = req.body || {};
  const fund = fundData.updateText({ title, currency });
  broadcastFundUpdate();
  res.json({ success: true, fund });
});

app.post('/api/fund/amount', (req, res) => {
  const { amount } = req.body || {};
  const fund = fundData.setAmount(amount);
  broadcastFundUpdate();
  res.json({ success: true, fund });
});

app.post('/api/fund/reset', (req, res) => {
  const fund = fundData.resetAmount();
  broadcastFundUpdate();
  res.json({ success: true, fund });
});

app.post('/api/fund/settings', (req, res) => {
  const settings = fundData.updateSettings(req.body || {});
  broadcastFundUpdate();
  res.json({ success: true, settings });
});

app.post('/api/fund/settings/reset', (req, res) => {
  const settings = fundData.resetSettings();
  broadcastFundUpdate();
  res.json({ success: true, settings });
});
  return {  };
}

module.exports = { main, part2, part3, part4, part5 };
