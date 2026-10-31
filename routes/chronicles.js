// routes/chronicles.js — маршруты, вынесенные из server.js без изменения логики.
// Зависимости приходят из server.js через ctx.

function main(ctx) {
  const { fs, path, http, chronicles, polls, chatBot, telegramAnnounce, chrPublish, app, chroniclesUpload, getPollCredentials, pollErrorMessage } = ctx;
app.get('/api/chronicles/publish', (req, res) => res.json({ success: true, ...chrPublish.status() }));
app.post('/api/chronicles/publish/login', async (req, res) => {
  try { res.json({ success: true, ...(await chrPublish.startLogin(req.body && req.body.clientId)), ...chrPublish.status() }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/chronicles/publish/now', async (req, res) => {
  try { await chrPublish.publish(true); res.json({ success: true, ...chrPublish.status() }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.post('/api/chronicles/publish/auto', (req, res) => { chrPublish.setAuto(!!(req.body && req.body.auto)); res.json({ success: true, ...chrPublish.status() }); });
app.post('/api/chronicles/publish/name', (req, res) => { chrPublish.setName(req.body && req.body.name); chrPublish.publish(true).catch(() => {}); res.json({ success: true, ...chrPublish.status() }); });
app.delete('/api/chronicles/publish', (req, res) => { chrPublish.disconnect(); res.json({ success: true, ...chrPublish.status() }); });
app.get('/api/chronicles', (req, res) => res.json({ items: chronicles.list(), sources: chronicles.sourcesInfo() }));
app.post('/api/chronicles', (req, res) => {
  const r = chronicles.save(req.body || {});
  if (!r.ok) return res.status(400).json({ success: false, error: r.error });
  if (!(req.body && req.body.id)) telegramAnnounce.scheduleChronicle(r.item.id); // новая запись → карточка в Телеграм (если включено)
  res.json({ success: true, item: r.item });
});
// Голосование чата «Оценка чата» для записи из «Хроник»: опрос Twitch с вариантами 1-2, 3-4, 5-6, 7-8, 9-10.
// Итог (среднее по серединам диапазонов, округлённое до 0,5) пишется в оценку чата. Нужен вход через Twitch с правом channel:manage:polls (как у опросов во вкладке «Чат»).
const CHR_BINS = ['1-2', '3-4', '5-6', '7-8', '9-10'];
const CHR_MID = [1.5, 3.5, 5.5, 7.5, 9.5];
const CHR_POLL_SECONDS = 60;
let chrPoll = null; // { id, itemId, title, short, seconds, endsAt, poll, timer, busy, cancelled }
function chrPollSummary(p) {
  const dist = CHR_BINS.map((_, i) => ((p && p.choices && p.choices[i] && p.choices[i].votes) || 0));
  const count = dist.reduce((s2, n) => s2 + n, 0);
  const avg = count ? Math.round(dist.reduce((s2, n, i) => s2 + n * CHR_MID[i], 0) / count * 10) / 10 : null;
  return { count, avg, rating: avg == null ? null : Math.round(avg * 2) / 2, dist };
}
function chrPollStatus() {
  if (!chrPoll) return { active: false };
  return { active: true, id: chrPoll.itemId, title: chrPoll.title, seconds: chrPoll.seconds, endsAt: chrPoll.endsAt, left: Math.max(0, Math.round((chrPoll.endsAt - Date.now()) / 1000)), ...chrPollSummary(chrPoll.poll) };
}
function chrPollFinish(p) {
  const cp = chrPoll; if (!cp) return null;
  clearInterval(cp.timer); chrPoll = null;
  if (cp.cancelled) return null;
  const r = chrPollSummary(p || cp.poll);
  if (!r.count) { chatBot.say(`Оценка чата для «${cp.short}»: никто не проголосовал.`).catch(() => {}); return r; }
  chronicles.save({ id: cp.itemId, chatRating: r.rating });
  chatBot.say(`Оценка чата для «${cp.short}»: около ${String(r.avg).replace('.', ',')} из 10 (голосов: ${r.count}). Спасибо!`).catch(() => {});
  return r;
}
async function chrPollTick() {
  const cp = chrPoll; if (!cp || cp.busy) return;
  cp.busy = true;
  try {
    const creds = getPollCredentials();
    if (creds.ok) {
      const p = (await polls.getPolls(creds)).find((x) => x.id === cp.id);
      if (p) { cp.poll = p; if (p.status !== 'ACTIVE') chrPollFinish(p); }
      else if (Date.now() > cp.endsAt + 15000) chrPollFinish(null);
    }
  } catch (e) { /* сеть моргнула — следующий тик */ }
  cp.busy = false;
}
app.get('/api/chronicles/vote', (req, res) => res.json({ success: true, vote: chrPollStatus() }));
app.post('/api/chronicles/vote/stop', async (req, res) => {
  if (!chrPoll) return res.json({ success: true, result: null });
  const cancel = !!(req.body || {}).cancel;
  const cp = chrPoll;
  const creds = getPollCredentials();
  try {
    if (creds.ok) {
      const p = await polls.endPoll({ ...creds, pollId: cp.id, status: cancel ? 'ARCHIVED' : 'TERMINATED' });
      if (cancel) cp.cancelled = true;
      const r = chrPollFinish(cancel ? null : (p || cp.poll));
      return res.json({ success: true, result: r });
    }
  } catch (e) { return res.status(502).json({ success: false, error: pollErrorMessage(e) }); }
  cp.cancelled = cancel; const r = chrPollFinish(cancel ? null : cp.poll);
  res.json({ success: true, result: r });
});
app.post('/api/chronicles/:id/vote', async (req, res) => {
  const it = chronicles.list().find((x) => x.id === req.params.id);
  if (!it) return res.status(404).json({ success: false, error: 'Запись не найдена.' });
  if (chrPoll) return res.status(400).json({ success: false, error: `Голосование уже идёт: «${chrPoll.title}».` });
  const creds = getPollCredentials();
  if (!creds.ok) return res.status(400).json({ success: false, error: creds.error });
  const short = it.title.length > 30 ? it.title.slice(0, 29) + '…' : it.title;
  try {
    const poll = await polls.createPoll({ ...creds, title: 'Оценка чата', choices: CHR_BINS, durationSeconds: CHR_POLL_SECONDS });
    chrPoll = { id: poll.id, itemId: it.id, title: it.title, short, seconds: CHR_POLL_SECONDS, endsAt: Date.now() + CHR_POLL_SECONDS * 1000, poll, timer: null, busy: false, cancelled: false };
    chrPoll.timer = setInterval(chrPollTick, 3000);
    res.json({ success: true, vote: chrPollStatus() });
  } catch (e) { res.status(502).json({ success: false, error: pollErrorMessage(e) }); }
});
app.post('/api/chronicles/:id/poster', (req, res) => {
  chroniclesUpload.single('poster')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'Нужна картинка PNG, JPG или WebP до 8 МБ.' });
    const item = chronicles.setPoster(req.params.id, req.file.filename);
    if (!item) { try { fs.unlinkSync(req.file.path); } catch (e) {} return res.status(404).json({ success: false, error: 'Запись не найдена.' }); }
    res.json({ success: true, item });
  });
});
// Постер по ссылке: скачиваем картинку на сервер (только http/https, не локальные адреса, до 8 МБ)
app.post('/api/chronicles/:id/poster-url', async (req, res) => {
  let name = '';
  try {
    name = await chronicles.downloadPoster((req.body || {}).url);
    const item = chronicles.setPoster(req.params.id, name);
    if (!item) { try { fs.unlinkSync(path.join(chronicles.POSTERS_DIR, name)); } catch (e) {} return res.status(404).json({ success: false, error: 'Запись не найдена.' }); }
    res.json({ success: true, item });
  } catch (e) {
    res.status(400).json({ success: false, error: e.name === 'TimeoutError' ? 'Не удалось скачать картинку: сайт долго отвечает.' : (e.message && !/fetch failed|Invalid URL/i.test(e.message) ? e.message : 'Не удалось скачать картинку: проверь ссылку.') });
  }
});
app.delete('/api/chronicles/:id', (req, res) => {
  if (!chronicles.remove(req.params.id)) return res.status(404).json({ success: false, error: 'Запись не найдена.' });
  res.json({ success: true });
});
  return {  };
}

function upload(ctx) {
  const { path, express, multer, chronicles, app } = ctx;
// ---------- Хроники: игры и фильмы ----------
app.use('/uploads/chronicles', express.static(chronicles.POSTERS_DIR));
const chroniclesUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, chronicles.POSTERS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => cb(null, ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase())),
  limits: { fileSize: 8 * 1024 * 1024 },
});
  return { chroniclesUpload };
}

