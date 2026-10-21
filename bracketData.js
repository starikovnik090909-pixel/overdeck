// bracketData.js
// "Турнирная сетка" — автоматическая генерация (single/double elimination,
// round robin) + выравнивание по НАСТОЯЩЕМУ CSS Grid (не пиксельные x/y, а
// gridColumn/gridRowStart/gridRowSpan — раскладка "дерева" турнирной сетки
// делается формулой на степенях двойки, см. buildSingleElim, это даёт
// идеальное центрирование каждого следующего раунда между двумя родителями
// СРЕДСТВАМИ САМОГО GRID, без ручного подсчёта пикселей). Плюс
// drag-and-drop команд между слотами (swapSlots) и откат к исходной
// расстановке (resetToOriginalSeeding) — для этого при генерации каждый
// матч запоминает свою ПЕРВОначальную пару команд отдельно от текущей.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'bracket_data.json');
const SAVED_BRACKETS_DIR = path.join(__dirname, 'saved_brackets');
const BRACKET_TEAMS_FILE = path.join(__dirname, 'bracket_teams.json');
const LOGOS_DIR = path.join(__dirname, 'uploads', 'bracket-logos');

const MODES = ['single', 'double', 'roundrobin'];
const FINAL_FORMATS = ['bo1', 'bo3']; // формат ТОЛЬКО матча "Финал" (playoffSlot==='final') кругового этапа — см. setFinalFormat/addFinalGameWin ниже

const SIZE_DEFAULTS_HARDCODED = {
  // --- Размеры шрифтов ---
  nameFontSize: 20,
  scoreFontSize: 26, // теперь размер буквы W/L на плашке (раньше — числового счёта, который убрали)
  tableFontSize: 15, // строки турнирной таблицы (место/команда/W-L/очки)
  // --- Матчи группы ---
  columns: 2, // сколько колонок матчей в ряд — 1 или 2
  plateMaxWidth: 0, // px — потолок ширины ОДНОГО матча (две плашки + "VS"); 0 = без ограничения, плашки тянутся на всю ширину панели. (Раньше было plateWidth=700 по умолчанию — резало плашки и оставляло пустые поля по бокам; ключ переименован, чтобы старое сохранённое 700 не продолжало это делать.)
  // --- Отступы ---
  panelPadding: 20, // px — отступ содержимого от краёв КАЖДОЙ из трёх панелей (матчи/плей-офф/таблица)
  platePadding: 16, // px — внутренний отступ плашки команды слева и справа (от рамки до логотипа/буквы W/L)
  plateInnerGap: 12, // px — расстояние между логотипом, названием и буквой W/L внутри плашки
  plateHeight: 64, // px — МИНИМАЛЬНАЯ высота ряда с матчем; если места больше — тянется (см. #bracketGroupGrid), меньше этого не сжимается
  logoSize: 36,
  gapX: 24, // горизонтальный зазор между колонками матчей группы (не используется при columns=1)
  gapY: 10, // вертикальный зазор между строками матчей группы
  tableRowHeight: 32, // высота ОДНОЙ строки турнирной таблицы — от неё же зависит общая высота таблицы (не растягивается на весь экран при малом числе команд)
  tableRowGap: 2, // отступ между строками турнирной таблицы
  // --- Прозрачность ---
  panelOpacity: 100, // % — 0 прозрачно, 100 непрозрачно; общее на все панели (матчи/таблица/плей-офф)
  // --- Свечение победителя/проигравшего в плашке матча ---
  pulseSpeed: 1600, // мс — длительность одного цикла ПУЛЬСАЦИИ свечения победителя (в мс, не в сек — общий clampNum ниже округляет до целого, а миллисекунды и так целое число); проигравший светится статично, без пульсации вообще
};
const SIZE_LIMITS = {
  nameFontSize: [8, 60],
  scoreFontSize: [8, 60],
  tableFontSize: [8, 60],
  columns: [1, 2],
  plateMaxWidth: [0, 1600],
  panelPadding: [0, 80],
  platePadding: [0, 60],
  plateInnerGap: [0, 60],
  plateHeight: [32, 200],
  logoSize: [12, 120],
  gapX: [0, 150],
  gapY: [0, 150],
  tableRowHeight: [20, 100],
  tableRowGap: [0, 40],
  panelOpacity: [0, 100],
  pulseSpeed: [400, 5000],
};

// Локальные цвета/шрифты (работают только пока "Тема ивента" НЕ применена к
// сетке — см. eventTheme.js, галочка 'bracket'). Цвет фона намеренно
// хранится сплошным hex (как и у остальных виджетов проекта) — прозрачность
// панелей регулируется отдельно фиксированным значением в CSS, чтобы не
// плодить ещё один слайдер сверх списка из задания.
const COLOR_DEFAULTS = {
  bgColor: '#0f1220',
  textColor: '#f0e6d2',
  titleColor: '#f0e6d2',
  borderColor: '#c9a24a',
  accentColor: '#ffd700', // золотое свечение/акценты; "VS" между плашками матча тоже этим цветом
  titleFont: 'Inter',
  dataFont: 'Inter',
  titleFontWeight: 900,
  dataFontWeight: 700,
  // Обводка/свечение победителя и проигравшего — по прямому ТЗ настраиваемые именно для сетки (раньше в комментарии
  // выше говорилось, что это "фиксированный язык на весь проект", но нигде за пределами bracket.css он и не
  // использовался — так что делаем настраиваемым здесь, не трогая никакой другой виджет).
  winColor: '#2ecc71', // зелёный — обводка и ПУЛЬСИРУЮЩЕЕ свечение победителя плашки матча
  loseColor: '#e74c3c', // красный — обводка и СТАТИЧНОЕ (без пульсации) свечение проигравшего
};

const SIZE_DEFAULTS_FILE = path.join(__dirname, 'bracket_size_defaults.json');
let SIZE_DEFAULTS = { ...SIZE_DEFAULTS_HARDCODED }; // может быть переопределён кнопкой "Сохранить как дефолтные" — см. loadSizeDefaults/saveSizeSettingsAsDefault

// ---------- Раскладка трёх панелей (позиция/размер/вкл-выкл) — та же модель,
// что и у "Виджетов оверлея" (см. widgets.js/widgetsPersistence.js), просто
// свой набор из 3 панелей вместо 5. Координаты — на сцене 1920×1080. ----------
const PANEL_DEFS = [
  { id: 'matches', label: 'Матчи' },
  { id: 'playoff', label: 'Решающие матчи' },
  { id: 'standings', label: 'Турнирная таблица' },
];
const DEFAULT_PANEL_LAYOUT = {
  matches: { x: 60, y: 60, w: 1000, h: 700, enabled: true },
  playoff: { x: 1100, y: 60, w: 760, h: 500, enabled: true },
  standings: { x: 60, y: 780, w: 1000, h: 240, enabled: true },
};
let PANEL_LAYOUT_DEFAULTS = JSON.parse(JSON.stringify(DEFAULT_PANEL_LAYOUT)); // тоже может быть переопределён "Сохранить как дефолтные"

