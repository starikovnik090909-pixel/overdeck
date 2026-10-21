// themes.js
// Готовые темы оформления — каждая тема отдельным JSON-файлом в папке themes/.
// Структура темы (см. themes/default.json, themes/modern-glass.json):
//   { "name": "...", "preview": "...", "params": { ... вложенные ключи ... } }
//
// Ключевая идея — расширяемость: applyPreset() проходит по ВСЕМ ключам params
// (вложенность любая, через точку), а не только по тем, что известны сейчас.
// Неизвестный ключ — просто пропускается, ничего не ломает. Тема может
// управлять не только цветами (config.theme), но и структурными настройками
// конкретных виджетов (сейчас — таймлайна: полоса превью категорий, шкала
// времени, градиент волны, единый цвет точек активности) — у каждой записи
// в PARAM_MAP есть свой target, показывающий, куда класть значение.
//
// Чтобы добавить новый параметр темы — одна запись в PARAM_MAP, когда для
// него появится реальный эффект (CSS-переменная или настройка виджета).

const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, 'themes');

function ensureThemesDir() {
  if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
}

function hexToRgbArray(hex) {
  const clean = (hex || '#000000').replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Путь параметра темы (плоский, через точку) -> куда класть значение.
 * target: 'theme' — общий config.theme; 'timeline' — config.widgetSettings.timeline.
 */
const PARAM_MAP = {
  'colors.panelBg': { target: 'theme', apply: (t, v) => { t.bgPanelRGB = hexToRgbArray(v); } },
  'colors.accent': { target: 'theme', apply: (t, v) => { t.accent = v; } },
  'colors.text': { target: 'theme', apply: (t, v) => { t.textMain = v; } },
  opacity: { target: 'theme', apply: (t, v) => { t.bgPanelAlpha = Number(v); } },
  'fonts.heading': { target: 'theme', apply: (t, v) => { t.fontMain = v; } },
  'fonts.text': { target: 'theme', apply: (t, v) => { t.fontText = v; } },
  'sizes.headingText': { target: 'theme', apply: (t, v) => { t.fontSizeMain = Number(v); } },
  'sizes.bodyText': { target: 'theme', apply: (t, v) => { t.fontSizeText = Number(v); } },
  borderRadius: { target: 'theme', apply: (t, v) => { t.borderRadius = Number(v); } },
  'panels.glassEffect': { target: 'theme', apply: (t, v) => { t.glassEffect = !!v; } },
  'panels.showHeaderIcon': { target: 'theme', apply: (t, v) => { t.showHeaderIcon = !!v; } },

  'panels.showCategoryThumbnails': { target: 'timeline', apply: (s, v) => { s.showCategoryThumbnails = !!v; } },
  'timeline.showTimecodes': { target: 'timeline', apply: (s, v) => { s.showTimecodes = !!v; } },
  'timeline.waveGradient': {
    target: 'timeline',
    apply: (s, v) => {
      if (Array.isArray(v) && v.length >= 2) {
        s.useWaveGradient = true;
        s.waveGradientStart = v[0];
        s.waveGradientEnd = v[1];
      }
    },
  },
  'timeline.dotColor': { target: 'timeline', apply: (s, v) => { s.useUnifiedDotColor = true; s.dotColor = v; } },
  // Будущие параметры (тени, отступы и т.п.) — добавляются сюда же одной
  // записью, когда для них появится реальный эффект.
};

/** Разворачивает вложенный объект в плоскую карту "a.b.c" -> значение (массивы не разворачиваются). */
function flattenParams(obj, prefix) {
  const out = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenParams(value, keyPath));
    } else {
      out[keyPath] = value;
    }
  });
  return out;
}

/**
 * Строит { theme, timeline } на основе значений по умолчанию (для
 * параметров, которых нет в этой теме) + params выбранной темы поверх.
 * Параметры, которых PARAM_MAP не знает, молча пропускаются.
 */
function applyPreset(params, defaultTheme, defaultTimelineSettings) {
  const theme = { ...defaultTheme };
  const timeline = { ...defaultTimelineSettings };
  const flat = flattenParams(params, '');
  Object.entries(flat).forEach(([keyPath, value]) => {
    const entry = PARAM_MAP[keyPath];
    if (!entry) return; // неизвестный параметр — пропускаем, ничего не ломаем
    if (entry.target === 'theme') entry.apply(theme, value);
    else if (entry.target === 'timeline') entry.apply(timeline, value);
  });
  return { theme, timeline };
}

/** [{id, name, preview, params}] — по одному на каждый .json файл в themes/. */
function listThemes() {
  ensureThemesDir();
  return fs.readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, f), 'utf8'));
        return {
          id: path.basename(f, '.json'),
          name: raw.name || path.basename(f, '.json'),
          preview: raw.preview || '',
          params: raw.params || {},
        };
      } catch (e) {
        console.warn(`[Темы] Не удалось прочитать ${f}:`, e.message);
        return null;
      }
    })
    .filter(Boolean);
}

function getTheme(id) {
  return listThemes().find((t) => t.id === id) || null;
}

module.exports = { listThemes, getTheme, applyPreset, THEMES_DIR };
