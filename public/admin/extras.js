// extras.js — вкладка «Доп. функционал»: вечерний выпуск (афиша с титрами, газета, эфир).
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const sec = $('#tab-extras');
  if (!sec) return;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища — просто не запомнится */ } } };
  const api = (path, opt) => fetch(path, opt).then((r) => r.json());
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const origin = location.origin;
  let settings = null, saveT = 0, framesOn = false;

  // --- OBS-ссылки и копирование ---
  $$('[data-url]', sec).forEach((i) => { i.value = origin + '/' + i.dataset.url; });
  $$('[data-copy]', sec).forEach((b) => b.addEventListener('click', () => {
    const inp = b.parentElement.querySelector('input'); inp.select();
    const t = b.dataset.t || b.textContent; b.dataset.t = t;
    const say = (m) => { b.textContent = m; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = t; }, 1800); };
    navigator.clipboard.writeText(inp.value).then(() => say('Скопировано'), () => { inp.select(); say('Ctrl+C — выделено'); });
  }));

  // --- источник данных (текущий стрим / тест-вечер) ---
  const src = $('#exSrc');
  src.value = store.get('exSrc') || '';
  if (![...src.options].some((o) => o.value === src.value)) src.value = '';
  src.addEventListener('change', () => { store.set('exSrc', src.value); loadFrames(true); });

  // --- предпросмотры живут только пока вкладка открыта ---
  function loadFrames(force) {
    $$('iframe[data-page]', sec).forEach((f) => {
      const url = '/' + f.dataset.page + '.html?preview=1' + (src.value ? '&demo=' + src.value : '');
      if (force || !f.getAttribute('src')) f.src = url;
    });
    framesOn = true;
  }
  function unloadFrames() { $$('iframe[data-page]', sec).forEach((f) => { f.removeAttribute('src'); }); framesOn = false; }
  const active = () => sec.classList.contains('active');
  new MutationObserver(() => { if (active()) { if (!framesOn) { loadFrames(true); refresh(); } } else if (framesOn) unloadFrames(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });

  // --- карточки раскрываются по клику на шапку ---
  $$('.ex-card', sec).forEach((card) => {
    const head = $('.ex-head', card);
    const toggle = () => { const on = card.classList.toggle('open'); head.setAttribute('aria-expanded', on ? 'true' : 'false'); store.set('exOpen_' + card.dataset.fmt, on ? '1' : ''); };
    if (store.get('exOpen_' + card.dataset.fmt) === '1') { card.classList.add('open'); head.setAttribute('aria-expanded', 'true'); }
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  // --- кнопки ---
  $$('.ex-card', sec).forEach((card) => {
    const fmt = card.dataset.fmt;
    $$('[data-act]', card).forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      try {
        if (act === 'show') await post('/api/gazette/show', { format: fmt, demo: src.value || null });
        else if (act === 'hide') await post('/api/gazette/hide');
        else if (act === 'pulse') await post('/api/gazette/pulse', { demo: src.value || null });
        refresh();
      } catch (e) { /* сервер недоступен */ }
    }));
  });

  // --- статус журнала и «сейчас на экране» ---
  async function refresh() {
    if (!active()) return;
    try {
      const [j, st] = await Promise.all([api('/api/gazette/journal'), api('/api/gazette/state')]);
      const pl = (n, f) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? f[0] : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? f[1] : f[2]; };
      $('#exJournal').textContent = j.enabled
        ? `${j.chat} ${pl(j.chat, ['сообщение', 'сообщения', 'сообщений'])} · ${j.events} ${pl(j.events, ['событие', 'события', 'событий'])} · с начала ${j.minutes} мин`
        : 'журнал чата выключен: тексты сообщений не записываются';
      ['credits', 'gazette'].forEach((f) => { const n = $(`[data-now="${f}"]`, sec); const on = st.screen.format === f; n.textContent = on ? '● на экране' : ''; });
    } catch (e) { /* ждём */ }
  }
  setInterval(refresh, 4000);

  // --- настройки ---
  const F = {
    studio: $('#exStudio'), hold: $('#exHold'), ghost: $('#exGhost'), wall: $('#exWall'), jr: $('#exJournalOn'),
    vol: $('#exVol'), sfxVol: $('#exSfxVol'), type: $('#exType'), title: $('#exTitle'), covers: $('#exCovers'), fade: $('#exFade'), sfx: $('#exSfx'), ticker: $('#exOaTicker'), plate: $('#exOaPlate'), bug: $('#exOaBug'), int: $('#exOaInt'), sec: $('#exOaSec'),
  };
  let amb = 'off';
  const SND = window.CreditsSound;
  const ambName = (k) => (SND && (SND.LIST.find((x) => x.key === k) || {}).name) || 'выкл';
  function ambLabel() { const n = $('#exAmbName'); if (n) n.textContent = ambName(amb); }
  function fill(s) {
    settings = s;
    F.studio.value = s.studioName; F.hold.value = s.creditsHoldSec; F.ghost.checked = s.ghostChat; F.wall.checked = s.wallNames; F.jr.checked = s.journalEnabled;
    F.ticker.checked = s.onair.ticker; F.plate.checked = s.onair.plate; F.bug.checked = s.onair.bug; F.int.value = s.onair.intervalMin; F.sec.value = s.onair.plateSec;
    $$('#exSpeed button', sec).forEach((b) => b.classList.toggle('on', b.dataset.v === s.creditsSpeed));
    amb = s.creditsAmbient || 'off'; F.vol.value = s.creditsVolume; $('#exVolV').textContent = s.creditsVolume; F.fade.value = s.creditsFadeIn; F.sfx.checked = !!s.creditsSfx; F.sfxVol.value = s.creditsSfxVolume; $('#exSfxVolV').textContent = s.creditsSfxVolume; F.type.value = s.creditsTypeSound; F.title.value = s.creditsTitleSound; F.covers.value = s.creditsCovers; ambLabel();
  }
  function collect() {
    return {
      studioName: F.studio.value, journalEnabled: F.jr.checked, creditsSpeed: ($('#exSpeed button.on', sec) || {}).dataset ? $('#exSpeed button.on', sec).dataset.v : 'normal',
      creditsHoldSec: +F.hold.value || 0, ghostChat: F.ghost.checked, wallNames: F.wall.checked,
      creditsAmbient: amb, creditsVolume: +F.vol.value, creditsFadeIn: +F.fade.value || 0, creditsSfx: F.sfx.checked, creditsSfxVolume: +F.sfxVol.value, creditsTypeSound: F.type.value, creditsTitleSound: F.title.value, creditsCovers: F.covers.value,
      onair: { ticker: F.ticker.checked, plate: F.plate.checked, bug: F.bug.checked, intervalMin: +F.int.value || 15, plateSec: +F.sec.value || 20 },
    };
  }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      try {
        const r = await post('/api/gazette/settings', collect());
        if (r.success) { fill(r.settings); const m = $('#exSaved'); m.textContent = 'Сохранено'; setTimeout(() => { m.textContent = ''; }, 1500); if (framesOn) loadFrames(true); }
      } catch (e) { /* не сохранилось — повторится при следующем изменении */ }
    }, 450);
  }
  Object.values(F).forEach((i) => i.addEventListener(i.type === 'checkbox' ? 'change' : 'input', save));
  F.sfxVol.addEventListener('input', () => { $('#exSfxVolV').textContent = F.sfxVol.value; });
  F.vol.addEventListener('input', () => { $('#exVolV').textContent = F.vol.value; if (eng) eng.setLevel(F.vol.value / 100); });

  // --- выбор фонового эмбиента с прослушиванием ---
  let eng = null, listening = '';
  const ov = $('#exAmbOv'), list = $('#exAmbList');
  function ambDraw() {
    if (!SND) { list.innerHTML = '<p class="ex-sm">Звук в этом браузере недоступен.</p>'; return; }
    const row = (k, n, h) => '<div class="ex-amb-row' + (amb === k ? ' sel' : '') + '" data-k="' + k + '">' +
      (k === 'off' ? '<span class="ex-amb-sp"></span>' : '<button type="button" class="ex-amb-play' + (listening === k ? ' on' : '') + '" data-play="' + k + '" aria-label="Слушать">' + (listening === k ? '■' : '▶') + '</button>') +
      '<div class="ex-amb-t"><b>' + n + '</b><small>' + h + '</small></div><button type="button" class="btn btn-tiny ex-amb-pick" data-pick="' + k + '">' + (amb === k ? 'Выбрано' : 'Выбрать') + '</button></div>';
    list.innerHTML = row('off', 'Без звука', 'афиша играет молча') + SND.LIST.map((x) => row(x.key, x.name, x.hint)).join('');
  }
  function ambStop() { if (eng) eng.stopAmbient(0.5); listening = ''; }
  function ambClose() { ambStop(); ov.hidden = true; }
  $('#exAmbBtn').addEventListener('click', () => { ambDraw(); ov.hidden = false; });
  $('#exAmbX').addEventListener('click', ambClose);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) ambClose(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) ambClose(); });
  list.addEventListener('click', (e) => {
    const pl = e.target.closest('[data-play]'), pk = e.target.closest('[data-pick]');
    if (pl) {
      const k = pl.dataset.play;
      if (listening === k) { ambStop(); } else {
        eng = eng || SND.create(); eng.setLevel(F.vol.value / 100);
        listening = eng.startAmbient(k, { volume: F.vol.value / 100, fadeIn: 0.8, crossfade: true }) ? k : '';
      }
      ambDraw();
    } else if (pk) { amb = pk.dataset.pick; ambLabel(); ambDraw(); save(); }
  });
  $$('#exSpeed button', sec).forEach((b) => b.addEventListener('click', () => { $$('#exSpeed button', sec).forEach((x) => x.classList.toggle('on', x === b)); save(); }));
  $('#exJournalClear').addEventListener('click', async () => {
    const b = $('#exJournalClear');
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Точно очистить?'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Очистить журнал'; }, 3500); return; }
    b.dataset.sure = ''; b.textContent = 'Очистить журнал';
    await post('/api/gazette/journal/clear'); refresh(); if (framesOn) loadFrames(true);
  });

  api('/api/gazette/settings').then((r) => { if (r.success) fill(r.settings); }).catch(() => {});
  if (active()) { loadFrames(true); refresh(); }
})();
