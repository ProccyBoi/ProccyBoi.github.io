/* Rendering lifecycle shared by the independent PCB engines. */
window.PortfolioExplorer = {
  fitDistance(THREE, object, camera, target, yaw, pitch, margin = 0.84) {
    const direction = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3().crossVectors(direction, right);
    const point = new THREE.Vector3();
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * margin;
    let distance = camera.near * 2;
    object.updateMatrixWorld(true);
    object.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      for (let corner = 0; corner < 8; corner++) {
        point.set(corner & 1 ? bounds.max.x : bounds.min.x, corner & 2 ? bounds.max.y : bounds.min.y, corner & 4 ? bounds.max.z : bounds.min.z).applyMatrix4(mesh.matrixWorld).sub(target);
        const depth = point.dot(direction);
        distance = Math.max(distance, depth + Math.abs(point.dot(right)) / (tangent * camera.aspect), depth + Math.abs(point.dot(up)) / tangent);
      }
    });
    return distance;
  },

  start(render, element, { demand = false } = {}) {
    let frame = 0;
    let visible = false;
    let lost = false;
    let frames = 0;
    const root = element.closest('[data-pcb-object], [data-framework-inspector], [data-dual-usb-inspector], [data-coaster-inspector]') || element;
    if (demand) root.dataset.explorerMounted = 'true';
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const tick = () => {
      frame = 0;
      if (!visible || document.hidden || lost) return;
      const moving = draw();
      if (!demand || moving) frame = requestAnimationFrame(tick);
    };
    const draw = () => {
      const moving = render() !== false;
      if (demand) {
        root.dataset.explorerFrames = String(++frames);
        root.dataset.explorerMotion = moving ? 'transition' : 'idle';
      }
      return moving;
    };
    const resume = () => {
      if (visible && !document.hidden && !lost && !frame) {
        if (demand) root.dataset.explorerMotion = 'rendering';
        frame = requestAnimationFrame(tick);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) resume();
      else { stop(); if (demand) root.dataset.explorerMotion = 'paused'; }
    }, { rootMargin: "160px" });
    observer.observe(element);
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : resume());
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", resume);
    if (demand) {
      const canvas = element.matches('canvas') ? element : element.querySelector('canvas');
      canvas?.addEventListener('webglcontextlost', () => { lost = true; stop(); root.dataset.explorerMotion = 'unavailable'; });
    }
    // Initialise one complete frame, including canvas dimensions and readouts.
    draw();
    return resume;
  },

  createRenderer(THREE, options) {
    try {
      return new THREE.WebGLRenderer(options);
    } catch {
      const canvas = options.canvas;
      const stage = canvas.parentElement;
      const root = canvas.closest("[data-pcb-object], [data-framework-inspector], [data-dual-usb-inspector], [data-coaster-inspector]") || stage;
      root.dataset.explorerUnavailable = "true";
      canvas.hidden = true;
      canvas.setAttribute("tabindex", "-1");
      canvas.setAttribute("aria-hidden", "true");
      stage.removeAttribute("tabindex");
      stage.removeAttribute("aria-label");
      // Only retire this 3D viewer; TramTrace's adjacent 2D inspector stays usable.
      root.querySelectorAll(".pcb-object-toolbar, .framework-3d-toolbar, .framework-dual-3d-toolbar, .coaster-3d-toolbar").forEach((toolbar) => {
        toolbar.querySelectorAll("button").forEach((button) => { button.disabled = true; });
        toolbar.hidden = true;
      });
      root.querySelectorAll("[data-framework-status], [data-dual-usb-status], [data-dual-usb-part], [data-coaster-status], [data-coaster-part], .pcb-object-readout, .object-drag-hint, .pcb-object-stage-label").forEach((element) => {
        element.hidden = true;
      });
      const message = document.createElement("p");
      message.className = "explorer-unavailable";
      message.setAttribute("role", "status");
      message.textContent = "The 3D view is unavailable in this browser. You can still read the case study and explore the hardware photographs.";
      stage.append(message);
      return null;
    }
  },
};
