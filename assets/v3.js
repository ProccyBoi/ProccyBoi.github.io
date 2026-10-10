/* V3-only keyboard focus and offscreen workbench lifecycle enhancements.
   Original gallery ownership and engineering controllers stay intact. */
(() => {
  'use strict';
  const workbenches = [...document.querySelectorAll('.v3-tramtrace-workbench[data-board-inspector]')];
  const pauseFrame = workbench => {
    const play = workbench.querySelector('[data-frame-play]');
    if (play?.getAttribute('aria-label') === 'Pause data frame') play.click();
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (!entry.isIntersecting) pauseFrame(entry.target); });
    });
    workbenches.forEach(workbench => observer.observe(workbench));
  }
  addEventListener('pagehide', () => workbenches.forEach(pauseFrame));
  document.querySelectorAll('dialog[data-lightbox]').forEach(dialog => {
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || !dialog.open) return;
      const items = [...dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
        .filter(item => !item.disabled && item.tabIndex >= 0 && item.getClientRects().length && !item.closest('[inert]'));
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    });
  });
})();
