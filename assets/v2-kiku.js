import {loadThree,loadKikuModel,makeKikuMesh} from './v2-kiku-model.js?v=finish-20261018';
/* V2-only choreography. All nine meshes retain their source CAD attributes.
 * Native page scroll is the clock; no wheel/touch scroll cancellation or loop. */
const story=document.querySelector('[data-kiku-story]');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const small=matchMedia('(max-width: 600px)');
const connection=navigator.connection;
let motionReduced=reduced.matches;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
if(story){
  const stage=story.querySelector('.kiku-story-stage'), object=story.querySelector('.kiku-story-object');
  let canvas=story.querySelector('canvas');
  const load=story.querySelector('[data-kiku-story-load]');
  const controls=story.querySelector('[data-kiku-story-controls]'),caption=story.querySelector('[data-kiku-story-caption]');
  const cue=story.querySelector('[data-kiku-story-scroll]');
  const poses=[...story.querySelectorAll('[data-kiku-pose]')];
  const inspector=story.querySelector('[data-inspector-details]'),partSelect=story.querySelector('[data-part-select]');
  const explodeControl=story.querySelector('[data-explode]'),allControl=story.querySelector('[data-model-all]');
  const pcbControl=story.querySelector('[data-model-mode="pcb"]'),partDescription=story.querySelector('[data-part-description]');
  const viewControls=[...story.querySelectorAll('[data-view]')],status=story.querySelector('[data-model-status]');
  let inspected=false,selected=null,inspectionExplode=0,items=[],view='iso';
  const orbit={az:.9,el:.28,zoom:1};
  function inspection(id=null){
    inspected=true;selected=id||null;manual=progress;orbit.zoom=1;
    if(selected)inspectionExplode=0;
    partSelect.value=selected||'';explodeControl.value=String(Math.round(inspectionExplode*100));
    semantic();queue();
  }
  function setView(value){view=value;orbit.az=value==='front'?0:value==='rear'?Math.PI:.9;orbit.el=value==='iso'?.28:0;orbit.zoom=1;inspected=true;manual=progress;semantic();queue();}
  function resetInspection(){inspected=false;selected=null;view='iso';orbit.zoom=1;inspectionExplode=0;partSelect.value='';explodeControl.value='0';}

  let model=null,loading=false,visible=true,pinned=false,manual=null,progress=0,target=0,raf=0,last=0,frames=0;
  let layoutLock=false,lastY=scrollY,px=0,py=0,tx=0,ty=0;
  let requestVersion=0,recoveryFocus=null;
  // Pinning adds scroll height after CAD loads. Preserve an initial deep link
  // once, without stealing the scroll back after any real user interaction.
  const initialHash=location.hash,anchorEvents=new AbortController();
  let initialAnchor=null,anchorPending=false;
  try{initialAnchor=initialHash?document.getElementById(decodeURIComponent(initialHash.slice(1))):null;}catch(error){}
  anchorPending=!!initialAnchor&&!story.contains(initialAnchor);
  if(anchorPending)for(const type of ['wheel','touchstart','pointerdown','keydown'])addEventListener(type,()=>{anchorPending=false;anchorEvents.abort();},{passive:true,once:true,signal:anchorEvents.signal});
  function restoreInitialAnchor(){requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(anchorPending&&location.hash===initialHash&&initialAnchor.isConnected)initialAnchor.scrollIntoView({block:'start',behavior:'instant'});
    anchorPending=false;anchorEvents.abort();
  }));}
  const captions=['Mame P2 · assembled player','Inside · electronics, power and sound','Rear shell · folding stand'];
  function semantic(){
    story.dataset.target=target.toFixed(5);
    const nearest=target<.25?0:target<.75?1:2;
    poses.forEach((button,index)=>button.setAttribute('aria-pressed',String(!inspected&&index===nearest)));
    pcbControl.setAttribute('aria-pressed',String(inspected&&selected==='pcb'));
    viewControls.forEach(button=>button.setAttribute('aria-pressed',String(inspected&&button.dataset.view===view)));
    const part=items.find(item=>item.id===selected);
    caption.textContent=part?.name||(inspected?'Mame P2 · inspect the assembly':captions[nearest]);
    partDescription.textContent=part?part.description:'Drag to rotate. Focus the model for arrow keys and + / − zoom.';
    status.textContent=part?part.name+' · source-grounded geometry':'Enclosure CAD + populated electronics';
    allControl.hidden=!selected;
    story.querySelector('[data-explode-value]').textContent=Math.round(inspectionExplode*100)+'%';
    object.dataset.mode=inspected?'inspect':'story';object.dataset.selected=selected||'';
    object.dataset.explode=String(inspectionExplode);object.dataset.view=inspected?view:'choreography';
    object.dataset.zoom=String(orbit.zoom);object.dataset.azimuth=String(orbit.az);object.dataset.elevation=String(orbit.el);
  }
  function frameInspection(){
    // A deliberate inspection action should show the full pinned stage below
    // the site navigation, including near the story's lower sticky boundary.
    // Never run this during loading, native page scroll, or a deep-link visit.
    if(!pinned)return;
    const top=parseFloat(getComputedStyle(stage).top),start=scrollY+story.getBoundingClientRect().top-top;
    const end=start+story.clientHeight-stage.clientHeight-1;
    const next=clamp(scrollY,Math.max(0,start),Math.max(0,end));
    if(Math.abs(next-scrollY)<1)return;
    layoutLock=true;scrollTo({top:next,behavior:'instant'});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{lastY=scrollY;layoutLock=false;update();}));
  }
  function nativeProgress(){
    const distance=story.offsetHeight-stage.clientHeight;
    return pinned?clamp((-story.getBoundingClientRect().top+parseFloat(getComputedStyle(stage).top))/Math.max(1,distance)):0;
  }
  function queue(){if(!raf&&visible&&!document.hidden&&model)raf=requestAnimationFrame(tick);}
  // Reconcile only during existing input/render work, never a polling loop.
  // Refresh browser preference after graphics and visibility transitions.
  function syncMotion(){
    const next=matchMedia(reduced.media).matches;
    if(next===motionReduced)return false;
    motionReduced=next;tx=ty=0;setPin();return true;
  }
  function update(){syncMotion();target=manual===null?nativeProgress():manual;semantic();queue();}
  function setPin(){
    const header=document.querySelector('.v2-header'),nav=document.querySelector('.v2-case-nav');
    const top=(header?.offsetHeight||0)+(nav?.offsetHeight||0);
    story.style.setProperty('--kiku-top',top+'px');
    pinned=!!model&&!motionReduced&&!connection?.saveData&&innerHeight-top>=(small.matches?590:580);
    story.classList.toggle('is-pinned',pinned);cue.hidden=!pinned;story.dataset.motionReduced=String(motionReduced);
  }
  function layout(){
    layoutLock=true;setPin();update();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{lastY=scrollY;layoutLock=false;update();}));
  }
  function tick(now){
    raf=0;if(!model||!visible||document.hidden)return;
    if(syncMotion()){target=manual===null?nativeProgress():manual;semantic();}
    const dt=last?Math.min(50,now-last):16;last=now;
    const factor=motionReduced?1:1-Math.exp(-dt/88);
    progress+=(target-progress)*factor;px+=(tx-px)*factor;py+=(ty-py)*factor;
    if(Math.abs(progress-target)<.00005)progress=target;
    if(Math.abs(px-tx)<.00005)px=tx;if(Math.abs(py-ty)<.00005)py=ty;
    model.render(progress,px,py);story.dataset.progress=progress.toFixed(5);story.dataset.frames=String(++frames);
    if(progress!==target||px!==tx||py!==ty)queue();
  }
  function fallback(message){
    const restoreFocus=controls.contains(document.activeElement)||inspector.contains(document.activeElement)||document.activeElement===object;
    if(restoreFocus)recoveryFocus=document.activeElement===object?'stage':inspector.contains(document.activeElement)?'inspector':'preset';
    requestVersion++;loading=false;model?.dispose();model=null;cancelAnimationFrame(raf);raf=0;
    story.dataset.ready='false';object.dataset.ready='false';canvas.hidden=true;
    // A lost WebGL context cannot be recovered by reusing that same canvas.
    const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;bindContextLoss();
    controls.hidden=true;inspector.hidden=true;inspector.open=false;cue.hidden=true;story.classList.remove('is-pinned');pinned=false;
    load.hidden=false;load.disabled=false;load.textContent='Retry interactive enclosure';caption.textContent=message;
    if(restoreFocus)load.focus({preventScroll:true});
  }
  async function start(explicit=false){
    if(loading||model)return;
    if(!explicit&&(reduced.matches||connection?.saveData)){load.hidden=false;return;}
    const restoreFocus=explicit&&document.activeElement===load;
    loading=true;load.disabled=true;load.textContent='Loading enclosure…';const version=++requestVersion;
    let renderer;
    try{
      const [T,manifest]=await Promise.all([loadThree(),loadKikuModel()]);
      if(version!==requestVersion)return;
      if(!explicit&&(reduced.matches||connection?.saveData)){loading=false;load.hidden=false;load.disabled=false;load.textContent='Load interactive enclosure';return;}
      renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.setClearColor(0x141412,1);
      renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
      const scene=new T.Scene();scene.add(new T.HemisphereLight(0xeef4ff,0x444c42,.55));
      for(const [color,intensity,position] of [[0xfff3df,.85,[-140,220,250]],[0xa9cfff,.5,[180,120,-180]],[0xffffff,.15,[100,-100,180]]]){const light=new T.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);}
      const group=new T.Group();group.position.set(...manifest.center.map(v=>-v));scene.add(group);
      items=[...manifest.enclosure.parts,{id:'pcb',name:'Populated PCB',description:'Source KiCad copper, pads and silkscreen, with official models and dimensioned component reconstructions.'},...manifest.hardware.items];
      partSelect.replaceChildren(new Option('Complete player',''),...items.map(part=>new Option(part.name,part.id)));
      const meshes=manifest.parts.map(part=>{const mesh=makeKikuMesh(T,part,()=>queue());group.add(mesh);return mesh;});
      const camera=new T.PerspectiveCamera(32,1,.5,3000),box=new T.Box3(),center=new T.Vector3();
      let width=0,height=0;
      model={render(p,x,y){
        const w=object.clientWidth,h=object.clientHeight;if(!w||!h)return;
        if(w!==width||h!==height){width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
        // Stagger only along the documented presentation offsets, never scale
        // or simplify an individual part. The final pose restores all datums.
        const opening=smooth(p/.45),closing=smooth((p-.62)/.32);
        meshes.forEach((mesh,index)=>{const lag=(index%3)*.045;const open=smooth((p-lag)/(.45-lag));const amount=inspected?inspectionExplode:open*(1-closing);mesh.position.set(...mesh.userData.part.explode.map(v=>v*amount));mesh.visible=!inspected||!selected||(mesh.userData.part.group||mesh.userData.part.id)===selected;});
        const visibleMeshes=meshes.filter(mesh=>mesh.visible);
        object.dataset.visibleMeshes=String(visibleMeshes.length);
        object.dataset.visibleGroups=JSON.stringify([...new Set(visibleMeshes.map(mesh=>mesh.userData.part.group||mesh.userData.part.id))]);
        const az=inspected?orbit.az:.46+smooth(p/.5)*.44+smooth((p-.6)/.4)*2.5+x;
        const el=inspected?orbit.el:.18+(1-closing)*opening*.14+y;
        scene.updateMatrixWorld(true);box.makeEmpty();visibleMeshes.forEach(mesh=>box.expandByObject(mesh));box.getCenter(center);
        const right=new T.Vector3(Math.cos(az),0,-Math.sin(az));
        const up=new T.Vector3(-Math.sin(az)*Math.sin(el),Math.cos(el),-Math.cos(az)*Math.sin(el));
        const outward=new T.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
        let distance=0,minDepth=Infinity,maxDepth=-Infinity;const tan=Math.tan(16*Math.PI/180);
        for(const a of [box.min.x,box.max.x])for(const b of [box.min.y,box.max.y])for(const c of [box.min.z,box.max.z]){const v=new T.Vector3(a,b,c).sub(center),depth=v.dot(outward);minDepth=Math.min(minDepth,depth);maxDepth=Math.max(maxDepth,depth);distance=Math.max(distance,depth+Math.max(Math.abs(v.dot(up))/tan,Math.abs(v.dot(right))/(tan*camera.aspect)));}
        // Keep depth precision appropriate to this millimetre-scale object. The
        // display pixels sit 0.01 mm above their backing; a fixed 0.5–3000
        // frustum caused z-fighting without any source geometry being wrong.
        const fittedDistance=distance*1.10*(inspected?orbit.zoom:1);
        camera.near=Math.max(.01,(fittedDistance-maxDepth)*.9);camera.far=Math.max(camera.near+1,(fittedDistance-minDepth)*1.1);
        camera.updateProjectionMatrix();camera.position.copy(center).addScaledVector(outward,fittedDistance);camera.lookAt(center);renderer.render(scene,camera);object.dataset.frames=String(frames+1);
      },dispose(){meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();});renderer.dispose();}};
      canvas.hidden=false;controls.hidden=false;inspector.hidden=false;load.hidden=true;loading=false;
      layout();progress=target;semantic();model.render(progress,0,0);
      story.dataset.ready='true';object.dataset.ready='true';object.dataset.pcbParts=String(manifest.pcb.parts.length);object.dataset.hardwareItems=String(manifest.hardware.items.length);story.dataset.parts=String(manifest.enclosure.parts.length);story.dataset.pcbParts=String(manifest.pcb.parts.length);story.dataset.hardwareItems=String(manifest.hardware.items.length);queue();
      if(!explicit)restoreInitialAnchor();
      if(restoreFocus&&(document.activeElement===load||document.activeElement===document.body)){if(recoveryFocus==='stage'||inspected)object.focus({preventScroll:true});else (poses.find(button=>button.getAttribute('aria-pressed')==='true')||poses[0]).focus({preventScroll:true});}recoveryFocus=null;
    }catch(error){renderer?.dispose();fallback('Source CAD image shown. The interactive enclosure could not start.');if(restoreFocus&&(document.activeElement===load||document.activeElement===document.body))load.focus({preventScroll:true});}
  }
  load.addEventListener('click',()=>start(true));
  poses.forEach(button=>button.addEventListener('click',()=>{resetInspection();manual=Number(button.dataset.kikuPose);update();frameInspection();}));
  pcbControl.addEventListener('click',()=>{setView('iso');inspection('pcb');frameInspection();});
  partSelect.addEventListener('change',()=>{setView('iso');inspection(partSelect.value);frameInspection();});
  explodeControl.addEventListener('input',()=>{inspectionExplode=Number(explodeControl.value)/100;inspected=true;manual=progress;semantic();queue();});
  viewControls.forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  allControl.addEventListener('click',()=>{inspection(null);frameInspection();});
  story.querySelector('[data-model-reset]').addEventListener('click',()=>{resetInspection();manual=0;update();frameInspection();});
  inspector.addEventListener('toggle',()=>{if(inspector.open&&model){inspection(selected);frameInspection();}});
  const pointers=new Map();let pinch=0;
  function startOrbit(){
    if(!inspected){inspectionExplode=smooth(progress/.45)*(1-smooth((progress-.62)/.32));orbit.az=.46+smooth(progress/.5)*.44+smooth((progress-.6)/.4)*2.5;orbit.el=.18+(1-smooth((progress-.62)/.32))*smooth(progress/.45)*.14;inspection(null);}
    view='custom';
  }
  object.addEventListener('pointerdown',event=>{
    if(!model||event.target!==canvas||event.button!==0)return;
    startOrbit();object.focus({preventScroll:true});object.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}
  });
  object.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);if(!previous)return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){const [a,b]=[...pointers.values()],next=Math.hypot(a.x-b.x,a.y-b.y);if(next>0&&pinch>0)orbit.zoom=clamp(orbit.zoom*pinch/next,.4,2.5);pinch=next;}
    else{orbit.az-=(event.clientX-previous.x)*.009;orbit.el=clamp(orbit.el+(event.clientY-previous.y)*.009,-1.25,1.25);}
    semantic();queue();
  });
  const endPointer=event=>{pointers.delete(event.pointerId);};
  object.addEventListener('pointerup',endPointer);object.addEventListener('pointercancel',endPointer);object.addEventListener('lostpointercapture',endPointer);
  object.addEventListener('wheel',event=>{if(!model||document.activeElement!==object)return;event.preventDefault();startOrbit();orbit.zoom=clamp(orbit.zoom*Math.exp(event.deltaY*.001),.4,2.5);semantic();queue();},{passive:false});
  object.addEventListener('keydown',event=>{
    if(!model||event.target!==object)return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Escape'].includes(event.key))return;
    event.preventDefault();if(event.key==='Escape'){resetInspection();manual=0;update();return;}
    startOrbit();
    if(event.key==='ArrowLeft')orbit.az-=.12;else if(event.key==='ArrowRight')orbit.az+=.12;
    else if(event.key==='ArrowUp')orbit.el=clamp(orbit.el+.12,-1.25,1.25);else if(event.key==='ArrowDown')orbit.el=clamp(orbit.el-.12,-1.25,1.25);
    else orbit.zoom=clamp(orbit.zoom*(event.key==='-'?1.1:.9),.4,2.5);
    semantic();queue();
  });
  addEventListener('scroll',()=>{if(!layoutLock&&Math.abs(scrollY-lastY)>2&&!inspector.open){manual=null;resetInspection();}lastY=scrollY;update();},{passive:true});
  addEventListener('resize',layout,{passive:true});
  addEventListener('visibilitychange',()=>{last=0;if(document.hidden){cancelAnimationFrame(raf);raf=0;}else update();});
  reduced.addEventListener('change',event=>{motionReduced=event.matches;story.dataset.motionEvents=String(Number(story.dataset.motionEvents||0)+1);story.dataset.motionEventValue=String(event.matches);story.dataset.motionHeldValue=String(reduced.matches);tx=ty=0;layout();});
  connection?.addEventListener('change',()=>{layout();if(connection.saveData&&!model){requestVersion++;loading=false;load.hidden=false;load.disabled=false;}});
  object.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse'||motionReduced||inspected||pointers.size)return;const r=object.getBoundingClientRect();tx=((event.clientX-r.left)/r.width-.5)*.1;ty=((event.clientY-r.top)/r.height-.5)*.06;queue();},{passive:true});
  object.addEventListener('pointerleave',()=>{tx=ty=0;queue();},{passive:true});
  function bindContextLoss(){canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback('Graphics paused. The source CAD image is still available.');});}
  bindContextLoss();
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);if(visible){last=0;update();}else{cancelAnimationFrame(raf);raf=0;}},{rootMargin:'40px'}).observe(stage);
  layout();start();
}

