/* The trainer and telemetry retain their source geometry. This factory owns
 * only their presentation transforms and can also render the static posters. */
(() => {
  'use strict';
  const directory = '/assets/models/aircraft/skylabs-trainer/';
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
  async function download(source) {
    const compressed = !!window.DecompressionStream && source.compressedModel;
    const response = await fetch(directory + (compressed || source.model));
    if (!response.ok) throw new Error('Trainer model unavailable');
    let buffer = await response.arrayBuffer();
    if (compressed && new Uint8Array(buffer)[0] === 31) buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return buffer;
  }
  function prefetch() {
    return pending ||= fetch(directory + 'manifest.json').then(async response => {
      if (!response.ok) throw new Error('Trainer manifest unavailable');
      const metadata = await response.json();
      if (window.WebAssembly && metadata.transport?.lossless && metadata.transport.format === 'EXT_meshopt_compression') {
        try {
          const [buffer] = await Promise.all([download(metadata.transport), decoder(metadata.transport.decoder)]);
          return { metadata, buffer, packed: true };
        } catch (_) { /* The original GLB remains a complete fallback. */ }
      }
      return { metadata, buffer: await download(metadata), packed: false };
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
    catch (error) { if (!packed) throw error; gltf = await parse(await download(metadata), false); }
    if (metadata.units !== 'metres' || metadata.axes.nose !== '+X' || metadata.axes.up !== '+Y') throw new Error('Unexpected trainer coordinates');
    return { group: gltf.scene, metadata };
  }

  function create(T, aircraft, telemetry) {
    const metadata = aircraft.metadata;
    const group = new T.Group(); group.name = 'Skylabs flight story';
    const carrier = new T.Group(); carrier.name = 'Aircraft pose'; group.add(carrier); carrier.add(aircraft.group);
    const board = new T.Group(); board.name = 'Telemetry placement'; carrier.add(board);
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
      if (role === 'covering') { offset = new T.Vector3(centre.x * .08, .38 + ordinal % 3 * .04, sign * .20); start = .055 + ordinal % 4 * .01; end = .30; }
      else if (role.startsWith('wing-')) { offset = new T.Vector3(.02, sign > 0 ? .28 : .20, sign * .65); start = .18 + (sign < 0 ? .035 : 0); end = .49; }
      else if (role.startsWith('horizontal-tail')) { offset = new T.Vector3(-.30, .18, sign * .35); start = .25; end = .56; }
      else if (role === 'vertical-tail') { offset = new T.Vector3(-.35, .42, .025); start = .27; end = .60; }
      else if (role.includes('gear')) { offset = new T.Vector3(.08, -.14, sign * .17); start = .30; end = .57; }
      else if (role === 'motor' || role === 'propeller') { offset = new T.Vector3(role === 'propeller' ? .62 : .35, .04, 0); start = role === 'propeller' ? .29 : .35; end = .59; }
      else { offset = new T.Vector3(centre.x * .21, .04 + (ordinal % 5) * .024, sign * (.25 + ordinal % 4 * .045)); start = .28 + ordinal % 7 * .012; end = .66; }
      parts.push({ ...item, base, quaternion, scale, offset, start, end });
    }
    const materials = new Map(), meshes = [];
    // Reparented groups are now carrier children, so inspect the carrier while
    // excluding the unchanged telemetry subtree.
    carrier.traverse(mesh => {
      if (!mesh.isMesh) return;
      let ancestor = mesh;
      while (ancestor && ancestor !== board) ancestor = ancestor.parent;
      if (ancestor === board) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(original => {
        if (!materials.has(original)) materials.set(original, { material: original.clone(), opacity: original.opacity, transparent: original.transparent, depthWrite: original.depthWrite });
        return materials.get(original).material;
      });
      if (mesh.material.length === 1) mesh.material = mesh.material[0];
      meshes.push({ object: mesh, visible: mesh.visible });
    });
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
    function fadeAirframe(amount) {
      for (const entry of materials.values()) {
        const transparent = entry.transparent || amount > 0;
        if (entry.material.transparent !== transparent) { entry.material.transparent = transparent; entry.material.needsUpdate = true; }
        entry.material.opacity = entry.opacity * (1 - amount);
        entry.material.depthWrite = amount > 0 ? false : entry.depthWrite;
      }
      meshes.forEach(mesh => { mesh.object.visible = mesh.visible && amount < .999; mesh.object.castShadow = amount < .15; });
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
      carrier.position.y += .48 * ramp(progress, .08, .37);
      let separated = 0;
      for (const part of parts) {
        const amount = ramp(progress, part.start, part.end);
        part.object.position.copy(part.base).addScaledVector(part.offset, amount);
        if (amount > 0) separated++;
      }
      const extraction = ramp(progress, .47, .78);
      board.position.add(new T.Vector3(.035, .27, -.32).multiplyScalar(extraction));
      board.rotation.set(-.08 * extraction, .17 * extraction, .03 * extraction);
      fadeAirframe(ramp(progress, .67, .91));
      group.updateMatrixWorld(true);
      return { phase: progress < .055 ? 'stopped' : progress < .47 ? 'opening' : progress < .80 ? 'extraction' : 'telemetry', progress, landing: 1, separated };
    }
    function frame(camera, width, height) {
      const aspect = width / height, mobile = aspect < .9;
      const focus = ramp(progress, .50, .98);
      const boardPosition = board.getWorldPosition(new T.Vector3());
      const tracking = 1 - ramp(landing, .02, .72);
      const aircraftBounds = new T.Box3().setFromObject(group);
      const baseTarget = new T.Vector3(-.08 + carrier.position.x * .88 * tracking, .20 + carrier.position.y * .35 * tracking, 0);
      baseTarget.lerp(aircraftBounds.getCenter(new T.Vector3()), ramp(progress, .04, .30));
      target.copy(baseTarget).lerp(boardPosition, focus);
      const wideDirection = mobile ? new T.Vector3(2.8, 2.1, -4.3) : new T.Vector3(3.6, 1.6, -5.7);
      const closeDirection = new T.Vector3(.08, .155, -.155).normalize();
      const direction = wideDirection.normalize().lerp(closeDirection, focus).normalize();
      const groundedDistance = mobile ? 3.0 / Math.max(.48, aspect) : 3.55;
      const wideDistance = groundedDistance * (1 + .6 * tracking);
      const closeDistance = mobile ? .24 / Math.max(.6, aspect) : .24;
      let distance = Math.exp(Math.log(wideDistance) * (1 - focus) + Math.log(closeDistance) * focus);
      const right = new T.Vector3(0, 1, 0).cross(direction).normalize(), up = direction.clone().cross(right).normalize();
      const tangent = Math.tan(16 * Math.PI / 180), sample = new T.Vector3();
      let fitDistance = 0;
      for (const mesh of meshes) {
        if (!mesh.object.visible) continue;
        const geometry = mesh.object.geometry; if (!geometry.boundingBox) geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        for (let index = 0; index < 8; index++) {
          sample.set(index & 1 ? bounds.max.x : bounds.min.x, index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z).applyMatrix4(mesh.object.matrixWorld).sub(target);
          fitDistance = Math.max(fitDistance, sample.dot(direction) + Math.abs(sample.dot(right)) / (tangent * aspect * .91), sample.dot(direction) + Math.abs(sample.dot(up)) / (tangent * (mobile ? .70 : .72)));
        }
      }
      distance = Math.max(distance, fitDistance * (1 - ramp(progress, .55, .75)));
      cameraPosition.copy(target).addScaledVector(direction, distance);
      camera.position.copy(cameraPosition); camera.up.set(0, 1, 0); camera.lookAt(target);
      camera.fov = 32; camera.aspect = aspect; camera.near = Math.max(.002, Math.min(.1, distance * .04)); camera.far = 80;
      camera.setViewOffset(width, height, (mobile ? 0 : -.10 * focus) * width, -.08 * (mobile ? 1 : 1 - focus) * height, width, height);
      camera.updateProjectionMatrix();
      return { target: target.clone(), focus, distance };
    }
    setProgress(0);
    let triangles = 0;
    meshes.forEach(mesh => { const geometry = mesh.object.geometry; triangles += (geometry.index?.count || geometry.attributes.position.count) / 3; });
    return {
      group, carrier, board, parts, metadata,
      setLanding, setProgress, frame, attachTelemetry,
      get telemetryReady() { return !!attachedTelemetry; },
      get statistics() { return { parts: parts.length, sourceOccurrences: metadata.parts.length, triangles, boardUnits, telemetryComponents: attachedTelemetry?.group.userData.componentCount || 0, reconstructed: metadata.completion?.reconstruction?.length || 0 }; },
      assemblyError() { return parts.reduce((error, part) => Math.max(error, part.object.position.distanceTo(part.base), 1 - Math.abs(part.object.quaternion.dot(part.quaternion))), 0); }
    };
  }
  window.V3AircraftScene = Object.freeze({ prefetch, load, create });
})();
