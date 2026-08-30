(() => {
  if (!window.THREE || !document.querySelector('[data-dual-usb-inspector]')) return;
  const THREE = window.THREE;

  // Let high-density displays resolve the fine PCB geometry more cleanly.
  const baseSetPixelRatio = THREE.WebGLRenderer.prototype.setPixelRatio;
  THREE.WebGLRenderer.prototype.setPixelRatio = function setDualUsbPixelRatio() {
    return baseSetPixelRatio.call(this, Math.min(window.devicePixelRatio || 1, 3));
  };

  // Three's default SVG image path tends to rasterise the KiCad artwork close
  // to its CSS size. Re-rasterise the original vector at 4096 px so references,
  // outlines and the Framework mark stay crisp when the camera moves in close.
  const baseTextureLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function loadDualUsbTexture(url, onLoad, onProgress, onError) {
    if (typeof url !== 'string' || !url.includes('framework-dual-usb-silk.svg')) {
      return baseTextureLoad.call(this, url, onLoad, onProgress, onError);
    }

    const fallback = () => baseTextureLoad.call(this, url, onLoad, onProgress, onError);
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then((source) => {
        const hi = source
          .replace(/width="[^"]*"/, 'width="4096"')
          .replace(/height="[^"]*"/, 'height="4726"');
        const objectUrl = URL.createObjectURL(new Blob([hi], { type: 'image/svg+xml' }));
        baseTextureLoad.call(this, objectUrl, (texture) => {
          URL.revokeObjectURL(objectUrl);
          if (onLoad) onLoad(texture);
        }, onProgress, (error) => {
          URL.revokeObjectURL(objectUrl);
          if (onError) onError(error);
          fallback();
        });
      })
      .catch(() => fallback());

    return new THREE.Texture();
  };

  // Capture only the scene created by this page; the actual viewer stays
  // encapsulated in its own IIFE and does not need to expose implementation
  // details globally.
  const baseSceneAdd = THREE.Scene.prototype.add;
  THREE.Scene.prototype.add = function addDualUsbSceneObject(...objects) {
    window.__dualUsbScene = this;
    return baseSceneAdd.apply(this, objects);
  };

  const makeBox = (group, size, position, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.raycast = () => {};
    group.add(mesh);
    return mesh;
  };

  const makeDot = (group, position, material, radius = 0.11) => {
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.03, 14), material);
    dot.position.set(...position);
    dot.raycast = () => {};
    group.add(dot);
    return dot;
  };

  const refine = () => {
    const scene = window.__dualUsbScene;
    if (!scene) { requestAnimationFrame(refine); return; }

    const named = {};
    let board = null;
    scene.traverse((object) => {
      if (object.name) named[object.name] = object;
      if (object.userData && object.userData.partRef === 'BOARD') board = object;
    });
    if (!named.U3 || !named.J1 || !named.J2) { requestAnimationFrame(refine); return; }
    if (scene.userData.dualUsbRefined) return;
    scene.userData.dualUsbRefined = true;

    const chipTop = new THREE.MeshStandardMaterial({ color: 0x2a2e31, roughness: 0.36, metalness: 0.04 });
    const mark = new THREE.MeshBasicMaterial({ color: 0xc2c7ca });
    const brightMetal = new THREE.MeshStandardMaterial({ color: 0xc1c6ca, roughness: 0.20, metalness: 0.90 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x747b81, roughness: 0.28, metalness: 0.80 });
    const white = new THREE.MeshBasicMaterial({ color: 0xf0eee7 });

    if (board && board.isMesh) {
      board.material = new THREE.MeshPhysicalMaterial({
        color: 0x2c7a4b,
        roughness: 0.42,
        metalness: 0.02,
        clearcoat: 0.16,
        clearcoatRoughness: 0.56
      });
    }

    // CH334F QFN: add the package top, exposed-pad hint and pin-1 marker.
    makeBox(named.U3, [3.54, 0.08, 3.54], [0, 0.82, 0], chipTop);
    makeBox(named.U3, [2.8, 0.04, 2.8], [0, 0.03, 0], darkMetal);
    makeDot(named.U3, [-1.35, 0.86, -1.35], mark, 0.16);

    // SOT-23-5/6 parts: retain the exact footprint placement while adding a
    // moulded top surface and visible pin-1 dot above the existing leads.
    ['U1', 'U4', 'U5', 'U6', 'U7'].forEach((ref) => {
      const group = named[ref];
      if (!group) return;
      makeBox(group, [1.34, 0.08, 2.48], [0, 1.10, 0], chipTop);
      makeDot(group, [-0.46, 1.16, -0.92], mark, 0.10);
    });

    // 0805 passives: add termination feet and the visible top finish. Resistors
    // receive a narrow marking band; capacitors get the ceramic top highlight.
    for (let i = 1; i <= 11; i += 1) {
      const group = named['C' + i];
      if (!group) continue;
      makeBox(group, [0.98, 0.07, 1.20], [0, 0.67, 0], white);
      [-0.94, 0.94].forEach((z) => makeBox(group, [1.24, 0.05, 0.44], [0, 0.03, z], brightMetal));
    }
    for (let i = 1; i <= 10; i += 1) {
      const group = named['R' + i];
      if (!group) continue;
      makeBox(group, [0.98, 0.07, 1.18], [0, 0.67, 0], chipTop);
      makeBox(group, [0.22, 0.03, 1.02], [0, 0.72, 0], mark);
      [-0.94, 0.94].forEach((z) => makeBox(group, [1.24, 0.05, 0.44], [0, 0.03, z], brightMetal));
    }

    // SOD-123FL transient suppressors: emphasise the moulded cap, polarity band
    // and solderable terminal feet without changing the KiCad body centre.
    ['D1', 'D2', 'D3'].forEach((ref) => {
      const group = named[ref];
      if (!group) return;
      makeBox(group, [1.56, 0.08, 2.44], [0, 0.93, 0], chipTop);
      makeBox(group, [1.62, 0.03, 0.24], [0, 0.98, -0.72], white);
      [-1.58, 1.58].forEach((z) => makeBox(group, [1.76, 0.05, 0.50], [0, 0.03, z], brightMetal));
    });

    if (named.X1) {
      makeBox(named.X1, [1.82, 0.04, 2.34], [0, 0.80, 0], white);
      [[-0.8, -1.1], [0.8, -1.1], [-0.8, 1.1], [0.8, 1.1]].forEach(([x, z]) =>
        makeBox(named.X1, [0.56, 0.05, 0.82], [x, 0.03, z], darkMetal));
    }

    // GCT USB4105 receptacles: add the tongue face and the four shell stakes
    // from the footprint drilling so both ports read as real board-mounted parts.
    ['J1', 'J2'].forEach((ref) => {
      const group = named[ref];
      makeBox(group, [5.68, 0.07, 4.90], [0, 1.92, -0.48], white);
      [[-4.31, 2.44], [4.31, 2.44], [-4.31, -1.74], [4.31, -1.74]].forEach(([x, z]) =>
        makeBox(group, [0.48, 0.24, 0.86], [x, 0.18, z], darkMetal));
    });
  };

  requestAnimationFrame(refine);
})();
