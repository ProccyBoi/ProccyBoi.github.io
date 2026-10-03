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
  const posters = [...root.querySelectorAll('[data-assembly-posters] img')];
  const projects = [
    {name:'tramtrace', title:'TramTrace', kind:'Live light-rail display', description:'116 pixels following Sydney’s light-rail network.', href:'/v2/projects/tramtrace/'},
    {name:'telemetry', title:'Telemetry', kind:'Skylabs avionics', description:'Navigation, sensing and a radio link to the ground.', href:'/v2/projects/skylabs/boards/telemetry/'},
    {name:'pi', title:'Raspberry Pi', kind:'Framework expansion card', description:'An RP2354B microcontroller in the same compact format.', href:'/v2/projects/framework-raspberry-pi/'}
  ];
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const smooth = value => { const p = clamp(value); return p*p*(3-2*p); };
  const ramp = (value, start, end) => smooth((value-start)/(end-start));
  let renderer, scene, camera, environment, keyLight, overviewLight, shadowBounds, shadowCorner, shadowCentre, loadingExperience;
  const models = Array(projects.length).fill(null);
  const shadows = Array(projects.length).fill(null);
  const modelStates = Array(projects.length).fill('pending');
  let frame = 0, frames = 0, visible = true, ready = false, loading = false, failed = false;
  let target = 0, current = 0, active = -1, width = 0, height = 0, entry = 0;
  let poses = [];
  const motionAllowed = () => !reduced.matches && !navigator.connection?.saveData;
  const loadScript = source => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source; script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
  let sourceFactories;
  const loadSourceModel = async name => {
    sourceFactories ||= Promise.all([
      window.V2AssemblyModels ? Promise.resolve() : loadScript('/assets/v2-assembly-models.js?v=mechanics-20261003'),
      window.V2HardwareModels ? Promise.resolve() : loadScript('/assets/v2-hardware-models.js?v=mechanics-20261003'),
      window.THREE.GLTFLoader ? Promise.resolve() : loadScript('/assets/vendor/GLTFLoader.js')
    ]);
    await sourceFactories;
    return window.V2AssemblyModels.load(name);
  };
  const fitShadows = () => {
    if (!keyLight) return;
    // Independent projects overlap in the opening composition. Blend in the
    // same key light's shadows as a board takes focus, without changing its
    // total illumination or casting one project's silhouette over another.
    const strength=ramp(current,.115,.135);
    keyLight.intensity=1.4*strength;
    overviewLight.intensity=1.4*(1-strength);
    if (!strength && keyLight.shadow.map) return;
    shadowBounds.makeEmpty();
    models.forEach(model => {
      if (model?.group.visible) shadowBounds.expandByObject(model.group);
    });
    if (shadowBounds.isEmpty()) return;
    shadowBounds.getCenter(shadowCentre);
    keyLight.target.position.copy(shadowCentre);
    keyLight.position.copy(shadowCentre).addScaledVector(keyLight.userData.direction, 25);
    keyLight.target.updateMatrixWorld();
    keyLight.updateMatrixWorld();
    const view = keyLight.shadow.camera;
    view.position.copy(keyLight.position);
    view.lookAt(shadowCentre);
    view.updateMatrixWorld();
    let left=Infinity, right=-Infinity, bottom=Infinity, top=-Infinity, near=Infinity, far=-Infinity;
    for (let corner=0; corner<8; corner++) {
      shadowCorner.set(
        corner&1 ? shadowBounds.max.x : shadowBounds.min.x,
        corner&2 ? shadowBounds.max.y : shadowBounds.min.y,
        corner&4 ? shadowBounds.max.z : shadowBounds.min.z
      ).applyMatrix4(view.matrixWorldInverse);
      left=Math.min(left,shadowCorner.x);right=Math.max(right,shadowCorner.x);
      bottom=Math.min(bottom,shadowCorner.y);top=Math.max(top,shadowCorner.y);
      near=Math.min(near,-shadowCorner.z);far=Math.max(far,-shadowCorner.z);
    }
    const margin=.18;
    view.left=left-margin;view.right=right+margin;
    view.bottom=bottom-margin;view.top=top+margin;
    view.near=Math.max(.1,near-margin);view.far=far+margin;
    view.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate=true;
  };
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
    if(!height || !width) return;
    const half = 5*width/height;
    if(renderer) {
      renderer.setSize(width,height,false);
      camera.top=5; camera.bottom=-5;
      camera.right=half; camera.left=-half;
      camera.updateProjectionMatrix();
    }
    const small = width<=900;
    const off = half+9;
    const focusX = small ? 0 : half*.33;
    const focusY = small ? .75 : -.72;
    const scale = small ? Math.min(4.7,half*1.7) : Math.min(5.65,half*.82)*Math.min(1,(height-100)/800);
    const tramScale = small ? Math.min(5.1,half*1.83) : Math.min(9.4,half*1.21);
    const startScale = small ? Math.min(3.6,half*1.45)*(width<360?.9:1) : Math.min(4.15,half*.6);
    const left = small ? -half*.47 : -half*.72;
    const right = small ? half*.53 : half*.69;
    const leadStart=startScale*(small?1.2:1.7);
    const sideStart=startScale*(small?.57:.8);
    poses = [
      [pose(0,0,-1.9,leadStart,1.04,-.12,-.2),pose(.135,focusX,focusY,tramScale,1.12,.05,-.1),pose(.265,focusX,focusY-.22,tramScale,.84,-.13,-.14,1),pose(.34,focusX,focusY,tramScale,1.3,0,0),pose(.405,-off,1,tramScale,.92,.65,-.35),pose(1,-off,1,tramScale,.92,.65,-.35)],
      [pose(0,left,small ? -.2 : -1.65,sideStart,1.08,.28,-.24),pose(.10,-off,-1,sideStart,1.08,.28,-.24),pose(.345,off,-.6,scale,1.18,-.3,.25),pose(.445,focusX,focusY,scale,1.12,-.25,.22),pose(.565,focusX,focusY-.35,scale*(small?.9:1),.82,-.2,.16,1),pose(.65,focusX,focusY,scale,1.1,-.35,.05),pose(.725,-off,1,scale,1.12,-.6,-.2),pose(1,-off,1,scale,1.12,-.6,-.2)],
      [pose(0,right,small ? -.25 : -1.65,sideStart,1.05,.22,.24),pose(.11,off,-1,sideStart,1.05,.22,.24),pose(.65,off,-.2,scale,1.1,.1,-.05),pose(.76,focusX,focusY,scale,1.12,.05,-.1),pose(.88,focusX,focusY-(small?.05:.12),scale*.76,.83,.18,-.23,1),pose(1,focusX,focusY,scale,1.12,.35,-.1)]
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
    if(!ready || !visible || document.hidden || !motionAllowed()) return;
    const moving=motionAllowed();
    if(moving) current += (target-current)*.19;
    else current=0;
    if(Math.abs(target-current)<.00008) current=target;
    const settle=entry ? ramp(timestamp-entry,0,1250) : 1;
    projects.forEach((project,index) => {
      const transform=interpolate(poses[index],current);
      const inScene=index===0 ? current<.405 : index===1 ? current<.105 || (current>=.345 && current<.725) : current<.115 || current>=.65;
      const inView=inScene && Math.abs(transform.x)<5*width/height+transform.s;
      const poster=posters[index];
      if(poster) {
        // Posters follow the same scroll poses before their CAD is available,
        // so a slow model never leaves an empty or frozen chapter.
        const pixels=height/10;
        poster.style.setProperty('--assembly-poster-width',`${transform.s*pixels*1.4}px`);
        poster.style.setProperty('--assembly-poster-height',`${transform.s*pixels*1.05}px`);
        poster.style.setProperty('--assembly-poster-left',`${width/2+transform.x*pixels}px`);
        poster.style.setProperty('--assembly-poster-top',`${height/2-(transform.y-(1-settle)*.6)*pixels}px`);
        poster.style.setProperty('--assembly-poster-transform',`translate(-50%,-50%) rotate(${-transform.rz*.4}rad)`);
        poster.style.setProperty('--assembly-poster-opacity',inView&&!models[index]?'1':'0');
        poster.style.setProperty('--assembly-poster-visibility',inView?'visible':'hidden');
        loadingExperience?.setPose(index,{
          x:width/2+transform.x*pixels,y:height/2-(transform.y-(1-settle)*.6)*pixels,
          width:transform.s*pixels*1.4,height:transform.s*pixels*1.05,
          rotation:-transform.rz*.4,visible:inView
        });
      }
      const model=models[index];
      if(!model) return;
      const group=model.group;
      group.visible=inView;
      const shadow=shadows[index];
      shadow.visible=group.visible;
      group.position.set(transform.x,transform.y-(1-settle)*.6,0);
      group.scale.setScalar(transform.s*(.94+settle*.06));
      group.rotation.set(transform.rx,transform.ry,transform.rz+(1-settle)*.11);
      window.V2HeroMotion.apply(model.parts,transform.e);
      shadow.position.set(transform.x,transform.y-transform.s*.43,-3);
      shadow.scale.set(transform.s*.9,transform.s*.18,1);
      shadow.material.opacity=.085*(1-transform.e*.6);
    });
    const introFade=1-ramp(current,.015,.10);
    intro.style.opacity=introFade.toFixed(4);
    intro.style.transform=`translateY(${(-90*(1-introFade)).toFixed(2)}px)`;
    captionAt(current);
    progressBar.style.transform=`scaleX(${current.toFixed(5)})`;
    if(renderer) {fitShadows();renderer.render(scene,camera);}
    root.dataset.assemblyFrames=String(++frames);
    root.dataset.assemblyProgress=current.toFixed(5);
    root.dataset.assemblyDraws=String(renderer?.info.render.calls||0);
    if(moving && (Math.abs(target-current)>.00008 || settle<1)) frame=requestAnimationFrame(render);
  };
  function request(){if(!frame && ready && visible && !document.hidden) frame=requestAnimationFrame(render);}
  const staticMode = () => {
    loadingExperience?.suspend(true);
    root.classList.remove('is-enhanced'); root.classList.add('is-static');
    if(frame) cancelAnimationFrame(frame); frame=0; target=0; current=0;
    intro.style.removeProperty('opacity'); intro.style.removeProperty('transform');
    posters.forEach(poster=>poster.removeAttribute('style'));
    selectors.forEach(link=>link.removeAttribute('aria-current'));
    caption.classList.remove('is-active');caption.style.opacity='0'; caption.setAttribute('aria-hidden','true');projectLink.tabIndex=-1;
    if(ready) {entry=0; layout(); request();}
    else root.dataset.assemblyState='static';
  };
  async function initialize(){
    if(loading || ready || failed || !motionAllowed()) return;
    loading=true; root.dataset.assemblyState='loading';
    root.classList.add('is-enhanced'); root.classList.remove('is-static');
    try {loadingExperience=window.V2HeroLoading?.create(root,stage,posters);} catch(error) { /* The original posters remain the fallback. */ }
    // Start the complete scroll scene using the lightweight posters. Neither
    // script download nor CAD parsing gates captions, navigation or movement.
    ready=true;entry=performance.now();layout();current=target;request();
    try {
      // Download prepared geometry alongside Three.js. Source CAD remains a
      // recovery path, without putting its parsing cost on the normal visit.
      const assets=(async()=>{
        if(!window.V2HeroAssets) await loadScript('/assets/v2-hero-assets.js?v=mechanics-20261003');
        projects.forEach(project=>window.V2HeroAssets.prefetch(project.name).catch(()=>{}));
      })().catch(()=>{});
      const lighting=(async()=>{
        if(!window.V2HeroEnvironment) await loadScript('/assets/v2-hero-environment.js');
        window.V2HeroEnvironment.prefetch().catch(()=>{});
      })().catch(()=>{});
      await Promise.all([
        assets,lighting,
        window.V2HeroMotion?Promise.resolve():loadScript('/assets/v2-hero-motion.js?v=mechanics-20261003'),
        window.THREE?Promise.resolve():loadScript('/assets/vendor/three.min.js')
      ]);
      const T=window.THREE;
      renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.5:1.75));
      renderer.outputEncoding=T.sRGBEncoding; renderer.toneMapping=T.ACESFilmicToneMapping;
      renderer.toneMappingExposure=.98;
      renderer.shadowMap.enabled=true;
      renderer.shadowMap.type=T.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate=false;
      scene=new T.Scene();camera=new T.OrthographicCamera(-8,8,5,-5,.1,100);
      camera.position.set(0,0,20);camera.lookAt(0,0,0);
      scene.add(new T.HemisphereLight(0xffffff,0xc4cfce,.6));
      const light=(color,intensity,x,y,z)=>{const lamp=new T.DirectionalLight(color,intensity);lamp.position.set(x,y,z);scene.add(lamp);return lamp;};
      keyLight=light(0xfff8ed,1.4,-4,8,12);light(0xd3e5ff,.9,8,3,5);light(0xffffff,.5,-8,-4,6);
      overviewLight=light(0xfff8ed,0,-4,8,12);
      keyLight.castShadow=true;
      keyLight.shadow.mapSize.set(2048,2048);
      keyLight.shadow.bias=-.00018;
      keyLight.shadow.normalBias=.003;
      keyLight.userData.direction=keyLight.position.clone().normalize();
      scene.add(keyLight.target);
      shadowBounds=new T.Box3();shadowCorner=new T.Vector3();shadowCentre=new T.Vector3();
      try {
        if(!window.V2HeroEnvironment) throw new Error('Prepared lighting unavailable');
        const texture=await window.V2HeroEnvironment.load(T);
        environment={texture,dispose:()=>texture.dispose()};
        root.dataset.assemblyEnvironment='prepared';
      } catch(error) {
        const room=new T.Scene();room.background=new T.Color(0xb6c0c2);
        [[0xffffff,4,[-7,5,1],[0,Math.PI/2,0]],[0xffffff,3,[0,8,0],[Math.PI/2,0,0]],[0xd9e6f3,2,[7,0,0],[0,-Math.PI/2,0]]].forEach(([color,power,position,rotation])=>{
          const material=new T.MeshBasicMaterial({color,side:T.DoubleSide});material.color.multiplyScalar(power);
          const panel=new T.Mesh(new T.PlaneGeometry(8,12),material);panel.position.set(...position);panel.rotation.set(...rotation);room.add(panel);
        });
        const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(room,.06);
        pmrem.dispose();room.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
        root.dataset.assemblyEnvironment='generated';
      }
      scene.environment=environment.texture;
      const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
      const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,4,64,64,64);
      gradient.addColorStop(0,'#182d24');gradient.addColorStop(.5,'#182d2480');gradient.addColorStop(1,'#182d2400');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
      const shadowTexture=new T.CanvasTexture(shadowCanvas);
      layout();
      const loadModel=async index=>{
        modelStates[index]='loading';posters[index].dataset.assemblyModelState='loading';
        try {
          const name=projects[index].name;
          let model;
          try {
            if(!window.V2HeroAssets) throw new Error('Prepared geometry unavailable');
            model=await window.V2HeroAssets.load(name);
          } catch(error) {
            model=await loadSourceModel(name);
          }
          if(failed) return;
          window.V2HeroMotion.prepare(model.parts,{name});
          const shadow=new T.Mesh(new T.PlaneGeometry(1.5,1.5),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,opacity:.08}));
          models[index]=model;shadows[index]=shadow;scene.add(model.group);scene.add(shadow);
          modelStates[index]='ready';posters[index].dataset.assemblyModelState='ready';
          // A late model adopts the current scroll pose without resetting the
          // scene or waiting for any other project's download/parse/compile.
          if(frame) cancelAnimationFrame(frame);
          render(performance.now());root.classList.add('is-loaded');request();
          loadingExperience?.modelReady(index);
          root.dataset.assemblyModelsReady=String(models.filter(Boolean).length);
          root.dataset.assemblyState='ready';
          if(!root.dataset.assemblyFirstModel) {
            root.dataset.assemblyFirstModel=projects[index].name;
            root.dataset.assemblyFirstModelMs=performance.now().toFixed(1);
          }
        } catch(error) {
          // A first-render failure must roll back the installed slot too;
          // otherwise its truthy model would keep its fallback poster hidden.
          if(models[index]) {
            scene.remove(models[index].group);
            models[index].group.traverse(object=>{
              object.geometry?.dispose();
              const materials=Array.isArray(object.material)?object.material:[object.material];
              materials.forEach(material=>material?.dispose());
            });
            models[index]=null;
          }
          if(shadows[index]) {
            scene.remove(shadows[index]);shadows[index].geometry.dispose();shadows[index].material.dispose();shadows[index]=null;
          }
          modelStates[index]='unavailable';posters[index].dataset.assemblyModelState='unavailable';
          loadingExperience?.modelFailed(index);
          root.dataset.assemblyModelsReady=String(models.filter(Boolean).length);
          if(!models.some(Boolean)) root.classList.remove('is-loaded');
          console.warn(`${projects[index].title} CAD unavailable; its scroll poster remains available.`,error);
          request();
        }
      };
      // Give the lead board the first download/parse opportunity. Queue the
      // supporting models after the browser can paint its initial scene.
      const lead=loadModel(0);
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      const supporting=projects.slice(1).map((_,index)=>loadModel(index+1));
      await Promise.allSettled([lead,...supporting]);
      if(!models.some(Boolean)) root.dataset.assemblyState='unavailable';
      root.dataset.assemblyModelsSettled=String(modelStates.filter(state=>state!=='pending'&&state!=='loading').length);
      if(!motionAllowed()) staticMode();
    } catch(error) {
      failed=true;root.dataset.assemblyState='unavailable';
      modelStates.fill('unavailable');
      posters.forEach(poster=>{poster.dataset.assemblyModelState='unavailable';});
      projects.forEach((_,index)=>loadingExperience?.modelFailed(index));
      root.dataset.assemblyModelsReady='0';root.dataset.assemblyModelsSettled=String(projects.length);
      root.classList.remove('is-loaded');
      renderer?.dispose();
      renderer=null;
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
  const syncLoadingVisibility=()=>loadingExperience?.suspend(!visible||document.hidden||!motionAllowed());
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;syncLoadingVisibility();if(visible){updateProgress();request();}else if(frame){cancelAnimationFrame(frame);frame=0;}},{threshold:0}).observe(root);
  document.addEventListener('visibilitychange',()=>{syncLoadingVisibility();if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{updateProgress();request();}});
  reduced.addEventListener('change',()=>{
    if(!motionAllowed()) staticMode();
    else if(ready){root.classList.add('is-enhanced');root.classList.remove('is-static');entry=0;syncLoadingVisibility();layout();}
    else initialize();
  });
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();failed=true;renderer=null;models.fill(null);shadows.fill(null);
    modelStates.fill('unavailable');
    root.classList.remove('is-loaded');root.dataset.assemblyState='unavailable';root.dataset.assemblyModelsReady='0';
    root.dataset.assemblyModelsSettled=String(projects.length);
    posters.forEach(poster=>{poster.dataset.assemblyModelState='unavailable';});request();
    projects.forEach((_,index)=>loadingExperience?.modelFailed(index));
  });
  addEventListener('pagehide',()=>{loadingExperience?.suspend(true);cancelAnimationFrame(frame);frame=0;});
  addEventListener('pageshow',()=>{syncLoadingVisibility();updateProgress();request();});
  if(motionAllowed()) initialize(); else staticMode();
})();
