/* One physical coordinate space for the Framework quartet and transit pair.
 * Existing authored CAD stays intact; only each whole assembly and camera move. */
(() => {
  'use strict';
  const names = ['esp32', 'dual', 'pi', 'logic', 'metro', 'tramtrace'];
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => { n = clamp(n); return n*n*(3-2*n); };
  const range = (n, a, b) => ease((n-a)/(b-a));
  function create(T, assemblies) {
    const group = new T.Group(); group.name = 'Selected Work — shared CAD space';
    const objects = new Map(), bounds = new Map();
    names.forEach(name => {
      const assembly = assemblies[name], wrapper = new T.Group(); wrapper.name = 'selected-' + name;
      // One world unit is 30 mm. Relative physical scale is retained across
      // both chapters, so the camera pulls back for the larger transit boards.
      const millimetres = name === 'metro' ? 305.7 : name === 'tramtrace' ? 207.81 : 30;
      wrapper.scale.setScalar(millimetres / 30); wrapper.add(assembly.group); group.add(wrapper);
      assembly.group.updateMatrixWorld(true);
      const local = new T.Box3().setFromObject(assembly.group);
      objects.set(name, {wrapper, assembly, lift: -local.min.y * millimetres / 30 + .035});
      bounds.set(name, new T.Box3());
    });
    const target = new T.Vector3(), direction = new T.Vector3(), corner = new T.Vector3();
    let mobile = false, lastWidth = 0, lastHeight = 0, endpoints;
    function place(progress, compact) {
      const spread = range(progress, 0, .25);
      names.slice(0, 4).forEach((name, index) => {
        const {wrapper, lift} = objects.get(name);
        const x = compact ? (index % 2 ? .68 : -.68) : (index - 1.5) * 1.19;
        const z = compact ? (index < 2 ? -.75 : .78) : Math.abs(index - 1.5) * .11;
        wrapper.position.set(x * (1 + spread * .05), lift, z);
        wrapper.rotation.set(0, compact ? (index % 2 ? -.11 : .11) * (1-spread*.45) : (index-1.5) * -.10 * (1-spread*.45), 0);
      });
      const metro = objects.get('metro'), tram = objects.get('tramtrace');
      metro.wrapper.position.set(8, metro.lift, compact ? -3.55 : -.25);
      tram.wrapper.position.set(compact ? 8 : 17.45, tram.lift, compact ? 4.82 : .55);
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
    function endpoint(camera, stage, width, height) {
      const box = stageBounds(stage), aim = box.getCenter(new T.Vector3());
      const ray = new T.Vector3(...(mobile ? [.06, 1.35, 1] : [.14, 1.20, 1.65])).normalize();
      camera.clearViewOffset(); camera.aspect = width/height; camera.updateProjectionMatrix();
      const availableWidth = mobile ? .88 : .91, availableHeight = mobile ? .52 : .58;
      let distance = Math.max(...box.getSize(new T.Vector3()).toArray()) * 2;
      for (let iteration=0; iteration<12; iteration++) {
        camera.position.copy(aim).addScaledVector(ray, distance); camera.lookAt(aim); camera.updateMatrixWorld(true);
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
        for(let i=0;i<8;i++) {
          corner.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(camera);
          minX=Math.min(minX,corner.x);maxX=Math.max(maxX,corner.x);minY=Math.min(minY,corner.y);maxY=Math.max(maxY,corner.y);
        }
        const ratio = Math.max((maxX-minX)/(availableWidth*2), (maxY-minY)/(availableHeight*2));
        if (Math.abs(ratio-1)<.001) break;
        distance *= Math.max(.5, Math.min(2, ratio));
      }
      return {target:aim, direction:ray, distance:distance*1.035};
    }
    function frame(camera, progress, width, height) {
      const compact = width <= 760;
      place(progress, compact);
      if (!endpoints || compact!==mobile || width!==lastWidth || height!==lastHeight) {
        mobile=compact;lastWidth=width;lastHeight=height;
        // Fit both complete compositions once per layout, never to a single
        // card. Endpoints therefore remain stable while scrolling/reversing.
        place(.25, compact);
        endpoints=[endpoint(camera,0,width,height),endpoint(camera,1,width,height)];
        place(progress, compact);
      }
      const journey = range(progress, .30, .84), zoom = range(progress, .22, .67), a=endpoints[0], b=endpoints[1];
      target.copy(a.target).lerp(b.target,journey);
      direction.copy(a.direction).lerp(b.direction,journey).normalize();
      const distance = a.distance + (b.distance-a.distance)*zoom;
      camera.clearViewOffset();camera.aspect=width/height;camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateProjectionMatrix();
      const visualCentre = mobile ? .555 : .555;
      camera.setViewOffset(width,height,0,(.5-visualCentre)*height,width,height);camera.updateMatrixWorld(true);
      return {target:target.clone(), distance, journey, chapter:progress < .57 ? 0 : 1};
    }
    function stats() {
      return names.map(name=>{
        const entry=objects.get(name);let meshes=0,triangles=0,lines=0;
        entry.assembly.group.traverse(node=>{if(node.isMesh){meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;}if(node.isLineSegments)lines++;});
        return {name, meshes, triangles, lines, physicalScale:entry.wrapper.scale.x};
      });
    }
    return {group,objects,bounds,frame,stats,names};
  }
  window.V2SelectedScene = Object.freeze({create});
})();
