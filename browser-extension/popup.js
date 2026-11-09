const $ = (id) => document.getElementById(id);
let S = { ...OD_DEFAULTS };
function draw() {
  document.querySelectorAll('.sw,.ch').forEach((e) => e.classList.toggle('on', !!S[e.dataset.k]));
  $('src').style.display = S.emotes ? '' : 'none';
  $('relayBox').hidden = !S.hd;
  if (document.activeElement !== $('relay')) $('relay').value = S.relay || '';
  if (document.activeElement !== $('port')) $('port').value = S.port;
  $('ptsS').textContent = S.ptsCount ? 'собрано раз: ' + S.ptsCount : 'нажимать сундучок сам';
  const fresh = Date.now() - (S.lastOk || 0) < 5000;
  $('dot').className = 'd ' + (fresh ? 'ok' : 'bad');
  $('stt').textContent = fresh ? 'связь с Overdeck' : 'нет связи с Overdeck';
  $('hdS').textContent = S.hd ? (S.hdErr ? 'ошибка: ' + S.hdErr : S.hdOn ? 'плейлист идёт через релей' : 'укажи адрес релея') : 'может не сработать';
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
}
async function load() { S = { ...OD_DEFAULTS, ...(await chrome.storage.local.get({ ...OD_DEFAULTS, lastOk: 0, hdErr: '', hdOn: false })) }; draw(); }
document.querySelectorAll('.sw,.ch').forEach((e) => e.addEventListener('click', async () => { const k = e.dataset.k; S[k] = !S[k]; await chrome.storage.local.set({ [k]: S[k] }); draw(); }));
$('relay').addEventListener('change', async () => { await chrome.storage.local.set({ relay: $('relay').value.trim() }); setTimeout(load, 300); });
$('port').addEventListener('change', async () => { await chrome.storage.local.set({ port: Number($('port').value) || 3001 }); load(); });
load(); setInterval(load, 1000);
