// ui3.js — Overdeck 3.0: шапка (путь, поиск Ctrl+K, «Тест события»), версия в меню,
// вкладки «Главная» и «Ссылки для OBS». Работает поверх app.js и ничего в нём не меняет.
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ORIGIN = location.origin;
  const P = {
    check: '<path d="M20 6 9 17l-5-5"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>', users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5A2.5 2 0 0 0 12 8c-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2a2.5 2 0 0 1-2.5-1.5"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', bot: '<rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 8V4M8 14h.01M16 14h.01"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>', train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>', ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    chev: '<path d="m9 18 6-6-6-6"/>', zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  };
  const I = (n) => '<svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none">' + (P[n] || '') + '</svg>';
  const IC = (n) => '<svg viewBox="0 0 24 24">' + (P[n] || '') + '</svg>';

  /* ---------- тост ---------- */
  const toastEl = document.createElement('div'); toastEl.className = 'ui3-toast'; document.body.appendChild(toastEl);
  let toastT = 0;
  function toast(text, err) { toastEl.textContent = text; toastEl.classList.toggle('err', !!err); toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2600); }
  window.ui3Toast = toast;
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast('Ссылка скопирована');
  }
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json().catch(() => ({}))).catch(() => ({ success: false }));
  const goTab = (t) => { const n = $('.nav-item[data-tab="' + t + '"]'); if (n) n.click(); };

  /* ---------- путь в шапке ---------- */
  const crumb = $('#topCrumb');
  function syncCrumb() {
    if (!crumb) return;
    const a = $('.nav-item.active span');
    if (a) { crumb.textContent = a.textContent.trim(); return; }
    const s = $('.tab-section.active .tab-title');
    crumb.textContent = s ? s.textContent.trim() : '';
  }
  new MutationObserver(syncCrumb).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  syncCrumb();

  /* ---------- «Тест события» ---------- */
  const TESTS = {
    donation: () => post('/api/donation-alert/test', {}),
    follow: () => post('/api/event-alerts/follow/test', {}), sub: () => post('/api/event-alerts/sub/test', {}),
    raid: () => post('/api/event-alerts/raid/test', {}), hype: () => post('/api/event-alerts/hype/test', {}),
    points: () => post('/api/event-alerts/points/test', {}), goal: () => post('/api/goal/test', { kind: 'donation' }),
  };
  const NAMES = { donation: 'Донат', follow: 'Фоллов', sub: 'Подписка', raid: 'Рейд', hype: 'Hype Train', points: 'Награда за баллы', goal: 'Взнос в цель' };
  async function runTest(k) {
    if (!TESTS[k]) return;
    const r = await TESTS[k]();
    toast(r && r.success === false ? 'Не получилось: ' + (r.error || 'сервер не ответил') : 'Тест «' + NAMES[k] + '» отправлен в оверлей', r && r.success === false);
  }
  const tBtn = $('#testMenuBtn'), tPop = $('#testMenuPop');
  if (tBtn && tPop) {
    tBtn.addEventListener('click', (e) => { e.stopPropagation(); tPop.hidden = !tPop.hidden; });
    document.addEventListener('click', (e) => { if (!tPop.hidden && !tPop.contains(e.target)) tPop.hidden = true; });
    $$('button[data-test]', tPop).forEach((b) => b.addEventListener('click', () => { tPop.hidden = true; runTest(b.dataset.test); }));
  }

  /* ---------- поиск Ctrl+K ---------- */
  const pal = document.createElement('div');
  pal.className = 'ui3-palette-ov';
  pal.innerHTML = '<div class="ui3-palette"><input type="text" placeholder="Вкладка или настройка: «голос», «донат», «ссылка»…" autocomplete="off"><ul></ul></div>';
  document.body.appendChild(pal);
  const palIn = $('input', pal), palList = $('ul', pal);
  let palItems = [], palSel = 0;
  function buildIndex() {
    const out = [];
    $$('.nav-item[data-tab]').forEach((n) => {
      const tab = n.dataset.tab, name = (n.querySelector('span') || n).textContent.trim();
      out.push({ tab, title: name, sub: 'Вкладка', el: null });
      const sec = document.getElementById('tab-' + tab);
      if (!sec || n.classList.contains('tab-locked')) return;
      $$('.section-title, .card h2, .card h3, .ui3-ch h3', sec).forEach((h) => {
        const t = h.textContent.replace(/\s+/g, ' ').trim();
        if (t && t.length < 60) out.push({ tab, title: t, sub: name, el: h });
      });
    });
    return out;
  }
  function renderPal() {
    const q = palIn.value.trim().toLowerCase();
    const all = buildIndex();
    palItems = (q ? all.filter((x) => (x.title + ' ' + x.sub).toLowerCase().includes(q)) : all.filter((x) => !x.el)).slice(0, 40);
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    palList.innerHTML = palItems.length ? palItems.map((x, i) => '<li class="' + (i === palSel ? 'sel' : '') + '" data-i="' + i + '"><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></li>').join('') : '<div class="none">Ничего не нашлось</div>';
  }
  function openPal() { pal.classList.add('open'); palIn.value = ''; palSel = 0; renderPal(); palIn.focus(); }
  function closePal() { pal.classList.remove('open'); }
  function pick(i) {
    const x = palItems[i]; if (!x) return;
    closePal(); goTab(x.tab);
    if (x.el) setTimeout(() => { x.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const c = x.el.closest('.card') || x.el; c.animate([{ boxShadow: '0 0 0 2px #D84B55' }, { boxShadow: '0 0 0 2px transparent' }], { duration: 1400 }); }, 80);
  }
  palIn.addEventListener('input', () => { palSel = 0; renderPal(); });
  palIn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { palSel = Math.min(palItems.length - 1, palSel + 1); renderPal(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); renderPal(); e.preventDefault(); }
    else if (e.key === 'Enter') pick(palSel);
    else if (e.key === 'Escape') closePal();
  });
  palList.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) pick(+li.dataset.i); });
  pal.addEventListener('click', (e) => { if (e.target === pal) closePal(); });
  const sBtn = $('#topSearch'); if (sBtn) sBtn.addEventListener('click', openPal);
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { e.preventDefault(); pal.classList.contains('open') ? closePal() : openPal(); } });

  /* ---------- данные ---------- */
  let home = null;
  async function loadHome() {
    try { home = await (await fetch('/api/home')).json(); } catch (e) { home = null; }
    if (!home) return;
    const v = $('#sideVersion'); if (v) v.textContent = 'v' + home.version;
    if (isActive('home')) renderHome();
    if (isActive('obs')) renderObs();
  }
  const isActive = (t) => { const s = document.getElementById('tab-' + t); return s && s.classList.contains('active'); };
  const rub = (n) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };
  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'сейчас'; if (m < 60) return m + ' мин'; const h = Math.round(m / 60); if (h < 24) return h + ' ч';
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }
  function greet() { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; }

  /* ---------- Главная ---------- */
  function renderHome() {
    const d = home; if (!d) return;
    const o = d.twitch.oauth || {};
    const name = o.displayName || d.channel || '';
    $('#homeHello').textContent = name ? greet() + ', ' + name : 'Добро пожаловать в Overdeck';
    const left = Object.values(d.checklist).filter((x) => !x).length;
    $('#homeSub').textContent = d.setup ? 'Overdeck ещё не настроен — начни с подключения Twitch.' : left ? 'Осталось настроить: ' + left + ' ' + plural(left, 'шаг', 'шага', 'шагов') + '.' : 'Всё готово к стриму.';
    const st = (ic, cls, label, val, sub, tab) => '<div class="ui3-stat" data-go="' + tab + '"><div class="ui3-ico ' + cls + '">' + IC(ic) + '</div><div><small>' + label + '</small><b>' + val + '</b><span>' + sub + '</span></div></div>';
    const botOk = d.bot.status === 'connected';
    $('#homeStats').innerHTML =
      st('activity', o.connected ? 'ok' : 'warn', 'Twitch', o.connected ? 'Подключён' : 'Не подключён', o.connected ? esc(o.login || d.channel) : 'Нужно войти через Twitch', 'auth') +
      st('clock', d.streamLive ? 'acc' : '', 'Стрим', d.streamLive ? 'В эфире' : 'Офлайн', esc(d.channel || '—'), 'chat') +
      st('heart', 'acc', 'Донаты за 7 дней', rub(d.donations.week), d.donations.weekCount + ' ' + plural(d.donations.weekCount, 'донат', 'доната', 'донатов') + ' · сегодня ' + rub(d.donations.today), 'donations') +
      st('bot', botOk ? 'ok' : '', 'Чат-бот', botOk ? 'В чате' : 'Не подключён', d.bot.commands + ' ' + plural(d.bot.commands, 'команда', 'команды', 'команд') + ' · ' + d.bot.timers + ' ' + plural(d.bot.timers, 'таймер', 'таймера', 'таймеров'), 'chatbot');
    const c = d.checklist;
    const steps = [
      ['twitch', 'Подключить Twitch', c.twitch ? 'Вход выполнен' : 'Вкладка «Подключения» → «Войти через Twitch»', 'auth'],
      ['obs', 'Добавить оверлей в OBS', c.obs ? 'Виджет открыт в OBS' : 'Источник «Браузер», 1920×1080', 'obs'],
      ['donations', 'Подключить донаты', c.donations ? (d.donations.daConnected ? 'DonationAlerts' : d.donations.dxConnected ? 'DonateX' : 'DonatePay') : 'DonationAlerts, DonateX или DonatePay', 'donations'],
      ['tts', 'Включить озвучку чата', c.tts ? 'Включена' : 'Выбери голос — 1 минута', 'voice'],
      ['alerts', 'Настроить алерты', c.alerts ? 'Хотя бы один алерт включён' : 'Звук и текст для доната и событий', 'donalerts'],
    ];
    const done = steps.filter((s) => c[s[0]]).length;
    $('#homeChecklist').innerHTML = '<div class="ui3-ch"><div><h3>Настройка Overdeck</h3><div class="sub">' + (done === steps.length ? 'Всё настроено' : 'Осталось ' + (steps.length - done)) + '</div></div><div class="r"><span class="ui3-chip ' + (done === steps.length ? 'ok' : 'acc') + '">' + done + ' из ' + steps.length + '</span></div></div>' +
      steps.map((s) => '<div class="ui3-row ' + (c[s[0]] ? 'done' : '') + '"><span class="ui3-check">' + (c[s[0]] ? IC('check') : '') + '</span><div class="l"><b>' + s[1] + '</b><span>' + s[2] + '</span></div>' + (c[s[0]] ? '' : '<button class="btn btn-secondary btn-sm" type="button" data-go="' + s[3] + '">Настроить</button>') + '</div>').join('');
    const EV = { donation: ['heart', 'acc', 'задонатил'], sub: ['star', 'tw', 'подписка'], giftsub: ['gift', 'tw', 'подарил подписки'], raid: ['users', 'ok', 'рейд'], follow: ['user', '', 'подписался на канал'], channelpoints: ['coin', 'warn', 'награда за баллы'], watchstreak: ['activity', 'tw', 'серия просмотров'] };
    const evs = d.events || [];
    $('#homeEvents').innerHTML = '<div class="ui3-ch"><div><h3>Последние события</h3><div class="sub">С момента запуска Overdeck</div></div><div class="r"><button class="btn btn-ghost btn-sm" type="button" data-go="donations">Донаты ' + I('chev') + '</button></div></div>' +
      (evs.length ? evs.map((e) => { const m = EV[e.type] || ['activity', '', e.type]; const amt = e.type === 'donation' ? rub(e.amount) : e.type === 'raid' ? e.count + ' ' + plural(e.count, 'зритель', 'зрителя', 'зрителей') : e.type === 'giftsub' ? '× ' + e.count : e.type === 'channelpoints' ? esc(e.text) : e.type === 'watchstreak' ? e.count + ' ' + plural(e.count, 'стрим', 'стрима', 'стримов') : '';
        return '<div class="ui3-row ui3-ev"><div class="ui3-ico ' + m[1] + '">' + IC(m[0]) + '</div><div class="l"><b>' + esc(e.username || 'Аноним') + ' <span style="font-weight:400;color:var(--text-secondary)">' + m[2] + '</span></b></div>' + (amt ? '<span class="amt">' + amt + '</span>' : '') + '<span class="t">' + ago(e.ts) + '</span></div>'; }).join('')
        : '<div class="ui3-empty"><b>Пока тихо</b>Здесь появятся донаты, подписки и рейды.<br>Проверь, как они выглядят, кнопками «Тест события».</div>');
    $('#homeTests').innerHTML = '<div class="ui3-ch"><div><h3>Тестовые события</h3><div class="sub">Видны только в оверлее, в статистику не попадают</div></div></div><div class="ui3-tests">' +
      [['donation', 'heart', 'Донат'], ['follow', 'user', 'Фоллов'], ['sub', 'star', 'Подписка'], ['raid', 'users', 'Рейд'], ['hype', 'train', 'Hype Train'], ['goal', 'target', 'Цель сбора']].map((x) => '<button class="btn btn-secondary" type="button" data-test="' + x[0] + '">' + I(x[1]) + ' ' + x[2] + '</button>').join('') + '</div>';
    $('#homeLinks').innerHTML = '<div class="ui3-ch"><h3>Ссылки для OBS</h3><div class="r"><button class="btn btn-ghost btn-sm" type="button" data-go="obs">Все ' + I('chev') + '</button></div></div>' +
      WIDGETS.slice(0, 3).map((w) => '<div class="ui3-row"><div class="l"><b>' + w.name + '</b></div><button class="btn btn-secondary btn-sm" type="button" data-copy="' + ORIGIN + '/' + w.url + '">' + I('copy') + ' Копировать</button></div>').join('');
  }

  /* ---------- Ссылки для OBS ---------- */
  const WIDGETS = [
    { name: 'Основной оверлей', desc: 'Активность чата, таймлайн, топ донатеров, эмодзи, слова эфира', url: 'overlay.html', size: '1920 × 1080', key: 'overlay', tab: 'widgets', th: 'left:6px;right:6px;top:6px;height:16px;background:rgba(216,75,85,.45)' },
    { name: 'Все алерты вместе', desc: 'Один источник на весь экран: донаты, подписки, рейды, фоллоу, Hype Train, баллы, серия, «Сейчас играет», цель сбора', url: 'overlay.html?only=donation', size: '1920 × 1080', key: 'alerts', tab: 'donalerts', th: 'left:26px;right:26px;top:16px;height:22px;background:rgba(216,75,85,.6)' },
    ...[['donation', 'Донаты', 'Только алерт доната', 'donalerts'], ['sub', 'Подписки', 'Только алерт подписки', 'donalerts'], ['raid', 'Рейды', 'Только алерт рейда', 'donalerts'], ['follow', 'Фоллоу', 'Только алерт нового фолловера', 'donalerts'],
      ['hype', 'Hype Train', 'Только алерты Hype Train', 'donalerts'], ['points', 'Баллы канала', 'Только алерт наград за баллы', 'donalerts'], ['streak', 'Серия просмотров', 'Только плашка в углу экрана', 'donalerts'], ['nowplaying', 'Сейчас играет', 'Только алерт «Сейчас играет» (положение — настройкой «Угол»)', 'donalerts']]
      .map(([k, n, d, tab]) => ({ name: 'Алерт: ' + n, desc: d + '. Отдельный источник OBS', url: 'overlay.html?only=donation&kind=' + k, size: '1920 × 1080 (на весь экран)', key: 'k_' + k, tab, th: 'left:26px;right:26px;top:16px;height:22px;background:rgba(216,75,85,.35)' })),
    { name: 'Чат', desc: 'Сообщения зрителей с эмодзи и бейджами', url: 'chat-widget.html', size: 'любой, например 400 × 800', key: 'chat', tab: 'chat', th: 'left:30px;width:36px;top:5px;bottom:5px;background:rgba(255,255,255,.18)' },
    { name: 'Чат — док-панель OBS', desc: 'Чат с полем «написать от имени бота» внутри OBS: Вид → Док-панели → Пользовательские док-панели браузера', url: 'chat-dock.html', size: 'панель OBS', key: 'chatdock', dock: 1, tab: 'chat', th: 'left:8px;width:30px;top:5px;bottom:5px;background:rgba(216,75,85,.6)' },
    { name: 'Цель сбора отдельно', desc: 'Только если в «Алертах» выключен общий источник', url: 'goal.html', size: '680 × 250', key: 'goal', tab: 'donalerts', th: 'left:10px;right:10px;top:22px;height:10px;background:linear-gradient(90deg,#D84B55 62%,#333 62%)' },
  ];
  function renderObs() {
    const obs = (home && home.obs) || {};
    const t = $('#obsTable'); if (!t) return;
    t.innerHTML = '<thead><tr><th style="width:130px">Превью</th><th>Виджет</th><th style="width:200px">Размер источника</th><th style="width:420px">Ссылка</th><th style="width:150px">Статус</th><th style="width:240px"></th></tr></thead><tbody>' +
      WIDGETS.map((w) => { const on = (obs[w.key] || 0) > 0; const full = ORIGIN + '/' + w.url;
        return '<tr><td><div class="ui3-thumb"><i style="' + w.th + '"></i></div></td><td><b style="font-weight:600">' + w.name + '</b><div class="card-hint" style="margin:2px 0 0">' + w.desc + '</div></td><td class="mono">' + w.size + '</td>' +
          '<td><div class="ui3-url"><i>' + esc(ORIGIN.replace(/^https?:\/\//, '')) + '/</i>' + esc(w.url) + '</div></td>' +
          '<td>' + (w.dock ? '<span class="ui3-chip">Док-панель</span>' : on ? '<span class="ui3-chip ok">Открыт в OBS</span>' : '<span class="ui3-chip">Не открыт</span>') + '</td>' +
          '<td style="text-align:right;white-space:nowrap"><button class="btn btn-secondary btn-sm" type="button" data-copy="' + full + '">' + I('copy') + ' Копировать</button> <a class="btn btn-ghost btn-sm" href="' + full + '" target="_blank" rel="noopener" title="Открыть в браузере">' + I('ext') + '</a> <button class="btn btn-ghost btn-sm" type="button" data-go="' + w.tab + '">Настроить</button></td></tr>'; }).join('') + '</tbody>';
  }


  /* ---------- Чат: «Док для OBS» ---------- */
  const dockBtn = document.getElementById('btnChatDock');
  if (dockBtn) dockBtn.addEventListener('click', async () => {
    const url = location.origin + '/chat-dock.html';
    try { await navigator.clipboard.writeText(url); } catch (e) {}
    toast('Ссылка на док скопирована. Дальше по шагам выше');
  });
  /* ---------- общие клики ---------- */
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]'); if (g && (g.closest('#tab-home') || g.closest('#tab-obs'))) { goTab(g.dataset.go); return; }
    const c = e.target.closest('[data-copy]'); if (c) { copy(c.dataset.copy); return; }
    const t = e.target.closest('#tab-home [data-test]'); if (t) { runTest(t.dataset.test); return; }
  });
  const all = $('#homeTestAll');
  if (all) all.addEventListener('click', async () => { for (const k of ['donation', 'follow', 'sub', 'raid']) { await TESTS[k](); await new Promise((r) => setTimeout(r, 400)); } toast('Отправлены тесты: донат, фоллов, подписка, рейд'); });

  // обновление при переключении на вкладку и раз в 5 секунд, пока она открыта
  $$('.nav-item[data-tab="home"], .nav-item[data-tab="obs"]').forEach((n) => n.addEventListener('click', () => setTimeout(loadHome, 0)));
  setInterval(() => { if (!document.hidden && (isActive('home') || isActive('obs'))) loadHome(); }, 5000);
  loadHome();
  renderObs();
})();

