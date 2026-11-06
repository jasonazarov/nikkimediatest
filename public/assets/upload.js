/* ==========================================================================
   NIKKI MEDIA — Direkt-Upload nach R2
   Der Worker sieht die Datei nie. Er liefert nur signierte URLs; der Browser
   lädt direkt zum Speicher. Große Dateien werden in Parts zerlegt, damit ein
   Abbruch nicht den ganzen Upload kostet.
   ========================================================================== */
window.NMUpload = (function () {
  'use strict';

  var ALLOWED = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'jpg', 'jpeg', 'png'];

  /* Diese Datei liegt im Kundenbereich (deutsch) und im Clipper-Bereich
     (englisch). Statt zwei Kopien zu pflegen, richtet sie sich nach dem
     lang-Attribut, das die Seitenhülle je nach Rolle setzt. */
  var EN = (document.documentElement.getAttribute('lang') || 'de').toLowerCase().indexOf('en') === 0;

  var TEXT = EN
    ? {
        type:    'File type not allowed: ',
        server:  'Server error (',
        failed:  'Upload failed (',
        network: 'Network error during upload',
        aborted: 'Upload cancelled'
      }
    : {
        type:    'Dateityp nicht erlaubt: ',
        server:  'Serverfehler (',
        failed:  'Upload fehlgeschlagen (',
        network: 'Netzwerkfehler beim Upload',
        aborted: 'Upload abgebrochen'
      };

  function ext(name) { return (name.split('.').pop() || '').toLowerCase(); }
  function isAllowed(name) { return ALLOWED.indexOf(ext(name)) !== -1; }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    var v = bytes / Math.pow(1024, i);
    var text = v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : 1);
    return (EN ? text : text.replace('.', ',')) + ' ' + units[i];
  }

  function postJSON(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || TEXT.server + res.status + ')');
        return data;
      });
    });
  }

  /** PUT mit Fortschritt — fetch kann Upload-Fortschritt nicht melden, XHR schon. */
  function putWithProgress(url, blob, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ etag: xhr.getResponseHeader('ETag') || '' });
        } else {
          reject(new Error(TEXT.failed + xhr.status + ')'));
        }
      };
      xhr.onerror = function () { reject(new Error(TEXT.network)); };
      xhr.onabort  = function () { reject(new Error(TEXT.aborted)); };
      xhr.send(blob);
    });
  }

  /**
   * Vorschaubild aus der gerade hochgeladenen Datei.
   *
   * Es entsteht aus der lokalen Datei — die liegt ohnehin schon hier, das
   * Bild kostet also KEINE Übertragung. Ohne dieses Bild müsste später jede
   * Kachel im Adminbereich die Originaldatei anfassen, um überhaupt etwas zu
   * zeigen; bei Rohmaterial sind das mehrere hundert Megabyte je Kachel.
   *
   * Auch der Fehlschlag wird gemeldet (`ok: false`). Er hält fest, dass es
   * versucht wurde — sonst probierte es der Adminbereich bei jedem Aufruf
   * erneut, bei einer Datei, die der Browser gar nicht decodieren kann,
   * jedes Mal umsonst.
   *
   * Und: Ein fehlendes Vorschaubild hält niemals einen Upload auf.
   */
  function attachPoster(file, endpoints, assetId) {
    if (!endpoints.thumb || !window.NMPoster) return Promise.resolve();
    var done = endpoints.thumb + '/done';

    return window.NMPoster.fromFile(file)
      .then(function (blob) {
        if (!blob) return postJSON(done, { assetId: assetId, ok: false });
        return postJSON(endpoints.thumb, { assetId: assetId })
          .then(function (res) { return putWithProgress(res.url, blob); })
          .then(function () { return postJSON(done, { assetId: assetId }); });
      })
      .catch(function () { /* Ohne Vorschaubild geht es auch. */ });
  }

  /**
   * Lädt eine Datei hoch.
   * endpoints = { init, part, complete, abort, thumb }
   * extra     = zusätzliche Felder für init (folderId bzw. projectId, caption)
   */
  function uploadFile(file, endpoints, extra, onProgress) {
    if (!isAllowed(file.name)) {
      return Promise.reject(new Error(TEXT.type + file.name));
    }

    var payload = Object.assign({ filename: file.name, size: file.size }, extra || {});

    return postJSON(endpoints.init, payload).then(function (init) {
      if (init.mode === 'single') {
        return putWithProgress(init.url, file, function (loaded) {
          if (onProgress) onProgress(loaded, file.size);
        }).then(function () {
          return postJSON(endpoints.complete, { assetId: init.assetId });
        }).then(function (res) {
          return attachPoster(file, endpoints, init.assetId).then(function () { return res; });
        });
      }

      /* Multipart: Parts nacheinander, Fortschritt über alle Parts hinweg.
         Bereits übertragene Parts (init.done) werden übersprungen — so lässt
         sich ein abgebrochener Upload fortsetzen. */
      var partSize = init.partSize;
      var total = Math.max(1, Math.ceil(file.size / partSize));
      var done = {};
      (init.done || []).forEach(function (p) { done[p.partNumber] = p.etag; });

      var parts = [];
      var uploadedBefore = 0;
      var chain = Promise.resolve();

      for (var n = 1; n <= total; n++) {
        (function (partNumber) {
          chain = chain.then(function () {
            if (done[partNumber]) {
              parts.push({ partNumber: partNumber, etag: done[partNumber] });
              uploadedBefore += partSize;
              if (onProgress) onProgress(Math.min(uploadedBefore, file.size), file.size);
              return;
            }
            var start = (partNumber - 1) * partSize;
            var blob = file.slice(start, Math.min(start + partSize, file.size));
            return postJSON(endpoints.part, { assetId: init.assetId, partNumber: partNumber })
              .then(function (res) {
                return putWithProgress(res.url, blob, function (loaded) {
                  if (onProgress) onProgress(Math.min(uploadedBefore + loaded, file.size), file.size);
                });
              })
              .then(function (res) {
                parts.push({ partNumber: partNumber, etag: res.etag });
                uploadedBefore += blob.size;
              });
          });
        })(n);
      }

      return chain
        .then(function () {
          return postJSON(endpoints.complete, { assetId: init.assetId, parts: parts });
        })
        .then(function (res) {
          return attachPoster(file, endpoints, init.assetId).then(function () { return res; });
        })
        .catch(function (err) {
          if (endpoints.abort) postJSON(endpoints.abort, { assetId: init.assetId }).catch(function () {});
          throw err;
        });
    });
  }

  /** Reiht mehrere Dateien auf und meldet den Fortschritt je Datei. */
  function uploadAll(files, endpoints, extra, handlers) {
    var list = Array.prototype.slice.call(files);
    var chain = Promise.resolve();
    var okCount = 0;

    list.forEach(function (file, index) {
      chain = chain.then(function () {
        if (handlers.onStart) handlers.onStart(index, file);
        return uploadFile(file, endpoints, extra, function (loaded, total) {
          if (handlers.onProgress) handlers.onProgress(index, loaded, total);
        })
          .then(function () {
            okCount++;
            if (handlers.onDone) handlers.onDone(index, file);
          })
          .catch(function (err) {
            if (handlers.onError) handlers.onError(index, file, err);
          });
      });
    });

    return chain.then(function () {
      if (handlers.onFinish) handlers.onFinish(okCount, list.length);
      return okCount;
    });
  }

  return {
    uploadFile: uploadFile,
    uploadAll: uploadAll,
    formatBytes: formatBytes,
    isAllowed: isAllowed,
    postJSON: postJSON
  };
})();
