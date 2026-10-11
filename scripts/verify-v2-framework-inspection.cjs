/* Framework closer-look acceptance. Real production scene, actual browser input,
 * actual CAD bounds and one-in-flight GPU fences; no capture API or fake renderer.
 * --source-only checks the real source geometry without claiming browser results.
 * --group=desktop|mobile390|mobile320|lifecycle partitions the browser cases;
 * default runs all. The desktop CI group also runs the shared source geometry.
 * Serve the repository on V2_BASE_URL. Browser evidence belongs in Actions when
 * Chromium cannot launch in the local executor. SwiftShader is not a device benchmark. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=(process.env.V2_BASE_URL||'http://127.0.0.1:8080').replace(/\/$/,'').replace(/\/v2$/,'');
const output=process.env.V2_INSPECTION_OUT||path.join(process.env.V2_SELECTED_OUT||'.codex-temp/v2-selected-study','inspection');
const timeout=Number(process.env.V2_BROWSER_TIMEOUT||120000),evidence=[],names=['esp32','dual','pi','logic','metro','tramtrace'];
const selected='[data-selected-work]',hit=i=>`[data-framework-inspect="${i}"]`,overview='[data-framework-overview]';
const urls=['framework-expansion-card','framework-dual-usb','framework-raspberry-pi','framework-logic-analyser','metroboard','tramtrace'].map(name=>'/v2/projects/'+name+'/');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const near=(a,b,label,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${label}: ${a} vs ${b}`);
const passed=(name,details={})=>{evidence.push({name,...details});console.log('PASS '+name);};
const hash=array=>crypto.createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
function sourceContract(){
  const html=read('v2/index.html'),code=read('assets/v2-selected-work.js');
  const section=html.slice(html.indexOf('data-selected-work'),html.indexOf('data-aircraft-hero'));
  for(const url of urls)assert.ok(section.includes('href="'+url+'"'),'Original project link remains '+url);
  assert.equal((section.match(/data-selected-image/g)||[]).length,6,'All six source posters remain available');
  assert.equal((code.match(/document\.createElement\(['"]canvas['"]\)/g)||[]).length,1,'Inspection shares the one Selected canvas');
  for(const attribute of ['data-framework-inspect','data-framework-overview','data-framework-inspection-ui'])assert.ok(code.includes(attribute),'Stable accessible inspection control '+attribute);
  assert.doesNotMatch(read('v3/index.html'),/data-framework-inspect|v2-selected-work/,'v3 remains independent');
  passed('inspection-source-links-fallbacks-one-renderer');
}
async function sourceGeometry(){
  const T=require('../assets/vendor/three.min.js'),window={THREE:T,DecompressionStream};
  for(const key of ['Float32Array','Float64Array','Uint32Array','Uint16Array','Uint8Array','Int32Array','Int16Array','Int8Array'])window[key]=global[key];
  class LocalImage{set src(url){this.url=url;queueMicrotask(()=>this.onload?.());}}
  const context=vm.createContext({window,Image:LocalImage,TextDecoder,DataView,Uint8Array,Blob,Response,DecompressionStream,performance,setTimeout,console,fetch:async url=>new Response(fs.readFileSync(path.join(root,url.split('?')[0].replace(/^\//,''))))});
  for(const file of ['v2-hero-assets.js','v2-hero-environment.js','v2-selected-assets.js','v2-selected-scene.js'])vm.runInContext(read('assets/'+file),context,{filename:file});
  const assemblies={};for(const name of names)assemblies[name]=await window.V2SelectedAssets.load(name);
  const composition=window.V2SelectedScene.create(T,assemblies),camera=new T.PerspectiveCamera(34,1,.01,200),scene=new T.Scene();scene.add(composition.group);
  const graph=()=>JSON.stringify(names.map(name=>{const nodes=[];assemblies[name].group.traverse(node=>nodes.push({id:node.uuid,parent:node.parent?.uuid,children:node.children.map(child=>child.uuid),scale:node.scale.toArray(),geometry:node.geometry?.uuid,attributes:node.geometry?Object.entries(node.geometry.attributes).map(([key,attribute])=>[key,attribute.itemSize,attribute.normalized,hash(attribute.array)]):null,index:node.geometry?.index?hash(node.geometry.index.array):null,materials:[].concat(node.material||[]).map(material=>({id:material.uuid,opacity:material.opacity,transparent:material.transparent,color:material.color?.getHexString()}))}));return nodes;}));
  const sourceGraph=graph(),local=()=>names.map(name=>{const result=[];assemblies[name].group.traverse(node=>result.push([node.uuid,...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()]));return result;});
  const pose=()=>[...camera.position.toArray(),...camera.quaternion.toArray(),...camera.projectionMatrix.elements,...names.flatMap(name=>{const {wrapper}=composition.objects.get(name);return[...wrapper.position.toArray(),...wrapper.quaternion.toArray(),...wrapper.scale.toArray()];})];
  const project=name=>{const box=new T.Box3().setFromObject(composition.objects.get(name).wrapper),points=[];for(let n=0;n<8;n++)points.push(new T.Vector3(n&1?box.max.x:box.min.x,n&2?box.max.y:box.min.y,n&4?box.max.z:box.min.z).project(camera).toArray());return{points,minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};};
  // Compare actual internal-part displacement with the accepted deployed scene,
  // using independently loaded source graphs, not constants copied from the new code.
  const baselineCommit='0fd1370c5d17cc6bc61da29f17a81ebcfe32df52';
  const baselineSource=require('node:child_process').execFileSync('git',['show',baselineCommit+':assets/v2-selected-scene.js'],{cwd:root,encoding:'utf8'});
  vm.runInContext(baselineSource,context,{filename:'baseline-selected-scene.js'});
  const baselineAssemblies={};for(const name of names)baselineAssemblies[name]=await window.V2SelectedAssets.load(name);
  const baselineComposition=window.V2SelectedScene.create(T,baselineAssemblies),baselineCamera=new T.PerspectiveCamera(34,1,.01,200),baselineScene=new T.Scene();baselineScene.add(baselineComposition.group);
  baselineComposition.frame(baselineCamera,0,1440,900);composition.frame(camera,0,1440,900);
  const explosion=names.slice(0,4).map(name=>{const displacement=scene=>scene.objects.get(name).motion.filter(part=>part.role!=='enclosure').reduce((sum,part)=>sum+part.object.position.distanceTo(part.base),0);const before=displacement(baselineComposition),after=displacement(composition);assert.ok(after>before*1.2,name+': real exploded source-part displacement is materially larger than the deployed version');return{name,before,after,ratio:after/before};});
  const reports=[];
  for(const [width,height]of[[1440,900],[390,844],[320,740]])for(const progress of[0,.08,.155,.235,.32]){
    composition.frame(camera,progress,width,height);const originalPose=pose(),originalLocal=local(),bounds=names.slice(0,4).map(project);
    composition.frame(camera,progress,width,height,{weights:new Float32Array(4)});assert.deepEqual(pose(),originalPose,'Omitted inspection and zero weights have exactly the same camera/model pose');
    for(let index=0;index<4;index++){
      const weights=new Float32Array(4);weights[index]=1;
      composition.frame(camera,progress,width,height,{weights});const selectedPose=pose(),box=project(names[index]);
      assert.ok(selectedPose.every(Number.isFinite),'Inspection camera and wrappers are finite');
      assert.deepEqual(local(),originalLocal,'Inspection never changes local physical assembly or part seating');
      assert.ok(box.points.every(point=>point.every(Number.isFinite)&&Math.abs(point[0])<1&&Math.abs(point[1])<1&&Math.abs(point[2])<1),'The complete inspected real CAD fits the camera');
      const area=(box.maxX-box.minX)*(box.maxY-box.minY),prior=(bounds[index].maxX-bounds[index].minX)*(bounds[index].maxY-bounds[index].minY);
      assert.ok(area>prior*1.15,`${width}px ${names[index]} at ${progress}: closer look visibly enlarges projected CAD (${area/prior})`);
      const samples=[];for(let step=0;step<=20;step++){weights[index]=step/20;composition.frame(camera,progress,width,height,{weights});assert.deepEqual(local(),originalLocal,'Intermediate inspection preserves exact native-progress part pose');assert.ok(pose().every(Number.isFinite));samples.push(pose());}
      for(let step=20;step>=0;step--){weights[index]=step/20;composition.frame(camera,progress,width,height,{weights});assert.deepEqual(pose(),samples[step],'Inspection reverses without accumulated drift');}
      composition.frame(camera,progress,width,height);assert.deepEqual(pose(),originalPose,'Show all restores exact overview camera and wrappers');
      reports.push({width,height,progress,name:names[index],areaRatio:area/prior,selectedBounds:box});
    }
  }
  for(const progress of[.57,.84,1]){
    composition.frame(camera,progress,390,844);const normal=pose(),parts=local();
    for(let index=0;index<4;index++){const weights=new Float32Array(4);weights[index]=1;composition.frame(camera,progress,390,844,{weights});assert.deepEqual(pose(),normal,'Inspection cannot alter the outgoing Transit chapter');assert.deepEqual(local(),parts);}
  }
  assert.equal(graph(),sourceGraph,'Inspection never changes source graph identity, geometry bytes, material identity/properties, or authored local scales');
  passed('real-cad-inspection-exact-parts-reversal-zero-parity-transit-isolation',{reports,explosion,baselineCommit,method:'Real packed source geometry and production scene; only network transport and decoded texture pixels are replaced. No rendering claim.'});
}

// Observe production objects at their normal creation boundary. No debug/capture
// render call, new renderer, extra animation loop, geometry or material mutation.
function instrument(){
  const probe=window.__frameworkInspectionProbe={contexts:[],frames:[],published:[],inputs:[],actions:[],scrolls:[],prevention:[],fences:[],hold:false,draws:0};
  let module,composition,camera,lastFrame;
  Object.defineProperty(window,'V2SelectedScene',{configurable:true,get:()=>module,set:value=>{module={...value,create(...args){composition=value.create(...args);const frame=composition.frame;composition.frame=function(...frameArgs){const result=frame.apply(this,frameArgs);camera=frameArgs[0];lastFrame={progress:frameArgs[1],width:frameArgs[2],height:frameArgs[3],weights:Array.from(frameArgs[4]?.weights||[0,0,0,0])};probe.draws++;return result;};return composition;}};}});
  const rect=node=>{if(!node)return null;const b=node.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
  probe.read=()=>{
    const root=document.querySelector('[data-selected-work]'),stage=root?.querySelector('.v2-selected-stage'),canvas=root?.querySelector('[data-selected-canvas]'),data=root?.dataset||{};
    return{at:performance.now(),url:location.href,y:scrollY,width:innerWidth,height:innerHeight,stage:rect(stage),canvas:rect(canvas),data:{...data},live:root?.classList.contains('is-live'),canvasVisibility:canvas?getComputedStyle(canvas).visibility:null,frames:Number(data.selectedFrames||0),submitted:Number(data.selectedSubmittedFrames||0),completed:Number(data.selectedCompletedFrames||0),target:Number(data.selectedInspectionTarget??-1),mode:data.selectedInspectionMode,weights:JSON.parse(data.selectedInspectionWeights||'[]'),renderedWeights:JSON.parse(data.selectedInspectionRenderedWeights||'[]'),lastFrame,overflow:document.documentElement.scrollWidth>innerWidth+1,active:document.activeElement?.getAttribute('data-framework-inspect'),controls:[...document.querySelectorAll('[data-framework-inspect]')].map(node=>({index:Number(node.dataset.frameworkInspect),tag:node.tagName,type:node.type,label:node.getAttribute('aria-label')||node.textContent.trim(),pressed:node.getAttribute('aria-pressed'),disabled:node.disabled,hidden:node.hidden,rect:rect(node)})),overview:rect(document.querySelector('[data-framework-overview]'))};
  };
  probe.geometry=()=>{
    if(!composition||!camera)return null;const T=window.THREE,stage=document.querySelector('.v2-selected-stage').getBoundingClientRect();
    const models=['esp32','dual','pi','logic'].map(name=>{const entry=composition.objects.get(name),box=new T.Box3().setFromObject(entry.wrapper),points=[];for(let i=0;i<8;i++)points.push(new T.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(camera).toArray());const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));return{name,points,left:stage.left+(minX+1)*stage.width/2,right:stage.left+(maxX+1)*stage.width/2,top:stage.top+(1-maxY)*stage.height/2,bottom:stage.top+(1-minY)*stage.height/2,area:(maxX-minX)*(maxY-minY),wrapper:[...entry.wrapper.position.toArray(),...entry.wrapper.quaternion.toArray(),...entry.wrapper.scale.toArray()],parts:entry.motion.map(part=>({ref:part.ref,role:part.role,position:part.object.position.toArray(),quaternion:part.object.quaternion.toArray(),scale:part.object.scale.toArray()}))};});
    return{models,camera:[...camera.position.toArray(),...camera.quaternion.toArray(),...camera.projectionMatrix.elements]};
  };
  probe.text=()=>[...document.querySelectorAll('[data-selected-chapter="0"] h3,[data-selected-chapter="0"] .v2-selected-heading p,.v2-framework-copy,[data-framework-inspection-ui] p,[data-framework-overview],.v2-selected-nav')].filter(node=>{const css=getComputedStyle(node);return node.getBoundingClientRect().width>0&&css.visibility!=='hidden'&&Number(css.opacity)>0;}).map(node=>({text:node.textContent.trim(),rect:rect(node)}));
  const contexts=new WeakSet(),native=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){
    const gl=native.call(this,type,...args);if(!gl||!/webgl/.test(type)||contexts.has(gl))return gl;contexts.add(gl);
    const own=this.matches('[data-selected-canvas]');probe.contexts.push({kind:own?'selected':this.closest('[data-assembly]')?'hero':this.matches('[data-aircraft-canvas]')?'aircraft':'other'});
    if(own&&gl.fenceSync){const make=gl.fenceSync.bind(gl),poll=gl.clientWaitSync.bind(gl),remove=gl.deleteSync.bind(gl),fences=new Map();
      gl.fenceSync=(...args)=>{const sync=make(...args);if(sync){const record={id:probe.fences.length+1,created:performance.now(),pendingAtCreate:probe.fences.filter(fence=>fence.deleted===undefined).length+1,polls:0,held:0};fences.set(sync,record);probe.fences.push(record);}return sync;};
      gl.clientWaitSync=(sync,flags,timeout)=>{const record=fences.get(sync);if(record){record.polls++;record.maxTimeout=Math.max(record.maxTimeout||0,timeout);}if(probe.hold){if(record)record.held++;return gl.TIMEOUT_EXPIRED;}return poll(sync,flags,timeout);};
      gl.deleteSync=sync=>{const record=fences.get(sync);if(record){record.deleted=performance.now();record.deleteCalls=(record.deleteCalls||0)+1;}return remove(sync);};
    }return gl;
  };
  new MutationObserver(records=>{const root=document.querySelector('[data-selected-work]');if(!root)return;if(records.some(record=>record.attributeName==='data-selected-last-frame')){const frame=JSON.parse(root.dataset.selectedLastFrame||'null');if(frame&&probe.frames.at(-1)?.sequence!==frame.sequence)probe.frames.push(frame);}if(records.some(record=>record.attributeName==='data-selected-frames')){const state=probe.read();if(state.frames>0&&probe.published.at(-1)?.frames!==state.frames)probe.published.push(state);}}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-selected-last-frame','data-selected-frames']});
  const prevent=Event.prototype.preventDefault;Event.prototype.preventDefault=function(){if(/^(wheel|touchstart|touchmove|touchend)$/.test(this.type))probe.prevention.push(this.type);return prevent.call(this);};
  addEventListener('scroll',()=>probe.scrolls.push({at:performance.now(),y:scrollY,target:Number(document.querySelector('[data-selected-work]')?.dataset.selectedInspectionTarget??-1)}),{passive:true});
  for(const type of['click','keydown','focusin','focusout','pointerenter','pointerleave','wheel','touchstart','touchmove','touchend'])addEventListener(type,event=>{const point=event.changedTouches?.[0]||event;const record={type,key:event.key,trusted:event.isTrusted,at:performance.now(),prevented:event.defaultPrevented,x:point.clientX,y:point.clientY,scrollY,target:event.target?.closest?.('[data-framework-inspect]')?.getAttribute('data-framework-inspect')??null};probe.inputs.push(record);queueMicrotask(()=>{record.prevented=event.defaultPrevented;});},{capture:true,passive:true});
}
async function open(browser,{width=1440,height=900,touch=false,reduced=false,saveData=false,noWebGL=false}={}){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:touch?2:1,hasTouch:touch,isMobile:touch,reducedMotion:reduced?'reduce':'no-preference'});await context.addInitScript(instrument);
  if(saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}}));
  if(noWebGL)await context.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:native.call(this,type,...args);};});
  const page=await context.newPage(),errors=[],shaders=[];page.setDefaultTimeout(timeout);page.setDefaultNavigationTimeout(timeout);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(/Shader Error|Error compiling shader|THREE.WebGLProgram/.test(message.text()))shaders.push(message.text());});
  return{page,context,errors,shaders};
}
const state=page=>page.evaluate(()=>window.__frameworkInspectionProbe.read());
const geometry=page=>page.evaluate(()=>window.__frameworkInspectionProbe.geometry());
const trace=page=>page.evaluate(()=>{const p=window.__frameworkInspectionProbe;return{frames:p.frames,published:p.published,inputs:p.inputs,actions:p.actions,scrolls:p.scrolls,prevention:p.prevention,contexts:p.contexts,fences:p.fences,draws:p.draws};});
async function settled(page,target,mode){
  await page.waitForFunction(({target,mode})=>{const p=window.__frameworkInspectionProbe,s=p.read();return s.frames>0&&s.live&&s.data.selectedWarmMask==='false'&&s.data.selectedGPUPending==='false'&&Math.abs(Number(s.data.selectedProgress)-Number(s.data.selectedRenderedProgress))<.000003&&s.weights.length===4&&s.renderedWeights.length===4&&s.weights.every((n,i)=>Math.abs(n-s.renderedWeights[i])<.0001)&&s.renderedWeights.every((n,i)=>Math.abs(n-(i===s.target?1:0))<.0001)&&(target===undefined||s.target===target)&&(mode===undefined||s.mode===mode);},{target,mode},{timeout});
}
async function jump(page,progress){
  await page.evaluate(progress=>{const stage=document.querySelector('.v2-selected-stage'),track=document.querySelector('.v2-selected-track'),top=parseFloat(getComputedStyle(stage).top)||0,distance=parseFloat(track.style.height)-stage.clientHeight;scrollTo({top:scrollY+track.getBoundingClientRect().top-top+distance*progress+(progress===0?-1:progress===1?1:0),behavior:'instant'});},progress);
  await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('[data-selected-work]').dataset.selectedProgress)-progress)<.001,progress,{timeout});await settled(page);
}
async function start(run){
  // Native chapter intent deliberately enters Selected Work; no distant-page
  // preparation assumption is needed for any inspection or lifecycle case.
  await run.page.goto(base+'/v2/?v=framework-inspection#work-framework',{waitUntil:'domcontentloaded'});
  await settled(run.page,-1,'overview');await jump(run.page,0);
  assert.equal(await run.page.evaluate(()=>typeof window.__v2Selected),'undefined','Ordinary acceptance does not enable the capture API');
}
async function leavePreview(page){await page.mouse.move(1,80);await page.evaluate(()=>{if(document.activeElement?.matches('[data-framework-inspect]'))document.activeElement.blur();});}
async function clear(page,{touch=false}={}){if(touch)await page.locator(overview).tap();else await page.locator(overview).click();await leavePreview(page);await settled(page,-1,'overview');}
async function pin(page,index,{touch=false}={}){
  const before=await page.locator(hit(index)).evaluate((node,index)=>{
    const rect=node.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2,top=document.elementFromPoint(x,y),root=document.querySelector('[data-selected-work]');
    const snapshot={at:performance.now(),requested:index,scrollY,progress:Number(root.dataset.selectedProgress),current:Number(root.dataset.selectedInspectionTarget),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},point:{x,y},centerOwned:top===node||node.contains(top),owner:top?.closest('[data-framework-inspect]')?.getAttribute('data-framework-inspect')??top?.tagName,stack:document.elementsFromPoint(x,y).slice(0,6).map(element=>({tag:element.tagName,inspect:element.getAttribute('data-framework-inspect'),class:element.className}))};
    window.__frameworkInspectionProbe.actions.push(snapshot);return snapshot;
  },index);
  assert.ok(before.centerOwned,`Card ${index} native tap center is owned by ${before.owner}; projected hit regions must not occlude one another`);
  if(touch)await page.locator(hit(index)).tap();else await page.locator(hit(index)).click();
  await settled(page,index,'pinned');const after=await state(page);near(after.y,before.scrollY,'Native inspection activation never scrolls the document',1);near(Number(after.data.selectedProgress),before.progress,'Native inspection activation retains its intended assembly progress',.00001);
}
async function idle(page,label){await settled(page);const before=await state(page),oldTrace=await trace(page);await page.waitForTimeout(900);const after=await state(page),nextTrace=await trace(page);assert.equal(after.frames,before.frames,label+': no idle live draws');assert.equal(after.submitted,before.submitted,label+': no queued idle submissions');assert.equal(nextTrace.draws,oldTrace.draws,label+': no hidden scene-frame loop');assert.deepEqual(nextTrace.fences,oldTrace.fences,label+': finite fence allocation/polling');}
function assertLinks(links){assert.deepEqual(links,urls,'All original six project destinations remain exact');}
async function links(page){return page.locator(selected+' [data-selected-chapter] a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));}
async function save(run,name,details={},screenshot=true){
  assert.deepEqual(run.errors,[],'No unhandled browser errors');assert.deepEqual(run.shaders,[],'No shader compilation errors');
  const report={...details,state:await state(run.page),geometry:await geometry(run.page)};fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(report,null,2)+'\n');
  if(screenshot)await run.page.screenshot({path:path.join(output,name+'.png'),timeout:30000});passed(name,details);
}
async function diagnose(run,name,error){
  const report={error:error.stack};try{report.state=await state(run.page);report.trace=await trace(run.page);report.geometry=await geometry(run.page);report.text=await run.page.evaluate(()=>window.__frameworkInspectionProbe.text());}catch(failure){report.collectionError=failure.message;}
  fs.writeFileSync(path.join(output,name+'-failure.json'),JSON.stringify(report,null,2)+'\n');await run.page.screenshot({path:path.join(output,name+'-failure.png'),timeout:15000}).catch(()=>{});
}
const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
async function descriptionProof(page){
  const descriptions=await page.locator(selected+' [data-selected-chapter="0"] .v2-framework-copy p').evaluateAll(nodes=>nodes.map(node=>{
    const bounds=node.getBoundingClientRect(),css=getComputedStyle(node);
    let ancestorsVisible=true;for(let parent=node;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)ancestorsVisible=false;}
    return{text:node.textContent.trim(),width:bounds.width,height:bounds.height,fontSize:parseFloat(css.fontSize),visible:ancestorsVisible&&bounds.width>0&&bounds.height>0};
  }));
  assert.equal(descriptions.length,4,'All four Framework cards retain a concise description');
  for(const description of descriptions){assert.ok(description.visible&&description.text.length>3,'Every Framework description remains visibly rendered at the actual viewport width');assert.ok(description.fontSize>=12,'Framework descriptions retain a readable minimum type size');}
  return descriptions;
}
async function layoutProof(page,index){
  const s=await state(page),g=await geometry(page),text=await page.evaluate(()=>window.__frameworkInspectionProbe.text()),descriptions=await descriptionProof(page);assert.ok(g);
  assert.equal(s.overflow,false,'No horizontal document clipping');assert.equal(s.controls.length,4,'Exactly four real model controls');
  for(const control of s.controls){assert.equal(control.tag,'BUTTON','Inspector is a native accessible button');assert.equal(control.type,'button');assert.ok(control.label&&control.label.length>3,'Inspector has a meaningful accessible name');assert.equal(control.disabled,false);assert.ok(['true','false'].includes(control.pressed),'Native control exposes pressed state');assert.ok(control.rect.width>=43.99&&control.rect.height>=43.99,'Projected hit target retains the accepted 44px minimum extent');assert.ok(control.rect.left>=s.stage.left-1&&control.rect.right<=s.stage.right+1&&control.rect.top>=s.stage.top-1&&control.rect.bottom<=s.stage.bottom+1,'Projected hit target fits inside the actual canvas stage');
    const model=g.models[control.index];assert.ok(intersects(control.rect,model),'Hit target overlaps the actual projected CAD it names');
  }
  for(const model of index<0?g.models:[g.models[index]]){
    assert.ok(model.points.every(point=>point.every(Number.isFinite)&&Math.abs(point[0])<1&&Math.abs(point[1])<1&&Math.abs(point[2])<1),'Complete inspected/overview real CAD is inside the camera');
    for(const item of text)assert.equal(intersects(model,item.rect),false,model.name+' does not collide with visible text: '+item.text);
  }
  for(let a=0;a<text.length;a++)for(let b=a+1;b<text.length;b++)assert.equal(intersects(text[a].rect,text[b].rect),false,'Visible text/control blocks do not overlap: '+text[a].text+' / '+text[b].text);
  if(index>=0)assert.equal(s.controls[index].pressed,s.mode==='pinned'?'true':'false','Pressed state identifies pinned selection');
  return{s,g,text,descriptions};
}
async function visualAndInput(browser,viewport){
  const touch=viewport.width<760,run=await open(browser,{...viewport,touch}),{page}=run,label='inspection-'+viewport.width;
  try{
    await start(run);assertLinks(await links(page));const originalURL=page.url();await leavePreview(page);await settled(page,-1,'overview');
    const overviewPose=await layoutProof(page,-1);await save(run,label+'-exploded-overview',{layout:overviewPose});
    for(let index=0;index<4;index++){
      await pin(page,index,{touch});const focused=await layoutProof(page,index);
      assert.ok(focused.g.models[index].area>overviewPose.g.models[index].area*1.15,'Native selection really enlarges the real model');assert.deepEqual(focused.g.models.map(model=>model.parts),overviewPose.g.models.map(model=>model.parts),'Native selection does not modify scroll-driven part assembly');
      near(focused.s.y,overviewPose.s.y,'Selecting a card does not scroll the page',1);assert.equal(page.url(),originalURL,'Inspecting never follows an underlying project link');
      await save(run,label+'-exploded-'+names[index],{layout:focused});
      await leavePreview(page);await settled(page,index,'pinned');await idle(page,'Pinned '+names[index]);
      // Repeated activation is a real click/tap, not a state mutation.
      if(touch)await page.locator(hit(index)).tap();else await page.locator(hit(index)).click();await leavePreview(page);await settled(page,-1,'overview');
      await pin(page,index,{touch});await clear(page,{touch});
    }
    const returned=await geometry(page);assert.deepEqual(returned,overviewPose.g,'Repeated pin/unpin and Show all return to the exact original geometry');
    // Every ordered card-to-card pair is activated through its actual current
    // projected hit rectangle. Locator click/tap uses normal occlusion checks;
    // never dispatchEvent(), force, or a debug state setter.
    const pairSequence=[0,1,2,3,0,2,0,3,1,3,2,1,0],switches=[];
    for(const progress of[0,.311]){
      await jump(page,progress);
      for(const [step,index]of pairSequence.entries()){
        await pin(page,index,{touch});assert.equal(page.url(),originalURL,'Direct switching never navigates to the underlying project');switches.push({progress,from:step?pairSequence[step-1]:-1,to:index});
        if(progress===.311&&step===3)await save(run,label+'-assembled-logic-focused',{layout:await layoutProof(page,index)});
      }
      await clear(page,{touch});
    }
    await jump(page,0);passed(label+'-native-all-pairs-exploded-and-assembled',{switches});
    if(!touch){
      for(let index=0;index<4;index++){await page.locator(hit(index)).hover();await settled(page,index,'preview');await idle(page,'Stationary pointer preview '+index);assert.equal((await state(page)).target,index,'Moving projected geometry under a stationary pointer cannot change selection');await page.mouse.move(1,80);await settled(page,-1,'overview');}
      await page.locator(overview).focus();await page.keyboard.press('Tab');await settled(page,0,'preview');await page.keyboard.press('Tab');await settled(page,1,'preview');await page.keyboard.press('Enter');await settled(page,1,'pinned');await page.keyboard.press('Escape');await settled(page,-1,'overview');
      await page.locator(hit(2)).focus();await settled(page,2,'preview');await page.keyboard.press('Space');await settled(page,2,'pinned');await page.keyboard.press('Escape');await settled(page,-1,'overview');await leavePreview(page);
    }
    await pin(page,3,{touch});await jump(page,.155);const forward=await geometry(page);await jump(page,.30);await jump(page,.155);assert.deepEqual(await geometry(page),forward,'Native scroll reversal preserves the inspected physical assembly exactly');
    await jump(page,1);await settled(page,-1,'overview');assert.equal((await state(page)).data.selectedChapter,'1');assert.ok((await state(page)).controls.every(control=>control.disabled||control.hidden||control.rect.width===0),'Transit has no active Framework hit targets');
    await jump(page,0);await settled(page,-1,'overview');await layoutProof(page,-1);assertLinks(await links(page));
    const before=await state(page);
    if(touch){const cdp=await run.context.newCDPSession(page),point=y=>[{x:Math.round(viewport.width/2),y,id:1,radiusX:4,radiusY:4,force:1}];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(580)});for(const y of[560,535,510,485,460]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(y)});await page.waitForTimeout(60);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else{await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.wheel(0,160);}
    await page.waitForFunction(y=>scrollY>y+50,before.y);await leavePreview(page);await settled(page);const input=await trace(page),native=input.inputs.filter(event=>/^(wheel|touchstart|touchmove|touchend)$/.test(event.type));assert.ok(native.length>0&&native.every(event=>event.trusted&&!event.prevented),'Actual native scroll input is trusted and never canceled');assert.deepEqual(input.prevention,[],'No scroll/touch preventDefault was introduced');
    assert.equal(input.contexts.filter(context=>context.kind==='selected').length,1,'Every interaction reuses the original shared renderer');await idle(page,'Repeated inspection and native scroll');await save(run,label+'-repeated-keyboard-touch-native-scroll',{trace:input},false);
    await jump(page,0);await leavePreview(page);await Promise.all([page.waitForURL('**'+urls[0]),page.locator(selected+' .v2-framework-card').first().locator('.v2-framework-copy').click()]);passed(label+'-original-project-link-native-navigation',{destination:new URL(page.url()).pathname});
  }catch(error){await diagnose(run,label,error);throw error;}finally{await run.context.close();}
}
async function scrollOnly(page,progress){
  await page.evaluate(progress=>{const stage=document.querySelector('.v2-selected-stage'),track=document.querySelector('.v2-selected-track'),distance=parseFloat(track.style.height)-stage.clientHeight,top=parseFloat(getComputedStyle(stage).top)||0;scrollTo({top:scrollY+track.getBoundingClientRect().top-top+distance*progress,behavior:'instant'});},progress);
  await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('[data-selected-work]').dataset.selectedProgress)-progress)<.001,progress);
}
async function heldGPU(browser){
  const run=await open(browser),{page}=run;
  try{
    await start(run);await leavePreview(page);const before=await state(page);await page.evaluate(()=>{window.__frameworkInspectionProbe.hold=true;});
    await page.locator(hit(0)).click();await page.waitForFunction(()=>window.__frameworkInspectionProbe.fences.some(fence=>!fence.deleted&&fence.held>0));const held=await state(page);
    assert.equal(held.frames,before.frames,'Held selection is not published before its actual GPU completion');
    for(const index of[1,2,3]){await page.locator(hit(index)).click();await page.waitForFunction(index=>Number(document.querySelector('[data-selected-work]').dataset.selectedInspectionTarget)===index,index);}
    const changed=await state(page);assert.equal(changed.frames,before.frames,'Newer selections never publish a stale held frame');assert.ok(changed.submitted<=before.submitted+1,'Repeated selection does not create a GPU frame queue');
    await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>innerWidth===390&&document.querySelector('.v2-selected-stage').clientWidth<400);await page.waitForTimeout(160);
    const resized=await state(page);assert.equal(resized.frames,before.frames,'Resize cannot publish the obsolete drawing buffer');assert.equal(resized.data.selectedWarmMask,'true','Resize masks the stale canvas');
    await page.evaluate(()=>{window.__frameworkInspectionProbe.hold=false;});await settled(page,3,'pinned');const after=await state(page),result=await trace(page),published=result.published.filter(value=>value.frames>before.frames);
    assert.ok(published.length>0);assert.equal(published[0].target,3,'First current reveal belongs to the newest selection');assert.equal(published[0].stage.width,after.stage.width,'First current reveal uses the resized stage');
    assert.ok(published[0].renderedWeights[3]>0&&published[0].renderedWeights.slice(0,3).every(value=>value===0),'First reveal cannot show any superseded card inspection');
    const records=result.frames.filter(frame=>frame.sequence>before.submitted);assert.equal(records.length,after.submitted-before.submitted,'Every submitted GPU frame has a terminal report');
    for(let index=0;index<records.length;index++){const record=records[index];assert.ok(Array.isArray(record.inspectionWeights)&&record.inspectionWeights.length===4,'Each GPU report snapshots its exact submitted inspection pose');if(index)assert.ok(record.submittedMs>=records[index-1].observedMs,'One live draw at a time, including superseded selections');}
    assert.ok(result.fences.every(fence=>fence.pendingAtCreate===1&&(fence.maxTimeout||0)===0&&fence.deleteCalls===1),'Real fences are nonblocking, singular and each deleted once');assert.equal(result.contexts.filter(item=>item.kind==='selected').length,1);
    await layoutProof(page,3);await idle(page,'Held GPU latest selection and resize');await save(run,'inspection-held-gpu-latest-selection-resize',{before,held,changed,resized,after,trace:result,method:'Only real Selected clientWaitSync observations are temporarily held. Native input, scene rendering, fence allocation/deletion and buffer resizing stay real.'});
    const interruptions=[];
    for(const crossBoundary of[false,true]){
      if((await state(page)).target>=0)await clear(page);else await leavePreview(page);await jump(page,0);const beforeReset=await state(page);await page.evaluate(()=>{window.__frameworkInspectionProbe.hold=true;});
      await page.locator(hit(0)).click();await page.waitForFunction(()=>window.__frameworkInspectionProbe.fences.some(fence=>!fence.deleted&&fence.held>0));
      await page.locator(hit(1)).click();await page.locator(overview).click();await page.waitForFunction(()=>document.querySelector('[data-selected-work]').dataset.selectedInspectionTarget==='-1');
      if(crossBoundary)await scrollOnly(page,.37);
      const pendingReset=await state(page);assert.equal(pendingReset.frames,beforeReset.frames,'A to B to Show all stays pending until actual GPU completion');assert.ok(pendingReset.submitted<=beforeReset.submitted+1,'Rapid reset retains no queued selection draws');
      await page.evaluate(()=>{window.__frameworkInspectionProbe.hold=false;});await settled(page,-1,'overview');const reset=await state(page),resetTrace=await trace(page);
      assert.deepEqual(reset.renderedWeights,[0,0,0,0],'The newest overview request fully converges after a held draw');
      if(crossBoundary){const first=resetTrace.published.find(value=>value.frames>beforeReset.frames);assert.ok(first);near(Number(first.data.selectedRenderedProgress),.37,'First masked boundary reveal samples newest scroll target',.001);assert.equal(first.target,-1);assert.equal(first.data.selectedInspectionPresentedRevision,reset.data.selectedInspectionRevision,'Masked boundary reveal carries the newest inspection revision');}
      await idle(page,'Held '+(crossBoundary?'outgoing boundary':'Show all'));interruptions.push({crossBoundary,before:beforeReset,pending:pendingReset,after:reset});
    }
    await save(run,'inspection-held-gpu-show-all-and-outgoing-boundary',{interruptions,trace:await trace(page)},false);
  }catch(error){await diagnose(run,'inspection-held-gpu',error);throw error;}finally{await page.evaluate(()=>{window.__frameworkInspectionProbe.hold=false;}).catch(()=>{});await run.context.close();}
}
async function restoration(browser){
  const run=await open(browser),{page}=run;
  try{
    await start(run);const initial=await trace(page);await pin(page,0);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForFunction(()=>scrollY===0&&document.querySelector('[data-selected-work]').dataset.selectedInspectionTarget==='-1');
    await page.waitForTimeout(250);const offscreen=await state(page);await page.waitForTimeout(700);assert.equal((await state(page)).submitted,offscreen.submitted,'Leaving a pinned scene stops live GPU submissions');
    await jump(page,0);await settled(page,-1,'overview');await pin(page,1);await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-selected-work]').dataset.selectedState==='static');assertLinks(await links(page));assert.equal((await state(page)).target,-1,'Reduced motion resets a pinned inspection');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.locator(selected+'.is-scene').waitFor();await jump(page,0);await settled(page,-1,'overview');
    const restored=await trace(page);assert.deepEqual(restored.contexts.filter(item=>item.kind==='selected'),initial.contexts.filter(item=>item.kind==='selected'),'Offscreen/preference restoration reuses the original Selected context');await layoutProof(page,-1);await idle(page,'Pinned offscreen/preference restoration');await save(run,'inspection-offscreen-reduced-motion-restores-overview',{offscreen,trace:restored});
  }catch(error){await diagnose(run,'inspection-restoration',error);throw error;}finally{await run.context.close();}
}
async function fallback(browser){
  for(const [name,options]of[['reduced-motion',{reduced:true}],['save-data',{saveData:true}],['no-webgl',{noWebGL:true}]]){
    const run=await open(browser,{width:320,height:740,...options});try{
      await run.page.goto(base+'/v2/?v=inspection-'+name+'#work-framework',{waitUntil:'domcontentloaded'});await run.page.waitForFunction(()=>['static','unavailable'].includes(document.querySelector('[data-selected-work]').dataset.selectedState));
      assertLinks(await links(run.page));await descriptionProof(run.page);assert.equal(await run.page.locator(selected+'.is-scene').count(),0,'Preference/failure keeps the readable original gallery');
      for(const link of await run.page.locator(selected+' [data-selected-chapter] a[href]').all())assert.equal(await link.isVisible(),true,'All original project links remain visible');
      assert.equal(await run.page.locator('[data-framework-inspect]:visible').count(),0,'Unavailable rendering leaves no dead inspection buttons');assert.equal((await state(run.page)).overflow,false);await save(run,'inspection-'+name+'-fallback',{options});
    }catch(error){await diagnose(run,'inspection-'+name,error);throw error;}finally{await run.context.close();}
  }
}
(async()=>{
  const group=process.argv.find(argument=>argument.startsWith('--group='))?.slice('--group='.length);
  assert.ok(!group||['desktop','mobile390','mobile320','lifecycle'].includes(group),'Unknown inspection browser group '+group);
  fs.mkdirSync(output,{recursive:true});sourceContract();if(!group||group==='desktop'||process.argv.includes('--source-only'))await sourceGeometry();if(process.argv.includes('--source-only'))return;
  const {chromium}=require('playwright'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{const failures=[];for(const [label,test,testGroup]of[['desktop',()=>visualAndInput(browser,{width:1440,height:900}),'desktop'],['mobile390',()=>visualAndInput(browser,{width:390,height:844}),'mobile390'],['mobile320',()=>visualAndInput(browser,{width:320,height:740}),'mobile320'],['heldGPU',()=>heldGPU(browser),'lifecycle'],['restoration',()=>restoration(browser),'lifecycle'],['fallback',()=>fallback(browser),'lifecycle']]){if(group&&group!==testGroup)continue;try{await test();}catch(error){failures.push(error);console.error('FAIL '+label+': '+error.message);evidence.push({name:label+'-failure',error:error.stack});}}if(failures.length)throw new AggregateError(failures,failures.length+' independent inspection case(s) failed');}
  finally{await browser.close();}console.log(evidence.length+' Framework inspection groups passed.');
})().catch(error=>{console.error(error);evidence.push({name:'failure',error:error.stack});process.exitCode=1;}).finally(()=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');});
