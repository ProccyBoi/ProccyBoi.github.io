(() => {
  const inspector = document.querySelector("[data-object-inspector]");
  if (!inspector) return;

  const image = inspector.querySelector("[data-object-image]");
  const stage = inspector.querySelector("[data-object-stage]");
  const hotspots = inspector.querySelector("[data-object-hotspots]");
  const boardButtons = [...inspector.querySelectorAll("[data-object-board]")];
  const viewButtons = [...inspector.querySelectorAll("[data-object-view]")];
  const annotationToggle = inspector.querySelector("[data-annotation-toggle]");
  const rotationReset = inspector.querySelector("[data-rotation-reset]");
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
  const liveRegion = document.querySelector("[data-object-live]");

  const frameCount = 24;
  const boards = {
    telemetry: {
      label: "Aircraft telemetry",
      eyebrow: "Aircraft telemetry / Rev 4.0",
      heading: "Flight data starts here.",
      introduction: "Inspect the aircraft-side sensor, logger and radio board, then switch to Rotate and drag the actual KiCad assembly through a full turn.",
      inspectImage: "assets/images/interactive/skylabs/skylabs-telemetry-inspect.webp",
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
      ]
    },
    ground: {
      label: "Ground station",
      eyebrow: "Ground station / Rev 1.0",
      heading: "The other end of the link.",
      introduction: "Inspect the field receiver and backup logger, then switch to Rotate and drag its KiCad assembly through the same full turn.",
      inspectImage: "assets/images/interactive/skylabs/skylabs-ground-inspect.webp",
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
      ]
    }
  };

  let activeBoard = "telemetry";
  let activeComponentIndex = -1;
  let activeView = "inspect";
  let currentFrame = 0;
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
    if (announceChange) announce(`${boards[activeBoard].label} angle ${angle} degrees`);
  };

  const updateStage = () => {
    const board = boards[activeBoard];
    if (activeView === "rotate") {
      preloadFrames(activeBoard);
      showFrame(currentFrame);
      image.alt = `Rotatable KiCad rendering of the ${board.alt}`;
      stage.setAttribute("aria-label", `Rotatable ${board.label} board. Drag left or right, or use the arrow keys.`);
    } else {
      image.src = board.inspectImage;
      image.alt = `KiCad rendering of the ${board.alt}`;
      stage.setAttribute("aria-label", `${board.label} board with selectable component markers.`);
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
    buildHotspots();
    clearSelection();
    updateStage();
    if (announceChange) {
      const url = new URL(window.location.href);
      if (boardKey === "telemetry") url.searchParams.delete("board");
      else url.searchParams.set("board", boardKey);
      window.history.replaceState({}, "", url);
      announce(`${board.label} board selected`);
    }
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
    updateStage();
  };

  boardButtons.forEach((button) => button.addEventListener("click", () => setBoard(button.dataset.objectBoard)));
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

  const requestedBoard = new URLSearchParams(window.location.search).get("board");
  const initialBoard = Object.prototype.hasOwnProperty.call(boards, requestedBoard) ? requestedBoard : "telemetry";
  setBoard(initialBoard, false);
  setView("inspect");
  const firstCompanionFrame = new Image();
  firstCompanionFrame.src = frameImage(initialBoard === "ground" ? "telemetry" : "ground", 0);
})();
