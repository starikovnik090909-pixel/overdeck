/* qol.js — удобства: «Сохранено ✓», проблемы, макеты сцены (без чата), подтверждение сброса, копия и история */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const grp = $('.header-settings-group');
  const testWrap = $('.test-menu');

  /* ---------- 1. «Сохранено ✓» ---------- */
  const pill = document.createElement('span');
  pill.className = 'qol-save'; pill.setAttribute('aria-live', 'polite');
  if (grp) grp.insertBefore(pill, grp.firstChild);
  let hideT = null, pending = 0;
  const SKIP = /\/api\/(?:[^?]*(?:test|send|oauth|auth|connect|login|logout|disconnect|selfcheck|history|key\/|backup|replay|fake|upload|say|poll|refresh|unlink|verify|check)[^?]*)/i;
  function show(kind, text) {
    clearTimeout(hideT);
    pill.className = 'qol-save show ' + kind; pill.textContent = text;
    if (kind !== 'busy') hideT = setTimeout(() => { pill.classList.remove('show'); }, kind === 'err' ? 5000 : 2200);
  }
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let url = '', method = 'GET';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase(); } catch (e) { /* пропускаем */ }
    const track = method !== 'GET' && method !== 'HEAD' && /^\/api\//.test(url.replace(location.origin, '')) && !SKIP.test(url);
    if (!track) return _fetch(input, init);
    pending++; show('busy', 'Сохраняю…');
    return _fetch(input, init).then((r) => { pending--; if (r.ok) { if (!pending) show('ok', 'Сохранено ✓'); } else show('err', 'Не сохранилось'); return r; },
      (e) => { pending--; show('err', 'Не сохранилось'); throw e; });
  };

  /* ---------- 12. Проблемы ---------- */
  const warn = document.createElement('div');
  warn.className = 'qol-warn'; warn.hidden = true;
  warn.innerHTML = '<button type="button" class="qol-warn-btn" title="Что не так"><svg viewBox="0 0 24 24"><path d="M12 3 2 20h20z"/><path d="M12 10v5M12 18v.5"/></svg><b>0</b></button><div class="qol-warn-pop" hidden></div>';
  if (grp) grp.insertBefore(warn, testWrap || null);
  const wBtn = $('.qol-warn-btn', warn), wPop = $('.qol-warn-pop', warn), wNum = $('b', wBtn);
  wBtn.addEventListener('click', (e) => { e.stopPropagation(); wPop.hidden = !wPop.hidden; });
  document.addEventListener('click', (e) => { if (!wPop.hidden && !warn.contains(e.target)) wPop.hidden = true; });
  let botWasUp = false;
  window.qolStatus = function (d) {
    const list = [];
    const tw = d.twitch || {};
    if (!tw.connected) list.push({ t: 'Twitch не подключён', h: tw.error || 'Без входа не работают чат, события и награды.', go: 'auth' });
    const bot = d.chatBot || {};
    if (bot.status === 'connected') botWasUp = true;
    if (bot.status === 'error' || (botWasUp && bot.status !== 'connected' && bot.status !== 'connecting')) list.push({ t: 'Чат-бот отвалился', h: bot.statusMessage || 'Проверь авторизацию бота.', go: 'chatbot' });
    if (!d.overlayOnline) list.push({ t: 'Оверлей не открыт в OBS', h: 'Добавь источник «Браузер» со ссылкой оверлея и проверь, что он включён.', go: 'obs', soft: !d.streamLive });
    const sc = d.selfCheck;
    if (sc && !sc.ok && sc.problems) sc.problems.forEach((p) => list.push({ t: p.title, h: p.text }));
    warn.hidden = !list.length;
    wNum.textContent = list.length;
    warn.classList.toggle('hard', list.some((x) => !x.soft));
    wPop.innerHTML = list.map((x) => '<div class="qol-w-i"><b>' + esc(x.t) + '</b><span>' + esc(x.h) + '</span>' + (x.go ? '<button type="button" data-go="' + x.go + '">Открыть</button>' : '') + '</div>').join('');
    wPop.querySelectorAll('button[data-go]').forEach((b) => b.addEventListener('click', () => { wPop.hidden = true; const n = $('.nav-item[data-tab="' + b.dataset.go + '"]'); if (n) n.click(); }));
  };

  /* ---------- 5. Макеты сцены (чат не трогаем) ---------- */
  const PRESETS = [
    { id: 'min', name: 'Минимал', hint: 'Только активность и лента', rects: { activity: [40, 40, 460, 1000], timeline: [524, 40, 1356, 494] } },
    { id: 'std', name: 'Стандарт', hint: 'Как по умолчанию', std: true },
    { id: 'don', name: 'Донаты', hint: 'Лента событий и топ донатеров', rects: { timeline: [40, 40, 1100, 494], eventfeed: [1164, 40, 716, 494], donortop: [40, 558, 360, 482], emotebox: [424, 558, 542, 482], wordcloud: [990, 558, 890, 482] } },
  ];
  let undoLayout = null;
  function applyPreset(p) {
    const api = window.__sceneApi; if (!api) return;
    undoLayout = api.get();
    const next = {};
    api.ids().forEach((id) => {
      if (id === 'chat') return; // чат — отдельная вкладка, макеты его не касаются
      if (p.std) { const d = api.defaults()[id]; if (d) next[id] = { x: d.x, y: d.y, w: d.w, h: d.h, enabled: d.enabled }; return; }
      const r = p.rects[id];
      next[id] = r ? { x: r[0], y: r[1], w: r[2], h: r[3], enabled: true } : { enabled: false };
    });
    api.set(next);
    const u = $('.qol-undo'); if (u) { u.hidden = false; u.textContent = 'Отменить «' + p.name + '»'; }
  }
  function mountPresets() {
    const list = $('#widgetList'); if (!list || $('.qol-presets')) return;
    const box = document.createElement('div');
    box.className = 'qol-presets';
    box.innerHTML = '<div class="widget-fields-title">Готовые макеты</div><div class="qol-pr-row">' + PRESETS.map((p) => '<button type="button" class="qol-pr" data-p="' + p.id + '" title="' + esc(p.hint + ' · чат не меняется') + '">' + esc(p.name) + '</button>').join('') + '</div><button type="button" class="qol-undo" hidden></button><div class="qol-pr-note">Чат остаётся как был</div>';
    list.parentNode.appendChild(box);
    box.querySelectorAll('.qol-pr').forEach((b) => b.addEventListener('click', () => applyPreset(PRESETS.find((p) => p.id === b.dataset.p))));
    $('.qol-undo', box).addEventListener('click', () => { if (undoLayout && window.__sceneApi) { window.__sceneApi.set(undoLayout); undoLayout = null; $('.qol-undo', box).hidden = true; } });
  }
  mountPresets();

  /* ---------- 9. Подтверждение «Сбросить к стандартным» ---------- */
  const RESETS = ['btnThemeReset', 'btnWidgetSettingsReset', 'btnDaReset', 'btnAvatarCmdReset', 'btnTeamSizeReset', 'btnMvpSizeReset', 'btnFactSizeReset', 'btnFundSizeReset', 'btnFundAlertReset', 'btnFundBoxSizeReset', 'btnPixelBehaviorReset', 'btnPixelTagReset'];
  RESETS.forEach((id) => { const b = document.getElementById(id); if (b && /^(Сбросить|По умолчанию|Сбросить цвета|Сбросить оформление к дефолту)$/.test(b.textContent.trim())) b.title = 'Вернуть настройки этого блока к стандартным'; });
  let passOnce = null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button'); if (!b || !RESETS.includes(b.id)) return;
    if (passOnce === b) { passOnce = null; return; }
    e.stopImmediatePropagation(); e.preventDefault();
    const ask = window.ui3Confirm ? window.ui3Confirm('Сбросить к стандартным?\n\nНастройки этого блока вернутся к значениям по умолчанию. Если что — откат есть в «Настройки админки → Копии и история».') : Promise.resolve(true);
    ask.then((ok) => { if (ok) { passOnce = b; b.click(); } });
  }, true);

  /* ---------- 10 + 11. Копия и история (шестерёнка) ---------- */
  const keyCard = document.getElementById('keyCard');
  if (keyCard) {
    const c = document.createElement('div');
    c.className = 'card qol-hist'; 
    c.innerHTML = '<h2 class="section-title">Копии и история</h2>' +
      '<p class="card-hint">Копия — один файл со всеми настройками (без пароля и без картинок трансляции). История — точки отката, которые Overdeck делает сам, пока ты меняешь настройки.</p>' +
      '<div class="actions"><button class="btn btn-primary" id="qolDl" type="button">Скачать копию настроек</button><button class="btn btn-secondary" id="qolUp" type="button">Восстановить из файла</button><input type="file" id="qolFile" accept=".overdeckkey,.json" style="display:none"></div>' +
      '<div class="widget-fields-title" style="margin-top:16px">Вернуть как было</div><div class="qol-hl" id="qolList">Загружаю…</div>' +
      '<div class="actions"><button class="btn btn-secondary" id="qolSnap" type="button">Сохранить точку сейчас</button></div><div class="form-message" id="qolMsg"></div>';
    const wrap = document.createElement('div'); wrap.className = 'qol-gear-grid';
    keyCard.parentNode.insertBefore(wrap, keyCard); wrap.appendChild(keyCard); const col = document.createElement('div'); col.style.cssText = 'display:grid;gap:16px'; col.appendChild(c); const dev = document.getElementById('devCard'); if (dev) col.appendChild(dev); wrap.appendChild(col);
    const msg = $('#qolMsg', c), listEl = $('#qolList', c);
    const say = (t, k) => { msg.textContent = t; msg.className = 'form-message' + (k ? ' ' + k : ''); };
    const ago = (ms) => { const m = Math.round(ms / 60000); if (m < 1) return 'только что'; if (m < 60) return m + ' мин назад'; const h = Math.floor(m / 60); return h < 24 ? h + ' ч ' + (m % 60) + ' мин назад' : Math.floor(h / 24) + ' дн назад'; };
    async function load() {
      try {
        const d = await (await fetch('/api/history')).json();
        listEl.innerHTML = d.list.length ? d.list.slice(0, 12).map((x) => '<div class="qol-h-row"><span><b>' + ago(d.now - x.at) + '</b> · ' + new Date(x.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</span><button class="btn btn-secondary btn-sm" data-n="' + esc(x.name) + '">Вернуть</button></div>').join('') : 'Точек пока нет — первая появится после первых изменений.';
      } catch (e) { listEl.textContent = 'Не удалось загрузить.'; }
    }
    function afterRestore(r) {
      say(r.restart === 'auto' ? 'Готово. Overdeck перезапускается — страница обновится сама.' : 'Готово. Перезапусти Overdeck вручную, чтобы настройки применились.', 'success');
      if (r.restart === 'auto') setTimeout(() => location.reload(), 6000);
    }
    $('#qolDl', c).addEventListener('click', () => { location.href = '/api/backup/download'; say('Копия скачивается.', 'success'); });
    $('#qolUp', c).addEventListener('click', () => $('#qolFile', c).click());
    $('#qolFile', c).addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (!(await window.ui3Confirm('Восстановить настройки из файла?\n\nТекущие настройки будут заменены. Перед этим Overdeck сохранит точку, к ней можно вернуться.'))) return;
      try {
        await fetch('/api/history/snapshot', { method: 'POST' });
        const r = await (await fetch('/api/key/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: await f.text(), password: '' }) })).json();
        if (r.success) afterRestore(r); else say(r.needPassword ? 'Файл с паролем — открой его через «Открыть файл авторизации» выше.' : (r.error || 'Не получилось.'), 'error');
      } catch (er) { say('Не получилось прочитать файл.', 'error'); }
    });
    $('#qolSnap', c).addEventListener('click', async () => { await fetch('/api/history/snapshot', { method: 'POST' }); say('Точка сохранена.', 'success'); load(); });
    listEl.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-n]'); if (!b) return;
      if (!(await window.ui3Confirm('Вернуть настройки к этой точке?\n\nТекущие настройки сначала сохранятся как новая точка, так что откат можно отменить.'))) return;
      try { const r = await (await fetch('/api/history/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: b.dataset.n }) })).json(); if (r.success) afterRestore(r); else say(r.error || 'Не получилось.', 'error'); }
      catch (er) { say('Не получилось.', 'error'); }
    });
    const nav = $('.nav-item[data-tab="admin-settings"]');
    if (nav) nav.addEventListener('click', load);
    load();
  }
})();
