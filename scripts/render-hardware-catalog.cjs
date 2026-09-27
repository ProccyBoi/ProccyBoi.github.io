/* Capture the same source assembly used by the website; no external rendering
   services or source-project writes. Requires Playwright and a local server. */
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const models=path.resolve(__dirname,'../assets/models/hardware');
const output=path.resolve(__dirname,'../.codex-temp/hardware-posters');
const selected=process.argv.slice(2);
const figure=slug=>`<figure data-hardware="/assets/models/hardware/${slug}/assembly.json" data-hardware-title="${slug}" data-hardware-capture>
<div data-hardware-stage style="width:1600px;height:1200px"><img data-hardware-poster hidden><canvas data-hardware-canvas></canvas></div>
<button data-hardware-start hidden></button><button data-hardware-explode hidden></button><button data-hardware-reset hidden></button><button data-hardware-scroll hidden></button>
<input data-hardware-range type="range" hidden><select data-hardware-selection hidden></select><p data-hardware-part hidden></p><p data-hardware-status hidden></p></figure>`;
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const slugs=selected.length?selected:(await fs.readdir(models,{withFileTypes:true})).filter(item=>item.isDirectory()&&!item.name.startsWith('_')).map(item=>item.name);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1200},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.route('**/__hardware-capture__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>*{box-sizing:border-box}html,body,figure{padding:0;margin:0;background:transparent}canvas{display:block;width:1600px;height:1200px}[hidden]{display:none!important}</style></head><body>'+figure(page.__slug)+'<script src="/assets/v2-hardware.js"></script></body></html>'}));
  for(const slug of slugs){
   await fs.access(path.join(models,slug,'assembly.json'));
   page.__slug=slug;
   await page.goto(base+'/__hardware-capture__',{waitUntil:'domcontentloaded'});
   await page.locator('[data-hardware-state="ready"]').waitFor({timeout:120000});
   await page.waitForFunction(()=>document.querySelector('[data-hardware]').dataset.hardwareMotion==='idle');
   await page.locator('canvas').screenshot({path:path.join(output,slug+'.png'),omitBackground:true});
   console.log('Captured '+slug+' '+JSON.stringify(await page.locator('[data-hardware]').evaluate(node=>({...node.dataset}))));
  }
 }finally{await browser.close();}
 console.log('PNG captures: '+output);
})().catch(error=>{console.error(error);process.exitCode=1;});
