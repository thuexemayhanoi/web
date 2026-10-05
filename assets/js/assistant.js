/* ============================================================
   Hanoi Motorbike Rental — local rule-based assistant.
   No API calls, no backend, no models. Runs in the browser.
   - Intent classification BEFORE answering:
     price, availability, delivery, documents/license, address,
     hours, contact, deposit, buy/sale, travel, greeting, fallback
   - English + Vietnamese (with/without diacritics), typo-tolerant
   - Session memory: model, period, quantity, duration
   - Single price source: PRICES/BUSINESS from business-config.js
   - Never invents availability, promotions, deposits, delivery
     or legal conclusions. Monthly ranges stay ranges.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------------- helpers ---------------- */
  var DIACRITICS = /[\u0300-\u036f]/g;
  function norm(s) {
    return (s || "")
      .toLowerCase()
      .replace(/đ/g, "d").replace(/Đ/g, "d")
      .normalize("NFD").replace(DIACRITICS, "")
      .replace(/[^a-z0-9\s.,+*x-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  var VIET_CHARS = /[ăâêôơưáàảãạấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵđ]/i;
  var VN_MARKERS = /(\bxin chao\b|\bchao ban\b|\bcam on\b|\bbao nhieu\b|\bgia (thue|xe|thang|tuan|ngay)\b|\bthue\b|\bcho thue\b|\bcon (xe|khong|co|lai|thang|tuan|ngay|nua)\b|\bo dau\b|\bdia chi\b|\bvi tri\b|\bgio (mo|dong)\b|\bmo cua\b|\bdong cua\b|\blien he\b|\bmua xe\b|\bban xe\b|\bgiao (xe|nhan|hang)\b|\bgiay to\b|\bbang lai\b|\bgiay phep\b|\bduoc khong\b|\bthe nao\b|\bthi sao\b|\bxac nhan\b|\bdat xe\b|\bdat truoc\b|\btien coc\b|\bxe may\b|\bva (thang|tuan|ngay)\b|\bmat bao lau\b)/;

  var NUMBER_WORDS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10
  };

  /* ---------------- model detection ----------------
     Word-boundary matching; "click" only counts as Honda Click
     when it is not the verb ("click to see", "click here"...). */
  var MODELS = [
    { key: "wave",     re: /\bwave(s)?\b/ },
    { key: "sirius",   re: /\bsirius\b/ },
    { key: "mio",      re: /\bmio(s)?\b/ },
    { key: "vision",   re: /\bvision(s)?\b/ },
    { key: "airblade", re: /\bair ?blade(s)?\b/ },
    { key: "electric", re: /\b(electric|electric motorbike|xe dien)\b/ },
    { key: "cc50",     re: /\b50\s?cc\b|\bmoped(s)?\b|\bxe\s+50\b/ }
  ];
  var CLICK_MODEL_RE = /\bhonda\s+click\b/;
  var CLICK_VERB_RE = /\bclick\s+(to|and|here|on|now|for|see|view|the|this|it)\b/;
  function detectModel(t) {
    var i, m = null;
    for (i = 0; i < MODELS.length; i++) {
      if (MODELS[i].re.test(t)) { m = MODELS[i].key; }
    }
    // bare "click": Honda Click only when not used as a UI verb
    if (CLICK_MODEL_RE.test(t)) return "click";
    if (/\bclick\b/.test(t) && !CLICK_VERB_RE.test(t)) return "click";
    return m;
  }

  /* ---------------- period detection ----------------
     \bday\b so "today" never counts as a rental period. */
  function detectPeriod(t) {
    if (/\b(per month|monthly|month|thang|1 thang)\b/.test(t)) return "month";
    if (/\b(per week|weekly|week|tuan)\b/.test(t)) return "week";
    if (/\b(per day|daily|day|days|ngay)\b/.test(t)) return "day";
    return null;
  }

  /* ---------------- qty & duration ---------------- */
  function detectQty(t, modelWord) {
    var m = t.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:x\s*)?(?:honda\s+|yamaha\s+|xe\s+)?(?:waves?|sirius|mios?|visions?|clicks?|air ?blades?|electric(?:\s+motorbikes?)?|50\s?cc|mopeds?|bikes?|motorbikes?|scooters?|xe)/);
    if (m) {
      var n = parseInt(m[1], 10);
      if (isNaN(n)) n = NUMBER_WORDS[m[1]];
      if (n && n >= 1 && n <= 20) return n;
    }
    return null;
  }
  function detectDuration(t) {
    var m = t.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(days?|ngay|weeks?|tuans?|months?|thangs?)/);
    if (m) {
      var n = parseInt(m[1], 10);
      if (isNaN(n)) n = NUMBER_WORDS[m[1]];
      if (n && n >= 1 && n <= 90) return { count: n, unit: /^(week|tuan)/.test(m[2]) ? "week" : (/^(month|thang)/.test(m[2]) ? "month" : "day") };
    }
    return null;
  }

  /* ---------------- intent classification (priority order) ---------------- */
  function detectIntent(t) {
    if (/\b(for sale|to sell|sell|sale|ban xe|mua xe|muon mua|buy(ing)? (a )?(motor)?bike|buy vs rent|buying vs)\b/.test(t)) return "buy";
    if (/\b(deliver|delivery|giao (xe|nhan|hang)|giao tan|ship(ping)?|pickup at (hotel|airport)|drop ?off)\b/.test(t)) return "delivery";
    if (/\b(license|licence|giay to|giay phep|bang lai|gplx|permit|legal|luat|law)\b/.test(t)) return "docs";
    if (/\b(availab\w*|in stock|do you have|have you got|is there (a|any)|con (xe|khong|co|lai))\b/.test(t)) return "avail";
    if (/\b(deposit|tien coc|coc (tien|xe)|dat truoc|dat coc)\b/.test(t)) return "deposit";
    if (/\b(hour|open|close|opening|gio (mo|dong)|mo cua|dong cua|dang mo|dang dong)\b/.test(t)) return "hours";
    if (/\b(contact|phone|call|email|e-mail|zalo|whatsapp|lien he|so dien thoai|sdt)\b/.test(t)) return "contact";
    if (/\b(trip|route|travel|du lich|hanh trinh|chuyen di|ninh binh|ba vi|mai chau|ha giang|pho co)\b/.test(t)) return "travel";
    if (/\b(address|location|where|map|vi tri|o dau|quan long bien|long bien|old quarter)\b/.test(t)) return "where";
    if (/\b(price|prices|cost|how much|rent(ing)? (for|a|an)|gia|phi|bao nhieu|thue (xe|bao)|per (day|week|month)|weekly|monthly|daily)\b/.test(t)) return "price";
    return null;
  }

  var GREETING_RE = /^(hi|hello|hey|good (morning|afternoon|evening)|xin chao|chao (ban|anh|chi))\b[,!.]?\s*/;

  /* ================= Engine ================= */
  function Engine(cfg) {
    cfg = cfg || {};
    this.BUSINESS = cfg.BUSINESS || (typeof BUSINESS !== "undefined" ? BUSINESS : null);
    this.PRICES = cfg.PRICES || (typeof PRICES !== "undefined" ? PRICES : null);
    this.state = { model: null, period: null, qty: null, duration: null, lang: "en" };
    this.nf = { en: new Intl.NumberFormat("en-US"), vi: new Intl.NumberFormat("vi-VN") };
  }

  Engine.prototype.reset = function () {
    this.state = { model: null, period: null, qty: null, duration: null, lang: this.state.lang };
  };

  Engine.prototype.vnd = function (n) {
    return this.nf[this.state.lang === "vi" ? "vi" : "en"].format(n) + " VND";
  };
  Engine.prototype.a = function (href, label, external) {
    return '<a href="' + href + '"' + (external ? ' target="_blank" rel="noopener"' : "") + ">" + label + "</a>";
  };
  Engine.prototype.model = function () {
    return this.state.model ? this.PRICES[this.state.model] : null;
  };

  Engine.prototype.priceText = function (m, period) {
    var vi = this.state.lang === "vi";
    var p = m[period];
    var perEn = { day: "per day", week: "per week", month: "per month" };
    var perVi = { day: "mỗi ngày", week: "mỗi tuần", month: "mỗi tháng" };
    if (p == null) {
      var which = period === "week" ? (vi ? "tuần" : "weekly") : (vi ? "tháng" : "monthly");
      return vi
        ? this.vnd(m.day) + "/ngày. Chúng tôi chưa có giá " + which + " đã xác minh cho xe " + m.name + " — vui lòng liên hệ để báo giá."
        : this.vnd(m.day) + " per day. We do not have a verified " + which + " price for the " + m.name + " — contact us for a quote.";
    }
    if (Array.isArray(p)) {
      if (p[0] === p[1]) return m.name + ": " + this.vnd(p[0]) + " " + (vi ? perVi[period] : perEn[period]) + ".";
      return m.name + ": " + this.vnd(p[0]) + " – " + this.vnd(p[1]) + " " +
        (vi ? perVi[period] + " (khoảng giá đã xác minh, giá chính xác tùy từng xe — liên hệ để biết chính xác)."
            : perEn[period] + " (verified range — the exact rate depends on the bike, contact us for a precise quote).");
    }
    return m.name + ": " + this.vnd(p) + " " + (vi ? perVi[period] : perEn[period]) + ".";
  };

  Engine.prototype.totalText = function (m, qty, duration) {
    var vi = this.state.lang === "vi";
    if (duration.unit === "day") {
      var unit = m.day;
      var total = qty * duration.count * unit;
      return vi
        ? this.vnd(total) + " (" + qty + " " + m.name + " × " + duration.count + " ngày × " + this.vnd(unit) + "/ngày)."
        : this.vnd(total) + " (" + qty + " " + m.name + " × " + duration.count + " days × " + this.vnd(unit) + "/day).";
    }
    if (duration.unit === "week") {
      if (m.week == null) return null;
      var totalW = qty * duration.count * m.week;
      return vi
        ? this.vnd(totalW) + " (" + qty + " " + m.name + " × " + duration.count + " tuần × " + this.vnd(m.week) + "/tuần)."
        : this.vnd(totalW) + " (" + qty + " " + m.name + " × " + duration.count + " weeks × " + this.vnd(m.week) + "/week).";
    }
    // month: verified ranges stay ranges — only compute single totals for fixed prices
    var pm = m.month;
    if (pm == null) return null;
    if (Array.isArray(pm)) {
      if (pm[0] === pm[1]) {
        var totalM = qty * duration.count * pm[0];
        return vi
          ? this.vnd(totalM) + " (" + qty + " " + m.name + " × " + duration.count + " tháng × " + this.vnd(pm[0]) + "/tháng)."
          : this.vnd(totalM) + " (" + qty + " " + m.name + " × " + duration.count + " months × " + this.vnd(pm[0]) + "/month).";
      }
      // range × qty: show the range, do not invent one number
      return vi
        ? m.name + ": " + this.vnd(pm[0]) + " – " + this.vnd(pm[1]) + "/tháng (khoảng giá; liên hệ cho giá " + (qty > 1 ? qty + " xe " : "") + "chính xác)."
        : m.name + ": " + this.vnd(pm[0]) + " – " + this.vnd(pm[1]) + "/month (verified range — contact us for an exact quote" + (qty > 1 ? " for " + qty + " bikes" : "") + ").";
    }
    var totalMs = qty * duration.count * pm;
    return vi
      ? this.vnd(totalMs) + " (" + qty + " " + m.name + " × " + duration.count + " tháng × " + this.vnd(pm) + "/tháng)."
      : this.vnd(totalMs) + " (" + qty + " " + m.name + " × " + duration.count + " months × " + this.vnd(pm) + "/month).";
  };

  Engine.prototype.replyPrice = function () {
    var vi = this.state.lang === "vi";
    var m = this.model();
    var pricesLink = vi ? this.a("/hanoi-motorbike-rental-cost/", "Xem bảng giá") : this.a("/hanoi-motorbike-rental-cost/", "View full price table");
    if (!m) {
      if (this.state.period) {
        return vi
          ? "Bạn muốn hỏi xe nào? Wave, Sirius, Mio, Click, Vision, Air Blade, xe điện hay 50cc?"
          : "Which bike would you like the price for — Wave, Sirius, Mio, Click, Vision, Air Blade, electric or 50cc?";
      }
      return vi
        ? "Giá thuê từ 150.000 VND/ngày (Wave, Sirius, Mio, Click). Vision, Air Blade, xe điện và 50cc là 200.000 VND/ngày. " + pricesLink + "."
        : "Rental prices start at 150,000 VND/day (Honda Wave, Yamaha Sirius, Yamaha Mio, Honda Click). Honda Vision, Honda Air Blade, electric and 50cc are 200,000 VND/day. " + pricesLink + ".";
    }
    var period = this.state.period || "day";
    var total = null;
    if (this.state.qty && this.state.duration) {
      total = this.totalText(m, this.state.qty, this.state.duration);
      if (total) return total;
    } else if (this.state.qty && period && !this.state.duration) {
      // qty × fixed period price (day/week); ranges stay ranges
      var p = m[period === "month" ? "month" : period];
      if (Array.isArray(p)) {
        return vi
          ? m.name + ": " + this.vnd(p[0]) + " – " + this.vnd(p[1]) + "/tháng mỗi xe (" + this.state.qty + " xe — liên hệ cho báo giá chính xác)."
          : m.name + ": " + this.vnd(p[0]) + " – " + this.vnd(p[1]) + "/month per bike (" + this.state.qty + " bikes — contact us for an exact quote).";
      }
      if (p == null) { return this.priceText(m, period); }
      return vi
        ? this.vnd(p * this.state.qty) + " (" + this.state.qty + " × " + m.name + ", " + this.vnd(p) + "/" + (period === "week" ? "tuần" : "ngày") + ")."
        : this.vnd(p * this.state.qty) + " (" + this.state.qty + " × " + m.name + " at " + this.vnd(p) + "/" + (period === "week" ? "week" : "day") + ").";
    }
    var text = this.priceText(m, period);
    if (period === "day") {
      var vi2 = this.state.lang === "vi";
      text += vi2 ? " " + this.a("/hanoi-motorbike-rental-cost/", "Xem giá tuần/tháng") : " " + this.a("/hanoi-motorbike-rental-cost/", "See weekly/monthly prices");
    }
    return text;
  };

  Engine.prototype.reply = function (raw) {
    var original = raw || "";
    var vi = VIET_CHARS.test(original) || VN_MARKERS.test(norm(original));
    this.state.lang = vi ? "vi" : "en";
    var t = norm(original);
    var gm = t.match(GREETING_RE);
    var greeted = !!gm;
    if (gm) t = t.slice(gm[0].length);

    var model = detectModel(t);
    var period = detectPeriod(t);
    var qty = detectQty(t);
    var duration = detectDuration(t);
    var intent = detectIntent(t);

    if (model) this.state.model = model;
    if (period) this.state.period = period;
    if (qty) this.state.qty = qty;
    if (duration) this.state.duration = duration;

    var hi = vi ? "Xin chào! " : "Hi! ";
    var answer = "";

    if (!intent && greeted) intent = "greet";

    switch (intent) {
      case "price":
        answer = this.replyPrice();
        break;
      case "avail":
        var mName = this.model() ? this.model().name : (vi ? "xe bạn cần" : "the bike");
        answer = vi
          ? "Tôi không thể kiểm tra xe còn hay hết tại đây. Vui lòng " + this.a("tel:" + this.BUSINESS.phoneTel, "gọi " + this.BUSINESS.phone) + " hoặc " + this.a("mailto:" + this.BUSINESS.email, "email") + " để xác nhận " + mName + " cho ngày bạn cần."
          : "I can\u2019t check live availability from here. Please " + this.a("tel:" + this.BUSINESS.phoneTel, "call " + this.BUSINESS.phone) + " or " + this.a("mailto:" + this.BUSINESS.email, "email us") + " to confirm the " + mName + " for your dates.";
        break;
      case "delivery":
        answer = vi
          ? "Chúng tôi chưa có thông tin giao xe đã xác minh. Vui lòng " + this.a("tel:" + this.BUSINESS.phoneTel, "liên hệ") + " để hỏi về giao nhận tại địa điểm của bạn."
          : "We don\u2019t have verified delivery details to share here. Please " + this.a("tel:" + this.BUSINESS.phoneTel, "contact us") + " to ask about delivery or pickup for your location.";
        break;
      case "docs":
        answer = vi
          ? "Về giấy tờ: quy định bằng lái ở Việt Nam có thể thay đổi và tôi không đưa kết luận pháp lý. Xem hướng dẫn " + this.a("/renting-a-motorbike-in-vietnam/", "thuê xe máy ở Việt Nam") + " và xác nhận với cơ quan có thẩm quyền trước khi chạy."
          : "Licensing rules in Vietnam can change and I can\u2019t give legal advice. See our " + this.a("/renting-a-motorbike-in-vietnam/", "Renting a Motorbike in Vietnam") + " guide and confirm current requirements with official sources before riding.";
        break;
      case "hours":
        var now = new Date();
        var hourNow = 0;
        try {
          var fmtH = new Intl.DateTimeFormat("en-GB", { timeZone: this.BUSINESS.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
          var parts = fmtH.format(now).split(":");
          hourNow = parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
        } catch (e) { hourNow = now.getHours() + now.getMinutes() / 60; }
        var isOpen = hourNow >= this.BUSINESS.openHour && hourNow < this.BUSINESS.closeHour;
        answer = vi
          ? "Giờ mở cửa: " + this.BUSINESS.hoursText + " (giờ Việt Nam). Hiện tại " + (isOpen ? "đang mở, đến 21:00." : "đang đóng — mở lại lúc 09:00.")
          : "Opening hours: " + this.BUSINESS.hoursText + " (Hanoi time). We are " + (isOpen ? "open right now, until 21:00." : "closed right now — we open at 09:00.");
        break;
      case "where":
        if (/old quarter|pho co/.test(t)) {
          answer = vi
            ? "Shop ở Long Bien, chỉ cách Phố cổ qua sông Hồng. Xem hướng dẫn " + this.a("/motorbike-rental-hanoi-old-quarter/", "thuê xe ở Phố cổ") + ". Địa chỉ: " + this.BUSINESS.address + ". " + this.a(this.BUSINESS.mapsUrl, "Chỉ đường", true)
            : "We are in Long Bien, a short ride across the Red River from the Old Quarter — see " + this.a("/motorbike-rental-hanoi-old-quarter/", "Old Quarter rental guide") + ". Address: " + this.BUSINESS.address + ". " + this.a(this.BUSINESS.mapsUrl, "Get directions", true);
        } else {
          answer = vi
            ? "Địa chỉ: " + this.BUSINESS.address + ". " + this.a(this.BUSINESS.mapsUrl, "Chỉ đường", true)
            : "We are at " + this.BUSINESS.address + ". " + this.a(this.BUSINESS.mapsUrl, "Open in Google Maps", true);
        }
        break;
      case "contact":
        answer = vi
          ? "Gọi " + this.a("tel:" + this.BUSINESS.phoneTel, this.BUSINESS.phone) + " hoặc email " + this.a("mailto:" + this.BUSINESS.email, this.BUSINESS.email) + ". Giờ làm việc: " + this.BUSINESS.hoursText + "."
          : "Call " + this.a("tel:" + this.BUSINESS.phoneTel, this.BUSINESS.phone) + " or email " + this.a("mailto:" + this.BUSINESS.email, this.BUSINESS.email) + ". Hours: " + this.BUSINESS.hoursText + ".";
        break;
      case "deposit":
        answer = vi
          ? "Chúng tôi chưa có thông tin tiền cọc đã xác minh. Vui lòng " + this.a("tel:" + this.BUSINESS.phoneTel, "liên hệ") + " để biết điều khoản cho lần thuê của bạn."
          : "We don\u2019t have verified deposit terms to share here. Please " + this.a("tel:" + this.BUSINESS.phoneTel, "contact us") + " to confirm the deposit for your rental.";
        break;
      case "buy":
        answer = vi
          ? "Chúng tôi cho thuê xe máy và chưa có thông tin bán xe đã xác minh. Nếu bạn cân nhắc mua hay thuê, xem hướng dẫn " + this.a("/hanoi-motorbike-for-sale/", "mua xe hay thuê xe") + "."
          : "We rent motorbikes and don\u2019t have verified bikes for sale. If you\u2019re weighing buying vs renting, see our " + this.a("/hanoi-motorbike-for-sale/", "buying vs renting guide") + ".";
        break;
      case "travel":
        answer = vi
          ? "Gợi ý đường chạy: xem hub " + this.a("/hanoi-motorbike-trips/", "chuyến đi bằng xe máy từ Hà Nội") + " — Ninh Bình, Ba Vì và các cung đường miền Bắc."
          : "For ride ideas from Hanoi — Ninh Binh, Ba Vi and Northern Vietnam routes — see our " + this.a("/hanoi-motorbike-trips/", "Hanoi Motorbike Trips") + " hub.";
        break;
      case "greet":
        answer = vi
          ? "Xin chào! Tôi trả lời giá thuê, giờ mở cửa, địa chỉ và các dòng xe. Bạn cần biết gì?"
          : "Hello! I can help with rental prices, models, our location and opening hours. What would you like to know?";
        break;
      default:
        // maybe follow-up like "and monthly?" — price period with remembered model
        if ((period || qty || duration) && this.state.model) {
          answer = this.replyPrice();
        } else {
          answer = vi
            ? "Tôi chưa hiểu rõ câu hỏi. Bạn hỏi về giá, giờ mở cửa, địa chỉ hay dòng xe nào (Wave, Vision, 50cc…)?"
            : "I\u2019m not sure what you\u2019re asking. Do you want prices, opening hours, our location, or a specific bike (Wave, Vision, 50cc\u2026)?";
        }
    }
    return (greeted && intent !== "greet" ? hi : "") + answer;
  };

  root.MotorbikeAssistant = { Engine: Engine, norm: norm };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.MotorbikeAssistant;
  }

  /* ---------------- DOM wiring ---------------- */
  function wire() {
    var panel = document.getElementById("chat-panel");
    if (!panel) return;
    var log = panel.querySelector(".chat-log");
    var form = panel.querySelector(".chat-input");
    var input = form ? form.querySelector("input") : null;
    var engine = new Engine();
    function esc(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function addMsg(html, who) {
      var div = document.createElement("div");
      div.className = "chat-msg " + who;
      div.innerHTML = html;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }
    function send(text) {
      text = (text || "").trim();
      if (!text) return;
      addMsg(esc(text), "user");
      setTimeout(function () { addMsg(engine.reply(text), "bot"); }, 200);
    }
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      send(input.value);
      input.value = "";
    });
    var quick = panel.querySelectorAll(".chat-quick button");
    for (var i = 0; i < quick.length; i++) {
      (function (b) {
        b.addEventListener("click", function () {
          engine.reset(); // quick chips start a fresh question, not a follow-up
          send(b.getAttribute("data-q") || b.textContent);
        });
      })(quick[i]);
    }
  }
  if (typeof document !== "undefined" && typeof document.getElementById === "function" && document.getElementById("chat-panel")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wire);
    } else {
      wire();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
