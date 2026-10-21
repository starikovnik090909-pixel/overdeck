// public/pixel-avatar.js — «ЧатАватары»: пиксельные герои бродят по экрану, над головой всплывает сообщение из чата в пиксельном облаке.
// ОДНА страница = ОДИН алерт: все герои живут здесь же, каждый со своим паком (атласы + manifest.json, их собирают tools/build-*.py).
//
//  • КТО НА СЦЕНЕ. Сервер присылает сообщение pixel_heroes (при подключении и при любом изменении): { active, chatters, settings }.
//      – active — герои, показанные вручную кнопкой «Показать в оверлее» (декорации; в старом режиме первый из них произносит сообщения стримера);
//      – chatters — герои ЧАТТЕРОВ: каждому, кто написал в чат, сервер выдаёт случайного героя; сообщения человека звучат над ЕГО героем, а над головой героя
//        ВСЕГДА подписан небольшой ник и рядом уровень «lvl N» (изначально lvl 0); облако с сообщением — выше подписи. Цвета подписи (ник — как в Twitch или свой, шрифт и плашка
//        уровня), размер героев по категориям («Воины» 90 %) и размер каждого героя в отдельности (итог = категория × герой) задаются в админке и приходят в settings. Если игроку
//        сменили аватар, его герой заменяется на лету на том же месте. Герой уходит со сцены, когда сервер убирает его из списка (молчит 10 минут / сцена полна);
//      – settings — { chatters: выдавать ли героев чаттерам, plane2d: режим 2D — все ходят по низу экрана }.
//    Страница добавляет недостающих, плавно убирает лишних, остальных не трогает. Режим ?pack=… — один герой по адресу, без списка от сервера.
//  • ГЕРОЙ: выбирает случайную точку, идёт к ней с постоянной скоростью (CSS transition: transform … linear; скорость — из manifest героя), лицом в сторону движения
//    (ближайшее из ДОСТУПНЫХ направлений героя: 8 у героев «сверху», 2 у героев «вид сбоку»), на месте — анимация стойки; афк-действия (manifest.afk) — иногда вместо паузы.
//    РЕЖИМ 2D: точки выбираются на одной линии — все ходят по низу экрана, ногами на одной земле (как в платформере).
//  • ОБЛАКО: сообщение — в пиксельном облаке (рисуется на canvas клетками, контур и «завитки» по краям, хвост-«мысли» к голове героя).
//  • Номер кадра считается от ВРЕМЕНИ, а не от числа перерисовок — скорость анимации не зависит от частоты экрана. Сторонних библиотек нет — работает в OBS без интернета.
//
//  • ПОВЕДЕНИЕ (settings.behavior от сервера, правится в админке): режим «бродят всегда» (roam) / «гуляют порциями» (limited: N прогулок → отдых → снова) / «стоят на месте» (stay);
//    в паузах герой с заданным шансом играет доп. анимацию (manifest.extras: прыжок, удар, жест, заклинание — у каждой своя ячейка и опорная точка, она ставится на то же место, что и
//    основной кадр), афк-действие или реагирует на своё сообщение; доп. анимацию можно вызвать командой чата (сообщение pixel_action от сервера). Без сервера (?pack=…) — как раньше: бродит всегда.
//
// Параметры адреса (все необязательные): pack (один герой по адресу, путь к manifest.json), who (старый режим: на чьи сообщения реагирует первый герой), scale, speed (px/с при
// scale=1; по умолчанию — из manifest героя), pauseMin, pauseMax (мс), afk (шанс афк-действия после прогулки, 0–1), plane=1 (режим 2D для страницы без сервера),
// bubbleMs, top (запас сверху под облако, px), demo=1 (без чата — тестовые сообщения; без pack показывает лучника), demoMs.

