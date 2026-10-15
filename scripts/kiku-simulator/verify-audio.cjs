/* Real Chromium + Web Audio verification. Analyse the actual post-volume signal,
 * not DOM labels alone. No autoplay-policy override or fake audio implementation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require('playwright');
const useWebKit = process.argv.includes('--webkit');
const base = process.env.KIKU_BASE_URL || 'http://127.0.0.1:8766';
const root = path.join(__dirname, '../..');
const results = [];
async function main() {
  const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root,'assets/kiku/firmware-ui.wasm')));
  const api = instance.exports;
  for (const [menu, source] of [[0,1],[1,2],[2,3]]) {
    api.sim_init(); api.sim_event(0, menu); api.sim_event(1,0);
    assert.equal(api.sim_value(5),source,`Exact firmware source enum for menu ${menu}`);
  }
  const browser = await (useWebKit ? webkit : chromium).launch({headless:true, ...(!useWebKit && process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {}), ...(!useWebKit ? {args:['--no-sandbox']} : {})});
  const context = await browser.newContext({viewport:{width:1280,height:950}});
  await context.addInitScript(() => {
    const Original = window.AudioContext || window.webkitAudioContext;
    window.__probe = {contexts:[], sources:[], masters:[], requests:[]};
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.__probe.contexts.push(this); }
      createGain() {
        const node = super.createGain(), connect = node.connect.bind(node), context = this;
        node.connect = function(destination,...args) {
          if (destination === context.destination) {
            const analyser = context.createAnalyser(); analyser.fftSize = 2048;
            connect(analyser); window.__probe.masters.push({node,analyser});
          }
          return connect(destination,...args);
        };
        return node;
      }
      createBufferSource() {
        const node = super.createBufferSource(), start = node.start.bind(node);
        const entry = {node,active:false,offset:null}; window.__probe.sources.push(entry);
        node.start = (...args) => { entry.active = true; entry.offset = args[1] || 0; return start(...args); };
        node.addEventListener('ended',()=>{entry.active=false;});
        return node;
      }
    };
  });
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(String(error)));
  page.on('request',request=>{if(request.url().endsWith('.mp3'))results.push({request:request.url().split('/').at(-1)});});
  await page.route('**/__kiku_audio_test__', route => route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/kiku.css"><link rel="stylesheet" href="/assets/v2-kiku.css"><body class="kiku-page v2" style="background:#191c20;margin:30px"><div data-kiku-simulator></div><div style="height:1500px"></div><script type="module">import {mountKikuSimulator} from '/assets/v2-kiku-simulator.js'; window.demo = await mountKikuSimulator(document.querySelector('[data-kiku-simulator]'));</script>`}));
  await page.goto(base+'/__kiku_audio_test__');
  await page.waitForSelector('[data-kiku-mounted="ready"]');
  const play=page.locator('.kiku-sim-audio-play'),press=page.locator('.kiku-sim-press');
  const plus=page.getByLabel('Rotate encoder clockwise',{exact:true});
  const minus=page.getByLabel('Rotate encoder anticlockwise',{exact:true});
  const status=page.locator('.kiku-sim-audio-status');
  async function state(value) { await page.waitForFunction(value=>document.querySelector('.kiku-sim').dataset.audioState===value,value); }
  async function probe() { return page.evaluate(()=>{
    const p=window.__probe,m=p.masters.at(-1),data=new Float32Array(2048);m?.analyser.getFloatTimeDomainData(data);
    return {contexts:p.contexts.length,contextState:p.contexts.at(-1)?.state || 'none',active:p.sources.filter(s=>s.active).length,starts:p.sources.length,offset:p.sources.at(-1)?.offset || 0,gain:m?.node.gain.value || 0,rms:Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length),peak:Math.max(...data.map(Math.abs))};
  }); }
  async function silence(label) { await page.waitForTimeout(180);const p=await probe();assert.ok(p.rms<.00001,label+': silence '+JSON.stringify(p));results.push({test:label,probe:p}); }
  async function audible(label) {
    await state('playing');await page.waitForTimeout(220);
    const p=await probe();assert.ok(p.rms>.001,label+': nonzero PCM '+JSON.stringify(p));assert.equal(p.active,1,label+': one live source');results.push({test:label,probe:p});
  }
  assert.equal((await probe()).contexts,0);assert.equal(results.length,0);results.push({test:'No context or audio download before gesture'});
  await play.click();await audible('Explicit Play produces original music');
  assert.match(await status.textContent(),/Demo library: Afterglow/);
  await play.click();await state('paused');await silence('Pause stops signal');
  assert.match(await page.locator('.kiku-sim-state').textContent(),/Paused/);
  await play.click();await audible('Resume preserves position');assert.ok((await probe()).offset>.1);
  await page.locator('.kiku-sim-audio-mute').click();await silence('Mute is silent');
  assert.equal(await page.locator('.kiku-sim-audio-mute').getAttribute('aria-pressed'),'true');
  await page.locator('.kiku-sim-audio-mute').click();await audible('Unmute restores signal');
  await page.locator('.kiku-sim-audio-volume').focus();await page.keyboard.press('Home');await silence('Browser volume zero');
  await page.locator('.kiku-sim-audio-volume').focus();await page.keyboard.press('End');await audible('Browser volume restores signal');
  await page.evaluate(()=>{for(let i=0;i<30;i++)document.querySelector('[aria-label="Rotate encoder anticlockwise"]').click();});await silence('Firmware encoder volume zero');
  await page.evaluate(()=>{for(let i=0;i<24;i++)document.querySelector('[aria-label="Rotate encoder clockwise"]').click();});await audible('Firmware encoder controls actual gain');
  await page.getByRole('button',{name:'Right',exact:true}).click();await audible('Next selects a distinct original loop');
  assert.match(await status.textContent(),/Paper Satellites/);assert.equal((await probe()).offset,0);
  await page.getByRole('button',{name:'Hold left',exact:true}).click();
  await plus.click();await press.click();await audible('FM preview uses the selected station');
  assert.match(await status.textContent(),/FM station preview: Coastal Lines/);
  await plus.click();await state('paused');await silence('Between FM stations is silent');assert.match(await status.textContent(),/Between demo stations/);
  await page.getByRole('button',{name:'Right',exact:true}).click();await audible('FM seek selects next station loop');assert.match(await status.textContent(),/Night Bus Home/);
  await page.getByRole('button',{name:'Hold left',exact:true}).click();await plus.click();await press.click();await state('paused');await silence('Disconnected Bluetooth is silent');
  await page.getByLabel('Demo phone connected').check();await audible('Simulated Bluetooth uses current track');assert.match(await status.textContent(),/Simulated phone: Paper Satellites/);
  await page.getByLabel('Demo phone connected').uncheck();await state('paused');await silence('Phone disconnect stops playback');
  await page.getByLabel('Demo phone connected').check();await audible('Explicit reconnect plays');
  await page.getByRole('button',{name:'Hold encoder · power',exact:true}).click();await state('paused');await silence('Power off stops playback');
  await play.click();await audible('Play wakes and opens Music');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await state('paused');await silence('Hidden tab stops audio');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(120);assert.equal(await page.locator('.kiku-sim').getAttribute('data-audio-state'),'paused');await silence('Visibility return does not autoplay');
  await play.click();await audible('Explicit resume after hide');
  await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await state('paused');await silence('Offscreen demo pauses');
  await play.scrollIntoViewIfNeeded();await page.waitForTimeout(150);assert.equal(await page.locator('.kiku-sim').getAttribute('data-audio-state'),'paused');
  await play.click();await audible('Explicit resume after scrolling back');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await state('paused');await silence('Pagehide pauses');
  await play.click();await audible('Resume before reset');await page.locator('.kiku-sim-reset').click();await state('idle');await silence('Reset releases playback');
  assert.equal(await page.locator('.kiku-sim-audio-volume').inputValue(),'80');
  // Deferred downloads prove pending work cannot win a newer pause/reset.
  await page.evaluate(()=>window.demo.destroy());
  await page.route('**/*.mp3',async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.continue();});
  await page.evaluate(async()=>{const {mountKikuSimulator}=await import('/assets/v2-kiku-simulator.js');window.demo=await mountKikuSimulator(document.querySelector('[data-kiku-simulator]'));});
  await play.click();await state('loading');await play.click();await state('paused');await page.waitForTimeout(500);await silence('Pause wins a pending download');assert.equal((await probe()).active,0);
  await page.getByRole('button',{name:'Right',exact:true}).click();await state('loading');
  await page.locator('.kiku-sim-reset').click();await state('idle');await page.waitForTimeout(500);await silence('Reset wins an in-flight track switch');
  await play.click();await audible('Retry reuses loaded buffer');
  await page.evaluate(()=>{const b=document.querySelector('.kiku-sim-audio-play');for(let i=0;i<14;i++)b.click();});
  await audible('Rapid repeated clicks never layer sources');
  await page.locator('.kiku-sim-reset').click();await silence('Repeated-click reset stops all sources');
  await page.evaluate(()=>window.demo.destroy());await page.waitForTimeout(100);assert.equal((await probe()).active,0);
  assert.deepEqual(errors,[]);results.push({test:'Destroy cleans context and listeners; no page errors'});
  // A failed download provides a real retry rather than retaining a rejected cache.
  await page.unroute('**/*.mp3');let fail=true;
  await page.route('**/*.mp3',route=>fail?route.abort('failed'):route.continue());
  await page.evaluate(async()=>{const {mountKikuSimulator}=await import('/assets/v2-kiku-simulator.js');window.demo=await mountKikuSimulator(document.querySelector('[data-kiku-simulator]'));});
  await play.click();await state('error');assert.match(await status.textContent(),/retry/);fail=false;
  await play.click();await audible('Failed download can retry successfully');
  // A browser audio interruption never resumes without another gesture.
  await page.evaluate(()=>window.__probe.contexts.at(-1).suspend());await state('paused');assert.equal((await probe()).contextState,'suspended');results.push({test:'Interrupted context is suspended; no destination output (analyser may retain its prior frame)',probe:await probe()});
  await play.click();await audible('Gesture resumes suspended context');
  await page.evaluate(()=>window.demo.destroy());
  await browser.close();
  console.log(JSON.stringify({pass:true,engine:useWebKit?'webkit':'chromium',results},null,2));
}
async function unit() {
  const {pathToFileURL} = require('node:url');
  const previousWindow = global.window, previousFetch = global.fetch;
  const requests = [], contexts = [], sources = [];
  class Param { constructor() { this.value = 0; } cancelScheduledValues() {} setValueAtTime(v) {this.value=v;} linearRampToValueAtTime(v) {this.value=v;} setTargetAtTime(v) {this.value=v;} }
  class Node { constructor() {this.gain=new Param();} connect() {} disconnect() {this.disconnected=true;} }
  class Context {
    constructor() { this.currentTime=0; this.state='running'; this.destination={}; contexts.push(this); }
    createGain() { return new Node(); }
    createBufferSource() { const n=new Node();n.start=(at,offset)=>{n.active=true;n.offset=offset;};n.stop=()=>{n.active=false;};sources.push(n);return n; }
    resume() {this.state='running';return Promise.resolve();}
    close() {this.state='closed';return Promise.resolve();}
    decodeAudioData() {return Promise.resolve({duration:20});}
  }
  const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
  try {
    global.window={AudioContext:Context};
    global.fetch=(url)=>new Promise((resolve,reject)=>{requests.push({url:String(url),resolve:()=>resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(2))}),reject});});
    const {KikuDemoAudio}=await import(pathToFileURL(path.join(root,'assets/v2-kiku-audio.js')));
    const player=new KikuDemoAudio();
    assert.equal(contexts.length,0);assert.equal(requests.length,0);
    player.play(0);player.play(0);assert.equal(contexts.length,1);assert.equal(requests.length,1);
    player.pause();requests[0].resolve();await flush();assert.equal(sources.length,0,'Paused download cannot start');
    player.play();await flush();assert.equal(sources.filter(n=>n.active).length,1);
    contexts[0].currentTime=3;player.pause();assert.equal(player.offset,3);assert.equal(sources.filter(n=>n.active).length,0);
    player.play();await flush();assert.equal(sources.at(-1).offset,3,'Pause retains offset');
    player.play(1);assert.equal(requests.length,2);player.play(2);assert.equal(requests.length,3);
    requests[1].resolve();await flush();assert.equal(sources.filter(n=>n.active).length,0,'Older track cannot start');
    requests[2].resolve();await flush();assert.equal(player.track,2);assert.equal(sources.at(-1).offset,0);assert.equal(sources.filter(n=>n.active).length,1);
    player.setLevel(.3,true);assert.equal(player.gain.gain.value,0);player.setLevel(.3,false);assert.equal(player.gain.gain.value,.3);
    player.play(3);requests.at(-1).reject(new Error('Expected test failure'));await flush();assert.equal(player.status,'error');
    const beforeRetry=requests.length;player.play(3);assert.equal(requests.length,beforeRetry+1,'Failed cache evicted');requests.at(-1).resolve();await flush();assert.equal(player.status,'playing');
    contexts[0].state='interrupted';contexts[0].onstatechange();assert.equal(player.status,'paused');assert.equal(player.desired,false);
    player.play();await flush();assert.equal(player.status,'playing');assert.equal(contexts.length,1,'Reuse same context after interruption');
    player.reset();assert.equal(player.track,0);assert.equal(player.offset,0);assert.equal(player.status,'idle');assert.equal(sources.filter(n=>n.active).length,0);
    player.play();player.destroy();await flush();assert.equal(sources.filter(n=>n.active).length,0);assert.equal(contexts[0].state,'closed');
    console.log('PASS: lazy initialization, deduplicated loading, pending-pause/reset/destroy cancellation, latest-track wins, offset resume, mute/level, failed-cache retry and interruption recovery (Node unit mocks; not browser audio evidence).');
  } finally {global.window=previousWindow;global.fetch=previousFetch;}
}
(process.argv.includes('--unit-only') ? unit() : main()).catch(error=>{console.error(error);process.exitCode=1;});
