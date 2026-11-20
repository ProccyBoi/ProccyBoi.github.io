import { createLeadHarness } from './bench-leads.js?v=20261120-bench-plus';

export const BENCH_FITTED_REFS = new Set([
  'J1', 'J2', 'J5', 'SW1', 'SW2', 'SW3', 'SW4', 'VR1', 'VR2', 'D13', 'D14', 'D15', 'D16'
]);

const LAMP_COLORS = {
  D6: '#64b8ff', D7: '#ffb75b', D8: '#bba6ff', D9: '#ff7569',
  D13: '#ff7569', D14: '#bba6ff', D15: '#ffb75b', D16: '#64b8ff'
};
const SWITCH_REFS = new Set(['SW2', 'SW3', 'SW4']);
const actionByPart = new Map([
  ['J1', 'input'], ['J2', 'input'], ['J5', 'power'],
  ['SW2', 'reset'], ['SW3', 'threshold'], ['SW4', 'mute']
]);

export function benchNeedsActuatorNodes(ref) {
  return SWITCH_REFS.has(ref);
}

export function benchCanInstance(ref) {
  return !SWITCH_REFS.has(ref) && !(ref in LAMP_COLORS);
}

function glowTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,.82)');
  gradient.addColorStop(.24, 'rgba(255,255,255,.58)');
  gradient.addColorStop(.55, 'rgba(255,255,255,.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

function createBoardGlow(THREE, board, surfaceGeometry, lamps) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = Math.round(canvas.width * board.height / board.width);
  const scale = canvas.width / board.width;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  });
  const mesh = new THREE.Mesh(surfaceGeometry, material);
  mesh.name = 'LED light on PCB';
  mesh.position.z = board.thickness / 2 + 0.021;
  mesh.visible = false;
  mesh.raycast = () => {};
  let previous = '';

  function paint(active) {
    const key = [...active].join(' ');
    if (key === previous) return;
    previous = key;
    mesh.visible = active.size > 0;
    if (!mesh.visible) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'lighter';
    for (const ref of active) {
      const { halo, throughHole } = lamps.get(ref);
      const x = canvas.width / 2 + halo.position.x * scale;
      const y = canvas.height / 2 - halo.position.y * scale;
      const radius = (throughHole ? 10 : 6.5) * scale;
      const color = LAMP_COLORS[ref];
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `${color}${throughHole ? '78' : '65'}`);
      glow.addColorStop(0.34, `${color}48`);
      glow.addColorStop(0.68, `${color}17`);
      glow.addColorStop(1, `${color}00`);
      context.fillStyle = glow;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    texture.needsUpdate = true;
  }

  return { mesh, paint, dispose: () => texture.dispose() };
}