// Double Elimination использует те же три панели (id те же — матчи/playoff/standings, чтобы вся механика
// перетаскивания и размеров работала без изменений), но с другим назначением и своей раскладкой:
// matches = «Верхняя сетка», standings = «Нижняя сетка», playoff = «Гранд-финал». Раскладка DE хранится отдельно
// от раскладки «все против всех» (см. layoutStash и generateBracket), поэтому переключение формата не ломает ни ту, ни другую.
const DEFAULT_PANEL_LAYOUT_DE = {
  matches: { x: 60, y: 60, w: 1380, h: 480, enabled: true },
  playoff: { x: 1480, y: 60, w: 380, h: 480, enabled: true },
  standings: { x: 60, y: 580, w: 1380, h: 440, enabled: true },
};
let PANEL_LAYOUT_DEFAULTS_DE = JSON.parse(JSON.stringify(DEFAULT_PANEL_LAYOUT_DE));
const DOUBLE_MAX_TEAMS = 16; // выше — нижняя сетка на экран 1920×1080 уже не помещается читаемо
const DOUBLE_MIN_TEAMS = 4;
const DE_GROUP_LABEL = 'DOUBLE ELIMINATION • BO1';
const RR_GROUP_LABEL = 'ГРУППОВОЙ ЭТАП • BO1';

function clampPanelNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Приводит присланную раскладку панелей к валидному виду — тот же принцип, что и widgets.js:sanitizeLayout. */
function sanitizePanelLayout(raw, base, fallbackDefaults) {
  const result = {};
  const defaultsForFallback = fallbackDefaults || PANEL_LAYOUT_DEFAULTS;
  PANEL_DEFS.forEach((p) => {
    const r = (raw && raw[p.id]) || {};
    const baseRect = (base && base[p.id]) || defaultsForFallback[p.id];
    result[p.id] = {
      x: clampPanelNum(r.x, 0, 1920, baseRect.x),
      y: clampPanelNum(r.y, 0, 1080, baseRect.y),
      w: clampPanelNum(r.w, 100, 1920, baseRect.w),
      h: clampPanelNum(r.h, 60, 1080, baseRect.h),
      enabled: typeof r.enabled === 'boolean' ? r.enabled : baseRect.enabled,
    };
  });
  return result;
}

const PANEL_LAYOUT_DEFAULTS_FILE = path.join(__dirname, 'bracket_panel_layout_defaults.json');
const PANEL_LAYOUT_DEFAULTS_DE_FILE = path.join(__dirname, 'bracket_panel_layout_defaults_de.json');

function loadPanelLayoutDefaults() {
  try {
    if (fs.existsSync(PANEL_LAYOUT_DEFAULTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PANEL_LAYOUT_DEFAULTS_FILE, 'utf8'));
      PANEL_LAYOUT_DEFAULTS = sanitizePanelLayout(raw, DEFAULT_PANEL_LAYOUT);
      return;
    }
  } catch (e) {
    console.warn('[Турнирная сетка] Не удалось прочитать bracket_panel_layout_defaults.json, используем встроенную раскладку:', e.message);
  }
  PANEL_LAYOUT_DEFAULTS = JSON.parse(JSON.stringify(DEFAULT_PANEL_LAYOUT));
}

/** "Сохранить как дефолтные" для панелей — текущее расположение/размеры становятся тем, что подставляется при генерации новой/очищенной сетки. */
function loadPanelLayoutDefaultsDE() {
  try {
    if (fs.existsSync(PANEL_LAYOUT_DEFAULTS_DE_FILE)) {
      PANEL_LAYOUT_DEFAULTS_DE = sanitizePanelLayout(JSON.parse(fs.readFileSync(PANEL_LAYOUT_DEFAULTS_DE_FILE, 'utf8')), DEFAULT_PANEL_LAYOUT_DE, DEFAULT_PANEL_LAYOUT_DE);
      return;
    }
  } catch (e) {
    console.warn('[Турнирная сетка] Не удалось прочитать bracket_panel_layout_defaults_de.json, используем встроенную раскладку:', e.message);
  }
  PANEL_LAYOUT_DEFAULTS_DE = JSON.parse(JSON.stringify(DEFAULT_PANEL_LAYOUT_DE));
}

function savePanelLayoutAsDefault() {
  if (data && data.mode === 'double') { // раскладка Double Elimination сохраняется в СВОЙ файл — «все против всех» не затрагивается
    PANEL_LAYOUT_DEFAULTS_DE = JSON.parse(JSON.stringify(data.panelLayout));
    try {
      fs.writeFileSync(PANEL_LAYOUT_DEFAULTS_DE_FILE, JSON.stringify(PANEL_LAYOUT_DEFAULTS_DE, null, 2));
    } catch (e) {
      console.warn('[Турнирная сетка] Не удалось сохранить bracket_panel_layout_defaults_de.json:', e.message);
    }
    return PANEL_LAYOUT_DEFAULTS_DE;
  }
  PANEL_LAYOUT_DEFAULTS = JSON.parse(JSON.stringify(data.panelLayout));
  try {
    fs.writeFileSync(PANEL_LAYOUT_DEFAULTS_FILE, JSON.stringify(PANEL_LAYOUT_DEFAULTS, null, 2));
  } catch (e) {
    console.warn('[Турнирная сетка] Не удалось сохранить bracket_panel_layout_defaults.json:', e.message);
  }
  return PANEL_LAYOUT_DEFAULTS;
}

function updatePanelLayout(rawLayout) {
  data.panelLayout = sanitizePanelLayout(rawLayout, data.panelLayout, data.mode === 'double' ? PANEL_LAYOUT_DEFAULTS_DE : PANEL_LAYOUT_DEFAULTS);
  save();
  return data;
}

function loadSizeDefaults() {
  try {
    if (fs.existsSync(SIZE_DEFAULTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SIZE_DEFAULTS_FILE, 'utf8'));
      SIZE_DEFAULTS = normalizeSizeSettingsAgainst(raw, SIZE_DEFAULTS_HARDCODED);
      return;
    }
  } catch (e) {
    console.warn('[Турнирная сетка] Не удалось прочитать bracket_size_defaults.json, используем встроенные значения:', e.message);
  }
  SIZE_DEFAULTS = { ...SIZE_DEFAULTS_HARDCODED };
}

/** "Сохранить как дефолтные настройки" — текущие значения ползунков становятся тем, что подставляется при генерации новой/очищенной сетки. */
function saveSizeSettingsAsDefault() {
  SIZE_DEFAULTS = { ...data.sizeSettings };
  try {
    fs.writeFileSync(SIZE_DEFAULTS_FILE, JSON.stringify(SIZE_DEFAULTS, null, 2));
  } catch (e) {
    console.warn('[Турнирная сетка] Не удалось сохранить bracket_size_defaults.json:', e.message);
  }
  return SIZE_DEFAULTS;
}

