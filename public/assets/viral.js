/* ==========================================================================
   NIKKI MEDIA, „Virale Clips“ in der Übersicht jedes Dashboards
   Markup: viralSection() in src/views/layout.ts · Daten: GET /api/viral-clips
   (src/lib/viral.ts, je Rolle eingegrenzt). Styles: /assets/dash-glass.css
   ========================================================================== */
(function () {
  'use strict';
  var box = document.querySelector('[data-viral-clips]');
  if (!box) return;
  var list = box.querySelector('[data-viral-list]');
  var en = list.getAttribute('data-lang') === 'en';
  var area = box.getAttribute('data-area');

  var T = en
    ? { empty: 'No published clips with numbers yet. As soon as a clip is live, it shows up here with its views.', fail: 'Clips could not be loaded. Reload the page to try again.', views: 'views', open: 'Open post' }
    : { empty: 'Noch keine veröffentlichten Clips mit Zahlen. Sobald ein Clip läuft, erscheint er hier mit seinen Views.', fail: 'Die Clips konnten nicht geladen werden. Lade die Seite neu, um es erneut zu versuchen.', views: 'Views', open: 'Beitrag öffnen' };

  var PLAT = { instagram: 1, tiktok: 1, youtube: 1, facebook: 1, linkedin: 1, twitter: 1, x: 'twitter', snapchat: 1, twitch: 1 };

  function short(n) {
    if (n >= 1e9) return (n / 1e9).toLocaleString(en ? 'en-GB' : 'de-DE', { maximumFractionDigits: 1 }) + (en ? 'B' : ' Mrd.');
    if (n >= 1e6) return (n / 1e6).toLocaleString(en ? 'en-GB' : 'de-DE', { maximumFractionDigits: 1 }) + (en ? 'M' : ' Mio.');
    if (n >= 1e4) return Math.round(n / 1e3).toLocaleString(en ? 'en-GB' : 'de-DE') + (en ? 'K' : ' Tsd.');
    return Math.round(n).toLocaleString(en ? 'en-GB' : 'de-DE');
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function message(text) {
    list.innerHTML = '';
    list.appendChild(el('p', 'nmv__empty', text));
  }

  fetch('/api/viral-clips?area=' + encodeURIComponent(area), { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (data) {
      var clips = (data && data.clips) || [];
      if (!clips.length) return message(T.empty);
      list.innerHTML = '';
      clips.forEach(function (c, i) {
        var card = el(c.url ? 'a' : 'div', 'nmv__clip');
        if (c.url) {
          card.href = c.url;
          card.target = '_blank';
          card.rel = 'noopener';
          card.setAttribute('aria-label', T.open + ': ' + c.campaign + ', ' + short(c.views) + ' ' + T.views);
        }
        if (c.thumb) {
          var img = el('img');
          img.src = c.thumb;
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.onerror = function () { img.remove(); };
          card.appendChild(img);
        }
        card.appendChild(el('span', 'nmv__rank', String(i + 1)));
        var meta = el('span', 'nmv__meta');
        var v = el('span', 'nmv__views', short(c.views) + ' ');
        v.appendChild(el('small', '', T.views));
        meta.appendChild(v);
        meta.appendChild(el('span', 'nmv__name', c.handle ? '@' + c.handle : c.campaign)).title = c.campaign;
        var plat = el('span', 'nmv__plat');
        (c.platforms || []).forEach(function (p) {
          var key = PLAT[p] === 1 ? p : PLAT[p];
          if (!key) return;
          var pi = el('img');
          pi.src = '/img/platforms/' + key + '.svg';
          pi.alt = p;
          plat.appendChild(pi);
        });
        meta.appendChild(plat);
        card.appendChild(meta);
        list.appendChild(card);
      });
    })
    .catch(function () { message(T.fail); });
})();
