/* Source/unit acceptance for v3-only controls. No browser, fake rendering,
 * performance, visual-fit or device-GPU claim is made by this suite. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('assets/v2-selected-work.js');
const selected=read('assets/v3-product-selected.js');
const heroSource=read('assets/v2-assembly.js');
const hero=read('assets/v3-product-assembly.js');
const baseline='0730dbf';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
function functionSource(code,name){
  const re=new RegExp('^  (?:async )?function '+name+'\\(','m'),match=re.exec(code);
  assert.ok(match,'Production function exists: '+name);
  const end=code.indexOf('\n  }',match.index);
  assert.ok(end>=0,'Production function end exists: '+name);
  return code.slice(match.index,end+4);
}
function sourceContract(){
  for(const file of ['assets/v2-assembly.js','assets/v2-selected-work.js','assets/v2-selected-scene.js','assets/v2-hero-motion.js','assets/v2-hero-environment.js','assets/v2-hero-assets.js','assets/v2-selected-assets.js','assets/v2-gpu-preparation.js']){
    assert.equal(read(file),execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8'}),'Restored v2 source untouched: '+file);
  }
  const expected=heroSource
    .replaceAll("href:'/v2/projects/","href:'/v3/projects/")
    .replace("    exploreLink.setAttribute('aria-label', `Explore ${project.title} project`);","    const label = `Open ${project.title}`;\n    exploreLink.setAttribute('aria-label', label);\n    const openLabel = exploreLink.querySelector('[data-product-open-label]');\n    if (openLabel) openLabel.textContent = label;")
    .replace('      projectLink.href = project.href;','      if (projectLink) projectLink.href = project.href;')
    .replace('    projectLink.tabIndex = opacity>.5 ? 0 : -1;','    if (projectLink) projectLink.tabIndex = opacity>.5 ? 0 : -1;')
    .replace("caption.setAttribute('aria-hidden','true');projectLink.tabIndex=-1;","caption.setAttribute('aria-hidden','true');if(projectLink)projectLink.tabIndex=-1;");
  assert.equal(hero,expected,'Hero clone differs only in navigation and optional caption-link handling');
  for(const name of ['stepInspection','publishInspection','chapter','mask','dispose','invalidate','fallback','fail','fitLight','pixelRatio','prepareShadowSize','draw','gpuComplete','finishPreparation','render','prepareSources','initialize','prepareInBackground','start']){
    assert.equal(functionSource(selected,name),functionSource(source,name),'Exact retained production function: '+name);
  }
  const scrollPrelude='    // Some browsers dispatch reflow\'s scroll before resize. Never interpret\n    // the old scene distance/origin against the new viewport.\n    if(viewportChanged()){layout();return;}\n';
  assert.equal(functionSource(selected,'updateScroll').replace(scrollPrelude,'').replace('    rememberLayoutAnchor(pinned);\n',''),functionSource(source,'updateScroll'),'Scroll sampling differs only in the approved viewport guard and pinned-position snapshot');
  const layoutPrelude="    const restoreProgress=viewportChanged()&&layoutAnchor&&layoutAnchor.hash===location.hash&&allowed()&&!failed&&activePage&&!document.hidden?layoutAnchor.progress:undefined;\n    viewportWidth=innerWidth;viewportAngle=viewportOrientation();layoutAnchor=undefined;\n    if(inspectUI?.contains(document.activeElement))inspectionFocusReturn=links[progress<.57?0:1];\n";
  const layoutCorrection="    if(restoreProgress!==undefined){\n      top=scrollY+track.getBoundingClientRect().top;\n      scrollTo({top:top-pinned+restoreProgress*distance,behavior:'instant'});\n    }\n";
  assert.equal(functionSource(selected,'layout').replace(layoutPrelude,'').replace(layoutCorrection,''),functionSource(source,'layout'),'Layout differs only in the approved one-shot native scroll continuity and focus capture; renderer/DPR/distance stay exact');
  for(const declaration of ['const request =','const idleTurn =','const inspectionMoving=','const foregroundSettled=']){
    const start=source.indexOf(declaration),end=source.indexOf('\n  };',start);
    const snippet=declaration==='const request ='||declaration==='const inspectionMoving='?source.slice(start,source.indexOf('\n',start)):source.slice(start,end+5);
    assert.ok(selected.includes(snippet),'Unchanged scheduling/ownership contract: '+declaration);
  }
  const sources=code=>[...code.matchAll(/(?:script|loadScript)\('([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(sources(selected),sources(source),'No new model, script or GPU dependency');
  assert.equal((selected.match(/document\.createElement\('canvas'\)/g)||[]).length,1,'Inspection uses the original single selected canvas');
  assert.equal((selected.match(/new T\.WebGLRenderer\(/g)||[]).length,1,'No new renderer');
  assert.equal((selected.match(/requestAnimationFrame\(/g)||[]).length,(source.match(/requestAnimationFrame\(/g)||[]).length,'Controls introduce no unpaced frame loop');
  assert.ok(selected.includes("matchMedia('(max-width:1024px), (pointer:coarse)')"),'Phone/tablet and coarse-pointer landscape controls');
  assert.ok(selected.includes("nav.setAttribute('aria-label','On this page')"));
  assert.ok(selected.includes("skipScene.href='#skylabs-aircraft'"),'Native skip remains');
  assert.ok(selected.includes("link.href='#'+ids[i]"),'Native chapter hashes remain');
  const html=read('v3/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),section=html.slice(html.indexOf('data-selected-work'),html.indexOf('data-aircraft-hero'));
  for(const project of ['framework-expansion-card','framework-dual-usb','framework-raspberry-pi','framework-logic-analyser'])assert.ok(section.includes('href="/v3/projects/'+project+'/"'),'Native project link remains separate from its preview: '+project);
  assert.match(html,/<span\b[^>]*data-assembly-title/,'Hero caption title is plain text');
  assert.equal((html.match(/data-assembly-explore/g)||[]).length,1,'One explicit hero project action');
  assert.ok(html.includes('data-product-open-label'),'Dynamic project action has a visible label');
  const css=read('assets/v3-product-controls.css');
  for(const selector of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{/g))assert.match(selector[1].trim(),/^body\.v3-product \.v3-product-/,'Styles only affect v3-specific control classes');
  assert.match(css,/min-height: 44px/);assert.match(css,/font-size: 16px/,'Native selector avoids automatic text zoom on iOS');
  console.log('PASS source: restored-v2 boundary, exact hero delta, renderer/fence/ownership/preparation/pose/quality parity');
}
function makeDOM(){
  let document;
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attributes=new Map();this.listeners=new Map();this.dataset={};this.style={setProperty(name,value){this[name]=value;}};this.hidden=false;this.inert=false;this.disabled=false;this.className='';this.value='';this.bounds={top:0,bottom:900,left:0,right:390,width:390,height:900};this.clientWidth=390;this.clientHeight=900;this.classList={contains:name=>this.className.split(/\s+/).includes(name),add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');},toggle:(name,force)=>{const add=force??!this.classList.contains(name);this.classList[add?'add':'remove'](name);return add;}};}
    append(...nodes){for(const node of nodes){node.remove();this.children.push(node);node.parentElement=this;}}
    insertBefore(node,before){node.remove();const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,node);node.parentElement=this;}
    remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    setAttribute(name,value){this.attributes.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);}
    getAttribute(name){return this.attributes.get(name)??null;}
    removeAttribute(name){this.attributes.delete(name);}
    addEventListener(name,callback){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(callback);}
    emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn({target:this,preventDefault(){this.defaultPrevented=true;},...event});}
    matches(selector){if(selector===':focus-visible')return true;if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('[')){const [name,value]=selector.slice(1,-1).split('=');return this.attributes.has(name)&&(value===undefined||this.getAttribute(name)===value.replace(/^['"]|['"]$/g,''));}return this.tagName===selector.toUpperCase();}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    focus(){const old=document.activeElement;document.activeElement=this;this.emit('focus');if(old&&old!==this)for(let parent=old;parent;parent=parent.parentElement)parent.emit('focusout',{target:old});}
    getBoundingClientRect(){return this.bounds;}
    scrollIntoView(){}
  }
  const root=new Element('section');root.setAttribute('data-selected-work','');
  for(let index=0;index<2;index++){const article=new Element('article');article.setAttribute('data-selected-chapter',String(index));const footer=new Element();footer.className='v2-framework-copy';article.append(footer);root.append(article);}
  document={activeElement:null,hidden:false,documentElement:new Element('html'),querySelector:selector=>selector==='[data-selected-work]'?root:null,createElement:tag=>new Element(tag),addEventListener(){},head:new Element('head')};
  return{document,root,Element};
}
function controlsContext({width=390,coarse=false}={}){
  const dom=makeDOM(),events=new Map(),media=new Map(),frames=new Map(),scrollCalls=[];let nextFrame=0;
  const sandbox={...dom,console,performance,queueMicrotask,Float32Array,Promise,URLSearchParams,AbortController,innerWidth:width,innerHeight:900,scrollY:0,devicePixelRatio:1,location:{hash:'',search:''},navigator:{connection:{saveData:false,addEventListener(){}}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},DecompressionStream:class{},getComputedStyle:()=>({top:String(sandbox.testPinned||0)+'px',scrollPaddingTop:String(sandbox.testPinned||0)+'px'}),requestAnimationFrame:callback=>{frames.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:()=>0,clearTimeout(){},dispatchEvent(){},addEventListener:(name,callback)=>events.set(name,callback),matchMedia:query=>{const value={matches:query.includes('pointer:coarse')?(width<=1024||coarse):false,listeners:[],addEventListener(name,fn){this.listeners.push(fn);},change(matches){this.matches=matches;for(const fn of this.listeners)fn();}};media.set(query,value);return value;}};
  sandbox.window=sandbox;sandbox.screen={orientation:{angle:0}};sandbox.scrollTo=options=>{scrollCalls.push(options);sandbox.scrollY=options.top;};
  const instrument=`
  window.testControls={
    setup(){stage=document.createElement('div');nav=document.createElement('nav');canvas=document.createElement('canvas');track=document.createElement('div');bar=document.createElement('span');links=[document.createElement('a'),document.createElement('a')];links.forEach(link=>nav.append(link));stage.append(nav,canvas);root.append(stage,track);ready=true;backgroundDone=true;visible=true;root.classList.add('is-live');inspectionControls();inspectionAvailability();cancelAnimationFrame(frame);frame=0;},
    state:()=>({target:inspectTarget,mode:inspectMode,weights:[...inspection.weights],revision:inspectRevision,frame,liveBusy,raw:progress,current,distance,anchored:Boolean(layoutAnchor)}),
    ui:()=>({stage,nav,track,links,select:inspectSelect,selectControl:inspectSelectControl,group:inspectGroup,buttons:inspectButtons,overview:overviewButton,container:inspectUI}),
    setBusy(value){liveBusy=value;},setChapter(value){currentChapter=value;},request,stepInspection,inspectionAvailability,layout,
    resetFrame(){cancelAnimationFrame(frame);frame=0;},
    setLive(){root.classList.add('is-live');inspectionAvailability();},
    scroll(value,offscreen=false){root.bounds={...root.bounds,top:offscreen?-2000:0,bottom:offscreen?-500:1200};track.bounds={...track.bounds,top:-value*distance};updateScroll();},
    disable(){fallback();},
    disableAsync(){prepareSources=async()=>{};prepareInBackground=()=>{};initialize=async()=>{};prepareTransfers=async()=>{};}
  };`;
  assert.ok(selected.endsWith('  start();\n})();\n'));
  vm.runInNewContext(selected.replace(/  start\(\);\n\}\)\(\);\n$/,instrument+'\n})();\n'),sandbox,{filename:'v3-product-selected.js'});
  sandbox.testControls.setup();sandbox.testControls.disableAsync();
  return{...dom,sandbox,api:sandbox.testControls,media,events,frames,scrollCalls,compact:media.get('(max-width:1024px), (pointer:coarse)')};
}
async function controlTests(){
  for(const [width,coarse]of[[320,false],[390,false],[768,false],[1024,false],[1180,true],[1440,true]]){
    const test=controlsContext({width,coarse}),{api,document,frames}=test,ui=api.ui();
    assert.equal(ui.select.tagName,'SELECT');assert.equal(ui.selectControl.tagName,'LABEL');assert.equal(ui.selectControl.htmlFor,ui.select.id);assert.equal(ui.selectControl.children[0].textContent,'Preview card');
    assert.deepEqual(ui.select.children.map(option=>[option.value,option.textContent]),[['-1','All cards'],['0','ESP32-S3'],['1','Dual USB-C'],['2','RP2354B'],['3','Logic analyser']]);
    assert.equal(ui.selectControl.hidden,false);assert.equal(ui.group.hidden,true);assert.equal(ui.group.inert,true);assert.equal(ui.overview.hidden,true);assert.ok(ui.buttons.every(button=>button.disabled));
    api.setBusy(true);
    for(const index of [0,1,2,3,0,2,1,3]){ui.select.value=String(index);ui.select.emit('change');assert.equal(api.state().target,index);assert.equal(api.state().mode,'pinned');}
    assert.equal(frames.size,0,'Select never bypasses an in-flight frame');
    api.setBusy(false);api.request();api.request();assert.equal(frames.size,1,'Repeated input queues at most one paced frame');
    for(let time=16;time<2000;time+=16)api.stepInspection(time);
    assert.deepEqual(Array.from(api.state().weights),[0,0,0,1],'Select drives actual production inspection weights');
    ui.stage.emit('pointermove',{pointerType:'mouse',clientX:20,clientY:20,target:ui.buttons[0]});ui.stage.emit('pointerleave');assert.equal(api.state().target,3,'Coarse/tablet path does not require or react to hover');
    ui.select.focus();test.compact.change(false);assert.equal(ui.selectControl.hidden,true);assert.equal(ui.group.inert,false);assert.equal(document.activeElement,ui.buttons[3]);assert.equal(api.state().target,3);assert.equal(api.state().mode,'pinned');assert.deepEqual(Array.from(api.state().weights),[0,0,0,1]);
    test.compact.change(true);assert.equal(document.activeElement,ui.select);assert.equal(ui.select.value,'3');assert.equal(api.state().target,3);await flush();assert.equal(api.state().target,3,'Queued focusout after rotation does not clear the selected card');
    ui.select.focus();test.events.get('resize')();assert.equal(ui.container.hidden,true);assert.equal(document.activeElement,ui.links[0],'Masked resize parks focus on the visible chapter');assert.equal(api.state().target,3);api.setLive();assert.equal(document.activeElement,ui.select,'Completed resize repaint restores the focused preview control');assert.equal(api.state().target,3);assert.deepEqual(Array.from(api.state().weights),[0,0,0,1]);
    ui.stage.clientHeight+=10;test.events.get('resize')();const other=document.createElement('a');other.focus();api.setLive();assert.equal(document.activeElement,other,'Resize never steals focus after the visitor moves it');ui.select.focus();
    let nativePrevented=false;ui.stage.emit('keydown',{target:ui.select,key:'Escape',preventDefault(){nativePrevented=true;}});assert.equal(nativePrevented,false,'Native select owns Escape while its popup is active');assert.equal(api.state().target,3);
    let prevented=false;ui.stage.emit('keydown',{key:'Escape',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(api.state().target,-1);assert.equal(ui.select.value,'-1');assert.equal(document.activeElement,ui.select);
    ui.select.value='2';ui.select.emit('change');ui.select.value='-1';ui.select.emit('change');assert.equal(api.state().target,-1);for(let time=2016;time<4000;time+=16)api.stepInspection(time);assert.deepEqual(Array.from(api.state().weights),[0,0,0,0]);
    ui.select.value='1';ui.select.emit('change');ui.select.focus();api.scroll(.4);assert.equal(api.state().target,-1);assert.equal(ui.container.hidden,true);assert.notEqual(document.activeElement,ui.select,'Chapter transition never leaves focus hidden');
    api.scroll(0);api.setLive();ui.select.value='2';ui.select.emit('change');api.stepInspection(4100);ui.select.focus();api.scroll(0,true);assert.equal(api.state().target,-1);assert.deepEqual(Array.from(api.state().weights),[0,0,0,0]);assert.equal(ui.select.disabled,true);assert.equal(ui.container.inert,true);
    api.scroll(0);api.setLive();ui.select.value='3';ui.select.emit('change');ui.select.focus();test.media.get('(prefers-reduced-motion: reduce)').change(true);assert.equal(api.state().target,-1);assert.deepEqual(Array.from(api.state().weights),[0,0,0,0]);assert.equal(ui.select.disabled,true);assert.equal(ui.container.hidden,true);
  }
  const desktop=controlsContext({width:1440}),ui=desktop.api.ui();assert.equal(ui.selectControl.hidden,true);assert.equal(ui.group.hidden,false);ui.buttons[1].focus();assert.equal(desktop.api.state().mode,'preview');ui.buttons[1].emit('click');assert.equal(desktop.api.state().mode,'pinned');ui.buttons[1].emit('click');assert.equal(desktop.api.state().target,-1);ui.buttons[2].focus();desktop.events.get('resize')();ui.stage.emit('pointermove',{pointerType:'mouse',clientX:10,clientY:10});ui.stage.emit('pointerleave');await flush();assert.equal(desktop.api.state().target,2,'Focused desktop preview survives masked resize focusout');desktop.api.setLive();assert.equal(desktop.document.activeElement,ui.buttons[2]);ui.stage.clientHeight+=10;desktop.events.get('resize')();await flush();const next=desktop.document.createElement('a');next.focus();desktop.api.setLive();assert.equal(desktop.document.activeElement,next);assert.equal(desktop.api.state().target,-1,'User focus elsewhere dismisses an unpinned preview after masked resize');ui.buttons[2].focus();desktop.compact.change(true);await flush();assert.equal(desktop.api.state().target,2,'A keyboard preview survives a responsive control switch');ui.select.focus();desktop.compact.change(false);await flush();assert.equal(desktop.api.state().target,2);
  console.log('PASS controls: native labels/options, 320–1440/coarse breakpoints, paced selection, all-cards, Escape, rotation/focus, chapter/offscreen/reduced-motion resets, desktop inspection');
}
function geometryContext({width=768,height=948,raw=.12,position='pinned'}={}){
  const test=controlsContext({width,coarse:true}),{api,sandbox}=test,ui=api.ui(),geometry={origin:5200,pinned:76,width,height};
  sandbox.testPinned=geometry.pinned;sandbox.innerHeight=height+geometry.pinned;
  ui.stage.clientWidth=width;ui.stage.clientHeight=height;
  sandbox.scrollY=position==='pinned'?geometry.origin-geometry.pinned+raw*height*(width<=760?1.9:1.7):position==='near'?geometry.origin-300:geometry.origin-1400;
  ui.track.getBoundingClientRect=()=>({top:geometry.origin-sandbox.scrollY});
  test.root.getBoundingClientRect=()=>({top:geometry.origin-110-sandbox.scrollY,bottom:geometry.origin+api.state().distance+ui.stage.clientHeight-sandbox.scrollY,width:ui.stage.clientWidth,height:api.state().distance+ui.stage.clientHeight+110});
  ui.stage.getBoundingClientRect=()=>{const top=Math.min(Math.max(geometry.origin-sandbox.scrollY,geometry.pinned),geometry.origin+api.state().distance-sandbox.scrollY);return{top,bottom:top+ui.stage.clientHeight,width:ui.stage.clientWidth,height:ui.stage.clientHeight};};
  api.layout();api.setLive();test.events.get('scroll')();test.scrollCalls.length=0;
  test.reflow=({width:nextWidth=geometry.width,height:nextHeight=geometry.height,shift=700,angle=sandbox.screen.orientation.angle}={})=>{geometry.width=nextWidth;geometry.height=nextHeight;geometry.origin+=shift;ui.stage.clientWidth=nextWidth;ui.stage.clientHeight=nextHeight;sandbox.innerWidth=nextWidth;sandbox.innerHeight=nextHeight+geometry.pinned;sandbox.screen.orientation.angle=angle;};
  return{...test,geometry};
}
async function rotationTests(){
  for(const order of ['scroll-first','resize-first'])for(const [oldWidth,newWidth,oldHeight,newHeight,shift]of[[768,1024,948,692,-700],[1024,768,692,948,700],[1180,820,744,1104,850]]){
    const test=geometryContext({width:oldWidth,height:oldHeight}),{api,sandbox,events,scrollCalls,geometry}=test,ui=api.ui();
    assert.equal(api.state().anchored,true,'Only the actually pinned stage records a continuity anchor');ui.select.value='2';ui.select.emit('change');ui.select.focus();const raw=api.state().raw;
    test.reflow({width:newWidth,height:newHeight,shift});events.get(order==='scroll-first'?'scroll':'resize')();events.get(order==='scroll-first'?'resize':'scroll')();
    assert.equal(scrollCalls.length,1,'One viewport change performs exactly one correction in '+order);assert.equal(scrollCalls[0].behavior,'instant');
    assert.ok(Math.abs(api.state().raw-raw)<1e-10,'Rotation preserves normalized raw progress');assert.equal(api.state().target,2,'Rotation cannot accidentally interpret reflow as a chapter transition');assert.equal(sandbox.scrollY,geometry.origin-geometry.pinned+raw*api.state().distance);
    assert.equal(ui.stage.getBoundingClientRect().top,geometry.pinned,'Stage remains at its real sticky boundary');api.setLive();assert.equal(test.document.activeElement,ui.select,'Focused Preview returns after current live repaint');
    events.get('resize')();events.get('scroll')();assert.equal(scrollCalls.length,1,'Repeated notifications cannot restore twice');
  }
  for(const position of ['near','offscreen']){
    const test=geometryContext({position});assert.equal(test.api.state().anchored,false);const before=test.sandbox.scrollY;test.reflow({width:1024,height:692});test.events.get('resize')();assert.equal(test.scrollCalls.length,0,position+' must not be pulled into the scene');assert.equal(test.sandbox.scrollY,before);
  }
  {
    const test=geometryContext(),old=test.api.state().raw;test.sandbox.scrollY+=100;test.events.get('scroll')();assert.ok(test.api.state().raw>old,'Ordinary scrolling remains native');assert.equal(test.scrollCalls.length,0);
    test.reflow({height:860,shift:450});const before=test.sandbox.scrollY;test.events.get('resize')();assert.equal(test.scrollCalls.length,0,'Height-only chrome/keyboard changes never snap the page');assert.equal(test.sandbox.scrollY,before);
  }
  {
    const test=geometryContext();test.api.setChapter(-1);test.events.get('scroll')();assert.equal(test.api.state().anchored,false);test.reflow({width:1024,height:692});test.events.get('resize')();assert.equal(test.scrollCalls.length,0,'No active chapter cannot supply a restore anchor');
  }
  for(const input of ['wheel','touchmove','keydown','hash']){
    const test=geometryContext();test.reflow({width:1024,height:692});if(input==='hash')test.sandbox.location.hash='#work-transit';else test.events.get(input)({key:'PageDown',target:{tagName:'BODY'}});const before=test.sandbox.scrollY;test.events.get('scroll')();assert.equal(test.scrollCalls.length,0,'New '+input+' wins over a stale pre-reflow anchor');assert.equal(test.sandbox.scrollY,before);
  }
  for(const preference of ['(prefers-reduced-motion: reduce)','(max-height:600px)']){
    const test=geometryContext();test.reflow({width:1024,height:692});test.media.get(preference).change(true);test.events.get('resize')();assert.equal(test.scrollCalls.length,0,'Preference/static fallback cannot restore a scene');assert.equal(test.api.state().target,-1);
  }
  {
    const test=geometryContext();test.reflow({angle:90,shift:300});test.events.get('resize')();assert.equal(test.scrollCalls.length,1,'A genuine orientation change also retains a pinned scene');
  }
  console.log('PASS rotation: raw pinned progress, both event orders, one native correction, focus/inspection retained, near/offscreen/height-only/inactive/input/hash/preference exclusions');
}
function transferContext({visible=false,intent=false,waiting=false}={}){
  const heroes=new Map(['tramtrace','telemetry','pi'].map(name=>[name,deferred()])),prefetch=[],promotions=[],timers=new Map(),priority=waiting?deferred():null;
  const sandbox={visible,preparationIntent:intent,failed:false,releaseTransfer:undefined,transferTask:undefined,root:{dataset:{}},names:['esp32','dual','pi','logic','metro','tramtrace'],allowed:()=>true,prepareSources:async()=>{},setTimeout:(callback,delay)=>{const id={};timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id)};
  sandbox.window={V2TransportPriority:{wait:()=>priority?.promise,promote:name=>promotions.push(name)},V2HeroAssets:{whenTransferSettled:name=>heroes.get(name).promise},V2SelectedAssets:{prefetch:name=>{prefetch.push(name);return Promise.resolve();}}};
  vm.createContext(sandbox);vm.runInContext(functionSource(selected,'prepareTransfers')+'\nthis.prepareTransfers=prepareTransfers;',sandbox);
  return{sandbox,heroes,prefetch,promotions,timers,priority,run:promote=>sandbox.prepareTransfers(promote)};
}
async function transferTests(){
  {
    const test=transferContext(),first=test.run(true);await flush();assert.equal(test.prefetch.length,0,'Automatic offscreen near start waits for hero raw bytes');
    const again=test.run(true);await flush();assert.equal(test.prefetch.length,0,'Repeated near initialize cannot release existing hero gate');
    test.heroes.get('tramtrace').resolve();test.heroes.get('telemetry').resolve();await flush();assert.equal(test.prefetch.length,0,'All three heroes are required');test.heroes.get('pi').resolve();await Promise.all([first,again]);assert.equal(test.prefetch.length,6);assert.equal(new Set(test.prefetch).size,6);assert.equal(test.promotions.length,0);assert.equal(test.timers.size,0);
  }
  {
    const test=transferContext({waiting:true}),first=test.run(true);await flush();assert.equal(test.prefetch.length,0,'Direct-aircraft required bytes remain first');test.priority.resolve();await first;assert.equal(test.prefetch.length,6,'Settled direct-aircraft gate resumes unrelated transports concurrently');assert.equal(test.promotions.length,0);assert.equal(test.timers.size,0);
  }
  for(const options of [{visible:true},{intent:true}]){const test=transferContext(options);await test.run(true);assert.equal(test.prefetch.length,6);assert.deepEqual(test.promotions,['selected']);}
  const promotion=transferContext(),first=promotion.run(false);await flush();promotion.sandbox.visible=true;await promotion.run(true);await first;assert.equal(promotion.prefetch.length,6,'Actual visibility releases an existing wait');
  const late=transferContext({visible:true,waiting:true}),pending=late.run(true);await flush();late.sandbox.visible=false;late.priority.resolve();await flush();await pending;assert.equal(late.prefetch.length,6,'One-way direct-aircraft release is retained even if visibility changes while waiting');
  const timeout=transferContext(),bounded=timeout.run(true);await flush();const timer=[...timeout.timers.values()][0];assert.equal(timer.delay,4500,'Existing bounded all-hero timeout retained');timer.callback();await bounded;assert.equal(timeout.prefetch.length,6);
  console.log('PASS transport: all-three raw-byte gate, near/repeated non-promotion, direct-aircraft overlap, explicit/visible promotion, original timeout');
}
function heroTests(){
  const control=label=>({href:'',tabIndex:0,textContent:label,attributes:{},style:{setProperty(){},removeProperty(){}},setAttribute(name,value){this.attributes[name]=value;},classList:{toggle(){},remove(){},add(){}},removeAttribute(){},querySelector(){return this.child;}});
  for(const optionalLink of [false,true]){
    const nodes=new Map(['title','kind','description'].map(name=>['[data-assembly-'+name+']',control('')])),explore=control('');explore.child=control('');
    const sandbox={projects:[{title:'TramTrace',kind:'Display',description:'Rail',href:'/v3/projects/tramtrace/'},{title:'Telemetry',kind:'Skylabs',description:'Radio',href:'/v3/projects/skylabs/boards/telemetry/'},{title:'Raspberry Pi',kind:'Framework',description:'RP2354B',href:'/v3/projects/framework-raspberry-pi/'}],root:{querySelector:selector=>nodes.get(selector),dataset:{},classList:{remove(){},add(){}}},caption:control(''),selectors:[control(''),control(''),control('')],projectLink:optionalLink?control(''):null,exploreLink:explore,active:-1,loadingExperience:null,interrupt(){},target:0,current:0,intro:control(''),posters:[],setSceneControls(){},ready:false,clamp:(n,min=0,max=1)=>Math.min(max,Math.max(min,n)),ramp:(value,start,end)=>Math.max(0,Math.min(1,(value-start)/(end-start)))};
    const arrow=name=>{const start=hero.indexOf('  const '+name+' ='),end=hero.indexOf('\n  };',start);return hero.slice(start,end+5);};
    vm.createContext(sandbox);vm.runInContext(arrow('setExploreProject')+'\n'+arrow('captionAt')+'\n'+arrow('staticMode')+'\nthis.captionAt=captionAt;this.staticMode=staticMode;',sandbox);
    for(const [index,progress]of[[0,.265],[1,.565],[2,.88]]){sandbox.captionAt(progress);assert.equal(explore.href,sandbox.projects[index].href);assert.equal(explore.attributes['aria-label'],'Open '+sandbox.projects[index].title);assert.equal(explore.child.textContent,'Open '+sandbox.projects[index].title);if(optionalLink)assert.equal(sandbox.projectLink.href,explore.href);}
    sandbox.captionAt(0);assert.equal(explore.child.textContent,'Open TramTrace');if(optionalLink)assert.equal(sandbox.projectLink.tabIndex,-1);sandbox.staticMode();assert.equal(sandbox.root.dataset.assemblyState,'static');assert.equal(explore.child.textContent,'Open TramTrace');
  }
  console.log('PASS hero: plain caption span, one explicit Open project link, three dynamic destinations and original caption windows');
}
(async()=>{sourceContract();heroTests();await controlTests();await rotationTests();await transferTests();console.log('PASS v3 product controls source/unit suite (browser and visual QA not run)');})().catch(error=>{console.error(error);process.exitCode=1;});
