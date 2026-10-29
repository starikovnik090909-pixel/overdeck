'use strict';
// Вкладка «Телеграм»: настройка анонса стрима в Telegram-канал.
(() => {
  const $ = (id) => document.getElementById(id);
  const sec = $('tab-telegram'); if (!sec) return;
  let st = null, loaded = false;
  async function api(url, opt) {
    const r = await fetch(url, opt); let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok || !d || d.success === false) throw new Error((d && d.error) || 'Ошибка сервера (' + r.status + ')');
    return d;
  }
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const msg = (t, k) => { const m = $('tgMsg'); m.textContent = t || ''; m.className = 'form-message' + (k ? ' ' + k : ''); };
  const saved = (t) => { const el = $('tgSaved'); el.textContent = t; el.className = 'ui3-saved ok'; setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, 2000); };
  let poll = null;
  function drawMode() {
    const relay = st.mode === 'relay';
    $('tgRelay').hidden = !relay; $('tgOwn').hidden = relay;
    $('tgMode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.mode));
    $('tgMode').hidden = false;
    const linked = st.relayLinked;
    $('tgLinked').hidden = !linked; $('tgLinked').textContent = linked ? '✓ Канал привязан: ' + (st.relayTitle || '') : '';
    $('tgUnlink').hidden = !linked; $('tgLinkGo').hidden = linked; $('tgAddBot').hidden = linked;
    if (linked) $('tgCode').hidden = true;
  }
  function draw() {
    if (!st) return;
    drawMode();
    $('tgEnabled').checked = st.enabled; $('tgScreen').checked = st.withScreen; $('tgChat').value = st.chatId || '';
    $('tgDelay').value = st.delaySec; $('tgTpl').value = st.template; $('tgToken').value = '';
    $('tgToken').placeholder = st.hasToken ? 'Токен сохранён (' + st.tokenHint + '), оставь пустым, чтобы не менять' : '123456:ABC-DEF…';
    $('tgLast').textContent = st.lastSentAt ? 'Последний анонс: ' + new Date(st.lastSentAt).toLocaleString('ru-RU') + '.' : '';
    if (st.lastError) $('tgLast').textContent += ' Ошибка: ' + st.lastError;
  }
  async function fillAddUrl() {
    if (st.mode !== 'relay' || st.relayLinked) return;
    try { const d = await post('/api/telegram/link/start'); $('tgAddBot').href = d.addUrl; } catch (e) { msg(e.message, 'error'); }
  }
  async function load() { try { st = await api('/api/telegram'); loaded = true; draw(); fillAddUrl(); } catch (e) { msg('Не удалось загрузить: ' + e.message, 'error'); } }
  const form = () => ({ mode: st ? st.mode : 'relay', token: $('tgToken').value, chatId: $('tgChat').value, enabled: $('tgEnabled').checked, withScreen: $('tgScreen').checked, delaySec: Number($('tgDelay').value) || 0, template: $('tgTpl').value });
  async function save(quiet) { st = await post('/api/telegram', form()); draw(); if (!quiet) saved('Сохранено'); }
  $('tgSave').addEventListener('click', async () => { try { await save(); msg(''); } catch (e) { msg(e.message, 'error'); } });
  $('tgEnabled').addEventListener('change', async () => { try { await save(); } catch (e) { msg(e.message, 'error'); } });
  $('tgScreen').addEventListener('change', async () => { try { await save(); } catch (e) { msg(e.message, 'error'); } });
  $('tgMode').addEventListener('click', async (e) => { const b = e.target.closest('button'); if (!b) return; try { st = await post('/api/telegram', { mode: b.dataset.v }); draw(); msg(''); } catch (err) { msg(err.message, 'error'); } });
  async function linkPoll() {
    clearInterval(poll); let n = 0;
    poll = setInterval(async () => {
      if (++n > 100) { clearInterval(poll); msg('Не дождался кода. Нажми «Я добавил» и попробуй ещё раз.', 'error'); return; }
      try { const d = await post('/api/telegram/link/check'); if (d.linked) { clearInterval(poll); st = await api('/api/telegram'); draw(); msg('Канал «' + d.title + '» привязан. Включи «Анонсировать стримы» и отправь тестовый анонс.', 'success'); } }
      catch (err) { clearInterval(poll); msg(err.message, 'error'); }
    }, 3000);
  }
  $('tgLinkGo').addEventListener('click', async () => {
    msg('Готовлю код…');
    try {
      const d = await post('/api/telegram/link/start');
      $('tgAddBot').href = d.addUrl;
      $('tgCode').hidden = false; $('tgCode').innerHTML = 'Опубликуй в своём канале сообщение с этим кодом:<b>' + d.code + '</b>';
      msg('Жду код в канале… (бот @' + d.bot + ' должен быть в канале админом)'); linkPoll();
    } catch (err) { msg(err.message, 'error'); }
  });
  $('tgUnlink').addEventListener('click', async () => { try { st = await post('/api/telegram', { unlink: true }); draw(); msg('Канал отвязан.'); } catch (err) { msg(err.message, 'error'); } });
  $('tgReset').addEventListener('click', () => { $('tgTpl').value = st ? st.defaultTemplate : ''; });
  $('tgCheck').addEventListener('click', async () => {
    msg('Проверяю…');
    try { await save(true); const d = await post('/api/telegram/check'); msg('Всё в порядке: бот ' + d.bot + (d.chat ? ', канал «' + d.chat + '»' : '. Укажи канал.'), 'success'); }
    catch (e) { msg(e.message, 'error'); }
  });
  $('tgTest').addEventListener('click', async () => {
    msg('Отправляю…');
    try { await save(true); const d = await post('/api/telegram/test'); msg('Отправлено' + (d.live ? '' : ' (стрим офлайн, поэтому текст без данных эфира)') + (d.kind === 'photo' ? ', со скриншотом.' : '.'), 'success'); }
    catch (e) { msg(e.message, 'error'); }
  });
  $('tgClear').addEventListener('click', async () => {
    if (!confirm('Удалить сохранённый токен бота?')) return;
    try { st = await post('/api/telegram', { clearToken: true }); draw(); msg('Токен удалён.'); } catch (e) { msg(e.message, 'error'); }
  });
  document.querySelectorAll('.nav-item[data-tab="telegram"]').forEach((n) => n.addEventListener('click', () => { if (!loaded) load(); }));
  new MutationObserver(() => { if (sec.classList.contains('active') && !loaded) load(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  if (sec.classList.contains('active')) load();
})();