// ---------- Вход по коду (общее приложение Overdeck) + мастер первого запуска ----------
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then((r) => r.json().catch(() => ({}))).catch(() => ({ success: false, error: 'Сервер не отвечает' }));
  const TW = '<svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M21 2H3v16h5v4l4-4h5l4-4z"/><path d="M11 7v4M16 7v4"/></svg>';
  const toast = (t, e) => window.ui3Toast && window.ui3Toast(t, e);
  let mode = null;

  /* общий блок «код + кнопки», рисуется в карточку вкладки и в мастер */
  function deviceBlock(host, onDone) {
    let timer = 0, stopped = false;
    host.innerHTML = '<button class="btn btn-primary ui3-tw" type="button" data-dv="start">' + TW + ' Войти через Twitch</button><div class="card-hint" style="margin-top:10px">Откроется twitch.tv — подтверди вход. Пароль Overdeck не видит, ключи создавать не нужно.</div>';
    const render = (st) => {
      if (st.state === 'pending') {
        const m = Math.floor(st.left / 60), sec = String(st.left % 60).padStart(2, '0');
        host.innerHTML = '<div class="ui3-code"><div><div class="card-hint" style="margin:0 0 6px">Твой код</div><div class="ui3-code-val">' + esc(st.userCode) + '</div></div>' +
          '<div class="ui3-code-steps"><div>1. Открой страницу Twitch кнопкой ниже</div><div>2. Проверь, что код совпадает, и нажми «Активировать» / «Authorize»</div><div class="card-hint" style="margin:0">3. Вернись сюда — всё продолжится само</div></div></div>' +
          '<div class="ui3-code-act"><a class="btn btn-primary ui3-tw" href="' + esc(st.uri) + '" target="_blank" rel="noopener">' + TW + ' Открыть Twitch</a><button class="btn btn-ghost" type="button" data-dv="copy">Скопировать код</button><button class="btn btn-ghost" type="button" data-dv="cancel">Отмена</button><span class="ui3-wait"><span class="status-dot" style="background:var(--warn)"></span> Ждём подтверждения… ' + m + ':' + sec + '</span></div>';
      } else if (st.state === 'done') {
        host.innerHTML = '<div class="ui3-ok">Готово — вход выполнен: <b>' + esc(st.displayName || st.login) + '</b>' + (st.restart === 'auto' ? '. Перезапускаю Overdeck с твоим каналом…' : st.restart === 'manual' ? '. Закрой окно сервера и запусти Overdeck снова, чтобы подключить чат канала.' : '') + '</div>';
      } else if (st.state === 'expired' || st.state === 'error') {
        host.innerHTML = '<div class="ui3-err">' + (st.state === 'expired' ? 'Код устарел.' : esc(st.error || 'Не получилось войти.')) + '</div><button class="btn btn-primary ui3-tw" type="button" data-dv="start" style="margin-top:10px">' + TW + ' Попробовать снова</button>';
      }
    };
    async function poll() {
      if (stopped) return;
      const st = await fetch('/api/twitch/device/status').then((r) => r.json()).catch(() => null);
      if (!st) { timer = setTimeout(poll, 2000); return; }
      render(st);
      if (st.state === 'pending') timer = setTimeout(poll, 1000);
      else if (st.state === 'done') { if (onDone) onDone(st); if (st.restart === 'auto') waitRestart(); }
    }
    function waitRestart() {
      let n = 0;
      const t = setInterval(async () => { n++; const ok = await fetch('/api/twitch/mode').then((r) => r.ok).catch(() => false); if (ok && n > 3) { clearInterval(t); location.reload(); } if (n > 60) clearInterval(t); }, 1000);
    }
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-dv]'); if (!b) return;
      const a = b.dataset.dv;
      if (a === 'start') {
        b.disabled = true;
        const r = await post('/api/twitch/device/start');
        if (!r.success) { b.disabled = false; toast(r.error || 'Twitch не ответил', true); return; }
        window.open(r.uri, '_blank', 'noopener');
        clearTimeout(timer); poll();
      } else if (a === 'copy') {
        const v = $('.ui3-code-val', host); if (v) { try { await navigator.clipboard.writeText(v.textContent); toast('Код скопирован'); } catch (err) {} }
      } else if (a === 'cancel') {
        clearTimeout(timer); await post('/api/twitch/device/cancel'); deviceBlock(host, onDone);
      }
    });
    fetch('/api/twitch/device/status').then((r) => r.json()).then((st) => { if (st.state === 'pending') poll(); }).catch(() => {});
    return { stop: () => { stopped = true; clearTimeout(timer); } };
  }

  /* карточка на вкладке «Подключения» */
  function mountAuthCard() {
    const sec = document.getElementById('tab-auth'); if (!sec) return;
    const oldCard = $('#oauthConnected', sec) && $('#oauthConnected', sec).closest('.card');
    const cred = $('#credentialsCard', sec);
    const card = document.createElement('div');
    card.className = 'card ui3-device-card';
    const summary = $('#authStatusSummary', sec);
    (summary || sec.querySelector('.tab-description')).insertAdjacentElement('afterend', card);
    const adv = document.createElement('button');
    adv.type = 'button'; adv.className = 'btn btn-ghost btn-sm ui3-adv'; adv.textContent = 'Расширенный режим: свои Client ID и Secret';
    card.insertAdjacentElement('afterend', adv);
    let advOpen = false;
    const setAdv = (open) => { advOpen = open; [oldCard, cred, document.getElementById('envCredentialsCard')].forEach((c) => c && c.classList.toggle('ui3-hide', !open)); adv.textContent = open ? 'Скрыть расширенный режим' : 'Расширенный режим: свои Client ID и Secret'; };
    adv.addEventListener('click', () => setAdv(!advOpen));
    setAdv(false);
    const draw = () => {
      if (mode.loggedIn) {
        card.innerHTML = '<div class="ui3-ch" style="padding:0 0 14px;border:0"><div class="ui3-ico tw">' + TW + '</div><div><h3>Канал Twitch</h3><div class="sub" id="ui3TwLogin">Вход выполнен</div></div><div class="r"><button class="btn btn-secondary" type="button" id="ui3Relogin">Войти заново</button><button class="btn btn-ghost" type="button" id="ui3Logout">Выйти</button></div></div><div id="ui3DevHost"></div>';
        fetch('/api/home').then((r) => r.json()).then((d) => { const o = d.twitch && d.twitch.oauth; if (o && o.connected) $('#ui3TwLogin').textContent = (o.displayName || o.login) + ' · чат, события, баллы канала'; }).catch(() => {});
        $('#ui3Logout').addEventListener('click', async () => { await post('/api/twitch/logout'); mode.loggedIn = false; draw(); toast('Вы вышли из Twitch'); });
        $('#ui3Relogin').addEventListener('click', () => { const h = $('#ui3DevHost'); deviceBlock(h, () => { mode.loggedIn = true; }); $('[data-dv="start"]', h).click(); });
      } else {
        card.innerHTML = '<div class="ui3-ch" style="padding:0 0 14px;border:0"><div class="ui3-ico tw">' + TW + '</div><div><h3>Вход через Twitch</h3><div class="sub">Нужен, чтобы Overdeck получал чат, фолловы, подписки, рейды и баллы канала</div></div></div><div id="ui3DevHost"></div>';
        deviceBlock($('#ui3DevHost'), () => { mode.loggedIn = true; setTimeout(draw, 2500); });
      }
    };
    draw();
    if ((window.__ovQuery || '').indexOf('device=1') > -1 && !mode.loggedIn) setTimeout(() => { const b = $('[data-dv="start"]', card); if (b) b.click(); }, 300);
  }

  /* мастер первого запуска */
  function wizard(step) {
    const ov = document.createElement('div');
    ov.className = 'ui3-wizard';
    document.body.appendChild(ov);
    const steps = ['Вход через Twitch', 'OBS', 'Проверка'];
    const close = (done) => {
      if (done) store.set('ov3WizardDone', '1');
      store.del('ov3WizardStep');
      try { const m = JSON.parse(store.get('guideHidden_v1') || '{}'); m.home = 1; store.set('guideHidden_v1', JSON.stringify(m)); } catch (e) {} // после мастера мини-гайд «Главной» не нужен
      document.querySelectorAll('.guide-overlay.open').forEach((g) => g.classList.remove('open'));
      ov.remove();
    };
    const origin = location.origin;
    function draw() {
      const bar = '<div class="ui3-wz-steps">' + steps.map((t, i) => '<div class="' + (i < step ? 'done' : i === step ? 'on' : '') + '"><i></i><span>' + (i + 1) + '. ' + t + '</span></div>').join('') + '</div>';
      let body = '';
      if (step === 0) body = '<h1>Подключим Twitch</h1><p>Overdeck будет получать чат, фолловы, подписки, рейды и баллы канала. Займёт минуту.</p><div id="wzDev"></div>';
      if (step === 1) body = '<h1>Добавь Overdeck в OBS</h1><p>В OBS: <b>Источники → + → Браузер</b>. Вставь ссылку, размер <b>1920 × 1080</b>, сними галочку «Отключать источник, когда он не виден».</p>' +
        ['Основной оверлей|overlay.html', 'Алерты|overlay.html?only=donation'].map((x) => { const [n, u] = x.split('|'); return '<div class="ui3-wz-link"><b>' + n + '</b><code>' + origin + '/' + u + '</code><button class="btn btn-secondary btn-sm" type="button" data-wcopy="' + origin + '/' + u + '">Копировать</button></div>'; }).join('') +
        '<div class="ui3-wz-act"><button class="btn btn-primary" type="button" data-wz="next">Добавил, дальше</button><button class="btn btn-ghost" type="button" data-wz="next">Сделаю позже</button></div>';
      if (step === 2) body = '<h1>Проверим</h1><p>Нажми — в OBS должен появиться алерт. В статистику тестовые события не попадают.</p><div class="ui3-tests" style="padding:0;margin:16px 0 0">' +
        [['donation', 'Донат'], ['follow', 'Фоллов'], ['sub', 'Подписка'], ['raid', 'Рейд']].map((x) => '<button class="btn btn-secondary" type="button" data-wtest="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
        '<div class="ui3-wz-act"><button class="btn btn-primary" type="button" data-wz="finish">Всё работает — в админку</button></div>';
      ov.innerHTML = '<div class="ui3-wz-box"><div class="ui3-wz-brand"><img src="assets/overdeck-icon.svg" width="30" height="30" alt=""><b>Overdeck</b></div>' + bar + '<div class="card ui3-wz-card">' + body + '</div>' +
        '<div class="ui3-wz-foot"><button class="btn btn-ghost btn-sm" type="button" data-wz="skip">Пропустить мастер</button>' + (step === 0 ? '<button class="btn btn-ghost btn-sm" type="button" data-wz="key">Уже настраивал на другом ПК? Открыть файл авторизации</button>' : '') + '</div></div>';
      if (step === 0) deviceBlock($('#wzDev', ov), (st) => { store.set('ov3WizardStep', '1'); if (!st.restart) setTimeout(() => { step = 1; draw(); }, 1200); });
    }
    ov.addEventListener('click', async (e) => {
      const w = e.target.closest('[data-wz]');
      if (w) {
        const a = w.dataset.wz;
        if (a === 'next') { step++; store.set('ov3WizardStep', String(step)); draw(); }
        else if (a === 'finish') close(true);
        else if (a === 'skip') close(true);
        else if (a === 'key') { close(false); store.set('ov3WizardDone', '1'); const g = document.getElementById('adminSettingsGear'); if (g) g.click(); setTimeout(() => { const k = document.getElementById('keyCard'); if (k) k.scrollIntoView({ block: 'center' }); }, 120); }
        return;
      }
      const c = e.target.closest('[data-wcopy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.wcopy); toast('Ссылка скопирована'); } catch (err) {} return; }
      const t = e.target.closest('[data-wtest]');
      if (t) { const k = t.dataset.wtest; await post(k === 'donation' ? '/api/donation-alert/test' : '/api/event-alerts/' + k + '/test'); toast('Тест отправлен в оверлей'); }
    });
    draw();
  }

  fetch('/api/twitch/mode').then((r) => r.json()).then((m) => {
    mode = m;
    if (!m.publicApp || m.ownKeys) return; // своя пара ключей или сборка без общего приложения — всё как раньше
    mountAuthCard();
    const ws = store.get('ov3WizardStep');
    if (ws && m.loggedIn) wizard(+ws);
    else if (!store.get('ov3WizardDone') && (m.setup || !m.loggedIn)) wizard(0);
  }).catch(() => {});
})();

