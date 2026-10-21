// public/timer.js — "Таймер": отсчёт ведёт СЕРВЕР (раз в секунду, см. server.js);
// этот файл только отображает присланное значение мм:сс и анимирует смену
// каждого разряда "катушкой" (старое число уезжает вниз, новое въезжает
// сверху — классический одометр/табло). Готовой библиотеки такого эффекта в
// проекте не было — сделано на чистом CSS-transform + transition, без
// внешних зависимостей, тем же способом, каким собраны остальные виджеты.

(function () {
  const isPreview = new URLSearchParams(location.search).get('preview') === '1';
  const rootEl = document.getElementById('timerRoot');
  const faceEl = document.getElementById('timerFace');
  const labelEl = document.getElementById('timerLabel');

  const ROLL_DURATION_MS = 450;

  /** Одна "катушка" разряда: два вертикально уложенных значения в .timer-digit-track, переезжающих transform'ом. */
  function createDigitCell() {
    const el = document.createElement('span');
    el.className = 'timer-digit';
    const track = document.createElement('span');
    track.className = 'timer-digit-track';
    const topEl = document.createElement('span');
    topEl.className = 'timer-digit-cell';
    const botEl = document.createElement('span');
    botEl.className = 'timer-digit-cell';
    track.appendChild(topEl);
    track.appendChild(botEl);
    el.appendChild(track);
    track.style.transition = 'none';
    track.style.transform = 'translateY(-1em)'; // виден botEl — так и должно быть в состоянии покоя

    let current = null;

    function setValue(value) {
      if (value === current) return;
      if (current === null) {
        // самая первая установка значения (страница только что загрузилась) — сразу, без анимации переезда
        botEl.textContent = value;
        current = value;
        return;
      }
      topEl.textContent = value; // новое — сверху, появится, "въезжая" вниз
      botEl.textContent = current; // старое остаётся видимым внизу до начала анимации, потом "уезжает" ниже
      track.style.transition = 'none';
      track.style.transform = 'translateY(-1em)';
      void track.offsetHeight; // форсируем reflow — иначе браузер может "слить" сброс и следующую анимацию в один кадр
      track.style.transition = `transform ${ROLL_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      track.style.transform = 'translateY(0em)';
      current = value;
    }

    return { el, setValue };
  }

  // 4 катушки (мм мм сс сс) + статичное двоеточие между ними.
  const cellTens = createDigitCell();
  const cellOnes = createDigitCell();
  const colonEl = document.createElement('span');
  colonEl.className = 'timer-colon';
  colonEl.textContent = ':';
  const cellSecTens = createDigitCell();
  const cellSecOnes = createDigitCell();
  faceEl.appendChild(cellTens.el);
  faceEl.appendChild(cellOnes.el);
  faceEl.appendChild(colonEl);
  faceEl.appendChild(cellSecTens.el);
  faceEl.appendChild(cellSecOnes.el);

  function renderSeconds(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const mm = Math.floor(s / 60) % 100; // формат виджета всегда мм:сс (см. timerData.js — длительность и так ограничена 99:59)
    const ss = s % 60;
    cellTens.setValue(String(Math.floor(mm / 10)));
    cellOnes.setValue(String(mm % 10));
    cellSecTens.setValue(String(Math.floor(ss / 10)));
    cellSecOnes.setValue(String(ss % 10));
  }

  function applySettings(settings) {
    const r = document.documentElement.style;
    r.setProperty('--timer-digit-size', (settings.digitSize || 64) + 'px');
    r.setProperty('--timer-digit-color', settings.digitColor || '#f0e6d2');
    r.setProperty('--timer-font', `'${settings.font || 'Inter'}', system-ui, sans-serif`);
    r.setProperty('--timer-bg-opacity', (settings.bgOpacity || 0) / 100);
    r.setProperty('--timer-bg-darken', (settings.bgDarken || 0) / 100);
    r.setProperty('--timer-label-size', (settings.labelSize || 18) + 'px');
    r.setProperty('--timer-label-color', settings.labelColor || '#f0e6d2');
    r.setProperty('--timer-label-font', `'${settings.labelFont || 'Inter'}', system-ui, sans-serif`);
    rootEl.dataset.labelPosition = settings.labelPosition === 'bottom' ? 'bottom' : 'top';
  }

  function render(state) {
    applySettings(state.settings || {});
    renderSeconds(state.remainingSeconds);
    labelEl.textContent = state.labelText || ''; // пусто — .timer-label:empty сама скрывается (см. timer.css)
    // В предпросмотре админки таймер всегда виден — иначе выключенный тумблер "Включить таймер" сделал бы
    // его настройку невозможной (то же решение, что и у остальных виджетов с общим "enabled").
    rootEl.style.display = (state.enabled || isPreview) ? 'flex' : 'none';
  }

  if (isPreview) {
    window.addEventListener('message', (evt) => {
      if (evt.data && evt.data.type === 'timer_preview_update') render(evt.data.state);
    });
    if (window.parent) window.parent.postMessage({ type: 'timer_preview_ready' }, '*');
    return;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}?type=timer`);
    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.type === 'timer_state') render(data.state);
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onerror = () => ws.close();
  }
  connect();
})();
