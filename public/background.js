// public/background.js — background.html: полноэкранный фон трансляции.
// НЕ прозрачный (в отличие от остальных виджетов). Два слоя (#bgLayerA/B)
// друг над другом — переключение фона это просто взаимное затухание
// прозрачности: новый контент рисуется в СКРЫТЫЙ слой, затем ему включают
// класс "видимый" (плавный переход через CSS transition), а старый слой
// теряет этот класс одновременно — получается кроссфейд без пересоздания
// всей страницы. Автосмена по таймеру считается на СЕРВЕРЕ (server.js) —
// этот файл просто реагирует на то, что ему прислали, не считает время сам.

(function () {
  const isPreview = new URLSearchParams(location.search).get('preview') === '1';
  const rootEl = document.getElementById('bgRoot');
  const layers = [document.getElementById('bgLayerA'), document.getElementById('bgLayerB')];
  let activeLayerIndex = 0;
  let currentKey = null; // тип+url текущего фона — чтобы не дёргать кроссфейд на обновления, где сам фон не изменился (например, поменяли только размытие)

  function buildMediaHtml(type, url) {
    if (type === 'video') return `<video autoplay loop muted playsinline src="${url}"></video>`;
    if (type === 'gif' || type === 'image') return `<img src="${url}" alt="">`;
    return ''; // нет активного фона — пустой слой, виден сплошной серый цвет страницы (см. background.css)
  }

  function applyFitMode(fitMode) {
    rootEl.classList.remove('fit-cover', 'fit-contain', 'fit-stretch');
    rootEl.classList.add('fit-' + (fitMode || 'cover'));
  }

  function render(bg) {
    if (!bg) return;
    const r = document.documentElement.style;
    r.setProperty('--bg-blur', (bg.settings.blur / 100 * 20).toFixed(1) + 'px'); // 0-100% -> 0-20px размытия
    r.setProperty('--bg-darken', (bg.settings.darken / 100).toFixed(2));
    applyFitMode(bg.settings.fitMode);

    const key = (bg.activeType || 'none') + '|' + (bg.activeUrl || '');
    if (key === currentKey) return; // сам фон не изменился — не перезапускаем кроссфейд ради настроек размытия/затемнения
    currentKey = key;

    const hiddenLayer = layers[1 - activeLayerIndex];
    const outgoingLayer = layers[activeLayerIndex];

    hiddenLayer.innerHTML = buildMediaHtml(bg.activeType, bg.activeUrl);
    void hiddenLayer.offsetWidth; // форсируем reflow — иначе браузер может схлопнуть добавление контента и включение класса в один кадр и переход не проиграется
    hiddenLayer.classList.add('bg-layer-visible');
    outgoingLayer.classList.remove('bg-layer-visible');
    activeLayerIndex = 1 - activeLayerIndex;

    // Старый слой очищаем только ПОСЛЕ завершения перехода — чтобы не остановить видео/не мигнуть посреди кроссфейда.
    setTimeout(() => {
      if (!outgoingLayer.classList.contains('bg-layer-visible')) outgoingLayer.innerHTML = '';
    }, 1100);
  }

  if (isPreview) {
    window.addEventListener('message', (evt) => {
      if (evt.data && evt.data.type === 'background_preview_update') render(evt.data.background);
    });
    if (window.parent) window.parent.postMessage({ type: 'background_preview_ready' }, '*');
    return;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=background`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'background_data') render(data.background);
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }
  connect();
})();
