// Сцена: правая панель с переключателем «Положение / Настройки» — настройки виджета больше не прячутся внизу
(function () {
  const side = document.querySelector('#tab-widgets .widgets-side-col');
  const props = document.getElementById('widgetProps'), set = document.getElementById('widgetContentSettings'), title = document.getElementById('wpTitle'), list = document.getElementById('widgetList');
  if (!side || !props || !set) return;
  const bar = document.createElement('div'); bar.className = 'si-tabs';
  bar.innerHTML = '<button type="button" data-m="pos">Положение</button><button type="button" data-m="set"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>Настройки</button>';
  side.insertBefore(bar, side.firstChild);
  const hasSet = () => set.style.display !== 'none' && set.style.display !== '';
  let mode = 'set';
  const paint = () => {
    const hs = hasSet(); if (!hs) mode = 'pos';
    side.dataset.m = mode; side.dataset.hs = hs ? '1' : '';
    bar.querySelector('[data-m="set"]').disabled = !hs;
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  };
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) { mode = b.dataset.m; paint(); } });
  // выбрали другой блок — сразу показываем его настройки, если они есть
  let last = '';
  new MutationObserver(() => { if (title.textContent !== last) { last = title.textContent; mode = 'set'; } paint(); }).observe(title, { childList: true, characterData: true, subtree: true });
  new MutationObserver(paint).observe(set, { attributes: true, attributeFilter: ['style'] });
  paint();
  // шестерёнка у слоёв, у которых есть настройки
  const mark = () => {
    const ids = (window.__widgetSchemaIds && window.__widgetSchemaIds()) || [];
    list.querySelectorAll('.wicon').forEach((r) => { const has = ids.includes(r.dataset.id); r.dataset.hs = has ? '1' : ''; if (has && !r.querySelector('.wgear')) { const g = document.createElement('i'); g.className = 'wgear'; g.title = 'Есть настройки'; g.textContent = '⚙'; const st = r.querySelector('.wstate'); st ? r.insertBefore(g, st) : r.appendChild(g); } });
  };
  new MutationObserver(mark).observe(list, { childList: true }); mark(); setTimeout(mark, 1500);
})();
