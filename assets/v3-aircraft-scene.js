/* The trainer and telemetry retain their source geometry. This factory owns
 * only their presentation transforms and can also render the static posters. */
(() => {
  'use strict';
  const directory = '/assets/models/aircraft/skylabs-trainer/';
  const version = 'aircraft-20261007b';
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
  const ramp = (p, a, b) => smooth((p - a) / (b - a));
  let pending;
  let decoderReady;
  function decoder(source) {
    return decoderReady ||= new Promise((resolve, reject) => {
      if (window.MeshoptDecoder) return resolve();
      const element = document.createElement('script'); element.src = source; element.onload = resolve; element.onerror = reject; document.head.append(element);
    }).then(async () => { if (!window.MeshoptDecoder?.supported) throw new Error('Mesh transport decoder unavailable'); await window.MeshoptDecoder.ready; });
  }
  async function download(source, revision) {
    const compressed = !!window.DecompressionStream && source.compressedModel;
    const response = await fetch(directory + (compressed || source.model) + '?v=' + encodeURIComponent(revision));
    if (!response.ok) throw new Error('Trainer model unavailable');
    let buffer = await response.arrayBuffer();
    if (compressed && new Uint8Array(buffer)[0] === 31) buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return buffer;
  }
  function prefetch() {
    return pending ||= fetch(directory + 'manifest.json?v=' + version).then(async response => {
      if (!response.ok) throw new Error('Trainer manifest unavailable');
      const metadata = await response.json();
      if (window.WebAssembly && metadata.transport?.lossless && metadata.transport.format === 'EXT_meshopt_compression') {
        try {
          const [buffer] = await Promise.all([download(metadata.transport, metadata.asset.sha256), decoder(metadata.transport.decoder)]);
          return { metadata, buffer, packed: true };
        } catch (_) { /* The original GLB remains a complete fallback. */ }
      }
      return { metadata, buffer: await download(metadata, metadata.asset.sha256), packed: false };
    });
  }
  async function load(T) {
    const { metadata, buffer, packed } = await prefetch();
    const parse = (bytes, useDecoder) => new Promise((resolve, reject) => {
      const loader = new T.GLTFLoader(); if (useDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
      loader.parse(bytes, directory, resolve, reject);
    });
    let gltf;
    try { gltf = await parse(buffer, packed); }
    catch (error) { if (!packed) throw error; gltf = await parse(await download(metadata, metadata.asset.sha256), false); }
    if (metadata.units !== 'metres' || metadata.axes.nose !== '+X' || metadata.axes.up !== '+Y') throw new Error('Unexpected trainer coordinates');
    return { group: gltf.scene, metadata };
  }

  // Arc-length lookup for a thin sheet winding into a loose inward spiral.
  // Its initial tangent is straight and every later turn remains separated.
  const curl = [{ length: 0, x: 0, y: 0 }];
  for (let angle = .025; curl[curl.length - 1].length < 12; angle += .025) {
    const radius = Math.exp(-.055 * (angle - Math.sin(angle)));
    const x = radius * Math.sin(angle), y = 1 - radius * Math.cos(angle), last = curl[curl.length - 1];
    curl.push({ length: last.length + Math.hypot(x - last.x, y - last.y), x, y });
  }
  function curlAt(length, output) {
    let left = 0, right = curl.length - 1;
    while (right - left > 1) { const middle = (left + right) >> 1; if (curl[middle].length < length) left = middle; else right = middle; }
    const a = curl[left], b = curl[right], blend = (length - a.length) / (b.length - a.length);
    output[0] = a.x + (b.x - a.x) * blend; output[1] = a.y + (b.y - a.y) * blend;
  }
  // Source wrappers have two end rings. Subdivide only derived film, so the
  // released skin can carry tension, spanwise curvature and a travelling peel.
  // Every added point lies on the same ruled envelope at the assembled pose.
  function orientFilm(T, geometry) {
    const indices = geometry.index, positions = geometry.attributes.position, normals = geometry.attributes.normal;
    if (!indices || !normals) return;
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), normal = new T.Vector3();
    for (let index = 0; index < indices.count; index += 3) {
      a.fromBufferAttribute(positions, indices.getX(index)); b.fromBufferAttribute(positions, indices.getX(index + 1)); c.fromBufferAttribute(positions, indices.getX(index + 2));
      b.sub(a).cross(c.sub(a)); normal.fromBufferAttribute(normals, indices.getX(index));
      const orientation = b.dot(normal);
      if (Math.abs(orientation) < 1e-14) continue;
      if (orientation < 0) for (let triangle = 0; triangle < indices.count; triangle += 3) {
        const second = indices.getX(triangle + 1); indices.setX(triangle + 1, indices.getX(triangle + 2)); indices.setX(triangle + 2, second);
      }
      break;
    }
  }
  function resolveFilm(T, mesh) {
    const source = mesh.geometry, uv = source.attributes.uv;
    const count = mesh.userData.ringVertexCount;
    if (!count || source.attributes.position.count !== count * 2 || !uv) return source.clone();
    const a = new T.Vector3().fromBufferAttribute(source.attributes.position, 0);
    const b = new T.Vector3().fromBufferAttribute(source.attributes.position, count);
    const rows = mesh.userData.filmRegion === 'fuselage' ? 49 : Math.max(7, Math.min(19, Math.ceil(a.distanceTo(b) / .035) + 1));
    const geometry = new T.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const array = new Float32Array(rows * count * attribute.itemSize);
      for (let row = 0; row < rows; row++) for (let vertex = 0; vertex < count; vertex++) for (let axis = 0; axis < attribute.itemSize; axis++) {
        const start = attribute.array[vertex * attribute.itemSize + axis];
        const end = attribute.array[(vertex + count) * attribute.itemSize + axis];
        array[(row * count + vertex) * attribute.itemSize + axis] = start + (end - start) * row / (rows - 1);
      }
      geometry.setAttribute(name, new T.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    const indices = [];
    for (let row = 0; row < rows - 1; row++) for (let vertex = 0; vertex < count - 1; vertex++) {
      const start = row * count + vertex, next = start + count;
      indices.push(next, start + 1, start, next, next + 1, start + 1);
    }
    geometry.setIndex(indices); orientFilm(T, geometry); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
  // Covering film is applied as upper/lower sheets joined at the leading
  // and trailing seams. Opening those authored seams avoids turning a closed
  // aircraft envelope into a giant hoop. Only derived film is split; each
  // assembled vertex still lies exactly on the original surface.
  function filmPanels(T, part) {
    const wrappers = [];
    part.object.traverse(mesh => { if (mesh.isMesh && mesh.userData.filmSurface === 'wrap') wrappers.push(mesh); });
    for (const mesh of wrappers) {
      const resolved = resolveFilm(T, mesh), count = mesh.userData.ringVertexCount;
      if (!count || resolved.attributes.position.count % count) continue;
      const rows = resolved.attributes.position.count / count, positions = resolved.attributes.position;
      let leading = 0;
      for (let index = 1; index < count - 1; index++) if (positions.getX(index) > positions.getX(leading)) leading = index;
      if (leading < 2 || leading > count - 3) { resolved.dispose(); continue; }
      const centres = [new T.Vector3(), new T.Vector3()];
      for (let index = 0; index < count; index++) for (let end = 0; end < 2; end++) centres[end].add(new T.Vector3().fromBufferAttribute(positions, end * (rows - 1) * count + index));
      centres.forEach(centre => centre.divideScalar(count));
      for (let side = 0; side < 2; side++) {
        const columns = side ? Array.from({ length: count - leading }, (_, index) => leading + index) : Array.from({ length: leading + 1 }, (_, index) => leading - index);
        const geometry = new T.BufferGeometry(), columnsCount = columns.length;
        for (const [name, attribute] of Object.entries(resolved.attributes)) {
          const array = new Float32Array(rows * columnsCount * attribute.itemSize);
          for (let row = 0; row < rows; row++) for (let column = 0; column < columnsCount; column++) for (let axis = 0; axis < attribute.itemSize; axis++) {
            array[(row * columnsCount + column) * attribute.itemSize + axis] = attribute.array[(row * count + columns[column]) * attribute.itemSize + axis];
          }
          geometry.setAttribute(name, new T.BufferAttribute(array, attribute.itemSize, attribute.normalized));
        }
        const uv = geometry.attributes.uv;
        for (let row = 0; row < rows; row++) {
          const first = uv.getX(row * columnsCount), last = uv.getX((row + 1) * columnsCount - 1);
          for (let column = 0; column < columnsCount; column++) uv.setX(row * columnsCount + column, (uv.getX(row * columnsCount + column) - first) / (last - first));
        }
        const indices = [];
        for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columnsCount - 1; column++) {
          const a = row * columnsCount + column, b = a + columnsCount;
          if (side) indices.push(b, a + 1, a, b, b + 1, a + 1);
          else indices.push(b, a, a + 1, b, a + 1, b + 1);
        }
        geometry.setIndex(indices); orientFilm(T, geometry); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const panel = new T.Mesh(geometry, mesh.material); panel.name = mesh.name + '-sheet-' + side;
        panel.position.copy(mesh.position); panel.quaternion.copy(mesh.quaternion); panel.scale.copy(mesh.scale);
        panel.userData = { ...mesh.userData, separatedFilmPanel: true, ringVertexCount: columnsCount, ringCount: rows, peelCentres: centres.map(centre => centre.toArray()) };
        if (part.filmRegion === 'fuselage') {
          // The fuselage is long and narrow. Peel its crown/belly ACROSS the
          // short width, not around the metre-long side profile: one broad
          // covering sheet comes away instead of becoming a forward banner.
          const middle = new T.Vector3().fromBufferAttribute(geometry.attributes.position, Math.floor(columnsCount * .5));
          const normal = [0, middle.y >= centres[0].y ? 1 : -1, 0];
          for (let vertex = 0; vertex < uv.count; vertex++) { const u = uv.getX(vertex); uv.setX(vertex, uv.getY(vertex)); uv.setY(vertex, u); }
          panel.userData.shortAxisPeel = true; panel.userData.panelNormal = normal;
          panel.userData.peelAxis = [1, 0, 0]; delete panel.userData.peelCentres;
        }
        mesh.parent.add(panel);
      }
      mesh.parent.remove(mesh); resolved.dispose();
    }
  }
  // The authored end tabs are triangle fans. Re-tessellate their planar
  // profile into narrow chord strips so a bend cannot turn a long fan edge
  // into a dark, folded-over sliver. Boundary points remain on the same cap.
  function resolvedCap(T, mesh) {
    const source = mesh.geometry, positions = source.attributes.position, index = source.index;
    if (!index || mesh.userData.filmRegion === 'fuselage') return source.clone();
    const edges = new Map();
    for (let i = 0; i < index.count; i += 3) for (let side = 0; side < 3; side++) {
      const a = index.getX(i + side), b = index.getX(i + (side + 1) % 3), key = Math.min(a, b) + ':' + Math.max(a, b);
      if (edges.has(key)) edges.get(key).count++; else edges.set(key, { a, b, count: 1 });
    }
    const boundary = [...edges.values()].filter(edge => edge.count === 1), levels = [];
    const bounds = new T.Box3().setFromBufferAttribute(positions);
    boundary.forEach(edge => levels.push(positions.getX(edge.a), positions.getX(edge.b)));
    for (let step = 0; step <= 48; step++) levels.push(bounds.min.x + (bounds.max.x - bounds.min.x) * step / 48);
    levels.sort((a, b) => a - b);
    const xs = levels.filter((value, i) => !i || value - levels[i - 1] > 1e-8);
    const transverse = Math.abs(mesh.userData.peelAxis[1]) > .5 ? 2 : 1;
    const arrays = Object.fromEntries(Object.keys(source.attributes).map(name => [name, []]));
    for (const x of xs) {
      const samples = [];
      for (const edge of boundary) {
        const a = positions.getX(edge.a), b = positions.getX(edge.b);
        if (x < Math.min(a, b) - 1e-8 || x > Math.max(a, b) + 1e-8) continue;
        const blends = Math.abs(a - b) < 1e-9 ? [0, 1] : [clamp((x - a) / (b - a))];
        for (const blend of blends) {
          const sample = {};
          for (const [name, attribute] of Object.entries(source.attributes)) sample[name] = Array.from({ length: attribute.itemSize }, (_, component) => attribute.array[edge.a * attribute.itemSize + component] * (1 - blend) + attribute.array[edge.b * attribute.itemSize + component] * blend);
          samples.push(sample);
        }
      }
      samples.sort((a, b) => a.position[transverse] - b.position[transverse]);
      for (const sample of [samples[0], samples[samples.length - 1]]) for (const name of Object.keys(arrays)) arrays[name].push(...sample[name]);
    }
    const geometry = new T.BufferGeometry();
    for (const [name, array] of Object.entries(arrays)) geometry.setAttribute(name, new T.Float32BufferAttribute(array, source.attributes[name].itemSize));
    const indices = [];
    for (let row = 0; row < xs.length - 1; row++) { const a = row * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geometry.setIndex(indices); orientFilm(T, geometry); return geometry;
  }
  // A finite circular fold followed by its tangent: a tensioned free sheet,
  // rather than a multi-turn spiral. Both regions conserve material length.
  function pulledSheet(length, radius, angle, output, tailRadius = Infinity) {
    const arc = Math.min(length, radius * angle), turn = arc / radius, tail = length - arc;
    const relaxed = angle - tail / tailRadius;
    // One shallow relaxation curve gives the free sheet a soft fall without
    // adding ripples. Arc length and the tangent at the fold remain exact.
    const tailX = Number.isFinite(tailRadius) ? tailRadius * (Math.sin(angle) - Math.sin(relaxed)) : tail * Math.cos(angle);
    const tailY = Number.isFinite(tailRadius) ? tailRadius * (Math.cos(relaxed) - Math.cos(angle)) : tail * Math.sin(angle);
    output[0] = radius * Math.sin(turn) + tailX;
    output[1] = radius * (1 - Math.cos(turn)) + tailY;
  }
  function covering(T, part, detailed) {
    const patches = [];
    if (detailed) filmPanels(T, part);
    const contourPoint = (points, u) => {
      let left = 0, right = points.length - 1;
      while (right - left > 1) { const middle = (left + right) >> 1; if (points[middle].u < u) left = middle; else right = middle; }
      const a = points[left], b = points[right];
      return a.point.clone().lerp(b.point, (u - a.u) / (b.u - a.u));
    };
    part.object.traverse(mesh => {
      const surface = mesh.userData.filmSurface;
      if (!mesh.isMesh || !surface) return;
      const geometry = mesh.userData.separatedFilmPanel ? mesh.geometry : detailed && surface === 'cap' ? resolvedCap(T, mesh) : mesh.geometry.clone(); mesh.geometry = geometry;
      const attribute = geometry.attributes.position, rest = attribute.array.slice(), restNormals = geometry.attributes.normal.array.slice();
      attribute.setUsage(T.DynamicDrawUsage);
      const axis = new T.Vector3(...mesh.userData.peelAxis).normalize();
      const rings = [];
      if (surface === 'wrap') {
        const uv = geometry.attributes.uv, rows = new Map();
        for (let index = 0; index < attribute.count; index++) {
          const key = uv.getY(index).toFixed(6);
          if (!rows.has(key)) rows.set(key, []);
          rows.get(key).push({ index, u: uv.getX(index), point: new T.Vector3().fromArray(rest, index * 3) });
        }
        for (const points of rows.values()) {
          points.sort((a, b) => a.u - b.u);
          let perimeter = 0; const centre = new T.Vector3();
          points.forEach((point, index) => { centre.add(point.point); if (index) perimeter += point.point.distanceTo(points[index - 1].point); });
          const span = points[0] ? geometry.attributes.uv.getY(points[0].index) : 0;
          centre.divideScalar(points.length);
          if (mesh.userData.peelCentres) centre.fromArray(mesh.userData.peelCentres[0]).lerp(new T.Vector3(...mesh.userData.peelCentres[1]), span);
          rings.push({ points, perimeter, span, centre });
        }
      }
      const bounds = new T.Box3().setFromBufferAttribute(attribute), width = bounds.max.x - bounds.min.x;
      const outward = new T.Vector3(...(mesh.userData.outwardNormal || mesh.userData.outward || axis.clone().multiplyScalar(mesh.userData.end === 0 ? -1 : 1).toArray()));
      let previous = -1;
      const patch = { mesh, surface, rest, rings, amount: 0, attached: 0, peeled: 0,
        deform(amount) {
          if (amount === previous) return;
          previous = amount; patch.amount = amount; patch.attached = 0; patch.peeled = 0; attribute.array.set(rest);
          if (amount > 0 && surface === 'wrap') {
            for (const ring of rings) {
              const points = ring.points;
              // A tensioned peel travels diagonally instead of releasing an
              // entire straight edge at once. Delayed rows never move vertices
              // ahead of the nominal peel front; both ends release exactly.
              const lag = detailed ? .055 * Math.sin(Math.PI * amount) * (.15 + .85 * ring.span) : 0;
              const localAmount = Math.max(0, amount - lag);
              const boundary = detailed ? 1 - localAmount : 1 - localAmount * 1.025;
              const front = contourPoint(points, boundary);
              // A short arc window turns the free curl continuously around a
              // polygon corner while leaving every attached vertex untouched.
              const tangent = contourPoint(points, boundary + .018).sub(contourPoint(points, boundary - .018)).normalize();
              const normal = new T.Vector3().crossVectors(axis, tangent).normalize();
              if (mesh.userData.panelNormal) normal.fromArray(mesh.userData.panelNormal);
              else if (normal.dot(front.clone().sub(ring.centre)) < 0) normal.negate();
              const radius = detailed ? Math.max(.004, ring.perimeter * .11) : ring.perimeter / 9;
              // A consistent pulling direction prevents the whole free sheet
              // spinning as the peel front reaches a curved leading edge.
              const side = Math.abs(axis.y) > .5 ? new T.Vector3(0, 0, 1) : new T.Vector3(0, 1, 0);
              if (points[Math.floor(points.length * .5)].point.clone().sub(ring.centre).dot(side) < 0) side.negate();
              const pull = mesh.userData.shortAxisPeel ? new T.Vector3(0, 0, -1).addScaledVector(normal, .44).normalize() : new T.Vector3(1, 0, 0).addScaledVector(side, .44).normalize();
              const pullAngle = Math.max(.2, Math.min(Math.PI * .96, Math.atan2(pull.dot(normal), pull.dot(tangent))));
              const curled = [0, 0], result = new T.Vector3();
              for (const point of points) {
                if (point.u <= boundary) { patch.attached++; continue; }
                if (detailed) pulledSheet((point.u - boundary) * ring.perimeter, radius, pullAngle, curled, ring.perimeter * 3.5);
                else curlAt((point.u - boundary) * ring.perimeter / radius, curled);
                result.copy(front).addScaledVector(tangent, curled[0] * (detailed ? 1 : radius)).addScaledVector(normal, curled[1] * (detailed ? 1 : radius));
                result.toArray(attribute.array, point.index * 3); patch.peeled++;
              }
            }
          } else if (amount > 0 && detailed) {
            // End tabs follow the same localized fold, rather than bending
            // their entire width into another broad crescent.
            const extents = bounds.getSize(new T.Vector3()).toArray(), components = ['x', 'y', 'z'];
            const available = components.filter((component, index) => Math.abs(outward[component]) < .5 && extents[index] > .0001);
            const along = part.filmRegion === 'fuselage' ? available.sort((a, b) => bounds.max[a] - bounds.min[a] - (bounds.max[b] - bounds.min[b]))[0] || 'x' : 'x';
            const capNormal = outward;
            const length = bounds.max[along] - bounds.min[along];
            const front = bounds.min[along] + length * amount, radius = Math.max(.002, length * .11), point = new T.Vector3(), bent = [0, 0];
            for (let index = 0; index < attribute.count; index++) {
              point.fromArray(rest, index * 3);
              if (point[along] >= front) continue;
              pulledSheet(front - point[along], radius, Math.PI - Math.atan(.44), bent, length * 3.5);
              point[along] = front - bent[0]; point.addScaledVector(capNormal, bent[1]);
              point.toArray(attribute.array, index * 3);
            }
          } else if (amount > 0) {
            // Separate end tabs fold away before the long wrapper releases.
            const radius = Math.max(width / 2.4, .01), point = new T.Vector3();
            for (let index = 0; index < attribute.count; index++) {
              point.fromArray(rest, index * 3);
              const distance = point.x - bounds.min.x, angle = distance / radius * amount * 1.25;
              point.x = bounds.min.x + (amount ? Math.sin(angle) * radius / (amount * 1.25) : distance);
              point.addScaledVector(outward, radius * (1 - Math.cos(angle)));
              point.toArray(attribute.array, index * 3);
            }
          }
          attribute.needsUpdate = true;
          if (amount === 0) { geometry.attributes.normal.array.set(restNormals); geometry.attributes.normal.needsUpdate = true; }
          else geometry.computeVertexNormals();
          geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        }
      };
      patches.push(patch);
    });
    return patches;
  }

  function create(T, aircraft, telemetry, { detailed = false } = {}) {
    const metadata = aircraft.metadata;
    const group = new T.Group(); group.name = 'Skylabs flight story';
    const carrier = new T.Group(); carrier.name = 'Aircraft pose'; group.add(carrier); carrier.add(aircraft.group);
    const board = new T.Group(); board.name = 'Telemetry placement'; carrier.add(board);
    const electronics = detailed ? window.V3AircraftElectronics?.create(T) : null;
    if (electronics) carrier.add(electronics.group);
    const mount = new T.Vector3(...(metadata.telemetryMount?.position || [0, .2, 0]));
    const boardUnits = .07303;
    let attachedTelemetry;
    function attachTelemetry(model) {
      if (attachedTelemetry) return;
      const actualUnits = Math.max(model.metadata.boundsMm[2] - model.metadata.boundsMm[0], model.metadata.boundsMm[3] - model.metadata.boundsMm[1]) / 1000;
      if (Math.abs(actualUnits - boardUnits) > .000001) throw new Error('Unexpected telemetry scale');
      model.group.scale.setScalar(actualUnits); board.add(model.group);
      window.V2ProductStudio.applyMaterials(model, 'telemetry', T);
      model.group.traverse(mesh => { if (mesh.isMesh) { mesh.castShadow = mesh.material.name !== 'mat_48' && !mesh.name.includes('Silk'); mesh.receiveShadow = true; } });
      attachedTelemetry = model;
    }
    if (telemetry) attachTelemetry(telemetry);
    board.position.copy(mount);
    group.updateMatrixWorld(true);
    const originals = [...metadata.parts, ...(metadata.derivedParts || [])].map(part => ({ ...part, object: aircraft.group.getObjectByName(part.nodeName) })).filter(part => part.object);
    const fuselage = originals.find(part => part.category === 'fuselage');
    const chosen = originals.filter(part => /^(wing-|horizontal-tail-|vertical-tail|covering|nose-gear$|.*wheel)/.test(part.category) || part.parentId === fuselage?.id);
    // Detach nested covering before its wing, preserving each world transform.
    chosen.sort((a, b) => b.object.getWorldPosition(new T.Vector3()).y - a.object.getWorldPosition(new T.Vector3()).y);
    const selected = new Set(chosen.map(part => part.object));
    const parts = [];
    for (const item of chosen) {
      let ancestor = item.object.parent, covered = false;
      while (ancestor && ancestor !== aircraft.group) { if (selected.has(ancestor) && item.category !== 'covering') covered = true; ancestor = ancestor.parent; }
      if (covered) continue;
      const bounds = new T.Box3().setFromObject(item.object), centre = bounds.getCenter(new T.Vector3());
      carrier.attach(item.object);
      const base = item.object.position.clone(), quaternion = item.object.quaternion.clone(), scale = item.object.scale.clone();
      const role = item.category, ordinal = parts.length;
      const sign = centre.z < -.001 || role.endsWith('-left') ? -1 : centre.z > .001 || role.endsWith('-right') ? 1 : ordinal % 2 ? -1 : 1;
      let offset, start, end;
      if (role === 'covering') { offset = detailed ? new T.Vector3(.12, .48 + ordinal % 3 * .04, (item.filmRegion === 'fuselage' ? 1 : sign) * (item.filmRegion === 'fuselage' ? 1.05 : .85)) : new T.Vector3(centre.x * .08, .20 + ordinal % 3 * .035, sign * .15); start = .045 + ordinal % 5 * .009; end = .31 + ordinal % 3 * .018; }
      else if (role.startsWith('wing-')) { offset = new T.Vector3(.02, sign > 0 ? .28 : .20, sign * .65); start = .36 + (sign < 0 ? .025 : 0); end = .59; }
      else if (role.startsWith('horizontal-tail')) { offset = new T.Vector3(-.30, .18, sign * .35); start = .38; end = .64; }
      else if (role === 'vertical-tail') { offset = new T.Vector3(-.35, .42, .025); start = .39; end = .66; }
      else if (role.includes('gear')) { offset = new T.Vector3(.08, -.14, sign * .17); start = .38; end = .66; }
      else if (role === 'motor' || role === 'propeller') { offset = new T.Vector3(role === 'propeller' ? .62 : .35, .04, 0); start = role === 'propeller' ? .37 : .41; end = .67; }
      else { offset = new T.Vector3(centre.x * .21, .04 + (ordinal % 5) * .024, sign * (.25 + ordinal % 4 * .045)); start = .37 + ordinal % 7 * .01; end = .72; }
      const arc = detailed ? new T.Vector3(sign * .018, role === 'covering' ? .12 : .065, sign * .04) : new T.Vector3();
      const turn = detailed && role === 'covering' ? new T.Vector3(sign * .13, sign * .11, centre.x < -.7 ? -.12 : .06) : new T.Vector3();
      parts.push({ ...item, base, quaternion, scale, offset, start, end, arc, turn });
    }
    const films = parts.filter(part => part.category === 'covering').flatMap(part => {
      const patches = covering(T, part, detailed); part.filmPatches = patches; return patches;
    });
    const materials = new Map(), filmMaterials = new Map(), meshes = [];
    // Reparented groups are now carrier children, so inspect the carrier while
    // excluding the unchanged telemetry subtree.
    carrier.traverse(mesh => {
      if (!mesh.isMesh) return;
      let ancestor = mesh;
      while (ancestor && ancestor !== board) ancestor = ancestor.parent;
      if (ancestor === board) return;
      let electronicsAncestor = mesh;
      while (electronicsAncestor && electronicsAncestor !== electronics?.group) electronicsAncestor = electronicsAncestor.parent;
      if (electronics && electronicsAncestor === electronics.group) { meshes.push({ object: mesh, visible: mesh.visible, electronics: true }); return; }
      mesh.castShadow = true; mesh.receiveShadow = true;
      const materialCache = detailed && mesh.userData.filmSurface ? filmMaterials : materials;
      mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(original => {
        if (!materialCache.has(original)) materialCache.set(original, { material: original.clone(), opacity: original.opacity, transparent: original.transparent, depthWrite: original.depthWrite, film: materialCache === filmMaterials });
        return materialCache.get(original).material;
      });
      if (mesh.material.length === 1) mesh.material = mesh.material[0];
      if (mesh.userData.filmSurface) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
        material.side = T.DoubleSide;
        if (detailed) { material.roughness = .29; material.metalness = .08; }
      });
      meshes.push({ object: mesh, visible: mesh.visible, film: !!mesh.userData.filmSurface });
    });
    const motor = originals.find(part => part.category === 'motor')?.object;
    if (electronics && motor) electronics.bindMotor?.(motor, carrier);
    if (electronics) electronics.bindAirframe?.(parts, carrier);
    const prop = originals.find(part => part.category === 'propeller')?.object;
    const propBase = prop?.quaternion.clone();
    const propPosition = prop?.position.clone();
    const shaft = new T.Vector3(...metadata.contacts.propeller.centre);
    const propAxis = new T.Vector3(...metadata.contacts.propeller.axis);
    const sourceBounds = new T.Box3(new T.Vector3(...metadata.bounds[0]), new T.Vector3(...metadata.bounds[1]));
    const size = sourceBounds.getSize(new T.Vector3());
    const mainContact = new T.Vector3(...metadata.contacts.mainLeft.aircraftLocal);
    const restPitch = metadata.contacts.landingPose.rotationZ;
    const mainSamples = new Map();
    group.updateMatrixWorld(true);
    originals.filter(part => part.category === 'main-wheel').forEach(part => part.object.traverse(mesh => {
      if (!mesh.isMesh) return;
      const vertex = new T.Vector3(), positions = mesh.geometry.attributes.position;
      for (let index = 0; index < positions.count; index++) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
        mainSamples.set(`${vertex.x.toFixed(7)},${vertex.y.toFixed(7)}`, [vertex.x, vertex.y]);
      }
    }));
    const contact = new T.Vector3(), target = new T.Vector3(), cameraPosition = new T.Vector3();
    const rotation = new T.Quaternion(), axisZ = new T.Vector3(0, 0, 1);
    let progress = 0, landing = 1;
    const restore = () => {
      parts.forEach(part => { part.object.position.copy(part.base); part.object.quaternion.copy(part.quaternion); part.object.scale.copy(part.scale); });
      board.position.copy(mount); board.rotation.set(0, 0, 0); board.scale.setScalar(1);
      if (prop && propBase) prop.quaternion.copy(propBase);
    };
    const appearanceEntries = [...materials.values(), ...filmMaterials.values()];
    function fadeAirframe(amount) {
      // Every sheet finishes releasing before departure. Keep the full-size
      // material opaque while it travels clear of the airframe, then fade
      // only near the end of that exit. Reversing restores it exactly.
      const clearance = detailed ? ramp(progress, .52, .60) : 0;
      for (const entry of appearanceEntries) {
        const fade = entry.film ? 1 - (1 - amount) * (1 - clearance) : amount;
        const transparent = entry.transparent || fade > 0;
        if (entry.material.transparent !== transparent) { entry.material.transparent = transparent; entry.material.needsUpdate = true; }
        entry.material.opacity = entry.opacity * (1 - fade);
        entry.material.depthWrite = fade > 0 ? false : entry.depthWrite;
      }
      meshes.forEach(mesh => {
        if (mesh.electronics) return;
        const fade = detailed && mesh.film ? 1 - (1 - amount) * (1 - clearance) : amount;
        mesh.object.visible = mesh.visible && fade < .999;
        mesh.object.castShadow = fade < .15;
      });
    }
    function grounded(pitch) {
      rotation.setFromAxisAngle(axisZ, pitch); contact.copy(mainContact).applyQuaternion(rotation);
      let bottom = contact.y;
      if (mainSamples.size) {
        const sine = Math.sin(pitch), cosine = Math.cos(pitch);
        bottom = Infinity; for (const [x, y] of mainSamples.values()) bottom = Math.min(bottom, x * sine + y * cosine);
      }
      carrier.quaternion.copy(rotation);
      carrier.position.set(0, Math.abs(pitch - restPitch) < 1e-10 ? metadata.contacts.landingPose.translationY : -bottom, 0);
    }
    function setLanding(value) {
      landing = clamp(value); progress = 0; restore(); fadeAirframe(0);
      films.forEach(patch => patch.deform(0)); electronics?.setLanding();
      const flare = ramp(landing, .37, .60), settle = ramp(landing, .65, .86);
      const pitch = .024 + .06 * flare + (restPitch - .084) * settle;
      grounded(pitch);
      const airborne = 1 - ramp(landing, 0, .64);
      carrier.position.y += .82 * airborne;
      const approach = landing / .64;
      carrier.position.x = landing < .64 ? size.x * (-3.5 + (10 * approach - approach * approach) / 3) : -size.x * .5 * Math.pow(1 - (landing - .64) / .36, 3);
      if (prop && propBase && landing < 1) {
        const spin = new T.Quaternion().setFromAxisAngle(propAxis, Math.PI * 96 * (landing - .5 * landing * landing));
        prop.quaternion.copy(propBase).premultiply(spin);
        prop.position.copy(propPosition).sub(shaft).applyQuaternion(spin).add(shaft);
      }
      group.updateMatrixWorld(true);
      return { phase: landing < .43 ? 'approach' : landing < .64 ? 'flare' : landing < .86 ? 'main-contact' : landing < .92 ? 'nose-contact' : landing < 1 ? 'rollout' : 'stopped', landing, progress: 0, separated: 0 };
    }
    function setProgress(value) {
      landing = 1; progress = clamp(value); restore(); grounded(restPitch);
      carrier.position.y += .48 * ramp(progress, detailed ? .045 : .25, detailed ? .22 : .48);
      let separated = 0;
      for (const part of parts) {
        const amount = ramp(progress, part.start, part.end);
        if (part.filmPatches) {
          part.filmPatches.forEach(patch => patch.deform(detailed || patch.surface === 'wrap' ? amount : ramp(progress, part.start - .015, part.start + .12)));
          const release = ramp(progress, part.end, detailed ? .55 : .53);
          part.object.position.copy(part.base).addScaledVector(part.offset, release).addScaledVector(part.arc, Math.sin(Math.PI * release));
          if (detailed) {
            const turn = new T.Quaternion().setFromEuler(new T.Euler(part.turn.x * release, part.turn.y * release, part.turn.z * release));
            part.object.quaternion.copy(part.quaternion).multiply(turn);
          }
        } else part.object.position.copy(part.base).addScaledVector(part.offset, amount).addScaledVector(part.arc, Math.sin(Math.PI * amount));
        if (amount > 0) separated++;
      }
      group.updateMatrixWorld(true); electronics?.setProgress(progress);
      const extraction = ramp(progress, .47, .78);
      board.position.add(new T.Vector3(.035, .27, -.32).multiplyScalar(extraction));
      board.rotation.set(-.08 * extraction, .17 * extraction, .03 * extraction);
      fadeAirframe(ramp(progress, .67, .91));
      group.updateMatrixWorld(true);
      return { phase: progress < .055 ? 'stopped' : progress < .47 ? 'opening' : progress < .80 ? 'extraction' : 'telemetry', progress, landing: 1, separated };
    }
    function frame(camera, width, height) {
      const aspect = width / height, mobile = aspect < .9;
      const focus = ramp(progress, detailed ? .74 : .50, .98);
      const inspection = electronics ? ramp(progress, .49, .61) * (1 - ramp(progress, .75, .89)) : 0;
      const boardPosition = board.getWorldPosition(new T.Vector3());
      let systemBounds;
      if (inspection) {
        systemBounds = electronics.showcaseBounds(new T.Box3());
        const wiringBounds = new T.Box3().setFromObject(electronics.group), revealWiring = ramp(progress, .54, .60);
        systemBounds.min.lerp(wiringBounds.min, revealWiring); systemBounds.max.lerp(wiringBounds.max, revealWiring);
      }
      const tracking = 1 - ramp(landing, .02, .72);
      const aircraftBounds = new T.Box3().setFromObject(group);
      const baseTarget = new T.Vector3(-.08 + carrier.position.x * .88 * tracking, .20 + carrier.position.y * .35 * tracking, 0);
      baseTarget.lerp(aircraftBounds.getCenter(new T.Vector3()), ramp(progress, .04, .30));
      target.copy(baseTarget);
      if (inspection) target.lerp(systemBounds.getCenter(new T.Vector3()), inspection);
      target.lerp(boardPosition, focus);
      const wideDirection = mobile ? new T.Vector3(2.8, 2.1, -4.3) : new T.Vector3(3.6, 1.6, -5.7);
      const closeDirection = new T.Vector3(.08, .155, -.155).normalize();
      if (detailed) {
        const orbit = Math.sin(Math.PI * ramp(progress, .04, .69));
        wideDirection.applyAxisAngle(new T.Vector3(0, 1, 0), -.24 * orbit);
        wideDirection.y += .55 * orbit;
      }
      const direction = wideDirection.normalize().lerp(closeDirection, focus).normalize();
      const groundedDistance = mobile ? 3.0 / Math.max(.48, aspect) : 3.55;
      const wideDistance = groundedDistance * (1 + .6 * tracking);
      const closeDistance = mobile ? .24 / Math.max(.6, aspect) : .24;
      let distance = Math.exp(Math.log(wideDistance) * (1 - focus) + Math.log(closeDistance) * focus);
      const right = new T.Vector3(0, 1, 0).cross(direction).normalize(), up = direction.clone().cross(right).normalize();
      const tangent = Math.tan(16 * Math.PI / 180), sample = new T.Vector3();
      let fitDistance = 0, filmDistance = 0;
      if (inspection) {
        const bounds = systemBounds;
        let systemDistance = 0;
        for (let index = 0; index < 8; index++) {
          sample.set(index & 1 ? bounds.max.x : bounds.min.x, index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z).sub(target);
          systemDistance = Math.max(systemDistance, sample.dot(direction) + Math.abs(sample.dot(right)) / (tangent * aspect * (mobile ? .86 : .59)), sample.dot(direction) + Math.abs(sample.dot(up)) / (tangent * (mobile ? .38 : .64)));
        }
        distance = distance * (1 - inspection) + Math.max(systemDistance * 1.13, mobile ? 1.12 : 1.0) * inspection;
      }
      for (const mesh of meshes) {
        // Keep the departing skin's envelope through the smooth camera
        // handoff. Hiding a sheet must not snap the phone's fitted distance.
        if (!mesh.object.visible && !(detailed && mesh.film && progress < .63)) continue;
        const geometry = mesh.object.geometry; if (!geometry.boundingBox) geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        for (let index = 0; index < 8; index++) {
          sample.set(index & 1 ? bounds.max.x : bounds.min.x, index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z).applyMatrix4(mesh.object.matrixWorld).sub(target);
          // Once unbonded, sheets leave the composition at full size. Do not
          // zoom out to chase them; keep the camera with the revealed airframe.
          if (detailed && mesh.film) sample.multiplyScalar(1 - ramp(progress, .35, .51));
          const needed = Math.max(sample.dot(direction) + Math.abs(sample.dot(right)) / (tangent * aspect * .91), sample.dot(direction) + Math.abs(sample.dot(up)) / (tangent * (mobile ? .70 : .72)));
          if (detailed && mesh.film) filmDistance = Math.max(filmDistance, needed); else fitDistance = Math.max(fitDistance, needed);
        }
      }
      const fitting = 1 - ramp(progress, detailed ? .51 : .55, detailed ? .63 : .75);
      if (detailed) {
        // A conservative smooth maximum retains all required bounds without
        // a zoom-velocity reversal when the departing sheet stops governing.
        const soften = (a, b, width) => (a + b + Math.hypot(a - b, width)) * .5;
        fitDistance = soften(fitDistance, filmDistance, wideDistance * .12);
        distance = soften(distance, fitDistance * fitting, wideDistance * .12 * fitting);
      } else distance = Math.max(distance, fitDistance * fitting);
      cameraPosition.copy(target).addScaledVector(direction, distance);
      camera.position.copy(cameraPosition); camera.up.set(0, 1, 0); camera.lookAt(target);
      camera.fov = 32; camera.aspect = aspect; camera.near = Math.max(.002, Math.min(.1, distance * .04)); camera.far = 80;
      camera.setViewOffset(width, height, (mobile ? 0 : -.10 * focus - .17 * inspection * (1 - focus)) * width, (-.08 * (mobile ? 1 : 1 - focus) - (mobile ? .13 : .015) * inspection * (1 - focus)) * height, width, height);
      camera.updateProjectionMatrix();
      return { target: target.clone(), focus, distance };
    }
    setProgress(0);
    let triangles = 0;
    meshes.forEach(mesh => { const geometry = mesh.object.geometry; triangles += (geometry.index?.count || geometry.attributes.position.count) / 3; });
    return {
      group, carrier, board, parts, films, metadata, electronics,
      setLanding, setProgress, frame, attachTelemetry,
      get telemetryReady() { return !!attachedTelemetry; },
      get statistics() { return { parts: parts.length, sourceOccurrences: metadata.parts.length, triangles, boardUnits, telemetryComponents: attachedTelemetry?.group.userData.componentCount || 0, reconstructed: metadata.completion?.reconstruction?.length || 0, detailedFilm: detailed, filmRows: films.filter(patch => patch.surface === 'wrap').reduce((count, patch) => count + patch.rings.length, 0), illustrativeComponents: electronics?.statistics.components || 0, harnessWires: electronics?.statistics.wires || 0, batteryCells: electronics?.statistics.batteryCells || 0 }; },
      assemblyError() { return parts.reduce((error, part) => Math.max(error, part.object.position.distanceTo(part.base), 1 - Math.abs(part.object.quaternion.dot(part.quaternion))), 0); }
    };
  }
  window.V3AircraftScene = Object.freeze({ prefetch, load, create });
})();