function ensureDirs() {
  fs.mkdirSync(SAVED_BRACKETS_DIR, { recursive: true });
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

function defaultData() {
  return { mode: 'single', teamCount: 0, teams: [], nodes: [], connections: [], sizeSettings: { ...SIZE_DEFAULTS }, colorSettings: { ...COLOR_DEFAULTS }, panelLayout: JSON.parse(JSON.stringify(PANEL_LAYOUT_DEFAULTS)), groupLabel: 'ГРУППОВОЙ ЭТАП • BO1', matchesTitle: 'Матчи', finalFormat: 'bo1' };
}

let data = null;
let savedTeams = null;

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeSizeSettingsAgainst(raw, fallbackObj) {
  const result = {};
  Object.entries(fallbackObj).forEach(([key, fallback]) => {
    const [min, max] = SIZE_LIMITS[key];
    result[key] = clampNum(raw && raw[key], min, max, fallback);
  });
  return result;
}
function normalizeSizeSettings(raw) {
  return normalizeSizeSettingsAgainst(raw, SIZE_DEFAULTS);
}

/** Локальные цвета/шрифты — та же идея, но без файла дефолтов (тема ивента их и так может перебить целиком). */
function normalizeColorSettings(raw) {
  const result = {};
  Object.entries(COLOR_DEFAULTS).forEach(([key, fallback]) => {
    if (key === 'titleFontWeight' || key === 'dataFontWeight') {
      const n = Number(raw && raw[key]);
      result[key] = Number.isFinite(n) ? Math.max(100, Math.min(900, Math.round(n / 100) * 100)) : fallback;
    } else if (key === 'titleFont' || key === 'dataFont') {
      result[key] = typeof raw?.[key] === 'string' && raw[key].trim() ? raw[key] : fallback;
    } else {
      result[key] = typeof raw?.[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw[key]) ? raw[key] : fallback;
    }
  });
  return result;
}

// ---------- Генерация сеток (позиции — в единицах CSS Grid, не в пикселях) ----------

/** Матч раунда r (0-индексация) занимает 2^(r+1) строк грида, начиная со строки matchIndex*2^(r+1)+1 — так следующий раунд автоматически центрируется между двумя родителями средствами самого Grid (проверено тестом на size=8: раунд1 матч0 занимает ровно строки 1-4, точно над раунд0 матчами 0+1). */
function gridPositionFor(bracketColOffset, round, matchIndex) {
  const rowSpan = Math.pow(2, round + 1);
  const rowStart = matchIndex * rowSpan + 1;
  return { gridColumn: bracketColOffset + round + 1, gridRowStart: rowStart, gridRowSpan: rowSpan };
}

function makeEmptyMatch(bracket, round, gridColumn, gridRowStart, gridRowSpan) {
  return {
    id: generateId('match'), kind: 'match', bracket, round,
    gridColumn, gridRowStart, gridRowSpan, playoffSlot: null,
    teamAId: null, teamBId: null,
    originalTeamAId: null, originalTeamBId: null, // снимок исходной расстановки — для кнопки "Сбросить расположение"
    winnerId: null, loserId: null, scoreA: null, scoreB: null,
    dead: null, // только Double Elimination: null | 'bye' (один из соперников никогда не появится — второй проходит дальше без игры) | 'void' (матча не будет вовсе)
  };
}

/** Готовит teamCount команд-заглушек ("Команда 1", "Команда 2"...) — задание прямо просит пустые слоты, которые потом переименовываются. */
function makePlaceholderTeams(teamCount) {
  const teams = [];
  for (let i = 0; i < teamCount; i++) teams.push({ id: generateId('team'), name: `Команда ${i + 1}`, logoUrl: null });
  return teams;
}

/**
 * Генерирует одиночную турнирную сетку (single elimination). Seeding
 * "снаружи-внутрь" (i против size-1-i) — гарантированно не сводит два BYE
 * в одном матче, пока teamCount >= 1 (проверено тестом на диапазоне 2-32).
 */
function buildSingleElim(teamCount, colOffset) {
  const size = nextPowerOf2(teamCount);
  const totalRounds = Math.log2(size);
  const teams = makePlaceholderTeams(teamCount);
  const teamSlots = [];
  for (let i = 0; i < size; i++) teamSlots.push(i < teamCount ? teams[i].id : null);

  const rounds = [];
  const round0 = [];
  for (let i = 0; i < size / 2; i++) {
    const g = gridPositionFor(colOffset, 0, i);
    const m = makeEmptyMatch('winners', 0, g.gridColumn, g.gridRowStart, g.gridRowSpan);
    m.teamAId = teamSlots[i];
    m.teamBId = teamSlots[size - 1 - i];
    m.originalTeamAId = m.teamAId;
    m.originalTeamBId = m.teamBId;
    round0.push(m);
  }
  rounds.push(round0);
  let matchCount = size / 2;
  for (let r = 1; r < totalRounds; r++) {
    matchCount /= 2;
    const round = [];
    for (let i = 0; i < matchCount; i++) {
      const g = gridPositionFor(colOffset, r, i);
      round.push(makeEmptyMatch('winners', r, g.gridColumn, g.gridRowStart, g.gridRowSpan));
    }
    rounds.push(round);
  }

  const nodes = rounds.flat();
  const connections = [];
  for (let r = 0; r < totalRounds - 1; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      const toMatch = rounds[r + 1][Math.floor(i / 2)];
      connections.push({ fromMatchId: rounds[r][i].id, toMatchId: toMatch.id, toSlot: i % 2 === 0 ? 'A' : 'B' });
    }
  }
  return { teams, nodes, connections, totalRounds, finalMatchId: rounds[totalRounds - 1][0].id };
}

/**
 * Достраивает нижнюю сетку (losers bracket) — стандартная для double
 * elimination чередующаяся схема (раунд "проигравшие между собой" / раунд
 * "против свежих проигравших верхней сетки"). С bracket reset в
 * гранд-финале: если чемпион нижней сетки обыгрывает чемпиона верхней, играется ещё один решающий матч
 * (см. syncGrandReset). Колонки нижней сетки продолжают нумерацию после верхней — так обе
 * сетки лежат в одном CSS Grid, просто в разных диапазонах колонок/строк
 * (строки нижней сетки идут с большим стартовым смещением, чтобы не
 * пересекаться с верхней — см. LOWER_ROW_OFFSET).
 */
