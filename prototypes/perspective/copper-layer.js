/* Inspection overlay reuses the original laminate triangles and fabrication SVG. */
(() => {
  window.TramTraceCopperLayer = async (T, model) => {
    const pcb = model.group.getObjectByName('PCB'), silk = model.group.getObjectByName('Silkscreen');
    const [pads, mask, core] = pcb.children;
    const texture = await new T.TextureLoader().loadAsync('/assets/models/manufacturing/tramtrace/front-copper.svg');
    texture.encoding = T.sRGBEncoding; texture.anisotropy = 4;
    const src=core.geometry.attributes.position, idx=core.geometry.index, count=idx?idx.count:src.count;
    core.geometry.computeBoundingBox(); const top=core.geometry.boundingBox.max.y;
    const positions=[],normals=[],uv=[];
    for(let t=0;t<count;t+=3){const ids=[0,1,2].map(i=>idx?idx.getX(t+i):t+i);if(!ids.every(i=>Math.abs(src.getY(i)-top)<.000001))continue;for(const i of ids){const x=src.getX(i),z=src.getZ(i);positions.push(x,0,z);normals.push(0,1,0);uv.push(x+.5,.5-z/(94.55/207.81));}}
    if(positions.length<9)throw Error('Missing actual laminate top face');
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    const material=new T.MeshStandardMaterial({color:new T.Color('#b96d36').convertSRGBToLinear(),map:texture,metalness:.92,roughness:.34,transparent:true,alphaTest:.04,side:T.DoubleSide});
    const copper=new T.Mesh(g,material);copper.position.y=.00735;copper.receiveShadow=true;copper.name='Actual front copper';model.group.add(copper);
    const reveal={value:1.01};
    [pads,mask,silk].forEach((object,i)=>{object.material=object.material.clone();object.material.onBeforeCompile=shader=>{shader.uniforms.inspectionEdge=reveal;shader.vertexShader='varying float inspectionX;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ninspectionX=position.x;');shader.fragmentShader='uniform float inspectionEdge;\nvarying float inspectionX;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(inspectionX>inspectionEdge) discard;');};object.material.customProgramCacheKey=()=>`inspection-surface-${i}`;object.material.needsUpdate=true;});
    const original=core.material.color.clone();core.material=core.material.clone();
    return {set(amount){const n=Math.max(0,Math.min(1,amount));copper.visible=n>0;reveal.value=n? .51-1.02*n:1.01;core.material.color.copy(n?new T.Color('#8a8050').convertSRGBToLinear():original);},triangles:positions.length/9};
  };
})();
