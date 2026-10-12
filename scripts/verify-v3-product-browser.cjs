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
  const probe = window.__v3ProductProbe = { contexts:[], input:[], sceneFrames:{}, started:performance.now() };
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
    controls:[...document.querySelectorAll('[data-v3-menu],.v3-quick-projects,[data-v3-nav] a,select,[data-framework-overview],[data-framework-inspect]')].map(node=>({tag:node.tagName,label:node.getAttribute('aria-label')||node.textContent.trim(),value:node.value,href:node.getAttribute('href'),hidden:node.hidden,inert:node.inert,disabled:node.disabled,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility,rect:rect(node)})), contexts:probe.contexts, input:probe.input});
}

async function networkGuard(context) {
  const state = {availability:[],submissions:[],blocked:[],mode:'ready',response:{ok:true}};
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
    if (url.origin === new URL(base).origin && ['GET','HEAD'].includes(request.method())) return route.continue();
    state.blocked.push({url:url.href,method:request.method()}); return route.abort('blockedbyclient');
  });
  return state;
}
async function open(browser, viewport, options = {}) {
  const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height},hasTouch:viewport.touch,isMobile:viewport.touch,deviceScaleFactor:1,serviceWorkers:'block',timezoneId:'Australia/Sydney',reducedMotion:options.reduced ? 'reduce' : 'no-preference',javaScriptEnabled:!options.noJS});
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
  await page.waitForFunction(()=>{const now=performance.now(),last=window.__v3ScrollStable;if(!last||Math.abs(last.y-scrollY)>.1){window.__v3ScrollStable={y:scrollY,at:now};return false;}return now-last.at>=180;},null,{polling:30,timeout});
}
async function sceneReady(page, kind, afterSequence = 0) {
  await page.waitForFunction(({kind,afterSequence})=>window.__v3ProductProbe.matches(window.__v3ProductProbe.read(kind),afterSequence),{kind,afterSequence},{timeout,polling:40});
  await imagesReady(page);
  await page.waitForFunction(kind=>{const selector={hero:'[data-assembly]',selected:'[data-selected-work]',aircraft:'[data-aircraft-hero]'}[kind],root=document.querySelector(selector);return root.getAnimations({subtree:true}).every(animation=>animation.effect?.getComputedTiming().iterations===Infinity||!['running','pending'].includes(animation.playState));},kind,{timeout});
  await scrollStable(page);
  assert.ok(await page.evaluate(kind=>window.__v3ProductProbe.matches(window.__v3ProductProbe.read(kind),0),kind),'The completed pose must still match after fades and native scrolling settle');
  return page.evaluate(kind=>window.__v3ProductProbe.read(kind),kind);
}
async function shot(run, name, {scene, afterSequence=0, fullPage=false} = {}) {
  if (scene) await sceneReady(run.page,scene,afterSequence); else await imagesReady(run.page);
  await fit(run.page,name);
  const before=await run.page.evaluate(()=>window.__v3ProductProbe?.snapshot()||({url:location.href,y:scrollY,viewport:{width:innerWidth,height:innerHeight},noJS:true}));
  await run.page.screenshot({path:path.join(output,name+'.png'),fullPage,caret:'hide',timeout:60000});
  const after=await run.page.evaluate(()=>({url:location.href,y:scrollY,scene:window.__v3ProductProbe?.snapshot().scenes}));
  assert.equal(after.url,before.url,'Screenshot belongs to the same native destination'); assert.ok(Math.abs(after.y-before.y)<2,'Screenshot cannot straddle scroll destinations');
  if(scene)assert.ok(currentFrame(after.scene[scene],afterSequence),'Screenshot finishes with the newly fenced current pose');
  write(name,{before,after,errors:run.errors,shaders:run.shaders,network:run.network});
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
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('href')),'/v3/projects/','Keyboard enters the open primary navigation');
    await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.equal(await menu.evaluate(node=>node===document.activeElement),true);
    await menu.press('Space');assert.equal(await menu.getAttribute('aria-expanded'),'true');await menu.press('Space');assert.equal(await menu.getAttribute('aria-expanded'),'false');
    if(run.viewport.touch){await menu.tap();assert.equal(await menu.getAttribute('aria-expanded'),'true');await menu.tap();assert.equal(await menu.getAttribute('aria-expanded'),'false');}
    const b=await menu.boundingBox();assert.ok(b.width>=44&&b.height>=44,'Touch menu target is at least 44×44');
  }else{assert.equal(await nav.isVisible(),true);assert.equal(await nav.evaluate(node=>node.inert),false);}
  if(label==='desktop1440-book'){
    await page.setViewportSize({width:1024,height:768});await menu.waitFor({state:'visible'});await menu.focus();
    await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>document.activeElement?.matches('[data-v3-nav] [data-v3-project-link]'));
    assert.equal(await menu.getAttribute('aria-expanded'),'false','Compact to desktop closes Menu and recovers visible Projects focus');
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
  assert.equal(layout.columns,layout.stageWidth<=760?2:4,'Caption columns follow actual CAD stage width, including portrait tablet gutters');
  assert.equal(layout.copies.length,4);
  for(const copy of layout.copies){assert.ok(copy.left>=layout.stage.left-1&&copy.right<=layout.stage.right+1&&copy.top>=0&&copy.bottom<=layout.viewport.height+1,label+': readable onscreen project caption '+copy.text);assert.match(copy.href,/^\/v3\/projects\//);}
  for(let i=0;i<layout.copies.length;i++)for(let j=i+1;j<layout.copies.length;j++){const a=layout.copies[i],b=layout.copies[j],overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left),overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);assert.ok(overlapX<=1||overlapY<=1,label+': project captions do not overlap');}
  write(label+'-caption-layout',layout);
}

