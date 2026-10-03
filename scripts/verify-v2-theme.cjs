/* Dark-theme acceptance across every public project.
 * Requires Playwright and a static server. Optional V2_BASE_URL,
 * CHROMIUM_EXECUTABLE and V2_THEME_ROUTES (comma-separated paths).
 * Scientific canvas/SVG plots keep their authored presentation; checks cover
 * the surrounding page, labels and controls rather than plot pixels. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const output=path.resolve(__dirname,'../.codex-temp/theme-qa');

function inspectTheme(){
 const rgba=value=>{
  const match=value.match(/^rgba?\(([^)]+)\)$/);
  if(!match)return null;
  const channels=match[1].split(/[\s,\/]+/).map(Number);
  return [channels[0],channels[1],channels[2],channels[3]??1];
 };
 const blend=(front,back)=>front.slice(0,3).map((channel,index)=>channel*front[3]+back[index]*(1-front[3]));
 const luminance=color=>color.slice(0,3).map(channel=>{
  const normalized=channel/255;return normalized<=.04045?normalized/12.92:Math.pow((normalized+.055)/1.055,2.4);
 }).reduce((total,channel,index)=>total+channel*[.2126,.7152,.0722][index],0);
 const background=element=>{
  const chain=[];for(let node=element;node;node=node.parentElement)chain.unshift(node);
  let color=[255,255,255],gradient=false;
  for(const node of chain){
   const style=getComputedStyle(node),layer=rgba(style.backgroundColor);
   if(layer){color=blend(layer,color);if(layer[3]===1)gradient=false;}
   if(style.backgroundImage!=='none')gradient=true;
  }
  return {color,gradient};
 };
 const visible=element=>{
  if(!element.getClientRects().length||element.closest('[hidden],[inert],dialog:not([open])'))return false;
  for(let node=element;node;node=node.parentElement){const style=getComputedStyle(node);if(style.visibility!=='visible'||Number(style.opacity)===0)return false;}
  return true;
 };
 const selector=element=>{
  if(element.id)return '#'+CSS.escape(element.id);
  const attribute=[...element.attributes].find(item=>item.name.startsWith('data-'));
  if(attribute)return `${element.tagName.toLowerCase()}[${attribute.name}${attribute.value?'="'+attribute.value+'"':''}]`;
  const classes=[...element.classList].slice(0,2).map(name=>'.'+CSS.escape(name)).join('');
  const parent=element.parentElement;
  const prefix=parent?.id?'#'+CSS.escape(parent.id)+' > ':parent?.classList.length?'.'+CSS.escape(parent.classList[0])+' > ':'';
  return prefix+element.tagName.toLowerCase()+classes;
 };
 const surfaces=[];
 // Plot, device and canvas backgrounds intentionally are not in this list.
 const surfaceSelector='body,.v2-header,.v2-footer,.project-hero,.project-body,.project-interactive,.v2-collection-controls,.about-hero,.app>aside,.readout,.note,.metric,.insight,.equations .eq';
 for(const element of document.querySelectorAll(surfaceSelector)){
  if(!visible(element))continue;
  const bg=background(element),light=luminance(bg.color);
  if(light>.18&&!bg.gradient)surfaces.push({selector:selector(element),background:bg.color.map(Math.round),luminance:Number(light.toFixed(3))});
 }
 const contrast=[];let checkedText=0;
 const textSelector='h1,h2,h3,p,label,button,select,input[type="search"],input[type="text"],output,.v2-nav a,.v2-case-nav a,.project-hero-actions a,.project-meta dd,.hardware-boards a,.hardware-components summary,.hardware-components summary span,.hardware-components summary strong,.row .val,.cell .k,.cell .v,.metric b,.metric span,.metric small,.stage-title>span,.equations code,.sub,.pill,.flag';
 for(const element of document.querySelectorAll(textSelector)){
  if(!visible(element)||element.disabled||element.getAttribute('aria-disabled')==='true')continue;
  const text=(element.innerText||element.value||element.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ');
  if(!text||element.closest('svg,canvas'))continue;
  const style=getComputedStyle(element),color=rgba(style.color),bg=background(element);
  if(!color||bg.gradient)continue;
  checkedText++;
  const foreground=blend(color,bg.color),a=luminance(foreground),b=luminance(bg.color),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  const fontSize=parseFloat(style.fontSize),bold=Number(style.fontWeight)>=700;
  const minimum=fontSize>=24||(fontSize>=18.66&&bold)?3:4.5;
  if(ratio+.02<minimum)contrast.push({selector:selector(element),text:text.slice(0,110),foreground:style.color,background:bg.color.map(Math.round),ratio:Number(ratio.toFixed(2)),minimum});
 }
 const overflowElements=[...document.querySelectorAll('.grid,aside,section,.note,.eq,.readout,.row,.plots')].filter(visible).map(element=>({selector:selector(element),width:Math.round(element.getBoundingClientRect().width),right:Math.round(element.getBoundingClientRect().right)})).filter(item=>item.right>innerWidth+1).slice(0,10);
 return {background:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1,overflowElements,surfaces,contrast,checkedText};
}

(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 const results=[],errors=[],resources=[];
 try{
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:900}});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push({url:page.url(),message:error.message}));
  page.on('response',response=>{if(response.status()>=400)resources.push({status:response.status(),url:response.url()});});
  await page.goto(base+'/v2/projects/',{waitUntil:'networkidle'});
  const projects=await page.locator('[data-v2-project][href^="/v2/projects/"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
  assert.equal(new Set(projects).size,15,'Current public collection must contain fifteen projects');
  // Tools keep their routes and theme coverage even though they are no longer
  // cards in the primary project collection.
  let routes=['/v2/','/v2/projects/','/v2/about/',...projects,'/v2/projects/skylabs/boards/telemetry/','/v2/projects/skylabs/boards/ground-station/','/v2/projects/scopelab/','/v2/projects/mosfet-operating-regions/','/v2/projects/lithography-animation/'];
  if(process.env.V2_THEME_ROUTES)routes=routes.filter(route=>process.env.V2_THEME_ROUTES.split(',').includes(route));
  const representative=new Set(['/v2/','/v2/projects/','/v2/about/','/v2/projects/tramtrace/','/v2/projects/skylabs/','/v2/projects/mosfet-operating-regions/','/v2/projects/lithography-animation/','/v2/projects/framework-logic-analyser/','/v2/projects/framework-raspberry-pi/']);
  for(const route of routes){
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    await page.goto(base+route,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('h1').count(),1,route+' h1');
    assert.equal(await page.locator('.v2-header').isVisible(),true,route+' navigation');
    assert.equal(await page.locator('.v2-nav a[href="/v2/projects/"]').count(),1);
    let inspected=await page.evaluate(inspectTheme);
    const states=[{name:'initial',...inspected}];
    if(width===390){
     await page.locator('[data-v2-menu]').click();
     assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'true');
     assert.equal(await page.locator('[data-v2-nav]').isVisible(),true);
     states.push({name:'menu',...await page.evaluate(inspectTheme)});
     await page.keyboard.press('Escape');
    }
    const filename=route.replace(/^\/|\/$/g,'').replaceAll('/','-')+'-'+width;
    if(representative.has(route))await page.screenshot({path:path.join(output,filename+'-top.png')});
    const toggles=route==='/v2/projects/skylabs/'?['[data-hardware-board="ground"]']:
      route.includes('/mosfet-operating-regions/')?['.seg button[data-mode="continuous"]','[data-preset="cutoff"]','[data-preset="triode"]','[data-preset="saturation"]']:
      route.includes('/lithography-animation/')?['#negativeTone']:[];
    for(const selector of toggles){
     await page.locator(selector).click();
     states.push({name:selector,...await page.evaluate(inspectTheme)});
    }
    if(representative.has(route)){
     const section=page.locator('.project-interactive,.v2-lab .app,.v2-lab .grid').first();
     if(await section.count()){
      await section.evaluate(element=>scrollTo({top:element.getBoundingClientRect().top+scrollY-140,behavior:'instant'}));
      await page.screenshot({path:path.join(output,filename+'-controls.png')});
     }
     const plots=page.locator('.v2-lab .plots,.v2-lab .charts').first();
     if(await plots.count()){
      await plots.evaluate(element=>scrollTo({top:element.getBoundingClientRect().top+scrollY-140,behavior:'instant'}));
      await page.screenshot({path:path.join(output,filename+'-plots.png')});
     }
    }
    const failures=[];
    for(const state of states){
     if(state.overflow)failures.push({state:state.name,type:'overflow',elements:state.overflowElements});
     failures.push(...state.surfaces.map(issue=>({state:state.name,type:'surface',...issue})),...state.contrast.map(issue=>({state:state.name,type:'contrast',...issue})));
    }
    results.push({route,width,checkedText:inspected.checkedText,failures});
    console.log(`${failures.length?'REVIEW':'PASS'} ${route} ${width}px: ${inspected.checkedText} text/control samples, ${failures.length} findings`);
   }
  }
  const reportName=process.env.V2_THEME_ROUTES?'report-filtered.json':'report.json';
  await fs.writeFile(path.join(output,reportName),JSON.stringify({results,errors,resources},null,2));
  const unique=new Map();
  for(const result of results)for(const failure of result.failures){const key=[result.route,failure.type,failure.selector,failure.foreground,failure.background].join('|');if(!unique.has(key))unique.set(key,{route:result.route,...failure});}
  console.log(JSON.stringify({pages:results.length/2,uniqueFindings:[...unique.values()],errors,resources},null,2));
  assert.equal(unique.size,0,'Theme findings: inspect .codex-temp/theme-qa/'+reportName);
  assert.deepEqual(errors,[],'Page errors');assert.deepEqual(resources,[],'Failed resources');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
