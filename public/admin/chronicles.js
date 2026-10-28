// «Хроники» — журнал игр и фильмов. Данные: /api/chronicles, постеры: /uploads/chronicles/.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sec = $('tab-chronicles'); if (!sec) return;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NOUN = { game: ['игра', 'игры', 'игр'], movie: ['фильм', 'фильма', 'фильмов'] };
  const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return f[a > 10 && a < 20 ? 2 : b > 1 && b < 5 ? 1 : b === 1 ? 0 : 2]; };
  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));
  const KEY = 'ovChrTab', VKEY = 'ovChrView';
  const VIEWS = [
    ['poster', 'Постеры'], ['row', 'Лента'], ['cine', 'Кино'], ['review', 'Рецензии'], ['table', 'Таблица'], ['duo', 'Две колонки'],
  ];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let items = []; let tab = 'game'; let view = 'poster'; let editing = null; let posterFile = null; let posterCleared = false; let loaded = false;
  const sv = { rating: null, chatRating: null };
  if (['game', 'movie'].includes(lsGet(KEY))) tab = lsGet(KEY);
  if (VIEWS.some((v) => v[0] === lsGet(VKEY))) view = lsGet(VKEY);

  const saved = (t, k) => { const el = $('chrSaved'); el.textContent = t; el.className = 'ui3-saved' + (k ? ' ' + k : ''); if (t && k === 'ok') setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, 2500); };
  async function api(url, opt) {
    const r = await fetch(url, opt);
    let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok || !d || d.success === false) throw new Error((d && d.error) || 'Ошибка сервера (' + r.status + ')');
    return d;
  }
  async function load() {
    try { items = (await api('/api/chronicles')).items || []; loaded = true; render(); }
    catch (e) { $('chrEmpty').hidden = false; $('chrEmpty').textContent = 'Не удалось загрузить: ' + e.message; }
  }

  /* ---------- фильтры ---------- */
  function visible() {
    const q = $('chrSearch').value.trim().toLowerCase(), o = $('chrOrigin').value, g = $('chrGenre').value, rf = $('chrRatingF').value, sort = $('chrSort').value;
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
    if (avgOf('chatRating') != null) cells.push([fmt(avgOf('chatRating')), 'средняя чата']);
    if (best != null) cells.push([fmt(best) + '/10', 'лучшая оценка']);
    if (tab === 'game') { const h = mine.reduce((s, it) => s + (it.hours || 0), 0); if (h) cells.push([fmt(Math.round(h * 10) / 10) + ' ч', 'всего наиграно']); }
    $('chrStats').innerHTML = cells.map((c) => '<div class="chr-stat"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>').join('');
  }

  /* ---------- карточки ---------- */
  const STARS = '★★★★★★★★★★';
  const stars = (v) => '<span class="chr-st" style="--v:' + (v == null ? 0 : Math.min(100, Math.max(0, v * 10))) + '" title="' + (v == null ? 'Без оценки' : esc(fmt(v)) + ' из 10') + '">' + STARS + '</span>';
  const ratingLine = (lbl, v) => '<div class="chr-rl"><span>' + lbl + '</span>' + stars(v) + '<b>' + (v == null ? '—' : esc(fmt(v))) + '</b></div>';
  const ratingClass = (r) => (r == null ? 'none' : r > 10 ? 'gold' : r >= 7 ? 'good' : r >= 5 ? 'mid' : 'bad');
  const posterUrl = (it) => (it.poster ? '/uploads/chronicles/' + encodeURIComponent(it.poster) : '');
  const posterImg = (it) => (it.poster ? '<img loading="lazy" alt="" src="' + posterUrl(it) + '">' : '<span class="chr-ph">' + esc((it.title || '?').trim().charAt(0).toUpperCase()) + '</span>');
  const acts = '<div class="chr-acts"><button type="button" class="chr-ab" data-a="edit" title="Редактировать" aria-label="Редактировать">✎</button><button type="button" class="chr-ab" data-a="del" title="Удалить" aria-label="Удалить">🗑</button></div>';
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
    const rl = ratingLine('Я', it.rating) + ratingLine('Чат', it.chatRating);
    if (view === 'poster') {
      return '<article class="chr-it chr-pv"' + id + '>' + posterImg(it) + badge(it) + acts +
        '<div class="chr-ov"><div class="chr-meta">' + (p.meta || '&nbsp;') + '</div><h3 class="chr-title">' + esc(it.title) + '</h3>' + rl +
        (it.comment ? '<p class="chr-comment clamp3" title="' + esc(it.comment) + '">' + esc(it.comment) + '</p>' : '') +
        (it.by ? '<div class="chr-by">' + p.by + '</div>' : '') + '</div></article>';
    }
    if (view === 'table') {
      return '<article class="chr-it chr-tr"' + id + '><div class="chr-tp">' + posterImg(it) + '</div>' +
        '<div class="chr-tt"><h3 class="chr-title">' + esc(it.title) + '</h3><div class="chr-meta">' + esc([it.year, it.type === 'game' && it.hours != null ? fmt(it.hours) + ' ч' : ''].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="chr-chips">' + (it.genres || []).map((g) => '<span class="chr-chip">' + esc(g) + '</span>').join('') + '</div>' +
        '<div class="chr-tc">' + stars(it.rating) + '<b>' + (it.rating == null ? '—' : esc(fmt(it.rating))) + '</b></div>' +
        '<div class="chr-tc">' + stars(it.chatRating) + '<b>' + (it.chatRating == null ? '—' : esc(fmt(it.chatRating))) + '</b></div>' +
        '<div class="chr-tcm" data-a="more" title="Нажми, чтобы развернуть">' + esc(it.comment || '') + '</div>' + acts + '</article>';
    }
    if (view === 'review') {
      return '<article class="chr-it chr-rv"' + id + '><div class="chr-rvp">' + posterImg(it) + '</div><div class="chr-rvb">' +
        '<div class="chr-meta">' + (it.type === 'game' ? 'Игра' : 'Фильм') + (p.meta ? ' · ' + p.meta : '') + '</div><h3 class="chr-title">' + esc(it.title) + '</h3>' +
        '<div class="chr-rvr">' + ratingLine('Моя оценка', it.rating) + ratingLine('Оценка чата', it.chatRating) + '</div>' +
        (it.comment ? '<blockquote class="chr-quote">' + esc(it.comment) + '</blockquote>' : '') + p.chips + p.by + p.link + '</div>' + acts + '</article>';
    }
    if (view === 'duo') {
      return '<article class="chr-it chr-du"' + id + '><div class="chr-dup">' + posterImg(it) + '</div><div class="chr-dub">' +
        '<h3 class="chr-title">' + esc(it.title) + '</h3><div class="chr-meta">' + (p.meta || '&nbsp;') + '</div>' + rl +
        (it.comment ? '<p class="chr-comment clamp3" title="' + esc(it.comment) + '">' + esc(it.comment) + '</p>' : '') + '</div>' + acts + '</article>';
    }
    if (view === 'cine') {
      return '<article class="chr-it chr-cn"' + id + '><div class="chr-cnbg" style="background-image:url(\'' + posterUrl(it) + '\')"></div><div class="chr-cnp">' + posterImg(it) + '</div><div class="chr-cnb">' +
        '<div class="chr-cnh"><h3 class="chr-title">' + esc(it.title) + '</h3>' + (it.rating != null ? '<span class="chr-big ' + ratingClass(it.rating) + '">' + esc(fmt(it.rating)) + '</span>' : '') + '</div>' +
        '<div class="chr-meta">' + (p.meta || '&nbsp;') + '</div>' + rl + p.comment(true) + p.chips + p.by + p.link + '</div>' + acts + '</article>';
    }
    // row — «Лента»
    return '<article class="chr-it chr-rw"' + id + '><div class="chr-rwp">' + posterImg(it) + '</div><div class="chr-rwb">' +
      '<div class="chr-rwh"><h3 class="chr-title">' + esc(it.title) + '</h3>' + p.by + '</div><div class="chr-meta">' + (p.meta || '&nbsp;') + '</div>' +
      '<div class="chr-rls">' + rl + '</div>' + p.comment(true) + p.chips + p.link + '</div>' + acts + '</article>';
  }

  function fillSelects() {
    const mine = items.filter((it) => it.type === tab);
    const fill = (id, label, set) => {
      const sel = $(id), cur = sel.value;
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
    $('chrViews').innerHTML = '<span class="chr-vl">Вид</span>' + VIEWS.map((v) => '<button type="button" data-v="' + v[0] + '" class="' + (v[0] === view ? 'on' : '') + '">' + v[1] + '</button>').join('');
  }

  function render() {
    $('chrCntGame').textContent = items.filter((it) => it.type === 'game').length;
    $('chrCntMovie').textContent = items.filter((it) => it.type === 'movie').length;
    sec.querySelectorAll('#chrTabs span').forEach((s) => s.classList.toggle('on', s.dataset.t === tab));
    fillSelects(); renderStats(); renderViews();
    const list = visible();
    const g = $('chrGrid');
    g.className = 'chr-list v-' + view;
    g.innerHTML = (view === 'table' && list.length ? '<div class="chr-th"><span></span><span>Название</span><span>Жанр</span><span>Я</span><span>Чат</span><span>Рецензия</span></div>' : '') + list.map(card).join('');
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
      tab = it.type; lsSet(KEY, tab);
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

  /* ---------- события ---------- */
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
  $('chrTabs').addEventListener('click', (e) => { const s = e.target.closest('span[data-t]'); if (!s) return; tab = s.dataset.t; lsSet(KEY, tab); render(); });
  $('chrViews').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; view = b.dataset.v; lsSet(VKEY, view); render(); });
  ['input', 'change'].forEach((ev) => ['chrSearch', 'chrOrigin', 'chrGenre', 'chrRatingF', 'chrSort'].forEach((id) => $(id).addEventListener(ev, render)));
  $('chrGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const el = b.closest('.chr-it'); const it = items.find((x) => x.id === el.dataset.id); if (!it) return;
    if (b.dataset.a === 'edit') openForm(it);
    else if (b.dataset.a === 'del') del(it);
    else if (b.dataset.a === 'more') {
      if (b.classList.contains('chr-tcm')) { b.classList.toggle('open'); return; }
      const c = el.querySelector('.chr-comment'); const open = c.classList.toggle('clamp') === false; b.textContent = open ? 'Свернуть' : 'Показать полностью';
    }
  });
  document.querySelectorAll('.nav-item[data-tab="chronicles"]').forEach((n) => n.addEventListener('click', () => { if (!loaded) load(); }));
  new MutationObserver(() => { if (sec.classList.contains('active') && !loaded) load(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  if (sec.classList.contains('active')) load();
})();
