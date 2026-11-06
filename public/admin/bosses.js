// bosses.js (админка) — вкладка «Боссы» в ЧатАватарах: правка боссов, вызов, случайное появление, проверка баланса.
(function () {
  'use strict';
  const pane = document.getElementById('pixelPane-bosses');
  if (!pane) return;
  const $ = (s) => pane.querySelector(s);
  const api = (p, o) => fetch(p, o).then((r) => r.json());
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let st = null, editId = '', heroes = [], timer = 0;

  function msg(t, bad) { const e = $('#bsMessage'); e.textContent = t || ''; e.className = 'form-message' + (bad ? ' error' : ''); clearTimeout(msg.t); if (t) msg.t = setTimeout(() => { e.textContent = ''; }, 3500); }
  const fmtMs = (ms) => { const s = Math.round(ms / 1000), m = Math.floor(s / 60); return m ? m + ' мин ' + (s % 60) + ' с' : s + ' с'; };

  function fillForm(b) {
    editId = b ? b.id : '';
    $('#bsName').value = b ? b.name : ''; $('#bsPack').value = b ? b.pack : (heroes[0] ? heroes[0].id : '');
    const d = b || st.defaults;
    $('#bsHp').value = d.hpPerPlayer; $('#bsAc').value = d.ac; $('#bsHit').value = d.hit; $('#bsDie').value = String(d.dmgDie); $('#bsDmg').value = d.dmgBonus; $('#bsEvery').value = d.attackEvery;
    $('#bsXp').value = b ? b.xp : 60; $('#bsScale').checked = d.scaleByLevel !== false; $('#bsEnabled').checked = b ? b.enabled !== false : true;
    const have = new Set(b ? b.abilities : []);
    $('#bsAbilities').innerHTML = Object.entries(st.abilities).map(([id, a]) => '<label><input type="checkbox" data-ab="' + id + '"' + (have.has(id) ? ' checked' : '') + '><span>' + esc(a.title) + '<small>' + esc(a.hint) + '</small></span></label>').join('');
    $('#btnBsDel').hidden = !b;
  }
  function readForm() {
    return { id: editId || 'b' + Date.now().toString(36), name: $('#bsName').value, pack: $('#bsPack').value, hpPerPlayer: +$('#bsHp').value, ac: +$('#bsAc').value, hit: +$('#bsHit').value, dmgDie: +$('#bsDie').value, dmgBonus: +$('#bsDmg').value,
      attackEvery: +$('#bsEvery').value, xp: +$('#bsXp').value, scaleByLevel: $('#bsScale').checked, enabled: $('#bsEnabled').checked, abilities: [...pane.querySelectorAll('#bsAbilities input:checked')].map((i) => i.dataset.ab) };
  }
  function render(s, keepForm) {
    st = s; const keepSummon = $('#bsSummonPick').value;
    const opts = s.bosses.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>').join('');
    $('#bsPick').innerHTML = opts; $('#bsSummonPick').innerHTML = '<option value="random">Случайного</option>' + opts; if (keepSummon && [...$('#bsSummonPick').options].some((o) => o.value === keepSummon)) $('#bsSummonPick').value = keepSummon;
    if (!keepForm) { const b = s.bosses.find((x) => x.id === editId) || s.bosses[0]; $('#bsPick').value = b.id; fillForm(b); }
    else $('#bsPick').value = editId;
    const c = s.settings;
    if (document.activeElement.closest && !document.activeElement.closest('#bsRandom,#bsMin,#bsMax,#bsViewers')) { $('#bsRandom').checked = c.random; $('#bsMin').value = c.minMinutes; $('#bsMax').value = c.maxMinutes; $('#bsViewers').value = c.minViewers; $('#bsAnnounce').checked = c.announce; }
    const cur = s.current;
    $('#bsNow').innerHTML = cur ? '<b>Идёт бой:</b> ' + esc(cur.boss) + ', героев ' + cur.heroes + ', здоровье ' + cur.hp + '.' : (c.random && s.nextInMs != null ? 'Следующий босс примерно через ' + fmtMs(s.nextInMs) + '.' : 'Сейчас боя нет.');
    $('#btnBsSummon').disabled = !!cur;
    $('#bsLog').innerHTML = s.log.length ? s.log.map((l) => '<li>' + new Date(l.at).toLocaleString('ru-RU') + ' — ' + esc(l.boss) + ': ' + (l.won ? 'победа' : 'поражение') + ', героев ' + l.heroes + ', раундов ' + l.rounds + (l.mvp ? ', MVP ' + esc(l.mvp) : '') + (l.xpTotal ? ', опыта выдано ' + l.xpTotal : '') + ' (' + (l.who === 'random' ? 'случайный' : 'вручную') + ')</li>').join('') : '<li>Пока пусто.</li>';
  }
  async function load(keep) {
    try {
      if (!heroes.length) { const h = await api('/api/pixel-heroes'); heroes = (h.heroes || []).map((x) => ({ id: x.id, title: x.title || x.id })); $('#bsPack').innerHTML = heroes.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.title) + '</option>').join(''); }
      const r = await api('/api/bosses'); if (r.success) render(r, keep);
    } catch (e) { msg('Не удалось загрузить боссов.', true); }
  }
  async function save() {
    const r = await post('/api/bosses/save', readForm());
    if (!r.success) return msg(r.error || 'Не сохранилось.', true);
    editId = readForm().id; msg('Сохранено.'); render(r, false); $('#bsPick').value = editId; fillForm(st.bosses.find((b) => b.id === editId));
  }
  $('#bsPick').addEventListener('change', () => fillForm(st.bosses.find((b) => b.id === $('#bsPick').value)));
  $('#btnBsNew').addEventListener('click', () => { fillForm(null); $('#bsName').focus(); });
  $('#btnBsSave').addEventListener('click', () => save().catch((e) => msg(e.message, true)));
  $('#btnBsDel').addEventListener('click', async () => { if (!editId) return; const r = await post('/api/bosses/delete', { id: editId }); if (!r.success) return msg(r.error, true); editId = ''; msg('Удалён.'); render(r, false); });
  $('#btnBsSummon').addEventListener('click', async () => { const r = await post('/api/bosses/summon', { id: $('#bsSummonPick').value }); if (!r.success) return msg(r.error || 'Не удалось.', true); msg('Босс вызван!'); render(r.state, true); });
  $('#btnBsSettings').addEventListener('click', async () => {
    const r = await post('/api/bosses/settings', { random: $('#bsRandom').checked, minMinutes: +$('#bsMin').value, maxMinutes: +$('#bsMax').value, minViewers: +$('#bsViewers').value, announce: $('#bsAnnounce').checked });
    if (r.success) { msg('Настройки сохранены.'); render(r, true); }
  });
  $('#btnBsBalance').addEventListener('click', async () => {
    const out = $('#bsBalOut'); out.textContent = 'Считаю…';
    const r = await post('/api/bosses/balance', { boss: readForm(), heroes: +$('#bsBalN').value, level: +$('#bsBalL').value });
    if (!r.success) { out.textContent = r.error || 'Ошибка.'; return; }
    const x = r.result, good = x.winPct >= 40 && x.winPct <= 90;
    out.innerHTML = 'Герои побеждают в <b class="' + (good ? 'bs-bal-good' : 'bs-bal-bad') + '">' + x.winPct + '%</b> боёв, бой в среднем ' + x.rounds + ' раундов, выживает ' + x.survivePct + '% героев. Здоровье босса ' + x.hp + ', размер ×' + x.scale + '. ' + (good ? 'Хороший баланс.' : (x.winPct > 90 ? 'Слишком легко.' : 'Слишком тяжело.'));
  });
  document.querySelector('[data-pixel-pane="bosses"]').addEventListener('click', () => { load(false); clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !pane.hidden) load(true); }, 5000); });
  if (!pane.hidden) { load(false); timer = setInterval(() => { if (!document.hidden && !pane.hidden) load(true); }, 5000); }
})();
