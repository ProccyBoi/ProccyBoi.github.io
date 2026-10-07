/* One assembly action, physical part picking, reversible CAD motion. */
(() => {
  'use strict';
  const scripts=new Map();
  const script=url=>{
    if(!scripts.has(url))scripts.set(url,new Promise((resolve,reject)=>{
      const node=document.createElement('script');node.src=url;node.onload=resolve;
      node.onerror=()=>{scripts.delete(url);node.remove();reject(new Error('Library unavailable'));};document.head.append(node);
    }));return scripts.get(url);
  };
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  document.querySelectorAll('[data-hardware]').forEach(root=>{
    const canvas=root.querySelector('[data-hardware-canvas]'),stage=root.querySelector('[data-hardware-stage]');
    const poster=root.querySelector('[data-hardware-poster]'),readout=root.querySelector('[data-hardware-part]');
    const start=root.querySelector('[data-hardware-start]'),status=root.querySelector('[data-hardware-status]');
    const explode=root.querySelector('[data-hardware-explode]'),boardLinks=[...root.querySelectorAll('[data-hardware-board]')];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'),capture=root.hasAttribute('data-hardware-capture');
    const labels=JSON.parse(root.querySelector('[data-hardware-labels]')?.textContent||'{}');
    let renderer,scene,camera,model,environment,raycaster,pointer,frame=0,frames=0,ready=false,loading=false,visible=true,generation=0;
    let current=0,target=0,rotation={x:1.03,y:-.16,z:-.26},zoom=1,drag,pendingPick,hoverPick,selected='',lastTime=0;
    let pickables=[],partByMesh=new Map(),keyboardParts=[],keyboardIndex=-1;
    const abort=new AbortController(),listen=(node,event,callback,options={})=>node?.addEventListener(event,callback,{...options,signal:abort.signal});
    const showStatus=text=>{status.textContent=text;};
    const startWrap=start.closest('.hardware-start')||start,showRetry=show=>{start.hidden=!show;startWrap.hidden=!show;};
    root.dataset.hardwareState='poster';root.dataset.hardwareMounted='true';showRetry(false);
    const identify=ref=>root.dispatchEvent(new CustomEvent('v2:component-identify',{bubbles:true,detail:{model:root.dataset.hardware,ref,panel:readout}}));
    const clearPart=()=>{selected='';pendingPick=null;readout.hidden=true;readout.textContent='';root.dataset.hardwareSelection='';identify('');};
    const showPart=(ref,value)=>{
      if(selected===ref)return;selected=ref;root.dataset.hardwareSelection=ref;
      const name=labels[root.dataset.hardwareBoardKey]?.[ref]||value;
      readout.textContent=name&&name!==ref?`${ref} · ${name}`:ref;readout.hidden=false;
      identify(ref);
    };
    const pickPart=pick=>{
      if(!ready)return;const bounds=canvas.getBoundingClientRect();
      pointer.set((pick.x-bounds.left)/bounds.width*2-1,-((pick.y-bounds.top)/bounds.height)*2+1);
      camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
      const hit=raycaster.intersectObjects(pickables,false)[0],part=hit&&partByMesh.get(hit.object);
      if(!part){clearPart();return;}
      let ref=part.ref,value=part.value;
      const centers=part.object.userData.componentCenters;
      if(centers?.length){
        const local=part.object.worldToLocal(hit.point.clone());
        const nearest=centers.reduce((best,item)=>{const distance=local.distanceToSquared(new window.THREE.Vector3(...item.position));return !best||distance<best.distance?{item,distance}:best;},null).item;
        ref=nearest.ref;value=nearest.value;
      }
      if(pick.toggle&&selected===ref)clearPart();else showPart(ref,value);
    };
    function render(time){
      frame=0;if(!ready||!visible||document.hidden)return;
      const dt=lastTime?Math.min(64,time-lastTime):16;lastTime=time;
      current=reduced.matches?target:current+(target-current)*(1-Math.exp(-dt/115));if(Math.abs(target-current)<.0005)current=target;
      model.group.rotation.set(rotation.x,rotation.y,rotation.z);window.V2CadGeometry.applyMotion(model.parts,current);model.group.updateMatrixWorld(true);
      if(!drag){const pick=pendingPick||hoverPick;pendingPick=null;if(pick)pickPart(pick);}
      renderer.render(scene,camera);poster.hidden=true;root.dataset.hardwareFrames=String(++frames);
      root.dataset.hardwareProgress=current.toFixed(4);root.dataset.hardwareDraws=String(renderer.info.render.calls);root.dataset.hardwareMotion=current===target?'idle':'transition';
      if(current!==target)request();
    }
    function request(){if(ready&&visible&&!document.hidden&&!frame){root.dataset.hardwareMotion=current===target?'rendering':'transition';frame=requestAnimationFrame(render);}}
    const setPhase=value=>{target=clamp(value);clearPart();if(ready&&current!==target)root.dataset.hardwareMotion='transition';explode.textContent=target>.5?'Assemble':'Disassemble';explode.setAttribute('aria-pressed',String(target>.5));request();};
    const frameCamera=()=>{
      const T=window.THREE,aspect=stage.clientWidth/Math.max(1,stage.clientHeight),bounds=new T.Box3();
      model.group.rotation.set(rotation.x,rotation.y,rotation.z);
      // Reserve the complete motion envelope once when framing. The camera
      // remains steady while components travel, including tall edge connectors.
      for(const phase of [0,.25,.5,.75,1]){window.V2CadGeometry.applyMotion(model.parts,phase);model.group.updateMatrixWorld(true);bounds.union(new T.Box3().setFromObject(model.group));}
      window.V2CadGeometry.applyMotion(model.parts,current);model.group.updateMatrixWorld(true);
      const extentX=Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),extentY=Math.max(Math.abs(bounds.min.y),Math.abs(bounds.max.y));
      const half=Math.max(.77,model.span*.7,extentX*1.12/Math.max(1,aspect),extentY*1.12/Math.max(1,1/aspect))/zoom;
      camera.left=-half*Math.max(1,aspect);camera.right=-camera.left;camera.top=half*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();
      root.dataset.hardwareCameraHalf=String(half);
    };
    const layout=()=>{if(!renderer||!ready)return;renderer.setSize(stage.clientWidth,stage.clientHeight,false);frameCamera();request();};
    const releaseGroup=group=>group?.traverse(object=>{object.geometry?.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>{material?.map?.dispose();material?.dispose();});});
    const releaseModel=()=>{
      generation++;ready=false;loading=false;cancelAnimationFrame(frame);frame=0;
      if(model){scene.remove(model.group);releaseGroup(model.group);model=null;}pickables=[];partByMesh.clear();keyboardParts=[];hoverPick=null;clearPart();
    };
    const dispose=()=>{releaseModel();releaseGroup(scene);environment?.dispose();renderer?.dispose();scene=null;renderer=null;environment=null;};
    const unavailable=()=>{
      dispose();root.dataset.hardwareState='unavailable';canvas.hidden=true;poster.hidden=false;
      start.disabled=false;start.textContent='Retry 3D';showRetry(true);showStatus('The 3D view could not load. The board preview and project details remain available.');
    };
    const initialize=async()=>{
      if(loading||ready)return;loading=true;start.disabled=true;showRetry(false);showStatus('Loading assembly…');root.dataset.hardwareState='loading';const token=++generation;
      try{
        if(!window.THREE)await script('/assets/vendor/three.min.js');if(!window.THREE.GLTFLoader)await script('/assets/vendor/GLTFLoader.js');
        if(!window.V2CadGeometry)await script('/assets/v2-assembly-models.js?v=mechanics-20261003');if(!window.V2HardwareModels)await script('/assets/v2-hardware-models.js?v=mechanics-20261003');
        if(token!==generation)return;const T=window.THREE;
        if(!renderer){
          renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:capture});
          renderer.setPixelRatio(capture?1:Math.min(devicePixelRatio||1,1.75));renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
          scene=new T.Scene();camera=new T.OrthographicCamera(-1,1,1,-1,.1,50);camera.position.set(0,0,8);camera.lookAt(0,0,0);raycaster=new T.Raycaster();pointer=new T.Vector2();
          scene.add(new T.HemisphereLight(0xffffff,0xb6c0c2,.72));
          [[0xfff5e6,1.35,-4,7,8],[0xdaeaff,.7,5,2,4],[0xffffff,.45,-5,-4,3]].forEach(([colour,power,x,y,z],index)=>{const light=new T.DirectionalLight(colour,power);light.position.set(x,y,z);if(index===0){light.castShadow=true;light.shadow.mapSize.set(1536,1536);Object.assign(light.shadow.camera,{left:-1.4,right:1.4,top:1.4,bottom:-1.4,near:.1,far:25});light.shadow.bias=-.00015;light.shadow.normalBias=.001;}scene.add(light);});
          const studio=new T.Scene();studio.background=new T.Color(0xb5bfc1);const material=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide});material.color.multiplyScalar(3);
          const panel=new T.Mesh(new T.PlaneGeometry(8,12),material);panel.position.set(-6,5,2);panel.rotation.y=Math.PI/2;studio.add(panel);
          const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(studio,.06);scene.environment=environment.texture;pmrem.dispose();panel.geometry.dispose();material.dispose();
        }
        const loaded=await window.V2HardwareModels.load(root.dataset.hardware);if(token!==generation){releaseGroup(loaded.group);return;}
        model=loaded;window.V2CadGeometry.prepareMotion(model.parts);scene.add(model.group);renderer.shadowMap.enabled=model.parts.length<80;renderer.shadowMap.type=T.PCFSoftShadowMap;
        partByMesh=new Map();model.parts.forEach(part=>part.object.traverse(object=>{if(object.isMesh)partByMesh.set(object,part);}));
        keyboardParts=model.parts.flatMap(part=>part.object.userData.componentCenters||[{ref:part.ref,value:part.value}]);
        // Board surfaces occlude parts on the far side instead of picking
        // through the physical PCB.
        pickables=[];model.group.traverse(object=>{if(object.isMesh)pickables.push(object);});
        canvas.hidden=false;canvas.tabIndex=0;canvas.setAttribute('role','img');
        canvas.setAttribute('aria-label',root.dataset.hardwareTitle+'. Drag or use arrow keys to rotate. Hover or tap a part to identify it; use bracket keys to browse parts, Escape to clear, plus or minus to zoom, or Home to reset.');
        ready=true;root.dataset.hardwareState='ready';root.dataset.hardwareComponents=String(model.parts.length);showStatus('');explode.disabled=!model.parts.length;layout();request();
      }catch(error){if(token===generation){console.warn('Assembly view unavailable.',error);unavailable();}}finally{if(token===generation)loading=false;}
    };
    const reset=()=>{rotation={x:1.03,y:-.16,z:-.26};zoom=1;keyboardIndex=-1;setPhase(0);layout();};
    const showBoard=link=>{
      const load=ready||loading;if(load)releaseModel();current=0;target=0;drag=null;zoom=1;rotation={x:1.03,y:-.16,z:-.26};keyboardIndex=-1;setPhase(0);lastTime=0;
      root.dataset.hardware=link.dataset.hardwareModel;root.dataset.hardwareTitle=link.dataset.hardwareTitle;root.dataset.hardwareBoardKey=link.dataset.hardwareBoard;root.dataset.hardwareState='poster';
      canvas.hidden=true;start.disabled=false;showRetry(false);poster.src=link.dataset.hardwarePosterSrc;poster.alt=link.dataset.hardwareTitle;poster.hidden=false;showStatus('');
      boardLinks.forEach(item=>item===link?item.setAttribute('aria-current','true'):item.removeAttribute('aria-current'));if(load)initialize();
    };
    boardLinks.forEach(link=>listen(link,'click',event=>{
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||root.dataset.hardwareState==='unavailable')return;
      event.preventDefault();if(link.dataset.hardwareBoard!==root.dataset.hardwareBoardKey)showBoard(link);
      const url=new URL(location.href);link.dataset.hardwareBoard==='telemetry'?url.searchParams.delete('board'):url.searchParams.set('board',link.dataset.hardwareBoard);
      url.searchParams.delete('view');url.searchParams.delete('explode');history.replaceState(null,'',url);
    }));
    if(boardLinks.length){const requested=new URLSearchParams(location.search).get('board')||root.dataset.hardwareBoardKey;showBoard(boardLinks.find(link=>link.dataset.hardwareBoard===requested)||boardLinks[0]);}
    listen(start,'click',initialize);listen(explode,'click',()=>setPhase(target>.5?0:1));
    listen(canvas,'pointerdown',event=>{if(event.button!==0||!ready)return;drag={x:event.clientX,y:event.clientY,rx:rotation.x,ry:rotation.y,moved:false};canvas.setPointerCapture(event.pointerId);});
    listen(canvas,'pointermove',event=>{
      if(!ready)return;
      if(drag){if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6)drag.moved=true;if(drag.moved){hoverPick=null;clearPart();rotation.x=drag.rx+(event.clientY-drag.y)*.006;rotation.y=drag.ry+(event.clientX-drag.x)*.006;request();}}
      else if(event.pointerType==='mouse'){hoverPick={x:event.clientX,y:event.clientY};pendingPick=hoverPick;request();}
    });
    listen(canvas,'pointerup',event=>{const tap=drag&&!drag.moved;drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(tap){hoverPick=event.pointerType==='mouse'?{x:event.clientX,y:event.clientY}:null;pendingPick={x:event.clientX,y:event.clientY,toggle:event.pointerType!=='mouse'};request();}});
    listen(canvas,'pointercancel',()=>{drag=null;hoverPick=null;clearPart();});listen(canvas,'pointerleave',event=>{if(event.pointerType==='mouse'&&!drag){hoverPick=null;clearPart();}});
    listen(canvas,'keydown',event=>{
      if(!ready)return;const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','+','=','-','[',']','Escape'];if(!keys.includes(event.key))return;event.preventDefault();hoverPick=null;pendingPick=null;
      if(event.key==='Home'){reset();return;}if(event.key==='Escape'){clearPart();return;}
      if(event.key==='['||event.key===']'){if(!keyboardParts.length)return;keyboardIndex=(keyboardIndex+(event.key===']'?1:-1)+keyboardParts.length)%keyboardParts.length;const part=keyboardParts[keyboardIndex];showPart(part.ref,part.value);return;}
      clearPart();if(event.key==='ArrowLeft')rotation.y-=.15;if(event.key==='ArrowRight')rotation.y+=.15;if(event.key==='ArrowUp')rotation.x-=.15;if(event.key==='ArrowDown')rotation.x+=.15;
      if(event.key==='+'||event.key==='=')zoom=clamp(zoom+.1,.6,1.5);if(event.key==='-')zoom=clamp(zoom-.1,.6,1.5);layout();
    });
    listen(canvas,'webglcontextlost',event=>{event.preventDefault();unavailable();});
    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible){lastTime=0;request();}else{cancelAnimationFrame(frame);frame=0;hoverPick=null;clearPart();root.dataset.hardwareMotion='paused';}});observer.observe(stage);
      const preload=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){preload.disconnect();initialize();}},{rootMargin:'400px 0px'});preload.observe(stage);
    }else initialize();
    new ResizeObserver(layout).observe(stage);
    listen(document,'visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;hoverPick=null;clearPart();}else{lastTime=0;request();}});
    listen(reduced,'change',request);listen(window,'pagehide',()=>{cancelAnimationFrame(frame);frame=0;hoverPick=null;clearPart();});listen(window,'pageshow',()=>{lastTime=0;request();});if(capture)initialize();
  });
})();
