(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const skylabs = document.querySelector("[data-skylabs-experience]");
  if (skylabs) {
    const stages = {
      sense: {
        label: "01 / SENSE",
        title: "One timestamp, many clocks.",
        copy: "The aircraft board brings faster inertial data and slower environmental and position fixes into one record, while keeping each sensor's validity explicit.",
        metrics: [["IMU", "100 Hz"], ["GNSS", "10 Hz"], ["MCU", "STM32G474"]]
      },
      record: {
        label: "02 / RECORD",
        title: "Keep the full-rate truth on the aircraft.",
        copy: "The logger targets 40 Hz, batches eight records into each microSD transaction, and syncs once a second. The radio never has to carry the complete dataset.",
        metrics: [["Log target", "40 Hz"], ["SD batch", "8 records"], ["Sync", "1 s"]]
      },
      transmit: {
        label: "03 / TRANSMIT",
        title: "Send the useful subset, not the whole log.",
        copy: "A compact 66-byte packet leaves the aircraft every 100 ms. The default SX1262 link runs at 22 dBm with 500 kHz bandwidth and spreading factor 5.",
        metrics: [["Packet", "66 bytes"], ["Air rate", "10 Hz"], ["LoRa", "22 dBm"]]
      },
      replay: {
        label: "04 / REPLAY",
        title: "Land with three views of the flight.",
        copy: "The aircraft keeps its full log, the ground station stores received packets, and the laptop turns both into a replay. F110211 recovered 13,773 aircraft records and 8,741 ground packets.",
        metrics: [["Aircraft", "13,773 records"], ["Ground", "8,741 packets"], ["Track", "6.785 km"]]
      }
    };

    const stageButtons = [...skylabs.querySelectorAll("[data-sky-stage]")];
    const stageFields = {
      label: skylabs.querySelector("[data-sky-label]"),
      title: skylabs.querySelector("[data-sky-title]"),
      copy: skylabs.querySelector("[data-sky-copy]"),
      metricLabels: [
        skylabs.querySelector("[data-sky-metric-one-label]"),
        skylabs.querySelector("[data-sky-metric-two-label]"),
        skylabs.querySelector("[data-sky-metric-three-label]")
      ],
      metricValues: [
        skylabs.querySelector("[data-sky-metric-one]"),
        skylabs.querySelector("[data-sky-metric-two]"),
        skylabs.querySelector("[data-sky-metric-three]")
      ]
    };

    const setStage = (name) => {
      const stage = stages[name];
      if (!stage) return;
      skylabs.dataset.stage = name;
      stageButtons.forEach((button) => {
        const active = button.dataset.skyStage === name;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      stageFields.label.textContent = stage.label;
      stageFields.title.textContent = stage.title;
      stageFields.copy.textContent = stage.copy;
      stage.metrics.forEach((metric, index) => {
        stageFields.metricLabels[index].textContent = metric[0];
        stageFields.metricValues[index].textContent = metric[1];
      });
    };

    stageButtons.forEach((button) => {
      button.addEventListener("click", () => setStage(button.dataset.skyStage));
    });
  }

  const flightReplay = document.querySelector("[data-flight-replay]");
  if (flightReplay) {
    const flightData = [
      {t:0,alt:152.6,speed:0.2,east:0,north:0},{t:13,alt:152.5,speed:0.1,east:-0.3,north:6},{t:28.5,alt:149.3,speed:5.7,east:3.9,north:21.6},{t:43.5,alt:150.8,speed:0,east:19.5,north:43.1},{t:58.5,alt:150.8,speed:0,east:19.2,north:43.6},{t:71.9,alt:151.4,speed:0.1,east:19.6,north:44.5},{t:85.6,alt:151.2,speed:0,east:19.8,north:45.3},{t:100.2,alt:151.4,speed:0,east:19.6,north:45.5},{t:114.5,alt:151.7,speed:0,east:19.5,north:45.5},{t:128.9,alt:151.4,speed:0,east:19.7,north:45.5},{t:142.8,alt:151.2,speed:0,east:19.4,north:45.8},{t:157.4,alt:151.4,speed:0,east:19.4,north:46.2},{t:171.6,alt:151.4,speed:0.1,east:19.3,north:46.3},{t:185.5,alt:151.6,speed:0,east:18.8,north:47},{t:199.7,alt:151.5,speed:0,east:18.6,north:47.2},{t:214.1,alt:151.5,speed:0,east:18.5,north:47.1},{t:228.3,alt:151,speed:0.1,east:19,north:46.5},{t:243.2,alt:151.2,speed:0,east:19.5,north:46.1},{t:257.4,alt:151.4,speed:0,east:19.7,north:45.7},{t:271.1,alt:151.6,speed:0,east:19.9,north:45.4},{t:285.4,alt:151.6,speed:0,east:19.2,north:46},{t:299.6,alt:148.8,speed:3.5,east:23.1,north:49.9},{t:314.9,alt:150.4,speed:0,east:25.4,north:61.9},{t:329.3,alt:150.4,speed:0,east:25.2,north:62.1},{t:343.2,alt:150.5,speed:0,east:24.9,north:62},{t:356.8,alt:150.6,speed:0,east:24.9,north:61.8},{t:370.7,alt:147.4,speed:3.8,east:24.3,north:66.8},{t:385.1,alt:148.8,speed:32.3,east:37,north:232.4},{t:399.8,alt:157.1,speed:24.6,east:3.5,north:143},{t:414.4,alt:210.1,speed:10.7,east:-53.4,north:30.2},{t:428.8,alt:188.6,speed:25.8,east:-104.9,north:166.4},{t:443.4,alt:178.7,speed:17,east:82.4,north:221.9},{t:458,alt:177.1,speed:21.8,east:37.3,north:123.7},{t:473.4,alt:222.6,speed:25.6,east:7.2,north:116.4},{t:488.3,alt:180.8,speed:8.6,east:-58.3,north:35.9},{t:503.3,alt:156.2,speed:27.2,east:-27.2,north:109},{t:517.6,alt:160.2,speed:24.8,east:149.9,north:255.9},{t:532.5,alt:156.6,speed:27.3,east:-36.5,north:121.9},{t:547,alt:134.2,speed:32,east:77.9,north:169.1},{t:562.1,alt:149.7,speed:23.6,east:-25.2,north:99.9},{t:576.8,alt:158.3,speed:27.1,east:74.8,north:302.9},{t:591.4,alt:162.3,speed:7.6,east:11,north:64.5},{t:606.6,alt:157.4,speed:25.2,east:79.1,north:212.6},{t:620.9,alt:148.2,speed:34.8,east:-16,north:149.9},{t:635.8,alt:155.2,speed:25.7,east:-44.2,north:36.4},{t:650.4,alt:174.7,speed:24.4,east:149.7,north:263.3},{t:664.5,alt:150.8,speed:1.6,east:7.8,north:40.2},{t:679.3,alt:150.8,speed:0,east:7.6,north:39.7}
    ];

    const canvas = flightReplay.querySelector("[data-flight-canvas]");
    const context = canvas.getContext("2d");
    const range = flightReplay.querySelector("[data-flight-range]");
    const play = flightReplay.querySelector("[data-flight-play]");
    const playLabel = flightReplay.querySelector("[data-flight-play-label]");
    const timeValue = flightReplay.querySelector("[data-flight-time]");
    const altValue = flightReplay.querySelector("[data-flight-alt]");
    const speedValue = flightReplay.querySelector("[data-flight-speed]");
    let currentIndex = 0;
    let playTimer = null;

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return rect;
    };

    const formatTime = (seconds) => {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
    };

    const drawFlight = () => {
      const rect = setupCanvas();
      const width = rect.width;
      const height = rect.height;
      const pad = {top: 26, right: 12, bottom: 22, left: 12};
      const plotWidth = width - pad.left - pad.right;
      const plotHeight = height - pad.top - pad.bottom;
      const minAlt = 125;
      const maxAlt = 230;
      const maxTime = flightData[flightData.length - 1].t;
      const x = (point) => pad.left + (point.t / maxTime) * plotWidth;
      const y = (point) => pad.top + (1 - (point.alt - minAlt) / (maxAlt - minAlt)) * plotHeight;

      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;
      context.strokeStyle = "rgba(232, 234, 223, 0.1)";
      for (let line = 0; line <= 4; line += 1) {
        const lineY = pad.top + (plotHeight * line) / 4;
        context.beginPath();
        context.moveTo(pad.left, lineY);
        context.lineTo(width - pad.right, lineY);
        context.stroke();
      }

      const takeoffX = pad.left + (370.7 / maxTime) * plotWidth;
      context.fillStyle = "rgba(112, 168, 255, 0.045)";
      context.fillRect(takeoffX, pad.top, width - pad.right - takeoffX, plotHeight);

      const tracePath = () => {
        context.beginPath();
        flightData.forEach((point, index) => {
          if (index === 0) context.moveTo(x(point), y(point));
          else context.lineTo(x(point), y(point));
        });
      };

      tracePath();
      context.strokeStyle = "rgba(232, 234, 223, 0.26)";
      context.lineWidth = 1.5;
      context.stroke();

      context.beginPath();
      flightData.slice(0, currentIndex + 1).forEach((point, index) => {
        if (index === 0) context.moveTo(x(point), y(point));
        else context.lineTo(x(point), y(point));
      });
      context.strokeStyle = "#70a8ff";
      context.lineWidth = 2.5;
      context.stroke();

      const selected = flightData[currentIndex];
      const selectedX = x(selected);
      const selectedY = y(selected);
      context.beginPath();
      context.moveTo(selectedX, pad.top);
      context.lineTo(selectedX, height - pad.bottom);
      context.strokeStyle = "rgba(112, 168, 255, 0.45)";
      context.lineWidth = 1;
      context.stroke();
      context.beginPath();
      context.arc(selectedX, selectedY, 5, 0, Math.PI * 2);
      context.fillStyle = "#0e100e";
      context.fill();
      context.strokeStyle = "#a9caff";
      context.lineWidth = 2;
      context.stroke();
    };

    const updateFlight = (index) => {
      currentIndex = Math.max(0, Math.min(flightData.length - 1, Number(index)));
      range.value = String(currentIndex);
      const point = flightData[currentIndex];
      timeValue.textContent = formatTime(point.t);
      altValue.textContent = `${point.alt.toFixed(1)} m`;
      speedValue.textContent = `${point.speed.toFixed(1)} m/s`;
      drawFlight();
    };

    const stopPlayback = () => {
      if (playTimer) window.clearInterval(playTimer);
      playTimer = null;
      playLabel.textContent = "Play";
      play.querySelector("span[aria-hidden]").textContent = "▶";
      play.setAttribute("aria-label", "Play flight trace");
    };

    const startPlayback = () => {
      if (currentIndex >= flightData.length - 1) updateFlight(0);
      playLabel.textContent = "Pause";
      play.querySelector("span[aria-hidden]").textContent = "Ⅱ";
      play.setAttribute("aria-label", "Pause flight trace");
      playTimer = window.setInterval(() => {
        if (currentIndex >= flightData.length - 1) {
          stopPlayback();
          return;
        }
        updateFlight(currentIndex + 1);
      }, reducedMotion.matches ? 320 : 150);
    };

    range.addEventListener("input", () => {
      stopPlayback();
      updateFlight(range.value);
    });
    play.addEventListener("click", () => playTimer ? stopPlayback() : startPlayback());
    window.addEventListener("resize", drawFlight, {passive: true});
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopPlayback();
    });
    updateFlight(0);
  }

  const tram = document.querySelector("[data-tram-experience]");
  if (tram) {
    const regions = {
      network: {
        label: "01 / NETWORK GEOMETRY",
        title: "Four lines become copper and silkscreen.",
        copy: "The Sydney and Parramatta networks are redrawn as physical routes. Shared corridors and directional sections turn a familiar diagram into a routing problem.",
        lens: "Network / macro",
        image: "assets/images/projects/tramtrace-parramatta-1920.jpg"
      },
      controller: {
        label: "02 / CONTROLLER",
        title: "Live positions become pixel addresses.",
        copy: "An ESP32-WROOM-32E fetches vehicle positions over Wi-Fi. A CH340C handles USB serial, while the logic stage drives the physical display.",
        lens: "Controller / macro",
        image: "assets/images/projects/tramtrace-controller-1920.jpg"
      },
      output: {
        label: "03 / LED OUTPUT",
        title: "One hundred and sixteen points of light.",
        copy: "The production BOM contains 116 populated 2 × 2 mm RGB pixels. Shared and directional corridors mean physical pixel positions do not map one-for-one to the stop count.",
        lens: "Pixel chain / macro",
        image: "assets/images/projects/tramtrace-cbd-1920.jpg"
      }
    };

    const routes = {
      l1: {color: "#ef5a56", count: 23, points: [[.48,.76],[.48,.59],[.52,.54],[.57,.50],[.62,.55],[.67,.55],[.72,.54],[.77,.50],[.81,.54],[.82,.67],[.87,.74]]},
      l2: {color: "#66bce8", count: 14, points: [[.78,.35],[.78,.45],[.78,.55],[.80,.60],[.82,.60],[.86,.62],[.90,.71],[.92,.79]]},
      l3: {color: "#69c681", count: 15, points: [[.78,.35],[.78,.45],[.78,.55],[.80,.60],[.83,.64],[.85,.73],[.87,.78],[.87,.82]]},
      l4: {color: "#e7aa48", count: 16, points: [[.125,.64],[.16,.59],[.18,.52],[.22,.48],[.26,.55],[.27,.66],[.37,.66],[.43,.66],[.43,.38]]}
    };

    const stage = tram.querySelector("[data-tram-stage]");
    const lens = tram.querySelector("[data-tram-lens]");
    const lensLabel = tram.querySelector("[data-tram-lens-label]");
    const canvas = tram.querySelector("[data-tram-canvas]");
    const context = canvas.getContext("2d");
    const regionButtons = [...tram.querySelectorAll("[data-tram-region]")];
    const routeButtons = [...tram.querySelectorAll("[data-tram-route]")];
    const label = tram.querySelector("[data-tram-label]");
    const title = tram.querySelector("[data-tram-title]");
    const copy = tram.querySelector("[data-tram-copy]");
    let selectedRoute = "l1";
    let selectedRegion = "network";
    let animationFrame = null;
    let visible = true;

    const assetUrl = (path) => new URL(path, document.baseURI).href;
    const setLensImage = (path) => lens.style.setProperty("--lens-image", `url("${assetUrl(path)}")`);

    const fitCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return rect;
    };

    const routePoint = (route, progress, width, height) => {
      const points = route.points;
      const lengths = [];
      let total = 0;
      for (let index = 1; index < points.length; index += 1) {
        const dx = (points[index][0] - points[index - 1][0]) * width;
        const dy = (points[index][1] - points[index - 1][1]) * height;
        const length = Math.hypot(dx, dy);
        lengths.push(length);
        total += length;
      }
      let target = (((progress % 1) + 1) % 1) * total;
      for (let index = 0; index < lengths.length; index += 1) {
        if (target <= lengths[index]) {
          const ratio = target / lengths[index];
          const from = points[index];
          const to = points[index + 1];
          return {x: (from[0] + (to[0] - from[0]) * ratio) * width, y: (from[1] + (to[1] - from[1]) * ratio) * height};
        }
        target -= lengths[index];
      }
      const last = points[points.length - 1];
      return {x: last[0] * width, y: last[1] * height};
    };

    const drawRoute = (route, width, height, active, phase) => {
      context.beginPath();
      route.points.forEach((point, index) => {
        const x = point[0] * width;
        const y = point[1] * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = active ? 3 : 1.2;
      context.strokeStyle = active ? route.color : "rgba(232, 234, 223, 0.15)";
      if (active) {
        context.shadowColor = route.color;
        context.shadowBlur = 10;
      }
      context.stroke();
      context.shadowBlur = 0;

      const dotCount = Math.min(route.count, 18);
      for (let index = 0; index < dotCount; index += 1) {
        const point = routePoint(route, index / Math.max(1, dotCount - 1), width, height);
        context.beginPath();
        context.arc(point.x, point.y, active ? 2.6 : 1.5, 0, Math.PI * 2);
        context.fillStyle = active ? route.color : "rgba(232, 234, 223, 0.2)";
        context.fill();
      }

      if (active && selectedRegion === "network") {
        [phase, phase + 0.37].forEach((progress) => {
          const point = routePoint(route, progress, width, height);
          context.beginPath();
          context.arc(point.x, point.y, 5, 0, Math.PI * 2);
          context.fillStyle = "#ffffff";
          context.shadowColor = route.color;
          context.shadowBlur = 15;
          context.fill();
          context.shadowBlur = 0;
        });
      }
    };

    const drawTram = (time = 0) => {
      const rect = fitCanvas();
      context.clearRect(0, 0, rect.width, rect.height);
      Object.entries(routes).forEach(([name, route]) => {
        drawRoute(route, rect.width, rect.height, name === selectedRoute, reducedMotion.matches ? 0.32 : (time / 7000));
      });
    };

    const animateTram = (time) => {
      drawTram(time);
      if (visible && !reducedMotion.matches) animationFrame = window.requestAnimationFrame(animateTram);
    };

    const restartAnimation = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      if (visible && !reducedMotion.matches) animationFrame = window.requestAnimationFrame(animateTram);
      else drawTram(0);
    };

    const setRegion = (name) => {
      const region = regions[name];
      if (!region) return;
      selectedRegion = name;
      tram.dataset.region = name;
      regionButtons.forEach((button) => {
        const active = button.dataset.tramRegion === name;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      label.textContent = region.label;
      title.textContent = region.title;
      copy.textContent = region.copy;
      lensLabel.textContent = region.lens;
      setLensImage(region.image);
      restartAnimation();
    };

    const setRoute = (name) => {
      const route = routes[name];
      if (!route) return;
      selectedRoute = name;
      tram.dataset.route = name;
      tram.style.setProperty("--route-color", route.color);
      routeButtons.forEach((button) => {
        const active = button.dataset.tramRoute === name;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      restartAnimation();
    };

    const moveLens = (event) => {
      const rect = stage.getBoundingClientRect();
      const x = Math.max(0.08, Math.min(0.92, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0.14, Math.min(0.86, (event.clientY - rect.top) / rect.height));
      lens.style.left = `${x * 100}%`;
      lens.style.top = `${y * 100}%`;
      lens.style.backgroundPosition = `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
      if (selectedRegion === "network") {
        const image = x < 0.52 ? "assets/images/projects/tramtrace-parramatta-1920.jpg" : "assets/images/projects/tramtrace-cbd-1920.jpg";
        lensLabel.textContent = x < 0.52 ? "Parramatta / macro" : "CBD / macro";
        setLensImage(image);
      }
    };

    regionButtons.forEach((button) => button.addEventListener("click", () => setRegion(button.dataset.tramRegion)));
    routeButtons.forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.tramRoute)));
    stage.addEventListener("pointermove", moveLens, {passive: true});
    stage.addEventListener("pointerdown", moveLens, {passive: true});
    window.addEventListener("resize", () => drawTram(0), {passive: true});
    reducedMotion.addEventListener("change", restartAnimation);

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        restartAnimation();
      }, {rootMargin: "120px"});
      observer.observe(tram);
    }

    setRegion("network");
    setRoute("l1");
  }
})();
