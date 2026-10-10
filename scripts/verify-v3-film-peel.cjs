/* Focused, renderer-free regression for the detailed v3 covering peel.
 * node scripts/verify-v3-film-peel.cjs
 * Optional V3_FILM_BASE_REF (default HEAD) selects the v2 compatibility reference.
 * V3_FILM_GROUP runs only named groups; omit it for the complete regression.
 * Real Three/GLTFLoader/model bytes are used. Image decoding is stubbed, so this
 * does not certify shader output, visual quality, DOM layout or browser input.
 * "All poses" below means the dense grid plus every authored transition edge;
 * it is not a mathematical proof over the continuous interval.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytesOf = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const evidence = { groups: [], reference: process.env.V3_FILM_BASE_REF || 'HEAD' };
const failures = [];
function check(name, fn) {
  if (process.env.V3_FILM_GROUP && !name.includes(process.env.V3_FILM_GROUP)) return;
  try { const details = fn(); evidence.groups.push({ name, pass: true, ...details }); console.log('PASS ' + name); }
  catch (error) { evidence.groups.push({ name, pass: false, error: error.message }); failures.push(error); console.error('FAIL ' + name + ': ' + error.message); }
}
global.window = global; global.self = global;
const T = global.THREE = require(path.join(root, 'assets/vendor/three.min.js'));
vm.runInThisContext(read('assets/vendor/GLTFLoader.js').toString());
global.fetch = async source => {
  const bytes = read(String(source).split('?')[0].replace(/^\//, ''));
  return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => JSON.parse(bytes) };
};
global.Image = class { set src(value) { this.width = 2048; this.height = 2048; queueMicrotask(() => this.onload?.()); } };
for (const source of ['assets/v2-hero-environment.js', 'assets/v2-hero-assets.js', 'assets/v3-aircraft-electronics.js', 'assets/v3-aircraft-scene.js']) vm.runInThisContext(read(source).toString(), { filename: source });
const currentFactory = window.V3AircraftScene;
evidence.sceneSha256 = digest(read('assets/v3-aircraft-scene.js'));
evidence.sourceFiles = ['assets/v3-aircraft-electronics.js', 'assets/v3-aircraft-scene.js'].map(file => ({ file, sha256: digest(read(file)) }));
const sourcePath = 'assets/models/aircraft/skylabs-trainer/airframe.glb';
const sourceBytes = read(sourcePath);
const metadata = JSON.parse(read('assets/models/aircraft/skylabs-trainer/manifest.json'));
async function fixture(factory, detailed) {
  const gltf = await new Promise((resolve, reject) => new T.GLTFLoader().parse(sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength), '', resolve, reject));
  const sourceMeshes = [];
  gltf.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    sourceMeshes.push({ mesh, geometry: mesh.geometry, attributes: Object.entries(mesh.geometry.attributes).map(([name, attribute]) => ({ name, attribute, array: attribute.array, hash: digest(bytesOf(attribute.array)) })), index: mesh.geometry.index ? { array: mesh.geometry.index.array, hash: digest(bytesOf(mesh.geometry.index.array)) } : null });
  });
  const telemetry = await window.V2HeroAssets.load('telemetry');
  const flight = factory.create(T, { group: gltf.scene, metadata }, telemetry, { detailed });
  return { flight, sourceMeshes, camera: new T.PerspectiveCamera(32, 1, .002, 80) };
}
const materials = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const visible = mesh => { for (let item = mesh; item; item = item.parent) if (!item.visible) return false; return true; };
function snapshot(flight, camera) {
  const objects = [];
  flight.group.traverse(item => {
    const value = { name: item.name, matrix: item.matrixWorld.elements.slice(), scale: item.scale.toArray(), visible: item.visible };
    if (item.isMesh) {
      value.attributes = Object.fromEntries(Object.entries(item.geometry.attributes).map(([name, a]) => [name, digest(bytesOf(a.array))]));
      value.index = item.geometry.index ? digest(bytesOf(item.geometry.index.array)) : null;
      value.materials = materials(item).map(m => ({ opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, side: m.side, roughness: m.roughness, metalness: m.metalness }));
    }
    objects.push(value);
  });
  return { objects, camera: camera ? { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), projection: camera.projectionMatrix.elements.slice() } : null };
}
(async () => {
  const run = await fixture(currentFactory, true), { flight, camera, sourceMeshes } = run;
  const wraps = flight.films.filter(patch => patch.surface === 'wrap');
  const sourceWraps = new Map(sourceMeshes.filter(({ mesh }) => mesh.userData.filmSurface === 'wrap').map(entry => [entry.mesh.name, entry]));
  const structural = sourceMeshes.filter(({ mesh }) => !mesh.userData.filmSurface).map(entry => entry.mesh);
  check('source asset and exact assembled envelope', () => {
    assert.equal(digest(sourceBytes), metadata.asset.sha256, 'Original GLB agrees with its source manifest');
    const committed = execFileSync('git', ['show', evidence.reference + ':' + sourcePath], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    assert.ok(sourceBytes.equals(committed), 'Original GLB unchanged relative to reference commit');
    assert.equal(wraps.length, sourceWraps.size * 2, 'Each original wrapper becomes two finite open sheets');
    const point = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), delta = new T.Vector3(), offset = new T.Vector3();
    let maximumDistance = 0, vertices = 0;
    for (const [name, original] of sourceWraps) {
      const panels = wraps.filter(p => p.mesh.name.startsWith(name + '-sheet-'));
      assert.equal(panels.length, 2, 'Exactly two sheets for ' + name);
      const source = original.geometry.attributes.position, count = original.mesh.userData.ringVertexCount;
      assert.equal(source.count, count * 2, 'Source ruled wrapper has two authored rings');
      const envelope = new T.Box3().setFromBufferAttribute(source), panelEnvelope = new T.Box3(), coveredEndpoints = new Set();
      for (const patch of panels) {
        assert.ok(patch.mesh.userData.separatedFilmPanel);
        const positions = patch.mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i); panelEnvelope.expandByPoint(point); coveredEndpoints.add(point.toArray().join(','));
          let closest = Infinity;
          for (let column = 0; column < count; column++) {
            a.fromBufferAttribute(source, column); b.fromBufferAttribute(source, column + count); delta.copy(b).sub(a); offset.copy(point).sub(a);
            const t = Math.max(0, Math.min(1, offset.dot(delta) / delta.lengthSq()));
            closest = Math.min(closest, offset.addScaledVector(delta, -t).length());
          }
          maximumDistance = Math.max(maximumDistance, closest); vertices++;
        }
      }
      for (let i = 0; i < source.count; i++) assert.ok(coveredEndpoints.has(point.fromBufferAttribute(source, i).toArray().join(',')), 'Every original source endpoint remains on a panel: ' + name);
      assert.ok(envelope.min.distanceTo(panelEnvelope.min) < 1e-7 && envelope.max.distanceTo(panelEnvelope.max) < 1e-7, 'Original envelope extrema remain: ' + name);
    }
    assert.ok(maximumDistance < 1e-7, 'Every assembled panel vertex lies on an original ruled source segment');
    return { sourceSha256: digest(sourceBytes), wrappers: sourceWraps.size, panels: wraps.length, vertices, maximumEnvelopeErrorMetres: maximumDistance };
  });
  check('remeshed caps preserve the exact source surface and area', () => {
    const triangle = new T.Triangle(), point = new T.Vector3(), closest = new T.Vector3();
    let maximumDistance = 0, maximumRelativeAreaError = 0, caps = 0;
    function triangles(geometry) {
      const positions = geometry.attributes.position, index = geometry.index, result = [];
      for (let i = 0; i < index.count; i += 3) result.push([0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(positions, index.getX(i + k))));
      return result;
    }
    function area(items) { return items.reduce((sum, [a, b, c]) => sum + triangle.set(a, b, c).getArea(), 0); }
    for (const patch of flight.films.filter(p => p.surface === 'cap')) {
      const original = sourceMeshes.find(entry => entry.mesh.name === patch.mesh.name), source = triangles(original.geometry), replacement = triangles(patch.mesh.geometry);
      const sourceArea = area(source), replacementArea = area(replacement);
      maximumRelativeAreaError = Math.max(maximumRelativeAreaError, Math.abs(replacementArea / sourceArea - 1));
      const positions = patch.mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i); let distance = Infinity;
        for (const [a, b, c] of source) { triangle.set(a, b, c).closestPointToPoint(point, closest); distance = Math.min(distance, closest.distanceTo(point)); }
        maximumDistance = Math.max(maximumDistance, distance);
      }
      caps++;
    }
    assert.ok(maximumDistance < 1e-7, 'Cap remeshing never leaves the authored planar source surface');
    assert.ok(maximumRelativeAreaError < 1e-5, 'Cap remeshing preserves source area without gaps or duplicated triangles');
    return { caps, maximumSourceSurfaceErrorMetres: maximumDistance, maximumRelativeAreaError };
  });
  check('assembled panel winding agrees with authored normals', () => {
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), scratch = new T.Vector3();
    let triangles = 0, degenerates = 0, inverted = 0, minimumCosine = 1;
    for (const patch of wraps) {
      const g = patch.mesh.geometry, p = g.attributes.position, normal = g.attributes.normal;
      for (let i = 0; i < g.index.count; i += 3) {
        const ids = [0, 1, 2].map(k => g.index.getX(i + k));
        a.fromBufferAttribute(p, ids[0]); b.fromBufferAttribute(p, ids[1]).sub(a); c.fromBufferAttribute(p, ids[2]).sub(a); b.cross(c);
        if (b.lengthSq() < 1e-24) { degenerates++; continue; }
        n.set(0, 0, 0); for (const id of ids) n.add(scratch.fromBufferAttribute(normal, id));
        const cosine = b.normalize().dot(n.normalize()); minimumCosine = Math.min(minimumCosine, cosine); if (cosine < -1e-6) inverted++; triangles++;
      }
    }
    assert.equal(inverted, 0, 'No triangle winds against its averaged vertex normal');
    return { triangles, degenerates, inverted, minimumCosine };
  });
  const poseValues = new Set(Array.from({ length: 201 }, (_, i) => i / 200));
  for (const p of [0, .045, .22, .31, .328, .346, .35, .49, .51, .52, .55, .60, .61, .63, .67, .91, 1, ...flight.parts.flatMap(p => [p.start, p.end])]) for (const epsilon of [-1e-6, 0, 1e-6]) poseValues.add(Math.max(0, Math.min(1, p + epsilon)));
  const poses = [...poseValues].sort((a, b) => a - b);
  check('dense poses keep film finite, above ground, full scale and full material length', () => {
    const point = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3();
    let minimumY = Infinity, minimumStructureY = Infinity, worstGroundPose = 0, minimumLengthRatio = Infinity, maximumLengthRatio = 0, checkedVertices = 0;
    const meshScales = new Map(flight.films.map(p => [p.mesh, p.mesh.scale.toArray()]));
    for (const progress of poses) {
      flight.setProgress(progress);
      for (const mesh of structural) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) { point.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld); assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z), 'Finite structural transform'); minimumStructureY = Math.min(minimumStructureY, point.y); }
      for (const part of flight.parts.filter(part => part.filmPatches)) assert.deepEqual(part.object.scale.toArray(), part.scale.toArray(), 'Film group never shrinks at ' + progress);
      for (const patch of flight.films) {
        assert.deepEqual(patch.mesh.scale.toArray(), meshScales.get(patch.mesh), 'Sheet mesh never shrinks at ' + progress);
        const positions = patch.mesh.geometry.attributes.position;
        for (const attribute of [positions, patch.mesh.geometry.attributes.normal]) for (const value of attribute.array) assert.ok(Number.isFinite(value), 'Finite film attributes at ' + progress);
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(patch.mesh.matrixWorld);
          if (point.y < minimumY) { minimumY = point.y; worstGroundPose = progress; }
          checkedVertices++;
        }
        for (const ring of patch.rings) {
          let length = 0;
          for (let i = 1; i < ring.points.length; i++) { a.fromBufferAttribute(positions, ring.points[i - 1].index); b.fromBufferAttribute(positions, ring.points[i].index); length += a.distanceTo(b); }
          const ratio = length / ring.perimeter; minimumLengthRatio = Math.min(minimumLengthRatio, ratio); maximumLengthRatio = Math.max(maximumLengthRatio, ratio);
        }
      }
    }
    assert.ok(minimumStructureY >= -1e-6, 'Structure remains above ground: ' + minimumStructureY);
    assert.ok(minimumY >= -1e-6, 'Film does not penetrate ground; lowest ' + minimumY + ' at ' + worstGroundPose);
    // The sampled polygon approximates the finite circular fold. Allow 2% chord
    // discretization, but reject geometric shrinking or stretching of the sheet.
    assert.ok(minimumLengthRatio >= .98 && maximumLengthRatio <= 1.02, 'Material arc lengths conserved within 2% tessellation tolerance: ' + minimumLengthRatio + '..' + maximumLengthRatio);
    return { poses: poses.length, checkedVertices, minimumFilmY: minimumY, minimumStructureY, worstGroundPose, minimumLengthRatio, maximumLengthRatio };
  });
  check('fully released panels form one finite fold with a gently relaxed tail', () => {
    flight.setProgress(.35);
    const a = new T.Vector3(), b = new T.Vector3(), direction = new T.Vector3();
    let maximumTurn = 0, minimumTailAlignment = 1, rings = 0;
    for (const patch of wraps) {
      assert.equal(patch.amount, 1, 'Every sheet has released by .35');
      const positions = patch.mesh.geometry.attributes.position;
      for (const ring of patch.rings) {
        let previous = null, turn = 0, tailDirection = null;
        for (let i = 1; i < ring.points.length; i++) {
          a.fromBufferAttribute(positions, ring.points[i - 1].index); b.fromBufferAttribute(positions, ring.points[i].index); direction.copy(b).sub(a).normalize();
          if (previous) turn += Math.acos(Math.max(-1, Math.min(1, direction.dot(previous))));
          if (ring.points[i - 1].u >= .75) { if (!tailDirection) tailDirection = direction.clone(); else minimumTailAlignment = Math.min(minimumTailAlignment, tailDirection.dot(direction)); }
          previous = direction.clone();
        }
        maximumTurn = Math.max(maximumTurn, turn); rings++;
      }
    }
    assert.ok(maximumTurn < Math.PI * 1.05, 'Less than one half-turn, never a multi-turn spiral');
    assert.ok(minimumTailAlignment > .995, 'The final quarter of material bends less than six degrees');
    return { rings, maximumTurnRadians: maximumTurn, minimumTailAlignment };
  });
  check('released cap tabs lift out of their authored planes', () => {
    flight.setProgress(.28);
    const point = new T.Vector3(), rest = new T.Vector3();
    let caps = 0, minimumMaximumLift = Infinity;
    for (const patch of flight.films.filter(p => p.surface === 'cap')) {
      const normal = new T.Vector3(...patch.mesh.userData.outwardNormal).normalize();
      let maximumLift = 0;
      for (let i = 0; i < patch.mesh.geometry.attributes.position.count; i++) {
        point.fromBufferAttribute(patch.mesh.geometry.attributes.position, i); rest.fromArray(patch.rest, i * 3);
        maximumLift = Math.max(maximumLift, point.sub(rest).dot(normal));
      }
      assert.ok(maximumLift > 1e-5, 'Cap lifts out of its source plane: ' + patch.mesh.name);
      minimumMaximumLift = Math.min(minimumMaximumLift, maximumLift); caps++;
    }
    assert.equal(caps, 26, 'All original end tabs are checked');
    return { caps, progress: .28, minimumMaximumLiftMetres: minimumMaximumLift };
  });
  check('landing film and structure do not penetrate the ground', () => {
    const point = new T.Vector3(); let minimumY = Infinity, lowestMesh = '', lowestPose = 0;
    const meshes = [...structural, ...flight.films.map(p => p.mesh)];
    for (let i = 0; i <= 100; i++) {
      flight.setLanding(i / 100);
      for (const mesh of meshes) for (let v = 0; v < mesh.geometry.attributes.position.count; v++) {
        point.fromBufferAttribute(mesh.geometry.attributes.position, v).applyMatrix4(mesh.matrixWorld);
        if (point.y < minimumY) { minimumY = point.y; lowestMesh = mesh.name; lowestPose = i / 100; }
      }
    }
    assert.ok(minimumY >= -1e-6, 'No landing ground penetration: ' + minimumY + ' in ' + lowestMesh);
    return { poses: 101, minimumY, lowestMesh, lowestPose };
  });
  check('reverse seeking restores identical buffers, appearance and transforms', () => {
    const targets = [0, .18, .34, .43, .55, .60, 1], references = new Map();
    for (const p of targets) { flight.setProgress(p); flight.frame(camera, 390, 844); references.set(p, snapshot(flight, camera)); }
    for (const p of [1, .05, .65, .2, 0, .91, .35, .5, ...targets.slice().reverse()]) {
      flight.setProgress(p); flight.frame(camera, 390, 844);
      if (references.has(p)) assert.deepEqual(snapshot(flight, camera), references.get(p), 'Exact repeat pose at ' + p);
    }
    flight.setProgress(0);
    for (const patch of flight.films) assert.ok(bytesOf(patch.mesh.geometry.attributes.position.array).equals(bytesOf(patch.rest)), 'Exact assembled panel vertices');
    return { targets };
  });
  check('original structural and source film buffers remain untouched', () => {
    for (const entry of sourceMeshes) {
      for (const source of entry.attributes) { assert.equal(source.attribute.array, source.array); assert.equal(digest(bytesOf(source.array)), source.hash, entry.mesh.name + ' ' + source.name); }
      if (entry.index) assert.equal(digest(bytesOf(entry.index.array)), entry.index.hash, entry.mesh.name + ' indices');
    }
    return { sourceMeshes: sourceMeshes.length, structuralMeshes: structural.length };
  });
  check('revealed structural airframe stays framed through progress .50', () => {
    const point = new T.Vector3(); let checked = 0;
    for (const [width, height] of [[1440, 900], [390, 844], [320, 740], [1600, 650]]) for (const progress of [0, .1, .2, .3, .35, .36, .4, .45, .49, .5]) {
      flight.setProgress(progress); flight.frame(camera, width, height); camera.updateMatrixWorld(true);
      const included = [...structural, ...(progress <= .35 ? flight.films.map(p => p.mesh) : [])];
      for (const mesh of included) {
        if (!visible(mesh)) continue;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          point.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld).project(camera);
          assert.ok(Math.abs(point.x) <= 1.001 && Math.abs(point.y) <= 1.001 && Math.abs(point.z) <= 1.001, 'Clipped ' + mesh.name + ' at ' + progress + ' in ' + width + 'x' + height); checked++;
        }
      }
    }
    return { cases: 40, checkedVertices: checked, departureExclusionAfter: .35 };
  });
  check('camera handoff stays continuous with bounded normalized motion', () => {
    const results = [];
    for (const [width, height] of [[1440, 900], [390, 844], [320, 740]]) {
      let previous = null, previousDelta = null, maxStepFraction = 0, maxDerivativeChange = 0, maxMicroStepFraction = 0, maxEarlyDerivativeChange = 0, worstStepPose = 0, worstDerivativePose = 0, worstMicroPose = 0;
      for (let n = 350; n <= 610; n++) {
        const p = n / 1000;
        flight.setProgress(p); const framing = flight.frame(camera, width, height), position = camera.position.clone();
        if (previous) {
          const delta = position.clone().sub(previous.position).divideScalar(previous.distance);
          if (delta.length() > maxStepFraction) { maxStepFraction = delta.length(); worstStepPose = p; }
          if (previousDelta) { const change = delta.clone().sub(previousDelta).length(); if (p < .49) maxEarlyDerivativeChange = Math.max(maxEarlyDerivativeChange, change); if (change > maxDerivativeChange) { maxDerivativeChange = change; worstDerivativePose = p; } }
          previousDelta = delta;
        }
        flight.setProgress(p + 1e-6); flight.frame(camera, width, height);
        const micro = camera.position.distanceTo(position) / framing.distance; if (micro > maxMicroStepFraction) { maxMicroStepFraction = micro; worstMicroPose = p; }
        previous = { position, distance: framing.distance };
      }
      console.log(JSON.stringify({ cameraMetrics: { width, height, maxStepFraction, maxDerivativeChange, maxEarlyDerivativeChange, maxMicroStepFraction, worstStepPose, worstDerivativePose, worstMicroPose } }));
      assert.ok(maxStepFraction < .015, 'Per .001 progress camera motion below the shared 1.5% view-distance budget');
      // Different fitted bounds can exchange dominance without a position jump.
      // Report that velocity kink separately; use microsteps for the strict
      // position-jump guard instead of an arbitrary acceleration threshold.
      assert.ok(maxEarlyDerivativeChange < .002, 'Departing film does not cause a sharp early camera velocity reversal');
      assert.ok(maxMicroStepFraction < .0001, 'No visibility-driven discontinuity at dense microsteps');
      results.push({ width, height, samples: 261, maxStepFraction, maxDerivativeChange, maxEarlyDerivativeChange, maxMicroStepFraction, worstStepPose, worstDerivativePose, worstMicroPose });
    }
    return { results };
  });
  console.log('Preparing detailed:false compatibility comparison...');
  const previousSource = execFileSync('git', ['show', evidence.reference + ':assets/v3-aircraft-scene.js'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  vm.runInThisContext(previousSource, { filename: 'reference-v3-aircraft-scene.js' });
  const previous = await fixture(window.V3AircraftScene, false), current = await fixture(currentFactory, false);
  check('v2 detailed:false output matches reference exactly', () => {
    let cases = 0;
    for (const kind of ['setLanding', 'setProgress']) for (const p of [0, .045, .1, .2, .31, .35, .43, .5, .55, .6, .7, .91, 1]) for (const [w, h] of [[1440, 900], [390, 844]]) {
      for (const f of [previous, current]) { f.flight[kind](p); f.flight.frame(f.camera, w, h); }
      assert.deepEqual(snapshot(current.flight, current.camera), snapshot(previous.flight, previous.camera), kind + '(' + p + ') ' + w + 'x' + h); cases++;
    }
    return { reference: evidence.reference, cases };
  });
  check('scene source remained stable throughout the run', () => { for (const source of evidence.sourceFiles) assert.equal(digest(read(source.file)), source.sha256, source.file + ' changed while tests ran'); return {}; });
  evidence.passed = failures.length === 0;
  const output = process.env.V3_FILM_OUT || path.join(root, '.codex-temp/v3-film-peel/evidence.json');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