const LOWER_ROW_OFFSET = 1000; // с запасом — верхняя сетка не бывает настолько высокой, чтобы строки пересеклись
function buildLosersAndGrandFinal(wb, colOffset) {
  const { totalRounds } = wb;
  if (totalRounds < 2) return { nodes: [], connections: [], grandFinalId: wb.finalMatchId, enabled: false };

  const nodes = [];
  const connections = [];
  let lbRound = 0;
  let lbCount = Math.pow(2, totalRounds) / 4;
  let dropInWbRound = 1;

  function lbGrid(round, index) {
    const g = gridPositionFor(colOffset, round, index);
    return { gridColumn: g.gridColumn, gridRowStart: g.gridRowStart + LOWER_ROW_OFFSET, gridRowSpan: g.gridRowSpan };
  }

  const wbRound0 = wb.nodes.filter((n) => n.bracket === 'winners' && n.round === 0);
  const consolidation0 = [];
  for (let i = 0; i < lbCount; i++) {
    const g = lbGrid(lbRound, i);
    const m = makeEmptyMatch('losers', lbRound, g.gridColumn, g.gridRowStart, g.gridRowSpan);
    consolidation0.push(m);
    connections.push({ fromMatchId: wbRound0[i * 2].id, toMatchId: m.id, toSlot: 'A', fromOutcome: 'loser' });
    connections.push({ fromMatchId: wbRound0[i * 2 + 1].id, toMatchId: m.id, toSlot: 'B', fromOutcome: 'loser' });
  }
  nodes.push(...consolidation0);
  lbRound++;

  let lastRoundMatches = consolidation0;
  while (true) {
    const wbLosersRound = wb.nodes.filter((n) => n.bracket === 'winners' && n.round === dropInWbRound);
    const dropin = [];
    for (let i = 0; i < lbCount; i++) {
      const g = lbGrid(lbRound, i);
      const m = makeEmptyMatch('losers', lbRound, g.gridColumn, g.gridRowStart, g.gridRowSpan);
      dropin.push(m);
      connections.push({ fromMatchId: lastRoundMatches[i].id, toMatchId: m.id, toSlot: 'A' });
      connections.push({ fromMatchId: wbLosersRound[i].id, toMatchId: m.id, toSlot: 'B', fromOutcome: 'loser' }); // в нижнюю сетку уходит ПРОИГРАВШИЙ матча верхней
    }
    nodes.push(...dropin);
    lastRoundMatches = dropin;
    dropInWbRound++;
    lbRound++;
    if (lbCount === 1) break;
    lbCount /= 2;
    const consolidation = [];
    for (let i = 0; i < lbCount; i++) {
      const g = lbGrid(lbRound, i);
      const m = makeEmptyMatch('losers', lbRound, g.gridColumn, g.gridRowStart, g.gridRowSpan);
      consolidation.push(m);
      connections.push({ fromMatchId: dropin[i * 2].id, toMatchId: m.id, toSlot: 'A' });
      connections.push({ fromMatchId: dropin[i * 2 + 1].id, toMatchId: m.id, toSlot: 'B' });
    }
    nodes.push(...consolidation);
    lastRoundMatches = consolidation;
    lbRound++;
  }

  const lbFinal = lastRoundMatches[0];
  const grandFinal = makeEmptyMatch('grandfinal', 0, colOffset + lbRound + 2, 1, Math.pow(2, wb.totalRounds));
  connections.push({ fromMatchId: wb.finalMatchId, toMatchId: grandFinal.id, toSlot: 'A' });
  connections.push({ fromMatchId: lbFinal.id, toMatchId: grandFinal.id, toSlot: 'B' });
  nodes.push(grandFinal);
  // Матч-реванш гранд-финала (bracket reset): играется только если чемпион НИЖНЕЙ сетки обыграл чемпиона верхней
  // (у того это первое поражение) — иначе остаётся скрытым (dead:'void'); включением/выключением занимается syncGrandReset().
  const grandReset = makeEmptyMatch('grandreset', 1, colOffset + lbRound + 3, 1, Math.pow(2, wb.totalRounds));
  grandReset.dead = 'void';
  nodes.push(grandReset);

  return { nodes, connections, grandFinalId: grandFinal.id, enabled: true };
}

/**
 * Группа "все против всех" (2 колонки, крупные строки — по референсу) + два
 * ФИКСИРОВАННЫХ матча плей-офф, всегда создаваемых сразу: "матч за финал"
 * (2-е место vs 3-е место) и "финал" (1-е место vs победитель матча за
 * финал). Слоты плей-офф остаются пустыми, пока группа не будет полностью
 * сыграна — заполняются автоматически (см. maybeFillPlayoffSlots).
 */
/**
 * Переставляет список матчей кругового этапа так, чтобы одна и та же команда не встречалась в двух подряд идущих
 * матчах, насколько это вообще возможно математически (при 3 и при 4 командах это доказуемо недостижимо целиком —
 * см. тест /tmp/test_bracket_schedule.js: там 3 матча треугольника или 6 матчей K4 обязательно дают минимум 2
 * вынужденных повтора, сколько ни переставляй; уже от 5 команд обычно достижим ноль). Сам список пар (кто с кем
 * встречается) не меняет — только порядок.
 *
 * Внутри — жадный алгоритм с несколькими случайными попытками: на каждом шаге среди матчей, НЕ пересекающихся по
 * командам с только что поставленным, выбираем (среди равных по "давности неигранности" — со случайным сдвигом,
 * чтобы не залипать в одном и том же локальном тупике) того, чьи команды дольше всего не играли — это ещё и
 * равномерно распределяет матчи каждой команды по расписанию, а не только развязывает соседние. Одного прохода
 * не всегда достаточно, чтобы найти математически лучший результат (жадный выбор может завести в вынужденный
 * тупик, которого было можно избежать чуть раньше) — поэтому пробуем несколько раз со случайным порядком и
 * оставляем попытку с наименьшим числом подряд идущих повторов.
 */
function attemptSchedule(pairs, rng) {
  const remaining = pairs.slice();
  const ordered = [];
  const lastPlayedAt = new Map();
  let lastPair = null;
  let repeats = 0;
  while (remaining.length > 0) {
    let candidates = lastPair
      ? remaining.filter(([a, b]) => a !== lastPair[0] && a !== lastPair[1] && b !== lastPair[0] && b !== lastPair[1])
      : remaining;
    const forcedRepeat = candidates.length === 0;
    if (forcedRepeat) candidates = remaining; // вариантов не осталось — берём что есть (вынужденный повтор)
    const idle = (teamId) => (lastPlayedAt.has(teamId) ? ordered.length - lastPlayedAt.get(teamId) : Infinity);
    let bestScore = -1;
    let bestPairs = [];
    candidates.forEach((pair) => {
      const score = Math.min(idle(pair[0]), idle(pair[1]));
      if (score > bestScore) { bestScore = score; bestPairs = [pair]; }
      else if (score === bestScore) bestPairs.push(pair);
    });
    const chosen = bestPairs[Math.floor(rng() * bestPairs.length)]; // случайный выбор среди равно хороших — чтобы попытки отличались друг от друга
    if (forcedRepeat) repeats++;
    const idx = remaining.indexOf(chosen);
    remaining.splice(idx, 1);
    ordered.push(chosen);
    lastPlayedAt.set(chosen[0], ordered.length - 1);
    lastPlayedAt.set(chosen[1], ordered.length - 1);
    lastPair = chosen;
  }
  return { ordered, repeats };
}

function orderMatchesAvoidingBackToBack(pairs) {
  if (pairs.length <= 1) return pairs.slice();
  // Простой детерминированный ГПСЧ (мультипликативный конгруэнтный) — без него результат генерации был бы каждый
  // раз разным при одинаковом составе команд, что неожиданно и неудобно (нельзя было бы воспроизвести расписание).
  let seed = pairs.length * 2654435761 + 1;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ATTEMPTS = 60; // с запасом — на 32 командах (496 матчей) это доля секунды, а находит математический оптимум практически всегда
  let best = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const attempt = attemptSchedule(pairs, rng);
    if (!best || attempt.repeats < best.repeats) best = attempt;
    if (best.repeats === 0) break; // лучше уже не будет
  }
  return best.ordered;
}

function buildRoundRobin(teamCount) {
  const teams = makePlaceholderTeams(teamCount);
  const pairs = [];
  for (let a = 0; a < teamCount; a++) {
    for (let b = a + 1; b < teamCount; b++) pairs.push([teams[a].id, teams[b].id]);
  }
  const orderedPairs = orderMatchesAvoidingBackToBack(pairs);
  const nodes = [];
  const COLUMNS = 2;
  orderedPairs.forEach((pair, i) => {
    const col = (i % COLUMNS) + 1;
    const row = Math.floor(i / COLUMNS) + 1;
    const m = makeEmptyMatch('roundrobin', 0, col, row, 1);
    m.teamAId = pair[0];
    m.teamBId = pair[1];
    m.originalTeamAId = m.teamAId;
    m.originalTeamBId = m.teamBId;
    nodes.push(m);
  });
  const matchForFinal = makeEmptyMatch('playoff', 0, 1, 1, 1);
  matchForFinal.playoffSlot = 'match_for_final';
  const final = makeEmptyMatch('playoff', 1, 1, 2, 1);
  final.playoffSlot = 'final';
  nodes.push(matchForFinal, final);
  const connections = [{ fromMatchId: matchForFinal.id, toMatchId: final.id, toSlot: 'B' }];
  return { teams, nodes, connections };
}

