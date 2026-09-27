/* Raspberry Pi expansion card: exact component geometry, finite assembly motion. */
(() => {
  'use strict';
  const requests = new Map();
  const script = (url) => {
    if (!requests.has(url)) requests.set(url, new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = url; element.onload = resolve;
      element.onerror = () => { requests.delete(url); element.remove(); reject(new Error('Viewer library unavailable')); };
      document.head.append(element);
    }));
    return requests.get(url);
  };
  const parts = {
    U5: ['RP2354B', 'The Raspberry Pi microcontroller at the heart of the card.'],
    U3: ['External flash', 'W25Q128JVS storage sits beside the controller.'],
    U2: ['3.3 V supply', 'The AMS1117 regulator supplies the board from USB power.'],
    U1: ['Crystal', 'A compact crystal provides the timing reference.'],
    SW1: ['Board controls', 'Two tactile switches sit along the accessible end of the board.'],
    SW2: ['Board controls', 'Two tactile switches sit along the accessible end of the board.'],
    P1: ['USB-C connection', 'The straddle-mount plug connects the card to the laptop.'],
    L2: ['Power inductor', 'The inductor is part of the controller power circuit.']
  };
  const base = '/assets/models/framework-pi/';

  // KiCad exports each CAD face as a primitive. Batch faces per component/material
  // without simplifying geometry or losing the reference-named assembly groups.
  function batchComponent(T, component) {
    if (component.isMesh) return;
    component.updateWorldMatrix(true, true);
    const inverse = component.matrixWorld.clone().invert(), groups = new Map(), meshes = [];
    component.traverse((mesh) => {
      if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.visible) return;
      meshes.push(mesh);
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      const key = mesh.material.uuid + ':' + Object.keys(geometry.attributes).sort().join(',');
      if (!groups.has(key)) groups.set(key, { material: mesh.material, geometries: [] });
      groups.get(key).geometries.push(geometry);
    });
    groups.forEach(({ material, geometries }) => {
      const geometry = new T.BufferGeometry();
      for (const name of Object.keys(geometries[0].attributes)) {
        const itemSize = geometries[0].attributes[name].itemSize;
        const count = geometries.reduce((sum, entry) => sum + entry.attributes[name].count, 0);
        const values = new Float32Array(count * itemSize); let offset = 0;
        geometries.forEach((entry) => {
          const attribute = entry.attributes[name];
          for (let i = 0; i < attribute.count; i += 1) for (let j = 0; j < itemSize; j += 1) values[offset++] = attribute.getComponent ? attribute.getComponent(i, j) : attribute[['getX', 'getY', 'getZ', 'getW'][j]](i);
        });
        geometry.setAttribute(name, new T.BufferAttribute(values, itemSize));
      }
      const merged = new T.Mesh(geometry, material); merged.castShadow = merged.receiveShadow = true; component.add(merged);
      geometries.forEach((entry) => entry.dispose());
    });
    meshes.forEach((mesh) => { mesh.parent.remove(mesh); mesh.geometry.dispose(); });
  }

  async function create(root) {
    if (!window.THREE) await script('/assets/vendor/three.min.js');
    if (!window.THREE.GLTFLoader) await script('/assets/vendor/GLTFLoader.js');
    const T = window.THREE;
    const canvas = root.querySelector('[data-pi-canvas]');
    const stage = root.querySelector('[data-pi-stage]');
    const capture = root.hasAttribute('data-pi-capture');
    const controls = new AbortController();
    const listen = (target, name, handler) => target.addEventListener(name, handler, { signal: controls.signal });
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: capture });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x111510, 0);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-40, 40, 40, -40, 0.1, 500);
    const assembly = new T.Group(); scene.add(assembly);
    scene.add(new T.HemisphereLight(0xe8f0e8, 0x22251d, 0.7));
    const light = (color, intensity, x, y, z) => { const l = new T.DirectionalLight(color, intensity); l.position.set(x, y, z); scene.add(l); return l; };
    const key = light(0xfff3db, 1.65, -45, 80, 50);
    light(0xc2d5ed, 0.75, 50, 35, -45);
    light(0xd8e7c0, 0.45, -30, 10, -45);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 180 });
    key.shadow.bias = -0.0007; key.shadow.normalBias = 0.07;

    const studio = new T.Scene(); studio.background = new T.Color(0x333a36);
    [[-7, 5, 0, Math.PI / 2, 0xdbe8f6, 2.8], [5, 7, -3, -Math.PI / 2, 0xffebcc, 1.8]].forEach(([x, y, z, turn, color, gain]) => {
      const card = new T.Mesh(new T.PlaneGeometry(7, 13), new T.MeshBasicMaterial({ color, side: T.DoubleSide }));
      card.material.color.multiplyScalar(gain); card.position.set(x, y, z); card.rotation.y = turn; studio.add(card);
    });
    const pmrem = new T.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(studio, 0.04); scene.environment = environment.texture;
    studio.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); pmrem.dispose();
    let disposed = false, observer, visibilityObserver, pending = 0, visible = true;
    let motion = null, shellVisible = !capture, selected = null;
    const dispose = () => {
      if (disposed) return;
      disposed = true; controls.abort(); if (pending) cancelAnimationFrame(pending);
      observer?.disconnect(); visibilityObserver?.disconnect();
      scene.traverse((object) => { object.geometry?.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => { m?.map?.dispose(); m?.dispose(); }); });
      environment.dispose(); renderer.dispose(); root.dataset.piMotion = 'idle';
    };
    root.addEventListener('pi-dispose', dispose, { once: true });
    listen(canvas, 'webglcontextlost', (event) => { event.preventDefault(); root.dispatchEvent(new Event('pi-unavailable')); });
    const loader = new T.GLTFLoader();
    const load = (file) => new Promise((resolve, reject) => loader.load(base + file, (gltf) => disposed ? reject(new Error('Viewer closed')) : resolve(gltf.scene), undefined, reject));
    const [board, usb, shellBuffer] = await Promise.all([
      load('framework-pi-board.glb'), load('framework-pi-usbc.glb'),
      fetch(base + 'framework-pi-enclosure.stl').then((r) => { if (!r.ok) throw new Error('Enclosure unavailable'); return r.arrayBuffer(); })
    ]);
    if (disposed) throw new Error('Viewer closed');
    const materials = new Map();
    board.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = object.receiveShadow = true;
      const style = (source) => {
        if (materials.has(source)) return materials.get(source);
        const m = source.clone();
        if (m.name === 'mat_20') {
          m.color.setHex(0x0c4930).convertSRGBToLinear(); m.metalness = 0.03; m.roughness = 0.53; m.envMapIntensity = 0.05; m.transparent = false; m.opacity = 1;
        } else if (m.name === 'mat_21') {
          m.color.setHex(0x20372b).convertSRGBToLinear(); m.metalness = 0; m.roughness = 0.8; m.envMapIntensity = 0.08;
        } else if (m.name === 'mat_18') {
          m.color.setHex(0x9ba5a1).convertSRGBToLinear(); m.metalness = 0.86; m.roughness = 0.32; m.envMapIntensity = 0.55;
        } else {
          const bright = Math.max(m.color.r, m.color.g, m.color.b);
          const neutral = bright - Math.min(m.color.r, m.color.g, m.color.b) < 0.15;
          m.metalness = bright > 0.3 && neutral ? 0.78 : 0.03;
          m.roughness = m.metalness > 0.5 ? 0.34 : 0.68;
          m.envMapIntensity = m.metalness > 0.5 ? 0.5 : 0.1;
        }
        materials.set(source, m); return m;
      };
      object.material = Array.isArray(object.material) ? object.material.map(style) : style(object.material);
      if ((Array.isArray(object.material) ? object.material : [object.material]).some((m) => m.name === 'mat_19')) object.visible = false;
    });
    const components = []; board.traverse((object) => { if (object.children.length && object.children.every((child) => child.isMesh)) components.push(object); });
    components.forEach((component) => batchComponent(T, component));
    board.scale.setScalar(1000); board.position.set(-140, 3.1, -142); assembly.add(board);
    const plug = usb.getObjectByName('P1');
    if (!plug) throw new Error('Connector unavailable');
    plug.parent.remove(plug); plug.position.set(0, 3.9, -16.4); plug.rotation.set(-Math.PI / 2, 0, 0); plug.scale.setScalar(1000);
    const plugMaterial = new T.MeshStandardMaterial({ color: new T.Color(0xaeb9b7).convertSRGBToLinear(), metalness: 0.93, roughness: 0.26, envMapIntensity: 0.6, side: T.DoubleSide });
    plug.traverse((object) => {
      if (!object.isMesh) return;
      object.material = plugMaterial;
      object.castShadow = object.receiveShadow = true;
    }); batchComponent(T, plug); assembly.add(plug);

    // The source SVG remains registered to the native +Z KiCad Y direction.
    const silkTexture = await new Promise((resolve, reject) => new T.TextureLoader().load(base + 'framework-pi-silk-front.svg', resolve, undefined, reject));
    if (disposed) { silkTexture.dispose(); throw new Error('Viewer closed'); }
    silkTexture.encoding = T.sRGBEncoding; silkTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const inkShape = new T.Shape();
    inkShape.moveTo(-13, -15); inkShape.lineTo(13, -15); inkShape.lineTo(13, 15); inkShape.lineTo(-13, 15); inkShape.closePath();
    for (const x of [-11.3, 11.3]) { const hole = new T.Path(); hole.absarc(x, -4.5, 1.1, 0, Math.PI * 2, true); inkShape.holes.push(hole); }
    const inkGeometry = new T.ShapeGeometry(inkShape, 32), inkPosition = inkGeometry.getAttribute('position'), inkUv = inkGeometry.getAttribute('uv');
    for (let i = 0; i < inkPosition.count; i += 1) inkUv.setXY(i, (inkPosition.getX(i) + 13) / 26, (inkPosition.getY(i) + 15) / 30);
    const silk = new T.Mesh(inkGeometry, new T.MeshStandardMaterial({ map: silkTexture, transparent: true, alphaTest: 0.04, roughness: 1, metalness: 0, side: T.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    silk.rotation.x = -Math.PI / 2; silk.position.y = 3.92; silk.receiveShadow = true; assembly.add(silk);
    const view = new DataView(shellBuffer), count = view.getUint32(80, true);
    if (84 + count * 50 > shellBuffer.byteLength) throw new Error('Invalid enclosure');
    const positions = new Float32Array(count * 9);
    for (let i = 0; i < count; i += 1) for (let j = 0; j < 9; j += 1) positions[i * 9 + j] = view.getFloat32(84 + i * 50 + 12 + j * 4, true);
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    const shell = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: 0x919ca4, metalness: 0.05, roughness: 0.42, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false }));
    shell.position.z = 15; shell.visible = shellVisible; assembly.add(shell);
    const outline = new T.LineSegments(new T.EdgesGeometry(geometry, 35), new T.LineBasicMaterial({ color: 0x657582, transparent: true, opacity: 0.38 })); shell.add(outline);

    const explodedParts = [], picks = [];
    board.traverse((object) => {
      if (!/^(?:U|C|R|L|SW)\d+$/.test(object.name)) return;
      const ref = object.name, major = ['U5', 'U3', 'U2'].includes(ref);
      explodedParts.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), lift: (ref === 'U5' ? 13 : major ? 10 : ref.startsWith('SW') ? 8 : 6) / 1000, x: (object.position.x - 0.140) * 0.34, z: (object.position.z - 0.142) * 0.26, delay: major ? 0.12 : 0.24 });
      if (parts[ref]) picks.push(object);
    });
    picks.push(plug);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const current = { yaw: 145, pitch: 39, zoom: 1, exploded: 0 };
    let target = { ...current }, aspect = 1, width = 0, height = 0;
    const presets = { iso: [145, 39], top: [0, 89.7], bottom: [0, -87], side: [105, 10] };
    const cameraButtons = [...root.querySelectorAll('[data-pi-view]')];
    const select = (ref) => {
      selected = ref;
      const info = parts[ref] || ['', ''];
      const name = root.querySelector('[data-pi-part-name]'), detail = root.querySelector('[data-pi-part-detail]');
      if (name) name.textContent = info[0]; if (detail) detail.textContent = info[1];
      const caption = name?.closest('figcaption'); if (caption) caption.hidden = !parts[ref];
      root.querySelectorAll('[data-pi-part]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.piPart === ref)));
      root.dataset.piSelection = ref || '';
    };
    const stop = (finish = false) => { if (finish) Object.assign(current, target); motion = null; root.dataset.piMotion = 'idle'; };
    const move = (values, duration = 820) => {
      stop(); target = { ...current, ...values };
      target.yaw = current.yaw + ((target.yaw - current.yaw) % 360 + 540) % 360 - 180;
      if (reduced.matches || capture) Object.assign(current, target);
      else { motion = { from: { ...current }, elapsed: 0, last: null, duration }; root.dataset.piMotion = visible && !document.hidden ? 'transition' : 'paused'; }
      invalidate();
    };
    const pose = () => {
      const t = current.exploded;
      explodedParts.forEach((part) => {
        const p = T.MathUtils.smoothstep(T.MathUtils.clamp((t - part.delay) / (1 - part.delay), 0, 1), 0, 1);
        part.object.position.copy(part.position).add(new T.Vector3(part.x * p, part.lift * p, part.z * p));
        part.object.quaternion.copy(part.quaternion);
      });
      plug.position.set(0, 3.9 + t * 7, -16.4 - t * 7);
      shell.position.set(0, -t * 12, 15 + t * 2); shell.rotation.x = -t * 0.06;
      const pitch = T.MathUtils.degToRad(current.pitch), yaw = T.MathUtils.degToRad(current.yaw);
      const aim = new T.Vector3(0, 3 + t * 1.5, -4.5);
      camera.position.set(aim.x + 130 * Math.cos(pitch) * Math.sin(yaw), aim.y + 130 * Math.sin(pitch), aim.z + 130 * Math.cos(pitch) * Math.cos(yaw)); camera.lookAt(aim);
      const frame = Math.max(48, 53 / aspect) + t * 23;
      camera.top = frame / current.zoom / 2; camera.bottom = -camera.top; camera.right = camera.top * aspect; camera.left = -camera.right; camera.updateProjectionMatrix();
    };
    function render(time = performance.now()) {
      pending = 0;
      if (disposed) return;
      if (!visible || document.hidden) { if (motion) root.dataset.piMotion = 'paused'; return; }
      if (motion) {
        if (motion.last !== null) motion.elapsed += time - motion.last;
        motion.last = time;
        const p = Math.min(motion.elapsed / motion.duration, 1), eased = p * p * p * (p * (p * 6 - 15) + 10);
        for (const key of Object.keys(current)) current[key] = T.MathUtils.lerp(motion.from[key], target[key], eased);
        if (p === 1) stop(true);
      }
      pose(); renderer.render(scene, camera);
      root.dataset.piFrames = String(Number(root.dataset.piFrames || 0) + 1);
      root.dataset.piDrawCalls = String(renderer.info.render.calls);
      root.dataset.piProgress = current.exploded.toFixed(3);
      if (motion) invalidate();
    }
    function invalidate() { if (!pending && !disposed) pending = requestAnimationFrame(render); }
    const resize = () => {
      if (width === stage.clientWidth && height === stage.clientHeight) return;
      width = Math.max(1, stage.clientWidth); height = Math.max(1, stage.clientHeight); aspect = width / height;
      renderer.setSize(width, height, false); invalidate();
    };
    const setView = (name) => {
      const angles = presets[name] || presets.iso;
      move({ yaw: angles[0], pitch: angles[1], zoom: 1 }, 700);
      cameraButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.piView === name)));
      root.dataset.piAngle = name;
    };
    cameraButtons.forEach((button) => listen(button, 'click', () => setView(button.dataset.piView)));
    root.querySelectorAll('[data-pi-part]').forEach((button) => listen(button, 'click', () => select(button.dataset.piPart)));
    const explodeButton = root.querySelector('[data-pi-explode]'), shellButton = root.querySelector('[data-pi-shell]');
    const explode = (value) => {
      root.dataset.piExploded = String(value); explodeButton?.setAttribute('aria-pressed', String(value));
      if (explodeButton) explodeButton.textContent = value ? 'Reassemble' : 'Explode';
      move({ exploded: value ? 1 : 0, zoom: 1 }, 1100);
    };
    if (explodeButton) listen(explodeButton, 'click', () => explode(root.dataset.piExploded !== 'true'));
    if (shellButton) listen(shellButton, 'click', () => {
      shellVisible = !shellVisible; shell.visible = shellVisible;
      shellButton.setAttribute('aria-pressed', String(shellVisible)); shellButton.textContent = shellVisible ? 'Hide housing' : 'Show housing'; invalidate();
    });
    const reset = () => {
      shellVisible = true; shell.visible = true; if (shellButton) { shellButton.setAttribute('aria-pressed', 'true'); shellButton.textContent = 'Hide housing'; }
      root.dataset.piExploded = 'false'; if (explodeButton) { explodeButton.setAttribute('aria-pressed', 'false'); explodeButton.textContent = 'Explode'; }
      select(null); move({ yaw: 145, pitch: 39, zoom: 1, exploded: 0 }); root.dataset.piAngle = 'iso';
      cameraButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.piView === 'iso')));
    };
    const resetButton = root.querySelector('[data-pi-reset]'); if (resetButton) listen(resetButton, 'click', reset);
    const markCustom = () => { cameraButtons.forEach((button) => button.setAttribute('aria-pressed', 'false')); root.dataset.piAngle = 'custom'; };
    const ray = new T.Raycaster(), pointer = new T.Vector2(); let drag = null;
    canvas.style.touchAction = 'pan-y pinch-zoom';
    listen(canvas, 'pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      stop(); drag = { x: event.clientX, y: event.clientY, yaw: current.yaw, pitch: current.pitch, touch: event.pointerType === 'touch', id: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
    });
    listen(canvas, 'pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      current.yaw = drag.yaw - (event.clientX - drag.x) * 0.38;
      if (!drag.touch) current.pitch = T.MathUtils.clamp(drag.pitch + (event.clientY - drag.y) * 0.3, -88, 89.7);
      markCustom(); invalidate();
    });
    listen(canvas, 'pointerup', (event) => {
      if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) {
        const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        ray.setFromCamera(pointer, camera); const hit = ray.intersectObjects(picks, true)[0];
        if (hit) { let node = hit.object; while (node && !parts[node.name]) node = node.parent; if (node) select(node.name); }
      }
      drag = null;
    });
    listen(canvas, 'pointercancel', () => { drag = null; }); listen(canvas, 'lostpointercapture', () => { drag = null; });
    listen(canvas, 'keydown', (event) => {
      if (event.key === 'Home') { event.preventDefault(); reset(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'].includes(event.key)) return;
      event.preventDefault(); stop();
      if (event.key === 'ArrowLeft') current.yaw += 10;
      if (event.key === 'ArrowRight') current.yaw -= 10;
      if (event.key === 'ArrowUp') current.pitch = Math.min(89.7, current.pitch + 8);
      if (event.key === 'ArrowDown') current.pitch = Math.max(-88, current.pitch - 8);
      if (event.key === '+' || event.key === '=') current.zoom = Math.min(1.8, current.zoom * 1.1);
      if (event.key === '-' || event.key === '_') current.zoom = Math.max(0.65, current.zoom / 1.1);
      markCustom(); invalidate();
    });
    const visibility = () => {
      if (disposed) return;
      if (!visible || document.hidden) { if (pending) cancelAnimationFrame(pending); pending = 0; if (motion) { motion.last = null; root.dataset.piMotion = 'paused'; } }
      else { if (motion) { motion.last = null; root.dataset.piMotion = 'transition'; } invalidate(); }
    };
    observer = new ResizeObserver(resize); observer.observe(stage);
    visibilityObserver = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; visibility(); }); visibilityObserver.observe(stage);
    listen(document, 'visibilitychange', visibility);
    listen(reduced, 'change', () => { if (reduced.matches && motion) { stop(true); invalidate(); } });
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Raspberry Pi expansion card. Drag to rotate, use arrow keys to turn, plus and minus to zoom, Home to reset.');
    canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown + - Home');
    root.dataset.piExploded = 'false'; root.dataset.piMotion = 'idle'; root.dataset.piAngle = 'iso'; root.dataset.piComponents = String(explodedParts.length + 1);
    select(null); resize(); pose(); renderer.render(scene, camera);
    return { render, setView, explode, dispose };
  }

  function mount(root) {
    if (root.dataset.piMounted) return;
    root.dataset.piMounted = 'true'; root.dataset.piState = 'poster';
    const start = root.querySelector('[data-pi-start]'), canvas = root.querySelector('[data-pi-canvas]'), poster = root.querySelector('[data-pi-poster]'), status = root.querySelector('[data-pi-status]');
    if (!start || !canvas) return;
    canvas.hidden = true;
    const unavailable = () => {
      root.dispatchEvent(new Event('pi-dispose')); root.dataset.piState = 'unavailable'; canvas.hidden = true;
      if (poster) poster.hidden = false; start.disabled = true; start.hidden = false; start.textContent = '3D unavailable';
      if (status) status.textContent = 'The card preview is still available.';
    };
    root.addEventListener('pi-unavailable', unavailable);
    start.addEventListener('click', async () => {
      if (root.dataset.piState !== 'poster') return;
      root.dataset.piState = 'loading'; start.disabled = true; start.textContent = 'Opening the card…';
      if (status) status.textContent = 'Preparing the assembly';
      try {
        await create(root); canvas.hidden = false; if (poster) poster.hidden = true;
        start.hidden = true; root.dataset.piState = 'ready';
        if (status) status.textContent = 'Drag to rotate · arrow keys to turn · + / − to zoom';
        if (!root.hasAttribute('data-pi-capture')) canvas.focus({ preventScroll: true });
      } catch (error) { console.warn('Pi card viewer unavailable', error); unavailable(); }
    });
  }
  window.PiCardStudio = Object.freeze({ mount });
  document.querySelectorAll('[data-pi-inspector]').forEach(mount);
})();
