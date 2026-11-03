/* Material integration and reversible UV-preserving film regression. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const T = require('../assets/vendor/three.min.js');
global.window = global;
vm.runInThisContext(fs.readFileSync('assets/v2-skylabs-film.js','utf8'));
const geometry = new T.BufferGeometry(), positions = [], uv = [], normals = [], indices = [];
for (let row=0; row<3; row++) for (let column=0; column<5; column++) {
 const u=column/4,v=row/2; positions.push(1-u,.02,v); uv.push(u,v); normals.push(0,1,0);
}
for (let row=0; row<2; row++) for (let column=0; column<4; column++) {
 const a=row*5+column; indices.push(a,a+1,a+5,a+1,a+6,a+5);
}
geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
const map=new T.Texture(),material=new T.MeshPhysicalMaterial({map,metalness:.08,roughness:.29,clearcoat:.3});
const mesh=new T.Mesh(geometry,material),group=new T.Group();group.add(mesh);
mesh.userData={filmSurface:'wrap',filmRegion:'wing',peelAxis:[0,0,1],panelNormal:[0,1,0]};
const patches=window.V2SkylabsFilm.covering(T,{object:group,filmRegion:'wing'},true);
assert.equal(patches.length,1);assert.equal(group.children.length,1,'Finish does not add a surface');
assert.equal(material.map,map,'Livery texture remains attached');assert.equal(material.metalness,0);
assert.equal(material.roughness,.4);assert.equal(material.clearcoat,.13);
const shader={vertexShader:'#include <common>\n#include <uv_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};
material.onBeforeCompile(shader,{});
assert.match(shader.vertexShader,/>\nvarying vec2 vSolarfilmUv;/);
assert.match(shader.fragmentShader,/>\nfloat filmEdgeU/);
assert.ok(!shader.vertexShader.includes('\\n')&&!shader.fragmentShader.includes('\\n'),'Shader contains real line breaks, not literal escapes');
const rest=Array.from(mesh.geometry.attributes.position.array),beforeUV=Array.from(mesh.geometry.attributes.uv.array);
patches[0].deform(.4);assert.ok(patches[0].attached>0&&patches[0].peeled>0);
assert.notDeepEqual(Array.from(mesh.geometry.attributes.position.array),rest,'Free film deforms');
assert.deepEqual(Array.from(mesh.geometry.attributes.uv.array),beforeUV,'Logos stay on film UVs');
patches[0].deform(0);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),rest,'Reverse restores the film exactly');
console.log('PASS: satin finish and UV overlap band; preserved texture, peel and exact reverse.');