/** Автоматически проводит команду дальше, если её соперник по матчу — BYE (пустой слот навсегда, а не "пока не пришёл победитель"). Такое возможно только в раунде 0 сетки на выбывание — там пустой слот всегда означает BYE по построению. Рекурсивно — на случай цепочки byes при небольшом числе команд. */
function resolveByes() {
  if (data.mode === 'double') { resolveByesDouble(); return; }
  let changed = true;
  while (changed) {
    changed = false;
    data.nodes.forEach((m) => {
      if (m.kind !== 'match' || m.winnerId) return;
      const hasA = !!m.teamAId, hasB = !!m.teamBId;
      if (m.round === 0 && m.bracket === 'winners' && hasA !== hasB) {
        applyMatchResult(m.id, hasA ? m.teamAId : m.teamBId, true);
        changed = true;
      }
    });
  }
}

function generateBracket(mode, teamCount) {
  const sizeSettings = data ? data.sizeSettings : { ...SIZE_DEFAULTS };
  const colorSettings = data ? data.colorSettings : { ...COLOR_DEFAULTS };
  let panelLayout = data ? data.panelLayout : JSON.parse(JSON.stringify(mode === 'double' ? PANEL_LAYOUT_DEFAULTS_DE : PANEL_LAYOUT_DEFAULTS));
  let groupLabel = (data && data.groupLabel) || RR_GROUP_LABEL;
  const matchesTitle = (data && data.matchesTitle) || 'Матчи'; // сохраняется между регенерациями, как и groupLabel выше
  const finalFormat = (data && FINAL_FORMATS.includes(data.finalFormat)) ? data.finalFormat : 'bo1';
  // Раскладка панелей у двух семейств формата (Double Elimination / остальные) раздельная: уходя из семейства, запоминаем его
  // раскладку в layoutStash, входя — достаём запомненную (или дефолтную). Подпись над сеткой при смене формата меняется
  // только если пользователь не писал свою (стоит стандартная подпись прежнего формата).
  const wasDouble = !!(data && data.mode === 'double');
  const willBeDouble = mode === 'double';
  const layoutStash = (data && data.layoutStash) ? { ...data.layoutStash } : {};
  if (data) layoutStash[wasDouble ? 'double' : 'other'] = JSON.parse(JSON.stringify(data.panelLayout));
  if (wasDouble !== willBeDouble) {
    panelLayout = layoutStash[willBeDouble ? 'double' : 'other'] || JSON.parse(JSON.stringify(willBeDouble ? PANEL_LAYOUT_DEFAULTS_DE : PANEL_LAYOUT_DEFAULTS));
    if (willBeDouble && groupLabel === RR_GROUP_LABEL) groupLabel = DE_GROUP_LABEL;
    if (!willBeDouble && groupLabel === DE_GROUP_LABEL) groupLabel = RR_GROUP_LABEL;
  }
  let count = Math.max(2, Math.min(32, Math.round(Number(teamCount) || 2)));

  if (mode === 'roundrobin') {
    // Плей-офф-структура "матч за финал + финал" осмысленна только от 3
    // команд (нужны 1-е/2-е/3-е места) — при меньшем числе поднимаем до 3.
    if (count < 3) count = 3;
    const { teams, nodes, connections } = buildRoundRobin(count);
    data = { mode, teamCount: count, teams, nodes, connections, sizeSettings, colorSettings, panelLayout, layoutStash, groupLabel, matchesTitle, finalFormat };
  } else if (mode === 'double') {
    count = Math.max(DOUBLE_MIN_TEAMS, Math.min(DOUBLE_MAX_TEAMS, count));
    const wb = buildSingleElim(count, 0);
    const lb = buildLosersAndGrandFinal(wb, 0);
    data = { mode, teamCount: count, teams: wb.teams, nodes: [...wb.nodes, ...lb.nodes], connections: [...wb.connections, ...lb.connections], sizeSettings, colorSettings, panelLayout, layoutStash, groupLabel, matchesTitle, finalFormat };
  } else {
    const wb = buildSingleElim(count, 0);
    data = { mode: 'single', teamCount: count, teams: wb.teams, nodes: wb.nodes, connections: wb.connections, sizeSettings, colorSettings, panelLayout, layoutStash, groupLabel, matchesTitle, finalFormat };
  }
  save();
  resolveByes();
  save();
  return data;
}

// ---------- Матчи: результат, счёт, слоты, перестановка ----------

// ---------- Double Elimination: BYE-матчи, реванш гранд-финала, сброс результата ----------

/** Откуда в матч приходит команда в слот slot ('A'/'B') — связь-источник или null (тогда слот заполнен напрямую при посеве). */
function feederOf(matchId, slot) {
  return data.connections.find((c) => c.toMatchId === matchId && c.toSlot === slot) || null;
}

/**
 * Пересчитывает метки dead у ВСЕХ матчей Double Elimination с нуля и сам проводит дальше команды, чей соперник так и не
 * появится. Слот «мёртв», если в него никогда не придёт команда: в первом раунде верхней сетки это пустой слот посева
 * (BYE), дальше — слот, источник которого НЕ может его заполнить: матч-источник void (вообще не будет) либо, для связи
 * «проигравший», матч-BYE (там никто не проигрывает). Оба слота мертвы → матч void; один → матч-BYE (оставшаяся
 * команда проходит дальше без игры, и именно поэтому из такого матча никто не падает вниз). Цикл — до установившегося
 * состояния: цепочка BYE при 5-7 командах тянется через несколько матчей.
 */
function resolveByesDouble() {
  const matches = data.nodes.filter((n) => n.kind === 'match' && n.bracket !== 'grandreset');
  matches.forEach((m) => { m.dead = null; });
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    matches.forEach((m) => {
      const slotDead = (slot) => {
        const teamId = slot === 'A' ? m.teamAId : m.teamBId;
        if (teamId) return false;
        const f = feederOf(m.id, slot);
        if (!f) return m.bracket === 'winners' && m.round === 0; // первый раунд верхней: пустой слот = BYE
        const src = data.nodes.find((n) => n.id === f.fromMatchId);
        if (!src) return true;
        if (src.dead === 'void') return true;
        return f.fromOutcome === 'loser' && src.dead === 'bye';
      };
      const dA = slotDead('A'), dB = slotDead('B');
      let dead = null;
      if (dA && dB) dead = 'void'; else if (dA || dB) dead = 'bye';
      if (dead !== m.dead) { m.dead = dead; changed = true; }
      if (dead === 'bye' && !m.winnerId) {
        const live = dA ? m.teamBId : m.teamAId;
        if (live) { applyMatchResult(m.id, live, true); changed = true; }
      }
    });
  }
}

