/* Shared source-CAD factory. Requires Three.js, GLTFLoader and V2CadGeometry.
   Returns independent assemblies without mounting an inspector or animation loop. */
(() => {
  'use strict';
  async function loadAssembly(url) {
    const T=window.THREE;
    const response=await fetch(url); if(!response.ok)throw new Error('Assembly unavailable');
    const metadata=await response.json();
    const source=await new Promise((resolve,reject)=>new T.GLTFLoader().load(metadata.modelUrl,gltf=>resolve(gltf.scene),undefined,reject));
    const [x1,z1,x2,z2]=metadata.boundsMm;
    const units=Math.max(x2-x1,z2-z1);
    if(!(units>0))throw new Error('Invalid assembly bounds');
    source.scale.setScalar(metadata.scaleToMillimetres||1000);
    source.position.set(-(x1+x2)/2,0,-(z1+z2)/2);source.updateMatrixWorld(true);
    const {mergeReference,disposeSource}=window.V2CadGeometry;
    const group=new T.Group(),parts=[],materials=new Map();
    const footprints=new Map(metadata.footprints.map(part=>[part.ref,part]));
    // The manufactured Skylabs boards use blue soldermask. Keep this finish
    // separate from the untouched CAD palette and from component substrates.
    const skylabsBlue=metadata.slug==='skylabs-telemetry'||metadata.slug==='skylabs-ground-station';
    const style=original=>{
      if(materials.has(original.name))return materials.get(original.name);
      const material=original.clone(),roles=metadata.materials||{};
      material.transparent=false;material.opacity=1;material.depthWrite=true;
      if(original.name===roles.mask){if(skylabsBlue)material.color.setHex(0x043b7b);material.color.convertSRGBToLinear();material.roughness=.58;material.metalness=.03;material.side=T.DoubleSide;material.transparent=true;material.opacity=original.opacity;}
      else if(original.name===roles.core){material.color.convertSRGBToLinear();material.roughness=.86;material.metalness=0;}
      else if(original.name===roles.pads){material.roughness=.31;material.metalness=.8;}
      else {
        const colour=material.color,brightness=Math.max(colour.r,colour.g,colour.b);
        material.metalness=brightness>.3&&brightness-Math.min(colour.r,colour.g,colour.b)<.15?.65:.03;
        material.roughness=material.metalness>.2?.37:.7;
      }
      material.envMapIntensity=material.metalness>.2?.45:.12;
      materials.set(original.name,material);return material;
    };
    const fixed=[],moving=[];
    const classify=object=>{
      if(footprints.has(object.name)&&!metadata.unpopulated){moving.push(object);return;}
      if(object.isMesh){fixed.push(object);return;}
      object.children.forEach(classify);
    };
    source.children.forEach(classify);
    // Keep board artwork in the GLB when no SVG is available.
    const hiddenMaterial=metadata.silk?.frontUrl?metadata.materials?.silk:'';
    const board=mergeReference(T,fixed,new T.Vector3(),units,style,hiddenMaterial);
    board.name='PCB';group.add(board);
    // Large maps retain each LED placement while moving the repeated bank as
    // one physical layer, avoiding hundreds of separate material draws.
    const ledRoots=moving.filter(object=>/^(LED|D)\d+$/.test(object.name)&&/WS2812|SK6812|RGB|2020/i.test(footprints.get(object.name).value));
    const bank=ledRoots.length>50?new Set(ledRoots):new Set();
    const addPart=(roots,ref,footprint)=>{
      const base=new T.Vector3().setFromMatrixPosition(roots[0].matrixWorld).divideScalar(units);
      const object=mergeReference(T,roots,base,units,style,hiddenMaterial);
      object.name=ref;object.userData.partRef=ref;group.add(object);
      const sign=footprint?.side==='back'?-1:1;
      const lift=/^U\d/.test(ref)?.22:/^(J|P|SW|RV|BT)\d/.test(ref)?.17:.11;
      const offset=new T.Vector3(0,sign*lift,0);
      parts.push({object,base:base.clone(),offset,ref,value:footprint?.value||'RGB pixels'});
    };
    moving.filter(object=>!bank.has(object)).forEach(object=>addPart([object],object.name,footprints.get(object.name)));
    if(bank.size)addPart([...bank],'LED bank',{value:bank.size+' RGB pixels'});
    if(metadata.dimensionedLedFallback){
      // Preserve the existing dimensioned Metroboard package representation
      // where its referenced supplier model is absent. Positions remain CAD-derived.
      const fallback=metadata.dimensionedLedFallback;
      const leds=metadata.footprints.filter(part=>part.value===fallback.value&&!part.modelExported);
      const roots=[],size=2;
      const body=new T.MeshStandardMaterial({color:0xe6e4d7,roughness:.64});
      const windowMaterial=new T.MeshStandardMaterial({color:0xcdbb76,roughness:.48});
      const solder=new T.MeshStandardMaterial({color:0xb8bdc0,metalness:.8,roughness:.33});
      const notch=new T.MeshStandardMaterial({color:0x333536,roughness:.72});
      const box=(parent,dimensions,position,material)=>{const mesh=new T.Mesh(new T.BoxGeometry(...dimensions),material);mesh.position.set(...position);parent.add(mesh);};
      for(const part of leds){
        const root=new T.Group(),[x,z,angle]=part.atMm;
        root.position.set(x-(x1+x2)/2,metadata.thicknessMm,z-(z1+z2)/2);root.rotation.y=angle*Math.PI/180;
        box(root,[size,.72,size],[0,.38,0],body);
        box(root,[size*.56,.035,size*.56],[0,.765,0],windowMaterial);
        for(const px of [-.47,.47])for(const pz of [-.47,.47])box(root,[size*.28,.035,size*.34],[px*size,.055,pz*size],solder);
        box(root,[size*.13,.028,size*.13],[-size*.32,.79,-size*.32],notch);
        root.updateMatrixWorld(true);roots.push(root);
      }
      if(roots.length){
        const base=new T.Vector3(),object=mergeReference(T,roots,base,units,material=>material,null);
        object.name='LED bank';object.userData.partRef='LED bank';group.add(object);
        parts.push({object,base,offset:new T.Vector3(0,.09,0),ref:'LED bank',value:leds.length+' RGB pixels'});
        roots.forEach(root=>root.traverse(mesh=>mesh.geometry?.dispose()));
      }
    }
    if(metadata.connector&&!parts.some(part=>part.ref===metadata.connector.node)){
      const connector=metadata.connector;
      const original=await new Promise((resolve,reject)=>new T.GLTFLoader().load(connector.modelUrl,gltf=>resolve(gltf.scene),undefined,reject));
      const plug=original.getObjectByName(connector.node);if(!plug)throw new Error('Connector geometry missing');
      plug.parent.remove(plug);plug.position.set(...connector.positionBoardLocalMm);plug.rotation.set(...connector.rotationRadians);plug.scale.setScalar(connector.scaleToMillimetres);plug.updateMatrixWorld(true);
      const base=plug.position.clone().divideScalar(units);
      const metal=new T.MeshStandardMaterial({color:0xb6bec0,metalness:.85,roughness:.32,side:T.DoubleSide});
      const object=mergeReference(T,[plug],base,units,style,'',metal);object.name=connector.node;group.add(object);
      parts.push({object,base:base.clone(),offset:new T.Vector3(0,.15,-.2),ref:connector.node,value:'USB-C plug'});disposeSource(plug);disposeSource(original);
    }
    if(metadata.silk?.frontUrl){
      const texture=await new Promise((resolve,reject)=>new T.TextureLoader().load(metadata.silk.frontUrl,resolve,undefined,reject));
      texture.encoding=T.sRGBEncoding;texture.anisotropy=4;
      const geo=new T.PlaneGeometry((x2-x1)/units,(z2-z1)/units);geo.rotateX(-Math.PI/2);
      const mat=new T.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.08,depthWrite:false,roughness:.95,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
      const silk=new T.Mesh(geo,mat);silk.position.y=(metadata.thicknessMm+.025)/units;group.add(silk);
      if(metadata.silk.backUrl){
        const back=await new Promise((resolve,reject)=>new T.TextureLoader().load(metadata.silk.backUrl,resolve,undefined,reject));
        back.encoding=T.sRGBEncoding;back.anisotropy=4;
        const backGeo=geo.clone(),backMat=mat.clone();backMat.map=back;
        const underside=new T.Mesh(backGeo,backMat);underside.position.y=-.025/units;group.add(underside);
      }
    }
    disposeSource(source);group.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());
    return {group,parts,metadata,span:Math.max(size.x,size.y,size.z),centre:bounds.getCenter(new T.Vector3())};
  }
  window.V2HardwareModels=Object.freeze({load:loadAssembly});
})();
