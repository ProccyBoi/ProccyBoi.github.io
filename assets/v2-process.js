/* A deterministic, scroll-scrubbed story using the real TramTrace fabrication
   layers. No autoplay loop, wheel interception, third-party runtime or scroll trap. */
(() => {
  'use strict';
  const root = document.querySelector('[data-v2-process]');
  if (!root) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 761px)');
  const tall = matchMedia('(min-height: 651px)');
  const motionEnabled = () => desktop.matches && tall.matches && !reduced.matches;
  const chapters = [...root.querySelectorAll('[data-process-chapter]')];
  const controls = root.querySelector('[data-process-controls]');
  const buttons = [...root.querySelectorAll('[data-process-select]')];
  const stack = root.querySelector('[data-process-stack]');
  const layers = [...root.querySelectorAll('[data-process-layer]')];
  const assembled = root.querySelector('[data-process-assembled]');
  const photo = root.querySelector('[data-process-photo]');
  const frame = root.querySelector('[data-process-frame]');
  const caption = root.querySelector('[data-process-caption]');
  const announcement = root.querySelector('[data-process-announcement]');
  const names = ['01 / COPPER & ROUTING', '02 / ASSEMBLED BOARD', '03 / LIVE OBJECT'];
  const captions = ['The actual copper, mask and silkscreen exports, separated to reveal the design.', 'The source-derived assembly: routing becomes a populated, readable object.', 'The finished PCB, photographed in use.'];
  const layerHeights = {back: -55, substrate: -28, copper: 0, mask: 71, silk: 143};
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  let visible = false;
  let raf = 0;
  let current = reduced.matches ? 2 : 0;
  let active = -1;
  let manual = null;
  let measurements = [];

  const render = value => {
    current = clamp(value, 0, 2);
    const join = smooth(current / .73);
    const populate = smooth((current - .73) / .27);
    const real = smooth(current - 1);
    const mobileDepth = desktop.matches ? clamp((innerHeight - 420) / 520, .48, 1) : .67;
    stack.style.transform = `translateY(${(10 - join * 2).toFixed(2)}px) rotateX(${(48 * (1 - join)).toFixed(2)}deg) rotateZ(${(-22 * (1 - join)).toFixed(2)}deg) scale(${(.87 + join * .13).toFixed(3)})`;
    stack.style.opacity = String(1 - populate);
    layers.forEach(layer => {
      const depth = layerHeights[layer.dataset.processLayer] * (1 - join) * mobileDepth;
      layer.style.transform = `translateZ(${depth.toFixed(2)}px)`;
      const label = layer.querySelector('span');
      if (label) label.style.opacity = String(1 - smooth(current * 1.5));
    });
    assembled.style.opacity = String(populate * (1 - real));
    assembled.style.transform = `translateY(8px) scale(${(.935 + .05 * real).toFixed(3)})`;
    photo.style.opacity = String(real);
    photo.style.transform = `translateY(${(22 * (1 - real)).toFixed(2)}px) scale(${(.93 + real * .07).toFixed(3)})`;
    const next = clamp(Math.round(current), 0, 2);
    if (next !== active) {
      active = next;
      root.dataset.processStage = String(next);
      frame.textContent = names[next];
      caption.textContent = captions[next];
      stack.setAttribute('aria-hidden', String(next !== 0));
      assembled.setAttribute('aria-hidden', String(next !== 1));
      photo.setAttribute('aria-hidden', String(next !== 2));
      buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === next)));
    }
  };

  const measure = () => {
    const pageY = scrollY;
    measurements = chapters.map(chapter => {
      const bounds = chapter.getBoundingClientRect();
      return bounds.top + pageY + bounds.height * .38;
    });
  };
  const scrollValue = () => {
    if (!measurements.length) return 0;
    const focus = scrollY + innerHeight * .52;
    if (focus <= measurements[0]) return 0;
    if (focus >= measurements[2]) return 2;
    const index = focus < measurements[1] ? 0 : 1;
    return index + (focus - measurements[index]) / Math.max(1, measurements[index + 1] - measurements[index]);
  };
  const tick = time => {
    raf = 0;
    if (!visible || document.hidden) return;
    if (manual) {
      if (manual.started === null) manual.started = time;
      const progress = clamp((time - manual.started) / 680);
      const eased = 1 - Math.pow(1 - progress, 3);
      render(manual.from + (manual.to - manual.from) * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else manual = null;
    } else if (motionEnabled()) render(scrollValue());
  };
  const request = () => { if (visible && !document.hidden && !raf) raf = requestAnimationFrame(tick); };
  const onScroll = () => {
    // A stage selection stays put until the reader scrolls again.
    if (!visible || document.hidden || !motionEnabled()) return;
    manual = null;
    request();
  };
  const select = index => {
    const target = clamp(index, 0, 2);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (reduced.matches || !visible) {
      manual = null;
      render(target);
    } else {
      manual = {from: current, to: target, started: null};
      request();
    }
    announcement.textContent = `${names[target].replace(' / ', ': ')}. ${captions[target]}`;
  };
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      buttons[next].focus();
      select(next);
    });
  });
  const configure = () => {
    manual = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    root.classList.toggle('is-motion', motionEnabled());
    measure();
    render(reduced.matches ? 2 : motionEnabled() ? scrollValue() : 0);
  };
  root.classList.add('is-enhanced');
  controls.hidden = false;
  configure();
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible) { measure(); request(); }
    else { if (raf) cancelAnimationFrame(raf); raf = 0; manual = null; }
  }, {rootMargin: '15% 0px'});
  observer.observe(root);
  addEventListener('scroll', onScroll, {passive: true});
  addEventListener('resize', () => { measure(); request(); }, {passive: true});
  addEventListener('load', () => { measure(); request(); }, {once: true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      manual = null;
    } else { measure(); request(); }
  });
  reduced.addEventListener('change', configure);
  desktop.addEventListener('change', configure);
  tall.addEventListener('change', configure);
})();
