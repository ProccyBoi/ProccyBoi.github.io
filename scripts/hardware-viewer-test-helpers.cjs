'use strict';
const assert=require('node:assert/strict');

async function captureModels(page){
 await page.addInitScript(()=>{
  let factory;window.__hardwareModels={};
  Object.defineProperty(window,'V2HardwareModels',{configurable:true,get:()=>factory,set:value=>{
   factory={...value,load:async url=>{const model=await value.load(url);window.__hardwareModels[url]=model;return model;}};
  }});
 });
}
async function settled(root){
 const selector=`[data-hardware="${await root.getAttribute('data-hardware')}"]`;
 await root.page().waitForFunction(selector=>document.querySelector(selector)?.dataset.hardwareMotion==='idle',selector,{timeout:60000});
 const before=await root.getAttribute('data-hardware-frames');await root.page().waitForTimeout(220);
 assert.equal(await root.getAttribute('data-hardware-frames'),before,'Idle renderer must stop');
}
async function simpleUI(root){
 assert.equal(await root.locator('button:visible').count(),1,'One visible assembly action');
 assert.equal(await root.locator('select,input').count(),0,'No search, slider or option fields');
 assert.equal(await root.locator('[data-hardware-view],[data-hardware-reset],[data-hardware-scroll]').count(),0,'No preset or playback toolbar');
 assert.equal(await root.locator('[data-hardware-explode]').textContent(),'Disassemble');
}
// Find a visible physical mesh using the actual model transforms, then drive
// the browser's real pointer. This tests picking through the rendered canvas,
// including PCB occlusion and the individual identities in LED batches.
async function partPoint(root,position){
 const manifest=await root.getAttribute('data-hardware');
 return root.page().evaluate(({manifest,position})=>{
  const model=window.__hardwareModels[manifest],T=window.THREE;
  const root=document.querySelector(`[data-hardware="${manifest}"]`),bounds=root.querySelector('canvas').getBoundingClientRect();
  const aspect=bounds.width/bounds.height,half=Number(root.dataset.hardwareCameraHalf);
  const camera=new T.OrthographicCamera(-half*Math.max(1,aspect),half*Math.max(1,aspect),half*Math.max(1,1/aspect),-half*Math.max(1,1/aspect),.1,50);
  camera.position.set(0,0,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const ray=new T.Raycaster(),meshes=[],owners=new Map();model.group.updateMatrixWorld(true);
  model.group.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
  model.parts.forEach(part=>part.object.traverse(mesh=>{if(mesh.isMesh)owners.set(mesh,part);}));
  const identify=(x,y)=>{
   ray.setFromCamera(new T.Vector2((x-bounds.left)/bounds.width*2-1,-(y-bounds.top)/bounds.height*2+1),camera);
   const hit=ray.intersectObjects(meshes,false)[0],part=hit&&owners.get(hit.object);if(!part)return null;
   let ref=part.ref,value=part.value;
   if(part.object.userData.componentCenters){
    const local=part.object.worldToLocal(hit.point.clone());
    const nearest=part.object.userData.componentCenters.map(item=>({...item,distance:local.distanceToSquared(new T.Vector3(...item.position))})).sort((a,b)=>a.distance-b.distance)[0];
    ref=nearest.ref;value=nearest.value;
   }
   return {x,y,ref,value};
  };
  if(position)return identify(position.x,position.y);
  const ordered=[...model.parts].sort((a,b)=>Number(/^U\d/.test(b.ref))-Number(/^U\d/.test(a.ref)));
  for(const part of ordered){
   const candidates=[];
   part.object.traverse(mesh=>{
    if(!mesh.isMesh)return;mesh.geometry.computeBoundingBox();
    candidates.push(mesh.localToWorld(mesh.geometry.boundingBox.getCenter(new T.Vector3())));
    const vertices=mesh.geometry.attributes.position;
    for(let i=0;i<vertices.count;i+=Math.max(1,Math.floor(vertices.count/12)))candidates.push(mesh.localToWorld(new T.Vector3().fromBufferAttribute(vertices,i)));
   });
   for(const world of candidates){
    const projected=world.project(camera),x=bounds.left+(projected.x+1)*bounds.width/2,y=bounds.top+(1-projected.y)*bounds.height/2;
    if(x<bounds.left+8||x>bounds.right-8||y<Math.max(bounds.top+8,8)||y>Math.min(bounds.bottom-8,innerHeight-8))continue;
    const hit=identify(x,y);if(hit&&(hit.ref===part.ref||part.object.userData.componentRefs?.includes(hit.ref)))return hit;
   }
  }
  return null;
 },{manifest,position});
}
async function hoverPart(root){
 const point=await partPoint(root);assert.ok(point,'A visible physical component can be picked');
 await root.page().mouse.move(point.x,point.y);
 await root.page().waitForFunction(({manifest,ref})=>document.querySelector(`[data-hardware="${manifest}"]`).dataset.hardwareSelection===ref,{manifest:await root.getAttribute('data-hardware'),ref:point.ref});
 assert.match(await root.locator('[data-hardware-part]').textContent(),new RegExp('^'+point.ref.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?: · |$)'));
 assert.equal(await root.locator('[data-hardware-part]').isVisible(),true);
 return point;
}
async function assertFramed(root){
 const result=await root.page().evaluate(manifest=>{
  const root=document.querySelector(`[data-hardware="${manifest}"]`),canvas=root.querySelector('canvas'),model=window.__hardwareModels[manifest],T=window.THREE;
  const aspect=canvas.clientWidth/canvas.clientHeight,half=Number(root.dataset.hardwareCameraHalf),bounds=new T.Box3().setFromObject(model.group);
  return {x:Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))/(half*Math.max(1,aspect)),y:Math.max(Math.abs(bounds.min.y),Math.abs(bounds.max.y))/(half*Math.max(1,1/aspect))};
 },await root.getAttribute('data-hardware'));
 assert.ok(result.x<.98&&result.y<.98,'All geometry fits the viewer: '+JSON.stringify(result));
}
module.exports={captureModels,settled,simpleUI,partPoint,hoverPart,assertFramed};
