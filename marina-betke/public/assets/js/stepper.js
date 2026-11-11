/* ==========================================================================
   Marina Betke: Stepper auf /terminbuchung/

   Aufbau und Verhalten wie das Stepper-Formular von Nikki Media:
     · ein Schritt sichtbar, „Schritt n von 6 · Titel“, Punkte, Balken
     · Einzelauswahl springt von selbst weiter
     · data-require="feld" am Schritt: diese Auswahl braucht eine Antwort
     · data-exit="krise|budget" an einer Antwort: beendet den Stepper mit
       einem eigenen Abschluss, es wird nichts gespeichert
     · Ladebildschirm im selben Moment, in dem abgeschickt wird
   Dazu wie auf marinabetke.de: die Zurück-Taste des Handys geht eine Frage
   zurück, und der Satz zur Situation steht über der Frage nach dem Zeitpunkt.

   Texte, Endpunkt und Fehlermeldungen stehen als JSON im Markup
   (#stepper-config). Gespeichert wird erst beim Absenden, nach Einwilligung.
   Kein localStorage, kein sessionStorage, keine Cookies.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-stepper]');
  if (!root) return;

  var config = {};
  try { config = JSON.parse(document.getElementById('stepper-config').textContent); } catch (e) { config = {}; }
  var errors = config.errors || {};

  var form    = root.querySelector('[data-form]');
  var label   = root.querySelector('[data-step-label]');
  var bar     = root.querySelector('[data-step-bar]');
  var dots    = root.querySelectorAll('.stepper__dots i');
  var errBox  = root.querySelector('[data-error]');
  var errText = root.querySelector('[data-error-text]');
  var errWa   = root.querySelector('[data-error-wa]');
  var btnBack = root.querySelector('[data-back]');
  var btnNext = root.querySelector('[data-next]');
  var btnSend = root.querySelector('[data-submit]');
  var sendTxt = root.querySelector('[data-submit-text]');
  var panels  = [].slice.call(root.querySelectorAll('.stepper__panel'));
  var ends    = [].slice.call(root.querySelectorAll('[data-end]'));
  var TOTAL   = panels.length;
  var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Video-Kennung aus dem Link (?q=gaslighting): nur Kleinbuchstaben, Ziffern, Bindestrich. */
  var QUELLE = (function () {
    var m = /[?&]q=([^&#]*)/.exec(location.search);
    var v = m ? decodeURIComponent(m[1]).toLowerCase() : '';
    return /^[a-z0-9][a-z0-9-]{0,39}$/.test(v) ? v : '';
  })();

  var state = { step: 1, end: null, sending: false, done: false };

  /* ------------------------------------------------------------ Hilfen */

  var byName = function (name) { return [].slice.call(form.querySelectorAll('[name="' + name + '"]')); };
  function picked(name) {
    var hit = byName(name).filter(function (el) { return el.checked; })[0];
    return hit ? hit.value : '';
  }
  function emailOk(v) { return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v); }

  /** Wie auf dem Server: „+…“/„00…“ gilt wie eingegeben, sonst Vorwahl davor, führende 0 weg. */
  function telefon() {
    var roh = form.telefon.value.trim();
    if (!roh) return '';
    if (/^(\+|00)/.test(roh)) return '+' + roh.replace(/^(\+|00)/, '').replace(/[^\d ]/g, '').trim();
    return '+' + form.vorwahl.value + ' ' + roh.replace(/[^\d ]/g, '').trim().replace(/^0+/, '');
  }
  function telefonOk() { var z = telefon().replace(/\D/g, '').length; return z >= 9 && z <= 15; }

  /** Nur Ziffern, Leerzeichen und ein führendes Plus; die Schreibmarke bleibt an ihrer Stelle. */
  function sanitizePhone(el) {
    var before = el.value;
    var plus = before.charAt(0) === '+';
    var clean = (plus ? '+' : '') + before.replace(/[^\d ]/g, '').replace(/ {2,}/g, ' ');
    if (clean === before) return;
    var caret = el.selectionStart;
    el.value = clean;
    if (caret !== null) {
      var pos = Math.max(0, caret - (before.length - clean.length));
      try { el.setSelectionRange(pos, pos); } catch (e) {}
    }
  }

  /** Was in einem Schritt fehlt, als Schlüssel der Fehlermeldung, oder null. */
  function problem(panel) {
    var groups = (panel.getAttribute('data-require') || '').split(/\s+/).filter(Boolean);
    for (var g = 0; g < groups.length; g++) if (!picked(groups[g])) return 'pick';
    if (!panel.querySelector('[name="vorname"]')) return null;
    if (!form.vorname.value.trim()) return 'vorname';
    if (!telefonOk()) return 'telefon';
    var mail = form.email.value.trim();
    if (mail && !emailOk(mail)) return 'email';
    if (!form.einwilligung.checked) return 'einwilligung';
    return null;
  }

  /** Nur Einzelauswahl im Schritt: darf von selbst weiterspringen. */
  function choiceOnly(panel) {
    var inputs = panel.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inputs.length; i++) if (inputs[i].type !== 'radio' && inputs[i].type !== 'range') return false;
    return inputs.length > 0;
  }

  function showError(key, extra) {
    var msg = key ? (errors[key] || errors.generic || '') : '';
    errText.textContent = msg + (extra ? ' ' + extra : '');
    errBox.hidden = !msg;
    errWa.hidden = !(key === 'generic' || key === 'tooMany');
    if (!errWa.hidden) errWa.href = waLink(form.vorname.value.trim(), '');
    var field = { vorname: form.vorname, telefon: form.telefon, email: form.email, einwilligung: form.einwilligung };
    for (var k in field) if (field[k]) field[k].setAttribute('aria-invalid', String(k === key));
  }

  function waLink(vorname, nr) {
    var t = 'Hi Marina, ich bin ' + (vorname || '…') + ' und habe gerade die Fragen auf deiner Website beantwortet' +
      (nr ? ' (Nr. ' + nr + ')' : '') + '. Wann hättest du Zeit für das kostenlose Kennenlerngespräch?';
    return 'https://wa.me/' + (config.wa || '') + '?text=' + encodeURIComponent(t);
  }

  /* --------------------------------------------------------------- Anzeige */

  function render() {
    var inForm = !state.end;
    form.hidden = !inForm;
    ends.forEach(function (el) { el.hidden = el.getAttribute('data-end') !== state.end; });

    panels.forEach(function (panel, i) {
      var on = inForm && i + 1 === state.step;
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
      if (!on) [].forEach.call(panel.querySelectorAll('audio'), function (a) { if (!a.paused) a.pause(); });
    });

    var titles = config.titles || [];
    label.textContent = (config.stepLabel || 'Schritt {n} von {total} · {title}')
      .replace('{n}', String(state.step)).replace('{total}', String(TOTAL)).replace('{title}', titles[state.step - 1] || '');
    bar.style.width = Math.round((state.step / TOTAL) * 100) + '%';
    bar.parentNode.setAttribute('aria-valuenow', String(state.step));
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-on', i < state.step);

    /* Ein Satz zur gewählten Situation über der Frage nach dem Zeitpunkt. */
    var intel = root.querySelector('[data-intel]');
    if (intel) {
      intel.textContent = (config.intel || {})[picked('situation')] || '';
      intel.hidden = !intel.textContent;
    }
    /* Abschluss „Budget“: Text je nach Situation. */
    var fuer = picked('situation') === 'anderes' ? 'anderes' : 'beziehung';
    [].forEach.call(root.querySelectorAll('[data-fuer]'), function (b) { b.hidden = b.getAttribute('data-fuer') !== fuer; });

    btnBack.hidden = state.step === 1;
    var last = state.step === TOTAL;
    btnNext.hidden = last;
    btnSend.hidden = !last;
    btnNext.disabled = !!problem(panels[state.step - 1]);
    btnSend.disabled = state.sending;
    sendTxt.textContent = state.sending ? (config.sendingText || '…') : (config.submitText || 'Absenden');
  }

  function focusTop() {
    var target = state.end ? root.querySelector('[data-end="' + state.end + '"] .stepper__q') : panels[state.step - 1].querySelector('.stepper__q');
    var r = root.getBoundingClientRect();
    if (r.top < 70 || r.top > window.innerHeight * 0.5) {
      window.scrollTo({ top: window.pageYOffset + r.top - 120, behavior: rm ? 'auto' : 'smooth' });
    }
    if (target) target.focus({ preventScroll: true });
    var panel = state.end ? null : panels[state.step - 1];
    if (panel) {
      panel.classList.remove('is-in');
      if (!rm) { void panel.offsetWidth; panel.classList.add('is-in'); }
    }
  }

  /* Jeder Schritt ist ein Eintrag im Verlauf: Die Zurück-Taste geht eine Frage zurück. */
  function go(step, end) {
    state.step = Math.min(Math.max(step, 1), TOTAL);
    state.end = end || null;
    showError('');
    try { history.pushState({ stepper: 1, step: state.step, end: state.end }, ''); } catch (e) {}
    render();
    focusTop();
  }

  try { history.replaceState({ stepper: 1, step: 1, end: null }, ''); } catch (e) {}
  window.addEventListener('popstate', function (e) {
    if (state.done) { state.end = 'ok'; render(); return; }   // nach dem Absenden nicht zurück in die Fragen
    if (!e.state || !e.state.stepper) return;
    state.step = e.state.step;
    state.end = e.state.end;
    showError('');
    render();
    focusTop();
  });

  /* ---------------------------------------------------------- Eingaben */

  form.addEventListener('input', function (e) {
    if (e.target.name === 'telefon') sanitizePhone(e.target);
    if (!errBox.hidden) showError('');
    render();
  });

  form.addEventListener('change', function (e) {
    var el = e.target;
    render();
    if (el.type !== 'radio' || state.sending) return;
    var exit = el.getAttribute('data-exit');
    var panel = panels[state.step - 1];
    root.classList.add('is-busy');
    setTimeout(function () {
      root.classList.remove('is-busy');
      if (exit) { go(state.step, exit); return; }
      if (state.step < TOTAL && choiceOnly(panel) && !problem(panel)) go(state.step + 1);
    }, rm ? 0 : 200);
  });

  /* Enter im Kontakt-Schritt: nächstes Feld statt sofort absenden. */
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return;
    var order = ['vorname', 'telefon', 'email'];
    var i = order.indexOf(e.target.name);
    if (i >= 0 && i < order.length - 1) { e.preventDefault(); form[order[i + 1]].focus(); }
  });

  btnNext.addEventListener('click', function () {
    var key = problem(panels[state.step - 1]);
    if (key) { showError(key); return; }
    go(state.step + 1);
  });

  btnBack.addEventListener('click', function () { history.back(); });
  [].forEach.call(root.querySelectorAll('[data-end-back]'), function (b) {
    b.addEventListener('click', function () { history.back(); });
  });

  /* -------------------------------------------------------- Ladebildschirm

     Wie bei Nikki Media: erscheint sofort beim Absenden, läuft weich auf 92 %
     zu, solange die Antwort aussteht, und erst mit dem Ergebnis auf 100 %.
     Mindestens 1,5 Sekunden, damit er nicht nur aufblitzt.
     ------------------------------------------------------------------------ */

  var loadEl = document.querySelector('[data-loadscreen]');
  var ARC = 2 * Math.PI * 52;
  var LOAD = { shown: 0, raf: 0, openedAt: 0, finalFrom: -1, finalAt: 0, done: null };

  function paintLoad(v) {
    if (!loadEl) return;
    var whole = Math.round(v);
    loadEl.querySelector('[data-loadscreen-pct]').textContent = whole + '%';
    loadEl.querySelector('[data-loadscreen-bar]').style.width = v + '%';
    loadEl.querySelector('[data-loadscreen-arc]').style.strokeDashoffset = String(ARC * (1 - v / 100));
    var texts = config.loadTexts || [];
    var t = '';
    for (var i = 0; i < texts.length; i++) if (whole >= texts[i][0]) t = texts[i][1];
    loadEl.querySelector('[data-loadscreen-step]').textContent = t;
  }

  function tick(now) {
    if (LOAD.finalFrom >= 0) {
      var p = Math.min(1, (now - LOAD.finalAt) / 450);
      LOAD.shown = LOAD.finalFrom + (100 - LOAD.finalFrom) * (1 - Math.pow(1 - p, 3));
      paintLoad(LOAD.shown);
      if (p >= 1) { var cb = LOAD.done; LOAD.done = null; setTimeout(function () { if (cb) cb(); }, 260); return; }
    } else {
      LOAD.shown = 92 * (1 - Math.exp(-(now - LOAD.openedAt) / 1600));
      paintLoad(LOAD.shown);
    }
    LOAD.raf = requestAnimationFrame(tick);
  }

  function openLoad() {
    if (!loadEl) return;
    var arc = loadEl.querySelector('[data-loadscreen-arc]');
    arc.style.strokeDasharray = String(ARC);
    LOAD.shown = 0; LOAD.finalFrom = -1; LOAD.openedAt = performance.now();
    paintLoad(0);
    loadEl.hidden = false;
    document.documentElement.classList.add('is-loading');
    cancelAnimationFrame(LOAD.raf);
    LOAD.raf = requestAnimationFrame(tick);
  }

  function closeLoad() {
    if (!loadEl) return;
    cancelAnimationFrame(LOAD.raf);
    loadEl.hidden = true;
    document.documentElement.classList.remove('is-loading');
  }

  /** Ergebnis da: nach der Mindestzeit auf 100 % ziehen, dann weiter. */
  function finishLoad(cb) {
    if (!loadEl) { cb(); return; }
    var wait = Math.max(0, 1500 - (performance.now() - LOAD.openedAt));
    setTimeout(function () {
      LOAD.done = function () { closeLoad(); cb(); };
      LOAD.finalFrom = LOAD.shown;
      LOAD.finalAt = performance.now();
    }, wait);
  }

  /* ------------------------------------------------------------ Absenden */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.sending || state.done) return;
    if (state.step !== TOTAL) { btnNext.click(); return; }
    var key = problem(panels[TOTAL - 1]);
    if (key) {
      showError(key);
      var f = { vorname: form.vorname, telefon: form.telefon, email: form.email, einwilligung: form.einwilligung }[key];
      if (f) f.focus();
      return;
    }

    state.sending = true;
    showError('');
    render();
    openLoad();

    var vorname = form.vorname.value.replace(/\s+/g, ' ').trim();
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);

    fetch(config.endpoint || '/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        krise: picked('krise'), situation: picked('situation'), start: picked('start'), budget: picked('budget'),
        erreichbar: picked('erreichbar'), vorname: vorname, vorwahl: form.vorwahl.value, telefon: form.telefon.value,
        email: form.email.value.trim(), woher: form.woher.value, quelle: QUELLE,
        einwilligung: form.einwilligung.checked, website: form.website.value
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; });
      })
      .catch(function () { return { ok: false, status: 0 }; })
      .then(function (d) {
        clearTimeout(timer);
        if (d && d.ok === true && /^\d{6}$/.test(String(d.nr))) {
          finishLoad(function () { success(d, vorname); });
          return;
        }
        closeLoad();
        state.sending = false;
        render();
        if (d && d.field && errors[d.field]) showError(d.field);
        else showError(d && d.status === 429 ? 'tooMany' : 'generic');
        errBox.setAttribute('tabindex', '-1');
        errBox.focus();
      });
  });

  function success(d, vorname) {
    state.sending = false;
    state.done = true;
    var set = function (sel, txt) { [].forEach.call(root.querySelectorAll(sel), function (el) { el.textContent = txt; }); };
    set('[data-name]', vorname);
    set('[data-tel]', d.telefon || '');
    set('[data-nr]', d.nr);
    set('[data-erreichbar]', (config.erreichbarText || {})[picked('erreichbar')] || '');
    root.querySelector('[data-wa]').href = waLink(vorname, d.nr);
    root.querySelector('[data-mail]').href = 'mailto:' + (config.mail || '') + '?subject=' + encodeURIComponent('Anfrage Nr. ' + d.nr);
    root.querySelector('[data-guide]').hidden = picked('start') !== 'informieren';
    go(TOTAL, 'ok');
  }

  render();
})();
