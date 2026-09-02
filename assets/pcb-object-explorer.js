(() => {
  'use strict';
  if (!window.THREE) return;
  const config = window.PCB_OBJECT_CONFIG;
  const root = document.querySelector('[data-pcb-object]');
  const canvas = root?.querySelector('[data-pcb-object-canvas]');
  if (!config || !root || !canvas) return;

  const THREE = window.THREE;
  const d2r = THREE.MathUtils.degToRad;
  const clamp = THREE.MathUtils.clamp;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080a0b);
  const camera = new THREE.PerspectiveCamera(34, 1, Math.max(0.5, Math.min(config.width, config.height) * 0.01), Math.max(config.width, config.height) * 12);
  const board = new THREE.Group();
  board.rotation.y = d2r(config.boardRotation || 0);
  scene.add(board);

  scene.add(new THREE.HemisphereLight(0xe8ece9, 0x171512, 1.35));
  const key = new THREE.DirectionalLight(0xfffbf4, 1.65); key.position.set(-0.65, 1.4, 0.85).multiplyScalar(Math.max(config.width, config.height)); key.castShadow = true; scene.add(key);
  const fill = new THREE.DirectionalLight(0xd9e4ef, 0.58); fill.position.set(1.2, 0.75, -1).multiplyScalar(Math.max(config.width, config.height)); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd7ae, 0.32); rim.position.set(-1.2, 0.35, -0.8).multiplyScalar(Math.max(config.width, config.height)); scene.add(rim);

  const materials = {
    edge: new THREE.MeshStandardMaterial({ color: config.edgeColor || 0x15191a, roughness: 0.78, metalness: 0.02 }),
    black: new THREE.MeshStandardMaterial({ color: 0x090b0c, roughness: 0.62, metalness: 0.03 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x080a0b, roughness: 0.48, metalness: 0.02 }),
    chipTop: new THREE.MeshStandardMaterial({ color: 0x141719, roughness: 0.42, metalness: 0.03 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xa7afb2, roughness: 0.28, metalness: 0.88 }),
    darkSilver: new THREE.MeshStandardMaterial({ color: 0x586064, roughness: 0.34, metalness: 0.78 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xaa762c, roughness: 0.34, metalness: 0.8 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xb7aa8f, roughness: 0.58, metalness: 0.01 }),
    ceramicDark: new THREE.MeshStandardMaterial({ color: 0x857861, roughness: 0.62, metalness: 0.01 }),
    greenCeramic: new THREE.MeshStandardMaterial({ color: 0x556441, roughness: 0.64, metalness: 0.01 }),
    ferrite: new THREE.MeshStandardMaterial({ color: 0x282b2b, roughness: 0.55, metalness: 0.04 }),
    resistorBody: new THREE.MeshStandardMaterial({ color: 0x151718, roughness: 0.56, metalness: 0.02 }),
    solder: new THREE.MeshStandardMaterial({ color: 0x8e979a, roughness: 0.30, metalness: 0.82 }),
    led: new THREE.MeshPhysicalMaterial({ color: 0xe3ded1, roughness: 0.36, metalness: 0.01, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    ledWindow: new THREE.MeshBasicMaterial({ color: 0x697568, transparent: true, opacity: 0.72 }),
    white: new THREE.MeshBasicMaterial({ color: 0xf1eee6 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xa97846, roughness: 0.35, metalness: 0.82 })
  };

  const roundedRectShape = (w, h, r = 0) => {
    const s = new THREE.Shape(); const x = -w / 2, y = -h / 2; const rr = Math.min(r, w / 2, h / 2);
    s.moveTo(x + rr, y); s.lineTo(x + w - rr, y); s.quadraticCurveTo(x + w, y, x + w, y + rr);
    s.lineTo(x + w, y + h - rr); s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    s.lineTo(x + rr, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rr);
    s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y); s.closePath(); return s;
  };

  const bodyShape = roundedRectShape(config.width, config.height, config.radius || 1.5);
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, { depth: config.thickness, bevelEnabled: false, curveSegments: 24, steps: 1 });
  bodyGeo.rotateX(-Math.PI / 2); bodyGeo.translate(0, -config.thickness / 2, 0);
  const bodyMesh = new THREE.Mesh(bodyGeo, materials.edge); bodyMesh.receiveShadow = true; board.add(bodyMesh);

  const surfaceShape = roundedRectShape(config.width - 0.06, config.height - 0.06, Math.max(0, (config.radius || 1.5) - 0.04));
  const surfaceGeo = new THREE.ShapeGeometry(surfaceShape, 24); surfaceGeo.rotateX(-Math.PI / 2);
  { const p = surfaceGeo.getAttribute('position'); const uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i += 1) { uv[i*2] = (p.getX(i) + config.width/2) / config.width; uv[i*2+1] = (p.getZ(i) + config.height/2) / config.height; } surfaceGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  const topMat = new THREE.MeshPhysicalMaterial({ color: config.maskColor || 0x070909, roughness: 0.66, metalness: 0.015, clearcoat: 0.16, clearcoatRoughness: 0.62, side: THREE.DoubleSide });
  const bottomMat = new THREE.MeshPhysicalMaterial({ color: config.bottomColor || config.maskColor || 0x070909, roughness: 0.70, metalness: 0.01, clearcoat: 0.12, clearcoatRoughness: 0.68, side: THREE.DoubleSide });
  const topSurface = new THREE.Mesh(surfaceGeo, topMat); topSurface.position.y = config.thickness / 2 + 0.008; topSurface.renderOrder = 2; topSurface.receiveShadow=true; board.add(topSurface);
  const bottomSurface = new THREE.Mesh(surfaceGeo.clone(), bottomMat); bottomSurface.rotation.z = Math.PI; bottomSurface.position.y = -config.thickness / 2 - 0.008; bottomSurface.renderOrder = 2; bottomSurface.receiveShadow=true; board.add(bottomSurface);

  const textureCanvas = (draw, width, height) => {
    const c = document.createElement('canvas'); c.width = width; c.height = height; const ctx = c.getContext('2d'); draw(ctx, width, height); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.minFilter = THREE.LinearMipmapLinearFilter; return t;
  };

  const applyTopTexture = (texture) => { texture.encoding = THREE.sRGBEncoding; texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); topMat.map = texture; topMat.color.setHex(0xffffff); topMat.needsUpdate = true; };
  const applyBottomTexture = (texture) => { texture.encoding = THREE.sRGBEncoding; texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); bottomMat.map = texture; bottomMat.color.setHex(0xffffff); bottomMat.needsUpdate = true; };

  if (config.drawTop) applyTopTexture(textureCanvas(config.drawTop, config.textureWidth || 1600, config.textureHeight || Math.round((config.height / config.width) * (config.textureWidth || 1600))));
  if (config.drawBottom) applyBottomTexture(textureCanvas(config.drawBottom, config.textureWidth || 1600, config.textureHeight || Math.round((config.height / config.width) * (config.textureWidth || 1600))));
  const loadCroppedImageTexture = (url, crop, apply) => { const img = new Image(); img.decoding='async'; img.onload=()=>{ if(!crop){ const t=new THREE.Texture(img); t.needsUpdate=true; apply(t); return; } const c=document.createElement('canvas'); c.width=crop.outW||1600; c.height=crop.outH||1600; const ctx=c.getContext('2d'); ctx.fillStyle=crop.fill||'#080a0b';ctx.fillRect(0,0,c.width,c.height); const sx=(crop.x||0)*img.naturalWidth, sy=(crop.y||0)*img.naturalHeight, sw=(crop.w||1)*img.naturalWidth, sh=(crop.h||1)*img.naturalHeight; ctx.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height); const t=new THREE.CanvasTexture(c); t.needsUpdate=true; apply(t); }; img.onerror=(e)=>console.warn('PCB texture failed',e); img.src=url; };
  if (config.topImage) loadCroppedImageTexture(config.topImage, config.topImageCrop, applyTopTexture);
  if (config.bottomImage) loadCroppedImageTexture(config.bottomImage, config.bottomImageCrop, applyBottomTexture);

  if (config.holes?.length) {
    config.holes.forEach((h) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry((h.d || 1.0) * 0.5, h.ring || 0.12, 10, 28), h.plated === false ? materials.edge : materials.gold);
      ring.rotation.x = Math.PI / 2; ring.position.set(h.x, config.thickness/2 + 0.03, h.z); board.add(ring);
      const voidMesh = new THREE.Mesh(new THREE.CylinderGeometry((h.d || 1.0)*0.40, (h.d || 1.0)*0.40, config.thickness+0.12, 24), new THREE.MeshBasicMaterial({color:0x020303}));
      voidMesh.position.set(h.x,0,h.z); board.add(voidMesh);
    });
  }

  const pickables = []; const explodeParts = [];
  const tag = (object, spec) => { object.userData.ref = spec.ref || ''; object.userData.name = spec.name || spec.ref || 'Part'; object.userData.copy = spec.copy || ''; pickables.push(object); return object; };
  const registerExplode = (object, spec, index) => { explodeParts.push({ object, base: object.position.clone(), lift: spec.explode == null ? (3.0 + (index % 4) * 0.8) : spec.explode, driftX: spec.explodeX || 0, driftZ: spec.explodeZ || 0, delay: Math.min(0.4, (spec.delay == null ? index * 0.025 : spec.delay)) }); };

  const addMetalEnds = (g, w, h, d, mat = materials.silver) => {
    const endW = Math.min(w * 0.23, 0.6); for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(endW, h * 1.04, d * 1.03), mat); m.position.x = sx * (w - endW) / 2; g.add(m); }
  };

  const makers = {
    box(spec) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), materials[spec.material || 'chip']); m.position.y = spec.h / 2; m.castShadow = true; g.add(m); return g; },
    chip(spec) { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), materials.chip); body.position.y = spec.h / 2; body.castShadow = true; g.add(body); const top = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.88, 0.05, spec.d * 0.88), materials.chipTop); top.position.y = spec.h + 0.025; g.add(top); const pins = spec.pins || 8; const long = spec.w >= spec.d; for (let i = 0; i < Math.ceil(pins / 2); i++) { const t = (i + 0.5) / Math.ceil(pins / 2) - 0.5; for (const side of [-1,1]) { const lead = new THREE.Mesh(new THREE.BoxGeometry(long ? 0.22 : 0.72, 0.10, long ? 0.72 : 0.22), materials.silver); if (long) lead.position.set(t * spec.w * 0.88, 0.08, side * (spec.d / 2 + 0.28)); else lead.position.set(side * (spec.w / 2 + 0.28), 0.08, t * spec.d * 0.88); g.add(lead); } } return g; },
    passive(spec) { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), materials[spec.material || 'ceramic']); body.position.y = spec.h / 2; body.castShadow = true; g.add(body); addMetalEnds(g, spec.w, spec.h, spec.d); return g; },
    capacitor(spec) {
      const g=new THREE.Group(),w=spec.w||1.0,h=spec.h||0.55,d=spec.d||0.50;
      const body=new THREE.Mesh(new THREE.BoxGeometry(w*0.62,h,d),materials[spec.material||'ceramic']);body.position.y=h/2;body.castShadow=true;g.add(body);
      const termW=w*0.20;
      [-1,1].forEach((side)=>{
        const end=new THREE.Mesh(new THREE.BoxGeometry(termW,h*1.04,d*1.03),materials.silver);end.position.set(side*(w-termW)/2,h/2,0);g.add(end);
        const fillet=new THREE.Mesh(new THREE.BoxGeometry(termW*1.18,0.055,d*1.18),materials.solder);fillet.position.set(side*(w-termW)/2,0.025,0);g.add(fillet);
      });
      return g;
    },
    resistor(spec) {
      const g=new THREE.Group(),w=spec.w||1.0,h=spec.h||0.42,d=spec.d||0.50;
      const body=new THREE.Mesh(new THREE.BoxGeometry(w*0.60,h,d),materials.resistorBody);body.position.y=h/2;body.castShadow=true;g.add(body);
      const capW=w*0.21;
      [-1,1].forEach((side)=>{const end=new THREE.Mesh(new THREE.BoxGeometry(capW,h*1.04,d*1.03),materials.silver);end.position.set(side*(w-capW)/2,h/2,0);g.add(end);});
      return g;
    },
    inductor(spec) {
      const g=new THREE.Group(),w=spec.w||1.6,h=spec.h||0.80,d=spec.d||0.80;
      const body=new THREE.Mesh(new THREE.BoxGeometry(w*0.70,h,d),materials.ferrite);body.position.y=h/2;body.castShadow=true;g.add(body);
      const top=new THREE.Mesh(new THREE.BoxGeometry(w*0.46,0.045,d*0.62),materials.chipTop);top.position.y=h+0.023;g.add(top);
      const termW=w*0.18;
      [-1,1].forEach((side)=>{const end=new THREE.Mesh(new THREE.BoxGeometry(termW,h*0.84,d*1.02),materials.darkSilver);end.position.set(side*(w-termW)/2,h*0.42,0);g.add(end);});
      return g;
    },
    ufl(spec) { const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.55, 3.0), materials.silver); base.position.y = 0.275; g.add(base); const ins = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.70, 32), materials.white); ins.position.y = 0.85; g.add(ins); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.20, 12, 32), materials.gold); ring.rotation.x = Math.PI / 2; ring.position.y = 1.21; g.add(ring); const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.55, 18), materials.gold); pin.position.y = 1.13; g.add(pin); return g; },
    sma(spec) {
      const g = new THREE.Group();
      const flange = new THREE.Mesh(new THREE.BoxGeometry(6.35, 1.05, 6.35), materials.silver); flange.position.y = 0.53; g.add(flange);
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.15, 1.35, 36), materials.darkSilver); shoulder.position.y = 1.72; g.add(shoulder);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 5.1, 40), materials.silver); barrel.position.y = 4.95; g.add(barrel);
      const dielectric = new THREE.Mesh(new THREE.CylinderGeometry(1.47, 1.47, 0.20, 36), materials.white); dielectric.position.y = 7.56; g.add(dielectric);
      const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.44, 20), materials.gold); centre.position.y = 7.68; g.add(centre);
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.85, 1.0, 6), materials.darkSilver); nut.position.y = 6.95; g.add(nut);
      return g;
    },
    usbC(spec) {
      const g = new THREE.Group(); const w=spec.w||9.0,h=spec.h||3.2,d=spec.d||7.5;
      const shell = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), materials.silver); shell.position.y=h/2; g.add(shell);
      const opening = new THREE.Mesh(new THREE.BoxGeometry(w-1.15,h-1.25,0.22), materials.black); opening.position.set(0,h/2,-d/2-0.12); g.add(opening);
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(w-2.3,0.52,d*0.58), materials.black); tongue.position.set(0,h*0.49,-d*0.16); g.add(tongue);
      const contactGeo = new THREE.BoxGeometry(0.18,0.035,d*0.42);
      [-2.65,-1.25,-0.75,-0.25,0.25,0.75,1.25,2.65].forEach((x)=>{
        const contact=new THREE.Mesh(contactGeo,materials.gold); contact.position.set(x,h*0.64,-d*0.18); g.add(contact);
      });
      [-1,1].forEach((side)=>{
        const stake=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.7,1.25),materials.darkSilver);
        stake.position.set(side*(w/2-0.22),0.35,d*0.22); g.add(stake);
      });
      return g;
    },
    module(spec) {
      const g = new THREE.Group();
      const pcbMat=new THREE.MeshStandardMaterial({color:0x0b3327,roughness:0.72,metalness:0.01});
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(spec.w,0.8,spec.d),pcbMat); pcb.position.y=0.4; g.add(pcb);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(spec.w*0.70,2.15,spec.d*0.62),materials.silver); shield.position.set(0,1.68,spec.d*0.07); g.add(shield);
      const shieldTop = new THREE.Mesh(new THREE.BoxGeometry(spec.w*0.64,0.055,spec.d*0.56),materials.darkSilver); shieldTop.position.set(0,2.78,spec.d*0.07); g.add(shieldTop);
      const antennaBase = new THREE.Mesh(new THREE.BoxGeometry(spec.w*0.88,0.055,spec.d*0.20),materials.black); antennaBase.position.set(0,0.83,-spec.d*0.37); g.add(antennaBase);
      const antenna = new THREE.Mesh(new THREE.BoxGeometry(spec.w*0.76,0.035,spec.d*0.09),materials.gold); antenna.position.set(0,0.87,-spec.d*0.39); g.add(antenna);
      const padGeo=new THREE.BoxGeometry(0.72,0.055,1.15);
      const count=Math.max(8,Math.round(spec.d/2.1));
      for(let i=0;i<count;i+=1){
        const z=-spec.d/2+1.1+i*(spec.d-2.2)/Math.max(1,count-1);
        [-1,1].forEach((side)=>{const pad=new THREE.Mesh(padGeo,materials.gold);pad.position.set(side*(spec.w/2+0.08),0.055,z);g.add(pad);});
      }
      return g;
    },
    led(spec) { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w || 2.0, spec.h || 0.84, spec.d || 2.0), materials.led); body.position.y=(spec.h||0.84)/2; g.add(body); const win = new THREE.Mesh(new THREE.BoxGeometry((spec.w||2)*0.6,0.025,(spec.d||2)*0.6),materials.ledWindow); win.position.y=(spec.h||0.84)+0.02; g.add(win); return g; }
  };

  (config.components || []).forEach((spec, index) => {
    const maker = makers[spec.type] || makers.box; const g = maker(spec); g.position.set(spec.x, config.thickness / 2 + (spec.baseY || 0.02), spec.z); g.rotation.y = d2r(spec.rot || 0); g.traverse((o)=>{ if(o.isMesh){ o.frustumCulled=false; o.castShadow=true; } }); board.add(g); tag(g, spec); registerExplode(g, spec, index);
  });

  if (config.ledInstances?.length) {
    // Metroboard carries hundreds of 2 × 2 mm LEDs. Instancing keeps all source
    // placements/rotations while reducing draw calls enough for smooth orbiting.
    const g = new THREE.Group(); board.add(g);
    const size=config.ledSize||2, count=config.ledInstances.length;
    const bodyGeo=new THREE.BoxGeometry(size,0.72,size);
    const winGeo=new THREE.BoxGeometry(size*0.56,0.035,size*0.56);
    const padGeo=new THREE.BoxGeometry(size*0.28,0.035,size*0.34);
    const notchGeo=new THREE.BoxGeometry(size*0.13,0.028,size*0.13);
    const bodies=new THREE.InstancedMesh(bodyGeo,materials.led,count);
    const windows=new THREE.InstancedMesh(winGeo,materials.ledWindow,count);
    const pads=new THREE.InstancedMesh(padGeo,materials.solder,count*4);
    const notches=new THREE.InstancedMesh(notchGeo,materials.chip,count);
    const dummy=new THREE.Object3D();
    config.ledInstances.forEach((p,i)=>{
      const rot=d2r(p[2]||0);
      dummy.position.set(p[0],config.thickness/2+0.38,p[1]); dummy.rotation.set(0,rot,0); dummy.scale.set(1,1,1); dummy.updateMatrix(); bodies.setMatrixAt(i,dummy.matrix);
      dummy.position.y=config.thickness/2+0.765; dummy.updateMatrix(); windows.setMatrixAt(i,dummy.matrix);
      const c=Math.cos(rot),ss=Math.sin(rot),off=size*0.47;
      [[-off,-off],[off,-off],[-off,off],[off,off]].forEach((q,k)=>{
        dummy.position.set(p[0]+q[0]*c+q[1]*ss,config.thickness/2+0.055,p[1]-q[0]*ss+q[1]*c);dummy.rotation.set(0,rot,0);dummy.updateMatrix();pads.setMatrixAt(i*4+k,dummy.matrix);
      });
      const nx=-size*0.32,nz=-size*0.32;
      dummy.position.set(p[0]+nx*c+nz*ss,config.thickness/2+0.79,p[1]-nx*ss+nz*c);dummy.rotation.set(0,rot,0);dummy.updateMatrix();notches.setMatrixAt(i,dummy.matrix);
    });
    [bodies,windows,pads,notches].forEach((m)=>{m.instanceMatrix.needsUpdate=true;m.frustumCulled=false;});
    bodies.castShadow=true;
    bodies.userData.instanceInfo=config.ledInstances;
    pickables.push(bodies);
    g.add(pads,bodies,windows,notches);
    if (config.ledExplode) registerExplode(g,{explode:config.ledExplode,delay:0.05},0);
  }

  let exploded = 0, explodeTarget = 0;
  const updateExplode = () => {
    const t = THREE.MathUtils.smoothstep(exploded, 0, 1);
    explodeParts.forEach((p) => { const local = clamp((t - p.delay) / Math.max(0.01, 1 - p.delay), 0, 1); p.object.position.set(p.base.x + p.driftX*local, p.base.y + p.lift*local, p.base.z + p.driftZ*local); });
    if (config.fadeSurfaceOnExplode) { topMat.opacity = 1 - t * 0.62; topMat.transparent = t > 0.001; topMat.needsUpdate = true; }
  };

  const target = new THREE.Vector3(0,0,0); let distance = config.cameraDistance || Math.max(config.width, config.height) * 1.35; let targetDistance = distance; let yaw = d2r(config.startYaw == null ? -28 : config.startYaw); let pitch = d2r(config.startPitch == null ? 50 : config.startPitch); let targetYaw = yaw, targetPitch = pitch;
  const viewButtons=[...root.querySelectorAll('[data-pcb-view]')];
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  let liveRegion=document.querySelector('[data-live-region]');
  if(!liveRegion){
    liveRegion=document.createElement('span');
    liveRegion.className='pcb-sr-only';
    liveRegion.setAttribute('aria-live','polite');
    root.appendChild(liveRegion);
  }
  const announce=(message)=>{if(liveRegion)liveRegion.textContent=message;};
  const markCustomView=()=>viewButtons.forEach((b)=>b.setAttribute('aria-pressed','false'));
  canvas.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight ArrowUp ArrowDown + - Home');
  const setPreset = (name) => {
    if (name === 'top') { targetYaw=0; targetPitch=d2r(89.2); targetDistance=Math.max(config.width, config.height)*1.2; }
    else if (name === 'bottom') { targetYaw=0; targetPitch=d2r(-89.2); targetDistance=Math.max(config.width, config.height)*1.2; }
    else if (name === 'side') { targetYaw=d2r(-90); targetPitch=d2r(10); targetDistance=Math.max(config.width, config.height)*1.2; }
    else { name='angle'; targetYaw=d2r(config.startYaw == null ? -28 : config.startYaw); targetPitch=d2r(config.startPitch == null ? 50 : config.startPitch); targetDistance=config.cameraDistance || Math.max(config.width, config.height)*1.35; }
    viewButtons.forEach((b)=>b.setAttribute('aria-pressed',b.dataset.pcbView===name?'true':'false'));
  };

  viewButtons.forEach((b) => b.addEventListener('click', () => { setPreset(b.dataset.pcbView); announce(`${b.dataset.pcbView} camera view`); }));
  setPreset('angle');
  const explodeButton = root.querySelector('[data-pcb-explode]'); explodeButton?.addEventListener('click', () => { explodeTarget = explodeTarget > 0.5 ? 0 : 1; explodeButton.setAttribute('aria-pressed', explodeTarget ? 'true' : 'false'); explodeButton.textContent = explodeTarget ? 'Assemble' : 'Explode'; targetDistance = Math.max(config.width, config.height) * (explodeTarget ? 1.55 : 1.35); announce(explodeTarget?'Exploded board view':'Assembled board view'); });
  root.querySelector('[data-pcb-reset]')?.addEventListener('click', () => { explodeTarget=0; if(explodeButton){explodeButton.textContent='Explode';explodeButton.setAttribute('aria-pressed','false');} setPreset('angle'); announce('3D view reset'); });

  const pointers=new Map();
  let dragStart=null,pinchStartDistance=0,pinchStartZoom=distance;
  canvas.addEventListener('pointerdown',(e)=>{
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){
      dragStart={x:e.clientX,y:e.clientY,yaw:targetYaw,pitch:targetPitch};
      canvas.classList.add('is-dragging');
    }else if(pointers.size===2){
      const pts=[...pointers.values()];
      pinchStartDistance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
      pinchStartZoom=targetDistance;
    }
  });
  canvas.addEventListener('pointermove',(e)=>{
    const r=canvas.getBoundingClientRect();mouse.x=((e.clientX-r.left)/r.width)*2-1;mouse.y=-((e.clientY-r.top)/r.height)*2+1;
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1&&dragStart){
      targetYaw=dragStart.yaw-(e.clientX-dragStart.x)*0.008;
      targetPitch=clamp(dragStart.pitch+(e.clientY-dragStart.y)*0.006,d2r(-88),d2r(88));
      markCustomView();
    }else if(pointers.size===2&&pinchStartDistance>0){
      const pts=[...pointers.values()];
      const pinch=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
      targetDistance=clamp(pinchStartZoom*pinchStartDistance/Math.max(1,pinch),Math.max(config.width,config.height)*0.7,Math.max(config.width,config.height)*3.2);
      markCustomView();
    }
  });
  const releasePointer=(e)=>{
    pointers.delete(e.pointerId);
    canvas.releasePointerCapture?.(e.pointerId);
    canvas.classList.toggle('is-dragging',pointers.size>0);
    if(pointers.size===1){const p=[...pointers.values()][0];dragStart={x:p.x,y:p.y,yaw:targetYaw,pitch:targetPitch};}
    else if(!pointers.size){dragStart=null;pinchStartDistance=0;}
  };
  canvas.addEventListener('pointerup',releasePointer);
  canvas.addEventListener('pointercancel',releasePointer);
  canvas.addEventListener('wheel',(e)=>{e.preventDefault();targetDistance=clamp(targetDistance*Math.exp(e.deltaY*0.001),Math.max(config.width,config.height)*0.7,Math.max(config.width,config.height)*3.2);markCustomView();},{passive:false});
  canvas.addEventListener('keydown',(e)=>{
    const step=d2r(7); let used=true,custom=true;
    if(e.key==='ArrowLeft')targetYaw+=step;
    else if(e.key==='ArrowRight')targetYaw-=step;
    else if(e.key==='ArrowUp')targetPitch=clamp(targetPitch+step,d2r(-88),d2r(88));
    else if(e.key==='ArrowDown')targetPitch=clamp(targetPitch-step,d2r(-88),d2r(88));
    else if(e.key==='+'||e.key==='=')targetDistance=clamp(targetDistance*0.90,Math.max(config.width,config.height)*0.7,Math.max(config.width,config.height)*3.2);
    else if(e.key==='-'||e.key==='_')targetDistance=clamp(targetDistance*1.10,Math.max(config.width,config.height)*0.7,Math.max(config.width,config.height)*3.2);
    else if(e.key==='Home'){setPreset('angle');custom=false;}
    else used=false;
    if(used){e.preventDefault();if(custom)markCustomView();}
  });

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(2,2); let hover=null;
  const refEl=root.querySelector('[data-pcb-ref]'),nameEl=root.querySelector('[data-pcb-name]'),copyEl=root.querySelector('[data-pcb-copy]');
  const showPart=(o)=>{const part=o?.userData?.ref?o:o?.parent; const ref=part?.userData?.ref||'BOARD'; if(refEl)refEl.textContent=ref; if(nameEl)nameEl.textContent=part?.userData?.name||config.boardName; if(copyEl)copyEl.textContent=part?.userData?.copy||config.boardCopy;}; showPart(null);
  canvas.addEventListener('pointerleave',()=>{if(!pointers.size){mouse.set(2,2);showPart(null);}});

  const resize=()=>{const r=canvas.getBoundingClientRect();const w=Math.max(1,Math.floor(r.width)),h=Math.max(1,Math.floor(r.height));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(canvas); resize();

  const clock=new THREE.Clock();
  const animate=()=>{requestAnimationFrame(animate); const dt=Math.min(0.05,clock.getDelta()); yaw=THREE.MathUtils.damp(yaw,targetYaw,reducedMotion?40:7,dt); pitch=THREE.MathUtils.damp(pitch,targetPitch,reducedMotion?40:7,dt); distance=THREE.MathUtils.damp(distance,targetDistance,reducedMotion?40:7,dt); exploded=THREE.MathUtils.damp(exploded,explodeTarget,reducedMotion?40:6,dt); updateExplode();
    const cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw); camera.position.set(target.x+distance*cp*sy,target.y+distance*sp,target.z+distance*cp*cy); camera.lookAt(target);
    ray.setFromCamera(mouse,camera); const hits=ray.intersectObjects(pickables,true); const first=hits[0];
    if(first?.object?.userData?.instanceInfo&&first.instanceId!=null){
      const info=first.object.userData.instanceInfo[first.instanceId]||[];
      const ref=info[3]||`LED ${first.instanceId+1}`;
      const station=info[4]||'RGB pixel';
      const key=`${ref}:${station}:${first.instanceId}`;
      if(hover!==key){hover=key;if(refEl)refEl.textContent=ref;if(nameEl)nameEl.textContent=station;if(copyEl)copyEl.textContent=ref==='STATUS'?'Controller status RGB pixel.':`${station} · ${ref} rail-map RGB pixel.`;}
    }else{
      const hit=first?.object; let tagged=hit; while(tagged&&!tagged.userData.ref)tagged=tagged.parent;
      if(tagged!==hover){hover=tagged;showPart(hover);}
    }
    renderer.render(scene,camera); };
  animate();
})();
