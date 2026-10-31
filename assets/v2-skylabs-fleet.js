/* Original STEP geometry; finite, native-scroll poses. Proposed sensor travel is
   deliberately shown in a separate inspection view, not as a certified fit. */
(()=>{'use strict';
 const root=document.querySelector('[data-skylabs-fleet]');if(!root)return;
 const stage=root.querySelector('.fleet-stage'),track=root.querySelector('.fleet-track'),canvas=root.querySelector('canvas'),status=root.querySelector('.fleet-status');
 const title=root.querySelector('[data-fleet-title]'),caption=root.querySelector('[data-fleet-caption]'),bar=root.querySelector('.fleet-progress');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer,scene,camera,plane,trainer,mechanism,sensor,line,frame=0,loading=false,ready=false,active=false,failed=false,progress=0;
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 function staticCaption(){title.textContent='01 / Trainer + competition';caption.textContent='Trainer and competition taildragger · source assemblies';bar.style.transform='scaleX(0)';}
 const allowed=()=>!reduced.matches&&!navigator.connection?.saveData&&innerHeight>=560;
 const script=(url,test)=>new Promise((resolve,reject)=>{if(test())return resolve();let el=[...document.scripts].find(s=>new URL(s.src,location.href).pathname===url);if(!el){el=document.createElement('script');el.src=url;document.head.append(el);}el.addEventListener('load',resolve,{once:true});el.addEventListener('error',reject,{once:true});});
 async function asset(slug){
  const response=await fetch('/assets/models/aircraft/'+slug+'/assembly.glb.gz');if(!response.ok)throw Error('Model download failed');
  const bytes=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(bytes,'',g=>resolve(g.scene),reject));
 }
 function wrap(source,isPlane){
  const T=THREE,group=new T.Group();group.add(source);
  // Source units are metres. Only the presentation wrapper changes axes.
  source.rotation.set(-Math.PI/2,0,isPlane?Math.PI/2:0);
  source.updateMatrixWorld(true);const box=new T.Box3().setFromObject(source);source.position.sub(box.getCenter(new T.Vector3()));
  source.traverse(node=>{if(!node.isMesh)return;const name=node.userData.sourceName||node.parent?.userData.sourceName||node.name;
   node.material=new T.MeshStandardMaterial({color:/CF_|spar|Wheel|Prop|motor/i.test(name)?0x293449:/Sensor|Cart/i.test(name)?0x83aade:0xc7b9a1,roughness:.65,metalness:.08,side:T.DoubleSide});
  });return group;
 }
 function draw(value){
  if(!ready)return;progress=clamp(value);const T=THREE,w=stage.clientWidth,h=stage.clientHeight,mobile=w<680;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.position.set(mobile?2.3:2.1,1.6,mobile?3.3:2.7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  const arrival=smooth((progress-.03)/.23),trainerArrival=smooth(progress/.23),inspect=smooth((progress-.38)/.23),deploy=smooth((progress-.65)/.35);
  plane.position.set((mobile?0:-.65)+(1-arrival)*-2.2-inspect*2.8,(mobile?-.38:-.08)+(1-arrival)*.55,mobile?0:.45);plane.rotation.set(.07,-.18+(1-arrival)*.2,(1-arrival)*-.18);plane.scale.setScalar(mobile?.57:.75);plane.visible=inspect<.995;
  trainer.position.set((mobile?0:.65)+(1-trainerArrival)*-2.2+inspect*3,(mobile?.48:.15)+(1-trainerArrival)*.55,mobile?0:-.5);trainer.rotation.set(.07,-.18+(1-trainerArrival)*.2,(1-trainerArrival)*-.18);trainer.scale.setScalar(mobile?.50:.68);trainer.visible=inspect<.995;
  mechanism.position.set(0,-(1-inspect)*1.0,0);mechanism.rotation.set(.02,-.25,.12);mechanism.scale.setScalar((mobile?3.1:4.3)*(.5+inspect*.5));mechanism.visible=inspect>.02;
  // Sensor-only separation illustrates the requested deployment direction. No
  // joints, actuator stroke or installation transform were supplied in STEP.
  sensor.position.copy(sensor.userData.rest);sensor.position.z-=deploy*.16;
  // Schematic towline: a fixed loop at the proposed spar station, followed by a
  // continuous lead to the moving sensor. This line is not source CAD hardware.
  const points=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;points.push(new T.Vector3(-.05+Math.cos(a)*.012,-.045,.09+Math.sin(a)*.012));}
  points.push(new T.Vector3(-.05,-.045,.07),new T.Vector3(0,-.045,.05-deploy*.16));
  line.geometry.dispose();line.geometry=new T.BufferGeometry().setFromPoints(points);line.visible=deploy>0;
  renderer.render(scene,camera);bar.style.transform='scaleX('+progress+')';
  title.textContent=progress<.45?'01 / Trainer + competition':progress<.65?'02 / Sensor carriage':'03 / Routing study';
  caption.textContent=progress<.45?'Trainer and competition taildragger · source assemblies':progress<.65?'Separate assembly · installation fit remains unresolved':'Illustrative separation · actual release motion unconfirmed';
  root.dataset.fleetProgress=progress.toFixed(4);
 }
 function tick(){frame=0;if(!ready||!active||document.hidden||!allowed())return;const r=track.getBoundingClientRect();draw(clamp((110-r.top)/Math.max(1,track.offsetHeight-stage.offsetHeight)));}
 function queue(){if(!frame&&ready&&active&&allowed()&&!document.hidden)frame=requestAnimationFrame(tick);}
 async function start(){if(loading||ready||failed||!allowed())return;loading=true;root.dataset.fleetState='loading';
  try{
   if(!window.DecompressionStream)throw Error('Static view');
   await script('/assets/vendor/three.min.js',()=>!!window.THREE);await script('/assets/vendor/GLTFLoader.js',()=>!!window.THREE.GLTFLoader);
   await script('/assets/v3-aircraft-scene.js',()=>!!window.V3AircraftScene);
   const models=await Promise.all([asset('skylabs-competition'),asset('skylabs-mechanism'),window.V3AircraftScene.load(window.THREE)]);const T=THREE;
   scene=new T.Scene();camera=new T.PerspectiveCamera(37,1,.2,20);renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;
   scene.add(new T.HemisphereLight(0xd9eaff,0x566173,.85));const key=new T.DirectionalLight(0xffffff,1.4);key.position.set(2,4,3);scene.add(key);const rim=new T.DirectionalLight(0x72a9ff,.8);rim.position.set(-3,1,-2);scene.add(rim);
   plane=wrap(models[0],true);mechanism=wrap(models[1],false);trainer=new T.Group();trainer.name='fleet-trainer';plane.name='fleet-competition';const sourceTrainer=models[2].group;trainer.add(sourceTrainer);sourceTrainer.traverse(node=>{if(node.userData.category==='covering')node.traverse(mesh=>{if(!mesh.isMesh)return;const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>{const copy=material.clone();copy.polygonOffset=true;copy.polygonOffsetFactor=-2;copy.polygonOffsetUnits=-2;return copy;});mesh.material=materials.length===1?materials[0]:materials;});});sourceTrainer.updateMatrixWorld(true);sourceTrainer.position.sub(new T.Box3().setFromObject(sourceTrainer).getCenter(new T.Vector3()));scene.add(plane,trainer,mechanism);
   models[1].traverse(n=>{if(n.userData.sourceName==='Sensor V2, 300mm Length')sensor=n;});if(!sensor)throw Error('Sensor occurrence absent');sensor.userData.rest=sensor.position.clone();
   line=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x8bbaff}));models[1].add(line);ready=true;loading=false;
   if(allowed()){root.dataset.fleetState='ready';status.textContent='Scroll to fly in both aircraft and inspect the sensor concept.';draw(0);queue();}else{root.dataset.fleetState='static';}
  }catch(error){failed=true;loading=false;ready=false;renderer?.dispose();root.dataset.fleetState='failed';staticCaption();status.textContent='The 3D view is unavailable. The CAD preview and assembly notes remain below.';}
 }
 const observer=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;if(active){start();queue();}else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'400px 0px'});observer.observe(track);
 addEventListener('scroll',queue,{passive:true});addEventListener('resize',()=>{preference();queue();},{passive:true});document.addEventListener('visibilitychange',queue);
 function preference(){if(!allowed()){cancelAnimationFrame(frame);frame=0;root.dataset.fleetState='static';staticCaption();status.textContent='Static CAD preview.';}else if(ready){root.dataset.fleetState='ready';queue();}else if(active)start();}
 reduced.addEventListener('change',preference);navigator.connection?.addEventListener?.('change',preference);
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;ready=false;cancelAnimationFrame(frame);root.dataset.fleetState='failed';staticCaption();status.textContent='3D rendering paused. The CAD preview remains available.';});
 addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
 if(new URLSearchParams(location.search).has('fleet-capture'))window.__skylabsFleet={seek:draw,get ready(){return ready;},get renderer(){return renderer;},get scene(){return scene;},get sensor(){return sensor;},get progress(){return progress;}};
 preference();
})();
