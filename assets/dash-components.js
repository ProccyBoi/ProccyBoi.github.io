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
    oled: Object.freeze([35.5, 33.5, 10.5]),
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
    function extruded(shape, depth) {
      const geometry = new T.ExtrudeGeometry(shape, {depth, bevelEnabled:false, curveSegments:5, steps:1});
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

    if (kind === 'battery') {
      const foil = material('pouch foil', 0xc7cace, .36, .72);
      const folds = material('folded foil', 0xa5a9ae, .44, .64);
      const tape = material('Kapton end tape', 0xdba80f, .3, .08);
      rounded('Silver pouch', [w - .7, h - 1.2, d - .4], [0, -.15, 0], foil, 1.7);
      // Narrow folded seams and slightly raised perimeter follow the supplied cell photo.
      for (const sign of [-1, 1]) {
        rounded('Folded side seam ' + sign, [.65, h - 2, d - 1.4], [sign * (w / 2 - .325), -.3, 0], folds, .22);
        rounded('Pouch face ' + sign, [w - 2.1, h - 3.5, .16], [0, -.65, sign * (d / 2 - .12)], foil, 1.8);
      }
      rounded('Bottom heat seal', [w - .5, .85, d - 1.1], [0, -h / 2 + .425, 0], folds, .2);
      const band = Math.min(4.2, h * .13);
      rounded('Yellow insulated cell end', [w, band, d], [0, h / 2 - band / 2, 0], tape, .35);
      const tapeFold = material('Kapton folds', 0xbd8d09, .44, .03);
      for (const x of [-w * .32, w * .32]) box('Tape fold', [.45, band * .86, .06], [x, h / 2 - band / 2, d / 2 - .025], tapeFold);
      group.userData.leadExitMm = [[-2, h / 2, 0], [2, h / 2, 0]];
    }

    if (kind === 'oled') {
      const pcbDepth = config.pcbThicknessMm ?? 1.2;
      const pcbZ = d / 2 - 2.3, glassZ = d / 2 - .7;
      const blue = material('OLED blue PCB', 0x0c4d83, .68, .03);
      const gold = material('OLED connector pads', 0xc9aa56, .34, .72, {side:T.DoubleSide});
      const plastic = material('Header insulation', 0x1d2024, .7);
      const metal = material('Header contacts', 0xb9b8ac, .35, .75);
      const shape = roundedShape(w, h, 1.4), holes = [];
      for (const x of [-w / 2 + 2.5, w / 2 - 2.5]) for (const y of [-h / 2 + 2.5, h / 2 - 2.5]) {
        const hole = new T.Path(); hole.absarc(x, y, 1.55, 0, Math.PI * 2, true); shape.holes.push(hole); holes.push([x, y]);
      }
      mesh('OLED circuit board', extruded(shape, pcbDepth), blue, 0, 0, pcbZ);
      for (const [x, y] of holes) for (const sign of [-1, 1]) ring('Plated mounting hole', 1.55, 2, [x, y, pcbZ + sign * (pcbDepth / 2 + .015)], gold);
      const glassWidth = config.glassWidthMm ?? Math.min(34.5, w - 1);
      const glassHeight = config.glassHeightMm ?? Math.min(23, h - 8);
      const screenY = config.glassOffsetYmm ?? 2.5;
      const glass = material('OLED glass', 0x10181d, .19, .08);
      rounded('Display glass', [glassWidth, glassHeight, 1.4], [0, screenY, glassZ], glass, .2);
      const activeWidth = config.activeWidthMm ?? Math.min(29.42, glassWidth - 2);
      const activeHeight = config.activeHeightMm ?? Math.min(14.7, glassHeight - 2);
      // Inactive display: no invented firmware imagery or emitted light.
      box('Inactive OLED viewing area', [activeWidth, activeHeight, .015], [0, screenY + .5, d / 2 - .005], material('Inactive display', 0x0a151c, .23, .05));
      const headerY = -h / 2 + 4, headerZ = pcbZ - pcbDepth / 2 - 1.25;
      box('Four-pin header body', [10.16, 2.5, 2.5], [0, headerY, headerZ], plastic);
      for (let index = 0; index < 4; index += 1) {
        const x = (index - 1.5) * 2.54;
        box('Display contact ' + (index + 1), [.55, .55, Math.max(.5, pcbZ - (-d / 2))], [x, headerY, (pcbZ - d / 2) / 2], metal);
        ring('Display solder pad ' + (index + 1), .35, .9, [x, headerY, pcbZ + pcbDepth / 2 + .02], gold);
      }
      const flex = material('Display flex', 0x6e3d13, .49, .14);
      box('Display flex tail', [glassWidth * .72, 1.4, .2], [0, screenY - glassHeight / 2 - .35, pcbZ + pcbDepth / 2 + .2], flex);
      const chip = material('Rear controller packages', 0x24262a, .72);
      box('Rear display controller', [8, 4, .7], [0, -1.4, pcbZ - pcbDepth / 2 - .35], chip);
      for (let i = 0; i < 3; i += 1) box('Rear passive component ' + (i + 1), [1.6, .8, .6], [-7 + i * 3.1, -6, pcbZ - pcbDepth / 2 - .3], chip);
      group.userData.screenCentreMm = [0, screenY + .5, d / 2];
      group.userData.activeCenterMm = group.userData.screenCentreMm.slice();
      group.userData.connectorCentreMm = [0, headerY, -d / 2];
    }

    if (kind === 'speaker') {
      const frame = material('Speaker enclosure', 0x1a1b1d, .69);
      const rim = material('Speaker frame edge', 0x303136, .55);
      const diaphragm = material('Speaker dark surround', 0x242528, .54, .04);
      const silver = material('Speaker silver face', 0xbfc3c5, .3, .78);
      rounded('Rectangular speaker body', [w, h, d - .4], [0, 0, 0], frame, 1.4);
      const radius = Math.min(w * .405, h * .37), frontZ = d / 2;
      disc('Circular face', radius, .28, frontZ - .14, diaphragm);
      ring('Silver outer lip', radius * .91, radius, [0, 0, frontZ + .005], silver);
      ring('Dark concentric surround', radius * .69, radius * .87, [0, 0, frontZ + .01], rim);
      disc('Silver circular centre', radius * .685, .3, frontZ - .14, silver);
      rounded('Back panel seam', [w - .8, h - .8, .2], [0, 0, -d / 2 + .1], rim, 1);
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
      const recess = material('PHR contact recess', 0x55534a, .84);
      const contact = material('PHR crimp contacts', 0xb9b5a8, .4, .6);
      rounded('Two-way PHR housing', [w, h, d], [0, 0, 0], ivory, .25);
      // Recesses describe the two-pole mating end; the body stays neutral ivory.
      for (const x of [-1, 1]) {
        box('Contact socket', [1.2, 1.5, .04], [x, h / 2 - 1.1, d / 2 + .015], recess);
        box('Recessed crimp contact', [.45, .7, .06], [x, h / 2 - 1.1, d / 2 + .025], contact);
        box('Wire-entry recess', [1.1, .06, 1.1], [x, -h / 2 - .015, 0], recess);
      }
      box('Housing key rib', [w * .62, .45, .5], [0, .8, d / 2 - .2], ivory);
      group.userData.wireExitMm = [[-1, -h / 2, 0], [1, -h / 2, 0]];
    }
    return group;
  }
  window.DashComponents = Object.freeze({create, defaults});
})();
