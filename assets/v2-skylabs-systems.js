/* Competition installation: existing Skylabs PCB and trainer ESC/servos.
 * All coordinates are aircraft-local metres; mounting positions are illustrative. */
(()=>{'use strict';
 function create(T,boardModel){
  const group=new T.Group();group.name='competition-avionics';group.userData.illustrativeMounts=true;
  const board=new T.Group();board.name='Central Skylabs telemetry PCB';board.position.set(.115,-.025,0);group.add(board);
  const size=Math.max(boardModel.metadata.boundsMm[2]-boardModel.metadata.boundsMm[0],boardModel.metadata.boundsMm[3]-boardModel.metadata.boundsMm[1])/1000;
  if(Math.abs(size-.07303)>1e-6)throw Error('Unexpected telemetry dimensions');
  boardModel.group.scale.setScalar(size);board.add(boardModel.group);V2ProductStudio.applyMaterials(boardModel,'telemetry',T);
  board.userData={source:boardModel.metadata.source,components:boardModel.metadata.modelledComponentCount,scaleToMetres:size};
  const trainer=V3AircraftElectronics.create(T);trainer.setLanding();
  const esc=trainer.anchors.esc;group.add(esc);esc.position.set(.605,-.045,0);esc.quaternion.identity();
  // The wing servo outputs sit above the fixed spar, allowing a straight
  // pushrod to reach the aileron without crossing through that spar.
  const placements=[['Left flaperon servo',[.365,.006,.67]],['Right flaperon servo',[.365,.006,-.67]],['Elevator servo',[-.63,-.024,.15]],['Rudder servo',[-.63,.13,0]]];
  const servos=placements.map(([name,position])=>{const object=trainer.group.getObjectByName(name+' — KST-X10 Pro-B, illustrative geometry');if(!object)throw Error('Trainer servo missing');group.add(object);object.position.set(...position);object.quaternion.identity();if(name==='Rudder servo')object.rotation.x=Math.PI/2;return object;});
  const metal=new T.MeshStandardMaterial({color:0x687888,roughness:.45,metalness:.7});
  for(const x of [-.030,.030])for(const z of [-.022,.022]){const mount=new T.Mesh(new T.CylinderGeometry(.002,.002,.05575,10),metal);mount.name='Illustrative telemetry standoff';mount.position.set(.115+x,-.052875,z);group.add(mount);}
  function wire(name,points,colour,radius=.00065){const mesh=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),32,radius,5,false),new T.MeshStandardMaterial({color:colour,roughness:.7,envMapIntensity:.15}));mesh.name=name;group.add(mesh);return mesh;}
  const wires=[];
  wires.push(wire('Telemetry to ESC sidewall signal harness',[[.15,-.02,-.02],[.16,-.025,-.047],[.56,-.025,-.047],[.586,-.043,.017]],0x7489a3));
  for(const sign of [-1,1])wires.push(wire('Wing servo signal harness',[[.12,-.02,sign*.02],[.17,.025,sign*.045],[.35,.025,sign*.06],[.349,.005,sign*.67]],0x7489a3));
  wires.push(wire('Tail control harness',[[.08,-.02,0],[.03,-.035,0],[-.55,-.035,0],[-.646,-.025,.15]],0x7489a3));
  wires.push(wire('Rudder control harness',[[-.55,-.035,0],[-.61,.03,0],[-.646,.13,-.001]],0x7489a3));
  for(let i=0;i<3;i++)wires.push(wire('ESC motor phase '+i,[[.634,-.04,(i-1)*.01],[.68,-.02,(i-1)*.012],[.75,0,(i-1)*.008]],[0x916c36,0x395e8f,0x963e3e][i],.0009));
  for(const part of [esc,...servos])part.traverse(mesh=>{if(mesh.isMesh){const restore=m=>{m=m.clone();m.opacity=1;m.transparent=!!m.map;m.depthWrite=true;m.envMapIntensity=.3;m.needsUpdate=true;return m;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(restore):restore(mesh.material);}});
  // The trainer-derived servo bodies already contain output horns. Add the
  // matching surface horn and connect to an actual arm pin instead of ending
  // the pushrod in open space. Surface positions are illustrative, located on
  // the competition model's measured aileron/elevator/rudder bounds.
  const controls=[
   {name:'Left flaperon',base:[.2882,.014,0],normal:[0,1,0]},
   {name:'Right flaperon',base:[.2882,.014,0],normal:[0,1,0]},
   {name:'Elevator',base:[-.6855,-.017,0],normal:[0,1,0]},
   {name:'Rudder',base:[-.725,.157,.0071],normal:[0,0,1]}
  ];
  const horns=[],rods=[];
  group.updateMatrixWorld(true);
  controls.forEach((control,i)=>{
   const servo=servos[i],output=servo.getObjectByName(placements[i][0]+' pushrod pin');
   if(!output)throw Error('Servo output pin missing');
   const a=group.worldToLocal(output.getWorldPosition(new T.Vector3()));
   const normal=new T.Vector3(...control.normal),base=new T.Vector3(...control.base);
   if(i!==3)base.z=a.z;
   const b=base.clone().addScaledVector(normal,.010);
   const horn=new T.Group();horn.name='Illustrative '+control.name+' control-surface horn';horn.position.copy(base);horn.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal);group.add(horn);
   const polymer=new T.MeshStandardMaterial({color:0xc8cbd0,roughness:.65});
   const foot=new T.Mesh(new T.BoxGeometry(.008,.0015,.008),polymer);foot.position.y=.00075;horn.add(foot);
   const upright=new T.Mesh(new T.BoxGeometry(.003,.009,.004),polymer);upright.position.y=.0055;horn.add(upright);
   const pin=new T.Mesh(new T.CylinderGeometry(.0012,.0012,.005,10),metal);pin.position.y=.010;pin.rotation.x=Math.PI/2;horn.add(pin);
   const rod=wire('Illustrative '+control.name+' pushrod',[a.toArray(),a.clone().lerp(b,.5).toArray(),b.toArray()],0x949eaa,.0006);
   rod.userData={illustrative:true,servoPin:a.toArray(),controlPin:b.toArray()};horns.push(horn);rods.push(rod);
  });
  group.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
  const wingDetails=[...servos.slice(0,2),...wires.slice(1,3),...rods.slice(0,2),...horns.slice(0,2)];
  const wingMaterials=[];wingDetails.forEach(object=>object.traverse(mesh=>{if(mesh.isMesh){mesh.material=mesh.material.clone();wingMaterials.push(mesh.material);}}));
  function setInspection(amount){wingMaterials.forEach(m=>{m.opacity=amount;m.transparent=amount<1||!!m.map;m.depthWrite=amount>.95;});wingDetails.forEach(o=>o.visible=amount>.001);}
  return {group,board,esc,servos,wires,rods,horns,setInspection,source:trainer.statistics.provenance};
 }
 window.V2SkylabsSystems={create};
})();
