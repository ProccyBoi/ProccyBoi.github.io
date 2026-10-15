/* V2-specific populated inspector; root/v3 keep their accepted enclosure viewer. */
import {loadThree,loadKikuModel,makeKikuMesh} from './v2-kiku-model.js';
import {mountKikuSimulator} from './kiku-simulator.js';

const simulator = document.querySelector('[data-kiku-simulator]');
async function startSimulator() {
  const result = await mountKikuSimulator(simulator);
  if (result && !result.error) simulator.querySelector('.kiku-sim-fallback')?.remove();
}
if (simulator) {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); startSimulator(); }
    }, {rootMargin:'350px'});
    observer.observe(simulator);
  } else startSimulator();
}

const sources = {
  sd: ['microSD','WAV / MP3 files','FatFs + decoder','WAV parser / minimp3','Decode → resample → buffer','The SDMMC peripheral reads a FAT filesystem. WAV and MP3 decoding feed a stereo FIFO; local playback is prefetched before display work. Supported WAV input is 16-bit mono or stereo at 8–96 kHz, converted to the 48 kHz output domain.'],
  fm: ['FM broadcast','Tuning / seek / RDS','SI4705 → codec ADC','Analogue L/R → I²S1 return','Capture → buffer → output','The SI4705 supplies analogue left and right audio to the TLV320AIC3104. The codec digitises it and returns PCM to the STM32 over I²S1. RDS station names and RadioText travel through the control path independently of the music.'],
  bt: ['Your phone','A2DP audio source','BM83 receiver','Dedicated I²S2 PCM input','24-bit → 16-bit → buffer','The BM83 is an A2DP sink: a phone sends audio to Kiku. UART carries commands and metadata; I²S2 carries the samples. The STM32 buffers and converts the incoming audio for the local outputs. This board has no Bluetooth-headphone transmit path.']
};
const fields = ['input','input-note','front','front-note','engine','description'];
document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-source]').forEach(other => other.setAttribute('aria-pressed',String(other === button)));
  sources[button.dataset.source].forEach((value,index) => { document.querySelector(`[data-signal-${fields[index]}]`).textContent = value; });
}));

