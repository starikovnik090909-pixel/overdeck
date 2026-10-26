'use strict';
// Алерт доната: настройки, текст для озвучки и формирование сообщения для оверлея. Движок озвучки — общий (tts.js, голос из «Озвучки чата»).

const gender = require('./gender');

// Виды алерта: старые (card/receipt/slots) + новые полноэкранные и малое «уведомление» (public/donation-looks.js)
const NEW_LOOKS = ['arcade', 'terminal', 'loot', 'hijack', 'goldrain', 'fireworks', 'cinema', 'notif'];
const LOOKS = ['card', 'receipt', 'slots', 'random', ...NEW_LOOKS];

const DEFAULTS = {
  mode: 'ours',          // ours — наши анимированные виды (look); custom — стандартный: своя картинка/гиф + звук + текст
  customImage: '', customAudio: '', customDuration: 8, customVolume: 80, customText: '{nick} — {amount}', customShowMsg: true,
  customPos: 'center', customAnim: 'zoom', customFontSize: 56, customTextColor: '#ffffff', customAccent: '#ffd36b', customImgSize: 40,
  customFont: '',
  enabled: true,
  minAmount: 0,          // донаты меньше этой суммы (в ₽) алерт не показывают
  speak: true,           // озвучивать алерт
  readNick: true,        // «<ник> задонатил <сумма>»
  genderVerb: true,      // «задонатил» / «задонатила» по роду ника (эвристика)
  genderUnknown: 'male', // если род не определился: 'male' | 'female'
  genderList: '',        // ручные исключения, по строке: «ник = м» или «ник = ж»
  readMessage: true,     // читать текст сообщения
  maxLength: 200,        // сколько символов сообщения читать/показывать
  holdMinSec: 5,         // минимум, сколько карточка висит у экрана
  holdMaxSec: 25,        // максимум (длинное сообщение/озвучка)
  flySec: 1.8,           // длительность подлёта
  scale: 100,            // размер карточки, %
  cardColor: '',         // пусто — цвет из темы; иначе #rrggbb
  volume: 100,           // громкость озвучки алерта, %
  soundFly: 'power-up.ogg',   // звук подлёта карточки (имя файла из public/alert-sounds, пусто — без звука)
  soundPrint: 'rc-print-1.ogg', // звук печати чека (вид «Чек»)
  soundTear: 'rc-tear-1.ogg',   // звук отрыва чека
  soundLand: 'bell.ogg',      // звук, когда карточка долетела до экрана
  soundVolume: 70,            // громкость звуков, %
  plateOpacity: 100,     // непрозрачность плашки, % (0 — как у виджетов стиля; работает при привязке к теме)
  showSource: true,      // значок площадки (DA / DX) в углу карточки
  pulse: true,           // сумма слегка пульсирует и подсвечивается
  texture: '',           // файл текстуры фона карточки (uploads/alert-texture/)
  texDim: 35,            // затемнение текстуры, %
  texOpacity: 100,       // непрозрачность текстуры, %
  tiers: true,           // уровни доната: подпись над ником и усиленное свечение
  tier1: 1000, tier2: 5000, tier3: 15000, // пороги уровней в ₽
  timeBar: true,         // полоска оставшегося времени внизу карточки
  donorStat: true,       // строка «Донат №N · всего …» (по истории донатов)
  frame: 'tier',         // анимированная рамка: '' | tier | flow | comet | neon | rainbow | gold | dashes
  frameW: 4,             // толщина рамки, px
  glow: true,            // мягкий свет за карточкой
  glowPower: 80,         // сила света, %
  typeText: true,        // текст сообщения печатается на карточке во время озвучки
  font: '',              // отдельный шрифт алерта; пусто — шрифт темы/стиля оверлея
  themed: true,          // карточка оформляется в стиле/цвете/шрифте темы оверлея; выключено — нейтральный вид
  lookPos: 'top',       // положение малого алерта (уведомление): top | top-right | bottom-right | bottom-left | bottom
  look: 'card',          // вид алерта доната: card | receipt (чек) | slots (игровой автомат) | random
  receiptTitle: 'ДОНАТ-КАССА', // заголовок на чеке
  voice: '',             // голос Piper для алертов; пусто — тот же, что в «Озвучке чата»
};

const clamp = (v, a, b, f) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : f; };
const bool = (v, f) => (typeof v === 'boolean' ? v : f);

