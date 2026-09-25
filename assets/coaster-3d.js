(() => {
  const root = document.querySelector('[data-coaster-inspector]');
  if (!root || !window.THREE) return;

  const stage = root.querySelector('[data-coaster-stage]');
  const canvas = root.querySelector('[data-coaster-canvas]');
  const status = root.querySelector('[data-coaster-status]');
  const lidButton = root.querySelector('[data-coaster-lid]');
  const explodeButton = root.querySelector('[data-coaster-explode]');
  const resetButton = root.querySelector('[data-coaster-reset]');
  const viewButtons = [...root.querySelectorAll('[data-coaster-view]')];
  const partPanel = root.querySelector('[data-coaster-part]');
  const partName = root.querySelector('[data-coaster-part-name]');
  const partDetail = root.querySelector('[data-coaster-part-detail]');
  const liveRegion = document.querySelector('[data-coaster-live]');
  const announce = (message) => { if (liveRegion) liveRegion.textContent = message; };
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  const scriptUrl = document.currentScript?.src ? new URL(document.currentScript.src, window.location.href) : null;
  const assetVersion = scriptUrl?.searchParams.get('v') || 'dev';
  const versionedAsset = (file) => `${file}?v=${encodeURIComponent(assetVersion)}`;

  const renderer = window.PortfolioExplorer?.createRenderer
    ? window.PortfolioExplorer.createRenderer(THREE, { canvas, antialias: true, alpha: true })
    : new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 3, 500);
  const target = new THREE.Vector3(0, 2.7, 0);

  scene.add(new THREE.HemisphereLight(0xe6ebe8, 0x121513, 1.18));
  const key = new THREE.DirectionalLight(0xfffcf6, 1.48); key.position.set(-55, 75, 42); scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8e6ed, 0.48); fill.position.set(54, 30, -62); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffdac3, 0.28); rim.position.set(-45, 16, -48); scene.add(rim);

  const cadRoot = new THREE.Group();
  cadRoot.rotation.x = -Math.PI / 2;
  scene.add(cadRoot);

  const mat = {
    base: new THREE.MeshPhysicalMaterial({ color: 0xb7c8c5, roughness: 0.20, metalness: 0, transparent: true, opacity: 0.16, transmission: 0.05, clearcoat: 0.46, clearcoatRoughness: 0.20, side: THREE.DoubleSide, depthWrite: false }),
    lid: new THREE.MeshPhysicalMaterial({ color: 0xc9d8d5, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.055, transmission: 0.025, clearcoat: 0.48, clearcoatRoughness: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    board: new THREE.MeshBasicMaterial({ color: 0x030404, side: THREE.DoubleSide }),
    leds: new THREE.MeshStandardMaterial({ color: 0xe6f4ec, roughness: 0.31, emissive: 0x55ffd4, emissiveIntensity: 0.52 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x151718, roughness: 0.48, metalness: 0.03 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xe2dfd8, roughness: 0.38, metalness: 0.01 }),
    optical: new THREE.MeshPhysicalMaterial({ color: 0x263b35, roughness: 0.2, metalness: 0.02, clearcoat: 0.28, clearcoatRoughness: 0.18 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb9bec0, roughness: 0.27, metalness: 0.78 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc99637, roughness: 0.28, metalness: 0.68 }),
    support: new THREE.MeshStandardMaterial({ color: 0x4c514f, roughness: 0.52, metalness: 0.16 })
  };

  const partSpecs = [
    { key: 'base', file: 'coaster-base.stl', material: mat.base, name: 'Bottom enclosure', detail: 'Exact Coaster Base.step geometry.', offset: [0, 0, -9], delay: 0.00 },
    { key: 'board', file: 'coaster-board.stl', material: mat.board, name: '80 mm PCB', detail: 'Black solder mask with exact KiCad F.Mask openings and F.SilkS artwork over the STEP board geometry.', offset: [0, 0, 0], delay: 0.00 },
    { key: 'support', file: 'coaster-support.stl', material: mat.support, name: 'Support components', detail: 'Passives, regulator and remaining fitted components grouped from the KiCad STEP assembly.', offset: [0, 0, 5.0], delay: 0.18 },
    { key: 'leds', file: 'coaster-led-ring.stl', material: mat.leds, name: '24 × RGB LEDs', detail: 'WS2812C-2020 ring using the exact fitted LED solids and board positions.', offset: [0, 0, 6.0], delay: 0.13 },
    { key: 'mcu', file: 'coaster-u3-mcu.stl', material: mat.chip, name: 'U3 · STM32C011F6P', detail: '48 MHz Cortex-M0+ MCU in TSSOP-20.', offset: [0, -2.5, 12.5], delay: 0.25 },
    { key: 'sht', file: 'coaster-u4-sht.stl', material: mat.ceramic, name: 'U4 · SHT4x', detail: 'Temperature and humidity sensor under the centre of the resin lid.', offset: [3.5, 2.5, 13.0], delay: 0.30 },
    { key: 'veml', file: 'coaster-u1-veml.stl', material: mat.optical, name: 'U1 · VEML7700', detail: 'Ambient-light sensor used for cup-shadow detection and brightness control.', offset: [-3.5, 4.5, 12.5], delay: 0.29 },
    { key: 'level', file: 'coaster-u6-level.stl', material: mat.chip, name: 'U6 · SN74LV1T34', detail: '3.3 V to 5 V logic buffer for the RGB data line.', offset: [7.5, -2.0, 10.5], delay: 0.31 },
    { key: 'usb', file: 'coaster-j1-usbc.stl', material: mat.metal, name: 'J1 · USB-C power', detail: '5 V power input; USB data pins are not connected.', offset: [0, 12.0, 6.5], delay: 0.10 },
    { key: 'swd', file: 'coaster-j2-swd.stl', material: mat.gold, name: 'J2 · SWD pogo pads', detail: 'Four plated programming targets: GND, SWDIO, SWCLK and 3.3 V reference. The PCB has no fitted J2 connector body.', offset: [0, 5.0, 10.0], delay: 0.26 },
    { key: 'lid', file: 'coaster-lid.stl', material: mat.lid, name: 'Clear resin lid', detail: 'Exact Coaster Lid.step geometry; the central cup-contact region is 3 mm thick.', offset: [0, 0, 18.0], delay: 0.04, transparent: true }
  ];

  const parseBinarySTL = (buffer) => {
    if (buffer.byteLength < 84) throw new Error('Invalid STL');
    const view = new DataView(buffer);
    const triangles = view.getUint32(80, true);
    if (84 + triangles * 50 > buffer.byteLength) throw new Error('Invalid binary STL');
    const positions = new Float32Array(triangles * 9);
    let offset = 84, out = 0;
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      offset += 12;
      for (let vertex = 0; vertex < 3; vertex += 1) {
        positions[out++] = view.getFloat32(offset, true); offset += 4;
        positions[out++] = view.getFloat32(offset, true); offset += 4;
        positions[out++] = view.getFloat32(offset, true); offset += 4;
      }
      offset += 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };

  const wrappers = new Map();
  const pickMeshes = [];
  let loaded = 0;
  let surfaceLoaded = 0;
  let surfaceSetupStarted = false;
  let backSurfaceSetupStarted = false;
  let ensureBackSurface = () => {};
  let lidVisible = true;
  let explodeTarget = 0;
  let explodeProgress = 0;
  let needsRender = true;

  const invalidate = () => { needsRender = true; };
  motionQuery.addEventListener?.('change', (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      yaw = targetYaw;
      pitch = targetPitch;
      distance = targetDistance;
      explodeProgress = explodeTarget;
    }
    invalidate();
  });

  const maybeReady = () => {
    if (loaded !== partSpecs.length || surfaceLoaded !== 2) return;
    status.textContent = 'STEP + KiCad board surfaces loaded';
    status.classList.add('is-ready');
    announce('Coaster source-derived 3D model ready');
  };
  mat.board.toneMapped = false;

  const attachBoardSurface = (manifest) => {
    if (surfaceSetupStarted) return;
    const boardWrapper = wrappers.get('board');
    const registration = manifest?.surface_registration;
    const assets = manifest?.surface_assets;
    if (!boardWrapper || !registration || !assets) return;
    surfaceSetupStarted = true;

    const [vx, vy, vw, vh] = registration.svg_viewbox_mm;
    const [boardCx, boardCy] = registration.board_center_svg_mm;
    const pageCx = vx + vw / 2;
    const pageCy = vy + vh / 2;
    const localX = pageCx - boardCx;
    const localY = boardCy - pageCy;
    const boardBottom = registration.board_bottom_z_mm;
    const boardTop = registration.board_top_z_mm;

    const addSurface = (asset, zPosition, renderOrder, label, countForReady) => {
      if (!asset?.file) {
        console.warn(`Coaster ${label} asset metadata missing`);
        return;
      }
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        alphaTest: 0.004,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      material.toneMapped = false;
      const overlay = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), material);
      overlay.position.set(localX, localY, zPosition);
      overlay.renderOrder = renderOrder;
      overlay.frustumCulled = false;
      overlay.raycast = () => {};
      boardWrapper.add(overlay);

      new THREE.TextureLoader().load(
        `${assetBase}${asset.file}?v=${asset.sha256?.slice(0, 16) || assetVersion}`,
        (texture) => {
          texture.encoding = THREE.sRGBEncoding;
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
          texture.generateMipmaps = true;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          material.map = texture;
          material.needsUpdate = true;
          invalidate();
          if (countForReady) {
            surfaceLoaded += 1;
            maybeReady();
          }
        },
        undefined,
        (error) => {
          status.textContent = `KiCad ${label} unavailable`;
          status.classList.remove('is-ready');
          console.warn(`Coaster ${label} texture failed to load`, error);
        }
      );
    };

    // The generated opening texture combines exact F.Mask with F.Cu: copper-backed
    // openings use the representative plated-copper finish while copper-clearance
    // openings show laminate.  F.SilkS sits above that with mask subtraction
    // already applied by KiCad's plotter.
    addSurface(assets.front_mask_openings, boardTop + 0.020, 105, 'front solder-mask openings', true);
    addSurface(assets.front_silkscreen, boardTop + 0.050, 110, 'front silkscreen', true);
    ensureBackSurface = () => {
      if (backSurfaceSetupStarted) return;
      backSurfaceSetupStarted = true;
      addSurface(assets.back_mask_openings, boardBottom - 0.020, 105, 'back solder-mask openings', false);
      addSurface(assets.back_silkscreen, boardBottom - 0.050, 110, 'back silkscreen', false);
    };
  };

  let surfaceManifest = null;
  fetch(versionedAsset('assets/models/coaster/manifest.json'))
    .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then((manifest) => {
      surfaceManifest = manifest;
      attachBoardSurface(manifest);
      invalidate();
    })
    .catch((error) => {
      status.textContent = 'KiCad board surface metadata unavailable';
      console.warn('Coaster surface manifest failed to load', error);
    });

  const setPartPanel = (spec) => {
    if (!partPanel || !partName || !partDetail) return;
    if (!spec) {
      partPanel.classList.remove('is-active');
      partName.textContent = 'Assembly map';
      partDetail.textContent = 'Point to or tap the enclosure, PCB or a component group to identify it.';
      return;
    }
    partPanel.classList.add('is-active');
    partName.textContent = spec.name;
    partDetail.textContent = spec.detail;
  };

  const assetBase = 'assets/models/coaster/';
  partSpecs.forEach((spec) => {
    fetch(versionedAsset(assetBase + spec.file))
      .then((response) => { if (!response.ok) throw new Error(`${spec.file}: HTTP ${response.status}`); return response.arrayBuffer(); })
      .then((buffer) => {
        const geometry = parseBinarySTL(buffer);
        // STEP/KiCad source coordinates use X/Y in the board plane and Z up.
        // Centre the exact 80 mm board datum before cadRoot rotates Z into WebGL Y.
        geometry.translate(-133.2, 94.59, 0);
        const wrapper = new THREE.Group();
        wrapper.userData.spec = spec;
        const mesh = new THREE.Mesh(geometry, spec.material);
        mesh.userData.spec = spec;
        mesh.renderOrder = spec.transparent ? 5 : 1;
        if (spec.transparent) mesh.raycast = () => {};
        wrapper.add(mesh);
        cadRoot.add(wrapper);
        wrappers.set(spec.key, wrapper);
        if (!spec.transparent) pickMeshes.push(mesh);
        loaded += 1;
        invalidate();
        if (spec.key === 'board' && surfaceManifest) attachBoardSurface(surfaceManifest);
        maybeReady();
      })
      .catch((error) => {
        console.warn('Coaster source mesh failed to load', error);
        status.textContent = 'Some source meshes unavailable';
      });
  });

  const presets = {
    iso: { yaw: -36, pitch: 29, distance: 142 },
    top: { yaw: 0, pitch: 86, distance: 132 },
    bottom: { yaw: 180, pitch: -84, distance: 132 },
    side: { yaw: -90, pitch: 9, distance: 136 }
  };
  let yaw = THREE.MathUtils.degToRad(presets.iso.yaw);
  let pitch = THREE.MathUtils.degToRad(presets.iso.pitch);
  let distance = presets.iso.distance;
  let targetYaw = yaw, targetPitch = pitch, targetDistance = distance;
  let dragging = false, lastX = 0, lastY = 0;

  const setPreset = (key, speak = true) => {
    const preset = presets[key] || presets.iso;
    targetYaw = THREE.MathUtils.degToRad(preset.yaw);
    targetPitch = THREE.MathUtils.degToRad(preset.pitch);
    targetDistance = preset.distance;
    if (key === 'bottom') ensureBackSurface();
    if (reducedMotion) {
      yaw = targetYaw;
      pitch = targetPitch;
      distance = targetDistance;
    }
    invalidate();
    viewButtons.forEach((button) => {
      const active = button.dataset.coasterView === key;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (speak) announce(`${key} camera selected`);
  };

  viewButtons.forEach((button) => button.addEventListener('click', () => setPreset(button.dataset.coasterView)));

  lidButton?.addEventListener('click', () => {
    lidVisible = !lidVisible;
    const lid = wrappers.get('lid');
    if (lid) lid.visible = lidVisible;
    invalidate();
    lidButton.setAttribute('aria-pressed', String(lidVisible));
    lidButton.textContent = lidVisible ? 'Hide lid' : 'Show lid';
    announce(lidVisible ? 'Clear lid shown' : 'Clear lid hidden');
  });

  explodeButton?.addEventListener('click', () => {
    explodeTarget = explodeTarget > 0.5 ? 0 : 1;
    if (reducedMotion) explodeProgress = explodeTarget;
    invalidate();
    explodeButton.setAttribute('aria-pressed', String(explodeTarget > 0.5));
    explodeButton.textContent = explodeTarget > 0.5 ? 'Assemble' : 'Explode';
    announce(explodeTarget > 0.5 ? 'Exploding coaster assembly' : 'Assembling coaster');
  });

  resetButton?.addEventListener('click', () => {
    explodeTarget = 0;
    if (reducedMotion) explodeProgress = 0;
    explodeButton?.setAttribute('aria-pressed', 'false');
    if (explodeButton) explodeButton.textContent = 'Explode';
    lidVisible = true;
    const lid = wrappers.get('lid');
    if (lid) lid.visible = true;
    lidButton?.setAttribute('aria-pressed', 'true');
    if (lidButton) lidButton.textContent = 'Hide lid';
    setPreset('iso', false);
    setPartPanel(null);
    invalidate();
    announce('Coaster 3D view reset');
  });

  const clampPitch = (value) => THREE.MathUtils.clamp(value, THREE.MathUtils.degToRad(-88), THREE.MathUtils.degToRad(88));
  stage.addEventListener('pointerdown', (event) => {
    dragging = true; lastX = event.clientX; lastY = event.clientY;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    targetYaw -= (event.clientX - lastX) * 0.008;
    targetPitch = clampPitch(targetPitch + (event.clientY - lastY) * 0.006);
    invalidate();
    lastX = event.clientX; lastY = event.clientY;
  });
  const stopDrag = (event) => {
    dragging = false; stage.classList.remove('is-dragging');
    if (event?.pointerId !== undefined && stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  stage.addEventListener('pointerup', stopDrag);
  stage.addEventListener('pointercancel', stopDrag);
  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    targetDistance = THREE.MathUtils.clamp(targetDistance + event.deltaY * 0.06, 92, 205);
    invalidate();
  }, { passive: false });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const identifyNdc = (x, y, speak = false) => {
    if (!pickMeshes.length) return;
    pointer.x = x;
    pointer.y = y;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickMeshes, false)[0];
    const spec = hit?.object?.userData?.spec || null;
    setPartPanel(spec);
    if (speak && spec) announce(`${spec.name}. ${spec.detail}`);
  };
  const identifyAt = (event) => {
    if (dragging) return;
    const rect = canvas.getBoundingClientRect();
    identifyNdc(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  };
  stage.addEventListener('pointermove', identifyAt);
  stage.addEventListener('click', identifyAt);
  stage.addEventListener('pointerleave', () => { if (!dragging) setPartPanel(null); });

  stage.addEventListener('keydown', (event) => {
    const step = THREE.MathUtils.degToRad(4);
    if (event.key === 'ArrowLeft') targetYaw += step;
    else if (event.key === 'ArrowRight') targetYaw -= step;
    else if (event.key === 'ArrowUp') targetPitch = clampPitch(targetPitch + step);
    else if (event.key === 'ArrowDown') targetPitch = clampPitch(targetPitch - step);
    else if (event.key === 'Enter' || event.key === ' ') {
      identifyNdc(0, 0, true);
      event.preventDefault();
      return;
    } else return;
    if (targetPitch < THREE.MathUtils.degToRad(-20)) ensureBackSurface();
    if (reducedMotion) {
      yaw = targetYaw;
      pitch = targetPitch;
    }
    invalidate();
    event.preventDefault();
  });

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    invalidate();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  const smoothstep = (t) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
  let lastFrameTime = performance.now();
  const renderFrame = () => {
    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    const animating = !reducedMotion && (
      Math.abs(targetYaw - yaw) > 0.0001 ||
      Math.abs(targetPitch - pitch) > 0.0001 ||
      Math.abs(targetDistance - distance) > 0.01 ||
      Math.abs(explodeTarget - explodeProgress) > 0.0001
    );
    if (!needsRender && !animating) return;
    if (reducedMotion) {
      yaw = targetYaw;
      pitch = targetPitch;
      distance = targetDistance;
      explodeProgress = explodeTarget;
    } else {
      const smoothing = 1 - Math.pow(0.001, dt);
      yaw += (targetYaw - yaw) * smoothing;
      pitch += (targetPitch - pitch) * smoothing;
      distance += (targetDistance - distance) * smoothing;
      explodeProgress += (explodeTarget - explodeProgress) * (1 - Math.pow(0.018, dt));
    }
    if (Math.abs(explodeTarget - explodeProgress) < 0.0001) explodeProgress = explodeTarget;
    if (pitch < THREE.MathUtils.degToRad(-20)) ensureBackSurface();

    partSpecs.forEach((spec) => {
      const wrapper = wrappers.get(spec.key);
      if (!wrapper) return;
      const raw = THREE.MathUtils.clamp((explodeProgress - spec.delay) / Math.max(0.001, 1 - spec.delay), 0, 1);
      const t = smoothstep(raw);
      wrapper.position.set(spec.offset[0] * t, spec.offset[1] * t, spec.offset[2] * t);
    });

    const cp = Math.cos(pitch);
    camera.position.set(
      target.x + distance * cp * Math.sin(yaw),
      target.y + distance * Math.sin(pitch),
      target.z + distance * cp * Math.cos(yaw)
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    needsRender = false;
  };

  setPartPanel(null);
  setPreset('iso', false);
  if (window.PortfolioExplorer?.start) window.PortfolioExplorer.start(renderFrame, stage);
  else {
    const animate = () => { requestAnimationFrame(animate); renderFrame(); };
    animate();
  }
})();
