// guides.js — гайды по вкладкам (кнопка «?») + замок на вкладки «Ивент» и «ЧатАватары».
(function () {
  'use strict';
  const GUIDES = window.OVERLAY_GUIDES || {};
  const LOCKED = ['event', 'chatavatars', 'twitchext', 'extras'];
  const HIDE_KEY = 'guideHidden_v1';
  const LOCK_KEY = 'tabLockToken_v1';
  const origin = location.origin;

  const $ = (s, r) => (r || document).querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const hiddenMap = () => { try { return JSON.parse(store.get(HIDE_KEY) || '{}'); } catch (e) { return {}; } };
  const sessionSeen = new Set();

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function inline(s) {
    return esc(String(s).replace(/\{ORIGIN\}/g, origin))
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`(.+?)`/g, '<code class="guide-copy" title="Клик — скопировать">$1</code>');
  }

  /* ---------- модальное окно гайда ---------- */
  const ov = document.createElement('div');
  ov.className = 'help-modal-overlay guide-overlay';
  ov.innerHTML = '<div class="help-modal guide-modal"><div class="help-modal-header"><h2 id="guideTitle"></h2>' +
    '<button class="help-modal-close" id="guideClose" type="button" title="Закрыть">✕</button></div>' +
    '<div class="guide-body" id="guideBody"></div>' +
    '<div class="help-modal-actions guide-actions"><button class="btn btn-primary" id="guideOk" type="button">Понятно</button>' +
    '<button class="btn btn-secondary" id="guideNever" type="button">Больше не показывать</button>' +
    '<button class="btn btn-secondary" id="guideTips" type="button" style="display:none">Показать подсказки</button></div></div>';
  document.body.appendChild(ov);
  const body = $('#guideBody', ov);
  let openFor = null;

  function mock(m) {
    return '<div class="guide-mock"><div class="guide-mock-bar">' + esc(m.title) + '</div>' + m.rows.map((r) =>
      '<div class="guide-mock-row"><label>' + esc(r[0]) + '</label><div class="guide-mock-val">' + esc(String(r[1]).replace(/\{ORIGIN\}/g, origin)) + '</div>' +
      (r[2] ? '<em>← ' + esc(r[2]) + '</em>' : '') + '</div>').join('') + '</div>';
  }

  function render(g) {
    let html = '<p class="guide-intro">' + inline(g.intro || '') + '</p>';
    g.blocks.forEach((b) => {
      if (b.h) html += '<h3>' + inline(b.h) + '</h3>';
      else if (b.p) html += '<p>' + inline(b.p) + '</p>';
      else if (b.steps) html += '<ol>' + b.steps.map((s) => '<li>' + inline(s) + '</li>').join('') + '</ol>';
      else if (b.ex) html += '<pre class="guide-ex guide-copy" title="Клик — скопировать">' + esc(b.ex.replace(/\{ORIGIN\}/g, origin)) + '</pre>';
      else if (b.tip) html += '<div class="guide-tip">💡 ' + inline(b.tip) + '</div>';
      else if (b.how) html += '<details class="guide-how"><summary>' + inline(b.how.label) + '</summary><div class="guide-how-body"><ol>' +
        b.how.steps.map((x) => '<li>' + inline(x) + '</li>').join('') + '</ol>' + (b.how.mock ? mock(b.how.mock) : '') + '</div></details>';
      else if (b.comp) html += '<div class="guide-comp">' + b.comp.map((r) => '<div><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span><p>' + inline(r[2]) + '</p></div>').join('') + '</div>';
      else if (b.link) html += '<p><a class="guide-link" href="' + esc(b.link.url) + '" target="_blank" rel="noopener">' + esc(b.link.text) + ' ↗</a></p>';
    });
    return html;
  }

  function openGuide(tab, auto) {
    const g = GUIDES[tab];
    if (!g) return;
    openFor = tab;
    $('#guideTitle').textContent = (auto ? '👋 ' : '? ') + g.title;
    body.innerHTML = render(g);
    body.scrollTop = 0;
    $('#guideNever').style.display = hiddenMap()[tab] ? 'none' : '';
    $('#guideTips').style.display = window.OvTips && window.OvTips.has(tab) ? '' : 'none';
    ov.classList.add('open');
  }
  function closeGuide() { ov.classList.remove('open'); if (openFor) sessionSeen.add(openFor); openFor = null; }

  body.addEventListener('click', (e) => {
    const el = e.target.closest('.guide-copy');
    if (!el) return;
    const txt = el.textContent;
    const done = () => { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 900); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => {});
  });
  $('#guideClose', ov).addEventListener('click', closeGuide);
  $('#guideOk', ov).addEventListener('click', closeGuide);
  $('#guideTips', ov).addEventListener('click', () => { const t = openFor; closeGuide(); if (t && window.OvTips) window.OvTips.open(t); });
  $('#guideNever', ov).addEventListener('click', () => {
    if (openFor) { const m = hiddenMap(); m[openFor] = 1; store.set(HIDE_KEY, JSON.stringify(m)); }
    closeGuide();
  });
  ov.addEventListener('click', (e) => { if (e.target === ov) closeGuide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (ov.classList.contains('open')) closeGuide(); else if (lockOv.classList.contains('open')) closeLock(); } });

  const activeTab = () => { const a = $('.nav-item.active'); if (a) return a.dataset.tab; const s = $('.tab-section.active'); return s ? s.id.replace('tab-', '') : 'auth'; };
  const fab = document.getElementById('helpFab');
  if (fab) fab.addEventListener('click', () => openGuide(activeTab(), false));

  /* ---------- замок ---------- */
  let unlocked = false;
  const lockOv = document.createElement('div');
  lockOv.className = 'help-modal-overlay';
  lockOv.innerHTML = '<div class="help-modal lock-modal"><div class="help-modal-header"><h2>🔒 Вкладка закрыта</h2>' +
    '<button class="help-modal-close" id="lockClose" type="button" title="Закрыть">✕</button></div>' +
    '<p class="card-hint" id="lockWhat" style="margin:0 0 12px"></p>' +
    '<input type="password" id="lockPass" class="lock-pass" placeholder="Пароль" autocomplete="off">' +
    '<div class="help-modal-actions"><button class="btn btn-primary" id="lockGo" type="button">Открыть</button>' +
    '<span class="form-message" id="lockMsg"></span></div></div>';
  document.body.appendChild(lockOv);
  let wantTab = null;
  const lockPass = $('#lockPass', lockOv), lockMsg = $('#lockMsg', lockOv);

  function closeLock() { lockOv.classList.remove('open'); wantTab = null; }
  function askPassword(tab) {
    wantTab = tab;
    const nav = $('.nav-item[data-tab="' + tab + '"] span');
    $('#lockWhat', lockOv).textContent = 'Для вкладки «' + (nav ? nav.textContent : tab) + '» нужен пароль.';
    lockPass.value = ''; lockMsg.textContent = ''; lockMsg.className = 'form-message';
    lockOv.classList.add('open');
    setTimeout(() => lockPass.focus(), 30);
  }
  async function tryUnlock() {
    lockMsg.textContent = 'Проверяем…'; lockMsg.className = 'form-message';
    try {
      const r = await fetch('/api/lock/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: lockPass.value }) });
      const d = await r.json();
      if (d.success) {
        store.set(LOCK_KEY, d.token); unlocked = true; refreshLockUi();
        const t = wantTab; closeLock();
        const item = t && $('.nav-item[data-tab="' + t + '"]');
        if (item) item.click();
      } else { lockMsg.textContent = d.error || 'Неверный пароль.'; lockMsg.className = 'form-message error'; lockPass.select(); }
    } catch (e) { lockMsg.textContent = 'Сетевая ошибка.'; lockMsg.className = 'form-message error'; }
  }
  $('#lockGo', lockOv).addEventListener('click', tryUnlock);
  lockPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  $('#lockClose', lockOv).addEventListener('click', closeLock);
  lockOv.addEventListener('click', (e) => { if (e.target === lockOv) closeLock(); });

  function refreshLockUi() {
    syncBotAvTab();
    document.querySelectorAll('.dev-hidden, .dev-shown').forEach((el) => { el.classList.toggle('dev-hidden', !unlocked); el.classList.toggle('dev-shown', unlocked); });
    devPaint();
    LOCKED.forEach((t) => {
      const item = $('.nav-item[data-tab="' + t + '"]');
      if (!item) return;
      item.classList.toggle('tab-locked', !unlocked);
      let ic = $('.lock-ico', item);
      if (!ic) { ic = document.createElement('i'); ic.className = 'lock-ico'; item.appendChild(ic); }
      ic.textContent = unlocked ? '' : '🔒';
      // кнопка «Заблокировать» в шапке вкладки
      const sec = document.getElementById('tab-' + t);
      let btn = sec && $('.relock-btn', sec);
      if (sec && !btn) {
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn-tiny relock-btn'; btn.textContent = '🔒 Заблокировать';
        btn.addEventListener('click', relock);
        sec.insertBefore(btn, sec.firstChild);
      }
      if (btn) btn.style.display = unlocked ? '' : 'none';
    });
  }
  // «Команды аватаров» в чат-боте зависят от чат-аватаров: пока вкладка закрыта паролем, пункт скрыт
  function syncBotAvTab() {
    const tab = $('#botTabs [data-pane="av"]'); if (!tab) return;
    tab.hidden = !unlocked; tab.style.display = unlocked ? '' : 'none';
    if (!unlocked) {
      const pane = $('#tab-chatbot .bot-pane[data-pane="av"]'); if (pane) pane.hidden = true;
      if (tab.classList.contains('on')) { const c = $('#botTabs [data-pane="cmd"]'); if (c) c.click(); }
    }
  }
  /* ---------- режим разработчика (тот же пароль, что и у замка) ---------- */
  const devOffBox = document.getElementById('devOff'), devOnBox = document.getElementById('devOn'), devMsg = document.getElementById('devMsg'), devPass = document.getElementById('devPass');
  function devPaint() { if (!devOffBox) return; devOffBox.style.display = unlocked ? 'none' : ''; devOnBox.style.display = unlocked ? '' : 'none'; }
  const devSay = (t, bad) => { if (devMsg) { devMsg.textContent = t; devMsg.className = 'form-message' + (bad ? ' error' : t ? ' success' : ''); } };
  async function devEnable() {
    devSay('Проверяем…');
    try {
      const r = await fetch('/api/lock/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: devPass.value }) });
      const d = await r.json();
      if (d.success) { store.set(LOCK_KEY, d.token); unlocked = true; devPass.value = ''; refreshLockUi(); devSay('Режим разработчика включён. Вкладки появились слева.'); }
      else { devSay(d.error || 'Неверный пароль.', true); devPass.select(); }
    } catch (e) { devSay('Сетевая ошибка.', true); }
  }
  if (devOffBox) {
    document.getElementById('btnDevOn').addEventListener('click', devEnable);
    devPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') devEnable(); });
    document.getElementById('btnDevOff').addEventListener('click', () => { relock(); devSay('Режим выключен, вкладки скрыты.'); });
  }

  function relock() {
    store.del(LOCK_KEY); unlocked = false; refreshLockUi();
    if (LOCKED.includes(activeTab())) gotoSafe();
  }
  function gotoSafe() { const a = $('.nav-item[data-tab="home"]'); if (a) a.click(); }

  // перехват клика по закрытой вкладке до обработчиков app.js
  const sidebar = $('.sidebar');
  if (sidebar) sidebar.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (!item || unlocked || !LOCKED.includes(item.dataset.tab)) return;
    e.stopPropagation(); e.preventDefault();
    askPassword(item.dataset.tab);
  }, true);

  // если закрытая вкладка оказалась активной другим путём (сохранённая вкладка, ?tab=, кнопка-ссылка)
  let ready = false;
  function guard() {
    if (!ready) return false;
    const t = activeTab();
    if (!unlocked && LOCKED.includes(t)) { gotoSafe(); askPassword(t); return true; }
    return false;
  }

  /* ---------- автопоказ гайда при первом открытии ---------- */
  function maybeAutoGuide() {
    if (!ready) return;
    const t = activeTab();
    if (guard()) return;
    if (!GUIDES[t] || hiddenMap()[t] || sessionSeen.has(t) || ov.classList.contains('open') || lockOv.classList.contains('open')) return;
    if (window.OvTips && window.OvTips.auto(t)) return; // у вкладки есть анимированные подсказки, они показываются вместо гайда
    openGuide(t, true);
  }
  const nav = $('.sidebar');
  if (nav) new MutationObserver(() => maybeAutoGuide()).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });

  async function init() {
    const tok = store.get(LOCK_KEY);
    if (tok) {
      try {
        const r = await fetch('/api/lock/status', { headers: { 'X-Lock-Token': tok } });
        unlocked = !!(await r.json()).unlocked;
        if (!unlocked) store.del(LOCK_KEY);
      } catch (e) { unlocked = false; }
    }
    ready = true;
    refreshLockUi();
    setTimeout(maybeAutoGuide, 300);
  }
  init();
})();
