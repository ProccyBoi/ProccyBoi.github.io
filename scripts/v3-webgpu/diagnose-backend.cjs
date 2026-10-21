#!/usr/bin/env node
'use strict';
// Isolate browser/driver canvas presentation from site code and test observers.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const out = process.env.V3_QA_OUT || '/tmp/v3-webgpu-evidence';
fs.mkdirSync(out, { recursive: true });
const baseArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu'];
const cases = [
  { name: 'headless-shell', args: baseArgs },
  { name: 'full-chromium', channel: 'chromium', args: baseArgs },
  { name: 'full-chromium-explicit-dawn', channel: 'chromium', args: [...baseArgs, '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'] },
];
(async () => {
  const results = [];
  for (const config of cases) {
    const result = { config, errors: [], console: [] };
    let browser;
    try {
      browser = await chromium.launch({ headless: true, ...config, name: undefined });
      result.version = browser.version();
      const context = await browser.newContext({ viewport: { width: 160, height: 160 } });
      const page = await context.newPage();
      page.on('pageerror', error => result.errors.push(error.message));
      page.on('console', msg => result.console.push({ type: msg.type(), text: msg.text() }));
      await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><canvas width="128" height="128"></canvas>' }));
      await page.goto('http://127.0.0.1:8080/__webgpu_diagnostic__');
      result.gpu = await page.evaluate(async () => {
        const evidence = window.evidence = { loss: null, phase: 'adapter' };
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) throw new Error('No adapter');
          evidence.adapter = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, isFallbackAdapter: adapter.info.isFallbackAdapter };
          const device = window.diagnosticDevice = await adapter.requestDevice();
          device.lost.then(info => { evidence.loss = { reason: info.reason, message: info.message }; });
          const canvas = document.querySelector('canvas'), context = canvas.getContext('webgpu');
          context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
          evidence.phase = 'clear';
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: .1, g: .3, b: .8, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
          pass.end(); device.queue.submit([encoder.finish()]);
          await Promise.race([device.queue.onSubmittedWorkDone(), new Promise((_, reject) => setTimeout(() => reject(new Error('Clear queue timed out')), 15000))]);
          evidence.phase = 'complete';
          await new Promise(resolve => setTimeout(resolve, 250));
        } catch (error) { evidence.error = String(error); }
        return evidence;
      });
      await page.screenshot({ path: path.join(out, `diagnostic-${config.name}.png`) });
      result.passed = result.gpu.phase === 'complete' && !result.gpu.loss && !result.gpu.error;
      await context.close();
    } catch (error) { result.error = String(error.stack || error); result.passed = false; }
    finally { await browser?.close(); results.push(result); }
  }
  fs.writeFileSync(path.join(out, 'backend-diagnostics.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
