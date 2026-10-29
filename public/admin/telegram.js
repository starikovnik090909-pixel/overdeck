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
    $('tgOwn').hidden = relay;
    $('tgMode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.mode));
    $('tgMode').hidden = false;
    const linked = st.relayLinked, own = st.mode === 'own';
    $('tgLinked').hidden = !(linked || (own && st.hasToken && st.chatId)); $('tgUnlink').hidden = !linked;
    $('tgChanName').textContent = own ? (st.chatId || 'Свой бот') : (linked ? (st.relayTitle || 'Канал') : 'Канал не привязан');
    $('tgChanSub').textContent = own ? 'через твоего бота' : (linked ? 'через бота Overdeck' : 'Добавь бота Overdeck в канал');
    $('tgRelay').hidden = own || linked;
    if (linked) $('tgCode').hidden = true;
  }
  const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const SAMPLE = { channel: 'starikov', title: 'Проходим Resident Evil 4 на максимальной сложности', game: 'Resident Evil 4', url: 'twitch.tv/starikov' };
  function renderPrev(t) {
    let h = esc(t).replace(/&lt;(\/?)(b|i|u|s|code|blockquote)&gt;/g, '<$1$2>').replace(/&lt;tg-spoiler&gt;/g, '<span class="sp">').replace(/&lt;\/tg-spoiler&gt;/g, '</span>');
    return h.replace(/\{(title|game|channel|url)\}/g, (m, k) => k === 'url' ? '<a>' + SAMPLE.url + '</a>' : esc(SAMPLE[k]));
  }
  function drawPrev() {
    const shot = $('tgScreen').checked, btn = $('tgButton').checked;
    $('tgPrev').innerHTML = '<div class="tg-msg">' + (shot ? '<div class="tg-shot"><i>LIVE</i><b>' + esc(SAMPLE.game) + '</b></div>' : '') + '<div class="tg-txt">' + renderPrev($('tgTpl').value) + '</div><div class="tg-meta">20:15</div></div>' + (btn ? '<span class="tg-btn">▶ Смотреть стрим</span>' : '');
    $('tgPresets').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === $('tgTpl').value));
  }
  function drawPresets() {
    $('tgPresets').innerHTML = (st.presets || []).map((p, i) => '<button type="button" data-t="' + esc(p.template) + '" title="' + esc(p.desc) + '">' + esc(p.name) + '</button>').join('');
    $('tgChips').innerHTML = ['{title}', '{game}', '{channel}', '{url}', '<b></b>', '<i></i>', '<blockquote></blockquote>', '<tg-spoiler></tg-spoiler>'].map((x) => '<button type="button" data-v="' + esc(x) + '">' + esc(x) + '</button>').join('');
  }
  function draw() {
    if (!st) return;
    drawMode();
    drawPresets();
    $('tgButton').checked = st.withButton; $('tgLive').checked = st.liveUpdate; $('tgEndPost').checked = st.endPost; $('tgEndShot').checked = st.endShot; $('tgChr').checked = st.chrPost;
    $('tgShotHint').textContent = st.browserFound ? 'Сделаем снимок страницы оверлея через установленный браузер' : 'На этом компьютере не найден Chrome или Edge: итог уйдёт без снимка'; $('tgOnCat').value = st.onCategory; $('tgAfter').value = st.afterEnd;
    $('tgEnabled').checked = st.enabled; $('tgScreen').checked = st.withScreen; $('tgChat').value = st.chatId || '';
    if (document.activeElement !== $('tgDelay')) { $('tgDelay').value = st.delaySec; $('tgDelayOut').textContent = st.delaySec + ' с'; }
    if (document.activeElement !== $('tgTpl')) $('tgTpl').value = st.template;
    $('tgToken').value = '';
    drawPrev();
    $('tgToken').placeholder = st.hasToken ? 'Токен сохранён (' + st.tokenHint + '), оставь пустым, чтобы не менять' : '123456:ABC-DEF…';
    $('tgLast').textContent = st.lastSentAt ? 'Последний анонс: ' + new Date(st.lastSentAt).toLocaleString('ru-RU') + '.' : '';
    if (st.lastError) $('tgLast').textContent += ' Ошибка: ' + st.lastError;
  }
  async function fillAddUrl() {
    if (st.mode !== 'relay' || st.relayLinked) return;
    try { const d = await post('/api/telegram/link/start'); $('tgAddBot').href = d.addUrl; } catch (e) { msg(e.message, 'error'); }
  }
  async function load() { try { st = await api('/api/telegram'); loaded = true; draw(); fillAddUrl(); } catch (e) { msg('Не удалось загрузить: ' + e.message, 'error'); } }
  const form = () => ({ mode: st ? st.mode : 'relay', token: $('tgToken').value, chatId: $('tgChat').value, enabled: $('tgEnabled').checked, withScreen: $('tgScreen').checked, delaySec: Number($('tgDelay').value) || 0, template: $('tgTpl').value, withButton: $('tgButton').checked, liveUpdate: $('tgLive').checked, endPost: $('tgEndPost').checked, endShot: $('tgEndShot').checked, chrPost: $('tgChr').checked, onCategory: $('tgOnCat').value, afterEnd: $('tgAfter').value });
  async function save(quiet) { st = await post('/api/telegram', form()); draw(); if (!quiet) saved('Сохранено'); }
  let asT = null;
  const auto = () => { clearTimeout(asT); asT = setTimeout(async () => { try { await save(); } catch (e) { msg(e.message, 'error'); } }, 600); };
  $('tgTpl').addEventListener('input', auto);
  $('tgDelay').addEventListener('input', () => { $('tgDelayOut').textContent = $('tgDelay').value + ' с'; auto(); });
  $('tgPresets').addEventListener('click', auto);
  $('tgChips').addEventListener('click', auto);
  $('tgReset').addEventListener('click', auto);
  $('tgChat').addEventListener('change', auto);
  $('tgEnabled').addEventListener('change', async () => { try { await save(); } catch (e) { msg(e.message, 'error'); } });
  $('tgScreen').addEventListener('change', async () => { drawPrev(); try { await save(); } catch (e) { msg(e.message, 'error'); } });
  ['tgButton', 'tgOnCat', 'tgAfter', 'tgLive', 'tgEndPost', 'tgEndShot', 'tgChr'].forEach((id) => $(id).addEventListener('change', async () => { drawPrev(); try { await save(); } catch (e) { msg(e.message, 'error'); } }));
  $('tgTpl').addEventListener('input', drawPrev);
  $('tgPresets').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (!b) return; $('tgTpl').value = b.dataset.t; drawPrev(); });
  $('tgChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; const t = $('tgTpl'), s0 = t.selectionStart; t.value = t.value.slice(0, s0) + b.dataset.v + t.value.slice(t.selectionEnd); t.focus(); drawPrev(); });
  document.addEventListener('click', (e) => { const sp = e.target.closest && e.target.closest('#tgPrev .sp'); if (sp) sp.classList.toggle('open'); });
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
  $('tgReset').addEventListener('click', () => { $('tgTpl').value = st ? st.defaultTemplate : ''; drawPrev(); });
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
  $('tgTestEnd').addEventListener('click', async () => {
    msg('Готовлю итог…');
    try { await save(true); const d = await post('/api/telegram/test', { end: true }); msg('Пример итога отправлен' + (d.kind === 'photo' ? ' со снимком сцены.' : ' без снимка.') + (d.live ? '' : ' (цифры выдуманные: стрим сейчас офлайн)'), 'success'); }
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
