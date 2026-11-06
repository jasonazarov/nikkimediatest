/* ==========================================================================
   Eigenes Kampagnen-Thumbnail hochladen
   Markup: <span data-thumb-upload="/api/…/projects/<id>/thumb" data-busy data-fail>
             <button data-thumb-pick> … <button data-thumb-remove>
   Das Bild wird im Browser auf 1280 × 720 (16:9, mittig zugeschnitten) als
   JPEG verkleinert, direkt nach R2 hochgeladen und dann gesetzt.
   ========================================================================== */
(function () {
  'use strict';

  var W = 1280, H = 720;

  function json(url, method, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        return data;
      });
    });
  }

  function toJpeg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d');
        // Mittig auf 16:9 zuschneiden — wie ein Video-Thumbnail.
        var scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        var w = img.naturalWidth * scale, h = img.naturalHeight * scale;
        ctx.fillStyle = '#101814';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('jpeg')); }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  function upload(box, file) {
    var endpoint = box.getAttribute('data-thumb-upload');
    var pick = box.querySelector('[data-thumb-pick]');
    var label = pick.innerHTML;
    pick.disabled = true;
    pick.textContent = box.getAttribute('data-busy') || '…';
    var key;
    toJpeg(file)
      .then(function (blob) {
        return json(endpoint, 'POST').then(function (start) {
          key = start.key;
          return fetch(start.url, { method: 'PUT', body: blob, headers: { 'content-type': 'image/jpeg' } });
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error('PUT ' + res.status);
        return json(endpoint + '/done', 'POST', { key: key });
      })
      .then(function () { location.reload(); })
      .catch(function (err) {
        pick.disabled = false;
        pick.innerHTML = label;
        alert((box.getAttribute('data-fail') || 'Upload failed.') + (err && err.message && !/^(jpeg|image|PUT)/.test(err.message) ? '\n' + err.message : ''));
      });
  }

  document.addEventListener('click', function (e) {
    var pick = e.target.closest('[data-thumb-pick]');
    var remove = e.target.closest('[data-thumb-remove]');
    var box = (pick || remove) && (pick || remove).closest('[data-thumb-upload]');
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    if (remove) {
      remove.disabled = true;
      json(box.getAttribute('data-thumb-upload'), 'DELETE')
        .then(function () { location.reload(); })
        .catch(function () { remove.disabled = false; });
      return;
    }
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.onchange = function () { if (input.files && input.files[0]) upload(box, input.files[0]); };
    input.click();
  });
})();
