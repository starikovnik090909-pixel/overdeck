// twitch.js — работает на странице twitch.tv: авто-сбор баллов, сторонние смайлы в чате и панель смайлов.
(function () {
  'use strict';
  if (window.__odTwitch) return; window.__odTwitch = true;
  const D = { pts: true, emotes: true, e7: true, eb: true, ef: false, picker: true };
  let S = { ...D }, map = new Map(), list = [], login = '', loading = '';
  const RESERVED = new Set(['', 'directory', 'videos', 'settings', 'downloads', 'jobs', 'turbo', 'store', 'wallet', 'subscriptions', 'drops', 'inventory', 'friends', 'messages', 'search', 'p', 'prime', 'popout', 'moderator', 'embed', 'dashboard', 'u', 'bits', 'legal']);

  function chanLogin() {
    const p = location.pathname.split('/').filter(Boolean);
    if (p[0] === 'popout' || p[0] === 'embed' || p[0] === 'moderator') return (p[1] || '').toLowerCase();
    if (RESERVED.has((p[0] || '').toLowerCase())) return '';
    return (p[0] || '').toLowerCase();
  }
  function load(cb) { try { chrome.storage.local.get(D, (s) => { S = { ...D, ...s }; cb && cb(); }); } catch (e) { /* расширение перезагружено */ } }
  try { chrome.storage.onChanged.addListener((ch, a) => { if (a !== 'local') return; let re = false; for (const k of Object.keys(ch)) { if (k in D) { S[k] = ch[k].newValue; if (/^(e7|eb|ef|emotes)$/.test(k)) re = true; } } if (re) { login = ''; } }); } catch (e) { /* нет контекста */ }

  // ---------- авто-сбор баллов ----------
  function claim() {
    if (!S.pts) return;
    const ic = document.querySelector('.claimable-bonus__icon');
    if (!ic) return;
    const b = ic.closest('button') || ic;
    try { b.click(); chrome.runtime.sendMessage({ t: 'pts' }); } catch (e) { /* ничего */ }
  }
  setInterval(claim, 2000);

  // ---------- смайлы в чате ----------
  function isEmoteWrap(n) { return n && n.nodeType === 1 && n.classList.contains('od-emote-wrap'); }
  function mkImg(e, zw) { const im = document.createElement('img'); im.src = e.u; im.alt = e.n; im.title = e.n; im.className = zw ? 'od-zw' : 'od-emote'; im.loading = 'lazy'; im.decoding = 'async'; return im; }
  function render(text, target) {
    const parts = text.split(/(\s+)/); let any = false, last = null;
    for (const w of parts) {
      const e = map.get(w);
      if (e && w) {
        any = true;
        if (e.z && last) { last.appendChild(mkImg(e, true)); continue; }
        const wr = document.createElement('span'); wr.className = 'od-emote-wrap'; wr.appendChild(mkImg(e, false)); target.appendChild(wr); last = wr;
      } else { target.appendChild(document.createTextNode(w)); if (w && !/^\s+$/.test(w)) last = null; }
    }
    return any;
  }
  function processLine(line) {
    if (!S.emotes || !map.size || line.dataset.odDone === String(map.size)) return;
    line.dataset.odDone = String(map.size);
    const frags = line.querySelectorAll('span.text-fragment, [data-a-target="chat-message-text"]');
    frags.forEach((f) => {
      if (f.dataset.od === '1') return;
      const txt = f.textContent;
      if (!txt || !/\S/.test(txt)) return;
      let hit = false; for (const w of txt.split(/\s+/)) if (map.has(w)) { hit = true; break; }
      if (!hit) return;
      const box = document.createElement('span'); box.className = 'od-box'; render(txt, box);
      f.textContent = ''; f.appendChild(box); f.dataset.od = '1';
    });
  }
  function scanAll() { document.querySelectorAll('.chat-line__message, .vod-message').forEach(processLine); }
  new MutationObserver((muts) => {
    if (!S.emotes || !map.size) return;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches('.chat-line__message, .vod-message')) processLine(n);
      else if (n.querySelectorAll) n.querySelectorAll('.chat-line__message, .vod-message').forEach(processLine);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  function fetchSets() {
    const l = chanLogin();
    if (!l || (!S.emotes && !S.picker)) { map = new Map(); list = []; login = l; return; }
    if (l === login || loading === l) return;
    loading = l;
    try {
      chrome.runtime.sendMessage({ t: 'emotes', login: l, src: { e7: !!S.e7, eb: !!S.eb, ef: !!S.ef } }, (r) => {
        loading = '';
        if (chrome.runtime.lastError || !r || !r.ok) { login = ''; return; }
        login = l; list = r.list || []; map = new Map(list.map((e) => [e.n, e])); scanAll();
      });
    } catch (e) { loading = ''; }
  }
  setInterval(fetchSets, 1500);

  // ---------- панель смайлов ----------
  let pick = null, tab = 'ALL', q = '';
  const ICON = '<svg viewBox="0 0 24 24"><path class="f" d="M12 4.5 20 8.5 12 12.5 4 8.5z"/><path d="m4 12.5 8 4 8-4M4 16.5l8 4 8-4"/></svg>';
  function input() { return document.querySelector('[data-a-target="chat-input"]'); }
  function insert(name) {
    const el = input(); if (!el) return;
    el.focus();
    const before = el.textContent;
    let ok = false; try { ok = document.execCommand('insertText', false, name + ' '); } catch (e) { ok = false; }
    if (!ok || el.textContent === before) {
      try { const dt = new DataTransfer(); dt.setData('text/plain', name + ' '); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) { /* не вышло */ }
    }
  }
  function drawGrid() {
    const g = pick.querySelector('.odp-g'); g.textContent = '';
    if (!list.length) { const m = document.createElement('div'); m.className = 'odp-m'; m.textContent = S.e7 || S.eb || S.ef ? 'Смайлы ещё загружаются или для канала их нет.' : 'Включи источники смайлов в окошке расширения.'; g.appendChild(m); return; }
    const ql = q.trim().toLowerCase(); let n = 0;
    for (const e of list) {
      if (tab !== 'ALL' && e.s !== tab) continue;
      if (ql && !e.n.toLowerCase().includes(ql)) continue;
      if (++n > 300) break;
      const b = document.createElement('button'); b.type = 'button'; b.title = e.n; b.appendChild(mkImg(e, false)); b.firstChild.className = ''; b.addEventListener('click', () => insert(e.n)); g.appendChild(b);
    }
    if (!n) { const m = document.createElement('div'); m.className = 'odp-m'; m.textContent = 'Ничего не найдено.'; g.appendChild(m); }
    pick.querySelector('.odp-f').textContent = n + (n >= 300 ? '+' : '') + ' смайлов · Overdeck';
  }
  function buildPicker() {
    pick = document.createElement('div'); pick.id = 'od-pick'; pick.hidden = true;
    pick.innerHTML = '<div class="odp-h"><input type="text" placeholder="Найти смайл" autocomplete="off"></div><div class="odp-t"></div><div class="odp-g"></div><div class="odp-f"></div>';
    document.body.appendChild(pick);
    const inp = pick.querySelector('input'); inp.addEventListener('input', () => { q = inp.value; drawGrid(); });
    const tabs = pick.querySelector('.odp-t');
    ['ALL', '7TV', 'BTTV', 'FFZ'].forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t === 'ALL' ? 'Все' : t; b.dataset.t = t; if (t === tab) b.className = 'on'; b.addEventListener('click', () => { tab = t; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); drawGrid(); }); tabs.appendChild(b); });
    document.addEventListener('mousedown', (e) => { if (!pick.hidden && !pick.contains(e.target) && !(e.target.closest && e.target.closest('#od-pick-btn'))) pick.hidden = true; }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pick.hidden = true; });
  }
  function togglePicker(btn) {
    if (!pick) buildPicker();
    if (!pick.hidden) { pick.hidden = true; btn.removeAttribute('aria-expanded'); return; }
    fetchSets(); drawGrid(); pick.hidden = false; btn.setAttribute('aria-expanded', 'true');
    const r = btn.getBoundingClientRect(), w = 340, h = 380;
    pick.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    pick.style.top = Math.max(8, r.top - h - 8) + 'px';
    pick.querySelector('input').focus();
  }
  function ensureButton() {
    const has = document.getElementById('od-pick-btn');
    if (!S.picker) { if (has) has.remove(); return; }
    if (has && has.isConnected) return;
    const btn = document.createElement('button'); btn.id = 'od-pick-btn'; btn.type = 'button'; btn.title = 'Смайлы Overdeck (7TV, BTTV, FFZ)'; btn.setAttribute('aria-label', 'Смайлы Overdeck'); btn.innerHTML = ICON;
    btn.addEventListener('click', () => togglePicker(btn));
    const nat = document.querySelector('.chat-input [data-a-target="emote-picker-button"]');
    if (nat) {
      let host = nat; while (host.parentElement && host.parentElement.children.length === 1 && !host.parentElement.matches('.chat-input')) host = host.parentElement;
      host.parentElement.insertBefore(btn, host);
      return;
    }
    const row = document.querySelector('.chat-input .chat-input__buttons-container, .chat-input [data-test-selector="chat-input-buttons-container"]');
    if (!row) return;
    const last = row.lastElementChild || row;
    last.insertBefore(btn, last.firstChild);
  }
  setInterval(ensureButton, 1500);
  load(() => { fetchSets(); ensureButton(); });
})();
