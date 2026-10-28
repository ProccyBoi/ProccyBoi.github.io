/* V5 manufacturing illustration. CAD geometry, source rotations and landed
 * positions are unchanged. Deposits follow the existing extracted CAD lands;
 * their shape and wetting are illustrative, not production process data. */
(() => {
  'use strict';
  const root = document.querySelector('[data-v5-assembly]');
  if (!root) return;
  const stage = root.querySelector('.assembly-stage');
  const canvas = root.querySelector('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const status = root.querySelector('.assembly-status');
  const loadButton = root.querySelector('.assembly-load');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { value = clamp(value); return value * value * (3 - 2 * value); };
  const ramp = (value, from, to) => ease((value - from) / (to - from));
  const mix = (from, to, amount) => from + (to - from) * amount;
  let T, renderer, scene, camera, model, deposits, depositMaterial, ground;
  let ready = false, loading = false, failed = false, visible = false, near = false;
  let optedIn = false, progress = 0, frame = 0, frames = 0, aspect = 1;
  let focus = {x: 0, z: -.1};
  const uniform = {print: {value: 0}, wet: {value: 0}};
  const scripts = new Map();
  const script = (src, present) => {
    if (present()) return Promise.resolve();
    if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = src;
      element.onload = () => present() ? resolve() : reject(new Error('Dependency did not initialise'));
      element.onerror = () => reject(new Error('Assembly dependency unavailable'));
      document.head.append(element);
    }));
    return scripts.get(src);
  };
  function cancelFrame() { if (frame) cancelAnimationFrame(frame); frame = 0; }
  function requestFrame() {
    if (ready && !failed && visible && root.classList.contains('is-active') && !reduced.matches && !document.hidden && !frame) {
      frame = requestAnimationFrame(render);
    }
  }
  function readProgress() {
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const rect = root.getBoundingClientRect();
    return clamp((top - rect.top) / Math.max(1, rect.height - stage.clientHeight));
  }
  function setPresentation() {
    if (failed) return;
    if (reduced.matches) {
      cancelFrame();
      root.classList.remove('is-active');
      root.dataset.state = 'static';
      canvas.setAttribute('aria-hidden', 'true');
      status.textContent = 'Finished board · reduced motion is on.';
      loadButton.hidden = true;
    } else if (ready) {
      // If a visitor used the skip link while assets loaded, do not insert
      // several viewports above their reading position when the fetch completes.
      const top = parseFloat(getComputedStyle(stage).top) || 0;
      if (!root.classList.contains('is-active') && root.getBoundingClientRect().bottom <= top) {
        root.dataset.state = 'static';
        canvas.setAttribute('aria-hidden', 'true');
        status.textContent = '';
        loadButton.hidden = true;
        return;
      }
      root.classList.add('is-active');
      root.dataset.state = 'ready';
      canvas.removeAttribute('aria-hidden');
      status.textContent = '';
      loadButton.hidden = true;
      resize();
    } else if (connection?.saveData && !optedIn) {
      root.dataset.state = 'static';
      status.textContent = 'Data saving is on. The finished board is shown.';
      loadButton.hidden = false;
    } else if (near && !loading) init();
  }
  function unavailable() {
    failed = true;
    cancelFrame();
    root.classList.remove('is-active');
    root.dataset.state = 'unavailable';
    canvas.setAttribute('aria-hidden', 'true');
    status.textContent = '3D assembly unavailable. The finished board is shown.';
    loadButton.hidden = true;
    renderer?.dispose();
  }
  function createDeposits(data) {
    const positions = [], centres = [], normals = [];
    const add = (point, centre, y, normal) => {
      positions.push(point[0], y, point[1]); centres.push(...centre); normals.push(...normal);
    };
    for (const land of data.lands) {
      const centre = land.p.reduce((a, point) => [a[0] + point[0] / land.p.length, a[1] + point[1] / land.p.length], [0, 0]);
      for (const tri of land.t) for (const i of tri) add(land.p[i], centre, .002, [0, 1, 0]);
      for (const [a, b] of land.e) {
        const A = land.p[a], B = land.p[b], dx = B[0] - A[0], dz = B[1] - A[1];
        const length = Math.hypot(dx, dz);
        if (!length) continue;
        const normal = [-dz / length, 0, dx / length];
        for (const [point, y] of [[A, 0], [B, 0], [B, .002], [A, 0], [B, .002], [A, .002]]) add(point, centre, y, normal);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('landCentre', new T.Float32BufferAttribute(centres, 2));
    depositMaterial = new T.MeshStandardMaterial({color: 0xa2abb0, roughness: .9, metalness: .12, side: T.DoubleSide});
    depositMaterial.onBeforeCompile = shader => {
      shader.uniforms.print = uniform.print;
      shader.uniforms.wet = uniform.wet;
      shader.vertexShader = 'attribute vec2 landCentre; uniform float wet; varying float landX;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.xz = landCentre + (position.xz - landCentre) * mix(.88, 1., wet);
        transformed.y = .02194 + position.y * mix(1., .4, wet);
        landX = landCentre.x;`);
      shader.fragmentShader = 'uniform float print; varying float landX;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (landX > mix(-.51, .51, print)) discard;');
    };
    depositMaterial.customProgramCacheKey = () => 'v5-source-land-deposits';
    deposits = new T.Mesh(geometry, depositMaterial);
    deposits.frustumCulled = false;
    model.group.add(deposits);
    root.dataset.lands = String(data.lands.length);
  }
  function pose() {
    const p = progress, wet = ramp(p, .53, .68);
    uniform.print.value = ramp(p, .025, .16);
    uniform.wet.value = wet;
    deposits.visible = p > .025;
    depositMaterial.color.setRGB(.48 + wet * .25, .51 + wet * .27, .53 + wet * .29);
    depositMaterial.roughness = .9 - wet * .65;
    depositMaterial.metalness = .12 + wet * .75;
    for (const part of model.parts) {
      const start = part.v5Back ? .755 : part.v5ThroughHole ? .86 : .18 + part.v5Order * .16;
      const end = start + (part.v5Back || part.v5ThroughHole ? .07 : .1);
      const landing = ramp(p, start, end);
      part.object.visible = p >= start;
      part.object.position.copy(part.base);
      part.object.position.y += (part.v5Back ? -1 : 1) * .23 * (1 - landing);
      // Original quaternions remain untouched. A single scalar reconstructs
      // every frame; forward, reverse and repeated scrolls cannot accumulate drift.
    }
    const close = ramp(p, .40, .50) * (1 - ramp(p, .66, .74));
    const underside = ramp(p, .71, .77) * (1 - ramp(p, .83, .90));
    const portrait = aspect < .8;
    const yaw = -.34 + ramp(p, .12, .40) * .42 - close * .12 + underside * .22 + (portrait ? Math.PI / 2 : 0);
    const polar = mix(.65, .46, close) + underside * 1.98;
    const cx = focus.x * close, cz = focus.z * close;
    const span = mix(1.18, .48, close);
    // Fit the long board axis to the tall phone stage, instead of shrinking it
    // to the same landscape camera. Camera changes never alter the source model.
    const fit = Math.max(span, (portrait ? span * .80 : span) / aspect);
    camera.left = -fit * aspect / 2;
    camera.right = fit * aspect / 2;
    camera.top = fit / 2;
    camera.bottom = -fit / 2;
    camera.position.set(cx + Math.sin(yaw) * Math.sin(polar) * 2, .025 + Math.cos(polar) * 2, cz + Math.cos(yaw) * Math.sin(polar) * 2);
    camera.lookAt(cx, .025, cz);
    camera.updateProjectionMatrix();
    ground.visible = underside < .15;
    root.dataset.progress = p.toFixed(6);
  }
  function render() {
    frame = 0;
    if (!ready || failed || reduced.matches || document.hidden || !visible || !root.classList.contains('is-active')) return;
    progress = readProgress();
    pose();
    renderer.render(scene, camera);
    frames++;
    root.dataset.frames = String(frames);
  }
  function resize() {
    if (!ready || failed || reduced.matches) return;
    const width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    aspect = width / height;
    renderer.setSize(width, height, false);
    requestFrame();
  }
  async function init() {
    if (loading || ready || failed || reduced.matches) return;
    loading = true;
    root.dataset.state = 'loading';
    status.textContent = 'Preparing the source CAD…';
    loadButton.hidden = true;
    try {
      await script('/assets/vendor/three.min.js', () => Boolean(window.THREE));
      await Promise.all([
        script('/assets/v2-hero-assets.js', () => Boolean(window.V2HeroAssets)),
        script('/assets/v2-hero-environment.js', () => Boolean(window.V2HeroEnvironment))
      ]);
      // A preference change during dependency loading must prevent CAD fetches.
      if (reduced.matches) { loading = false; setPresentation(); return; }
      T = window.THREE;
      renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      window.V2ProductStudio.configureRenderer(renderer, T);
      renderer.toneMappingExposure = 1.06;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      scene = new T.Scene();
      camera = new T.OrthographicCamera(-1, 1, 1, -1, .01, 10);
      scene.add(new T.HemisphereLight(0xe8f1ff, 0x22282e, .36));
      const key = new T.DirectionalLight(0xfff4e5, 1.25);
      key.position.set(-1.1, 2.7, 1.8);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, {left: -.8, right: .8, top: .8, bottom: -.8, near: .1, far: 5});
      key.shadow.bias = -.00012;
      key.shadow.normalBias = .0011;
      scene.add(key);
      const rim = new T.DirectionalLight(0xd3e4ff, .65);
      rim.position.set(1, -.7, -2);
      scene.add(rim);
      const [assembly, lands, environment] = await Promise.all([
        window.V2HeroAssets.load('telemetry'),
        fetch('/assets/models/manufacturing/skylabs-reflow-lands.json').then(response => {
          if (!response.ok) throw new Error('Source lands unavailable');
          return response.json();
        }),
        window.V2HeroEnvironment.load(T)
      ]);
      if (failed) return;
      model = assembly;
      scene.environment = environment;
      window.V2ProductStudio.applyMaterials(model, 'telemetry', T);
      model.group.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        object.receiveShadow = true;
        object.castShadow = !materials.every(material => material.name === 'mat_48' || material.map);
        for (const material of materials) {
          // The source export's translucent mask is a CAD viewing aid. A solid
          // mask finish avoids seeing underside packages through the PCB.
          if (material.name === 'mat_48') { material.opacity = 1; material.transparent = false; material.depthWrite = true; }
        }
      });
      const footprints = new Map(model.metadata.footprints.map(part => [part.ref, part]));
      for (const part of model.parts) {
        const refs = part.object.userData.componentRefs || [part.ref];
        part.v5Back = refs.some(ref => footprints.get(ref)?.side === 'back') || part.offset.y < 0;
        part.v5ThroughHole = refs.some(ref => /PinHeader|PinSocket|Connector_JST/.test(footprints.get(ref)?.footprint || ''));
        part.v5Order = clamp((part.base.x + .5) * .7 + (part.base.z + .4) * .3);
        part.v5Quaternion = part.object.quaternion.toArray();
      }
      const detail = model.parts.find(part => part.ref === 'U14' && !part.v5Back) || model.parts.find(part => part.ref === 'U7' && !part.v5Back);
      if (detail) focus = {x: detail.base.x, z: detail.base.z};
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = shadowCanvas.height = 128;
      const ctx = shadowCanvas.getContext('2d');
      const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(0,0,0,.45)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
      ground = new T.Mesh(new T.PlaneGeometry(1.5, 1.15), new T.MeshBasicMaterial({map: new T.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false}));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -.12;
      scene.add(ground);
      createDeposits(lands);
      scene.add(model.group);
      renderer.compile(scene, camera);
      ready = true; loading = false;
      root.assemblySnapshot = () => ({
        progress, frames, ready, reducedMotion: reduced.matches, state: root.dataset.state,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        parts: model.parts.map(part => ({
          ref: part.ref || part.object.name, visible: part.object.visible,
          back: part.v5Back, throughHole: part.v5ThroughHole,
          position: part.object.position.toArray(), base: part.base.toArray(),
          quaternion: part.object.quaternion.toArray(), sourceQuaternion: [...part.v5Quaternion]
        }))
      });
      setPresentation();
      new ResizeObserver(resize).observe(stage);
    } catch (error) {
      console.warn('V5 assembly:', error.message);
      unavailable();
    }
  }
  window.addEventListener('scroll', requestFrame, {passive: true});
  window.addEventListener('resize', resize, {passive: true});
  document.addEventListener('visibilitychange', () => document.hidden ? cancelFrame() : requestFrame());
  reduced.addEventListener('change', setPresentation);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); unavailable(); });
  loadButton.addEventListener('click', () => { optedIn = true; near = true; setPresentation(); });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { if (ready && !root.classList.contains('is-active')) setPresentation(); requestFrame(); } else cancelFrame();
  }, {threshold: 0}).observe(root);
  new IntersectionObserver(entries => {
    near = entries[0].isIntersecting;
    if (near) setPresentation();
  }, {rootMargin: '250px', threshold: 0}).observe(root);
  setPresentation();
})();
