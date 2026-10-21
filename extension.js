/**
 * Расширение Twitch («кнопка сбоку плеера»): серверная часть.
 *
 * Расширение — это страница, которая лежит на серверах Twitch и открывается у зрителя в плеере. Данных у неё нет: их присылает этот сервер.
 * Раз в несколько секунд (и только если что-то изменилось) сервер собирает компактный снимок — кто сейчас на сцене и топ игроков —
 * и отправляет его в Twitch (Helix «Send Extension PubSub Message», цель broadcast). Twitch доставляет снимок всем зрителям канала,
 * у которых расширение открыто. Входящих соединений на ваш ПК не нужно: сервер только отправляет.
 *
 * Запрос подписывается JWT (HS256) секретом расширения (Key из консоли Twitch Developers → расширение → Settings → Extension Client Configuration),
 * роль «external», user_id — владелец расширения (канал стримера).
 *
 * Хранение: extension_config.json (в .gitignore — секрет не попадает в архив и не затирается обновлением).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'extension_config.json');
const HELIX_PUBSUB = 'https://api.twitch.tv/helix/extensions/pubsub';

/** Значения по умолчанию. maxBytes — осторожный потолок размера одного сообщения (Twitch разрешает порядка 5 КБ; см. README §99). */
const DEFAULTS = Object.freeze({
  enabled: false,
  clientId: '',          // Client ID расширения (консоль Twitch Developers → расширение)
  secret: '',            // Key расширения (base64) — для подписи JWT
  ownerId: '',           // числовой Twitch ID канала-владельца; пусто — берётся из входа через Twitch
  topSize: 15,           // сколько игроков топа входит в снимок (5–25)
  intervalSec: 6,        // не чаще раза в N секунд (3–60)
  maxBytes: 4500,        // потолок размера сообщения в байтах UTF-8 (1000–5000)
});

const clampInt = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JWT HS256. secretB64 — ключ расширения в base64. */
function signJwt(payload, secretB64) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', Buffer.from(String(secretB64), 'base64')).update(head + '.' + body).digest());
  return head + '.' + body + '.' + sig;
}

/** Короткий отпечаток списка героев (одинаково считается на сервере и в расширении): по нему расширение понимает, что порядок героев совпадает. */
function heroHash(ids) { let h = 5381; const s = ids.join(','); for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 4294967296; return h.toString(36); }
/** Флаги 0/1 → строка из шестнадцатеричных групп по 24 бита (по 6 символов). */
function packFlags(flags) { let out = ''; for (let g = 0; g < flags.length; g += 24) { let n = 0; for (let b = 0; b < 24 && g + b < flags.length; b++) if (flags[g + b]) n += Math.pow(2, b); out += ('000000' + n.toString(16)).slice(-6); } return out; }

const byteLen = (s) => Buffer.byteLength(s, 'utf8');
const cut = (s, n) => { const a = [...String(s || '')]; return a.length > n ? a.slice(0, n).join('') : a.join(''); };

/**
 * Снимок для расширения. Формат (v1), массивы вместо объектов — чтобы уложиться в размер:
 *   { v:1, t:<мс>, live:<0|1>, p:[ игрок… ], st:[ логины на сцене… ], tp:[ логины топа по порядку… ] }
 * игрок = [ login, name, hero, level, xp, xpNeed, maxed(0|1), color, uid, totalXp, rank, mult, [id наград…], маска доступных героев ]
 * маска: группы по 6 hex-символов (24 бита), бит i — можно ли взять героя i из списка id героев по алфавиту; hv — отпечаток этого списка (heroHash), hn — сколько героев, cc — команда выбора героя в чате (например «!герой»)
 * Каталог наград (названия, описания, иконки) идёт отдельным сообщением { v:1, k:'aw', a:[[id,название,описание,иконка]] } — см. buildCatalog в awards.js.
 * Игроков в p ровно столько, сколько нужно сцене и топу (без повторов). Если не влезает в maxBytes — сначала сокращается топ, затем сцена.
 */
