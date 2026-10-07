/* Match a few identified CAD parts to photographs of the assembled hardware. */
(() => {
  'use strict';
  if (!document.body.classList.contains('v2')) return;
  const photos = {
    'framework-dual-usb:U3': {
      src:'/assets/images/projects/framework-dual-hub-960.webp',
      alt:'Photograph of the CH334F hub soldered into the dual USB-C card.'
    },
    '/assets/models/hardware/skylabs-telemetry/assembly.json:U11': {
      src:'/assets/images/projects/skylabs-telemetry-macro-960.webp',
      alt:'Photograph of the HX711 strain interface on the assembled Skylabs telemetry board.'
    },
    'tramtrace:U3': {
      src:'/assets/images/projects/tramtrace-controller-960.webp',
      alt:'Photograph of the ESP32 module and surrounding circuitry on TramTrace.'
    }
  };
  const viewers = new WeakMap(), active = new Set();
  const navigation = [...document.querySelectorAll('.v2-header, .v2-case-nav')];
  let placementFrame = 0;
  const restorePlacement = state => {
    active.delete(state);
    state.panel.style.removeProperty('--v2-component-photo-top');
    state.panel.removeAttribute('data-component-photo-clipped');
  };
  const placePhotos = () => {
    placementFrame = 0;
    const safeTop = navigation.reduce((bottom, node) => {
      const rect = node.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight ? Math.max(bottom, rect.bottom) : bottom;
    }, 0);
    for (const state of active) {
      const {panel} = state, parent = panel.offsetParent;
      if (!parent || panel.hidden) { restorePlacement(state); continue; }
      const stage = panel.closest('.object-stage, .pcb-object-stage, .hardware-stage') || parent;
      const bounds = stage.getBoundingClientRect(), origin = parent.getBoundingClientRect().top + parent.clientTop - parent.scrollTop;
      const gap = parseFloat(getComputedStyle(panel).right) || 18;
      const normalTop = origin + gap, top = Math.max(normalTop, safeTop + gap);
      const bottom = Math.min(bounds.bottom - stage.clientTop, innerHeight) - gap;
      // Once too little of the board remains visible, keep the inset inside
      // its stage instead of letting it cover the navigation or next section.
      panel.toggleAttribute('data-component-photo-clipped', top + panel.offsetHeight > bottom);
      if (top > normalTop + .5) panel.style.setProperty('--v2-component-photo-top', (top - origin) + 'px');
      else panel.style.removeProperty('--v2-component-photo-top');
    }
  };
  const schedulePlacement = () => {
    if (active.size && !placementFrame) placementFrame = requestAnimationFrame(placePhotos);
  };
  addEventListener('scroll', schedulePlacement, {passive:true});
  addEventListener('resize', schedulePlacement, {passive:true});
  document.addEventListener('v2:component-identify', event => {
    const {model, ref, panel} = event.detail || {};
    const root = event.target;
    if (!panel || !root.contains(panel)) return;
    let state = viewers.get(root);
    if (!state) { state = {active:'', panel, entries:new Map()}; viewers.set(root, state); }
    const key = model + ':' + ref, photo = photos[key];
    const existing = state.entries.get(key);
    if (state.active === key && existing?.wrapper.parentNode === panel && !existing.wrapper.hidden) return;
    state.active = photo ? key : '';
    panel.classList.toggle('has-component-photo', Boolean(photo));
    for (const entry of state.entries.values()) entry.wrapper.hidden = true;
    if (!photo) { restorePlacement(state); return; }
    active.add(state); schedulePlacement();
    let entry = state.entries.get(key);
    if (!entry) {
      const wrapper = document.createElement('span');
      wrapper.className = 'v2-component-photo'; wrapper.hidden = true;
      const img = document.createElement('img');
      img.alt = photo.alt; img.width = 960; img.height = 640;
      img.decoding = 'async'; img.fetchPriority = 'low';
      entry = {wrapper, img, failed:false}; state.entries.set(key, entry);
      const reveal = () => {
        if (state.active !== key || !root.contains(panel)) return;
        if (!panel.contains(wrapper)) panel.append(wrapper);
        wrapper.hidden = false; wrapper.classList.add('is-ready'); schedulePlacement();
      };
      img.addEventListener('load', reveal, {once:true});
      img.addEventListener('error', () => {
        entry.failed = true; wrapper.hidden = true;
        if (state.active === key) { panel.classList.remove('has-component-photo'); restorePlacement(state); }
      }, {once:true});
      wrapper.append(img);
      // This is the first network request for the image: a matching part has
      // been selected. Other references keep their ordinary text readout.
      img.src = photo.src;
    }
    if (entry.failed) { panel.classList.remove('has-component-photo'); restorePlacement(state); return; }
    if (!panel.contains(entry.wrapper)) panel.append(entry.wrapper);
    if (entry.img.complete && entry.img.naturalWidth) {
      entry.wrapper.hidden = false; entry.wrapper.classList.add('is-ready');
    }
  });
})();
