(() => {
  const inspector = document.querySelector("[data-object-inspector]");
  if (!inspector) return;

  const image = inspector.querySelector("[data-object-image]");
  const stage = inspector.querySelector("[data-object-stage]");
  const hotspots = inspector.querySelector("[data-object-hotspots]");
  const boardButtons = [...inspector.querySelectorAll("[data-object-board]")];
  const viewButtons = [...inspector.querySelectorAll("[data-object-view]")];
  const annotationToggle = inspector.querySelector("[data-annotation-toggle]");
  const rotationBar = inspector.querySelector("[data-rotation-bar]");
  const rotationReset = inspector.querySelector("[data-rotation-reset]");
  const rotationPrevious = inspector.querySelector("[data-rotation-previous]");
  const rotationNext = inspector.querySelector("[data-rotation-next]");
  const anglePresets = [...inspector.querySelectorAll("[data-angle-preset]")];
  const explodeButton = inspector.querySelector("[data-object-explode]");
  const explodeLayer = inspector.querySelector("[data-object-explode-layer]");
  const dragHint = inspector.querySelector("[data-drag-hint]");
  const angleReadout = inspector.querySelector("[data-object-angle]");
  const boardEyebrow = inspector.querySelector("[data-board-eyebrow]");
  const boardHeading = inspector.querySelector("[data-board-heading]");
  const boardCopy = inspector.querySelector("[data-board-copy]");
  const readout = inspector.querySelector("[data-object-readout]");
  const readoutRef = inspector.querySelector("[data-object-ref]");
  const readoutName = inspector.querySelector("[data-object-name]");
  const readoutCopy = inspector.querySelector("[data-object-copy]");
  const componentDirectory = inspector.querySelector("[data-object-directory]");
  const directoryCount = inspector.querySelector("[data-object-directory-count]");
  const projectLink = inspector.querySelector("[data-object-project-link]");
  const liveRegion = document.querySelector("[data-object-live]");

  const frameCount = 24;
  const boards = {
    telemetry: {
      label: "Aircraft telemetry",
      projectLabel: "aircraft telemetry",
      projectUrl: "projects/skylabs/boards/telemetry/",
      eyebrow: "Aircraft telemetry / Rev 4.0",
      heading: "Flight data starts here.",
      introduction: "Drag the corrected source-rendered assembly through a full turn, switch to Parts for a guided map, or separate the major populated hardware with Explode.",
      inspectImage: "assets/images/interactive/skylabs/skylabs-telemetry-inspect.webp",
      explodeBase: "assets/images/interactive/skylabs/explode/skylabs-telemetry-board-explode.webp",
      frameStem: "skylabs-telemetry-turn-",
      alt: "assembled blue Skylabs aircraft telemetry PCB",
      emptyName: "Aircraft telemetry / avionics",
      emptyCopy: "Select a marker to trace how sensing, navigation, logging and radio share the same aircraft board. Select it again to clear the view.",
      components: [
        ["J3", "microSD socket", "Keeps the high-rate 40 Hz binary aircraft record, including sensor validity, estimator output and event markers.", 34.0, 26.0],
        ["U7", "NEO-M9N GNSS", "Supplies 10 Hz position, velocity and GPS time; the time-pulse line also gives the logger a precise timing reference.", 65.6, 25.5],
        ["U14", "STM32G474RET6", "Schedules acquisition, maintains measurement freshness, builds the aircraft log and packages the smaller live LoRa record.", 55.8, 45.6],
        ["U11", "HX711 strain interface", "Digitises the bridge input used for structural or load measurements and carries an explicit ready and saturation state into the log.", 43.3, 47.6],
        ["J1", "USB-C interface", "Provides the wired route for board power, firmware work and aircraft-side diagnostics during bring-up.", 21.7, 51.7],
        ["U9", "BME280 barometer", "Measures pressure and temperature for atmospheric context and the navigation estimator's barometric altitude input.", 37.6, 59.6],
        ["U10", "BNO085 IMU", "Reports acceleration and gyro at 100 Hz, attitude at 50 Hz and magnetic heading data at 25 Hz.", 43.3, 61.6],
        ["U12", "SX1262 LoRa module", "Transmits the compact live subset at up to 10 Hz and listens between packets for logging, marker and profile commands.", 70.8, 60.1],
        ["J10 / J6", "RF antenna ports", "Separate U.FL connections place the GNSS and 915 MHz antennas at the board edge and away from the dense sensor section.", 78.9, 18.4],
        ["U1", "TP4056 Li-ion charger", "Charges the aircraft's single-cell Li-ion battery from USB-C using a constant-current, constant-voltage cycle.", 31.8, 71.6],
        ["U2 / U5", "DW01A + 8205A cell protection", "The DW01A watches cell voltage and fault current, then drives the 8205A dual MOSFET to isolate the battery during over-charge, over-discharge or a short.", 31.6, 60.5]
      ],
      explodeParts: [
        ["J3", "assets/images/interactive/skylabs/explode/skylabs-telemetry-j3-explode.webp", 34.0, 26.0],
        ["U7", "assets/images/interactive/skylabs/explode/skylabs-telemetry-u7-explode.webp", 65.6, 25.5],
        ["U14", "assets/images/interactive/skylabs/explode/skylabs-telemetry-u14-explode.webp", 55.8, 45.6],
        ["U11", "assets/images/interactive/skylabs/explode/skylabs-telemetry-u11-explode.webp", 43.3, 47.6],
        ["J1", "assets/images/interactive/skylabs/explode/skylabs-telemetry-j1-explode.webp", 21.7, 51.7],
        ["U9", "assets/images/interactive/skylabs/explode/skylabs-telemetry-u9-explode.webp", 37.6, 59.6],
        ["U10", "assets/images/interactive/skylabs/explode/skylabs-telemetry-u10-explode.webp", 43.3, 61.6],
        ["U12", "assets/images/interactive/skylabs/explode/skylabs-telemetry-u12-explode.webp", 70.8, 60.1],
        ["J10 / J6", "assets/images/interactive/skylabs/explode/skylabs-telemetry-j10-j6-explode.webp", 78.9, 18.4],
        ["U1", "assets/images/interactive/skylabs/explode/skylabs-telemetry-u1-explode.webp", 31.8, 71.6],
        ["U2 / U5", "assets/images/interactive/skylabs/explode/skylabs-telemetry-u2-u5-explode.webp", 31.6, 60.5]
      ]
    },
    ground: {
      label: "Ground station",
      projectLabel: "ground-station",
      projectUrl: "projects/skylabs/boards/ground-station/",
      eyebrow: "Ground station / Rev 1.0",
      heading: "The other end of the link.",
      introduction: "Drag the corrected source-rendered assembly through a full turn, switch to Parts for a guided map, or separate the major populated hardware with Explode.",
      inspectImage: "assets/images/interactive/skylabs/skylabs-ground-inspect.webp",
      explodeBase: "assets/images/interactive/skylabs/explode/skylabs-ground-board-explode.webp",
      frameStem: "skylabs-ground-turn-",
      alt: "assembled blue Skylabs ground-station PCB",
      emptyName: "Ground-station receiver",
      emptyCopy: "Select a marker to see how radio, compute, storage and USB fit onto the ground board. Select it again to clear the view.",
      components: [
        ["J1", "USB-C receptacle", "Powers the board and carries firmware uploads and the live serial telemetry stream.", 17.7, 15.5],
        ["U4", "CH340C USB bridge", "Converts the ESP32 UART into a USB serial connection for programming and field monitoring.", 33.9, 16.4],
        ["Q1 / Q2", "Automatic upload pair", "Drives EN and IO0 from the USB bridge so new ESP32 firmware can be loaded without a manual button sequence.", 44.6, 22.2],
        ["U2", "3.3 V regulator", "Converts the incoming 5 V rail for the ESP32, LoRa module and board logic.", 57.8, 22.8],
        ["U3", "ESP32-WROOM-32E", "Receives packets, manages logging, serves the local dashboard and forwards live data over USB.", 25.0, 53.0],
        ["U1", "SX1262 LoRa module", "Receives aircraft telemetry and transmits short command bursts back to the aircraft on 915 MHz.", 50.0, 54.2],
        ["J3", "microSD socket", "Stores every valid packet as CSV or as an indexed, CRC-protected SKB binary record.", 74.0, 78.2],
        ["J2", "U.FL antenna connector", "Connects the receiver to its external 915 MHz antenna at the edge of the RF path.", 41.2, 89.0]
      ],
      explodeParts: [
        ["J1", "assets/images/interactive/skylabs/explode/skylabs-ground-j1-explode.webp", 17.7, 15.5],
        ["U4", "assets/images/interactive/skylabs/explode/skylabs-ground-u4-explode.webp", 33.9, 16.4],
        ["Q1 / Q2", "assets/images/interactive/skylabs/explode/skylabs-ground-q1-q2-explode.webp", 44.6, 22.2],
        ["U2", "assets/images/interactive/skylabs/explode/skylabs-ground-u2-explode.webp", 57.8, 22.8],
        ["U3", "assets/images/interactive/skylabs/explode/skylabs-ground-u3-explode.webp", 25.0, 53.0],
        ["U1", "assets/images/interactive/skylabs/explode/skylabs-ground-u1-explode.webp", 50.0, 54.2],
        ["J3", "assets/images/interactive/skylabs/explode/skylabs-ground-j3-explode.webp", 74.0, 78.2],
        ["J2", "assets/images/interactive/skylabs/explode/skylabs-ground-j2-explode.webp", 41.2, 89.0]
      ]
    }
  };

  let activeBoard = "telemetry";
  let activeComponentIndex = -1;
  let activeView = "rotate";
  let currentFrame = 0;
  let exploded = false;
  let dragging = false;
  let lastPointerX = 0;
  let dragRemainder = 0;
  const preloadedBoards = new Set();

  const announce = (message) => {
    if (liveRegion) liveRegion.textContent = message;
  };

  const frameImage = (boardKey, frame) => {
    const suffix = String(frame).padStart(2, "0");
    return `assets/images/interactive/skylabs/${boards[boardKey].frameStem}${suffix}.webp`;
  };

  const clearSelection = (announceChange = false) => {
    hotspots.querySelectorAll(".object-hotspot").forEach((button) => {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
    });
    componentDirectory.querySelectorAll("button").forEach((button) => {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
    });
    activeComponentIndex = -1;
    const board = boards[activeBoard];
    readout.classList.add("is-empty");
    readoutRef.textContent = "BOARD";
    readoutName.textContent = board.emptyName;
    readoutCopy.textContent = board.emptyCopy;
    if (announceChange) announce("Component selection cleared");
  };

  const selectComponent = (index, component) => {
    if (activeComponentIndex === index) {
      clearSelection(true);
      return;
    }
    hotspots.querySelectorAll(".object-hotspot").forEach((item) => {
      const active = Number(item.dataset.componentIndex) === index;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    componentDirectory.querySelectorAll("button").forEach((item) => {
      const active = Number(item.dataset.componentIndex) === index;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    activeComponentIndex = index;
    readout.classList.remove("is-empty");
    readoutRef.textContent = component[0];
    readoutName.textContent = component[1];
    readoutCopy.textContent = component[2];
  };

  const buildHotspots = () => {
    hotspots.replaceChildren();
    componentDirectory.replaceChildren();
    const components = boards[activeBoard].components;
    directoryCount.textContent = `${components.length} selectable parts`;
    components.forEach((component, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "object-hotspot";
      button.style.left = `${component[3]}%`;
      button.style.top = `${component[4]}%`;
      button.setAttribute("aria-label", `${component[0]} ${component[1]}: ${component[2]}`);
      button.setAttribute("aria-pressed", "false");
      button.dataset.componentIndex = String(index);
      button.innerHTML = `<span>${component[0]} / ${component[1]}</span>`;
      button.addEventListener("click", () => selectComponent(index, component));
      hotspots.append(button);

      const directoryButton = document.createElement("button");
      directoryButton.type = "button";
      directoryButton.dataset.componentIndex = String(index);
      directoryButton.setAttribute("aria-pressed", "false");
      directoryButton.innerHTML = `<strong>${component[0]}</strong><span>${component[1]}</span>`;
      directoryButton.addEventListener("click", () => selectComponent(index, component));
      componentDirectory.append(directoryButton);
    });
  };

  const buildExplodeLayer = () => {
    if (!explodeLayer) return;
    explodeLayer.replaceChildren();
    const parts = boards[activeBoard].explodeParts || [];
    parts.forEach((part, index) => {
      const [ref, src, x, y] = part;
      const imagePart = document.createElement("img");
      imagePart.className = "object-explode-part";
      imagePart.src = src;
      imagePart.alt = "";
      imagePart.decoding = "async";
      imagePart.draggable = false;
      imagePart.dataset.ref = ref;
      const dx = (x - 50) * 0.22;
      const dy = -5.5 - Math.abs(x - 50) * 0.035 + ((index % 3) - 1) * 1.2;
      imagePart.style.setProperty("--explode-x", `${dx.toFixed(2)}%`);
      imagePart.style.setProperty("--explode-y", `${dy.toFixed(2)}%`);
      imagePart.style.setProperty("--explode-delay", `${(index * 22).toFixed(0)}ms`);
      explodeLayer.append(imagePart);
    });
  };

  const preloadFrames = (boardKey) => {
    if (preloadedBoards.has(boardKey)) return;
    preloadedBoards.add(boardKey);
    const load = () => {
      for (let frame = 0; frame < frameCount; frame += 1) {
        const preload = new Image();
        preload.src = frameImage(boardKey, frame);
      }
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 1200 });
    else window.setTimeout(load, 120);
  };

  const showFrame = (frame, announceChange = false) => {
    currentFrame = (frame + frameCount) % frameCount;
    image.src = frameImage(activeBoard, currentFrame);
    const angle = currentFrame * 15;
    angleReadout.textContent = `${String(angle).padStart(3, "0")}\u00b0`;
    anglePresets.forEach((button) => {
      const active = Number(button.dataset.anglePreset) === currentFrame;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (announceChange) announce(`${boards[activeBoard].label} angle ${angle} degrees`);
  };

  const updateStage = () => {
    const board = boards[activeBoard];
    if (exploded) {
      image.src = board.explodeBase;
      image.alt = `Source-derived depopulated rendering of the ${board.alt}`;
      stage.setAttribute("aria-label", `Exploded ${board.label} board showing source-rendered populated components lifted from the PCB.`);
      if (explodeLayer) explodeLayer.hidden = false;
    } else if (activeView === "rotate") {
      preloadFrames(activeBoard);
      showFrame(currentFrame);
      image.alt = `Rotatable KiCad rendering of the ${board.alt}`;
      stage.setAttribute("aria-label", `Rotatable ${board.label} board. Drag left or right, or use the arrow keys.`);
      if (explodeLayer) explodeLayer.hidden = true;
    } else {
      image.src = board.inspectImage;
      image.alt = `KiCad rendering of the ${board.alt}`;
      stage.setAttribute("aria-label", `${board.label} board with selectable component markers.`);
      if (explodeLayer) explodeLayer.hidden = true;
    }
  };

  const setBoard = (boardKey, announceChange = true) => {
    if (!boards[boardKey]) return;
    activeBoard = boardKey;
    currentFrame = 0;
    inspector.dataset.board = boardKey;
    boardButtons.forEach((button) => {
      const active = button.dataset.objectBoard === boardKey;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const board = boards[boardKey];
    boardEyebrow.textContent = board.eyebrow;
    boardHeading.textContent = board.heading;
    boardCopy.textContent = board.introduction;
    if (projectLink) {
      projectLink.href = board.projectUrl;
      projectLink.firstChild.textContent = `Read the ${board.projectLabel} project `;
    }
    buildHotspots();
    buildExplodeLayer();
    clearSelection();
    updateStage();
    const url = new URL(window.location.href);
    if (boardKey === "telemetry") url.searchParams.delete("board");
    else url.searchParams.set("board", boardKey);
    url.searchParams.set("view", activeView);
    window.history.replaceState({}, "", url);
    if (announceChange) announce(`${board.label} board selected`);
  };

  const setView = (view) => {
    if (!["inspect", "rotate"].includes(view)) return;
    if (exploded) setExploded(false, false);
    activeView = view;
    inspector.dataset.view = view;
    viewButtons.forEach((button) => {
      const active = button.dataset.objectView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const rotating = view === "rotate";
    annotationToggle.hidden = rotating;
    rotationBar.hidden = !rotating;
    dragHint.hidden = !rotating;
    angleReadout.hidden = !rotating;
    updateStage();
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    if (activeBoard === "telemetry") url.searchParams.delete("board");
    else url.searchParams.set("board", activeBoard);
    window.history.replaceState({}, "", url);
    announce(view === "rotate" ? "360 degree board view" : "Component map");
  };

  const setExploded = (value, announceChange = true) => {
    exploded = Boolean(value);
    inspector.dataset.exploded = exploded ? "true" : "false";
    if (explodeButton) {
      explodeButton.setAttribute("aria-pressed", String(exploded));
      explodeButton.textContent = exploded ? "Assemble" : "Explode";
    }
    const rotating = activeView === "rotate" && !exploded;
    annotationToggle.hidden = exploded || activeView === "rotate";
    rotationBar.hidden = !rotating;
    dragHint.hidden = !rotating;
    angleReadout.hidden = !rotating;
    updateStage();
    const url = new URL(window.location.href);
    if (exploded) url.searchParams.set("explode", "1");
    else url.searchParams.delete("explode");
    window.history.replaceState({}, "", url);
    if (announceChange) announce(exploded ? `${boards[activeBoard].label} exploded view` : `${boards[activeBoard].label} assembled view`);
  };

  boardButtons.forEach((button) => button.addEventListener("click", () => setBoard(button.dataset.objectBoard)));
  viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.objectView)));
  explodeButton?.addEventListener("click", () => setExploded(!exploded));

  annotationToggle.addEventListener("click", () => {
    const visible = inspector.dataset.annotations !== "hidden";
    inspector.dataset.annotations = visible ? "hidden" : "visible";
    annotationToggle.textContent = visible ? "Show annotations" : "Hide annotations";
    annotationToggle.setAttribute("aria-pressed", String(!visible));
    announce(visible ? "Component annotations hidden" : "Component annotations shown");
  });

  rotationReset.addEventListener("click", () => showFrame(0, true));
  rotationPrevious.addEventListener("click", () => showFrame(currentFrame - 1, true));
  rotationNext.addEventListener("click", () => showFrame(currentFrame + 1, true));
  anglePresets.forEach((button) => button.addEventListener("click", () => showFrame(Number(button.dataset.anglePreset), true)));

  stage.addEventListener("pointerdown", (event) => {
    if (activeView !== "rotate" || exploded) return;
    dragging = true;
    lastPointerX = event.clientX;
    dragRemainder = 0;
    stage.classList.add("is-dragging");
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener("pointermove", (event) => {
    if (!dragging || activeView !== "rotate" || exploded) return;
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
    if (activeView === "rotate" && !exploded && ["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Home") showFrame(0, true);
      else showFrame(currentFrame + (event.key === "ArrowRight" ? 1 : -1), true);
    } else if (activeView === "inspect" && event.key === "Escape") {
      clearSelection(true);
    }
  });

  const requestedBoard = new URLSearchParams(window.location.search).get("board");
  const requestedView = new URLSearchParams(window.location.search).get("view");
  const requestedExplode = new URLSearchParams(window.location.search).get("explode");
  const fallbackBoard = Object.prototype.hasOwnProperty.call(boards, inspector.dataset.board) ? inspector.dataset.board : "telemetry";
  const initialBoard = Object.prototype.hasOwnProperty.call(boards, requestedBoard) ? requestedBoard : fallbackBoard;
  setBoard(initialBoard, false);
  setView(requestedView === "inspect" ? "inspect" : "rotate");
  if (requestedExplode === "1") setExploded(true, false);
  const firstCompanionFrame = new Image();
  firstCompanionFrame.src = frameImage(initialBoard === "ground" ? "telemetry" : "ground", 0);
})();
