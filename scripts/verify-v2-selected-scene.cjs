/* Actual Selected Work CAD acceptance, not image-plane or animation mocks.
 * --source-only: real packed geometry + deterministic camera/easing, no browser.
 * --study: ONLY opted-in capture API and 1440/390/320 render studies.
 * --group=core|lifecycle|entry selects an independent browser group; default all.
 * --responsiveness-only: identical native warm-input probe on old/new versions,
 * without claiming an old version implements the newer part choreography.
 * Default browser groups never enable capture or call image.decode(). Serve the
 * repository root on V2_BASE_URL. SwiftShader timings are not device benchmarks.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = process.env.V2_SELECTED_OUT || '.codex-temp/v2-selected-scene';
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 120000);
const names = ['esp32', 'dual', 'pi', 'logic', 'metro', 'tramtrace'];
const selected = '[data-selected-work]', canvas = 'canvas[data-selected-canvas]';
const packs = /\/assets\/models\/selected\/(?:esp32|dual|logic|metro)\.idx\.bin\.gz(?:\?|$)/;
const heroPack = name => new RegExp('/assets/models/hero/' + name + '\\.(?:idx\\.bin\\.gz|bin)(?:\\?|$)');
const evidence = [], tolerance = .000012;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const near = (a, b, label, epsilon = 1e-10) => assert.ok(Math.abs(a - b) <= epsilon, `${label}: ${a} vs ${b}`);
function passed(name, details = {}) { evidence.push({name, ...details}); console.log('PASS ' + name); }
async function deadline(promise,label) {let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),timeout);})]);}finally{clearTimeout(timer);}}

function sourceContract() {
  const html = read('v2/index.html'), v3 = read('v3/index.html');
  const start = html.indexOf('data-selected-work'), end = html.indexOf('data-aircraft-hero', start);
  assert.ok(start > 0 && end > start, 'Selected Work precedes the aircraft');
  const section = html.slice(start, end), code = read('assets/v2-selected-work.js');
  assert.equal((code.match(/document\.createElement\(['"]canvas['"]\)/g) || []).length, 1, 'Exactly one shared Selected Work canvas constructor');
  assert.equal((section.match(/<(?:article|section)\b[^>]*data-selected-chapter/g) || []).length, 2, 'Two readable chapter collections');
  for (const id of ['work-framework', 'work-transit']) assert.match(section, new RegExp('id="' + id + '"'), 'Native chapter anchor ' + id);
  const images = [...section.matchAll(/<img\b[^>]*data-selected-image[^>]*>/g)].map(match => match[0]);
  assert.equal(images.length, 6, 'All six original fallbacks remain in initial HTML');
  for (const image of images) for (const pattern of [/\ssrc="[^"]+"/, /loading="eager"/, /decoding="async"/, /fetchpriority="low"/]) assert.match(image, pattern);
  assert.doesNotMatch(v3, /data-selected-work|v2-selected-(?:work|scene|assets)/, 'Accepted v3 is isolated');
  assert.doesNotMatch(code, /\.animate\s*\(/, 'Selected Work does not substitute a WAAPI image fan for CAD');
  assert.match(code, /V2ScrollSmoothing/, 'Selected Work uses the accepted 70ms helper');
  assert.match(code, /selectedCapture/, 'Debug controls require an explicit capture query');
  passed('source-contract-one-canvas-two-native-chapters-six-fallbacks');
}

const arrayHash = array => crypto.createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
function geometrySignature(geometry) {
  return JSON.stringify({attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute])=>[name,{type:attribute.array.constructor.name,size:attribute.itemSize,normalized:attribute.normalized,count:attribute.count,bytes:arrayHash(attribute.array)}])),index:geometry.index?arrayHash(geometry.index.array):null,groups:geometry.groups,drawRange:geometry.drawRange});
}
function meshFlags(node) {
  let groupOrder=0;for(let parent=node.parent;parent;parent=parent.parent)if(parent.isGroup){groupOrder=parent.renderOrder;break;}
  return{renderOrder:node.renderOrder,groupOrder,castShadow:node.castShadow,receiveShadow:node.receiveShadow,frustumCulled:node.frustumCulled,layers:node.layers.mask};
}
function graphSignature(assembly) {
  const nodes=[],geometries=new Map();
  assembly.group.traverse(node=>{
    if(node.geometry&&!geometries.has(node.geometry))geometries.set(node.geometry,geometrySignature(node.geometry));
    nodes.push({id:node.uuid,parent:node.parent?.uuid,children:node.children.map(child=>child.uuid),position:node.position.toArray(),quaternion:node.quaternion.toArray(),scale:node.scale.toArray(),visible:node.visible,flags:meshFlags(node),geometry:node.geometry?.uuid,geometrySignature:node.geometry?geometries.get(node.geometry):null,materials:[].concat(node.material||[]).map(material=>({id:material.uuid,type:material.type,name:material.name,properties:Object.fromEntries(Object.entries(material).filter(([,value])=>value===null||['string','number','boolean'].includes(typeof value))),color:material.color?.toArray()}))});
  });
  return JSON.stringify({nodes,parts:assembly.parts.map(part=>({ref:part.ref,object:part.object.uuid}))});
}
function drawnCount(geometry) {
  const available=geometry.index?.count||geometry.attributes.position.count;
  return Math.max(0,Math.min(available-geometry.drawRange.start,geometry.drawRange.count));
}
function materialSignature(material) {
  return JSON.stringify({id:material.uuid,type:material.type,properties:Object.fromEntries(Object.entries(material).filter(([,value])=>value===null||['string','number','boolean'].includes(typeof value))),color:material.color?.toArray(),textures:Object.fromEntries(Object.entries(material).filter(([,value])=>value?.isTexture).map(([key,value])=>[key,value.uuid]))});
}
function captureAssembly(assembly,T) {
  assembly.group.updateMatrixWorld(true);
  const inverse=new T.Matrix4().copy(assembly.group.matrixWorld).invert(),nodes=new Map(),geometries=new Map(),materials=new Map();
  assembly.group.traverse(node=>{
    if(node.geometry&&!geometries.has(node.geometry))geometries.set(node.geometry,geometrySignature(node.geometry));
    for(const material of [].concat(node.material||[]))if(!materials.has(material))materials.set(material,materialSignature(material));
    let rendered=true;for(let parent=node;parent;parent=parent.parent)if(!parent.visible)rendered=false;
    nodes.set(node,{parent:node.parent,geometry:node.geometry,material:node.material,rendered,transform:new T.Matrix4().multiplyMatrices(inverse,node.matrixWorld),flags:meshFlags(node)});
  });
  return{nodes,geometries,materials,parts:assembly.parts.map(part=>({part,object:part.object}))};
}
function assembledSourceProof(composition,captured,T) {
  const report=[];
  for(const name of names){
    const entry=composition.objects.get(name),assembly=entry.assembly,before=captured[name],actualNodes=new Set(),segments=new Map();
    assembly.group.updateMatrixWorld(true);assembly.group.traverse(node=>actualNodes.add(node));
    const inverse=new T.Matrix4().copy(assembly.group.matrixWorld).invert();
    for(const segment of entry.partition||[]){
      const {source,object,start,count}=segment,fact=before.nodes.get(source);
      assert.ok(fact?.geometry&&source.isMesh&&object.isMesh,name+': partition source is an independently captured original mesh');
      assert.ok(actualNodes.has(object)&&(object===source||!actualNodes.has(source)),name+': source replacement renders once without duplicate faces');
      assert.equal(object.material,fact.material,name+': partition keeps the exact original material object');
      assert.equal(object.geometry.index,fact.geometry.index,name+': partition reuses the exact original index object');
      assert.deepEqual(Object.keys(object.geometry.attributes),Object.keys(fact.geometry.attributes));
      for(const key of Object.keys(fact.geometry.attributes))assert.equal(object.geometry.attributes[key],fact.geometry.attributes[key],name+': partition reuses exact '+key+' attribute objects');
      assert.ok(Number.isInteger(start)&&Number.isInteger(count)&&start>=0&&count>0&&start%3===0&&count%3===0,name+': partition describes whole original triangles');
      if(object!==source){
        assert.deepEqual(object.geometry.drawRange,{start,count},name+': actual drawRange equals declared source range');
        const exactBounds=new T.Box3(),vertex=new T.Vector3();
        for(let index=start;index<start+count;index++)exactBounds.expandByPoint(vertex.fromBufferAttribute(fact.geometry.attributes.position,fact.geometry.index.getX(index)));
        assert.deepEqual(object.geometry.boundingBox?.min.toArray(),exactBounds.min.toArray(),name+': partition bounds include only its rendered source triangles');
        assert.deepEqual(object.geometry.boundingBox?.max.toArray(),exactBounds.max.toArray(),name+': partition bounds include only its rendered source triangles');
      }else assert.equal(drawnCount(object.geometry),count,name+': whole original mesh retains its full source range');
      assert.deepEqual(meshFlags(object),fact.flags,name+': partition preserves render, culling, layer and shadow flags');
      const assembled=new T.Matrix4().multiplyMatrices(inverse,object.matrixWorld);
      assembled.elements.forEach((value,index)=>near(value,fact.transform.elements[index],name+': assembled partition preserves exact source placement',1e-12));
      if(!segments.has(source))segments.set(source,[]);segments.get(source).push(segment);
    }
    let sourceTriangles=0,actualTriangles=0,sourceRenderedTriangles=0,actualRenderedTriangles=0;
    for(const [node,fact]of before.nodes){
      if(node.isMesh){sourceTriangles+=drawnCount(fact.geometry)/3;if(fact.rendered)sourceRenderedTriangles+=drawnCount(fact.geometry)/3;}
      if(segments.has(node)){
        let cursor=fact.geometry.drawRange.start;
        for(const segment of segments.get(node).sort((a,b)=>a.start-b.start)){
          assert.equal(segment.start,cursor,name+': every original triangle appears exactly once, with no overlap or hole');cursor+=segment.count;
        }
        assert.equal(cursor,fact.geometry.drawRange.start+drawnCount(fact.geometry),name+': partition exhausts the original draw range');
      }else{
        assert.ok(actualNodes.has(node),name+': unpartitioned source objects remain in the assembly');
        assert.equal(node.geometry,fact.geometry);assert.equal(node.material,fact.material);
        if(node!==assembly.group){
          const assembled=new T.Matrix4().multiplyMatrices(inverse,node.matrixWorld);
          assembled.elements.forEach((value,index)=>near(value,fact.transform.elements[index],name+': assembled original node preserves source placement',1e-12));
        }
      }
    }
    for(const [geometry,signature]of before.geometries)assert.equal(geometrySignature(geometry),signature,name+': choreography construction never changes source geometry or index bytes');
    for(const [material,signature]of before.materials)assert.equal(materialSignature(material),signature,name+': source material properties and textures stay exact');
    assembly.group.traverse(node=>{if(node.isMesh)actualTriangles+=drawnCount(node.geometry)/3;});
    assembly.group.traverseVisible(node=>{if(node.isMesh)actualRenderedTriangles+=drawnCount(node.geometry)/3;});
    assert.equal(actualTriangles,sourceTriangles,name+': whole-assembly triangle count stays exact after part extraction');
    assert.equal(actualRenderedTriangles,sourceRenderedTriangles,name+': originally visible triangle count stays exact after part extraction');
    assert.equal(composition.stats().find(item=>item.name===name).triangles,actualRenderedTriangles,name+': production render statistics count only the actual visible draw ranges');
    for(const {part,object}of before.parts){assert.ok(assembly.parts.includes(part));assert.equal(part.object,object);assert.ok(actualNodes.has(object),name+': original part references are retained');}
    if(name==='dual')assert.ok(segments.size>0,'Dual USB actually exposes independently checked source partitions');
    else assert.equal(segments.size,0,name+': already articulated source needs no geometry partition');
    report.push({name,sourceTriangles,actualTriangles,sourceRenderedTriangles,actualRenderedTriangles,triangleCountNote:'Total graph counts include authored hidden meshes; rendered counts use original visibility and the real indexed draw ranges.',partitionedSources:segments.size,segments:[...segments.values()].reduce((sum,items)=>sum+items.length,0)});
  }
  return report;
}
async function staticAssemblyProof(api,studio,T,name,options={}) {
  let captured;
  const assembly=await api.loadStatic(name,source=>{
    if(name==='pi'||name==='tramtrace')studio.applyMaterials(source,name);
    if(options.mirror){let mirrored=false,index=0;source.group.traverse(node=>{if(index++===options.mirrorSourceNode&&node.isMesh){node.scale.x*=-1;mirrored=true;}});assert.ok(mirrored,'A known eligible real mesh is reflected for winding coverage');}
    source.group.updateMatrixWorld(true);
    const inverse=new T.Matrix4().copy(source.group.matrixWorld).invert(),nodes=[],facts=new Map(),groups=[];
    source.group.traverse(node=>{
      nodes.push(node);if(node.isGroup)groups.push({node,parent:node.parent,position:node.position.toArray(),quaternion:node.quaternion.toArray(),scale:node.scale.toArray()});
      if(node.isMesh)facts.set(node,{parent:node.parent,geometry:node.geometry,material:node.material,signature:geometrySignature(node.geometry),transform:new T.Matrix4().multiplyMatrices(inverse,node.matrixWorld),flags:meshFlags(node)});
    });
    captured={source,nodes,facts,groups,parts:source.parts.map(part=>({part,object:part.object})),signature:graphSignature(source)};
  },options.cancel?{shouldContinue:()=>++options.cancel.checks<4}:undefined);
  if(options.cancel){
    assert.equal(assembly,null,'Guarded cooperative cancellation returns no partially batched assembly');
    assert.ok(options.cancel.checks>=4,'Cancellation interrupts real cooperative work');
    assert.equal(graphSignature(captured.source),captured.signature,'Cancellation commits no graph, index, attribute, material, flag or part changes');
    assert.equal(captured.source.staticBatches,undefined,'Canceled staging never claims committed batches');
    return{canceled:true,guardChecks:options.cancel.checks,unchangedSource:true};
  }
  if(!['metro','tramtrace'].includes(name)){assert.equal(assembly.staticBatches,undefined,'Other source assemblies do not opt into batching');return{assembly,report:{name,batched:false}};}
  const report=assembly.staticBatches;assert.ok(report?.batches.length>0,name+': actual production static batching is exercised');
  const actualNodes=new Set();assembly.group.traverse(node=>actualNodes.add(node));
  const processed=new Set(),materials=new Map();let vertices=0,indices=0,mirrored=0,maxPositionError=0,maxNormalError=0;
  for(const batch of report.batches){
    const output=assembly.group.getObjectByName(batch.name);assert.ok(output?.isMesh,'Batch corresponds to an actual mesh');
    assert.equal(output.material.transparent,false,'Only opaque materials enter a static batch');assert.ok(!(output.material.transmission>0));
    const schema=Object.entries(output.geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([key,attribute])=>[key,attribute.array.constructor.name,attribute.itemSize,attribute.normalized]);
    assert.equal(JSON.stringify(schema),JSON.stringify(batch.schema),'All declared attribute schemas match the real output');
    assert.equal(JSON.stringify(meshFlags(output)),JSON.stringify(batch.flags),'Output keeps renderer/shadow/culling/layer/group-order flags');
    assert.equal(output.geometry.attributes.position.count,batch.vertices);assert.equal(output.geometry.index.count,batch.indices);
    if(materials.has(batch.materialId))assert.equal(materials.get(batch.materialId),output.material,'A material ID never aliases different material objects');else materials.set(batch.materialId,output.material);
    let nextVertex=0,nextIndex=0;
    for(const member of batch.members){
      const source=captured.nodes[member.sourceNode],fact=captured.facts.get(source);assert.ok(fact,'Source traversal membership resolves independently');assert.ok(!processed.has(source),'No original mesh is packed twice');processed.add(source);
      assert.equal(source.name,member.sourceName);assert.equal(source.geometry.uuid,member.sourceGeometry);assert.equal(source.material,output.material,'Material object identity is preserved, not approximated or cloned');assert.equal(member.sourceMaterial,batch.materialId);
      assert.equal(JSON.stringify(fact.flags),JSON.stringify(batch.flags),'Only equivalent flags are grouped');
      const sourceSchema=Object.entries(source.geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([key,attribute])=>[key,attribute.array.constructor.name,attribute.itemSize,attribute.normalized]);assert.equal(JSON.stringify(sourceSchema),JSON.stringify(schema),'Incompatible source attribute layouts never merge');
      assert.equal(member.vertexStart,nextVertex);assert.equal(member.indexStart,nextIndex);assert.equal(member.vertexCount,source.geometry.attributes.position.count);assert.equal(member.indexCount,source.geometry.index?.count||source.geometry.attributes.position.count);
      fact.transform.elements.forEach((value,index)=>near(member.sourceTransform[index],value,'Independent root-local source transform',1e-12));
      const reflected=fact.transform.determinant()<0;assert.equal(member.mirrored,reflected);if(reflected)mirrored++;
      const normalMatrix=new T.Matrix3().getNormalMatrix(fact.transform),vector=new T.Vector3();
      for(const [attributeName,attribute]of Object.entries(source.geometry.attributes)){
        const target=output.geometry.attributes[attributeName],offset=member.vertexStart*attribute.itemSize;
        if(attributeName==='position'||attributeName==='normal'){
          for(let vertex=0;vertex<attribute.count;vertex++){
            vector.fromBufferAttribute(attribute,vertex);if(attributeName==='position')vector.applyMatrix4(fact.transform);else vector.applyMatrix3(normalMatrix);
            for(let axis=0;axis<3;axis++){
              const expected=vector.getComponent(axis),actual=target.array[offset+vertex*3+axis];
              assert.equal(actual,Math.fround(expected),name+': every '+attributeName+' component equals the independently transformed Float32 value');
              const error=Math.abs(actual-expected);if(attributeName==='position')maxPositionError=Math.max(maxPositionError,error);else maxNormalError=Math.max(maxNormalError,error);
            }
          }
        }else{
          const segment=target.array.subarray(offset,offset+attribute.array.length);assert.equal(arrayHash(segment),arrayHash(attribute.array),'UV/color/other attribute bytes remain exact');
        }
      }
      for(let index=0;index<member.indexCount;index++){
        const sourceIndex=reflected?(index%3===1?index+1:index%3===2?index-1:index):index;
        const expected=(source.geometry.index?source.geometry.index.getX(sourceIndex):sourceIndex)+member.vertexStart;
        assert.equal(output.geometry.index.getX(member.indexStart+index),expected,'Exact triangle membership and reflected-transform winding');
      }
      assert.equal(geometrySignature(source.geometry),fact.signature,'Packing never mutates the original cached attribute/index bytes');
      assert.equal(actualNodes.has(source),false,'Merged source mesh is removed instead of double-rendered');
      nextVertex+=member.vertexCount;nextIndex+=member.indexCount;vertices+=member.vertexCount;indices+=member.indexCount;
    }
    assert.equal(nextVertex,batch.vertices);assert.equal(nextIndex,batch.indices);
  }
  let protectedNodes=0,sourceTriangles=0,packedTriangles=0;
  for(const [node,fact]of captured.facts){
    let visible=true;for(let parent=node;parent;parent=parent.parent)if(!parent.visible)visible=false;
    // All actual source meshes in these packs are visible. Their original
    // triangle count is checked before/after, independently of report totals.
    if(visible)sourceTriangles+=(fact.geometry.index?.count||fact.geometry.attributes.position.count)/3;
    if(!processed.has(node)){assert.ok(actualNodes.has(node),'Unmerged primitives remain original scene objects');assert.equal(node.parent,fact.parent);assert.equal(node.geometry,fact.geometry);assert.equal(node.material,fact.material);assert.equal(geometrySignature(node.geometry),fact.signature);}
    if(Array.isArray(fact.material)||fact.material.transparent||fact.material.transmission>0){protectedNodes++;assert.ok(!processed.has(node),'Transparent/multi-material meshes preserve their original sorting identity');}
  }
  assembly.group.traverseVisible(node=>{if(node.isMesh)packedTriangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;});
  assert.equal(packedTriangles,sourceTriangles,'Exact whole-assembly triangle parity');assert.equal(report.sourceTriangles,sourceTriangles);assert.equal(report.packedTriangles,packedTriangles);
  for(const group of captured.groups){assert.ok(actualNodes.has(group.node),'Original part/ancestor groups remain attached');assert.equal(group.node.parent,group.parent);assert.deepEqual(group.node.position.toArray(),group.position);assert.deepEqual(group.node.quaternion.toArray(),group.quaternion);assert.deepEqual(group.node.scale.toArray(),group.scale);}
  for(const part of captured.parts){assert.ok(assembly.parts.includes(part.part));assert.equal(part.part.object,part.object);assert.ok(actualNodes.has(part.object),'Part references retain their original objects');}
  assert.ok(maxPositionError<=1e-6&&maxNormalError<=1e-6,'Only bounded Float32 transform rounding is introduced');
  if(options.mirror)assert.ok(mirrored>0,'The adversarial parity case actually exercises reflected winding');
  return{assembly,report:{name,sourceTriangles,packedTriangles,vertices,indices,protectedNodes,mirrored,maxPositionError,maxNormalError,sourceOpaqueDraws:report.sourceOpaqueDraws,opaqueDraws:report.opaqueDraws,mergedBatches:report.mergedBatches,workMs:report.workMs,maxWorkSliceMs:report.maxWorkSliceMs,yields:report.yields}};
}

async function sourceGeometry() {
  const T = require('../assets/vendor/three.min.js'), requests = new Map();
  // Real production loaders construct all geometry/materials. Only HTTP and
  // decoded texture pixels are stubbed: this group makes no rendering claim.
  class LocalImage { set src(url) { this.url = url; queueMicrotask(() => this.onload?.()); } }
  const window = {THREE:T, DecompressionStream};
  for (const name of ['Float32Array', 'Float64Array', 'Uint32Array', 'Uint16Array', 'Uint8Array', 'Int32Array', 'Int16Array', 'Int8Array']) window[name] = global[name];
  const context = vm.createContext({window, Image:LocalImage, TextDecoder, DataView, Uint8Array, Blob, Response, DecompressionStream, performance, setTimeout, console,
    fetch: async url => {
      const file = url.split('?')[0]; requests.set(file, (requests.get(file) || 0) + 1);
      return new Response(fs.readFileSync(path.join(root, file.replace(/^\//, ''))));
    }});
  for (const file of ['v2-hero-assets.js', 'v2-hero-environment.js', 'v2-selected-assets.js', 'v2-selected-scene.js']) vm.runInContext(read('assets/' + file), context, {filename:file});
  const hero = {}, sourceAssemblies = {}, staticAssemblies = {}, heroParents = new T.Group(),parity=[];
  for (const name of ['pi', 'tramtrace']) { hero[name] = await window.V2HeroAssets.load(name); heroParents.add(hero[name].group); }
  for (const name of names) sourceAssemblies[name] = await window.V2SelectedAssets.load(name);
  const originalSources=Object.fromEntries(names.map(name=>[name,graphSignature(sourceAssemblies[name])]));
  for(const name of names){const result=await staticAssemblyProof(window.V2SelectedAssets,window.V2ProductStudio,T,name);staticAssemblies[name]=result.assembly;parity.push(result.report);}
  const mirrored=await staticAssemblyProof(window.V2SelectedAssets,window.V2ProductStudio,T,'metro',{mirror:true,mirrorSourceNode:staticAssemblies.metro.staticBatches.batches[0].members[0].sourceNode});parity.push({...mirrored.report,adversarialMirror:true});
  const cancellation=await staticAssemblyProof(window.V2SelectedAssets,window.V2ProductStudio,T,'metro',{cancel:{checks:0}});
  for(const name of names){assert.equal(sourceAssemblies[name].staticBatches,undefined,'Unopted source load() stays exact and unbatched');assert.equal(graphSignature(sourceAssemblies[name]),originalSources[name],'Static batching leaves separately loaded source graphs and cached bytes unchanged');}
  passed('independent-static-batch-attribute-winding-material-transparency-and-cancellation-parity',{parity,cancellation});
  for(const [variant,assemblies]of [['source',sourceAssemblies],['production-static',staticAssemblies]]){
  const captured=Object.fromEntries(names.map(name=>[name,captureAssembly(assemblies[name],T)]));
  const scene = new T.Scene(), composition = window.V2SelectedScene.create(T, assemblies); scene.add(composition.group);
  const camera = new T.PerspectiveCamera(34, 1, .01, 200);
  composition.frame(camera,.32,1440,900);
  const sourceParity=assembledSourceProof(composition,captured,T);
  assert.deepEqual(Array.from(composition.names), names);
  assert.equal(composition.group.children.length, 6, 'All six assemblies share a single parent space');
  const stats = [];
  for (const name of names) {
    const assembly = assemblies[name], box = new T.Box3().setFromObject(assembly.group), size = box.getSize(new T.Vector3());
    let meshes = 0, triangles = 0, volumes = 0;
    assembly.group.traverse(node => {
      if (!node.isMesh) return;
      meshes++; const geometry = node.geometry, positions = geometry.attributes.position;
      assert.ok(positions?.count >= 3, name + ': genuine position attributes');
      triangles += drawnCount(geometry) / 3;
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      if (geometry.boundingBox.getSize(new T.Vector3()).toArray().every(n => n > 1e-6)) volumes++;
    });
    assert.ok(size.toArray().every(n => Number.isFinite(n) && n > .001), name + ': assembly has physical thickness on all three axes');
    assert.ok(meshes > 2 && triangles > 1000 && volumes > 0, name + ': source-derived volumetric CAD, not a textured rectangle');
    stats.push({name, meshes, triangles, volumetricMeshes:volumes, size:size.toArray()});
  }
  for (const name of ['pi', 'tramtrace']) {
    assert.notEqual(assemblies[name].group, hero[name].group, name + ': independent graph for shared transport');
    assert.equal(hero[name].group.parent, heroParents, name + ': hero remains parented to its original scene');
    assert.equal(requests.get('/assets/models/hero/' + name + '.idx.bin.gz'), 1, name + ': raw transport is reused');
  }
  const localPose = () => names.flatMap(name => {
    const result = []; assemblies[name].group.traverse(node => result.push([node.uuid, ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()])); return result;
  });
  const original = localPose(),originalGraphs=Object.fromEntries(names.map(name=>[name,graphSignature(assemblies[name])])),motionReports=[];
  const schedules={electronics:[.015,.155],connector:[.05,.20],pcb:[.09,.235],screw:[.17,.275],enclosure:[.09,.235]};
  const moving=new Set();
  for(const [index,name]of names.entries()){
    const entry=composition.objects.get(name),roles=new Set();
    if(index>=4){assert.equal(entry.motion.length,0,name+': transit assemblies remain static source CAD');continue;}
    assert.ok(entry.motion.length>=4,name+': actual articulated parts are exposed');
    for(const part of entry.motion){
      assert.ok(!moving.has(part.object),name+': a physical root has one motion descriptor');moving.add(part.object);roles.add(part.role);
      assert.ok(schedules[part.role],name+': role has a documented physical assembly schedule');
      near(part.start,schedules[part.role][0]+index*.012,name+': role start');near(part.end,schedules[part.role][1]+index*.012,name+': role end');
      near(part.boardStart,.09+index*.012,name+': PCB seating start');near(part.boardEnd,.235+index*.012,name+': PCB seating end');
      assert.deepEqual(part.object.position.toArray(),part.base.toArray(),name+': authored local position at assembled endpoint');
      assert.deepEqual(part.object.quaternion.toArray(),part.quaternion.toArray(),name+': authored local orientation at assembled endpoint');
    }
    for(const role of ['pcb','connector','screw','enclosure'])assert.ok(roles.has(role),name+': genuine '+role+' is independently choreographed');
    if(name!=='dual')assert.ok(roles.has('electronics'),name+': real electronics seat before the PCB');
    motionReports.push({name,parts:entry.motion.length,roles:[...roles],lastSeated:Math.max(...entry.motion.map(part=>Math.max(part.end,part.boardEnd)))});
  }
  const fixed=[];for(const name of names)assemblies[name].group.traverse(node=>{if(!moving.has(node))fixed.push({node,position:node.position.toArray(),quaternion:node.quaternion.toArray(),scale:node.scale.toArray()});});
  const smooth=(progress,start,end)=>{const x=Math.max(0,Math.min(1,(progress-start)/(end-start)));return x*x*(3-2*x);};
  const verifyParts=progress=>{
    for(const name of names.slice(0,4))for(const part of composition.objects.get(name).motion){
      const expected=part.base.clone().addScaledVector(part.boardOffset,1-smooth(progress,part.boardStart,part.boardEnd)).addScaledVector(part.offset,1-smooth(progress,part.start,part.end));
      part.object.position.toArray().forEach((value,index)=>near(value,expected.getComponent(index),name+': native progress directly determines exact part position',1e-12));
      assert.deepEqual(part.object.quaternion.toArray(),part.quaternion.toArray(),name+': seating never deforms or rotates authored CAD');
      if(progress===0&&part.role!=='enclosure')assert.ok(part.object.position.distanceTo(part.base)>.001,name+': separated endpoint moves genuine internal parts');
      if(progress>=.311)assert.deepEqual(part.object.position.toArray(),part.base.toArray(),name+': every part restores its exact assembled local position');
    }
    for(const {node,position,quaternion,scale}of fixed){assert.deepEqual(node.position.toArray(),position,'Unanimated source nodes keep local position');assert.deepEqual(node.quaternion.toArray(),quaternion,'Unanimated source nodes keep local orientation');assert.deepEqual(node.scale.toArray(),scale,'No source node is deformed');}
  };
  const pose = () => [...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements,
    ...names.flatMap(name => {const wrapper = composition.objects.get(name).wrapper; return [...wrapper.position.toArray(), ...wrapper.quaternion.toArray(), ...wrapper.scale.toArray()];}),...localPose().flatMap(([, ...values])=>values)];
  const fitReports = [], journeyReports = [],faceReports=[];
  for (const [width, height] of [[1440,900],[390,844],[320,740]]) {
    const samples = [];
    for (let index = 0; index <= 100; index++) {
      const progress = index / 100; composition.frame(camera, progress, width, height);
      verifyParts(progress);
      const value = pose(); assert.ok(value.every(Number.isFinite), 'Finite continuous camera and actual part transforms'); samples.push(value);
      const visible=[];
      for(const name of names){
        const box=composition.bounds.get(name),points=[];
        for(let corner=0;corner<8;corner++)points.push(new T.Vector3(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z).project(camera));
        const minX=Math.max(-1,Math.min(...points.map(point=>point.x))),maxX=Math.min(1,Math.max(...points.map(point=>point.x)));
        const minY=Math.max(-1,Math.min(...points.map(point=>point.y))),maxY=Math.min(1,Math.max(...points.map(point=>point.y)));
        const area=Math.max(0,maxX-minX)*Math.max(0,maxY-minY);
        if(area>.002&&points.some(point=>point.z>-1&&point.z<1))visible.push({name,projectedArea:area});
      }
      assert.ok(visible.length>0,`${width}px progress ${progress}: transition must not become an empty camera view`);
      journeyReports.push({width,progress,visible});
    }
    for (let index = 100; index >= 0; index--) {
      composition.frame(camera, index / 100, width, height); assert.deepEqual(pose(), samples[index], `${width}px reverse reconstructs the same physical pose`);
    }
    const boundaries=new Set([.20,.311,.34,.36,.44,.52,.57,.68,.84,.86]);
    for(const name of names.slice(0,4))for(const part of composition.objects.get(name).motion)for(const value of [part.start,part.end,part.boardStart,part.boardEnd])boundaries.add(value);
    for (const boundary of boundaries) {
      composition.frame(camera, boundary - 1e-7, width, height); const before = pose();
      composition.frame(camera, boundary + 1e-7, width, height);
      assert.ok(pose().every((value, index) => Math.abs(value-before[index]) < .0001), 'No chapter or camera snap at ' + boundary);
    }
    const fittedPoses=new Map();
    for (const endpoint of [0,.08,.155,.20,.235,.275,.311,.32,1,0,.32,1]) {
      composition.frame(camera, endpoint, width, height);verifyParts(endpoint);
      if(endpoint===0||endpoint===1)assert.deepEqual(pose(),samples[endpoint*100],'Repeated exact endpoint includes actual source parts');
      if(fittedPoses.has(endpoint))assert.deepEqual(pose(),fittedPoses.get(endpoint),'Repeated separated/assembled dwell has no accumulated drift');else fittedPoses.set(endpoint,pose());
      const fitted = [];
      for (const name of endpoint===1 ? names.slice(4) : names.slice(0,4)) {
        const box = new T.Box3().setFromObject(composition.objects.get(name).wrapper), coordinates = [];
        for (let index=0;index<8;index++) coordinates.push(new T.Vector3(index&1?box.max.x:box.min.x,index&2?box.max.y:box.min.y,index&4?box.max.z:box.min.z).project(camera).toArray());
        assert.ok(coordinates.every(point => Math.abs(point[0]) < 1 && Math.abs(point[1]) < 1 && Math.abs(point[2]) < 1), `${width}px ${name}: complete model fits the camera`);
        fitted.push({name, minX:Math.min(...coordinates.map(p=>p[0])),maxX:Math.max(...coordinates.map(p=>p[0])),minY:Math.min(...coordinates.map(p=>p[1])),maxY:Math.max(...coordinates.map(p=>p[1]))});
      }
      fitReports.push({width,height,endpoint,models:fitted});
      if(endpoint===1){
        const cosine=camera.getWorldDirection(new T.Vector3()).negate().y,baseline=new T.Vector3(...(width<=760?[.06,1.35,1]:[.14,1.20,1.65])).normalize().y;
        assert.ok(cosine>baseline+.08,'Transit face visibility materially improves over the accepted lower-angle baseline');
        assert.ok(cosine>=Math.sin(Math.PI/3),'Transit top faces are presented from at least 60 degrees elevation');
        faceReports.push({width,elevationDegrees:Math.asin(cosine)*180/Math.PI,topFaceCosine:cosine,baselineTopFaceCosine:baseline});
      }
    }
  }
  composition.frame(camera,.32,1440,900);verifyParts(.32);
  assert.deepEqual(localPose(),original,'True part choreography restores every authored local transform at the assembled dwell');
  for(const name of names)assert.equal(graphSignature(assemblies[name]),originalGraphs[name],name+': reversible choreography changes no graph, geometry bytes, materials, flags, scales, or part identities');
  assembledSourceProof(composition,captured,T);
  for (const name of ['pi', 'tramtrace']) assert.equal(hero[name].group.parent, heroParents);
  passed('real-six-model-geometry-reversible-part-assembly-and-steeper-camera-'+variant, {stats,sourceParity,motionReports,fitReports,faceReports,journeyReports,requests:Object.fromEntries(requests)});
  }
}

function easingMath() {
  const helper = require('../assets/v2-scroll-smoothing.js'); assert.equal(helper.jump,.18);
  const reports = [];
  for (const hz of [30,60,120]) {
    let value=.2, elapsed=0, intermediate=0;
    for (let frame=0;frame<hz/5;frame++) {
      const previous=value; value=helper.step(value,.8,1000/hz); elapsed+=1000/hz;
      assert.ok(value>previous && value<.8, 'Ordinary schedules produce monotonic intermediate frames'); intermediate++;
    }
    near(value,.8-.6*Math.exp(-elapsed/70),'70ms time constant');
    const previous=value; value=helper.step(value,.1,1000/hz); assert.ok(value<previous && value>.1,'Immediate reversal without momentum');
    for (let frame=0;frame<hz*2;frame++) {const before=value; value=helper.step(value,.1,1000/hz); assert.ok(value>=.1 && value<=before,'No reverse overshoot');}
    assert.equal(value,.1); reports.push({hz,intermediate});
  }
  for (const schedule of [[150],[200],[250],[150,50],[125,125],[7,13,45,5,30,40,60]]) {
    let value=.2; for(const dt of schedule)value=helper.step(value,.8,dt);
    near(value,.8-.6*Math.exp(-schedule.reduce((a,b)=>a+b,0)/70),'Slow/irregular software renderer schedule');
  }
  passed('normal-schedule-intermediate-frames-no-overshoot-and-immediate-reversal', {reports});
}

function instrument() {
  const nativeRAF = requestAnimationFrame.bind(window), nativeContext = HTMLCanvasElement.prototype.getContext, nativeTimeout=setTimeout.bind(window), nativeFetch=fetch.bind(window);
  const contexts = new Map();
  const probe = window.__selectedProbe = {contexts:[],samples:[],events:[],prevention:[],scrolls:[],visibility:[],transportGates:[],cpuGates:[],fetches:[],longTasks:[],firstLive:null,recording:false};
  try{new PerformanceObserver(list=>probe.longTasks.push(...list.getEntries().map(entry=>({start:entry.startTime,duration:entry.duration})))).observe({type:'longtask',buffered:true});}catch(_){/* Long Tasks is unavailable in some engines. */}
  window.setTimeout=(callback,delay,...args)=>{if(/v2-selected-work\.js/.test(new Error().stack)){if(delay===4500)probe.transportGates.push(performance.now());if(delay===12000)probe.cpuGates.push(performance.now());}return nativeTimeout(callback,delay,...args);};
  window.fetch=(...args)=>{const url=typeof args[0]==='string'?args[0]:args[0]?.url||String(args[0]);probe.fetches.push({url,t:performance.now()});return nativeFetch(...args);};
  const sample = () => {
    const root=document.querySelector('[data-selected-work]'); if(!root)return null;
    const canvas=root.querySelector('[data-selected-canvas]'),stage=root.querySelector('.v2-selected-stage');
    return {t:performance.now(),y:scrollY,raw:Number(root.dataset.selectedProgress||0),rendered:Number(root.dataset.selectedRenderedProgress||0),frame:Number(root.dataset.selectedFrames||0),warm:Number(root.dataset.selectedWarmFrames||0),mask:root.dataset.selectedWarmMask,state:root.dataset.selectedState,chapter:root.dataset.selectedChapter,readyClass:root.classList.contains('is-live'),canvasVisibility:canvas?getComputedStyle(canvas).visibility:null,canvasOpacity:canvas?Number(getComputedStyle(canvas).opacity):0,lastDraw:root.dataset.selectedLastDraw?JSON.parse(root.dataset.selectedLastDraw):null,warmPixelRatio:Number(root.dataset.selectedWarmPixelRatio),livePixelRatio:Number(root.dataset.selectedLivePixelRatio),bufferWidth:Number(root.dataset.selectedBufferWidth),bufferHeight:Number(root.dataset.selectedBufferHeight),cssWidth:stage?.clientWidth||0,cssHeight:stage?.clientHeight||0,expectedLivePixelRatio:Math.min(devicePixelRatio||1,(stage?.clientWidth||innerWidth)<=760?1.25:1.5)};
  };
  probe.snapshot=sample; probe.begin=()=>{probe.samples=[];probe.events=[];probe.prevention=[];probe.recording=true;probe.samples.push(sample());};
  new MutationObserver(records=>{if(!probe.firstLive&&records.some(record=>record.attributeName==='data-selected-frames')){const value=sample();if(value?.frame>0)probe.firstLive=value;}}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-selected-frames']});
  probe.end=()=>{probe.recording=false;return{samples:probe.samples,events:probe.events,prevention:probe.prevention};};
  window.requestAnimationFrame=callback=>nativeRAF(t=>{callback(t);if(probe.recording){const next=sample();if(next&&next.frame!==probe.samples.at(-1)?.frame)probe.samples.push(next);}});
  HTMLCanvasElement.prototype.getContext=function(type,...args){const context=nativeContext.call(this,type,...args);if(context&&/webgl/i.test(type)&&!contexts.has(context)){const kind=this.matches('[data-selected-canvas]')?'selected':this.matches('[data-aircraft-canvas]')?'aircraft':this.closest('[data-assembly]')?'hero':'other';contexts.set(context,true);probe.contexts.push({kind,t:performance.now()});}return context;};
  for(const type of ['wheel','touchstart','touchmove','touchend'])addEventListener(type,event=>{if(!probe.recording)return;const record={type,trusted:event.isTrusted,deltaY:event.deltaY??null,t:performance.now(),prevented:event.defaultPrevented};probe.events.push(record);queueMicrotask(()=>{record.prevented=event.defaultPrevented;});},{capture:true,passive:true});
  const prevent=Event.prototype.preventDefault;Event.prototype.preventDefault=function(){if(probe.recording&&/^(wheel|touchstart|touchmove|touchend)$/.test(this.type))probe.prevention.push(this.type);return prevent.call(this);};
  addEventListener('scroll',()=>probe.scrolls.push({y:scrollY,t:performance.now()}),{passive:true});
  const NativeObserver=IntersectionObserver;
  window.IntersectionObserver=class extends NativeObserver{constructor(callback,options){super((entries,observer)=>{callback(entries,observer);if(!options?.rootMargin)for(const entry of entries)if(entry.target.matches('[data-selected-work]'))probe.visibility.push({visible:entry.isIntersecting,t:performance.now(),y:scrollY});},options);}};
}
async function open(browser, options={}) {
  const context=await browser.newContext({viewport:options.viewport||{width:1440,height:900},deviceScaleFactor:options.dpr||1,hasTouch:!!options.touch,isMobile:!!options.touch,javaScriptEnabled:!options.noJS,reducedMotion:options.reduced?'reduce':'no-preference'});
  await context.addInitScript(instrument);
  if(options.saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}}));
  if(options.noDecompression)await context.addInitScript(()=>{window.DecompressionStream=undefined;});
  if(options.noWebGL)await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args);};});
  const page=await context.newPage(),requests=[],errors=[],shaders=[];page.setDefaultTimeout(timeout);page.setDefaultNavigationTimeout(timeout);
  page.on('request',request=>requests.push({url:request.url(),t:Date.now()}));page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text()))shaders.push(message.text());});
  return{context,page,requests,errors,shaders};
}
const state=page=>page.evaluate(()=>window.__selectedProbe.snapshot());
const begin=page=>page.evaluate(()=>window.__selectedProbe.begin());
const end=page=>page.evaluate(()=>window.__selectedProbe.end());
async function settled(page) {
  await page.waitForFunction(()=>{const root=document.querySelector('[data-selected-work]');return Number(root.dataset.selectedFrames)>0&&root.dataset.selectedWarmMask==='false'&&Math.abs(Number(root.dataset.selectedProgress)-Number(root.dataset.selectedRenderedProgress))<.000002;},null,{timeout});
}
async function scrollProgress(page,amount) {
  await page.locator(selected).evaluate((root,amount)=>{const stage=root.querySelector('.v2-selected-stage'),track=root.querySelector('.v2-selected-track');const distance=parseFloat(track.style.height)-stage.clientHeight,stickyTop=parseFloat(getComputedStyle(stage).top)||0;scrollTo({top:scrollY+track.getBoundingClientRect().top-stickyTop+distance*amount+(amount===1?1:amount===0?-1:0),behavior:'instant'});},amount);
}
async function jump(page,amount) {
  await scrollProgress(page,amount);
  await page.waitForFunction(amount=>Math.abs(Number(document.querySelector('[data-selected-work]').dataset.selectedProgress)-amount)<.001,amount,{timeout});await settled(page);return state(page);
}
async function hashDestination(page,id,amount) {
  await page.waitForURL('**#'+id);
  await page.evaluate(()=>{window.__selectedHashStable=null;});
  await page.waitForFunction(({id,amount})=>{
    const root=document.querySelector('[data-selected-work]'),now=performance.now();
    if(location.hash!=='#'+id||root.dataset.selectedChapter!==String(amount)||Math.abs(Number(root.dataset.selectedProgress)-amount)>.001){window.__selectedHashStable=null;return false;}
    const previous=window.__selectedHashStable;
    if(!previous||Math.abs(previous.y-scrollY)>.1){window.__selectedHashStable={y:scrollY,since:now};return false;}
    return now-previous.since>=160;
  },{id,amount},{polling:25,timeout});
  await settled(page);const value=await state(page);
  assert.equal(value.chapter,String(amount));near(value.raw,amount,'Native hash reaches its intended endpoint',.001);near(value.rendered,amount,'Rendered hash destination follows the native endpoint',.001);
}
async function ready(page) {
  await page.waitForFunction(()=>{const root=document.querySelector('[data-selected-work]');return root.dataset.selectedReady==='true'&&root.dataset.selectedModelsReady==='6'&&root.dataset.selectedSceneReady==='true'&&root.dataset.selectedBackgroundReady==='true'&&root.dataset.selectedWarmFrames==='2';},null,{timeout});
}
async function snapshot(page) {
  return page.evaluate(()=>({y:scrollY,url:location.href,selected:{...document.querySelector('[data-selected-work]')?.dataset},hero:{...document.querySelector('[data-assembly]')?.dataset},aircraft:{...document.querySelector('[data-aircraft-hero]')?.dataset},contexts:window.__selectedProbe.contexts,scrolls:window.__selectedProbe.scrolls,images:[...document.querySelectorAll('[data-selected-image]')].map(image=>({src:image.currentSrc||image.src,decoded:image.dataset.imageDecoded,complete:image.complete,width:image.naturalWidth})),capture:typeof window.__v2Selected,overflow:document.documentElement.scrollWidth>innerWidth+1}));
}
async function save(run,name,details={}) {
  assert.deepEqual(run.errors,[],'No unhandled browser errors');assert.deepEqual(run.shaders,[],'No shader errors');
  fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify({...details,state:await snapshot(run.page),requests:run.requests},null,2)+'\n');passed(name,details);
}
async function diagnose(run,name,error) {
  const report={error:error.stack,requests:run.requests};try{report.state=await snapshot(run.page);report.trace=await end(run.page);}catch(failure){report.collectionError=failure.message;}
  fs.writeFileSync(path.join(output,name+'-failure.json'),JSON.stringify(report,null,2)+'\n');await run.page.screenshot({path:path.join(output,name+'-failure.png'),timeout:15000}).catch(()=>{});
}
function trusted(trace) {
  assert.deepEqual(trace.prevention,[],'No production preventDefault on native wheel/touch');
  assert.ok(trace.events.length>0&&trace.events.every(event=>event.trusted&&!event.prevented),'Actual browser input remains native');
}
function bounded(trace,before,after) {
  const low=Math.min(before.rendered,after.raw)-tolerance,high=Math.max(before.rendered,after.raw)+tolerance,direction=Math.sign(after.raw-before.raw);let previous=before.rendered;
  assert.ok(trace.samples.length>1,'Actual live-frame samples were recorded');
  for(const sample of trace.samples){assert.ok(Number.isFinite(sample.raw)&&Number.isFinite(sample.rendered));assert.ok(sample.rendered>=low&&sample.rendered<=high,'No overshoot');assert.ok((sample.rendered-previous)*direction>=-tolerance,'Monotonic one-direction detents');previous=sample.rendered;}
  near(after.raw,after.rendered,'Converges to native target',tolerance);
}
async function noLoop(page,label) {await settled(page);const before=await state(page);await page.waitForTimeout(800);assert.equal((await state(page)).frame,before.frame,label);}
function assertWarmDraw(sample,label) {
  const draw=sample.lastDraw;assert.ok(draw,label+': actual last-draw telemetry exists');assert.equal(draw.warm,true,label+': measured draw is a warm pose');
  assert.ok(draw.width>0&&draw.height>0&&Math.max(draw.width,draw.height)<=640,label+': actual warm GPU draw is capped at 640 pixels on its long side');
  const expected=Math.min(sample.expectedLivePixelRatio,640/Math.max(sample.cssWidth,sample.cssHeight));
  near(draw.pixelRatio,expected,label+': warm DPR',.000001);near(sample.warmPixelRatio,expected,label+': exposed warm DPR',.000001);
  assert.ok(Number.isFinite(draw.durationMs)&&draw.durationMs>=0&&draw.calls>0&&draw.triangles>1000&&draw.programs>0,label+': duration and complete render counters are recorded');
}
function assertLiveDraw(sample,label) {
  const draw=sample.lastDraw;assert.ok(draw,label+': actual last-draw telemetry exists');assert.equal(draw.warm,false,label+': measured draw is live');
  near(draw.pixelRatio,sample.expectedLivePixelRatio,label+': original full live DPR',.000001);near(sample.livePixelRatio,sample.expectedLivePixelRatio,label+': exposed live DPR',.000001);
  assert.equal(draw.width,Math.floor(sample.cssWidth*sample.expectedLivePixelRatio),label+': full-resolution width');assert.equal(draw.height,Math.floor(sample.cssHeight*sample.expectedLivePixelRatio),label+': full-resolution height');
  assert.equal(sample.bufferWidth,draw.width,label+': buffer matches completed live draw');assert.equal(sample.bufferHeight,draw.height,label+': buffer matches completed live draw');
}

