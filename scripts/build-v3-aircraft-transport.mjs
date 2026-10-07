/* Lossless EXT_meshopt_compression transport for the completed trainer.
 * Install meshoptimizer@1.3.0 in .codex-temp/aircraft-tooling (or set
 * MESHOPT_ROOT). No quantization, index rotation, reordering or filters.
 * Every decoded buffer must be byte-identical before an asset is written.
 * --verify also parses both GLBs through this site's actual Three r128 loader.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const library=path.resolve(process.env.MESHOPT_ROOT||path.join(root,'.codex-temp/aircraft-tooling/node_modules/meshoptimizer'));
const {MeshoptEncoder}=await import(pathToFileURL(path.join(library,'meshopt_encoder.js')));
const {MeshoptDecoder}=await import(pathToFileURL(path.join(library,'meshopt_decoder.mjs')));
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const folder=path.join(root,'assets/models/aircraft/skylabs-trainer'),source=fs.readFileSync(path.join(folder,'airframe.glb'));
const headerSize=source.readUInt32LE(12),data=JSON.parse(source.subarray(20,20+headerSize)),binary=source.subarray(28+headerSize);
const sourceJSON=structuredClone(data),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report=[],chunks=[];let offset=0;
for(let i=0;i<data.bufferViews.length;i++){
  const view=data.bufferViews[i],accessor=data.accessors.find(item=>item.bufferView===i);
  assert.ok(accessor,'All aircraft views must have typed geometry accessors');
  const stride=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[accessor.type])*({5123:2,5125:4,5126:4}[accessor.componentType]);
  assert.ok(!accessor.byteOffset&&!view.byteStride&&view.byteLength===accessor.count*stride,'Expected tightly packed original arrays');
  const original=binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),mode=accessor.type==='SCALAR'?'INDICES':'ATTRIBUTES';
  // INDICES retains the exact triangle index sequence; TRIANGLES may rotate
  // the three corners of each triangle, so it is deliberately not used.
  const compressed=Buffer.from(mode==='ATTRIBUTES'?MeshoptEncoder.encodeVertexBufferLevel(original,accessor.count,stride,3,0):MeshoptEncoder.encodeGltfBuffer(original,accessor.count,stride,mode,0));
  const restored=new Uint8Array(original.length);MeshoptDecoder.decodeGltfBuffer(restored,accessor.count,stride,compressed,mode);
  assert.ok(Buffer.from(restored).equals(original),'Exact decoded buffer parity: '+i);
  const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
  view.buffer=1;view.extensions={...view.extensions,EXT_meshopt_compression:{buffer:0,byteOffset:offset,byteLength:compressed.length,byteStride:stride,count:accessor.count,mode,filter:'NONE'}};
  chunks.push(compressed);offset+=compressed.length;report.push({view:i,mode,stride,count:accessor.count,sourceBytes:original.length,encodedBytes:compressed.length,sourceSha256:hash(original),decodedByteParity:true});
}
const packed=Buffer.concat(chunks);data.buffers=[{byteLength:packed.length},{byteLength:binary.length,extensions:{EXT_meshopt_compression:{fallback:true}}}];
for(const key of ['extensionsUsed','extensionsRequired'])data[key]=[...new Set([...(data[key]||[]),'EXT_meshopt_compression'])];
function glb(json,bytes){let text=Buffer.from(JSON.stringify(json));text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);const padded=Buffer.concat([bytes,Buffer.alloc((4-bytes.length%4)%4)]),header=Buffer.alloc(20),chunk=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+padded.length,8);header.writeUInt32LE(text.length,12);header.write('JSON',16);chunk.writeUInt32LE(padded.length);chunk.write('BIN\0',4);return Buffer.concat([header,text,chunk,padded]);}
const output=glb(data,packed),compressed=zlib.gzipSync(output,{level:9}),filename='airframe.meshopt.glb';
assert.ok(compressed.length<fs.statSync(path.join(folder,'airframe.glb.gz')).size,'Transport must reduce delivery');
if(process.argv.includes('--verify')){
  assert.deepEqual(fs.readFileSync(path.join(folder,filename)),output);
  assert.deepEqual(zlib.gunzipSync(fs.readFileSync(path.join(folder,filename+'.gz'))),output);
}else{
  fs.writeFileSync(path.join(folder,filename),output);fs.writeFileSync(path.join(folder,filename+'.gz'),compressed);
  fs.copyFileSync(path.join(library,'meshopt_decoder.cjs'),path.join(root,'assets/vendor/meshopt_decoder.js'));
  fs.copyFileSync(path.join(library,'LICENSE.md'),path.join(root,'assets/vendor/meshoptimizer.LICENSE.md'));
  const manifestPath=path.join(folder,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
  manifest.transport={format:'EXT_meshopt_compression',model:filename,compressedModel:filename+'.gz',decoder:'/assets/vendor/meshopt_decoder.js',decoderVersion:'meshoptimizer 1.3.0',decoderBytes:fs.statSync(path.join(root,'assets/vendor/meshopt_decoder.js')).size,decoderSha256:hash(fs.readFileSync(path.join(root,'assets/vendor/meshopt_decoder.js'))),bytes:output.length,gzipBytes:compressed.length,sha256:hash(output),sourceGlbSha256:hash(source),lossless:true,filters:'NONE',indexMode:'INDICES',reordered:false,quantized:false,encodedViews:report.length,allDecodedBuffersByteIdentical:true};
  if(!manifest.rebuild.includes('node scripts/build-v3-aircraft-transport.mjs'))manifest.rebuild.push('node scripts/build-v3-aircraft-transport.mjs');
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(folder,'transport-parity.json'),JSON.stringify({sourceSha256:hash(source),transportSha256:hash(output),encoder:'meshoptimizer 1.3.0; level3; bitstream0',views:report},null,2)+'\n');
}
// Exercise the actual site loader in Node: all geometry/material/transform
// creation runs, while no WebGL context or competing browser is started.
globalThis.THREE=require(path.join(root,'assets/vendor/three.min.js'));require(path.join(root,'assets/vendor/GLTFLoader.js'));
const parse=bytes=>new Promise((resolve,reject)=>new THREE.GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
const originalScene=(await parse(source)).scene,transportScene=(await parse(output)).scene;
const originals=[];originalScene.traverse(node=>originals.push(node));const restoredNodes=[];transportScene.traverse(node=>restoredNodes.push(node));assert.equal(originals.length,restoredNodes.length);
for(let i=0;i<originals.length;i++){
  const a=originals[i],b=restoredNodes[i];assert.equal(a.name,b.name);assert.deepEqual(a.matrix.toArray(),b.matrix.toArray());
  if(a.geometry)for(const key of ['index',...Object.keys(a.geometry.attributes)]){const aa=key==='index'?a.geometry.index:a.geometry.attributes[key],bb=key==='index'?b.geometry.index:b.geometry.attributes[key];assert.equal(aa.itemSize,bb.itemSize);assert.deepEqual(Buffer.from(aa.array.buffer,aa.array.byteOffset,aa.array.byteLength),Buffer.from(bb.array.buffer,bb.array.byteOffset,bb.array.byteLength));}
}
assert.deepEqual(sourceJSON.nodes,data.nodes);assert.deepEqual(sourceJSON.materials,data.materials);assert.deepEqual(sourceJSON.meshes,data.meshes);
console.log(JSON.stringify({result:'PASS',views:report.length,allDecodedBuffersByteIdentical:true,actualThreeLoaderNodeParity:originals.length,sourceGzipBytes:fs.statSync(path.join(folder,'airframe.glb.gz')).size,transportBytes:output.length,transportGzipBytes:compressed.length,deliveryReductionBytes:fs.statSync(path.join(folder,'airframe.glb.gz')).size-compressed.length},null,2));
