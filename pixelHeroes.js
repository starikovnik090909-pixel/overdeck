// pixelHeroes.js
// Герои пиксельного алерта «ЧатАватары» (страница public/pixel-avatar.html):
//  • СПИСОК ГЕРОЕВ — это папки public/pixel-avatar/<id>/ с manifest.json (их собирают tools/build-pixel-pack.py и tools/build-new-heroes.py).
//    Добавили папку — в админке появилась карточка героя, ничего регистрировать не нужно. Карточки группируются по полю group.
//  • НА ОВЕРЛЕЕ — какие герои показаны вручную («Показать в оверлее» на карточке); порядок важен. Хранится в памяти.
//  • ГЕРОИ ЧАТТЕРОВ — когда включено «Выдавать героев чаттерам», КАЖДОМУ, кто написал в чат, при первом сообщении выдаётся случайный герой из тех,
//    у кого стоит галочка «выдавать». Пока в запасе есть герои, которых на сцене ещё нет, выбирается среди них (чтобы зрители не были «близнецами»).
//    Герой закрепляется за человеком до конца сессии, уходит со сцены после IDLE_MS молчания; на сцене не больше MAX_CHATTERS героев чаттеров
//    (при переполнении уходит тот, кто молчит дольше всех). Хранится в памяти: страница алерта получает список при подключении, поэтому после
//    обновления источника в OBS герои возвращаются; после перезапуска сервера сцена пустая.
//  • НАСТРОЙКИ (сохраняются в файле, чтобы пережить перезапуск): «выдавать героев чаттерам», «режим 2D» (все ходят по низу экрана) и галочки героев.
//  • ПОВЕДЕНИЕ героев (behavior): режим «бродят всегда» / «гуляют порциями, потом отдыхают» / «стоят на месте», число прогулок до отдыха, длительность отдыха и пауз, шанс доп. анимации
//    (прыжок, удар, жест, заклинание — manifest.extras героя), шанс афк-действия и шанс отреагировать на своё сообщение; какие виды доп. анимаций разрешены. Сохраняется в файле, уходит страницам в settings.
//  • РАЗМЕР КАЖДОГО ГЕРОЯ (heroScale): отдельно от категории, тоже 25–300 %; итоговый размер = категория × герой.
//  • РУЧНЫЕ ПРАВКИ ПРОФИЛЯ из админки: смена аватара игрока (setProfileHero) и ручной уровень (setLevel — опыт ставится на начало уровня).
//  • РАЗМЕР ПО КАТЕГОРИЯМ: у каждой категории (группы карточек, например «Воины») можно задать размер героев в процентах (25–300, по умолчанию 100) — применяется на оверлее
//    на лету ко всем героям категории, в том числе уже стоящим на сцене.
//  • ПОДПИСЬ над героем (ник и уровень «lvl N»): цвет ника (как в Twitch или свой), цвет шрифта уровня и цвет его плашки — тоже настройки, сохраняются в файле.
//  • ПРОФИЛИ чаттеров (топ в админке): каждому, кто писал в чат, ведётся профиль — ник, цвет ника, ЕГО герой (аватар), общий опыт, роли (подписка / VIP / модератор), когда был в
//    чате. Хранятся в pixel_profiles.json (не больше MAX_PROFILES; при переполнении уходит с наименьшим опытом и давним визитом). Герой за человеком ЗАКРЕПЛЁН: вернувшись
//    после молчания, он получает того же героя, если папка героя на месте. Топ — по общему опыту (то есть по уровню, затем по прогрессу внутри уровня).
//  • ОПЫТ и УРОВНИ — правила и баланс в xpRules.js (кривая до 99-го уровня, ставки, множители ролей). Здесь — начисления: за заход на трансляцию (один раз за трансляцию), за
//    присутствие (каждые 10 минут, пока человек «в чате»), за сообщения (с паузой и потолком в час), за участие в голосовании (ставке); множитель — по ролям. Опыт идёт
//    только пока включено «Выдавать героев чаттерам» и (по умолчанию) пока стрим идёт — переключатель «Опыт только пока идёт стрим». Уровень — число у ника над героем.
//  • ТРАНСЛЯЦИЯ (сессия): заход засчитывается раз за трансляцию. Новая трансляция начинается, когда после паузы больше SESSION_GAP_MS приходит живая активность, и по кнопке
//    «Сбросить статистику стрима». Хранится в файле настроек, поэтому перезапуск сервера посреди стрима заход повторно не засчитывает.

const fs = require('fs');
const path = require('path');
const XPR = require('./xpRules');

