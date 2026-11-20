import { boardPoint, buildBoard, makeComponentFactory, finishPackage } from './viewer-geometry.js?v=20261120-bench-plus';

const ELEVATION_LIMIT = Math.PI / 2 - 0.0001;
const normalizeSearch = text => text.toLowerCase().replaceAll('_', ' ').trim();

let viewerSequence = 0;

function viewerMarkup(bench) {
  const listId = `mct-footprints-${++viewerSequence}`;
  const display = `
    <div class="mct-viewer__stage">
      <canvas tabindex="0" aria-label="3D PCB assembly. Use arrow keys to orbit, plus and minus to zoom, and Home to reset."></canvas>
      <div class="mct-viewer__fallback" hidden>
        <img class="mct-viewer__poster" alt="Isolated Glitch Tester PCB assembly">
        <p role="status" hidden>3D rendering is unavailable in this browser.</p>
      </div>
      ${bench ? '<button type="button" class="mct-bench__reset" data-bench-reset-view hidden>Reset view</button>' : `
        <div class="mct-viewer__meter" aria-hidden="true">
          <span data-view-label></span>
          <span data-size-label></span>
        </div>`}
    </div>`;
  if (bench) return display;
  return `${display}
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

function cameraBasis(THREE, { azimuth, elevation, roll }) {
  const direction = new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation));
  const right = new THREE.Vector3(-Math.sin(azimuth), Math.cos(azimuth), 0);
  const up = new THREE.Vector3().crossVectors(direction, right);
  right.applyAxisAngle(direction, roll);
  up.applyAxisAngle(direction, roll);
  return { direction, right, up };
}

function modelBounds(THREE, model) {
  const bounds = new THREE.Box3();
  const transformed = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    transformed.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    bounds.union(transformed);
  });
  return bounds;
}

function fromNativeBoardPose(THREE, rotation) {
  // The portfolio imports KiCad CAD as Y-up. The tester data is Z-up.
  const view = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z))
    .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).invert();
  const direction = new THREE.Vector3(0, 0, 1).transformDirection(view);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(view);
  const azimuth = Math.atan2(direction.y, direction.x);
  const elevation = Math.asin(direction.z);
  const base = cameraBasis(THREE, { azimuth, elevation, roll: 0 });
  return { azimuth, elevation, roll: Math.atan2(-up.dot(base.right), up.dot(base.up)) };
}

function newOrbit(mode, boardPose) {
  const orientation = mode === 'part' ? { azimuth: -2.3, elevation: 0.62, roll: 0 } : boardPose;
  return { ...orientation, zoom: 1, preset: '' };
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

export async function mountDemoScene(container, { board, assetBase, poster, onAction }) {
  const module = await import('./demo-scene.js?v=20261120-bench-plus');
  return mountViewer(container, board, { assetBase, poster, bench: { module, onAction } });
}

export function mountViewer(container, board, options = {}) {
  const { artwork = board.artwork, poster, capture = false, bench } = options;
  const assetBase = new URL(options.assetBase || '.', document.baseURI);
  const resolveAsset = path => new URL(path, assetBase).href;
  const THREE = window.THREE;
  const studio = window.V2CadStudio;
  const boardPose = THREE && studio ? fromNativeBoardPose(THREE, studio.boardRotation) : undefined;
  container.classList.add('mct-viewer');
  if (bench) container.classList.add('mct-bench');
  container.innerHTML = viewerMarkup(bench);

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

  const benchReset = stage.querySelector('[data-bench-reset-view]');
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
  const assembled = bench
    ? board.components.filter(component => !component.dnp || bench.module.BENCH_FITTED_REFS.has(component.ref))
    : board.components;
  const components = [...assembled].sort((a, b) => {
    return Number(a.side === 'bottom') - Number(b.side === 'bottom') || collator.compare(a.ref, b.ref);
  });
  const componentByRef = new Map(components.map(component => [component.ref, component]));
  const models = new Map();
  const placements = new Map();
  const partButtons = new Map();
  const orbits = { board: newOrbit('board', boardPose), part: newOrbit('part') };
  let chosen;
  let mode = 'board';
  let renderer;
  let camera;
  let scene;
  let environment;
  let benchVisual;
  let assembly;
  let boardBody;
  let isolated;
  let highlight;
  let presentation;
  let releasePoster = !poster && !capture;
  let frameBounds;
  let fitNeeded = true;
  let available = false;
  let frame = 0;
  let visible = true;
  let renderedWidth = 0;
  let renderedHeight = 0;
  let disposed = false;
  let viewportObserver;
  let resizeObserver;
  let revealTimer;

  if (!bench) {
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
    if (bench) return;
    detail.hidden = !chosen;
    if (!chosen) return;
    detailFace.textContent = [chosen.side === 'top' ? 'Front' : 'Back', chosen.dnp ? 'KiCad DNP' : ''].filter(Boolean).join(' · ');
    detailName.textContent = `${chosen.ref} · ${chosen.value}`;
    if (available) detailSource.textContent = sourceLabel(chosen, models.get(chosen.model?.asset));
  }

  function updateControls() {
    if (bench) {
      canvas.setAttribute('aria-label', 'Interactive 3D tester bench. Drag or tap the plugs and tap the switches. Use the bench controls for keyboard operation, arrow keys to turn the board, plus and minus to zoom, and Home to reset the view.');
      return;
    }
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
    const bounds = modelBounds(THREE, model);
    const size = bounds.getSize(new THREE.Vector3());
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    isolated.scale.setScalar(1 / Math.max(0.01, size.x, size.y, size.z));
    isolated.add(model);
    fitNeeded = true;
  }

  function setMode(nextMode) {
    if (!available || (nextMode === 'part' && !chosen)) return;
    mode = nextMode;
    assembly.visible = mode === 'board';
    isolated.visible = mode === 'part';
    if (mode === 'part') refreshPart();
    updateControls();
    fitNeeded = true;
    renderer.shadowMap.enabled = mode === 'part' || components.length < 80;
    requestDraw();
  }

  function setSide(face) {
    const front = face === 'front';
    orbits.board = { azimuth: front ? -Math.PI / 2 : Math.PI / 2,
      elevation: front ? ELEVATION_LIMIT : -ELEVATION_LIMIT, roll: 0, zoom: 1, preset: face };
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
      requestDraw();
    }
    return true;
  }

  function resetView() {
    orbits[mode] = newOrbit(mode, boardPose);
    if (benchReset) benchReset.hidden = true;
    updateControls();
    fitNeeded = true;
    requestDraw();
  }

  function applyZoom(factor) {
    const state = orbits[mode];
    state.zoom = Math.min(6, Math.max(0.67, state.zoom * factor));
    if (benchReset) benchReset.hidden = false;
    requestDraw();
  }

  function orbit(deltaX, deltaY) {
    const state = orbits[mode];
    state.azimuth -= deltaX * 0.0085;
    state.elevation = Math.max(-ELEVATION_LIMIT, Math.min(ELEVATION_LIMIT, state.elevation + deltaY * 0.0085));
    if (benchReset) benchReset.hidden = false;
    if (state.preset) {
      state.preset = '';
      updateControls();
    }
    requestDraw();
  }

  function requestDraw() {
    if (available && releasePoster && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw);
  }

  function draw(time) {
    frame = 0;
    if (!available || !visible || document.hidden) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const moving = benchVisual?.animate(time);
    const state = orbits[mode];
    const aspect = width / height;
    const { direction, right, up } = cameraBasis(THREE, state);
    presentation.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, direction).transpose());
    presentation.updateMatrixWorld(true);
    if (fitNeeded) {
      frameBounds = modelBounds(THREE, mode === 'board' ? assembly : isolated);
      fitNeeded = false;
    }
    const benchMagnification = bench ? (aspect > 1.3 ? 1.26 : 1.02) : 1;
    studio.frame(camera, { aspect, bounds: frameBounds, span: 1, zoom: state.zoom * benchMagnification });
    highlight.visible = mode === 'board' && Boolean(chosen);
    if (highlight.visible) highlight.setFromObject(placements.get(chosen.ref).body);
    if (width !== renderedWidth || height !== renderedHeight) {
      renderer.setSize(width, height, false);
      renderedWidth = width;
      renderedHeight = height;
    }
    renderer.render(scene, camera);
    if (benchVisual) {
      const mated = benchVisual.mated();
      container.dataset.benchPowerMated = String(mated.power);
      container.dataset.benchInputMated = String(mated.input);
    }
    if (moving) requestDraw();
    container.dataset.viewerDraws = String(renderer.info.render.calls);
    container.dataset.viewerPose = mode === 'part' ? chosen.ref : state.preset || 'assembly';
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
    if (detailSource) detailSource.textContent = '';
    if (benchReset) benchReset.hidden = true;
    updateControls();
  }

  if (!bench) {
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
  }
  if (!THREE || !studio) {
    showUnavailable();
    return bench ? null : { selectRef: ref => select(componentByRef.get(ref), true) };
  }

  try {
    ({ renderer, scene, camera, environment } = studio.create(THREE, { canvas, capture }));
  } catch {
    showUnavailable();
    return bench ? null : { selectRef: ref => select(componentByRef.get(ref), true) };
  }
  available = true;
  renderer.shadowMap.enabled = components.length < 80;
  presentation = new THREE.Group();
  scene.add(presentation);

  const boardBuild = buildBoard(THREE, board, artwork, resolveAsset, requestDraw, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  ({ assembly, boardBody } = boardBuild);
  assembly.scale.setScalar(1 / Math.max(board.width, board.height));
  assembly.position.z = assembly.scale.z * board.thickness / 2;
  presentation.add(assembly);
  if (bench) {
    benchVisual = bench.module.createBenchVisual(THREE, board, {
      boardPoint, surfaceGeometry: boardBuild.surfaceGeometry, invalidate: requestDraw
    });
    assembly.add(benchVisual.group);
    publishBenchState();
  }
  const footprints = new THREE.Group();
  const batches = new THREE.Group();
  assembly.add(footprints, batches);
  isolated = new THREE.Group();
  isolated.visible = false;
  presentation.add(isolated);
  const accent = getComputedStyle(container).getPropertyValue('--mct-accent').trim();
  highlight = new THREE.BoxHelper(new THREE.Group(), accent || 0x7bbcff);
  highlight.material.toneMapped = false;
  highlight.visible = false;
  scene.add(highlight);
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
        if (disposed) {
          resolve();
          return;
        }
        models.set(asset, 'ready');
        imported.rotation.x += Math.PI / 2;
        imported.scale.multiplyScalar(1000);
        finishPackage(THREE, imported, asset, componentByRef.get(refs[0]).model.source);
        imported.updateMatrixWorld(true);
        const preserveActuator = bench && refs.some(bench.module.benchNeedsActuatorNodes);
        const merge = preserveActuator ? undefined : window.V2CadGeometry?.mergeReference;
        const packageModel = merge
          ? merge(THREE, [imported], new THREE.Vector3(), 1, material => material)
          : new THREE.Group().add(imported);
        const repeat = merge && refs.length > 1 && (!bench || refs.every(bench.module.benchCanInstance));
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
        assembly.updateWorldMatrix(true, false);
        const inverseAssembly = assembly.matrixWorld.clone().invert();
        refs.forEach((ref, index) => {
          const { body } = placements.get(ref);
          const clone = packageModel.clone(true);
          body.clear();
          body.add(clone);
          benchVisual?.registerPart(ref, clone);
          body.updateWorldMatrix(true, false);
          if (!repeat) return;
          packageModel.children.forEach((mesh, childIndex) => {
            const instanced = instancedByMesh.get(mesh);
            if (!instanced) return;
            instanced.setMatrixAt(index, inverseAssembly.clone().multiply(body.matrixWorld));
            // Retain ordinary meshes for per-reference raycasting and bounds.
            clone.children[childIndex].visible = false;
          });
        });
        for (const instanced of instancedByMesh.values()) instanced.instanceMatrix.needsUpdate = true;
        if (refs.includes(chosen?.ref)) {
          if (mode === 'part') refreshPart();
          updateDetails();
        }
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
    if (disposed) return;
    releasePoster = true;
    fitNeeded = true;
    requestDraw();
  }
  revealTimer = poster && !capture ? window.setTimeout(reveal, 2500) : 0;
  Promise.allSettled(loadPromises).then(() => {
    window.clearTimeout(revealTimer);
    reveal();
  });

  if (!bench) {
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
  }

  benchReset?.addEventListener('click', () => {
    resetView();
    canvas.focus({ preventScroll: true });
  });

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function pointRay(x, y, bounds) {
    pointerNdc.set((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2);
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.ray;
  }

  function onBenchFront() {
    return benchVisual && orbits.board.elevation > 0.15;
  }

  function pick(x, y) {
    if (mode !== 'board' || (bench && !onBenchFront())) return;
    pointRay(x, y, canvas.getBoundingClientRect());
    const targets = benchVisual ? [boardBody, footprints, benchVisual.group] : [boardBody, footprints];
    const [hit] = raycaster.intersectObjects(targets, true);
    for (let object = hit?.object; object; object = object.parent) {
      const { action, componentRef } = object.userData;
      if (bench && (action || componentRef)) {
        const control = action || benchVisual.lookupAction(componentRef);
        if (control) bench.onAction(control);
        break;
      }
      if (componentRef) {
        select(componentByRef.get(componentRef));
        break;
      }
    }
  }

  const dragPorts = [
    { action: 'power', ref: 'J5', radius: 3.3 },
    { action: 'input', ref: 'J1', radius: 5.7 },
    { action: 'input', ref: 'J2', radius: 5.7 },
  ];
  const pointers = new Map();
  let didDrag = false;
  let interactedWithMultiplePointers = false;
  let leadDrag = null;

  function findLead(x, y) {
    if (!onBenchFront() || !releasePoster || !benchVisual.leadDragAnchor) return null;
    pointRay(x, y, canvas.getBoundingClientRect());
    const [hit] = raycaster.intersectObject(benchVisual.group, true);
    for (let object = hit?.object; object; object = object.parent) {
      const { leadDragAction: action, leadDragRef: ref } = object.userData;
      if (!action) continue;
      const state = benchVisual.readState();
      const connected = action === 'power' ? state.powerConnected : state.inputConnected;
      return connected ? null : { action, ref };
    }
    return null;
  }

  function startLeadDrag(gesture, pointer) {
    const { action, ref } = gesture;
    const anchor = benchVisual.leadDragAnchor(action, ref);
    if (!anchor) return false;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -anchor.z).applyMatrix4(assembly.matrixWorld);
    const point = pointRay(pointer.startX, pointer.startY, canvas.getBoundingClientRect())
      .intersectPlane(plane, new THREE.Vector3());
    if (!point || benchVisual.beginLeadDrag(action, ref) === false) return false;
    gesture.plane = plane;
    gesture.offset = anchor.clone().sub(assembly.worldToLocal(point));
    container.dataset.benchDrag = action;
    container.dataset.benchDragRef = ref;
    canvas.classList.add('mct-viewer__dragging');
    return true;
  }

  function moveLeadDrag(event) {
    const bounds = canvas.getBoundingClientRect();
    const point = pointRay(event.clientX, event.clientY, bounds).intersectPlane(leadDrag.plane, new THREE.Vector3());
    if (!point) return false;
    assembly.worldToLocal(point).add(leadDrag.offset);
    const projection = point.clone().applyMatrix4(assembly.matrixWorld).project(camera);
    const scaleX = bounds.width / 2;
    const scaleY = bounds.height / 2;
    const underCanvas = event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;

    let nearest;
    for (const port of dragPorts) {
      const target = benchVisual.leadDragTarget(port.action, port.ref);
      if (!target) continue;
      const projected = target.clone().applyMatrix4(assembly.matrixWorld).project(camera);
      const distance = Math.hypot((projection.x - projected.x) * scaleX, (projection.y - projected.y) * scaleY);
      if (!nearest || distance < nearest.distance) nearest = { port, distance };
    }
    const radius = nearest?.port.radius || 0;
    const pixelsPerMm = assembly.scale.x * bounds.width / (camera.right - camera.left);
    const tolerance = Math.max(event.pointerType === 'touch' ? 21 : 13, Math.min(34, radius * pixelsPerMm + 5));
    const canSnap = underCanvas && nearest?.port.ref === leadDrag.ref && nearest.distance <= tolerance;
    benchVisual.moveLeadDrag(leadDrag.action, point, canSnap);
    container.dataset.benchDropReady = String(canSnap);
    requestDraw();
    return canSnap;
  }

  function finishLeadDrag(snapped = false) {
    if (!leadDrag) return;
    const { action, plane, pointerId } = leadDrag;
    leadDrag = null;
    delete container.dataset.benchDrag;
    delete container.dataset.benchDragRef;
    delete container.dataset.benchDropReady;
    if (!plane) return;
    didDrag = true;
    const pointer = pointers.get(pointerId);
    if (pointer) pointer.cancelled = true;
    benchVisual.endLeadDrag(action, snapped);
    canvas.classList.remove('mct-viewer__dragging');
    if (snapped) bench.onAction(action === 'power' ? 'connectPower' : 'connectInput');
    requestDraw();
  }

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !available) return;
    if (pointers.size === 0) {
      didDrag = false;
      interactedWithMultiplePointers = false;
      const handle = findLead(event.clientX, event.clientY);
      leadDrag = handle ? { ...handle, pointerId: event.pointerId } : null;
    } else {
      interactedWithMultiplePointers = true;
      finishLeadDrag();
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      if (bench && event.pointerType === 'mouse' && !pointers.size) {
        canvas.classList.toggle('mct-bench__lead-grab', Boolean(findLead(event.clientX, event.clientY)));
      }
      return;
    }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const previousDistance = pointers.size > 1 ? pinchDistance() : 0;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointer.cancelled && pointers.size === 1) return;
    const threshold = leadDrag && event.pointerType === 'touch' ? 6 : 3;
    if (previousDistance > 0) {
      applyZoom(pinchDistance() / previousDistance);
      didDrag = true;
    } else if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > threshold || didDrag) {
      if (leadDrag && !leadDrag.plane && !startLeadDrag(leadDrag, pointer)) leadDrag = null;
      if (leadDrag?.plane) moveLeadDrag(event);
      else orbit(dx, dy);
      didDrag = true;
    }
    if (didDrag) canvas.classList.add('mct-viewer__dragging');
  });
  function endPointer(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (leadDrag?.pointerId === event.pointerId) {
      const snapped = Boolean(leadDrag.plane && event.type === 'pointerup' && moveLeadDrag(event));
      finishLeadDrag(snapped);
    }
    if (pointers.size) return;
    canvas.classList.remove('mct-viewer__dragging', 'mct-bench__lead-grab');
    if (event.type === 'pointerup' && !didDrag && !interactedWithMultiplePointers) pick(event.clientX, event.clientY);
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('pointerleave', () => canvas.classList.remove('mct-bench__lead-grab'));
  canvas.addEventListener('wheel', event => {
    if (!available || (document.activeElement !== canvas && !event.ctrlKey)) return;
    event.preventDefault();
    if (leadDrag?.plane) return;
    applyZoom(Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * 0.0025));
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (!available) return;
    if (leadDrag?.plane) {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishLeadDrag();
      }
      return;
    }
    const directional = { ArrowLeft: [-14, 0], ArrowRight: [14, 0], ArrowUp: [0, -14], ArrowDown: [0, 14] };
    if (directional[event.key]) orbit(...directional[event.key]);
    else if (event.key === '+' || event.key === '=') applyZoom(1.24);
    else if (event.key === '-') applyZoom(1 / 1.24);
    else if (event.key === 'Home') resetView();
    else return;
    event.preventDefault();
  });

  resizeObserver = new ResizeObserver(() => {
    if (leadDrag?.plane) finishLeadDrag();
    fitNeeded = true;
    requestDraw();
  });
  resizeObserver.observe(stage);
  if ('IntersectionObserver' in window) {
    viewportObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) requestDraw();
    }, { rootMargin: '90px' });
    viewportObserver.observe(stage);
  }
  function handleVisibility() {
    if (document.hidden) finishLeadDrag();
    requestDraw();
  }
  document.addEventListener('visibilitychange', handleVisibility);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    finishLeadDrag();
    showUnavailable();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (disposed) return;
    available = true;
    canvas.hidden = false;
    fallback.hidden = true;
    fallbackStatus.hidden = true;
    updateControls();
    updateDetails();
    fitNeeded = true;
    requestDraw();
  });
  function publishBenchState() {
    const state = benchVisual.readState();
    container.dataset.benchPower = String(state.powered);
    container.dataset.benchPowerConnected = String(state.powerConnected);
    container.dataset.benchSourceOn = String(state.sourceOn);
    container.dataset.benchInput = String(state.inputConnected);
    container.dataset.benchLiveLamps = state.live.join(' ');
    container.dataset.benchLatchedLamps = state.latched.join(' ');
  }

  function disposeBench() {
    if (disposed) return;
    disposed = true;
    available = false;
    finishLeadDrag();
    cancelAnimationFrame(frame);
    window.clearTimeout(revealTimer);
    resizeObserver?.disconnect();
    viewportObserver?.disconnect();
    document.removeEventListener('visibilitychange', handleVisibility);
    benchVisual?.dispose();
    const geometries = new Set();
    const materials = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (material) materials.add(material);
      }
    });
    const textures = new Set();
    for (const material of materials) {
      for (const texture of [material.map, material.roughnessMap, material.metalnessMap]) {
        if (texture) textures.add(texture);
      }
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    environment?.dispose();
    renderer.dispose();
  }

  requestDraw();
  if (bench) return {
    update(state) {
      if (disposed) return;
      if ((leadDrag?.action === 'power' && state.powerConnected) || (leadDrag?.action === 'input' && state.inputConnected)) finishLeadDrag();
      benchVisual.update(state);
      publishBenchState();
    },
    dispose: disposeBench
  };
  return { selectRef: ref => select(componentByRef.get(ref), true) };
}
