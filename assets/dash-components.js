/* Dimensioned representations of Dash's off-board parts, in millimetres.
 * Local axes: X width, Y height, Z depth; the OLED display faces +Z.
 * These are photo-informed representations, not supplier CAD. Battery size is
 * the user's approximate 25 × 35 × 10 mm measurement. Speaker depth follows
 * the manufacturer's 2831BOX family drawing, with its silver face oriented as
 * photographed; mounting ears are omitted unless includeEars is true. OLED
 * geometry uses the closest four-pin manufacturer's module drawing (the exact
 * GME12864-80 module revision is unverified); depth includes its rear header.
 * PHR-2 body dimensions/pitch follow JST's PH catalog; details are simplified.
 * All default dimensions can be
 * overridden with dimensionsMm: [width,height,depth] or widthMm/heightMm/depthMm.
 * Root assembly placement, wiring and explosion motion belong to the caller.
 */
(() => {
  'use strict';
  if (window.DashComponents) return;
  const defaults = Object.freeze({
    battery: Object.freeze([25, 35, 10]),
    oled: Object.freeze([35.5, 33.6, 10.5]),
    speaker: Object.freeze([31, 28, 15.2]),
    plug: Object.freeze([5.8, 6.85, 4.5])
  });

  function create(T, kind, config = {}) {
    if (!defaults[kind]) throw new Error('Unknown Dash component: ' + kind);
    const dims = defaults[kind].map((fallback, index) => {
      const value = config[['widthMm', 'heightMm', 'depthMm'][index]] ?? config.dimensionsMm?.[index] ?? fallback;
      if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid Dash component dimension');
      return value;
    });
    const [w, h, d] = dims, group = new T.Group();
    group.name = config.name || {battery:'Battery', oled:'OLED module', speaker:'Speaker', plug:'Battery plug'}[kind];
    Object.assign(group.userData, {
      partRef: group.name, mechanicalRole: kind, dimensionsMm: dims.slice(),
      representation: 'Dimensioned representation; fine detail approximated from assembly photographs',
      dimensionsApproximate: config.dimensionsApproximate !== false
    });
    const materials = new Map();
    function material(name, colour, roughness = .55, metalness = 0, extra = {}) {
      if (!materials.has(name)) materials.set(name, new T.MeshStandardMaterial({
        name: 'Dash ' + name, color: new T.Color(colour).convertSRGBToLinear(),
        roughness, metalness, envMapIntensity: metalness > .2 ? .55 : .2, ...extra
      }));
      return materials.get(name);
    }
    function mesh(name, geometry, mat, x = 0, y = 0, z = 0) {
      const object = new T.Mesh(geometry, mat);
      object.name = name; object.position.set(x, y, z);
      object.castShadow = object.receiveShadow = true;
      Object.assign(object.userData, { partRef: group.name, componentDetail: name });
      group.add(object); return object;
    }
    function box(name, size, position, mat) { return mesh(name, new T.BoxGeometry(...size), mat, ...position); }
    function roundedShape(width, height, radius) {
      const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2), shape = new T.Shape();
      shape.moveTo(x + r, y); shape.lineTo(x + width - r, y);
      shape.quadraticCurveTo(x + width, y, x + width, y + r); shape.lineTo(x + width, y + height - r);
      shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height); shape.lineTo(x + r, y + height);
      shape.quadraticCurveTo(x, y + height, x, y + height - r); shape.lineTo(x, y + r);
      shape.quadraticCurveTo(x, y, x + r, y); return shape;
    }
    function extruded(shape, depth, curveSegments = 5) {
      const geometry = new T.ExtrudeGeometry(shape, {depth, bevelEnabled:false, curveSegments, steps:1});
      geometry.translate(0, 0, -depth / 2); return geometry;
    }
    function rounded(name, size, position, mat, radius = 1) {
      return mesh(name, extruded(roundedShape(size[0], size[1], radius), size[2]), mat, ...position);
    }
    // Cylinder axis is Z so component faces and all planar rings use XY.
    function disc(name, radius, depth, z, mat, y = 0) {
      const geometry = new T.CylinderGeometry(radius, radius, depth, 40);
      geometry.rotateX(Math.PI / 2); return mesh(name, geometry, mat, 0, y, z);
    }
    function ring(name, inside, outside, position, mat) {
      return mesh(name, new T.RingGeometry(inside, outside, 40), mat, ...position);
    }
    function revolved(name, profile, mat) {
      const geometry = new T.LatheGeometry(profile.slice().reverse().map(point => new T.Vector2(...point)), 56);
      geometry.rotateX(Math.PI / 2); return mesh(name, geometry, mat);
    }
    function rectangleHole(shape, width, height, radius, x = 0, y = 0) {
      const points = roundedShape(width, height, radius).getPoints(5).reverse();
      const hole = new T.Path(points.map(point => new T.Vector2(point.x + x, point.y + y)));
      hole.closePath(); shape.holes.push(hole); return shape;
    }
    // Foil faces meet a thin sealed edge instead of the vertical walls of a box.
    function pouchGeometry(width, height, depth, minV = -1, maxV = 1, offset = 0) {
      const nx = 24, ny = Math.max(5, Math.round(30 * (maxV - minV) / 2));
      const positions = [], indices = [], faceVertices = (nx + 1) * (ny + 1);
      for (let side = 0; side < 2; side += 1) {
        const sign = side ? -1 : 1, start = side * faceVertices;
        for (let j = 0; j <= ny; j += 1) for (let i = 0; i <= nx; i += 1) {
          const u = i / nx * 2 - 1, v = minV + (maxV - minV) * j / ny;
          const fullness = Math.sqrt(Math.max(0, (1 - Math.pow(u, 10)) * (1 - Math.pow(v, 10))));
          positions.push(u * width / 2, v * height / 2, sign * (.18 + (depth / 2 - .18) * fullness + offset));
        }
        for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
          const a = start + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, q = c + 1;
          if (side) indices.push(a, q, b, a, c, q); else indices.push(a, b, q, a, q, c);
        }
      }
      const edge = [];
      for (let i = 0; i <= nx; i += 1) edge.push(i);
      for (let j = 1; j <= ny; j += 1) edge.push(j * (nx + 1) + nx);
      for (let i = nx - 1; i >= 0; i -= 1) edge.push(ny * (nx + 1) + i);
      for (let j = ny - 1; j > 0; j -= 1) edge.push(j * (nx + 1));
      for (let i = 0; i < edge.length; i += 1) {
        const a = edge[i], b = edge[(i + 1) % edge.length];
        indices.push(a, b + faceVertices, b, a, a + faceVertices, b + faceVertices);
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
    }

    if (kind === 'battery') {
      const foil = material('pouch foil', 0xc7cace, .31, .8);
      const folds = material('crimped foil seam', 0xaeb2b5, .46, .73);
      const tape = material('Kapton end tape', 0xe2af17, .32, .06);
      const bw = w - 1, bh = h - 1, band = Math.min(4.2, h * .13);
      mesh('Pillowed silver foil pouch', pouchGeometry(bw, bh, d - .06), foil);
      const seam = rectangleHole(roundedShape(w, h, .9), bw - .35, bh - .35, .6);
      mesh('Thin perimeter heat seal', extruded(seam, .24), folds);
      // Kapton follows the curved foil and the thin terminal-end seal.
      mesh('Wrapped yellow cell-end tape', pouchGeometry(bw + .04, bh, d - .06, 1 - 2 * band / bh, 1, .025), tape);
      rounded('Kapton over terminal seal', [w, .65, .36], [0, h / 2 - .325, 0], tape, .15);
      const crimpPoints = [];
      for (let x = -w / 2 + 1; x < w / 2 - .5; x += 1.3) {
        crimpPoints.push(new T.Vector3(x, -h / 2 + .12, .13), new T.Vector3(x + .25, -h / 2 + .48, .13));
      }
      const crimp = new T.LineSegments(new T.BufferGeometry().setFromPoints(crimpPoints), new T.LineBasicMaterial({color:0x8f9498}));
      crimp.name = 'Fine crimp ridges'; crimp.userData.partRef = group.name; group.add(crimp);
      group.userData.leadExitMm = [[-2, h / 2, 0], [2, h / 2, 0]];
    }

    if (kind === 'oled') {
      const pcbDepth = config.pcbThicknessMm ?? 1.2;
      const pcbZ = d / 2 - 1.4 - pcbDepth / 2, glassZ = d / 2 - .7;
      const blue = material('OLED blue PCB', 0x0c4d83, .68, .03);
      const gold = material('OLED connector pads', 0xc9aa56, .34, .72, {side:T.DoubleSide});
      const plastic = material('Header insulation', 0x1d2024, .7);
      const metal = material('Header contacts', 0xb9b8ac, .35, .75);
      // The sibling manufacturer's module drawing has a bottom-centre notch;
      // its unlabelled size is an approximation from that drawing's scale.
      const notchWidth = config.notchWidthMm ?? Math.min(14, w * .4);
      const notchHeight = config.notchHeightMm ?? 4, radius = .8;
      const shape = new T.Shape(), holes = [];
      shape.moveTo(-w / 2 + radius, -h / 2);
      shape.lineTo(-notchWidth / 2, -h / 2); shape.lineTo(-notchWidth / 2, -h / 2 + notchHeight);
      shape.lineTo(notchWidth / 2, -h / 2 + notchHeight); shape.lineTo(notchWidth / 2, -h / 2);
      shape.lineTo(w / 2 - radius, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + radius);
      shape.lineTo(w / 2, h / 2 - radius); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - radius, h / 2);
      shape.lineTo(-w / 2 + radius, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - radius);
      shape.lineTo(-w / 2, -h / 2 + radius); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + radius, -h / 2);
      for (const x of [-w / 2 + 2.5, w / 2 - 2.5]) for (const y of [-h / 2 + 2.5, h / 2 - 2.5]) {
        const hole = new T.Path(); hole.absarc(x, y, 1.55, 0, Math.PI * 2, true); shape.holes.push(hole); holes.push([x, y]);
      }
      mesh('Notched OLED circuit board', extruded(shape, pcbDepth, 16), [blue, material('OLED FR4 edge', 0x8c8871, .85)], 0, 0, pcbZ);
      for (const [x, y] of holes) for (const sign of [-1, 1]) ring('Plated mounting hole', 1.55, 2, [x, y, pcbZ + sign * (pcbDepth / 2 + .015)], gold);
      const glassWidth = config.glassWidthMm ?? Math.min(34.5, w - 1);
      const glassHeight = config.glassHeightMm ?? Math.min(23, h - 8);
      // Header faces +Y (top). Glass top is 6.1 mm below the PCB top; the
      // exact bare-panel drawing locates the active area 2.05 mm above glass centre.
      const screenY = config.glassOffsetYmm ?? h / 2 - 6.1 - glassHeight / 2;
      const activeY = screenY + (config.activeOffsetYmm ?? 2.05);
      const glass = material('OLED glass', 0x10181d, .19, .08);
      rounded('Display glass', [glassWidth, glassHeight, 1.4], [0, screenY, glassZ], glass, .2);
      const activeWidth = config.activeWidthMm ?? Math.min(29.42, glassWidth - 2);
      const activeHeight = config.activeHeightMm ?? Math.min(14.7, glassHeight - 2);
      // Inactive display: no invented firmware imagery or emitted light.
      box('Inactive OLED viewing area', [activeWidth, activeHeight, .015], [0, activeY, d / 2 - .005], material('Inactive display', 0x0a151c, .23, .05));
      const headerY = h / 2 - 4, headerZ = pcbZ - pcbDepth / 2 - 1.25;
      box('Four-pin header body', [10.16, 2.5, 2.5], [0, headerY, headerZ], plastic);
      const contactPoints = [];
      for (let index = 0; index < 4; index += 1) {
        const x = (index - 1.5) * 2.54;
        box('Display contact ' + (index + 1), [.55, .55, Math.max(.5, pcbZ - (-d / 2))], [x, headerY, (pcbZ - d / 2) / 2], metal);
        ring('Display solder pad ' + (index + 1), .35, .9, [x, headerY, pcbZ + pcbDepth / 2 + .02], gold);
        contactPoints.push([x, headerY, -d / 2]);
      }
      const flex = material('Display flex', 0x6e3d13, .49, .14);
      box('Display flex tail', [glassWidth * .72, 1.4, .2], [0, screenY - glassHeight / 2 - .35, pcbZ + pcbDepth / 2 + .2], flex);
      const chip = material('Rear controller packages', 0x24262a, .72);
      box('Rear display controller', [8, 4, .7], [0, -1.4, pcbZ - pcbDepth / 2 - .35], chip);
      for (let i = 0; i < 3; i += 1) box('Rear passive component ' + (i + 1), [1.6, .8, .6], [-7 + i * 3.1, -6, pcbZ - pcbDepth / 2 - .3], chip);
      group.userData.screenCentreMm = [0, activeY, d / 2];
      group.userData.activeCenterMm = group.userData.screenCentreMm.slice();
      group.userData.connectorCentreMm = [0, headerY, -d / 2];
      group.userData.headerContactPointsMm = contactPoints;
      group.userData.headerDirection = '+Y';
      group.userData.glassCentreMm = [0, screenY, glassZ];
      group.userData.glassFrontMm = d / 2;
    }

    if (kind === 'speaker') {
      const frame = material('Speaker enclosure', 0x1a1b1d, .69);
      const rim = material('Speaker frame edge', 0x303136, .55);
      const diaphragm = material('Speaker dark surround', 0x242528, .54, .04);
      const silver = material('Speaker silver face', 0xbfc3c5, .3, .78);
      const radius = Math.min(w, h) * .438, frontZ = d / 2;
      const casing = roundedShape(w, h, 1.2), aperture = new T.Path();
      aperture.absarc(0, 0, radius, 0, Math.PI * 2, true); casing.holes.push(aperture);
      mesh('Open rectangular speaker frame', extruded(casing, d, 28), frame);
      rounded('Rear chamber closure', [w - 1.2, h - 1.2, .7], [0, 0, -d / 2 + .35], frame, .8);
      // Separate rolled lip, compliant surround and shallow metal diaphragm.
      // The face sits inside a real circular opening, not on a solid block.
      revolved('Rolled silver frame lip', [
        [radius * .91, frontZ - .65], [radius * .94, frontZ - .24],
        [radius * .975, frontZ - .14], [radius, frontZ - .35]
      ], silver);
      revolved('Recessed dark speaker surround', [
        [radius * .7, frontZ - 1.12], [radius * .755, frontZ - .76],
        [radius * .82, frontZ - .53], [radius * .88, frontZ - .75], [radius * .925, frontZ - .65]
      ], diaphragm);
      revolved('Recessed silver diaphragm', [
        [0, frontZ - 1.5], [radius * .45, frontZ - 1.5], [radius * .63, frontZ - 1.4],
        [radius * .69, frontZ - 1.14], [radius * .71, frontZ - 1.12]
      ], silver);
      group.userData.diaphragmRecessMm = 1.5;
      if (config.includeEars) {
        const holeSpacing = config.earHoleSpacingMm ?? 37;
        const extent = config.earOverallHeightMm ?? 43.8;
        for (const sign of [-1, 1]) {
          const ear = new T.Shape(); ear.moveTo(-6, sign * (h / 2 - .5));
          ear.lineTo(-2.3, sign * (extent / 2 - 1.2));
          ear.quadraticCurveTo(0, sign * (extent / 2 + 1.2), 2.3, sign * (extent / 2 - 1.2));
          ear.lineTo(6, sign * (h / 2 - .5)); ear.closePath();
          const hole = new T.Path(); hole.absarc(0, sign * holeSpacing / 2, 1.15, 0, Math.PI * 2, true); ear.holes.push(hole);
          mesh('Optional speaker mounting ear ' + sign, extruded(ear, 1.4), frame);
        }
        group.userData.overallHeightMm = extent;
      }
      const terminals = material('Speaker solder terminals', 0xbfa372, .35, .72);
      for (const x of [-3, 3]) box('Speaker terminal', [2.1, 1.25, .25], [x, -h / 2 + 2, -d / 2 + .125], terminals);
      group.userData.frontFace = '+Z silver circular face, oriented to match assembly photograph';
      group.userData.leadExitMm = [[-3, -h / 2 + 2, -d / 2], [3, -h / 2 + 2, -d / 2]];
    }

    if (kind === 'plug') {
      const ivory = material('PHR housing ivory', 0xeee9d6, .62);
      const contact = material('PHR crimp contacts', 0xb9b5a8, .4, .6);
      const pitch = config.contactPitchMm ?? 2;
      function socketHousing(name, width, depth, height, y) {
        const shape = roundedShape(width, depth, .12);
        for (const x of [-pitch / 2, pitch / 2]) rectangleHole(shape, 1.5, 2.6, .12, x, 0);
        const geometry = extruded(shape, height); geometry.rotateX(-Math.PI / 2);
        return mesh(name, geometry, ivory, 0, y, 0);
      }
      // The mating openings face +Y and remain open through the shell. This
      // axis matches the PH header; the two wires leave the opposite (-Y) end.
      socketHousing('Open two-circuit housing', w - .45, d - .4, h - .5, -.25);
      socketHousing('Mating-end retaining flange', w, d, .5, h / 2 - .25);
      const latchZ = d / 2 - .15;
      for (const x of [-w / 2 + .45, w / 2 - .45]) {
        box('Side polarising rib', [.45, h * .56, .45], [x, .1, latchZ - .15], ivory);
      }
      // Cantilever latch and a recessed gap below it, instead of a painted notch.
      box('Latch root', [1.8, .6, .5], [0, -h / 2 + .65, latchZ - .1], ivory);
      box('Flexible latch arm', [1.8, 2.75, .25], [0, -h / 2 + 2.0, latchZ], ivory);
      box('Latch locking ledge', [1.8, .45, .48], [0, -h / 2 + 3.15, latchZ - .1], ivory);
      for (const x of [-pitch / 2, pitch / 2]) {
        // Three thin walls form each recessed female contact, leaving its mouth open.
        const contactY = h / 2 - 1.6;
        box('Socket contact base', [.9, 1.6, .12], [x, contactY, -.72], contact);
        for (const sign of [-1, 1]) box('Socket spring contact', [.12, 1.6, 1.0], [x + sign * .45, contactY, -.18], contact);
        box('Crimp spine', [.42, h - 2.2, .13], [x, -1, -.72], contact);
      }
      group.userData.wireExitMm = [[-1, -h / 2, 0], [1, -h / 2, 0]];
      group.userData.matingDirection = '+Y';
    }
    return group;
  }
  window.DashComponents = Object.freeze({create, defaults});
})();
