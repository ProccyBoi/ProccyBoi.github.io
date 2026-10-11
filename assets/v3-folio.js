/* The v3 project folio owns selection, never the source photographs or their
 * destinations. Without this enhancement all three projects remain readable. */
(() => {
  'use strict';

  const root = document.querySelector('[data-folio]');
  if (!root || root.dataset.folioReady) return;
  const deck = root.querySelector('[data-folio-deck]');
  const views = root.querySelector('[data-folio-views]');
  const viewButtons = [...root.querySelectorAll('button[data-folio-view]')];
  const tabs = [...root.querySelectorAll('[data-folio-tab]')];
  const copper = root.querySelector('[data-folio-copper]');
  const count = root.querySelector('[data-folio-count]');
  const caption = root.querySelector('[data-folio-caption]');
  const live = root.querySelector('[data-folio-live]');
  const records = [...root.querySelectorAll('[data-folio-card]')].map(article => {
    const key = article.dataset.folioCard;
    const image = article.querySelector('[data-folio-image]');
    return {
      key, article, image,
      name: article.dataset.name || key,
      button: article.querySelector('[data-folio-select]'),
      tab: tabs.find(tab => tab.dataset.folioTab === key),
      panel: [...root.querySelectorAll('[data-folio-panel]')].find(panel => panel.dataset.folioPanel === key),
      images: new Map(image ? [['overview', image]] : []),
      pending: new Map(),
      renderedView: 'overview'
    };
  });
  if (!deck || !views || !records.length || records.some(record =>
    !record.key || !record.image || !record.button || !record.panel || !record.article.dataset.overviewSrc)) return;
  const byKey = new Map(records.map(record => [record.key, record]));
  if (byKey.size !== records.length) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let activeKey = '';
  let activeView = 'overview';
  let revision = 0;
  let panelAnimation = null;
  let motionModule = null;
  let motionImport = null;
  let gesture = null;
  let suppressClickUntil = 0;
  let retry = root.querySelector('[data-folio-retry]');
  if (!retry) {
    retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'v3-folio-retry';
    retry.dataset.folioRetry = '';
    retry.textContent = 'Try photograph again';
    views.after(retry);
  }
  retry.hidden = true;
  retry.disabled = false;
  deck.style.touchAction = 'pan-y pinch-zoom';
  records.forEach((record, index) => {
    record.image.draggable = false;
    record.image.dataset.folioPhotoView = 'overview';
    record.article.dataset.folioPhotoView = 'overview';
    if (!record.panel.id) record.panel.id = `folio-panel-${record.key}`;
    record.button.setAttribute('aria-controls', record.panel.id);
    if (!record.button.hasAttribute('aria-label')) record.button.setAttribute('aria-label', `Select ${record.name}`);
    if (record.tab) {
      if (!record.tab.id) record.tab.id = `folio-tab-${record.key}`;
      record.tab.setAttribute('role', 'tab');
      record.tab.setAttribute('aria-controls', record.panel.id);
      record.panel.setAttribute('role', 'tabpanel');
      record.panel.setAttribute('aria-labelledby', record.tab.id);
    }
    record.article.style.setProperty('--folio-index', index);
  });
  const tablist = tabs[0]?.parentElement;
  if (tablist && tabs.every(tab => tab.parentElement === tablist)) {
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-orientation', 'horizontal');
  }
  if (live) {
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
  }

  function normalizeView(project, view) {
    if (view === 'copper' && project === 'tramtrace' && copper) return 'copper';
    if (view === 'detail' && byKey.get(project)?.article.dataset.detailSrc) return 'detail';
    return 'overview';
  }

  function readLocation() {
    const params = new URL(location.href).searchParams;
    const project = byKey.has(params.get('project')) ? params.get('project') : records[0].key;
    return { project, view: normalizeView(project, params.get('view')) };
  }

  function writeLocation(mode = 'push') {
    const url = new URL(location.href);
    url.searchParams.set('project', activeKey);
    if (activeView === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', activeView);
    if (url.href === location.href) return;
    try {
      if (mode === 'replace') history.replaceState(history.state, '', url);
      else history.pushState(history.state, '', url);
    } catch (_) { /* Selection still works in local-file and embedded previews. */ }
  }

  function emit(type = 'v3:folio-change') {
    root.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail: { project: activeKey, view: activeView, state: root.dataset.folioState }
    }));
  }

  function source(record, view) {
    const data = record.article.dataset;
    return {
      src: data[`${view}Src`],
      srcset: data[`${view}Srcset`] || '',
      alt: data[`${view}Alt`] || `${record.name}, ${view} photograph`,
      caption: data[`${view}Caption`] || data[`${view}Alt`] || `${view === 'detail' ? 'Detail' : 'Overview'} photograph`
    };
  }

  function describe(record, view = activeView) {
    return view === 'copper' ? 'PCB artwork and copper comparison' : source(record, view).caption;
  }

  function state(value, announce = false) {
    root.dataset.folioState = value;
    deck.setAttribute('aria-busy', String(value === 'loading'));
    retry.hidden = value !== 'error';
    retry.disabled = value === 'loading';
    const record = byKey.get(activeKey);
    if (caption) caption.textContent = value === 'error'
      ? `${record.name}: ${activeView} photograph unavailable. Try again or open the project below.`
      : `${record.name}: ${describe(record)}`;
    if (live && announce) live.textContent = value === 'error'
      ? `${record.name} ${activeView} photograph could not be loaded. Try again is available.`
      : `${record.name}, ${describe(record)}${value === 'loading' ? '. Loading photograph.' : '.'}`;
    emit();
  }

  function cancelTextMotion() {
    if (panelAnimation?.revert) panelAnimation.revert();
    else panelAnimation?.cancel();
    panelAnimation = null;
  }

  async function enterPanel(record) {
    const token = revision;
    // The locally licensed timeline is optional: it never owns selection and
    // an import failure cannot hide content or delay a project change.
    if (!motionImport) motionImport = import('/assets/vendor/anime.esm.min.js')
      .then(module => { motionModule = module; return module; }).catch(() => null);
    const motion = motionModule || await motionImport;
    if (token !== revision || reducedMotion.matches || record.key !== activeKey) return;
    if (motion?.createTimeline) {
      try {
        const timeline = motion.createTimeline({ autoplay: false, defaults: { duration: 280, ease: 'out(3)' } });
        panelAnimation = timeline;
        timeline.label('selected', 0)
          .add(record.panel, { opacity: [0, 1], translateY: [12, 0] }, 'selected');
        if (count) timeline.add(count, { opacity: [.2, 1], translateY: [6, 0], duration: 200 }, 'selected+=35');
        if (caption) timeline.add(caption, { opacity: [.15, 1], translateY: [5, 0], duration: 230 }, 'selected+=60');
        root.dataset.folioMotion = 'anime';
        timeline.play();
        return;
      } catch (_) { cancelTextMotion(); }
    }
    root.dataset.folioMotion = 'native';
    if (record.panel.animate) panelAnimation = record.panel.animate([
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  function reflectSelection(animate) {
    cancelTextMotion();
    const index = records.findIndex(record => record.key === activeKey);
    const active = records[index];
    const focused = document.activeElement;
    const hidingFocus = records.some(record => record !== active && record.panel.contains(focused)) ||
      (activeView === 'copper' ? deck.contains(focused) : copper?.contains(focused)) ||
      (activeKey !== 'tramtrace' && focused?.dataset.folioView === 'copper');
    if (hidingFocus) (active.tab || active.button).focus({ preventScroll: true });
    root.dataset.folioActive = activeKey;
    root.dataset.folioView = activeView;
    records.forEach((record, cardIndex) => {
      const selected = record === active;
      let offset = (cardIndex - index + records.length) % records.length;
      if (offset > records.length / 2) offset -= records.length;
      record.article.dataset.offset = String(offset);
      record.article.dataset.folioSelected = String(selected);
      record.button.setAttribute('aria-current', String(selected));
      record.button.setAttribute('aria-label', selected ? `Expand ${record.name} ${activeView} photograph` : `Select ${record.name}`);
      if (selected) record.button.setAttribute('aria-haspopup', 'dialog');
      else record.button.removeAttribute('aria-haspopup');
      record.panel.hidden = !selected;
      record.panel.inert = !selected;
      record.panel.setAttribute('aria-hidden', String(!selected));
      record.panel.dataset.folioSelected = String(selected);
      if (record.tab) {
        record.tab.setAttribute('aria-selected', String(selected));
        record.tab.tabIndex = selected ? 0 : -1;
      }
    });
    if (count) count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(records.length).padStart(2, '0')}`;
    viewButtons.forEach(button => {
      const view = button.dataset.folioView;
      const available = view !== 'copper' || (activeKey === 'tramtrace' && !!copper);
      button.hidden = !available;
      button.disabled = !available || (view === 'detail' && !active.article.dataset.detailSrc);
      button.setAttribute('aria-pressed', String(view === activeView));
      button.setAttribute('aria-label', `${active.name}: ${view === 'copper' ? 'compare PCB artwork and copper' : `${view} photograph`}`);
    });
    deck.inert = activeView === 'copper';
    deck.setAttribute('aria-hidden', String(activeView === 'copper'));
    if (copper) {
      copper.hidden = activeView !== 'copper';
      copper.inert = activeView !== 'copper';
      copper.setAttribute('aria-hidden', String(activeView !== 'copper'));
    }
    // Card movement stays CSS-owned. Only the keyed incoming text is animated;
    // cancelling its animation cannot delay or undo the semantic selection.
    if (animate && !reducedMotion.matches) enterPanel(active);
  }

  function freshURL(value, stamp) {
    const url = new URL(value, location.href);
    url.searchParams.set('folio-retry', stamp);
    return url.href;
  }

  function waitForImage(image, start) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let decoding = false;
      const cleanup = () => {
        clearTimeout(timeout);
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
      };
      const failed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Photograph unavailable'));
      };
      const loaded = async () => {
        if (settled || decoding) return;
        decoding = true;
        try {
          if (image.decode) await image.decode();
          if (!image.naturalWidth) throw new Error('Empty photograph');
        } catch (_) { failed(); return; }
        if (settled) return;
        settled = true;
        cleanup();
        resolve(image);
      };
      const timeout = setTimeout(failed, 20000);
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', failed, { once: true });
      if (start) start();
      if (image.complete) image.naturalWidth ? loaded() : failed();
    });
  }

  function ensurePhoto(record, view, force = false) {
    if (!force && record.pending.has(view)) return record.pending.get(view);
    const existing = !force && record.images.get(view);
    const data = source(record, view);
    let image = existing;
    let start;
    if (!image) {
      image = new Image();
      image.className = record.image.className;
      for (const attr of ['width', 'height', 'sizes']) {
        if (record.image.hasAttribute(attr)) image.setAttribute(attr, record.image.getAttribute(attr));
      }
      image.alt = data.alt;
      image.decoding = 'async';
      image.dataset.folioImage = '';
      image.dataset.folioPhotoView = view;
      image.draggable = false;
      const stamp = force ? String(Date.now()) : null;
      start = () => {
        if (data.srcset) image.srcset = stamp ? data.srcset.split(',').map(candidate => {
          const [url, ...descriptor] = candidate.trim().split(/\s+/);
          return [freshURL(url, stamp), ...descriptor].join(' ');
        }).join(', ') : data.srcset;
        image.src = stamp ? freshURL(data.src, stamp) : data.src;
      };
    }
    image.loading = 'eager';
    image.fetchPriority = 'high';
    const request = waitForImage(image, start).then(loaded => {
      // A retry may replace this request while it is decoding. It must not
      // repopulate the cache with the superseded image.
      if (record.pending.get(view) === request) {
        record.images.set(view, loaded);
        record.pending.delete(view);
      }
      return loaded;
    }).catch(error => {
      if (record.pending.get(view) === request) {
        record.pending.delete(view);
        record.images.delete(view);
      }
      throw error;
    });
    record.pending.set(view, request);
    return request;
  }

  async function select(project, view = 'overview', options = {}) {
    if (!byKey.has(project)) return;
    const nextView = normalizeView(project, view);
    const changedProject = activeKey !== project;
    const changed = changedProject || activeView !== nextView;
    if (!changed && root.dataset.folioState === 'ready' && !options.retry) return;
    const token = ++revision;
    const record = byKey.get(project);
    activeKey = project;
    activeView = nextView;
    reflectSelection(changedProject && options.animate !== false);
    if (options.write !== false) writeLocation(options.write || 'push');
    const retryHadFocus = document.activeElement === retry;
    if (retryHadFocus) viewButtons.find(button => button.dataset.folioView === activeView)?.focus({ preventScroll: true });
    if (nextView === 'copper') {
      state('ready', options.announce !== false);
      return;
    }
    state('loading', options.announce !== false);
    record.article.dataset.folioPhotoState = 'loading';
    try {
      const image = await ensurePhoto(record, nextView, !!options.retry);
      if (token !== revision || activeKey !== project || activeView !== nextView) return;
      if (record.image !== image) record.image.replaceWith(image);
      record.image = image;
      record.renderedView = nextView;
      record.article.dataset.folioPhotoView = nextView;
      const photoCaption = record.article.querySelector('[data-folio-photo-caption]') ||
        record.article.querySelector('.v3-folio-card-bottom > span:first-child');
      if (photoCaption) photoCaption.textContent = source(record, nextView).caption;
      record.article.dataset.folioPhotoState = 'ready';
      state('ready', options.announce !== false);
    } catch (_) {
      if (token !== revision || activeKey !== project || activeView !== nextView) return;
      record.article.dataset.folioPhotoState = 'error';
      state('error', options.announce !== false);
      if (retryHadFocus) retry.focus({ preventScroll: true });
    }
  }

  function step(direction, options) {
    const index = records.findIndex(record => record.key === activeKey);
    const next = records[(index + direction + records.length) % records.length];
    select(next.key, 'overview', options);
    return next;
  }

  records.forEach(record => {
    record.button.addEventListener('click', () => {
      if (record.key !== activeKey) select(record.key);
      else root.dispatchEvent(new CustomEvent('v3:folio-inspect'));
    });
    record.tab?.addEventListener('click', () => {
      if (record.key !== activeKey) select(record.key);
    });
  });
  root.querySelector('[data-folio-prev]')?.addEventListener('click', () => step(-1));
  root.querySelector('[data-folio-next]')?.addEventListener('click', () => step(1));
  viewButtons.forEach(button => button.addEventListener('click', () => select(activeKey, button.dataset.folioView)));
  retry.addEventListener('click', () => select(activeKey, activeView, { retry: true, write: false }));
  root.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const control = event.target.closest('[data-folio-tab], [data-folio-select], [data-folio-prev], [data-folio-next]');
    if (!control) return;
    let target;
    if (event.key === 'ArrowLeft') target = step(-1);
    else if (event.key === 'ArrowRight') target = step(1);
    else if (event.key === 'Home') { target = records[0]; select(target.key); }
    else if (event.key === 'End') { target = records.at(-1); select(target.key); }
    else return;
    event.preventDefault();
    const focus = control.hasAttribute('data-folio-select') ? target.button : target.tab || target.button;
    focus.focus({ preventScroll: true });
  });

  function resetGesture() {
    const previous = gesture;
    gesture = null;
    root.removeAttribute('data-folio-dragging');
    deck.style.removeProperty('--folio-drag-x');
    if (previous && deck.hasPointerCapture?.(previous.id)) deck.releasePointerCapture(previous.id);
    return previous;
  }
  deck.addEventListener('dragstart', event => event.preventDefault());
  deck.addEventListener('pointerdown', event => {
    if (event.isPrimary === false) { resetGesture(); return; }
    if (event.button !== 0 || deck.inert || event.target.closest('a, input, textarea, select')) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, horizontal: false };
  });
  deck.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    gesture.dx = event.clientX - gesture.x;
    gesture.dy = event.clientY - gesture.y;
    const horizontal = Math.abs(gesture.dx);
    const vertical = Math.abs(gesture.dy);
    if (!gesture.horizontal) {
      if (vertical > 10 && vertical >= horizontal) { resetGesture(); return; }
      if (horizontal <= 10 || horizontal <= vertical * 1.25) return;
      gesture.horizontal = true;
      deck.setPointerCapture?.(event.pointerId);
      root.dataset.folioDragging = 'true';
    }
    if (event.cancelable) event.preventDefault();
    deck.style.setProperty('--folio-drag-x', `${Math.max(-130, Math.min(130, gesture.dx))}px`);
  }, { passive: false });
  deck.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const current = resetGesture();
    if (!current.horizontal) return;
    suppressClickUntil = performance.now() + 400;
    if (event.cancelable) event.preventDefault();
    if (Math.abs(current.dx) > 45 && Math.abs(current.dx) > Math.abs(current.dy) * 1.25) step(current.dx < 0 ? 1 : -1);
  });
  deck.addEventListener('pointercancel', event => {
    if (gesture?.id === event.pointerId) resetGesture();
  });
  deck.addEventListener('lostpointercapture', event => {
    if (gesture?.id === event.pointerId) resetGesture();
  });
  deck.addEventListener('click', event => {
    if (event.detail && performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('blur', resetGesture);
  window.addEventListener('popstate', () => {
    resetGesture();
    const locationState = readLocation();
    select(locationState.project, locationState.view, { write: false });
  });
  window.addEventListener('v3:folio-project', event => {
    if (byKey.has(event.detail?.project)) select(event.detail.project, event.detail.view || 'overview');
  });
  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) cancelTextMotion();
  });

  const initial = readLocation();
  // Initial setup does not create a synthetic Back entry or rewrite incoming
  // campaign/query/hash parameters. Only deliberate reader actions push history.
  select(initial.project, initial.view, { write: false, animate: false, announce: false });
  root.dataset.folioReady = 'true';
  emit('v3:folio-ready');
})();
