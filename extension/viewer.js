/* Расширение Twitch «Чат-аватары»: интерфейс зрителя.
 * Данных у страницы нет — их присылает сервер стримера через Twitch (PubSub, цель broadcast). Формат снимка (v1) описан в extension.js на сервере:
 *   { v:1, t, live, p:[[login,name,hero,level,xp,xpNeed,maxed,color,uid,totalXp,rank,mult,[id наград]]…], st:[логины на сцене], tp:[логины топа] }
 * Профиль зритель видит после «поделиться личностью»: Twitch отдаёт расширению его числовой ID, по нему ищем его в снимке (uid).
 * Всё, что здесь вставляется на страницу, — через textContent (никакой разметки из данных). */
(function () {
  'use strict';
  var ext = window.Twitch && window.Twitch.ext;
  var $ = function (id) { return document.getElementById(id); };
  var heroes = {};            // id → описание героя (heroes.json, собирает tools/build-extension.js)
  var snap = null;            // последний принятый снимок (разобранный)
  var viewerId = '';          // числовой Twitch ID зрителя (пусто — не поделился)
  var tab = 'profile';
  var viewLogin = null;       // чей профиль открыт во вкладке «Профиль» (null — свой)
  var DIR_ANGLE = { east: 0, 'south-east': 45, south: 90, 'south-west': 135, west: 180, 'north-west': -135, north: -90, 'north-east': -45 };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : ''; }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* без хранилища — не страшно */ } return null; }

  /* ---------- фон сцены (выбор зрителя хранится только в его браузере) ---------- */
  var SCENES = [{ id: 'lobby', t: 'Лобби гильдии' }, { id: 'tavern', t: 'Таверна' }, { id: 'temple', t: 'Храм' }, { id: 'market', t: 'Городской рынок' }];
  function sceneOk(id) { return SCENES.some(function (x) { return x.id === id; }); }
  var bgTheme = sceneOk(store('bgTheme')) ? store('bgTheme') : 'lobby';   // какая тема выбрана
  var bgOn = store('bgOn') === '1';                                          // включён ли фон
  function applyBg() {
    var sc = $('scene'), on = bgOn && sceneOk(bgTheme);
    sc.classList.toggle('hasbg', on);
    sc.style.backgroundImage = on ? 'url("scenes/' + bgTheme + '.png")' : '';
    var b = $('bgbtn'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    Array.prototype.forEach.call(document.querySelectorAll('.bg-sw'), function (x) { x.classList.toggle('on', on); });
    Array.prototype.forEach.call(document.querySelectorAll('.bg-chip'), function (x) { x.classList.toggle('sel', on && x.getAttribute('data-id') === bgTheme); });
  }
  function setBg(on, theme) { if (theme && sceneOk(theme)) { bgTheme = theme; store('bgTheme', theme); } bgOn = !!on; store('bgOn', bgOn ? '1' : '0'); applyBg(); }
  function bgControls() {
    var box = el('div', 'bgbox'), top = el('div', 'bg-top'), sw = el('button', 'bg-sw'); sw.type = 'button'; sw.setAttribute('aria-label', 'Фон сцены');
    sw.addEventListener('click', function () { setBg(!bgOn); });
    top.append(el('span', null, 'Фон сцены'), sw);
    var chips = el('div', 'bg-chips');
    SCENES.forEach(function (x) {
      var c = el('button', 'bg-chip'); c.type = 'button'; c.setAttribute('data-id', x.id); c.style.backgroundImage = 'url("scenes/' + x.id + '.png")'; c.appendChild(el('span', null, x.t));
      c.addEventListener('click', function () { setBg(true, x.id); }); chips.appendChild(c);
    });
    box.append(top, chips); return box;
  }

  /* ---------- данные ---------- */
  function parseSnapshot(o) {
    if (!o || o.v !== 1 || !Array.isArray(o.p) || !Array.isArray(o.st) || !Array.isArray(o.tp)) return null;
    var P = {};
    o.p.forEach(function (a) {
      if (!Array.isArray(a) || typeof a[0] !== 'string') return;
      P[a[0]] = { login: a[0], name: String(a[1] || a[0]), hero: String(a[2] || ''), level: num(a[3], 0), xp: num(a[4], 0), need: num(a[5], 0), maxed: !!a[6], color: safeColor(a[7]), uid: String(a[8] || ''), total: num(a[9], 0), rank: num(a[10], 0), mult: num(a[11], 1), awards: Array.isArray(a[12]) ? a[12].filter(function (x) { return typeof x === 'string' && /^a[0-9a-z]{1,8}$/.test(x); }).slice(0, 12) : [], mask: /^[0-9a-f]*$/.test(String(a[13] || '')) ? String(a[13] || '') : '' };
    });
    var has = function (l) { return typeof l === 'string' && P[l]; };
    return { t: num(o.t, Date.now()), live: !!o.live, hv: String(o.hv || ''), hn: num(o.hn, 0), cc: /^![^\s]{1,31}$/.test(String(o.cc || '')) ? String(o.cc) : '', players: P, stage: o.st.filter(has), top: o.tp.filter(has), receivedAt: Date.now() };
  }
  /* каталог наград: { v:1, k:'aw', a:[[id,название,описание,иконка]] } — приходит отдельным сообщением, запоминается в браузере до следующего */
  var awardCat = {};
  var ICON_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
  function parseCatalog(o) {
    if (!o || o.v !== 1 || o.k !== 'aw' || !Array.isArray(o.a)) return null;
    var c = {};
    o.a.slice(0, 60).forEach(function (r) {
      if (!Array.isArray(r) || typeof r[0] !== 'string' || !/^a[0-9a-z]{1,8}$/.test(r[0])) return;
      c[r[0]] = { title: String(r[1] || '').slice(0, 40), desc: String(r[2] || '').slice(0, 200), icon: typeof r[3] === 'string' && r[3].length <= 8000 && ICON_RE.test(r[3]) ? r[3] : '',
        howTo: String(r[4] || '').slice(0, 160), open: r[5] === 1 || r[5] === true || r[5] === undefined, issued: num(r[6], 0) };
    });
    return c;
  }
  /* сообщений с каталогом может быть несколько (каждое — часть наград): сливаем по id; первое помечено r:1 — оно сначала очищает старое (удалённые награды исчезают) */
  function mergeCatalog(part, replace) { if (replace) awardCat = {}; Object.keys(part).forEach(function (k) { awardCat[k] = part[k]; }); try { store('awcat', JSON.stringify(awardCat)); } catch (e) { /* ок */ } }
  try { var saved = store('awcat'); if (saved) { var sv = JSON.parse(saved), rows = []; Object.keys(sv).forEach(function (k) { var x = sv[k]; rows.push([k, x.title, x.desc, x.icon, x.howTo, x.open ? 1 : 0, x.issued]); }); awardCat = parseCatalog({ v: 1, k: 'aw', a: rows }) || {}; } } catch (e) { awardCat = {}; }
  function medalIcon(m, size) {
    var s = el('span', 'micon');
    if (m.icon) { var im = el('img'); im.src = m.icon; im.alt = ''; im.width = size; im.height = size; im.addEventListener('error', function () { im.remove(); s.textContent = '🏅'; }); s.appendChild(im); } else s.textContent = '🏅';
    return s;
  }
  function fmtDate(sec) { try { return new Date(sec * 1000).toLocaleDateString('ru-RU'); } catch (e) { return ''; } }
  function medals(p) {
    var ids = (p.awards || []).filter(function (id) { return awardCat[id]; });
    var box = el('div', 'medals-box');
    if (ids.length) {
      var wrap = el('div', 'medals'), info = el('div', 'medal-info muted small', 'Нажмите на медаль, чтобы прочитать описание');
      ids.forEach(function (id) {
        var m = awardCat[id], b = el('button', 'medal'); b.type = 'button';
        b.title = m.title + (m.desc ? ' — ' + m.desc : ''); b.setAttribute('aria-label', b.title);
        b.appendChild(medalIcon(m, 28));
        b.addEventListener('click', function () { info.textContent = m.title + (m.desc ? ' — ' + m.desc : ''); });
        wrap.appendChild(b);
      });
      box.append(wrap, info);
    }
    if (Object.keys(awardCat).length) {
      var all = el('button', 'btn ghost medal-all', 'Все награды →'); all.type = 'button';
      all.addEventListener('click', function () { setTab('awards'); });
      var rowEl = box.querySelector('.medals');
      if (rowEl) rowEl.appendChild(all); else box.appendChild(all);       // рядом с медалями, чтобы кнопка была видна без прокрутки
    }
    return box.childNodes.length ? box : null;
  }
  /* ---------- вкладка «События»: все награды, как их получить, доступны ли ещё ---------- */
  var selAward = null;
  function renderAwards() {
    var root = $('view-awards'); root.replaceChildren();
    var ids = Object.keys(awardCat);
    if (!ids.length) { root.appendChild(el('p', 'muted center', 'Наград пока нет. Когда стример создаст события с наградами, они появятся здесь.')); return; }
    ids.sort(function (a, b) { return (awardCat[b].open ? 1 : 0) - (awardCat[a].open ? 1 : 0); });
    var mine = me(), have = {}; if (mine) mine.awards.forEach(function (id) { have[id] = true; });
    var got = ids.filter(function (id) { return have[id]; }).length;
    root.appendChild(el('div', 'awhead', mine ? 'Награды: у вас ' + got + ' из ' + ids.length : 'Все награды (' + ids.length + ')'));
    var grid = el('div', 'awgrid');
    ids.forEach(function (id) {
      var m = awardCat[id], b = el('button', 'awbtn' + (have[id] ? ' owned' : '') + (m.open ? '' : ' closed') + (selAward === id ? ' sel' : '')); b.type = 'button';
      b.setAttribute('aria-label', m.title + (have[id] ? ', получена' : '') + (m.open ? ', можно получить' : ', закрыта'));
      b.appendChild(medalIcon(m, 36));
      if (!m.open) b.appendChild(el('span', 'awlock', '🔒'));
      b.addEventListener('click', function () { selAward = selAward === id ? null : id; renderAwards(); });
      grid.appendChild(b);
    });
    root.appendChild(grid);
    var m2 = selAward && awardCat[selAward];
    if (!m2) { root.appendChild(el('p', 'muted small center', 'Нажмите на награду, чтобы узнать, как её получить.')); return; }
    var d = el('div', 'awdetail');
    d.appendChild(el('div', 'awtitle', m2.title));
    if (m2.desc) d.appendChild(el('div', 'awdesc', m2.desc));
    d.appendChild(el('div', 'awhow', 'Как получить: ' + (m2.howTo || 'условия не указаны')));
    var st = el('div', 'awstat ' + (m2.open ? 'open' : 'closed'), m2.open ? 'Можно получить сейчас' : 'Больше недоступна' + (m2.issued ? ' · выдавалась ' + fmtDate(m2.issued) : ''));
    d.appendChild(st);
    if (have[selAward]) d.appendChild(el('div', 'awown', '✔ У вас есть эта награда'));
    root.appendChild(d);
  }
  /* ---------- выбор аватара: доступные и недоступные герои ---------- */
  var pickOpen = false, pickNew = {}, pickSel = null;
  function heroHash(ids) { var h = 5381, s = ids.join(','); for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 4294967296; return h.toString(36); }
  function heroIds() { return Object.keys(heroes).sort(); }
  /** Порядок героев совпадает с серверным (проверка по отпечатку) — только тогда маске можно верить. */
  function maskOk() { return !!(snap && snap.hv && snap.hn && Object.keys(heroes).length === snap.hn && heroHash(heroIds()) === snap.hv); }
  function usable(p) {
    var ids = heroIds(), m = p.mask || '', out = {};
    ids.forEach(function (id, i) { var g = Math.floor(i / 24), chunk = parseInt(m.substr(g * 6, 6) || '0', 16) || 0; out[id] = !!(Math.floor(chunk / Math.pow(2, i % 24)) % 2); });
    return out;
  }
  function seenKey() { return 'seen_' + (viewerId || 'x'); }
  function seenSet() { var s = store(seenKey()); if (s === null || s === undefined) return null; var o = {}; String(s).split(',').forEach(function (x) { if (x) o[x] = true; }); return o; }
  function markSeen(p) { var u = usable(p), ids = Object.keys(u).filter(function (k) { return u[k]; }); store(seenKey(), ids.join(',')); }
  /** Герои, которые стали доступны после последнего просмотра. Первый раз ничего «нового» нет — запоминаем текущих. */
  function newHeroes(p) {
    if (!maskOk()) return {};
    var seen = seenSet(), u = usable(p), out = {};
    if (!seen) { markSeen(p); return {}; }
    Object.keys(u).forEach(function (id) { if (u[id] && !seen[id]) out[id] = true; });
    return out;
  }
  var EYE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>';
  function copyText(text, note) {
    function fallback() { try { var r = document.createRange(); r.selectNodeContents(note.codeEl); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); note.textContent = 'Выделено — нажмите Ctrl+C'; } catch (e) { note.textContent = 'Скопируйте команду вручную'; } }
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { note.textContent = 'Скопировано'; }, fallback); return; } } catch (e) { /* ниже */ }
    fallback();
  }
  function renderPicker(p) {
    var root = $('view-profile'); root.replaceChildren();
    var u = usable(p), ids = heroIds(), total = ids.length, have = ids.filter(function (id) { return u[id]; }).length;
    var showLocked = store('showLocked') === '1';
    var head = el('div', 'pk-head');
    var back = el('button', 'btn ghost pk-back', '← Назад'); back.type = 'button';
    back.addEventListener('click', function () { markSeen(p); pickOpen = false; pickSel = null; pickNew = {}; renderProfile(); });
    head.append(back, el('div', 'pk-count', 'Доступно: ' + have + ' из ' + total));
    var lab = el('label', 'pk-check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = showLocked;
    cb.addEventListener('change', function () { store('showLocked', cb.checked ? '1' : '0'); renderPicker(p); });
    lab.append(cb, el('span', null, 'Показать неполученных'));
    var grid = el('div', 'pk-grid'), hint = el('div', 'pk-hint muted small', 'Нажмите на героя, чтобы узнать, как его выбрать.');
    var list = ids.filter(function (id) { return u[id] || showLocked; }).sort(function (a, b) { return (u[b] ? 1 : 0) - (u[a] ? 1 : 0) || (pickNew[b] ? 1 : 0) - (pickNew[a] ? 1 : 0) || (heroes[a].t || a).localeCompare(heroes[b].t || b, 'ru'); });
    list.forEach(function (id) {
      var h = heroes[id], b = el('button', 'pk-card' + (u[id] ? '' : ' locked') + (p.hero === id ? ' current' : '') + (pickSel === id ? ' sel' : '')); b.type = 'button';
      var tip = (h.t || id) + (u[id] ? (p.hero === id ? ' — сейчас на вас' : '') : ' — получить пока нельзя');
      b.title = tip; b.setAttribute('aria-label', tip);
      var sp = el('div', 'pk-sprite'); sp.appendChild(sprite(id, 'idle', h.d[0], fitZoom(h, 52, 52))); b.appendChild(sp);
      if (pickNew[id]) b.appendChild(el('span', 'pk-new', 'Новый'));
      if (!u[id]) b.appendChild(el('span', 'pk-lock', '🔒'));
      if (p.hero === id) b.appendChild(el('span', 'pk-cur', '✓'));
      b.addEventListener('mouseenter', function () { hint.textContent = tip; });
      b.addEventListener('focus', function () { hint.textContent = tip; });
      b.addEventListener('click', function () { pickSel = pickSel === id ? null : id; renderPicker(p); });
      grid.appendChild(b);
    });
    root.append(head, lab, hint);
    if (!list.length) root.appendChild(el('p', 'muted center', 'Пока нет доступных героев.'));
    var detailBox = null;
    if (pickSel && heroes[pickSel]) {
      var hs = heroes[pickSel], d = el('div', 'pk-detail'); detailBox = d;
      d.appendChild(el('div', 'pk-dt', hs.t || pickSel));
      if (!u[pickSel]) d.appendChild(el('div', 'pk-dn', 'Получить пока нельзя'));
      else if (p.hero === pickSel) d.appendChild(el('div', 'pk-dn', 'Сейчас на вас ✓'));
      else if (!snap.cc) d.appendChild(el('div', 'pk-dn', 'Смена героя командой в чате сейчас отключена стримером.'));
      else {
        var cmd = snap.cc + ' ' + (hs.t || pickSel);
        d.appendChild(el('div', 'pk-dn', 'Чтобы выбрать, напишите в чате:'));
        var code = el('code', 'pk-code', cmd), note = el('span', 'pk-note muted small', ''); note.codeEl = code;
        var cp = el('button', 'btn ghost pk-copy', 'Скопировать'); cp.type = 'button';
        cp.addEventListener('click', function () { copyText(cmd, note); });
        d.append(code, cp, note);
      }
    }
    if (detailBox) root.appendChild(detailBox);                              // описание выбранного героя — над сеткой, чтобы было видно без прокрутки
    root.appendChild(grid);
  }
  function me() {
    if (!snap || !viewerId) return null;
    var k = Object.keys(snap.players);
    for (var i = 0; i < k.length; i++) if (snap.players[k[i]].uid === viewerId) return snap.players[k[i]];
    return null;
  }

  /* ---------- спрайты ---------- */
  function heroDir(h, ang) {                      // ближайшее из направлений героя к углу (градусы, экран: y вниз)
    var best = h.d[0], bd = 1e9;
    h.d.forEach(function (n) { if (!(n in DIR_ANGLE)) return; var d = Math.abs(ang - DIR_ANGLE[n]) % 360; if (d > 180) d = 360 - d; if (d < bd) { bd = d; best = n; } });
    return best;
  }
  /** Обёртка нужного размера со спрайтом (kind: 'idle' | 'walk'); zoom — во сколько раз показывать. */
  function sprite(heroId, kind, dirName, zoom) {
    var h = heroes[heroId], w = el('div', 'sprw');
    if (!h) { w.style.width = '20px'; w.style.height = '30px'; return w; }
    var pack = h[kind], di = Math.max(0, h.d.indexOf(dirName)), dn = h.d[di];
    var frames = Math.max(1, (pack.fr && (pack.fr[dn] || pack.fr[h.d[0]])) || 1);
    w.style.width = Math.round(h.w * zoom) + 'px'; w.style.height = Math.round(h.h * zoom) + 'px';
    var s = el('div', 'spr');
    s.style.width = h.w + 'px'; s.style.height = h.h + 'px';
    s.style.transform = 'scale(' + zoom + ')';
    s.style.backgroundImage = 'url("heroes/' + heroId + '/' + pack.f + '")';
    s.style.backgroundPositionY = '-' + di * h.h + 'px';
    s.style.setProperty('--frames', String(frames));
    s.style.setProperty('--end', '-' + frames * h.w + 'px');
    s.style.setProperty('--dur', (frames / (h.fps || 12)).toFixed(3) + 's');
    w.appendChild(s);
    return w;
  }
  function fitZoom(h, maxH, maxW) { return Math.min((h.s || 1) * 1.0, maxH / h.h, maxW / h.w); }

  /* ---------- вкладка «Профиль» ---------- */
  var lastPickSig = '';
  function renderProfile() {
    var root = $('view-profile');
    if (pickOpen && root.firstChild && snap) { var m0 = me(); if (m0 && lastPickSig === [m0.mask, m0.hero, snap.cc, snap.hv, Object.keys(heroes).length].join('|')) return; }   // выбор аватара открыт и ничего не изменилось — не перерисовываем (иначе сбросится прокрутка и подсказка)
    var keepScroll = pickOpen ? root.scrollTop : 0;
    root.replaceChildren();
    if (!snap) { root.appendChild(emptyBox()); return; }
    var mine = me(), p = viewLogin && snap.players[viewLogin] ? snap.players[viewLogin] : mine;
    if (!p) {
      var box = el('div', 'center');
      if (!viewerId) {
        box.append(el('p', null, 'Чтобы увидеть свой профиль, поделитесь с расширением своим ником Twitch.'),
          el('p', 'muted small', 'Расширение узнает только ваш ник и ID — этого достаточно, чтобы найти ваш аватар.'));
        var b = el('button', 'btn', 'Показать мой профиль'); b.type = 'button';
        b.addEventListener('click', function () { if (ext && ext.actions && ext.actions.requestIdShare) ext.actions.requestIdShare(); });
        box.appendChild(b);
      } else {
        box.append(el('p', null, 'Вас пока нет ни на сцене, ни в топе.'), el('p', 'muted small', 'Напишите сообщение в чат — и ваш герой появится на сцене. Профиль появится здесь в течение минуты.'));
      }
      root.appendChild(box); return;
    }
    if (pickOpen && mine && p.login === mine.login && maskOk()) { renderPicker(p); lastPickSig = [p.mask, p.hero, snap.cc, snap.hv, Object.keys(heroes).length].join('|'); root.scrollTop = keepScroll; return; }
    pickOpen = false;
    var h = heroes[p.hero], card = el('div', 'card');
    if (viewLogin && snap.players[viewLogin] && (!mine || mine.login !== viewLogin)) {
      var back = el('button', 'btn ghost', viewerId ? '← Мой профиль' : '← Назад'); back.type = 'button';
      back.addEventListener('click', function () { viewLogin = null; renderProfile(); });
      card.appendChild(back);
    }
    var av = el('div', 'avatarbox');
    if (h) av.appendChild(sprite(p.hero, 'idle', h.d[0], fitZoom(h, 128, 150))); else av.appendChild(el('span', 'muted small', 'Героя ещё нет'));
    if (mine && p.login === mine.login && maskOk()) {                       // круглая кнопка с глазом: мои аватары (мигает, если открылся новый)
      var nw = newHeroes(p), eye = el('button', 'eye' + (Object.keys(nw).length ? ' blink' : '')); eye.type = 'button';
      eye.innerHTML = EYE; eye.title = Object.keys(nw).length ? 'Мои аватары — есть новый!' : 'Мои аватары'; eye.setAttribute('aria-label', eye.title);
      eye.addEventListener('click', function () { pickNew = nw; pickOpen = true; renderProfile(); });
      av.appendChild(eye);
    }
    var nick = el('div', 'nick', p.name); if (p.color) nick.style.color = p.color;
    var sub = el('div', 'row'); sub.append(el('span', 'lvl', 'lvl ' + p.level), el('span', 'muted', h ? h.t : ''));
    if (snap.stage.indexOf(p.login) >= 0) sub.appendChild(el('span', 'badge', 'на сцене'));
    var need = p.maxed ? Math.max(1, p.xp) : Math.max(1, p.need), pct = p.maxed ? 100 : Math.max(0, Math.min(100, p.xp / need * 100));
    var xp = el('div', 'xp'), tr = el('div', 'xp-track'), fill = el('div', 'xp-fill'); fill.style.width = pct + '%'; tr.appendChild(fill);
    xp.append(tr, el('div', 'xp-label', p.maxed ? 'Максимальный уровень' : 'Опыт: ' + p.xp + ' / ' + need));
    var facts = el('div', 'facts');
    facts.append(el('span', null, 'Место в топе'), el('span', null, p.rank > 0 ? '#' + p.rank : '—'),
      el('span', null, 'Всего опыта'), el('span', null, String(p.total)),
      el('span', null, 'Бонус опыта'), el('span', null, p.mult > 1 ? '×' + p.mult : 'нет'));
    card.append(av, nick, sub, xp, facts);
    var md = medals(p); if (md) card.appendChild(md);
    card.appendChild(bgControls()); applyBg();
    root.appendChild(card);
  }

  /* ---------- вкладка «Топ» ---------- */
  function renderTop() {
    var root = $('view-top'); root.replaceChildren();
    if (!snap || !snap.top.length) { root.appendChild(snap ? el('p', 'muted center', 'Топ пока пуст.') : emptyBox()); return; }
    var list = el('div', 'toplist'), mine = me();
    snap.top.forEach(function (login, i) {
      var p = snap.players[login], h = heroes[p.hero];
      var r = el('button', 'toprow' + (mine && mine.login === login ? ' me' : '')); r.type = 'button';
      var th = el('span', 'topthumb'); if (h) th.appendChild(sprite(p.hero, 'idle', h.d[0], fitZoom(h, 32, 32)));
      var nm = el('span', 'topname', p.name); if (p.color) nm.style.color = p.color;
      r.append(el('span', 'toprank', String(p.rank || i + 1)), th, nm, el('span', 'lvl', 'lvl ' + p.level));
      r.addEventListener('click', function () { viewLogin = login; setTab('profile'); });
      list.appendChild(r);
    });
    root.appendChild(list);
  }

  /* ---------- сцена внизу плеера: герои бродят сами (картина похожа на оверлей, но не совпадает с ним позиция в позицию) ---------- */
  var actors = {};            // login → { p, w, x, y, tx, ty, state, until, speed, zoom, node }
  var raf = 0, lastT = 0;
  function sceneSize() { var s = $('scene'); return { w: s.clientWidth || window.innerWidth || 600, h: s.clientHeight || 160 }; }
  function newTarget(a, sz) { a.tx = 30 + Math.random() * Math.max(10, sz.w - 60); a.ty = sz.h * 0.66 + Math.random() * sz.h * 0.32; }
  function setActorSprite(a, state, dirName) {
    var h = heroes[a.p.hero]; if (!h) return;
    if (a.state === state && a.dirName === dirName) return;
    a.state = state; a.dirName = dirName;
    var old = a.node.querySelector('.sprw'); if (old) old.remove();
    a.node.insertBefore(sprite(a.p.hero, state === 'walk' ? 'walk' : 'idle', dirName, a.zoom), a.node.firstChild);
  }
  function reconcileScene() {
    var scene = $('scene'), sz = sceneSize(), want = snap ? snap.stage : [], seen = {};
    want.forEach(function (login) {
      seen[login] = 1; var p = snap.players[login], a = actors[login], h = heroes[p.hero];
      if (!a) {
        a = actors[login] = { p: p, x: 30 + Math.random() * (sz.w - 60), y: sz.h * 0.66 + Math.random() * sz.h * 0.32, state: '', until: 0, zoom: h ? Math.min((h.s || 1) * 0.7, (sz.h * 0.5) / h.h, 110 / h.w) : 1, speed: (h ? h.sp : 80) * 0.45 };
        a.node = el('div', 'actor' + (me() && me().login === login ? ' me' : ''));
        a.tag = el('div', 'tag'); a.node.appendChild(a.tag);
        a.node.addEventListener('click', function () { viewLogin = login; setTab('profile'); });
        scene.appendChild(a.node); newTarget(a, sz);
        setActorSprite(a, 'idle', h ? h.d[0] : '');
      }
      a.p = p; a.tag.textContent = p.name; var lv = el('i', null, String(p.level)); a.tag.appendChild(lv);
      a.node.classList.toggle('me', !!(me() && me().login === login));
      if (p.color) a.tag.style.color = p.color; else a.tag.style.color = '';
    });
    Object.keys(actors).forEach(function (l) { if (!seen[l]) { actors[l].node.remove(); delete actors[l]; } });
  }
  function frame(t) {
    raf = 0; if ($('panel').hidden) return;
    var dt = Math.min(0.1, (t - (lastT || t)) / 1000); lastT = t;
    var sz = sceneSize();
    Object.keys(actors).forEach(function (l) {
      var a = actors[l], h = heroes[a.p.hero]; if (!h) return;
      if (a.state === 'idle') {
        if (t >= a.until) { newTarget(a, sz); var ang = Math.atan2(a.ty - a.y, a.tx - a.x) * 180 / Math.PI; setActorSprite(a, 'walk', heroDir(h, ang)); }
      } else {
        var dx = a.tx - a.x, dy = a.ty - a.y, d = Math.sqrt(dx * dx + dy * dy), step = a.speed * dt;
        if (d <= step) { a.x = a.tx; a.y = a.ty; a.until = t + 800 + Math.random() * 3500; setActorSprite(a, 'idle', h.d[0]); }
        else { a.x += dx / d * step; a.y += dy / d * step; }
      }
      a.node.style.left = Math.round(a.x - h.w * a.zoom / 2) + 'px';
      a.node.style.top = Math.round(a.y - h.h * a.zoom) + 'px';
      a.node.style.zIndex = String(Math.round(a.y));
    });
    raf = requestAnimationFrame(frame);
  }
  function startScene() { reconcileScene(); if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); } }

  /* ---------- общее ---------- */
  function setTab(name) {
    tab = name;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { var on = b.getAttribute('data-tab') === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) { v.classList.toggle('active', v.id === 'view-' + name); });
    renderAll();
  }
  function renderFoot() {
    var f = $('foot');
    if (!snap) { f.textContent = 'Ждём данные от стримера…'; return; }
    var age = Math.max(0, Math.round((Date.now() - snap.receivedAt) / 1000));
    if (demo) { f.textContent = 'ДЕМО: данные выдуманы'; return; }
    f.textContent = (snap.live ? 'Стрим идёт · ' : '') + 'обновлено ' + (age < 5 ? 'только что' : age < 90 ? age + ' с назад' : Math.round(age / 60) + ' мин назад');
  }
  function renderAll() {
    if (tab === 'profile') renderProfile(); else if (tab === 'awards') renderAwards(); else renderTop();
    if ($('panel').hidden) { $('scene').hidden = true; } else { $('scene').hidden = false; startScene(); }
    renderFoot();
  }
  function setCollapsed(c) { $('panel').hidden = c; $('pill').hidden = !c; $('scene').hidden = c; store('collapsed', c ? '1' : '0'); renderAll(); }


  /* ---------- помощь и демо-режим ---------- */
  /* Пока стример не в эфире, данных нет. Чтобы любой зритель (и проверяющий) мог посмотреть, как это работает, есть «Демо»:
   * выдуманные зрители бегают по сцене, «пишут в чат», набирают опыт. Всё считается тут же, в браузере; ничего не отправляется и не сохраняется. */
  var demo = null;            // { t:таймер, n:счётчик выдуманных, saveCat }
  var DEMO_NAMES = ['Мурка', 'Бублик', 'Тень', 'Лесник', 'Ягода', 'Север', 'Комета', 'Пират', 'Ласточка', 'Гном', 'Феникс', 'Орех', 'Шторм', 'Звёздочка', 'Барсик', 'Рыцарь', 'Искра', 'Дымок', 'Малыш', 'Туман', 'Ёж', 'Лис', 'Гром', 'Берёза'];
  var DEMO_COLORS = ['#ff6b6b', '#4ade80', '#60a5fa', '#fbbf24', '#c084fc', '#f472b6', '#34d399', '#fb923c'];
  function emptyBox() {
    var box = el('div', 'center');
    box.appendChild(el('p', null, 'Здесь появятся герои зрителей этого канала.'));
    box.appendChild(el('p', 'muted small', 'Сейчас от стримера нет данных: вероятно, трансляция не идёт. Пока можно посмотреть, как всё работает, в демо-режиме.'));
    var b = el('button', 'btn', 'Включить демо'); b.type = 'button'; b.addEventListener('click', function () { setDemo(true); });
    box.appendChild(b);
    var ol = el('ol', 'howto');
    ['Пишите в чат стрима — получите героя, опыт и уровень.', 'Вкладка «Профиль»: ваш герой, уровень, шкала опыта и место в топе.', '«Топ»: лучшие зрители; нажмите на любого — откроется его профиль.', '«События»: награды и медали канала.', 'Кнопка «Фон» включает сцену с героями под плеером; нажмите на героя на сцене — увидите, кто это.']
      .forEach(function (t) { ol.appendChild(el('li', null, t)); });
    box.appendChild(ol);
    return box;
  }
  function demoMask() { var n = heroIds().length, s = '', g = Math.ceil(n / 24); for (var i = 0; i < g; i++) s += 'ffffff'; return s; }
  function demoPlayer(i, you) {
    var ids = heroIds(), name = you ? 'Вы (демо)' : DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? String(Math.floor(i / DEMO_NAMES.length) + 1) : '');
    var lvl = you ? 3 : 1 + Math.floor(Math.random() * 14), need = 100 + lvl * 40;
    return { login: you ? 'demo_you' : 'demo' + i, name: name, hero: ids.length ? ids[(i * 7 + (you ? 0 : 3)) % ids.length] : '', level: lvl, xp: Math.floor(Math.random() * need), need: need, maxed: false,
      color: you ? '' : DEMO_COLORS[i % DEMO_COLORS.length], uid: you ? 'demo' : '', total: lvl * 120 + Math.floor(Math.random() * 90), rank: 0, mult: 1, awards: [], mask: demoMask() };
  }
  function demoRebuild() {
    var P = demo.players, logins = Object.keys(P);
    logins.sort(function (a, b) { return P[b].total - P[a].total; });
    logins.forEach(function (l, i) { P[l].rank = i + 1; });
    var stage = demo.stage.filter(function (l) { return P[l]; });
    snap = { t: Date.now(), live: true, hv: heroHash(heroIds()), hn: heroIds().length, cc: '!hero', players: P, stage: stage, top: logins.slice(0, 10), receivedAt: Date.now() };
    renderAll();
  }
  function demoChat(l) {                                   // «сообщение в чате»: опыт растёт, иногда новый уровень
    var p = demo.players[l]; if (!p) return;
    p.xp += 8 + Math.floor(Math.random() * 20); p.total += 12;
    if (p.xp >= p.need) { p.xp -= p.need; p.level++; p.need = 100 + p.level * 40; }
  }
  function demoJoin() {                                    // новый зритель написал в чат — его герой выходит на сцену
    var i = demo.n++, p = demoPlayer(i, false); demo.players[p.login] = p; demo.stage.push(p.login);
    if (demo.stage.length > 14) demo.stage.shift();
  }
  function demoTick() {
    var l = Object.keys(demo.players);
    for (var k = 0; k < 3; k++) demoChat(l[Math.floor(Math.random() * l.length)]);
    if (Math.random() < 0.35) demoJoin();
    demoRebuild();
  }
  function setDemo(on) {
    if (!!demo === !!on) return;
    if (on) {
      if (!Object.keys(heroes).length) { var tries = 0, w = setInterval(function () { if (Object.keys(heroes).length || ++tries > 20) { clearInterval(w); if (Object.keys(heroes).length) setDemo(true); } }, 250); return; }
      demo = { n: 0, players: {}, stage: [], saveCat: awardCat, saveSnap: snap, saveViewer: viewerId, saveLogin: viewLogin };
      var you = demoPlayer(0, true); demo.players[you.login] = you; demo.stage.push(you.login);
      for (var i = 1; i <= 7; i++) { var p = demoPlayer(i, false); demo.players[p.login] = p; demo.stage.push(p.login); }
      demo.n = 8; viewerId = 'demo'; viewLogin = null;
      awardCat = { a1: { title: 'Первый шаг', desc: 'Написал первое сообщение в чате (пример награды)', icon: '', howTo: 'Напишите в чат', open: true, issued: 0 }, a2: { title: 'Завсегдатай', desc: 'Пример награды за активность', icon: '', howTo: 'Заходите на стримы', open: true, issued: 0 } };
      you = demo.players.demo_you; you.awards = ['a1'];
      demo.t = setInterval(demoTick, 1500);
      $('demoNote').hidden = false; $('spamBtn').hidden = false; $('demoBtn').classList.add('on'); $('demoBtn').textContent = 'Выйти из демо';
      setCollapsed(false); demoRebuild();
    } else {
      clearInterval(demo.t); awardCat = demo.saveCat; snap = demo.saveSnap; viewerId = demo.saveViewer; viewLogin = demo.saveLogin; demo = null;
      $('demoNote').hidden = true; $('spamBtn').hidden = true; $('demoBtn').classList.remove('on'); $('demoBtn').textContent = 'Демо';
      renderAll();
    }
  }
  function demoSpam() {                                    // всплеск сообщений: 6 новых зрителей и общий рост опыта
    if (!demo) return;
    for (var i = 0; i < 6; i++) demoJoin();
    Object.keys(demo.players).forEach(function (l) { if (Math.random() < 0.6) demoChat(l); });
    demoRebuild();
  }

  function onMessage(target, contentType, message) {
    var o; try { o = JSON.parse(message); } catch (e) { return; }
    var cat = parseCatalog(o);
    if (cat) { mergeCatalog(cat, o.r === 1); renderAll(); return; }
    var s = parseSnapshot(o); if (!s) return;
    if (demo) setDemo(false);                                // пришли настоящие данные — демо выключается
    snap = s; renderAll();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.addEventListener('click', function () { if (b.getAttribute('data-tab') === 'profile') viewLogin = null; setTab(b.getAttribute('data-tab')); }); });
    $('bgbtn').addEventListener('click', function () { setBg(!bgOn); });
    applyBg();
    $('demoBtn').addEventListener('click', function () { setDemo(!demo); });
    $('spamBtn').addEventListener('click', demoSpam);
    $('close').addEventListener('click', function () { setCollapsed(true); });
    $('pill').addEventListener('click', function () { setCollapsed(false); });
    if (store('collapsed') === '1') setCollapsed(true);
    fetch('heroes.json').then(function (r) { return r.json(); }).then(function (j) { heroes = j || {}; renderAll(); }).catch(function () { /* без картинок остаются подписи */ });
    if (ext) {
      ext.onAuthorized(function () { viewerId = (ext.viewer && ext.viewer.id) ? String(ext.viewer.id) : ''; renderAll(); });
      ext.listen('broadcast', onMessage);
    }
    setInterval(renderFoot, 5000);
    renderAll();
  }
  init();
})();
