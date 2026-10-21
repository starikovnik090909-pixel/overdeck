// avatarCommands.js
// Команды чат-аватаров: зритель пишет в чат «!аватар» — и его герой на оверлее меняется на случайного; «!прыжок», «!удар» — герой прыгает или бьёт.
// Отдельно от конструктора команд бота (botCommands.js): те — «слово → текст ответа», эти — действия над героем зрителя. Хранятся в avatar_commands.json.
//
//  • ДЕЙСТВИЯ фиксированы (набор в ACTIONS): random — случайный аватар, choose — выбрать по названию («!герой самурай»), info — «какой у меня аватар», jump / attack / emote / cast —
//    сыграть доп. анимацию героя (manifest.extras). Править можно: включено ли действие, слова-команды (у действия их может быть несколько), паузу между использованиями одним
//    человеком (cooldownSec), нужен ли ответ в чат и его текст. Новых действий добавить нельзя — слово-команду можно.
//  • Слова: «!…», 2–32 символа, без пробелов, регистр не важен; не должны совпадать с командами бота (botCommands) и между собой.
//  • Ответ в чат шлёт бот (chatBot.say) и только если он подключён; без бота команда всё равно работает на оверлее. Плейсхолдеры: {user}, {hero} (название героя), {level}, {anim}.
//  • Работает только пока включено «Выдавать героев чаттерам» (у зрителя должен быть герой). Свои сообщения бота команд не запускают (проверяет server.js).
//  handle() ничего не рассылает сам: возвращает, что сделать серверу (разослать героев / сыграть анимацию / ответить), так его просто проверять.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'avatar_commands.json');
const NAME_MAX = 32, REPLY_MAX = 300, NAMES_MAX = 6;
const COOLDOWN_MIN = 0, COOLDOWN_MAX = 3600;

/** id → описание действия и значения по умолчанию. kind — вид доп. анимации (для jump/attack/emote/cast). */
const ACTIONS = {
  random: { title: 'Случайный аватар', hint: 'Меняет героя зрителя на случайного (не такого же, как сейчас).', names: ['!аватар', '!avatar'], cooldownSec: 60, text: '@{user}, твой новый аватар — {hero}!' },
  choose: { title: 'Выбрать аватар', hint: 'Герой по названию: «!герой самурай». Подходит часть названия.', names: ['!герой', '!hero'], cooldownSec: 30, text: '@{user}, теперь ты — {hero}!', args: true },
  info: { title: 'Мой аватар', hint: 'Отвечает, какой у зрителя аватар и уровень.', names: ['!мойаватар', '!myavatar'], cooldownSec: 30, text: '@{user}, твой аватар — {hero}, lvl {level}.' },
  jump: { title: 'Прыжок', hint: 'Герой прыгает (если у него есть такая анимация).', names: ['!прыжок', '!jump'], cooldownSec: 10, text: '', kind: 'jump', noAnim: '@{user}, {hero} не умеет прыгать.' },
  attack: { title: 'Удар', hint: 'Герой бьёт (удар, выстрел, взмах).', names: ['!удар', '!attack'], cooldownSec: 10, text: '', kind: 'attack', noAnim: '@{user}, {hero} не умеет драться.' },
  emote: { title: 'Жест', hint: 'Герой машет рукой, ликует, читает, защищается — что есть у героя.', names: ['!жест', '!emote'], cooldownSec: 10, text: '', kind: 'emote', noAnim: '@{user}, у {hero} нет жестов.' },
  cast: { title: 'Заклинание', hint: 'Герой колдует или кричит (если умеет).', names: ['!магия', '!cast'], cooldownSec: 10, text: '', kind: 'cast', noAnim: '@{user}, {hero} не умеет колдовать.' },
};

function defaults() {
  return { enabled: true, commands: Object.entries(ACTIONS).map(([action, a]) => ({ action, enabled: true, names: [...a.names], cooldownSec: a.cooldownSec, reply: a.text !== '', text: a.text })) };
}

const normalizeName = (raw) => { const t = String(raw == null ? '' : raw).trim().toLowerCase(); return !t ? '' : (t.startsWith('!') ? t : '!' + t); };

