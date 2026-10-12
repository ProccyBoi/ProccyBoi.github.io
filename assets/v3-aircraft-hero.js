(() => {
  'use strict';
  const root = document.querySelector('[data-aircraft-hero]');
  if (!root) return;
  const deferred = root.hasAttribute('data-aircraft-deferred');
  const detailed = root.hasAttribute('data-aircraft-detailed');
  const background = root.hasAttribute('data-aircraft-background');
  const ambient = root.hasAttribute('data-aircraft-ambient');
  // Opt-in v2 wheel interpolation leaves the accepted v3 controller unchanged.
  const scrub = root.hasAttribute('data-aircraft-smooth') && window.V2ScrollSmoothing;
  let renderedProgress = 0, scrubTime = 0, directScrub = false;
  const stage = root.querySelector('[data-aircraft-stage]'), canvas = root.querySelector('canvas');
  const poster = root.querySelector('[data-aircraft-poster]'), skip = root.querySelector('[data-aircraft-skip]');
  const posterSources = [...root.querySelectorAll('[data-aircraft-picture] source')];
  const showPoster = pose => { posterSources.forEach(source => { source.srcset = source.dataset[pose]; }); poster.src = poster.dataset[pose]; };
  const chapters = [...root.querySelectorAll('[data-aircraft-chapter]')], links = [...root.querySelectorAll('[data-aircraft-go]')];
  const bar = root.querySelector('[data-aircraft-progress]'), ids = chapters.map(chapter => chapter.id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), short = matchMedia('(max-height:600px)');
  const allowed = () => !reduced.matches && !short.matches && !navigator.connection?.saveData;
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
  const scripts = window.V2HeroScripts ||= new Map();
  function script(url) {
    if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
      const element = document.createElement('script'); element.src = url; element.onload = resolve; element.onerror = reject; document.head.append(element);
    }));
    return scripts.get(url);
  }
  let renderer, scene, camera, flight, key, atmosphere, floorMaterial, groundUniforms, track, frame = 0, frameCount = 0;
  let ready = false, loading = false, telemetryLoading = false, failed = false, visible = !deferred, activePage = true, currentChapter = -1;
  let width = 1, height = 1, rootTop = 0, distance = 1, progress = 0, lastScroll = scrollY;
  let landingDone = ambient, landingElapsed = 0, previousTime = 0, capturePose;
  let landingEntered = !deferred;
  let shadowBox, boardBox, shadowCentre, corner, studioGround, airfieldGround, studioFog, airfieldFog;
  let sourcePreparation, telemetryTask, airframeTransport, transportGate, releaseTransport, backgroundBusy = false, backgroundDone = false, warmGeneration = 0;
  let warmAbort, gpuAbort, aircraftPriority = false;
  let liveBusy = false, liveAbort, liveGeneration = 0, needsDrain = true;
  let poseRevision = 0, presentedRevision = -1, layoutRevision = 0, submittedFrames = 0, completedFrames = 0;
  let desiredRatio = 1, bufferWidth = 0, bufferHeight = 0, bufferRatio = 0, landingClockStarted = false;
  const completedWarmPoses = new Set(), preparationMeasurements = [], backgroundWaiters = new Set();
  let preparationNear = false, preparationIntent = false;
  const preparationEligible = () => !background || visible || preparationNear || preparationIntent;
  const selectedVisible = () => Boolean(background && window.V2SelectedWork?.isVisible?.());
  function heroForegroundBusy() {
    if (!ambient) return false;
    const hero = document.querySelector('[data-assembly]');
    if (!hero || hero.dataset.assemblyForegroundSettled === 'true' || ['unavailable', 'static'].includes(hero.dataset.assemblyState)) return false;
    if (hero.dataset.assemblyReadableVisible !== undefined) return hero.dataset.assemblyReadableVisible === 'true';
    const bounds = hero.getBoundingClientRect(), header = document.querySelector('.v2-header')?.getBoundingClientRect();
    return bounds.top < innerHeight && bounds.bottom > Math.max(0, header?.bottom || 0);
  }
  const aircraftVisible = () => Boolean(background && track && visible && allowed() && activePage && !document.hidden && !failed);
  function publishAircraftPriority() {
    if (!background) return;
    const active = aircraftVisible();
    if (active === aircraftPriority) return;
    aircraftPriority = active;
    dispatchEvent(new CustomEvent('v2:aircraft-priority', { detail: { active } }));
  }
  const wakeBackground = () => { const pending = [...backgroundWaiters]; backgroundWaiters.clear(); pending.forEach(resolve => resolve()); };
  function interruptBackground(state) {
    if (!background) return;
    warmGeneration++; warmAbort?.abort(); needsDrain = true; wakeBackground();
    if (!backgroundDone && !failed) root.dataset.aircraftBackgroundState = state;
  }
  function backgroundPause() {
    return !allowed() ? 'paused-preferences' : document.hidden || !activePage ? 'paused-hidden' : !preparationEligible() ? 'deferred-distance' : heroForegroundBusy() && !visible ? 'paused-hero' : selectedVisible() && !visible ? 'paused-selected' : '';
  }
  // CPU reconstruction can outlive a visibility change. Recheck at each
  // boundary, retaining its promise while a lifecycle/priority event wakes it.
  // No timer or offscreen animation loop waits for Selected Work to leave.
  async function backgroundCPU(phase, valid = () => true, signal) {
    while (!failed && valid()) {
      const pause = backgroundPause();
      if (!pause) {
        if (!visible) await idleTurn(signal);
        if (failed || !valid()) return false;
        if (!backgroundPause()) { root.dataset.aircraftCPUPhase = phase; return true; }
      }
      if (!backgroundDone) root.dataset.aircraftBackgroundState = backgroundPause();
      await new Promise(resolve => backgroundWaiters.add(resolve));
    }
    return false;
  }
  function maskCanvas() {
    root.classList.remove('is-ready'); canvas.style.visibility = 'hidden'; root.dataset.aircraftWarmMask = 'true';
  }
  function revisePose(mask = false) {
    if (!background) return;
    root.dataset.aircraftPoseRevision = String(++poseRevision);
    if (mask) maskCanvas();
  }
  function pauseLandingClock() {
    if (!background) return;
    if (landingClockStarted && previousTime && !landingDone && landingEntered && !capturePose) landingElapsed += Math.max(0, performance.now() - previousTime);
    previousTime = 0;
  }
  function interruptLive(mask = true) {
    if (!background) return;
    liveGeneration++; liveAbort?.abort(); needsDrain = true; revisePose(mask);
  }
  function pixelRatio(warm = false) {
    const live = desiredRatio;
    const ratio = warm ? Math.min(live, 640 / Math.max(1, width, height)) : live;
    // Buffer mutations happen only after the preceding batch has drained.
    // A layout observer records desired dimensions without clearing a pending
    // or already-presented frame through an unchanged setSize call.
    if (bufferRatio !== ratio) { renderer.setPixelRatio(ratio); bufferRatio = ratio; }
    if (bufferWidth !== width || bufferHeight !== height) { renderer.setSize(width, height, false); bufferWidth = width; bufferHeight = height; }
    root.dataset.aircraftLivePixelRatio = String(live);
    if (warm) root.dataset.aircraftWarmPixelRatio = String(ratio);
    root.dataset.aircraftBufferWidth = String(canvas.width); root.dataset.aircraftBufferHeight = String(canvas.height);
    return ratio;
  }
  const request = () => { if (!frame && track && visible && activePage && !document.hidden && allowed() && (!background || (!liveBusy && !backgroundBusy))) frame = requestAnimationFrame(render); };
  const chapterAt = value => detailed ? value < .76 ? 0 : 1 : value < .25 ? 0 : value < .70 ? 1 : 2;
  function chapter(index) {
    // Ambient copy is ordinary document content: never hide it, make it inert,
    // rename its anchors, or move focus as the decorative scene changes.
    if (ambient) { root.dataset.aircraftChapter = String(index); return; }
    if (currentChapter === index) return;
    currentChapter = index;
    chapters.forEach((item, itemIndex) => {
      const active = index === itemIndex;
      if (!active && item.contains(document.activeElement)) links[index].focus({ preventScroll: true });
      item.classList.toggle('is-current', active); item.inert = !active; item.setAttribute('aria-hidden', String(!active));
    });
    links.forEach((link, itemIndex) => itemIndex === index ? link.setAttribute('aria-current', 'step') : link.removeAttribute('aria-current'));
    root.dataset.aircraftChapter = String(index);
  }
  function endLanding() {
    if (landingDone) return;
    landingDone = true; landingElapsed = 5400; previousTime = 0;
    if (background) revisePose();
    if (skip && document.activeElement === skip) links[0]?.focus({ preventScroll: true });
    if (skip) skip.hidden = true; request();
  }
  function enable() {
    if (track) return;
    if (ambient) {
      // Use the content's own layout as the scroll extent. No generated steps,
      // invisible jump destinations, autoplay gate, or extra scroll runway.
      track = root; landingDone = true; landingEntered = true;
      root.classList.add('is-ambient'); showPoster('stopped'); layout(); return;
    }
    track = document.createElement('div'); track.className = 'v3-aircraft-track'; track.setAttribute('aria-hidden', 'true');
    chapters.forEach((item, index) => {
      item.id = 'copy-' + ids[index];
      const step = document.createElement('div'); step.id = ids[index]; step.className = 'v3-aircraft-step'; track.append(step);
    });
    root.append(track); root.classList.add('is-story'); currentChapter = -1; chapter(0); layout();
    showPoster('approach');
    if (ids.includes(location.hash.slice(1))) {
      endLanding(); requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' }));
    }
  }
  function fallback(state = 'static') {
    const restore = !ambient && track && scrollY > rootTop + 200 ? Math.max(currentChapter, 0) : -1;
    if (background) { pauseLandingClock(); interruptLive(); }
    cancelAnimationFrame(frame); frame = 0; previousTime = 0; scrubTime = 0; renderedProgress = progress; landingDone = true;
    root.classList.remove('is-story', 'is-ambient', 'is-ready'); if (!ambient) track?.remove(); track = null; if (skip) skip.hidden = true;
    if (background) publishAircraftPriority();
    chapters.forEach((item, index) => { item.id = ids[index]; item.classList.remove('is-current'); item.removeAttribute('aria-hidden'); item.inert = false; });
    links.forEach(link => link.removeAttribute('aria-current'));
    showPoster('stopped');
    root.dataset.aircraftState = state;
    if (restore >= 0) chapters[restore].scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  function updateScroll() {
    if (!track) return;
    if (ambient) {
      // Content above this section can reflow without resizing our stage or
      // copy. Read the real anchors at scroll time, never from a GPU poll.
      const first = chapters[0].getBoundingClientRect(), last = chapters[chapters.length - 1].getBoundingClientRect();
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      rootTop = scrollY + first.top - padding;
      distance = Math.max(1, last.top - first.top);
    }
    if (deferred) {
      const bounds = root.getBoundingClientRect(), pinnedTop = parseFloat(getComputedStyle(stage).top) || 0;
      if (!ambient) rootTop = scrollY + bounds.top;
      const wasVisible = visible;
      visible = bounds.top < innerHeight && bounds.bottom > pinnedTop;
      if (background) {
        publishAircraftPriority();
        const wasNear = preparationNear; preparationNear = bounds.top < innerHeight * 2 && bounds.bottom > -innerHeight;
        if (!preparationNear && !visible) { preparationIntent = false; if (wasNear && backgroundBusy) interruptBackground('deferred-distance'); }
        root.dataset.aircraftPreparationEligible = String(preparationEligible());
        if (wasNear !== preparationNear) { wakeBackground(); if (preparationNear && !visible) prepareInBackground(); }
      }
      if (background && visible !== wasVisible) {
        if (visible) { interruptBackground('promoted'); interruptLive(); initialize(); }
        else { pauseLandingClock(); interruptLive(); prepareInBackground(); }
        wakeBackground();
      }
    }
    const stageTop = stage.getBoundingClientRect().top;
    const pinnedTop = parseFloat(getComputedStyle(stage).top) || 0;
    const minimumCopyTop = parseFloat(getComputedStyle(root).getPropertyValue('--v3-aircraft-copy-min')) || 34;
    root.style.setProperty('--v3-aircraft-copy-top', `${Math.max(minimumCopyTop, pinnedTop - stageTop)}px`);
    const next = clamp((scrollY - rootTop) / distance);
    if (deferred && !landingEntered) {
      const bounds = stage.getBoundingClientRect(), pinnedTop = parseFloat(getComputedStyle(stage).top) || 0;
      landingEntered = bounds.top <= pinnedTop + height * .25 && bounds.bottom > pinnedTop;
    }
    if ((!deferred && Math.abs(scrollY - lastScroll) > 4) || next > .005) endLanding();
    const jumped = Boolean(scrub && Math.abs(next - progress) > scrub.jump);
    if (background && next !== progress) revisePose(jumped);
    if (scrub && (!visible || directScrub || jumped)) renderedProgress = next;
    lastScroll = scrollY; progress = next;
    const effective = flight && !flight.telemetryReady ? Math.min(progress, .61) : progress;
    if (!scrub && !background) chapter(chapterAt(effective));
    if (!scrub && !background && bar) bar.style.transform = `scaleX(${progress})`; root.dataset.aircraftProgress = progress.toFixed(6); request();
  }
  function layout() {
    if (!track) return;
    const nextWidth = stage.clientWidth, nextHeight = stage.clientHeight;
    if (background) {
      const nextRatio = Math.min(devicePixelRatio || 1, nextWidth < 761 ? 1.35 : 1.65);
      const changed = width !== nextWidth || height !== nextHeight || desiredRatio !== nextRatio;
      if (changed) { desiredRatio = nextRatio; root.dataset.aircraftLayoutRevision = String(++layoutRevision); interruptLive(); }
    }
    width = nextWidth; height = nextHeight;
    if (ambient) { updateScroll(); return; }
    distance = height * (background ? (width < 761 ? 2.1 : 1.8) : (width < 761 ? 3.7 : 3.1));
    track.style.height = `${distance + height}px`; track.style.marginTop = `${-height}px`;
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    // The story starts when its section reaches the document's scroll origin;
    // the sticky stage reserves the header band inside that section.
    [...track.children].forEach((step, index) => { step.style.top = `${(detailed ? [0, 1] : [0, .38, 1])[index] * distance + padding}px`; });
    rootTop = scrollY + root.getBoundingClientRect().top;
    if (!background) renderer?.setSize(width, height, false); updateScroll();
  }
  function fitLight(focus) {
    const T = window.THREE;
    shadowBox.setFromObject(flight.group);
    if (flight.telemetryReady) {
      boardBox.setFromObject(flight.board);
      const amount = smooth((focus - .25) / .70);
      shadowBox.min.lerp(boardBox.min, amount); shadowBox.max.lerp(boardBox.max, amount);
    }
    const span = Math.max(...shadowBox.getSize(corner).toArray(), .07303), padding = span * .06;
    shadowBox.getCenter(shadowCentre);
    key.target.position.copy(shadowCentre); key.position.copy(shadowCentre).addScaledVector(key.userData.direction, Math.max(2, span * 4));
    key.target.updateMatrixWorld(); key.updateMatrixWorld();
    const view = key.shadow.camera; view.position.copy(key.position); view.lookAt(shadowCentre); view.updateMatrixWorld();
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, near = Infinity, far = -Infinity;
    for (let index = 0; index < 8; index++) {
      corner.set(index & 1 ? shadowBox.max.x : shadowBox.min.x, index & 2 ? shadowBox.max.y : shadowBox.min.y, index & 4 ? shadowBox.max.z : shadowBox.min.z).applyMatrix4(view.matrixWorldInverse);
      left = Math.min(left, corner.x); right = Math.max(right, corner.x); bottom = Math.min(bottom, corner.y); top = Math.max(top, corner.y);
      near = Math.min(near, -corner.z); far = Math.max(far, -corner.z);
    }
    view.left = left - padding; view.right = right + padding; view.bottom = bottom - padding; view.top = top + padding;
    view.near = Math.max(.01, near - padding); view.far = far + padding; view.updateProjectionMatrix();
    key.shadow.normalBias = span * .0007; key.shadow.bias = -.00015; renderer.shadowMap.needsUpdate = true;
  }
  function renderFrame() {
    renderer.clear();
    if (atmosphere?.opacity > 0) {
      renderer.render(atmosphere.scene, atmosphere.camera);
      renderer.clearDepth();
    }
    renderer.render(scene, camera);
  }
  // Shared drawing code lets a finite offscreen warm-up upload the same
  // geometry/textures without changing autoplay, chapters, focus or scroll.
  function drawPose(pose) {
    const framing = flight.frame(camera, width, height); fitLight(framing.focus);
    const sky = atmosphere?.update({ landing: pose.landing, progress: pose.progress, width, height }) || 0;
    groundUniforms.sky.value = sky;
    groundUniforms.near.value = Math.max(3.5, framing.distance) * (width < 761 ? 1.08 : 1.28);
    groundUniforms.far.value = Math.max(3.5, framing.distance) * (width < 761 ? 1.48 : 2.6);
    if (floorMaterial.transparent !== (sky > 0)) { floorMaterial.transparent = sky > 0; floorMaterial.needsUpdate = true; }
    floorMaterial.color.copy(studioGround).lerp(airfieldGround, sky);
    scene.fog.color.copy(studioFog).lerp(airfieldFog, sky);
    renderFrame();
    return sky;
  }
  function render(time) {
    if (background) { renderPaced(time); return; }
    frame = 0;
    if (!track || !visible || !activePage || document.hidden || !allowed() || !ready) { previousTime = 0; scrubTime = 0; return; }
    try {
      if (!landingDone && landingEntered && !capturePose) {
        if (previousTime) landingElapsed += time - previousTime;
        previousTime = time;
        if (landingElapsed >= 5400) endLanding();
      }
      const targetProgress = flight.telemetryReady ? progress : Math.min(progress, .61);
      if (scrub) {
        if (!flight.telemetryReady) renderedProgress = Math.min(renderedProgress, .61);
        renderedProgress = directScrub ? targetProgress : scrub.step(renderedProgress, targetProgress, scrubTime ? time - scrubTime : 1000 / 60);
        scrubTime = time;
        if (!capturePose) chapter(chapterAt(renderedProgress));
        if (bar) bar.style.transform = `scaleX(${capturePose?.type === 'progress' ? capturePose.value : renderedProgress})`;
        root.dataset.aircraftRenderedProgress = (capturePose?.type === 'progress' ? capturePose.value : renderedProgress).toFixed(6);
      }
      const effective = scrub ? renderedProgress : targetProgress;
      if (background) {
        if (backgroundBusy || gpuAbort) interruptBackground('promoted');
        // A canceled warm pose may have left a small drawing buffer behind.
        // Restore the accepted full live DPR before every real live draw.
        pixelRatio(false);
      }
      const pose = capturePose?.type === 'landing' ? flight.setLanding(capturePose.value) : capturePose?.type === 'progress' ? flight.setProgress(capturePose.value) : !landingDone ? flight.setLanding(landingElapsed / 5400) : flight.setProgress(effective);
      root.dataset.aircraftAtmosphere = drawPose(pose).toFixed(6);
      // Only a successful current live draw may expose this canvas. Resumed
      // hidden warm poses must never leak through the opacity transition.
      if (background) { canvas.style.visibility = ''; root.dataset.aircraftWarmMask = 'false'; }
      root.classList.add('is-ready'); root.dataset.aircraftState = landingDone || capturePose ? 'ready' : 'landing';
      root.dataset.aircraftPhase = pose.phase; root.dataset.aircraftLanding = pose.landing.toFixed(6);
      root.dataset.aircraftSeparated = String(pose.separated); root.dataset.aircraftFrames = String(++frameCount);
      root.dataset.aircraftAssemblyError = flight.assemblyError().toFixed(9);
      if (!landingDone && landingEntered && !capturePose) { if (skip) skip.hidden = false; request(); }
      else if (scrub && !capturePose && renderedProgress !== targetProgress) request();
      else scrubTime = 0;
    } catch (error) { fail(error); }
  }
  function gpuSucceeded(result, valid) {
    if (result.state === 'timeout' || result.state === 'lost') throw new Error('Aircraft GPU preparation ' + result.state);
    return valid() && (result.state === 'complete' || result.state === 'unsupported');
  }
  async function renderPaced(time) {
    frame = 0;
    if (liveBusy || backgroundBusy || !ready || !aircraftVisible()) return;
    liveBusy = true;
    const generation = liveGeneration, abort = new AbortController(); liveAbort = abort;
    const valid = () => generation === liveGeneration && !abort.signal.aborted && aircraftVisible();
    let report, result;
    try {
      if (needsDrain) {
        result = await gpuComplete(valid, abort, 'live-drain', true);
        if (!gpuSucceeded(result, valid)) return;
        needsDrain = false;
      }
      if (!valid()) return;
      time = performance.now();
      // Initial masked upload/drain must not spend unseen approach time. Once
      // the first live pose is revealed, use the full visible wall-clock delta
      // across slow GPU frames, never a synthetic or clamped frame interval.
      if (!landingDone && landingEntered && !capturePose && landingClockStarted) {
        if (previousTime) landingElapsed += Math.max(0, time - previousTime);
        previousTime = time;
        if (landingElapsed >= 5400) endLanding();
      }
      const targetProgress = flight.telemetryReady ? progress : Math.min(progress, .61);
      if (scrub) {
        if (!flight.telemetryReady) renderedProgress = Math.min(renderedProgress, .61);
        renderedProgress = directScrub || root.dataset.aircraftWarmMask === 'true' ? targetProgress : scrub.step(renderedProgress, targetProgress, scrubTime ? time - scrubTime : 1000 / 60);
        scrubTime = time;
      }
      const effective = scrub ? renderedProgress : targetProgress;
      const capture = capturePose, revision = poseRevision, drawnLayout = layoutRevision;
      const kind = capture?.type || (!landingDone ? 'landing' : 'progress');
      const value = capture?.type === 'progress' ? capture.value : effective;
      const started = performance.now(), ratio = pixelRatio(false);
      const pose = capture?.type === 'landing' ? flight.setLanding(capture.value) : capture?.type === 'progress' ? flight.setProgress(capture.value) : !landingDone ? flight.setLanding(landingElapsed / 5400) : flight.setProgress(effective);
      const sky = drawPose(pose), assemblyError = flight.assemblyError();
      needsDrain = true;
      report = { sequence: ++submittedFrames, submittedMs: started, value, rawAtSubmit: progress, landing: pose.landing,
        kind, revision, layoutRevision: drawnLayout, direct: directScrub, masked: root.dataset.aircraftWarmMask === 'true', published: false,
        measurement: { cpuMs: performance.now() - started, width: canvas.width, height: canvas.height, pixelRatio: ratio } };
      root.dataset.aircraftSubmittedFrames = String(submittedFrames);
      root.dataset.aircraftLastSubmission = JSON.stringify(report);
      result = undefined;
      result = await gpuComplete(valid, abort, 'live-frame', true);
      if (!gpuSucceeded(result, valid)) return;
      needsDrain = false;
      root.dataset.aircraftLiveCompletionEvidence = result.state === 'complete' ? 'own-context-fence' : 'unsupported-staged-yield';
      if (result.state === 'complete') root.dataset.aircraftCompletedFrames = String(++completedFrames);
      // Input may change freely while the one outstanding frame finishes. A
      // superseded touch/jump/capture/size never reveals a masked canvas. An
      // already-live wheel frame can publish its matching completed UI, while
      // its old revision keeps the latest native target scheduled next.
      const masked = report.masked || root.dataset.aircraftWarmMask === 'true';
      if (drawnLayout !== layoutRevision || capture !== capturePose) return;
      if (revision !== poseRevision && (masked || directScrub || report.direct || (!capture && kind === 'landing' && landingDone))) return;
      const shownProgress = capture?.type === 'progress' ? capture.value : value;
      if (masked && kind === 'progress' && !capture && Math.abs(shownProgress - (flight.telemetryReady ? progress : Math.min(progress, .61))) > .000002) return;
      chapter(capture?.type === 'landing' ? 0 : chapterAt(shownProgress));
      if (bar) bar.style.transform = `scaleX(${shownProgress})`; root.dataset.aircraftRenderedProgress = shownProgress.toFixed(6);
      root.dataset.aircraftAtmosphere = sky.toFixed(6);
      root.dataset.aircraftState = capture || kind === 'progress' ? 'ready' : 'landing';
      root.dataset.aircraftPhase = pose.phase; root.dataset.aircraftLanding = pose.landing.toFixed(6);
      root.dataset.aircraftSeparated = String(pose.separated); root.dataset.aircraftAssemblyError = assemblyError.toFixed(9);
      canvas.style.visibility = ''; root.dataset.aircraftWarmMask = 'false'; root.classList.add('is-ready');
      presentedRevision = revision; root.dataset.aircraftPresentedRevision = String(revision);
      report.published = true; root.dataset.aircraftFrames = String(++frameCount);
      root.dataset.aircraftFirstLiveMs ||= performance.now().toFixed(1);
      if (!landingClockStarted && !landingDone && landingEntered && !capture) { landingClockStarted = true; previousTime = performance.now(); }
      if (skip) skip.hidden = !(!landingDone && landingEntered && !capture);
      if (capture || renderedProgress === (flight.telemetryReady ? progress : Math.min(progress, .61))) scrubTime = 0;
    } catch (error) { fail(error); }
    finally {
      if (report) root.dataset.aircraftLastFrame = JSON.stringify({ ...report, observedMs: performance.now(), completedMs: result?.state === 'complete' ? performance.now() : null, rawAtComplete: progress, gpu: result });
      abort.abort(); if (liveAbort === abort) liveAbort = undefined;
      liveBusy = false;
      if (!failed && aircraftVisible() && (needsDrain || presentedRevision !== poseRevision || root.dataset.aircraftWarmMask === 'true' || (!capturePose && ((!landingDone && landingEntered) || (scrub && renderedProgress !== (flight.telemetryReady ? progress : Math.min(progress, .61))))))) request();
      else if (!failed && !visible) prepareInBackground();
    }
  }
  function fail(error) {
    if (background) window.V2TransportPriority?.settle('airframe', error);
    failed = true; loading = false;
    if (background) publishAircraftPriority();
    if (background) { interruptBackground('unavailable'); root.dataset.aircraftBackgroundState = 'unavailable'; }
    fallback('unavailable'); atmosphere?.dispose(); renderer?.dispose();
    console.warn('The Skylabs story is showing its photographs.', error);
  }
  async function ensureTelemetry() {
    if (!flight || flight.telemetryReady || failed || !allowed()) return;
    if (telemetryLoading) return telemetryTask;
    telemetryLoading = true;
    return telemetryTask = (async () => {
    try {
      if (!window.V2HeroAssets) await script('/assets/v2-hero-assets.js?v=' + (root.hasAttribute('data-aircraft-smooth') ? 'load-20261012' : 'startup-20261007'));
      if (background) {
        await window.V2HeroAssets.prefetch('telemetry');
        if (!await backgroundCPU('telemetry-load')) return;
      }
      const telemetry = await window.V2HeroAssets.load('telemetry');
      if (failed || (background && !await backgroundCPU('telemetry-attach'))) return;
      flight.attachTelemetry(telemetry); if (background) revisePose(); root.dataset.aircraftTelemetryReady = 'true';
      root.dataset.aircraftTelemetryComponents = String(flight.statistics.telemetryComponents); updateScroll(); request();
      if (new URLSearchParams(location.search).has('capture')) {
        window.__v3Aircraft = { scene, renderer, camera, flight, atmosphere, renderFrame: background ? () => { revisePose(true); request(); } : renderFrame,
          seekLanding(value) { endLanding(); capturePose = { type: 'landing', value }; if (background) revisePose(true); else chapter(0); request(); },
          seekProgress(value) { endLanding(); capturePose = { type: 'progress', value }; if (background) revisePose(true); else chapter(chapterAt(value)); request(); },
          resume() { capturePose = null; if (background) revisePose(true); updateScroll(); request(); }
        };
      }
    } catch (error) { fail(error); }
    finally { telemetryLoading = false; }
    })();
  }
  function prepareAirframe(promote = false) {
    const transfer = () => {
      if (!airframeTransport) {
        airframeTransport = window.V3AircraftScene.prefetch().then(value => {
          if (background) root.dataset.aircraftTransportState = 'ready';
          return value;
        });
        if (background && window.V2TransportPriority?.hasAircraftPriority()) {
          // New helpers report raw bytes. Older/source fallbacks remain safe:
          // their prefetch settlement or the bounded coordinator releases it.
          const bytes = window.V3AircraftScene.whenTransferSettled?.() || airframeTransport;
          bytes.then(result => window.V2TransportPriority.settle('airframe', result?.state === 'unavailable'), error => window.V2TransportPriority.settle('airframe', error));
        }
      }
      return airframeTransport;
    };
    // A direct aircraft visit cannot wait for the hero bytes it is holding.
    if (!background || promote || window.V2TransportPriority?.hasAircraftPriority()) {
      releaseTransport?.();
      if (background && !airframeTransport) root.dataset.aircraftTransportState = 'loading';
      return transfer();
    }
    return transportGate ||= new Promise(resolve => {
      root.dataset.aircraftTransportState = 'waiting-hero-bytes';
      // Prioritize all three visible boards, not one privileged board. A
      // stalled transfer cannot postpone background content indefinitely.
      const timer = setTimeout(resolve, 4500);
      releaseTransport = () => { clearTimeout(timer); resolve(); };
      (async () => {
        if (!window.V2HeroAssets) await script('/assets/v2-hero-assets.js?v=load-20261012');
        await Promise.all(['tramtrace', 'telemetry', 'pi'].map(name => window.V2HeroAssets.whenTransferSettled(name)));
      })().then(releaseTransport, releaseTransport);
    }).then(() => {
      if (!allowed() || failed) return null;
      if (!airframeTransport) root.dataset.aircraftTransportState = 'loading';
      return transfer();
    });
  }
  function prepareSources() {
    return sourcePreparation ||= Promise.all([
        (async () => { if (!window.THREE) await script('/assets/vendor/three.min.js'); if (!window.THREE.GLTFLoader) await script('/assets/vendor/GLTFLoader.js'); })(),
        (async () => {
          if (!window.V3AircraftScene) await script('/assets/v3-aircraft-scene.js?v=' + (background ? 'load-20261012' : 'aircraft-transition-20261010'));
          if (background && !window.MeshoptDecoder) await script('/assets/vendor/meshopt_decoder.js').catch(() => {});
          prepareAirframe(!background || nearStory()).catch(() => {});
        })(),
        (async () => { if (!window.V2HeroEnvironment) await script('/assets/v2-hero-environment.js?v=' + (background ? 'load-20261012' : 'product-20261007')); window.V2HeroEnvironment.prefetch().catch(() => {}); })(),
        script('/assets/v3-aircraft-atmosphere.js?v=aircraft-refine-20261010').catch(() => {}),
        detailed ? script('/assets/v3-aircraft-electronics.js?v=aircraft-refine-20261010') : Promise.resolve(),
        background ? script('/assets/v2-gpu-preparation.js?v=paced-20261011') : Promise.resolve()
      ]);
  }
  async function initialize() {
    if (!allowed() || failed || !preparationEligible()) return;
    enable();
    if (ready) { layout(); request(); ensureTelemetry(); return; }
    if (loading) return;
    loading = true; root.dataset.aircraftState = 'loading';
    try {
      await prepareSources();
      prepareAirframe(true).catch(() => {});
      if (failed || !allowed()) { loading = false; return; }
      if (background) {
        // Download bytes concurrently. Wait before parsing/reconstruction, not
        // before transport, so Selected's priority does not serialize network.
        await Promise.all([prepareAirframe(true), window.V2HeroEnvironment.prefetch().catch(() => {})]);
        if (!await backgroundCPU('renderer')) return;
      }
      const T = window.THREE;
      renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.autoClear = false;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width < 761 ? 1.35 : 1.65));
      window.V2ProductStudio.configureRenderer(renderer, T); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
      scene = new T.Scene(); camera = new T.PerspectiveCamera(32, width / height, .002, 80);
      atmosphere = window.V3AircraftAtmosphere?.create(T, { detailed });
      key = window.V2ProductStudio.createLights(T, scene).key;
      key.userData.direction.set(-3, 8, 5).normalize();
      if (background && !await backgroundCPU('airframe-load')) return;
      const [aircraft, environment] = await Promise.all([window.V3AircraftScene.load(T), window.V2HeroEnvironment.load(T).catch(background ? async error => {
        if (!await backgroundCPU('environment-fallback')) throw error;
        return window.V2ProductStudio.createEnvironment(T, renderer).texture;
      } : () => window.V2ProductStudio.createEnvironment(T, renderer).texture)]);
      if (failed || (background && !await backgroundCPU('scene-create'))) return;
      scene.environment = environment;
      flight = window.V3AircraftScene.create(T, aircraft, null, { detailed }); scene.add(flight.group);
      studioGround = new T.Color('#101210').convertSRGBToLinear();
      airfieldGround = new T.Color('#18232b').convertSRGBToLinear();
      studioFog = new T.Color('#101210'); airfieldFog = new T.Color('#25323e');
      groundUniforms = { sky: { value: 0 }, near: { value: 4.5 }, far: { value: 9 } };
      floorMaterial = new T.MeshBasicMaterial({ color: studioGround, toneMapped: false, transparent: true });
      floorMaterial.onBeforeCompile = shader => {
        shader.uniforms.uSky = groundUniforms.sky;
        shader.uniforms.uGroundNear = groundUniforms.near;
        shader.uniforms.uGroundFar = groundUniforms.far;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGroundDepth;').replace('#include <project_vertex>', '#include <project_vertex>\nvGroundDepth = -mvPosition.z;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGroundDepth; uniform float uSky; uniform float uGroundNear; uniform float uGroundFar;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= uSky > 0.0 ? 1.0 - smoothstep(uGroundNear, uGroundFar, vGroundDepth) : 1.0;');
        if (detailed) window.V3AircraftAtmosphere?.detailGround?.(shader);
      };
      const floorGeometry = new T.PlaneGeometry(100, 100);
      const floor = new T.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -.0007; scene.add(floor);
      const contactShadow = new T.Mesh(floorGeometry, new T.ShadowMaterial({ color: 0x000000, opacity: .35, transparent: true, depthWrite: false }));
      contactShadow.rotation.x = -Math.PI / 2; contactShadow.position.y = -.0005; contactShadow.receiveShadow = true; scene.add(contactShadow);
      // Three r128 blends fog after output encoding; this color therefore
      // matches the CSS background directly rather than being linearized.
      scene.fog = new T.Fog(studioFog.clone(), 9, 28);
      shadowBox = new T.Box3(); boardBox = new T.Box3(); shadowCentre = new T.Vector3(); corner = new T.Vector3();
      Object.entries(flight.statistics).forEach(([name, value]) => { root.dataset['aircraft' + name[0].toUpperCase() + name.slice(1)] = String(value); });
      ready = true; loading = false;
      if (!allowed()) { fallback(); return; }
      layout(); request();
      // The large airframe finishes transport before the small avionics pack
      // starts, leaving the first landing frame uncontested on a cold network.
      ensureTelemetry();
      if (background && !visible) prepareInBackground();
    } catch (error) { fail(error); }
  }
  function warmFallbackImages() {
    if (!background) return;
    const images = [...root.querySelectorAll('img')];
    if (allowed()) {
      const source = posterSources.find(item => matchMedia(item.media).matches) || poster;
      for (const pose of ['approach', 'stopped']) {
        const image = new Image(); image.decoding = 'async'; image.fetchPriority = 'low';
        image.src = source.dataset[pose]; images.push(image);
      }
    }
    Promise.all(images.map(image => {
      image.loading = 'eager';
      return image.decode?.().then(() => true).catch(() => false) || Promise.resolve(image.complete && image.naturalWidth > 0);
    })).then(results => { root.dataset.aircraftImagesReady = String(results.every(Boolean)); });
  }
  const idleTurn = signal => new Promise(resolve => {
    // A finite paint/input opportunity separates costly phases. It is never
    // used as a readiness poll, and interruption releases pending callbacks.
    let raf, timer, idle, finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      cancelAnimationFrame(raf); clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      signal?.removeEventListener('abort', finish); resolve();
    };
    if (signal?.aborted) { finish(); return; }
    signal?.addEventListener('abort', finish, { once: true });
    raf = requestAnimationFrame(() => { timer = setTimeout(() => {
      if ('requestIdleCallback' in window) idle = requestIdleCallback(finish, { timeout: 900 });
      else finish();
    }, 0); });
  });
  const foregroundSettled = signal => new Promise(resolve => {
    if (ambient) {
      if (signal?.aborted || visible || !heroForegroundBusy()) { resolve(); return; }
      const finish = () => { removeEventListener('v2:hero-foreground', check); signal?.removeEventListener('abort', finish); resolve(); };
      const check = () => { if (visible || !heroForegroundBusy()) finish(); };
      addEventListener('v2:hero-foreground', check); signal?.addEventListener('abort', finish, { once: true });
      check(); return;
    }
    const hero = document.querySelector('[data-assembly]');
    if (signal?.aborted || !hero || hero.dataset.assemblyModelsSettled === '3' || ['unavailable', 'static'].includes(hero.dataset.assemblyState)) { resolve(); return; }
    let observer, finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      clearTimeout(timer); observer?.disconnect(); signal?.removeEventListener('abort', finish); resolve();
    };
    const timer = setTimeout(finish, 12000);
    signal?.addEventListener('abort', finish, { once: true });
    observer = new MutationObserver(() => {
      if (hero.dataset.assemblyModelsSettled === '3' || ['unavailable', 'static'].includes(hero.dataset.assemblyState)) finish();
    });
    observer.observe(hero, { attributes: true, attributeFilter: ['data-assembly-models-settled', 'data-assembly-state'] });
  });
  const selectedSettled = signal => new Promise(resolve => {
    const selected = window.V2SelectedWork;
    const pending = selected?.backgroundSettled;
    const outcome = selected?.preparationState?.();
    if (['ready', 'static', 'unavailable'].includes(outcome)) { root.dataset.aircraftSelectedGate = outcome; resolve(); return; }
    if (selected?.isDeferred?.() || (selected?.isPreparing?.() === false && !selected.isVisible?.())) { root.dataset.aircraftSelectedGate = 'deferred'; resolve(); return; }
    if (!pending) { root.dataset.aircraftSelectedGate = 'absent'; resolve(); return; }
    if (signal?.aborted) { resolve(); return; }
    // This optional one-time order never overrides actual visible priority.
    root.dataset.aircraftSelectedGate = 'waiting';
    let finished = false;
    const abort = () => finish('canceled');
    const finish = state => {
      if (finished) return; finished = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      root.dataset.aircraftSelectedGate = state; resolve();
    };
    const timer = setTimeout(() => finish('timeout'), 18000);
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(pending).then(result => finish(result?.state || 'settled'), () => finish('unavailable'));
  });
  async function gpuComplete(valid, abort, stageName, live = false) {
    if (!live) root.dataset.aircraftPreparationStage = stageName;
    root.dataset.aircraftGPUPhase = live ? stageName : 'warm-' + stageName;
    gpuAbort = abort; root.dataset.aircraftGPUPending = 'true';
    let result;
    try {
      result = await window.V2GPUPreparation.wait(renderer, { signal: abort.signal, valid, timeoutMs: 12000, pollMs: live ? 4 : 16 });
    } finally {
      if (gpuAbort === abort) gpuAbort = undefined;
      root.dataset.aircraftGPUPending = 'false';
    }
    root.dataset.aircraftGPUCompletion = result.state;
    root.dataset.aircraftGPUWaitMs = result.waitMs.toFixed(1);
    if (stageName === 'drain') {
      root.dataset.aircraftInitialDrainState = result.state;
      root.dataset.aircraftInitialDrainMs = result.waitMs.toFixed(1);
    }
    // WebGL1 gets finite staged yields; they are explicitly not GPU completion
    // evidence. A timeout/lost context must never certify background readiness.
    if (result.state === 'unsupported' && valid()) await idleTurn(abort.signal);
    return result;
  }
  function recordPreparation(measurement) {
    if (preparationMeasurements.length > 31) preparationMeasurements.shift();
    preparationMeasurements.push(measurement);
    root.dataset.aircraftPreparationMeasurements = JSON.stringify(preparationMeasurements);
  }
  async function prepareInBackground() {
    if (!background || liveBusy || backgroundBusy || backgroundDone || failed || !allowed() || visible || document.hidden || !activePage) return;
    if (!preparationEligible()) { root.dataset.aircraftBackgroundState = 'deferred-distance'; return; }
    if (heroForegroundBusy()) { root.dataset.aircraftBackgroundState = 'paused-hero'; return; }
    if (selectedVisible()) { root.dataset.aircraftBackgroundState = 'paused-selected'; return; }
    backgroundBusy = true;
    // An early visit may already have revealed the canvas. Hide it immediately
    // before any resumed temporary pose, keeping the poster until a live draw.
    maskCanvas();
    const generation = ++warmGeneration, abort = new AbortController(); warmAbort = abort;
    const current = () => generation === warmGeneration && !abort.signal.aborted && !visible && !document.hidden && activePage && allowed() && !failed && !selectedVisible() && !heroForegroundBusy() && preparationEligible();
    root.dataset.aircraftBackgroundState = 'warming';
    root.dataset.aircraftBackgroundStartedMs ||= performance.now().toFixed(1);
    try {
      await prepareSources();
      if (!current()) return;
      await foregroundSettled(abort.signal);
      if (!current()) return;
      await selectedSettled(abort.signal);
      if (!await backgroundCPU('initialize', current, abort.signal)) return;
      await initialize();
      if (!current() || !ready) return;
      await ensureTelemetry();
      if (!current() || !flight?.telemetryReady) return;
      // Drain previous live/initialization/canceled-warm commands in this exact
      // context before submitting anything else. Canceling a fence cannot
      // cancel work that the driver already received.
      if (!await backgroundCPU('drain', current, abort.signal)) return;
      let result = await gpuComplete(current, abort, 'drain');
      if (!current() || result.state === 'canceled') return;
      if (result.state === 'timeout' || result.state === 'lost') throw new Error('Aircraft GPU preparation ' + result.state);
      needsDrain = false;
      for (const name of ['progress-1', 'landing-0']) {
        if (completedWarmPoses.has(name)) continue;
        if (!await backgroundCPU(name, current, abort.signal)) return;
        root.dataset.aircraftPreparationStage = name;
        const started = performance.now(), ratio = pixelRatio(true);
        const selectedBounds = document.querySelector('[data-selected-work]')?.getBoundingClientRect();
        const selectedInViewport = Boolean(selectedBounds && selectedBounds.top < innerHeight && selectedBounds.bottom > 0);
        drawPose(name === 'progress-1' ? flight.setProgress(1) : flight.setLanding(0));
        needsDrain = true;
        root.dataset.aircraftWarmFrames = String(Number(root.dataset.aircraftWarmFrames || 0) + 1);
        const measurement = { name, submittedMs: started, cpuMs: performance.now() - started, width: canvas.width, height: canvas.height,
          pixelRatio: ratio, selectedVisible: selectedVisible(), selectedInViewport, completed: false, gpu: { state: 'pending', waitMs: 0, polls: 0 } };
        // Submission telemetry is visible while its real fence is pending.
        recordPreparation(measurement);
        result = await gpuComplete(current, abort, name);
        measurement.gpu = result;
        measurement.completed = current() && (result.state === 'complete' || result.state === 'unsupported');
        measurement.completedMs = performance.now(); measurement.gpuCompleted = result.state === 'complete';
        root.dataset.aircraftPreparationMeasurements = JSON.stringify(preparationMeasurements);
        if (!measurement.completed) {
          if (result.state === 'timeout' || result.state === 'lost') throw new Error('Aircraft GPU preparation ' + result.state);
          return;
        }
        needsDrain = false;
        completedWarmPoses.add(name); root.dataset.aircraftWarmPosesCompleted = String(completedWarmPoses.size);
      }
      if (!current()) return;
      backgroundDone = true;
      root.dataset.aircraftGPUCompletionEvidence = result.state === 'complete' ? 'own-context-fence' : 'unsupported-staged-yield';
      root.dataset.aircraftBackgroundReady = 'true';
      root.dataset.aircraftBackgroundReadyMs = performance.now().toFixed(1);
      root.dataset.aircraftBackgroundState = 'ready'; root.dataset.aircraftPreparationStage = 'complete';
      root.dataset.aircraftState = 'prepared';
    } catch (error) {
      root.dataset.aircraftBackgroundState = 'unavailable'; fail(error);
    } finally {
      abort.abort(); if (warmAbort === abort) warmAbort = undefined;
      backgroundBusy = false;
      // Only an invalidated generation gets a one-shot resume. Priority and
      // lifecycle gates are event-driven, never an offscreen retry loop.
      if (aircraftVisible()) request();
      else if (generation !== warmGeneration && !backgroundDone && !loading && !failed && !visible && !document.hidden && activePage && allowed() && !selectedVisible() && !heroForegroundBusy() && preparationEligible()) setTimeout(prepareInBackground, 0);
    }
  }
  skip?.addEventListener('click', endLanding);
  links.forEach((link, index) => {
    link.addEventListener('click', () => { if (background) { preparationIntent = true; wakeBackground(); initialize(); } endLanding(); });
    if (background) link.addEventListener('focus', () => { preparationIntent = true; wakeBackground(); prepareInBackground(); });
    link.addEventListener('keydown', event => {
      const target = event.key === 'ArrowRight' ? (index + 1) % links.length : event.key === 'ArrowLeft' ? (index + links.length - 1) % links.length : event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : null;
      if (target !== null) { event.preventDefault(); links[target].focus(); }
    });
  });
  const interruptLanding = () => { if (landingEntered) endLanding(); };
  root.addEventListener('wheel', () => { directScrub = false; interruptLanding(); }, { passive: true });
  root.addEventListener('touchmove', () => { directScrub = true; if (background) revisePose(); interruptLanding(); }, { passive: true });
  addEventListener('keydown', event => { if (['Escape', 'PageDown', 'ArrowDown', ' '].includes(event.key) && track && visible) interruptLanding(); });
  addEventListener('scroll', updateScroll, { passive: true }); addEventListener('resize', layout, { passive: true });
  if ('ResizeObserver' in window) { const resize = new ResizeObserver(layout); resize.observe(stage); if (ambient) resize.observe(root.querySelector('[data-aircraft-copy]')); }
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    if (background) {
      // Recompute actual bounds in one path. Repeated observer delivery must
      // not invalidate a live batch when visibility did not really change.
      updateScroll();
      if (visible) request();
      else {
        if (landingEntered) endLanding();
        cancelAnimationFrame(frame); frame = 0; previousTime = 0; scrubTime = 0; renderedProgress = progress;
        prepareInBackground();
      }
      return;
    }
    visible = entries[0].isIntersecting;
    if (visible) { updateScroll(); request(); } else { if (landingEntered) endLanding(); cancelAnimationFrame(frame); frame = 0; previousTime = 0; scrubTime = 0; renderedProgress = progress; }
  }).observe(root);
  document.addEventListener('visibilitychange', () => {
    if (background) {
      if (document.hidden) { pauseLandingClock(); interruptLive(); interruptBackground('paused-hidden'); }
      publishAircraftPriority();
    }
    previousTime = 0; scrubTime = 0; renderedProgress = progress;
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else { wakeBackground(); request(); if (background) prepareInBackground(); }
  });
  addEventListener('pagehide', () => {
    if (background) { pauseLandingClock(); interruptLive(); interruptBackground('paused-hidden'); }
    activePage = false; if (background) publishAircraftPriority();
    scrubTime = 0; renderedProgress = progress; if (background) previousTime = 0; cancelAnimationFrame(frame); frame = 0;
  });
  addEventListener('pageshow', () => { activePage = true; previousTime = 0; scrubTime = 0; renderedProgress = progress; wakeBackground(); updateScroll(); if (background) publishAircraftPriority(); request(); if (background) prepareInBackground(); });
  const storyLead = 420;
  const nearStory = () => { const bounds = root.getBoundingClientRect(); return bounds.top < innerHeight + storyLead && bounds.bottom > -storyLead; };
  const start = () => {
    if (failed) return;
    if (!allowed()) { if (background) { publishAircraftPriority(); interruptBackground('paused-preferences'); } fallback(); return; }
    if (background) wakeBackground();
    // Reserve the scroll track immediately. v2 prepares in the background;
    // routes without the opt-in retain viewport-deferred loading.
    enable();
    if (background) {
      publishAircraftPriority();
      // Proximity starts transport, never bypasses Selected's CPU/GPU turn.
      prepareSources().catch(fail);
      if (visible) initialize();
      else { if (!ready && !loading) root.dataset.aircraftState = 'waiting'; prepareInBackground(); }
    } else {
      if (!deferred || nearStory()) initialize();
      else if (!ready && !loading) root.dataset.aircraftState = 'waiting';
    }
  };
  if (deferred) {
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && allowed()) { if (background) { updateScroll(); if (visible) initialize(); else prepareInBackground(); } else initialize(); }
    }, { rootMargin: `${storyLead}px 0px` }).observe(root);
    else addEventListener('scroll', () => { if (nearStory() && allowed()) { if (background && !visible) prepareInBackground(); else initialize(); } }, { passive: true });
    addEventListener('load', layout, { once: true });
  }
  if (background) {
    window.V2AircraftPreparation = Object.freeze({ isVisible: aircraftVisible });
    root.dataset.aircraftFrames = '0'; root.dataset.aircraftSubmittedFrames = '0'; root.dataset.aircraftCompletedFrames = '0';
    root.dataset.aircraftPoseRevision = '0'; root.dataset.aircraftLayoutRevision = '0';
    root.dataset.aircraftWarmFrames = '0'; root.dataset.aircraftWarmPosesCompleted = '0';
    root.dataset.aircraftBackgroundReady = 'false'; root.dataset.aircraftGPUPending = 'false';
    if (ambient) addEventListener('v2:hero-foreground', () => {
      const busy = heroForegroundBusy(); root.dataset.aircraftHeroPriority = String(busy);
      if (busy && !visible) interruptBackground('paused-hero');
      else { wakeBackground(); if (!visible) prepareInBackground(); }
    });
    addEventListener('v2:selected-priority', () => {
      const active = selectedVisible(); root.dataset.aircraftSelectedPriority = String(active);
      if (active && !visible) interruptBackground('paused-selected');
      else { wakeBackground(); if (!visible) prepareInBackground(); }
    });
  }
  const preference = start;
  reduced.addEventListener('change', preference); short.addEventListener('change', preference); navigator.connection?.addEventListener?.('change', preference);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('WebGL context unavailable')); });
  start();
  warmFallbackImages();
})();
