/* Photographic studio response, with the HDR light prefiltered once for startup. */
(() => {
  'use strict';
  function createEnvironment(T, renderer) {
    const room = new T.Scene(); room.background = new T.Color(.025, .029, .034);
    // Softboxes have a direction and a dark room between them. Their reflected
    // edges describe plated pins and connector shells without bleaching masks.
    [[0xfff6e8, 3.8, [-5, 7, 5], [6, 9]], [0xd5e4ff, 2.1, [7, 3, 1], [3, 10]], [0xffffff, 2.8, [1, -3, -6], [3, 7]]].forEach(([color, power, position, size]) => {
      const material = new T.MeshBasicMaterial({color, side:T.DoubleSide}); material.color.multiplyScalar(power);
      const panel = new T.Mesh(new T.PlaneGeometry(...size), material);
      panel.position.set(...position); panel.lookAt(0, 0, 0); room.add(panel);
    });
    const pmrem = new T.PMREMGenerator(renderer), environment = pmrem.fromScene(room, .06);
    pmrem.dispose(); room.traverse(object => {object.geometry?.dispose(); object.material?.dispose();});
    return environment;
  }
  function configureRenderer(renderer, T = window.THREE) {
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .94;
  }
  function createLights(T, scene) {
    scene.add(new T.HemisphereLight(0xe8edf2, 0x363c3d, .16));
    const light = (color, power, x, y, z) => {
      const lamp = new T.DirectionalLight(color, power); lamp.position.set(x, y, z); scene.add(lamp); return lamp;
    };
    const key = light(0xfff5e8, 1.05, -3, 6, 12);
    light(0xc8dbf5, .24, 8, 1, 4); light(0xffffff, .48, -5, -3, -2);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    // At the hero's six-unit CAD scale this clears inclined-face shadow acne
    // while retaining contact beneath the small packages and connector pins.
    key.shadow.bias = -.00015; key.shadow.normalBias = .0042;
    key.userData.direction = key.position.clone().normalize(); scene.add(key.target);
    return {key};
  }
  function applyMaterials(model, name, T = window.THREE) {
    if (model.group.userData.productStudio) return;
    const maskName = {tramtrace:'mat_30', telemetry:'mat_48', pi:'mat_20'}[name];
    const coreName = {tramtrace:'mat_31', telemetry:'mat_49', pi:'mat_21'}[name];
    const copies = new Map();
    const finish = (original, enclosure) => {
      if (!original.isMeshStandardMaterial) return original;
      if (copies.has(original)) return copies.get(original);
      const mask = original.name === maskName;
      let material;
      if (mask || enclosure) {
        material = new T.MeshPhysicalMaterial();
        // Standard.copy preserves every map, alpha setting and source colour;
        // Physical.copy expects physical-only fields absent in the CAD export.
        T.MeshStandardMaterial.prototype.copy.call(material, original);
        material.defines = {...material.defines, PHYSICAL:''};
        material.clearcoat = enclosure ? .85 : .24;
        material.clearcoatRoughness = enclosure ? .16 : .3;
      } else material = original.clone();
      if (enclosure) {
        material.metalness = 0; material.roughness = .22;
        material.envMapIntensity = .8;
      } else if (mask) {
        material.metalness = 0; material.roughness = .47;
        material.envMapIntensity = .36;
      } else if (original.map) {
        material.roughness = .85; material.envMapIntensity = .16;
      } else if (original.name === coreName) {
        material.roughness = .86; material.envMapIntensity = .12;
      } else if (original.metalness > .5) {
        material.metalness = Math.max(.88, original.metalness);
        material.roughness = Math.min(.34, Math.max(.25, original.roughness));
        material.envMapIntensity = 1.1;
      } else {
        material.metalness = 0; material.roughness = .72;
        material.envMapIntensity = .2;
      }
      copies.set(original, material); return material;
    };
    model.group.traverse(object => {
      if (!object.isMesh) return;
      const enclosure = object.name === 'Enclosure';
      object.material = Array.isArray(object.material) ? object.material.map(material => finish(material, enclosure)) : finish(object.material, enclosure);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      // The thin exported coating is coplanar with the board. Casting it as
      // another solid shell self-occludes the entire mask in the depth map.
      // The physical core still casts, and the mask receives component shadows.
      if (materials.every(material => material.name === maskName)) object.castShadow = false;
    });
    model.group.userData.productStudio = true;
  }
  window.V2ProductStudio = Object.freeze({createEnvironment, configureRenderer, createLights, applyMaterials});
  let pending;
  function prefetch() {
    pending ||= fetch('/assets/models/hero/environment.bin' + (window.DecompressionStream ? '.gz' : '') + '?v=product-20261007').then(async response => {
      if (!response.ok) throw new Error('Hero environment unavailable');
      const bytes = await response.arrayBuffer(), signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      if (signature[0] === 31 && signature[1] === 139) return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      return bytes;
    });
    return pending;
  }
  async function load(T = window.THREE) {
    const buffer = await prefetch();
    if (!T?.DataTexture || buffer.byteLength < 16) throw new Error('Invalid hero environment');
    const view = new DataView(buffer), magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 7));
    const headerBytes = view.getUint32(8, true), dataStart = view.getUint32(12, true);
    if (magic !== 'V2HENV1' || dataStart % 4 || headerBytes > dataStart - 16 || dataStart > buffer.byteLength) throw new Error('Invalid hero environment header');
    const data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, headerBytes)));
    if (data.version !== 1 || data.threeRevision !== T.REVISION || data.arrayType !== 'Uint8Array' || data.type !== T.UnsignedByteType || data.format !== T.RGBAFormat || data.encoding !== T.RGBEEncoding || data.mapping !== T.CubeUVReflectionMapping || data.width !== 768 || data.height !== 768 || buffer.byteLength - dataStart !== data.width * data.height * 4) throw new Error('Unsupported hero environment');
    const texture = new T.DataTexture(new Uint8Array(buffer, dataStart), data.width, data.height, data.format, data.type);
    for (const key of ['mapping', 'encoding', 'minFilter', 'magFilter', 'wrapS', 'wrapT', 'generateMipmaps']) texture[key] = data[key];
    // Readback and typed-array upload both start at the lower-left texel.
    texture.flipY = false; texture.needsUpdate = true;
    return texture;
  }
  window.V2HeroEnvironment = Object.freeze({prefetch, load});
})();