// ---------- Этап 2: Озвучка — автосохранение, фильтр каталога ----------
(function () {
  'use strict';
  const sec = document.getElementById('tab-voice'); if (!sec) return;
  const $ = (s) => sec.querySelector(s);
  const saveBtn = document.getElementById('btnTtsSave');
  const saved = document.getElementById('ttsSaved');
  const msg = document.getElementById('ttsFormMessage');
  let t = 0, ready = false;
  setTimeout(() => { ready = true; }, 2500); // не сохраняем, пока app.js заполняет форму при загрузке
  const mark = (txt, cls) => { if (saved) { saved.textContent = txt; saved.className = 'ui3-saved ' + (cls || ''); } };
  function schedule() {
    if (!ready || !saveBtn) return;
    clearTimeout(t); mark('Сохраняем…', 'busy');
    t = setTimeout(() => { if (saveBtn.disabled) { schedule(); return; } saveBtn.click(); }, 600);
  }
  if (msg) new MutationObserver(() => {
    const c = msg.className, txt = msg.textContent;
    if (/success/.test(c)) { mark(/остановлен/i.test(txt) ? 'Озвучка остановлена' : /умолчанию/.test(txt) ? 'Сброшено по умолчанию' : 'Сохранено', 'ok'); msg.textContent = ''; msg.className = 'form-message'; if (window.reloadTtsCatalog) window.reloadTtsCatalog(); }
    else if (/error/.test(c)) mark(txt || 'Не сохранилось', 'err');
  }).observe(msg, { childList: true, characterData: true, subtree: true, attributes: true });
  const skip = (el) => el.closest('#ttsCatalog') || el.id === 'ttsCatSearch' || el.id === 'ttsWordInput';
  sec.addEventListener('change', (e) => { if (!skip(e.target)) schedule(); });
  sec.addEventListener('input', (e) => { if (e.target.type === 'range' && !skip(e.target)) schedule(); });
  // слова: добавление и удаление чипов тоже сохраняем
  const add = document.getElementById('btnAddWord'); if (add) add.addEventListener('click', () => setTimeout(schedule, 0));
  const wi = document.getElementById('ttsWordInput'); if (wi) wi.addEventListener('keydown', (e) => { if (e.key === 'Enter') setTimeout(schedule, 0); });
  const chips = document.getElementById('ttsWordChips'); if (chips) chips.addEventListener('click', () => setTimeout(schedule, 0));
  const reset = document.getElementById('btnTtsReset'); if (reset) reset.addEventListener('click', () => mark('Сбрасываем…', 'busy'));
  setTimeout(() => { if (window.reloadTtsCatalog) window.reloadTtsCatalog(); }, 1500);

  // фильтр каталога
  const box = document.getElementById('ttsCatalog'), seg = document.getElementById('ttsCatEngine'), q = document.getElementById('ttsCatSearch'), cnt = document.getElementById('ttsCatCount');
  let eng = '';
  function filter() {
    if (!box) return;
    const s = (q && q.value || '').trim().toLowerCase();
    let shown = 0, total = 0;
    box.querySelectorAll('.ui3-voice').forEach((v) => { total++; const ok = (!eng || v.dataset.engine === eng) && (!s || v.dataset.search.includes(s)); v.hidden = !ok; if (ok) shown++; });
    let none = box.querySelector('.none');
    if (!shown && total) { if (!none) { none = document.createElement('div'); none.className = 'none'; none.textContent = 'Ничего не нашлось'; box.appendChild(none); } } else if (none) none.remove();
    if (cnt) cnt.textContent = total ? (shown === total ? total + ' голосов' : shown + ' из ' + total) : '';
  }
  if (seg) seg.addEventListener('click', (e) => { const b = e.target.closest('span[data-v]'); if (!b) return; eng = b.dataset.v; seg.querySelectorAll('span').forEach((x) => x.classList.toggle('on', x === b)); filter(); });
  if (q) q.addEventListener('input', filter);
  if (box) new MutationObserver(filter).observe(box, { childList: true });
})();

