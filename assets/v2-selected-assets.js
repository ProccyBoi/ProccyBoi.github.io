/* Lossless static Selected Work assemblies, baked from existing CAD factories.
 * Pi and TramTrace retain the opening hero's shared transport/cache. */
(() => {
  'use strict';
  const names = new Set(['esp32', 'dual', 'logic', 'metro']);
  const shared = new Set(['pi', 'tramtrace']);
  // These are the original textures recorded in the lossless packs. Discover
  // them before the geometry arrives, rather than adding a network round trip
  // after decompression and index restoration. The pack remains authoritative.
  const textureSources = {
    esp32: ['/assets/models/framework-esp32/framework-markings-silk.svg'],
    dual: ['/assets/models/framework-dual-usb/framework-dual-usb-silk.svg'],
    logic: ['/assets/models/hardware/framework-logic-analyser/silk-front.svg', '/assets/models/hardware/framework-logic-analyser/silk-back.svg'],
    metro: ['/assets/models/hardware/metroboard/silk-front.svg', '/assets/models/hardware/metroboard/silk-back.svg']
  };
  const pending = new Map(), transfers = new Map();
  const headers = new Map(), images = new Map();
  function header(buffer) {
    if (buffer.byteLength < 16) throw new Error('Invalid selected assembly');
    const view = new DataView(buffer), magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 7));
    if (magic !== 'V2HERO1') throw new Error('Invalid selected assembly');
    const headerBytes = view.getUint32(8, true), dataStart = view.getUint32(12, true);
    if (dataStart % 4 || headerBytes > dataStart - 16 || dataStart > buffer.byteLength) throw new Error('Invalid selected assembly header');
    const data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, headerBytes)), (key, value) => value?.$negativeZero === true ? -0 : value);
    if (data.version !== 1) throw new Error('Unsupported selected assembly version');
    return {data, dataStart};
  }
  function image(url) {
    if (!images.has(url)) images.set(url, new Promise((resolve, reject) => {
      const bitmap = new Image(); bitmap.crossOrigin = 'anonymous'; bitmap.decoding = 'async'; bitmap.fetchPriority = 'low';
      bitmap.onload = () => resolve(bitmap); bitmap.onerror = reject; bitmap.src = url;
    }));
    return images.get(url);
  }
  async function transport(buffer) {
    const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(7, buffer.byteLength)));
    if (magic !== 'V2HIDX1') return {buffer, ...header(buffer)};
    if (buffer.byteLength < 32 || new DataView(buffer).getUint32(8, true) !== buffer.byteLength - 16) throw new Error('Invalid selected transport');
    const restored = buffer.slice(16), parsed = header(restored);
    const source = new Uint8Array(buffer, 16), target = new Uint8Array(restored);
    let sliceStarted = performance.now();
    for (const geometry of parsed.data.geometries) {
      const index = geometry.index, width = index.arrayType === 'Uint16Array' ? 2 : index.arrayType === 'Uint32Array' ? 4 : 0;
      const start = parsed.dataStart + index.byteOffset, count = index.byteLength / width;
      if (!width || !Number.isInteger(count) || start < parsed.dataStart || start + index.byteLength > restored.byteLength) throw new Error('Invalid selected index transport');
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
    if (shared.has(name)) return window.V2HeroAssets.prefetch(name);
    if (!window.DecompressionStream) return Promise.reject(new Error('Compressed selected CAD is unavailable; use the project images'));
    if (!names.has(name)) return Promise.reject(new Error('Unknown selected assembly: ' + name));
    textureSources[name].forEach(url => image(url).catch(() => {}));
    if (!pending.has(name)) {
      const transfer = fetch('/assets/models/selected/' + name + '.idx.bin.gz').then(response => {
        if (!response.ok) throw new Error('Selected assembly unavailable');
        return response.arrayBuffer();
      });
      // An opt-in scheduling signal, separate from unpacking readiness. Settle
      // failures too so a missing lead cannot starve the other visible models.
      // Store no raw bytes here; prefetch/load retain their original contract.
      transfers.set(name, transfer.then(() => {}, () => {}));
      pending.set(name, transfer.then(bytes => {
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
    }
    return pending.get(name);
  }
  function prefetchTextures() { return Promise.all(Object.values(textureSources).flat().map(image)); }
  function whenTransferSettled(name) {
    if (shared.has(name)) return window.V2HeroAssets.whenTransferSettled(name);
    if (!names.has(name)) return Promise.reject(new Error('Unknown selected assembly: ' + name));
    prefetch(name).catch(() => {});
    return transfers.get(name);
  }
  async function load(name) {
    if (shared.has(name)) return window.V2HeroAssets.load(name);
    const buffer = await prefetch(name), T = window.THREE;
    if (!T?.BufferGeometry) throw new Error('Selected assets require THREE');
    const {data, dataStart} = headers.get(name);
    const textures = [];
    const decode = value => {
      if (value === null || typeof value !== 'object') return value;
      if (value.$texture !== undefined) return textures[value.$texture];
      if (value.$type === 'Number') return Number(value.value);
      if (value.$type) {
        if (!['Color', 'Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Euler', 'Matrix3', 'Matrix4'].includes(value.$type)) throw new Error('Unsupported selected property');
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
      if (!['MeshStandardMaterial', 'MeshBasicMaterial', 'MeshPhysicalMaterial', 'LineBasicMaterial'].includes(item.type)) throw new Error('Unsupported selected material');
      const material = new T[item.type](); Object.assign(material, decode(item.properties)); return material;
    });
    function attribute(item) {
      if (!['Float32Array', 'Float64Array', 'Uint32Array', 'Uint16Array', 'Uint8Array', 'Int32Array', 'Int16Array', 'Int8Array'].includes(item.arrayType)) throw new Error('Unsupported selected attribute');
      const Constructor = window[item.arrayType], offset = dataStart + item.byteOffset;
      if (offset < dataStart || offset + item.byteLength > buffer.byteLength || offset % Constructor.BYTES_PER_ELEMENT) throw new Error('Invalid selected geometry range');
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
      const object = item.type === 'Mesh' ? new T.Mesh(geometries[item.geometry], material) : item.type === 'LineSegments' ? new T.LineSegments(geometries[item.geometry], material) : new T.Group();
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
  // Selected Work is a whole-assembly display. Batch only its two large
  // transit instances; the hero's independent graphs, cached buffers and exact
  // load() reconstruction remain untouched. Material identity is deliberately
  // stricter than appearance similarity: no material properties are combined.
  async function batchStatic(assembly, name, shouldContinue) {
    if(!shouldContinue())return null;
    if (!['metro', 'tramtrace'].includes(name) || assembly.staticBatches) return assembly;
    const T = window.THREE, started = performance.now(), group = assembly.group;
    group.updateMatrixWorld(true);
    const inverse = new T.Matrix4().copy(group.matrixWorld).invert(), nodes = [], buckets = new Map(), materialIds = new Map();
    const partObjects=new Set(assembly.parts.map(part=>part.object)), sourceBuffers=new Set();
    group.traverse(node => nodes.push(node));
    const report = {version:1, name, staticOnly:true, sourceOpaqueDraws:0, opaqueDraws:0, untouchedTransparentDraws:0,
      sourceTriangles:0, packedTriangles:0, mergedSourceDraws:0, mergedBatches:0, maxPositionRounding:0, maxNormalRounding:0,
      durationMs:0, workMs:0, maxWorkSliceMs:0, yields:0, allocatedGeometryBytes:0, releasedSourceGeometries:0, additionalSourceBuffersRetainedBytes:0, cachedSourceBufferBytes:0, sourcePartsRetained:assembly.parts.length, batches:[]};
    let sliceStarted=performance.now();
    const finishSlice=()=>{const elapsed=performance.now()-sliceStarted;report.workMs+=elapsed;report.maxWorkSliceMs=Math.max(report.maxWorkSliceMs,elapsed);};
    const yieldWork=async()=>{finishSlice();report.yields++;await new Promise(resolve=>setTimeout(resolve,0));sliceStarted=performance.now();return shouldContinue();};
    const sourceMeshes = [], staged = [];
    // The report contains only membership/transform metadata. Removed source
    // mesh objects are released after this function; cached pack bytes persist
    // through the existing transport cache, with no extra source-buffer copies.
    const fail = message => { throw new Error('Selected static batch: ' + message); };
    nodes.forEach((node, sourceNode) => {
      if (!node.isMesh) return;
      for (let parent=node; parent; parent=parent.parent) if (!parent.visible) return;
      const geometry=node.geometry, material=node.material, position=geometry.attributes.position;
      const count=geometry.index ? geometry.index.count : position.count;
      for(const attribute of Object.values(geometry.attributes))sourceBuffers.add((attribute.array||attribute.data.array).buffer);
      if(geometry.index)sourceBuffers.add(geometry.index.array.buffer);
      report.sourceTriangles+=count/3;
      if (Array.isArray(material) || material.transparent || material.transmission>0) { report.untouchedTransparentDraws++; return; }
      if (!material.visible) return;
      report.sourceOpaqueDraws++;
      // These packs use static triangle meshes. Unknown primitive/attribute
      // features stay on their original nodes rather than taking a shortcut.
      if (partObjects.has(node) || node.isSkinnedMesh || node.isInstancedMesh || node.customDepthMaterial || node.customDistanceMaterial ||
          !(material.isMeshStandardMaterial||material.isMeshBasicMaterial) || material.displacementMap || material.wireframe || Object.keys(geometry.morphAttributes).length || count%3 ||
          geometry.drawRange.start!==0 || geometry.drawRange.count<count ||
          position.itemSize!==3 || position.normalized || position.array?.constructor.name!=='Float32Array') return;
      const attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b));
      if (attributes.some(([attributeName,attribute]) => attribute.isInterleavedBufferAttribute || attribute.count!==position.count ||
          attributeName==='tangent' || (attributeName==='normal' && (attribute.itemSize!==3 || attribute.normalized || attribute.array?.constructor.name!=='Float32Array')))) return;
      let groupOrder=0;for(let parent=node.parent;parent;parent=parent.parent)if(parent.isGroup){groupOrder=parent.renderOrder;break;}
      const flags={renderOrder:node.renderOrder,groupOrder,castShadow:node.castShadow,receiveShadow:node.receiveShadow,frustumCulled:node.frustumCulled,layers:node.layers.mask};
      const schema=attributes.map(([attributeName,attribute])=>[attributeName,attribute.array.constructor.name,attribute.itemSize,attribute.normalized]);
      if(!materialIds.has(material))materialIds.set(material,materialIds.size);
      const materialId=materialIds.get(material), key=JSON.stringify([materialId,flags,schema]);
      const transform=new T.Matrix4().multiplyMatrices(inverse,node.matrixWorld), determinant=transform.determinant();
      if(!Number.isFinite(determinant)||determinant===0)return;
      if(!buckets.has(key))buckets.set(key,{material,materialId,flags,schema,items:[]});
      buckets.get(key).items.push({node,sourceNode,geometry,attributes,transform,mirrored:determinant<0,count,vertices:position.count});
    });
    for(const bucket of buckets.values()) {
      if(bucket.items.length<2)continue;
      const vertexCount=bucket.items.reduce((sum,item)=>sum+item.vertices,0), indexCount=bucket.items.reduce((sum,item)=>sum+item.count,0);
      const geometry=new T.BufferGeometry(), arrays={}, index=new (vertexCount<=65535?Uint16Array:Uint32Array)(indexCount);
      report.allocatedGeometryBytes+=index.byteLength;
      for(const [attributeName,attribute] of bucket.items[0].attributes){
        const array=new attribute.array.constructor(vertexCount*attribute.itemSize);arrays[attributeName]=array;report.allocatedGeometryBytes+=array.byteLength;
        geometry.setAttribute(attributeName,new T.BufferAttribute(array,attribute.itemSize,attribute.normalized));
      }
      const members=[];let vertexStart=0,indexStart=0;
      for(const item of bucket.items){
        if(performance.now()-sliceStarted>8&&!await yieldWork())return null;
        const normalMatrix=new T.Matrix3().getNormalMatrix(item.transform), vector=new T.Vector3();
        for(const [attributeName,attribute] of item.attributes){
          const target=arrays[attributeName],offset=vertexStart*attribute.itemSize;
          // First preserve every stored component verbatim. Only coordinates
          // and inverse-transpose normals cross the source local transform.
          target.set(attribute.array,offset);
          if(attributeName==='position'||attributeName==='normal')for(let vertex=0;vertex<item.vertices;vertex++){
            if(vertex%2048===0&&performance.now()-sliceStarted>8&&!await yieldWork())return null;
            vector.fromArray(attribute.array,vertex*3);
            if(attributeName==='position')vector.applyMatrix4(item.transform);else vector.applyMatrix3(normalMatrix);
            // Do not pre-normalize: Three's existing shader normalization stays
            // authoritative, and identity normal transforms retain exact bytes.
            for(let axis=0;axis<3;axis++){
              const value=vector.getComponent(axis);if(!Number.isFinite(value))fail('non-finite transformed attribute');
              target[offset+vertex*3+axis]=value;
              const error=Math.abs(target[offset+vertex*3+axis]-value);
              const metric=attributeName==='position'?'maxPositionRounding':'maxNormalRounding';report[metric]=Math.max(report[metric],error);
            }
          }
        }
        for(let i=0;i<item.count;i++){
          if(i%8192===0&&performance.now()-sliceStarted>8&&!await yieldWork())return null;
          const ordered=item.mirrored?(i%3===1?i+1:i%3===2?i-1:i):i;
          const source=item.geometry.index?item.geometry.index.getX(ordered):ordered;
          if(!Number.isInteger(source)||source<0||source>=item.vertices)fail('source index outside its vertex range');
          index[indexStart+i]=source+vertexStart;
        }
        members.push({sourceNode:item.sourceNode,sourceName:item.node.name,sourceGeometry:item.geometry.uuid,sourceMaterial:bucket.materialId,
          vertexStart,vertexCount:item.vertices,indexStart,indexCount:item.count,mirrored:item.mirrored,sourceTransform:item.transform.toArray(),
          position:item.node.position.toArray(),quaternion:item.node.quaternion.toArray(),scale:item.node.scale.toArray(),userData:JSON.parse(JSON.stringify(item.node.userData))});
        sourceMeshes.push(item.node);vertexStart+=item.vertices;indexStart+=item.count;
      }
      geometry.setIndex(new T.BufferAttribute(index,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const object=new T.Mesh(geometry,bucket.material);object.name='selected-'+name+'-opaque-'+staged.length;
      const {groupOrder,layers,...flags}=bucket.flags;Object.assign(object,flags);object.layers.mask=layers;
      const host=new T.Group();host.name=object.name+'-order';host.renderOrder=groupOrder;host.add(object);
      const metadata={name:object.name,materialId:bucket.materialId,materialName:bucket.material.name,flags:bucket.flags,schema:bucket.schema,vertices:vertexCount,indices:indexCount,members};
      staged.push({host,items:bucket.items});report.batches.push(metadata);
    }
    // Commit only after every prospective batch is valid. Original ancestor
    // groups, their transforms, and all assembly.parts references stay intact.
    if(!shouldContinue())return null;
    if(report.maxPositionRounding>1e-6||report.maxNormalRounding>1e-6)fail('unexpected Float32 coordinate precision loss');
    for(const {host,items} of staged){for(const item of items)item.node.parent.remove(item.node);group.add(host);}
    group.updateMatrixWorld(true);
    group.traverseVisible(node=>{if(node.isMesh)report.packedTriangles+=(node.geometry.index?node.geometry.index.count:node.geometry.attributes.position.count)/3;});
    if(report.sourceTriangles!==report.packedTriangles)fail('source triangle total changed');
    const remainingGeometries=new Set();group.traverse(node=>{if(node.geometry)remainingGeometries.add(node.geometry);});
    const released=new Set(sourceMeshes.map(node=>node.geometry).filter(geometry=>!remainingGeometries.has(geometry)));
    released.forEach(geometry=>geometry.dispose());report.releasedSourceGeometries=released.size;
    // These existing transport buffers remain cached; releasing geometry
    // objects is not a claim that their backing pack bytes were reclaimed.
    report.cachedSourceBufferBytes=[...sourceBuffers].reduce((sum,buffer)=>sum+buffer.byteLength,0);
    report.mergedSourceDraws=sourceMeshes.length;report.mergedBatches=staged.length;
    report.opaqueDraws=report.sourceOpaqueDraws-report.mergedSourceDraws+report.mergedBatches;
    finishSlice();report.durationMs=performance.now()-started;assembly.staticBatches=report;
    return assembly;
  }
  async function loadStatic(name, prepare, {shouldContinue=()=>true}={}) {
    if(!shouldContinue())return null;
    const assembly=await load(name);
    if(!shouldContinue())return null;
    // A caller may apply its existing studio finish before flags/material
    // identity are grouped. It must finish synchronously before static baking.
    if(prepare){const result=prepare(assembly);if(result?.then)throw new Error('Selected static preparation must be synchronous');}
    return batchStatic(assembly,name,shouldContinue);
  }
  window.V2SelectedAssets = Object.freeze({prefetch, load, loadStatic, whenTransferSettled, prefetchTextures});
})();
