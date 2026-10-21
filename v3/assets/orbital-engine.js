/**
 * ORBITAL WORKSHOP / native WebGPU instrument.
 * No framework, textures, network requests, or synthetic GPU telemetry.
 * createOrbitalEngine returns immediately; .ready settles after startup so
 * destroy() remains available while adapter / pipeline requests are pending.
 */
const TAU = Math.PI * 2;
const BLUE = [0.025, 0.13, 0.93];
const DARK = [0.055, 0.065, 0.08];
const PAPER = [0.82, 0.83, 0.78];
const SILVER = [0.56, 0.61, 0.64];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const add = (a,b) => a.map((v,i) => v+b[i]);
const sub = (a,b) => a.map((v,i) => v-b[i]);
const mul = (a,s) => a.map(v => v*s);
const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = a => mul(a,1/(Math.hypot(...a)||1));
function rotate(p, r=[0,0,0]) {
  let [x,y,z]=p;
  let c=Math.cos(r[0]),s=Math.sin(r[0]); [y,z]=[y*c-z*s,y*s+z*c];
  c=Math.cos(r[1]);s=Math.sin(r[1]); [x,z]=[x*c+z*s,-x*s+z*c];
  c=Math.cos(r[2]);s=Math.sin(r[2]); return [x*c-y*s,x*s+y*c,z];
}
function perspective(fov, aspect, near, far) {
  const f=1/Math.tan(fov/2), nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,far*nf,-1,0,0,far*near*nf,0]);
}
function lookAt(eye, target) {
  const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function matrixMultiply(a,b) {
  const out=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}

// Each mesh contains position, face normal, pigment, and a motion-group index.
// Small group indices animate gimbal planes; 10+ indexes exploded-board tiers.
class Geometry {
  constructor() { this.vertices=[]; }
  triangle(a,b,c,color,group=0) {
    const n=norm(cross(sub(b,a),sub(c,a)));
    for(const p of [a,b,c]) this.vertices.push(...p,...n,...color,group);
  }
  quad(a,b,c,d,color,group=0) { this.triangle(a,b,c,color,group);this.triangle(a,c,d,color,group); }
  box(center,size,color=BLUE,rotation=[0,0,0],group=0) {
    const p=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
      .map(v=>add(rotate(v.map((x,i)=>x*size[i]/2),rotation),center));
    for(const face of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]])
      this.quad(...face.map(i=>p[i]),color,group);
  }
  rod(a,b,r=.012,color=DARK,group=0,sides=6) {
    const axis=norm(sub(b,a)),u=norm(cross(axis,Math.abs(axis[1])>.95?[1,0,0]:[0,1,0])),v=cross(axis,u);
    const ring=(c,i)=>add(c,add(mul(u,Math.cos(i*TAU/sides)*r),mul(v,Math.sin(i*TAU/sides)*r)));
    for(let i=0;i<sides;i++) {
      const p=ring(a,i),q=ring(a,i+1),t=ring(b,i+1),s=ring(b,i);
      this.quad(p,q,t,s,color,group);this.triangle(a,q,p,color,group);this.triangle(b,s,t,color,group);
    }
  }
  path(points,r=.009,color=DARK,group=0) {
    for(let i=1;i<points.length;i++) this.rod(points[i-1],points[i],r,color,group,5);
  }
  // A rectangular, not doughnut-shaped, machined annular band.
  band(radius,width,depth,start,end,rotation=[0,0,0],color=BLUE,group=0,center=[0,0,0]) {
    const steps=Math.max(2,Math.ceil((end-start)*24));
    const point=(a,r,z)=>add(rotate([Math.cos(a)*r,Math.sin(a)*r,z],rotation),center);
    const ri=radius-width/2,ro=radius+width/2,za=-depth/2,zb=depth/2;
    const edge=color.map(v=>v*.67);
    for(let i=0;i<steps;i++) {
      const a=start+(end-start)*i/steps,b=start+(end-start)*(i+1)/steps;
      this.quad(point(a,ri,zb),point(a,ro,zb),point(b,ro,zb),point(b,ri,zb),color,group);
      this.quad(point(a,ro,za),point(a,ri,za),point(b,ri,za),point(b,ro,za),edge,group);
      this.quad(point(a,ro,zb),point(a,ro,za),point(b,ro,za),point(b,ro,zb),edge,group);
      this.quad(point(a,ri,za),point(a,ri,zb),point(b,ri,zb),point(b,ri,za),edge,group);
    }
    this.quad(point(start,ri,za),point(start,ro,za),point(start,ro,zb),point(start,ri,zb),PAPER,group);
    this.quad(point(end,ro,za),point(end,ri,za),point(end,ri,zb),point(end,ro,zb),PAPER,group);
  }
  orbit(rx,ry,rotation=[0,0,0],r=.009,color=DARK,group=0,center=[0,0,0],start=0,end=TAU) {
    const points=Array.from({length:145},(_,i)=>add(rotate([rx*Math.cos(start+(end-start)*i/144),ry*Math.sin(start+(end-start)*i/144),0],rotation),center));
    this.path(points,r,color,group);
  }
  octahedron(center,r,color=BLUE,group=0,scale=[1,1,1]) {
    const p=[[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]].map(v=>add(v.map((x,i)=>x*scale[i]),center));
    for(const f of [[0,2,4],[4,2,1],[1,2,5],[5,2,0],[0,4,3],[4,1,3],[1,5,3],[5,0,3]]) this.triangle(...f.map(i=>p[i]),color,group);
  }
  build() { return new Float32Array(this.vertices); }
}
function cage(g,r=1.04,group=0) {
  const phi=(1+Math.sqrt(5))/2;
  const p=[[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],[0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]].map(v=>mul(norm(v),r));
  for(let i=0;i<p.length;i++) for(let j=i+1;j<p.length;j++) if(Math.hypot(...sub(p[i],p[j]))<r*1.1) g.rod(p[i],p[j],.014,DARK,group);
  for(const v of p) g.octahedron(v,.047,BLUE,group);
}
function orbitalGeometry() {
  const g=new Geometry();
  // Three independently rotating mechanical planes, open breaks, etched ticks.
  const planes=[{r:2.02,w:.24,d:.14,rot:[.38,.13,-.18],group:1}, {r:1.63,w:.19,d:.16,rot:[1.27,.38,.66],group:2}];
  for(const p of planes) {
    for(let i=0;i<6;i++) g.band(p.r,p.w,p.d,i*TAU/6+.065,i*TAU/6+.90,p.rot,BLUE,p.group);
    for(let i=0;i<48;i++) {
      const a=i*TAU/48;
      const u=rotate([Math.cos(a)*(p.r+.16),Math.sin(a)*(p.r+.16),0],p.rot);
      const v=rotate([Math.cos(a)*(p.r+(i%4===0?.27:.21)),Math.sin(a)*(p.r+(i%4===0?.27:.21)),0],p.rot);
      g.rod(u,v,.008,DARK,p.group,4);
    }
  }
  g.orbit(1.30,1.30,[.25,1.15,0],.018,DARK,3);
  g.orbit(2.63,1.00,[.57,-.25,.45],.008,DARK,0);
  g.orbit(2.30,1.75,[1.08,.62,-.5],.006,SILVER,0, [0,0,0],.30,5.94);
  cage(g,1.04,3);
  g.octahedron([0,0,0],.72,BLUE,4,[.83,1.2,.83]);
  g.rod([0,-1.60,0],[0,1.60,0],.035,DARK,3,10);
  for(const y of [-1.47,1.47]) {
    g.box([0,y,0],[.28,.12,.22],BLUE,[0,.35,.25],3);
    g.band(.13,.04,.16,0,TAU,[Math.PI/2,0,0],PAPER,3,[0,y,0]);
  }
  const satellites=[[2.44,.51,.5],[-2.16,-.8,-.55],[.15,2.30,.32]];
  satellites.forEach((p,i)=>{
    g.octahedron(p,.12,BLUE,0);
    if(i===0) {
      g.box(add(p,[.28,0,0]),[.32,.22,.025],BLUE,[.5,.25,.1]);
      g.box(add(p,[-.28,0,0]),[.32,.22,.025],BLUE,[.5,.25,.1]);
      g.rod(add(p,[-.48,0,0]),add(p,[.48,0,0]),.013,DARK);
    }
  });
  return g.build();
}
function telemetryGeometry() {
  const g=new Geometry();
  for(let i=0;i<7;i++) {
    const tilt=[.38+i*.17,.14+i*.06,-.23+i*.08];
    g.orbit(2.7-i*.12,.88+i*.15,tilt,i===3?.016:.006,i===3?BLUE:DARK,0);
  }
  g.orbit(1.02,1.02,[Math.PI/2,0,0],.018,BLUE,1);
  cage(g,.68,3);
  g.octahedron([0,0,0],.51,BLUE,4,[1.6,.7,.7]);
  for(let i=0;i<9;i++) {
    const angle=i*.7+.2;
    const p=rotate([2.55*Math.cos(angle),1.07*Math.sin(angle),0],[.73,.26,-.12]);
    g.box(p,i===1?[.32,.22,.24]:[.10,.10,.10],i%3===0?DARK:BLUE,[.3,.3,angle],1);
    if(i===1) {
      for(const x of [-.50,.50]) {
        const wing=add(p,[x,0,0]);g.box(wing,[.58,.51,.025],BLUE,[.16,.2,0],1);
        for(let n=-2;n<=2;n++) g.rod(add(wing,[-.27,n*.08,.025]),add(wing,[.27,n*.08,.025]),.006,PAPER,1,4);
      }
      g.rod(add(p,[-.8,0,0]),add(p,[.8,0,0]),.018,DARK,1);
      g.rod(p,add(p,[0,.55,0]),.012,DARK,1);g.octahedron(add(p,[0,.55,0]),.045,BLUE,1);
    }
  }
  const trail=Array.from({length:95},(_,i)=>{
    const a=i/94*4.8;return [(a-2.4)*1.1,Math.sin(a*1.8)*.24+.5,Math.cos(a*.8)*.8];
  });
  g.path(trail,.023,BLUE,0);
  for(let i=0;i<20;i++) { const x=-2.5+i*.26;g.rod([x,-1.65,0],[x,-1.65+(i%5===0?.14:.07),0],.007,DARK); }
  return g.build();
}
function electronicsGeometry() {
  const g=new Geometry();
  const tiers=[-1.12,-.1,1.04];
  tiers.forEach((y,i)=>{
    const group=10+i;
    g.box([0,y,0],[2.05,.085,1.58],i===1?DARK:BLUE,[0,0,0],group);
    for(const x of [-.88,.88]) for(const z of [-.65,.65]) {
      g.rod([x,y-.08,z],[x,y+.13,z],.06,PAPER,group,10);
      g.rod([x,-1.48,z],[x,1.45,z],.009,SILVER,0,5);
    }
    for(let n=0;n<8;n++) {
      const x=-.73+n*.205;
      g.box([x,y+.08,-.81],[.07,.075,.15],PAPER,[0,0,0],group);
      g.box([x,y+.08,.81],[.07,.075,.15],PAPER,[0,0,0],group);
      g.path([[x,y+.05,-.65],[x,y+.05,-.4],[x*.52,y+.05,-.21]],.009,i===1?BLUE:PAPER,group);
    }
    g.box([-.06,y+.16,0],[.64,.22,.66],i===2?PAPER:DARK,[0,0,0],group);
    for(let k=0;k<6;k++) {
      const x=-.29+k*.1;
      g.box([x,y+.15,-.39],[.034,.05,.16],SILVER,[0,0,0],group);
      g.box([x,y+.15,.39],[.034,.05,.16],SILVER,[0,0,0],group);
    }
    for(const x of [-.69,.65]) for(const z of [-.4,.11,.48]) g.box([x,y+.13,z],[.17,.17,.24],i===1?BLUE:DARK,[0,0,0],group);
  });
  for(let i=0;i<11;i++) g.box([-.62+i*.125,1.32,0],[.047,.18,.59],BLUE,[0,0,0],12);
  g.orbit(2.15,1.82,[Math.PI/2,0,.15],.006,DARK,0,[0,-1.5,0],.2,5.8);
  g.box([0,-1.58,0],[2.35,.045,1.9],PAPER);
  return g.build();
}
function audioGeometry() {
  const g=new Geometry();
  // A physical oscilloscope waveform: 61 separated rectangular resonators.
  for(let i=0;i<61;i++) {
    const x=(i-30)*.075;
    const envelope=.12+Math.exp(-x*x*.47)*1.25;
    const h=.14+Math.abs(Math.sin(i*.37)*Math.cos(i*.13))*envelope*1.6;
    g.box([x,0,0],[.043,h,.17],BLUE,[0,0,0],20);
    g.box([x,-1.36,0],[.042,.025,.66],DARK,[0,0,0],0);
  }
  for(let n=0;n<5;n++) {
    const path=Array.from({length:121},(_,i)=>{
      const x=(i/120-.5)*4.8;
      return [x,Math.sin(x*3.4+n*.38)*Math.exp(-x*x*.26)*.72,(n-2)*.28];
    });
    g.path(path,n===2?.017:.008,n===2?DARK:SILVER,21);
  }
  g.orbit(1.48,1.48,[0,Math.PI/2,0],.023,DARK,0,[-2.26,0,0]);
  g.band(1.53,.09,.08,0,TAU,[0,Math.PI/2,0],BLUE,0,[-2.26,0,0]);
  g.orbit(1.15,1.15,[0,Math.PI/2,0],.011,DARK,0,[2.3,0,0]);
  g.rod([-2.7,-1.36,0],[2.7,-1.36,0],.015,DARK);
  for(const x of [-2.65,2.65]) g.box([x,-1.36,0],[.12,.12,.12],BLUE);
  return g.build();
}

