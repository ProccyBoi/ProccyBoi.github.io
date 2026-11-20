import { boardPoint, buildBoard, makeComponentFactory } from './viewer-geometry.js';

const DEFAULT_AZIMUTH = -2.1;
const DEFAULT_ELEVATION = 0.99;
const ELEVATION_LIMIT = Math.PI / 2 - 0.0001;
const normalizeSearch = text => text.toLowerCase().replaceAll('_', ' ').trim();

function viewerMarkup() {
  return `
    <div class="mct-viewer__main">
      <div class="mct-viewer__bar" role="group" aria-label="3D view">
        <button type="button" data-view="board" aria-pressed="true">Assembly</button>
        <button type="button" data-view="part" aria-pressed="false" disabled>Component</button>
        <span class="mct-viewer__bar-spacer"></span>
        <button type="button" data-view="front" aria-label="Show front of PCB" aria-pressed="false">Front</button>
        <button type="button" data-view="back" aria-label="Show back of PCB" aria-pressed="false">Back</button>
        <button type="button" data-view="reset" aria-label="Reset 3D view">Reset</button>
      </div>
      <div class="mct-viewer__stage">
        <canvas tabindex="0" aria-label="3D PCB assembly. Use arrow keys to orbit, plus and minus to zoom, and Home to reset."></canvas>
        <div class="mct-viewer__fallback" hidden>
          <img class="mct-viewer__poster" alt="Top side of the Isolated Glitch Tester PCB">
          <p role="status">3D rendering is unavailable in this browser.</p>
        </div>
        <div class="mct-viewer__meter" aria-hidden="true">
          <span data-view-label></span>
          <span data-size-label></span>
        </div>
        <div class="mct-viewer__zoom" role="group" aria-label="Zoom">
          <button type="button" data-view="out" aria-label="Zoom out">−</button>
          <button type="button" data-view="in" aria-label="Zoom in">+</button>
        </div>
      </div>
      <p class="mct-viewer__hint">Drag to orbit. Pinch or use the zoom controls. Select a part on the board or from the component list.</p>
    </div>
    <aside class="mct-viewer__parts" aria-label="PCB components">
      <div class="mct-viewer__search">
        <label>Find a component
          <input type="search" placeholder="Reference or value" autocomplete="off">
        </label>
        <p data-component-count role="status"></p>
      </div>
      <ul class="mct-viewer__list" aria-label="Footprints"></ul>
      <div class="mct-viewer__detail" aria-live="polite">
        <p data-detail-face></p>
        <p data-detail-name></p>
        <p data-detail-package></p>
        <p data-detail-source></p>
      </div>
    </aside>`;
}

