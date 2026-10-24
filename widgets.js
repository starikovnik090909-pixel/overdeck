// widgets.js
// Единственный источник правды о виджетах оверлея: список + дефолтная
// раскладка. Чтобы добавить новый виджет — одна запись сюда плюс элемент
// с data-widget="id" в overlay.html. Ни сервер, ни админка, ни оверлей
// больше нигде список виджетов не хардкодят.

const WIDGET_DEFS = [
  { id: 'activity', label: 'Активность зрителей' },
  { id: 'timeline', label: 'Таймлайн стрима' },
  { id: 'emotebox', label: 'Топ эмодзи' },
  { id: 'wordcloud', label: 'Слова эфира' },
  { id: 'donortop', label: 'Топ донатеров' },
  { id: 'eventfeed', label: 'События' },
  { id: 'chat', label: 'Чат' },
];

// Координаты — на сцене 1920x1080.
const DEFAULT_LAYOUT = {
  activity:   { x: 40,   y: 40,  w: 460,  h: 1000, enabled: true },
  timeline:   { x: 524,  y: 40,  w: 1356, h: 494,  enabled: true },
  emotebox:   { x: 524,  y: 558, w: 542,  h: 482,  enabled: true },
  wordcloud:  { x: 1090, y: 558, w: 790,  h: 482,  enabled: true },
  donortop:   { x: 1520, y: 40,  w: 360,  h: 494,  enabled: true },
  // Выезжает по таймеру поверх остальных, поэтому перекрытие с другими блоками допустимо; пока карточек нет, на сцене ничего не показывается.
  // По умолчанию выключен: стоит на месте слов эфира; включается и двигается в админке.
  eventfeed:  { x: 1520, y: 558, w: 360,  h: 482,  enabled: false },
  // Чат на сцене: тот же чат, что и отдельный источник chat-widget.html; настройки — только во вкладке «Чат». По умолчанию выключен.
  chat:       { x: 1520, y: 40,  w: 360,  h: 1000, enabled: false },
};

function getDefaultLayout() {
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
}

/** Числовое значение в границах [min, max], с откатом на fallback, если не число. */
function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Приводит присланный layout к валидному виду: только известные виджеты
 * (из WIDGET_DEFS), числа в разумных границах, отсутствующие поля берутся
 * из base (текущего сохранённого layout) или из дефолта.
 */
function sanitizeLayout(rawLayout, base) {
  const result = {};
  WIDGET_DEFS.forEach((w) => {
    const raw = (rawLayout && rawLayout[w.id]) || {};
    const baseRect = (base && base[w.id]) || DEFAULT_LAYOUT[w.id];
    result[w.id] = {
      x: clampNum(raw.x, 0, 1920, baseRect.x),
      y: clampNum(raw.y, 0, 1080, baseRect.y),
      w: clampNum(raw.w, 40, 1920, baseRect.w),
      h: clampNum(raw.h, 40, 1080, baseRect.h),
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : baseRect.enabled,
    };
  });
  return result;
}

/** Дополняет существующий layout недостающими виджетами (для будущих новых виджетов). */
function fillMissingWidgets(layout) {
  let changed = false;
  const result = { ...layout };
  WIDGET_DEFS.forEach((w) => {
    if (!result[w.id]) {
      result[w.id] = { ...DEFAULT_LAYOUT[w.id] };
      changed = true;
    }
  });
  return { layout: result, changed };
}

// ---------- Настройки СОДЕРЖИМОГО виджетов (не путать с layout — это про то,
// ЧТО внутри блока, а не где сам блок стоит). Один реестр на все виджеты:
// чтобы дать новому виджету свои настройки, достаточно добавить сюда запись
// с его id — админка построит поля автоматически по схеме, ничего не хардкодя. ----------

