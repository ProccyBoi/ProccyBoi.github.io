/* Framework printable housing and the original M2 × 3 screw CAD.
 * Coordinates are millimetres before normalization: +Y is up, the screw's
 * bearing plane is Y=0, and its shaft extends toward negative Y.
 */
(() => {
  'use strict';
  if (window.FrameworkMechanics) return;
  const buffers = new Map();
  const screwUrl = '/assets/models/framework-mechanics/framework-m2x3-screw.stl';
  const read = url => {
    if (!buffers.has(url)) buffers.set(url, fetch(url).then(response => {
      if (!response.ok) throw new Error('Framework mechanical CAD unavailable');
      return response.arrayBuffer();
    }).catch(error => { buffers.delete(url); throw error; }));
    return buffers.get(url);
  };

  function geometry(T, buffer, units) {
    if (buffer.byteLength < 84) throw new Error('Invalid mechanical STL');
    const view = new DataView(buffer), triangles = view.getUint32(80, true);
    if (!triangles || 84 + triangles * 50 !== buffer.byteLength) throw new Error('Invalid mechanical STL');
    const positions = new Float32Array(triangles * 9);
    for (let i = 0; i < triangles; i += 1) {
      for (let j = 0; j < 9; j += 1) positions[i * 9 + j] = view.getFloat32(84 + i * 50 + 12 + j * 4, true) / units;
    }
    const result = new T.BufferGeometry();
    result.setAttribute('position', new T.BufferAttribute(positions, 3));
    const Index = positions.length / 3 <= 65535 ? Uint16Array : Uint32Array;
    const indices = new Index(positions.length / 3);
    for (let i = 0; i < indices.length; i += 1) indices[i] = i;
    result.setIndex(new T.BufferAttribute(indices, 1));
    result.computeVertexNormals(); result.computeBoundingSphere();
    return result;
  }

  async function load(T, { enclosureUrl, translationMm, holesMm, boardTopMm, units = 1 }) {
    if (!Number.isFinite(units) || units <= 0) throw new Error('Invalid mechanical units');
    const [housingBuffer, fastenerBuffer] = await Promise.all([read(enclosureUrl), read(screwUrl)]);
    const shell = new T.Mesh(geometry(T, housingBuffer, units), new T.MeshStandardMaterial({
      color: 0x919ca4, metalness: 0.05, roughness: 0.42, transparent: true,
      opacity: 0.3, side: T.DoubleSide, depthWrite: false
    }));
    shell.position.fromArray(translationMm).divideScalar(units);
    shell.name = 'Enclosure'; shell.receiveShadow = true;
    Object.assign(shell.userData, { partRef: shell.name, mechanicalRole: 'enclosure' });
    const parts = [{ object: shell, ref: shell.name, value: 'Framework housing', base: shell.position.clone(), offset: new T.Vector3(-1.4, -12.8, 2.6).divideScalar(units) }];
    const screwGeometry = geometry(T, fastenerBuffer, units);
    const screwMaterial = new T.MeshStandardMaterial({ color: new T.Color(0xaeb4b7).convertSRGBToLinear(), metalness: 0.82, roughness: 0.28, envMapIntensity: 0.65 });
    const screws = holesMm.map(([x, z], index) => {
      const screw = new T.Mesh(screwGeometry, screwMaterial);
      screw.name = `M2-${index + 1}`;
      screw.position.set(x, boardTopMm, z).divideScalar(units);
      screw.castShadow = screw.receiveShadow = true;
      Object.assign(screw.userData, { partRef: screw.name, mechanicalRole: 'screw', mechanicalSeatMm: [x, boardTopMm, z] });
      const side = Math.sign(x) || (index ? 1 : -1);
      parts.push({ object: screw, ref: screw.name, value: 'M2 × 3 mounting screw', base: screw.position.clone(), offset: new T.Vector3(side * 0.75, 10.8, -0.55).divideScalar(units) });
      return screw;
    });
    return { shell, screws, parts };
  }
  window.FrameworkMechanics = Object.freeze({ load });
})();
