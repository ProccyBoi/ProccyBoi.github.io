/* One scroll position drives every transform; reversing the page reconstructs
   the assemblies exactly. The model factory retains physical component groups. */
(() => {
  'use strict';
  const root = document.querySelector('[data-assembly]');
  if (!root) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = root.querySelector('[data-assembly-canvas]');
  const stage = root.querySelector('.v2-assembly-sticky');
  const intro = root.querySelector('[data-assembly-intro]');
  const caption = root.querySelector('[data-assembly-caption]');
  const projectLink = root.querySelector('[data-assembly-link]');
  const selectors = [...root.querySelectorAll('[data-assembly-select]')];
  const progressBar = root.querySelector('[data-assembly-progress]');
  const projects = [
    {name:'esp32', title:'ESP32', kind:'Framework expansion card', description:'A wireless development board, built into a laptop bay.', href:'/v2/projects/framework-expansion-card/'},
    {name:'pi', title:'Raspberry Pi', kind:'Framework expansion card', description:'An RP2354B microcontroller in the same compact format.', href:'/v2/projects/framework-raspberry-pi/'},
    {name:'tramtrace', title:'TramTrace', kind:'Live light-rail display', description:'116 pixels following Sydney’s light-rail network.', href:'/v2/projects/tramtrace/'}
  ];
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const smooth = value => { const p = clamp(value); return p*p*(3-2*p); };
  const ramp = (value, start, end) => smooth((value-start)/(end-start));
  let renderer, scene, camera, models, environment;
  let frame = 0, frames = 0, visible = true, ready = false, loading = false, failed = false;
  let target = 0, current = 0, active = -1, width = 0, height = 0, entry = 0;
  let poses = [], shadows = [];
  const motionAllowed = () => !reduced.matches && !navigator.connection?.saveData;
  const loadScript = source => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source; script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
  const captionAt = value => {
    const windows = [[.09,.365],[.405,.685],[.725,1.2]];
    let next = -1, opacity = 0;
    windows.forEach(([start,end], index) => {
      if (value >= start && value <= end) {
        next = index;
        opacity = ramp(value,start,start+.055) * (1-ramp(value,end-.04,end));
      }
    });
    if (next >= 0 && next !== active) {
      const project = projects[next];
      root.querySelector('[data-assembly-title]').textContent = project.title;
      root.querySelector('[data-assembly-kind]').textContent = project.kind;
      root.querySelector('[data-assembly-description]').textContent = project.description;
      projectLink.href = project.href;
    }
    active = next;
    caption.style.opacity = opacity.toFixed(4);
    caption.style.transform = `translateY(${((1-opacity)*22).toFixed(2)}px)`;
    caption.classList.toggle('is-active',opacity>.5);
    caption.setAttribute('aria-hidden',String(opacity<.5));
    projectLink.tabIndex = opacity>.5 ? 0 : -1;
    selectors.forEach((link,index) => {
      if(index===next) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    });
    root.dataset.assemblyActive = next<0 ? 'overview' : projects[next].name;
  };
  const updateProgress = () => {
    if (!motionAllowed() || !root.classList.contains('is-enhanced')) {target = 0; return;}
    const bounds = root.getBoundingClientRect();
    target = clamp(-bounds.top / Math.max(1,root.offsetHeight-stage.clientHeight));
  };
  const pose = (t,x,y,s,rx,ry,rz,e=0) => ({t,x,y,s,rx,ry,rz,e});
  const layout = () => {
    width = stage.clientWidth; height = stage.clientHeight;
    if(!renderer || !height || !width) return;
    renderer.setSize(width,height,false);
    camera.top=5; camera.bottom=-5;
    camera.right=5*width/height; camera.left=-camera.right;
    camera.updateProjectionMatrix();
    const small = width<=900;
    const half = camera.right;
    const off = half+9;
    const focusX = small ? 0 : half*.33;
    const focusY = small ? .75 : -.72;
    const scale = small ? Math.min(4.7,half*1.7) : Math.min(5.65,half*.82)*Math.min(1,(height-100)/800);
    const tramScale = small ? Math.min(5.1,half*1.83) : Math.min(9.4,half*1.21);
    const startScale = small ? Math.min(3.6,half*1.45)*(width<360?.9:1) : Math.min(4.15,half*.6);
    const left = small ? -half*.82 : -half*.72;
    const right = small ? half*.86 : half*.69;
    poses = [
      [pose(0,0,-1.9,startScale,1.04,-.22,-.38),pose(.135,focusX,focusY,scale,1.02,-.15,-.28),pose(.265,focusX,focusY-.35,scale,.83,.18,-.23,1),pose(.34,focusX,focusY,scale,1.12,.35,-.1),pose(.405,-off,1,scale,.92,.65,-.35),pose(1,-off,1,scale,.92,.65,-.35)],
      [pose(0,right,small ? -.85 : -1.65,startScale*.74,1.08,.28,.24),pose(.10,off,-1,startScale*.74,1.08,.28,.24),pose(.345,off,-.6,scale,1.18,-.3,.25),pose(.445,focusX,focusY,scale,1.12,-.25,.22),pose(.565,focusX,focusY-.35,scale,.82,-.2,.16,1),pose(.65,focusX,focusY,scale,1.1,-.35,.05),pose(.725,-off,1,scale,1.12,-.6,-.2),pose(1,-off,1,scale,1.12,-.6,-.2)],
      [pose(0,left,small ? -.9 : -1.65,startScale*1.26,1.05,.22,.32),pose(.11,-off,-1,startScale*1.26,1.05,.22,.32),pose(.65,off,-.2,tramScale,1.1,.1,-.05),pose(.76,focusX,focusY,tramScale,1.12,.05,-.1),pose(.88,focusX,focusY-.22,tramScale,.84,-.13,-.14,1),pose(1,focusX,focusY,tramScale,1.3,0,0)]
    ];
    updateProgress();
    request();
  };
  const interpolate = (keys,value) => {
    let index=0;
    while(index<keys.length-2 && value>keys[index+1].t) index++;
    const a=keys[index],b=keys[index+1],p=smooth((value-a.t)/(b.t-a.t));
    const result={};
    for(const key of ['x','y','s','rx','ry','rz','e']) result[key]=a[key]+(b[key]-a[key])*p;
    return result;
  };
  const render = timestamp => {
    frame=0;
    if(!ready || !visible || document.hidden) return;
    const moving=motionAllowed();
    if(moving) current += (target-current)*.19;
    else current=0;
    if(Math.abs(target-current)<.00008) current=target;
    const settle=entry ? ramp(timestamp-entry,0,1250) : 1;
    models.forEach((model,index) => {
      const transform=interpolate(poses[index],current);
      const group=model.group;
      const inScene=index===0 ? current<.405 : index===1 ? current<.105 || (current>=.345 && current<.725) : current<.115 || current>=.65;
      group.visible=inScene && Math.abs(transform.x)<camera.right+transform.s;
      group.position.set(transform.x,transform.y-(1-settle)*.6,0);
      group.scale.setScalar(transform.s*(.94+settle*.06));
      group.rotation.set(transform.rx,transform.ry,transform.rz+(1-settle)*.11);
      model.parts.forEach((part,partIndex) => {
        const stagger=index===2 ? .04*Math.sin(partIndex*.45) : 0;
        const exploded=clamp(transform.e*(1+stagger));
        part.object.position.copy(part.base).addScaledVector(part.offset,exploded);
      });
      const shadow=shadows[index];
      shadow.visible=group.visible;
      shadow.position.set(transform.x,transform.y-transform.s*.43,-3);
      shadow.scale.set(transform.s*.9,transform.s*.18,1);
      shadow.material.opacity=.085*(1-transform.e*.6);
    });
    const introFade=1-ramp(current,.015,.10);
    intro.style.opacity=introFade.toFixed(4);
    intro.style.transform=`translateY(${(-90*(1-introFade)).toFixed(2)}px)`;
    captionAt(current);
    progressBar.style.transform=`scaleX(${current.toFixed(5)})`;
    renderer.render(scene,camera);
    root.dataset.assemblyFrames=String(++frames);
    root.dataset.assemblyProgress=current.toFixed(5);
    root.dataset.assemblyDraws=String(renderer.info.render.calls);
    if(moving && (Math.abs(target-current)>.00008 || settle<1)) frame=requestAnimationFrame(render);
  };
  function request(){if(!frame && ready && visible && !document.hidden) frame=requestAnimationFrame(render);}
  const staticMode = () => {
    root.classList.remove('is-enhanced'); root.classList.add('is-static');
    if(frame) cancelAnimationFrame(frame); frame=0; target=0; current=0;
    intro.style.removeProperty('opacity'); intro.style.removeProperty('transform');
    selectors.forEach(link=>link.removeAttribute('aria-current'));
    caption.style.opacity='0'; caption.setAttribute('aria-hidden','true');projectLink.tabIndex=-1;
    if(ready) {entry=0; layout(); request();}
    else root.dataset.assemblyState='static';
  };
  async function initialize(){
    if(loading || ready || failed || !motionAllowed()) return;
    loading=true; root.dataset.assemblyState='loading';
    root.classList.add('is-enhanced'); root.classList.remove('is-static');
    try {
      if(!window.THREE) await loadScript('/assets/vendor/three.min.js');
      if(!window.THREE.GLTFLoader) await loadScript('/assets/vendor/GLTFLoader.js');
      if(!window.V2AssemblyModels) await loadScript('/assets/v2-assembly-models.js');
      const T=window.THREE;
      renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.5:1.75));
      renderer.outputEncoding=T.sRGBEncoding; renderer.toneMapping=T.ACESFilmicToneMapping;
      renderer.toneMappingExposure=.98;
      scene=new T.Scene();camera=new T.OrthographicCamera(-8,8,5,-5,.1,100);
      camera.position.set(0,0,20);camera.lookAt(0,0,0);
      scene.add(new T.HemisphereLight(0xffffff,0xc4cfce,.6));
      const light=(color,intensity,x,y,z)=>{const lamp=new T.DirectionalLight(color,intensity);lamp.position.set(x,y,z);scene.add(lamp);};
      light(0xfff8ed,1.4,-4,8,12);light(0xd3e5ff,.9,8,3,5);light(0xffffff,.5,-8,-4,6);
      const room=new T.Scene();room.background=new T.Color(0xb6c0c2);
      [[0xffffff,4,[-7,5,1],[0,Math.PI/2,0]],[0xffffff,3,[0,8,0],[Math.PI/2,0,0]],[0xd9e6f3,2,[7,0,0],[0,-Math.PI/2,0]]].forEach(([color,power,position,rotation])=>{
        const material=new T.MeshBasicMaterial({color,side:T.DoubleSide});material.color.multiplyScalar(power);
        const panel=new T.Mesh(new T.PlaneGeometry(8,12),material);panel.position.set(...position);panel.rotation.set(...rotation);room.add(panel);
      });
      const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(room,.06);
      scene.environment=environment.texture;pmrem.dispose();room.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
      models=await Promise.all(projects.map(project=>window.V2AssemblyModels.load(project.name)));
      const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
      const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,4,64,64,64);
      gradient.addColorStop(0,'#182d24');gradient.addColorStop(.5,'#182d2480');gradient.addColorStop(1,'#182d2400');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
      const shadowTexture=new T.CanvasTexture(shadowCanvas);
      shadows=models.map(model=>{
        scene.add(model.group);
        const shadow=new T.Mesh(new T.PlaneGeometry(1.5,1.5),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,opacity:.08}));
        scene.add(shadow);return shadow;
      });
      ready=true;root.dataset.assemblyState='ready';
      entry=performance.now();layout();current=target;
      renderer.compile(scene,camera);
      render(performance.now());root.classList.add('is-loaded');
      if(!motionAllowed()) staticMode();
    } catch(error) {
      failed=true;root.dataset.assemblyState='unavailable';
      staticMode();root.dataset.assemblyState='unavailable';root.classList.remove('is-loaded');
      renderer?.dispose();
      console.warn('Hardware gallery unavailable; project images remain available.',error);
    } finally {loading=false;}
  }
  selectors.forEach((link,index)=>link.addEventListener('click',event=>{
    if(!ready || !motionAllowed() || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const positions=[.265,.565,.88];
    const top=scrollY+root.getBoundingClientRect().top;
    scrollTo({top:top+positions[index]*(root.offsetHeight-stage.clientHeight),behavior:'smooth'});
  }));
  addEventListener('scroll',()=>{updateProgress();request();},{passive:true});
  addEventListener('resize',layout,{passive:true});
  new ResizeObserver(layout).observe(stage);
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible){updateProgress();request();}else if(frame){cancelAnimationFrame(frame);frame=0;}},{threshold:0}).observe(root);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{updateProgress();request();}});
  reduced.addEventListener('change',()=>{
    if(!motionAllowed()) staticMode();
    else if(ready){root.classList.add('is-enhanced');root.classList.remove('is-static');entry=0;layout();}
    else initialize();
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;ready=false;staticMode();root.classList.remove('is-loaded');root.dataset.assemblyState='unavailable';});
  addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
  addEventListener('pageshow',()=>{updateProgress();request();});
  if(motionAllowed()) initialize(); else staticMode();
})();
