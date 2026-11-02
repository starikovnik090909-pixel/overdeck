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
    { name: 'Стекло', w: 580, h: 210, h_: '<img class="bgi" data-cv alt=""><div class="cov"><img data-cv alt=""></div><div class="inf"><div class="mq" data-t></div><div class="by" data-u></div><div class="wv">' + rep(44, '<i></i>') + '</div><div class="tm"><b data-c></b><b data-d></b></div></div>' },
    { name: 'Круг', w: 560, h: 640, themes: ['Галактика', 'Пульсар', 'Пламя'], viz: 7, h_: '<canvas width="1120" height="1000"></canvas><div class="cov"><img data-cv alt=""></div><div class="ii"><div class="mq" data-t></div><div class="by" data-u></div><div class="tm"><b data-c></b><b data-d></b></div></div>' },
    { name: 'Светодиоды', w: 600, h: 250, themes: ['Янтарь', 'Лёд', 'Розовый неон', 'Закат'], viz: 8, h_: '<div class="hd"><div class="mq" data-t></div><div class="tm"><b data-c></b><b data-d></b></div></div><div class="mx">' + rep(30, '<div class="col">' + rep(12, '<i></i>') + '</div>') + '</div>' },
    { name: 'Лента', w: 560, h: 52, h_: '<div class="mq" data-t data-tby></div><div class="tm"><b data-c></b></div><div class="bar"><i></i></div>' },
    { name: 'Заливка', w: 520, h: 58, h_: '<div class="fl"></div><div class="tx"><div class="mq" data-t></div><div class="by" data-u></div></div><div class="tm"><b data-c></b><b data-d></b></div>' },
    { name: 'Нотный стан', w: 560, h: 78, viz: 9, h_: '<div class="tx"><div class="mq" data-t></div><div class="by" data-u></div></div><canvas width="600" height="156"></canvas>' },
    { name: 'Скин-классика', w: 480, h: 222, viz: 10, h_: '<div class="ttl">OVERDECK</div><div class="lt"><b data-c></b></div><canvas width="636" height="128"></canvas><div class="lq"><div class="mq" data-t data-tby></div></div><div class="sb"><i></i></div><div class="tr">⏮ ▶ ⏸ ⏹ ⏭</div>' },
    { name: 'Кликвил', w: 220, h: 300, h_: '<div class="scr"><div class="cov"><img data-cv alt=""></div><div class="mq" data-t></div><div class="by" data-u></div><div class="tm"><b data-c></b><b data-d></b></div><div class="bar"><i></i></div></div><div class="wh"><u></u><em>MENU</em><small>▶❚❚</small></div>' },
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
  function html(n, theme) {
    var d = LIST[(Number(n) || 1) - 1] || LIST[0], k = LIST.indexOf(d) + 1;
    var th = d.themes ? Math.max(0, Math.min(d.themes.length - 1, Number(theme) || 0)) : 0;
    return '<div class="mp sk' + k + ' t' + th + '"' + (d.viz ? ' data-vz="' + d.viz + '" data-th="' + th + '"' : '') + ' style="width:' + d.w + 'px;height:' + d.h + 'px">' + d.h_ + '</div>';
  }
  /** data: { title, by, cover, cur, dur } */
  function fill(root, d) {
    if (!root) return;
    var p = d.dur > 0 ? Math.max(0, Math.min(1, d.cur / d.dur)) : 0;
    root.style.setProperty('--p', p);
    root.style.setProperty('--deg', (p * 360) + 'deg');
    if (root.getAttribute('data-vz')) { var z = root._vz || (root._vz = { t: 0, amp: 0, playing: true }); z.playing = d.playing !== false; z.p = p; vzReg(root); }
    var t = root.querySelector('[data-t]'); if (t) marquee(t, (d.title || '') + (t.hasAttribute('data-tby') && d.by ? ' · заказал ' + d.by : ''));
    var u = root.querySelector('[data-u]'); if (u) { u.textContent = d.by ? 'заказал ' + d.by : ''; u.style.display = d.by ? '' : 'none'; }
    root.querySelectorAll('[data-c]').forEach(function (e) { e.textContent = fmt(d.cur); });
    root.querySelectorAll('[data-d]').forEach(function (e) { e.textContent = fmt(d.dur); });
    root.querySelectorAll('img[data-cv]').forEach(function (e) { if (e.getAttribute('src') !== (d.cover || '')) { if (d.cover) e.src = d.cover; else e.removeAttribute('src'); } e.style.visibility = d.cover ? '' : 'hidden'; });
    ['.wv i', '.seg i'].forEach(function (sel) {
      var els = root.querySelectorAll(sel), on = Math.round(p * els.length);
      els.forEach(function (e, i) { e.classList.toggle('on', i < on); if (sel === '.wv i' && !e._h) { e._h = 1; e.style.height = (28 + Math.abs(Math.sin(i * 1.7) * 50 + Math.sin(i * 0.6) * 22)) + '%'; } });
    });
  }

  // ---------- Анимация «дёргающейся» музыки (виды 7 и 8) ----------
  // Звук ролика с YouTube недоступен для анализа, поэтому уровни — правдоподобная анимация в ритме ~124 уд/мин, пока трек играет.
  var PI = Math.PI, N = 48, BPM = 124, SPB = 60 / BPM;
  var LEDPAL = [['#ffd34a', '#ff9a1f', '#ff4a1a'], ['#8fe9ff', '#3d8bff', '#8a5cff'], ['#ff3bb0', '#ff7ad0', '#ffe3f6'], ['#7a4bff', '#ff3b8d', '#ff9a3b', '#ffe14a']];
  var VZ = { roots: [], raf: 0, last: 0 };
  function levels(t, z) {
    var ph = (t / SPB) % 1, bass = Math.pow(1 - ph, 3), off = Math.pow(1 - ((t / SPB + 0.5) % 1), 4) * 0.6, a = [];
    z.kick = bass; z.beat = Math.floor(t / SPB);
    for (var k = 0; k < N; k++) {
      var x = k / N, b = bass * (1 - x) * 1.05 + off * Math.sin(x * 3.1) * 0.8 + 0.12 * (1 - x) + (0.28 + 0.22 * Math.sin(t * 3 + k)) * (x > 0.45 ? 0.55 : 0.25) * Math.abs(Math.sin(t * 7.3 + k * 1.9)) + 0.12 * Math.abs(Math.sin(t * 13 + k * 0.7));
      a.push(Math.max(0.04, Math.min(1, b)) * z.amp);
    }
    return a;
  }
  function band(L, i, M) { var h = M / 2, j = i < h ? i : M - i; return L[Math.min(N - 1, Math.floor(j / h * N * 0.9))]; }
  function vzReg(root) { if (VZ.roots.indexOf(root) < 0) VZ.roots.push(root); if (!VZ.raf) VZ.raf = requestAnimationFrame(vzLoop); }
  function vzLoop(now) {
    VZ.raf = 0; var dt = Math.min(0.1, (now - (VZ.last || now)) / 1000); VZ.last = now;
    VZ.roots = VZ.roots.filter(function (r) { return r.isConnected; });
    VZ.roots.forEach(function (r) {
      var z = r._vz; if (!z) return;
      z.amp += ((z.playing ? 1 : 0.1) - z.amp) * Math.min(1, dt * (z.playing ? 5 : 3));
      if (z.playing) z.t += dt;
      var L = levels(z.t, z), th = Number(r.getAttribute('data-th')) || 0;
      try { var vk = r.getAttribute('data-vz'); if (vk === '7') drawCircle(r, z, L, th, dt); else if (vk === '8') drawLeds(r, z, L, th); else if (vk === '9') drawStaff(r, z, L); else drawClassic(r, z, L); } catch (e) { /* анимация не должна ломать плеер */ }
    });
    VZ.last = VZ.roots.length ? now : 0;
    if (VZ.roots.length) VZ.raf = requestAnimationFrame(vzLoop);
  }
  function drawCircle(r, z, L, th, dt) {
    var cv = r.querySelector('canvas'); if (!cv) return;
    var x = z.x || (z.x = cv.getContext('2d')); if (!z.sc) { z.sc = 1; z.parts = []; z.waves = []; z.beat0 = -1; }
    var cx = 0, cy = 0, t = z.t, p = z.p || 0, rc = 100, cov = r.querySelector('.cov');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 1120, 1000); x.setTransform(2.6, 0, 0, 2.6, 560, 500); x.lineCap = 'round';
    var newBeat = z.playing && z.kick > 0.9 && z.beat !== z.beat0; if (newBeat) z.beat0 = z.beat;
    var k = z.kick * z.amp, i, M, a, v, len, x1, y1, x2, y2, g;
    if (th === 0) { // Галактика
      var R = rc + 14 + k * 4;
      g = x.createRadialGradient(cx, cy, 80, cx, cy, 190); g.addColorStop(0, 'rgba(140,90,255,' + (0.22 + k * 0.28) + ')'); g.addColorStop(1, 'rgba(140,90,255,0)'); x.fillStyle = g; x.fillRect(-220, -200, 440, 400);
      M = 84; for (i = 0; i < M; i++) {
        a = i / M * PI * 2 - PI / 2; v = band(L, i, M); len = 4 + v * 58;
        x1 = cx + Math.cos(a) * R; y1 = cy + Math.sin(a) * R; x2 = cx + Math.cos(a) * (R + len); y2 = cy + Math.sin(a) * (R + len);
        g = x.createLinearGradient(x1, y1, x2, y2); g.addColorStop(0, '#7a5cff'); g.addColorStop(1, '#2ef4ff'); x.strokeStyle = g; x.lineWidth = 3.5; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
        x1 = cx + Math.cos(a) * (R - 4); y1 = cy + Math.sin(a) * (R - 4); x2 = cx + Math.cos(a) * (R - 4 - len * 0.4); y2 = cy + Math.sin(a) * (R - 4 - len * 0.4);
        x.strokeStyle = 'rgba(255,43,214,.75)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
      }
      x.strokeStyle = 'rgba(255,255,255,.15)'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, rc + 6, 0, PI * 2); x.stroke();
      x.strokeStyle = '#fff'; x.shadowColor = '#2ef4ff'; x.shadowBlur = 7; x.beginPath(); x.arc(cx, cy, rc + 6, -PI / 2, -PI / 2 + PI * 2 * p); x.stroke(); x.shadowBlur = 0;
      if (newBeat) for (i = 0; i < 14; i++) z.parts.push({ a: Math.random() * PI * 2, r: R + 20, s: 20 + Math.random() * 40, l: 1 });
      z.parts = z.parts.filter(function (q) { q.r += q.s * dt; q.l -= dt * 1.1; if (q.l <= 0) return false; x.fillStyle = 'rgba(180,240,255,' + q.l + ')'; x.beginPath(); x.arc(cx + Math.cos(q.a) * q.r, cy + Math.sin(q.a) * q.r, 1.8 * q.l + 0.6, 0, PI * 2); x.fill(); return true; });
    } else if (th === 1) { // Пульсар
      if (newBeat) z.waves.push({ r: rc, l: 1 });
      z.waves = z.waves.filter(function (w) { w.r += 80 * dt; w.l -= dt * 0.7; if (w.l <= 0) return false; x.strokeStyle = 'rgba(60,220,255,' + w.l * 0.6 + ')'; x.lineWidth = 2 * w.l + 0.5; x.beginPath(); x.arc(cx, cy, w.r, 0, PI * 2); x.stroke(); return true; });
      x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, rc + 8, 0, PI * 2); x.stroke();
      x.strokeStyle = '#7be7ff'; x.beginPath(); x.arc(cx, cy, rc + 8, -PI / 2, -PI / 2 + PI * 2 * p); x.stroke();
      x.setLineDash([3, 8]); x.lineWidth = 1.6; x.strokeStyle = 'rgba(120,200,255,.55)'; x.save(); x.translate(cx, cy); x.rotate(t * 0.35); x.beginPath(); x.arc(0, 0, rc + 20, 0, PI * 2); x.stroke(); x.restore();
      x.save(); x.translate(cx, cy); x.rotate(-t * 0.5); x.setLineDash([1, 6]); x.beginPath(); x.arc(0, 0, rc + 29, 0, PI * 2); x.stroke(); x.restore(); x.setLineDash([]);
      var R1 = rc + 38 + k * 4; M = 60; for (i = 0; i < M; i++) {
        a = i / M * PI * 2 - PI / 2; v = band(L, i, M); len = 4 + v * 46;
        x1 = cx + Math.cos(a) * R1; y1 = cy + Math.sin(a) * R1; x2 = cx + Math.cos(a) * (R1 + len); y2 = cy + Math.sin(a) * (R1 + len);
        x.strokeStyle = v > 0.7 ? '#fff' : (v > 0.4 ? '#7be7ff' : '#2f8fff'); x.shadowColor = '#2ef4ff'; x.shadowBlur = v > 0.5 ? 6 : 0; x.lineWidth = 5; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
      } x.shadowBlur = 0;
    } else { // Пламя
      var RB = rc + 8 + k * 5, pts = []; M = 120;
      for (i = 0; i < M; i++) { a = i / M * PI * 2 - PI / 2; v = band(L, i, M); var rr = RB + 8 + v * 38 + Math.sin(a * 5 + t * 2) * 3 + Math.sin(a * 9 - t * 3) * 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      var path = function (sc) { x.beginPath(); for (var j = 0; j <= M; j++) { var A = pts[j % M], B = pts[(j + 1) % M], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, px = cx + (mx - cx) * sc, py = cy + (my - cy) * sc; if (j) x.quadraticCurveTo(cx + (A[0] - cx) * sc, cy + (A[1] - cy) * sc, px, py); else x.moveTo(px, py); } x.closePath(); };
      x.shadowColor = '#ff7a1a'; x.shadowBlur = 22; g = x.createRadialGradient(cx, cy, rc - 10, cx, cy, rc + 60); g.addColorStop(0, '#ffe14a'); g.addColorStop(0.5, '#ff6a1a'); g.addColorStop(1, '#d3141e'); x.fillStyle = g; path(1); x.fill(); x.shadowBlur = 0;
      x.fillStyle = 'rgba(255,230,160,.35)'; path(0.9); x.fill(); x.fillStyle = '#14090a'; x.beginPath(); x.arc(cx, cy, rc + 3, 0, PI * 2); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, rc + 3, 0, PI * 2); x.stroke(); x.strokeStyle = '#fff'; x.beginPath(); x.arc(cx, cy, rc + 3, -PI / 2, -PI / 2 + PI * 2 * p); x.stroke();
      if (z.playing && Math.random() < 0.4 + k * 0.5) z.parts.push({ x: cx + (Math.random() - 0.5) * 220, y: cy + 90 + Math.random() * 60, vy: 25 + Math.random() * 45, l: 1, s: 0.8 + Math.random() * 1.8 });
      z.parts = z.parts.filter(function (q) { q.y -= q.vy * dt; q.x += Math.sin(q.y * 0.05) * 0.3; q.l -= dt * 0.8; if (q.l <= 0) return false; x.fillStyle = 'rgba(255,' + (150 + q.l * 90 | 0) + ',60,' + q.l + ')'; x.beginPath(); x.arc(q.x, q.y, q.s * q.l + 0.4, 0, PI * 2); x.fill(); return true; });
    }
    if (cov) cov.style.transform = 'scale(' + (1 + k * 0.06) + ')' + (th === 1 ? ' rotate(' + (t * 12) + 'deg)' : '');
  }
  function drawStaff(r, z, L) {
    var cv = r.querySelector('canvas'); if (!cv) return; var x = z.x || (z.x = cv.getContext('2d'));
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 600, 156); x.setTransform(2, 0, 0, 2, 0, 0);
    var X0 = 8, X1 = 292, i, a;
    x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1; for (i = 0; i < 5; i++) { x.beginPath(); x.moveTo(X0, 14 + i * 12); x.lineTo(X1, 14 + i * 12); x.stroke(); }
    for (i = 0; i < 6; i++) {
      var X = X1 - ((z.t * 60 + i * 48) % 288), Y = 14 + Math.round(L[(i * 7) % N] * 8) * 6;
      a = Math.max(0, Math.min(1, (X - X0) / 24, (X1 - X) / 10));
      x.globalAlpha = a * (0.4 + 0.6 * z.amp); x.fillStyle = 'hsl(' + (340 - i * 32) + ',90%,70%)';
      x.beginPath(); x.ellipse(X, Y, 6.5, 4.8, -0.4, 0, PI * 2); x.fill(); x.fillRect(X + 5, Y - 22, 1.6, 22);
    }
    x.globalAlpha = 1;
  }
  function drawClassic(r, z, L) {
    var cv = r.querySelector('canvas'); if (!cv) return; var x = z.x || (z.x = cv.getContext('2d'));
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 636, 128); x.setTransform(2, 0, 0, 2, 0, 0);
    var n = 28, w = 318, h = 64, bw = w / n, i, g, bh;
    if (!z.pk) z.pk = []; 
    for (i = 0; i < n; i++) {
      bh = L[i % N] * (h - 8); z.pk[i] = Math.max((z.pk[i] || 0) - 0.6, bh);
      g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, '#2ee62e'); g.addColorStop(0.6, '#ffe82e'); g.addColorStop(1, '#ff3030');
      x.fillStyle = g; x.fillRect(i * bw + 2, h - bh, bw - 4, bh); x.fillStyle = '#ddd'; x.fillRect(i * bw + 2, h - z.pk[i] - 3, bw - 4, 2);
    }
  }
  function drawLeds(r, z, L, th) {
    if (!z.cols) { z.cols = [].map.call(r.querySelectorAll('.col'), function (c) { return [].slice.call(c.children); }); z.pk = z.cols.map(function () { return 0; }); z.col = z.cols.map(function () { return []; }); }
    var pal = LEDPAL[th] || LEDPAL[0];
    for (var i = 0; i < z.cols.length; i++) {
      var lvl = Math.round(L[Math.floor(i * N / z.cols.length)] * 12); z.pk[i] = Math.max(z.pk[i] - 0.3, lvl);
      for (var j = 0; j < 12; j++) {
        var e = z.cols[i][11 - j], st = j < lvl ? pal[Math.min(pal.length - 1, Math.floor(j / 12 * pal.length))] : (Math.round(z.pk[i]) === j + 1 && z.pk[i] > 1 && z.amp > 0.3 ? '#fff' : '');
        if (z.col[i][j] !== st) { z.col[i][j] = st; e.style.background = st; e.style.boxShadow = st ? '0 0 5px ' + st : ''; }
      }
    }
  }

  window.MusicSkins = { list: LIST, html: html, fill: fill };
})();
