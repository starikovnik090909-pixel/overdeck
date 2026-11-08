(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var nav = document.querySelector('.nav-item[data-tab="faceswap"]');
  if (!nav || !$('fsMain')) return;
  var timer = null, st = null, saving = null;
  function api(p, o) { return fetch('/api/faceswap/' + p, o).then(function (r) { return r.json(); }); }
  function post(p, b) { return api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); }
  function render(s) {
    st = s; var w = s.worker || {}, set = s.settings || {};
    var main = $('fsMain'), bar = $('fsBarI'), barw = bar.parentNode, msg = '';
    barw.style.display = 'none';
    if (s.installing) { msg = 'Устанавливаю мод… это несколько минут'; main.textContent = 'Идёт установка…'; main.disabled = true; }
    else if (!s.installed) { msg = 'Мод не установлен (скачает Python и библиотеки, ~1 ГБ)'; main.textContent = 'Установить мод'; main.disabled = false; }
    else if (!s.running) { msg = 'Выключено'; main.textContent = 'Включить замену'; main.disabled = false; }
    else {
      main.textContent = 'Выключить'; main.disabled = false;
      if (w.state === 'download') { msg = w.msg; barw.style.display = 'block'; bar.style.width = Math.round((w.progress || 0) * 100) + '%'; }
      else if (w.state === 'error' || s.error) msg = 'Ошибка: ' + (w.error || s.error);
      else if (!s.hasSource) msg = 'Выбери фото лица, которое подставлять';
      else msg = (w.msg || 'Запуск…') + (w.fps ? ' · ' + w.fps + ' FPS' : '') + (w.provider ? ' · ' + w.provider : '') + (w.face ? '' : ' · лица в кадре нет');
    }
    $('fsSt').textContent = msg;
    $('fsLog').textContent = (s.installing || s.error || (w && w.state === 'error')) ? (s.log || []).join('\n') : '';
    var run = s.running && w.state === 'run';
    $('fsPrev').style.display = run ? 'block' : 'none'; $('fsPh').style.display = run ? 'none' : 'block';
    if (run && !$('fsPrev').getAttribute('src')) $('fsPrev').src = '/api/faceswap/stream?t=' + Date.now();
    if (!run) $('fsPrev').removeAttribute('src');
    if (s.hasSource && !$('fsTh').dataset.v) { $('fsTh').style.backgroundImage = 'url(/api/faceswap/source.jpg?t=' + Date.now() + ')'; $('fsTh').dataset.v = 1; }
    if (document.activeElement !== $('fsConsent')) $('fsConsent').checked = !!s.consent;
    if (!saving) {
      $('fsMirror').checked = !!set.mirror; $('fsAuto').checked = !!set.autostart;
      var b = Math.round((set.blend == null ? 1 : set.blend) * 100); $('fsBlend').value = b; $('fsBlendV').textContent = b + '%';
      if (document.activeElement !== $('fsCam')) $('fsCam').value = set.camera || 0;
    }
  }
  function poll() { api('state').then(render).catch(function () {}); }
  function save() {
    clearTimeout(saving);
    saving = setTimeout(function () {
      saving = null;
      post('settings', { consent: $('fsConsent').checked, mirror: $('fsMirror').checked, autostart: $('fsAuto').checked, blend: +$('fsBlend').value / 100, camera: +$('fsCam').value || 0 });
    }, 250);
  }
  ['fsConsent', 'fsMirror', 'fsAuto', 'fsCam'].forEach(function (i) { $(i).addEventListener('change', save); });
  $('fsBlend').addEventListener('input', function () { $('fsBlendV').textContent = this.value + '%'; save(); });
  $('fsMain').onclick = function () {
    if (!st) return;
    var p = !st.installed ? post('install') : st.running ? post('stop') : post('start');
    p.then(function (r) { if (r && r.success === false) $('fsSt').textContent = r.error; poll(); });
  };
  $('fsPick').onclick = function () { $('fsFile').click(); };
  $('fsFile').onchange = function () {
    var f = this.files[0]; if (!f) return; var fd = new FormData(); fd.append('photo', f);
    api('source', { method: 'POST', body: fd }).then(function () { $('fsTh').dataset.v = ''; poll(); });
  };
  $('fsObs').onclick = function () {
    var u = location.origin + '/faceswap/';
    if (navigator.clipboard) navigator.clipboard.writeText(u).catch(function () {});
    $('fsObs').textContent = '✓ Скопировано: ' + u; setTimeout(function () { $('fsObs').textContent = '🔗 Ссылка для OBS'; }, 3500);
  };
  function sync() { var on = nav.classList.contains('active'); clearInterval(timer); timer = null; if (on) { poll(); timer = setInterval(poll, 1500); } }
  new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
