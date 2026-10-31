/* Original STEP geometry, externally mounted for illustrative storytelling.
 * See docs/skylabs-competition-integration.md for mount, cutaway and towline
 * assumptions. Housing separation is not a simulated physical mechanism. */
(()=>{'use strict';
 const root=document.querySelector('[data-skylabs-fleet]');if(!root)return;
 const stage=root.querySelector('.fleet-stage'),track=root.querySelector('.fleet-track'),canvas=root.querySelector('canvas'),status=root.querySelector('.fleet-status');
 const title=root.querySelector('[data-fleet-title]'),caption=root.querySelector('[data-fleet-caption]'),bar=root.querySelector('.fleet-progress');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer,scene,camera,plane,trainer,mechanism,sensor,line,spar,mechanismSource,housing=[],frame=0,loading=false,ready=false,active=false,failed=false,progress=0;
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
  const arrival=smooth((progress-.03)/.23),trainerArrival=smooth(progress/.23),focus=smooth((progress-.34)/.16),returnWide=smooth((progress-.62)/.16);
  const deploy=smooth((progress-.60)/.25),open=smooth((progress-.49)/.06)*(1-smooth((progress-.87)/.04));
  const planeScale=(mobile?.57:.75)+focus*(mobile?.10:.18);
  plane.position.set((mobile?0:-.65)*(1-focus)+(1-arrival)*-2.2,(mobile?-.38:-.08)*(1-focus)+focus*.1+(1-arrival)*.55,(mobile?0:.45)*(1-focus));plane.rotation.set(.07,-.18+(1-arrival)*.2,(1-arrival)*-.18);plane.scale.setScalar(planeScale);plane.visible=true;
  trainer.position.set((mobile?0:.65)+(1-trainerArrival)*-2.2+focus*3,(mobile?.48:.15)+(1-trainerArrival)*.55,mobile?0:-.5);trainer.rotation.set(.07,-.18+(1-trainerArrival)*.2,(1-trainerArrival)*-.18);trainer.scale.setScalar(mobile?.50:.68);trainer.visible=focus<.995;
  // The cradle is installed outside the belly at full source scale, as a child
  // of the airframe. Housing separation is a cutaway, not a claimed joint motion.
  const fadeOut=1-smooth((progress-.46)/.03),ghostIn=.25*smooth((progress-.55)/.03)*(1-smooth((progress-.84)/.03)),restore=smooth((progress-.91)/.03);
  const opacity=Math.min(1,fadeOut+ghostIn+restore);
  housing.forEach(part=>{part.object.position.copy(part.rest).addScaledVector(part.offset,open);part.object.visible=opacity>.005;part.materials.forEach(material=>{material.opacity=opacity;material.transparent=opacity<1;material.depthWrite=opacity>.95;});});
  sensor.position.copy(sensor.userData.rest);sensor.position.x-=deploy*1.25;sensor.position.z-=.36*smooth((progress-.60)/.18);
  plane.updateMatrixWorld(true);
  const target=new T.Vector3(-.10*returnWide,-.08*returnWide,0),nearTarget=plane.localToWorld(new T.Vector3(.32-.625*deploy,-.17-.18*smooth((progress-.60)/.18),0));
  const nearCamera=nearTarget.clone().add(new T.Vector3(mobile?-.38:-.48,-.30,mobile?.90:.72));
  const wideCamera=new T.Vector3((mobile?2.3:2.1)*(1-returnWide)+.65*returnWide,1.6-1.15*returnWide,(mobile?3.3:2.7)*(1-returnWide)+(mobile?4.0:3.1)*returnWide),zoom=focus*(1-returnWide);
  target.lerp(nearTarget,zoom);camera.position.copy(wideCamera).lerp(nearCamera,zoom);camera.aspect=w/h;camera.lookAt(target);camera.updateProjectionMatrix();
  // Loop around the illustrative cross-spar extension, outside the fuselage
  // wall. The lead runs down that side, over the aft cradle edge and to a fixed
  // point on the actual moving sensor. Same geometry is recomputed in reverse.
  const points=[],sx=.32031582,sy=.008291693,r=.0085;
  for(let i=0;i<=48;i++){const a=Math.PI+i/48*Math.PI*2;points.push(new T.Vector3(sx+Math.cos(a)*r,sy+Math.sin(a)*r,.065));}
  points.push(new T.Vector3(sx-r,-.10,.065),new T.Vector3(.11,-.11,.065));
  const attach=sensor.localToWorld(sensor.userData.tetherLocal.clone());plane.worldToLocal(attach);
  const guide=points[points.length-1],mid=guide.clone().lerp(attach,.5);mid.y-=.025*deploy;
  const lead=new T.QuadraticBezierCurve3(guide,mid,attach);points.push(...lead.getPoints(32).slice(1));
  line.geometry.dispose();line.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(points,false,'centripetal'),160,.0015,5,false);line.userData.anchor=points[0].toArray();line.userData.attachment=attach.toArray();line.visible=progress>.39;spar.visible=progress>.39;
  renderer.render(scene,camera);bar.style.transform='scaleX('+progress+')';
  title.textContent=progress<.43?'01 / Trainer + competition':progress<.60?'02 / Under-wing payload':'03 / Deploy & retrieve';
  caption.textContent=progress<.43?'Two airframes. One avionics platform.':progress<.60?'External cradle · illustrative cutaway':'Spar-loop towline · scroll back to reel in · illustrative';
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
   plane=wrap(models[0],true);mechanism=wrap(models[1],false);trainer=new T.Group();trainer.name='fleet-trainer';plane.name='fleet-competition';const sourceTrainer=models[2].group;trainer.add(sourceTrainer);sourceTrainer.traverse(node=>{if(node.userData.category==='covering')node.traverse(mesh=>{if(!mesh.isMesh)return;const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>{const copy=material.clone();copy.polygonOffset=true;copy.polygonOffsetFactor=-2;copy.polygonOffsetUnits=-2;return copy;});mesh.material=materials.length===1?materials[0]:materials;});});sourceTrainer.updateMatrixWorld(true);sourceTrainer.position.sub(new T.Box3().setFromObject(sourceTrainer).getCenter(new T.Vector3()));scene.add(plane,trainer);plane.add(mechanism);mechanism.position.set(.32,-.17,0);mechanismSource=models[1];
   models[1].traverse(n=>{const name=n.userData.sourceName;if(name==='Sensor V2, 300mm Length')sensor=n;else if(name&&name!=='V2 Assembly'){const materials=[];n.traverse(mesh=>{if(mesh.isMesh){const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];const copies=originals.map(m=>m.clone());mesh.material=copies.length===1?copies[0]:copies;materials.push(...copies);}});let offset=new T.Vector3();if(name==='Left Panel')offset.set(0,.10,-.02);else if(name==='Right Panel')offset.set(0,-.10,-.02);else if(name==='Front/Back Simple Panel')offset.set(0,n.position.x<0?.24:-.24,-.03);else offset.set(0,.16,-.10);housing.push({object:n,rest:n.position.clone(),offset,materials});}});if(!sensor)throw Error('Sensor occurrence absent');sensor.userData.rest=sensor.position.clone();sensor.traverse(mesh=>{if(mesh.isMesh)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(material=>material.color.setHex(0x4d95df));});
   plane.updateMatrixWorld(true);sensor.userData.tetherLocal=sensor.worldToLocal(mechanismSource.localToWorld(new T.Vector3(-.14,-.045,.055)));
   line=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:0x81bbff}));line.name='fleet-towline';plane.add(line);spar=new T.Mesh(new T.CylinderGeometry(.006,.006,.15,16),new T.MeshStandardMaterial({color:0x202b3e,roughness:.6}));spar.name='illustrative-cross-spar';spar.rotation.x=Math.PI/2;spar.position.set(.32031582,.008291693,0);plane.add(spar);for(const x of [.20,.44])for(const z of [-.054,.054]){const bracket=new T.Mesh(new T.BoxGeometry(.012,.036,.006),new T.MeshStandardMaterial({color:0x536982,metalness:.5,roughness:.5}));bracket.position.set(x,-.101,z);bracket.name='illustrative-cradle-bracket';plane.add(bracket);}ready=true;loading=false;
   if(allowed()){root.dataset.fleetState='ready';status.textContent='Scroll to fly in, deploy the sensor and reverse to retrieve.';draw(0);queue();}else{root.dataset.fleetState='static';}
  }catch(error){failed=true;loading=false;ready=false;renderer?.dispose();root.dataset.fleetState='failed';staticCaption();status.textContent='The 3D view is unavailable. The CAD preview and assembly notes remain below.';}
 }
 const observer=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;if(active){start();queue();}else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'400px 0px'});observer.observe(track);
 addEventListener('scroll',queue,{passive:true});addEventListener('resize',()=>{preference();queue();},{passive:true});document.addEventListener('visibilitychange',queue);
 function preference(){if(!allowed()){cancelAnimationFrame(frame);frame=0;root.dataset.fleetState='static';staticCaption();status.textContent='Static CAD preview.';}else if(ready){root.dataset.fleetState='ready';queue();}else if(active)start();}
 reduced.addEventListener('change',preference);navigator.connection?.addEventListener?.('change',preference);
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;ready=false;cancelAnimationFrame(frame);root.dataset.fleetState=allowed()?'failed':'static';staticCaption();status.textContent=allowed()?'3D rendering paused. The CAD preview remains available.':'Static CAD preview.';});
 addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
 if(new URLSearchParams(location.search).has('fleet-capture'))window.__skylabsFleet={seek:draw,get ready(){return ready;},get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},get sensor(){return sensor;},get mechanism(){return mechanism;},get housing(){return housing;},get line(){return line;},get progress(){return progress;}};
 preference();
})();
