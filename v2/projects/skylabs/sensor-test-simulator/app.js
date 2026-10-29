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
  $('v2-menu').addEventListener('click',()=>{const open=$('v2-menu').getAttribute('aria-expanded')!=='true';$('v2-menu').setAttribute('aria-expanded',String(open));$('v2-menu').setAttribute('aria-label',open?'Close navigation':'Open navigation');$('v2-navigation').classList.toggle('open',open)});
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
    const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;texture.anisotropy=8;return texture;
  }
  let renderer, scene, camera, controls;
  function setup3D(){
    const view=$('viewer');
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); } catch(e){$('viewer-error').hidden=false;return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputEncoding=THREE.sRGBEncoding;view.appendChild(renderer.domElement);
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,1000);camera.up.set(0,0,1);camera.position.set(0,-70,155);
    controls=new THREE.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.minDistance=65;controls.maxDistance=360;controls.maxPolarAngle=Math.PI*.48;controls.target.set(0,0,0);controls.update();
    // Low ambient light keeps the board readable while making emitted light stand out.
    scene.add(new THREE.HemisphereLight(0xe9f2ed,0x1a231d,.48));
    const key=new THREE.DirectionalLight(0xfff7e8,.64);key.position.set(-35,-45,95);scene.add(key);
    const fill=new THREE.DirectionalLight(0xc5def2,.25);fill.position.set(40,32,55);scene.add(fill);
    const board=new THREE.Mesh(new THREE.BoxGeometry(W,H,1.6),new THREE.MeshStandardMaterial({color:0x183b2d,roughness:.75}));scene.add(board);
    const top=new THREE.Mesh(new THREE.PlaneGeometry(W,H),new THREE.MeshStandardMaterial({map:drawBoardTexture(),roughness:.72,metalness:.05}));top.position.z=.81;scene.add(top);
    const mat=(color,roughness=.55,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
    const ceramic=mat(0xd8d5c7,.8), dark=mat(0x202420,.8), beige=mat(0xc1b39b,.7), metal=mat(0xb7c3bd,.28,.7), chip=mat(0x252927,.7), gold=mat(0xc4aa67,.38,.5), black=mat(0x111715,.8);
    function radialTexture(stops){const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,64);for(const [p,a] of stops)grad.addColorStop(p,'rgba(255,255,255,'+a+')');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(canvas)}
    const glowMap=radialTexture([[0,1],[.08,.82],[.22,.43],[.5,.13],[1,0]]);
    const spillMap=radialTexture([[0,.62],[.22,.34],[.55,.11],[1,0]]);
    function box(group,w,h,d,material,z){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.z=z;group.add(mesh);return mesh;}
    function cylinder(group,r,h,material,z){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,20),material);mesh.rotation.x=Math.PI/2;mesh.position.z=z;group.add(mesh);return mesh;}
    function groupFor(c){const group=new THREE.Group();group.position.set(x(c.at[0]),y(c.at[1]),.8);group.rotation.z=(c.at[2]||0)*Math.PI/180;scene.add(group);return group;}
    function led(c,bank){
      const g=groupFor(c), small=bank==='small', red=bank==='red';
      const w=small?2.2:red?3:5, h=small?2:red?3:5, thickness=small?.68:red?1.1:1.55;
      // A ceramic package, contact feet and a recessed round phosphor/diffuser.
      box(g,w,h,thickness,ceramic,thickness/2+.06);
      const contact=small?.31:red?.45:.65;
      for(const sx of [-1,1])for(const sy of [-1,1]){
        if(red&&sx===1&&sy===1)continue;
        const foot=box(g,contact,h*.23,.16,metal,.10);foot.position.set(sx*(w/2-contact*.35),sy*h*.31,.10);
      }
      const ringR=small?.70:red?.90:1.82, lensR=small?.55:red?.68:1.5, z=thickness+.07;
      cylinder(g,ringR,.10,small?gold:mat(0xb5ad9b,.62),z);
      const lensMat=new THREE.MeshBasicMaterial({color:0xb5b7a9});
      const lens=cylinder(g,lensR,.12,lensMat,z+.09);
      // Separate diffused plane illuminates the solder mask; a billboard makes the
      // emitter bloom without a post-processing dependency or 54 real lights.
      const spill=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:spillMap,color:0xffffff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));
      spill.position.z=.025;const spillSize=small?5.5:red?8:12;spill.scale.set(spillSize,spillSize,1);g.add(spill);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0xffffff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));
      sprite.position.z=z+.25;const haloSize=small?6:red?9:12; sprite.scale.set(haloSize,haloSize,1);g.add(sprite);
      banks[bank].meshes.push({lens,sprite,spill,x:c.at[0],y:c.at[1]});
    }
    function pins(g,w,h,count,pitch){for(let i=0;i<count;i++)for(const side of [-1,1]){const pin=box(g,.8,.32,.16,metal,.11);pin.position.set(side*(w/2+.30),(i-(count-1)/2)*pitch,.11)}}
    function pinsAcross(g,h,count,pitch){for(let i=0;i<count;i++)for(const side of [-1,1]){const pin=box(g,.30,.8,.16,metal,.11);pin.position.set((i-(count-1)/2)*pitch,side*(h/2+.30),.11)}}
    for(const c of data.components){
      const ref=c.reference||'', fp=c.footprint||'';if(ref==='G***')continue;
      if(/^LED\d+$/.test(ref)){const n=Number(ref.slice(3));led(c,n<=40?'small':'red');continue;}
      if(/^D\d+$/.test(ref)){led(c,'large');continue;}
      const g=groupFor(c);
      if(ref[0]==='C'||(ref[0]==='R'&&fp.includes('0805'))){box(g,1.45,1.25,.65,ref[0]==='C'?beige:dark,.42);for(const sx of [-1,1]){const cap=box(g,.34,1.25,.68,metal,.43);cap.position.x=sx*.85;}}
      else if(ref[0]==='R'&&fp.includes('Axial')){const resistor=new THREE.Group();resistor.position.x=7.62;g.add(resistor);const body=new THREE.Mesh(new THREE.CylinderGeometry(2.25,2.25,11.9,20),beige);body.rotation.z=Math.PI/2;body.position.z=2.6;resistor.add(body);for(const sx of [-1,1]){const wire=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,1.7,8),metal);wire.rotation.z=Math.PI/2;wire.position.set(sx*6.8,0,1.8);resistor.add(wire)}for(const sx of [-3.1,-1.9,1.2,2.6]){const ring=new THREE.Mesh(new THREE.CylinderGeometry(2.26,2.26,.48,20),sx===2.6?gold:dark);ring.rotation.z=Math.PI/2;ring.position.set(sx,0,2.6);resistor.add(ring)}}
      else if(ref==='U2'){
        box(g,18,25.5,1.05,mat(0x1b4132,.8),.62);
        const shield=box(g,17.2,19.0,2.05,metal,1.58);shield.position.y=-3.1;
        const lid=box(g,16,17.4,.06,mat(0xa7b1ad,.5,.65),2.63);lid.position.y=-3.1;
        for(let i=0;i<5;i++){const trace=box(g,1.35,4.5,.07,gold,1.19);trace.position.set(-5.8+i*2.9,9.5,1.19);}
      }
      else if(ref==='J1'){
        box(g,8.9,7.3,3.2,metal,1.68);
        const mouth=box(g,7.4,.12,1.65,black,1.60);mouth.position.y=-3.68;
        const tongue=box(g,5.4,.16,.28,mat(0x756d58,.7),1.57);tongue.position.y=-3.76;
        for(const sx of [-1,1]){const tab=box(g,1.1,2.1,.32,metal,.2);tab.position.x=sx*4.5;}
      }
      else if(ref==='U1'){
        box(g,3.5,6.5,1.45,chip,.82);const tab=box(g,2.8,2.6,.22,metal,.2);tab.position.x=2.7;
        for(const yy of [-2.3,0,2.3]){const pin=box(g,1.2,.65,.17,metal,.11);pin.position.set(-2.25,yy,.11)}
      }
      else if(ref==='U3'||ref==='U4'){
        const w=ref==='U3'?3.9:4.4,h=ref==='U3'?9.9:5,n=ref==='U3'?8:7,pitch=ref==='U3'?1.27:.65;
        box(g,w,h,1.3,chip,.74);if(ref==='U4')pinsAcross(g,h,n,pitch);else pins(g,w,h,n,pitch);const dot=cylinder(g,.25,.05,beige,1.42);dot.position.set(-w*.34,-h*.37,1.42);
      }
      else if(ref[0]==='U'){box(g,4,7,1.3,chip,.74);pins(g,4,7,6,.9);}
      else if(ref[0]==='Q'){box(g,2.9,1.4,1.0,chip,.6);for(const pos of [[-1.65,-.48],[-1.65,.48],[1.65,0]]){const pin=box(g,.7,.42,.15,metal,.1);pin.position.set(pos[0],pos[1],.1)}}
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
      for(const [i,item] of bank.meshes.entries()){const patternOn=bank.pattern!=='alternate'||i%2===0;const sweepOn=bank.pattern!=='sweep'||i===sweepStep;const light=level*(patternOn&&sweepOn?1:0);item.lens.material.color.copy(light>0?c:new THREE.Color(0xa9afa2));if(light>0)item.lens.material.color.multiplyScalar(.34+.66*Math.sqrt(light));item.sprite.material.color.copy(c);item.sprite.material.opacity=Math.pow(light,.8)*.8;item.sprite.visible=light>0;item.spill.material.color.copy(c);item.spill.material.opacity=Math.pow(light,.85)*.65;item.spill.visible=light>0;}
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
