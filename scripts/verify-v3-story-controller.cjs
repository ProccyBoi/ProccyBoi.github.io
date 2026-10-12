/* Focused controller logic tests with a tiny DOM double, not browser/CSS QA.
 * Executes the actual chapter, anchor-layout, enable and fallback functions.
 * node scripts/verify-v3-story-controller.cjs */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const rootPath=path.resolve(__dirname,'..');
const source=fs.readFileSync(rootPath+'/assets/v3-aircraft-hero.js','utf8');
const html=fs.readFileSync(rootPath+'/v3/index.html','utf8');
const ids=[...html.matchAll(/<article id="([^"]+)" data-aircraft-chapter=/g)].map(match=>match[1]);
assert.deepEqual(ids,['aircraft','telemetry']);
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))}
function fixture(detailed=true,ambient=false){
 const document={activeElement:null,documentElement:{}};
 function element(id=''){
  const classes=new Set(),attrs={};
  const node={id,style:{setProperty(name,value){this[name]=value}},children:[],dataset:{},attrs,classes,inert:false,hidden:false,
   classList:{add(...values){values.forEach(v=>classes.add(v))},remove(...values){values.forEach(v=>classes.delete(v))},toggle(value,on){on?classes.add(value):classes.delete(value)}},
   setAttribute(name,value){attrs[name]=value},removeAttribute(name){delete attrs[name]},contains(value){return value===node},
   focus(){document.activeElement=node},scrollIntoView(){node.scrolled=true},append(child){node.children.push(child)},remove(){node.removed=true},getBoundingClientRect(){return{top:0}}
  };return node;
 }
 const chapterIds=detailed?ids:['aircraft','inside','telemetry'],chapters=chapterIds.map(id=>element(id)),links=chapterIds.map(()=>element());
 const root=element(),context={document,root,chapters,links,ids:chapterIds,detailed,background:false,ambient,currentChapter:-1,track:null,frame:0,previousTime:0,scrubTime:0,renderedProgress:0,progress:0,landingDone:false,skip:element(),stage:{clientWidth:1440,clientHeight:900,getBoundingClientRect(){return{top:0,bottom:900}}},renderer:null,scrollY:0,rootTop:0,width:1,height:1,distance:1,location:{hash:'#telemetry'},deferred:false,scrub:false,directScrub:false,visible:true,lastScroll:0,flight:null,bar:null,clamp:n=>Math.max(0,Math.min(1,n)),
  cancelAnimationFrame(){},requestAnimationFrame(fn){fn()},getComputedStyle(){return{scrollPaddingTop:'76',top:'76',getPropertyValue(){return '34'}}},showPoster(pose){context.poster=pose},updateScroll(){context.scrollUpdates=(context.scrollUpdates||0)+1},endLanding(){context.landingDone=true},request(){}
 };
 document.createElement=()=>element();document.getElementById=id=>root.children.flatMap(track=>track.children).find(node=>node.id===id)||chapters.find(node=>node.id===id);
 vm.createContext(context);
 const chapterAt=source.match(/  const chapterAt =[^\n]+/)[0].replace('const chapterAt','globalThis.chapterAt');
 vm.runInContext(chapterAt+'\n'+extract('  function chapter(index)','  function endLanding()')+extract('  function enable()','  function updateScroll()')+extract('  function layout()','  function fitLight('),context);
 if(ambient)vm.runInContext(extract('  function updateScroll()','  function layout()'),context);
 return context;
}
const current=fixture();
assert.equal(current.chapterAt(0),0);assert.equal(current.chapterAt(.61),0);assert.equal(current.chapterAt(.759),0);assert.equal(current.chapterAt(.76),1);assert.equal(current.chapterAt(1),1);
assert.equal(current.chapterAt(Math.min(1,.61)),0,'Pending telemetry holds the aircraft chapter');
current.enable();assert.equal(current.track.children.length,2);assert.deepEqual(current.track.children.map(step=>step.id),['aircraft','telemetry']);
assert.ok(current.landingDone,'Deep telemetry hash ends autoplay');assert.ok(current.track.children[1].scrolled,'Deep telemetry hash uses its real anchor');
assert.deepEqual(current.track.children.map(step=>step.style.top),['76px','2866px']);
assert.deepEqual(current.chapters.map(chapter=>chapter.id),['copy-aircraft','copy-telemetry']);
current.document.activeElement=current.chapters[0];current.chapter(1);
assert.equal(current.document.activeElement,current.links[1],'Active copy relinquishes focus to matching navigation');assert.equal(current.chapters[0].inert,true);assert.equal(current.chapters[1].inert,false);assert.equal(current.links[1].attrs['aria-current'],'step');
current.chapter(0);assert.equal(current.chapters[0].inert,false);assert.equal(current.chapters[1].inert,true);
current.chapter(1);current.scrollY=1000;current.fallback('unavailable');
assert.equal(current.track,null);assert.equal(current.root.dataset.aircraftState,'unavailable');assert.equal(current.poster,'stopped');
assert.deepEqual(current.chapters.map(chapter=>chapter.id),['aircraft','telemetry']);assert.ok(current.chapters.every(chapter=>!chapter.inert&&!('aria-hidden' in chapter.attrs)));assert.ok(current.chapters[1].scrolled,'Fallback restores the telemetry destination');
current.enable();assert.equal(current.track.children.length,2,'Re-enabling reduced motion state recreates exactly two anchors');
const legacy=fixture(false);legacy.enable();assert.equal(legacy.track.children.length,3);assert.equal(legacy.chapterAt(.38),1);assert.equal(legacy.chapterAt(.8),2);assert.deepEqual(legacy.track.children.map(step=>step.style.top),['76px','1136.2px','2866px']);
console.log('PASS two-destination chapter selection, pending board hold, deep-link anchors, focus transfer, fallback restoration, preference re-enable and unchanged three-chapter v2 logic.');

