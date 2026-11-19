/* The Projects airfield: one static world in the trainer CAD's metre frame.
 * Only the outlying landform is compressed uniformly in XYZ; the flight strip,
 * wheel contact plane, plants, gravel and shadows stay in local scene metres.
 * No scenery bitmap, network tile service, clock, RAF, or extra renderer. */
(() => {
  'use strict';
  const GRID = { nx:193, nz:185, x0:-14400, d0:-3000, step:150, scale:22 };
  const R = [-.84549,-.5340], F = [-.5340,.84549], SRC='/assets/models/tucson-mountains/relief.bin';
  const sun = [-.82,.39,-.46], clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
  const mix=(a,b,t)=>a+(b-a)*t;
  const map=(u,d)=>[R[0]*u+F[0]*d,R[1]*u+F[1]*d];
  const coord=(x,z)=>[x*R[0]+z*R[1],x*F[0]+z*F[1]];
  function rng(seed) { let a=seed>>>0; return ()=>{a=(Math.imul(a,1664525)+1013904223)>>>0;return a/4294967296}; }
  let transfer;
  function readHeights() {
    return transfer ||= fetch(SRC).then(r=>{if(!r.ok)throw Error('Tucson elevation: '+r.status);return r.arrayBuffer()}).then(b=>{
      if(b.byteLength !== GRID.nx*GRID.nz*2)throw Error('Incomplete Tucson elevation grid');
      const v = new DataView(b), h = new Uint16Array(GRID.nx*GRID.nz);
      for(let i=0;i<h.length;i++)h[i]=v.getUint16(i*2,true);return h;
    }).catch(e=>{transfer=null;throw e});
  }
  // One tiny, deterministic field of periodic noise. It is not an image of
  // the scenery: the terrain, stones, sunlit faces and silhouettes are meshes.
  function grainData() {
    const rand=rng(0x0a11ce), n=128, data=new Uint8Array(n*n*4);
    const layers=[4,8,16,32,64].map(k=>({k,a:Float32Array.from({length:k*k},rand)}));
    function noise(layer,x,z){
      const {k,a}=layer, xx=x*k/n,zz=z*k/n, ix=Math.floor(xx), iz=Math.floor(zz);
      const fx=sstep(0,1,xx-ix),fz=sstep(0,1,zz-iz),v=(u,w)=>a[(w%k)*k+(u%k)];
      return mix(mix(v(ix,iz),v(ix+1,iz),fx),mix(v(ix,iz+1),v(ix+1,iz+1),fx),fz);
    }
    for(let z=0,p=0;z<n;z++)for(let x=0;x<n;x++,p+=4){
      let b=0,w=0;layers.forEach((l,i)=>{const a=1/(1+i*.7);b+=noise(l,x,z)*a;w+=a});
      data[p]=255*b/w;data[p+1]=255*rand();data[p+2]=255*noise(layers[2],x,z);data[p+3]=255;
    }
    return data;
  }
  const common = `
    uniform sampler2D grain; uniform sampler2D reliefShade; uniform float reveal; varying vec3 p; varying vec3 nrm;
    varying vec2 ud; varying vec3 tint;
    const vec3 keyDir = normalize(vec3(-.82,.39,-.46));
    const vec3 studio = vec3(.063,.071,.063);
    vec3 finishColor(vec3 c) {return mix(studio,c,reveal);}
  `;
  const vertex = `
    varying vec3 p; varying vec3 nrm; varying vec2 ud; varying vec3 tint;
    void main(){p=position; nrm=normal; ud=uv; tint=color;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `;
  const landFrag = common+`
    void main(){
      vec3 N=normalize(nrm);
      vec3 tex=texture2D(grain,ud*.016).rgb, tex2=texture2D(grain,ud*.112+vec2(.29,.17)).rgb;
      vec2 illum=texture2D(reliefShade,(ud*22.+vec2(14400.,3000.))/vec2(28800.,27600.)).rg;
      float slope=1.-N.y, hill=smoothstep(2.,12.,p.y)+.3*smoothstep(.025,.15,slope);
      float litho=clamp(hill*.8+slope*.8+(tex.r-.5)*.8,0.,1.);
      vec3 gravel=mix(vec3(.49,.387,.317),vec3(.735,.614,.498),tex2.r);
      vec3 rhyolite=mix(vec3(.38,.329,.326),vec3(.62,.469,.384),tex.r);
      vec3 c=mix(gravel,rhyolite,litho);
      float reach=smoothstep(15.,170.,length(ud));
      // Drainages follow the actual slope; subpixel grain uses mip filtering.
      float striae=texture2D(grain,vec2(ud.x*.12+p.y*.16,ud.y*.029)).r-.5;
      c+=(tex2.r-.5)*.085+striae*.13*litho;
      float dist=length(ud);
      float nd=dot(N,keyDir);
      float localLight=smoothstep(.08,.70,nd);
      float relief=smoothstep(42.,107.,dist);
      float sunlight=mix(localLight,illum.r,relief);
      c*=mix(vec3(.57,.60,.74),vec3(1.12,1.05,.94),sunlight);
      // Terrain-normal detail and topographic occlusion were baked from a
      // 37.5 m sampling of the real DEM, in this same map orientation.
      float mountain=relief*smoothstep(.08,.68,litho);
      vec3 rockShadow=mix(vec3(.241,.254,.328),vec3(.322,.318,.365),tex.r);
      vec3 rockLight=mix(vec3(.596,.439,.395),vec3(.734,.560,.447),tex.r);
      vec3 rock=mix(rockShadow,rockLight,smoothstep(.18,.89,sunlight)) + (illum.g-.5)*.11+striae*.10;
      c=mix(c,rock,mountain*.91);
      float slopePlants=smoothstep(.53,.74,tex2.r)*smoothstep(.02,.56,tex.b);
      c=mix(c,vec3(.291,.301,.238)*(0.88+.22*sunlight),slopePlants*(.27+.12*reach)*(1.-smoothstep(.32,.58,slope)));
      float washX=9.+.105*ud.y+2.15*sin(ud.y*.08)+.7*sin(ud.y*.19);
      float wash=(1.-smoothstep(.55,2.6,abs(ud.x-washX)))*smoothstep(3.,18.,ud.y)*(1.-smoothstep(90.,155.,ud.y));
      c+=vec3(.100,.092,.072)*wash;
      // Runway lies on the trainer's X axis, not in screen coordinates.
      float edge=abs(p.z-.12)-2.05;
      float pavement=(1.-smoothstep(-.028,.032,edge+(tex2.b-.5)*.045))*(1.-smoothstep(35.,41.,abs(p.x)));
      vec3 fine=texture2D(grain,p.xz*1.4).rgb;
      float weather=texture2D(grain,p.xz*vec2(.031,.32)).r;
      vec3 tarmac=mix(vec3(.257,.264,.273),vec3(.397,.39,.374),weather)+(fine.r-.5)*.107+(fine.g-.5)*.065;
      // Restrained, weathered edge paint. No painted centreline under the CAD.
      float paint=(1.-smoothstep(.010,.020,abs(edge+.106)))*(.65+.35*fine.r)*smoothstep(.2,.55,tex2.b);
      tarmac=mix(tarmac,vec3(.68,.643,.535),paint*.69);
      c=mix(c,tarmac,pavement);
      c+=((fine.g-.5)*.080+(fine.b-.5)*.049)*(1.-pavement);
      float haze=(1.-exp(-dist*.00117))*.81;
      vec3 air=mix(vec3(.479,.481,.570),vec3(.604,.621,.698),smoothstep(240.,860.,dist));
      c=mix(c,air,haze);
      gl_FragColor=vec4(finishColor(c),1.);
    }`;
  const floraFrag=common+`
    void main(){vec3 N=normalize(nrm);float light=dot(N,keyDir);
      vec3 c=tint*mix(vec3(.59,.66,.72),vec3(1.14,1.095,.928),smoothstep(-.42,.84,light));
      float haze=(1.-exp(-length(p.xz)*.0019))*.72;
      gl_FragColor=vec4(finishColor(mix(c,vec3(.51,.514,.53),haze)),1.);
    }`;
  function build(h,mobile) {
    function terrainAt(u,d){
      const xx=clamp((u*GRID.scale-GRID.x0)/GRID.step,0,GRID.nx-1.001),zz=clamp((d*GRID.scale-GRID.d0)/GRID.step,0,GRID.nz-1.001),i=Math.floor(xx),j=Math.floor(zz),a=xx-i,b=zz-j,o=i+j*GRID.nx;
      return mix(mix(h[o],h[o+1],a),mix(h[o+GRID.nx],h[o+GRID.nx+1],a),b);
    }
    const origin=terrainAt(0,0);
    const wash=(u,d)=>Math.abs(u-(9+.105*d+2.15*Math.sin(d*.08)+.7*Math.sin(d*.19)));
    function height(u,d){
      const [x,z]=map(u,d), dist=Math.hypot(u,d), off=sstep(2.18,6.7,Math.abs(z-.12));
      let detail=.12+.13*Math.sin(.28*u+.08*d)+.09*Math.sin(.16*d-.16*u)+.045*Math.sin(.37*d+.8*u);
      detail+=.34*sstep(11,38,dist)*Math.sin(u*.097+.6)*Math.cos(d*.105);
      detail-=.27*Math.exp(-Math.pow(wash(u,d)/2,2))*sstep(4,16,d);
      return (terrainAt(u,d)-origin)/GRID.scale*sstep(11,103,dist)+(detail*off)*(1-sstep(80,130,dist))-.0018;
    }
    function arrays(){return {p:[],n:[],c:[],uv:[],i:[]}}
    function vert(a,p,n,c,uv=[0,0]){
      const id=a.p.length/3;a.p.push(...p);a.n.push(...n);a.c.push(...c);a.uv.push(...uv);return id;
    }
    function packed(a,land=false){
      const n=a.p.length/3,I=n<65536?Uint16Array:Uint32Array;
      return {p:new Float32Array(a.p),n:Int8Array.from(a.n,v=>Math.round(clamp(v,-1,1)*127)),
        c:land?null:Uint8Array.from(a.c,v=>Math.round(clamp(v)*255)),uv:land?new Float32Array(a.uv):null,i:new I(a.i)};
    }
    function axis(total,start,near0,near1,nearStep,isX){
      const values=new Set();for(let i=0;i<total;i++){
        const t=(start+i*GRID.step)/GRID.scale;
        const stride=mobile?2:(isX&&Math.abs(t)<240)||(!isX&&t>64&&t<590)?1:3;
        if(i%stride===0||i===total-1)values.add(t);
      }
      for(let i=near0;i<=near1;i+=nearStep)values.add(i);
      return [...values].sort((a,b)=>a-b);
    }
    const xs=axis(GRID.nx,GRID.x0,-30,30,mobile?3:2,true);
    const ds=axis(GRID.nz,GRID.d0,-10,52,mobile?3:2,false);
    const ground=arrays();
    for(const d of ds)for(const u of xs){
      const [x,z]=map(u,d),v=height(u,d),e=Math.max(.18,Math.min(4,Math.hypot(u,d)*.024));
      const du=(height(u+e,d)-height(u-e,d))/(2*e),dd=(height(u,d+e)-height(u,d-e))/(2*e);
      const nx=-du*R[0]-dd*F[0],nz=-du*R[1]-dd*F[1],n=Math.hypot(nx,1,nz);
      vert(ground,[x,v,z],[nx/n,1/n,nz/n],[1,1,1],[u,d]);
    }
    for(let z=0;z<ds.length-1;z++)for(let x=0;x<xs.length-1;x++){
      const i=z*xs.length+x,j=i+xs.length;ground.i.push(i,i+1,j,i+1,j+1,j);
    }
    function interval(axis,v){
      let lo=0,hi=axis.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(axis[m]<=v)lo=m;else hi=m}return lo;
    }
    // Stems and shadow polygons sit on the exact tessellated surface rather
    // than the analytic height, which differs on either side of a triangle.
    function surface(u,d){
      const i=interval(xs,u),j=interval(ds,d),a=clamp((u-xs[i])/(xs[i+1]-xs[i])),b=clamp((d-ds[j])/(ds[j+1]-ds[j]));
      const k=i+j*xs.length,h=idx=>ground.p[idx*3+1],v=h(k),r=h(k+1),t=h(k+xs.length);
      return a+b<=1?v+(r-v)*a+(t-v)*b:r*(1-b)+t*(1-a)+h(k+xs.length+1)*(a+b-1);
    }
    const A=arrays(), shadows=arrays(), rand=rng(0x53414755), rr=(a,b)=>mix(a,b,rand());
    const rgb=(hex)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    const mod=(c,k)=>c.map(x=>x*k);
    const nor=(x,y,z)=>{const n=Math.hypot(x,y,z)||1;return [x/n,y/n,z/n]};
    function tube(nodes,c,sides=8,rib=0){
      const offsets=[];
      for(let j=0;j<nodes.length;j++){
        const v=nodes[j],p=nodes[Math.max(0,j-1)],q=nodes[Math.min(j+1,nodes.length-1)];
        const [tx,ty,tz]=nor(q[0]-p[0],q[1]-p[1],q[2]-p[2]);
        // Fixed longitudinal frame keeps each elbow continuous as it curves.
        const b=nor(ty,-tx,0),rx=b[1]*tz-b[2]*ty,ry=b[2]*tx-b[0]*tz,rz=b[0]*ty-b[1]*tx;
        offsets.push(A.p.length/3);
        for(let i=0;i<sides;i++){
          const a=i*Math.PI*2/sides,cosa=Math.cos(a),sina=Math.sin(a),
            nx=b[0]*cosa+rx*sina,ny=b[1]*cosa+ry*sina,nz=b[2]*cosa+rz*sina;
          const flute=(i%2?1-rib:1),radius=v[3]*flute;
          vert(A,[v[0]+nx*radius,v[1]+ny*radius,v[2]+nz*radius],[nx,ny,nz],mod(c,(i%2?1-rib*.65:1)*(.84+.16*(j/(nodes.length-1)))));
        }
        if(j){const a=offsets[j-1],b=offsets[j];for(let i=0;i<sides;i++){const k=(i+1)%sides;A.i.push(a+i,b+i,a+k,a+k,b+i,b+k)}}
      }
    }
    // Faceted stones and small olive leaf sprays, never camera-facing cards.
    function pebble(x,y,z,rx,ry,rz,c,segs=6){
      const rot=rr(0,6.28),start=A.p.length/3;let jitter=[];
      for(let i=0;i<segs;i++)jitter.push(rr(.80,1.12));
      for(let row=0;row<3;row++)for(let i=0;i<segs;i++){
        const a=rot+i*2*Math.PI/segs+.14*row, ring=[.8,1,.56][row]*jitter[i], yy=[-.19,.23,.82][row];
        const dx=Math.cos(a)*ring,dz=Math.sin(a)*ring;
        vert(A,[x+rx*dx,y+ry*(yy+rr(-.1,.1)),z+rz*dz],nor(dx,[-.45,.15,1.0][row],dz),mod(c,rr(.93,1.04)));
      }
      const top=vert(A,[x+rx*.13,y+ry,z-rz*.11],[.1,1,-.1],c);
      for(let i=0;i<segs;i++){const k=(i+1)%segs;
        for(let row=0;row<2;row++){const j=start+row*segs;A.i.push(j+i,j+i+segs,j+k,j+k,j+i+segs,j+k+segs)}
        A.i.push(start+2*segs+i,top,start+2*segs+k);
      }
    }
    function shade(x,z,dx,dz,wide,dark){
      // Surface-following penumbra; no second shadow atlas and no opaque
      // rectangles. Alpha is encoded per-vertex for a single batched draw.
      const len=Math.hypot(dx,dz)||1,px=-dz/len,pz=dx/len,st=shadows.p.length/3;
      for(let j=0;j<5;j++)for(let i=0;i<5;i++){
        const t=j/4,side=(i-2)/2,off=wide*side*[.35,.86,1,.78,.15][j];
        const xx=x+t*dx+px*off,zz=z+t*dz+pz*off,[u,d]=coord(xx,zz);
        const alpha=dark*(1-Math.abs(side)**1.6)*[.55,1,.91,.67,0][j];
        vert(shadows,[xx,surface(u,d)+.014,zz],[0,1,0],[alpha,0,0]);}
      for(let j=0;j<4;j++)for(let i=0;i<4;i++){const a=st+j*5+i;shadows.i.push(a,a+5,a+1,a+1,a+5,a+6)}
    }
    function cactus(u,d,H,mature=H>2.55){
      const [x,z]=map(u,d),y=surface(u,d)-.035,c=mod(rgb('#526950'),rr(.83,1.12)),r=H*rr(.031,.041);
      const leanX=rr(-.035,.035)*H,leanZ=rr(-.025,.025)*H;
      const nodes=[[0,.72],[.055,.91],[.28,1.03],[.65,.94],[.89,.85],[.965,.73],[.991,.46],[1,.055]].map(([t,w])=>[x+leanX*t*t,y+H*t,z+leanZ*t*t,r*w]);
      tube(nodes,c,d<65?12:8,.12);
      const phi=rr(0,6.28),num=mature?(H>3.75?2+(rand()>.53):1+(rand()>.42)):0;
      shade(x,z,-sun[0]/sun[1]*H,-sun[2]/sun[1]*H,r*1.26,.42);
      for(let j=0;j<num;j++){
        const ang=phi+j*2.60+rr(-.25,.25),ox=Math.cos(ang),oz=Math.sin(ang),arm=rr(.103,.196)*H,base=rr(.28,.56)*H,tip=Math.min(.96*H,base+rr(.22,.49)*H),rad=rr(.57,.76)*r;
        const stemX=x+leanX*(base/H)**2,stemZ=z+leanZ*(base/H)**2;
        const path=[[0,base,1],[.52,base-.012*H,.96],[.82,base+.024*H,1],[.98,base+.075*H,.98],[1,Math.max(base+.081*H,tip-.065*H),.91],[1.01,tip-.019*H,.68],[1.01,tip,.07]];
        tube(path.map(([t,hy,radMult])=>[stemX+ox*arm*t,y+hy,stemZ+oz*arm*t,rad*radMult]),c,d<65?8:6,.10);
      }
    }
    function bush(u,d,H,big){
      const [x,z]=map(u,d),y=surface(u,d)-.014;
      const stem=rgb(big?'#68684a':'#776b50'),col=mod(rgb(big?'#72805b':'#8b8962'),rr(.82,1.10));
      const rays=big?7:d<55?6:4,rot=rr(0,6.28);
      function sprig(bx,by,bz,phi,L,c){
        const dx=Math.cos(phi),dz=Math.sin(phi),up=rr(.25,.68);
        // Irregular compound-leaf sprays: actual free edges and air between
        // them. Avoid a crown of opaque spheres, even in the near silhouette.
        for(let j=0;j<6;j++){
          const side=j%2?1:-1,t=(j+.35)/6,ox=dx*t*L,oz=dz*t*L,oy=t*L*up;
          const ax=dx*.44+dz*.67*side,az=dz*.44-dx*.67*side,ay=rr(.10,.64);
          const len=L*(.40-.22*t)*rr(.8,1.15),wide=len*rr(.13,.27);
          const k=A.p.length/3,root=[bx+ox,by+oy,bz+oz],tip=[root[0]+len*ax,root[1]+len*ay,root[2]+len*az];
          const mid=[mix(root[0],tip[0],.50),mix(root[1],tip[1],.50),mix(root[2],tip[2],.50)],N=nor(dz*.3,.64,dx*.4);
          vert(A,root,N,mod(c,.70));vert(A,[mid[0]+az*wide,mid[1]+wide*.40,mid[2]-ax*wide],N,c);
          vert(A,tip,N,mod(c,rr(.94,1.20)));vert(A,[mid[0]-az*wide,mid[1]-wide*.1,mid[2]+ax*wide],N,c);
          A.i.push(k,k+1,k+2,k,k+2,k+3);
        }
      }
      for(let i=0;i<rays;i++){
        const a=rot+i*2.4+rr(-.39,.39),s=rr(.32,.87)*H,dx=Math.cos(a),dz=Math.sin(a);
        const xx=x+dx*s,zz=z+dz*s,hh=rr(.45,.82)*H,bx=x+dx*s*.45,bz=z+dz*s*.45,by=y+hh*.46;
        tube([[x,y-.018,z,H*(big?.021:.012)],[bx,by,bz,H*.010],[xx,y+hh,zz,.0035*H]],stem,4);
        for(let j=0;j<(d<65?4:2);j++){
          const side=j%2?1:-1,tt=rr(.25,.92),phi=a+side*rr(.36,1.07),l=rr(.17,.37)*H;
          const px=mix(bx,xx,tt),py=mix(by,y+hh,tt),pz=mix(bz,zz,tt);
          const ex=px+Math.cos(phi)*l,ey=py+l*rr(.35,.93),ez=pz+Math.sin(phi)*l;
          tube([[px,py,pz,H*.008],[ex,ey,ez,H*.003]],stem,3);
          const c=mod(col,rr(.81,1.16));sprig(mix(px,ex,.5),mix(py,ey,.5),mix(pz,ez,.5),phi,l*1.2,c);sprig(ex,ey,ez,phi+side*.46,l*.98,c);
        }
      }
      shade(x-H*.12,z,-sun[0]*H*1.65,-sun[2]*H*1.65,Math.max(.14,H*.56),.27);
    }
    // A few deliberately placed, asymmetrical family groups anchor the scale.
    [[-12,34,3.7],[13,44,4.9],[14.6,47,1.85],[-18,49,2.1],[-6.5,75,4.6],[22,66,3.7],[5.8,58,1.7],[-25,84,5.2]].forEach(v=>cactus(...v));
    for(let i=0;i<(mobile?41:66);i++){
      const d=rr(31,215),u=rr(-1,1)*(d*.68+15),[x,z]=map(u,d);
      if(Math.abs(z-.12)<4.2||wash(u,d)<2.7)continue;
      const H=1.1+4.25*rand()**1.35;cactus(u,d,H);
    }
    for(let i=0;i<(mobile?39:66);i++){
      const d=rr(-4,154),u=rr(-1,1)*(Math.max(4,d)*.73+9),[x,z]=map(u,d);
      if(Math.abs(z-.12)<4.3||wash(u,d)<1.15||Math.hypot(u,d)<9)continue;
      const big=rand()>.89,H=big?rr(1.0,1.95):rr(.20,.73);bush(u,d,H,big);
    }
    const tones=['#8c796a','#ab8c72','#76696a','#ae9b82','#867967'].map(rgb);
    for(let i=0;i<(mobile?160:240);i++){
      const d=rr(-4,75),u=rr(-1,1)*(Math.max(d,4)*.67+8),[x,z]=map(u,d);
      if(Math.abs(z-.12)<2.2)continue;
      const rad=rr(.035,.24)*(d>29&&rand()>.86?1.68:1),c=tones[(rand()*tones.length)|0];
      pebble(x,surface(u,d)+.01,z,rad,rad*rr(.50,.95),rad*rr(.68,1.25),c);
      if(rad>.29)shade(x-.15*rad,z,2.4*rad,rad*.85,rad,.24);
    }
    // Low, irregularly clustered perennial bunchgrasses break the bare
    // shoulder into sunlit awns; each blade is two tapered 3D segments.
    const grass=rgb('#a4936d'), grassBase=rgb('#6d7157');
    for(let i=0;i<(mobile?64:112);i++){
      const d=rr(0,83),u=rr(-1,1)*(d*.66+8),count=3+(rand()*8|0);
      for(let j=0;j<count;j++){
        const xx=u+rr(-1.2,1.2),dd=d+rr(-.8,.8),[x,z]=map(xx,dd);
        if(Math.abs(z-.12)<2.42||wash(xx,dd)<.85)continue;
        const y=surface(xx,dd)-.01,H=rr(.09,.32);
        for(let k=0;k<6;k++){
          const phi=rr(0,6.28),dx=Math.cos(phi),dz=Math.sin(phi),l=rr(.28,.86)*H,w=rr(.014,.035)*H,hh=rr(.38,.94)*H,idx=A.p.length/3,N=nor(dx,.55,dz);
          vert(A,[x-w*dz,y,z+w*dx],N,grassBase);vert(A,[x+w*dz,y,z-w*dx],N,grassBase);
          vert(A,[x+dx*l*.53+w*dz,y+hh*.56,z+dz*l*.53-w*dx],N,grass);
          vert(A,[x+dx*l*.53-w*dz,y+hh*.56,z+dz*l*.53+w*dx],N,grass);
          vert(A,[x+dx*l,y+hh,z+dz*l],N,mod(grass,1.13));
          A.i.push(idx,idx+1,idx+2,idx,idx+2,idx+3,idx+3,idx+2,idx+4);
        }
      }
    }
    return {ground:packed(ground,true),flora:packed(A),shadows:packed(shadows),noise:grainData(),reliefBytes:h.byteLength};
  }
  // Decoding and mesh generation are finite, cacheable operations. The normal
  // path builds typed arrays off the main thread alongside CAD transport.
  const workerScope=typeof WorkerGlobalScope!=='undefined' && self instanceof WorkerGlobalScope;
  if(workerScope){
    self.onmessage=({data:{heights,mobile}})=>{
      const value=build(heights,mobile),buffers=[value.noise.buffer];
      for(const g of [value.ground,value.flora,value.shadows])for(const v of Object.values(g))if(v)buffers.push(v.buffer);
      self.postMessage(value,buffers);
    };return;
  }
  const scriptURL=typeof document!=='undefined'?document.currentScript?.src:null;let prepared;
  function prefetch(mobile=window.matchMedia('(max-width:760px)').matches){
    return prepared ||= Promise.all([
      readHeights().then(h=>new Promise(resolve=>{
        if(!scriptURL||typeof Worker==='undefined')return resolve(build(h,mobile));
        let worker;try {worker=new Worker(scriptURL);
          worker.onmessage=({data})=>{worker.terminate();resolve(data)};
          worker.onerror=()=>{worker.terminate();resolve(build(h,mobile))};
          worker.postMessage({heights:h,mobile});
        }catch(_){worker?.terminate();resolve(build(h,mobile))}
      })),
      new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Tucson relief material unavailable'));im.src='/assets/models/tucson-mountains/surface.webp';})
    ]).then(([payload,surface])=>({payload,surface})).catch(e=>{prepared=null;throw e});
  }
  function create(T,scene,prepared,{mobile=false}={}){
    const bundle=prepared.payload || build(prepared,mobile);
    const group=new T.Group();group.name='Tucson Mountain District';scene.add(group);
    const texture=new T.DataTexture(bundle.noise,128,128,T.RGBAFormat);
    texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipMapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
    const reliefTex=new T.Texture(prepared.surface);reliefTex.flipY=false;reliefTex.magFilter=T.LinearFilter;
    reliefTex.generateMipmaps=false;reliefTex.minFilter=T.LinearFilter;reliefTex.needsUpdate=true;
    const U={grain:{value:texture},reliefShade:{value:reliefTex},reveal:{value:1}};
    const custom=(frag,extra={})=>new T.ShaderMaterial({vertexShader:vertex,fragmentShader:frag,uniforms:U,vertexColors:true,fog:false,toneMapped:false,...extra});
    function meshData(a,material,name){
      const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(a.p,3));
      g.setAttribute('normal',new T.BufferAttribute(a.n,3,true));
      if(a.c)g.setAttribute('color',new T.BufferAttribute(a.c,3,true));else g.setAttribute('color',new T.Uint8BufferAttribute(new Uint8Array(a.p.length).fill(255),3,true));
      if(a.uv)g.setAttribute('uv',new T.BufferAttribute(a.uv,2));
      g.setIndex(new T.BufferAttribute(a.i,1));g.computeBoundingSphere();
      const m=new T.Mesh(g,material);m.name=name;group.add(m);return m;
    }
    meshData(bundle.ground,custom(landFrag),'Gates Pass and Tucson Mountains / DEM + bajada');
    meshData(bundle.flora,custom(floraFrag,{side:T.DoubleSide}),'Saguaros, palo verdes, scrub and volcanic talus');
    const shadowFrag=common+`void main(){gl_FragColor=vec4(vec3(.15,.14,.16),tint.r*reveal);}`;
    const shadeMesh=meshData(bundle.shadows,custom(shadowFrag,{side:T.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),'Field cast shadows');shadeMesh.renderOrder=-1;
    const skyGeo=new T.SphereGeometry(1570,26,14);
    const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,toneMapped:false,uniforms:U,
      vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float reveal;uniform sampler2D grain;varying vec3 dir;
      void main(){vec3 v=normalize(dir);float h=max(v.y,0.);float facing=dot(v,normalize(vec3(-.88,.1,-.34)));
        vec3 horizon=mix(vec3(.681,.668,.735),vec3(.966,.762,.566),smoothstep(-.5,.78,facing));
        vec3 c=mix(horizon,vec3(.398,.530,.676),1.-exp(-h*7.1));
        c=mix(c,vec3(.190,.319,.462),smoothstep(.045,.56,h)*.94);
        vec2 skyUV=vec2(atan(v.z,v.x)*.49,h*3.3);
        c+=vec3(.079,.019,-.005)*exp(-pow((h-.028)/.057,2.))*smoothstep(-.80,.46,facing);
        float wisps=smoothstep(.56,.73,texture2D(grain,skyUV+vec2(.13,.42)).r)*smoothstep(.07,.23,h)*(1.-smoothstep(.4,.68,h));
        c+=wisps*vec3(.058,.052,.044);gl_FragColor=vec4(mix(vec3(.063,.071,.063),c,reveal),1.);
      }`});
    const sky=new T.Mesh(skyGeo,skyMat);sky.name='Sonoran low-sun sky';sky.renderOrder=-100;group.add(sky);
    return {group,stats:{triangles:(bundle.ground.i.length+bundle.flora.i.length+bundle.shadows.i.length)/3+skyGeo.index.count/3,draws:4,reliefBytes:bundle.reliefBytes},update(pose,framing,camera,width,height,amount){
      U.reveal.value=amount;group.visible=amount>.001;
      if(!group.visible)return;
      // The studio orbit looks down at a product. A low, level approach shows
      // the ridgeline; hand the original lens/pose back continuously for CAD.
      const target=framing.target,delta=camera.position.clone().sub(target),mobile=width/height<.9;
      const elev=Math.atan2(delta.y,Math.hypot(delta.x,delta.z)),wanted=(mobile?5.6:5.9)*Math.PI/180;
      const angle=mix(elev,wanted,amount),len=delta.length(),horizontal=Math.hypot(delta.x,delta.z)||1;
      camera.position.set(target.x+len*Math.cos(angle)*delta.x/horizontal,target.y+len*Math.sin(angle),target.z+len*Math.cos(angle)*delta.z/horizontal);
      camera.lookAt(target);camera.far=1950;camera.updateProjectionMatrix();
    }};
  }
  window.V2TucsonRelief={prefetch,create};
})();