const SHADER = /* wgsl */ `
struct Scene {
  viewProjection: mat4x4<f32>,
  rotation: vec4<f32>,
  settings: vec4<f32>,
};
@group(0) @binding(0) var<uniform> scene: Scene;
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec3<f32>,
  @location(3) motion: f32,
};
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) world: vec3<f32>,
};
fn rotateX(p:vec3<f32>,a:f32)->vec3<f32>{let c=cos(a);let s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
fn rotateY(p:vec3<f32>,a:f32)->vec3<f32>{let c=cos(a);let s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
fn rotateZ(p:vec3<f32>,a:f32)->vec3<f32>{let c=cos(a);let s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}
@vertex fn vertexMain(v:VertexInput)->VertexOutput {
  var p=v.position; var n=v.normal;
  let t=scene.rotation.w;
  if(v.motion==1.0){p=rotateY(p,t*.11);n=rotateY(n,t*.11);}
  if(v.motion==2.0){p=rotateX(p,t*-.14);n=rotateX(n,t*-.14);}
  if(v.motion==3.0){p=rotateZ(p,t*.08);n=rotateZ(n,t*.08);}
  if(v.motion==4.0){p=rotateY(p,t*-.22);n=rotateY(n,t*-.22);}
  if(v.motion>=10.0 && v.motion<=12.0){p.y+=(v.motion-11.0)*sin(t*.65)*.075;}
  if(v.motion==20.0){let a=.76+.24*sin(t*1.4+p.x*1.5);p.y*=a;n=normalize(vec3(n.x,n.y/max(a,.1),n.z));}
  if(v.motion==21.0){p.y+=sin(t*1.1+p.x*1.7)*.055;}
  p=rotateY(rotateX(p,scene.rotation.x),scene.rotation.y);
  n=rotateY(rotateX(n,scene.rotation.x),scene.rotation.y);
  p=rotateZ(p,scene.rotation.z)*scene.settings.y;n=rotateZ(n,scene.rotation.z);
  var out:VertexOutput;
  out.position=scene.viewProjection*vec4(p,1.0);
  out.normal=n;out.color=v.color;out.world=p;
  return out;
}
@fragment fn fragmentMain(v:VertexOutput,@builtin(front_facing) front:bool)->@location(0) vec4<f32> {
  let n=normalize(v.normal)*select(-1.0,1.0,front);
  let key=max(0.0,dot(n,normalize(vec3(-.45,.8,1.2))));
  let fill=max(0.0,dot(n,normalize(vec3(.7,-.2,.4))));
  let rim=pow(1.0-abs(dot(n,normalize(vec3(0.0,0.0,1.0)))),3.0);
  let shade=.63+.36*key+.07*fill;
  let pigment=v.color*shade;
  let highlight=vec3(.15,.19,.21)*pow(max(0.0,dot(reflect(normalize(vec3(.45,-.8,-1.2)),n),normalize(vec3(0.0,0.0,1.0)))),36.0);
  let color=clamp(pigment+highlight+rim*.018,vec3(0.0),vec3(1.0));
  return vec4(color*scene.settings.z,scene.settings.z);
}
`;

