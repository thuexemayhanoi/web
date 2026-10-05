/* Hanoi Motorbike Rental — app.js
   Theme, navigation (dropdowns, drawer, dock), store status,
   bike filter, price calculator, quick contact and chat toggling.
   Design system: black / white / orange. */

(function () {
  "use strict";

  /* Shared data comes from business-config.js (BUSINESS, PRICES).
     No duplicated price table here — single source of truth. */
  var PRICES = window.PRICES || null;
  var BUSINESS = window.BUSINESS || null;
  var fmt = function (v) { return v.toLocaleString("en-US") + " VND"; };

  /* ================= Theme ================= */
  var root = document.documentElement;
  var themeColor = document.querySelector('meta[name="theme-color"]');
  var themeToggle = document.querySelector(".theme-toggle");

  function applyThemeMeta() {
    var dark = root.getAttribute("data-theme") === "dark";
    if (themeColor) themeColor.setAttribute("content", dark ? "#090909" : "#f7f7f5");
    if (themeToggle) {
      themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    }
  }
  applyThemeMeta();

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var dark = root.getAttribute("data-theme") === "dark";
      var next = dark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      applyThemeMeta();
    });
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
    var saved = null;
    try { saved = localStorage.getItem("theme"); } catch (err) {}
    if (!saved) {
      root.setAttribute("data-theme", e.matches ? "dark" : "light");
      applyThemeMeta();
    }
  });

  /* ================= Desktop dropdowns ================= */
  var navGroups = Array.prototype.slice.call(document.querySelectorAll(".nav-group"));

  function closeDropdown(group) {
    group.classList.remove("open");
    var btn = group.querySelector(".nav-drop");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }
  function closeAllDropdowns() { navGroups.forEach(closeDropdown); }

  navGroups.forEach(function (group) {
    var btn = group.querySelector(".nav-drop");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = group.classList.contains("open");
      closeAllDropdowns();
      if (!isOpen) {
        group.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
    group.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeDropdown(group); btn.focus(); }
    });
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".nav-group")) closeAllDropdowns();
  });

  /* ================= Mobile drawer ================= */
  var drawer = document.getElementById("drawer");
  var menuToggle = document.querySelector(".menu-toggle");
  var drawerClose = document.querySelector(".drawer-close");
  var backdrop = document.querySelector(".drawer-backdrop");
  var lastFocus = null;

  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    drawer.classList.add("open");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
    if (drawerClose) drawerClose.focus();
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("open");
    drawer.hidden = true;
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (menuToggle) menuToggle.addEventListener("click", function () {
    drawer && drawer.classList.contains("open") ? closeDrawer() : openDrawer();
  });
  if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);

  // Drawer accordions
  Array.prototype.slice.call(document.querySelectorAll(".dr-acc")).forEach(function (acc) {
    acc.addEventListener("click", function () {
      var sub = acc.nextElementSibling;
      var open = acc.getAttribute("aria-expanded") === "true";
      acc.setAttribute("aria-expanded", String(!open));
      if (sub) sub.hidden = open;
    });
  });

  // Drawer focus trap
  if (drawer) {
    drawer.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var focusables = drawer.querySelectorAll("a[href],button:not([disabled])");
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ================= Floating panels: quick contact + chat ================= */
  var qc = document.getElementById("quick-contact");
  var qcMain = qc ? qc.querySelector(".qc-main") : null;
  var chatFab = document.getElementById("chat-fab");
  var chatPanel = document.getElementById("chat-panel");
  var chatClose = chatPanel ? chatPanel.querySelector(".chat-close") : null;

  function setQC(open) {
    if (!qc || !qcMain) return;
    qc.setAttribute("data-open", String(open));
    qcMain.setAttribute("aria-expanded", String(open));
  }
  function setChat(open) {
    if (!chatFab || !chatPanel) return;
    chatPanel.hidden = !open;
    chatFab.setAttribute("aria-expanded", String(open));
  }

  if (qcMain) qcMain.addEventListener("click", function () {
    var open = qc.getAttribute("data-open") === "true";
    setChat(false);
    setQC(!open);
  });

  if (chatFab) chatFab.addEventListener("click", function () {
    var open = !chatPanel.hidden;
    setQC(false);
    setChat(!open);
    if (!open) {
      var input = chatPanel.querySelector(".chat-input input");
      if (input) input.focus();
    }
  });
  if (chatClose) chatClose.addEventListener("click", function () { setChat(false); chatFab.focus(); });

  /* Global Escape: close dropdowns, drawer, chat, quick contact */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeAllDropdowns();
    closeDrawer();
    setQC(false);
    setChat(false);
  });

  /* ================= Open / Closed status (Asia/Ho_Chi_Minh) ================= */
  var statusBadge = document.getElementById("store-status");
  var statusText = statusBadge ? statusBadge.querySelector(".status-text") : null;

  function updateStatus() {
    if (!statusBadge || !statusText) return;
    var s;
    try {
      s = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
    } catch (e) { s = new Date().toString(); }
    var now = new Date(s);
    var mins = now.getHours() * 60 + now.getMinutes();
    var open = mins >= 9 * 60 && mins < 21 * 60;
    statusBadge.classList.toggle("is-open", open);
    statusBadge.classList.toggle("is-closed", !open);
    statusText.textContent = open ? "Open now \u00b7 until 21:00" : "Closed \u00b7 opens at 09:00";
  }
  updateStatus();

  /* ================= Bike filter ================= */
  var chips = Array.prototype.slice.call(document.querySelectorAll(".filter-chip"));
  var bikes = Array.prototype.slice.call(document.querySelectorAll(".bike-grid .bike-card"));
  var filterEmpty = document.getElementById("filter-empty");

  function applyFilter(cat) {
    var visible = 0;
    bikes.forEach(function (b) {
      var show = cat === "all" || b.getAttribute("data-cat") === cat;
      b.hidden = !show;
      if (show) visible++;
    });
    if (filterEmpty) filterEmpty.hidden = visible !== 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) {
        c.classList.toggle("active", c === chip);
        c.setAttribute("aria-pressed", String(c === chip));
      });
      applyFilter(chip.getAttribute("data-cat"));
    });
  });

  /* ================= Rental price calculator ================= */
  var calcForm = document.getElementById("calc-form");
  var calcVehicle = document.getElementById("calc-vehicle");
  var calcPeriod = document.getElementById("calc-period");
  var calcQty = document.getElementById("calc-qty");
  var calcResult = document.getElementById("calc-result");
  var qtyMinus = document.getElementById("qty-minus");
  var qtyPlus = document.getElementById("qty-plus");

  function clampQty() {
    if (!calcQty) return 1;
    var q = parseInt(calcQty.value, 10);
    if (isNaN(q) || q < 1) q = 1;
    if (q > 20) q = 20;
    calcQty.value = String(q);
    return q;
  }

  function renderCalc() {
    if (!calcVehicle || !calcPeriod || !calcResult) return;
    var price = PRICES[calcVehicle.value];
    var period = calcPeriod.value;
    var label = calcResult.querySelector(".calc-label");
    var amount = calcResult.querySelector(".calc-amount");
    var note = calcResult.querySelector(".calc-note");
    var qty = clampQty();
    if (!price || !amount) return;

    if (period === "day") {
      amount.textContent = fmt(price.day * qty);
      if (note) note.textContent = qty > 1 ? fmt(price.day) + " per motorbike per day \u00d7 " + qty : fmt(price.day) + " per day";
    } else if (period === "week") {
      if (price.week == null) {
        amount.textContent = "Contact us";
        if (note) note.textContent = "We do not have a verified weekly price for the " + price.name + ". Please contact us for verified weekly pricing.";
      } else {
        amount.textContent = fmt(price.week * qty);
        if (note) note.textContent = qty > 1 ? fmt(price.week) + " per motorbike per week \u00d7 " + qty : fmt(price.week) + " per week";
      }
    } else {
      if (price.month == null) {
        amount.textContent = "Contact us";
        if (note) note.textContent = "We do not have a verified monthly price for the " + price.name + ". Please contact us for verified monthly pricing.";
      } else {
        var range = Array.isArray(price.month) ? price.month : [price.month, price.month];
        var lo = range[0], hi = range[1];
        if (lo === hi) {
          amount.textContent = fmt(lo * qty);
          if (note) note.textContent = qty > 1 ? fmt(lo) + " per motorbike per month \u00d7 " + qty : fmt(lo) + " per month";
        } else {
          amount.textContent = fmt(lo * qty) + " \u2013 " + fmt(hi * qty);
          if (note) note.textContent = qty > 1
            ? fmt(lo) + " \u2013 " + fmt(hi) + " per motorbike per month \u00d7 " + qty
            : "Verified monthly range. Final price depends on the bike.";
        }
      }
    }
    if (label) label.textContent = "Estimated price";
  }

  if (calcQty) calcQty.addEventListener("input", renderCalc);
  if (qtyMinus) qtyMinus.addEventListener("click", function () { calcQty.value = String(clampQty() - 1); clampQty(); renderCalc(); });
  if (qtyPlus) qtyPlus.addEventListener("click", function () { calcQty.value = String(clampQty() + 1); clampQty(); renderCalc(); });
  if (calcVehicle) calcVehicle.addEventListener("change", renderCalc);
  if (calcPeriod) calcPeriod.addEventListener("change", renderCalc);
  if (calcForm) calcForm.addEventListener("submit", function (e) { e.preventDefault(); renderCalc(); });
  if (calcForm) renderCalc();

  /* ================= Bottom dock active state ================= */
  var dockLinks = Array.prototype.slice.call(document.querySelectorAll(".dock a"));
  var path = location.pathname.replace(/\/+$/, "") || "/";
  dockLinks.forEach(function (a) {
    var href = a.getAttribute("href") || "";
    var target = href.replace(/\/+$/, "") || "/";
    var isAnchor = href.indexOf("/#") === 0;
    if (!isAnchor && (target === path || (target !== "/" && path.indexOf(target) === 0))) {
      a.classList.add("active");
    }
  });

  /* ================= Close drawer on nav (small screens) ================= */
  Array.prototype.slice.call(document.querySelectorAll(".drawer-nav a")).forEach(function (a) {
    a.addEventListener("click", closeDrawer);
  });
})();
