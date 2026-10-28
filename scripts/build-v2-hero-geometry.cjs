/* Build exact bounds and duplicate-buffer hints from the committed hero packs.
 * Geometry transports stay byte-identical. Hints are appended to the existing
 * loader so they cost no extra request or runtime geometry hash/vertex scan.
 * node scripts/build-v2-hero-geometry.cjs [--verify]
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),T=require('../assets/vendor/three.min.js');
const marker='/* BEGIN GENERATED EXACT HERO GEOMETRY HINTS */';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function build(name){
  const bytes=fs.readFileSync(path.join(root,'assets/models/hero',name+'.bin'));
  const dataStart=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(8))),shared={},bounds={},known=new Map();
  let attributes=0,duplicates=0,duplicateBytes=0;
  for(const geometry of data.geometries){
    for(const item of [...Object.values(geometry.attributes),geometry.index]){
      attributes++;
      const raw=bytes.subarray(dataStart+item.byteOffset,dataStart+item.byteOffset+item.byteLength);
      const key=[item.arrayType,item.itemSize||1,!!item.normalized,item.byteLength,digest(raw)].join(':');
      if(known.has(key)){
        const first=known.get(key);shared[item.byteOffset]=first;
        if(first!==item.byteOffset){duplicates++;duplicateBytes+=item.byteLength;}
      }else known.set(key,item.byteOffset);
    }
    const position=geometry.attributes.position,offset=shared[position.byteOffset]??position.byteOffset;
    if(bounds[offset])continue;
    const Constructor=globalThis[position.arrayType],raw=bytes.subarray(dataStart+position.byteOffset,dataStart+position.byteOffset+position.byteLength);
    const array=new Constructor(raw.buffer,raw.byteOffset,raw.byteLength/Constructor.BYTES_PER_ELEMENT);
    const copy=new T.BufferGeometry();copy.setAttribute('position',new T.BufferAttribute(array,position.itemSize,!!position.normalized));
    copy.computeBoundingBox();copy.computeBoundingSphere();
    bounds[offset]=[...copy.boundingBox.min.toArray(),...copy.boundingBox.max.toArray(),...copy.boundingSphere.center.toArray(),copy.boundingSphere.radius];
  }
  return {hints:{sourceSha256:digest(bytes),bytes:bytes.length,dataBytes:bytes.length-dataStart,geometries:data.geometries.length,shared,bounds},stats:{attributes,uniqueAttributes:known.size,duplicates,duplicateBytes,bounds: Object.keys(bounds).length}};
}
function main(){
  const hints={},report={};for(const name of ['tramtrace','dash','pi','telemetry']){const result=build(name);hints[name]=result.hints;report[name]=result.stats;}
  const revisions=Object.fromEntries(Object.entries(hints).map(([name,hint])=>[name,hint.sourceSha256.slice(0,12)]));
  const withRevisions=source=>{
    const expression=/const packRevisions = Object\.freeze\(\{[^\n]*\}\);/g;
    if([...source.matchAll(expression)].length!==1)throw new Error('Expected exactly one generated hero URL fingerprint table');
    return source.replace(expression,'const packRevisions = Object.freeze('+JSON.stringify(revisions)+');');
  };
  const filename=path.join(root,'assets/v2-hero-assets.js'),old=fs.readFileSync(filename,'utf8');
  const generated=marker+'\nwindow.V2HeroGeometryHints='+JSON.stringify(hints)+';\n/* END GENERATED EXACT HERO GEOMETRY HINTS */\n';
  const source=withRevisions(old.split(marker)[0].trimEnd()+'\n\n'+generated);
  const startupPath=path.join(root,'assets/v2-hero-startup.js'),oldStartup=fs.readFileSync(startupPath,'utf8'),startup=withRevisions(oldStartup);
  if(process.argv.includes('--verify')){
    if(source.replace(/\r\n/g,'\n')!==old.replace(/\r\n/g,'\n'))throw new Error('Hero geometry hints are stale; regenerate after changing packs');
    if(startup.replace(/\r\n/g,'\n')!==oldStartup.replace(/\r\n/g,'\n'))throw new Error('Early hero URL fingerprints differ from source packs; regenerate');
  }else {fs.writeFileSync(filename,source);fs.writeFileSync(startupPath,startup);}
  console.log(JSON.stringify({mode:process.argv.includes('--verify')?'verified':'written',hintBytes:Buffer.byteLength(generated),models:report},null,2));
}
module.exports={build};if(require.main===module)main();
