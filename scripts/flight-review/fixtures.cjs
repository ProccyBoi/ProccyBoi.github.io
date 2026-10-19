#!/usr/bin/env node
'use strict';
// Deterministic, clearly synthetic fixtures. No captured/private aircraft data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const SIZES = {1:238, 2:250, 3:282};
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function binary({version=3, count=401, intervalMs=50, noGps=false, irregular=false, name=`synthetic-v${version}.bin`}={}) {
  const size=SIZES[version], buffer=Buffer.alloc(48+count*size), rows=[];
  buffer.write('SKYLBIN1'); buffer.writeUInt16LE(version,8); buffer.writeUInt16LE(48,10); buffer.writeUInt16LE(size,12);
  buffer.writeUInt32LE(1700000000,16); buffer.writeUInt32LE(intervalMs,20); buffer.writeUInt8(255,32);
  for(let i=0;i<count;i++) {
    const b=48+i*size, timestamp=10000+(irregular ? (i<3?i*50:10000+(i-3)*intervalMs) : i*intervalMs);
    buffer.writeUInt32LE(timestamp,b); buffer.writeUInt32LE(1700000000+Math.floor((timestamp-10000)/1000),b+4);
    buffer.writeUInt32LE(i>200?2:0,b+8); buffer.writeUInt32LE(0,b+12);
    buffer.writeInt32LE(noGps?0:-336440811+Math.round(Math.sin(i/150)*1000),b+16);
    buffer.writeInt32LE(noGps?0:1510470889+Math.round(Math.cos(i/150)*1000),b+20);
    buffer.writeUInt16LE(intervalMs,b+40); buffer.writeUInt16LE(10,b+42); buffer.writeUInt16LE(0,b+44);
    buffer.writeUInt8(noGps?0:3,b+47); buffer.writeUInt8(noGps?0:12,b+48);
    const floats={58:100,62:101,66:152.625+i*.001,70:12.34567+Math.sin(i/20)*20,74:-7.123456+Math.cos(i/30)*8,78:175.12345+(i%20)*.01,82:.123456,86:-.234567,90:9.81234,94:.0001234,98:.0002345,102:.0003456,106:.01234,110:.02345,114:.03456,134:10.123456,138:200.4532+i*.001,142:1.2345,146:2.3456,154:5.6789,162:4.56789,166:12.123456,170:23.45678,178:34.56789,182:12345.67,218:.12345,226:.23456};
    for(const [offset,value] of Object.entries(floats)) buffer.writeFloatLE(value,b+Number(offset));
    rows.push({time_s:(timestamp-10000)/1000,timestamp_ms:timestamp,gnss_lat:buffer.readInt32LE(b+16)/1e7,gnss_lon:buffer.readInt32LE(b+20)/1e7,altitude_m:buffer.readFloatLE(b+66),gnss_alt_m:buffer.readFloatLE(b+138),roll_deg:buffer.readFloatLE(b+70),pitch_deg:buffer.readFloatLE(b+74),yaw_deg:buffer.readFloatLE(b+78),airspeed_mps:buffer.readFloatLE(b+134),esc_current_a:buffer.readFloatLE(b+162),esc_voltage_v:buffer.readFloatLE(b+166),esc_rpm:buffer.readFloatLE(b+182),log_overrun_count:i>200?2:0,sd_write_error_count:0});
  }
  return {name,mimeType:'application/octet-stream',buffer,rows,count,duration:rows.at(-1).time_s,sha256:sha256(buffer),provenance:'Synthetic deterministic SKYLBIN1, not a captured log.'};
}
function csv({sparse=false, irregular=false, missingGps=false, count=401, name='synthetic.csv'}={}) {
  const headers=['time_s','gnss_lat','gnss_lon','altitude_m','gnss_alt_m','roll_deg','pitch_deg','yaw_deg','airspeed_mps'];
  const times=irregular?[0,.05,.1,10,10.05,20]:Array.from({length:count},(_,i)=>i*.05), rows=[];
  const lines=[headers.join(',')];
  times.forEach((t,i)=>{
    const absent=sparse&&i%3===1;
    const row={time_s:t,gnss_lat:missingGps||absent?'':-33.6440811+i*.0000001,gnss_lon:missingGps||absent?'':151.0470889+i*.0000001,altitude_m:absent?'':152.625+i*.1234567,gnss_alt_m:absent?'':200.456789+i*.1234567,roll_deg:absent?'':12.1234567890123+i*.000123456789,pitch_deg:absent?'':-7.9876543210987,yaw_deg:absent?'':123.987654321098,airspeed_mps:''};
    rows.push(row); lines.push(headers.map(h=>row[h]).join(','));
  });
  const buffer=Buffer.from(lines.join('\r\n'));
  return {name,mimeType:'text/csv',buffer,rows,count:rows.length,duration:times.at(-1),sha256:sha256(buffer),provenance:'Synthetic decimal-precision CSV; optional diagnostics omitted, optional cells intentionally blank.'};
}
function reference(root=ROOT) {
  const source='shared/projects/skylabs/f110211/index.html', html=fs.readFileSync(path.join(root,source),'utf8');
  const marker='const DATA = ', start=html.indexOf(marker)+marker.length;
  if(start<marker.length) throw Error('F110211 embedded DATA literal not found');
  const end=html.indexOf(';',start), data=JSON.parse(html.slice(start,end));
  const fields={time_s:'t',gnss_lat:'lat',gnss_lon:'lon',altitude_m:'baro_alt',gnss_alt_m:'gps_alt',roll_deg:'roll',pitch_deg:'pitch',yaw_deg:'yaw',gnss_siv:'sats',gnss_h_acc_m:'h_acc'};
  for(const key of Object.values(fields)) if(data[key]?.length!==data.t.length) throw Error('Reference array length mismatch: '+key);
  const rows=data.t.map((_,i)=>Object.fromEntries(Object.entries(fields).map(([column,key])=>[column,data[key][i]])));
  const buffer=Buffer.from([Object.keys(fields).join(','),...rows.map(row=>Object.values(row).map(v=>v??'').join(','))].join('\r\n'));
  return {name:'F110211-reconstructed-published-arrays.csv',mimeType:'text/csv',buffer,rows,count:rows.length,duration:data.t.at(-1),sha256:sha256(buffer),provenance:'Reconstructed CSV from already-published, rounded replay arrays. This is NOT the original F110211.BIN and cannot prove raw binary fidelity.',source,sourceSha256:sha256(Buffer.from(html)),originalSourceSamples:data.source_samples};
}
// Synthetic Mapbox Terrain-RGB PNG: every pixel encodes a 100 m plateau.
// It exercises the actual MapLibre raster-dem decoder, never real geography.
function flatTerrainPng(elevation=100,size=256) {
  const zlib=require('node:zlib');
  const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
  const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);};
  const value=Math.round((elevation+10000)*10),rgb=[(value>>>16)&255,(value>>>8)&255,value&255];
  const raw=Buffer.alloc(size*(1+size*3));for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++)raw[y*(1+size*3)+1+x*3+c]=rgb[c];
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function payload(fixture) {return {name:fixture.name,mimeType:fixture.mimeType,buffer:fixture.buffer};}
function manifest(fixture) {const {buffer,rows,...meta}=fixture; return {...meta,bytes:buffer.length};}
function selfTest() {
  const assert=require('node:assert/strict');
  for(const version of [1,2,3]) {const f=binary({version,count:3}); assert.equal(f.buffer.length,48+SIZES[version]*3); assert.equal(f.rows[2].time_s,.1); assert.equal(f.rows[0].roll_deg,Math.fround(12.34567));}
  assert.equal(csv({irregular:true}).count,6); assert.equal(csv({irregular:true}).duration,20);
  assert.equal(csv({sparse:true}).rows[1].roll_deg,'');
  const real=reference(); assert.equal(real.count,13772); assert.ok(real.duration>300);
  console.log('PASS synthetic binary v1–v3, sparse/irregular CSV, and labeled published-array reconstruction');
}
if(require.main===module) {
  if(process.argv.includes('--self-test')) selfTest();
  else {
    const out=path.resolve(process.env.FLIGHT_FIXTURES_OUT||'/tmp/flight-review-fixtures');fs.mkdirSync(out,{recursive:true});
    const fixtures=[...[1,2,3].map(version=>binary({version})),csv(),csv({sparse:true,name:'synthetic-sparse.csv'}),csv({irregular:true,name:'synthetic-irregular.csv'}),csv({missingGps:true,name:'synthetic-no-fix.csv'}),reference()];
    for(const f of fixtures)fs.writeFileSync(path.join(out,f.name),f.buffer);
    fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(fixtures.map(manifest),null,2));console.log(out);
  }
}
module.exports={ROOT,SIZES,binary,csv,reference,flatTerrainPng,payload,manifest,sha256};
