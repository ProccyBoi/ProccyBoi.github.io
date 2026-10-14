#!/usr/bin/env node
/* v3 product review: real native navigation and current completed CAD frames.
 *
 * Serve the repository root, then:
 *   node scripts/verify-v3-product-browser.cjs --viewport=ipad768
 *   node scripts/verify-v3-product-browser.cjs --fallbacks
 *   node scripts/verify-v3-product-browser.cjs --profile
 *   node scripts/verify-v3-product-browser.cjs --self-test
 *
 * Optional V3_PRODUCT_BASE_URL, V3_PRODUCT_OUT, V3_PRODUCT_TIMEOUT,
 * CHROMIUM_EXECUTABLE. Official Playwright 1.57 Chromium / SwiftShader is used
 * in Actions. Viewports are sharded so no job serializes six GPU-heavy visits.
 * No capture APIs, seek APIs, scene mutation, geometry substitution or mocked
 * rendering. Observers call native WebGL methods unchanged. Screenshots wait
 * for the actual native destination, a newer published/fenced current pose,
 * decoded visible images and completed canvas fades. Submission != completion.
 * Book's exact endpoint is mocked before every navigation; other external
 * requests and all unexpected non-GET requests are blocked. No real booking.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = (process.env.V3_PRODUCT_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v[23]$/, '');
const profileBaselineCommit = '45c386e61fec7ee54b42378a9c963e5d8f0dd0ae';
const profileBaselineBase = process.env.V3_PRODUCT_BASELINE_URL?.replace(/\/$/, '');
const output = path.resolve(process.env.V3_PRODUCT_OUT || '.codex-temp/v3-product-review');
const timeout = Number(process.env.V3_PRODUCT_TIMEOUT || 180000);
const argv = process.argv.slice(2);
const viewports = {
  desktop1440: { width:1440, height:900, touch:false },
  phone390: { width:390, height:844, touch:true },
  phone320: { width:320, height:780, touch:true },
  ipad768: { width:768, height:1024, touch:true, rotation:{width:1024,height:768} },
  ipad1024: { width:1024, height:768, touch:true, rotation:{width:768,height:1024} },
  ipad1180: { width:1180, height:820, touch:true, rotation:{width:820,height:1180} },
};
const endpoint = fs.readFileSync(path.join(root, 'v3/book/index.html'), 'utf8').match(/data-booking-endpoint="([^"]+)"/)[1];
const reports = [];
const write = (name, value) => fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const passed = (name, details = {}) => { reports.push({name, ...details}); console.log('PASS ' + name); };
const near = (a, b, epsilon = .00002) => Math.abs(a - b) <= epsilon;

// This same pure predicate runs in the browser and in adversarial unit checks.
// It cannot accept an old successful GPU submission at a new native position.
function currentFrame(sample, afterSequence = 0) {
  if (!sample || !Number.isFinite(sample.native) || !sample.visible || !sample.canvasVisible || sample.masked || sample.pending) return false;
  const frame = sample.frame;
  if (sample.kind === 'aircraft' && (sample.dataset?.aircraftState !== 'ready' || frame?.kind !== 'progress')) return false;
  if (!frame || frame.sequence <= afterSequence || !frame.published || frame.gpu?.state !== 'complete') return false;
  if (!Number.isFinite(frame.completedMs) || frame.completedMs < frame.submittedMs || Math.abs(frame.value - sample.native) > .000025) return false;
  if (Math.abs(sample.rendered - sample.native) > .000025 || frame.revision !== sample.revision || sample.presentedRevision !== sample.revision) return false;
  if (sample.layoutRevision !== undefined && frame.layoutRevision !== sample.layoutRevision) return false;
  if (!sample.fence || sample.fence.completed < frame.submittedMs || sample.fence.deleted === undefined) return false;
  if (sample.inspectionRevision !== undefined) {
    if (frame.inspectionRevision !== sample.inspectionRevision || sample.inspectionPresentedRevision !== sample.inspectionRevision) return false;
    if (!Array.isArray(frame.inspectionWeights) || frame.inspectionWeights.length !== 4) return false;
    if (!frame.inspectionWeights.every((value, index) => Math.abs(value - (index === sample.inspectionTarget ? 1 : 0)) <= .0005)) return false;
  }
  return true;
}

function installProbe() {
  const probe = window.__v3ProductProbe = { contexts:[], input:[], scrolls:[], focus:[], caseLayouts:[], sceneFrames:{}, started:performance.now() };
  for(const type of ['scroll','scrollend'])addEventListener(type,event=>{probe.scrolls.push({type,at:performance.now(),y:scrollY,trusted:event.isTrusted});if(probe.scrolls.length>100)probe.scrolls.shift();},{passive:true});
  const focusedNode=node=>node?{tag:node.tagName||'window',id:node.id||'',label:node.getAttribute?.('aria-label')||'',href:node.getAttribute?.('href')||''}:null;
  const focusTrace=(type,event)=>{const sample={type,at:performance.now(),viewport:{width:innerWidth,height:innerHeight},compact:matchMedia('(max-width:1024px), (pointer:coarse)').matches,target:focusedNode(event?.target),related:focusedNode(event?.relatedTarget),active:focusedNode(document.activeElement),navInert:document.querySelector('[data-v3-nav]')?.inert};probe.focus.push(sample);if(probe.focus.length>100)probe.focus.shift();queueMicrotask(()=>{sample.after={active:focusedNode(document.activeElement),navInert:document.querySelector('[data-v3-nav]')?.inert};});};
  for(const type of ['focusin','focusout','blur'])addEventListener(type,event=>focusTrace(type,event),{capture:true,passive:true});
  addEventListener('resize',event=>focusTrace('resize',event),{passive:true});
  matchMedia('(max-width:1024px), (pointer:coarse)').addEventListener('change',event=>focusTrace('compact-change',event));
  const contexts = new WeakMap();
  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const gl = nativeGetContext.call(this, type, ...args);
    if (!gl || !/webgl/.test(type) || contexts.has(gl)) return gl;
    const kind = this.matches('[data-assembly-canvas]') ? 'hero' : this.matches('[data-selected-canvas]') ? 'selected' : this.matches('[data-aircraft-canvas]') ? 'aircraft' : 'case';
    const record = {kind, type, fences:[], created:performance.now()}; contexts.set(gl, record); probe.contexts.push(record);
    if (gl.fenceSync && gl.clientWaitSync && gl.deleteSync) {
      const make = gl.fenceSync, poll = gl.clientWaitSync, remove = gl.deleteSync, fences = new Map();
      gl.fenceSync = function(...args) {
        const sync = make.apply(this, args);
        if (sync) { const fence = {created:performance.now(), polls:0}; fences.set(sync, fence); record.fences.push(fence); if (record.fences.length > 256) record.fences.shift(); }
        return sync;
      };
      gl.clientWaitSync = function(sync, ...args) {
        const result = poll.call(this, sync, ...args), fence = fences.get(sync);
        if (fence) { fence.polls++; fence.status = result; if (result === gl.ALREADY_SIGNALED || result === gl.CONDITION_SATISFIED) fence.completed = performance.now(); }
        return result;
      };
      gl.deleteSync = function(sync) { const result = remove.call(this, sync), fence = fences.get(sync); if (fence) { fence.deleted = performance.now(); fences.delete(sync); } return result; };
    }
    return gl;
  };
  for (const type of ['click', 'keydown', 'change', 'wheel', 'touchstart', 'touchmove', 'touchend']) {
    addEventListener(type, event => {
      const item = {type, key:event.key, trusted:event.isTrusted, at:performance.now(), target:event.target?.tagName, prevented:event.defaultPrevented};
      probe.input.push(item); if (probe.input.length > 150) probe.input.shift();
      queueMicrotask(() => { item.prevented = event.defaultPrevented; });
    }, {capture:true, passive:true});
  }
  const rect = node => { if (!node) return null; const b = node.getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height,top:b.top,right:b.right,bottom:b.bottom,left:b.left}; };
  probe.readCaseLayout = () => {
    const target=document.getElementById('details'),pi=document.querySelector('[data-pi-inspector]');if(!target||!pi)return null;
    const control=pi.querySelector('.pi-controls'),b=rect(target),style=getComputedStyle(target),html=getComputedStyle(document.documentElement);
    return{at:performance.now(),url:location.href,y:scrollY,details:{...b,documentTop:scrollY+b.top,scrollMarginTop:parseFloat(style.scrollMarginTop)||0},scrollPaddingTop:parseFloat(html.scrollPaddingTop)||0,documentHeight:document.scrollingElement.scrollHeight,piState:pi.dataset.piState,pi:rect(pi),controls:control?{...rect(control),display:getComputedStyle(control).display,visibility:getComputedStyle(control).visibility}:null,status:(()=>{const node=pi.querySelector('[data-pi-status]');return node?{...rect(node),text:node.textContent,fontSize:getComputedStyle(node).fontSize,lineHeight:getComputedStyle(node).lineHeight,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth}:null;})(),retry:(()=>{const node=pi.querySelector('[data-pi-start]');return node?{...rect(node),hidden:node.hidden,visibility:getComputedStyle(node).visibility}:null;})(),selector:document.querySelector('[aria-label="On this page"]')?.value};
  };
  const caseLayout=type=>{const sample=probe.readCaseLayout();if(sample){probe.caseLayouts.push({type,...sample});if(probe.caseLayouts.length>40)probe.caseLayouts.shift();}};
  addEventListener('hashchange',()=>caseLayout('hashchange'),{passive:true});
  new MutationObserver(()=>caseLayout('pi-state-change')).observe(document,{subtree:true,attributes:true,attributeFilter:['data-pi-state']});
  const parse = text => { try { return JSON.parse(text); } catch { return null; } };
  const clamp = value => Math.min(1, Math.max(0, value));
  const shown = node => { if (!node) return false; const s = getComputedStyle(node), b = node.getBoundingClientRect(); return !node.hidden && s.display !== 'none' && s.visibility === 'visible' && Number(s.opacity) >= .99 && b.width > 0 && b.height > 0; };
  probe.read = kind => {
    const selector = {hero:'[data-assembly]', selected:'[data-selected-work]', aircraft:'[data-aircraft-hero]'}[kind];
    const section = document.querySelector(selector); if (!section) return null;
    const data = section.dataset, stage = section.querySelector(kind === 'hero' ? '.v2-assembly-sticky' : kind === 'selected' ? '.v2-selected-stage' : '[data-aircraft-stage]');
    const canvas = section.querySelector(kind === 'hero' ? '[data-assembly-canvas]' : kind === 'selected' ? '[data-selected-canvas]' : 'canvas');
    if (!stage) return {kind, dataset:{...data}};
    const track = section.querySelector(kind === 'selected' ? '.v2-selected-track' : '.v3-aircraft-track');
    const pinned = parseFloat(getComputedStyle(stage).top) || 0, stageRect = rect(stage);
    const native = kind === 'hero' ? clamp((scrollY - (scrollY + section.getBoundingClientRect().top)) / Math.max(1, section.offsetHeight - stage.clientHeight))
      : kind === 'selected' ? (track ? clamp((scrollY - (scrollY + track.getBoundingClientRect().top) + pinned) / (parseFloat(track.style.height) - stage.clientHeight)) : NaN)
      : track ? clamp(-section.getBoundingClientRect().top / (parseFloat(track.style.height) - stage.clientHeight)) : NaN;
    const frames = Number(data[kind === 'hero' ? 'assemblyFrames' : kind + 'Frames'] || 0);
    let frame = parse(data[kind === 'hero' ? 'assemblyLastSubmission' : kind + 'LastFrame']);
    // Hero's production telemetry predates the published-frame record used by
    // the other scenes. Join its own current frame, exact latest submission and
    // real fence completion; models-ready alone cannot establish this result.
    if (kind === 'hero' && frame) frame = {...frame, submittedMs:frame.at, completedMs:Number(data.assemblyLastCompletedMs), published:data.assemblyGPUPending === 'false' && Math.abs(Number(data.assemblyProgress) - frame.value) < .000025, gpu:{state:data.assemblyGPUCompletion}};
    const fences = probe.contexts.find(context => context.kind === kind)?.fences || [];
    return {kind, url:location.href, y:scrollY, native, rendered:Number(data[kind === 'hero' ? 'assemblyProgress' : kind + 'RenderedProgress']), frames, frame,
      revision:kind === 'hero' ? frame?.revision : Number(data[kind + 'PoseRevision']), presentedRevision:kind === 'hero' ? frame?.revision : Number(data[kind + 'PresentedRevision']),
      ...(kind === 'selected' ? {inspectionTarget:Number(data.selectedInspectionTarget), inspectionRevision:Number(data.selectedInspectionRevision), inspectionPresentedRevision:Number(data.selectedInspectionPresentedRevision)} : {}),
      ...(kind === 'aircraft' ? {layoutRevision:Number(data.aircraftLayoutRevision)} : {}),
      visible:stageRect.bottom > Math.max(0, document.querySelector('.v2-header')?.getBoundingClientRect().bottom || 0) && stageRect.top < innerHeight,
      canvasVisible:shown(canvas), masked:kind === 'hero' ? !section.classList.contains('is-loaded') : data[kind + 'WarmMask'] !== 'false', pending:data[kind === 'hero' ? 'assemblyGPUPending' : kind + 'GPUPending'] === 'true',
      canvas:rect(canvas), stage:stageRect, fence:[...fences].reverse().find(fence => fence.completed !== undefined && fence.deleted !== undefined), dataset:{...data}};
  };
  probe.snapshot = () => ({url:location.href,y:scrollY,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,coarse:matchMedia('(pointer:coarse)').matches,touch:navigator.maxTouchPoints},
    overflow:document.documentElement.scrollWidth > innerWidth + 1,
    header:rect(document.querySelector('.v2-header')), active:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label'),id:document.activeElement?.id},
    scenes:Object.fromEntries(['hero','selected','aircraft'].map(kind => [kind,probe.read(kind)])),
    images:[...document.images].filter(image => {const b=image.getBoundingClientRect();return b.bottom>0&&b.top<innerHeight&&b.right>0&&b.left<innerWidth;}).map(image=>({src:image.currentSrc||image.src,complete:image.complete,naturalWidth:image.naturalWidth,decoded:image.dataset.imageDecoded,rect:rect(image)})),
    controls:[...document.querySelectorAll('[data-v3-menu],.v3-quick-projects,[data-v3-nav] a,select,[data-framework-overview],[data-framework-inspect]')].map(node=>({tag:node.tagName,label:node.getAttribute('aria-label')||node.textContent.trim(),value:node.value,href:node.getAttribute('href'),hidden:node.hidden,inert:node.inert,disabled:node.disabled,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility,rect:rect(node)})), contexts:probe.contexts, input:probe.input, scrolls:probe.scrolls, focus:probe.focus, caseLayout:probe.readCaseLayout(), caseLayouts:probe.caseLayouts});
}

async function networkGuard(context, allowedBase = base) {
  const state = {availability:[],submissions:[],blocked:[],mode:'ready',response:{ok:true},piModelGate:{held:false,requests:0,released:false,outcomes:[]}};
  let heldPiModel,observePiModel,piRelease,piReleased;
  state.holdPiModel=()=>{
    assert.equal(state.piModelGate.held,false);state.piModelGate.held=true;state.piModelGate.released=false;
    heldPiModel=new Promise(resolve=>{observePiModel=resolve;});
    piReleased=new Promise(resolve=>{piRelease=resolve;});
  };
  state.waitForHeldPiModel=async()=>{
    assert.ok(heldPiModel,'Arm the real Pi model gate before navigating');let timer;
    try{await Promise.race([heldPiModel,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Real Pi board GET never reached the armed test gate')),timeout);})]);}finally{clearTimeout(timer);}
  };
  state.releasePiModel=(outcome='continue')=>{if(state.piModelGate.held){state.piModelGate.held=false;state.piModelGate.released=true;state.piModelGate.outcomes.push(outcome);piRelease?.(outcome);}};
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin + url.pathname === endpoint) {
      if (request.method() === 'POST') {
        state.submissions.push(Object.fromEntries(new URLSearchParams(request.postData())));
        return route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><script>parent.postMessage(${JSON.stringify({source:'andrew-booking',...state.response})}, '*');<\/script>`});
      }
      assert.equal(request.method(), 'GET', 'Only mocked availability GET and booking POST are supported');
      assert.equal(url.searchParams.get('action'), 'availability');
      const callback = url.searchParams.get('callback'); assert.match(callback, /^andrewBookingAvailability\d+$/);
      state.availability.push(url.href);
      if (state.mode === 'error') return route.abort('failed');
      const duration = Number(url.searchParams.get('duration')), monday = new Date(url.searchParams.get('start') + 'T00:00:00Z');
      const days = Array.from({length:5}, (_, index) => {
        const day = new Date(monday); day.setUTCDate(day.getUTCDate() + index);
        return {anchor:day.toISOString(), slots:state.mode === 'empty' ? [] : [9,13].map(hour=>{const start=new Date(day);start.setUTCHours(hour);return {start:start.toISOString(),end:new Date(start.getTime()+duration*60000).toISOString()};})};
      });
      return route.fulfill({status:200,contentType:'text/javascript',body:`${callback}(${JSON.stringify({ok:true,token:'mock-v3-'+duration,days})});`});
    }
    if (url.origin === new URL(allowedBase).origin && ['GET','HEAD'].includes(request.method())) {
      // Delay only one genuine source asset, never replace a model or mutate
      // the viewer. This deterministically exercises late native-anchor layout.
      if(url.pathname==='/assets/models/framework-pi/framework-pi-board.glb'&&state.piModelGate.held){
        state.piModelGate.requests++;observePiModel();const outcome=await piReleased;if(outcome==='abort')return route.abort('failed');
      }
      return route.continue();
    }
    state.blocked.push({url:url.href,method:request.method()}); return route.abort('blockedbyclient');
  });
  return state;
}
async function open(browser, viewport, options = {}) {
  const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height},hasTouch:viewport.touch,isMobile:viewport.touch,deviceScaleFactor:1,serviceWorkers:'block',timezoneId:'Australia/Sydney',colorScheme:'dark',reducedMotion:options.reduced ? 'reduce' : 'no-preference',javaScriptEnabled:!options.noJS});
  const network = await networkGuard(context);
  if (!options.noJS) {
    await context.addInitScript({content:`(${installProbe.toString()})(); window.__v3ProductProbe.matches = (${currentFrame.toString()});`});
    if (options.noWebGL) await context.addInitScript(() => {const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
  }
  const page = await context.newPage(), errors = [], shaders = [];
  page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (/shader.*(?:error|fail)|ERROR: 0:|VALIDATE_STATUS/i.test(message.text())) shaders.push(message.text());});
  return {context,page,network,errors,shaders,viewport,...options};
}
async function goto(run, route) { const response=await run.page.goto(base + route,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,route);await run.page.locator('h1').first().waitFor(); }
async function fit(page, label) { const size=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(size.content<=size.viewport+1,label+' horizontal overflow '+JSON.stringify(size)); }
async function imagesReady(page) {
  await page.evaluate(async () => {
    const visible = [...document.images].filter(image=>{const b=image.getBoundingClientRect(),s=getComputedStyle(image);return b.width>0&&b.height>0&&b.bottom>0&&b.top<innerHeight&&b.right>0&&b.left<innerWidth&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0;});
    await Promise.all(visible.map(async image=>{await image.decode();if(!image.naturalWidth)throw new Error('Visible image failed: '+image.src);}));
    if(document.fonts?.ready)await document.fonts.ready;
  });
}
async function scrollStable(page) {
  await page.evaluate(()=>{window.__v3ScrollStable=null;});
  await page.waitForFunction(()=>{const now=performance.now(),last=window.__v3ScrollStable;if(!last||Math.abs(last.y-scrollY)>.1){window.__v3ScrollStable={y:scrollY,at:now,frames:0};return false;}last.frames++;return last.frames>=4&&now-last.at>=180;},null,{polling:'raf',timeout});
}
async function sceneReady(page, kind, afterSequence = 0) {
  await page.waitForFunction(({kind,afterSequence})=>window.__v3ProductProbe.matches(window.__v3ProductProbe.read(kind),afterSequence),{kind,afterSequence},{timeout,polling:40});
  await imagesReady(page);
  await page.waitForFunction(kind=>{const selector={hero:'[data-assembly]',selected:'[data-selected-work]',aircraft:'[data-aircraft-hero]'}[kind],root=document.querySelector(selector);return root.getAnimations({subtree:true}).every(animation=>animation.effect?.getComputedTiming().iterations===Infinity||!['running','pending'].includes(animation.playState));},kind,{timeout});
  await scrollStable(page);
  assert.ok(await page.evaluate(kind=>window.__v3ProductProbe.matches(window.__v3ProductProbe.read(kind),0),kind),'The completed pose must still match after fades and native scrolling settle');
  return page.evaluate(kind=>window.__v3ProductProbe.read(kind),kind);
}
// Color math is deliberately shared by browser evidence and adversarial tests.
function colorValues(value) {
  if (value === 'transparent') return [0,0,0,0];
  const match = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!match) return null;
  const values = match[1].replace(/\s*\/\s*/, ',').split(/[\s,]+/).filter(Boolean).map(Number);
  return values.length >= 3 && values.every(Number.isFinite) ? [...values.slice(0,3), values[3] ?? 1] : null;
}
function compositeColor(front, back) {
  return front.slice(0,3).map((value,index)=>value*front[3]+back[index]*(1-front[3]));
}
function luminance(color) {
  return color.slice(0,3).map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
}
function contrastRatio(a,b) {
  const first=luminance(a),second=luminance(b);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);
}
async function lightPresentation(run, name, scene) {
  const evidence=await run.page.evaluate(({parseSource,compositeSource,luminanceSource,scene})=>{
    const colorValues=(0,eval)('('+parseSource+')'),compositeColor=(0,eval)('('+compositeSource+')');
    const luminance=(0,eval)('('+luminanceSource+')');
    const contrastRatio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const bounds=node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,top:b.top,right:b.right,bottom:b.bottom,left:b.left};};
    const visible=node=>{
      const b=node.getBoundingClientRect();if(!b.width||!b.height||b.bottom<=0||b.top>=innerHeight||b.right<=0||b.left>=innerWidth)return false;
      for(let parent=node;parent;parent=parent.parentElement){const s=getComputedStyle(parent);if(parent.hidden||s.display==='none'||s.visibility!=='visible'||Number(s.opacity)<.99)return false;}
      return true;
    };
    const background=node=>{
      const chain=[];for(let parent=node;parent;parent=parent.parentElement)chain.unshift(parent);
      let rgb=[255,255,255];const layers=[];
      for(const element of chain){const style=getComputedStyle(element),rgba=colorValues(style.backgroundColor);if(!rgba)throw Error('Unparsed background: '+style.backgroundColor);rgb=compositeColor(rgba,rgb);if(rgba[3]||style.backgroundImage!=='none')layers.push({tag:element.tagName,classes:element.className,color:style.backgroundColor,image:style.backgroundImage});}
      return {rgb,luminance:luminance(rgb),layers};
    };
    const describe=node=>{const style=getComputedStyle(node),bg=background(node);return{tag:node.tagName,id:node.id,classes:typeof node.className==='string'?node.className:'',text:(node.value||node.textContent||'').trim().slice(0,120),rect:bounds(node),background:bg,color:style.color,colorScheme:style.colorScheme,boxShadow:style.boxShadow,filter:style.filter,border:style.borderColor,backgroundImage:style.backgroundImage};};
    const surfaces=['body','.v2-header','[data-v3-nav]','.v2-assembly-sticky','.v2-selected-stage','[data-aircraft-stage]','.v2-collection-controls','.catalog-card-media','.v2-case-nav','.project-hero','.engineering-brief','.project-interactive','.hardware-stage','.pi-stage','.object-stage','.framework-3d-stage','.framework-dual-3d-stage','.coaster-3d-stage','.pcb-object-stage','.hardware-controls','.object-toolbar','.pcb-object-toolbar','.pi-controls','.pi-view-group','.pi-parts','.v2-part-readout','.framework-dual-part','.coaster-part','.framework-3d-status','.framework-dual-3d-status','.coaster-3d-status','.object-readout','.pcb-object-readout','.component-directory','.object-rotation-bar','.explorer-unavailable','.explorer-source-status','.lightbox[open]','.v2-lab .panel','.v2-lab .readout','.v2-lab .plot','.v2-lab .device-wrap','.v2-lab .note','.about-intro','.about-section','.booking-card','.booking-card-head','.booking-calendar','.booking-details','.booking-selection','.booking-success','.booking-no-script','.booking-status','.booking-fallback','.v2-contact','.v2-footer'];
    const native='select,input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=range]),textarea';
    const textSelectors=['.v2-brand','.v3-quick-projects','[data-v3-menu]','[data-v3-nav] a','h1','.v3-product-eyebrow','.v2-assembly-summary>p','.v2-assembly-caption h2','.v2-assembly-caption p','.v2-assembly-navigation a','.v2-assembly-choices button','.v3-product-preview-label','.v2-selected-heading h3','.v2-selected-heading p','.v2-framework-copy h4','.v2-framework-copy p','.v2-transport-copy h4','.v2-transport-copy p','.v2-selected-nav a','.v3-product-preview-control>span','.v3-aircraft-copy h2','.v3-aircraft-copy p','.v3-aircraft-copy a','.v3-aircraft-foot a','.project-hero-copy>div>p','.project-meta dt','.project-meta dd','.catalog-card h3','.catalog-card p','.catalog-card-copy small','.catalog-category','.project-interactive button','.project-interactive .v2-part-readout','.project-interactive .object-drag-hint','.project-interactive .framework-3d-status','.project-interactive .framework-dual-3d-status','.project-interactive .coaster-3d-status','.project-interactive .object-angle-readout','.project-interactive .explorer-unavailable','.project-interactive .explorer-source-status','.lightbox-controls button','[data-lightbox-caption]','.about-intro p','.about-hero-copy p','.about-section h2','.about-section p','.booking-hero p','.booking-clock span','.booking-clock strong','.booking-clock small','.booking-card-head span','.booking-card-head strong','.booking-notes h2','.booking-notes p','.booking-choice-group legend','.duration-options strong','.duration-options small','.format-options strong','.format-options small','.booking-form label','.booking-form h3','.booking-selection span','.booking-selection strong','.booking-selection small','.booking-success h3','.booking-success p','.booking-form-error','.booking-day-empty','.booking-status p','.booking-status strong','.booking-day-head span','.booking-day-head strong','.booking-no-script','.booking-fallback h2','.booking-fallback p','[data-slot]','[data-week-label]','[data-booking-submit]','[data-book-another]',native];
    const nodes=selector=>[...document.querySelectorAll(selector)].filter(visible);
    const text=nodes(textSelectors.join(',')).filter(node=>!node.disabled&&(node.textContent.trim()||node.value||node.placeholder)).map(node=>{
      const item=describe(node),style=getComputedStyle(node),rgba=colorValues(style.color);if(!rgba)throw Error('Unparsed text: '+style.color);
      const foreground=compositeColor(rgba,item.background.rgb),size=parseFloat(style.fontSize),weight=parseInt(style.fontWeight)||400;
      return{...item,foreground,contrast:contrastRatio(foreground,item.background.rgb),fontSize:size,fontWeight:weight,minimumContrast:size>=24||(size>=18.66&&weight>=700)?3:4.5};
    });
    const sceneRoot=scene?document.querySelector({hero:'[data-assembly]',selected:'[data-selected-work]',aircraft:'[data-aircraft-hero]'}[scene]):null;
    return{url:location.href,preferredDark:matchMedia('(prefers-color-scheme:dark)').matches,rootScheme:getComputedStyle(document.documentElement).colorScheme,bodyScheme:getComputedStyle(document.body).colorScheme,surfaces:nodes(surfaces.join(',')).map(describe),native:nodes(native).map(node=>({...describe(node),options:[...node.querySelectorAll('option')].map(option=>({value:option.value,color:getComputedStyle(option).color,background:getComputedStyle(option).backgroundColor,colorScheme:getComputedStyle(option).colorScheme})),placeholder:node.hasAttribute('placeholder')?{text:node.getAttribute('placeholder'),color:getComputedStyle(node,'::placeholder').color,opacity:getComputedStyle(node,'::placeholder').opacity}:null})),controls:nodes('button,input,select,textarea').map(node=>({...describe(node),disabled:node.disabled,checked:node.checked,pressed:node.getAttribute('aria-pressed'),focusVisible:node.matches(':focus-visible'),outline:getComputedStyle(node).outline})),text,
      scene:sceneRoot?{kind:scene,images:[...sceneRoot.querySelectorAll('img')].map(image=>({...describe(image),visible:visible(image),src:image.currentSrc||image.src,complete:image.complete,naturalWidth:image.naturalWidth})),canvases:[...sceneRoot.querySelectorAll('canvas')].map(canvas=>({...describe(canvas),visible:visible(canvas)}))}:null,
      note:'Computed ancestor-composited CSS colors are measured, not screenshot pixels or WebGL material contrast. Gradients, image layers, filters, and shadows are retained for visual review alongside exact completed-frame screenshots; this is not a full accessibility audit.'};
  },{parseSource:colorValues.toString(),compositeSource:compositeColor.toString(),luminanceSource:luminance.toString(),scene});
  write(name+'-light-presentation',evidence);
  assert.match(evidence.rootScheme,/^(only )?light( only)?$/,name+': root native UI explicitly uses light colors even under a dark OS preference');
  assert.match(evidence.bodyScheme,/^(only )?light( only)?$/,name+': body native color scheme');
  assert.ok(evidence.surfaces.some(item=>item.tag==='BODY'),name+': page light-surface measurement exists');
  for(const item of [...evidence.surfaces,...evidence.native])assert.ok(item.background.luminance>=.8,name+': light surface '+item.tag+'.'+item.classes+' '+JSON.stringify(item.background));
  for(const item of evidence.native){
    assert.match(item.colorScheme,/^(only )?light( only)?$/,name+': native field/picker inherits a light color scheme');
    for(const option of item.options)assert.match(option.colorScheme,/^(only )?light( only)?$/,name+': every native option uses the light color scheme');
    if(item.placeholder?.text){
      const color=colorValues(item.placeholder.color);assert.ok(color,name+': placeholder color is measurable');color[3]*=Number(item.placeholder.opacity);
      assert.ok(contrastRatio(compositeColor(color,item.background.rgb),item.background.rgb)+.015>=4.5,name+': placeholder remains readable');
    }
  }
  for(const item of evidence.text)assert.ok(item.contrast+.015>=item.minimumContrast,name+': readable '+item.tag+'.'+item.classes+' '+JSON.stringify({text:item.text,color:item.color,background:item.background.rgb,contrast:item.contrast,minimum:item.minimumContrast}));
  return evidence;
}

