(() => {
  const inspector = document.querySelector("[data-board-inspector]");
  const data = window.tramTraceBoardData;
  if (!inspector || !data) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const modeButtons = [...inspector.querySelectorAll("[data-inspector-mode]")];
  const viewButtons = [...inspector.querySelectorAll("[data-inspector-view]")];
  const modeIndex = inspector.querySelector("[data-mode-index]");
  const modeTitle = inspector.querySelector("[data-mode-title]");
  const modeCopy = inspector.querySelector("[data-mode-copy]");
  const assembledLegend = inspector.querySelector('[data-legend="assembled"]');
  const copperLegend = inspector.querySelector('[data-legend="copper"]');
  const rotateLegend = inspector.querySelector('[data-legend="rotate"]');
  const componentReadout = inspector.querySelector("[data-component-readout]");
  const componentRef = inspector.querySelector("[data-component-ref]");
  const componentTitle = inspector.querySelector("[data-component-title]");
  const componentCopy = inspector.querySelector("[data-component-copy]");
  const hotspotContainer = inspector.querySelector("[data-pcb-hotspots]");
  const hotspotToggle = inspector.querySelector("[data-hotspot-toggle]");
  const frameConsole = inspector.querySelector("[data-frame-console]");
  const chainList = inspector.querySelector("[data-chain-list]");
  const frameEyebrow = inspector.querySelector("[data-frame-eyebrow]");
  const frameTitle = inspector.querySelector("[data-frame-title]");
  const frameCopy = inspector.querySelector("[data-frame-copy]");
  const frameProgress = inspector.querySelector("[data-frame-progress]");
  const frameBits = inspector.querySelector("[data-frame-bits]");
  const frameTime = inspector.querySelector("[data-frame-time]");
  const playButton = inspector.querySelector("[data-frame-play]");
  const playIcon = playButton.querySelector("span[aria-hidden]");
  const playLabel = inspector.querySelector("[data-frame-play-label]");
  const resetButton = inspector.querySelector("[data-frame-reset]");
  const slider = inspector.querySelector("[data-frame-slider]");
  const canvas = inspector.querySelector("[data-pcb-canvas]");
  const context = canvas.getContext("2d");
  const stage = inspector.querySelector("[data-pcb-stage]");
  const turntableImage = inspector.querySelector("[data-pcb-turntable]");
  const dragHint = inspector.querySelector("[data-pcb-drag-hint]");
  const angleReadout = inspector.querySelector("[data-pcb-angle]");
  const rotatePrevious = inspector.querySelector("[data-pcb-rotate-previous]");
  const rotateNext = inspector.querySelector("[data-pcb-rotate-next]");
  const rotateReset = inspector.querySelector("[data-pcb-rotate-reset]");
  const liveRegion = document.querySelector("[data-live-region]");

  const modes = {
    assembled: {
      index: "01 / ASSEMBLED",
      title: "The finished object.",
      copy: "Start with the board as it was designed to be seen. Select a marked component to find out what it contributes."
    },
    copper: {
      index: "02 / COPPER",
      title: "Two layers carry the map.",
      copy: "The bright front layer and burnished back layer are direct fabrication exports. Pads, vias, pours and every routed segment retain their actual board geometry."
    },
    data: {
      index: "03 / DATA FRAME",
      title: "Position becomes address.",
      copy: "Choose a line and play one frame through its real electrical order. Each pixel keeps 24 bits, then regenerates what remains for the next device."
    }
  };

  const chainOrder = ["l1", "l2", "l3", "l4", "status"];
  const turntableFrameCount = 24;
  let activeMode = "assembled";
  let activeView = "inspect";
  let activeChainKey = "l1";
  let currentStep = 0;
  let rotationFrame = 0;
  let playTimer = null;
  let activeComponentButton = null;
  let dragging = false;
  let lastPointerX = 0;
  let dragRemainder = 0;
  let framesPreloaded = false;

  const announce = (message) => {
    if (liveRegion) liveRegion.textContent = message;
  };

  const turntableFrame = (frame) => `assets/images/interactive/tramtrace/tramtrace-turn-${String(frame).padStart(2, "0")}.webp`;

  const preloadTurntable = () => {
    if (framesPreloaded) return;
    framesPreloaded = true;
    const load = () => {
      for (let frame = 0; frame < turntableFrameCount; frame += 1) {
        const preload = new Image();
        preload.src = turntableFrame(frame);
      }
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 1200 });
    else window.setTimeout(load, 120);
  };

  const showRotationFrame = (frame, announceChange = false) => {
    rotationFrame = (frame + turntableFrameCount) % turntableFrameCount;
    turntableImage.src = turntableFrame(rotationFrame);
    const angle = rotationFrame * 15;
    angleReadout.textContent = `${String(angle).padStart(3, "0")}\u00b0`;
    if (announceChange) announce(`TramTrace board angle ${angle} degrees`);
  };

  const pageToPercent = (value, axis) => (value / data.page[axis === "x" ? 0 : 1]) * 100;

  const clearComponent = () => {
    hotspotContainer.querySelectorAll(".pcb-hotspot").forEach((item) => {
      item.classList.remove("is-active");
      item.setAttribute("aria-pressed", "false");
    });
    activeComponentButton = null;
    componentRef.textContent = "BOARD";
    componentTitle.textContent = "No component selected";
    componentCopy.textContent = "Select a + marker to inspect it. Select the active marker again to clear the board.";
  };

  const selectComponent = (button, component) => {
    if (activeComponentButton === button) {
      clearComponent();
      return;
    }
    hotspotContainer.querySelectorAll(".pcb-hotspot").forEach((item) => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    activeComponentButton = button;
    componentRef.textContent = component[0];
    componentTitle.textContent = component[1];
    componentCopy.textContent = component[2];
  };

  data.components.forEach((component) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pcb-hotspot";
    button.style.left = `${pageToPercent(component[3], "x")}%`;
    button.style.top = `${pageToPercent(component[4], "y")}%`;
    button.setAttribute("aria-label", `${component[0]} ${component[1]}: ${component[2]}`);
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span>${component[0]} / ${component[1]}</span>`;
    button.addEventListener("click", () => selectComponent(button, component));
    hotspotContainer.append(button);
  });

  hotspotToggle.addEventListener("click", () => {
    const visible = inspector.dataset.hotspots !== "hidden";
    inspector.dataset.hotspots = visible ? "hidden" : "visible";
    hotspotToggle.textContent = visible ? "Show annotations" : "Hide annotations";
    hotspotToggle.setAttribute("aria-pressed", String(!visible));
  });

  chainOrder.forEach((key) => {
    const chain = data.chains[key];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chain-button";
    button.dataset.chain = key;
    button.style.setProperty("--button-color", chain.color);
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<i aria-hidden="true"></i><strong>${chain.name}</strong><small>${chain.leds.length} ${chain.leds.length === 1 ? "pixel" : "pixels"}</small>`;
    button.addEventListener("click", () => setChain(key));
    chainList.append(button);
  });

  const setupCanvas = () => {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return rect;
  };

  const drawSegment = (segment, rect, color, alpha, width, glow = false) => {
    const scaleX = rect.width / data.page[0];
    const scaleY = rect.height / data.page[1];
    context.beginPath();
    context.moveTo(segment[1] * scaleX, segment[2] * scaleY);
    context.lineTo(segment[3] * scaleX, segment[4] * scaleY);
    context.strokeStyle = color;
    context.globalAlpha = alpha;
    context.lineWidth = width;
    context.lineCap = "round";
    context.setLineDash(segment[0] === 1 ? [4, 3] : []);
    if (glow) {
      context.shadowColor = color;
      context.shadowBlur = 9;
    }
    context.stroke();
    context.shadowBlur = 0;
    context.setLineDash([]);
    context.globalAlpha = 1;
  };

  const drawDataFrame = () => {
    const rect = setupCanvas();
    context.clearRect(0, 0, rect.width, rect.height);
    if (activeMode !== "data" || activeView !== "inspect") return;

    const chain = data.chains[activeChainKey];
    chain.traces.forEach((connection, index) => {
      const completed = index < currentStep;
      const active = index === currentStep && currentStep < chain.traces.length;
      connection.forEach((segment) => {
        drawSegment(
          segment,
          rect,
          active ? "#ffffff" : chain.color,
          active ? 1 : completed ? 0.74 : 0.07,
          active ? 2.4 : completed ? 1.7 : 1,
          active
        );
      });
    });

    const scaleX = rect.width / data.page[0];
    const scaleY = rect.height / data.page[1];
    chain.leds.forEach((led, index) => {
      const x = led[1] * scaleX;
      const y = led[2] * scaleY;
      const completed = index < currentStep;
      const active = index === currentStep && currentStep < chain.leds.length;
      context.beginPath();
      context.arc(x, y, active ? 5.5 : completed ? 3.6 : 2.2, 0, Math.PI * 2);
      context.fillStyle = active ? "#ffffff" : completed ? chain.color : "rgba(231,233,223,0.18)";
      if (active) {
        context.shadowColor = chain.color;
        context.shadowBlur = 16;
      }
      context.fill();
      context.shadowBlur = 0;
      if (active) {
        context.beginPath();
        context.arc(x, y, 9, 0, Math.PI * 2);
        context.strokeStyle = chain.color;
        context.lineWidth = 1.2;
        context.stroke();
      }
    });

    const shifter = data.components.find((component) => component[0] === "U5");
    if (shifter) {
      const x = shifter[3] * scaleX;
      const y = shifter[4] * scaleY;
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.strokeStyle = chain.color;
      context.lineWidth = 1.3;
      context.stroke();
    }
  };

  const stopPlayback = () => {
    if (playTimer) window.clearInterval(playTimer);
    playTimer = null;
    playIcon.textContent = "▶";
    playLabel.textContent = "Play frame";
    playButton.setAttribute("aria-label", "Play data frame");
  };

  const updateFrameReadout = () => {
    const chain = data.chains[activeChainKey];
    const length = chain.leds.length;
    const bits = currentStep * data.bitsPerPixel;
    const milliseconds = (bits / data.dataRate) * 1000;
    slider.value = String(currentStep);
    frameEyebrow.textContent = `${chain.name.toUpperCase()} / ${length} ${length === 1 ? "PIXEL" : "PIXELS"}`;
    frameProgress.textContent = `${currentStep} / ${length}`;
    frameBits.textContent = bits.toLocaleString();
    frameTime.textContent = `${milliseconds.toFixed(2)} ms`;

    if (currentStep === 0) {
      frameTitle.textContent = "Frame at the level shifter.";
      frameCopy.textContent = `The first 24 colour bits are about to reach ${chain.leds[0][0]}. Everything after them continues downstream.`;
    } else if (currentStep < length) {
      const consumed = chain.leds[currentStep - 1][0];
      const next = chain.leds[currentStep][0];
      frameTitle.textContent = `${consumed} has kept its colour.`;
      frameCopy.textContent = `${bits.toLocaleString()} bits have been consumed. The remaining frame is regenerated toward ${next}.`;
    } else {
      const finalPixel = chain.leds[length - 1][0];
      frameTitle.textContent = `${chain.name} is ready to latch.`;
      frameCopy.textContent = `${finalPixel} has received the final 24 bits. A reset interval now makes the whole chain display its new colours together.`;
    }
    drawDataFrame();
  };

  const setStep = (step) => {
    const length = data.chains[activeChainKey].leds.length;
    currentStep = Math.max(0, Math.min(length, Number(step)));
    updateFrameReadout();
  };

  const startPlayback = () => {
    const length = data.chains[activeChainKey].leds.length;
    if (currentStep >= length) setStep(0);
    playIcon.textContent = "Ⅱ";
    playLabel.textContent = "Pause";
    playButton.setAttribute("aria-label", "Pause data frame");
    playTimer = window.setInterval(() => {
      const currentLength = data.chains[activeChainKey].leds.length;
      if (currentStep >= currentLength) {
        stopPlayback();
        return;
      }
      setStep(currentStep + 1);
    }, reducedMotion.matches ? 360 : 150);
  };

  function setChain(key) {
    const chain = data.chains[key];
    if (!chain) return;
    stopPlayback();
    activeChainKey = key;
    inspector.dataset.chain = key;
    inspector.style.setProperty("--chain-color", chain.color);
    chainList.querySelectorAll("[data-chain]").forEach((button) => {
      const active = button.dataset.chain === key;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    slider.max = String(chain.leds.length);
    setStep(0);
  }

  const updateModeCopy = () => {
    if (activeView === "rotate") {
      modeIndex.textContent = "3D / ROTATE";
      modeTitle.textContent = "Turn the finished board.";
      modeCopy.textContent = "Drag the production KiCad assembly through a full turn, or use the arrow controls. Every visible package in this render comes from the board source.";
      return;
    }
    const mode = modes[activeMode];
    modeIndex.textContent = mode.index;
    modeTitle.textContent = mode.title;
    modeCopy.textContent = mode.copy;
  };

  const updatePanels = () => {
    const rotating = activeView === "rotate";
    assembledLegend.hidden = rotating || activeMode !== "assembled";
    copperLegend.hidden = rotating || activeMode !== "copper";
    rotateLegend.hidden = !rotating;
    frameConsole.hidden = rotating || activeMode !== "data";
    dragHint.hidden = !rotating;
    angleReadout.hidden = !rotating;
    if (rotating || activeMode !== "data") stopPlayback();
    updateModeCopy();
    drawDataFrame();
  };

  const setView = (name, announceChange = true) => {
    if (!["inspect", "rotate"].includes(name)) return;
    activeView = name;
    inspector.dataset.view = name;
    const rotating = name === "rotate";
    viewButtons.forEach((button) => {
      const active = button.dataset.inspectorView === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (rotating) {
      preloadTurntable();
      showRotationFrame(rotationFrame);
      turntableImage.alt = "Rotatable KiCad rendering of the fully populated TramTrace PCB";
      stage.setAttribute("aria-label", "Rotatable TramTrace board. Drag left or right, use the arrow buttons, or press the left and right arrow keys.");
    } else {
      turntableImage.alt = "";
      stage.setAttribute("aria-label", "TramTrace board inspection. Select marked components or choose an inspection layer.");
    }
    updatePanels();
    if (announceChange) announce(rotating ? "Rotatable board view selected" : "Board inspection view selected");
  };

  const setMode = (name) => {
    const mode = modes[name];
    if (!mode) return;
    activeMode = name;
    inspector.dataset.mode = name;
    modeButtons.forEach((button) => {
      const active = button.dataset.inspectorMode === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    updatePanels();
  };

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setView("inspect", false);
      setMode(button.dataset.inspectorMode);
    });
  });
  viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.inspectorView)));

  rotatePrevious.addEventListener("click", () => showRotationFrame(rotationFrame - 1, true));
  rotateNext.addEventListener("click", () => showRotationFrame(rotationFrame + 1, true));
  rotateReset.addEventListener("click", () => showRotationFrame(0, true));

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
    showRotationFrame(rotationFrame - frameDelta);
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
      if (event.key === "Home") showRotationFrame(0, true);
      else showRotationFrame(rotationFrame + (event.key === "ArrowRight" ? 1 : -1), true);
    } else if (activeView === "inspect" && event.key === "Escape") {
      clearComponent();
      announce("Component selection cleared");
    }
  });

  slider.addEventListener("input", () => {
    stopPlayback();
    setStep(slider.value);
  });
  playButton.addEventListener("click", () => playTimer ? stopPlayback() : startPlayback());
  resetButton.addEventListener("click", () => {
    stopPlayback();
    setStep(0);
  });

  const resizeObserver = new ResizeObserver(drawDataFrame);
  resizeObserver.observe(stage);
  window.addEventListener("resize", drawDataFrame, {passive: true});
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPlayback();
  });

  setChain("l1");
  clearComponent();
  setMode("assembled");
  setView("inspect", false);
})();
