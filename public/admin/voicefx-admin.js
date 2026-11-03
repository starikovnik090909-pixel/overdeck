// voicefx-admin.js — вкладка «Голосовые фильтры»: выбор фильтра, проверка на слух, награда за баллы, донат, связь с OBS.
(function () {
  'use strict';
  var sec = document.getElementById('tab-voicefx'); if (!sec || !window.VoiceFX) return;
  var $ = function (s) { return sec.querySelector(s); };
  var api = function (p, o) { return fetch(p, o).then(function (r) { return r.json(); }); };
  var post = function (p, b) { return api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var st = null, prev = null, timer = 0, sv = 0, loadedInputs = false;
  function flash(m) { var e = $('#vfSaved'); e.textContent = m; clearTimeout(flash.t); flash.t = setTimeout(function () { e.textContent = ''; }, 1600); }
  var name = function (id) { var f = VoiceFX.FILTERS.find(function (x) { return x.id === id; }); return f ? f.emoji + ' ' + f.name : ''; };

  // проверка на слух: фраза «Есть пробитие» через выбранный фильтр
  var pctx = null;
  function listen(id) {
    if (prev) { try { prev.el.pause(); prev.fx && prev.fx.stop(); } catch (e) {} prev = null; }
    var el = new Audio('/soundpad/penetration.mp3'); el.volume = 0.9;
    if (id !== 'off') {
      pctx = pctx || new (window.AudioContext || window.webkitAudioContext)(); if (pctx.state === 'suspended') pctx.resume();
      var a = (st ? st.settings.strength : 60) / 100, fx = VoiceFX.build(pctx, id, a, { noise: id === 'radio' || id === 'am' });
      var src = pctx.createMediaElementSource(el); src.connect(fx.input); fx.output.connect(pctx.destination);
      el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false; el.playbackRate = fx.rate;
      if (id === 'radio') VoiceFX.squelch(pctx, pctx.destination, pctx.currentTime, a, false);
      el.addEventListener('ended', function () { fx.end(); if (id === 'radio') VoiceFX.squelch(pctx, pctx.destination, pctx.currentTime + 0.05, a, true); setTimeout(function () { fx.stop(); }, Math.ceil(fx.tail * 1000) + 500); });
      prev = { el: el, fx: fx };
    } else prev = { el: el };
    el.play().catch(function () {});
  }

  function opts(withSpecial) {
    return (withSpecial ? '<option value="random">Случайный</option><option value="viewer">Тот, что назовёт зритель</option>' : '') + VoiceFX.FILTERS.map(function (f) { return '<option value="' + f.id + '">' + f.emoji + ' ' + f.name + '</option>'; }).join('');
  }
  $('#vfRwFilter').innerHTML = opts(true); $('#vfDonFilter').innerHTML = opts(true);

  function render(s) {
    st = s; var c = s.settings, a = s.active;
    $('#vfPwr').classList.toggle('on', !!c.enabled); $('#vfPwrT').textContent = c.enabled ? 'Фильтры включены' : 'Фильтры выключены';
    if (document.activeElement !== $('#vfStr')) $('#vfStr').value = c.strength; $('#vfStrV').textContent = c.strength + '%';
    sec.querySelectorAll('[data-tg]').forEach(function (b) { b.classList.toggle('on', c.targets[b.dataset.tg] !== false); });
    $('#vfGrid').innerHTML = '<button type="button" class="vf-t' + (c.filter === 'off' ? ' sel' : '') + '" data-f="off"><span class="em">🚫</span><span class="nm">Без фильтра</span><span class="ds">Голос как есть. Фильтры только за баллы или донат</span></button>' +
      VoiceFX.FILTERS.map(function (f) { return '<button type="button" class="vf-t' + (c.filter === f.id ? ' sel' : '') + '" data-f="' + f.id + '"><span class="em">' + f.emoji + '</span><span class="nm">' + esc(f.name) + '</span><span class="ds">' + esc(f.note) + '</span></button>'; }).join('');
    var left = a.until ? Math.max(0, Math.round((a.until - Date.now()) / 1000)) : 0;
    $('#vfNow').innerHTML = !c.enabled ? 'Выключено' : a.filter === 'off' ? 'Сейчас: без фильтра' : 'Сейчас: <b>' + esc(name(a.filter)) + '</b>' + (a.until ? ' · ' + (a.by ? esc(a.by) + ', ' : '') + 'ещё ' + left + ' сек' : '');
    $('#vfReset').hidden = !a.until;
    var rd = $('#vfRwDot'), dd = $('#vfDonDot'), od = $('#vfObsDot');
    rd.className = c.reward.on ? ((s.reward && ['ok', 'idle', 'wait'].indexOf(s.reward.state) < 0 && s.reward.text) ? 'bad' : 'on') : '';
    dd.className = c.donation.on ? 'on' : '';
    od.className = c.obs.on ? (s.obs && s.obs.state === 'ok' ? 'on' : 'bad') : '';
    $('#vfNote').textContent = c.targets.mic && !c.obs.on ? 'Чтобы фильтр работал на микрофоне, подключи OBS (кнопка «Микрофон и OBS»).' : '';
    fillModals();
  }
  function fillModals() {
    var c = st.settings, set = function (q, v) { var e = $(q); if (document.activeElement !== e) { if (e.type === 'checkbox') e.checked = !!v; else e.value = v; } };
    set('#vfRwOn', c.reward.on); set('#vfRwTitle', c.reward.title); set('#vfRwCost', c.reward.cost); set('#vfRwCd', c.reward.cooldown); set('#vfRwDur', c.reward.duration); set('#vfRwFilter', c.reward.filter);
    var r = st.reward; $('#vfRwMsg').textContent = r && r.text ? r.text : 'Награда появится на Twitch, когда включишь фильтры и награду.'; $('#vfRwMsg').style.color = r && r.text && ['ok', 'idle', 'wait'].indexOf(r.state) < 0 ? '#e5484d' : '';
    set('#vfDonOn', c.donation.on); set('#vfDonMin', c.donation.minRub); set('#vfDonDur', c.donation.duration); set('#vfDonKey', c.donation.keyword); set('#vfDonFilter', c.donation.filter);
    set('#vfObsOn', c.obs.on); set('#vfObsHost', c.obs.host); set('#vfObsPort', c.obs.port); set('#vfObsPass', c.obs.password); set('#vfObsFx', c.obs.fxInput);
    var o = st.obs || {}; $('#vfObsStat').textContent = !c.obs.on ? 'Связь с OBS выключена.' : (o.text || ''); $('#vfObsStat').style.color = c.obs.on && o.state && o.state !== 'ok' ? '#e5484d' : (o.state === 'ok' ? '#3ecf8e' : '');
    $('#vfObsUrl').value = st.micUrl || '';
    var sel = $('#vfObsMic'); if (c.obs.micInput && !Array.prototype.some.call(sel.options, function (x) { return x.value === c.obs.micInput; })) { sel.innerHTML = '<option value="' + esc(c.obs.micInput) + '">' + esc(c.obs.micInput) + '</option>' + sel.innerHTML; }
    if (document.activeElement !== sel) sel.value = c.obs.micInput;
  }
  var load = function () { return api('/api/voicefx/state').then(render).catch(function () {}); };
  function save(patch, now) {
    clearTimeout(sv);
    var go = function () { return post('/api/voicefx/settings', patch).then(function (j) { render(j); flash('Сохранено'); }); };
    if (now) return go(); sv = setTimeout(go, 400);
  }

  $('#vfPwr').addEventListener('click', function () { if (st) save({ enabled: !st.settings.enabled }, true); });
  $('#vfStr').addEventListener('input', function () { $('#vfStrV').textContent = $('#vfStr').value + '%'; save({ strength: Number($('#vfStr').value) }); });
  sec.querySelectorAll('[data-tg]').forEach(function (b) { b.addEventListener('click', function () { if (!st) return; var t = {}; t[b.dataset.tg] = !(st.settings.targets[b.dataset.tg] !== false); save({ targets: t }, true); }); });
  $('#vfGrid').addEventListener('click', function (e) {
    var t = e.target.closest('[data-f]'); if (!t || !st) return;
    var id = t.dataset.f; listen(id);
    save({ filter: id }, true);
  });
  $('#vfReset').addEventListener('click', function () { post('/api/voicefx/reset').then(render); });

  // окна
  function open(id) { $(id).hidden = false; fillModals(); if (id === '#vfObsOv') reloadInputs(); }
  function close() { sec.querySelectorAll('.mu-modal').forEach(function (m) { m.hidden = true; }); }
  $('#vfRwBtn').addEventListener('click', function () { open('#vfRwOv'); });
  $('#vfDonBtn').addEventListener('click', function () { open('#vfDonOv'); });
  $('#vfObsBtn').addEventListener('click', function () { open('#vfObsOv'); });
  sec.addEventListener('click', function (e) { if (e.target.closest('[data-vfclose]')) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  var num = function (q) { return Number($(q).value); };
  [['#vfRwOn', 'change'], ['#vfRwTitle', 'input'], ['#vfRwCost', 'input'], ['#vfRwCd', 'input'], ['#vfRwDur', 'input'], ['#vfRwFilter', 'change']].forEach(function (p) {
    $(p[0]).addEventListener(p[1], function () { save({ reward: { on: $('#vfRwOn').checked, title: $('#vfRwTitle').value, cost: num('#vfRwCost'), cooldown: num('#vfRwCd'), duration: num('#vfRwDur'), filter: $('#vfRwFilter').value } }); });
  });
  [['#vfDonOn', 'change'], ['#vfDonMin', 'input'], ['#vfDonDur', 'input'], ['#vfDonKey', 'input'], ['#vfDonFilter', 'change']].forEach(function (p) {
    $(p[0]).addEventListener(p[1], function () { save({ donation: { on: $('#vfDonOn').checked, minRub: num('#vfDonMin'), duration: num('#vfDonDur'), keyword: $('#vfDonKey').value, filter: $('#vfDonFilter').value } }); });
  });
  var obsPatch = function () { return { obs: { on: $('#vfObsOn').checked, host: $('#vfObsHost').value, port: num('#vfObsPort'), password: $('#vfObsPass').value, micInput: $('#vfObsMic').value, fxInput: $('#vfObsFx').value } }; };
  ['#vfObsOn', '#vfObsHost', '#vfObsPort', '#vfObsPass', '#vfObsMic', '#vfObsFx'].forEach(function (q) {
    $(q).addEventListener(q === '#vfObsOn' || q === '#vfObsMic' ? 'change' : 'input', function () { save(obsPatch()); if (q === '#vfObsOn') setTimeout(reloadInputs, 1500); });
  });
  function reloadInputs() {
    api('/api/voicefx/obs/inputs').then(function (j) {
      if (!j.success) return; var cur = st ? st.settings.obs.micInput : '', sel = $('#vfObsMic');
      sel.innerHTML = '<option value="">— выбери микрофон —</option>' + j.inputs.map(function (i) { return '<option value="' + esc(i.name) + '">' + esc(i.name) + '</option>'; }).join(''); sel.value = cur;
    }).catch(function () {});
  }
  $('#vfObsReload').addEventListener('click', reloadInputs);
  var msg = function (j, ok) { $('#vfObsStat').textContent = j.success === false ? j.error : ok; $('#vfObsStat').style.color = j.success === false ? '#e5484d' : '#3ecf8e'; };
  $('#vfObsMake').addEventListener('click', function () { post('/api/voicefx/obs/create').then(function (j) { msg(j, j.created ? 'Источник создан в текущей сцене OBS. Добавь его в другие сцены, если нужно.' : 'Источник уже есть, ссылка обновлена.'); }); });
  $('#vfObsTestOn').addEventListener('click', function () { post('/api/voicefx/obs/test', { on: true }).then(function (j) { msg(j, 'Включён обработанный микрофон. Скажи что-нибудь.'); }); });
  $('#vfObsTestOff').addEventListener('click', function () { post('/api/voicefx/obs/test', { on: false }).then(function (j) { msg(j, 'Вернул обычный микрофон.'); }); });
  $('#vfObsCopy').addEventListener('click', function () { var u = $('#vfObsUrl').value; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { flash('Ссылка скопирована'); }, function () { $('#vfObsUrl').select(); flash('Выдели и скопируй вручную'); }); });
  $('#vfRwSync').addEventListener('click', function () { post('/api/voicefx/reward/sync').then(render); });

  var nav = document.querySelector('[data-tab="voicefx"]');
  if (nav) nav.addEventListener('click', function () { setTimeout(load, 50); });
  setInterval(function () { if (sec.classList.contains('active') && !document.querySelector('#tab-voicefx .mu-modal:not([hidden])')) load(); else if (sec.classList.contains('active') && st && st.active.until) load(); }, 2000);
  load();
})();
