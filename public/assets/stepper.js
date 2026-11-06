/* ==========================================================================
   NIKKI MEDIA — Stepper-Formular (Hero)

   Ein Skript für alle Stepper der Seite: Kunden (/), Clipper (/clipper),
   Creator (/creator) und Agenturen (/brands). Was sich unterscheidet — Endpunkt, Texte, Sprache —
   steht als JSON im Markup (`<script type="application/json"
   id="stepper-config">`). Welche Felder es gibt und welche Pflicht sind,
   sagt allein das HTML:

     data-require="platforms"   am Schritt: diese Auswahlgruppe braucht
                                mindestens einen Haken bzw. eine Wahl
     required                   am Feld: muss ausgefüllt (bzw. angehakt) sein
     minlength                  am Feld: Mindestlänge des Textes
     type="url"                 nur https-Adressen; ohne `required` optional,
                                aber wenn ausgefüllt, dann gültig
     data-show-if="feld:a,b"    am Container: nur sichtbar (und nur geprüft
                                und mitgeschickt), wenn die Gruppe `feld`
                                einen der Werte `a` oder `b` enthält

   Ein Schritt ist sichtbar. Der Zustand lebt im Formular selbst — bewusst
   kein localStorage, kein sessionStorage.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('stepper');
  if (!root) return;

  var form    = root.querySelector('form');
  var label   = root.querySelector('[data-step-label]');
  var bar     = root.querySelector('[data-step-bar]');
  var dots    = root.querySelectorAll('.stepper__dots i');
  var errBox  = root.querySelector('[data-error]');
  var btnBack = root.querySelector('[data-back]');
  var btnNext = root.querySelector('[data-next]');
  var btnSend = root.querySelector('[data-submit]');
  var panels  = Array.prototype.slice.call(root.querySelectorAll('.stepper__panel'));
  var TOTAL   = panels.length;

  var configEl = document.getElementById('stepper-config');
  var config = {};
  try { config = JSON.parse(configEl ? configEl.textContent : '{}'); } catch (err) { config = {}; }

  var text = function (key, fallback) { return config[key] || fallback; };
  var errors = config.errors || {};

  var state = { step: 1, sending: false };

  /* ------------------------------------------------------------ Hilfen */

  function emailLooksValid(value) {
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim());
  }

  /** Nur https — ein Cloud-Ordner hinter http wäre im Browser ohnehin gesperrt. */
  function urlLooksValid(value) {
    try {
      var url = new URL(value.trim());
      return url.protocol === 'https:' && url.hostname.indexOf('.') > 0;
    } catch (err) {
      return false;
    }
  }

  /**
   * Telefonnummer: nur Ziffern und Leerzeichen zur Gliederung. Buchstaben und
   * alles Übrige fallen schon beim Tippen weg — `type="tel"` allein lässt sie
   * durch, das ist beim Browser kein Zahlenfeld.
   *
   * Das Plus fehlt hier bewusst: Die Ländervorwahl steht im Feld daneben. Wer
   * sie trotzdem mit eintippt, bekommt sie nicht weggeputzt, sondern beim
   * Absenden ausgewertet — siehe `composePhone` auf dem Server.
   */
  function cleanPhone(value) {
    var plus = value.charAt(0) === '+';
    var rest = value.replace(/[^\d ]/g, '').replace(/ {2,}/g, ' ');
    return (plus ? '+' : '') + rest;
  }

  /** Filtert das Feld und hält dabei die Schreibmarke an ihrer Stelle. */
  function sanitizePhoneField(el) {
    var before = el.value;
    var cleaned = cleanPhone(before);
    if (cleaned === before) return;

    var caret = el.selectionStart;
    el.value = cleaned;
    if (caret !== null) {
      var pos = Math.max(0, caret - (before.length - cleaned.length));
      try { el.setSelectionRange(pos, pos); } catch (err) { /* Feld ohne Auswahl */ }
    }
  }

  var phoneDigits = function (value) { return value.replace(/\D/g, '').length; };

  var byName = function (name) {
    return Array.prototype.slice.call(form.querySelectorAll('[name="' + name + '"]'));
  };

  /** Mehrere Kästchen mit demselben Namen sind eine Gruppe — eines allein ist ein Ja/Nein. */
  var isGroup = function (el) { return el.type === 'checkbox' && byName(el.name).length > 1; };

  /** Ausgewählte Werte einer Auswahlgruppe (Kästchen oder Knöpfe). */
  function picked(name) {
    return byName(name)
      .filter(function (el) { return el.checked; })
      .map(function (el) { return el.value; });
  }

  /* ------------------------------------------------- Bedingte Sichtbarkeit */

  function applyConditions() {
    var blocks = form.querySelectorAll('[data-show-if]');
    for (var i = 0; i < blocks.length; i++) {
      var rule = blocks[i].getAttribute('data-show-if').split(':');
      var chosen = picked(rule[0]);
      blocks[i].hidden = !(rule[1] || '').split(',').some(function (v) { return chosen.indexOf(v) >= 0; });
    }
  }

  /** Liegt das Feld in einem gerade ausgeblendeten Bedingungsblock? */
  function inactive(el) {
    var block = el.closest('[data-show-if]');
    return !!(block && block.hidden);
  }

  /* ------------------------------------------------------------ Prüfung */

  /**
   * Was in einem Schritt noch fehlt — oder null, wenn er vollständig ist.
   * Die Antwort ist zugleich der Schlüssel der passenden Fehlermeldung.
   */
  function problem(panel) {
    var groups = (panel.getAttribute('data-require') || '').split(/\s+/).filter(Boolean);
    for (var g = 0; g < groups.length; g++) {
      if (!picked(groups[g]).length) return 'pick';
    }

    var fields = panel.querySelectorAll('input, select, textarea');
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      if (!el.name || inactive(el) || el.type === 'radio' || isGroup(el)) continue;
      if (el.closest('.hp')) continue;

      var value = el.type === 'checkbox' ? '' : el.value.trim();

      if (el.type === 'url') {
        if (value ? !urlLooksValid(value) : el.required) return 'link';
        continue;
      }
      if (!el.required) continue;

      if (el.type === 'checkbox') {
        if (!el.checked) return 'contact';
      } else if (el.type === 'email') {
        if (!emailLooksValid(value)) return 'contact';
      } else if (el.type === 'tel') {
        var dial = form.querySelector('[name="' + el.name + 'Dial"]');
        if (phoneDigits(value) < 4 || (dial && !/^\+\d{1,4}$/.test(dial.value))) return 'contact';
      } else if (value.length < Math.max(1, Number(el.getAttribute('minlength')) || 1)) {
        return 'contact';
      }
    }
    return null;
  }

  var complete = function (step) { return !problem(panels[step - 1]); };

  function messageFor(key) {
    if (key === 'pick') return errors.pick || '';
    if (key === 'link') return errors.link || '';
    return errors.contact || '';
  }

  /**
   * Erwartet der Schritt nur eine Einzelauswahl, darf er von selbst
   * weiterspringen. Felder in ausgeblendeten Bedingungsblöcken zählen nicht:
   * „Agentur“ auf /brands springt weiter, „Sonstiges“ blendet sein Textfeld
   * ein und wartet.
   */
  function choiceOnly(panel) {
    var inputs = panel.querySelectorAll('input, select, textarea');
    var count = 0;
    for (var i = 0; i < inputs.length; i++) {
      if (inactive(inputs[i])) continue;
      if (inputs[i].type !== 'radio') return false;
      count++;
    }
    return count > 0;
  }

  /* --------------------------------------------------------------- Anzeige */

  function render() {
    applyConditions();

    panels.forEach(function (panel, index) {
      var active = index + 1 === state.step;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });

    var titles = config.titles || [];
    label.textContent = text('stepLabel', 'Schritt {n} von {total} · {title}')
      .replace('{n}', String(state.step))
      .replace('{total}', String(TOTAL))
      .replace('{title}', titles[state.step - 1] || '');
    bar.style.width = Math.round((state.step / TOTAL) * 100) + '%';
    bar.parentNode.setAttribute('aria-valuenow', String(state.step));

    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('is-on', i < state.step);
    }

    btnBack.hidden = state.step === 1;
    var last = state.step === TOTAL;
    btnNext.hidden = last;
    btnSend.hidden = !last;

    var ready = complete(state.step);
    btnNext.disabled = !ready;
    btnSend.disabled = !ready || state.sending;
    btnSend.textContent = state.sending
      ? text('sendingText', 'Einen Moment …')
      : text('submitText', 'Absenden');
  }

  function showError(message) {
    errBox.textContent = message || '';
    errBox.hidden = !message;
  }

  /* ---------------------------------------------------------- Eingaben */

  form.addEventListener('change', function (event) {
    showError('');
    render();
    // Ein ungültiger Link sperrt den Knopf — ohne Hinweis wüsste niemand,
    // warum. `change` feuert bei Textfeldern erst beim Verlassen, also genau
    // dann, wenn die Eingabe fertig ist.
    var el = event.target;
    if (el.type === 'url' && el.value.trim() && !urlLooksValid(el.value)) showError(messageFor('link'));
  });

  form.addEventListener('input', function (event) {
    if (event.target.type === 'tel') sanitizePhoneField(event.target);
    // Die Meldung schon beim Tippen wegnehmen, nicht erst bei `change`: das
    // feuert beim Verlassen des Feldes — also im Moment des Klicks auf
    // „Absenden“. Die Meldung verschwand dann zwischen Drücken und Loslassen,
    // der Knopf rutschte nach oben, und der Klick ging ins Leere. Genau so
    // nach einem falschen Cooperation-Code auf /brands: korrigieren, klicken,
    // nichts passiert.
    showError('');
    render();
  });

  /* Einzelauswahl springt von selbst weiter — spart einen Klick. */
  form.addEventListener('change', function (event) {
    var panel = panels[state.step - 1];
    if (event.target.type === 'radio' && state.step < TOTAL && choiceOnly(panel)) {
      window.setTimeout(function () { if (complete(state.step)) go(state.step + 1); }, 180);
    }
  });

  /* --------------------------------------------------------- Navigation */

  function go(step) {
    state.step = Math.min(Math.max(step, 1), TOTAL);
    showError('');
    render();

    var panel = panels[state.step - 1];
    var first = panel.querySelector('input[type="text"], input[type="email"], input[type="url"]');
    if (first && !inactive(first)) first.focus({ preventScroll: true });

    var top = root.getBoundingClientRect().top + window.pageYOffset - 96;
    if (window.pageYOffset > top + 40 || window.pageYOffset < top - 400) {
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  btnNext.addEventListener('click', function () {
    var key = problem(panels[state.step - 1]);
    if (key) { showError(messageFor(key)); return; }
    go(state.step + 1);
  });

  btnBack.addEventListener('click', function () { go(state.step - 1); });

  /* -------------------------------------------------------- Ladeschirm

     Erscheint im selben Moment, in dem der CTA gedrückt wird — noch vor dem
     ersten Byte an den Server. Der Fortschritt läuft weich auf 92 % zu,
     solange die Antwort aussteht, und wird erst mit dem Ergebnis auf 100 %
     gezogen. So steht die Zahl nie still, verspricht aber auch nichts, was
     noch nicht passiert ist.
     ------------------------------------------------------------------------ */

  var loadEl = document.querySelector('[data-loadscreen]');
  var pctEl  = loadEl && loadEl.querySelector('[data-loadscreen-pct]');
  var barEl  = loadEl && loadEl.querySelector('[data-loadscreen-bar]');
  var arcEl  = loadEl && loadEl.querySelector('[data-loadscreen-arc]');
  var stepEl = loadEl && loadEl.querySelector('[data-loadscreen-step]');

  /* Umfang des Rings: 2π · r, r = 52 (siehe site.css). */
  var ARC = 2 * Math.PI * 52;

  /* Mindestlaufzeit. Antwortet der Server in 300 ms, wäre der Schirm sonst nur
     ein Aufblitzen — und der Sprung von 0 % auf 100 % sähe nach Fehler aus. */
  var LOAD_MIN_MS = 1500;

  var LOAD_TEXTS = config.loadTexts || [[0, '…']];

  /* Zeitkonstante des Anlaufs: nach ~1,6 s steht die Anzeige bei rund 63 % der
     Obergrenze, danach kriecht sie weiter. Bewusst über die verstrichene Zeit
     gerechnet und nicht je Frame — sonst hinge das Tempo an der Bildrate des
     Geräts, und auf einem lahmen Handy stünde die Zahl fast still. */
  var LOAD_TAU = 1600;

  var load = {
    shown: 0, ceiling: 92, target: '/',
    raf: 0, timer: 0, openedAt: 0,
    /* > 0, sobald die Antwort da ist: Startwert und Zeitpunkt des Schlussspurts */
    finalFrom: -1, finalAt: 0
  };

  /* Wahlweise zählt das große Feld 3 → 2 → 1 herunter statt Prozent zu
     zeigen — das fühlt sich nach einem Start an, nicht nach einer Ladeanzeige. */
  function loadDigit(whole) {
    if (config.loadStyle !== 'countdown') return whole + '%';
    if (whole >= 100) return '✓';
    if (whole >= 67) return '1';
    if (whole >= 34) return '2';
    return '3';
  }

  function paintLoad(value) {
    var whole = Math.round(value);
    if (pctEl) pctEl.textContent = loadDigit(whole);
    if (barEl) barEl.style.width = whole + '%';
    if (arcEl) arcEl.style.strokeDashoffset = String(ARC * (1 - value / 100));

    if (stepEl) {
      var line = LOAD_TEXTS[0][1];
      for (var i = 0; i < LOAD_TEXTS.length; i++) {
        if (whole >= LOAD_TEXTS[i][0]) line = LOAD_TEXTS[i][1];
      }
      if (stepEl.textContent !== line) stepEl.textContent = line;
    }
  }

  function loadTick() {
    var now = Date.now();

    if (load.finalFrom >= 0) {
      // Schlussspurt: vom erreichten Stand in 520 ms auf glatte 100 %.
      var done = Math.min((now - load.finalAt) / 520, 1);
      load.shown = load.finalFrom + (100 - load.finalFrom) * done;
      paintLoad(load.shown);
      if (done >= 1) {
        window.setTimeout(function () { window.location.href = load.target; }, 380);
        return;
      }
    } else {
      // Anlauf: nähert sich der Obergrenze, erreicht sie aber nie.
      load.shown = load.ceiling * (1 - Math.exp(-(now - load.openedAt) / LOAD_TAU));
      paintLoad(load.shown);
    }

    load.raf = window.requestAnimationFrame(loadTick);
  }

  function openLoadScreen() {
    if (!loadEl) return;
    load.shown = 0;
    load.finalFrom = -1;
    load.openedAt = Date.now();
    paintLoad(0);
    loadEl.hidden = false;
    // Hintergrund festhalten, sonst scrollt die Seite unter dem Schirm weiter.
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    load.raf = window.requestAnimationFrame(loadTick);
  }

  function closeLoadScreen() {
    if (!loadEl) return;
    window.cancelAnimationFrame(load.raf);
    window.clearTimeout(load.timer);
    loadEl.hidden = true;
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  function finishLoadScreen(target) {
    load.target = target;
    if (!loadEl) { window.location.href = load.target; return; }

    var wait = Math.max(0, LOAD_MIN_MS - (Date.now() - load.openedAt));
    load.timer = window.setTimeout(function () {
      load.finalFrom = load.shown;
      load.finalAt = Date.now();
    }, wait);
  }

  /* ----------------------------------------------------------- Absenden */

  /**
   * Die Nutzlast entsteht aus den Feldern selbst: Gruppen werden zu Listen,
   * einzelne Kästchen zu Ja/Nein, alles andere zu Text. Ausgeblendete
   * Bedingungsblöcke bleiben draußen — wer TikTok abwählt, schickt auch den
   * TikTok-Handle nicht mehr mit.
   */
  function payload() {
    var data = {};
    var fields = form.querySelectorAll('input, select, textarea');
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      if (!el.name || inactive(el)) continue;

      if (isGroup(el)) {
        if (!data[el.name]) data[el.name] = [];
        if (el.checked) data[el.name].push(el.value);
      } else if (el.type === 'checkbox') {
        data[el.name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value;
        else if (!(el.name in data)) data[el.name] = '';
      } else {
        data[el.name] = el.value.trim();
      }
    }
    return data;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (state.sending) return;

    for (var i = 0; i < panels.length; i++) {
      var key = problem(panels[i]);
      if (key) {
        if (i + 1 !== state.step) go(i + 1);
        showError(messageFor(key));
        return;
      }
    }

    state.sending = true;
    showError('');
    render();
    openLoadScreen();

    fetch(text('endpoint', '/api/leads'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload())
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(
            result.status === 429
              ? errors.tooMany
              : result.status >= 500
                ? errors.generic
                : (result.data && result.data.error) || errors.generic
          );
        }
        // Kein Zwischenschritt mehr: der Ladeschirm läuft auf 100 % und geht
        // von selbst ins Dashboard über.
        finishLoadScreen(result.data.redirect || text('redirect', '/'));
      })
      .catch(function (err) {
        closeLoadScreen();
        state.sending = false;
        render();
        showError((err && err.message) || errors.generic);
      });
  });

  render();
})();
