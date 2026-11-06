/* ==========================================================================
   NIKKI MEDIA — Interaktion
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------------
     Navigation
     --------------------------------------------------------------------- */
  var nav = document.querySelector('.nav');
  var burger = document.querySelector('.nav__burger');
  var mobile = document.querySelector('.nav__mobile');

  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (burger && mobile) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      mobile.classList.toggle('is-open', !open);
      document.body.style.overflow = !open ? 'hidden' : '';
    });
    mobile.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        burger.setAttribute('aria-expanded', 'false');
        mobile.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    });
  }

  /* ---------------------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------------------- */
  var revealables = document.querySelectorAll('.rv');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute('data-rv-delay') || '0', 10);
        setTimeout(function () { el.classList.add('is-in'); }, delay);
        revealIO.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealables.forEach(function (el) { revealIO.observe(el); });
  }

  /* ---------------------------------------------------------------------
     Zahlen-Animation  ·  <b data-count="113.2" data-dec="1" data-suffix=" M">
     --------------------------------------------------------------------- */
  /* Zahlenformat nach Sprache der Seite: „1.234.567“ auf den deutschen,
     „1,234,567“ auf den englischen Landingpages (lang am <html>). */
  var NUMBER_LOCALE = document.documentElement.lang === 'en' ? 'en-US' : 'de-DE';

  function formatNumber(value, decimals) {
    return value.toLocaleString(NUMBER_LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var duration = parseInt(el.getAttribute('data-dur') || '1500', 10);

    if (reduceMotion) {
      el.textContent = prefix + formatNumber(target, dec) + suffix;
      return;
    }

    /* Case-Boxen passen sich dem Inhalt an: Endbreite vorab festhalten,
       damit die Box beim Hochzählen nicht wächst. */
    var box = el.closest ? el.closest('.case__stat') : null;
    if (box) {
      el.textContent = prefix + formatNumber(target, dec) + suffix;
      box.style.minWidth = box.offsetWidth + 'px';
    }

    var start = performance.now();
    (function tick(now) {
      var p = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + formatNumber(target * eased, dec) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  var counters = document.querySelectorAll('[data-count]');
  if (!('IntersectionObserver' in window)) {
    counters.forEach(runCount);
  } else {
    var countIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCount(entry.target);
        countIO.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { countIO.observe(el); });
  }

  /* ---------------------------------------------------------------------
     Balken-Animation  ·  [data-bar="72"]  (Prozent der Höhe/Breite)
     --------------------------------------------------------------------- */
  function growBars(root) {
    root.querySelectorAll('[data-bar]').forEach(function (bar, i) {
      var pct = bar.getAttribute('data-bar') + '%';
      var prop = bar.getAttribute('data-bar-axis') === 'x' ? 'width' : 'height';
      setTimeout(function () { bar.style[prop] = pct; }, reduceMotion ? 0 : 90 * i);
    });
  }

  var barGroups = document.querySelectorAll('[data-bars]');
  if (!('IntersectionObserver' in window)) {
    barGroups.forEach(growBars);
  } else {
    var barIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        growBars(entry.target);
        barIO.unobserve(entry.target);
      });
    }, { threshold: 0.3 });
    barGroups.forEach(function (el) { barIO.observe(el); });
  }

  /* ---------------------------------------------------------------------
     Live-Zähler (Views heute durch das Netzwerk)
     --------------------------------------------------------------------- */
  /* Regel (vom Auftraggeber so bestätigt): Jeder Kalendertag hat seinen
     eigenen Startwert zwischen 1,5 und 12 Mio. Er wird aus dem Datum
     „JJJJ-MM-TT“ nach deutscher Zeit (Europe/Berlin) berechnet — alle
     Besucher sehen am selben Tag also ungefähr dieselbe Zahl, am nächsten
     Tag eine andere. Über den Tag wächst sie im Verhältnis zur Uhrzeit um
     einen ebenfalls vom Datum abhängigen Betrag. Die Zahl liegt nie unter
     1,5 Mio. und nie über 15 Mio. — auch nicht durch das Hochticken alle
     1,6 Sekunden. */
  var LIVE_MIN = 1500000;
  var LIVE_START_MAX = 12000000;
  var LIVE_MAX = 15000000;

  /* Datum und Sekunden seit Mitternacht in Berlin; ohne Zeitzonen-Support
     im Browser die Ortszeit des Geräts. */
  function berlinToday() {
    var d = new Date();
    try {
      var p = {};
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      return {
        date: p.year + '-' + p.month + '-' + p.day,
        seconds: (parseInt(p.hour, 10) % 24) * 3600 + parseInt(p.minute, 10) * 60 + parseInt(p.second, 10)
      };
    } catch (e) {
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return {
        date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
        seconds: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
      };
    }
  }

  /* Zufall mit festem Startwert: dasselbe Datum ergibt immer dieselben
     Zahlen (FNV-1a als Saat, Mulberry32 als Generator). */
  function seededRandom(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h = (h + 0x6D2B79F5) | 0;
      var t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clampLive(value) {
    return Math.min(LIVE_MAX, Math.max(LIVE_MIN, Math.round(value)));
  }

  var liveEl = document.querySelector('[data-live-counter]');
  if (liveEl) {
    var today = berlinToday();
    var rnd = seededRandom(today.date);
    var dayStart = LIVE_MIN + rnd() * (LIVE_START_MAX - LIVE_MIN);
    // Zuwachs bis Mitternacht: 30–80 % des Abstands zur Obergrenze
    var dayGain = (LIVE_MAX - dayStart) * (0.3 + rnd() * 0.5);
    var current = clampLive(dayStart + dayGain * Math.min(today.seconds / 86400, 1));

    var paint = function () { liveEl.textContent = formatNumber(current, 0); };
    paint();

    if (!reduceMotion) {
      setInterval(function () {
        current = clampLive(current + Math.floor(Math.random() * 260) + 40);
        paint();
      }, 1600);
    }
  }

  /* ---------------------------------------------------------------------
     Karte: Live-Anzeige
     Ein kleiner Block springt von Stadt zu Stadt und meldet, was dort gerade
     passiert. Die Städte samt Lage kommen aus den Punkten der Karte
     (<circle data-c cx cy>), die Karte selbst bleibt stehen. Jede Zahl ist
     dreistellig und liegt weit weg von der vorigen.
     --------------------------------------------------------------------- */
  var liveTag = document.querySelector('[data-maplive]');
  var liveMap = liveTag && liveTag.closest('.dachmap');
  var liveSvg = liveMap && liveMap.querySelector('svg');
  if (liveTag && liveMap && liveSvg && liveSvg.viewBox && liveSvg.viewBox.baseVal) {
    var vb = liveSvg.viewBox.baseVal;
    var cities = Array.prototype.map.call(liveMap.querySelectorAll('.dach-city[data-c]'), function (c) {
      return {
        name: c.getAttribute('data-c'),
        x: (parseFloat(c.getAttribute('cx')) - vb.x) / vb.width,
        y: (parseFloat(c.getAttribute('cy')) - vb.y) / vb.height,
      };
    });
    var ping = liveMap.querySelector('[data-mapping]');
    var cityEl = liveTag.querySelector('[data-maplive-city]');
    var msgEl = liveTag.querySelector('[data-maplive-msg]');

    // Abwechselnd je Stadt eine andere Meldung.
    var KINDS = [
      function (n) { return n + ' Clipper im Netzwerk'; },
      function (n) { return n + ' Clipper schneiden gerade Videos'; },
      function (n) { return n + ' Clipper haben gerade gepostet'; },
      function (n) { return n + ' Creator haben sich gerade eingetragen'; },
    ];
    var kind = Math.floor(Math.random() * KINDS.length);
    var lastNumber = 0;
    var recent = [];
    var shown = null;

    // 100–999, mindestens 300 vom vorigen Wert entfernt.
    var nextNumber = function () {
      var n;
      do { n = 100 + Math.floor(Math.random() * 900); } while (lastNumber && Math.abs(n - lastNumber) < 300);
      lastNumber = n;
      return n;
    };

    // Kennzahlen und Flaggen bleiben frei — der Block legt sich nicht darüber.
    var obstacles = function () {
      var box = liveMap.getBoundingClientRect();
      return Array.prototype.map.call(liveMap.querySelectorAll('.maptag, .mappin'), function (el) {
        var r = el.getBoundingClientRect();
        return { l: r.left - box.left - 4, t: r.top - box.top - 4, r: r.right - box.left + 4, b: r.bottom - box.top + 4 };
      });
    };
    var hits = function (a, list) {
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t) return true;
      }
      return false;
    };

    // Lage für eine Stadt: bevorzugt darüber, sonst darunter; null, wenn
    // beides mit Kennzahlen oder Flaggen kollidiert.
    var layout = function (city, list) {
      var W = liveMap.clientWidth;
      var H = liveMap.clientHeight;
      var tw = liveTag.offsetWidth;
      var th = liveTag.offsetHeight;
      var cx = city.x * W;
      var cy = city.y * H;
      var left = Math.max(0, Math.min(W - tw, cx - tw / 2));
      var tip = Math.max(16, Math.min(tw - 16, cx - left));
      var options = [
        { top: cy - 14 - th, below: false },
        { top: cy + 14, below: true },
      ];
      for (var i = 0; i < options.length; i++) {
        var o = options[i];
        if (o.top < 0 || o.top + th > H) continue;
        if (list && hits({ l: left, t: o.top, r: left + tw, b: o.top + th }, list)) continue;
        return { left: left, top: o.top, below: o.below, tip: tip, x: cx, y: cy };
      }
      return null;
    };

    var apply = function (pos) {
      liveTag.classList.add('is-js');
      liveTag.classList.toggle('is-below', pos.below);
      liveTag.style.left = Math.round(pos.left) + 'px';
      liveTag.style.top = Math.round(pos.top) + 'px';
      liveTag.style.setProperty('--tip', Math.round(pos.tip) + 'px');
      if (ping) {
        ping.style.left = pos.x + 'px';
        ping.style.top = pos.y + 'px';
        ping.classList.add('is-on');
      }
    };

    // Nächste Stadt — zufällig gemischt; die letzten sechs kommen nicht
    // gleich wieder dran.
    var step = function () {
      var list = obstacles();
      var text = KINDS[kind](nextNumber());
      kind = (kind + 1) % KINDS.length;
      msgEl.textContent = text;
      var order = cities.map(function (_, i) { return i; });
      for (var k = order.length - 1; k > 0; k--) {
        var j = Math.floor(Math.random() * (k + 1));
        var swap = order[k]; order[k] = order[j]; order[j] = swap;
      }
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 0; i < order.length; i++) {
          var idx = order[i];
          if (pass === 0 && recent.indexOf(idx) !== -1) continue;
          cityEl.textContent = cities[idx].name;
          var pos = layout(cities[idx], list);
          if (pos) {
            recent.push(idx);
            if (recent.length > 6) recent.shift();
            shown = cities[idx];
            apply(pos);
            return true;
          }
        }
      }
      return false;
    };

    var timer = null;
    var visible = false;
    var tick = function () {
      liveTag.classList.add('is-hidden');
      if (ping) ping.classList.remove('is-on');
      setTimeout(function () {
        step();
        // Erst im nächsten Bild einblenden, damit der Sprung nicht animiert wird.
        requestAnimationFrame(function () { liveTag.classList.remove('is-hidden'); });
      }, 240);
    };
    var run = function () {
      if (timer || !visible || document.hidden) return;
      timer = setInterval(tick, 2800);
    };
    var halt = function () {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (cities.length && msgEl && cityEl && step()) {
      if (!reduceMotion && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
          if (visible) run(); else halt();
        }, { threshold: 0.2 }).observe(liveMap);
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) halt(); else run();
        });
      }
      // Neu ausrichten, wenn sich die Kartengröße ändert (Drehen, Fenster).
      window.addEventListener('resize', function () {
        if (!shown) return;
        var pos = layout(shown, obstacles()) || layout(shown, null);
        if (pos) apply(pos);
      });
    }
  }

  /* ---------------------------------------------------------------------
     Cover-Ausfallsicherung
     Fehlt ein Vorschaubild einmal (Datei gelöscht, Beitrag entfernt), soll
     die Kachel nicht wie ein Ladefehler wirken. Statt eines leeren Rahmens
     bekommt sie dann eine eingefärbte Fläche mit dem Account-Kürzel.
     --------------------------------------------------------------------- */
  function coverFallback(img) {
    if (!img || !img.closest) return;

    // Profilbilder liegen über den Initialen — fällt eines aus, reicht es,
    // das Bild zu entfernen: darunter stehen die Initialen bereits bereit.
    if (img.closest('.igw__av, .chip__ini, .clipwall__tag, .igembed__ph')) {
      img.remove();
      return;
    }

    var host = img.closest('.igw__poster, .clipwall__card');
    if (!host || host.classList.contains('is-coverless')) return;

    var handle = (img.getAttribute('alt') || '').split('@')[1] || '';

    host.classList.add('is-coverless');
    host.classList.remove('igw__poster--photo');
    img.remove();

    // Clip-Wall-Kacheln tragen unten bereits Profilbild und Marke — dort
    // genügt die eingefärbte Fläche. Im Widget-Raster fehlt sonst jeder
    // Hinweis, welcher Account gemeint ist.
    if (!host.classList.contains('igw__poster') || !handle) return;

    var mark = document.createElement('span');
    mark.className = 'igw__fallback';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '@' + handle;
    host.appendChild(mark);
  }

  // error-Events steigen nicht auf, in der Capture-Phase sind sie aber zu
  // greifen — so sind auch später eingefügte Bilder (Marquee-Klone) abgedeckt.
  document.addEventListener('error', function (ev) {
    var el = ev.target;
    if (el && el.tagName === 'IMG') coverFallback(el);
  }, true);

  // Bilder, die schon vor dem Skriptstart fehlgeschlagen sind, nachziehen
  Array.prototype.slice.call(document.querySelectorAll(
    '.igw__poster img, .clipwall__card img, .igw__av img, .chip__ini img, .igembed__ph img'))
    .forEach(function (img) {
      if (img.complete && img.naturalWidth === 0) coverFallback(img);
    });

  /* ---------------------------------------------------------------------
     Instagram-Embeds: erst laden, wenn sie in Sichtweite kommen
     (spart Ladezeit und schont die Performance-Werte)
     --------------------------------------------------------------------- */
  function mountEmbed(box) {
    if (box.getAttribute('data-mounted') === '1') return;
    box.setAttribute('data-mounted', '1');

    var src = box.getAttribute('data-embed');
    if (!src) return;

    var frame = document.createElement('iframe');
    frame.src = src;
    frame.loading = 'lazy';
    frame.title = box.getAttribute('data-embed-title') || 'Instagram-Beitrag';
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('allowtransparency', 'true');
    frame.setAttribute('frameborder', '0');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.style.opacity = '0';
    frame.style.transition = 'opacity .35s ease';

    var placeholder = box.querySelector('.igembed__ph');
    var loaded = false;

    frame.addEventListener('load', function () {
      loaded = true;
      frame.style.opacity = '1';
      if (placeholder) placeholder.style.display = 'none';
    });

    // Antwortet Instagram nicht, zeigen wir statt eines ewigen Spinners
    // eine saubere Karte mit Direktlink auf den Beitrag.
    setTimeout(function () {
      if (loaded || !placeholder) return;
      frame.remove();

      var handle = box.getAttribute('data-handle') || '';
      var link = box.getAttribute('data-link') || 'https://www.instagram.com/';

      placeholder.classList.add('is-fallback');
      placeholder.innerHTML =
        '<span class="igembed__logo" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">' +
            '<rect x="2.5" y="2.5" width="19" height="19" rx="5.4"/>' +
            '<circle cx="12" cy="12" r="4.2"/>' +
            '<circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none"/>' +
          '</svg>' +
        '</span>' +
        '<b>' + handle + '</b>' +
        '<span>Instagram lädt hier gerade keine Vorschau. Der Beitrag ist direkt auf Instagram verfügbar.</span>' +
        '<a class="btn btn--primary btn--sm" href="' + link + '" target="_blank" rel="noopener">Auf Instagram ansehen</a>';
    }, 8000);

    box.appendChild(frame);
  }

  var embeds = document.querySelectorAll('[data-embed]');
  if (!('IntersectionObserver' in window)) {
    embeds.forEach(mountEmbed);
  } else {
    var embedIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        mountEmbed(entry.target);
        embedIO.unobserve(entry.target);
      });
    }, { rootMargin: '400px 0px' });
    embeds.forEach(function (el) { embedIO.observe(el); });
  }

  /* ---------------------------------------------------------------------
     FAQ – immer nur eine Antwort offen
     --------------------------------------------------------------------- */
  var faqItems = Array.prototype.slice.call(document.querySelectorAll('.faq__i'));
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      faqItems.forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });

  /* ---------------------------------------------------------------------
     Laufbänder vervielfachen, damit die Schleife nahtlos läuft
     Die Animation schiebt den Streifen um -50 %, also um genau eine
     Schleifenlänge. Ist diese Länge schmaler als der Bildschirm, klafft beim
     Umbruch eine Lücke — deshalb wird der Inhalt so oft wiederholt, bis eine
     Schleifenlänge den sichtbaren Bereich füllt. Die Laufzeit richtet sich
     danach, damit das Tempo gleich bleibt, egal wie viele Kacheln drinstehen.
     --------------------------------------------------------------------- */
  function buildMarquee(track) {
    // Ausgangszustand einmal merken, sonst würde ein zweiter Aufbau die
    // bereits vervielfachte Fassung erneut vervielfachen.
    if (track.marqueeSource === undefined) {
      track.marqueeSource = track.innerHTML;
      track.marqueeCount = track.children.length;
    } else {
      track.innerHTML = track.marqueeSource;
    }

    var originalCount = track.marqueeCount;
    var unitWidth = track.scrollWidth;
    var visible = (track.parentElement || track).clientWidth;
    if (!originalCount || !unitWidth) return;

    var reps = Math.max(1, Math.ceil(visible / unitWidth));
    track.innerHTML = track.marqueeSource.repeat(reps * 2);

    // Alles nach dem ersten Durchgang ist Dekoration und wird weder
    // vorgelesen noch per Tab angesprungen.
    Array.prototype.slice.call(track.children, originalCount).forEach(function (clone) {
      clone.setAttribute('aria-hidden', 'true');
      Array.prototype.slice.call(clone.querySelectorAll('a')).concat(
        clone.tagName === 'A' ? [clone] : []
      ).forEach(function (link) { link.setAttribute('tabindex', '-1'); });
    });

    var speed = parseFloat(track.getAttribute('data-speed')) || 48;  // px pro Sekunde
    track.style.animationDuration = (unitWidth * reps / speed).toFixed(1) + 's';
  }

  var marquees = Array.prototype.slice.call(
    document.querySelectorAll('.marquee__track, .clipwall__track'));
  marquees.forEach(buildMarquee);

  // Beim Drehen des Geräts kann der sichtbare Bereich deutlich breiter
  // werden — dann neu aufbauen, sonst reicht die Schleifenlänge nicht mehr.
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      marquees.forEach(function (track) {
        var visible = (track.parentElement || track).clientWidth;
        // scrollWidth enthält jetzt reps*2 Durchgänge — eine Schleife ist die Hälfte.
        if (track.scrollWidth / 2 >= visible) return;
        buildMarquee(track);
      });
    }, 250);
  });

  /* ---------------------------------------------------------------------
     Schwebender Anfrage-Button erscheint nach dem Hero
     --------------------------------------------------------------------- */
  var ctaFloat = document.querySelector('.cta-float');
  if (ctaFloat) {
    var toggleFloat = function () {
      ctaFloat.classList.toggle('is-in', window.scrollY > 620);
    };
    toggleFloat();
    window.addEventListener('scroll', toggleFloat, { passive: true });
  }

  /* ---------------------------------------------------------------------
     Founder-Foto: sauberer Platzhalter, falls die Datei (noch) fehlt
     --------------------------------------------------------------------- */
  document.querySelectorAll('[data-photo]').forEach(function (img) {
    var showFallback = function () {
      img.style.display = 'none';
      var fb = img.parentElement.querySelector('.founder__fallback');
      if (fb) fb.hidden = false;
    };
    if (img.complete && img.naturalWidth === 0) showFallback();
    img.addEventListener('error', showFallback);
  });

  /* ---------------------------------------------------------------------
     Aktuelles Jahr im Footer
     --------------------------------------------------------------------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
