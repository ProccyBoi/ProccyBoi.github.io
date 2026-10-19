#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {ROOT}=require('./fixtures.cjs');
const html=fs.readFileSync(path.join(ROOT,'shared/flight-review/index.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
assert.ok(scripts.some(x=>x.includes('flight-review.js')),'Entry script present');
assert.ok(!scripts.some(x=>/three|maplibre|xlsx/.test(x)),'Entry does not eagerly load 3D or spreadsheet dependencies');
assert.doesNotMatch(html,/<link\b[^>]*href="[^"]*maplibre/,'Map CSS is also lazy');
for(const selector of ['data-flight-file','data-cancel-load','data-workspace','data-loading','data-play','data-timeline','data-view-button="charts"','data-schema-dialog','data-download-csv'])assert.ok(html.includes(selector),'Stable UI contract '+selector);
for(const route of ['projects/skylabs/flight-review/index.html','v2/projects/skylabs/flight-review/index.html','v3/projects/skylabs/flight-review/index.html']) {
  const legacy=fs.readFileSync(path.join(ROOT,route),'utf8');
  assert.match(legacy,/<meta http-equiv="refresh" content="0;url=\/shared\/flight-review\/">/,'Legacy no-JavaScript refresh '+route);
  assert.match(legacy,/<link rel="canonical" href="https:\/\/proccyboi\.github\.io\/shared\/flight-review\/">/,'Canonical shared route '+route);
  assert.ok(legacy.includes('location.replace("/shared/flight-review/" + location.search + location.hash);'),'History replacement preserves query/hash '+route);
  assert.ok(legacy.includes('href="shared/flight-review/"'),'Native fallback link '+route);
}
for(const file of ['assets/flight-review.js','assets/flight-review-parser.js','assets/flight-review-worker.js',...fs.readdirSync(__dirname).filter(f=>f.endsWith('.cjs')).map(f=>'scripts/flight-review/'+f)])execFileSync(process.execPath,['--check',path.join(ROOT,file)],{stdio:'pipe'});
execFileSync(process.execPath,[path.join(__dirname,'fixtures.cjs'),'--self-test'],{stdio:'inherit'});
console.log('PASS lazy entry, stable user-facing controls, and syntax of every flight-review source/test script');