function buildSnapshot(pixelHeroes, opts = {}) {
  const topSize = clampInt(opts.topSize, 5, 25, DEFAULTS.topSize);
  const maxBytes = clampInt(opts.maxBytes, 1000, 5000, DEFAULTS.maxBytes);
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const allTop = pixelHeroes.getTop(500);                       // уже отсортирован; нужен для места в рейтинге всех, кто на сцене
  const rank = new Map(allTop.map((x) => [x.login, x.rank]));
  const byLogin = new Map(allTop.map((x) => [x.login, x]));
  const stage = pixelHeroes.getRoster();                        // кто сейчас на сцене
  const heroIds = Array.isArray(opts.heroIds) ? opts.heroIds : [];
  const awardsOf = typeof opts.awardsOf === 'function' ? (l) => opts.awardsOf(l).slice(0, 12) : () => [];
  const row = (login) => {
    const p = byLogin.get(login) || pixelHeroes.getProfile(login);
    if (!p) return null;
    return [p.login, cut(p.name, 20), p.hero || '', p.level, p.xp, p.xpNeed || 0, p.maxed ? 1 : 0, p.color || '', p.uid || '', p.totalXp, rank.get(p.login) || 0, p.multiplier || 1, awardsOf(p.login), heroIds.length ? packFlags(pixelHeroes.usableFlags(p.login, heroIds)) : ''];
  };
  let stLogins = stage.map((r) => r.login);
  let tpLogins = allTop.slice(0, topSize).map((x) => x.login);
  const make = () => {
    const logins = [...new Set([...stLogins, ...tpLogins])];
    const p = logins.map(row).filter(Boolean);
    const have = new Set(p.map((r) => r[0]));
    return { v: 1, t: now, live: opts.live ? 1 : 0, hv: heroIds.length ? heroHash(heroIds) : '', hn: heroIds.length, cc: typeof opts.chooseCommand === 'string' ? opts.chooseCommand.slice(0, 32) : '', p, st: stLogins.filter((l) => have.has(l)), tp: tpLogins.filter((l) => have.has(l)) };
  };
  let snap = make(), json = JSON.stringify(snap);
  let trimmedTop = 0, trimmedStage = 0;
  while (byteLen(json) > maxBytes && (tpLogins.length > 3 || stLogins.length > 3)) {
    if (tpLogins.length > 3) { tpLogins = tpLogins.slice(0, -1); trimmedTop++; }
    else { stLogins = stLogins.slice(0, -1); trimmedStage++; }
    snap = make(); json = JSON.stringify(snap);
  }
  return { snapshot: snap, json, bytes: byteLen(json), trimmedTop, trimmedStage };
}

/**
 * Состояние отправки. deps: { pixelHeroes, getOwnerId(), isLive(), fetchImpl?, now?, file? } — всё подменяется в тестах.
 */