(function () {
  const q = new URLSearchParams(location.search);
  const num = (key, def, min, max) => {
    const v = parseFloat(q.get(key));
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def;
  };
  const CFG = {
    pack: q.get('pack') || '',                       // пусто = герои приходят от сервера
    who: (q.get('who') || 'broadcaster').trim(),
    scale: num('scale', 1, 0.25, 6),
    speed: num('speed', 0, 0, 2000),                 // px/с при scale=1; 0 = взять из manifest героя, иначе 80
    pauseMin: num('pauseMin', 1000, 0, 60000), pauseMax: num('pauseMax', 3000, 0, 60000),
    afk: num('afk', 0.35, 0, 1),
    plane: q.get('plane') === '1',                   // режим 2D по адресу (для страницы без сервера); от сервера приходит настройка из админки
    bubbleMs: num('bubbleMs', 5000, 300, 60000), fadeMs: 600,
    top: num('top', 190, 0, 600),                    // запас сверху под облако с сообщением
    floorMargin: 6,                                  // режим 2D: отступ ног героя от нижнего края экрана
    demo: q.get('demo') === '1', demoMs: num('demoMs', 5000, 200, 60000),
  };
  if (CFG.pauseMax < CFG.pauseMin) CFG.pauseMax = CFG.pauseMin;
  const ID_RE = /^[a-z0-9_-]{1,40}$/i;
  const LOGIN_RE = /^[a-z0-9_]{1,40}$/;
  const rand = (a, b) => a + Math.random() * (b - a);
  let plane = CFG.plane;                              // режим 2D сейчас
  let groupScale = {};                                // размер героев по категориям в %, от сервера: { 'Воины': 90 } (нет записи — 100)
  let tagCfg = { nickColorMode: 'twitch', nickColor: '#ffffff', levelColor: '#1b1b2f', levelBg: '#ffd34d' }; // цвета подписи над героем, от сервера
  const HEX_RE = /^#[0-9a-f]{6}$/i;
  let heroScaleMap = {};                              // размер каждого героя в %, от сервера: { fighter: 120 } (нет записи — 100)
  // Поведение героев. По умолчанию (страница без сервера) — как раньше: бродят без отдыха; от сервера приходит settings.behavior и заменяет всё это.
  const EXTRA_KINDS = ['jump', 'attack', 'emote', 'cast'];
  let BEH = { mode: 'roam', walksMin: 2, walksMax: 5, restMin: 8, restMax: 25, pauseMin: CFG.pauseMin / 1000, pauseMax: CFG.pauseMax / 1000, extraChance: 0, afkChance: CFG.afk * 100, reactChance: 0, kinds: { jump: true, attack: true, emote: true, cast: true } };
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  function cleanBehavior(b) {                          // всё, что пришло от сервера, проверяется заново: неверное поле просто не применяется
    const o = { ...BEH, kinds: { ...BEH.kinds } };
    if (!b || typeof b !== 'object') return o;
    if (['roam', 'limited', 'stay'].includes(b.mode)) o.mode = b.mode;
    const num = (k, lo, hi) => { if (typeof b[k] === 'number' && Number.isFinite(b[k]) && b[k] >= lo && b[k] <= hi) o[k] = b[k]; };
    num('walksMin', 1, 20); num('walksMax', 1, 20); num('restMin', 1, 600); num('restMax', 1, 600); num('pauseMin', 0, 60); num('pauseMax', 0, 60); num('extraChance', 0, 100); num('afkChance', 0, 100); num('reactChance', 0, 100);
    if (o.walksMax < o.walksMin) o.walksMax = o.walksMin; if (o.restMax < o.restMin) o.restMax = o.restMin; if (o.pauseMax < o.pauseMin) o.pauseMax = o.pauseMin;
    if (b.kinds && typeof b.kinds === 'object') EXTRA_KINDS.forEach((k) => { if (typeof b.kinds[k] === 'boolean') o.kinds[k] = b.kinds[k]; });
    return o;
  }
  const groupFactor = (group) => (Number.isInteger(groupScale[group]) ? groupScale[group] : 100) / 100;
  const heroFactor = (id) => (Number.isInteger(heroScaleMap[id]) ? heroScaleMap[id] : 100) / 100;
  const sizeFactorFor = (hero) => groupFactor(hero.pack.group) * heroFactor(hero.id); // размер категории × размер героя

  /** Номер кадра для момента времени ms (от начала анимации): не зависит от частоты перерисовки экрана. */
  function frameForTime(ms, count, fps) { return Math.floor(Math.max(0, ms) * (fps || 12) / 1000) % Math.max(1, count); }

  /** Из направлений героя — ближайшее к вектору движения (экранные координаты: x вправо, y вниз). Нулевой вектор → null (оставить прежнее). */
  const SECTOR_NAMES = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']; // через 45° от «вправо» по часовой
  const DEFAULT_DIRECTIONS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']; // порядок строк в атласах
  const DIR_ANGLE = { east: 0, 'south-east': 45, south: 90, 'south-west': 135, west: 180, 'north-west': -135, north: -90, 'north-east': -45 }; // градусы, экран: y вниз
  function dirFromVector(dx, dy, directions) {
    if (!dx && !dy) return null;
    const dirs = directions || DEFAULT_DIRECTIONS;
    if (dirs.length === 8) { // герой «сверху»: восемь направлений — ближайший из секторов по 45°
      const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      return dirs.indexOf(SECTOR_NAMES[((sector % 8) + 8) % 8]);
    }
    // Остальные герои (например «вид сбоку»: только east и west): берём ближайшее из ДОСТУПНЫХ направлений. Если два одинаково близки (идёт строго вверх
    // или вниз, а есть только вправо/влево) — null: остаёмся лицом туда, куда смотрели.
    const a = Math.atan2(dy, dx) * 180 / Math.PI;
    const diff = (name) => { const d = Math.abs(a - DIR_ANGLE[name]) % 360; return d > 180 ? 360 - d : d; };
    let best = -1, bestD = Infinity, tie = false;
    dirs.forEach((name, i) => {
      if (!(name in DIR_ANGLE)) return;
      const d = diff(name);
      if (d < bestD - 1e-6) { best = i; bestD = d; tie = false; } else if (Math.abs(d - bestD) <= 1e-6) tie = true;
    });
    return tie ? null : best;
  }

  /* ---------- Пиксельное облако ---------- */
  // Облако рисуется клетками размером U экранных пикселей: тело-прямоугольник, по краям «завитки» (выступы профилем 1-2-2-2-2-1), срезанные углы, контур в одну клетку
  // и хвост из двух «мыслей» (большая и маленькая точки) под телом, у которого центр — над головой героя. Закрашенные клетки у нижнего края чуть темнее — «объём».
  const CLOUD = { U: 3, OUT: 1, BUMP: 2, TAIL: 11, FILL: [255, 255, 255], SHADE: [217, 222, 239], LINE: [27, 27, 47] };
  const CLOUD_PAD = { x: (CLOUD.OUT + CLOUD.BUMP) * CLOUD.U + 9, top: (CLOUD.OUT + CLOUD.BUMP) * CLOUD.U + 8, bottom: (CLOUD.OUT + CLOUD.BUMP) * CLOUD.U + 8 + CLOUD.TAIL * CLOUD.U };
  const PUFF_A = ['.XXXX.', 'XXXXXX', 'XXXXXX', '.XXXX.'];
  const PUFF_B = ['.XX.', 'XXXX', '.XX.'];
  const BUMP_PROFILE = [1, 2, 2, 2, 2, 1];

  /** Сетка облака для коробки w×h пикселей: 0 — пусто, 1 — заливка, 2 — контур, 3 — заливка с тенью. tailX — центр хвоста по горизонтали (px от левого края). */
  function cloudGrid(w, h, tailX) {
    const { U, OUT, BUMP, TAIL } = CLOUD, m = OUT + BUMP;
    const cols = Math.max(14, Math.ceil(w / U)), rows = Math.max(m * 2 + 6 + TAIL, Math.ceil(h / U));
    const g = Array.from({ length: rows }, () => new Uint8Array(cols));
    const x0 = m, x1 = cols - 1 - m, y0 = m, y1 = rows - 1 - m - TAIL;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = 1;
    g[y0][x0] = g[y0][x1] = g[y1][x0] = g[y1][x1] = 0; // срезанные углы
    for (let x = x0 + 2; x <= x1 - 2; x++) { const hh = BUMP_PROFILE[(x - x0 - 2) % 6]; for (let k = 1; k <= hh; k++) { g[y0 - k][x] = 1; g[y1 + k][x] = 1; } }
    for (let y = y0 + 2; y <= y1 - 2; y++) { const ww = BUMP_PROFILE[(y - y0 - 2) % 6]; for (let k = 1; k <= ww; k++) { g[y][x0 - k] = 1; g[y][x1 + k] = 1; } }
    const tx = Math.max(m + 4, Math.min(cols - 1 - m - 4, Math.round(tailX / U)));
    const stamp = (bmp, left, top) => bmp.forEach((row, dy) => [...row].forEach((c, dx) => { if (c === 'X') g[top + dy][left + dx] = 1; }));
    stamp(PUFF_A, tx - 3, y1 + 5);   // две «мысли»: большая и маленькая — к голове героя
    stamp(PUFF_B, tx - 2, y1 + 11);
    const edge = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (g[y][x] !== 0) continue;
      if ((y > 0 && g[y - 1][x] === 1) || (y < rows - 1 && g[y + 1][x] === 1) || (x > 0 && g[y][x - 1] === 1) || (x < cols - 1 && g[y][x + 1] === 1)) edge.push([x, y]);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (g[y][x] === 1 && y < rows - 1 && g[y + 1][x] === 0) g[y][x] = 3; // нижняя кромка — тень (до проведения контура)
    edge.forEach(([x, y]) => { g[y][x] = 2; });
    return { g, cols, rows };
  }

  function renderCloud(canvas, w, h, tailX) {
    const { g, cols, rows } = cloudGrid(w, h, tailX), U = CLOUD.U;
    canvas.width = cols; canvas.height = rows;
    canvas.style.width = cols * U + 'px'; canvas.style.height = rows * U + 'px';
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(cols, rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const v = g[y][x]; if (!v) continue;
      const c = v === 2 ? CLOUD.LINE : v === 3 ? CLOUD.SHADE : CLOUD.FILL, o = (y * cols + x) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { cols, rows };
  }

  /* ---------- Загрузка паков (по одному разу на героя) ---------- */
  const packCache = new Map(); // url manifest.json -> Promise<{ pack, atlases }>
  function loadImage(url) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('не загрузилось: ' + url)); img.src = url; });
  }
  function loadPack(url) {
    if (!packCache.has(url)) {
      const base = url.replace(/[^/]*$/, ''); // папка, где лежит manifest.json — рядом с ним лежат атласы
      packCache.set(url, fetch(url)
        .then((r) => { if (!r.ok) throw new Error('manifest: HTTP ' + r.status); return r.json(); })
        .then(async (pack) => {
          const [walk, idle] = await Promise.all([loadImage(base + pack.walk.file), loadImage(base + pack.idle.file)]);
          for (const [a, img] of [['walk', walk], ['idle', idle]]) {
            if (img.naturalWidth < pack[a].columns * pack.cell.w || img.naturalHeight < pack.directions.length * pack.cell.h) console.error(`[pixel-avatar] Атлас ${a} (${url}) меньше ожидаемого по manifest.json`);
          }
          const atlases = { walk, idle };
          // доп. анимации: проверяем записи (вид, ячейка, опорная точка, число кадров) и грузим атласы; не загрузился — этой анимации у героя просто нет
          const posInt = (v) => Number.isInteger(v) && v > 0 && v < 2000;
          const okEx = (e) => e && typeof e.name === 'string' && /^[a-z0-9_-]{1,30}$/i.test(e.name) && EXTRA_KINDS.includes(e.kind) && typeof e.file === 'string' && /^[\w.-]+$/.test(e.file) && e.frames && typeof e.frames === 'object'
            && e.cell && posInt(e.cell.w) && posInt(e.cell.h) && e.pivot && Number.isFinite(e.pivot.x) && Number.isFinite(e.pivot.y) && posInt(e.columns);
          const extras = [];
          await Promise.all((Array.isArray(pack.extras) ? pack.extras : []).filter(okEx).map(async (e) => {
            try { atlases[e.file] = await loadImage(base + e.file); extras.push(e); } catch (err) { console.warn('[pixel-avatar] доп. анимация не загрузилась: ' + err.message); }
          }));
          pack.extras = (Array.isArray(pack.extras) ? pack.extras : []).filter((e) => extras.includes(e));
          // афк-действия: клипы лежат отдельными атласами (по имени файла); один и тот же файл может использоваться в нескольких шагах
          const clipFiles = [...new Set((pack.afk || []).flatMap((act) => act.clips.map((c) => c.file)))];
          await Promise.all(clipFiles.map(async (f) => { atlases[f] = await loadImage(base + f); }));
          return { pack, atlases };
        })
        .catch((e) => { packCache.delete(url); throw e; })); // неудачу не запоминаем — при следующей попытке загрузим заново
    }
    return packCache.get(url);
  }

  /* ---------- Герой ---------- */
  const heroes = [];          // герои на сцене: сначала показанные вручную (в порядке списка), затем герои чаттеров (в порядке списка сервера)
  let loopId = 0;
  function ensureLoop() { if (!loopId) loopId = requestAnimationFrame(loop); }
  function loop(now) {
    loopId = 0;
    heroes.forEach((h) => h.tick(now));
    if (heroes.length) ensureLoop(); // стойка тоже анимирована («дыхание»), поэтому цикл идёт, пока есть хоть один герой; холст перерисовывается только при смене кадра
  }

  const NAME_TAG_H = 22; // высота подписи ника над головой (20px) и зазор под ней (2px)
  const NAME_COLORS = ['#B14846', '#00D4FF', '#FF5C8A', '#4ADE80', '#FFB454', '#60A5FA', '#F472B6', '#34D399', '#FBBF24', '#A78BFA'];
  function colorForName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
  }

  class Hero {
    /** owner — логин чаттера, если это герой чаттера (иначе героя показали вручную); name/color/level — ник, цвет ника и уровень для подписи над головой. */
    constructor(id, data, { owner = '', name = '', color = '', level = 0, at = null } = {}) {
      this.id = id;
      this.owner = owner;
      this.pack = data.pack;
      this.atlases = data.atlases;
      this.startPos = at;           // где появиться (при замене героя игроку — на месте прежнего); нет — случайно
      this.sizeFactor = groupFactor(this.pack.group) * heroFactor(id); // размер категории × размер героя из админки (1 = 100 %)
      this.heroScale = 1; this.heroW = 0; this.heroH = 0; // считаются в applySize()
      this.pos = { x: 0, y: 0 };    // где герой стоит (или куда идёт): левый верхний угол его ячейки на экране
      this.dirIdx = 0;              // 0 — первое направление пака (у героев «сверху» south — лицом к зрителю)
      this.anim = 'idle';           // idle | walk | afk
      this.afk = null;              // идущее афк-действие: { act, step, stepStart }
      this.animStart = 0;
      this.drawnKey = '';
      this.walkTimer = null; this.nextTimer = null; this.hideTimer = null; this.removeTimer = null;
      this.action = null;           // идущая доп. анимация: { ex, start, dur }
      this.walksLeft = 0; this.restUntil = 0; // поведение: сколько прогулок осталось до отдыха и до какого момента отдыхает
      this.bubbleVisible = false;
      this.cloudKey = '';
      this.removed = false;

      this.el = document.createElement('div');
      this.el.className = 'hero';
      this.el.dataset.hero = id;
      if (owner) this.el.dataset.owner = owner;
      this.bubble = document.createElement('div');
      this.bubble.className = 'bubble';
      this.tagH = owner ? NAME_TAG_H : 0;                              // подпись ника над головой занимает место: облако стоит выше неё
      this.bubble.style.marginBottom = (10 + this.tagH) + 'px';
      this.bubble.style.maxHeight = Math.max(80, CFG.top - 20 - this.tagH) + 'px'; // облако + зазор над головой помещаются в запас сверху: верх облака не выше края экрана
      const body = document.createElement('div');
      body.className = 'hero-body';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'sprite';
      this.canvas.width = this.pack.cell.w;   // внутренний размер = одна ячейка атласа; на экране масштабируется CSS
      this.canvas.height = this.pack.cell.h;
      this.ctx = this.canvas.getContext('2d');
      body.appendChild(this.canvas);
      this.xcanvas = document.createElement('canvas');                 // для доп. анимаций: свой размер ячейки, ставится по опорной точке
      this.xcanvas.className = 'xsprite';
      this.xctx = this.xcanvas.getContext('2d');
      this.xKey = '';
      body.appendChild(this.xcanvas);
      this.nameTag = document.createElement('div'); // подпись над головой героя чаттера: ник и уровень, видна всегда (и когда герой говорит)
      this.nameTag.className = 'hero-name';
      this.tagText = document.createElement('span'); this.tagText.className = 'hero-name-text';
      this.tagLevel = document.createElement('span'); this.tagLevel.className = 'hero-level';
      this.nameTag.append(this.tagText, this.tagLevel);
      this.el.append(this.nameTag, this.bubble, body);
      this.setName(name, color, level);
      this.applySize();
      document.body.appendChild(this.el);
    }

    /** Размер героя на экране: ячейка × свой множитель героя (у мелких кадров ×1.5…×4) × общий ?scale= × размер его категории из админки. */
    applySize() {
      this.heroScale = (this.pack.scale || 1) * CFG.scale * this.sizeFactor;
      this.heroW = Math.round(this.pack.cell.w * this.heroScale);
      this.heroH = Math.round(this.pack.cell.h * this.heroScale);
      this.el.style.width = this.heroW + 'px';
      this.el.style.height = this.heroH + 'px';
      // Целый масштаб ≥ 1 — чёткие пиксели; дробный (0.5, 1.5, 0.9…) — с лёгким сглаживанием, иначе пиксельный рисунок «рвётся».
      this.canvas.style.imageRendering = (this.heroScale >= 1 && Number.isInteger(this.heroScale)) ? 'pixelated' : 'auto';
      this.xcanvas.style.imageRendering = this.canvas.style.imageRendering;
      this.placeAction();
    }

    /** Размер категории изменили в админке: герой меняет размер на лету и, если вышел за границы (или в режиме 2D сменилась линия земли), переходит на своё место. */
    setSizeFactor(f) {
      if (Math.abs(f - this.sizeFactor) < 1e-9) return;
      this.sizeFactor = f;
      this.applySize();
      this.applyPlane();
    }

    setName(name, color, level) {
      this.name = name || '';
      this.twitchColor = color || '';
      this.level = Number.isInteger(level) && level >= 0 ? level : 0;
      this.tagText.textContent = this.name;
      this.tagLevel.textContent = 'lvl ' + this.level;
      this.nameTag.style.display = this.owner && this.name ? '' : 'none'; // у героев, показанных вручную, подписи нет
      this.refreshTag();
    }

    /** Цвет ника: «как в Twitch» (цвет из чата, нет — подобранный по нику) или свой из админки. Цвета уровня задаются переменными --lvl-color / --lvl-bg на странице. */
    refreshTag() {
      this.tagText.style.color = tagCfg.nickColorMode === 'custom' ? tagCfg.nickColor : (this.twitchColor || (this.name ? colorForName(this.name) : ''));
    }

    /** Линия земли режима 2D: верх ячейки так, чтобы ноги стояли в CFG.floorMargin от нижнего края (у всех героев ноги на одной линии, какого бы они ни были роста). */
    floorY() { return Math.max(0, Math.round(innerHeight - CFG.floorMargin - this.pack.pivot.y * this.heroScale)); }

    bounds() {
      const maxX = Math.max(0, innerWidth - this.heroW), maxY = Math.max(0, innerHeight - this.heroH);
      if (plane) { const y = this.floorY(); return { minX: 0, maxX, minY: y, maxY: y }; }
      return { minX: 0, maxX, minY: Math.min(CFG.top, maxY), maxY }; // сверху оставляем место под облако
    }

    /** Случайная точка в пределах экрана (в режиме 2D — на линии земли), не слишком близко к from (иначе «шаг на месте»). */
    pickTarget(from) {
      const b = this.bounds();
      let t = { x: rand(b.minX, b.maxX), y: rand(b.minY, b.maxY) };
      for (let i = 0; i < 10 && Math.hypot(t.x - from.x, t.y - from.y) < 80; i++) t = { x: rand(b.minX, b.maxX), y: rand(b.minY, b.maxY) };
      return t;
    }

    drawCell(anim, dirIdx, frame, atlasKey) {
      const key = `${anim}:${dirIdx}:${frame}` + (atlasKey ? `:${atlasKey}` : '');
      if (key === this.drawnKey) return; // перерисовываем только при смене кадра
      this.drawnKey = key;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const img = this.atlases[atlasKey || anim];
      if (img) this.ctx.drawImage(img, frame * this.pack.cell.w, dirIdx * this.pack.cell.h, this.pack.cell.w, this.pack.cell.h, 0, 0, this.pack.cell.w, this.pack.cell.h);
    }

    setPosition(x, y, duration) {
      this.el.style.transition = `opacity 0.5s ease, transform ${duration}ms linear`;
      this.el.style.transform = `translate(${x}px, ${y}px)`;
    }

    start() {
      const b = this.bounds();
      this.pos = this.startPos ? { x: Math.max(b.minX, Math.min(b.maxX, this.startPos.x)), y: Math.max(b.minY, Math.min(b.maxY, this.startPos.y)) } : { x: rand(b.minX, b.maxX), y: rand(b.minY, b.maxY) };
      this.animStart = performance.now();
      this.el.style.transition = 'opacity 0.5s ease';
      this.el.style.transform = `translate(${this.pos.x}px, ${this.pos.y}px)`;
      requestAnimationFrame(() => { if (!this.removed) this.el.style.opacity = '1'; });   // появляется
      this.resetCycle();
      this.nextTimer = setTimeout(() => this.afterIdle(), this.pauseMs()); // и идёт гулять (или стоит — в режиме «на месте»)
      ensureLoop();
    }

    /** Идёт к точке target (по умолчанию — к случайной). */
    startWalk(target) {
      if (this.removed) return;
      target = target || this.pickTarget(this.pos);
      const dx = target.x - this.pos.x, dy = target.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      const baseSpeed = CFG.speed || this.pack.speed || 80;
      const duration = Math.max(200, dist / (baseSpeed * CFG.scale * this.sizeFactor) * 1000); // скорость растёт вместе с размером героя (в том числе размером категории) — шаг не «скользит»
      const d = dirFromVector(dx, dy, this.pack.directions);
      if (d !== null && d >= 0) this.dirIdx = d;
      this.endAction();
      this.anim = 'walk';
      this.afk = null;
      this.walksLeft--;
      this.animStart = performance.now();
      this.setPosition(target.x, target.y, duration);
      this.pos = target;
      this.walkTimer = setTimeout(() => this.endWalk(), duration + 30);
    }

    /** Режим 2D включили или выключили/изменился размер окна: герой, оказавшийся не на линии земли, спускается на неё пешком. */
    applyPlane() {
      if (this.removed) return;
      const b = this.bounds();
      const x = Math.max(b.minX, Math.min(b.maxX, this.pos.x)), y = Math.max(b.minY, Math.min(b.maxY, this.pos.y));
      if (Math.abs(x - this.pos.x) < 1 && Math.abs(y - this.pos.y) < 1) return;
      clearTimeout(this.walkTimer); clearTimeout(this.nextTimer);
      this.haltWalk();
      this.startWalk({ x, y });
    }

    /** Длина паузы между прогулками/действиями, мс (настройка поведения). */
    pauseMs() { return rand(BEH.pauseMin, BEH.pauseMax) * 1000; }

    /** Новый цикл «прогулки → отдых»: сколько прогулок до отдыха. */
    resetCycle() { this.walksLeft = BEH.mode === 'limited' ? randInt(BEH.walksMin, BEH.walksMax) : Infinity; this.restUntil = 0; }

    /** Настройки поведения изменили: цикл начинается заново, а стоящий герой пересчитывает свою паузу (идущий дойдёт и продолжит по новым правилам). */
    onBehaviorChanged() {
      if (this.removed) return;
      this.resetCycle();
      if (this.anim === 'idle') { clearTimeout(this.nextTimer); this.goIdle(); }
    }

    /** Подходящие доп. анимации героя: разрешённых видов (kinds — нужный вид или любой разрешённый). */
    extraChoices(kind) {
      return (this.pack.extras || []).filter((e) => (kind ? e.kind === kind : BEH.kinds[e.kind]));
    }
    pickExtra(kind) { const l = this.extraChoices(kind); return l.length ? l[Math.floor(Math.random() * l.length)] : null; }

    endWalk() {
      if (this.removed) return;
      this.decide();
    }

    /** Что делать дальше, когда герой остановился: доп. анимация (с шансом), афк-действие (с шансом) или просто стоять. */
    decide() {
      if (this.removed) return;
      const ex = BEH.extraChance > 0 && Math.random() * 100 < BEH.extraChance ? this.pickExtra() : null;
      if (ex) { this.startAction(ex); return; }
      if (this.pack.afk && this.pack.afk.length && BEH.afkChance > 0 && Math.random() * 100 < BEH.afkChance) { this.startAfk(); return; }
      this.goIdle();
    }

    /** Стойка, после неё — по правилам режима: идти дальше / отдыхать (стоять, изредка играя анимации) / в режиме «на месте» только стоять. */
    goIdle() {
      this.endAction();
      this.anim = 'idle';
      this.afk = null;
      this.animStart = performance.now(); // стойка начинается с первого кадра, направление остаётся прежним
      const resting = BEH.mode === 'stay' || (BEH.mode === 'limited' && this.walksLeft <= 0);
      let delay = this.pauseMs();
      if (resting && BEH.mode === 'limited') {
        if (!this.restUntil) this.restUntil = performance.now() + rand(BEH.restMin, BEH.restMax) * 1000;
        delay = Math.min(Math.max(delay * 2, 800), Math.max(0, this.restUntil - performance.now()));
      } else if (resting) delay = Math.max(delay * 2, 800);
      this.nextTimer = setTimeout(() => this.afterIdle(), delay);
    }

    afterIdle() {
      if (this.removed) return;
      if (BEH.mode === 'stay') { this.decide(); return; }
      if (BEH.mode === 'limited' && this.walksLeft <= 0) {
        if (performance.now() < this.restUntil) { this.decide(); return; }  // отдых ещё идёт — можно сыграть анимацию
        this.resetCycle();                                                   // отдохнул — новая серия прогулок
      }
      this.startWalk();
    }

    /** Останавливает идущего героя на том месте, где он сейчас (иначе доп. анимация проигралась бы «на бегу» или герой доехал бы до точки в стойке). */
    haltWalk() {
      if (this.anim !== 'walk') return;
      clearTimeout(this.walkTimer);
      const m = new DOMMatrix(getComputedStyle(this.el).transform);
      this.pos = { x: m.e, y: m.f };
      this.el.style.transition = 'opacity 0.5s ease';
      this.el.style.transform = `translate(${m.e}px, ${m.f}px)`;
    }

    /** Играет доп. анимацию ex (manifest.extras) один раз: герой встаёт на месте, кадры берутся из атласа анимации (свой размер ячейки), по окончании — стойка. */
    startAction(ex) {
      if (this.removed || !ex) return;
      clearTimeout(this.nextTimer); clearTimeout(this.walkTimer);
      this.haltWalk();
      this.afk = null;
      const dir = this.pack.directions[this.dirIdx], n = ex.frames[dir] || ex.columns, fps = ex.fps || this.pack.fps;
      this.anim = 'action';
      this.action = { ex, n, fps, start: performance.now(), dur: Math.max(200, (ex.loops || 1) * n / fps * 1000) };
      this.xcanvas.width = ex.cell.w; this.xcanvas.height = ex.cell.h;
      this.xKey = '';
      this.placeAction();
      this.el.classList.add('acting');
      ensureLoop();
    }

    /** Ставит холст доп. анимации так, чтобы её опорная точка совпала с опорной точкой основных кадров. */
    placeAction() {
      if (!this.action) return;
      const ex = this.action.ex, s = this.heroScale;
      this.xcanvas.style.width = Math.round(ex.cell.w * s) + 'px'; this.xcanvas.style.height = Math.round(ex.cell.h * s) + 'px';
      this.xcanvas.style.left = Math.round((this.pack.pivot.x - ex.pivot.x) * s) + 'px'; this.xcanvas.style.top = Math.round((this.pack.pivot.y - ex.pivot.y) * s) + 'px';
    }

    tickAction(now) {
      const a = this.action;
      if (now - a.start >= a.dur) { this.goIdle(); return; }
      const f = frameForTime(now - a.start, a.n, a.fps);
      const key = a.ex.name + ':' + this.dirIdx + ':' + f;
      if (key === this.xKey) return;
      this.xKey = key;
      this.xctx.clearRect(0, 0, this.xcanvas.width, this.xcanvas.height);
      this.xctx.drawImage(this.atlases[a.ex.file], f * a.ex.cell.w, this.dirIdx * a.ex.cell.h, a.ex.cell.w, a.ex.cell.h, 0, 0, a.ex.cell.w, a.ex.cell.h);
    }

    /** Заканчивает доп. анимацию (если она шла): возвращает основной холст. */
    endAction() {
      if (!this.action) return;
      this.action = null;
      this.el.classList.remove('acting');
      this.drawnKey = '';
    }

    /** Команда чата («!прыжок») или реакция: сыграть доп. анимацию героя по имени (нет такой — по виду); героя уже занимает другая доп. анимация — игнор. Возвращает, сыграл ли. */
    playAction(name, kind) {
      if (this.removed || this.action) return false;
      const ex = (this.pack.extras || []).find((e) => e.name === name) || this.pickExtra(kind);
      if (!ex) return false;
      this.startAction(ex);
      return true;
    }

    startAfk() {
      const act = this.pack.afk[Math.floor(Math.random() * this.pack.afk.length)];
      const now = performance.now();
      this.endAction();
      this.anim = 'afk';
      this.afk = { act, step: 0, stepStart: now };
      this.animStart = now;
    }

    /** Длительность шага афк-действия: seconds — столько секунд (клип зациклен), иначе loops проходов клипа (по умолчанию один). */
    afkStepMs(clip, dir) {
      const n = clip.frames[dir];
      return clip.seconds ? clip.seconds * 1000 : (clip.loops || 1) * n / this.pack.fps * 1000;
    }

    /** Ведёт афк-действие по времени: шаги идут друг за другом (клип может проигрываться задом наперёд — так «встаёт» тот, кто «садился»); по окончании — стойка. */
    tickAfk(now) {
      const dir = this.pack.directions[this.dirIdx];
      let { act, step, stepStart } = this.afk;
      while (step < act.clips.length && now - stepStart >= this.afkStepMs(act.clips[step], dir)) { stepStart += this.afkStepMs(act.clips[step], dir); step++; }
      if (step >= act.clips.length) { this.goIdle(); return; }
      this.afk.step = step; this.afk.stepStart = stepStart;
      const clip = act.clips[step], n = clip.frames[dir];
      const i = frameForTime(now - stepStart, n, this.pack.fps);
      this.drawCell('afk', this.dirIdx, clip.reverse ? n - 1 - i : i, clip.file);
    }

    tick(now) {
      if (this.removed) return;
      if (this.anim === 'action' && this.action) this.tickAction(now);
      else if (this.anim === 'afk' && this.afk) this.tickAfk(now);
      else {
        const dir = this.pack.directions[this.dirIdx];
        this.drawCell(this.anim, this.dirIdx, frameForTime(now - this.animStart, this.pack[this.anim].frames[dir], this.pack.fps));
      }
      if (this.bubbleVisible) this.placeBubble();
    }

    /** Держит облако над головой и в пределах экрана; «мысли»-хвост всегда тянутся к голове героя. */
    placeBubble() {
      const r = this.el.getBoundingClientRect();
      const bw = this.bubble.offsetWidth;
      const cx = r.left + r.width / 2;
      const leftAbs = Math.max(8, Math.min(innerWidth - 8 - bw, cx - bw / 2));
      this.bubble.style.left = (leftAbs - r.left) + 'px';
      const tail = Math.max(34, Math.min(bw - 34, cx - leftAbs)); // у самого края облака хвост не рисуем — иначе «мысли» повисли бы мимо тела
      this.bubble.style.setProperty('--tail-x', tail + 'px');
      this.redrawCloud(tail);
    }

    /** Перерисовывает облако, только если изменился его размер или положение хвоста (на клетку и больше). */
    redrawCloud(tail) {
      const w = this.bubble.offsetWidth, h = this.bubble.offsetHeight;
      const key = `${w}x${h}:${Math.round(tail / CLOUD.U)}`;
      if (key === this.cloudKey || !w || !h) return;
      this.cloudKey = key;
      renderCloud(this.cloud, w, h, tail);
    }

    showMessage(msg) {
      const username = String(msg.username || '');
      if (this.owner && BEH.reactChance > 0 && this.anim !== 'afk' && !this.action && Math.random() * 100 < BEH.reactChance) { const ex = this.pickExtra(); if (ex && ex.kind !== 'attack') this.startAction(ex); } // реагирует на своё сообщение жестом/прыжком/заклинанием (не ударом)
      this.bubble.replaceChildren();
      this.cloud = document.createElement('canvas');
      this.cloud.className = 'bubble-cloud';
      const inner = document.createElement('div');
      inner.className = 'bubble-inner';
      const name = document.createElement('div');
      name.className = 'bubble-name';
      name.textContent = username;
      name.style.color = msg.color || colorForName(username);
      const text = document.createElement('span');
      text.className = 'bubble-text';
      (msg.parts || []).forEach((part) => {
        if (part.type === 'emote' && part.imageUrl) {
          const img = document.createElement('img');
          img.className = 'emote';
          img.src = part.imageUrl;
          img.alt = part.name || '';
          text.appendChild(img);
        } else if (part.text) {
          text.appendChild(document.createTextNode(part.text)); // текстовые узлы: сообщение пишет зритель
        }
      });
      if (this.owner) inner.append(text); else inner.append(name, text); // у героя чаттера ник уже подписан над головой — в облаке его не повторяем
      this.bubble.append(this.cloud, inner);
      clearTimeout(this.hideTimer);
      clearTimeout(this.removeTimer);
      this.bubble.classList.remove('fading');
      this.bubble.classList.add('visible');
      this.el.classList.add('speaking');
      this.bubbleVisible = true;
      this.cloudKey = '';
      this.placeBubble();
      this.hideTimer = setTimeout(() => {
        this.bubble.classList.add('fading'); // плавно гаснет
        this.removeTimer = setTimeout(() => { this.bubble.classList.remove('visible', 'fading'); this.el.classList.remove('speaking'); this.bubbleVisible = false; }, CFG.fadeMs + 40);
      }, CFG.bubbleMs);
    }

    teleport(x, y) {
      clearTimeout(this.walkTimer); clearTimeout(this.nextTimer);
      this.endAction();
      this.anim = 'idle'; this.afk = null; this.animStart = performance.now();
      this.pos = { x, y };
      this.el.style.transition = 'opacity 0.5s ease';
      this.el.style.transform = `translate(${x}px, ${y}px)`;
      this.nextTimer = setTimeout(() => this.startWalk(), 99999999);
    }

    /** Герой уходит со сцены: перестаёт ходить и говорить, плавно гаснет и убирается из страницы вместе со всеми своими таймерами. */
    remove() {
      if (this.removed) return;
      this.removed = true;
      [this.walkTimer, this.nextTimer, this.hideTimer, this.removeTimer].forEach(clearTimeout);
      this.el.style.transition = 'opacity 0.5s ease';
      this.el.style.opacity = '0';
      setTimeout(() => this.el.remove(), 600);
    }

    debug() {
      const dir = this.pack.directions[this.dirIdx];
      const frames = this.anim === 'action' && this.action ? this.action.n : this.anim === 'afk' && this.afk ? this.afk.act.clips[Math.min(this.afk.step, this.afk.act.clips.length - 1)].frames[dir] : this.pack[this.anim].frames[dir];
      return { id: this.id, owner: this.owner, name: this.name, level: this.level, pos: { ...this.pos }, anim: this.anim, dir, dirIdx: this.dirIdx, frames, afkStep: this.afk ? this.afk.step : null, afkName: this.afk ? this.afk.act.name : null, actionName: this.action ? this.action.ex.name : null, actionKind: this.action ? this.action.ex.kind : null, walksLeft: this.walksLeft === Infinity ? -1 : this.walksLeft,
        frame: this.action ? this.xKey : this.drawnKey, bubbleVisible: this.bubbleVisible, heroW: this.heroW, heroH: this.heroH, heroScale: this.heroScale, sizeFactor: this.sizeFactor, packLoaded: true, manifest: this.pack };
    }
  }

  /* ---------- Какие герои на сцене ---------- */
  let wanted = [];                 // список героев «вручную» от сервера (порядок важен)
  let wantedChatters = [];         // список героев чаттеров от сервера: [{ login, name, color, hero }]
  let chatterMode = true;          // выдаются ли герои чаттерам (настройка из админки)
  const loading = new Set();       // герои, чьи паки сейчас грузятся (ключи m:<id> и c:<логин>)
  const pending = new Map();       // сообщения чаттеров, пришедшие раньше, чем загрузился их герой: логин -> { msg, ts }
  const isManual = (h) => !h.owner;
  const manualHeroes = () => heroes.filter(isManual);
  const chatterHero = (login) => heroes.find((h) => h.owner === login) || null;

  function spawn(id, data, owner) {
    const hero = new Hero(id, data, owner);
    heroes.push(hero);
    hero.start();
    return hero;
  }

  /** Порядок на сцене: сначала герои вручную (как в списке), затем герои чаттеров (как в списке сервера). */
  function sortHeroes() {
    const order = (h) => (isManual(h) ? wanted.indexOf(h.id) : 1000 + wantedChatters.findIndex((c) => c.login === h.owner));
    heroes.sort((a, b) => order(a) - order(b));
  }

  /** Приводит сцену к списку героев «вручную»: недостающих добавляет, лишних убирает, остальных не трогает; порядок на сцене — как в списке. */
  function syncActive(ids) {
    wanted = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && ID_RE.test(id)))];
    for (let i = heroes.length - 1; i >= 0; i--) if (isManual(heroes[i]) && !wanted.includes(heroes[i].id)) { heroes[i].remove(); heroes.splice(i, 1); }
    wanted.forEach((id) => {
      if (manualHeroes().some((h) => h.id === id) || loading.has('m:' + id)) return;
      loading.add('m:' + id);
      loadPack(`/pixel-avatar/${id}/manifest.json`)
        .then((data) => { if (wanted.includes(id) && !manualHeroes().some((h) => h.id === id)) { spawn(id, data); sortHeroes(); } }) // успели убрать, пока грузился, — не появляется
        .catch((e) => console.error(`[pixel-avatar] Не удалось загрузить героя «${id}»: ${e.message}`))
        .finally(() => loading.delete('m:' + id));
    });
    sortHeroes();
  }

  /** То же для героев чаттеров: список [{ login, name, color, hero }] от сервера; у существующих обновляется подпись (ник/цвет). */
  function syncChatters(list) {
    wantedChatters = (Array.isArray(list) ? list : []).filter((c) => c && typeof c.login === 'string' && LOGIN_RE.test(c.login) && typeof c.hero === 'string' && ID_RE.test(c.hero))
      .map((c) => ({ login: c.login, name: String(c.name || c.login).slice(0, 40), color: typeof c.color === 'string' ? c.color : '', hero: c.hero, level: Number.isInteger(c.level) && c.level >= 0 && c.level <= 9999 ? c.level : 0 }));
    for (let i = heroes.length - 1; i >= 0; i--) if (!isManual(heroes[i]) && !wantedChatters.some((c) => c.login === heroes[i].owner)) { heroes[i].remove(); heroes.splice(i, 1); }
    wantedChatters.forEach((c) => {
      const have = chatterHero(c.login);
      if (have && have.id === c.hero) { have.setName(c.name, c.color, c.level); return; }
      const key = 'c:' + c.login + ':' + c.hero;      // герой другой (человеку сменили аватар) — грузим нового и заменяем прежнего на его месте
      if (loading.has(key)) return;
      loading.add(key);
      loadPack(`/pixel-avatar/${c.hero}/manifest.json`)
        .then((data) => {
          const cur = wantedChatters.find((x) => x.login === c.login);
          if (!cur || cur.hero !== c.hero) return;     // список уже изменился, пока грузился
          const old = chatterHero(c.login);
          if (old && old.id === c.hero) return;        // уже заменён
          let at = null;
          if (old) {                                    // новый герой встаёт там, где сейчас прежний
            const m = new DOMMatrix(getComputedStyle(old.el).transform);
            at = { x: m.e, y: m.f };
            old.remove(); heroes.splice(heroes.indexOf(old), 1);
          }
          const hero = spawn(c.hero, data, { owner: c.login, name: cur.name, color: cur.color, level: cur.level, at });
          sortHeroes();
          const p = pending.get(c.login);
          if (p && performance.now() - p.ts < 8000) hero.showMessage(p.msg); // сообщение, пришедшее раньше героя, звучит, как только он появился
          pending.delete(c.login);
        })
        .catch((e) => console.error(`[pixel-avatar] Не удалось загрузить героя чаттера «${c.login}» (${c.hero}): ${e.message}`))
        .finally(() => loading.delete(key));
    });
    sortHeroes();
  }

  /** Настройки из админки: «выдавать героев чаттерам» и «режим 2D». */
  function applySettings(s) {
    if (!s || typeof s !== 'object') return;
    if (typeof s.chatters === 'boolean') chatterMode = s.chatters;
    if (s.groupScale && typeof s.groupScale === 'object') {     // размер героев по категориям (%, целые 25–300; всё остальное отбрасывается)
      const clean = {};
      for (const [g, v] of Object.entries(s.groupScale)) if (Number.isInteger(v) && v >= 25 && v <= 300 && v !== 100) clean[g] = v;
      groupScale = clean;
    }
    if (s.heroScale && typeof s.heroScale === 'object') {        // размер каждого героя (%, целые 25–300; всё остальное отбрасывается)
      const clean = {};
      for (const [id, v] of Object.entries(s.heroScale)) if (ID_RE.test(id) && Number.isInteger(v) && v >= 25 && v <= 300 && v !== 100) clean[id] = v;
      heroScaleMap = clean;
    }
    if ((s.groupScale && typeof s.groupScale === 'object') || (s.heroScale && typeof s.heroScale === 'object')) heroes.forEach((h) => h.setSizeFactor(sizeFactorFor(h)));
    if (s.tag && typeof s.tag === 'object') {                     // цвета подписи над героем
      const t = { ...tagCfg };
      if (s.tag.nickColorMode === 'twitch' || s.tag.nickColorMode === 'custom') t.nickColorMode = s.tag.nickColorMode;
      ['nickColor', 'levelColor', 'levelBg'].forEach((k) => { if (typeof s.tag[k] === 'string' && HEX_RE.test(s.tag[k])) t[k] = s.tag[k]; });
      tagCfg = t;
      document.documentElement.style.setProperty('--lvl-color', tagCfg.levelColor);
      document.documentElement.style.setProperty('--lvl-bg', tagCfg.levelBg);
      heroes.forEach((h) => h.refreshTag());
    }
    if (s.behavior && typeof s.behavior === 'object') {          // поведение: режим, прогулки/отдых, шансы анимаций
      const next = cleanBehavior(s.behavior);
      if (JSON.stringify(next) !== JSON.stringify(BEH)) { BEH = next; heroes.forEach((h) => h.onBehaviorChanged()); }
    }
    if (typeof s.plane2d === 'boolean' && s.plane2d !== plane) { plane = s.plane2d; heroes.forEach((h) => h.applyPlane()); }
  }

  /* ---------- Чат: существующий WebSocket ---------- */
  /** Старый режим (герои чаттерам не выдаются): на чьи сообщения реагирует страница — стример (по значку Twitch broadcaster), все или один человек по нику. */
  function shouldReact(data) {
    if (CFG.who === 'all') return true;
    if (CFG.who === 'broadcaster') return !!(data.roles && data.roles.broadcaster);
    return String(data.username || '').toLowerCase() === CFG.who.toLowerCase();
  }

  /** Старый режим: сообщение произносит первый из героев, показанных вручную; нет героев — некому. */
  function showMessage(msg) { const h = manualHeroes()[0]; if (h) h.showMessage(msg); }

  /** Режим героев чаттеров: сообщение звучит над героем ЭТОГО человека; если герой ещё грузится — сообщение ждёт его (до 8 секунд). */
  function chatterMessage(msg) {
    const login = String(msg.login || '').toLowerCase();
    if (!LOGIN_RE.test(login)) return;
    const hero = chatterHero(login);
    if (hero) { hero.showMessage(msg); return; }
    if (wantedChatters.some((c) => c.login === login)) {
      pending.set(login, { msg, ts: performance.now() });
      if (pending.size > 60) { const oldest = [...pending.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0]; pending.delete(oldest); }
    }
  }

  function connect() {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?type=chat`);
    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      if (data.type === 'chat') {                                   // chat_history (старые сообщения при подключении) не показываем
        if (!CFG.pack && chatterMode) chatterMessage(data);
        else if (shouldReact(data)) showMessage(data);
      } else if (data.type === 'pixel_action' && !CFG.pack) {         // команда чата: герой этого зрителя играет доп. анимацию
        const login = String(data.login || '').toLowerCase();
        if (LOGIN_RE.test(login) && EXTRA_KINDS.includes(data.kind)) { const h = chatterHero(login); if (h) h.playAction(typeof data.name === 'string' ? data.name : '', data.kind); }
      } else if (data.type === 'pixel_heroes' && !CFG.pack) {         // в режиме ?pack=… список от сервера не нужен
        applySettings(data.settings);                                // настройки раньше списков: герои сразу появятся в нужном режиме
        syncActive(data.active);
        syncChatters(data.chatters);
      }
    };
    ws.onclose = () => setTimeout(connect, 3000);
  }
  window.addEventListener('resize', () => heroes.forEach((h) => h.applyPlane())); // окно OBS изменили — в режиме 2D линия земли сдвинулась

  /* ---------- Запуск ---------- */
  const DEMO = [
    ['Viewer', 'Привет! Удачного стрима!'], ['Viewer', 'Это тестовое сообщение над головой героя'],
    ['Viewer', 'Герои ходят по восьми направлениям'], ['Viewer', 'Длинное сообщение проверяет перенос строк: ' + 'слово '.repeat(18)],
  ];
  function startDemo() {
    let i = 0;
    setTimeout(function tick() { const d = DEMO[i++ % DEMO.length]; showMessage({ username: d[0], parts: [{ type: 'text', text: d[1] }] }); setTimeout(tick, CFG.demoMs); }, 800);
  }

  let ready;
  if (CFG.pack) {
    // Один герой по адресу (?pack=…): удобно для проверки нового героя без сервера. Нет пака — героя нет, но сообщения всё равно не ломают страницу.
    ready = loadPack(CFG.pack)
      .then((data) => { spawn(CFG.pack.split('/').slice(-2, -1)[0] || 'hero', data); })
      .catch((e) => { console.error('[pixel-avatar] Не удалось загрузить пак героя (' + CFG.pack + '): ' + e.message); })
      .then(() => { if (CFG.demo) startDemo(); else connect(); });
  } else if (CFG.demo) {
    ready = loadPack('/pixel-avatar/archer/manifest.json').then((data) => { spawn('archer', data); }).catch((e) => console.error('[pixel-avatar] demo: ' + e.message)).then(startDemo);
  } else {
    connect();
    ready = Promise.resolve();
  }

  // Программный интерфейс «первого героя» и вспомогательные функции — для автотестов в настоящем браузере.
  const first = () => heroes[0];
  window.PixelAvatar = {
    CFG, CLOUD, ready, frameForTime, dirFromVector: (dx, dy) => dirFromVector(dx, dy, first() && first().pack.directions), shouldReact, showMessage, syncActive, syncChatters, applySettings, cloudGrid, renderCloud,
    pickTarget: (from) => first().pickTarget(from), bounds: () => first().bounds(), drawCell: (a, d, f) => first().drawCell(a, d, f), teleport: (x, y) => first().teleport(x, y),
    heroes: () => heroes.map((h) => h.id), chatters: () => heroes.filter((h) => h.owner).map((h) => h.owner), order: () => heroes.map((h) => h.owner || h.id), isPlane: () => plane,
    hero: (id) => { const h = heroes.find((x) => x.id === id); return h ? { debug: () => h.debug(), teleport: (x, y) => h.teleport(x, y), showMessage: (m) => h.showMessage(m), el: h.el } : null; },
    behavior: () => JSON.parse(JSON.stringify(BEH)), playAction: (login, name, kind) => { const h = chatterHero(login); return !!h && h.playAction(name, kind); },
    chatterHeroOf: (login) => { const h = chatterHero(login); return h ? { debug: () => h.debug(), playAction: (n, k) => h.playAction(n, k), hero: h, teleport: (x, y) => h.teleport(x, y), showMessage: (m) => h.showMessage(m), el: h.el } : null; },
    _debug: () => (first() ? first().debug() : { packLoaded: false, bubbleVisible: false, anim: 'idle', frame: '', manifest: null }),
  };
})();