async function initialAndInput(browser) {
  const run=await open(browser),{page}=run;
  try {
    const started=Date.now();await page.goto(base+'/v2/?v=selected-normal',{waitUntil:'domcontentloaded'});await ready(page);
    await page.locator('[data-aircraft-background-ready="true"]').waitFor({timeout});
    const first=await snapshot(page);assert.equal(first.y,0);assert.equal(first.capture,'undefined','Normal browsing exposes no capture API');
    assert.ok(first.scrolls.every(sample=>sample.y===0),'No-scroll preparation genuinely never enters Selected Work');
    assert.ok(first.images.length===6&&first.images.every(image=>image.decoded==='true'&&image.complete&&image.width>0));
    assert.equal(Number(first.selected.selectedFrames||0),0,'Warm draws never count as live draws');
    assertWarmDraw(await state(page),'Initial hidden preparation');
    assert.deepEqual(first.contexts.map(context=>context.kind).sort(),['aircraft','hero','selected'],'Exactly three real WebGL contexts across the page');
    for(const name of ['pi','tramtrace'])assert.equal(run.requests.filter(request=>heroPack(name).test(request.url)).length,1,'No duplicate '+name+' transfer');
    assert.equal(run.requests.filter(request=>packs.test(request.url)).length,4,'Four new model packs, each once');
    await page.waitForTimeout(900);const hidden=await snapshot(page);assert.equal(hidden.selected.selectedFrames,first.selected.selectedFrames);assert.equal(hidden.selected.selectedWarmFrames,'2');
    await save(run,'initial-no-scroll-six-models-two-hidden-warm-poses-three-contexts',{readyMs:Date.now()-started,timingEnvironment:'Chromium software WebGL; not a real-device benchmark'});
    for(const [label,start,deltas]of[['forward',.15,[120,120,120]],['reverse',.7,[-120,-120,-120]],['assembly-reverse',.30,[-120,-120,-120]]]) {
      const before=await jump(page,start);assertLiveDraw(before,'Native entry after capped warming');
      if(label==='forward'){
        const firstLive=await page.evaluate(()=>window.__selectedProbe.firstLive);assertLiveDraw(firstLive,'First actual live draw following capped warm');
        await save(run,'first-full-size-live-draw-after-capped-warm',{firstLive,measurementNote:'Actual first production draw, before any capture API or diagnostic rendering'});
      }
      await page.mouse.move(720,470);await begin(page);
      for(const delta of deltas){const previous=await state(page);await page.mouse.wheel(0,delta);await page.waitForFunction(({y,direction})=>(scrollY-y)*direction>40,{y:previous.y,direction:Math.sign(delta)});await page.waitForTimeout(35);}
      const expected=before.y+deltas.reduce((a,b)=>a+b,0);await page.waitForFunction(expected=>Math.abs(scrollY-expected)<2,expected);await settled(page);
      const after=await state(page),trace=await end(page);trusted(trace);bounded(trace,before,after);
      near(after.y,expected,'Native wheel distance',2);assert.ok(trace.events.filter(event=>event.type==='wheel').every(event=>Math.abs(event.deltaY)===120));
      await save(run,'native-120-wheel-'+label,{before,after,trace,observedIntermediate:trace.samples.filter(sample=>Math.abs(sample.raw-sample.rendered)>.00008).length});
    }
    const before=await jump(page,.35);await begin(page);await page.mouse.wheel(0,120);
    const forward=await page.waitForFunction(before=>{const sample=window.__selectedProbe.snapshot();return sample.raw>before.raw+.01&&sample.frame>before.frame?sample:false;},before,{polling:10});
    const reversal=await forward.jsonValue();await forward.dispose();await page.mouse.wheel(0,-120);
    await page.waitForFunction(y=>Math.abs(scrollY-y)<2,before.y);await settled(page);const after=await state(page),trace=await end(page);trusted(trace);
    const reverseIndex=trace.samples.findIndex((sample,index)=>index>0&&sample.raw<trace.samples[index-1].raw-.005);
    assert.ok(reverseIndex>0,'Renderer receives a genuine wheel reversal');
    assert.ok(trace.samples[reverseIndex].rendered<=trace.samples[reverseIndex-1].rendered+tolerance,'First reverse-target frame heads back immediately');
    for(const sample of trace.samples)assert.ok(sample.rendered>=before.raw-tolerance&&sample.rendered<=reversal.raw+tolerance,'Reversal stays inside native extrema');
    near(after.raw,before.raw,'Forward and reverse return to the same native target',.001);
    await save(run,'native-active-wheel-reversal',{before,reversal,after,trace,interruptedInterpolation:reversal.raw-reversal.rendered>.00008});
    for(const [from,to]of[[.15,.85],[.85,.1],[.1,1],[1,0]]) {
      await jump(page,from);await begin(page);const final=await jump(page,to),trace=await end(page),changed=trace.samples.filter(sample=>Math.abs(sample.raw-from)>.18);
      assert.ok(changed.length&&changed.every(sample=>Math.abs(sample.raw-sample.rendered)<.000012),'Large jump snaps rather than traversing intermediate chapters');
      if(to===0||to===1){assert.equal(final.raw,to);assert.equal(final.rendered,to);}await save(run,'native-large-jump-'+from+'-'+to,{trace});
    }
    await jump(page,.3);await noLoop(page,'Settled scene does not keep rendering');
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(300);const offscreen=await state(page);await page.waitForTimeout(800);assert.equal((await state(page)).frame,offscreen.frame,'Offscreen Selected Work has no render loop');
    await save(run,'idle-and-offscreen-stop',{offscreen});
    // Actual in-document history traversal, not a synthetic popstate event.
    await page.evaluate(()=>{location.hash='work-framework';});await hashDestination(page,'work-framework',0);
    await page.evaluate(()=>{location.hash='work-transit';});await hashDestination(page,'work-transit',1);
    await page.goBack();await hashDestination(page,'work-framework',0);
    await page.goForward();await hashDestination(page,'work-transit',1);
    for(const viewport of [{width:390,height:844},{width:320,height:740},{width:1440,height:900}]){
      await page.setViewportSize(viewport);
      for(const [label,progress]of[['framework-separated',0],['framework-seating',.155],['framework-assembled',.32],['transit',1]]){
        await jump(page,progress);assert.equal((await snapshot(page)).overflow,false);
        await page.screenshot({path:path.join(output,`native-${label}-${viewport.width}.png`)});
      }
    }
    assert.deepEqual((await snapshot(page)).contexts,first.contexts,'Resize, Back/Forward and chapter entry reuse the same three contexts');
    await save(run,'native-hashes-back-forward-resize-contexts-stable');
    // Real per-context graphics loss leaves the other renderers alive.
    const loss=await page.locator(canvas).evaluate(node=>{const gl=node.getContext('webgl2')||node.getContext('webgl'),extension=gl?.getExtension('WEBGL_lose_context');if(!extension)return false;extension.loseContext();return true;});
    assert.equal(loss,true,'Real Selected context-loss extension available');await page.locator('[data-selected-state="unavailable"]').waitFor();
    assert.equal(await page.locator(selected+'.is-scene').count(),0,'Selected graphics loss returns static content');await readable(page);
    const siblings=await page.evaluate(()=>[document.querySelector('[data-assembly] canvas'),document.querySelector('[data-aircraft-canvas]')].map(node=>{const gl=node?.getContext('webgl2')||node?.getContext('webgl');return gl&&!gl.isContextLost();}));assert.deepEqual(siblings,[true,true],'Hero and aircraft contexts are unaffected');
    await save(run,'selected-only-context-loss-readable-and-siblings-alive');
  }catch(error){await diagnose(run,'normal-input',error);throw error;}finally{await run.context.close();}
}

