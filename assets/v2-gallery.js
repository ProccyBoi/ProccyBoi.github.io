(() => {
  'use strict';

  const root = document.querySelector('[data-gallery]');
  if (!root || root.dataset.galleryReady) return;
  const stage = root.querySelector('[data-gallery-stage]');
  const media = root.querySelector('[data-gallery-media]');
  const projectList = root.querySelector('[data-gallery-projects]');
  const caption = root.querySelector('[data-gallery-caption]');
  const viewButtons = [...root.querySelectorAll('[data-gallery-view]')];
  const articles = [...root.querySelectorAll('[data-gallery-project]')];
  if (!stage || !media || !projectList || !caption || articles.length !== 3) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = !!navigator.connection?.saveData;
  const records = articles.map(article => ({
    key: article.dataset.galleryProject,
    name: article.dataset.galleryName,
    article,
    button: article.querySelector('[data-gallery-select]'),
    info: article.querySelector('.v2-gallery-info'),
    photo: article.querySelector('[data-gallery-photo]'),
    original: article.querySelector('[data-gallery-original]'),
    detail: null,
    detailPromise: null,
    error: false,
    errorPanel: null,
    view: 'overview'
  }));
  if (records.some(record => !record.button || !record.info || !record.photo || !record.original)) return;
  const byKey = new Map(records.map(record => [record.key, record]));
  const indicator = document.createElement('span');
  indicator.className = 'v2-gallery-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  let nearby = false;
  let pendingProject = null;
  let revision = 0;
  let activeKey = readLocation().project;
  let visibleKey = activeKey;
  let desiredView = readLocation().view;
  let currentAnimations = [];

  function readLocation() {
    const params = new URL(location.href).searchParams;
    const project = byKey.has(params.get('project')) ? params.get('project') : records[0].key;
    return { project, view: params.get('view') === 'detail' ? 'detail' : 'overview' };
  }

  function updateLocation() {
    const url = new URL(location.href);
    url.searchParams.set('project', activeKey);
    if (desiredView === 'detail') url.searchParams.set('view', 'detail');
    else url.searchParams.delete('view');
    try { history.replaceState(history.state, '', url); } catch (_) { /* Local previews can disallow history updates. */ }
  }

  function loadImage(image) {
    if (!image || image.hasAttribute('src') || !image.dataset.gallerySrc) return;
    if (image.dataset.gallerySrcset) image.srcset = image.dataset.gallerySrcset;
    image.src = image.dataset.gallerySrc;
  }

  function loadSelectorPhotos() {
    projectList.querySelectorAll('img[data-gallery-src]').forEach(loadImage);
  }

  function thumbnail(source, sizes) {
    const image = source.cloneNode(false);
    image.removeAttribute('data-gallery-original');
    image.removeAttribute('class');
    image.removeAttribute('hidden');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.sizes = sizes;
    image.setAttribute('aria-hidden', 'true');
    if (nearby) loadImage(image);
    return image;
  }

  records.forEach(record => {
    record.original.classList.add('v2-gallery-sheet', 'is-current');
    record.photo.dataset.view = 'overview';
    record.photo.hidden = record.key !== activeKey;
    record.photo.inert = record.key !== activeKey;
    media.append(record.photo);
    record.article.querySelector('.v2-gallery-static-title').hidden = true;
    record.button.hidden = false;
    record.button.querySelector('.v2-gallery-selector-thumb').append(thumbnail(record.original, '76px'));
  });
  projectList.append(indicator);
  stage.hidden = false;
  root.classList.add('is-enhanced');
  root.dataset.galleryReady = 'true';

  function positionIndicator() {
    const button = byKey.get(activeKey).button;
    const offset = button.getBoundingClientRect().top - projectList.getBoundingClientRect().top;
    indicator.style.transform = `translateY(${Math.round(offset + (button.offsetHeight - 42) / 2)}px)`;
  }

  function reflectSelection() {
    root.dataset.galleryActive = activeKey;
    records.forEach(record => {
      const active = record.key === activeKey;
      record.article.classList.toggle('is-active', active);
      record.button.setAttribute('aria-expanded', String(active));
      record.info.setAttribute('aria-hidden', String(!active));
      record.info.inert = !active;
    });
    positionIndicator();
  }

  function ready(image) {
    if (image.complete && image.naturalWidth) return Promise.resolve(image);
    return new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(image); };
      const fail = () => { cleanup(); reject(new Error('Photograph unavailable')); };
      const cleanup = () => {
        image.removeEventListener('load', done);
        image.removeEventListener('error', fail);
      };
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', fail, { once: true });
      if (image.complete) image.naturalWidth ? done() : fail();
    });
  }

  function ensureDetail(record) {
    if (record.detailPromise) return record.detailPromise;
    const image = new Image(960, 640);
    image.className = 'v2-gallery-sheet';
    image.alt = record.article.dataset.galleryDetailAlt;
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.hidden = true;
    image.sizes = record.original.sizes;
    const prefix = `/assets/images/projects/${record.article.dataset.galleryDetail}`;
    image.srcset = `${prefix}-960.webp 960w, ${prefix}-1920.webp 1920w`;
    image.src = `${prefix}-960.webp`;
    record.photo.querySelector('.v2-gallery-photo-link').append(image);
    record.detail = image;
    record.detailPromise = ready(image).then(() => {
      image.hidden = false;
      if (activeKey === record.key) reflectViews(record);
      return image;
    }).catch(error => {
      image.remove();
      record.detail = null;
      record.detailPromise = null;
      throw error;
    });
    return record.detailPromise;
  }

  function reflectViews(record) {
    root.dataset.galleryView = record.view;
    root.dataset.galleryState = record.error ? 'error' : 'ready';
    record.photo.dataset.view = record.view;
    record.original.classList.toggle('is-current', record.view === 'overview');
    record.detail?.classList.toggle('is-current', record.view === 'detail');
    record.original.setAttribute('aria-hidden', String(record.view !== 'overview'));
    record.detail?.setAttribute('aria-hidden', String(record.view !== 'detail'));
    const text = record.article.dataset[record.view === 'detail' ? 'galleryDetailCaption' : 'galleryOverviewCaption'];
    caption.textContent = `${record.name} — ${record.error ? 'Photograph unavailable' : text}`;
    viewButtons.forEach(button => {
      const view = button.dataset.galleryView;
      button.setAttribute('aria-label', `${record.name}: ${view === 'detail' ? 'detail photograph' : 'overview photograph'}`);
      button.setAttribute('aria-pressed', String(view === record.view));
      button.disabled = record.error;
      const source = record.error ? null : view === 'overview' ? record.original : record.detail;
      const previous = button.querySelector('img');
      if (source && (!previous || previous.dataset.project !== record.key || previous.src !== source.src)) {
        previous?.remove();
        const image = thumbnail(source, source.sizes);
        image.dataset.project = record.key;
        button.prepend(image);
      } else if (!source) previous?.remove();
      button.classList.toggle('has-photo', !!source);
    });
  }

  function showError(record) {
    record.error = true;
    record.photo.querySelector('.v2-gallery-photo-link').hidden = true;
    if (!record.errorPanel) {
      const panel = document.createElement('div');
      panel.className = 'v2-gallery-error';
      panel.dataset.galleryError = record.key;
      const message = document.createElement('p');
      message.textContent = `The ${record.name} photograph couldn’t be loaded.`;
      const actions = document.createElement('div');
      actions.className = 'v2-gallery-error-actions';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'v2-gallery-retry';
      retry.dataset.galleryRetry = record.key;
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => {
        const stamp = Date.now();
        const fresh = source => {
          const url = new URL(source, location.href);
          url.searchParams.set('gallery-retry', stamp);
          return url.href;
        };
        record.retryHadFocus = document.activeElement === retry;
        retry.disabled = true;
        record.original.srcset = record.original.srcset.split(',').map(candidate => {
          const [source, width] = candidate.trim().split(/\s+/);
          return `${fresh(source)} ${width}`;
        }).join(', ');
        record.original.src = fresh(record.original.src);
        select(record.key, 'overview');
      });
      const link = record.info.querySelector('a').cloneNode(true);
      actions.append(retry, link);
      panel.append(message, actions);
      record.photo.append(panel);
      record.errorPanel = panel;
    }
    record.errorPanel.hidden = false;
    const retry = record.errorPanel.querySelector('button');
    retry.disabled = false;
    if (record.retryHadFocus && document.activeElement === document.body) retry.focus({ preventScroll: true });
    record.retryHadFocus = false;
  }

  function clearError(record) {
    if (!record.error) return;
    record.error = false;
    if (record.errorPanel.contains(document.activeElement) || (record.retryHadFocus && document.activeElement === document.body)) {
      const overview = viewButtons.find(button => button.dataset.galleryView === 'overview');
      overview.disabled = false;
      overview.focus({ preventScroll: true });
    }
    record.retryHadFocus = false;
    record.errorPanel.hidden = true;
    record.photo.querySelector('.v2-gallery-photo-link').hidden = false;
    record.button.querySelector('.v2-gallery-selector-thumb').replaceChildren(thumbnail(record.original, '76px'));
  }

  function revealPhoto(record, animate) {
    currentAnimations.forEach(animation => animation.cancel());
    currentAnimations = [];
    const previous = byKey.get(visibleKey);
    const direction = records.indexOf(record) >= records.indexOf(previous) ? 1 : -1;
    records.forEach(item => {
      const shown = item === record || (animate && item === previous);
      item.photo.hidden = !shown;
      item.photo.inert = item !== record;
      item.photo.setAttribute('aria-hidden', String(item !== record));
    });
    visibleKey = record.key;
    if (!animate || previous === record || reducedMotion.matches || !record.photo.animate) {
      records.forEach(item => { item.photo.hidden = item !== record; });
      return;
    }
    const incoming = record.photo.animate([
      { opacity: 0, transform: `translateX(${direction * 32}px)` },
      { opacity: 1, transform: 'translateX(0)' }
    ], { duration: 440, easing: 'cubic-bezier(.22,.75,.2,1)' });
    const outgoing = previous.photo.animate([
      { opacity: 1, transform: 'translateX(0)' },
      { opacity: 0, transform: `translateX(${-direction * 20}px)` }
    ], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    currentAnimations = [incoming, outgoing];
    outgoing.finished.then(() => {
      if (visibleKey !== previous.key) previous.photo.hidden = true;
    }).catch(() => {});
  }

  async function select(project, view = 'overview', options = {}) {
    if (!byKey.has(project)) return;
    const record = byKey.get(project);
    const token = ++revision;
    activeKey = project;
    desiredView = view === 'detail' ? 'detail' : 'overview';
    reflectSelection();
    if (options.write !== false) updateLocation();
    if (!nearby) {
      record.view = 'overview';
      revealPhoto(record, false);
      reflectViews(record);
      return;
    }
    stage.setAttribute('aria-busy', 'true');
    root.dataset.galleryState = 'loading';
    loadSelectorPhotos();
    record.original.loading = 'eager';
    loadImage(record.original);
    let resolvedView = desiredView;
    const requestedView = desiredView;
    try {
      await ready(record.original);
    } catch (_) {
      if (token !== revision) return;
      record.view = 'overview';
      desiredView = 'overview';
      showError(record);
      reflectViews(record);
      revealPhoto(record, false);
      stage.removeAttribute('aria-busy');
      if (options.write !== false || requestedView !== desiredView) updateLocation();
      return;
    }
    if (token !== revision) return;
    clearError(record);
    let detailFailed = false;
    if (resolvedView === 'detail') {
      try { await ensureDetail(record); } catch (_) { resolvedView = 'overview'; detailFailed = true; }
    }
    if (token !== revision) return;
    record.view = resolvedView;
    desiredView = resolvedView;
    reflectViews(record);
    revealPhoto(record, options.animate !== false);
    stage.removeAttribute('aria-busy');
    if (options.write !== false || requestedView !== resolvedView) updateLocation();
    if (!saveData && !record.detail && !detailFailed) ensureDetail(record).catch(() => {});
  }

  records.forEach((record, index) => {
    record.button.addEventListener('click', () => { nearby = true; select(record.key); });
    record.button.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowDown') target = (index + 1) % records.length;
      if (event.key === 'ArrowUp') target = (index - 1 + records.length) % records.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = records.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      records[target].button.focus();
    });
  });
  viewButtons.forEach(button => button.addEventListener('click', () => {
    nearby = true;
    select(activeKey, button.dataset.galleryView);
  }));

  function approach() {
    nearby = true;
    const project = pendingProject || activeKey;
    const view = pendingProject ? 'overview' : desiredView;
    const write = !!pendingProject;
    pendingProject = null;
    select(project, view, { write, animate: false });
  }
  const smallerPhotos = [...root.querySelectorAll('.v2-gallery-more-photo')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      approach();
    }, { rootMargin: '240px 0px' });
    observer.observe(root);
    const photoObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.querySelectorAll('img[data-gallery-src]').forEach(loadImage);
      photoObserver.unobserve(entry.target);
    }), { rootMargin: '240px 0px' });
    smallerPhotos.forEach(photo => photoObserver.observe(photo));
  } else {
    root.addEventListener('pointerenter', approach, { once: true });
    root.addEventListener('focusin', approach, { once: true });
    const pending = new Set(smallerPhotos);
    const loadNearby = () => {
      if (!nearby) {
        const bounds = root.getBoundingClientRect();
        if (bounds.top < innerHeight + 240 && bounds.bottom > -240) approach();
      }
      pending.forEach(photo => {
        const bounds = photo.getBoundingClientRect();
        if (bounds.top >= innerHeight + 240 || bounds.bottom <= -240) return;
        photo.querySelectorAll('img[data-gallery-src]').forEach(loadImage);
        pending.delete(photo);
      });
      if (nearby && !pending.size) { removeEventListener('scroll', loadNearby); removeEventListener('resize', loadNearby); }
    };
    addEventListener('scroll', loadNearby, { passive: true });
    addEventListener('resize', loadNearby, { passive: true });
    loadNearby();
  }
  window.addEventListener('v2:gallery-project', event => {
    const project = event.detail?.project;
    if (!byKey.has(project)) return;
    if (nearby) select(project);
    else pendingProject = project;
  });
  window.addEventListener('popstate', () => {
    pendingProject = null;
    const state = readLocation();
    select(state.project, state.view, { write: false });
  });
  projectList.addEventListener('transitionend', event => {
    if (event.propertyName === 'grid-template-rows') positionIndicator();
  });
  if ('ResizeObserver' in window) new ResizeObserver(positionIndicator).observe(projectList);
  else window.addEventListener('resize', positionIndicator, { passive: true });
  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) revealPhoto(byKey.get(visibleKey), false);
  });
  reflectSelection();
  reflectViews(byKey.get(activeKey));
})();
