'use strict';
// Independent rendered acceptance: this runner never sources the animation's
// claimed span, distance, or stow state as the value to pass.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const [widthArg,out]=process.argv.slice(2),width=Number(widthArg),height=width===390?844:900;
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8808',route='/v2/projects/skylabs/?fleet-capture';
const root=process.env.FEATURE_ROOT||process.cwd();
const meshPath='assets/models/aircraft/skylabs-competition/manifest.json';
const models=JSON.parse(fs.readFileSync(path.join(root,meshPath)));
const ends=models.parts.filter(p=>p.name.includes('Endplate V07'));
assert.equal(ends.length,2);
const modelSpan=(Math.max(...ends.map(e=>e.boundsMm[3]))-Math.min(...ends.map(e=>e.boundsMm[0])))/1000;
const front=JSON.parse(fs.readFileSync(path.join(root,'assets/models/aircraft/skylabs-mechanism/sensor-identification.json'))).solidBoundsMm[0][3]/1000;
assert.ok(Math.abs(modelSpan-1.83363164)<1e-9);
assert.ok(Math.abs(front-.149540941)<1e-8);
// Actual transformed source vertex, confirmed through the original GLB node transform.
const frontVertex=[.1495409458875656,-.04572012275457382,.031814999878406525];
const EPS=1e-3;
const phases=[0,.245,.61,.65,.72,.82,.85,.91,.955,.99,1];
async function point(page,p,takeScreenshot){
 const sample=await page.evaluate(({p,endNames})=>{
  const f=window.__skylabsFleet,T=window.THREE,plane=f.scene.getObjectByName('fleet-competition');
  f.seek(p);f.scene.updateMatrixWorld(true);const mission=f.mission,s=f.sensor;
  if(!mission)throw Error('Mission transform observability missing');
  const tips=endNames.map(name=>plane.getObjectByName(T.PropertyBinding.sanitizeNodeName(name)));
  const outer=plane.getObjectByName('cad-1-Fuselage_Floor');
  if(!outer||tips.some(o=>!o))throw Error('Original endplate or belly floor missing');
  const inverse=plane.matrixWorld.clone().invert(),sensorInverse=s.matrixWorld.clone().invert();
  const byBox=(objects,space,visible=false)=>{
   const v=new T.Vector3(),result=new T.Box3(),matrix=new T.Matrix4();
   objects.forEach(o=>o[visible?'traverseVisible':'traverse'](m=>{if(!m.isMesh)return;
    const vertices=m.geometry.attributes.position;
    matrix.multiplyMatrices(space,m.matrixWorld);
    for(let i=0;i<vertices.count;i++)result.expandByPoint(v.fromBufferAttribute(vertices,i).applyMatrix4(matrix));
   }));return result;
  };
  const spanBox=byBox(tips,inverse),sLocal=byBox([s],sensorInverse),sPlane=byBox([s],inverse),floor=byBox([outer],inverse);
  const xyz=v=>v.toArray(),box=b=>[xyz(b.min),xyz(b.max)];
  const exit=new T.Vector3(...mission.exitLocalM),tip=new T.Vector3(...mission.forwardTipLocalM);
  const tipWorld=s.localToWorld(tip.clone()),exitWorld=plane.localToWorld(exit.clone());
  const scalar=plane.getWorldScale(new T.Vector3());
  const actualDistance=exitWorld.distanceTo(tipWorld),spanLocal=spanBox.max.z-spanBox.min.z;
  const u=new T.Vector3(),proj=new T.Box2(),cam=f.camera,P=new T.Vector2();
  const stages=document.querySelector('.fleet-stage'),captionEl=stages.querySelector('.fleet-caption');
  let rayError=null,lineFullyFramed=null,captionTop=null,shaftPresent=false,lineMinY=null,exitOnLine=null;
  if(f.line.visible){
   const points=f.line.geometry.parameters.path?.points || f.line.geometry.parameters.path?.getPoints(64);
   if(!points?.length)throw Error('No actual towline path');
   const attached=s.localToWorld(s.userData.tetherLocal.clone());
   rayError=attached.distanceTo(f.line.localToWorld(points.at(-1).clone()));
   shaftPresent=rayError<.001;
   const inPlane=points.map(v=>plane.worldToLocal(f.line.localToWorld(v.clone())));
   lineMinY=Math.min(...inPlane.map(v=>v.y));
   exitOnLine=Math.min(...inPlane.map(v=>v.distanceTo(exit)));
   const renderBounds=new T.Box2();
   for(const sample of points.slice(48)){
    u.copy(sample);f.line.localToWorld(u).project(cam);renderBounds.expandByPoint(P.set(u.x,u.y));
   }
   lineFullyFramed=box(renderBounds);
  }
  if(p===.82||p===.85){
   [plane.children[0],s].forEach(o=>o.traverseVisible(m=>{if(!m.isMesh)return;const vertices=m.geometry.attributes.position;
     for(let i=0;i<vertices.count;i++){u.fromBufferAttribute(vertices,i).applyMatrix4(m.matrixWorld).project(cam);proj.expandByPoint(P.set(u.x,u.y));}
   }));
   const bounds=stages.getBoundingClientRect();
   captionTop=(captionEl.getBoundingClientRect().top-bounds.top)/bounds.height;
  }
  return {p,spanLocal,spanWorld:spanLocal*scalar.z,scale:xyz(scalar),actualDistance,ratio:actualDistance/(spanLocal*scalar.z),
   opening:xyz(exit),tip:xyz(tip),tipExitWorld:[xyz(exitWorld),xyz(tipWorld)],tipInPlane:xyz(plane.worldToLocal(tipWorld.clone())),
   floor:box(floor),sLocal:box(sLocal),sPlane:box(sPlane),cart:xyz(f.cart.position),sensor:xyz(s.position),rotation:s.quaternion.toArray(),
   phase:mission.phase,displayDistance:mission.distanceM,reportSpan:mission.wingspanM,minimum:mission.minimumM,
   labels:[stages.querySelector('[data-fleet-title]').textContent,stages.querySelector('[data-fleet-caption]').textContent],
   line:{visible:f.line.visible,rayError,lineFullyFramed,shaftPresent,lineMinY,exitOnLine},proj:captionTop===null?null:box(proj),captionTop,
   drawCalls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles};
 },{p,endNames:ends.map(e=>e.nodeName)});
 if(takeScreenshot){
  await page.evaluate(async()=>{
   const renderer=__skylabsFleet.renderer,gl=renderer.getContext();
   if(!gl.fenceSync)throw Error('WebGL2 fence missing');
   const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
   gl.flush();const start=performance.now();
   await new Promise((resolve,reject)=>{function step(){const v=gl.clientWaitSync(sync,0,0);
    if(v===gl.ALREADY_SIGNALED||v===gl.CONDITION_SATISFIED){gl.deleteSync(sync);resolve();}
    else if(v===gl.WAIT_FAILED||performance.now()-start>25000){gl.deleteSync(sync);reject(Error('GPU fence never completed'));}else requestAnimationFrame(step);}
    step();
   });
  });
  await page.locator('.fleet-stage').screenshot({path:path.join(out,'phase-'+p+'.png'),timeout:45000});
 }
 return sample;
}
async function aim(page,p){
 await page.evaluate(p=>{const t=document.querySelector('.fleet-track'),s=t.querySelector('.fleet-stage');
  scrollTo({top:scrollY+t.getBoundingClientRect().top-(parseFloat(getComputedStyle(s).top)||0)+p*(t.offsetHeight-s.offsetHeight),behavior:'instant'});},p);
 await page.waitForFunction(p=>Math.abs(Number(document.querySelector('[data-skylabs-fleet]').dataset.fleetProgress)-p)<.009,p,{timeout:22000});
 return page.evaluate(()=>{const f=window.__skylabsFleet;
  return {p:f.progress,phase:f.mission.phase,distance:f.mission.distanceM,sensor:f.sensor.position.toArray(),cart:f.cart.position.toArray(),
  label:document.querySelector('[data-fleet-title]').textContent};
 });
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const rows=[],native=[],errors=[];
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:width===390?2:1});
 try{
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base+route,{waitUntil:'domcontentloaded'});
  await page.locator('.fleet-track').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.__skylabsFleet?.ready,null,{timeout:90000});
  await aim(page,.245);
  for(const p of phases)rows.push(await point(page,p,[.245,.65,.72,.82,.85,.91,.955,1].includes(p)));
  const rowsAt=Object.fromEntries(rows.map(x=>[x.p,x]));
  const {0:initial,'0.65':carriage,'0.72':release,'0.82':tow,'0.85':held,'0.91':recovery,1:end}=rowsAt;
  for(const r of rows){
   assert.ok(r.drawCalls>0&&r.triangles>10000,'actual browser drawing '+r.p);
   assert.ok(Math.abs(r.spanLocal-modelSpan)<EPS,JSON.stringify(r));
   assert.ok(Math.abs(r.tip[0]-r.sLocal[1][0])<EPS&&Math.abs(r.tip[0]-front)<EPS&&r.tip.every((x,i)=>Math.abs(x-frontVertex[i])<1e-4),
    'not tow eye; point at original forward-most sensor geometry');
   assert.ok(r.opening[0]>=r.floor[0][0]-EPS&&r.opening[0]<=r.floor[1][0]+EPS&&r.opening[2]>=r.floor[0][2]-EPS&&r.opening[2]<=r.floor[1][2]+EPS,
    'Exit must lie on fuselage belly deck planform');
   assert.ok(Math.abs(r.opening[1]-r.floor[0][1])<.012,'Exit outside actual belly plane: '+JSON.stringify([r.opening,r.floor]));
   if(r.line.visible)assert.ok(r.line.shaftPresent,'Line must actually attach to original notch');
  }
  for(const t of [tow,held]){
   assert.ok(t.ratio>=1.5,'short rendered tow '+JSON.stringify(t));
   assert.ok(t.tipInPlane[0]<t.opening[0]-.8,'The sensor trails aft during a flight tow, not just down');
   assert.ok(t.line.visible&&t.line.lineFullyFramed,'visible line during tow');
   assert.ok(t.line.exitOnLine<1e-4,'Exposed line must actually pass through the measured belly exit');
   const box=t.proj,lb=t.line.lineFullyFramed;
   assert.ok([...box[0],...box[1],...lb[0],...lb[1]].every(n=>Math.abs(n)<.99),'tow crop '+JSON.stringify(t));
   assert.ok((1-box[0][1])/2 < t.captionTop && (1-lb[0][1])/2 < t.captionTop,'Tow must not sit behind caption');
  }
  assert.deepEqual(initial.sensor,end.sensor,'Full forward travel must put sensor back into initial internal position');
  assert.ok(initial.rotation.every((x,i)=>Math.abs(x-end.rotation[i])<1e-9),'Sensor seating orientation is restored');
  assert.deepEqual(initial.cart,end.cart,'Full forward travel must re-raise carriage, not just hide payload');
  assert.ok(end.sPlane[0][1]>=end.floor[0][1]-EPS,'Fully stowed above belly floor');
  for(const axis of [0,2])assert.ok(end.sPlane[0][axis]>=end.floor[0][axis]-EPS&&end.sPlane[1][axis]<=end.floor[1][axis]+EPS,'Stowed sensor fits back inside the belly planform');
  assert.ok(!end.line.visible||end.line.lineMinY>=end.floor[0][1]-EPS,'No external cable at stow');
  assert.ok(carriage.sensor[2]<initial.sensor[2]&&carriage.sPlane[0][1]>=carriage.floor[0][1]-EPS,'Carriage lowers without the sensor leaving the fuselage');
  assert.ok(release.sPlane[0][1]<release.floor[0][1]&&Math.abs(release.sensor[0]-initial.sensor[0])<EPS,'Sensor leaves the belly vertically before moving aft');
  assert.ok(recovery.actualDistance<held.actualDistance-.1&&end.actualDistance<recovery.actualDistance-.1,'distance closes forward through recovery');
  assert.match(tow.labels.join(' '),/tow|wingspan|1\.5/i);
  assert.match(recovery.labels.join(' '),/recover|retract|reel/i);
  assert.match(end.labels.join(' '),/stowed|secure|recover/i);
  const startAgain=await point(page,.245,false);
  assert.deepEqual(rowsAt['0.245'].labels,startAgain.labels,'Exact caption replay');
  for(const p of [.245,.65,.82,.85,.91,1,.85,.65,.245])native.push(await aim(page,p));
  assert.ok(native[2].distance>native[1].distance+1&&native[3].distance>native[4].distance+.1&&native[4].distance>native[5].distance+.1,'Forward scroll performs payout and actively reels it back');
  assert.ok(Math.abs(native[3].distance-native[6].distance)<.02,'Reverse native scroll restores the same tow distance');
  assert.deepEqual(errors,[]);
 }finally{
  fs.writeFileSync(path.join(out,'tow-proof.json'),JSON.stringify({width,height,modelSpan,actualCadForwardTipX:front,rows,native,errors},null,2));
  await browser.close();
 }
 console.log('PASS independent CAD-span, exit-to-tip geometry, attachment, viewport, phases, banners and actual forward/reverse browser scroll.');
})().catch(e=>{console.error(e);process.exitCode=1;});
