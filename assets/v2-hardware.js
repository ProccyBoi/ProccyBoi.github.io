/* Shared source-CAD inspector. Model transforms are reconstructed from one
   assembly value so pointer, keyboard and scroll can reverse the same motion. */
(() => {
  'use strict';
  const scripts = new Map();
  const script = url => {
    if (!scripts.has(url)) scripts.set(url, new Promise((resolve,reject) => {
      const node=document.createElement('script'); node.src=url;
      node.onload=resolve; node.onerror=()=>{scripts.delete(url);node.remove();reject(new Error('Library unavailable'));};
      document.head.append(node);
    }));
    return scripts.get(url);
  };
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));


  document.querySelectorAll('[data-hardware]').forEach(root=>{
    const canvas=root.querySelector('[data-hardware-canvas]'),stage=root.querySelector('[data-hardware-stage]');
    const start=root.querySelector('[data-hardware-start]'),status=root.querySelector('[data-hardware-status]');
    const range=root.querySelector('[data-hardware-range]'),explode=root.querySelector('[data-hardware-explode]');
    const boardLinks=[...root.querySelectorAll('[data-hardware-board]')];
    const componentPanels=[...root.querySelectorAll('[data-hardware-components]')];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const capture=root.hasAttribute('data-hardware-capture');
    let renderer,scene,camera,model,environment,frame=0,frames=0,ready=false,loading=false,visible=true,generation=0;
    let current=0,target=0,rotation={x:1.03,y:-.16,z:-.26},zoom=1,selected=[],selectionIntent=[],drag;
    let scrollEnabled=false,lastTime=0;
    const abort=new AbortController(),listen=(node,event,callback,options={})=>node.addEventListener(event,callback,{...options,signal:abort.signal});
    const showStatus=text=>{status.textContent=text;};
    root.dataset.hardwareState='poster';root.dataset.hardwareMounted='true';
    const setSelection=(refs,syncDetails=false)=>{
      selectionIntent=(Array.isArray(refs)?refs:String(refs).split(' ')).filter(Boolean);
      if(!ready)return;
      selected=selectionIntent.filter(ref=>model.parts.some(item=>item.ref===ref));
      const part=model.parts.find(item=>item.ref===selected[0]);
      root.querySelector('[data-hardware-selection]').value=selected[0]||'';
      const detail=root.querySelector('[data-hardware-part]');
      const description=componentPanels.filter(panel=>!panel.hidden).flatMap(panel=>[...panel.querySelectorAll('[data-hardware-component]')]).find(item=>item.dataset.hardwareRefs.split(' ').some(ref=>selected.includes(ref)));
      if(syncDetails)componentPanels.forEach(panel=>panel.querySelectorAll('details').forEach(item=>{item.open=item===description;}));
      detail.textContent=part?`${selected.join(' / ')} · ${description?.querySelector('strong')?.textContent||part.value}${description?' — '+description.querySelector('p').textContent:''}`:'';detail.hidden=!part;
      root.dataset.hardwareSelection=selected.join(' ');
      request();
    };
    function render(time){
      frame=0;if(!ready||!visible||document.hidden)return;
      const dt=lastTime?Math.min(64,time-lastTime):16;lastTime=time;
      current=reduced.matches?target:current+(target-current)*(1-Math.exp(-dt/90));
      if(Math.abs(target-current)<.0005)current=target;
      model.group.rotation.set(rotation.x,rotation.y,rotation.z);
      for(const part of model.parts){
        part.object.position.copy(part.base).addScaledVector(part.offset,current);
      }
      model.group.updateMatrixWorld(true);
      const box=scene.getObjectByName('selection-outline');
      box.visible=Boolean(selected.length);box.box.makeEmpty();
      for(const ref of selected){const part=model.parts.find(item=>item.ref===ref);if(part)box.box.expandByObject(part.object);}
      renderer.render(scene,camera);root.dataset.hardwareFrames=String(++frames);
      root.dataset.hardwareProgress=current.toFixed(4);root.dataset.hardwareDraws=String(renderer.info.render.calls);
      root.dataset.hardwareMotion=current===target?'idle':'transition';
      if(current!==target)request();
    }
    function request(){if(ready&&visible&&!document.hidden&&!frame){root.dataset.hardwareMotion=current===target?'rendering':'transition';frame=requestAnimationFrame(render);}}
    const setPhase=value=>{
      target=clamp(value);range.value=String(Math.round(target*100));
      if(ready&&current!==target)root.dataset.hardwareMotion='transition';
      explode.textContent=target>.5?'Assemble':'Explode';explode.setAttribute('aria-pressed',String(target>.5));request();
    };
    const frameCamera=()=>{
      const width=stage.clientWidth,height=stage.clientHeight,aspect=width/Math.max(1,height);
      const half=Math.max(.77,model.span*.7)/zoom;
      camera.left=-half*Math.max(1,aspect);camera.right=-camera.left;
      camera.top=half*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();
    };
    const layout=()=>{
      if(!renderer||!ready)return;
      renderer.setSize(stage.clientWidth,stage.clientHeight,false);frameCamera();request();
    };
    const releaseGroup=group=>group?.traverse(object=>{object.geometry?.dispose();const list=Array.isArray(object.material)?object.material:[object.material];list.forEach(material=>{material?.map?.dispose();material?.dispose();});});
    const releaseModel=()=>{
      generation++;
      ready=false;loading=false;cancelAnimationFrame(frame);frame=0;
      if(model){scene.remove(model.group);releaseGroup(model.group);model=null;}
      const outline=scene?.getObjectByName('selection-outline');
      if(outline){scene.remove(outline);releaseGroup(outline);}
    };
    const dispose=()=>{
      releaseModel();
      releaseGroup(scene);
      environment?.dispose();renderer?.dispose();
      scene=null;renderer=null;environment=null;model=null;
    };
    const unavailable=()=>{
      dispose();root.dataset.hardwareState='unavailable';canvas.hidden=true;
      root.querySelector('[data-hardware-poster]').hidden=false;start.disabled=true;
      showStatus('The 3D view is unavailable. You can still view the board and project details.');
    };
    const initialize=async()=>{
      if(loading||ready)return;loading=true;start.disabled=true;showStatus('Loading assembly…');root.dataset.hardwareState='loading';
      const token=++generation;
      try{
        if(!window.THREE)await script('/assets/vendor/three.min.js');
        if(!window.THREE.GLTFLoader)await script('/assets/vendor/GLTFLoader.js');
        if(!window.V2CadGeometry)await script('/assets/v2-assembly-models.js');
        if(!window.V2HardwareModels)await script('/assets/v2-hardware-models.js');
        if(token!==generation)return;
        const T=window.THREE;
        if(!renderer){
        renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:capture});
        renderer.setPixelRatio(capture?1:Math.min(devicePixelRatio||1,1.75));renderer.outputEncoding=T.sRGBEncoding;
        renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
        scene=new T.Scene();camera=new T.OrthographicCamera(-1,1,1,-1,.1,50);camera.position.set(0,0,8);camera.lookAt(0,0,0);
        scene.add(new T.HemisphereLight(0xffffff,0xb6c0c2,.72));
        [[0xfff5e6,1.35,-4,7,8],[0xdaeaff,.7,5,2,4],[0xffffff,.45,-5,-4,3]].forEach(([colour,power,x,y,z],index)=>{const light=new T.DirectionalLight(colour,power);light.position.set(x,y,z);if(index===0){light.castShadow=true;light.shadow.mapSize.set(1536,1536);Object.assign(light.shadow.camera,{left:-1.4,right:1.4,top:1.4,bottom:-1.4,near:.1,far:25});light.shadow.bias=-.00015;light.shadow.normalBias=.001;}scene.add(light);});
        const studio=new T.Scene();studio.background=new T.Color(0xb5bfc1);
        const material=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide});material.color.multiplyScalar(3);
        const panel=new T.Mesh(new T.PlaneGeometry(8,12),material);panel.position.set(-6,5,2);panel.rotation.y=Math.PI/2;studio.add(panel);
        const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(studio,.06);scene.environment=environment.texture;pmrem.dispose();panel.geometry.dispose();material.dispose();
        }
        const loaded=await window.V2HardwareModels.load(root.dataset.hardware);
        if(token!==generation){releaseGroup(loaded.group);return;}
        model=loaded;scene.add(model.group);
        renderer.shadowMap.enabled=model.parts.length<80;renderer.shadowMap.type=T.PCFSoftShadowMap;
        const outline=new T.Box3Helper(new T.Box3(),0x2863da);outline.name='selection-outline';outline.visible=false;scene.add(outline);
        const selection=root.querySelector('[data-hardware-selection]');
        selection.replaceChildren(new Option('All components',''));
        model.parts.slice().sort((a,b)=>a.ref.localeCompare(b.ref,undefined,{numeric:true})).forEach(part=>{const option=document.createElement('option');option.value=part.ref;option.textContent=`${part.ref} · ${part.value}`;selection.append(option);});
        canvas.hidden=false;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',root.dataset.hardwareTitle+'. Drag to rotate; use arrow keys to turn, plus and minus to zoom, or Home to reset.');
        root.querySelector('[data-hardware-poster]').hidden=true;
        ready=true;root.dataset.hardwareState='ready';root.dataset.hardwareComponents=String(model.parts.length);showStatus('');
        setSelection(selectionIntent);
        layout();request();
        if(root.hasAttribute('data-hardware-auto')&&!reduced.matches){scrollEnabled=true;root.querySelector('[data-hardware-scroll]').setAttribute('aria-pressed','true');syncScroll();}
        if(!model.parts.length){explode.disabled=true;range.disabled=true;selection.disabled=true;}
      }catch(error){if(token===generation){console.warn('Assembly view unavailable.',error);unavailable();}}
      finally{if(token===generation)loading=false;}
    };
    const disableScroll=()=>{scrollEnabled=false;root.querySelector('[data-hardware-scroll]').setAttribute('aria-pressed','false');};
    const reset=()=>{disableScroll();rotation={x:1.03,y:-.16,z:-.26};zoom=1;setPhase(0);setSelection('',true);root.querySelectorAll('[data-hardware-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.hardwareView==='iso')));layout();};
    const showBoard=link=>{
      const load=ready||loading;
      if(load)releaseModel();
      current=0;target=0;selected=[];selectionIntent=[];drag=null;zoom=1;rotation={x:1.03,y:-.16,z:-.26};
      disableScroll();setPhase(0);lastTime=0;
      root.dataset.hardware=link.dataset.hardwareModel;
      root.dataset.hardwareTitle=link.dataset.hardwareTitle;
      root.dataset.hardwareBoardKey=link.dataset.hardwareBoard;
      root.dataset.hardwareState='poster';root.dataset.hardwareSelection='';
      canvas.hidden=true;start.disabled=false;
      const poster=root.querySelector('[data-hardware-poster]');
      poster.src=link.dataset.hardwarePosterSrc;poster.alt=link.dataset.hardwareTitle;poster.hidden=false;
      root.querySelector('[data-hardware-part]').hidden=true;showStatus('');
      root.querySelector('[data-hardware-selection]').replaceChildren(new Option('All components',''));
      root.querySelectorAll('[data-hardware-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.hardwareView==='iso')));
      boardLinks.forEach(item=>item===link?item.setAttribute('aria-current','true'):item.removeAttribute('aria-current'));
      componentPanels.forEach(panel=>{panel.hidden=panel.dataset.hardwareComponents!==link.dataset.hardwareBoard;panel.querySelectorAll('details').forEach(item=>{item.open=false;});});
      if(load)initialize();
    };
    boardLinks.forEach(link=>listen(link,'click',event=>{
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||root.dataset.hardwareState==='unavailable')return;
      event.preventDefault();
      if(link.dataset.hardwareBoard!==root.dataset.hardwareBoardKey)showBoard(link);
      const url=new URL(location.href);
      link.dataset.hardwareBoard==='telemetry'?url.searchParams.delete('board'):url.searchParams.set('board',link.dataset.hardwareBoard);
      url.searchParams.delete('view');url.searchParams.delete('explode');history.replaceState(null,'',url);
    }));
    root.querySelectorAll('[data-hardware-component]').forEach(item=>listen(item.querySelector('summary'),'click',()=>{
      if(item.open){setSelection('');return;}
      componentPanels.forEach(panel=>panel.querySelectorAll('details').forEach(other=>{if(other!==item)other.open=false;}));
      setSelection(item.dataset.hardwareRefs.split(' '));
    }));
    if(boardLinks.length){
      const requested=new URLSearchParams(location.search).get('board')||root.dataset.hardwareBoardKey;
      showBoard(boardLinks.find(link=>link.dataset.hardwareBoard===requested)||boardLinks[0]);
    }else componentPanels.forEach(panel=>{panel.hidden=panel.dataset.hardwareComponents!==root.dataset.hardwareBoardKey;});
    listen(start,'click',initialize);
    listen(explode,'click',()=>{disableScroll();setPhase(target>.5?0:1);});
    listen(range,'input',()=>{disableScroll();setPhase(Number(range.value)/100);});
    listen(root.querySelector('[data-hardware-reset]'),'click',reset);
    listen(root.querySelector('[data-hardware-selection]'),'change',event=>setSelection(event.target.value,true));
    root.querySelectorAll('[data-hardware-view]').forEach(button=>listen(button,'click',()=>{
      rotation=button.dataset.hardwareView==='top'?{x:Math.PI/2,y:0,z:0}:button.dataset.hardwareView==='bottom'?{x:-Math.PI/2,y:0,z:0}:{x:1.03,y:-.16,z:-.26};
      root.querySelectorAll('[data-hardware-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));request();
    }));
    const syncScroll=()=>{if(!ready||!scrollEnabled||reduced.matches)return;const bounds=stage.getBoundingClientRect();const progress=clamp((innerHeight-bounds.top)/(innerHeight+bounds.height));setPhase(Math.sin(progress*Math.PI)**2);};
    listen(root.querySelector('[data-hardware-scroll]'),'click',event=>{scrollEnabled=!scrollEnabled;event.currentTarget.setAttribute('aria-pressed',String(scrollEnabled));syncScroll();});
    listen(window,'scroll',syncScroll,{passive:true});
    listen(canvas,'pointerdown',event=>{if(event.button!==0||!ready)return;drag={x:event.clientX,y:event.clientY,rx:rotation.x,ry:rotation.y};canvas.setPointerCapture(event.pointerId);});
    listen(canvas,'pointermove',event=>{if(!drag)return;rotation.x=drag.rx+(event.clientY-drag.y)*.006;rotation.y=drag.ry+(event.clientX-drag.x)*.006;request();});
    listen(canvas,'pointerup',()=>{drag=null;});listen(canvas,'pointercancel',()=>{drag=null;});
    listen(canvas,'keydown',event=>{
      if(!ready)return;
      const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','+','=','-'];if(!keys.includes(event.key))return;event.preventDefault();
      if(event.key==='Home'){reset();return;}
      if(event.key==='ArrowLeft')rotation.y-=.15;if(event.key==='ArrowRight')rotation.y+=.15;if(event.key==='ArrowUp')rotation.x-=.15;if(event.key==='ArrowDown')rotation.x+=.15;
      if(event.key==='+'||event.key==='=')zoom=clamp(zoom+.1,.6,1.5);if(event.key==='-')zoom=clamp(zoom-.1,.6,1.5);layout();
    });
    listen(canvas,'webglcontextlost',event=>{event.preventDefault();unavailable();});
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible){lastTime=0;request();}else{cancelAnimationFrame(frame);frame=0;root.dataset.hardwareMotion='paused';}});observer.observe(stage);
    const resize=new ResizeObserver(layout);resize.observe(stage);
    if(root.hasAttribute('data-hardware-auto')){
      const preload=new IntersectionObserver(([entry])=>{if(entry.isIntersecting&&!reduced.matches&&!navigator.connection?.saveData){preload.disconnect();initialize();}},{rootMargin:'250px 0px'});preload.observe(stage);
    }
    listen(document,'visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{lastTime=0;request();}});
    listen(reduced,'change',()=>{if(reduced.matches)disableScroll();request();});
    listen(window,'pagehide',()=>{cancelAnimationFrame(frame);frame=0;});listen(window,'pageshow',()=>{lastTime=0;request();});
    if(capture)initialize();
  });
})();
