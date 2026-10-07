/* Lossless render-ready hero assemblies, baked from the source CAD factories. */
(() => {
  'use strict';
  const names = new Set(['tramtrace', 'telemetry', 'pi']);
  const versions = {pi:'mechanics-20261003'};
  // These are the original textures recorded in the lossless packs. Discover
  // them before the geometry arrives, rather than adding a network round trip
  // after decompression and index restoration. The pack remains authoritative.
  const textureSources = {
    tramtrace:['/assets/images/v2/tramtrace-silk.svg'],
    telemetry:['/assets/models/hardware/skylabs-telemetry/silk-front.svg', '/assets/models/hardware/skylabs-telemetry/silk-back.svg'],
    pi:['/assets/models/framework-pi/framework-pi-silk-front.svg']
  };
  const pending = new Map();
  const headers = new Map(), images = new Map();
  function header(buffer) {
    if (buffer.byteLength < 16) throw new Error('Invalid hero assembly');
    const view = new DataView(buffer), magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 7));
    if (magic !== 'V2HERO1') throw new Error('Invalid hero assembly');
    const headerBytes = view.getUint32(8, true), dataStart = view.getUint32(12, true);
    if (dataStart % 4 || headerBytes > dataStart - 16 || dataStart > buffer.byteLength) throw new Error('Invalid hero assembly header');
    const data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, headerBytes)), (key, value) => value?.$negativeZero === true ? -0 : value);
    if (data.version !== 1) throw new Error('Unsupported hero assembly version');
    return {data, dataStart};
  }
  function image(url) {
    if (!images.has(url)) images.set(url, new Promise((resolve, reject) => {
      const bitmap = new Image(); bitmap.crossOrigin = 'anonymous';
      bitmap.onload = () => resolve(bitmap); bitmap.onerror = reject; bitmap.src = url;
    }));
    return images.get(url);
  }
  async function transport(buffer) {
    const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(7, buffer.byteLength)));
    if (magic !== 'V2HIDX1') return {buffer, ...header(buffer)};
    if (buffer.byteLength < 32 || new DataView(buffer).getUint32(8, true) !== buffer.byteLength - 16) throw new Error('Invalid hero transport');
    const restored = buffer.slice(16), parsed = header(restored);
    const source = new Uint8Array(buffer, 16), target = new Uint8Array(restored);
    let sliceStarted = performance.now();
    for (const geometry of parsed.data.geometries) {
      const index = geometry.index, width = index.arrayType === 'Uint16Array' ? 2 : index.arrayType === 'Uint32Array' ? 4 : 0;
      const start = parsed.dataStart + index.byteOffset, count = index.byteLength / width;
      if (!width || !Number.isInteger(count) || start < parsed.dataStart || start + index.byteLength > restored.byteLength) throw new Error('Invalid hero index transport');
      for (let chunk = 0; chunk < count; chunk += 65536) {
        const end = Math.min(count, chunk + 65536);
        for (let i = chunk; i < end; i++) {
          target[start + i*width] = source[start + i];
          target[start + i*width + 1] = source[start + count + i];
          if (width === 4) {
            target[start + i*width + 2] = source[start + count*2 + i];
            target[start + i*width + 3] = source[start + count*3 + i];
          }
        }
        if (performance.now() - sliceStarted > 8) {
          await new Promise(resolve => setTimeout(resolve, 0));
          sliceStarted = performance.now();
        }
      }
    }
    return {buffer:restored, ...parsed};
  }
  function prefetch(name) {
    if (!names.has(name)) return Promise.reject(new Error('Unknown hero assembly: ' + name));
    textureSources[name].forEach(url => image(url).catch(() => {}));
    if (!pending.has(name)) pending.set(name, fetch('/assets/models/hero/' + name + (window.DecompressionStream ? '.idx.bin.gz' : '.bin') + (versions[name] ? '?v=' + versions[name] : '')).then(async response => {
      if (!response.ok) throw new Error('Hero assembly unavailable');
      const bytes = await response.arrayBuffer();
      const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      // Explicit gzip keeps delivery small regardless of the host's MIME
      // compression policy. Browsers without native decompression use .bin.
      return signature[0] === 31 && signature[1] === 139 ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : bytes;
    }).then(transport).then(({buffer, ...parsed}) => {
      headers.set(name, parsed);
      // Fetch the original full-resolution silk images while the renderer is
      // still starting. Loading a texture later reuses these same Image objects.
      parsed.data.textures.forEach(item => image(item.url).catch(() => {}));
      return buffer;
    }));
    return pending.get(name);
  }
  async function load(name) {
    const buffer = await prefetch(name), T = window.THREE;
    if (!T?.BufferGeometry) throw new Error('Hero assets require THREE');
    const {data, dataStart} = headers.get(name);
    const textures = [];
    const decode = value => {
      if (value === null || typeof value !== 'object') return value;
      if (value.$texture !== undefined) return textures[value.$texture];
      if (value.$type === 'Number') return Number(value.value);
      if (value.$type) {
        if (!['Color', 'Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Euler', 'Matrix3', 'Matrix4'].includes(value.$type)) throw new Error('Unsupported hero property');
        return new T[value.$type]().fromArray(value.value);
      }
      if (Array.isArray(value)) return value.map(decode);
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
    };
    await Promise.all(data.textures.map(async (item, index) => {
      const texture = new T.Texture(await image(item.url));
      Object.assign(texture, decode(item.properties)); texture.needsUpdate = true;
      textures[index] = texture;
    }));
    const materials = data.materials.map(item => {
      if (!['MeshStandardMaterial', 'MeshBasicMaterial', 'MeshPhysicalMaterial'].includes(item.type)) throw new Error('Unsupported hero material');
      const material = new T[item.type](); Object.assign(material, decode(item.properties)); return material;
    });
    function attribute(item) {
      if (!['Float32Array', 'Float64Array', 'Uint32Array', 'Uint16Array', 'Uint8Array', 'Int32Array', 'Int16Array', 'Int8Array'].includes(item.arrayType)) throw new Error('Unsupported hero attribute');
      const Constructor = window[item.arrayType], offset = dataStart + item.byteOffset;
      if (offset < dataStart || offset + item.byteLength > buffer.byteLength || offset % Constructor.BYTES_PER_ELEMENT) throw new Error('Invalid hero geometry range');
      return new T.BufferAttribute(new Constructor(buffer, offset, item.byteLength / Constructor.BYTES_PER_ELEMENT), item.itemSize || 1, Boolean(item.normalized));
    }
    const geometries = data.geometries.map(item => {
      const geometry = new T.BufferGeometry(); geometry.name = item.name;
      Object.entries(item.attributes).forEach(([name, value]) => geometry.setAttribute(name, attribute(value)));
      geometry.setIndex(attribute(item.index)); geometry.groups = decode(item.groups); geometry.drawRange = decode(item.drawRange); geometry.userData = decode(item.userData);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
    });
    const nodes = data.nodes.map(item => {
      const material = Array.isArray(item.material) ? item.material.map(index => materials[index]) : materials[item.material];
      const object = item.type === 'Mesh' ? new T.Mesh(geometries[item.geometry], material) : new T.Group();
      object.name = item.name; object.rotation.order = item.rotationOrder; object.position.fromArray(item.position); object.quaternion.fromArray(item.quaternion); object.scale.fromArray(item.scale);
      object.matrixAutoUpdate = item.matrixAutoUpdate; object.matrix.fromArray(item.matrix);
      for (const key of ['visible', 'castShadow', 'receiveShadow', 'frustumCulled', 'renderOrder']) object[key] = item[key];
      object.layers.mask = item.layers; object.userData = decode(item.userData); return object;
    });
    data.nodes.forEach((item, index) => item.children.forEach(child => nodes[index].add(nodes[child])));
    const parts = data.parts.map(item => ({...decode(item), object:nodes[item.object]}));
    nodes[0].updateMatrixWorld(true);
    return {...decode(data.extra), group:nodes[0], parts};
  }
  window.V2HeroAssets = Object.freeze({prefetch, load});
})();
