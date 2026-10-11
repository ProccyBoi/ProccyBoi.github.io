/* Selected Work: six real assemblies, one physical space and one renderer.
 * Native scrolling remains in charge. Preparation does not wait for scrolling. */
(() => {
  'use strict';
  const root = document.querySelector('[data-selected-work]');
  if (!root) return;
  const articles = [...root.querySelectorAll('[data-selected-chapter]')];
  const names = ['esp32', 'dual', 'pi', 'logic', 'metro', 'tramtrace'];
  const ids = ['work-framework', 'work-transit'];
  const images = [...root.querySelectorAll('img')];
  root.dataset.selectedReady = 'false';
  Promise.all(images.map(async image => {
    image.loading = 'eager'; image.dataset.imageDecoded = 'false';
    try {
      if (image.decode) await image.decode();
      else if (!image.complete) await new Promise((resolve, reject) => { image.addEventListener('load', resolve, {once:true}); image.addEventListener('error', reject, {once:true}); });
      if (!image.naturalWidth) throw new Error('Image unavailable');
      image.dataset.imageDecoded = 'true'; return true;
    } catch (_) { image.dataset.imageError = 'decode'; return false; }
  })).then(results => { root.dataset.selectedReady = String(results.every(Boolean)); });

  let settleBackground;
  const backgroundSettled = new Promise(resolve => { settleBackground = resolve; });
  window.V2SelectedWork = Object.freeze({backgroundSettled});
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), short = matchMedia('(max-height:600px)');
  const allowed = () => !reduced.matches && !short.matches && !navigator.connection?.saveData && Boolean(window.DecompressionStream);
  const scripts = window.V2HeroScripts ||= new Map();
  const script = url => {
    if (!scripts.has(url)) scripts.set(url, new Promise((resolve,reject) => {
      const element = document.createElement('script'); element.src=url; element.onload=resolve; element.onerror=reject; document.head.append(element);
    }));
    return scripts.get(url);
  };
  const clamp = n => Math.max(0, Math.min(1,n));
  // Each costly phase gets its own browser turn, with a bounded idle wait.
  // One driver call cannot be interrupted, so warm draws are finite and masked.
  const idleTurn = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(() => {
    if (window.requestIdleCallback) requestIdleCallback(resolve, {timeout:700}); else resolve();
  },0)));
  let stage,canvas,track,nav,bar,links=[],renderer,scene,camera,composition,key,environment;
  let sourceTask,transferTask,releaseTransfer,initialization,backgroundBusy=false,backgroundDone=false;
  let ready=false,failed=false,visible=false,activePage=true,generation=0,frame=0,frames=0,warmFrames=0;
  let width=1,height=1,top=0,distance=1,progress=0,current=0,previousTime=0,currentChapter=-1,direct=false,capturePose;
  const assemblies = {};
  const request = () => { if (!frame && ready && track && visible && activePage && !document.hidden && allowed()) frame=requestAnimationFrame(render); };
  const near = () => { const b=root.getBoundingClientRect(); return b.top<innerHeight+500 && b.bottom>-500; };
  function chapter(index) {
    if (currentChapter===index || !track) return;
    currentChapter=index;
    articles.forEach((article,i) => {
      if (i!==index && article.contains(document.activeElement)) links[index]?.focus({preventScroll:true});
      article.classList.toggle('is-current',i===index); article.inert=i!==index; article.setAttribute('aria-hidden',String(i!==index));
    });
    links.forEach((link,i) => i===index?link.setAttribute('aria-current','step'):link.removeAttribute('aria-current'));
    root.dataset.selectedChapter=String(index);
  }
  function mask() {
    root.classList.remove('is-live'); if(canvas) canvas.style.visibility='hidden'; root.dataset.selectedWarmMask='true';
  }
  function enable() {
    if(track || articles.length!==2) return;
    if(stage){
      articles.forEach((article,i)=>{article.id='copy-'+ids[i];stage.insertBefore(article,nav);});
      track=document.createElement('div');track.className='v2-selected-track';track.setAttribute('aria-hidden','true');
      ids.forEach(id=>{const step=document.createElement('div');step.id=id;step.className='v2-selected-step';track.append(step);});
      root.append(stage,track);root.classList.add('is-scene');mask();currentChapter=-1;chapter(0);layout();return;
    }
    stage=document.createElement('div');stage.className='v2-selected-stage';
    canvas=document.createElement('canvas');canvas.className='v2-selected-canvas';canvas.setAttribute('data-selected-canvas','');canvas.setAttribute('aria-hidden','true');stage.append(canvas);
    articles.forEach((article,i)=>{article.id='copy-'+ids[i];stage.append(article);});
    nav=document.createElement('nav');nav.className='v2-selected-nav';nav.setAttribute('aria-label','Selected Work chapters');
    ['Framework cards','Transit displays'].forEach((text,i)=>{
      const link=document.createElement('a');link.href='#'+ids[i];link.textContent=text;nav.append(link);
      link.addEventListener('click',()=>{direct=false;previousTime=0;prepareTransfers(true).catch(fail);initialize(true).catch(fail);});
      link.addEventListener('keydown',event=>{
        const index=event.key==='ArrowRight'?(i+1)%2:event.key==='ArrowLeft'?(i+1)%2:event.key==='Home'?0:event.key==='End'?1:null;
        if(index!==null){event.preventDefault();links[index].focus();}
      });
    });
    links=[...nav.children];stage.append(nav);
    const progressElement=document.createElement('div');progressElement.className='v2-selected-progress';progressElement.setAttribute('aria-hidden','true');
    bar=document.createElement('span');progressElement.append(bar);stage.append(progressElement);
    track=document.createElement('div');track.className='v2-selected-track';track.setAttribute('aria-hidden','true');
    ids.forEach(id=>{const step=document.createElement('div');step.id=id;step.className='v2-selected-step';track.append(step);});
    root.append(stage,track);root.classList.add('is-scene');mask();chapter(0);layout();
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(new Error('Selected Work graphics context lost'));});
    if(ids.includes(location.hash.slice(1))) requestAnimationFrame(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView({behavior:'instant'}));
  }
  function dispose() {
    if(!scene)return;
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of [].concat(object.material||[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());environment?.dispose();renderer?.dispose();
  }
  function fallback(state='static') {
    generation++;cancelAnimationFrame(frame);frame=0;previousTime=0;mask();
    const restore=track&&visible&&currentChapter>=0?currentChapter:-1;
    root.classList.remove('is-scene','is-live');
    articles.forEach((article,i)=>{article.id=ids[i];article.inert=false;article.removeAttribute('aria-hidden');article.classList.remove('is-current');root.append(article);});
    stage?.remove();track?.remove();track=null;
    root.dataset.selectedState=state;settleBackground({state,at:performance.now()});
    if(restore>=0)articles[restore].scrollIntoView({behavior:'instant',block:'start'});
  }
  function fail(error) {
    if(failed)return;failed=true;root.dataset.selectedError=error?.message||'Unavailable';fallback('unavailable');dispose();
  }
  function updateScroll() {
    if(!track)return;
    const b=root.getBoundingClientRect(),pinned=parseFloat(getComputedStyle(stage).top)||0;
    const nextVisible=b.top<innerHeight&&b.bottom>pinned;
    const entered=nextVisible&&!visible;visible=nextVisible;
    // The negative-margin track is the stage's stable flow placeholder; its
    // document position does not change when the stage becomes sticky.
    top=scrollY+track.getBoundingClientRect().top;
    const next=clamp((scrollY-top+pinned)/distance);
    const smoother=window.V2ScrollSmoothing;
    if(!visible||direct||Math.abs(next-progress)>(smoother?.jump||.18))current=next;
    progress=next;root.dataset.selectedProgress=progress.toFixed(6);
    if(!root.classList.contains('is-live')){chapter(progress<.57?0:1);bar.style.transform=`scaleX(${progress})`;}
    if(entered){generation++;if(!backgroundDone)root.dataset.selectedBackgroundState='promoted';}
    if(visible){prepareTransfers(true).catch(fail);initialize(true).catch(fail);request();}
    else {cancelAnimationFrame(frame);frame=0;previousTime=0;current=progress;prepareInBackground();}
  }
  function layout() {
    if(!track)return;
    width=stage.clientWidth;height=stage.clientHeight;distance=height*(width<=760?2.8:2.5);
    track.style.height=`${distance+height}px`;track.style.marginTop=`${-height}px`;
    const padding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
    const pinned=parseFloat(getComputedStyle(stage).top)||0;
    [...track.children].forEach((step,i)=>step.style.top=`${i*distance+padding-pinned}px`);
    renderer?.setSize(width,height,false);previousTime=0;updateScroll();
  }
  function fitLight(pose) {
    const span=Math.max(3,pose.distance*.8),target=pose.target;
    key.target.position.copy(target);key.position.copy(target).addScaledVector(key.userData.direction,span*2);key.target.updateMatrixWorld();
    const shadow=key.shadow.camera;shadow.left=-span/2;shadow.right=span/2;shadow.top=span/2;shadow.bottom=-span/2;shadow.near=.01;shadow.far=span*4;shadow.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;
  }
  function pixelRatio(warm=false) {
    const live=Math.min(devicePixelRatio||1,width<=760?1.25:1.5);
    const ratio=warm?Math.min(live,640/Math.max(width,height)):live;
    if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
    root.dataset.selectedLivePixelRatio=String(live);
    if(warm)root.dataset.selectedWarmPixelRatio=String(ratio);
    root.dataset.selectedBufferWidth=String(canvas.width);root.dataset.selectedBufferHeight=String(canvas.height);
    return ratio;
  }
  function draw(value,warm=false) {
    const started=performance.now(),ratio=pixelRatio(warm);
    const pose=composition.frame(camera,value,width,height);fitLight(pose);
    // r128 resets its counters after the shadow pass by default. Explicitly
    // bracket the full draw so diagnostics include both shadow and main work.
    const autoReset=renderer.info.autoReset;renderer.info.autoReset=false;renderer.info.reset();
    try{renderer.render(scene,camera);}finally{renderer.info.autoReset=autoReset;}
    const measurement={durationMs:performance.now()-started,...renderer.info.render,programs:renderer.info.programs.length,warm,pixelRatio:ratio,width:canvas.width,height:canvas.height};
    root.dataset.selectedLastDraw=JSON.stringify(measurement);
    return {...pose,measurement};
  }
  function render(time) {
    frame=0;if(!ready||!track||!visible||document.hidden||!activePage||!allowed())return;
    const smoother=window.V2ScrollSmoothing;
    current=direct||!smoother?progress:smoother.step(current,progress,previousTime?time-previousTime:16.67);previousTime=time;
    const value=capturePose??current;
    try {const pose=draw(value);chapter(pose.chapter);}
    catch(error){fail(error);return;}
    canvas.style.visibility='';root.classList.add('is-live');root.dataset.selectedWarmMask='false';root.dataset.selectedState='ready';
    root.dataset.selectedFrames=String(++frames);root.dataset.selectedRenderedProgress=value.toFixed(6);bar.style.transform=`scaleX(${value})`;
    root.dataset.selectedFirstLiveMs ||= performance.now().toFixed(1);
    if(capturePose===undefined&&current!==progress)request();else previousTime=0;
  }
  function prepareSources() {
    return sourceTask ||= Promise.all([
      window.THREE?Promise.resolve():script('/assets/vendor/three.min.js'),
      window.V2HeroAssets?Promise.resolve():script('/assets/v2-hero-assets.js?v=transfer-20261011'),
      window.V2HeroEnvironment?Promise.resolve():script('/assets/v2-hero-environment.js?v=product-20261007'),
      script('/assets/v2-selected-assets.js?v=shared-batched-20261011'),
      script('/assets/v2-selected-scene.js?v=part-assembly-20261011')
    ]).then(()=>{if(allowed()&&!failed){window.V2HeroEnvironment.prefetch().catch(()=>{});window.V2SelectedAssets.prefetchTextures().catch(()=>{});}});
  }
  async function prepareTransfers(promote=false) {
    await prepareSources();if(!allowed()||failed)return;
    if(promote)releaseTransfer?.();
    if(!transferTask){
      root.dataset.selectedTransportState='waiting-hero-bytes';
      const gate=new Promise(resolve=>{
        const finish=()=>{clearTimeout(timer);resolve();};releaseTransfer=finish;
        const timer=setTimeout(finish,4500);
        Promise.allSettled(['tramtrace','telemetry','pi'].map(name=>window.V2HeroAssets.whenTransferSettled(name))).then(finish);
      });
      if(promote)releaseTransfer();
      transferTask=gate.then(()=>{
        if(!allowed()||failed)return;
        root.dataset.selectedTransportState='loading';
        return Promise.all(names.map(name=>window.V2SelectedAssets.prefetch(name))).then(()=>{root.dataset.selectedTransportState='ready';});
      });
    }
    return transferTask;
  }
  const foregroundSettled=()=>new Promise(resolve=>{
    const hero=document.querySelector('[data-assembly]');
    if(!hero||hero.dataset.assemblyModelsSettled==='3'||hero.dataset.assemblyState==='unavailable'){resolve();return;}
    let observer;const finish=()=>{clearTimeout(timer);observer?.disconnect();resolve();};const timer=setTimeout(finish,12000);
    observer=new MutationObserver(()=>{if(hero.dataset.assemblyModelsSettled==='3'||hero.dataset.assemblyState==='unavailable')finish();});
    observer.observe(hero,{attributes:true,attributeFilter:['data-assembly-models-settled','data-assembly-state']});
  });
  async function initialize(promote=false) {
    if(ready){request();return;}
    if(!allowed()||failed||!track)return;
    if(promote)prepareTransfers(true).catch(fail);
    if(initialization)return initialization;
    initialization=(async()=>{
      root.dataset.selectedState='loading';await prepareTransfers(promote);
      if(!allowed()||failed||!track)return;
      // Construct separate instances from cached transports, never reparent the
      // opening hero's live models. Yield between each reconstruction.
      for(const name of names){
        await idleTurn();if(!allowed()||failed||!activePage||document.hidden)return;
        if(assemblies[name])continue;
        const assembly=await window.V2SelectedAssets.loadStatic(name,assembly=>{
          if(name==='pi'||name==='tramtrace')window.V2ProductStudio.applyMaterials(assembly,name);
        },{shouldContinue:()=>allowed()&&!failed&&track&&activePage&&!document.hidden});
        if(!assembly||!allowed()||failed||!track||!activePage||document.hidden)return;
        assemblies[name]=assembly;
        root.dataset.selectedModelsReady=String(Object.keys(assemblies).length);
      }
      await idleTurn();if(!allowed()||failed||!track||document.hidden||!activePage)return;
      const T=window.THREE;
      environment ||= await window.V2HeroEnvironment.load(T);
      if(!allowed()||failed||!track||document.hidden||!activePage)return;
      renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,width<=760?1.25:1.5));renderer.setSize(width,height,false);
      window.V2ProductStudio.configureRenderer(renderer,T);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
      scene=new T.Scene();camera=new T.PerspectiveCamera(32,width/height,.01,200);
      scene.environment=environment;
      key=window.V2ProductStudio.createLights(T,scene).key;key.shadow.mapSize.set(1536,1536);
      composition=window.V2SelectedScene.create(T,assemblies);scene.add(composition.group);
      const floor=new T.Mesh(new T.PlaneGeometry(160,160),new T.ShadowMaterial({color:0x000000,opacity:.35,transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
      root.dataset.selectedModelStatistics=JSON.stringify(composition.stats());root.dataset.selectedSceneReady='true';
      ready=true;root.dataset.selectedState='prepared';layout();request();
      if(new URLSearchParams(location.search).has('selectedCapture'))window.__v2Selected={renderer,scene,camera,assemblies,composition,
        seekProgress(value){capturePose=clamp(value);current=capturePose;const pose=draw(capturePose);chapter(pose.chapter);canvas.style.visibility='';root.classList.add('is-live');root.dataset.selectedWarmMask='false';root.dataset.selectedRenderedProgress=capturePose.toFixed(6);bar.style.transform=`scaleX(${capturePose})`;},
        drawProgress(value,{warm=false,shadows=true}={}){const enabled=renderer.shadowMap.enabled;renderer.shadowMap.enabled=shadows;try{return draw(clamp(value),warm).measurement;}finally{renderer.shadowMap.enabled=enabled;renderer.shadowMap.needsUpdate=true;}},
        resume(){capturePose=undefined;previousTime=0;updateScroll();request();}};
    })().catch(fail).finally(()=>{
      initialization=null;
      if(!ready&&!failed&&allowed()&&track&&!document.hidden&&activePage)setTimeout(()=>visible?initialize(true):prepareInBackground(),0);
      if(ready&&!visible)prepareInBackground();
    });
    return initialization;
  }
  async function prepareInBackground() {
    if(backgroundBusy||backgroundDone||failed||!allowed()||visible||document.hidden||!activePage||!track)return;
    backgroundBusy=true;mask();const token=++generation;
    const valid=()=>token===generation&&!visible&&!document.hidden&&activePage&&allowed()&&!failed&&track;
    root.dataset.selectedBackgroundState='warming';root.dataset.selectedBackgroundStartedMs ||= performance.now().toFixed(1);
    try{
      await prepareSources();prepareTransfers().catch(fail);await foregroundSettled();await idleTurn();if(!valid())return;
      await initialize();if(!valid()||!ready)return;
      for(const pose of [0,1]){await idleTurn();if(!valid())return;draw(pose,true);root.dataset.selectedWarmFrames=String(++warmFrames);}
      // Restore CPU pose without an extra GPU frame; keep the canvas masked.
      composition.frame(camera,progress,width,height);backgroundDone=true;root.dataset.selectedBackgroundReady='true';root.dataset.selectedBackgroundReadyMs=performance.now().toFixed(1);root.dataset.selectedBackgroundState='ready';settleBackground({state:'ready',at:performance.now()});
    }catch(error){fail(error);}
    finally{if(renderer&&!failed)pixelRatio();backgroundBusy=false;if(token!==generation&&!backgroundDone&&!failed&&!visible&&!document.hidden&&activePage&&allowed())setTimeout(prepareInBackground,0);}
  }
  function start(){
    if(failed)return;if(!allowed()){fallback();return;}enable();
    prepareSources().then(()=>prepareTransfers(near())).catch(fail);
    if(near())initialize(true);else{root.dataset.selectedState=ready?'prepared':'waiting';prepareInBackground();}
  }
  root.addEventListener('wheel',()=>{direct=false;},{passive:true});root.addEventListener('touchmove',()=>{direct=true;},{passive:true});
  addEventListener('scroll',updateScroll,{passive:true});addEventListener('resize',()=>{if(allowed()){start();layout();}else fallback();},{passive:true});
  addEventListener('hashchange',()=>{previousTime=0;current=progress;updateScroll();});
  document.addEventListener('visibilitychange',()=>{generation++;previousTime=0;current=progress;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{updateScroll();prepareInBackground();}});
  addEventListener('pagehide',()=>{activePage=false;generation++;cancelAnimationFrame(frame);frame=0;previousTime=0;});
  addEventListener('pageshow',()=>{activePage=true;previousTime=0;updateScroll();prepareInBackground();});
  reduced.addEventListener?.('change',start);short.addEventListener?.('change',start);navigator.connection?.addEventListener?.('change',start);
  root.dataset.selectedFrames='0';root.dataset.selectedWarmFrames='0';root.dataset.selectedModelsReady='0';
  start();
})();