// Locator scrolling, rather than focus() or scrollTo(), frames the real state.
// Keep the user's current focus and wait for its actual post-scroll geometry.
async function frameTarget(run, selector, label) {
  const page=run.page,target=page.locator(selector);
  await target.waitFor({state:'visible'});
  const active=await page.evaluateHandle(()=>document.activeElement);
  await target.scrollIntoViewIfNeeded();await scrollStable(page);await imagesReady(page);
  await page.waitForFunction(selector=>{
    const node=document.querySelector(selector);if(!node)return false;
    const b=node.getBoundingClientRect(),now=performance.now(),key=[b.top,b.bottom,b.left,b.right].map(value=>Math.round(value*10)/10).join(','),last=window.__v3FramedTarget;
    if(!last||last.selector!==selector||last.key!==key){window.__v3FramedTarget={selector,key,at:now,frames:0};return false;}
    last.frames++;return last.frames>=4&&now-last.at>=120;
  },selector,{polling:'raf',timeout});
  const geometry=await target.evaluate(node=>{const b=node.getBoundingClientRect(),header=document.querySelector('.v2-header')?.getBoundingClientRect();return{selector:node.id||node.className,top:b.top,bottom:b.bottom,height:b.height,width:b.width,left:b.left,right:b.right,headerBottom:header?.bottom||0,viewport:{width:innerWidth,height:innerHeight},visibleHeight:Math.max(0,Math.min(b.bottom,innerHeight)-Math.max(b.top,header?.bottom||0))};});
  assert.ok(geometry.visibleHeight>=Math.min(geometry.height,geometry.viewport.height-geometry.headerBottom)*.65,label+': real target substantially occupies the viewport '+JSON.stringify(geometry));
  assert.ok(geometry.left>=-1&&geometry.right<=geometry.viewport.width+1,label+': target stays inside the viewport');
  assert.equal(await active.evaluate(node=>node===document.activeElement),true,label+': screenshot framing preserves the active element');
  await active.dispose();write(label+'-framing',geometry);return geometry;
}

