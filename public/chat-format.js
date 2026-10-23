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
  const PLATFORM_TAGS = {
    kick: { label: 'KICK', color: '#53FC18', text: '#0b0e0f', border: '#2E9E0B' },
    youtube: { label: 'You', color: '#FF0033', text: '#ffffff', border: '#A8001F' },
    vk: { label: 'VK', color: '#0077FF', text: '#ffffff', border: '#004EA8' },
  };

  // Значки платформ для варианта «Иконка» (белые, на цветной плашке). VK — настоящий логотип, остальные — простые знаки.
  const PLATFORM_ICONS = {
    kick: { vb: '0 0 12 12', d: 'M1 1h3v3.2L7 1h3.6L7.2 4.8 11 11H7.4L5.2 7 4 8.3V11H1z' },
    youtube: { vb: '0 0 12 12', d: 'M3 1.5v9L10.5 6z' },
    vk: { vb: '4 7.4 16.2 9.8', d: 'M19.376 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.204.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z' },
  };

  /** Метка платформы. style: 'outline' (контур, по умолчанию) или 'icon' (цветной квадрат со знаком + тёмная подпись). Все метки одного размера. */
  function makePlatformTag(platform, style, doc) {
    const d = doc || document;
    const pt = PLATFORM_TAGS[platform];
    if (!pt) return null;
    const el = d.createElement('span');
    el.className = 'chat-role-tag chat-platform-tag';
    el.style.boxSizing = 'border-box';
    el.style.borderRadius = '5px';
    el.style.textAlign = 'center';
    if (style === 'icon') {
      const ic = PLATFORM_ICONS[platform];
      el.style.display = 'inline-flex';
      el.style.alignItems = 'stretch';
      el.style.verticalAlign = 'middle';
      el.style.padding = '0';
      el.style.overflow = 'hidden';
      el.style.background = '#0c0e12';
      el.style.color = '#eef0f4';
      el.style.border = '1px solid ' + pt.color;
      el.style.fontWeight = '800';
      el.style.lineHeight = '1';
      const box = d.createElement('span');
      box.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:2.2em;height:2.1em;background:' + pt.color + ';color:' + (platform === 'kick' ? '#0b0e0f' : '#ffffff');
      box.innerHTML = '<svg viewBox="' + ic.vb + '" style="width:1.25em;height:1.25em;fill:currentColor" aria-hidden="true"><path d="' + ic.d + '"/></svg>';
      const lab = d.createElement('span');
      lab.textContent = pt.label;
      lab.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:3em;padding:0 .6em';
      el.appendChild(box);
      el.appendChild(lab);
    } else {
      // «контур»: цвет платформы в тексте и рамке, подложка того же цвета, но прозрачная (rgba, а не color-mix — для OBS)
      el.textContent = pt.label;
      el.style.display = 'inline-block';
      el.style.minWidth = '4.2em';
      el.style.background = hexToRgba(pt.color, 0.14);
      el.style.color = pt.color;
      el.style.border = '1.5px solid ' + pt.color;
    }
    return el;
  }

  function decorateLine(line, msg, settings, beforeEl, doc) {
    const ptag = msg && msg.platform && makePlatformTag(msg.platform, settings && settings.platformTagStyle, doc); // метка платформы (сообщения с Kick / YouTube / VK Live)
    if (ptag) line.insertBefore(ptag, beforeEl || null);
    const active = activeRoles(msg, settings);
    if (!active.length) return;
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

  root.ChatFormat = { stripLinks, activeRoles, decorateLine, makePlatformTag, ROLE_DEFS, URL_RE };
})(typeof window !== 'undefined' ? window : globalThis);
