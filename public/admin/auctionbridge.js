// auctionbridge.js (админка) — вкладка «Аукцион»: старт и стоп, взносы, награда на Twitch, настройки расчёта, токен PointAuc.
(function () {
  'use strict';
  const sec = document.getElementById('tab-auctionbridge');
  if (!sec) return;
  const $ = (s) => sec.querySelector(s);
  const api = (p, o) => fetch(p, o).then((r) => r.json());
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let st = null;

  function msg(t, bad) { const e = $('#abMsg'); e.textContent = t || ''; e.className = 'form-message' + (bad ? ' error' : ' success'); clearTimeout(msg.t); if (t) msg.t = setTimeout(() => { e.textContent = ''; }, 4000); }
  function hint() {
    const per = +$('#abPer').value || 0, cap = +$('#abCap').value || 0, sub = +$('#abSub').value || 0, vip = +$('#abVip').value || 0;
    const lv = per > 0 ? Math.ceil(cap / per) : 0;
    $('#abHint').textContent = 'Уровни перестают копить бонус на ' + lv + ' уровне (' + cap + '). Самый большой взнос: ' + (sub + vip + cap) + '.';
  }
  function fillSettings(s) {
    $('#abTitle').value = s.rewardTitle; $('#abCost').value = s.rewardCost; $('#abSub').value = s.subBonus; $('#abVip').value = s.vipBonus; $('#abPer').value = s.perLevel; $('#abCap').value = s.levelCap; $('#abChat').checked = s.chatReply;
    $('#abToken').value = ''; $('#abToken').placeholder = s.hasToken ? 'сохранён ' + s.tokenPreview + ' (оставь пустым, чтобы не менять)' : 'вставь токен';
    $('#abTokHint').textContent = s.hasToken ? 'Токен сохранён. Он хранится только на этом компьютере и не показывается.' : 'Без токена ставки в PointAuc отправить нельзя.';
    hint();
  }
  function render(r, first) {
    st = r; const a = r.state;
    $('#abPwr').classList.toggle('on', a.active); $('#abPwrT').textContent = a.active ? 'Аукцион идёт' : 'Аукцион не идёт';
    $('#abSum').textContent = (!a.active && a.markOf === 'last') ? 'Аукцион закончен. Отметь победивший лот: зритель получит очко достижения «Золотой лот», бот напишет в чат.' : a.active ? ('Внесли: ' + a.contributors.length + ', сумма ' + a.total + '.') : 'Аукцион не идёт. Нажми переключатель сверху, чтобы начать: награда включится на Twitch.';
    const items = (a.markable || []).map((c) => '<div class="ab-it"><span><b>' + esc(c.login) + '</b> — ' + esc(c.lot) + '</span><span class="ab-r"><b>' + c.amount + '</b><button type="button" class="ab-win' + (c.won ? ' on' : '') + '" data-login="' + esc(c.login) + '" data-won="' + (c.won ? 0 : 1) + '" title="Отметить, что этот лот победил: зритель получит очко достижения «Золотой лот»">' + (c.won ? '★ Победил' : '☆ Победил?') + '</button></span></div>');
    const errs = a.log.filter((l) => l.status !== 'sent').slice(0, 6).map((l) => '<div class="ab-it err"><span>' + esc(l.name || l.login) + ': ' + esc(l.text) + '</span></div>');
    $('#abList').innerHTML = items.concat(errs).join('') || '<div class="ab-hint">Пока никто не внёс.</div>';
    const w = r.reward; const rw = $('#abRw'); rw.textContent = w.text || 'Награда ещё не проверялась.'; rw.className = 'ab-rw' + (w.state === 'ok' ? ' ok' : (w.state === 'idle' ? '' : ' bad'));
    $('#abRwMake').hidden = w.state === 'ok';
    if (first || !sec.dataset.dirty) fillSettings(r.settings);
  }
  $('#abList').addEventListener('click', async (e) => {
    const b = e.target.closest('.ab-win'); if (!b) return;
    b.disabled = true;
    try { const r = await post('/api/auction-bridge/win', { login: b.dataset.login, won: b.dataset.won === '1' }); if (r.success) { render(r); msg(b.dataset.won === '1' ? ('Лот «' + r.lot + '» отмечен победившим. Побед у зрителя: ' + r.wins + '.') : 'Отметка снята.'); } else msg(r.error || 'Не вышло.', true); } catch (err) { msg('Не вышло: ' + err.message, true); }
    b.disabled = false;
  });
  async function load(first) { try { const r = await api('/api/auction-bridge'); if (r.success) render(r, first); } catch (e) { /* сервер перезапускается */ } }
  sec.addEventListener('input', (e) => { if (e.target.closest('.ab-col')) sec.dataset.dirty = '1'; hint(); });
  $('#abPwr').addEventListener('click', async () => {
    const on = st && st.state.active;
    if (on && !window.confirm('Закончить аукцион? Награда выключится, новые взносы не принимаются.')) return;
    const r = await post(on ? '/api/auction-bridge/stop' : '/api/auction-bridge/start');
    if (!r.success) return msg(r.error || 'Не получилось.', true);
    msg(on ? 'Аукцион закончен: взносов ' + r.finished.count + ', сумма ' + r.finished.total + '.' : 'Аукцион начался.'); render(r, false);
  });
  $('#abSave').addEventListener('click', async () => {
    const b = { rewardTitle: $('#abTitle').value, rewardCost: +$('#abCost').value, subBonus: +$('#abSub').value, vipBonus: +$('#abVip').value, perLevel: +$('#abPer').value, levelCap: +$('#abCap').value, chatReply: $('#abChat').checked };
    const t = $('#abToken').value.trim(); if (t) b.token = t;
    const r = await post('/api/auction-bridge/settings', b); if (!r.success) return msg('Не сохранилось.', true);
    delete sec.dataset.dirty; msg('Сохранено.'); render(r, true);
  });
  $('#abRwMake').addEventListener('click', async () => { const r = await post('/api/auction-bridge/reward/create'); render(r, false); msg(r.success ? 'Награда создана.' : (r.error || 'Не получилось.'), !r.success); });
  $('#abRwSync').addEventListener('click', async () => { const r = await post('/api/auction-bridge/reward/sync'); render(r, false); });
  async function preview(body) { const r = await post('/api/auction-bridge/preview', body); const c = r.calc;
    $('#abPr').textContent = (body.login && !r.found ? 'Такого зрителя нет в профилях аватаров, считаем нулём. ' : '') + 'Уровень ' + c.level + ' → ' + c.levelBonus + (c.sub ? ' + подписка ' + c.subPart : '') + (c.vip ? ' + VIP ' + c.vipPart : '') + ' = ' + c.total; }
  $('#abPrGo').addEventListener('click', () => { const l = $('#abPrLogin').value.trim(); if (l) preview({ login: l }); });
  $('#abPrMan').addEventListener('click', () => preview({ level: +$('#abPrLvl').value, sub: $('#abPrSub').checked, vip: $('#abPrVip').checked }));
  const nav = document.querySelector('[data-tab="auctionbridge"]'); if (nav) nav.addEventListener('click', () => setTimeout(() => load(false), 50));
  setInterval(() => { if (sec.classList.contains('active')) load(false); }, 6000);
  load(true);
})();