async function shot(run, name, {scene, afterSequence=0, fullPage=false, target, presentationScene=scene} = {}) {
  if (scene) await sceneReady(run.page,scene,afterSequence); else {await imagesReady(run.page);if(!run.noJS){await scrollStable(run.page);await imagesReady(run.page);await scrollStable(run.page);}}
  if(target)await frameTarget(run,target,name);
  await fit(run.page,name);
  await lightPresentation(run,name,presentationScene);
  const before=await run.page.evaluate(()=>window.__v3ProductProbe?.snapshot()||({url:location.href,y:scrollY,viewport:{width:innerWidth,height:innerHeight},noJS:true}));
  await run.page.screenshot({path:path.join(output,name+'.png'),fullPage,caret:'hide',timeout:60000});
  const after=await run.page.evaluate(()=>({url:location.href,y:scrollY,scene:window.__v3ProductProbe?.snapshot().scenes}));
  write(name,{before,after,errors:run.errors,shaders:run.shaders,network:run.network});
  assert.equal(after.url,before.url,'Screenshot belongs to the same native destination'); assert.ok(Math.abs(after.y-before.y)<2,'Screenshot cannot straddle scroll destinations');
  if(scene)assert.ok(currentFrame(after.scene[scene],afterSequence),'Screenshot finishes with the newly fenced current pose');
}
async function header(run, label) {
  const page=run.page, compact=run.viewport.touch||run.viewport.width<=1024;
  await page.locator('body.v3-product-ready').waitFor();
  const projects=page.locator(compact?'.v3-quick-projects':'[data-v3-nav] [data-v3-project-link]');
  assert.equal(await projects.isVisible(),true,label+': Projects remains directly visible');
  assert.equal(await projects.getAttribute('href'),'/v3/projects/');
  const visible=await projects.evaluate(node=>{const b=node.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.x>=0&&b.right<=innerWidth&&b.y>=0&&b.bottom<=innerHeight&&node.contains(hit);});
  assert.equal(visible,true,label+': Projects is onscreen and hit-testable');
  for(const [name,href] of [['About','/v3/about/'],['Book','/v3/book/'],['Contact','/v3/about/#contact'],['CV','/assets/documents/Andrew_Chung_Public_CV.pdf']])assert.equal(await page.locator('[data-v3-nav]').getByRole('link',{name,exact:name!=='Contact'&&name!=='CV',includeHidden:true}).getAttribute('href'),href);
  const menu=page.locator('[data-v3-menu]'),nav=page.locator('[data-v3-nav]');
  if(compact){
    assert.equal(await menu.isVisible(),true,label+': labeled Menu is visible'); assert.match(await menu.textContent(),/Menu/);
    assert.equal(await nav.evaluate(node=>node.inert),true,'Closed links are inert');
    await menu.focus();await page.keyboard.press('Enter');
    assert.equal(await menu.getAttribute('aria-expanded'),'true');assert.equal(await nav.evaluate(node=>node.inert),false);
    await lightPresentation(run,label+'-menu-open');
    if(label==='phone390-home')await shot(run,label+'-menu-open');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('href')),'/v3/projects/','Keyboard enters the open primary navigation');
    await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.equal(await menu.evaluate(node=>node===document.activeElement),true);
    await menu.press('Space');assert.equal(await menu.getAttribute('aria-expanded'),'true');await menu.press('Space');assert.equal(await menu.getAttribute('aria-expanded'),'false');
    if(run.viewport.touch){await menu.tap();assert.equal(await menu.getAttribute('aria-expanded'),'true');await menu.tap();assert.equal(await menu.getAttribute('aria-expanded'),'false');}
    const b=await menu.boundingBox();assert.ok(b.width>=44&&b.height>=44,'Touch menu target is at least 44×44');
  }else{assert.equal(await nav.isVisible(),true);assert.equal(await nav.evaluate(node=>node.inert),false);}
  if(label==='desktop1440-book'){
    await page.setViewportSize({width:1024,height:768});await menu.waitFor({state:'visible'});
    await page.waitForFunction(()=>matchMedia('(max-width:1024px), (pointer:coarse)').matches&&document.querySelector('[data-v3-nav]').inert===true);
    await menu.focus();assert.equal(await menu.evaluate(node=>node===document.activeElement),true,'Compact Menu is actually focused before desktop transition');
    write('desktop-header-compact-prerequisite',await page.evaluate(()=>window.__v3ProductProbe.snapshot()));
    await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>document.activeElement?.matches('[data-v3-nav] [data-v3-project-link]'));
    assert.equal(await menu.getAttribute('aria-expanded'),'false','Compact to desktop closes Menu and recovers visible Projects focus');
    await page.setViewportSize({width:1024,height:768});await page.waitForFunction(()=>matchMedia('(max-width:1024px), (pointer:coarse)').matches&&document.querySelector('[data-v3-nav]').inert===true);
    await menu.focus();assert.equal(await menu.evaluate(node=>node===document.activeElement),true);
    const bookControl=page.locator('[data-week-next]');await bookControl.focus();assert.equal(await bookControl.evaluate(node=>node===document.activeElement),true,'Focus intentionally moved to a real Book control');
    write('desktop-header-no-theft-prerequisite',await page.evaluate(()=>window.__v3ProductProbe.snapshot()));
    await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>!matchMedia('(max-width:1024px), (pointer:coarse)').matches&&document.querySelector('[data-v3-nav]').inert===false);
    assert.equal(await bookControl.evaluate(node=>node===document.activeElement),true,'Responsive header never steals deliberately moved Book focus');
    write('desktop-header-focus-transitions',await page.evaluate(()=>window.__v3ProductProbe.snapshot()));
  }
  await fit(page,label);passed(label+'-header-keyboard-and-projects');
}
async function navLink(run, name) {
  const menu=run.page.locator('[data-v3-menu]');
  if(await menu.isVisible()){await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');}
  await run.page.locator('[data-v3-nav]').getByRole('link',{name,exact:true}).click();
}
async function hashLink(run, locator, id, scene) {
  const prior=scene?await run.page.evaluate(kind=>window.__v3ProductProbe.read(kind)?.frame?.sequence||0,scene):0;
  await locator.click();await run.page.waitForURL('**#'+id);await scrollStable(run.page);
  if(scene)await sceneReady(run.page,scene,prior);
  return prior;
}

async function frameworkLayout(page,label) {
  const layout=await page.evaluate(()=>{
    const stage=document.querySelector('.v2-selected-stage'),grid=stage.querySelector('.v2-framework-grid'),b=stage.getBoundingClientRect();
    const copies=[...grid.querySelectorAll('.v2-framework-copy')].map(node=>{const box=node.getBoundingClientRect();return{text:node.textContent.trim(),href:node.closest('a').getAttribute('href'),left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};});
    return{stageWidth:stage.clientWidth,stage:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},viewport:{width:innerWidth,height:innerHeight},columns:getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,copies};
  });
  write(label+'-caption-layout',layout);
  assert.equal(layout.columns,layout.stageWidth<=760?2:4,'Caption columns follow actual CAD stage width, including portrait tablet gutters');
  assert.equal(layout.copies.length,4);
  for(const copy of layout.copies){assert.ok(copy.left>=layout.stage.left-1&&copy.right<=layout.stage.right+1&&copy.top>=0&&copy.bottom<=layout.viewport.height+1,label+': readable onscreen project caption '+copy.text);assert.match(copy.href,/^\/v3\/projects\//);}
  for(let i=0;i<layout.copies.length;i++)for(let j=i+1;j<layout.copies.length;j++){const a=layout.copies[i],b=layout.copies[j],overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left),overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);assert.ok(overlapX<=1||overlapY<=1,label+': project captions do not overlap');}
}

