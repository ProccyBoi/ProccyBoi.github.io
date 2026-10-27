/* Isolated manufacturing study. One scalar reconstructs every pose, including
 * reverse/replay. Source geometry, rotations and X/Z placements are untouched. */
(() => {
  'use strict';
  const root = document.querySelector('[data-reflow]');
  if (!root) return;
  const $ = selector => root.querySelector(selector), T = window.THREE;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stops = [0, .18, .43, .59, .77, 1];
  const stages = [
    ['Bare board.', 'The fabricated PCB: blue solder mask, exposed lands and the original silkscreen. Every component has a place to land.'],
    ['Print the paste.', 'A thin deposit meets each surface-mount land. These illustrative deposits follow exposed CAD surfaces; drilled annuli stay clear.'],
    ['Place the parts.', 'Passives, sensors, processor and radio settle onto the paste. Each retains its original position and orientation on the real board.'],
    ['Bring up the heat.', 'The assembly warms together. Flux becomes active before the solder melts. Components stay seated as the board moves toward reflow.'],
    ['Make the connection.', 'Solder coalesces and wets the metal surfaces. The matte deposits become bright, continuous joints around the component terminations.'],
    ['Ready for flight.', 'The solder cools and solidifies. Back-side parts and through-hole connectors complete the view as separate assembly operations. Next comes inspection and testing.']
  ];
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => { x = clamp(x); return x*x*(3-2*x); };
  const ramp = (x,a,b) => ease((x-a)/(b-a));
  let model, renderer, scene, camera, deposits, depositMaterial, heatLight;
  let progress=0, target=0, playing=false, frame=0, last=0, visible=true, ready=false, failed=false;
  let view='angle', zoom=false, activeStage=-1, frames=0;
  const uniform={print:{value:0},wet:{value:0}};
  const canvas=$('canvas'), range=$('input'), play=$('[data-play]');
  function pause() { playing=false; play.textContent=progress>=.999?'Replay assembly ↺':'Play assembly ▶'; }
  function announce(index) { $('[data-announcement]').textContent=stages[index][0]; }
  function request() { if(ready && !failed && visible && !document.hidden && !frame) frame=requestAnimationFrame(tick); }
  function setTarget(value, instant=false) {
    pause();target=clamp(value);
    if(reduced.matches || instant)progress=target;
    request();
  }
  function tick(now) {
    frame=0;
    // Use elapsed time for settling even on a slow software renderer. Visibility
    // pauses reset the clock, so returning to the tab never accumulates a jump.
    const elapsed=Math.max(0,(now-(last||now))/1000),dt=Math.min(elapsed,.25);last=now;
    if(playing){target=Math.min(1,target+dt/24);progress=target;if(target===1)pause();}
    else if(Math.abs(target-progress)>.00005)progress+= (target-progress)*(1-Math.exp(-elapsed*9));
    else progress=target;
    pose();renderer.render(scene,camera);frames++;
    root.dataset.frames=String(frames);
    if(playing || progress!==target)request();else last=0;
  }
  function pose() {
    const p=progress, wet=ramp(p,.62,.77), heat=ramp(p,.44,.67)*(1-ramp(p,.79,.97));
    uniform.print.value=ramp(p,.035,.18);uniform.wet.value=wet;
    deposits.visible=p>.035;
    depositMaterial.color.setRGB(.48+wet*.25,.51+wet*.27,.53+wet*.29);
    depositMaterial.roughness=.9-wet*.65;
    depositMaterial.metalness=.12+wet*.75;
    for(const part of model.parts){
      const start=part.reflowLate?.88:.205+part.reflowOrder*.15;
      const landing=ramp(p,start,start+(part.reflowLate?.1:.07));
      part.object.visible=p>=start;
      part.object.position.copy(part.base);
      part.object.position.y+=(part.reflowBack?-1:1)*.13*(1-landing);
      // No lateral drift, rotating chips, or cumulative transforms.
    }
    heatLight.intensity=heat*.6;
    root.style.setProperty('--heat',heat.toFixed(3));
    $('.rf-heat-track i').style.width=`${heat*100}%`;
    $('[data-heat-label]').textContent=p<.44?'AMBIENT':p<.62?'WARMING':p<.79?'REFLOW':p<.97?'COOLING':'SOLIDIFIED';
    $('[data-joint-paste]').style.opacity=String(ramp(p,.03,.18)*(1-wet));
    $('[data-joint-wet]').style.opacity=String(wet);
    $('[data-joint-part]').style.opacity=String(ramp(p,.21,.3));
    $('[data-joint-part]').setAttribute('transform',`translate(0 ${-16*(1-ramp(p,.21,.43))})`);
    const index=p<.13?0:p<.24?1:p<.46?2:p<.64?3:p<.86?4:5;
    if(index!==activeStage){activeStage=index;$('[data-title]').textContent=stages[index][0];$('[data-copy]').textContent=stages[index][1];$('[data-number]').textContent=String(index+1).padStart(2,'0');root.querySelectorAll('[data-stage]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));}
    range.value=String(Math.round(p*1000));range.setAttribute('aria-valuetext',`${Math.round(p*100)} percent · ${stages[index][0]}`);$('output').value=`${Math.round(p*100)}%`;
    root.dataset.progress=p.toFixed(6);
  }
  function resize() {
    if(!renderer)return;
    const width=canvas.clientWidth,height=canvas.clientHeight,aspect=width/height;
    renderer.setSize(width,height,false);
    const span=(aspect<1?1.22/aspect:1.04)/(zoom?1.6:1);
    camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;
    camera.position.set(view==='top'?0:.22,view==='top'?2:1.65,view==='top'?.001:1.05);
    camera.lookAt(0,.025,0);camera.updateProjectionMatrix();request();
  }
  function createDeposits(data){
    const positions=[],centres=[],normals=[];
    // Extrude the actual top-land triangles; no fabricated pad locations.
    const add=(point,centre,y,n)=>{positions.push(point[0],y,point[1]);centres.push(...centre);normals.push(...n);};
    for(const land of data.lands){
      const centre=land.p.reduce((a,p)=>[a[0]+p[0]/land.p.length,a[1]+p[1]/land.p.length],[0,0]);
      for(const tri of land.t)for(const i of tri)add(land.p[i],centre,.002,[0,1,0]);
      for(const [a,b] of land.e){const A=land.p[a],B=land.p[b],dx=B[0]-A[0],dz=B[1]-A[1],len=Math.hypot(dx,dz),n=[-dz/len,0,dx/len];
        for(const [point,y] of [[A,0],[B,0],[B,.002],[A,0],[B,.002],[A,.002]])add(point,centre,y,n);
      }
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('landCentre',new T.Float32BufferAttribute(centres,2));
    depositMaterial=new T.MeshStandardMaterial({color:0xa2abb0,roughness:.9,metalness:.12,side:T.DoubleSide});
    depositMaterial.onBeforeCompile=shader=>{
      shader.uniforms.print=uniform.print;shader.uniforms.wet=uniform.wet;
      shader.vertexShader='attribute vec2 landCentre; uniform float wet; varying float landX;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        transformed.xz=landCentre+(position.xz-landCentre)*mix(.88,1.,wet);
        transformed.y=.02194+position.y*mix(1.,.4,wet);
        landX=landCentre.x;`);
      shader.fragmentShader='uniform float print; varying float landX;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(landX>mix(-.51,.51,print))discard;');
    };
    depositMaterial.customProgramCacheKey=()=> 'skylabs-reflow-lands-v1';
    deposits=new T.Mesh(geometry,depositMaterial);deposits.frustumCulled=false;model.group.add(deposits);
    root.dataset.lands=String(data.lands.length);
  }
  function unavailable(){
    failed=true;pause();if(frame)cancelAnimationFrame(frame);frame=0;
    root.dataset.state='unavailable';$('.rf-loading').textContent='Interactive CAD unavailable. The finished board is shown; project links remain available.';
    $('.rf-controls').hidden=true;$('.rf-view-tools').hidden=true;
    $('[data-title]').textContent='The finished board.';
    $('[data-copy]').textContent='The static preview shows the assembled telemetry PCB. Open the hardware case study below for component details.';
  }
  async function init(){
    try{
      if(!T?.WebGLRenderer)throw new Error('WebGL unavailable');
      renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
      scene=new T.Scene();camera=new T.OrthographicCamera(-1,1,1,-1,.01,10);
      scene.add(new T.HemisphereLight(0xe1efff,0x25323c,.55));
      const key=new T.DirectionalLight(0xf0f6ff,1.35);key.position.set(-1,3,2);scene.add(key);
      heatLight=new T.DirectionalLight(0xffac70,0);heatLight.position.set(1,2,-1);scene.add(heatLight);
      const [assembly,lands,env]=await Promise.all([window.V2HeroAssets.load('telemetry'),fetch('/assets/models/manufacturing/skylabs-reflow-lands.json').then(r=>{if(!r.ok)throw new Error('Lands unavailable');return r.json();}),window.V2HeroEnvironment.load(T)]);
      if(failed)return;
      model=assembly;scene.environment=env;
      window.V2ProductStudio.applyMaterials(model,'telemetry',T);
      // A single soft studio shadow avoids a second full CAD render per frame.
      const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
      const context=shadowCanvas.getContext('2d'),gradient=context.createRadialGradient(64,64,8,64,64,64);
      gradient.addColorStop(0,'rgba(0,0,0,.4)');gradient.addColorStop(1,'rgba(0,0,0,0)');
      context.fillStyle=gradient;context.fillRect(0,0,128,128);
      const ground=new T.Mesh(new T.PlaneGeometry(1.4,1.15),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
      ground.rotation.x=-Math.PI/2;ground.position.y=-.09;scene.add(ground);
      const fp=new Map(model.metadata.footprints.map(p=>[p.ref,p]));
      const late=ref=>{const f=fp.get(ref);return f && (f.side==='back'||/PinHeader|PinSocket|Connector_JST/.test(f.footprint));};
      model.parts.forEach(part=>{
        const refs=part.object.userData.componentRefs||[part.ref];
        part.reflowLate=refs.some(late);part.reflowBack=part.offset.y<0;
        part.reflowOrder=clamp((part.base.x+.5)*.7+(part.base.z+.4)*.3);
      });
      createDeposits(lands);scene.add(model.group);
      // Compile component materials before the first placement to avoid reveal-time stalls.
      renderer.compile(scene,camera);
      // Public, read-only diagnostics for geometry/reversal acceptance tests.
      root.reflowSnapshot=()=>({progress,playing,frames,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,parts:model.parts.map(p=>({ref:p.ref||p.object.name,visible:p.object.visible,late:p.reflowLate,position:p.object.position.toArray(),base:p.base.toArray(),quaternion:p.object.quaternion.toArray()}))});
      ready=true;root.dataset.state='ready';$('.rf-controls').hidden=false;$('.rf-view-tools').hidden=false;
      play.hidden=reduced.matches;
      resize();new ResizeObserver(resize).observe($('.rf-view'));
    }catch(error){console.warn('Skylabs assembly preview:',error);unavailable();}
  }
  root.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{const i=Number(button.dataset.stage);setTarget(stops[i]);announce(i);}));
  range.addEventListener('input',()=>setTarget(Number(range.value)/1000,true));
  range.addEventListener('change',()=>announce(activeStage));
  play.addEventListener('click',()=>{if(playing){pause();return;}if(progress>.999)progress=target=0;playing=true;target=progress;play.textContent='Pause assembly Ⅱ';last=0;request();});
  $('[data-reset]').addEventListener('click',()=>{setTarget(0);announce(0);});
  root.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));resize();}));
  $('[data-zoom]').addEventListener('click',event=>{zoom=!zoom;event.currentTarget.setAttribute('aria-pressed',String(zoom));event.currentTarget.textContent=zoom?'Detail −':'Detail +';resize();});
  reduced.addEventListener('change',()=>{pause();play.hidden=reduced.matches;progress=target;request();});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible){pause();if(frame)cancelAnimationFrame(frame);frame=0;last=0;}else request();},{threshold:0}).observe(root);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();if(frame)cancelAnimationFrame(frame);frame=0;last=0;}else request();});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();unavailable();});
  if(navigator.connection?.saveData){$('.rf-loading').textContent='Data saving is on. Load the interactive board when you’re ready.';const button=document.createElement('button');button.type='button';button.textContent='Load assembly';button.addEventListener('click',()=>{button.remove();init();},{once:true});$('.rf-loading').append(' ',button);}else init();
})();