const HEROES_DIR = path.join(__dirname, 'public', 'pixel-avatar');
const SETTINGS_FILE = path.join(__dirname, 'pixel_heroes_settings.json');
const ID_RE = /^[a-z0-9_-]{1,40}$/i;
const LOGIN_RE = /^[a-z0-9_]{1,40}$/;     // логин Twitch — строчные латинские буквы, цифры и «_»
const MAX_CHATTERS = 30;
const IDLE_MS = 10 * 60 * 1000;
const MAX_LEVEL = XPR.LEVEL_CAP;            // 99
const MAX_PROFILES = 1000;
const SESSION_GAP_MS = 30 * 60 * 1000;      // пауза, после которой живая активность начинает новую трансляцию
const SESSION_SAVE_EVERY_MS = 5 * 60 * 1000;
const SCALE_MIN = 25, SCALE_MAX = 300;       // допустимый размер категории, %
const HEX_RE = /^#[0-9a-f]{6}$/i;
const TAG_DEFAULT = { nickColorMode: 'twitch', nickColor: '#ffffff', levelColor: '#1b1b2f', levelBg: '#ffd34d' }; // подпись над героем: ник — цвет из Twitch; уровень — тёмный шрифт на жёлтой плашке
const EXTRA_KINDS = ['jump', 'attack', 'emote', 'cast'];   // виды доп. анимаций героя (manifest.extras[].kind)
const BEHAVIOR_MODES = ['roam', 'limited', 'stay'];
const BEHAVIOR_DEFAULT = { mode: 'limited', walksMin: 2, walksMax: 5, restMin: 8, restMax: 25, pauseMin: 1, pauseMax: 3, extraChance: 35, afkChance: 35, reactChance: 30, kinds: { jump: true, attack: true, emote: true, cast: true } };
const BEHAVIOR_LIMITS = { walksMin: [1, 20, true], walksMax: [1, 20, true], restMin: [1, 600, true], restMax: [1, 600, true], pauseMin: [0, 60, false], pauseMax: [0, 60, false], extraChance: [0, 100, true], afkChance: [0, 100, true], reactChance: [0, 100, true] };

/** Проверяет и дополняет настройки поведения: patch поверх base. Возвращает новый объект или null, если что-то недопустимо (min > max, не число, неизвестный режим). */
function mergeBehavior(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const next = { ...base, kinds: { ...base.kinds } };
  let any = false;
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (k === 'mode') { if (!BEHAVIOR_MODES.includes(v)) return null; next.mode = v; any = true; }
    else if (k === 'kinds') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
      for (const kk of Object.keys(v)) { if (!EXTRA_KINDS.includes(kk) || typeof v[kk] !== 'boolean') return null; next.kinds[kk] = v[kk]; }
      any = true;
    } else if (BEHAVIOR_LIMITS[k]) {
      const [lo, hi, int] = BEHAVIOR_LIMITS[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi || (int && !Number.isInteger(v))) return null;
      next[k] = int ? v : Math.round(v * 10) / 10; any = true;
    } else return null;
  }
  if (!any || next.walksMin > next.walksMax || next.restMin > next.restMax || next.pauseMin > next.pauseMax) return null;
  return next;
}
const UNLOCK_DEFAULT = { lock: false, rewardTitle: 'Разблокировать аватар', text: '@{user}, ты открыл аватар «{hero}»! Сменить на него: {command} {hero}' };
const UNLOCK_TEXT_MAX = 300, UNLOCK_TITLE_MAX = 60, MAX_UNLOCKED = 200;
const PROFILES_FILE = path.join(__dirname, 'pixel_profiles.json');

/** Герои из папки: id, подпись, размеры ячейки, число кадров. Повреждённая папка пропускается, а не роняет список. */
function listHeroes(dir = HEROES_DIR) {
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && ID_RE.test(d.name)).map((d) => d.name).sort(); } catch (e) { return []; }
  const heroes = [];
  names.forEach((id) => {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, id, 'manifest.json'), 'utf8'));
      if (!m || !m.cell || !m.idle || !m.idle.frames || !Array.isArray(m.directions) || !m.directions.length) return;
      heroes.push({
        id,
        title: typeof m.title === 'string' && m.title ? m.title : id,
        group: typeof m.group === 'string' && m.group ? m.group : 'Герои', // заголовок над карточками в админке
        scale: Number.isFinite(m.scale) && m.scale > 0 ? m.scale : 1,       // во сколько раз герой показывается крупнее ячейки (у мелких кадров ×1.5…×3)
        afk: Array.isArray(m.afk) && m.afk.length > 0,                       // есть ли афк-действия (например «садится и сидит»)
        cell: { w: m.cell.w, h: m.cell.h },
        pivot: m.pivot && Number.isFinite(m.pivot.x) && Number.isFinite(m.pivot.y) ? { x: m.pivot.x, y: m.pivot.y } : { x: Math.round(m.cell.w / 2), y: m.cell.h }, // опорная точка (ноги) — по ней в превью совмещаются доп. анимации
        fps: m.fps || 12,
        speed: m.speed || 80,
        directions: m.directions.length,
        // для карточки в админке: стойка лицом к зрителю (первое направление) — файл атласа и число кадров
        preview: { file: m.idle.file, frames: m.idle.frames[m.directions[0]] || 1 },
        // доп. анимации (прыжки, удары, жесты…): для окна просмотра в админке и для команд чата; битые записи пропускаются
        extras: (Array.isArray(m.extras) ? m.extras : []).filter((e) => e && typeof e.name === 'string' && /^[a-z0-9_-]{1,30}$/i.test(e.name) && EXTRA_KINDS.includes(e.kind) && typeof e.file === 'string' && e.frames && e.cell && e.pivot)
          .map((e) => ({ name: e.name, title: typeof e.title === 'string' && e.title ? e.title : e.name, kind: e.kind, file: e.file, frames: e.frames[m.directions[0]] || e.columns || 1, cell: { w: e.cell.w, h: e.cell.h }, pivot: { x: e.pivot.x, y: e.pivot.y }, fps: e.fps || null })),
      });
    } catch (e) { /* пака без manifest.json или с битым файлом в списке нет */ }
  });
  // сначала по группе, внутри группы — по id: карточки одной группы лежат рядом, порядок не прыгает
  return heroes.sort((a, b) => a.group.localeCompare(b.group, 'ru') || a.id.localeCompare(b.id));
}

