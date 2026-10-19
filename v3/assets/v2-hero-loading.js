(() => {
  'use strict';

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const p=clamp(value); return p*p*(3-2*p); };
  const sweepEase = value => {
    let t=value;
    for(let i=0;i<5;i++) {
      const inverse=1-t;
      const x=3*inverse*inverse*t*.42+3*inverse*t*t*.25+t*t*t;
      const slope=3*inverse*inverse*.42+6*inverse*t*(.25-.42)+3*t*t*.75;
      t=clamp(t-(x-value)/slope);
    }
    return 3*(1-t)*t*t+t*t*t;
  };
  const seed = value => { const n=Math.sin(value*127.1+311.7)*43758.5453; return n-Math.floor(n); };
  const inert = {setPose(){},modelReady(){},modelFailed(){},suspend(){},destroy(){}};

  function create(root, stage, posters) {
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    if(reduced.matches || navigator.connection?.saveData) {
      root.dataset.heroLoadingState='disabled';
      return inert;
    }
    const layer=document.createElement('div');
    layer.className='v2-hero-loading';
    layer.setAttribute('aria-hidden','true');
    const canvas=document.createElement('canvas');
    canvas.className='v2-hero-loading-canvas';
    layer.append(canvas);
    // Keep decorative 2D work off the GPU queue used to prepare the real CAD.
    const context=canvas.getContext('2d',{alpha:true,willReadFrequently:true});
    if(!context) return inert;
    stage.append(layer);

    let frame=0, frames=0, lastPaint=0, width=0, height=0, scale=1;
    let suspended=false, destroyed=false, interactions=0, pulseCount=0, touchTimer=0;
    let pointer={x:-10000,y:-10000,active:false};
    const lens={board:null,x:0,y:0,alpha:0};
    const lensSurface=document.createElement('canvas');
    const lensMask=document.createElement('canvas');
    const lensContext=lensSurface.getContext('2d',{alpha:true,willReadFrequently:true});
    const maskContext=lensMask.getContext('2d',{alpha:true,willReadFrequently:true});
    const scanSurface=document.createElement('canvas');
    const scanStripe=document.createElement('canvas');
    const scanContext=scanSurface.getContext('2d',{alpha:true,willReadFrequently:true});
    const stripeContext=scanStripe.getContext('2d',{alpha:true,willReadFrequently:true});
    const pulses=[];
    const started=performance.now();
    const boards=posters.map((poster,index)=>{
      const node=document.createElement('div');
      node.className='v2-hero-loading-board';
      node.dataset.heroLoadingBoard=String(index);
      node.dataset.state='pending';
      layer.append(node);
      return {poster,node,index,parts:[],state:'pending',readyAt:0,pose:null,sourceWidth:0,sourceHeight:0,samples:null,scanMask:null};
    });

    const motionAllowed=()=>!reduced.matches&&!navigator.connection?.saveData;
    const hasVisibleWork=()=>boards.some(board=>board.pose?.visible && (board.state==='pending'||board.state==='ready'&&performance.now()-board.readyAt<560));
    const blocked=()=>destroyed||suspended||document.hidden||!motionAllowed();
    const updateState=()=>{
      const pending=boards.some(board=>board.state==='pending');
      const settling=boards.some(board=>board.state==='ready'&&performance.now()-board.readyAt<560);
      const paused=blocked()||!hasVisibleWork();
      root.dataset.heroLoadingState=!motionAllowed()?'disabled':!pending&&!settling?'settled':paused?'paused':'active';
      layer.classList.toggle('is-paused',paused);
      layer.classList.toggle('is-settled',!pending&&!settling);
      if(paused) {lens.alpha=0;root.dataset.heroLoadingLensActive='false';}
    };
    function request() {
      updateState();
      if(!frame&&!blocked()&&hasVisibleWork()) frame=requestAnimationFrame(draw);
    }
    function resize() {
      const nextWidth=stage.clientWidth, nextHeight=stage.clientHeight;
      if(nextWidth===width&&nextHeight===height) return;
      width=nextWidth; height=nextHeight;
      scale=Math.min(devicePixelRatio||1,width<700?1.5:2);
      canvas.width=Math.max(1,Math.round(width*scale));
      canvas.height=Math.max(1,Math.round(height*scale));
      request();
    }
    function sample(board,index) {
      if(destroyed||board.state!=='pending'||!board.poster.naturalWidth) return;
      const image=board.poster;
      const sampling=document.createElement('canvas');
      sampling.width=88; sampling.height=Math.round(88*image.naturalHeight/image.naturalWidth);
      const read=sampling.getContext('2d',{willReadFrequently:true});
      if(!read) return;
      try {
        read.drawImage(image,0,0,sampling.width,sampling.height);
        const {data}=read.getImageData(0,0,sampling.width,sampling.height);
        const parts=[];
        for(let y=1;y<sampling.height-1;y+=2) for(let x=1;x<sampling.width-1;x+=2) {
          const offset=(y*sampling.width+x)*4;
          if(data[offset+3]<160) continue;
          const r=data[offset],g=data[offset+1],b=data[offset+2];
          const brightness=(r+g+b)/765;
          const id=y*sampling.width+x+index*917;
          // Samples keep the board's actual layout, colour and bright metal /
          // silkscreen detail. No substitute geometry or invented circuitry.
          if(brightness<.17&&seed(id)>.22) continue;
          const nx=(x+.5)/sampling.width,ny=(y+.5)/sampling.height;
          const phase=seed(id*3)*Math.PI*2;
          parts.push({
            u:nx-.5,v:ny-.5,phase,
            colour:`rgb(${Math.min(255,r+24)},${Math.min(255,g+24)},${Math.min(255,b+24)})`,
            brightness,depth:.25+seed(id*7)*.75,
            driftX:(seed(id*11)-.5)*.07,
            driftY:-(.026+seed(id*13)*.052),
            size:1.25+seed(id*17)*1.4
          });
        }
        board.parts=parts;
        board.sourceWidth=image.naturalWidth;board.sourceHeight=image.naturalHeight;
        board.samples={data,width:sampling.width,height:sampling.height};
        const alpha=document.createElement('canvas');
        alpha.width=512;alpha.height=Math.round(512*image.naturalHeight/image.naturalWidth);
        const alphaContext=alpha.getContext('2d',{alpha:true,willReadFrequently:true});
        if(alphaContext) {alphaContext.drawImage(image,0,0,alpha.width,alpha.height);board.scanMask=alpha;}
        board.node.dataset.parts=String(parts.length);
        request();
      } catch(error) {
        // Pixel readback is decorative and never gates the poster or CAD.
        board.node.dataset.parts='0';
      }
    }
    function highlight(board,time,presence) {
      if(!board.scanMask||!scanContext||!stripeContext||board.state!=='pending') return;
      const alpha=board.scanMask,w=alpha.width,h=alpha.height;
      const phase=((time+board.index*.7)/3.4)%1;
      const travel=(-1.26+sweepEase(phase)*2.52)*w;
      if(travel<-w*.8||travel>w*.85) return;
      if(scanSurface.width!==w||scanSurface.height!==h) {
        scanSurface.width=scanStripe.width=w;scanSurface.height=scanStripe.height=h;
        const dx=.9612617,dy=.2756374,length=dx*w+dy*h;
        const gradient=stripeContext.createLinearGradient(w/2-dx*length/2,h/2-dy*length/2,w/2+dx*length/2,h/2+dy*length/2);
        [[.32,'#97b8c300'],[.395,'#97b8c308'],[.49,'#d3e9eb2e'],[.5,'#e4f1ec55'],[.52,'#c9e7ea1c'],[.63,'#c9e7ea00']].forEach(([stop,colour])=>gradient.addColorStop(stop,colour));
        stripeContext.fillStyle=gradient;stripeContext.fillRect(0,0,w,h);
      }
      // Only this small decorative highlight is rasterised into a cached
      // alpha mask. Original pictures, inspection and CAD keep full detail.
      scanContext.clearRect(0,0,w,h);
      scanContext.globalCompositeOperation='source-over';
      scanContext.drawImage(scanStripe,travel,0);
      scanContext.globalCompositeOperation='destination-in';
      scanContext.drawImage(alpha,0,0);
      scanContext.globalCompositeOperation='source-over';
      context.globalAlpha=presence*ease(phase/.12)*(1-ease((phase-.82)/.18));
      context.drawImage(scanSurface,-board.pose.width/2,-board.pose.height/2,board.pose.width,board.pose.height);
    }
    function magnify(candidate,delta) {
      if(candidate) {lens.board=candidate.board;lens.x=candidate.x;lens.y=candidate.y;}
      const board=lens.board;
      if(!board||board.state!=='pending'||!board.pose?.visible||!lensContext||!maskContext) lens.alpha=0;
      else lens.alpha+=(Number(Boolean(candidate))-lens.alpha)*Math.min(1,delta/95);
      root.dataset.heroLoadingLensActive=String(lens.alpha>.015);
      if(lens.alpha<.015) return;
      const pose=board.pose,radius=width<700?64:94,diameter=radius*2;
      const resolution=Math.round(diameter*scale);
      if(lensSurface.width!==resolution) {
        lensSurface.width=lensSurface.height=resolution;
        lensMask.width=lensMask.height=resolution;
        const half=resolution/2;
        const edge=maskContext.createRadialGradient(half,half,half*.65,half,half,half);
        edge.addColorStop(0,'#000');edge.addColorStop(.5,'#000000dc');edge.addColorStop(1,'#0000');
        maskContext.fillStyle=edge;maskContext.fillRect(0,0,resolution,resolution);
      }
      const zoom=width<700?1.85:1.7;
      const sourceX=(lens.x/pose.width+.5)*board.sourceWidth;
      const sourceY=(lens.y/pose.height+.5)*board.sourceHeight;
      const sourceWidth=diameter/pose.width*board.sourceWidth/zoom;
      const sourceHeight=diameter/pose.height*board.sourceHeight/zoom;
      lensContext.clearRect(0,0,resolution,resolution);
      lensContext.globalCompositeOperation='source-over';
      // The full-resolution original is inspected directly. The cached radial
      // alpha mask makes this an optical lift with no ring or extra UI chrome.
      lensContext.drawImage(board.poster,sourceX-sourceWidth/2,sourceY-sourceHeight/2,sourceWidth,sourceHeight,0,0,resolution,resolution);
      lensContext.globalCompositeOperation='destination-in';
      lensContext.drawImage(lensMask,0,0);
      lensContext.globalCompositeOperation='source-over';
      context.save();context.translate(pose.x,pose.y);context.rotate(pose.rotation);
      context.globalAlpha=lens.alpha;
      context.drawImage(lensSurface,lens.x-radius,lens.y-radius,diameter,diameter);
      context.restore();
    }
    function draw(timestamp) {
      frame=0;
      if(blocked()) {updateState();return;}
      // Ambient detail costs at most 30 lightweight canvas paints per second.
      // Pointer input still starts on the next available animation frame.
      if(timestamp-lastPaint<30) {request();return;}
      const delta=Math.min(100,timestamp-lastPaint);lastPaint=timestamp;
      context.setTransform(scale,0,0,scale,0,0);
      context.clearRect(0,0,width,height);
      const time=(timestamp-started)/1000;
      let lensCandidate=null;
      for(let i=pulses.length-1;i>=0;i--) if(timestamp-pulses[i].at>1150) pulses.splice(i,1);
      for(const board of boards) {
        const pose=board.pose;
        if(!pose?.visible||board.state==='failed') continue;
        const completion=board.state==='ready'?ease((timestamp-board.readyAt)/520):0;
        if(completion>=1) continue;
        const presence=(1-completion)*ease((timestamp-started)/280);
        const c=Math.cos(pose.rotation),s=Math.sin(pose.rotation);
        const dx=pointer.x-pose.x,dy=pointer.y-pose.y;
        const localPointerX=dx*c+dy*s,localPointerY=-dx*s+dy*c;
        if(pointer.active&&board.state==='pending'&&board.samples) {
          const pixels=board.samples;
          const sampleX=Math.floor((localPointerX/pose.width+.5)*pixels.width);
          const sampleY=Math.floor((localPointerY/pose.height+.5)*pixels.height);
          if(sampleX>=0&&sampleX<pixels.width&&sampleY>=0&&sampleY<pixels.height&&pixels.data[(sampleY*pixels.width+sampleX)*4+3]>180) {
            lensCandidate={board,x:localPointerX,y:localPointerY};
          }
        }
        const radius=Math.min(155,Math.max(82,pose.width*.22));
        const radiusSquared=radius*radius;
        context.save();context.translate(pose.x,pose.y);context.rotate(pose.rotation);
        highlight(board,time,presence);
        for(const part of board.parts) {
          const homeX=part.u*pose.width,homeY=part.v*pose.height;
          const wave=.5+.5*Math.sin(time*1.5+part.u*5+part.v*3+part.phase*.28);
          const float=(.5+.5*wave)*(1-completion);
          let x=homeX+part.driftX*pose.width*float;
          let y=homeY+part.driftY*pose.height*float;
          let energy=0;
          if(pointer.active) {
            const px=x-localPointerX,py=y-localPointerY,distanceSquared=px*px+py*py;
            if(distanceSquared<radiusSquared) {
              const distance=Math.sqrt(distanceSquared)||1;
              const force=(1-distance/radius)**2;
              const strength=(25+part.depth*30)*force*(1-completion);
              // A small tangential component makes the pointer feel like a
              // lens lifting parts, without moving the actual project image.
              x+=(px/distance-py/distance*.28)*strength;
              y+=(py/distance+px/distance*.28)*strength;
              energy=force;
            }
          }
          const screenX=pose.x+homeX*c-homeY*s,screenY=pose.y+homeX*s+homeY*c;
          for(const pulse of pulses) {
            const px=screenX-pulse.x,py=screenY-pulse.y,distance=Math.sqrt(px*px+py*py)||1;
            const age=(timestamp-pulse.at)/1150;
            const ring=age*Math.min(560,width*.65);
            const band=Math.max(0,1-Math.abs(distance-ring)/68);
            const strength=band*band*(1-age)*(1-completion);
            const worldX=px/distance*strength*46,worldY=py/distance*strength*46;
            x+=worldX*c+worldY*s;y+=-worldX*s+worldY*c;
            energy=Math.max(energy,strength);
          }
          const size=part.size*(.9+part.depth*.35+energy*.55);
          context.globalAlpha=presence*(.2+part.brightness*.55+energy*.3);
          context.fillStyle=part.colour;
          context.fillRect(x-size/2,y-size/2,size,size*.75);
          if(part.brightness>.48&&(energy>.18||wave>.84)) {
            context.globalAlpha=presence*(.07+energy*.16);
            context.strokeStyle=energy>.35?'#b9d7e8':'#c8a47a';
            context.lineWidth=.65;
            context.beginPath();context.moveTo(homeX,homeY);context.lineTo(x,y);context.stroke();
          }
        }
        context.restore();
      }
      magnify(lensCandidate,delta);
      context.globalAlpha=1;
      for(const pulse of pulses) {
        const age=clamp((timestamp-pulse.at)/1150);
        context.globalAlpha=Math.sin(age*Math.PI)*.18*(1-age);
        context.strokeStyle='#d2e6ed';context.lineWidth=.7;
        context.beginPath();context.arc(pulse.x,pulse.y,age*Math.min(560,width*.65),0,Math.PI*2);context.stroke();
      }
      context.globalAlpha=1;
      root.dataset.heroLoadingFrames=String(++frames);
      request();
    }
    const interactiveTarget=event=>event.target instanceof Element&&event.target.closest('a,button,input,select,textarea,[role="button"]');
    const position=event=>{
      const bounds=stage.getBoundingClientRect();
      return {x:event.clientX-bounds.left,y:event.clientY-bounds.top};
    };
    function move(event) {
      if(blocked()||!hasVisibleWork()||interactiveTarget(event)) return;
      if(event.pointerType==='touch') return;
      const point=position(event);
      pointer={...point,active:true};
      root.dataset.heroLoadingInteractions=String(++interactions);
      request();
    }
    function press(event) {
      if(blocked()||!hasVisibleWork()||interactiveTarget(event)) return;
      const point=position(event);
      pointer={...point,active:true};
      pulses.push({...point,at:performance.now()});
      if(pulses.length>3) pulses.shift();
      root.dataset.heroLoadingPulses=String(++pulseCount);
      root.dataset.heroLoadingInteractions=String(++interactions);
      if(event.pointerType==='touch') {
        clearTimeout(touchTimer);
        touchTimer=setTimeout(()=>{pointer.active=false;},760);
      }
      request();
    }
    function leave(event){if(event.pointerType!=='touch') pointer.active=false;}
    function cancel(){pointer.active=false;clearTimeout(touchTimer);}
    function visibility(){if(blocked()&&frame){cancelAnimationFrame(frame);frame=0;}request();}
    function preference(){
      if(!motionAllowed()) {if(frame)cancelAnimationFrame(frame);frame=0;context.clearRect(0,0,canvas.width,canvas.height);}
      request();
    }
    stage.addEventListener('pointermove',move,{passive:true});
    stage.addEventListener('pointerdown',press,{passive:true});
    stage.addEventListener('pointerleave',leave,{passive:true});
    stage.addEventListener('pointercancel',cancel,{passive:true});
    document.addEventListener('visibilitychange',visibility);
    reduced.addEventListener('change',preference);
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);
    const loadListeners=boards.map((board,index)=>{
      const onLoad=()=>sample(board,index);
      if(board.poster.complete&&board.poster.naturalWidth) sample(board,index);
      else board.poster.addEventListener('load',onLoad,{once:true});
      return onLoad;
    });
    resize();

    function settle(index,state) {
      const board=boards[index];
      if(!board||destroyed||board.state===state) return;
      board.state=state;board.readyAt=performance.now();board.node.dataset.state=state;
      if(lens.board===board) {lens.alpha=0;root.dataset.heroLoadingLensActive='false';}
      if(state==='failed') board.parts=[];
      request();
    }
    return {
      setPose(index,pose) {
        const board=boards[index];if(!board||destroyed) return;
        board.pose={...pose};
        const style=board.node.style;
        style.width=`${pose.width}px`;style.height=`${pose.height}px`;
        style.left=`${pose.x}px`;style.top=`${pose.y}px`;
        style.transform=`translate(-50%,-50%) rotate(${pose.rotation}rad)`;
        board.node.classList.toggle('is-outside',!pose.visible);
        request();
      },
      modelReady(index){settle(index,'ready');},
      modelFailed(index){settle(index,'failed');},
      suspend(value) {
        suspended=Boolean(value);pointer.active=false;
        if(suspended&&frame) {cancelAnimationFrame(frame);frame=0;}
        request();
      },
      destroy() {
        if(destroyed) return;destroyed=true;
        cancelAnimationFrame(frame);clearTimeout(touchTimer);frame=0;
        resizeObserver.disconnect();
        stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerdown',press);stage.removeEventListener('pointerleave',leave);
        stage.removeEventListener('pointercancel',cancel);
        document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',preference);
        boards.forEach((board,index)=>board.poster.removeEventListener('load',loadListeners[index]));
        layer.remove();root.dataset.heroLoadingState='settled';
      }
    };
  }
  window.V2HeroLoading={create};
})();
