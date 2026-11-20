import { boardPoint, buildBoard, makeComponentFactory, finishPackage } from './viewer-geometry.js';

const ELEVATION_LIMIT = Math.PI / 2 - 0.0001;
const normalizeSearch = text => text.toLowerCase().replaceAll('_', ' ').trim();

let viewerSequence = 0;

function viewerMarkup() {
  const listId = `mct-footprints-${++viewerSequence}`;
  return `
    <div class="mct-viewer__stage">
      <canvas tabindex="0" aria-label="3D PCB assembly. Use arrow keys to orbit, plus and minus to zoom, and Home to reset."></canvas>
      <div class="mct-viewer__fallback" hidden>
        <img class="mct-viewer__poster" alt="Isolated Glitch Tester PCB assembly">
        <p role="status" hidden>3D rendering is unavailable in this browser.</p>
      </div>
      <div class="mct-viewer__meter" aria-hidden="true">
        <span data-view-label></span>
        <span data-size-label></span>
      </div>
    </div>
      <div class="mct-viewer__detail v2-part-readout" aria-live="polite" hidden>
        <p data-detail-name></p>
        <p data-detail-face></p>
        <p data-detail-source></p>
      </div>
    <div class="mct-viewer__bar">
      <div class="mct-viewer__view-tabs" role="group" aria-label="3D view">
        <button type="button" data-view="board" aria-pressed="true">Assembly</button>
        <button type="button" data-view="part" aria-pressed="false" disabled>Component</button>
        <button type="button" data-view="front" aria-label="Show front of PCB" aria-pressed="false">Front</button>
        <button type="button" data-view="back" aria-label="Show back of PCB" aria-pressed="false">Back</button>
      </div>
      <div class="mct-viewer__zoom" role="group" aria-label="Zoom and reset">
        <button type="button" data-view="out" aria-label="Zoom out">−</button>
        <button type="button" data-view="in" aria-label="Zoom in">+</button>
        <button type="button" data-view="reset" aria-label="Reset 3D view">Reset</button>
      </div>
    </div>
    <div class="mct-viewer__parts" role="region" aria-label="PCB components">
      <div class="mct-viewer__search">
        <label>Find a component
          <input type="search" placeholder="Reference or value" autocomplete="off" aria-controls="${listId}">
        </label>
        <button type="button" class="mct-viewer__browse" aria-expanded="false" aria-controls="${listId}">Browse components</button>
        <p data-component-count role="status"></p>
      </div>
      <ul class="mct-viewer__list" id="${listId}" aria-label="Footprints" hidden></ul>
    </div>`;
}

function setupStudio(THREE, scene, renderer) {
  const ambient = new THREE.HemisphereLight(0xfff9ec, 0xadad9f, 0.52);
  ambient.position.set(0, 0, 1);
  scene.add(ambient);

  const keyDirection = new THREE.Vector3(-0.52, -0.38, 0.76).normalize();
  const key = new THREE.DirectionalLight(0xfff1dc, 1.1);
  key.position.copy(keyDirection);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.00015;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xe8eced, 0.43);
  fill.position.set(-0.4, 0.85, -0.45);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xf6eee4, 0.55);
  rim.position.set(0.8, 0.55, 0.2);
  scene.add(rim);
  const underside = new THREE.DirectionalLight(0xe6e4de, 0.58);
  underside.position.set(0.15, -0.4, -0.85);
  scene.add(underside);

  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0.13, 0.13, 0.12);
  const panels = [
    [12, 9, [-4, -5, 7], [2.65, 2.48, 2.24]],
    [10, 5, [5, 7, 3], [1.28, 1.39, 1.46]],
    [12, 4, [-4, 2, -6], [1.5, 1.45, 1.31]]
  ].map(([width, height, position, color]) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    panel.position.set(...position);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
    return panel;
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, 0.06).texture;
  pmrem.dispose();
  for (const panel of panels) {
    panel.geometry.dispose();
    panel.material.dispose();
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 235), new THREE.ShadowMaterial({
    color: 0x020201, opacity: 0.25, depthWrite: false
  }));
  floor.position.z = -4.5;
  floor.receiveShadow = true;
  scene.add(floor);
  return { key, keyDirection, floor };
}

function cameraBasis(THREE, { azimuth, elevation, roll }) {
  const direction = new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation));
  const right = new THREE.Vector3(-Math.sin(azimuth), Math.cos(azimuth), 0);
  const up = new THREE.Vector3().crossVectors(direction, right);
  right.applyAxisAngle(direction, roll);
  up.applyAxisAngle(direction, roll);
  return { direction, right, up };
}

