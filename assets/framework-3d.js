(() => {
  const root = document.querySelector('[data-framework-inspector]');
  if (!root || !window.THREE) return;

  const stage = root.querySelector('[data-framework-stage]');
  const canvas = root.querySelector('[data-framework-canvas]');
  const status = root.querySelector('[data-framework-status]');
  const shellButton = root.querySelector('[data-framework-shell]');
  const explodeButton = root.querySelector('[data-framework-explode]');
  const resetButton = root.querySelector('[data-framework-reset]');
  const viewButtons = [...root.querySelectorAll('[data-framework-view]')];
  const liveRegion = document.querySelector('[data-framework-live]');

  const announce = (message) => {
    if (liveRegion) liveRegion.textContent = message;
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 300);
  const target = new THREE.Vector3(0, 3.2, -15.4);

  const hemi = new THREE.HemisphereLight(0xddeaf2, 0x1b1511, 1.35);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-24, 40, 30);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8cc8ff, 0.85);
  fill.position.set(30, 16, -36);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffc58f, 0.7);
  rim.position.set(-30, 6, -20);
  scene.add(rim);

  const assembly = new THREE.Group();
  scene.add(assembly);

  const boardGroup = new THREE.Group();
  assembly.add(boardGroup);
  // The KiCad board coordinate system originally entered the enclosure backwards.
  // Rotate the complete PCB assembly about its 26 x 30 mm centre, leaving the shell fixed.
  boardGroup.rotation.y = Math.PI;
  boardGroup.position.z = -30;

  // Mirror the physical card about the longitudinal centreline that runs through
  // the USB-C mating axis (local x = 0). Keep the connector itself outside this
  // group so its pin numbering/contact geometry is not mirrored left-to-right.
  const mirroredCardGroup = new THREE.Group();
  mirroredCardGroup.scale.x = -1;
  boardGroup.add(mirroredCardGroup);

  const shellGroup = new THREE.Group();
  assembly.add(shellGroup);
  // The enclosure belongs to the mirrored mechanical assembly as well.
  shellGroup.scale.x = -1;

  const fallbackGroup = new THREE.Group();
  mirroredCardGroup.add(fallbackGroup);
  const kicadGroup = new THREE.Group();
  mirroredCardGroup.add(kicadGroup);

  const boardMaterial = new THREE.MeshStandardMaterial({
    color: 0x111214,
    roughness: 0.5,
    metalness: 0.08
  });
  const blackChip = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.45, metalness: 0.06 });
  const moduleMetal = new THREE.MeshStandardMaterial({ color: 0xbfc4c6, roughness: 0.25, metalness: 0.72 });
  const connectorMetal = new THREE.MeshStandardMaterial({ color: 0xa8adaf, roughness: 0.28, metalness: 0.8 });
  const copperMaterial = new THREE.MeshStandardMaterial({ color: 0xc9a45e, roughness: 0.42, metalness: 0.55 });
  const whiteSilk = new THREE.MeshBasicMaterial({ color: 0xe5e3dc });

  const exportedBoardThickness = 0.6;
  const boardThickness = 0.46;
  const boardBottomY = 3.04;
  const boardY = boardBottomY + boardThickness / 2;
  const boardTopY = boardBottomY + boardThickness;
  const board = new THREE.Mesh(new THREE.BoxGeometry(26, boardThickness, 30), boardMaterial);
  board.position.set(0, boardY, -15);
  fallbackGroup.add(board);

  // Complete KiCad F.SilkS plot. Keep it rigidly attached to the PCB; unlike
  // components it never becomes a separate exploded layer.
  const markingMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.02,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false
  });
  markingMaterial.toneMapped = false;
  const markingOverlay = new THREE.Mesh(new THREE.PlaneGeometry(26, 30), markingMaterial);
  // Keep the KiCad Y-down artwork registered to board Z while presenting the
  // plane's front face upward. The previous +90 degree rotation exposed the
  // back face of the texture, which made all text read mirrored.
  markingOverlay.rotation.x = -Math.PI / 2;
  markingOverlay.scale.y = -1;
  markingOverlay.position.set(0, boardTopY + 0.18, -15);
  markingOverlay.renderOrder = 120;
  markingOverlay.visible = false;
  mirroredCardGroup.add(markingOverlay);

  const markingTextureLoader = new THREE.TextureLoader();
  markingTextureLoader.load(
    'assets/models/framework-esp32/framework-markings-silk.svg',
    (texture) => {
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // Keep the KiCad X axis unmirrored so footprint references and outlines
      // remain registered to the physical components. The plane transform
      // below already handles the board's Y/Z orientation.
      markingMaterial.map = texture;
      markingMaterial.needsUpdate = true;
      markingOverlay.visible = true;
    },
    undefined,
    (error) => console.warn('Framework silkscreen overlay failed to load', error)
  );

  // Slightly lighter board edge makes the 0.6 mm laminate readable at grazing angles.
  const boardEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(board.geometry),
    new THREE.LineBasicMaterial({ color: 0x696b6b, transparent: true, opacity: 0.52 })
  );
  board.add(boardEdge);

  // Molex 105444 edge plug. Reconstructed from the Molex customer drawing:
  // 8.25 x 2.40 mm shell, 12.00 mm overall length, 7.70 mm mating section,
  // 6.83 x 1.30 mm inner opening, 5.50 mm contact span and 0.50 mm pitch.
  // The footprint origin is the termination datum; its PCB edge is 0.96 mm
  // forward of that datum, so the mating section correctly protrudes.
  const usbGroup = new THREE.Group();
  // The enclosure nose extends roughly 2 mm beyond the PCB edge. Shift the
  // rendered connector forward relative to the footprint datum so the mating
  // shell sits naturally through the housing aperture rather than too far in.
  const usbMountedZ = 1.4;
  usbGroup.position.set(0, boardTopY + 0.90, usbMountedZ);
  // Match the exact CAD orientation: rotate the fallback 180 degrees about
  // its mating axis so the former lower contact row is on top and vice versa.
  usbGroup.rotation.z = Math.PI;
  boardGroup.add(usbGroup);
  const exactUsbGroup = new THREE.Group();
  boardGroup.add(exactUsbGroup);
  const addUsbPart = (geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material.clone ? material.clone() : material);
    mesh.position.set(...position);
    usbGroup.add(mesh);
    return mesh;
  };
  const roundedRectPath = (path, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    path.moveTo(x + r, y);
    path.lineTo(x + width - r, y);
    path.quadraticCurveTo(x + width, y, x + width, y + r);
    path.lineTo(x + width, y + height - r);
    path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    path.lineTo(x + r, y + height);
    path.quadraticCurveTo(x, y + height, x, y + height - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
  };
  const usbRingGeometry = (outerW, outerH, innerW, innerH, depth, outerR, innerR) => {
    const shape = new THREE.Shape();
    roundedRectPath(shape, -outerW / 2, -outerH / 2, outerW, outerH, outerR);
    const hole = new THREE.Path();
    roundedRectPath(hole, -innerW / 2, -innerH / 2, innerW, innerH, innerR);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 12,
      steps: 1
    });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  };
  const usbRoundedBlockGeometry = (width, height, depth, radius) => {
    const shape = new THREE.Shape();
    roundedRectPath(shape, -width / 2, -height / 2, width, height, radius);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 8,
      steps: 1
    });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  };

  const matingRearZ = 2.30;
  const matingTipZ = 10.00;
  const matingDepth = matingTipZ - matingRearZ;
  addUsbPart(
    usbRingGeometry(8.25, 2.40, 6.83, 1.30, matingDepth, 1.05, 0.57),
    connectorMetal,
    [0, 0, (matingRearZ + matingTipZ) / 2]
  );
  // Front spring/lip and rear shell transition from the Molex profile.
  addUsbPart(usbRingGeometry(8.30, 2.50, 6.75, 1.22, 0.34, 1.08, 0.54), connectorMetal, [0, 0, 9.83]);
  addUsbPart(usbRingGeometry(8.25, 2.40, 6.83, 1.30, 2.30, 1.05, 0.57), connectorMetal, [0, 0, 1.15]);
  const usbCoreMaterial = new THREE.MeshStandardMaterial({ color: 0x242526, roughness: 0.67, metalness: 0.03 });
  addUsbPart(usbRoundedBlockGeometry(5.50, 0.80, 7.40, 0.20), usbCoreMaterial, [0, 0, 6.10]);
  const contactMaterial = new THREE.MeshStandardMaterial({ color: 0xd3ae5d, roughness: 0.32, metalness: 0.76 });
  const contactDepth = 6.84;
  const contactCentreZ = (2.34 + 9.18) / 2;
  for (let i = 0; i < 12; i += 1) {
    const x = -2.75 + i * 0.5;
    addUsbPart(new THREE.BoxGeometry(0.22, 0.035, contactDepth), contactMaterial, [x, 0.415, contactCentreZ]);
    if (i !== 5 && i !== 6) {
      addUsbPart(new THREE.BoxGeometry(0.22, 0.035, contactDepth), contactMaterial, [x, -0.415, contactCentreZ]);
    }
  }
  addUsbPart(usbRoundedBlockGeometry(6.84, 1.30, 2.0, 0.48), usbCoreMaterial, [0, 0, -1.0]);
  // Shell retention feet use the footprint's exact ±3.42 mm centres.
  addUsbPart(new THREE.BoxGeometry(0.70, 0.34, 1.15), connectorMetal, [-3.42, -0.86, -0.88]);
  addUsbPart(new THREE.BoxGeometry(0.70, 0.34, 1.15), connectorMetal, [3.42, -0.86, -0.88]);

  // Separate termination tails make this read as the actual straddle-mount male
  // plug instead of a receptacle. The bottom row omits B6/B7 (22 contacts total).
  for (let i = 0; i < 12; i += 1) {
    const x = -2.75 + i * 0.5;
    addUsbPart(new THREE.BoxGeometry(0.38, 0.045, 1.0), contactMaterial, [x, -0.58, -0.15]);
    if (i !== 5 && i !== 6) {
      addUsbPart(new THREE.BoxGeometry(0.38, 0.045, 1.0), contactMaterial, [x, 0.58, -0.15]);
    }
  }

  const kcToModel = (x, y, height = 1.0) => new THREE.Vector3(x - 140, boardTopY + height / 2, -(y - 127));

  // The board uses the Framework reference M2 mounting-hole positions.
  // Add fitted M2 pan-head screws so the PCB reads as mechanically retained.
  const screwMetal = new THREE.MeshStandardMaterial({ color: 0xaeb4b7, roughness: 0.28, metalness: 0.82 });
  const screwDrive = new THREE.MeshStandardMaterial({ color: 0x3d4143, roughness: 0.46, metalness: 0.5 });
  const screwGroup = new THREE.Group();
  const screwAssemblies = [];
  mirroredCardGroup.add(screwGroup);
  const addMountingScrew = (x, y) => {
    const p = kcToModel(x, y, 0);
    const screw = new THREE.Group();
    screw.position.set(p.x, 0, p.z);
    screw.userData.frameworkBasePosition = screw.position.clone();
    screwGroup.add(screw);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.85, 24), screwMetal);
    shaft.position.set(0, boardTopY - 0.58, 0);
    screw.add(shaft);

    const head = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.62, 0.58, 32), screwMetal);
    head.position.set(0, boardTopY + 0.28, 0);
    screw.add(head);

    const slotA = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.055, 0.22), screwDrive);
    slotA.position.set(0, boardTopY + 0.585, 0);
    screw.add(slotA);
    const slotB = slotA.clone();
    slotB.rotation.y = Math.PI / 2;
    screw.add(slotB);
    screwAssemblies.push(screw);
  };
  addMountingScrew(128.7, 146.5);
  addMountingScrew(151.3, 146.5);

  const addBoxPart = ({ x, y, sx, sz, h, material = blackChip, rotation = 0 }) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), material.clone ? material.clone() : material);
    mesh.position.copy(kcToModel(x, y, h));
    mesh.rotation.y = THREE.MathUtils.degToRad(-rotation);
    fallbackGroup.add(mesh);
    return mesh;
  };

  const esp32 = addBoxPart({ x: 140.1, y: 146.29, sx: 15.4, sz: 20, h: 2.25, material: moduleMetal, rotation: 180 });
  // Antenna end: a pale ceramic/RF region makes orientation obvious without pretending to be exact package CAD.
  const antenna = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.12, 4.2), new THREE.MeshStandardMaterial({ color: 0xe9e1cb, roughness: 0.76 }));
  antenna.position.set(esp32.position.x, esp32.position.y + 1.19, esp32.position.z - 5.35);
  fallbackGroup.add(antenna);

  const ch340 = addBoxPart({ x: 132.2575, y: 130.84, sx: 4.9, sz: 3.9, h: 1.25, rotation: -90 });
  const regulator = addBoxPart({ x: 148.37, y: 131.35, sx: 6.4, sz: 3.5, h: 1.75, rotation: 90 });
  const q1 = addBoxPart({ x: 139.8425, y: 133.85, sx: 3.0, sz: 1.5, h: 1.05, rotation: 180 });
  const q2 = addBoxPart({ x: 136.97, y: 132.7075, sx: 3.0, sz: 1.5, h: 1.05 });

  // A small set of passives and vias gives the simplified model PCB-scale detail.
  const passiveMaterial = new THREE.MeshStandardMaterial({ color: 0xd7d1c0, roughness: 0.7, metalness: 0.12 });
  [
    [-9.8, -7.4, 1.8, 0.9], [-7.1, -8.9, 1.3, 0.7], [7.4, -8.0, 1.6, 0.8],
    [9.6, -8.1, 1.3, 0.7], [-9.7, -12.1, 1.5, 0.8], [10.0, -11.2, 1.3, 0.7],
    [-10.2, -25.8, 1.2, 0.7], [10.1, -25.6, 1.2, 0.7]
  ].forEach(([x, z, sx, sz]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.55, sz), passiveMaterial);
    p.position.set(x, boardTopY + 0.30, z);
    fallbackGroup.add(p);
  });

  const viaGeometry = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16);
  [
    [-9.9, -4.1], [9.2, -4.9], [-7.4, -11.3], [6.8, -10.7], [-3.2, -14.8],
    [3.4, -15.7], [-9.7, -23.5], [9.4, -23.9], [-7.8, -28.0], [7.6, -28.2]
  ].forEach(([x, z]) => {
    const via = new THREE.Mesh(viaGeometry, copperMaterial);
    via.position.set(x, boardTopY + 0.03, z);
    fallbackGroup.add(via);
  });

  // Minimal copper-like traces: visual context only, deliberately not a replacement for the KiCad artwork.
  const traceMaterial = new THREE.LineBasicMaterial({ color: 0xa8854b, transparent: true, opacity: 0.42 });
  const addTrace = (pts) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, boardTopY + 0.055, z)));
    fallbackGroup.add(new THREE.Line(geometry, traceMaterial));
  };
  addTrace([[-1.5, -3.7], [-1.5, -7], [-3.8, -9.3], [-3.8, -11.8]]);
  addTrace([[2.0, -4.0], [5.8, -6.7], [6.8, -10.7]]);
  addTrace([[-6.7, -4.0], [-6.8, -8.9], [-4.8, -10.9]]);
  addTrace([[8.1, -6.2], [8.1, -10.2], [6.5, -12.0]]);

  // Simple silkscreen marks reinforce that the black slab is a PCB rather than a generic plate.
  const silkGeo = new THREE.PlaneGeometry(5.5, 0.11);
  const silkA = new THREE.Mesh(silkGeo, whiteSilk);
  silkA.rotation.x = -Math.PI / 2;
  silkA.position.set(-9.2, boardTopY + 0.07, -16.4);
  fallbackGroup.add(silkA);
  const silkB = silkA.clone();
  silkB.scale.x = 0.55;
  silkB.position.set(-10.4, boardTopY + 0.07, -17.1);
  fallbackGroup.add(silkB);

  const materialsFor = (mesh) => {
    if (!mesh || !mesh.material) return [];
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  };

  // Every populated part gets its own staged explode transform. Base transforms
  // are captured once so assembly is perfectly reversible rather than relying
  // on accumulated frame-to-frame offsets.
  const componentExplodeParts = [];
  const registerExplodePart = (object, options = {}) => {
    if (!object || componentExplodeParts.some((part) => part.object === object)) return;
    const offset = options.offset || new THREE.Vector3();
    const rotation = options.rotation || new THREE.Euler();
    const basePosition = object.position.clone();
    const baseQuaternion = object.quaternion.clone();
    const deltaQuaternion = new THREE.Quaternion().setFromEuler(rotation);
    componentExplodeParts.push({
      object,
      basePosition,
      targetPosition: basePosition.clone().add(offset),
      baseQuaternion,
      targetQuaternion: baseQuaternion.clone().multiply(deltaQuaternion),
      delay: THREE.MathUtils.clamp(options.delay || 0, 0, 0.72)
    });
  };

  const registerFallbackExplodeParts = () => {
    const d = THREE.MathUtils.degToRad;
    registerExplodePart(usbGroup, { offset: new THREE.Vector3(0, 5.4, 9.5), rotation: new THREE.Euler(d(-7), 0, d(5)), delay: 0.10 });
    registerExplodePart(esp32, { offset: new THREE.Vector3(0, 11.8, -3.5), rotation: new THREE.Euler(d(9), d(-5), d(-10)), delay: 0.21 });
    registerExplodePart(ch340, { offset: new THREE.Vector3(-4.2, 8.0, 1.8), rotation: new THREE.Euler(d(7), d(-5), d(10)), delay: 0.29 });
    registerExplodePart(regulator, { offset: new THREE.Vector3(4.0, 7.6, 1.8), rotation: new THREE.Euler(d(-7), d(6), d(-10)), delay: 0.31 });
    registerExplodePart(q1, { offset: new THREE.Vector3(2.2, 5.8, 1.8), rotation: new THREE.Euler(d(5), d(2), d(9)), delay: 0.36 });
    registerExplodePart(q2, { offset: new THREE.Vector3(-2.2, 5.5, 1.7), rotation: new THREE.Euler(d(-5), d(-2), d(-9)), delay: 0.39 });
    registerExplodePart(antenna, { offset: new THREE.Vector3(0, 10.9, -3.5), rotation: new THREE.Euler(d(9), d(-5), d(-10)), delay: 0.21 });
  };
  registerFallbackExplodeParts();

  const registerDetailedExplodeParts = (model) => {
    const boardCentreX = 0.140;
    const boardCentreZ = 0.142;
    const d = THREE.MathUtils.degToRad;
    let passiveIndex = 0;

    model.traverse((child) => {
      const ref = child.name || '';
      // The GLB scene has an unnamed wrapper root; populated footprints live
      // beneath it. Traverse the hierarchy so the runtime actually registers
      // the component nodes rather than stopping at that wrapper.
      if (!/^(?:U|Q|R|C)\d+$/.test(ref)) return;

      const isModule = ref === 'U4';
      const isIC = ref === 'U1' || ref === 'U2';
      const isTransistor = ref.startsWith('Q');
      const isPassive = ref.startsWith('R') || ref.startsWith('C');
      if (!isModule && !isIC && !isTransistor && !isPassive) return;

      const dx = child.position.x - boardCentreX;
      const dz = child.position.z - boardCentreZ;
      const radialScale = isModule ? 0.52 : isIC ? 0.50 : isTransistor ? 0.42 : 0.44;
      const lift = isModule ? 0.0150 : isIC ? 0.0110 : isTransistor ? 0.0080 : 0.0070;
      const directionX = dx >= 0 ? 1 : -1;
      const directionZ = dz >= 0 ? 1 : -1;
      const delay = isModule ? 0.20 : isIC ? 0.27 : isTransistor ? 0.34 : 0.39 + (passiveIndex++ % 7) * 0.022;

      registerExplodePart(child, {
        // KiCad GLB child coordinates are metres; the parent is scaled 1000x.
        offset: new THREE.Vector3(dx * radialScale, lift, dz * radialScale),
        rotation: new THREE.Euler(
          d(directionZ * (isModule ? 9 : isPassive ? 3.5 : 6)),
          d(directionX * (isModule ? 5 : isPassive ? 2.5 : 3.5)),
          d(directionX * (isModule ? 10 : isPassive ? 4.5 : 7.5))
        ),
        delay
      });
    });
  };

  const styleDetailedBoard = (model) => {
    const thicknessScale = boardThickness / exportedBoardThickness;
    const componentDrop = (exportedBoardThickness - boardThickness) / 1000;
    const boardMaterialNames = new Set(['mat_15', 'mat_16', 'mat_17', 'mat_18']);
    // KiCad's GLB exporter wraps every populated footprint and PCB layer in one
    // unnamed scene node. Work on that node's children, not model.children,
    // otherwise the wrapper itself is mistaken for a board layer and the whole
    // assembly (including components) is squashed when thinning the PCB.
    const exportedRoot = model.children.length === 1 && !model.children[0].name
      ? model.children[0]
      : model;

    exportedRoot.children.forEach((child) => {
      let isBoardLayer = false;
      child.traverse((object) => {
        if (!object.isMesh) return;
        const objectMaterials = materialsFor(object);
        const isSilkscreen = objectMaterials.some((material) => material.name === 'mat_16');
        objectMaterials.forEach((material) => {
          if (boardMaterialNames.has(material.name)) isBoardLayer = true;
          if (material.name === 'mat_15') {
            material.color.setHex(0xd0a24b);
            material.metalness = 0.78;
            material.roughness = 0.34;
          } else if (material.name === 'mat_16') {
            material.color.setHex(0xffffff);
            material.opacity = 1;
            material.transparent = false;
            material.metalness = 0;
            material.roughness = 0.35;
            material.depthWrite = false;
            material.polygonOffset = true;
            material.polygonOffsetFactor = -4;
            material.polygonOffsetUnits = -4;
            if (material.emissive) {
              material.emissive.setHex(0x555555);
              material.emissiveIntensity = 1.0;
            }
          } else if (material.name === 'mat_17') {
            // Real board is black soldermask. Keep this fully opaque so the
            // exported green KiCad material cannot tint the PCB in WebGL.
            material.color.setHex(0x000000);
            material.opacity = 1;
            material.transparent = false;
            material.depthWrite = true;
            material.metalness = 0.01;
            material.roughness = 0.42;
          } else if (material.name === 'mat_18') {
            material.color.setHex(0x050506);
            material.opacity = 1;
            material.transparent = false;
            material.metalness = 0.02;
            material.roughness = 0.72;
          }
          material.needsUpdate = true;
        });

        if (isSilkscreen) {
          const makeSilkMaterial = () => {
            const material = new THREE.MeshBasicMaterial({
              color: 0xffffff,
              side: THREE.DoubleSide,
              depthTest: true,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -6,
              polygonOffsetUnits: -6
            });
            material.toneMapped = false;
            material.fog = false;
            return material;
          };
          object.material = Array.isArray(object.material)
            ? object.material.map(() => makeSilkMaterial())
            : makeSilkMaterial();
          // A dedicated high-resolution F.SilkS overlay is used below for
          // screen readability, so suppress the sub-pixel GLB silk layer.
          object.visible = false;
        }
      });

      if (isBoardLayer) {
        child.scale.y *= thicknessScale;
      } else if (/^(?:U|Q|R|C)\d+$/.test(child.name || '') && child.position.y > 0) {
        // Lower component seating by the same amount removed from the PCB top.
        child.position.y -= componentDrop;
      }
    });
  };

  let detailedBoardReady = false;
  let shellReady = false;
  const refreshReadyStatus = () => {
    if (detailedBoardReady && shellReady) {
      status.textContent = 'Detailed KiCad assembly + enclosure loaded';
      status.classList.add('is-ready');
      announce('Detailed 3D Framework ESP32 model ready');
    } else {
      status.classList.remove('is-ready');
    }
  };
  if (THREE.GLTFLoader) {
    const loader = new THREE.GLTFLoader();
    loader.load(
      'assets/models/framework-esp32/framework-board.glb',
      (gltf) => {
        const model = gltf.scene;
        // KiCad GLB is exported in metres with board X/Y mapped to glTF X/Z.
        // Convert to the viewer's millimetre X/Y/Z convention while preserving
        // the board-centred coordinate system used by the mechanical assembly.
        model.scale.set(1000, 1000, -1000);
        model.position.set(-140, 3.04, 127);
        styleDetailedBoard(model);
        kicadGroup.add(model);
        registerDetailedExplodeParts(model);
        fallbackGroup.visible = false;
        detailedBoardReady = true;
        status.textContent = 'Detailed KiCad assembly loaded';
        refreshReadyStatus();
      },
      undefined,
      (error) => {
        detailedBoardReady = false;
        fallbackGroup.visible = true;
        status.textContent = 'Detailed PCB unavailable · simplified PCB shown';
        console.warn('Framework KiCad GLB failed to load', error);
      }
    );

    // The Molex 105444 plug was removed from newer KiCad 3D libraries. Load a
    // standalone GLB generated from the exact legacy KiCad STEP model and use
    // the original footprint transform (zero offset/rotation). The STEP source
    // uses Z-up; rotate only the solid so its long axis follows the PCB edge.
    loader.load(
      'assets/models/framework-esp32/framework-usbc.glb',
      (gltf) => {
        const p1 = gltf.scene.getObjectByName('P1');
        if (!p1) {
          console.warn('Framework Molex 105444 GLB did not contain a P1 mesh');
          return;
        }

        // Keep the entire CAD subtree rather than flattening only the first
        // mesh. This preserves the STEP tessellation hierarchy and avoids
        // dropped/inverted faces at the shell lip and retention features.
        const exactPlug = p1.clone(true);
        exactPlug.name = 'P1_Molex_105444_exact';
        exactPlug.position.set(0, 0, 0);
        exactPlug.rotation.x = Math.PI / 2;
        // Flip the plug 180 degrees around its own mating axis. This swaps the
        // top/bottom contact rows without changing the insertion direction.
        exactPlug.rotateY(Math.PI);
        exactPlug.scale.setScalar(1000);
        exactPlug.position.set(0, boardTopY, usbMountedZ);
        exactPlug.traverse((object) => {
          if (!object.isMesh) return;
          const material = connectorMetal.clone();
          material.side = THREE.DoubleSide;
          material.color.setHex(0xb9bec1);
          material.metalness = 0.86;
          material.roughness = 0.24;
          object.material = material;
          object.castShadow = false;
          object.receiveShadow = false;
        });
        exactUsbGroup.add(exactPlug);
        usbGroup.visible = false;
        registerExplodePart(exactPlug, {
          offset: new THREE.Vector3(0, 6.0, 10.5),
          rotation: new THREE.Euler(THREE.MathUtils.degToRad(-8), 0, THREE.MathUtils.degToRad(6)),
          delay: 0.10
        });

      },
      undefined,
      (error) => {
        // Keep the drawing-based reconstruction as a resilient fallback.
        usbGroup.visible = true;
        console.warn('Exact Molex 105444 model failed to load; using fallback geometry', error);
      }
    );
  } else {
    status.textContent = 'Detailed PCB loader unavailable · simplified PCB shown';
  }

  const parseBinarySTL = (buffer) => {
    const view = new DataView(buffer);
    const triangles = view.getUint32(80, true);
    const expected = 84 + triangles * 50;
    if (expected > buffer.byteLength) throw new Error('Invalid binary STL');
    const positions = new Float32Array(triangles * 9);
    let offset = 84;
    let out = 0;
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      offset += 12; // face normal; recomputed below
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
    geometry.computeBoundingSphere();
    return geometry;
  };

  const shellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xdce8ed,
    roughness: 0.24,
    metalness: 0.02,
    transparent: true,
    opacity: 0.28,
    transmission: 0.14,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  let shellMesh = null;
  let shellVisible = true;
  let exploded = false;
  let componentExplodeProgress = 0;
  let componentExplodeTarget = 0;

  fetch('assets/models/framework-esp32/framework-enclosure.stl')
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      const geometry = parseBinarySTL(buffer);
      shellMesh = new THREE.Mesh(geometry, shellMaterial);
      shellMesh.renderOrder = 3;
      shellGroup.add(shellMesh);
      shellReady = true;
      if (!detailedBoardReady) status.textContent = 'Framework enclosure loaded · loading detailed PCB';
      refreshReadyStatus();
    })
    .catch((error) => {
      status.textContent = 'Enclosure unavailable · PCB remains interactive';
      console.warn('Framework enclosure STL failed to load', error);
    });

  let yaw = THREE.MathUtils.degToRad(-31);
  let pitch = THREE.MathUtils.degToRad(29);
  let distance = 58;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let targetDistance = distance;
  let assembledDistance = targetDistance;

  const presets = {
    iso: { yaw: -31, pitch: 29, distance: 58 },
    top: { yaw: 0, pitch: 84, distance: 55 },
    side: { yaw: -90, pitch: 9, distance: 55 }
  };

  const setPreset = (keyName, announceChange = true) => {
    const preset = presets[keyName] || presets.iso;
    targetYaw = THREE.MathUtils.degToRad(preset.yaw);
    targetPitch = THREE.MathUtils.degToRad(preset.pitch);
    targetDistance = preset.distance;
    viewButtons.forEach((button) => {
      const active = button.dataset.frameworkView === keyName;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (announceChange) announce(`${keyName} camera view`);
  };

  viewButtons.forEach((button) => button.addEventListener('click', () => setPreset(button.dataset.frameworkView)));

  shellButton.addEventListener('click', () => {
    shellVisible = !shellVisible;
    if (shellMesh) shellMesh.visible = shellVisible;
    shellButton.setAttribute('aria-pressed', String(shellVisible));
    shellButton.textContent = shellVisible ? 'Hide shell' : 'Show shell';
    announce(shellVisible ? 'Enclosure shown' : 'Enclosure hidden');
  });

  explodeButton.addEventListener('click', () => {
    exploded = !exploded;
    componentExplodeTarget = exploded ? 1 : 0;
    if (exploded) {
      assembledDistance = targetDistance;
      targetDistance = Math.min(86, assembledDistance + 7);
    } else {
      targetDistance = assembledDistance;
    }
    explodeButton.setAttribute('aria-pressed', String(exploded));
    explodeButton.textContent = exploded ? 'Assemble' : 'Explode';
    announce(exploded ? 'Exploded enclosure and component view' : 'Assembled enclosure and component view');
  });

  resetButton.addEventListener('click', () => {
    setPreset('iso', false);
    targetDistance = 58;
    assembledDistance = 58;
    exploded = false;
    componentExplodeTarget = 0;
    explodeButton.setAttribute('aria-pressed', 'false');
    explodeButton.textContent = 'Explode';
    shellVisible = true;
    if (shellMesh) shellMesh.visible = true;
    shellButton.setAttribute('aria-pressed', 'true');
    shellButton.textContent = 'Hide shell';
    announce('3D view reset');
  });

  const pointers = new Map();
  let dragStart = null;
  let pinchStartDistance = 0;
  let pinchStartZoom = distance;

  const markCustomView = () => {
    viewButtons.forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });
  };

  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      dragStart = { x: event.clientX, y: event.clientY, yaw: targetYaw, pitch: targetPitch };
      stage.classList.add('is-dragging');
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStartDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartZoom = targetDistance;
    }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1 && dragStart) {
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      targetYaw = dragStart.yaw - dx * 0.009;
      targetPitch = THREE.MathUtils.clamp(dragStart.pitch + dy * 0.008, THREE.MathUtils.degToRad(-77), THREE.MathUtils.degToRad(88));
      markCustomView();
    } else if (pointers.size === 2 && pinchStartDistance > 0) {
      const pts = [...pointers.values()];
      const pinch = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      targetDistance = THREE.MathUtils.clamp(pinchStartZoom * pinchStartDistance / Math.max(pinch, 1), 35, 86);
    }
  });

  const releasePointer = (event) => {
    pointers.delete(event.pointerId);
    stage.classList.toggle('is-dragging', pointers.size > 0);
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      dragStart = { x: remaining.x, y: remaining.y, yaw: targetYaw, pitch: targetPitch };
    } else if (pointers.size === 0) {
      dragStart = null;
      pinchStartDistance = 0;
    }
  };
  stage.addEventListener('pointerup', releasePointer);
  stage.addEventListener('pointercancel', releasePointer);

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    targetDistance = THREE.MathUtils.clamp(targetDistance + event.deltaY * 0.035, 35, 86);
  }, { passive: false });

  stage.addEventListener('keydown', (event) => {
    let handled = true;
    if (event.key === 'ArrowLeft') targetYaw += 0.12;
    else if (event.key === 'ArrowRight') targetYaw -= 0.12;
    else if (event.key === 'ArrowUp') targetPitch = Math.min(targetPitch + 0.1, THREE.MathUtils.degToRad(88));
    else if (event.key === 'ArrowDown') targetPitch = Math.max(targetPitch - 0.1, THREE.MathUtils.degToRad(-77));
    else if (event.key === '+' || event.key === '=') targetDistance = Math.max(35, targetDistance - 3);
    else if (event.key === '-' || event.key === '_') targetDistance = Math.min(86, targetDistance + 3);
    else handled = false;
    if (handled) {
      event.preventDefault();
      markCustomView();
    }
  });

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  const clock = new THREE.Clock();
  const smoothstep = (value) => {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };

  const easeOutBack = (value, overshoot = 1.35) => {
    const t = THREE.MathUtils.clamp(value, 0, 1) - 1;
    const c3 = overshoot + 1;
    return 1 + c3 * t * t * t + overshoot * t * t;
  };

  const staged = (start, end, useBackEase = false) => {
    const raw = THREE.MathUtils.clamp((componentExplodeProgress - start) / Math.max(0.001, end - start), 0, 1);
    if (componentExplodeTarget < 0.5) return smoothstep(raw);
    return useBackEase ? easeOutBack(raw) : smoothstep(raw);
  };

  const updateMechanicalExplode = () => {
    // Screws extract first, with opposite spin directions and a small outward fan.
    screwAssemblies.forEach((screw, index) => {
      const phase = staged(index * 0.018, 0.24 + index * 0.018, true);
      const base = screw.userData.frameworkBasePosition;
      const side = index === 0 ? -1 : 1;
      screw.position.copy(base);
      screw.position.x += side * 0.75 * phase;
      screw.position.y += 10.8 * phase;
      screw.position.z -= 0.55 * phase;
      screw.rotation.x = THREE.MathUtils.degToRad(side * 3.5) * phase;
      screw.rotation.y = side * Math.PI * 4.5 * phase;
      screw.rotation.z = THREE.MathUtils.degToRad(side * 4.5) * phase;
    });

    // Housing leaves in the opposite direction and acquires a small cinematic tilt.
    const shellPhase = staged(0.04, 0.43, false);
    shellGroup.position.set(0, -12.0 * shellPhase, -2.8 * shellPhase);
    shellGroup.rotation.x = THREE.MathUtils.degToRad(-5.0) * shellPhase;
    shellGroup.rotation.z = THREE.MathUtils.degToRad(2.3) * shellPhase;

  };

  const updateComponentExplode = () => {
    componentExplodeParts.forEach((part) => {
      const span = Math.max(0.001, 1 - part.delay);
      const raw = THREE.MathUtils.clamp((componentExplodeProgress - part.delay) / span, 0, 1);
      const posPhase = componentExplodeTarget > 0.5 ? easeOutBack(raw, 1.10) : smoothstep(raw);
      const rotPhase = smoothstep(raw);
      part.object.position.lerpVectors(part.basePosition, part.targetPosition, posPhase);
      part.object.quaternion.copy(part.baseQuaternion).slerp(part.targetQuaternion, rotPhase);
    });
  };

  const animate = () => {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const smoothing = 1 - Math.pow(0.001, dt);
    yaw += (targetYaw - yaw) * smoothing;
    pitch += (targetPitch - pitch) * smoothing;
    distance += (targetDistance - distance) * smoothing;
    componentExplodeProgress += (componentExplodeTarget - componentExplodeProgress) * (1 - Math.pow(0.025, dt));
    if (Math.abs(componentExplodeTarget - componentExplodeProgress) < 0.0001) componentExplodeProgress = componentExplodeTarget;
    updateMechanicalExplode();
    updateComponentExplode();

    const cp = Math.cos(pitch);
    camera.position.set(
      target.x + distance * cp * Math.sin(yaw),
      target.y + distance * Math.sin(pitch),
      target.z + distance * cp * Math.cos(yaw)
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  };

  setPreset('iso', false);
  animate();
})();
