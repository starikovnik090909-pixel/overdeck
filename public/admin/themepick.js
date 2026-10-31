// Окно выбора темы панели: показывается один раз (после обновления или при первом запуске).
(function () {
  const api = window.adminThemesApi;
  if (!api) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const post = (url) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json());

  function open(data) {
    if (document.getElementById('tpOv')) return;
    const themes = data.themes.filter((t) => t.isDefault || t.isBuiltin);
    let sel = data.activeThemeId;
    const sw = (t) => (t.isDefault ? ['#0E0E10', '#EDEDEF', '#D84B55'] : [t.bgColor, t.textColor, t.accentColor]);
    const ov = document.createElement('div');
    ov.id = 'tpOv';
    ov.className = 'tp-ov';
    ov.innerHTML = `<div class="tp-box" role="dialog" aria-modal="true">
      <h2>Выбери тему панели</h2>
      <p class="tp-sub">Цвета можно менять в любой момент. Нажми на тему, панель сразу покажется в этих цветах.</p>
      <div class="tp-grid">${themes.map((t) => `<button type="button" class="tp-chip" data-id="${t.id}">
        <span class="tp-sw">${sw(t).map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <span class="tp-nm">${esc(t.name)}</span></button>`).join('')}</div>
      <p class="tp-hint">Поменять тему позже можно в шестерёнке справа вверху, вкладка «Настройки админки». Там же можно выбрать свои цвета и создать собственную тему.</p>
      <div class="tp-act">
        <button type="button" class="btn btn-secondary" id="tpOwn">Свои цвета</button>
        <button type="button" class="btn btn-primary" id="tpOk">Выбрать</button>
      </div></div>`;
    document.body.appendChild(ov);
    const mark = () => ov.querySelectorAll('.tp-chip').forEach((b) => b.classList.toggle('on', b.dataset.id === sel));
    mark();
    ov.querySelectorAll('.tp-chip').forEach((b) => b.addEventListener('click', () => {
      sel = b.dataset.id; mark();
      api.syncMode(data.themes.find((x) => x.id === sel));
      api.apply({ themes: data.themes, activeThemeId: sel }); // живой просмотр, ничего не сохраняется
    }));
    const finish = async (goOwn) => {
      try {
        const r = sel === data.activeThemeId && !data.picked
          ? await post('/api/admin-themes/picked')
          : await post('/api/admin-themes/' + sel + '/activate');
        if (r && r.adminThemes) { api.render(r.adminThemes); api.apply(r.adminThemes); }
      } catch (e) { /* не критично */ }
      ov.remove();
      if (goOwn) { const g = document.getElementById('adminSettingsGear'); if (g) g.click(); setTimeout(() => { const a = document.getElementById('btnAdminThemeAdd'); if (a) a.click(); }, 150); }
    };
    ov.querySelector('#tpOk').addEventListener('click', () => finish(false));
    ov.querySelector('#tpOwn').addEventListener('click', () => finish(true));
  }

  window.addEventListener('adminthemes-ready', (e) => {
    const data = e.detail;
    if (data.picked) return;
    const tryOpen = () => {
      if (document.querySelector('.ui3-dlg-ov.open')) return setTimeout(tryOpen, 1500); // не поверх мастера и подсказок
      open(data);
    };
    setTimeout(tryOpen, 800);
  });
})();
