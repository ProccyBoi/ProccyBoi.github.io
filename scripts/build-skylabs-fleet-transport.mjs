/* Lossless delivery transports for the competition model, carriage and sensor.
 * npm install --prefix .codex-temp/aircraft-tooling --ignore-scripts --no-save meshoptimizer@1.3.0
 * node scripts/build-skylabs-fleet-transport.mjs [--verify]
 * Published .glb/.glb.gz remain the original compatibility paths.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import zlib from 'node:zlib';

const require=createRequire(import.meta.url), root=path.resolve(import.meta.dirname,'..');
const library=path.resolve(process.env.MESHOPT_ROOT||path.join(root,'.codex-temp/aircraft-tooling/node_modules/meshoptimizer'));
const {MeshoptEncoder}=await import(pathToFileURL(path.join(library,'meshopt_encoder.js')));
const {version}=JSON.parse(fs.readFileSync(path.join(library,'package.json')));
assert.equal(version,'1.3.0','Use the pinned encoder to reproduce exact bytes');
const decoderPath=path.join(root,'assets/vendor/meshopt_decoder.js');
const MeshoptDecoder=require(decoderPath);
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);

const extension='EXT_meshopt_compression';
const models=[
  ['skylabs-competition','assembly'],
  ['skylabs-mechanism','assembly'],
  ['skylabs-mechanism','sensor-body'],
];
const verify=process.argv.includes('--verify');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readGlb(bytes){
  assert.equal(bytes.toString('latin1',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const headerSize=bytes.readUInt32LE(12), binStart=28+headerSize;
  assert.equal(bytes.toString('latin1',16,20),'JSON');
  assert.equal(bytes.toString('latin1',binStart-4,binStart),'BIN\0');
  assert.equal(bytes.readUInt32LE(binStart-8),bytes.length-binStart);
  return {data:JSON.parse(bytes.subarray(20,20+headerSize)), binary:bytes.subarray(binStart), binStart};
}
function glb(data,binary){
  const text=Buffer.from(JSON.stringify(data)), textPad=(4-text.length%4)%4, binPad=(4-binary.length%4)%4;
  const header=Buffer.alloc(20), chunk=Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2,4);
  header.writeUInt32LE(header.length+text.length+textPad+chunk.length+binary.length+binPad,8);
  header.writeUInt32LE(text.length+textPad,12); header.write('JSON',16);
  chunk.writeUInt32LE(binary.length+binPad); chunk.write('BIN\0',4);
  return Buffer.concat([header,text,Buffer.alloc(textPad,32),chunk,binary,Buffer.alloc(binPad)]);
}
function pack(data,binary,level){
  const packed=structuredClone(data), chunks=[];
  assert.equal(data.buffers.length,1);
  assert.equal((data.buffers[0].byteLength+3)&~3,binary.length);
  const views=data.bufferViews.map(()=>[]);
  for(const accessor of data.accessors){
    assert.ok(Number.isInteger(accessor.bufferView)&&!accessor.sparse,'Missing or sparse accessor');
    views[accessor.bufferView].push(accessor);
  }
  let offset=0;
  for(const [i,view] of data.bufferViews.entries()){
    assert.equal(views[i].length,1,'Expected one geometry accessor per view');
    const [accessor]=views[i];
    const stride=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[accessor.type])*({5123:2,5125:4,5126:4}[accessor.componentType]);
    const start=view.byteOffset||0, count=view.byteLength/stride, decodedLength=view.byteLength;
    // Sensor GLB aligns its 16-bit index view with one extra index value.
    // Encode that value too; the accessor still exposes its original count.
    assert.ok(stride && !accessor.byteOffset && (!view.byteStride||view.byteStride===stride)
      && view.buffer===0 && Number.isInteger(count) && count>=accessor.count
      && (count-accessor.count)*stride<=3,'Expected a tightly packed accessor and up to 3 alignment bytes');
    const original=binary.subarray(start,start+decodedLength);
    assert.equal(original.length,decodedLength);
    // INDICES preserves the exact index sequence; TRIANGLES may rotate the corners.
    const mode=accessor.type==='SCALAR'?'INDICES':'ATTRIBUTES';
    assert.equal(mode==='INDICES',view.target===34963,'Index views must be mesh indices');
    const encoded=Buffer.from(mode==='ATTRIBUTES'
      ?MeshoptEncoder.encodeVertexBufferLevel(original,count,stride,level,0)
      :MeshoptEncoder.encodeGltfBuffer(original,count,stride,mode,0));
    const pad=(4-offset%4)%4;
    if(pad){ chunks.push(Buffer.alloc(pad)); offset+=pad; }
    packed.bufferViews[i]={...view,buffer:1,byteLength:decodedLength,extensions:{...view.extensions,[extension]:{
      buffer:0, byteOffset:offset, byteLength:encoded.length, byteStride:stride,
      count, mode, filter:'NONE',
    }}};
    chunks.push(encoded); offset+=encoded.length;
  }
  packed.buffers=[{byteLength:offset},{...data.buffers[0],extensions:{[extension]:{fallback:true}}}];
  for(const key of ['extensionsUsed','extensionsRequired'])packed[key]=[...new Set([...(packed[key]||[]),extension])];
  const bytes=glb(packed,Buffer.concat(chunks));
  return {level,bytes,gzip:zlib.gzipSync(bytes,{level:9})};
}
function restoreOriginal(source,encoded){
  const before=readGlb(source), after=readGlb(encoded);
  // Keep the source GLB header/JSON (the transport naturally has extra metadata),
  // but reconstruct the ENTIRE original BIN from decoded views, never from source bytes.
  const restored=Buffer.alloc(before.binary.length), written=new Uint8Array(before.binary.length);
  assert.equal(before.data.bufferViews.length,after.data.bufferViews.length);
  for(const [i,view] of before.data.bufferViews.entries()){
    const transportView=after.data.bufferViews[i];
    const {buffer,extensions,byteLength:decodedLength,...preserved}=transportView,
      {buffer:originalBuffer,byteLength:originalLength,...originalView}=view;
    assert.deepEqual(preserved,originalView);
    assert.equal(originalLength,decodedLength);
    assert.equal(buffer,1);
    const spec=extensions[extension], {byteOffset,byteLength,byteStride,count,mode,filter}=spec;
    assert.equal(filter,'NONE');
    assert.equal(decodedLength,count*byteStride);
    const start=view.byteOffset||0, end=start+decodedLength;
    assert.equal(written.subarray(start,end).includes(1),false);
    written.fill(1,start,end);
    const decoded=restored.subarray(start,end);
    MeshoptDecoder.decodeGltfBuffer(decoded,count,byteStride,after.binary.subarray(byteOffset,byteOffset+byteLength),mode,filter);
    assert.deepEqual(decoded,before.binary.subarray(start,end));
  }
  assert.equal(hash(restored),hash(before.binary), 'Original BIN hash, including zero alignment gaps');
  const unchangedMetadata=structuredClone(after.data);
  for(const key of ['buffers','bufferViews','extensionsUsed','extensionsRequired']){
    if(key in before.data)unchangedMetadata[key]=before.data[key];else delete unchangedMetadata[key];
  }
  assert.deepEqual(unchangedMetadata,before.data,'All non-transport metadata, including scene, nodes, materials and meshes');
  const restoredSource=Buffer.concat([source.subarray(0,before.binStart),restored]);
  assert.equal(hash(restoredSource),hash(source),'Reconstructed source GLB hash');
  return {sourceGlbSha256:hash(source),restoredSourceGlbSha256:hash(restoredSource),
    decodedViews:before.data.bufferViews.length,restoredBinSha256:hash(restored)};
}
globalThis.THREE=require(path.join(root,'assets/vendor/three.min.js'));
require(path.join(root,'assets/vendor/GLTFLoader.js'));
const parse=bytes=>new Promise((resolve,reject)=>new THREE.GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
function comparableMaterial(material){
  if(Array.isArray(material))return material.map(comparableMaterial);
  const {uuid,...props}=material.toJSON();return props;
}
function arrayBytes(array){
  return Buffer.from(array.buffer,array.byteOffset,array.byteLength);
}
async function verifyThree(original,transport){
  const a=(await parse(original)).scene, b=(await parse(transport)).scene;
  const originals=[], restored=[];
  a.updateMatrixWorld(true); b.updateMatrixWorld(true);
  a.traverse(object=>originals.push(object)); b.traverse(object=>restored.push(object));
  assert.equal(originals.length,restored.length);
  let meshes=0,attributeArrays=0,indexArrays=0;
  for(const [i,left] of originals.entries()){
    const right=restored[i];
    assert.equal(left.type,right.type); assert.equal(left.name,right.name);
    assert.deepEqual(left.matrix.toArray(),right.matrix.toArray());
    assert.deepEqual(left.matrixWorld.toArray(),right.matrixWorld.toArray());
    assert.deepEqual(left.userData,right.userData);
    assert.equal(left.children.length,right.children.length);
    if(left.geometry){
      meshes++;
      const lg=left.geometry, rg=right.geometry;
      assert.deepEqual(comparableMaterial(left.material),comparableMaterial(right.material));
      assert.deepEqual(lg.groups,rg.groups); assert.deepEqual(lg.drawRange,rg.drawRange);
      assert.deepEqual(Object.keys(lg.attributes),Object.keys(rg.attributes));
      assert.equal(!!lg.index,!!rg.index);
      for(const key of [...(lg.index?['index']:[]),...Object.keys(lg.attributes)]){
        const la=key==='index'?lg.index:lg.attributes[key],ra=key==='index'?rg.index:rg.attributes[key];
        assert.equal(la.itemSize,ra.itemSize); assert.equal(la.count,ra.count);
        assert.equal(la.normalized,ra.normalized); assert.equal(la.array.constructor,ra.array.constructor);
        assert.deepEqual(arrayBytes(la.array),arrayBytes(ra.array));
        if(key==='index')indexArrays++; else attributeArrays++;
      }
    }
  }
  return {nodes:originals.length,meshes,attributeArrays,indexArrays};
}
const report={decoder:'/assets/vendor/meshopt_decoder.js',decoderSha256:hash(fs.readFileSync(decoderPath)),
  encoder:'meshoptimizer 1.3.0',indexMode:'INDICES',filters:'NONE',reordered:false,quantized:false,models:[]};
for(const [folder,stem] of models){
  const assetDir=path.join(root,'assets/models/aircraft',folder);
  const source=fs.readFileSync(path.join(assetDir,stem+'.glb'));
  const legacy=fs.readFileSync(path.join(assetDir,stem+'.glb.gz'));
  assert.deepEqual(zlib.gunzipSync(legacy),source);
  const {data,binary}=readGlb(source);
  const variants=[0,1,2,3].map(level=>pack(data,binary,level));
  const {level,bytes,gzip}=variants.sort((a,b)=>a.gzip.length-b.gzip.length||a.level-b.level)[0];
  const assetPath=path.join(assetDir,stem+'.meshopt.glb.gz');
  const parity=restoreOriginal(source,zlib.gunzipSync(gzip));
  const threeLoader=await verifyThree(source,bytes);
  const reduced=gzip.length<legacy.length;
  if(reduced&&verify) assert.deepEqual(fs.readFileSync(assetPath),gzip,'Packed on-disk gzip must be reproducible');
  if(reduced&&!verify) fs.writeFileSync(assetPath,gzip);
  report.models.push({path:path.relative(root,assetPath),delivered:reduced,level,packedGlbBytes:bytes.length,
    packedGzipBytes:gzip.length,packedGzipSha256:hash(gzip),sourceGlbBytes:source.length,
    sourceGzipBytes:legacy.length,savedGzipBytes:legacy.length-gzip.length,
    gzipBytesByLevel:Object.fromEntries(variants.map(item=>[item.level,item.gzip.length])),...parity,threeLoader});
}
console.log(JSON.stringify(report,null,2));