async function homeScenes(run, prefix) {
  const page=run.page;
  await goto(run,'/v3/');await header(run,prefix+'-home');
  await shot(run,prefix+'-hero-first-content');
  await page.waitForFunction(()=>document.querySelector('[data-assembly]')?.dataset.assemblyModelsReady==='3',null,{timeout});
  await shot(run,prefix+'-hero-opening',{scene:'hero'});
  if(['desktop1440','phone390'].includes(prefix)){
    const original=page.url(),prior=await page.evaluate(()=>window.__v3ProductProbe.read('hero').frame.sequence);
    const preview=page.locator('[data-assembly-select="1"]');if(run.viewport.touch)await preview.tap();else await preview.click();
    await sceneReady(page,'hero',prior);assert.equal(page.url(),original,'Hero Preview stays in the home document');
    assert.equal(await page.locator('[data-assembly]').getAttribute('data-assembly-active'),'telemetry');
    const openProject=page.locator('[data-assembly-explore]');assert.equal(await openProject.getAttribute('href'),'/v3/projects/skylabs/boards/telemetry/');
    await shot(run,prefix+'-hero-telemetry-preview',{scene:'hero',afterSequence:prior});
    await openProject.click();await page.waitForURL('**/v3/projects/skylabs/boards/telemetry/');await page.locator('h1').waitFor();
    await shot(run,prefix+'-hero-explicit-telemetry-route');
    await page.goBack({waitUntil:'domcontentloaded'});await page.waitForURL(original);await sceneReady(page,'hero');
    assert.equal(await page.locator('[data-v3-menu]').getAttribute('aria-expanded'),'false','Native history return closes the navigation');
    passed(prefix+'-hero-native-preview-separate-open-route-and-back');
  }
  assert.equal(await page.evaluate(()=>window.__v2Selected),undefined,'Normal browsing must not expose capture controls');
  const selectedNav=page.locator('.v2-selected-nav a[href="#work-framework"]');
  const first=await hashLink(run,selectedNav,'work-framework','selected');
  assert.equal(await page.locator('[data-selected-work]').getAttribute('data-selected-inspection-target'),'-1');
  await frameworkLayout(page,prefix+'-framework-overview');await shot(run,prefix+'-framework-overview',{scene:'selected',afterSequence:first});
  const compact=run.viewport.touch||run.viewport.width<=1024,select=page.locator('[data-product-preview-card]');
  assert.equal(await select.isVisible(),compact,'Native Preview selector matches width and pointer capability');
  const before=await page.evaluate(()=>({url:location.href,y:scrollY,frame:window.__v3ProductProbe.read('selected').frame.sequence}));
  if(compact){
    assert.equal(await select.evaluate(node=>node.tagName),'SELECT');
    assert.equal(await select.locator('option').count(),5);assert.deepEqual(await select.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value)),['-1','0','1','2','3']);
    const size=await select.boundingBox();assert.ok(size.height>=44,'Native selector has a touch-sized height');
    await select.selectOption('2');
  }else{await page.locator('[data-framework-inspect="2"]').focus();await page.keyboard.press('Enter');}
  await sceneReady(page,'selected',before.frame);
  assert.equal(page.url(),before.url,'Preview is not a route or hash navigation');assert.ok(near(await page.evaluate(()=>scrollY),before.y,1),'Preview preserves native document position');
  assert.equal(await page.locator('[data-selected-work]').getAttribute('data-selected-inspection-target'),'2');
  if(compact){
    // A real trusted keyboard selection complements value-based option cases.
    // It neither dispatches a synthetic event nor clicks a project route.
    const prior=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);
    await select.focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
    assert.equal(await select.inputValue(),'1','Native keyboard chooses the previous card');await sceneReady(page,'selected',prior);
    assert.ok(await page.evaluate(()=>window.__v3ProductProbe.input.some(event=>event.type==='keydown'&&event.key==='ArrowUp'&&event.trusted)),'Trusted browser keyboard input was observed');
    assert.equal(page.url(),before.url,'Native keyboard Preview does not navigate');
    const restore=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);await select.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await select.inputValue(),'2');await sceneReady(page,'selected',restore);
    if(run.viewport.touch){await select.tap();await page.keyboard.press('Escape');assert.equal(await select.inputValue(),'2','Native picker cancellation keeps the selected card');}
  }
  await shot(run,prefix+'-framework-rp2354b-selected',{scene:'selected',afterSequence:before.frame});
  if(run.viewport.rotation){
    const prior=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);
    await select.focus();await page.setViewportSize(run.viewport.rotation);await sceneReady(page,'selected',prior);
    assert.equal(await select.inputValue(),'2','Rotation preserves the selected native option');assert.equal(await page.locator('[data-selected-work]').getAttribute('data-selected-inspection-target'),'2','Rotation preserves the current inspected card');
    assert.equal(page.url(),before.url,'Rotation preserves the URL');assert.equal(await select.evaluate(node=>node===document.activeElement),true,'Completed rotation restores focused Preview control');
    await frameworkLayout(page,prefix+'-rotated-selected');await shot(run,prefix+'-rotated-selected',{scene:'selected',afterSequence:prior});
    const reverse=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);await page.setViewportSize({width:run.viewport.width,height:run.viewport.height});
    const project=page.locator('.v2-framework-card--pi');await project.focus();
    const focusMove=await page.evaluate(()=>({masked:document.querySelector('[data-selected-work]').dataset.selectedWarmMask,frame:window.__v3ProductProbe.read('selected').frame?.sequence,active:document.activeElement?.getAttribute('href')}));
    await sceneReady(page,'selected',reverse);
    assert.equal(await select.inputValue(),'2','Reverse rotation preserves selection');assert.equal(await project.evaluate(node=>node===document.activeElement),true,'Repaint does not steal intentionally moved project-link focus');
    write(prefix+'-rotation-focus',{firstRotation:'Focused Preview restored after current completed frame',reverse,focusMove,note:'The recorded masked flag/frame identifies whether the intentional focus move preceded the repaint.'});
  }
  let previous=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);
  if(compact){await page.locator('.v2-selected-nav a[href="#work-framework"]').focus();await page.keyboard.press('Escape');}else{await page.locator('[data-framework-overview]').click();}
  await sceneReady(page,'selected',previous);assert.equal(await page.locator('[data-selected-work]').getAttribute('data-selected-inspection-target'),'-1','Overview resets selection');
  if(compact){
    previous=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);await select.selectOption('1');await sceneReady(page,'selected',previous);
    previous=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);await select.selectOption('-1');await sceneReady(page,'selected',previous);assert.equal(page.url(),before.url,'All cards also stays in the current document');
  }
  if(prefix==='phone390'){
    for(const [value,key]of [['0','ArrowDown'],['3','End']]){
      const prior=await page.evaluate(()=>({frame:window.__v3ProductProbe.read('selected').frame.sequence,url:location.href,y:scrollY}));
      await select.focus();await page.keyboard.press(key);await page.keyboard.press('Enter');
      assert.equal(await select.inputValue(),value,'Trusted native keyboard reaches Preview card '+value);await sceneReady(page,'selected',prior.frame);
      assert.equal(await page.locator('[data-selected-work]').getAttribute('data-selected-inspection-target'),value);assert.equal(page.url(),prior.url);assert.ok(near(await page.evaluate(()=>scrollY),prior.y,1),'Every native Preview card preserves document position');
      await shot(run,prefix+'-framework-card-'+value,{scene:'selected',afterSequence:prior.frame});
    }
    const prior=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);await select.selectOption('-1');await sceneReady(page,'selected',prior);
  }
  const transit=await hashLink(run,page.locator('.v2-selected-nav a[href="#work-transit"]'),'work-transit','selected');
  assert.equal(await page.locator('[data-selected-work]').getAttribute('data-selected-chapter'),'1');
  await shot(run,prefix+'-transit',{scene:'selected',afterSequence:transit});
  const aircraft=await hashLink(run,page.locator('.v2-selected-skip'),'skylabs-aircraft','aircraft');
  await page.waitForFunction(()=>document.querySelector('[data-aircraft-hero]')?.dataset.aircraftState==='ready',null,{timeout});
  await shot(run,prefix+'-skylabs-aircraft',{scene:'aircraft',afterSequence:aircraft});
  const telemetry=await hashLink(run,page.locator('[data-aircraft-copy] article[data-aircraft-chapter="0"] a[href="#skylabs-telemetry"]'),'skylabs-telemetry','aircraft');
  await shot(run,prefix+'-skylabs-telemetry',{scene:'aircraft',afterSequence:telemetry});
  assert.equal(await page.locator('[data-aircraft-chapter="1"] a[href="/v3/projects/skylabs/boards/telemetry/"]').count(),1,'Telemetry retains an explicit project route');
  // Browser Back restores the actual fragment and the corresponding new frame.
  const back=await page.evaluate(()=>window.__v3ProductProbe.read('aircraft').frame.sequence);await page.goBack({waitUntil:'domcontentloaded'});await page.waitForURL('**#skylabs-aircraft');await sceneReady(page,'aircraft',back);
  passed(prefix+'-home-current-fenced-scenes-native-hashes-preview-and-back');
}

