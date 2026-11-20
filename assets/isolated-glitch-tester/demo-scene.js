import { createLeadHarness } from './bench-leads.js?v=20261120-bench';

export const BENCH_FITTED_REFS = new Set([
  'J1', 'J2', 'J5', 'SW1', 'SW2', 'SW3', 'SW4', 'VR1', 'VR2', 'D13', 'D14', 'D15', 'D16'
]);

const LAMP_COLORS = {
  D6: '#64b8ff', D7: '#ffb75b', D8: '#bba6ff', D9: '#ff7569',
  D13: '#ff7569', D14: '#bba6ff', D15: '#ffb75b', D16: '#64b8ff'
};
const SWITCH_REFS = new Set(['SW2', 'SW3', 'SW4']);
const ACTIONS = [
  { action: 'input', ref: 'J1', label: 'Input leads', side: 'left', z: 1.1, pad: '1' },
  { action: 'power', ref: 'J5', label: 'Power plug', side: 'right', z: 10.5, pad: '1' },
  { action: 'reset', ref: 'SW2', label: 'Arm / Reset', side: 'left', z: 23 },
  { action: 'threshold', ref: 'SW3', label: 'Threshold', side: 'left', z: 24 },
  { action: 'mute', ref: 'SW4', label: 'Buzzer', side: 'right', z: 24 }
];

const actionByPart = new Map(ACTIONS.map(({ action, ref }) => [ref, action]));
actionByPart.set('J2', 'input');

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

function buildHotspots(THREE, board, stage, boardPoint, onAction) {
  const layer = document.createElement('div');
  layer.className = 'mct-bench__hotspots';
  layer.hidden = true;
  const hotspots = ACTIONS.map(definition => {
    const { action, ref, label, z, pad } = definition;
    const part = board.components.find(component => component.ref === ref);
    const point = pad && part.pads.find(candidate => candidate.number === pad)?.absolute;
    const [x, y] = boardPoint(board, ...(point || [part.x, part.y]));
    const line = document.createElement('span');
    line.className = 'mct-bench__link';
    line.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mct-bench__hotspot';
    button.dataset.benchAction = action;
    button.dataset.footprint = action === 'input' ? 'J1 J2' : ref;
    button.textContent = label;
    button.addEventListener('click', () => onAction(action));
    layer.append(line, button);
    return { ...definition, line, button, anchor: new THREE.Vector3(x, y, z) };
  });
  stage.append(layer);
  return { layer, hotspots };
}

function updateHotspotLabels(hotspots, state) {
  const labels = {
    input: state.inputConnected ? 'Detach simulated input leads at J1 and J2' : 'Attach simulated input leads at J1 and J2',
    power: state.powered ? 'Unplug simulated power at J5' : 'Plug in simulated power at J5',
    reset: 'Arm or reset at SW2',
    threshold: `Change window at SW3, currently ±${state.threshold} mV`,
    mute: state.buzzerMuted ? 'Unmute buzzer at SW4' : 'Mute buzzer at SW4'
  };
  const pressed = {
    input: state.inputConnected,
    power: state.powered,
    threshold: state.threshold === 150,
    mute: state.buzzerMuted
  };
  for (const { action, button } of hotspots) {
    button.setAttribute('aria-label', labels[action]);
    if (action in pressed) button.setAttribute('aria-pressed', String(pressed[action]));
  }
}

export function createBenchVisual(THREE, board, { stage, boardPoint, onAction, invalidate }) {
  const { layer, hotspots } = buildHotspots(THREE, board, stage, boardPoint, onAction);
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

  let state = { powered: false, inputConnected: false, armed: false, buzzerMuted: false, threshold: 75, live: [], latched: [] };
  let power = 0;
  let input = 0;
  let lastTime = 0;
  const viewPoint = new THREE.Vector3();

  function paintLamps() {
    const active = new Set(state.powered ? [...state.live, ...state.latched] : []);
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
    paintLamps();
    paintSwitches();
    updateHotspotLabels(hotspots, state);
    lastTime = 0;
    invalidate();
  }

  function animate(time) {
    const amount = reducedMotion.matches ? 1 : Math.min(48, lastTime ? time - lastTime : 16) / 220;
    lastTime = time;
    const next = (value, goal) => value < goal ? Math.min(goal, value + amount) : Math.max(goal, value - amount);
    const powered = Number(state.powered);
    const attached = Number(state.inputConnected);
    power = next(power, powered);
    input = next(input, attached);
    leads.update(power, input);
    const moving = power !== powered || input !== attached;
    if (!moving) lastTime = 0;
    return moving;
  }

  function renderHotspots(camera, assembly, width, height, facingFront) {
    layer.hidden = !facingFront;
    if (!facingFront) return;
    const mobile = width < 560;
    const lanes = { left: [], right: [] };
    for (const spot of hotspots) {
      viewPoint.copy(spot.anchor).applyMatrix4(assembly.matrixWorld).project(camera);
      const x = (viewPoint.x + 1) * width / 2;
      const y = (1 - viewPoint.y) * height / 2;
      const inside = x > 3 && x < width - 3 && y > 3 && y < height - 3;
      spot.button.hidden = !inside;
      spot.line.hidden = !inside;
      if (!inside) continue;
      lanes[spot.side].push({ spot, x, y });
    }
    for (const lane of Object.values(lanes)) {
      lane.sort((a, b) => a.y - b.y);
      let previous = 0;
      for (const { spot, x, y } of lane) {
        const inset = mobile ? 7 : 18;
        const gap = mobile ? 16 : 38;
        const buttonWidth = spot.button.offsetWidth;
        const buttonHeight = spot.button.offsetHeight;
        const left = spot.side === 'left';
        const row = Math.min(height - buttonHeight - inset, Math.max(inset, previous, y - buttonHeight / 2));
        const column = Math.min(width - buttonWidth - inset, Math.max(inset, left ? x - buttonWidth - gap : x + gap));
        spot.button.style.transform = `translate(${column}px, ${row}px)`;
        previous = row + buttonHeight + 5;
        const dx = (left ? column + buttonWidth : column) - x;
        const dy = row + buttonHeight / 2 - y;
        spot.line.style.width = `${Math.hypot(dx, dy)}px`;
        spot.line.style.transform = `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx)}rad)`;
      }
    }
  }

  updateHotspotLabels(hotspots, state);
  return {
    group, update, animate, registerPart, renderHotspots,
    lookupAction: ref => actionByPart.get(ref),
    showHotspots: visible => { layer.hidden = !visible; },
    readState: () => state,
    mated: () => ({ power: power === 1, input: input === 1 }),
    dispose() {
      leads.dispose();
      texture.dispose();
      for (const material of disposeMaterial) material.dispose();
      layer.remove();
    }
  };
}
