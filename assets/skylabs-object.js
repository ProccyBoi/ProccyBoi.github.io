(() => {
  const inspector = document.querySelector("[data-object-inspector]");
  if (!inspector) return;

  const image = inspector.querySelector("[data-object-image]");
  const stage = inspector.querySelector("[data-object-stage]");
  const hotspots = inspector.querySelector("[data-object-hotspots]");
  const viewButtons = [...inspector.querySelectorAll("[data-object-view]")];
  const annotationToggle = inspector.querySelector("[data-annotation-toggle]");
  const rotationReset = inspector.querySelector("[data-rotation-reset]");
  const dragHint = inspector.querySelector("[data-drag-hint]");
  const angleReadout = inspector.querySelector("[data-object-angle]");
  const readout = inspector.querySelector("[data-object-readout]");
  const readoutRef = inspector.querySelector("[data-object-ref]");
  const readoutName = inspector.querySelector("[data-object-name]");
  const readoutCopy = inspector.querySelector("[data-object-copy]");
  const liveRegion = document.querySelector("[data-object-live]");

  const inspectImage = "assets/images/interactive/skylabs/skylabs-ground-inspect.webp";
  const frameCount = 24;
  const frameImage = (frame) => `assets/images/interactive/skylabs/skylabs-ground-turn-${String(frame).padStart(2, "0")}.webp`;
  const components = [
    ["J1", "USB-C receptacle", "Powers the board and carries firmware uploads and the live serial telemetry stream.", 17.7, 15.5],
    ["U4", "CH340C USB bridge", "Converts the ESP32 UART into a USB serial connection for programming and field monitoring.", 33.9, 16.4],
    ["Q1 / Q2", "Automatic upload pair", "Drives EN and IO0 from the USB bridge so new ESP32 firmware can be loaded without a manual button sequence.", 44.6, 22.2],
    ["U2", "3.3 V regulator", "Converts the incoming 5 V rail for the ESP32, LoRa module and the board's logic.", 57.8, 22.8],
    ["U3", "ESP32-WROOM-32E", "Receives packets, manages logging, serves the local dashboard and forwards live data over USB.", 25.0, 53.0],
    ["U1", "SX1262 LoRa module", "The 915 MHz radio front end. It receives aircraft telemetry and transmits short command bursts back to the aircraft.", 50.0, 54.2],
    ["J3", "microSD socket", "Stores every valid packet as CSV or as an indexed, CRC-protected SKB binary record.", 74.0, 78.2],
    ["J2", "U.FL antenna connector", "Connects the board to its external 915 MHz antenna at the edge of the RF path.", 41.2, 89.0]
  ];

  let activeButton = null;
  let activeView = "inspect";
  let currentFrame = 0;
  let dragging = false;
  let lastPointerX = 0;
  let dragRemainder = 0;
  let framesPreloaded = false;

  const announce = (message) => {
    if (liveRegion) liveRegion.textContent = message;
  };

  const clearSelection = (announceChange = false) => {
    hotspots.querySelectorAll(".object-hotspot").forEach((button) => {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
    });
    activeButton = null;
    readout.classList.add("is-empty");
    readoutRef.textContent = "BOARD";
    readoutName.textContent = "Ground-station receiver";
    readoutCopy.textContent = "Select a marker to see how radio, compute, storage and USB fit onto the same board. Select it again to clear the view.";
    if (announceChange) announce("Component selection cleared");
  };

  const selectComponent = (button, component) => {
    if (activeButton === button) {
      clearSelection(true);
      return;
    }
    hotspots.querySelectorAll(".object-hotspot").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    activeButton = button;
    readout.classList.remove("is-empty");
    readoutRef.textContent = component[0];
    readoutName.textContent = component[1];
    readoutCopy.textContent = component[2];
  };

  components.forEach((component) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-hotspot";
    button.style.left = `${component[3]}%`;
    button.style.top = `${component[4]}%`;
    button.setAttribute("aria-label", `${component[0]} ${component[1]}: ${component[2]}`);
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span>${component[0]} / ${component[1]}</span>`;
    button.addEventListener("click", () => selectComponent(button, component));
    hotspots.append(button);
  });

  const preloadFrames = () => {
    if (framesPreloaded) return;
    framesPreloaded = true;
    const load = () => {
      for (let frame = 0; frame < frameCount; frame += 1) {
        const preload = new Image();
        preload.src = frameImage(frame);
      }
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 1200 });
    else window.setTimeout(load, 120);
  };

  const showFrame = (frame, announceChange = false) => {
    currentFrame = (frame + frameCount) % frameCount;
    image.src = frameImage(currentFrame);
    const angle = currentFrame * 15;
    angleReadout.textContent = `${String(angle).padStart(3, "0")}\u00b0`;
    if (announceChange) announce(`Board angle ${angle} degrees`);
  };

  const setView = (view) => {
    if (!["inspect", "rotate"].includes(view)) return;
    activeView = view;
    inspector.dataset.view = view;
    viewButtons.forEach((button) => {
      const active = button.dataset.objectView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const rotating = view === "rotate";
    annotationToggle.hidden = rotating;
    rotationReset.hidden = !rotating;
    dragHint.hidden = !rotating;
    angleReadout.hidden = !rotating;
    if (rotating) {
      preloadFrames();
      showFrame(currentFrame);
      image.alt = "Rotatable KiCad rendering of the assembled blue Skylabs ground-station PCB";
      stage.setAttribute("aria-label", "Rotatable Skylabs ground-station board. Drag left or right, or use the arrow keys.");
    } else {
      image.src = inspectImage;
      image.alt = "KiCad rendering of the assembled blue Skylabs ground-station PCB";
      stage.setAttribute("aria-label", "Skylabs ground-station board with selectable component markers.");
    }
  };

  viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.objectView)));

  annotationToggle.addEventListener("click", () => {
    const visible = inspector.dataset.annotations !== "hidden";
    inspector.dataset.annotations = visible ? "hidden" : "visible";
    annotationToggle.textContent = visible ? "Show annotations" : "Hide annotations";
    annotationToggle.setAttribute("aria-pressed", String(!visible));
    announce(visible ? "Component annotations hidden" : "Component annotations shown");
  });

  rotationReset.addEventListener("click", () => showFrame(0, true));

  stage.addEventListener("pointerdown", (event) => {
    if (activeView !== "rotate") return;
    dragging = true;
    lastPointerX = event.clientX;
    dragRemainder = 0;
    stage.classList.add("is-dragging");
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener("pointermove", (event) => {
    if (!dragging || activeView !== "rotate") return;
    const delta = event.clientX - lastPointerX;
    lastPointerX = event.clientX;
    dragRemainder += delta;
    const frameDelta = Math.trunc(dragRemainder / 12);
    if (!frameDelta) return;
    dragRemainder -= frameDelta * 12;
    showFrame(currentFrame - frameDelta);
  });

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    if (event.pointerId !== undefined && stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  stage.addEventListener("pointerup", stopDragging);
  stage.addEventListener("pointercancel", stopDragging);

  stage.addEventListener("keydown", (event) => {
    if (activeView === "rotate" && ["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Home") showFrame(0, true);
      else showFrame(currentFrame + (event.key === "ArrowRight" ? 1 : -1), true);
    } else if (activeView === "inspect" && event.key === "Escape") {
      clearSelection(true);
    }
  });

  clearSelection();
  setView("inspect");
  const firstFrame = new Image();
  firstFrame.src = frameImage(0);
})();