function source(ctx) {
  const { express, chronicles, app } = ctx;
// ---------- Хроники: подключение таблицы (до общего express.json(): у файла свой лимит) ----------
const chrJson = express.json({ limit: '10mb' });
const chrFail = (res, e) => res.status(400).json({ success: false, error: (e && e.message) || 'Не удалось выполнить.' });
app.post('/api/chronicles/source/preview', chrJson, async (req, res) => {
  try {
    const b = req.body || {};
    const text = b.url ? await chronicles.fetchSheet(b.url) : String(b.text || '');
    const r = chronicles.previewTable(text);
    if (r.error) return res.status(400).json({ success: false, error: r.error });
    res.json({ success: true, ...r });
  } catch (e) { chrFail(res, e); }
});
app.post('/api/chronicles/source/import', chrJson, (req, res) => {
  const b = req.body || {};
  const r = chronicles.importPreviewed(b.token, b.type, b.mapping, b.reverse, b.remember ? String(b.url || '') : '');
  if (r.error) return res.status(400).json({ success: false, error: r.error });
  res.json({ success: true, ...r, sources: chronicles.sourcesInfo() });
});
app.post('/api/chronicles/source/sync', chrJson, async (req, res) => {
  try {
    const r = await chronicles.sync((req.body || {}).type);
    if (r.error) return res.status(400).json({ success: false, error: r.error });
    res.json({ success: true, ...r, sources: chronicles.sourcesInfo() });
  } catch (e) { chrFail(res, e); }
});
app.delete('/api/chronicles/source/:type', (req, res) => { chronicles.forgetSource(req.params.type); res.json({ success: true, sources: chronicles.sourcesInfo() }); });
  return {  };
}

module.exports = { main, upload, source };
