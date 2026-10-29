// «Хроники» — журнал игр и фильмов. Данные: /api/chronicles, постеры: /uploads/chronicles/.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sec = $('tab-chronicles'); if (!sec) return;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NOUN = { game: ['игра', 'игры', 'игр'], movie: ['фильм', 'фильма', 'фильмов'] };
  const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return f[a > 10 && a < 20 ? 2 : b > 1 && b < 5 ? 1 : b === 1 ? 0 : 2]; };
  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));
  const KEY = 'ovChrTab', SKEY = 'ovChrState';
  const VIEWS = [
    ['poster', 'Сетка'], ['row', 'Список'], ['cine', 'Витрина'], ['review', 'Рецензии'], ['table', 'Таблица'], ['duo', 'Две колонки'],
  ];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let sources = {}; let syncedTab = {}; let items = []; let tab = 'game'; let view = 'cine'; let editing = null; let posterFile = null; let posterCleared = false; let loaded = false;
  // в «Играх» только два вида, в «Кино» все
  const viewsFor = (t) => t === 'game' ? VIEWS.filter((v) => v[0] === 'poster' || v[0] === 'cine') : VIEWS;
  const sv = { rating: null, chatRating: null };
  if (['game', 'movie'].includes(lsGet(KEY))) tab = lsGet(KEY);
  // Настройки у «Игр» и «Кино» раздельные: вид, оценка чата, сортировка и фильтры хранятся для каждой вкладки отдельно
  const DEF = { view: 'cine', chat: true, sort: 'new', genre: '', rf: '', origin: '', q: '' };
  const S = { game: { ...DEF }, movie: { ...DEF } };
  try {
    const raw = JSON.parse(lsGet(SKEY) || 'null') || {};
    ['game', 'movie'].forEach((t) => {
      const r = raw[t] || {};
      if (viewsFor(t).some((v) => v[0] === r.view)) S[t].view = r.view;
      if (typeof r.chat === 'boolean') S[t].chat = r.chat;
      if (typeof r.sort === 'string') S[t].sort = r.sort;
    });
  } catch (e) { /* настройки по умолчанию */ }
  const saveState = () => lsSet(SKEY, JSON.stringify({ game: { view: S.game.view, chat: S.game.chat, sort: S.game.sort }, movie: { view: S.movie.view, chat: S.movie.chat, sort: S.movie.sort } }));
  let showChat = tab !== 'game' && S[tab].chat; view = S[tab].view; // в «Играх» оценки чата нет
  function captureControls() { const s = S[tab]; s.q = $('chrSearch').value; s.sort = $('chrSort').value; s.genre = $('chrGenre').value; s.rf = $('chrRatingF').value; s.origin = $('chrOrigin').value; saveState(); }
  function useTab(t) { if (t === tab) return; captureControls(); tab = t; lsSet(KEY, tab); view = S[t].view; showChat = t !== 'game' && S[t].chat; }

  const saved = (t, k) => { const el = $('chrSaved'); el.textContent = t; el.className = 'ui3-saved' + (k ? ' ' + k : ''); if (t && k === 'ok') setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, 2500); };
  async function api(url, opt) {
    const r = await fetch(url, opt);
    let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok || !d || d.success === false) throw new Error((d && d.error) || 'Ошибка сервера (' + r.status + ')');
    return d;
  }
  async function load() {
    try { const d = await api('/api/chronicles'); items = d.items || []; sources = d.sources || {}; loaded = true; render(); autoSync(); pollVote(); }
    catch (e) { $('chrEmpty').hidden = false; $('chrEmpty').textContent = 'Не удалось загрузить: ' + e.message; }
  }

  /* ---------- фильтры ---------- */
  function visible() {
    const s0 = S[tab]; const q = s0.q.trim().toLowerCase(), o = s0.origin, g = s0.genre, rf = s0.rf, sort = s0.sort;
    let list = items.filter((it) => it.type === tab);
    if (o) list = list.filter((it) => (it.origin || '—') === o);
    if (g) list = list.filter((it) => (it.genres || []).includes(g));
    if (rf) {
      list = list.filter((it) => {
        const r = it.rating;
        if (rf === 'none') return r == null;
        if (r == null) return false;
        if (rf === 'mid') return r >= 5 && r < 7;
        if (rf === 'low') return r < 5;
        return r >= Number(rf);
      });
    }
    if (q) list = list.filter((it) => [it.title, it.comment, it.by, it.origin, it.extra, (it.tags || []).join(' '), (it.genres || []).join(' '), it.year].join(' ').toLowerCase().includes(q));
    const nul = (k) => (a, b) => (b[k] == null) - (a[k] == null);
    const cmp = {
      new: (a, b) => items.indexOf(a) - items.indexOf(b),
      old: (a, b) => items.indexOf(b) - items.indexOf(a),
      rating: (a, b) => nul('rating')(a, b) || b.rating - a.rating,
      ratingAsc: (a, b) => nul('rating')(a, b) || a.rating - b.rating,
      chat: (a, b) => nul('chatRating')(a, b) || b.chatRating - a.chatRating,
      title: (a, b) => a.title.localeCompare(b.title, 'ru'),
      hours: (a, b) => (b.hours || 0) - (a.hours || 0),
    }[sort];
    return list.slice().sort(cmp);
  }

  function renderStats() {
    const mine = items.filter((it) => it.type === tab);
    const avgOf = (k) => { const r = mine.filter((it) => it[k] != null && it[k] <= 10); return r.length ? Math.round(r.reduce((s, it) => s + it[k], 0) / r.length * 10) / 10 : null; };
    const rated = mine.filter((it) => it.rating != null && it.rating <= 10);
    const best = rated.length ? Math.max(...rated.map((it) => it.rating)) : null;
    const cells = [[mine.length, plural(mine.length, NOUN[tab]) + ' в журнале']];
    if (avgOf('rating') != null) cells.push([fmt(avgOf('rating')), 'моя средняя']);
    if (showChat && avgOf('chatRating') != null) cells.push([fmt(avgOf('chatRating')), 'средняя чата']);
    if (best != null) cells.push([fmt(best) + '/10', 'лучшая оценка']);
    if (tab === 'game') { const h = mine.reduce((s, it) => s + (it.hours || 0), 0); if (h) cells.push([fmt(Math.round(h * 10) / 10) + ' ч', 'всего наиграно']); }
    $('chrStats').innerHTML = cells.map((c) => '<div class="chr-stat"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>').join('');
  }

  /* ---------- карточки ---------- */
  const STARS = '★★★★★★★★★★';
  const stars = (v) => '<span class="chr-st' + (v >= 10 ? ' gold' : '') + '" style="--sc:' + (v >= 10 ? '#f6d86a' : v >= 7 ? '#3ecf8e' : v >= 5 ? '#f0883e' : '#e5484d') + ';--v:' + (v == null ? 0 : Math.min(100, Math.max(0, v * 10))) + '" title="' + (v == null ? 'Без оценки' : esc(fmt(v)) + ' из 10') + '">' + STARS + '</span>';
  const ratingLine = (lbl, v) => '<div class="chr-rl"><span>' + lbl + '</span>' + stars(v) + '<b>' + (v == null ? '—' : esc(fmt(v))) + '</b></div>';
  const ratingClass = (r) => (r == null ? 'none' : r >= 10 ? 'gold' : r >= 7 ? 'good' : r >= 5 ? 'mid' : 'bad');
  const posterUrl = (it) => (it.poster ? '/uploads/chronicles/' + encodeURIComponent(it.poster) : '');
  const posterImg = (it) => (it.poster ? '<img loading="lazy" alt="" src="' + posterUrl(it) + '">' : '<span class="chr-ph">' + esc((it.title || '?').trim().charAt(0).toUpperCase()) + '</span>');
  const buildActs = () => '<div class="chr-acts">' + (showChat ? '<button type="button" class="chr-ab" data-a="vote" title="Запустить в чате опрос «Оценка чата» (1-2, 3-4, 5-6, 7-8, 9-10)" aria-label="Голосование чата">🗳</button>' : '') + '<button type="button" class="chr-ab" data-a="tg" title="Отправить карточку в Telegram-канал" aria-label="В Telegram">✈</button><button type="button" class="chr-ab" data-a="edit" title="Редактировать" aria-label="Редактировать">✎</button><button type="button" class="chr-ab" data-a="del" title="Удалить" aria-label="Удалить">🗑</button></div>';
  let acts = buildActs();
  const ring = (v, s, lbl) => {
    const ok = v != null; const n = ok ? Math.min(10, v) : 0;
    const cls = !ok ? 'none' : n >= 9 ? 'top' : n >= 7 ? 'good' : n >= 5 ? 'mid' : 'bad';
    return '<div class="chr-rg"><div class="chr-ring ' + cls + '" style="--p:' + n * 10 + ';--s:' + s + 'px" title="' + (ok ? esc(fmt(n)) + ' из 10' : 'Без оценки') + '"><b>' + (ok ? esc(fmt(n)) : '—') + '</b></div>' + (lbl ? '<span>' + lbl + '</span>' : '') + '</div>';
  };
  const rings = (it, big) => '<div class="chr-rings">' + ring(it.rating, big) + '</div>';
  const badge = (it) => '<div class="chr-rate ' + ratingClass(it.rating) + '" title="Моя оценка">' + (it.rating == null ? '—' : '★ ' + esc(fmt(it.rating))) + '</div>';

  function parts(it) {
    const meta = [];
    if (it.year) meta.push(esc(it.year));
    if ((it.genres || []).length) meta.push(esc(it.genres.join(', ')));
    if (it.type === 'game' && it.hours != null) meta.push(esc(fmt(it.hours)) + ' ч');
    if (it.extra) meta.push(esc(it.extra));
    const chips = [];
    if (it.origin) chips.push('<span class="chr-chip o">' + esc(it.origin) + '</span>');
    (it.tags || []).forEach((t) => chips.push('<span class="chr-chip">' + esc(t) + '</span>'));
    const by = it.by ? 'Заказал <b>' + esc(it.by) + '</b>' + (it.percent != null ? ' · лот ' + esc(fmt(it.percent)) + '%' : '') : (it.percent != null ? 'Лот ' + esc(fmt(it.percent)) + '%' : '');
    const long = (it.comment || '').length > 170;
    return {
      meta: meta.join(' · '),
      chips: chips.length ? '<div class="chr-chips">' + chips.join('') + '</div>' : '',
      by: by ? '<div class="chr-by">' + by + '</div>' : '',
      link: it.link ? '<a class="chr-link" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">▶ Запись стрима</a>' : '',
      comment: (clamp) => (it.comment ? '<p class="chr-comment' + (clamp && long ? ' clamp' : '') + '">' + esc(it.comment) + '</p>' + (clamp && long ? '<button type="button" class="chr-more" data-a="more">Показать полностью</button>' : '') : ''),
    };
  }

  function card(it) {
    const p = parts(it); const id = ' data-id="' + esc(it.id) + '"';
    const rl = ratingLine('Я', it.rating) + (showChat ? ratingLine('Чат', it.chatRating) : '');
    if (view === 'poster') {
      return '<article class="chr-it chr-pv"' + id + '>' + posterImg(it) + '<div class="chr-pr">' + ring(it.rating, 46) + '</div>' + acts +
        '<div class="chr-ov"><div class="chr-meta">' + (p.meta || '&nbsp;') + '</div><h3 class="chr-title">' + esc(it.title) + '</h3>' + rl +
        (it.comment ? '<p class="chr-comment clamp3" title="' + esc(it.comment) + '">' + esc(it.comment) + '</p>' : '') +
        (it.by ? '<div class="chr-by">' + p.by + '</div>' : '') + '</div></article>';
    }
    if (view === 'table') {
      return '<article class="chr-it chr-tr"' + id + '><div class="chr-tp">' + posterImg(it) + '</div>' +
        '<div class="chr-tt"><h3 class="chr-title">' + esc(it.title) + '</h3><div class="chr-meta">' + esc([it.year, it.type === 'game' && it.hours != null ? fmt(it.hours) + ' ч' : ''].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="chr-chips">' + (it.genres || []).map((g) => '<span class="chr-chip">' + esc(g) + '</span>').join('') + '</div>' +
        '<div class="chr-tc">' + stars(it.rating) + '<b>' + (it.rating == null ? '—' : esc(fmt(it.rating))) + '</b></div>' +
        (showChat ? '<div class="chr-tc">' + stars(it.chatRating) + '<b>' + (it.chatRating == null ? '—' : esc(fmt(it.chatRating))) + '</b></div>' : '') +
        '<div class="chr-tcm" data-a="more" title="Нажми, чтобы развернуть">' + esc(it.comment || '') + '</div>' + acts + '</article>';
    }
    if (view === 'review') {
      return '<article class="chr-it chr-rv"' + id + '><div class="chr-rvp">' + posterImg(it) + '</div><div class="chr-rvb">' +
        '<div class="chr-rvh"><div><div class="chr-meta">' + (it.type === 'game' ? 'Игра' : 'Фильм') + (p.meta ? ' · ' + p.meta : '') + '</div><h3 class="chr-title">' + esc(it.title) + '</h3></div>' + rings(it, 72) + '</div>' +
        '<div class="chr-rvr">' + ratingLine('Моя оценка', it.rating) + (showChat ? ratingLine('Оценка чата', it.chatRating) : '') + '</div>' +
        (it.comment ? '<blockquote class="chr-quote">' + esc(it.comment) + '</blockquote>' : '') + p.chips + p.by + p.link + '</div>' + acts + '</article>';
    }
    if (view === 'duo') {
      return '<article class="chr-it chr-du"' + id + '><div class="chr-dup">' + posterImg(it) + '</div><div class="chr-dub">' +
        '<h3 class="chr-title">' + esc(it.title) + '</h3><div class="chr-meta">' + (p.meta || '&nbsp;') + '</div>' + rl +
        (it.comment ? '<p class="chr-comment clamp3" title="' + esc(it.comment) + '">' + esc(it.comment) + '</p>' : '') + '</div>' + acts + '</article>';
    }
    if (view === 'cine') {
      return '<article class="chr-it chr-cn"' + id + '><div class="chr-cnbg" style="background-image:url(\'' + posterUrl(it) + '\')"></div><div class="chr-cnp">' + posterImg(it) + '</div><div class="chr-cnb">' +
        '<div class="chr-cnh"><h3 class="chr-title">' + esc(it.title) + '</h3>' + rings(it, 72) + '</div>' +
        '<div class="chr-meta">' + (p.meta || '&nbsp;') + '</div>' + rl + p.comment(true) + p.chips + p.by + p.link + '</div>' + acts + '</article>';
    }
    // row — «Лента»
    return '<article class="chr-it chr-rw"' + id + '><div class="chr-rwp">' + posterImg(it) + '</div><div class="chr-rwb">' +
      '<div class="chr-rwh"><h3 class="chr-title">' + esc(it.title) + '</h3>' + p.by + '</div><div class="chr-meta">' + (p.meta || '&nbsp;') + '</div>' +
      '<div class="chr-rls">' + rl + '</div>' + p.comment(true) + p.chips + p.link + '</div>' + rings(it, 64) + acts + '</article>';
  }

  function fillSelects() {
    const mine = items.filter((it) => it.type === tab);
    const fill = (id, label, set) => {
      const sel = $(id), cur = id === 'chrGenre' ? S[tab].genre : S[tab].origin;
      sel.innerHTML = '<option value="">' + label + '</option>' + set.map((o) => '<option>' + esc(o) + '</option>').join('');
      sel.value = set.includes(cur) ? cur : '';
    };
    fill('chrOrigin', 'Любой источник', [...new Set(mine.map((it) => it.origin || '—'))].sort((a, b) => a.localeCompare(b, 'ru')));
    fill('chrGenre', 'Любой жанр', [...new Set(mine.flatMap((it) => it.genres || []))].sort((a, b) => a.localeCompare(b, 'ru')));
    const all = [...new Set(['Аукцион', 'Респект', 'Личное пожелание', ...items.map((it) => it.origin).filter(Boolean)])];
    $('chrOriginList').innerHTML = all.map((o) => '<option value="' + esc(o) + '">').join('');
    const gs = [...new Set(items.flatMap((it) => it.genres || []))].sort((a, b) => a.localeCompare(b, 'ru'));
    $('chrGenreList').innerHTML = gs.map((o) => '<option value="' + esc(o) + '">').join('');
  }

  function renderViews() {
    $('chrViews').innerHTML = '<span class="chr-vl">Вид</span>' + viewsFor(tab).map((v) => '<button type="button" data-v="' + v[0] + '" class="' + (v[0] === view ? 'on' : '') + '">' + v[1] + '</button>').join('') +
      (tab === 'game' ? '' : '<label class="chr-chatopt" title="Показывать оценку чата в списке и в форме"><input type="checkbox" id="chrShowChat"' + (showChat ? ' checked' : '') + '> Оценка чата</label>');
    const o = $('chrSort').querySelector('option[value="chat"]'); if (o) { o.hidden = !showChat; o.disabled = !showChat; }
    if (!showChat && S[tab].sort === 'chat') S[tab].sort = 'new';
    $('chrChatS').closest('.field').hidden = !showChat;
  }

  function render() {
    $('chrCntGame').textContent = items.filter((it) => it.type === 'game').length;
    $('chrCntMovie').textContent = items.filter((it) => it.type === 'movie').length;
    sec.querySelectorAll('#chrTabs span').forEach((s) => s.classList.toggle('on', s.dataset.t === tab));
    fillSelects(); renderStats(); renderViews();
    $('chrSearch').value = S[tab].q; $('chrSort').value = S[tab].sort; $('chrRatingF').value = S[tab].rf;
    S[tab].genre = $('chrGenre').value; S[tab].origin = $('chrOrigin').value;
    $('chrSync').hidden = !sources[tab];
    const list = visible(); acts = buildActs();
    const g = $('chrGrid');
    g.className = 'chr-list v-' + view + (showChat ? '' : ' no-chat');
    g.innerHTML = (view === 'table' && list.length ? '<div class="chr-th"><span></span><span>Название</span><span>Жанр</span><span>Я</span>' + (showChat ? '<span>Чат</span>' : '') + '<span>Рецензия</span></div>' : '') + list.map(card).join('');
    const e = $('chrEmpty');
    if (!list.length) {
      e.hidden = false;
      e.innerHTML = items.some((it) => it.type === tab) ? 'Ничего не найдено. Измени поиск или фильтры.' : 'Здесь пока пусто. Нажми «+ Добавить» и внеси ' + (tab === 'game' ? 'первую пройденную игру' : 'первый просмотренный фильм') + '.';
    } else e.hidden = true;
  }

  /* ---------- звёзды в форме ---------- */
  function buildStarInput(el) {
    el.tabIndex = 0; el.setAttribute('role', 'slider'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '10');
    let z = '';
    for (let i = 1; i <= 20; i += 1) z += '<u data-v="' + (i / 2) + '"></u>';
    el.innerHTML = '<span class="chr-st big">' + STARS + '</span><div class="chr-zones">' + z + '</div>';
    const st = el.querySelector('.chr-st'), key = el.dataset.key, lab = $(key === 'rating' ? 'chrRatingV' : 'chrChatV');
    const paint = (v) => { st.style.setProperty('--v', v == null ? 0 : v * 10); };
    const set = (v) => { sv[key] = v; paint(v); lab.textContent = v == null ? '—' : fmt(v) + ' / 10'; el.setAttribute('aria-valuenow', v == null ? '' : String(v)); };
    el._set = set;
    el.addEventListener('mouseover', (e) => { const u = e.target.closest('u'); if (u) paint(Number(u.dataset.v)); });
    el.addEventListener('mouseleave', () => paint(sv[key]));
    el.addEventListener('click', (e) => { const u = e.target.closest('u'); if (!u) return; const v = Number(u.dataset.v); set(sv[key] === v ? null : v); });
    el.addEventListener('keydown', (e) => {
      const cur = sv[key] == null ? 0 : sv[key];
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(Math.min(10, cur + 0.5)); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(cur <= 0.5 ? null : cur - 0.5); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); set(null); }
    });
  }

  /* ---------- форма ---------- */
  const F = { title: 'chrTitle', year: 'chrYear', hours: 'chrHours', origin: 'chrOriginIn', by: 'chrBy', percent: 'chrPercent', extra: 'chrExtra', link: 'chrLink', comment: 'chrComment' };
  function setType(t) {
    $('chrType').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === t));
    $('chrHoursWrap').hidden = t !== 'game';
  }
  const curType = () => $('chrType').querySelector('button.on').dataset.v;
  function showPoster(url) {
    $('chrPosterPrev').innerHTML = url ? '<img alt="" src="' + esc(url) + '">' : '<span>Нет постера</span>';
    $('chrPosterDel').hidden = !url;
  }
  function openForm(it) {
    editing = it ? it.id : null; posterFile = null; posterCleared = false;
    $('chrDlgTitle').textContent = it ? 'Редактировать запись' : 'Новая запись';
    setType(it ? it.type : tab);
    Object.keys(F).forEach((k) => { $(F[k]).value = it && it[k] != null ? it[k] : ''; });
    $('chrTags').value = it ? (it.tags || []).join(', ') : '';
    $('chrGenres').value = it ? (it.genres || []).join(', ') : '';
    $('chrRatingS')._set(it && it.rating != null ? Math.min(10, it.rating) : null);
    $('chrChatS')._set(it && it.chatRating != null ? it.chatRating : null);
    showPoster(it && it.poster ? posterUrl(it) : '');
    $('chrPosterFile').value = ''; $('chrPosterUrl').value = '';
    $('chrMsg').textContent = ''; $('chrMsg').className = 'form-message';
    $('chrModal').hidden = false;
    setTimeout(() => $('chrTitle').focus(), 30);
  }
  function closeForm() { $('chrModal').hidden = true; }

  async function submit() {
    const msg = $('chrMsg'); const btn = $('chrSave');
    const title = $('chrTitle').value.trim();
    if (!title) { msg.textContent = 'Укажи название.'; msg.className = 'form-message error'; $('chrTitle').focus(); return; }
    const type = curType();
    const body = { type, title, tags: $('chrTags').value, genres: $('chrGenres').value, rating: sv.rating == null ? '' : sv.rating, chatRating: sv.chatRating == null ? '' : sv.chatRating };
    ['year', 'origin', 'by', 'percent', 'extra', 'link', 'comment'].forEach((k) => { body[k] = $(F[k]).value; });
    if (type === 'game') body.hours = $('chrHours').value;
    if (editing) body.id = editing;
    if (posterCleared && !posterFile && !$('chrPosterUrl').value.trim()) body.poster = '';
    btn.disabled = true; msg.textContent = 'Сохраняем…'; msg.className = 'form-message';
    let warn = '';
    try {
      let it = (await api('/api/chronicles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).item;
      const url = $('chrPosterUrl').value.trim();
      if (posterFile) {
        const fd = new FormData(); fd.append('poster', posterFile);
        it = (await api('/api/chronicles/' + encodeURIComponent(it.id) + '/poster', { method: 'POST', body: fd })).item;
      } else if (url) {
        try { it = (await api('/api/chronicles/' + encodeURIComponent(it.id) + '/poster-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })).item; }
        catch (e) { warn = e.message; }
      }
      const i = items.findIndex((x) => x.id === it.id);
      if (i >= 0) items[i] = it; else items.unshift(it);
      useTab(it.type);
      closeForm(); render(); saved(warn ? 'Сохранено, но постер не загрузился: ' + warn : 'Сохранено', warn ? '' : 'ok');
    } catch (e) { msg.textContent = e.message; msg.className = 'form-message error'; }
    btn.disabled = false;
  }

  async function del(it) {
    const ok = window.ui3Confirm ? await window.ui3Confirm('Удалить «' + it.title + '» из хроник?') : window.confirm('Удалить «' + it.title + '»?');
    if (!ok) return;
    try { await api('/api/chronicles/' + encodeURIComponent(it.id), { method: 'DELETE' }); items = items.filter((x) => x.id !== it.id); render(); saved('Удалено', 'ok'); }
    catch (e) { saved(e.message, ''); }
  }


  /* ---------- импорт / синхронизация ---------- */
  const imp = { token: '', url: '', headers: [], mapping: {}, labels: {}, sample: [], type: 'game' };
  const impMsg = (t, k) => { $('chrImpMsg').textContent = t || ''; $('chrImpMsg').className = 'form-message' + (k ? ' ' + k : ''); };
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  function impStep(n) {
    $('chrImpStep1').hidden = n !== 1; $('chrImpStep2').hidden = n !== 2;
    $('chrImpBack').hidden = n !== 2; $('chrImpRun').hidden = n !== 2;
    $('chrImpRemWrap').hidden = !imp.url;
  }
  function impType(t) { imp.type = t; $('chrImpType').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === t)); showSrc(); }
  function showSrc() {
    const el = $('chrImpSrc'); const s = sources[imp.type];
    if (!s) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = 'Подключена таблица для ' + (imp.type === 'game' ? 'игр' : 'фильмов') + ': <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">открыть</a> · <button type="button" class="btn-tiny" id="chrImpForget">Отключить</button>';
    $('chrImpForget').addEventListener('click', async () => {
      try { sources = (await api('/api/chronicles/source/' + imp.type, { method: 'DELETE' })).sources || {}; showSrc(); render(); } catch (e) { impMsg(e.message, 'error'); }
    });
  }
  function openImport() {
    imp.token = ''; imp.url = '';
    $('chrImpUrl').value = ''; $('chrImpFile').value = ''; impMsg('');
    impType(tab); impStep(1);
    $('chrImpModal').hidden = false;
  }
  function renderMap() {
    const opts = (cur) => '<option value="">— не брать —</option>' + imp.headers.map((h) => '<option' + (h === cur ? ' selected' : '') + '>' + esc(h) + '</option>').join('');
    $('chrImpMap').innerHTML = Object.keys(imp.labels).map((f) => '<label><span>' + esc(imp.labels[f]) + (f === 'title' ? ' *' : '') + '</span><select data-f="' + f + '">' + opts(imp.mapping[f]) + '</select></label>').join('');
    renderSample();
  }
  function renderSample() {
    const row = imp.sample[0] || [];
    const parts = Object.keys(imp.mapping).filter((f) => imp.mapping[f]).map((f) => { const v = row[imp.headers.indexOf(imp.mapping[f])]; return v ? esc(imp.labels[f]) + ': <b>' + esc(String(v).slice(0, 40)) + '</b>' : ''; }).filter(Boolean);
    $('chrImpSample').innerHTML = parts.length ? 'Первая строка: ' + parts.join(' · ') : '';
  }
  function applyPreview(d, url) {
    Object.assign(imp, { token: d.token, headers: d.headers, mapping: d.mapping || {}, labels: d.labels || {}, sample: d.sample || [], url: url || '' });
    $('chrImpFound').textContent = 'Найдено строк: ' + d.total + '. Проверь, что колонки определились верно.';
    renderMap(); impStep(2); impMsg('');
  }
  async function impLoadUrl() {
    const url = $('chrImpUrl').value.trim(); if (!url) { impMsg('Вставь ссылку на таблицу.', 'error'); return; }
    impMsg('Загружаем…'); $('chrImpGo').disabled = true;
    try { applyPreview(await post('/api/chronicles/source/preview', { url }), url); } catch (e) { impMsg(e.message, 'error'); }
    $('chrImpGo').disabled = false;
  }
  async function impLoadFile(f) {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { impMsg('Файл больше 8 МБ.', 'error'); return; }
    impMsg('Читаем файл…');
    try { applyPreview(await post('/api/chronicles/source/preview', { text: await f.text() }), ''); } catch (e) { impMsg(e.message, 'error'); }
  }
  function reloadSoon(n) { if (n) [3000, 9000, 20000].forEach((ms) => setTimeout(() => { if (loaded) load(); }, ms)); }
  async function impRun() {
    const mapping = {}; $('chrImpMap').querySelectorAll('select').forEach((s) => { if (s.value) mapping[s.dataset.f] = s.value; });
    if (!mapping.title) { impMsg('Выбери колонку с названием.', 'error'); return; }
    impMsg('Импортируем…'); $('chrImpRun').disabled = true;
    try {
      const d = await post('/api/chronicles/source/import', { token: imp.token, type: imp.type, mapping, reverse: $('chrImpRev').checked, remember: !!imp.url && $('chrImpRem').checked, url: imp.url });
      sources = d.sources || sources; useTab(imp.type);
      $('chrImpModal').hidden = true;
      await load(); reloadSoon(d.posters);
      saved('Добавлено: ' + d.added + (d.skipped ? ', пропущено (уже есть): ' + d.skipped : '') + (d.posters ? ' · обложки подгружаются' : ''), 'ok');
    } catch (e) { impMsg(e.message, 'error'); }
    $('chrImpRun').disabled = false;
  }
  async function syncNow(silent) {
    const t = tab; if (!sources[t]) return;
    if (!silent) saved('Синхронизируем…', '');
    try {
      const d = await post('/api/chronicles/source/sync', { type: t });
      sources = d.sources || sources;
      if (d.added) { await load(); reloadSoon(d.posters); }
      saved(d.added ? 'Из таблицы добавлено: ' + d.added : (silent ? '' : 'Новых записей нет'), d.added || !silent ? 'ok' : '');
    } catch (e) { if (!silent) saved(e.message, ''); }
  }
  function autoSync() {
    const s = sources[tab];
    if (!s || syncedTab[tab] || Date.now() - (s.at || 0) < 10 * 60 * 1000) return;
    syncedTab[tab] = true; syncNow(true);
  }


  /* ---------- голосование чата «Оценка чата» 1–10 ---------- */
  let voteTimer = null; let voteWas = false;
  const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function renderVote(v) {
    const el = $('chrVote');
    if (!v || !v.active) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const bars = (v.dist || []).map((n, i) => '<i title="' + (i + 1) + ': ' + n + '" style="height:' + (v.count ? Math.max(6, Math.round(n / Math.max(...v.dist) * 100)) : 6) + '%"></i>').join('');
    el.innerHTML = '<div class="chr-vote-main"><b>Голосование чата: «' + esc(v.title) + '»</b><span>Опрос идёт в чате Twitch (1-2 … 9-10) · осталось ' + mmss(v.left) + ' · голосов: <b>' + v.count + '</b>' + (v.avg != null ? ' · сейчас ≈ <b>' + esc(fmt(v.avg)) + '</b>' : '') + '</span></div>' +
      '<div class="chr-vote-bars" aria-hidden="true">' + bars + '</div>' +
      '<div class="chr-vote-btns"><button type="button" class="btn btn-primary" data-vote="stop">Завершить сейчас</button><button type="button" class="btn btn-secondary" data-vote="cancel">Отмена</button></div>';
  }
  async function pollVote() {
    try {
      const v = (await api('/api/chronicles/vote')).vote;
      renderVote(v);
      if (v.active) { voteWas = true; if (!voteTimer) voteTimer = setInterval(pollVote, 1000); return; }
    } catch (e) { /* связи нет — попробуем в следующий раз */ }
    if (voteTimer) { clearInterval(voteTimer); voteTimer = null; }
    if (voteWas) { voteWas = false; await load(); saved('Голосование завершено, оценка чата записана', 'ok'); }
  }
  async function startVote(it) {
    try {
      saved('Запускаем опрос…', '');
      const d = await post('/api/chronicles/' + encodeURIComponent(it.id) + '/vote', {});
      renderVote(d.vote); voteWas = true;
      if (!voteTimer) voteTimer = setInterval(pollVote, 1000);
      saved('Голосование запущено: опрос появился в чате Twitch', 'ok');
    } catch (e) { saved(e.message, ''); }
  }

  /* ---------- события ---------- */
  $('chrVote').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-vote]'); if (!b) return;
    try { await post('/api/chronicles/vote/stop', { cancel: b.dataset.vote === 'cancel' }); voteWas = b.dataset.vote !== 'cancel'; await pollVote(); if (b.dataset.vote === 'cancel') saved('Голосование отменено', ''); } catch (x) { saved(x.message, ''); }
  });
  $('chrImport').addEventListener('click', openImport);
  $('chrSync').addEventListener('click', () => syncNow(false));
  $('chrImpClose').addEventListener('click', () => { $('chrImpModal').hidden = true; });
  $('chrImpModal').addEventListener('mousedown', (e) => { if (e.target === $('chrImpModal')) $('chrImpModal').hidden = true; });
  $('chrImpType').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) impType(b.dataset.v); });
  $('chrImpGo').addEventListener('click', impLoadUrl);
  $('chrImpUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); impLoadUrl(); } });
  $('chrImpFile').addEventListener('change', (e) => impLoadFile(e.target.files && e.target.files[0]));
  $('chrImpBack').addEventListener('click', () => { impStep(1); impMsg(''); });
  $('chrImpRun').addEventListener('click', impRun);
  $('chrImpMap').addEventListener('change', (e) => { const s = e.target.closest('select'); if (!s) return; if (s.value) imp.mapping[s.dataset.f] = s.value; else delete imp.mapping[s.dataset.f]; renderSample(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('chrImpModal').hidden) $('chrImpModal').hidden = true; });
  buildStarInput($('chrRatingS')); buildStarInput($('chrChatS'));
  $('chrAdd').addEventListener('click', () => openForm(null));
  $('chrClose').addEventListener('click', closeForm);
  $('chrCancel').addEventListener('click', closeForm);
  $('chrModal').addEventListener('mousedown', (e) => { if (e.target === $('chrModal')) closeForm(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('chrModal').hidden) closeForm(); });
  $('chrSave').addEventListener('click', submit);
  sec.querySelector('.chr-form').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); } });
  $('chrType').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setType(b.dataset.v); });
  $('chrPosterFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { $('chrMsg').textContent = 'Картинка больше 8 МБ.'; $('chrMsg').className = 'form-message error'; return; }
    posterFile = f; posterCleared = false; $('chrPosterUrl').value = ''; showPoster(URL.createObjectURL(f));
  });
  $('chrPosterUrl').addEventListener('change', (e) => { const u = e.target.value.trim(); if (/^https?:\/\//i.test(u)) { posterFile = null; posterCleared = false; $('chrPosterFile').value = ''; showPoster(u); } });
  $('chrPosterDel').addEventListener('click', () => { posterFile = null; posterCleared = true; $('chrPosterFile').value = ''; $('chrPosterUrl').value = ''; showPoster(''); });
  $('chrTabs').addEventListener('click', (e) => { const s = e.target.closest('span[data-t]'); if (!s) return; useTab(s.dataset.t); render(); autoSync(); });
  $('chrViews').addEventListener('change', (e) => { if (e.target.id === 'chrShowChat') { showChat = e.target.checked; S[tab].chat = showChat; saveState(); render(); } });
  $('chrViews').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; view = b.dataset.v; S[tab].view = view; saveState(); render(); });
  ['input', 'change'].forEach((ev) => ['chrSearch', 'chrOrigin', 'chrGenre', 'chrRatingF', 'chrSort'].forEach((id) => $(id).addEventListener(ev, () => { captureControls(); render(); })));
  /* ---------- просмотр записи с рецензией ---------- */
  function openView(it) {
    const p = parts(it); const m = $('chrView');
    $('chrVwBody').innerHTML = '<div class="chr-vwp">' + posterImg(it) + '</div><div class="chr-vwb">' +
      '<div class="chr-meta">' + (it.type === 'game' ? 'Игра' : 'Фильм') + (p.meta ? ' · ' + p.meta : '') + '</div><h2 class="chr-vwt">' + esc(it.title) + '</h2>' +
      '<div class="chr-vwr">' + ratingLine('Моя оценка', it.rating) + (showChat ? ratingLine('Оценка чата', it.chatRating) : '') + '</div>' + p.chips + p.by +
      (it.comment ? '<blockquote class="chr-quote">' + esc(it.comment) + '</blockquote>' : '<p class="chr-meta">Рецензии пока нет.</p>') + p.link + '</div>';
    $('chrVwEdit').onclick = () => { m.hidden = true; openForm(it); };
    m.hidden = false;
  }
  $('chrVwClose').addEventListener('click', () => { $('chrView').hidden = true; });
  $('chrView').addEventListener('click', (e) => { if (e.target === $('chrView')) $('chrView').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('chrView').hidden) $('chrView').hidden = true; });
  $('chrGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) {
      if (e.target.closest('a,button,.chr-acts')) return;
      const card = e.target.closest('.chr-it'); const it0 = card && items.find((x) => x.id === card.dataset.id);
      if (it0) openView(it0);
      return;
    }
    const el = b.closest('.chr-it'); const it = items.find((x) => x.id === el.dataset.id); if (!it) return;
    if (b.dataset.a === 'edit') openForm(it);
    else if (b.dataset.a === 'del') del(it);
    else if (b.dataset.a === 'vote') startVote(it);
    else if (b.dataset.a === 'tg') {
      saved('Отправляю в Telegram…');
      fetch('/api/telegram/chronicle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id }) })
        .then((r) => r.json()).then((d) => { if (!d.success) throw new Error(d.error || 'Не удалось отправить.'); saved('Отправлено в Telegram', 'ok'); })
        .catch((err) => saved(err.message, 'err'));
    }
    else if (b.dataset.a === 'more') {
      if (b.classList.contains('chr-tcm')) { b.classList.toggle('open'); return; }
      const c = el.querySelector('.chr-comment'); const open = c.classList.toggle('clamp') === false; b.textContent = open ? 'Свернуть' : 'Показать полностью';
    }
  });

  // ---------- публикация на GitHub Pages ----------
  let pub = null, pubTimer = null;
  const PUBK = 'ovChrPubTip';
  const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : Math.round(m / 60) + ' ч назад'; };
  function pubButton() {
    const b = $('chrPub'); if (!b || !pub) return;
    b.textContent = pub.connected ? (pub.busy ? '🌐 Обновляется…' : '🌐 Моя страница') : '🌐 Опубликовать';
    $('chrPubTip').hidden = !!(pub.connected || items.length < 5 || lsGet(PUBK) === '1');
  }
  async function pubLoad() { try { pub = await api('/api/chronicles/publish'); } catch (e) { /* нет связи */ } pubButton(); return pub; }
  function pubDraw() {
    const el = $('chrPubBody'); if (!pub) { el.textContent = 'Загрузка…'; return; }
    const d = pub.device;
    if (pub.connected) {
      el.innerHTML = '<p class="chr-imp-hint">Страница журнала: <a href="' + esc(pub.url) + '" target="_blank" rel="noopener noreferrer">' + esc(pub.url) + '</a> <button type="button" class="btn-tiny" id="chrPubCopy">Копировать</button></p>' +
        '<p class="chr-imp-hint">' + (pub.busy ? 'Обновляю…' : pub.queued ? 'Изменения будут опубликованы через пару минут.' : pub.lastAt ? 'Опубликовано ' + esc(ago(pub.lastAt)) + '.' : 'Первая публикация идёт, страница появится через 1–2 минуты.') + '</p>' +
        (pub.lastError ? '<p class="chr-imp-hint" style="color:var(--danger,#e5484d)">' + esc(pub.lastError) + '</p>' : '') +
        '<label class="chr-chatopt"><input type="checkbox" id="chrPubAuto"' + (pub.auto ? ' checked' : '') + '> Обновлять страницу автоматически</label>' +
        '<p class="chr-imp-hint">В публичную страницу попадают название, год, жанры, оценки, рецензия и обложки. Ники заказавших и ссылки не публикуются. Репозиторий публичный.</p>' +
        '<div class="chr-imp-line"><button type="button" class="btn btn-primary btn-sm" id="chrPubNow">Обновить сейчас</button><button type="button" class="btn btn-ghost btn-sm" id="chrPubOff">Отключить GitHub</button></div>';
    } else if (d) {
      el.innerHTML = d.error ? '<p class="chr-imp-hint">' + esc(d.error) + '</p><button type="button" class="btn btn-primary btn-sm" id="chrPubGo">Подключить заново</button>' :
        '<p class="chr-imp-hint">1. Открой <a href="' + esc(d.uri) + '" target="_blank" rel="noopener noreferrer">' + esc(d.uri) + '</a> (нужен аккаунт GitHub).<br>2. Введи код и нажми «Authorize».</p><div class="chr-pubcode">' + esc(d.userCode) + '</div><p class="chr-imp-hint">Жду подтверждения… страница создастся сама.</p>';
    } else {
      el.innerHTML = '<p class="chr-imp-hint">Админка создаст на твоём GitHub публичную страницу с журналом (GitHub Pages, бесплатно). Зрители смогут листать его, пока ты офлайн. Нужен только аккаунт GitHub.</p>' +
        (pub.needClientId ? '<div class="field"><label>Client ID OAuth-приложения GitHub</label><input type="text" id="chrPubCid" placeholder="Ov23li…"></div>' : '') +
        '<div class="chr-imp-line"><button type="button" class="btn btn-primary" id="chrPubGo">Подключить GitHub</button></div><div class="form-message" id="chrPubMsg"></div>';
    }
  }
  async function pubOpen() {
    $('chrPubModal').hidden = false; await pubLoad(); pubDraw();
    clearInterval(pubTimer); pubTimer = setInterval(async () => { if ($('chrPubModal').hidden) { clearInterval(pubTimer); return; } if (document.activeElement && document.activeElement.id === 'chrPubCid') return; await pubLoad(); pubDraw(); }, 3000);
  }
  $('chrPub').addEventListener('click', pubOpen);
  $('chrPubTipGo').addEventListener('click', pubOpen);
  $('chrPubTipX').addEventListener('click', () => { lsSet(PUBK, '1'); $('chrPubTip').hidden = true; });
  $('chrPubClose').addEventListener('click', () => { $('chrPubModal').hidden = true; });
  $('chrPubModal').addEventListener('mousedown', (e) => { if (e.target === $('chrPubModal')) $('chrPubModal').hidden = true; });
  $('chrPubBody').addEventListener('click', async (e) => {
    const id = e.target.id; if (!id) return;
    try {
      if (id === 'chrPubGo') { const c = $('chrPubCid'); pub = await post('/api/chronicles/publish/login', { clientId: c ? c.value : '' }); }
      else if (id === 'chrPubNow') { e.target.disabled = true; pub = await post('/api/chronicles/publish/now'); }
      else if (id === 'chrPubOff') { if (!confirm('Отключить GitHub? Страница останется, но обновляться перестанет.')) return; pub = await api('/api/chronicles/publish', { method: 'DELETE' }); }
      else if (id === 'chrPubCopy') { navigator.clipboard.writeText(pub.url).catch(() => {}); e.target.textContent = 'Скопировано'; return; }
      else return;
      pubButton(); pubDraw();
    } catch (err) { const m = $('chrPubMsg'); if (m) { m.textContent = err.message; m.className = 'form-message error'; } else alert(err.message); }
  });
  $('chrPubBody').addEventListener('change', async (e) => { if (e.target.id === 'chrPubAuto') { pub = await post('/api/chronicles/publish/auto', { auto: e.target.checked }); } });
  setTimeout(pubLoad, 1500);
  document.querySelectorAll('.nav-item[data-tab="chronicles"]').forEach((n) => n.addEventListener('click', () => { if (!loaded) load(); }));
  new MutationObserver(() => { if (sec.classList.contains('active') && !loaded) load(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  if (sec.classList.contains('active')) load();
})();
