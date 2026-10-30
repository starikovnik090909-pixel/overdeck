// routes/alerts.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { fs, path, app } = ctx;
app.get('/api/alert-sounds', (req, res) => {
  const dir = path.join(__dirname, 'public', 'alert-sounds');
  let manifest = [];
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch (e) { manifest = []; }
  const known = new Set(manifest.map((m) => m.file));
  let own = [];
  try { own = fs.readdirSync(dir).filter((f) => /\.(ogg|mp3|wav)$/i.test(f) && !known.has(f)).map((f) => ({ id: f, label: f.replace(/\.[^.]+$/, ''), group: 'Мои звуки', file: f })); } catch (e) { own = []; }
  res.json({ sounds: manifest.concat(own) });
});
  return {  };
}

function part2(ctx) {
  const { config, eventAlerts, withWall, avatarUrlFor, raidExtras, app } = ctx;
app.post('/api/event-alerts/:kind/card', async (req, res) => {
  const k = req.params.kind;
  if (!eventAlerts.KINDS.includes(k)) return res.status(404).json({ success: false, error: 'Неизвестное событие' });
  const body = { ...(req.body || {}) };
  if (k === 'follow' && config.eventAlerts.follow.style === 'badge') { body.avatar = await avatarUrlFor(config.channel); body.channel = config.channel; }
  if (k === 'raid' && body.avatar === undefined && config.eventAlerts.raid.style !== 'plain') Object.assign(body, await raidExtras(body, true));
  const built = eventAlerts.buildCard(k, withWall(k, body, false), config.eventAlerts[k], config.donationAlert);
  res.json({ success: !!built, card: built && built.card });
});
  return {  };
}

function part3(ctx) {
  const { config, followRegistry, app } = ctx;
app.get('/api/follow-wall', (req, res) => { res.json({ success: true, ...followRegistry.stats() }); });
app.post('/api/follow-wall/sync', async (req, res) => {
  const a = config.twitchAuth;
  if (!config.twitch.clientId || !a || !a.accessToken || !a.userId) return res.status(400).json({ success: false, error: 'Сначала войди через Twitch (вкладка «Подключения»).' });
  try {
    const r = await followRegistry.syncFrom(async (cursor) => {
      const qs = new URLSearchParams({ broadcaster_id: a.userId, first: '100' }); if (cursor) qs.set('after', cursor);
      const resp = await fetch('https://api.twitch.tv/helix/channels/followers?' + qs, { headers: { 'Client-ID': config.twitch.clientId, Authorization: 'Bearer ' + a.accessToken } });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) { const e = new Error(j.message || ('HTTP ' + resp.status)); e.status = resp.status; throw e; }
      return { items: (j.data || []).map((x) => ({ login: x.user_login, name: x.user_name, at: x.followed_at })), cursor: j.pagination && j.pagination.cursor, total: j.total };
    });
    res.json({ success: true, ...r, count: followRegistry.count() });
  } catch (e) {
    const hint = (e.status === 401 || e.status === 403) ? ' Похоже, токен выдан без права moderator:read:followers — войди через Twitch заново (вкладка «Подключения»).' : '';
    res.status(500).json({ success: false, error: 'Twitch отклонил запрос: ' + e.message + '.' + hint });
  }
});
  return {  };
}

