// content.js — «Сейчас играет»: на странице (и во вложенных кадрах) читает video/audio и сообщает фоновому скрипту.
// Работает только если функция включена в окошке расширения (по умолчанию выключена).
// Страницу не опрашивает без причины: слушает события плеера, а пока медиа есть, шлёт «пульс» раз в 3 секунды.
(function () {
  'use strict';
  const HEARTBEAT_MS = 3000;   // Overdeck считает данные устаревшими через 5 с, поэтому пульс реже нельзя
  const EVENT_GAP_MS = 400;    // события плеера не чаще, чем раз в это время
  const EVENTS = ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'ratechange', 'seeked', 'emptied'];
  let enabled = false, hadMedia = false, beat = 0, evTimer = 0, lastSent = 0;

  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  // обложка: только http(s); относительные адреса приводим к полным, data:/blob:/javascript: отбрасываем
  function httpUrl(u) {
    try { const x = new URL(String(u), location.href); return x.protocol === 'http:' || x.protocol === 'https:' ? clip(x.href, 500) : ''; } catch (e) { return ''; }
  }
  function send(msg) { try { chrome.runtime.sendMessage(msg); } catch (e) { /* расширение перезагружено — страница обновится */ } }

  function pick() {
    const els = Array.from(document.querySelectorAll('video, audio')).filter((m) => m.readyState > 0 && !m.ended && (m.duration > 0 || m.currentTime > 0 || !m.paused));
    if (!els.length) return null;
    const playing = els.filter((m) => !m.paused);
    const pool = playing.length ? playing : els;
    pool.sort((a, b) => (b.videoWidth || 0) * (b.videoHeight || 0) - (a.videoWidth || 0) * (a.videoHeight || 0) || (b.duration || 0) - (a.duration || 0));
    return pool[0];
  }

  function startBeat() { if (!beat) beat = setInterval(tick, HEARTBEAT_MS); }
  function stopBeat() { if (beat) { clearInterval(beat); beat = 0; } }

  function tick() {
    if (!enabled) return;
    let m = null;
    try { m = pick(); } catch (e) { m = null; }
    if (!m) { stopBeat(); if (hadMedia) { hadMedia = false; send({ t: 'gone' }); } return; }
    hadMedia = true; startBeat();
    let md = null; try { md = navigator.mediaSession && navigator.mediaSession.metadata; } catch (e) { md = null; }
    let cover = '';
    try { if (md && md.artwork && md.artwork.length) cover = httpUrl(md.artwork[md.artwork.length - 1].src); } catch (e) { cover = ''; }
    if (!cover && m.poster) cover = httpUrl(m.poster);
    const dur = isFinite(m.duration) ? m.duration : 0;
    lastSent = Date.now();
    send({ t: 'media', title: clip(md && md.title, 200), artist: clip(md && md.artist, 200), cover, site: clip(location.hostname.replace(/^www\./, ''), 100),
      playing: !m.paused && !m.ended, pos: m.currentTime || 0, dur, rate: m.playbackRate || 1, frameTitle: clip(document.title, 200) });
  }

  function onMedia() {
    if (!enabled || evTimer) return;
    evTimer = setTimeout(() => { evTimer = 0; tick(); }, Math.max(0, EVENT_GAP_MS - (Date.now() - lastSent)));
  }

  function setEnabled(on) {
    on = !!on;
    if (on === enabled) return;
    enabled = on;
    if (on) {
      // события плеера не всплывают, но перехватываются на этапе погружения у document
      EVENTS.forEach((e) => document.addEventListener(e, onMedia, true));
      tick();
    } else {
      EVENTS.forEach((e) => document.removeEventListener(e, onMedia, true));
      stopBeat(); clearTimeout(evTimer); evTimer = 0;
      if (hadMedia) { hadMedia = false; send({ t: 'gone' }); }
    }
  }

  try {
    chrome.storage.local.get({ np: false }).then((s) => setEnabled(s.np)).catch(() => {});
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.np) setEnabled(ch.np.newValue); });
  } catch (e) { /* расширение перезагружено */ }
})();