export function createOrbitalEngine({ canvas, onStatus = () => {} } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('An HTML canvas is required.');
  const motionQuery=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
  const state={backend:'static',reason:'initializing',mode:0,paused:false,visible:true,reducedMotion:!!motionQuery?.matches,submittedFrames:0,completedFrames:0,renderedFrames:0,width:0,height:0,destroyed:false,softwareAdapter:false};
  let device=null,context=null,pipeline=null,bindGroup=null,uniformBuffer=null,depth=null,colorTarget=null;
  let buffers=[],meshes=[],fallbackContext=null,fallbackCanvas=null,raf=0,dirty=true,intersecting=true;
  let lastTime=0,elapsed=0,pointer=[0,0],currentPointer=[0,0],completionPending=false,gpuReady=false;
  let firstCompletionResolve;
  let fallbackEntered=false;
  let startupFinished=false,transition=null,displayMode=0,transitionScale=1,transitionOpacity=1,transitionSwing=0;
  const uniformData=new Float32Array(24);
  const originalVisibility=canvas.style.visibility;
  const initialCompletion=new Promise(resolve=>{firstCompletionResolve=resolve;});
  const isAlive=()=>!state.destroyed && canvas.isConnected;
  const isVisible=()=>state.visible&&intersecting&&!document.hidden&&isAlive();
  const isAnimating=()=>isVisible()&&!state.paused&&!state.reducedMotion;
  function report(backend,reason,detail) {
    if(state.destroyed)return;
    const changed=state.backend!==backend||state.reason!==reason;
    state.backend=backend;state.reason=reason;
    if(changed||detail) { try { onStatus({...state,...detail}); } catch { /* Consumer UI cannot break rendering. */ } }
  }
  function releaseGPU() {
    gpuReady=false;completionPending=false;
    depth?.destroy();colorTarget?.destroy();depth=null;colorTarget=null;
    for(const buffer of buffers)buffer?.destroy();buffers=[];
    uniformBuffer?.destroy();uniformBuffer=null;meshes=[];
    try {context?.unconfigure();}catch{}
    if(device){const old=device;device=null;old.destroy();}
    pipeline=null;bindGroup=null;
  }
  function fallback(reason) {
    if(state.destroyed||fallbackEntered)return;
    fallbackEntered=true;
    releaseGPU();transition=null;displayMode=state.mode;transitionScale=1;transitionOpacity=1;transitionSwing=0;
    try {
      fallbackContext=canvas.getContext('2d');
      if(!fallbackContext && canvas.parentElement) {
        fallbackCanvas=canvas.cloneNode(false);fallbackCanvas.removeAttribute('id');fallbackCanvas.removeAttribute('data-orbital-canvas');
        fallbackCanvas.setAttribute('aria-hidden','true');fallbackCanvas.dataset.orbitalFallback='';
        fallbackCanvas.style.cssText=canvas.style.cssText;
        Object.assign(fallbackCanvas.style,{position:'absolute',pointerEvents:'none',left:`${canvas.offsetLeft}px`,top:`${canvas.offsetTop}px`,width:`${canvas.clientWidth}px`,height:`${canvas.clientHeight}px`,visibility:'visible'});
        canvas.insertAdjacentElement('afterend',fallbackCanvas);canvas.style.visibility='hidden';
        fallbackContext=fallbackCanvas.getContext('2d');
      }
    }catch{}
    report(fallbackContext?'canvas2d':'static',reason);
    firstCompletionResolve(false);resize();invalidate();
  }
  function resize() {
    if(state.destroyed)return;
    const rect=canvas.getBoundingClientRect();
    const cssWidth=Math.max(1,rect.width||canvas.clientWidth||1),cssHeight=Math.max(1,rect.height||canvas.clientHeight||1);
    // Strict pixel budget prevents huge desktop displays from exhausting fill rate.
    const dpr=Math.min(devicePixelRatio||1,1.8,Math.sqrt(2200000/(cssWidth*cssHeight)));
    const width=Math.max(1,Math.round(cssWidth*dpr)),height=Math.max(1,Math.round(cssHeight*dpr));
    if(width===state.width&&height===state.height&&!(!depth&&gpuReady))return;
    state.width=width;state.height=height;canvas.width=width;canvas.height=height;
    if(fallbackCanvas) {
      fallbackCanvas.width=width;fallbackCanvas.height=height;
      Object.assign(fallbackCanvas.style,{left:`${canvas.offsetLeft}px`,top:`${canvas.offsetTop}px`,width:`${cssWidth}px`,height:`${cssHeight}px`});
    }
    if(gpuReady&&device) {
      depth?.destroy();colorTarget?.destroy();
      depth=device.createTexture({label:'Orbital depth / 4×',size:[width,height],format:'depth24plus',sampleCount:4,usage:GPUTextureUsage.RENDER_ATTACHMENT});
      colorTarget=device.createTexture({label:'Orbital color / 4×',size:[width,height],format:navigator.gpu.getPreferredCanvasFormat(),sampleCount:4,usage:GPUTextureUsage.RENDER_ATTACHMENT});
    }
    invalidate();
  }
  function invalidate(){dirty=true;if(!raf&&isVisible())raf=requestAnimationFrame(frame);}
  function modelPose() {
    const poses=[[.12,-.35,-.08],[.20,-.26,-.18],[.30,-.46,-.12],[.18,-.39,-.10]];
    const p=poses[displayMode];
    return [p[0]+currentPointer[1]*.16-transitionSwing*.12,p[1]+currentPointer[0]*.28+transitionSwing*.48,p[2]-transitionSwing*.06];
  }
  function renderGPU() {
    if(!gpuReady||!device||!depth||!colorTarget)return;
    const aspect=state.width/state.height;
    // Equal visual scale on portrait and landscape, without slicing the orbit.
    const distance=aspect<1?8.8/Math.max(.67,aspect):8.8;
    const vp=matrixMultiply(perspective(.66,aspect,.1,50),lookAt([0,0,distance],[0,0,0]));
    uniformData.set(vp);uniformData.set([...modelPose(),elapsed],16);uniformData.set([displayMode,transitionScale,transitionOpacity,0],20);
    device.queue.writeBuffer(uniformBuffer,0,uniformData);
    const encoder=device.createCommandEncoder({label:'Orbital frame'});
    const pass=encoder.beginRenderPass({
      label:'Machined forms / lit depth pass',
      colorAttachments:[{view:colorTarget.createView(),resolveTarget:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'discard'}],
      depthStencilAttachment:{view:depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard'}
    });
    pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.setVertexBuffer(0,meshes[displayMode].buffer);pass.draw(meshes[displayMode].count);pass.end();
    device.queue.submit([encoder.finish()]);state.submittedFrames++;state.renderedFrames++;
    // At most one fence Promise is live. It only accounts for work actually
    // submitted before that fence, never the frames submitted subsequently.
    if(!completionPending) {
      completionPending=true;const submitted=state.submittedFrames;const currentDevice=device;
      currentDevice.queue.onSubmittedWorkDone().then(()=>{
        if(state.destroyed||device!==currentDevice)return;
        completionPending=false;state.completedFrames=Math.max(state.completedFrames,submitted);
        report('webgpu','native-renderer-ready');firstCompletionResolve(true);
      }).catch(()=>{if(!state.destroyed&&device===currentDevice)fallback('gpu-queue-error');});
    }
  }
  function project(p,width,height) {
    const r=modelPose();const q=rotate(p,r);const aspect=width/height;
    const distance=aspect<1?8.8/Math.max(.67,aspect):8.8;
    const scale=height/(2*Math.tan(.66/2)*(distance-q[2]));
    return [width/2+q[0]*scale,height/2-q[1]*scale,q[2]];
  }
  function renderFallback() {
    const c=fallbackContext;if(!c)return;
    const width=state.width,height=state.height;c.clearRect(0,0,width,height);
    // Static, deterministic projection of the very same engineered geometry,
    // face-sorted for depth. This is not passed off as GPU rendering.
    const source=meshData[displayMode],faces=[];
    for(let i=0;i<source.length;i+=30) {
      const points=[0,10,20].map(j=>project([source[i+j],source[i+j+1],source[i+j+2]],width,height));
      const area=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]);
      if(Math.abs(area)<.08)continue;
      const n=rotate([source[i+3],source[i+4],source[i+5]],modelPose());
      const shade=.65+.34*Math.abs(dot(norm(n),norm([-.45,.8,1.2])));
      const color=[source[i+6],source[i+7],source[i+8]].map(v=>Math.round(clamp(v*shade,0,1)*255));
      faces.push({points,z:(points[0][2]+points[1][2]+points[2][2])/3,color});
    }
    faces.sort((a,b)=>a.z-b.z);
    c.lineJoin='round';c.lineWidth=.45;
    for(const f of faces) {
      c.beginPath();c.moveTo(f.points[0][0],f.points[0][1]);c.lineTo(f.points[1][0],f.points[1][1]);c.lineTo(f.points[2][0],f.points[2][1]);c.closePath();
      c.fillStyle=`rgb(${f.color.join(',')})`;c.fill();
      c.strokeStyle=c.fillStyle;c.stroke();
    }
    state.renderedFrames++;
  }
  function frame(now) {
    raf=0;if(!isVisible()){lastTime=0;return;}
    const dt=lastTime?Math.min(.05,(now-lastTime)/1000):0;lastTime=now;
    if(isAnimating()&&gpuReady)elapsed+=dt;
    if(transition) {
      transition.progress=Math.min(1,transition.progress+dt/.62);
      const progress=transition.progress;
      // Withdraw the old fixture, index through a quarter turn, then reveal
      // the new one. An interrupted change starts from the displayed fixture.
      displayMode=progress<.5?transition.from:transition.to;
      transitionSwing=Math.sin(progress*Math.PI);
      transitionScale=1-transitionSwing*.18;
      transitionOpacity=Math.pow(Math.abs(Math.cos(progress*Math.PI)),.65);
      if(progress>=1){displayMode=transition.to;transition=null;transitionScale=1;transitionOpacity=1;transitionSwing=0;}
    }
    const movingPointer=Math.abs(pointer[0]-currentPointer[0])+Math.abs(pointer[1]-currentPointer[1])>.001;
    // Fallback is intentionally static. Input and mode changes still redraw.
    currentPointer=currentPointer.map((v,i)=>state.reducedMotion||!gpuReady?pointer[i]:v+(pointer[i]-v)*.11);
    const needsDraw=dirty;dirty=false;
    try {if(gpuReady)renderGPU();else if(needsDraw&&fallbackContext)renderFallback();}
    catch(error){fallback('render-error');}
    if(gpuReady&&(isAnimating()||movingPointer||transition))raf=requestAnimationFrame(frame);
  }
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  resizeObserver?.observe(canvas);
  const intersectionObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    intersecting=entries[0]?.isIntersecting??true;
    if(!intersecting){if(raf)cancelAnimationFrame(raf);raf=0;lastTime=0;firstCompletionResolve(false);}else invalidate();
  },{rootMargin:'40px'}):null;
  intersectionObserver?.observe(canvas);
  function visibilityChanged(){if(!isVisible()){cancelAnimationFrame(raf);raf=0;lastTime=0;firstCompletionResolve(false);}else invalidate();}
  function motionChanged(event){state.reducedMotion=event.matches;if(event.matches){transition=null;displayMode=state.mode;transitionScale=1;transitionOpacity=1;transitionSwing=0;pointer=[0,0];currentPointer=[0,0];}lastTime=0;invalidate();}
  document.addEventListener('visibilitychange',visibilityChanged);
  window.addEventListener('resize',resize,{passive:true});
  motionQuery?.addEventListener?.('change',motionChanged);
  const meshData=[orbitalGeometry(),telemetryGeometry(),electronicsGeometry(),audioGeometry()];
  const controller={
    setMode(index){
      if(state.destroyed)return;const mode=clamp(Math.round(Number(index)||0),0,3);
      if(mode!==state.mode){
        state.mode=mode;elapsed=0;
        if(gpuReady&&!state.reducedMotion&&!state.paused)transition={from:displayMode,to:mode,progress:0};
        else {transition=null;displayMode=mode;transitionScale=1;transitionOpacity=1;transitionSwing=0;}
        invalidate();
      }
    },
    setPointer(x,y){if(state.destroyed||!gpuReady||state.reducedMotion)return;pointer=[clamp(Number(x)||0,-1,1),clamp(Number(y)||0,-1,1)];invalidate();},
    setPaused(paused){if(state.destroyed)return;state.paused=!!paused;lastTime=0;if(state.paused){transition=null;displayMode=state.mode;transitionScale=1;transitionOpacity=1;transitionSwing=0;currentPointer=[...pointer];}if(state.paused&&raf){cancelAnimationFrame(raf);raf=0;}invalidate();},
    setVisible(visible){if(state.destroyed)return;state.visible=!!visible;visibilityChanged();},
    getState(){return {...state,initializing:!startupFinished,displayedMode:displayMode,transitioning:!!transition,vertices:meshData[state.mode].length/10,time:elapsed};},
    destroy(){
      if(state.destroyed)return;state.destroyed=true;cancelAnimationFrame(raf);raf=0;
      resizeObserver?.disconnect();intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('resize',resize);
      motionQuery?.removeEventListener?.('change',motionChanged);releaseGPU();
      fallbackCanvas?.remove();canvas.style.visibility=originalVisibility;firstCompletionResolve(false);
    },
    ready:null
  };
  controller.ready=(async()=>{
    try {
      if(navigator.connection?.saveData){fallback('save-data');return controller;}
      if(!navigator.gpu){fallback('webgpu-unavailable');return controller;}
      const force=new URLSearchParams(location.search).get('gpu')==='force';
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
      if(!isAlive())return controller;
      if(!adapter){fallback('adapter-unavailable');return controller;}
      const info=adapter.info||{};
      state.softwareAdapter=adapter.isFallbackAdapter===true||info.isFallbackAdapter===true||/swiftshader|llvmpipe|software|lavapipe/i.test(`${info.device||''} ${info.description||''} ${info.vendor||''}`);
      if(state.softwareAdapter&&!force){fallback('software-adapter');return controller;}
      const newDevice=await adapter.requestDevice({label:'Orbital Workshop native renderer'});
      if(!isAlive()){newDevice.destroy();return controller;}device=newDevice;
      device.lost.then(info=>{if(!state.destroyed&&device===newDevice)fallback(`device-lost:${info.reason||'unknown'}`);});
      device.addEventListener('uncapturederror',event=>{
        event.preventDefault();if(!state.destroyed&&device===newDevice)fallback('gpu-validation-error');
      });
      const shader=device.createShaderModule({label:'Orbital lit geometry WGSL',code:SHADER});
      if(shader.getCompilationInfo) {
        const compilation=await shader.getCompilationInfo();
        if(!isAlive()||device!==newDevice)return controller;
        if(compilation.messages.some(message=>message.type==='error'))throw new Error('shader-compilation-failed');
      }
      device.pushErrorScope('validation');
      let scopeError=null;
      try {
        pipeline=await device.createRenderPipelineAsync({
          label:'Orbital solid pigment / four-sample depth',layout:'auto',
          vertex:{module:shader,entryPoint:'vertexMain',buffers:[{arrayStride:40,attributes:[
            {shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},
            {shaderLocation:2,offset:24,format:'float32x3'},{shaderLocation:3,offset:36,format:'float32'}]}]},
          fragment:{module:shader,entryPoint:'fragmentMain',targets:[{format:navigator.gpu.getPreferredCanvasFormat(),blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},
          primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'},multisample:{count:4}
        });
      } finally {scopeError=await newDevice.popErrorScope();}
      if(!isAlive()||device!==newDevice)return controller;
      if(scopeError)throw new Error('pipeline-validation-failed');
      uniformBuffer=device.createBuffer({label:'Orbital camera and motion',size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      bindGroup=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniformBuffer}}]});
      meshes=meshData.map((data,index)=>{
        const buffer=device.createBuffer({label:`Orbital assembly ${index}`,size:data.byteLength,usage:GPUBufferUsage.VERTEX,mappedAtCreation:true});
        new Float32Array(buffer.getMappedRange()).set(data);buffer.unmap();buffers.push(buffer);return {buffer,count:data.length/10};
      });
      context=canvas.getContext('webgpu');if(!context)throw new Error('canvas-context-unavailable');
      context.configure({device,format:navigator.gpu.getPreferredCanvasFormat(),alphaMode:'premultiplied'});
      gpuReady=true;resize();invalidate();
      // A hidden/offscreen canvas must not keep startup awaiting animation.
      // ready means setup is complete; status remains "static/initializing"
      // until a real visible frame crosses the GPU queue completion fence.
      if(isVisible())await initialCompletion;
      return controller;
    } catch(error) {
      if(!state.destroyed)fallback(error?.message==='shader-compilation-failed'?'shader-compilation-failed':'webgpu-initialization-failed');
      return controller;
    } finally {
      startupFinished=true;
      if(!isAlive()&&!state.destroyed)controller.destroy();
    }
  })();
  return controller;
}