async function readable(page) {
  assert.equal(await page.locator(selected+' [data-selected-chapter]').count(),2);
  for(const id of ['work-framework','work-transit']){const chapter=page.locator('#'+id);assert.equal(await chapter.isVisible(),true,id+' remains readable');assert.notEqual(await chapter.getAttribute('aria-hidden'),'true');assert.ok(await chapter.locator('a[href]').count()>0,'Project navigation remains available');}
  for(const image of await page.locator('[data-selected-image]').all())assert.equal(await image.isVisible(),true,'All original fallback images remain visible');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Fallback has no horizontal overflow');
}
async function guards(browser) {
  for(const [name,options]of[['reduced-motion',{reduced:true}],['save-data',{saveData:true}],['short-viewport',{viewport:{width:1440,height:550}}],['no-webgl',{noWebGL:true}],['no-decompression',{noDecompression:true}],['no-javascript',{noJS:true,viewport:{width:320,height:740}}]]) {
    const run=await open(browser,options);try{
      await run.page.goto(base+'/v2/?v=selected-'+name,{waitUntil:'domcontentloaded'});
      if(!options.noJS)await run.page.waitForFunction(()=>['static','unavailable'].includes(document.querySelector('[data-selected-work]').dataset.selectedState),null,{timeout});
      await readable(run.page);assert.equal(await run.page.locator(selected+'.is-scene').count(),0);
      if(options.reduced||options.saveData||name==='short-viewport'||options.noDecompression)assert.equal(run.requests.filter(request=>packs.test(request.url)).length,0,'Preference/platform guard avoids unnecessary new CAD transfer');
      if(!options.noJS)await save(run,name+'-readable-fallback');else{assert.deepEqual(run.errors,[]);passed(name+'-readable-fallback');}
    }catch(error){await diagnose(run,name,error);throw error;}finally{await run.context.close();}
  }
}

