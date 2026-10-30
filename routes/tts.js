// routes/tts.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { tts, config, saveConfigToDisk, app, broadcast, sendToOverlay } = ctx;
app.get('/api/tts', (req, res) => {
  res.json({ tts: config.tts, defaults: tts.getDefaultTts(), voices: tts.getVoices(), catalog: tts.getCatalog() });
});

app.post('/api/tts', (req, res) => {
  config.tts = tts.sanitizeTts(req.body || {}, config.tts);
  saveConfigToDisk();
  broadcast(); // настройки едут в общем снапшоте оверлея
  res.json({ success: true, tts: config.tts });
});

app.post('/api/tts/reset', (req, res) => {
  config.tts = tts.getDefaultTts();
  saveConfigToDisk();
  broadcast();
  res.json({ success: true, tts: config.tts });
});

app.get('/api/tts/catalog', (req, res) => { res.json({ voices: tts.getVoices(), catalog: tts.getCatalog() }); });
app.post('/api/tts/voices/install', (req, res) => { res.json(tts.installVoice(String((req.body || {}).id || ''))); });
/** Прослушать голос: короткая фраза, синтез тем же Piper; звук возвращается в админку и играет там. */
app.post('/api/tts/preview', async (req, res) => {
  const b = req.body || {};
  const voice = String(b.voice || config.tts.voice);
  if (!/^[A-Za-z0-9_.:\-]{1,80}$/.test(voice)) return res.status(400).json({ success: false, error: 'bad voice' });
  try {
    const r = await tts.synthesize(String(b.text || 'Привет! Это проверка голоса. Спасибо за донат!').slice(0, 200), { ...config.tts, voice });
    res.json({ success: true, audio: `data:${r.mime};base64,` + r.buffer.toString('base64') });
  } catch (e) {
    res.json({ success: false, error: voice.startsWith('edge:') ? 'Не удалось озвучить через Edge: ' + String(e.message || e).slice(0, 160) : voice.startsWith('silero:') ? 'Silero: ' + String(e.message || e).slice(0, 200) : 'Не удалось озвучить: голос не установлен или не найден Piper' });
  }
});
app.post('/api/tts/stop', (req, res) => {
  tts.clearQueue();
  sendToOverlay({ type: 'tts_stop' });
  res.json({ success: true });
});
  return {  };
}

module.exports = { main };
