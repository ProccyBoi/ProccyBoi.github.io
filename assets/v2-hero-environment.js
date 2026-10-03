/* The existing studio light, prefiltered once and stored without losing texels. */
(() => {
  'use strict';
  let pending;
  function prefetch() {
    pending ||= fetch('/assets/models/hero/environment.bin' + (window.DecompressionStream ? '.gz' : '')).then(async response => {
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
