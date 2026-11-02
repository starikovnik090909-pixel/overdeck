// music.js (админка) — вкладка «Заказ музыки»: очередь, кнопка показа клипа, положение рамки, правила.
(function () {
  'use strict';
  const sec = document.getElementById('tab-music');
  if (!sec) return;
  const $ = (s) => sec.querySelector(s);
  const $$ = (s) => [...sec.querySelectorAll(s)];
  const api = (p, o) => fetch(p, o).then((r) => r.json());
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const IC = (d) => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const IB = {
    eye: IC('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeoff: IC('<path d="M3 3l18 18M10.6 5.1A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    pause: IC('<path d="M8 5v14M16 5v14"/>'),
    play: IC('<path d="M7 4.5v15l12-7.5z"/>'),
    skip: IC('<path d="M5 5l10 7-10 7zM19 5v14"/>'),
    ban: IC('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
  };
  const fields = $$('[data-m]');
  var dragUid = 0;
  let st = null, t = 0;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s) => { s = Math.floor(s || 0); return s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : '0:00'; };

  const url = $('#muUrl'); url.value = location.origin + '/music.html';
  $('#muCopy').addEventListener('click', () => { url.select(); (navigator.clipboard ? navigator.clipboard.writeText(url.value) : Promise.reject()).catch(() => { try { document.execCommand('copy'); } catch (e) { /* выделено — скопировать можно вручную */ } }); const b = $('#muCopy'); b.textContent = 'Скопировано'; setTimeout(() => { b.textContent = 'Копировать'; }, 1300); });

  function say(m, bad) { const e = $('#muMsg'); e.textContent = m || ''; e.className = 'form-message' + (bad ? ' error' : m ? ' success' : ''); }
  function flash(m) { const e = $('#muSaved'); e.textContent = m; setTimeout(() => { e.textContent = ''; }, 1400); }

  let embUid = 0, embPaused = false, posRef = null, lastSt = null;
  function render(s) {
    st = s; lastSt = s;
    const pn = $('#muPaidNote'); if (pn) pn.hidden = !s.paid;
    const rm = $('#muRwMsg'); if (rm && s.reward) { rm.textContent = s.reward.text || ''; rm.style.color = s.reward.state === 'ok' ? '' : (s.reward.state === 'idle' || s.reward.state === 'wait' ? '' : '#e5484d'); }
    const cur = s.current, on = !!(cur && s.settings.showVideo);
    $('#muTitle').textContent = cur ? cur.title : 'Очередь пуста';
    $('#muMeta').textContent = cur ? [cur.channel, cur.by ? 'заказал ' + cur.by : ''].filter(Boolean).join(' · ') + (s.paused ? ' · на паузе' : '') : 'Напиши в чате !муз название — трек сразу заиграет.';
    $('#muTag').textContent = cur ? (s.paused ? 'На паузе' : 'Сейчас играет') : 'Тишина';
    const badge = $('#muBadge'); badge.textContent = on ? 'На экране стрима' : 'Не на экране'; badge.classList.toggle('live', on);
    setIb($('#muShow'), s.settings.showVideo ? 'eyeoff' : 'eye', s.settings.showVideo ? 'Скрыть с экрана' : 'Показать на экране');
    $('#muShow').classList.toggle('mu-ib-main', !s.settings.showVideo);
    setIb($('#muPause'), s.paused ? 'play' : 'pause', s.paused ? 'Продолжить' : 'Пауза');
    $('#muPause').disabled = $('#muSkip').disabled = $('#muShow').disabled = !cur;
    posRef = s.pos ? { t: s.pos.t, d: s.pos.d || cur.seconds || 0, at: Date.now() } : { t: 0, d: cur ? cur.seconds || 0 : 0, at: Date.now() };
    // превью клипа для стримера: без звука, не зависит от того, выведен ли клип на сцену
    const emb = $('#muEmb'), ph = $('#muVph');
    const want = cur && !s.paused ? cur.uid : 0;
    if (want !== embUid) {
      embUid = want;
      if (want) { emb.src = 'https://www.youtube-nocookie.com/embed/' + cur.id + '?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&start=' + Math.floor(posRef.t); emb.hidden = false; }
      else { emb.removeAttribute('src'); emb.hidden = true; }
    }
    ph.hidden = !!want;
    if (!want) { ph.innerHTML = cur ? '<span>⏸</span><b>Пауза</b><small>' + esc(cur.title) + '</small>' : '<span>♪</span><b>Тишина</b><small>Ждём заказы из чата</small>'; }
    $('#muCount').textContent = s.queue.length ? s.queue.length : '';
    $('#muQueue').innerHTML = s.queue.length ? s.queue.map((q, i) => '<li draggable="true" data-uid="' + q.uid + '"><span class="grip" aria-hidden="true">⋮⋮</span><span class="n">' + (i + 1) + '</span><img src="https://i.ytimg.com/vi/' + esc(q.id) + '/default.jpg" alt=""><span class="t"><b>' + esc(q.title) + '</b><small>' + esc(q.by) + (q.seconds ? ' · ' + fmt(q.seconds) : '') + '</small></span>' + (q.prio >= 2 ? '<span class="pr">вне очереди</span>' : q.prio === 1 ? '<span class="pr">приоритет</span>' : '') + '<button type="button" class="ban" data-ban="' + q.uid + '" title="В чёрный список">⛔</button><button type="button" data-rm="' + q.uid + '" title="Убрать">×</button></li>').join('') : '<li class="empty">Очередь пуста</li>';
    $('#muBan').disabled = !cur;
    const bl = s.settings.blTracks || [];
    $('#muBl').innerHTML = bl.length ? bl.map((t) => '<li><span>' + esc(t.title || t.id) + '</span><button type="button" data-unban="' + esc(t.id) + '">убрать</button></li>').join('') : '<li class="none">Пока пусто</li>';
    paintView(s.settings);
    fields.forEach((f) => { const v = s.settings[f.dataset.m]; if (f.type === 'checkbox') f.checked = !!v; else if (document.activeElement !== f) f.value = v == null ? '' : v; });
    tickProg();
  }
  function tickProg() {
    if (!lastSt || !lastSt.current || !posRef) { $('#muPg').style.width = '0'; $('#muCur').textContent = '0:00'; $('#muDur').textContent = '0:00'; return; }
    const t = posRef.t + (lastSt.paused ? 0 : (Date.now() - posRef.at) / 1000), d = posRef.d;
    $('#muCur').textContent = fmt(Math.min(t, d || t)); $('#muDur').textContent = fmt(d);
    $('#muPg').style.width = d ? Math.min(100, t / d * 100) + '%' : '0';
  }
  setInterval(tickProg, 500);
  const refresh = () => api('/api/music/state').then((s) => { if (s && s.success && !dragUid) render(s); }).catch(() => {});
  const liveVisible = () => sec.offsetParent && !$('#muLive').hidden;
  const act = (p, b) => post(p, b).then((s) => { if (s && s.success) render(s); else say((s && s.error) || 'Ошибка', true); return s; });

  $('#muShow').addEventListener('click', () => act('/api/music/show', { show: !(st && st.settings.showVideo) }));
  $('#muPause').addEventListener('click', () => act('/api/music/pause', { paused: !(st && st.paused) }));
  $('#muSkip').addEventListener('click', () => act('/api/music/skip'));
  $('#muClear').addEventListener('click', () => act('/api/music/clear'));
  $('#muStop').addEventListener('click', () => act('/api/music/stop'));
  $('#muQueue').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) act('/api/music/remove', { uid: Number(b.dataset.rm) }); });
  $('#muQueue').addEventListener('click', (e) => { const b = e.target.closest('[data-ban]'); if (!b || !lastSt) return; const q = lastSt.queue.find((x) => x.uid === Number(b.dataset.ban)); if (q) act('/api/music/ban', { id: q.id, title: q.title }); });
  $('#muBan').addEventListener('click', () => { if (lastSt && lastSt.current) act('/api/music/ban', { id: lastSt.current.id, title: lastSt.current.title }); });
  $('#muBl').addEventListener('click', (e) => { const b = e.target.closest('[data-unban]'); if (b) act('/api/music/unban', { id: b.dataset.unban }); });
  // перетаскивание очереди
  const qEl = $('#muQueue');
  qEl.addEventListener('dragstart', (e) => { const li = e.target.closest('li[data-uid]'); if (!li) return; dragUid = Number(li.dataset.uid); li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragUid)); } catch (x) { /* не критично */ } });
  qEl.addEventListener('dragend', () => { dragUid = 0; qEl.querySelectorAll('li').forEach((l) => l.classList.remove('drag', 'over')); });
  qEl.addEventListener('dragover', (e) => { if (!dragUid) return; e.preventDefault(); const li = e.target.closest('li[data-uid]'); qEl.querySelectorAll('li').forEach((l) => l.classList.toggle('over', l === li)); });
  qEl.addEventListener('drop', (e) => {
    if (!dragUid) return; e.preventDefault();
    const li = e.target.closest('li[data-uid]'); if (!li || !lastSt) return;
    const to = lastSt.queue.findIndex((q) => q.uid === Number(li.dataset.uid)), from = lastSt.queue.findIndex((q) => q.uid === dragUid);
    if (to < 0 || from < 0 || to === from) return;
    act('/api/music/move', { uid: dragUid, to });
  });

  // --- вкладки «Эфир» / «Чарт и история» ---
  let pane = 'live', since = 'today';
  const sinceMs = () => since === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : since === '7' ? Date.now() - 7 * 864e5 : 0;
  function showPane(p) {
    pane = p; $('#muLive').hidden = p !== 'live'; $('#muStats').hidden = p !== 'stats';
    $$('#muTabs button').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
    if (p === 'stats') loadStats();
  }
  $$('#muTabs button').forEach((b) => b.addEventListener('click', () => showPane(b.dataset.p)));
  $$('#muPeriod button').forEach((b) => b.addEventListener('click', () => { since = b.dataset.d; $$('#muPeriod button').forEach((x) => x.classList.toggle('on', x === b)); loadStats(); }));
  function loadStats() {
    api('/api/music/stats?since=' + sinceMs()).then((r) => {
      if (!r || !r.success) return;
      $('#muTotal').textContent = r.total ? 'Воспроизведений: ' + r.total : 'За этот период ещё ничего не играло';
      const max = r.tracks.length ? r.tracks[0].count : 1;
      $('#muChart').innerHTML = r.tracks.length ? r.tracks.slice(0, 15).map((t, i) => '<li style="--w:' + Math.round(t.count / max * 100) + '%"><span class="rk">' + (i + 1) + '</span><img src="https://i.ytimg.com/vi/' + esc(t.id) + '/default.jpg" alt=""><span class="t"><b>' + esc(t.title) + '</b><small>' + esc(t.channel) + '</small></span><span class="cnt">×' + t.count + '</span></li>').join('') : '<li class="mu-empty">Чарт появится, когда зрители закажут первые треки</li>';
      $('#muUsers').innerHTML = r.users.length ? r.users.map((u) => '<li><span>' + esc(u.name) + '</span><b>' + u.count + '</b></li>').join('') : '<li class="mu-empty">Пока никого</li>';
      $('#muHist').innerHTML = r.recent.length ? r.recent.map((h) => '<li><img src="https://i.ytimg.com/vi/' + esc(h.id) + '/default.jpg" alt=""><span class="t"><b>' + esc(h.title) + '</b><small>' + new Date(h.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (h.by ? ' · ' + esc(h.by) : '') + '</small></span><span class="acts"><button type="button" data-again="' + esc(h.id) + '" title="Поставить ещё раз">↻</button><button type="button" data-hban="' + esc(h.id) + '" data-t="' + esc(h.title) + '" title="В чёрный список">⛔</button></span></li>').join('') : '<li class="mu-empty">История пуста</li>';
    }).catch(() => {});
  }
  $('#muHist').addEventListener('click', (e) => {
    const a = e.target.closest('[data-again]'), b = e.target.closest('[data-hban]');
    if (a) act('/api/music/add', { query: 'https://youtu.be/' + a.dataset.again }).then((r) => { if (r && r.success) flash('Добавлено в очередь'); });
    if (b) act('/api/music/ban', { id: b.dataset.hban, title: b.dataset.t }).then((r) => { if (r && r.success) flash('В чёрном списке'); });
  });
  $('#muChartSay').addEventListener('click', () => post('/api/music/chart/say', { since: sinceMs() }).then((r) => { flash(r && r.success ? 'Отправлено в чат' : (r && r.error) || 'Не удалось'); }));

  function add() {
    const q = $('#muQuery').value.trim(); if (!q) return;
    const b = $('#muAdd'); b.disabled = true; say('Ищу на YouTube…');
    act('/api/music/add', { query: q }).then((s) => { if (s && s.success) { $('#muQuery').value = ''; say(''); } }).catch(() => say('Не удалось связаться с программой.', true)).then(() => { b.disabled = false; });
  }
  $('#muAdd').addEventListener('click', add);
  $('#muQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  const rwMake = $('#muRwMake');
  if (rwMake) rwMake.addEventListener('click', () => {
    rwMake.disabled = true; $('#muRwMsg').textContent = 'Создаю…';
    post('/api/music/reward/create', { cost: 500 }).then((r) => { if (r && r.success) { render(r); const c = r.created; if (c && c.ok) flash('Награда создана: стоимость 500 баллов, поменять можно в Twitch'); } }).catch(() => { $('#muRwMsg').textContent = 'Не удалось связаться с программой.'; }).then(() => { rwMake.disabled = false; });
  });
  $('#muCheck').addEventListener('click', () => {
    const m = $('#muCheckMsg'); m.textContent = 'Проверяю…';
    clearTimeout(t);
    const patch = {}; fields.forEach((f) => { patch[f.dataset.m] = f.type === 'checkbox' ? f.checked : (f.type === 'number' ? Number(f.value) : f.value); });
    post('/api/music/settings', patch).then(() => post('/api/music/check', {})).then((r) => { m.textContent = r && r.ok ? 'Работает (' + r.ms + ' мс)' : 'Не получилось: ' + ((r && r.error) || 'нет ответа'); });
  });

  function setIb(el, name, title) { el.innerHTML = IB[name]; el.title = title; el.setAttribute('aria-label', title); }
  setIb($('#muSkip'), 'skip', 'Пропустить'); setIb($('#muBan'), 'ban', 'Убрать трек и больше не ставить (в чёрный список)');

  function save() {
    clearTimeout(t);
    t = setTimeout(() => {
      const patch = {};
      fields.forEach((f) => { patch[f.dataset.m] = f.type === 'checkbox' ? f.checked : (f.type === 'number' ? Number(f.value) : f.value); });
      post('/api/music/settings', patch).then((s) => { if (s && s.success) { render(s); flash('Сохранено'); } });
    }, 350);
  }
  fields.forEach((f) => f.addEventListener(f.type === 'checkbox' || f.tagName === 'SELECT' ? 'change' : 'input', save));
  // --- вид на экране: клип / плеер, строка, 10 видов плеера ---
  const skinsEl = $('#muSkins');
  const DEMO = { title: 'дора — Дорадура', by: 'Зритель', cover: '', cur: 52, dur: 130, playing: true };
  const skinCard = (n, th, label, key) => '<button type="button" class="mu-sk" data-k="' + n + '" data-th="' + th + '" title="' + label + '"><div class="fit">' + MusicSkins.html(n, th) + '</div><em>' + (key || n + '. ' + label) + '</em></button>';
  let skinKey = '';
  function renderSkins(s) {
    const k = s.skin + ':' + (s.skinTheme || 0); if (k === skinKey) return; skinKey = k;
    skinsEl.innerHTML = MusicSkins.list.map((d, i) => { const on = s.skin === i + 1, th = on && d.themes ? (s.skinTheme || 0) : 0; return skinCard(i + 1, th, d.name, (i + 1) + '. ' + d.name + (on && d.themes ? ' · ' + d.themes[Math.min(th, d.themes.length - 1)] : '')); }).join('');
    skinsEl.querySelectorAll('.mp').forEach((m) => MusicSkins.fill(m, DEMO));
    fitSkins();
  }
  // окно выбора темы: всплывает поверх страницы, у каждого варианта живое превью
  const thOv = $('#muThemeOv'), thG = $('#muThg');
  function openThemes(n) {
    const d = MusicSkins.list[n - 1]; if (!d || !d.themes) return;
    const cur = st && st.settings.skin === n ? (st.settings.skinTheme || 0) : -1;
    $('#muThTitle').textContent = 'Тема плеера «' + d.name + '»';
    thG.innerHTML = d.themes.map((name, i) => skinCard(n, i, name, name).replace('class="mu-sk"', 'class="mu-sk' + (i === cur ? ' on' : '') + '"')).join('');
    thG.querySelectorAll('.mp').forEach((m) => MusicSkins.fill(m, DEMO));
    thOv.hidden = false; setTimeout(fitSkins, 30);
  }
  const closeThemes = () => { thOv.hidden = true; thG.innerHTML = ''; };
  thOv.addEventListener('click', (e) => { if (e.target.closest('[data-tclose]')) closeThemes(); });
  thG.addEventListener('click', (e) => { const b = e.target.closest('.mu-sk'); if (!b) return; setS({ skin: Number(b.dataset.k), skinTheme: Number(b.dataset.th) }); closeThemes(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !thOv.hidden) closeThemes(); });
  function fitSkins() { $$('#tab-music .mu-sk').forEach((b) => { const d = MusicSkins.list[Number(b.dataset.k) - 1], w = b.clientWidth, h = b.clientHeight; if (w) b.firstChild.style.transform = 'translate(-50%,-50%) scale(' + Math.min((w - 8) / d.w, (h - 8) / d.h) + ')'; }); }
  addEventListener('resize', fitSkins);
  const setS = (patch) => post('/api/music/settings', patch).then((r) => { if (r && r.success) { render(r); flash('Сохранено'); } });
  $$('#muView button').forEach((b) => b.addEventListener('click', () => setS({ view: b.dataset.v })));
  $$('#muLine button').forEach((b) => b.addEventListener('click', () => setS({ line: b.dataset.v })));
  skinsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return; const n = Number(b.dataset.k), d = MusicSkins.list[n - 1];
    if (d && d.themes) { if (!(st && st.settings.skin === n)) setS({ skin: n, skinTheme: 0 }).then(() => openThemes(n)); else openThemes(n); } else setS({ skin: n });
  });
  function paintView(s) {
    $$('#muView button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.view));
    $$('#muLine button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.line));
    renderSkins(s);
    $$('#muSkins .mu-sk').forEach((b) => b.classList.toggle('on', Number(b.dataset.k) === s.skin));
    $('#muLineBox').hidden = s.view !== 'clip'; $('#muSkinBox').hidden = s.view !== 'player';
    fitSkins();
  }

  // --- панель настроек (шестерёнка) ---
  const drawer = $('#muDrawer');
  const openD = (v) => { drawer.hidden = !v; if (v) setTimeout(fitSkins, 30); };
  $('#muGear').addEventListener('click', () => openD(true));
  drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) openD(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) openD(false); });

  // --- предпросмотр экрана в карточке и в отдельном окне ---
  const prev = $('#muPrev'), modal = $('#muModal'), big = $('#muPrevBig');
  const openM = (v) => { modal.hidden = !v; if (v) big.src = '/music.html?preview=1'; else big.removeAttribute('src'); };
  $('#muZoom').addEventListener('click', () => openM(true));
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-mclose]')) openM(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) openM(false); });

  let started = false;
  function start() { if (started) return; started = true; prev.src = '/music.html?preview=1'; refresh(); setInterval(() => { if (sec.offsetParent) refresh(); }, 2000); }
  document.querySelectorAll('.nav-item[data-tab="music"]').forEach((n) => n.addEventListener('click', () => { start(); setTimeout(fitSkins, 50); }));
  if (sec.offsetParent) start();
})();