function part4(ctx) {
  const { fs, path, express, config, nowPlaying, nowPlayingPayload, app } = ctx;
// данные от расширения браузера: что играет на открытых вкладках (video/audio на любом сайте)
app.post('/api/nowplaying/browser', express.json({ limit: '200kb' }), (req, res) => {
  try { nowPlaying.setBrowser(req.body || {}); res.json({ success: true, enabled: !!config.eventAlerts.nowplaying.enabled }); } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
// кнопка «Установить расширение» в админке: открывает страницу расширений браузера и папку с расширением (Windows). Магазин — если задан extensionStoreUrl в config.json.
app.get('/api/nowplaying/extension', (req, res) => { res.json({ success: true, dir: path.join(__dirname, 'browser-extension'), store: /^https:\/\//.test(String(config.nowplayingExtensionStoreUrl || '')) ? config.nowplayingExtensionStoreUrl : '' }); });
app.post('/api/nowplaying/extension/install', express.json({ limit: '5kb' }), (req, res) => {
  const dir = path.join(__dirname, 'browser-extension');
  const b = String((req.body && req.body.browser) || '');
  const BR = { chrome: ['chrome', 'chrome://extensions'], edge: ['msedge', 'edge://extensions'], yandex: [path.join(process.env.LOCALAPPDATA || '', 'Yandex', 'YandexBrowser', 'Application', 'browser.exe'), 'browser://extensions/'] };
  if (b === 'yandex' && process.platform === 'win32' && !require('fs').existsSync(BR.yandex[0])) BR.yandex[0] = 'browser';   // нестандартная установка: пробуем через PATH
  const store = String(config.nowplayingExtensionStoreUrl || '');
  if (/^https:\/\//.test(store)) return res.json({ success: true, store, dir });
  let opened = false;
  const what = String((req.body && req.body.what) || 'both');
  if (process.platform === 'win32') {
    if (what !== 'page') { try { require('child_process').spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { /* не критично */ } }
    if (what !== 'folder' && BR[b]) { try { require('child_process').spawn('cmd.exe', ['/c', 'start', '', BR[b][0], BR[b][1]], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); opened = true; } catch (e) { /* откроют сами */ } }
  }
  res.json({ success: true, dir, opened, page: BR[b] ? BR[b][1] : 'chrome://extensions' });
});
app.get('/api/nowplaying', (req, res) => { res.json({ success: true, ...nowPlayingPayload() }); });
app.get('/api/nowplaying/cover', (req, res) => {
  const c = nowPlaying.getCover(req.query.k);
  if (!c) return res.status(404).end();
  res.set('Content-Type', c.mime); res.set('Cache-Control', 'no-cache'); res.send(c.buf);
});
  return {  };
}

function part5(ctx) {
  const { fs, path, config, saveConfigToDisk, eventAlerts, applyNowPlayingConfig, app, ALERT_CUSTOM_DIR, CUSTOM_KINDS, customUploads } = ctx;
// ---------- REST API: алерты событий ----------
app.get('/api/event-alerts', (req, res) => { res.json({ settings: config.eventAlerts, defaults: eventAlerts.DEFAULTS }); });
// Свои картинка/гифка и звук для алерта фоллоу (стандартный вид): те же файлы в uploads/alert-custom/
const removeEventCustomFile = (ev, kind) => {
  const old = config.eventAlerts[ev][CUSTOM_KINDS[kind].key];
  if (old && /^[A-Za-z0-9_.\-]+$/.test(old)) fs.unlink(path.join(ALERT_CUSTOM_DIR, old), () => {});
};
app.post('/api/event-alerts/:ev(follow|sub)/custom/:kind', (req, res) => {
  const ev = req.params.ev, k = CUSTOM_KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, error: 'Неизвестный тип файла' });
  customUploads[req.params.kind](req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ success: false, error: k.err });
    removeEventCustomFile(ev, req.params.kind);
    config.eventAlerts[ev] = eventAlerts.sanitizeKind(ev, { [k.key]: req.file.filename }, config.eventAlerts[ev]);
    saveConfigToDisk();
    res.json({ success: true, settings: config.eventAlerts[ev] });
  });
});
app.delete('/api/event-alerts/:ev(follow|sub)/custom/:kind', (req, res) => {
  const ev = req.params.ev, k = CUSTOM_KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, error: 'Неизвестный тип файла' });
  removeEventCustomFile(ev, req.params.kind);
  config.eventAlerts[ev] = eventAlerts.sanitizeKind(ev, { [k.key]: '' }, config.eventAlerts[ev]);
  saveConfigToDisk();
  res.json({ success: true, settings: config.eventAlerts[ev] });
});
app.post('/api/event-alerts/:kind', (req, res) => {
  const k = req.params.kind;
  if (!eventAlerts.KINDS.includes(k)) return res.status(404).json({ success: false, error: 'Неизвестное событие' });
  config.eventAlerts[k] = eventAlerts.sanitizeKind(k, req.body || {}, config.eventAlerts[k]);
  saveConfigToDisk();
  if (k === 'nowplaying') applyNowPlayingConfig();
  res.json({ success: true, settings: config.eventAlerts[k] });
});
app.post('/api/event-alerts/:kind/reset', (req, res) => {
  const k = req.params.kind;
  if (!eventAlerts.KINDS.includes(k)) return res.status(404).json({ success: false, error: 'Неизвестное событие' });
  config.eventAlerts[k] = eventAlerts.sanitizeKind(k, {}, null);
  saveConfigToDisk();
  if (k === 'nowplaying') applyNowPlayingConfig();
  res.json({ success: true, settings: config.eventAlerts[k] });
});
  return {  };
}

function part6(ctx) {
  const { currency, config, saveConfigToDisk, donationAlert, fireDonationAlert, app, CUSTOM_KINDS, customUploads, removeCustomFile } = ctx;
app.post('/api/donation-alert/custom/:kind', (req, res) => {
  const k = CUSTOM_KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, error: 'Неизвестный тип файла' });
  customUploads[req.params.kind](req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ success: false, error: k.err });
    removeCustomFile(req.params.kind);
    config.donationAlert = donationAlert.sanitize({ [k.key]: req.file.filename }, config.donationAlert);
    saveConfigToDisk();
    res.json({ success: true, settings: config.donationAlert });
  });
});
app.delete('/api/donation-alert/custom/:kind', (req, res) => {
  const k = CUSTOM_KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, error: 'Неизвестный тип файла' });
  removeCustomFile(req.params.kind);
  config.donationAlert = donationAlert.sanitize({ [k.key]: '' }, config.donationAlert);
  saveConfigToDisk();
  res.json({ success: true, settings: config.donationAlert });
});
/** Тестовый алерт: в историю донатов и в «Топ донатеров» не попадает. */
app.post('/api/donation-alert/card', (req, res) => {   // карточка по сохранённым настройкам — для предпросмотра на странице «Ссылки для OBS»
  const s = config.donationAlert;
  const rec = { username: 'Тестовый зритель', amount: 1500, currency: 'RUB', message: 'Привет! Держи на новый микрофон', platform: 'donationalerts' };
  res.json({ success: true, card: donationAlert.buildCard(rec, s, { rub: 1500, stat: s.donorStat !== false ? 'Донат №3 · всего 1 500 ₽' : '', no: 3 }) });
});
app.post('/api/donation-alert/test', (req, res) => {
  const b = req.body || {};
  fireDonationAlert({ username: String(b.username || 'Тестовый зритель').slice(0, 40), amount: Number(b.amount) > 0 ? Number(b.amount) : 500, currency: String(b.currency || 'RUB'), message: String(b.message == null ? 'Привет, как дела, чем занимаешься, держи деньги на трусы новые, всем удачи!' : b.message), platform: (b.platform === 'donatex' || b.platform === 'donatepay') ? b.platform : 'donationalerts' }, true);
  res.json({ success: true });
});
  return {  };
}

function part7(ctx) {
  const { config, saveConfigToDisk, donationAlert, app, alertTexUpload, removeAlertTexture } = ctx;
app.post('/api/donation-alert/texture', alertTexUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Нужна картинка JPG, PNG, WEBP или GIF до 10 МБ.' });
  removeAlertTexture();
  config.donationAlert = donationAlert.sanitize({ texture: req.file.filename }, config.donationAlert);
  saveConfigToDisk();
  res.json({ success: true, settings: config.donationAlert });
});
app.delete('/api/donation-alert/texture', (req, res) => {
  removeAlertTexture();
  config.donationAlert = donationAlert.sanitize({ texture: '' }, config.donationAlert);
  saveConfigToDisk();
  res.json({ success: true, settings: config.donationAlert });
});
  return {  };
}

module.exports = { main, part2, part3, part4, part5, part6, part7 };
