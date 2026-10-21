'use strict';
// CI-only software backend. Headed Xvfb lets Linux WebGPU canvas presentation
// reach the compositor; the Vulkan stack must match Dawn and ANGLE.
// https://github.com/vercel-labs/agent-browser/blob/main/skill-data/core/references/webgpu.md
const softwareArgs = ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'];
function chromiumConfig({ exposeGC = false } = {}) {
  const args = process.env.V3_BROWSER_ARGS ? JSON.parse(process.env.V3_BROWSER_ARGS) : [...softwareArgs];
  if (exposeGC) args.push('--js-flags=--expose-gc');
  return { headless: process.env.V3_BROWSER_HEADLESS === '1', channel: 'chromium', executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args };
}
module.exports = { softwareArgs, chromiumConfig };