const ambient=fixture(true,true);
ambient.chapters.forEach((article,index)=>{article.getBoundingClientRect=()=>({top:index*720});});
ambient.enable();
assert.equal(ambient.track,ambient.root,'Ambient scene uses its real section, never a generated runway');
assert.equal(ambient.root.children.length,0,'Ambient scene creates no jump targets or navigation');
assert.deepEqual(ambient.chapters.map(article=>article.id),ids,'Ambient anchors stay on actual content');
assert.equal(ambient.root.style.height,undefined,'Ambient mode does not manufacture document height');
assert.equal(ambient.distance,720,'Native content positions define the decorative progress range');
assert.equal(ambient.rootTop,-76,'Real document scroll padding defines the start pose');
assert.equal(ambient.landingDone,true,'Ambient mode has no autoplay gate');
assert.equal(ambient.poster,'stopped');
ambient.document.activeElement=ambient.chapters[0];ambient.chapter(1);
assert.equal(ambient.document.activeElement,ambient.chapters[0],'Scroll must never steal content focus');
assert.ok(ambient.chapters.every(article=>!article.inert&&!('aria-hidden' in article.attrs)),'Both ambient articles remain accessible');
ambient.scrollY=1000;ambient.fallback('static');
assert.equal(ambient.root.removed,undefined,'Fallback must not remove the real section');
assert.ok(ambient.chapters.every(article=>!article.scrolled),'Preference changes never relocate the reader');
ambient.enable();assert.equal(ambient.root.children.length,0);
console.log('PASS v2 ambient real anchors, ordinary copy, native scroll range, no autoplay, no focus mutation and static recovery.');

// The normal-flow section moves when preceding copy reflows, even if the
// aircraft stage and its own copy do not resize. Use the production scroll
// function without another layout() call, including its pose revision path.
const reflow=fixture(true,true);let sectionTop=1600,revisions=0;
reflow.chapters.forEach((article,index)=>{article.getBoundingClientRect=()=>({top:sectionTop+index*720-reflow.scrollY});});
reflow.enable();
reflow.background=true;reflow.scrub={jump:.3};reflow.directScrub=true;
reflow.revisePose=mask=>{revisions++;reflow.lastMask=mask;};
reflow.scrollY=sectionTop-76+360;reflow.updateScroll();
assert.equal(reflow.progress,.5);assert.equal(reflow.renderedProgress,.5);
assert.equal(reflow.root.dataset.aircraftProgress,'0.500000');
const stageSize=[reflow.stage.clientWidth,reflow.stage.clientHeight];
sectionTop+=420;reflow.updateScroll();
assert.equal(reflow.rootTop,sectionTop-76,'Scroll refreshes origin after unrelated preceding content reflows');
assert.equal(reflow.distance,720);assert.deepEqual([reflow.stage.clientWidth,reflow.stage.clientHeight],stageSize,'Stage size is unchanged');
assert.equal(reflow.progress,0,'Earlier cached origin cannot advance a now-distant scene');
assert.equal(reflow.renderedProgress,0,'Direct-scroll render target uses refreshed content positions');
assert.equal(reflow.lastMask,true,'A corrected large jump keeps the existing stale-frame masking contract');
reflow.scrollY=sectionTop-76+720;reflow.updateScroll();
assert.equal(reflow.progress,1);assert.equal(reflow.renderedProgress,1);
assert.equal(reflow.root.dataset.aircraftProgress,'1.000000');
reflow.scrollY=sectionTop-76+180;reflow.updateScroll();
assert.equal(reflow.progress,.25);assert.equal(reflow.renderedProgress,.25,'Reverse scrolling still follows the moved real content');
assert.equal(revisions,4,'Each changed native target preserves pose revision handling');
console.log('PASS ambient scroll origin after preceding-content reflow, unchanged stage size, direct targets, reverse scroll and pose invalidation.');