// ---------- Этап 2: Чат-бот — разделы, статус, счётчики ----------
(function () {
  'use strict';
  const sec = document.getElementById('tab-chatbot'); if (!sec) return;
  const tabs = document.getElementById('botTabs');
  const show = (id) => {
    tabs.querySelectorAll('span[data-pane]').forEach((t) => t.classList.toggle('on', t.dataset.pane === id));
    sec.querySelectorAll('.bot-pane').forEach((p) => { p.hidden = p.dataset.pane !== id; });
    try { localStorage.setItem('ov3BotPane', id); } catch (e) {}
  };
  tabs.addEventListener('click', (e) => { const t = e.target.closest('span[data-pane]'); if (t) show(t.dataset.pane); });
  sec.addEventListener('click', (e) => { const b = e.target.closest('[data-botpane]'); if (b) show(b.dataset.botpane); });
  let saved = null; try { saved = localStorage.getItem('ov3BotPane'); } catch (e) {}
  if (saved && sec.querySelector('.bot-pane[data-pane="' + saved + '"]')) show(saved);
  const nb = document.getElementById('ui3BotNewCmd');
  if (nb) nb.addEventListener('click', () => { show('cmd'); const b = document.getElementById('btnBotCommandAdd'); if (b) b.click(); setTimeout(() => { const i = document.getElementById('botCmdCommand'); if (i) i.focus(); }, 50); });
  // счётчики команд и таймеров
  const count = (id, out) => { const body = document.getElementById(id), o = document.getElementById(out); if (!body || !o) return; const upd = () => { const n = [...body.querySelectorAll('tr')].filter((tr) => !tr.querySelector('td[colspan]')).length; o.textContent = n ? String(n) : ''; }; new MutationObserver(upd).observe(body, { childList: true, subtree: true }); upd(); };
  count('botCommandsBody', 'botCntCmd'); count('botTimersBody', 'botCntTim');
  // статус бота справа — по кнопке-статусу из app.js
  const src = document.getElementById('btnChatBotAuthToggle');
  const ico = document.getElementById('botSideIco'), ttl = document.getElementById('botSideTitle'), sub = document.getElementById('botSideSub');
  const user = document.getElementById('chatBotUsername');
  function sync() {
    const st = src ? src.dataset.state : 'disconnected';
    const name = user && user.value ? user.value : 'Бот';
    ico.className = 'ui3-ico ' + (st === 'connected' ? 'ok' : st === 'connecting' ? 'warn' : '');
    ttl.textContent = st === 'connected' ? name + ' в чате' : st === 'connecting' ? 'Подключаемся…' : st === 'error' ? 'Ошибка подключения' : 'Бот не подключён';
    sub.textContent = st === 'connected' ? 'Отвечает на команды и шлёт таймеры' : st === 'error' ? ((src && src.title) || 'Проверь токен в «Подключение бота»') : 'Подключи бота, чтобы он отвечал в чате';
  }
  if (src) new MutationObserver(sync).observe(src, { attributes: true, attributeFilter: ['data-state', 'title'] });
  setTimeout(sync, 1500); sync();
})();

