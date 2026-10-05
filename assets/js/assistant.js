/* =====================================================
   Rule-based local assistant — no API, no backend.
   Uses shared BUSINESS / PRICES config. English only.
   Never invents availability, promotions, deposits,
   delivery times, guarantees or legal conclusions.
   ===================================================== */
(function initAssistant() {
  var panel = document.getElementById('chat-panel');
  if (!panel) return;
  var log = panel.querySelector('.chat-log');
  var form = panel.querySelector('.chat-input');
  var input = form ? form.querySelector('input') : null;
  var nf = new Intl.NumberFormat('en-US');
  function vnd(n) { return nf.format(n) + ' VND'; }
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function modelOf(text) {
    var t = text.toLowerCase();
    if (t.indexOf('wave') > -1) return PRICES.wave;
    if (t.indexOf('sirius') > -1) return PRICES.sirius;
    if (t.indexOf('mio') > -1) return PRICES.mio;
    if (t.indexOf('click') > -1) return PRICES.click;
    if (t.indexOf('vision') > -1) return PRICES.vision;
    if (t.indexOf('air blade') > -1 || t.indexOf('airblade') > -1) return PRICES.airblade;
    if (t.indexOf('electric') > -1) return PRICES.electric;
    if (t.indexOf('50cc') > -1 || t.indexOf('moped') > -1) return PRICES.cc50;
    return null;
  }
  function modelPriceReply(m, period) {
    var p = m[period];
    if (p === null || p === undefined) {
      return period === 'week'
        ? 'The ' + m.name + ' is ' + vnd(m.day) + ' per day. We do not have a verified weekly price for it \u2014 contact us for verified weekly pricing.'
        : 'The ' + m.name + ' is ' + vnd(m.day) + ' per day. We do not have a verified monthly price for it \u2014 contact us for verified monthly pricing.';
    }
    if (Array.isArray(p)) {
      return m.name + ': ' + vnd(p[0]) + ' \u2013 ' + vnd(p[1]) + ' per month (the exact monthly rate depends on the model \u2014 contact us for a precise quote).';
    }
    return m.name + ': ' + vnd(p) + ' per ' + period + '.';
  }
  function reply(text) {
    var t = text.toLowerCase();
    var m = modelOf(t);
    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t)) {
      return 'Hello! I can help with rental prices, our motorbike models, our Long Bien location and opening hours. What would you like to know?';
    }
    if (m && (t.indexOf('price') > -1 || t.indexOf('cost') > -1 || t.indexOf('rent') > -1 || t.indexOf('how much') > -1 || t.indexOf('week') > -1 || t.indexOf('month') > -1 || t.indexOf('day') > -1)) {
      if (t.indexOf('month') > -1) return modelPriceReply(m, 'month');
      if (t.indexOf('week') > -1) return modelPriceReply(m, 'week');
      return modelPriceReply(m, 'day');
    }
    if (t.indexOf('50cc') > -1 || t.indexOf('moped') > -1) {
      return '50cc Scooter / Motorbike: ' + vnd(PRICES.cc50.day) + ' per day. We do not have verified weekly or monthly 50cc prices \u2014 contact us for those rental periods.';
    }
    if (t.indexOf('scooter') > -1) {
      return 'Our automatic scooters are Honda Click, Yamaha Mio (150,000 VND/day), Honda Vision and Honda Air Blade (200,000 VND/day). See the <a href="/hanoi-scooter-rental/">Hanoi Scooter Rental</a> guide for details.';
    }
    if (t.indexOf('electric') > -1) {
      return 'Electric Motorbike: 200,000 VND/day, 1,000,000 VND/week, 1,500,000 VND/month.';
    }
    if (t.indexOf('price') > -1 || t.indexOf('cost') > -1 || t.indexOf('how much') > -1) {
      return 'Rental prices start at 150,000 VND/day (Honda Wave, Yamaha Sirius, Yamaha Mio, Honda Click). Premium models and 50cc bikes are 200,000 VND/day. Weekly from 700,000 VND, monthly from 900,000 VND. See our <a href="/hanoi-motorbike-rental-cost/">rental cost guide</a> for the full price table.';
    }
    if (t.indexOf('address') > -1 || t.indexOf('location') > -1 || t.indexOf('where') > -1 || t.indexOf('map') > -1) {
      return 'We are at ' + BUSINESS.address + '. <a href="' + BUSINESS.mapsUrl + '" target="_blank" rel="noopener">Open in Google Maps</a>.';
    }
    if (t.indexOf('old quarter') > -1) {
      return 'We are based in Long Bien, a short ride across the Red River from Hanoi Old Quarter. See <a href="/motorbike-rental-hanoi-old-quarter/">Motorbike Rental Hanoi Old Quarter</a> for details.';
    }
    if (t.indexOf('hour') > -1 || t.indexOf('open') > -1 || t.indexOf('close') > -1) {
      var fmt = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS.timezone, hour: '2-digit', minute: '2-digit', hour12: false });
      var parts = fmt.format(new Date()).split(':');
      var hourNow = parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
      var isOpen = hourNow >= BUSINESS.openHour && hourNow < BUSINESS.closeHour;
      return 'Opening hours: ' + BUSINESS.hoursText + ' (Hanoi time). We are ' + (isOpen ? 'open right now, until 21:00.' : 'closed right now \u2014 we open at 09:00.');
    }
    if (t.indexOf('contact') > -1 || t.indexOf('phone') > -1 || t.indexOf('call') > -1 || t.indexOf('email') > -1 || t.indexOf('zalo') > -1 || t.indexOf('whatsapp') > -1) {
      return 'You can call us at <a href="tel:' + BUSINESS.phoneTel + '">' + BUSINESS.phone + '</a> or email <a href="mailto:' + BUSINESS.email + '">' + BUSINESS.email + '</a>.';
    }
    if (t.indexOf('deposit') > -1) {
      return 'I don\u2019t have verified deposit information to share here. Please contact us directly to confirm the deposit terms for your rental.';
    }
    if (t.indexOf('license') > -1 || t.indexOf('legal') > -1 || t.indexOf('law') > -1) {
      return 'Licensing rules for riding in Vietnam can change. Please check our <a href="/renting-a-motorbike-in-vietnam/">Renting a Motorbike in Vietnam</a> guide and verify current requirements with official sources before riding.';
    }
    if (t.indexOf('deliver') > -1) {
      return 'I don\u2019t have verified delivery information. Please contact us directly to confirm what\u2019s possible for your location.';
    }
    if (t.indexOf('available') > -1 || t.indexOf('availability') > -1 || t.indexOf('in stock') > -1) {
      return 'I can\u2019t confirm live availability from here. Contact us to confirm availability of the model you want.';
    }
    if (t.indexOf('discount') > -1 || t.indexOf('promotion') > -1 || t.indexOf('deal') > -1 || t.indexOf('sale') > -1) {
      return 'I don\u2019t have verified promotion information. Our standard verified prices are listed on the homepage \u2014 contact us for anything specific.';
    }
    if (t.indexOf('trip') > -1 || t.indexOf('travel') > -1 || t.indexOf('route') > -1 || t.indexOf('ninh binh') > -1 || t.indexOf('ba vi') > -1) {
      return 'For ride ideas, see our <a href="/hanoi-motorbike-trips/">Hanoi Motorbike Trips</a> hub \u2014 day trips, Northern Vietnam routes and travel preparation tips.';
    }
    return 'I don\u2019t have verified information about that yet. Please contact us directly to confirm.';
  }
  function addMsg(text, who) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + who;
    div.innerHTML = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = (input.value || '').trim();
    if (!text) return;
    addMsg(esc(text), 'user');
    input.value = '';
    setTimeout(function () { addMsg(reply(text), 'bot'); }, 250);
  });
  panel.querySelectorAll('.chat-quick button').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-q') || b.textContent;
      addMsg(esc(text), 'user');
      setTimeout(function () { addMsg(reply(text), 'bot'); }, 250);
    });
  });
})();