async function fastEntry(browser) {
  const run=await open(browser,{viewport:{width:390,height:844}}),{page,context}=run;let released=false,heldResolve;const held=new Promise(resolve=>{heldResolve=resolve;}),pending=[];
  await context.route(packs,route=>released?route.continue():new Promise(resolve=>{pending.push(async()=>{try{await route.continue();}finally{resolve();}});heldResolve();}));
  const release=async()=>{released=true;await Promise.all(pending.splice(0).map(resume=>resume()));};
  try{
    await page.goto(base+'/v2/?v=selected-fast-entry#work-transit',{waitUntil:'domcontentloaded'});await deadline(held,'Held Selected geometry request');
    assert.ok(pending.length>0,'Real new model transport is held');assert.equal(Number((await state(page)).frame),0);
    await page.waitForFunction(()=>document.querySelector('[data-selected-work]').dataset.selectedChapter==='1');
    assert.equal(await page.locator(selected+' [data-selected-chapter="1"].is-current').count(),1,'Pending native Transit destination immediately selects Transit copy and posters');
    assert.equal(await page.locator(selected+' [data-selected-chapter="0"]').getAttribute('aria-hidden'),'true','Framework copy does not remain active during pending Transit entry');
    assert.equal(await page.locator(selected+' [data-selected-chapter="1"] [data-selected-image]').evaluateAll(images=>images.length===2&&images.every(image=>getComputedStyle(image).visibility==='visible')),true,'Both requested Transit fallback images are visible before geometry resolves');
    const fallback=await page.locator('[data-selected-image]').evaluateAll(images=>images.some(image=>{const css=getComputedStyle(image);return css.visibility!=='hidden'&&Number(css.opacity)>0;}));assert.equal(fallback,true,'Early entry retains a visible fallback while actual geometry is pending');
    await release();await settled(page);await page.waitForFunction(()=>document.querySelector('[data-selected-work]').dataset.selectedModelsReady==='6');
    const current=await state(page);assert.equal(current.chapter,'1');near(current.raw,current.rendered,'Fast entry draws its current native destination',tolerance);assert.equal(current.mask,'false');assertLiveDraw(current,'Fast entry retains full live resolution');
    await page.waitForTimeout(700);assert.equal((await state(page)).chapter,'1','Late warming never resets the requested destination');
    await save(run,'fast-transit-entry-promotes-held-transport-without-blank',{current});
  }catch(error){await diagnose(run,'fast-entry',error);throw error;}finally{await release().catch(()=>{});await run.context.close();}
}

