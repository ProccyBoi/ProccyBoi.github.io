import {loadThree,loadKikuModel,makeKikuMesh} from './v2-kiku-model.js';
/* V2-only choreography. All nine meshes retain their source CAD attributes.
 * Native page scroll is the clock; no wheel/touch scroll cancellation or loop. */
const story=document.querySelector('[data-kiku-story]');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const small=matchMedia('(max-width: 600px)');
const connection=navigator.connection;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
if(story){
  const stage=story.querySelector('.kiku-story-stage'), object=story.querySelector('.kiku-story-object');
  let canvas=story.querySelector('canvas');
  const load=story.querySelector('[data-kiku-story-load]');
  const controls=story.querySelector('[data-kiku-story-controls]'),caption=story.querySelector('[data-kiku-story-caption]');
  const cue=story.querySelector('[data-kiku-story-scroll]');
  const poses=[...story.querySelectorAll('[data-kiku-pose]')];
  let model=null,loading=false,visible=true,pinned=false,manual=null,progress=0,target=0,raf=0,last=0,frames=0;
  let layoutLock=false,lastY=scrollY,px=0,py=0,tx=0,ty=0;
  let requestVersion=0;
  const captions=['Mame P2 / populated assembly','Inside / the populated PCB','Rear shell / folded stand'];
  function semantic(){
    story.dataset.target=target.toFixed(5);
    const nearest=target<.25?0:target<.75?1:2;
    poses.forEach((button,index)=>button.setAttribute('aria-pressed',String(index===nearest)));
    caption.textContent=captions[nearest];
  }
  function nativeProgress(){
    const distance=story.offsetHeight-stage.clientHeight;
    return pinned?clamp((-story.getBoundingClientRect().top+parseFloat(getComputedStyle(stage).top))/Math.max(1,distance)):0;
  }
  function queue(){if(!raf&&visible&&!document.hidden&&model)raf=requestAnimationFrame(tick);}
  function update(){target=manual===null?nativeProgress():manual;semantic();queue();}
  function setPin(){
    const header=document.querySelector('.v2-header'),nav=document.querySelector('.v2-case-nav');
    const top=(header?.offsetHeight||0)+(nav?.offsetHeight||0);
    story.style.setProperty('--kiku-top',top+'px');
    pinned=!!model&&!reduced.matches&&!connection?.saveData&&innerHeight-top>=(small.matches?590:580);
    story.classList.toggle('is-pinned',pinned);cue.hidden=!pinned;
  }
  function layout(){
    layoutLock=true;setPin();update();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{lastY=scrollY;layoutLock=false;update();}));
  }
  function tick(now){
    raf=0;if(!model||!visible||document.hidden)return;
    const dt=last?Math.min(50,now-last):16;last=now;
    const factor=reduced.matches?1:1-Math.exp(-dt/88);
    progress+=(target-progress)*factor;px+=(tx-px)*factor;py+=(ty-py)*factor;
    if(Math.abs(progress-target)<.00005)progress=target;
    if(Math.abs(px-tx)<.00005)px=tx;if(Math.abs(py-ty)<.00005)py=ty;
    model.render(progress,px,py);story.dataset.progress=progress.toFixed(5);story.dataset.frames=String(++frames);
    if(progress!==target||px!==tx||py!==ty)queue();
  }
  function fallback(message){
    const restoreFocus=controls.contains(document.activeElement);
    requestVersion++;loading=false;model?.dispose();model=null;cancelAnimationFrame(raf);raf=0;
    story.dataset.ready='false';canvas.hidden=true;
    // A lost WebGL context cannot be recovered by reusing that same canvas.
    const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;bindContextLoss();
    controls.hidden=true;cue.hidden=true;story.classList.remove('is-pinned');pinned=false;
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
      const meshes=manifest.parts.map(part=>{const mesh=makeKikuMesh(T,part);group.add(mesh);return mesh;});
      const camera=new T.PerspectiveCamera(32,1,.5,3000),box=new T.Box3(),center=new T.Vector3();
      let width=0,height=0;
      model={render(p,x,y){
        const w=object.clientWidth,h=object.clientHeight;if(!w||!h)return;
        if(w!==width||h!==height){width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
        // Stagger only along the documented presentation offsets, never scale
        // or simplify an individual part. The final pose restores all datums.
        const opening=smooth(p/.45),closing=smooth((p-.62)/.32);
        meshes.forEach((mesh,index)=>{const lag=(index%3)*.045;const open=smooth((p-lag)/(.45-lag));const amount=open*(1-closing);mesh.position.set(...mesh.userData.part.explode.map(v=>v*amount));});
        const az=.46+smooth(p/.5)*.44+smooth((p-.6)/.4)*2.5+x;
        const el=.18+(1-closing)*opening*.14+y;
        scene.updateMatrixWorld(true);box.makeEmpty();meshes.forEach(mesh=>box.expandByObject(mesh));box.getCenter(center);
        const right=new T.Vector3(Math.cos(az),0,-Math.sin(az));
        const up=new T.Vector3(-Math.sin(az)*Math.sin(el),Math.cos(el),-Math.cos(az)*Math.sin(el));
        const outward=new T.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
        let distance=0;const tan=Math.tan(16*Math.PI/180);
        for(const a of [box.min.x,box.max.x])for(const b of [box.min.y,box.max.y])for(const c of [box.min.z,box.max.z]){const v=new T.Vector3(a,b,c).sub(center);distance=Math.max(distance,v.dot(outward)+Math.max(Math.abs(v.dot(up))/tan,Math.abs(v.dot(right))/(tan*camera.aspect)));}
        camera.position.copy(center).addScaledVector(outward,distance*1.12);camera.lookAt(center);renderer.render(scene,camera);
      },dispose(){meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});renderer.dispose();}};
      canvas.hidden=false;controls.hidden=false;load.hidden=true;loading=false;
      setPin();target=manual===null?nativeProgress():manual;progress=target;semantic();model.render(progress,0,0);
      story.dataset.ready='true';story.dataset.parts=String(manifest.enclosure.parts.length);story.dataset.pcbParts=String(manifest.pcb.parts.length);queue();
      if(restoreFocus&&(document.activeElement===load||document.activeElement===document.body))poses.find(button=>button.getAttribute('aria-pressed')==='true')?.focus({preventScroll:true});
    }catch(error){renderer?.dispose();fallback('Source CAD image shown. The interactive enclosure could not start.');}
  }
  load.addEventListener('click',()=>start(true));
  poses.forEach(button=>button.addEventListener('click',()=>{manual=Number(button.dataset.kikuPose);update();}));
  addEventListener('scroll',()=>{if(!layoutLock&&Math.abs(scrollY-lastY)>2)manual=null;lastY=scrollY;update();},{passive:true});
  addEventListener('resize',layout,{passive:true});
  addEventListener('visibilitychange',()=>{last=0;if(document.hidden){cancelAnimationFrame(raf);raf=0;}else update();});
  reduced.addEventListener('change',()=>{tx=ty=0;layout();});
  connection?.addEventListener('change',()=>{layout();if(connection.saveData&&!model){requestVersion++;loading=false;load.hidden=false;load.disabled=false;}});
  object.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse'||reduced.matches)return;const r=object.getBoundingClientRect();tx=((event.clientX-r.left)/r.width-.5)*.1;ty=((event.clientY-r.top)/r.height-.5)*.06;queue();},{passive:true});
  object.addEventListener('pointerleave',()=>{tx=ty=0;queue();},{passive:true});
  function bindContextLoss(){canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback('Graphics paused. The source CAD image is still available.');});}
  bindContextLoss();
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);if(visible){last=0;update();}else{cancelAnimationFrame(raf);raf=0;}},{rootMargin:'40px'}).observe(stage);
  layout();start();
}

// Progressive enhancement of the existing unmodified firmware adapter. Native
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
