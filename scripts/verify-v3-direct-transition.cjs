/* Renderer-free sequencing regression for the direct Aircraft → Telemetry story.
 * Uses the real meshes; it does not certify browser rendering or scroll input.
 * node scripts/verify-v3-direct-transition.cjs
 * V3_PEEL_REFERENCE may select the last accepted peel commit (default HEAD).
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
global.window=global;global.self=global;
const T=global.THREE=require(root+'/assets/vendor/three.min.js');
vm.runInThisContext(read('assets/vendor/GLTFLoader.js').toString());
global.fetch=async url=>{const bytes=read(String(url).split('?')[0].replace(/^\//,''));return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes)}};
global.Image=class{set src(value){this.width=2048;this.height=2048;queueMicrotask(()=>this.onload?.())}};
for(const file of ['assets/v2-hero-environment.js','assets/v2-hero-assets.js','assets/v3-aircraft-electronics.js','assets/v3-aircraft-scene.js'])vm.runInThisContext(read(file).toString());
const currentFactory=V3AircraftScene,sourceHash=hash(read('assets/v3-aircraft-scene.js'));
const bytes=read('assets/models/aircraft/skylabs-trainer/airframe.glb'),metadata=JSON.parse(read('assets/models/aircraft/skylabs-trainer/manifest.json'));
async function fixture(factory,telemetry=null){const gltf=await new Promise((resolve,reject)=>new T.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));return factory.create(T,{group:gltf.scene,metadata},telemetry,{detailed:true})}
function filmState(flight){return flight.films.map(patch=>({name:patch.mesh.name,position:hash(Buffer.from(patch.mesh.geometry.attributes.position.array.buffer)),normal:hash(Buffer.from(patch.mesh.geometry.attributes.normal.array.buffer)),matrix:patch.mesh.matrixWorld.elements.slice(),visible:patch.mesh.visible,opacity:[].concat(patch.mesh.material).map(m=>m.opacity)}))}
(async()=>{
 const telemetry=await V2HeroAssets.load('telemetry'),flight=await fixture(currentFactory,telemetry),camera=new T.PerspectiveCamera(32,1,.002,80);
 const poses=new Set(Array.from({length:201},(_,i)=>i/200));
 for(const p of [.60,.62,.65,.69,.86,.90])for(const d of [-.000001,0,.000001])poses.add(p+d);
 const rigid=flight.parts.filter(part=>!part.filmPatches),boardRest=flight.board.position.clone();
 let maximumConcurrentRigidMotion=0,firstRigidProgress=1,lastVisibleFilmProgress=0;
 for(const p of [...poses].sort((a,b)=>a-b)){
  flight.setProgress(p);
  const moving=Math.max(...rigid.map(part=>Math.max(part.object.position.distanceTo(part.base),1-Math.abs(part.object.quaternion.dot(part.quaternion)))));
  const visibleFilm=flight.films.some(patch=>patch.mesh.visible);
  if(visibleFilm){lastVisibleFilmProgress=Math.max(lastVisibleFilmProgress,p);maximumConcurrentRigidMotion=Math.max(maximumConcurrentRigidMotion,moving);assert.ok(moving<1e-12,'Rigid exterior cannot enter a visible film departure path at '+p)}
  if(moving>1e-10)firstRigidProgress=Math.min(firstRigidProgress,p);
  if(p<=.60)assert.ok(flight.electronics.inspect().assemblyError<1e-12,'Hardware stays installed during film departure');
  if(p<=.62)assert.ok(flight.board.position.distanceTo(boardRest)<1e-12,'Board remains mounted until film clears');
  if(p>=.60)assert.ok(!visibleFilm,'Skin is fully cleared before structural motion');
 }
 assert.ok(firstRigidProgress>lastVisibleFilmProgress+.015,'Explicit clearance interval between sheets and rigid parts');
 const reference=process.env.V3_PEEL_REFERENCE||'HEAD';
 vm.runInThisContext(execFileSync('git',['show',reference+':assets/v3-aircraft-scene.js'],{cwd:root,maxBuffer:8e6}).toString());
 const previous=await fixture(V3AircraftScene),current=await fixture(currentFactory);
 for(let n=0;n<=30;n++){const p=n/50;previous.setProgress(p);current.setProgress(p);assert.deepEqual(filmState(current),filmState(previous),'Accepted film deformation, departure, opacity and reversal stay unchanged at '+p)}
 const cameraChecks=[];
 for(const [width,height]of[[1440,900],[390,844],[320,740]]){
  let prior=null,maximumStep=0,maximumMicrostep=0,previousFocus=0;
  for(let n=590;n<=1000;n++){
   const p=n/1000;flight.setProgress(p);const framing=flight.frame(camera,width,height),position=camera.position.clone();
   assert.ok(framing.focus>=previousFocus,'Camera moves directly toward telemetry, without an inspection stop');previousFocus=framing.focus;
   if(prior)maximumStep=Math.max(maximumStep,position.distanceTo(prior.position)/prior.distance);
   flight.setProgress(Math.min(1,p+1e-6));flight.frame(camera,width,height);maximumMicrostep=Math.max(maximumMicrostep,camera.position.distanceTo(position)/framing.distance);
   prior={position,distance:framing.distance};
  }
  assert.ok(maximumStep<.03,'Bounded camera travel per .001 progress');assert.ok(maximumMicrostep<.0001,'No endpoint/visibility-driven camera jump');
  flight.setProgress(1);const end=flight.frame(camera,width,height);camera.updateMatrixWorld(true);
  assert.equal(end.focus,1);assert.ok(end.target.distanceTo(flight.board.getWorldPosition(new T.Vector3()))<1e-12);
  const point=new T.Vector3();
  flight.board.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(camera);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,'Complete telemetry board framed')}});
  cameraChecks.push({width,height,maximumStep,maximumMicrostep});
 }
 flight.setProgress(1);assert.equal(flight.electronics.group.visible,false);assert.ok(flight.films.every(p=>!p.mesh.visible));
 const copy=read('v3/index.html').toString();assert.equal((copy.match(/data-aircraft-chapter=/g)||[]).length,2);assert.ok(!/id="inside"|href="#inside"|Anatomy of an aircraft|Every connection/.test(copy));
 assert.ok(copy.includes('href="#telemetry" data-aircraft-go="1"'));
 assert.equal(hash(read('assets/v3-aircraft-scene.js')),sourceHash,'Source stable throughout test');
 const report={passed:true,sourceHash,reference,poses:poses.size,maximumConcurrentRigidMotion,firstRigidProgress,lastVisibleFilmProgress,unchangedPeelPoses:31,cameraChecks};
 console.log(JSON.stringify(report,null,2));const out=root+'/.codex-temp/v3-direct-transition';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/evidence.json',JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