async function heldHeroTextures(browser) {
  const run=await open(browser),{page,context}=run;let released=false,enteredResolve;const entered=new Promise(resolve=>{enteredResolve=resolve;}),pending=[];
  await context.route(heroPack('tramtrace'),route=>released?route.continue():new Promise(resolve=>{pending.push(async()=>{try{await route.continue();}finally{resolve();}});enteredResolve();}));
  const release=async()=>{released=true;await Promise.all(pending.splice(0).map(resume=>resume()));};
  const textures=['/assets/models/framework-esp32/framework-markings-silk.svg','/assets/models/framework-dual-usb/framework-dual-usb-silk.svg','/assets/models/hardware/framework-logic-analyser/silk-front.svg','/assets/models/hardware/framework-logic-analyser/silk-back.svg','/assets/models/hardware/metroboard/silk-front.svg','/assets/models/hardware/metroboard/silk-back.svg'];
  try{
    const observedPack=page.waitForRequest(packs),observedTextures=Promise.all(textures.map(file=>page.waitForRequest(request=>new URL(request.url()).pathname===file)));
    await page.goto(base+'/v2/?v=selected-held-hero-textures',{waitUntil:'domcontentloaded'});await deadline(entered,'Held hero request');
    await observedTextures;await observedPack;
    const timing=await page.evaluate(()=>({gates:window.__selectedProbe.transportGates,fetches:window.__selectedProbe.fetches,heroReady:document.querySelector('[data-assembly]').dataset.assemblyModelsReady,y:scrollY}));
    const firstPack=run.requests.find(request=>packs.test(request.url)),firstFetch=timing.fetches.find(request=>/\/models\/selected\//.test(request.url));
    assert.ok(pending.length>0,'Foreground lead is genuinely still held');assert.ok(Number(timing.heroReady||0)<3);assert.equal(timing.y,0);
    for(const file of textures){const request=run.requests.find(request=>new URL(request.url).pathname===file);assert.ok(request&&request.t<firstPack.t,'Early texture discovery precedes gated geometry: '+file);}
    for(const source of ['v2-selected-assets.js','v2-selected-scene.js'])assert.ok(run.requests.find(request=>request.url.includes('/assets/'+source)).t<firstPack.t,'Scene code starts independently of the hero gate');
    assert.ok(timing.gates.length>0&&firstFetch.t-timing.gates[0]>=4400,'Held foreground bytes defer the new geometry until the bounded 4.5s fallback');
    await release();await ready(page);await save(run,'held-hero-immediate-textures-and-bounded-geometry-gate',{timing,textures,firstPack});
  }catch(error){await diagnose(run,'held-hero-textures',error);throw error;}finally{await release().catch(()=>{});await run.context.close();}
}

async function mobileTouch(browser) {
  const run=await open(browser,{touch:true,dpr:2,viewport:{width:390,height:844}}),{page,context}=run;
  try{
    await page.goto(base+'/v2/?v=selected-touch#work-framework',{waitUntil:'domcontentloaded'});await settled(page);const before=await jump(page,.2),cdp=await context.newCDPSession(page);await begin(page);
    const point=y=>[{x:195,y,id:1,radiusX:4,radiusY:4,force:1}];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(650)});
    for(const y of [625,600,575,550,525,500,475,450]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(y)});await page.waitForTimeout(65);}
    await page.waitForTimeout(120);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(y=>scrollY>y+80,before.y);await settled(page);
    const after=await state(page),trace=await end(page);trusted(trace);assert.ok(trace.events.some(event=>event.type==='touchmove'));assert.ok(trace.samples.length>1&&trace.samples.every(sample=>Math.abs(sample.raw-sample.rendered)<=tolerance),'Touch follows native scrolling directly');assertLiveDraw(after,'High-DPR mobile keeps its accepted 1.25 live cap');near(after.livePixelRatio,1.25,'High-DPR mobile cap');
    await noLoop(page,'Touch scene settles without residual rendering');await save(run,'native-mobile-touch-directness',{before,after,trace});
  }catch(error){await diagnose(run,'mobile-touch',error);throw error;}finally{await run.context.close();}
}

