/* Dash's photographed device around its source PCB. Millimetres throughout.
 * Base/lid are the supplied, unchanged STL meshes, registered by three PCB
 * mounting holes. Off-board hardware is dimensioned, photo-informed geometry;
 * the approximate battery position is illustrative. See device-sources.json.
 */
(() => {
  'use strict';
  const ROOT = '/assets/models/hardware/dash/';
  async function add(T, {group, parts, units}) {
    const rotation = new T.Matrix4().set(0,-1,0,0, 0,0,1,0, -1,0,0,0, 0,0,0,1);
    const nativeQuaternion = new T.Quaternion().setFromRotationMatrix(rotation);
    const translation = new T.Vector3(1.757143333,-6,.048336667);
    const nativePoint = xyz => new T.Vector3(...xyz).applyMatrix4(rotation).add(translation);
    const nativeVector = xyz => new T.Vector3(...xyz).applyMatrix4(rotation);
    const metal = new T.MeshStandardMaterial({color:0xc6cbd0,metalness:.86,roughness:.31,envMapIntensity:.8});
    const plateMetal = metal.clone(); plateMetal.roughness=.5;
    const addPart = (object, ref, value, position, orientation, offset, delay=.08, end=.8) => {
      object.name=ref;
      object.position.copy(nativePoint(position).divideScalar(units));
      object.quaternion.copy(nativeQuaternion).multiply(orientation || new T.Quaternion());
      object.scale.setScalar(1/units);
      Object.assign(object.userData,{partRef:ref,mechanicalRole:ref,nativePositionMm:position.slice()});
      object.traverse(mesh=>{if(mesh.isMesh){mesh.userData.partRef=ref;mesh.castShadow=false;}});
      group.add(object);
      const baseQuaternion=object.quaternion.clone(), travel=nativeVector(offset).divideScalar(units);
      parts.push({object,ref,value,base:object.position.clone(),offset:travel,
        motion:{mechanical:true,offset:travel,baseQuaternion,targetQuaternion:baseQuaternion.clone(),delay,end,spin:0,arc:0}});
      return object;
    };
    const quaternion = (x,y,z) => new T.Quaternion().setFromEuler(new T.Euler(x,y,z));
    const box = (parent,size,position,material=metal) => {
      const mesh=new T.Mesh(new T.BoxGeometry(...size),material);mesh.position.set(...position);parent.add(mesh);return mesh;
    };
    const disc = (parent,radius,height,position,material=metal) => {
      const geometry=new T.CylinderGeometry(radius,radius,height,40);geometry.rotateX(Math.PI/2);
      const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);parent.add(mesh);return mesh;
    };
    async function housing(file) {
      const response=await fetch(ROOT+file);if(!response.ok)throw new Error('Dash housing unavailable');
      const buffer=await response.arrayBuffer(),view=new DataView(buffer);
      if(buffer.byteLength<84)throw new Error('Invalid Dash STL');
      const count=view.getUint32(80,true);if(buffer.byteLength!==84+count*50)throw new Error('Invalid Dash STL length');
      const positions=new Float32Array(count*9),normals=new Float32Array(count*9);
      for(let face=0;face<count;face++){
        const at=84+face*50;
        for(let vertex=0;vertex<3;vertex++)for(let axis=0;axis<3;axis++){
          positions[face*9+vertex*3+axis]=view.getFloat32(at+12+vertex*12+axis*4,true);
          normals[face*9+vertex*3+axis]=view.getFloat32(at+axis*4,true);
        }
      }
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.computeBoundingBox();
      const centre=geometry.boundingBox.getCenter(new T.Vector3()),bounds=geometry.boundingBox.clone();geometry.translate(-centre.x,-centre.y,-centre.z);
      const material=new T.MeshPhysicalMaterial({color:0xcbd8de,metalness:.02,roughness:.18,transparent:true,opacity:.075,depthWrite:false,side:T.DoubleSide,clearcoat:.65,clearcoatRoughness:.12,envMapIntensity:.4});
      const object=new T.Group(),mesh=new T.Mesh(geometry,material);mesh.renderOrder=2;object.add(mesh);
      // Retain the exact mesh; outline only its sharp features, including apertures.
      const edges=new T.LineSegments(new T.EdgesGeometry(geometry,34),new T.LineBasicMaterial({color:0xa9bbc4,transparent:true,opacity:.36,depthWrite:false}));edges.renderOrder=3;object.add(edges);
      Object.assign(object.userData,{sourceFile:file,sourceTriangles:count,sourceBoundsMm:{min:bounds.min.toArray(),max:bounds.max.toArray()}});
      return {object,centre:centre.toArray()};
    }
    const [base,lid]=await Promise.all([housing('base.stl'),housing('lid.stl')]);
    addPart(base.object,'Housing base','Clear housing · original STL',base.centre,null,[0,0,-13],.02,.6);
    addPart(lid.object,'Magnetic lid','Clear magnetic lid · original STL',lid.centre,null,[0,0,22],0,.55);

    const oled=window.DashComponents.create(T,'oled');
    const oledOrientation=quaternion(Math.PI/2,0,0),activeLocal=new T.Vector3(...oled.userData.activeCenterMm);
    const oledPosition=new T.Vector3(.02944,-25.65,26.6271).sub(activeLocal.clone().applyQuaternion(oledOrientation));
    addPart(oled,'OLED','GME12864-80 · 128 × 64 display',oledPosition.toArray(),oledOrientation,[0,-21,2],.18,.85);
    const speaker=window.DashComponents.create(T,'speaker');
    const speakerOrientation=quaternion(Math.PI/2,0,0).multiply(quaternion(0,Math.PI,0));
    addPart(speaker,'Speaker','C49247039 · 4 Ω / 3 W',[-.03826,17.4,26.6892],speakerOrientation,[0,21,3],.18,.85);
    const battery=window.DashComponents.create(T,'battery');
    const batteryOrientation=quaternion(0,0,-Math.PI/2),batteryPosition=[0,-5,19];
    addPart(battery,'Battery','192535 LiPo · 3.7 V / 1000 mAh · approx. 35 × 25 × 10 mm',batteryPosition,batteryOrientation,[-21,-2,14],.25,1);

    // BT1 already contains the original C131337 B2B-PH board header. Add only
    // its mating C398568 form factor, in the requested ivory finish.
    const header=parts.find(part=>part.ref==='BT1');
    if(!header)throw new Error('Dash battery header missing');
    header.value='C131337 · B2B-PH-K-S battery header';
    group.updateMatrixWorld(true);
    const headerBounds=new T.Box3().setFromObject(header.object),headerCentre=headerBounds.getCenter(new T.Vector3()).multiplyScalar(units);
    const plug=window.DashComponents.create(T,'plug');
    // The cable housing overlaps the header socket when mated; its wire exits
    // point upwards. The family catalogue gives an 8 mm mated overall height.
    const plugBoardPosition=new T.Vector3(headerCentre.x,1.6+8-6.85/2,headerCentre.z);
    const plugNativePosition=plugBoardPosition.clone().sub(translation).applyMatrix4(rotation.clone().transpose());
    const plugBoardQuaternion=quaternion(0,0,Math.PI);
    const plugNativeQuaternion=nativeQuaternion.clone().invert().multiply(plugBoardQuaternion);
    addPart(plug,'Battery plug','C398568 form · PHR-2 cable housing, ivory',plugNativePosition.toArray(),plugNativeQuaternion,[7,-5,17],.2,.9);

    const magnetAxes=[[-19,15],[19,15],[-19,-10],[19,-10]];
    for(const [name,z,lift] of [['Base magnets',43.1,-13],['Lid magnets',44.8,22]]){
      const magnets=new T.Group();for(const [x,y] of magnetAxes)disc(magnets,3,1.5,[x,y,0]);
      addPart(magnets,name,'Four retention magnets · approx. Ø6 × 1.5 mm',[0,0,z],null,[0,0,lift],0,.6);
    }
    const touch=new T.Group();
    box(touch,[29.6,29.6,.22],[0,0,-.18],plateMetal);
    disc(touch,9.8,.65,[0,0,.255],plateMetal);
    addPart(touch,'Touch plate','Metal capacitive touch electrode',[0,0,47.2],null,[0,0,30],0,.6);

    const wires=new T.Group();
    const nativeFromBoard=xyz=>new T.Vector3(...xyz).sub(translation).applyMatrix4(rotation.clone().transpose()).toArray();
    const wire=(points,colour,radius=.38)=>{
      const curve=new T.CatmullRomCurve3(points.map(point=>new T.Vector3(...point)));
      const material=new T.MeshStandardMaterial({color:new T.Color(colour).convertSRGBToLinear(),roughness:.7});
      wires.add(new T.Mesh(new T.TubeGeometry(curve,32,radius,6,false),material));
    };
    const oledHeader=new T.Vector3(...oled.userData.connectorCentreMm).applyQuaternion(oledOrientation).add(oledPosition);
    // A compact four-wire loom follows the side of the battery rather than
    // crossing through it. Wire routing is illustrative, based on the photos.
    for(const [i,colour] of [0xf28b32,0xeacb36,0x229c71,0x287ac9].entries()){
      const x=oledHeader.x+(i-1.5)*2.54;
      const end=nativeFromBoard([20.8,4,114.38+i*2.54-119]);
      wire([[x,oledHeader.y,oledHeader.z],[19.2+i*.65,-14,12],[20.3+i*.65,-9,9],end],colour,.4);
    }
    const batteryLeads=battery.userData.leadExitMm.map(point=>new T.Vector3(...point).applyQuaternion(batteryOrientation).add(new T.Vector3(...batteryPosition)).toArray());
    const plugLeads=plug.userData.wireExitMm.map(point=>new T.Vector3(...point).applyQuaternion(plugNativeQuaternion).add(plugNativePosition).toArray());
    for(let i=0;i<2;i++)wire([batteryLeads[i],[18.7+i*.9,-8,17],[19.3+i*.9,-15,13],plugLeads[1-i]],i?0x242528:0xb93f41,.34);
    for(let i=0;i<2;i++){
      const speakerEnd=nativeFromBoard([96.995-77,3,98.475+i*1.25-119]);
      wire([[10+i*.8,10.1,15],[18.3+i*.7,7.5,11],[20.7+i*.6,-4,7],speakerEnd],i?0x25262a:0xbe4147,.3);
    }
    const touchEnd=nativeFromBoard([97.8-77,3,110-119]);
    wire([[-13,-12,46.9],[-20,-11,40],[-21,-15,20],touchEnd],0xaa7852,.23);
    addPart(wires,'Wiring','Display, battery, speaker and touch wiring',[0,0,0],null,[14,-5,10],.18,.9);

    // Keep every board part's original local transform for exact reversal.
    // A parent centres the entire device around the viewer's orbit origin.
    const centred=new T.Group();centred.name='Dash device';centred.add(group);
    group.position.copy(nativePoint([0,0,24]).divideScalar(units).negate());
    centred.userData.sourceRegistration={rotation:[0,-1,0,0,0,1,-1,0,0],translationMm:translation.toArray(),units};
    return {group:centred,defaultRotation:{x:.43,y:-2.18,z:0}};
  }
  window.DashAssembly=Object.freeze({add});
})();