const WIDGET_SETTINGS_SCHEMA = {
  activity: {
    avatarSize: { type: 'range', group: 'size', label: 'Размер аватарок', unit: 'px', min: 24, max: 72, step: 2, default: 44 },
    nameSize: { type: 'range', group: 'size', label: 'Размер ника', unit: 'px', min: 10, max: 24, step: 1, default: 14 },
    barThickness: { type: 'range', group: 'size', label: 'Толщина полоски активности', unit: 'px', min: 2, max: 16, step: 1, default: 6 },
    // Локальные цвета топ-1 (раньше были частью общей темы — "Золотой топ-1/топ-2").
    goldColor1: { type: 'color', label: 'Золотой топ-1 (градиент, начало)', default: '#FFD700' },
    goldColor2: { type: 'color', label: 'Золотой топ-1 (градиент, конец)', default: '#FFA500' },
  },
  timeline: {
    view: { type: 'select', label: 'Вид таймлайна', options: ['classic','wave','chronicle','pulse','equalizer','constellation','river'], default: 'classic' },
    // Тумблер общей палитры — управляет полями ниже, помеченными syncable: true.
    useGlobalPalette: { type: 'toggle', label: 'Использовать общую палитру', default: true },
    // syncable: true — при включённом тумблере эти 4 поля скрыты и берутся из
    // "Основных настроек" (фон панели, акцент, текст, прозрачность); при
    // выключенном — редактируются здесь же, локально.
    bgColor: { type: 'color', label: 'Цвет фона панели', default: '#141419', syncable: true },
    bgAlpha: { type: 'range', label: 'Прозрачность фона', unit: '%', min: 0, max: 100, step: 5, default: 55, syncable: true },
    lineColor: { type: 'color', label: 'Цвет линии активности', default: '#B14846', syncable: true },
    textColor: { type: 'color', label: 'Цвет текста / подписей', default: '#E0E0E0', syncable: true },
    // --- Цвета виджета Таймлайн — всегда локальные, своего аналога в общей теме нет (сворачиваемая группа) ---
    fillColor: { type: 'color', group: 'Цвета виджета Таймлайн', label: 'Цвет заливки под линией', default: '#B14846' },
    messageColor: { type: 'color', group: 'Цвета виджета Таймлайн', label: 'Точки: сообщения чата', default: '#9A9A9A' },
    pointsColor: { type: 'color', group: 'Цвета виджета Таймлайн', label: 'Точки: траты баллов канала', default: '#00D4FF' },
    subColor: { type: 'color', group: 'Цвета виджета Таймлайн', label: 'Маркеры: подписки / гифт-сабы', default: '#FFD700' },
    raidColor: { type: 'color', group: 'Цвета виджета Таймлайн', label: 'Маркеры: рейды', default: '#FF3B3B' },
    streakColor: { type: 'color', group: 'Цвета виджета Таймлайн', label: 'Маркеры: серии просмотров зрителей', default: '#A970FF' },
    categoryColor: { type: 'color', group: 'Цвета виджета Таймлайн', label: 'Маркеры: смена категории (тонкая линия между обложками)', default: '#00D4B8' },
    donationColor: { type: 'color', group: 'Цвета виджета Таймлайн', label: 'Маркеры: донаты (денежно-зелёная плашка с суммой в ₽)', default: '#4FAE5A' },
    // --- Веса событий (влияют на высоту линии активности) ---
    weightMessage: { type: 'range', group: 'Веса событий', label: 'Вес: сообщение чата', min: 0, max: 20, step: 1, default: 1 },
    weightPoints: { type: 'range', group: 'Веса событий', label: 'Вес: трата баллов канала', min: 0, max: 20, step: 1, default: 3 },
    weightSub: { type: 'range', group: 'Веса событий', label: 'Вес: подписка / гифт-саб', min: 0, max: 20, step: 1, default: 3 },
    weightRaid: { type: 'range', group: 'Веса событий', label: 'Вес: рейд', min: 0, max: 20, step: 1, default: 3 },
    weightStreak: { type: 'range', group: 'Веса событий', label: 'Вес: серия просмотров зрителя', min: 0, max: 20, step: 1, default: 2 },
    weightCategory: { type: 'range', group: 'Веса событий', label: 'Вес: смена категории', min: 0, max: 20, step: 1, default: 2 },
    weightDonation: { type: 'range', group: 'Веса событий', label: 'Вес: донат', min: 0, max: 20, step: 1, default: 4 },
    windowSec: { type: 'range', group: 'Веса событий', label: 'Окно сглаживания линии', unit: ' с', min: 10, max: 180, step: 10, default: 60 },
    // --- Кружки активности: свободно плавают вокруг линии на времени своего появления, живут ограниченное время ---
    activityLifetimeMin: { type: 'range', group: 'Кружки активности', label: 'Сколько минут кружок виден (в эфире и в повторе)', unit: ' мин', min: 1, max: 30, step: 1, default: 5 },
    activityFloatSpread: { type: 'range', group: 'Кружки активности', label: 'Как далеко плавают от линии', unit: 'px', min: 12, max: 90, step: 2, default: 36 },
    // --- Размеры плавающих элементов на линии ---
    avatarSize: { type: 'range', group: 'Размеры на линии', label: 'Размер аватарок (сообщения)', unit: 'px', min: 12, max: 48, step: 2, default: 26 },
    eventDotSize: { type: 'range', group: 'Размеры на линии', label: 'Размер точек активностей', unit: 'px', min: 4, max: 24, step: 1, default: 9 },
    categoryImageSize: { type: 'range', group: 'Размеры на линии', label: 'Размер картинки категории', unit: 'px', min: 20, max: 160, step: 5, default: 40 },
    // --- Фон из обложек категорий: на каждом отрезке стрима обложка повторяется, пока категория не сменится ---
    showCategoryBackground: { type: 'toggle', group: 'Фон из категорий', label: 'Обложки категорий на фоне таймлайна', default: true },
    categoryBgOpacity: { type: 'range', group: 'Фон из категорий', label: 'Яркость обложек на фоне', unit: '%', min: 10, max: 100, step: 5, default: 55 },
    // --- Часы стрима (правый верхний угол) ---
    showClockPlate: { type: 'toggle', group: 'Часы стрима', label: 'Тёмная плашка под часами (чч:мм:сс)', default: true },
    clockPlateOpacity: { type: 'range', group: 'Часы стрима', label: 'Прозрачность плашки часов', unit: '%', min: 0, max: 100, step: 5, default: 60 },
    // --- Доп. оформление (обычно выставляется темой, но можно и вручную) ---
    showCategoryThumbnails: { type: 'toggle', group: 'Доп. оформление', label: 'Полоса превью категорий сверху', default: false },
    showTimecodes: { type: 'toggle', group: 'Доп. оформление', label: 'Шкала времени под линией', default: false },
    useWaveGradient: { type: 'toggle', group: 'Доп. оформление', label: 'Градиент волны (2 цвета)', default: false },
    waveGradientStart: { type: 'color', group: 'Доп. оформление', label: 'Градиент волны — начало', default: '#B14846' },
    waveGradientEnd: { type: 'color', group: 'Доп. оформление', label: 'Градиент волны — конец', default: '#E07A3F' },
    useUnifiedDotColor: { type: 'toggle', group: 'Доп. оформление', label: 'Единый цвет точек активности', default: false },
    dotColor: { type: 'color', group: 'Доп. оформление', label: 'Цвет точек активности (единый)', default: '#FFFFFF' },
  },
  donortop: {
    // Без group — всегда видимо, наверху.
    switchIntervalSec: { type: 'range', label: 'Период переключения топов', unit: ' с', min: 3, max: 60, step: 1, default: 10 },
    // --- Внешний вид (сворачиваемая группа) ---
    circleSize: { type: 'range', group: 'Внешний вид', label: 'Размер кружков', unit: 'px', min: 24, max: 72, step: 2, default: 40 },
    // Цифра теперь лежит на ТЁМНОМ внутреннем кружке, поэтому прежний тёмный numberColor (#141419) стал бы нечитаемым. Ключ
    // переименован нарочно: у кого уже сохранён старый тёмный цвет, он просто игнорируется и цифра сразу становится светлой.
    rankNumberColor: { type: 'color', group: 'Внешний вид', label: 'Цвет цифры внутри кружка', default: '#FFFFFF' },
    innerCircleDarken: { type: 'range', group: 'Внешний вид', label: 'Затемнение внутреннего кружка (по сравнению с внешним)', unit: '%', min: 10, max: 80, step: 5, default: 45 },
    showDividers: { type: 'toggle', group: 'Внешний вид', label: 'Тонкие линии между местами (цвет основной темы)', default: true },
    // --- Мерцание топ-1: медленное золотое свечение, как у победителя в турнирной сетке (плавно разгорается и плавно гаснет) ---
    top1Glow: { type: 'toggle', group: 'Свечение топ-1', label: 'Медленно мерцающее свечение у первого места', default: true },
    top1GlowSpeedMs: { type: 'range', group: 'Свечение топ-1', label: 'Период мерцания (один цикл разгорания и затухания)', unit: ' мс', min: 1000, max: 6000, step: 100, default: 2800 },
    otherTextColor: { type: 'color', group: 'Внешний вид', label: 'Цвет ника/суммы (места 4+)', default: '#E0E0E0' },
    // --- Цвета мест (сворачиваемая группа) ---
    top1Color: { type: 'color', group: 'Цвета мест', label: 'Топ-1 (золото)', default: '#FFD700' },
    top2Color: { type: 'color', group: 'Цвета мест', label: 'Топ-2 (серебро)', default: '#C0C0C0' },
    top3Color: { type: 'color', group: 'Цвета мест', label: 'Топ-3 (бронза)', default: '#CD7F32' },
    defaultCircleColor: { type: 'color', group: 'Цвета мест', label: 'Обычный кружок (места 4+)', default: '#B14846' },
  },
  // События: карточка последнего события + вертикальная линия с предыдущими. Размеры и оформление подстраиваются под блок и стиль оверлея.
  eventfeed: {
    maxRows: { type: 'range', label: 'Сколько событий всего (с главной карточкой; при малой высоте блока — меньше)', min: 2, max: 10, step: 1, default: 5 },
    showFollow: { type: 'toggle', group: 'Какие события показывать', label: 'Новые фолловеры', default: true },
    showSub: { type: 'toggle', group: 'Какие события показывать', label: 'Подписки', default: true },
    showGift: { type: 'toggle', group: 'Какие события показывать', label: 'Подарочные подписки', default: true },
    showRaid: { type: 'toggle', group: 'Какие события показывать', label: 'Рейды', default: true },
    showDonation: { type: 'toggle', group: 'Какие события показывать', label: 'Донаты', default: true },
    showPoints: { type: 'toggle', group: 'Какие события показывать', label: 'Траты баллов канала', default: false },
    showStreak: { type: 'toggle', group: 'Какие события показывать', label: 'Серии просмотров зрителей', default: true },
    minDonation: { type: 'range', group: 'Какие события показывать', label: 'Донаты от (₽)', unit: ' ₽', min: 0, max: 5000, step: 50, default: 0 },
    showTime: { type: 'toggle', group: 'Внешний вид', label: 'Показывать «N мин назад»', default: true },
  },
  // Другие виджеты (emotebox, wordcloud) пока без собственных настроек —
  // добавляются сюда точно так же, когда понадобятся.
};

function isValidColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Валидирует одно значение поля по его описанию в схеме (число, цвет, тумблер или выбор из списка). */
function sanitizeFieldValue(raw, def, fallback) {
  if (def.type === 'color') {
    return isValidColor(raw) ? raw.toLowerCase() : fallback;
  }
  if (def.type === 'toggle') {
    return typeof raw === 'boolean' ? raw : fallback;
  }
  if (def.type === 'select') {
    return (def.options || []).includes(raw) ? raw : fallback;
  }
  return clampNum(raw, def.min, def.max, fallback);
}

function hasValidBase(baseWidget, key, def) {
  if (def.type === 'color') return typeof baseWidget[key] === 'string';
  if (def.type === 'toggle') return typeof baseWidget[key] === 'boolean';
  if (def.type === 'select') return (def.options || []).includes(baseWidget[key]);
  return typeof baseWidget[key] === 'number';
}

function getDefaultWidgetSettings() {
  const result = {};
  Object.entries(WIDGET_SETTINGS_SCHEMA).forEach(([id, fields]) => {
    result[id] = {};
    Object.entries(fields).forEach(([key, def]) => { result[id][key] = def.default; });
  });
  return result;
}

/** Приводит присланные настройки виджетов к валидному виду по схеме выше. */
function sanitizeWidgetSettings(rawSettings, base) {
  const result = {};
  Object.entries(WIDGET_SETTINGS_SCHEMA).forEach(([id, fields]) => {
    const raw = (rawSettings && rawSettings[id]) || {};
    const baseWidget = (base && base[id]) || {};
    result[id] = {};
    Object.entries(fields).forEach(([key, def]) => {
      const fallback = hasValidBase(baseWidget, key, def) ? baseWidget[key] : def.default;
      result[id][key] = sanitizeFieldValue(raw[key], def, fallback);
    });
  });
  return result;
}

/** Дополняет существующие настройки недостающими виджетами/полями (новые виджеты/поля в схеме). */
function fillMissingWidgetSettings(settings) {
  let changed = false;
  const result = { ...(settings || {}) };
  Object.entries(WIDGET_SETTINGS_SCHEMA).forEach(([id, fields]) => {
    if (!result[id]) { result[id] = {}; changed = true; }
    Object.entries(fields).forEach(([key, def]) => {
      const valid = hasValidBase(result[id], key, def);
      if (!valid) { result[id][key] = def.default; changed = true; }
    });
  });
  return { settings: result, changed };
}

module.exports = {
  WIDGET_DEFS,
  DEFAULT_LAYOUT,
  getDefaultLayout,
  sanitizeLayout,
  fillMissingWidgets,
  WIDGET_SETTINGS_SCHEMA,
  getDefaultWidgetSettings,
  sanitizeWidgetSettings,
  fillMissingWidgetSettings,
};
