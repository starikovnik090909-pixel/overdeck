// Телеграм: левое меню шагов вместо длинной страницы
(function () {
  const sec = document.getElementById('tab-telegram'); if (!sec) return;
  const grid = sec.querySelector('.tg-grid'), life = sec.querySelector('.tg-life'); if (!grid || !life) return;
  const ic = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const items = [
    ['conn', 'Подключение', 'Канал и бот', ic('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'), '<u class="tg-dot"></u>'],
    ['start', 'Старт стрима', 'Текст и кнопки анонса', ic('<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>'), ''],
    ['cat', 'Смена игры', 'Что с постом', ic('<path d="M4 4h16v12H4zM8 20h8"/>'), ''],
    ['end', 'Конец стрима', 'Итоги эфира', ic('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'), ''],
    ['chr', 'Хроники', 'Карточки журнала', ic('<path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/>'), ''],
  ];
  const nav = document.createElement('div'); nav.className = 'tg-nav';
  nav.innerHTML = items.map(([k, t, s, i, x]) => `<button type="button" data-p="${k}">${i}<em><b>${t}</b><small>${s}</small></em>${x}</button>`).join('');
  sec.querySelector('.page-head').insertAdjacentElement('afterend', nav);
  const show = (k) => { sec.dataset.p = k; nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === k)); try { localStorage.setItem('tgPane', k); } catch (e) {} };
  nav.addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (b) show(b.dataset.p); });
  let k = 'conn'; try { k = localStorage.getItem('tgPane') || 'conn'; } catch (e) {}
  show(items.some((i) => i[0] === k) ? k : 'conn');
  // индикатор подключения
  const linked = document.getElementById('tgLinked');
  const dot = () => { nav.dataset.ok = linked && !linked.hidden ? '1' : ''; };
  if (linked) new MutationObserver(dot).observe(linked, { attributes: true, attributeFilter: ['hidden'] });
  dot(); setTimeout(dot, 1500);
  // шаблоны: список вместо десяти кнопок
  const pres = document.getElementById('tgPresets'), tpl = document.getElementById('tgTpl');
  if (pres && tpl) {
    const wrap = document.createElement('div'); wrap.className = 'tg-tplbar';
    wrap.innerHTML = '<span>Шаблон</span><select id="tgTplSel" class="ui3-select"></select>';
    pres.insertAdjacentElement('beforebegin', wrap);
    const sel = wrap.querySelector('select');
    const sync = () => {
      const bs = [...pres.querySelectorAll('button')];
      sel.innerHTML = bs.map((b, i) => `<option value="${i}" title="${b.title || ''}">${b.textContent}</option>`).join('') + '<option value="-1">Свой текст</option>';
      const on = bs.findIndex((b) => b.classList.contains('on')); sel.value = String(on);
    };
    new MutationObserver(sync).observe(pres, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    tpl.addEventListener('input', () => setTimeout(sync, 0));
    sel.addEventListener('change', () => { const b = pres.querySelectorAll('button')[Number(sel.value)]; if (b) b.click(); });
    sync();
  }
})();
