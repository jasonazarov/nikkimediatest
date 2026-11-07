/* ==========================================================================
   NIKKI MEDIA, „Kampagne pushen“ (+20 / +35 / +50 % Budget)
   Markup: upsellSection() in src/views/layout.ts · Daten: GET/POST /api/upsell
   (src/lib/upsell.ts). Preise rechnet der Server, der Browser zeigt sie nur.
   Übersicht: alle laufenden Kampagnen mit Reitern. Kampagnenseite
   (data-project): nur diese eine. Ohne passende Kampagne verschwindet der
   ganze Bereich.
   Popup (Vorgabe des Auftraggebers, November 2026): auf der Übersicht von
   Kunde und Agentur höchstens alle X Tage, X je Kunde im Admin einstellbar
   (popupDays vom Server, Standard 7, 0 = aus). Der Cookie
   nm_push_pop_<bereich> merkt sich, WANN es zuletzt kam, damit eine
   geänderte Einstellung sofort greift.
   nur für Kampagnen, deren Zeitraum noch läuft, mit den Tagen bis zum Ende,
   weil der Push-Rabatt nur bis dahin gilt (daysLeft/endsAt vom Server).
   ========================================================================== */
(function () {
  'use strict';
  var box = document.querySelector('[data-upsell]');
  if (!box) return;
  var area = box.getAttribute('data-area');
  var only = box.getAttribute('data-project');
  /* Was jede Stufe bringt: kurz und ohne Versprechen, die wir nicht messen. */
  var PITCH = { 20: 'Mehr Clips im Umlauf', 35: 'Mehr Clipper auf deiner Kampagne', 50: 'Maximaler Schub' };
  var POP_COOKIE = 'nm_push_pop_' + area;
  var POP_KEEP = 180 * 24 * 3600; // Cookie hält länger als jeder Abstand (max. 90 Tage)

  var euro = function (c) {
    return (c / 100).toLocaleString('de-DE', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  };
  var num = function (n) { return Math.round(n).toLocaleString('de-DE'); };
  var SOURCE = {
    briefing: 'aus deinem Briefing',
    reached: 'bisher erreicht',
    'default': 'Richtwert, solange es noch keine Zahlen gibt'
  };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var dateDE = function (unix) { return new Date(unix * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  var discounts = function (c) { return c.offers.some(function (o) { return o.discountPct > 0; }); };
  /* Wie lange der Rabatt noch gilt. Nur Kunde und Agentur haben einen. */
  function countdown(c) {
    if (area === 'creator') return null;
    var box2 = el('p', 'nmu__left' + (c.daysLeft > 0 && c.daysLeft <= 7 ? ' is-soon' : ''));
    if (c.daysLeft > 0) {
      box2.appendChild(el('b', '', 'Noch ' + c.daysLeft + (c.daysLeft === 1 ? ' Tag:' : ' Tage:')));
      box2.appendChild(document.createTextNode(' Push-Rabatt verfällt am ' + dateDE(c.endsAt) + ', zum Ende des Kampagnenzeitraums.'));
    } else {
      box2.appendChild(document.createTextNode('Der Kampagnenzeitraum ist vorbei, deshalb gibt es keinen Push-Rabatt mehr.'));
    }
    return box2;
  }

  /* Ein Push-Bereich: als Abschnitt der Seite oder im Popup, gleiches Verhalten. */
  function panel(body, state) {
  function render() {
    var c = state.campaigns[state.current];
    body.innerHTML = '';

    if (state.campaigns.length > 1) {
      var tabs = el('div', 'nmu__tabs');
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Kampagne wählen');
      state.campaigns.forEach(function (k, i) {
        var t = el('button', 'nmu__tab' + (i === state.current ? ' is-on' : ''), k.name);
        t.type = 'button';
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', String(i === state.current));
        t.addEventListener('click', function () { state.current = i; render(); });
        tabs.appendChild(t);
      });
      body.appendChild(tabs);
    }

    var base = el('p', 'nmu__base');
    base.appendChild(el('b', '', (state.campaigns.length > 1 ? '' : c.name + ': ') + num(c.baseViews) + ' Views'));
    base.appendChild(document.createTextNode(' ' + SOURCE[c.baseSource] + ' · ' + euro(c.perThousandCents) + ' pro 1.000 Views'));
    body.appendChild(base);

    /* Bedingungen (Vorgabe des Auftraggebers): nur im Kampagnenzeitraum, Rabatt, spätestens 5 Werktage. */
    var left = countdown(c);
    if (left) body.appendChild(left);
    var terms = el('div', 'nmu__terms');
    terms.appendChild(el('strong', 'nmu__only', 'Kampagnen-Push-Angebote sind nur innerhalb des vereinbarten Kampagnenzeitraums möglich.'));
    if (discounts(c)) {
      terms.appendChild(el('span', 'nmu__disc', 'Push-Rabatt: ' + c.offers.map(function (o) {
        return o.discountPct.toLocaleString('de-DE') + ' % auf +' + o.percent + ' %';
      }).join(', ') + '.'));
    }
    terms.appendChild(el('span', 'nmu__time', 'Zahlungsziel für das zusätzliche Budget: 5 Werktage nach Bestätigung ' + (area === 'agency' ? 'eurer' : 'deiner') + ' Anfrage.'));
    body.appendChild(terms);

    var grid = el('div', 'nmu__grid');
    c.offers.forEach(function (o) {
      var card = el('div', 'nmu__offer' + (o.percent === 35 ? ' is-pick' : ''));
      if (o.percent === 35) card.appendChild(el('span', 'nmu__badge', 'Unsere Empfehlung'));
      card.appendChild(el('span', 'nmu__pct', '+' + o.percent + ' %'));
      card.appendChild(el('span', 'nmu__unit', 'mehr Budget · ' + (PITCH[o.percent] || '')));
      card.appendChild(el('span', 'nmu__views', '≈ +' + num(o.extraViews) + ' Views'));
      var agencyPrice = area === 'agency' && o.clientPriceCents != null;
      var plus = agencyPrice ? '' : '+';
      if (o.discountPct > 0) card.appendChild(el('span', 'nmu__was', plus + euro(agencyPrice ? o.clientListPriceCents : o.listPriceCents)));
      card.appendChild(el('span', 'nmu__price', plus + euro(agencyPrice ? o.clientPriceCents : o.priceCents)));
      if (o.discountPct > 0) card.appendChild(el('span', 'nmu__save', '−' + o.discountPct.toLocaleString('de-DE') + ' % Push-Rabatt'));
      card.appendChild(el('span', 'nmu__note', agencyPrice
        ? 'Euer Kundenpreis · unser Preis ' + euro(o.priceCents) + (state.marginPct ? ' · ' + state.marginPct + ' % Marge' : '')
        : 'Zahlbar innerhalb von 5 Werktagen nach Bestätigung.'));
      var btn = el('button', 'nmu__btn', o.pending ? 'Angefragt' : 'Kampagne pushen');
      btn.type = 'button';
      btn.disabled = !!o.pending;
      if (!o.pending) btn.addEventListener('click', function () { request(c, o, btn, card); });
      card.appendChild(btn);
      grid.appendChild(card);
    });
    body.appendChild(grid);
    if (area === 'agency') {
      var link = el('a', 'nmu__link', 'Marge anpassen');
      link.href = '/collaboration/preise';
      body.appendChild(link);
    }
    body.appendChild(el('p', 'nmu__msg', '')).setAttribute('role', 'status');
  }

  function request(c, o, btn, card) {
    var msg = body.querySelector('.nmu__msg');
    btn.disabled = true;
    btn.textContent = 'Wird gesendet …';
    fetch('/api/upsell', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ area: area, projectId: c.id, percent: o.percent })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (res) {
        if (!res.ok && res.status !== 409) throw new Error(res.d.error || 'Das hat nicht geklappt. Bitte versuche es erneut.');
        o.pending = true;
        btn.textContent = 'Angefragt';
        card.classList.add('is-done');
        msg.textContent = res.status === 409 ? res.d.error : 'Angefragt: +' + o.percent + ' % Budget (≈ +' + num(o.extraViews) + ' Views) für „' + c.name + '“. Jason meldet sich persönlich bei dir.';
        msg.className = 'nmu__msg is-good';
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = 'Kampagne pushen';
        msg.textContent = e.message;
        msg.className = 'nmu__msg is-bad';
      });
  }
  render();
  }

  /* Wann das Popup zuletzt kam (Unix-Sekunden), 0 = noch nie. */
  function lastShown() {
    var hit = document.cookie.split('; ').filter(function (k) { return k.indexOf(POP_COOKIE + '=') === 0; })[0];
    var v = hit ? Number(hit.slice(POP_COOKIE.length + 1)) : 0;
    return v > 1000000000 ? v : 0; // alter Wert „1“ aus der ersten Fassung zählt als „noch nie“
  }

  /* Popup alle X Tage (Admin-Einstellung): nur Übersicht, nur Kunde und Agentur, nur mit laufendem Rabatt. */
  function maybePopup(all, marginPct, popupDays) {
    if (only || (area !== 'customer' && area !== 'agency') || !(popupDays > 0)) return;
    var nowSec = Math.floor(Date.now() / 1000);
    if (lastShown() && nowSec - lastShown() < popupDays * 24 * 3600) return;
    var live = all.filter(function (c) { return c.daysLeft > 0 && discounts(c); })
      .sort(function (a, b) { return a.daysLeft - b.daysLeft; });
    if (!live.length) return;
    var congrats = document.getElementById('nmg-pop');
    if (congrats && !congrats.hidden) return; // Glückwunsch zuerst, Push beim nächsten Mal
    document.cookie = POP_COOKIE + '=' + nowSec + '; Max-Age=' + POP_KEEP + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');

    var pop = el('div', 'nmu-pop');
    var card = el('div', 'nmu-pop__card nmu');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'nmu-pop-t');
    var x = el('button', 'nmu-pop__x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Schließen');
    card.appendChild(x);
    card.appendChild(el('span', 'nmu__eyebrow', 'Kampagne pushen'));
    var t = el('h2', 'nmu-pop__t', live.length > 1 ? 'Push-Rabatt für eure laufenden Kampagnen' : 'Push-Rabatt für „' + live[0].name + '“');
    if (area === 'customer') t.textContent = live.length > 1 ? 'Push-Rabatt für deine laufenden Kampagnen' : 'Push-Rabatt für „' + live[0].name + '“';
    t.id = 'nmu-pop-t';
    card.appendChild(t);
    var inner = el('div', 'nmu-pop__body');
    card.appendChild(inner);
    var later = el('button', 'nmu-pop__later', 'Später');
    later.type = 'button';
    card.appendChild(later);
    pop.appendChild(card);
    document.body.appendChild(pop);
    panel(inner, { campaigns: live, marginPct: marginPct, current: 0 });

    function close() { pop.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.addEventListener('click', close);
    later.addEventListener('click', close);
    pop.addEventListener('click', function (e) { if (e.target === pop) close(); });
    document.addEventListener('keydown', onKey);
    x.focus();
  }

  fetch('/api/upsell?area=' + encodeURIComponent(area), { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (d) {
      var all = (d && d.campaigns) || [];
      var marginPct = (d && d.marginPct) || 0;
      var mine = only ? all.filter(function (k) { return k.id === only; }) : all;
      if (!mine.length) { gone(); return; }
      panel(box.querySelector('[data-upsell-body]'), { campaigns: mine, marginPct: marginPct, current: 0 });
      maybePopup(all, marginPct, d && d.popupDays != null ? d.popupDays : 7);
    })
    .catch(gone);

  // Ohne Angebot verschwinden mit dem Abschnitt auch die Knöpfe, die dorthin führen (Kampagnen-Kopf).
  function gone() {
    box.remove();
    document.querySelectorAll('[data-push-link]').forEach(function (a) { a.remove(); });
  }
})();