// Progressive enhancement of the v2 firmware adapter. Native
// buttons remain every action's accessible alternative; no hardware is invoked.
const host=document.querySelector('[data-kiku-simulator]');
function enhanceSimulator(){
  const root=host?.querySelector('.kiku-sim');if(!root||root.dataset.enhanced)return false;root.dataset.enhanced='true';
  const select=root.querySelector('.kiku-sim-look'),dial=root.querySelector('.kiku-sim-press');
  const minus=root.querySelector('[aria-label="Rotate encoder anticlockwise"]'),plus=root.querySelector('[aria-label="Rotate encoder clockwise"]');
  const strip=document.createElement('div');strip.className='kiku-look-strip';strip.setAttribute('role','group');strip.setAttribute('aria-label','Interface looks');
  const colors=['#c3d5a0','#e7dcd0','#e3c35f','#b9d4cd','#b2c9c1','#78c891','#75cde0','#e2dcc9','#97a3bf','#efa966'];
  [...select.options].forEach((option,index)=>{const b=document.createElement('button');b.type='button';b.className='kiku-look-choice';b.textContent=option.textContent;b.dataset.lookValue=option.value;b.style.setProperty('--look-color',colors[index]);b.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));});strip.append(b);});
  root.querySelector('.kiku-sim-toolbar').after(strip);
  const sync=()=>{strip.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lookValue===select.value)));};
  new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-look']});sync();
  const guide=root.querySelector('.kiku-sim-keyboard'),note=root.querySelector('.kiku-sim-note');
  if(guide){const help=document.createElement('details');help.className='kiku-sim-help';const summary=document.createElement('summary');summary.textContent='Keyboard controls';help.append(summary,guide);root.querySelector('.kiku-sim-guidance').append(help);}
  if(note&&!note.classList.contains('kiku-sim-audio-status'))note.hidden=true;
  const hint=document.createElement('p');hint.className='kiku-dial-hint';hint.textContent='Drag the dial sideways to turn. Tap to press.';root.querySelector('.kiku-sim-device').append(hint);
  let dragging=null,turned=false,rotation=0;
  function rotate(delta){rotation+=delta*24;dial.style.setProperty('--dial-turn',rotation+'deg');}
  minus.addEventListener('click',()=>rotate(-1));plus.addEventListener('click',()=>rotate(1));
  dial.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging={id:e.pointerId,x:e.clientX,y:e.clientY,steps:0};turned=false;dial.setPointerCapture(e.pointerId);});
  dial.addEventListener('pointermove',e=>{if(!dragging||dragging.id!==e.pointerId)return;const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;if(!turned&&Math.abs(dy)>Math.abs(dx)+8){dragging=null;return;}const steps=Math.trunc(dx/14);if(steps===dragging.steps)return;turned=true;dial.classList.add('is-turning');const delta=steps-dragging.steps;dragging.steps=steps;for(let n=0;n<Math.min(20,Math.abs(delta));n++)(delta>0?plus:minus).click();});
  const end=()=>{dragging=null;dial.classList.remove('is-turning');};
  dial.addEventListener('pointerup',end);dial.addEventListener('pointercancel',()=>{end();turned=false;});dial.addEventListener('lostpointercapture',end);
  dial.addEventListener('click',e=>{if(turned){e.preventDefault();e.stopImmediatePropagation();turned=false;}},true);
  return true;
}
if(host&&!enhanceSimulator()){const watch=new MutationObserver(()=>{if(enhanceSimulator())watch.disconnect();});watch.observe(host,{childList:true,subtree:true});}
const signal=document.querySelector('.kiku-signal-path');
document.querySelectorAll('[data-source]').forEach(button=>button.addEventListener('click',()=>{if(!signal||reduced.matches)return;signal.classList.remove('is-tracing');requestAnimationFrame(()=>signal.classList.add('is-tracing'));}));
