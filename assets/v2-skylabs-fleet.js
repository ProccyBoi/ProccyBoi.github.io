/* Original STEP geometry, internally installed with source-derived Solarfilm.
 * See docs/skylabs-competition-integration.md for mount, cutaway and towline
 * assumptions. Only the isolated sensor body deploys; the carriage never leaves the fuselage. */
(()=>{'use strict';
 const root=document.querySelector('[data-skylabs-fleet]');if(!root)return;
 const stage=root.querySelector('.fleet-stage'),track=root.querySelector('.fleet-track'),canvas=root.querySelector('canvas'),status=root.querySelector('.fleet-status');
 const title=root.querySelector('[data-fleet-title]'),caption=root.querySelector('[data-fleet-caption]'),bar=root.querySelector('.fleet-progress');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer,scene,camera,plane,trainer,mechanism,sensor,line,mechanismSource,housing=[],films=[],filmGroup,airframeCutaway=[],cart,supersededSensor,wingCutaway=[],frame=0,loading=false,ready=false,active=false,failed=false,progress=0;
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 function staticCaption(){title.textContent='01 / Trainer + competition';caption.textContent='Trainer and competition taildragger · source assemblies';bar.style.transform='scaleX(0)';}
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
 function draw(value){
  if(!ready)return;progress=clamp(value);const T=THREE,w=stage.clientWidth,h=stage.clientHeight,mobile=w<680;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
  const arrival=smooth((progress-.03)/.21),trainerArrival=smooth(progress/.21),focus=smooth((progress-.28)/.18),returnWide=smooth((progress-.70)/.18);
  const deploy=smooth((progress-.66)/.24),drop=.30*smooth((progress-.66)/.12),peel=smooth((progress-.28)/.27),inspect=smooth((progress-.51)/.10);
  const planeScale=(mobile?.57:.75)+focus*(mobile?.10:.18);
  plane.position.set((mobile?0:-.65)*(1-focus)+(1-arrival)*-2.2,(mobile?-.38:-.08)*(1-focus)+focus*.1+(1-arrival)*.55,(mobile?0:.45)*(1-focus));plane.rotation.set(.07,-.18+(1-arrival)*.2,(1-arrival)*-.18);plane.scale.setScalar(planeScale);plane.visible=true;
  trainer.position.set((mobile?0:.65)+(1-trainerArrival)*-2.2+focus*3,(mobile?.48:.15)+(1-trainerArrival)*.55,mobile?0:-.5);trainer.rotation.set(.07,-.18+(1-trainerArrival)*.2,(1-trainerArrival)*-.18);trainer.scale.setScalar(mobile?.50:.68);trainer.visible=focus<.995;
  // Only authored film peels. Structural CAD and the complete internal carriage
  // remain fixed relative to the fuselage throughout every forward/reverse pose.
  films.forEach((part,index)=>{const amount=clamp(peel-(index%4)*.018*Math.sin(Math.PI*peel));part.patches.forEach(patch=>patch.deform(amount));part.group.position.copy(part.normal).multiplyScalar(.10*smooth((amount-.65)/.35));part.material.opacity=1-smooth((amount-.85)/.15);part.material.transparent=part.material.opacity<1;part.material.depthWrite=part.material.opacity>.95;part.group.visible=amount<.999;});
  housing.forEach(part=>{part.object.position.copy(part.rest);part.object.visible=true;part.materials.forEach(material=>{material.opacity=part.object===cart?1:1-.84*inspect;material.transparent=material.opacity<1;material.depthWrite=material.opacity>.95;});});
  airframeCutaway.forEach(part=>{part.object.visible=true;part.materials.forEach(material=>{material.opacity=1-inspect*(part.floor?1:.90);material.transparent=material.opacity<1;material.depthWrite=material.opacity>.95;});});
  wingCutaway.forEach(material=>{material.opacity=1-inspect*(1-returnWide);material.transparent=material.opacity<1;material.depthWrite=material.opacity>.95;});
  sensor.position.copy(sensor.userData.rest);sensor.position.x-=deploy*1.15;sensor.position.z-=drop;
  plane.updateMatrixWorld(true);
  const nearTarget=plane.localToWorld(new T.Vector3(.3638-.575*deploy,-.005-.15*smooth((progress-.66)/.12),0));
  const wideTarget=new T.Vector3(-.08*returnWide,-.07*returnWide,0),zoom=smooth((progress-.49)/.12)*(1-returnWide),target=wideTarget.lerp(nearTarget,zoom);
  const nearCamera=nearTarget.clone().add(new T.Vector3(0,-.035,mobile?1.20:.90));
  const wideCamera=new T.Vector3((mobile?2.3:2.1)*(1-returnWide)+.65*returnWide,1.6-1.10*returnWide,(mobile?3.3:2.7)*(1-returnWide)+(mobile?4.0:3.1)*returnWide);
  camera.position.copy(wideCamera).lerp(nearCamera,zoom);camera.aspect=w/h;camera.lookAt(target);camera.updateProjectionMatrix();
  // Measured named wing spar, no invented cross-member or external extension.
  // The ellipse clears its actual 3 x 22 mm section. Terminal point is the
  // measured 1.5 mm-radius FRONT notch, rigidly tracked on the isolated body.
  const points=[],sx=.32031582,sy=.008291693;
  for(let i=0;i<=48;i++){const angle=Math.PI+i/48*Math.PI*2;points.push(new T.Vector3(sx+Math.cos(angle)*.004,sy+Math.sin(angle)*.014,.0555));}
  points.push(new T.Vector3(.35,.031,.035),new T.Vector3(.37,.030,0));
  const attach=sensor.localToWorld(sensor.userData.tetherLocal.clone());plane.worldToLocal(attach);
  const guide=points[points.length-1],mid=guide.clone().lerp(attach,.5);mid.y-=.018*deploy;
  points.push(...new T.QuadraticBezierCurve3(guide,mid,attach).getPoints(32).slice(1));
  line.geometry.dispose();line.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(points,false,'centripetal'),160,.00065,6,false);line.userData.anchor=points[0].toArray();line.userData.attachment=attach.toArray();line.visible=peel>.8;
  renderer.render(scene,camera);bar.style.transform='scaleX('+progress+')';
  title.textContent=progress<.28?'01 / Trainer + competition':progress<.56?'02 / Beneath the Solarfilm':'03 / Deploy & retrieve';
  caption.textContent=progress<.28?'Solarfilm-covered airframes. One avionics platform.':progress<.56?'The covering peels back to reveal the internal system.':'Internal carriage stays aboard · sensor tethered at its front notch';
  root.dataset.fleetProgress=progress.toFixed(4);
 }
 function tick(){frame=0;if(!ready||!active||document.hidden||!allowed())return;const r=track.getBoundingClientRect();draw(clamp((110-r.top)/Math.max(1,track.offsetHeight-stage.offsetHeight)));}
 function queue(){if(!frame&&ready&&active&&allowed()&&!document.hidden)frame=requestAnimationFrame(tick);}
 async function start(){if(loading||ready||failed||!allowed())return;loading=true;root.dataset.fleetState='loading';
  try{
   if(!window.DecompressionStream)throw Error('Static view');
   await script('/assets/vendor/three.min.js',()=>!!window.THREE);await script('/assets/vendor/GLTFLoader.js',()=>!!window.THREE.GLTFLoader);
   await script('/assets/v3-aircraft-scene.js',()=>!!window.V3AircraftScene);await script('/assets/v2-hero-environment.js',()=>!!window.V2ProductStudio);await script('/assets/v2-skylabs-film.js',()=>!!window.V2SkylabsFilm);
   const models=await Promise.all([asset('skylabs-competition'),asset('skylabs-mechanism'),window.V3AircraftScene.load(window.THREE),asset('skylabs-mechanism','sensor-body.glb.gz'),fetch('/assets/models/aircraft/skylabs-competition/solarfilm.json.gz').then(async response=>{if(!response.ok)throw Error('Film unavailable');return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();})]);const T=THREE;
   scene=new T.Scene();camera=new T.PerspectiveCamera(37,1,.2,20);renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;
   window.V2ProductStudio.configureRenderer(renderer,T);scene.environment=await window.V2HeroEnvironment.load(T);const studio=window.V2ProductStudio.createLights(T,scene);renderer.toneMappingExposure=.72;studio.key.shadow.normalBias=.0006;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
   plane=wrap(models[0],true);mechanism=wrap(models[1],false);trainer=new T.Group();trainer.name='fleet-trainer';plane.name='fleet-competition';const sourceTrainer=models[2].group;trainer.add(sourceTrainer);sourceTrainer.traverse(node=>{if(node.userData.category==='covering')node.traverse(mesh=>{if(!mesh.isMesh)return;const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>{const copy=material.clone();copy.polygonOffset=true;copy.polygonOffsetFactor=-2;copy.polygonOffsetUnits=-2;return copy;});mesh.material=materials.length===1?materials[0]:materials;});});sourceTrainer.updateMatrixWorld(true);sourceTrainer.position.sub(new T.Box3().setFromObject(sourceTrainer).getCenter(new T.Vector3()));scene.add(plane,trainer);plane.add(mechanism);mechanism.position.set(.36381582,-.0246424995,0);mechanismSource=models[1];
   const materialsOf=object=>{const result=[];object.traverse(mesh=>{if(!mesh.isMesh)return;const copies=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.clone());mesh.material=copies.length===1?copies[0]:copies;result.push(...copies);});return result;};
   models[1].traverse(object=>{const name=object.userData.sourceName;if(name==='Sensor V2, 300mm Length'){supersededSensor=object;object.visible=false;}else if(name&&name!=='V2 Assembly'){if(name==='Cart V2')cart=object;housing.push({object,rest:object.position.clone(),materials:materialsOf(object)});}});
   sensor=models[3];sensor.name='isolated-sensor-body';mechanismSource.add(sensor);sensor.userData.rest=sensor.position.clone();sensor.traverse(mesh=>{if(mesh.isMesh){mesh.material=new T.MeshStandardMaterial({color:0x1257aa,roughness:.4,metalness:.08,envMapIntensity:.25});mesh.material.color.convertSRGBToLinear();}});
   // The old payload and loose duplicate rudder are superseded source references,
   // retained in the asset but not displayed as a second sensor or stray part.
   models[0].traverse(object=>{if(object.name==='cad-6-V2TP-Tainer_Full_Assembly'||object.userData.sourceName==='V2TP-Tainer Full Assembly'||object.name.startsWith('cad-72-'))object.visible=false;const name=object.userData.sourceName;if(name&&/Wing.*Assembly|Endplate/i.test(name))wingCutaway.push(...materialsOf(object));if(['Fuselage_Floor','Fuselage_Wall','Fuselage_Top_Panel'].includes(name))airframeCutaway.push({object,floor:name==='Fuselage_Floor',materials:materialsOf(object)});});
   cart.traverse(mesh=>{if(mesh.isMesh){mesh.material.color.setHex(0x29415a).convertSRGBToLinear();mesh.material.envMapIntensity=.25;}});
   plane.updateMatrixWorld(true);sensor.userData.tetherLocal=sensor.worldToLocal(mechanismSource.localToWorld(new T.Vector3(.061540941309766,-.0457201238048,.057815001)));
   sensor.userData.frontNotchSource=[.061540941309766,-.0457201238048,.057815001];
   line=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:0x8abaff}));line.name='fleet-towline';plane.add(line);
   filmGroup=new T.Group();filmGroup.name='competition-solarfilm';plane.add(filmGroup);
   for(const item of models[4].panels){
    const group=new T.Group(),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(item.positions,3));if(item.uv)geometry.setAttribute('uv',new T.Float32BufferAttribute(item.uv,2));
    const indices=item.indices.slice(),normal=new T.Vector3(...item.normal),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
    for(let i=0;i<indices.length;i+=3){a.fromArray(item.positions,indices[i]*3);b.fromArray(item.positions,indices[i+1]*3);c.fromArray(item.positions,indices[i+2]*3);if(b.sub(a).cross(c.sub(a)).dot(normal)<0)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];}
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new T.MeshPhysicalMaterial({color:item.colour==='blue'?0x1858c8:0xf3f1e9,roughness:.29,metalness:.08,clearcoat:.3,clearcoatRoughness:.22,envMapIntensity:.35,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    material.color.convertSRGBToLinear();
    const mesh=new T.Mesh(geometry,material);mesh.name=item.name;mesh.userData={filmSurface:item.kind,peelAxis:item.axis,outward:item.normal,panelNormal:item.normal,separatedFilmPanel:true,shortAxisPeel:item.shortAxisPeel,filmRegion:item.name.startsWith('fuselage')?'fuselage':'wing'};group.add(mesh);filmGroup.add(group);
    const patches=window.V2SkylabsFilm.covering(T,{object:group,filmRegion:mesh.userData.filmRegion},true);films.push({group,material,normal,patches});
   }
   plane.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});ready=true;loading=false;
   if(allowed()){root.dataset.fleetState='ready';status.textContent='Scroll to fly in, deploy the sensor and reverse to retrieve.';draw(0);queue();}else{root.dataset.fleetState='static';}
  }catch(error){failed=true;loading=false;ready=false;renderer?.dispose();root.dataset.fleetState='failed';staticCaption();status.textContent='The 3D view is unavailable. The CAD preview and assembly notes remain below.';}
 }
 const observer=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;if(active){start();queue();}else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'400px 0px'});observer.observe(track);
 addEventListener('scroll',queue,{passive:true});addEventListener('resize',()=>{preference();queue();},{passive:true});document.addEventListener('visibilitychange',queue);
 function preference(){if(!allowed()){cancelAnimationFrame(frame);frame=0;root.dataset.fleetState='static';staticCaption();status.textContent='Static CAD preview.';}else if(ready){root.dataset.fleetState='ready';queue();}else if(active)start();}
 reduced.addEventListener('change',preference);navigator.connection?.addEventListener?.('change',preference);
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;ready=false;cancelAnimationFrame(frame);root.dataset.fleetState=allowed()?'failed':'static';staticCaption();status.textContent=allowed()?'3D rendering paused. The CAD preview remains available.':'Static CAD preview.';});
 addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
 if(new URLSearchParams(location.search).has('fleet-capture'))window.__skylabsFleet={seek:draw,get ready(){return ready;},get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},get sensor(){return sensor;},get mechanism(){return mechanism;},get housing(){return housing;},get cart(){return cart;},get films(){return films;},get filmGroup(){return filmGroup;},get mechanismSource(){return mechanismSource;},get supersededSensor(){return supersededSensor;},get line(){return line;},get progress(){return progress;}};
 preference();
})();
