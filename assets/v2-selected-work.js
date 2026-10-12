/* Selected Work: six real assemblies, one physical space and one renderer.
 * Native scrolling remains in charge. Transports prefetch immediately;
 * scene construction and GPU preparation follow proximity or explicit intent. */
(() => {
  'use strict';
  const root = document.querySelector('[data-selected-work]');
  if (!root) return;
  const articles = [...root.querySelectorAll('[data-selected-chapter]')];
  const backgroundScene = root.hasAttribute('data-selected-background-scene');
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
  let stage,canvas,track,backgroundContent,contentObserver,nav,bar,links=[],renderer,scene,camera,composition,key,environment;
  let sourceTask,transferTask,releaseTransfer,initialization,backgroundBusy=false,backgroundDone=false;
  let ready=false,failed=false,visible=false,activePage=true,generation=0,frame=0,frames=0,warmFrames=0;
  let liveBusy=false,gpuAbort,needsDrain=true,preparationFrames=0,poseRevision=0,presentedRevision=-1,layoutDPR=0,submittedFrames=0,completedFrames=0;
  const preparedModels=new Set(),preparedPoses=new Set(),preparationMeasurements=[];
  let lastGPUResult,lastPriority=false,preparationNear=false,preparationIntent=backgroundScene&&ids.includes(location.hash.slice(1));
  // Byte transfer is eager, but an offscreen scene must not steal the opening
  // hero's CPU/GPU before its visible frame has actually completed. Installed
  // model counts and elapsed time are not a foreground completion signal.
  function foregroundAvailable(){
    const hero=document.querySelector('[data-assembly]');
    if(!hero||['unavailable','static'].includes(hero.dataset.assemblyState))return true;
    if(hero.dataset.assemblyForegroundSettled==='true')return true;
    if(hero.dataset.assemblyReadableVisible!==undefined)return hero.dataset.assemblyReadableVisible==='false';
    const bounds=(hero.querySelector('.v2-assembly-stage')||hero).getBoundingClientRect();
    const header=document.querySelector('.v2-header')?.getBoundingClientRect().bottom||0;
    return bounds.bottom<=header||bounds.top>=innerHeight;
  }
  const preparationEligible=()=>Boolean((visible||preparationNear||preparationIntent)&&(visible||foregroundAvailable()));
  const aircraftHasPriority=()=>!visible&&Boolean(window.V2AircraftPreparation?.isVisible());
  function publishPriority(){
    const active=window.V2SelectedWork.isVisible();
    if(active===lastPriority)return;lastPriority=active;
    dispatchEvent(new CustomEvent('v2:selected-priority',{detail:{active}}));
  }
  let width=1,height=1,contentExtent=0,top=0,distance=1,progress=0,current=0,previousTime=0,currentChapter=-1,direct=false,capturePose;
  const assemblies = {};
  const inspection={weights:new Float32Array(4)},inspectNames=['ESP32-S3','Dual USB-C','RP2354B','Logic analyser'];
  let inspectUI,inspectControls,inspectHint,overviewButton,inspectButtons=[],inspectTarget=-1,inspectMode='overview',inspectRevision=0,inspectTime=0,hitPoint,lastPointerX,lastPointerY;
  const inspectionMoving=()=>inspection.weights.some((weight,index)=>Math.abs(weight-(index===inspectTarget?1:0))>.0005);
  function inspectionState(index=-1,mode='overview',immediate=false){
    if(backgroundScene)return;
    if(index>=0&&(!ready||!backgroundDone||!visible||progress>=.34||!root.classList.contains('is-live')))return;
    if(index<0){index=-1;mode='overview';}
    const changed=index!==inspectTarget||mode!==inspectMode;
    if(!changed&&!immediate)return;
    inspectTarget=index;inspectMode=mode;if(changed){inspectRevision++;poseRevision++;}
    if(immediate){inspection.weights.fill(0);inspectTime=0;}
    root.dataset.selectedInspectionTarget=String(index);root.dataset.selectedInspectionMode=mode;
    root.dataset.selectedInspectionRevision=String(inspectRevision);root.dataset.selectedPoseRevision=String(poseRevision);
    inspectButtons.forEach((button,i)=>button.setAttribute('aria-pressed',String(mode==='pinned'&&i===index)));
    if(inspectHint)inspectHint.textContent=index<0?'Select a card for a closer look':inspectNames[index]+(mode==='pinned'?' · Selected':' · Preview');
    if(overviewButton)overviewButton.setAttribute('aria-disabled',String(index<0));
    request();
  }
  function inspectionControls(){
    if(backgroundScene||inspectUI)return;
    inspectUI=document.createElement('div');inspectUI.className='v2-framework-interaction';inspectUI.setAttribute('data-framework-inspection-ui','');inspectUI.hidden=true;
    inspectControls=document.createElement('div');inspectControls.className='v2-framework-inspection-controls';
    inspectHint=document.createElement('p');inspectHint.textContent='Select a card for a closer look';inspectHint.id='framework-inspection-hint';
    overviewButton=document.createElement('button');overviewButton.type='button';overviewButton.textContent='Show all cards';overviewButton.setAttribute('data-framework-overview','');overviewButton.setAttribute('aria-disabled','true');
    overviewButton.addEventListener('click',()=>inspectionState());
    inspectControls.append(inspectHint,overviewButton);inspectUI.append(inspectControls);
    const group=document.createElement('div');group.className='v2-framework-hit-targets';group.setAttribute('role','group');group.setAttribute('aria-label','Inspect Framework expansion cards');
    inspectNames.forEach((name,index)=>{
      const button=document.createElement('button');button.type='button';button.className='v2-framework-inspect';button.setAttribute('data-framework-inspect',String(index));button.setAttribute('aria-label','Inspect '+name+' expansion card');button.setAttribute('aria-describedby','framework-inspection-hint');button.setAttribute('aria-pressed','false');
      button.addEventListener('focus',()=>{if(button.matches(':focus-visible'))inspectionState(index,'preview');});
      button.addEventListener('click',()=>inspectionState(inspectTarget===index&&inspectMode==='pinned'?-1:index,inspectTarget===index&&inspectMode==='pinned'?'overview':'pinned'));
      button.addEventListener('keydown',event=>{
        const destination=event.key==='ArrowRight'?(index+1)%4:event.key==='ArrowLeft'?(index+3)%4:event.key==='ArrowDown'?(index+2)%4:event.key==='ArrowUp'?(index+2)%4:event.key==='Home'?0:event.key==='End'?3:null;
        if(destination!==null){event.preventDefault();inspectButtons[destination].focus({preventScroll:true});}
      });
      group.append(button);inspectButtons.push(button);
    });
    inspectUI.append(group);stage.append(inspectUI);
    stage.addEventListener('pointermove',event=>{
      if(event.pointerType!=='mouse')return;
      const moved=lastPointerX===undefined||Math.abs(event.clientX-lastPointerX)+Math.abs(event.clientY-lastPointerY)>1;lastPointerX=event.clientX;lastPointerY=event.clientY;
      const button=event.target.closest?.('[data-framework-inspect]');
      if(moved&&inspectMode!=='pinned'){if(button)inspectionState(Number(button.dataset.frameworkInspect),'preview');else if(!inspectButtons.includes(document.activeElement))inspectionState();}
    });
    stage.addEventListener('pointerleave',()=>{if(inspectMode==='preview'&&!inspectButtons.includes(document.activeElement))inspectionState();});
    inspectUI.addEventListener('focusout',()=>queueMicrotask(()=>{if(inspectMode==='preview'&&!inspectButtons.includes(document.activeElement))inspectionState();}));
    stage.addEventListener('keydown',event=>{if(event.key==='Escape'&&inspectTarget>=0){event.preventDefault();inspectionState();overviewButton.focus({preventScroll:true});}});
    inspectionState(-1,'overview',true);
  }
  function inspectionAvailability(){
    if(!inspectUI)return;
    const enabled=Boolean(track&&visible&&progress<.34&&root.classList.contains('is-live')&&allowed()&&!failed);
    if(!enabled&&inspectUI.contains(document.activeElement))links[progress<.57?0:1]?.focus({preventScroll:true});
    inspectUI.hidden=!enabled;
  }
  function stepInspection(time){
    if(backgroundScene)return;
    const dt=inspectTime?Math.max(0,time-inspectTime):16.67,alpha=root.dataset.selectedWarmMask==='true'?1:1-Math.exp(-dt/95);inspectTime=time;
    for(let i=0;i<4;i++){const target=i===inspectTarget?1:0;inspection.weights[i]+= (target-inspection.weights[i])*alpha;if(Math.abs(inspection.weights[i]-target)<.0005)inspection.weights[i]=target;}
    root.dataset.selectedInspectionWeights=JSON.stringify([...inspection.weights]);
  }
  function inspectionBounds(){
    if(backgroundScene||progress>=.44)return [];
    if(!hitPoint)hitPoint=new window.THREE.Vector3();
    const stageBox=stage.getBoundingClientRect(),navBox=nav.getBoundingClientRect(),footer=articles[0].querySelector('.v2-framework-copy').getBoundingClientRect();
    const controlsTop=navBox.bottom-stageBox.top+6;inspectControls.style.top=controlsTop+'px';
    const minY=controlsTop+44+8,maxY=footer.top-stageBox.top-12;
    const rectangles=names.slice(0,4).map((name,index)=>{
      const box=composition.bounds.get(name);let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
      for(let corner=0;corner<8;corner++){
        hitPoint.set(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z).project(camera);
        const x=(hitPoint.x+1)*width/2,y=(1-hitPoint.y)*height/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
      left=Math.min(width-44,Math.max(0,left-8));right=Math.min(width,right+8);top=Math.min(maxY-44,Math.max(minY,top-8));bottom=Math.min(maxY,bottom+8);
      return {index,left,top,width:Math.max(44,right-left),height:Math.max(44,bottom-top)};
    });
    // Perspective bounds include empty space between exploded parts. A closer
    // card must not cover its neighbour's native touch target with that empty
    // rectangle. Partition the quartet at shared centre midpoints, then keep
    // each padded model target inside its own cell (including keyboard focus).
    const centreX=rectangles.map(rect=>rect.left+rect.width/2),centreY=rectangles.map(rect=>rect.top+rect.height/2);
    const compact=width<=760,gap=2;
    const splitX=compact?[0,Math.max(45,Math.min(width-45,centreX.reduce((sum,x)=>sum+x,0)/4)),width]
      :[0,...centreX.slice(0,3).map((x,i)=>Math.max((i+1)*46,Math.min(width-(3-i)*46,(x+centreX[i+1])/2))),width];
    const splitY=compact?Math.max(minY+45,Math.min(maxY-45,centreY.reduce((sum,y)=>sum+y,0)/4)):maxY;
    return rectangles.map(rect=>{
      const column=compact?rect.index%2:rect.index,row=compact?Math.floor(rect.index/2):0;
      const leftLimit=splitX[column]+(column?gap/2:0),rightLimit=splitX[column+1]-(column<(compact?1:3)?gap/2:0);
      const topLimit=row?splitY+gap/2:minY,bottomLimit=compact&&!row?splitY-gap/2:maxY;
      const right=Math.max(leftLimit+44,Math.min(rightLimit,rect.left+rect.width)),bottom=Math.max(topLimit+44,Math.min(bottomLimit,rect.top+rect.height));
      const left=Math.min(right-44,Math.max(leftLimit,rect.left)),top=Math.min(bottom-44,Math.max(topLimit,rect.top));
      return {index:rect.index,left,top,width:right-left,height:bottom-top};
    });
  }
  function publishInspection(report){
    if(backgroundScene)return;
    root.dataset.selectedInspectionRenderedWeights=JSON.stringify(report.inspectionWeights);
    root.dataset.selectedInspectionPresentedRevision=String(report.inspectionRevision);
    root.dataset.selectedInspectionHitBounds=JSON.stringify(report.hitBounds);
    for(const rect of report.hitBounds){const button=inspectButtons[rect.index];button.style.left=rect.left+'px';button.style.top=rect.top+'px';button.style.width=rect.width+'px';button.style.height=rect.height+'px';button.style.zIndex=report.inspectionWeights[rect.index]>.1?'2':'1';}
    inspectionAvailability();
  }
  const request = () => { if (!frame && !liveBusy && !backgroundBusy && backgroundDone && ready && track && visible && activePage && !document.hidden && allowed()) frame=requestAnimationFrame(render); };
  const near = () => { const b=root.getBoundingClientRect(); return b.top<innerHeight+500 && b.bottom>-500; };
  function chapter(index) {
    if (currentChapter===index || !track) return;
    currentChapter=index;
    root.dataset.selectedChapter=String(index);
    if(backgroundScene)return;
    articles.forEach((article,i) => {
      if (i!==index && article.contains(document.activeElement)) links[index]?.focus({preventScroll:true});
      article.classList.toggle('is-current',i===index); article.inert=i!==index; article.setAttribute('aria-hidden',String(i!==index));
    });
    links.forEach((link,i) => i===index?link.setAttribute('aria-current','step'):link.removeAttribute('aria-current'));
    root.dataset.selectedChapter=String(index);
  }
  function mask() {
    root.classList.remove('is-live'); if(canvas) canvas.style.visibility='hidden'; root.dataset.selectedWarmMask='true';inspectionAvailability();
  }
  function createStage(){
    stage=document.createElement('div');stage.className='v2-selected-stage';
    canvas=document.createElement('canvas');canvas.className='v2-selected-canvas';canvas.setAttribute('data-selected-canvas','');canvas.setAttribute('aria-hidden','true');stage.append(canvas);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(new Error('Selected Work graphics context lost'));});
  }
  function enable() {
    if(track || articles.length!==2) return;
    if(backgroundScene){
      if(!stage)createStage();
      // Only the visual stage is sticky. The original sections and links stay
      // in document order, with their own IDs, focus and native anchor behavior.
      stage.setAttribute('aria-hidden','true');
      if(!backgroundContent){
        backgroundContent=document.createElement('div');backgroundContent.className='v2-selected-content';
        articles.forEach(article=>backgroundContent.append(article));root.append(backgroundContent);
      }
      track=backgroundContent;root.insertBefore(stage,track);root.classList.add('is-scene');
      mask();currentChapter=-1;layout();observeContentLayout();return;
    }
    if(stage){
      articles.forEach((article,i)=>{article.id='copy-'+ids[i];stage.insertBefore(article,nav);});
      track=document.createElement('div');track.className='v2-selected-track';track.setAttribute('aria-hidden','true');
      ids.forEach(id=>{const step=document.createElement('div');step.id=id;step.className='v2-selected-step';track.append(step);});
      root.append(stage,track);root.classList.add('is-scene');mask();currentChapter=-1;chapter(0);layout();return;
    }
    createStage();
    articles.forEach((article,i)=>{article.id='copy-'+ids[i];stage.append(article);});
    nav=document.createElement('nav');nav.className='v2-selected-nav';nav.setAttribute('aria-label','Selected Work chapters');
    ['Framework cards','Transit displays'].forEach((text,i)=>{
      const link=document.createElement('a');link.href='#'+ids[i];link.textContent=text;nav.append(link);
      link.addEventListener('click',()=>{preparationIntent=true;direct=false;previousTime=0;prepareTransfers(true).catch(fail);initialize(true).catch(fail);prepareInBackground();});
      link.addEventListener('focus',()=>{preparationIntent=true;prepareInBackground();});
      link.addEventListener('keydown',event=>{
        const index=event.key==='ArrowRight'?(i+1)%2:event.key==='ArrowLeft'?(i+1)%2:event.key==='Home'?0:event.key==='End'?1:null;
        if(index!==null){event.preventDefault();links[index].focus();}
      });
    });
    links=[...nav.children];stage.append(nav);
    const skipScene=document.createElement('a');skipScene.className='v2-selected-skip';skipScene.href='#skylabs-aircraft';skipScene.textContent='Skip';skipScene.setAttribute('aria-label','Skip Selected Work animation');stage.append(skipScene);
    const progressElement=document.createElement('div');progressElement.className='v2-selected-progress';progressElement.setAttribute('aria-hidden','true');
    bar=document.createElement('span');progressElement.append(bar);stage.append(progressElement);
    track=document.createElement('div');track.className='v2-selected-track';track.setAttribute('aria-hidden','true');
    ids.forEach(id=>{const step=document.createElement('div');step.id=id;step.className='v2-selected-step';track.append(step);});
    root.append(stage,track);root.classList.add('is-scene');inspectionControls();mask();chapter(0);layout();
    if(ids.includes(location.hash.slice(1))) requestAnimationFrame(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView({behavior:'instant'}));
  }
  function dispose() {
    if(!scene)return;
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of [].concat(object.material||[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());environment?.dispose();renderer?.dispose();
  }
  function invalidate() {
    generation++;needsDrain=true;gpuAbort?.abort();gpuAbort=undefined;
  }
  function fallback(state='static') {
    inspectionState(-1,'overview',true);invalidate();cancelAnimationFrame(frame);frame=0;previousTime=0;mask();
    const restore=!backgroundScene&&track&&visible&&currentChapter>=0?currentChapter:-1;
    root.classList.remove('is-scene','is-live');
    // Leave the ordinary content wrapper in place in background mode. Moving
    // a focused link's ancestor during a preference change would blur it.
    if(!backgroundScene)articles.forEach((article,i)=>{article.id=ids[i];article.inert=false;article.removeAttribute('aria-hidden');article.classList.remove('is-current');root.append(article);});
    contentObserver?.disconnect();stage?.remove();if(!backgroundScene)track?.remove();track=null;publishPriority();
    root.dataset.selectedState=state;settleBackground({state,at:performance.now()});
    if(restore>=0)articles[restore].scrollIntoView({behavior:'instant',block:'start'});
  }
  function fail(error) {
    if(failed)return;failed=true;root.dataset.selectedError=error?.message||'Unavailable';fallback('unavailable');dispose();
  }
  function updateScroll() {
    if(!track)return;
    const b=root.getBoundingClientRect(),pinned=parseFloat(getComputedStyle(stage).top)||0;
    const readable=backgroundScene?stage.getBoundingClientRect():b;
    const nextVisible=readable.top<innerHeight&&readable.bottom>pinned;
    const entered=nextVisible&&!visible,left=!nextVisible&&visible;visible=nextVisible;publishPriority();
    const wasNear=preparationNear;preparationNear=b.top<innerHeight*2&&b.bottom>-innerHeight;
    if(!preparationNear&&!visible){preparationIntent=false;if(wasNear&&(backgroundBusy||initialization))invalidate();}
    root.dataset.selectedPreparationEligible=String(preparationEligible());
    // Both content modes keep a stable flow origin while the visual is sticky.
    top=scrollY+track.getBoundingClientRect().top;
    const next=clamp((scrollY-top+pinned)/distance);
    const smoother=window.V2ScrollSmoothing;
    const jumped=Math.abs(next-progress)>(smoother?.jump||.18);
    if(!visible||direct||jumped)current=next;
    if(next!==progress)poseRevision++;
    progress=next;if(!visible)inspectionState(-1,'overview',true);else if(progress>=.34)inspectionState();
    root.dataset.selectedProgress=progress.toFixed(6);root.dataset.selectedPoseRevision=String(poseRevision);inspectionAvailability();
    if(entered||left||jumped){invalidate();mask();if(entered&&!backgroundDone)root.dataset.selectedBackgroundState='promoted';}
    if(!root.classList.contains('is-live')){chapter(progress<.57?0:1);if(bar)bar.style.transform=`scaleX(${progress})`;}
    if(visible){prepareTransfers(true).catch(fail);initialize(true).catch(fail);prepareInBackground();request();}
    else {cancelAnimationFrame(frame);frame=0;previousTime=0;current=progress;prepareInBackground();}
  }
  function refreshContentLayout(){
    if(!backgroundScene||!track||!activePage||document.hidden||!allowed())return false;
    const nextWidth=stage.clientWidth,nextHeight=stage.clientHeight;
    const nextDPR=Math.min(devicePixelRatio||1,nextWidth<=760?1.25:1.5);
    const nextTop=scrollY+track.getBoundingClientRect().top;
    // ResizeObserver batches reflow notifications. Ignore unchanged geometry
    // (including the initial observation) rather than scheduling another frame.
    if(width===nextWidth&&height===nextHeight&&layoutDPR===nextDPR&&contentExtent===track.offsetHeight&&Math.abs(top-nextTop)<.5)return false;
    layout();return true;
  }
  function observeContentLayout(){
    if(!window.ResizeObserver)return;
    contentObserver ||= new window.ResizeObserver(refreshContentLayout);
    contentObserver.observe(track);contentObserver.observe(stage);contentObserver.observe(root);
  }
  function layout() {
    if(!track)return;
    const nextWidth=stage.clientWidth,nextHeight=stage.clientHeight;
    const nextDPR=Math.min(devicePixelRatio||1,nextWidth<=760?1.25:1.5);
    const nextExtent=backgroundScene?track.offsetHeight:0;
    const flowChanged=backgroundScene&&(contentExtent!==nextExtent||Math.abs(top-(scrollY+track.getBoundingClientRect().top))>=.5);
    const sizeChanged=width!==nextWidth||height!==nextHeight,dprChanged=layoutDPR!==nextDPR;
    if(sizeChanged||dprChanged||flowChanged){invalidate();mask();poseRevision++;}
    width=nextWidth;height=nextHeight;layoutDPR=nextDPR;contentExtent=nextExtent;
    if(backgroundScene)distance=Math.max(1,contentExtent-height);
    else{
      distance=height*(width<=760?1.9:1.7);
      track.style.height=`${distance+height}px`;track.style.marginTop=`${-height}px`;
      const padding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
      const pinned=parseFloat(getComputedStyle(stage).top)||0;
      [...track.children].forEach((step,i)=>step.style.top=`${i*distance+padding-pinned}px`);
    }
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
    const pose=composition.frame(camera,value,width,height,warm||backgroundScene?undefined:inspection);fitLight(pose);
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
      stepInspection(time);
      const value=capturePose??current,revision=poseRevision,rawAtSubmit=progress,submittedMs=performance.now();
      const pose=draw(value),hitBounds=inspectionBounds();
      report={sequence:++submittedFrames,submittedMs,value,rawAtSubmit,direct,revision,inspectionWeights:[...inspection.weights],inspectionTarget:inspectTarget,inspectionMode:inspectMode,inspectionRevision:inspectRevision,hitBounds,masked:root.dataset.selectedWarmMask==='true',published:false,measurement:pose.measurement};
      root.dataset.selectedSubmittedFrames=String(submittedFrames);
      // There is at most one outstanding live Selected frame. While it is in
      // flight native input stays responsive; the next frame samples the latest
      // target rather than replaying old wheel steps into a growing GPU queue.
      if(!await gpuComplete(valid,true))return;
      if(lastGPUResult.state==='complete')root.dataset.selectedCompletedFrames=String(++completedFrames);
      if((direct&&revision!==poseRevision)||(root.dataset.selectedWarmMask==='true'&&(Math.abs(value-progress)>.00008||report.inspectionRevision!==inspectRevision)))return;
      chapter(pose.chapter);canvas.style.visibility='';root.classList.add('is-live');root.dataset.selectedWarmMask='false';root.dataset.selectedState='ready';
      publishInspection(report);report.published=true;presentedRevision=revision;root.dataset.selectedPresentedRevision=String(revision);
      root.dataset.selectedFrames=String(++frames);root.dataset.selectedRenderedProgress=value.toFixed(6);if(bar)bar.style.transform=`scaleX(${value})`;
      root.dataset.selectedFirstLiveMs ||= performance.now().toFixed(1);
      if(capturePose!==undefined||current===progress)previousTime=0;if(!inspectionMoving())inspectTime=0;
    }catch(error){fail(error);}
    finally{
      if(report)root.dataset.selectedLastFrame=JSON.stringify({...report,observedMs:performance.now(),completedMs:lastGPUResult?.state==='complete'?performance.now():null,rawAtComplete:progress,gpu:lastGPUResult});
      liveBusy=false;if(!failed&&backgroundDone&&capturePose===undefined&&(needsDrain||presentedRevision!==poseRevision||current!==progress||inspectionMoving()||root.dataset.selectedWarmMask==='true'))request();
    }
  }
  function prepareSources() {
    return sourceTask ||= Promise.all([
      window.THREE?Promise.resolve():script('/assets/vendor/three.min.js'),
      window.V2HeroAssets?Promise.resolve():script('/assets/v2-hero-assets.js?v=load-20261012'),
      window.V2HeroEnvironment?Promise.resolve():script('/assets/v2-hero-environment.js?v=load-20261012'),
      script('/assets/v2-selected-assets.js?v=load-20261012'),
      script('/assets/v2-selected-scene.js?v=review-20261012'),
      script('/assets/v2-gpu-preparation.js?v=paced-20261011')
    ]).then(()=>{if(allowed()&&!failed){
      window.V2HeroEnvironment.prefetch().catch(()=>{});
      const waiting=window.V2TransportPriority?.wait('selected');
      if(waiting)waiting.then(()=>{if(allowed()&&!failed)window.V2SelectedAssets.prefetchTextures().catch(()=>{});});
      else window.V2SelectedAssets.prefetchTextures().catch(()=>{});
    }});
  }
  async function prepareTransfers(promote=false) {
    // Proximity may reconstruct a background scene after the foreground is
    // settled; it is never an instruction to bypass the hero raw-byte gate.
    if(backgroundScene)promote=Boolean(promote&&(visible||preparationIntent));
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
  async function initialize(promote=false) {
    if(backgroundScene)promote=Boolean(promote&&(visible||preparationIntent));
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
          if(name==='pi'||name==='tramtrace')window.V2ProductStudio.applyMaterials(assembly,name);
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
      composition=window.V2SelectedScene.create(T,assemblies);scene.add(composition.group);
      const floor=new T.Mesh(new T.PlaneGeometry(160,160),new T.ShadowMaterial({color:0x000000,opacity:.35,transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
      root.dataset.selectedModelStatistics=JSON.stringify(composition.stats());root.dataset.selectedSceneReady='true';
      ready=true;root.dataset.selectedState='prepared';layout();request();
      if(new URLSearchParams(location.search).has('selectedCapture'))window.__v2Selected={renderer,scene,camera,assemblies,composition,
        seekProgress(value){capturePose=clamp(value);current=capturePose;const pose=draw(capturePose);chapter(pose.chapter);canvas.style.visibility='';root.classList.add('is-live');root.dataset.selectedWarmMask='false';root.dataset.selectedRenderedProgress=capturePose.toFixed(6);if(bar)bar.style.transform=`scaleX(${capturePose})`;},
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
    if(!preparationEligible()){root.dataset.selectedBackgroundState=preparationNear&&!foregroundAvailable()?'deferred-foreground':'deferred-distance';return;}
    if(backgroundBusy||liveBusy)return;
    backgroundBusy=true;mask();const token=generation;
    const valid=()=>token===generation&&!document.hidden&&activePage&&allowed()&&!failed&&track&&!aircraftHasPriority()&&preparationEligible();
    root.dataset.selectedBackgroundState=visible?'promoted':'warming';root.dataset.selectedBackgroundStartedMs ||= performance.now().toFixed(1);
    try{
      await prepareSources();prepareTransfers(visible||(backgroundScene&&preparationIntent)).catch(fail);
      await idleTurn();if(!valid())return;
      await initialize(visible);if(!valid()||!ready)return;
      if(needsDrain){if(!await gpuComplete(valid,false,true))return;needsDrain=false;}
      while(preparedModels.size<names.length){
        await idleTurn();if(!valid())return;
        const order=progress<.57?names:['metro','tramtrace','esp32','dual','pi','logic'];
        const name=order.find(name=>!preparedModels.has(name));
        const visibility=names.map(name=>assemblies[name].group.visible);
        root.dataset.selectedPreparationStage=name;let measurement;
        try{
          names.forEach(other=>{assemblies[other].group.visible=other===name;});
          measurement=draw(name==='metro'||name==='tramtrace'?1:0,true,64).measurement;
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
    prepareSources().then(()=>prepareTransfers(backgroundScene?visible||preparationIntent:near())).catch(fail);
    if(near())initialize(!backgroundScene||visible||preparationIntent);else{root.dataset.selectedState=ready?'prepared':'waiting';prepareInBackground();}
  }
  addEventListener('v2:hero-foreground',()=>{
    if(backgroundDone||visible)return;
    if(!foregroundAvailable()){invalidate();mask();root.dataset.selectedBackgroundState='deferred-foreground';}
    else prepareInBackground();
  });
  addEventListener('v2:aircraft-priority',()=>{
    if(backgroundDone)return;
    if(aircraftHasPriority()){invalidate();mask();root.dataset.selectedBackgroundState='paused-aircraft';}
    else prepareInBackground();
  });
  root.addEventListener('wheel',()=>{direct=false;},{passive:true});root.addEventListener('touchmove',()=>{direct=true;},{passive:true});
  addEventListener('scroll',updateScroll,{passive:true});addEventListener('resize',()=>{if(allowed()){start();layout();}else fallback();},{passive:true});
  addEventListener('hashchange',()=>{if(ids.includes(location.hash.slice(1)))preparationIntent=true;previousTime=0;current=progress;updateScroll();prepareInBackground();});
  document.addEventListener('visibilitychange',()=>{invalidate();publishPriority();previousTime=0;current=progress;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{if(!refreshContentLayout())updateScroll();prepareInBackground();}});
  addEventListener('pagehide',()=>{activePage=false;invalidate();publishPriority();cancelAnimationFrame(frame);frame=0;previousTime=0;});
  addEventListener('pageshow',()=>{activePage=true;previousTime=0;if(!refreshContentLayout())updateScroll();prepareInBackground();});
  reduced.addEventListener?.('change',start);short.addEventListener?.('change',start);navigator.connection?.addEventListener?.('change',start);
  root.dataset.selectedFrames='0';root.dataset.selectedSubmittedFrames='0';root.dataset.selectedCompletedFrames='0';root.dataset.selectedWarmFrames='0';root.dataset.selectedPreparationFrames='0';root.dataset.selectedWarmPosesCompleted='0';root.dataset.selectedModelsReady='0';
  start();
})();
