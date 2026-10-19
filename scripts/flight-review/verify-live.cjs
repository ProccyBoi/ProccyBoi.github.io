#!/usr/bin/env node
'use strict';
// Read-only post-deploy verification. Compare public bytes to the exact checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const origin = 'https://proccyboi.github.io';
const files = [
  'shared/flight-review/index.html',
  'assets/flight-review.js',
  'assets/flight-review.css',
  'assets/flight-review-parser.js',
  'assets/flight-review-worker.js',
  'projects/skylabs/flight-review/index.html',
  'v2/projects/skylabs/flight-review/index.html',
  'v3/projects/skylabs/flight-review/index.html'
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function main() {
  const expected = files.map(file => ({ file, sha256: hash(fs.readFileSync(path.join(root, file))) }));
  const pending = new Map(expected.map(item => [item.file, item]));
  const deadline = Date.now() + 5 * 60 * 1000;
  const verified = [];
  while (pending.size && Date.now() < deadline) {
    await Promise.all([...pending.values()].map(async item => {
      const route = item.file.endsWith('/index.html') ? item.file.slice(0, -10) : item.file;
      const url = `${origin}/${route}?verify=${process.env.GITHUB_SHA || 'checkout'}-${Date.now()}`;
      try {
        const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const actual = hash(Buffer.from(await response.arrayBuffer()));
        if (actual !== item.sha256) throw new Error(`Different bytes: ${actual}`);
        delete item.lastError;
        verified.push({ ...item, status: response.status, url: `${origin}/${route}` });
        pending.delete(item.file);
        console.log(`PASS live ${route} ${actual}`);
      } catch (error) { item.lastError = error.message; }
    }));
    if (pending.size) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  console.log(JSON.stringify({ commit: process.env.GITHUB_SHA || null, verified, pending: [...pending.values()] }, null, 2));
  assert.equal(pending.size, 0, 'Public Flight Review files must match the deployed checkout');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
