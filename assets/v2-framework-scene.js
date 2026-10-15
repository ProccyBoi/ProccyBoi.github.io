/* Framework background: the original four CAD assemblies, seated by native
 * scroll. No project switcher, pointer capture or free-running animation. */
(() => {
  'use strict';
  const names = ['esp32', 'dual', 'pi', 'logic'];
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => { n = clamp(n); return n*n*(3-2*n); };
  const range = (n, a, b) => ease((n-a)/(b-a));
  // Derived from dual.provenance.json's source ancestry and mergedSourceRanges.
  // Provenance SHA-256: e4199eb8a58e27fdec5d1738d8870a129ecdb98de2cd33ccfddda01781bde635.
  // Range-map SHA-256: fa41e9f8f18dd27e5ad84d353a170c692304d3f542e232ecb0e35522a71fdd2e.
  // Counts are consecutive index ranges, not inferred spatial partitions. The
  // existing build baked components across materials; these views recover only
  // its real connectors/screws, leaving the populated PCB efficiently batched.
  const dualRanges = {
    3: [['pcb',2664],['J1',144],['J2',144]],
    4: [['pcb',864],['J1',1008],['J2',1008]],
    6: [['pcb',1224],['J1',1632],['J2',1632],['M2-1',672],['M2-2',672]],
    11: [['J1',504],['J2',504]],
    12: [['J1',36],['J2',36]],
    13: [['M2-1',72],['M2-2',72]],
    14: [['P1',19662]]
  };
  const timing = Object.freeze({electronics:[.015,.155], connector:[.05,.20], pcb:[.09,.235], screw:[.17,.275], enclosure:[.09,.235]});
  function prepareFramework(T, name, assembly, index) {
    const motion = [], partition = [], stagger = index * .012;
    const boardOffset = new T.Vector3(0,.52,0);
    // Capture authored transforms once. Every sample is a direct function of
    // native scroll, so reversing, jumping and resizing cannot accumulate drift.
    function register(object, role, ref=object.userData.partRef || object.name, units=1, offset) {
      const interval=timing[role], base=object.position.clone(), quaternion=object.quaternion.clone();
      if(!offset) {
        if(role==='electronics') {
          const source=assembly.parts.find(part=>part.object===object), authored=source?.motion?.offset || source?.offset;
          offset=authored ? authored.clone().multiplyScalar(1.02) : new T.Vector3(0,.21,0);
        } else if(role==='connector') {
          const source=assembly.parts.find(part=>part.object===object), underside=source?.offset?.y<0;
          offset=new T.Vector3(0,underside?-.14:.17,ref==='P1'?-.28:.18);
        } else if(role==='screw') offset=new T.Vector3(0,.40,0);
        else offset=new T.Vector3();
      }
      motion.push({object,role,ref,base,quaternion,offset:offset.multiplyScalar(units),
        boardOffset:boardOffset.clone().multiplyScalar(role==='enclosure'?0:units),
        boardStart:timing.pcb[0]+stagger,boardEnd:timing.pcb[1]+stagger,
        start:interval[0]+stagger,end:interval[1]+stagger});
    }
    if(name!=='dual') {
      // All three source factories retain physical PCB/silk and authored part
      // roots. Pads and markings travel with their PCB, never as floating skins.
      assembly.group.children.forEach(object=>{
        const ref=object.userData.partRef || object.name, mechanical=object.userData.mechanicalRole;
        const role=mechanical==='enclosure'?'enclosure':mechanical==='screw'?'screw':/^(P|J)\d/.test(ref)?'connector':
          assembly.parts.some(part=>part.object===object)?'electronics':'pcb';
        register(object,role,ref);
      });
    } else {
      const batches=[];
      assembly.group.traverse(object=>{if(object.isMesh&&/^dual-opaque-batch-\d+$/.test(object.name))batches.push(object);});
      const sourceRoot=batches[0]?.parent.parent;
      if(!sourceRoot || batches.length!==15)throw new Error('Framework Dual source parts are unavailable');
      const point=new T.Vector3();
      for(const source of batches) {
        const number=Number(source.name.slice('dual-opaque-batch-'.length)), count=source.geometry.index.count;
        const ranges=dualRanges[number] || [['pcb',count]];
        if(ranges.reduce((total,[,size])=>total+size,0)!==count)throw new Error('Framework Dual source range changed');
        let start=0;
        for(const [ref,size] of ranges) {
          const role=ref==='pcb'?'pcb':ref.startsWith('M2-')?'screw':'connector';
          let object=source, host=source.parent;
          if(ranges.length>1) {
            // Attribute and index objects stay byte-identical and shared. Only
            // the indexed draw window changes; no CAD is regenerated or lost.
            const geometry=new T.BufferGeometry();
            for(const [attribute,value] of Object.entries(source.geometry.attributes))geometry.setAttribute(attribute,value);
            geometry.setIndex(source.geometry.index);geometry.setDrawRange(start,size);
            geometry.boundingBox=new T.Box3();
            for(let i=start;i<start+size;i++)geometry.boundingBox.expandByPoint(point.fromBufferAttribute(geometry.attributes.position,geometry.index.getX(i)));
            geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new T.Sphere());
            object=new T.Mesh().copy(source,false);object.geometry=geometry;object.name=source.name+'-'+ref;
            host=new T.Group();host.name=object.name+'-part';host.renderOrder=source.parent.renderOrder;
            source.parent.add(host);host.add(object);
          }
          partition.push({source,object,start,count:size,role,ref});
          register(host,role,ref,30);
          start+=size;
        }
        if(ranges.length>1)source.parent.remove(source);
      }
      // The original transparent board/core, silkscreen and edge primitive are
      // siblings of the baked geometry. Move their entire existing CAD frame
      // once; its mirrored/rotated source transforms remain unchanged.
      for(const object of sourceRoot.children) {
        if(object.userData.partRef==='Enclosure')register(object,'enclosure','Enclosure',30);
        else if(!object.name.startsWith('dual-opaque-batch-'))register(object,'pcb','BOARD',30);
      }
    }
    return {motion,partition};
  }
  function applyFramework(entry,progress) {
    for(const part of entry.motion) {
      const separation=1-range(progress,part.start,part.end), board=1-range(progress,part.boardStart,part.boardEnd);
      part.object.position.copy(part.base);
      if(board&&part.boardOffset.lengthSq())part.object.position.addScaledVector(part.boardOffset,board);
      if(separation&&part.offset.lengthSq())part.object.position.addScaledVector(part.offset,separation);
      part.object.quaternion.copy(part.quaternion);
    }
  }
  function create(T, assemblies) {
    const group = new T.Group(); group.name = 'Framework expansion cards';
    const objects = new Map(), bounds = new Map();
    names.forEach((name,index) => {
      const assembly = assemblies[name], wrapper = new T.Group(); wrapper.name = 'selected-' + name;
      // One world unit is 30 mm. Preserve the original physical card sizes.
      const millimetres = 30;
      const parts=index<4?prepareFramework(T,name,assembly,index):{motion:[],partition:[]};
      wrapper.scale.setScalar(millimetres / 30); wrapper.add(assembly.group); group.add(wrapper);
      assembly.group.updateMatrixWorld(true);
      const local = new T.Box3().setFromObject(assembly.group);
      objects.set(name, {wrapper, assembly, ...parts, lift: -local.min.y * millimetres / 30 + .035});
      bounds.set(name, new T.Box3());
    });
    const target = new T.Vector3(), direction = new T.Vector3(), corner = new T.Vector3();
    let mobile = false, lastWidth = 0, lastHeight = 0, endpoints;
    function place(progress, compact) {
      const settle = range(progress, 0, .311);
      names.slice(0, 4).forEach((name, index) => {
        const entry=objects.get(name), {wrapper, lift}=entry;
        applyFramework(entry,progress);
        const x = compact ? (index % 2 ? .70 : -.70) : (index - 1.5) * 1.23;
        const z = compact ? (index < 2 ? -.83 : .85) : Math.abs(index - 1.5) * .11;
        wrapper.position.set(x * (1.035-settle*.035), lift, z);
        wrapper.rotation.set(0, compact ? (index % 2 ? -.09 : .09) * (1-settle*.35) : (index-1.5) * -.09 * (1-settle*.35), 0);
      });
      group.updateMatrixWorld(true);
      names.forEach(name => bounds.get(name).setFromObject(objects.get(name).wrapper));
    }
    function stageBounds() {
      const box = new T.Box3();
      names.forEach(name => box.union(bounds.get(name)));
      return box;
    }
    function endpoint(camera, width, height, box=stageBounds(), fitBoxes) {
      const aim = box.getCenter(new T.Vector3());
      // The original oblique view keeps the PCB and separated parts legible.
      const ray = new T.Vector3(...(mobile ? [.04,1.35,1] : [.12,1.30,1.5])).normalize();
      camera.clearViewOffset(); camera.aspect = width/height; camera.updateProjectionMatrix();
      const availableWidth = mobile ? .93 : .96;
      const availableHeight = mobile ? .44 : .57;
      let distance = Math.max(...box.getSize(new T.Vector3()).toArray()) * 2;
      let midY=0;
      for (let iteration=0; iteration<12; iteration++) {
        camera.position.copy(aim).addScaledVector(ray, distance); camera.lookAt(aim); camera.updateMatrixWorld(true);
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
        for(const fitBox of fitBoxes || [box])for(let i=0;i<8;i++) {
          corner.set(i&1?fitBox.max.x:fitBox.min.x,i&2?fitBox.max.y:fitBox.min.y,i&4?fitBox.max.z:fitBox.min.z).project(camera);
          minX=Math.min(minX,corner.x);maxX=Math.max(maxX,corner.x);minY=Math.min(minY,corner.y);maxY=Math.max(maxY,corner.y);
        }
        midY=(minY+maxY)*.5;
        const ratio = Math.max((maxX-minX)/(availableWidth*2), (maxY-minY)/(availableHeight*2));
        if (Math.abs(ratio-1)<.001) break;
        distance *= Math.max(.5, Math.min(2, ratio));
      }
      return {target:aim, direction:ray, distance:distance*1.035, visualCentre:(mobile ? .535 : .555)+midY*.5/1.035};
    }
    function frame(camera, progress, width, height) {
      const compact = width <= 760;
      if (!endpoints || compact!==mobile || width!==lastWidth || height!==lastHeight) {
        mobile=compact;lastWidth=width;lastHeight=height;
        // Fit the entire most-separated quartet, including genuine housing,
        // connectors and fasteners. The fixed envelope also contains the exact
        // assembled dwell, so scroll never makes the camera chase a small part.
        place(0,compact);const firstBox=stageBounds(),fitBoxes=names.slice(0,4).map(name=>bounds.get(name).clone());
        place(.311,compact);firstBox.union(stageBounds());
        names.slice(0,4).forEach(name=>fitBoxes.push(bounds.get(name).clone()));
        const first=endpoint(camera,width,height,firstBox,fitBoxes);
        endpoints=[first,first];
      }
      // Stretch the original assembly motion across the entire native journey.
      const assemblyProgress=clamp(progress/.78)*.311;
      place(assemblyProgress, compact);
      // A fixed camera keeps the assembly motion quiet behind the copy.
      const journey = 0, zoom = 0, a=endpoints[0], b=endpoints[1];
      target.copy(a.target).lerp(b.target,journey);
      direction.copy(a.direction).lerp(b.direction,journey).normalize();
      const distance = a.distance + (b.distance-a.distance)*zoom;
      // Preserve depth precision for thin native board and mask surfaces.
      camera.near=Math.max(.1,distance*.12);camera.far=Math.max(80,distance*3);
      camera.clearViewOffset();camera.aspect=width/height;camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateProjectionMatrix();
      const visualCentre = a.visualCentre+(b.visualCentre-a.visualCentre)*journey;
      camera.setViewOffset(width,height,0,(.5-visualCentre)*height,width,height);camera.updateMatrixWorld(true);
      return {target:target.clone(), distance, journey, chapter:0};
    }
    function stats() {
      return names.map(name=>{
        const entry=objects.get(name);let meshes=0,triangles=0,lines=0;
        entry.assembly.group.traverseVisible(node=>{
          if(node.isMesh){
            meshes++;
            const geometry=node.geometry,count=geometry.index?.count||geometry.attributes.position.count;
            const start=geometry.drawRange.start,end=Math.min(count,start+geometry.drawRange.count);
            const indices=Array.isArray(node.material)?geometry.groups.reduce((sum,part)=>sum+(node.material[part.materialIndex]?.visible?
              Math.max(0,Math.min(end,part.start+part.count)-Math.max(start,part.start)):0),0):node.material.visible?Math.max(0,end-start):0;
            triangles+=indices/3;
          }
          if(node.isLineSegments)lines++;
        });
        return {name, meshes, triangles, lines, physicalScale:entry.wrapper.scale.x, movingParts:entry.motion.filter(part=>part.role!=='enclosure').length};
      });
    }
    return {group,objects,bounds,frame,stats,names};
  }
  window.V2FrameworkScene = Object.freeze({create});
})();