/** Включает/выключает матч-реванш гранд-финала. Реванш нужен, если гранд-финал выиграл чемпион НИЖНЕЙ сетки (слот B) — у чемпиона верхней это было первое поражение. */
function syncGrandReset() {
  const gf = data.nodes.find((n) => n.bracket === 'grandfinal');
  const gr = data.nodes.find((n) => n.bracket === 'grandreset');
  if (!gf || !gr) return;
  const need = !!gf.winnerId && gf.winnerId === gf.teamBId;
  if (need) {
    if (gr.dead || gr.teamAId !== gf.teamAId || gr.teamBId !== gf.teamBId) {
      gr.teamAId = gf.teamAId; gr.teamBId = gf.teamBId;
      gr.winnerId = null; gr.loserId = null; gr.scoreA = null; gr.scoreB = null;
    }
    gr.dead = null;
  } else {
    gr.teamAId = null; gr.teamBId = null; gr.winnerId = null; gr.loserId = null; gr.scoreA = null; gr.scoreB = null;
    gr.dead = 'void';
  }
}

/** Убирает результат матча и всё, что от него зависело дальше (команды в следующих матчах и их результаты). keepOwnSlots — не трогать сами слоты матча (для переназначения победителя). */
function clearMatchAndDownstream(matchId, keepOwnSlots) {
  const m = data.nodes.find((n) => n.id === matchId && n.kind === 'match');
  if (!m) return;
  const had = !!m.winnerId;
  m.winnerId = null; m.loserId = null; m.scoreA = null; m.scoreB = null;
  if (!had && keepOwnSlots) return;
  data.connections.filter((c) => c.fromMatchId === matchId).forEach((c) => {
    const target = data.nodes.find((n) => n.id === c.toMatchId);
    if (!target) return;
    if (c.toSlot === 'A') target.teamAId = null; else target.teamBId = null;
    clearMatchAndDownstream(target.id, false);
  });
}

/** «Отменить результат» матча Double Elimination: сам результат и всё, что из него вытекало. Для матча-BYE и для матча без результата ничего не делает. */
function resetMatchResult(matchId) {
  if (data.mode !== 'double') return data;
  const m = data.nodes.find((n) => n.id === matchId && n.kind === 'match');
  if (!m || m.dead || !m.winnerId) return data;
  clearMatchAndDownstream(matchId, true);
  syncGrandReset();
  resolveByesDouble();
  save();
  return data;
}

function applyMatchResult(matchId, winnerTeamId, isAutoBye) {
  const match = data.nodes.find((n) => n.id === matchId && n.kind === 'match');
  if (!match) return;
  if (winnerTeamId !== match.teamAId && winnerTeamId !== match.teamBId) return;
  match.winnerId = winnerTeamId;
  match.loserId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
  if (!isAutoBye) {
    match.scoreA = winnerTeamId === match.teamAId ? 1 : 0;
    match.scoreB = winnerTeamId === match.teamBId ? 1 : 0;
  }
  data.connections.filter((c) => c.fromMatchId === matchId).forEach((c) => {
    const target = data.nodes.find((n) => n.id === c.toMatchId);
    if (!target) return;
    const movedTeamId = c.fromOutcome === 'loser' ? match.loserId : winnerTeamId; // у связей нижней сетки дальше идёт проигравший
    if (!movedTeamId) return; // матч-BYE: проигравшего нет, слот остаётся пустым
    if (c.toSlot === 'A') target.teamAId = movedTeamId; else target.teamBId = movedTeamId;
  });
}

function setMatchResult(matchId, winnerTeamId) {
  if (data.mode === 'double') {
    const m = data.nodes.find((n) => n.id === matchId && n.kind === 'match');
    if (!m || !m.teamAId || !m.teamBId || m.dead) return data; // играть можно только матч, где уже есть оба соперника
    if (m.winnerId && m.winnerId !== winnerTeamId) clearMatchAndDownstream(matchId, true); // переназначили победителя — всё, что от него зависело, сбрасываем
  }
  applyMatchResult(matchId, winnerTeamId, false);
  if (data.mode === 'double') syncGrandReset();
  resolveByes();
  maybeFillPlayoffSlots();
  save();
  return data;
}

function setMatchScore(matchId, scoreA, scoreB) {
  const match = data.nodes.find((n) => n.id === matchId && n.kind === 'match');
  if (!match) return data;
  const a = Number(scoreA), b = Number(scoreB);
  match.scoreA = Number.isFinite(a) ? Math.max(0, Math.round(a)) : match.scoreA;
  match.scoreB = Number.isFinite(b) ? Math.max(0, Math.round(b)) : match.scoreB;
  save();
  return data;
}

const FINAL_BO3_WINS_NEEDED = 2; // до скольких побед в сериях играется финал при формате BO3 (первый до 2 из 3)

/** Матч "Финал" кругового этапа: BO1 (по умолчанию — одна игра, победитель сразу решает матч, как и раньше) или
 * BO3 (до 2 побед). Переключение формата сбрасывает СЧЁТ и результат самого финала (если уже начат/сыгран под
 * старым форматом) — иначе, например, счёт "1-0" под BO3 при переключении на BO1 выглядел бы как законченный
 * матч. Состав участников финала (кто в него вышел) при этом не трогается. */
function setFinalFormat(format) {
  if (!FINAL_FORMATS.includes(format)) return data;
  data.finalFormat = format;
  const final = data.nodes.find((n) => n.playoffSlot === 'final');
  if (final) { final.scoreA = null; final.scoreB = null; final.winnerId = null; final.loserId = null; }
  save();
  return data;
}

/** BO3-финал: +1 победа в серии команде teamId. При достижении FINAL_BO3_WINS_NEEDED побед матч завершается тем же
 * путём, что и обычный (applyMatchResult) — так итог финала одинаково подхватывается остальным кодом (дальше
 * связей у финала нет, но это не отличает его от любого другого завершённого матча). Ничего не делает для
 * BO1-финала или уже завершённого матча — так UI можно не отдельно проверять формат/состояние на каждый клик. */
function addFinalGameWin(teamId) {
  const final = data.nodes.find((n) => n.playoffSlot === 'final');
  if (!final || data.finalFormat !== 'bo3' || final.winnerId) return data;
  if (teamId !== final.teamAId && teamId !== final.teamBId) return data;
  if (teamId === final.teamAId) final.scoreA = (final.scoreA || 0) + 1; else final.scoreB = (final.scoreB || 0) + 1;
  if (final.scoreA >= FINAL_BO3_WINS_NEEDED || final.scoreB >= FINAL_BO3_WINS_NEEDED) {
    const winnerId = final.scoreA >= FINAL_BO3_WINS_NEEDED ? final.teamAId : final.teamBId;
    applyMatchResult(final.id, winnerId, true); // isAutoBye=true — не даём applyMatchResult затереть уже накопленный счёт серии на "1-0"
  }
  save();
  return data;
}

/** Сбрасывает счёт и результат BO3-финала (например, если промахнулись мимо той команды при клике) — состав
 * участников не трогает. Для BO1 не нужна — там всего один клик, ошибиться-и-сразу-переделать проще через
 * повторный клик по другой команде (setMatchResult и так это позволяет, пока матч не "закрыт" дальше по сетке). */
function resetFinalGames() {
  const final = data.nodes.find((n) => n.playoffSlot === 'final');
  if (final) { final.scoreA = null; final.scoreB = null; final.winnerId = null; final.loserId = null; }
  save();
  return data;
}