// ---------- Этап 2: Донаты — сводка, фильтр ленты, топ донатеров ----------
(function () {
  'use strict';
  const sec = document.getElementById('tab-donations'); if (!sec) return;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rub = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };
  const isRub = (d) => !d.currency || d.currency === 'RUB';
  let hist = [], goal = null, topDays = 7, plat = '';
  async function load() {
    try { hist = (await (await fetch('/api/donations/history')).json()).donations || []; } catch (e) {}
    try { goal = (await (await fetch('/api/goal')).json()).goal || null; } catch (e) {}
    render();
  }
  function render() {
    const now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const sum = (a) => a.filter(isRub).reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const today = hist.filter((d) => d.ts >= d0.getTime()), week = hist.filter((d) => now - d.ts < 7 * 864e5), prev = hist.filter((d) => now - d.ts >= 7 * 864e5 && now - d.ts < 14 * 864e5);
    const avg = week.length ? sum(week) / week.filter(isRub).length || 0 : 0;
    const diff = prev.length && sum(prev) ? Math.round((sum(week) / sum(prev) - 1) * 100) : null;
    const tile = (t, v, s, extra) => '<div class="ui3-stat" style="cursor:default"><div style="flex:1"><small>' + t + '</small><b style="font-size:22px">' + v + '</b>' + (extra || '') + '<span>' + s + '</span></div></div>';
    let g = '';
    if (goal && goal.target) { const p = Math.min(100, Math.round((goal.amount || 0) / goal.target * 100)); g = tile('Цель «' + esc(goal.title || 'Сбор') + '»', p + '%', rub(goal.amount) + ' из ' + rub(goal.target), '<div class="ui3-goalbar"><i style="width:' + p + '%"></i></div>'); }
    else g = tile('Цель сбора', '—', 'Не задана — вкладка «Алерты» → «Цель сбора»');
    document.getElementById('donStats').innerHTML =
      tile('Сегодня', rub(sum(today)), today.length + ' ' + plural(today.length, 'донат', 'доната', 'донатов')) +
      tile('За 7 дней', rub(sum(week)), week.length + ' ' + plural(week.length, 'донат', 'доната', 'донатов') + (diff != null ? ' · ' + (diff >= 0 ? '+' : '') + diff + '% к прошлой неделе' : '')) +
      tile('Средний донат', avg ? rub(avg) : '—', 'за 7 дней') + g;
    // топ
    const src = topDays ? hist.filter((d) => now - d.ts < topDays * 864e5) : hist;
    const by = new Map(); src.filter(isRub).forEach((d) => { const k = String(d.username || 'Аноним'); by.set(k, (by.get(k) || 0) + (Number(d.amount) || 0)); });
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    document.getElementById('donTop').innerHTML = top.length ? top.map(([n, a], i) => '<div class="ui3-row"><span class="rank">' + (i + 1) + '</span><div class="l"><b>' + esc(n) + '</b></div><span class="amt">' + rub(a) + '</span></div>').join('') : '<div class="ui3-empty">Пока никого</div>';
    filter();
  }
  function filter() {
    const q = (document.getElementById('donSearch').value || '').trim().toLowerCase();
    sec.querySelectorAll('.donation-item').forEach((it) => { it.hidden = !!((plat && it.dataset.platform !== plat) || (q && !it.textContent.toLowerCase().includes(q))); });
  }
  const seg = (id, fn) => { const el = document.getElementById(id); el.addEventListener('click', (e) => { const b = e.target.closest('span[data-v]'); if (!b) return; el.querySelectorAll('span').forEach((x) => x.classList.toggle('on', x === b)); fn(b.dataset.v); }); };
  seg('donFilter', (v) => { plat = v; filter(); });
  seg('donTopScope', (v) => { topDays = +v; render(); });
  document.getElementById('donSearch').addEventListener('input', filter);
  document.getElementById('ui3DonTest').addEventListener('click', async () => { await fetch('/api/donation-alert/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (window.ui3Toast) window.ui3Toast('Тестовый донат отправлен в оверлей (в историю не попадает)'); });
  window.ui3DonationsChanged = () => setTimeout(load, 300);
  const feed = document.getElementById('donationsFeed');
  if (feed) new MutationObserver(() => setTimeout(filter, 0)).observe(feed, { childList: true });
  document.querySelectorAll('.nav-item[data-tab="donations"]').forEach((n) => n.addEventListener('click', load));
  load();
})();

// ---------- Этап 3: общее автосохранение + Алерты, Чат, Стиль ----------
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  let loaded = false; setTimeout(() => { loaded = true; }, 2500); // пока app.js заполняет формы — не сохраняем

  /** Автосохранение: изменения внутри box → через 600 мс нажимается saveBtn; результат — по msg (form-message) в метку mark. */
  function autosave(box, saveBtn, msg, mark, skip) {
    if (!box || !saveBtn) return;
    saveBtn.classList.add('ui3-hide');
    let t = 0;
    const set = (txt, cls) => { if (mark) { mark.textContent = txt; mark.className = 'ui3-saved ' + (cls || ''); } };
    const go = () => { if (!loaded) return; clearTimeout(t); set('Сохраняем…', 'busy'); t = setTimeout(() => { if (saveBtn.disabled) { go(); return; } saveBtn.click(); }, 600); };
    box.addEventListener('change', (e) => { if (!skip || !skip(e.target)) go(); });
    box.addEventListener('input', (e) => { const ty = e.target.type; if ((ty === 'range' || ty === 'color') && (!skip || !skip(e.target))) go(); });
    if (msg) new MutationObserver(() => {
      if (/success/.test(msg.className) && /сохран/i.test(msg.textContent)) { set('Сохранено', 'ok'); msg.textContent = ''; msg.className = 'form-message'; }
      else if (/error/.test(msg.className)) set(msg.textContent || 'Не сохранилось', 'err');
    }).observe(msg, { childList: true, characterData: true, subtree: true, attributes: true });
  }
  window.ui3Autosave = autosave;

  /* --- Стиль --- */
  const st = document.getElementById('tab-settings');
  if (st) autosave(st, document.getElementById('btnThemeSave'), document.getElementById('themeFormMessage'), document.getElementById('themeSaved'),
    (el) => el.id === 'themePresetSelect' || el.id === 'fontUploadInput');

  /* --- Стиль: раскладка «темы и цвета | шрифты | предпросмотр» --- */
  (function () {
    if (!st) return;
    const cols = $('.settings-columns', st); if (!cols || cols.dataset.ui3) return;
    const cards = $$('.card', cols); if (cards.length < 5) return;
    cols.dataset.ui3 = '1';
    const [cColors, cOpac, cThemes, cFonts, cSize] = cards;
    const mk = () => { const d = document.createElement('div'); d.className = 'ui3-st-col'; return d; };
    const A = mk(), B = mk(), C = mk();
    // готовые темы — карточками; настоящий список (select) остаётся скрытым и работает как раньше
    const ttl = $('.section-title', cThemes); if (ttl) ttl.textContent = 'Готовые темы';
    const sel = document.getElementById('themePresetSelect');
    const fld = sel && sel.closest('.field'); if (fld) fld.classList.add('ui3-hide');
    const grid = document.createElement('div'); grid.className = 'ui3-themes';
    if (fld) fld.after(grid);
    let themes = [];
    const draw = () => {
      grid.innerHTML = themes.map((t) => {
        const c = (t.params && t.params.colors) || {};
        return '<button type="button" class="ui3-theme' + (sel && sel.value === t.id ? ' on' : '') + '" data-id="' + t.id + '"><span class="sw" style="background:linear-gradient(135deg,' + (c.panelBg || '#141419') + ' 45%,' + (c.accent || '#B14846') + ')"></span><span class="nm">' + String(t.name).replace(/[<>&]/g, '') + '</span></button>';
      }).join('');
    };
    fetch('/api/themes').then((r) => r.json()).then((d) => { themes = d.themes || []; draw(); }).catch(() => {});
    grid.addEventListener('click', (e) => { const b = e.target.closest('.ui3-theme'); if (!b || !sel) return; sel.value = b.dataset.id; sel.dispatchEvent(new Event('change', { bubbles: true })); draw(); });
    if (sel) { sel.addEventListener('change', draw); new MutationObserver(draw).observe(sel, { childList: true }); setInterval(draw, 2500); }
    // предпросмотр: настоящий оверлей в уменьшенном виде
    C.innerHTML = '<div class="card ui3-st-prev"><div class="ch"><h3>Предпросмотр</h3><span class="ui3-st-note">Оверлей в реальном времени</span></div><div class="ui3-st-box"><iframe src="/overlay.html" title="Предпросмотр оверлея" tabindex="-1"></iframe></div><p class="card-hint">Цвета, шрифты и размеры применяются сразу. Чтобы увидеть виджеты с данными, включи «Демо-стрим» на вкладке «Сцена».</p></div>';
    const box = $('.ui3-st-box', C), fr = $('iframe', C);
    const fit = () => { const k = box.clientWidth / 1920; fr.style.transform = 'scale(' + k + ')'; box.style.height = (1080 * k) + 'px'; };
    new ResizeObserver(fit).observe(box); fit();
    A.append(cThemes, cColors, cOpac); B.append(cFonts, cSize);
    cols.replaceChildren(A, B, C);
  })();

  /* --- Алерты --- */
  const al = document.getElementById('tab-donalerts');
  if (al) {
    const mark = document.getElementById('daSaved');
    // донат
    autosave(document.getElementById('daCfgCard'), document.getElementById('btnDaSave'), document.getElementById('daMessage'), mark);
    // события (подписки, рейд, фоллоу, Hype Train, баллы) — карточки строит app.js
    const wire = () => $$('.da-evpane', al).forEach((p) => {
      if (p.dataset.ui3) return;
      const card = $('[data-a="cfgcard"]', p), save = $('[data-a="save"]', p), msg = $('[data-a="msg"]', p);
      if (!card || !save) return;
      p.dataset.ui3 = '1';
      autosave(card, save, msg, mark, (el) => el.closest('.ev-test, [data-a="testbox"]'));
    });
    wire(); setTimeout(wire, 1500); setTimeout(wire, 4000);
    // цель сбора (сумма меняется отдельной кнопкой)
    const gs = document.getElementById('btnGoalSave');
    if (gs) autosave(gs.closest('.card'), gs, document.getElementById('goalMessage'), mark, (el) => el.id === 'goalAmount');
    // настройки алерта открыты сразу, а не за кнопкой-шестерёнкой
    setTimeout(() => {
      const c = document.getElementById('daCfgCard'), b = document.getElementById('btnDaCfg');
      if (c && c.hidden && b) b.click();
      $$('.da-evpane', al).forEach((p) => { const cc = $('[data-a="cfgcard"]', p), cb = $('[data-a="cfg"]', p); if (cc && cc.hidden && cb) cb.click(); });
      document.getElementById('tab-donalerts').scrollTop = 0;
      const content = document.querySelector('.content'); if (content && !document.getElementById('tab-donalerts').classList.contains('active')) content.scrollTop = 0;
    }, 1800);
    // раскладка как в макете: слева список алертов с переключателями, посередине настройки, справа предпросмотр и тест
    (function () {
      const sub = $('.pixel-subtabs', al); if (!sub || $('.da-shell', al)) return;
      const IC = {
        heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
        target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
        star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
        users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5a3 3 0 010 6M18 14c2 .6 3.5 2.6 3.5 5"/>',
        user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
        train: '<rect x="5" y="3.5" width="14" height="13" rx="2.5"/><path d="M5 10.5h14M8 20l2-3.5M16 20l-2-3.5"/><circle cx="9" cy="13.5" r=".6"/><circle cx="15" cy="13.5" r=".6"/>',
        coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.6h3.4a1.6 1.6 0 010 3.2h-1.8a1.6 1.6 0 000 3.2H15"/>',
        music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
        flame: '<path d="M12 3c.5 3-1.6 4.6-3.2 6.6C7.4 11.3 7 12.6 7 14a5 5 0 0010 0c0-1.8-.8-3.1-1.7-4.2-.3 1-.9 1.6-1.6 1.9.6-3-.2-6.2-1.7-8.7z"/>',
      };
      const gv = (id) => { const e = document.getElementById(id); return e ? Number(e.value) : 0; };
      const NAV = [
        ['donation', 'heart', 'Донат', () => (gv('da_minAmount') > 0 ? 'от ' + gv('da_minAmount') + ' ₽' : 'любая сумма'), 'da_enabled'],
        ['goal', 'target', 'Цель сбора', () => 'при каждом взносе', 'goalEnabled'],
        ['sub', 'star', 'Подписка', () => 'и подарочные', 'ev_sub_enabled'],
        ['raid', 'users', 'Рейд', () => (gv('ev_raid_minViewers') > 0 ? 'от ' + gv('ev_raid_minViewers') + ' зр.' : 'любой рейд'), 'ev_raid_enabled'],
        ['follow', 'user', 'Фоллоу', () => 'новые фолловеры', 'ev_follow_enabled'],
        ['hype', 'train', 'Hype Train', () => 'начало, уровни, финал', 'ev_hype_enabled'],
        ['points', 'coin', 'Баллы канала', () => 'выбранные награды', 'ev_points_enabled'],
        ['nowplaying', 'music', 'Сейчас играет', () => 'видео и музыка с ПК', 'ev_nowplaying_enabled'],
        ['streak', 'flame', 'Серия просмотров', () => (gv('ev_streak_minStreak') > 1 ? 'от ' + gv('ev_streak_minStreak') + ' стримов' : 'любая серия'), 'ev_streak_enabled'],
      ];
      const shell = document.createElement('div'); shell.className = 'da-shell';
      const nav = document.createElement('div'); nav.className = 'card da-nav';
      const body = document.createElement('div'); body.className = 'da-body';
      sub.after(shell); shell.append(nav, body);
      $$('.da-pane', al).forEach((p) => body.appendChild(p));
      nav.innerHTML = NAV.map(([id, ic, t]) => `<div class="da-nav-it" data-p="${id}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${IC[ic]}</svg><div class="tx"><div class="t">${t}</div><div class="d"></div></div><label class="toggle-switch"><input type="checkbox" disabled><span class="toggle-slider"></span></label></div>`).join('');
      const kick = (id) => setTimeout(() => {
        const pane = $('.da-pane[data-da-pane="' + id + '"]', al); if (!pane) return;
        const b = id === 'donation' ? document.getElementById('btnDaPrevPlay') : id === 'goal' ? document.getElementById('btnGoalTestDonation') : $('[data-a="play"]', pane);
        if (b) b.click();
      }, 450);
      $$('.da-nav-it', nav).forEach((it) => {
        it.addEventListener('click', (e) => {
          if (e.target.closest('.toggle-switch')) return;
          const b = $('.pixel-subtab[data-da-pane="' + it.dataset.p + '"]', al); if (b) { b.click(); sync(); kick(it.dataset.p); }
        });
        const inp = $('input', it);
        inp.addEventListener('change', () => {
          const real = document.getElementById(NAV.find((n) => n[0] === it.dataset.p)[4]); if (!real) return;
          real.checked = inp.checked; real.dispatchEvent(new Event('change', { bubbles: true })); sync();
        });
      });
      function sync() {
        if (!al.classList.contains('active')) return;
        $$('.da-nav-it', nav).forEach((it) => {
          const n = NAV.find((x) => x[0] === it.dataset.p), real = document.getElementById(n[4]), inp = $('input', it);
          const tab = $('.pixel-subtab[data-da-pane="' + n[0] + '"]', al);
          it.classList.toggle('on', !!(tab && tab.classList.contains('active')));
          $('.d', it).textContent = n[3]();
          if (real) { inp.disabled = false; if (inp.checked !== real.checked) inp.checked = real.checked; } else inp.disabled = true;
        });
      }
      setInterval(sync, 700); sync();
      // каждая панель: справа карточка «Предпросмотр» (картинка, кнопки, тест); настройки раскрыты сразу
      const layout = () => $$('.da-pane', al).forEach((p) => {
        if (p.dataset.ui3l) return;
        const lay = $('.da-layout', p), side = $('.da-side', p), main = $('.da-main', p), mid = $('.da-mid', p);
        if (!lay || !side) return;
        p.dataset.ui3l = '1';
        const right = document.createElement('div'); right.className = 'card da-right';
        right.innerHTML = '<div class="ch"><h3>Предпросмотр</h3></div>';
        right.appendChild(side); if (mid && main) right.appendChild(main);
        lay.appendChild(right);
        const cc = $('#daCfgCard', p) || $('[data-a="cfgcard"]', p); if (cc) cc.hidden = false;
        $$('#btnDaCfg, [data-a="cfg"]', p).forEach((b) => { b.classList.add('ui3-hide'); });
        $$('.da-group', p).forEach((g) => { g.open = true; g.addEventListener('toggle', () => { g.open = true; }); });
      });
      layout(); setTimeout(layout, 600); setTimeout(layout, 1800); setTimeout(layout, 4000);
    })();
    // подписи под иконками предпросмотра
    const label = () => $$('.dbtn', al).forEach((b) => {
      if (b.querySelector('.dlab')) return;
      const tip = (b.dataset.tip || b.title || '').split('\n')[0].replace(/^Скопировать ссылку для OBS$/, 'Ссылка OBS').replace('Привязка к теме оверлея', 'Как тема').replace('Озвучка алерта', 'Озвучка').replace('Печать текста', 'Печать').replace('Шрифт алерта', 'Шрифт').replace('Настройки алерта', 'Настройки');
      const s = document.createElement('span'); s.className = 'dlab'; s.textContent = tip; b.appendChild(s);
    });
    label(); setTimeout(label, 1500); setTimeout(label, 4000);
    const ob = $('[data-copy-alerts]');
    if (ob) ob.addEventListener('click', async () => { const u = location.origin + '/overlay.html?only=donation'; try { await navigator.clipboard.writeText(u); } catch (e) {} if (window.ui3Toast) window.ui3Toast('Ссылка на алерты скопирована'); });
  }

  /* --- Чат: подписи на кнопках «+» --- */
  [['btnToggleCreatePrediction', 'Новая ставка'], ['btnToggleCreatePoll', 'Новый опрос']].forEach(([id, txt]) => {
    const b = document.getElementById(id); if (!b) return;
    b.classList.add('ui3-addbtn'); b.innerHTML = '<span class="a">+ ' + txt + '</span><span class="c">Закрыть</span>';
  });
})();

