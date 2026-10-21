import { createOrbitalEngine } from './orbital-engine.js';

const instrument = document.querySelector('[data-instrument]');
const canvas = document.querySelector('[data-orbital-canvas]');
const choices = [...document.querySelectorAll('[data-scene]')];
const motionButton = document.querySelector('[data-motion-toggle]');
const renderLabel = document.querySelector('[data-render-label]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const scenes = [
  { code: '01 / FLIGHT SYSTEMS', tag: 'TRAJECTORY STUDY', caption: 'A small board.\nA much bigger journey.', brief: 'Avionics, telemetry and the software that brings a flight back into view.', link: '/v3/projects/skylabs/', title: 'Skylabs', mode: 0 },
  { code: '02 / EMBEDDED SYSTEMS', tag: 'ASSEMBLY STUDY', caption: 'Small format.\nOpen potential.', brief: 'A laptop expansion bay becomes a development board, extra ports or a logic analyser.', link: '/v3/projects/framework-expansion-card/', title: 'Framework', mode: 2 },
  { code: '03 / CONNECTED SYSTEMS', tag: 'NETWORK STUDY', caption: 'A city's rhythm.\nMade tangible.', brief: '116 pixels following Sydney’s light-rail network, from live data to a physical display.', link: '/v3/projects/tramtrace/', title: 'TramTrace', mode: 1 },
  { code: '04 / AUDIO SYSTEMS', tag: 'RESONANCE STUDY', caption: 'Board, code, enclosure.\nMade for listening.', brief: 'A pocket audio player with SD music, FM radio, Bluetooth receiving and a real firmware simulator.', link: '/v3/projects/kiku/', title: 'Kiku', mode: 3 },
];
let controller, paused = reducedMotion.matches, current = 0, alive = true;
function updateMotion() {
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.innerHTML = paused ? 'Resume motion <span aria-hidden="true">▷</span>' : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
  controller?.setPaused(paused);
  if (renderLabel.dataset.backend) motionButton.hidden = renderLabel.dataset.backend !== 'webgpu' || reducedMotion.matches;
}
function selectScene(index) {
  current = index;
  const scene = scenes[index];
  choices.forEach((button, i) => { button.classList.toggle('is-active', i === index); button.setAttribute('aria-pressed', String(i === index)); });
  document.querySelector('[data-scene-code]').textContent = scene.code;
  document.querySelector('[data-scene-tag]').textContent = scene.tag;
  document.querySelector('[data-scene-caption]').replaceChildren(...scene.caption.split('\n').flatMap((text, i) => i ? [document.createElement('br'), text] : [text]));
  document.querySelector('[data-brief-text]').textContent = scene.brief;
  const link = document.querySelector('[data-brief-link]');
  link.href = scene.link;
  link.replaceChildren(`Enter ${scene.title} `, Object.assign(document.createElement('span'), {textContent: '↗'}));
  link.lastElementChild.setAttribute('aria-hidden', 'true');
  document.querySelector('[data-scene-announcement]').textContent = `${scene.title} scene selected. ${scene.brief}`;
  controller?.setMode(scene.mode);
  instrument.dataset.scene = String(index);
}
choices.forEach((button, index) => { button.disabled = false; button.addEventListener('click', () => selectScene(index)); });
motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); });
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; updateMotion(); });
function setStatus(status) {
  if (!alive) return;
  const backend = status.backend;
  renderLabel.dataset.backend = backend;
  renderLabel.textContent = backend === 'webgpu' ? 'WebGPU / procedural 3D' : backend === 'canvas2d' ? 'Canvas / schematic view' : 'Static schematic';
  renderLabel.title = status.reason || '';
  if (backend === 'webgpu' || backend === 'canvas2d') instrument.classList.add('is-ready');
  motionButton.hidden = backend !== 'webgpu' || reducedMotion.matches;
}
try {
  controller = createOrbitalEngine({ canvas, onStatus: setStatus });
  updateMotion();
  if (controller.ready) controller.ready.catch(() => setStatus({backend:'static'}));
} catch { setStatus({backend: 'static'}); }
let visible = true;
const observer = new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  controller?.setVisible(visible && !document.hidden);
}, {threshold: 0});
observer.observe(instrument);
document.addEventListener('visibilitychange', () => controller?.setVisible(visible && !document.hidden));
instrument.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || paused) return;
  const rect = instrument.getBoundingClientRect();
  controller?.setPointer((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
}, {passive:true});
instrument.addEventListener('pointerleave', () => controller?.setPointer(0, 0));
addEventListener('pagehide', event => { if (!event.persisted) { alive = false; observer.disconnect(); controller?.destroy(); } else controller?.setVisible(false); });
addEventListener('pageshow', () => { if (alive) controller?.setVisible(visible && !document.hidden); });
// A read-only diagnostic snapshot. Status is based on completed native GPU work,
// not on API presence. Queries never schedule or change rendering.
window.OrbitalWorkshop = Object.freeze({getState: () => ({ scene: current, paused, visible, ...(controller?.getState() || {backend:'static'}) })});
