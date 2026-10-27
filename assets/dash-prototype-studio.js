/* Finite assembly choreography using the archived Dash PCB source geometry. */
(() => {
  'use strict';
  const requests = new Map();
  const script = src => {
    if (!requests.has(src)) requests.set(src, new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = src;
      element.onload = resolve;
      element.onerror = () => { requests.delete(src); element.remove(); reject(new Error('3D library unavailable')); };
      document.head.appendChild(element);
    }));
    return requests.get(src);
  };
  const libraries = async () => {
    if (!window.THREE) await script('/assets/vendor/three.min.js');
    if (!window.THREE.GLTFLoader) await script('/assets/vendor/GLTFLoader.js');
    return window.THREE;
  };
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };

  document.querySelectorAll('[data-dash-assembly]').forEach(root => {
    const find = name => root.querySelector(`[data-assembly-${name}]`);
    const canvas = find('canvas'), stage = find('stage'), poster = find('poster');
    const start = find('start'), controls = find('controls'), rail = find('rail');
    const play = find('play'), slider = find('scrub'), amount = find('amount');
    const status = find('status'), live = find('live'), detail = find('detail');
    const list = find('groups'), fallback = find('fallback');
    if (![canvas, stage, poster, start, controls, rail, play, slider, amount, status, live, detail, list, fallback].every(Boolean)) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = !('IntersectionObserver' in window), started = false, disposed = false;
    let renderer, scene, camera, environment, groupData = [], T;
    let frame = 0, frameCount = 0, lastTime = null, progress = 0;
    let playing = false, cinematic = true, activeIndex = -1, dirty = true;
    let transition = null;
    let yaw = 35, pitch = 46, baseSpan = 50, width = 0, height = 0;
    const animationDuration = 6200;
    let drag = null, observer, resizeObserver;
    const presets = { iso: [35, 46], top: [0, 89.8], bottom: [0, -89.8] };
    const announce = message => { live.textContent = message; };
    const motionState = () => {
      const moving = playing || transition;
      root.dataset.assemblyMotion = moving ? visible && !document.hidden ? 'playing' : 'paused' : progress > 0 && progress < 1 ? 'paused' : 'idle';
      play.textContent = moving ? 'Pause' : progress >= 1 ? 'Replay assembly' : progress > 0 ? 'Resume' : 'Play assembly';
      play.setAttribute('aria-label', moving ? 'Pause assembly animation' : progress >= 1 ? 'Replay assembly animation' : 'Play assembly animation');
    };
    const cancelFrame = () => { cancelAnimationFrame(frame); frame = 0; lastTime = null; };
    const requestRender = () => {
      dirty = true;
      if (root.dataset.dashAssemblyState === 'ready' && renderer && !disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(render);
    };
    const stop = () => { playing = false; transition = null; lastTime = null; motionState(); };
    const holdCamera = () => { if (cinematic) yaw += (1 - progress) * -14; cinematic = false; };
    const unavailable = () => {
      disposed = true;
      cancelFrame();
      root.dataset.dashAssemblyState = 'unavailable';
      root.dataset.assemblyMotion = 'idle';
      canvas.hidden = true; controls.hidden = true; rail.hidden = true;
      poster.hidden = false; start.hidden = true;
      fallback.hidden = false;
      fallback.textContent = 'The 3D studio is unavailable here. The photograph shows the original prototype PCB.';
      status.textContent = 'Prototype photograph';
      announce('3D assembly unavailable. The original prototype photograph remains available.');
      observer?.disconnect(); resizeObserver?.disconnect();
      scene?.traverse(node => {
        node.geometry?.dispose();
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => { material?.map?.dispose(); material?.dispose(); });
      });
      environment?.dispose();
      renderer?.dispose();
    };

    function syncProgress() {
      const percent = Math.round(progress * 100);
      slider.value = String(percent);
      slider.setAttribute('aria-valuetext', `${percent} percent assembled`);
      amount.textContent = `${percent}%`;
      root.dataset.assemblyProgress = String(percent);
      const next = progress >= 1 ? groupData.length - 1 : Math.min(groupData.length - 1, Math.max(0, Math.floor(progress * groupData.length)));
      if (next !== activeIndex) {
        activeIndex = next;
        groupData.forEach((group, index) => {
          group.button.setAttribute('aria-pressed', String(index === activeIndex));
          group.button.dataset.complete = String(progress >= group.end);
        });
        if (groupData[next]) detail.textContent = groupData[next].description;
      }
      status.textContent = progress >= 1 ? 'Assembly complete' : progress <= 0 ? 'Components separated' : `${percent}% assembled`;
    }

    function positionParts() {
      const total = new T.Box3();
      groupData.forEach(group => {
        const settled = group.fixed ? 1 : ease((progress - group.begin) / (group.end - group.begin));
        const lift = group.lift * (1 - settled);
        group.nodes.forEach(({ node, position, box, direction }) => {
          const offset = lift * direction;
          node.position.copy(position); node.position.y += offset;
          total.union(box.clone().translate(new T.Vector3(0, offset, 0)));
        });
      });
      return total;
    }

    function fitCamera(box) {
      const center = box.getCenter(new T.Vector3());
      const a = T.MathUtils.degToRad(yaw + (cinematic ? (1 - progress) * -14 : 0));
      const p = T.MathUtils.degToRad(pitch);
      const distance = baseSpan * 6;
      camera.position.set(center.x + distance * Math.sin(a) * Math.cos(p), center.y + distance * Math.sin(p), center.z + distance * Math.cos(a) * Math.cos(p));
      camera.lookAt(center);
      camera.updateMatrixWorld(true);
      const points = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      const projected = new T.Box3().setFromPoints(points).getSize(new T.Vector3());
      const aspect = width / Math.max(1, height);
      const frameHeight = Math.max(projected.y, projected.x / aspect, baseSpan * .38) * 1.23;
      camera.top = frameHeight / 2; camera.bottom = -frameHeight / 2;
      camera.right = frameHeight * aspect / 2; camera.left = -camera.right;
      camera.updateProjectionMatrix();
    }

    function render(timestamp) {
      frame = 0;
      if (disposed || !visible || document.hidden || !renderer) { lastTime = null; motionState(); return; }
      if (transition) {
        if (lastTime !== null) transition.elapsed += Math.max(0, timestamp - lastTime);
        lastTime = timestamp;
        const fraction = clamp(transition.elapsed / transition.duration);
        const t = ease(fraction);
        if (transition.kind === 'progress') progress = T.MathUtils.lerp(transition.from, transition.to, t);
        else {
          yaw = T.MathUtils.lerp(transition.from.yaw, transition.to.yaw, t);
          pitch = T.MathUtils.lerp(transition.from.pitch, transition.to.pitch, t);
        }
        dirty = true;
        if (fraction >= 1) { const message = transition.message; transition = null; lastTime = null; if (message) announce(message); }
      } else if (playing) {
        if (lastTime !== null) progress = Math.min(1, progress + Math.max(0, timestamp - lastTime) / animationDuration);
        lastTime = timestamp;
        dirty = true;
        if (progress >= 1) { stop(); announce('Assembly complete. Drag to inspect, choose a view, or replay the sequence.'); }
      }
      if (dirty) {
        dirty = false;
        fitCamera(positionParts());
        renderer.render(scene, camera);
        root.dataset.assemblyFrames = String(++frameCount);
        syncProgress();
      }
      motionState();
      if (playing || transition) frame = requestAnimationFrame(render);
    }

    function resize() {
      if (!renderer || disposed) return;
      const nextWidth = Math.max(1, Math.round(stage.clientWidth)), nextHeight = Math.max(1, Math.round(stage.clientHeight));
      if (width === nextWidth && height === nextHeight) return;
      width = nextWidth; height = nextHeight;
      renderer.setSize(width, height, false);
      requestRender();
    }

    function seek(value, message) {
      if (!renderer || disposed) return;
      stop(); holdCamera(); progress = clamp(value);
      syncProgress(); motionState(); requestRender();
      if (message) announce(message);
    }

    function beginPlayback() {
      if (!renderer || disposed) return;
      if (preference.matches) {
        seek(1, 'Assembly shown without animation because reduced motion is enabled.');
        return;
      }
      if (progress >= 1) progress = 0;
      transition = null;
      cinematic = true; playing = true; lastTime = null;
      motionState(); requestRender();
      announce('Assembly animation playing. Pause or use the progress slider to inspect a stage.');
    }

    async function load() {
      if (started || disposed) return;
      started = true;
      root.dataset.dashAssemblyState = 'loading';
      start.disabled = true; start.textContent = 'Loading source geometry…';
      status.textContent = 'Loading source geometry';
      try {
        const [three, manifest] = await Promise.all([
          libraries(),
          fetch('/assets/models/dash/manifest.json').then(response => { if (!response.ok) throw new Error('Model manifest unavailable'); return response.json(); })
        ]);
        T = three;
        if (!Array.isArray(manifest.groups) || !manifest.groups.length) throw new Error('Assembly groups unavailable');
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
        renderer.outputEncoding = T.sRGBEncoding;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = .86;
        renderer.setClearColor(0x101510, 0);
        scene = new T.Scene();
        camera = new T.OrthographicCamera(-50, 50, 50, -50, .01, 10000);
        scene.add(new T.HemisphereLight(0xf5f4e7, 0x32382f, .55));
        const light = (color, intensity, position) => { const lamp = new T.DirectionalLight(color, intensity); lamp.position.set(...position); scene.add(lamp); };
        light(0xfff1dc, 1.15, [-80, 160, 90]);
        light(0xc4d6ed, .48, [100, 60, -70]);
        light(0xffffff, .3, [0, -80, 70]);
        const room = new T.Scene(); room.background = new T.Color(0x434b44);
        [[0xf8f5e9, [-6, 5, 2], [0, Math.PI / 2, 0]], [0xdde9f5, [6, 4, -2], [0, -Math.PI / 2, 0]], [0xffffff, [0, 8, 0], [Math.PI / 2, 0, 0]]].forEach(([color, position, rotation]) => {
          const panel = new T.Mesh(new T.PlaneGeometry(8, 12), new T.MeshBasicMaterial({ color, side: T.DoubleSide }));
          panel.material.color.multiplyScalar(2); panel.position.set(...position); panel.rotation.set(...rotation); room.add(panel);
        });
        const pmrem = new T.PMREMGenerator(renderer);
        environment = pmrem.fromScene(room, .06); scene.environment = environment.texture;
        room.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); }); pmrem.dispose();
        const source = await new Promise((resolve, reject) => new T.GLTFLoader().load(manifest.model, gltf => resolve(gltf.scene), undefined, reject));
        if (disposed) return;
        source.traverse(node => {
          if (!node.isMesh) return;
          node.frustumCulled = false;
          (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => { material.envMapIntensity = .5; });
        });
        scene.add(source);
        source.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(source);
        const size = bounds.getSize(new T.Vector3()); baseSpan = Math.max(size.x, size.z, size.y);
        const boardNode = source.getObjectByName('part_board');
        const boardCenterY = boardNode ? new T.Box3().setFromObject(boardNode).getCenter(new T.Vector3()).y : 0;
        groupData = manifest.groups.map((group, index) => {
          const nodes = group.nodes.map(name => source.getObjectByName(name)).filter(Boolean).map(node => {
            const box = new T.Box3().setFromObject(node);
            // Parts on the underside move away from the board, rather than
            // passing through it during the illustrative assembly sequence.
            const direction = box.getCenter(new T.Vector3()).y < boardCenterY ? -1 : 1;
            return { node, position: node.position.clone(), box, direction };
          });
          if (!nodes.length) throw new Error('Source component group missing');
          const fixed = group.id === 'board';
          const order = Math.max(0, index - 1);
          const begin = fixed ? 0 : .08 + order * .2;
          const end = fixed ? .08 : Math.min(1, begin + .48);
          const item = document.createElement('li');
          const button = document.createElement('button'); button.type = 'button'; button.className = 'dash-assembly__group';
          const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0'); number.setAttribute('aria-hidden', 'true');
          const label = document.createElement('span'); label.textContent = group.label;
          button.append(number, label); button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', () => seek(end, `${group.label} assembly stage.`));
          item.append(button); list.append(item);
          return { ...group, nodes, fixed, begin, end, lift: fixed ? 0 : baseSpan * (.38 + order * .36), button };
        });
        canvas.hidden = false; poster.hidden = true; start.hidden = true; fallback.hidden = true; controls.hidden = false; rail.hidden = false;
        root.dataset.dashAssemblyState = 'ready';
        progress = preference.matches ? 1 : 0;
        resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
        resize(); syncProgress(); motionState();
        if (!preference.matches) beginPlayback(); else requestRender();
      } catch (error) { unavailable(); }
    }

    start.hidden = false;
    start.addEventListener('click', load);
    play.addEventListener('click', () => { if (playing || transition) { stop(); announce('Assembly animation paused.'); } else beginPlayback(); });
    slider.addEventListener('input', () => seek(Number(slider.value) / 100));
    slider.addEventListener('focus', () => { if (playing || transition) { stop(); announce('Assembly animation paused for scrubbing.'); } });
    root.querySelectorAll('[data-assembly-position]').forEach(button => button.addEventListener('click', () => {
      const to = button.dataset.assemblyPosition === 'assembled' ? 1 : 0;
      const message = to ? 'Fully assembled view.' : 'Exploded component view.';
      if (preference.matches || Math.abs(progress - to) < .001) { seek(to, message); return; }
      stop(); holdCamera();
      transition = { kind: 'progress', from: progress, to, duration: 1050, elapsed: 0, message };
      motionState(); requestRender();
    }));
    root.querySelectorAll('[data-assembly-view]').forEach(button => button.addEventListener('click', () => {
      stop(); holdCamera();
      const [targetYaw, targetPitch] = presets[button.dataset.assemblyView] || presets.iso;
      if (preference.matches) { yaw = targetYaw; pitch = targetPitch; }
      else {
        const arc = ((targetYaw - yaw + 180) % 360 + 360) % 360 - 180;
        transition = { kind: 'camera', from: { yaw, pitch }, to: { yaw: yaw + arc, pitch: targetPitch }, duration: 680, elapsed: 0 };
      }
      root.dataset.assemblyView = button.dataset.assemblyView;
      root.querySelectorAll('[data-assembly-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      motionState(); requestRender(); announce(`${button.textContent.trim()} view.`);
    }));
    const customView = () => { root.dataset.assemblyView = 'custom'; root.querySelectorAll('[data-assembly-view]').forEach(button => button.setAttribute('aria-pressed', 'false')); };
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !renderer || disposed) return;
      stop(); holdCamera(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { drag = null; return; }
      yaw = drag.yaw + dx * .35;
      if (event.pointerType !== 'touch') pitch = Math.max(-89.8, Math.min(89.8, drag.pitch + dy * .25));
      customView(); requestRender();
    });
    const release = event => { if (drag?.id === event.pointerId) drag = null; };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault(); stop(); holdCamera();
      if (event.key === 'Home') {
        [yaw, pitch] = presets.iso;
        root.dataset.assemblyView = 'iso';
        root.querySelectorAll('[data-assembly-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.assemblyView === 'iso')));
      }
      else if (event.key === 'ArrowLeft') yaw -= 10;
      else if (event.key === 'ArrowRight') yaw += 10;
      else pitch = Math.max(-89.8, Math.min(89.8, pitch + (event.key === 'ArrowUp' ? 8 : -8)));
      if (event.key !== 'Home') customView();
      requestRender();
    });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); unavailable(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelFrame(); else requestRender();
      motionState();
    });
    window.addEventListener('pagehide', cancelFrame);
    window.addEventListener('pageshow', requestRender);
    preference.addEventListener('change', () => {
      if (preference.matches && renderer) seek(1, 'Reduced motion enabled. Showing the assembled PCB.');
    });
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) { if (!started) load(); else requestRender(); }
        else cancelFrame();
        motionState();
      }, { threshold: .12 });
      observer.observe(stage);
    }
    root.dataset.assemblyFrames = '0'; root.dataset.assemblyMotion = 'idle';
  });
})();
