/* A progressively enhanced, source-preserving photograph inspector for v3.
 * The existing gallery remains the sole owner of project/view selection. */
(() => {
  'use strict';

  const root = document.querySelector('[data-hardware-portfolio]') || document.querySelector('[data-folio]') || document.querySelector('[data-gallery]');
  if (!root || root.dataset.galleryInspectReady || !window.HTMLDialogElement ||
      typeof HTMLDialogElement.prototype.showModal !== 'function') return;

  const isHardware = root.hasAttribute('data-hardware-portfolio');
  const isFolio = root.hasAttribute('data-folio');
  const selection = () => isHardware ? root.dataset.project : isFolio ? root.dataset.folioActive : root.dataset.galleryActive;
  const currentView = () => isHardware ? root.dataset.view : isFolio ? root.dataset.folioView : root.dataset.galleryView;
  const currentState = () => isFolio ? root.dataset.folioState : root.dataset.galleryState;

  function setup() {
    if (root.dataset.galleryInspectReady) return true;
    // Metadata-backed hardware images do not depend on the 3D stage, WebGL,
    // its readiness flag, or preloaded hidden photographs.
    if (!isHardware && (isFolio ? root.dataset.folioReady : root.dataset.galleryReady) !== 'true') return false;
    const views = root.querySelector(isHardware ? '.inspection' : isFolio ? '[data-folio-views]' : '.v2-gallery-views');
    const viewButtons = [...(isHardware ? views?.querySelectorAll('button') || [] : root.querySelectorAll(isFolio ? 'button[data-folio-view]' : 'button[data-gallery-view]'))];
    if (!views || !viewButtons.length) return false;
    root.dataset.galleryInspectReady = 'true';
    if (isFolio) root.dataset.folioInspectReady = 'true';
    if (isHardware) root.dataset.hardwareInspectReady = 'true';

    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'v3-gallery-expand';
    expand.dataset.galleryExpand = '';
    if (isFolio) expand.dataset.folioExpand = '';
    if (isHardware) expand.dataset.hardwareExpand = '';
    expand.setAttribute('aria-haspopup', 'dialog');
    expand.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg><span>Expand photo</span>';
    if (isHardware) views.append(expand);
    else viewButtons.at(-1).after(expand);

    const dialog = document.createElement('dialog');
    dialog.className = 'v3-gallery-inspect';
    dialog.dataset.galleryInspect = '';
    dialog.setAttribute('aria-label', 'Expanded photograph');
    dialog.innerHTML = `
      <header class="v3-inspect-heading">
        <div><h2 data-inspect-title></h2><p data-inspect-caption></p></div>
        <button type="button" class="v3-inspect-close" data-inspect-close autofocus>Close <span aria-hidden="true">×</span></button>
      </header>
      ${isHardware ? `<div class="v3-inspect-photo-views" role="group" aria-label="Image view">
        <button type="button" data-inspect-photo-view="overview" aria-pressed="true">Overview</button>
        <button type="button" data-inspect-photo-view="detail" aria-pressed="false">Close-up</button>
      </div>` : ''}
      <div class="v3-inspect-stage" data-inspect-stage tabindex="0" role="group" aria-label="Photograph. Use plus and minus to zoom, arrow keys to pan, and Home to reset.">
        <div class="v3-inspect-message" data-inspect-message><p data-inspect-status role="status" aria-live="polite" aria-atomic="true"></p><button type="button" data-inspect-retry hidden>Try again</button></div>
      </div>
      <footer class="v3-inspect-footer">
        <p class="v3-inspect-hint" data-inspect-hint></p>
        <div class="v3-inspect-controls" aria-label="Photograph zoom">
          <button type="button" data-inspect-out aria-label="Zoom out" aria-keyshortcuts="-">−</button>
          <button type="button" class="v3-inspect-reset" data-inspect-reset aria-label="Reset photograph zoom" aria-keyshortcuts="Home 0">Reset <span data-inspect-zoom aria-hidden="true">1×</span></button>
          <button type="button" data-inspect-in aria-label="Zoom in" aria-keyshortcuts="+">+</button>
        </div>
        <span class="v3-inspect-sr" data-inspect-announcement role="status" aria-live="polite" aria-atomic="true"></span>
      </footer>`;
    document.body.append(dialog);
    const find = name => dialog.querySelector(`[data-inspect-${name}]`);
    const stage = find('stage');
    const close = find('close');
    const zoomIn = find('in');
    const zoomOut = find('out');
    const reset = find('reset');
    const retry = find('retry');
    const status = find('status');
    const message = find('message');
    const hint = find('hint');
    const announcement = find('announcement');
    const photoViewButtons = [...dialog.querySelectorAll('[data-inspect-photo-view]')];
    const pointers = new Map();
    let image = null;
    let selected = null;
    let selectedArticle = null;
    let opener = null;
    let unlock = null;
    let cancelLoad = () => {};
    let loadRevision = 0;
    let scale = 1;
    let x = 0;
    let y = 0;
    let fitWidth = 0;
    let fitHeight = 0;
    let gesture = null;
    let buttonTap = null;
    let announceTimer = 0;

    function hardwareArticle() {
      return [...root.querySelectorAll('[data-hardware-photo]')]
        .find(node => node.dataset.hardwarePhoto === selection());
    }

    function metadataPhoto(article, view) {
      if (!article) return null;
      const src = largestCandidate(article.dataset[`${view}Srcset`], article.dataset[`${view}Src`]);
      return src ? { src, alt: article.dataset[`${view}Alt`] || article.dataset.name || '' } : null;
    }

    function currentPhoto() {
      if (isHardware) {
        const article = hardwareArticle();
        const view = currentView() === 'controller' && metadataPhoto(article, 'detail') ? 'detail' : 'overview';
        const photo = metadataPhoto(article, view);
        return photo ? { article, photo, view } : null;
      }
      if (currentState() !== 'ready' || currentView() === 'copper') return null;
      const article = [...root.querySelectorAll(isFolio ? '[data-folio-card]' : '[data-gallery-project]')]
        .find(node => (isFolio ? node.dataset.folioCard : node.dataset.galleryProject) === selection());
      const photo = isFolio ? article?.querySelector('[data-folio-image]')
        : root.querySelector('.v2-gallery-photo:not([hidden]):not([inert]) img.is-current:not([hidden])');
      if (isFolio && photo?.dataset.folioPhotoView !== currentView()) return null;
      if (!article || !photo || !photo.complete || !photo.naturalWidth) return null;
      return { article, photo };
    }

    // Only use candidates supplied by the selected photograph; no path guessing.
    function largestCandidate(srcset, fallback) {
      const candidates = (srcset || '')
        .split(',').map(candidate => {
          const [url, descriptor = '1x'] = candidate.trim().split(/\s+/);
          const match = /^(\d+(?:\.\d+)?)(w|x)$/.exec(descriptor);
          return url && match ? { url, size: Number(match[1]) } : null;
        }).filter(Boolean).sort((a, b) => b.size - a.size);
      return candidates[0]?.url || fallback;
    }

    function largestSource(photo) {
      return largestCandidate(photo.getAttribute('srcset') || photo.dataset.gallerySrcset, photo.currentSrc || photo.src);
    }

    function reflectAvailability() {
      expand.disabled = !currentPhoto();
      if (isHardware) {
        const isRender = hardwareArticle()?.dataset.imageKind === 'render';
        const label = isRender ? 'Images' : 'Photos';
        if (expand.querySelector('span').textContent !== label) expand.querySelector('span').textContent = label;
        expand.setAttribute('aria-label', isRender ? 'Expand project images' : 'Expand project photographs');
      }
    }

    const mediaNoun = () => selected?.kind === 'render' ? 'image' : 'photograph';

    function selectPhoto(article, photo, view) {
      const name = isFolio || isHardware ? article.dataset.name : article.dataset.galleryName;
      selected = { src: isHardware ? photo.src : largestSource(photo), alt: photo.alt, kind: article.dataset.imageKind };
      selectedArticle = article;
      find('title').textContent = name;
      find('caption').textContent = article.dataset[isFolio || isHardware ? `${view}Caption` : view === 'detail' ? 'galleryDetailCaption' : 'galleryOverviewCaption'] || photo.alt;
      dialog.setAttribute('aria-label', `${name}: expanded ${view} ${mediaNoun()}`);
      stage.setAttribute('aria-label', `${mediaNoun() === 'image' ? 'Image' : 'Photograph'}. Use plus and minus to zoom, arrow keys to pan, and Home to reset.`);
      dialog.querySelector('.v3-inspect-controls').setAttribute('aria-label', `${mediaNoun() === 'image' ? 'Image' : 'Photograph'} zoom`);
      dialog.dataset.view = view;
      photoViewButtons.forEach(button => {
        button.hidden = !metadataPhoto(article, button.dataset.inspectPhotoView);
        button.setAttribute('aria-pressed', String(button.dataset.inspectPhotoView === view));
      });
    }

    function lockScroll() {
      const body = document.body;
      const html = document.documentElement;
      const scroll = { x: window.scrollX, y: window.scrollY };
      const props = ['position', 'top', 'left', 'right', 'width', 'overflow', 'padding-right'];
      const saved = props.map(prop => [prop, body.style.getPropertyValue(prop), body.style.getPropertyPriority(prop)]);
      const overflow = [html.style.getPropertyValue('overflow'), html.style.getPropertyPriority('overflow')];
      const scrollbar = window.innerWidth - html.clientWidth;
      const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.position = 'fixed';
      body.style.top = `${-scroll.y}px`;
      body.style.left = `${-scroll.x}px`;
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      if (scrollbar > 0) body.style.paddingRight = `${padding + scrollbar}px`;
      html.style.overflow = 'hidden';
      return () => {
        saved.forEach(([prop, value, priority]) => value ? body.style.setProperty(prop, value, priority) : body.style.removeProperty(prop));
        if (overflow[0]) html.style.setProperty('overflow', ...overflow);
        else html.style.removeProperty('overflow');
        window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
      };
    }

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function point(clientX, clientY) {
      const bounds = stage.getBoundingClientRect();
      return { x: clientX - bounds.left - bounds.width / 2, y: clientY - bounds.top - bounds.height / 2 };
    }

    function render(announce = false) {
      const maxX = Math.max(0, (fitWidth * scale - stage.clientWidth) / 2);
      const maxY = Math.max(0, (fitHeight * scale - stage.clientHeight) / 2);
      x = clamp(x, -maxX, maxX);
      y = clamp(y, -maxY, maxY);
      if (image) image.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
      dialog.dataset.zoom = String(Math.round(scale * 1000) / 1000);
      dialog.dataset.panX = String(Math.round(x));
      dialog.dataset.panY = String(Math.round(y));
      dialog.classList.toggle('is-zoomed', scale > 1);
      const ready = dialog.dataset.state === 'ready';
      zoomIn.disabled = !ready || scale >= 3;
      zoomOut.disabled = !ready || scale <= 1;
      reset.disabled = !ready;
      find('zoom').textContent = `${Number(scale.toFixed(1))}×`;
      reset.setAttribute('aria-label', `Reset ${mediaNoun()} zoom. Currently ${Math.round(scale * 100)} percent.`);
      if (announce) {
        clearTimeout(announceTimer);
        announceTimer = setTimeout(() => {
          if (dialog.open) announcement.textContent = `Zoom ${Math.round(scale * 100)} percent.`;
        }, 180);
      }
    }

    function fit() {
      if (!image?.naturalWidth || dialog.dataset.state !== 'ready') return;
      const ratio = Math.min(stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight);
      fitWidth = image.naturalWidth * ratio;
      fitHeight = image.naturalHeight * ratio;
      image.style.width = `${fitWidth}px`;
      image.style.height = `${fitHeight}px`;
      render();
    }

    function zoom(value, anchor = { x: 0, y: 0 }) {
      if (dialog.dataset.state !== 'ready') return;
      const next = clamp(value, 1, 3);
      const ratio = next / scale;
      x = anchor.x - (anchor.x - x) * ratio;
      y = anchor.y - (anchor.y - y) * ratio;
      scale = next;
      render(true);
    }

    function resetView() {
      scale = 1;
      x = 0;
      y = 0;
      render(true);
    }

    function load() {
      cancelLoad();
      clearTimeout(announceTimer);
      endGesture();
      const revision = ++loadRevision;
      image?.removeAttribute('src');
      image?.remove();
      image = new Image();
      image.dataset.inspectImage = '';
      image.className = 'v3-inspect-image';
      image.alt = selected.alt;
      image.draggable = false;
      image.decoding = 'async';
      image.loading = 'eager';
      image.hidden = true;
      stage.prepend(image);
      dialog.dataset.state = 'loading';
      stage.setAttribute('aria-busy', 'true');
      message.hidden = false;
      if (document.activeElement === retry) close.focus({ preventScroll: true });
      retry.hidden = true;
      status.textContent = `Loading ${mediaNoun()}…`;
      announcement.textContent = '';
      scale = 1;
      x = 0;
      y = 0;
      fitWidth = 0;
      fitHeight = 0;
      render();
      const loadingImage = image;
      let settled = false;
      const stillCurrent = () => revision === loadRevision && dialog.open;
      const cleanup = () => {
        clearTimeout(timeout);
        loadingImage.removeEventListener('load', loaded);
        loadingImage.removeEventListener('error', failed);
      };
      const failed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!stillCurrent()) return;
        dialog.dataset.state = 'error';
        stage.removeAttribute('aria-busy');
        status.textContent = `The full-size ${mediaNoun()} couldn’t be loaded.`;
        retry.hidden = false;
        render();
      };
      const loaded = async () => {
        try {
          if (loadingImage.decode) await loadingImage.decode();
          if (!loadingImage.naturalWidth) throw new Error('Empty photograph');
        } catch (_) { failed(); return; }
        if (settled) return;
        settled = true;
        cleanup();
        if (!stillCurrent()) return;
        dialog.dataset.state = 'ready';
        stage.removeAttribute('aria-busy');
        message.hidden = true;
        status.textContent = '';
        loadingImage.hidden = false;
        fit();
        announcement.textContent = `${mediaNoun() === 'image' ? 'Image' : 'Photograph'} ready. Use the zoom controls, or plus and minus keys. Drag or use arrow keys to pan when zoomed.`;
      };
      const timeout = setTimeout(failed, 20000);
      cancelLoad = cleanup;
      loadingImage.addEventListener('load', loaded, { once: true });
      loadingImage.addEventListener('error', failed, { once: true });
      loadingImage.src = selected.src;
    }

    function open() {
      if (dialog.open) return;
      const current = currentPhoto();
      if (!current) { reflectAvailability(); return; }
      // A native close event is queued. Finish its cleanup before a rapid reopen.
      if (unlock) end();
      const { article, photo } = current;
      const view = isHardware ? current.view : currentView() === 'detail' ? 'detail' : 'overview';
      selectPhoto(article, photo, view);
      dialog.dataset.project = selection();
      hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Pinch to zoom · Drag to pan' : 'Scroll to zoom · Drag to pan';
      opener = document.activeElement;
      unlock = lockScroll();
      try { dialog.showModal(); } catch (_) { unlock(); unlock = null; return; }
      close.focus({ preventScroll: true });
      load();
    }

    function endGesture() {
      for (const pointerId of pointers.keys()) {
        if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
      }
      pointers.clear();
      gesture = null;
      buttonTap = null;
      dialog.classList.remove('is-dragging');
    }

    function end() {
      ++loadRevision;
      cancelLoad();
      cancelLoad = () => {};
      clearTimeout(announceTimer);
      endGesture();
      image?.removeAttribute('src');
      image?.remove();
      image = null;
      unlock?.();
      unlock = null;
      if (opener?.isConnected && !opener.disabled) opener.focus({ preventScroll: true });
      opener = null;
    }

    function beginGesture() {
      const values = [...pointers.values()];
      if (!values.length) { gesture = null; return; }
      const first = values[0];
      const second = values[1];
      gesture = second ? {
        center: point((first.x + second.x) / 2, (first.y + second.y) / 2),
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        scale, x, y
      } : { first, scale, x, y };
    }

    // A browser can omit its compatibility click immediately after a pinch or
    // drag. Recognize only complete taps on these explicit controls. Preventing
    // touchend's default also prevents a second/retargeted click after dismissal.
    // Mouse, keyboard and assistive-technology clicks retain native activation.
    function activateButton(button, action) {
      button.addEventListener('click', action);
      button.addEventListener('touchstart', event => {
        if (button.disabled || event.touches.length !== 1 || event.changedTouches.length !== 1) return;
        const touch = event.changedTouches[0];
        buttonTap = { button, id: touch.identifier, x: touch.clientX, y: touch.clientY, valid: true };
      }, { passive: true });
      button.addEventListener('touchend', event => {
        if (buttonTap?.button !== button) return;
        const touch = [...event.changedTouches].find(item => item.identifier === buttonTap.id);
        if (!touch) return;
        const tap = buttonTap;
        buttonTap = null;
        // Also suppress a compatibility click for a cancelled button-origin
        // gesture, such as dragging away and returning before lifting a finger.
        if (!event.cancelable) return;
        event.preventDefault();
        if (!dialog.open || button.disabled || !tap.valid || event.touches.length ||
            event.changedTouches.length !== 1 || Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > 10) return;
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target && button.contains(target)) action();
      }, { passive: false });
    }
    dialog.addEventListener('touchstart', event => {
      if (buttonTap && event.touches.length !== 1) buttonTap.valid = false;
    }, { capture: true, passive: true });
    dialog.addEventListener('touchmove', event => {
      if (!buttonTap) return;
      const touch = [...event.touches].find(item => item.identifier === buttonTap.id);
      if (event.touches.length !== 1 || !touch || Math.hypot(touch.clientX - buttonTap.x, touch.clientY - buttonTap.y) > 10) buttonTap.valid = false;
    }, { capture: true, passive: true });
    dialog.addEventListener('touchcancel', () => { buttonTap = null; }, { passive: true });
    dialog.addEventListener('contextmenu', () => { if (buttonTap) buttonTap.valid = false; });

    expand.addEventListener('click', open);
    if (isFolio) root.addEventListener('v3:folio-inspect', open);
    if (isHardware) root.addEventListener('v3:hardware-inspect', open);
    activateButton(close, () => dialog.close());
    dialog.addEventListener('close', () => { if (!dialog.open) end(); });
    activateButton(retry, load);
    activateButton(zoomIn, () => zoom(scale + 0.5));
    activateButton(zoomOut, () => zoom(scale - 0.5));
    activateButton(reset, resetView);
    photoViewButtons.forEach(button => activateButton(button, () => {
      const view = button.dataset.inspectPhotoView;
      if (!dialog.open || view === dialog.dataset.view) return;
      const photo = metadataPhoto(selectedArticle, view);
      if (!photo) return;
      selectPhoto(selectedArticle, photo, view);
      load();
    }));

    dialog.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
          .filter(node => !node.hidden && node.getClientRects().length);
        const index = controls.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && (index === controls.length - 1 || index === -1)) { event.preventDefault(); controls[0]?.focus(); }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || dialog.dataset.state !== 'ready') return;
      const step = event.shiftKey ? 120 : 48;
      if (['+', '='].includes(event.key)) zoom(scale + 0.5);
      else if (['-', '_'].includes(event.key)) zoom(scale - 0.5);
      else if (['Home', '0'].includes(event.key)) resetView();
      else if (event.key === 'ArrowLeft') { x += step; render(); }
      else if (event.key === 'ArrowRight') { x -= step; render(); }
      else if (event.key === 'ArrowUp') { y += step; render(); }
      else if (event.key === 'ArrowDown') { y -= step; render(); }
      else return;
      event.preventDefault();
    });

    stage.addEventListener('wheel', event => {
      if (dialog.dataset.state !== 'ready' || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
      zoom(scale * Math.exp(-delta * 0.0015), point(event.clientX, event.clientY));
    }, { passive: false });
    stage.addEventListener('dblclick', event => {
      if (event.target.closest('button') || dialog.dataset.state !== 'ready') return;
      event.preventDefault();
      zoom(scale > 1 ? 1 : 2, point(event.clientX, event.clientY));
    });
    stage.addEventListener('pointerdown', event => {
      if (dialog.dataset.state !== 'ready' || event.button !== 0 || event.target.closest('button')) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.setPointerCapture(event.pointerId);
      stage.focus({ preventScroll: true });
      dialog.classList.add('is-dragging');
      beginGesture();
    });
    stage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const [first, second] = [...pointers.values()];
      if (second && gesture?.center) {
        const center = point((first.x + second.x) / 2, (first.y + second.y) / 2);
        scale = clamp(gesture.scale * Math.hypot(second.x - first.x, second.y - first.y) / gesture.distance, 1, 3);
        x = center.x - (gesture.center.x - gesture.x) * (scale / gesture.scale);
        y = center.y - (gesture.center.y - gesture.y) * (scale / gesture.scale);
      } else if (gesture?.first) {
        x = gesture.x + first.x - gesture.first.x;
        y = gesture.y + first.y - gesture.first.y;
      }
      render(!!second);
    });
    function release(event) {
      if (!pointers.delete(event.pointerId)) return;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      beginGesture();
      dialog.classList.toggle('is-dragging', pointers.size > 0);
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('lostpointercapture', release);
    window.addEventListener('pagehide', () => {
      // A back-forward cache restore must never retain a fixed, locked body.
      if (dialog.open) dialog.close();
      if (unlock) end();
    });

    if ('ResizeObserver' in window) new ResizeObserver(() => { if (dialog.open) { fit(); beginGesture(); } }).observe(stage);
    else window.addEventListener('resize', () => { if (dialog.open) { fit(); beginGesture(); } }, { passive: true });
    // Gallery mutations describe the selection; the inspector never changes it.
    new MutationObserver(reflectAvailability).observe(root, {
      subtree: true, attributes: true, childList: isHardware,
      attributeFilter: ['data-gallery-state', 'data-gallery-active', 'data-gallery-view', 'data-folio-state', 'data-folio-active', 'data-folio-view', 'data-project', 'data-view', 'data-overview-src', 'data-overview-srcset', 'data-detail-src', 'data-detail-srcset', 'data-image-kind', 'hidden', 'inert']
    });
    root.addEventListener('load', reflectAvailability, true);
    root.addEventListener('error', reflectAvailability, true);
    reflectAvailability();
    return true;
  }

  if (!setup()) {
    const ready = new MutationObserver(() => { if (setup()) ready.disconnect(); });
    ready.observe(root, { attributes: true, childList: isHardware, subtree: isHardware, attributeFilter: ['data-gallery-ready', 'data-folio-ready', 'data-hardware-ready'] });
  }
})();