function setupStudio(scene, THREE) {
  const ambient = new THREE.HemisphereLight(0xfffbf4, 0xdbdfd8, 1.02);
  ambient.position.set(0, 0, 1);
  scene.add(ambient);
  for (const [color, intensity, position] of [
    [0xfff4e5, 1.7, [-40, -40, 80]],
    [0xe6eeff, 0.52, [75, 65, 45]],
    [0xfff7eb, 1.15, [45, 55, -90]]
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  }
}

function fitFrustum(THREE, bounds, state, aspect) {
  const target = bounds.getCenter(new THREE.Vector3());
  const distance = Math.max(3, bounds.getSize(new THREE.Vector3()).length() * 2);
  const direction = new THREE.Vector3(Math.cos(state.azimuth) * Math.cos(state.elevation),
    Math.sin(state.azimuth) * Math.cos(state.elevation), Math.sin(state.elevation));
  const right = new THREE.Vector3(-Math.sin(state.azimuth), Math.cos(state.azimuth), 0);
  const up = new THREE.Vector3().crossVectors(direction, right);
  let halfHeight = 0;
  for (let corner = 0; corner < 8; corner += 1) {
    const point = new THREE.Vector3(
      corner & 1 ? bounds.max.x : bounds.min.x,
      corner & 2 ? bounds.max.y : bounds.min.y,
      corner & 4 ? bounds.max.z : bounds.min.z
    ).sub(target);
    halfHeight = Math.max(halfHeight, Math.abs(point.dot(up)), Math.abs(point.dot(right)) / aspect);
  }
  return { target, distance, halfHeight: Math.max(0.5, halfHeight) * 1.13 };
}

function newOrbit() {
  return { azimuth: DEFAULT_AZIMUTH, elevation: DEFAULT_ELEVATION, zoom: 1, preset: '' };
}

function sourceLabel(component, modelStatus) {
  if (component.footprint.startsWith('MountingHole:')) return 'Plated hole geometry from KiCad';
  if (component.attributes.includes('board_only')) return 'PCB artwork from KiCad';
  if (modelStatus === 'loading') return 'Loading 3D package model…';
  if (modelStatus !== 'ready') return 'Approximate model based on the PCB footprint';
  return {
    'kicad-library': 'KiCad library 3D model',
    'library-package-equivalent': 'KiCad 3D model of an equivalent package',
    'manufacturer-model': 'Manufacturer 3D model'
  }[component.model.source] || 'CAD package model';
}

export function mountViewer(container, board, options = {}) {
  const { artwork = board.artwork, poster } = options;
  const assetBase = new URL(options.assetBase || '.', document.baseURI);
  const resolveAsset = path => new URL(path, assetBase).href;
  const THREE = window.THREE;
  container.classList.add('mct-viewer');
  container.innerHTML = viewerMarkup();

  const stage = container.querySelector('.mct-viewer__stage');
  const canvas = stage.querySelector('canvas');
  const fallback = stage.querySelector('.mct-viewer__fallback');
  const posterElement = fallback.querySelector('img');
  if (poster) posterElement.src = resolveAsset(poster);
  else posterElement.hidden = true;

  const hint = container.querySelector('.mct-viewer__hint');
  const buttons = Object.fromEntries([...container.querySelectorAll('[data-view]')].map(button => [button.dataset.view, button]));
  const viewLabel = container.querySelector('[data-view-label]');
  const sizeLabel = container.querySelector('[data-size-label]');
  const search = container.querySelector('input[type="search"]');
  const count = container.querySelector('[data-component-count]');
  const list = container.querySelector('.mct-viewer__list');
  const detailFace = container.querySelector('[data-detail-face]');
  const detailName = container.querySelector('[data-detail-name]');
  const detailPackage = container.querySelector('[data-detail-package]');
  const detailSource = container.querySelector('[data-detail-source]');

  const collator = new Intl.Collator('en', { numeric: true });
  const components = [...board.components].sort((a, b) => {
    return Number(a.side === 'bottom') - Number(b.side === 'bottom') || collator.compare(a.ref, b.ref);
  });
  const componentByRef = new Map(components.map(component => [component.ref, component]));
  const models = new Map();
  const placements = new Map();
  const partButtons = new Map();
  const orbits = { board: newOrbit(), part: newOrbit() };
  let chosen;
  let mode = 'board';
  let renderer;
  let camera;
  let scene;
  let assembly;
  let boardBody;
  let isolated;
  let highlight;
  let assemblyBounds;
  let modelBounds;
  let frustum;
  let fitNeeded = true;
  let available = false;
  let frame = 0;
  let renderedWidth = 0;
  let renderedHeight = 0;

  for (const component of components) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const ref = document.createElement('span');
    const value = document.createElement('span');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    ref.textContent = component.ref;
    value.textContent = component.value;
    button.append(ref, value);
    item.append(button);
    button.addEventListener('click', () => {
      select(component, true);
      if (available && stage.getBoundingClientRect().bottom < Math.min(110, window.innerHeight * 0.18)) {
        stage.scrollIntoView({ block: 'center' });
      }
    });
    partButtons.set(component.ref, { button, item });
    list.append(item);
  }

  function filterParts() {
    const terms = normalizeSearch(search.value).split(/\s+/);
    let matches = 0;
    for (const component of components) {
      const label = normalizeSearch([component.ref, component.value, component.footprint, component.lcsc || ''].join(' '));
      const show = terms.every(term => label.includes(term));
      partButtons.get(component.ref).item.hidden = !show;
      if (show) matches += 1;
    }
    count.textContent = matches === components.length ? `${matches} footprints` : matches ? `${matches} of ${components.length} footprints` : 'No matching components';
  }

  function updateDetails() {
    if (!chosen) {
      detailFace.textContent = '';
      detailName.textContent = 'Select a component to inspect it.';
      detailPackage.textContent = '';
      detailSource.textContent = '';
      return;
    }
    detailFace.textContent = [chosen.side === 'top' ? 'Front' : 'Back', chosen.dnp ? 'KiCad DNP' : ''].filter(Boolean).join(' · ');
    detailName.textContent = `${chosen.ref} · ${chosen.value}`;
    detailPackage.textContent = chosen.footprint.split(':').at(-1);
    if (available) detailSource.textContent = sourceLabel(chosen, models.get(chosen.model?.asset));
  }

  function updateControls() {
    const preset = orbits[mode].preset;
    for (const name of ['board', 'part', 'front', 'back']) {
      buttons[name].setAttribute('aria-pressed', String(name === mode || (mode === 'board' && name === preset)));
    }
    for (const name of ['front', 'back']) buttons[name].disabled = !available || mode === 'part';
    for (const name of ['reset', 'in', 'out', 'board']) buttons[name].disabled = !available;
    buttons.part.disabled = !available || !chosen;
    viewLabel.textContent = mode === 'part' ? chosen.ref :
      chosen ? `Selected ${chosen.ref}` :
      preset === 'front' ? 'Front' :
      preset === 'back' ? 'Back' : 'PCB assembly';
    sizeLabel.textContent = mode === 'part' ? 'Isolated component' : chosen?.value || `${board.width} × ${board.height} mm`;
    canvas.setAttribute('aria-label', `3D ${mode === 'part' ? `component ${chosen.ref}` : 'PCB assembly'}. Use arrow keys to orbit, plus and minus to zoom, and Home to reset.`);
  }

  function showModel(component) {
    const { body, fallbackModel } = placements.get(component.ref);
    return body.children[0] || fallbackModel;
  }

  function refreshPart() {
    if (!chosen || !available) return;
    isolated.clear();
    isolated.add(showModel(chosen).clone(true));
    modelBounds = new THREE.Box3().setFromObject(isolated);
    fitNeeded = true;
  }

  function refreshHighlight() {
    if (!available) return;
    highlight.visible = Boolean(chosen);
    if (chosen) highlight.setFromObject(placements.get(chosen.ref).body);
  }

  function setMode(nextMode) {
    if (!available || (nextMode === 'part' && !chosen)) return;
    mode = nextMode;
    assembly.visible = mode === 'board';
    isolated.visible = mode === 'part';
    if (mode === 'part') refreshPart();
    refreshHighlight();
    updateControls();
    fitNeeded = true;
    requestDraw();
  }

  function setSide(face) {
    const front = face === 'front';
    orbits.board = { azimuth: front ? -Math.PI / 2 : Math.PI / 2,
      elevation: front ? ELEVATION_LIMIT : -ELEVATION_LIMIT, zoom: 1, preset: face };
    setMode('board');
  }

  function select(component, isolatePart = false) {
    if (!component) return false;
    if (chosen) partButtons.get(chosen.ref).button.setAttribute('aria-pressed', 'false');
    if (chosen !== component) orbits.part = newOrbit();
    chosen = component;
    const { button } = partButtons.get(component.ref);
    button.setAttribute('aria-pressed', 'true');
    if (!isolatePart) {
      const offset = button.offsetTop;
      if (offset < list.scrollTop || offset + button.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, offset - 12);
      }
    }
    updateDetails();
    updateControls();
    if (isolatePart) {
      setMode('part');
    } else {
      refreshHighlight();
      requestDraw();
    }
    return true;
  }

  function resetView() {
    orbits[mode] = newOrbit();
    updateControls();
    fitNeeded = true;
    requestDraw();
  }

  function applyZoom(factor) {
    const state = orbits[mode];
    state.zoom = Math.min(6, Math.max(0.67, state.zoom * factor));
    requestDraw();
  }

  function orbit(deltaX, deltaY) {
    const state = orbits[mode];
    state.azimuth -= deltaX * 0.0085;
    state.elevation = Math.max(-ELEVATION_LIMIT, Math.min(ELEVATION_LIMIT, state.elevation + deltaY * 0.0085));
    if (state.preset) {
      state.preset = '';
      updateControls();
    }
    requestDraw();
  }

  function requestDraw() {
    if (available && !frame) frame = requestAnimationFrame(draw);
  }

  function draw() {
    frame = 0;
    if (!available) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const state = orbits[mode];
    const aspect = width / height;
    if (fitNeeded) {
      const bounds = mode === 'board' ? assemblyBounds : modelBounds;
      frustum = fitFrustum(THREE, bounds, state, aspect);
      fitNeeded = false;
    }
    const { target, halfHeight, distance } = frustum;
    const span = halfHeight / state.zoom;
    camera.left = -span * aspect;
    camera.right = span * aspect;
    camera.top = span;
    camera.bottom = -span;
    camera.far = distance * 5;
    camera.updateProjectionMatrix();
    camera.position.set(
      Math.cos(state.azimuth) * Math.cos(state.elevation),
      Math.sin(state.azimuth) * Math.cos(state.elevation),
      Math.sin(state.elevation)
    ).multiplyScalar(distance).add(target);
    camera.lookAt(target);
    if (width !== renderedWidth || height !== renderedHeight) {
      renderer.setSize(width, height, false);
      renderedWidth = width;
      renderedHeight = height;
    }
    renderer.render(scene, camera);
  }

  function showUnavailable() {
    available = false;
    canvas.hidden = true;
    stage.querySelector('.mct-viewer__zoom').hidden = true;
    fallback.hidden = false;
    hint.hidden = true;
    detailSource.textContent = '';
    updateControls();
  }

  search.addEventListener('input', filterParts);
  filterParts();
  updateDetails();
  if (!THREE) {
    showUnavailable();
    return { selectRef: ref => select(componentByRef.get(ref), true) };
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    showUnavailable();
    return { selectRef: ref => select(componentByRef.get(ref), true) };
  }
  available = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  camera.up.set(0, 0, 1);
  scene = new THREE.Scene();
  setupStudio(scene, THREE);

  ({ assembly, boardBody } = buildBoard(THREE, board, artwork, resolveAsset, requestDraw, Math.min(8, renderer.capabilities.getMaxAnisotropy())));
  scene.add(assembly);
  const footprints = new THREE.Group();
  assembly.add(footprints);
  isolated = new THREE.Group();
  isolated.visible = false;
  scene.add(isolated);
  highlight = new THREE.BoxHelper(new THREE.Group(), 0xc54f3b);
  highlight.visible = false;
  assembly.add(highlight);
  const makeFallback = makeComponentFactory(THREE);
  const referencesByAsset = new Map();

  for (const component of components) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    const [x, y] = boardPoint(board, component.x, component.y);
    const bottom = component.side === 'bottom';
    group.position.set(x, y, board.thickness / 2 * (bottom ? -1 : 1));
    group.rotation.z = THREE.MathUtils.degToRad(component.rotation);
    if (bottom) body.rotation.x = Math.PI;
    body.userData.componentRef = component.ref;
    const fallbackModel = makeFallback(component);
    body.add(fallbackModel);
    group.add(body);
    footprints.add(group);
    placements.set(component.ref, { body, fallbackModel });
    if (!component.model?.asset) continue;
    const asset = component.model.asset;
    if (!referencesByAsset.has(asset)) referencesByAsset.set(asset, []);
    referencesByAsset.get(asset).push(component.ref);
  }
  assemblyBounds = new THREE.Box3().setFromObject(assembly);
  updateControls();
  updateDetails();

  if (THREE.GLTFLoader) {
    const loader = new THREE.GLTFLoader();
    for (const [asset, refs] of referencesByAsset) {
      models.set(asset, 'loading');
      loader.load(resolveAsset(asset), ({ scene: imported }) => {
        models.set(asset, 'ready');
        const packageModel = new THREE.Group();
        imported.rotation.x += Math.PI / 2;
        imported.scale.multiplyScalar(1000);
        packageModel.add(imported);
        for (const ref of refs) {
          const { body } = placements.get(ref);
          body.clear();
          body.add(packageModel.clone(true));
        }
        if (refs.includes(chosen?.ref)) {
          refreshHighlight();
          if (mode === 'part') refreshPart();
          updateDetails();
        }
        requestDraw();
      }, undefined, () => {
        models.set(asset, 'unavailable');
        if (refs.includes(chosen?.ref)) updateDetails();
      });
    }
  }

  buttons.board.addEventListener('click', () => {
    const side = chosen?.side === 'bottom' ? 'back' : 'front';
    if (chosen && mode === 'part' && Math.sign(orbits.board.elevation) !== (side === 'front' ? 1 : -1)) setSide(side);
    else setMode('board');
  });
  buttons.part.addEventListener('click', () => setMode('part'));
  buttons.front.addEventListener('click', () => setSide('front'));
  buttons.back.addEventListener('click', () => setSide('back'));
  buttons.reset.addEventListener('click', resetView);
  buttons.in.addEventListener('click', () => applyZoom(1.24));
  buttons.out.addEventListener('click', () => applyZoom(1 / 1.24));

  const raycaster = new THREE.Raycaster();
  function pick(x, y) {
    if (mode !== 'board') return;
    const bounds = canvas.getBoundingClientRect();
    const point = new THREE.Vector2((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2);
    raycaster.setFromCamera(point, camera);
    const [hit] = raycaster.intersectObjects([boardBody, footprints], true);
    let object = hit?.object;
    while (object && !object.userData.componentRef) object = object.parent;
    if (object) select(componentByRef.get(object.userData.componentRef));
  }

  const pointers = new Map();
  let didDrag = false;
  let interactedWithMultiplePointers = false;
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !available) return;
    if (pointers.size === 0) {
      didDrag = false;
      interactedWithMultiplePointers = false;
    } else {
      interactedWithMultiplePointers = true;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const previousDistance = pointers.size > 1 ? pinchDistance() : 0;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (previousDistance > 0) {
      applyZoom(pinchDistance() / previousDistance);
      didDrag = true;
    } else if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 3 || didDrag) {
      orbit(dx, dy);
      didDrag = true;
    }
    if (didDrag) canvas.classList.add('mct-viewer__dragging');
  });
  function endPointer(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size) return;
    canvas.classList.remove('mct-viewer__dragging');
    if (event.type === 'pointerup' && !didDrag && !interactedWithMultiplePointers) pick(event.clientX, event.clientY);
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('wheel', event => {
    if (!available || (document.activeElement !== canvas && !event.ctrlKey)) return;
    event.preventDefault();
    applyZoom(Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * 0.0025));
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (!available) return;
    const directional = { ArrowLeft: [-14, 0], ArrowRight: [14, 0], ArrowUp: [0, -14], ArrowDown: [0, 14] };
    if (directional[event.key]) orbit(...directional[event.key]);
    else if (event.key === '+' || event.key === '=') applyZoom(1.24);
    else if (event.key === '-') applyZoom(1 / 1.24);
    else if (event.key === 'Home') resetView();
    else return;
    event.preventDefault();
  });

  const observer = new ResizeObserver(() => {
    fitNeeded = true;
    requestDraw();
  });
  observer.observe(stage);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    showUnavailable();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    available = true;
    canvas.hidden = false;
    stage.querySelector('.mct-viewer__zoom').hidden = false;
    fallback.hidden = true;
    hint.hidden = false;
    updateControls();
    updateDetails();
    fitNeeded = true;
    requestDraw();
  });
  requestDraw();
  return { selectRef: ref => select(componentByRef.get(ref), true) };
}