async function sectionDestination(page,id) {
  await page.waitForURL('**#'+id);
  // A stalled main thread can leave scrollY apparently unchanged while native
  // smooth scrolling is pending. Require the actual CSS fragment destination
  // before another hash/Back action; do not recenter or cancel the browser.
  await page.waitForFunction(id=>{
    const target=document.getElementById(id);if(!target||location.hash!=='#'+id)return false;
    const style=getComputedStyle(target),html=getComputedStyle(document.documentElement),box=target.getBoundingClientRect();
    const desired=scrollY+box.top-(parseFloat(style.scrollMarginTop)||0)-(parseFloat(html.scrollPaddingTop)||0);
    const max=Math.max(0,document.scrollingElement.scrollHeight-innerHeight),expected=Math.min(max,Math.max(0,desired));
    return Math.abs(scrollY-expected)<=2;
  },id,{polling:'raf',timeout});
  await imagesReady(page);await scrollStable(page);
  const evidence=await page.evaluate(id=>{const target=document.getElementById(id),b=target.getBoundingClientRect();return{id,url:location.href,y:scrollY,target:{top:b.top,bottom:b.bottom,height:b.height},headerBottom:document.querySelector('.v2-header').getBoundingClientRect().bottom};},id);
  write('last-section-destination-'+id,evidence);
}

function assertPiStatusReadable(sample,label) {
  assert.ok(sample.status?.text.trim(),label+': actual viewer status text exists');
  assert.ok(sample.status.scrollHeight<=sample.status.clientHeight+1,label+': status text is not vertically clipped '+JSON.stringify(sample.status));
  assert.ok(sample.status.scrollWidth<=sample.status.clientWidth+1,label+': status text stays within its own width');
}
function assertPiAnchorUnchanged(before,after,label) {
  assert.equal(after.url,before.url,label+': preserve the real Details hash');
  assert.ok(near(after.details.documentTop,before.details.documentTop,1),label+': no upstream Details layout shift');
  assert.ok(near(after.y,before.y,1),label+': no compensating native scroll correction');
  assert.ok(near(after.controls.height,before.controls.height,1),label+': exact reserved control height');
}
async function hiddenPiControl(run,label) {
  const result=await run.page.locator('[data-pi-explode]').evaluate(node=>{const before=document.activeElement;node.focus({preventScroll:true});return{visibility:getComputedStyle(node).visibility,focusUnchanged:document.activeElement===before,active:document.activeElement?.tagName};});
  assert.equal(result.visibility,'hidden',label+': unready controls are hidden');
  assert.equal(result.focusUnchanged,true,label+': hidden controls cannot take focus');
}
async function heldPiDetails(run,prefix,{enlarged=false}={}) {
  const page=run.page,selector=page.getByRole('combobox',{name:'On this page'}),phases={};
  const record=async name=>{
    const sample=await page.evaluate(()=>window.__v3ProductProbe.readCaseLayout());phases[name]=sample;
    assertPiStatusReadable(sample,prefix+' '+name);
    write(prefix+'-held-pi-'+name,{phases,gate:run.network.piModelGate,textStress:enlarged,timeline:await page.evaluate(()=>window.__v3ProductProbe.caseLayouts)});
    return sample;
  };
  const nativeDetails=async()=>{await selector.selectOption('#engineering');await sectionDestination(page,'engineering');await selector.selectOption('#details');await sectionDestination(page,'details');};
  await run.network.waitForHeldPiModel();
  assert.equal(await page.locator('[data-pi-inspector]').getAttribute('data-pi-state'),'loading','Choose Details while the real model is held in loading');
  await hiddenPiControl(run,prefix+' loading');
  await selector.selectOption('#details');await sectionDestination(page,'details');
  const loading=await record('details-loading');assert.equal(loading.piState,'loading');assert.match(loading.status.text,/Preparing the assembly/);
  run.network.releasePiModel('abort');
  await page.waitForFunction(()=>document.querySelector('[data-pi-inspector]')?.dataset.piState==='unavailable',null,{timeout});await scrollStable(page);
  const unavailable=await record('details-unavailable');assert.match(unavailable.status.text,/could not load/);
  if(!enlarged){assertPiAnchorUnchanged(loading,unavailable,'Model failure');await sectionDestination(page,'details');}
  else{await nativeDetails();await record('details-enlarged-unavailable-target');}
  await hiddenPiControl(run,prefix+' unavailable');
  assert.equal(await page.locator('[data-pi-start]').isVisible(),true,'Real unavailable handler exposes Retry');
  assert.ok(unavailable.retry.width>=44&&unavailable.retry.height>=44,'Retry retains a 44 px minimum touch target');
  // Preserve the native Details destination through this intermediate record.
  // A full-document capture includes Retry/status without reframing away from
  // the hash, which WebKit can restore while preparing a screenshot.
  await shot(run,prefix+'-pi-unavailable',{fullPage:true});
  // Retry is a genuine user click. It may scroll its own button into view, so
  // re-enter Details through the real section control before releasing load 2.
  run.network.holdPiModel();await page.locator('[data-pi-start]').click();await run.network.waitForHeldPiModel();
  await hiddenPiControl(run,prefix+' retry loading');await nativeDetails();
  const retryLoading=await record('details-retry-loading');assert.equal(retryLoading.piState,'loading');assert.match(retryLoading.status.text,/Preparing the assembly/);
  run.network.releasePiModel();
  await page.waitForFunction(()=>document.querySelector('[data-pi-inspector]')?.dataset.piState==='ready',null,{timeout});await scrollStable(page);
  const ready=await record('details-ready');assert.match(ready.status.text,/Drag to rotate/);assert.equal(ready.controls.visibility,'visible','Ready controls become visible');
  if(!enlarged)assertPiAnchorUnchanged(retryLoading,ready,'Late model readiness');
  else{
    // 200% text may legitimately need more than the minimum two status lines.
    // Preserve natural reflow and prove the real section is still reachable.
    await nativeDetails();await record('details-enlarged-ready-target');
  }
  await sectionDestination(page,'details');
  assert.equal(run.network.piModelGate.requests,2,'Both loading attempts used the held original board GET');
  assert.deepEqual(run.network.piModelGate.outcomes,['abort','continue'],'First real load failed, second real load completed');
  await shot(run,prefix+'-held-pi-details-after-ready');
  passed(prefix+'-held-original-pi-failure-retry-native-details-'+(enlarged?'unclipped-text-stress':'stable-anchor'));
}
async function narrowPiTextStress(browser) {
  const run=await open(browser,viewports.phone320,{reduced:true}),prefix='webkit-phone320-pi-text200';
  try{
    run.network.holdPiModel();await goto(run,'/v3/projects/framework-raspberry-pi/');await run.page.locator('body.v3-product-ready').waitFor();
    const original=await run.page.locator('[data-pi-status],[data-pi-start],[data-pi-explode]').evaluateAll(nodes=>nodes.map(node=>({selector:node.matches('[data-pi-status]')?'[data-pi-status]':node.matches('[data-pi-start]')?'[data-pi-start]':'[data-pi-explode]',fontSize:parseFloat(getComputedStyle(node).fontSize)})));
    await run.page.addStyleTag({content:original.map(item=>`${item.selector}{font-size:${item.fontSize*2}px!important}`).join('\n')});
    write(prefix+'-method',{viewport:run.viewport,original,note:'Test-only 200% enlargement of the computed actual Pi status and action-label font sizes. This is a narrow text-reflow stress probe, not physical Safari, OS text zoom, or altered model geometry.'});
    const selector=run.page.getByRole('combobox',{name:'On this page'});await selector.selectOption('#engineering');await sectionDestination(run.page,'engineering');
    await heldPiDetails(run,prefix,{enlarged:true});await fit(run.page,prefix);assert.deepEqual(run.errors,[]);assert.deepEqual(run.network.blocked,[]);assert.equal(run.network.submissions.length,0);
  }catch(error){await diagnose(run,prefix,error);throw error;}finally{run.network.releasePiModel();await run.context.close();}
}

