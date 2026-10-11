/* One physical coordinate space for the Framework quartet and transit pair.
 * Scroll seats the original CAD parts, then moves through the same scene. */
(() => {
  'use strict';
  const names = ['esp32', 'dual', 'pi', 'logic', 'metro', 'tramtrace'];
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
    const group = new T.Group(); group.name = 'Selected Work — shared CAD space';
    const objects = new Map(), bounds = new Map();
    names.forEach((name,index) => {
      const assembly = assemblies[name], wrapper = new T.Group(); wrapper.name = 'selected-' + name;
      // One world unit is 30 mm. Relative physical scale is retained across
      // both chapters, so the camera pulls back for the larger transit boards.
      const millimetres = name === 'metro' ? 305.7 : name === 'tramtrace' ? 207.81 : 30;
      const parts=index<4?prepareFramework(T,name,assembly,index):{motion:[],partition:[]};
      wrapper.scale.setScalar(millimetres / 30); wrapper.add(assembly.group); group.add(wrapper);
      assembly.group.updateMatrixWorld(true);
      const local = new T.Box3().setFromObject(assembly.group);
      objects.set(name, {wrapper, assembly, ...parts, lift: -local.min.y * millimetres / 30 + .035});
      bounds.set(name, new T.Box3());
    });
    const target = new T.Vector3(), direction = new T.Vector3(), corner = new T.Vector3();
    const inspectionWeights = new Float64Array(4), inspectionCentre = new T.Vector3(), inspectionOffset = new T.Vector3();
    const screenRight = new T.Vector3(), screenUp = new T.Vector3(), projected = {left:0,right:0,top:0,bottom:0};
    let mobile = false, lastWidth = 0, lastHeight = 0, endpoints;
    function place(progress, compact) {
      const settle = range(progress, 0, .311);
      names.slice(0, 4).forEach((name, index) => {
        const entry=objects.get(name), {wrapper, lift}=entry;
        applyFramework(entry,progress);
        const x = compact ? (index % 2 ? .70 : -.70) : (index - 1.5) * 1.23;
        const z = compact ? (index < 2 ? -.83 : .85) : Math.abs(index - 1.5) * .11;
        wrapper.position.set(x * (1.035-settle*.035) - range(progress,.57,.86)*10, lift, z);
        wrapper.rotation.set(0, compact ? (index % 2 ? -.09 : .09) * (1-settle*.35) : (index-1.5) * -.09 * (1-settle*.35), 0);
      });
      const metro = objects.get('metro'), tram = objects.get('tramtrace');
      // Desktop boards wait beyond the side edge while the camera pulls back;
      // the compact stack can arrive earlier without crossing the copy band.
      const arriving = compact ? 6*(1-range(progress,.20,.52)) : 16*(1-range(progress,.36,.68));
      metro.wrapper.position.set(8+arriving, metro.lift, compact ? -3.55 : -.25);
      tram.wrapper.position.set((compact ? 8 : 17.45)+arriving, tram.lift, compact ? 4.82 : .55);
      metro.wrapper.rotation.set(0, compact ? -.04 : .035, 0);
      tram.wrapper.rotation.set(0, compact ? .045 : -.055, 0);
      group.updateMatrixWorld(true);
      names.forEach(name => bounds.get(name).setFromObject(objects.get(name).wrapper));
    }
    function stageBounds(stage) {
      const box = new T.Box3();
      (stage ? names.slice(4) : names.slice(0,4)).forEach(name => box.union(bounds.get(name)));
      return box;
    }
    function endpoint(camera, stage, width, height, box=stageBounds(stage), fitBoxes) {
      const aim = box.getCenter(new T.Vector3());
      // Transit maps need their board faces, traces and stations readable. The
      // approach rises smoothly from the Framework assembly angle to 63–66°.
      const ray = new T.Vector3(...(stage ? (mobile ? [.04,2.2,1] : [.08,2.1,1.05]) : (mobile ? [.04,1.35,1] : [.12,1.30,1.5]))).normalize();
      camera.clearViewOffset(); camera.aspect = width/height; camera.updateProjectionMatrix();
      const availableWidth = stage ? (mobile ? .88 : .91) : (mobile ? .93 : .96);
      const availableHeight = stage ? (mobile ? .48 : .51) : (mobile ? .44 : .57);
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
      return {target:aim, direction:ray, distance:distance*1.035, visualCentre:stage ? .555 : (mobile ? .535 : .555)+midY*.5/1.035};
    }
    function projectBounds(box, camera) {
      projected.left=projected.bottom=Infinity;projected.right=projected.top=-Infinity;
      for(let i=0;i<8;i++) {
        corner.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(camera);
        projected.left=Math.min(projected.left,corner.x);projected.right=Math.max(projected.right,corner.x);
        projected.top=Math.max(projected.top,corner.y);projected.bottom=Math.min(projected.bottom,corner.y);
      }
    }
    function inspect(camera, progress, compact, inspection) {
      // The controller owns interpolation. Independent weights let an outgoing
      // card return while the next approaches, without a scene-local clock or
      // a cached pose that can jump after native scroll, resize or reversal.
      const gate=1-range(progress,.34,.44), weights=inspection?.weights;
      if(!weights || !gate)return;
      let total=0;
      for(let i=0;i<4;i++)total+=inspectionWeights[i]=Number.isFinite(weights[i])?clamp(weights[i]):0;
      if(!total)return;
      const normalization=gate/Math.max(1,total);
      screenRight.setFromMatrixColumn(camera.matrixWorld,0);screenUp.setFromMatrixColumn(camera.matrixWorld,1);
      const top=compact ? .38 : .46,bottom=compact ? -.48 : -.72,side=.95;
      for(let i=0;i<4;i++) {
        const weight=inspectionWeights[i]*normalization,entry=objects.get(names[i]),box=bounds.get(names[i]);
        if(!weight)continue;
        box.getCenter(inspectionCentre);
        let pull=.24*weight;
        if(pull>0) {
          // Use perspective translation, never scale or deform source CAD.
          // At the fully exploded pose the available text-free height limits
          // magnification; the assembled dwell can use the full close look.
          projectBounds(box,camera);
          const room=Math.min(side*2/(projected.right-projected.left),(top-bottom)/(projected.top-projected.bottom));
          pull=Math.min(pull,Math.max(0,1-1/Math.max(1,room*.975)));
        }
        inspectionOffset.copy(camera.position).sub(inspectionCentre).multiplyScalar(pull);
        entry.wrapper.position.add(inspectionOffset);box.translate(inspectionOffset);
        if(weight>0) {
          // Keep the complete selected assembly in the same quartet slot and
          // clear of chapter controls and links, including at 320 CSS pixels.
          // Reproject twice to account for the real CAD's perspective depth.
          for(let correction=0;correction<2;correction++) {
            projectBounds(box,camera);
            const dx=projected.left < -side ? -side-projected.left : projected.right > side ? side-projected.right : 0;
            const dy=projected.bottom < bottom ? bottom-projected.bottom : projected.top > top ? top-projected.top : 0;
            if(!dx&&!dy)break;
            box.getCenter(inspectionCentre);inspectionCentre.applyMatrix4(camera.matrixWorldInverse);
            const span=-inspectionCentre.z*Math.tan(camera.fov*Math.PI/360);
            inspectionOffset.copy(screenRight).multiplyScalar(dx*span*camera.aspect).addScaledVector(screenUp,dy*span);
            entry.wrapper.position.add(inspectionOffset);box.translate(inspectionOffset);
          }
        }
        entry.wrapper.updateMatrixWorld(true);
      }
    }
    function frame(camera, progress, width, height, inspection) {
      const compact = width <= 760;
      if (!endpoints || compact!==mobile || width!==lastWidth || height!==lastHeight) {
        mobile=compact;lastWidth=width;lastHeight=height;
        // Fit the entire most-separated quartet, including genuine housing,
        // connectors and fasteners. The fixed envelope also contains the exact
        // assembled dwell, so scroll never makes the camera chase a small part.
        place(0,compact);const firstBox=stageBounds(0),fitBoxes=names.slice(0,4).map(name=>bounds.get(name).clone());
        place(.311,compact);firstBox.union(stageBounds(0));
        names.slice(0,4).forEach(name=>fitBoxes.push(bounds.get(name).clone()));
        const first=endpoint(camera,0,width,height,firstBox,fitBoxes);
        place(1,compact);endpoints=[first,endpoint(camera,1,width,height)];
      }
      place(progress, compact);
      // Finish seating before pullback. Lead the pan enough that a full-size
      // transit board cannot sweep over the navigation or project labels.
      const journey = range(progress, .34, .84), zoom = range(progress, .311, compact ? .52 : .44), a=endpoints[0], b=endpoints[1];
      target.copy(a.target).lerp(b.target,journey);
      direction.copy(a.direction).lerp(b.direction,journey).normalize();
      const distance = a.distance + (b.distance-a.distance)*zoom;
      // Keep the depth range local to the camera journey. A .01 near plane
      // loses precision at the full-size transit boards and makes their exact
      // thin mask/core surfaces fight even with shadows disabled.
      camera.near=Math.max(.1,distance*.12);camera.far=Math.max(80,distance*3);
      camera.clearViewOffset();camera.aspect=width/height;camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateProjectionMatrix();
      const visualCentre = a.visualCentre+(b.visualCentre-a.visualCentre)*journey;
      camera.setViewOffset(width,height,0,(.5-visualCentre)*height,width,height);camera.updateMatrixWorld(true);
      inspect(camera,progress,compact,inspection);
      return {target:target.clone(), distance, journey, chapter:progress < .57 ? 0 : 1};
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
  window.V2SelectedScene = Object.freeze({create});
})();
