// nv-admin.js — вкладка «Голос NV»: установка движка, запуск, окно управления голосом (страница /nv/).
(function () {
  'use strict';
  var sec = document.getElementById('tab-nv'); if (!sec) return;
  var $ = function (s) { return sec.querySelector(s); };
  var api = function (p, o) { return fetch(p, o).then(function (r) { return r.json(); }); };
  var post = function (p, b) { return api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); };
  var st = null, sv = 0, framed = false;
  var flash = function (m) { var e = $('#nvSaved'); e.textContent = m; clearTimeout(flash.t); flash.t = setTimeout(function () { e.textContent = ''; }, 1600); };

  function render(s) {
    st = s; var c = s.settings, g = s.status, installing = g.state === 'downloading' || g.state === 'unpacking';
    var vs = $('#nvVariant'); if (!vs.options.length) vs.innerHTML = Object.keys(s.variants).map(function (k) { return '<option value="' + k + '">' + s.variants[k].label + ' · ' + s.variants[k].gb + ' ГБ</option>'; }).join('');
    if (document.activeElement !== vs) vs.value = c.variant;
    $('#nvSetup').hidden = !!s.installed && !installing; $('#nvMain').hidden = !s.installed || installing;
    $('#nvProg').hidden = g.state !== 'downloading'; $('#nvBar').style.width = (g.pct || 0) + '%';
    $('#nvMsg').textContent = g.text || ''; $('#nvMsg').style.color = g.state === 'error' ? '#e5484d' : '';
    $('#nvInstall').disabled = installing; $('#nvInstall').textContent = installing ? 'Идёт установка…' : (g.state === 'error' ? 'Повторить' : 'Скачать и установить');
    $('#nvStart').hidden = !s.installed || g.running || g.state === 'starting'; $('#nvStop').hidden = !g.running && g.state !== 'starting';
    if (document.activeElement !== $('#nvObsIn')) $('#nvObsIn').value = c.obsInput;
    $('#nvAuto').checked = !!c.autostart;
    $('#nvStat').textContent = g.state === 'starting' ? g.text : (g.running ? 'Движок работает' : (s.installed ? 'Движок остановлен. Нажми «Запустить движок».' : ''));
    var fr = $('#nvFrame');
    if (g.running && !framed) { fr.src = '/nv/index.html'; framed = true; }
    if (!g.running && framed) { fr.src = 'about:blank'; framed = false; }
  }
  var load = function () { return api('/api/nv/state').then(render).catch(function () {}); };
  $('#nvVariant').addEventListener('change', function () { post('/api/nv/settings', { variant: $('#nvVariant').value }).then(render); });
  $('#nvInstall').addEventListener('click', function () { post('/api/nv/install').then(render); });
  $('#nvStart').addEventListener('click', function () { post('/api/nv/start').then(render); });
  $('#nvStop').addEventListener('click', function () { post('/api/nv/stop').then(render); });
  $('#nvAuto').addEventListener('change', function () { post('/api/nv/settings', { autostart: $('#nvAuto').checked }).then(function (j) { render(j); flash('Сохранено'); }); });
  $('#nvObsIn').addEventListener('input', function () { clearTimeout(sv); sv = setTimeout(function () { post('/api/nv/settings', { obsInput: $('#nvObsIn').value }).then(function (j) { render(j); flash('Сохранено'); }); }, 400); });
  var nav = document.querySelector('[data-tab="nv"]'); if (nav) nav.addEventListener('click', function () { setTimeout(load, 50); });
  setInterval(function () { if (sec.classList.contains('active')) load(); }, 1500);
  load();
})();
