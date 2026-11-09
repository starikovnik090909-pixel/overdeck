'use strict';
// Вкладка «Discord»: вебхук (анонсы, события) и бот со слэш-командами.
(() => {
  const $ = (id) => document.getElementById(id);
  const sec = $('tab-discord'); if (!sec) return;
  let st = null, loaded = false;
  async function api(url, opt) {
    const r = await fetch(url, opt); let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok || !d || d.success === false) throw new Error((d && d.error) || 'Ошибка сервера (' + r.status + ')');
    return d;
  }
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const msg = (t, k) => { const m = $('dcMsg'); m.textContent = t || ''; m.className = 'form-message' + (k ? ' ' + k : ''); };
  const saved = (t) => { const el = $('dcSaved'); el.textContent = t; el.className = 'ui3-saved ok'; setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, 2000); };
  const BOT = { online: 'Бот в сети', connecting: 'Подключается…', error: 'Ошибка', off: '' };
  function draw() {
    if (!st) return;
    $('dcEnabled').checked = st.enabled; $('dcAnn').checked = st.announce;
    $('dcEvDon').checked = st.events.donation; $('dcEvRaid').checked = st.events.raid; $('dcEvSub').checked = st.events.sub; $('dcEvFol').checked = st.events.follow; $('dcEvEnd').checked = st.events.end;
    if (document.activeElement !== $('dcMin')) $('dcMin').value = st.minDonation;
    if (document.activeElement !== $('dcTpl')) $('dcTpl').value = st.template;
    if (document.activeElement !== $('dcName')) $('dcName').value = st.username || '';
    const role = /^\d+$/.test(st.mention);
    $('dcMention').value = role ? 'none' : st.mention;
    if (document.activeElement !== $('dcRole')) $('dcRole').value = role ? st.mention : '';
    $('dcHook').value = ''; $('dcHook').placeholder = st.hasWebhook ? 'Вебхук сохранён (' + st.webhookHint + '), оставь пустым, чтобы не менять' : 'https://discord.com/api/webhooks/…';
    $('dcTok').value = ''; $('dcTok').placeholder = st.hasToken ? 'Токен сохранён (' + st.tokenHint + '), оставь пустым, чтобы не менять' : 'токен из вкладки Bot';
    if (document.activeElement !== $('dcGuild')) $('dcGuild').value = st.guildId || '';
    $('dcBotOn').checked = st.botEnabled;
    const p = $('dcBotPill'), b = st.bot || {}; p.hidden = !st.botEnabled; p.textContent = (b.name ? b.name + ' · ' : '') + (BOT[b.status] || ''); p.classList.toggle('err', b.status === 'error');
    $('dcLast').textContent = (st.lastSentAt ? 'Последняя отправка: ' + new Date(st.lastSentAt).toLocaleString('ru-RU') + '. ' : '') + (st.lastError ? 'Ошибка: ' + st.lastError : '') + (b.error ? ' Бот: ' + b.error : '');
  }
  async function load() { try { st = await api('/api/discord'); loaded = true; draw(); } catch (e) { msg('Не удалось загрузить: ' + e.message, 'error'); } }
  const form = () => {
    const role = $('dcRole').value.trim();
    return { enabled: $('dcEnabled').checked, announce: $('dcAnn').checked, username: $('dcName').value, mention: role || $('dcMention').value, template: $('dcTpl').value,
      events: { donation: $('dcEvDon').checked, raid: $('dcEvRaid').checked, sub: $('dcEvSub').checked, follow: $('dcEvFol').checked, end: $('dcEvEnd').checked },
      minDonation: Number($('dcMin').value) || 0, webhookUrl: $('dcHook').value, botToken: $('dcTok').value, guildId: $('dcGuild').value, botEnabled: $('dcBotOn').checked };
  };
  async function save(quiet) { st = await post('/api/discord', form()); draw(); if (!quiet) saved('Сохранено'); }
  const safeSave = async () => { try { await save(); msg(''); } catch (e) { msg(e.message, 'error'); } };
  let t = null; const auto = () => { clearTimeout(t); t = setTimeout(safeSave, 700); };
  ['dcEnabled', 'dcAnn', 'dcEvDon', 'dcEvRaid', 'dcEvSub', 'dcEvFol', 'dcEvEnd', 'dcMention', 'dcBotOn'].forEach((id) => $(id).addEventListener('change', safeSave));
  ['dcTpl', 'dcName', 'dcRole', 'dcMin', 'dcGuild'].forEach((id) => $(id).addEventListener('input', auto));
  ['dcHook', 'dcTok'].forEach((id) => $(id).addEventListener('change', safeSave));
  $('dcTest').addEventListener('click', async () => { msg('Отправляю…'); try { await save(true); const d = await post('/api/discord/test'); msg('Отправлено' + (d.live ? '.' : ' (стрим офлайн, поэтому без данных эфира).'), 'success'); } catch (e) { msg(e.message, 'error'); } });
  $('dcTestEnd').addEventListener('click', async () => { msg('Отправляю…'); try { await save(true); await post('/api/discord/test', { end: true }); msg('Пример итога отправлен.', 'success'); } catch (e) { msg(e.message, 'error'); } });
  $('dcCheck').addEventListener('click', async () => {
    msg('Проверяю…');
    try { await save(true); const d = await post('/api/discord/check'); $('dcInvite').href = d.inviteUrl; $('dcInvite').hidden = false; msg('Токен принят, приложение «' + d.name + '». Нажми «Добавить бота на сервер», затем включи бота.', 'success'); }
    catch (e) { msg(e.message, 'error'); }
  });
  $('dcClearHook').addEventListener('click', async () => { if (!confirm('Удалить сохранённый вебхук?')) return; try { st = await post('/api/discord', { clearWebhook: true }); draw(); msg('Вебхук удалён.'); } catch (e) { msg(e.message, 'error'); } });
  $('dcClearTok').addEventListener('click', async () => { if (!confirm('Удалить сохранённый токен бота?')) return; try { st = await post('/api/discord', { clearToken: true }); draw(); $('dcInvite').hidden = true; msg('Токен удалён.'); } catch (e) { msg(e.message, 'error'); } });
  setInterval(() => { if (sec.classList.contains('active') && loaded && !document.hidden) api('/api/discord').then((d) => { st = d; if (!sec.contains(document.activeElement) || document.activeElement.tagName === 'BODY') draw(); else { const p = $('dcBotPill'), b = d.bot || {}; p.textContent = (b.name ? b.name + ' · ' : '') + (BOT[b.status] || ''); } }).catch(() => {}); }, 5000);
  document.querySelectorAll('.nav-item[data-tab="discord"]').forEach((n) => n.addEventListener('click', () => { if (!loaded) load(); }));
  new MutationObserver(() => { if (sec.classList.contains('active') && !loaded) load(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  if (sec.classList.contains('active')) load();
})();
