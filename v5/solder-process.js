/* Illustrative stencil printing and reflow on the existing CAD lands.
 * Tool/aperture thickness and solder volume are explanatory, not process data.
 * No source board or component mesh is changed. */
(() => {
  'use strict';
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { x = clamp(x); return x*x*(3-2*x); };
  const ramp = (p,a,b) => smooth((p-a)/(b-a));
  const mix = (a,b,t) => a+(b-a)*t;
  function create(T, model, data) {
    const group = new T.Group(); group.name = 'Illustrative solder process';
    const lands = data.lands;
    const padY = .02122415415942669; // Top of source mat_46; pack has identity PCB transform.
    const maskY = .021361084654927254;
    const pasteHeight = .0035;
    const sheetBottom = maskY + .00010;
    let leadToe = .1752019761680884, leadTop = padY + .0032;
    const u14 = model.parts.find(part => part.ref === 'U14');
    model.group.updateMatrixWorld(true);
    if (u14) {
      const bounds = new T.Box3().setFromObject(u14.object);
      leadToe = bounds.max.x;
      let toeY = -Infinity;
      const point = new T.Vector3();
      u14.object.traverse(object => {
        const positions = object.geometry?.attributes?.position;
        if (!positions) return;
        for (let i=0; i<positions.count; i++) {
          point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld);
          if (Math.abs(point.x-leadToe)<.000001) toeY=Math.max(toeY,point.y);
        }
      });
      if (Number.isFinite(toeY)) leadTop=toeY;
    }
    const focus = {x:leadToe-.0012, z:-.04053};
    function loop(land) {
      const neighbors = new Map();
      for (const [a,b] of land.e) {
        if (!neighbors.has(a)) neighbors.set(a,[]);
        if (!neighbors.has(b)) neighbors.set(b,[]);
        neighbors.get(a).push(b);neighbors.get(b).push(a);
      }
      const start=land.e[0][0], order=[start];let previous=-1,current=start;
      for(let i=0;i<neighbors.size;i++) {
        const next=neighbors.get(current).find(index=>index!==previous);
        if(next===start)break;
        order.push(next);previous=current;current=next;
      }
      return order.map(index=>land.p[index]);
    }
    const outlines=lands.map(loop);
    // An opaque sheet with real holes: paste is printed through apertures, not
    // smeared over an exposed board. Holes follow the selected CAD land outlines.
    const stencilShape=new T.Shape();
    stencilShape.moveTo(-.55,-.43);stencilShape.lineTo(.55,-.43);
    stencilShape.lineTo(.55,.43);stencilShape.lineTo(-.55,.43);stencilShape.closePath();
    for(const outline of outlines) {
      const points=outline.map(p=>new T.Vector2(p[0],-p[1]));
      if(!T.ShapeUtils.isClockWise(points))points.reverse();
      const hole=new T.Path(points);hole.closePath();stencilShape.holes.push(hole);
    }
    const sheetGeometry=new T.ExtrudeGeometry(stencilShape,{depth:pasteHeight,bevelEnabled:false,steps:1,curveSegments:1});
    sheetGeometry.rotateX(-Math.PI/2);
    const sheetMaterial=new T.MeshStandardMaterial({color:0x909ba3,metalness:.88,roughness:.34,side:T.DoubleSide});
    const stencil=new T.Mesh(sheetGeometry,sheetMaterial);stencil.name='Illustrative perforated stencil';
    stencil.receiveShadow=true;group.add(stencil);
    // The dark elastomer blade and its metal holder share one deterministic pose.
    const printer=new T.Group();printer.name='Illustrative squeegee';group.add(printer);
    const rubber=new T.MeshStandardMaterial({color:0x202925,metalness:.03,roughness:.82});
    const bladeGeometry=new T.BoxGeometry(.008,.057,.88);bladeGeometry.translate(0,.0285,0);bladeGeometry.rotateZ(-.22);
    const blade=new T.Mesh(bladeGeometry,rubber);printer.add(blade);
    const holder=new T.Mesh(new T.BoxGeometry(.034,.024,.93),new T.MeshStandardMaterial({color:0xaab4b7,metalness:.75,roughness:.3}));
    holder.position.set(.014,.066,0);printer.add(holder);
    const rollMaterial=new T.MeshStandardMaterial({color:0x5a6063,roughness:1,metalness:.03});
    const roll=new T.Mesh(new T.CylinderGeometry(.009,.009,.86,20,1),rollMaterial);
    roll.rotation.x=Math.PI/2;roll.position.set(.011,.003,0);printer.add(roll);
    // Reuse exact land triangulation, subdividing its surface so the deposit can
    // change shape. Shared vertices give smoothly changing surface normals.
    const positions=[],wetPositions=[],indices=[];
    let filletCount=0;
    lands.forEach((land,landIndex)=>{
      const outline=outlines[landIndex], xs=land.p.map(p=>p[0]),zs=land.p.map(p=>p[1]);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
      const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,short=Math.min(maxX-minX,maxZ-minZ);
      const eastLead=minX>leadToe-.017 && maxX>leadToe && maxX<leadToe+.012 && minZ>-.103 && maxZ<.018;
      if(eastLead)filletCount++;
      const cache=new Map();
      function distance(x,z) {
        let best=Infinity;
        for(let i=0;i<outline.length;i++) {
          const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1];
          const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
          best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
        }
        return best;
      }
      function vertex(p) {
        const key=p[0].toFixed(8)+','+p[1].toFixed(8);
        if(cache.has(key))return cache.get(key);
        const edge=distance(p[0],p[1]),d=clamp(edge/(short*.5));
        const pasteY=padY+.00006+pasteHeight*smooth(d/.18);
        let solderH=pasteHeight*.46*Math.sin(d*Math.PI/2);
        if(eastLead) {
          const outer=clamp((p[0]-leadToe)/(maxX-leadToe));
          const lateral=smooth(Math.min(p[1]-minZ,maxZ-p[1])/(short*.18));
          const end=smooth(edge/(short*.06));
          solderH=Math.max(.0012,leadTop-padY)*(1-outer)*(1-outer)*lateral*end;
        }
        const index=positions.length/3;
        positions.push(mix(cx,p[0],.94),pasteY,mix(cz,p[1],.94));
        wetPositions.push(p[0],padY+.00006+solderH,p[1]);
        cache.set(key,index);return index;
      }
      function triangle(a,b,c,depth) {
        if(depth) {
          const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];
          triangle(a,ab,ca,depth-1);triangle(ab,b,bc,depth-1);triangle(ca,bc,c,depth-1);triangle(ab,bc,ca,depth-1);
        } else {
          const ia=vertex(a),ib=vertex(b),ic=vertex(c);
          // Input CAD triangles are +Y; preserve their winding.
          indices.push(ia,ib,ic);
        }
      }
      const depth=land.t.length>8?1:2;
      for(const [a,b,c] of land.t)triangle(land.p[a],land.p[b],land.p[c],depth);
    });
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const wetGeometry=new T.BufferGeometry();wetGeometry.setAttribute('position',new T.Float32BufferAttribute(wetPositions,3));wetGeometry.setIndex(indices);wetGeometry.computeVertexNormals();
    geometry.morphAttributes.position=[wetGeometry.attributes.position];geometry.morphAttributes.normal=[wetGeometry.attributes.normal];
    geometry.computeBoundingSphere();
    const uniforms={front:{value:-.56},wet:{value:0}};
    const solderMaterial=new T.MeshStandardMaterial({color:0x676f75,roughness:.96,metalness:.02,side:T.DoubleSide,morphTargets:true,morphNormals:true});
    solderMaterial.onBeforeCompile=shader=>{
      shader.uniforms.solderFront=uniforms.front;shader.uniforms.solderWet=uniforms.wet;
      shader.vertexShader='uniform float solderFront; varying vec3 vSolderPoint;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vSolderPoint=transformed;
        transformed.y=${padY.toFixed(9)}+(transformed.y-${padY.toFixed(9)})*smoothstep(transformed.x-.0015,transformed.x+.0015,solderFront);
        #include <project_vertex>`);
      shader.fragmentShader='uniform float solderFront; uniform float solderWet; varying vec3 vSolderPoint;\nfloat solderGrain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vSolderPoint.x>solderFront)discard;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat grain=solderGrain(floor(vSolderPoint.xz*19000.0));\ndiffuseColor.rgb*=mix(.64+grain*.52,1.0,solderWet);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(grain-.5)*.18*(1.0-solderWet),.12,1.0);');
    };
    solderMaterial.customProgramCacheKey=()=> 'v5-visible-solder-process-1';
    const deposits=new T.Mesh(geometry,solderMaterial);deposits.name='Source-land paste and illustrative solder';deposits.frustumCulled=false;deposits.receiveShadow=true;group.add(deposits);
    let progress=0,wet=0,front=-.56,stencilHeight=.14;
    function printFront(p) {
      if(p<=.10)return -.56;
      if(p<.14)return mix(-.56,.12,ramp(p,.10,.14));
      if(p<.23)return mix(.12,.22,(p-.14)/.09);
      return mix(.22,.56,ramp(p,.23,.27));
    }
    function update(p) {
      progress=clamp(p);front=printFront(progress);wet=ramp(progress,.52,.70);
      uniforms.front.value=front;uniforms.wet.value=wet;
      deposits.visible=progress>.10;deposits.morphTargetInfluences[0]=wet;
      solderMaterial.color.setRGB(mix(.23,.68,wet),mix(.26,.73,wet),mix(.28,.78,wet));
      solderMaterial.roughness=mix(.98,.18,wet);solderMaterial.metalness=mix(.02,.94,wet);
      stencilHeight=.14*(1-ramp(progress,.06,.10))+.18*ramp(progress,.27,.33);
      stencil.visible=progress>=.06&&progress<.33;stencil.position.y=sheetBottom+stencilHeight;
      printer.visible=progress>=.10&&progress<=.27;
      printer.position.set(front,sheetBottom+pasteHeight+.001,0);
    }
    update(0);
    return {group,focus,update,snapshot:()=>({progress,printFront:front,printFraction:clamp((front+.56)/1.12),wet,stencilHeight,bladeX:front,apertures:lands.length,fillets:filletCount,leadToe,leadTop,pasteHeight,stencilVisible:stencil.visible,bladeVisible:printer.visible,depositVertices:positions.length/3})};
  }
  window.V5SolderProcess=Object.freeze({create});
})();
