// «Хроники» — журнал игр и фильмов. Данные: /api/chronicles, постеры: /uploads/chronicles/.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sec = $('tab-chronicles'); if (!sec) return;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NOUN = { game: ['игра', 'игры', 'игр'], movie: ['фильм', 'фильма', 'фильмов'] };
  const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return f[a > 10 && a < 20 ? 2 : b > 1 && b < 5 ? 1 : b === 1 ? 0 : 2]; };
  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));
  const KEY = 'ovChrTab';

  let items = []; let tab = 'game'; let editing = null; let posterFile = null; let posterCleared = false; let loaded = false;
  try { const t = localStorage.getItem(KEY); if (t === 'game' || t === 'movie') tab = t; } catch (e) {}

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

  const ratingClass = (r) => (r == null ? 'none' : r > 10 ? 'gold' : r >= 7 ? 'good' : r >= 5 ? 'mid' : 'bad');
  function visible() {
    const q = $('chrSearch').value.trim().toLowerCase(), o = $('chrOrigin').value, sort = $('chrSort').value;
    let list = items.filter((it) => it.type === tab);
    if (o) list = list.filter((it) => (it.origin || '—') === o);
    if (q) list = list.filter((it) => [it.title, it.comment, it.by, it.origin, it.extra, (it.tags || []).join(' '), it.year].join(' ').toLowerCase().includes(q));
    const cmp = {
      new: (a, b) => items.indexOf(a) - items.indexOf(b),
      old: (a, b) => items.indexOf(b) - items.indexOf(a),
      rating: (a, b) => (b.rating == null) - (a.rating == null) || b.rating - a.rating,
      ratingAsc: (a, b) => (b.rating == null) - (a.rating == null) || a.rating - b.rating,
      title: (a, b) => a.title.localeCompare(b.title, 'ru'),
      hours: (a, b) => (b.hours || 0) - (a.hours || 0),
    }[sort];
    return list.slice().sort(cmp);
  }

  function renderStats() {
    const mine = items.filter((it) => it.type === tab);
    const rated = mine.filter((it) => it.rating != null && it.rating <= 10);
    const avg = rated.length ? rated.reduce((s, it) => s + it.rating, 0) / rated.length : null;
    const best = rated.length ? Math.max(...rated.map((it) => it.rating)) : null;
    const cells = [[mine.length, plural(mine.length, NOUN[tab]) + ' в журнале']];
    if (avg != null) cells.push([fmt(Math.round(avg * 10) / 10), 'средняя оценка']);
    if (best != null) cells.push([fmt(best) + '/10', 'лучшая оценка']);
    if (tab === 'game') { const h = mine.reduce((s, it) => s + (it.hours || 0), 0); if (h) cells.push([fmt(Math.round(h * 10) / 10) + ' ч', 'всего наиграно']); }
    $('chrStats').innerHTML = cells.map((c) => '<div class="chr-stat"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>').join('');
  }

  function card(it) {
    const r = it.rating;
    const meta = [];
    if (it.year) meta.push(esc(it.year));
    if (it.type === 'game' && it.hours != null) meta.push(esc(fmt(it.hours)) + ' ч');
    if (it.extra) meta.push(esc(it.extra));
    const chips = [];
    if (it.origin) chips.push('<span class="chr-chip o">' + esc(it.origin) + '</span>');
    (it.tags || []).forEach((t) => chips.push('<span class="chr-chip">' + esc(t) + '</span>'));
    const who = it.by ? '<div class="chr-by">Заказал <b>' + esc(it.by) + '</b>' + (it.percent != null ? ' · лот ' + esc(fmt(it.percent)) + '%' : '') + '</div>' : (it.percent != null ? '<div class="chr-by">Лот ' + esc(fmt(it.percent)) + '%</div>' : '');
    const long = (it.comment || '').length > 160;
    return '<article class="chr-card" data-id="' + esc(it.id) + '">' +
      '<div class="chr-poster">' + (it.poster ? '<img loading="lazy" alt="" src="/uploads/chronicles/' + encodeURIComponent(it.poster) + '">' : '<span>' + esc((it.title || '?').trim().charAt(0).toUpperCase()) + '</span>') +
      '<div class="chr-rate ' + ratingClass(r) + '" title="Оценка">' + (r == null ? '—' : esc(fmt(r))) + '</div>' +
      '<div class="chr-acts"><button type="button" class="chr-ab" data-a="edit" title="Редактировать" aria-label="Редактировать">✎</button><button type="button" class="chr-ab" data-a="del" title="Удалить" aria-label="Удалить">🗑</button></div></div>' +
      '<div class="chr-body"><h3 class="chr-title">' + esc(it.title) + '</h3>' +
      (meta.length ? '<div class="chr-meta">' + meta.join(' · ') + '</div>' : '') +
      (chips.length ? '<div class="chr-chips">' + chips.join('') + '</div>' : '') + who +
      (it.comment ? '<p class="chr-comment' + (long ? ' clamp' : '') + '">' + esc(it.comment) + '</p>' + (long ? '<button type="button" class="chr-more" data-a="more">Показать полностью</button>' : '') : '') +
      (it.link ? '<a class="chr-link" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">▶ Запись стрима</a>' : '') +
      '</div></article>';
  }

  function fillOrigins() {
    const set = [...new Set(items.filter((it) => it.type === tab).map((it) => it.origin || '—'))].sort((a, b) => a.localeCompare(b, 'ru'));
    const sel = $('chrOrigin'), cur = sel.value;
    sel.innerHTML = '<option value="">Любой источник</option>' + set.map((o) => '<option>' + esc(o) + '</option>').join('');
    sel.value = set.includes(cur) ? cur : '';
    const all = [...new Set(['Аукцион', 'Респект', 'Личное пожелание', ...items.map((it) => it.origin).filter(Boolean)])];
    $('chrOriginList').innerHTML = all.map((o) => '<option value="' + esc(o) + '">').join('');
  }

  function render() {
    $('chrCntGame').textContent = items.filter((it) => it.type === 'game').length;
    $('chrCntMovie').textContent = items.filter((it) => it.type === 'movie').length;
    sec.querySelectorAll('#chrTabs span').forEach((s) => s.classList.toggle('on', s.dataset.t === tab));
    fillOrigins(); renderStats();
    const list = visible();
    $('chrGrid').innerHTML = list.map(card).join('');
    const e = $('chrEmpty');
    if (!list.length) {
      e.hidden = false;
      e.innerHTML = items.some((it) => it.type === tab) ? 'Ничего не найдено. Измени поиск или фильтр.' : 'Здесь пока пусто. Нажми «+ Добавить» и внеси ' + (tab === 'game' ? 'первую пройденную игру' : 'первый просмотренный фильм') + '.';
    } else e.hidden = true;
  }

  /* ---------- форма ---------- */
  const F = { title: 'chrTitle', year: 'chrYear', rating: 'chrRating', hours: 'chrHours', origin: 'chrOriginIn', by: 'chrBy', percent: 'chrPercent', extra: 'chrExtra', link: 'chrLink', comment: 'chrComment' };
  function setType(t) {
    $('chrType').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === t));
    $('chrHoursWrap').hidden = t !== 'game';
  }
  const curType = () => $('chrType').querySelector('button.on').dataset.v;
  function showPoster(url) {
    const p = $('chrPosterPrev');
    p.innerHTML = url ? '<img alt="" src="' + esc(url) + '">' : '<span>Нет постера</span>';
    $('chrPosterDel').hidden = !url;
  }
  function openForm(it) {
    editing = it ? it.id : null; posterFile = null; posterCleared = false;
    $('chrDlgTitle').textContent = it ? 'Редактировать запись' : 'Новая запись';
    setType(it ? it.type : tab);
    Object.keys(F).forEach((k) => { $(F[k]).value = it && it[k] != null ? it[k] : ''; });
    $('chrTags').value = it ? (it.tags || []).join(', ') : '';
    showPoster(it && it.poster ? '/uploads/chronicles/' + encodeURIComponent(it.poster) : '');
    $('chrPosterFile').value = '';
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
    const body = { type, title, tags: $('chrTags').value };
    ['year', 'rating', 'origin', 'by', 'percent', 'extra', 'link', 'comment'].forEach((k) => { body[k] = $(F[k]).value; });
    if (type === 'game') body.hours = $('chrHours').value;
    if (editing) body.id = editing;
    if (posterCleared && !posterFile) body.poster = '';
    btn.disabled = true; msg.textContent = 'Сохраняем…'; msg.className = 'form-message';
    try {
      let it = (await api('/api/chronicles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).item;
      if (posterFile) {
        const fd = new FormData(); fd.append('poster', posterFile);
        it = (await api('/api/chronicles/' + encodeURIComponent(it.id) + '/poster', { method: 'POST', body: fd })).item;
      }
      const i = items.findIndex((x) => x.id === it.id);
      if (i >= 0) items[i] = it; else items.unshift(it);
      tab = it.type; try { localStorage.setItem(KEY, tab); } catch (e) {}
      closeForm(); render(); saved('Сохранено', 'ok');
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
    posterFile = f; posterCleared = false; showPoster(URL.createObjectURL(f));
  });
  $('chrPosterDel').addEventListener('click', () => { posterFile = null; posterCleared = true; $('chrPosterFile').value = ''; showPoster(''); });
  $('chrTabs').addEventListener('click', (e) => { const s = e.target.closest('span[data-t]'); if (!s) return; tab = s.dataset.t; try { localStorage.setItem(KEY, tab); } catch (x) {} render(); });
  ['input', 'change'].forEach((ev) => { $('chrSearch').addEventListener(ev, render); $('chrOrigin').addEventListener(ev, render); $('chrSort').addEventListener(ev, render); });
  $('chrGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const el = b.closest('.chr-card'); const it = items.find((x) => x.id === el.dataset.id); if (!it) return;
    if (b.dataset.a === 'edit') openForm(it);
    else if (b.dataset.a === 'del') del(it);
    else if (b.dataset.a === 'more') { const c = el.querySelector('.chr-comment'); const open = c.classList.toggle('clamp') === false; b.textContent = open ? 'Свернуть' : 'Показать полностью'; }
  });
  document.querySelectorAll('.nav-item[data-tab="chronicles"]').forEach((n) => n.addEventListener('click', () => { if (!loaded) load(); }));
  // если вкладка открыта сразу (сохранённая вкладка) — загрузим и без клика
  new MutationObserver(() => { if (sec.classList.contains('active') && !loaded) load(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  if (sec.classList.contains('active')) load();
})();
