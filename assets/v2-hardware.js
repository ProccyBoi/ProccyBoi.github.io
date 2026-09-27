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
  async function loadProduct(metadata){
    const T=window.THREE,pcb=await loadAssembly(metadata.boardManifest);
    pcb.group.updateMatrixWorld(true);
    const board=window.V2CadGeometry.mergeReference(T,[pcb.group],new T.Vector3(),1,material=>material,'');
    pcb.group.traverse(object=>object.geometry?.dispose());
    const group=new T.Group();group.add(board);
    const parts=[{object:board,base:new T.Vector3(),offset:new T.Vector3(),ref:'PCB',value:'Populated circuit board'}];
    await Promise.all(metadata.parts.map(async part=>{
      const response=await fetch(part.file);if(!response.ok)throw new Error('Mechanical part unavailable');
      const buffer=await response.arrayBuffer(),view=new DataView(buffer),count=view.getUint32(80,true);
      if(84+count*50!==buffer.byteLength)throw new Error('Invalid binary STL');
      const positions=new Float32Array(count*9),normals=new Float32Array(count*9);
      for(let i=0;i<count;i++){
        const start=84+i*50;
        for(let vertex=0;vertex<3;vertex++)for(let axis=0;axis<3;axis++){
          positions[i*9+vertex*3+axis]=view.getFloat32(start+12+vertex*12+axis*4,true);
          normals[i*9+vertex*3+axis]=view.getFloat32(start+axis*4,true);
        }
      }
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('normal',new T.BufferAttribute(normals,3));
      geometry.rotateX(metadata.mechanicalToBoard.rotationX);geometry.translate(...metadata.mechanicalToBoard.translationMm);geometry.scale(1/metadata.unitsMm,1/metadata.unitsMm,1/metadata.unitsMm);
      const colour=new T.Color(...part.colour).convertSRGBToLinear();
      const material=new T.MeshStandardMaterial({color:colour,roughness:part.ref==='lens'?.25:.62,metalness:.02,envMapIntensity:.12,side:T.DoubleSide});
      const mesh=new T.Mesh(geometry,material);mesh.name=part.ref;mesh.userData.partRef=part.ref;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
      parts.push({object:mesh,base:new T.Vector3(),offset:new T.Vector3(0,part.explodeMm/metadata.unitsMm,0),ref:part.ref,value:part.value});
    }));
    group.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());
    return {group,parts,metadata,span:Math.max(size.x,size.y,size.z),centre:bounds.getCenter(new T.Vector3())};
  }
  async function loadAssembly(url) {
    const T=window.THREE;
    const response=await fetch(url); if(!response.ok)throw new Error('Assembly unavailable');
    const metadata=await response.json();
    if(metadata.kind==='kiku-p2')return loadProduct(metadata);
    const source=await new Promise((resolve,reject)=>new T.GLTFLoader().load(metadata.modelUrl,gltf=>resolve(gltf.scene),undefined,reject));
    const [x1,z1,x2,z2]=metadata.boundsMm;
    const units=Math.max(x2-x1,z2-z1);
    if(!(units>0))throw new Error('Invalid assembly bounds');
    source.scale.setScalar(metadata.scaleToMillimetres||1000);
    source.position.set(-(x1+x2)/2,0,-(z1+z2)/2);source.updateMatrixWorld(true);
    const {mergeReference,disposeSource}=window.V2CadGeometry;
    const group=new T.Group(),parts=[],materials=new Map();
    const footprints=new Map(metadata.footprints.map(part=>[part.ref,part]));
    const style=original=>{
      if(materials.has(original.name))return materials.get(original.name);
      const material=original.clone(),roles=metadata.materials||{};
      material.transparent=false;material.opacity=1;material.depthWrite=true;
      if(original.name===roles.mask){material.color.convertSRGBToLinear();material.roughness=.58;material.metalness=.03;material.side=T.DoubleSide;material.transparent=true;material.opacity=original.opacity;}
      else if(original.name===roles.core){material.color.convertSRGBToLinear();material.roughness=.86;material.metalness=0;}
      else if(original.name===roles.pads){material.roughness=.31;material.metalness=.8;}
      else {
        const colour=material.color,brightness=Math.max(colour.r,colour.g,colour.b);
        material.metalness=brightness>.3&&brightness-Math.min(colour.r,colour.g,colour.b)<.15?.65:.03;
        material.roughness=material.metalness>.2?.37:.7;
      }
      material.envMapIntensity=material.metalness>.2?.45:.12;
      materials.set(original.name,material);return material;
    };
    const fixed=[],moving=[];
    const classify=object=>{
      if(footprints.has(object.name)&&!metadata.unpopulated){moving.push(object);return;}
      if(object.isMesh){fixed.push(object);return;}
      object.children.forEach(classify);
    };
    source.children.forEach(classify);
    // Keep board artwork in the GLB when no SVG is available.
    const hiddenMaterial=metadata.silk?.frontUrl?metadata.materials?.silk:'';
    const board=mergeReference(T,fixed,new T.Vector3(),units,style,hiddenMaterial);
    board.name='PCB';group.add(board);
    // Large maps retain each LED placement while moving the repeated bank as
    // one physical layer, avoiding hundreds of separate material draws.
    const ledRoots=moving.filter(object=>/^(LED|D)\d+$/.test(object.name)&&/WS2812|SK6812|RGB|2020/i.test(footprints.get(object.name).value));
    const bank=ledRoots.length>50?new Set(ledRoots):new Set();
    const addPart=(roots,ref,footprint)=>{
      const base=new T.Vector3().setFromMatrixPosition(roots[0].matrixWorld).divideScalar(units);
      const object=mergeReference(T,roots,base,units,style,hiddenMaterial);
      object.name=ref;object.userData.partRef=ref;group.add(object);
      const sign=footprint?.side==='back'?-1:1;
      const lift=/^U\d/.test(ref)?.22:/^(J|P|SW|RV|BT)\d/.test(ref)?.17:.11;
      const offset=new T.Vector3(0,sign*lift,0);
      parts.push({object,base:base.clone(),offset,ref,value:footprint?.value||'RGB pixels'});
    };
    moving.filter(object=>!bank.has(object)).forEach(object=>addPart([object],object.name,footprints.get(object.name)));
    if(bank.size)addPart([...bank],'LED bank',{value:bank.size+' RGB pixels'});
    if(metadata.dimensionedLedFallback){
      // Preserve the existing dimensioned Metroboard package representation
      // where its referenced supplier model is absent. Positions remain CAD-derived.
      const fallback=metadata.dimensionedLedFallback;
      const leds=metadata.footprints.filter(part=>part.value===fallback.value&&!part.modelExported);
      const roots=[],size=2;
      const body=new T.MeshStandardMaterial({color:0xe6e4d7,roughness:.64});
      const windowMaterial=new T.MeshStandardMaterial({color:0xcdbb76,roughness:.48});
      const solder=new T.MeshStandardMaterial({color:0xb8bdc0,metalness:.8,roughness:.33});
      const notch=new T.MeshStandardMaterial({color:0x333536,roughness:.72});
      const box=(parent,dimensions,position,material)=>{const mesh=new T.Mesh(new T.BoxGeometry(...dimensions),material);mesh.position.set(...position);parent.add(mesh);};
      for(const part of leds){
        const root=new T.Group(),[x,z,angle]=part.atMm;
        root.position.set(x-(x1+x2)/2,metadata.thicknessMm,z-(z1+z2)/2);root.rotation.y=angle*Math.PI/180;
        box(root,[size,.72,size],[0,.38,0],body);
        box(root,[size*.56,.035,size*.56],[0,.765,0],windowMaterial);
        for(const px of [-.47,.47])for(const pz of [-.47,.47])box(root,[size*.28,.035,size*.34],[px*size,.055,pz*size],solder);
        box(root,[size*.13,.028,size*.13],[-size*.32,.79,-size*.32],notch);
        root.updateMatrixWorld(true);roots.push(root);
      }
      if(roots.length){
        const base=new T.Vector3(),object=mergeReference(T,roots,base,units,material=>material,null);
        object.name='LED bank';object.userData.partRef='LED bank';group.add(object);
        parts.push({object,base,offset:new T.Vector3(0,.09,0),ref:'LED bank',value:leds.length+' RGB pixels'});
        roots.forEach(root=>root.traverse(mesh=>mesh.geometry?.dispose()));
      }
    }
    if(metadata.connector&&!parts.some(part=>part.ref===metadata.connector.node)){
      const connector=metadata.connector;
      const original=await new Promise((resolve,reject)=>new T.GLTFLoader().load(connector.modelUrl,gltf=>resolve(gltf.scene),undefined,reject));
      const plug=original.getObjectByName(connector.node);if(!plug)throw new Error('Connector geometry missing');
      plug.parent.remove(plug);plug.position.set(...connector.positionBoardLocalMm);plug.rotation.set(...connector.rotationRadians);plug.scale.setScalar(connector.scaleToMillimetres);plug.updateMatrixWorld(true);
      const base=plug.position.clone().divideScalar(units);
      const metal=new T.MeshStandardMaterial({color:0xb6bec0,metalness:.85,roughness:.32,side:T.DoubleSide});
      const object=mergeReference(T,[plug],base,units,style,'',metal);object.name=connector.node;group.add(object);
      parts.push({object,base:base.clone(),offset:new T.Vector3(0,.15,-.2),ref:connector.node,value:'USB-C plug'});disposeSource(plug);disposeSource(original);
    }
    if(metadata.silk?.frontUrl){
      const texture=await new Promise((resolve,reject)=>new T.TextureLoader().load(metadata.silk.frontUrl,resolve,undefined,reject));
      texture.encoding=T.sRGBEncoding;texture.anisotropy=4;
      const geo=new T.PlaneGeometry((x2-x1)/units,(z2-z1)/units);geo.rotateX(-Math.PI/2);
      const mat=new T.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.08,depthWrite:false,roughness:.95,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
      const silk=new T.Mesh(geo,mat);silk.position.y=(metadata.thicknessMm+.025)/units;group.add(silk);
      if(metadata.silk.backUrl){
        const back=await new Promise((resolve,reject)=>new T.TextureLoader().load(metadata.silk.backUrl,resolve,undefined,reject));
        back.encoding=T.sRGBEncoding;back.anisotropy=4;
        const backGeo=geo.clone(),backMat=mat.clone();backMat.map=back;
        const underside=new T.Mesh(backGeo,backMat);underside.position.y=-.025/units;group.add(underside);
      }
    }
    disposeSource(source);group.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());
    return {group,parts,metadata,span:Math.max(size.x,size.y,size.z),centre:bounds.getCenter(new T.Vector3())};
  }
  window.V2HardwareModels=Object.freeze({load:loadAssembly});

  document.querySelectorAll('[data-hardware]').forEach(root=>{
    const canvas=root.querySelector('[data-hardware-canvas]'),stage=root.querySelector('[data-hardware-stage]');
    const start=root.querySelector('[data-hardware-start]'),status=root.querySelector('[data-hardware-status]');
    const range=root.querySelector('[data-hardware-range]'),explode=root.querySelector('[data-hardware-explode]');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const capture=root.hasAttribute('data-hardware-capture');
    let renderer,scene,camera,model,environment,frame=0,frames=0,ready=false,loading=false,visible=true,generation=0;
    let current=0,target=0,rotation={x:1.03,y:-.16,z:-.26},zoom=1,selected='',drag;
    let scrollEnabled=false,lastTime=0;
    const abort=new AbortController(),listen=(node,event,callback,options={})=>node.addEventListener(event,callback,{...options,signal:abort.signal});
    const showStatus=text=>{status.textContent=text;};
    root.dataset.hardwareState='poster';root.dataset.hardwareMounted='true';
    const setSelection=ref=>{
      selected=ref;
      const part=model.parts.find(item=>item.ref===ref);
      root.querySelector('[data-hardware-selection]').value=ref;
      const detail=root.querySelector('[data-hardware-part]');
      detail.textContent=part?`${part.ref} · ${part.value}`:'';detail.hidden=!part;
      root.dataset.hardwareSelection=ref;
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
      if(model.metadata.kind==='kiku-p2')frameCamera();
      model.group.updateMatrixWorld(true);
      const box=scene.getObjectByName('selection-outline');
      box.visible=Boolean(selected);
      if(selected){const part=model.parts.find(item=>item.ref===selected);if(part)box.setFromObject(part.object);else box.visible=false;}
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
      const pullback=model.metadata.kind==='kiku-p2'?1+.22*current:1;
      const half=Math.max(.77,model.span*.7)*pullback/zoom;
      camera.left=-half*Math.max(1,aspect);camera.right=-camera.left;
      camera.top=half*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();
    };
    const layout=()=>{
      if(!renderer||!ready)return;
      renderer.setSize(stage.clientWidth,stage.clientHeight,false);frameCamera();request();
    };
    const releaseGroup=group=>group?.traverse(object=>{object.geometry?.dispose();const list=Array.isArray(object.material)?object.material:[object.material];list.forEach(material=>{material?.map?.dispose();material?.dispose();});});
    const dispose=()=>{
      generation++;
      ready=false;cancelAnimationFrame(frame);frame=0;
      releaseGroup(scene);
      environment?.dispose();renderer?.dispose();
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
        if(token!==generation)return;
        const T=window.THREE;
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
        const loaded=await window.V2HardwareModels.load(root.dataset.hardware);
        if(token!==generation){releaseGroup(loaded.group);return;}
        model=loaded;scene.add(model.group);
        renderer.shadowMap.enabled=model.parts.length<80;renderer.shadowMap.type=T.PCFSoftShadowMap;
        const outline=new T.BoxHelper(model.group,0x2863da);outline.name='selection-outline';outline.visible=false;scene.add(outline);
        const selection=root.querySelector('[data-hardware-selection]');
        model.parts.slice().sort((a,b)=>a.ref.localeCompare(b.ref,undefined,{numeric:true})).forEach(part=>{const option=document.createElement('option');option.value=part.ref;option.textContent=`${part.ref} · ${part.value}`;selection.append(option);});
        canvas.hidden=false;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',root.dataset.hardwareTitle+'. Drag to rotate; use arrow keys to turn, plus and minus to zoom, or Home to reset.');
        root.querySelector('[data-hardware-poster]').hidden=true;
        ready=true;root.dataset.hardwareState='ready';root.dataset.hardwareComponents=String(model.parts.length);showStatus('');
        layout();request();
        if(root.hasAttribute('data-hardware-auto')&&!reduced.matches){scrollEnabled=true;root.querySelector('[data-hardware-scroll]').setAttribute('aria-pressed','true');syncScroll();}
        if(!model.parts.length){explode.disabled=true;range.disabled=true;selection.disabled=true;}
      }catch(error){if(token===generation){console.warn('Assembly view unavailable.',error);unavailable();}}
      finally{loading=false;}
    };
    const disableScroll=()=>{scrollEnabled=false;root.querySelector('[data-hardware-scroll]').setAttribute('aria-pressed','false');};
    const reset=()=>{disableScroll();rotation={x:1.03,y:-.16,z:-.26};zoom=1;setPhase(0);setSelection('');root.querySelectorAll('[data-hardware-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.hardwareView==='iso')));layout();};
    listen(start,'click',initialize);
    listen(explode,'click',()=>{disableScroll();setPhase(target>.5?0:1);});
    listen(range,'input',()=>{disableScroll();setPhase(Number(range.value)/100);});
    listen(root.querySelector('[data-hardware-reset]'),'click',reset);
    listen(root.querySelector('[data-hardware-selection]'),'change',event=>setSelection(event.target.value));
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
