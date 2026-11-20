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
    const sleeve = mesh(parent, new THREE.CylinderGeometry(radius * 1.34, radius * 1.2, 5, 10), finish, ...start.toArray());
    sleeve.quaternion.setFromUnitVectors(v(0, 1, 0), outgoing.clone().normalize());
    const end = v(0, 0, 0);
    return () => {
      const point = exit(end);
      const approach = parent.userData.action === 'power' ? v(5.5, 0, 9) : v(0, 5.2, 4.6);
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
  plug.userData.footprints = ['J5'];
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
    return cable(power, v(62 + 2 * index, 34 + 5 * index, 5.8), v(-10, -2, 0.5),
      0.61, finish, target => target.copy(plug.position).add(wirePoint));
  });

  const input = actionGroup('input', ['J1', 'J2']);
  const inputLugs = ['J1', 'J2'].map((ref, index) => {
    const seat = pinPosition(ref, 1, deck + 0.045);
    const park = seat.clone().add(v(-2 + index * 1.5, 10.4, 3.2));
    const finish = index === 0 ? finishes.input : finishes.inputReturn;
    const lug = new THREE.Group();
    lug.name = ref + ' ring contact';
    lug.userData.footprints = [ref];
    input.add(lug);
    mesh(lug, ringGeometry(3.25, 4.65, 0.56), finishes.lug);
    mesh(lug, ringGeometry(4.36, 4.66, 0.15), finishes.pin, 0, 0, 0.54);
    mesh(lug, new THREE.BoxGeometry(3.05, 3.5, 0.64), finishes.lug, 0, 4.87, 0.32);
    mesh(lug, roundedBox(4.08, 4.62, 2.89, 0.65), finish, 0, 6.48, 0.08);
    mesh(lug, roundedBox(3.34, 1.6, 2.4, 0.48), finishes.collar, 0, 8.13, 0.3);
    const updateCable = cable(input, v(index === 0 ? -62 : -14, 73 + index * 5, 5.8),
      v(index === 0 ? 10 : 6, 0, 0.2), 0.79, finish,
      target => target.copy(lug.position).add(v(0, 8.8, 1.48).applyEuler(lug.rotation)));
    return { lug, seat, park, updateCable };
  });

  let lastPower = NaN;
  let lastInput = NaN;
  function update(powerProgress, inputProgress) {
    const powerAmount = THREE.MathUtils.clamp(powerProgress, 0, 1);
    const inputAmount = THREE.MathUtils.clamp(inputProgress, 0, 1);
    if (powerAmount !== lastPower) {
      plug.position.copy(powerPark).lerp(powerSeat, powerAmount);
      plug.position.z += 12.8 * powerAmount * (1 - powerAmount);
      powerCables.forEach(updateCable => updateCable());
      power.userData.connected = powerAmount === 1;
      lastPower = powerAmount;
    }
    if (inputAmount !== lastInput) {
      for (const { lug, seat, park, updateCable } of inputLugs) {
        lug.position.copy(park).lerp(seat, inputAmount);
        lug.position.z += 12 * inputAmount * (1 - inputAmount);
        lug.rotation.x = -0.2 * (1 - inputAmount);
        updateCable();
      }
      input.userData.connected = inputAmount === 1;
      lastInput = inputAmount;
    }
  }

  function dispose() {
    group.parent?.remove(group);
    group.traverse(object => object.geometry?.dispose());
    Object.values(finishes).forEach(finish => finish.dispose());
  }

  update(0, 0);
  return { group, update, dispose };
}
