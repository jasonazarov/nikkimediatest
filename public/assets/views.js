/* ==========================================================================
   NIKKI MEDIA, Views-Grafik in den Übersichten und unter /admin/analytics
   Markup: viewsSection() in src/views/layout.ts · Daten: GET /api/views-analytics
   (src/lib/analytics.ts, je Rolle eingegrenzt wie „Virale Clips“).
   Styles: /assets/dash-glass.css (.nmx…). Kein Speicher im Browser.
   ========================================================================== */
(function () {
  'use strict';
  var box = document.querySelector('[data-views-analytics]');
  if (!box) return;
  var en = box.getAttribute('data-lang') === 'en';
  var area = box.getAttribute('data-area');
  var full = box.getAttribute('data-variant') === 'full';
  var loc = en ? 'en-GB' : 'de-DE';

  var T = en
    ? {
        title: 'Views', ranges: [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All time']],
        gained: { '7': 'in the last 7 days', '30': 'in the last 30 days', '90': 'in the last 90 days', all: 'in total' },
        prev: 'vs. previous period', total: 'Total', campaigns: 'Campaigns by views', platforms: 'Platforms',
        likes: 'Likes', comments: 'Comments', shares: 'Shares', clips: 'Clips', posts: 'Posts',
        note: 'Views of published clips, added up by the day each clip went live. Numbers come from Zernio.',
        empty: 'No published clips with numbers yet. As soon as a clip is live, its views show up here.',
        fail: 'The numbers could not be loaded. Reload the page to try again.', views: 'views', synced: 'Updated'
      }
    : {
        title: 'Views', ranges: [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['all', 'Gesamt']],
        gained: { '7': 'in den letzten 7 Tagen', '30': 'in den letzten 30 Tagen', '90': 'in den letzten 90 Tagen', all: 'insgesamt' },
        prev: 'zum Zeitraum davor', total: 'Gesamt', campaigns: 'Kampagnen nach Views', platforms: 'Plattformen',
        likes: 'Likes', comments: 'Kommentare', shares: 'Shares', clips: 'Clips', posts: 'Posts',
        note: 'Views der veröffentlichten Clips, aufsummiert nach dem Tag, an dem der Clip online ging. Echte Zahlen aus Zernio.',
        empty: 'Noch keine veröffentlichten Clips mit Zahlen. Sobald ein Clip läuft, erscheinen seine Views hier.',
        fail: 'Die Zahlen konnten nicht geladen werden. Lade die Seite neu, um es erneut zu versuchen.', views: 'Views', synced: 'Stand'
      };

  var PLAT = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', linkedin: 'LinkedIn', twitter: 'X', x: 'X', snapchat: 'Snapchat', twitch: 'Twitch' };
  var SHADES = ['#2fe08c', '#9cf6c8', '#17a865', '#5eeaa6', '#0f8a52', '#d6fde9', '#0a6b3f', '#b8fbd9'];

  function fmt(n) { return Math.round(n).toLocaleString(loc); }
  function short(n) {
    if (n >= 1e9) return (n / 1e9).toLocaleString(loc, { maximumFractionDigits: 1 }) + (en ? 'B' : ' Mrd.');
    if (n >= 1e6) return (n / 1e6).toLocaleString(loc, { maximumFractionDigits: 1 }) + (en ? 'M' : ' Mio.');
    if (n >= 1e4) return Math.round(n / 1e3).toLocaleString(loc) + (en ? 'K' : ' Tsd.');
    return fmt(n);
  }
  function dayLabel(iso, withYear) {
    var d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString(loc, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function message(text) {
    var body = box.querySelector('[data-views-body]');
    body.innerHTML = '';
    body.appendChild(el('p', 'nmx__empty', text));
  }

  var data = null;
  var range = full ? 'all' : '30';

  /* ---------- Kopf: Zahl, Veränderung, Zeitraum ---------- */
  function slice() {
    var s = data.series;
    if (range === 'all' || s.length <= Number(range)) return { pts: s, base: 0, prevGain: null };
    var n = Number(range);
    var pts = s.slice(s.length - n);
    var base = s[s.length - n - 1] ? s[s.length - n - 1].views : 0;
    var prevStart = s[s.length - 2 * n - 1];
    var prevGain = s.length > 2 * n ? base - (prevStart ? prevStart.views : 0) : null;
    return { pts: pts, base: base, prevGain: prevGain };
  }

  function renderHead(head, cur) {
    head.innerHTML = '';
    var left = el('div', 'nmx__lead');
    left.appendChild(el('h2', 'nmx__title', T.title));
    var last = cur.pts.length ? cur.pts[cur.pts.length - 1].views : 0;
    var gain = range === 'all' ? data.total : last - cur.base;
    var big = el('p', 'nmx__big');
    big.appendChild(document.createTextNode(fmt(gain)));
    left.appendChild(big);
    var sub = el('p', 'nmx__sub');
    sub.appendChild(el('span', null, T.gained[range]));
    if (cur.prevGain !== null && cur.prevGain > 0) {
      var pct = Math.round(((gain - cur.prevGain) / cur.prevGain) * 100);
      var chip = el('span', 'nmx__delta' + (pct < 0 ? ' is-down' : ''), (pct >= 0 ? '+' : '') + pct.toLocaleString(loc) + ' %');
      sub.appendChild(chip);
      sub.appendChild(el('span', null, T.prev));
    }
    if (range !== 'all') sub.appendChild(el('span', 'nmx__muted', T.total + ': ' + short(data.total)));
    left.appendChild(sub);
    head.appendChild(left);

    var tabs = el('div', 'nmx__tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', en ? 'Period' : 'Zeitraum');
    T.ranges.forEach(function (r) {
      var b = el('button', 'nmx__tab' + (r[0] === range ? ' is-on' : ''), r[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(r[0] === range));
      b.addEventListener('click', function () { range = r[0]; draw(); });
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
  }

  /* ---------- Kurve ---------- */
  function renderChart(wrap, pts) {
    wrap.innerHTML = '';
    if (pts.length < 2) return;
    var W = Math.max(280, wrap.clientWidth || 600);
    var H = full ? 300 : 230;
    var padL = 4, padR = 4, padT = 16, padB = 28;
    var min = pts[0].views, max = pts[pts.length - 1].views;
    for (var i = 0; i < pts.length; i++) { if (pts[i].views > max) max = pts[i].views; if (pts[i].views < min) min = pts[i].views; }
    if (max === min) { max = max + 1; min = Math.max(0, min - 1); }
    var lo = Math.max(0, min - (max - min) * 0.08);
    var x = function (k) { return padL + (k / (pts.length - 1)) * (W - padL - padR); };
    var y = function (v) { return padT + (1 - (v - lo) / (max - lo)) * (H - padT - padB); };

    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, class: 'nmx__svg', role: 'img',
      'aria-label': T.title + ': ' + fmt(pts[0].views) + ' → ' + fmt(pts[pts.length - 1].views) });
    var defs = svg('defs', {});
    var grad = svg('linearGradient', { id: 'nmxFill', x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svg('stop', { offset: '0', 'stop-color': '#2fe08c', 'stop-opacity': '.32' }));
    grad.appendChild(svg('stop', { offset: '1', 'stop-color': '#2fe08c', 'stop-opacity': '0' }));
    defs.appendChild(grad);
    var glow = svg('filter', { id: 'nmxGlow', x: '-10%', y: '-50%', width: '120%', height: '200%' });
    glow.appendChild(svg('feGaussianBlur', { stdDeviation: '6' }));
    defs.appendChild(glow);
    root.appendChild(defs);

    // Hilfslinien
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (g / 3) * (H - padT - padB);
      root.appendChild(svg('line', { x1: padL, x2: W - padR, y1: gy, y2: gy, class: 'nmx__grid' }));
    }
    var d = '';
    for (var j = 0; j < pts.length; j++) d += (j ? 'L' : 'M') + x(j).toFixed(1) + ' ' + y(pts[j].views).toFixed(1);
    var area = d + 'L' + x(pts.length - 1).toFixed(1) + ' ' + (H - padB) + 'L' + x(0).toFixed(1) + ' ' + (H - padB) + 'Z';
    root.appendChild(svg('path', { d: area, fill: 'url(#nmxFill)' }));
    root.appendChild(svg('path', { d: d, class: 'nmx__glow', filter: 'url(#nmxGlow)' }));
    root.appendChild(svg('path', { d: d, class: 'nmx__line' }));

    // Datumsachse: fünf Marken
    var marks = Math.min(W < 480 ? 3 : 5, pts.length);
    for (var m = 0; m < marks; m++) {
      var k = Math.round((m / (marks - 1)) * (pts.length - 1));
      var t = svg('text', { x: x(k), y: H - 8, class: 'nmx__axis', 'text-anchor': m === 0 ? 'start' : m === marks - 1 ? 'end' : 'middle' });
      t.textContent = dayLabel(pts[k].day, range === 'all' && pts.length > 200);
      root.appendChild(t);
    }

    // Fadenkreuz beim Überfahren
    var cross = svg('line', { y1: padT, y2: H - padB, class: 'nmx__cross', visibility: 'hidden' });
    var dot = svg('circle', { r: 5, class: 'nmx__dot', visibility: 'hidden' });
    root.appendChild(cross);
    root.appendChild(dot);
    wrap.appendChild(root);
    var tip = el('div', 'nmx__tip');
    tip.hidden = true;
    wrap.appendChild(tip);

    function at(clientX) {
      var r = root.getBoundingClientRect();
      var rel = ((clientX - r.left) / r.width) * W;
      var k = Math.round(((rel - padL) / (W - padL - padR)) * (pts.length - 1));
      k = Math.max(0, Math.min(pts.length - 1, k));
      var px = x(k), py = y(pts[k].views);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = '';
      tip.appendChild(el('b', null, fmt(pts[k].views) + ' ' + T.views));
      tip.appendChild(el('span', null, dayLabel(pts[k].day, true)));
      var left = (px / W) * r.width;
      tip.style.left = Math.max(70, Math.min(r.width - 70, left)) + 'px';
      tip.style.top = Math.max(0, (py / H) * r.height - 58) + 'px';
    }
    root.addEventListener('pointermove', function (e) { at(e.clientX); });
    root.addEventListener('pointerdown', function (e) { at(e.clientX); });
    root.addEventListener('pointerleave', function () {
      cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true;
    });
  }

  /* ---------- Kennzahlen, Kampagnen, Plattformen ---------- */
  function renderStats(target) {
    target.innerHTML = '';
    [[T.likes, data.likes], [T.comments, data.comments], [T.shares, data.shares], [T.clips, data.clips], [T.posts, data.posts]].forEach(function (k) {
      var i = el('div', 'nmx__stat');
      i.appendChild(el('dt', null, k[0]));
      i.appendChild(el('dd', null, short(k[1])));
      target.appendChild(i);
    });
  }

  function renderCampaigns(target) {
    target.innerHTML = '';
    target.appendChild(el('h3', 'nmx__h3', T.campaigns));
    var list = el('ol', 'nmx__rank');
    var top = data.top.slice(0, full ? 12 : 6);
    var max = top.length ? top[0].views : 1;
    top.forEach(function (c) {
      var li = el('li', 'nmx__row');
      var name = el(c.href ? 'a' : 'span', 'nmx__name', c.name);
      if (c.href) name.href = c.href;
      var bar = el('span', 'nmx__bar');
      var fill = el('i');
      fill.style.width = Math.max(2, (c.views / max) * 100) + '%';
      bar.appendChild(fill);
      var val = el('span', 'nmx__val', short(c.views));
      var share = el('span', 'nmx__share', data.total ? Math.round((c.views / data.total) * 100) + ' %' : '');
      li.appendChild(name); li.appendChild(val); li.appendChild(bar); li.appendChild(share);
      list.appendChild(li);
    });
    target.appendChild(list);
  }

  function renderPlatforms(target) {
    target.innerHTML = '';
    target.appendChild(el('h3', 'nmx__h3', T.platforms));
    var sum = data.platforms.reduce(function (a, p) { return a + p.views; }, 0) || 1;
    var stack = el('div', 'nmx__stack');
    var legend = el('ul', 'nmx__legend');
    data.platforms.forEach(function (p, i) {
      var c = SHADES[i % SHADES.length];
      var seg = el('i');
      seg.style.width = (p.views / sum) * 100 + '%';
      seg.style.background = c;
      seg.title = (PLAT[p.platform] || p.platform) + ': ' + fmt(p.views);
      stack.appendChild(seg);
      var li = el('li');
      var sw = el('span', 'nmx__sw'); sw.style.background = c;
      li.appendChild(sw);
      var key = PLAT[p.platform] ? p.platform === 'x' ? 'twitter' : p.platform : null;
      if (key) { var img = el('img'); img.src = '/img/platforms/' + key + '.svg'; img.alt = ''; li.appendChild(img); }
      li.appendChild(el('span', 'nmx__pname', PLAT[p.platform] || p.platform));
      li.appendChild(el('b', null, short(p.views)));
      li.appendChild(el('small', null, Math.round((p.views / sum) * 100) + ' %'));
      legend.appendChild(li);
    });
    target.appendChild(stack);
    target.appendChild(legend);
  }

  function draw() {
    var body = box.querySelector('[data-views-body]');
    if (!data.total || !data.series.length) return message(T.empty);
    var cur = slice();
    body.innerHTML = '';
    var head = el('div', 'nmx__head');
    var chart = el('div', 'nmx__chart');
    var stats = el('dl', 'nmx__stats');
    var split = el('div', 'nmx__split');
    var camp = el('div', 'nmx__panel');
    var plat = el('div', 'nmx__panel');
    split.appendChild(camp); split.appendChild(plat);
    body.appendChild(head); body.appendChild(chart); body.appendChild(stats); body.appendChild(split);
    var note = el('p', 'nmx__note', T.note + (data.syncedAt ? ' ' + T.synced + ': ' + new Date(data.syncedAt * 1000).toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) + '.' : ''));
    body.appendChild(note);
    renderHead(head, cur);
    renderChart(chart, cur.pts);
    renderStats(stats);
    renderCampaigns(camp);
    renderPlatforms(plat);
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    if (!data) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var chart = box.querySelector('.nmx__chart');
      if (chart && data.series.length) renderChart(chart, slice().pts);
    }, 120);
  });

  fetch('/api/views-analytics?area=' + encodeURIComponent(area), { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (d) { data = d; draw(); }).catch(function () { message(T.fail); });
})();
