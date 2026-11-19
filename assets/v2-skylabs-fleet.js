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
 const script=(url,test)=>new Promise((resolve,reject)=>{if(test())return resolve();let el=[...document.scripts].find(s=>new URL(s.src,location.href).pathname===url);if(!el){el=document.createElement('script');el.src=url;document.head.append(el);}el.addEventListener('load',resolve,{once:true});el.addEventListener('error',reject,{once:true});});
 async function asset(slug,file="assembly.glb.gz"){
  const response=await fetch('/assets/models/aircraft/'+slug+'/'+file);if(!response.ok)throw Error('Model download failed');
  const bytes=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(bytes,'',g=>resolve(g.scene),reject));
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
 // Four authored compositions, driven only by scroll: overhead formation,
 // skin lifting off the wing, a side elevation of the carriage, and the aircraft
 // with its sensor extended. Use stage aspect (not viewport width); a narrow
 // laptop split view needs the same fit protection as a phone.
 function frameCamera(T,aspect,p,focus){
  const portrait=clamp((1.30-aspect)/.54);
  const widthFit=1/Math.min(1,aspect/.66),midFit=1/Math.min(1,aspect/1.12);
  const local=(x,y,z)=>plane.localToWorld(new T.Vector3(x,y,z));
  const pose=(target,x,y,z,fit=1)=>({target,offset:new T.Vector3(x,y,z).multiplyScalar(fit)});
  const mix=(a,b,t)=>{a.target.lerp(b.target,t);a.offset.lerp(b.offset,t);return a;};
  const formation=pose(new T.Vector3(-.04,-.075,0),1.25,1.38,2.10,1.06+portrait*.20);
  formation.offset.multiplyScalar(widthFit);
  // Move with the exhibition aircraft while the trainer leaves the composition.
  const skin=pose(local(.02,-.06,0),1.09,1.64,1.77,midFit*1.07);
  const close=pose(local(.352,-.034,0),.050,-.012,.81,1/Math.min(1,aspect/.92));
  // The final sightline clears the wing and leaves the suspended sensor above
  // the caption; it is a wider side elevation, not a return to the arrival view.
  const payout=pose(local(.045,-.16,0),.83,.40,1.79,midFit*(1+.12*portrait));
  mix(formation,skin,focus);
  mix(formation,close,smooth((p-.48)/.13));
  mix(formation,payout,smooth((p-.725)/.175));
  camera.position.copy(formation.target).add(formation.offset);
  camera.aspect=aspect;camera.lookAt(formation.target);camera.updateProjectionMatrix();
 }
 function draw(value){
  if(!ready)return;progress=clamp(value);const T=THREE,w=stage.clientWidth,h=stage.clientHeight,aspect=w/h,portrait=clamp((1.30-aspect)/.54);
  const dpr=Math.min(devicePixelRatio,1.5);if(renderer.getPixelRatio()!==dpr)renderer.setPixelRatio(dpr);if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
  const arrival=smooth((progress-.035)/.195),trainerArrival=smooth(progress/.17);
  const focus=smooth((progress-.28)/.195),returnWide=smooth((progress-.725)/.225);
  // Finish the 25 mm carriage stroke, hold briefly, then pay out the sensor.
  // Every pose derives from scroll progress, so retrieval is the exact reverse.
  const lower=.025*smooth((progress-.60)/.10),deploy=smooth((progress-.78)/.19),drop=lower+.45*deploy,peel=smooth((progress-.28)/.27),inspect=smooth((progress-.51)/.10);
  // The trainer leads from the rear. Stack the pair in portrait instead of
  // squeezing a landscape formation or shrinking its decals into the margins.
  const cx=-.67*(1-portrait),cy=-.11-.23*portrait,cz=.35*(1-portrait);
  plane.position.set(cx*(1-focus)-.52*(1-arrival),cy*(1-focus)+.075*focus+.13*(1-arrival),cz*(1-focus)-.46*(1-arrival));
  plane.rotation.set(.025+.095*(1-arrival),-.18+.13*(1-arrival),-.11*(1-arrival));
  plane.scale.setScalar(.80-.18*portrait+focus*(.12+.18*portrait));plane.visible=true;
  trainer.position.set(.65*(1-portrait)-.29*(1-trainerArrival)+focus*2.5,.18+.30*portrait+.16*(1-trainerArrival)+focus*.52,-.47*(1-portrait)-.32*(1-trainerArrival)-focus*.7);
  trainer.rotation.set(.045+.12*(1-trainerArrival),-.21+.19*(1-trainerArrival),-.085*(1-trainerArrival));trainer.scale.setScalar(.74-.17*portrait);trainer.visible=focus<.995;
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
  const label=progress<.28?['The two airframes','Trainer and competition taildragger']:progress<.52?['Beneath the Solarfilm','The covering lifts from the wing.']:progress<.76?['Inside the fuselage','The carriage lowers before release.']:['Sensor deployment','The sensor drops. The carriage stays aboard.'];
  if(title.textContent!==label[0]){title.textContent=label[0];caption.textContent=label[1];}
  root.dataset.fleetProgress=progress.toFixed(4);
 }
 function tick(){frame=0;if(!ready||!active||document.hidden||!allowed())return;const r=track.getBoundingClientRect();draw(clamp((110-r.top)/Math.max(1,track.offsetHeight-stage.offsetHeight)));}
 function queue(){if(!frame&&ready&&active&&allowed()&&!document.hidden)frame=requestAnimationFrame(tick);}
 async function start(){if(loading||ready||failed||!allowed())return;loading=true;root.dataset.fleetState='loading';
  try{
   if(!window.DecompressionStream)throw Error('Static view');
   await script('/assets/vendor/three.min.js',()=>!!window.THREE);
   // Establish a usable graphics context before requesting several MB of CAD.
   // If unavailable the accessible still is already on screen.
   if(!allowed()){loading=false;root.dataset.fleetState='static';return;}
   renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
   await script('/assets/vendor/GLTFLoader.js',()=>!!window.THREE.GLTFLoader);
   await script('/assets/v3-aircraft-scene.js?v=trainer-20261105b',()=>!!window.V3AircraftScene);await script('/assets/v2-hero-environment.js',()=>!!window.V2ProductStudio);await script('/assets/v2-skylabs-film.js',()=>!!window.V2SkylabsFilm);await script('/assets/v2-hero-assets.js',()=>!!window.V2HeroAssets);await script('/assets/v3-aircraft-electronics.js',()=>!!window.V3AircraftElectronics);await script('/assets/v2-skylabs-systems.js',()=>!!window.V2SkylabsSystems);
   const models=await Promise.all([asset('skylabs-competition'),asset('skylabs-mechanism'),window.V3AircraftScene.load(window.THREE,{trainerLivery:true}),asset('skylabs-mechanism','sensor-body.glb.gz'),fetch('/assets/models/aircraft/skylabs-competition/solarfilm.json.gz').then(async response=>{if(!response.ok)throw Error('Film unavailable');return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();}),window.V2HeroAssets.load('telemetry'),Promise.all(['left-white','left-blue','right-white','right-blue'].map(name=>new Promise((resolve,reject)=>new THREE.TextureLoader().load('/assets/models/aircraft/skylabs-competition/livery/'+name+'.png',resolve,undefined,reject)))).catch(()=>null)]);const T=THREE;
   const livery=models[6]?Object.fromEntries(['left-white','left-blue','right-white','right-blue'].map((name,index)=>{const texture=models[6][index];texture.encoding=T.sRGBEncoding;return [name,texture];})):{};root.dataset.fleetLivery=models[6]?'ready':'unavailable';
   scene=new T.Scene();camera=new T.PerspectiveCamera(37,1,.2,20);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;
   window.V2ProductStudio.configureRenderer(renderer,T);scene.environment=await window.V2HeroEnvironment.load(T);const studio=window.V2ProductStudio.createLights(T,scene);renderer.toneMappingExposure=.72;studio.key.shadow.normalBias=.0006;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
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
