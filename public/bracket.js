// public/bracket.js — bracket.html: турнирная сетка как три независимые
// панели (Матчи / Решающие матчи / Турнирная таблица). Положение и размер
// каждой панели — из panelLayout (bracketData.js), та же модель, что и у
// "Виджетов оверлея". Адаптивность внутри панели — ResizeObserver считает
// --panel-scale (реальный размер / эталонный размер по умолчанию для этой
// панели) и это единственное, что масштабирует шрифты/отступы внутри —
// см. подробный комментарий в bracket.css.

(function () {
  const panels = {
    matches: document.getElementById('bracketPanelMatches'),
    playoff: document.getElementById('bracketPanelPlayoff'),
    standings: document.getElementById('bracketPanelStandings'),
  };
  // Эталонные размеры — те же числа, что и DEFAULT_PANEL_LAYOUT в
  // bracketData.js; scale=1 ровно тогда, когда панель имеет размер по
  // умолчанию, и меняется пропорционально при любом изменении размера.
  const REFERENCE_SIZE = {
    matches: { w: 1000, h: 700 },
    playoff: { w: 760, h: 500 },
    standings: { w: 1000, h: 240 },
  };
  // Эталонные размеры панелей Double Elimination (= её раскладка по умолчанию, см. DEFAULT_PANEL_LAYOUT_DE в bracketData.js).
  const REFERENCE_SIZE_DE = {
    matches: { w: 1380, h: 480 },
    playoff: { w: 380, h: 480 },
    standings: { w: 1380, h: 440 },
  };
  let isDouble = false;

  const groupLabelEl = document.getElementById('bracketGroupLabel');
  const matchesTitleEl = document.getElementById('bracketMatchesTitle');
  const groupGridEl = document.getElementById('bracketGroupGrid');
  const standingsBodyEl = document.getElementById('bracketStandingsBody');
  const playoffBoxesEl = document.getElementById('bracketPlayoffBoxes');
  const playoffTitleEl = document.getElementById('bracketPlayoffTitle');
  const standingsTitleEl = document.getElementById('bracketStandingsTitle');
  const deUpperEl = document.getElementById('bracketDeUpper');
  const deLowerEl = document.getElementById('bracketDeLower');
  const deFinalEl = document.getElementById('bracketDeFinal');

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function teamById(bracket, id) { return bracket.teams.find((t) => t.id === id) || null; }
  function logoHtml(team) {
    return team && team.logoUrl ? `<img class="bracket-team-logo" src="${team.logoUrl}" alt="">` : `<div class="bracket-logo-placeholder"></div>`;
  }
  // rowScoreFor() убрана — раньше отдавала числовой счёт для строки, но плашки матча теперь показывают
  // букву W/L вместо числа (см. renderMatchPlate); сырой счёт всё ещё в данных, просто больше нигде тут не читается.
  /* ---------- Панель "Матчи" — группа "все против всех" ---------- */
  /** Плашка одной команды матча. Раньше показывала числовой счёт (0/1) — теперь букву "W"/"L" (сам счёт в
      данных не трогаем, он может понадобиться и дальше — см. BO3-финал ниже, у него по-прежнему настоящий счёт). */
  function renderMatchPlate(team, isWinner, isLoser, placeholderLabel) {
    if (!team) {
      return `<div class="bracket-match-plate bracket-row-empty">${logoHtml(null)}<span class="bracket-team-name bracket-tbd">${escapeHtml(placeholderLabel || '—')}</span></div>`;
    }
    const rowClass = isWinner ? 'bracket-row-winner' : isLoser ? 'bracket-row-loser' : '';
    const badge = isWinner ? 'W' : isLoser ? 'L' : '';
    return `
      <div class="bracket-match-plate ${rowClass}">
        ${logoHtml(team)}
        <span class="bracket-team-name">${escapeHtml(team.name)}</span>
        ${badge ? `<span class="bracket-team-badge">${badge}</span>` : ''}
      </div>
    `;
  }

  function renderGroupGrid(bracket) {
    const groupMatches = bracket.nodes.filter((n) => n.bracket === 'roundrobin' || n.bracket === 'winners');
    groupGridEl.innerHTML = '';
    groupMatches.forEach((node) => {
      const el = document.createElement('div');
      el.className = 'bracket-match-row';
      el.innerHTML = `
        ${renderMatchPlate(teamById(bracket, node.teamAId), node.winnerId === node.teamAId, node.loserId === node.teamAId)}
        <span class="bracket-match-vs">VS</span>
        ${renderMatchPlate(teamById(bracket, node.teamBId), node.winnerId === node.teamBId, node.loserId === node.teamBId)}
      `;
      groupGridEl.appendChild(el);
    });
  }

  /* ---------- Панель "Турнирная таблица" ---------- */
  // Те же 3 очка за победу / 1 за поражение и та же сортировка (очки, при равенстве — по числу побед), что и на
  // сервере в bracketData.js computeRoundRobinStandings — держим в двух местах умышленно (как и остальные
  // мелкие алгоритмы по всему проекту), но значения и порядок сортировки должны совпадать буква в букву.
  function computeStandings(bracket) {
    const stats = new Map();
    bracket.teams.forEach((t) => stats.set(t.id, { team: t, wins: 0, losses: 0, points: 0 }));
    bracket.nodes.forEach((n) => {
      if (n.bracket !== 'roundrobin' && n.bracket !== 'winners') return;
      if (!n.winnerId) return;
      if (stats.has(n.winnerId)) { stats.get(n.winnerId).wins += 1; stats.get(n.winnerId).points += 3; }
      if (stats.has(n.loserId)) { stats.get(n.loserId).losses += 1; stats.get(n.loserId).points += 1; }
    });
    return Array.from(stats.values()).sort((a, b) => (b.points - a.points) || (b.wins - a.wins));
  }

  function renderStandings(bracket) {
    const rows = computeStandings(bracket);
    standingsBodyEl.innerHTML = rows.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><div class="bracket-standings-team-cell">${logoHtml(s.team)}<span>${escapeHtml(s.team.name)}</span></div></td>
        <td>${s.wins}–${s.losses}</td>
        <td>${s.points}</td>
      </tr>
    `).join('');
  }

  /* ---------- Панель "Решающие матчи" (плей-офф) ---------- */
  function renderPlayoff(bracket) {
    const matchForFinal = bracket.nodes.find((n) => n.playoffSlot === 'match_for_final');
    const final = bracket.nodes.find((n) => n.playoffSlot === 'final');
    playoffBoxesEl.innerHTML = '';
    if (matchForFinal) {
      const isCurrent = matchForFinal.teamAId && matchForFinal.teamBId && !matchForFinal.winnerId;
      playoffBoxesEl.innerHTML += `
        <div class="bracket-playoff-box ${isCurrent ? 'bracket-match-current' : ''}">
          <h3>МАТЧ ЗА ФИНАЛ</h3>
          <div class="bracket-match-row">
            ${renderMatchPlate(teamById(bracket, matchForFinal.teamAId), matchForFinal.winnerId === matchForFinal.teamAId, matchForFinal.loserId === matchForFinal.teamAId, '2-е место группы')}
            <span class="bracket-match-vs">VS</span>
            ${renderMatchPlate(teamById(bracket, matchForFinal.teamBId), matchForFinal.winnerId === matchForFinal.teamBId, matchForFinal.loserId === matchForFinal.teamBId, '3-е место группы')}
          </div>
        </div>
      `;
    }
    if (final) {
      const isCurrent = final.teamAId && final.teamBId && !final.winnerId;
      const isBo3 = bracket.finalFormat === 'bo3';
      const title = isBo3 && !final.winnerId ? `ФИНАЛ · BO3 (${final.scoreA || 0}:${final.scoreB || 0})` : 'ФИНАЛ';
      playoffBoxesEl.innerHTML += `
        <div class="bracket-playoff-box ${isCurrent ? 'bracket-match-current' : ''}">
          <h3>${escapeHtml(title)}</h3>
          <div class="bracket-match-row">
            ${renderMatchPlate(teamById(bracket, final.teamAId), final.winnerId === final.teamAId, final.loserId === final.teamAId, '1-е место группы')}
            <span class="bracket-match-vs">VS</span>
            ${renderMatchPlate(teamById(bracket, final.teamBId), final.winnerId === final.teamBId, final.loserId === final.teamBId, 'Победитель матча за финал')}
          </div>
        </div>
      `;
    }
  }

  /* ---------- Раскладка панелей + адаптивный масштаб ---------- */
  const resizeObservers = {};
  function setupPanelScale(id) {
    if (resizeObservers[id]) return; // наблюдатель заводится один раз на панель
    const el = panels[id];
    resizeObservers[id] = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      const ref = (isDouble ? REFERENCE_SIZE_DE : REFERENCE_SIZE)[id]; // эталон зависит от формата сетки — читаем в момент пересчёта
      const scale = Math.min(width / ref.w, height / ref.h);
      el.style.setProperty('--panel-scale', scale.toFixed(3));
    });
    resizeObservers[id].observe(el);
  }

  function applyPanelLayout(panelLayout) {
    Object.entries(panelLayout).forEach(([id, rect]) => {
      const el = panels[id];
      if (!el) return;
      el.dataset.enabled = rect.enabled !== false ? 'true' : 'false';
      el.style.left = rect.x + 'px';
      el.style.top = rect.y + 'px';
      el.style.width = rect.w + 'px';
      el.style.height = rect.h + 'px';
      setupPanelScale(id);
    });
  }

  function render(bracket) {
    if (!bracket) return;
    const r = document.documentElement.style;
    const s = bracket.sizeSettings;
    r.setProperty('--bracket-name-size', s.nameFontSize + 'px');
    r.setProperty('--bracket-score-size', s.scoreFontSize + 'px');
    r.setProperty('--bracket-table-size', s.tableFontSize + 'px');
    r.setProperty('--bracket-columns', s.columns);
    r.setProperty('--bracket-plate-max-width', (s.plateMaxWidth > 0 ? s.plateMaxWidth : 100000) + 'px'); // 0 = без ограничения
    r.setProperty('--bracket-panel-padding', s.panelPadding + 'px');
    r.setProperty('--bracket-plate-padding', s.platePadding + 'px');
    r.setProperty('--bracket-plate-gap', s.plateInnerGap + 'px');
    r.setProperty('--bracket-plate-height', s.plateHeight + 'px');
    r.setProperty('--bracket-logo-size', s.logoSize + 'px');
    r.setProperty('--bracket-gap-x', s.gapX + 'px');
    r.setProperty('--bracket-gap-y', s.gapY + 'px');
    r.setProperty('--bracket-table-row-h', s.tableRowHeight + 'px');
    r.setProperty('--bracket-table-row-gap', s.tableRowGap + 'px');
    r.setProperty('--bracket-panel-opacity', s.panelOpacity / 100);
    r.setProperty('--bracket-pulse-speed', s.pulseSpeed + 'ms');

    // Цвета/шрифты — либо наша локальная настройка, либо (если "Тема ивента"
    // применена к сетке) themeOverlay целиком перебивает локальные значения —
    // применяется одинаково ко всем трём панелям одновременно, поскольку они
    // все читают одни и те же CSS-переменные на :root.
    const overlay = bracket.themeOverlay;
    const c = bracket.colorSettings;
    r.setProperty('--bracket-bg', overlay ? overlay.cardFillStart : c.bgColor);
    r.setProperty('--bracket-text', overlay ? overlay.themeTextColor : c.textColor);
    r.setProperty('--bracket-title-color', overlay ? overlay.themeTextColor : c.titleColor);
    r.setProperty('--bracket-border', overlay ? overlay.cardBorderStart : c.borderColor);
    r.setProperty('--bracket-accent', overlay ? overlay.cardBorderEnd : c.accentColor);
    r.setProperty('--bracket-win-color', c.winColor);
    r.setProperty('--bracket-lose-color', c.loseColor);
    r.setProperty('--bracket-title-font', `'${overlay ? overlay.themeTitleFont : c.titleFont}', system-ui, sans-serif`);
    r.setProperty('--bracket-data-font', `'${overlay ? overlay.themeDataFont : c.dataFont}', system-ui, sans-serif`);
    r.setProperty('--bracket-title-weight', overlay ? overlay.themeTitleFontWeight : c.titleFontWeight);
    r.setProperty('--bracket-data-weight', overlay ? overlay.themeDataFontWeight : c.dataFontWeight);

    isDouble = bracket.mode === 'double';
    document.body.classList.toggle('de-mode', isDouble);
    applyPanelLayout(bracket.panelLayout);
    // эталон масштаба зависит от формата — при смене формата размер панели мог не измениться (наблюдатель молчит), пересчитываем сами
    Object.keys(panels).forEach((id) => {
      const el = panels[id], ref = (isDouble ? REFERENCE_SIZE_DE : REFERENCE_SIZE)[id];
      if (el.clientWidth > 0 && el.clientHeight > 0) el.style.setProperty('--panel-scale', Math.min(el.clientWidth / ref.w, el.clientHeight / ref.h).toFixed(3));
    });
    groupLabelEl.textContent = bracket.groupLabel || '';
    if (isDouble) {
      // Double Elimination: отдельная отрисовка (public/bracket-de.js), код «все против всех» ниже не вызывается
      matchesTitleEl.textContent = window.BracketDE.TITLES.upper;
      playoffTitleEl.textContent = window.BracketDE.TITLES.final;
      standingsTitleEl.textContent = window.BracketDE.TITLES.lower;
      window.BracketDE.render({ bracket, upperEl: deUpperEl, lowerEl: deLowerEl, finalEl: deFinalEl, esc: escapeHtml });
      return;
    }
    matchesTitleEl.textContent = bracket.matchesTitle || 'Матчи';
    playoffTitleEl.textContent = 'Решающие матчи';
    standingsTitleEl.textContent = 'Турнирная таблица';
    renderGroupGrid(bracket);
    renderStandings(bracket);
    renderPlayoff(bracket);
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=bracket`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'bracket_data') render(data.bracket);
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }
  connect();
})();