/** Заполняет слот команды в матче (переименование/лого) — само присутствие команды в слоте не трогает. */
function fillSlot(matchId, slot, name, logoUrl) {
  const match = data.nodes.find((n) => n.id === matchId && n.kind === 'match');
  if (!match || (slot !== 'A' && slot !== 'B')) return data;
  const teamId = slot === 'A' ? match.teamAId : match.teamBId;
  if (teamId) {
    const team = data.teams.find((t) => t.id === teamId);
    if (team) {
      if (typeof name === 'string' && name.trim()) team.name = name.trim();
      if (typeof logoUrl === 'string' || logoUrl === null) team.logoUrl = logoUrl;
    }
  }
  save();
  return data;
}

/** Переименование/смена лого команды напрямую по её id — используется списком команд в редакторе (brackets-viewer не даёт кликать по слоту на самой сетке). */
function updateTeamInfo(teamId, name, logoUrl) {
  const team = data.teams.find((t) => t.id === teamId);
  if (!team) return data;
  if (typeof name === 'string' && name.trim()) team.name = name.trim();
  if (typeof logoUrl === 'string' || logoUrl === null) team.logoUrl = logoUrl;
  save();
  return data;
}

/**
 * Меняет местами команды в двух слотах (drag-and-drop) — если оба слота
 * заняты, команды буквально меняются местами; если один пуст — команда
 * просто переезжает. Чтобы не оставить "победителя", которого физически
 * больше нет в матче, оба затронутых матча при перестановке сбрасывают
 * winner/loser/score — честно предупреждаем об этом в интерфейсе.
 */
function swapSlots(matchIdA, slotA, matchIdB, slotB) {
  const mA = data.nodes.find((n) => n.id === matchIdA && n.kind === 'match');
  const mB = data.nodes.find((n) => n.id === matchIdB && n.kind === 'match');
  if (!mA || !mB || (slotA !== 'A' && slotA !== 'B') || (slotB !== 'A' && slotB !== 'B')) return data;
  if (mA.id === mB.id && slotA === slotB) return data;

  const getTeam = (m, s) => (s === 'A' ? m.teamAId : m.teamBId);
  const setTeam = (m, s, v) => { if (s === 'A') m.teamAId = v; else m.teamBId = v; };

  const teamFromA = getTeam(mA, slotA);
  const teamFromB = getTeam(mB, slotB);
  setTeam(mA, slotA, teamFromB);
  setTeam(mB, slotB, teamFromA);

  [mA, mB].forEach((m) => { m.winnerId = null; m.loserId = null; m.scoreA = null; m.scoreB = null; });
  save();
  return data;
}

/** "Сбросить расположение" — возвращает КАЖДЫЙ матч к исходной паре команд, с которой сетка была сгенерирована (снимок originalTeamAId/B), полностью очищает результаты и заново разрешает byes. */
function resetToOriginalSeeding() {
  data.nodes.forEach((m) => {
    if (m.kind !== 'match') return;
    if (m.originalTeamAId != null || m.originalTeamBId != null) {
      m.teamAId = m.originalTeamAId;
      m.teamBId = m.originalTeamBId;
    }
    m.winnerId = null; m.loserId = null; m.scoreA = null; m.scoreB = null;
  });
  // Матчи, которые изначально заполнялись победителями предыдущих этапов
  // (не имеют originalTeamAId/B — это была ПУСТОТА в момент генерации),
  // тоже нужно опустошить — иначе там останутся команды от прошлого прогона.
  data.nodes.forEach((m) => {
    if (m.kind === 'match' && m.originalTeamAId == null && m.originalTeamBId == null) {
      m.teamAId = null; m.teamBId = null;
    }
  });
  if (data.mode === 'double') syncGrandReset();
  resolveByes();
  save();
  return data;
}

// ---------- Round robin: таблица очков + автофинал топ-2 ----------

// Очки за матч кругового этапа: победа — 3, поражение — 1 (по явному ТЗ; не 0 — проигравший тоже получает очко
// за участие). Чтобы это можно было менять не трогая код, вынесено в константы, а не зашито в цикл ниже.
const ROUND_ROBIN_POINTS = { win: 3, loss: 1 };

function computeRoundRobinStandings() {
  const stats = new Map();
  data.teams.forEach((t) => stats.set(t.id, { teamId: t.id, wins: 0, losses: 0, points: 0 }));
  data.nodes.forEach((n) => {
    if (n.bracket !== 'roundrobin' || !n.winnerId) return;
    if (stats.has(n.winnerId)) { stats.get(n.winnerId).wins += 1; stats.get(n.winnerId).points += ROUND_ROBIN_POINTS.win; }
    if (stats.has(n.loserId)) { stats.get(n.loserId).losses += 1; stats.get(n.loserId).points += ROUND_ROBIN_POINTS.loss; }
  });
  // Сортировка: сначала по очкам (больше — выше), при равенстве очков — по разнице побед (больше побед — выше).
  return Array.from(stats.values()).sort((a, b) => (b.points - a.points) || (b.wins - a.wins));
}

/** Как только ВСЕ матчи группы разрешены — один раз заполняет оба фиксированных матча плей-офф по итоговым местам (1-е/2-е/3-е). "Финал" при этом получает только команду 1-го места сразу — второй его слот (победитель "матча за финал") придёт позже сам, через connections, когда "матч за финал" будет разрешён. */
function maybeFillPlayoffSlots() {
  if (data.mode !== 'roundrobin') return;
  const groupMatches = data.nodes.filter((n) => n.bracket === 'roundrobin');
  if (!groupMatches.length || groupMatches.some((n) => !n.winnerId)) return;
  const matchForFinal = data.nodes.find((n) => n.playoffSlot === 'match_for_final');
  const final = data.nodes.find((n) => n.playoffSlot === 'final');
  if (!matchForFinal || !final || matchForFinal.teamAId) return; // уже заполнено — не переигрываем задним числом
  const standings = computeRoundRobinStandings();
  if (standings.length < 3) return;
  matchForFinal.teamAId = standings[1].teamId; // 2-е место
  matchForFinal.teamBId = standings[2].teamId; // 3-е место
  final.teamAId = standings[0].teamId; // 1-е место — сразу; соперника (победителя "матча за финал") подставит connections
}

