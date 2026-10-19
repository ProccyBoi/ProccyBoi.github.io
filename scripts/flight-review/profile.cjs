#!/usr/bin/env node
'use strict';
// Same-machine paired comparison. These are UX/task measurements, not isolated
// parser throughput or hardware-GPU claims. Baseline also selects Charts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('./harness.cjs'),{binary,payload,manifest}=require('./fixtures.cjs');
const BASELINE='d15883bd3945502c412121e1d434e04588f200d0';
const out=path.resolve(process.env.FLIGHT_REVIEW_OUT||'/tmp/flight-review-evidence/performance');
const rounds=Number(process.env.FLIGHT_PROFILE_RUNS||4),count=Number(process.env.FLIGHT_PROFILE_RECORDS||120001);
const baselineRoot=process.env.FLIGHT_BASELINE_ROOT;
const median=a=>{a=[...a].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
const percentile=(a,q)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*q))]||0;
function windowMetrics(snapshot,start=0,end=Infinity){
  const tasks=snapshot.longTasks.filter(x=>x.start>=start&&x.start<=end),gaps=snapshot.heartbeats.filter(x=>x.at>=start&&x.at<=end).map(x=>x.gap);
  return {longTasks:tasks.length,longTaskTotalMs:tasks.reduce((s,x)=>s+x.duration,0),totalBlockingTimeMs:tasks.reduce((s,x)=>s+Math.max(0,x.duration-50),0),maxLongTaskMs:Math.max(0,...tasks.map(x=>x.duration)),heartbeatSamples:gaps.length,maxHeartbeatGapMs:Math.max(0,...gaps),heartbeatP95Ms:percentile(gaps,.95)};
}
async function scrub(page,idx){
  return page.evaluate(idx=>new Promise(resolve=>{
    const start=performance.now(),input=document.querySelector('[data-timeline]'),readout=document.querySelector('[data-sample-readout]');
    let done=false;const finish=()=>{if(done)return;done=true;observer.disconnect();requestAnimationFrame(()=>resolve(performance.now()-start));};
    const check=()=>{if(Number(readout.textContent.split('/')[0].replace(/[^\d]/g,''))===idx+1)finish();};
    const observer=new MutationObserver(check);observer.observe(readout,{childList:true,subtree:true,characterData:true});
    input.value=String(idx);input.dispatchEvent(new Event('input',{bubbles:true}));check();
    setTimeout(()=>{if(!done){done=true;observer.disconnect();resolve(null);}},5000);
  }),idx);
}
async function measure(browser,base,label,round,fixture){
  const run=await H.open(browser,base,{viewport:'desktop1440'}),p=run.page;
  try{
    await H.go(run);await p.waitForTimeout(350);const startup=await H.snapshot(run);
    const start=await p.evaluate(()=>performance.now());await H.loaded(run,fixture,{timeout:180000});
    await p.locator('[data-view-button="charts"]').click();await p.locator('[data-chart="attitude"]').waitFor({state:'visible'});
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const ready=await p.evaluate(()=>performance.now());
    assert.equal(await p.locator('[data-timeline]').getAttribute('max'),String(fixture.count-1),'Full record count retained');
    const ingestSnapshot=await H.snapshot(run);
    const latencies=[];
    for(const ratio of [.1,.9,.25,.75,.5,.01,.99,.2,.8,.4,.6,.3,.7,.15,.85,.05,.95,.33,.67,.42])latencies.push(await scrub(p,Math.round((fixture.count-1)*ratio)));
    assert.ok(latencies.every(x=>x!==null),'Every scrub reaches the requested record');
    await H.seekIndex(p,0);await p.locator('[data-playback-rate]').selectOption('1');
    const replayStart=await p.evaluate(()=>{document.querySelector('[data-play]').click();return performance.now();});await p.waitForTimeout(1800);
    const replayEnd=await p.evaluate(()=>{document.querySelector('[data-play]').click();return performance.now();});
    const replayTime=await H.readTime(p),endSnapshot=await H.snapshot(run);
    await p.waitForTimeout(250);const idleBefore=await H.snapshot(run);await p.waitForTimeout(600);const idleAfter=await H.snapshot(run);
    if(round===0)await H.screenshot(run,out,label+'-large-charts',{fullPage:true});
    const nav=startup.navigation[0]||{};
    return {label,round,fixtureSha256:fixture.sha256,sourceRecords:fixture.count,startup:{domContentLoadedMs:nav.domContentLoaded,loadMs:nav.load,bodyBytes:(nav.encodedBodySize||0)+startup.resources.reduce((s,r)=>s+r.encodedBodySize,0),transferBytes:(nav.transferSize||0)+startup.resources.reduce((s,r)=>s+r.transferSize,0),resources:startup.resources,...windowMetrics(startup)},fileToChartsMs:ready-start,ingestion:windowMetrics(ingestSnapshot,start,ready),scrub:{samplesMs:latencies,p50Ms:median(latencies),p95Ms:percentile(latencies,.95)},replay:{wallSeconds:(replayEnd-replayStart)/1000,observedLogSeconds:replayTime,ratio:replayTime/((replayEnd-replayStart)/1000),...windowMetrics(endSnapshot,replayStart,replayEnd)},paused:{rafCallbacks:idleAfter.raf-idleBefore.raf,chartRedraws:idleAfter.chartClears-idleBefore.chartClears,webglDraws:idleAfter.drawCalls-idleBefore.drawCalls},errors:run.errors,externalRequests:run.network.filter(x=>!x.local),webgl:endSnapshot.webgl};
  }finally{await run.context.close();}
}
async function cancelActiveParse(browser,base){
  const run=await H.open(browser,base);try{
    await H.go(run);const first=binary({name:'retained-after-cancel.bin'});await H.loaded(run,first);
    await run.page.evaluate(()=>{
      window.__cancelEvidence={};const title=document.querySelector('[data-loading-title]');
      const observer=new MutationObserver(()=>{if(!document.querySelector('[data-loading]').hidden&&/Decoding telemetry/.test(title.textContent)){
        window.__cancelEvidence={phase:title.textContent,start:performance.now()};document.querySelector('[data-cancel-load]').click();window.__cancelEvidence.returned=performance.now();observer.disconnect();
      }});observer.observe(title,{childList:true,subtree:true,characterData:true});
    });
    // 400,001 v3 records = 112,800,330 bytes, below the production 150 MiB cap.
    const large=binary({count:400001,name:'cancel-active-parser.bin'});
    await H.setFile(run,large);
    await run.page.waitForFunction(()=>window.__cancelEvidence.returned>0,{},{timeout:60000});
    await run.page.waitForFunction(()=>document.querySelector('[data-loading]').hidden);
    const evidence=await run.page.evaluate(()=>window.__cancelEvidence);evidence.cancelHandlerMs=evidence.returned-evidence.start;evidence.fixture=manifest(large);
    await run.page.waitForTimeout(600);assert.equal(await run.page.locator('[data-file-name]').textContent(),first.name);assert.ok(evidence.cancelHandlerMs<250,'Active parser cancellation stays responsive');
    await H.screenshot(run,out,'active-parser-canceled');return evidence;
  }finally{await run.context.close();}
}
function summarize(samples,label){const values=samples.filter(x=>x.label===label);return {runs:values.length,startupBodyBytes:median(values.map(x=>x.startup.bodyBytes)),startupLoadMs:median(values.map(x=>x.startup.loadMs)),startupTbtMs:median(values.map(x=>x.startup.totalBlockingTimeMs)),fileToChartsMs:median(values.map(x=>x.fileToChartsMs)),ingestionTbtMs:median(values.map(x=>x.ingestion.totalBlockingTimeMs)),ingestionMaxTaskMs:median(values.map(x=>x.ingestion.maxLongTaskMs)),ingestionMaxHeartbeatGapMs:median(values.map(x=>x.ingestion.maxHeartbeatGapMs)),scrubP95Ms:median(values.map(x=>x.scrub.p95Ms)),replayRate:median(values.map(x=>x.replay.ratio)),pausedRaf:median(values.map(x=>x.paused.rafCallbacks))};}
async function main(){
  assert.ok(baselineRoot,'Set FLIGHT_BASELINE_ROOT to the pinned baseline worktree');assert.equal(H.revision(baselineRoot),BASELINE);assert.ok(rounds>=2,'At least two counterbalanced pairs');assert.ok(count>=100001,'Large fixture must exceed 100k records');
  fs.mkdirSync(out,{recursive:true});const fixture=binary({count,name:`synthetic-${count}-v3.bin`}),hosts={baseline:await H.server(baselineRoot),candidate:await H.server()},browser=await H.launch();
  const result={...H.metadata(browser),baselineSha:BASELINE,fixture:manifest(fixture),methodology:{rounds,order:'Even rounds baseline/candidate; odd rounds candidate/baseline',viewport:H.VIEWPORTS.desktop1440,cold:'Fresh browser context per sample, no-store identical static servers, same browser process and software renderer',network:'Map provider responses mocked identically; no internet dependency',fixtureInput:'Fixtures are written once to each browser context temporary directory and supplied by filesystem path to native setInputFiles; avoids Playwright Buffer/base64 page decoding. Both revisions use the same method.',measurement:'Startup encodedBodySize is actual uncompressed local HTTP body bytes. Transfer includes browser-reported HTTP overhead. File-to-charts includes read/parse/model transfer/first charts and baseline eager-view work; it is not an isolated parser benchmark. 20 ms heartbeat gap reports main-thread responsiveness.',hardware:'GitHub-hosted runner + ANGLE SwiftShader. No physical phone, Safari, or hardware GPU claim.'},samples:[],checks:[]};
  const write=()=>fs.writeFileSync(path.join(out,'profile.json'),JSON.stringify(result,null,2));
  try{
    for(let round=0;round<rounds;round++)for(const label of (round%2?['candidate','baseline']:['baseline','candidate'])){console.log('MEASURE',round,label);result.samples.push(await measure(browser,hosts[label].base,label,round,fixture));write();}
    result.summary={baseline:summarize(result.samples,'baseline'),candidate:summarize(result.samples,'candidate')};result.activeParserCancellation=await cancelActiveParse(browser,hosts.candidate.base);
    const a=result.summary.baseline,b=result.summary.candidate;
    for(const [name,pass,details]of [
      ['Startup body bytes reduced at least 50%',b.startupBodyBytes<a.startupBodyBytes*.5,{baseline:a.startupBodyBytes,candidate:b.startupBodyBytes}],
      ['Candidate 1x replay tracks wall clock within 15%',b.replayRate>=.85&&b.replayRate<=1.15,{baseline:a.replayRate,candidate:b.replayRate}],
      ['Candidate paused charts have no animation loop',b.pausedRaf===0,{baseline:a.pausedRaf,candidate:b.pausedRaf}],
      ['Candidate scrub p95 below 200 ms',b.scrubP95Ms<200,{baseline:a.scrubP95Ms,candidate:b.scrubP95Ms}],
      ['Candidate ingestion median max heartbeat gap below 750 ms',b.ingestionMaxHeartbeatGapMs<750,{baseline:a.ingestionMaxHeartbeatGapMs,candidate:b.ingestionMaxHeartbeatGapMs}]
    ])result.checks.push({name,pass,details});
    write();assert.ok(result.checks.every(x=>x.pass),'Performance acceptance failed; inspect profile.json');console.log(JSON.stringify(result.summary,null,2));
  }finally{write();await browser.close();await hosts.baseline.close();await hosts.candidate.close();}
}
main().catch(e=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'profile-error.txt'),e.stack);console.error(e);process.exitCode=1;});
