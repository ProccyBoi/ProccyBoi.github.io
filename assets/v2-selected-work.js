/* Framework background: four real assemblies, one physical space and one renderer.
 * Native scrolling remains in charge. CAD bytes prefetch immediately;
 * scene construction and GPU preparation follow proximity or explicit intent. */
(() => {
  'use strict';
  const root = document.querySelector('[data-selected-work]');
  if (!root) return;
  const articles = [...root.querySelectorAll('[data-selected-chapter]')];
  const names = ['esp32', 'dual', 'pi', 'logic'];
  const ids = ['work-framework'];
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
  window.V2SelectedWork = Object.freeze({backgroundSettled,preparationState:()=>failed?'unavailable':!allowed()?'static':backgroundDone?'ready':preparationEligible()?'requested':'deferred',isPreparing:()=>Boolean((backgroundBusy||initialization)&&preparationEligible()),isDeferred:()=>!preparationEligible()&&!backgroundDone,isVisible:()=>Boolean(visible&&track&&!failed&&activePage&&!document.hidden&&allowed())});
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
  let stage,canvas,track,bar,renderer,scene,camera,composition,key,environment;
  let sourceTask,transferTask,releaseTransfer,initialization,backgroundBusy=false,backgroundDone=false;
  let ready=false,failed=false,visible=false,activePage=true,generation=0,frame=0,frames=0,warmFrames=0;
  let liveBusy=false,gpuAbort,releaseForeground,needsDrain=true,preparationFrames=0,poseRevision=0,presentedRevision=-1,layoutDPR=0,submittedFrames=0,completedFrames=0;
  const preparedModels=new Set(),preparedPoses=new Set(),preparationMeasurements=[];
  let lastGPUResult,lastPriority=false,preparationNear=false,preparationIntent=false;
  const preparationEligible=()=>Boolean(visible||preparationNear||preparationIntent);
  const aircraftHasPriority=()=>!visible&&Boolean(window.V2AircraftPreparation?.isVisible());
  function publishPriority(){
    const active=window.V2SelectedWork.isVisible();
    if(active===lastPriority)return;lastPriority=active;
    dispatchEvent(new CustomEvent('v2:selected-priority',{detail:{active}}));
  }
  let width=1,height=1,top=0,distance=1,progress=0,current=0,previousTime=0,currentChapter=-1,direct=false,capturePose;
  const assemblies = {};
  const request = () => { if (!frame && !liveBusy && !backgroundBusy && backgroundDone && ready && track && visible && activePage && !document.hidden && allowed()) frame=requestAnimationFrame(render); };
  const near = () => { const b=root.getBoundingClientRect(); return b.top<innerHeight+500 && b.bottom>-500; };
  function chapter(index) {
    if (currentChapter===index || !track) return;
    currentChapter=index;
    articles.forEach((article,i) => {
      if (i!==index && article.contains(document.activeElement)) articles[index]?.querySelector('a')?.focus({preventScroll:true});
      article.classList.toggle('is-current',i===index); article.inert=i!==index; article.setAttribute('aria-hidden',String(i!==index));
    });
    root.dataset.selectedChapter=String(index);
  }
  function mask() {
    root.classList.remove('is-live'); if(canvas) canvas.style.visibility='hidden'; root.dataset.selectedWarmMask='true';
  }
  function enable() {
    if(track || articles.length!==1) return;
    if(stage){
      articles.forEach((article,i)=>{article.id='copy-'+ids[i];stage.append(article);});
      track=document.createElement('div');track.className='v2-selected-track';track.setAttribute('aria-hidden','true');
      ids.forEach(id=>{const step=document.createElement('div');step.id=id;step.className='v2-selected-step';track.append(step);});
      root.append(stage,track);root.classList.add('is-scene');mask();currentChapter=-1;chapter(0);layout();return;
    }
    stage=document.createElement('div');stage.className='v2-selected-stage';
    canvas=document.createElement('canvas');canvas.className='v2-selected-canvas';canvas.setAttribute('data-selected-canvas','');canvas.setAttribute('aria-hidden','true');stage.append(canvas);
    articles.forEach((article,i)=>{article.id='copy-'+ids[i];stage.append(article);});
    const skipScene=document.createElement('a');skipScene.className='v2-selected-skip';skipScene.href='#skylabs-aircraft';skipScene.textContent='Skip';skipScene.setAttribute('aria-label','Skip Selected Work animation');stage.append(skipScene);
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
  function invalidate() {
    generation++;needsDrain=true;gpuAbort?.abort();gpuAbort=undefined;releaseForeground?.();
  }
  function fallback(state='static') {
    invalidate();cancelAnimationFrame(frame);frame=0;previousTime=0;mask();
    const restore=track&&visible&&currentChapter>=0?currentChapter:-1;
    root.classList.remove('is-scene','is-live');
    articles.forEach((article,i)=>{article.id=ids[i];article.inert=false;article.removeAttribute('aria-hidden');article.classList.remove('is-current');root.append(article);});
    stage?.remove();track?.remove();track=null;publishPriority();
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
    const entered=nextVisible&&!visible,left=!nextVisible&&visible;visible=nextVisible;publishPriority();
    const wasNear=preparationNear;preparationNear=b.top<innerHeight*2&&b.bottom>-innerHeight;
    if(!preparationNear&&!visible){preparationIntent=false;if(wasNear&&(backgroundBusy||initialization))invalidate();}
    root.dataset.selectedPreparationEligible=String(preparationEligible());
    // The negative-margin track is the stage's stable flow placeholder; its
    // document position does not change when the stage becomes sticky.
    top=scrollY+track.getBoundingClientRect().top;
    const next=clamp((scrollY-top+pinned)/distance);
    const smoother=window.V2ScrollSmoothing;
    const jumped=Math.abs(next-progress)>(smoother?.jump||.18);
    if(!visible||direct||jumped)current=next;
    if(next!==progress)poseRevision++;
    progress=next;
    root.dataset.selectedProgress=progress.toFixed(6);root.dataset.selectedPoseRevision=String(poseRevision);
    if(entered||left||jumped){invalidate();mask();if(entered&&!backgroundDone)root.dataset.selectedBackgroundState='promoted';}
    if(!root.classList.contains('is-live')){chapter(0);bar.style.transform=`scaleX(${progress})`;}
    if(visible){prepareTransfers(true).catch(fail);initialize(true).catch(fail);prepareInBackground();request();}
    else {cancelAnimationFrame(frame);frame=0;previousTime=0;current=progress;prepareInBackground();}
  }
  function layout() {
    if(!track)return;
    const nextWidth=stage.clientWidth,nextHeight=stage.clientHeight;
    const nextDPR=Math.min(devicePixelRatio||1,nextWidth<=760?1.25:1.5);
    const sizeChanged=width!==nextWidth||height!==nextHeight,dprChanged=layoutDPR!==nextDPR;
    if(sizeChanged||dprChanged){invalidate();mask();poseRevision++;}
    width=nextWidth;height=nextHeight;layoutDPR=nextDPR;distance=height*1.15;
    track.style.height=`${distance+height}px`;track.style.marginTop=`${-height}px`;
    const padding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
    const pinned=parseFloat(getComputedStyle(stage).top)||0;
    [...track.children].forEach((step,i)=>step.style.top=`${i*distance+padding-pinned}px`);
    if(renderer&&dprChanged)renderer.setPixelRatio(nextDPR);
    if(renderer&&sizeChanged)renderer.setSize(width,height,false);
    previousTime=0;updateScroll();
  }
  function fitLight(pose) {
    const span=Math.max(3,pose.distance*.8),target=pose.target;
    key.target.position.copy(target);key.position.copy(target).addScaledVector(key.userData.direction,span*2);key.target.updateMatrixWorld();
    const shadow=key.shadow.camera;shadow.left=-span/2;shadow.right=span/2;shadow.top=span/2;shadow.bottom=-span/2;shadow.near=.01;shadow.far=span*4;shadow.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;
  }
  function pixelRatio(warm=false,longSide=640) {
    const live=Math.min(devicePixelRatio||1,width<=760?1.25:1.5);
    const ratio=warm?Math.min(live,longSide/Math.max(width,height)):live;
    if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
    root.dataset.selectedLivePixelRatio=String(live);
    if(warm)root.dataset.selectedWarmPixelRatio=String(ratio);
    root.dataset.selectedBufferWidth=String(canvas.width);root.dataset.selectedBufferHeight=String(canvas.height);
    return ratio;
  }
  function prepareShadowSize(size) {
    const shadow=key.shadow;
    // r128 allocates a shadow target only when map is null. Changing mapSize
    // alone would retain the old allocation and could lower visible quality.
    // Callers reach draw only after the previous owned batch has completed or
    // its canceled work has drained; never dispose a target behind a fence.
    if(shadow.map&&(shadow.map.width!==size||shadow.map.height!==size)){
      shadow.map.dispose();shadow.map=null;
    }
    shadow.mapSize.set(size,size);
  }
  function draw(value,warm=false,longSide=640) {
    const started=performance.now(),programsBefore=renderer.info.programs.length,ratio=pixelRatio(warm,longSide);
    // Isolated, masked model stages only need to exercise the exact shader
    // variants and uploads. Both complete composition stages and every live
    // frame retain the accepted full-resolution shadow map.
    prepareShadowSize(warm&&longSide===64?64:1536);
    const pose=composition.frame(camera,value,width,height,undefined);fitLight(pose);
    // r128 resets its counters after the shadow pass by default. Explicitly
    // bracket the full draw so diagnostics include both shadow and main work.
    const autoReset=renderer.info.autoReset;renderer.info.autoReset=false;renderer.info.reset();
    try{renderer.render(scene,camera);}finally{renderer.info.autoReset=autoReset;}
    const measurement={durationMs:performance.now()-started,...renderer.info.render,programs:renderer.info.programs.length,programsBefore,warm,pixelRatio:ratio,width:canvas.width,height:canvas.height,shadowWidth:key.shadow.map?.width,shadowHeight:key.shadow.map?.height};
    root.dataset.selectedLastDraw=JSON.stringify(measurement);
    return {...pose,measurement};
  }
  async function gpuComplete(valid,live=false,initial=false) {
    if(!valid()){lastGPUResult={state:'canceled',waitMs:0,polls:0};return false;}
    const abort=new AbortController();gpuAbort=abort;root.dataset.selectedGPUPending='true';
    const result=await window.V2GPUPreparation.wait(renderer,{signal:abort.signal,valid,pollMs:live?4:16,timeoutMs:initial?30000:12000});
    lastGPUResult=result;if(gpuAbort===abort)gpuAbort=undefined;
    root.dataset.selectedGPUPending='false';root.dataset.selectedGPUCompletion=result.state;
    root.dataset.selectedGPUWaitMs=result.waitMs.toFixed(1);
    if(initial){root.dataset.selectedInitialDrainState=result.state;root.dataset.selectedInitialDrainMs=result.waitMs.toFixed(1);}
    if(result.state==='timeout'||result.state==='lost')throw new Error('Selected Work GPU preparation '+result.state);
    if(result.state==='canceled'||!valid())return false;
    // WebGL1 has no completion fence. Keep its bounded staged fallback honest:
    // a paint/input opportunity is useful, but is not proof of GPU completion.
    if(result.state==='unsupported')await idleTurn();
    return Boolean(valid());
  }
  async function finishPreparation(kind,name,measurement,valid) {
    let completed=false;
    try{completed=await gpuComplete(valid);return completed;}
    finally{
      preparationMeasurements.push({kind,name,completed,completedMs:performance.now(),...measurement,gpu:lastGPUResult});
      if(preparationMeasurements.length>32)preparationMeasurements.shift();
      root.dataset.selectedPreparationMeasurements=JSON.stringify(preparationMeasurements);
    }
  }
  async function render(time) {
    frame=0;if(!ready||!backgroundDone||backgroundBusy||liveBusy||!track||!visible||document.hidden||!activePage||!allowed())return;
    liveBusy=true;const token=generation;let report;
    const valid=()=>token===generation&&track&&visible&&!document.hidden&&activePage&&allowed()&&!failed;
    try {
      if(needsDrain){if(!await gpuComplete(valid,true))return;needsDrain=false;time=performance.now();}
      const smoother=window.V2ScrollSmoothing;
      current=direct||!smoother||root.dataset.selectedWarmMask==='true'?progress:smoother.step(current,progress,previousTime?time-previousTime:16.67);previousTime=time;
      const value=capturePose??current,revision=poseRevision,rawAtSubmit=progress,submittedMs=performance.now();
      const pose=draw(value);
      report={sequence:++submittedFrames,submittedMs,value,rawAtSubmit,direct,revision,masked:root.dataset.selectedWarmMask==='true',published:false,measurement:pose.measurement};
      root.dataset.selectedSubmittedFrames=String(submittedFrames);
      // There is at most one outstanding live Selected frame. While it is in
      // flight native input stays responsive; the next frame samples the latest
      // target rather than replaying old wheel steps into a growing GPU queue.
      if(!await gpuComplete(valid,true))return;
      if(lastGPUResult.state==='complete')root.dataset.selectedCompletedFrames=String(++completedFrames);
      if((direct&&revision!==poseRevision)||(root.dataset.selectedWarmMask==='true'&&(Math.abs(value-progress)>.00008)))return;
      chapter(pose.chapter);canvas.style.visibility='';root.classList.add('is-live');root.dataset.selectedWarmMask='false';root.dataset.selectedState='ready';
      report.published=true;presentedRevision=revision;root.dataset.selectedPresentedRevision=String(revision);
      root.dataset.selectedFrames=String(++frames);root.dataset.selectedRenderedProgress=value.toFixed(6);bar.style.transform=`scaleX(${value})`;
      root.dataset.selectedFirstLiveMs ||= performance.now().toFixed(1);
      if(capturePose!==undefined||current===progress)previousTime=0;
    }catch(error){fail(error);}
    finally{
      if(report)root.dataset.selectedLastFrame=JSON.stringify({...report,observedMs:performance.now(),completedMs:lastGPUResult?.state==='complete'?performance.now():null,rawAtComplete:progress,gpu:lastGPUResult});
      liveBusy=false;if(!failed&&backgroundDone&&capturePose===undefined&&(needsDrain||presentedRevision!==poseRevision||current!==progress||root.dataset.selectedWarmMask==='true'))request();
    }
  }
  function prepareSources() {
    return sourceTask ||= Promise.all([
      window.THREE?Promise.resolve():script('/assets/vendor/three.min.js'),
      window.V2HeroAssets?Promise.resolve():script('/assets/v2-hero-assets.js?v=load-20261012'),
      window.V2HeroEnvironment?Promise.resolve():script('/assets/v2-hero-environment.js?v=load-20261012'),
      script('/assets/v2-selected-assets.js?v=load-20261012'),
      script('/assets/v2-framework-scene.js?v=20261015'),
      script('/assets/v2-gpu-preparation.js?v=paced-20261011')
    ]).then(()=>{if(allowed()&&!failed)window.V2HeroEnvironment.prefetch().catch(()=>{});});
  }
  async function prepareTransfers(promote=false) {
    if(promote&&(visible||preparationIntent))window.V2TransportPriority?.promote('selected');
    await prepareSources();if(!allowed()||failed)return;
    const waiting=window.V2TransportPriority?.wait('selected');
    if(waiting){root.dataset.selectedTransportState='waiting-aircraft-bytes';await waiting;if(!allowed()||failed)return;}
    if(promote)releaseTransfer?.();
    if(!transferTask){
      root.dataset.selectedTransportState='waiting-hero-bytes';
      const gate=new Promise(resolve=>{
        const finish=()=>{clearTimeout(timer);resolve();};releaseTransfer=finish;
        const timer=setTimeout(finish,4500);
        Promise.allSettled(['tramtrace','telemetry','pi'].map(name=>window.V2HeroAssets.whenTransferSettled(name))).then(finish);
      });
      // Once direct-aircraft critical bytes release the gate, all unrelated
      // transports can overlap again rather than serializing behind the hero.
      if(promote||waiting)releaseTransfer();
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
    if(!hero||hero.dataset.assemblyModelsSettled==='3'||['unavailable','static'].includes(hero.dataset.assemblyState)){resolve();return;}
    let observer;const finish=()=>{clearTimeout(timer);observer?.disconnect();if(releaseForeground===finish)releaseForeground=undefined;resolve();};const timer=setTimeout(finish,12000);releaseForeground=finish;
    observer=new MutationObserver(()=>{if(hero.dataset.assemblyModelsSettled==='3'||['unavailable','static'].includes(hero.dataset.assemblyState))finish();});
    observer.observe(hero,{attributes:true,attributeFilter:['data-assembly-models-settled','data-assembly-state']});
  });
  async function initialize(promote=false) {
    if(ready){prepareInBackground();request();return;}
    if(!allowed()||failed||!track||aircraftHasPriority()||!preparationEligible())return;
    if(promote)prepareTransfers(true).catch(fail);
    if(initialization)return initialization;
    initialization=(async()=>{
      root.dataset.selectedState='loading';await prepareTransfers(promote);
      if(!allowed()||failed||!track||aircraftHasPriority()||!preparationEligible())return;
      // Construct separate instances from cached transports, never reparent the
      // opening hero's live models. Yield between each reconstruction.
      for(const name of names){
        await idleTurn();if(!allowed()||failed||!activePage||document.hidden||aircraftHasPriority()||!preparationEligible())return;
        if(assemblies[name])continue;
        const assembly=await window.V2SelectedAssets.loadStatic(name,assembly=>{
          if(name==='pi')window.V2ProductStudio.applyMaterials(assembly,name);
        },{shouldContinue:()=>allowed()&&!failed&&track&&activePage&&!document.hidden&&!aircraftHasPriority()&&preparationEligible()});
        if(!assembly||!allowed()||failed||!track||!activePage||document.hidden||aircraftHasPriority()||!preparationEligible())return;
        assemblies[name]=assembly;
        root.dataset.selectedModelsReady=String(Object.keys(assemblies).length);
      }
      await idleTurn();if(!allowed()||failed||!track||document.hidden||!activePage||aircraftHasPriority()||!preparationEligible())return;
      const T=window.THREE;
      environment ||= await window.V2HeroEnvironment.load(T);
      if(!allowed()||failed||!track||document.hidden||!activePage||aircraftHasPriority()||!preparationEligible())return;
      renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,width<=760?1.25:1.5));renderer.setSize(width,height,false);
      window.V2ProductStudio.configureRenderer(renderer,T);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
      scene=new T.Scene();camera=new T.PerspectiveCamera(32,width/height,.01,200);
      scene.environment=environment;
      key=window.V2ProductStudio.createLights(T,scene).key;key.shadow.mapSize.set(1536,1536);
      composition=window.V2FrameworkScene.create(T,assemblies);scene.add(composition.group);
      const floor=new T.Mesh(new T.PlaneGeometry(160,160),new T.ShadowMaterial({color:0x000000,opacity:.35,transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
      root.dataset.selectedModelStatistics=JSON.stringify(composition.stats());root.dataset.selectedSceneReady='true';
      ready=true;root.dataset.selectedState='prepared';layout();request();
      if(new URLSearchParams(location.search).has('selectedCapture'))window.__v2Selected={renderer,scene,camera,assemblies,composition,
        seekProgress(value){capturePose=clamp(value);current=capturePose;const pose=draw(capturePose);chapter(pose.chapter);canvas.style.visibility='';root.classList.add('is-live');root.dataset.selectedWarmMask='false';root.dataset.selectedRenderedProgress=capturePose.toFixed(6);bar.style.transform=`scaleX(${capturePose})`;},
        drawProgress(value,{warm=false,shadows=true}={}){const enabled=renderer.shadowMap.enabled;renderer.shadowMap.enabled=shadows;try{return draw(clamp(value),warm).measurement;}finally{renderer.shadowMap.enabled=enabled;renderer.shadowMap.needsUpdate=true;}},
        resume(){capturePose=undefined;previousTime=0;updateScroll();request();}};
    })().catch(fail).finally(()=>{
      initialization=null;
      // Async completion also reconciles the current preference; a media-query
      // change notification may follow its CSS/matches update.
      if(!failed&&!allowed()){fallback();return;}
      if(!ready&&!failed&&allowed()&&track&&!document.hidden&&activePage&&!aircraftHasPriority()&&preparationEligible())setTimeout(()=>visible?initialize(true):prepareInBackground(),0);
      if(ready)prepareInBackground();
    });
    return initialization;
  }
  async function prepareInBackground() {
    if(backgroundDone||failed||!allowed()||document.hidden||!activePage||!track)return;
    if(aircraftHasPriority()){root.dataset.selectedBackgroundState='paused-aircraft';return;}
    if(!preparationEligible()){root.dataset.selectedBackgroundState='deferred-distance';return;}
    if(backgroundBusy||liveBusy)return;
    backgroundBusy=true;mask();const token=generation;
    const valid=()=>token===generation&&!document.hidden&&activePage&&allowed()&&!failed&&track&&!aircraftHasPriority()&&preparationEligible();
    root.dataset.selectedBackgroundState=visible?'promoted':'warming';root.dataset.selectedBackgroundStartedMs ||= performance.now().toFixed(1);
    try{
      await prepareSources();prepareTransfers(visible).catch(fail);
      if(!visible)await foregroundSettled();
      await idleTurn();if(!valid())return;
      await initialize(visible);if(!valid()||!ready)return;
      if(needsDrain){if(!await gpuComplete(valid,false,true))return;needsDrain=false;}
      while(preparedModels.size<names.length){
        await idleTurn();if(!valid())return;
        const order=names;
        const name=order.find(name=>!preparedModels.has(name));
        const visibility=names.map(name=>assemblies[name].group.visible);
        root.dataset.selectedPreparationStage=name;let measurement;
        try{
          names.forEach(other=>{assemblies[other].group.visible=other===name;});
          measurement=draw(0,true,64).measurement;
          root.dataset.selectedPreparationFrames=String(++preparationFrames);
        }finally{names.forEach((name,index)=>{assemblies[name].group.visible=visibility[index];});}
        if(!await finishPreparation('model',name,measurement,valid))return;
        preparedModels.add(name);root.dataset.selectedPreparedModels=[...preparedModels].join(',');
      }
      for(const pose of [0,1]){
        if(preparedPoses.has(pose))continue;
        await idleTurn();if(!valid())return;
        const measurement=draw(pose,true).measurement;root.dataset.selectedWarmFrames=String(++warmFrames);
        if(!await finishPreparation('composition',String(pose),measurement,valid))return;preparedPoses.add(pose);root.dataset.selectedWarmPosesCompleted=String(preparedPoses.size);
      }
      // Restore CPU pose without another GPU frame. Even on an early jump the
      // poster stays until a full-size draw of the latest live pose completes.
      composition.frame(camera,progress,width,height);backgroundDone=true;root.dataset.selectedBackgroundReady='true';root.dataset.selectedBackgroundReadyMs=performance.now().toFixed(1);root.dataset.selectedBackgroundState='ready';root.dataset.selectedPreparationStage='complete';settleBackground({state:'ready',at:performance.now()});
    }catch(error){fail(error);}
    finally{
      backgroundBusy=false;
      if(!failed&&!allowed()){fallback();return;}
      if(renderer&&!failed)pixelRatio();
      if(backgroundDone)request();
      else if(!failed&&!document.hidden&&activePage&&allowed()&&track&&!aircraftHasPriority()&&preparationEligible())setTimeout(prepareInBackground,0);
    }
  }
  function start(){
    if(failed)return;if(!allowed()){fallback();return;}enable();
    prepareSources().then(()=>prepareTransfers(near())).catch(fail);
    if(near())initialize(true);else{root.dataset.selectedState=ready?'prepared':'waiting';prepareInBackground();}
  }
  addEventListener('v2:aircraft-priority',()=>{
    if(backgroundDone)return;
    if(aircraftHasPriority()){invalidate();mask();root.dataset.selectedBackgroundState='paused-aircraft';}
    else prepareInBackground();
  });
  root.addEventListener('wheel',()=>{direct=false;},{passive:true});root.addEventListener('touchmove',()=>{direct=true;},{passive:true});
  addEventListener('scroll',updateScroll,{passive:true});addEventListener('resize',()=>{if(allowed()){start();layout();}else fallback();},{passive:true});
  addEventListener('hashchange',()=>{if(ids.includes(location.hash.slice(1)))preparationIntent=true;previousTime=0;current=progress;updateScroll();prepareInBackground();});
  document.addEventListener('visibilitychange',()=>{invalidate();publishPriority();previousTime=0;current=progress;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{updateScroll();prepareInBackground();}});
  addEventListener('pagehide',()=>{activePage=false;invalidate();publishPriority();cancelAnimationFrame(frame);frame=0;previousTime=0;});
  addEventListener('pageshow',()=>{activePage=true;previousTime=0;updateScroll();prepareInBackground();});
  reduced.addEventListener?.('change',start);short.addEventListener?.('change',start);navigator.connection?.addEventListener?.('change',start);
  root.dataset.selectedFrames='0';root.dataset.selectedSubmittedFrames='0';root.dataset.selectedCompletedFrames='0';root.dataset.selectedWarmFrames='0';root.dataset.selectedPreparationFrames='0';root.dataset.selectedWarmPosesCompleted='0';root.dataset.selectedModelsReady='0';
  start();
})();
