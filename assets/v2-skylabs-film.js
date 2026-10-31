/* Solarfilm peel kernel reused unchanged from the accepted Projects hero. */
(()=>{
const clamp=n=>Math.max(0,Math.min(1,n));
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


window.V2SkylabsFilm={covering};
})();
