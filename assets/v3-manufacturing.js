/* Registered fabrication layers and reversible component placement. The
 * prepared CAD vertices, indices, normals, UVs and final transforms are kept. */
(() => {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
  const between = (value, a, b) => smooth((value - a) / (b - a));
  const folder = '/assets/models/manufacturing/tramtrace/';
  const images = new Map();

  function bitmap(source) {
    if (!images.has(source)) images.set(source, new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source;
    }));
    return images.get(source);
  }

  function prefetch() {
    return Promise.all(['front-copper.svg', 'solder-paste.svg'].map(name => bitmap(folder + name)));
  }

  async function texture(T, source) {
    const image = new T.Texture(await bitmap(source));
    image.encoding = T.sRGBEncoding;
    image.anisotropy = 4; image.needsUpdate = true;
    return image;
  }

  function surface(material, uniform, label) {
    const original = material.onBeforeCompile;
    material.onBeforeCompile = shader => {
      original.call(material, shader);
      shader.uniforms.uSurface = uniform;
      shader.vertexShader = 'varying float vSurfaceX;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfaceX = position.x;');
      shader.fragmentShader = 'uniform float uSurface;\nvarying float vSurfaceX;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uSurface < 0.9999 && vSurfaceX > mix(-0.51, 0.51, uSurface)) discard;');
    };
    material.customProgramCacheKey = () => 'v3-surface-' + label;
    material.needsUpdate = true;
  }

  const placementHeader = `
    uniform float uPlacement;
    attribute float aPlacementStart;
    attribute float aPlacementLift;
    attribute vec2 aPlacementDrift;
    varying float vPlacementVisible;
  `;
  const placementVertex = `
    #include <begin_vertex>
    float flight = clamp((uPlacement - aPlacementStart) / 0.055, 0.0, 1.0);
    float approach = smoothstep(0.0, 0.62, flight);
    float landing = smoothstep(0.62, 1.0, flight);
    transformed.xz += aPlacementDrift * (1.0 - approach);
    transformed.y += aPlacementLift * (1.0 - approach) + 0.035 * (1.0 - landing);
    vPlacementVisible = step(aPlacementStart, uPlacement);
  `;
  function placeMaterial(material, clock, label) {
    const original = material.onBeforeCompile;
    material.onBeforeCompile = shader => {
      original.call(material, shader);
      shader.uniforms.uPlacement = clock;
      shader.vertexShader = placementHeader + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', placementVertex);
      shader.fragmentShader = 'varying float vPlacementVisible;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vPlacementVisible < 0.5) discard;');
    };
    material.customProgramCacheKey = () => 'v3-place-' + label;
    material.needsUpdate = true;
  }

  async function create(T, model, metadata) {
    if (metadata.ledCount !== 116 || metadata.components.length !== 143 || metadata.unitsMm !== 207.81) throw new Error('Unexpected TramTrace registration');
    const pcb = model.group.getObjectByName('PCB');
    const silk = model.group.getObjectByName('Silkscreen');
    if (!pcb || pcb.children.length !== 3 || !silk) throw new Error('TramTrace source board unavailable');
    const [pads, mask, core] = pcb.children;
    const coreColor = core.material.color.clone();
    const rawCore = new T.Color('#8a8050').convertSRGBToLinear();
    const clock = { value: 0 };
    const maskClock = { value: 0 }, silkClock = { value: 0 }, padClock = { value: 0 };
    surface(mask.material, maskClock, 'mask');
    surface(silk.material, silkClock, 'legend');
    surface(pads.material, padClock, 'pads');

    const [copperTexture, pasteTexture] = await Promise.all([
      texture(T, folder + metadata.assets.frontCopper),
      texture(T, folder + metadata.assets.solderPaste)
    ]);
    const width = metadata.boardSizeMm[0] / metadata.unitsMm;
    const depth = metadata.boardSizeMm[2] / metadata.unitsMm;
    // Reuse the top-face triangulation of the actual laminate. The fabrication
    // overlays inherit its rounded perimeter and drill cutouts exactly.
    const source = core.geometry.attributes.position;
    const sourceIndex = core.geometry.index;
    core.geometry.computeBoundingBox();
    const topY = core.geometry.boundingBox.max.y;
    const layerVertices = [], layerUVs = [], layerNormals = [];
    const indices = sourceIndex ? sourceIndex.count : source.count;
    for (let triangle = 0; triangle < indices; triangle += 3) {
      const points = [0, 1, 2].map(offset => sourceIndex ? sourceIndex.getX(triangle + offset) : triangle + offset);
      if (!points.every(index => Math.abs(source.getY(index) - topY) < .000001)) continue;
      for (const index of points) {
        const x = source.getX(index), z = source.getZ(index);
        layerVertices.push(x, 0, z); layerNormals.push(0, 1, 0);
        layerUVs.push(x / width + .5, .5 - z / depth);
      }
    }
    if (layerVertices.length < 9) throw new Error('Source laminate outline unavailable');
    const layerGeometry = new T.BufferGeometry();
    layerGeometry.setAttribute('position', new T.Float32BufferAttribute(layerVertices, 3));
    layerGeometry.setAttribute('normal', new T.Float32BufferAttribute(layerNormals, 3));
    layerGeometry.setAttribute('uv', new T.Float32BufferAttribute(layerUVs, 2));
    const etchClock = { value: 0 };
    const copperMaterial = new T.MeshStandardMaterial({ color: 0xb96d36, map: copperTexture, metalness: .96, roughness: .3, transparent: true, alphaTest: .04, side: T.DoubleSide, depthWrite: true });
    copperMaterial.color.convertSRGBToLinear();
    copperMaterial.onBeforeCompile = shader => {
      shader.uniforms.uEtch = etchClock;
      shader.vertexShader = 'varying float vCopperX;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCopperX = position.x;');
      shader.fragmentShader = 'uniform float uEtch;\nvarying float vCopperX;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 copperPattern = texture2D(map, vUv);
          float etched = 1.0 - smoothstep(mix(-0.52, 0.52, uEtch) - 0.012, mix(-0.52, 0.52, uEtch) + 0.012, vCopperX);
          diffuseColor.a *= mix(1.0, copperPattern.a, etched);
        #endif
      `);
    };
    copperMaterial.customProgramCacheKey = () => 'v3-etched-copper';
    const copper = new T.Mesh(layerGeometry, copperMaterial);
    copper.name = 'Fabrication copper'; copper.position.y = .00735; copper.receiveShadow = true;
    model.group.add(copper);
    const pasteMaterial = new T.MeshStandardMaterial({ color: 0xb4b6ad, map: pasteTexture, metalness: .58, roughness: .55, transparent: true, alphaTest: .05, depthWrite: false });
    const pasteClock = { value: 0 };
    surface(pasteMaterial, pasteClock, 'paste');
    const paste = new T.Mesh(layerGeometry, pasteMaterial);
    paste.name = 'Production solder paste'; paste.position.y = .00785; paste.receiveShadow = true; paste.renderOrder = 2;
    model.group.add(paste);

    const category = ref => ref.startsWith('LED') ? 1 : /^[UJD]/.test(ref) ? 2 : 0;
    const ordered = [...metadata.components].sort((a, b) => category(a.ref) - category(b.ref) || a.position[0] - b.position[0] || a.position[2] - b.position[2]);
    const placements = new Map(ordered.map((part, index) => {
      const group = category(part.ref);
      const hash = [...part.ref].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 997, 17);
      return [part.ref, {
        ref: part.ref,
        position: new T.Vector3(...part.position),
        start: .565 + index / Math.max(1, ordered.length - 1) * .235,
        lift: (group === 2 ? .15 : .09) + (hash % 11) * .003,
        drift: [(hash % 2 ? 1 : -1) * (.024 + hash % 7 * .003), -.018 - hash % 5 * .004]
      }];
    }));
    const individual = [], usedLEDs = new Set();
    let maxLEDDistance = 0, originalTriangles = 0, originalMeshes = 0;
    model.group.updateMatrixWorld(true);
    model.group.traverse(mesh => {
      if (!mesh.isMesh || mesh === copper || mesh === paste) return;
      originalMeshes++;
      originalTriangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3;
      mesh.castShadow = mesh !== silk && mesh !== mask;
      mesh.receiveShadow = true;
    });
    for (const part of model.parts) {
      const refs = part.object.userData.componentRefs;
      if (!refs) {
        const placement = placements.get(part.object.userData.partRef || part.object.name);
        if (!placement) throw new Error('Component has no source position: ' + part.object.name);
        individual.push({ object: part.object, base: part.object.position.clone(), quaternion: part.object.quaternion.clone(), placement });
        continue;
      }
      const candidates = refs.map(ref => placements.get(ref));
      if (candidates.some(item => !item)) throw new Error('Missing LED registration');
      part.object.traverse(mesh => {
        if (!mesh.isMesh) return;
        const position = mesh.geometry.attributes.position;
        const starts = new Float32Array(position.count), lifts = new Float32Array(position.count), drifts = new Float32Array(position.count * 2);
        const vertex = new T.Vector3();
        for (let index = 0; index < position.count; index++) {
          vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
          let nearest, distance = Infinity;
          for (const candidate of candidates) {
            const delta = (candidate.position.x - vertex.x) ** 2 + (candidate.position.z - vertex.z) ** 2;
            if (delta < distance) { distance = delta; nearest = candidate; }
          }
          usedLEDs.add(nearest.ref); maxLEDDistance = Math.max(maxLEDDistance, Math.sqrt(distance));
          starts[index] = nearest.start; lifts[index] = nearest.lift;
          drifts[index * 2] = nearest.drift[0]; drifts[index * 2 + 1] = nearest.drift[1];
        }
        mesh.geometry.setAttribute('aPlacementStart', new T.BufferAttribute(starts, 1));
        mesh.geometry.setAttribute('aPlacementLift', new T.BufferAttribute(lifts, 1));
        mesh.geometry.setAttribute('aPlacementDrift', new T.BufferAttribute(drifts, 2));
        mesh.frustumCulled = false;
        mesh.material = mesh.material.clone();
        placeMaterial(mesh.material, clock, 'led');
        mesh.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
        placeMaterial(mesh.customDepthMaterial, clock, 'depth');
      });
    }
    if (usedLEDs.size !== 116 || maxLEDDistance > .013) throw new Error('LED placement registration failed');

    function update(progress) {
      const p = clamp(progress);
      clock.value = p;
      etchClock.value = between(p, .10, .29);
      copper.visible = p >= .025 && p < .425;
      copper.material.opacity = between(p, .025, .065);
      maskClock.value = between(p, .29, .405);
      padClock.value = between(p, .29, .405);
      silkClock.value = between(p, .405, .5);
      mask.visible = maskClock.value > 0;
      pads.visible = padClock.value > 0;
      silk.visible = silkClock.value > 0;
      core.material.color.copy(rawCore).lerp(coreColor, maskClock.value);
      pasteClock.value = between(p, .505, .56);
      paste.visible = p > .505 && p < .895;
      const reflow = between(p, .855, .884);
      paste.material.roughness = .55 - .38 * reflow;
      paste.material.metalness = .58 + .34 * reflow;
      paste.position.y = .00785 - .0003 * reflow;
      paste.material.opacity = 1 - between(p, .884, .895);
      let placed = 0, arriving = 0, current = '';
      for (const placement of placements.values()) {
        const flight = clamp((p - placement.start) / .055);
        if (flight >= 1) placed++;
        else if (flight > 0) { arriving++; current = placement.ref; }
      }
      for (const part of individual) {
        const flight = clamp((p - part.placement.start) / .055);
        part.object.visible = p >= part.placement.start;
        const approach = smooth(flight / .62), landing = smooth((flight - .62) / .38);
        part.object.position.copy(part.base);
        part.object.quaternion.copy(part.quaternion);
        if (flight < 1) {
          part.object.position.x += part.placement.drift[0] * (1 - approach);
          part.object.position.z += part.placement.drift[1] * (1 - approach);
          part.object.position.y += part.placement.lift * (1 - approach) + .035 * (1 - landing);
        }
      }
      const stage = p < .10 ? 'laminate' : p < .29 ? 'etching' : p < .405 ? 'solder-mask' : p < .505 ? 'legend' : p < .565 ? 'solder-paste' : p < .855 ? 'placement' : p < .895 ? 'reflow' : 'assembled';
      return { stage, placed, arriving, current, copper: etchClock.value, mask: maskClock.value, legend: silkClock.value, paste: pasteClock.value, reflow: between(p, .855, .895) };
    }
    return {
      group: model.group,
      update,
      statistics: { components: placements.size, leds: usedLEDs.size, originalMeshes, originalTriangles, maxLEDDistance, pasteApertures: metadata.pasteApertures, fabricationTriangles: layerVertices.length / 9 },
      finalError() { return individual.reduce((error, part) => Math.max(error, part.object.position.distanceTo(part.base), 1 - Math.abs(part.object.quaternion.dot(part.quaternion))), 0); }
    };
  }
  window.V3Manufacturing = Object.freeze({ create, prefetch });
})();
