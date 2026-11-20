export function createBenchSupply(THREE, connectors) {
  const group = new THREE.Group();
  group.name = 'Virtual bench supply';
  group.position.set(34, 74, 0);
  const materials = new Set();
  const finish = (color, roughness = 0.66, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).convertSRGBToLinear(), roughness, metalness,
      envMapIntensity: metalness ? 0.36 : 0.17
    });
    materials.add(material);
    return material;
  };
  const caseFinish = finish('#414a54');
  const frontFinish = finish('#b2b6b1');
  const trim = finish('#252d34');
  const black = finish('#131c21', 0.5);
  const glass = finish('#132626', 0.31);
  const metal = finish('#a4a8a6', 0.36, 0.58);
  const glyph = new THREE.MeshBasicMaterial({ color: '#d4e9df', toneMapped: false });
  const reading = new THREE.MeshBasicMaterial({ color: '#a0f4cf', toneMapped: false });
  materials.add(glyph).add(reading);

  function mesh(parent, geometry, material, x, y, z) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }

  function block(parent, material, x, y, z, width, depth, height) {
    return mesh(parent, new THREE.BoxGeometry(width, depth, height), material, x, y, z);
  }

  function roundedBody(width, depth, height, radius) {
    const left = -width / 2;
    const front = -depth / 2;
    const right = width / 2;
    const back = depth / 2;
    const outline = new THREE.Shape();
    outline.moveTo(left + radius, front);
    outline.lineTo(right - radius, front);
    outline.quadraticCurveTo(right, front, right, front + radius);
    outline.lineTo(right, back - radius);
    outline.quadraticCurveTo(right, back, right - radius, back);
    outline.lineTo(left + radius, back);
    outline.quadraticCurveTo(left, back, left, back - radius);
    outline.lineTo(left, front + radius);
    outline.quadraticCurveTo(left, front, left + radius, front);
    return new THREE.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false, curveSegments: 4 });
  }

  function panel(parent, material, x, y, z, width, height, depth, corner) {
    const shape = roundedBody(width, height, depth, corner);
    shape.rotateX(Math.PI / 2);
    return mesh(parent, shape, material, x, y, z);
  }

  mesh(group, roundedBody(34, 16, 12.8, 1.45), caseFinish, 0, 0, 0.95);
  panel(group, frontFinish, 0, -7.65, 7.25, 32.3, 12.15, 0.65, 1.05);
  panel(group, trim, 0, -8.32, 2.55, 31, 2.65, 0.16, 0.5);
  for (const x of [-12.25, 12.25]) {
    for (const y of [-5.65, 5.65]) block(group, black, x, y, 0.5, 4.2, 3.2, 1.0);
  }
  for (let index = 0; index < 6; index += 1) {
    block(group, trim, 5.5, 2.02 + 0.67 * index, 13.76, 15.5, 0.23, 0.05);
  }
  panel(group, trim, -4.8, -8.29, 9.15, 16.3, 5.65, 0.44, 0.75);
  panel(group, glass, -4.8, -8.75, 9.15, 14.75, 4.5, 0.09, 0.45);

  const display = new THREE.Group();
  display.name = 'Bench supply 5.0 V readout';
  group.add(display);
  const segments = [
    [0, 1.59, 1.65, 0.29], [0.92, 0.8, 0.3, 1.35], [0.92, -0.8, 0.3, 1.35],
    [0, -1.59, 1.65, 0.29], [-0.92, -0.8, 0.3, 1.35], [-0.92, 0.8, 0.3, 1.35],
    [0, 0, 1.65, 0.29]
  ];
  for (const [origin, active] of [[-9.15, [0, 2, 3, 5, 6]], [-4.82, [0, 1, 2, 3, 4, 5]]]) {
    for (const index of active) {
      const [x, z, width, height] = segments[index];
      block(display, reading, origin + x, -8.9, 9.15 + z, width, 0.1, height);
    }
  }
  block(display, reading, -6.66, -8.9, 7.68, 0.45, 0.1, 0.4);
  for (const direction of [-1, 1]) {
    const stroke = block(display, reading, -1.2 + direction * 0.27, -8.9, 8.22, 0.18, 0.1, 1.18);
    stroke.rotation.y = direction * 0.4;
  }

  const switchFrame = new THREE.Group();
  switchFrame.name = 'Bench supply power switch';
  switchFrame.userData.action = 'sourcePower';
  switchFrame.position.set(10.4, -8.25, 9.25);
  group.add(switchFrame);
  const switchTarget = mesh(switchFrame, new THREE.BoxGeometry(7.6, 2.8, 6.8), black, 0, -0.9, 0);
  switchTarget.visible = false;
  panel(switchFrame, trim, 0, 0, 0, 6.1, 5.1, 0.56, 0.74);
  const rocker = new THREE.Group();
  rocker.position.y = -0.52;
  switchFrame.add(rocker);
  panel(rocker, black, 0, 0, 0, 4.7, 3.87, 0.55, 0.54);
  const symbol = new THREE.RingGeometry(0.64, 0.82, 18, 1, Math.PI * 0.74, Math.PI * 1.52);
  symbol.rotateX(Math.PI / 2);
  mesh(rocker, symbol, glyph, 0, -0.57, -0.1);
  block(rocker, glyph, 0, -0.59, 0.53, 0.19, 0.06, 0.72);
  mesh(switchFrame, new THREE.SphereGeometry(0.29, 12, 8), reading, 2.24, -0.62, 1.45).name = 'Supply on lamp';
  const powerLamp = switchFrame.getObjectByName('Supply on lamp');

  function jack(x, insulation) {
    const z = 3.8;
    mesh(group, new THREE.CylinderGeometry(1.56, 1.56, 0.5, 20), metal, x, -8.54, z);
    mesh(group, new THREE.CylinderGeometry(1.31, 1.31, 0.73, 18), trim, x, -8.92, z);
    mesh(group, new THREE.CylinderGeometry(0.94, 1.035, 1.75, 16), insulation, x, -9.62, z);
    const relief = mesh(group, new THREE.CylinderGeometry(0.77, 0.93, 0.96, 16), insulation, x, -10.52, z);
    relief.rotation.x = Math.PI;
    return new THREE.Vector3(x, -10.91, z).add(group.position);
  }

  const outputs = {
    input: [jack(-11.0, connectors.input[0]), jack(-5.25, connectors.input[1])],
    power: [jack(5.15, connectors.power[0]), jack(11.2, connectors.power[1])]
  };

  function setSourcePower(on) {
    display.visible = Boolean(on);
    powerLamp.visible = Boolean(on);
    rocker.rotation.x = on ? -0.14 : 0.14;
  }

  function dispose() {
    group.parent?.remove(group);
    group.traverse(object => object.geometry?.dispose());
    materials.forEach(material => material.dispose());
  }

  setSourcePower(false);
  return { group, outputs, setSourcePower, dispose };
}
