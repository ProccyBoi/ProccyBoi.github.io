/* Offline geometry regression for the detailed v3 story. Run with Node only:
 * node scripts/verify-v3-aircraft-detail.cjs
 * Uses the real vendored Three, GLTFLoader, airframe and telemetry data. Image
 * decoding is stubbed because this checks transforms/buffers, not rendering.
 * Browser QA remains required for visual appearance and DOM interaction. */
'use strict';
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname, '..');
global.window=global; global.self=global;
global.THREE=require(root+'/assets/vendor/three.min.js');
vm.runInThisContext(fs.readFileSync(root+'/assets/vendor/GLTFLoader.js','utf8'));
global.fetch=async url=>{
 const bytes=fs.readFileSync(root+String(url).split('?')[0]);
 return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes)};
};
global.Image=class {set src(value){this.width=2048;this.height=2048;this.srcValue=value;queueMicrotask(()=>this.onload?.());}};
vm.runInThisContext(fs.readFileSync(root+'/assets/v2-hero-environment.js','utf8'));
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
vm.runInThisContext(read('assets/v2-hero-assets.js'));
if(fs.existsSync(root+'/assets/v3-aircraft-electronics.js'))vm.runInThisContext(read('assets/v3-aircraft-electronics.js')); 
vm.runInThisContext(read('assets/v3-aircraft-scene.js')); 
const test=read('scripts/verify-v3-aircraft.cjs');
const helpers=test.slice(test.indexOf('async function geometry(page)'),test.indexOf('async function framing(page'));
vm.runInThisContext(helpers);
(async()=>{
 const bytes=fs.readFileSync(root+'/assets/models/aircraft/skylabs-trainer/airframe.glb');
 const gltf=await new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
 const aircraft={group:gltf.scene,metadata:JSON.parse(read('assets/models/aircraft/skylabs-trainer/manifest.json'))};
 const telemetry=await V2HeroAssets.load('telemetry');
 const flight=V3AircraftScene.create(THREE,aircraft,telemetry,{detailed:true});
 const camera=new THREE.PerspectiveCamera(32,1,.002,80);
 global.__v3Aircraft={flight,camera};
 const page={evaluate:fn=>fn()};
 const physical=await geometry(page),film=await filmGeometry(page);
 console.log(JSON.stringify({physical,film},null,2));
 assert.equal(physical.stats.sourceOccurrences,117); assert.equal(physical.stats.telemetryComponents,153);
 assert.deepEqual(physical.boardScale,[.07303,.07303,.07303]);
 physical.ground.forEach(y=>assert.ok(Math.abs(y)<1e-8,'All wheels ground'));
 assert.ok(physical.shaftError<1e-9,'Shaft unchanged');
 assert.ok(Math.abs(physical.mainBottom)<1e-6 && physical.noseBottom>.01,'Main wheels touch first');
 assert.ok(Math.abs(physical.contactVelocity[0]-physical.contactVelocity[1])<.001,'Velocity continuous');
 assert.equal(physical.reverseError,0); assert.equal(physical.assemblyError,0);
 assert.ok(film.wrappers>=11 && film.attached>0 && film.peeled>0);
 assert.equal(film.attachedError,0); assert.equal(film.structuralMotion,0);
 assert.ok(film.seamGap>.02 && film.chordChange>.02); assert.ok(film.seamBridge<.1);
 assert.equal(film.nonfinite,0); assert.equal(film.restoredError,0); assert.equal(film.cadChanges,0);
 const projections=[];
 for(const [w,h] of [[1440,900],[390,844],[320,740],[1600,650]]){
  for(const progress of [0,.1,.2,.3,.4,.5]){
   flight.setProgress(progress); flight.frame(camera,w,h);camera.updateMatrixWorld(true);
   let outside=0,count=0;
   flight.carrier.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.visible)return;
    // Unbonded sheets deliberately exit at full size; keep testing every
    // structural vertex and all film while the peel remains attached.
    if(mesh.userData.filmSurface && progress>.35)return;
    let ancestor=mesh;while(ancestor&&ancestor!==flight.board)ancestor=ancestor.parent;if(ancestor===flight.board)return;
    const p=new THREE.Vector3(),positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){p.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(camera);count++;if(Math.abs(p.x)>1.001||Math.abs(p.y)>1.001||Math.abs(p.z)>1.001)outside++;}
   });
   projections.push({w,h,progress,outside,count}); assert.equal(outside,0,'Aircraft framed '+w+'x'+h+' p='+progress);
  }
 }

 assert.equal(flight.statistics.batteryCells,8); assert.equal(flight.statistics.harnessWires,31);
 assert.ok(flight.statistics.filmRows>100,'Derived film has spanwise resolution');
 const objects=[],buffers=[];
 flight.electronics.group.traverse(item=>{objects.push(item);if(item.isMesh){for(const attribute of Object.values(item.geometry.attributes))buffers.push({item,attribute,array:attribute.array});}});
 flight.setProgress(.65);const reference=objects.map(item=>item.matrixWorld.elements.slice());
 for(const p of [0,1,.35,.7,.2,.92,.43,0,.65])flight.setProgress(p);
 objects.forEach((item,i)=>assert.deepEqual(item.matrixWorld.elements,reference[i],'Identical system pose after reverse seeking'));
 buffers.forEach(({attribute,array})=>{assert.equal(attribute.array,array,'Animation retains fixed geometry buffers');for(const value of array)assert.ok(Number.isFinite(value),'Finite electrical geometry');});
 flight.setProgress(0);assert.ok(flight.electronics.assemblyError()<1e-12,'Electronics restoration within floating-point precision');
 assert.equal(flight.electronics.group.visible,false,'Electronics hidden during landing');
 flight.setProgress(.65);assert.equal(flight.electronics.inspect().opacity,1,'Systems fully opaque during inspection');
 flight.setProgress(1);assert.equal(flight.electronics.group.visible,false,'Telemetry close-up clears illustrative systems');
 // The whole wrapper (including both cap tabs) clears before the
 // electronics inspection, without an abrupt phone camera refit.
 for(const p of [.35,.50,.52,.60,1,0]){
  flight.setProgress(p);
  for(const patch of flight.films){
   const materials=Array.isArray(patch.mesh.material)?patch.mesh.material:[patch.mesh.material];
   if(p>=.60){assert.equal(patch.mesh.visible,false,'No dangling skin remains');materials.forEach(m=>assert.equal(m.opacity,0,'Skin fade ends fully'));}
   else {assert.equal(patch.mesh.visible,true,'Skin restored before release');materials.forEach(m=>assert.equal(m.opacity,1,'Attached skin remains opaque'));}
  }
 }
 for(const [w,h]of[[1440,900],[390,844],[320,740]]){
  let prior=null;
  for(let n=490;n<=630;n++){flight.setProgress(n/1000);const frame=flight.frame(camera,w,h);if(prior)assert.ok(camera.position.distanceTo(prior)/frame.distance<.015,'Skin completion cannot snap the camera relative to its viewing distance');prior=camera.position.clone();}
 }
 const home=read('v3/index.html');assert.ok(!home.includes('data-aircraft-detail='),'Numbered view controls removed');assert.ok(!home.includes('v3-aircraft-details'),'Overlay markup removed');
 const systems=[];
 for(const [w,h] of [[1440,900],[390,844],[320,740],[1600,650]])for(const progress of [.60,.65,.70]){
  flight.setProgress(progress);flight.frame(camera,w,h);camera.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(flight.electronics.group), p=new THREE.Vector3();
  let outside=0;const projected=[];
  for(let i=0;i<8;i++){p.set(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).project(camera);projected.push(p.toArray());if(Math.abs(p.x)>1.001||Math.abs(p.y)>1.001||Math.abs(p.z)>1.001)outside++;}
  assert.equal(outside,0,'Systems fit close-up '+w+'x'+h+' at '+progress);systems.push({w,h,progress,projected});
 }
 console.log(JSON.stringify({result:'PASS',projections,systems},null,2));
 const destination=process.env.QA_OUT||root+'/.codex-temp/v3-aircraft-detail/geometry.json';fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify({physical,film,projections,systems,electronics:flight.electronics.statistics},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
