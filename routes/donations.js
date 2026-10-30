// routes/donations.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { donations, donationCredentials, donationAlerts, app, broadcastAdminStatus } = ctx;
app.post('/api/donations/donationalerts/disconnect', (req, res) => {
  donationAlerts.disconnect();
  const da = donationCredentials.get().donationAlerts;
  da.connected = false;
  da.accessToken = null;
  da.socketToken = null;
  donationCredentials.save();
  broadcastAdminStatus();
  res.json({ success: true });
});
  return {  };
}

function part2(ctx) {
  const { donations, donationCredentials, authCredentials, donationAlerts, app } = ctx;
app.post('/api/donations/donationalerts/credentials', (req, res) => {
  const { clientId, clientSecret, remember } = req.body || {};
  const da = donationCredentials.get().donationAlerts;
  if (typeof clientId === 'string') da.clientId = clientId.trim();
  if (typeof clientSecret === 'string') da.clientSecret = clientSecret.trim();
  donationCredentials.save(); // сами ключи сюда уже не попадут (см. donationCredentials.js) — ниже отдельно
  authCredentials.setRemembered('donationAlerts', !!remember, { clientId: da.clientId, clientSecret: da.clientSecret });
  res.json({ success: true });
});
  return {  };
}

function part3(ctx) {
  const { donations, donationCredentials, authCredentials, currency, donateX, donatePay, handleDonatePayAuthError, app, broadcastAdminStatus, handleDonation } = ctx;
app.post('/api/donations/add-manual', (req, res) => {
  const { username, amount, currency, platform } = req.body || {};
  const cleanUsername = typeof username === 'string' ? username.trim() : '';
  const cleanAmount = Number(amount);
  if (!cleanUsername) {
    return res.status(400).json({ success: false, error: 'Укажи ник донатера' });
  }
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Сумма должна быть положительным числом' });
  }
  const cleanPlatform = (platform === 'donatex' || platform === 'donatepay') ? platform : 'donationalerts'; // на что похоже больше — то и берём по умолчанию
  handleDonation({
    platform: cleanPlatform,
    username: cleanUsername,
    amount: cleanAmount,
    currency: (typeof currency === 'string' && currency.trim()) || 'RUB',
    message: '(добавлено вручную)',
  });
  res.json({ success: true });
});

// ---------- Донатный хаб: DonateX (API-токен, без OAuth) ----------

app.post('/api/donations/donatex/connect', async (req, res) => {
  const apiToken = req.body && req.body.apiToken;
  const remember = req.body && req.body.remember;
  if (!apiToken) {
    return res.status(400).json({ success: false, error: 'Не указан API-токен DonateX' });
  }
  try {
    await donateX.connect(apiToken, handleDonation);
    donationCredentials.get().donateX = { apiToken, connected: true };
    donationCredentials.save(); // сам токен сюда уже не попадёт (см. donationCredentials.js) — ниже отдельно
    authCredentials.setRemembered('donateX', !!remember, { apiToken });
    broadcastAdminStatus();
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/donations/donatex/disconnect', (req, res) => {
  donateX.disconnect();
  donationCredentials.get().donateX.connected = false;
  donationCredentials.save();
  broadcastAdminStatus();
  res.json({ success: true });
});

// ---------- Донатный хаб: DonatePay (API-ключ, без OAuth; опрос транзакций) ----------

app.post('/api/donations/donatepay/connect', async (req, res) => {
  const apiKey = String((req.body && req.body.apiKey) || '').trim();
  const remember = req.body && req.body.remember;
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'Вставь API-ключ DonatePay' });
  }
  try {
    const user = await donatePay.connect(apiKey, handleDonation, handleDonatePayAuthError);
    donationCredentials.get().donatePay = { apiKey, connected: true };
    donationCredentials.save(); // сам ключ в этот файл не попадёт — см. donationCredentials.js
    authCredentials.setRemembered('donatePay', !!remember, { apiKey });
    broadcastAdminStatus();
    res.json({ success: true, userName: (user && user.userName) || '' });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/donations/donatepay/disconnect', (req, res) => {
  donatePay.disconnect();
  donationCredentials.get().donatePay.connected = false;
  donationCredentials.get().donatePay.apiKey = null;
  donationCredentials.save();
  broadcastAdminStatus();
  res.json({ success: true });
});
  return {  };
}

function part4(ctx) {
  const { donorLeaderboard, app, broadcast } = ctx;
app.post('/api/donortop/reset-session', (req, res) => {
  donorLeaderboard.resetSession();
  broadcast();
  res.json({ success: true });
});

app.get('/api/donortop/list', (req, res) => {
  res.json({
    session: donorLeaderboard.getTop('session', 50),
    allTime: donorLeaderboard.getTop('allTime', 50),
  });
});

app.post('/api/donortop/delete', (req, res) => {
  const { scope, username } = req.body || {};
  if (!username || (scope !== 'session' && scope !== 'allTime')) {
    return res.status(400).json({ success: false, error: 'Нужны username и scope ("session" или "allTime")' });
  }
  donorLeaderboard.deleteDonor(scope, username);
  broadcast();
  res.json({ success: true });
});

app.post('/api/donortop/clear-alltime', (req, res) => {
  donorLeaderboard.clearAllTime();
  broadcast();
  res.json({ success: true });
});
  return {  };
}

function part5(ctx) {
  const { donations, app } = ctx;
app.get('/api/donations/history', (req, res) => {
  res.json({ donations: donations.getHistory() });
});

app.post('/api/donations/reset', (req, res) => {
  donations.reset();
  res.json({ success: true });
});
  return {  };
}

function part6(ctx) {
  const { donations, donationCredentials, authCredentials, donateX, donatePay, donationAlerts, app } = ctx;
app.get('/api/donations/status', (req, res) => {
  const da = donationCredentials.get().donationAlerts;
  const dx = donationCredentials.get().donateX;
  res.json({
    donationAlerts: {
      connected: da.connected,
      userName: da.userName,
      hasCredentials: !!(da.clientId && da.clientSecret),
      clientId: da.clientId || '',
      remembered: authCredentials.isRemembered('donationAlerts'),
    },
    donateX: {
      connected: dx.connected,
      available: donateX.isAvailable(),
      remembered: authCredentials.isRemembered('donateX'),
    },
    donatePay: {
      connected: !!donationCredentials.get().donatePay.connected,
      userName: donatePay.info().userName || '',
      lastError: donatePay.info().lastError || '',
      remembered: authCredentials.isRemembered('donatePay'),
    },
  });
});
  return {  };
}

module.exports = { main, part2, part3, part4, part5, part6 };
