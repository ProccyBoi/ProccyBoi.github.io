/* Lossless render-ready hero assemblies, baked from the source CAD factories. */
(() => {
  'use strict';
  const names = new Set(['tramtrace', 'telemetry', 'pi']);
  const pending = new Map();
  function prefetch(name) {
    if (!names.has(name)) return Promise.reject(new Error('Unknown hero assembly: ' + name));
    if (!pending.has(name)) pending.set(name, fetch('/assets/models/hero/' + name + '.bin' + (window.DecompressionStream ? '.gz' : '')).then(async response => {
      if (!response.ok) throw new Error('Hero assembly unavailable');
      const bytes = await response.arrayBuffer();
      const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      // Explicit gzip keeps delivery small regardless of the host's MIME
      // compression policy. Browsers without native decompression use .bin.
      if (signature[0] === 31 && signature[1] === 139) return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      return bytes;
    }));
    return pending.get(name);
  }
  async function load(name) {
    const buffer = await prefetch(name), T = window.THREE;
    if (!T?.BufferGeometry) throw new Error('Hero assets require THREE');
    const view = new DataView(buffer), magic = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(7, buffer.byteLength)));
    if (magic !== 'V2HERO1' || buffer.byteLength < 16) throw new Error('Invalid hero assembly');
    const headerBytes = view.getUint32(8, true), dataStart = view.getUint32(12, true);
    if (dataStart % 4 || headerBytes > dataStart - 16 || dataStart > buffer.byteLength) throw new Error('Invalid hero assembly header');
    const data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, headerBytes)), (key, value) => value?.$negativeZero === true ? -0 : value);
    if (data.version !== 1) throw new Error('Unsupported hero assembly version');
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
      const texture = await new Promise((resolve, reject) => new T.TextureLoader().load(item.url, resolve, undefined, reject));
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
