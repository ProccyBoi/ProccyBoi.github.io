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
  const placements=[['Left flaperon servo',[.345,-.002,.67]],['Right flaperon servo',[.345,-.002,-.67]],['Elevator servo',[-.63,-.024,.15]],['Rudder servo',[-.63,.13,0]]];
  const servos=placements.map(([name,position])=>{const object=trainer.group.getObjectByName(name+' — KST-X10 Pro-B, illustrative geometry');if(!object)throw Error('Trainer servo missing');group.add(object);object.position.set(...position);object.quaternion.identity();if(name==='Rudder servo')object.rotation.x=Math.PI/2;return object;});
  const metal=new T.MeshStandardMaterial({color:0x687888,roughness:.45,metalness:.7});
  for(const x of [-.030,.030])for(const z of [-.022,.022]){const mount=new T.Mesh(new T.CylinderGeometry(.002,.002,.05575,10),metal);mount.name='Illustrative telemetry standoff';mount.position.set(.115+x,-.052875,z);group.add(mount);}
  function wire(name,points,colour,radius=.00065){const mesh=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),32,radius,5,false),new T.MeshStandardMaterial({color:colour,roughness:.7,envMapIntensity:.15}));mesh.name=name;group.add(mesh);return mesh;}
  const wires=[];
  wires.push(wire('Telemetry to ESC sidewall signal harness',[[.15,-.02,-.02],[.16,-.025,-.047],[.56,-.025,-.047],[.59,-.04,-.015]],0x7489a3));
  for(const sign of [-1,1])wires.push(wire('Wing servo signal harness',[[.12,-.02,sign*.02],[.17,.025,sign*.045],[.33,.025,sign*.06],[.34,.012,sign*.67]],0x7489a3));
  wires.push(wire('Tail control harness',[[.08,-.02,0],[.03,-.035,0],[-.55,-.035,0],[-.63,-.02,.15]],0x7489a3));
  wires.push(wire('Rudder control harness',[[-.55,-.035,0],[-.61,.03,0],[-.63,.13,0]],0x7489a3));
  for(let i=0;i<3;i++)wires.push(wire('ESC motor phase '+i,[[.634,-.04,(i-1)*.01],[.68,-.02,(i-1)*.012],[.75,0,(i-1)*.008]],[0x916c36,0x395e8f,0x963e3e][i],.0009));
  for(const part of [esc,...servos])part.traverse(mesh=>{if(mesh.isMesh){const restore=m=>{m=m.clone();m.opacity=1;m.transparent=!!m.map;m.depthWrite=true;m.envMapIntensity=.3;m.needsUpdate=true;return m;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(restore):restore(mesh.material);}});
  const rods=servos.map((servo,i)=>{const a=servo.position.clone().add(new T.Vector3(-.007,.018,0)),b=a.clone();b.x-=i<2?.065:.055;return wire('Illustrative control pushrod '+i,[a.toArray(),a.clone().lerp(b,.5).toArray(),b.toArray()],0x949eaa,.0006);});
  group.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
  const wingDetails=[...servos.slice(0,2),...wires.slice(1,3),...rods.slice(0,2)];
  const wingMaterials=[];wingDetails.forEach(object=>object.traverse(mesh=>{if(mesh.isMesh){mesh.material=mesh.material.clone();wingMaterials.push(mesh.material);}}));
  function setInspection(amount){wingMaterials.forEach(m=>{m.opacity=amount;m.transparent=amount<1||!!m.map;m.depthWrite=amount>.95;});wingDetails.forEach(o=>o.visible=amount>.001);}
  return {group,board,esc,servos,wires,rods,setInspection,source:trainer.statistics.provenance};
 }
 window.V2SkylabsSystems={create};
})();
