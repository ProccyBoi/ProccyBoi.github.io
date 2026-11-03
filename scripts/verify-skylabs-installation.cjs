/* Checks the illustrative installation against servo anchors and source CAD. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const T=require('../assets/vendor/three.min.js');
global.window=global;global.V2ProductStudio={applyMaterials(){}};
for(const path of ['v3-aircraft-electronics.js','v2-skylabs-systems.js'])vm.runInThisContext(fs.readFileSync('assets/'+path,'utf8'),{filename:path});
// The actual board is loaded in the browser regression; this lightweight stub
// isolates installation placement while retaining the source size/count contract.
const result=V2SkylabsSystems.create(T,{group:new T.Group(),metadata:{boundsMm:[0,0,73.03,50],source:'test',modelledComponentCount:153}});
const manifest=JSON.parse(fs.readFileSync('assets/models/aircraft/skylabs-competition/manifest.json'));
const bounds=manifest.sourceBoundsMm,centre=[0,1,2].map(i=>(bounds[i]+bounds[i+3])*.5);
const sourcePoint=p=>[centre[0]-p.z*1000,centre[1]-p.x*1000,centre[2]+p.y*1000];
const inside=(p,b)=>p.every((v,i)=>v>=b[i]-.001&&v<=b[i+3]+.001);
const solids=manifest.parts.filter(part=>!part.assembly&&part.boundsMm);
function intersectsSegment(a,b,box){let lo=0,hi=1;for(let i=0;i<3;i++){const d=b[i]-a[i];if(Math.abs(d)<1e-9){if(a[i]<box[i]||a[i]>box[i+3])return false;continue;}let x=(box[i]-a[i])/d,y=(box[i+3]-a[i])/d;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;}return lo<.98&&hi>.02;}
const patterns=[/^Aileron_spar_2$/, /^Aileron_spar_2\(Mirror\)$/, /^HT_Elevator_Border_Stringer\(Mirror\)$/, /^VT_Rudder1$/];
result.group.updateMatrixWorld(true);
assert.equal(result.board.userData.components,153);assert.equal(result.servos.length,4);assert.equal(result.horns.length,4);assert.equal(result.rods.length,4);
for(let i=0;i<4;i++){
 const pin=result.servos[i].getObjectByName(['Left flaperon','Right flaperon','Elevator','Rudder'][i]+' servo pushrod pin');
 assert.ok(pin,'servo output pin exists');
 const actual=result.group.worldToLocal(pin.getWorldPosition(new T.Vector3()));
 const rod=result.rods[i],a=new T.Vector3(...rod.userData.servoPin),b=new T.Vector3(...rod.userData.controlPin);
 assert.ok(actual.distanceTo(a)<1e-8,'pushrod starts at servo output pin');
 assert.ok(a.distanceTo(b)>.03&&a.distanceTo(b)<.10,'pushrod has a plausible installed length');
 const point=sourcePoint(result.horns[i].position);
 assert.ok(manifest.parts.some(part=>patterns[i].test(part.name)&&inside(point,part.boundsMm)),`horn ${i} mounts on its source control structure`);
 const start=sourcePoint(a),end=sourcePoint(b);
 for(const part of solids){const expanded=part.boundsMm.map((v,j)=>v+(j<3?-.6:.6));assert.ok(!intersectsSegment(start,end,expanded),`pushrod ${i} clears ${part.name}`);}
 // Wing rods are outboard, tail rods aft of the central lowering carriage.
 assert.ok(i<2?Math.min(Math.abs(a.z),Math.abs(b.z))>.6:Math.max(a.x,b.x)<-.6,'linkage clears central carriage corridor');
}
// Conservative individual servo mesh bounding boxes must not overlap any CAD
// solid bounds. Every servo vertex must also remain between the actual upper
// and lower film surfaces at its chord/span position.
const panels=JSON.parse(zlib.gunzipSync(fs.readFileSync('assets/models/aircraft/skylabs-competition/solarfilm.json.gz'))).panels;
function film(side){return panels.filter(p=>new RegExp('^wing-(left|right)'+side+'-(white|blue)$').test(p.name)).map(p=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p.positions,3));g.setIndex(p.indices);return new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));});}
const upper=film(1),lower=film(0),ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),up=new T.Vector3(0,1,0),vertex=new T.Vector3();
for(const servo of result.servos.slice(0,2))servo.traverse(mesh=>{
 if(!mesh.isMesh)return;
 const box=new T.Box3().setFromObject(mesh),a=sourcePoint(box.min),b=sourcePoint(box.max),boxMm=[0,1,2].map(i=>Math.min(a[i],b[i])).concat([0,1,2].map(i=>Math.max(a[i],b[i])));
 for(const part of solids)assert.ok(![0,1,2].every(i=>Math.min(boxMm[i+3],part.boundsMm[i+3])-Math.max(boxMm[i],part.boundsMm[i])>.05),`servo component ${mesh.name} clears ${part.name}`);
 const position=mesh.geometry.attributes.position;
 for(let i=0;i<position.count;i++){
  vertex.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
  ray.set(new T.Vector3(vertex.x,1,vertex.z),down);const top=ray.intersectObjects(upper);
  ray.set(new T.Vector3(vertex.x,-1,vertex.z),up);const bottom=ray.intersectObjects(lower);
  assert.ok(top.length&&bottom.length,'servo stays within wing film footprint');
  assert.ok(vertex.y<=top[0].point.y&&vertex.y>=bottom[0].point.y,'servo stays between wing film surfaces');
 }
});
result.setInspection(0);assert.ok(result.horns.slice(0,2).every(horn=>!horn.visible));
result.setInspection(1);assert.ok(result.horns.slice(0,2).every(horn=>horn.visible));
console.log('PASS: servo pins, CAD control mounts and solid clearance, upper/lower film envelope, and reversible wing visibility.');