const soundName = (v, f) => (v === '' ? '' : (typeof v === 'string' && /^[A-Za-z0-9_.\- ]{1,80}\.(ogg|mp3|wav)$/i.test(v) ? v : f));

function sanitize(raw, base) {
  const b = { ...DEFAULTS, ...(base || {}) };
  const r = raw || {};
  return {
    enabled: bool(r.enabled, b.enabled),
    minAmount: clamp(r.minAmount, 0, 1000000, b.minAmount),
    speak: bool(r.speak, b.speak),
    readNick: bool(r.readNick, b.readNick),
    genderVerb: bool(r.genderVerb, b.genderVerb),
    genderUnknown: r.genderUnknown === 'female' || r.genderUnknown === 'male' ? r.genderUnknown : b.genderUnknown,
    genderList: typeof r.genderList === 'string' ? r.genderList.slice(0, 6000) : b.genderList,
    readMessage: bool(r.readMessage, b.readMessage),
    maxLength: Math.round(clamp(r.maxLength, 20, 500, b.maxLength)),
    holdMinSec: clamp(r.holdMinSec, 2, 60, b.holdMinSec),
    holdMaxSec: clamp(r.holdMaxSec, 5, 120, b.holdMaxSec),
    flySec: clamp(r.flySec, 0.8, 4, b.flySec),
    scale: Math.round(clamp(r.scale, 40, 180, b.scale)),
    cardColor: typeof r.cardColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.cardColor) ? r.cardColor.toLowerCase() : (r.cardColor === '' ? '' : b.cardColor),
    volume: Math.round(clamp(r.volume, 0, 100, b.volume)),
    soundFly: soundName(r.soundFly, b.soundFly),
    soundLand: soundName(r.soundLand, b.soundLand),
    soundPrint: soundName(r.soundPrint, b.soundPrint),
    soundTear: soundName(r.soundTear, b.soundTear),
    soundVolume: Math.round(clamp(r.soundVolume, 0, 100, b.soundVolume)),
    themed: bool(r.themed, b.themed),
    plateOpacity: Math.round(clamp(r.plateOpacity, 0, 100, b.plateOpacity)),
    showSource: bool(r.showSource, b.showSource),
    pulse: bool(r.pulse, b.pulse),
    typeText: bool(r.typeText, b.typeText),
    mode: r.mode === 'custom' || r.mode === 'ours' ? r.mode : b.mode,
    customImage: typeof r.customImage === 'string' && (r.customImage === '' || /^[A-Za-z0-9_.\-]{1,80}\.(jpe?g|png|webp|gif|apng|avif)$/i.test(r.customImage)) ? r.customImage : b.customImage,
    customAudio: typeof r.customAudio === 'string' && (r.customAudio === '' || /^[A-Za-z0-9_.\-]{1,80}\.(ogg|mp3|wav|m4a|aac)$/i.test(r.customAudio)) ? r.customAudio : b.customAudio,
    customDuration: clamp(r.customDuration, 2, 60, b.customDuration),
    customVolume: Math.round(clamp(r.customVolume, 0, 100, b.customVolume)),
    customText: typeof r.customText === 'string' ? r.customText.slice(0, 120) : b.customText,
    customShowMsg: bool(r.customShowMsg, b.customShowMsg),
    customPos: ['top', 'center', 'bottom'].includes(r.customPos) ? r.customPos : b.customPos,
    customAnim: ['fade', 'zoom', 'slide', 'bounce'].includes(r.customAnim) ? r.customAnim : b.customAnim,
    customFontSize: Math.round(clamp(r.customFontSize, 20, 140, b.customFontSize)),
    customTextColor: typeof r.customTextColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.customTextColor) ? r.customTextColor.toLowerCase() : b.customTextColor,
    customAccent: typeof r.customAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.customAccent) ? r.customAccent.toLowerCase() : b.customAccent,
    customImgSize: Math.round(clamp(r.customImgSize, 10, 100, b.customImgSize)),
    customFont: typeof r.customFont === 'string' ? r.customFont.slice(0, 60) : b.customFont,
    look: LOOKS.includes(r.look) ? r.look : b.look,
    lookPos: ['top', 'top-right', 'bottom-right', 'bottom-left', 'bottom'].includes(r.lookPos) ? r.lookPos : b.lookPos,
    receiptTitle: typeof r.receiptTitle === 'string' ? r.receiptTitle.trim().slice(0, 30) : b.receiptTitle,
    frame: ['', 'tier', 'flow', 'comet', 'neon', 'rainbow', 'gold', 'dashes'].includes(r.frame) ? r.frame : b.frame,
    frameW: Math.round(clamp(r.frameW, 1, 12, b.frameW)),
    glow: bool(r.glow, b.glow),
    glowPower: Math.round(clamp(r.glowPower, 0, 100, b.glowPower)),
    texture: typeof r.texture === 'string' && (r.texture === '' || /^[A-Za-z0-9_.\-]{1,80}\.(jpe?g|png|webp|gif)$/i.test(r.texture)) ? r.texture : b.texture,
    texDim: Math.round(clamp(r.texDim, 0, 100, b.texDim)),
    texOpacity: Math.round(clamp(r.texOpacity, 0, 100, b.texOpacity)),
    tiers: bool(r.tiers, b.tiers),
    tier1: clamp(r.tier1, 1, 100000000, b.tier1), tier2: clamp(r.tier2, 1, 100000000, b.tier2), tier3: clamp(r.tier3, 1, 100000000, b.tier3),
    timeBar: bool(r.timeBar, b.timeBar),
    donorStat: bool(r.donorStat, b.donorStat),
    font: typeof r.font === 'string' && (r.font === '' || /^[^'"`;<>{}\\\n]{1,60}$/.test(r.font)) ? r.font.trim() : b.font,
    voice: typeof r.voice === 'string' && (r.voice === '' || /^[A-Za-z0-9_.:\-]{1,80}$/.test(r.voice)) ? r.voice : b.voice,
  };
}

