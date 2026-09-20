/* Source-derived CAD studio. Geometry: the committed KiCad and Molex GLBs.
 * The studio is an optional enhancement: no model or WebGL library is fetched
 * before the visitor explicitly opens it. Rendering is input driven. */
(() => {
  'use strict';
  const scriptRequests = new Map();
  const loadScript = (src) => {
    if (scriptRequests.has(src)) return scriptRequests.get(src);
    const request = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => { script.remove(); scriptRequests.delete(src); reject(new Error('Studio library unavailable')); };
      document.head.appendChild(script);
    });
    scriptRequests.set(src, request);
    return request;
  };
  const libraries = async () => {
    if (!window.THREE) await loadScript('/assets/vendor/three.min.js');
    if (!window.THREE.GLTFLoader) await loadScript('/assets/vendor/GLTFLoader.js');
    return window.THREE;
  };

  async function createStudio(root) {
    const T = await libraries();
    const canvas = root.querySelector('[data-cad-canvas]');
    const modelName = root.dataset.cadModel === 'tramtrace' ? 'tramtrace' : 'framework';
    const stage = canvas.parentElement;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: root.hasAttribute('data-cad-capture') });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;
    renderer.setClearColor(0x101311, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-40, 40, 40, -40, 0.01, 10000);
    const assembly = new T.Group();
    scene.add(assembly);

    // Large luminous studio cards create broad, photographic metal reflections.
    const room = new T.Scene();
    room.background = new T.Color(0x343a38);
    const panel = (color, intensity, size, position, rotation) => {
      const card = new T.Mesh(new T.PlaneGeometry(...size), new T.MeshBasicMaterial({ color, side: T.DoubleSide }));
      card.material.color.multiplyScalar(intensity);
      card.position.set(...position);
      card.rotation.set(...rotation);
      room.add(card);
    };
    panel(0xe9f2ff, 4, [9, 12], [-6, 5, 1], [0, Math.PI / 2, 0]);
    panel(0xffffff, 1.4, [4, 10], [3, 8, 1], [Math.PI / 2, 0, 0]);
    panel(0xf6c69b, 1.4, [4, 11], [7, 2, -4], [0, -Math.PI / 2, 0]);
    const pmrem = new T.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    room.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
    pmrem.dispose();
    root.addEventListener('cad-dispose', () => {
      scene.traverse((object) => {
        object.geometry?.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => { material?.map?.dispose(); material?.dispose(); });
      });
      environment.dispose(); renderer.dispose();
    }, { once: true });
    scene.add(new T.HemisphereLight(0xf3f5f1, 0x302a24, 0.6));
    const light = (color, intensity, position) => {
      const lamp = new T.DirectionalLight(color, intensity);
      lamp.position.set(...position);
      scene.add(lamp);
      return lamp;
    };
    const keyLight = light(0xfff5e7, 1.6, [-50, 90, 60]);
    light(0xaecce7, 0.6, [70, 40, -45]);
    light(0xffc998, 0.5, [-25, 12, -70]);

    const loader = new T.GLTFLoader();
    const loadModel = (path) => new Promise((resolve, reject) => loader.load(path, (gltf) => resolve(gltf.scene), undefined, reject));
    const source = await loadModel(modelName === 'framework'
      ? '/assets/models/framework-esp32/framework-board.glb'
      : '/assets/models/tramtrace/tramtrace-kicad-source.glb');
    const framework = modelName === 'framework';
    const boardMaterialOffset = framework ? 15 : 28;
    const materialCopies = new Map();
    source.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const style = (original) => {
        if (materialCopies.has(original)) return materialCopies.get(original);
        const material = original.clone();
        const index = Number(material.name.replace('mat_', ''));
        if (index === boardMaterialOffset) {
          material.color.setHex(framework ? 0xc8ac66 : 0xb9bfc1);
          material.metalness = 0.84; material.roughness = 0.29;
        } else if (index === boardMaterialOffset + 1) {
          material.color.setHex(0xe9e8dd);
          material.metalness = 0; material.roughness = 0.78;
          material.transparent = false; material.opacity = 1;
          material.polygonOffset = true; material.polygonOffsetFactor = -2;
        } else if (index === boardMaterialOffset + 2) {
          // Match the manufactured black soldermask without altering geometry.
          material.color.setHex(0x111918).convertSRGBToLinear();
          material.metalness = 0.05; material.roughness = 0.42;
          material.transparent = false; material.opacity = 1;
        } else if (index === boardMaterialOffset + 3) {
          material.color.setHex(0x1a201b).convertSRGBToLinear();
          material.metalness = 0; material.roughness = 0.78;
        } else {
          const color = material.color;
          const bright = Math.max(color.r, color.g, color.b);
          const neutral = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) < 0.15;
          material.metalness = bright > 0.32 && neutral ? 0.78 : 0.05;
          material.roughness = bright > 0.32 && neutral ? 0.3 : 0.6;
          if (framework && index === 9) {
            material.color.setHex(0x252b29).convertSRGBToLinear();
            material.metalness = 0.02; material.roughness = 0.74;
          } else if ((framework && index === 10) || (!framework && index === 18)) {
            material.color.setHex(0xadb7b8).convertSRGBToLinear();
            material.metalness = 0.94; material.roughness = 0.36;
          }
        }
        material.envMapIntensity = index === boardMaterialOffset + 2 ? 0.035 : material.metalness < 0.2 ? 0.12 : 0.55;
        materialCopies.set(original, material);
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(style) : style(object.material);
      if ((Array.isArray(object.material) ? object.material : [object.material]).some((m) => m.name === `mat_${boardMaterialOffset + 1}`)) object.visible = false;
    });
    // Native KiCad GLB coordinates are metres; keep their handedness intact.
    source.scale.setScalar(1000);
    source.position.set(framework ? -140 : -144.055, 0, framework ? -142 : -102.065);
    assembly.add(source);
    const silk = await new Promise((resolve, reject) => new T.TextureLoader().load(framework
      ? '/assets/models/framework-esp32/framework-markings-silk.svg'
      : '/assets/images/v2/tramtrace-silk.svg', resolve, undefined, reject));
    silk.encoding = T.sRGBEncoding;
    silk.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    let markingGeometry = new T.PlaneGeometry(framework ? 26 : 207.81, framework ? 30 : 94.55);
    if (framework) {
      const shape = new T.Shape();
      shape.moveTo(-13, -15); shape.lineTo(13, -15); shape.lineTo(13, 15); shape.lineTo(-13, 15); shape.closePath();
      for (const x of [-11.3, 11.3]) { const hole = new T.Path(); hole.absarc(x, -4.5, 1.05, 0, Math.PI * 2, true); shape.holes.push(hole); }
      markingGeometry.dispose();
      markingGeometry = new T.ShapeGeometry(shape, 32);
      const positions = markingGeometry.getAttribute('position'), uv = markingGeometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i += 1) uv.setXY(i, (positions.getX(i) + 13) / 26, (positions.getY(i) + 15) / 30);
    }
    const markings = new T.Mesh(markingGeometry, new T.MeshStandardMaterial({ map: silk, transparent: true, alphaTest: 0.04, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, side: T.DoubleSide }));
    markings.rotation.x = -Math.PI / 2;
    markings.position.y = framework ? 0.62 : 1.62;
    markings.receiveShadow = true;
    assembly.add(markings);
    if (framework) {
      const usb = await loadModel('/assets/models/framework-esp32/framework-usbc.glb');
      const plug = usb.getObjectByName('P1');
      if (!plug) throw new Error('Connector geometry unavailable');
      if (plug.parent) plug.parent.remove(plug);
      plug.position.set(0, 0.6, -16.4);
      plug.rotation.set(-Math.PI / 2, 0, 0);
      plug.scale.setScalar(1000);
      plug.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.material = new T.MeshStandardMaterial({ color: new T.Color(0xa4adaf).convertSRGBToLinear(), metalness: 0.94, roughness: 0.27, envMapIntensity: 0.65, side: T.DoubleSide });
      });
      assembly.add(plug);
    } else {
      // C83 is unpopulated on the photographed production board.
      const c83 = source.getObjectByName('C83');
      if (c83) c83.visible = false;
    }
    const bounds = new T.Box3().setFromObject(assembly);
    const center = bounds.getCenter(new T.Vector3());
    assembly.position.sub(center);
    const size = bounds.getSize(new T.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    keyLight.position.set(-span * 1.1, span * 1.8, span * 1.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -span; keyLight.shadow.camera.right = span;
    keyLight.shadow.camera.top = span; keyLight.shadow.camera.bottom = -span;
    keyLight.shadow.camera.near = 0.1; keyLight.shadow.camera.far = span * 5;
    keyLight.shadow.bias = -0.0007;
    keyLight.shadow.normalBias = span * 0.002;
    const presets = {
      iso: { yaw: framework ? 145 : -14, pitch: framework ? 43 : 48 },
      top: { yaw: 0, pitch: 89.8 },
      side: { yaw: 110, pitch: 12 }
    };
    let yaw = presets.iso.yaw, pitch = presets.iso.pitch, zoom = 1;
    let pending = false, visible = true, disposed = false, pendingFrame = 0;
    let transition = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const interaction = new AbortController();
    const listen = (target, event, callback) => target.addEventListener(event, callback, { signal: interaction.signal });
    let aspect = 1, frameHeight = span * 1.12, stageWidth = 0, stageHeight = 0;
    const orientCamera = (cameraYaw = yaw, cameraPitch = pitch) => {
      const y = T.MathUtils.degToRad(cameraYaw), p = T.MathUtils.degToRad(cameraPitch);
      camera.position.set(span * 4 * Math.sin(y) * Math.cos(p), span * 4 * Math.sin(p), span * 4 * Math.cos(y) * Math.cos(p));
      camera.lookAt(0, 0, 0);
    };
    const updateCamera = () => {
      orientCamera();
      camera.top = frameHeight / zoom / 2;
      camera.bottom = -camera.top;
      camera.right = camera.top * aspect;
      camera.left = -camera.right;
      camera.updateProjectionMatrix();
    };
    const fittedHeight = (cameraYaw = yaw, cameraPitch = pitch) => {
      orientCamera(cameraYaw, cameraPitch);
      camera.updateMatrixWorld(true);
      const points = [];
      for (const x of [-size.x / 2, size.x / 2]) for (const y of [-size.y / 2, size.y / 2]) for (const z of [-size.z / 2, size.z / 2]) {
        points.push(new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      }
      const projection = new T.Box3().setFromPoints(points).getSize(new T.Vector3());
      return Math.max(projection.y, projection.x / aspect) * 1.22;
    };
    const fit = () => { frameHeight = fittedHeight(); };
    const stopTransition = (finish = false) => {
      if (transition && finish) {
        yaw = transition.to.yaw; pitch = transition.to.pitch;
        zoom = transition.to.zoom; frameHeight = transition.to.frameHeight;
      }
      transition = null;
      root.dataset.cadMotion = 'idle';
    };
    const animateCamera = (timestamp) => {
      if (!transition) return;
      if (transition.lastTime !== null) transition.elapsed += Math.max(0, timestamp - transition.lastTime);
      transition.lastTime = timestamp;
      const progress = Math.min(transition.elapsed / transition.duration, 1);
      // Quintic smoothstep: zero velocity and acceleration at both endpoints.
      const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
      const { from, to, arc } = transition;
      yaw = T.MathUtils.lerp(from.yaw, to.yaw, eased);
      pitch = T.MathUtils.lerp(from.pitch, to.pitch, eased);
      zoom = T.MathUtils.lerp(from.zoom, to.zoom, eased);
      // A slight pullback keeps the complete board readable through the orbit.
      frameHeight = T.MathUtils.lerp(from.frameHeight, to.frameHeight, eased) + Math.sin(Math.PI * eased) * arc;
      if (progress === 1) stopTransition(true);
    };
    const render = (timestamp = performance.now()) => {
      pending = false;
      pendingFrame = 0;
      if (disposed || !visible || document.hidden) return;
      animateCamera(timestamp);
      updateCamera();
      renderer.render(scene, camera);
      root.dataset.cadFrames = String(Number(root.dataset.cadFrames || 0) + 1);
      root.dataset.cadOrbit = [yaw, pitch, zoom].map((value) => value.toFixed(3)).join(',');
      if (transition) invalidate();
    };
    const invalidate = () => {
      if (!pending && !disposed) { pending = true; pendingFrame = requestAnimationFrame(render); }
    };
    const resize = () => {
      const width = Math.max(stage.clientWidth, 1), height = Math.max(stage.clientHeight, 1);
      if (width === stageWidth && height === stageHeight) return;
      stageWidth = width; stageHeight = height;
      aspect = width / height;
      renderer.setSize(width, height, false);
      if (transition) stopTransition(true);
      fit(); invalidate();
    };
    const buttons = [...root.querySelectorAll('[data-cad-view]')];
    const setPreset = (name, animate = true) => {
      if (disposed) return;
      const selected = presets[name] || presets.iso;
      stopTransition();
      // Normalize the delta, not the current angle, to avoid a long revolution
      // after several direct rotations or a jump across the ±180° seam.
      const delta = ((selected.yaw - yaw) % 360 + 540) % 360 - 180;
      const to = { yaw: yaw + delta, pitch: selected.pitch, zoom: 1, frameHeight: fittedHeight(selected.yaw, selected.pitch) };
      if (animate && !reducedMotion.matches && !root.hasAttribute('data-cad-capture')) {
        const from = { yaw, pitch, zoom, frameHeight };
        const middleHeight = fittedHeight(yaw + delta / 2, (pitch + selected.pitch) / 2);
        transition = {
          from, to, duration: 720, elapsed: 0, lastTime: null,
          arc: Math.max(0, middleHeight - (frameHeight + to.frameHeight) / 2) + Math.max(frameHeight, to.frameHeight) * 0.045
        };
        root.dataset.cadMotion = visible && !document.hidden ? 'transition' : 'paused';
      } else {
        yaw = to.yaw; pitch = to.pitch; zoom = to.zoom; frameHeight = to.frameHeight;
      }
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.cadView === name)));
      root.dataset.cadAngle = name;
      invalidate();
    };
    buttons.forEach((button) => { button.disabled = false; listen(button, 'click', () => setPreset(button.dataset.cadView)); });
    const markCustom = () => { buttons.forEach((button) => button.setAttribute('aria-pressed', 'false')); root.dataset.cadAngle = 'custom'; };
    let drag = null;
    canvas.style.touchAction = 'pan-y pinch-zoom';
    listen(canvas, 'pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      stopTransition();
      drag = { x: event.clientX, y: event.clientY, yaw, pitch, id: event.pointerId, touch: event.pointerType === 'touch' };
      root.dataset.cadMotion = 'dragging';
      canvas.setPointerCapture(event.pointerId);
    });
    listen(canvas, 'pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      yaw = drag.yaw - (event.clientX - drag.x) * 0.4;
      // Vertical touch gestures belong to page scrolling, including on the model.
      if (!drag.touch) pitch = T.MathUtils.clamp(drag.pitch + (event.clientY - drag.y) * 0.3, -75, 89.8);
      markCustom(); invalidate();
    });
    const release = () => { drag = null; if (!transition) root.dataset.cadMotion = 'idle'; };
    listen(canvas, 'pointerup', release);
    listen(canvas, 'pointercancel', release);
    listen(canvas, 'lostpointercapture', release);
    listen(canvas, 'keydown', (event) => {
      if (event.key === 'Home') { setPreset('iso'); event.preventDefault(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'].includes(event.key)) return;
      stopTransition();
      let handled = true;
      if (event.key === 'ArrowLeft') yaw += 10;
      else if (event.key === 'ArrowRight') yaw -= 10;
      else if (event.key === 'ArrowUp') pitch = Math.min(pitch + 8, 89.8);
      else if (event.key === 'ArrowDown') pitch = Math.max(pitch - 8, -75);
      else if (event.key === '+' || event.key === '=') zoom = Math.min(zoom * 1.12, 2);
      else if (event.key === '-' || event.key === '_') zoom = Math.max(zoom / 1.12, 0.6);
      else handled = false;
      if (handled) { event.preventDefault(); markCustom(); invalidate(); }
    });
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${framework ? 'Framework ESP32' : 'TramTrace'} source CAD model. Drag horizontally to rotate. Arrow keys rotate, plus and minus zoom, Home resets.`);
    canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown + - Home');
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    const synchronizeVisibility = () => {
      if (disposed) return;
      if (!visible || document.hidden) {
        if (pendingFrame) cancelAnimationFrame(pendingFrame);
        pendingFrame = 0; pending = false;
        if (transition) { transition.lastTime = null; root.dataset.cadMotion = 'paused'; }
      } else {
        if (transition) { transition.lastTime = null; root.dataset.cadMotion = 'transition'; }
        invalidate();
      }
    };
    const intersection = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; synchronizeVisibility(); });
    intersection.observe(canvas);
    listen(document, 'visibilitychange', synchronizeVisibility);
    listen(reducedMotion, 'change', () => { if (reducedMotion.matches && transition) { stopTransition(true); invalidate(); } });
    listen(canvas, 'webglcontextlost', (event) => { event.preventDefault(); root.dispatchEvent(new Event('cad-unavailable')); });
    root.addEventListener('cad-dispose', () => {
      disposed = true;
      stopTransition();
      interaction.abort();
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = 0; pending = false; drag = null;
      observer.disconnect(); intersection.disconnect();
    }, { once: true });
    resize(); setPreset('iso', false);
    // Draw once before replacing the still: no blank intermediate state.
    updateCamera(); renderer.render(scene, camera);
    // Source geometry and studio lights stay fixed while the camera moves.
    // Reuse their shadow maps for the complete transition.
    renderer.shadowMap.autoUpdate = false;
    root.dataset.cadSource = 'kicad-glb';
    return { setPreset, render };
  }

  document.querySelectorAll('[data-cad-hero]').forEach((root) => {
    const button = root.querySelector('[data-cad-start]');
    const canvas = root.querySelector('[data-cad-canvas]');
    const poster = root.querySelector('[data-cad-poster]');
    const status = root.querySelector('[data-cad-status]');
    if (!button || !canvas) return;
    root.dataset.cadState = 'poster';
    canvas.hidden = true;
    root.querySelectorAll('[data-cad-view]').forEach((view) => { view.disabled = true; });
    const unavailable = () => {
      root.dispatchEvent(new Event('cad-dispose'));
      root.dataset.cadState = 'unavailable';
      canvas.hidden = true;
      if (poster) poster.hidden = false;
      button.hidden = false; button.disabled = true;
      button.textContent = '3D unavailable';
      root.querySelectorAll('[data-cad-view]').forEach((view) => { view.disabled = true; });
      if (status) status.textContent = 'The CAD still remains available. Explore the project for more detail.';
    };
    root.addEventListener('cad-unavailable', unavailable);
    button.addEventListener('click', async () => {
      if (root.dataset.cadState !== 'poster') return;
      root.dataset.cadState = 'loading';
      button.disabled = true; button.textContent = 'Opening CAD…';
      if (status) status.textContent = 'Loading the original board geometry…';
      try {
        await createStudio(root);
        canvas.hidden = false;
        if (poster) poster.hidden = true;
        button.hidden = true;
        root.dataset.cadState = 'ready';
        if (status) status.textContent = 'Drag to rotate · arrow keys to inspect · Home to reset';
        if (!root.hasAttribute('data-cad-capture')) canvas.focus({ preventScroll: true });
      } catch (error) {
        console.warn('CAD studio could not open:', error);
        unavailable();
      }
    });
  });
})();
