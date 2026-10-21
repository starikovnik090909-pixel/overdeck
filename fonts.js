// fonts.js
// Свои шрифты, загруженные через админку ("Основные настройки" → "Шрифты" →
// "Добавить свой шрифт"). Файлы лежат в папке fonts/ в корне проекта и
// раздаются как статика (см. server.js: app.use('/fonts', ...)). Список
// каждый раз читается прямо с диска — папка маленькая, простое File I/O
// дешевле, чем городить кэш с инвалидацией.

const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, 'fonts');
const ALLOWED_EXT = ['.ttf', '.otf', '.woff', '.woff2'];

function ensureFontsDir() {
  if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });
}

function formatForExt(ext) {
  switch (ext) {
    case '.ttf': return 'truetype';
    case '.otf': return 'opentype';
    case '.woff': return 'woff';
    case '.woff2': return 'woff2';
    default: return null;
  }
}

/** [{ name, file, url, format }] — name это имя файла без расширения. */
function listFonts() {
  ensureFontsDir();
  return fs.readdirSync(FONTS_DIR)
    .filter((file) => ALLOWED_EXT.includes(path.extname(file).toLowerCase()))
    .map((file) => {
      const ext = path.extname(file).toLowerCase();
      return {
        name: path.basename(file, ext),
        file,
        url: `/fonts/${encodeURIComponent(file)}`,
        format: formatForExt(ext),
      };
    });
}

/** Ищет среди загруженных шрифтов первый, чьё имя файла содержит nameSubstring (без учёта регистра). */
function findFontByName(nameSubstring) {
  return listFonts().find((f) => f.name.toLowerCase().includes(nameSubstring)) || null;
}

/** Все файлы, чьё имя содержит nameSubstring — не только первый попавшийся (нужно для определения ВСЕХ начертаний одного шрифта). */
function findAllFontsByName(nameSubstring) {
  const needle = nameSubstring.toLowerCase();
  return listFonts().filter((f) => f.name.toLowerCase().includes(needle));
}

// Порядок проверки важен: сначала самые "специфичные" слова (иначе, например,
// "ExtraBold" определился бы как обычный "Bold" — bold проверяется позже).
// Файл без явного указания начертания в имени считается Regular (400) —
// это самое частое соглашение об именовании шрифтовых файлов.
const WEIGHT_PATTERNS = [
  { re: /black|heavy/i, weight: 900, label: 'Black' },
  { re: /extrabold|ultrabold/i, weight: 800, label: 'ExtraBold' },
  { re: /semibold|demibold/i, weight: 600, label: 'SemiBold' },
  { re: /bold/i, weight: 700, label: 'Bold' },
  { re: /medium/i, weight: 500, label: 'Medium' },
  { re: /light/i, weight: 300, label: 'Light' },
  { re: /thin/i, weight: 100, label: 'Thin' },
  { re: /regular|normal|roman/i, weight: 400, label: 'Regular' },
];

/** Определяет начертание (вес + подпись) по имени файла шрифта — часть 4 задания. */
function detectWeight(filename) {
  for (const p of WEIGHT_PATTERNS) {
    if (p.re.test(filename)) return { weight: p.weight, label: p.label };
  }
  return { weight: 400, label: 'Regular' };
}

/**
 * Доступные начертания для конкретного шрифта (по подстроке в имени файла) —
 * сканирует ВСЕ подходящие файлы в fonts/, а не только первый, и определяет
 * вес каждого. Используется и для Beaufort/Spiegel, и в принципе для любого
 * шрифта, который положат в ту же папку с несколькими файлами начертаний.
 */
function getAvailableWeights(nameSubstring) {
  const files = findAllFontsByName(nameSubstring);
  const seen = new Map();
  files.forEach((f) => {
    const { weight, label } = detectWeight(f.file);
    if (!seen.has(weight)) seen.set(weight, label);
  });
  return Array.from(seen.entries())
    .map(([weight, label]) => ({ weight, label }))
    .sort((a, b) => a.weight - b.weight);
}

/**
 * Генерирует @font-face для фирменных шрифтов Riot (Beaufort for LOL, Spiegel) —
 * ИЩЕТ их среди уже загруженных в fonts/ по подстроке в имени файла, не по
 * жёстко зашитому имени: пользователь может назвать файл как угодно при
 * скачивании с сайта League of Legends, лишь бы в названии встречалось
 * "beaufort" или "spiegel". Если несколько файлов одного шрифта — генерирует
 * ОТДЕЛЬНЫЙ @font-face на каждое найденное начертание (по имени файла: Bold/
 * Medium/Black/...), все под одним font-family — тогда выбор жирности через
 * обычный CSS font-weight работает сам, без доп. магии на клиенте. Если
 * файла нет вообще — ничего не генерируется, CSS-стек шрифтов темы сам
 * откатится на фоллбэк (Cinzel/Marcellus/serif и Inter/Roboto/sans-serif
 * соответственно) — рендер не ломается в любом случае.
 */
function generateRiotFontFaceCss() {
  let css = '';
  [['beaufort', 'Beaufort for LOL'], ['spiegel', 'Spiegel']].forEach(([needle, familyName]) => {
    findAllFontsByName(needle).forEach((f) => {
      const { weight } = detectWeight(f.file);
      css += `@font-face { font-family: '${familyName}'; src: url('${f.url}') format('${f.format}'); font-weight: ${weight}; font-display: swap; }\n`;
    });
  });
  return css;
}

module.exports = {
  FONTS_DIR, ALLOWED_EXT, ensureFontsDir, listFonts, formatForExt,
  findFontByName, findAllFontsByName, detectWeight, getAvailableWeights, generateRiotFontFaceCss,
};