// ---- число прописью (для озвучки: «500» → «пятьсот») ----
const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const ONES_F = ['', 'одна', 'две'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUND = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
function triad(n, female) {
  const out = [];
  out.push(HUND[Math.floor(n / 100)]);
  const r = n % 100;
  if (r < 20) out.push(female && r < 3 ? ONES_F[r] : ONES[r]);
  else { out.push(TENS[Math.floor(r / 10)]); const o = r % 10; out.push(female && o < 3 ? ONES_F[o] : ONES[o]); }
  return out.filter(Boolean).join(' ');
}
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
function numberWords(n, female) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'ноль';
  if (n >= 1000000000) return String(n);
  const parts = [];
  const mil = Math.floor(n / 1000000), th = Math.floor((n % 1000000) / 1000), rest = n % 1000;
  if (mil) parts.push(triad(mil, false) + ' ' + plural(mil, 'миллион', 'миллиона', 'миллионов'));
  if (th) parts.push((th === 1 ? '' : triad(th, true) + ' ') + plural(th, 'тысяча', 'тысячи', 'тысяч'));
  if (rest) parts.push(triad(rest, female));
  return parts.join(' ');
}
const CUR = {
  RUB: { sym: '₽', f: false, w: ['рубль', 'рубля', 'рублей'] },
  USD: { sym: '$', f: false, w: ['доллар', 'доллара', 'долларов'] },
  EUR: { sym: '€', f: false, w: ['евро', 'евро', 'евро'] },
  UAH: { sym: '₴', f: false, w: ['гривна', 'гривны', 'гривен'], fem: true },
  KZT: { sym: '₸', f: false, w: ['тенге', 'тенге', 'тенге'] },
  BYN: { sym: 'Br', f: false, w: ['белорусский рубль', 'белорусских рубля', 'белорусских рублей'] },
};
function currencySymbol(code) { const c = CUR[String(code || 'RUB').toUpperCase()]; return c ? c.sym : String(code || ''); }
function amountText(amount, code) {
  const c = CUR[String(code || 'RUB').toUpperCase()];
  const n = Number(amount) || 0;
  if (!c || !Number.isInteger(n)) return `${String(n).replace('.', ',')} ${c ? c.w[2] : String(code || '')}`.trim();
  return `${numberWords(n, !!c.fem)} ${plural(n, c.w[0], c.w[1], c.w[2])}`;
}

function cleanMessage(text, maxLength) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > maxLength ? t.slice(0, maxLength).trim() + '…' : t;
}

/** Текст, который будет произнесён (пустая строка — озвучивать нечего). */
function verb(nick, s) {
  if (s.genderVerb === false) return 'задонатил';
  const g = gender.resolve(nick, { genderDetect: true, genderUnknown: s.genderUnknown, genderOverrides: gender.parseOverrides(s.genderList) });
  return g === 'f' ? 'задонатила' : 'задонатил';
}

