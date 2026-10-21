/* Только для проверок/скриншотов: ?demobg=1|game кладёт картинку-«игру» под виджеты, чтобы был виден эффект стекла. На вид оверлея в OBS не влияет. */
(function () {
  var q = new URLSearchParams(location.search), v = q.get('demobg');
  if (!v) return;
  function go() { document.body.style.background = v === 'game' ? 'linear-gradient(135deg,#2b3a2a,#3a3a30 45%,#1d2630)' : 'radial-gradient(900px 600px at 20% 30%, #3b6a3a, transparent 60%), radial-gradient(900px 700px at 80% 70%, #7a4a2a, transparent 60%), linear-gradient(135deg,#243b55,#141e30)'; }
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();
