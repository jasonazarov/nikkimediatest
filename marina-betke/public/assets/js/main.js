(() => {
  'use strict';

  // Premium header polish: subtly tighten the glass header after scrolling.
  const setScrolledState = () => {
    document.body.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  setScrolledState();
  window.addEventListener('scroll', setScrolledState, { passive: true });

  // Mobile burger menu
  const burgerBtn = document.getElementById('burgerBtn');
  const homeNav = document.getElementById('homeNav');
  if (burgerBtn && homeNav) {
    const setNavOpen = (open) => {
      homeNav.classList.toggle('is-open', open);
      burgerBtn.setAttribute('aria-expanded', String(open));
    };
    burgerBtn.addEventListener('click', () => {
      setNavOpen(!homeNav.classList.contains('is-open'));
    });
    homeNav.querySelectorAll('a').forEach((link) => {
      // Defer closing so the browser's default anchor-jump (the nav link's
      // own navigation) isn't cancelled by hiding its ancestor mid-click.
      link.addEventListener('click', () => setTimeout(() => setNavOpen(false), 0));
    });
    document.addEventListener('click', (e) => {
      if (!homeNav.classList.contains('is-open')) return;
      if (homeNav.contains(e.target) || burgerBtn.contains(e.target)) return;
      setNavOpen(false);
    });
  }

  // Scroll-reveal animation must run on every page, including topic pages
  // that do not include the booking modal.
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // Re-open CCM19 cookie preferences from footer links after the first consent choice.
  document.querySelectorAll('[data-cookie-settings]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      if (window.CCM && typeof window.CCM.openWidget === 'function') {
        window.CCM.openWidget();
      }
    });
  });

})();
