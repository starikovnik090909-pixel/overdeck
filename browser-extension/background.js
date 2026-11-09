// background.js — (1) собирает данные со вкладок и отправляет в Overdeck (http://localhost:ПОРТ/api/nowplaying/browser),
// (2) отдаёт странице Twitch наборы смайлов 7TV/BTTV/FFZ, (3) включает/выключает перенаправление плейлиста для 1080p.
importScripts('settings.js');
const items = new Map();   // "tabId:frameId" -> { ...данные, at }
let sending = false;

function browserId() {
  const ua = navigator.userAgent;
  if (/YaBrowser/i.test(ua)) return 'yandex';
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/Firefox/i.test(ua)) return 'firefox';
  if (/Vivaldi/i.test(ua)) return 'vivaldi';
  return 'chrome';
}
function cleanTitle(t) { return String(t || '').replace(/^\(\d+\)\s*/, '').replace(/\s[-–—|]\s(YouTube|Twitch|Rutube|Кинопоиск|Netflix)\s*$/i, '').trim(); }

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.t === 'emotes') { loadEmotes(msg.login, msg.src || {}).then((r) => reply({ ok: true, ...r })).catch((e) => reply({ ok: false, error: String((e && e.message) || e) })); return true; }
  if (msg && msg.t === 'pts') { chrome.storage.local.get({ ptsCount: 0 }).then((s) => chrome.storage.local.set({ ptsCount: (s.ptsCount || 0) + 1 })); return; }
  if (!sender || !sender.tab) return;
  const key = sender.tab.id + ':' + (sender.frameId || 0);
  if (msg.t === 'gone') { items.delete(key); push(); return; }
  if (msg.t !== 'media') return;
  const tabTitle = cleanTitle(sender.tab.title);
  items.set(key, { id: browserId(), title: msg.title || tabTitle || cleanTitle(msg.frameTitle), artist: msg.artist, cover: msg.cover, site: msg.site, playing: msg.playing,
    pos: msg.pos, dur: msg.dur, rate: msg.rate, tabActive: !!sender.tab.active, at: Date.now() });
  push();
});
chrome.tabs.onRemoved.addListener((id) => { for (const k of Array.from(items.keys())) if (k.startsWith(id + ':')) items.delete(k); push(); });

let lastPush = 0, timer = null;
function push() {
  const wait = 900 - (Date.now() - lastPush);
  if (wait > 0) { if (!timer) timer = setTimeout(() => { timer = null; push(); }, wait); return; }
  lastPush = Date.now();
  const now = Date.now();
  for (const [k, v] of items) if (now - v.at > 4000) items.delete(k);
  send();
}
async function send() {
  if (sending) return; sending = true;
  try {
    const st = await chrome.storage.local.get(OD_DEFAULTS);
    const list = st.np ? Array.from(items.values()) : [];
    const body = JSON.stringify({ browser: browserId(), items: list });
    const r = await fetch('http://localhost:' + (st.port || 3001) + '/api/nowplaying/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const j = await r.json().catch(() => ({}));
    await chrome.storage.local.set({ lastOk: Date.now(), lastErr: '', enabled: !!j.enabled, count: list.length });
  } catch (e) { await chrome.storage.local.set({ lastErr: String(e && e.message || e), count: items.size }); }
  sending = false;
}

// ---------- смайлы 7TV / BTTV / FFZ ----------
const cache = new Map(); // ключ "login|e7eb ef" -> { at, data }
const TTL = 10 * 60 * 1000;
async function jget(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(url.split('/')[2] + ': ' + r.status); return r.json(); }
async function twitchId(login) {
  const r = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query($l:String!){user(login:$l){id}}', variables: { l: login } }) });
  const j = await r.json(); return j && j.data && j.data.user && j.data.user.id;
}
const BTTV_ZW = new Set(['SoSnowy', 'IceCold', 'SantaHat', 'TopHat', 'ReinDeer', 'CandyCane', 'cvMask', 'cvHazmat']);
function from7tv(set, out) {
  for (const e of (set && set.emotes) || []) {
    const h = e.data && e.data.host; if (!h || !h.url) continue;
    out.push({ n: e.name, u: 'https:' + h.url + '/2x.webp', z: !!((e.flags & 1) || (e.data.flags & 256)), s: '7TV' });
  }
}
async function loadEmotes(login, src) {
  login = String(login || '').toLowerCase(); if (!/^[a-z0-9_]{1,25}$/.test(login)) throw new Error('канал не распознан');
  const key = login + '|' + (src.e7 ? 1 : 0) + (src.eb ? 1 : 0) + (src.ef ? 1 : 0), c = cache.get(key);
  if (c && Date.now() - c.at < TTL) return { list: c.list };
  const id = await twitchId(login);
  const list = [], jobs = [];
  if (src.e7) {
    jobs.push(jget('https://7tv.io/v3/emote-sets/global').then((j) => from7tv(j, list)).catch(() => {}));
    if (id) jobs.push(jget('https://7tv.io/v3/users/twitch/' + id).then((j) => from7tv(j && j.emote_set, list)).catch(() => {}));
  }
  if (src.eb) {
    const add = (arr) => { for (const e of arr || []) list.push({ n: e.code, u: 'https://cdn.betterttv.net/emote/' + e.id + '/2x.webp', z: BTTV_ZW.has(e.code), s: 'BTTV' }); };
    jobs.push(jget('https://api.betterttv.net/3/cached/emotes/global').then(add).catch(() => {}));
    if (id) jobs.push(jget('https://api.betterttv.net/3/cached/users/twitch/' + id).then((j) => { add(j.channelEmotes); add(j.sharedEmotes); }).catch(() => {}));
  }
  if (src.ef) {
    const addF = (j) => { for (const set of Object.values((j && j.sets) || {})) for (const e of set.emoticons || []) { const k = Object.keys(e.urls || {}).sort((a, b) => b - a)[0]; if (k) list.push({ n: e.name, u: String(e.urls[k]).replace(/^\/\//, 'https://'), z: false, s: 'FFZ' }); } };
    jobs.push(jget('https://api.frankerfacez.com/v1/set/global').then(addF).catch(() => {}));
    if (id) jobs.push(jget('https://api.frankerfacez.com/v1/room/id/' + id).then(addF).catch(() => {}));
  }
  await Promise.all(jobs);
  // повторы имён: приоритет у канала (добавлен позже), поэтому оставляем последнее
  const seen = new Map(); for (const e of list) seen.set(e.n, e);
  const out = Array.from(seen.values());
  cache.set(key, { at: Date.now(), list: out });
  return { list: out };
}

// ---------- 1080p: плейлист Twitch идёт через твой релей (бета) ----------
const RULE_ID = 1;
async function applyHd() {
  const st = await chrome.storage.local.get(OD_DEFAULTS);
  const ok = st.hd && /^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(String(st.relay || '').trim());
  const rules = ok ? [{ id: RULE_ID, priority: 1, action: { type: 'redirect', redirect: { regexSubstitution: String(st.relay).trim().replace(/\/+$/, '') + '/\\1' } },
    condition: { regexFilter: '^https://usher\\.ttvnw\\.net/(api/(?:v2/)?channel/hls/.*)', resourceTypes: ['xmlhttprequest', 'other'] } }] : [];
  try { await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID], addRules: rules }); } catch (e) { await chrome.storage.local.set({ hdErr: String(e.message || e) }); return; }
  await chrome.storage.local.set({ hdErr: '', hdOn: ok });
}
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.hd || ch.relay)) applyHd(); });
chrome.runtime.onInstalled.addListener(applyHd);
chrome.runtime.onStartup.addListener(applyHd);
