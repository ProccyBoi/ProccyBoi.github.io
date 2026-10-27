/* Verify the actual Pages response bytes against the checked-out deployment. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const base=process.env.V2_BASE_URL||'https://proccyboi.github.io';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const files=[
 'v2/index.html','v2/projects/skylabs/reflow/index.html',
 'assets/skylabs-reflow.js','assets/skylabs-reflow.css',
 'assets/models/manufacturing/skylabs-reflow-lands.json',
 'assets/models/hero/telemetry.idx.bin.gz','assets/models/hero/environment.bin.gz',
 'assets/models/hardware/skylabs-telemetry/silk-front.svg',
 'assets/models/hardware/skylabs-telemetry/silk-back.svg'
];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const results=[];
 for(const file of files){
  const expected=digest(fs.readFileSync(file));let actual,status;
  for(let attempt=0;attempt<5;attempt++){
   const response=await fetch(`${base}/${file}?verify=${revision}-${attempt}`,{signal:AbortSignal.timeout(30000)});
   status=response.status;actual=digest(Buffer.from(await response.arrayBuffer()));
   if(response.ok&&actual===expected)break;
   if(attempt<4)await new Promise(resolve=>setTimeout(resolve,15000));
  }
  assert.equal(status,200,file+' must be published');assert.equal(actual,expected,file+' must exactly match '+revision);
  results.push({file,sha256:actual});console.log('PASS live bytes: '+file);
 }
 fs.mkdirSync('docs/reflow-review',{recursive:true});
 fs.writeFileSync('docs/reflow-review/live-revision.json',JSON.stringify({revision,base,verifiedAt:new Date().toISOString(),files:results},null,2)+'\n');
 console.log('PASS exact deployed assets for '+revision);
})().catch(error=>{console.error(error);process.exitCode=1;});
