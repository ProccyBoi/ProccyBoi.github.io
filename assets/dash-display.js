/* Dash browser OLED renderer. AGPL-3.0-or-later.
 * Eye presets / layout adapted from JPhusion/dash at
 * c3094732c2db8c5159d10f8354bbecaf0fd14726, lib/eyes/src/{EyePresets,Eye,Face}
 * and src/dash/display.cpp. Eye library Copyright (c) 2023 Alastair Aitchison,
 * Playful Technology; Copyright (c) 2020 Luis Llamas.
 * This program is distributed WITHOUT ANY WARRANTY; see
 * https://www.gnu.org/licenses/agpl-3.0.html for license terms.
 * State comes from the website's character demo. Canvas rasterization, finite
 * gestures and bitmap digits are a browser adaptation, not firmware execution.
 */
(() => {
  'use strict';
  // Width, height, top/bottom slope, top/bottom radius, offset X/Y.
  // Glee uses the actual source drawer's shallow rounded top: that drawer
  // does not consume the preset's inverse-radius fields.
  const presets = {
    idle: [40,40,0,0,8,8,0,0], focus: [40,14,.2,0,3,1,0,0],
    paused: [40,14,-.5,-.5,3,3,0,-2], rest: [40,8,0,0,8,0,0,0],
    dizzy: [40,14,-.5,-.5,3,3,0,-2]
  };
  const digits = {
    '0':['01110','10001','10011','10101','11001','10001','01110'],
    '1':['00100','01100','00100','00100','00100','00100','01110'],
    '2':['01110','10001','00001','00010','00100','01000','11111'],
    '3':['11110','00001','00001','01110','00001','00001','11110'],
    '4':['00010','00110','01010','10010','11111','00010','00010'],
    '5':['11111','10000','10000','11110','00001','00001','11110'],
    '6':['01110','10000','10000','11110','10001','10001','01110'],
    '7':['11111','00001','00010','00100','01000','01000','01000'],
    '8':['01110','10001','10001','01110','10001','10001','01110'],
    '9':['01110','10001','10001','01111','00001','00001','01110'],
    ':':['00000','00100','00100','00000','00100','00100','00000']
  };
  const clamp = (n, lo=0, hi=1) => Math.max(lo, Math.min(hi,n));
  const smooth = n => { const t=clamp(n);return t*t*(3-2*t); };
  const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
  function create(controller, options={}) {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Live browser session display');
    const ctx=canvas.getContext('2d', {willReadFrequently:true});
    if(!ctx)throw new Error('Dash display canvas unavailable');
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const reduced=()=>typeof options.reducedMotion==='boolean'?options.reducedMotion:media.matches;
    let state=controller.snapshot(),active=true,disposed=false,frame=0,lastFrame=-Infinity;
    const initialKey=state.reaction==='shake'?'dizzy':state.state;
    let from=(presets[initialKey]||presets.idle).slice(),target=from.slice(),transitionAt=performance.now()-500;
    let previousPixels='',lastTarget=initialKey;
    const paramsAt=time=>reduced()?target:mix(from,target,smooth((time-transitionAt)/300));
    const wantFrame=()=>{if(active&&!document.hidden&&!disposed&&!frame)frame=requestAnimationFrame(render);};
    function accept(next) {
      state=next;
      const key=state.reaction==='shake'?'dizzy':state.state;
      if(key!==lastTarget){const now=performance.now();from=paramsAt(now);target=(presets[key]||presets.idle).slice();transitionAt=now;lastTarget=key;}
      wantFrame();
    }
    function eye(p,cx,left,blink,gaze) {
      const [width,height,st,sb,rt0,rb0,ox,oy]=p;
      const w=width, h=Math.max(2,height*blink), mirror=left?1:-1;
      // Eye::TransitionTo negates Y for both eyes, mirrors X for the left,
      // and applies positive slopes to left / negative slopes to right.
      const x=cx+(left?-ox:ox)+gaze.x-w/2,y=32-oy+gaze.y-h/2;
      const top=h*st*mirror/2,bottom=h*sb*mirror/2;
      const room=Math.max(0,h+top-bottom-1),sum=rt0+rb0;
      const factor=sum>room&&sum?room/sum:1,rt=rt0*factor,rb=rb0*factor;
      ctx.beginPath();ctx.moveTo(x+rt,y-top);ctx.lineTo(x+w-rt,y+top);
      ctx.quadraticCurveTo(x+w,y+top,x+w,y+top+rt);ctx.lineTo(x+w,y+h+bottom-rb);
      ctx.quadraticCurveTo(x+w,y+h+bottom,x+w-rb,y+h+bottom);ctx.lineTo(x+rb,y+h-bottom);
      ctx.quadraticCurveTo(x,y+h-bottom,x,y+h-bottom-rb);ctx.lineTo(x,y-top+rt);
      ctx.quadraticCurveTo(x,y-top,x+rt,y-top);ctx.closePath();ctx.fill();
    }
    function blinkPulse(elapsed,start) {
      const t=elapsed-start;
      if(t<0||t>180)return 1;
      if(t<40)return 1-.95*smooth(t/40);
      if(t<140)return .05;
      return .05+.95*smooth((t-140)/40);
    }
    function render(time) {
      frame=0;if(!active||disposed||document.hidden)return;
      // 30fps during finite expressions; idle has no render loop.
      if(time-lastFrame<30){wantFrame();return;}lastFrame=time;
      const p=paramsAt(time),reactionTime=time-state.reactionStartedAt,motionTime=time-state.motionStartedAt;
      const gaze={x:clamp(state.gaze?.x||0,-1,1)*10,y:clamp(state.gaze?.y||0,-1,1)*6};
      let blink=1,animating=!reduced()&&time-transitionAt<300;
      if(state.reaction==='tap') {
        blink=reduced()?.14:Math.min(blinkPulse(reactionTime,70),blinkPulse(reactionTime,480));
        animating ||= !reduced()&&reactionTime<700;
      } else if(state.reaction==='shake'&&!reduced()) {
        if(reactionTime<1300){const theta=reactionTime/420*Math.PI*2;gaze.x+=Math.sin(theta)*7;gaze.y+=Math.cos(theta)*4;animating=true;}
      } else if(state.motion&&!reduced()) {
        if(['focus','welcome','ready'].includes(state.motion)) {
          blink=blinkPulse(motionTime,160);
          if(state.motion==='welcome')blink=Math.min(blink,blinkPulse(motionTime,800));
          animating ||= motionTime<(state.motion==='welcome'?1000:360);
        }
      }
      ctx.fillStyle='#000';ctx.fillRect(0,0,128,64);ctx.fillStyle='#fff';
      eye(p,41,true,blink,gaze);eye(p,87,false,blink,gaze);
      if(state.state==='focus'||state.state==='paused'||state.state==='rest') {
        const seconds=Math.max(0,Math.ceil(state.remainingMs/1000));
        const text=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
        ctx.fillStyle='#000';ctx.fillRect(94,0,34,9);ctx.fillStyle='#fff';
        [...text].forEach((char,i)=>(digits[char]||digits['0']).forEach((row,y)=>[...row].forEach((bit,x)=>{if(bit==='1')ctx.fillRect(96+i*6+x,y,1,1);}))) ;
        ctx.fillStyle='#000';ctx.fillRect(0,60,128,4);ctx.fillStyle='#fff';
        ctx.fillRect(0,60,128,1);ctx.fillRect(0,63,128,1);ctx.fillRect(0,60,1,4);ctx.fillRect(127,60,1,4);
        ctx.fillRect(1,61,Math.floor(clamp(1-state.remainingMs/Math.max(1,state.totalMs))*126),2);
      }
      // Quantize the canvas to one-bit pixels, as on the physical OLED. This
      // avoids browser-dependent antialiasing and keeps its small type crisp.
      const image=ctx.getImageData(0,0,128,64),pixels=image.data;
      let signature='';
      for(let i=0;i<pixels.length;i+=4){const on=pixels[i]>=128;signature+=on?'1':'0';pixels[i]=on?188:3;pixels[i+1]=on?242:9;pixels[i+2]=on?255:11;pixels[i+3]=255;}
      ctx.putImageData(image,0,0);
      canvas.setAttribute('aria-label',`${state.state} session, ${Math.ceil(state.remainingMs/1000)} seconds remaining${state.reaction?', '+state.reaction+' reaction':''}`);
      if(signature!==previousPixels){previousPixels=signature;options.onFrame?.();}
      if(animating)wantFrame();
    }
    const unsubscribe=controller.subscribe(accept);
    const preference=()=>{transitionAt=performance.now()-500;accept(controller.snapshot());};
    const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else accept(controller.snapshot());};
    media.addEventListener('change',preference);document.addEventListener('visibilitychange',visibility);
    return {canvas,setActive(value){active=Boolean(value);cancelAnimationFrame(frame);frame=0;if(active)accept(controller.snapshot());},dispose(){disposed=true;cancelAnimationFrame(frame);unsubscribe();media.removeEventListener('change',preference);document.removeEventListener('visibilitychange',visibility);}};
  }
  window.DashDisplay=Object.freeze({create});
})();
