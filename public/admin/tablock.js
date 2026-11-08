(function () { // пароль на вкладки «Умная вебка» и «Замена лица»
  'use strict';
  var PASS = '1111', TABS = ['webcam', 'faceswap'], KEY = 'od_tablock_ok';
  function unlocked() { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return window.__odTabOk === true; } }
  function setOk() { window.__odTabOk = true; try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }
  var css = document.createElement('style');
  css.textContent = '#odLock{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);backdrop-filter:blur(6px)}' +
    '#odLock .b{width:300px;max-width:90vw;background:#0e0e10;border:1px solid #26262a;border-radius:14px;padding:20px;color:#fff;font:14px system-ui,sans-serif;display:flex;flex-direction:column;gap:12px}' +
    '#odLock h3{margin:0;font-size:16px}#odLock p{margin:0;font-size:12px;color:#8a8a90}' +
    '#odLock input{background:#141416;border:1px solid #26262a;border-radius:8px;color:#fff;padding:10px;font-size:16px;letter-spacing:4px;text-align:center}' +
    '#odLock input.bad{border-color:#e5484d}#odLock .r{display:flex;gap:8px}#odLock button{flex:1;padding:9px;border-radius:8px;border:1px solid #26262a;background:#141416;color:#fff;cursor:pointer}' +
    '#odLock button.ok{background:#2BC4B4;border-color:#2BC4B4;color:#000;font-weight:600}';
  document.head.appendChild(css);
  function ask(done) {
    var w = document.createElement('div'); w.id = 'odLock';
    w.innerHTML = '<div class="b"><h3>Вкладка под паролем</h3><p>Введи пароль, чтобы открыть.</p><input type="password" inputmode="numeric" autocomplete="off" maxlength="12"><div class="r"><button type="button" class="c">Отмена</button><button type="button" class="ok">Открыть</button></div></div>';
    document.body.appendChild(w);
    var i = w.querySelector('input'); i.focus();
    function close() { w.remove(); }
    function go() { if (i.value === PASS) { setOk(); close(); done(); } else { i.classList.add('bad'); i.value = ''; i.focus(); } }
    w.querySelector('.ok').onclick = go; w.querySelector('.c').onclick = close;
    i.onkeydown = function (e) { if (e.key === 'Enter') go(); else if (e.key === 'Escape') close(); else i.classList.remove('bad'); };
  }
  TABS.forEach(function (t) {
    var n = document.querySelector('.nav-item[data-tab="' + t + '"]');
    if (!n) return;
    n.addEventListener('click', function (e) {
      if (unlocked() || n.__odPass) return;
      e.stopImmediatePropagation(); e.preventDefault();
      ask(function () { n.__odPass = true; n.click(); n.__odPass = false; });
    }, true);
  });
})();
