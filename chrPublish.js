'use strict';
// Публикация «Хроник» на GitHub Pages: вход по коду (device flow), создание репозитория,
// загрузка страницы + данных + обложек одним коммитом, автообновление после изменений.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_FILE = path.join(__dirname, 'chronicles_publish.json');
const SITE_FILE = path.join(__dirname, 'chronicles-site', 'index.html');
const REPO_NAME = 'overdeck-chronicles';
// Client ID OAuth-приложения Overdeck на GitHub (публичное значение, не секрет).
// Можно вписать сюда, в config.json ("githubClientId") или ввести один раз в окне публикации.
const DEFAULT_CLIENT_ID = '';
const DEBOUNCE_MS = 90 * 1000;
const UA = 'Overdeck-Chronicles';

let chronicles = null;
let state = { token: '', login: '', repo: '', url: '', auto: true, clientId: '', lastAt: 0, lastError: '', pending: false };
let device = null; // { userCode, uri, expiresAt, interval, code, timer, error }
let busy = false;
let timer = null;

function loadState() { try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch (e) { /* нет файла */ } }
function saveState() { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 }); } catch (e) { console.warn('[Хроники] publish state:', e.message); } }

function clientId() {
  if (state.clientId) return state.clientId;
  try { const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); if (c.githubClientId) return String(c.githubClientId); } catch (e) { /* нет config */ }
  return process.env.OVERDECK_GH_CLIENT_ID || DEFAULT_CLIENT_ID;
}

async function gh(method, url, body, token) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': UA, 'X-GitHub-Api-Version': '2022-11-28' };
  if (token || state.token) headers.Authorization = 'Bearer ' + (token || state.token);
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(url.startsWith('http') ? url : 'https://api.github.com' + url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* не json */ }
  if (!r.ok) { const err = new Error((json && json.message) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
  return json;
}

// ---------- вход по коду ----------
async function startLogin(clientIdOverride) {
  if (clientIdOverride) { state.clientId = String(clientIdOverride).trim().slice(0, 100); saveState(); }
  const cid = clientId();
  if (!cid) return { needClientId: true };
  if (device && device.timer) clearInterval(device.timer);
  const r = await fetch('https://github.com/login/device/code', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ client_id: cid, scope: 'public_repo' }), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (!j.device_code) throw new Error(j.error_description || j.error || 'GitHub не выдал код. Проверь Client ID.');
  device = { userCode: j.user_code, uri: j.verification_uri, expiresAt: Date.now() + j.expires_in * 1000, interval: Math.max(5, j.interval || 5), code: j.device_code, error: '' };
  const tick = async () => {
    if (!device) return;
    if (Date.now() > device.expiresAt) { device.error = 'Код истёк. Нажми «Подключить» ещё раз.'; clearInterval(device.timer); return; }
    try {
      const t = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ client_id: cid, device_code: device.code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }), signal: AbortSignal.timeout(20000),
      }).then((x) => x.json());
      if (t.access_token) {
        clearInterval(device.timer); device = null;
        state.token = t.access_token;
        const me = await gh('GET', '/user');
        state.login = me.login; state.lastError = ''; saveState();
        publish(true).catch(() => {});
      } else if (t.error === 'access_denied') { device.error = 'Доступ отклонён.'; clearInterval(device.timer); }
      else if (t.error === 'expired_token') { device.error = 'Код истёк. Нажми «Подключить» ещё раз.'; clearInterval(device.timer); }
      else if (t.error === 'slow_down') { clearInterval(device.timer); device.interval += 5; device.timer = setInterval(tick, device.interval * 1000); }
    } catch (e) { /* сеть моргнула, следующая попытка */ }
  };
  device.timer = setInterval(tick, device.interval * 1000);
  return { userCode: device.userCode, uri: device.uri };
}

// ---------- сборка сайта ----------
const blobSha = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf])).digest('hex');

