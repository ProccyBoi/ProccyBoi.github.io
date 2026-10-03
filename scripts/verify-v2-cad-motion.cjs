/* CAD motion acceptance for the fullscreen hero. The old homepage inspector
 * was replaced; this checks real rendered object poses, not obsolete controls.
 * Requires Playwright. Optional: V2_BASE_URL and CHROMIUM_EXECUTABLE. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const shots=process.env.V2_SCREENSHOTS;
if(shots)fs.mkdirSync(shots,{recursive:true});
async function scrollPhase(page,progress){
  const actual=await page.evaluate(value=>{
    const root=document.querySelector('[data-assembly]');
    scrollTo({top:scrollY+root.getBoundingClientRect().top+value*(root.offsetHeight-root.querySelector('.v2-assembly-sticky').clientHeight),behavior:'instant'});
    return Math.max(0,Math.min(1,-root.getBoundingClientRect().top/(root.offsetHeight-root.querySelector('.v2-assembly-sticky').clientHeight)));
  },progress);
  await page.waitForFunction(value=>Math.abs(Number(document.querySelector('[data-assembly]').dataset.assemblyProgress)-value)<.000006,actual,{timeout:60000}).catch(async error=>{
    console.error('CAD scroll diagnostic', {requested:progress,actual,state:await page.locator('[data-assembly]').evaluate(node=>({data:{...node.dataset},top:node.getBoundingClientRect().top,height:node.offsetHeight,scrollY,hidden:document.hidden}))});
    throw error;
  });
  await page.evaluate(()=>{window.__stableFrames=null;});
  await page.waitForFunction(()=>{
    const frames=document.querySelector('[data-assembly]').dataset.assemblyFrames;
    if(!window.__stableFrames||window.__stableFrames.frames!==frames)window.__stableFrames={frames,time:performance.now()};
    return performance.now()-window.__stableFrames.time>500;
  },null,{polling:100,timeout:30000});
}
async function snapshot(page){
  return page.evaluate(()=>Object.fromEntries(Object.entries(window.__observedAssemblies).map(([name,model])=>[name,{
    pose:model.group.matrixWorld.elements.slice(),
    local:{position:model.group.position.toArray(),rotation:model.group.rotation.toArray(),scale:model.group.scale.toArray(),visible:model.group.visible},
    parts:model.parts.map(part=>({name:part.object.name,position:part.object.position.toArray(),quaternion:part.object.quaternion.toArray(),displacement:part.object.position.distanceTo(part.base),tilt:part.object.quaternion.angleTo(part.motion.baseQuaternion)}))
  }])));
}
async function fitsStage(page,name){
  const bounds=await page.evaluate(name=>{
    const model=window.__observedAssemblies[name],T=window.THREE;
    const box=new T.Box3().setFromObject(model.group),points=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new T.Vector3(x,y,z).project(window.__heroCamera));
    return {left:(Math.min(...points.map(p=>p.x))+1)*innerWidth/2,right:(Math.max(...points.map(p=>p.x))+1)*innerWidth/2,top:(1-Math.max(...points.map(p=>p.y)))*innerHeight/2,bottom:(1-Math.min(...points.map(p=>p.y)))*innerHeight/2,width:innerWidth,height:innerHeight,header:document.querySelector('.v2-header').getBoundingClientRect().bottom};
  },name);
  assert.ok(bounds.left>=0&&bounds.right<=bounds.width&&bounds.top>=bounds.header&&bounds.bottom<=bounds.height,name+' exploded geometry must stay on screen below navigation: '+JSON.stringify(bounds));
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='warning'&&message.text().includes('CAD unavailable'))console.error(message.text());});
    // Observe the public factory results without replacing geometry, transforms,
    // rendering, scroll handlers or requestAnimationFrame in production code.
    await page.addInitScript(()=>{
      window.__observedAssemblies={};
      let observed, cameraObserved=false;
      Object.defineProperty(window,'V2AssemblyModels',{configurable:true,get:()=>observed,set:factory=>{
        observed={load:async(...args)=>{
          if(!cameraObserved){
            cameraObserved=true;
            const update=window.THREE.OrthographicCamera.prototype.updateMatrixWorld;
            window.THREE.OrthographicCamera.prototype.updateMatrixWorld=function(){
              if(this.top===5&&this.bottom===-5)window.__heroCamera=this;
              return update.apply(this,arguments);
            };
          }
          const assembly=await factory.load(...args);
          window.__observedAssemblies[args[0]]=assembly;
          return assembly;
        }};
      }});
    });
    await page.goto(base+'/v2/',{waitUntil:'domcontentloaded'});
    await page.locator('[data-assembly-models-settled="3"]').waitFor({timeout:90000}).catch(async error=>{
      console.error('Model loading diagnostic',await page.locator('[data-assembly]').evaluate(node=>({data:{...node.dataset},models:[...node.querySelectorAll('[data-assembly-model-state]')].map(item=>({...item.dataset}))})));
      throw error;
    });
    assert.equal(await page.locator('[data-assembly]').getAttribute('data-assembly-models-ready'),'3','All hero models must render');
    await page.waitForTimeout(1800);
    // Establish the baseline after a complete scroll roundtrip so the finite
    // entrance animation cannot be mistaken for part of the scroll state.
    await scrollPhase(page,.135);
    await scrollPhase(page,0);
    const initial=await snapshot(page);
    assert.deepEqual(Object.keys(initial).sort(),['pi','telemetry','tramtrace']);
    const telemetryCoverage=await page.evaluate(()=>{
      const model=window.__observedAssemblies.telemetry;
      return {
        expected:model.metadata.footprints.filter(part=>part.modelExported).map(part=>part.ref).sort(),
        actual:model.parts.flatMap(part=>part.object.userData.componentRefs||[part.object.name]).sort()
      };
    });
    assert.deepEqual(telemetryCoverage.actual,telemetryCoverage.expected,'Hero batching must retain every exported telemetry component');
    for(const [name,model] of Object.entries(initial)){
      assert.ok(model.parts.length>1,name+' must contain movable physical components');
      assert.ok(model.parts.every(part=>part.displacement<1e-10),name+' starts assembled');
    }
    await page.evaluate(()=>{
      window.__poseSamples=[];
      window.__samplePoses=true;
      const sample=()=>{
        if(!window.__samplePoses)return;
        const model=window.__observedAssemblies.tramtrace;
        window.__poseSamples.push({
          progress:Number(document.querySelector('[data-assembly]').dataset.assemblyProgress),
          displacement:Math.max(...model.parts.map(part=>part.object.position.distanceTo(part.base)))
        });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await scrollPhase(page,.265);
    const samples=await page.evaluate(()=>{window.__samplePoses=false;return window.__poseSamples;});
    const partial=samples.filter(sample=>sample.progress>.01&&sample.progress<.25&&sample.displacement>0&&sample.displacement<.3);
    assert.ok(partial.length>=2,'Scroll must render several intermediate physical poses: '+JSON.stringify(samples));
    assert.ok(new Set(partial.map(sample=>sample.displacement.toFixed(5))).size>=2,'Intermediate poses must change, not repeat a single snapped state');
    for(const [name,progress] of [['tramtrace',.265],['telemetry',.565],['pi',.88]]){
      await scrollPhase(page,progress);
      const model=(await snapshot(page))[name];
      assert.ok(model.parts.every(part=>part.position.every(Number.isFinite)),name+' component transforms must remain finite');
      assert.ok(model.parts.every(part=>part.displacement>.001),name+' physical groups must separate in the exploded chapter');
      assert.ok(Math.max(...model.parts.map(part=>part.displacement))>.05,name+' must visibly disassemble');
      assert.ok(new Set(model.parts.map(part=>part.displacement.toFixed(4))).size>4,name+' parts must have varied separation distances');
      assert.ok(model.parts.some(part=>part.tilt>.015),name+' parts must tilt as they separate');
      assert.ok(model.pose.every(Number.isFinite),name+' scene transform must remain finite');
      await fitsStage(page,name);
      console.log('PASS '+name+': '+model.parts.length+' physical groups visibly separate with finite transforms');
      if(shots)await page.screenshot({path:path.join(shots,'final-'+name+'.png')});
    }
    await scrollPhase(page,0);
    const returned=await snapshot(page);
    for(const name of Object.keys(initial)){
      assert.ok(returned[name].parts.every(part=>part.displacement<1e-10),name+' must exactly reassemble when scrolling back');
      const error=Math.max(...returned[name].pose.map((value,index)=>Math.abs(value-initial[name].pose[index])));
      assert.ok(error<1e-3,name+' must return to the original scene pose; maximum error '+error+'; initial '+JSON.stringify(initial[name].local)+'; returned '+JSON.stringify(returned[name].local));
      assert.deepEqual(returned[name].parts.map(part=>part.position),initial[name].parts.map(part=>part.position));
      assert.deepEqual(returned[name].parts.map(part=>part.quaternion),initial[name].parts.map(part=>part.quaternion));
    }
    assert.deepEqual(errors,[],'Browser JavaScript errors');
    console.log('PASS continuous rendered component motion and exact reversal to all three original assemblies');
    for(const viewport of [{width:390,height:844},{width:320,height:740}]){
      await page.setViewportSize(viewport);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await scrollPhase(page,0);
      if(shots)await page.screenshot({path:path.join(shots,'final-intro-'+viewport.width+'.png')});
      for(const [name,progress] of [['tramtrace',.265],['telemetry',.565],['pi',.88]]){
        await scrollPhase(page,progress);await fitsStage(page,name);
        if(shots)await page.screenshot({path:path.join(shots,'final-'+name+'-'+viewport.width+'.png')});
      }
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
