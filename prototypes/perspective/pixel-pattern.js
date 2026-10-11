/* Isolated study: static, illustrative LED test pattern, never vehicle data.
 * Uses the EXISTING mat_3 window faces of all 116 WS2812C-2020-V1 pixels.
 * No invented packages, screen-space points, coordinates, or animation.
 * Load /assets/tramtrace-board-data.js first; create after applyMaterials().
 */
(() => {
  'use strict';
  const active = new WeakMap();
  const order = ['l1', 'l2', 'l3', 'l4', 'status'];
  // Verified against all 116 named nodes in tramtrace-kicad-source.glb:
  // CAD millimetres = data page millimetres + [34.4353, 53.655].
  // v2-assembly-models.js subtracts CAD [144.055, 102.065], then /207.81.
  // The page rectangle alone differs by 0.025 mm: do not fit to its centre.
  const units = 207.81, datum = [109.6197, 48.41];
  const source = Object.freeze({
    label: 'Illustrative LED test pattern · 116 source-positioned pixels',
    data: '/assets/tramtrace-board-data.js',
    geometry: '/assets/models/tramtrace/tramtrace-kicad-source.glb',
    nativeSurface: 'WS2812C-2020-V1 window · mat_3',
    registration: 'x=(pageX−109.6197)/207.81; z=(pageY−48.41)/207.81',
    live: false
  });

  function create(T, model, options = {}) {
    if (!T?.BufferGeometry || !model?.group) throw new Error('Pixel pattern requires THREE and a loaded TramTrace model');
    if (active.has(model.group)) return active.get(model.group);
    const data = options.data || window.tramTraceBoardData;
    if (!data?.chains || data.pixelCount !== 116 || model.group.userData.boardUnitsMm !== units) {
      throw new Error('Pixel pattern requires the original TramTrace board data and hero units');
    }
    const intensity = options.intensity ?? 1;
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 4) throw new Error('Pixel intensity must be between 0 and 4');
    const byRef = new Map(), records = [], windows = new Map();
    const bases = new Map((model.parts || []).map(part => [part.object, part.base]));
    const boardToLocal = (x, z, heightMm = 0) => new T.Vector3((x - datum[0]) / units, heightMm / units, (z - datum[1]) / units);
    for (const key of order) {
      const chain = data.chains[key];
      if (!chain?.leds?.length) throw new Error('Missing original TramTrace chain: ' + key);
      for (const [ref, x, z] of chain.leds) {
        if (byRef.has(ref)) throw new Error('Duplicate source pixel: ' + ref);
        byRef.set(ref, {ref, key, expected: boardToLocal(x, z), bounds: new T.Box3(), triangles: 0});
      }
    }
    if (byRef.size !== 116) throw new Error('Original TramTrace data must contain 116 unique pixel refs');
    let disposed = false, visible = false, selection = 'all';
    const checkLine = key => { if (key !== 'all' && !order.includes(key)) throw new Error('Unknown TramTrace line: ' + key); };
    const cleanup = () => records.forEach(record => {
      record.mesh.geometry = record.originalGeometry; record.mesh.material = record.originalMaterial;
      record.geometry.dispose(); record.materials.forEach(material => material.dispose());
    });
    try {
      for (const bank of model.group.children.filter(node => /^LED bank /.test(node.name))) {
        const refs = bank.userData.componentRefs || [], base = bases.get(bank);
        if (!base || refs.some(ref => !byRef.has(ref))) throw new Error('Unregistered TramTrace LED bank');
        const candidates = refs.map(ref => byRef.get(ref));
        const mesh = bank.children.find(node => node.isMesh && !Array.isArray(node.material) && node.material.name === 'mat_3');
        if (!mesh) throw new Error('Original LED window geometry is missing from ' + bank.name);
        mesh.updateMatrix();
        const geometry = mesh.geometry, position = geometry.getAttribute('position');
        const mapped = [], point = new T.Vector3(), limit = Math.pow(.9 / units, 2);
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix).add(base);
          let match = null, best = Infinity;
          for (const candidate of candidates) {
            const distance = Math.pow(point.x - candidate.expected.x, 2) + Math.pow(point.z - candidate.expected.z, 2);
            if (distance < best) { best = distance; match = candidate; }
          }
          if (!match || best > limit) throw new Error('Native LED window does not match the source data');
          match.bounds.expandByPoint(point); mapped.push(match);
        }
        const buckets = order.map(() => []), index = geometry.index;
        const count = index ? index.count : position.count;
        for (let i = 0; i < count; i += 3) {
          const triangle = [0, 1, 2].map(offset => index ? index.getX(i + offset) : i + offset);
          const match = mapped[triangle[0]];
          if (triangle.some(vertex => mapped[vertex] !== match)) throw new Error('Native window triangle crosses source pixel refs');
          buckets[order.indexOf(match.key)].push(...triangle); match.triangles++;
        }
        const copy = geometry.clone(), materials = order.map(key => {
          const material = mesh.material.clone();
          const color = new T.Color(data.chains[key].color).convertSRGBToLinear();
          material.name = 'Illustrative ' + data.chains[key].name + ' native LED window';
          material.color.copy(color).multiplyScalar(.15);
          material.emissive.copy(color); material.emissiveIntensity = intensity;
          material.metalness = 0; material.roughness = .45; material.toneMapped = false;
          return material;
        });
        copy.clearGroups();
        let start = 0;
        buckets.forEach((bucket, i) => { if (bucket.length) copy.addGroup(start, bucket.length, i); start += bucket.length; });
        copy.setIndex(buckets.flat());
        records.push({mesh, geometry: copy, materials, originalGeometry: geometry, originalMaterial: mesh.material});
      }
      for (const pixel of byRef.values()) {
        if (pixel.triangles !== 12 || pixel.bounds.isEmpty()) throw new Error('Incomplete native window for ' + pixel.ref);
        const center = pixel.bounds.getCenter(new T.Vector3());
        const errorMm = Math.hypot(center.x - pixel.expected.x, center.z - pixel.expected.z) * units;
        if (errorMm > .001) throw new Error('Source registration changed for ' + pixel.ref);
        windows.set(pixel.ref, {ref: pixel.ref, line: pixel.key, position: center, errorMm});
      }
    } catch (error) { cleanup(); throw error; }

    const api = {
      source, count: windows.size, mode: 'native-window-materials',
      lineCounts: Object.freeze(Object.fromEntries(order.map(key => [key, data.chains[key].leds.length]))),
      maxRegistrationErrorMm: Math.max(...[...windows.values()].map(pixel => pixel.errorMm)),
      controller: Object.freeze({ref: 'U3', name: 'ESP32-WROOM-32E', object: model.group.getObjectByName('U3')}),
      boardToLocal,
      // Positions are in the assembled board frame. Native faces themselves
      // remain children of their real LED banks, so they follow any bank motion.
      pixelPosition(ref) { return windows.get(ref)?.position.clone() || null; },
      get visible() { return visible; },
      get line() { return selection; },
      show(key = selection) {
        if (disposed) return api;
        checkLine(key); selection = key; visible = true;
        records.forEach(record => {
          record.mesh.geometry = record.geometry;
          record.mesh.material = order.map((line, i) => key === 'all' || line === key ? record.materials[i] : record.originalMaterial);
        });
        return api;
      },
      hide() {
        if (!disposed) records.forEach(record => { record.mesh.geometry = record.originalGeometry; record.mesh.material = record.originalMaterial; });
        visible = false; return api;
      },
      setLine(key) { checkLine(key); selection = key; if (visible) api.show(key); return api; },
      dispose() { if (!disposed) { cleanup(); active.delete(model.group); disposed = true; visible = false; } }
    };
    active.set(model.group, api);
    if (options.visible !== false) api.show(options.line || 'all');
    return api;
  }
  window.TramTracePixelPattern = Object.freeze({create, source});
})();
