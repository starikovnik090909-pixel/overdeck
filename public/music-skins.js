// music-skins.js — 5 видов плеера «Заказ музыки». MusicSkins.html(n) даёт карточку, MusicSkins.fill(root, данные) подставляет трек и прогресс.
(function () {
  'use strict';
  var A = '<div class="cov"><img data-cv alt=""></div><div class="inf"><div class="mq" data-t></div><div class="by" data-u></div><div class="bar"><i></i></div><div class="tm"><b data-c></b><b data-d></b></div></div>';
  function rep(n, s) { var o = ''; for (var i = 0; i < n; i++) o += s; return o; }
  var LIST = [
    { name: 'Минимал', w: 640, h: 200, h_: A },
    { name: 'Кольцо', w: 330, h: 380, h_: '<div class="ring"><div class="cov"><img data-cv alt=""></div></div><div class="mq" data-t></div><div class="by" data-u></div><div class="tm"><b data-c></b><b data-d></b></div>' },
    { name: 'Тикер', w: 640, h: 64, h_: '<div class="eq"><s></s><s></s><s></s><s></s><s></s></div><div class="mq" data-t></div><div class="by" data-u></div><div class="tm"><b data-c></b></div><div class="bar"><i></i></div>' },
    { name: 'Афиша', w: 360, h: 460, h_: '<img data-cv class="bg" alt=""><div class="shade"></div><div class="cap"><div class="mq" data-t data-wrap></div><div class="by" data-u></div><div class="bar"><i></i></div><div class="tm"><b data-c></b><b data-d></b></div></div>' },
    { name: 'Эквалайзер', w: 640, h: 220, h_: '<div class="bars">' + rep(32, '<s></s>') + '</div><div class="top"><div class="mq" data-t></div><div class="by" data-u></div></div><div class="tm"><b data-c></b><b data-d></b></div>' },
  ];
  var fmt = function (t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function marquee(el, text) {
    if (el._k === text) return; el._k = text;
    var wrap = el.hasAttribute('data-wrap');
    el.classList.remove('run'); el.innerHTML = '<span>' + esc(text) + '</span>';
    if (wrap) return;
    requestAnimationFrame(function () {
      var sp = el.firstChild; if (!sp) return;
      if (sp.scrollWidth > el.clientWidth + 2) {
        var gap = '<span class="gp"></span>';
        sp.innerHTML = esc(text) + gap + esc(text) + gap;
        el.style.setProperty('--d', Math.max(8, sp.scrollWidth / 2 / 60) + 's'); el.classList.add('run');
      }
    });
  }
  function html(n) {
    var d = LIST[(Number(n) || 1) - 1] || LIST[0], k = LIST.indexOf(d) + 1;
    var h = '<div class="mp sk' + k + '" style="width:' + d.w + 'px;height:' + d.h + 'px">' + d.h_ + '</div>';
    return h;
  }
  /** data: { title, by, cover, cur, dur } */
  function fill(root, d) {
    if (!root) return;
    var p = d.dur > 0 ? Math.max(0, Math.min(1, d.cur / d.dur)) : 0;
    root.style.setProperty('--p', p);
    root.style.setProperty('--deg', (p * 360) + 'deg');
    var t = root.querySelector('[data-t]'); if (t) marquee(t, d.title || '');
    var u = root.querySelector('[data-u]'); if (u) { u.textContent = d.by ? 'заказал ' + d.by : ''; u.style.display = d.by ? '' : 'none'; }
    root.querySelectorAll('[data-c]').forEach(function (e) { e.textContent = fmt(d.cur); });
    root.querySelectorAll('[data-d]').forEach(function (e) { e.textContent = fmt(d.dur); });
    root.querySelectorAll('img[data-cv]').forEach(function (e) { if (e.getAttribute('src') !== (d.cover || '')) { if (d.cover) e.src = d.cover; else e.removeAttribute('src'); } e.style.visibility = d.cover ? '' : 'hidden'; });
    ['.wv i', '.seg i'].forEach(function (sel) {
      var els = root.querySelectorAll(sel), on = Math.round(p * els.length);
      els.forEach(function (e, i) { e.classList.toggle('on', i < on); if (sel === '.wv i' && !e._h) { e._h = 1; e.style.height = (28 + Math.abs(Math.sin(i * 1.7) * 50 + Math.sin(i * 0.6) * 22)) + '%'; } });
    });
  }
  window.MusicSkins = { list: LIST, html: html, fill: fill };
})();