async function warmingInput(browser) {
  const run=await open(browser,{viewport:{width:390,height:844}}),{page,context}=run;
  await context.addInitScript(({budget})=>{
    const nativeTimeout=setTimeout.bind(window),nativeRAF=requestAnimationFrame.bind(window);
    const data=window.__selectedResponseProbe={started:performance.now(),active:true,beats:[],inputs:[],phases:[],posterSamples:[]};
    let previous=data.started,timer,deadline;
    const read=()=>{
      const root=document.querySelector('[data-selected-work]'),canvas=root?.querySelector('[data-selected-canvas]');
      const current=root?.querySelector('[data-selected-chapter].is-current')||root?.querySelector('[data-selected-chapter="0"]');
      const posters=current?[...current.querySelectorAll('[data-selected-image]')]:[];
      return{t:performance.now(),y:scrollY,background:root?.dataset.selectedBackgroundState,sceneReady:root?.dataset.selectedSceneReady,models:Number(root?.dataset.selectedModelsReady||0),warm:Number(root?.dataset.selectedWarmFrames||0),live:Number(root?.dataset.selectedFrames||0),mask:root?.dataset.selectedWarmMask,canvasVisibility:canvas?getComputedStyle(canvas).visibility:null,posterCount:posters.length,postersVisible:posters.every(image=>getComputedStyle(image).visibility==='visible'&&Number(getComputedStyle(image).opacity)>0),menu:document.querySelector('[data-v2-menu]')?.getAttribute('aria-expanded')};
    };
    data.read=read;
    data.stop=()=>{data.active=false;clearTimeout(timer);clearTimeout(deadline);data.stopped=performance.now();};
    const beat=()=>{
      if(!data.active)return;const sample=read();data.beats.push({t:sample.t,gap:sample.t-previous,background:sample.background,sceneReady:sample.sceneReady});previous=sample.t;
      if(sample.canvasVisibility!==null)data.posterSamples.push(sample);
      timer=nativeTimeout(beat,25);
    };
    timer=nativeTimeout(beat,25);deadline=nativeTimeout(data.stop,budget);
    for(const type of ['click','keydown'])addEventListener(type,event=>{
      if(!data.active||!event.isTrusted)return;
      if(type==='click'&&!event.target.closest?.('[data-v2-menu]'))return;
      if(type==='keydown'&&event.key!=='Escape')return;
      const input={type,key:event.key||null,trusted:event.isTrusted,received:read()};data.inputs.push(input);
      nativeRAF(()=>{input.nextFrame=read();nativeRAF(()=>{input.afterPaint=read();});});
    },{capture:true,passive:true});
    new MutationObserver(records=>{
      for(const record of records)data.phases.push({t:performance.now(),attribute:record.attributeName,value:record.target.getAttribute(record.attributeName)});
      if(!data.preparationReady&&records.some(record=>record.attributeName==='data-selected-background-ready'&&record.target.getAttribute(record.attributeName)==='true')){
        const sample=read();data.preparationReady=sample.t;
        data.beats.push({t:sample.t,gap:sample.t-previous,background:sample.background,sceneReady:sample.sceneReady,boundary:'selected-ready'});
        data.posterSamples.push(sample);clearTimeout(timer);
      }
    }).observe(document,{subtree:true,attributes:true,attributeFilter:['data-selected-models-ready','data-selected-scene-ready','data-selected-warm-frames','data-selected-background-ready','data-selected-background-state']});
  },{budget:timeout});
  try{
    await page.goto(base+'/v2/?v=selected-warming-input',{waitUntil:'domcontentloaded'});
    await page.locator('[data-v2-menu]').waitFor({state:'visible'});
    await page.waitForFunction(()=>{const root=document.querySelector('[data-selected-work]');return root.dataset.selectedBackgroundState==='warming'&&root.dataset.selectedBackgroundReady!=='true';},null,{timeout});
    const actions=[];let prepared=false,preparationFailure;
    // Deliberately version-neutral readiness for same-probe baseline timing.
    // Exact warm-task contracts remain enforced by the normal acceptance groups.
    const preparation=page.waitForFunction(()=>{const root=document.querySelector('[data-selected-work]');return root.dataset.selectedModelsReady==='6'&&root.dataset.selectedSceneReady==='true'&&root.dataset.selectedBackgroundReady==='true';},null,{timeout}).then(()=>{prepared=true;},error=>{prepared=true;preparationFailure=error;});
    while(!prepared){
      const before=await page.evaluate(()=>window.__selectedResponseProbe.read());
      if(before.background==='ready')break;
      const clickStarted=Date.now();await page.locator('[data-v2-menu]').click();const clickPromiseMs=Date.now()-clickStarted;
      assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'true','A real native menu click responds while preparation is pending');
      const escapeStarted=Date.now();await page.keyboard.press('Escape');const escapePromiseMs=Date.now()-escapeStarted;
      assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'false','A real Escape key closes the menu during preparation');
      const after=await page.evaluate(()=>window.__selectedResponseProbe.read());actions.push({before,after,clickPromiseMs,escapePromiseMs});
      if(!prepared)await page.waitForTimeout(50);
    }
    await preparation;if(preparationFailure)throw preparationFailure;
    await page.waitForFunction(()=>window.__selectedResponseProbe.inputs.every(input=>input.afterPaint));
    const response=await page.evaluate(()=>{const probe=window.__selectedResponseProbe;probe.stop();const {read,stop,...result}=probe;return{...result,longTasks:window.__selectedProbe.longTasks};});
    assert.ok(actions.length>0&&actions.some(action=>action.before.background==='warming'),'Native actions are genuinely requested before Selected preparation finishes');
    assert.ok(response.inputs.some(input=>input.type==='click')&&response.inputs.some(input=>input.type==='keydown'),'Trusted native menu and keyboard events were observed in the page');
    assert.ok(response.inputs.every(input=>input.trusted&&input.nextFrame&&input.afterPaint),'Every observed input has next-frame and after-paint response evidence');
    assert.ok(response.beats.length>2,'A real event-loop heartbeat spans preparation');
    assert.ok(response.posterSamples.length>0&&response.posterSamples.every(sample=>sample.live===0&&sample.canvasVisibility==='hidden'&&sample.posterCount===4&&sample.postersVisible),'All sampled background phases preserve the four active Framework posters and mask every warm canvas');
    assert.equal(response.active,false,'The test heartbeat terminates after finite preparation');
    const beforeIdle=await state(page);await page.waitForTimeout(800);const afterIdle=await state(page);
    assert.equal(afterIdle.frame,beforeIdle.frame,'Input measurement does not leave a hidden production rendering loop');assert.equal(afterIdle.warm,beforeIdle.warm,'Preparation stops issuing hidden GPU work after readiness');
    assert.ok(Number.isFinite(response.preparationReady),'Responsiveness horizon ends at the actual Selected readiness mutation');
    const readyAt=response.preparationReady;
    const preparationTasks=response.longTasks.filter(task=>task.start<readyAt&&task.start+task.duration>=response.started);
    const metrics={maxHeartbeatGapMs:Math.max(...response.beats.map(beat=>beat.gap)),maxLongTaskMs:Math.max(0,...preparationTasks.map(task=>task.duration)),totalLongTaskMs:preparationTasks.reduce((sum,task)=>sum+task.duration,0),maxClickPromiseMs:Math.max(...actions.map(action=>action.clickPromiseMs)),maxEscapePromiseMs:Math.max(...actions.map(action=>action.escapePromiseMs)),maxInputToNextFrameMs:Math.max(...response.inputs.map(input=>input.nextFrame.t-input.received.t)),maxInputToAfterPaintMs:Math.max(...response.inputs.map(input=>input.afterPaint.t-input.received.t))};
    await save(run,'native-menu-key-during-selected-preparation-stall-evidence',{actions,response,metrics,measurementNote:'Native Playwright click/key promises include input dispatch and driver overhead. Browser timestamps measure trusted event receipt to RAF/after-paint; the explicitly bounded 25ms test heartbeat measures event-loop stalls. Values are recorded for same-environment baseline comparison, with no unmeasured timing threshold.'});
  }catch(error){await diagnose(run,'warming-input',error);throw error;}finally{await page.evaluate(()=>window.__selectedResponseProbe?.stop()).catch(()=>{});await run.context.close();}
}

