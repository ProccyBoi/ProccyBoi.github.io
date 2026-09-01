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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080a0b);
  const camera = new THREE.PerspectiveCamera(34, 1, Math.max(0.5, Math.min(config.width, config.height) * 0.01), Math.max(config.width, config.height) * 12);
  const board = new THREE.Group();
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
    ceramic: new THREE.MeshStandardMaterial({ color: 0xa3977d, roughness: 0.64, metalness: 0.01 }),
    greenCeramic: new THREE.MeshStandardMaterial({ color: 0x556441, roughness: 0.64, metalness: 0.01 }),
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
  const topMat = new THREE.MeshBasicMaterial({ color: config.maskColor || 0x070909, side: THREE.DoubleSide }); topMat.toneMapped = false;
  const bottomMat = new THREE.MeshBasicMaterial({ color: config.bottomColor || config.maskColor || 0x070909, side: THREE.DoubleSide }); bottomMat.toneMapped = false;
  const topSurface = new THREE.Mesh(surfaceGeo, topMat); topSurface.position.y = config.thickness / 2 + 0.008; topSurface.renderOrder = 2; board.add(topSurface);
  const bottomSurface = new THREE.Mesh(surfaceGeo.clone(), bottomMat); bottomSurface.rotation.z = Math.PI; bottomSurface.position.y = -config.thickness / 2 - 0.008; bottomSurface.renderOrder = 2; board.add(bottomSurface);

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
    ufl(spec) { const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.55, 3.0), materials.silver); base.position.y = 0.275; g.add(base); const ins = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.70, 32), materials.white); ins.position.y = 0.85; g.add(ins); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.20, 12, 32), materials.gold); ring.rotation.x = Math.PI / 2; ring.position.y = 1.21; g.add(ring); const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.55, 18), materials.gold); pin.position.y = 1.13; g.add(pin); return g; },
    usbC(spec) { const g = new THREE.Group(); const shell = new THREE.Mesh(new THREE.BoxGeometry(spec.w || 9.0, spec.h || 3.2, spec.d || 7.5), materials.silver); shell.position.y = (spec.h || 3.2) / 2; g.add(shell); const opening = new THREE.Mesh(new THREE.BoxGeometry((spec.w || 9)-1.3, (spec.h || 3.2)-1.35, 0.18), materials.black); opening.position.set(0, (spec.h || 3.2)/2, -(spec.d || 7.5)/2 - 0.10); g.add(opening); return g; },
    module(spec) { const g = new THREE.Group(); const pcb = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.8, spec.d), new THREE.MeshStandardMaterial({ color: 0x0b3327, roughness: 0.7 })); pcb.position.y=0.4; g.add(pcb); const shield = new THREE.Mesh(new THREE.BoxGeometry(spec.w*0.72, 2.2, spec.d*0.66), materials.silver); shield.position.set(0,1.7, spec.d*0.05); g.add(shield); const antenna = new THREE.Mesh(new THREE.BoxGeometry(spec.w*0.84,0.06,spec.d*0.18),materials.gold); antenna.position.set(0,0.84,-spec.d*0.36); g.add(antenna); return g; },
    led(spec) { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w || 2.0, spec.h || 0.84, spec.d || 2.0), materials.led); body.position.y=(spec.h||0.84)/2; g.add(body); const win = new THREE.Mesh(new THREE.BoxGeometry((spec.w||2)*0.6,0.025,(spec.d||2)*0.6),materials.ledWindow); win.position.y=(spec.h||0.84)+0.02; g.add(win); return g; }
  };

  (config.components || []).forEach((spec, index) => {
    const maker = makers[spec.type] || makers.box; const g = maker(spec); g.position.set(spec.x, config.thickness / 2 + (spec.baseY || 0.02), spec.z); g.rotation.y = d2r(spec.rot || 0); board.add(g); tag(g, spec); registerExplode(g, spec, index);
  });

  if (config.ledInstances?.length) {
    const g = new THREE.Group(); board.add(g); const geo = new THREE.BoxGeometry(config.ledSize || 2, 0.72, config.ledSize || 2); const mat = materials.led;
    config.ledInstances.forEach((p) => { const m = new THREE.Mesh(geo, mat); m.position.set(p[0], config.thickness/2 + 0.38, p[1]); m.rotation.y=d2r(p[2]||0); m.castShadow=true; g.add(m); });
    if (config.ledExplode) registerExplode(g, { explode: config.ledExplode, delay: 0.05 }, 0);
  }

  let exploded = 0, explodeTarget = 0;
  const updateExplode = () => {
    const t = THREE.MathUtils.smoothstep(exploded, 0, 1);
    explodeParts.forEach((p) => { const local = clamp((t - p.delay) / Math.max(0.01, 1 - p.delay), 0, 1); p.object.position.set(p.base.x + p.driftX*local, p.base.y + p.lift*local, p.base.z + p.driftZ*local); });
    if (config.fadeSurfaceOnExplode) { topMat.opacity = 1 - t * 0.62; topMat.transparent = t > 0.001; topMat.needsUpdate = true; }
  };

  const target = new THREE.Vector3(0,0,0); let distance = config.cameraDistance || Math.max(config.width, config.height) * 1.35; let targetDistance = distance; let yaw = d2r(config.startYaw == null ? -28 : config.startYaw); let pitch = d2r(config.startPitch == null ? 50 : config.startPitch); let targetYaw = yaw, targetPitch = pitch;
  const setPreset = (name) => {
    if (name === 'top') { targetYaw=0; targetPitch=d2r(89.2); targetDistance=Math.max(config.width, config.height)*1.2; }
    else if (name === 'bottom') { targetYaw=0; targetPitch=d2r(-89.2); targetDistance=Math.max(config.width, config.height)*1.2; }
    else if (name === 'side') { targetYaw=d2r(-90); targetPitch=d2r(10); targetDistance=Math.max(config.width, config.height)*1.2; }
    else { targetYaw=d2r(config.startYaw == null ? -28 : config.startYaw); targetPitch=d2r(config.startPitch == null ? 50 : config.startPitch); targetDistance=config.cameraDistance || Math.max(config.width, config.height)*1.35; }
  };

  root.querySelectorAll('[data-pcb-view]').forEach((b) => b.addEventListener('click', () => setPreset(b.dataset.pcbView)));
  const explodeButton = root.querySelector('[data-pcb-explode]'); explodeButton?.addEventListener('click', () => { explodeTarget = explodeTarget > 0.5 ? 0 : 1; explodeButton.setAttribute('aria-pressed', explodeTarget ? 'true' : 'false'); explodeButton.textContent = explodeTarget ? 'Assemble' : 'Explode'; targetDistance = Math.max(config.width, config.height) * (explodeTarget ? 1.55 : 1.35); });
  root.querySelector('[data-pcb-reset]')?.addEventListener('click', () => { explodeTarget=0; if(explodeButton){explodeButton.textContent='Explode';explodeButton.setAttribute('aria-pressed','false');} setPreset('angle'); });

  let dragging=false,lastX=0,lastY=0;
  canvas.addEventListener('pointerdown',(e)=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',(e)=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;targetYaw-=dx*0.008;targetPitch=clamp(targetPitch+dy*0.006,d2r(-88),d2r(88));});
  canvas.addEventListener('pointerup',(e)=>{dragging=false;canvas.releasePointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointercancel',()=>dragging=false);
  canvas.addEventListener('wheel',(e)=>{e.preventDefault();targetDistance=clamp(targetDistance*Math.exp(e.deltaY*0.001),Math.max(config.width,config.height)*0.7,Math.max(config.width,config.height)*3.2);},{passive:false});

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(2,2); let hover=null;
  const refEl=root.querySelector('[data-pcb-ref]'),nameEl=root.querySelector('[data-pcb-name]'),copyEl=root.querySelector('[data-pcb-copy]');
  const showPart=(o)=>{const part=o?.userData?.ref?o:o?.parent; const ref=part?.userData?.ref||'BOARD'; if(refEl)refEl.textContent=ref; if(nameEl)nameEl.textContent=part?.userData?.name||config.boardName; if(copyEl)copyEl.textContent=part?.userData?.copy||config.boardCopy;}; showPart(null);
  canvas.addEventListener('pointermove',(e)=>{const r=canvas.getBoundingClientRect();mouse.x=((e.clientX-r.left)/r.width)*2-1;mouse.y=-((e.clientY-r.top)/r.height)*2+1;});
  canvas.addEventListener('pointerleave',()=>{mouse.set(2,2);showPart(null);});

  const resize=()=>{const r=canvas.getBoundingClientRect();const w=Math.max(1,Math.floor(r.width)),h=Math.max(1,Math.floor(r.height));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(canvas); resize();

  const clock=new THREE.Clock();
  const animate=()=>{requestAnimationFrame(animate); const dt=Math.min(0.05,clock.getDelta()); yaw=THREE.MathUtils.damp(yaw,targetYaw,7,dt); pitch=THREE.MathUtils.damp(pitch,targetPitch,7,dt); distance=THREE.MathUtils.damp(distance,targetDistance,7,dt); exploded=THREE.MathUtils.damp(exploded,explodeTarget,6,dt); updateExplode();
    const cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw); camera.position.set(target.x+distance*cp*sy,target.y+distance*sp,target.z+distance*cp*cy); camera.lookAt(target);
    ray.setFromCamera(mouse,camera); const hits=ray.intersectObjects(pickables,true); const hit=hits[0]?.object; let tagged=hit; while(tagged&&!tagged.userData.ref)tagged=tagged.parent; if(tagged!==hover){hover=tagged;showPart(hover);}
    renderer.render(scene,camera); };
  animate();
})();
