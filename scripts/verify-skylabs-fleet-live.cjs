/* Verify the published fleet route and delivery bytes against this checkout. */
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.V2_BASE_URL||'https://proccyboi.github.io';
const revision=process.env.GITHUB_SHA||'local-review';
const files=[
 ...['assets/v2-skylabs-film.js','assets/models/aircraft/skylabs-mechanism/sensor-body.glb.gz','assets/models/aircraft/skylabs-mechanism/sensor-identification.json'].map(file=>[file,'/'+file]),
 ['v2/projects/skylabs/index.html','/v2/projects/skylabs/'],
 ['assets/v2-skylabs-fleet.js','/assets/v2-skylabs-fleet.js'],
 ['assets/v2-skylabs-fleet.css','/assets/v2-skylabs-fleet.css'],
 ...['skylabs-competition','skylabs-mechanism'].flatMap(slug=>['assembly.glb.gz','manifest.json'].map(name=>{const file=`assets/models/aircraft/${slug}/${name}`;return [file,'/'+file];})),
 ...['poster.webp','integration.json','solarfilm.json.gz'].map(name=>{const file='assets/models/aircraft/skylabs-competition/'+name;return [file,'/'+file];})
];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 for(const [local,route] of files){
  const expected=hash(fs.readFileSync(local));let last;
  for(let attempt=0;attempt<8;attempt++){
   try{const response=await fetch(new URL(route+'?release='+encodeURIComponent(revision)+'&verify='+attempt,base),{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,route+' HTTP status');const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),expected,route+' published bytes');console.log('PASS',route,bytes.length,expected);last=null;break;}
   catch(error){last=error;if(attempt<7)await new Promise(resolve=>setTimeout(resolve,5000));}
  }
  if(last)throw last;
 }
 console.log('PASS exact live fleet route/assets for',revision);
})().catch(error=>{console.error(error);process.exitCode=1;});
