/* Dash device acceptance checks against the real viewer and source meshes.
 * Requires Playwright and a static server. Optional DASH_QA_URL/V2_BASE_URL,
 * CHROMIUM_EXECUTABLE, DASH_QA_OUTPUT/V2_SCREENSHOTS for screenshots + report.
 * Source geometry is checked against repository STLs and their hash ledger.
 * Browser-only response instrumentation exposes the actual model/camera;
 * no website files are changed. */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const BASE=process.env.DASH_QA_URL||process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const REPO=path.resolve(__dirname,'..');
const OUT=process.env.DASH_QA_OUTPUT||process.env.V2_SCREENSHOTS;
const CHROME=process.env.CHROMIUM_EXECUTABLE||undefined;

async function originalSTL(filename,ref,expectedHash){
  const data=await fs.readFile(filename),triangles=data.readUInt32LE(80),vertices=[];
  assert.equal(data.length,84+triangles*50,'Valid supplied binary STL');
  for(let i=0;i<triangles;i++)for(let v=0;v<3;v++)for(let a=0;a<3;a++)vertices.push(data.readFloatLE(84+i*50+12+v*12+a*4));
  const sha256=crypto.createHash('sha256').update(data).digest('hex');
  assert.equal(sha256,expectedHash,'STL matches the retained source hash ledger');
  return {ref,file:path.basename(filename),triangles,vertices,sha256};
}

async function instrument(page){
  await page.route(/\/assets\/v2-hardware\.js(?:\?|$)/,async route=>{
    const response=await route.fetch(),body=await response.text(),marker='renderer.render(scene,camera);';
    assert.ok(body.includes(marker),'Viewer render instrumentation marker exists');
    await route.fulfill({response,body:body.replace(marker,'window.__dashExplosionQA={scene,camera,model,current,rotation:{...rotation}};'+marker)});
  });
}

async function ready(page,url){
  const response=await page.goto(url,{waitUntil:'networkidle',timeout:90000});assert.equal(response.status(),200);
  const root=page.locator('[data-hardware]').first();await root.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.__dashExplosionQA&&document.querySelector('[data-hardware]')?.dataset.hardwareState==='ready',null,{timeout:90000});
  await page.waitForFunction(()=>document.querySelector('[data-hardware]')?.dataset.hardwareProgress==='0.0000');
  return root;
}

