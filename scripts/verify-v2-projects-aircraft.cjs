/* Source contracts and production navigation-gate scenarios for the Projects
 * aircraft header. Run with Node; no browser, server or timing claim. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('v2/index.html'), projects = read('v2/projects/index.html');
assert.doesNotMatch(home, /data-aircraft-hero|aircraft-story\.css|v3-aircraft-hero\.js|V2TransportPriority/, 'Homepage carries no aircraft scene, controller, style or transport coordinator');
for (const id of ['skylabs-aircraft', 'skylabs-telemetry']) assert.match(home, new RegExp('id="' + id + '"'), 'Existing homepage fragment remains meaningful');
assert.match(home, /href="\/v2\/projects\/#skylabs-aircraft"/, 'Homepage links to the moved animation');
assert.match(read('assets/v2-selected-work.js'), /skipScene\.href='#engineering-range'/, 'Framework skips forward to actual homepage content');
assert.equal((projects.match(/data-aircraft-hero/g) || []).length, 1);
assert.match(projects, /data-aircraft-background data-aircraft-collection/);
assert.equal((projects.match(/<h1\b/g) || []).length, 1);
assert.match(projects, /<h1 id="projects-title">Projects<\/h1>/);
assert.ok(projects.indexOf('data-aircraft-hero') < projects.indexOf('id="collection"'));
assert.match(projects, /class="skip-link" href="\/v2\/projects\/#collection"/);
assert.match(projects, /id="collection" tabindex="-1"/);
assert.match(projects, /class="v3-story-skip" href="\/v2\/projects\/#collection"/);
assert.match(projects, /Browse all 16 projects/);
assert.match(projects, /data-v2-search/);
assert.equal((projects.match(/data-v2-project href=/g) || []).length, 23, 'Sixteen projects plus seven demo destinations remain');
assert.deepEqual([...projects.matchAll(/<article id="([^"]+)" data-aircraft-chapter="(\d+)"/g)].map(match => [match[1], match[2]]), [['skylabs-aircraft', '0'], ['skylabs-telemetry', '1']]);
const source = read('assets/v3-aircraft-hero.js');
const production = name => {
  const match = source.match(new RegExp('^  (?:async )?function ' + name + '\\([\\s\\S]*?^  \\}', 'm'));
  assert.ok(match, 'Production function exists: ' + name); return match[0];
};
const eligibility = source.match(/^  const preparationEligible = .+$/m)?.[0];
assert.ok(eligibility);
function navigation({ collection = true, pending = false, bottom = 1200 } = {}) {
  const state = { bottom, restores: 0, initializes: 0, backgroundStarts: 0, frame: null };
  const context = vm.createContext({
    collection, collectionNavigationPending: pending, restoringCollectionNavigation: false,
    background: true, visible: true, preparationNear: true, preparationIntent: false,
    innerHeight: 900, location: { hash: '#collection' },
    root: { getBoundingClientRect: () => ({ bottom: state.bottom }) },
    document: { getElementById: () => ({ scrollIntoView(options) {
      assert.equal(options.behavior, 'instant'); state.restores++; state.bottom = 76;
    } }) },
    requestAnimationFrame: callback => { state.frame = callback; }, updateScroll() {}, wakeBackground() {},
    initialize: () => state.initializes++, prepareInBackground: () => state.backgroundStarts++,
  });
  vm.runInContext(`${production('collectionPreparationAllowed')}\n${eligibility}\n${production('restoreCollectionNavigation')}\nglobalThis.eligible=preparationEligible;`, context);
  return { state, context };
}
let test = navigation(); assert.equal(test.context.eligible(), true, 'Normal Projects entry can prepare the visible aircraft');
test = navigation({ pending: true });
assert.equal(test.context.eligible(), false, 'Direct collection link cannot start aircraft while native fragment navigation is pending');
test.context.restoreCollectionNavigation();
assert.equal(test.state.restores, 1); assert.equal(test.context.eligible(), false, 'Gate remains closed through restoration frame');
test.context.restoreCollectionNavigation(); assert.equal(test.state.restores, 1, 'Load/pageshow cannot duplicate fragment restoration');
test.state.frame();
assert.equal(test.context.eligible(), false, 'Scene tail beneath collection filters cannot initialize aircraft');
assert.equal(test.state.initializes + test.state.backgroundStarts, 0);
test.state.bottom = 320; assert.equal(test.context.eligible(), true, 'Returning to useful scene space makes aircraft eligible');
test.state.bottom = 76; test.context.preparationIntent = true;
assert.equal(test.context.eligible(), true, 'Explicit chapter intent can prepare the scene');
test = navigation({ collection: false, pending: true, bottom: -100 });
assert.equal(test.context.eligible(), true, 'The collection gate never changes v3 scheduling');
assert.match(source, /distance = height \* \(collection \? 1 : background \? \(width < 761 \? 2\.1 : 1\.8\) : \(width < 761 \? 3\.7 : 3\.1\)\)/, 'Shorter collection scroll does not alter existing variants');
// Only opted-in Projects fetches terrain after the same preference, viewport
// and WebGL gates as the trainer. The early/save-data image is a direct render.
assert.doesNotMatch(projects + source, /data-sonoran-template|trainer-sonoran-field|fieldPicture/);
assert.match(source,/V2TucsonRelief\.create\(T, scene/);
assert.match(projects,/data-aircraft-collection data-aircraft-sonoran/);
for (const name of ['stopped','approach','stopped-mobile','approach-mobile']) {
  const asset='assets/images/v2/tucson-trainer-'+name+'.webp';
  assert.ok(projects.includes('/'+asset));
  assert.ok(fs.statSync(path.join(root,asset)).size < (name.endsWith('mobile') ? 58000 : 100000));
}
assert.doesNotMatch(home + read('v2/projects/skylabs/index.html') + read('v3/index.html'),/data-aircraft-sonoran|tucson-trainer-|v2-tucson-relief/);
const geometryJS=read('assets/v2-tucson-relief.js');
assert.doesNotMatch(geometryJS,/requestAnimationFrame|ImageLoader|TextureLoader|trainer-sonoran-field/);
const heights=fs.readFileSync(path.join(root,'assets/models/tucson-mountains/relief.bin'));
assert.equal(heights.length, 193*185*2);
const color={copy(){return this},lerp(){return this}};
const poseContext=vm.createContext({
  sonoran:true,width:1440,height:900,camera:{},flight:{frame:()=>({focus:0,distance:5})},
  fitLight(){},smooth(n){const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)},
  key:{userData:{direction:{set(){return this},normalize(){return this}}}},
  tucson:{update(pose,framing,camera,width,height,amount){this.last=amount}},
  atmosphere:{update(){throw Error('v2 trainer should not draw the legacy sky')}},
  scene:{fog:{color}},floorMaterial:{color,transparent:true},groundUniforms:{sky:{},near:{},far:{}},
  studioGround:color,airfieldGround:color,studioFog:color,airfieldFog:color,renderFrame(){}
});
vm.runInContext(production('drawPose'),poseContext);
for (const [progress,expected] of [[0,1],[.06,1],[.22,.5],[.38,0],[1,0],[0,1]]) {
  assert.ok(Math.abs(poseContext.drawPose({landing:1,progress})-expected)<1e-6);
  assert.ok(Math.abs(poseContext.tucson.last-expected)<1e-6);
  assert.ok(Math.abs(poseContext.floorMaterial.opacity-(1-expected))<1e-6);
}
console.log('PASS: Projects-only rendered DEM and native accessible collection, source gate, reversible studio handoff and untouched home/v3 contracts. Source checks only.');