function buildFiles() {
  const items = chronicles.list();
  const pub = items.map((it) => ({
    id: it.id, type: it.type, title: it.title, year: it.year, genres: it.genres || [],
    rating: it.rating == null ? null : Math.min(10, it.rating),
    chatRating: it.type === 'game' ? null : it.chatRating,
    hours: it.hours, comment: it.comment || '', addedAt: it.addedAt,
    poster: it.poster ? 'posters/' + it.poster : '',
  }));
  const files = new Map();
  files.set('data.json', Buffer.from(JSON.stringify({ owner: state.login, items: pub })));
  files.set('index.html', fs.readFileSync(SITE_FILE));
  files.set('.nojekyll', Buffer.from(''));
  for (const it of items) {
    if (!it.poster) continue;
    try { files.set('posters/' + it.poster, fs.readFileSync(path.join(chronicles.POSTERS_DIR, it.poster))); } catch (e) { /* файла нет */ }
  }
  return files;
}

async function ensureRepo() {
  if (state.repo) return;
  const name = REPO_NAME;
  try {
    await gh('POST', '/user/repos', { name, description: 'Хроники: журнал игр и кино (Overdeck)', private: false, auto_init: true, has_issues: false, has_wiki: false });
  } catch (e) { if (e.status !== 422) throw e; } // 422: уже есть — используем её
  state.repo = name; state.url = `https://${state.login.toLowerCase()}.github.io/${name}/`; saveState();
}

async function ensurePages() {
  try { await gh('POST', `/repos/${state.login}/${state.repo}/pages`, { source: { branch: 'main', path: '/' } }); }
  catch (e) { if (e.status !== 409 && e.status !== 422) throw e; }
}

async function publish(force) {
  if (!state.token) throw new Error('Не подключён GitHub.');
  if (busy) { state.pending = true; return; }
  busy = true; state.lastError = ''; state.pending = false;
  try {
    await ensureRepo();
    const base = `/repos/${state.login}/${state.repo}`;
    const files = buildFiles();
    const ref = await gh('GET', `${base}/git/ref/heads/main`);
    const commit = await gh('GET', `${base}/git/commits/${ref.object.sha}`);
    const tree = await gh('GET', `${base}/git/trees/${commit.tree.sha}?recursive=1`);
    const remote = new Map((tree.tree || []).filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
    const entries = [];
    for (const [p, buf] of files) {
      if (remote.get(p) === blobSha(buf)) continue;
      const b = await gh('POST', `${base}/git/blobs`, { content: buf.toString('base64'), encoding: 'base64' });
      entries.push({ path: p, mode: '100644', type: 'blob', sha: b.sha });
    }
    for (const p of remote.keys()) { // удалённые обложки и устаревшие файлы сайта
      if (!files.has(p) && (p.startsWith('posters/') || p === 'data.json')) entries.push({ path: p, mode: '100644', type: 'blob', sha: null });
    }
    if (entries.length) {
      const nt = await gh('POST', `${base}/git/trees`, { base_tree: commit.tree.sha, tree: entries });
      const nc = await gh('POST', `${base}/git/commits`, { message: 'Обновление журнала', tree: nt.sha, parents: [ref.object.sha] });
      await gh('PATCH', `${base}/git/refs/heads/main`, { sha: nc.sha });
    }
    await ensurePages();
    state.lastAt = Date.now(); saveState();
  } catch (e) {
    state.lastError = e.status === 401 ? 'GitHub отозвал доступ. Подключись заново.' : e.message;
    if (e.status === 401) { state.token = ''; }
    saveState(); throw e;
  } finally {
    busy = false;
    if (state.pending) schedule();
  }
}

function schedule() {
  if (!state.token || !state.auto) return;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; publish().catch(() => {}); }, DEBOUNCE_MS);
  timer.unref && timer.unref();
}

function status() {
  return {
    connected: !!state.token, login: state.login, url: state.url, auto: !!state.auto, lastAt: state.lastAt, lastError: state.lastError,
    busy, queued: !!timer && !busy, needClientId: !clientId() && !state.token,
    device: device ? { userCode: device.userCode, uri: device.uri, error: device.error } : null,
  };
}

function disconnect() { clearTimeout(timer); timer = null; if (device && device.timer) clearInterval(device.timer); device = null; state.token = ''; state.auto = true; saveState(); }
function setAuto(v) { state.auto = !!v; saveState(); if (!state.auto) { clearTimeout(timer); timer = null; } }

function init(chr) {
  chronicles = chr; loadState();
  chr.events.on('change', () => { if (state.token) schedule(); });
}

module.exports = { init, status, startLogin, publish, disconnect, setAuto };