async function phase(page,root,value){
  if(Number(await root.getAttribute('data-hardware-progress'))!==value)await root.locator('[data-hardware-explode]').click();
  await page.waitForFunction(expected=>Number(document.querySelector('[data-hardware]')?.dataset.hardwareProgress)===expected,value);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

async function geometryQA(page,original){
  return page.evaluate(async original=>{
    const T=window.THREE,api=window.V2CadGeometry,{model}=window.__dashExplosionQA;
    const check=(ok,message)=>{if(!ok)throw new Error(message);};
    const near=(a,b,tol,message)=>check(Math.abs(a-b)<=tol,`${message}: ${a} vs ${b}`);
    const {group,parts,metadata}=model,refs=new Map(parts.map(p=>[p.ref,p]));
    const pcb=group.getObjectByName('PCB'),frame=pcb.parent,units=Math.max(metadata.boundsMm[2]-metadata.boundsMm[0],metadata.boundsMm[3]-metadata.boundsMm[1]);
    const major=parts.filter(p=>Array.isArray(p.object.userData.nativePositionMm));
    const sourceParts=parts.filter(p=>!major.includes(p));
    check(major.length>=20,'Expected separate magnets, touch pieces and four wire harnesses');
    check(major.filter(p=>/magnet/i.test(p.ref)&&!p.object.userData.sourceFile).length>=8,'Eight individual magnets must separate');
    check(major.filter(p=>/wire|loom|harness/i.test(p.ref)).length>=4,'Four independent harnesses must separate');
    const registration=group.userData.sourceRegistration;
    const r=registration.rotation,rotation=new T.Matrix4().set(r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1);
    const translation=new T.Vector3(...registration.translationMm),inverseRotation=rotation.clone().transpose();
    function update(){group.updateMatrixWorld(true);frame.updateMatrixWorld(true);}
    function toNative(mesh,p){return p.applyMatrix4(mesh.matrixWorld).applyMatrix4(frame.matrixWorld.clone().invert()).multiplyScalar(units).sub(translation).applyMatrix4(inverseRotation);}
    function fromNative(p){return new T.Vector3(...p).applyMatrix4(rotation).add(translation).divideScalar(units).applyMatrix4(frame.matrixWorld);}
    function bounds(object){
      const box=new T.Box3();object.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.geometry)return;
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        const b=mesh.geometry.boundingBox;
        for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])box.expandByPoint(toNative(mesh,new T.Vector3(x,y,z)));
      });return box;
    }
    function gap(a,b){return Math.hypot(...['x','y','z'].map(k=>Math.max(a.min[k]-b.max[k],b.min[k]-a.max[k],0)));}
    api.applyMotion(parts,0);update();
    const baseline=new Map();group.traverse(o=>baseline.set(o.uuid,o.matrixWorld.toArray()));
    const shellResults=[];
    for(const source of original){
      const part=parts.find(p=>p.object.userData.sourceFile===({ 'Housing base':'base.stl','Magnetic lid':'lid.stl'}[source.ref]));
      check(part,`Source ${source.ref} retained`);const actual=[];
      part.object.traverse(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
        for(let i=0;i<(index?.count||pos.count);i++)actual.push(...toNative(mesh,new T.Vector3().fromBufferAttribute(pos,index?index.getX(i):i)).toArray());});
      check(actual.length===source.vertices.length,`${source.ref}: exact original triangle count`);
      let maxError=0;for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-source.vertices[i]));
      check(maxError<.00005,`${source.ref}: source triangle vertex error ${maxError} mm`);
      const served=await fetch('/assets/models/hardware/dash/'+part.object.userData.sourceFile).then(r=>r.arrayBuffer());
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',served)),b=>b.toString(16).padStart(2,'0')).join('');
      check(digest===source.sha256,`${source.ref}: served source hash unchanged`);
      shellResults.push({ref:part.ref,triangles:actual.length/9,maxVertexErrorMm:maxError,sha256:digest});
    }
    const oled=refs.get('OLED').object,active=oled.getObjectByName('Inactive OLED viewing area');check(active,'OLED active surface retained');
    const activeCentre=toNative(oled,new T.Vector3(...oled.userData.activeCenterMm));
    const connector=toNative(oled,new T.Vector3(...oled.userData.connectorCentreMm));
    check(connector.z>activeCentre.z+5,`OLED connector must be above screen in housing Z: ${connector.z} vs ${activeCentre.z}`);
    near(activeCentre.x,.02944,.0001,'Active screen aperture X');check(activeCentre.y>=-25&&activeCentre.y<=-23,'Active screen lies behind the front window inner wall');near(activeCentre.z,26.6271,.0001,'Active screen aperture Z');
    const glass=oled.getObjectByName('Display glass');check(glass,'OLED glass retained');const glassBounds=bounds(glass);check(glassBounds.min.y>=-25-.00001,`OLED glass must remain behind inner wall: nativeY ${glassBounds.min.y}`);
    const activeBounds=bounds(active),occluders=[];group.traverse(m=>{if(m.isMesh&&!oled.getObjectById(m.id))occluders.push(m);});
    const visibility=[];
    for(const u of [.04,.5,.96])for(const v of [.04,.5,.96]){
      const target=[T.MathUtils.lerp(activeBounds.min.x,activeBounds.max.x,u),activeCentre.y,T.MathUtils.lerp(activeBounds.min.z,activeBounds.max.z,v)];
      const origin=fromNative([target[0],target[1]-20,target[2]]),end=fromNative(target),ray=new T.Raycaster(origin,end.clone().sub(origin).normalize(),0,origin.distanceTo(end)-.02/units);
      const hits=ray.intersectObjects(occluders,false);
      check(hits.length===0,`OLED active area obstructed at ${u},${v} by ${hits[0]?.object.name}`);visibility.push({u,v,clear:true});
    }
    const assembledBounds=major.map(p=>({ref:p.ref,min:bounds(p.object).min.toArray(),max:bounds(p.object).max.toArray()}));
    api.applyMotion(parts,1);update();
    const exploded=new Map(major.map(p=>[p.ref,bounds(p.object)])),pcbBounds=bounds(pcb),gaps=[],issues=[];
    for(let i=0;i<major.length;i++){
      const p=major[i],b=exploded.get(p.ref),pcbGap=gap(b,pcbBounds);gaps.push({a:p.ref,b:'PCB',mm:pcbGap});
      if(pcbGap<2)issues.push(`${p.ref} vs PCB: ${pcbGap.toFixed(3)} mm`);
      for(let j=i+1;j<major.length;j++){
        const q=major[j],mm=gap(b,exploded.get(q.ref));gaps.push({a:p.ref,b:q.ref,mm});
        if(mm<2)issues.push(`${p.ref} vs ${q.ref}: ${mm.toFixed(3)} mm`);
      }
    }
    const shells=major.filter(p=>p.object.userData.sourceFile),componentHousing=[],componentPCB=[];
    for(const p of sourceParts){
      const componentBounds=bounds(p.object),pcbGap=gap(componentBounds,pcbBounds);componentPCB.push({part:p.ref,mm:pcbGap});
      if(pcbGap<2)issues.push(`${p.ref} vs PCB: ${pcbGap.toFixed(3)} mm`);
      for(const shell of shells){
        const mm=gap(componentBounds,exploded.get(shell.ref));componentHousing.push({part:p.ref,shell:shell.ref,mm});
        if(mm<2)issues.push(`${p.ref} vs ${shell.ref}: ${mm.toFixed(3)} mm`);
      }
    }
    const componentBounds=sourceParts.map(part=>({ref:part.ref,box:bounds(part.object)}));
    let minimumComponentGap=Infinity;
    for(let i=0;i<componentBounds.length;i++){
      const p=componentBounds[i];
      for(const q of componentBounds.slice(i+1)){
        const mm=gap(p.box,q.box);minimumComponentGap=Math.min(minimumComponentGap,mm);
        if(mm<2)issues.push(`${p.ref} vs ${q.ref}: ${mm.toFixed(3)} mm`);
      }
      for(const q of major){
        const mm=gap(p.box,exploded.get(q.ref));
        if(mm<2)issues.push(`${p.ref} vs ${q.ref}: ${mm.toFixed(3)} mm`);
      }
    }
    const explodedBounds=major.map(p=>({ref:p.ref,min:exploded.get(p.ref).min.toArray(),max:exploded.get(p.ref).max.toArray()}));
    for(const phase of [.21,.72,.34,1,0,.91,.04,0]){api.applyMotion(parts,phase);update();if(phase===0)group.traverse(o=>o.matrixWorld.elements.forEach((v,i)=>check(v===baseline.get(o.uuid)[i],`Exact reassembly ${o.name}[${i}]`)));}
    return {parts:parts.length,majorParts:major.map(p=>p.ref),shellResults,oled:{activeCentre:activeCentre.toArray(),connector:connector.toArray(),visibility},assembledBounds,explodedBounds,gaps,componentHousing,componentPCB,minimumComponentGap,issues,exactReassembly:true};
  },original);
}

