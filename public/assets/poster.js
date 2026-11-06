/* ==========================================================================
   NIKKI MEDIA — Vorschaubilder

   Ein Vorschaubild entsteht im BROWSER: ein Einzelbild aus dem Video (oder
   das verkleinerte Foto) landet auf einem Canvas und geht als JPEG von
   wenigen Dutzend Kilobyte nach R2.

   Warum überhaupt: Eine Kachel, die auf die Originaldatei zeigt, zwingt den
   Browser, Rohmaterial von mehreren hundert Megabyte anzufassen, nur um ein
   Bildchen zu zeigen. Zwanzig solcher Kacheln nebeneinander sind zwanzig
   parallele Videoströme — die Seite ruckelt, und das Video, das jemand
   wirklich ansehen will, bekommt nichts mehr von der Leitung ab.

   Zwei Wege hinein:

     fromFile(file)          Beim Upload. Die Datei liegt schon auf der
                             Platte des Kunden, das Bild kostet also KEINE
                             Übertragung. Das ist der Regelfall.
     job(url, isVideo)       Nachträglich für Material, das vor dieser
                             Änderung hochgeladen wurde. Hier muss der
                             Browser die Datei anfassen — deshalb einzeln,
                             abbrechbar und mit hartem Zeitlimit.
   ========================================================================== */
window.NMPoster = (function () {
  'use strict';

  /* Längste Kante des Vorschaubilds. Die größte Kachel ist rund 400 px
     breit; 640 px reichen damit auch auf Bildschirmen mit doppelter
     Punktdichte. */
  var MAX_EDGE = 640;
  var QUALITY = 0.72;

  /* Nach so langer Zeit wird abgebrochen. Bei einer Datei, die der Browser
     nicht decodieren kann (ProRes, viele AVI/MKV), passiert bis dahin
     nichts Gutes mehr — und ohne Grenze liefe der Download weiter. */
  var TIMEOUT_MS = 25000;

  /** Ein Einzelbild auf einen verkleinerten Canvas zeichnen und als JPEG ausgeben. */
  function toJpeg(source, width, height) {
    return new Promise(function (resolve) {
      if (!width || !height) return resolve(null);
      var scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      try {
        canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
        /* Bei einer Datei von R2 ohne CORS-Freigabe ist der Canvas „tainted"
           und toBlob wirft. Dann eben kein Vorschaubild. */
        canvas.toBlob(function (blob) { resolve(blob || null); }, 'image/jpeg', QUALITY);
      } catch (err) {
        resolve(null);
      }
    });
  }

  /**
   * Gemeinsamer Kern für Video und Bild.
   * Liefert { promise, cancel } — cancel bricht auch die Übertragung ab.
   */
  function start(src, isVideo, revokeUrl) {
    var element = null;
    var settled = false;
    var resolveOuter;
    var promise = new Promise(function (resolve) { resolveOuter = resolve; });

    var timer = window.setTimeout(function () { finish(null); }, TIMEOUT_MS);

    function finish(blob) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (element) {
        /* src leeren und neu laden: nur so bricht der Browser eine laufende
           Übertragung wirklich ab. */
        element.removeAttribute('src');
        if (isVideo) { try { element.load(); } catch (err) { /* egal */ } }
      }
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      resolveOuter(blob || null);
    }

    if (isVideo) {
      var video = document.createElement('video');
      element = video;
      /* Ohne crossOrigin bleibt der Canvas gesperrt und toBlob wirft. Die
         Freigabe für https://nikkimedia.co steht in r2-cors.json. */
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.addEventListener('error', function () { finish(null); });
      video.addEventListener('loadedmetadata', function () {
        /* Das allererste Bild eines Clips ist oft schwarz — deshalb 0,4 s,
           bei sehr kurzen Clips die Mitte. Nie 0: stünde der Kopf schon dort,
           käme gar kein `seeked`, und wir warteten bis zum Zeitlimit. */
        var duration = video.duration;
        var wanted = duration && isFinite(duration) ? Math.min(0.4, duration / 2) : 0.4;
        try {
          video.currentTime = Math.max(0.05, wanted);
        } catch (err) {
          finish(null);
        }
      });
      video.addEventListener('seeked', function () {
        /* Ein Bild abwarten: `seeked` kommt in manchen Browsern, bevor das
           Einzelbild wirklich steht — gezeichnet käme dann Schwarz heraus. */
        window.requestAnimationFrame(function () {
          toJpeg(video, video.videoWidth, video.videoHeight).then(finish);
        });
      });
      video.src = src;
      video.load();
    } else {
      var img = new Image();
      element = img;
      img.crossOrigin = 'anonymous';
      img.onerror = function () { finish(null); };
      img.onload = function () {
        toJpeg(img, img.naturalWidth, img.naturalHeight).then(finish);
      };
      img.src = src;
    }

    return { promise: promise, cancel: function () { finish(null); } };
  }

  var VIDEO_EXT = ['mp4', 'mov', 'avi', 'mkv', 'webm'];

  function isVideoName(name) {
    return VIDEO_EXT.indexOf((String(name).split('.').pop() || '').toLowerCase()) !== -1;
  }

  /** Aus einer lokalen Datei — kostet keine Übertragung. */
  function fromFile(file) {
    var url;
    try {
      url = URL.createObjectURL(file);
    } catch (err) {
      return Promise.resolve(null);
    }
    return start(url, isVideoName(file.name), url).promise;
  }

  /** Aus einer bereits hochgeladenen Datei. Abbrechbar — siehe oben. */
  function job(url, isVideo) {
    return start(url, !!isVideo, null);
  }

  return { fromFile: fromFile, job: job, isVideoName: isVideoName };
})();
