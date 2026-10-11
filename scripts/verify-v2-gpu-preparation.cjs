/* Deterministic source-only checks. Fake GL tests helper ownership/scheduling,
 * not browser rendering, driver behavior, or real GPU performance. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../assets/v2-gpu-preparation.js'), 'utf8');
const tests = [];
const test = (name, run) => tests.push({name, run});

function setup(options = {}) {
  let now = 0, nextTimer = 0;
  const timers = new Map(), calls = [], sync = {owned:true};
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE:1, ALREADY_SIGNALED:2, CONDITION_SATISFIED:3,
    TIMEOUT_EXPIRED:4, WAIT_FAILED:5,
    fenceSync(condition, flags) {calls.push(['fence', condition, flags]);return options.allocate ? options.allocate(sync) : sync;},
    flush() {calls.push(['flush']);options.flush?.();},
    clientWaitSync(value, flags, timeout) {
      assert.equal(value, sync);assert.equal(flags, 0);assert.equal(timeout, 0);
      calls.push(['poll', now]);return options.status ? options.status(gl, now) : gl.TIMEOUT_EXPIRED;
    },
    deleteSync(value) {assert.equal(value, sync);calls.push(['delete']);options.remove?.();},
    isContextLost() {return options.lost ? options.lost() : false;},
    finish() {throw new Error('Forbidden synchronous finish');},
  };
  const context = vm.createContext({window:{},performance:{now:() => now},
    setTimeout(callback, delay) {assert.ok(delay >= 0 && delay <= 16);const id=++nextTimer;timers.set(id,{callback,at:now+delay});return id;},
    clearTimeout(id) {timers.delete(id);}});
  vm.runInContext(source, context, {filename:'v2-gpu-preparation.js'});
  const renderer = {capabilities:{isWebGL2:true},getContext:() => gl};
  const advance = duration => {
    const end = now + duration; let iterations = 0;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break;
      assert.ok(++iterations < 2000, 'Timer polling must be finite');
      const [id, timer] = next; timers.delete(id); now = timer.at; timer.callback();
    }
    now = end;
  };
  const count = name => calls.filter(call => call[0] === name).length;
  const clean = (deletes = 1) => {assert.equal(count('delete'), deletes, 'Exactly one delete per allocated sync');assert.equal(timers.size, 0, 'No surviving poll timer');};
  return {gl,renderer,wait:context.window.V2GPUPreparation.wait,advance,calls,count,clean,timers};
}

test('already signaled completes synchronously without a timer', async () => {
  const s=setup({status:gl=>gl.ALREADY_SIGNALED});const result=await s.wait(s.renderer);
  assert.equal(result.state,'complete');assert.equal(result.polls,1);assert.equal(result.waitMs,0);
  assert.equal(s.count('flush'),1);s.clean();
});
test('condition satisfied after finite zero-timeout polling', async () => {
  const s=setup({status:(gl,now)=>now>=32?gl.CONDITION_SATISFIED:gl.TIMEOUT_EXPIRED});const promise=s.wait(s.renderer);
  s.advance(32);const result=await promise;assert.equal(result.state,'complete');assert.equal(result.polls,3);assert.equal(result.waitMs,32);s.clean();
  assert.deepEqual(s.calls.filter(call=>call[0]==='poll').map(call=>call[1]),[0,16,32],'Default cadence stays16ms');
});
test('visible-frame caller can request a four-millisecond cadence', async () => {
  const s=setup({status:(gl,now)=>now>=12?gl.CONDITION_SATISFIED:gl.TIMEOUT_EXPIRED});const promise=s.wait(s.renderer,{pollMs:4});
  s.advance(12);const result=await promise;assert.equal(result.state,'complete');assert.equal(result.polls,4);assert.equal(result.waitMs,12);s.clean();
  assert.deepEqual(s.calls.filter(call=>call[0]==='poll').map(call=>call[1]),[0,4,8,12]);
});
test('poll cadence is clamped to four through sixteen milliseconds', async () => {
  for(const [pollMs,expected]of [[-5,4],[0,4],[1,4],[4,4],[16,16],[99,16],[Infinity,16],[NaN,16]]){
    const s=setup({status:(gl,now)=>now>=expected?gl.CONDITION_SATISFIED:gl.TIMEOUT_EXPIRED});const promise=s.wait(s.renderer,{pollMs});
    assert.equal([...s.timers.values()][0].at,expected);s.advance(expected);const result=await promise;
    assert.equal(result.state,'complete');assert.equal(result.polls,2);assert.equal(result.waitMs,expected);s.clean();
  }
});
test('custom cadence still respects a shorter remaining deadline', async () => {
  const s=setup();const promise=s.wait(s.renderer,{pollMs:4,timeoutMs:6});s.advance(6);const result=await promise;
  assert.equal(result.state,'timeout');assert.equal(result.waitMs,6);assert.equal(result.polls,2);s.clean();
});
test('default timeout is bounded to twelve seconds', async () => {
  const s=setup();const promise=s.wait(s.renderer);s.advance(12000);const result=await promise;
  assert.equal(result.state,'timeout');assert.equal(result.waitMs,12000);assert.equal(result.polls,750);s.clean();s.advance(160);s.clean();
});
test('custom deadline is enforced without an extra full poll interval', async () => {
  const s=setup();const promise=s.wait(s.renderer,{timeoutMs:21});s.advance(21);const result=await promise;
  assert.equal(result.state,'timeout');assert.equal(result.waitMs,21);assert.equal(result.polls,2);s.clean();
});
test('zero or negative timeout creates no sync', async () => {
  for(const timeoutMs of [0,-1]){const s=setup();const result=await s.wait(s.renderer,{timeoutMs});assert.equal(result.state,'timeout');assert.equal(s.count('fence'),0);s.clean(0);}
});
test('nonfinite timeout cannot create an unbounded wait', async () => {
  for(const timeoutMs of [Infinity,NaN]){const s=setup();const promise=s.wait(s.renderer,{timeoutMs});s.advance(12000);assert.equal((await promise).state,'timeout');s.clean();}
});
test('pre-aborted signal or invalid generation creates no sync', async () => {
  const controller=new AbortController();controller.abort();
  for(const options of [{signal:controller.signal},{valid:()=>false},{valid:()=>{throw new Error('Stale generation');}}]){
    const s=setup();const result=await s.wait(s.renderer,options);assert.equal(result.state,'canceled');assert.equal(s.count('fence'),0);s.clean(0);
  }
});
test('AbortSignal immediately cancels the pending timer and deletes once', async () => {
  for(const pollMs of [undefined,4]){
    const controller=new AbortController(),s=setup();const promise=s.wait(s.renderer,{signal:controller.signal,pollMs});
    assert.equal(s.timers.size,1);controller.abort();s.clean();assert.equal((await promise).state,'canceled');
    s.advance(20000);assert.equal(s.count('poll'),1);s.clean();
  }
});
test('valid callback is checked again immediately before allocation', async () => {
  const s=setup();let checks=0;const result=await s.wait(s.renderer,{valid:()=>++checks===1});
  assert.equal(result.state,'canceled');assert.equal(s.count('fence'),0);s.clean(0);
});
test('generation invalidation stops before the next GL poll', async () => {
  for(const pollMs of [undefined,4]){
    let valid=true;const s=setup();const promise=s.wait(s.renderer,{valid:()=>valid,pollMs});valid=false;s.advance(pollMs||16);
    assert.equal((await promise).state,'canceled');assert.equal(s.count('poll'),1);s.clean();
  }
});
test('abort racing allocation still deletes the returned sync once', async () => {
  const controller=new AbortController();const s=setup({allocate:sync=>{controller.abort();return sync;}});
  const result=await s.wait(s.renderer,{signal:controller.signal});assert.equal(result.state,'canceled');assert.equal(s.count('flush'),0);s.clean();
});
test('abort during a GL poll wins over a completion status', async () => {
  const controller=new AbortController();const s=setup({status:gl=>{controller.abort();return gl.ALREADY_SIGNALED;}});
  assert.equal((await s.wait(s.renderer,{signal:controller.signal})).state,'canceled');s.clean();
});
test('valid callback aborting the signal cannot issue another GL poll', async () => {
  const controller=new AbortController(),s=setup();let cancel=false;
  const promise=s.wait(s.renderer,{signal:controller.signal,valid:()=>{if(cancel)controller.abort();return true;}});
  cancel=true;s.advance(16);assert.equal((await promise).state,'canceled');assert.equal(s.count('poll'),1);s.clean();
});
test('completion observed after the deadline is reported as timeout', async () => {
  let s;s=setup({status:gl=>{s.advance(33);return gl.ALREADY_SIGNALED;}});
  const result=await s.wait(s.renderer,{timeoutMs:32});assert.equal(result.state,'timeout');assert.equal(result.waitMs,33);s.clean();
});
test('completion removes its abort handler and cannot delete twice', async () => {
  const controller=new AbortController(),s=setup({status:gl=>gl.ALREADY_SIGNALED});
  assert.equal((await s.wait(s.renderer,{signal:controller.signal})).state,'complete');controller.abort();s.advance(100);s.clean();
});
test('WebGL1 and absent WebGL2 operations report unsupported honestly', async () => {
  const s=setup();s.renderer.capabilities.isWebGL2=false;assert.equal((await s.wait(s.renderer)).state,'unsupported');s.clean(0);
  for(const method of ['fenceSync','clientWaitSync','deleteSync','flush']){
    const next=setup();delete next.gl[method];assert.equal((await next.wait(next.renderer)).state,'unsupported');next.clean(0);
  }
  assert.equal((await s.wait(null)).state,'unsupported');
});
test('already-lost context never allocates a sync', async () => {
  const s=setup({lost:()=>true});assert.equal((await s.wait(s.renderer)).state,'lost');assert.equal(s.count('fence'),0);s.clean(0);
});
test('context loss during a wait releases its sync and timer', async () => {
  let lost=false;const s=setup({lost:()=>lost});const promise=s.wait(s.renderer);lost=true;s.advance(16);
  assert.equal((await promise).state,'lost');assert.equal(s.count('poll'),1);s.clean();
});
test('WAIT_FAILED and unknown statuses fail closed and delete once', async () => {
  for(const status of [gl=>gl.WAIT_FAILED,()=>-1]){const s=setup({status});assert.equal((await s.wait(s.renderer)).state,'lost');s.clean();}
});
test('failed allocation, flush, poll or context access returns lost', async () => {
  for(const options of [{allocate:()=>null},{allocate:()=>{throw new Error('Allocation');}},{flush:()=>{throw new Error('Flush');}},{status:()=>{throw new Error('Poll');}}]){
    const s=setup(options);assert.equal((await s.wait(s.renderer)).state,'lost');s.clean(options.allocate?0:1);
  }
  const s=setup();s.renderer.getContext=()=>{throw new Error('Context');};assert.equal((await s.wait(s.renderer)).state,'lost');s.clean(0);
});
test('cleanup exception does not retain ownership or change completion', async () => {
  const s=setup({status:gl=>gl.ALREADY_SIGNALED,remove:()=>{throw new Error('Context was destroyed');}});
  assert.equal((await s.wait(s.renderer)).state,'complete');s.advance(100);s.clean();
});

(async () => {
  new vm.Script(source);assert.doesNotMatch(source,/\.finish\s*\(/,'No synchronous GPU wait');
  for(const {name,run}of tests){await run();console.log('PASS '+name);}
  console.log(tests.length+' deterministic GPU preparation checks passed (no browser).');
})().catch(error=>{console.error(error);process.exitCode=1;});
