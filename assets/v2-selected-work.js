/* Decode the real, already-requested images immediately. One short object-only
   fan-to-row animation is optional; content never waits for visibility or JS. */
(() => {
  'use strict';
  const section = document.querySelector('[data-selected-work]');
  if (!section) return;

  const images = [...section.querySelectorAll('img')];
  const warmImage = image => {
    image.dataset.imageDecoded = 'false';
    if (typeof image.decode === 'function') return image.decode().then(() => {
      image.dataset.imageDecoded = 'true';
      return true;
    }).catch(() => {
      image.dataset.imageError = 'decode';
      return false;
    });
    if (image.complete) return Promise.resolve(false);
    return new Promise(resolve => {
      image.addEventListener('load', () => resolve(false), { once: true });
      image.addEventListener('error', () => { image.dataset.imageError = 'load'; resolve(false); }, { once: true });
    });
  };
  // src/srcset are genuine HTML attributes. This does not create a second
  // request or withhold an image while a visitor is at the top of the page.
  section.dataset.selectedWorkState = 'warming';
  section.dataset.selectedReady = 'false';
  const warmedImages = images.map(warmImage);
  Promise.all(warmedImages).then(results => {
    const ready = results.every(Boolean);
    section.dataset.selectedReady = String(ready);
    section.dataset.selectedWorkState = ready ? 'ready' : 'fallback';
  });

  const grid = section.querySelector('[data-framework-collection]');
  if (!grid) return;
  const objects = [...grid.querySelectorAll('[data-framework-object]')];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const staticOnly = () => motion.matches || Boolean(connection && connection.saveData);
  grid.dataset.frameworkMotion = 'static';
  if (!objects.length || staticOnly() || !('IntersectionObserver' in window) ||
      !objects.every(object => typeof object.animate === 'function')) return;

  let observer;
  let visible = false;
  let decoded = false;
  let started = false;
  let settled = false;
  let animations = [];
  const removePreferenceListeners = () => {
    if (motion.removeEventListener) motion.removeEventListener('change', onPreferenceChange);
    if (connection && connection.removeEventListener) connection.removeEventListener('change', onPreferenceChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', settle);
    window.removeEventListener('resize', onResize);
    grid.removeEventListener('focusin', onFocus);
  };
  const settle = () => {
    // Underlying CSS is already the final layout, so canceling also safely
    // handles interrupted motion, a hidden tab, resize or a preference change.
    if (settled) return;
    settled = true;
    animations.forEach(animation => animation.cancel());
    animations = [];
    grid.dataset.frameworkMotion = started ? 'complete' : 'static';
    observer.disconnect();
    removePreferenceListeners();
  };
  const play = () => {
    if (settled || started || !visible || !decoded || document.hidden) return;
    if (staticOnly() || grid.contains(document.activeElement)) { settle(); return; }
    started = true;
    grid.dataset.frameworkMotion = 'running';
    const rows = objects.map(object => object.getBoundingClientRect());
    const columns = rows.filter(row => Math.abs(row.top - rows[0].top) < 2).length;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    try {
      objects.forEach((object, index) => {
        const column = index % columns;
        const centreOffset = (columns - 1) / 2 - column;
        const x = centreOffset * (rows[index].width + gap) * (columns === 4 ? .52 : .16);
        const y = columns === 4 ? 28 + Math.abs(centreOffset) * 12 : 20;
        const angle = centreOffset * -7;
        animations.push(object.animate([
          { transform: `translate(${x}px, ${y}px) rotate(${angle}deg) scale(.94)` },
          { transform: 'translate(0, 0) rotate(0deg) scale(1)' }
        ], { duration: columns === 4 ? 850 : 640, delay: index * 35, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'both' }));
      });
      Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(settle);
    } catch (_) {
      // A partial Web Animations implementation must leave ordinary links and
      // the complete, static collection available.
      settle();
    }
  };
  const onPreferenceChange = () => { if (staticOnly()) settle(); };
  const onVisibilityChange = () => {
    if (document.hidden && started) settle();
    else if (!document.hidden) play();
  };
  const onResize = () => { if (started) settle(); };
  const onFocus = () => { settle(); };

  grid.dataset.frameworkMotion = 'waiting';
  observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (!visible && started) settle();
    else play();
  }, { threshold: .18 });
  observer.observe(grid);
  if (motion.addEventListener) motion.addEventListener('change', onPreferenceChange);
  if (connection && connection.addEventListener) connection.addEventListener('change', onPreferenceChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', settle);
  window.addEventListener('resize', onResize, { passive: true });
  grid.addEventListener('focusin', onFocus);

  // Only card readiness gates the optional motion. Transit photos decode in
  // parallel and cannot hold up the collection's first visible presentation.
  const cardImages = images.filter(image => grid.contains(image));
  Promise.all(cardImages.map(image => warmedImages[images.indexOf(image)])).then(results => {
    decoded = results.every(Boolean);
    if (decoded) play();
    else settle();
  });
})();
