// content.js — на каждой странице (и во вложенных кадрах) раз в секунду смотрит video/audio и сообщает фоновому скрипту.
(function () {
  'use strict';
  let last = 0, hadMedia = false;
  function pick() {
    const els = Array.from(document.querySelectorAll('video, audio')).filter((m) => m.readyState > 0 && !m.ended && (m.duration > 0 || m.currentTime > 0 || !m.paused));
    if (!els.length) return null;
    const playing = els.filter((m) => !m.paused);
    const pool = playing.length ? playing : els;
    pool.sort((a, b) => (b.videoWidth || 0) * (b.videoHeight || 0) - (a.videoWidth || 0) * (a.videoHeight || 0) || (b.duration || 0) - (a.duration || 0));
    return pool[0];
  }
  function tick() {
    let m = null;
    try { m = pick(); } catch (e) { m = null; }
    if (!m) { if (hadMedia) { hadMedia = false; try { chrome.runtime.sendMessage({ t: 'gone' }); } catch (e) { /* расширение перезагружено */ } } return; }
    hadMedia = true;
    let md = null; try { md = navigator.mediaSession && navigator.mediaSession.metadata; } catch (e) { md = null; }
    let cover = '';
    try { if (md && md.artwork && md.artwork.length) cover = md.artwork[md.artwork.length - 1].src; } catch (e) { cover = ''; }
    if (!cover && m.poster) cover = m.poster;
    const dur = isFinite(m.duration) ? m.duration : 0;
    try {
      chrome.runtime.sendMessage({ t: 'media', title: (md && md.title) || '', artist: (md && md.artist) || '', cover, site: location.hostname.replace(/^www\./, ''),
        playing: !m.paused && !m.ended, pos: m.currentTime || 0, dur, rate: m.playbackRate || 1, frameTitle: document.title || '' });
    } catch (e) { /* расширение перезагружено — страница обновится */ }
  }
  setInterval(tick, 1000);
})();
