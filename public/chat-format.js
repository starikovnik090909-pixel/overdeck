// public/chat-format.js — общая логика зеркала чата: вырезание ссылок и роли автора.
// Подключается и в OBS-виджете чата (chat-widget.html), и в зеркале во вкладке «Чат» админки — чтобы правила были в одном месте.

(function (root) {
  // Ссылка — это: адрес со схемой (http://, https://, ftp://), адрес, начинающийся с www., либо «голый» домен с известной зоной
  // (example.com, clips.twitch.tv/abc, site.рф) — именно так Twitch сам превращает текст в ссылки. Зоны перечислены явно, чтобы не
  // резать обычные слова вроде «т.е.», «Mr.Beast» или «file.txt». Адрес электронной почты ссылкой не считается (перед доменом стоит «@»).
  const TLDS = 'com|net|org|ru|tv|gg|io|me|ua|by|kz|su|xyz|info|co|ly|to|app|dev|live|link|shop|site|online|store|fun|cc|ws|one|top|club|pro|biz|рф';
  const URL_RE = new RegExp(
    '(?:(?:https?|ftp):\\/\\/|www\\.)[^\\s<>"]+' +
    '|(?<![\\w@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:' + TLDS + ')(?![a-z0-9-])(?::\\d+)?(?:[\\/?#][^\\s<>"]*)?',
    'giu'
  );
  const TRAILING_PUNCT = /[.,!?;:)\]}'»”…]+$/u;

  /** Вырезает ссылки из текста; знаки препинания сразу после ссылки («глянь https://x.com, круто») остаются. */
  function stripLinksFromText(text) {
    let found = false;
    const out = text.replace(URL_RE, (match) => {
      found = true;
      const tail = TRAILING_PUNCT.exec(match);
      return tail ? tail[0] : '';
    });
    // на месте ссылки остаются двойные пробелы и пробел перед запятой/точкой — убираем только в тексте, где ссылка была
    return { text: found ? out.replace(/\(\s*\)|\[\s*\]/g, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+(?=[.,!?;:)\]}»”…])/gu, '') : text, found };
  }

  /**
   * Убирает ссылки из частей сообщения (текст / смайлы). Смайлы не трогает.
   * Возвращает { parts, hadLink, empty }: empty — после вырезания в сообщении нечего показывать (ни слова, ни смайла).
   * Если ссылок не было, parts — тот же самый массив.
   */
  function stripLinks(parts) {
    const list = Array.isArray(parts) ? parts : [];
    let hadLink = false;
    const next = [];
    list.forEach((part) => {
      if (part && part.type !== 'emote' && typeof part.text === 'string') {
        const r = stripLinksFromText(part.text);
        if (r.found) hadLink = true;
        if (r.text !== '') next.push(r.found ? { ...part, text: r.text } : part);
      } else {
        next.push(part);
      }
    });
    if (!hadLink) return { parts: list, hadLink: false, empty: false };
    // края сообщения без лишних пробелов, оставшихся на месте ссылки
    const firstText = next.findIndex((p) => p && p.type !== 'emote' && typeof p.text === 'string');
    if (firstText === 0) next[0] = { ...next[0], text: next[0].text.replace(/^\s+/, '') };
    const last = next.length - 1;
    if (last >= 0 && next[last] && next[last].type !== 'emote' && typeof next[last].text === 'string') next[last] = { ...next[last], text: next[last].text.replace(/\s+$/, '') };
    const cleaned = next.filter((p) => p && (p.type === 'emote' || (typeof p.text === 'string' && p.text !== '')));
    const empty = !cleaned.some((p) => p.type === 'emote' || p.text.trim() !== '');
    return { parts: cleaned, hadLink: true, empty };
  }

  // Роли для подсветки. Порядок = приоритет: цвет подсветки берётся у первой подходящей роли, а метки показываются у всех подходящих.
  const ROLE_DEFS = [
    { key: 'mod', setting: 'highlightMods', label: 'МОД', color: '#2ECC71' },
    { key: 'vip', setting: 'highlightVips', label: 'VIP', color: '#E91E8C' },
    { key: 'raider', setting: 'highlightRaiders', label: 'РЕЙД', color: '#FF8A3D' },
    { key: 'first', setting: 'highlightNewChatters', label: 'НОВИЧОК', color: '#38BDF8' },
  ];

  /** Роли автора, которые подходят сообщению И включены в настройках. */
  function activeRoles(msg, settings) {
    const roles = (msg && msg.roles) || {};
    const s = settings || {};
    return ROLE_DEFS.filter((d) => roles[d.key] && s[d.setting]);
  }

  function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return `rgba(255,255,255,${alpha})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  /** Оформляет строку чата: подсветка (цветная полоска слева и лёгкая заливка) + метки ролей перед ником. beforeEl — перед каким элементом вставить метки. */
  function decorateLine(line, msg, settings, beforeEl, doc) {
    const active = activeRoles(msg, settings);
    if (!active.length) return;
    const d = doc || document;
    line.classList.add('role-highlight');
    line.style.setProperty('--role-color', active[0].color);
    line.style.setProperty('--role-bg', hexToRgba(active[0].color, 0.16)); // rgba считаем сами, а не через color-mix: он не везде есть во встроенном браузере OBS
    active.forEach((def) => {
      const tag = d.createElement('span');
      tag.className = 'chat-role-tag';
      tag.textContent = def.label;
      tag.style.background = def.color;
      line.insertBefore(tag, beforeEl || null);
    });
  }

  root.ChatFormat = { stripLinks, activeRoles, decorateLine, ROLE_DEFS, URL_RE };
})(typeof window !== 'undefined' ? window : globalThis);
