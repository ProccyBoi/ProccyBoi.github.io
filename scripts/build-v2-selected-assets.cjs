#!/usr/bin/env node
/* Build-only real-CAD packs for Selected Work. No runtime/source file is edited.
 * Serve the checkout on V2_BASE_URL, then run this script with Playwright 1.57.
 * Output: V2_SELECTED_OUT (default /tmp/v2-selected-assets/selected).
 * --check performs source-only contract checks without a browser or Playwright.
 * --self-test checks merger and transport regressions without a browser.
 * --verify reconstructs committed compressed-only packs against current sources.
 * With --verify, the default input is assets/models/selected; V2_SELECTED_OUT
 * can still point at a build artifact directory containing optional plain packs.
 * The V2HERO1 container additionally preserves Dual's existing LineSegments.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const verifyOnly = process.argv.includes('--verify');
const output = path.resolve(process.env.V2_SELECTED_OUT || (verifyOnly ? path.join(root, 'assets/models/selected') : '/tmp/v2-selected-assets/selected'));
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const names = ['esp32', 'dual', 'logic', 'metro'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifests = Object.fromEntries(['logic', 'metro'].map(name => [name, JSON.parse(read('assets/models/hardware/' + (name === 'logic' ? 'framework-logic-analyser' : 'metroboard') + '/assembly.json'))]));
const sourcePaths = new Set([
  'scripts/build-v2-selected-assets.cjs', 'scripts/build-v2-hero-assets.cjs', 'scripts/render-framework-dual-poster.cjs',
  'v2/projects/framework-dual-usb/index.html', 'assets/framework-dual-usb-3d.js', 'assets/explorer-runtime.js',
  'assets/vendor/three.min.js', 'assets/vendor/GLTFLoader.js', 'assets/v2-assembly-models.js', 'assets/v2-hardware-models.js', 'assets/v2-hero-assets.js', 'assets/v2-selected-assets.js', 'assets/framework-mechanics.js',
  'assets/models/framework-esp32/framework-board.glb', 'assets/models/framework-esp32/framework-usbc.glb',
  'assets/models/framework-esp32/framework-markings-silk.svg', 'assets/models/framework-esp32/framework-enclosure.stl',
  'assets/models/framework-dual-usb/framework-dual-usb-silk.svg',
  'assets/models/framework-mechanics/framework-m2x3-screw.stl', 'assets/models/framework-mechanics/framework-m2x3-screw.json',
  'assets/models/hardware/framework-logic-analyser/assembly.json', 'assets/models/hardware/metroboard/assembly.json'
]);
function collectUrls(value) {
  if (typeof value === 'string' && value.startsWith('/assets/')) sourcePaths.add(value.slice(1).split('?')[0]);
  else if (Array.isArray(value)) value.forEach(collectUrls);
  else if (value && typeof value === 'object') Object.values(value).forEach(collectUrls);
}
Object.values(manifests).forEach(collectUrls);
const sourceHashes = () => Object.fromEntries([...sourcePaths].sort().map(file => {
  const bytes = fs.readFileSync(path.join(root, file)); assert(bytes.length, 'Empty source: ' + file);
  return [file, {bytes:bytes.length, sha256:hash(bytes)}];
}));
function checks() {
  const html = read('v2/projects/framework-dual-usb/index.html');
  const inspector = html.match(/<section\b[^>]*\bdata-dual-usb-inspector[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert(inspector, 'Accepted Dual inspector fixture exists');
  for (const attr of ['data-dual-usb-stage', 'data-dual-usb-canvas', 'data-dual-usb-status']) assert(inspector.includes(attr), 'Dual fixture: ' + attr);
  const dual = read('assets/framework-dual-usb-3d.js');
  for (const token of ['P1_Molex_105444_exact', 'mechanicalRole', 'screw-head', 'new THREE.LineSegments', 'framework-dual-usb-silk.svg', 'framework-enclosure.stl']) assert(dual.includes(token), 'Dual source contract: ' + token);
  assert(/\[x,z,angle\s*=\s*0\]/.test(read('assets/v2-hardware-models.js')), 'Metro omitted zero-degree rotations require the shared factory default');
  const leds = manifests.metro.footprints.filter(part => part.value === manifests.metro.dimensionedLedFallback.value && !part.modelExported);
  assert.equal(leds.length, 291, 'All original 291 dimensioned LEDs are represented');
  assert(leds.every(part => part.atMm.length >= 2 && part.atMm.every(Number.isFinite)), 'Finite Metro source placements');
  assert(verifyOnly || !output.startsWith(path.join(root, 'assets') + path.sep), 'Build output must be an artifact directory, never production assets');
  sourceHashes();
  return inspector;
}

// Same isolated inspector and renderer-reference hook as the accepted poster
// fixture. The production procedural model script is never rewritten/evaluated
// from modified source; its real async connector, enclosure and screws must load.
function fixture(inspector) {
  return `<!doctype html><html><head><meta charset="utf-8"><base href="/"><link rel="icon" href="data:,">
  <style>*{box-sizing:border-box}html,body,section,div{margin:0;padding:0} [data-dual-usb-stage],canvas{display:block;width:900px;height:700px}header,button,dl,p,aside{display:none!important}</style>
  </head><body class="v2">${inspector}<script src="/assets/vendor/three.min.js"></script><script src="/assets/vendor/GLTFLoader.js"></script><script src="/assets/explorer-runtime.js"></script><script>
  window.__dualPoster={frames:0}; const originalCreateRenderer=PortfolioExplorer.createRenderer;
  PortfolioExplorer.createRenderer=function(T,options){const renderer=originalCreateRenderer.call(this,T,options);if(!renderer)throw new Error('Dual capture requires WebGL');window.__dualPoster.renderer=renderer;const render=renderer.render.bind(renderer);renderer.render=function(scene,camera){Object.assign(window.__dualPoster,{scene,camera});window.__dualPoster.frames++;return render(scene,camera)};return renderer};
  </script><script src="/assets/framework-dual-usb-3d.js"></script></body></html>`;
}

// Extend the shared capture only for source primitives that hero packs never
// needed. Surrogates reuse the exact geometry/material and restore the type in
// the captured schema, avoiding any geometry conversion or missing board edge.
function captureSelected(assembly) {
  const original = assembly.group, clone = original.clone(true), originals = [], copies = [];
  original.traverse(node => originals.push(node)); clone.traverse(node => copies.push(node));
  const lines = [], mapped = new Map(originals.map((node, i) => [node, copies[i]]));
  copies.forEach(node => {
    if (node.isLineSegments) { node.isMesh = true; lines.push(node); }
    if (node.geometry) {
      const attributes = node.geometry.attributes;
      if (Object.values(attributes).some(attribute => attribute.isInterleavedBufferAttribute)) {
        node.geometry = node.geometry.clone();
        for (const [name, attribute] of Object.entries(attributes)) if (attribute.isInterleavedBufferAttribute) {
          const array = new attribute.data.array.constructor(attribute.count * attribute.itemSize);
          for (let i=0;i<attribute.count;i++) for(let j=0;j<attribute.itemSize;j++) array[i*attribute.itemSize+j]=attribute.data.array[i*attribute.data.stride+attribute.offset+j];
          node.geometry.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));
        }
      }
    }
  });
  const captured = window.__captureHero({...assembly, group:clone, parts:assembly.parts.map(part => ({...part, object:mapped.get(part.object)}))});
  copies.forEach((node, i) => { if (lines.includes(node)) captured.nodes[i].type='LineSegments'; });
  return captured;
}

function inspectAssembly(assembly) {
  const T = window.THREE, group=assembly.group, bounds=new T.Box3(), point=new T.Vector3(), materials=new Set(), refs=new Set();
  group.updateMatrixWorld(true);
  let meshes=0, triangles=0, lines=0, lineSegments=0, draws=0, finiteVertices=0, ledRefs=[];
  group.traverse(node => {
    for (const component of [...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray(),...node.matrixWorld.elements]) if (!Number.isFinite(component)) throw new Error('Non-finite source transform: '+node.name);
    if(node.userData.componentRefs) ledRefs.push(...node.userData.componentRefs.filter(ref=>/^D\d+$/.test(ref)));
    if(node.userData.partRef) refs.add(node.userData.partRef);
    if (node.geometry) for(const [name,attribute] of Object.entries(node.geometry.attributes)) {
      for(let i=0;i<attribute.count;i++) for(let j=0;j<attribute.itemSize;j++) {
        const value=attribute.isInterleavedBufferAttribute?attribute.data.array[i*attribute.data.stride+attribute.offset+j]:attribute.array[i*attribute.itemSize+j];
        if(!Number.isFinite(value)) throw new Error('Non-finite '+name+' in '+node.name);
      }
      if(name==='position') finiteVertices+=attribute.count;
    }
  });
  group.traverseVisible(node => {
    if(!node.isMesh&&!node.isLineSegments)return;
    const geometry=node.geometry,count=geometry.index?geometry.index.count:geometry.attributes.position.count;
    if(node.isMesh){meshes++;triangles+=count/3;}else{lines++;lineSegments+=count/2;}
    const mats=Array.isArray(node.material)?node.material:[node.material];mats.forEach(material=>materials.add(material));
    draws+=Array.isArray(node.material)?geometry.groups.filter(g=>node.material[g.materialIndex]?.visible).length:1;
    const positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++)bounds.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld));
  });
  return {meshes,triangles,lines,lineSegments,draws,materials:materials.size,finiteVertices,refs:[...refs].sort(),ledRefs:[...new Set(ledRefs)].sort(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
}

// Only opaque static single-material meshes with identical full material state,
// render ordering and renderer properties are batched. Transparent primitives,
// multi-material board faces and inactive fallback meshes keep their hierarchy.
// Baking negative determinants reverses winding, just as Three's source draw
// flips gl.frontFace; normals use the inverse-transpose normal matrix.
function mergeDualOpaque(group, sourceCapture) {
  const T=window.THREE, all=[], buckets=new Map(), records=[], reference=new T.Group();
  group.updateMatrixWorld(true);group.traverse(node=>all.push(node));
  const inverse=new T.Matrix4().copy(group.matrixWorld).invert();
  const stable = value => JSON.stringify(value);
  let maxPositionRoundingMm=0,maxNormalRounding=0;
  all.forEach((node,nodeId)=>{
    if(!node.isMesh || node.isSkinnedMesh || node.isInstancedMesh || Array.isArray(node.material))return;
    for(let parent=node;parent;parent=parent.parent)if(!parent.visible)return;
    const material=node.material,geometry=node.geometry;
    if(material.transparent || material.transmission>0 || !material.visible)return;
    if(Object.keys(geometry.morphAttributes).length)throw new Error('Static Dual has unexpected morphs');
    const count=geometry.index?geometry.index.count:geometry.attributes.position.count;
    if(geometry.drawRange.start!==0 || geometry.drawRange.count<count)return;
    let groupOrder=0;for(let parent=node.parent;parent;parent=parent.parent)if(parent.isGroup) {groupOrder=parent.renderOrder;break;}
    const materialState=sourceCapture.materials[sourceCapture.nodes[nodeId].material];
    const properties={renderOrder:node.renderOrder,groupOrder,castShadow:node.castShadow,receiveShadow:node.receiveShadow,frustumCulled:node.frustumCulled,layers:node.layers.mask};
    const attrs=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b));
    const schema=attrs.map(([name,a])=>[name,a.array?.constructor.name||a.data.array.constructor.name,a.itemSize,a.normalized]);
    const key=stable([materialState,properties,schema]);
    if(!buckets.has(key))buckets.set(key,{key,material,properties,items:[]});
    const transform=new T.Matrix4().multiplyMatrices(inverse,node.matrixWorld),normalMatrix=new T.Matrix3().getNormalMatrix(transform),mirrored=transform.determinant()<0;
    const baked=new T.BufferGeometry(),p=new T.Vector3(),n=new T.Vector3();
    for(const [name,attribute] of attrs){
      const Constructor=attribute.array?.constructor||attribute.data.array.constructor;
      const array=new Constructor(count*attribute.itemSize);
      for(let i=0;i<count;i++){
        const ordered=mirrored?(i%3===1?i+1:i%3===2?i-1:i):i;
        const index=geometry.index?geometry.index.getX(ordered):ordered;
        for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=attribute.isInterleavedBufferAttribute?attribute.data.array[index*attribute.data.stride+attribute.offset+j]:attribute.array[index*attribute.itemSize+j];
        if(name==='position'||name==='normal'){
          if(attribute.normalized||attribute.itemSize!==3)throw new Error('Unsupported position/normal shape');
          const vector=name==='position'?p:n;vector.fromArray(array,i*3);
          if(name==='position')vector.applyMatrix4(transform);else vector.applyMatrix3(normalMatrix).normalize();
          for(let j=0;j<3;j++) {array[i*3+j]=vector.getComponent(j);const error=Math.abs(array[i*3+j]-vector.getComponent(j));if(name==='position')maxPositionRoundingMm=Math.max(maxPositionRoundingMm,error);else maxNormalRounding=Math.max(maxNormalRounding,error);}
        } else if(name==='tangent') throw new Error('Unexpected tangent attribute requires explicit handedness preservation');
      }
      baked.setAttribute(name,new T.BufferAttribute(array,attribute.itemSize,attribute.normalized));
    }
    const expected=new T.Mesh(baked,material);expected.name='source-node-'+nodeId;reference.add(expected);
    const item={node,nodeId,baked,count,mirrored,sourceMatrix:transform.toArray(),referenceId:reference.children.length-1};
    buckets.get(key).items.push(item);
  });
  let bucketIndex=0;
  for(const bucket of buckets.values()){
    // Retain singleton meshes exactly, avoiding unnecessary transform baking.
    if(bucket.items.length<2)continue;
    const attrs=Object.keys(bucket.items[0].baked.attributes),geometry=new T.BufferGeometry();
    const total=bucket.items.reduce((sum,item)=>sum+item.count,0);
    for(const name of attrs){const first=bucket.items[0].baked.attributes[name],array=new first.array.constructor(total*first.itemSize);let offset=0;for(const item of bucket.items){array.set(item.baked.attributes[name].array,offset);offset+=item.baked.attributes[name].array.length;}geometry.setAttribute(name,new T.BufferAttribute(array,first.itemSize,first.normalized));}
    const mesh=new T.Mesh(geometry,bucket.material);mesh.name='dual-opaque-batch-'+bucketIndex++;
    const {groupOrder,layers,...properties}=bucket.properties;Object.assign(mesh,properties);mesh.layers.mask=layers;
    const host=new T.Group();host.name=mesh.name+'-order';host.renderOrder=groupOrder;host.add(mesh);group.add(host);
    let offset=0;
    for(const item of bucket.items){records.push({sourceNode:item.nodeId,sourceName:item.node.name,targetName:mesh.name,start:offset,count:item.count,referenceId:item.referenceId,mirrored:item.mirrored,sourceMatrix:item.sourceMatrix,materialState:sourceCapture.nodes[item.nodeId].material,properties:bucket.properties});offset+=item.count;item.node.parent.remove(item.node);}
  }
  if(maxPositionRoundingMm>0.00001||maxNormalRounding>0.0000001)throw new Error('Unexpected precision loss during exact coordinate bake');
  return {reference:{group:reference,parts:[]},records,maxPositionRoundingMm,maxNormalRounding};
}

function proveMerge(source, merged, expected, proof, expandGeometry) {
  const byName=new Map(merged.nodes.filter(node=>node.type==='Mesh').map(node=>[node.name,node]));
  const expectedNodes=expected.nodes.filter(node=>node.type==='Mesh');
  const ranges=new Map();
  for(const record of proof.records){
    const outputNode=byName.get(record.targetName),referenceNode=expectedNodes[record.referenceId];
    assert(outputNode&&referenceNode,'Every source range resolves to exact baked reference');
    const actual=merged.geometries[outputNode.geometry],wanted=expected.geometries[referenceNode.geometry];
    const actualArrays=expandGeometry(actual),expectedArrays=expandGeometry(wanted);
    assert.deepEqual(Object.keys(actualArrays),Object.keys(expectedArrays),'Identical attribute schema');
    for(const name of Object.keys(expectedArrays)){
      const attr=actual.attributes[name],stride=attr.itemSize*globalThis[attr.arrayType].BYTES_PER_ELEMENT;
      assert.deepEqual(actualArrays[name].subarray(record.start*stride,(record.start+record.count)*stride),expectedArrays[name], 'Exact transformed source triangle attribute range: '+record.sourceNode+'/'+name);
    }
    assert.deepEqual(merged.materials[outputNode.material],source.materials[record.materialState],'Exact source material properties retained');
    assert.equal(outputNode.renderOrder,record.properties.renderOrder);assert.equal(outputNode.layers,record.properties.layers);
    if(!ranges.has(record.targetName))ranges.set(record.targetName,[]);ranges.get(record.targetName).push(record);
  }
  for(const [name,items] of ranges){let end=0;for(const item of items){assert.equal(item.start,end,'Contiguous, nonduplicated source ranges');end+=item.count;}const geometry=merged.geometries[byName.get(name).geometry];assert.equal(end,expandGeometry(geometry).position.length/(geometry.attributes.position.itemSize*globalThis[geometry.attributes.position.arrayType].BYTES_PER_ELEMENT),'Every output triangle has a source');}
  return {sourceMeshes:proof.records.length,mergedDraws:ranges.size,triangles:proof.records.reduce((sum,record)=>sum+record.count/3,0),expandedAttributes:'byte-identical after documented source world transform and mirrored-winding bake',maxPositionRoundingMm:proof.maxPositionRoundingMm,maxNormalRounding:proof.maxNormalRounding,rangeMapSha256:hash(Buffer.from(JSON.stringify(proof.records)))};
}

// Keep historical generation provenance intact when a narrowly scoped verifier
// or runtime decoder update is recorded after the build. This is not a general hash exemption:
// every current source, including the verifier, must match an explicit SHA.
function verifyRecordedSources(recorded, current) {
  assert.match(recorded.sourceCommit, /^[a-f0-9]{40}$/, 'Recorded build commit');
  const expected = {...recorded.sources};
  for (const [file, tool] of Object.entries(recorded.verificationTools || {})) {
    assert(['scripts/build-v2-selected-assets.cjs', 'assets/v2-selected-assets.js', 'assets/v2-hero-assets.js'].includes(file), 'Only the build verifier and runtime decoder may have a separately recorded verification revision');
    assert(expected[file], 'Verification revision must retain its original build-source hash');
    assert(typeof tool.reason === 'string' && tool.reason.length, 'Explain the verification-only revision');
    expected[file] = {bytes:tool.bytes, sha256:tool.sha256};
  }
  for (const [file, revision] of Object.entries(recorded.editorialSources || {})) {
    assert.equal(file, 'v2/projects/framework-dual-usb/index.html', 'Only the Dual case-study shell supports an editorial revision');
    assert(expected[file], 'Retain the original whole-page build-source hash');
    assert(typeof revision.reason === 'string' && revision.reason.length, 'Explain the editorial-only revision');
    assert.equal(hash(Buffer.from(fixture(checks()))), revision.fixtureSha256, 'Editorial revision must preserve the exact detached source inspector fixture');
    expected[file] = {bytes:revision.bytes, sha256:revision.sha256};
  }
  assert.deepEqual(current, expected, 'Every current source hash must match recorded build or explicit verifier provenance');
  return {sourceCommit:recorded.sourceCommit, sources:recorded.sources,
    ...(recorded.verificationTools ? {verificationTools:recorded.verificationTools} : {}),
    ...(recorded.editorialSources ? {editorialSources:recorded.editorialSources} : {})};
}

function verifyPackFiles(directory, name, freshPlain, indexTransport) {
  const compressed = fs.readFileSync(path.join(directory, name + '.idx.bin.gz'));
  assert.deepEqual(indexTransport(zlib.gunzipSync(compressed), true), freshPlain, name + ': committed compressed pack reconstructs the exact fresh source capture');
  const plainPath = path.join(directory, name + '.bin');
  if (fs.existsSync(plainPath)) assert.deepEqual(fs.readFileSync(plainPath), freshPlain, name + ': optional plain verification artifact equals fresh source capture');
  // Reuse the actual stored transport for runtime parity and manifest checks.
  // Different zlib versions may produce different, equivalent gzip streams.
  return compressed;
}

// Browser-free regressions cover reflected parent transforms, UVs/normals,
// material equality, render ordering, visibility, transparency and line data.
function selfTest() {
  const T=require('../assets/vendor/three.min.js');
  const {captureAssembly,expandGeometry,canonical,pack,indexTransport}=require('./build-v2-hero-assets.cjs');
  global.window=global;global.THREE=T;global.__captureHero=captureAssembly;
  const group=new T.Group(),parent=new T.Group();parent.rotation.y=.42;parent.scale.x=-1;parent.position.set(2,3,-4);parent.renderOrder=40;group.add(parent);
  const material=new T.MeshStandardMaterial({color:0x123456,metalness:.4,roughness:.6});
  for(let i=0;i<3;i++){const node=new T.Mesh(new T.BoxGeometry(1,2,3),i===2?material.clone():material);node.position.set(i,0,1);node.name='opaque-'+i;parent.add(node);}
  const glass=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshPhysicalMaterial({transparent:true,opacity:.17}));glass.name='glass';parent.add(glass);
  const hidden=new T.Mesh(new T.BoxGeometry(1,1,1),material);hidden.visible=false;hidden.name='hidden';parent.add(hidden);
  const edge=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1,1,1)),new T.LineBasicMaterial({transparent:true,opacity:.52}));edge.name='edge';parent.add(edge);
  const original=captureSelected({group,parts:[]});const before=inspectAssembly({group});
  assert.equal(original.nodes.find(node=>node.name==='edge').type,'LineSegments');
  const merge=mergeDualOpaque(group,original),after=captureSelected({group,parts:[]});
  const reference=captureSelected(merge.reference);
  const proof=proveMerge(original,after,reference,merge,expandGeometry);
  assert.equal(proof.sourceMeshes,3);assert.equal(proof.mergedDraws,1);assert.equal(proof.triangles,36);
  assert(merge.records.every(record=>record.mirrored));assert.equal(inspectAssembly({group}).triangles,before.triangles);
  assert.equal(group.getObjectByName('glass'),glass);assert.equal(group.getObjectByName('hidden'),hidden);assert.equal(group.getObjectByName('edge'),edge);
  assert.equal(group.getObjectByName('dual-opaque-batch-0').parent.renderOrder,40);
  const bytes=pack(after);assert.deepEqual(indexTransport(indexTransport(bytes),true),bytes);assert.deepEqual(indexTransport(zlib.gunzipSync(zlib.gzipSync(indexTransport(bytes))),true),bytes);
  // The original factory capture helper and primitive-aware wrapper agree on
  // ordinary hero-compatible trees, preserving original hero pack behavior.
  const ordinary=new T.Group();ordinary.add(new T.Mesh(new T.BoxGeometry(1,1,1),material));
  assert.deepEqual(canonical(captureSelected({group:ordinary,parts:[]})),canonical(captureAssembly({group:ordinary,parts:[]})));
  const temporary=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'selected-verify-test-'));
  try {
    const stored=zlib.gzipSync(indexTransport(bytes),{level:1});fs.writeFileSync(path.join(temporary,'test.idx.bin.gz'),stored);
    assert.deepEqual(verifyPackFiles(temporary,'test',bytes,indexTransport),stored,'Compressed-only verification uses the recorded transport');
    fs.writeFileSync(path.join(temporary,'test.bin'),bytes);verifyPackFiles(temporary,'test',bytes,indexTransport);
    fs.writeFileSync(path.join(temporary,'test.bin'),Buffer.from('wrong'));assert.throws(()=>verifyPackFiles(temporary,'test',bytes,indexTransport),/optional plain verification artifact/);
    const wrong=Buffer.from(bytes);wrong[wrong.length-1]^=1;assert.throws(()=>verifyPackFiles(temporary,'test',wrong,indexTransport),/compressed pack reconstructs/);
    const source={'model.glb':{bytes:1,sha256:'a'},'scripts/build-v2-selected-assets.cjs':{bytes:2,sha256:'b'}};
    const recorded={sourceCommit:'a'.repeat(40),sources:source};
    assert.equal(verifyRecordedSources(recorded,source).sourceCommit,recorded.sourceCommit,'Preserve original build commit independently of current HEAD');
    assert.throws(()=>verifyRecordedSources(recorded,{...source,'model.glb':{bytes:1,sha256:'changed'}}),/Every current source hash/);
    recorded.verificationTools={'scripts/build-v2-selected-assets.cjs':{bytes:3,sha256:'c',reason:'Verification-only regression fixture'}};
    verifyRecordedSources(recorded,{...source,'scripts/build-v2-selected-assets.cjs':{bytes:3,sha256:'c'}});
    assert.throws(()=>verifyRecordedSources({...recorded,verificationTools:{'model.glb':{bytes:2,sha256:'d',reason:'Cannot override a model'}}},source),/Only the build verifier and runtime decoder/);
    const editorialFile='v2/projects/framework-dual-usb/index.html',editorial={sourceCommit:'a'.repeat(40),sources:{[editorialFile]:{bytes:1,sha256:'old'}},editorialSources:{[editorialFile]:{bytes:2,sha256:'new',fixtureSha256:hash(Buffer.from(fixture(checks()))),reason:'New case-study copy outside the unchanged inspector'}}};
    verifyRecordedSources(editorial,{[editorialFile]:{bytes:2,sha256:'new'}});
    assert.throws(()=>verifyRecordedSources({...editorial,editorialSources:{'model.glb':editorial.editorialSources[editorialFile]}},{}),/Only the Dual case-study shell/);
    assert.throws(()=>verifyRecordedSources({...editorial,editorialSources:{[editorialFile]:{...editorial.editorialSources[editorialFile],fixtureSha256:'changed'}}},{}),/exact detached source inspector/);
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
  console.log('Selected build self-test passed: exact attributes, mirrored winding, material clones, render order, transparent/hidden primitives, LineSegments, original hero capture, compressed-only and optional plain verification, recorded build commit and strict source hashes.');
}

async function main() {
  const inspector=checks();
  if(process.argv.includes('--self-test')){selfTest();return;}
  if(process.argv.includes('--check')){console.log(JSON.stringify({checked:'source contracts, complete originals, Dual fixture, finite Metro LED placements',models:names,leds:291,sources:sourceHashes()},null,2));return;}
  const {captureAssembly,expandGeometry,canonical,pack,indexTransport}=require('./build-v2-hero-assets.cjs');
  const {chromium}=require('playwright'),sources=sourceHashes();
  const recorded=verifyOnly?JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8')):null;
  const provenance=recorded?verifyRecordedSources(recorded,sources):{sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sources};
  if(!verifyOnly)fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const report={format:1,container:'V2HERO1',transport:'V2HIDX1/index-byte-planes-v1',...provenance,sourceHashNormalization:'raw bytes',sourceFilesUnchanged:true,models:{}};
  const errors=[],failedRequests=[],requestedSources=new Set();
  try {
    const page=await browser.newPage({viewport:{width:900,height:700},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>failedRequests.push({url:request.url(),failure:request.failure()}));
    page.on('response',response=>{if(response.status()>=400)failedRequests.push({url:response.url(),status:response.status()});const url=new URL(response.url());if(url.pathname.startsWith('/assets/')&&!url.pathname.startsWith('/assets/models/hero/')&&!url.pathname.startsWith('/assets/models/selected/'))requestedSources.add(url.pathname.slice(1));});
    await page.route(base+'/__v2_selected_build__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:"><title>Selected CAD detached capture</title>'}));
    await page.route(base+'/__v2_selected_dual__',route=>route.fulfill({contentType:'text/html',body:fixture(inspector)}));
    for(const name of names){
      console.log('Capture original Selected Work CAD:',name);
      if(name==='dual'){
        await page.goto(base+'/__v2_selected_dual__',{waitUntil:'load'});
        await page.waitForFunction(()=>{
          const scene=window.__dualPoster?.scene;if(!scene?.getObjectByName('P1_Molex_105444_exact'))return false;
          let enclosure=false,silk=false,screws=0;scene.traverseVisible(node=>{if(node.userData.partRef==='Enclosure'&&node.children.some(child=>child.isMesh))enclosure=true;if(node.isMesh&&node.material?.map?.image?.src?.includes('framework-dual-usb-silk.svg'))silk=true;if(node.userData.mechanicalRole==='screw-head')screws++;});
          const root=document.querySelector('[data-dual-usb-inspector]');return enclosure&&silk&&screws===2&&root.dataset.explorerMotion==='idle'&&Number(root.dataset.explorerProgress)===0;
        },null,{timeout:90000});
      } else {
        await page.goto(base+'/__v2_selected_build__',{waitUntil:'domcontentloaded'});
        for(const url of ['/assets/vendor/three.min.js','/assets/vendor/GLTFLoader.js','/assets/v2-assembly-models.js','/assets/v2-hardware-models.js','/assets/framework-mechanics.js'])await page.addScriptTag({url:base+url});
      }
      await page.evaluate('window.__captureHero='+captureAssembly.toString());
      await page.evaluate('window.__captureSelected='+captureSelected.toString());
      await page.evaluate('window.__inspectSelected='+inspectAssembly.toString());
      await page.evaluate('window.__mergeDualOpaque='+mergeDualOpaque.toString());
      const result=await page.evaluate(async name=>{
        const T=window.THREE;let assembly,sourceStats,sourceCapture,merge;
        if(name==='dual'){
          const real=window.__dualPoster.scene.children.find(node=>node.isGroup);if(!real)throw new Error('Original Dual group missing');
          const clone=real.clone(true);clone.updateMatrixWorld(true);sourceStats=window.__inspectSelected({group:clone});sourceCapture=window.__captureSelected({group:clone,parts:[]});
          merge=window.__mergeDualOpaque(clone,sourceCapture);
          const reference=window.__captureSelected(merge.reference);delete merge.reference;merge.expected=reference;
          const centered=new T.Group();centered.name='dual-source-mm-centered';centered.position.set(0,-3.1,15);centered.add(clone);
          const group=new T.Group();group.name='dual-normalized-30mm';group.scale.setScalar(1/30);group.add(centered);group.userData.boardUnitsMm=30;group.userData.selectedStatic=true;
          group.updateMatrixWorld(true);const box=new T.Box3().setFromObject(group),size=box.getSize(new T.Vector3());
          assembly={group,parts:[],span:Math.max(size.x,size.y,size.z),centre:box.getCenter(new T.Vector3()),metadata:{slug:'framework-dual-usb',unitsMm:30,sourceTranslationMm:[0,-3.1,15],staticAssembly:true}};
        } else assembly=name==='esp32'?await window.V2AssemblyModels.load('esp32'):await window.V2HardwareModels.load('/assets/models/hardware/'+(name==='logic'?'framework-logic-analyser':'metroboard')+'/assembly.json');
        const stats=window.__inspectSelected(assembly);window.__selectedAssembly=assembly;
        return {capture:window.__captureSelected(assembly),stats,sourceStats:sourceStats||stats,sourceCapture,merge};
      },name);
      assert.equal(errors.length,0,'No source browser errors: '+JSON.stringify(errors));assert.equal(failedRequests.length,0,'All source assets loaded: '+JSON.stringify(failedRequests));
      const {capture,stats,sourceStats}=result;let mergeProof;
      if(name==='dual'){
        assert.equal(sourceStats.meshes,1071,'Complete visible Dual source');assert.equal(sourceStats.triangles,22209,'All original Dual source triangles');
        for(const [axis,expectedMin,expectedMax] of [[0,-15,15],[1,0,7.21],[2,-39.1,.005]]){assert(Math.abs(sourceStats.bounds.min[axis]-expectedMin)<.012,'Dual source lower bound');assert(Math.abs(sourceStats.bounds.max[axis]-expectedMax)<.012,'Dual source upper bound');const shift=[0,-3.1,15][axis];assert(Math.abs(stats.bounds.min[axis]-(sourceStats.bounds.min[axis]+shift)/30)<1e-6,'Whole-group translation precedes normalization');assert(Math.abs(stats.bounds.max[axis]-(sourceStats.bounds.max[axis]+shift)/30)<1e-6,'Whole-group maximum transform');}
        assert.equal(stats.triangles,sourceStats.triangles,'No visible source triangle lost or duplicated');assert.equal(stats.lineSegments,sourceStats.lineSegments,'Board-edge line segments retained');
        mergeProof=proveMerge(result.sourceCapture,capture,result.merge.expected,result.merge,expandGeometry);
        assert(stats.draws<sourceStats.draws/2,'Substantial actual opaque draw-call reduction');
      }
      if(name==='metro')assert.equal(stats.ledRefs.length,291,'All 291 finite dimensioned Metro LED placements retained');
      const bytes=pack(capture),compressed=verifyOnly?verifyPackFiles(output,name,bytes,indexTransport):zlib.gzipSync(indexTransport(bytes),{level:9}),filepath=path.join(output,name+'.bin'),compressedPath=path.join(output,name+'.idx.bin.gz');
      assert.deepEqual(indexTransport(zlib.gunzipSync(compressed),true),bytes,'Exact indexed transport round trip');
      if(!verifyOnly){fs.writeFileSync(filepath,bytes);fs.writeFileSync(compressedPath,compressed);}
      // Exercise the actual Selected Work runtime decoder against these output
      // bytes without copying anything into production asset directories.
      await page.route(base+'/assets/models/selected/'+name+'.idx.bin.gz',route=>route.fulfill({contentType:'application/octet-stream',body:compressed}));
      await page.addScriptTag({url:base+'/assets/v2-selected-assets.js'});
      const restored=await page.evaluate(async name=>{const assembly=await window.V2SelectedAssets.load(name);return {capture:window.__captureSelected(assembly),stats:window.__inspectSelected(assembly)};},name);
      assert.deepEqual(canonical(restored.capture),canonical(capture),name+': exact runtime objects, expanded attributes, textures, material properties, transforms and metadata');
      const {finiteVertices:sourceVertices,...sourceRuntimeStats}=stats, {finiteVertices:packedVertices,...restoredRuntimeStats}=restored.stats;
      assert(sourceVertices>0&&packedVertices>0,'All source and compacted vertex attributes validated finite');
      assert.deepEqual(restoredRuntimeStats,sourceRuntimeStats,name+': reconstructed model bounds and triangle counts');
      const unitsMm=name==='dual'?30:name==='esp32'?30:Math.max(manifests[name].boundsMm[2]-manifests[name].boundsMm[0],manifests[name].boundsMm[3]-manifests[name].boundsMm[1]);
      const provenance={name,sourceMethod:name==='dual'?'Unmodified procedural inspector, detached full assembled clone, exact opaque batching':'Detached original shared CAD factory',unitsMm,normalizedBounds:stats.bounds,sourceStats,stats,materials:capture.materials.length,textures:capture.textures.map(texture=>texture.url),drawCalls:{before:sourceStats.draws,after:stats.draws,reduction:sourceStats.draws-stats.draws},triangleParity:{source:sourceStats.triangles,packed:stats.triangles,retained:true},runtimeParitySha256:hash(Buffer.from(JSON.stringify(canonical(capture)))),...(mergeProof?{mergeProof,sourceTransformHierarchy:result.sourceCapture.nodes.map(({geometry,material,...node})=>node),mergedSourceRanges:result.merge.records}:{}),limitations:name==='metro'?['291 dimensioned WS2812B-2020 fallback packages are preserved from the existing factory; original supplier models are absent.','J1 USB-C and U2/U5 source bodies are absent and remain absent.']:[],browserErrors:errors,failedRequests};
      report.models[name]={url:'/assets/models/selected/'+name+'.idx.bin.gz',verificationArtifact:name+'.bin',compressedUrl:'/assets/models/selected/'+name+'.idx.bin.gz',bytes:bytes.length,gzipBytes:compressed.length,sha256:hash(bytes),compressedSha256:hash(compressed),unitsMm,parts:capture.parts.length,meshes:stats.meshes,triangles:stats.triangles,lineSegments:stats.lineSegments,materials:capture.materials.length,textures:provenance.textures,bounds:stats.bounds,drawCalls:provenance.drawCalls,paritySha256:provenance.runtimeParitySha256,provenance:name+'.provenance.json'};
      if(!verifyOnly)fs.writeFileSync(path.join(output,name+'.provenance.json'),JSON.stringify(provenance,null,2)+'\n');
      console.log(name+': exact runtime parity; '+sourceStats.draws+' -> '+stats.draws+' draws; '+stats.triangles+' triangles; '+compressed.length+' gzip bytes');
    }
    for(const requested of requestedSources)assert(sourcePaths.has(requested),'Every requested original is hashed in provenance: '+requested);
    assert.deepEqual(sourceHashes(),sources,'All originals unchanged during build');
    if(!verifyOnly)fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(report,null,2)+'\n');
    else assert.deepEqual(report,recorded,'Provenance equals freshly evaluated source');
    console.log('Verified Selected Work packs and source provenance:',output);
  } finally {await browser.close();assert.deepEqual(sourceHashes(),sources,'Source files must remain unchanged');}
}
module.exports={checks,fixture,captureSelected,inspectAssembly,mergeDualOpaque,proveMerge,verifyRecordedSources,verifyPackFiles};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
