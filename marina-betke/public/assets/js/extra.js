(() => {
  'use strict';
  // Karten-Einblendung (leise, gestaffelt)
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cards = Array.from(document.querySelectorAll('.editorial-feature-card,.session-point,.faq-item,.price-card,.flow-detail-list p,.editorial-support-list>div,.topic-card--compact,.pricing-decision-grid p,.topic-depth-card,.topic-depth-copy,.flow-steps:not(.flow-steps--detailed)>div'))
    .filter((el) => !el.hasAttribute('data-reveal'));
  if (!reduce && cards.length && 'IntersectionObserver' in window) {
    cards.forEach((el) => {
      const i = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty('--rv-d', Math.min(i, 5) * 70 + 'ms');
      el.classList.add('rv');
    });
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    cards.forEach((el) => io.observe(el));
  }
})();
(() => {
  'use strict';
  // Scroll-Zeitleiste fuer Programm-Ablauf
  const box = document.querySelector('.flow-steps--detailed');
  if (!box) return;
  const steps = Array.from(box.children).filter((el) => el.tagName === 'DIV');
  if (steps.length < 2) return;
  const line = document.createElement('i');
  line.className = 'tl-line';
  line.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('i');
  fill.className = 'tl-fill';
  line.appendChild(fill);
  box.appendChild(line);
  box.classList.add('has-timeline');
  const dot = (s) => s.querySelector('span');
  const place = () => {
    const t0 = steps[0].querySelector('strong');
    const stacked = t0 && t0.getBoundingClientRect().top > dot(steps[0]).getBoundingClientRect().bottom - 4;
    line.style.display = stacked ? 'none' : '';
    const b = box.getBoundingClientRect();
    const a = dot(steps[0]).getBoundingClientRect();
    const z = dot(steps[steps.length - 1]).getBoundingClientRect();
    const cx = a.left + a.width / 2 - b.left;
    line.style.left = cx - 1 + 'px';
    line.style.top = a.top + a.height / 2 - b.top + 'px';
    line.style.height = z.top + z.height / 2 - (a.top + a.height / 2) + 'px';
  };
  const update = () => {
    const vh = window.innerHeight, mark = vh * 0.62;
    const a = dot(steps[0]).getBoundingClientRect();
    const z = dot(steps[steps.length - 1]).getBoundingClientRect();
    const top = a.top + a.height / 2, bot = z.top + z.height / 2;
    const p = Math.max(0, Math.min(1, (mark - top) / Math.max(1, bot - top)));
    fill.style.height = p * 100 + '%';
    steps.forEach((s) => {
      const r = dot(s).getBoundingClientRect();
      s.classList.toggle('is-active', r.top + r.height / 2 < mark);
    });
  };
  const run = () => { place(); update(); };
  run();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', run);
  window.addEventListener('load', run);
})();

(() => {
  'use strict';
  // Gesprächs-Knopf erst zeigen, wenn der Hero vorbei ist (verdeckt sonst den Hauptknopf)
  const setze = () => document.body.classList.toggle('nach-hero', window.scrollY > window.innerHeight * 0.7);
  setze();
  window.addEventListener('scroll', setze, { passive: true });
})();