async function homeScenes(run, prefix) {
  const page=run.page;
  await goto(run,'/v3/');await header(run,prefix+'-home');
  await shot(run,prefix+'-hero-first-content');
  await page.waitForFunction(()=>document.querySelector('[data-assembly]')?.dataset.assemblyModelsReady==='3',null,{timeout});
  await shot(run,prefix+'-hero-opening',{scene:'hero'});
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
    const restore=await page.evaluate(()=>window.__v3ProductProbe.read('selected').frame.sequence);await select.selectOption('2');await sceneReady(page,'selected',restore);
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
  const transit=await hashLink(run,page.locator('.v2-selected-nav a[href="#work-transit"]'),'work-transit','selected');
  assert.equal(await page.locator('[data-selected-work]').getAttribute('data-selected-chapter'),'1');
  await shot(run,prefix+'-transit',{scene:'selected',afterSequence:transit});
  const aircraft=await hashLink(run,page.locator('.v2-selected-skip'),'skylabs-aircraft','aircraft');
  await page.waitForFunction(()=>document.querySelector('[data-aircraft-hero]')?.dataset.aircraftState==='ready',null,{timeout});
  await shot(run,prefix+'-skylabs-aircraft',{scene:'aircraft',afterSequence:aircraft});
  const telemetry=await hashLink(run,page.locator('[data-aircraft-chapter="0"] a[href="#skylabs-telemetry"]'),'skylabs-telemetry','aircraft');
  await shot(run,prefix+'-skylabs-telemetry',{scene:'aircraft',afterSequence:telemetry});
  assert.equal(await page.locator('[data-aircraft-chapter="1"] a[href="/v3/projects/skylabs/boards/telemetry/"]').count(),1,'Telemetry retains an explicit project route');
  // Browser Back restores the actual fragment and the corresponding new frame.
  const back=await page.evaluate(()=>window.__v3ProductProbe.read('aircraft').frame.sequence);await page.goBack({waitUntil:'domcontentloaded'});await page.waitForURL('**#skylabs-aircraft');await sceneReady(page,'aircraft',back);
  passed(prefix+'-home-current-fenced-scenes-native-hashes-preview-and-back');
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
  await page.locator('[data-v2-project][href="/v3/projects/framework-raspberry-pi/"]').click();await page.waitForURL('**/v3/projects/framework-raspberry-pi/');await page.locator('h1').waitFor();
  await header(run,prefix+'-case');await shot(run,prefix+'-case-overview');
  const selector=page.getByRole('combobox',{name:'On this page'}),compact=run.viewport.touch||run.viewport.width<=1024;
  assert.equal(await selector.isVisible(),compact);
  if(compact){
    assert.equal(await page.locator('.v2-case-nav').evaluate(node=>node.inert),true);
    assert.equal(await page.locator('.v2-case-nav').isVisible(),false,'Compact case links do not become a second sticky rail');
    const value=await selector.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));assert.ok(value.includes('#engineering')&&value.includes('#details'));
    await selector.selectOption('#engineering');await page.waitForURL('**#engineering');await scrollStable(page);
    await selector.selectOption('#details');await page.waitForURL('**#details');await scrollStable(page);
    await page.goBack({waitUntil:'domcontentloaded'});await page.waitForURL('**#engineering');await scrollStable(page);
  }else{await page.locator('[data-v2-section][href$="#engineering"]').click();await page.waitForURL('**#engineering');await scrollStable(page);}
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
  await shot(run,prefix+'-book-calendar');
  for(const duration of [15,30,45,60]){
    await page.locator(`[name="duration-choice"][value="${duration}"]`).check();
    await page.waitForFunction(duration=>document.querySelector('[data-booking-card-title]').textContent.includes(duration+'-minute')&&!document.querySelector('[data-booking-days]').hidden,duration);
    await page.locator('[data-slot]').first().click();assert.equal(await page.locator('[data-form-duration]').inputValue(),String(duration));assert.equal(await page.locator('[data-form-token]').inputValue(),'mock-v3-'+duration);
  }
  await page.locator('[name="format-choice"][value="in-person"]').check();assert.equal(await page.locator('[data-form-format]').inputValue(),'in-person');
  await page.locator('[name="name"]').fill('Browser Review');await page.locator('[name="email"]').fill('browser-review@example.invalid');await page.locator('[name="topic"]').fill('Local automated UI check. Mocked endpoint only.');
  await shot(run,prefix+'-book-details');
  await page.locator('[data-booking-submit]').click();await page.locator('[data-booking-success]').waitFor({state:'visible'});
  assert.equal(run.network.submissions.length,1,'Exactly one mock POST');assert.equal(run.network.submissions[0].email,'browser-review@example.invalid');assert.equal(run.network.submissions[0].duration,'60');assert.equal(run.network.submissions[0].format,'in-person');
  await shot(run,prefix+'-book-mocked-success');
  await page.locator('[data-book-another]').click();await page.locator('[data-slot]').first().waitFor();assert.equal(await page.locator('[data-booking-success]').isVisible(),false);
  passed(prefix+'-book-mocked-get-post-success-repeat-flow',{mockedGETs:run.network.availability.length,mockedPOSTs:run.network.submissions.length});
}

