// overvoice-admin.js — вкладка «Овервойс»: мод нейроголоса. Показывает страницу Овервойса внутри админки и даёт запуск/остановку.
(function () {
  'use strict';
  var sec = document.getElementById('tab-overvoice'); if (!sec) return;
  var $ = function (s) { return sec.querySelector(s); };
  var api = function (p, o) { return fetch(p, o).then(function (r) { return r.json(); }); };
  var post = function (p, b) { return api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); };
  var framed = '', busy = false;
  var flash = function (m) { var e = $('#ovSaved'); e.textContent = m; clearTimeout(flash.t); flash.t = setTimeout(function () { e.textContent = ''; }, 1600); };

  function render(s) {
    var wait = s.installed && !s.running;
    $('#ovEmpty').hidden = !!s.installed; $('#ovMain').hidden = !s.running;
    $('#ovAutoW').hidden = !s.installed;
    $('#ovStart').hidden = !s.installed || s.running; $('#ovStop').hidden = !s.running;
    $('#ovStart').disabled = busy || s.starting; $('#ovStart').textContent = (busy || s.starting) ? 'Запускаю…' : '▶ Запустить';
    if (document.activeElement !== $('#ovAuto')) $('#ovAuto').checked = !!s.autostart;
    var m = $('#ovMsg'); m.hidden = !wait; m.textContent = wait ? 'Овервойс сейчас выключен. Нажми «Запустить».' : '';
    var fr = $('#ovFrame'), url = location.protocol + '//' + location.hostname + ':' + s.port + '/';
    if (s.running && framed !== url) { fr.src = url; framed = url; }
    if (!s.running && framed) { fr.src = 'about:blank'; framed = ''; }
  }
  var load = function () { return api('/api/mods/overvoice').then(render).catch(function () {}); };
  $('#ovStart').addEventListener('click', function () { busy = true; load(); post('/api/mods/overvoice/start').then(function (j) { busy = false; if (j.success === false) { var m = $('#ovMsg'); m.hidden = false; m.textContent = j.error || 'Не удалось запустить'; } render(j); }).catch(function () { busy = false; }); });
  $('#ovStop').addEventListener('click', function () { post('/api/mods/overvoice/stop').then(render); });
  $('#ovAuto').addEventListener('change', function () { post('/api/mods/overvoice/settings', { autostart: $('#ovAuto').checked }).then(function (j) { render(j); flash('Сохранено'); }); });
  var nav = document.querySelector('[data-tab="overvoice"]'); if (nav) nav.addEventListener('click', function () { setTimeout(load, 50); });
  setInterval(function () { if (sec.classList.contains('active')) load(); }, 2000);
  load();
})();
