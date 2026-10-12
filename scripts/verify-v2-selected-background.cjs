#!/usr/bin/env node
/* Source-only DOM/scheduling contract for the production Selected controller.
 * Real source executes with a tiny DOM and a deliberately unresolved CAD load.
 * Geometry, renderer, visual layout and GPU timing are separate acceptance. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/v2-selected-work.js'),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function fixture({reduced=false,visible=false,settled=false,heroVisible=true,signal=true}={}){
  const listeners=new Map(),mediaListeners=new Map(),created=[],loads=[],transfers=[],focusMoves=[];
  let rootTop=visible?500:1000,stageTop=visible?660:1160;
  const hero={dataset:{assemblyModelsSettled:'3',assemblyState:'ready',...(signal?{assemblyReadableVisible:String(heroVisible),assemblyForegroundSettled:String(settled)}:{})},querySelector:()=>null,getBoundingClientRect:()=>({top:0,bottom:900})};
  class Element{
    constructor(tag){this.tagName=tag.toUpperCase();this.attributes=new Map();this.dataset={};this.style={};this.children=[];this.id='';this.offsetHeight=1600;this.clientWidth=1200;this.clientHeight=824;this.className='';this.inert=false;this.classList={add:(...xs)=>{const v=new Set(this.className.split(' '));xs.forEach(x=>v.add(x));this.className=[...v].join(' ');},remove:(...xs)=>{this.className=this.className.split(' ').filter(x=>!xs.includes(x)).join(' ');},contains:x=>this.className.split(' ').includes(x),toggle:(x,force)=>{force?this.classList.add(x):this.classList.remove(x);}};}
    setAttribute(k,v){this.attributes.set(k,String(v));} getAttribute(k){return this.attributes.get(k)??null;} hasAttribute(k){return this.attributes.has(k);}removeAttribute(k){this.attributes.delete(k);}
    append(...nodes){nodes.forEach(node=>{node.remove();node.parent=this;this.children.push(node);if(node.tagName==='SCRIPT')queueMicrotask(()=>node.onload());});}
    insertBefore(node,before){node.remove();node.parent=this;const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,node);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
    contains(node){return this===node||this.children.some(x=>x.contains(node));}
    addEventListener(){} focus(){focusMoves.push(this);} scrollIntoView(){focusMoves.push('scroll');}
    getBoundingClientRect(){return{top:this===root?rootTop:stageTop,bottom:(this===root?rootTop:stageTop)+(this===root?2000:824)};}
    querySelectorAll(selector){if(selector==='[data-selected-chapter]')return articles;if(selector==='img')return images;return[];}
  }
  const root=new Element('section');root.setAttribute('data-selected-background-scene','');
  const articles=['work-framework','work-transit'].map(id=>{const e=new Element('section');e.id=id;return e;});
  const images=Array.from({length:6},()=>({naturalWidth:1200,complete:true,dataset:{},decode:async()=>{}}));root.append(...articles);
  const media={matches:reduced,addEventListener:(_,fn)=>mediaListeners.set('reduced',fn)};
  const short={matches:false,addEventListener(){}};
  const document={hidden:false,documentElement:{},activeElement:null,head:new Element('head'),querySelector(selector){return selector==='[data-selected-work]'?root:selector==='[data-assembly]'?hero:selector==='.v2-header'?{getBoundingClientRect:()=>({bottom:76})}:null;},createElement(tag){created.push(tag);return new Element(tag);},addEventListener:(name,fn)=>listeners.set(name,fn)};
  const window={DecompressionStream,THREE:{},V2HeroAssets:{whenTransferSettled:async()=>{}},V2HeroEnvironment:{prefetch:async()=>{}},V2SelectedAssets:{prefetchTextures:async()=>{},prefetch:async name=>{transfers.push(name);},loadStatic:name=>{loads.push(name);return new Promise(()=>{});}}};
  const context={window,document,navigator:{connection:{}},matchMedia:q=>q.includes('reduced')?media:short,getComputedStyle:()=>({top:'76px',scrollPaddingTop:'76px'}),requestAnimationFrame:fn=>setTimeout(()=>fn(performance.now()),0),cancelAnimationFrame:clearTimeout,setTimeout,clearTimeout,queueMicrotask,performance,innerHeight:900,scrollY:0,devicePixelRatio:1,location:{hash:'',search:''},addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>listeners.get(event.type)?.(event),CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},AbortController,URLSearchParams,console};
  vm.runInNewContext(source,context,{filename:'v2-selected-work.js'});
  return{root,articles,created,loads,transfers,focusMoves,hero,window,fire:name=>listeners.get(name)?.(),enter(){rootTop=400;stageTop=560;listeners.get('scroll')();},exitHero(){hero.dataset.assemblyReadableVisible='false';listeners.get('v2:hero-foreground')();},settle(){hero.dataset.assemblyForegroundSettled='true';listeners.get('v2:hero-foreground')();},reduce(){media.matches=true;mediaListeners.get('reduced')();}};
}
(async()=>{
  const deferred=fixture();await tick();await tick();
  assert.deepEqual(deferred.loads,[],'Installed model count does not authorize offscreen CPU work');
  assert.equal(deferred.window.V2SelectedWork.preparationState(),'deferred');
  assert.equal(deferred.root.dataset.selectedBackgroundState,'deferred-foreground');
  assert.equal(new Set(deferred.transfers).size,6,'All six transports remain eager behind CPU/GPU ownership');
  assert.equal(deferred.created.filter(tag=>tag==='canvas').length,1);
  assert.equal(deferred.created.filter(tag=>tag==='button'||tag==='a'||tag==='nav').length,0,'Background enhancement creates no controls, even hidden');
  assert.deepEqual(deferred.articles.map(a=>a.id),['work-framework','work-transit']);
  for(const article of deferred.articles){assert.equal(article.inert,false);assert.equal(article.getAttribute('aria-hidden'),null);assert.equal(article.parent.className,'v2-selected-content');}
  assert.equal(deferred.articles[0].parent.getAttribute('aria-hidden'),null,'Normal-flow content is exposed');
  deferred.settle();await tick();await tick();assert.equal(deferred.loads.length,1,'A completed visible hero releases near CPU construction');
  deferred.reduce();assert.ok(!deferred.root.classList.contains('is-scene'));for(const article of deferred.articles)assert.equal(article.parent.className,'v2-selected-content','Preference changes preserve the focused content ancestor');assert.deepEqual(deferred.focusMoves,[],'Fallback does not move focus or scroll');
  const promoted=fixture();await tick();promoted.enter();await tick();await tick();assert.equal(promoted.loads.length,1,'Actual Selected viewport entry promotes without waiting for hero');
  const exited=fixture();await tick();exited.exitHero();await tick();await tick();assert.equal(exited.loads.length,1,'Hero readable exit releases near CPU construction');
  const startup=fixture({signal:false});await tick();assert.equal(startup.loads.length,0,'Signal installation order cannot bypass visible hero ownership');
  const staticView=fixture({reduced:true});await tick();assert.equal(staticView.created.length,0,'Reduced motion creates neither visual stage nor controls');assert.deepEqual(staticView.loads,[]);
  console.log('PASS Selected background: stable native content, no generated controls/focus redirects, eager transfers, completed-foreground gate, visible promotion, hero exit and static fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
