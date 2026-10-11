/* Direct-fragment transport acceptance. Runs its own repository-root server.
 * --unit-only skips Playwright. Browser tests hold genuine response bodies;
 * no production fetch, scrolling, rendering or cache policy is replaced. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'v2/index.html'), 'utf8');
const bootstrap = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(source => source.includes('V2TransportPriority'));
assert.ok(bootstrap, 'Coordinator is inline before any eager script');
assert.ok(html.indexOf(bootstrap) < html.indexOf('src="/assets/v2-hero-startup.js'));
assert.match(html, /v2-hero-startup\.js[^" ]*" async/, 'Existing startup stays nonblocking');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function unitContext({hash='#skylabs-telemetry', reduced=false, short=false, saveData=false}={}) {
  const events = new Map(), timers = new Map(), requests = [], downloads = new Map(), images = [];
  const bounds = {hero:{top:0,bottom:1000},selected:{top:2000,bottom:4000},aircraft:{top:5000,bottom:7000}};
  const add = (event, callback) => { if(!events.has(event))events.set(event,new Set());events.get(event).add(callback); };
  const remove = (event, callback) => events.get(event)?.delete(callback);
  const sandbox = { TextDecoder,DataView,Uint8Array,ArrayBuffer,performance,URL,
    location:{hash,href:'https://example.test/v2/'+hash,origin:'https://example.test',pathname:'/v2/'},
    navigator:{connection:{saveData}},innerHeight:1000,scrollY:0,
    matchMedia:query=>({matches:query.includes('max-height')?short:reduced}),
    getComputedStyle:()=>({scrollPaddingTop:'80px'}),addEventListener:add,removeEventListener:remove,
    setTimeout:(callback,delay)=>{const id={};timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),
    document:{documentElement:{},addEventListener:add,removeEventListener:remove,
      querySelector:selector=>{const name=selector.includes('aircraft')?'aircraft':selector.includes('selected')?'selected':'hero';return {getBoundingClientRect:()=>bounds[name]};},
      createElement:()=>({}),head:{append:()=>{}}},
    fetch:url=>{requests.push(url);const download=deferred();downloads.set(url,download);return Promise.resolve({ok:true,arrayBuffer:()=>download.promise});},
    Image:class {set src(url){images.push(url);queueMicrotask(()=>this.onload());}}
  };
  sandbox.window=sandbox;vm.createContext(sandbox);
  const run=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox);
  vm.runInContext(bootstrap,sandbox);
  return {sandbox,bounds,timers,requests,downloads,images,run,emit:(name,event={})=>{for(const callback of [...events.get(name)||[]])callback(event);}};
}
function pack() {
  const json=Buffer.from(JSON.stringify({version:1,geometries:[],textures:[]})), start=Math.ceil((16+json.length)/4)*4, bytes=Buffer.alloc(start);
  bytes.write('V2HERO1');bytes.writeUInt32LE(json.length,8);bytes.writeUInt32LE(start,12);json.copy(bytes,16);
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}
async function unitTests() {
  for(const options of [{hash:''},{reduced:true},{short:true},{saveData:true}])assert.equal(unitContext(options).sandbox.V2TransportPriority,undefined,'Only eligible initial aircraft fragments install the gate');
  const test=unitContext(), priority=test.sandbox.V2TransportPriority;
  test.emit('scroll');assert.equal(priority.hasAircraftPriority(),true,'Transient initial top is not return navigation');
  test.run('assets/v2-hero-assets.js');
  const assets=test.sandbox.V2HeroAssets, tram=assets.prefetch('tramtrace'), again=assets.prefetch('tramtrace'), bytes=assets.whenTransferSettled('tramtrace');
  assert.strictEqual(tram,again);assert.strictEqual(bytes,assets.whenTransferSettled('tramtrace'));
  let settled=false;bytes.then(()=>{settled=true;});await flush();assert.equal(settled,false);assert.deepEqual(test.requests,[]);assert.deepEqual(test.images,[]);
  const telemetry=assets.prefetch('telemetry');assert.equal(test.requests.length,1);
  test.downloads.get(test.requests[0]).resolve(pack());await telemetry;
  priority.settle('environment');await flush();assert.equal(test.requests.length,1,'Airframe raw bytes are still required');
  priority.settle('airframe');await flush();assert.equal(test.requests.length,2);assert.equal(settled,false,'Release does not falsely settle an unstarted hero body');
  test.downloads.get(test.requests[1]).resolve(pack());await tram;await bytes;assert.equal(settled,true);assert.strictEqual(assets.prefetch('tramtrace'),tram);
  for(const mode of ['error','timeout','hash','hero','selected']) {
    const test=unitContext(), p=test.sandbox.V2TransportPriority;
    const held=p.wait('selected');assert.ok(held);
    if(mode==='error')p.settle('airframe',new Error('network'));
    if(mode==='timeout'){const timer=[...test.timers.values()][0];assert.equal(timer.delay,8000);timer.callback();}
    if(mode==='hash'){test.sandbox.location.hash='#work-framework';test.emit('hashchange');}
    if(mode==='hero'||mode==='selected'){
      test.bounds.hero={top:-7000,bottom:-5000};test.bounds.aircraft={top:0,bottom:3000};test.sandbox.scrollY=5000;test.emit('scroll');assert.equal(p.hasAircraftPriority(),true);
      test.bounds.aircraft={top:3000,bottom:5000};test.bounds[mode]={top:0,bottom:2000};test.sandbox.scrollY=1000;test.emit('scroll');
    }
    await held;assert.equal(p.wait('hero'),null);test.sandbox.location.hash='#skylabs-aircraft';test.emit('hashchange');assert.equal(p.hasAircraftPriority(),false,'One-way promotion never cancels or rearms requests');
  }
  const overlap=unitContext({hash:'#skylabs-aircraft'}), op=overlap.sandbox.V2TransportPriority;
  overlap.bounds.hero={top:-7000,bottom:-5000};overlap.bounds.selected={top:-2000,bottom:120};overlap.bounds.aircraft={top:120,bottom:3000};
  overlap.sandbox.scrollY=5000;overlap.emit('scroll');assert.equal(op.hasAircraftPriority(),true,'Initial aircraft/Selected overlap only arms reversal');
  overlap.sandbox.scrollY=5001;overlap.emit('scroll');assert.equal(op.hasAircraftPriority(),true,'Downward fragment restoration is not reversal');
  overlap.sandbox.scrollY=4999;overlap.emit('scroll');assert.equal(op.hasAircraftPriority(),false,'A later upward readable-section reversal promotes');
  // The raw airframe signal must fire before deliberately held decompression.
  const air=unitContext(), decode=deferred();air.sandbox.DecompressionStream=class {};
  air.sandbox.Blob=class {stream(){return {pipeThrough:()=>({})};}};air.sandbox.Response=class {arrayBuffer(){return decode.promise;}};
  air.sandbox.fetch=url=>{air.requests.push(url);if(url.includes('manifest'))return Promise.resolve({ok:true,json:async()=>({model:'original.glb',compressedModel:'original.glb.gz',asset:{sha256:'test'}})});const body=deferred();air.downloads.set(url,body);return Promise.resolve({ok:true,arrayBuffer:()=>body.promise});};
  air.run('assets/v3-aircraft-scene.js');const scene=air.sandbox.V3AircraftScene, ready=scene.prefetch(), raw=scene.whenTransferSettled();
  assert.strictEqual(raw,scene.whenTransferSettled());assert.strictEqual(ready,scene.prefetch());await flush();
  air.downloads.get(air.requests.find(url=>url.includes('original.glb'))).resolve(Uint8Array.from([31,139]).buffer);
  assert.equal((await raw).state,'ready');let decoded=false;ready.then(()=>{decoded=true;});await flush();assert.equal(decoded,false);
  decode.resolve(new ArrayBuffer(0));await ready;assert.equal(air.requests.length,2,'Opt-in raw observation does not refetch');
  // The normal page retains immediate, independent all-three hero transport.
  const normal=unitContext({hash:''});normal.run('assets/v2-hero-assets.js');['tramtrace','telemetry','pi'].forEach(name=>normal.sandbox.V2HeroAssets.prefetch(name));assert.equal(normal.requests.length,3);
  console.log('PASS unit: raw bytes, stable promises, no cycle, failure/stall, reversal, static guards, default parallelism, optional airframe signal');
}
const airframe=/\/models\/aircraft\/.*\/airframe(?:\.meshopt)?\.glb(?:\.gz)?(?:\?|$)/;
const hero=/\/models\/hero\/(tramtrace|telemetry|pi)\.(?:idx\.bin\.gz|bin)(?:\?|$)/;
const unrelated=/\/models\/(?:hero\/(?:tramtrace|pi)\.|selected\/)/;
const environment=/\/models\/hero\/environment\.bin/;
async function browserTests() {
  const {chromium}=require('playwright');
  const server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname), file=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
    fs.readFile(file,(error,bytes)=>{if(error){response.writeHead(404);response.end();return;}response.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');response.end(bytes);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});}
  catch(error){await new Promise(resolve=>server.close(resolve));throw error;}
  async function open({hash='#skylabs-telemetry',held=[airframe],reduced=false,saveData=false,height=1000}={}) {
    const context=await browser.newContext({viewport:{width:1440,height},reducedMotion:reduced?'reduce':'no-preference'});
    if(saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}));
    const page=await context.newPage(),requests=[],errors=[],gates=held.map(pattern=>({pattern,...deferred()}));
    page.on('request',request=>requests.push({url:request.url(),at:Date.now()}));page.on('pageerror',error=>errors.push(error.message));
    for(const gate of gates)await page.route(gate.pattern,async route=>{const mode=await gate.promise;if(mode==='abort')await route.abort();else await route.continue();});
    await page.goto(base+'/v2/'+hash,{waitUntil:'domcontentloaded'});
    return {context,page,requests,errors,gates,release:mode=>gates.forEach(gate=>gate.resolve(mode)),close:async()=>{gates.forEach(gate=>gate.resolve());await context.close();}};
  }
  const waitFor=async(test,pattern)=>{if(!test.requests.some(item=>pattern.test(item.url)))await test.page.waitForRequest(request=>pattern.test(request.url()),{timeout:7000});};
  const noDuplicates=test=>{const urls=test.requests.map(item=>item.url).filter(url=>hero.test(url)||unrelated.test(url)||airframe.test(url));assert.equal(new Set(urls).size,urls.length,'Each geometry URL downloads once');};
  try {
    {
      const test=await open({held:[airframe,/\/models\/hero\/telemetry\./,environment]});
      try{
        await waitFor(test,airframe);await waitFor(test,/\/models\/hero\/telemetry\./);await waitFor(test,environment);await pause(250);
        assert.equal(await test.page.evaluate(()=>V2TransportPriority.hasAircraftPriority()),true);
        assert.equal(test.requests.some(item=>unrelated.test(item.url)),false,'Implicit offscreen hero loads stay held');
        const signal=await test.page.evaluate(()=>{window.__rawPending=false;const a=V2HeroAssets.whenTransferSettled('tramtrace'),b=V2HeroAssets.whenTransferSettled('tramtrace');a.then(()=>window.__rawPending=true);return a===b;});assert.equal(signal,true);
        test.gates[1].resolve();test.gates[2].resolve();await pause(350);assert.equal(test.requests.some(item=>unrelated.test(item.url)),false);
        test.gates[0].resolve();await waitFor(test,/\/models\/selected\//);await waitFor(test,/\/models\/hero\/tramtrace\./);
        await test.page.waitForFunction(()=>!V2TransportPriority.hasAircraftPriority());noDuplicates(test);assert.deepEqual(test.errors,[]);
        console.log('PASS browser: cold direct fragment, required raw3 gate, implicit HeroAssets requests, automatic background release, no duplicates');
      }finally{await test.close();}
    }
    {
      const test=await open({hash:'#skylabs-aircraft'});try{
        await waitFor(test,airframe);await test.page.waitForFunction(()=>document.querySelector('[data-aircraft-hero]').getBoundingClientRect().top<innerHeight);await pause(350);
        assert.equal(await test.page.evaluate(()=>V2TransportPriority.hasAircraftPriority()),true,'The first aircraft anchor must not misclassify a neighbouring Selected tail as reversal');
        assert.equal(test.requests.some(item=>unrelated.test(item.url)),false);console.log('PASS browser: direct aircraft anchor keeps initial priority after native fragment restoration');
      }finally{await test.close();}
    }
    for(const target of ['hero','selected']){
      const test=await open();try{
        await waitFor(test,airframe);await test.page.waitForFunction(()=>document.querySelector('[data-aircraft-hero]').getBoundingClientRect().top<innerHeight);await pause(150);
        assert.equal(test.requests.some(item=>unrelated.test(item.url)),false);
        if(target==='hero')await test.page.keyboard.press('Control+Home');
        else await test.page.evaluate(()=>document.getElementById('work-framework').scrollIntoView({behavior:'instant'}));
        await waitFor(test,target==='hero'?/\/models\/hero\/tramtrace\./:/\/models\/selected\//);
        assert.equal(await test.page.evaluate(()=>V2TransportPriority.hasAircraftPriority()),false);
        assert.equal(await test.page.evaluate(()=>location.hash),'#skylabs-telemetry','Native scroll does not rewrite the fragment');
        await test.page.evaluate(()=>document.getElementById('skylabs-telemetry').scrollIntoView({behavior:'instant'}));await pause(100);noDuplicates(test);
        console.log('PASS browser: native '+target+' promotion while airframe is held, reversal and deduplication');
      }finally{await test.close();}
    }
    {
      const test=await open({held:[airframe,/\/models\/hero\/telemetry\./]});try{await waitFor(test,airframe);test.gates[1].resolve('abort');await waitFor(test,/\/models\/hero\/tramtrace\./);assert.equal(await test.page.evaluate(()=>V2TransportPriority.hasAircraftPriority()),false);console.log('PASS browser: required transfer failure releases unrelated work');}finally{await test.close();}
    }
    {
      const test=await open();try{await waitFor(test,airframe);assert.equal(test.requests.some(item=>unrelated.test(item.url)),false);await test.page.waitForFunction(()=>!V2TransportPriority.hasAircraftPriority(),null,{timeout:10000});await waitFor(test,/\/models\/hero\/tramtrace\./);console.log('PASS browser: stalled airframe cannot starve unrelated work beyond bounded release');}finally{await test.close();}
    }
    {
      const test=await open({hash:'',held:[hero]});try{await waitFor(test,/\/models\/hero\/pi\./);for(const name of ['tramtrace','telemetry','pi'])assert.ok(test.requests.some(item=>item.url.includes('/hero/'+name+'.')));assert.equal(await test.page.evaluate(()=>Boolean(window.V2TransportPriority)),false);assert.equal(test.requests.some(item=>airframe.test(item.url)),false);console.log('PASS browser: nohash all-three parallel transport and original background gate');}finally{await test.close();}
    }
    for(const options of [{reduced:true},{saveData:true}]){
      const test=await open(options);try{await pause(200);assert.equal(await test.page.evaluate(()=>Boolean(window.V2TransportPriority)),false);assert.equal(test.requests.some(item=>hero.test(item.url)||airframe.test(item.url)||unrelated.test(item.url)),false);console.log('PASS browser: '+(options.reduced?'reduced motion':'Save Data')+' direct fragment remains static');}finally{await test.close();}
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
(async()=>{await unitTests();if(!process.argv.includes('--unit-only'))await browserTests();})().catch(error=>{console.error(error);process.exitCode=1;});
