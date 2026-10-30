// routes/fonts.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { customFonts, app, fontUpload, GOOGLE_FONT_WEIGHTS, broadcast } = ctx;
app.get('/api/fonts/weights', (req, res) => {
  const font = req.query.font || '';
  if (font === 'Beaufort for LOL') {
    const weights = customFonts.getAvailableWeights('beaufort');
    return res.json({ weights: weights.length ? weights : [{ weight: 400, label: 'Regular (файл ещё не загружен)' }] });
  }
  if (font === 'Spiegel') {
    const weights = customFonts.getAvailableWeights('spiegel');
    return res.json({ weights: weights.length ? weights : [{ weight: 400, label: 'Regular (файл ещё не загружен)' }] });
  }
  res.json({ weights: GOOGLE_FONT_WEIGHTS[font] || [{ weight: 400, label: 'Regular' }] });
});

// Генерируется на лету при каждом запросе (не кэшируется) — как только шрифты
// Riot появляются в fonts/, эта CSS подхватывает их без перезапуска сервера.
app.get('/api/fonts/riot.css', (req, res) => {
  res.type('text/css').send(customFonts.generateRiotFontFaceCss());
});

app.post('/api/fonts/upload', (req, res) => {
  fontUpload.array('fonts', 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить файлы.' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Не выбрано ни одного подходящего файла шрифта (.ttf, .otf, .woff, .woff2).',
      });
    }
    broadcast(); // оверлей сразу узнаёт о новых шрифтах через customFonts в снапшоте
    res.json({ success: true, fonts: customFonts.listFonts() });
  });
});
  return {  };
}

module.exports = { main };
