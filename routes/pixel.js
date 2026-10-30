// routes/pixel.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { twitch, pixelHeroes, app, withAwards, broadcastPixelHeroes } = ctx;
app.get('/api/pixel-heroes/top', (req, res) => {
  const limit = parseInt(req.query && req.query.limit, 10);
  res.json({ success: true, top: pixelHeroes.getTop(Number.isFinite(limit) ? limit : 50).map(withAwards), rules: pixelHeroes.getRules() });
});

app.post('/api/pixel-heroes/settings', (req, res) => {
  const settings = pixelHeroes.setSettings(req.body);
  broadcastPixelHeroes();
  res.json({ success: true, settings, active: pixelHeroes.getActive() });
});

// Размер героев категории (в %, 25–300): применяется на оверлее на лету, в том числе к героям, уже стоящим на сцене.
app.post('/api/pixel-heroes/group-scale', (req, res) => {
  const b = req.body || {};
  if (!pixelHeroes.setGroupScale(b.group, b.percent)) return res.status(400).json({ success: false, error: 'Не удалось изменить размер: нет такой категории или значение не от 25 до 300 %.' });
  broadcastPixelHeroes();
  res.json({ success: true, groupScale: pixelHeroes.getGroupScales() });
});

// Размер одного героя (в %, 25–300): итоговый размер = категория × герой; применяется на оверлее на лету.
app.post('/api/pixel-heroes/hero-scale', (req, res) => {
  const b = req.body || {};
  if (!pixelHeroes.setHeroScale(b.id, b.percent)) return res.status(400).json({ success: false, error: 'Не удалось изменить размер: нет такого героя или значение не от 25 до 300 %.' });
  broadcastPixelHeroes();
  res.json({ success: true, heroScale: pixelHeroes.getHeroScales() });
});

// Ручные правки профиля игрока из админки: смена аватара (героя) и уровня. Уровень ставится целым 0–99, опыт — на начало этого уровня.
app.post('/api/pixel-heroes/profile/hero', (req, res) => {
  const b = req.body || {};
  const r = pixelHeroes.setProfileHero(b.login, b.hero);
  if (!r.ok) return res.status(400).json({ success: false, error: 'Не удалось сменить аватар: нет такого игрока или героя.' });
  if (r.changed) broadcastPixelHeroes();
  res.json({ success: true, profile: withAwards(pixelHeroes.getProfile(b.login)) });
});
app.post('/api/pixel-heroes/profile/level', (req, res) => {
  const b = req.body || {};
  if (!pixelHeroes.hasProfile(b.login) || !Number.isInteger(b.level) || b.level < 0 || b.level > 99) {
    return res.status(400).json({ success: false, error: 'Не удалось изменить уровень: нет такого игрока или уровень не целое число от 0 до 99.' });
  }
  pixelHeroes.setLevel(b.login, b.level);
  broadcastPixelHeroes(); // уровень изменился — подпись над героем (если игрок на сцене) обновится
  res.json({ success: true, profile: withAwards(pixelHeroes.getProfile(b.login)) });
});

// Цвета подписи над героем (ник и уровень «lvl N»).
app.post('/api/pixel-heroes/tag-style', (req, res) => {
  if (!pixelHeroes.setTagStyle(req.body)) return res.status(400).json({ success: false, error: 'Не удалось сохранить цвета: нужны цвета вида #rrggbb и режим ника «twitch» или «custom».' });
  broadcastPixelHeroes();
  res.json({ success: true, tag: pixelHeroes.getTagStyle() });
});

// Галочка героя «выдавать чаттерам»: влияет только на будущие выдачи, героев, уже стоящих на сцене, не трогает.
app.post('/api/pixel-heroes/pool', (req, res) => {
  const b = req.body || {};
  if (!pixelHeroes.setPool(b.id, b.enabled)) return res.status(400).json({ success: false, error: 'Не удалось изменить: нет такого героя или значение не «да/нет».' });
  res.json({ success: true, heroes: pixelHeroes.list() });
});

app.post('/api/pixel-heroes/hide', (req, res) => {
  if (!pixelHeroes.hide(req.body && req.body.id)) return res.status(404).json({ success: false, error: 'Такого героя нет.' });
  broadcastPixelHeroes();
  res.json({ success: true, active: pixelHeroes.getActive() });
});
  return {  };
}

function part2(ctx) {
  const { pixelHeroes, app, broadcastPixelHeroes } = ctx;
app.get('/api/pixel-heroes', (req, res) => {
  res.json({ success: true, heroes: pixelHeroes.list(), active: pixelHeroes.getActive(), settings: pixelHeroes.getSettings(), groupScale: pixelHeroes.getGroupScales(), heroScale: pixelHeroes.getHeroScales(), tag: pixelHeroes.getTagStyle(), behavior: pixelHeroes.getBehavior(), unlock: pixelHeroes.getUnlock(), chatters: pixelHeroes.getRoster() });
});

// Настройки поведения героев: режим (бродят всегда / порциями / стоят), число прогулок, отдых, шансы доп. анимаций; любая часть полей, недопустимое — 400 и ничего не меняется.
app.post('/api/pixel-heroes/behavior', (req, res) => {
  const b = pixelHeroes.setBehavior(req.body);
  if (!b) return res.status(400).json({ success: false, error: 'Не удалось сохранить поведение: проверь числа (прогулки 1–20, отдых 1–600 с, паузы 0–60 с, шансы 0–100 %), «от» не больше «до».' });
  broadcastPixelHeroes();
  res.json({ success: true, behavior: b });
});

app.post('/api/pixel-heroes/show', (req, res) => {
  if (!pixelHeroes.show(req.body && req.body.id)) return res.status(404).json({ success: false, error: 'Такого героя нет.' });
  broadcastPixelHeroes();
  res.json({ success: true, active: pixelHeroes.getActive() });
});
  return {  };
}

function part3(ctx) {
  const { pixelHeroes, chatBot, app, unlockAvatarFor } = ctx;
// Разблокировка аватаров за баллы канала: замок (менять можно только на открытые), название награды, текст сообщения бота.
app.post('/api/pixel-heroes/unlock-settings', (req, res) => {
  const u = pixelHeroes.setUnlock(req.body);
  if (!u) return res.status(400).json({ success: false, error: 'Не удалось сохранить: название награды — до 60 символов, текст сообщения — от 1 до 300 символов, замок — да/нет.' });
  res.json({ success: true, unlock: u });
});

// Выдать аватар вручную (проверка награды или подарок): { login } — ник зрителя; открывает случайный закрытый аватар, бот пишет об этом в чат (если подключён).
app.post('/api/pixel-heroes/unlock', (req, res) => {
  const login = String((req.body && req.body.login) || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,40}$/.test(login)) return res.status(400).json({ success: false, error: 'Нужен ник зрителя (латиница, цифры и «_», как логин на Twitch).' });
  const r = unlockAvatarFor(login, login);
  if (!r.ok && r.reason === 'none-left') return res.status(409).json({ success: false, error: 'У этого зрителя уже открыты все закрытые аватары.' });
  if (!r.ok && r.reason === 'no-closed') return res.status(409).json({ success: false, error: 'Закрытых аватаров нет: у всех героев стоит галочка «выдавать». Сними её у тех, кого хочешь отдавать только за награду.' });
  res.json({ success: true, hero: r.hero, title: r.title, unlocked: r.unlocked, total: r.total, text: r.text, botConnected: chatBot.getPublic().status === 'connected' });
});
  return {  };
}

module.exports = { main, part2, part3 };