async function catalogAndCase(run,prefix) {
  const page=run.page;
  await navLink(run,'Projects');await page.waitForURL('**/v3/projects/');await page.locator('[data-v2-search]').waitFor();
  await header(run,prefix+'-catalog');
  const cards=page.locator('[data-v2-project]');assert.equal(await cards.count(),15);
  assert.equal(await page.locator('[data-v2-project]:visible').count(),15,'Catalog initially shows all 15 projects');
  await shot(run,prefix+'-catalog');
  const search=page.locator('[data-v2-search]');await search.fill('raspberry');
  assert.equal(await page.locator('[data-v2-project]:visible').count(),1);assert.match(await page.locator('[data-v2-project]:visible').getAttribute('href'),/framework-raspberry-pi/);
  assert.equal(new URL(page.url()).searchParams.get('q'),'raspberry');
  await shot(run,prefix+'-catalog-search');await search.press('Escape');assert.equal(await page.locator('[data-v2-project]:visible').count(),15);
  await page.locator('[data-v2-category="robotics"]').click();assert.equal(await page.locator('[data-v2-project]:visible').count(),1);assert.match(await page.locator('[data-v2-project]:visible').textContent(),/rUNSWift/);
  await page.locator('[data-v2-category="all"]').click();assert.equal(await page.locator('[data-v2-project]:visible').count(),15);
  const heldPi=prefix==='webkit-ipad-emulation';
  if(heldPi)run.network.holdPiModel();
  await page.locator('[data-v2-project][href="/v3/projects/framework-raspberry-pi/"]').click();await page.waitForURL('**/v3/projects/framework-raspberry-pi/');await page.locator('h1').waitFor();
  await header(run,prefix+'-case');await shot(run,prefix+'-case-overview');
  const selector=page.getByRole('combobox',{name:'On this page'}),compact=run.viewport.touch||run.viewport.width<=1024;
  assert.equal(await selector.isVisible(),compact);
  if(compact){
    assert.equal(await page.locator('.v2-case-nav').evaluate(node=>node.inert),true);
    assert.equal(await page.locator('.v2-case-nav').isVisible(),false,'Compact case links do not become a second sticky rail');
    const value=await selector.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));assert.ok(value.includes('#engineering')&&value.includes('#details'));
    await selector.selectOption('#engineering');await sectionDestination(page,'engineering');
    if(heldPi)await heldPiDetails(run,prefix);
    else{await selector.selectOption('#details');await sectionDestination(page,'details');}
    await page.goBack({waitUntil:'domcontentloaded'});await sectionDestination(page,'engineering');
  }else{await page.locator('[data-v2-section][href$="#engineering"]').click();await sectionDestination(page,'engineering');}
  const visibleHeading=await page.locator('#engineering').evaluate(node=>{const b=node.getBoundingClientRect(),header=document.querySelector('.v2-header').getBoundingClientRect();return b.top>=header.bottom-2&&b.top<innerHeight;});
  assert.equal(visibleHeading,true,'Native section destination is visible below the header');
  await shot(run,prefix+'-case-engineering');
  // Exercise the retained, real case-study viewer rather than replacing its UI
  // with the home Preview selector. Only desktop and portrait phone need this
  // costly proof; every viewport checks the preserved DOM control contract.
  assert.equal(await page.locator('[data-pi-explode]').count(),1);assert.equal(await page.locator('[data-pi-start]').count(),1);
  if(['desktop1440','phone390'].includes(prefix)){
    await page.locator('[data-pi-stage]').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-pi-inspector]')?.dataset.piState==='ready',null,{timeout});
    const action=page.locator('[data-pi-explode]');await action.click();await page.waitForFunction(()=>{const d=document.querySelector('[data-pi-inspector]').dataset;return d.piExploded==='true'&&d.piProgress==='1.000'&&d.piMotion==='idle';},null,{timeout});
    assert.equal(await action.getAttribute('aria-pressed'),'true');await shot(run,prefix+'-case-real-disassembly');
    await action.click();await page.waitForFunction(()=>{const d=document.querySelector('[data-pi-inspector]').dataset;return d.piExploded==='false'&&d.piProgress==='0.000'&&d.piMotion==='idle';},null,{timeout});
  }
  passed(prefix+'-catalog-15-search-category-explicit-route-case-native-sections');
}

async function book(run,prefix) {
  const page=run.page;
  await navLink(run,'Book');await page.waitForURL('**/v3/book/');await page.locator('[data-slot]').first().waitFor();await header(run,prefix+'-book');
  assert.ok(run.network.availability.length>0,'Book availability comes from the mock');assert.equal(run.network.submissions.length,0);
  await shot(run,prefix+'-book-calendar',{target:'[data-booking-calendar]'});
  for(const duration of [15,30,45,60]){
    await page.locator(`[name="duration-choice"][value="${duration}"]`).check();
    await page.waitForFunction(duration=>document.querySelector('[data-booking-card-title]').textContent.includes(duration+'-minute')&&!document.querySelector('[data-booking-days]').hidden,duration);
    await page.locator('[data-slot]').first().click();assert.equal(await page.locator('[data-form-duration]').inputValue(),String(duration));assert.equal(await page.locator('[data-form-token]').inputValue(),'mock-v3-'+duration);
  }
  await page.locator('[name="format-choice"][value="in-person"]').check();assert.equal(await page.locator('[data-form-format]').inputValue(),'in-person');
  await page.locator('[data-booking-submit]').click();
  assert.equal(run.network.submissions.length,0,'Native required-field validation prevents any POST');
  assert.equal(await page.locator('[name="name"]').evaluate(node=>node.validity.valueMissing),true);
  await page.locator('[name="name"]').fill('Browser Review');await page.locator('[name="email"]').fill('browser-review@example.invalid');await page.locator('[name="topic"]').fill('Local automated UI check. Mocked endpoint only.');
  await shot(run,prefix+'-book-details',{target:'[data-booking-form]'});
  run.network.response={ok:false,message:'Mocked conflict: this time is no longer available.'};
  await page.locator('[data-booking-submit]').click();await page.locator('[data-booking-form-error]').waitFor({state:'visible'});
  assert.equal(run.network.submissions.length,1,'Exactly one rejected mock POST');
  assert.equal(await page.locator('[name="email"]').inputValue(),'browser-review@example.invalid','Rejected confirmation preserves typed details');
  assert.equal(await page.locator('[data-booking-submit]').isEnabled(),true,'Rejected confirmation releases the submit control');
  await shot(run,prefix+'-book-mocked-error',{target:'[data-booking-form]'});
  run.network.response={ok:true};
  await page.locator('[data-booking-submit]').click();await page.locator('[data-booking-success]').waitFor({state:'visible'});
  assert.equal(run.network.submissions.length,2,'Exactly two mock POSTs: rejected attempt and successful retry');assert.equal(run.network.submissions[1].email,'browser-review@example.invalid');assert.equal(run.network.submissions[1].duration,'60');assert.equal(run.network.submissions[1].format,'in-person');
  await shot(run,prefix+'-book-mocked-success',{target:'[data-booking-success]'});
  await page.locator('[data-book-another]').click();await page.locator('[data-slot]').first().waitFor();assert.equal(await page.locator('[data-booking-success]').isVisible(),false);
  run.network.mode='empty';await page.locator('[data-week-next]').click();await page.locator('.booking-day-empty').first().waitFor();
  assert.equal(await page.locator('[data-slot]').count(),0,'Mocked empty availability shows no bookable slots');
  await shot(run,prefix+'-book-empty',{target:'[data-booking-calendar]'});
  run.network.mode='error';await page.locator('[data-week-next]').click();await page.locator('[data-booking-status]').getByText(/Try the next week/).waitFor();
  await shot(run,prefix+'-book-unavailable',{target:'[data-booking-status]'});
  run.network.mode='ready';await page.locator('[data-week-previous]').click();await page.locator('[data-slot]').first().waitFor();
  assert.equal(await page.locator('[data-booking-submit]').isEnabled(),true,'Availability retry remains usable');
  passed(prefix+'-book-mocked-validation-rejection-success-repeat-empty-error-recovery',{mockedGETs:run.network.availability.length,mockedPOSTs:run.network.submissions.length});
}

async function about(run,prefix) {
  await navLink(run,'About');await run.page.waitForURL('**/v3/about/');await run.page.locator('h1').waitFor();await header(run,prefix+'-about');
  await shot(run,prefix+'-about');
  await shot(run,prefix+'-contact',{target:'#contact'});
  assert.equal(await run.page.locator('#contact a[href="/v3/book/"]').count(),1,'About retains the real Book route');
  passed(prefix+'-about-contact-light-surfaces-and-real-route');
}

