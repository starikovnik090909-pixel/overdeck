/* Перетаскивание вкладок сайдбара: за полоску слева, только внутри своей категории.
   Порядок хранится в localStorage (ключ navOrder_v1) отдельно для каждой категории. */
(function () {
  'use strict';
  var KEY = 'navOrder_v1';
  var list = document.querySelector('.sidebar .nav-list');
  if (!list) return;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* без хранилища порядок не запомнится */ } }

  /* категории: [{name, label|null, items:[el], end: el|null}] — метка и пункты до следующей метки */
  function groups() {
    var res = [], cur = { name: '_top', label: null, items: [] };
    Array.prototype.forEach.call(list.children, function (el) {
      if (el.classList.contains('nav-group')) { res.push(cur); cur = { name: el.textContent.trim(), label: el, items: [] }; }
      else if (el.classList.contains('nav-item') && !el.classList.contains('nav-sub') && el.dataset.tab) cur.items.push(el);
    });
    res.push(cur);
    return res;
  }

  function place(g, order) {
    // вставляем пункты в нужном порядке перед первым «чужим» элементом после категории
    var after = g.items[g.items.length - 1].nextElementSibling; // чужой элемент сразу после категории
    var items = g.items.slice().sort(function (a, b) {
      var ia = order.indexOf(a.dataset.tab), ib = order.indexOf(b.dataset.tab);
      if (ia < 0) ia = 1e6; if (ib < 0) ib = 1e6;
      return ia - ib;
    });
    items.forEach(function (it) { list.insertBefore(it, after); });
  }

  function applySaved() {
    var o = load();
    groups().forEach(function (g) {
      if (g.items.length > 1 && o[g.name]) place(g, o[g.name]);
    });
  }

  function persist() {
    var o = {};
    groups().forEach(function (g) { if (g.items.length > 1) o[g.name] = g.items.map(function (i) { return i.dataset.tab; }); });
    save(o);
  }

  function groupOf(item) {
    var gs = groups();
    for (var i = 0; i < gs.length; i++) if (gs[i].items.indexOf(item) >= 0) return gs[i];
    return null;
  }

  function addGrips() {
    groups().forEach(function (g) {
      if (g.items.length < 2) return;
      g.items.forEach(function (it) {
        if (it.querySelector('.nav-grip')) return;
        var grip = document.createElement('i');
        grip.className = 'nav-grip';
        grip.title = 'Перетащить, чтобы поменять порядок';
        it.insertBefore(grip, it.firstChild);
        grip.addEventListener('click', function (e) { e.stopPropagation(); });
        grip.addEventListener('pointerdown', function (e) { start(e, it, grip); });
      });
    });
  }

  function start(e, item, grip) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    var g = groupOf(item); if (!g) return;
    item.classList.add('nav-dragging');
    list.classList.add('nav-sorting');
    var moved = false;

    function onMove(ev) {
      var y = ev.clientY;
      var others = g.items.filter(function (i) { return i !== item && i.offsetParent !== null; });
      var target = null;
      for (var k = 0; k < others.length; k++) {
        var r = others[k].getBoundingClientRect();
        if (y < r.top + r.height / 2) { target = others[k]; break; }
      }
      if (target) { if (item.nextElementSibling !== target) { list.insertBefore(item, target); moved = true; } }
      else if (others.length) {
        var lastEl = others[others.length - 1];
        if (lastEl.nextElementSibling !== item) { list.insertBefore(item, lastEl.nextElementSibling); moved = true; }
      }
    }
    function end() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      item.classList.remove('nav-dragging');
      list.classList.remove('nav-sorting');
      if (moved) persist();
    }
    // слушаем на document: при переносе элемента в DOM захват указателя на нём бы сбросился
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  applySaved();
  addGrips();
})();
