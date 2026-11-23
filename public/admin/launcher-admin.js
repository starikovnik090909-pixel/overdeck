// launcher-admin.js — карточка «Лаунчер» в «Настройках админки»: звук и анимация запуска Overdeck.exe.
(function () {
  'use strict';
  const J = (u, b) => fetch(u, b === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => null);
  const sec = document.getElementById('tab-admin-settings');
  if (!sec) return;

  const css = document.createElement('style');
  css.textContent = `
  .lc-card{max-width:700px}
  .lc-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid var(--divider)}
  .lc-row .l{display:flex;flex-direction:column;min-width:0}.lc-row .l b{font-weight:600}.lc-row .l span{font-size:12px;color:var(--text-secondary)}
  .lc-note{font-size:12px;margin-top:10px;color:var(--text-secondary)}.lc-note.bad{color:var(--err)}
  `;
  document.head.appendChild(css);

  const sw = (id, on) => `<label class="toggle-switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><span class="toggle-slider"></span></label>`;
  const card = document.createElement('div');
  card.className = 'card lc-card'; card.id = 'lcCard';
  const anchor = document.getElementById('ntCard') || document.getElementById('keyCard');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling); else sec.appendChild(card);

  function draw(s) {
    card.innerHTML = `<h2 class="section-title">Лаунчер</h2>
      <p class="card-hint">Настройки окна Overdeck.exe. Действуют со следующего запуска лаунчера.</p>
      <div class="lc-row"><div class="l"><b>Звук при запуске</b><span>Тихий звук во время анимации заставки</span></div>${sw('lcSound', s.introSound)}</div>
      <div class="lc-row"><div class="l"><b>Пропускать анимацию запуска</b><span>Лаунчер сразу показывает окно, без заставки и звука</span></div>${sw('lcSkip', s.skipIntro)}</div>
      <div class="lc-note" id="lcNote"></div>`;
    const note = card.querySelector('#lcNote');
    const save = async (patch) => {
      const r = await J('/api/launcher-settings', patch);
      if (r && r.success) { note.classList.remove('bad'); note.textContent = 'Сохранено.'; if (window.ui3Toast) window.ui3Toast('Настройки лаунчера сохранены'); }
      else { note.classList.add('bad'); note.textContent = 'Не удалось сохранить' + (r && r.error ? ': ' + r.error : '.'); }
    };
    card.querySelector('#lcSound').addEventListener('change', (e) => save({ introSound: e.target.checked }));
    card.querySelector('#lcSkip').addEventListener('change', (e) => save({ skipIntro: e.target.checked }));
  }

  J('/api/launcher-settings').then((r) => { if (r && r.success) draw(r); });
})();