async function frameQA(page){
  return page.evaluate(()=>{
    const {model,camera,current}=window.__dashExplosionQA,T=window.THREE;model.group.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const box=new T.Box3(),outside=[];let vertices=0;
    model.group.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;const p=mesh.geometry?.getAttribute('position');if(!p)return;
      for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).project(camera);box.expandByPoint(v);vertices++;
        if((Math.abs(v.x)>.97||Math.abs(v.y)>.97||v.z< -1||v.z>1)&&outside.length<8)outside.push({mesh:mesh.name,ndc:v.toArray()});}
    });
    return {phase:current,vertices,ndcMin:box.min.toArray(),ndcMax:box.max.toArray(),fill:Math.max(box.max.x-box.min.x,box.max.y-box.min.y)/2,outside,
      camera:{left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
  });
}

async function main(){
  if(OUT)await fs.mkdir(OUT,{recursive:true});
  const sourceRoot=path.join(REPO,'assets','models','hardware','dash');
  const ledger=JSON.parse(await fs.readFile(path.join(sourceRoot,'housing-sources.json'),'utf8'));
  const refsByFile={'base.stl':'Housing base','lid.stl':'Magnetic lid'};
  assert.deepEqual(ledger.map(s=>s.file).sort(),Object.keys(refsByFile).sort(),'Both source housing meshes have provenance');
  const original=await Promise.all(ledger.map(source=>originalSTL(path.join(sourceRoot,source.file),refsByFile[source.file],source.sha256)));
  const report={url:BASE,routes:[],issues:[]},browser=await chromium.launch({headless:true,executablePath:CHROME,args:['--enable-unsafe-swiftshader']});
  try{
    for(const version of ['v2','v3']){
      const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],failed=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});await instrument(page);
      const root=await ready(page,`${BASE}/${version}/projects/dash/`);
      const geometry=await geometryQA(page,original);report.issues.push(...geometry.issues.map(i=>`${version}: ${i}`));
      const frames=[];
      for(const [name,size] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
        await page.setViewportSize(size);await root.scrollIntoViewIfNeeded();
        for(const value of [0,1,0]){
          await phase(page,root,value);const frame=await frameQA(page);frames.push({viewport:name,...frame});
          if(frame.outside.length)report.issues.push(`${version}/${name}/phase${value}: clipped geometry ${JSON.stringify(frame.outside)}`);
          if(frame.fill<.5)report.issues.push(`${version}/${name}/phase${value}: excessive empty framing (fill ${frame.fill.toFixed(3)})`);
          if(frame.horizontalOverflow)report.issues.push(`${version}/${name}: page horizontal overflow`);
          if(OUT)await root.screenshot({path:path.join(OUT,`${version}-${name}-${value?'exploded':'assembled'}.png`)});
        }
        const last=frames.slice(-3);assert.deepEqual(last[0].camera,last[2].camera,'Exact camera reversal');
        assert.ok((last[1].camera.right-last[1].camera.left)>(last[0].camera.right-last[0].camera.left)*1.25,'Dash camera adapts for separated assembly');
      }
      assert.deepEqual(errors,[],'No browser exceptions');assert.deepEqual(failed,[],'No failed assets');
      report.routes.push({version,geometry,frames,errors,failed});await page.close();
    }
    const control=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await instrument(control);
    const controlRoot=await ready(control,BASE+'/v2/projects/lora-receiver/');const before=await frameQA(control);
    await phase(control,controlRoot,1);const after=await frameQA(control);assert.deepEqual(after.camera,before.camera,'Non-Dash camera remains steady');
    report.nonDashControl={route:'/v2/projects/lora-receiver/',cameraUnchanged:true};await control.close();
    report.passed=report.issues.length===0;
  }catch(error){report.error=error.stack;report.passed=false;throw error;}
  finally{await browser.close();if(OUT)await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(report,null,2));}
  console.log(JSON.stringify({passed:report.passed,routes:report.routes.map(r=>({version:r.version,parts:r.geometry.parts,majorParts:r.geometry.majorParts.length})),issues:report.issues,report:OUT?path.join(OUT,'report.json'):undefined},null,2));
  if(!report.passed)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
