/* Authored inspection cameras over stationary original CAD, not animated parts. */
(async () => {
  'use strict';
  const root=document.querySelector('.cover'),stage=root.querySelector('.art'),canvas=stage.querySelector('canvas'),T=window.THREE;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const projectButtons=[...root.querySelectorAll('[data-project]')], viewButtons=[...root.querySelectorAll('[data-view]')];
  const title=root.querySelector('h1'),copy=root.querySelector('.project p:not(.eyebrow)'),eyebrow=root.querySelector('.eyebrow'),caseLink=root.querySelector('.project a');
  const layerUI=root.querySelector('.layer-control'),range=layerUI.querySelector('input'),pixels=root.querySelector('.pixel-toggle'),detailLink=root.querySelector('.detail-link'),status=root.querySelector('.scene-status');
  const probe=document.createElement('div');probe.className='component-probe';probe.hidden=true;probe.textContent='U3 · ESP32-WROOM-32E';stage.append(probe);
  const projects={
    tramtrace:{title:'TramTrace',type:'PCB + firmware',description:'I designed the PCB, display firmware and vehicle-position service behind this 116-pixel light-rail map.',url:'/prototypes/perspective-case/',location:0,detail:'The ESP32 receives vehicle positions over Wi-Fi and updates the RGB pixels. USB programming and level shifting sit alongside it.'},
    telemetry:{title:'Skylabs',type:'Avionics + payload',description:'I developed the aircraft logger, ground station and replay tools. I now lead Avionics & Payload at UNSW Skylabs.',url:'/v3/projects/skylabs/',location:18,detail:'The STM32 aircraft logger connects navigation, sensing and the live radio link. A separate binary log stays on the aircraft.'},
    pi:{title:'Raspberry Pi',type:'PCB + enclosure',description:'An RP2040 development board fitted into a Framework expansion card, with USB-C and accessible GPIO.',url:'/v3/projects/framework-raspberry-pi/',location:36,detail:'An RP2040, flash and USB interface in the space of a Framework expansion card.'}
  };
  let active='tramtrace',view='overview',renderer,scene,camera,key,frame=0,transition=null,currentPose=null,token=0,copper,pattern,lit=false,visible=true;
  const models=new Map(),pending=new Map();
  const render=()=>{
    if(!currentPose)return;
    const w=stage.clientWidth,h=stage.clientHeight;
    camera.position.copy(currentPose.position);camera.lookAt(currentPose.target);camera.setViewOffset(w,h,currentPose.offset.x*w/2,-currentPose.offset.y*h/2,w,h);camera.updateMatrixWorld();
    
    if(active==='tramtrace'&&view==='controller'){
      const p=models.get('tramtrace').group.getObjectByName('U3').getWorldPosition(new T.Vector3()).project(camera);
      probe.style.left=Math.max(12,Math.min(w-210,(p.x*.5+.5)*w+28))+'px';probe.style.top=Math.max(15,Math.min(h-35,(-p.y*.5+.5)*h-70))+'px';probe.hidden=false;
    }else probe.hidden=true;
    renderer.render(scene,camera);
  };
  function tick(now){frame=0;if(!transition||!visible)return;const p=Math.min(1,(now-transition.start)/transition.duration),e=p*p*(3-2*p);currentPose={position:transition.from.position.clone().lerp(transition.to.position,e),target:transition.from.target.clone().lerp(transition.to.target,e),offset:transition.from.offset.clone().lerp(transition.to.offset,e)};render();if(p<1)frame=requestAnimationFrame(tick);else{transition=null;models.forEach((m,name)=>m.group.visible=name===active);root.dataset.cameraState='settled';}}
  function travel(pose,immediate=false){cancelAnimationFrame(frame);if(!currentPose||immediate||reduced.matches){currentPose=pose;transition=null;models.forEach((m,name)=>m.group.visible=name===active);root.dataset.cameraState='settled';render();return;}transition={from:currentPose,to:pose,start:performance.now(),duration:1050};root.dataset.cameraState='moving';frame=requestAnimationFrame(tick);}
  function fit(model,focus=false){
    const w=stage.clientWidth,h=stage.clientHeight,mobile=w<600;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.clearViewOffset();camera.updateProjectionMatrix();
    let bounds=new T.Box3().setFromObject(model.group);
    if(focus){const ref=active==='tramtrace'?'U3':active==='telemetry'?'U14':'U5';const object=model.group.getObjectByName(ref);const c=object.getWorldPosition(new T.Vector3());bounds=new T.Box3(c.clone().add(new T.Vector3(-1.55,-.1,-1.05)),c.clone().add(new T.Vector3(1.55,.6,1.05)));}
    const aim=bounds.getCenter(new T.Vector3()),direction=new T.Vector3(...(mobile?[8,10,6]:[6,9,8])).normalize();let distance=12,projected;
    for(let i=0;i<15;i++){camera.position.copy(aim).addScaledVector(direction,distance);camera.lookAt(aim);camera.updateMatrixWorld();projected={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};for(let j=0;j<8;j++){const p=new T.Vector3(j&1?bounds.max.x:bounds.min.x,j&2?bounds.max.y:bounds.min.y,j&4?bounds.max.z:bounds.min.z).project(camera);projected.minX=Math.min(projected.minX,p.x);projected.maxX=Math.max(projected.maxX,p.x);projected.minY=Math.min(projected.minY,p.y);projected.maxY=Math.max(projected.maxY,p.y);}const ratio=Math.max((projected.maxX-projected.minX)/(mobile?1.78:1.9),(projected.maxY-projected.minY)/(mobile?1.86:1.88));if(Math.abs(ratio-1)<.002)break;distance*=ratio;}
    return {position:camera.position.clone(),target:aim,offset:new T.Vector2((projected.maxX+projected.minX)/2,(projected.maxY+projected.minY)/2)};
  }
  async function ensure(name){if(models.has(name))return models.get(name);if(!pending.has(name))pending.set(name,(async()=>{const model=await V2HeroAssets.load(name);V2ProductStudio.applyMaterials(model,name,T);model.group.scale.setScalar(8);scene.add(model.group);let b=new T.Box3().setFromObject(model.group),c=b.getCenter(new T.Vector3());model.group.position.set(projects[name].location-c.x,-b.min.y+.025,-c.z);model.group.updateMatrixWorld(true);model.group.visible=name===active;models.set(name,model);if(name==='tramtrace'){pattern=TramTracePixelPattern.create(T,model);copper=await TramTraceCopperLayer(T,model);copper.set(0);}return model;})());return pending.get(name);}
  function updateCopy(){const p=projects[active];title.textContent=p.title;eyebrow.textContent=view==='controller'?'Controller detail':view==='copper'?'Actual fabrication artwork':p.type;copy.textContent=view==='controller'?p.detail:view==='copper'?'Drag through the real front-copper artwork. The board outline, pads and components stay in register.':p.description;caseLink.href=p.url;caseLink.firstChild.textContent='Explore the project ';projectButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.project===active)));viewButtons.forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.view===view));b.hidden=b.dataset.view==='copper'&&active!=='tramtrace';});pixels.hidden=active!=='tramtrace'||view==='copper';layerUI.hidden=view!=='copper';detailLink.hidden=view==='copper';detailLink.href=active==='tramtrace'?'/v3/projects/tramtrace/#copper-data':active==='telemetry'?'#aircraft':projects.pi.url;detailLink.firstChild.textContent=active==='tramtrace'?'Copper & data ':active==='telemetry'?'Aircraft → telemetry ':'PCB & enclosure ';if(!reduced.matches){[eyebrow,title,copy].forEach((el,i)=>el.animate([{opacity:.2,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:340,delay:i*35,easing:'cubic-bezier(.2,.8,.2,1)'}));}root.dataset.project=active;root.dataset.view=view;status.textContent=`${p.title}, ${view==='overview'?'whole board':view==='controller'?'controller detail':'actual copper artwork'}`;}
  async function select(name,nextView='overview',immediate=false){const id=++token;if(!currentPose)root.dataset.model='loading';const model=await ensure(name);if(id!==token)return;active=name;view=nextView;model.group.visible=true;const lightTarget=new T.Vector3(projects[name].location,0,0);key.target.position.copy(lightTarget);key.position.copy(lightTarget).add(new T.Vector3(-4,10,7));renderer.shadowMap.needsUpdate=true;if(copper)copper.set(view==='copper'?Number(range.value)/100:0);if(pattern){if(lit&&view!=='copper')pattern.show('all');else pattern.hide();}updateCopy();travel(fit(model,view==='controller'),immediate);root.dataset.model='ready';}
  try{
    renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));V2ProductStudio.configureRenderer(renderer,T);renderer.toneMappingExposure=.98;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    scene=new T.Scene();camera=new T.PerspectiveCamera(36,1,.1,100);scene.add(new T.HemisphereLight(0xe9edf1,0x33312b,.13));key=new T.DirectionalLight(0xfff6e8,1.32);key.position.set(-4,10,7);key.castShadow=true;key.shadow.mapSize.set(4096,4096);Object.assign(key.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:35});key.shadow.bias=-.00008;key.shadow.normalBias=.007;scene.add(key,key.target);const fill=new T.DirectionalLight(0xcad6e7,.17);fill.position.set(6,3,-4);scene.add(fill);scene.environment=await V2HeroEnvironment.load(T);
    const ground=new T.Mesh(new T.PlaneGeometry(100,60),new T.ShadowMaterial({color:0x000000,opacity:.3}));ground.rotation.x=-Math.PI/2;ground.position.x=18;ground.receiveShadow=true;scene.add(ground);
    await select('tramtrace','overview',true);
    projectButtons.forEach(b=>b.addEventListener('click',()=>select(b.dataset.project).catch(fail)));viewButtons.forEach(b=>b.addEventListener('click',()=>select(active,b.dataset.view).catch(fail)));
    range.addEventListener('input',()=>{copper.set(Number(range.value)/100);render();});
    pixels.addEventListener('click',()=>{lit=!lit;pixels.setAttribute('aria-pressed',String(lit));pixels.firstChild.textContent=lit?'Turn pixels off ':'Light the pixels ';if(lit)pattern.show('all');else pattern.hide();root.dataset.pixelPattern=lit?'illustrative':'off';status.textContent=lit?'Illustrative LED test pattern. This is not live vehicle data.':'LED test pattern off';render();});
    new ResizeObserver(()=>{if(models.has(active))travel(fit(models.get(active),view==='controller'),true)}).observe(stage);
    new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible&&transition){transition.start=performance.now();frame=requestAnimationFrame(tick)}}).observe(root);
    window.__hardwareStudy={select,models,scene,camera,renderer,render,get state(){return {active,view,lit}}};
    if('requestIdleCallback' in window)requestIdleCallback(()=>{ensure('telemetry').catch(()=>{});ensure('pi').catch(()=>{});});
  }catch(error){fail(error);}
  function fail(error){root.dataset.model='fallback';status.textContent='3D inspection is unavailable; the project photographs and case pages remain available.';console.error(error);}
})();
