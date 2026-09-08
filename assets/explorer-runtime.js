/* Rendering lifecycle shared by the independent PCB engines. */
window.PortfolioExplorer = {
  start(render, element) {
    let frame = 0;
    let visible = false;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const tick = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      render();
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      if (visible && !document.hidden && !frame) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) resume();
      else stop();
    }, { rootMargin: "160px" });
    observer.observe(element);
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : resume());
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", resume);
    // Initialise one complete frame, including canvas dimensions and readouts.
    render();
  },

  createRenderer(THREE, options) {
    try {
      return new THREE.WebGLRenderer(options);
    } catch {
      const canvas = options.canvas;
      const stage = canvas.parentElement;
      const root = canvas.closest("[data-pcb-object], [data-framework-inspector], [data-dual-usb-inspector]") || stage;
      root.dataset.explorerUnavailable = "true";
      canvas.hidden = true;
      canvas.setAttribute("tabindex", "-1");
      canvas.setAttribute("aria-hidden", "true");
      stage.removeAttribute("tabindex");
      stage.removeAttribute("aria-label");
      // Only retire this 3D viewer; TramTrace's adjacent 2D inspector stays usable.
      root.querySelectorAll(".pcb-object-toolbar, .framework-3d-toolbar, .framework-dual-3d-toolbar").forEach((toolbar) => {
        toolbar.querySelectorAll("button").forEach((button) => { button.disabled = true; });
        toolbar.hidden = true;
      });
      root.querySelectorAll("[data-framework-status], [data-dual-usb-status], [data-dual-usb-part], .pcb-object-readout, .object-drag-hint, .pcb-object-stage-label").forEach((element) => {
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
