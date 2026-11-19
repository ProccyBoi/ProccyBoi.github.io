'use strict';
/* Three cold, natural (no ?capture) visits. Reads existing timing/fence evidence,
 * no hero seeking, server compression or handset benchmark claimed. */
const fs=require('node:fs'),{chromium}=require('playwright');
const out=process.env.OUTPUT_DIR,base=process.env.AFTER_BASE,w=+process.env.WIDTHS;
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const samples=[];
 try{for(let n=0;n<3;n++){
   const c=await b.newContext({viewport:{width:w,height:w<600?770:800},deviceScaleFactor:w<600?2:1,isMobile:w<600,hasTouch:w<600});
   try{
    const p=await c.newPage(),session=await c.newCDPSession(p);await session.send('Network.enable');await session.send('Network.setCacheDisabled',{cacheDisabled:true});
    await p.addInitScript(()=>{window.__tSample={long:[],lcp:[],fence:[]};for(const [type,k] of [['longtask','long'],['largest-contentful-paint','lcp']])try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__tSample[k].push({start:e.startTime,duration:e.duration,url:e.url}))).observe({type,buffered:true});}catch{};document.addEventListener('DOMContentLoaded',()=>{const root=document.querySelector('[data-aircraft-hero]');if(root)new MutationObserver(()=>{const m=JSON.parse(root.dataset.aircraftLastFrame||'null');if(m?.published&&m?.sequence&&window.__tSample.fence.length<24&&!window.__tSample.fence.some(x=>x.sequence===m.sequence))window.__tSample.fence.push(m);}).observe(root,{attributes:true,attributeFilter:['data-aircraft-last-frame']});},{once:true});});
    await p.goto(base+'/v2/projects/',{waitUntil:'domcontentloaded',timeout:45000});
    await p.waitForFunction(()=>Number(document.querySelector('[data-aircraft-hero]')?.dataset.aircraftFirstLiveMs)>0,null,{timeout:180000});
    await p.waitForTimeout(1500);
    samples.push(await p.evaluate(()=>{const r=document.querySelector('[data-aircraft-hero]'),t=window.__tSample,n=performance.getEntriesByType('navigation')[0],f=performance.getEntriesByName('first-contentful-paint')[0],first=+r.dataset.aircraftFirstLiveMs;return {firstLiveMs:first,firstContentfulPaintMs:f?.startTime,domContentLoadedMs:n.domContentLoadedEventEnd,lcp:t.lcp,preFrameLongTasks:t.long.filter(q=>q.start<=first),presented:[...t.fence].map(e=>({cpu:e.measurement?.cpuMs,gpuWait:e.gpu?.waitMs,completion:e.gpu?.state,pixelRatio:e.measurement?.pixelRatio})),resources:performance.getEntriesByType('resource').filter(e=>e.startTime<=first).map(e=>({name:e.name,transfer:e.transferSize,end:e.responseEnd,start:e.startTime,encoded:e.encodedBodySize})),checkedAt:performance.now()};}));
   }finally{await c.close()}
 }}finally{await b.close();fs.writeFileSync(out+'/cold-natural.json',JSON.stringify(samples,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
