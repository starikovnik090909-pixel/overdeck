// music.js — страница OBS «Заказ музыки»: играет очередь зрителей (звук всегда), клип показывается по кнопке в админке.
(function () {
  'use strict';
  var preview = /[?&]preview=1/.test(location.search);
  if (preview) document.body.className = 'pv';
  var stage = document.getElementById('stage'), box = document.getElementById('box'), bar = document.getElementById('bar');
  var ttl = document.getElementById('ttl'), by = document.getElementById('by');
  var player = null, ready = false, loadedUid = 0, last = null, vol = -1;

  function fit() { stage.style.transform = 'scale(' + innerWidth / 1920 + ')'; }
  addEventListener('resize', fit); fit();

  function post(path, body) { return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(function () {}); }

  function layout(s) {
    document.documentElement.style.setProperty('--ac', s.accent);
    box.style.cssText += ';left:' + s.x + 'px;top:' + s.y + 'px;width:' + s.w + 'px;height:' + s.h + 'px';
    bar.style.left = s.x + 'px'; bar.style.top = (s.y + s.h + 10) + 'px'; bar.style.width = s.w + 'px';
  }

  function paint(st) {
    var s = st.settings, cur = st.current;
    layout(s);
    var show = !!(s.showVideo && cur);
    box.classList.toggle('on', show); box.classList.toggle('off', preview && !show);
    bar.classList.toggle('on', !!(s.showTitle && cur && (show || preview)));
    ttl.textContent = cur ? cur.title : (preview ? 'Название трека' : '');
    by.textContent = cur && cur.by ? 'заказал ' + cur.by : (preview ? 'заказал зритель' : '');
    if (preview || !ready) return;
    if (!cur) { if (loadedUid) { try { player.stopVideo(); } catch (e) {} loadedUid = 0; } return; }
    if (loadedUid !== cur.uid) { loadedUid = cur.uid; try { player.loadVideoById(cur.id); } catch (e) {} }
    if (vol !== s.volume) { vol = s.volume; try { player.setVolume(s.volume); } catch (e) {} }
    try {
      var ps = player.getPlayerState();
      if (st.paused && ps === 1) player.pauseVideo();
      else if (!st.paused && (ps === 2 || ps === -1 || ps === 5)) player.playVideo();
    } catch (e) {}
  }

  function poll() {
    fetch('/api/music/state').then(function (r) { return r.json(); }).then(function (st) { if (st && st.success) { last = st; paint(st); } }).catch(function () {})
      .then(function () { setTimeout(poll, preview ? 1500 : 1000); });
  }

  if (!preview) {
    window.onYouTubeIframeAPIReady = function () {
      player = new YT.Player('yt', {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1 },
        events: {
          onReady: function () { ready = true; if (last) paint(last); },
          onStateChange: function (e) { if (e.data === 0 && last && last.current) post('/api/music/ended', { uid: last.current.uid }); },
          onError: function () { if (last && last.current) post('/api/music/ended', { uid: last.current.uid }); },
        },
      });
    };
    var sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(sc);
  }
  poll();
})();
