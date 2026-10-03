/* Bake the existing hero factories into lossless, directly renderable packs.
 * No tessellation, quantization, material changes or texture resizing occurs.
 * Run with the local site serving on V2_BASE_URL (default localhost:8080).
 * --verify checks committed packs against freshly evaluated source factories.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'assets/models/hero');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const names = ['tramtrace', 'telemetry', 'pi'];
const verifyOnly = process.argv.includes('--verify');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// This serializer is also used on reconstructed packs, so parity covers the
// actual runtime objects rather than only the build script's intermediate data.
function captureAssembly(assembly) {
  assembly.group.updateMatrixWorld(true);
  const materials = [], textures = [], geometries = [], nodes = [];
  const materialIds = new Map(), textureIds = new Map(), geometryIds = new Map(), nodeIds = new Map();
  const encode = value => {
    if (value === undefined || typeof value === 'function') return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : {$type:'Number', value:String(value)};
    for (const type of ['Color', 'Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Euler', 'Matrix3', 'Matrix4']) {
      if (value['is' + type]) return {$type:type, value:value.toArray()};
    }
    if (value.isTexture) return {$texture:textureId(value)};
    if (Array.isArray(value)) return value.map(encode);
    if (typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => !key.startsWith('_')).map(key => [key, encode(value[key])]).filter(([, item]) => item !== undefined));
    throw new Error('Unsupported property');
  };
  const properties = (object, skip) => Object.fromEntries(Object.keys(object).sort().filter(key => !key.startsWith('_') && !skip.has(key)).map(key => [key, encode(object[key])]).filter(([, value]) => value !== undefined));
  function textureId(texture) {
    if (textureIds.has(texture)) return textureIds.get(texture);
    const id = textures.length; textureIds.set(texture, id);
    const image = texture.image;
    if (!image?.src) throw new Error('Hero texture must have an original image URL');
    const url = new URL(image.src, location.href);
    if (url.origin !== location.origin) throw new Error('Unexpected external hero texture');
    textures.push({url:url.pathname, width:image.naturalWidth || image.width, height:image.naturalHeight || image.height,
      properties:properties(texture, new Set(['id', 'uuid', 'version', 'image', 'source', 'mipmaps', 'onUpdate']))});
    return id;
  }
  function materialId(material) {
    if (materialIds.has(material)) return materialIds.get(material);
    const id = materials.length; materialIds.set(material, id);
    const item = {type:material.type}; materials.push(item);
    item.properties = properties(material, new Set(['id', 'uuid', 'version', 'type', 'onBeforeCompile']));
    return id;
  }
  function rawArray(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    let binary = '';
    for (let start = 0; start < bytes.length; start += 16384) binary += String.fromCharCode(...bytes.subarray(start, start + 16384));
    return {arrayType:array.constructor.name, bytes:btoa(binary)};
  }
  function geometryId(geometry) {
    if (geometryIds.has(geometry)) return geometryIds.get(geometry);
    if (Object.keys(geometry.morphAttributes).length) throw new Error('Unexpected hero morph attributes');
    const id = geometries.length; geometryIds.set(geometry, id);
    const attributes = Object.fromEntries(Object.keys(geometry.attributes).sort().map(name => {
      const attribute = geometry.attributes[name];
      if (attribute.isInterleavedBufferAttribute) throw new Error('Unexpected interleaved output geometry');
      return [name, {...rawArray(attribute.array), itemSize:attribute.itemSize, normalized:attribute.normalized}];
    }));
    geometries.push({name:geometry.name, attributes, index:geometry.index ? rawArray(geometry.index.array) : null,
      groups:encode(geometry.groups), drawRange:encode(geometry.drawRange), userData:encode(geometry.userData)});
    return id;
  }
  function visit(object) {
    const id = nodes.length; nodeIds.set(object, id);
    const node = {type:object.isMesh ? 'Mesh' : 'Group', name:object.name, position:object.position.toArray(),
      quaternion:object.quaternion.toArray(), rotationOrder:object.rotation.order, scale:object.scale.toArray(),
      matrixAutoUpdate:object.matrixAutoUpdate, matrix:object.matrix.toArray(), visible:object.visible,
      castShadow:object.castShadow, receiveShadow:object.receiveShadow, frustumCulled:object.frustumCulled,
      renderOrder:object.renderOrder, layers:object.layers.mask, userData:encode(object.userData), children:[]};
    nodes.push(node);
    if (object.isMesh) {
      node.geometry = geometryId(object.geometry);
      node.material = Array.isArray(object.material) ? object.material.map(materialId) : materialId(object.material);
    }
    node.children = object.children.map(visit);
    return id;
  }
  visit(assembly.group);
  const parts = assembly.parts.map(part => ({...Object.fromEntries(Object.entries(part).filter(([key]) => key !== 'object').map(([key, value]) => [key, encode(value)])), object:nodeIds.get(part.object)}));
  const extra = Object.fromEntries(Object.entries(assembly).filter(([key]) => key !== 'group' && key !== 'parts').map(([key, value]) => [key, encode(value)]));
  return {version:1, nodes, geometries, materials, textures, parts, extra};
}

function expandGeometry(geometry) {
  const arrays = Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, Buffer.from(attribute.bytes, 'base64')]));
  const count = geometry.index ? Buffer.from(geometry.index.bytes, 'base64').byteLength / globalThis[geometry.index.arrayType].BYTES_PER_ELEMENT : arrays.position.byteLength / (geometry.attributes.position.itemSize * globalThis[geometry.attributes.position.arrayType].BYTES_PER_ELEMENT);
  const sourceIndices = geometry.index ? (() => {const bytes = Buffer.from(geometry.index.bytes, 'base64'); return new globalThis[geometry.index.arrayType](bytes.buffer, bytes.byteOffset, count);})() : null;
  return Object.fromEntries(Object.entries(arrays).map(([name, bytes]) => {
    const attribute = geometry.attributes[name], stride = attribute.itemSize * globalThis[attribute.arrayType].BYTES_PER_ELEMENT;
    const expanded = Buffer.allocUnsafe(count * stride);
    for (let i = 0; i < count; i++) bytes.copy(expanded, i * stride, (sourceIndices ? sourceIndices[i] : i) * stride, ((sourceIndices ? sourceIndices[i] : i) + 1) * stride);
    return [name, expanded];
  }));
}
function canonical(capture) {
  return {...capture, geometries:capture.geometries.map(geometry => ({...geometry, index:undefined,
    attributes:Object.fromEntries(Object.entries(expandGeometry(geometry)).map(([name, bytes]) => [name, {...geometry.attributes[name], bytes:undefined, expandedBytes:bytes.byteLength, sha256:hash(bytes)}]))}))};
}
function compactGeometry(geometry) {
  const expanded = expandGeometry(geometry), attributes = Object.entries(geometry.attributes);
  const strides = attributes.map(([, attribute]) => attribute.itemSize * globalThis[attribute.arrayType].BYTES_PER_ELEMENT);
  const count = expanded.position.length / strides[attributes.findIndex(([name]) => name === 'position')];
  const tuple = Buffer.alloc(strides.reduce((a,b) => a+b, 0)), unique = new Map(), vertexIndices = [], indices = [];
  for (let i = 0; i < count; i++) {
    let offset = 0;
    attributes.forEach(([name], j) => { expanded[name].copy(tuple, offset, i * strides[j], (i+1)*strides[j]); offset += strides[j]; });
    const key = tuple.toString('base64');
    let index = unique.get(key);
    if (index === undefined) { index = unique.size; unique.set(key, index); vertexIndices.push(i); }
    indices.push(index);
  }
  const indexArray = unique.size <= 65535 ? new Uint16Array(indices) : new Uint32Array(indices);
  const compact = {...geometry, attributes:Object.fromEntries(attributes.map(([name, attribute], j) => {
    const bytes = Buffer.allocUnsafe(unique.size * strides[j]);
    vertexIndices.forEach((vertex, i) => expanded[name].copy(bytes, i*strides[j], vertex*strides[j], (vertex+1)*strides[j]));
    return [name, {...attribute, bytes:bytes.toString('base64')}];
  })), index:{arrayType:indexArray.constructor.name, bytes:Buffer.from(indexArray.buffer).toString('base64')}};
  assert.deepEqual(canonical({geometries:[compact]}), canonical({geometries:[geometry]}), 'Exact expanded triangle attributes must survive vertex indexing');
  return compact;
}
function pack(capture) {
  const chunks = []; let offset = 0;
  function append(array) {
    const bytes = Buffer.from(array.bytes, 'base64'), padding = (4 - bytes.length % 4) % 4;
    const descriptor = {...array, bytes:undefined, byteOffset:offset, byteLength:bytes.length};
    chunks.push(bytes, Buffer.alloc(padding)); offset += bytes.length + padding;
    return descriptor;
  }
  const header = {...capture, geometries:capture.geometries.map(compactGeometry).map(geometry => ({...geometry,
    attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, append(attribute)])), index:append(geometry.index)}))};
  const json = Buffer.from(JSON.stringify(header, (key, value) => Object.is(value, -0) ? {$negativeZero:true} : value)), padded = Buffer.alloc(Math.ceil(json.length/4)*4); json.copy(padded);
  const prefix = Buffer.alloc(16); prefix.write('V2HERO1'); prefix.writeUInt32LE(json.length, 8); prefix.writeUInt32LE(padded.length + 16, 12);
  return Buffer.concat([prefix, padded, ...chunks]);
}
async function main() {
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE || undefined, args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const report = {format:1, sourceHashNormalization:'utf8-lf', preservation:'Exact expanded triangle attribute bytes, materials, textures, transforms, reference metadata and source motion', models:{}, sources:{}};
  try {
    const page = await browser.newPage();
    // A blank same-origin surface avoids mounting the hero or any renderer.
    await page.route(base + '/v2/render/', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Hero asset build</title>'}));
    await page.goto(base + '/v2/render/', {waitUntil:'domcontentloaded'});
    for (const url of ['/assets/vendor/three.min.js', '/assets/vendor/GLTFLoader.js', '/assets/v2-assembly-models.js', '/assets/v2-hardware-models.js', '/assets/v2-hero-assets.js']) await page.addScriptTag({url:base + url});
    await page.evaluate('window.__captureHero = ' + captureAssembly.toString());
    for (const name of names) {
      console.log('Capturing source factory:', name);
      const source = await page.evaluate(async name => {const assembly = await window.V2AssemblyModels.load(name); window.__sourceAssembly = assembly; return window.__captureHero(assembly);}, name);
      const filepath = path.join(output, name + '.bin');
      if (!verifyOnly) {
        const bytes = pack(source); fs.writeFileSync(filepath, bytes); fs.writeFileSync(filepath + '.gz', zlib.gzipSync(bytes, {level:9}));
      }
      const restored = await page.evaluate(async name => {const assembly = await window.V2HeroAssets.load(name); const capture = window.__captureHero(assembly); for (const group of [assembly.group, window.__sourceAssembly.group]) group.traverse(node => {node.geometry?.dispose();}); return capture;}, name);
      assert.deepEqual(canonical(restored), canonical(source), name + ': runtime reconstruction must match exact source factory output');
      const bytes = fs.readFileSync(filepath);
      const triangles = source.geometries.reduce((sum, geometry) => sum + expandGeometry(geometry).position.length / (geometry.attributes.position.itemSize * globalThis[geometry.attributes.position.arrayType].BYTES_PER_ELEMENT * 3), 0);
      const compressed = fs.readFileSync(filepath + '.gz');
      assert.deepEqual(zlib.gunzipSync(compressed), bytes, 'Gzip and plain delivery must reconstruct identical bytes');
      report.models[name] = {url:'/assets/models/hero/' + name + '.bin', compressedUrl:'/assets/models/hero/' + name + '.bin.gz', bytes:bytes.length, gzipBytes:compressed.length, sha256:hash(bytes), parts:source.parts.length, meshes:source.nodes.filter(node => node.type === 'Mesh').length, triangles, textures:source.textures.map(texture => texture.url), paritySha256:hash(Buffer.from(JSON.stringify(canonical(source))))};
      console.log(name + ': exact runtime parity passed; ' + bytes.length + ' bytes, ' + report.models[name].gzipBytes + ' gzip bytes; ' + triangles + ' triangles');
    }
    const sources = ['assets/v2-assembly-models.js', 'assets/v2-hardware-models.js', 'assets/vendor/three.min.js', 'assets/vendor/GLTFLoader.js',
      'assets/models/tramtrace/tramtrace-kicad-source.glb', 'assets/images/v2/tramtrace-silk.svg',
      'assets/models/framework-pi/framework-pi-board.glb', 'assets/models/framework-pi/framework-pi-silk-front.svg', 'assets/models/framework-esp32/framework-usbc.glb',
      'assets/models/hardware/skylabs-telemetry/assembly.json'];
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'assets/models/hardware/skylabs-telemetry/assembly.json')));
    sources.push(metadata.modelUrl.slice(1), metadata.silk.frontUrl.slice(1), metadata.silk.backUrl.slice(1));
    // The exact USB-C plug is loaded separately by the Pi factory.
    const factory = fs.readFileSync(path.join(root, 'assets/v2-assembly-models.js'), 'utf8');
    for (const match of factory.matchAll(/['"](\/assets\/[^'"]+\.glb)['"]/g)) if (/connector/.test(match[1])) sources.push(match[1].slice(1));
    for (const source of [...new Set(sources)].sort()) {
      const bytes = fs.readFileSync(path.join(root, source));
      report.sources[source] = hash(/\.(js|json|svg)$/.test(source) ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes);
    }
    if (!verifyOnly) fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
    else assert.deepEqual(report, JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'))), 'Committed provenance must match freshly verified source');
    console.log('All hero packs preserve source geometry and appearance exactly.');
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