function buildSpeech(record, s) {
  const parts = [];
  if (s.readNick) parts.push(`${record.username || 'Аноним'} ${verb(record.username, s)} ${amountText(record.amount, record.currency)}.`);
  const msg = cleanMessage(record.message, s.maxLength);
  if (s.readMessage && msg) parts.push(msg);
  return parts.join(' ');
}

/** Короткая метка площадки для значка на карточке. */
function sourceTag(platform) {
  const p = String(platform || '').toLowerCase();
  if (p === 'donatex') return 'DX';
  if (p === 'donationalerts') return 'DA';
  if (p === 'donatepay') return 'DP';
  return '';
}

const TIER_FRAME = ['', 'flow', 'comet', 'gold']; // рамка при выборе «по уровню доната»
const TIER_LABELS = ['донат', 'крупный донат', 'огромный донат', 'легендарный донат'];
/** Уровень доната 0..3 по сумме в рублях. */
function tierOf(rub, s) {
  if (s.tiers === false) return 0;
  return rub >= s.tier3 ? 3 : rub >= s.tier2 ? 2 : rub >= s.tier1 ? 1 : 0;
}

/** Данные карточки для оверлея. extra: { rub, stat } — сумма в рублях и готовая строка статистики донатера. */
function buildCard(record, s, extra) {
  const amount = Number(record.amount) || 0;
  const ex = extra || {};
  const tier = tierOf(ex.rub == null ? amount : ex.rub, s);
  const look = s.look === 'random' ? ['card', 'receipt', 'slots'][Math.floor(Math.random() * 3)] : (s.look || 'card');
  const dlook = s.mode === 'custom' ? 'custom' : (NEW_LOOKS.includes(look) ? look : '');
  const out = {
    username: record.username || 'Аноним',
    amount,
    amountText: (Number.isInteger(amount) ? amount.toLocaleString('ru-RU') : String(amount).replace('.', ',')) + ' ' + currencySymbol(record.currency),
    message: cleanMessage(record.message, s.maxLength),
    holdMin: s.holdMinSec, holdMax: s.holdMaxSec, flySec: s.flySec, scale: s.scale, color: s.cardColor, volume: s.volume,
    soundFly: s.soundFly, soundLand: s.soundLand, soundVolume: s.soundVolume, themed: s.themed !== false, font: s.font || '',
    plateOpacity: s.plateOpacity == null ? 100 : s.plateOpacity, pulse: s.pulse !== false, typeText: s.typeText !== false,
    source: s.showSource !== false ? sourceTag(record.platform) : '',
    texture: s.texture ? 'uploads/alert-texture/' + encodeURIComponent(s.texture) : '', texDim: s.texDim, texOpacity: s.texOpacity,
    frame: s.frame === 'tier' ? TIER_FRAME[tier] : (s.frame || ''), frameW: s.frameW, glow: s.glow !== false, glowPower: s.glowPower,
    tier, tierLabel: TIER_LABELS[tier], timeBar: s.timeBar !== false,
    stat: s.donorStat !== false ? (ex.stat || '') : '',
  };
  if (s.mode === 'custom') {
    const q = (d, f) => (f ? d + encodeURIComponent(f) : '');
    out.custom = { image: q('uploads/alert-custom/', s.customImage), audio: q('uploads/alert-custom/', s.customAudio), duration: s.customDuration, volume: s.customVolume, text: s.customText, showMsg: s.customShowMsg, pos: s.customPos, anim: s.customAnim, fontSize: s.customFontSize, color: s.customTextColor, accent: s.customAccent, imgSize: s.customImgSize, font: s.customFont || s.font || '' };
  }
  else if (look === 'receipt') out.receipt = { soundPrint: s.soundPrint, soundTear: s.soundTear, title: s.receiptTitle || 'ДОНАТ-КАССА', no: Number(ex.no) || 0 };
  if (s.mode !== 'custom' && look === 'slots') out.slots = true;
  if (dlook) { out.dlook = dlook; out.lookPos = s.lookPos || 'top'; }
  return out;
}

module.exports = { plural, cleanMessage, TIER_FRAME, TIER_LABELS, tierOf, DEFAULTS, sanitize, buildSpeech, buildCard, amountText, numberWords };
