/* Bind the current character controller to the complete-device OLED.
 * One session, one framebuffer. The July prototype studio is independent. */
(() => {
  'use strict';
  window.DashDevice=Object.freeze({mount(root,model,{invalidate,view}) {
    const demo=document.querySelector('[data-dash-demo]'),controller=demo?.dashController;
    const screen=model.group.getObjectByName('Inactive OLED viewing area');
    if(!controller||!screen||!window.DashDisplay)return null;
    if(!document.querySelector('link[data-dash-device-style]')){
      const style=document.createElement('link');style.rel='stylesheet';style.href='/assets/dash-device.css?v=20261028';style.dataset.dashDeviceStyle='';document.head.append(style);
    }
    const panel=document.createElement('section');panel.className='dash-device-panel';panel.setAttribute('aria-label','Live Dash controls');
    panel.innerHTML=`<div class="dash-device-heading"><span class="dash-device-kicker">DASH / LIVE STUDY</span><span class="dash-device-badge">Browser demo</span></div>
      <h3>A face for your focus.</h3><p class="dash-device-intro">Start a session. The eyes, countdown and reactions on the device follow your controls.</p>
      <div class="dash-device-screen"><span class="dash-device-kicker">OLED OUTPUT · 128 × 64</span><div data-device-preview></div></div>
      <div class="dash-device-readout"><output data-device-time aria-label="Time remaining" aria-live="off">00:10</output><span data-device-state></span></div>
      <label class="dash-device-duration">Session <select data-device-duration aria-label="Device session length"><option value="10">10-second demo</option><option value="1500">25 minutes</option><option value="2700">45 minutes</option><option value="3600">60 minutes</option></select></label>
      <div class="dash-device-transport"><button type="button" data-device-command="action">Start focus</button><button type="button" data-device-command="reset">Reset</button></div>
      <div class="dash-device-gestures" role="group" aria-label="Simulate a gesture"><button type="button" data-device-gesture="tap">Tap / blink</button><button type="button" data-device-gesture="shake">Shake / dizzy</button></div>
      <p class="dash-device-note">Shares the character study’s session below. A browser interpretation of the firmware; no physical device is connected.</p>
      <details><summary>About the display</summary><p>Source-informed eye shapes and a monochrome framebuffer. This is a browser demo, not execution of the ESP32 firmware. <a href="https://github.com/JPhusion/dash/tree/c3094732c2db8c5159d10f8354bbecaf0fd14726">Firmware source</a> · <a href="/assets/dash-display.js">Display adaptation</a></p></details>`;
    const toolbar=document.createElement('div');toolbar.className='dash-device-views';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Device inspection');
    toolbar.innerHTML='<span>INSPECT</span><button type="button" data-device-view="angled" aria-pressed="true">Angled</button><button type="button" data-device-view="front" aria-pressed="false">Front</button><button type="button" data-device-view="rear" aria-pressed="false">Rear</button><button type="button" data-device-shell aria-pressed="false">Hide shell</button>';
    root.classList.add('dash-device-live');root.append(panel);root.querySelector('.hardware-controls').prepend(toolbar);
    const abort=new AbortController(),listen=(node,event,fn)=>node.addEventListener(event,fn,{signal:abort.signal});
    const T=window.THREE;let texture;
    const display=window.DashDisplay.create(controller,{onFrame(){if(texture)texture.needsUpdate=true;invalidate();}});
    panel.querySelector('[data-device-preview]').append(display.canvas);
    display.canvas.setAttribute('role','img');display.canvas.setAttribute('aria-label','Live OLED framebuffer shared with the 3D device');
    texture=new T.CanvasTexture(display.canvas);texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;texture.encoding=T.sRGBEncoding;
    const original=screen.material,originalZ=screen.position.z;
    screen.material=new T.MeshBasicMaterial({map:texture,toneMapped:false});screen.position.z+=.055;
    const shells=model.parts.filter(part=>part.object.userData.sourceFile).map(part=>part.object);
    const states={idle:'Ready',focus:'Focusing',paused:'Paused',rest:'Complete'},actions={idle:'Start focus',focus:'Pause',paused:'Resume',rest:'Start again'};
    const select=panel.querySelector('select'),action=panel.querySelector('[data-device-command="action"]'),reset=panel.querySelector('[data-device-command="reset"]');
    const unsubscribe=controller.subscribe(state=>{
      const seconds=Math.ceil(state.remainingMs/1000);
      panel.querySelector('[data-device-time]').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
      panel.querySelector('[data-device-state]').textContent=states[state.state];action.textContent=actions[state.state];
      select.value=String(state.totalMs/1000);select.disabled=['focus','paused'].includes(state.state);reset.disabled=state.state==='idle';
      root.dataset.dashSession=state.state;root.dataset.dashReaction=state.reaction||'';
    });
    listen(select,'change',()=>controller.command('duration',select.value));
    listen(panel,'click',event=>{const button=event.target.closest('button');if(!button)return;
      if(button.dataset.deviceCommand)controller.command(button.dataset.deviceCommand);
      if(button.dataset.deviceGesture)controller.command('gesture',button.dataset.deviceGesture);
    });
    listen(toolbar,'click',event=>{const button=event.target.closest('button');if(!button)return;
      if(button.dataset.deviceView){view(button.dataset.deviceView);toolbar.querySelectorAll('[data-device-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));}
      if(button.hasAttribute('data-device-shell')){const hidden=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(hidden));button.textContent=hidden?'Show shell':'Hide shell';shells.forEach(shell=>shell.visible=!hidden);invalidate();}
    });
    let onscreen=true,active=true;
    const observer='IntersectionObserver' in window?new IntersectionObserver(([entry])=>{onscreen=entry.isIntersecting;display.setActive(onscreen&&active&&!document.hidden);}):null;observer?.observe(root);
    invalidate();
    return {setView(name){toolbar.querySelectorAll('[data-device-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.deviceView===name)));},setActive(value){active=value;display.setActive(active&&onscreen&&!document.hidden);},dispose(){observer?.disconnect();abort.abort();unsubscribe();display.dispose();texture.dispose();screen.material.dispose();screen.material=original;screen.position.z=originalZ;shells.forEach(shell=>shell.visible=true);panel.remove();toolbar.remove();root.classList.remove('dash-device-live');}};
  }});
})();
