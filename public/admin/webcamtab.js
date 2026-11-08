(function () {
  'use strict';
  // Умная вебка: страницу /webcam/ грузим только когда вкладка открыта и выгружаем при уходе, чтобы камера не горела зря
  var nav = document.querySelector('.nav-item[data-tab="webcam"]');
  var fr = document.getElementById('wcFrame');
  if (!nav || !fr) return;
  function sync() {
    var on = nav.classList.contains('active');
    var want = on ? '/webcam/' : 'about:blank';
    if (on && fr.getAttribute('src') !== want) fr.setAttribute('src', want);
    if (!on && fr.getAttribute('src') && fr.getAttribute('src') !== 'about:blank') fr.setAttribute('src', 'about:blank');
  }
  new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
