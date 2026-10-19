#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {binary,csv,reference,payload,manifest}=require('./fixtures.cjs');
const H=require('./harness.cjs');
const out=path.resolve(process.env.FLIGHT_REVIEW_OUT||'/tmp/flight-review-evidence/browser');
const args=process.argv.slice(2),option=name=>args.find(a=>a.startsWith('--'+name+'='))?.split('=')[1];
const engine=option('engine')||'chromium',viewport=option('viewport')||'desktop1440';
const report={tests:[],fixtures:[],notes:['Provider style/DEM requests are deterministic fixtures; local Three and MapLibre libraries and WebGL renderers are real. No real provider or physical device reliability is implied.']};
function recordFixture(f){report.fixtures.push(manifest(f));return f;}
async function scenario(browser,base,name,fn,options={}) {
  const run=await H.open(browser,base,{viewport,...options});const begin=Date.now();
  try{await H.go(run);await fn(run);assert.deepEqual(run.errors,[],'No uncaught page exceptions');report.tests.push({name,status:'passed',milliseconds:Date.now()-begin});console.log('PASS '+name);}
  catch(error){report.tests.push({name,status:'failed',milliseconds:Date.now()-begin,error:error.stack});console.error('FAIL '+name+': '+error.message);await H.screenshot(run,out,name+'-failure',{fullPage:true}).catch(()=>{});}
  finally{await run.context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
}
async function assertDefault(run,{csvImport=false}={}) {
  assert.equal(await run.page.locator('[data-view-button="charts"]').getAttribute('aria-selected'),'true');
  H.noExternal(run);
  const urls=run.network.map(x=>x.url).join('\n');assert.doesNotMatch(urls,/vendor\/(three|maplibre)/,'3D dependencies stay lazy');
  if(!csvImport)assert.doesNotMatch(urls,/xlsx/,'Binary import does not load spreadsheet engine');
}
async function assertExport(run,f) {
  const exported=await H.download(run.page),parsed=H.parseCsv(exported.text);
  assert.equal(parsed.rows.length,f.count,'Export keeps every usable sample');
  for(let i=0;i<f.rows.length;i++)for(const key of ['time_s','timestamp_ms','roll_deg','pitch_deg','yaw_deg','airspeed_mps','esc_current_a','esc_voltage_v','esc_rpm','log_overrun_count','sd_write_error_count']) {
    if(!(key in f.rows[i]))continue;
    const expected=f.rows[i][key],actual=parsed.rows[i][key];
    if(expected==='')assert.equal(actual,'','Missing '+key+' is blank, never fabricated zero');
    else assert.equal(Number(actual),expected,`Full numerical precision, sample ${i} ${key}`);
  }
  return parsed;
}
async function responsive(browser,base) {
  await scenario(browser,base,'layout-'+viewport,async run=>{
    const p=run.page;
    H.noExternal(run);assert.doesNotMatch(run.network.map(x=>x.url).join('\n'),/vendor\/(three|maplibre|xlsx)/);
    await H.target(p,'[data-choose-file]');await H.target(p,'[data-open-schema]');
    await p.locator('[data-open-schema]').first().click();await p.locator('[data-schema-dialog][open]').waitFor();
    await H.screenshot(run,out,viewport+'-schema');
    const template=await H.download(p,'[data-download-template]');assert.match(template.name,/template\.csv$/);assert.equal(H.parseCsv(template.text).rows.length,2);
    await p.keyboard.press('Escape');assert.equal(await p.locator('[data-schema-dialog]').evaluate(n=>n.open),false);
    await H.screenshot(run,out,viewport+'-onboarding');
    const f=recordFixture(binary());await H.loaded(run,f);await assertDefault(run);
    if(run.size.width<=380){
      const tabs=await p.locator('.flight-view-tabs').evaluate(node=>{const b=node.getBoundingClientRect();return {scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,left:b.left,right:b.right,viewport:innerWidth,buttons:[...node.querySelectorAll('[data-view-button]')].map(button=>{const r=button.getBoundingClientRect();return {name:button.dataset.viewButton,left:r.left,right:r.right,width:r.width,height:r.height};})};});
      assert.ok(tabs.scrollWidth<=tabs.clientWidth+1,'Narrow-phone tabs require no horizontal scrolling');assert.equal(tabs.buttons.length,4);
      assert.ok(tabs.buttons.every(b=>b.left>=tabs.left-1&&b.right<=tabs.right+1&&b.left>=-1&&b.right<=tabs.viewport+1&&b.width>=24&&b.height>=24),'All four narrow-phone tabs remain fully visible and operable: '+JSON.stringify(tabs));
    }
    for(const selector of ['[data-play]','[data-step-back]','[data-step-forward]','[data-playback-rate]','[data-timeline]'])await H.target(p,selector);
    await H.screenshot(run,out,viewport+'-charts',{fullPage:true});
    await p.locator('[data-view-button="samples"]').click();await H.seekIndex(p,123);
    assert.match(await p.locator('[data-sample-heading]').textContent(),/124.*401/);
    await p.locator('[data-copy-sample]').click();
    const copied=await p.evaluate(()=>JSON.parse(window.__flightProbe.clipboard));
    assert.equal(copied.sample,124);assert.equal(copied.roll_deg,f.rows[123].roll_deg);
    await H.screenshot(run,out,viewport+'-samples',{fullPage:true});
    await assertExport(run,f);
    await p.locator('[data-view-button="charts"]').click();await p.locator('[data-view-button="charts"]').focus();
    await p.keyboard.press('ArrowRight');
    const focused=await p.evaluate(()=>document.activeElement?.dataset.viewButton);
    assert.ok(focused&&focused!=='charts','Tab arrow keyboard navigation moves focus');
    // Keyboard selection can intentionally activate terrain. Privacy was checked
    // before this operation; use a fresh context for later privacy assertions.
    await p.setViewportSize({width:run.size.height,height:run.size.width});
    await p.waitForTimeout(200);await H.screenshot(run,out,viewport+'-rotated');
  });
}
async function regression(browser,base) {
  await scenario(browser,base,'legacy-flight-review-route-preservation',async run=>{
    for(const route of ['/projects/skylabs/flight-review/','/v2/projects/skylabs/flight-review/','/v3/projects/skylabs/flight-review/']){
      await run.page.goto(run.base+route+'?source=legacy-review&sample=42#telemetry',{waitUntil:'load'});
      await run.page.waitForURL(run.base+'/shared/flight-review/?source=legacy-review&sample=42#telemetry');
      await run.page.locator('[data-choose-file]').first().waitFor();
      const url=new URL(run.page.url());assert.equal(url.search,'?source=legacy-review&sample=42');assert.equal(url.hash,'#telemetry');
    }
    H.noExternal(run);await H.screenshot(run,out,'legacy-route-canonical');
  });
  for(const version of [1,2,3])await scenario(browser,base,'binary-v'+version,async run=>{
    const f=recordFixture(binary({version}));await H.loaded(run,f);await assertDefault(run);await assertExport(run,f);
    assert.match(await run.page.locator('[data-format-badge]').textContent(),new RegExp('v'+version));
    assert.match(await run.page.locator('[data-summary-records]').textContent(),/401 records/);
  });
  await scenario(browser,base,'csv-sparse-precision-and-unknown-diagnostics',async run=>{
    const f=recordFixture(csv({sparse:true,name:'sparse-precision.csv'}));await H.loaded(run,f);await assertDefault(run,{csvImport:true});await assertExport(run,f);
    const health=await run.page.locator('[data-health-list]').textContent();assert.match(health,/SD.*unavailable|SD.*not.*recorded|SD.*not.*include/i);assert.doesNotMatch(health,/No SD write errors recorded/);
    await run.page.locator('[data-view-button="samples"]').click();await H.seekIndex(run.page,1);
    const text=await run.page.locator('[data-sample-grid]').textContent();assert.match(text,/Roll—/);assert.match(text,/Pitch—/);
    await H.screenshot(run,out,'sparse-missing-fields');
  });
  await scenario(browser,base,'csv-no-usable-gps',async run=>{
    const f=recordFixture(csv({missingGps:true,name:'no-gps.csv'}));await H.loaded(run,f);await run.page.locator('[data-view-button="terrain"]').click();
    await assertDefault(run,{csvImport:true});assert.match(await run.page.locator('[data-health-list]').textContent(),/No usable GNSS/);await assertExport(run,f);
    const p=run.page;assert.equal(await p.locator('[data-view-button="terrain"]').getAttribute('aria-disabled'),'true');
    await p.locator('[data-view-button="charts"]').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.evaluate(()=>document.activeElement.dataset.viewButton),'local','No-GPS keyboard navigation skips unavailable terrain');
    await p.keyboard.press('ArrowRight');assert.equal(await p.evaluate(()=>document.activeElement.dataset.viewButton),'samples','No-GPS keyboard can reach samples');H.noExternal(run);
  });
  await scenario(browser,base,'irregular-timestamp-chart-scrub',async run=>{
    const f=recordFixture(csv({irregular:true,name:'irregular.csv'}));await H.loaded(run,f);
    const canvas=run.page.locator('[data-chart="attitude"]');await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();
    // At 40% of a 20-second plot, 8 s lies after sample 0.1 and before 10.
    // Index-spaced plotting would incorrectly select the 10-second sample.
    await canvas.click({position:{x:42+(b.width-54)*.40,y:50}});await run.page.waitForTimeout(80);
    assert.equal(await H.index(run.page),2,'Scrub maps elapsed time rather than sample index');assert.equal(await H.readTime(run.page),.1);
    const cursor=await run.page.locator('[data-chart-card="attitude"] .flight-chart-cursor').boundingBox();
    if(cursor){const expected=b.x+42+(b.width-54)*(.1/20);assert.ok(Math.abs(cursor.x-expected)<4,'Time-positioned cursor');}
    await H.screenshot(run,out,'irregular-time-axis');
  });
  await scenario(browser,base,'real-time-playback-and-idle-charts',async run=>{
    const f=recordFixture(binary({count:2001}));await H.loaded(run,f);const p=run.page;
    const rates=[];
    for(const rate of [1,.25,4]){
      await H.seekIndex(p,0);await p.locator('[data-playback-rate]').selectOption(String(rate));
      const started=await p.evaluate(()=>{document.querySelector('[data-play]').click();return performance.now();});await p.waitForTimeout(1300);
      const ended=await p.evaluate(()=>{document.querySelector('[data-play]').click();return performance.now();});const observed=await H.readTime(p),expected=(ended-started)/1000*rate;
      assert.ok(observed>=expected-.18&&observed<=expected+.10,`Playback ${rate}x must track elapsed wall time: observed ${observed}, expected ${expected}`);rates.push({rate,observed,expected});
    }
    await p.waitForTimeout(250);const before=await H.snapshot(run);await p.waitForTimeout(700);const after=await H.snapshot(run);
    assert.equal(after.chartClears,before.chartClears,'Paused charts do not redraw');assert.equal(after.raf,before.raf,'Paused application has no perpetual animation loop');
    report.playbackRates=rates;
    // Exercise the visibility event contract deterministically; this does not
    // claim physical mobile backgrounding or OS suspend/resume coverage.
    await p.locator('[data-play]').click();await p.waitForTimeout(150);
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    const paused=await H.readTime(p);await p.waitForTimeout(400);assert.equal(await H.readTime(p),paused,'Hidden document pauses replay');
    await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    assert.match(await p.locator('[data-play]').getAttribute('aria-label'),/^Play/);
  });
  await scenario(browser,base,'bad-replacement-cancel-and-newest-load-wins',async run=>{
    const a=recordFixture(binary({name:'first-good.bin'})),b=recordFixture(binary({count:77,name:'newest-good.bin'}));await H.loaded(run,a);await H.seekIndex(run.page,22);
    await run.page.locator('[data-flight-file]').setInputFiles({name:'broken.bin',mimeType:'application/octet-stream',buffer:Buffer.from('bad header')});
    await run.page.locator('[data-toast]').waitFor({state:'visible'});await run.page.waitForFunction(()=>document.querySelector('[data-loading]').hidden);
    assert.equal(await run.page.locator('[data-file-name]').textContent(),a.name);assert.equal(await H.index(run.page),22);assert.equal(await run.page.locator('[data-workspace]').isVisible(),true);
    run.faults.delayWorkerMs=1200;
    await H.setFile(run,binary({count:120001,name:'cancel-large.bin'}));
    await run.page.locator('[data-cancel-load]').click();await run.page.waitForFunction(()=>document.querySelector('[data-loading]').hidden);
    assert.equal(await run.page.locator('[data-file-name]').textContent(),a.name);
    await H.setFile(run,binary({count:100001,name:'stale-large.bin'}));
    await H.setFile(run,b);
    await run.page.waitForFunction(name=>!document.querySelector('[data-workspace]').hidden&&document.querySelector('[data-file-name]').textContent===name,b.name,{timeout:60000});
    await run.page.waitForTimeout(1700);assert.equal(await run.page.locator('[data-file-name]').textContent(),b.name);assert.match(await run.page.locator('[data-summary-records]').textContent(),/77 records/);
    run.faults.delayWorkerMs=0;await H.loaded(run,b);await assertExport(run,b);await assertDefault(run);
  });
  for(const replacement of [false,true])await scenario(browser,base,'interrupted-page-lifecycle-'+(replacement?'replacement':'first-log'),async run=>{
    const previous=binary({name:'pre-navigation.bin'});if(replacement)await H.loaded(run,previous);
    run.faults.delayWorkerMs=1000;await run.page.locator('[data-flight-file]').setInputFiles(payload(binary({name:'interrupted.bin'})));
    await run.page.locator('[data-loading]').waitFor({state:'visible'});
    // Explicitly a synthetic persisted-page lifecycle contract, not proof of
    // a particular browser deciding to put this document into BFCache.
    await run.page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await run.page.waitForFunction(()=>document.querySelector('[data-loading]').hidden);await run.page.waitForTimeout(1200);
    if(replacement){assert.equal(await run.page.locator('[data-file-name]').textContent(),previous.name);assert.equal(await run.page.locator('[data-workspace]').isVisible(),true);}
    else assert.equal(await run.page.locator('[data-onboarding]').isVisible(),true);
    run.faults.delayWorkerMs=0;await H.loaded(run,previous);
    await run.page.goto(run.base+'/404.html');await run.page.goBack({waitUntil:'load'});
    assert.equal(await run.page.locator('[data-loading]').isVisible(),false,'Native navigation Back is usable');
    await H.screenshot(run,out,'lifecycle-'+(replacement?'replacement':'first'));
  });
  await scenario(browser,base,'worker-start-failure-and-retry',async run=>{
    const f=binary();await run.page.locator('[data-flight-file]').setInputFiles(payload(f));await run.page.locator('[data-toast]').waitFor({state:'visible'});
    assert.match(await run.page.locator('[data-toast]').textContent(),/parser|worker|memory|start/i);assert.equal(await run.page.locator('[data-loading]').isVisible(),false);
    run.faults.worker=false;await H.loaded(run,f);await assertExport(run,f);
  },{failWorker:true});
  await scenario(browser,base,'spreadsheet-library-failure-and-retry',async run=>{
    const good=binary();await H.loaded(run,good);const f=csv();await run.page.locator('[data-flight-file]').setInputFiles(payload(f));await run.page.locator('[data-toast]').waitFor({state:'visible'});
    assert.match(await run.page.locator('[data-toast]').textContent(),/spreadsheet parser.*load/i);assert.equal(await run.page.locator('[data-file-name]').textContent(),good.name);
    run.faults.dependencies.clear();await H.loaded(run,f);await assertExport(run,f);
  },{blockDependencies:['xlsx.full.min.js']});
  await scenario(browser,base,'local-webgl-lazy-retry-and-idle',async run=>{
    const f=binary();await H.loaded(run,f);await assertDefault(run);const p=run.page;
    await p.locator('[data-view-button="local"]').click();await p.getByRole('button',{name:'Retry local 3D'}).waitFor();
    run.faults.dependencies.clear();await p.getByRole('button',{name:'Retry local 3D'}).click();await p.locator('#flight-local-3d canvas').waitFor();
    await p.waitForFunction(()=>window.__flightProbe.drawCalls>0);await p.waitForTimeout(350);
    const graphics=await H.snapshot(run);assert.ok(graphics.webgl.some(x=>x.host==='flight-local-3d'&&!x.lost),'Real local WebGL context');
    const localLayout=await p.locator('#flight-local-3d').evaluate(host=>{const b=host.getBoundingClientRect(),transport=document.querySelector('.flight-transport').getBoundingClientRect();return {height:b.height,centerY:b.y+b.height/2,transportTop:transport.top,viewportHeight:innerHeight};});
    if(run.size.width===1440&&run.size.height===900){assert.ok(localLayout.height>=300&&localLayout.height<=700,'Desktop local scene is bounded, not stretched to the diagnostics column: '+JSON.stringify(localLayout));assert.ok(localLayout.centerY<localLayout.transportTop-24,'Local aircraft region remains above fixed replay controls');}
    report.localLayout=localLayout;
    await H.screenshot(run,out,'local-3d-real-webgl');
    const before=await H.snapshot(run);await p.waitForTimeout(650);const after=await H.snapshot(run);assert.equal(after.drawCalls,before.drawCalls,'Paused local 3D does not render continuously');
    await p.locator('[data-view-button="charts"]').click();await p.waitForTimeout(250);const hidden=await H.snapshot(run);await p.waitForTimeout(650);assert.equal((await H.snapshot(run)).drawCalls,hidden.drawCalls,'Inactive local 3D does not render');
    H.noExternal(run);
  },{blockDependencies:['three.min.js']});
  await scenario(browser,base,'terrain-lazy-script-retry-and-real-renderer',async run=>{
    await H.loaded(run,binary());await assertDefault(run);const p=run.page;
    await p.locator('[data-view-button="terrain"]').click();await p.locator('[data-map-retry]').waitFor({state:'visible'});
    run.faults.dependencies.clear();await p.locator('[data-map-retry]').click();await p.locator('#flight-terrain-map canvas').waitFor();
    await p.waitForFunction(()=>window.__flightProbe.contexts.some(x=>x.canvas.parentElement?.closest('#flight-terrain-map')));await p.waitForTimeout(1200);
    assert.ok(run.network.some(x=>!x.local&&x.url.includes('tiles.openfreemap.org')),'Provider requests occur only after explicit terrain selection');
    const data=await H.screenshot(run,out,'terrain-real-maplibre-mocked-provider');assert.ok(data.webgl.some(x=>!x.lost),'Real MapLibre WebGL context');
    assert.equal(await p.locator('[data-map-setup]').isVisible(),true,'Unavailable DEM cannot falsely announce terrain ready');
    const elevation=await p.evaluate(()=>{const map=window.__flightProbe.maps.at(-1);return map.queryTerrainElevation(map.getCenter());});
    // MapLibre5.24 returns0 for some missing raster tiles; zero is not proof of
    // available DEM. Assert application readiness stays false instead.
    report.missingTerrain={observedLibraryQuery:elevation,providerFixture:'Every DEM tile responds404',setupStillVisible:await p.locator('[data-map-setup]').isVisible()};
    await p.waitForTimeout(1000);assert.equal(await p.locator('[data-map-setup]').isVisible(),true,'Failed DEM never becomes ready merely because library query falls back to0');
    const missingErrors=await p.evaluate(()=>window.__flightProbe.mapErrors);assert.ok(missingErrors.every(error=>/404|Not Found/i.test(error.message||'')),'Missing-DEM case permits only intentionally failed provider tiles, never style/API errors: '+JSON.stringify(missingErrors));
    assert.ok(run.network.some(request=>request.url.includes('/__fixture_empty_dem/')),'Missing-DEM scenario actually requests its failing DEM fixture');
    await p.locator('[data-view-button="charts"]').click();await p.waitForTimeout(500);const before=await H.snapshot(run);await p.waitForTimeout(700);assert.equal((await H.snapshot(run)).drawCalls,before.drawCalls,'Inactive terrain stops rendering');
  },{blockDependencies:['maplibre-gl.js']});
  await scenario(browser,base,'terrain-positive-elevation-route-and-seek',async run=>{
    const f=binary();await H.loaded(run,f);await assertDefault(run);const p=run.page;
    await p.locator('[data-view-button="terrain"]').click();await p.locator('#flight-terrain-map canvas').waitFor();
    await p.waitForFunction(()=>document.querySelector('[data-map-setup]').hidden,null,{timeout:30000});
    const mapLayout=await p.locator('#flight-terrain-map').evaluate(host=>{const rect=host.getBoundingClientRect(),canvas=host.querySelector('canvas').getBoundingClientRect();return {host:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},canvas:{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height},position:getComputedStyle(host).position};});
    assert.ok(mapLayout.host.height>=200&&mapLayout.canvas.height>=200,'Ready map has a real visible layout box, not a zero-height host clipped by late MapLibre CSS: '+JSON.stringify(mapLayout));
    assert.ok(Math.abs(mapLayout.host.height-mapLayout.canvas.height)<2,'Map canvas fills the visible host');
    if(run.size.width===1440&&run.size.height===900)assert.ok(mapLayout.host.height<=700,'Desktop terrain is bounded independently of diagnostics column');
    await H.target(p,'#flight-terrain-map .maplibregl-ctrl-zoom-in');
    const inspect=()=>p.evaluate(()=>{
      const probe=window.__flightProbe,map=probe.maps.at(-1),layer=probe.customLayers.at(-1);
      const positions=[];layer.scene.traverse(object=>{const a=object.geometry?.attributes?.position?.array;if(a)positions.push({type:object.geometry.type,length:a.length,finite:Array.from(a).every(Number.isFinite)});});
      return {elevation:map.queryTerrainElevation(map.getCenter()),aircraft:layer.aircraft.position.toArray(),geometry:positions,marker:probe.geojsonData['skylabs-track-points']};
    });
    const initial=await inspect();assert.ok(Math.abs(initial.elevation-100)<.1,'Actual raster-dem query decodes synthetic 100 m terrain');
    assert.ok(initial.aircraft.every(Number.isFinite)&&initial.aircraft[1]>=100,'Aircraft is finite and terrain-aligned');
    assert.ok(initial.geometry.some(x=>x.type==='TubeGeometry'&&x.length>1000),'Actual 3D flight path geometry built');assert.ok(initial.geometry.every(x=>x.finite),'Every rendered coordinate is finite');
    await H.seekIndex(p,240);await p.waitForTimeout(100);const moved=await inspect();assert.notDeepEqual(moved.aircraft,initial.aircraft,'Aircraft follows seek');
    const markerPoint=moved.marker.features.find(x=>x.properties.kind==='current');assert.equal(markerPoint.geometry.coordinates[0],f.rows[240].gnss_lon);assert.equal(markerPoint.geometry.coordinates[1],f.rows[240].gnss_lat);
    await H.screenshot(run,out,'terrain-synthetic-100m-ready');
    await p.locator('[data-view-button="local"]').click();await p.locator('#flight-local-3d canvas').waitFor();await p.locator('[data-view-button="terrain"]').click();
    assert.equal(await p.locator('[data-map-setup]').isVisible(),false);assert.equal(await H.index(p),240,'Switching 3D views preserves selected sample');
    await p.waitForTimeout(1300);const before=await H.snapshot(run);await p.waitForTimeout(900);const after=await H.snapshot(run);assert.equal(after.drawCalls,before.drawCalls,'Ready paused terrain has no idle repaint loop');
    assert.deepEqual(await p.evaluate(()=>window.__flightProbe.mapErrors),[],'Positive terrain has no MapLibre style, source, glyph or rendering errors');
    report.positiveTerrain={provenance:'Synthetic flat100m Terrain-RGB PNG; no real provider imagery/elevation or OSM vegetation',mapLayout,initial,moved};
  },{flatTerrain:true});
  await scenario(browser,base,'published-f110211-reconstructed-csv',async run=>{
    const f=recordFixture(reference());await H.loaded(run,f);await assertDefault(run,{csvImport:true});await assertExport(run,f);
    assert.match(await run.page.locator('[data-summary-records]').textContent(),/13,772 records|13772 records/);await H.screenshot(run,out,'f110211-reconstructed-arrays',{fullPage:true});
  });
}
async function fallbacks(browser,base) {
  await scenario(browser,base,engine+'-no-webgl-usable-charts-samples-export',async run=>{
    const f=binary();await H.loaded(run,f);await assertDefault(run);await run.page.locator('[data-view-button="local"]').click();
    await run.page.getByRole('button',{name:'Retry local 3D'}).waitFor();assert.match(await run.page.locator('#flight-local-3d').textContent(),/unavailable/);
    await run.page.locator('[data-view-button="samples"]').click();await H.seekIndex(run.page,12);assert.match(await run.page.locator('[data-sample-heading]').textContent(),/13.*401/);await assertExport(run,f);await H.screenshot(run,out,engine+'-no-webgl');
  },{noWebGL:true});
  await scenario(browser,base,engine+'-no-worker-clear-error',async run=>{
    await run.page.locator('[data-flight-file]').setInputFiles(payload(binary()));await run.page.locator('[data-toast]').waitFor({state:'visible'});
    assert.match(await run.page.locator('[data-toast]').textContent(),/cannot run.*parser|current browser/i);assert.equal(await run.page.locator('[data-loading]').isVisible(),false);assert.equal(await run.page.locator('[data-onboarding]').isVisible(),true);await H.screenshot(run,out,engine+'-no-worker');
  },{noWorker:true});
  if(engine==='webkit')await scenario(browser,base,'webkit-csv-playback-export',async run=>{
    const f=csv();await H.loaded(run,f);await assertDefault(run,{csvImport:true});await assertExport(run,f);await H.seekIndex(run.page,0);await run.page.locator('[data-play]').click();await run.page.waitForTimeout(1200);await run.page.locator('[data-play]').click();assert.ok(await H.readTime(run.page)>.8);await H.screenshot(run,out,'webkit-charts');
  });
}
async function main(){
  fs.mkdirSync(out,{recursive:true});const host=await H.server(),browser=await H.launch(engine);
  Object.assign(report,H.metadata(browser,{engine,viewport}));
  try{if(args.includes('--fallbacks'))await fallbacks(browser,host.base);else if(args.includes('--regression'))await regression(browser,host.base);else await responsive(browser,host.base);}
  finally{await browser.close();await host.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
  const failed=report.tests.filter(t=>t.status==='failed');if(failed.length)throw Error(`${failed.length}/${report.tests.length} browser cases failed; see ${out}/results.json`);
}
main().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'runner-error.txt'),error.stack);console.error(error);process.exitCode=1;});
