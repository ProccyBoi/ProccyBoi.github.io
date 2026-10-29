(() => {
  'use strict';
  const data = window.BOARD_DATA;
  const banks = {
    small: { name:'RGB array', color:'#6bd8ff', brightness:70, on:true, pattern:'solid', meshes:[] },
    large: { name:'RGB cluster', color:'#6bd8ff', brightness:70, on:true, pattern:'solid', meshes:[] },
    red: { name:'Red emitters', color:'#ff3830', brightness:70, on:true, meshes:[] }
  };
  let selected = 'small';
  const $ = id => document.getElementById(id);
  const swatchNames = {'#6bd8ff':'ICE BLUE','#ff4b58':'RED','#ffae45':'AMBER','#82ec87':'GREEN','#8a94ff':'VIOLET','#fff2d6':'WARM WHITE'};
  const minX=79.91, maxX=204.71, minY=36.92, maxY=75.29, W=maxX-minX, H=maxY-minY;
  const x = v => v-(minX+maxX)/2, y = v => (minY+maxY)/2-v;
  const clamp = (v,lo,hi) => Math.min(hi,Math.max(lo,v));
  function drawBoardTexture(){
    const canvas=document.createElement('canvas'), scale=24; canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);
    const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#194f3e';ctx.fillRect(0,0,W,H);
    // Front copper routing from the source board, subdued beneath solder mask.
    for(const s of data.segments){if(s.layer!=='F.Cu')continue;ctx.strokeStyle='#427560';ctx.lineWidth=Math.max(.10,s.width);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(s.start[0]-minX,s.start[1]-minY);ctx.lineTo(s.end[0]-minX,s.end[1]-minY);ctx.stroke();}
    for(const c of data.components){
      const a=(c.at[2]||0)*Math.PI/180;ctx.save();ctx.translate(c.at[0]-minX,c.at[1]-minY);ctx.rotate(-a);
      for(const p of c.pads||[]){ctx.save();ctx.translate(p.at[0],p.at[1]);ctx.rotate(-(p.at[2]||0)*Math.PI/180+a);ctx.fillStyle=p.type==='smd'?'#c5b77c':'#aa9b65';ctx.fillRect(-p.size[0]/2,-p.size[1]/2,p.size[0],p.size[1]);if(p.type!=='smd'){ctx.fillStyle='#183b31';ctx.beginPath();ctx.arc(0,0,Math.min(p.size[0],p.size[1])*.19,0,Math.PI*2);ctx.fill()}ctx.restore();}
      if(c.reference && c.reference!=='G***'){ctx.fillStyle='rgba(225,237,213,.68)';ctx.font='0.75px monospace';ctx.textAlign='center';ctx.fillText(c.reference,0,-2.1)}ctx.restore();
    }
    ctx.fillStyle='rgba(226,237,218,.85)';ctx.font='bold 1.4px monospace';ctx.fillText('SENSOR TEST PCB',W-23,H-3);ctx.font='1px monospace';ctx.fillText('SKYLABS  /  AVIONICS & PAYLOAD',4,H-2);
    const texture=new THREE.CanvasTexture(canvas);texture.anisotropy=8;return texture;
  }
  let renderer, scene, camera, controls;
  function setup3D(){
    const view=$('viewer');
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); } catch(e){$('viewer-error').hidden=false;return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputEncoding=THREE.sRGBEncoding;view.appendChild(renderer.domElement);
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,1000);camera.up.set(0,0,1);camera.position.set(0,-70,155);
    controls=new THREE.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.minDistance=65;controls.maxDistance=360;controls.maxPolarAngle=Math.PI*.48;controls.target.set(0,0,0);controls.update();
    scene.add(new THREE.HemisphereLight(0xe6f4ff,0x22342b,1.15));const key=new THREE.DirectionalLight(0xfff4d5,.9);key.position.set(-40,-30,100);scene.add(key);const fill=new THREE.DirectionalLight(0xb2d7ff,.45);fill.position.set(40,40,60);scene.add(fill);
    const board=new THREE.Mesh(new THREE.BoxGeometry(W,H,1.6),new THREE.MeshStandardMaterial({color:0x204737,roughness:.75}));scene.add(board);
    const top=new THREE.Mesh(new THREE.PlaneGeometry(W,H),new THREE.MeshStandardMaterial({map:drawBoardTexture(),roughness:.85}));top.position.z=.81;scene.add(top);
    const mat=(color,roughness=.55,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
    const ceramic=mat(0xd9d9c7), dark=mat(0x222a2b), beige=mat(0xbaa88a), metal=mat(0xb7c0bd,.35,.7), chip=mat(0x252b2b), off=mat(0xc2c8bc);
    const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;const gc=glowCanvas.getContext('2d');const grad=gc.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(255,255,255,.65)');grad.addColorStop(.14,'rgba(255,255,255,.3)');grad.addColorStop(.45,'rgba(255,255,255,.06)');grad.addColorStop(1,'rgba(255,255,255,0)');gc.fillStyle=grad;gc.fillRect(0,0,128,128);const glowMap=new THREE.CanvasTexture(glowCanvas);
    function box(group,w,h,d,material,z){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.z=z;group.add(mesh);return mesh;}
    function groupFor(c){const group=new THREE.Group();group.position.set(x(c.at[0]),y(c.at[1]),.8);group.rotation.z=(c.at[2]||0)*Math.PI/180;scene.add(group);return group;}
    function led(c,bank,size){const g=groupFor(c);box(g,size,size,.58,ceramic,.29);const lensMat=new THREE.MeshBasicMaterial({color:0xd3d9c8});const lens=box(g,size*.64,size*.64,.12,lensMat,.64);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0xffffff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));sprite.position.z=1.2;sprite.scale.set(size*4.5,size*4.5,1);g.add(sprite);banks[bank].meshes.push({lens,sprite,x:c.at[0],y:c.at[1]});}
    for(const c of data.components){
      const ref=c.reference||'', fp=c.footprint||'';if(ref==='G***')continue;
      if(/^LED\d+$/.test(ref)){const n=Number(ref.slice(3));led(c,n<=40?'small':'red',n<=40?2.0:3.0);continue;}
      if(/^D\d+$/.test(ref)){led(c,'large',5);continue;}
      const g=groupFor(c);
      if(ref[0]==='C'||(ref[0]==='R'&&fp.includes('0805'))){box(g,1.3,1.15,.65,ref[0]==='C'?beige:dark,.42);box(g,.32,1.15,.68,metal,.43).position.x=-.68;box(g,.32,1.15,.68,metal,.43).position.x=.68;}
      else if(ref[0]==='R'&&fp.includes('Axial')){const body=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.1,10,16),beige);body.rotation.z=Math.PI/2;body.position.z=2.7;g.add(body);for(const sx of [-1,1]){const wire=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,2.8,8),metal);wire.rotation.z=Math.PI/2;wire.position.set(sx*6.2,0,1.5);g.add(wire)}for(const sx of [-2.8,-1.5,.9,2]){const ring=new THREE.Mesh(new THREE.CylinderGeometry(2.12,2.12,.5,16),sx===2?mat(0x986924):dark);ring.rotation.z=Math.PI/2;ring.position.set(sx,0,2.7);g.add(ring)}}
      else if(ref==='U2'){box(g,18,25.5,2.5,metal,1.35);box(g,16.8,5,.12,dark,2.67).position.y=9.5;}
      else if(ref==='J1'){box(g,8.9,7.3,3.2,metal,1.65);box(g,7,1.3,.8,dark,2.15).position.y=-3.5;}
      else if(ref[0]==='U'){let w=4,h=7;if(ref==='U1'){w=6.5;h=6.5}else if(ref==='U4'){w=4.4;h=5}box(g,w,h,1.3,chip,.72);for(let i=0;i<6;i++){for(const side of [-1,1]){const p=box(g,.8,.45,.15,metal,.11);p.position.set(side*(w/2+.3),-h*.4+i*h*.16,.11)}}}
      else if(ref[0]==='Q'){box(g,2.8,1.4,1.1,chip,.6);}
    }
    for(const bank of Object.values(banks)) bank.meshes.sort((a,b)=>a.x-b.x||a.y-b.y);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(W*1.1,H*1.3),new THREE.MeshBasicMaterial({color:0x020907,transparent:true,opacity:.22}));shadow.position.set(3,-4,-1.1);scene.add(shadow);
    function defaultView(){const scale=Math.max(1,1.5/camera.aspect);camera.position.set(0,-70*scale,155*scale);controls.target.set(0,0,0);controls.update()}
    function resize(){const w=view.clientWidth,h=view.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
    window.addEventListener('resize',resize);resize();defaultView();
    $('reset-view').addEventListener('click',defaultView);
    function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
  }
  function updateScene(){
    for(const [key,bank] of Object.entries(banks)){
      const level=bank.on?bank.brightness/100:0;
      const c=new THREE.Color(bank.color);
      const sweepStep=Math.floor(Date.now()/230)%Math.max(bank.meshes.length,1);
      for(const [i,item] of bank.meshes.entries()){const patternOn=bank.pattern!=='alternate'||i%2===0;const sweepOn=bank.pattern!=='sweep'||i===sweepStep;const light=level*(patternOn&&sweepOn?1:0);item.lens.material.color.copy(light>0?c:new THREE.Color(0xbfc7b9));if(light>0)item.lens.material.color.multiplyScalar(.25+.75*light);item.sprite.material.color.copy(c);item.sprite.material.opacity=light*.24;item.sprite.visible=light>0;}
      const ind=document.querySelector(`[data-indicator="${key}"]`);ind.style.background=level?bank.color:'#596b68';ind.style.boxShadow=level?`0 0 8px ${bank.color}`:'none';
    }
  }
  function refresh(){
    const b=banks[selected];$('selected-name').textContent=b.name;$('brightness').value=b.brightness;$('brightness-value').value=b.brightness+'%';$('power').classList.toggle('on',b.on);$('power').setAttribute('aria-pressed',String(b.on));$('power').innerHTML='<span></span> '+(b.on?'ON':'OFF');$('color-controls').hidden=selected==='red';$('red-note').hidden=selected!=='red';
    document.querySelectorAll('.bank').forEach(el=>{const active=el.dataset.bank===selected;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active))});
    document.querySelectorAll('.swatch').forEach(el=>el.classList.toggle('selected',el.dataset.color===b.color));document.querySelectorAll('[data-pattern]').forEach(el=>{const active=el.dataset.pattern===b.pattern;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))});$('custom-color').value=b.color;$('color-name').textContent=swatchNames[b.color]||'CUSTOM COLOUR';$('color-hex').textContent=b.color.toUpperCase();updateScene();
  }
  document.querySelectorAll('.bank').forEach(el=>el.addEventListener('click',()=>{selected=el.dataset.bank;refresh()}));
  $('power').addEventListener('click',()=>{banks[selected].on=!banks[selected].on;refresh()});
  $('brightness').addEventListener('input',e=>{banks[selected].brightness=Number(e.target.value);refresh()});
  document.querySelectorAll('[data-brightness]').forEach(el=>el.addEventListener('click',()=>{banks[selected].brightness=Number(el.dataset.brightness);banks[selected].on=true;refresh()}));
  document.querySelectorAll('.swatch').forEach(el=>el.addEventListener('click',()=>{banks[selected].color=el.dataset.color;banks[selected].on=true;refresh()}));
  document.querySelectorAll('[data-pattern]').forEach(el=>el.addEventListener('click',()=>{banks[selected].pattern=el.dataset.pattern;banks[selected].on=true;refresh()}));
  $('custom-color').addEventListener('input',e=>{banks[selected].color=e.target.value;banks[selected].on=true;refresh()});
  $('all-on').addEventListener('click',()=>{Object.values(banks).forEach(b=>b.on=true);refresh()});$('all-off').addEventListener('click',()=>{Object.values(banks).forEach(b=>b.on=false);refresh()});
  setup3D();refresh();setInterval(()=>{if(Object.values(banks).some(b=>b.pattern==='sweep'&&b.on))updateScene()},230);
})();
