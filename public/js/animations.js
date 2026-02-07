/**
 * NexusPay Animations
 * Counter animations, scroll reveals, live indicator
 */

const Animations = (() => {
  // Animated counter
  function animateCounter(el, target, duration = 1500) {
    const start = 0;
    const startTime = performance.now();
    const isFloat = String(target).includes('.');
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;

      el.textContent = prefix + (isFloat ? current.toFixed(2) : Math.round(current)) + suffix;

      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  // Scroll reveal
  function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');

          // Trigger counter animation if this is a stat card
          const counter = entry.target.querySelector('[data-counter]');
          if (counter && !counter.dataset.animated) {
            counter.dataset.animated = 'true';
            const target = parseFloat(counter.dataset.target || counter.textContent);
            animateCounter(counter, target);
          }
        }
      });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  // Smooth scroll for nav links
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
          const offset = 80; // navbar height
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });

          // Close mobile menu
          document.querySelector('.nav-links')?.classList.remove('open');
        }
      });
    });
  }

  // Mobile hamburger
  function initHamburger() {
    const btn = document.querySelector('.hamburger');
    const nav = document.querySelector('.nav-links');
    if (btn && nav) {
      btn.addEventListener('click', () => nav.classList.toggle('open'));
    }
  }

  // Navbar background on scroll
  function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.style.borderBottomColor = 'var(--border-hover)';
      } else {
        navbar.style.borderBottomColor = 'var(--border)';
      }
    });
  }

  function initAll() {
    initScrollReveal();
    initSmoothScroll();
    initHamburger();
    initNavbarScroll();
  }

  return { animateCounter, initAll };
})();
