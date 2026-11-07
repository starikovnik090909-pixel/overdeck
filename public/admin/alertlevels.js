// Алерты: переключатель «Основные / Дополнительные» над настройками каждого алерта.
// Основное: вкл/выкл, вид (наш или свой «стандартный»), порог (от какой суммы), время показа, звук и голос.
// Всё остальное — в «Дополнительных». Список ниже: что считается дополнительным (остальное — основное).
(function () {
  const CUSTOM_ADV = ['customShowMsg', 'customPos', 'customAnim', 'customFontSize', 'customTextColor', 'customAccent'];
  const ADV = {
    da: ['maxLength', 'lookPos', 'receiptTitle', 'scale', 'flySec', 'plateOpacity', 'showSource', 'texture', 'texDim', 'texOpacity',
      'glow', 'glowPower', 'frameW', 'typeText', 'pulse', 'tiers', 'tier1', 'tier2', 'tier3', 'donorStat', 'timeBar',
      'readNick', 'genderVerb', 'genderUnknown', 'genderList', 'readMessage', 'soundPrint', 'soundTear', ...CUSTOM_ADV],
    ev_sub: ['color', 'showNumber', 'numberStart', 'voiceVolume', 'speechNew', 'speechResub', 'speechGift', 'customImgSize', ...CUSTOM_ADV],
    ev_raid: ['showGame', 'siren', 'color', 'voiceVolume', 'speech'],
    ev_follow: ['color', 'big', 'wallsync', 'voiceVolume', 'speech', 'customImgSize', ...CUSTOM_ADV],
    ev_hype: ['color', 'voiceVolume', 'speechBegin', 'speechLevel', 'speechEnd'],
    ev_points: ['color', 'voiceVolume', 'readMessage', 'speech'],
    ev_streak: ['showPoints', 'corner', 'size', 'color', 'voiceVolume', 'speech'],
    ev_nowplaying: ['size', 'bgOpacity', 'color', 'showSource', 'showOthers', 'hideDelaySec', 'minDurationSec', 'browsers', 'ignoreApps'],
  };
  const GOAL_ADV = ['goalScale', 'goalPosBox', 'goalShared', 'goalObsUrl'];
  const KEY = 'daLevel';
  let mode = 'main';
  try { mode = localStorage.getItem(KEY) === 'adv' ? 'adv' : 'main'; } catch (e) {}

  const sets = []; // {card, rows:[{el,adv}]}
  const wrap = (el) => el && (el.closest('.toggle-row, .field') || el.parentElement);

  function build(card, prefixes, goal) {
    if (!card || card.dataset.lvl) return;
    card.dataset.lvl = '1';
    const rows = [];
    if (goal) {
      const ids = ['goalEnabled', 'goalTitle', 'goalTarget', 'goalCurrency', 'goalAmount', 'goalSoundEnabled', 'goalVolume', 'goalScale', 'goalPosBox', 'goalShared', 'goalObsUrl'];
      ids.forEach((id) => { const e = document.getElementById(id); const w = id === 'goalPosBox' ? e : wrap(e); if (w) rows.push({ el: w, adv: GOAL_ADV.includes(id) }); });
      // карточка цели: всё, что не перечислено выше, считаем основным
    } else {
      Object.entries(prefixes).forEach(([pre, list]) => {
        card.querySelectorAll(`[id^="${pre}_"]`).forEach((e) => {
          const k = e.id.slice(pre.length + 1);
          if (/_(v|pv|up|del|clr|file|img|st)$/.test(k) || /^t_/.test(k)) return;
          const w = e.closest('.toggle-row, .field'); if (!w || rows.some((r) => r.el === w)) return;
          rows.push({ el: w, adv: list.includes(k) });
        });
      });
    }
    const head = card.querySelector('.section-title') || card.firstElementChild;
    const bar = document.createElement('div');
    bar.className = 'lvl-bar';
    bar.innerHTML = '<button type="button" data-l="main">Основные</button><button type="button" data-l="adv">Дополнительные <i></i></button>';
    bar.querySelector('i').textContent = rows.filter((r) => r.adv).length || '';
    bar.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) set(b.dataset.l); });
    head.insertAdjacentElement(head.classList.contains('section-title') ? 'afterend' : 'beforebegin', bar);
    sets.push({ card, rows, bar });
  }

  function paint() {
    sets.forEach(({ card, rows, bar }) => {
      rows.forEach((r) => r.el.classList.toggle('lvl-hide', (mode === 'adv') !== r.adv));
      card.querySelectorAll('details.da-group').forEach((d) => {
        const ws = [...d.querySelectorAll('.toggle-row, .field')];
        d.classList.toggle('lvl-hide', !!(ws.length && ws.every((w) => w.classList.contains('lvl-hide'))));
        if (!d.classList.contains('lvl-hide')) d.open = true;
      });
      bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.l === mode));
    });
  }
  function set(m) { mode = m; try { localStorage.setItem(KEY, m); } catch (e) {} paint(); }

  function init() {
    build(document.getElementById('daCfgCard'), { da: ADV.da });
    document.querySelectorAll('.da-evpane[data-kind]').forEach((p) => {
      const kind = p.dataset.kind; const c = p.querySelector('[data-a="cfgcard"]');
      build(c, { ['ev_' + kind]: ADV['ev_' + kind] || [] });
    });
    const g = document.getElementById('goalEnabled'); if (g) build(g.closest('.card'), null, true);
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);
})();