async function viewportReview(browser,name) {
  assert.ok(viewports[name],'Unknown viewport '+name);const run=await open(browser,viewports[name]);
  try{
    await homeScenes(run,name);await catalogAndCase(run,name);await book(run,name);await about(run,name);
    assert.deepEqual(run.errors,[],'No uncaught JavaScript errors');assert.deepEqual(run.shaders,[],'No shader errors');assert.deepEqual(run.network.blocked,[],'No unexpected external traffic or non-GET operations');
    write(name+'-result',{viewport:viewports[name],reports,errors:run.errors,shaders:run.shaders,network:run.network});
  }catch(error){await diagnose(run,name,error);throw error;}finally{run.network.releasePiModel?.();await run.context.close();}
}
async function diagnose(run,name,error) {write(name+'-failure',{error:error.stack,errors:run.errors,shaders:run.shaders,network:run.network,snapshot:await run.page.evaluate(()=>window.__v3ProductProbe?.snapshot()||({url:location.href,y:scrollY})).catch(error=>({error:error.message}))});await run.page.screenshot({path:path.join(output,name+'-failure.png'),timeout:15000}).catch(()=>{});}

async function fallbacks(browser) {
  for(const [name,options,viewport=viewports.phone390] of [['no-js',{noJS:true}],['reduced-motion',{reduced:true}],['webgl-unavailable',{noWebGL:true}],['short-landscape',{}, {width:844,height:390,touch:true} ]]){
    const run=await open(browser,viewport,options);
    try{
      await goto(run,'/v3/');
      if(!options.noJS)await run.page.waitForFunction(()=>{const d=document.querySelector('[data-assembly]')?.dataset;return ['static','unavailable'].includes(d?.assemblyState);},null,{timeout});
      assert.ok(await run.page.locator('.v2-header a[href="/v3/projects/"]:visible').count()>0,'Fallback retains a visible real Projects link');
      const projectRoutes=await run.page.locator('[data-selected-work] a[href^="/v3/projects/"]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.getAttribute('href')))]);assert.ok(projectRoutes.length>=6,'All six direct project routes remain');
      if(name==='short-landscape'){
        await header(run,name+'-home');
        const controls=await run.page.locator('.v2-brand,.v3-quick-projects,[data-v3-menu]').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return{label:node.textContent.trim(),left:b.left,right:b.right,top:b.top,bottom:b.bottom};}));
        for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1,'Short-landscape header controls do not collide');}
        write('short-landscape-header-controls',controls);
      }
      await shot(run,name+'-home',{presentationScene:'hero'});
      await run.page.locator('#work-framework').scrollIntoViewIfNeeded();
      if(!options.noJS){await run.page.waitForFunction(()=>['static','unavailable'].includes(document.querySelector('[data-selected-work]')?.dataset.selectedState),null,{timeout});await run.page.locator('#work-framework').scrollIntoViewIfNeeded();await scrollStable(run.page);}
      await shot(run,name+'-framework',{presentationScene:'selected'});
      await run.page.locator('#work-transit').scrollIntoViewIfNeeded();await shot(run,name+'-transit',{presentationScene:'selected'});
      await run.page.locator('#skylabs-aircraft').scrollIntoViewIfNeeded();
      if(!options.noJS){await run.page.waitForFunction(()=>['static','unavailable'].includes(document.querySelector('[data-aircraft-hero]')?.dataset.aircraftState),null,{timeout});await run.page.locator('#skylabs-aircraft').scrollIntoViewIfNeeded();await scrollStable(run.page);}
      await shot(run,name+'-skylabs',{presentationScene:'aircraft'});
      await goto(run,'/v3/book/');if(options.noJS)assert.equal(await run.page.getByText(/live calendar needs JavaScript/).isVisible(),true);else await run.page.locator('[data-slot]').first().waitFor();await shot(run,name+'-book');
      if(name==='short-landscape')await book(run,name);else assert.equal(run.network.submissions.length,0);
      assert.deepEqual(run.errors,[]);passed(name+'-readable-static-routes');
    }catch(error){await diagnose(run,name,error);throw error;}finally{run.network.releasePiModel?.();await run.context.close();}
  }
  // Every preserved route gets a narrow no-JS render, not just a source audit.
  const routes=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name==='index.html')routes.push('/v3/'+path.relative(path.join(root,'v2'),path.dirname(file)).replaceAll(path.sep,'/')+'/');}}
  walk(path.join(root,'v2'));const run=await open(browser,viewports.phone320,{noJS:true});const documents=[];
  try{
    for(let route of routes){
      route=route.replace('/v3/./','/v3/').replace('/v3//','/v3/');
      if(route==='/v3/render/'){
        const response=await run.page.goto(base+route,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);assert.equal(await run.page.locator('[data-cad-canvas]').count(),1);
        documents.push({route,utility:true,title:await run.page.title(),note:'Internal transparent CAD renderer has no public h1.'});continue;
      }
      if(route==='/v3/projects/skylabs/flight-review/'){
        await run.page.goto(base+route,{waitUntil:'domcontentloaded'});await run.page.waitForURL('**/shared/flight-review/');
        documents.push({route,redirect:run.page.url(),note:'The preserved native meta-refresh opens the real shared Flight Review tool.'});continue;
      }
      await goto(run,route);await imagesReady(run.page);await fit(run.page,route);await lightPresentation(run,'no-js-'+route.replace(/[^a-z0-9]+/g,'-'));const h1=await run.page.locator('h1').first().textContent();assert.ok(h1.trim());documents.push({route,h1});
      const viewer=run.page.locator('.project-interactive,.v2-lab .app,.v2-lab .wrap').first();
      if(await viewer.count()){
        await viewer.scrollIntoViewIfNeeded();
        await shot(run,'no-js-'+route.replace(/[^a-z0-9]+/g,'-')+'-original-viewer');
      }
    }
    write('all-routes-no-js-mobile320',documents);passed('all-'+documents.length+'-routes-no-js-narrow-render-and-utilities');
  }finally{run.network.releasePiModel?.();await run.context.close();}
}

async function webkitSmoke(browser) {
  const run=await open(browser,viewports.ipad1024,{reduced:true});
  try {
    await goto(run,'/v3/');await header(run,'webkit-ipad-emulation-home');await shot(run,'webkit-ipad-emulation-home');
    await catalogAndCase(run,'webkit-ipad-emulation');await book(run,'webkit-ipad-emulation');
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.network.blocked,[]);
    write('webkit-ipad-emulation-result',{reports,network:run.network,note:'WebKit tablet viewport/touch emulation on Linux, reduced motion. This is not a test on a physical iPad or Safari/iPadOS.'});
  }catch(error){await diagnose(run,'webkit-ipad-emulation',error);throw error;}finally{run.network.releasePiModel?.();await run.context.close();}
  await narrowPiTextStress(browser);
}

