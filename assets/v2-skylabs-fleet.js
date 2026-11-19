/* Original STEP geometry, internally installed with source-derived Solarfilm.
 * See docs/skylabs-competition-integration.md for mount, cutaway and towline
 * assumptions. Only the isolated sensor body deploys; the carriage lowers inside the fuselage before release. */
(()=>{'use strict';
 const root=document.querySelector('[data-skylabs-fleet]');if(!root)return;
 const stage=root.querySelector('.fleet-stage'),track=root.querySelector('.fleet-track'),canvas=root.querySelector('canvas'),status=root.querySelector('.fleet-status');
 const title=root.querySelector('[data-fleet-title]'),caption=root.querySelector('[data-fleet-caption]'),bar=root.querySelector('.fleet-progress');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer,scene,camera,plane,trainer,mechanism,sensor,line,mechanismSource,housing=[],films=[],filmGroup,airframeCutaway=[],cart,supersededSensor,systems,wingCutaway=[],frame=0,loading=false,ready=false,active=false,failed=false,progress=0;
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 function staticCaption(){title.textContent='The two airframes';caption.textContent='Trainer and competition taildragger';bar.style.transform='scaleX(0)';}
 const allowed=()=>!reduced.matches&&!navigator.connection?.saveData&&innerHeight>=560;
 const script=(url,test)=>new Promise((resolve,reject)=>{if(test())return resolve();const path=new URL(url,location.href).pathname;let el=[...document.scripts].find(s=>s.src&&new URL(s.src,location.href).pathname===path);if(!el){el=document.createElement('script');el.src=url;document.head.append(el);}el.addEventListener('load',resolve,{once:true});el.addEventListener('error',reject,{once:true});});
 const aircraftRoot='/assets/models/aircraft/';
 const trainerMarks=['left-inner','left-outer','right-inner','right-outer','side-negative','side-positive'];
 const competitionMarks=['left-white','left-blue','right-white','right-blue'];
 async function aircraftAsset(slug,name,packed){
  const parse=async(usePacked)=>{
   const path=aircraftRoot+slug+'/'+name+(usePacked?'.meshopt':'')+'.glb.gz';
   const bytes=await window.V2ReadBinaryResponse(await fetch(path));
   const loader=new THREE.GLTFLoader();if(usePacked)loader.setMeshoptDecoder(window.MeshoptDecoder);
   return new Promise((resolve,reject)=>loader.parse(bytes,'',g=>resolve(g.scene),reject));
  };
  // Original unmodified CAD stays independently usable on decoder or pack failure.
  if(packed){try{return await parse(true);}catch(_){/* try the original GLB */}}
  return parse(false);
 }
 async function markings(T,slug,names,trainer=false){
  const texture=url=>new Promise((resolve,reject)=>new T.TextureLoader().load(url,resolve,undefined,reject));
  const pairs=await Promise.all(names.map(async name=>{
   const path=aircraftRoot+slug+'/livery/'+name;let map;
   try{map=await texture(path+'.webp');}
   catch(_){try{map=await texture(path+'.png'+(trainer?'?v=trainer-20261105b':''));}catch(_){return null;}}
   map.encoding=T.sRGBEncoding;if(trainer)map.anisotropy=8;return [name,map];
  }));
  return Object.fromEntries(pairs.filter(Boolean));
 }
 function wrap(source,isPlane){
  const T=THREE,group=new T.Group();group.add(source);
  // Source units are metres. Only the presentation wrapper changes axes.
  source.rotation.set(-Math.PI/2,0,isPlane?Math.PI/2:0);
  source.updateMatrixWorld(true);const box=new T.Box3().setFromObject(source);source.position.sub(box.getCenter(new T.Vector3()));
  source.traverse(node=>{if(!node.isMesh)return;const name=node.userData.sourceName||node.parent?.userData.sourceName||node.name;
   node.material=new T.MeshStandardMaterial({color:/CF_|spar|Wheel|Prop|motor/i.test(name)?0x293449:/Sensor|Cart/i.test(name)?0x83aade:0xc7b9a1,roughness:.65,metalness:.08,envMapIntensity:.35,side:T.DoubleSide});node.material.color.convertSRGBToLinear();
  });return group;
 }
 // A chase shot, not an object turntable. Fly both airframes into a brief
 // formation hold; let the trainer bank out before looking through the skin.
 // Axes: +X nose, +Y up. One world-space pose per scroll position in either
 // direction; no elapsed-time flight or camera state to reset on retrieval.
 const beat=(p,a,b)=>smooth((p-a)/(b-a));
 function flyPair(p,portrait){
  const lead=beat(p,0,.19),join=beat(p,.018,.245),follow=beat(p,.31,.49);
  const breakaway=beat(p,.295,.49),round=Math.sin(Math.PI*breakaway);
  const cx=-.64*(1-portrait),cy=-.13-.20*portrait,cz=.36*(1-portrait);
  const tx=.65*(1-portrait),ty=.18+.28*portrait,tz=-.48*(1-portrait);
  // They fly nose-first from depth on two staggered paths. Begin fully in
  // frame even on narrow screens; perspective, not a miniature-to-full-size
  // scale trick, gives the incoming aircraft their change in apparent size.
  plane.position.set(cx*(1-follow)-(1.22-.70*portrait)*(1-join),
   cy*(1-follow)+.06*follow+.19*(1-join),cz*(1-follow)-1.66*(1-join));
  plane.rotation.set(.025+.16*(1-join)-.065*Math.sin(Math.PI*join),
   -.18-.42*(1-join),.055*(1-join));
  plane.scale.setScalar(.80-.18*portrait+follow*(.12+.18*portrait));plane.visible=true;
  trainer.position.set(tx-(.86-.51*portrait)*(1-lead)+breakaway*3.70,
   ty+.21*(1-lead)+breakaway*.85,tz-.99*(1-lead)-breakaway*.55);
  trainer.rotation.set(.045-.23*(1-lead)+.53*round,-.21-.29*(1-lead)+.33*breakaway,
   .055*(1-lead)+.16*round);
  trainer.scale.setScalar(.74-.17*portrait);trainer.visible=breakaway<.999;
  return follow;
 }
 function frameCamera(T,aspect,p,follow){
  const portrait=clamp((1.68-aspect)/.82);
  const widthFit=1/Math.min(1,aspect/.66),midFit=1/Math.min(1,aspect/1.12);
  const local=(x,y,z)=>plane.localToWorld(new T.Vector3(x,y,z));
  const pose=(target,x,y,z,fit=1)=>({target,offset:new T.Vector3(x,y,z).multiplyScalar(fit)});
  const mix=(a,b,t)=>{a.target.lerp(b.target,t);a.offset.lerp(b.offset,t);return a;};
  const approach=1-beat(p,.01,.24);
  const chase=pose(new T.Vector3(.105-(.80-.50*portrait)*approach,-.085+.06*approach,-.58*approach),
   1.21+.23*approach,1.31-.11*approach,2.01+.48*approach,(1.05+portrait*.19)*widthFit);
  const skin=pose(local(.02,-.055,0),1.07,1.49,1.69,midFit*1.05);
  // The skin has its own shot before the lens drops under the wing. Stay
  // alongside the cart at its lower stop; do not turn the side view into
  // a fly-through while the small internal stroke is the subject.
  const carriage=pose(local(.352,-.04,0),.065,-.009,.77,1/Math.min(1,aspect/.92));
  // Start widening just before payout, then tilt with the falling sensor.
  // The last few percent are a still end plate with the entire tether visible.
  const reach=beat(p,.78,.955);
  const tow=pose(local(.078,-.087-.087*reach,0),.83,.34+.035*reach,1.76,midFit*(1+.12*portrait));
  mix(chase,skin,follow);mix(chase,carriage,beat(p,.495,.607));mix(chase,tow,beat(p,.738,.882));
  camera.position.copy(chase.target).add(chase.offset);
  camera.aspect=aspect;camera.lookAt(chase.target);camera.updateProjectionMatrix();
 }
 function draw(value){
  if(!ready)return;progress=clamp(value);const T=THREE,w=stage.clientWidth,h=stage.clientHeight,aspect=w/h,portrait=clamp((1.68-aspect)/.82);
  const dpr=Math.min(devicePixelRatio,1.5);if(renderer.getPixelRatio()!==dpr)renderer.setPixelRatio(dpr);if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
  const focus=flyPair(progress,portrait),returnWide=beat(progress,.738,.905);
  // Let the peel trail the trainer's hand-off, so the marked wings can be
  // compared intact. Carriage stroke and tether travel stay at source scale.
  const lower=.025*beat(progress,.60,.70),deploy=beat(progress,.78,.955),drop=lower+.45*deploy,peel=beat(progress,.355,.555),inspect=beat(progress,.525,.61);
  // Only authored film peels. Structural CAD and the complete internal carriage
  // remain aboard; the cart lowers on the internal guides before sensor release.
  films.forEach((part,index)=>{const amount=clamp(peel-(index%4)*.018*Math.sin(Math.PI*peel));part.patches.forEach(patch=>patch.deform(amount));part.group.position.copy(part.normal).multiplyScalar(.10*smooth((amount-.65)/.35));part.material.opacity=1-smooth((amount-.85)/.15);part.material.transparent=part.material.opacity<1;part.material.depthWrite=part.material.opacity>.95;part.group.visible=amount<.999;});
  housing.forEach(part=>{part.object.position.copy(part.rest);part.object.visible=true;part.materials.forEach(material=>{material.opacity=part.object===cart?1:1-.84*inspect;material.transparent=material.opacity<1;material.depthWrite=material.opacity>.95;});});
  airframeCutaway.forEach(part=>{part.object.visible=true;part.materials.forEach(material=>{material.opacity=1-inspect*(part.floor?1:.90);material.transparent=material.opacity<1;material.depthWrite=material.opacity>.95;});});
  wingCutaway.forEach(material=>{material.opacity=1-inspect*(1-returnWide);material.transparent=material.opacity<1;material.depthWrite=material.opacity>.95;});
  systems.setInspection(1-inspect*(1-returnWide));
  sensor.position.copy(sensor.userData.rest);sensor.position.z-=drop;cart.position.z-=lower;
  // A small, damped-looking roll appears only once the body has cleared its
  // guides. It is deterministic in progress and vanishes at either endpoint.
  // Compensate about the measured body centre so its travel remains vertical.
  const sway=.012*smooth((deploy-.55)/.25)*Math.sin(Math.PI*deploy);
  sensor.quaternion.copy(sensor.userData.restQuaternion);sensor.rotateX(sway);
  const centre=sensor.userData.bodyCenterLocal;
  sensor.position.add(centre.clone().applyQuaternion(sensor.userData.restQuaternion).sub(centre.clone().applyQuaternion(sensor.quaternion)));
  plane.updateMatrixWorld(true);
  frameCamera(T,aspect,progress,focus);
  // Measured named wing spar, no invented cross-member or external extension.
  // The ellipse clears its actual 3 x 22 mm section. Terminal point is the
  // measured 1.5 mm-radius FRONT notch, rigidly tracked on the isolated body.
  const points=[],sx=.32031582,sy=.008291693;
  for(let i=0;i<=48;i++){const angle=Math.PI+i/48*Math.PI*2;points.push(new T.Vector3(sx+Math.cos(angle)*.004,sy+Math.sin(angle)*.014,.0555));}
  points.push(new T.Vector3(.35,.031,.035),new T.Vector3(.37,.030,0));
  const attach=sensor.localToWorld(sensor.userData.tetherLocal.clone());plane.worldToLocal(attach);
  // A little stored line hangs slack at the guide; it straightens as the
  // sensor pays out and the towline takes load, instead of sagging further.
  const guide=points[points.length-1],mid=guide.clone().lerp(attach,.5),slack=.002+.018*(1-smooth((deploy-.08)/.78));mid.y-=slack;
  points.push(...new T.QuadraticBezierCurve3(guide,mid,attach).getPoints(32).slice(1));
  line.geometry.dispose();line.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(points,false,'centripetal'),160,.00065,6,false);line.userData.anchor=points[0].toArray();line.userData.attachment=attach.toArray();line.userData.slack=slack;line.visible=peel>.8;
  renderer.render(scene,camera);bar.style.transform='scaleX('+progress+')';
  const label=progress<.31?['The two airframes','The trainer leads the competition taildragger into formation.']:progress<.525?['Beneath the Solarfilm','The trainer banks away as the competition wing opens.']:progress<.765?['Inside the fuselage','The carriage lowers inside the aircraft before release.']:progress<.955?['Sensor deployment','The sensor leaves the belly on its front-notch tether.']:['On tow','The carriage stays aboard. Scroll back to retrieve the sensor.'];
  if(title.textContent!==label[0]){title.textContent=label[0];caption.textContent=label[1];}
  root.dataset.fleetProgress=progress.toFixed(4);
 }
 function tick(){frame=0;if(!ready||!active||document.hidden||!allowed())return;const r=track.getBoundingClientRect(),inset=parseFloat(getComputedStyle(stage).top)||0;draw(clamp((inset-r.top)/Math.max(1,track.offsetHeight-stage.offsetHeight)));}
 function queue(){if(!frame&&ready&&active&&allowed()&&!document.hidden)frame=requestAnimationFrame(tick);}
 async function start(){if(loading||ready||failed||!allowed())return;loading=true;root.dataset.fleetState='loading';
  try{
   if(!window.DecompressionStream)throw Error('Static view');
   await script('/assets/vendor/three.min.js',()=>!!window.THREE);
   // Establish a usable graphics context before requesting several MB of CAD.
   // If unavailable the accessible still is already on screen.
   if(!allowed()){loading=false;root.dataset.fleetState='static';return;}
   renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
   const T=window.THREE;
   // These modules register factories. None requires another until its factory
   // is called below. Overlap their transfers only after verifying real WebGL.
   const decoder=window.WebAssembly
    ?script('/assets/vendor/meshopt_decoder.js',()=>!!window.MeshoptDecoder).then(async()=>{await window.MeshoptDecoder.ready;return !!window.MeshoptDecoder.supported;}).catch(()=>false)
    :Promise.resolve(false);
   const [,packed]=await Promise.all([
    Promise.all([
     script('/assets/vendor/GLTFLoader.js',()=>!!T.GLTFLoader),
     script('/assets/v3-aircraft-scene.js?v=trainer-20261105b',()=>!!window.V3AircraftScene),
     script('/assets/v2-hero-environment.js',()=>!!window.V2ProductStudio),
     script('/assets/v2-skylabs-film.js',()=>!!window.V2SkylabsFilm),
     script('/assets/v2-hero-assets.js',()=>!!window.V2HeroAssets),
     script('/assets/v3-aircraft-electronics.js',()=>!!window.V3AircraftElectronics),
     script('/assets/v2-skylabs-systems.js',()=>!!window.V2SkylabsSystems)
    ]),decoder
   ]);
   if(!allowed()){renderer.dispose();renderer=null;loading=false;root.dataset.fleetState='static';return;}
   // Deliver the two appearances as a single draw, but no longer serialize the
   // artwork and studio environment behind the last CAD decode.
   const models=await Promise.all([
    aircraftAsset('skylabs-competition','assembly',packed),
    aircraftAsset('skylabs-mechanism','assembly',packed),
    window.V3AircraftScene.load(T),
    aircraftAsset('skylabs-mechanism','sensor-body',packed),
    fetch(aircraftRoot+'skylabs-competition/solarfilm.json.gz').then(r=>window.V2ReadBinaryResponse(r)).then(b=>JSON.parse(new TextDecoder().decode(b))),
    window.V2HeroAssets.load('telemetry'),
    markings(T,'skylabs-competition',competitionMarks),
    markings(T,'skylabs-trainer',trainerMarks,true),
    window.V2HeroEnvironment.load(T)
   ]);
   const livery=models[6];models[2].trainerLivery=models[7];
   root.dataset.fleetLivery=Object.keys(livery).length===competitionMarks.length?'ready':'unavailable';
   scene=new T.Scene();camera=new T.PerspectiveCamera(37,1,.2,20);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;
   window.V2ProductStudio.configureRenderer(renderer,T);scene.environment=models[8];const studio=window.V2ProductStudio.createLights(T,scene);renderer.toneMappingExposure=.72;studio.key.shadow.normalBias=.0006;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
   plane=wrap(models[0],true);mechanism=wrap(models[1],false);trainer=new T.Group();trainer.name='fleet-trainer';plane.name='fleet-competition';window.V3AircraftScene.applyTrainerLivery(T,models[2],true);const sourceTrainer=models[2].group;trainer.add(sourceTrainer);sourceTrainer.traverse(node=>{if(node.userData.category==='covering')node.traverse(mesh=>{if(!mesh.isMesh)return;const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>{const copy=material.clone();copy.polygonOffset=true;copy.polygonOffsetFactor=-2;copy.polygonOffsetUnits=-2;return copy;});mesh.material=materials.length===1?materials[0]:materials;});});sourceTrainer.updateMatrixWorld(true);sourceTrainer.position.sub(new T.Box3().setFromObject(sourceTrainer).getCenter(new T.Vector3()));scene.add(plane,trainer);plane.add(mechanism);mechanism.position.set(.36381582,-.0246424995,0);mechanismSource=models[1];
   const materialsOf=object=>{const result=[];object.traverse(mesh=>{if(!mesh.isMesh)return;const copies=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.clone());mesh.material=copies.length===1?copies[0]:copies;result.push(...copies);});return result;};
   models[1].traverse(object=>{const name=object.userData.sourceName;if(name==='Sensor V2, 300mm Length'){supersededSensor=object;object.visible=false;}else if(name&&name!=='V2 Assembly'){if(name==='Cart V2')cart=object;housing.push({object,rest:object.position.clone(),materials:materialsOf(object)});}});
   sensor=models[3];sensor.name='isolated-sensor-body';mechanismSource.add(sensor);sensor.userData.rest=sensor.position.clone();sensor.traverse(mesh=>{if(mesh.isMesh){mesh.material=new T.MeshStandardMaterial({color:0x1257aa,roughness:.4,metalness:.08,envMapIntensity:.25});mesh.material.color.convertSRGBToLinear();}});
   // The old payload and loose duplicate rudder are superseded source references,
   // retained in the asset but not displayed as a second sensor or stray part.
   models[0].traverse(object=>{if(object.name==='cad-6-V2TP-Tainer_Full_Assembly'||object.userData.sourceName==='V2TP-Tainer Full Assembly'||object.name.startsWith('cad-72-'))object.visible=false;const name=object.userData.sourceName;if(name&&/Wing.*Assembly|Endplate/i.test(name))wingCutaway.push(...materialsOf(object));if(['Fuselage_Floor','Fuselage_Wall','Fuselage_Top_Panel'].includes(name))airframeCutaway.push({object,floor:name==='Fuselage_Floor',materials:materialsOf(object)});});
   cart.traverse(mesh=>{if(mesh.isMesh){mesh.material.color.setHex(0x29415a).convertSRGBToLinear();mesh.material.envMapIntensity=.25;}});
   plane.updateMatrixWorld(true);sensor.userData.tetherLocal=sensor.worldToLocal(mechanismSource.localToWorld(new T.Vector3(.061540941309766,-.0457201238048,.057815001)));
   sensor.userData.frontNotchSource=[.061540941309766,-.0457201238048,.057815001];
   // Seat the body 5 mm lower; derive the notch above in original CAD coordinates
   // so the attachment follows this placement rather than cancelling the offset.
   sensor.position.z-=.005;sensor.userData.rest.copy(sensor.position);sensor.userData.restQuaternion=sensor.quaternion.clone();sensor.userData.bodyCenterLocal=new T.Vector3(-.000459059,-.045720124,.031815001);sensor.userData.mountOffsetM=[0,0,-.005];
   line=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:0x8abaff}));line.name='fleet-towline';plane.add(line);
   filmGroup=new T.Group();filmGroup.name='competition-solarfilm';plane.add(filmGroup);
   for(const item of models[4].panels){
    const group=new T.Group(),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(item.positions,3));if(item.uv)geometry.setAttribute('uv',new T.Float32BufferAttribute(item.uv,2));
    const indices=item.indices.slice(),normal=new T.Vector3(...item.normal),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
    for(let i=0;i<indices.length;i+=3){a.fromArray(item.positions,indices[i]*3);b.fromArray(item.positions,indices[i+1]*3);c.fromArray(item.positions,indices[i+2]*3);if(b.sub(a).cross(c.sub(a)).dot(normal)<0)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];}
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new T.MeshPhysicalMaterial({color:item.colour==='blue'?0x1858c8:0xf3f1e9,roughness:.29,metalness:.08,clearcoat:.3,clearcoatRoughness:.22,envMapIntensity:.35,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    material.color.convertSRGBToLinear();
    // Livery is baked into the top film's existing UVs, so it deforms with the covering.
    const liveryKey=item.name.match(/^wing-(left|right)1-(white|blue)$/);
    if(liveryKey&&livery[liveryKey[1]+'-'+liveryKey[2]]){material.map=livery[liveryKey[1]+'-'+liveryKey[2]];material.color.setRGB(1,1,1);material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
    const mesh=new T.Mesh(geometry,material);mesh.name=item.name;mesh.userData={filmSurface:item.kind,peelAxis:item.axis,outward:item.normal,panelNormal:item.normal,separatedFilmPanel:true,shortAxisPeel:item.shortAxisPeel,filmRegion:item.name.startsWith('fuselage')?'fuselage':'wing'};group.add(mesh);filmGroup.add(group);
    const patches=window.V2SkylabsFilm.covering(T,{object:group,filmRegion:mesh.userData.filmRegion},true);films.push({group,material,normal,patches});
   }
   systems=window.V2SkylabsSystems.create(T,models[5]);plane.add(systems.group);
   plane.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});ready=true;loading=false;
   if(allowed()){root.dataset.fleetState='ready';status.textContent='Scroll to fly in, deploy the sensor and reverse to retrieve.';queue();}else{root.dataset.fleetState='static';}
  }catch(error){failed=true;loading=false;ready=false;renderer?.dispose();root.dataset.fleetState='failed';staticCaption();status.textContent='The 3D view is unavailable. The CAD preview and assembly notes remain below.';}
 }
 const observer=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;if(active){start();queue();}else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'400px 0px'});observer.observe(track);
 addEventListener('scroll',queue,{passive:true});addEventListener('resize',()=>{preference();queue();},{passive:true});document.addEventListener('visibilitychange',queue);
 function preference(){if(!allowed()){cancelAnimationFrame(frame);frame=0;root.dataset.fleetState='static';staticCaption();status.textContent='Static CAD preview.';}else if(ready){root.dataset.fleetState='ready';queue();}else if(active)start();}
 reduced.addEventListener('change',preference);navigator.connection?.addEventListener?.('change',preference);
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;ready=false;cancelAnimationFrame(frame);root.dataset.fleetState=allowed()?'failed':'static';staticCaption();status.textContent=allowed()?'3D rendering paused. The CAD preview remains available.':'Static CAD preview.';});
 addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
 if(new URLSearchParams(location.search).has('fleet-capture'))window.__skylabsFleet={seek:draw,get ready(){return ready;},get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},get sensor(){return sensor;},get mechanism(){return mechanism;},get housing(){return housing;},get cart(){return cart;},get systems(){return systems;},get films(){return films;},get filmGroup(){return filmGroup;},get mechanismSource(){return mechanismSource;},get supersededSensor(){return supersededSensor;},get line(){return line;},get progress(){return progress;}};
 preference();
})();