function createExtension(deps) {
  const file = deps.file === undefined ? FILE : deps.file;
  const doFetch = deps.fetchImpl || ((...a) => fetch(...a));
  const now = deps.now || (() => Date.now());
  let cfg = { ...DEFAULTS };
  let status = { lastOkAt: 0, lastErrorAt: 0, lastError: '', sent: 0, lastBytes: 0, lastTrimmed: 0, retryAfter: 0, lastHash: '', lastSentAt: 0 };
  let busy = false;

  function load() {
    if (!file) return;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      cfg = sanitize({ ...DEFAULTS, ...raw });
    } catch (e) { /* файла нет или он повреждён — настройки по умолчанию */ }
  }
  function save() {
    if (!file) return;
    try { fs.writeFileSync(file + '.tmp', JSON.stringify(cfg, null, 2)); fs.renameSync(file + '.tmp', file); }
    catch (e) { console.warn('[Расширение Twitch] Не удалось сохранить настройки:', e.message); }
  }
  function sanitize(c) {
    const secret = String(c.secret || '').trim();
    return {
      enabled: c.enabled === true,
      clientId: String(c.clientId || '').trim().slice(0, 64),
      secret: /^[A-Za-z0-9+/=_-]{16,200}$/.test(secret) ? secret : '',
      ownerId: /^\d{1,15}$/.test(String(c.ownerId || '').trim()) ? String(c.ownerId).trim() : '',
      topSize: clampInt(c.topSize, 5, 25, DEFAULTS.topSize),
      intervalSec: clampInt(c.intervalSec, 3, 60, DEFAULTS.intervalSec),
      maxBytes: clampInt(c.maxBytes, 1000, 5000, DEFAULTS.maxBytes),
    };
  }
  load();

  const ownerId = () => cfg.ownerId || String((deps.getOwnerId && deps.getOwnerId()) || '');
  const configured = () => !!(cfg.clientId && cfg.secret && ownerId());

  /** Настройки для админки: секрет наружу не отдаётся — только факт, что он задан. */
  function getPublic() {
    return { enabled: cfg.enabled, clientId: cfg.clientId, hasSecret: !!cfg.secret, ownerId: cfg.ownerId, ownerIdEffective: ownerId(), topSize: cfg.topSize, intervalSec: cfg.intervalSec, maxBytes: cfg.maxBytes, configured: configured() };
  }
  /** Частичное обновление настроек. secret: пустая строка — «не менять»; null — удалить. Возвращает { ok, error?, config }. */
  function update(patch = {}) {
    const next = { ...cfg };
    for (const k of ['enabled', 'clientId', 'ownerId', 'topSize', 'intervalSec', 'maxBytes']) if (k in patch) next[k] = patch[k];
    if (patch.secret === null) next.secret = '';
    else if (typeof patch.secret === 'string' && patch.secret.trim()) {
      if (!/^[A-Za-z0-9+/=_-]{16,200}$/.test(patch.secret.trim())) return { ok: false, error: 'Секрет (Key) расширения выглядит неверно: это строка из латинских букв, цифр и знаков +/=, скопируйте её целиком из консоли Twitch.', config: getPublic() };
      next.secret = patch.secret.trim();
    }
    if ('ownerId' in patch && String(patch.ownerId || '').trim() && !/^\d{1,15}$/.test(String(patch.ownerId).trim())) return { ok: false, error: 'ID канала — только цифры (его можно оставить пустым: возьмётся из входа через Twitch).', config: getPublic() };
    if ('topSize' in patch && !Number.isInteger(patch.topSize)) return { ok: false, error: 'Размер топа — целое число от 5 до 25.', config: getPublic() };
    if ('intervalSec' in patch && !Number.isInteger(patch.intervalSec)) return { ok: false, error: 'Интервал — целое число секунд от 3 до 60.', config: getPublic() };
    if ('maxBytes' in patch && !Number.isInteger(patch.maxBytes)) return { ok: false, error: 'Размер сообщения — целое число байт от 1000 до 5000.', config: getPublic() };
    if (next.enabled === true && !(next.clientId && next.secret)) return { ok: false, error: 'Чтобы включить отправку, укажите Client ID и секрет (Key) расширения.', config: getPublic() };
    cfg = sanitize(next);
    status.lastHash = '';                                             // настройки сменились — следующий проход отправит снимок заново
    save();
    return { ok: true, config: getPublic() };
  }

  const heroIdsSorted = () => (deps.pixelHeroes && typeof deps.pixelHeroes.list === 'function' ? deps.pixelHeroes.list().map((h) => h.id).sort() : []);
  function currentSnapshot() {
    return buildSnapshot(deps.pixelHeroes, { topSize: cfg.topSize, maxBytes: cfg.maxBytes, live: deps.isLive ? deps.isLive() : false, now: now(), awardsOf: deps.awards ? (l) => deps.awards.awardsOf(l) : null, heroIds: heroIdsSorted(), chooseCommand: deps.getChooseCommand ? deps.getChooseCommand() : '' });
  }

  /** Отправка одного сообщения в Twitch. Возвращает { ok, status?, error? }. */
  async function post(json) {
    const owner = ownerId();
    const token = signJwt({ exp: Math.floor(now() / 1000) + 60, user_id: owner, channel_id: owner, role: 'external', pubsub_perms: { send: ['*'] } }, cfg.secret);
    let res;
    try {
      res = await doFetch(HELIX_PUBSUB, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Client-Id': cfg.clientId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: ['broadcast'], broadcaster_id: owner, is_global_broadcast: false, message: json }),
      });
    } catch (e) { return { ok: false, error: 'Нет связи с Twitch: ' + (e && e.message ? e.message : e) }; }
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    let detail = '';
    try { const j = await res.json(); detail = (j && (j.message || j.error)) || ''; } catch (e) { /* тела может не быть */ }
    const hint = res.status === 401 ? ' — проверьте Client ID и секрет (Key) расширения' : res.status === 403 ? ' — проверьте, что расширение установлено и активировано на вашем канале и что ID канала верный' : res.status === 429 ? ' — слишком часто, отправка притормозит' : '';
    const retry = res.status === 429 ? Number(res.headers && res.headers.get && res.headers.get('ratelimit-reset')) : 0;
    return { ok: false, status: res.status, error: `Twitch ответил ${res.status}${detail ? ' (' + detail + ')' : ''}${hint}`, retryAt: retry ? retry * 1000 : 0 };
  }

  /** Каталог наград (названия, описания, иконки) — отдельными сообщениями, только если он изменился или пора напомнить зрителям, зашедшим позже. Ошибка не мешает основному снимку. */
  async function sendCatalog(force) {
    if (!deps.awards || typeof deps.awards.buildCatalog !== 'function') return;
    const msgs = deps.awards.buildCatalog(Math.min(cfg.maxBytes, 4800));
    if (!msgs.length) return;
    const hash = crypto.createHash('sha1').update(JSON.stringify(msgs)).digest('hex');
    const t = now();
    if (!force && hash === status.lastCatalogHash && t - (status.lastCatalogAt || 0) < 4.5 * 60 * 1000) return;
    for (const m of msgs) { const r = await post(JSON.stringify(m)); if (!r.ok) return; }
    status.lastCatalogHash = hash; status.lastCatalogAt = t;
  }

  /**
   * Один проход: если включено и настроено, и снимок изменился (или force) — отправляет. Параллельные проходы не запускаются.
   * force — отправить, даже если ничего не менялось (кнопка «Отправить сейчас»). Возвращает { sent, ok?, error?, bytes? }.
   */
  async function tick(force = false) {
    if (busy) return { sent: false, reason: 'busy' };
    if (!force && (!cfg.enabled || !configured())) return { sent: false, reason: 'off' };
    if (!configured()) return { sent: false, ok: false, error: 'Не заданы Client ID, секрет или ID канала (нужен вход через Twitch).' };
    const t = now();
    if (!force && (t < status.retryAfter || t - status.lastSentAt < cfg.intervalSec * 1000)) return { sent: false, reason: 'wait' };
    const snap = currentSnapshot();
    const hash = crypto.createHash('sha1').update(JSON.stringify({ ...snap.snapshot, t: 0 })).digest('hex');   // время в снимке не считается изменением
    if (!force && hash === status.lastHash && t - status.lastOkAt < 5 * 60 * 1000) { if (!busy) { busy = true; try { await sendCatalog(false); } finally { busy = false; } } return { sent: false, reason: 'same' }; }   // игроки не менялись, но каталог наград мог (закрыли награду, поправили описание)   // без изменений — раз в 5 минут всё равно «пульс», чтобы зашедший позже зритель получил картину
    busy = true;
    try {
      status.lastSentAt = t;
      const r = await post(snap.json);
      if (r.ok) {
        status = { ...status, lastOkAt: now(), lastError: '', sent: status.sent + 1, lastBytes: snap.bytes, lastTrimmed: snap.trimmedTop + snap.trimmedStage, lastHash: hash, retryAfter: 0 };
        await sendCatalog(force);
        return { sent: true, ok: true, bytes: snap.bytes, trimmed: snap.trimmedTop + snap.trimmedStage };
      }
      status.lastErrorAt = now(); status.lastError = r.error;
      status.retryAfter = r.status === 429 ? Math.max(r.retryAt || 0, now() + 30000) : now() + Math.min(5 * 60000, Math.max(15000, cfg.intervalSec * 3000)); // после ошибки пауза — не долбим Twitch
      return { sent: true, ok: false, error: r.error };
    } finally { busy = false; }
  }

  return {
    getPublic, update, tick,
    getStatus: () => ({ ...status }),
    preview: () => { const s = currentSnapshot(); return { bytes: s.bytes, maxBytes: cfg.maxBytes, trimmedTop: s.trimmedTop, trimmedStage: s.trimmedStage, stage: s.snapshot.st.length, top: s.snapshot.tp.length, players: s.snapshot.p.length, snapshot: s.snapshot }; },
  };
}

module.exports = { createExtension, buildSnapshot, signJwt, heroHash, packFlags, DEFAULTS, FILE };
