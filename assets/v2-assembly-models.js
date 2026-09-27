/* Source CAD assemblies for the fullscreen portfolio scene.
 * Contract: Y is up; the board's X/Z centre and bottom face are the origin.
 * All positions, vertices and explode offsets use normalized board units:
 * one unit = max(board width, board depth). group.scale stays (1, 1, 1).
 * span is the assembled bounding-box extent, including protruding connectors.
 * Set part.object.position.copy(part.base).addScaledVector(part.offset, phase).
 * This module owns no renderer, camera, animation loop or page interactions.
 */
(() => {
  'use strict';
  const definitions = {
    telemetry: {
      manifest: '/assets/models/hardware/skylabs-telemetry/assembly.json'
    },
    esp32: {
      model: '/assets/models/framework-esp32/framework-board.glb',
      silk: '/assets/models/framework-esp32/framework-markings-silk.svg',
      width: 26, depth: 30, thickness: 0.6, origin: [140, 142], boardMaterial: 15,
      connector: true, processor: 'U4'
    },
    pi: {
      model: '/assets/models/framework-pi/framework-pi-board.glb',
      silk: '/assets/models/framework-pi/framework-pi-silk-front.svg',
      width: 26, depth: 30, thickness: 0.8, origin: [140, 142], boardMaterial: 18,
      connector: true, processor: 'U5'
    },
    tramtrace: {
      model: '/assets/models/tramtrace/tramtrace-kicad-source.glb',
      silk: '/assets/images/v2/tramtrace-silk.svg',
      width: 207.81, depth: 94.55, thickness: 1.6, origin: [144.055, 102.065], boardMaterial: 28,
      connector: false, processor: 'U3'
    }
  };
  const referencePattern = /^(?:U|Q|R|C|J|P|LED|D|F|L|SW|X|Y)\d+$/;

  function materialsFor(material) {
    return Array.isArray(material) ? material : [material];
  }

  function disposeSource(source) {
    const geometries = new Set(), materials = new Set();
    source.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materialsFor(object.material).forEach(material => materials.add(material));
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }

  function styleMaterials(T, name, definition) {
    const copies = new Map();
    return original => {
      if (copies.has(original.name)) return copies.get(original.name);
      const material = original.clone();
      const index = Number(original.name.replace('mat_', ''));
      const offset = definition.boardMaterial;
      if (index === offset) {
        material.color.setHex(name === 'tramtrace' ? 0xb9bfc1 : 0xc8ac66);
        material.metalness = 0.84; material.roughness = 0.29;
      } else if (index === offset + 2) {
        material.color.setHex(name === 'pi' ? 0x0c4930 : 0x111918).convertSRGBToLinear();
        material.metalness = name === 'pi' ? 0.03 : 0.05;
        material.roughness = name === 'pi' ? 0.53 : 0.42;
        material.transparent = false; material.opacity = 1;
      } else if (index === offset + 3) {
        material.color.setHex(name === 'pi' ? 0x20372b : 0x1a201b).convertSRGBToLinear();
        material.metalness = 0; material.roughness = 0.78;
        material.transparent = false; material.opacity = 1;
      } else {
        const color = material.color;
        const bright = Math.max(color.r, color.g, color.b);
        const neutral = bright - Math.min(color.r, color.g, color.b) < 0.15;
        material.metalness = bright > 0.32 && neutral ? 0.78 : 0.05;
        material.roughness = bright > 0.32 && neutral ? 0.3 : 0.6;
        if (name === 'esp32' && index === 9) {
          material.color.setHex(0x252b29).convertSRGBToLinear();
          material.metalness = 0.02; material.roughness = 0.74;
        } else if ((name === 'esp32' && index === 10) || (name === 'tramtrace' && index === 18)) {
          material.color.setHex(0xadb7b8).convertSRGBToLinear();
          material.metalness = 0.94; material.roughness = 0.36;
        }
      }
      material.envMapIntensity = index === offset + 2 ? 0.035 : material.metalness < 0.2 ? 0.12 : 0.55;
      copies.set(original.name, material);
      return material;
    };
  }

  // KiCad exports separate primitives for individual CAD faces. Bake their
  // transformations and merge by material within a physical reference. The
  // reference itself remains an independent movable group, including all pins.
  function mergeReference(T, roots, base, units, style, hiddenMaterial, forcedMaterial) {
    const group = new T.Group();
    group.position.copy(base);
    const buckets = new Map();
    const normalization = new T.Matrix4().makeTranslation(-base.x, -base.y, -base.z)
      .multiply(new T.Matrix4().makeScale(1 / units, 1 / units, 1 / units));
    for (const root of roots) root.traverseVisible(object => {
      if (!object.isMesh) return;
      const source = object.geometry;
      const geometry = source.index ? source.toNonIndexed() : source.clone();
      geometry.applyMatrix4(normalization.clone().multiply(object.matrixWorld));
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const available = materialsFor(object.material);
      const ranges = Array.isArray(object.material) && geometry.groups.length
        ? geometry.groups
        : [{ start: 0, count: geometry.getAttribute('position').count, materialIndex: 0 }];
      for (const range of ranges) {
        const original = available[range.materialIndex];
        if (!original || original.name === hiddenMaterial) continue;
        const material = forcedMaterial || style(original);
        const key = material.uuid;
        if (!buckets.has(key)) buckets.set(key, { material, chunks: [], count: 0, uv: false, color: false });
        const bucket = buckets.get(key);
        const count = Math.min(range.count, geometry.getAttribute('position').count - range.start);
        const chunk = { count };
        for (const attribute of ['position', 'normal', 'uv', 'color']) {
          const buffer = geometry.getAttribute(attribute);
          if (!buffer) continue;
          // Source CAD attributes are ordinary Float32 arrays. Reading through
          // accessors also supports interleaved data without assuming a stride.
          const width = attribute === 'uv' ? 2 : 3;
          const values = new Float32Array(count * width);
          for (let index = 0; index < count; index += 1) {
            const vertex = range.start + index;
            values[index * width] = buffer.getX(vertex);
            values[index * width + 1] = buffer.getY(vertex);
            if (width === 3) values[index * width + 2] = buffer.getZ(vertex);
          }
          chunk[attribute] = values;
          if (attribute === 'uv' || attribute === 'color') bucket[attribute] = true;
        }
        bucket.chunks.push(chunk); bucket.count += count;
      }
      geometry.dispose();
    });
    for (const bucket of buckets.values()) {
      const geometry = new T.BufferGeometry();
      for (const attribute of ['position', 'normal', ...(bucket.uv ? ['uv'] : []), ...(bucket.color ? ['color'] : [])]) {
        const width = attribute === 'uv' ? 2 : 3;
        const merged = new Float32Array(bucket.count * width);
        let offset = 0;
        for (const chunk of bucket.chunks) {
          if (chunk[attribute]) merged.set(chunk[attribute], offset);
          else if (attribute === 'color') merged.fill(1, offset, offset + chunk.count * width);
          offset += chunk.count * width;
        }
        geometry.setAttribute(attribute, new T.BufferAttribute(merged, width));
      }
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new T.Mesh(geometry, bucket.material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  function explodeOffset(T, name, ref, base, definition) {
    if (name === 'tramtrace') {
      if (ref.startsWith('LED')) return new T.Vector3(0, 0.1, 0);
      if (ref === 'J1') return new T.Vector3(0, 0.1, 0.07);
      const lift = ref.startsWith('U') ? 0.13 : 0.08;
      return new T.Vector3(Math.sign(base.x) * 0.008, lift, 0.008);
    }
    if (ref === 'P1') return new T.Vector3(0, 0.15, -0.25);
    if (ref === definition.processor) return new T.Vector3(0, 0.32, 0);
    const lift = ref.startsWith('U') ? 0.2 : ref.startsWith('SW') ? 0.15 : 0.1;
    return new T.Vector3(Math.sign(base.x) * 0.025, lift, Math.sign(base.z) * 0.015);
  }

  function makeSilk(T, definition, texture, units) {
    let geometry;
    if (definition.connector) {
      const shape = new T.Shape();
      shape.moveTo(-13, -15); shape.lineTo(13, -15); shape.lineTo(13, 15); shape.lineTo(-13, 15); shape.closePath();
      for (const x of [-11.3, 11.3]) {
        const hole = new T.Path(); hole.absarc(x, -4.5, definition.thickness === 0.8 ? 1.1 : 1.05, 0, Math.PI * 2, true); shape.holes.push(hole);
      }
      geometry = new T.ShapeGeometry(shape, 32);
      const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i += 1) uv.setXY(i, (positions.getX(i) + 13) / 26, (positions.getY(i) + 15) / 30);
    } else geometry = new T.PlaneGeometry(definition.width, definition.depth);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, definition.thickness + 0.02, 0);
    geometry.scale(1 / units, 1 / units, 1 / units);
    texture.encoding = T.sRGBEncoding;
    // Four is supported by the browsers targeted by the existing studio and
    // keeps lettering legible at oblique angles without requiring a renderer.
    texture.anisotropy = 4;
    const material = new T.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.04, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, side: T.DoubleSide });
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'Silkscreen'; mesh.receiveShadow = true;
    return mesh;
  }

  // The hero lifts each side's passive parts together. Merge only groups with
  // the same displacement; their original geometry and assembled positions stay
  // exact. The standalone inspector keeps every reference individually selectable.
  function batchHeroPassives(T, assembly) {
    const batches = new Map();
    assembly.group.updateMatrixWorld(true);
    assembly.group.userData.componentCount = assembly.parts.length;
    for (const part of assembly.parts) {
      if (!/^[RC]\d+$/.test(part.ref)) continue;
      const key = part.offset.toArray().join(',');
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(part);
    }
    for (const parts of batches.values()) {
      if (parts.length < 2) continue;
      const base = new T.Vector3();
      const object = mergeReference(T, parts.map(part => part.object), base, 1, material => material, '');
      object.name = parts[0].offset.y < 0 ? 'Back passives' : 'Front passives';
      object.userData.componentRefs = parts.map(part => part.ref);
      for (const part of parts) {
        assembly.group.remove(part.object);
        part.object.traverse(node => node.geometry?.dispose());
      }
      assembly.group.add(object);
      const removed = new Set(parts);
      assembly.parts = assembly.parts.filter(part => !removed.has(part));
      assembly.parts.push({ object, base, offset: parts[0].offset.clone() });
    }
    return assembly;
  }

  async function load(name) {
    const T = window.THREE, definition = definitions[name];
    if (!T?.GLTFLoader) throw new Error('V2AssemblyModels requires THREE and GLTFLoader');
    if (!definition) throw new Error(`Unknown assembly: ${name}`);
    if (definition.manifest) {
      if (!window.V2HardwareModels) throw new Error('Shared hardware model factory unavailable');
      const assembly = await window.V2HardwareModels.load(definition.manifest);
      assembly.group.name = name;
      return batchHeroPassives(T, assembly);
    }
    const loader = new T.GLTFLoader();
    const loadGLB = path => new Promise((resolve, reject) => loader.load(path, gltf => resolve(gltf.scene), undefined, reject));
    const loadTexture = path => new Promise((resolve, reject) => new T.TextureLoader().load(path, resolve, undefined, reject));
    const [source, texture, connectorSource] = await Promise.all([
      loadGLB(definition.model), loadTexture(definition.silk),
      definition.connector ? loadGLB('/assets/models/framework-esp32/framework-usbc.glb') : Promise.resolve(null)
    ]);
    const units = Math.max(definition.width, definition.depth);
    source.scale.setScalar(1000);
    source.position.set(-definition.origin[0], 0, -definition.origin[1]);
    source.updateMatrixWorld(true);
    const group = new T.Group(); group.name = name;
    const parts = [], physicalRoots = [], staticRoots = [];
    const style = styleMaterials(T, name, definition);
    const exportedRoot = source.children.length === 1 ? source.children[0] : source;
    for (const child of exportedRoot.children) {
      if (referencePattern.test(child.name)) {
        if (name !== 'tramtrace' || child.name !== 'C83') physicalRoots.push(child);
      } else staticRoots.push(child);
    }
    if (!physicalRoots.length) throw new Error(`${name}: no named physical component groups found`);
    const surface = mergeReference(T, staticRoots, new T.Vector3(), units, style, `mat_${definition.boardMaterial + 1}`);
    surface.name = 'PCB'; group.add(surface);
    // All station LEDs share one rigid lift in the hero. Merging their source
    // faces together retains the exact placements while avoiding hundreds of
    // repeated material draw calls.
    const ledRoots = name === 'tramtrace' ? physicalRoots.filter(root => root.name.startsWith('LED')) : [];
    const independentRoots = ledRoots.length ? physicalRoots.filter(root => !root.name.startsWith('LED')) : physicalRoots;
    for (const root of independentRoots) {
      const base = new T.Vector3().setFromMatrixPosition(root.matrixWorld).divideScalar(units);
      const object = mergeReference(T, [root], base, units, style, `mat_${definition.boardMaterial + 1}`);
      object.name = root.name; object.userData.partRef = root.name;
      group.add(object);
      parts.push({ object, base: base.clone(), offset: explodeOffset(T, name, root.name, base, definition) });
    }
    if (ledRoots.length) {
      const base = new T.Vector3();
      const object = mergeReference(T, ledRoots, base, units, style, `mat_${definition.boardMaterial + 1}`);
      object.name = 'LED bank'; object.userData.partRef = 'LED bank';
      object.userData.componentRefs = ledRoots.map(root => root.name);
      group.add(object);
      parts.push({ object, base, offset: new T.Vector3(0, 0.1, 0) });
    }
    group.add(makeSilk(T, definition, texture, units));
    if (connectorSource) {
      const plug = connectorSource.getObjectByName('P1');
      if (!plug) throw new Error(`${name}: exact P1 connector geometry missing`);
      if (plug.parent) plug.parent.remove(plug);
      plug.position.set(0, definition.thickness, -16.4);
      plug.rotation.set(-Math.PI / 2, 0, 0); plug.scale.setScalar(1000);
      plug.updateMatrixWorld(true);
      const base = plug.position.clone().divideScalar(units);
      const metal = new T.MeshStandardMaterial({ color: new T.Color(0xa4adaf).convertSRGBToLinear(), metalness: 0.94, roughness: 0.27, envMapIntensity: 0.65, side: T.DoubleSide });
      const object = mergeReference(T, [plug], base, units, style, '', metal);
      object.name = 'P1'; object.userData.partRef = 'P1'; group.add(object);
      parts.push({ object, base: base.clone(), offset: explodeOffset(T, name, 'P1', base, definition) });
      disposeSource(plug); disposeSource(connectorSource);
    }
    disposeSource(source);
    group.updateMatrixWorld(true);
    const size = new T.Box3().setFromObject(group).getSize(new T.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    group.userData.boardUnitsMm = units;
    group.userData.boardSizeMm = [definition.width, definition.thickness, definition.depth];
    group.userData.componentCount = parts.length;
    return { group, parts, span };
  }
  window.V2CadGeometry = Object.freeze({ mergeReference, disposeSource });
  window.V2AssemblyModels = Object.freeze({ load });
})();