async function interruptedWarmMask(browser) {
  const run=await open(browser),{page,context}=run;
  await context.addInitScript(()=>{
    const idle=requestIdleCallback.bind(window),raf=requestAnimationFrame.bind(window),cancelIdle=cancelIdleCallback.bind(window),cancelRAF=cancelAnimationFrame.bind(window);
    const idleQueue=new Map(),liveQueue=new Map(),samples=[];let next=-1,dispatched=0;
    const control=window.__selectedMaskControl={holdLive:false};
    const selectedCall=()=>/v2-selected-work\.js/.test(new Error().stack);
    const read=label=>{
      const root=document.querySelector('[data-selected-work]'),sample=window.__selectedProbe.snapshot();
      const image=root?.querySelector('[data-selected-chapter].is-current [data-selected-image]');
      return{label,...sample,background:root?.dataset.selectedBackgroundState,posterVisibility:image?getComputedStyle(image).visibility:null};
    };
    window.requestIdleCallback=(callback,options)=>{if(!selectedCall())return idle(callback,options);const id=next--;idleQueue.set(id,()=>idle(deadline=>{callback(deadline);dispatched++;},options));return id;};
    window.cancelIdleCallback=id=>{if(!idleQueue.delete(id))cancelIdle(id);};
    window.requestAnimationFrame=callback=>{
      if(callback.name!=='render'||!selectedCall())return raf(callback);
      const observed=time=>{samples.push(read('before-live'));callback(time);samples.push(read('after-live'));};
      if(!control.holdLive)return raf(observed);const id=next--;liveQueue.set(id,observed);return id;
    };
    window.cancelAnimationFrame=id=>{if(!liveQueue.delete(id))cancelRAF(id);};
    control.releaseIdle=()=>{const entry=idleQueue.entries().next().value;if(!entry)return false;idleQueue.delete(entry[0]);entry[1]();return true;};
    control.releaseLive=()=>{control.holdLive=false;for(const callback of liveQueue.values())raf(callback);liveQueue.clear();};
    control.state=()=>({...read('snapshot'),idlePending:idleQueue.size,livePending:liveQueue.size,dispatched,samples});
    new MutationObserver(records=>{if(records.some(record=>record.attributeName==='data-selected-warm-mask'))samples.push(read('mask-change'));}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-selected-warm-mask']});
  });
  const sample=()=>page.evaluate(()=>window.__selectedMaskControl.state());
  const releaseIdle=async()=>{
    await page.waitForFunction(()=>window.__selectedMaskControl.state().idlePending>0);
    const before=(await sample()).dispatched;assert.equal(await page.evaluate(()=>window.__selectedMaskControl.releaseIdle()),true);
    await page.waitForFunction(previous=>window.__selectedMaskControl.state().dispatched>previous,before);
  };
  const assertMasked=(value,label)=>{assert.equal(value.mask,'true',label);assert.equal(value.readyClass,false,label);assert.equal(value.canvasVisibility,'hidden',label);assert.equal(value.posterVisibility,'visible',label);};
  try{
    await page.goto(base+'/v2/?v=selected-interrupted-warm-mask',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__selectedMaskControl.state().idlePending>0);await scrollProgress(page,.3);
    // Visible promotion must work through the same real per-model idle turns.
    // Release only actual production idle callbacks; no model/promise is faked.
    for(let turn=0;turn<16;turn++){
      const status=await page.waitForFunction(()=>{const value=window.__selectedMaskControl.state();return value.frame>0||value.idlePending>0?value:false;});
      const value=await status.jsonValue();await status.dispose();if(value.frame>0)break;await releaseIdle();
    }
    await settled(page);await page.waitForFunction(()=>window.__selectedMaskControl.state().canvasOpacity>.99);
    const firstLive=await sample();assert.equal(firstLive.warm,0,'A true visible frame precedes any background warm pose');assert.equal(firstLive.mask,'false');
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.waitForFunction(()=>{const value=window.__selectedMaskControl.state();return scrollY===0&&value.mask==='true'&&value.idlePending>0;});
    const remasked=await sample();assertMasked(remasked,'Returning offscreen immediately masks the previously live canvas');
    const duringFade=remasked.samples.find(value=>value.label==='mask-change'&&value.frame>0&&value.mask==='true');
    assert.ok(duringFade&&duringFade.canvasOpacity>0,'Mask transition is observed while the old live canvas still has opacity');assertMasked(duringFade,'Visibility mask covers the whole fade');
    await releaseIdle(); // background foreground-settled/initialize boundary
    await releaseIdle(); // first real GPU warm pose
    await page.waitForFunction(()=>{const value=window.__selectedMaskControl.state();return value.warm===1&&value.idlePending>0;});
    const warmed=await sample();assertMasked(warmed,'First offscreen warm pose stays hidden');assert.equal(warmed.frame,remasked.frame);assertWarmDraw(warmed,'Interrupted offscreen warm pose');
    await page.evaluate(()=>{window.__selectedMaskControl.holdLive=true;});await scrollProgress(page,.85);
    await page.waitForFunction(()=>{const value=window.__selectedMaskControl.state();return value.livePending>0&&Math.abs(value.raw-.85)<.001;});
    assertMasked(await sample(),'Rapid re-entry stays masked until a current live draw');
    await releaseIdle(); // canceled old second warm continuation
    await page.waitForFunction(()=>window.__selectedMaskControl.state().idlePending===0);
    const canceled=await sample();assertMasked(canceled,'Canceled continuation never unmasks a stale GPU pose');assert.equal(canceled.warm,1);assert.equal(canceled.frame,warmed.frame);
    await page.evaluate(()=>window.__selectedMaskControl.releaseLive());await settled(page);const final=await sample();
    assert.ok(final.frame>canceled.frame);assert.equal(final.mask,'false');assert.equal(final.canvasVisibility,'visible');assert.equal(final.chapter,'1');
    near(final.rendered,final.raw,'Current live draw matches the promoted native target',tolerance);
    const firstUnmasked=final.samples.find(value=>value.label==='after-live'&&value.frame>canceled.frame);
    assert.ok(firstUnmasked&&firstUnmasked.mask==='false');near(firstUnmasked.rendered,canceled.raw,'First unmasked frame is current, not a warm endpoint',tolerance);
    assertLiveDraw(firstUnmasked,'The very first unmasked frame restores full live resolution');assertLiveDraw(final,'Promoted current frame retains full live resolution');
    await save(run,'interrupted-live-offscreen-warm-current-frame-unmask',{firstLive,remasked,duringFade,warmed,canceled,final,schedulingControl:'Only Selected production idle callbacks and render RAF are held; native scroll continues normally'});
  }catch(error){await diagnose(run,'interrupted-warm-mask',error);throw error;}finally{await run.context.close();}
}

async function pendingPreferenceChange(browser) {
  const run=await open(browser),{page,context}=run;let released=false,enteredResolve;const entered=new Promise(resolve=>{enteredResolve=resolve;}),pending=[];
  const environment=/\/assets\/models\/hero\/environment\.bin(?:\.gz)?(?:\?|$)/;
  await context.route(environment,route=>released?route.continue():new Promise(resolve=>{pending.push(async()=>{try{await route.continue();}finally{resolve();}});enteredResolve();}));
  const release=async()=>{released=true;await Promise.all(pending.splice(0).map(resume=>resume()));};
  await context.addInitScript(()=>{
    let environment;
    Object.defineProperty(window,'V2HeroEnvironment',{configurable:true,get:()=>environment,set:value=>{
      environment={...value,load:async(...args)=>{
        const selected=/v2-selected-work\.js/.test(new Error().stack);
        if(selected)window.__selectedEnvironmentEntered=true;
        const result=await value.load(...args);
        if(selected)window.__selectedEnvironmentReturned=true;
        return result;
      }};
    }});
  });
  try{
    await page.goto(base+'/v2/?v=selected-pending-preference#work-framework',{waitUntil:'domcontentloaded'});await deadline(entered,'Held environment transfer');
    await page.waitForFunction(()=>window.__selectedEnvironmentEntered===true&&document.querySelector('[data-selected-work]').dataset.selectedModelsReady==='6',null,{timeout});
    const originalCanvas=await page.locator(canvas).elementHandle();
    const before=await snapshot(page);assert.equal(before.contexts.filter(context=>context.kind==='selected').length,0,'The renderer is not created before the pending environment await');
    assert.ok(pending.length>0,'Real shared environment bytes are held during Selected initialization');
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-selected-state="static"]').waitFor();await readable(page);
    assert.equal(await page.locator(selected+' [data-selected-chapter] a[href]').count(),6,'All six project links are readable during interrupted initialization');
    await release();await page.waitForFunction(()=>window.__selectedEnvironmentReturned===true);await page.waitForTimeout(500);
    const interrupted=await snapshot(page);assert.equal(interrupted.selected.selectedState,'static','Late environment completion cannot overwrite the chosen static state');
    assert.equal(interrupted.contexts.filter(context=>context.kind==='selected').length,0,'Interrupted initialization never leaks a graphics context');
    assert.notEqual(interrupted.selected.selectedSceneReady,'true');await readable(page);
    await page.emulateMedia({reducedMotion:'no-preference'});await page.locator(selected+'.is-scene').waitFor();await jump(page,.3);
    const resumed=await snapshot(page);assert.equal(resumed.selected.selectedModelsReady,'6');assert.equal(resumed.contexts.filter(context=>context.kind==='selected').length,1);
    assert.equal(await originalCanvas.evaluate(node=>node===document.querySelector('[data-selected-canvas]')),true,'Pending initialization resumes the original canvas');
    for(const name of ['pi','tramtrace'])assert.equal(run.requests.filter(request=>heroPack(name).test(request.url)).length,1,'Preference restoration reuses '+name+' transport');
    assert.equal(run.requests.filter(request=>packs.test(request.url)).length,4,'Preference restoration reuses all new geometry transports');
    await save(run,'pending-environment-reduced-motion-static-and-resume',{before,interrupted,resumed,heldRealEnvironment:true});
    await originalCanvas.dispose();
  }catch(error){await diagnose(run,'pending-preference',error);throw error;}finally{await release().catch(()=>{});await run.context.close();}
}

