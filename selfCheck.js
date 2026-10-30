// selfCheck.js — тихие автопроверки Overdeck. Ничего не показывают, пока всё в порядке.
// Если что-то не так, админка получает список проблем и показывает одну аккуратную плашку.
// Проверки только читают данные и ничего не отправляют наружу (нет сообщений в Telegram, нет тестовых донатов).

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SKIP_JSON = new Set(['package.json', 'package-lock.json']);

let state = { at: 0, ok: true, problems: [], checked: 0 };
let timer = null;

/** Каждая проверка возвращает null (всё хорошо) или текст проблемы. Бросать исключение тоже можно, это будет проблемой. */
const CHECKS = [
  {
    id: 'data-files', title: 'Файлы данных',
    run() {
      const bad = [];
      fs.readdirSync(ROOT).filter((n) => /\.json$/i.test(n) && !SKIP_JSON.has(n)).forEach((n) => {
        try {
          const txt = fs.readFileSync(path.join(ROOT, n), 'utf8');
          if (txt.trim()) JSON.parse(txt);
        } catch (e) { bad.push(n); }
      });
      return bad.length ? 'Повреждены: ' + bad.join(', ') + '. Восстанови из файла авторизации или удали файл, он создастся заново.' : null;
    },
  },
  {
    id: 'disk', title: 'Запись на диск',
    run() {
      const f = path.join(ROOT, '.selfcheck.tmp');
      try { fs.writeFileSync(f, String(Date.now())); fs.unlinkSync(f); } catch (e) { return 'Нет доступа на запись в папку приложения: ' + e.message; }
      return null;
    },
  },
  {
    id: 'static', title: 'Файлы интерфейса',
    run() {
      const need = ['public/overlay.html', 'public/admin/index.html', 'public/admin/app.js', 'public/emotebox.js'];
      const miss = need.filter((p) => !fs.existsSync(path.join(ROOT, p)));
      return miss.length ? 'Не найдены файлы приложения: ' + miss.join(', ') + '. Переустанови или обнови Overdeck.' : null;
    },
  },
  {
    id: 'currency', title: 'Конвертация валют',
    run() {
      const c = require('./currency');
      const a = c.toRub(5, 'RUB'), b = c.toRub(100, 'USD');
      return a.rub === 5 && b.known && b.rub > 0 ? null : 'Расчёт сумм донатов в рубли работает неверно.';
    },
  },
  {
    id: 'chronicles', title: 'Импорт Хроник',
    run() {
      const c = require('./chronicles');
      const r = c.previewTable('Дюна\t55.8% 8/10\nМатрица\t90% 9/10');
      if (r.error || r.total !== 2 || !r.mapping || !r.mapping.title) return 'Импорт Хроник не распознаёт таблицу без заголовков.';
      const r2 = c.previewTable('Название,Оценка\nДюна,8\nМатрица,9');
      return !r2.error && r2.total === 2 ? null : 'Импорт Хроник не читает обычный CSV.';
    },
  },
  {
    id: 'telegram-text', title: 'Тексты Telegram',
    run() {
      const t = require('./telegramAnnounce');
      const L = { startedAt: Date.now() - 3600e3, title: 'Проверка', peak: 10, samples: 5, sum: 40, games: [{ name: 'Игра', at: Date.now() - 3000e3 }], events: {} };
      const s = t.summaryText(L);
      return typeof s === 'string' && s.includes('Стрим закончился') ? null : 'Итоговое сообщение для Telegram собирается неверно.';
    },
  },
  {
    id: 'telegram-state', title: 'Telegram',
    run() {
      const t = require('./telegramAnnounce');
      const s = t.publicState();
      if (s.enabled && s.lastError) return 'Telegram-анонсы включены, но последняя отправка не удалась: ' + String(s.lastError).slice(0, 160);
      return null;
    },
  },
  {
    id: 'backup', title: 'Резервная копия',
    run() {
      const k = require('./keyBundle');
      const n = k.listFiles(false).length;
      return n > 0 ? null : 'Не нашлось ни одного файла настроек для файла авторизации.';
    },
  },
];

/** Проверка живого сервера: админка и оверлей отвечают. */
async function checkHttp(port) {
  const out = [];
  for (const p of ['/admin/', '/overlay.html']) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + p, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) out.push(p + ' отвечает кодом ' + r.status);
    } catch (e) { out.push(p + ' не открывается'); }
  }
  return out.length ? 'Сервер: ' + out.join('; ') : null;
}

async function runAll(port) {
  const problems = [];
  let checked = 0;
  for (const c of CHECKS) {
    checked++;
    try {
      const msg = c.run();
      if (msg) problems.push({ id: c.id, title: c.title, text: msg });
    } catch (e) {
      problems.push({ id: c.id, title: c.title, text: 'Сбой проверки: ' + (e && e.message || e) });
    }
  }
  if (port) {
    checked++;
    try { const m = await checkHttp(port); if (m) problems.push({ id: 'http', title: 'Сервер', text: m }); } catch (e) { /* сеть не нужна, пропускаем */ }
  }
  state = { at: Date.now(), ok: !problems.length, problems, checked };
  return state;
}

/** onChange(state) вызывается после каждой проверки. Первая через 25 секунд после запуска, дальше раз в 6 часов. */
function start(port, onChange) {
  const go = () => runAll(port).then((s) => { try { onChange && onChange(s); } catch (e) { /* не мешаем */ } if (!s.ok) console.log('[Самопроверка] проблемы: ' + s.problems.map((p) => p.title).join(', ')); }).catch(() => {});
  setTimeout(go, 25000);
  timer = setInterval(go, 6 * 3600 * 1000);
  if (timer.unref) timer.unref();
  return go;
}

function get() { return { at: state.at, ok: state.ok, problems: state.problems, checked: state.checked }; }

module.exports = { start, runAll, get, CHECKS };