function createAvatarCommands(opts = {}) {
  const file = opts.file === undefined ? FILE_PATH : opts.file;
  const now = opts.now || (() => Date.now());
  const random = opts.random || Math.random;
  const botHas = opts.botHas || (() => false);              // (имя) → true, если такая команда есть у конструктора команд бота
  let state = defaults();
  const cooldowns = new Map();                               // `${login}:${action}` → время последнего использования

  /** Проверяет список команд: возвращает { ok, error?, commands? }. Недостающие действия берутся из текущих/умолчаний — присылать можно любую часть. */
  function validate(input, skipBot) {
    if (!Array.isArray(input)) return { ok: false, error: 'Нужен список команд.' };
    const out = [], seenAction = new Set(), seenName = new Map();
    for (const c of input) {
      if (!c || typeof c !== 'object' || !ACTIONS[c.action]) return { ok: false, error: 'Неизвестное действие команды.' };
      if (seenAction.has(c.action)) return { ok: false, error: `Действие «${ACTIONS[c.action].title}» повторяется.` };
      seenAction.add(c.action);
      const a = ACTIONS[c.action], title = a.title;
      if (typeof c.enabled !== 'boolean') return { ok: false, error: `«${title}»: включено или нет — нужно да/нет.` };
      if (!Array.isArray(c.names)) return { ok: false, error: `«${title}»: нужен список слов-команд.` };
      const names = [...new Set(c.names.map(normalizeName).filter(Boolean))];
      if (c.enabled && !names.length) return { ok: false, error: `«${title}»: укажи хотя бы одну команду, например ${a.names[0]}.` };
      if (names.length > NAMES_MAX) return { ok: false, error: `«${title}»: не больше ${NAMES_MAX} команд.` };
      for (const n of names) {
        if (n.length < 2 || n.length > NAME_MAX || /\s/.test(n)) return { ok: false, error: `«${title}»: команда «${n}» — от 2 до ${NAME_MAX} символов, без пробелов.` };
        if (seenName.has(n)) return { ok: false, error: `Команда ${n} стоит и у «${ACTIONS[seenName.get(n)].title}», и у «${title}».` };
        seenName.set(n, c.action);
        if (!skipBot && botHas(n)) return { ok: false, error: `Команда ${n} уже есть в списке команд бота — переименуй одну из них.` };
      }
      if (!Number.isInteger(c.cooldownSec) || c.cooldownSec < COOLDOWN_MIN || c.cooldownSec > COOLDOWN_MAX) return { ok: false, error: `«${title}»: пауза — целое число секунд от ${COOLDOWN_MIN} до ${COOLDOWN_MAX}.` };
      if (typeof c.reply !== 'boolean') return { ok: false, error: `«${title}»: «отвечать в чат» — нужно да/нет.` };
      const text = String(c.text == null ? '' : c.text).replace(/\s*[\r\n]+\s*/g, ' ').trim();
      if (text.length > REPLY_MAX) return { ok: false, error: `«${title}»: ответ длиннее ${REPLY_MAX} символов.` };
      if (c.reply && c.enabled && !text && !a.kind) return { ok: false, error: `«${title}»: впиши текст ответа или выключи ответ.` };
      out.push({ action: c.action, enabled: c.enabled, names, cooldownSec: c.cooldownSec, reply: c.reply, text });
    }
    // действия, которых не прислали, остаются как были
    for (const cur of state.commands) if (!seenAction.has(cur.action)) {
      for (const n of cur.names) if (seenName.has(n)) return { ok: false, error: `Команда ${n} уже занята действием «${ACTIONS[cur.action].title}».` };
      out.push({ ...cur, names: [...cur.names] });
    }
    return { ok: true, commands: out.sort((x, y) => Object.keys(ACTIONS).indexOf(x.action) - Object.keys(ACTIONS).indexOf(y.action)) };
  }

  function persist() { if (!file) return; try { fs.writeFileSync(file, JSON.stringify(state, null, 2)); } catch (e) { console.warn('[Команды аватаров] Не удалось сохранить:', e.message); } }
  function load() {
    if (!file) return;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && typeof raw === 'object') {
        const base = defaults();
        const v = Array.isArray(raw.commands) ? validate(raw.commands.map((c) => ({ ...c })), true) : { ok: false };
        state = { enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true, commands: v.ok ? v.commands : base.commands };
        if (!v.ok) state = { enabled: state.enabled, commands: base.commands };
      }
    } catch (e) { /* файла нет или он повреждён — команды по умолчанию */ }
  }
  load();

  const publicState = () => ({ enabled: state.enabled, commands: state.commands.map((c) => ({ ...c, names: [...c.names] })) });

  const fill = (tpl, v) => String(tpl).replace(/\{(user|hero|level|anim)\}/gi, (m, k) => String(v[k.toLowerCase()] == null ? '' : v[k.toLowerCase()])).replace(/\s+/g, ' ').trim().slice(0, 500);
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();

  return {
    ACTIONS,
    getState: publicState,
    getActions: () => Object.entries(ACTIONS).map(([id, a]) => ({ id, title: a.title, hint: a.hint, args: !!a.args, kind: a.kind || null, defaults: { names: [...a.names], cooldownSec: a.cooldownSec, text: a.text } })),
    setEnabled(v) { if (typeof v !== 'boolean') return false; state.enabled = v; persist(); return true; },
    /** Сохраняет команды (любая часть действий). { ok, error?, state? } — при ошибке ничего не меняется. */
    setCommands(list) { const v = validate(list, false); if (!v.ok) return v; state.commands = v.commands; persist(); return { ok: true, state: publicState() }; },
    /** Служебное слово для проверки конфликтов с командами бота: занято ли имя командой аватаров. */
    /** Первое слово включённой команды действия (для подсказок «чем сменить аватар»); нет — слово по умолчанию. */
    commandWord(action) { const c = state.commands.find((x) => x.action === action && x.enabled && x.names.length); return c ? c.names[0] : ACTIONS[action].names[0]; },
    hasName(name) { const n = normalizeName(name); return state.commands.some((c) => c.names.includes(n)); },
    reset() { state = defaults(); cooldowns.clear(); persist(); return publicState(); },

    /**
     * Обрабатывает сообщение чата. ctx: { login, name, message, pixel } — pixel — состояние героев (pixelHeroes.createState): нужны heroOf, isOnStage, getLevel, list, getPool, setProfileHero, extrasOf.
     * Возвращает null (это не команда / выключено / пауза / у человека нет героя) или { action, reply, changed, play } — reply: текст ответа в чат ('' — не отвечать), changed: нужно разослать список героев,
     * play: { login, kind, name } — сыграть анимацию на оверлее.
     */
    handle({ login, name, message, pixel } = {}) {
      if (!state.enabled || !pixel) return null;
      const text = String(message || '').trim();
      if (!text.startsWith('!')) return null;
      const [word, ...rest] = text.split(/\s+/);
      const token = word.toLowerCase();
      const cmd = state.commands.find((c) => c.enabled && c.names.includes(token));
      if (!cmd) return null;
      const key = String(login || '').toLowerCase();
      const a = ACTIONS[cmd.action];
      const heroId = pixel.isOnStage(key) ? pixel.heroOf(key) : null;
      if (!heroId) return null;                                   // герой выдаётся при первом сообщении; выдача выключена — команды молчат
      const t = now(), ck = key + ':' + cmd.action;
      const last = cooldowns.get(ck);
      if (cmd.cooldownSec > 0 && last !== undefined && t - last < cmd.cooldownSec * 1000) return null;
      const heroes = pixel.list(), byId = (id) => heroes.find((h) => h.id === id);
      const vars = { user: name || key, hero: (byId(heroId) || {}).title || heroId, level: pixel.getLevel(key), anim: '' };
      const say = (tpl) => (cmd.reply && tpl ? fill(tpl, vars) : '');
      const note = (tpl) => fill(tpl, vars);                       // пояснения об ошибке («нет такого героя», «не умеет прыгать») — не зависят от «отвечать в чат»
      const done = (r) => { cooldowns.set(ck, t); if (cooldowns.size > 5000) { for (const [k, v] of cooldowns) if (t - v > 3600 * 1000) cooldowns.delete(k); } return { action: cmd.action, changed: false, play: null, ...r }; };

      if (cmd.action === 'info') return done({ reply: say(cmd.text) });
      if (cmd.action === 'random') {
        const locked = pixel.getUnlock().lock;
        const pool = pixel.availableOf(key).filter((id) => id !== heroId && byId(id));   // выдаваемые всем + закрытые, которые игрок уже открыл
        if (!pool.length) return done({ reply: note(locked ? '@{user}, других открытых аватаров у тебя нет — новый можно открыть за баллы канала.' : '@{user}, другого аватара для тебя нет.') });
        const pick = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
        const r = pixel.setProfileHero(key, pick);
        vars.hero = byId(pick).title;
        return done({ reply: say(cmd.text), changed: !!r.changed });
      }
      if (cmd.action === 'choose') {
        const q = norm(rest.join(' '));
        if (!q) return done({ reply: note('@{user}, напиши название героя: ' + cmd.names[0] + ' самурай') });
        const exact = heroes.find((h) => norm(h.title) === q || h.id.toLowerCase() === q);
        const found = exact ? [exact] : heroes.filter((h) => norm(h.title).includes(q));
        if (!found.length) return done({ reply: note('@{user}, героя «' + rest.join(' ').slice(0, 40).replace(/[{}]/g, '') + '» нет.') });
        if (found.length > 1) return done({ reply: note('@{user}, подходит несколько героев (' + found.slice(0, 4).map((h) => h.title).join(', ') + '…) — уточни название.') });
        const pick = found[0];
        if (pick.id === heroId) return done({ reply: note('@{user}, ты уже ' + pick.title + '.') });
        if (!pixel.canUse(key, pick.id)) return done({ reply: note('@{user}, аватар «' + pick.title + '» ещё не открыт — случайный новый можно открыть за баллы канала.') });
        const r = pixel.setProfileHero(key, pick.id);
        vars.hero = pick.title;
        return done({ reply: say(cmd.text), changed: !!r.changed });
      }
      // jump / attack / emote / cast — доп. анимация героя; какую именно из однотипных — выбирает страница (случайную)
      const own = pixel.extrasOf(heroId).filter((e) => e.kind === a.kind);
      if (!own.length) return done({ reply: note(a.noAnim) });
      const ex = own[Math.min(own.length - 1, Math.floor(random() * own.length))];
      vars.anim = ex.title;
      return done({ reply: say(cmd.text), play: { login: key, kind: a.kind, name: ex.name } });
    },
  };
}

module.exports = { createAvatarCommands, ACTIONS, FILE_PATH, normalizeName, defaults };