/**
 * Состояние пиксельного алерта. dir — папка героев; opts.file — файл настроек, opts.profilesFile — файл профилей (null — не сохранять, так работают тесты);
 * opts.now / opts.random — подмена часов и случайности для тестов; opts.isLive — функция «идёт ли стрим» (по умолчанию всегда да).
 */
function createState(dir = HEROES_DIR, opts = {}) {
  const now = opts.now || (() => Date.now());
  const random = opts.random || Math.random;
  const file = opts.file || null;
  const profilesFile = opts.profilesFile || null;
  const saveDelay = opts.saveDelay === undefined ? 2000 : opts.saveDelay;
  const isLive = typeof opts.isLive === 'function' ? opts.isLive : () => true;
  let active = [];
  let settings = { chatters: true, plane2d: false, xpOnlyLive: true };
  const groupScale = {};                      // категория -> размер в % (только отличные от 100)
  const heroScale = {};                       // id героя -> размер в % (только отличные от 100)
  let tagStyle = { ...TAG_DEFAULT };
  let unlockCfg = { ...UNLOCK_DEFAULT };
  let behavior = { ...BEHAVIOR_DEFAULT, kinds: { ...BEHAVIOR_DEFAULT.kinds } };
  let session = { id: 0, lastAt: 0 };         // текущая трансляция: id (время начала) и когда была последняя живая активность
  let sessionSavedAt = 0;
  const disabled = new Set();                 // герои, которых НЕ выдавать чаттерам (галочка снята)
  const roster = new Map();                   // login -> { login, name, color, hero, level, lastSeen } — герои чаттеров на сцене
  const profiles = new Map();                 // login -> { login, name, color, hero, xp (ОБЩИЙ опыт), lastSeen, flags {sub,vip,mod}, joinSession }
  const runtime = new Map();                  // login -> { lastPresenceAt, lastMsgAt, winStart, winXp } — служебное, в память
  const legacyLevels = new Map();             // уровни из старого файла настроек (до системы опыта) — переводятся в опыт при запуске

  const known = (id) => typeof id === 'string' && ID_RE.test(id) && listHeroes(dir).some((h) => h.id === id);
  const r2 = (x) => Math.round(x * 100) / 100;
  const validColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
  const mkProfile = (key, name, color, t) => ({ login: key, name, uid: '', color, hero: null, unlocked: [], xp: 0, lastSeen: t, flags: { sub: false, vip: false, mod: false }, joinSession: 0 });

  function load() {
    if (!file) return;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && typeof raw === 'object') {
        if (typeof raw.chatters === 'boolean') settings.chatters = raw.chatters;
        if (typeof raw.plane2d === 'boolean') settings.plane2d = raw.plane2d;
        if (typeof raw.xpOnlyLive === 'boolean') settings.xpOnlyLive = raw.xpOnlyLive;
        if (Array.isArray(raw.disabled)) raw.disabled.filter((id) => typeof id === 'string' && ID_RE.test(id)).forEach((id) => disabled.add(id));
        if (raw.groupScale && typeof raw.groupScale === 'object') for (const [g, v] of Object.entries(raw.groupScale)) if (g && g.length <= 60 && !['__proto__', 'constructor', 'prototype'].includes(g) && Number.isInteger(v) && v >= SCALE_MIN && v <= SCALE_MAX && v !== 100) groupScale[g] = v; // категории, которых сейчас нет (пак временно убрали), не теряем
        if (raw.heroScale && typeof raw.heroScale === 'object') for (const [id, v] of Object.entries(raw.heroScale)) if (ID_RE.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id) && Number.isInteger(v) && v >= SCALE_MIN && v <= SCALE_MAX && v !== 100) heroScale[id] = v;
        if (raw.tag && typeof raw.tag === 'object') {
          if (raw.tag.nickColorMode === 'twitch' || raw.tag.nickColorMode === 'custom') tagStyle.nickColorMode = raw.tag.nickColorMode;
          ['nickColor', 'levelColor', 'levelBg'].forEach((k) => { if (typeof raw.tag[k] === 'string' && HEX_RE.test(raw.tag[k])) tagStyle[k] = raw.tag[k].toLowerCase(); });
        }
        if (raw.unlock && typeof raw.unlock === 'object') {
          if (typeof raw.unlock.lock === 'boolean') unlockCfg.lock = raw.unlock.lock;
          if (typeof raw.unlock.rewardTitle === 'string' && raw.unlock.rewardTitle.length <= UNLOCK_TITLE_MAX) unlockCfg.rewardTitle = raw.unlock.rewardTitle.trim();
          if (typeof raw.unlock.text === 'string' && raw.unlock.text.trim() && raw.unlock.text.length <= UNLOCK_TEXT_MAX) unlockCfg.text = raw.unlock.text.trim();
        }
        if (raw.behavior && typeof raw.behavior === 'object') { const b = mergeBehavior(behavior, raw.behavior); if (b) behavior = b; }   // испорченный блок — остаются значения по умолчанию
        if (raw.session && Number.isFinite(raw.session.id) && Number.isFinite(raw.session.lastAt)) session = { id: raw.session.id, lastAt: raw.session.lastAt };
        if (raw.levels && typeof raw.levels === 'object') for (const [k, v] of Object.entries(raw.levels)) if (LOGIN_RE.test(k) && Number.isInteger(v) && v > 0 && v <= MAX_LEVEL) legacyLevels.set(k, v);
      }
    } catch (e) { /* файла нет или он повреждён — работаем с настройками по умолчанию */ }
  }
  function save() {
    if (!file) return;
    try { fs.writeFileSync(file, JSON.stringify({ ...settings, disabled: [...disabled].sort(), session, groupScale, heroScale, tag: tagStyle, behavior, unlock: unlockCfg }, null, 2)); sessionSavedAt = now(); } catch (e) { console.warn('[Пиксельные герои] Не удалось сохранить настройки:', e.message); }
  }
  load();

  function loadProfiles() {
    if (!profilesFile) return;
    try {
      const raw = JSON.parse(fs.readFileSync(profilesFile, 'utf8'));
      (Array.isArray(raw && raw.profiles) ? raw.profiles : []).forEach((p) => {
        if (!p || typeof p.login !== 'string' || !LOGIN_RE.test(p.login)) return;
        const f = p.flags && typeof p.flags === 'object' ? p.flags : {};
        profiles.set(p.login, {
          login: p.login, name: String(p.name || p.login).slice(0, 40), color: validColor(p.color),
          hero: typeof p.hero === 'string' && ID_RE.test(p.hero) ? p.hero : null,
          unlocked: [...new Set((Array.isArray(p.unlocked) ? p.unlocked : []).filter((id) => typeof id === 'string' && ID_RE.test(id)))].slice(0, MAX_UNLOCKED),
          uid: /^\d{1,15}$/.test(String(p.uid || '')) ? String(p.uid) : '',
          xp: Number.isFinite(p.xp) && p.xp >= 0 ? r2(p.xp) : 0, lastSeen: Number.isFinite(p.lastSeen) ? p.lastSeen : 0,
          flags: { sub: f.sub === true, vip: f.vip === true, mod: f.mod === true }, joinSession: Number.isFinite(p.joinSession) ? p.joinSession : 0,
        });
      });
    } catch (e) { /* файла нет или он повреждён — профили начинаются с нуля */ }
  }
  let saveTimer = null;
  function saveProfilesNow() {
    saveTimer = null;
    if (!profilesFile) return;
    try { fs.writeFileSync(profilesFile, JSON.stringify({ profiles: [...profiles.values()] })); } catch (e) { console.warn('[Пиксельные герои] Не удалось сохранить профили:', e.message); }
  }
  /** Сохранение профилей — не чаще раза в saveDelay мс (сообщения идут потоком, писать файл на каждое незачем). */
  function saveProfiles() {
    if (!profilesFile) return;
    if (saveDelay <= 0) return saveProfilesNow();
    if (!saveTimer) { saveTimer = setTimeout(saveProfilesNow, saveDelay); if (saveTimer.unref) saveTimer.unref(); }
  }
  function trimProfiles() {
    if (profiles.size <= MAX_PROFILES) return;
    const worst = [...profiles.values()].sort((a, b) => (a.xp - b.xp) || (a.lastSeen - b.lastSeen))[0];
    profiles.delete(worst.login);
  }
  loadProfiles();
  if (legacyLevels.size) {                    // перенос уровней из файла до системы опыта: человек получает опыт, с которого начинается его уровень
    for (const [login, level] of legacyLevels) {
      const p = profiles.get(login) || mkProfile(login, login, null, now());
      p.xp = Math.max(p.xp, XPR.totalForLevel(level)); profiles.set(login, p);
    }
    trimProfiles(); saveProfiles(); save();   // настройки пересохраняются уже без устаревшего поля levels
  }

  /** Прибавляет человеку base × множитель ролей. true — если у того, кто сейчас на сцене, сменился уровень (страницам нужно разослать список). */
  function gain(p, base) {
    const before = XPR.levelFromTotal(p.xp);
    p.xp = r2(p.xp + base * XPR.multiplier(p.flags));
    const after = XPR.levelFromTotal(p.xp);
    const r = roster.get(p.login);
    if (r) r.level = after;
    return before !== after && !!r;
  }
  const countsXp = () => settings.chatters && (!settings.xpOnlyLive || !!isLive());
  /** Живая активность: продолжает текущую трансляцию или (после паузы дольше SESSION_GAP_MS) начинает новую. */
  function touchSession(t) {
    const isNew = !session.id || t - session.lastAt > SESSION_GAP_MS;
    session = isNew ? { id: t, lastAt: t } : { id: session.id, lastAt: t };
    if (isNew || t - sessionSavedAt > SESSION_SAVE_EVERY_MS) save();
  }

  return {
    list: () => listHeroes(dir).map((h) => ({ ...h, give: !disabled.has(h.id) })),
    getActive: () => active.slice(),
    getSettings: () => ({ ...settings }),
    getRoster: () => [...roster.values()].map((r) => ({ login: r.login, name: r.name, color: r.color, hero: r.hero, level: r.level })),
    getSession: () => ({ ...session }),
    getGroupScales: () => ({ ...groupScale }),
    getUnlock: () => ({ ...unlockCfg }),
    /** Настройки разблокировки: { lock, rewardTitle, text } (любая часть). null — недопустимо, ничего не изменено. */
    setUnlock(patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
      const next = { ...unlockCfg }; let any = false;
      for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (k === 'lock') { if (typeof v !== 'boolean') return null; next.lock = v; }
        else if (k === 'rewardTitle') { if (typeof v !== 'string' || v.trim().length > UNLOCK_TITLE_MAX) return null; next.rewardTitle = v.trim(); }
        else if (k === 'text') { if (typeof v !== 'string' || !v.trim() || v.length > UNLOCK_TEXT_MAX) return null; next.text = v.replace(/\s*[\r\n]+\s*/g, ' ').trim(); }
        else return null;
        any = true;
      }
      if (!any) return null;
      unlockCfg = next; save();
      return { ...unlockCfg };
    },
    /** Совпадает ли название награды за баллы с настроенным (без учёта регистра и лишних пробелов). Пустое название в настройках — не совпадает ни с чем. */
    matchesReward: (title) => !!unlockCfg.rewardTitle && String(title || '').trim().toLowerCase() === unlockCfg.rewardTitle.toLowerCase(),
    /** Аватары, которыми игрок может пользоваться: текущий и открытые (только существующие). */
    unlockedOf(login) {
      const p = profiles.get(String(login || '').toLowerCase()); if (!p) return [];
      return [...new Set([p.hero, ...(p.unlocked || [])].filter((id) => id && known(id)))];
    },
    /** Можно ли игроку взять этого героя: замок выключен — любого, включён — только открытого. */
    /** Закрытые герои — те, у кого СНЯТА галочка «выдавать чаттерам»: их игрок получает только за награду. */
    closedIds: () => listHeroes(dir).map((h) => h.id).filter((id) => disabled.has(id)),
    /** Закрытые герои, которые игрок уже открыл (в том числе тот, что сейчас на нём). */
    earnedOf(login) { const own = new Set(this.unlockedOf(login)); return this.closedIds().filter((id) => own.has(id)); },
    /** Можно ли игроку взять этого героя: замок выключен — любого; включён — выдаваемого всем или уже открытого игроком. */
    canUse(login, heroId) { return !unlockCfg.lock || !disabled.has(heroId) || this.unlockedOf(login).includes(heroId); },
    /** Герои, которых игрок может получить случайной командой: выдаваемые всем + открытые им закрытые. */
    availableOf(login) { const own = new Set(this.unlockedOf(login)); return listHeroes(dir).map((h) => h.id).filter((id) => !disabled.has(id) || own.has(id)); },
    /**
     * Открывает игроку случайный ЕЩЁ ЗАКРЫТЫЙ аватар — из тех, у кого снята галочка «выдавать» (обычным чаттерам они не достаются).
     * Профиль создаётся, если игрок ещё ни разу не писал.
     * { ok: true, hero, title } или { ok: false, reason: 'login' | 'no-closed' (закрытых героев нет) | 'none-left' (все закрытые уже открыты) }.
     */
    unlockRandom(login, name) {
      const key = String(login || '').toLowerCase();
      if (!LOGIN_RE.test(key)) return { ok: false, reason: 'login' };
      const closed = this.closedIds();
      if (!closed.length) return { ok: false, reason: 'no-closed' };
      let p = profiles.get(key);
      if (!p) { p = mkProfile(key, String(name || key).slice(0, 40), null, now()); profiles.set(key, p); }
      const have = new Set(this.unlockedOf(key));
      const left = closed.filter((id) => !have.has(id));
      if (!left.length) { saveProfiles(); return { ok: false, reason: 'none-left' }; }
      const hero = left[Math.min(left.length - 1, Math.floor(random() * left.length))];
      p.unlocked = [...(p.unlocked || []), hero].slice(-MAX_UNLOCKED);
      trimProfiles(); saveProfiles();
      return { ok: true, hero, title: (listHeroes(dir).find((h) => h.id === hero) || {}).title || hero, unlocked: this.earnedOf(key).length, total: closed.length };
    },
    getBehavior: () => ({ ...behavior, kinds: { ...behavior.kinds } }),
    /** Настройки поведения героев (любая часть полей). null — ничего не изменено: значение недопустимо или «от» больше «до». */
    setBehavior(patch) {
      const next = mergeBehavior(behavior, patch);
      if (!next) return null;
      behavior = next; save();
      return this.getBehavior();
    },
    /** Какие доп. анимации есть у героя: [{ name, title, kind }]. Пусто — героя нет или у него их нет. */
    extrasOf(id) { const h = known(id) ? listHeroes(dir).find((x) => x.id === id) : null; return h ? h.extras.map(({ name, title, kind }) => ({ name, title, kind })) : []; },
    /** Герой человека (на сцене или закреплённый в профиле): id или null. */
    heroOf(login) { const key = String(login || '').toLowerCase(); const r = roster.get(key); if (r) return r.hero; const p = profiles.get(key); return p && p.hero ? p.hero : null; },
    isOnStage: (login) => roster.has(String(login || '').toLowerCase()),
    getHeroScales: () => ({ ...heroScale }),

    /** Размер одного героя в процентах (целое 25–300; 100 — по умолчанию). false — такого героя нет или значение недопустимо. */
    setHeroScale(id, percent) {
      if (!known(id)) return false;
      if (!Number.isInteger(percent) || percent < SCALE_MIN || percent > SCALE_MAX) return false;
      if (percent === 100) delete heroScale[id]; else heroScale[id] = percent;
      save();
      return true;
    },

    /** Есть ли у человека профиль (писал в чат / получил уровень). */
    hasProfile: (login) => profiles.has(String(login || '').toLowerCase()),
    /** Профиль в том же виде, что строка топа (без места). null — профиля нет. */
    /** Какими героями (из переданного списка id) игрок может пользоваться — для расширения Twitch: массив 0/1 в порядке списка. Быстрый вариант canUse: файлы читаются один раз. */
    usableFlags(login, ids) {
      const key = String(login || '').toLowerCase(), p = profiles.get(key);
      const all = new Set(listHeroes(dir).map((h) => h.id));
      const own = new Set(p ? [p.hero, ...(p.unlocked || [])].filter((id) => id && all.has(id)) : []);
      return ids.map((id) => (!unlockCfg.lock || !disabled.has(id) || own.has(id)) ? 1 : 0);
    },
    /** Все известные ники (у кого есть профиль). */
    allLogins() { return [...profiles.keys()]; },
    /** Логины тех, кто писал в чат за последние sinceMs миллисекунд (для событий с наградой). */
    recentLogins(sinceMs) { const t = now() - sinceMs; return [...profiles.values()].filter((p) => p.lastSeen >= t).map((p) => p.login); },
    getProfile(login) {
      const p = profiles.get(String(login || '').toLowerCase());
      if (!p) return null;
      const pr = XPR.progress(p.xp);
      return { login: p.login, uid: p.uid || '', name: p.name, color: p.color, hero: p.hero, level: pr.level, xp: Math.floor(pr.xp), xpNeed: pr.need, maxed: pr.maxed, totalXp: Math.floor(p.xp), multiplier: XPR.multiplier(p.flags), flags: { ...p.flags }, lastSeen: p.lastSeen, onStage: roster.has(p.login), unlocked: this.earnedOf(p.login).length };
    },
    /**
     * Смена аватара игрока из админки: у человека есть профиль и такой герой есть в папке. Если игрок сейчас на сцене — его герой меняется сразу (changed: true — страницам нужно
     * разослать список). Герой закрепляется за человеком (как и выданный случайно), галочка «выдавать чаттерам» тут не мешает — она про случайные выдачи.
     */
    setProfileHero(login, heroId) {
      const key = String(login || '').toLowerCase();
      const p = profiles.get(key);
      if (!LOGIN_RE.test(key) || !p || !known(heroId)) return { ok: false, changed: false };
      p.hero = heroId;
      if (!(p.unlocked || []).includes(heroId)) p.unlocked = [...(p.unlocked || []), heroId].slice(-MAX_UNLOCKED);   // выбранный (в том числе из админки) аватар считается открытым
      const r = roster.get(key);
      const changed = !!r && r.hero !== heroId;
      if (r) r.hero = heroId;
      saveProfiles();
      return { ok: true, changed };
    },
    getTagStyle: () => ({ ...tagStyle }),

    /** Размер героев категории в процентах (целое 25–300; 100 — по умолчанию). false — такой категории нет или значение недопустимо. */
    setGroupScale(group, percent) {
      if (typeof group !== 'string' || !listHeroes(dir).some((h) => h.group === group)) return false;
      if (!Number.isInteger(percent) || percent < SCALE_MIN || percent > SCALE_MAX) return false;
      if (percent === 100) delete groupScale[group]; else groupScale[group] = percent;
      save();
      return true;
    },

    /**
     * Цвета подписи над героем: { nickColorMode: 'twitch' | 'custom', nickColor, levelColor, levelBg } (цвета — #rrggbb). Принимает любую часть полей; если хоть одно
     * известное поле недопустимо — не меняет ничего (false). Лишние поля игнорируются. false и если известных полей нет.
     */
    setTagStyle(patch) {
      if (!patch || typeof patch !== 'object') return false;
      const next = {}; let any = false;
      for (const k of Object.keys(TAG_DEFAULT)) {
        if (!(k in patch)) continue;
        const v = patch[k]; any = true;
        if (k === 'nickColorMode' ? (v !== 'twitch' && v !== 'custom') : (typeof v !== 'string' || !HEX_RE.test(v))) return false;
        next[k] = k === 'nickColorMode' ? v : v.toLowerCase();
      }
      if (!any) return false;
      tagStyle = { ...tagStyle, ...next };
      save();
      return true;
    },

    /** Правила опыта для админки: ставки, множители, длина кривой и ключевые уровни. */
    getRules() {
      return {
        levelCap: XPR.LEVEL_CAP,
        xp: { ...XPR.XP, presenceEveryMin: XPR.XP.presenceEveryMs / 60000, presenceWindowMin: XPR.XP.presenceWindowMs / 60000, messageCooldownSec: XPR.XP.messageCooldownMs / 1000 },
        bonus: { ...XPR.BONUS },
        curve: [1, 2, 3, 5, 10, 25, 50, 75, 99].map((n) => ({ level: n, need: XPR.needForLevel(n), total: XPR.totalForLevel(n) })),
      };
    },

    /** Топ чат-аватаров: по общему опыту (= по уровню, затем по прогрессу в уровне), при равенстве — по свежести визита. Каждая запись — всё, что нужно профилю в админке. */
    getTop(limit = 50) {
      const n = Math.max(1, Math.min(MAX_PROFILES, Number.isInteger(limit) ? limit : 50));
      return [...profiles.values()]
        .map((p) => { const pr = XPR.progress(p.xp); return { raw: p.xp, login: p.login, uid: p.uid || '', name: p.name, color: p.color, hero: p.hero, level: pr.level, xp: Math.floor(pr.xp), xpNeed: pr.need, maxed: pr.maxed, totalXp: Math.floor(p.xp), multiplier: XPR.multiplier(p.flags), flags: { ...p.flags }, lastSeen: p.lastSeen, onStage: roster.has(p.login), unlocked: this.earnedOf(p.login).length }; })
        .sort((a, b) => (b.raw - a.raw) || (b.lastSeen - a.lastSeen) || a.login.localeCompare(b.login))
        .slice(0, n).map(({ raw, ...p }, i) => ({ rank: i + 1, ...p }));
    },
    /** Общий опыт человека (число ≥ 0, хранится с точностью до сотых). Возвращает true, если значение изменилось. Задел и инструмент для ручной правки. */
    setXp(login, xp) {
      const key = String(login || '').toLowerCase();
      if (!LOGIN_RE.test(key) || !Number.isFinite(xp) || xp < 0) return false;
      const p = profiles.get(key) || mkProfile(key, key, null, now());
      const v = r2(xp), changed = p.xp !== v; p.xp = v; profiles.set(key, p);
      const r = roster.get(key); if (r) r.level = XPR.levelFromTotal(v);
      trimProfiles(); if (changed) saveProfiles();
      return changed;
    },

    /** Уровень человека (0, если его нет в профилях). */
    getLevel: (login) => { const p = profiles.get(String(login || '').toLowerCase()); return p ? XPR.levelFromTotal(p.xp) : 0; },
    /** Задаёт уровень (целое 0–99): опыт ставится на начало этого уровня. Если человек на сцене — обновляется и он. true — если уровень изменился у того, кто на сцене (разослать список). */
    setLevel(login, level) {
      const key = String(login || '').toLowerCase();
      if (!LOGIN_RE.test(key) || !Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return false;
      let p = profiles.get(key);
      if (!p) { if (level === 0) return false; p = mkProfile(key, key, null, now()); profiles.set(key, p); } // с уровнем человек попадает в топ, даже если ещё ни разу не писал
      const before = XPR.levelFromTotal(p.xp);
      p.xp = XPR.totalForLevel(level);
      const r = roster.get(key); if (r) r.level = level;
      trimProfiles(); saveProfiles();
      return before !== level && !!r;
    },

    /** Что получает страница алерта: герои, показанные вручную, герои чаттеров и настройки. */
    getPayload() {
      return { active: active.slice(), chatters: settings.chatters ? this.getRoster() : [], settings: { ...settings, groupScale: { ...groupScale }, heroScale: { ...heroScale }, tag: { ...tagStyle }, behavior: { ...behavior, kinds: { ...behavior.kinds } } } };
    },

    /** Показать героя на оверлее (в конец списка). false — такого героя нет. Повторный показ ничего не меняет. */
    show(id) { if (!known(id)) return false; if (!active.includes(id)) active.push(id); return true; },
    /** Убрать героя с оверлея. Убирать того, кого там нет, можно — это не ошибка. false — такого героя нет вообще. */
    hide(id) { if (!known(id)) return false; active = active.filter((x) => x !== id); return true; },
    clear() { active = []; },

    /** Меняет настройки «выдавать героев чаттерам», «режим 2D» и «опыт только пока идёт стрим» (только булевы значения). Выключение выдачи убирает героев чаттеров со сцены. */
    setSettings(patch) {
      const p = patch && typeof patch === 'object' ? patch : {};
      if (typeof p.chatters === 'boolean') { settings.chatters = p.chatters; if (!p.chatters) roster.clear(); }
      if (typeof p.plane2d === 'boolean') settings.plane2d = p.plane2d;
      if (typeof p.xpOnlyLive === 'boolean') settings.xpOnlyLive = p.xpOnlyLive;
      save();
      return { ...settings };
    },

    /** Галочка героя: выдавать ли его чаттерам. false — такого героя нет. */
    setPool(id, enabled) {
      if (!known(id) || typeof enabled !== 'boolean') return false;
      if (enabled) disabled.delete(id); else disabled.add(id);
      save();
      return true;
    },
    getPool: () => listHeroes(dir).map((h) => h.id).filter((id) => !disabled.has(id)),

    /**
     * Пришло сообщение от человека. info: { login, name, color, roles: { sub, vip, mod }, isCommand }.
     * Ведёт профиль, начисляет опыт (заход, присутствие, сообщение) и выдаёт героя. Возвращает { hero, changed, evicted }: hero — id его героя (или null, если выдача
     * выключена / некому выдавать), changed — изменилось ли то, что видит оверлей (состав героев, ник/цвет, уровень) — нужно разослать страницам, evicted — кто ушёл, уступив место.
     */
    onChatter({ login, name, color, roles, isCommand, userId } = {}) {
      if (!settings.chatters) return { hero: null, changed: false };
      const key = String(login || '').toLowerCase();
      if (!LOGIN_RE.test(key)) return { hero: null, changed: false };
      const t = now();
      const display = String(name || key).slice(0, 40), col = validColor(color);
      let p = profiles.get(key);
      const prevSeen = p ? p.lastSeen : 0;
      if (!p) { p = mkProfile(key, display, col, t); profiles.set(key, p); }
      p.name = display; p.color = col; p.lastSeen = t;
      if (/^\d{1,15}$/.test(String(userId || ''))) p.uid = String(userId);   // числовой Twitch ID — по нему расширение Twitch узнаёт зрителя
      if (roles && typeof roles === 'object') p.flags = { sub: !!roles.sub, vip: !!roles.vip, mod: !!roles.mod };

      let changed = false;
      if (countsXp()) {
        touchSession(t);
        const rt = runtime.get(key) || { lastPresenceAt: 0, lastMsgAt: 0, winStart: 0, winXp: 0 };
        runtime.set(key, rt);
        if (!rt.lastPresenceAt || t - prevSeen > XPR.XP.presenceWindowMs) rt.lastPresenceAt = t; // серия «человек в чате» начинается с этого сообщения
        if (p.joinSession !== session.id) { p.joinSession = session.id; changed = gain(p, XPR.XP.join) || changed; } // заход на трансляцию — раз за трансляцию
        if (!isCommand && t - rt.lastMsgAt >= XPR.XP.messageCooldownMs) {                                            // сообщение: не чаще паузы и не больше потолка за час
          if (t - rt.winStart >= 3600 * 1000) { rt.winStart = t; rt.winXp = 0; }
          const room = Math.min(XPR.XP.message, XPR.XP.messageCapPerHour - rt.winXp);
          if (room > 0) { rt.winXp += room; rt.lastMsgAt = t; changed = gain(p, room) || changed; }
        }
      }

      const existing = roster.get(key);
      if (existing) {
        changed = changed || existing.name !== display || existing.color !== col;
        existing.lastSeen = t; existing.name = display; existing.color = col;
        trimProfiles(); saveProfiles();
        return { hero: existing.hero, changed };
      }
      // Герой закреплён за человеком: вернувшись после молчания, он получает того же героя, если его папка на месте (даже если у героя сняли галочку — она про новые выдачи).
      const sticky = p.hero && listHeroes(dir).some((h) => h.id === p.hero) ? p.hero : null;
      let hero = sticky;
      if (!hero) {
        const pool = this.getPool();
        if (!pool.length) { trimProfiles(); saveProfiles(); return { hero: null, changed }; }
        const inUse = new Set([...roster.values()].map((r) => r.hero));
        const fresh = pool.filter((id) => !inUse.has(id));              // пока есть ещё не выданные герои — выбираем из них
        const from = fresh.length ? fresh : pool;
        hero = from[Math.min(from.length - 1, Math.floor(random() * from.length))];
      }
      let evicted = null;
      if (roster.size >= MAX_CHATTERS) {                              // сцена полна — уходит тот, кто молчит дольше всех
        evicted = [...roster.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0].login;
        roster.delete(evicted);
      }
      p.hero = hero;
      if (!(p.unlocked || []).includes(hero)) p.unlocked = [...(p.unlocked || []), hero].slice(-MAX_UNLOCKED);
      roster.set(key, { login: key, name: display, color: col, hero, level: XPR.levelFromTotal(p.xp), lastSeen: t });
      trimProfiles(); saveProfiles();
      return { hero, changed: true, evicted };
    },

    /**
     * Раз в минуту (из server.js): начисляет опыт за присутствие — каждые 10 минут тем, кто писал в последние 20 минут. Возвращает { changed, awarded }:
     * changed — у кого-то на сцене сменился уровень (нужно разослать страницам), awarded — скольким начислено.
     */
    presenceTick() {
      const t = now();
      for (const [key, rt] of runtime) { const p = profiles.get(key); if (!p || t - p.lastSeen > 2 * 3600 * 1000) runtime.delete(key); } // давно молчащих из служебной памяти убираем
      if (!countsXp()) return { changed: false, awarded: 0 };
      let changed = false, awarded = 0;
      for (const [key, rt] of runtime) {
        const p = profiles.get(key);
        if (!p || !rt.lastPresenceAt || t - p.lastSeen > XPR.XP.presenceWindowMs) continue;   // не «в чате» — присутствие не копится
        if (t - rt.lastPresenceAt >= XPR.XP.presenceEveryMs) {
          rt.lastPresenceAt = t - rt.lastPresenceAt < 2 * XPR.XP.presenceEveryMs ? rt.lastPresenceAt + XPR.XP.presenceEveryMs : t; // пропущенные тики не копятся
          awarded++; changed = gain(p, XPR.XP.presence) || changed;
        }
      }
      if (awarded) saveProfiles();
      return { changed, awarded };
    },

    /** Участие в голосовании (ставке): { login, name }. Человека может не быть в профилях (ни разу не писал) — тогда профиль создаётся. Возвращает { changed }. */
    onParticipation({ login, name } = {}) {
      if (!countsXp()) return { changed: false };
      const key = String(login || '').toLowerCase();
      if (!LOGIN_RE.test(key)) return { changed: false };
      const t = now();
      const p = profiles.get(key) || mkProfile(key, String(name || key).slice(0, 40), null, t);
      profiles.set(key, p);
      touchSession(t);
      const changed = gain(p, XPR.XP.participation);
      trimProfiles(); saveProfiles();
      return { changed };
    },

    /** Сообщает, что трансляция идёт (вызывается при каждом опросе статуса): продолжает или начинает трансляцию. */
    noteLive(live) { if (live) touchSession(now()); },
    /** Новая трансляция «с нуля» (кнопка «Сбросить статистику стрима»): заход снова засчитывается всем. */
    newSession() { const t = now(); session = { id: t, lastAt: t }; save(); },

    /** Убирает героев тех, кто молчит дольше IDLE_MS. Возвращает, сколько ушло. */
    prune() {
      const t = now(); let n = 0;
      for (const [k, r] of roster) if (t - r.lastSeen > IDLE_MS) { roster.delete(k); n++; }
      return n;
    },
    clearRoster() { const n = roster.size; roster.clear(); return n; },
  };
}

module.exports = { UNLOCK_DEFAULT, EXTRA_KINDS, BEHAVIOR_DEFAULT, mergeBehavior, listHeroes, createState, HEROES_DIR, SETTINGS_FILE, PROFILES_FILE, ID_RE, LOGIN_RE, MAX_CHATTERS, IDLE_MS, MAX_LEVEL, MAX_PROFILES, SESSION_GAP_MS, SCALE_MIN, SCALE_MAX, TAG_DEFAULT };