function fitFrustum(THREE, object, state, aspect, mode) {
  const { direction, right, up } = cameraBasis(THREE, state);
  const point = new THREE.Vector3();
  const minimum = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maximum = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const projection = new THREE.Vector3();
  object.updateMatrixWorld(true);
  object.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    for (let corner = 0; corner < 8; corner += 1) {
      point.set(
        corner & 1 ? bounds.max.x : bounds.min.x,
        corner & 2 ? bounds.max.y : bounds.min.y,
        corner & 4 ? bounds.max.z : bounds.min.z
      ).applyMatrix4(mesh.matrixWorld);
      projection.set(point.dot(right), point.dot(up), point.dot(direction));
      minimum.min(projection);
      maximum.max(projection);
    }
  });
  const centre = minimum.clone().add(maximum).multiplyScalar(0.5);
  const size = maximum.clone().sub(minimum);
  const target = right.multiplyScalar(centre.x).add(up.multiplyScalar(centre.y)).add(direction.multiplyScalar(centre.z));
  const halfHeight = Math.max(0.25, size.x / aspect / 2, size.y / 2) * (mode === 'board' ? 1.12 : 1.38);
  return { target, distance: Math.max(3, size.length() * 1.8), halfHeight, extent: size.length() };
}

function newOrbit(mode) {
  if (mode === 'part') return { azimuth: -2.3, elevation: 0.62, roll: 0, zoom: 1, preset: '', responsive: false };
  return { azimuth: -0.66, elevation: 1.04, roll: 0.28, zoom: 1, preset: '', responsive: true };
}

function setResponsiveOrbit(state, aspect) {
  if (!state.responsive) return;
  const mobile = aspect < 1.12;
  state.azimuth = mobile ? -1.88 : -0.66;
  state.elevation = mobile ? 1.13 : 1.04;
  state.roll = mobile ? 0 : 0.28;
}

function sourceLabel(component, modelStatus) {
  if (component.footprint.startsWith('MountingHole:')) return 'Plated hole geometry from KiCad';
  if (component.attributes.includes('board_only')) return 'PCB artwork from KiCad';
  if (modelStatus === 'loading') return 'Loading 3D package model…';
  if (modelStatus !== 'ready') return 'Approximate model based on the PCB footprint';
  return {
    'kicad-library': 'KiCad library 3D model',
    'library-package-equivalent': 'KiCad 3D model of an equivalent package',
    'manufacturer-model': 'Manufacturer 3D model',
    'datasheet-reconstruction': '3D model reconstructed from the datasheet'
  }[component.model.source] || 'CAD package model';
}

