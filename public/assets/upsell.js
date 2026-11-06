/* ==========================================================================
   NIKKI MEDIA, „Kampagne pushen“ (+20 / +35 / +50 % Budget)
   Markup: upsellSection() in src/views/layout.ts · Daten: GET/POST /api/upsell
   (src/lib/upsell.ts). Preise rechnet der Server, der Browser zeigt sie nur.
   Übersicht: alle laufenden Kampagnen mit Reitern. Kampagnenseite
   (data-project): nur diese eine. Ohne passende Kampagne verschwindet der
   ganze Bereich.
   ========================================================================== */
(function () {
  'use strict';
  var box = document.querySelector('[data-upsell]');
  if (!box) return;
  var area = box.getAttribute('data-area');
  var only = box.getAttribute('data-project');
  /* Was jede Stufe bringt: kurz und ohne Versprechen, die wir nicht messen. */
  var PITCH = { 20: 'Mehr Clips im Umlauf', 35: 'Mehr Clipper auf deiner Kampagne', 50: 'Maximaler Schub' };
  var body = box.querySelector('[data-upsell-body]');
  var state = { campaigns: [], marginPct: 0, current: 0 };

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

    var grid = el('div', 'nmu__grid');
    c.offers.forEach(function (o) {
      var card = el('div', 'nmu__offer' + (o.percent === 35 ? ' is-pick' : ''));
      if (o.percent === 35) card.appendChild(el('span', 'nmu__badge', 'Unsere Empfehlung'));
      card.appendChild(el('span', 'nmu__pct', '+' + o.percent + ' %'));
      card.appendChild(el('span', 'nmu__unit', 'mehr Budget · ' + (PITCH[o.percent] || '')));
      card.appendChild(el('span', 'nmu__views', '≈ +' + num(o.extraViews) + ' Views'));
      if (area === 'agency' && o.clientPriceCents != null) {
        var p = el('span', 'nmu__price', euro(o.clientPriceCents));
        card.appendChild(p);
        card.appendChild(el('span', 'nmu__note', 'Euer Kundenpreis · unser Preis ' + euro(o.priceCents) + (state.marginPct ? ' · ' + state.marginPct + ' % Marge' : '')));
      } else {
        card.appendChild(el('span', 'nmu__price', '+' + euro(o.priceCents)));
        card.appendChild(el('span', 'nmu__note', 'zusätzliches Budget, abgerechnet nach erreichten Views'));
      }
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

  fetch('/api/upsell?area=' + encodeURIComponent(area), { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (d) {
      state.campaigns = (d && d.campaigns) || [];
      if (only) state.campaigns = state.campaigns.filter(function (k) { return k.id === only; });
      state.marginPct = (d && d.marginPct) || 0;
      if (!state.campaigns.length) { box.remove(); return; }
      render();
    })
    .catch(function () { box.remove(); });
})();