// ---------- Свои окна вместо confirm / alert / prompt браузера ----------
(function () {
  'use strict';
  const ov = document.createElement('div');
  ov.className = 'ui3-dlg-ov';
  ov.innerHTML = '<div class="ui3-dlg" role="dialog" aria-modal="true"><div class="ui3-dlg-text"></div><input class="ui3-dlg-in" type="password" autocomplete="off"><div class="ui3-dlg-act"><button class="btn btn-ghost" type="button" data-r="0">Отмена</button><button class="btn btn-primary" type="button" data-r="1">ОК</button></div></div>';
  document.body.appendChild(ov);
  const text = ov.querySelector('.ui3-dlg-text'), inp = ov.querySelector('.ui3-dlg-in'), ok = ov.querySelector('[data-r="1"]'), no = ov.querySelector('[data-r="0"]');
  let done = null;
  function open(kind, msg) {
    if (done) done(kind === 'prompt' ? null : false);
    const parts = String(msg || '').split('\n\n');
    text.innerHTML = '';
    parts.forEach((p, i) => { const el = document.createElement(i === 0 ? 'b' : 'p'); el.textContent = p; text.appendChild(el); });
    inp.style.display = kind === 'prompt' ? '' : 'none'; inp.value = '';
    no.style.display = kind === 'alert' ? 'none' : '';
    const danger = kind === 'confirm' && /удал|стер|сброс|очист|обнул|необратим/i.test(msg);
    ok.textContent = kind === 'alert' ? 'Понятно' : danger ? (/удал/i.test(msg) ? 'Удалить' : /сброс|обнул/i.test(msg) ? 'Сбросить' : 'Да, очистить') : 'Да';
    ok.classList.toggle('ui3-danger', danger);
    ov.classList.add('open');
    setTimeout(() => (kind === 'prompt' ? inp : ok).focus(), 20);
    return new Promise((res) => { done = (v) => { done = null; ov.classList.remove('open'); res(v); }; ov.dataset.kind = kind; });
  }
  const finish = (yes) => { if (!done) return; const k = ov.dataset.kind; done(k === 'prompt' ? (yes ? inp.value : null) : k === 'alert' ? true : yes); };
  ok.addEventListener('click', () => finish(true));
  no.addEventListener('click', () => finish(false));
  ov.addEventListener('click', (e) => { if (e.target === ov) finish(false); });
  document.addEventListener('keydown', (e) => { if (!ov.classList.contains('open')) return; if (e.key === 'Escape') { e.stopPropagation(); finish(false); } if (e.key === 'Enter') { e.preventDefault(); finish(true); } }, true);
  window.ui3Confirm = (m) => open('confirm', m);
  window.ui3Alert = (m) => open('alert', m);
  window.ui3Prompt = (m) => open('prompt', m);
})();

// ---------- Сцена: подписи у кнопок панели ----------
(function () {
  'use strict';
  const L = { btnAutoRecord: 'Автозапись', btnReplayStart: 'Повтор', btnStreamReset: 'Новый стрим', btnLayoutResetAll: 'Сбросить всё', btnFakeMode: 'Демо-стрим', btnWidgetsWide: 'На весь экран', btnGridPop: 'Сетка', btnCopyOverlayWidgetUrl: 'Ссылка OBS', btnStylePop: 'Стиль' };
  Object.keys(L).forEach((id) => { const b = document.getElementById(id); if (!b || b.querySelector('.wtl')) return; const s = document.createElement('span'); s.className = 'wtl'; s.textContent = L[id]; b.appendChild(s); });
})();
