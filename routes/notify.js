// routes/notify.js — настройки и проверка уведомлений в углу рабочего стола.
function main(ctx) {
  const { notify, app } = ctx;
  app.get('/api/notify', (req, res) => res.json({ success: true, ...notify.state() }));
  app.post('/api/notify/settings', (req, res) => res.json({ success: true, ...notify.update(req.body) }));
  app.post('/api/notify/test', (req, res) => {
    notify.demo();
    res.json({ success: true, ...notify.state() });
  });
  return {};
}
module.exports = { main };
