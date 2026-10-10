(() => {
  'use strict';
  const root = document.querySelector('[data-aircraft-hero]');
  if (!root) return;
  const deferred = root.hasAttribute('data-aircraft-deferred');
  const detailed = root.hasAttribute('data-aircraft-detailed');
  const detailButtons = [...root.querySelectorAll('[data-aircraft-detail]')];
  const detailCaption = root.querySelector('[data-aircraft-detail-caption]');
  const detailNames = ['Film peels along the seam, then curls away.', 'Ribs, spars and control surfaces separate.', 'Battery, ESC, receiver and servos come into view.', 'Follow the power, motor and control connections.'];
  const stage = root.querySelector('[data-aircraft-stage]'), canvas = root.querySelector('canvas');
  const poster = root.querySelector('[data-aircraft-poster]'), skip = root.querySelector('[data-aircraft-skip]');
  const posterSources = [...root.querySelectorAll('[data-aircraft-picture] source')];
  const showPoster = pose => { posterSources.forEach(source => { source.srcset = source.dataset[pose]; }); poster.src = poster.dataset[pose]; };
  const chapters = [...root.querySelectorAll('[data-aircraft-chapter]')], links = [...root.querySelectorAll('[data-aircraft-go]')];
  const bar = root.querySelector('[data-aircraft-progress]'), ids = chapters.map(chapter => chapter.id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), short = matchMedia('(max-height:600px)');
  const allowed = () => !reduced.matches && !short.matches && !navigator.connection?.saveData;
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
  const scripts = window.V2HeroScripts ||= new Map();
  function script(url) {
    if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
      const element = document.createElement('script'); element.src = url; element.onload = resolve; element.onerror = reject; document.head.append(element);
    }));
    return scripts.get(url);
  }
  let renderer, scene, camera, flight, key, atmosphere, floorMaterial, groundUniforms, track, frame = 0, frameCount = 0;
  let ready = false, loading = false, telemetryLoading = false, failed = false, visible = !deferred, activePage = true, currentChapter = -1;
  let width = 1, height = 1, rootTop = 0, distance = 1, progress = 0, lastScroll = scrollY;
  let landingDone = false, landingElapsed = 0, previousTime = 0, capturePose;
  let landingEntered = !deferred;
  let shadowBox, boardBox, shadowCentre, corner, studioGround, airfieldGround, studioFog, airfieldFog;
  const request = () => { if (!frame && track && visible && activePage && !document.hidden && allowed()) frame = requestAnimationFrame(render); };
  function chapter(index) {
    if (currentChapter === index) return;
    currentChapter = index;
    chapters.forEach((item, itemIndex) => {
      const active = index === itemIndex;
      if (!active && item.contains(document.activeElement)) links[index].focus({ preventScroll: true });
      item.classList.toggle('is-current', active); item.inert = !active; item.setAttribute('aria-hidden', String(!active));
    });
    links.forEach((link, itemIndex) => itemIndex === index ? link.setAttribute('aria-current', 'step') : link.removeAttribute('aria-current'));
    root.dataset.aircraftChapter = String(index);
  }
  function endLanding() {
    if (landingDone) return;
    landingDone = true; landingElapsed = 5400; previousTime = 0;
    if (document.activeElement === skip) links[0].focus({ preventScroll: true });
    skip.hidden = true; request();
  }
  function enable() {
    if (track) return;
    track = document.createElement('div'); track.className = 'v3-aircraft-track'; track.setAttribute('aria-hidden', 'true');
    chapters.forEach((item, index) => {
      item.id = 'copy-' + ids[index];
      const step = document.createElement('div'); step.id = ids[index]; step.className = 'v3-aircraft-step'; track.append(step);
    });
    root.append(track); root.classList.add('is-story'); currentChapter = -1; chapter(0); layout();
    showPoster('approach');
    if (ids.includes(location.hash.slice(1))) {
      endLanding(); requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' }));
    }
  }
  function fallback(state = 'static') {
    const restore = track && scrollY > rootTop + 200 ? Math.max(currentChapter, 0) : -1;
    cancelAnimationFrame(frame); frame = 0; previousTime = 0; landingDone = true;
    root.classList.remove('is-story', 'is-ready'); track?.remove(); track = null; skip.hidden = true;
    chapters.forEach((item, index) => { item.id = ids[index]; item.classList.remove('is-current'); item.removeAttribute('aria-hidden'); item.inert = false; });
    links.forEach(link => link.removeAttribute('aria-current'));
    showPoster('stopped');
    root.dataset.aircraftState = state;
    if (restore >= 0) chapters[restore].scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  function updateScroll() {
    if (!track) return;
    if (deferred) {
      const bounds = root.getBoundingClientRect(), pinnedTop = parseFloat(getComputedStyle(stage).top) || 0;
      rootTop = scrollY + bounds.top;
      visible = bounds.top < innerHeight && bounds.bottom > pinnedTop;
    }
    const stageTop = stage.getBoundingClientRect().top;
    const pinnedTop = parseFloat(getComputedStyle(stage).top) || 0;
    const minimumCopyTop = parseFloat(getComputedStyle(root).getPropertyValue('--v3-aircraft-copy-min')) || 34;
    root.style.setProperty('--v3-aircraft-copy-top', `${Math.max(minimumCopyTop, pinnedTop - stageTop)}px`);
    const next = clamp((scrollY - rootTop) / distance);
    if (deferred && !landingEntered) {
      const bounds = stage.getBoundingClientRect(), pinnedTop = parseFloat(getComputedStyle(stage).top) || 0;
      landingEntered = bounds.top <= pinnedTop + height * .25 && bounds.bottom > pinnedTop;
    }
    if ((!deferred && Math.abs(scrollY - lastScroll) > 4) || next > .005) endLanding();
    lastScroll = scrollY; progress = next;
    const effective = flight && !flight.telemetryReady ? Math.min(progress, .61) : progress;
    chapter(effective < .25 ? 0 : effective < (detailed ? .80 : .70) ? 1 : 2);
    bar.style.transform = `scaleX(${progress})`; root.dataset.aircraftProgress = progress.toFixed(6); request();
  }
  function layout() {
    if (!track) return;
    width = stage.clientWidth; height = stage.clientHeight;
    distance = height * (width < 761 ? 3.7 : 3.1);
    track.style.height = `${distance + height}px`; track.style.marginTop = `${-height}px`;
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    // The story starts when its section reaches the document's scroll origin;
    // the sticky stage reserves the header band inside that section.
    [...track.children].forEach((step, index) => { step.style.top = `${[0, .38, 1][index] * distance + padding}px`; });
    rootTop = scrollY + root.getBoundingClientRect().top;
    renderer?.setSize(width, height, false); updateScroll();
  }
  function fitLight(focus) {
    const T = window.THREE;
    shadowBox.setFromObject(flight.group);
    if (flight.telemetryReady) {
      boardBox.setFromObject(flight.board);
      const amount = smooth((focus - .25) / .70);
      shadowBox.min.lerp(boardBox.min, amount); shadowBox.max.lerp(boardBox.max, amount);
    }
    const span = Math.max(...shadowBox.getSize(corner).toArray(), .07303), padding = span * .06;
    shadowBox.getCenter(shadowCentre);
    key.target.position.copy(shadowCentre); key.position.copy(shadowCentre).addScaledVector(key.userData.direction, Math.max(2, span * 4));
    key.target.updateMatrixWorld(); key.updateMatrixWorld();
    const view = key.shadow.camera; view.position.copy(key.position); view.lookAt(shadowCentre); view.updateMatrixWorld();
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, near = Infinity, far = -Infinity;
    for (let index = 0; index < 8; index++) {
      corner.set(index & 1 ? shadowBox.max.x : shadowBox.min.x, index & 2 ? shadowBox.max.y : shadowBox.min.y, index & 4 ? shadowBox.max.z : shadowBox.min.z).applyMatrix4(view.matrixWorldInverse);
      left = Math.min(left, corner.x); right = Math.max(right, corner.x); bottom = Math.min(bottom, corner.y); top = Math.max(top, corner.y);
      near = Math.min(near, -corner.z); far = Math.max(far, -corner.z);
    }
    view.left = left - padding; view.right = right + padding; view.bottom = bottom - padding; view.top = top + padding;
    view.near = Math.max(.01, near - padding); view.far = far + padding; view.updateProjectionMatrix();
    key.shadow.normalBias = span * .0007; key.shadow.bias = -.00015; renderer.shadowMap.needsUpdate = true;
  }
  function renderFrame() {
    renderer.clear();
    if (atmosphere?.opacity > 0) {
      renderer.render(atmosphere.scene, atmosphere.camera);
      renderer.clearDepth();
    }
    renderer.render(scene, camera);
  }
  function render(time) {
    frame = 0;
    if (!track || !visible || !activePage || document.hidden || !allowed() || !ready) { previousTime = 0; return; }
    try {
      if (!landingDone && landingEntered && !capturePose) {
        if (previousTime) landingElapsed += time - previousTime;
        previousTime = time;
        if (landingElapsed >= 5400) endLanding();
      }
      const effective = flight.telemetryReady ? progress : Math.min(progress, .61);
      const pose = capturePose?.type === 'landing' ? flight.setLanding(capturePose.value) : capturePose?.type === 'progress' ? flight.setProgress(capturePose.value) : !landingDone ? flight.setLanding(landingElapsed / 5400) : flight.setProgress(effective);
      const framing = flight.frame(camera, width, height); fitLight(framing.focus);
      const sky = atmosphere?.update({ landing: pose.landing, progress: pose.progress, width, height }) || 0;
      groundUniforms.sky.value = sky;
      groundUniforms.near.value = Math.max(3.5, framing.distance) * (width < 761 ? 1.08 : 1.28);
      groundUniforms.far.value = Math.max(3.5, framing.distance) * (width < 761 ? 1.48 : 2.6);
      if (floorMaterial.transparent !== (sky > 0)) { floorMaterial.transparent = sky > 0; floorMaterial.needsUpdate = true; }
      floorMaterial.color.copy(studioGround).lerp(airfieldGround, sky);
      scene.fog.color.copy(studioFog).lerp(airfieldFog, sky);
      root.dataset.aircraftAtmosphere = sky.toFixed(6);
      if (detailed) {
        const detail = pose.progress < .34 ? 0 : pose.progress < .49 ? 1 : pose.progress < .60 ? 2 : 3;
        detailButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === detail)));
        if (detailCaption && detailCaption.textContent !== detailNames[detail]) detailCaption.textContent = detailNames[detail];
        root.dataset.aircraftDetail = String(detail);
      }
      renderFrame();
      root.classList.add('is-ready'); root.dataset.aircraftState = landingDone || capturePose ? 'ready' : 'landing';
      root.dataset.aircraftPhase = pose.phase; root.dataset.aircraftLanding = pose.landing.toFixed(6);
      root.dataset.aircraftSeparated = String(pose.separated); root.dataset.aircraftFrames = String(++frameCount);
      root.dataset.aircraftAssemblyError = flight.assemblyError().toFixed(9);
      if (!landingDone && landingEntered && !capturePose) { skip.hidden = false; request(); }
    } catch (error) { fail(error); }
  }
  function fail(error) {
    failed = true; loading = false; fallback('unavailable'); atmosphere?.dispose(); renderer?.dispose();
    console.warn('The Skylabs story is showing its photographs.', error);
  }
  async function ensureTelemetry() {
    if (!flight || flight.telemetryReady || telemetryLoading || failed || !allowed()) return;
    telemetryLoading = true;
    try {
      if (!window.V2HeroAssets) await script('/assets/v2-hero-assets.js?v=startup-20261007');
      const telemetry = await window.V2HeroAssets.load('telemetry');
      if (failed) return;
      flight.attachTelemetry(telemetry); root.dataset.aircraftTelemetryReady = 'true';
      root.dataset.aircraftTelemetryComponents = String(flight.statistics.telemetryComponents); updateScroll(); request();
      if (new URLSearchParams(location.search).has('capture')) {
        window.__v3Aircraft = { scene, renderer, camera, flight, atmosphere, renderFrame,
          seekLanding(value) { endLanding(); capturePose = { type: 'landing', value }; chapter(0); request(); },
          seekProgress(value) { endLanding(); capturePose = { type: 'progress', value }; chapter(value < .25 ? 0 : value < (detailed ? .80 : .70) ? 1 : 2); request(); },
          resume() { capturePose = null; updateScroll(); request(); }
        };
      }
    } catch (error) { fail(error); }
    finally { telemetryLoading = false; }
  }
  async function initialize() {
    if (!allowed() || failed) return;
    enable();
    if (ready) { layout(); request(); ensureTelemetry(); return; }
    if (loading) return;
    loading = true; root.dataset.aircraftState = 'loading';
    try {
      await Promise.all([
        (async () => { if (!window.THREE) await script('/assets/vendor/three.min.js'); if (!window.THREE.GLTFLoader) await script('/assets/vendor/GLTFLoader.js'); })(),
        (async () => { if (!window.V3AircraftScene) await script('/assets/v3-aircraft-scene.js?v=aircraft-detail-20261010'); window.V3AircraftScene.prefetch().catch(() => {}); })(),
        (async () => { if (!window.V2HeroEnvironment) await script('/assets/v2-hero-environment.js?v=product-20261007'); window.V2HeroEnvironment.prefetch().catch(() => {}); })(),
        script('/assets/v3-aircraft-atmosphere.js?v=sky-20261008').catch(() => {}),
        detailed ? script('/assets/v3-aircraft-electronics.js?v=aircraft-detail-20261010') : Promise.resolve()
      ]);
      if (failed || !allowed()) { loading = false; return; }
      const T = window.THREE;
      renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.autoClear = false;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width < 761 ? 1.35 : 1.65));
      window.V2ProductStudio.configureRenderer(renderer, T); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
      scene = new T.Scene(); camera = new T.PerspectiveCamera(32, width / height, .002, 80);
      atmosphere = window.V3AircraftAtmosphere?.create(T);
      key = window.V2ProductStudio.createLights(T, scene).key;
      key.userData.direction.set(-3, 8, 5).normalize();
      const [aircraft, environment] = await Promise.all([window.V3AircraftScene.load(T), window.V2HeroEnvironment.load(T).catch(() => window.V2ProductStudio.createEnvironment(T, renderer).texture)]);
      if (failed) return;
      scene.environment = environment;
      flight = window.V3AircraftScene.create(T, aircraft, null, { detailed }); scene.add(flight.group);
      studioGround = new T.Color('#101210').convertSRGBToLinear();
      airfieldGround = new T.Color('#18232b').convertSRGBToLinear();
      studioFog = new T.Color('#101210'); airfieldFog = new T.Color('#25323e');
      groundUniforms = { sky: { value: 0 }, near: { value: 4.5 }, far: { value: 9 } };
      floorMaterial = new T.MeshBasicMaterial({ color: studioGround, toneMapped: false, transparent: true });
      floorMaterial.onBeforeCompile = shader => {
        shader.uniforms.uSky = groundUniforms.sky;
        shader.uniforms.uGroundNear = groundUniforms.near;
        shader.uniforms.uGroundFar = groundUniforms.far;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGroundDepth;').replace('#include <project_vertex>', '#include <project_vertex>\nvGroundDepth = -mvPosition.z;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGroundDepth; uniform float uSky; uniform float uGroundNear; uniform float uGroundFar;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= uSky > 0.0 ? 1.0 - smoothstep(uGroundNear, uGroundFar, vGroundDepth) : 1.0;');
      };
      const floorGeometry = new T.PlaneGeometry(100, 100);
      const floor = new T.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -.0007; scene.add(floor);
      const contactShadow = new T.Mesh(floorGeometry, new T.ShadowMaterial({ color: 0x000000, opacity: .35, transparent: true, depthWrite: false }));
      contactShadow.rotation.x = -Math.PI / 2; contactShadow.position.y = -.0005; contactShadow.receiveShadow = true; scene.add(contactShadow);
      // Three r128 blends fog after output encoding; this color therefore
      // matches the CSS background directly rather than being linearized.
      scene.fog = new T.Fog(studioFog.clone(), 9, 28);
      shadowBox = new T.Box3(); boardBox = new T.Box3(); shadowCentre = new T.Vector3(); corner = new T.Vector3();
      Object.entries(flight.statistics).forEach(([name, value]) => { root.dataset['aircraft' + name[0].toUpperCase() + name.slice(1)] = String(value); });
      ready = true; loading = false;
      if (!allowed()) { fallback(); return; }
      layout(); request();
      // The large airframe finishes transport before the small avionics pack
      // starts, leaving the first landing frame uncontested on a cold network.
      ensureTelemetry();
    } catch (error) { fail(error); }
  }
  detailButtons.forEach(button => button.addEventListener('click', () => {
    if (!track) return;
    endLanding(); capturePose = null;
    const amount = Number(button.dataset.aircraftDetail);
    scrollTo({ top: rootTop + distance * amount, behavior: reduced.matches ? 'instant' : 'smooth' });
  }));
  skip.addEventListener('click', endLanding);
  links.forEach((link, index) => {
    link.addEventListener('click', endLanding);
    link.addEventListener('keydown', event => {
      const target = event.key === 'ArrowRight' ? (index + 1) % links.length : event.key === 'ArrowLeft' ? (index + links.length - 1) % links.length : event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : null;
      if (target !== null) { event.preventDefault(); links[target].focus(); }
    });
  });
  const interruptLanding = () => { if (landingEntered) endLanding(); };
  root.addEventListener('wheel', interruptLanding, { passive: true });
  root.addEventListener('touchmove', interruptLanding, { passive: true });
  addEventListener('keydown', event => { if (['Escape', 'PageDown', 'ArrowDown', ' '].includes(event.key) && track && visible) interruptLanding(); });
  addEventListener('scroll', updateScroll, { passive: true }); addEventListener('resize', layout, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(stage);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { updateScroll(); request(); } else { if (landingEntered) endLanding(); cancelAnimationFrame(frame); frame = 0; previousTime = 0; }
  }).observe(root);
  document.addEventListener('visibilitychange', () => { previousTime = 0; if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else request(); });
  addEventListener('pagehide', () => { activePage = false; cancelAnimationFrame(frame); frame = 0; });
  addEventListener('pageshow', () => { activePage = true; previousTime = 0; updateScroll(); request(); });
  const storyLead = 420;
  const nearStory = () => { const bounds = root.getBoundingClientRect(); return bounds.top < innerHeight + storyLead && bounds.bottom > -storyLead; };
  const start = () => {
    if (failed) return;
    if (!allowed()) { fallback(); return; }
    // Reserve the scroll track immediately; only the lower feature's assets
    // wait for its viewport. This keeps the rest of the document stationary.
    enable();
    if (!deferred || nearStory()) initialize();
    else if (!ready && !loading) root.dataset.aircraftState = 'waiting';
  };
  if (deferred) {
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && allowed()) initialize();
    }, { rootMargin: `${storyLead}px 0px` }).observe(root);
    else addEventListener('scroll', () => { if (nearStory() && allowed()) initialize(); }, { passive: true });
    addEventListener('load', layout, { once: true });
  }
  const preference = start;
  reduced.addEventListener('change', preference); short.addEventListener('change', preference); navigator.connection?.addEventListener?.('change', preference);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('WebGL context unavailable')); });
  start();
})();
