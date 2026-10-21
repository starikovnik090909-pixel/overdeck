// public/bracket-de.js — отрисовка турнирной сетки Double Elimination (верхняя сетка / нижняя сетка / гранд-финал).
// Общий для двух мест: виджета OBS (public/bracket.js) и предпросмотра в админке (public/admin/app.js) — чтобы
// «как в редакторе» и «как на стриме» обеспечивались одним и тем же кодом, а не двумя копиями. Подключается только
// когда в данных mode === 'double'; отрисовка «все против всех» этот файл не затрагивает вообще.
//
// Раскладка считается здесь из самих данных (раунд + порядок матча в раунде), а не из gridRowStart/gridRowSpan,
// сохранённых при генерации: для нижней сетки (раунды «слияния» чередуются с раундами «доигровки») формула со степенями
// двойки из bracketData.js не даёт ровного дерева, а пересчёт на лету даёт его для любого числа команд.

(function (root) {
  const TITLES = { upper: 'Верхняя сетка', lower: 'Нижняя сетка', final: 'Гранд-финал' };

  function defaultEsc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function logoHtml(team, esc) {
    return team && team.logoUrl ? `<img class="bracket-team-logo" src="${esc(team.logoUrl)}" alt="">` : '<div class="bracket-logo-placeholder"></div>';
  }

  /** Плашка одной команды — та же разметка и те же классы, что у «все против всех» (поэтому победитель/проигравший светятся так же). */
  function plateHtml(ctx, node, teamId, placeholder) {
    const { teams, esc, interactive } = ctx;
    const team = teamId ? teams.get(teamId) : null;
    if (!team) return `<div class="bracket-match-plate bracket-row-empty">${logoHtml(null, esc)}<span class="bracket-team-name bracket-tbd">${esc(placeholder || '—')}</span></div>`;
    const isW = node.winnerId === team.id, isL = node.loserId === team.id;
    const cls = isW ? 'bracket-row-winner' : isL ? 'bracket-row-loser' : '';
    const badge = isW ? 'W' : isL ? 'L' : '';
    const attrs = interactive ? ` data-match-id="${esc(node.id)}" data-team-id="${esc(team.id)}"` : '';
    return `<div class="bracket-match-plate ${cls}"${attrs}>${logoHtml(team, esc)}<span class="bracket-team-name">${esc(team.name)}</span>${badge ? `<span class="bracket-team-badge">${badge}</span>` : ''}</div>`;
  }

  function slotPlaceholder(ctx, node, slot) {
    const f = ctx.connections.find((c) => c.toMatchId === node.id && c.toSlot === slot);
    if (f && f.fromOutcome === 'loser') return 'Из верхней сетки';
    return '—';
  }

  function roundTitle(kind, round, roundsTotal) {
    if (kind === 'upper') {
      if (round === roundsTotal - 1) return 'Финал';
      if (round === roundsTotal - 2) return 'Полуфинал';
      if (round === roundsTotal - 3 && roundsTotal >= 3) return 'Четвертьфинал';
    } else if (round === roundsTotal - 1) {
      return 'Финал';
    }
    return `Раунд ${round + 1}`;
  }

  function isVisible(n) { return !n.dead; } // dead:'bye' (проход без игры) и 'void' (матча нет) не рисуем

  /** Строит один «борд» (верхняя или нижняя сетка): колонки-раунды, карточки матчей, линии-связи. */
  function renderBoard(ctx, boardEl, kind) {
    const bracketName = kind === 'upper' ? 'winners' : 'losers';
    const nodes = ctx.nodes.filter((n) => n.bracket === bracketName);
    if (!nodes.length) {
      boardEl.innerHTML = '<div class="de-empty">Для 2–3 команд нижней сетки нет — сгенерируйте от 4.</div>';
      return;
    }
    const rounds = new Map();
    nodes.forEach((n) => { if (!rounds.has(n.round)) rounds.set(n.round, []); rounds.get(n.round).push(n); });
    const roundIdx = Array.from(rounds.keys()).sort((a, b) => a - b);
    const firstCount = rounds.get(roundIdx[0]).length; // число строк «сетки-основы»: матчи первого раунда стоят вплотную
    const shownRounds = roundIdx.filter((r) => rounds.get(r).some(isVisible)); // колонки без единого настоящего матча (например, весь раунд — BYE) не показываем
    const colOf = new Map(shownRounds.map((r, i) => [r, i + 1]));
    const cards = [];
    const html = [];
    shownRounds.forEach((r) => {
      html.push(`<div class="de-round-title" style="grid-column:${colOf.get(r)};grid-row:1">${ctx.esc(roundTitle(kind, roundIdx.indexOf(r), roundIdx.length))}</div>`);
    });
    roundIdx.forEach((r) => {
      if (!colOf.has(r)) return;
      const list = rounds.get(r);
      const span = Math.max(1, Math.round(firstCount / list.length));
      list.forEach((n, i) => {
        const current = n.teamAId && n.teamBId && !n.winnerId;
        const cls = 'de-match' + (current ? ' de-current' : '') + (isVisible(n) ? '' : ' de-ghost');
        html.push(`<div class="${cls}" data-de-id="${ctx.esc(n.id)}" style="grid-column:${colOf.get(r)};grid-row:${2 + i * span} / span ${span}">${plateHtml(ctx, n, n.teamAId, slotPlaceholder(ctx, n, 'A'))}${plateHtml(ctx, n, n.teamBId, slotPlaceholder(ctx, n, 'B'))}</div>`);
        cards.push(n);
      });
    });
    const cols = shownRounds.length || 1;
    boardEl.innerHTML = `<div class="de-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:auto repeat(${firstCount},minmax(0,1fr))"><svg class="de-lines" xmlns="http://www.w3.org/2000/svg"></svg>${html.join('')}</div>`;
    const gridEl = boardEl.firstElementChild;
    const links = ctx.connections.filter((c) => c.fromOutcome !== 'loser'
      && cards.some((n) => n.id === c.fromMatchId && isVisible(n)) && cards.some((n) => n.id === c.toMatchId && isVisible(n)));
    gridEl.__deLinks = links;
    drawLines(gridEl);
    watchResize(gridEl);
  }

  /** Линии между карточками: от правой середины матча-источника к левой середине следующего, «ступенькой». */
  function drawLines(gridEl) {
    const svg = gridEl.querySelector('.de-lines');
    if (!svg) return;
    const w = gridEl.clientWidth, h = gridEl.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    const byId = new Map();
    gridEl.querySelectorAll('.de-match').forEach((el) => byId.set(el.dataset.deId, el));
    const paths = [];
    (gridEl.__deLinks || []).forEach((c) => {
      const a = byId.get(c.fromMatchId), b = byId.get(c.toMatchId);
      if (!a || !b) return;
      const x1 = a.offsetLeft + a.offsetWidth, y1 = a.offsetTop + a.offsetHeight / 2;
      const x2 = b.offsetLeft, y2 = b.offsetTop + b.offsetHeight / 2;
      if (x2 <= x1) return;
      const xm = x1 + (x2 - x1) / 2;
      paths.push(`<path d="M${x1} ${y1} H${xm} V${y2} H${x2}"/>`);
    });
    svg.innerHTML = paths.join('');
  }

  const observers = new WeakMap();
  function watchResize(gridEl) {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawLines(gridEl));
    ro.observe(gridEl);
    observers.set(gridEl, ro); // старая сетка при перерисовке удаляется из DOM — вместе с ней уходит и наблюдатель (GC)
    // карточки меняют высоту при смене шрифтов/масштаба панели без изменения размера самой сетки — перерисуем линии ещё раз после раскладки
    requestAnimationFrame(() => drawLines(gridEl));
  }

  function renderFinal(ctx, finalEl) {
    const gf = ctx.nodes.find((n) => n.bracket === 'grandfinal');
    const gr = ctx.nodes.find((n) => n.bracket === 'grandreset');
    if (!gf) { finalEl.innerHTML = '<div class="de-empty">Гранд-финала нет.</div>'; return; }
    const box = (node, title, phA, phB) => {
      const current = node.teamAId && node.teamBId && !node.winnerId;
      return `<div class="de-final-box${current ? ' de-current' : ''}"><h3>${ctx.esc(title)}</h3><div class="de-final-plates">${plateHtml(ctx, node, node.teamAId, phA)}<span class="bracket-match-vs">VS</span>${plateHtml(ctx, node, node.teamBId, phB)}</div></div>`;
    };
    let html = box(gf, 'Гранд-финал', 'Чемпион верхней сетки', 'Чемпион нижней сетки');
    if (gr && !gr.dead) html += box(gr, 'Решающий матч', 'Чемпион верхней сетки', 'Чемпион нижней сетки');
    const finalNode = gr && !gr.dead ? gr : gf;
    const champ = finalNode.winnerId ? ctx.teams.get(finalNode.winnerId) : null;
    if (champ) html += `<div class="de-champion"><div class="de-champion-label">Чемпион</div><div class="de-champion-body">${logoHtml(champ, ctx.esc)}<span class="de-champion-name">${ctx.esc(champ.name)}</span></div></div>`;
    finalEl.innerHTML = html;
  }

  /**
   * opts: { bracket, upperEl, lowerEl, finalEl, esc?, interactive?: { onPick(matchId, teamId), onReset(matchId) } }
   * interactive (только админка): клик по плашке матча, где уже есть оба соперника, назначает победителя;
   * правая кнопка по плашке сыгранного матча — отменяет результат (и всё, что из него вытекало).
   */
  function render(opts) {
    const bracket = opts.bracket;
    const esc = opts.esc || defaultEsc;
    const ctx = {
      nodes: bracket.nodes || [], connections: bracket.connections || [], esc,
      teams: new Map((bracket.teams || []).map((t) => [t.id, t])),
      interactive: !!opts.interactive,
    };
    renderBoard(ctx, opts.upperEl, 'upper');
    renderBoard(ctx, opts.lowerEl, 'lower');
    renderFinal(ctx, opts.finalEl);
    if (opts.interactive) {
      const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
      [opts.upperEl, opts.lowerEl, opts.finalEl].forEach((el) => {
        el.querySelectorAll('[data-team-id]').forEach((plate) => {
          const node = byId.get(plate.dataset.matchId);
          if (!node) return;
          plate.style.pointerEvents = 'auto'; // родительская панель в редакторе pointer-events:none — включаем обратно только на плашках
          if (!node.winnerId && node.teamAId && node.teamBId) {
            plate.style.cursor = 'pointer';
            plate.addEventListener('click', (evt) => { evt.stopPropagation(); opts.interactive.onPick(node.id, plate.dataset.teamId); });
          } else if (node.winnerId) {
            plate.title = 'Правая кнопка — отменить результат этого матча';
          }
          plate.addEventListener('contextmenu', (evt) => {
            evt.preventDefault(); evt.stopPropagation();
            if (node.winnerId) opts.interactive.onReset(node.id);
          });
        });
      });
    }
  }

  root.BracketDE = { render, TITLES };
})(typeof window !== 'undefined' ? window : globalThis);
