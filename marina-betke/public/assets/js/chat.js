(() => {
  'use strict';
  // Chat-Szenen im Abschnitt "Kennst du das?": laufen nur, solange sie sichtbar sind
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const scenes = [];
  const scene = (el, loop, still) => { if (el) scenes.push({ el, loop, still, on: false, running: false }); };

  // 23:14 Uhr: tippen, löschen, neu tippen, doch senden
  const typeEl = document.querySelector('.chat-demo--type');
  scene(typeEl, async (s) => {
    const typed = typeEl.querySelector('.chat-demo__typed');
    const bubble = typeEl.querySelector('.chat-bubble--out');
    const text = bubble.querySelector('.chat-bubble__text');
    const ticks = bubble.querySelector('.chat-ticks');
    const comp = typeEl.querySelector('.chat-demo__composer');
    const sync = () => comp.classList.toggle('is-typing', typed.textContent.length > 0);
    const type = async (str) => { for (const ch of str) { if (!s.on) return; typed.textContent += ch; sync(); await wait(70 + Math.random() * 60); } };
    const erase = async () => { while (typed.textContent && s.on) { typed.textContent = typed.textContent.slice(0, -1); sync(); await wait(28); } };
    bubble.classList.remove('is-sent'); ticks.classList.remove('is-read'); typed.textContent = ''; sync();
    await wait(500);
    await type('Nein. Bitte schreib mir nicht mehr.'); await wait(900);
    await erase(); await wait(500);
    await type('Was willst du denn?'); await wait(800);
    await erase(); await wait(600);
    const last = 'Okay. Aber nur kurz.';
    await type(last); await wait(700);
    if (!s.on) return;
    typed.textContent = ''; sync(); text.textContent = last; bubble.classList.add('is-sent');
    await wait(1600); ticks.classList.add('is-read');
    await wait(4200);
  }, () => {
    typeEl.querySelector('.chat-bubble__text').textContent = 'Okay. Aber nur kurz.';
    typeEl.querySelector('.chat-bubble--out').classList.add('is-sent');
    typeEl.querySelector('.chat-ticks').classList.add('is-read');
  });

  // Plötzlich bist du schuld: oben steht "schreibt …" (wie bei WhatsApp), dann zwei Vorwürfe
  const blameEl = document.querySelector('.chat-demo--blame');
  scene(blameEl, async () => {
    const st = blameEl.querySelector('.wa__status');
    const tippt = (an) => { st.textContent = an ? 'schreibt …' : 'online'; };
    const [b1, b2] = blameEl.querySelectorAll('.chat-bubble');
    b1.classList.remove('is-on'); b2.classList.remove('is-on'); tippt(false);
    await wait(700); tippt(true);
    await wait(1700); tippt(false); b1.classList.add('is-on');
    await wait(900); tippt(true);
    await wait(1400); tippt(false); b2.classList.add('is-on');
    await wait(4500);
  }, () => blameEl.querySelectorAll('.chat-bubble').forEach((b) => b.classList.add('is-on')));

  // Der Online-Status: zuletzt online, online, schreibt ..., dann doch nichts
  const statusEl = document.querySelector('.chat-demo--status');
  scene(statusEl, async () => {
    const line = statusEl.querySelector('.chat-status__line');
    const set = (txt, live) => { line.textContent = txt; line.classList.toggle('is-live', live); };
    set('zuletzt online heute um 22:47', false); await wait(3800);
    set('online', true); await wait(2200);
    set('schreibt …', true); await wait(2000);
    set('online', true); await wait(1400);
    set('zuletzt online heute um 23:02', false); await wait(3600);
  }, () => {});

  // Die Kinder: kurzer Videoanruf
  const callEl = document.querySelector('.chat-demo--call');
  scene(callEl, async () => {
    const b = callEl.querySelector('.chat-bubble');
    b.classList.remove('is-on'); await wait(600); b.classList.add('is-on'); await wait(9000);
  }, () => callEl.querySelector('.chat-bubble').classList.add('is-on'));

  if (!scenes.length) return;
  if (reduce || !('IntersectionObserver' in window)) { scenes.forEach((s) => s.still()); return; }

  const run = async (s) => {
    if (s.running) return;
    s.running = true;
    while (s.on) await s.loop(s);
    s.running = false;
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const s = scenes.find((x) => x.el === e.target);
      s.on = e.isIntersecting;
      if (s.on) run(s);
    });
  }, { threshold: 0.35 });
  scenes.forEach((s) => io.observe(s.el));
})();
