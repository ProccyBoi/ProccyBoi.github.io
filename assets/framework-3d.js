(() => {
  const root = document.querySelector('[data-framework-inspector]');
  if (!root || !window.THREE) return;

  const stage = root.querySelector('[data-framework-stage]');
  const canvas = root.querySelector('[data-framework-canvas]');
  const hotspotLayer = root.querySelector('[data-framework-hotspots]');
  const status = root.querySelector('[data-framework-status]');
  const readout = root.querySelector('[data-framework-readout]');
  const readoutRef = root.querySelector('[data-framework-ref]');
  const readoutName = root.querySelector('[data-framework-name]');
  const readoutCopy = root.querySelector('[data-framework-copy]');
  const directory = root.querySelector('[data-framework-directory]');
  const directoryCount = root.querySelector('[data-framework-directory-count]');
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
  const shellGroup = new THREE.Group();
  assembly.add(shellGroup);

  const fallbackGroup = new THREE.Group();
  boardGroup.add(fallbackGroup);
  const kicadGroup = new THREE.Group();
  boardGroup.add(kicadGroup);

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

  const boardY = 3.34;
  const board = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 30), boardMaterial);
  board.position.set(0, boardY, -15);
  fallbackGroup.add(board);

  // Slightly lighter board edge makes the 0.6 mm laminate readable at grazing angles.
  const boardEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(board.geometry),
    new THREE.LineBasicMaterial({ color: 0x696b6b, transparent: true, opacity: 0.52 })
  );
  board.add(boardEdge);

  // Molex 105444 edge plug. KiCad no longer ships the old referenced WRL model,
  // so reconstruct the visible connector from its 8.25 x 2.40 mm envelope,
  // 0.50 mm terminal pitch, tongue, shell panels and retention ears.
  const usbGroup = new THREE.Group();
  usbGroup.position.set(0, boardY + 1.2, -1.0);
  boardGroup.add(usbGroup);
  const usbHighlightMeshes = [];
  const addUsbPart = (geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material.clone ? material.clone() : material);
    mesh.position.set(...position);
    usbGroup.add(mesh);
    usbHighlightMeshes.push(mesh);
    return mesh;
  };
  const shellDepth = 5.8;
  const usbShell = addUsbPart(new THREE.BoxGeometry(8.25, 0.22, shellDepth), connectorMetal, [0, 1.09, 0]);
  addUsbPart(new THREE.BoxGeometry(8.25, 0.22, shellDepth), connectorMetal, [0, -1.09, 0]);
  addUsbPart(new THREE.BoxGeometry(0.22, 1.96, shellDepth), connectorMetal, [-4.015, 0, 0]);
  addUsbPart(new THREE.BoxGeometry(0.22, 1.96, shellDepth), connectorMetal, [4.015, 0, 0]);
  // Reinforced mouth lip, built as four pieces to keep the Type-C opening hollow.
  addUsbPart(new THREE.BoxGeometry(8.25, 0.28, 0.34), connectorMetal, [0, 1.03, 2.73]);
  addUsbPart(new THREE.BoxGeometry(8.25, 0.28, 0.34), connectorMetal, [0, -1.03, 2.73]);
  addUsbPart(new THREE.BoxGeometry(0.28, 1.82, 0.34), connectorMetal, [-3.985, 0, 2.73]);
  addUsbPart(new THREE.BoxGeometry(0.28, 1.82, 0.34), connectorMetal, [3.985, 0, 2.73]);
  const usbCoreMaterial = new THREE.MeshStandardMaterial({ color: 0x242526, roughness: 0.67, metalness: 0.03 });
  const usbTongue = addUsbPart(new THREE.BoxGeometry(5.5, 0.46, 4.55), usbCoreMaterial, [0, -0.08, 0.28]);
  const contactMaterial = new THREE.MeshStandardMaterial({ color: 0xd3ae5d, roughness: 0.32, metalness: 0.76 });
  for (let i = 0; i < 12; i += 1) {
    const x = -2.75 + i * 0.5;
    addUsbPart(new THREE.BoxGeometry(0.27, 0.055, 2.85), contactMaterial, [x, 0.19, 0.72]);
  }
  // Side retention/shell tabs visible where the connector meets the PCB.
  addUsbPart(new THREE.BoxGeometry(1.15, 0.28, 1.55), connectorMetal, [-4.32, -0.83, -2.25]);
  addUsbPart(new THREE.BoxGeometry(1.15, 0.28, 1.55), connectorMetal, [4.32, -0.83, -2.25]);

  const kcToModel = (x, y, height = 1.0) => new THREE.Vector3(x - 140, boardY + 0.3 + height / 2, -(y - 127));

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
    p.position.set(x, boardY + 0.6, z);
    fallbackGroup.add(p);
  });

  const viaGeometry = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16);
  [
    [-9.9, -4.1], [9.2, -4.9], [-7.4, -11.3], [6.8, -10.7], [-3.2, -14.8],
    [3.4, -15.7], [-9.7, -23.5], [9.4, -23.9], [-7.8, -28.0], [7.6, -28.2]
  ].forEach(([x, z]) => {
    const via = new THREE.Mesh(viaGeometry, copperMaterial);
    via.position.set(x, boardY + 0.63, z);
    fallbackGroup.add(via);
  });

  // Minimal copper-like traces: visual context only, deliberately not a replacement for the KiCad artwork.
  const traceMaterial = new THREE.LineBasicMaterial({ color: 0xa8854b, transparent: true, opacity: 0.42 });
  const addTrace = (pts) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, boardY + 0.655, z)));
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
  silkA.position.set(-9.2, boardY + 0.67, -16.4);
  fallbackGroup.add(silkA);
  const silkB = silkA.clone();
  silkB.scale.x = 0.55;
  silkB.position.set(-10.4, boardY + 0.67, -17.1);
  fallbackGroup.add(silkB);

  const componentData = [
    {
      ref: 'U4', name: 'ESP32-S3-MINI-1',
      copy: 'The radio and compute module. It provides the ESP32-S3 MCU, 2.4 GHz Wi-Fi and Bluetooth inside the Framework bay.',
      anchor: kcToModel(140.1, 146.29, 2.25).add(new THREE.Vector3(0, 1.3, 0)), mesh: esp32
    },
    {
      ref: 'U1', name: 'CH340K USB–UART',
      copy: 'The USB serial bridge used for programming and console access, letting the card behave like a normal development board.',
      anchor: kcToModel(132.2575, 130.84, 1.25).add(new THREE.Vector3(0, 0.95, 0)), mesh: ch340
    },
    {
      ref: 'U2', name: 'AMS1117-3.3 regulator',
      copy: 'Generates the 3.3 V rail for the ESP32 from the card input supply.',
      anchor: kcToModel(148.37, 131.35, 1.75).add(new THREE.Vector3(0, 1.15, 0)), mesh: regulator
    },
    {
      ref: 'Q1 / Q2', name: 'BC817 auto-reset pair',
      copy: 'The transistor pair drives the ESP32 boot/reset lines so firmware uploads do not require a manual button sequence.',
      anchor: kcToModel(138.4, 133.25, 1.05).add(new THREE.Vector3(0, 0.85, 0)), mesh: q1, meshes: [q1, q2]
    },
    {
      ref: 'P1', name: 'USB-C edge plug',
      copy: 'The card mates directly with the Framework laptop bay. The thin PCB and connector geometry are part of the expansion-card mechanical design.',
      anchor: new THREE.Vector3(0, boardY + 2.8, -1.0), mesh: usbShell, meshes: usbHighlightMeshes
    }
  ];

  const materialsFor = (mesh) => {
    if (!mesh || !mesh.material) return [];
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  };

  const componentMeshes = (component) => component.meshes || (component.mesh ? [component.mesh] : []);
  const selectionBox = new THREE.Box3();
  const selectionHelper = new THREE.Box3Helper(selectionBox, 0xe09a5d);
  selectionHelper.visible = false;
  scene.add(selectionHelper);

  directoryCount.textContent = `${componentData.length} selectable parts`;
  let selectedIndex = -1;
  const hotspotButtons = [];
  const directoryButtons = [];

  const defaultReadout = () => {
    readout.classList.add('is-empty');
    readoutRef.textContent = 'BOARD';
    readoutName.textContent = 'Framework ESP32 Card';
    readoutCopy.textContent = 'Select a marker to inspect the main devices. Drag anywhere else on the model to rotate the complete assembly.';
  };

  const clearHighlights = () => {
    selectionHelper.visible = false;
    componentData.forEach((component) => {
      componentMeshes(component).forEach((mesh) => {
        materialsFor(mesh).forEach((material) => {
          const key = material.uuid;
          const saved = mesh.userData.frameworkOriginalMaterials && mesh.userData.frameworkOriginalMaterials[key];
          if (!saved || !material.emissive) return;
          material.emissive.setHex(saved.emissive);
          material.emissiveIntensity = saved.intensity;
        });
      });
    });
  };

  const selectComponent = (index, fromUser = true) => {
    if (selectedIndex === index) index = -1;
    selectedIndex = index;
    clearHighlights();

    hotspotButtons.forEach((button, i) => {
      const active = i === selectedIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    directoryButtons.forEach((button, i) => {
      const active = i === selectedIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (selectedIndex < 0) {
      defaultReadout();
      if (fromUser) announce('Component selection cleared');
      return;
    }

    const component = componentData[selectedIndex];
    readout.classList.remove('is-empty');
    readoutRef.textContent = component.ref;
    readoutName.textContent = component.name;
    readoutCopy.textContent = component.copy;
    if (component.detailObjects && component.detailObjects.length) {
      selectionBox.makeEmpty();
      component.detailObjects.forEach((object) => {
        const box = new THREE.Box3().setFromObject(object);
        if (!box.isEmpty()) selectionBox.union(box);
      });
      selectionHelper.visible = !selectionBox.isEmpty();
    } else {
      componentMeshes(component).forEach((mesh) => {
        if (!mesh) return;
        if (!mesh.userData.frameworkOriginalMaterials) mesh.userData.frameworkOriginalMaterials = {};
        materialsFor(mesh).forEach((material) => {
          if (!material.emissive) return;
          if (!mesh.userData.frameworkOriginalMaterials[material.uuid]) {
            mesh.userData.frameworkOriginalMaterials[material.uuid] = {
              emissive: material.emissive.getHex(),
              intensity: material.emissiveIntensity || 0
            };
          }
          material.emissive.setHex(0x5c3014);
          material.emissiveIntensity = 0.9;
        });
      });
    }
    if (fromUser) announce(`${component.ref}, ${component.name}`);
  };

  componentData.forEach((component, index) => {
    const hotspot = document.createElement('button');
    hotspot.type = 'button';
    hotspot.className = 'object-hotspot';
    hotspot.setAttribute('aria-label', `${component.ref} ${component.name}: ${component.copy}`);
    hotspot.setAttribute('aria-pressed', 'false');
    hotspot.innerHTML = `<span>${component.ref} / ${component.name}</span>`;
    hotspot.addEventListener('click', (event) => {
      event.stopPropagation();
      selectComponent(index);
    });
    hotspotLayer.append(hotspot);
    hotspotButtons.push(hotspot);

    const directoryButton = document.createElement('button');
    directoryButton.type = 'button';
    directoryButton.setAttribute('aria-pressed', 'false');
    directoryButton.innerHTML = `<strong>${component.ref}</strong><span>${component.name}</span>`;
    directoryButton.addEventListener('click', () => selectComponent(index));
    directory.append(directoryButton);
    directoryButtons.push(directoryButton);
  });

  const setDetailedComponentObjects = (model) => {
    const remap = {
      U4: [model.getObjectByName('U4')].filter(Boolean),
      U1: [model.getObjectByName('U1')].filter(Boolean),
      U2: [model.getObjectByName('U2')].filter(Boolean),
      'Q1 / Q2': [model.getObjectByName('Q1'), model.getObjectByName('Q2')].filter(Boolean)
    };
    componentData.forEach((component) => {
      const detailed = remap[component.ref];
      if (!detailed || !detailed.length) return;
      component.detailObjects = detailed;
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
        // Convert to the viewer's millimetre X/Y/Z convention without changing
        // the existing hotspot coordinate system.
        model.scale.set(1000, 1000, -1000);
        model.position.set(-140, 3.04, 127);
        kicadGroup.add(model);
        fallbackGroup.visible = false;
        setDetailedComponentObjects(model);
        if (selectedIndex >= 0) {
          const pendingSelection = selectedIndex;
          selectedIndex = -1;
          selectComponent(pendingSelection, false);
        }
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
  let shellYOffset = 0;
  let shellTargetY = 0;

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
    shellTargetY = exploded ? 11 : 0;
    explodeButton.setAttribute('aria-pressed', String(exploded));
    explodeButton.textContent = exploded ? 'Assemble' : 'Explode';
    announce(exploded ? 'Exploded enclosure view' : 'Assembled enclosure view');
  });

  resetButton.addEventListener('click', () => {
    setPreset('iso', false);
    targetDistance = 58;
    exploded = false;
    shellTargetY = 0;
    explodeButton.setAttribute('aria-pressed', 'false');
    explodeButton.textContent = 'Explode';
    shellVisible = true;
    if (shellMesh) shellMesh.visible = true;
    shellButton.setAttribute('aria-pressed', 'true');
    shellButton.textContent = 'Hide shell';
    selectComponent(-1, false);
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

  const worldAnchor = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const updateHotspots = () => {
    const rect = stage.getBoundingClientRect();
    componentData.forEach((component, index) => {
      worldAnchor.copy(component.anchor);
      boardGroup.localToWorld(worldAnchor);
      projected.copy(worldAnchor).project(camera);
      const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08;
      const button = hotspotButtons[index];
      button.classList.toggle('is-offscreen', !visible);
      button.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
      button.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
    });
  };

  const clock = new THREE.Clock();
  const animate = () => {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const smoothing = 1 - Math.pow(0.001, dt);
    yaw += (targetYaw - yaw) * smoothing;
    pitch += (targetPitch - pitch) * smoothing;
    distance += (targetDistance - distance) * smoothing;
    shellYOffset += (shellTargetY - shellYOffset) * smoothing;
    shellGroup.position.y = shellYOffset;

    const cp = Math.cos(pitch);
    camera.position.set(
      target.x + distance * cp * Math.sin(yaw),
      target.y + distance * Math.sin(pitch),
      target.z + distance * cp * Math.cos(yaw)
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    updateHotspots();
  };

  defaultReadout();
  setPreset('iso', false);
  animate();
})();
