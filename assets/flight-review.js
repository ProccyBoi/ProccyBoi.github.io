(() => {
  "use strict";

  const MAX_FILE_BYTES = 150 * 1024 * 1024;
  const EARTH_RADIUS_M = 6_371_000;
  const OPEN_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
  const TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";
  const MAPTILER_SATELLITE_TILEJSON = "https://api.maptiler.com/tiles/satellite-v2/tiles.json";
  const MAPTILER_PUBLIC_KEY = "uMM1IyZJAqYFTiSXX7J4";
  const MAPTILER_KEY_STORAGE = "skylabs.flightReview.maptilerKey";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const number = (value) => {
    if (value === null || value === undefined || value === "") return NaN;
    const parsed = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const radians = (degrees) => Number(degrees || 0) * Math.PI / 180;
  const wrapDegrees = (degrees) => ((Number(degrees || 0) + 180) % 360 + 360) % 360 - 180;
  const formatFixed = (value, digits = 1, suffix = "") => finite(value) ? `${Number(value).toFixed(digits)}${suffix}` : "—";
  const formatInteger = (value) => finite(value) ? Math.round(Number(value)).toLocaleString() : "—";
  const escapeCsv = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const formatTime = (seconds) => {
    const value = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = Math.floor(value % 60);
    const millis = Math.floor((value - Math.floor(value)) * 1000 + 1e-6);
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  };
  const formatDuration = (seconds) => {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours ? `${hours}h ${minutes}m ${secs}s` : `${minutes}m ${String(secs).padStart(2, "0")}s`;
  };
  const median = (values) => {
    const clean = values.filter(finite).map(Number).sort((a, b) => a - b);
    if (!clean.length) return NaN;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  };
  const circularMeanDegrees = (values) => {
    const clean = values.filter(finite).map(radians);
    if (!clean.length) return 0;
    const sin = clean.reduce((sum, value) => sum + Math.sin(value), 0) / clean.length;
    const cos = clean.reduce((sum, value) => sum + Math.cos(value), 0) / clean.length;
    return Math.atan2(sin, cos) * 180 / Math.PI;
  };
  const firstFinite = (values, fallback = NaN) => {
    const found = values.find(finite);
    return found === undefined ? fallback : Number(found);
  };
  const rangeOf = (values) => {
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
      if (!finite(value)) continue;
      min = Math.min(min, Number(value));
      max = Math.max(max, Number(value));
    }
    return min === Infinity ? [NaN, NaN] : [min, max];
  };
  const maxOf = (values) => rangeOf(values)[1];
  const lastFinite = (values, fallback = NaN) => {
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (finite(values[index])) return Number(values[index]);
    }
    return fallback;
  };

  const elements = {
    onboarding: $("[data-onboarding]"),
    loading: $("[data-loading]"),
    workspace: $("[data-workspace]"),
    fileInput: $("[data-flight-file]"),
    dropzone: $("[data-dropzone]"),
    loadingTitle: $("[data-loading-title]"),
    loadingDetail: $("[data-loading-detail]"),
    loadingProgress: $("[data-loading-progress]"),
    toast: $("[data-toast]"),
    schemaDialog: $("[data-schema-dialog]"),
    timeline: $("[data-timeline]"),
    play: $("[data-play]"),
    playIcon: $("[data-play-icon]"),
    currentTime: $("[data-current-time]"),
    totalTime: $("[data-total-time]"),
    sampleReadout: $("[data-sample-readout]"),
    rate: $("[data-playback-rate]"),
    cameraMode: $("[data-camera-mode]"),
    heightSource: $("[data-height-source]"),
    verticalScale: $("[data-vertical-scale]"),
    mapBasemap: $("[data-map-basemap]"),
    terrainClearance: $("[data-terrain-clearance]"),
    terrainClearanceStatus: $("[data-terrain-clearance-status]"),
    vegetationStatus: $("[data-vegetation-status]"),
    satelliteDialog: $("[data-satellite-dialog]"),
    satelliteForm: $("[data-satellite-form]"),
    satelliteKey: $("[data-satellite-key]"),
    satelliteError: $("[data-satellite-error]"),
    satelliteSave: $("[data-satellite-save]"),
    satelliteSettings: $("[data-satellite-settings]"),
    terrainHost: $("#flight-terrain-map"),
    mapSetup: $("[data-map-setup]"),
    mapSetupTitle: $("[data-map-setup-title]"),
    mapSetupCopy: $("[data-map-setup-copy]"),
    mapRetry: $("[data-map-retry]"),
    localHost: $("#flight-local-3d"),
    horizonWorld: $("[data-horizon-world]"),
    healthList: $("[data-health-list]"),
    sampleGrid: $("[data-sample-grid]"),
    sourceDetails: $("[data-source-details]")
  };

  const state = {
    model: null,
    index: 0,
    view: "charts",
    loadId: 0,
    parseJob: null,
    viewId: 0,
    playbackFrame: 0,
    seekFrame: 0,
    sampleValues: [],
    playing: false,
    playbackTime: 0,
    lastAnimationTime: null,
    level: null,
    levelLabel: "Raw IMU",
    localViewer: null,
    terrainViewer: null,
    charts: [],
    chartResizeObserver: null,
    toastTimer: null,
    lastMapCameraUpdate: 0
  };

  function toast(message, isError = false) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.style.borderColor = isError ? "rgba(255,143,112,.55)" : "";
    elements.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, isError ? 7000 : 3200);
  }

  function setLoading(title, detail, percent) {
    elements.loadingTitle.textContent = title;
    elements.loadingDetail.textContent = detail;
    elements.loadingProgress.style.width = `${clamp(percent, 1, 100)}%`;
  }

  function showLoading() {
    setPlaying(false);
    state.localViewer?.pause();
    elements.onboarding.hidden = true;
    elements.workspace.hidden = true;
    elements.loading.hidden = false;
    setLoading("Validating log structure", "Your file is processed locally.", 12);
    $("[data-cancel-load]").focus({ preventScroll: true });
  }

  function showOnboarding() {
    setPlaying(false);
    elements.loading.hidden = true;
    elements.workspace.hidden = true;
    elements.onboarding.hidden = false;
  }

  const runtimeLoads = new Map();
  function loadRuntime(path, globalName) {
    if (window[globalName]) return Promise.resolve();
    if (runtimeLoads.has(path)) return runtimeLoads.get(path);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error) { runtimeLoads.delete(path); script.remove(); reject(error); }
        else resolve();
      };
      const timer = window.setTimeout(() => finish(new Error("The rendering library took too long to load. Check your connection and retry.")), 20000);
      script.src = path;
      script.async = true;
      script.onload = () => finish(window[globalName] ? null : new Error("The rendering library could not be initialized."));
      script.onerror = () => finish(new Error("The rendering library could not load. Check your connection and retry."));
      document.head.append(script);
    });
    runtimeLoads.set(path, promise);
    return promise;
  }

  function loadMapStyles() {
    const path = "assets/vendor/maplibre-gl.css?v=5.24.0";
    if (runtimeLoads.has(path)) return runtimeLoads.get(path);
    const promise = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error) { runtimeLoads.delete(path); link.remove(); reject(error); }
        else resolve();
      };
      const timer = window.setTimeout(() => finish(new Error("Map styles took too long to load. Retry terrain.")), 20000);
      link.rel = "stylesheet"; link.href = path;
      link.onload = () => finish();
      link.onerror = () => finish(new Error("Map styles could not load. Retry terrain."));
      document.head.append(link);
    });
    runtimeLoads.set(path, promise);
    return promise;
  }

  function cancelParsing() {
    state.loadId += 1;
    state.parseJob?.cancel();
    state.parseJob = null;
  }

  async function parseFlightFile(file, requestId) {
    if (!file || !file.size) throw new Error("The selected file is empty.");
    if (file.size > MAX_FILE_BYTES) throw new Error("This file is larger than the 150 MB browser limit.");
    if (!window.Worker) throw new Error("This browser cannot run the local file parser. Open this page in a current browser.");
    const buffer = await file.arrayBuffer();
    if (requestId !== state.loadId) throw new DOMException("Cancelled", "AbortError");
    return new Promise((resolve, reject) => {
      const worker = new Worker("assets/flight-review-worker.js?v=20261019-1");
      const finish = (error, model) => {
        worker.terminate();
        if (state.parseJob?.worker === worker) state.parseJob = null;
        error ? reject(error) : resolve(model);
      };
      state.parseJob = { worker, cancel: () => finish(new DOMException("Cancelled", "AbortError")) };
      worker.onmessage = ({ data }) => {
        if (data.requestId !== requestId || requestId !== state.loadId) return;
        if (data.type === "progress") setLoading(data.title, data.detail, data.percent);
        if (data.type === "complete") finish(null, data.model);
        if (data.type === "error") finish(new Error(data.message));
      };
      worker.onerror = () => finish(new Error("The local parser could not start or ran out of memory. Try a smaller file or reload and retry."));
      worker.onmessageerror = () => finish(new Error("The parsed file could not be read. Try a smaller log."));
      worker.postMessage({ type: "parse", requestId, buffer, file: { name: file.name, size: file.size } }, [buffer]);
    });
  }

  function buildHealthItems(model) {
    const items = [];
    const add = (level, title, detail) => items.push({ level, title, detail });
    const peakSdErrors = maxOf(model.series.sdErrors);
    if (peakSdErrors > 0) add("critical", "SD write errors recorded", `Highest recorded count: ${formatInteger(peakSdErrors)}.`);
    else if (finite(model.stats.sdErrors)) add("good", "SD error counter", `Final recorded count: ${formatInteger(model.stats.sdErrors)}.`);

    if (model.stats.overruns > Math.max(10, model.count * 0.05)) add("warning", "Logging timing pressure", `${formatInteger(model.stats.overruns)} firmware overruns accumulated; median interval was ${formatFixed(model.stats.logDtMedian, 1, " ms")}.`);
    else add("info", "Recorded cadence", `Median sample interval ${formatFixed(model.stats.logDtMedian, 1, " ms")}.${finite(model.stats.overruns) ? "" : " Overrun counter unavailable."}`);

    if (!model.hasGps) add("critical", "No usable GNSS track", "Latitude and longitude are missing or do not contain a valid fix.");
    else if (model.stats.validGpsPercent < 80 || model.stats.gnssHAccMedian > 5) add("warning", "GNSS quality reduced", `${model.stats.validGpsPercent.toFixed(1)}% valid fixes; median HAcc ${formatFixed(model.stats.gnssHAccMedian, 2, " m")}.`);
    else if (!finite(model.stats.gnssHAccMedian)) add("info", "GNSS coordinates available", `${model.stats.validGpsPercent.toFixed(1)}% valid fixes. Horizontal accuracy was not recorded.`);
    else add("good", "GNSS track usable", `${model.stats.validGpsPercent.toFixed(1)}% valid fixes; median HAcc ${formatFixed(model.stats.gnssHAccMedian, 2, " m")}.`);

    if (finite(model.stats.ekfHUncFinal) && (model.stats.ekfHUncFinal > 50 || model.stats.ekfVelUncFinal > 10)) {
      add("warning", "EKF solution diverged", `Final horizontal uncertainty ${formatFixed(model.stats.ekfHUncFinal, 1, " m")}; prefer the raw GNSS track.`);
    } else if (finite(model.stats.ekfHUncFinal)) {
      add("good", "EKF uncertainty bounded", `Final horizontal uncertainty ${formatFixed(model.stats.ekfHUncFinal, 1, " m")}.`);
    }

    const hasAirspeed = seriesHasSignal(model.series.airspeed, 0.5);
    const hasEsc = seriesHasSignal(model.series.voltage, 0.5) || seriesHasSignal(model.series.rpm, 10);
    if (!hasAirspeed || !hasEsc) add("info", "Optional channels absent", `${!hasAirspeed ? "Airspeed" : ""}${!hasAirspeed && !hasEsc ? " and " : ""}${!hasEsc ? "ESC telemetry" : ""} did not contain a usable signal.`);
    if (model.stats.imuResets > 0) add("warning", "IMU resets recorded", `${formatInteger(model.stats.imuResets)} reset events were counted.`);
    const attitudeComplete = ["roll", "pitch", "yaw"].every((key) => model.series[key].every(finite));
    if (attitudeComplete) add("info", "Attitude recorded", `Roll, pitch and yaw are present for every sample.${finite(model.stats.imuResets) ? "" : " Reset counter unavailable."}`);
    else add("info", "Attitude incomplete", "Missing attitude values are unavailable; the 3D orientation is illustrative.");
    if (!finite(model.stats.sdErrors)) add("info", "SD error counter unavailable", "This log does not include an SD write error count.");
    return items;
  }

  function seriesHasSignal(values, threshold = 0) {
    const [min, max] = rangeOf(values);
    return finite(min) && finite(max) && (Math.abs(min) > threshold || Math.abs(max) > threshold || Math.abs(max - min) > threshold);
  }

  function eulerToQuat(roll, pitch, yaw) {
    const hr = radians(roll) / 2;
    const hp = radians(pitch) / 2;
    const hy = radians(yaw) / 2;
    const cr = Math.cos(hr), sr = Math.sin(hr), cp = Math.cos(hp), sp = Math.sin(hp), cy = Math.cos(hy), sy = Math.sin(hy);
    return [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy];
  }

  function quatMultiply(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    ];
  }

  function quatToEuler(q) {
    const [w, x, y, z] = q;
    const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    const pitch = Math.asin(clamp(2 * (w * y - z * x), -1, 1));
    const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    return { roll: roll * 180 / Math.PI, pitch: pitch * 180 / Math.PI, yaw: yaw * 180 / Math.PI };
  }

  function displayedAttitude(index) {
    const model = state.model;
    const raw = { roll: model.series.roll[index], pitch: model.series.pitch[index], yaw: model.series.yaw[index] };
    if (!state.level || !finite(raw.roll) || !finite(raw.pitch) || !finite(raw.yaw)) return raw;
    const levelQuat = eulerToQuat(state.level.roll, state.level.pitch, state.level.yaw);
    const conjugate = [levelQuat[0], -levelQuat[1], -levelQuat[2], -levelQuat[3]];
    return quatToEuler(quatMultiply(conjugate, eulerToQuat(raw.roll, raw.pitch, raw.yaw)));
  }

  function populateWorkspace(model) {
    state.viewId += 1;
    disposeTerrainViewer();
    disposeLocalViewer();
    elements.terrainHost.replaceChildren();
    showTerrainStatus("loading");
    state.model = model;
    state.index = 0;
    state.playing = false;
    state.playbackTime = 0;
    state.lastAnimationTime = null;
    state.level = { ...model.defaultLevel };
    state.levelLabel = "Auto-level";

    $("[data-file-name]").textContent = model.meta.name;
    $("[data-format-badge]").textContent = `${model.meta.format} ${model.meta.schema}`;
    $("[data-file-detail]").textContent = `${(model.meta.size / 1024 / 1024).toFixed(2)} MB · ${formatInteger(model.count)} usable samples · parsed locally`;
    $("[data-summary-duration]").textContent = formatDuration(model.stats.duration);
    $("[data-summary-window]").textContent = `${formatTime(0)}–${formatTime(model.stats.duration)}`;
    $("[data-summary-track]").textContent = model.hasGps ? (model.stats.trackDistance >= 1000 ? `${(model.stats.trackDistance / 1000).toFixed(2)} km` : `${model.stats.trackDistance.toFixed(0)} m`) : "No track";
    const peakSpeed = model.hasGps ? model.stats.peakGroundSpeed : maxOf(model.series.groundSpeedInput);
    $("[data-summary-speed]").textContent = formatFixed(peakSpeed, 1, " m/s");
    $("[data-summary-speed-kmh]").textContent = finite(peakSpeed) ? `${(peakSpeed * 3.6).toFixed(1)} km/h` : "Unavailable";
    $("[data-summary-altitude]").textContent = finite(model.stats.baroMin) ? `${model.stats.baroMin.toFixed(1)}–${model.stats.baroMax.toFixed(1)} m` : "Unavailable";
    $("[data-summary-climb]").textContent = finite(model.stats.baroClimb) ? `${model.stats.baroClimb.toFixed(1)} m recorded range` : "No barometer column";
    $("[data-summary-gnss]").textContent = model.hasGps ? formatFixed(model.stats.gnssHAccMedian, 2, " m HAcc") : "No fix";
    $("[data-summary-sats]").textContent = model.hasGps ? `${formatFixed(model.stats.satsMedian, 0)} median satellites` : "Map unavailable";
    $("[data-summary-rate]").textContent = formatFixed(model.stats.sampleRate, 1, " Hz");
    $("[data-summary-records]").textContent = `${formatInteger(model.count)} records · ${formatFixed(model.stats.logDtMedian, 1, " ms dt")}`;

    elements.timeline.max = String(model.count - 1);
    elements.timeline.value = "0";
    elements.totalTime.textContent = `/ ${formatTime(model.stats.duration)}`;
    renderHealth(model);
    renderSourceDetails(model);
    buildCharts(model);
    elements.loading.hidden = true;
    elements.onboarding.hidden = true;
    elements.workspace.hidden = false;

    switchView("charts");
    updateFrame(0, true);
    $("[data-view-button='charts']").focus({ preventScroll: true });
  }

  function renderHealth(model) {
    const items = buildHealthItems(model);
    const colors = { good: "#9fb5a0", warning: "#d5b778", critical: "#d99078", info: "#d4d1c5" };
    elements.healthList.replaceChildren(...items.map((item) => {
      const wrapper = document.createElement("div");
      wrapper.className = "flight-health-item";
      wrapper.style.setProperty("--health-color", colors[item.level]);
      const dot = document.createElement("i");
      dot.setAttribute("aria-hidden", "true");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const detail = document.createElement("p");
      title.textContent = item.title;
      detail.textContent = item.detail;
      copy.append(title, detail);
      wrapper.append(dot, copy);
      return wrapper;
    }));
    const alerts = items.filter((item) => ["warning", "critical"].includes(item.level)).length;
    $("[data-health-count]").textContent = alerts ? `${alerts} alert${alerts === 1 ? "" : "s"}` : (!finite(model.stats.sdErrors) || !finite(model.stats.gnssHAccMedian) ? "Limited data" : "No flagged issues");
  }

  function renderSourceDetails(model) {
    const details = [
      ["Source", model.meta.source],
      ["Format", `${model.meta.format} ${model.meta.schema}`],
      ["Source rows", formatInteger(model.meta.sourceRecords)],
      ["Usable rows", formatInteger(model.meta.usableRecords)],
      ["Parser", model.meta.format === "SKYLBIN1" ? "Direct little-endian DataView" : "SheetJS header mapping"],
      ["Position", model.hasGps ? "Valid GNSS fixes; gaps interpolated for display and normalized export" : "No geodetic solution"],
      ["Ground speed", model.hasGps ? "Derived from position; not measured airspeed" : model.series.groundSpeedInput.some(finite) ? "Supplied ground speed; no usable position track" : "Unavailable; no usable position or supplied speed"],
      ["Height", finite(model.origin.baroAlt) ? "Barometer default · GNSS optional" : "GNSS"],
      ["Privacy", "Processed in browser memory"]
    ];
    if (model.meta.recordSize) details.splice(2, 0, ["Record size", `${model.meta.recordSize} bytes`]);
    elements.sourceDetails.replaceChildren(...details.map(([label, value]) => {
      const wrapper = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      wrapper.append(dt, dd);
      return wrapper;
    }));
  }

  const SAMPLE_FIELDS = [
    ["time", "Time", (model, index) => formatTime(model.series.time[index])],
    ["rawLatitude", "Recorded latitude", (model, index) => formatFixed(model.series.lat[index], 7)],
    ["rawLongitude", "Recorded longitude", (model, index) => formatFixed(model.series.lon[index], 7)],
    ["latitude", "Display latitude (gap-filled)", (model, index) => formatFixed(model.lat[index], 7)],
    ["longitude", "Display longitude (gap-filled)", (model, index) => formatFixed(model.lon[index], 7)],
    ["baroAlt", "Barometric altitude", (model, index) => formatFixed(model.baroFilled[index], 2, " m")],
    ["gnssAlt", "GNSS altitude", (model, index) => formatFixed(model.gnssAltFilled[index], 2, " m")],
    ["speed", "Ground speed", (model, index) => formatFixed(model.hasGps ? model.groundSpeed[index] : model.series.groundSpeedInput[index], 2, " m/s")],
    ["roll", "Roll", (model, index) => formatFixed(model.series.roll[index], 2, "°")],
    ["pitch", "Pitch", (model, index) => formatFixed(model.series.pitch[index], 2, "°")],
    ["yaw", "Yaw", (model, index) => formatFixed(model.series.yaw[index], 2, "°")],
    ["sats", "Satellites", (model, index) => formatFixed(model.series.sats[index], 0)],
    ["hacc", "GNSS HAcc", (model, index) => formatFixed(model.series.gnssHAcc[index], 2, " m")],
    ["logDt", "Log interval", (model, index) => formatFixed(model.series.logDt[index], 1, " ms")],
    ["airspeed", "Airspeed", (model, index) => formatFixed(model.series.airspeed[index], 2, " m/s")],
    ["voltage", "ESC voltage", (model, index) => formatFixed(model.series.voltage[index], 2, " V")],
    ["current", "ESC current", (model, index) => formatFixed(model.series.current[index], 2, " A")],
    ["rpm", "ESC RPM", (model, index) => formatFixed(model.series.rpm[index], 0)]
  ];

  function updateSampleInspector(index) {
    const model = state.model;
    $("[data-sample-heading]").textContent = `Sample ${formatInteger(index + 1)} of ${formatInteger(model.count)}`;
    if (state.sampleValues.length !== SAMPLE_FIELDS.length) {
      state.sampleValues = [];
      elements.sampleGrid.replaceChildren(...SAMPLE_FIELDS.map(([, label]) => {
        const wrapper = document.createElement("div");
        const span = document.createElement("span");
        const strong = document.createElement("strong");
        span.textContent = label;
        state.sampleValues.push(strong);
        wrapper.append(span, strong);
        return wrapper;
      }));
    }
    SAMPLE_FIELDS.forEach(([, , value], field) => { state.sampleValues[field].textContent = value(model, index); });
  }

  function sampleObject(index) {
    const model = state.model;
    return {
      sample: index + 1,
      time_s: model.series.time[index],
      recorded_latitude: model.series.lat[index],
      recorded_longitude: model.series.lon[index],
      position_interpolated: !model.validGps[index],
      latitude: model.lat[index],
      longitude: model.lon[index],
      barometric_altitude_m: model.baroFilled[index],
      gnss_altitude_m: model.gnssAltFilled[index],
      ground_speed_mps: model.hasGps ? model.groundSpeed[index] : model.series.groundSpeedInput[index],
      roll_deg: model.series.roll[index],
      pitch_deg: model.series.pitch[index],
      yaw_deg: model.series.yaw[index],
      satellites: model.series.sats[index],
      gnss_h_acc_m: model.series.gnssHAcc[index],
      log_dt_ms: model.series.logDt[index]
    };
  }

  function setPlaying(playing) {
    state.playing = Boolean(playing && state.model && !document.hidden);
    if (state.playbackFrame) window.cancelAnimationFrame(state.playbackFrame);
    state.playbackFrame = 0;
    if (state.playing) state.playbackFrame = window.requestAnimationFrame(animatePlayback);
    state.lastAnimationTime = null;
    elements.play.setAttribute("aria-label", state.playing ? "Pause flight replay" : "Play flight replay");
    elements.playIcon.setAttribute("d", state.playing ? "M7 5h4v14H7zM14 5h4v14h-4z" : "m8 5 11 7-11 7z");
  }

  function findIndexAtTime(time) {
    const values = state.model.series.time;
    let low = 0;
    let high = values.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (values[middle] <= time) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  function updateFrame(index, force = false, fromPlayback = false) {
    const model = state.model;
    if (!model) return;
    const next = clamp(Math.round(index), 0, model.count - 1);
    if (next === state.index && !force) return;
    state.index = next;
    if (!fromPlayback) state.playbackTime = model.series.time[next];
    elements.timeline.value = String(next);
    elements.timeline.setAttribute("aria-valuetext", `${formatTime(model.series.time[next])}, sample ${next + 1} of ${model.count}`);
    elements.currentTime.textContent = formatTime(model.series.time[next]);
    elements.sampleReadout.textContent = `${formatInteger(next + 1)} / ${formatInteger(model.count)}`;
    $("[data-hud-time]").textContent = formatTime(model.series.time[next]);
    $("[data-hud-speed]").textContent = formatFixed(model.hasGps ? model.groundSpeed[next] : model.series.groundSpeedInput?.[next], 1, " m/s");
    const shownAltitude = elements.heightSource.value === "gps" ? model.gnssAltFilled[next] : model.baroFilled[next];
    $("[data-hud-altitude]").textContent = formatFixed(shownAltitude, 1, " m");
    $("[data-hud-position]").textContent = model.hasGps ? `${formatFixed(model.lat[next], 5)}, ${formatFixed(model.lon[next], 5)}` : `${formatFixed(model.east[next], 1)} E · ${formatFixed(model.north[next], 1)} N`;

    const attitude = displayedAttitude(next);
    $("[data-roll]").textContent = formatFixed(attitude.roll, 1, "°");
    $("[data-pitch]").textContent = formatFixed(attitude.pitch, 1, "°");
    $("[data-yaw]").textContent = formatFixed(attitude.yaw, 1, "°");
    $("[data-attitude-mode]").textContent = state.levelLabel;
    elements.horizonWorld.style.transform = `translateY(${clamp(Number(attitude.pitch) || 0, -35, 35) * 1.15}px) rotate(${-Number(attitude.roll || 0)}deg)`;
    $("[data-heading-tape]").textContent = headingLabel(attitude.yaw);

    $("[data-latitude]").textContent = model.hasGps ? formatFixed(model.lat[next], 7) : "—";
    $("[data-longitude]").textContent = model.hasGps ? formatFixed(model.lon[next], 7) : "—";
    $("[data-gnss-altitude]").textContent = formatFixed(model.gnssAltFilled[next], 1, " m");
    $("[data-baro-height]").textContent = formatFixed(model.baroUp[next], 1, " m");
    $("[data-satellites]").textContent = formatFixed(model.series.sats[next], 0);
    $("[data-hacc]").textContent = formatFixed(model.series.gnssHAcc[next], 2, " m");
    $("[data-fix-status]").textContent = model.validGps[next] ? "Valid fix" : "No fix";

    if (state.view === "samples") updateSampleInspector(next);
    if (state.view === "local") updateLocalViewer(next);
    if (state.view === "terrain") updateTerrainViewer(next);
    if (state.view === "charts") updateChartCursors();
  }

  function headingLabel(yaw) {
    if (!finite(yaw)) return "—";
    const normalized = ((Number(yaw) % 360) + 360) % 360;
    const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const degrees = Math.round(normalized) % 360;
    return `${points[Math.round(normalized / 45) % 8]} ${String(degrees).padStart(3, "0")}°`;
  }

  async function prepareView(view, model, viewId) {
    const current = () => state.model === model && state.viewId === viewId && state.view === view;
    try {
      if (view === "local" && !state.localViewer) {
        elements.localHost.textContent = "Loading local 3D replay…";
        await loadRuntime("assets/vendor/three.min.js", "THREE");
        if (!current()) return;
        state.localViewer = createLocalViewer(model);
      }
      if (view === "terrain" && !state.terrainViewer) {
        showTerrainStatus("loading");
        await Promise.all([loadMapStyles(), loadRuntime("assets/vendor/three.min.js", "THREE"), loadRuntime("assets/vendor/maplibre-gl.js?v=5.24.0", "maplibregl")]);
        if (!current()) return;
        initializeTerrainViewer(model);
      }
      if (!current()) return;
      if (view === "local") { state.localViewer?.resize(); updateLocalViewer(state.index); }
      if (view === "terrain" && state.terrainViewer) { state.terrainViewer.map.resize(); updateTerrainViewer(state.index, true); }
    } catch (error) {
      if (!current()) return;
      if (view === "terrain") { disposeTerrainViewer(); showTerrainStatus("error", error.message); }
      else {
        disposeLocalViewer();
        const message = document.createElement("p");
        message.textContent = "Local 3D is unavailable in this browser. Traces and samples are still available.";
        const retry = document.createElement("button");
        retry.type = "button"; retry.className = "flight-button"; retry.textContent = "Retry local 3D";
        retry.onclick = () => switchView("local");
        elements.localHost.replaceChildren(message, retry);
      }
    }
  }

  function switchView(view) {
    if (view === "terrain" && state.model && !state.model.hasGps) {
      toast("This log has no usable GNSS coordinates. Traces and samples are still available.", true);
      view = "charts";
    }
    state.view = view;
    const viewId = ++state.viewId;
    $$('[data-view-button]').forEach((button) => {
      const selected = button.dataset.viewButton === view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $$('[data-view]').forEach((panel) => {
      const active = panel.dataset.view === view;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    const overlayVisible = ["terrain", "local"].includes(view);
    $("[data-flight-hud]").hidden = !overlayVisible;
    $("[data-visual-controls]").hidden = !overlayVisible;
    $$('[data-map-only-control]').forEach((control) => {
      control.hidden = view !== "terrain" || control === elements.satelliteSettings && elements.mapBasemap.value !== "satellite";
    });
    if (view !== "local") state.localViewer?.pause();
    if (view !== "terrain") state.terrainViewer?.map.stop();
    if (view === "charts") drawAllCharts();
    if (view === "samples" && state.model) updateSampleInspector(state.index);
    if (overlayVisible && state.model) prepareView(view, state.model, viewId);
  }

  function setLevel(level, label) {
    state.level = level;
    state.levelLabel = label;
    updateFrame(state.index, true, state.playing);
  }

  function drawAllCharts() {
    if (!state.model) return;
    for (const chart of state.charts) drawChart(chart);
    updateChartCursors();
  }

  function buildCharts(model) {
    state.charts.forEach((chart) => chart.cursor?.remove());
    state.charts = [
      {
        canvas: $('[data-chart="attitude"]'),
        series: [
          { values: model.series.roll, color: "#7bbcff", unit: "°" },
          { values: model.series.pitch, color: "#d4d1c5", unit: "°" },
          { values: model.series.yaw, color: "#d5b778", unit: "°" }
        ]
      },
      {
        canvas: $('[data-chart="altitude"]'),
        series: [
          { values: model.baroFilled, color: "#7bbcff", unit: "m" },
          { values: model.gnssAltFilled, color: "#b8abd1", unit: "m" }
        ]
      },
      {
        canvas: $('[data-chart="speed"]'),
        series: [
          { values: model.hasGps ? model.groundSpeed : model.series.groundSpeedInput, color: "#d5b778", unit: "m/s" },
          { values: model.series.airspeed, color: "#d99078", unit: "m/s" }
        ]
      },
      {
        canvas: $('[data-chart="quality"]'),
        independentScale: true,
        series: [
          { values: model.series.logDt, color: "#d4d1c5", unit: "ms" },
          { values: model.series.gnssHAcc, color: "#d99078", unit: "m" }
        ]
      }
    ];
    if (state.chartResizeObserver) state.chartResizeObserver.disconnect();
    state.chartResizeObserver = new ResizeObserver(() => state.view === "charts" && drawAllCharts());
    for (const chart of state.charts) {
      chart.ranges = chart.series.map((series) => rangeOf(series.values));
      chart.sharedRange = paddedRange(chart.ranges.flat());
      chart.cursor = document.createElement("span");
      chart.cursor.className = "flight-chart-cursor";
      chart.cursor.setAttribute("aria-hidden", "true");
      chart.canvas.parentElement.append(chart.cursor);
      state.chartResizeObserver.observe(chart.canvas);
      const scrub = (event) => {
        const rect = chart.canvas.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left - 42) / Math.max(1, rect.width - 54), 0, 1);
        queueSeek(findIndexAtTime(ratio * model.stats.duration));
      };
      chart.canvas.onpointerdown = (event) => { chart.canvas.setPointerCapture(event.pointerId); scrub(event); };
      chart.canvas.onpointermove = (event) => { if (chart.canvas.hasPointerCapture(event.pointerId)) scrub(event); };
      chart.canvas.onpointerup = (event) => { scrub(event); if (chart.canvas.hasPointerCapture(event.pointerId)) chart.canvas.releasePointerCapture(event.pointerId); };
      chart.canvas.onpointercancel = (event) => { if (chart.canvas.hasPointerCapture(event.pointerId)) chart.canvas.releasePointerCapture(event.pointerId); };
    }
  }

  function queueSeek(index) {
    setPlaying(false);
    state.pendingSeek = index;
    if (state.seekFrame) return;
    state.seekFrame = window.requestAnimationFrame(() => {
      state.seekFrame = 0;
      updateFrame(state.pendingSeek, true);
    });
  }

  // Preserve first/last and extrema in each time-pixel bucket. A missing value
  // always breaks the line. This is display-only: samples and exports stay full-resolution.
  function chartVertices(values, time, duration, pixels) {
    const result = [];
    let bucket = -1, first = -1, last = -1, min = -1, max = -1;
    const flush = () => {
      if (first < 0) return;
      const indices = [...new Set([first, min, max, last])].sort((a, b) => a - b);
      result.push(...indices);
      first = last = min = max = -1;
    };
    for (let index = 0; index < values.length; index += 1) {
      if (!finite(values[index])) { flush(); if (result[result.length - 1] !== -1) result.push(-1); bucket = -1; continue; }
      const nextBucket = Math.floor(time[index] / Math.max(duration, 1e-9) * pixels);
      if (nextBucket !== bucket) { flush(); bucket = nextBucket; }
      if (first < 0) first = min = max = index;
      last = index;
      if (values[index] < values[min]) min = index;
      if (values[index] > values[max]) max = index;
    }
    flush();
    return result;
  }

  function drawChart(chart) {
    const canvas = chart.canvas;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cacheKey = `${rect.width}:${rect.height}:${dpr}`;
    if (chart.cacheKey === cacheKey) return;
    chart.cacheKey = cacheKey;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const plot = chart.plot = { left: 42, right: width - 12, top: 8, bottom: height - 23 };
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#393a34";
    context.fillStyle = "#aaa99f";
    context.font = "10px 'IBM Plex Mono', Consolas, monospace";
    context.lineWidth = 1;
    for (let row = 0; row <= 4; row += 1) {
      const y = plot.top + (plot.bottom - plot.top) * row / 4;
      context.beginPath(); context.moveTo(plot.left, y); context.lineTo(plot.right, y); context.stroke();
    }
    for (let column = 0; column <= 4; column += 1) {
      const x = plot.left + (plot.right - plot.left) * column / 4;
      context.beginPath(); context.moveTo(x, plot.top); context.lineTo(x, plot.bottom); context.stroke();
      const time = state.model.stats.duration * column / 4;
      context.fillText(formatTime(time).replace(/\.\d{3}$/, ""), Math.min(x, plot.right - 35), height - 7);
    }
    const sharedRange = chart.sharedRange;
    const firstRange = chart.independentScale ? paddedRange(chart.ranges[0]) : sharedRange;
    context.fillText(`${formatAxis(firstRange[1])}${chart.series[0].unit}`, 2, plot.top + 4);
    context.fillText(`${formatAxis(firstRange[0])}${chart.series[0].unit}`, 2, plot.bottom);
    chart.series.forEach((definition, seriesIndex) => {
      const values = definition.values;
      const [low, high] = chart.independentScale ? paddedRange(chart.ranges[seriesIndex]) : sharedRange;
      if (!finite(low) || !finite(high)) return;
      context.strokeStyle = definition.color;
      context.lineWidth = 1.4;
      context.beginPath();
      let started = false;
      const indices = chartVertices(values, state.model.series.time, state.model.stats.duration, Math.ceil(plot.right - plot.left));
      for (const index of indices) {
        if (index < 0) { started = false; continue; }
        const x = plot.left + state.model.series.time[index] / Math.max(1e-9, state.model.stats.duration) * (plot.right - plot.left);
        const y = plot.bottom - (Number(values[index]) - low) / Math.max(1e-9, high - low) * (plot.bottom - plot.top);
        if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
      }
      context.stroke();
      if (chart.independentScale && seriesIndex > 0) {
        context.fillStyle = definition.color;
        context.textAlign = "right";
        context.fillText(`${formatAxis(high)}${definition.unit}`, plot.right, plot.top + 12);
        context.fillText(`${formatAxis(low)}${definition.unit}`, plot.right, plot.bottom - 4);
        context.textAlign = "left";
      }
    });
    chart.cursor.style.top = `${canvas.offsetTop + plot.top}px`;
    chart.cursor.style.height = `${plot.bottom - plot.top}px`;
  }

  function updateChartCursors() {
    if (!state.model) return;
    const ratio = state.model.series.time[state.index] / Math.max(1e-9, state.model.stats.duration);
    for (const chart of state.charts) {
      if (!chart.plot) continue;
      const x = chart.canvas.offsetLeft + chart.plot.left + ratio * (chart.plot.right - chart.plot.left);
      chart.cursor.style.top = `${chart.canvas.offsetTop + chart.plot.top}px`;
      chart.cursor.style.transform = `translateX(${x}px)`;
    }
  }

  function paddedRange(values) {
    let [low, high] = rangeOf(values);
    if (!finite(low) || !finite(high)) return [NaN, NaN];
    if (Math.abs(high - low) < 1e-9) { low -= 1; high += 1; }
    const pad = (high - low) * 0.06;
    return [low - pad, high + pad];
  }

  function formatAxis(value) {
    if (!finite(value)) return "—";
    const absolute = Math.abs(value);
    if (absolute >= 1000) return (value / 1000).toFixed(1) + "k";
    if (absolute >= 100) return value.toFixed(0);
    if (absolute >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function disposeLocalViewer() {
    if (!state.localViewer) return;
    state.localViewer.dispose();
    state.localViewer = null;
  }

  function createLocalViewer(model) {
    if (!window.THREE) {
      elements.localHost.textContent = "The local 3D runtime could not be loaded.";
      return null;
    }
    const THREE = window.THREE;
    elements.localHost.replaceChildren();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141412);
    scene.fog = new THREE.FogExp2(0x141412, 0.00038);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ("outputEncoding" in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    elements.localHost.append(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 50_000);
    const ambient = new THREE.HemisphereLight(0xb5e6d6, 0x193129, 1.1);
    const directional = new THREE.DirectionalLight(0xffffff, 0.72);
    directional.position.set(300, 500, 200);
    scene.add(ambient, directional);

    const eastRange = rangeOf(model.east);
    const northRange = rangeOf(model.north);
    const horizontalSpan = Math.max(50, eastRange[1] - eastRange[0], northRange[1] - northRange[0]);
    const gridSize = Math.pow(10, Math.ceil(Math.log10(horizontalSpan * 1.45)));
    const grid = new THREE.GridHelper(gridSize, 20, 0x4b4d44, 0x292a25);
    grid.position.y = 0;
    scene.add(grid);

    const compassMaterial = new THREE.LineBasicMaterial({ color: 0x7bbcff, transparent: true, opacity: 0.8 });
    const northArrowGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0, 0.4, -horizontalSpan * 0.22),
      new THREE.Vector3(0, 0.4, -horizontalSpan * 0.22), new THREE.Vector3(-horizontalSpan * 0.018, 0.4, -horizontalSpan * 0.19),
      new THREE.Vector3(0, 0.4, -horizontalSpan * 0.22), new THREE.Vector3(horizontalSpan * 0.018, 0.4, -horizontalSpan * 0.19)
    ]);
    scene.add(new THREE.LineSegments(northArrowGeometry, compassMaterial));

    const aircraft = new THREE.Group();
    const aircraftMaterial = new THREE.MeshStandardMaterial({ color: 0x7bbcff, emissive: 0x182b3c, roughness: 0.35, metalness: 0.12 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(1.3, 5.5, 4), aircraftMaterial);
    body.rotation.x = Math.PI / 2;
    body.position.z = -0.8;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.24, 1.2), aircraftMaterial);
    wing.position.z = 0.35;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.7), aircraftMaterial);
    tail.position.z = 2.1;
    aircraft.add(body, wing, tail);
    aircraft.scale.setScalar(Math.max(1, horizontalSpan / 260));
    scene.add(aircraft);

    const startRing = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(2, horizontalSpan / 120), Math.max(0.28, horizontalSpan / 1400), 12, 64),
      new THREE.MeshBasicMaterial({ color: 0x7bbcff })
    );
    startRing.rotation.x = Math.PI / 2;
    scene.add(startRing);

    let pathLine = null;
    let groundLine = null;
    let orbitTarget = new THREE.Vector3();
    let orbitDistance = horizontalSpan * 1.55;
    let orbitAzimuth = Math.PI * 0.23;
    let orbitElevation = 0.62;
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;
    let disposed = false;
    let renderFrame = 0;
    let inViewport = true;
    const pause = () => { if (renderFrame) window.cancelAnimationFrame(renderFrame); renderFrame = 0; };
    const invalidate = () => {
      if (disposed || !inViewport || renderFrame || state.view !== "local" || elements.workspace.hidden || document.hidden) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = 0;
        if (!disposed && inViewport && state.view === "local" && !elements.workspace.hidden && !document.hidden) renderer.render(scene, camera);
      });
    };

    const pointAt = (index) => {
      const source = elements.heightSource.value === "gps" ? model.gnssUp : model.baroUp;
      return new THREE.Vector3(model.east[index], source[index] * Number(elements.verticalScale.value), -model.north[index]);
    };

    const rebuildPath = () => {
      if (pathLine) { scene.remove(pathLine); pathLine.geometry.dispose(); pathLine.material.dispose(); }
      if (groundLine) { scene.remove(groundLine); groundLine.geometry.dispose(); groundLine.material.dispose(); }
      const positions = new Float32Array(model.count * 3);
      const colors = new Float32Array(model.count * 3);
      const ground = new Float32Array(model.count * 3);
      const lowColor = new THREE.Color(0x7bbcff);
      const highColor = new THREE.Color(0xf4c86a);
      const heights = elements.heightSource.value === "gps" ? model.gnssUp : model.baroUp;
      const verticalScale = Number(elements.verticalScale.value);
      for (let index = 0; index < model.count; index += 1) {
        positions[index * 3] = ground[index * 3] = model.east[index];
        positions[index * 3 + 1] = heights[index] * verticalScale;
        positions[index * 3 + 2] = ground[index * 3 + 2] = -model.north[index];
        ground[index * 3 + 1] = 0.25;
        const ratio = index / Math.max(1, model.count - 1);
        colors[index * 3] = lowColor.r + (highColor.r - lowColor.r) * ratio;
        colors[index * 3 + 1] = lowColor.g + (highColor.g - lowColor.g) * ratio;
        colors[index * 3 + 2] = lowColor.b + (highColor.b - lowColor.b) * ratio;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      pathLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.94 }));
      const groundGeometry = new THREE.BufferGeometry();
      groundGeometry.setAttribute("position", new THREE.BufferAttribute(ground, 3));
      groundLine = new THREE.Line(groundGeometry, new THREE.LineBasicMaterial({ color: 0x315f7e, transparent: true, opacity: 0.56 }));
      scene.add(groundLine, pathLine);
      startRing.position.copy(pointAt(0));
      startRing.position.y = 0.35;
    };

    const fit = () => {
      const points = [0, Math.floor(model.count / 2), model.count - 1].map(pointAt);
      const xCenter = (eastRange[0] + eastRange[1]) / 2;
      const zCenter = -(northRange[0] + northRange[1]) / 2;
      const upSource = elements.heightSource.value === "gps" ? model.gnssUp : model.baroUp;
      const upRange = rangeOf(upSource).map((value) => value * Number(elements.verticalScale.value));
      orbitTarget = new THREE.Vector3(xCenter, finite(upRange[0]) ? (upRange[0] + upRange[1]) / 2 : points[1].y, zCenter);
      orbitDistance = Math.max(horizontalSpan * 1.55, (finite(upRange[1]) ? upRange[1] - upRange[0] : 0) * 2.2, 70);
      updateCamera(true);
    };

    const updateCamera = (forceOrbit = false) => {
      invalidate();
      const mode = forceOrbit ? "orbit" : elements.cameraMode.value;
      const position = pointAt(state.index);
      if (mode === "follow") {
        const attitude = displayedAttitude(state.index);
        const heading = radians(attitude.yaw);
        const distance = Math.max(30, Math.min(110, orbitDistance * 0.16));
        camera.position.set(position.x - Math.sin(heading) * distance, position.y + distance * 0.35 + 8, position.z + Math.cos(heading) * distance);
        camera.lookAt(position.x, position.y + 2, position.z);
      } else if (mode === "top") {
        camera.position.set(position.x, position.y + Math.max(120, orbitDistance * 0.65), position.z + 0.01);
        camera.lookAt(position);
      } else {
        const horizontal = Math.cos(orbitElevation) * orbitDistance;
        camera.position.set(
          orbitTarget.x + Math.sin(orbitAzimuth) * horizontal,
          orbitTarget.y + Math.sin(orbitElevation) * orbitDistance,
          orbitTarget.z + Math.cos(orbitAzimuth) * horizontal
        );
        camera.lookAt(orbitTarget);
      }
    };

    const update = (index) => {
      invalidate();
      const point = pointAt(index);
      const attitude = displayedAttitude(index);
      aircraft.position.copy(point);
      aircraft.rotation.order = "YXZ";
      aircraft.rotation.set(radians(attitude.pitch), -radians(attitude.yaw), -radians(attitude.roll));
      updateCamera();
    };

    const resize = () => {
      const width = Math.max(1, elements.localHost.clientWidth);
      const height = Math.max(1, elements.localHost.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      invalidate();
    };

    renderer.domElement.addEventListener("pointerdown", (event) => {
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    });
    renderer.domElement.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - pointerX;
      const dy = event.clientY - pointerY;
      pointerX = event.clientX;
      pointerY = event.clientY;
      elements.cameraMode.value = "orbit";
      orbitAzimuth -= dx * 0.006;
      orbitElevation = clamp(orbitElevation + dy * 0.005, 0.08, 1.45);
      updateCamera();
    });
    renderer.domElement.addEventListener("pointerup", (event) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    });
    renderer.domElement.addEventListener("pointercancel", () => { dragging = false; });
    renderer.domElement.addEventListener("wheel", (event) => {
      event.preventDefault();
      orbitDistance = clamp(orbitDistance * Math.exp(event.deltaY * 0.001), 12, 25_000);
      elements.cameraMode.value = "orbit";
      updateCamera();
    }, { passive: false });
    const observer = new ResizeObserver(resize);
    observer.observe(elements.localHost);
    const visibilityObserver = typeof IntersectionObserver === "function" ? new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      if (inViewport) invalidate(); else pause();
    }) : null;
    visibilityObserver?.observe(elements.localHost);

    rebuildPath();
    fit();
    resize();
    update(0);
    invalidate();

    return {
      update,
      pause,
      resize,
      fit,
      rebuildPath: () => { rebuildPath(); fit(); update(state.index); },
      dispose: () => {
        disposed = true;
        pause();
        observer.disconnect();
        visibilityObserver?.disconnect();
        scene.traverse((object) => {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
          else object.material?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }

  function updateLocalViewer(index) {
    state.localViewer?.update(index);
  }

  function decimatedTerrainIndices() {
    const model = state.model;
    const maxPoints = 1800;
    const stride = Math.max(1, Math.ceil(model.count / maxPoints));
    const indices = [];
    for (let index = 0; index < model.count; index += stride) {
      if (!finite(model.lat[index]) || !finite(model.lon[index])) continue;
      indices.push(index);
    }
    const last = model.count - 1;
    if (indices.length && indices[indices.length - 1] !== last && finite(model.lat[last]) && finite(model.lon[last])) {
      indices.push(last);
    }
    return indices;
  }

  function terrainTrackGeoJson() {
    const model = state.model;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: decimatedTerrainIndices().map((index) => [model.lon[index], model.lat[index]])
      }
    };
  }

  function terrainMarkerGeoJson(currentIndex = state.index) {
    const model = state.model;
    if (!model.markerEndpoints) {
      let first = -1, last = -1;
      for (let index = 0; index < model.count; index += 1) {
        if (finite(model.lat[index]) && finite(model.lon[index])) { if (first < 0) first = index; last = index; }
      }
      model.markerEndpoints = [Math.max(first, 0), Math.max(last, 0)];
    }
    const [first, last] = model.markerEndpoints;
    const current = finite(model.lat[currentIndex]) && finite(model.lon[currentIndex]) ? currentIndex : first;
    const feature = (index, kind, label) => ({
      type: "Feature",
      properties: { kind, label },
      geometry: { type: "Point", coordinates: [model.lon[index], model.lat[index]] }
    });
    return { type: "FeatureCollection", features: [feature(first, "start", "START"), feature(last, "end", "END"), feature(current, "current", "")] };
  }

  function storedMapTilerKey() {
    try {
      return localStorage.getItem(MAPTILER_KEY_STORAGE)?.trim() || MAPTILER_PUBLIC_KEY;
    } catch {
      return MAPTILER_PUBLIC_KEY;
    }
  }

  function storeMapTilerKey(key) {
    try {
      localStorage.setItem(MAPTILER_KEY_STORAGE, key);
      return true;
    } catch {
      return false;
    }
  }

  function openSatelliteDialog() {
    elements.satelliteKey.value = storedMapTilerKey();
    elements.satelliteError.hidden = true;
    elements.satelliteError.textContent = "";
    if (typeof elements.satelliteDialog.showModal === "function") elements.satelliteDialog.showModal();
    else elements.satelliteDialog.setAttribute("open", "");
    window.setTimeout(() => elements.satelliteKey.focus(), 0);
  }

  function applyTerrainBasemap(mode = elements.mapBasemap.value) {
    const viewer = state.terrainViewer;
    if (!viewer?.ready) return;
    const map = viewer.map;
    if (mode !== "satellite") {
      if (map.getLayer("skylabs-satellite")) map.setLayoutProperty("skylabs-satellite", "visibility", "none");
      if (map.getLayer("skylabs-hillshade")) map.setPaintProperty("skylabs-hillshade", "hillshade-opacity", 0.5);
      elements.satelliteSettings.hidden = true;
      return;
    }
    const key = storedMapTilerKey();
    if (!key) {
      elements.mapBasemap.value = "map";
      openSatelliteDialog();
      return;
    }
    if (map.getSource("skylabs-satellite") && viewer.satelliteKey !== key) {
      if (map.getLayer("skylabs-satellite")) map.removeLayer("skylabs-satellite");
      map.removeSource("skylabs-satellite");
    }
    if (!map.getSource("skylabs-satellite")) {
      map.addSource("skylabs-satellite", {
        type: "raster",
        url: `${MAPTILER_SATELLITE_TILEJSON}?key=${encodeURIComponent(key)}`,
        tileSize: 512
      });
      const referenceLayer = map.getLayer("road_area_pattern")
        ? "road_area_pattern"
        : map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
      map.addLayer({
        id: "skylabs-satellite",
        type: "raster",
        source: "skylabs-satellite",
        paint: { "raster-opacity": 1, "raster-fade-duration": 180, "raster-saturation": -0.08, "raster-contrast": 0.08 }
      }, referenceLayer);
      viewer.satelliteKey = key;
    } else {
      map.setLayoutProperty("skylabs-satellite", "visibility", "visible");
    }
    if (map.getLayer("skylabs-hillshade")) map.setPaintProperty("skylabs-hillshade", "hillshade-opacity", 0.28);
    elements.satelliteSettings.hidden = state.view !== "terrain";
    map.triggerRepaint();
  }

  function showTerrainStatus(mode, message = "") {
    elements.mapSetup.hidden = mode === "ready";
    elements.mapRetry.hidden = mode !== "error";
    if (mode === "loading") {
      elements.mapSetupTitle.textContent = "Preparing 3D terrain";
      elements.mapSetupCopy.textContent = "Loading the elevation mesh and aligning the recorded vertical profile to terrain.";
    } else if (mode === "error") {
      elements.mapSetupTitle.textContent = "Open terrain could not load";
      elements.mapSetupCopy.textContent = message || "The public map services did not respond. Check the connection and retry.";
    }
  }

  function disposeTerrainViewer() {
    const viewer = state.terrainViewer;
    if (!viewer) return;
    window.clearTimeout(viewer.loadTimer);
    window.clearTimeout(viewer.refreshTimer);
    if (viewer.onTerrainData) viewer.map.off("sourcedata", viewer.onTerrainData);
    if (viewer.onTerrainIdle) viewer.map.off("idle", viewer.onTerrainIdle);
    if (viewer.onZoom) viewer.map.off("zoom", viewer.onZoom);
    viewer.map.remove();
    state.terrainViewer = null;
  }

  function createTerrainFlightLayer(model, map) {
    const indices = decimatedTerrainIndices();
    const originIndex = indices[0] ?? 0;
    const sceneOrigin = [model.lon[originIndex], model.lat[originIndex]];
    const originEast = finite(model.east[originIndex]) ? Number(model.east[originIndex]) : 0;
    const originNorth = finite(model.north[originIndex]) ? Number(model.north[originIndex]) : 0;
    const eastRange = rangeOf(model.east);
    const northRange = rangeOf(model.north);
    const horizontalSpan = Math.max(100, Math.hypot(eastRange[1] - eastRange[0], northRange[1] - northRange[0]));
    const pathRadius = Math.max(0.7, Math.min(1.25, horizontalSpan / 3500));
    const terrainElevations = new Float64Array(model.count);
    terrainElevations.fill(NaN);
    let launchTerrain = NaN;
    let pathMesh = null;
    let treeTrunks = null;
    let treeCanopies = null;
    let vegetationTotal = 0;
    let renderer = null;

    const latMetersPerDegree = EARTH_RADIUS_M * Math.PI / 180;
    const lonMetersPerDegree = latMetersPerDegree * Math.cos(radians(sceneOrigin[1]));
    const localPoint = ([lon, lat]) => [
      (Number(lon) - sceneOrigin[0]) * lonMetersPerDegree - originEast,
      (Number(lat) - sceneOrigin[1]) * latMetersPerDegree - originNorth
    ];
    const lngLatPoint = (east, north) => [
      sceneOrigin[0] + (east + originEast) / lonMetersPerDegree,
      sceneOrigin[1] + (north + originNorth) / latMetersPerDegree
    ];
    const randomAt = (eastCell, northCell, salt = 0) => {
      const value = Math.sin(eastCell * 12.9898 + northCell * 78.233 + salt * 37.719) * 43758.5453;
      return value - Math.floor(value);
    };
    const pointInRing = (point, ring) => {
      let inside = false;
      for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
        const [currentX, currentY] = ring[current];
        const [previousX, previousY] = ring[previous];
        const crosses = currentY > point[1] !== previousY > point[1]
          && point[0] < (previousX - currentX) * (point[1] - currentY) / ((previousY - currentY) || Number.EPSILON) + currentX;
        if (crosses) inside = !inside;
      }
      return inside;
    };
    const pointInPolygon = (point, rings) => pointInRing(point, rings[0]) && !rings.slice(1).some((ring) => pointInRing(point, ring));
    const removeVegetation = () => {
      [treeTrunks, treeCanopies].forEach((mesh) => {
        if (!mesh) return;
        layer.scene?.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      treeTrunks = null;
      treeCanopies = null;
      vegetationTotal = 0;
    };

    const clearance = () => Math.max(pathRadius + 0.5, Number(elements.terrainClearance.value) || 5);
    const relativeProfile = () => elements.heightSource.value === "gps" ? model.gnssUp : model.baroUp;
    const groundAt = (index, query = true) => {
      if (finite(terrainElevations[index])) return terrainElevations[index];
      if (!query || !map.isSourceLoaded("skylabs-terrain")) return NaN;
      const elevation = map.queryTerrainElevation([model.lon[index], model.lat[index]]);
      if (finite(elevation)) terrainElevations[index] = Number(elevation);
      return finite(elevation) ? Number(elevation) : NaN;
    };
    const flightAltitude = (index) => {
      const ground = groundAt(index);
      const launch = finite(launchTerrain) ? launchTerrain : (finite(ground) ? ground : 0);
      const profile = relativeProfile();
      const recordedUp = finite(profile[index]) ? Number(profile[index]) : 0;
      const desired = launch + clearance() + recordedUp * (Number(elements.verticalScale.value) || 1);
      return finite(ground) ? Math.max(desired, ground + clearance()) : desired;
    };

    const layer = {
      id: "skylabs-airborne-replay",
      type: "custom",
      renderingMode: "3d",
      onAdd(mapInstance, gl) {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.scene.rotateX(Math.PI / 2);
        this.scene.scale.multiply(new THREE.Vector3(1, 1, -1));

        const aircraftMaterial = new THREE.MeshStandardMaterial({ color: 0x7bbcff, emissive: 0x182b3c, roughness: 0.35, metalness: 0.12 });
        this.aircraft = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(1.3, 5.5, 4), aircraftMaterial);
        body.rotation.x = Math.PI / 2;
        body.position.z = -0.8;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.24, 1.2), aircraftMaterial);
        wing.position.z = 0.35;
        const tail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.7), aircraftMaterial);
        tail.position.z = 2.1;
        this.aircraft.add(body, wing, tail);
        this.aircraft.scale.setScalar(Math.max(0.9, Math.min(2.5, horizontalSpan / 2500)));
        this.scene.add(this.aircraft);

        this.tetherGeometry = new THREE.BufferGeometry();
        this.tetherPositions = new Float32Array(6);
        const tetherAttribute = new THREE.BufferAttribute(this.tetherPositions, 3);
        tetherAttribute.setUsage(THREE.DynamicDrawUsage);
        this.tetherGeometry.setAttribute("position", tetherAttribute);
        this.tether = new THREE.Line(this.tetherGeometry, new THREE.LineBasicMaterial({ color: 0x7bbcff, transparent: true, opacity: 0.42 }));
        this.scene.add(this.tether);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(50, 80, -30).normalize();
        this.scene.add(sun);

        renderer = new THREE.WebGLRenderer({ canvas: mapInstance.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        layer.rebuildPath();
        layer.update(0);
      },
      render(gl, args) {
        const origin = maplibregl.MercatorCoordinate.fromLngLat(sceneOrigin, 0);
        const scale = origin.meterInMercatorCoordinateUnits();
        const projection = args?.defaultProjectionData?.mainMatrix || args;
        const mapMatrix = new THREE.Matrix4().fromArray(projection);
        const localMatrix = new THREE.Matrix4()
          .makeTranslation(origin.x, origin.y, origin.z)
          .scale(new THREE.Vector3(scale, -scale, scale));
        this.camera.projectionMatrix = mapMatrix.multiply(localMatrix);
        renderer.resetState();
        renderer.render(this.scene, this.camera);
      },
      onRemove() {
        this.scene?.traverse((object) => {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
          else object.material?.dispose?.();
        });
        renderer = null;
      },
      altitudeAt(index) {
        return flightAltitude(index);
      },
      rebuildPath() {
        if (!this.scene) return;
        if (pathMesh) {
          this.scene.remove(pathMesh);
          pathMesh.geometry.dispose();
          pathMesh.material.dispose();
        }
        const points = indices.map((index) => new THREE.Vector3(
          Number(model.east[index]) - originEast,
          flightAltitude(index),
          Number(model.north[index]) - originNorth
        )).filter((point) => finite(point.x) && finite(point.y) && finite(point.z));
        if (points.length < 2) return;
        const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.35);
        const geometry = new THREE.TubeGeometry(curve, Math.min(1800, Math.max(240, points.length - 1)), pathRadius, 6, false);
        const material = new THREE.MeshBasicMaterial({ color: 0x7bbcff, transparent: true, opacity: 0.94 });
        pathMesh = new THREE.Mesh(geometry, material);
        this.scene.add(pathMesh);
      },
      refreshTerrain() {
        if (!map.isSourceLoaded("skylabs-terrain")) return 0;
        let available = 0;
        indices.forEach((index) => {
          terrainElevations[index] = NaN;
          if (finite(groundAt(index))) available += 1;
        });
        if (!available) return 0;
        launchTerrain = groundAt(originIndex);
        this.rebuildPath();
        this.update(state.index);
        return indices.length ? available / indices.length : 0;
      },
      refreshVegetation() {
        removeVegetation();
        if (!this.scene || !map.isSourceLoaded("openmaptiles") || !map.isSourceLoaded("skylabs-terrain")) {
          elements.vegetationStatus.textContent = "Loading mapped woodland…";
          return 0;
        }
        const settings = { woodSpacing: 16, parkSpacing: 32, maximum: 3000 };
        const buffer = Math.max(220, Math.min(650, horizontalSpan * 0.18));
        const clipBounds = {
          minEast: eastRange[0] - originEast - buffer,
          maxEast: eastRange[1] - originEast + buffer,
          minNorth: northRange[0] - originNorth - buffer,
          maxNorth: northRange[1] - originNorth + buffer
        };
        const featureGroups = [
          {
            kind: "wood",
            spacing: settings.woodSpacing,
            features: map.querySourceFeatures("openmaptiles", {
              sourceLayer: "landcover",
              filter: ["==", ["get", "class"], "wood"]
            })
          },
          {
            kind: "park",
            spacing: settings.parkSpacing,
            features: map.querySourceFeatures("openmaptiles", { sourceLayer: "park" })
          }
        ];
        const cells = new Set();
        const candidates = [];
        featureGroups.forEach((group) => group.features.forEach((feature) => {
          const polygons = feature.geometry?.type === "Polygon"
            ? [feature.geometry.coordinates]
            : feature.geometry?.type === "MultiPolygon" ? feature.geometry.coordinates : [];
          polygons.forEach((polygon) => {
            const rings = polygon.map((ring) => ring.map(localPoint));
            if (!rings[0]?.length) return;
            const eastValues = rings[0].map((point) => point[0]);
            const northValues = rings[0].map((point) => point[1]);
            const eastBounds = rangeOf(eastValues);
            const northBounds = rangeOf(northValues);
            const minEastCell = Math.floor(Math.max(clipBounds.minEast, eastBounds[0]) / group.spacing);
            const maxEastCell = Math.ceil(Math.min(clipBounds.maxEast, eastBounds[1]) / group.spacing);
            const minNorthCell = Math.floor(Math.max(clipBounds.minNorth, northBounds[0]) / group.spacing);
            const maxNorthCell = Math.ceil(Math.min(clipBounds.maxNorth, northBounds[1]) / group.spacing);
            if (minEastCell > maxEastCell || minNorthCell > maxNorthCell) return;
            for (let eastCell = minEastCell; eastCell <= maxEastCell; eastCell += 1) {
              for (let northCell = minNorthCell; northCell <= maxNorthCell; northCell += 1) {
                const east = (eastCell + 0.5 + (randomAt(eastCell, northCell, 1) - 0.5) * 0.72) * group.spacing;
                const north = (northCell + 0.5 + (randomAt(eastCell, northCell, 2) - 0.5) * 0.72) * group.spacing;
                if (!pointInPolygon([east, north], rings)) continue;
                const cellKey = `${Math.round(east / 8)}:${Math.round(north / 8)}`;
                if (cells.has(cellKey)) continue;
                cells.add(cellKey);
                candidates.push({ east, north, kind: group.kind, score: randomAt(eastCell, northCell, group.kind === "wood" ? 3 : 15) });
              }
            }
          });
        }));
        const trees = candidates.sort((left, right) => left.score - right.score).slice(0, settings.maximum).map((candidate, index) => {
          const coordinate = lngLatPoint(candidate.east, candidate.north);
          const ground = map.queryTerrainElevation(coordinate);
          if (!finite(ground)) return null;
          return { ...candidate, ground: Number(ground), seed: randomAt(index, Math.round(candidate.east), 4) };
        }).filter(Boolean);
        if (!trees.length) {
          elements.vegetationStatus.textContent = "No mapped woodland or park cover in the loaded view";
          return 0;
        }
        const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.72, 1, 5);
        const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x785d3f, roughness: 1, metalness: 0, vertexColors: true });
        const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, vertexColors: true });
        treeTrunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
        treeCanopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, trees.length);
        treeTrunks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        treeCanopies.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        treeTrunks.frustumCulled = false;
        treeCanopies.frustumCulled = false;
        const dummy = new THREE.Object3D();
        const trunkColor = new THREE.Color();
        const canopyColor = new THREE.Color();
        trees.forEach((tree, index) => {
          const height = 5.5 + tree.seed * 8;
          const trunkHeight = height * (0.5 + randomAt(index, 2, 6) * 0.1);
          const trunkWidth = 0.22 + height * 0.018;
          dummy.position.set(tree.east, tree.ground + trunkHeight * 0.5, tree.north);
          dummy.rotation.set(0, randomAt(index, 3, 7) * Math.PI, 0);
          dummy.scale.set(trunkWidth, trunkHeight, trunkWidth);
          dummy.updateMatrix();
          treeTrunks.setMatrixAt(index, dummy.matrix);
          trunkColor.setHSL(0.075, 0.27, 0.3 + randomAt(index, 4, 8) * 0.08);
          treeTrunks.setColorAt(index, trunkColor);
          const crownWidth = height * (0.2 + randomAt(index, 5, 9) * 0.045);
          dummy.position.set(tree.east, tree.ground + height * 0.72, tree.north);
          dummy.rotation.set(0, randomAt(index, 6, 10) * Math.PI, 0);
          dummy.scale.set(crownWidth, height * 0.27, crownWidth * (0.84 + randomAt(index, 7, 11) * 0.24));
          dummy.updateMatrix();
          treeCanopies.setMatrixAt(index, dummy.matrix);
          canopyColor.setHSL(0.32 + randomAt(index, 8, 12) * 0.035, 0.28 + randomAt(index, 9, 13) * 0.14, 0.29 + randomAt(index, 10, 14) * 0.12);
          treeCanopies.setColorAt(index, canopyColor);
        });
        treeTrunks.instanceMatrix.needsUpdate = true;
        treeCanopies.instanceMatrix.needsUpdate = true;
        if (treeTrunks.instanceColor) treeTrunks.instanceColor.needsUpdate = true;
        if (treeCanopies.instanceColor) treeCanopies.instanceColor.needsUpdate = true;
        vegetationTotal = trees.length;
        this.scene.add(treeTrunks, treeCanopies);
        this.updateVegetationLod();
        return vegetationTotal;
      },
      updateVegetationLod() {
        if (!treeTrunks || !treeCanopies) return;
        const zoom = map.getZoom();
        const fraction = zoom < 11.5 ? 0.16 : zoom < 13 ? 0.45 : zoom < 14.2 ? 0.72 : 1;
        const visible = Math.max(1, Math.min(vegetationTotal, Math.round(vegetationTotal * fraction)));
        treeTrunks.count = visible;
        treeCanopies.count = visible;
        elements.vegetationStatus.textContent = `${visible.toLocaleString()} of ${vegetationTotal.toLocaleString()} terrain-clamped trees · OSM land cover`;
        map.triggerRepaint();
      },
      update(index) {
        if (!this.aircraft) return;
        const altitude = flightAltitude(index);
        const east = Number(model.east[index]) - originEast;
        const north = Number(model.north[index]) - originNorth;
        if (![east, north, altitude].every(finite)) return;
        const attitude = displayedAttitude(index);
        this.aircraft.position.set(east, altitude, north);
        this.aircraft.rotation.order = "YXZ";
        this.aircraft.rotation.set(radians(attitude.pitch), -radians(attitude.yaw), -radians(attitude.roll));
        const ground = groundAt(index);
        if (!finite(ground)) return;
        this.tetherPositions.set([east, ground, north, east, altitude, north]);
        this.tetherGeometry.attributes.position.needsUpdate = true;
        map.triggerRepaint();
      }
    };
    return layer;
  }

  function initializeTerrainViewer(model) {
    if (!model?.hasGps) return;
    disposeTerrainViewer();
    elements.terrainHost.replaceChildren();
    showTerrainStatus("loading");
    if (!window.maplibregl || !window.THREE) {
      showTerrainStatus("error", "The open 3D rendering runtime could not be loaded.");
      return;
    }
    const latRange = rangeOf(model.lat);
    const lonRange = rangeOf(model.lon);
    const center = [(lonRange[0] + lonRange[1]) / 2, (latRange[0] + latRange[1]) / 2];
    const map = new maplibregl.Map({
      container: elements.terrainHost,
      style: OPEN_MAP_STYLE,
      center,
      zoom: 12,
      pitch: 64,
      bearing: 18,
      maxPitch: 85,
      centerClampedToGround: false,
      attributionControl: true,
      canvasContextAttributes: { antialias: true }
    });
    map.on("styleimagemissing", (event) => {
      if (!map.hasImage(event.id)) map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");
    const viewer = {
      map,
      ready: false,
      aligned: false,
      flightLayer: null,
      refreshTimer: null,
      refreshAttempts: 0,
      vegetationReady: false,
      satelliteKey: "",
      onTerrainData: null,
      onTerrainIdle: null,
      onZoom: null,
      loadTimer: window.setTimeout(() => {
        if (!viewer.aligned) showTerrainStatus("error", "The terrain elevations took too long to respond. Check the connection and retry.");
      }, 18000)
    };
    state.terrainViewer = viewer;

    map.once("load", () => {
      if (state.terrainViewer !== viewer) return;
      try {
        map.addSource("skylabs-terrain", { type: "raster-dem", url: TERRAIN_TILEJSON, maxzoom: 14 });
        map.addSource("skylabs-hillshade", { type: "raster-dem", url: TERRAIN_TILEJSON, maxzoom: 14 });
        map.setTerrain({ source: "skylabs-terrain", exaggeration: 1 });
        const firstSymbol = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
        map.addLayer({
          id: "skylabs-hillshade",
          type: "hillshade",
          source: "skylabs-hillshade",
          paint: {
            "hillshade-exaggeration": 0.42,
            "hillshade-opacity": 0.5,
            "hillshade-shadow-color": "#10241f",
            "hillshade-highlight-color": "#dbe8e2",
            "hillshade-accent-color": "#53756a"
          }
        }, firstSymbol);
        map.addSource("skylabs-ground-track", { type: "geojson", lineMetrics: true, data: terrainTrackGeoJson() });
        map.addLayer({
          id: "skylabs-ground-track-casing",
          type: "line",
          source: "skylabs-ground-track",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#07100e", "line-width": 7, "line-opacity": 0.72 }
        }, firstSymbol);
        map.addLayer({
          id: "skylabs-ground-track-line",
          type: "line",
          source: "skylabs-ground-track",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": 3.5,
            "line-opacity": 0.9,
            "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "#d4d1c5", 0.55, "#7bbcff", 1, "#d5b778"]
          }
        }, firstSymbol);
        map.addSource("skylabs-track-points", { type: "geojson", data: terrainMarkerGeoJson(0) });
        map.addLayer({
          id: "skylabs-track-points",
          type: "circle",
          source: "skylabs-track-points",
          paint: {
            "circle-radius": ["match", ["get", "kind"], "current", 7, 5],
            "circle-color": ["match", ["get", "kind"], "start", "#7bbcff", "end", "#d5b778", "#edf5f1"],
            "circle-stroke-color": "#07100e",
            "circle-stroke-width": 2
          }
        });
        map.addLayer({
          id: "skylabs-track-labels",
          type: "symbol",
          source: "skylabs-track-points",
          filter: ["!=", ["get", "label"], ""],
          layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 10, "text-offset": [0, 1.35], "text-allow-overlap": true },
          paint: { "text-color": "#edf5f1", "text-halo-color": "#07100e", "text-halo-width": 1.4 }
        });
        viewer.flightLayer = createTerrainFlightLayer(model, map);
        map.addLayer(viewer.flightLayer, firstSymbol);
        viewer.ready = true;
        applyTerrainBasemap();
        fitTerrainMap(false);
        const refreshTerrain = () => {
          if (state.terrainViewer !== viewer || state.view !== "terrain" || elements.workspace.hidden || document.hidden || viewer.aligned && viewer.refreshAttempts >= 6) return;
          viewer.refreshAttempts += 1;
          const coverage = viewer.flightLayer.refreshTerrain();
          viewer.coverage = coverage;
          updateTerrainClearanceStatus();
          if (coverage <= 0) return;
          if (!viewer.vegetationReady && map.getSource("openmaptiles") && map.isSourceLoaded("openmaptiles")) {
            viewer.flightLayer.refreshVegetation();
            viewer.vegetationReady = true;
          }
          if (!viewer.aligned) {
            viewer.aligned = true;
            window.clearTimeout(viewer.loadTimer);
            showTerrainStatus("ready");
            updateTerrainViewer(state.index, true);
            toast(`Terrain available for ${Math.round(coverage * 100)}% of sampled route points.`);
          }
          if ((coverage >= 0.98 && viewer.vegetationReady) || viewer.refreshAttempts >= 6) {
            map.off("sourcedata", viewer.onTerrainData);
            map.off("idle", viewer.onTerrainIdle);
          }
        };
        const scheduleTerrainRefresh = () => {
          if (viewer.refreshTimer || state.view !== "terrain" || elements.workspace.hidden || document.hidden) return;
          viewer.refreshTimer = window.setTimeout(() => {
            viewer.refreshTimer = null;
            refreshTerrain();
          }, 80);
        };
        viewer.onTerrainData = (event) => {
          if (["skylabs-terrain", "openmaptiles"].includes(event.sourceId) && map.isSourceLoaded(event.sourceId)) scheduleTerrainRefresh();
        };
        viewer.onTerrainIdle = scheduleTerrainRefresh;
        viewer.onZoom = () => viewer.flightLayer.updateVegetationLod();
        map.on("sourcedata", viewer.onTerrainData);
        map.on("idle", viewer.onTerrainIdle);
        map.on("zoom", viewer.onZoom);
        scheduleTerrainRefresh();
      } catch (error) {
        showTerrainStatus("error", error instanceof Error ? error.message : "The terrain overlay could not be initialized.");
      }
    });
    map.on("error", (event) => {
      if (event.sourceId === "skylabs-satellite") {
        toast("Satellite imagery could not load. Check the MapTiler key and its allowed domains.", true);
        return;
      }
      if (!viewer.ready && event.error?.message) showTerrainStatus("error", event.error.message);
    });
  }

  function updateTerrainViewer(index, force = false) {
    const viewer = state.terrainViewer;
    if (!viewer?.ready || !state.model?.hasGps || state.view !== "terrain" || elements.workspace.hidden) return;
    viewer.flightLayer.update(index);
    viewer.map.getSource("skylabs-track-points")?.setData(terrainMarkerGeoJson(index));
    const now = performance.now();
    if (elements.cameraMode.value === "follow" && (force || now - state.lastMapCameraUpdate > 110)) {
      const model = state.model;
      const heading = finite(model.series.gnssHeading[index]) ? model.series.gnssHeading[index] : model.series.yaw[index];
      viewer.map.jumpTo({
        center: [model.lon[index], model.lat[index]],
        elevation: viewer.flightLayer.altitudeAt(index),
        bearing: finite(heading) ? Number(heading) : viewer.map.getBearing(),
        pitch: 68,
        zoom: Math.max(14.2, viewer.map.getZoom())
      });
      state.lastMapCameraUpdate = now;
    }
  }

  function rebuildTerrainPath() {
    const viewer = state.terrainViewer;
    if (!viewer?.ready) return;
    viewer.flightLayer.rebuildPath();
    viewer.flightLayer.update(state.index);
  }

  function updateTerrainClearanceStatus() {
    const value = Number(elements.terrainClearance.value) || 5;
    const coverage = state.terrainViewer?.coverage;
    elements.terrainClearanceStatus.textContent = `${finite(coverage) ? `Terrain coverage ${Math.round(coverage * 100)}% · ` : ""}Visual clearance ${value} m (not measured AGL)`;
  }

  function fitTerrainMap(animate = true) {
    const viewer = state.terrainViewer;
    if (!viewer?.ready) return;
    const model = state.model;
    const lonRange = rangeOf(model.lon);
    const latRange = rangeOf(model.lat);
    const bounds = new maplibregl.LngLatBounds([lonRange[0], latRange[0]], [lonRange[1], latRange[1]]);
    const top = elements.cameraMode.value === "top";
    viewer.map.fitBounds(bounds, {
      padding: { top: 110, right: 85, bottom: 95, left: 85 },
      bearing: top ? 0 : 18,
      pitch: top ? 0 : 64,
      duration: animate ? 650 : 0,
      maxZoom: 16.5
    });
  }

  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportNormalizedCsv() {
    const model = state.model;
    if (!model) return;
    const headers = [
      "time_s", "timestamp_ms", "gnss_lat", "gnss_lon", "altitude_m", "gnss_alt_m",
      "ground_speed_mps", "airspeed_mps", "roll_deg", "pitch_deg", "yaw_deg", "gnss_siv",
      "gnss_h_acc_m", "log_dt_ms", "esc_current_a", "esc_voltage_v", "esc_rpm",
      "log_overrun_count", "sd_write_error_count"
    ];
    const button = $("[data-download-csv]");
    if (button.disabled) return;
    button.disabled = true;
    const label = button.textContent;
    const parts = [];
    let rows = [headers.join(",")];
    try {
    for (let index = 0; index < model.count; index += 1) {
      rows.push([
        model.series.time[index], model.series.timestampMs[index], model.lat[index], model.lon[index],
        model.baroFilled[index], model.gnssAltFilled[index], model.groundSpeed[index], model.series.airspeed[index],
        model.series.roll[index], model.series.pitch[index], model.series.yaw[index], model.series.sats[index],
        model.series.gnssHAcc[index], model.series.logDt[index], model.series.current[index], model.series.voltage[index],
        model.series.rpm[index], model.series.overrun[index], model.series.sdErrors[index]
      ].map(escapeCsv).join(","));
      if ((index + 1) % 2000 === 0) {
        parts.push(rows.join("\r\n") + (index < model.count - 1 ? "\r\n" : ""));
        rows = [];
        button.textContent = `Exporting ${Math.round((index + 1) / model.count * 100)}%`;
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }
    if (rows.length) parts.push(rows.join("\r\n"));
    const base = model.meta.name.replace(/\.[^.]+$/, "");
    downloadBlob(`${base}_normalized.csv`, new Blob(parts, { type: "text/csv;charset=utf-8" }));
    toast("Normalized CSV export created.");
    } catch { toast("The export could not be created. Try a smaller file.", true); }
    finally { button.disabled = false; button.textContent = label; }
  }

  function downloadTemplate() {
    const content = [
      "timestamp_ms,gnss_lat,gnss_lon,altitude_m,gnss_alt_m,roll_deg,pitch_deg,yaw_deg,airspeed_mps,gnss_siv,gnss_h_acc_m,log_dt_ms",
      "0,-33.6440810,151.0470890,152.60,200.27,0.0,0.0,0.0,,10,1.20,50",
      "50,-33.6440805,151.0470898,152.65,200.31,0.2,-0.1,0.5,,10,1.20,50"
    ].join("\r\n");
    downloadBlob("skylabs_flight_log_template.csv", new Blob([content], { type: "text/csv;charset=utf-8" }));
  }

  function restoreSession() {
    elements.loading.hidden = true;
    if (state.model) {
      elements.workspace.hidden = false;
      elements.onboarding.hidden = true;
      switchView(state.view);
    } else showOnboarding();
  }

  async function handleFlightFile(file) {
    if (!file) return;
    cancelParsing();
    const requestId = state.loadId;
    if (state.seekFrame) window.cancelAnimationFrame(state.seekFrame);
    state.seekFrame = 0;
    state.viewId += 1;
    showLoading();
    elements.toast.hidden = true;
    try {
      const model = await parseFlightFile(file, requestId);
      if (requestId !== state.loadId) return;
      setLoading("Preparing review", `${formatInteger(model.count)} samples decoded locally.`, 94);
      // Paint the worker result before the one-time trace preparation.
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (requestId !== state.loadId) return;
      populateWorkspace(model);
    } catch (error) {
      if (requestId !== state.loadId || error.name === "AbortError") return;
      restoreSession();
      (state.model ? $("[data-new-log]") : $("[data-choose-file]")).focus({ preventScroll: true });
      toast(error instanceof Error ? error.message : "The flight log could not be read.", true);
    } finally {
      if (requestId === state.loadId) elements.fileInput.value = "";
    }
  }

  function openFilePicker() {
    elements.fileInput.click();
  }

  $$('[data-choose-file]').forEach((button) => button.addEventListener("click", openFilePicker));
  $("[data-cancel-load]").addEventListener("click", () => {
    cancelParsing();
    elements.fileInput.value = "";
    restoreSession();
    (state.model ? $("[data-new-log]") : $("[data-choose-file]")).focus({ preventScroll: true });
  });
  $("[data-new-log]").addEventListener("click", openFilePicker);
  elements.fileInput.addEventListener("change", () => handleFlightFile(elements.fileInput.files?.[0]));

  ["dragenter", "dragover"].forEach((type) => elements.dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    elements.dropzone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((type) => elements.dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    elements.dropzone.classList.remove("is-dragging");
  }));
  elements.dropzone.addEventListener("drop", (event) => handleFlightFile(event.dataTransfer?.files?.[0]));

  $$('[data-open-schema]').forEach((button) => button.addEventListener("click", () => {
    if (typeof elements.schemaDialog.showModal === "function") elements.schemaDialog.showModal();
    else elements.schemaDialog.setAttribute("open", "");
  }));
  $("[data-download-template]").addEventListener("click", downloadTemplate);
  $("[data-download-csv]").addEventListener("click", exportNormalizedCsv);

  $$('[data-view-button]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewButton)));
  $(".flight-view-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = $$('[data-view-button]');
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    switchView(buttons[next].dataset.viewButton);
    $("[data-view-button][aria-selected='true']").focus();
  });
  elements.timeline.addEventListener("input", () => queueSeek(Number(elements.timeline.value)));
  elements.play.addEventListener("click", () => {
    if (!state.model) return;
    if (!state.playing && state.index >= state.model.count - 1) updateFrame(0, true);
    setPlaying(!state.playing);
  });
  $("[data-step-back]").addEventListener("click", () => { setPlaying(false); updateFrame(state.index - 1, true); });
  $("[data-step-forward]").addEventListener("click", () => { setPlaying(false); updateFrame(state.index + 1, true); });

  elements.cameraMode.addEventListener("change", () => {
    updateLocalViewer(state.index);
    if (!state.terrainViewer?.ready) return;
    if (["orbit", "top"].includes(elements.cameraMode.value)) fitTerrainMap();
    else updateTerrainViewer(state.index, true);
  });
  elements.heightSource.addEventListener("change", () => {
    state.localViewer?.rebuildPath();
    rebuildTerrainPath();
    updateFrame(state.index, true);
  });
  elements.verticalScale.addEventListener("change", () => {
    state.localViewer?.rebuildPath();
    rebuildTerrainPath();
    updateFrame(state.index, true);
  });
  elements.terrainClearance.addEventListener("change", () => {
    updateTerrainClearanceStatus();
    rebuildTerrainPath();
    updateFrame(state.index, true);
  });
  elements.mapBasemap.addEventListener("change", () => applyTerrainBasemap());
  elements.satelliteSettings.addEventListener("click", openSatelliteDialog);
  $$('[data-satellite-cancel]').forEach((button) => button.addEventListener("click", () => elements.satelliteDialog.close()));
  elements.satelliteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = elements.satelliteKey.value.trim();
    if (!key) return;
    elements.satelliteError.hidden = true;
    elements.satelliteSave.disabled = true;
    elements.satelliteSave.textContent = "Checking key…";
    try {
      const response = await fetch(`${MAPTILER_SATELLITE_TILEJSON}?key=${encodeURIComponent(key)}`);
      if (!response.ok) throw new Error(response.status === 403 ? "MapTiler rejected this key. Check the key and its allowed domains." : `MapTiler returned HTTP ${response.status}.`);
      const tileJson = await response.json();
      if (!Array.isArray(tileJson.tiles) || !tileJson.tiles.length) throw new Error("The MapTiler response did not contain a satellite tileset.");
      if (!storeMapTilerKey(key)) throw new Error("This browser would not allow the imagery key to be stored locally.");
      elements.satelliteDialog.close();
      elements.mapBasemap.value = "satellite";
      applyTerrainBasemap("satellite");
      toast("Satellite basemap enabled. MapTiler attribution remains visible.");
    } catch (error) {
      elements.satelliteError.textContent = error instanceof Error ? error.message : "The imagery key could not be verified.";
      elements.satelliteError.hidden = false;
    } finally {
      elements.satelliteSave.disabled = false;
      elements.satelliteSave.textContent = "Save and enable satellite";
    }
  });
  $("[data-fit-track]").addEventListener("click", () => state.view === "terrain" ? fitTerrainMap() : state.localViewer?.fit());

  $("[data-level-start]").addEventListener("click", () => setLevel({ ...state.model.defaultLevel }, "Auto-level"));
  $("[data-level-now]").addEventListener("click", () => setLevel({
    roll: state.model.series.roll[state.index],
    pitch: state.model.series.pitch[state.index],
    yaw: state.model.series.yaw[state.index]
  }, `Leveled ${formatTime(state.model.series.time[state.index])}`));
  $("[data-level-reset]").addEventListener("click", () => setLevel(null, "Raw IMU"));

  elements.mapRetry.addEventListener("click", () => { disposeTerrainViewer(); switchView("terrain"); });

  $("[data-copy-sample]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(sampleObject(state.index), null, 2));
      toast("Current sample copied as JSON.");
    } catch {
      toast("The browser could not copy this sample.", true);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.loading.hidden) { event.preventDefault(); $("[data-cancel-load]").click(); return; }
    if (!state.model || elements.workspace.hidden || elements.schemaDialog.open || elements.satelliteDialog.open) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
    if (event.code === "Space") { event.preventDefault(); elements.play.click(); }
    if (event.code === "ArrowLeft") { event.preventDefault(); setPlaying(false); updateFrame(state.index - 1, true); }
    if (event.code === "ArrowRight") { event.preventDefault(); setPlaying(false); updateFrame(state.index + 1, true); }
  });

  function animatePlayback(timestamp) {
    state.playbackFrame = 0;
    if (!state.playing || !state.model || document.hidden) return;
    if (state.lastAnimationTime === null) state.lastAnimationTime = timestamp;
    const elapsed = Math.max(0, (timestamp - state.lastAnimationTime) / 1000) * Number(elements.rate.value);
    state.lastAnimationTime = timestamp;
    state.playbackTime += elapsed;
    if (state.playbackTime >= state.model.stats.duration) {
      updateFrame(state.model.count - 1, true);
      setPlaying(false);
    } else {
      updateFrame(findIndexAtTime(state.playbackTime), false, true);
      state.playbackFrame = window.requestAnimationFrame(animatePlayback);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { setPlaying(false); state.localViewer?.pause(); state.terrainViewer?.map.stop(); }
    else if (state.model && !elements.workspace.hidden && state.view === "local") state.localViewer?.update(state.index);
  });
  window.addEventListener("pagehide", () => { cancelParsing(); setPlaying(false); disposeLocalViewer(); disposeTerrainViewer(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) restoreSession(); });
})();