function installProfile() {
  const metric=window.__v3HeroProfile={firstVisibleResource:null,firstFenced:null,allFenced:null,longTasks:[],keys:[],taskQueue:[],heroTimeline:[]};
  new PerformanceObserver(list=>{for(const item of list.getEntries())metric.longTasks.push({start:item.startTime,duration:item.duration});}).observe({type:'longtask',buffered:true});
  addEventListener('keydown',event=>{if(event.key!=='F8')return;const input={received:performance.now(),trusted:event.isTrusted,key:event.key,nextRAF:null};metric.keys.push(input);requestAnimationFrame(()=>{input.nextRAF=performance.now();});},{capture:true});
  const timer=()=>{const expected=performance.now()+100;setTimeout(()=>{metric.taskQueue.push({expected,received:performance.now(),delayMs:Math.max(0,performance.now()-expected)});timer();},100);};timer();
  let previous='';
  const inspect=()=>{
    const hero=document.querySelector('[data-assembly]');if(!hero)return;const d=hero.dataset,now=performance.now();
    const state=Object.fromEntries(Object.entries(d).filter(([key])=>/assembly(State|Models|GPU|Preparation|Resource|Completed|Warm)/.test(key))),serialized=JSON.stringify(state);
    if(serialized!==previous){metric.heroTimeline.push({at:now,...state});previous=serialized;}
    if(d.assemblyGPUCompletionEvidence==='own-context-fence'&&d.assemblyGPUCompletion==='complete'){
      if(metric.firstFenced===null&&Number(d.assemblyModelsReady)>0)metric.firstFenced=now;
      if(metric.allFenced===null&&Number(d.assemblyModelsReady)===3)metric.allFenced=now;
    }
  };
  new MutationObserver(inspect).observe(document,{subtree:true,attributes:true,attributeFilter:['data-assembly-state','data-assembly-models-ready','data-assembly-models-settled','data-assembly-gpu-completion','data-assembly-gpu-completion-evidence','data-assembly-gpu-pending','data-assembly-preparation-ms','data-assembly-completed-frames']});
  const visible=()=>{const images=[...document.querySelectorAll('[data-assembly-posters] img')];if(images.some(image=>{const b=image.getBoundingClientRect(),s=getComputedStyle(image);return image.complete&&image.naturalWidth>0&&b.width>0&&b.height>0&&b.bottom>0&&b.top<innerHeight&&s.visibility==='visible'&&Number(s.opacity)>.5;})){metric.firstVisibleResource=performance.now();return;}if(metric.firstFenced!==null){metric.firstVisibleResource=metric.firstFenced;return;}requestAnimationFrame(visible);};requestAnimationFrame(visible);
}
function responsivenessWindow(metric,endMs) {
  const longTasks=metric.longTasks.filter(task=>task.start<endMs).map(task=>({...task,withinHorizonMs:Math.min(task.duration,endMs-task.start)}));
  const receivedKeys=metric.keys.filter(key=>key.received<endMs),paintedKeys=receivedKeys.filter(key=>key.nextRAF!==null);
  const taskQueue=metric.taskQueue.filter(task=>task.expected<endMs);
  return{endMs,receivedKeys,keysDelivered:receivedKeys.length,keysCompleted:paintedKeys.length,keyToNextRAFMs:paintedKeys.map(key=>key.nextRAF-key.received),longTaskTotalMs:longTasks.reduce((sum,task)=>sum+task.withinHorizonMs,0),longTaskMaxMs:Math.max(0,...longTasks.map(task=>task.withinHorizonMs)),longTasks,taskQueue,taskQueueMaxDelayMs:Math.max(0,...taskQueue.map(task=>task.delayMs))};
}
async function profile(browser) {
  assert.ok(profileBaselineBase,'--profile requires V3_PRODUCT_BASELINE_URL serving the exact dark-v3 45c386e checkout, separate from the candidate server');
  assert.notEqual(new URL(profileBaselineBase).origin,new URL(base).origin,'Baseline and candidate must use separate clean server roots');
  const proof=await browser.newContext();
  try{const response=await proof.request.get(profileBaselineBase+'/.v3-profile-commit');assert.equal(response.status(),200);assert.equal((await response.text()).trim(),profileBaselineCommit,'Baseline server identity must match the exact accepted dark-v3 commit');}finally{await proof.close();}
  const samples=[],network={offline:false,latency:40,downloadThroughput:10_000_000/8,uploadThroughput:10_000_000/8,connectionType:'wifi'};
  const variants={darkV3:{base:profileBaselineBase,commit:profileBaselineCommit},lightV3:{base,commit:process.env.GITHUB_SHA||process.env.V3_PRODUCT_CANDIDATE_COMMIT||'working-tree'}};
  // Same /v3/ route from separate immutable/current trees. Each sample is a
  // fresh context, cold cache, and identically observed software GPU. Reverse
  // pair order to reveal runner drift. Never substitute the unrelated /v2/ UI.
  for(let pair=0;pair<3;pair++)for(const version of pair%2?['lightV3','darkV3']:['darkV3','lightV3']){
    const variant=variants[version],context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'no-preference',colorScheme:'light'});
    const guarded=await networkGuard(context,variant.base);await context.addInitScript(installProbe);await context.addInitScript(installProfile);
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',network);
    try{
      await page.goto(variant.base+'/v3/',{waitUntil:'commit',timeout});
      const inputCalls=[],probeInput=async()=>{
        for(;;){
          const status=await page.evaluate(()=>({now:performance.now(),allFenced:window.__v3HeroProfile?.allFenced??null}));
          if(status.now>=15000&&status.allFenced!==null)return status.now;
          if(status.now>timeout)throw Error('Full cold-profile input horizon exceeded completion timeout');
          const start=performance.now();await page.keyboard.press('F8');const elapsed=performance.now()-start;
          const observed=await page.evaluate(()=>performance.now());inputCalls.push({pageBefore:status.now,pageObserved:observed,automationCallMs:elapsed});
          await new Promise(resolve=>setTimeout(resolve,Math.max(0,1000-elapsed)));
        }
      };
      const [,observedHorizonMs]=await Promise.all([page.waitForFunction(()=>window.__v3HeroProfile?.allFenced!==null&&window.__v3HeroProfile?.allFenced!==undefined,null,{timeout}),probeInput()]);
      await page.waitForTimeout(150); // Deliver final observer, timer and RAF callbacks.
      const sample=await page.evaluate(()=>({metric:window.__v3HeroProfile,hero:{...document.querySelector('[data-assembly]').dataset},gpuContexts:window.__v3ProductProbe.contexts,scrollY,navigation:performance.getEntriesByType('navigation')[0].toJSON(),paints:performance.getEntriesByType('paint').map(entry=>({name:entry.name,start:entry.startTime})),resources:performance.getEntriesByType('resource').map(entry=>({path:new URL(entry.name).pathname,start:entry.startTime,end:entry.responseEnd,transfer:entry.transferSize,encoded:entry.encodedBodySize,decoded:entry.decodedBodySize}))}));
      assert.deepEqual(errors,[]);assert.deepEqual(guarded.blocked,[]);assert.equal(guarded.submissions.length,0);assert.equal(sample.scrollY,0);assert.ok(sample.metric.firstFenced!==null&&sample.metric.allFenced>=sample.metric.firstFenced);assert.equal(sample.hero.assemblyModelsReady,'3');assert.equal(sample.hero.assemblyGPUCompletionEvidence,'own-context-fence');
      const responsiveness={requestedMinimumHorizonMs:15000,observedHorizonMs,inputCalls,first15s:responsivenessWindow(sample.metric,15000),fullStartup:responsivenessWindow(sample.metric,sample.metric.allFenced),fullObservation:responsivenessWindow(sample.metric,observedHorizonMs),note:'Observation continues until all three real models have a completed own-context-fenced frame and at least 15 seconds have elapsed. Trusted F8 delivery → next RAF, automation-call duration, 100 ms timer queue delay, and real fence lifecycle are review probes, not field INP or device frame rate. Fixed windows clip long tasks; raw entries and late queue/input deliveries remain available.'};
      assert.ok(sample.metric.keys.length>0&&sample.metric.keys.every(key=>key.trusted),'Trusted native keyboard input was actually received throughout the observed startup');
      assert.ok(sample.metric.taskQueue.length>0,'Main-thread timer queue evidence was actually observed');
      samples.push({pair:pair+1,version,commit:variant.commit,...sample,responsiveness,errors});write('hero-profile-samples',samples);console.log('PROFILE '+version+' '+variant.commit+' pair '+(pair+1)+' first fenced '+Math.round(sample.metric.firstFenced)+'ms; all fenced '+Math.round(sample.metric.allFenced)+'ms; observed '+Math.round(observedHorizonMs)+'ms');
    }finally{await context.close();}
  }
  const median=values=>{const finite=values.filter(Number.isFinite).sort((a,b)=>a-b);return finite.length?finite[Math.floor(finite.length/2)]:null;};
  const summary=Object.fromEntries(Object.keys(variants).map(version=>{const runs=samples.filter(sample=>sample.version===version);return[version,{commit:variants[version].commit,firstVisibleResourceReadyMs:median(runs.map(sample=>sample.metric.firstVisibleResource)),firstFencedMs:median(runs.map(sample=>sample.metric.firstFenced)),allFencedMs:median(runs.map(sample=>sample.metric.allFenced)),windows:Object.fromEntries(['first15s','fullStartup','fullObservation'].map(window=>[window,{longTaskTotalMs:median(runs.map(sample=>sample.responsiveness[window].longTaskTotalMs)),longTaskMaxMs:median(runs.map(sample=>sample.responsiveness[window].longTaskMaxMs)),keyToNextRAFMaxMs:median(runs.map(sample=>sample.responsiveness[window].keyToNextRAFMs.length?Math.max(...sample.responsiveness[window].keyToNextRAFMs):null)),taskQueueMaxDelayMs:median(runs.map(sample=>sample.responsiveness[window].taskQueueMaxDelayMs)),keysDeliveredByRun:runs.map(sample=>sample.responsiveness[window].keysDelivered),keysCompletedByRun:runs.map(sample=>sample.responsiveness[window].keysCompleted)}])),resourceTransferBytes:median(runs.map(sample=>sample.resources.reduce((sum,item)=>sum+item.transfer,0)))}];}));
  write('hero-profile-summary',{method:'Three alternating cold dark-v3 45c386e versus candidate light-v3 pairs; same /v3/ route, browser/runner, 1440×900 DPR 1, 10 Mbps / 40 ms. Baseline served from a separately extracted exact Git commit. Production own-context-fenced handoff timestamps plus full-startup and fixed first-15s input/long-task/timer-queue records. First visible resource means a complete image with natural size in a visible box (or first fenced CAD), not a browser paint/decode timestamp. No screenshot, pixel readback, or scene mutation during profiling. SwiftShader is not a device benchmark; no FPS, field INP, or arbitrary pass/fail performance claim.',network,variants,summary,samples});passed('matched-dark-v3-versus-light-v3-three-cold-pairs',summary);
}

function selfTest() {
  const good={native:.25,rendered:.25,visible:true,canvasVisible:true,masked:false,pending:false,revision:8,presentedRevision:8,inspectionRevision:3,inspectionPresentedRevision:3,inspectionTarget:2,fence:{completed:50,deleted:51},frame:{sequence:9,published:true,gpu:{state:'complete'},submittedMs:40,completedMs:51,value:.25,revision:8,inspectionRevision:3,inspectionWeights:[0,0,1,0]}};
  assert.equal(currentFrame(good,8),true);
  for(const patch of [{native:.5},{pending:true},{masked:true},{canvasVisible:false},{presentedRevision:7},{inspectionPresentedRevision:2},{inspectionTarget:1},{fence:{completed:30,deleted:31}},{frame:{...good.frame,published:false}},{frame:{...good.frame,gpu:{state:'unsupported'}}},{frame:{...good.frame,sequence:8}},{frame:{...good.frame,revision:7}},{frame:{...good.frame,inspectionWeights:[0,0,.5,0]}}])assert.equal(currentFrame({...good,...patch},8),false,'Reject stale, pending, unfenced, invisible or incorrect inspected pose '+JSON.stringify(patch));
  assert.equal(currentFrame({...good,kind:'aircraft',dataset:{aircraftState:'landing'},frame:{...good.frame,kind:'landing'}},8),false,'Landing remains moving despite a momentarily completed GPU frame');
  assert.equal(currentFrame({...good,layoutRevision:4,frame:{...good.frame,layoutRevision:3}},8),false,'Reject pre-rotation layout');
  assert.equal(Object.keys(viewports).length,6);assert.deepEqual(viewports.phone320,{width:320,height:780,touch:true});
  assert.equal(new URL(endpoint).hostname,'script.google.com');
  passed('current-frame-oracle-rejects-stale-unfenced-rotated-and-wrong-inspection');
  assert.deepEqual(colorValues('rgba(255, 255, 255, 0.5)'),[255,255,255,.5]);
  assert.deepEqual(colorValues('rgb(29 29 31 / 0.5)'),[29,29,31,.5]);
  assert.equal(colorValues('not-a-color'),null);
  assert.deepEqual(compositeColor([0,0,0,.5],[255,255,255]),[127.5,127.5,127.5]);
  assert.ok(near(contrastRatio([0,0,0],[255,255,255]),21));
  assert.ok(luminance([245,245,247])>=.8);assert.ok(luminance([25,25,28])<.8);
  assert.ok(contrastRatio([110,110,115],[245,245,247])>=4.5);
  const metric={longTasks:[{start:40,duration:80},{start:130,duration:90}],keys:[{received:70,nextRAF:120,trusted:true},{received:140,nextRAF:150,trusted:true}],taskQueue:[{expected:80,received:140,delayMs:60},{expected:130,received:140,delayMs:10}]};
  const fixed=responsivenessWindow(metric,100);assert.equal(fixed.longTaskTotalMs,60);assert.equal(fixed.keysDelivered,1);assert.deepEqual(fixed.keyToNextRAFMs,[50]);assert.equal(fixed.taskQueueMaxDelayMs,60);
  const full=responsivenessWindow(metric,220);assert.equal(full.longTaskTotalMs,170);assert.equal(full.keysDelivered,2);
  passed('light-color-contrast-math-and-full-startup-horizon-oracles');
  const anchored={url:'http://example.invalid/v3/projects/framework-raspberry-pi/#details',y:2580,details:{documentTop:2656},controls:{height:81},status:{text:'Actual viewer status',clientHeight:48,scrollHeight:48,clientWidth:240,scrollWidth:240}};
  assertPiAnchorUnchanged(anchored,{...anchored},'unit unchanged anchor');assertPiStatusReadable(anchored,'unit readable status');
  assert.throws(()=>assertPiAnchorUnchanged(anchored,{...anchored,details:{documentTop:2737}},'unit 81 px late shift'));
  assert.throws(()=>assertPiAnchorUnchanged(anchored,{...anchored,y:2661},'unit compensating scroll'));
  assert.throws(()=>assertPiStatusReadable({...anchored,status:{...anchored.status,scrollHeight:72}},'unit clipped text'));
  passed('held-pi-oracle-rejects-late-layout-shift-scroll-compensation-and-text-clipping');
}

if (require.main === module) (async()=>{
  fs.mkdirSync(output,{recursive:true});selfTest();if(argv.includes('--self-test'))return;
  const {chromium,webkit}=require('playwright'),engine=argv.includes('--webkit-smoke')?webkit:chromium,browser=await engine.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,...(argv.includes('--webkit-smoke')?{}:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})});
  try{if(argv.includes('--webkit-smoke'))await webkitSmoke(browser);else if(argv.includes('--profile'))await profile(browser);else if(argv.includes('--fallbacks'))await fallbacks(browser);else await viewportReview(browser,argv.find(arg=>arg.startsWith('--viewport='))?.split('=')[1]||'desktop1440');}finally{await browser.close();write('summary',{reports});}
})().catch(error=>{console.error(error);process.exitCode=1;});

module.exports = {installProbe, currentFrame};