async function readyPreferenceChange(browser) {
  const run=await open(browser),{page}=run;
  try{
    await page.goto(base+'/v2/?v=selected-ready-preference',{waitUntil:'domcontentloaded'});await ready(page);await page.locator('[data-aircraft-background-ready="true"]').waitFor({timeout});
    await jump(page,.3);const originalCanvas=await page.locator(canvas).elementHandle(),before=await snapshot(page),cycles=[];
    for(let cycle=0;cycle<2;cycle++){
      await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-selected-state="static"]').waitFor();await readable(page);
      assert.equal(await page.locator(selected+' [data-selected-chapter] a[href]').count(),6);
      const paused=await snapshot(page);await page.waitForTimeout(600);const staticState=await snapshot(page);
      assert.equal(staticState.selected.selectedState,'static');assert.equal(staticState.selected.selectedFrames,paused.selected.selectedFrames,'Reduced motion keeps the prepared scene idle');
      assert.deepEqual(staticState.contexts,before.contexts,'Choosing a static presentation creates no context');
      await page.emulateMedia({reducedMotion:'no-preference'});await page.locator(selected+'.is-scene').waitFor();await jump(page,cycle ? .2 : .8);
      const resumed=await snapshot(page);assert.deepEqual(resumed.contexts,before.contexts,'Each restoration reuses all existing contexts');
      assert.equal(await originalCanvas.evaluate(node=>node===document.querySelector('[data-selected-canvas]')),true,'Ready scene resumes the same canvas');
      assert.equal(resumed.selected.selectedModelsReady,'6');assert.equal(resumed.selected.selectedWarmFrames,'2','Restoring a prepared scene does not repeat warm poses');
      cycles.push({paused:staticState.selected,resumed:resumed.selected});
    }
    await noLoop(page,'Restored ready scene settles normally');await save(run,'ready-reduced-motion-two-round-trips-reuse-canvas-and-context',{before,cycles});await originalCanvas.dispose();
  }catch(error){await diagnose(run,'ready-preference',error);throw error;}finally{await run.context.close();}
}

async function studies(browser) {
  const run=await open(browser),{page}=run;try{
    await page.goto(base+'/v2/?selectedCapture=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__v2Selected?.assemblies&&Object.keys(window.__v2Selected.assemblies).length===6,null,{timeout});
    await ready(page);const cappedWarm=await state(page);assertWarmDraw(cappedWarm,'Study begins after actual capped background warming');
    await page.evaluate(()=>{window.__selectedStudyEntryStarted=performance.now();});await jump(page,0);
    const firstProduction=await page.evaluate(()=>({entryStartedMs:window.__selectedStudyEntryStarted,firstLive:window.__selectedProbe.firstLive}));
    assertLiveDraw(firstProduction.firstLive,'Study records the first actual full-size production draw before capture renders');
    fs.writeFileSync(path.join(output,'first-production-live-after-capped-warm.json'),JSON.stringify({cappedWarm,...firstProduction,entryToLiveMs:firstProduction.firstLive.t-firstProduction.entryStartedMs,measurementNote:'Native entry after two capped warm poses; captured before any seekProgress/drawProgress diagnostics'},null,2)+'\n');
    const api=await page.evaluate(()=>{const a=window.__v2Selected;return{keys:Object.keys(a),scene:a.scene?.isScene,renderer:!!a.renderer,camera:a.camera?.isPerspectiveCamera,names:Object.keys(a.assemblies),stats:a.composition.stats()};});
    assert.ok(api.scene&&api.renderer&&api.camera);for(const key of ['seekProgress','drawProgress','resume','composition'])assert.ok(api.keys.includes(key));
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:740}]) {
      await page.setViewportSize(viewport);await scrollProgress(page,.4);
      for(const progress of [0,.155,.25,.311,.32,.5,.75,1]){await page.evaluate(progress=>window.__v2Selected.seekProgress(progress),progress);await page.waitForTimeout(450);await page.waitForFunction(()=>document.querySelector('[data-selected-work]').getAnimations({subtree:true}).every(animation=>!['running','pending'].includes(animation.playState)));await page.screenshot({path:path.join(output,`study-${viewport.width}-${String(progress).replace('.','_')}.png`)});}
    }
    // Temporary, explicitly capture-only A/B: distinguish real coating depth
    // issues from shadow-map artifacts without changing production materials.
    await page.setViewportSize({width:1440,height:900});await scrollProgress(page,.4);
    await page.evaluate(()=>window.__v2Selected.seekProgress(1));await page.waitForTimeout(450);
    await page.screenshot({path:path.join(output,'diagnostic-transit-shadows.png')});
    const materials=await page.evaluate(()=>{
      const api=window.__v2Selected,result=[];api.scene.updateMatrixWorld(true);
      for(const [name,target]of[['metro','mat_12'],['tramtrace','mat_30']])api.assemblies[name].group.traverse(node=>{
        const matched=[].concat(node.material||[]).filter(material=>material.name===target);if(!matched.length)return;
        node.geometry.computeBoundingBox();
        result.push({assembly:name,mesh:node.name,matrix:node.matrix.toArray(),matrixWorld:node.matrixWorld.toArray(),position:node.position.toArray(),scale:node.scale.toArray(),castShadow:node.castShadow,receiveShadow:node.receiveShadow,renderOrder:node.renderOrder,bounds:{min:node.geometry.boundingBox.min.toArray(),max:node.geometry.boundingBox.max.toArray()},materials:matched.map(material=>({name:material.name,type:material.type,color:material.color?.getHexString(),metalness:material.metalness,roughness:material.roughness,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite,depthTest:material.depthTest,side:material.side,polygonOffset:material.polygonOffset,polygonOffsetFactor:material.polygonOffsetFactor,polygonOffsetUnits:material.polygonOffsetUnits,map:material.map?.image?.src??null}))});
      });return result;
    });
    assert.ok(materials.some(item=>item.assembly==='metro')&&materials.some(item=>item.assembly==='tramtrace'),'Real requested coating materials were located');
    await page.evaluate(()=>{window.__v2Selected.renderer.shadowMap.enabled=false;window.__v2Selected.seekProgress(1);});await page.waitForTimeout(450);
    await page.screenshot({path:path.join(output,'diagnostic-transit-no-shadows.png')});
    await page.evaluate(()=>{window.__v2Selected.renderer.shadowMap.enabled=true;window.__v2Selected.seekProgress(1);});
    fs.writeFileSync(path.join(output,'diagnostic-transit-materials.json'),JSON.stringify(materials,null,2)+'\n');
    const drawMeasurements=[];
    for(let repetition=0;repetition<3;repetition++)for(const shadows of [true,false]){
      const result=await page.evaluate(({repetition,shadows})=>{
        const api=window.__v2Selected,stage=document.querySelector('.v2-selected-stage'),before={shadows:api.renderer.shadowMap.enabled,autoReset:api.renderer.info.autoReset};
        const measurement=api.drawProgress(1,{warm:false,shadows});
        return{repetition,shadows,measurement,before,after:{shadows:api.renderer.shadowMap.enabled,autoReset:api.renderer.info.autoReset},cssWidth:stage.clientWidth,cssHeight:stage.clientHeight,expectedLivePixelRatio:Math.min(devicePixelRatio||1,stage.clientWidth<=760?1.25:1.5)};
      },{repetition,shadows});
      assert.deepEqual(result.after,result.before,'Capture measurement restores production shadow and info-reset settings');
      assert.equal(result.measurement.warm,false);near(result.measurement.pixelRatio,result.expectedLivePixelRatio,'Diagnostic uses unchanged full live DPR',.000001);
      assert.equal(result.measurement.width,Math.floor(result.cssWidth*result.expectedLivePixelRatio));assert.equal(result.measurement.height,Math.floor(result.cssHeight*result.expectedLivePixelRatio));
      assert.ok(result.measurement.durationMs>=0&&result.measurement.calls>0&&result.measurement.triangles>0&&result.measurement.programs>0,'Measured full render includes actual calls, triangles and programs');
      drawMeasurements.push(result);
    }
    for(let repetition=0;repetition<3;repetition++){
      const on=drawMeasurements.find(result=>result.repetition===repetition&&result.shadows).measurement,off=drawMeasurements.find(result=>result.repetition===repetition&&!result.shadows).measurement;
      assert.ok(on.calls>off.calls&&on.triangles>off.triangles,'Full render counters include the shadow pass instead of resetting before the main pass');
    }
    fs.writeFileSync(path.join(output,'diagnostic-transit-full-draws.json'),JSON.stringify({captureOnly:true,measurementMethod:'Production drawProgress brackets the complete renderer.render call with info.autoReset=false. Wall-clock JavaScript/render-call durations include software-driver work; these are not hardware GPU timings or real-device benchmarks.',drawMeasurements},null,2)+'\n');
    await page.evaluate(()=>window.__v2Selected.resume());await save(run,'capture-only-render-studies',{api,viewports:[1440,390,320],captureOnly:true,cappedWarm,firstProduction,drawMeasurements});
  }catch(error){await diagnose(run,'study',error);throw error;}finally{await run.context.close();}
}

(async()=>{
  const responsivenessOnly=process.argv.includes('--responsiveness-only');
  fs.mkdirSync(output,{recursive:true});sourceContract();easingMath();if(!responsivenessOnly)await sourceGeometry();
  if(process.argv.includes('--source-only'))return;
  const group=process.argv.find(argument=>argument.startsWith('--group='))?.slice('--group='.length);
  assert.ok(group===undefined||['core','lifecycle','entry'].includes(group),'Unknown browser group: '+group);
  const {chromium}=require('playwright');const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    if(responsivenessOnly)await warmingInput(browser);
    else if(process.argv.includes('--study'))await studies(browser);
    else{
      if(!group||group==='core'){await guards(browser);await initialAndInput(browser);}
      if(!group||group==='lifecycle'){
        const failures=[];
        for(const test of [interruptedWarmMask,pendingPreferenceChange,readyPreferenceChange]){
          try{await test(browser);}
          catch(error){failures.push(error);evidence.push({name:test.name+'-failure',error:error.stack});console.error('FAIL '+test.name+': '+error.message);}
        }
        if(failures.length)throw new AggregateError(failures,failures.length+' independent Selected lifecycle case(s) failed');
      }
      if(!group||group==='entry'){await heldHeroTextures(browser);await fastEntry(browser);await mobileTouch(browser);await warmingInput(browser);}
    }
  }
  finally{await browser.close();}
  console.log(evidence.length+' Selected Work acceptance groups passed.');
})().catch(error=>{console.error(error);evidence.push({name:'failure',error:error.stack});process.exitCode=1;}).finally(()=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');});
