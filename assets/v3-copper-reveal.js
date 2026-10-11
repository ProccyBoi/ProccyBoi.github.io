/* Registered SVG comparison. No geometry changes, timers, or animation loop. */
(() => {
  'use strict';
  const clamp = value => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

  function mount(root) {
    if (root.dataset.copperMounted) return;
    const stage = root.querySelector('[data-copper-reveal]');
    const range = root.querySelector('[data-copper-range]');
    const controls = root.querySelector('[data-copper-controls]');
    const reset = root.querySelector('[data-copper-reset]');
    const retry = root.querySelector('[data-copper-retry]');
    const error = root.querySelector('[data-copper-error]');
    const readout = root.querySelector('[data-copper-readout]');
    if (!stage || !range || !controls || !reset) return;
    root.dataset.copperMounted = 'true';
    let pointer = null;
    let generation = 0;

    const interactive = () => root.dataset.copperState === 'ready' &&
      !root.closest('[hidden], [inert]') && root.getClientRects().length > 0;

    function set(value) {
      const next = clamp(value);
      range.value = String(next);
      range.setAttribute('aria-valuetext', `${next}% copper revealed`);
      root.style.setProperty('--reveal', `${next}%`);
      root.dataset.copperValue = String(next);
      if (readout) readout.textContent = `${next}%`;
    }

    function finish() {
      if (pointer && stage.hasPointerCapture(pointer.id)) stage.releasePointerCapture(pointer.id);
      pointer = null;
      delete root.dataset.copperDragging;
    }

    function fromPointer(event) {
      const box = stage.getBoundingClientRect();
      if (box.width) set((event.clientX - box.left) / box.width * 100);
    }

    // Keep the native range's defaults (including Home/End), but do not let
    // these arrow keys navigate the containing project folio as well.
    range.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
        event.stopPropagation();
      }
    });
    range.addEventListener('input', () => set(range.value));
    reset.addEventListener('click', () => { finish(); set(50); });

    // The containing folio must also ignore targets inside [data-folio-copper]
    // if it listens in the capture phase. Do not cancel browser vertical scroll.
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(type => {
      root.addEventListener(type, event => event.stopPropagation());
    });

    stage.addEventListener('pointerdown', event => {
      if (!interactive() || !event.isPrimary || event.button !== 0) return;
      finish();
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, locked: event.pointerType !== 'touch' };
      if (pointer.locked) {
        stage.setPointerCapture(event.pointerId);
        root.dataset.copperDragging = 'true';
        fromPointer(event);
      }
    });

    stage.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (!interactive()) { finish(); return; }
      if (!pointer.locked) {
        const dx = Math.abs(event.clientX - pointer.x);
        const dy = Math.abs(event.clientY - pointer.y);
        if (Math.max(dx, dy) < 7) return;
        if (dy >= dx) { finish(); return; }
        pointer.locked = true;
        stage.setPointerCapture(event.pointerId);
        root.dataset.copperDragging = 'true';
      }
      if (event.cancelable) event.preventDefault();
      fromPointer(event);
    }, { passive: false });

    stage.addEventListener('pointerup', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (interactive()) fromPointer(event);
      finish();
    });
    stage.addEventListener('pointercancel', finish);
    stage.addEventListener('lostpointercapture', finish);
    window.addEventListener('blur', finish);

    function imageReady(source) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => image.naturalWidth > 0 ? resolve() : reject(new Error('Empty board layer'));
        image.onerror = () => reject(new Error('Unavailable board layer'));
        image.src = source;
      });
    }

    async function load() {
      const current = ++generation;
      finish();
      root.dataset.copperState = 'loading';
      range.disabled = true;
      controls.hidden = true;
      if (error) error.hidden = true;
      const sources = [...new Set([...stage.querySelectorAll('[data-copper-source]')]
        .map(image => image.getAttribute('href')).filter(Boolean))];
      try {
        if (sources.length !== 3) throw new Error('Incomplete board sources');
        await Promise.all(sources.map(imageReady));
        if (current !== generation) return;
        // Re-assign failed SVG image references too, so Retry repairs the
        // actual composition as well as the independent readiness probes.
        stage.querySelectorAll('[data-copper-source]').forEach(image => {
          const source = image.getAttribute('href');
          image.removeAttribute('href');
          image.setAttribute('href', source);
        });
        root.dataset.copperState = 'ready';
        range.disabled = false;
        controls.hidden = false;
      } catch (_) {
        if (current !== generation) return;
        root.dataset.copperState = 'error';
        if (error) error.hidden = false;
      }
    }

    if (retry) retry.addEventListener('click', load);
    set(range.value || 50);
    load();
  }

  const init = () => document.querySelectorAll('[data-folio-copper]').forEach(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
