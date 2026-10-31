// soon.js (админка) — плитка «Скоро начнём» во вкладке «Доп. функционал»: настройки, цвета, фон, таймер.
(function () {
  'use strict';
  const card = document.querySelector('.ex-card[data-fmt="soon"]');
  if (!card) return;
  const $ = (s, r) => (r || card).querySelector(s);
  const $$ = (s, r) => [...(r || card).querySelectorAll(s)];
  const api = (p, o) => fetch(p, o).then((r) => r.json());
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const fields = $$('[data-s]');
  const PAL = [
    ['Красный', '#e5484d', '#ff6a3c', '#0b0305'], ['Оранжевый', '#f08a24', '#ffc15a', '#0d0703'], ['Золото', '#d9a441', '#ffe08a', '#0b0803'],
    ['Зелёный', '#2fbf71', '#7dffb0', '#030b07'], ['Бирюза', '#14b8c4', '#6ef0f5', '#03090b'], ['Синий', '#3b82f6', '#38bdf8', '#050a14'],
    ['Фиолетовый', '#8b5cf6', '#c084fc', '#08040f'], ['Розовый', '#ec4899', '#ff8ad0', '#0d0309'],
  ];
  let cur = null, t = 0;

  function flash(msg) { const e = $('#soonSaved'); e.textContent = msg; setTimeout(() => { e.textContent = ''; }, 1500); }
  function say(msg, bad) { const e = $('#soonMsg'); e.textContent = msg; e.className = 'form-message' + (bad ? ' error' : msg ? ' success' : ''); }
  function fill(s) {
    cur = s;
    fields.forEach((f) => { const v = s[f.dataset.s]; if (f.type === 'checkbox') f.checked = !!v; else if (document.activeElement !== f) f.value = v == null ? '' : v; });
    $$('#soonMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.timerMode));
    $$('#soonChat button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.chat));
    $$('#soonLayout button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.layout));
    $('#soonBgDel').hidden = !s.bgImage;
    $('#soonBgName').textContent = s.bgImage ? 'Свой фон загружен. Можно заменить новой картинкой или убрать.' : 'Свой фон не задан, используется градиент выбранных цветов.';
    $$('#soonPal button').forEach((b) => b.classList.toggle('on', b.dataset.a === s.accent && b.dataset.b === s.accent2 && b.dataset.c === s.bg));
  }
  function collect() {
    const o = {};
    fields.forEach((f) => { o[f.dataset.s] = f.type === 'checkbox' ? f.checked : (f.type === 'range' || f.type === 'number') ? Number(f.value) : f.value; });
    const m = $('#soonMode button.on'), c = $('#soonChat button.on'), l = $('#soonLayout button.on');
    if (m) o.timerMode = m.dataset.v; if (c) o.chat = c.dataset.v; if (l) o.layout = l.dataset.v;
    return o;
  }
  function save() {
    clearTimeout(t);
    t = setTimeout(async () => {
      try { const r = await post('/api/soon/settings', collect()); if (r.success) { fill(r.settings); flash('Сохранено'); } } catch (e) { /* повторится при следующем изменении */ }
    }, 350);
  }
  fields.forEach((f) => f.addEventListener(f.type === 'checkbox' || f.type === 'color' || f.type === 'time' ? 'input' : 'input', save));
  ['#soonMode', '#soonChat', '#soonLayout'].forEach((sel) => $$(sel + ' button').forEach((b) => b.addEventListener('click', () => { $$(sel + ' button').forEach((x) => x.classList.toggle('on', x === b)); save(); })));

  const pal = $('#soonPal');
  PAL.forEach((p) => {
    const b = document.createElement('button'); b.type = 'button'; b.title = p[0]; b.dataset.a = p[1]; b.dataset.b = p[2]; b.dataset.c = p[3];
    b.style.background = 'linear-gradient(135deg,' + p[1] + ',' + p[2] + ')';
    b.addEventListener('click', () => { $('[data-s="accent"]').value = p[1]; $('[data-s="accent2"]').value = p[2]; $('[data-s="bg"]').value = p[3]; save(); });
    pal.appendChild(b);
  });

  $('#soonStart').addEventListener('click', async () => {
    try { await post('/api/soon/timer', { minutes: Number($('[data-s="minutes"]').value) || undefined }); say('Таймер запущен.'); setTimeout(() => say(''), 2500); } catch (e) { say('Сервер не ответил.', true); }
  });
  $('#soonReset').addEventListener('click', async () => { try { await post('/api/soon/timer', { action: 'reset' }); say('Таймер сброшен.'); setTimeout(() => say(''), 2500); } catch (e) { say('Сервер не ответил.', true); } });

  $('#soonFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { say('Файл больше 15 МБ.', true); return; }
    const fd = new FormData(); fd.append('file', f);
    say('Загружаем…');
    try {
      const r = await fetch('/api/soon/background', { method: 'POST', body: fd }).then((x) => x.json());
      if (r.success) { fill(r.settings); say('Фон загружен.'); setTimeout(() => say(''), 2500); } else say(r.error || 'Не получилось загрузить.', true);
    } catch (err) { say('Сервер не ответил.', true); }
  });
  $('#soonBgDel').addEventListener('click', async () => { try { const r = await api('/api/soon/background', { method: 'DELETE' }); if (r.success) fill(r.settings); } catch (e) { /* ничего */ } });

  function showTw(ch) {
    const g = ch && (ch.game || ch.title);
    $('#soonTwGame').textContent = g ? (ch.game || 'Без категории') : 'нет данных';
    $('#soonTwTitle').textContent = ch && ch.title ? ch.title : 'Подключи Twitch во вкладке «Подключения», тогда здесь появятся категория и название канала.';
    const art = $('#soonTwArt'); art.style.backgroundImage = ch && ch.art ? 'url("' + ch.art + '")' : 'none';
  }
  $('#soonSync').addEventListener('click', async () => {
    const b = $('#soonSync'); b.disabled = true; say('Спрашиваем Twitch…');
    try {
      const r = await post('/api/soon/sync');
      if (r.success) { showTw(r.channel); say('Готово: данные канала обновлены.'); setTimeout(() => say(''), 2500); } else say(r.error || 'Не получилось.', true);
    } catch (e) { say('Сервер не ответил.', true); }
    b.disabled = false;
  });
  api('/api/soon/state').then((r) => { if (r.success) showTw(r.channel); }).catch(() => {});
  api('/api/soon/settings').then((r) => { if (r.success) fill(r.settings); }).catch(() => {});
})();
