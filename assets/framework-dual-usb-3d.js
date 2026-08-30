(() => {
  const root = document.querySelector('[data-dual-usb-inspector]');
  if (!root || !window.THREE) return;

  const stage = root.querySelector('[data-dual-usb-stage]');
  const canvas = root.querySelector('[data-dual-usb-canvas]');
  const status = root.querySelector('[data-dual-usb-status]');
  const shellButton = root.querySelector('[data-dual-usb-shell]');
  const explodeButton = root.querySelector('[data-dual-usb-explode]');
  const resetButton = root.querySelector('[data-dual-usb-reset]');
  const viewButtons = [...root.querySelectorAll('[data-dual-usb-view]')];
  const partPanel = root.querySelector('[data-dual-usb-part]');
  const partName = root.querySelector('[data-dual-usb-part-name]');
  const partDetail = root.querySelector('[data-dual-usb-part-detail]');
  const liveRegion = document.querySelector('[data-dual-usb-live]');
  const announce = (message) => { if (liveRegion) liveRegion.textContent = message; };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 2.0, 300);
  const target = new THREE.Vector3(0, 3.25, -15);

  // Neutral studio lighting: keep enough hemisphere fill to preserve the
  // underside appearance, while avoiding the previous blue/white wash on the
  // exposed soldermask and component tops.
  scene.add(new THREE.HemisphereLight(0xdfe6e2, 0x171914, 1.22));
  const key = new THREE.DirectionalLight(0xfffdf8, 1.38); key.position.set(-24, 40, 30); scene.add(key);
  const fill = new THREE.DirectionalLight(0xd7e4ee, 0.42); fill.position.set(30, 16, -36); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe1c4, 0.30); rim.position.set(-30, 6, -20); scene.add(rim);

  const assembly = new THREE.Group();
  scene.add(assembly);

  // Preserve the exact mechanical transform proven in the ESP32 explorer.
  // KiCad enters the Framework enclosure back-to-front, and the physical card
  // is mirrored about the USB-C mating centreline. Applying both transforms
  // keeps the board, shell and exposed face in the same coordinate frame.
  const boardGroup = new THREE.Group();
  boardGroup.rotation.y = Math.PI;
  boardGroup.position.z = -30;
  assembly.add(boardGroup);

  const mirroredCardGroup = new THREE.Group();
  mirroredCardGroup.scale.x = -1;
  boardGroup.add(mirroredCardGroup);

  const shellGroup = new THREE.Group();
  shellGroup.scale.x = -1;
  assembly.add(shellGroup);

  const exactUsbGroup = new THREE.Group();
  boardGroup.add(exactUsbGroup);

  const PCB_T = 0.8;
  const PCB_BOTTOM = 3.04;
  const PCB_TOP = PCB_BOTTOM + PCB_T;
  const kc = (x, y, height = 0) => new THREE.Vector3(x - 140, PCB_BOTTOM + height, -(y - 127));

  const mat = {
    board: new THREE.MeshPhysicalMaterial({ color: 0x0b6035, roughness: 0.44, metalness: 0.015, clearcoat: 0.10, clearcoatRoughness: 0.64 }),
    boardEdge: new THREE.LineBasicMaterial({ color: 0x164b2c, transparent: true, opacity: 0.52 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x07090a, roughness: 0.50, metalness: 0.05 }),
    chipTop: new THREE.MeshStandardMaterial({ color: 0x111416, roughness: 0.46, metalness: 0.04 }),
    chipMark: new THREE.MeshBasicMaterial({ color: 0x8f9699 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x7d868a, roughness: 0.32, metalness: 0.86 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x444b4f, roughness: 0.38, metalness: 0.76 }),
    gold: new THREE.MeshStandardMaterial({ color: 0x8b641f, roughness: 0.38, metalness: 0.80 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0x6f624b, roughness: 0.68, metalness: 0.01 }),
    resistor: new THREE.MeshStandardMaterial({ color: 0x141311, roughness: 0.66, metalness: 0.01 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x080a0b, roughness: 0.74, metalness: 0.01 }),
    diode: new THREE.MeshStandardMaterial({ color: 0x0c0e0f, roughness: 0.62, metalness: 0.05 }),
    diodeBand: new THREE.MeshBasicMaterial({ color: 0xf3f0df }),
    white: new THREE.MeshBasicMaterial({ color: 0xf0eee7 })
  };

  // Sampled directly from Expansion_Card.kicad_pcb Edge.Cuts, including the
  // Molex straddle-plug neck. Coordinates are board-local KiCad X/Y in mm.
  const BOARD_OUTLINE = [[13.0,29.7],[13.0,3.8],[12.987848,3.71548],[12.952376,3.637808],[12.896458,3.573275],[12.824624,3.52711],[12.78452,3.512152],[12.7,3.5],[12.3,3.5],[12.21548,3.487848],[12.175376,3.47289],[12.103542,3.426725],[12.047624,3.362192],[12.012152,3.28452],[12.0,3.2],[12.0,0.3],[11.987848,0.21548],[11.97289,0.175376],[11.926725,0.103542],[11.896458,0.073275],[11.824624,0.02711],[11.78452,0.012152],[11.7,0.0],[5.0,0.0],[4.91548,0.012152],[4.837808,0.047624],[4.773275,0.103542],[4.72711,0.175376],[4.703054,0.257306],[4.7,1.7],[4.687848,1.78452],[4.652376,1.862192],[4.596458,1.926725],[4.524624,1.97289],[4.442694,1.996946],[3.35,2.0],[3.26548,1.987848],[3.187808,1.952376],[3.123275,1.896458],[3.07711,1.824624],[3.062152,1.78452],[3.05,1.7],[3.05,1.34],[3.037848,1.25548],[3.02289,1.215376],[2.976725,1.143542],[2.946458,1.113275],[2.874624,1.06711],[2.792694,1.043054],[-2.75,1.04],[-2.83452,1.052152],[-2.912192,1.087624],[-2.976725,1.143542],[-3.02289,1.215376],[-3.037848,1.25548],[-3.05,1.34],[-3.05,1.7],[-3.062152,1.78452],[-3.07711,1.824624],[-3.123275,1.896458],[-3.187808,1.952376],[-3.26548,1.987848],[-3.35,2.0],[-4.4,2.0],[-4.48452,1.987848],[-4.524624,1.97289],[-4.596458,1.926725],[-4.652376,1.862192],[-4.687848,1.78452],[-4.7,1.7],[-4.703054,0.257306],[-4.72711,0.175376],[-4.773275,0.103542],[-4.837808,0.047624],[-4.91548,0.012152],[-5.0,0.0],[-11.7,0.0],[-11.78452,0.012152],[-11.824624,0.02711],[-11.896458,0.073275],[-11.926725,0.103542],[-11.97289,0.175376],[-11.987848,0.21548],[-12.0,0.3],[-12.0,3.2],[-12.012152,3.28452],[-12.02711,3.324624],[-12.073275,3.396458],[-12.137808,3.452376],[-12.21548,3.487848],[-12.3,3.5],[-12.7,3.5],[-12.78452,3.512152],[-12.824624,3.52711],[-12.896458,3.573275],[-12.952376,3.637808],[-12.987848,3.71548],[-13.0,3.8],[-13.0,29.7],[-12.987848,29.78452],[-12.97289,29.824624],[-12.926725,29.896458],[-12.896458,29.926725],[-12.824624,29.97289],[-12.78452,29.987848],[-12.7,30.0],[12.7,30.0],[12.78452,29.987848],[12.824624,29.97289],[12.896458,29.926725],[12.926725,29.896458],[12.97289,29.824624],[12.987848,29.78452]];
  // Every drilled feature in the PCB: two Framework M2 holes plus J1/J2 locating
  // holes and shell-stake slots. [x,y,shape,width,height,rotation,reference]
  const BOARD_DRILLS = [[-11.3,19.5,"circle",2.2,2.2,0.0,"H1"],[11.3,19.5,"circle",2.2,2.2,0.0,"H2"],[-10.06,23.725,"circle",0.65,0.65,0.0,"J1"],[-4.28,23.725,"circle",0.65,0.65,0.0,"J1"],[-11.49,23.225,"oval",0.6,1.7,0.0,"J1"],[-11.49,27.405,"oval",0.6,1.4,0.0,"J1"],[-2.85,23.225,"oval",0.6,1.7,0.0,"J1"],[-2.85,27.405,"oval",0.6,1.4,0.0,"J1"],[4.29,23.725,"circle",0.65,0.65,0.0,"J2"],[10.07,23.725,"circle",0.65,0.65,0.0,"J2"],[2.86,23.225,"oval",0.6,1.7,0.0,"J2"],[2.86,27.405,"oval",0.6,1.4,0.0,"J2"],[11.5,23.225,"oval",0.6,1.7,0.0,"J2"],[11.5,27.405,"oval",0.6,1.4,0.0,"J2"]];
  // Exact front-copper SMD pad centres/sizes from the KiCad PCB. These are not
  // decorative guesses; they are a lightweight WebGL rendering of real pad data.
  const FRONT_PADS = [[-2.75,2.04,0.38,1.0,"rect",0.0,"P1"],[-2.25,2.04,0.38,1.0,"rect",0.0,"P1"],[-1.75,2.04,0.38,1.0,"rect",0.0,"P1"],[-1.25,2.04,0.38,1.0,"rect",0.0,"P1"],[-0.75,2.04,0.38,1.0,"rect",0.0,"P1"],[-0.25,2.04,0.38,1.0,"rect",0.0,"P1"],[0.25,2.04,0.38,1.0,"rect",0.0,"P1"],[0.75,2.04,0.38,1.0,"rect",0.0,"P1"],[1.25,2.04,0.38,1.0,"rect",0.0,"P1"],[1.75,2.04,0.38,1.0,"rect",0.0,"P1"],[2.25,2.04,0.38,1.0,"rect",0.0,"P1"],[2.75,2.04,0.38,1.0,"rect",0.0,"P1"],[-3.42,2.88,0.7,1.15,"rect",0.0,"P1"],[-4.86,4.76,1.0,1.45,"roundrect",180.0,"C2"],[-4.86,6.66,1.0,1.45,"roundrect",180.0,"C2"],[-10.37,22.65,0.6,1.15,"roundrect",0.0,"J1"],[-9.57,22.65,0.6,1.15,"roundrect",0.0,"J1"],[-8.42,22.65,0.3,1.15,"roundrect",0.0,"J1"],[-7.42,22.65,0.3,1.15,"roundrect",0.0,"J1"],[-6.92,22.65,0.3,1.15,"roundrect",0.0,"J1"],[-5.92,22.65,0.3,1.15,"roundrect",0.0,"J1"],[-4.77,22.65,0.6,1.15,"roundrect",0.0,"J1"],[-3.97,22.65,0.6,1.15,"roundrect",0.0,"J1"],[-3.97,22.65,0.6,1.15,"roundrect",0.0,"J1"],[-4.77,22.65,0.6,1.15,"roundrect",0.0,"J1"],[-5.42,22.65,0.3,1.15,"roundrect",0.0,"J1"],[-6.42,22.65,0.3,1.15,"roundrect",0.0,"J1"],[-7.92,22.65,0.3,1.15,"roundrect",0.0,"J1"],[-8.92,22.65,0.3,1.15,"roundrect",0.0,"J1"],[-9.57,22.65,0.6,1.15,"roundrect",0.0,"J1"],[-10.37,22.65,0.6,1.15,"roundrect",0.0,"J1"],[1.97,12.8,0.28,0.7,"oval",0.0,"U3"],[1.97,12.3,0.28,0.7,"oval",0.0,"U3"],[1.97,11.8,0.28,0.7,"oval",0.0,"U3"],[1.97,11.3,0.28,0.7,"oval",0.0,"U3"],[1.97,10.8,0.28,0.7,"oval",0.0,"U3"],[1.97,10.3,0.28,0.7,"oval",0.0,"U3"],[1.22,9.55,0.28,0.7,"oval",-90.0,"U3"],[0.72,9.55,0.28,0.7,"oval",-90.0,"U3"],[0.22,9.55,0.28,0.7,"oval",-90.0,"U3"],[-0.28,9.55,0.28,0.7,"oval",-90.0,"U3"],[-0.78,9.55,0.28,0.7,"oval",-90.0,"U3"],[-1.28,9.55,0.28,0.7,"oval",-90.0,"U3"],[-2.03,10.3,0.28,0.7,"oval",0.0,"U3"],[-2.03,10.8,0.28,0.7,"oval",0.0,"U3"],[-2.03,11.3,0.28,0.7,"oval",0.0,"U3"],[-2.03,11.8,0.28,0.7,"oval",0.0,"U3"],[-2.03,12.3,0.28,0.7,"oval",0.0,"U3"],[-2.03,12.8,0.28,0.7,"oval",0.0,"U3"],[-1.28,13.55,0.28,0.7,"oval",-90.0,"U3"],[-0.78,13.55,0.28,0.7,"oval",-90.0,"U3"],[-0.28,13.55,0.28,0.7,"oval",-90.0,"U3"],[0.22,13.55,0.28,0.7,"oval",-90.0,"U3"],[0.72,13.55,0.28,0.7,"oval",-90.0,"U3"],[1.22,13.55,0.28,0.7,"oval",-90.0,"U3"],[-0.03,11.54,2.8,2.8,"rect",-90.0,"U3"],[-11.81,11.0175,1.025,1.4,"roundrect",180.0,"R10"],[-11.81,12.8425,1.025,1.4,"roundrect",180.0,"R10"],[5.13,6.85,1.0,1.45,"roundrect",0.0,"C6"],[7.03,6.85,1.0,1.45,"roundrect",0.0,"C6"],[11.88,14.41,1.025,1.4,"roundrect",180.0,"R8"],[11.88,16.235,1.025,1.4,"roundrect",180.0,"R8"],[0.8425,26.94,1.025,1.4,"roundrect",360.0,"R6"],[-0.9825,26.94,1.025,1.4,"roundrect",360.0,"R6"],[-1.77,18.83,1.0,1.45,"roundrect",180.0,"C7"],[-1.77,20.73,1.0,1.45,"roundrect",180.0,"C7"],[-2.8,6.6125,1.025,1.4,"roundrect",180.0,"R1"],[-2.8,4.7875,1.025,1.4,"roundrect",180.0,"R1"],[1.93,18.83,1.0,1.45,"roundrect",180.0,"C9"],[1.93,20.73,1.0,1.45,"roundrect",180.0,"C9"],[-8.0,20.5875,1.325,0.6,"roundrect",180.0,"U7"],[-7.05,20.5875,1.325,0.6,"roundrect",180.0,"U7"],[-6.1,20.5875,1.325,0.6,"roundrect",180.0,"U7"],[-6.1,18.3125,1.325,0.6,"roundrect",180.0,"U7"],[-7.05,18.3125,1.325,0.6,"roundrect",180.0,"U7"],[-8.0,18.3125,1.325,0.6,"roundrect",180.0,"U7"],[-3.97,20.69,1.1,1.6,"roundrect",180.0,"D2"],[-3.97,17.89,1.1,1.6,"roundrect",180.0,"D2"],[1.93,15.36,1.0,1.45,"roundrect",180.0,"C10"],[1.93,17.26,1.0,1.45,"roundrect",180.0,"C10"],[-6.87,4.76,1.0,1.45,"roundrect",180.0,"C1"],[-6.87,6.66,1.0,1.45,"roundrect",180.0,"C1"],[3.14,4.83,1.1,1.6,"roundrect",180.0,"D1"],[3.14,7.63,1.1,1.6,"roundrect",180.0,"D1"],[5.13,4.83,1.0,1.45,"roundrect",0.0,"C5"],[7.03,4.83,1.0,1.45,"roundrect",0.0,"C5"],[0.97,4.9525,1.325,0.6,"roundrect",180.0,"U5"],[0.02,4.9525,1.325,0.6,"roundrect",180.0,"U5"],[-0.93,4.9525,1.325,0.6,"roundrect",180.0,"U5"],[-0.93,7.2275,1.325,0.6,"roundrect",180.0,"U5"],[0.02,7.2275,1.325,0.6,"roundrect",180.0,"U5"],[0.97,7.2275,1.325,0.6,"roundrect",180.0,"U5"],[-0.9225,22.52,1.025,1.4,"roundrect",0.0,"R4"],[0.9025,22.52,1.025,1.4,"roundrect",0.0,"R4"],[-11.81,16.275,1.025,1.4,"roundrect",180.0,"R9"],[-11.81,14.45,1.025,1.4,"roundrect",180.0,"R9"],[-10.03,14.4575,0.49,1.157,"rect",180.0,"U1"],[-10.03,15.4075,0.49,1.157,"rect",180.0,"U1"],[-10.03,16.3575,0.49,1.157,"rect",180.0,"U1"],[-7.73,16.3575,0.49,1.175,"rect",180.0,"U1"],[-7.73,14.4575,0.49,1.175,"rect",180.0,"U1"],[8.0475,12.3225,1.025,1.4,"roundrect",0.0,"R7"],[9.8725,12.3225,1.025,1.4,"roundrect",0.0,"R7"],[4.69,12.1225,1.025,1.4,"roundrect",180.0,"R2"],[4.69,10.2975,1.025,1.4,"roundrect",180.0,"R2"],[4.17,20.69,1.1,1.6,"roundrect",180.0,"D3"],[4.17,17.89,1.1,1.6,"roundrect",180.0,"D3"],[-1.76,15.36,1.0,1.45,"roundrect",180.0,"C8"],[-1.76,17.26,1.0,1.45,"roundrect",180.0,"C8"],[10.0855,16.2325,0.49,1.157,"rect",180.0,"U4"],[10.0855,15.2825,0.49,1.157,"rect",180.0,"U4"],[10.0855,14.3325,0.49,1.157,"rect",180.0,"U4"],[7.7855,14.3325,0.49,1.175,"rect",180.0,"U4"],[7.7855,16.2325,0.49,1.175,"rect",180.0,"U4"],[6.15,20.615,1.325,0.6,"roundrect",180.0,"U6"],[7.1,20.615,1.325,0.6,"roundrect",180.0,"U6"],[8.05,20.615,1.325,0.6,"roundrect",180.0,"U6"],[8.05,18.34,1.325,0.6,"roundrect",180.0,"U6"],[7.1,18.34,1.325,0.6,"roundrect",180.0,"U6"],[6.15,18.34,1.325,0.6,"roundrect",180.0,"U6"],[-0.9225,24.48,1.025,1.4,"roundrect",0.0,"R3"],[0.9025,24.48,1.025,1.4,"roundrect",0.0,"R3"],[0.835,28.9,1.025,1.4,"roundrect",360.0,"R5"],[-0.99,28.9,1.025,1.4,"roundrect",360.0,"R5"],[3.98,22.65,0.6,1.15,"roundrect",0.0,"J2"],[4.78,22.65,0.6,1.15,"roundrect",0.0,"J2"],[5.93,22.65,0.3,1.15,"roundrect",0.0,"J2"],[6.93,22.65,0.3,1.15,"roundrect",0.0,"J2"],[7.43,22.65,0.3,1.15,"roundrect",0.0,"J2"],[8.43,22.65,0.3,1.15,"roundrect",0.0,"J2"],[9.58,22.65,0.6,1.15,"roundrect",0.0,"J2"],[10.38,22.65,0.6,1.15,"roundrect",0.0,"J2"],[10.38,22.65,0.6,1.15,"roundrect",0.0,"J2"],[9.58,22.65,0.6,1.15,"roundrect",0.0,"J2"],[8.93,22.65,0.3,1.15,"roundrect",0.0,"J2"],[7.93,22.65,0.3,1.15,"roundrect",0.0,"J2"],[6.43,22.65,0.3,1.15,"roundrect",0.0,"J2"],[5.43,22.65,0.3,1.15,"roundrect",0.0,"J2"],[4.78,22.65,0.6,1.15,"roundrect",0.0,"J2"],[3.98,22.65,0.6,1.15,"roundrect",0.0,"J2"],[-3.42,12.47,1.4,1.2,"roundrect",180.0,"X1"],[-3.42,10.27,1.4,1.2,"roundrect",180.0,"X1"],[-5.02,10.27,1.4,1.2,"roundrect",180.0,"X1"],[-5.02,12.47,1.4,1.2,"roundrect",180.0,"X1"],[-3.07,8.43,1.0,1.45,"roundrect",360.0,"C11"],[-4.97,8.43,1.0,1.45,"roundrect",360.0,"C11"]];

  const pickRoots = [];
  const partInfo = {
    BOARD: ['0.8 mm PCB', 'Exact KiCad Edge.Cuts, mounting holes and connector drill geometry.'],
    P1: ['P1 · Molex 105444', 'Upstream USB-C plug that mates with the Framework expansion bay.'],
    J1: ['J1 · USB-C downstream 1', 'GCT USB4105 USB 2.0 Type-C receptacle.'],
    J2: ['J2 · USB-C downstream 2', 'GCT USB4105 USB 2.0 Type-C receptacle.'],
    U3: ['U3 · CH334F', 'Two-port USB 2.0 hub controller.'],
    U1: ['U1 · TPS2065', 'Current-limited downstream VBUS power switch.'],
    U4: ['U4 · TPS2065', 'Current-limited downstream VBUS power switch.'],
    U5: ['U5 · USBLC6-2SC6', 'Low-capacitance USB ESD protection.'],
    U6: ['U6 · USBLC6-2SC6', 'Low-capacitance USB ESD protection.'],
    U7: ['U7 · USBLC6-2SC6', 'Low-capacitance USB ESD protection.'],
    X1: ['X1 · X322512MSB4SI', '3.2 × 2.5 mm CH334F reference crystal.'],
    D1: ['D1 · SMF5.0CA', '5 V transient-voltage suppressor.'],
    D2: ['D2 · SMF5.0CA', '5 V transient-voltage suppressor.'],
    D3: ['D3 · SMF5.0CA', '5 V transient-voltage suppressor.'],
    C1: ['C1 · 100 nF', '0805 ceramic decoupling capacitor.'],
    C2: ['C2 · 10 µF', '0805 ceramic bulk/decoupling capacitor.'],
    C5: ['C5 · 100 nF', '0805 ceramic decoupling capacitor.'],
    C6: ['C6 · 10 µF', '0805 ceramic bulk/decoupling capacitor.'],
    C7: ['C7 · 100 nF', '0805 ceramic decoupling capacitor.'],
    C8: ['C8 · 10 µF', '0805 ceramic bulk/decoupling capacitor.'],
    C9: ['C9 · 100 nF', '0805 ceramic decoupling capacitor.'],
    C10: ['C10 · 10 µF', '0805 ceramic bulk/decoupling capacitor.'],
    C11: ['C11 · 10 µF', '0805 ceramic bulk/decoupling capacitor.'],
    R1: ['R1 · 5.1 kΩ', '0805 resistor.'],
    R2: ['R2 · 10 kΩ', '0805 resistor.'],
    R3: ['R3 · 56 kΩ', '0805 USB-C configuration resistor.'],
    R4: ['R4 · 56 kΩ', '0805 USB-C configuration resistor.'],
    R5: ['R5 · 56 kΩ', '0805 USB-C configuration resistor.'],
    R6: ['R6 · 56 kΩ', '0805 USB-C configuration resistor.'],
    R7: ['R7 · 0 Ω', '0805 link resistor.'],
    R8: ['R8 · 0 Ω', '0805 link resistor.'],
    R9: ['R9 · 0 Ω', '0805 link resistor.'],
    R10: ['R10 · 0 Ω', '0805 link resistor.']
  };

  const tagPart = (object, ref, customInfo) => {
    object.userData.partRef = ref;
    object.userData.partInfo = customInfo || partInfo[ref] || [ref, 'Placed from the real KiCad footprint.'];
    pickRoots.push(object);
    return object;
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

  const capsulePoints = (cx, cy, width, height, angleDeg, steps = 10) => {
    const pts = [];
    const a = THREE.MathUtils.degToRad(angleDeg || 0);
    const rotate = (x, y) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
    if (height >= width) {
      const r = width / 2;
      const half = (height - width) / 2;
      for (let i = 0; i <= steps; i += 1) {
        const t = Math.PI + Math.PI * i / steps;
        pts.push(rotate(r * Math.cos(t), -half + r * Math.sin(t)));
      }
      for (let i = 0; i <= steps; i += 1) {
        const t = Math.PI * i / steps;
        pts.push(rotate(r * Math.cos(t), half + r * Math.sin(t)));
      }
    } else {
      const r = height / 2;
      const half = (width - height) / 2;
      for (let i = 0; i <= steps; i += 1) {
        const t = Math.PI / 2 + Math.PI * i / steps;
        pts.push(rotate(-half + r * Math.cos(t), r * Math.sin(t)));
      }
      for (let i = 0; i <= steps; i += 1) {
        const t = -Math.PI / 2 + Math.PI * i / steps;
        pts.push(rotate(half + r * Math.cos(t), r * Math.sin(t)));
      }
    }
    return pts;
  };

  const boardShape = new THREE.Shape();
  BOARD_OUTLINE.forEach(([x, y], index) => {
    if (index === 0) boardShape.moveTo(x, y);
    else boardShape.lineTo(x, y);
  });
  boardShape.closePath();
  BOARD_DRILLS.forEach(([x, y, shape, width, height, angle]) => {
    const hole = new THREE.Path();
    if (shape === 'circle') {
      hole.absarc(x, y, width / 2, 0, Math.PI * 2, false);
    } else {
      const pts = capsulePoints(x, y, width, height, angle, 12);
      pts.forEach(([px, py], index) => index ? hole.lineTo(px, py) : hole.moveTo(px, py));
      hole.closePath();
    }
    boardShape.holes.push(hole);
  });

  const boardGeometry = new THREE.ExtrudeGeometry(boardShape, { depth: PCB_T, bevelEnabled: false, curveSegments: 16, steps: 1 });
  boardGeometry.rotateX(-Math.PI / 2);
  boardGeometry.translate(0, PCB_BOTTOM, 0);
  const board = tagPart(new THREE.Mesh(boardGeometry, mat.board), 'BOARD');
  mirroredCardGroup.add(board);

  // Preserve the underside exactly as the base laminate renders, but give the
  // exposed top and routed edge their own soldermask surfaces. The previous
  // single lit material made the directly-lit top/side look pale while the
  // underside happened to have the desired deep green.
  // Match the exposed soldermask to the already-correct underside rather than
  // allowing the studio lights to wash the top and routed edge towards mint.
  // These two mask surfaces are deliberately unlit and untone-mapped.
  const topMaskMaterial = new THREE.MeshBasicMaterial({
    color: 0x000702
  });
  topMaskMaterial.toneMapped = false;
  const sideMaskMaterial = new THREE.MeshBasicMaterial({
    color: 0x000702,
    side: THREE.DoubleSide
  });
  sideMaskMaterial.toneMapped = false;

  const topMaskGeometry = new THREE.ShapeGeometry(boardShape, 16);
  topMaskGeometry.rotateX(-Math.PI / 2);
  topMaskGeometry.translate(0, PCB_TOP + 0.018, 0);
  const topMask = new THREE.Mesh(topMaskGeometry, topMaskMaterial);
  topMask.renderOrder = 2;
  topMask.raycast = () => {};
  mirroredCardGroup.add(topMask);

  // ExtrudeGeometry already separates cap faces (material 0) from side walls
  // (material 1). Assign the side material directly; this avoids the coplanar
  // edge overlay that produced the previous vertical z-fighting/mesh stripes.
  board.material = [mat.board, sideMaskMaterial];

  const boardEdge = new THREE.LineSegments(new THREE.EdgesGeometry(boardGeometry, 28), mat.boardEdge);
  boardEdge.renderOrder = 4;
  mirroredCardGroup.add(boardEdge);

  // Complete KiCad F.SilkS artwork generated from the original PCB. Keep it
  // rigidly attached to the board so it never peels away during an exploded
  // view. The plane transform matches KiCad's Y-down board coordinate system.
  const silkMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.0,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false
  });
  silkMaterial.toneMapped = false;
  const silkOverlay = new THREE.Mesh(new THREE.PlaneGeometry(26, 30), silkMaterial);
  silkOverlay.rotation.x = -Math.PI / 2;
  silkOverlay.scale.y = -1;
  silkOverlay.position.set(0, PCB_TOP + 0.095, -15);
  silkOverlay.renderOrder = 120;
  silkOverlay.visible = false;
  silkOverlay.frustumCulled = false;
  silkOverlay.raycast = () => {};
  mirroredCardGroup.add(silkOverlay);

  new THREE.TextureLoader().load(
    'assets/models/framework-dual-usb/framework-dual-usb-silk.svg?v=20260830g',
    (texture) => {
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      silkMaterial.map = texture;
      silkMaterial.needsUpdate = true;
      silkOverlay.visible = true;
    },
    undefined,
    (error) => console.warn('Dual USB-C high-resolution F.SilkS overlay failed to load', error)
  );

  // Exact F.Cu SMD pad map. A few pads remain visible around components and make
  // the layout read like the real board without shipping another heavy GLB.
  const padGroup = new THREE.Group();
  padGroup.renderOrder = 40;
  mirroredCardGroup.add(padGroup);

  // Give exposed copper its own depth-biased material. The pad meshes sit only
  // tens of microns above the soldermask, so relying on raw depth precision
  // caused them to pop in/out at oblique camera angles.
  const padMaterial = mat.gold.clone();
  padMaterial.emissive = new THREE.Color(0x1d1202);
  padMaterial.emissiveIntensity = 0.10;

  FRONT_PADS.forEach(([x, y, width, height, shape, angle]) => {
    let pad;
    if (shape === 'oval' || shape === 'circle') {
      pad = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.035, 18), padMaterial);
      pad.scale.set(width, 1, height);
    } else {
      pad = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, height), padMaterial);
    }
    // Keep the geometry physically close to the board while maintaining enough
    // separation for stable rasterisation at grazing incidence.
    pad.position.set(x, PCB_TOP + 0.055, -y);
    // Same KiCad Y-down → Three.js X/-Z mapping as component bodies.
    pad.rotation.y = THREE.MathUtils.degToRad(angle);
    pad.renderOrder = 40;
    pad.frustumCulled = false;
    padGroup.add(pad);
  });

  const explodeParts = [];
  const registerExplodePart = (object, options = {}) => {
    if (!object || explodeParts.some((part) => part.object === object)) return;
    const basePosition = object.position.clone();
    const baseQuaternion = object.quaternion.clone();
    const offset = options.offset || new THREE.Vector3();
    const rotation = options.rotation || new THREE.Euler();
    explodeParts.push({
      object,
      basePosition,
      targetPosition: basePosition.clone().add(offset),
      baseQuaternion,
      targetQuaternion: baseQuaternion.clone().multiply(new THREE.Quaternion().setFromEuler(rotation)),
      delay: THREE.MathUtils.clamp(options.delay || 0, 0, 0.75)
    });
  };

  const automaticExplode = (object, ref, x, y, delay = 0.3, lift = 6.2) => {
    const side = Math.sign(x - 140) || 1;
    registerExplodePart(object, {
      offset: new THREE.Vector3(side * (2.1 + Math.min(Math.abs(x - 140), 8) * 0.12), lift + Math.abs(y - 141) * 0.08, y > 145 ? -2.8 : 2.1),
      rotation: new THREE.Euler(
        THREE.MathUtils.degToRad(y > 145 ? -5 : 5),
        THREE.MathUtils.degToRad(side * 4),
        THREE.MathUtils.degToRad(side * 7)
      ),
      delay
    });
    tagPart(object, ref);
  };

  // Package envelopes below are taken from the matching KiCad 3D library WRL
  // bounding boxes (legacy VRML units × 2.54 mm). Custom EasyEDA footprints
  // use their exact pad geometry from Expansion_Card.kicad_pcb.
  const packageSpec = Object.freeze({
    R0805: { length: 2.00152, width: 1.19888, height: 0.44958 },
    C0805: { length: 2.00152, width: 1.24968, height: 1.24968 },
    SOT23: { span: 2.79908, length: 2.90068, height: 1.54940 },
    QFN24: { length: 3.99796, width: 3.99796, height: 0.76962 },
    SOD123FL: { bodyLength: 2.80000, bodyWidth: 1.80000, overallLength: 3.70000, height: 1.00000 },
    XTAL3225: { length: 3.20042, width: 2.50084, height: 0.639999 }
  });

  const addGroupAt = (ref, x, y, rotation = 0) => {
    const group = new THREE.Group();
    group.name = ref;
    group.position.copy(kc(x, y, PCB_T));
    // KiCad positive footprint rotation is clockwise in its Y-down board plane.
    // Geometry uses X = footprint X and Z = -footprint Y, so +rotation is the
    // exact Three.js mapping after the card mirror + board transform.
    group.rotation.y = THREE.MathUtils.degToRad(rotation);
    group.userData.kicadPlacement = { x, y, rotation };
    mirroredCardGroup.add(group);
    return group;
  };

  const add0805 = (ref, x, y, rotation, capacitor) => {
    const group = addGroupAt(ref, x, y, rotation);
    const spec = capacitor ? packageSpec.C0805 : packageSpec.R0805;
    group.userData.packageEnvelope = spec;

    if (capacitor) {
      // Exact sub-envelopes from KiCad C_0805_2012Metric.wrl.
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.19888, 1.16840, 1.16840), mat.ceramic);
      body.position.y = 0.62484;
      group.add(body);
      [-0.80010, 0.80010].forEach((px) => {
        const end = new THREE.Mesh(new THREE.BoxGeometry(0.40132, 1.24968, 1.24968), mat.darkMetal);
        end.position.set(px, 0.62484, 0);
        group.add(end);
      });
    } else {
      // Exact sub-envelopes from KiCad R_0805_2012Metric.wrl.
      const substrate = new THREE.Mesh(new THREE.BoxGeometry(1.40208, 0.35814, 1.19888), mat.resistor);
      substrate.position.y = 0.22479;
      group.add(substrate);
      const film = new THREE.Mesh(new THREE.BoxGeometry(1.40208, 0.04572, 1.19888), mat.chipTop);
      film.position.y = 0.42672;
      group.add(film);
      [-0.85090, 0.85090].forEach((px) => {
        const end = new THREE.Mesh(new THREE.BoxGeometry(0.29972, 0.44958, 1.19888), mat.darkMetal);
        end.position.set(px, 0.22479, 0);
        group.add(end);
      });
    }

    automaticExplode(group, ref, x, y, 0.42, 5.4);
    return group;
  };

  const addSOT23 = (ref, x, y, rotation, pins, infoDelay) => {
    const group = addGroupAt(ref, x, y, rotation);
    const isCustomFivePin = pins === 5;
    group.userData.packageEnvelope = isCustomFivePin
      ? { bodyLength: 3.0, bodyWidth: 1.7, leadSpan: 2.8, height: 1.45, source: 'EasyEDA SOT-23-5 F.Fab' }
      : { bodyLength: 2.9, bodyWidth: 1.6, leadSpan: 2.8, height: 1.45, source: 'KiCad SOT-23-6 F.Fab' };

    // Source footprint bodies: U1/U4 = L3.0 × W1.7 mm, while U5/U6/U7
    // use KiCad SOT-23-6 F.Fab = 1.6 × 2.9 mm. Keep that local orientation
    // before applying the exact footprint rotation.
    const bodyX = isCustomFivePin ? 3.00 : 1.60;
    const bodyZ = isCustomFivePin ? 1.70 : 2.90;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyX, 1.45, bodyZ), mat.chip);
    body.position.y = 0.82423;
    group.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(bodyX - 0.18, 0.045, bodyZ - 0.18), mat.chipTop);
    top.position.y = 1.5269;
    group.add(top);

    // Stock KiCad SOT-23 model leads extend from ±0.7747 to ±1.39954 mm.
    const addLeadAlongZ = (px, localY) => {
      const pz = -localY;
      const outer = Math.sign(pz || 1);
      const lead = new THREE.Mesh(new THREE.BoxGeometry(0.49784, 0.14986, 0.62484), mat.metal);
      lead.position.set(px, 0.07493, outer * 1.08712);
      group.add(lead);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.49784, 0.249, 0.17), mat.darkMetal);
      heel.position.set(px, 0.33, outer * 0.86);
      group.add(heel);
    };

    const addLeadAlongX = (localX, localY) => {
      const px = localX;
      const pz = -localY;
      const outer = Math.sign(px || 1);
      const lead = new THREE.Mesh(new THREE.BoxGeometry(0.62484, 0.14986, 0.49784), mat.metal);
      lead.position.set(outer * 1.08712, 0.07493, pz);
      group.add(lead);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.249, 0.49784), mat.darkMetal);
      heel.position.set(outer * 0.86, 0.33, pz);
      group.add(heel);
    };

    if (isCustomFivePin) {
      [[-0.95, 1.15], [0, 1.15], [0.95, 1.15], [0.95, -1.15], [-0.95, -1.15]]
        .forEach(([px, py]) => addLeadAlongZ(px, py));
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.026, 16), mat.chipMark);
      dot.position.set(-1.02, 1.562, -0.51);
      group.add(dot);
    } else {
      [[-1.1375, -0.95], [-1.1375, 0], [-1.1375, 0.95], [1.1375, 0.95], [1.1375, 0], [1.1375, -0.95]]
        .forEach(([px, py]) => addLeadAlongX(px, py));
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.026, 16), mat.chipMark);
      dot.position.set(-0.51, 1.562, 1.00);
      group.add(dot);
    }

    automaticExplode(group, ref, x, y, infoDelay, 7.0);
    return group;
  };

  const addQFN = (ref, x, y, rotation) => {
    const group = addGroupAt(ref, x, y, rotation);
    group.userData.packageEnvelope = packageSpec.QFN24;
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.99796, 0.729, 3.99796), mat.chip);
    body.position.y = 0.3895;
    group.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.04062, 3.62), mat.chipTop);
    top.position.y = 0.74931;
    group.add(top);
    const ep = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.04, 2.8), mat.darkMetal);
    ep.position.y = 0.03;
    group.add(ep);

    // Exact QFN-24 footprint pad directions: footprint Y is rendered as -Z.
    const sidePad = new THREE.BoxGeometry(0.24, 0.055, 0.42);
    const endPad = new THREE.BoxGeometry(0.42, 0.055, 0.24);
    for (let i = 0; i < 6; i += 1) {
      const p = -1.25 + i * 0.5;
      [[p, -2.03], [-p, 2.03]].forEach(([px, pz]) => {
        const pin = new THREE.Mesh(sidePad, mat.gold);
        pin.position.set(px, 0.055, pz);
        group.add(pin);
      });
      [[2.03, -p], [-2.03, p]].forEach(([px, pz]) => {
        const pin = new THREE.Mesh(endPad, mat.gold);
        pin.position.set(px, 0.055, pz);
        group.add(pin);
      });
    }
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.028, 16), mat.chipMark);
    dot.position.set(-1.43, 0.785, -1.43);
    group.add(dot);
    automaticExplode(group, ref, x, y, 0.22, 9.5);
    return group;
  };

  const addDiode = (ref, x, y, rotation) => {
    const group = addGroupAt(ref, x, y, rotation);
    group.userData.packageEnvelope = packageSpec.SOD123FL;
    // The project uses PCM_JLCPCB:D_SOD-123FL. Its KiCad F.Fab body is
    // exactly 2.8 × 1.8 mm; the SMF5.0CA SOD-123FL nominal overall length is
    // about 3.7 mm, so the leads are centred on the source pads at ±1.4 mm.
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.80000, 1.00000, 1.80000), mat.diode);
    body.position.y = 0.52;
    group.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.035, 1.58), mat.chipTop);
    top.position.y = 1.028;
    group.add(top);
    [-1.625, 1.625].forEach((px) => {
      const lead = new THREE.Mesh(new THREE.BoxGeometry(0.450, 0.18, 0.78), mat.darkMetal);
      lead.position.set(px, 0.09, 0);
      group.add(lead);
    });
    // Source pad 1 is the cathode; keep the polarity bar on local -X.
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.020, 1.50), mat.diodeBand);
    band.position.set(-0.93, 1.05, 0);
    group.add(band);
    automaticExplode(group, ref, x, y, 0.38, 6.0);
    return group;
  };

  const addCrystal = () => {
    const ref = 'X1', x = 135.78, y = 138.37, rotation = -90;
    const group = addGroupAt(ref, x, y, rotation);
    group.userData.packageEnvelope = packageSpec.XTAL3225;
    // KiCad Crystal_SMD_3225: 3.2004 × 2.5008 × 0.6400 mm.
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.20042, 0.399999, 2.50084), mat.darkMetal);
    base.position.y = 0.1999995;
    group.add(base);
    [[-1.10, 0.80], [1.10, 0.80], [1.10, -0.80], [-1.10, -0.80]].forEach(([px, py]) => {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.055, 0.62), mat.metal);
      pad.position.set(px, 0.0275, -py);
      group.add(pad);
    });
    const can = new THREE.Mesh(new THREE.BoxGeometry(3.09999, 0.1399997, 2.399995), mat.metal);
    can.position.y = 0.469999;
    group.add(can);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.899994, 0.0999998, 2.199996), mat.metal);
    lid.position.y = 0.589999;
    group.add(lid);
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.022, 14), mat.chipMark);
    dot.position.set(-1.00, 0.648, -0.67);
    group.add(dot);
    automaticExplode(group, ref, x, y, 0.34, 7.0);
  };

  addQFN('U3', 139.97, 138.55, -90);
  addSOT23('U1', 131.12, 142.4075, 90, 5, 0.30);
  addSOT23('U4', 148.9355, 142.2825, -90, 5, 0.30);
  addSOT23('U5', 140.02, 133.09, 90, 6, 0.32);
  addSOT23('U6', 147.1, 146.4775, -90, 6, 0.32);
  addSOT23('U7', 132.95, 146.45, -90, 6, 0.32);
  addCrystal();
  [['D1', 143.14, 133.23, 90], ['D2', 136.03, 146.29, -90], ['D3', 144.17, 146.29, -90]].forEach((args) => addDiode(...args));
  [['C1',133.13,132.71,90],['C2',135.14,132.71,90],['C5',146.08,131.83,0],['C6',146.08,133.85,0],['C7',138.23,146.78,90],['C8',138.24,143.31,90],['C9',141.93,146.78,90],['C10',141.93,143.31,90],['C11',135.98,135.43,180]].forEach(([ref,x,y,r]) => add0805(ref,x,y,r,true));
  [['R1',137.2,132.7,-90],['R2',144.69,138.21,-90],['R3',139.99,151.48,0],['R4',139.99,149.52,0],['R5',139.9225,155.9,180],['R6',139.93,153.94,180],['R7',148.96,139.3225,0],['R8',151.88,142.3225,90],['R9',128.19,142.3625,-90],['R10',128.19,138.93,90]].forEach(([ref,x,y,r]) => add0805(ref,x,y,r,false));

  const usbRingGeometry = (outerW, outerH, innerW, innerH, depth, outerR, innerR) => {
    const shape = new THREE.Shape();
    roundedRectPath(shape, -outerW / 2, -outerH / 2, outerW, outerH, outerR);
    const hole = new THREE.Path();
    roundedRectPath(hole, -innerW / 2, -innerH / 2, innerW, innerH, innerR);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16, steps: 1 });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  };

  // GCT USB4105 drawing: 8.94 mm shell width, 3.31 mm profile height,
  // 7.35 mm body length and 8.34 x 2.56 mm mating opening. The KiCad footprint's
  // PCB-edge datum puts the front face essentially flush with the card face.
  const makeUSB4105 = (ref, x, y) => {
    const group = addGroupAt(ref, x, y, 0);
    const frontFromOrigin = 3.675;
    const bodyLength = 7.35;
    const centreLocalY = frontFromOrigin - bodyLength / 2; // KiCad local Y
    const centreZ = -centreLocalY;
    const shell = new THREE.Mesh(usbRingGeometry(8.94, 3.31, 8.34, 2.56, bodyLength, 1.52, 1.27), mat.metal);
    shell.position.set(0, 1.655, centreZ);
    group.add(shell);

    const rear = new THREE.Mesh(new THREE.BoxGeometry(7.65, 2.42, 1.10), mat.blackPlastic);
    rear.position.set(0, 1.54, 3.03);
    group.add(rear);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(6.40, 0.66, 5.55), mat.blackPlastic);
    tongue.position.set(0, 1.57, -0.35);
    group.add(tongue);
    const tongueLip = new THREE.Mesh(new THREE.BoxGeometry(5.68, 0.07, 4.90), mat.white);
    tongueLip.position.set(0, 1.92, -0.48);
    group.add(tongueLip);
    // USB Type-C 16-contact population: A/B rows keep the USB2.0 contacts
    // at the standard 0.5 mm mating pitch and omit the SuperSpeed positions.
    const contactGeo = new THREE.BoxGeometry(0.18, 0.035, 4.40);
    const contactX = [-2.75, -1.25, -0.75, -0.25, 0.25, 0.75, 1.25, 2.75];
    contactX.forEach((px) => {
      const top = new THREE.Mesh(contactGeo, mat.gold);
      top.position.set(px, 1.94, -0.62);
      group.add(top);
      const bottom = new THREE.Mesh(contactGeo, mat.gold);
      bottom.position.set(px, 1.20, -0.62);
      group.add(bottom);
    });

    // Exact solder-tail row from the KiCad USB4105 footprint (local Y=-3.68).
    const tailX = [-3.20, -2.40, -1.75, -1.25, -0.75, -0.25, 0.25, 0.75, 1.25, 1.75, 2.40, 3.20];
    tailX.forEach((px) => {
      const wide = Math.abs(px) >= 2.39;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(wide ? 0.48 : 0.22, 0.08, 0.82), mat.gold);
      tail.position.set(px, 0.055, 3.47);
      group.add(tail);
    });

    // Exact locating pegs: footprint ±2.89 mm, Y=-2.605 mm, Ø0.65 NPTH.
    [-2.89, 2.89].forEach((px) => {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.10, 18), mat.blackPlastic);
      peg.position.set(px, -0.24, 2.605);
      group.add(peg);
    });

    // Shell stakes use the four actual S1 drill centres from the PCB footprint.
    [[-4.32, 3.105, 1.55], [4.32, 3.105, 1.55], [-4.32, -1.075, 1.28], [4.32, -1.075, 1.28]]
      .forEach(([px, pz, depth]) => {
        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.16, depth), mat.darkMetal);
        stake.position.set(px, -0.18, pz);
        group.add(stake);
      });

    registerExplodePart(group, {
      offset: new THREE.Vector3(x < 140 ? -8.2 : 8.2, 5.8, -10.8),
      rotation: new THREE.Euler(THREE.MathUtils.degToRad(-7), 0, THREE.MathUtils.degToRad(x < 140 ? -5 : 5)),
      delay: 0.10
    });
    tagPart(group, ref);
    return group;
  };
  makeUSB4105('J1', 132.83, 153.33);
  makeUSB4105('J2', 147.18, 153.33);

  // Proven Molex 105444 fallback from the ESP32 explorer. The exact legacy CAD
  // GLB loads over it when available, so the card remains useful offline too.
  const usbFallback = new THREE.Group();
  const usbMountedZ = 1.4;
  usbFallback.position.set(0, PCB_TOP + 0.90, usbMountedZ);
  usbFallback.rotation.z = Math.PI;
  boardGroup.add(usbFallback);
  tagPart(usbFallback, 'P1');

  const addUsbFallbackPart = (geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    usbFallback.add(mesh);
    return mesh;
  };
  const matingRearZ = 2.30, matingTipZ = 10.00, matingDepth = matingTipZ - matingRearZ;
  addUsbFallbackPart(usbRingGeometry(8.25, 2.40, 6.83, 1.30, matingDepth, 1.05, 0.57), mat.metal, [0, 0, (matingRearZ + matingTipZ) / 2]);
  addUsbFallbackPart(usbRingGeometry(8.30, 2.50, 6.75, 1.22, 0.34, 1.08, 0.54), mat.metal, [0, 0, 9.83]);
  addUsbFallbackPart(usbRingGeometry(8.25, 2.40, 6.83, 1.30, 2.30, 1.05, 0.57), mat.metal, [0, 0, 1.15]);
  const fallbackCore = new THREE.Mesh(new THREE.BoxGeometry(5.50, 0.80, 7.40), mat.blackPlastic); fallbackCore.position.set(0, 0, 6.10); usbFallback.add(fallbackCore);
  for (let i = 0; i < 12; i += 1) {
    const px = -2.75 + i * 0.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 6.84), mat.gold); top.position.set(px, 0.415, 5.76); usbFallback.add(top);
    if (i !== 5 && i !== 6) { const bottom = top.clone(); bottom.position.y = -0.415; usbFallback.add(bottom); }
  }
  registerExplodePart(usbFallback, { offset: new THREE.Vector3(0, 6.0, 10.5), rotation: new THREE.Euler(THREE.MathUtils.degToRad(-8), 0, THREE.MathUtils.degToRad(6)), delay: 0.08 });

  if (THREE.GLTFLoader) {
    const loader = new THREE.GLTFLoader();
    loader.load(
      'assets/models/framework-esp32/framework-usbc.glb',
      (gltf) => {
        const p1 = gltf.scene.getObjectByName('P1');
        if (!p1) return;
        const exact = p1.clone(true);
        exact.name = 'P1_Molex_105444_exact';
        exact.position.set(0, 0, 0);
        exact.rotation.x = Math.PI / 2;
        exact.rotateY(Math.PI);
        exact.scale.setScalar(1000);
        exact.position.set(0, PCB_TOP, usbMountedZ);
        exact.traverse((object) => {
          if (!object.isMesh) return;
          const material = mat.metal.clone();
          material.side = THREE.DoubleSide;
          object.material = material;
        });
        exactUsbGroup.add(exact);
        usbFallback.visible = false;
        registerExplodePart(exact, { offset: new THREE.Vector3(0, 6.0, 10.5), rotation: new THREE.Euler(THREE.MathUtils.degToRad(-8), 0, THREE.MathUtils.degToRad(6)), delay: 0.08 });
        tagPart(exact, 'P1');
      },
      undefined,
      () => { usbFallback.visible = true; }
    );
  }

  // M2 mounting hardware at the exact Framework reference positions.
  const screwMetal = mat.metal.clone();
  const screwDrive = new THREE.MeshStandardMaterial({ color: 0x3d4143, roughness: 0.46, metalness: 0.5 });
  const screwAssemblies = [];
  [[128.7, 146.5], [151.3, 146.5]].forEach(([x, y], index) => {
    const p = kc(x, y, 0);
    const screw = new THREE.Group();
    screw.position.set(p.x, 0, p.z);
    mirroredCardGroup.add(screw);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.85, 24), screwMetal); shaft.position.set(0, PCB_TOP - 0.58, 0); screw.add(shaft);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.62, 0.58, 32), screwMetal); head.position.set(0, PCB_TOP + 0.28, 0); screw.add(head);
    const slotA = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.055, 0.22), screwDrive); slotA.position.set(0, PCB_TOP + 0.585, 0); screw.add(slotA);
    const slotB = slotA.clone(); slotB.rotation.y = Math.PI / 2; screw.add(slotB);
    screw.userData.partInfo = [`M2 mounting screw ${index + 1}`, 'Framework expansion-card PCB retention hardware.'];
    pickRoots.push(screw);
    screwAssemblies.push(screw);
  });
  const screwBases = screwAssemblies.map((screw) => screw.position.clone());

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
    geometry.computeBoundingSphere();
    return geometry;
  };

  const shellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe2e9e8,
    roughness: 0.32,
    metalness: 0.01,
    transparent: true,
    opacity: 0.17,
    transmission: 0.08,
    clearcoat: 0.42,
    clearcoatRoughness: 0.30,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  let shellMesh = null;
  let shellVisible = true;
  let shellReady = false;
  fetch('assets/models/framework-esp32/framework-enclosure.stl')
    .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.arrayBuffer(); })
    .then((buffer) => {
      shellMesh = new THREE.Mesh(parseBinarySTL(buffer), shellMaterial);
      shellMesh.renderOrder = 3;
      // Do not let the transparent shell steal hover hits from the electronics.
      shellMesh.raycast = () => {};
      shellGroup.add(shellMesh);
      shellReady = true;
      status.textContent = 'KiCad PCB + Framework enclosure loaded';
      status.classList.add('is-ready');
      announce('Dual USB-C Framework 3D model ready');
    })
    .catch((error) => {
      status.textContent = 'Exact PCB loaded · enclosure unavailable';
      console.warn('Framework enclosure STL failed to load', error);
    });

  let exploded = false;
  let componentExplodeProgress = 0;
  let componentExplodeTarget = 0;
  let yaw = THREE.MathUtils.degToRad(-31);
  let pitch = THREE.MathUtils.degToRad(29);
  let distance = 58;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let targetDistance = distance;
  let assembledDistance = distance;

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
      const active = button.dataset.dualUsbView === keyName;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (announceChange) announce(`${keyName} camera view`);
  };

  viewButtons.forEach((button) => button.addEventListener('click', () => setPreset(button.dataset.dualUsbView)));

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
      targetDistance = Math.min(98, assembledDistance + 18);
    } else {
      targetDistance = assembledDistance;
    }
    explodeButton.setAttribute('aria-pressed', String(exploded));
    explodeButton.textContent = exploded ? 'Assemble' : 'Explode';
    announce(exploded ? 'Exploded component and enclosure view' : 'Assembled card view');
  });

  const resetPartPanel = () => {
    if (!partPanel || !partName || !partDetail) return;
    partName.textContent = 'Component map';
    partDetail.textContent = 'Move over the PCB to identify the hub, power switches, protection and ports.';
    partPanel.classList.remove('is-active');
  };

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
    resetPartPanel();
    announce('3D view reset');
  });

  const pointers = new Map();
  let dragStart = null;
  let pinchStartDistance = 0;
  let pinchStartZoom = distance;
  let dragTravel = 0;

  const markCustomView = () => {
    viewButtons.forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });
  };

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const resolvePartInfo = (object) => {
    let current = object;
    while (current) {
      if (current.userData && current.userData.partInfo) return current.userData.partInfo;
      current = current.parent;
    }
    return null;
  };
  const updatePartHover = (event) => {
    if (!partPanel || !partName || !partDetail || pointers.size) return;
    const rect = stage.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hit = raycaster.intersectObjects(pickRoots, true).find((entry) => entry.object.visible !== false);
    const info = hit ? resolvePartInfo(hit.object) : null;
    if (!info) { resetPartPanel(); return; }
    partName.textContent = info[0];
    partDetail.textContent = info[1];
    partPanel.classList.add('is-active');
  };

  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragTravel = 0;
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
    if (!pointers.has(event.pointerId)) { updatePartHover(event); return; }
    const before = pointers.get(event.pointerId);
    dragTravel += Math.hypot(event.clientX - before.x, event.clientY - before.y);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1 && dragStart) {
      targetYaw = dragStart.yaw - (event.clientX - dragStart.x) * 0.009;
      targetPitch = THREE.MathUtils.clamp(dragStart.pitch + (event.clientY - dragStart.y) * 0.008, THREE.MathUtils.degToRad(-77), THREE.MathUtils.degToRad(88));
      markCustomView();
    } else if (pointers.size === 2 && pinchStartDistance > 0) {
      const pts = [...pointers.values()];
      const pinch = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      targetDistance = THREE.MathUtils.clamp(pinchStartZoom * pinchStartDistance / Math.max(pinch, 1), 35, 90);
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
  stage.addEventListener('pointerleave', () => { if (!pointers.size) resetPartPanel(); });

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    targetDistance = THREE.MathUtils.clamp(targetDistance + event.deltaY * 0.035, 35, 90);
  }, { passive: false });

  stage.addEventListener('keydown', (event) => {
    let handled = true;
    if (event.key === 'ArrowLeft') targetYaw += 0.12;
    else if (event.key === 'ArrowRight') targetYaw -= 0.12;
    else if (event.key === 'ArrowUp') targetPitch = Math.min(targetPitch + 0.1, THREE.MathUtils.degToRad(88));
    else if (event.key === 'ArrowDown') targetPitch = Math.max(targetPitch - 0.1, THREE.MathUtils.degToRad(-77));
    else if (event.key === '+' || event.key === '=') targetDistance = Math.max(35, targetDistance - 3);
    else if (event.key === '-' || event.key === '_') targetDistance = Math.min(90, targetDistance + 3);
    else handled = false;
    if (handled) { event.preventDefault(); markCustomView(); }
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

  const smoothstep = (value) => {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutBack = (value, overshoot = 1.10) => {
    const t = THREE.MathUtils.clamp(value, 0, 1) - 1;
    const c3 = overshoot + 1;
    return 1 + c3 * t * t * t + overshoot * t * t;
  };
  const staged = (start, end, useBackEase = false) => {
    const raw = THREE.MathUtils.clamp((componentExplodeProgress - start) / Math.max(0.001, end - start), 0, 1);
    if (componentExplodeTarget < 0.5) return smoothstep(raw);
    return useBackEase ? easeOutBack(raw, 1.35) : smoothstep(raw);
  };

  const updateMechanicalExplode = () => {
    screwAssemblies.forEach((screw, index) => {
      const phase = staged(index * 0.018, 0.24 + index * 0.018, true);
      const side = index === 0 ? -1 : 1;
      screw.position.copy(screwBases[index]);
      screw.position.x += side * 0.75 * phase;
      screw.position.y += 10.8 * phase;
      screw.position.z -= 0.55 * phase;
      screw.rotation.x = THREE.MathUtils.degToRad(side * 3.5) * phase;
      screw.rotation.y = side * Math.PI * 4.5 * phase;
      screw.rotation.z = THREE.MathUtils.degToRad(side * 4.5) * phase;
    });
    const shellPhase = staged(0.04, 0.43, false);
    shellGroup.position.set(0, -12.0 * shellPhase, -2.8 * shellPhase);
    shellGroup.rotation.x = THREE.MathUtils.degToRad(-5.0) * shellPhase;
    shellGroup.rotation.z = THREE.MathUtils.degToRad(2.3) * shellPhase;
  };

  const updateComponentExplode = () => {
    explodeParts.forEach((part) => {
      const span = Math.max(0.001, 1 - part.delay);
      const raw = THREE.MathUtils.clamp((componentExplodeProgress - part.delay) / span, 0, 1);
      const posPhase = componentExplodeTarget > 0.5 ? easeOutBack(raw) : smoothstep(raw);
      const rotPhase = smoothstep(raw);
      part.object.position.lerpVectors(part.basePosition, part.targetPosition, posPhase);
      part.object.quaternion.copy(part.baseQuaternion).slerp(part.targetQuaternion, rotPhase);
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

  resetPartPanel();
  setPreset('iso', false);
  animate();
})();