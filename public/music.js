// music.js — страница OBS «Заказ музыки». Размер и положение задаются источником в OBS: страница заполняет весь источник.
// Звук играет всегда; на экране — клип с бегущей строкой или карточка плеера (по кнопке «Показать» в админке).
(function () {
  'use strict';
  var preview = /[?&]preview=1/.test(location.search);
  var $ = function (i) { return document.getElementById(i); };
  var wrap = $('wrap'), pl = $('pl');
  var posTick = 0, skinNo = 0, skinTh = -1, playing = true, card = null, dim = [640, 200], info = { title: '', by: '', cover: '', dur: 0 }, curT = 0;
  var lines = [$('lnTop'), $('lnBot')];
  var player = null, ready = false, loadedUid = 0, last = null, vol = -1, textKey = '', fake = 0, firstLoad = true;
  if (preview) document.body.classList.add('pv');

  function fit() {
    document.documentElement.style.setProperty('--u', (innerWidth / 40) + 'px');
    pl.style.transform = 'scale(' + Math.min(innerWidth / (dim[0] + 20), innerHeight / (dim[1] + 20)) + ')';
  }
  addEventListener('resize', fit); fit();
  var post = function (p, b) { return fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).catch(function () {}); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmt = function (t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); };

  function paint(st) {
    var s = st.settings, cur = st.current || (preview ? { uid: 0, id: '', title: 'Дора — Дорадура', by: 'Зритель', seconds: 130 } : null);
    var isPl = s.view === 'player';
    document.body.classList.toggle('pl', isPl);
    document.documentElement.style.setProperty('--ac', s.accent);
    var show = !!(s.showVideo && cur);
    wrap.classList.toggle('on', show); document.body.classList.toggle('off', preview && !show);
    if (preview && !show) wrap.classList.add('on');
    var who = s.showUser && cur && cur.by ? cur.by : '';
    var key = [cur && cur.uid, cur && cur.title, who, s.line, s.skin, s.skinTheme, s.view].join('|');
    if (key !== textKey) {
      textKey = key;
      lines[0].className = 'ln' + (!isPl && s.line === 'top' && cur ? ' show' : '');
      lines[1].className = 'ln' + (!isPl && s.line === 'bottom' && cur ? ' show' : '');
      var ln = s.line === 'top' ? lines[0] : lines[1];
      if (cur) {
        var html = esc(cur.title) + (who ? ' <em>· заказал ' + esc(who) + '</em>' : '');
        ln.innerHTML = '<span class="ic">♪</span><div class="w"><span>' + html + '</span></div>';
        var w = ln.querySelector('.w'), sp = w.firstChild;
        requestAnimationFrame(function () {
          if (sp.scrollWidth > w.clientWidth + 2) {
            sp.innerHTML = html + '<span style="display:inline-block;width:3em"></span>' + html + '<span style="display:inline-block;width:3em"></span>';
            w.style.setProperty('--d', Math.max(8, sp.scrollWidth / 2 / 70) + 's'); w.className = 'w run';
          }
        });
        info = { title: cur.title, by: who, cover: cur.id ? 'https://i.ytimg.com/vi/' + cur.id + '/mqdefault.jpg' : '', dur: cur.seconds || 0 };
      }
    }
    playing = !!cur && !st.paused; if (preview) playing = true;
    if (skinNo !== s.skin || skinTh !== (s.skinTheme || 0)) { skinNo = s.skin; skinTh = s.skinTheme || 0; pl.innerHTML = MusicSkins.html(skinNo, skinTh); card = pl.firstChild; dim = [MusicSkins.list[skinNo - 1].w, MusicSkins.list[skinNo - 1].h]; pl.style.width = dim[0] + 'px'; pl.style.height = dim[1] + 'px'; fit(); card._k = 0; }
    if (card) MusicSkins.fill(card, { title: info.title, by: info.by, cover: info.cover, cur: curT, dur: info.dur, playing: playing });
    if (preview || !ready) return;
    if (!cur) { if (loadedUid) { try { player.stopVideo(); } catch (e) {} loadedUid = 0; } return; }
    if (loadedUid !== cur.uid) {
      loadedUid = cur.uid;
      // страницу перезагрузил OBS (обновление источника): продолжаем трек с сохранённого места, а не с начала
      var start = 0, ps0 = st.pos;
      if (firstLoad && ps0 && ps0.uid === cur.uid && ps0.t > 1 && (!ps0.d || ps0.t < ps0.d - 2)) start = ps0.t;
      firstLoad = false;
      try { player.loadVideoById({ videoId: cur.id, startSeconds: start }); } catch (e) {}
    }
    if (vol !== s.volume) { vol = s.volume; try { player.setVolume(s.volume); } catch (e) {} }
    try {
      var ps = player.getPlayerState();
      if (st.paused && ps === 1) player.pauseVideo();
      else if (!st.paused && (ps === 2 || ps === -1 || ps === 5)) player.playVideo();
    } catch (e) {}
  }

  setInterval(function () {
    var t = 0, d = info.dur;
    if (preview) { fake = (fake + 0.5) % 130; t = fake; d = 130; info.dur = 130; }
    else if (ready) { try { t = player.getCurrentTime(); d = player.getDuration() || d; } catch (e) {} }
    curT = t; if (d > 0) info.dur = d;
    if (!preview && last && last.current && ++posTick % 4 === 0) post('/api/music/progress', { uid: last.current.uid, t: t, d: d });
    if (card) MusicSkins.fill(card, { title: info.title, by: info.by, cover: info.cover, cur: curT, dur: info.dur, playing: playing });
  }, 500);

  function poll() {
    fetch('/api/music/state').then(function (r) { return r.json(); }).then(function (st) { if (st && st.success) { last = st; paint(st); } }).catch(function () {})
      .then(function () { setTimeout(poll, preview ? 1200 : 1000); });
  }

  if (!preview) {
    window.onYouTubeIframeAPIReady = function () {
      player = new YT.Player('yt', {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1 },
        events: {
          onReady: function () { ready = true; if (last) paint(last); },
          onStateChange: function (e) { if (e.data === 0 && last && last.current) post('/api/music/ended', { uid: last.current.uid }); },
          onError: function (e) { if (last && last.current) post('/api/music/ended', { uid: last.current.uid, error: (e && e.data) || 1 }); },
        },
      });
    };
    var sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(sc);
  }
  // источник закрывается (смена сцены, обновление): ставим на паузу и сохраняем точное время
  addEventListener('pagehide', function () {
    if (preview || !ready || !last || !last.current) return;
    try {
      var t = player.getCurrentTime(), d = player.getDuration() || 0;
      navigator.sendBeacon('/api/music/progress', new Blob([JSON.stringify({ uid: last.current.uid, t: t, d: d })], { type: 'application/json' }));
      player.pauseVideo();
    } catch (e) { /* страница уже закрывается */ }
  });
  poll();
})();