async function viewportReview(browser,name) {
  assert.ok(viewports[name],'Unknown viewport '+name);const run=await open(browser,viewports[name]);
  try{
    await homeScenes(run,name);await catalogAndCase(run,name);await book(run,name);
    assert.deepEqual(run.errors,[],'No uncaught JavaScript errors');assert.deepEqual(run.shaders,[],'No shader errors');assert.deepEqual(run.network.blocked,[],'No unexpected external traffic or non-GET operations');
    write(name+'-result',{viewport:viewports[name],reports,errors:run.errors,shaders:run.shaders,network:run.network});
  }catch(error){await diagnose(run,name,error);throw error;}finally{await run.context.close();}
}
async function diagnose(run,name,error) {write(name+'-failure',{error:error.stack,errors:run.errors,shaders:run.shaders,network:run.network,snapshot:await run.page.evaluate(()=>window.__v3ProductProbe?.snapshot()||({url:location.href,y:scrollY})).catch(error=>({error:error.message}))});await run.page.screenshot({path:path.join(output,name+'-failure.png'),timeout:15000}).catch(()=>{});}

async function fallbacks(browser) {
  for(const [name,options] of [['no-js',{noJS:true}],['reduced-motion',{reduced:true}],['webgl-unavailable',{noWebGL:true}]]){
    const run=await open(browser,viewports.phone390,options);
    try{
      await goto(run,'/v3/');
      if(!options.noJS)await run.page.waitForFunction(()=>{const d=document.querySelector('[data-assembly]')?.dataset;return ['static','unavailable'].includes(d?.assemblyState);},null,{timeout});
      assert.ok(await run.page.locator('.v2-header a[href="/v3/projects/"]:visible').count()>0,'Fallback retains a visible real Projects link');
      const projectRoutes=await run.page.locator('[data-selected-work] a[href^="/v3/projects/"]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.getAttribute('href')))]);assert.ok(projectRoutes.length>=6,'All six direct project routes remain');
      await shot(run,name+'-home');
      await run.page.locator('#work-framework').scrollIntoViewIfNeeded();
      if(!options.noJS){await run.page.waitForFunction(()=>['static','unavailable'].includes(document.querySelector('[data-selected-work]')?.dataset.selectedState),null,{timeout});await run.page.locator('#work-framework').scrollIntoViewIfNeeded();await scrollStable(run.page);}
      await shot(run,name+'-framework');
      await run.page.locator('#work-transit').scrollIntoViewIfNeeded();await shot(run,name+'-transit');
      await run.page.locator('#skylabs-aircraft').scrollIntoViewIfNeeded();
      if(!options.noJS){await run.page.waitForFunction(()=>['static','unavailable'].includes(document.querySelector('[data-aircraft-hero]')?.dataset.aircraftState),null,{timeout});await run.page.locator('#skylabs-aircraft').scrollIntoViewIfNeeded();await scrollStable(run.page);}
      await shot(run,name+'-skylabs');
      await goto(run,'/v3/book/');if(options.noJS)assert.equal(await run.page.getByText(/live calendar needs JavaScript/).isVisible(),true);else await run.page.locator('[data-slot]').first().waitFor();await shot(run,name+'-book');
      assert.equal(run.network.submissions.length,0);assert.deepEqual(run.errors,[]);passed(name+'-readable-static-routes');
    }catch(error){await diagnose(run,name,error);throw error;}finally{await run.context.close();}
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
      await goto(run,route);await imagesReady(run.page);await fit(run.page,route);const h1=await run.page.locator('h1').first().textContent();assert.ok(h1.trim());documents.push({route,h1});
    }
    write('all-routes-no-js-mobile320',documents);passed('all-'+documents.length+'-routes-no-js-narrow-render-and-utilities');
  }finally{await run.context.close();}
}

