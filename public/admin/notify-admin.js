// notify-admin.js — настройки уведомлений в углу рабочего стола (карточка в «Настройках админки» и окно «Что показывать»).
(function () {
  'use strict';
  const J = (u, b) => fetch(u, b === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => null);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sec = document.getElementById('tab-admin-settings');
  if (!sec) return;
  let st = null;

  const css = document.createElement('style');
  css.textContent = `
  .nt-card{max-width:700px}
  .nt-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid var(--divider)}
  .nt-row .l{display:flex;flex-direction:column;min-width:0}.nt-row .l b{font-weight:600}.nt-row .l span{font-size:12px;color:var(--text-secondary)}
  .nt-row select{background:var(--bg-card2);color:var(--text-primary);border:1px solid var(--line2);border-radius:var(--radius-md);padding:7px 10px;font:inherit}
  .nt-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .nt-status{font-size:12px;margin-top:10px;color:var(--text-secondary)}.nt-status.bad{color:var(--err)}
  .nt-ov{position:fixed;inset:0;z-index:2200;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:20px}
  .nt-ov[hidden]{display:none}
  .nt-pop{width:min(860px,100%);max-height:min(82vh,760px);display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--line2);border-radius:14px;overflow:hidden}
  .nt-hd{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--divider)}
  .nt-hd h3{margin:0;font-size:17px}.nt-hd p{margin:2px 0 0;font-size:12.5px;color:var(--text-secondary)}
  .nt-x{background:none;border:0;color:var(--text-secondary);font-size:22px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:8px}
  .nt-x:hover{background:var(--bg-hover);color:var(--text-primary)}
  .nt-body{padding:16px 18px 20px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:12px;align-items:start}
  .nt-blk{background:var(--bg-card2);border:1px solid var(--divider);border-radius:12px;padding:12px 14px 6px;min-width:0}
  .nt-blk h4{margin:0 0 4px;font-size:14px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  .nt-blk h4 small{font-weight:400;font-size:11px;color:var(--text-mute)}
  .nt-lv{display:flex;align-items:center;gap:6px;margin:8px 0 2px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-mute)}
  .nt-lv i{width:7px;height:7px;border-radius:50%;background:var(--c)}
  .nt-ev{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid var(--divider)}
  .nt-ev .l{display:flex;flex-direction:column;min-width:0}.nt-ev .l b{font-weight:500;font-size:13px}.nt-ev .l span{font-size:11.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .nt-hist{grid-column:1/-1}
  .nt-hrow{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--divider);font-size:12.5px}
  .nt-hrow i{width:7px;height:7px;border-radius:50%;background:var(--c)}.nt-hrow em{font-style:normal;color:var(--text-mute);font-size:11px}
  `;
  document.head.appendChild(css);

  const LV = { crit: 'var(--err)', err: 'var(--err)', warn: 'var(--warn)', ok: 'var(--ok)', info: 'var(--text-secondary)' };
  const toast = (t, e) => window.ui3Toast && window.ui3Toast(t, e);
  const sw = (id, on) => `<label class="toggle-switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><span class="toggle-slider"></span></label>`;

  const card = document.createElement('div');
  card.className = 'card nt-card'; card.id = 'ntCard';
  const key = document.getElementById('keyCard');
  if (key && key.parentNode) key.parentNode.insertBefore(card, key.nextSibling); else sec.appendChild(card);

  function status() {
    const el = card.querySelector('.nt-status'); if (!el || !st) return;
    el.classList.remove('bad');
    if (!st.windows) el.textContent = 'Плашки рисует Windows. На этом компьютере они не показываются, но события пишутся в журнал.';
    else if (st.host === 'failed') { el.classList.add('bad'); el.textContent = 'Окно уведомлений не запустилось' + (st.hostError ? ': ' + st.hostError : '') + '. Перезапусти Overdeck.'; }
    else el.textContent = 'Плашки появляются в углу рабочего стола, пока работает Overdeck.';
  }
  function draw() {
    const s = st.settings;
    card.innerHTML = `<h2 class="section-title">Уведомления на рабочем столе</h2>
      <p class="card-hint">Маленькие плашки в углу экрана Windows: «Источники OBS обновлены», «Анонс в Telegram не доставлен». Не берут фокус, не мешают играм и стриму.</p>
      <div class="nt-row"><div class="l"><b>Показывать уведомления</b><span>Общий выключатель</span></div>${sw('ntOn', s.enabled)}</div>
      <div class="nt-row"><div class="l"><b>Подробности под заголовком</b><span>Короткая подпись: что именно случилось</span></div>${sw('ntDet', s.details)}</div>
      <div class="nt-row"><div class="l"><b>Только ошибки и предупреждения</b><span>Успешные проверки молчат</span></div>${sw('ntErr', s.onlyErrors)}</div>
      <div class="nt-row"><div class="l"><b>Угол экрана</b><span>Откуда выезжают плашки</span></div>
        <select id="ntCorner"><option value="br">Справа внизу</option><option value="bl">Слева внизу</option><option value="tr">Справа вверху</option><option value="tl">Слева вверху</option></select></div>
      <div class="nt-acts"><button class="btn btn-primary" id="ntDemo" type="button">Показать пример</button><button class="btn btn-secondary" id="ntList" type="button">Что показывать…</button></div>
      <div class="nt-status"></div>`;
    card.querySelector('#ntCorner').value = s.corner;
    status();
    const save = () => J('/api/notify/settings', { enabled: card.querySelector('#ntOn').checked, details: card.querySelector('#ntDet').checked, onlyErrors: card.querySelector('#ntErr').checked, corner: card.querySelector('#ntCorner').value }).then((r) => { if (r && r.success) { st = r; status(); } });
    ['#ntOn', '#ntDet', '#ntErr', '#ntCorner'].forEach((q) => card.querySelector(q).addEventListener('change', save));
    card.querySelector('#ntDemo').addEventListener('click', () => J('/api/notify/test', {}).then((r) => { if (r) { st = r; status(); } if (r && r.windows && r.host !== 'failed') toast('Пример показан в углу экрана'); else if (r && !r.windows) toast('Плашки работают только на Windows', true); else toast('Окно уведомлений не запущено', true); }));
    card.querySelector('#ntList').addEventListener('click', openList);
  }

  let ov = null;
  function openList() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'nt-ov'; ov.hidden = true;
      ov.innerHTML = '<div class="nt-pop" role="dialog" aria-modal="true" aria-label="Что показывать"><div class="nt-hd"><div><h3>Что показывать</h3><p>Блоки по темам, внутри каждого сначала самое важное.</p></div><button class="nt-x" type="button" aria-label="Закрыть">×</button></div><div class="nt-body" id="ntBody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.hidden = true; });
      ov.querySelector('.nt-x').addEventListener('click', () => { ov.hidden = true; });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov && !ov.hidden) ov.hidden = true; });
    }
    J('/api/notify').then((r) => { if (r && r.success) st = r; fillList(); ov.hidden = false; });
  }
  function fillList() {
    const body = ov.querySelector('#ntBody');
    const blocks = st.groups.map((g) => {
      let last = ''; const rows = g.events.map((e) => {
        const head = e.level !== last ? `<div class="nt-lv" style="--c:${LV[e.level]}"><i></i>${esc(e.levelName)}</div>` : ''; last = e.level;
        return head + `<div class="nt-ev"><div class="l"><b>${esc(e.title)}</b><span>${esc(e.text)}</span></div>${sw('nt_' + e.id.replace(/\W/g, '_'), e.on).replace('type="checkbox"', 'type="checkbox" data-ev="' + esc(e.id) + '"')}</div>`;
      }).join('');
      return `<div class="nt-blk"><h4>${esc(g.title)}<small>${g.events.length}</small></h4>${rows}</div>`;
    }).join('');
    const hist = st.history && st.history.length ? `<div class="nt-blk nt-hist"><h4>Недавние<small>последние ${st.history.length}</small></h4>${st.history.map((h) => `<div class="nt-hrow" style="--c:${LV[h.level]}"><i></i><span>${esc(h.title)}</span><em>${new Date(h.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}${h.shown ? '' : ' · не показано'}</em></div>`).join('')}</div>` : '';
    body.innerHTML = blocks + hist;
    body.querySelectorAll('input[data-ev]').forEach((i) => i.addEventListener('change', () => {
      const ev = {}; ev[i.dataset.ev] = i.checked;
      J('/api/notify/settings', { events: ev }).then((r) => { if (r && r.success) st = r; });
    }));
  }

  J('/api/notify').then((r) => { if (r && r.success) { st = r; draw(); } });
})();
