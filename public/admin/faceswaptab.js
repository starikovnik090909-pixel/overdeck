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
    var inst = s.install, sub = '', busy = false;
    $('fsCancel').hidden = true;
    if (inst && inst.running) {
      msg = 'Шаг ' + inst.step + ' из ' + inst.total + ': ' + inst.msg;
      barw.style.display = 'block'; bar.style.width = Math.max(2, inst.pct) + '%'; busy = true;
      var m = Math.floor(inst.elapsed / 60), sc = inst.elapsed % 60;
      sub = inst.pct + '% · прошло ' + m + ':' + (sc < 10 ? '0' : '') + sc + (inst.detail ? '\n' + inst.detail : '');
      main.textContent = 'Идёт установка…'; main.disabled = true; $('fsCancel').hidden = false;
    }
    else if (!s.installed && inst && inst.error) {
      msg = 'Установка не удалась: ' + inst.error; sub = 'Подробности в файле modules/faceswap/install.log. Проверь интернет и повтори.';
      main.textContent = 'Повторить установку'; main.disabled = false;
    }
    else if (!s.installed) { msg = 'Мод не установлен'; sub = 'Установка скачает Python, библиотеки и модели (около 1,2 ГБ), это 5–15 минут. Можно закрыть вкладку, установка продолжится.'; main.textContent = 'Установить мод'; main.disabled = false; }
    else if (!s.running) { msg = 'Выключено'; main.textContent = 'Включить замену'; main.disabled = false; }
    else {
      main.textContent = 'Выключить'; main.disabled = false;
      if (w.state === 'download') { msg = w.msg; barw.style.display = 'block'; bar.style.width = Math.round((w.progress || 0) * 100) + '%'; }
      else if (w.state === 'error' || s.error) msg = 'Ошибка: ' + (w.error || s.error);
      else if (!s.hasSource) msg = 'Выбери фото лица, которое подставлять';
      else { if (w.timing) sub = w.timing; msg = (w.msg || 'Запуск…') + (w.fps ? ' · ' + w.fps + ' FPS' : '') + (w.provider ? ' · ' + w.provider : '') + (w.face ? '' : ' · лица в кадре нет'); }
    }
    $('fsSt').textContent = msg; $('fsSub').textContent = sub; $('fsSub').style.whiteSpace = 'pre-line'; barw.classList.toggle('busy', busy);
    $('fsEnhRow').style.display = set.enhance ? '' : 'none';
    var o = [w.enh, w.out].filter(Boolean).join(' · ');
    if (o) $('fsOut').textContent = o;
    $('fsLog').textContent = (s.error || (w && w.state === 'error')) ? (s.log || []).join('\n') : '';
    var run = s.running && w.state === 'run';
    $('fsPrev').style.display = run ? 'block' : 'none'; $('fsPh').style.display = run ? 'none' : 'block';
    if (run && !$('fsPrev').getAttribute('src')) $('fsPrev').src = '/api/faceswap/stream?t=' + Date.now();
    if (!run) $('fsPrev').removeAttribute('src');
    if (phN !== (s.photos || 0)) { phN = s.photos || 0; renderPhotos(); }
    if (w && w.src_total) $('fsPhN').textContent = 'Использовано фото с лицом: ' + w.src_used + ' из ' + w.src_total + '. Чем больше фото (до 12, разные ракурсы и выражения), тем больше похоже.';
    if (document.activeElement !== $('fsConsent')) $('fsConsent').checked = !!s.consent;
    if (!saving) {
      $('fsMirror').checked = !!set.mirror; $('fsAuto').checked = !!set.autostart;
      var b = Math.round((set.blend == null ? 1 : set.blend) * 100); $('fsBlend').value = b; $('fsBlendV').textContent = b + '%';
      $('fsModel').value = set.model === 'fast' ? 'fast' : 'hyper'; var mo = Math.round((set.mouth == null ? 0.9 : set.mouth) * 100); $('fsMouth').value = mo; $('fsMouthV').textContent = mo + '%';
      var br = Math.round((set.bright || 0) * 100); $('fsBr').value = br; $('fsBrV').textContent = br + '%'; $('fsCmp').checked = !!set.compare;
      $('fsEnh').checked = !!set.enhance; $('fsWin').checked = !!set.window; $('fsVcam').checked = !!set.vcam;
      var e = Math.round((set.enh == null ? 0.8 : set.enh) * 100); $('fsEnhS').value = e; $('fsEnhV').textContent = e + '%';
      if (document.activeElement !== $('fsCam')) $('fsCam').value = set.camera || 0;
    }
  }
  function poll() { api('state').then(render).catch(function () {}); }
  function save() {
    clearTimeout(saving);
    saving = setTimeout(function () {
      saving = null;
      post('settings', { consent: $('fsConsent').checked, mirror: $('fsMirror').checked, autostart: $('fsAuto').checked, blend: +$('fsBlend').value / 100, bright: +$('fsBr').value / 100, compare: $('fsCmp').checked, model: $('fsModel').value, mouth: +$('fsMouth').value / 100, enhance: $('fsEnh').checked, enh: +$('fsEnhS').value / 100, window: $('fsWin').checked, vcam: $('fsVcam').checked, camera: +$('fsCam').value || 0 });
    }, 250);
  }
  ['fsConsent', 'fsMirror', 'fsAuto', 'fsCam', 'fsEnh', 'fsWin', 'fsVcam', 'fsModel', 'fsCmp'].forEach(function (i) { $(i).addEventListener('change', save); });
  $('fsBlend').addEventListener('input', function () { $('fsBlendV').textContent = this.value + '%'; save(); });
  $('fsBr').addEventListener('input', function () { $('fsBrV').textContent = this.value + '%'; save(); });
  $('fsMouth').addEventListener('input', function () { $('fsMouthV').textContent = this.value + '%'; save(); });
  $('fsEnhS').addEventListener('input', function () { $('fsEnhV').textContent = this.value + '%'; save(); });
  $('fsMain').onclick = function () {
    if (!st) return;
    var p = !st.installed ? post('install') : st.running ? post('stop') : post('start');
    p.then(function (r) { if (r && r.success === false) $('fsSt').textContent = r.error; poll(); });
  };
  $('fsCancel').onclick = function () { post('install/cancel').then(poll); };
  var phN = -1;
  function renderPhotos() {
    api('sources').then(function (r) {
      var box = $('fsThs'); box.innerHTML = '';
      (r.items || []).forEach(function (id) {
        var d = document.createElement('div'); d.className = 'fs-th'; d.style.backgroundImage = 'url(/api/faceswap/source/' + id + '.jpg?t=' + Date.now() + ')';
        var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'Убрать фото';
        x.onclick = function () { post('source/' + id + '/delete').then(function () { phN = -1; poll(); }); };
        d.appendChild(x); box.appendChild(d);
      });
      $('fsPick').hidden = (r.items || []).length >= (r.max || 12);
    });
  }
  $('fsPick').onclick = function () { $('fsFile').click(); };
  $('fsFile').onchange = function () {
    var fl = this.files; if (!fl || !fl.length) return; var fd = new FormData();
    for (var i = 0; i < fl.length; i++) fd.append('photo', fl[i]);
    this.value = '';
    api('source', { method: 'POST', body: fd }).then(function () { phN = -1; poll(); });
  };
  $('fsObs').onclick = function () {
    var u = location.origin + '/faceswap/';
    if (navigator.clipboard) navigator.clipboard.writeText(u).catch(function () {});
    $('fsObs').textContent = '✓ Скопировано: ' + u; setTimeout(function () { $('fsObs').textContent = '🔗 Ссылка для OBS'; }, 3500);
  };
  function sync() { var on = nav.classList.contains('active'); clearInterval(timer); timer = null; if (on) { poll(); timer = setInterval(poll, 1000); } }
  new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
(function () { // открытие вкладки из лаунчера по ссылке /admin#faceswap
  if (location.hash !== '#faceswap') return;
  var go = function () { var n = document.querySelector('.nav-item[data-tab="faceswap"]'); if (n) n.click(); };
  setTimeout(go, 600); setTimeout(go, 1800);
})();
