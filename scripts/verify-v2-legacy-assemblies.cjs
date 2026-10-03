/* Acceptance for the three retained assembly engines. Requires a static server. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const viewers=[
  {slug:'framework-expansion-card',root:'[data-framework-inspector]',stage:'[data-framework-stage]',button:'[data-framework-explode]',panel:'[data-framework-part]',ref:'U4',ready:'[data-framework-status].is-ready'},
  {slug:'framework-dual-usb',root:'[data-dual-usb-inspector]',stage:'[data-dual-usb-stage]',button:'[data-dual-usb-explode]',panel:'[data-dual-usb-part]',ref:'U3',ready:'[data-dual-usb-status].is-ready'},
  {slug:'tramtrace',root:'[data-pcb-object]',stage:'.pcb-object-stage',button:'[data-pcb-explode]',panel:'[data-pcb-part]',ref:'U3',ready:'[data-pcb-object][data-source-model="kicad-glb"]'}
];
async function idle(page,selector){
  await page.locator(selector).locator('canvas').scrollIntoViewIfNeeded();
  await page.waitForFunction(selector=>document.querySelector(selector)?.dataset.explorerMotion==='idle',selector,{timeout:45000});
  const before=await page.locator(selector).getAttribute('data-explorer-frames');
  await page.waitForTimeout(300);
  assert.equal(await page.locator(selector).getAttribute('data-explorer-frames'),before,'Idle renderer must stop');
}
async function snapshot(page){return page.evaluate(()=>{
  const parts=[],instances=[];
  window.__legacy.scene.traverse(node=>{
    for(let parent=node;parent;parent=parent.parent)if(!parent.visible)return;
    const ref=node.userData.partRef||node.userData.ref;
    if(ref&&ref!=='BOARD')parts.push({id:node.uuid,ref,p:node.position.toArray(),q:node.quaternion.toArray()});
    if(node.isInstancedMesh)instances.push({id:node.uuid,matrices:Array.from(node.instanceMatrix.array)});
  });
  return {parts,instances};
});}
async function frameFits(page){
  const bounds=await page.evaluate(()=>{
    const {scene,camera}=window.__legacy,T=window.THREE,point=new T.Vector3();let x=0,y=0;
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    scene.traverseVisible(mesh=>{if(!mesh.isMesh||mesh.isInstancedMesh)return;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;for(let i=0;i<8;i++){point.set(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z).applyMatrix4(mesh.matrixWorld).project(camera);x=Math.max(x,Math.abs(point.x));y=Math.max(y,Math.abs(point.y));}});
    return {x,y};
  });
  assert.ok(bounds.x<=1&&bounds.y<=1,'Complete assembly fits the canvas: '+JSON.stringify(bounds));
}
const isFramework=config=>config.slug.startsWith('framework-');
async function mechanicalAssembly(page,config){
  if(!isFramework(config))return;
  const measured=await page.evaluate(()=>{
    const {scene}=window.__legacy,T=window.THREE,point=new T.Vector3();
    scene.updateMatrixWorld(true);
    const parts=[],pcb=[];
    scene.traverseVisible(node=>{
      if(node.userData.partRef==='Enclosure'||/^M2-\d+$/.test(node.userData.partRef||''))parts.push(node);
      if(node.isMesh&&node.userData.mechanicalRole==='pcb')pcb.push(node);
    });
    const vertices=nodes=>{
      const result=[];
      for(const node of nodes){
        const positions=node.geometry.attributes.position;
        for(let index=0;index<positions.count;index++)result.push(point.fromBufferAttribute(positions,index).applyMatrix4(node.matrixWorld).toArray());
      }
      return result;
    };
    const bounds=points=>points.length?{
      min:[0,1,2].map(axis=>points.reduce((min,value)=>Math.min(min,value[axis]),Infinity)),
      max:[0,1,2].map(axis=>points.reduce((max,value)=>Math.max(max,value[axis]),-Infinity))
    }:null;
    const enclosure=parts.find(node=>node.userData.partRef==='Enclosure'),shell=[];
    enclosure?.traverseVisible(node=>{if(node.isMesh)shell.push(node);});
    const boardVertices=vertices(pcb),shellVertices=vertices(shell);
    const screws=parts.filter(node=>/^M2-\d+$/.test(node.userData.partRef||'')).map(screw=>{
      const shaft=[],head=[];
      screw.traverseVisible(node=>{
        if(node.isMesh&&node.userData.mechanicalRole==='screw-shaft')shaft.push(node);
        if(node.isMesh&&node.userData.mechanicalRole==='screw-head')head.push(node);
      });
      const position=screw.getWorldPosition(new T.Vector3()).toArray();
      const radial=p=>Math.hypot(p[0]-position[0],p[2]-position[2]);
      // Read the actual cylindrical PCB edge and the source STL's boss lip.
      // A solid board, moved screw or shifted housing cannot pass by metadata alone.
      const hole=boardVertices.filter(p=>Math.abs(radial(p)-1.1)<.002);
      const boss=shellVertices.filter(p=>Math.abs(radial(p)-1.85)<.002&&Math.abs(p[1]-3.1)<.002);
      return {ref:screw.userData.partRef,position,shaft:bounds(vertices(shaft)),head:bounds(vertices(head)),hole:bounds(hole),holeVertices:hole.length,boss:bounds(boss),bossVertices:boss.length};
    });
    return {enclosures:parts.filter(node=>node.userData.partRef==='Enclosure').length,shellMeshes:shell.length,board:bounds(boardVertices),screws};
  });
  const label=config.slug+' mechanical assembly';
  assert.equal(measured.enclosures,1,label+': one housing group');
  assert.ok(measured.shellMeshes>0,label+': housing contains visible geometry');
  assert.deepEqual(measured.screws.map(screw=>screw.ref).sort(),['M2-1','M2-2'],label+': two visible M2 screws');
  assert.ok(measured.board,label+': PCB core geometry is visible');
  const near=(actual,expected,message,tolerance=.005)=>assert.ok(Math.abs(actual-expected)<tolerance,label+': '+message+' ('+actual+' vs '+expected+')');
  for(const screw of measured.screws){
    assert.ok(screw.shaft&&screw.head,screw.ref+': shaft and head both present');
    near(Math.abs(screw.position[0]),11.3,screw.ref+' reference X');
    near(screw.position[2],-10.5,screw.ref+' reference Z');
    assert.ok(screw.holeVertices>=16&&screw.bossVertices>=16,screw.ref+': complete PCB hole and housing boss rings');
    for(const axis of [0,2]){
      for(const [part,partBounds] of [['head',screw.head],['shaft',screw.shaft],['PCB hole',screw.hole],['housing boss',screw.boss]])near((partBounds.min[axis]+partBounds.max[axis])/2,screw.position[axis],screw.ref+' '+part+' axis '+axis);
    }
    near(measured.board.min[1],screw.boss.max[1],screw.ref+' PCB underside seats on housing');
    near(screw.head.min[1],measured.board.max[1],screw.ref+' head seats above PCB',.08);
    assert.ok(screw.shaft.min[1]<measured.board.min[1]-.3&&screw.shaft.max[1]>measured.board.max[1],screw.ref+': shaft passes through PCB into boss');
    assert.ok(screw.shaft.max[0]-screw.shaft.min[0]<screw.hole.max[0]-screw.hole.min[0],screw.ref+': shaft fits mounting hole');
    assert.ok(screw.head.max[0]-screw.head.min[0]>screw.hole.max[0]-screw.hole.min[0],screw.ref+': head retains PCB around mounting hole');
  }
}
function mechanicalMotion(config,separated){
  if(!isFramework(config))return;
  for(const ref of ['M2-1','M2-2','Enclosure']){
    const part=separated.find(part=>part.ref===ref);
    assert.ok(part,config.slug+': mechanical part retained during separation: '+ref);
    assert.ok(ref==='Enclosure'?part.d[1]<-10:part.d[1]>10,ref+': housing and screws separate in opposite directions');
    assert.ok(part.tilt>.01,ref+': mechanical part rotates during separation');
  }
}
async function point(page,config){return page.evaluate(config=>{
  const {scene,camera}=window.__legacy,T=window.THREE;
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  let part;scene.traverse(node=>{if((node.userData.partRef||node.userData.ref)===config.ref){let visible=true;for(let p=node;p;p=p.parent)if(!p.visible)visible=false;if(visible)part=node;}});
  if(!part)throw Error('Part missing: '+config.ref);
  if(config.mechanicalRole){let mesh;part.traverseVisible(node=>{if(node.userData.mechanicalRole===config.mechanicalRole)mesh=node;});if(!mesh)throw Error('Mechanical geometry missing: '+config.ref);part=mesh;}
  const position=new T.Box3().setFromObject(part).getCenter(new T.Vector3()).project(camera);
  const rect=document.querySelector(config.stage).getBoundingClientRect();
  return {x:rect.left+(position.x+1)*rect.width/2,y:rect.top+(1-position.y)*rect.height/2};
},config);}
async function screwPicking(page,config,touch=false){
  if(!isFramework(config))return;
  // The connectors and raised ICs can occlude a screw at the initial low angle.
  // Inspect from above through the public orbit controls, then restore that view.
  await page.locator(config.stage).focus();
  for(let index=0;index<8;index++)await page.keyboard.press('ArrowUp');
  await idle(page,config.root);
  for(let index=1;index<=2;index++){
    const hit=await point(page,{...config,ref:'M2-'+index,mechanicalRole:'screw-head'});
    if(touch)await page.touchscreen.tap(hit.x,hit.y);else await page.mouse.move(hit.x,hit.y);
    await page.locator(config.panel).waitFor({state:'visible'});
    assert.match(await page.locator(config.panel).textContent(),new RegExp('M2(?:-| mounting screw )'+index),config.slug+': screw '+index+' is identifiable');
  }
  await page.locator(config.stage).focus();
  for(let index=0;index<8;index++)await page.keyboard.press('ArrowDown');
  await idle(page,config.root);
}
async function instrument(context){
  await context.addInitScript(()=>{
    Object.defineProperty(window,'PortfolioExplorer',{configurable:true,set(value){
      const create=value.createRenderer;
      value.createRenderer=function(...args){
        const renderer=create(...args);
        if(renderer){const render=renderer.render.bind(renderer);renderer.render=(scene,camera)=>{
          window.__legacy={scene,camera};
          if(window.__legacyWatch&&!window.__legacyStagger){
            const movements=[];scene.traverse(node=>{const before=window.__legacyWatch.get(node.uuid);if(before)movements.push(node.position.toArray().some((value,index)=>Math.abs(value-before.p[index])>1e-7));});
            if(movements.includes(true)&&movements.includes(false))window.__legacyStagger=true;
          }
          return render(scene,camera);
        };}
        return renderer;
      };
      Object.defineProperty(window,'PortfolioExplorer',{value,writable:true,configurable:true,enumerable:true});
    }});
  });
}
function changed(before,after){
  return before.parts.map(a=>{const b=after.parts.find(b=>b.id===a.id);assert.ok(b,'Physical part retained: '+a.ref);return {ref:a.ref,d:b.p.map((v,i)=>v-a.p[i]),tilt:Math.max(...b.q.map((v,i)=>Math.abs(v-a.q[i])))};});
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];
  try{
    // CAD parsing and software WebGL can overlap navigation on slower hosts.
    const configure=context=>context.setDefaultNavigationTimeout(90000);
    await fs.mkdir('.codex-temp/legacy-assemblies',{recursive:true});
    const desktop=await browser.newContext({viewport:{width:1440,height:1000}});configure(desktop);await instrument(desktop);
    const page=await desktop.newPage();page.on('pageerror',error=>errors.push(page.url()+': '+error.message));
    for(const config of process.env.LEGACY_ONLY_FALLBACK?[]:viewers){
      if((process.env.LEGACY_SKIP_DESKTOP||'').split(',').includes(config.slug))continue;
      await page.goto(base+'/v2/projects/'+config.slug+'/',{waitUntil:'networkidle'});
      await page.locator(config.stage).scrollIntoViewIfNeeded();await page.locator(config.ready).waitFor({state:'attached',timeout:60000});await idle(page,config.root);
      assert.equal(await page.locator(config.root+' button:visible').count(),1,'Only assembly toggle is visible');
      assert.equal(await page.locator(config.root+' select, '+config.root+' input').count(),0);
      assert.equal(await page.locator(config.button).textContent(),'Disassemble');
      const original=await snapshot(page);assert.ok(original.parts.length>10);
      await mechanicalAssembly(page,config);
      await frameFits(page);
      const hit=await point(page,config);await page.mouse.move(hit.x,hit.y);
      await page.locator(config.panel).waitFor({state:'visible'});assert.match(await page.locator(config.panel).textContent(),new RegExp(config.ref));
      const panel=await page.locator(config.panel).boundingBox(),stage=await page.locator(config.stage).boundingBox();
      assert.ok(panel.x>stage.x+stage.width*.5&&panel.y<stage.y+60,'Part identity is at top right');
      await screwPicking(page,config);
      await page.mouse.move(1,1);assert.equal(await page.locator(config.panel).isVisible(),false);
      await page.evaluate(parts=>{window.__legacyWatch=new Map(parts.map(part=>[part.id,part]));window.__legacyStagger=false;},original.parts);
      await page.locator(config.button).click();assert.equal(await page.locator(config.button).textContent(),'Assemble');
      await page.waitForFunction(()=>window.__legacyStagger===true);
      await idle(page,config.root);
      const separated=changed(original,await snapshot(page));
      mechanicalMotion(config,separated);
      assert.ok(new Set(separated.map(part=>part.d[1].toFixed(5))).size>3,'Varied separation heights');
      assert.ok(separated.filter(part=>Math.abs(part.d[0])+Math.abs(part.d[2])>1e-6).length>5,'Lateral component drift');
      assert.ok(separated.filter(part=>part.tilt>1e-5).length>5,'Small component rotations');
      await page.locator(config.stage).scrollIntoViewIfNeeded();await idle(page,config.root);
      await frameFits(page);
      const explodedHit=await point(page,config);await page.mouse.move(explodedHit.x,explodedHit.y);
      await page.locator(config.panel).waitFor({state:'visible'});assert.match(await page.locator(config.panel).textContent(),new RegExp(config.ref),'Exploded component retains its physical identity');
      await page.locator(config.stage).screenshot({path:'.codex-temp/legacy-assemblies/'+config.slug+'-disassembled.png'});
      await page.mouse.move(1,1);
      await page.locator(config.button).click();await idle(page,config.root);assert.deepEqual(await snapshot(page),original,'Exact component reassembly');
      await page.locator(config.button).click();await page.waitForFunction(selector=>Number(document.querySelector(selector).dataset.explorerProgress)>.12,config.root);
      await page.locator(config.button).click();await idle(page,config.root);assert.deepEqual(await snapshot(page),original,'Interrupted reversal returns exact base transforms');
      const before=await page.locator(config.root).getAttribute('data-explorer-frames');
      const keyboardTarget=await page.locator(config.stage).getAttribute('tabindex')!==null?page.locator(config.stage):page.locator(config.stage).locator('canvas');
      await page.locator(config.stage).scrollIntoViewIfNeeded();await keyboardTarget.focus();await page.keyboard.press('ArrowLeft');await idle(page,config.root);assert.notEqual(await page.locator(config.root).getAttribute('data-explorer-frames'),before);
      await page.locator(config.button).click();await page.evaluate(()=>scrollTo(0,0));
      await page.waitForFunction(selector=>document.querySelector(selector).dataset.explorerMotion==='paused',config.root);
      const paused=await page.locator(config.root).getAttribute('data-explorer-frames');await page.waitForTimeout(300);assert.equal(await page.locator(config.root).getAttribute('data-explorer-frames'),paused,'Offscreen renderer must stop');
      await page.locator(config.stage).scrollIntoViewIfNeeded();await idle(page,config.root);assert.equal(await page.locator(config.root).getAttribute('data-explorer-progress'),'1.0000','Interrupted offscreen motion resumes');
      console.log('PASS '+config.slug+': one action, physical hover, stagger/drift/tilt, exact reversal, keyboard, idle and offscreen resume');
    }
    await desktop.close();
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});configure(mobile);await instrument(mobile);
    const phone=await mobile.newPage();phone.on('pageerror',error=>errors.push(phone.url()+': '+error.message));
    for(const config of process.env.LEGACY_ONLY_FALLBACK?[]:viewers){
      await phone.goto(base+'/v2/projects/'+config.slug+'/',{waitUntil:'networkidle'});await phone.locator(config.stage).scrollIntoViewIfNeeded();await phone.locator(config.ready).waitFor({state:'attached',timeout:60000});await idle(phone,config.root);
      const original=await snapshot(phone),hit=await point(phone,config);await phone.touchscreen.tap(hit.x,hit.y);
      await mechanicalAssembly(phone,config);
      await frameFits(phone);
      await phone.locator(config.panel).waitFor({state:'visible'});assert.match(await phone.locator(config.panel).textContent(),new RegExp(config.ref));
      await phone.locator(config.stage).screenshot({path:'.codex-temp/legacy-assemblies/'+config.slug+'-mobile.png'});
      await screwPicking(phone,config,true);
      await phone.locator(config.button).tap();await idle(phone,config.root);assert.equal(await phone.locator(config.root).getAttribute('data-explorer-progress'),'1.0000');
      mechanicalMotion(config,changed(original,await snapshot(phone)));
      await frameFits(phone);
      await phone.locator(config.button).tap();await idle(phone,config.root);assert.deepEqual(await snapshot(phone),original);
      assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile page has no horizontal overflow');
      console.log('PASS '+config.slug+': mobile tap identity, reduced-motion poses and reassembly');
    }
    await mobile.close();
    const compatibility=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    configure(compatibility);
    const originalPage=await compatibility.newPage();originalPage.on('pageerror',error=>errors.push(originalPage.url()+': '+error.message));
    for(const config of process.env.LEGACY_ONLY_FALLBACK?[]:viewers){
      await originalPage.goto(base+'/projects/'+config.slug+'/',{waitUntil:'networkidle'});
      await originalPage.locator(config.stage).scrollIntoViewIfNeeded();await originalPage.locator(config.ready).waitFor({state:'attached',timeout:60000});
      assert.ok(await originalPage.locator(config.root+' button:visible').count()>1,'Original viewer retains its controls');
      await originalPage.locator(config.button).click();assert.equal(await originalPage.locator(config.button).textContent(),'Assemble');
      await originalPage.locator(config.root+' [data-framework-reset], '+config.root+' [data-dual-usb-reset], '+config.root+' [data-pcb-reset]').click();
      assert.equal(await originalPage.locator(config.button).textContent(),'Explode','Original reset remains compatible');
      console.log('PASS '+config.slug+': original website controls remain compatible');
    }
    await compatibility.close();
    const fallback=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});configure(fallback);await instrument(fallback);await fallback.route('**/tramtrace-kicad-source.glb*',route=>route.abort());
    const fallbackPage=await fallback.newPage();fallbackPage.on('pageerror',error=>errors.push(error.message));
    const tram=viewers[2];await fallbackPage.goto(base+'/v2/projects/tramtrace/',{waitUntil:'networkidle'});await fallbackPage.locator(tram.stage).scrollIntoViewIfNeeded();await idle(fallbackPage,tram.root);
    assert.equal(await fallbackPage.locator(tram.root).getAttribute('data-source-model'),'fallback');
    const original=await snapshot(fallbackPage);assert.equal(original.instances.length,4);
    await fallbackPage.locator(tram.button).click();await idle(fallbackPage,tram.root);
    const separated=await snapshot(fallbackPage);assert.notDeepEqual(separated.instances,original.instances,'Fallback LED instances also disassemble');
    await fallbackPage.locator(tram.button).click();await idle(fallbackPage,tram.root);assert.deepEqual(await snapshot(fallbackPage),original,'Fallback instance matrices restore exactly');
    await fallback.close();
    assert.deepEqual(errors,[],'No browser JavaScript errors');
    console.log('PASS TramTrace fallback LED motion and exact matrix reversal; no browser errors');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
