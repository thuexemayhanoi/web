/* =====================================================
   Hanoi Motorbike Rental — app.rentbikehanoi.com
   Theme, mega menu, drawer, dock, filters, calculator,
   open/closed status, quick contact, chat wiring.
   Depends on business-config.js.
   ===================================================== */

/* ---------- THEME ---------- */
(function initTheme() {
  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  function apply(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    if (meta) meta.setAttribute('content', t === 'dark' ? '#070a10' : '#f5f7fb');
    var btn = document.querySelector('.theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }
  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  var btn = document.querySelector('.theme-toggle');
  if (btn) btn.addEventListener('click', function () {
    apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq) mq.addEventListener('change', function (e) {
    var stored = null; try { stored = localStorage.getItem('theme'); } catch (err) {}
    if (!stored) apply(e.matches ? 'dark' : 'light');
  });
})();

/* ---------- DESKTOP MEGA DROPDOWNS (keyboard-first) ---------- */
(function initDropdowns() {
  document.querySelectorAll('.nav-group').forEach(function (group) {
    var btn = group.querySelector('.nav-drop');
    var dd = group.querySelector('.dropdown');
    if (!btn || !dd) return;
    function open() { btn.setAttribute('aria-expanded', 'true'); group.classList.add('open'); }
    function close() { btn.setAttribute('aria-expanded', 'false'); group.classList.remove('open'); }
    var t;
    group.addEventListener('mouseenter', open);
    group.addEventListener('mouseenter', function () { clearTimeout(t); });
    group.addEventListener('mouseleave', function () { t = setTimeout(close, 120); });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      group.classList.contains('open') ? close() : open();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.addEventListener('click', function (e) { if (!group.contains(e.target)) close(); });
    dd.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('focus', open);
      a.addEventListener('blur', function () {
        setTimeout(function () { if (!group.contains(document.activeElement)) close(); }, 10);
      });
    });
  });
})();

/* ---------- MOBILE DRAWER ---------- */
(function initDrawer() {
  var drawer = document.getElementById('drawer');
  var toggle = document.querySelector('.menu-toggle');
  if (!drawer || !toggle) return;
  var closeBtn = drawer.querySelector('.drawer-close');
  var panel = drawer.querySelector('.drawer-panel');
  function open() {
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    drawer.hidden = true;
    document.body.classList.remove('drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
  toggle.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  drawer.querySelectorAll('[data-close-drawer]').forEach(function (el) { el.addEventListener('click', close); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) close(); });
  drawer.querySelectorAll('a[href]').forEach(function (a) {
    a.addEventListener('click', function () {
      drawer.hidden = true;
      document.body.classList.remove('drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
  panel.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = panel.querySelectorAll('a[href], button');
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  drawer.querySelectorAll('.dr-acc').forEach(function (acc) {
    acc.addEventListener('click', function () {
      var sub = acc.nextElementSibling;
      var expanded = acc.getAttribute('aria-expanded') === 'true';
      acc.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (sub) sub.hidden = expanded;
    });
  });
})();

/* ---------- MOBILE BOTTOM DOCK ---------- */
(function initDock() {
  var dock = document.querySelector('.dock');
  if (!dock) return;
  var path = location.pathname;
  dock.querySelectorAll('a').forEach(function (a) {
    var href = a.getAttribute('href') || '';
    var target = href.split('#')[0] || '/';
    if (target === '/' && (path === '/' || path === '/index.html')) a.classList.add('active');
    else if (target !== '/' && path.indexOf(target) === 0) a.classList.add('active');
  });
})();

/* ---------- OPEN / CLOSED (Asia/Ho_Chi_Minh) ---------- */
(function initStatus() {
  var badge = document.getElementById('store-status');
  var hoursEl = document.getElementById('status-hours');
  if (!badge) return;
  var fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS.timezone, hour: '2-digit', minute: '2-digit', hour12: false
  });
  function h(n) { return (n < 10 ? '0' : '') + n; }
  var OPEN_T = h(BUSINESS.openHour) + ':00', CLOSE_T = h(BUSINESS.closeHour) + ':00';
  function update() {
    var parts = fmt.format(new Date()).split(':');
    var hourNow = parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
    var isOpen = hourNow >= BUSINESS.openHour && hourNow < BUSINESS.closeHour;
    badge.classList.toggle('is-open', isOpen);
    badge.classList.toggle('is-closed', !isOpen);
    badge.querySelector('.status-text').textContent = isOpen
      ? 'OPEN NOW \u00b7 Until ' + CLOSE_T
      : 'CLOSED \u00b7 Opens at ' + OPEN_T;
    if (hoursEl) hoursEl.textContent = BUSINESS.hoursText + ' \u00b7 ' + BUSINESS.address;
  }
  update();
  setInterval(update, 60000);
})();

/* ---------- MOTORBIKE FILTER ---------- */
(function initFilter() {
  var chips = document.querySelectorAll('.filter-chip');
  var cards = document.querySelectorAll('.bike-card');
  if (!chips.length || !cards.length) return;
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      var cat = chip.getAttribute('data-cat');
      var shown = 0;
      cards.forEach(function (card) {
        var match = cat === 'all' || card.getAttribute('data-cat') === cat;
        card.hidden = !match;
        if (match) shown++;
      });
      var empty = document.getElementById('filter-empty');
      if (empty) empty.hidden = shown !== 0;
    });
  });
})();

/* ---------- RENTAL CALCULATOR ---------- */
(function initCalc() {
  var form = document.getElementById('calc-form');
  var vEl = document.getElementById('calc-vehicle');
  var pEl = document.getElementById('calc-period');
  var qEl = document.getElementById('calc-qty');
  var out = document.getElementById('calc-result');
  if (!form || !vEl || !pEl || !qEl || !out) return;
  var nf = new Intl.NumberFormat('en-US');
  function fmtVnd(n) { return nf.format(n) + ' VND'; }
  function calc() {
    var v = PRICES[vEl.value];
    var period = pEl.value;
    var qty = Math.max(1, Math.min(20, parseInt(qEl.value, 10) || 1));
    qEl.value = qty;
    var price = v[period];
    var label = out.querySelector('.calc-label');
    var amount = out.querySelector('.calc-amount');
    var note = out.querySelector('.calc-note');
    if (price === null || price === undefined) {
      out.classList.add('is-contact');
      label.textContent = v.name + ' \u2014 ' + period + ' rental';
      amount.textContent = period === 'week'
        ? 'Contact us for verified weekly pricing.'
        : 'Contact us for verified monthly pricing.';
      note.textContent = '';
      return;
    }
    out.classList.remove('is-contact');
    label.textContent = 'Estimated price';
    if (Array.isArray(price)) {
      amount.textContent = fmtVnd(price[0] * qty) + ' \u2013 ' + fmtVnd(price[1] * qty);
      note.textContent = 'verified monthly range' + (qty > 1 ? ' \u00b7 ' + qty + ' bikes' : '');
    } else {
      amount.textContent = fmtVnd(price * qty);
      note.textContent = (qty > 1 ? qty + ' bikes' : 'per bike') + ' / ' + period;
    }
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  [vEl, pEl, qEl].forEach(function (el) { el.addEventListener('change', calc); el.addEventListener('input', calc); });
  var minus = document.getElementById('qty-minus'), plus = document.getElementById('qty-plus');
  if (minus) minus.addEventListener('click', function () {
    qEl.value = Math.max(1, (parseInt(qEl.value, 10) || 1) - 1); calc();
  });
  if (plus) plus.addEventListener('click', function () {
    qEl.value = Math.min(20, (parseInt(qEl.value, 10) || 1) + 1); calc();
  });
  calc();
})();

/* ---------- FLOATING QUICK CONTACT (bottom-left) ---------- */
(function initQuickContact() {
  var fab = document.getElementById('quick-contact');
  if (!fab) return;
  var btn = fab.querySelector('.qc-main');
  function toggle(force) {
    var expanded = typeof force === 'boolean' ? force : fab.getAttribute('data-open') !== 'true';
    fab.setAttribute('data-open', expanded ? 'true' : 'false');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  document.addEventListener('click', function (e) { if (!fab.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
})();

/* ---------- CHAT PANEL (logic in assistant.js) ---------- */
(function initChatToggle() {
  var fab = document.getElementById('chat-fab');
  var panel = document.getElementById('chat-panel');
  if (!fab || !panel) return;
  function open() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    var inp = panel.querySelector('.chat-input input');
    if (inp) inp.focus();
  }
  function close() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }
  fab.addEventListener('click', function () { panel.hidden ? open() : close(); });
  var closeBtn = panel.querySelector('.chat-close');
  if (closeBtn) closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
})();
