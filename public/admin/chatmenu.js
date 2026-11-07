// Меню чата: одно выпадающее меню вместо россыпи кнопок
(function () {
  const btn = document.getElementById('chatMenuBtn'), menu = document.getElementById('chatMenu');
  if (!btn || !menu) return;
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); const o = menu.hidden; menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); });
  menu.addEventListener('click', (e) => { if (e.target.closest('.cm-item')) setTimeout(close, 0); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.cm-wrap')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
