/**
 * Theme.js — Core JavaScript for Shopify theme
 * Vanilla JS only, no dependencies.
 */

(function () {
  'use strict';

  // ── Mobile menu ────────────────────────────────────────────────────────
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileNav = document.querySelector('[data-mobile-nav]');

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = mobileNav.getAttribute('aria-hidden') === 'false';
      mobileNav.setAttribute('aria-hidden', String(isOpen));
      menuToggle.setAttribute('aria-expanded', String(!isOpen));
      mobileNav.classList.toggle('is-open', !isOpen);
    });
  }

  // ── Sticky header offset ───────────────────────────────────────────────
  function setHeaderOffset() {
    const header = document.querySelector('.site-header');
    if (header) {
      document.documentElement.style.setProperty(
        '--header-height',
        header.offsetHeight + 'px'
      );
    }
  }
  setHeaderOffset();
  window.addEventListener('resize', setHeaderOffset);

  // ── Lazy image loading ─────────────────────────────────────────────────
  if ('IntersectionObserver' in window) {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
          }
          observer.unobserve(img);
        }
      });
    });
    lazyImages.forEach((img) => observer.observe(img));
  }

  // ── Cart count update ──────────────────────────────────────────────────
  async function updateCartCount() {
    try {
      const res = await fetch('/cart.js');
      const cart = await res.json();
      const badge = document.querySelector('[data-cart-count]');
      if (badge) {
        badge.textContent = cart.item_count;
        badge.hidden = cart.item_count === 0;
      }
    } catch (_) {}
  }
  updateCartCount();

  // ── Add-to-cart ────────────────────────────────────────────────────────
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[action="/cart/add"]');
    if (!form) return;
    e.preventDefault();

    const btn = form.querySelector('[type="submit"]');
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

    try {
      const formData = new FormData(form);
      await fetch('/cart/add.js', { method: 'POST', body: formData });
      await updateCartCount();
      if (btn) btn.textContent = 'Added!';
      setTimeout(() => {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
      }, 1500);
    } catch (_) {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  });

  // ── Announcement bar close ────────────────────────────────────────────
  const announcementClose = document.querySelector('[data-announcement-close]');
  const announcementBar = document.querySelector('.announcement-bar');
  if (announcementClose && announcementBar) {
    announcementClose.addEventListener('click', () => {
      announcementBar.style.display = 'none';
      sessionStorage.setItem('announcement-dismissed', '1');
    });
    if (sessionStorage.getItem('announcement-dismissed')) {
      announcementBar.style.display = 'none';
    }
  }
})();
