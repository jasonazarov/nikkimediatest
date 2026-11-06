/* ==========================================================================
   NIKKI MEDIA, FAQ-Agent
   Kleines Chatfenster unten rechts. Fragt POST /api/agent/faq, die Antwort
   kommt aus der FAQ-Wissensbasis (src/lib/faq.ts), mit Sprachmodell, wenn
   ANTHROPIC_API_KEY gesetzt ist. Bringt sein eigenes CSS mit, damit es auf
   den Landingpages UND in den Dashboards (Tailwind) gleich aussieht.
   Konfiguration: <script type="application/json" id="agent-config">
   { "suggest": ["…"] }. Kein localStorage: der Verlauf lebt nur im Tab.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__nmAgent) return;
  window.__nmAgent = true;

  var cfg = {};
  try { cfg = JSON.parse((document.getElementById('agent-config') || {}).textContent || '{}'); } catch (e) { cfg = {}; }
  var suggest = Array.isArray(cfg.suggest) && cfg.suggest.length ? cfg.suggest : ['Was kostet 1 Mio. Views?', 'Sind die Views echt?', 'Wie schnell geht es los?'];

  var css = [
    '.nma{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:9000;font-family:Geist,Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#eef7f1}',
    '.nma *{box-sizing:border-box}',
    '.nma__fab{display:flex;align-items:center;gap:10px;padding:12px 18px 12px 14px;border:0;border-radius:999px;cursor:pointer;font:600 14px/1 inherit;font-family:inherit;color:#02160c;background:linear-gradient(180deg,#9cf6c8,#2fe08c 60%,#17a865);box-shadow:0 1px 0 rgba(255,255,255,.45) inset,0 14px 34px rgba(0,0,0,.45)}',
    '.nma__fab svg{width:18px;height:18px}',
    '.nma__fab:focus-visible,.nma button:focus-visible,.nma input:focus-visible{outline:2px solid #9cf6c8;outline-offset:3px}',
    '.nma__panel{position:absolute;right:0;bottom:calc(100% + 12px);width:min(380px,calc(100vw - 32px));max-height:min(560px,calc(100dvh - 120px));display:flex;flex-direction:column;border-radius:18px;overflow:hidden;background:#040906;border:1px solid rgba(47, 224, 140,.22);box-shadow:0 30px 80px rgba(0,0,0,.65)}',
    '.nma__panel[hidden]{display:none}',
    '.nma__head{display:flex;align-items:center;gap:12px;padding:14px 14px 14px 16px;border-bottom:1px solid rgba(238, 247, 241,.08)}',
    '.nma__mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;flex:none;font:800 15px/1 "Bricolage Grotesque",inherit;color:#02160c;background:linear-gradient(150deg,#b8fbd9,#2fe08c 55%,#12925a)}',
    '.nma__title{flex:1;min-width:0}',
    '.nma__title b{display:block;font-size:14px;font-weight:600}',
    '.nma__title small{display:block;margin-top:2px;font-size:12px;color:#98ada1}',
    '.nma__x{width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#98ada1;cursor:pointer;font-size:20px;line-height:1}',
    '.nma__x:hover{background:rgba(238, 247, 241,.06);color:#eef7f1}',
    '.nma__log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.55}',
    '.nma__msg{max-width:88%;padding:10px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}',
    '.nma__msg--bot{align-self:flex-start;background:#08130d;border:1px solid rgba(238, 247, 241,.06);border-bottom-left-radius:5px}',
    '.nma__msg--me{align-self:flex-end;color:#02160c;background:#4fe39b;border-bottom-right-radius:5px}',
    '.nma__msg--wait{color:#98ada1}',
    '.nma__chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px}',
    '.nma__chip{padding:7px 11px;border-radius:999px;border:1px solid rgba(47, 224, 140,.3);background:transparent;color:#9cf6c8;font:500 12.5px/1.2 inherit;font-family:inherit;cursor:pointer;text-align:left}',
    '.nma__chip:hover{background:rgba(47, 224, 140,.1)}',
    '.nma__form{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(238, 247, 241,.08)}',
    '.nma__form input{flex:1;min-width:0;padding:11px 12px;border-radius:11px;border:1px solid rgba(238, 247, 241,.12);background:#010302;color:#eef7f1;font:14px inherit;font-family:inherit}',
    '.nma__form input::placeholder{color:#66796f}',
    '.nma__send{flex:none;width:42px;border:0;border-radius:11px;cursor:pointer;color:#02160c;background:#2fe08c;display:grid;place-items:center}',
    '.nma__send[disabled]{opacity:.5;cursor:default}',
    '.nma__send svg{width:18px;height:18px}',
    '.nma__foot{padding:0 16px 12px;font-size:11px;color:#66796f}',
    '@media (max-width:480px){.nma__fab span{display:none}.nma__fab{padding:14px}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  var root = document.createElement('div');
  root.className = 'nma';
  root.innerHTML =
    '<div class="nma__panel" id="nma-panel" role="dialog" aria-label="Fragen an Nikki Media" hidden>' +
      '<div class="nma__head"><span class="nma__mark" aria-hidden="true">N</span>' +
        '<span class="nma__title"><b>Fragen an Nikki Media</b><small>Antwortet sofort aus unseren FAQ</small></span>' +
        '<button type="button" class="nma__x" data-close aria-label="Schließen">×</button></div>' +
      '<div class="nma__log" aria-live="polite"></div>' +
      '<div class="nma__chips"></div>' +
      '<form class="nma__form"><input type="text" name="q" maxlength="400" autocomplete="off" placeholder="Deine Frage …" aria-label="Deine Frage">' +
        '<button type="submit" class="nma__send" aria-label="Frage senden">' + ICON_SEND + '</button></form>' +
      '<p class="nma__foot">Automatische Antworten. Für alles Persönliche meldet sich Jason.</p>' +
    '</div>' +
    '<button type="button" class="nma__fab" aria-expanded="false" aria-controls="nma-panel">' + ICON_CHAT + '<span>Frage stellen</span></button>';
  document.body.appendChild(root);

  var panel = root.querySelector('.nma__panel');
  var fab = root.querySelector('.nma__fab');
  var log = root.querySelector('.nma__log');
  var chips = root.querySelector('.nma__chips');
  var form = root.querySelector('.nma__form');
  var field = form.querySelector('input');
  var send = form.querySelector('.nma__send');
  var greeted = false;
  var busy = false;

  function add(text, who) {
    var el = document.createElement('div');
    el.className = 'nma__msg nma__msg--' + who;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function setChips(list) {
    chips.innerHTML = '';
    (list || []).slice(0, 3).forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nma__chip';
      b.textContent = q;
      b.addEventListener('click', function () { ask(q); });
      chips.appendChild(b);
    });
  }

  function open() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    if (!greeted) {
      greeted = true;
      add('Hi! Frag mich alles zu Preisen, Ablauf, Clippern oder Reichweite. Ich antworte sofort.', 'bot');
      setChips(suggest);
    }
    setTimeout(function () { field.focus(); }, 30);
  }
  function close() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  function ask(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    busy = true;
    send.disabled = true;
    field.value = '';
    setChips([]);
    add(q, 'me');
    var wait = add('Einen Moment …', 'bot nma__msg--wait');
    fetch('/api/agent/faq', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        wait.className = 'nma__msg nma__msg--bot';
        wait.textContent = res.ok ? res.j.answer : (res.j.error || 'Das hat nicht geklappt. Bitte versuche es erneut.');
        if (res.ok && res.j.related) setChips(res.j.related.map(function (r) { return r.q; }));
      })
      .catch(function () {
        wait.className = 'nma__msg nma__msg--bot';
        wait.textContent = 'Keine Verbindung. Bitte prüfe dein Internet und versuche es erneut.';
      })
      .then(function () {
        busy = false;
        send.disabled = false;
        log.scrollTop = log.scrollHeight;
      });
  }

  fab.addEventListener('click', function () { panel.hidden ? open() : close(); });
  root.querySelector('[data-close]').addEventListener('click', close);
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(field.value); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });

  // Links auf #frage öffnen den Agenten (z. B. „Fragen stellen“ im Dashboard der Landingpage).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#frage"]');
    if (!a) return;
    e.preventDefault();
    open();
  });
  if (location.hash === '#frage') open();
})();