async function webkitSmoke(browser) {
  const run=await open(browser,viewports.ipad1024,{reduced:true});
  try {
    await goto(run,'/v3/');await header(run,'webkit-ipad-emulation-home');await shot(run,'webkit-ipad-emulation-home');
    await catalogAndCase(run,'webkit-ipad-emulation');await book(run,'webkit-ipad-emulation');
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.network.blocked,[]);
    write('webkit-ipad-emulation-result',{reports,network:run.network,note:'WebKit tablet viewport/touch emulation on Linux, reduced motion. This is not a test on a physical iPad or Safari/iPadOS.'});
  }catch(error){await diagnose(run,'webkit-ipad-emulation',error);throw error;}finally{await run.context.close();}
}

function installProfile() {
  const metric=window.__v3HeroProfile={firstVisibleResource:null,firstFenced:null,allFenced:null,longTasks:[],keys:[]};
  new PerformanceObserver(list=>{for(const item of list.getEntries())metric.longTasks.push({start:item.startTime,duration:item.duration});}).observe({type:'longtask',buffered:true});
  addEventListener('keydown',event=>{if(event.key!=='F8')return;const input={received:performance.now(),trusted:event.isTrusted,key:event.key,nextRAF:null};metric.keys.push(input);requestAnimationFrame(()=>{input.nextRAF=performance.now();});},{capture:true});
  const inspect=()=>{
    const hero=document.querySelector('[data-assembly]');if(!hero)return;const d=hero.dataset,now=performance.now();
    if(d.assemblyGPUCompletionEvidence==='own-context-fence'&&d.assemblyGPUCompletion==='complete'){
      if(metric.firstFenced===null&&Number(d.assemblyModelsReady)>0)metric.firstFenced=now;
      if(metric.allFenced===null&&Number(d.assemblyModelsReady)===3)metric.allFenced=now;
    }
  };
  new MutationObserver(inspect).observe(document,{subtree:true,attributes:true,attributeFilter:['data-assembly-models-ready','data-assembly-gpu-completion','data-assembly-gpu-completion-evidence']});
  const visible=()=>{const images=[...document.querySelectorAll('[data-assembly-posters] img')];if(images.some(image=>{const b=image.getBoundingClientRect(),s=getComputedStyle(image);return image.complete&&image.naturalWidth>0&&b.width>0&&b.height>0&&b.bottom>0&&b.top<innerHeight&&s.visibility==='visible'&&Number(s.opacity)>.5;})){metric.firstVisibleResource=performance.now();return;}if(metric.firstFenced!==null){metric.firstVisibleResource=metric.firstFenced;return;}requestAnimationFrame(visible);};requestAnimationFrame(visible);
}
async function profile(browser) {
  const samples=[],network={offline:false,latency:40,downloadThroughput:10_000_000/8,uploadThroughput:10_000_000/8,connectionType:'wifi'};
  // /v2/ is the frozen source in this same tree, established by the workflow's
  // preservation gate. Each sample is a new context and cold CDP cache. Reverse
  // the order on the second pair to expose runner drift rather than hiding it.
  for(let pair=0;pair<3;pair++)for(const version of pair%2?['v3','v2']:['v2','v3']){
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'no-preference'});await networkGuard(context);await context.addInitScript(installProfile);
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',network);
    try{
      await page.goto(base+'/'+version+'/',{waitUntil:'domcontentloaded',timeout});
      const inputCalls=[],probeInput=async()=>{
        for(;;){
          const pageBefore=await page.evaluate(()=>performance.now());if(pageBefore>=15000)return pageBefore;
          const start=performance.now();await page.keyboard.press('F8');const elapsed=performance.now()-start;
          const observed=await page.evaluate(()=>performance.now());inputCalls.push({pageBefore,pageObserved:observed,automationCallMs:elapsed});
          if(observed>=15000)return observed;await new Promise(resolve=>setTimeout(resolve,Math.max(0,1000-elapsed)));
        }
      };
      const [,observedHorizonMs]=await Promise.all([page.waitForFunction(()=>window.__v3HeroProfile.allFenced!==null,null,{timeout}),probeInput()]);
      await page.waitForTimeout(100); // Deliver the final observer/RAF callbacks.

      const sample=await page.evaluate(()=>({metric:window.__v3HeroProfile,hero:{...document.querySelector('[data-assembly]').dataset},scrollY,navigation:performance.getEntriesByType('navigation')[0].toJSON(),paints:performance.getEntriesByType('paint').map(entry=>({name:entry.name,start:entry.startTime})),resources:performance.getEntriesByType('resource').map(entry=>({path:new URL(entry.name).pathname,start:entry.startTime,end:entry.responseEnd,transfer:entry.transferSize,encoded:entry.encodedBodySize,decoded:entry.decodedBodySize}))}));
      assert.deepEqual(errors,[]);assert.equal(sample.scrollY,0);assert.ok(sample.metric.firstFenced!==null&&sample.metric.allFenced>=sample.metric.firstFenced);assert.equal(sample.hero.assemblyModelsReady,'3');assert.equal(sample.hero.assemblyGPUCompletionEvidence,'own-context-fence');
      const fixedLongTasks=sample.metric.longTasks.filter(task=>task.start<15000).map(task=>({...task,withinHorizonMs:Math.min(task.duration,15000-task.start)}));
      const receivedKeys=sample.metric.keys.filter(key=>key.received<15000),paintedKeys=receivedKeys.filter(key=>key.nextRAF!==null);
      const responsiveness={requestedHorizonMs:15000,observedHorizonMs,inputCalls,receivedKeys,keysDelivered:receivedKeys.length,keysCompleted:paintedKeys.length,keyToNextRAFMs:paintedKeys.map(key=>key.nextRAF-key.received),longTaskTotalMs:fixedLongTasks.reduce((sum,task)=>sum+task.withinHorizonMs,0),longTaskMaxMs:Math.max(0,...fixedLongTasks.map(task=>task.withinHorizonMs)),fixedLongTasks,note:'Fixed navigation-relative first 15 seconds. Real F8 delivery → next RAF and automation-call duration are synthetic responsiveness probes, not field INP. Long tasks crossing the horizon are clipped; actual collection horizon is reported.'};
      assert.ok(receivedKeys.every(key=>key.trusted),'Every received F8 sample is trusted native keyboard input');
      samples.push({pair:pair+1,version,...sample,responsiveness,errors});write('hero-profile-samples',samples);console.log('PROFILE '+version+' pair '+(pair+1)+' first fenced '+Math.round(sample.metric.firstFenced)+'ms; all fenced '+Math.round(sample.metric.allFenced)+'ms');
    }finally{await context.close();}
  }
  const median=values=>{const finite=values.filter(Number.isFinite).sort((a,b)=>a-b);return finite.length?finite[Math.floor(finite.length/2)]:null;};
  const summary=Object.fromEntries(['v2','v3'].map(version=>{const runs=samples.filter(sample=>sample.version===version);return[version,{firstVisibleResourceReadyMs:median(runs.map(sample=>sample.metric.firstVisibleResource)),firstFencedMs:median(runs.map(sample=>sample.metric.firstFenced)),allFencedMs:median(runs.map(sample=>sample.metric.allFenced)),first15sLongTaskTotalMs:median(runs.map(sample=>sample.responsiveness.longTaskTotalMs)),first15sLongTaskMaxMs:median(runs.map(sample=>sample.responsiveness.longTaskMaxMs)),first15sKeyToNextRAFMaxMs:median(runs.map(sample=>sample.responsiveness.keyToNextRAFMs.length?Math.max(...sample.responsiveness.keyToNextRAFMs):null)),first15sKeysDeliveredByRun:runs.map(sample=>sample.responsiveness.keysDelivered),first15sKeysCompletedByRun:runs.map(sample=>sample.responsiveness.keysCompleted),resourceTransferBytes:median(runs.map(sample=>sample.resources.reduce((sum,item)=>sum+item.transfer,0)))}];}));
  write('hero-profile-summary',{method:'Three alternating cold pairs, same browser/runner, 1440×900 DPR 1, 10 Mbps / 40 ms; unchanged v2 verified separately; production own-context-fenced handoff timestamps. First visible resource means a complete image with natural size in a visible box (or first fenced CAD), not a browser paint or decode timestamp. Fixed first-15s long-task and trusted F8 → next-RAF probes supplement startup milestones; measured automation horizons are included and this is not field INP. No screenshot or pixel readback during profiling. SwiftShader is not a device benchmark. Timings are review evidence, not an arbitrary pass/fail performance claim.',network,summary,samples});passed('matched-initial-hero-profile-three-cold-pairs',summary);
}

