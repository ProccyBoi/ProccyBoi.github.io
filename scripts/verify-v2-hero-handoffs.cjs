/* Run with Node; no browser or server required. Sample production layout and
 * caption functions across scene handoffs, including narrow viewports. These
 * are continuity guarantees for geometry/copy, not rendered pixel checks. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../assets/v2-assembly.js'),'utf8');
function segment(from,to){
  const start=source.indexOf(from),end=source.indexOf(to,start);
  assert.ok(start>=0&&end>start,`Production section exists: ${from.trim()}`);
  return source.slice(start,end);
}
const helpers=segment('  const clamp =','  let renderer,');
const choreography=segment('  const pose =','  const render =');
const captions=segment('  const captionAt =','  const updateProgress =');
for(const [width,height] of [[1440,900],[1280,900],[390,844],[320,740]]){
  const context=vm.createContext({stage:{clientWidth:width,clientHeight:height},innerWidth:width,devicePixelRatio:1,width:0,height:0,desiredRatio:0,revision:0,renderer:null,poses:[],updateProgress(){},refreshVisibility(){},request(){},active:-1,projects:[{title:'TramTrace'},{title:'Dash'},{title:'Pi'}],root:{dataset:{},querySelector:()=>({})},caption:{style:{},classList:{toggle(){}},setAttribute(){}},setExploreProject(){},selectors:[]});
  vm.runInContext(`${helpers}\n${choreography}\n${captions}\nlayout();globalThis.inspect=value=>{captionAt(value);return{positions:poses.map(keys=>interpolate(keys,value)),opacity:Number(caption.style.opacity)}};`,context);
  for(const [start,end] of [[.34,.445],[.65,.765]])for(let p=start;p<=end;p+=.0005){
    const state=context.inspect(p);
    assert.ok(state.positions.some(pose=>Math.abs(pose.x)<=5*width/height),`No board centre inside viewport ${width} at ${p}`);
    assert.ok(state.opacity>=.5,`Caption unreadable ${width} at ${p}: ${state.opacity}`);
  }
  for(const [index,p] of [[0,.265],[1,.565],[2,.88]]){
    const state=context.inspect(p);assert.equal(state.positions[index].e,1,`Preview ${index} lost exploded endpoint`);
  }
}
console.log('PASS: a board centre remains within the viewport and caption opacity stays at least 0.5 throughout both handoffs at 1440/1280/390/320 widths; all preview explosion endpoints retained. Geometry scheduling check, not rendered pixel verification.');