const assembly = document.querySelector('[data-kiku-assembly]');
if (assembly) {
  const stage = assembly.querySelector('[data-model-stage]');
  const load = assembly.querySelector('[data-model-load]');
  const status = assembly.querySelector('[data-model-status]');
  let canvas=assembly.querySelector('[data-model-canvas]');
  load.addEventListener('click', async () => {
    if (stage.dataset.ready === 'true') return;
    const restoreFocus=document.activeElement===load;
    load.disabled = true; load.textContent = 'Loading the assembly…';
    let renderer,teardown=()=>{};
    try {
      const [T,manifest]=await Promise.all([loadThree(),loadKikuModel()]);
      const session=new AbortController(),events={signal:session.signal};
      renderer = new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2));
      renderer.setClearColor(0xe4e7da,1);
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      const scene = new T.Scene();
      scene.add(new T.HemisphereLight(0xffffff,0x56644d,.65));
      const key = new T.DirectionalLight(0xfff5de,.9); key.position.set(-120,220,250); scene.add(key);
      const rim = new T.DirectionalLight(0xe8f1ff,.4); rim.position.set(200,100,-160); scene.add(rim);
      const fill = new T.DirectionalLight(0xffffff,.15); fill.position.set(160,-70,180); scene.add(fill);
      const group = new T.Group(); group.position.set(...manifest.center.map(value => -value)); scene.add(group);
      const meshes=manifest.parts.map(part=>{const mesh=makeKikuMesh(T,part);group.add(mesh);return mesh;});
      const items=[...manifest.enclosure.parts,{id:'pcb',name:'Populated PCB',color:'#28734b',description:'Actual KiCad board, pads, copper and silkscreen. Official library models and documented source-sized package envelopes',size:manifest.pcb.size||manifest.pcb.bounds[1].map((value,index)=>value-manifest.pcb.bounds[0][index])}];
      const camera = new T.PerspectiveCamera(32,1,.5,3000);
      const target = new T.Vector3();
      const box = new T.Box3();
      let azimuth=.52, elevation=.28, distance=300, fitDistance=300, selected=null, exploded=0, queued=false, renderFrames=0, frameID=0, disposed=false;
      const explode = assembly.querySelector('[data-explode]');
      const all = assembly.querySelector('[data-model-all]');
      const partName = assembly.querySelector('[data-part-name]');
      const partDescription = assembly.querySelector('[data-part-description]');
      const list = assembly.querySelector('[data-part-list]'); list.replaceChildren();
      const partsButtons = new Map();
      function render() {
        queued=false;if(disposed)return;
        const width=stage.clientWidth, height=stage.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width,height,false); camera.aspect=width/height; camera.updateProjectionMatrix();
        camera.position.set(target.x+distance*Math.cos(elevation)*Math.sin(azimuth),target.y+distance*Math.sin(elevation),target.z+distance*Math.cos(elevation)*Math.cos(azimuth));
        camera.lookAt(target); renderer.render(scene,camera);stage.dataset.frames=String(++renderFrames);
      }
      function requestRender() { if (!queued) { queued=true; frameID=requestAnimationFrame(render); } }
      function frame() {
        scene.updateMatrixWorld(true); box.makeEmpty();
        meshes.filter(mesh => mesh.visible).forEach(mesh => box.expandByObject(mesh));
        box.getCenter(target);
        const aspect=Math.max(.4,stage.clientWidth/stage.clientHeight),tan=Math.tan(16*Math.PI/180);
        const right=new T.Vector3(Math.cos(azimuth),0,-Math.sin(azimuth));
        const up=new T.Vector3(-Math.sin(azimuth)*Math.sin(elevation),Math.cos(elevation),-Math.cos(azimuth)*Math.sin(elevation));
        const outward=new T.Vector3(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));
        fitDistance=10;
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new T.Vector3(x,y,z).sub(target);fitDistance=Math.max(fitDistance,v.dot(outward)+Math.max(Math.abs(v.dot(up))/tan,Math.abs(v.dot(right))/(tan*aspect)));}
        fitDistance*=1.25;distance=fitDistance;requestRender();
      }
      function select(id) {
        selected=id;
        meshes.forEach(mesh => { mesh.visible=!id || (mesh.userData.part.group||mesh.userData.part.id)===id; });
        partsButtons.forEach((button,key) => button.setAttribute('aria-pressed',String(key===id)));
        const part=items.find(item=>item.id===id);
        partName.textContent=part ? part.name : 'Mame P2';
        partDescription.textContent=part ? `${part.description}. Nominal part bounds: ${part.size.map(value=>value.toFixed(1)).join(' × ')} mm.` : 'Nine project-designed printed parts and the populated PCB, in their original assembly coordinates. Move the slider to separate the layers, or choose a part to isolate it.';
        status.textContent=part ? `${part.name} · ${id==='pcb'?'KiCad + documented package models':'source STL geometry'}` : 'P2 enclosure + populated PCB';
        all.hidden=!id; frame();
      }
      items.forEach(part => {
        const button=document.createElement('button'); button.type='button'; button.textContent=part.name;
        button.style.setProperty('--part-color',part.color); button.setAttribute('aria-pressed','false');
        button.addEventListener('click',()=>select(selected===part.id ? null : part.id),events); list.append(button); partsButtons.set(part.id,button);
      });
      function applyExplosion() {
        exploded=Number(explode.value)/100;
        meshes.forEach(mesh => mesh.position.set(...mesh.userData.part.explode.map(value=>value*exploded)));
        assembly.querySelector('[data-explode-value]').textContent=exploded===0?'Assembled':`${Math.round(exploded*100)}% open`;
        frame();
      }
      explode.addEventListener('input',applyExplosion,events);
      all.addEventListener('click',()=>select(null),events);
      const views=assembly.querySelectorAll('[data-view]');
      function cameraView(view) {
        azimuth=view==='front'?0:view==='rear'?Math.PI:.52; elevation=view==='iso'?.28:0;
        views.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view))); frame();
      }
      views.forEach(button=>button.addEventListener('click',()=>cameraView(button.dataset.view),events));
      assembly.querySelector('[data-model-reset]').addEventListener('click',()=>{ explode.value='0'; applyExplosion(); select(null); cameraView('iso'); },events);
      const pointers=new Map(); let start=null, previousPinch=0;
      stage.addEventListener('pointerdown',event=>{
        if (event.target!==canvas) return;
        stage.focus({preventScroll:true}); stage.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if (pointers.size===1) start={x:event.clientX,y:event.clientY};
        if (pointers.size===2) { const [a,b]=[...pointers.values()]; previousPinch=Math.hypot(a.x-b.x,a.y-b.y); start=null; }
      },events);
      stage.addEventListener('pointermove',event=>{
        const previous=pointers.get(event.pointerId); if(!previous) return;
        pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(pointers.size===2){const [a,b]=[...pointers.values()]; const pinch=Math.hypot(a.x-b.x,a.y-b.y); if(previousPinch>0&&pinch>0) distance=Math.max(fitDistance*.35,Math.min(fitDistance*2.5,distance*previousPinch/pinch)); previousPinch=pinch;}
        else {azimuth-=(event.clientX-previous.x)*.009; elevation=Math.max(-1.25,Math.min(1.25,elevation+(event.clientY-previous.y)*.009));}
        views.forEach(button=>button.setAttribute('aria-pressed','false')); requestRender();
      },events);
      function pointerEnd(event) {
        if (!pointers.has(event.pointerId)) return;
        if(start && Math.hypot(event.clientX-start.x,event.clientY-start.y)<5 && event.type==='pointerup') {
          const rect=stage.getBoundingClientRect(); const pointer=new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
          const ray=new T.Raycaster(); ray.setFromCamera(pointer,camera);
          const hit=ray.intersectObjects(meshes.filter(mesh=>mesh.visible),false)[0];
          if(hit){const id=hit.object.userData.part.group||hit.object.userData.part.id;select(selected===id?null:id);}
        }
        pointers.delete(event.pointerId); start=null;
      }
      stage.addEventListener('pointerup',pointerEnd,events); stage.addEventListener('pointercancel',pointerEnd,events);
      stage.addEventListener('wheel',event=>{
        // Preserve ordinary page scrolling until the visitor intentionally focuses the model.
        if(document.activeElement!==stage) return;
        event.preventDefault(); distance=Math.max(fitDistance*.35,Math.min(fitDistance*2.5,distance*Math.exp(event.deltaY*.001))); requestRender();
      },{passive:false,signal:session.signal});
      stage.addEventListener('keydown',event=>{
        if(event.target!==stage) return;
        if(event.key==='ArrowLeft') azimuth-=.12;
        else if(event.key==='ArrowRight') azimuth+=.12;
        else if(event.key==='ArrowUp') elevation=Math.min(1.25,elevation+.12);
        else if(event.key==='ArrowDown') elevation=Math.max(-1.25,elevation-.12);
        else if(event.key==='+'||event.key==='=') distance=Math.max(fitDistance*.35,distance*.9);
        else if(event.key==='-') distance=Math.min(fitDistance*2.5,distance*1.1);
        else if(event.key==='Escape') select(null);
        else return;
        event.preventDefault(); requestRender();
      },events);
      const resize=new ResizeObserver(()=>frame()); resize.observe(stage);
      teardown=()=>{disposed=true;session.abort();resize.disconnect();cancelAnimationFrame(frameID);meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});renderer.dispose();};
      canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault();const focused=assembly.contains(document.activeElement);teardown();
        assembly.querySelector('[data-model-poster]').hidden=false;
        const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;canvas.hidden=true;
        assembly.querySelector('[data-model-controls]').hidden=true;list.replaceChildren();all.hidden=true;
        stage.dataset.ready='false';load.hidden=false;load.disabled=false;load.textContent='Retry populated explorer';
        status.textContent='Graphics paused. The CAD image remains available.';if(focused)load.focus({preventScroll:true});
      },events);
      canvas.hidden=false;
      assembly.querySelector('[data-model-poster]').hidden=true; load.hidden=true;
      assembly.querySelector('[data-model-controls]').hidden=false;
      stage.dataset.ready='true';stage.dataset.pcbParts=String(manifest.pcb.parts.length); select(null);if(restoreFocus&&(document.activeElement===load||document.activeElement===document.body))stage.focus({preventScroll:true});
    } catch(error) {
      teardown();renderer?.dispose();
      status.textContent='The 3D view could not start. The original CAD image and engineering details are still available.';
      load.textContent='Retry 3D explorer'; load.disabled=false;
    }
  });
}