function selfTest() {
  const good={native:.25,rendered:.25,visible:true,canvasVisible:true,masked:false,pending:false,revision:8,presentedRevision:8,inspectionRevision:3,inspectionPresentedRevision:3,inspectionTarget:2,fence:{completed:50,deleted:51},frame:{sequence:9,published:true,gpu:{state:'complete'},submittedMs:40,completedMs:51,value:.25,revision:8,inspectionRevision:3,inspectionWeights:[0,0,1,0]}};
  assert.equal(currentFrame(good,8),true);
  for(const patch of [{native:.5},{pending:true},{masked:true},{canvasVisible:false},{presentedRevision:7},{inspectionPresentedRevision:2},{inspectionTarget:1},{fence:{completed:30,deleted:31}},{frame:{...good.frame,published:false}},{frame:{...good.frame,gpu:{state:'unsupported'}}},{frame:{...good.frame,sequence:8}},{frame:{...good.frame,revision:7}},{frame:{...good.frame,inspectionWeights:[0,0,.5,0]}}])assert.equal(currentFrame({...good,...patch},8),false,'Reject stale, pending, unfenced, invisible or incorrect inspected pose '+JSON.stringify(patch));
  assert.equal(currentFrame({...good,layoutRevision:4,frame:{...good.frame,layoutRevision:3}},8),false,'Reject pre-rotation layout');
  assert.equal(Object.keys(viewports).length,6);assert.deepEqual(viewports.phone320,{width:320,height:780,touch:true});
  assert.equal(new URL(endpoint).hostname,'script.google.com');
  passed('current-frame-oracle-rejects-stale-unfenced-rotated-and-wrong-inspection');
}

(async()=>{
  fs.mkdirSync(output,{recursive:true});selfTest();if(argv.includes('--self-test'))return;
  const {chromium,webkit}=require('playwright'),engine=argv.includes('--webkit-smoke')?webkit:chromium,browser=await engine.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,...(argv.includes('--webkit-smoke')?{}:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})});
  try{if(argv.includes('--webkit-smoke'))await webkitSmoke(browser);else if(argv.includes('--profile'))await profile(browser);else if(argv.includes('--fallbacks'))await fallbacks(browser);else await viewportReview(browser,argv.find(arg=>arg.startsWith('--viewport='))?.split('=')[1]||'desktop1440');}finally{await browser.close();write('summary',{reports});}
})().catch(error=>{console.error(error);process.exitCode=1;});
