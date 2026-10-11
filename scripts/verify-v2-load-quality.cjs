/* Preparation may use small hidden targets; visible output stays identical. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/v2-selected-work.js'),'utf8');
const start=source.indexOf('  function prepareShadowSize(size) {'),end=source.indexOf('  function draw(',start);
assert.ok(start>=0&&end>start,'Production shadow target helper exists');
const events=[],shadow={map:null,mapSize:{x:1536,y:1536,set(x,y){this.x=x;this.y=y;events.push(['size',x,y]);}}};
const context=vm.createContext({key:{shadow}});
vm.runInContext(source.slice(start,end)+'\nthis.prepareShadowSize=prepareShadowSize;',context);
const allocate=size=>({width:size,height:size,dispose(){events.push(['dispose',size]);}});
context.prepareShadowSize(64);
assert.equal(shadow.map,null);assert.equal(shadow.mapSize.x,64);
shadow.map=allocate(64);const small=shadow.map;
context.prepareShadowSize(64);assert.equal(shadow.map,small,'Six isolated stages reuse one target');
context.prepareShadowSize(1536);assert.equal(shadow.map,null,'Full composition cannot retain a small r128 target');
assert.deepEqual(events.slice(-2),[['dispose',64],['size',1536,1536]],'Dispose old target before full-size reallocation');
shadow.map=allocate(1536);const full=shadow.map;
context.prepareShadowSize(1536);assert.equal(shadow.map,full,'Composition and visible frames reuse full quality');
// Cancellation/resume may revisit a remaining model stage. The next owned,
// drained draw chooses its target again rather than relying on a stale flag.
context.prepareShadowSize(64);assert.equal(shadow.map,null);
shadow.map=allocate(64);context.prepareShadowSize(1536);assert.equal(shadow.map,null);
assert.equal(shadow.mapSize.x,1536);assert.equal(shadow.mapSize.y,1536);
assert.match(source,/prepareShadowSize\(warm&&longSide===64\?64:1536\)/,'Only isolated masked model stages lower preparation resolution');
assert.match(source,/draw\(pose,true\)/,'Complete warm compositions use the full shadow resolution');
assert.match(source,/const pose=draw\(value\)/,'Live draw uses its original full-resolution path');
assert.match(source,/shadowWidth:key\.shadow\.map\?\.width,shadowHeight:key\.shadow\.map\?\.height/,'Evidence records the actual target, not just requested mapSize');
assert.match(source,/renderer\.shadowMap\.type=T\.PCFSoftShadowMap/,'Accepted shadow filtering retained');
console.log('PASS: hidden model-only shadow target, exact full-size allocation/reuse/restoration, existing PCF filtering and observable actual dimensions. No browser/GPU quality claimed.');
