/* =====================================================
   Hanoi Motorbike Rental — app.rentbikehanoi.com
   Light/dark theme, nav, drawer, open/closed status, calculator
   ===================================================== */

/* ---------- THEME (single source of truth) ---------- */
(function initTheme() {
  var root = document.documentElement;
  var btn = document.querySelector('.theme-toggle');
  function apply(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    if (btn) {
      btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      btn.setAttribute('aria-label', t === 'dark'
        ? btn.getAttribute('data-theme-label-dark')
        : btn.getAttribute('data-theme-label-light'));
    }
  }
  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  if (btn) btn.addEventListener('click', function () {
    apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  // follow system changes only while user has no explicit choice
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq) mq.addEventListener('change', function (e) {
    var stored = null; try { stored = localStorage.getItem('theme'); } catch (err) {}
    if (!stored) apply(e.matches ? 'dark' : 'light');
  });
})();

/* ---------- DESKTOP DROPDOWNS (hover + keyboard/ARIA) ---------- */
(function initDropdowns() {
  document.querySelectorAll('.nav-group').forEach(function (group) {
    var btn = group.querySelector('.nav-drop');
    var dd = group.querySelector('.dropdown');
    if (!btn || !dd) return;
    function open() { btn.setAttribute('aria-expanded', 'true'); group.classList.add('open'); }
    function close() { btn.setAttribute('aria-expanded', 'false'); group.classList.remove('open'); }
    var t;
    group.addEventListener('mouseenter', open);
    group.addEventListener('mouseleave', function () { t = setTimeout(close, 120); });
    group.addEventListener('mouseenter', function () { clearTimeout(t); });
    btn.addEventListener('click', function () {
      group.classList.contains('open') ? close() : open();
    });
    // close on Escape / focus leaving / outside click
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    document.addEventListener('click', function (e) {
      if (!group.contains(e.target)) close();
    });
    dd.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('focus', open);
      a.addEventListener('blur', function () {
        setTimeout(function () {
          if (!group.contains(document.activeElement)) close();
        }, 10);
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
  drawer.querySelectorAll('[data-close-drawer]').forEach(function (el) {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });
  // links inside drawer: close and, for in-page anchors, allow default jump
  drawer.querySelectorAll('a[href]').forEach(function (a) {
    a.addEventListener('click', function () {
      drawer.hidden = true;
      document.body.classList.remove('drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
  // focus trap
  panel.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = panel.querySelectorAll('a[href], button');
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // expandable groups
  drawer.querySelectorAll('.dr-acc').forEach(function (acc) {
    acc.addEventListener('click', function () {
      var sub = acc.nextElementSibling;
      var expanded = acc.getAttribute('aria-expanded') === 'true';
      acc.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (sub) sub.hidden = expanded;
    });
  });
})();

/* =====================================================
   BUSINESS HOURS — Asia/Ho_Chi_Minh (ICT, UTC+7)
   Single edit point for opening hours.
   ===================================================== */
var BUSINESS = {
  timezone: 'Asia/Ho_Chi_Minh',
  openHour: 9,   // 09:00
  closeHour: 21  // 21:00
};

(function initStoreStatus() {
  var badge = document.getElementById('store-status');
  var hoursEl = document.getElementById('status-hours');
  if (!badge) return;
  var fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS.timezone, hour: '2-digit', minute: '2-digit', hour12: false
  });

  function h(n) { return (n < 10 ? '0' : '') + n; }
  var OPEN_T = h(BUSINESS.openHour) + ':00';
  var CLOSE_T = h(BUSINESS.closeHour) + ':00';

  function update() {
    var now = new Date();
    var hm = fmt.format(now);           // "HH:mm" in Hanoi time
    var parts = hm.split(':');
    var hourNow = parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
    var open = BUSINESS.openHour, close = BUSINESS.closeHour;
    var isOpen = hourNow >= open && hourNow < close;

    badge.classList.toggle('is-open', isOpen);
    badge.classList.toggle('is-closed', !isOpen);
    badge.querySelector('.status-text').textContent = isOpen
      ? badge.getAttribute('data-open-text')
      : badge.getAttribute('data-closed-text');

    if (hoursEl) {
      hoursEl.textContent = isOpen
        ? 'Open today until ' + CLOSE_T + ' (Hanoi time)'
        : (hourNow < open
            ? 'Opens at ' + OPEN_T + ' (Hanoi time)'
            : 'Opens tomorrow at ' + OPEN_T + ' (Hanoi time)');
    }
  }
  update();
  setInterval(update, 60000);
})();

/* =====================================================
   RENTAL PRICE CALCULATOR
   Verified prices only — null means "contact us".
   Monthly prices may be ranges [min, max].
   ===================================================== */
var PRICES = {
  wave:     { name: 'Honda Wave',              day: 150000, week: 700000,  month: [900000, 1200000] },
  sirius:   { name: 'Yamaha Sirius',           day: 150000, week: 700000,  month: [900000, 1200000] },
  mio:      { name: 'Yamaha Mio',             day: 150000, week: 700000,  month: [900000, 1200000] },
  click:    { name: 'Honda Click',            day: 150000, week: 700000,  month: [900000, 1200000] },
  vision:   { name: 'Honda Vision',           day: 200000, week: 1000000, month: [1800000, 2000000] },
  airblade: { name: 'Honda Air Blade',         day: 200000, week: 1000000, month: 1500000 },
  electric: { name: 'Electric Motorbike',     day: 200000, week: 1000000, month: 1500000 },
  cc50:     { name: '50cc Scooter / Motorbike', day: 200000, week: null,    month: null }
};
var PERIOD_LABEL = { day: 'day', week: 'week', month: 'month' };

(function initCalculator() {
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
      label.textContent = v.name + ' — ' + PERIOD_LABEL[period] + ' rental';
      amount.textContent = 'Contact us for this rental period.';
      note.textContent = '';
      return;
    }
    out.classList.remove('is-contact');
    label.textContent = 'Estimated price';
    if (Array.isArray(price)) {
      amount.textContent = fmtVnd(price[0] * qty) + ' – ' + fmtVnd(price[1] * qty);
      note.textContent = 'per ' + PERIOD_LABEL[period] + ' (verified range' + (qty > 1 ? ', ' + qty + ' bikes' : '') + ')';
    } else {
      amount.textContent = fmtVnd(price * qty);
      note.textContent = (qty > 1 ? qty + ' bikes' : 'per bike') + ' / ' + PERIOD_LABEL[period];
    }
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); });
  [vEl, pEl, qEl].forEach(function (el) { el.addEventListener('change', calc); el.addEventListener('input', calc); });
  document.getElementById('qty-minus').addEventListener('click', function () {
    qEl.value = Math.max(1, (parseInt(qEl.value, 10) || 1) - 1); calc();
  });
  document.getElementById('qty-plus').addEventListener('click', function () {
    qEl.value = Math.min(20, (parseInt(qEl.value, 10) || 1) + 1); calc();
  });
  calc();
})();