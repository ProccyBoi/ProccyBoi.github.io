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
    const nativeFromBoard=xyz=>new T.Vector3(...xyz).sub(translation).applyMatrix4(rotation.clone().transpose()).toArray();
    // Expand the authored PCB layout into a legible plane of individual parts.
    // Packing uses actual component bounds, so large modules and neighbouring
    // passives separate rather than receiving the old shallow, uniform lift.
    group.updateMatrixWorld(true);
    const pcbParts=parts.map(part=>{
      const bounds=new T.Box3().setFromObject(part.object),size=bounds.getSize(new T.Vector3()).multiplyScalar(units);
      const centre=nativeFromBoard(bounds.getCenter(new T.Vector3()).multiplyScalar(units).toArray());
      return {part,centre,size:[size.z,size.x,size.y],target:[centre[0]*2.15,centre[1]*2.15]};
    });
    for(let iteration=0;iteration<160;iteration++){
      let overlaps=0;
      for(let i=0;i<pcbParts.length;i++)for(let j=i+1;j<pcbParts.length;j++){
        const a=pcbParts[i],b=pcbParts[j];
        const dx=a.target[0]-b.target[0],dy=a.target[1]-b.target[1];
        const ox=(a.size[0]+b.size[0])/2+2.5-Math.abs(dx),oy=(a.size[1]+b.size[1])/2+2.5-Math.abs(dy);
        if(ox<=0||oy<=0)continue;
        const axis=ox<oy?0:1,delta=(axis===0?ox:oy)/2+.005,sign=Math.sign(axis===0?dx:dy)||(i%2?1:-1);
        a.target[axis]+=sign*delta;b.target[axis]-=sign*delta;overlaps++;
      }
      if(!overlaps)break;
    }
    const pcbExtent=[0,0];
    for(const {part,centre,size,target} of pcbParts){
      pcbExtent[0]=Math.max(pcbExtent[0],Math.abs(target[0])+size[0]/2);
      pcbExtent[1]=Math.max(pcbExtent[1],Math.abs(target[1])+size[1]/2);
      const travel=nativeVector([target[0]-centre[0],target[1]-centre[1],33+size[2]/2-centre[2]]).divideScalar(units);
      const baseQuaternion=part.object.quaternion.clone();part.offset=travel;
      part.motion={mechanical:true,offset:travel,baseQuaternion,targetQuaternion:baseQuaternion.clone(),delay:.28,end:1,spin:0,arc:0};
    }
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
    addPart(base.object,'Housing base','Clear housing · original STL',base.centre,null,[0,0,-70],0,.65);
    addPart(lid.object,'Magnetic lid','Clear magnetic lid · original STL',lid.centre,null,[0,0,80],0,.65);

    const oled=window.DashComponents.create(T,'oled');
    const oledOrientation=quaternion(Math.PI/2,0,0),activeLocal=new T.Vector3(...oled.userData.activeCenterMm);
    const oledPosition=new T.Vector3(.02944,-24.9,26.6271).sub(activeLocal.clone().applyQuaternion(oledOrientation));
    addPart(oled,'OLED','GME12864-80 · 128 × 64 display',oledPosition.toArray(),oledOrientation,[0,-pcbExtent[1]-15,8],.12,.9);
    const speaker=window.DashComponents.create(T,'speaker');
    const speakerOrientation=quaternion(Math.PI/2,0,0).multiply(quaternion(0,Math.PI,0));
    const speakerPosition=[-.03826,17.3,26.6892];
    addPart(speaker,'Speaker','C49247039 · 4 Ω / 3 W',speakerPosition,speakerOrientation,[0,pcbExtent[1]+20,8],.12,.9);
    const battery=window.DashComponents.create(T,'battery');
    const batteryOrientation=quaternion(0,0,-Math.PI/2),batteryPosition=[0,-5,19];
    addPart(battery,'Battery','192535 LiPo · 3.7 V / 1000 mAh · approx. 35 × 25 × 10 mm',batteryPosition,batteryOrientation,[-pcbExtent[0]-32,0,36],.15,.95);

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
    const plugTarget=new T.Vector3(pcbExtent[0]+30,-pcbExtent[1]-28,25);
    addPart(plug,'Battery plug','C398568 form · PHR-2 cable housing, ivory',plugNativePosition.toArray(),plugNativeQuaternion,plugTarget.sub(plugNativePosition).toArray(),.15,.95);

    const magnetAxes=[[-19,15],[19,15],[-19,-10],[19,-10]];
    for(const [name,z,lift] of [['Base magnet',43.1,-42],['Lid magnet',44.8,90]]){
      magnetAxes.forEach(([x,y],index)=>{
        const magnet=new T.Group();disc(magnet,3,1.5,[0,0,0]);
        addPart(magnet,name+' '+(index+1),'Retention magnet · approx. Ø6 × 1.5 mm',[x,y,z],null,[Math.sign(x)*12,Math.sign(y)*10,lift],.02,.85);
      });
    }
    const touch=new T.Group();box(touch,[29.6,29.6,.22],[0,0,0],plateMetal);
    addPart(touch,'Touch plate','Metal capacitive touch electrode',[0,0,47.02],null,[0,0,100],0,.75);
    const touchDisc=new T.Group();disc(touchDisc,9.8,.65,[0,0,0],plateMetal);
    addPart(touchDisc,'Touch disc','Circular metal touch surface',[0,0,47.455],null,[0,0,116],0,.8);

    const displayWires=new T.Group(),batteryWires=new T.Group(),speakerWires=new T.Group(),touchWire=new T.Group();
    const jumperPlastic=new T.MeshStandardMaterial({color:new T.Color(0x17191b).convertSRGBToLinear(),roughness:.78});
    const wire=(parent,points,colour,radius=.38)=>{
      const curve=new T.CatmullRomCurve3(points.map(point=>new T.Vector3(...point)));
      const material=new T.MeshStandardMaterial({color:new T.Color(colour).convertSRGBToLinear(),roughness:.7});
      parent.add(new T.Mesh(new T.TubeGeometry(curve,40,radius,8,false),material));
    };
    const oledHeader=new T.Vector3(...oled.userData.connectorCentreMm).applyQuaternion(oledOrientation).add(oledPosition);
    // The top-facing display header and four arched jumper leads follow the
    // photographs. Keep the loom above the pouch until it drops to J2.
    for(const [i,colour] of [0xf28b32,0xeacb36,0x229c71,0x287ac9].entries()){
      const contact=oled.userData.headerContactPointsMm?.[i];
      const start=contact?new T.Vector3(...contact).applyQuaternion(oledOrientation).add(oledPosition):new T.Vector3(oledHeader.x+(i-1.5)*2.54,oledHeader.y,oledHeader.z);
      const end=nativeFromBoard([20.8,16,114.38+i*2.54-119]);
      // Four individual black female jumper shells are visible at both ends
      // in the photos. They travel with the loom when the pins are unplugged.
      box(displayWires,[2.4,7.4,2.4],[start.x,start.y+1.5,start.z],jumperPlastic);
      box(displayWires,[2.4,2.4,7.4],[end[0],end[1],end[2]-3.7],jumperPlastic);
      start.y+=5.2;
      wire(displayWires,[start.toArray(),[start.x,-7,38],[16.5+i*.9,-7,33],[20.3+i*.65,-20.5,27],end],colour,.48);
    }
    const batteryLeads=battery.userData.leadExitMm.map(point=>new T.Vector3(...point).applyQuaternion(batteryOrientation).add(new T.Vector3(...batteryPosition)).toArray());
    const plugLeads=plug.userData.wireExitMm.map(point=>new T.Vector3(...point).applyQuaternion(plugNativeQuaternion).add(plugNativePosition).toArray());
    for(let i=0;i<2;i++)wire(batteryWires,[batteryLeads[i],[18.7+i*.9,-8,17],[19.3+i*.9,-15,13],plugLeads[1-i]],i?0x242528:0xb93f41,.34);
    const speakerLeads=speaker.userData.leadExitMm.map(point=>new T.Vector3(...point).applyQuaternion(speakerOrientation).add(new T.Vector3(...speakerPosition)).toArray());
    for(let i=0;i<2;i++){
      const speakerEnd=nativeFromBoard([96.995-77,3,98.475+i*1.25-119]);
      wire(speakerWires,[speakerLeads[i],[18.3+i*.7,7.5,11],[20.7+i*.6,-4,7],speakerEnd],i?0x25262a:0xbe4147,.3);
    }
    const touchEnd=nativeFromBoard([97.8-77,3,110-119]);
    wire(touchWire,[[-13,-12,46.9],[-20,-11,40],[-21,-15,20],touchEnd],0xaa7852,.23);
    addPart(displayWires,'Display wire loom','Four-pin OLED jumper leads',[0,0,0],null,[pcbExtent[0]+30,0,55],.08,.9);
    addPart(batteryWires,'Battery wire pair','LiPo positive and ground leads',[0,0,0],null,[pcbExtent[0]+30,35,75],.08,.9);
    addPart(speakerWires,'Speaker wire pair','Speaker leads to LS1',[0,0,0],null,[pcbExtent[0]+30,15,5],.08,.9);
    addPart(touchWire,'Touch wire','Capacitive electrode lead',[0,0,0],null,[pcbExtent[0]+30,60,40],.08,.9);

    // Keep every board part's original local transform for exact reversal.
    // A parent centres the entire device around the viewer's orbit origin.
    const centred=new T.Group();centred.name='Dash device';centred.add(group);
    group.position.copy(nativePoint([0,0,24]).divideScalar(units).negate());
    centred.userData.sourceRegistration={rotation:[0,-1,0,0,0,1,-1,0,0],translationMm:translation.toArray(),units};
    return {group:centred,defaultRotation:{x:.43,y:-2.18,z:0}};
  }
  window.DashAssembly=Object.freeze({add});
})();
