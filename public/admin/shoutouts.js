/* Админка: вкладка «Отметки» в чат-боте — отметка рейдеров и их возвращений */
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$('soCard')) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const msg = (t, k) => { const m = $('soMsg'); m.textContent = t || ''; m.className = 'form-message' + (k ? ' ' + k : ''); };
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  }
  function fmt(t) { return t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function draw(st) {
    const s = st.settings;
    $('soEnabled').checked = s.enabled; $('soOnRaid').checked = s.onRaid; $('soOnReturn').checked = s.onReturn;
    if (document.activeElement !== $('soText')) $('soText').value = s.text;
    if (document.activeElement !== $('soCooldown')) $('soCooldown').value = s.cooldownHours;
    $('soCount').textContent = st.list.length ? '· ' + st.list.length : '';
    $('soBody').innerHTML = st.list.length
      ? st.list.map((e) => `<tr><td><b>${esc(e.name)}</b> <span class="card-hint">twitch.tv/${esc(e.login)}</span></td><td>${e.raids}</td><td>${fmt(e.lastShoutAt)}</td><td><button class="btn btn-ghost btn-sm" data-so-del="${esc(e.login)}" type="button">Убрать</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="card-hint">Пока никого. Первый рейд — и стример появится здесь.</td></tr>';
  }
  async function load() { try { draw(await (await fetch('/api/shoutouts')).json()); } catch (e) { msg('Не удалось загрузить.', 'error'); } }
  async function save() {
    const { ok, data } = await post('/api/shoutouts/settings', { enabled: $('soEnabled').checked, onRaid: $('soOnRaid').checked, onReturn: $('soOnReturn').checked, text: $('soText').value, cooldownHours: $('soCooldown').value });
    if (ok) { draw(data); msg('Сохранено.', 'success'); } else msg('Не удалось сохранить.', 'error');
  }
  ['soEnabled', 'soOnRaid', 'soOnReturn'].forEach((id) => $(id).addEventListener('change', save));
  $('soSave').addEventListener('click', save);
  $('soTest').addEventListener('click', async () => {
    await save();
    const { ok, data } = await post('/api/shoutouts/test', { login: $('soAddLogin').value || '' });
    msg(ok ? 'Отправлено в чат.' : (data.error || 'Не удалось отправить.'), ok ? 'success' : 'error');
  });
  $('soAdd').addEventListener('click', async () => {
    const { ok, data } = await post('/api/shoutouts/add', { login: $('soAddLogin').value });
    if (ok) { $('soAddLogin').value = ''; draw(data); msg('', ''); } else msg(data.error || 'Ошибка.', 'error');
  });
  $('soBody').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-so-del]'); if (!b) return;
    const { ok, data } = await post('/api/shoutouts/remove', { login: b.dataset.soDel }); if (ok) draw(data);
  });
  load();
})();
