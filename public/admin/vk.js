'use strict';
// Вкладка «ВКонтакте»: анонс на стену и в беседу, события в беседу.
(() => {
  const $ = (id) => document.getElementById(id);
  const sec = $('tab-vk'); if (!sec) return;
  let st = null, loaded = false;
  async function api(url, opt) {
    const r = await fetch(url, opt); let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok || !d || d.success === false) throw new Error((d && d.error) || 'Ошибка сервера (' + r.status + ')');
    return d;
  }
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const msg = (t, k) => { const m = $('vkMsg'); m.textContent = t || ''; m.className = 'form-message' + (k ? ' ' + k : ''); };
  const saved = (t) => { const el = $('vkSaved'); el.textContent = t; el.className = 'ui3-saved ok'; setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, 2000); };
  function draw() {
    if (!st) return;
    $('vkEnabled').checked = st.enabled; $('vkAnn').checked = st.announce; $('vkWall').checked = st.wall; $('vkPhoto').checked = st.photo !== false; $('vkPin').checked = !!st.pin;
    $('vkEvDon').checked = st.events.donation; $('vkEvRaid').checked = st.events.raid; $('vkEvSub').checked = st.events.sub; $('vkEvFol').checked = st.events.follow; $('vkEvEnd').checked = st.events.end;
    if (document.activeElement !== $('vkMin')) $('vkMin').value = st.minDonation;
    if (document.activeElement !== $('vkTpl')) $('vkTpl').value = st.template;
    if (document.activeElement !== $('vkGroup')) $('vkGroup').value = st.groupId || '';
    if (document.activeElement !== $('vkChat')) $('vkChat').value = st.chat || '';
    $('vkTok').value = ''; $('vkTok').placeholder = st.hasToken ? 'Ключ сохранён (' + st.tokenHint + '), оставь пустым, чтобы не менять' : 'ключ сообщества';
    $('vkLast').textContent = (st.lastSentAt ? 'Последняя отправка: ' + new Date(st.lastSentAt).toLocaleString('ru-RU') + '. ' : '') + (st.lastError ? 'Ошибка: ' + st.lastError : '');
  }
  async function load() { try { st = await api('/api/vk'); loaded = true; draw(); } catch (e) { msg('Не удалось загрузить: ' + e.message, 'error'); } }
  const form = () => ({
    enabled: $('vkEnabled').checked, announce: $('vkAnn').checked, wall: $('vkWall').checked, photo: $('vkPhoto').checked, pin: $('vkPin').checked, template: $('vkTpl').value, groupId: $('vkGroup').value, chat: $('vkChat').value, token: $('vkTok').value,
    events: { donation: $('vkEvDon').checked, raid: $('vkEvRaid').checked, sub: $('vkEvSub').checked, follow: $('vkEvFol').checked, end: $('vkEvEnd').checked },
    minDonation: Number($('vkMin').value) || 0,
  });
  async function save(quiet) { st = await post('/api/vk', form()); draw(); if (!quiet) saved('Сохранено'); }
  const safeSave = async () => { try { await save(); msg(''); } catch (e) { msg(e.message, 'error'); } };
  let t = null; const auto = () => { clearTimeout(t); t = setTimeout(safeSave, 700); };
  ['vkEnabled', 'vkAnn', 'vkWall', 'vkPhoto', 'vkPin', 'vkEvDon', 'vkEvRaid', 'vkEvSub', 'vkEvFol', 'vkEvEnd'].forEach((id) => $(id).addEventListener('change', safeSave));
  ['vkTpl', 'vkGroup', 'vkChat', 'vkMin'].forEach((id) => $(id).addEventListener('input', auto));
  $('vkTok').addEventListener('change', safeSave);
  $('vkCheck').addEventListener('click', async () => { msg('Проверяю…'); try { await save(true); const d = await post('/api/vk/check'); msg('Ключ принят, сообщество «' + d.name + '».', 'success'); } catch (e) { msg(e.message, 'error'); } });
  $('vkTest').addEventListener('click', async () => { msg('Отправляю…'); try { await save(true); const d = await post('/api/vk/test'); msg('Отправлено' + (d.live ? (d.photo ? ' со скриншотом стрима.' : '. Скриншот не приложился: проверь, что у ключа есть право «Фотографии».') : ' (стрим офлайн, поэтому без данных эфира и скриншота).'), 'success'); } catch (e) { msg(e.message, 'error'); } });
  $('vkTestEnd').addEventListener('click', async () => { msg('Отправляю…'); try { await save(true); await post('/api/vk/test', { end: true }); msg('Пример итога отправлен в беседу.', 'success'); } catch (e) { msg(e.message, 'error'); } });
  $('vkClearTok').addEventListener('click', async () => { if (!confirm('Удалить сохранённый ключ?')) return; try { st = await post('/api/vk', { clearToken: true }); draw(); msg('Ключ удалён.'); } catch (e) { msg(e.message, 'error'); } });
  document.querySelectorAll('.nav-item[data-tab="vk"]').forEach((n) => n.addEventListener('click', () => { if (!loaded) load(); }));
  new MutationObserver(() => { if (sec.classList.contains('active') && !loaded) load(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  if (sec.classList.contains('active')) load();
})();
