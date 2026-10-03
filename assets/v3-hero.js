(() => {
  'use strict';

  const root = document.querySelector('[data-v3-hero]');
  if (!root) return;
  const canvas = root.querySelector('[data-v3-canvas]');
  const poster = root.querySelector('[data-v3-poster]');
  const button = root.querySelector('[data-v3-assemble]');
  const partLabel = root.querySelector('[data-v3-part]');
  if (!canvas || !button) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const smooth = value => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };
  const scripts = new Map();
  const loadScript = source => {
    if (!scripts.has(source)) scripts.set(source, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source; script.onload = resolve; script.onerror = reject;
      document.head.append(script);
    }));
    return scripts.get(source);
  };

  let renderer, scene, camera, model, lighting, key, ground, raycaster;
  let box, corner, centre, projected, pointer, frames = 0;
  let loading = false, ready = false, painted = false, failed = false, visible = true, pageActive = true;
  let frame = 0, width = 0, height = 0, baseExtent = 1.34, previousTime = 0, entry = 0;
  let phase = 0, targetPhase = 0, pitch = 1.08, yaw = -.28;
  let currentPitch = pitch, currentYaw = yaw, tiltX = 0, tiltY = 0, currentTiltX = 0, currentTiltY = 0;
  let pointerInside = false, pickDirty = false, drag = null, keyboardPart = -1, focusDot;
  const pickables = [], partForMesh = new WeakMap(), anchors = [];
  const motionAllowed = () => !reduced.matches;
  const autoAllowed = () => motionAllowed() && !connection?.saveData;
  const active = () => visible && pageActive && !document.hidden;

  root.dataset.v3HeroState = autoAllowed() ? 'poster' : 'static';
  root.classList.toggle('is-static', !autoAllowed());
  button.hidden = false;
  canvas.tabIndex = -1;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('aria-label', 'Skylabs telemetry assembly. Drag or use arrow keys to rotate. Home resets the view. Left and right brackets identify components. Use the Disassemble button to separate the parts.');
  button.setAttribute('aria-pressed', 'false');
  if (!autoAllowed()) button.textContent = 'Explore in 3D';

  function showPart(part) {
    if (!partLabel) return;
    const description = part ? `${part.ref} · ${String(part.value).replaceAll('_', ' ')}` : '';
    if (partLabel.textContent !== description) partLabel.textContent = description;
    partLabel.classList.toggle('is-visible', Boolean(part));
  }

  function fitShadow() {
    box.setFromObject(model.group);
    // Keep the paper receiver close enough to feel grounded, including when
    // underside parts separate. It always remains behind the complete model.
    ground.position.z = box.min.z - .045;
    const aspect = width / height;
    const halfExtent = Math.max(baseExtent / 2, Math.abs(box.min.y) + .045, Math.abs(box.max.y) + .045, (Math.abs(box.min.x) + .045) / aspect, (Math.abs(box.max.x) + .045) / aspect);
    if (Math.abs(camera.top - halfExtent) > .00001) {
      camera.top = halfExtent; camera.bottom = -halfExtent;
      camera.right = halfExtent * aspect; camera.left = -halfExtent * aspect;
      camera.updateProjectionMatrix();
    }
    box.getCenter(centre);
    key.target.position.copy(centre);
    key.position.copy(centre).addScaledVector(key.userData.direction, 5);
    key.target.updateMatrixWorld(); key.updateMatrixWorld();
    const view = key.shadow.camera;
    view.position.copy(key.position); view.lookAt(centre); view.updateMatrixWorld();
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, near = Infinity, far = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(view.matrixWorldInverse);
      left = Math.min(left, corner.x); right = Math.max(right, corner.x);
      bottom = Math.min(bottom, corner.y); top = Math.max(top, corner.y);
      near = Math.min(near, -corner.z); far = Math.max(far, -corner.z);
    }
    view.left = left - .22; view.right = right + .22;
    view.bottom = bottom - .22; view.top = top + .22;
    view.near = Math.max(.1, near - 1); view.far = far + 1.5;
    view.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  function updateAnnotations() {
    for (const anchor of anchors) {
      anchor.part.object.getWorldPosition(projected).project(camera);
      const bounds = anchor.svg.viewBox.baseVal;
      const x = bounds.x + (projected.x + 1) * bounds.width / 2;
      const y = bounds.y + (1 - projected.y) * bounds.height / 2;
      anchor.line.setAttribute('x2', x.toFixed(2)); anchor.line.setAttribute('y2', y.toFixed(2));
      if (anchor.dot) { anchor.dot.setAttribute('cx', x.toFixed(2)); anchor.dot.setAttribute('cy', y.toFixed(2)); }
    }
    if (focusDot) {
      focusDot.style.display = keyboardPart < 0 ? 'none' : '';
      if (keyboardPart >= 0) {
        model.parts[keyboardPart].object.getWorldPosition(projected).project(camera);
        const bounds = focusDot.ownerSVGElement.viewBox.baseVal;
        focusDot.setAttribute('cx', (bounds.x + (projected.x + 1) * bounds.width / 2).toFixed(2));
        focusDot.setAttribute('cy', (bounds.y + (1 - projected.y) * bounds.height / 2).toFixed(2));
      }
    }
  }

  function pick() {
    pickDirty = false;
    if (!pointerInside || drag?.moving) { showPart(null); return; }
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    showPart(hit ? partForMesh.get(hit.object) : null);
  }

  function render(now) {
    try { renderFrame(now); }
    catch (error) { fail(); }
  }

  function renderFrame(now) {
    frame = 0;
    if (!ready || !active()) return;
    const moving = motionAllowed();
    const dt = previousTime ? Math.min(now - previousTime, 48) : 16.7;
    previousTime = now;
    const blend = moving ? 1 - Math.exp(-dt / 125) : 1;
    phase += (targetPhase - phase) * blend;
    currentPitch += (pitch - currentPitch) * blend;
    currentYaw += (yaw - currentYaw) * blend;
    currentTiltX += (tiltX - currentTiltX) * blend;
    currentTiltY += (tiltY - currentTiltY) * blend;
    if (Math.abs(targetPhase - phase) < .0001) phase = targetPhase;
    const entrance = moving && entry ? smooth((now - entry) / 1050) : 1;
    model.group.rotation.set(currentPitch + currentTiltY, currentYaw + currentTiltX, -.18 + (1 - entrance) * .045);
    model.group.position.set(0, .02 - phase * .11 - (1 - entrance) * .045, 0);
    window.V2HeroMotion.apply(model.parts, phase);
    model.group.updateMatrixWorld(true);
    fitShadow();
    ground.material.opacity = .10 - phase * .02;
    renderer.render(scene, camera);
    if (!painted) {
      painted = true;
      root.classList.remove('is-loading'); root.classList.add('is-ready');
      root.dataset.v3HeroState = 'ready';
      canvas.tabIndex = 0; canvas.removeAttribute('aria-hidden');
      poster?.setAttribute('aria-hidden', 'true');
    }
    updateAnnotations();
    // The board can still settle under a stationary pointer after input stops.
    if (pointerInside || pickDirty || drag?.moving) pick();
    root.dataset.v3HeroFrames = String(++frames);
    root.dataset.v3HeroPhase = phase.toFixed(4);
    root.dataset.v3HeroDraws = String(renderer.info.render.calls);
    if (moving && (entrance < 1 || Math.abs(targetPhase - phase) > .0001 || Math.abs(pitch - currentPitch) > .0001 || Math.abs(yaw - currentYaw) > .0001 || Math.abs(tiltX - currentTiltX) > .0001 || Math.abs(tiltY - currentTiltY) > .0001)) request();
  }

  function request() {
    if (!frame && ready && active()) frame = requestAnimationFrame(render);
  }

  function layout() {
    width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight);
    if (!renderer || failed) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    baseExtent = Math.max(1.34, 1.40 / aspect);
    camera.left = -baseExtent * aspect / 2; camera.right = baseExtent * aspect / 2;
    camera.top = baseExtent / 2; camera.bottom = -baseExtent / 2;
    camera.updateProjectionMatrix(); pickDirty = true; request();
  }

  function makeEnvironment(T) {
    const room = new T.Scene(); room.background = new T.Color(0xb6c0c2);
    [[0xffffff, 4, [-7, 5, 1], [0, Math.PI / 2, 0]], [0xffffff, 3, [0, 8, 0], [Math.PI / 2, 0, 0]], [0xd9e6f3, 2, [7, 0, 0], [0, -Math.PI / 2, 0]]].forEach(([color, power, position, rotation]) => {
      const material = new T.MeshBasicMaterial({color, side:T.DoubleSide}); material.color.multiplyScalar(power);
      const panel = new T.Mesh(new T.PlaneGeometry(8, 12), material); panel.position.set(...position); panel.rotation.set(...rotation); room.add(panel);
    });
    const pmrem = new T.PMREMGenerator(renderer), result = pmrem.fromScene(room, .06);
    pmrem.dispose(); room.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    return result;
  }

  function fail() {
    failed = true; ready = false; loading = false;
    if (frame) cancelAnimationFrame(frame); frame = 0;
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null; pointerInside = false;
    root.classList.remove('is-ready', 'is-loading', 'is-dragging');
    root.classList.add('is-failed'); root.dataset.v3HeroState = 'unavailable';
    canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true'); poster?.removeAttribute('aria-hidden');
    button.hidden = true; showPart(null);
  }

  async function initialize(userAction = false) {
    if (ready || loading || failed || (!userAction && !autoAllowed())) return;
    loading = true;
    root.classList.add('is-loading'); root.classList.remove('is-static');
    root.dataset.v3HeroState = 'loading'; button.setAttribute('aria-busy', 'true');
    try {
      await Promise.all([
        (async () => { if (!window.V2HeroAssets) await loadScript('/assets/v2-hero-assets.js?v=index-planes-20261003'); window.V2HeroAssets.prefetch('telemetry').catch(() => {}); })(),
        (async () => { if (!window.V2HeroEnvironment) await loadScript('/assets/v2-hero-environment.js'); window.V2HeroEnvironment.prefetch().catch(() => {}); })(),
        window.V2HeroMotion ? Promise.resolve() : loadScript('/assets/v2-hero-motion.js'),
        window.THREE ? Promise.resolve() : loadScript('/assets/vendor/three.min.js')
      ]);
      const T = window.THREE;
      renderer = new T.WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 1.75));
      renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .98;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
      scene = new T.Scene(); camera = new T.OrthographicCamera(-1, 1, .8, -.8, .1, 20);
      camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0);
      scene.add(new T.HemisphereLight(0xffffff, 0xc4cfce, .6));
      const light = (color, intensity, x, y, z) => { const lamp = new T.DirectionalLight(color, intensity); lamp.position.set(x, y, z); scene.add(lamp); return lamp; };
      key = light(0xfff8ed, 1.4, -4, 5, 18); light(0xd3e5ff, .9, 8, 3, 5); light(0xffffff, .5, -8, -4, 6);
      key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.00018; key.shadow.normalBias = .0006;
      key.userData.direction = key.position.clone().normalize(); scene.add(key.target);
      box = new T.Box3(); corner = new T.Vector3(); centre = new T.Vector3(); projected = new T.Vector3();
      pointer = new T.Vector2(2, 2); raycaster = new T.Raycaster();
      const environmentTask = (async () => {
        try {
          const texture = await window.V2HeroEnvironment.load(T); lighting = {texture, dispose:() => texture.dispose()};
          root.dataset.v3HeroEnvironment = 'prepared';
        } catch (error) { lighting = makeEnvironment(T); root.dataset.v3HeroEnvironment = 'generated'; }
      })();
      [model] = await Promise.all([window.V2HeroAssets.load('telemetry'), environmentTask]);
      scene.environment = lighting.texture;
      window.V2HeroMotion.prepare(model.parts, {name:'telemetry'});
      model.group.traverse(object => { if (object.isMesh) pickables.push(object); });
      for (const part of model.parts) part.object.traverse(object => { if (object.isMesh) partForMesh.set(object, part); });
      scene.add(model.group);
      ground = new T.Mesh(new T.PlaneGeometry(5, 5), new T.ShadowMaterial({color:0x575347, transparent:true, opacity:.15, depthWrite:false}));
      ground.position.set(.04, -.07, -.64); ground.receiveShadow = true; scene.add(ground);
      root.querySelectorAll('line[data-v3-ref]').forEach(line => {
        const part = model.parts.find(item => item.ref === line.dataset.v3Ref);
        const svg = line.ownerSVGElement;
        if (part && svg?.viewBox.baseVal.width) anchors.push({part, line, svg, dot:root.querySelector(`[data-v3-dot="${part.ref}"]`)});
      });
      const leaderSVG = root.querySelector('[data-v3-leaders]');
      if (leaderSVG) {
        focusDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        focusDot.setAttribute('r', '6'); focusDot.style.display = 'none'; leaderSVG.append(focusDot);
      }
      ready = true; loading = false; entry = motionAllowed() ? performance.now() : 0;
      layout();
      // The poster is only retired after a real render succeeds.
      if (frame) cancelAnimationFrame(frame); frame = 0;
      render(performance.now());
      root.dataset.v3HeroParts = String(model.parts.length);
      button.removeAttribute('aria-busy');
      button.textContent = targetPhase ? 'Assemble' : 'Disassemble';
      request();
    } catch (error) { fail(); }
  }

  button.addEventListener('click', () => {
    if (failed) return;
    if (!ready && !loading && !autoAllowed()) { initialize(true); return; }
    targetPhase = targetPhase ? 0 : 1;
    button.textContent = targetPhase ? 'Assemble' : 'Disassemble';
    button.setAttribute('aria-pressed', String(Boolean(targetPhase)));
    root.classList.toggle('is-exploded', Boolean(targetPhase));
    if (!ready) initialize(true);
    pickDirty = true; request();
  });

  function pointerPosition(event) {
    if (!pointer) return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    pointerInside = true; pickDirty = true; keyboardPart = -1;
  }
  canvas.addEventListener('keydown', event => {
    if (!ready || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', '[', ']'].includes(event.key)) return;
    event.preventDefault();
    pointerInside = false; pickDirty = false; tiltX = 0; tiltY = 0;
    if (event.key === '[' || event.key === ']') {
      keyboardPart = (keyboardPart + (event.key === ']' ? 1 : keyboardPart < 0 ? 0 : -1) + model.parts.length) % model.parts.length;
      showPart(model.parts[keyboardPart]);
    } else {
      if (event.key === 'ArrowLeft') yaw = clamp(yaw - .09, -1.1, 1.1);
      if (event.key === 'ArrowRight') yaw = clamp(yaw + .09, -1.1, 1.1);
      if (event.key === 'ArrowUp') pitch = clamp(pitch - .09, .55, 1.52);
      if (event.key === 'ArrowDown') pitch = clamp(pitch + .09, .55, 1.52);
      if (event.key === 'Home') { pitch = 1.08; yaw = -.28; keyboardPart = -1; showPart(null); }
    }
    request();
  });
  canvas.addEventListener('blur', () => { keyboardPart = -1; showPart(null); request(); });
  canvas.addEventListener('pointerdown', event => {
    if (!ready || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = {id:event.pointerId, x:event.clientX, y:event.clientY, pitch, yaw, moving:false, touch:event.pointerType === 'touch'};
    if (!drag.touch) canvas.setPointerCapture(event.pointerId);
    pointerPosition(event);
  }, {passive:true});
  canvas.addEventListener('pointermove', event => {
    if (!ready) return;
    pointerPosition(event);
    if (drag && event.pointerId === drag.id) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moving && Math.abs(dx) + Math.abs(dy) > 8 && (!drag.touch || Math.abs(dx) > Math.abs(dy) * 1.2)) {
        drag.moving = true; canvas.setPointerCapture(event.pointerId); root.classList.add('is-dragging');
      }
      if (drag.moving) {
        yaw = clamp(drag.yaw + dx * .0035, -1.1, 1.1);
        if (!drag.touch) pitch = clamp(drag.pitch + dy * .003, .55, 1.52);
        tiltX = 0; tiltY = 0;
      }
    } else if (event.pointerType === 'mouse' && motionAllowed()) {
      tiltX = pointer.x * .022; tiltY = pointer.y * .016;
    }
    request();
  }, {passive:true});
  function release(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null; root.classList.remove('is-dragging'); pickDirty = true; request();
  }
  canvas.addEventListener('pointerup', release, {passive:true});
  canvas.addEventListener('pointercancel', event => { release(event); pointerInside = false; showPart(null); }, {passive:true});
  canvas.addEventListener('pointerleave', () => { pointerInside = false; tiltX = 0; tiltY = 0; showPart(null); request(); }, {passive:true});
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(); });

  new ResizeObserver(layout).observe(canvas);
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { initialize(); request(); }
    else { if (frame) cancelAnimationFrame(frame); frame = 0; previousTime = 0; showPart(null); }
  }, {rootMargin:'100px 0px', threshold:0});
  observer.observe(canvas);
  function visibilityChanged() {
    if (!active()) { if (frame) cancelAnimationFrame(frame); frame = 0; previousTime = 0; }
    else { initialize(); request(); }
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('pagehide', () => { pageActive = false; visibilityChanged(); });
  window.addEventListener('pageshow', () => { pageActive = true; visibilityChanged(); });
  reduced.addEventListener('change', () => {
    tiltX = 0; tiltY = 0; entry = 0;
    if (ready) request();
    else if (autoAllowed()) initialize();
    else if (!loading) { root.classList.add('is-static'); button.textContent = 'Explore in 3D'; }
  });
  connection?.addEventListener?.('change', () => { if (autoAllowed() && visible) initialize(); });
})();
