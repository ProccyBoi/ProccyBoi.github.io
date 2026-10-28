/* Source-CAD film. Native document scroll is the only timeline. Every frame is
 * reconstructed from a scalar: original vertices, X/Z and rotations survive. */
(() => {
  'use strict';
  const root=document.querySelector('[data-reflow]');if(!root)return;
  const stage=root.querySelector('.rf-stage'),canvas=root.querySelector('canvas');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),T=window.THREE;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const ramp=(x,a,b)=>smooth((x-a)/(b-a));
  let renderer,scene,camera,model,deposits,solder,key,rim,heat,shadow;
  let ready=false,failed=false,visible=true,frame=0,frames=0,last=0;
  let progress=0,target=0,scrollStart=0,scrollSpan=1,aspect=1;
  const uniforms={print:{value:0},wet:{value:0}};
  const aim=new (T?.Vector3||class{})();
  const cameraKeys=[
    // p, azimuth, polar angle, view span, target X, target Z.
    [0,-.32,.98,1.3,0,0],[.16,-.1,.42,1.25,0,0],
    [.45,.24,.72,1.23,0,0],[.57,.38,.57,.72,.085,-.035],
    [.68,.50,.62,.72,.085,-.035],[.74,.65,1.10,1.3,0,0],
    [.81,.80,2.28,1.3,0,0],[.87,.80,2.28,1.3,0,0],
    [.95,.32,.91,1.3,0,0],[1,.22,.88,1.3,0,0]
  ];
  function schedule(){if(ready&&!failed&&visible&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);}
  function cancel(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;}
  function readScroll(){
    const bounds=root.getBoundingClientRect();
    const header=parseFloat(getComputedStyle(root).getPropertyValue('--rf-header'))||76;
    scrollStart=bounds.top+scrollY-header;scrollSpan=Math.max(1,root.offsetHeight-stage.clientHeight);
    target=reduced.matches?1:clamp((scrollY-scrollStart)/scrollSpan);
    schedule();
  }
  function tick(now){
    frame=0;const elapsed=Math.max(0,(now-(last||now))/1000);last=now;
    if(reduced.matches)progress=1;
    else if(Math.abs(progress-target)<.00002)progress=target;
    else progress+=(target-progress)*(1-Math.exp(-elapsed*12));
    pose();renderer.render(scene,camera);frames++;root.dataset.frames=String(frames);
    if(progress!==target)schedule();else last=0;
  }
  function cameraPose(p){
    let i=0;while(i<cameraKeys.length-2&&p>cameraKeys[i+1][0])i++;
    const a=cameraKeys[i],b=cameraKeys[i+1],t=ramp(p,a[0],b[0]);
    const values=a.map((v,k)=>v+(b[k]-v)*t),[,yaw,polar,span,x,z]=values;
    // Fit the entire board on small screens except the deliberate solder close-up.
    const portrait=aspect<.8,fitSpan=span*(portrait?.8:1);
    const orbit=yaw+(portrait?Math.PI/2:0);
    const elevation=portrait&&(p<.74||p>.91)?polar*.78:polar;
    const size=Math.max(fitSpan,fitSpan/Math.max(.4,aspect));
    camera.left=-size*aspect/2;camera.right=size*aspect/2;camera.top=size/2;camera.bottom=-size/2;
    aim.set(x,0,z);camera.position.set(x+Math.sin(orbit)*Math.sin(elevation)*2,Math.cos(elevation)*2,z+Math.cos(orbit)*Math.sin(elevation)*2);
    camera.lookAt(aim);camera.updateProjectionMatrix();
  }
  function pose(){
    const p=progress,wet=ramp(p,.55,.68),warm=ramp(p,.48,.59)*(1-ramp(p,.66,.74));
    uniforms.print.value=ramp(p,.045,.19);uniforms.wet.value=wet;
    deposits.visible=p>.045;solder.roughness=.84-.58*wet;solder.metalness=.18+.8*wet;
    solder.color.setRGB(.38+wet*.18,.40+wet*.20,.42+wet*.22);
    for(const part of model.parts){
      // Front-side SMT is reflowed first. Back-side and through-hole assembly
      // appear later, with a camera turn to show the underside operation.
      const start=part.reflowBack?.785:part.reflowLate?.895:.215+part.reflowOrder*.16;
      const duration=part.reflowLate?.045:.075,land=ramp(p,start,start+duration);
      part.object.visible=p>=start;
      part.object.position.copy(part.base);
      part.object.position.y+=(part.reflowBack?-1:1)*(.24+part.reflowOrder*.10)*(1-land);
      // Components approach vertically in their authored orientation.
    }
    heat.intensity=warm*.65;rim.intensity=.7+warm*.3;
    shadow.visible=p<.745||p>.91;cameraPose(p);
    root.dataset.progress=p.toFixed(6);
  }
  function resize(){
    if(!renderer)return;
    const w=stage.clientWidth,h=stage.clientHeight;aspect=w/Math.max(h,1);
    renderer.setSize(w,h,false);readScroll();schedule();
  }
  function createDeposits(data){
    const positions=[],centres=[],normals=[];
    const add=(p,c,y,n)=>{positions.push(p[0],y,p[1]);centres.push(...c);normals.push(...n);};
    for(const land of data.lands){
      const c=land.p.reduce((a,p)=>[a[0]+p[0]/land.p.length,a[1]+p[1]/land.p.length],[0,0]);
      const inset=(p,s)=>[c[0]+(p[0]-c[0])*s,c[1]+(p[1]-c[1])*s];
      // A gently rolled deposit edge is built from the real land perimeter.
      for(const tri of land.t)for(const id of tri)add(inset(land.p[id],.80),c,.0019,[0,1,0]);
      const rings=[[.80,.0019],[.91,.0016],[.98,.0008],[1,0]];
      for(const [ia,ib] of land.e){
        const A=land.p[ia],B=land.p[ib];
        for(let r=0;r<rings.length-1;r++){
          const [s0,y0]=rings[r],[s1,y1]=rings[r+1];
          for(const [v,s,y] of [[A,s0,y0],[B,s0,y0],[B,s1,y1],[A,s0,y0],[B,s1,y1],[A,s1,y1]]){
            const q=inset(v,s),dx=q[0]-c[0],dz=q[1]-c[1],len=Math.hypot(dx,dz)||1;
            const flat=(1-s)*5;add(q,c,y,[dx/len*(1-flat),flat,dz/len*(1-flat)]);
          }
        }
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('landCentre',new T.Float32BufferAttribute(centres,2));
    solder=new T.MeshStandardMaterial({color:0xa5aeb4,roughness:.8,metalness:.2,side:T.DoubleSide,envMapIntensity:1.1});
    solder.onBeforeCompile=s=>{
      s.uniforms.print=uniforms.print;s.uniforms.wet=uniforms.wet;
      s.vertexShader='attribute vec2 landCentre; uniform float wet; varying float landX; varying vec3 solderPoint;\n'+s.vertexShader;
      s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        transformed.xz=landCentre+(position.xz-landCentre)*mix(.9,1.,wet);
        transformed.y=.02194+position.y*mix(1.,.46,wet);
        landX=landCentre.x;solderPoint=position;`);
      s.fragmentShader='uniform float print; uniform float wet; varying float landX; varying vec3 solderPoint;\n'+s.fragmentShader;
      s.fragmentShader=s.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(landX>mix(-.51,.51,print))discard;');
      s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        float grain=fract(sin(dot(floor(solderPoint.xz*58000.),vec2(12.9898,78.233)))*43758.5453);
        roughnessFactor=clamp(roughnessFactor+(grain-.5)*.25*(1.-wet),.12,1.);`);
    };
    solder.customProgramCacheKey=()=> 'reflow-rounded-source-lands-v2';
    deposits=new T.Mesh(g,solder);deposits.frustumCulled=false;model.group.add(deposits);root.dataset.lands=String(data.lands.length);
  }
  function unavailable(message){
    failed=true;cancel();root.classList.remove('is-scroll');root.dataset.state='unavailable';
    root.querySelector('.rf-loading').textContent=message||'The animated board is unavailable. The finished assembly is shown.';
  }
  function motionPreference(){root.classList.toggle('is-scroll',!reduced.matches);readScroll();if(reduced.matches){progress=target=1;pose();}schedule();}
  async function init(){
    try{
      if(!T?.WebGLRenderer)throw new Error('WebGL unavailable');
      renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
      scene=new T.Scene();camera=new T.OrthographicCamera(-1,1,1,-1,.01,10);
      scene.add(new T.HemisphereLight(0xc4d9f0,0x252c32,.16));
      key=new T.DirectionalLight(0xfff4e9,1.6);key.position.set(-1.1,2,1);scene.add(key);
      rim=new T.DirectionalLight(0xc2ddff,.7);rim.position.set(1.2,.4,-1.8);scene.add(rim);
      const underside=new T.DirectionalLight(0xdde9ff,.8);underside.position.set(-1,-2,.5);scene.add(underside);
      heat=new T.DirectionalLight(0xffa059,0);heat.position.set(-2,1,-1);scene.add(heat);
      const [assembly,lands,env]=await Promise.all([window.V2HeroAssets.load('telemetry'),fetch('/assets/models/manufacturing/skylabs-reflow-lands.json').then(r=>{if(!r.ok)throw new Error('Lands unavailable');return r.json();}),window.V2HeroEnvironment.load(T)]);
      if(failed)return;model=assembly;scene.environment=env;window.V2ProductStudio.applyMaterials(model,'telemetry',T);
      const mats=new Set();model.group.traverse(o=>{if(o.isMesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));});
      for(const m of mats){
        if(m.name===model.metadata.materials.mask){m.transparent=false;m.opacity=1;m.roughness=.38;m.clearcoat=.4;m.clearcoatRoughness=.24;}
        if(m.metalness>.5){m.roughness=.28;m.envMapIntensity=.85;}
      }
      // Physical occlusion: the original core and components cast; the coplanar mask doesn't.
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
      key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-.8,right:.8,top:.8,bottom:-.8,near:.1,far:5});key.shadow.bias=-.00012;key.shadow.normalBias=.0005;
      const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
      const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,5,64,64,64);gradient.addColorStop(0,'rgba(0,0,0,.4)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
      shadow=new T.Mesh(new T.PlaneGeometry(1.5,1.25),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.10;scene.add(shadow);
      const fp=new Map(model.metadata.footprints.map(p=>[p.ref,p]));
      model.parts.forEach(part=>{const refs=part.object.userData.componentRefs||[part.ref];part.reflowBack=part.offset.y<0;part.reflowLate=part.reflowBack||refs.some(ref=>/PinHeader|PinSocket|Connector_JST/.test(fp.get(ref)?.footprint||''));part.reflowOrder=clamp((part.base.x+.5)*.65+(part.base.z+.4)*.35);});
      createDeposits(lands);scene.add(model.group);renderer.compile(scene,camera);
      root.reflowSnapshot=()=>({progress,target,settled:progress===target,frames,scrollStart,scrollSpan,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,parts:model.parts.map(p=>({ref:p.ref||p.object.name,visible:p.object.visible,late:p.reflowLate,position:p.object.position.toArray(),base:p.base.toArray(),quaternion:p.object.quaternion.toArray()}))});
      ready=true;root.dataset.state='ready';motionPreference();resize();new ResizeObserver(resize).observe(stage);
    }catch(error){console.warn('Skylabs assembly:',error);unavailable();}
  }
  addEventListener('scroll',readScroll,{passive:true});addEventListener('resize',resize,{passive:true});
  reduced.addEventListener('change',()=>{if(ready&&!failed)motionPreference();});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)cancel();else{readScroll();schedule();}},{threshold:0}).observe(stage);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else{readScroll();schedule();}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();unavailable();});
  if(navigator.connection?.saveData){const status=root.querySelector('.rf-loading');status.textContent='Data saving is on.';const b=document.createElement('button');b.type='button';b.textContent='Load board animation';b.onclick=()=>{b.remove();init();};status.append(b);}else init();
})();
