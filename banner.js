// banner.js
// Баннер «STARIKOV» красными блочными буквами при запуске сервера (вместо текста из start.bat, который в консоли Windows
// превращался в кракозябры). Цвет — ANSI; включается только в настоящем терминале и уважает NO_COLOR (стандартная переменная
// «без цвета»): в логах, перенаправленных в файл, escape-последовательностей не будет.

const BLOCK = '█';

// Шрифт 5 строк в высоту; '#' — закрашенная клетка, пробел — пусто.
const GLYPHS = {
  S: ['#####', '#    ', '#####', '    #', '#####'],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  '],
  A: [' ### ', '#   #', '#####', '#   #', '#   #'],
  R: ['#### ', '#   #', '#### ', '#  # ', '#   #'],
  I: ['###', ' # ', ' # ', ' # ', '###'],
  K: ['#   #', '#  # ', '###  ', '#  # ', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', ' # # ', '  #  '],
};

const LETTER_GAP = '  ';
const BRIGHT_RED = '\x1b[1;31m';
const RESET = '\x1b[0m';

/** Возвращает строки баннера (без цвета). */
function lines(word = 'STARIKOV') {
  const letters = [...word.toUpperCase()].map((ch) => GLYPHS[ch]).filter(Boolean);
  const rows = [];
  for (let r = 0; r < 5; r++) {
    rows.push(letters.map((g) => g[r]).join(LETTER_GAP).replace(/#/g, BLOCK).replace(/\s+$/, ''));
  }
  return rows;
}

function colorEnabled(stream = process.stdout, env = process.env) {
  return !!(stream && stream.isTTY) && !env.NO_COLOR;
}

/** Готовый текст баннера. color: true/false; по умолчанию — по терминалу. */
function render(color = colorEnabled()) {
  const body = lines().map((row) => (color ? `${BRIGHT_RED}${row}${RESET}` : row));
  return `\n${body.join('\n')}\n`;
}

function print() {
  console.log(render());
}

module.exports = { lines, render, print, colorEnabled };
