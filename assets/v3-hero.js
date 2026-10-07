(() => {
  'use strict';
  const root = document.querySelector('[data-v3-hero]');
  if (!root) return;
  const stage = root.querySelector('[data-v3-stage]');
  const visual = root.querySelector('[data-v3-visual]');
  const canvas = root.querySelector('[data-v3-canvas]');
  const product = root.querySelector('[data-v3-product-photo]');
  const progressBar = root.querySelector('[data-v3-progress]');
  const chapters = [...root.querySelectorAll('[data-v3-chapter]')];
  const navigation = [...root.querySelectorAll('[data-v3-go]')];
  if (!stage || !canvas || !visual || chapters.length !== 5) return;
  const ids = chapters.map(chapter => chapter.id);
  const points = [0, .22, .44, .615, 1];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const shortScreen = matchMedia('(max-height:640px)');
  const connection = navigator.connection;
  const allowed = () => !reduced.matches && !connection?.saveData && !shortScreen.matches;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
  const scripts = new Map();
  const loadScript = source => {
    if (!scripts.has(source)) scripts.set(source, new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = source;
      script.onload = resolve; script.onerror = reject; document.head.append(script);
    }));
    return scripts.get(source);
  };
  let track, frame = 0, frames = 0, visible = true, activePage = true;
  let renderer, scene, camera, model, manufacturing, key, environment;
  let ready = false, loading = false, failed = false, progress = 0, currentChapter = -1;
  let width = 1, height = 1, scrollDistance = 1, rootTop = 0, productReady = false;
  let pose, centre, shadowBox, shadowCorner, shadowCentre;
  const request = () => { if (!frame && root.classList.contains('is-story') && visible && activePage && !document.hidden) frame = requestAnimationFrame(render); };

  function setChapter(index) {
    if (index === currentChapter) return;
    currentChapter = index;
    chapters.forEach((chapter, item) => {
      const active = item === index;
      if (!active && chapter.contains(document.activeElement)) navigation[index >= 4 ? 2 : index >= 3 ? 1 : 0].focus({ preventScroll: true });
      chapter.classList.toggle('is-current', active);
      chapter.setAttribute('aria-hidden', String(!active));
      chapter.inert = !active;
    });
    const navIndex = index >= 4 ? 2 : index >= 3 ? 1 : 0;
    navigation.forEach((link, item) => {
      if (item === navIndex) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    root.dataset.v3Chapter = String(index);
  }

  function enableStory() {
    if (track) return;
    track = document.createElement('div'); track.className = 'v3-scroll-track'; track.setAttribute('aria-hidden', 'true');
    chapters.forEach((chapter, index) => {
      chapter.id = 'copy-' + ids[index];
      const step = document.createElement('div'); step.id = ids[index]; step.className = 'v3-scroll-step';
      track.append(step);
    });
    root.append(track); root.classList.add('is-story');
    currentChapter = -1; setChapter(0); layout();
    const hash = location.hash.slice(1);
    if (ids.includes(hash)) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  }

  function staticStory(state = 'static') {
    const restoreChapter = track && scrollY > rootTop + 300 ? Math.max(0, currentChapter) : -1;
    cancelAnimationFrame(frame); frame = 0;
    root.classList.remove('is-story', 'is-ready', 'is-product');
    track?.remove(); track = null;
    chapters.forEach((chapter, index) => {
      chapter.id = ids[index]; chapter.classList.remove('is-current'); chapter.removeAttribute('aria-hidden'); chapter.inert = false;
    });
    navigation.forEach(link => link.removeAttribute('aria-current'));
    product.hidden = true;
    root.dataset.v3HeroState = state;
    root.dataset.v3StoryView = 'poster';
    if (restoreChapter >= 0) chapters[restoreChapter].scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  function updateScroll() {
    if (!track) return;
    progress = clamp((scrollY - rootTop) / scrollDistance);
    setChapter(progress < .13 ? 0 : progress < .36 ? 1 : progress < .545 ? 2 : progress < .91 ? 3 : 4);
    progressBar.style.transform = `scaleX(${progress})`;
    root.dataset.v3Progress = progress.toFixed(6);
    if (progress > .80 && !product.hasAttribute('src')) {
      product.loading = 'eager'; product.decoding = 'async'; product.fetchPriority = 'low';
      product.addEventListener('load', () => { productReady = true; request(); }, { once: true });
      product.src = innerWidth < 760 ? product.dataset.productSrc.replace('-1920.', '-960.') : product.dataset.productSrc;
    }
    request();
  }

  function layout() {
    if (!track) return;
    const viewportHeight = stage.clientHeight;
    scrollDistance = viewportHeight * (innerWidth < 761 ? 4.6 : 4);
    track.style.height = `${scrollDistance + viewportHeight}px`;
    track.style.marginTop = `${-viewportHeight}px`;
    // Native fragment navigation applies the page's sticky-header padding.
    // Compensate the invisible anchor, keeping each destination at its phase.
    const scrollPadding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    [...track.children].forEach((step, index) => { step.style.top = `${points[index] * scrollDistance + scrollPadding}px`; });
    rootTop = scrollY + root.getBoundingClientRect().top;
    const bounds = visual.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    renderer?.setSize(width, height, false);
    updateScroll();
  }

  function fitLight() {
    // The fixed bounds include the full registered board and the highest
    // placement approach, so shadows never crop during a component's descent.
    shadowBox.setFromObject(model.group);
    shadowBox.min.y = Math.min(shadowBox.min.y, -.04);
    shadowBox.max.y = Math.max(shadowBox.max.y, .28);
    shadowBox.getCenter(shadowCentre);
    key.target.position.copy(shadowCentre);
    key.position.copy(shadowCentre).addScaledVector(key.userData.direction, 4);
    key.target.updateMatrixWorld(); key.updateMatrixWorld();
    const view = key.shadow.camera; view.position.copy(key.position); view.lookAt(shadowCentre); view.updateMatrixWorld();
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, near = Infinity, far = -Infinity;
    for (let index = 0; index < 8; index++) {
      shadowCorner.set(index & 1 ? shadowBox.max.x : shadowBox.min.x, index & 2 ? shadowBox.max.y : shadowBox.min.y, index & 4 ? shadowBox.max.z : shadowBox.min.z).applyMatrix4(view.matrixWorldInverse);
      left = Math.min(left, shadowCorner.x); right = Math.max(right, shadowCorner.x);
      bottom = Math.min(bottom, shadowCorner.y); top = Math.max(top, shadowCorner.y);
      near = Math.min(near, -shadowCorner.z); far = Math.max(far, -shadowCorner.z);
    }
    view.left = left - .05; view.right = right + .05; view.bottom = bottom - .05; view.top = top + .05;
    view.near = Math.max(.1, near - .2); view.far = far + .2; view.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  function cameraPose() {
    const mobile = innerWidth < 761;
    const rise = smooth(progress / .42), finish = smooth((progress - .84) / .09);
    camera.position.set(.08 * (1 - rise), 1.25 + .9 * rise + .2 * finish, 1.6 - .65 * rise - .5 * finish);
    centre.set(0, .015, 0); camera.lookAt(centre);
    model.group.rotation.y = (mobile ? -.38 : -.15) + .17 * rise - .08 * finish;
    const aspect = width / height;
    const half = Math.max(.36, .59 / aspect);
    const verticalOffset = mobile ? half * .31 : half * -.025;
    camera.left = -half * aspect; camera.right = half * aspect;
    camera.top = half + verticalOffset; camera.bottom = -half + verticalOffset;
    camera.updateProjectionMatrix(); model.group.updateMatrixWorld(true);
  }

  function render() {
    frame = 0;
    if (!track || !visible || !activePage || document.hidden || !allowed()) return;
    const showPhoto = productReady && progress >= .965;
    product.hidden = !showPhoto;
    root.classList.toggle('is-product', showPhoto);
    root.dataset.v3StoryView = showPhoto ? 'photo' : ready ? 'cad' : 'poster';
    if (!ready) return;
    try {
      pose = manufacturing.update(progress);
      cameraPose(); fitLight(); renderer.render(scene, camera);
      frames++; root.dataset.v3Frames = String(frames);
      root.dataset.v3Phase = pose.stage;
      root.dataset.v3Placed = String(pose.placed);
      root.dataset.v3Arriving = String(pose.arriving);
      root.dataset.v3FinalError = manufacturing.finalError().toFixed(9);
      root.classList.add('is-ready');
      root.dataset.v3HeroState = 'ready';
    } catch (error) { fail(error); }
  }

  function fail(error) {
    failed = true; loading = false;
    staticStory('unavailable');
    renderer?.dispose();
    console.warn('The TramTrace story is showing its static photographs.', error);
  }

  async function initialize() {
    if (!allowed() || failed) return;
    enableStory();
    if (ready) { layout(); request(); return; }
    if (loading) return;
    loading = true; root.dataset.v3HeroState = 'loading';
    try {
      const [metadata] = await Promise.all([
        fetch('/assets/models/manufacturing/tramtrace/manufacturing.json').then(response => {
          if (!response.ok) throw new Error('Manufacturing registration unavailable');
          return response.json();
        }),
        window.THREE ? Promise.resolve() : loadScript('/assets/vendor/three.min.js'),
        (async () => { if (!window.V2HeroAssets) await loadScript('/assets/v2-hero-assets.js?v=startup-20261007'); window.V2HeroAssets.prefetch('tramtrace').catch(() => {}); })(),
        (async () => { if (!window.V2HeroEnvironment) await loadScript('/assets/v2-hero-environment.js?v=product-20261007'); window.V2HeroEnvironment.prefetch().catch(() => {}); })(),
        (async () => { if (!window.V3Manufacturing) await loadScript('/assets/v3-manufacturing.js?v=manufacturing-20261007'); window.V3Manufacturing.prefetch().catch(() => {}); })()
      ]);
      if (failed) return;
      if (!allowed()) { loading = false; staticStory(); return; }
      const T = window.THREE;
      renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 761 ? 1.5 : 1.75));
      window.V2ProductStudio.configureRenderer(renderer, T);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
      scene = new T.Scene(); camera = new T.OrthographicCamera(-1, 1, .7, -.7, .1, 12);
      key = window.V2ProductStudio.createLights(T, scene).key;
      key.shadow.normalBias = .0007; key.shadow.bias = -.00015;
      centre = new T.Vector3(); shadowBox = new T.Box3(); shadowCorner = new T.Vector3(); shadowCentre = new T.Vector3();
      [model, environment] = await Promise.all([
        window.V2HeroAssets.load('tramtrace'),
        window.V2HeroEnvironment.load(T).catch(() => window.V2ProductStudio.createEnvironment(T, renderer).texture)
      ]);
      if (failed) return;
      scene.environment = environment;
      window.V2ProductStudio.applyMaterials(model, 'tramtrace', T);
      manufacturing = await window.V3Manufacturing.create(T, model, metadata);
      if (failed) return;
      scene.add(model.group);
      const ground = new T.Mesh(new T.PlaneGeometry(4, 4), new T.ShadowMaterial({ color: 0x000000, opacity: .32, transparent: true, depthWrite: false }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -.027; ground.receiveShadow = true; scene.add(ground);
      Object.entries(manufacturing.statistics).forEach(([key, value]) => { root.dataset['v3' + key[0].toUpperCase() + key.slice(1)] = String(value); });
      ready = true; loading = false;
      if (!allowed()) { staticStory(); return; }
      layout(); request();
    } catch (error) { fail(error); }
  }

  navigation.forEach((link, index) => link.addEventListener('keydown', event => {
    const target = event.key === 'ArrowRight' ? (index + 1) % navigation.length : event.key === 'ArrowLeft' ? (index + navigation.length - 1) % navigation.length : event.key === 'Home' ? 0 : event.key === 'End' ? navigation.length - 1 : null;
    if (target === null) return;
    event.preventDefault(); navigation[target].focus();
  }));
  addEventListener('scroll', updateScroll, { passive: true });
  addEventListener('resize', layout, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(visual);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) request(); else { cancelAnimationFrame(frame); frame = 0; }
  }).observe(root);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else request(); });
  addEventListener('pagehide', () => { activePage = false; cancelAnimationFrame(frame); frame = 0; });
  addEventListener('pageshow', () => { activePage = true; updateScroll(); request(); });
  const preference = () => allowed() ? initialize() : staticStory();
  reduced.addEventListener('change', preference); shortScreen.addEventListener('change', preference); connection?.addEventListener?.('change', preference);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('WebGL context unavailable')); });
  if (allowed()) initialize(); else staticStory();
})();
