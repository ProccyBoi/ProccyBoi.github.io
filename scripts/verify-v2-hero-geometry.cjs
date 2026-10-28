/* Exact packed/runtime geometry parity and allocation proof; no browser needed. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const T=require('../assets/vendor/three.min.js'),root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/v2-hero-assets.js'),'utf8');
async function load(name,optimized,skewedHints=false){
  const window={THREE:T,DecompressionStream:optimized?DecompressionStream:undefined,...Object.fromEntries(['Float32Array','Float64Array','Uint32Array','Uint16Array','Uint8Array','Int32Array','Int16Array','Int8Array'].map(name=>[name,globalThis[name]]))};
  const context=vm.createContext({window,performance,TextDecoder,DataView,Uint8Array,Map,Set,console,setTimeout,clearTimeout,DecompressionStream,Response,Blob,
    Image:class{set src(value){this.url=value;this.width=this.naturalWidth=128;this.height=this.naturalHeight=64;queueMicrotask(()=>this.onload());}get src(){return this.url;}},
    fetch:async url=>new Response(fs.readFileSync(path.join(root,url.split('?')[0])))
  });
  vm.runInContext(source,context,{filename:'v2-hero-assets.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/v2-hero-motion.js'),'utf8'),context,{filename:'v2-hero-motion.js'});
  if(!optimized)delete window.V2HeroGeometryHints;
  else if(skewedHints)window.V2HeroGeometryHints[name]={...window.V2HeroGeometryHints[name],sourceSha256:'0'.repeat(64)};
  const model=await window.V2HeroAssets.load(name);
  return {model,motion:window.V2HeroMotion,stats:window.V2HeroAssetTimings.get(name),hints:window.V2HeroGeometryHints?.[name]};
}
const bytes=attribute=>Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength);
const properties=value=>{
  if(value===null||typeof value!=='object')return typeof value==='function'?undefined:value;
  if(Array.isArray(value))return Array.from(value,properties);
  if(value.toArray)return {type:value.constructor.name,value:value.toArray()};
  return {...(value.isTexture?{imageSrc:value.image.src}:{}),...Object.fromEntries(Object.keys(value).sort().filter(key=>!['id','uuid','version','image','source'].includes(key)&&!key.startsWith('_')).map(key=>[key,properties(value[key])]))};
};
function equivalent(a,b,label){
  assert.equal(a.type,b.type,label+' node type');assert.equal(a.name,b.name,label+' node name');
  for(const key of ['visible','castShadow','receiveShadow','frustumCulled','renderOrder','matrixAutoUpdate'])assert.equal(a[key],b[key],label+' '+key);
  for(const key of ['position','quaternion','scale','matrix','matrixWorld'])assert.deepEqual(a[key].toArray(),b[key].toArray(),label+' '+key);
  assert.deepEqual(JSON.parse(JSON.stringify(a.userData)),JSON.parse(JSON.stringify(b.userData)),label+' user data');
  if(a.geometry){
    const ga=a.geometry,gb=b.geometry;
    assert.equal(ga.name,gb.name,label+' geometry name');assert.equal(JSON.stringify(ga.groups),JSON.stringify(gb.groups),label+' groups');assert.equal(JSON.stringify(ga.drawRange),JSON.stringify(gb.drawRange),label+' draw range');
    assert.deepEqual(Object.keys(ga.attributes),Object.keys(gb.attributes),label+' attribute names');
    for(const key of [...Object.keys(ga.attributes),'index']){
      const aa=key==='index'?ga.index:ga.attributes[key],bb=key==='index'?gb.index:gb.attributes[key];
      assert.equal(aa.itemSize,bb.itemSize,label+' '+key+' stride');assert.equal(aa.normalized,bb.normalized,label+' '+key+' normalization');
      assert.equal(aa.array.constructor.name,bb.array.constructor.name,label+' '+key+' type');assert.deepEqual(bytes(aa),bytes(bb),label+' '+key+' exact bytes');
    }
    assert.deepEqual([...ga.boundingBox.min.toArray(),...ga.boundingBox.max.toArray()],[...gb.boundingBox.min.toArray(),...gb.boundingBox.max.toArray()],label+' exact bounds');
    assert.deepEqual([...ga.boundingSphere.center.toArray(),ga.boundingSphere.radius],[...gb.boundingSphere.center.toArray(),gb.boundingSphere.radius],label+' exact sphere');
    const material=value=>JSON.stringify(properties(value));
    const ma=Array.isArray(a.material)?a.material:[a.material],mb=Array.isArray(b.material)?b.material:[b.material];
    assert.equal(JSON.stringify(ma.map(material)),JSON.stringify(mb.map(material)),label+' material/texture properties');
  }
  assert.equal(a.children.length,b.children.length,label+' child count');a.children.forEach((child,index)=>equivalent(child,b.children[index],label+'/'+index));
}
(async()=>{
  const report=[];
  for(const name of ['tramtrace','dash','pi','telemetry']){
    const old=await load(name,false),current=await load(name,true);
    equivalent(old.model.group,current.model.group,name);
    assert.equal(old.model.parts.length,current.model.parts.length);
    const references=model=>model.parts.map(part=>({...part,object:part.object.name}));
    assert.equal(JSON.stringify(references(old.model)),JSON.stringify(references(current.model)),name+' exact motion/reference metadata');
    old.motion.prepare(old.model.parts,{name});current.motion.prepare(current.model.parts,{name});
    const matrices=model=>{model.group.updateMatrixWorld(true);const result=[];model.group.traverse(object=>result.push(object.matrixWorld.toArray()));return result;};
    for(const phase of [0,.03,.125,.25,.5,.75,1,.7,.2,0]){
      old.motion.apply(old.model.parts,phase);current.motion.apply(current.model.parts,phase);
      assert.deepEqual(matrices(old.model),matrices(current.model),name+' exact reversible motion at '+phase);
    }
    assert.equal(current.stats.hintedBounds,current.hints.geometries,name+' every geometry avoids a bounds scan');
    assert.ok(current.stats.attributeBuffers<old.stats.attributeBuffers,name+' reduces GPU buffer objects');
    report.push({name,before:old.stats.attributeBuffers,after:current.stats.attributeBuffers,bounds:current.stats.hintedBounds,geometryMs:{before:old.stats.geometry,after:current.stats.geometry}});
    if(name==='tramtrace'){
      const stale=await load(name,true,true);
      assert.equal(stale.stats.hintedBounds,0,'Same-size/count hints from another pack revision must be ignored');
      assert.equal(stale.stats.attributeBuffers,old.stats.attributeBuffers,'Stale hints cannot merge GPU attributes');
      equivalent((await load(name,false)).model.group,stale.model.group,'stale-fingerprint fallback');
    }
  }
  const generated=source.slice(source.indexOf('/* BEGIN GENERATED EXACT HERO GEOMETRY HINTS */'));
  console.log(JSON.stringify({result:'PASS exact triangle/index/attribute bytes, materials, bounds, matrices, parts and motion',generatedBytes:Buffer.byteLength(generated),generatedGzipBytes:zlib.gzipSync(generated).length,models:report},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