// ---------- Загрузка/сохранение ----------

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return defaultData();
  const sizeSettings = normalizeSizeSettings(raw.sizeSettings);
  const colorSettings = normalizeColorSettings(raw.colorSettings);
  const panelLayout = sanitizePanelLayout(raw.panelLayout, raw.mode === 'double' ? PANEL_LAYOUT_DEFAULTS_DE : PANEL_LAYOUT_DEFAULTS);
  const teams = Array.isArray(raw.teams) ? raw.teams.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string').map((t) => ({ id: t.id, name: t.name, logoUrl: typeof t.logoUrl === 'string' ? t.logoUrl : null })) : [];
  const teamIds = new Set(teams.map((t) => t.id));
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.filter((n) => n && typeof n.id === 'string' && n.kind === 'match').map((n) => ({
    id: n.id, kind: 'match', bracket: n.bracket || 'winners', round: Number(n.round) || 0,
    gridColumn: Number(n.gridColumn) || 1, gridRowStart: Number(n.gridRowStart) || 1, gridRowSpan: Number(n.gridRowSpan) || 1,
    playoffSlot: (n.playoffSlot === 'match_for_final' || n.playoffSlot === 'final') ? n.playoffSlot : null,
    teamAId: teamIds.has(n.teamAId) ? n.teamAId : null,
    teamBId: teamIds.has(n.teamBId) ? n.teamBId : null,
    originalTeamAId: teamIds.has(n.originalTeamAId) ? n.originalTeamAId : null,
    originalTeamBId: teamIds.has(n.originalTeamBId) ? n.originalTeamBId : null,
    winnerId: teamIds.has(n.winnerId) ? n.winnerId : null,
    loserId: teamIds.has(n.loserId) ? n.loserId : null,
    scoreA: Number.isFinite(Number(n.scoreA)) ? Math.max(0, Math.round(Number(n.scoreA))) : null,
    scoreB: Number.isFinite(Number(n.scoreB)) ? Math.max(0, Math.round(Number(n.scoreB))) : null,
    dead: (n.dead === 'bye' || n.dead === 'void') ? n.dead : null,
  })) : [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const connections = Array.isArray(raw.connections) ? raw.connections.filter((c) => c && nodeIds.has(c.fromMatchId) && nodeIds.has(c.toMatchId) && (c.toSlot === 'A' || c.toSlot === 'B')).map((c) => ({ fromMatchId: c.fromMatchId, toMatchId: c.toMatchId, toSlot: c.toSlot, ...(c.fromOutcome === 'loser' ? { fromOutcome: 'loser' } : {}) })) : [];
  const groupLabel = typeof raw.groupLabel === 'string' && raw.groupLabel.trim() ? raw.groupLabel.trim() : 'ГРУППОВОЙ ЭТАП • BO1';
  const matchesTitle = typeof raw.matchesTitle === 'string' && raw.matchesTitle.trim() ? raw.matchesTitle.trim() : 'Матчи';
  const finalFormat = FINAL_FORMATS.includes(raw.finalFormat) ? raw.finalFormat : 'bo1';
  const layoutStash = {};
  if (raw.layoutStash && typeof raw.layoutStash === 'object') {
    if (raw.layoutStash.double) layoutStash.double = sanitizePanelLayout(raw.layoutStash.double, null, PANEL_LAYOUT_DEFAULTS_DE);
    if (raw.layoutStash.other) layoutStash.other = sanitizePanelLayout(raw.layoutStash.other, null, PANEL_LAYOUT_DEFAULTS);
  }
  return { mode: MODES.includes(raw.mode) ? raw.mode : 'single', teamCount: Number(raw.teamCount) || teams.length, teams, nodes, connections, sizeSettings, colorSettings, panelLayout, layoutStash, groupLabel, matchesTitle, finalFormat };
}

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) { data = normalize(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))); return; }
  } catch (e) {
    console.warn('[Турнирная сетка] Не удалось прочитать bracket_data.json, начинаем с пустой сетки:', e.message);
  }
  data = defaultData();
  save();
}

function save() {
  try { fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2)); } catch (e) {
    console.warn('[Турнирная сетка] Не удалось сохранить bracket_data.json:', e.message);
  }
}

function loadSavedTeams() {
  try {
    if (fs.existsSync(BRACKET_TEAMS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(BRACKET_TEAMS_FILE, 'utf8'));
      if (Array.isArray(raw)) { savedTeams = raw.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string'); return; }
    }
  } catch (e) {
    console.warn('[Турнирная сетка] Не удалось прочитать bracket_teams.json:', e.message);
  }
  savedTeams = [];
  saveSavedTeams();
}

function saveSavedTeams() {
  try { fs.writeFileSync(BRACKET_TEAMS_FILE, JSON.stringify(savedTeams, null, 2)); } catch (e) {
    console.warn('[Турнирная сетка] Не удалось сохранить bracket_teams.json:', e.message);
  }
}

function init() {
  ensureDirs();
  loadSizeDefaults();
  loadPanelLayoutDefaults();
  loadPanelLayoutDefaultsDE();
  load();
  loadSavedTeams();
}

function get() { return data; }

function updateSizeSettings(fields) {
  data.sizeSettings = normalizeSizeSettings({ ...data.sizeSettings, ...(fields || {}) });
  save();
  return data;
}

function updateColorSettings(fields) {
  data.colorSettings = normalizeColorSettings({ ...data.colorSettings, ...(fields || {}) });
  save();
  return data;
}

/** Редактируемая подпись над сеткой ("ГРУППОВОЙ ЭТАП • BO1" и т.п.). */
function setGroupLabel(text) {
  data.groupLabel = String(text || '').trim() || 'ГРУППОВОЙ ЭТАП • BO1';
  save();
  return data;
}

/** Текст заголовка панели "Матчи" (по умолчанию "Матчи") — отдельно от groupLabel (подпись рядом, "ГРУППОВОЙ ЭТАП • BO1"). */
function setMatchesTitle(text) {
  data.matchesTitle = String(text || '').trim() || 'Матчи';
  save();
  return data;
}

function clearBracket() {
  data = defaultData();
  save();
  return data;
}

function slugify(name) {
  return String(name || 'bracket').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'bracket';
}

function listSavedBrackets() {
  ensureDirs();
  return fs.readdirSync(SAVED_BRACKETS_DIR).filter((f) => f.endsWith('.json')).map((f) => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(SAVED_BRACKETS_DIR, f), 'utf8'));
      return { id: f.replace(/\.json$/, ''), name: raw.name || f, savedAt: raw.savedAt || 0 };
    } catch (e) { return null; }
  }).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
}

function saveBracketAs(name) {
  ensureDirs();
  const id = `${slugify(name)}-${Date.now()}`;
  const payload = { name: String(name || 'Без названия').trim() || 'Без названия', savedAt: Date.now(), bracket: data };
  fs.writeFileSync(path.join(SAVED_BRACKETS_DIR, `${id}.json`), JSON.stringify(payload, null, 2));
  return { id, name: payload.name };
}

function loadSavedBracket(id) {
  const filePath = path.join(SAVED_BRACKETS_DIR, `${path.basename(id)}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data = normalize(raw.bracket);
  save();
  return data;
}

function deleteSavedBracket(id) {
  try { fs.unlinkSync(path.join(SAVED_BRACKETS_DIR, `${path.basename(id)}.json`)); } catch (e) { /* не критично */ }
  return listSavedBrackets();
}

function listSavedTeams() { return savedTeams; }

function saveTeamToRoster(name, logoUrl) {
  const team = { id: generateId('roster'), name: String(name || 'Без названия').trim() || 'Без названия', logoUrl: logoUrl || null, createdAt: Date.now() };
  savedTeams.push(team);
  saveSavedTeams();
  return team;
}

function deleteSavedTeam(id) {
  savedTeams = savedTeams.filter((t) => t.id !== id);
  saveSavedTeams();
  return savedTeams;
}

module.exports = {
  init, get, generateBracket, setGroupLabel, setMatchesTitle, setMatchResult, setMatchScore, fillSlot, updateTeamInfo, swapSlots, resetToOriginalSeeding,
  computeRoundRobinStandings, updateSizeSettings, updateColorSettings, saveSizeSettingsAsDefault, clearBracket,
  updatePanelLayout, savePanelLayoutAsDefault,
  setFinalFormat, addFinalGameWin, resetFinalGames, resetMatchResult,
  DOUBLE_MIN_TEAMS, DOUBLE_MAX_TEAMS,
  listSavedBrackets, saveBracketAs, loadSavedBracket, deleteSavedBracket,
  listSavedTeams, saveTeamToRoster, deleteSavedTeam,
  MODES, FINAL_FORMATS, SIZE_LIMITS, PANEL_DEFS, LOGOS_DIR, FILE_PATH,
};
