// clip.js — надёжное копирование в буфер для всей админки.
// navigator.clipboard в окне-оболочке/без фокуса молча зависает или отказывает, а повторная попытка после await
// уже не считается жестом пользователя. Поэтому сначала копируем синхронно (execCommand в момент клика),
// и только потом пробуем штатный API с таймаутом. Все существующие вызовы writeText работают как раньше.
(function () {
  'use strict';
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = String(text); ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    const prev = document.activeElement;
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (prev && prev.focus) { try { prev.focus({ preventScroll: true }); } catch (e) { /* не важно */ } }
    return ok;
  }
  const native = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null;
  const write = (text) => {
    if (legacyCopy(text)) return Promise.resolve();
    if (!native) return Promise.reject(new Error('clipboard unavailable'));
    return Promise.race([native(text), new Promise((_, rej) => setTimeout(() => rej(new Error('clipboard timeout')), 1500))]);
  };
  try {
    if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { value: write, configurable: true });
    else Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
  } catch (e) {
    try { navigator.clipboard.writeText = write; } catch (e2) { /* оставим как есть */ }
  }
  window.ovCopy = (text) => write(text).then(() => true, () => false);
})();