export function createBenchVisual(THREE, board, { boardPoint, surfaceGeometry, invalidate }) {
  const leads = createLeadHarness(THREE, board, { boardPoint });
  const group = new THREE.Group();
  group.name = 'Simulated plug-in leads and LED indicators';
  group.add(leads.group);
  // The plated input holes are open in the scene. A padded hit volume lets
  // a tap in the bore behave like a tap on the surrounding copper.
  const pickMaterial = new THREE.MeshBasicMaterial();
  for (const [ref, action, radius, z] of [
    ['J1', 'input', 5.7, 0.82],
    ['J2', 'input', 5.7, 0.82],
    ['J5', 'power', 3.3, 9.1]
  ]) {
    const component = board.components.find(part => part.ref === ref);
    const centres = component.pads.map(pad => pad.absolute);
    const x = centres.reduce((sum, point) => sum + point[0], 0) / centres.length;
    const y = centres.reduce((sum, point) => sum + point[1], 0) / centres.length;
    const target = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 6), pickMaterial);
    target.position.set(...boardPoint(board, x, y), z);
    target.userData = { action, footprints: [ref] };
    target.visible = false;
    group.add(target);
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const texture = glowTexture(THREE);
  const lamps = new Map();
  const switchPivots = new Map();
  const disposeMaterial = new Set();
  for (const component of board.components) {
    const ref = component.ref;
    if (!(ref in LAMP_COLORS)) continue;
    const throughHole = Number(ref.slice(1)) >= 13;
    const centre = component.pads.reduce((point, pad) => {
      return [point[0] + pad.absolute[0] / component.pads.length, point[1] + pad.absolute[1] / component.pads.length];
    }, [0, 0]);
    const [x, y] = boardPoint(board, ...centre);
    const material = new THREE.SpriteMaterial({
      map: texture, color: LAMP_COLORS[ref], blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, opacity: throughHole ? 0.75 : 0.65, toneMapped: false
    });
    const halo = new THREE.Sprite(material);
    halo.name = `${ref} active lens`;
    halo.userData.footprint = ref;
    halo.position.set(x, y, throughHole ? 11.5 : 1.97);
    halo.scale.setScalar(throughHole ? 8.2 : 3.9);
    halo.visible = false;
    group.add(halo);
    lamps.set(ref, { halo, throughHole, finishes: [] });
    disposeMaterial.add(material);
  }
  const boardGlow = createBoardGlow(THREE, board, surfaceGeometry, lamps);
  group.add(boardGlow.mesh);

  const dropMaterial = new THREE.MeshBasicMaterial({
    color: '#8cc4f4', transparent: true, opacity: 0.58,
    depthWrite: false, toneMapped: false
  });
  const dropRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), dropMaterial);
  dropRing.name = 'Cable drop target';
  dropRing.visible = false;
  dropRing.raycast = () => {};
  group.add(dropRing);

  let state = {
    powerConnected: false, sourceOn: true, powered: false, inputConnected: false,
    armed: false, buzzerMuted: false, threshold: 75, live: [], latched: []
  };
  let power = 0;
  let input = 0;
  let lastTime = 0;

  function paintLamps() {
    const active = new Set(state.powered ? [...state.live, ...state.latched] : []);
    boardGlow.paint(active);
    for (const [ref, lamp] of lamps) {
      const lit = active.has(ref);
      lamp.halo.visible = lit;
      lamp.halo.userData.active = lit;
      for (const finish of lamp.finishes) {
        finish.material.color.copy(finish.baseColor);
        finish.material.emissive.copy(finish.baseEmission);
        finish.material.emissiveIntensity = finish.baseIntensity;
        if (lit) {
          finish.material.color.set(LAMP_COLORS[ref]).convertSRGBToLinear();
          finish.material.emissive.set(LAMP_COLORS[ref]).convertSRGBToLinear();
          finish.material.emissiveIntensity = lamp.throughHole ? 3 : 2.2;
        }
      }
    }
  }

  function registerPart(ref, model) {
    const lamp = lamps.get(ref);
    if (lamp) {
      const finishes = new Map();
      model.traverse(mesh => {
        if (!mesh.isMesh || !mesh.material?.isMeshStandardMaterial) return;
        const source = mesh.material;
        const color = source.color;
        const isLens = lamp.throughHole ? source.transparent : color.g > color.r * 1.6 && color.g > color.b * 1.5;
        if (!isLens) return;
        if (!finishes.has(source)) {
          const material = source.clone();
          finishes.set(source, {
            material, baseColor: material.color.clone(), baseEmission: material.emissive.clone(), baseIntensity: material.emissiveIntensity
          });
          disposeMaterial.add(material);
        }
        mesh.material = finishes.get(source).material;
      });
      lamp.finishes = [...finishes.values()];
      paintLamps();
    }
    if (!SWITCH_REFS.has(ref)) return;
    const find = phrase => {
      let match;
      model.traverse(object => {
        if (object.name.toLowerCase().replaceAll('_', ' ').startsWith(phrase)) match = object;
      });
      return match;
    };
    const lever = find('polished toggle lever');
    const tip = find('rounded lever tip');
    const seat = find('dark pivot seat');
    if (!lever || !tip || !seat || lever.parent !== seat.parent) return;
    const pivot = new THREE.Group();
    pivot.name = `${ref} movable actuator`;
    pivot.position.copy(seat.position);
    seat.parent.add(pivot);
    pivot.attach(lever);
    pivot.attach(tip);
    switchPivots.set(ref, pivot);
    paintSwitches();
  }

  function paintSwitches() {
    for (const [ref, enabled] of [['SW2', state.armed], ['SW3', state.threshold === 150], ['SW4', state.buzzerMuted]]) {
      const pivot = switchPivots.get(ref);
      if (pivot) pivot.rotation.z = enabled ? 0.43 : 0;
    }
  }

  function update(next) {
    state = { ...state, ...next };
    leads.setSourcePower(state.sourceOn);
    paintLamps();
    paintSwitches();
    lastTime = 0;
    invalidate();
  }

  function animate(time) {
    const amount = reducedMotion.matches ? 1 : Math.min(48, lastTime ? time - lastTime : 16) / 220;
    lastTime = time;
    const next = (value, goal) => value < goal ? Math.min(goal, value + amount) : Math.max(goal, value - amount);
    const attachedPower = Number(state.powerConnected);
    const attached = Number(state.inputConnected);
    power = next(power, attachedPower);
    input = next(input, attached);
    leads.update(power, input);
    const moving = power !== attachedPower || input !== attached;
    if (!moving) lastTime = 0;
    return moving;
  }

  function beginLeadDrag(action, ref) {
    const target = leads.leadDragTarget(action, ref);
    if (!target || leads.beginLeadDrag(action, ref) === false) return false;
    dropRing.position.copy(target);
    dropRing.position.z += 0.15;
    dropRing.scale.setScalar(action === 'power' ? 4.5 : 6.2);
    dropMaterial.color.set('#8cc4f4').convertSRGBToLinear();
    dropMaterial.opacity = 0.58;
    dropRing.visible = true;
    invalidate();
    return true;
  }

  function moveLeadDrag(action, point, canSnap) {
    leads.moveLeadDrag(action, point);
    dropMaterial.color.set(canSnap ? '#a6efd7' : '#8cc4f4').convertSRGBToLinear();
    dropMaterial.opacity = canSnap ? 0.92 : 0.58;
    invalidate();
  }

  function endLeadDrag(action, snapped) {
    leads.endLeadDrag(action, snapped);
    if (snapped) {
      if (action === 'power') power = 1;
      else input = 1;
    }
    dropRing.visible = false;
    invalidate();
  }

  return {
    group, update, animate, registerPart,
    beginLeadDrag, moveLeadDrag, endLeadDrag,
    leadDragAnchor: (action, ref) => leads.leadDragAnchor(action, ref),
    leadDragTarget: (action, ref) => leads.leadDragTarget(action, ref),
    lookupAction: ref => actionByPart.get(ref),
    readState: () => state,
    mated: () => ({ power: power === 1, input: input === 1 }),
    dispose() {
      leads.dispose();
      texture.dispose();
      boardGlow.dispose();
      for (const material of disposeMaterial) material.dispose();
    }
  };
}
