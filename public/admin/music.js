// music.js (админка) — вкладка «Заказ музыки»: очередь, кнопка показа клипа, положение рамки, правила.
(function () {
  'use strict';
  const sec = document.getElementById('tab-music');
  if (!sec) return;
  const $ = (s) => sec.querySelector(s);
  const $$ = (s) => [...sec.querySelectorAll(s)];
  const api = (p, o) => fetch(p, o).then((r) => r.json());
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const fields = $$('[data-m]');
  let st = null, t = 0;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s) => (s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : '');

  const url = $('#muUrl'); url.value = location.origin + '/music.html';
  const prev = $('#muPrev');
  function fitPrev() { const w = prev.parentElement.clientWidth; if (w) prev.style.transform = 'scale(' + w / 1920 + ')'; }
  addEventListener('resize', fitPrev);
  $('#muCopy').addEventListener('click', () => { url.select(); (navigator.clipboard ? navigator.clipboard.writeText(url.value) : Promise.reject()).catch(() => { try { document.execCommand('copy'); } catch (e) { /* выделено — скопировать можно вручную */ } }); const b = $('#muCopy'); b.textContent = 'Скопировано'; setTimeout(() => { b.textContent = 'Копировать'; }, 1300); });

  function say(m, bad) { const e = $('#muMsg'); e.textContent = m || ''; e.className = 'form-message' + (bad ? ' error' : m ? ' success' : ''); }
  function flash(m) { const e = $('#muSaved'); e.textContent = m; setTimeout(() => { e.textContent = ''; }, 1400); }

  function render(s) {
    st = s;
    const cur = s.current;
    $('#muNow').innerHTML = cur ? '<b>' + esc(cur.title) + '</b><span>' + esc(cur.channel) + (cur.by ? ' · заказал ' + esc(cur.by) : '') + (cur.seconds ? ' · ' + fmt(cur.seconds) : '') + (s.paused ? ' · на паузе' : '') + '</span>' : '<b>Тишина</b><span>Очередь пуста — ждём заказы из чата</span>';
    $('#muShow').textContent = s.settings.showVideo ? 'Скрыть клип с экрана' : 'Показать клип на экране';
    $('#muShow').className = 'btn ' + (s.settings.showVideo ? 'btn-secondary' : 'btn-primary');
    $('#muPause').textContent = s.paused ? 'Продолжить' : 'Пауза';
    $('#muPause').disabled = $('#muSkip').disabled = !cur;
    $('#muCount').textContent = s.queue.length ? '(' + s.queue.length + ')' : '';
    $('#muQueue').innerHTML = s.queue.length ? s.queue.map((q, i) => '<li><span>' + (i + 1) + '.</span><span class="t">' + esc(q.title) + ' <small>' + esc(q.by) + (q.seconds ? ' · ' + fmt(q.seconds) : '') + '</small></span><button type="button" data-rm="' + q.uid + '" title="Убрать">×</button></li>').join('') : '<li class="empty">Очередь пуста</li>';
    fields.forEach((f) => { const v = s.settings[f.dataset.m]; if (f.type === 'checkbox') f.checked = !!v; else if (document.activeElement !== f) f.value = v == null ? '' : v; });
  }
  const refresh = () => api('/api/music/state').then((s) => { if (s && s.success) render(s); }).catch(() => {});
  const act = (p, b) => post(p, b).then((s) => { if (s && s.success) render(s); else say((s && s.error) || 'Ошибка', true); return s; });

  $('#muShow').addEventListener('click', () => act('/api/music/show', { show: !(st && st.settings.showVideo) }));
  $('#muPause').addEventListener('click', () => act('/api/music/pause', { paused: !(st && st.paused) }));
  $('#muSkip').addEventListener('click', () => act('/api/music/skip'));
  $('#muClear').addEventListener('click', () => act('/api/music/clear'));
  $('#muStop').addEventListener('click', () => act('/api/music/stop'));
  $('#muQueue').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) act('/api/music/remove', { uid: Number(b.dataset.rm) }); });
  function add() {
    const q = $('#muQuery').value.trim(); if (!q) return;
    const b = $('#muAdd'); b.disabled = true; say('Ищу на YouTube…');
    act('/api/music/add', { query: q }).then((s) => { if (s && s.success) { $('#muQuery').value = ''; say(''); } }).catch(() => say('Не удалось связаться с программой.', true)).then(() => { b.disabled = false; });
  }
  $('#muAdd').addEventListener('click', add);
  $('#muQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  function save() {
    clearTimeout(t);
    t = setTimeout(() => {
      const patch = {};
      fields.forEach((f) => { patch[f.dataset.m] = f.type === 'checkbox' ? f.checked : (f.type === 'number' ? Number(f.value) : f.value); });
      post('/api/music/settings', patch).then((s) => { if (s && s.success) { render(s); flash('Сохранено'); } });
    }, 350);
  }
  fields.forEach((f) => f.addEventListener(f.type === 'checkbox' || f.tagName === 'SELECT' ? 'change' : 'input', save));
  $$('[data-c]').forEach((b) => b.addEventListener('click', () => {
    const w = Number(st.settings.w), h = Number(st.settings.h), m = 40, c = b.dataset.c;
    const x = c === 'tl' || c === 'bl' ? m : c === 'c' ? Math.round((1920 - w) / 2) : 1920 - w - m;
    const y = c === 'tl' || c === 'tr' ? 60 : c === 'c' ? Math.round((1080 - h) / 2) : 1080 - h - 60;
    post('/api/music/settings', { x, y }).then((s) => { if (s && s.success) { render(s); flash('Сохранено'); } });
  }));

  let started = false;
  function start() { if (started) return; started = true; prev.src = '/music.html?preview=1'; fitPrev(); refresh(); setInterval(() => { if (sec.classList.contains('active') || sec.offsetParent) refresh(); }, 2000); }
  document.querySelectorAll('.nav-item[data-tab="music"]').forEach((n) => n.addEventListener('click', () => { start(); setTimeout(fitPrev, 50); }));
  if (sec.offsetParent) start();
})();
