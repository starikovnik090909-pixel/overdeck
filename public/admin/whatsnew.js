// whatsnew.js — красные мигающие точки «новое» после обновления.
// Каждая запись WHATSNEW.items привязана к вкладке (tab) и, при желании, к разделу внутри «Алертов» (pane).
// Пока запись не открыта, у вкладки/раздела мигает точка; по клику показывается окно с текстом, и точка пропадает.
// Что уже показано, хранится в localStorage этого браузера. Новые записи добавляются в конец списка при каждом обновлении (id — уникальный).
(function () {
  'use strict';
  window.WHATSNEW = { items: [
    { id: '3.0.10-streak', tab: 'donalerts', pane: 'streak', title: 'Серия просмотров — плашка в углу',
      text: 'Вместо большой карточки теперь небольшая плашка в углу экрана. Есть 6 видов на выбор (плашка, чат, кольцо, чек-ин, флип, стекло), настройки угла, размера и времени показа.' },
    { id: '3.0.9-tts-cmd', tab: 'voice', title: 'Озвучка чата по команде',
      text: 'В озвучке появился переключатель «Только по команде». Тогда читаются только сообщения, которые начинаются с «!!».' },
    { id: '3.0.14-np', tab: 'donalerts', pane: 'nowplaying', title: 'Сейчас играет — новые виды и настройки',
      text: 'Алерт показывает, что играет на компьютере: название, обложку, сколько прошло и общую длительность.\n\nВидов шесть: широкая лента, две колонки и четыре мини (скраббер, вертикальный акцент, крупное время, уголки).\n\nЕсли браузер не отдаёт данные о воспроизведении, сайт распознаётся по заголовку вкладки. Можно выбрать браузеры и добавить свои сайты. Если ничего не находится, предпросмотр покажет, что именно видит Windows.\n\nТолько Windows.' },
    { id: '3.0.19-ext', tab: 'donalerts', pane: 'nowplaying', title: 'Расширение браузера для «Сейчас играет»',
      text: 'Если алерт не видит видео, установи расширение: оно читает видео и аудио прямо на странице любого сайта (название, время, длительность, обложка).\n\nВ разделе «Сейчас играет» нажми «Установить расширение»: откроется страница расширений браузера и папка с расширением. Включи «Режим разработчика», нажми «Загрузить распакованное» и выбери папку browser-extension. Статус связи виден там же.\n\nРаботает в Chrome, Edge, Яндексе, Opera, Brave.' },
    { id: '3.0.23-sources', tab: 'donalerts', pane: 'nowplaying', title: 'Источники из браузера и выбор, что показывать',
      text: 'В разделе «Сейчас играет» появился список источников, которые передаёт расширение: название, сайт, браузер, «Играет» или «Пауза» и время.\n\nРежим «Автоматически» показывает играющее видео. В режиме «Выбрать вручную» нажми на нужный источник в списке, и алерт будет показывать только его. Удобно, когда открыто несколько вкладок с фильмами.' },
    { id: '3.0.22-np', tab: 'donalerts', pane: 'nowplaying', title: 'Сейчас играет: Яндекс Браузер, кнопка «Сохранить и обновить»',
      text: 'В блоке установки расширения появился Яндекс Браузер (browser://extensions/). Папку расширения лучше выбирать вручную в окне «Загрузить распакованное», а не вставлять путь.\n\nПоявилась кнопка «Сохранить и обновить»: она сохраняет настройки и перезагружает предпросмотр. Изменения теперь сохраняются и сами через секунду после правки.\n\nУбрано распознавание сайтов по заголовку вкладки: его заменило расширение.' },
    { id: '3.0.18-sources', tab: 'obs', title: 'Отдельный источник OBS для каждого алерта',
      text: 'Теперь у каждого алерта своя ссылка: донаты, подписки, рейды, фоллоу, Hype Train, баллы, серия просмотров и «Сейчас играет». Их можно разложить по разным сценам и источникам OBS.\n\nСтрока «Все алерты вместе» — один источник на весь экран, где играют все алерты сразу.\n\nРазмер источника во всех случаях 1920 × 1080: положение алерта на экране задаётся в его настройках.' },
    { id: '3.0.24-donatepay', tab: 'donations', title: 'Подключение DonatePay',
      text: 'В донатном хабе появилась карточка DonatePay. Вставь API-ключ со страницы donatepay.ru/page/api и нажми «Подключить». Донаты DonatePay идут в ту же ленту, что и остальные, с жёлтой меткой DP, и работают со всем: алерты, озвучка, топ донатеров, «Сбор», цель, таймлайн. Они приходят с задержкой до ~20 секунд (так разрешает DonatePay). Значок «DP» можно показывать и в углу карточки алерта.' },
    { id: '3.0.25-multichat', tab: 'chat', title: 'Чаты Kick, YouTube и VK Live',
      text: 'Стримишь на нескольких платформах сразу? Во вкладке «Чат» появилась карточка «Чаты других платформ» — по одной свёрнутой строке на каждую площадку, как в донатном хабе. Разверни строку, укажи канал Kick или VK Live (для YouTube — ссылку на эфир и API-ключ) и нажми «Подключить». Когда чат читается, в строке горит индикатор «Читается».\n\nСообщения зрителей приходят в общее зеркало чата и в виджет чата OBS с цветной меткой платформы (KICK, VK, You), учитываются в активности зрителей и озвучке. Только чтение, входить в аккаунт не нужно. Подключения запоминаются и возвращаются после перезапуска.\n\nТакже в этой версии: подключение DonatePay в донатном хабе (метка DP).' },
    { id: '3.0.26-chat-design', tab: 'chat', title: 'Вкладка «Чат» стала удобнее',
      text: 'Над зеркалом чата появились кнопки: «На стрим» (чат как источник «Браузер», его видят зрители), «Только мне» (док-панель внутри OBS, зрители её не видят) и шестерёнка с настройками отображения. Каждая раскрывает свою панель с шагами и ссылкой.\n\nСлева появилась статистика чата: сколько сообщений, сколько в минуту, сколько человек пишет, кто активнее всех и разбивка по платформам. Над чатом есть фильтр Twitch / Kick / YouTube / VK.\n\nПлашку платформы можно выбрать в настройках: «Контур» или «Значок» (у VK настоящий логотип).' },
  ] };
  const KEY = 'ovd_whatsnew_seen';
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* без localStorage точки просто вернутся */ } };
  const unseen = (f) => window.WHATSNEW.items.filter((i) => !seen[i.id] && f(i));

  const st = document.createElement('style');
  st.textContent = '.wn-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff3b4a;box-shadow:0 0 0 0 rgba(255,59,74,.7);animation:wnPulse 1.4s infinite;flex:none;margin-left:6px;vertical-align:middle;pointer-events:none}' +
    '.nav-item>.wn-dot{position:absolute;right:10px;top:50%;margin-top:-4px;margin-left:0}.da-nav-it>.wn-dot{position:absolute;right:56px;top:50%;margin-top:-4px}.da-nav-it{position:relative}' +
    '@keyframes wnPulse{0%{box-shadow:0 0 0 0 rgba(255,59,74,.7)}70%{box-shadow:0 0 0 7px rgba(255,59,74,0)}100%{box-shadow:0 0 0 0 rgba(255,59,74,0)}}';
  document.head.appendChild(st);

  function put(el, on) {
    const d = el.querySelector(':scope > .wn-dot');
    if (on && !d) { const s = document.createElement('span'); s.className = 'wn-dot'; s.title = 'Есть новое'; el.appendChild(s); }
    else if (!on && d) d.remove();
  }
  function paint() {
    const items = window.WHATSNEW.items;
    document.querySelectorAll('.nav-item[data-tab]').forEach((el) => put(el, items.some((i) => !seen[i.id] && i.tab === el.dataset.tab)));
    document.querySelectorAll('.pixel-subtab[data-da-pane]').forEach((el) => put(el, items.some((i) => !seen[i.id] && i.pane === el.dataset.daPane)));
    document.querySelectorAll('.da-nav-it[data-p]').forEach((el) => put(el, items.some((i) => !seen[i.id] && i.pane === el.dataset.p)));
  }
  function show(list) {
    if (!list.length) return;
    list.forEach((i) => { seen[i.id] = 1; });
    save(); paint();
    const msg = list.map((i) => 'Что нового: ' + i.title + '\n\n' + i.text).join('\n\n');
    if (window.ui3Alert) window.ui3Alert(msg); else alert(msg);
  }
  document.addEventListener('click', (e) => {
    const pane = e.target.closest('.pixel-subtab[data-da-pane], .da-nav-it[data-p]');
    if (pane && !e.target.closest('.toggle-switch')) { const p = pane.dataset.daPane || pane.dataset.p; setTimeout(() => show(unseen((i) => i.pane === p)), 150); return; }
    const nav = e.target.closest('.nav-item[data-tab]');
    if (nav) { const t = nav.dataset.tab; setTimeout(() => show(unseen((i) => i.tab === t && !i.pane)), 150); }
  }, true);
  paint(); setInterval(paint, 1500);
})();
