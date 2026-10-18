/* Shared v2 assembly data. Original enclosure bytes and PCB millimetre datums
 * are kept intact; separate arrays avoid copying a second combined binary. */
let threePromise,modelPromise;
export function loadThree(){
 if(window.THREE)return Promise.resolve(window.THREE);
 return threePromise ||= new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/vendor/three.min.js';script.onload=()=>{if(window.THREE)resolve(window.THREE);else{script.remove();threePromise=null;reject(new Error('3D unavailable'));}};script.onerror=()=>{script.remove();threePromise=null;reject(new Error('3D unavailable'));};document.head.append(script);});
}
async function binary(url){
 if((url.includes('kiku-pcb/')||url.includes('kiku-hardware/'))&&typeof DecompressionStream==='function'){
  try{const response=await fetch(url.replace(/(\?[^#]*)?$/,'.gz$1'));if(response.ok&&response.body)return await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}catch(error){/* Raw data remains the compatibility/retry path. */}
 }
 const response=await fetch(url);if(!response.ok)throw new Error('CAD download unavailable');return response.arrayBuffer();
}
export function loadKikuModel(){
 const urls=['/assets/models/kiku/assembly.json','/assets/models/kiku/assembly.bin','/assets/models/kiku-pcb/pcb.json?v=finish-20261018','/assets/models/kiku-pcb/pcb.bin?v=finish-20261018','/assets/models/kiku-hardware/hardware.json','/assets/models/kiku-hardware/hardware.bin'];
 return modelPromise ||= Promise.all(urls.map(async(url,index)=>{if(index%2)return binary(url);const response=await fetch(url);if(!response.ok)throw new Error('CAD download unavailable');return response.json();})).then(([enclosure,enclosureBinary,pcb,pcbBinary,hardware,hardwareBinary])=>({enclosure,pcb,hardware,center:enclosure.center,parts:[...enclosure.parts.map(part=>({...part,binary:enclosureBinary})),...pcb.parts.map(part=>({...part,group:'pcb',explode:[0,0,0],binary:pcbBinary})),...hardware.parts.map(part=>({...part,binary:hardwareBinary}))]})).catch(error=>{modelPromise=null;throw error;});
}
export function makeKikuMesh(T,part,onTextureLoad=()=>{}){
 const geometry=new T.BufferGeometry();
 for(const name of ['position','normal','uv']){const field=part[name];if(field)geometry.setAttribute(name,new T.BufferAttribute(new Float32Array(part.binary,field.byteOffset,field.count*field.itemSize),field.itemSize));}
 geometry.setIndex(new T.BufferAttribute(new Uint32Array(part.binary,part.index.byteOffset,part.index.count),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const materialOptions={color:part.colorLinear?new T.Color(...part.colorLinear):new T.Color(part.color).convertSRGBToLinear(),roughness:part.roughness??.65,metalness:part.metalness??0,opacity:part.opacity??1,transparent:(part.opacity??1)<1,depthWrite:(part.opacity??1)>=1,side:T.DoubleSide};
 if(part.unlit){delete materialOptions.roughness;delete materialOptions.metalness;}
 const material=new (part.unlit?T.MeshBasicMaterial:T.MeshStandardMaterial)(materialOptions);
 if(part.texture){const texture=new T.TextureLoader().load(part.texture,onTextureLoad);texture.encoding=T.sRGBEncoding;texture.magFilter=T.NearestFilter;texture.minFilter=T.LinearFilter;material.map=texture;}
 const mesh=new T.Mesh(geometry,material);mesh.userData.part=part;
 // Both board coatings are translucent batches: draw the mask before its silk.
 if(part.id==='pcb_soldermask')mesh.renderOrder=1;if(part.id==='pcb_silkscreen')mesh.renderOrder=2;
 return mesh;
}