export function mountViewer(container, board, options = {}) {
  const { artwork = board.artwork, poster, capture = false } = options;
  const assetBase = new URL(options.assetBase || '.', document.baseURI);
  const resolveAsset = path => new URL(path, assetBase).href;
  const THREE = window.THREE;
  container.classList.add('mct-viewer');
  container.innerHTML = viewerMarkup();

  const stage = container.querySelector('.mct-viewer__stage');
  const canvas = stage.querySelector('canvas');
  const fallback = stage.querySelector('.mct-viewer__fallback');
  const posterElement = fallback.querySelector('img');
  const fallbackStatus = fallback.querySelector('p');
  if (poster) {
    posterElement.src = resolveAsset(poster);
    fallback.hidden = false;
    container.dataset.viewerState = 'loading';
  } else {
    posterElement.hidden = true;
  }

  const browse = container.querySelector('.mct-viewer__browse');
  const detail = container.querySelector('.mct-viewer__detail');
  const buttons = Object.fromEntries([...container.querySelectorAll('[data-view]')].map(button => [button.dataset.view, button]));
  const viewLabel = container.querySelector('[data-view-label]');
  const sizeLabel = container.querySelector('[data-size-label]');
  const search = container.querySelector('input[type="search"]');
  const count = container.querySelector('[data-component-count]');
  const list = container.querySelector('.mct-viewer__list');
  const detailFace = container.querySelector('[data-detail-face]');
  const detailName = container.querySelector('[data-detail-name]');
  const detailSource = container.querySelector('[data-detail-source]');

  const collator = new Intl.Collator('en', { numeric: true });
  const components = [...board.components].sort((a, b) => {
    return Number(a.side === 'bottom') - Number(b.side === 'bottom') || collator.compare(a.ref, b.ref);
  });
  const componentByRef = new Map(components.map(component => [component.ref, component]));
  const models = new Map();
  const placements = new Map();
  const partButtons = new Map();
  const orbits = { board: newOrbit('board'), part: newOrbit('part') };
  let chosen;
  let mode = 'board';
  let renderer;
  let camera;
  let scene;
  let assembly;
  let boardBody;
  let isolated;
  let highlight;
  let studio;
  let releasePoster = !poster;
  let frustum;
  let fitNeeded = true;
  let available = false;
  let frame = 0;
  let visible = true;
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

  function setBrowserOpen(open) {
    list.hidden = !open;
    browse.setAttribute('aria-expanded', String(open));
  }

  function updateDetails() {
    detail.hidden = !chosen;
    if (!chosen) return;
    detailFace.textContent = [chosen.side === 'top' ? 'Front' : 'Back', chosen.dnp ? 'KiCad DNP' : ''].filter(Boolean).join(' · ');
    detailName.textContent = `${chosen.ref} · ${chosen.value}`;
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
    const model = showModel(chosen).clone(true);
    model.traverse(mesh => { mesh.visible = true; });
    isolated.add(model);
    fitNeeded = true;
    renderer.shadowMap.needsUpdate = true;
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
    renderer.shadowMap.needsUpdate = true;
    requestDraw();
  }

  function setSide(face) {
    const front = face === 'front';
    orbits.board = { azimuth: front ? -Math.PI / 2 : Math.PI / 2,
      elevation: front ? ELEVATION_LIMIT : -ELEVATION_LIMIT, roll: 0, zoom: 1, preset: face, responsive: false };
    setMode('board');
  }

  function select(component, isolatePart = false) {
    if (!component) return false;
    if (chosen) partButtons.get(chosen.ref).button.setAttribute('aria-pressed', 'false');
    if (chosen !== component) orbits.part = newOrbit('part');
    chosen = component;
    const { button } = partButtons.get(component.ref);
    button.setAttribute('aria-pressed', 'true');
    if (!isolatePart && !list.hidden) {
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
    orbits[mode] = newOrbit(mode);
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
    state.responsive = false;
    state.azimuth -= deltaX * 0.0085;
    state.elevation = Math.max(-ELEVATION_LIMIT, Math.min(ELEVATION_LIMIT, state.elevation + deltaY * 0.0085));
    if (state.preset) {
      state.preset = '';
      updateControls();
    }
    requestDraw();
  }

  function requestDraw() {
    if (available && releasePoster && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw);
  }

  function draw() {
    frame = 0;
    if (!available || !visible || document.hidden) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const state = orbits[mode];
    const aspect = width / height;
    if (fitNeeded) {
      setResponsiveOrbit(state, aspect);
      frustum = fitFrustum(THREE, mode === 'board' ? assembly : isolated, state, aspect, mode);
      const { extent, target } = frustum;
      const { key, keyDirection } = studio;
      const radius = Math.max(1, extent * 0.57);
      key.target.position.copy(target);
      key.position.copy(keyDirection).multiplyScalar(radius * 2.4).add(target);
      Object.assign(key.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius,
        near: 0.02, far: radius * 4.4 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.normalBias = radius * 0.0008;
      renderer.shadowMap.needsUpdate = true;
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
    const { direction, up } = cameraBasis(THREE, state);
    camera.position.copy(direction.multiplyScalar(distance)).add(target);
    camera.up.copy(up);
    camera.lookAt(target);
    studio.floor.visible = mode === 'board' && state.elevation > 0.25;
    if (width !== renderedWidth || height !== renderedHeight) {
      renderer.setSize(width, height, false);
      renderedWidth = width;
      renderedHeight = height;
    }
    renderer.render(scene, camera);
    container.dataset.viewerDraws = String(renderer.info.render.calls);
    if (releasePoster) {
      fallback.hidden = true;
      container.dataset.viewerState = 'ready';
    }
  }

  function showUnavailable() {
    available = false;
    canvas.hidden = true;
    container.dataset.viewerState = 'unavailable';
    fallback.hidden = false;
    fallbackStatus.hidden = false;
    detailSource.textContent = '';
    updateControls();
  }

  search.addEventListener('input', () => {
    filterParts();
    setBrowserOpen(Boolean(normalizeSearch(search.value)));
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setBrowserOpen(false);
    } else if (event.key === 'Enter') {
      const match = list.querySelector('li:not([hidden]) button');
      if (match) match.click();
    }
  });
  browse.addEventListener('click', () => setBrowserOpen(list.hidden));
  filterParts();
  updateDetails();
  if (!THREE) {
    showUnavailable();
    return { selectRef: ref => select(componentByRef.get(ref), true) };
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: capture });
  } catch {
    showUnavailable();
    return { selectRef: ref => select(componentByRef.get(ref), true) };
  }
  available = true;
  renderer.setPixelRatio(capture ? 1 : Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.93;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  scene = new THREE.Scene();
  studio = setupStudio(THREE, scene, renderer);

  const boardBuild = buildBoard(THREE, board, artwork, resolveAsset, requestDraw, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  ({ assembly, boardBody } = boardBuild);
  scene.add(assembly);
  const footprints = new THREE.Group();
  const batches = new THREE.Group();
  assembly.add(footprints, batches);
  isolated = new THREE.Group();
  isolated.visible = false;
  scene.add(isolated);
  highlight = new THREE.BoxHelper(new THREE.Group(), 0xfa7148);
  highlight.material.toneMapped = false;
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
    finishPackage(THREE, fallbackModel, '', 'footprint-approximation');
    body.add(fallbackModel);
    group.add(body);
    footprints.add(group);
    placements.set(component.ref, { body, fallbackModel });
    if (!component.model?.asset) continue;
    const asset = component.model.asset;
    if (!referencesByAsset.has(asset)) referencesByAsset.set(asset, []);
    referencesByAsset.get(asset).push(component.ref);
  }
  updateControls();
  updateDetails();

  const loadPromises = [boardBuild.artworkReady];
  if (THREE.GLTFLoader) {
    const loader = new THREE.GLTFLoader();
    for (const [asset, refs] of referencesByAsset) {
      models.set(asset, 'loading');
      loadPromises.push(new Promise(resolve => loader.load(resolveAsset(asset), ({ scene: imported }) => {
        models.set(asset, 'ready');
        imported.rotation.x += Math.PI / 2;
        imported.scale.multiplyScalar(1000);
        finishPackage(THREE, imported, asset, componentByRef.get(refs[0]).model.source);
        imported.updateMatrixWorld(true);
        const merge = window.V2CadGeometry?.mergeReference;
        const packageModel = merge
          ? merge(THREE, [imported], new THREE.Vector3(), 1, material => material)
          : new THREE.Group().add(imported);
        const repeat = merge && refs.length > 1;
        const instancedByMesh = new Map();
        if (repeat) {
          for (const mesh of packageModel.children) {
            if (mesh.material.transparent) {
              mesh.castShadow = false;
              continue;
            }
            const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, refs.length);
            instanced.castShadow = true;
            instanced.receiveShadow = true;
            instanced.frustumCulled = false;
            instancedByMesh.set(mesh, instanced);
            batches.add(instanced);
          }
        }
        refs.forEach((ref, index) => {
          const { body } = placements.get(ref);
          const clone = packageModel.clone(true);
          body.clear();
          body.add(clone);
          body.updateWorldMatrix(true, false);
          if (!repeat) return;
          packageModel.children.forEach((mesh, childIndex) => {
            const instanced = instancedByMesh.get(mesh);
            if (!instanced) return;
            instanced.setMatrixAt(index, body.matrixWorld);
            // Retain ordinary meshes for per-reference raycasting and bounds.
            clone.children[childIndex].visible = false;
          });
        });
        for (const instanced of instancedByMesh.values()) instanced.instanceMatrix.needsUpdate = true;
        if (refs.includes(chosen?.ref)) {
          refreshHighlight();
          if (mode === 'part') refreshPart();
          updateDetails();
        }
        renderer.shadowMap.needsUpdate = true;
        requestDraw();
        resolve();
      }, undefined, () => {
        models.set(asset, 'unavailable');
        if (refs.includes(chosen?.ref)) updateDetails();
        resolve();
      })));
    }
  }

  function reveal() {
    releasePoster = true;
    if (mode === 'board' && orbits.board.responsive) fitNeeded = true;
    requestDraw();
  }
  const revealTimer = poster ? window.setTimeout(reveal, 2500) : 0;
  Promise.allSettled(loadPromises).then(() => {
    window.clearTimeout(revealTimer);
    reveal();
  });

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
  if ('IntersectionObserver' in window) {
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) requestDraw();
    }, { rootMargin: '90px' });
    visibility.observe(stage);
  }
  document.addEventListener('visibilitychange', requestDraw);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    showUnavailable();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    available = true;
    canvas.hidden = false;
    fallback.hidden = true;
    fallbackStatus.hidden = true;
    updateControls();
    updateDetails();
    fitNeeded = true;
    requestDraw();
  });
  requestDraw();
  return { selectRef: ref => select(componentByRef.get(ref), true) };
}
