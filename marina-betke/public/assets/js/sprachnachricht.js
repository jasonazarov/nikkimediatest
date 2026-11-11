(function () {
  var boxen = [].slice.call(document.querySelectorAll('[data-sprach]'));
  if (!boxen.length) return;
  function zeit(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  boxen.forEach(function (box) {
    var audio = box.querySelector('[data-sprach-audio]');
    var knopf = box.querySelector('[data-sprach-knopf]');
    var regler = box.querySelector('[data-sprach-regler]');
    var jetzt = box.querySelector('[data-sprach-jetzt]');
    if (!audio || !knopf || !jetzt) return;
    var ziehen = false;
    function fuellung() { if (!regler) return; var max = +regler.max || 1; regler.style.setProperty('--fill', (regler.value / max * 100) + '%'); }
    knopf.addEventListener('click', function () {
      if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } else { audio.pause(); }
    });
    audio.addEventListener('play', function () { boxen.forEach(function (b) { var o = b.querySelector('audio'); if (o && o !== audio && !o.paused) o.pause(); }); box.classList.add('spielt'); knopf.setAttribute('aria-label', 'Sprachnachricht pausieren'); });
    audio.addEventListener('pause', function () { box.classList.remove('spielt'); knopf.setAttribute('aria-label', 'Sprachnachricht abspielen'); });
    audio.addEventListener('loadedmetadata', function () { if (regler && isFinite(audio.duration)) regler.max = Math.round(audio.duration); fuellung(); });
    audio.addEventListener('timeupdate', function () { if (!ziehen && regler) { regler.value = audio.currentTime; fuellung(); } jetzt.textContent = zeit(audio.currentTime); });
    audio.addEventListener('ended', function () { audio.currentTime = 0; if (regler) regler.value = 0; fuellung(); jetzt.textContent = '0:00'; });
    if (regler) regler.addEventListener('input', function () { ziehen = true; fuellung(); jetzt.textContent = zeit(regler.value); });
    if (regler) regler.addEventListener('change', function () { ziehen = false; try { audio.currentTime = +regler.value; } catch (e) {} });
    fuellung();
  });
  // Im Fragebogen: beim Weiterklicken anhalten, damit nichts unsichtbar weiterläuft
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.quali__opt, [data-zurueck], .quali__back')) return;
    boxen.forEach(function (b) { if (!b.closest('.quali')) return; var a = b.querySelector('audio'); if (a && !a.paused) a.pause(); });
  });
  // Link oben auf der Startseite: zur Sprachnachricht springen und gleich abspielen
  [].slice.call(document.querySelectorAll('[data-sprach-start]')).forEach(function (l) {
    l.addEventListener('click', function (e) {
      var ziel = document.querySelector(l.getAttribute('href'));
      var a = ziel && ziel.querySelector('[data-sprach-audio]');
      if (!a) return;
      e.preventDefault();
      var karte = ziel.querySelector('[data-sprach]') || ziel;
      karte.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var p = a.play(); if (p && p.catch) p.catch(function () {});
    });
  });
})();
