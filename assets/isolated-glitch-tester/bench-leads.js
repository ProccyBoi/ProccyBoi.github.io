import { createBenchSupply } from './bench-supply.js?v=20261120-bench-plus';

const TAU = 2 * Math.PI;

export function createLeadHarness(THREE, board, { boardPoint }) {
  const group = new THREE.Group();
  group.name = 'Virtual test leads';

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const material = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).convertSRGBToLinear(),
    roughness,
    metalness,
    envMapIntensity: metalness > 0.2 ? 0.45 : 0.22
  });
  const finishes = {
    shell: material('#353c43', 0.65),
    collar: material('#171c23', 0.74),
    pin: material('#c5ad80', 0.33, 0.8),
    lug: material('#bbad98', 0.32, 0.74),
    power: material('#4d98df', 0.62),
    powerReturn: material('#66727e', 0.7),
    input: material('#db645b', 0.61),
    inputReturn: material('#a09a8b', 0.68)
  };

  const supply = createBenchSupply(THREE, {
    power: [finishes.power, finishes.powerReturn],
    input: [finishes.input, finishes.inputReturn]
  });
  group.add(supply.group);
  const pickMaterial = new THREE.MeshBasicMaterial({ visible: false });

  function pinPosition(ref, number, z) {
    const component = board.components.find(component => component.ref === ref);
    const pad = component?.pads.find(pad => String(pad.number) === String(number));
    if (!pad) throw new Error(`Cannot locate virtual lead contact ${ref}.${number}`);
    const angle = THREE.MathUtils.degToRad(component.rotation || 0);
    const absolute = pad.absolute || [
      component.x + pad.x * Math.cos(angle) + pad.y * Math.sin(angle),
      component.y - pad.x * Math.sin(angle) + pad.y * Math.cos(angle)
    ];
    return v(...boardPoint(board, ...absolute), z);
  }

  function actionGroup(action, footprints) {
    const node = new THREE.Group();
    node.name = action === 'power' ? 'J5 power lead' : 'J1 and J2 input leads';
    node.userData.action = action;
    node.userData.footprints = footprints;
    group.add(node);
    return node;
  }

  function mesh(parent, shape, finish, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(shape, finish);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }

  function roundedBox(width, depth, height, radius) {
    const shape = new THREE.Shape();
    const x = width / 2;
    const y = depth / 2;
    shape.moveTo(-x + radius, -y);
    shape.lineTo(x - radius, -y);
    shape.quadraticCurveTo(x, -y, x, -y + radius);
    shape.lineTo(x, y - radius);
    shape.quadraticCurveTo(x, y, x - radius, y);
    shape.lineTo(-x + radius, y);
    shape.quadraticCurveTo(-x, y, -x, y - radius);
    shape.lineTo(-x, -y + radius);
    shape.quadraticCurveTo(-x, -y, -x + radius, -y);
    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 4 });
  }

  function zCylinder(radius, height, radiusTop = radius) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radius, height, 16);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }

  function ringGeometry(inner, outer, height) {
    const solid = new THREE.Shape();
    const hole = new THREE.Path();
    solid.absarc(0, 0, outer, 0, TAU, false);
    hole.absarc(0, 0, inner, 0, TAU, true);
    solid.holes.push(hole);
    return new THREE.ExtrudeGeometry(solid, { depth: height, bevelEnabled: false, curveSegments: 16 });
  }

  function cable(parent, start, outgoing, radius, finish, exit) {
    const wire = mesh(parent, new THREE.BufferGeometry(), finish);
    const end = v(0, 0, 0);
    return () => {
      const point = exit(end);
      const approach = parent.userData.action === 'power' ? v(6.2, 2.5, 8.3) : v(1.5, 4.5, 3.8);
      const route = new THREE.CubicBezierCurve3(
        start,
        start.clone().add(outgoing),
        point.clone().add(approach),
        point
      );
      const geometry = new THREE.TubeGeometry(route, 22, radius, 8, false);
      wire.geometry.dispose();
      wire.geometry = geometry;
    };
  }

  const deck = board.thickness / 2;
  const power = actionGroup('power', ['J5']);
  const powerPads = [pinPosition('J5', 1, deck + 8.5), pinPosition('J5', 2, deck + 8.5)];
  const powerSeat = powerPads[0].clone().lerp(powerPads[1], 0.5);
  const padPitch = powerPads[0].distanceTo(powerPads[1]);
  const padDirection = powerPads[1].clone().sub(powerPads[0]);
  const powerPark = powerSeat.clone().add(v(12, 5.5, 5.7));

  const plug = new THREE.Group();
  plug.name = 'J5 two-pin plug';
  Object.assign(plug.userData, { footprints: ['J5'], leadDragAction: 'power', leadDragRef: 'J5' });
  plug.rotation.z = Math.atan2(padDirection.y, padDirection.x) - Math.PI / 2;
  power.add(plug);
  mesh(plug, roundedBox(3.65, padPitch + 3.0, 3.6, 0.45), finishes.shell);
  mesh(plug, roundedBox(3.2, padPitch + 2.45, 0.72, 0.35), finishes.collar, 0, 0, 3.44);
  mesh(plug, new THREE.BoxGeometry(0.42, padPitch + 2.65, 1), finishes.collar, 1.82, 0, 1.29);
  const powerCables = [finishes.power, finishes.powerReturn].map((finish, index) => {
    const y = (index - 0.5) * padPitch;
    mesh(plug, new THREE.BoxGeometry(0.58, 0.58, 2.25), finishes.pin, 0, y, -1.11);
    mesh(plug, zCylinder(0.94, 1.55, 0.68), finish, 0, y, 4.82);
    mesh(plug, zCylinder(0.88, 0.4), finishes.collar, 0, y, 4.25);
    const wirePoint = v(0, y, 5.48).applyEuler(plug.rotation);
    return cable(power, supply.outputs.power[index], v(index * 1.5, -18, 0.7),
      0.61, finish, target => target.copy(plug.position).add(wirePoint));
  });

  const input = actionGroup('input', ['J1', 'J2']);
  const inputLugs = ['J1', 'J2'].map((ref, index) => {
    const seat = pinPosition(ref, 1, deck + 0.045);
    const park = seat.clone().add(v(-2 + index * 1.5, 10.4, 3.2));
    const finish = index === 0 ? finishes.input : finishes.inputReturn;
    const lug = new THREE.Group();
    lug.name = ref + ' ring contact';
    Object.assign(lug.userData, { footprints: [ref], leadDragAction: 'input', leadDragRef: ref });
    input.add(lug);
    mesh(lug, ringGeometry(3.25, 4.65, 0.56), finishes.lug);
    mesh(lug, zCylinder(3.28, 0.6), pickMaterial, 0, 0, 0.32);
    mesh(lug, ringGeometry(4.36, 4.66, 0.15), finishes.pin, 0, 0, 0.54);
    mesh(lug, new THREE.BoxGeometry(3.05, 3.5, 0.64), finishes.lug, 0, 4.87, 0.32);
    mesh(lug, roundedBox(4.08, 4.62, 2.89, 0.65), finish, 0, 6.48, 0.08);
    mesh(lug, roundedBox(3.34, 1.6, 2.4, 0.48), finishes.collar, 0, 8.13, 0.3);
    const updateCable = cable(input, supply.outputs.input[index],
      v(-10 - index * 1.7, -4, 1.7), 0.79, finish,
      target => target.copy(lug.position).add(v(0, 8.8, 1.48).applyEuler(lug.rotation)));
    return { ref, node: lug, seat, park, updateCable };
  });

  const leads = {
    power: {
      group: power, grips: [{ ref: 'J5', node: plug, seat: powerSeat, park: powerPark }],
      reroute: () => powerCables.forEach(updateCable => updateCable()), lift: 12.8, parkTilt: 0
    },
    input: {
      group: input, grips: inputLugs,
      reroute: () => inputLugs.forEach(grip => grip.updateCable()), lift: 12, parkTilt: -0.2
    }
  };

  function gripFor(lead, ref) {
    return ref ? lead?.grips.find(grip => grip.ref === ref) : lead?.grips[0];
  }

  function positionLead(lead, progress) {
    for (const [index, { node, park, seat }] of lead.grips.entries()) {
      node.position.copy(lead.release?.[index] || park).lerp(seat, progress);
      if (!lead.release) node.position.z += lead.lift * progress * (1 - progress);
      node.rotation.x = lead.release ? 0 : lead.parkTilt * (1 - progress);
    }
    if (progress === 1) lead.release = null;
    lead.reroute();
  }

  function updateLead(lead, progress) {
    const amount = THREE.MathUtils.clamp(progress, 0, 1);
    if (amount === lead.progress) return;
    lead.progress = amount;
    lead.group.userData.connected = amount === 1;
    if (!lead.drag) positionLead(lead, amount);
  }

  function update(powerProgress, inputProgress) {
    updateLead(leads.power, powerProgress);
    updateLead(leads.input, inputProgress);
  }

  function beginLeadDrag(action, ref) {
    const lead = leads[action];
    const grip = gripFor(lead, ref);
    if (!grip || lead.progress !== 0 || lead.drag) return false;
    lead.release = null;
    lead.drag = grip;
    return true;
  }

  function moveLeadDrag(action, point) {
    const lead = leads[action];
    if (!lead?.drag) return;
    const offset = point.clone().sub(lead.drag.seat);
    for (const grip of lead.grips) {
      grip.node.position.copy(grip.seat).add(offset);
      grip.node.rotation.x = 0;
    }
    lead.reroute();
  }

  function endLeadDrag(action, connect = false) {
    const lead = leads[action];
    if (!lead?.drag) return;
    lead.drag = null;
    if (connect) {
      lead.release = lead.grips.map(grip => grip.node.position.clone());
    } else {
      lead.release = null;
      positionLead(lead, lead.progress);
    }
  }

  function leadDragAnchor(action, ref) {
    return gripFor(leads[action], ref)?.node.position.clone();
  }

  function leadDragTarget(action, ref) {
    return gripFor(leads[action], ref)?.seat.clone();
  }

  function dispose() {
    group.parent?.remove(group);
    supply.dispose();
    pickMaterial.dispose();
    group.traverse(object => object.geometry?.dispose());
    Object.values(finishes).forEach(finish => finish.dispose());
  }

  update(0, 0);
  return {
    group, update, dispose,
    setSourcePower: supply.setSourcePower,
    beginLeadDrag, moveLeadDrag, endLeadDrag, leadDragAnchor, leadDragTarget
  };
}
