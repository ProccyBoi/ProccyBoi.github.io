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
function fixture(detailed=true){
 const document={activeElement:null,documentElement:{}};
 function element(id=''){
  const classes=new Set(),attrs={};
  const node={id,style:{},children:[],dataset:{},attrs,classes,inert:false,hidden:false,
   classList:{add(...values){values.forEach(v=>classes.add(v))},remove(...values){values.forEach(v=>classes.delete(v))},toggle(value,on){on?classes.add(value):classes.delete(value)}},
   setAttribute(name,value){attrs[name]=value},removeAttribute(name){delete attrs[name]},contains(value){return value===node},
   focus(){document.activeElement=node},scrollIntoView(){node.scrolled=true},append(child){node.children.push(child)},remove(){node.removed=true},getBoundingClientRect(){return{top:0}}
  };return node;
 }
 const chapterIds=detailed?ids:['aircraft','inside','telemetry'],chapters=chapterIds.map(id=>element(id)),links=chapterIds.map(()=>element());
 const root=element(),context={document,root,chapters,links,ids:chapterIds,detailed,currentChapter:-1,track:null,frame:0,previousTime:0,landingDone:false,skip:element(),stage:{clientWidth:1440,clientHeight:900},renderer:null,scrollY:0,rootTop:0,width:1,height:1,distance:1,location:{hash:'#telemetry'},
  cancelAnimationFrame(){},requestAnimationFrame(fn){fn()},getComputedStyle(){return{scrollPaddingTop:'76'}},showPoster(pose){context.poster=pose},updateScroll(){context.scrollUpdates=(context.scrollUpdates||0)+1},endLanding(){context.landingDone=true},request(){}
 };
 document.createElement=()=>element();document.getElementById=id=>root.children.flatMap(track=>track.children).find(node=>node.id===id)||chapters.find(node=>node.id===id);
 vm.createContext(context);
 const chapterAt=source.match(/  const chapterAt =[^\n]+/)[0].replace('const chapterAt','globalThis.chapterAt');
 vm.runInContext(chapterAt+'\n'+extract('  function chapter(index)','  function endLanding()')+extract('  function enable()','  function updateScroll()')+extract('  function layout()','  function fitLight('),context);
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
