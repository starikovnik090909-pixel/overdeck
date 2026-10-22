// background.js — собирает данные со вкладок и отправляет в Overdeck (http://localhost:ПОРТ/api/nowplaying/browser).
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

chrome.runtime.onMessage.addListener((msg, sender) => {
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
    const st = await chrome.storage.local.get({ port: 3001 });
    const body = JSON.stringify({ browser: browserId(), items: Array.from(items.values()) });
    const r = await fetch('http://localhost:' + (st.port || 3001) + '/api/nowplaying/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const j = await r.json().catch(() => ({}));
    await chrome.storage.local.set({ lastOk: Date.now(), lastErr: '', enabled: !!j.enabled, count: items.size });
  } catch (e) { await chrome.storage.local.set({ lastErr: String(e && e.message || e), count: items.size }); }
  sending = false;
}
