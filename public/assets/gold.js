/* ==========================================================================
   NIKKI MEDIA, Gold-Landingpages (views/gold-pages.ts)
   Views-Regler mit Preis und Kurve, Margenrechner, Menü, Investorenformular.
   Kein localStorage, kein Framework.
   ========================================================================== */
(function () {
  'use strict';

  var fmt = function (n) { return Math.round(n).toLocaleString('de-DE'); };

  /* ---------- Menü ---------- */
  var burger = document.querySelector('[data-burger]');
  var menu = document.getElementById('g-mobile');
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = menu.hidden;
      menu.hidden = !open;
      burger.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) { menu.hidden = true; burger.setAttribute('aria-expanded', 'false'); }
    });
  }

  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Kurve: dieselbe Formel wie reachChart() in gold-pages.ts ---------- */
  function chart(m, max) {
    var n = 28, w = 600, floor = 210;
    var h = 78 + 110 * Math.pow(Math.min(m, max) / max, 0.55);
    var d = '';
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var ease = 1 - Math.pow(1 - t, 1.8);
      var wobble = (Math.sin(i * 1.7) * 5 + Math.sin(i * 0.63) * 4) * (0.4 + t * 0.6);
      d += (i ? 'L' : 'M') + (t * w).toFixed(1) + ' ' + (floor - 8 - h * ease + wobble).toFixed(1) + ' ';
    }
    return { line: d.trim(), area: d + 'L600 230 L0 230 Z' };
  }

  /* ---------- Views-Regler ---------- */
  var app = document.querySelector('[data-reach]');
  if (app) {
    var input = app.querySelector('[data-reach-input]');
    var viewsEl = app.querySelector('[data-reach-views]');
    var priceEl = app.querySelector('[data-reach-price]');
    var lineEl = app.querySelector('[data-reach-line]');
    var areaEl = app.querySelector('[data-reach-area]');
    var marginIn = app.querySelector('[data-margin-input]');
    var marginOut = app.querySelector('[data-margin-out]');
    var perMillion = parseFloat(app.getAttribute('data-price-per-million')) || 5000;
    var max = parseFloat(input.max) || 50;
    var min = parseFloat(input.min) || 1;
    var raf = 0;

    var update = function () {
      var m = parseFloat(input.value) || min;
      var price = m * perMillion;
      viewsEl.textContent = fmt(m * 1e6);
      priceEl.textContent = fmt(price) + ' €';
      input.setAttribute('aria-valuetext', m + ' Millionen Views, ' + fmt(price) + ' €');
      input.style.setProperty('--pct', ((m - min) / (max - min)) * 100 + '%');
      var c = chart(m, max);
      lineEl.setAttribute('d', c.line);
      areaEl.setAttribute('d', c.area);
      if (marginIn && marginOut) {
        var resale = parseFloat(String(marginIn.value).replace(',', '.'));
        var ours = perMillion / 1000;
        var margin = isFinite(resale) ? Math.max(0, (resale - ours) * m * 1000) : 0;
        marginOut.textContent = fmt(margin) + ' €';
      }
    };

    input.addEventListener('input', function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    });
    if (marginIn) marginIn.addEventListener('input', update);
    update();
  }

  /* ---------- Investorenformular ---------- */
  var inv = document.querySelector('[data-investor-form]');
  if (inv) {
    var err = inv.querySelector('[data-error]');
    var ok = inv.querySelector('[data-ok]');
    var btn = inv.querySelector('[data-submit]');
    var phone = inv.querySelector('[name="phone"]');
    if (phone) phone.addEventListener('input', function () { phone.value = phone.value.replace(/[^0-9 ]/g, ''); });

    inv.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var f = new FormData(inv);
      var data = {
        fullName: String(f.get('fullName') || ''),
        company: String(f.get('company') || ''),
        email: String(f.get('email') || ''),
        phoneDial: String(f.get('phoneDial') || ''),
        phone: String(f.get('phone') || ''),
        kind: String(f.get('kind') || ''),
        ticket: String(f.get('ticket') || ''),
        message: String(f.get('message') || ''),
        website: String(f.get('website') || ''),
        privacy: !!f.get('privacy')
      };
      if (!data.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.phone.replace(/\D/g, '').length < 4 || !data.kind || !data.ticket || !data.privacy) {
        err.textContent = 'Bitte fülle Name, E-Mail, Telefon, Art und Ticketgröße aus und stimme der Datenschutzerklärung zu.';
        err.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Wird gesendet …';
      fetch('/api/investors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Das hat leider nicht geklappt. Bitte versuche es erneut.');
          inv.querySelectorAll('.fields, .check, .stepper__nav').forEach(function (el) { el.hidden = true; });
          ok.hidden = false;
          ok.focus && ok.setAttribute('tabindex', '-1');
          ok.focus && ok.focus();
        })
        .catch(function (e2) {
          err.textContent = e2.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Gespräch anfragen';
        });
    });
  }
})();
