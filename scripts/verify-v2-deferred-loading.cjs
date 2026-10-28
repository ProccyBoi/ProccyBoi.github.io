/* Run with Node; no browser or server required. Exercise the production transfer
 * gate with delayed dependencies and changing visitor proximity. This verifies
 * request scheduling, not browser transfer speed or graphics performance. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'assets/v2-selected-work.js'), 'utf8');
const start = source.indexOf('  async function prepareTransfers(');
const end = source.indexOf('  const foregroundSettled=', start);
assert.ok(start >= 0 && end > start, 'Production transfer gate exists');
const transferFunction = source.slice(start, end);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
function setup({eligible=false, sourceGate, heroGate}={}) {
  const requests = [];
  const state = {eligible, sourceCalls:0};
  const context = vm.createContext({
    allowed:()=>true, failed:false, activePage:true, visible:false, preparationIntent:false,
    preparationEligible:()=>state.eligible, document:{hidden:false}, root:{dataset:{}},
    prepareSources:async()=>{state.sourceCalls++;if(sourceGate)await sourceGate.promise;},
    names:['esp32','dual','pi','logic'],
    window:{V2HeroAssets:{whenTransferSettled:()=>heroGate?.promise||Promise.resolve()},V2SelectedAssets:{prefetch:name=>{requests.push(name);return Promise.resolve();}}},
    setTimeout:()=>1, clearTimeout:()=>{},
  });
  vm.runInContext(`let transferTask,releaseTransfer;\n${transferFunction}\nglobalThis.prepare=prepareTransfers;globalThis.pending=()=>transferTask;`,context);
  return {context,state,requests};
}
(async()=>{
  let h=setup(); await h.context.prepare();
  assert.equal(h.state.sourceCalls,0);assert.equal(h.requests.length,0);
  h.state.eligible=true; await h.context.prepare();
  assert.deepEqual(h.requests,['esp32','dual','pi','logic']);
  await h.context.prepare();assert.equal(h.requests.length,4);
  const sourceGate=deferred(); h=setup({eligible:true,sourceGate});
  const first=h.context.prepare(); await flush(); h.state.eligible=false;sourceGate.resolve();await first;
  assert.equal(h.requests.length,0);
  const heroGate=deferred(); h=setup({eligible:true,heroGate});
  const waiting=h.context.prepare();await flush();h.state.eligible=false;heroGate.resolve();await waiting;
  assert.equal(h.requests.length,0);assert.equal(h.context.pending(),null);
  h.state.eligible=true;await h.context.prepare();assert.equal(h.requests.length,4);
  h=setup({eligible:true});h.context.document.hidden=true;await h.context.prepare();assert.equal(h.state.sourceCalls,0);
  const startup=fs.readFileSync(path.join(repo,'assets/v2-hero-startup.js'),'utf8');
  for(const preference of ['compact','reduced','data']){
    let requests=0;
    vm.runInNewContext(startup,{matchMedia:q=>({matches:preference==='compact'?q.includes('max-height'):preference==='reduced'?q.includes('reduced-motion'):false}),navigator:{connection:{saveData:preference==='data'}},window:{},document:{head:{append:()=>requests++}}});
    assert.equal(requests,0,`${preference} should retain poster-only startup`);
  }
  console.log('PASS: far-section deferral, first approach, repeat requests, exit during dependency/hero gates, return after cancellation, hidden-tab deferral, compact/reduced/data-saving startup. Source scheduling only; no browser performance claim.');
})().catch(error=>{console.error(error);process.exitCode=1;});
