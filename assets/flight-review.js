(() => {
  "use strict";

  const MAX_FILE_BYTES = 150 * 1024 * 1024;
  const EARTH_RADIUS_M = 6_371_000;
  const MAGIC = "SKYLBIN1";
  const HEADER_BYTES = 48;
  const RECORD_SIZES = new Map([[1, 238], [2, 250], [3, 282]]);
  const OPEN_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
  const TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const number = (value) => {
    if (value === null || value === undefined || value === "") return NaN;
    const parsed = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const finite = (value) => Number.isFinite(Number(value));
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
    terrainClearance: $("[data-terrain-clearance]"),
    terrainClearanceControl: $("[data-terrain-clearance-control]"),
    terrainClearanceStatus: $("[data-terrain-clearance-status]"),
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
    view: "terrain",
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

  const SERIES_KEYS = [
    "time", "timestampMs", "rtcUnix", "lat", "lon", "gnssAlt", "baroAlt",
    "roll", "pitch", "yaw", "accX", "accY", "accZ", "gyroX", "gyroY",
    "gyroZ", "linX", "linY", "linZ", "airspeed", "groundSpeedInput",
    "gnssHAcc", "gnssVAcc", "gnssHeading", "sats", "gnssFix", "logDt",
    "overrun", "sdErrors", "current", "voltage", "escTemp", "throttle", "rpm",
    "ekfHUnc", "ekfVelUnc", "imuSamples", "imuResets"
  ];

  const makeSeries = () => Object.fromEntries(SERIES_KEYS.map((key) => [key, []]));

  const FIELD_ALIASES = {
    time: ["time_s", "elapsed_s", "flight_time_s", "time_seconds"],
    timeUs: ["time_us", "timestamp_us", "time_microseconds", "timestamp_microseconds"],
    timestampMs: ["timestamp_ms", "time_ms", "elapsed_ms", "timestamp_milliseconds", "timestamp"],
    rtcUnix: ["rtc_unix", "unix_time", "unix_timestamp"],
    lat: ["gnss_lat", "gnss_lat_f", "gnss_lat_plot", "latitude", "gps_lat", "lat"],
    latE7: ["gnss_lat_e7", "gps_lat_e7", "latitude_e7"],
    lon: ["gnss_lon", "gnss_lon_f", "gnss_lon_plot", "longitude", "gps_lon", "lon", "lng"],
    lonE7: ["gnss_lon_e7", "gps_lon_e7", "longitude_e7"],
    gnssAlt: ["gnss_alt_m", "gnss_alt_m_f", "gnss_alt_plot", "gps_altitude", "gps_alt_m", "gnss_altitude_m"],
    baroAlt: ["altitude_m", "altitude_m_f", "altitude_plot_m", "baro_alt_m", "barometric_altitude_m"],
    roll: ["roll_deg", "roll_cal_deg", "roll_plot_deg", "mw_roll_deg", "roll"],
    pitch: ["pitch_deg", "pitch_cal_deg", "pitch_plot_deg", "mw_pitch_deg", "pitch"],
    yaw: ["yaw_deg", "yaw_cal_deg", "yaw_plot_deg", "mw_yaw_deg", "heading_deg", "yaw", "heading"],
    accX: ["acc_x_f", "acc_x", "accel_x", "acceleration_x_mps2"],
    accY: ["acc_y_f", "acc_y", "accel_y", "acceleration_y_mps2"],
    accZ: ["acc_z_f", "acc_z", "accel_z", "acceleration_z_mps2"],
    gyroX: ["gyro_x_f", "gyro_x", "gyroscope_x_rps"],
    gyroY: ["gyro_y_f", "gyro_y", "gyroscope_y_rps"],
    gyroZ: ["gyro_z_f", "gyro_z", "gyroscope_z_rps"],
    linX: ["lin_x_f", "lin_x", "linear_acceleration_x_mps2"],
    linY: ["lin_y_f", "lin_y", "linear_acceleration_y_mps2"],
    linZ: ["lin_z_f", "lin_z", "linear_acceleration_z_mps2"],
    airspeed: ["airspeed_mps", "aspd_airspeed_mps", "aspd_airspeed_mps_f", "airspeed_ms"],
    groundSpeedInput: ["ground_speed_mps", "gps_speed_mps", "speed_mps", "groundspeed"],
    gnssHAcc: ["gnss_h_acc_m", "gnss_h_acc_plot", "gps_hacc", "horizontal_accuracy_m"],
    gnssVAcc: ["gnss_v_acc_m", "gnss_v_acc_plot", "gps_vacc", "vertical_accuracy_m"],
    gnssHeading: ["gnss_heading_deg", "gps_heading_deg", "course_deg"],
    sats: ["gnss_siv", "satellites", "gps_satellites", "sat_count"],
    gnssFix: ["gnss_fix", "gps_fix", "fix_type"],
    logDt: ["log_dt_ms", "logging_interval_ms", "sample_dt_ms"],
    overrun: ["log_overrun_count", "overruns", "logging_overruns"],
    sdErrors: ["sd_write_error_count", "sd_errors", "write_errors"],
    current: ["esc_current_a", "esc_current_a_f", "current_a", "battery_current_a"],
    voltage: ["esc_voltage_v", "esc_voltage_v_f", "voltage_v", "battery_voltage_v"],
    escTemp: ["esc_temp_c", "esc_temp_c_f", "esc_temperature_c"],
    throttle: ["esc_throttle_pct", "esc_throttle", "esc_throttle_f", "throttle_pct"],
    rpm: ["esc_rpm", "esc_rpm_f", "rpm"],
    ekfHUnc: ["ekf_pos_h_unc_m", "ekf_h_unc_plot", "ekf_horizontal_uncertainty_m"],
    ekfVelUnc: ["ekf_vel_unc_mps", "ekf_vel_unc_plot", "ekf_velocity_uncertainty_mps"],
    imuSamples: ["imu_samples", "imu_samples_plot"],
    imuResets: ["imu_reset_count", "imu_resets"]
  };

  const normalizeHeader = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/°/g, "deg")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

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
    elements.onboarding.hidden = true;
    elements.workspace.hidden = true;
    elements.loading.hidden = false;
    setLoading("Validating log structure", "Nothing leaves this browser tab.", 12);
  }

  function showOnboarding() {
    state.playing = false;
    elements.loading.hidden = true;
    elements.workspace.hidden = true;
    elements.onboarding.hidden = false;
  }

  function readMagic(buffer) {
    if (buffer.byteLength < MAGIC.length) return "";
    return new TextDecoder("ascii").decode(new Uint8Array(buffer, 0, MAGIC.length));
  }

  async function parseFlightFile(file) {
    if (!file || !file.size) throw new Error("The selected file is empty.");
    if (file.size > MAX_FILE_BYTES) throw new Error("This file is larger than the 150 MB browser limit.");
    const extension = file.name.split(".").pop().toLowerCase();
    const buffer = await file.arrayBuffer();
    setLoading("Decoding telemetry", `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`, 34);
    await new Promise((resolve) => window.setTimeout(resolve, 16));
    if (extension === "bin" || readMagic(buffer) === MAGIC) return parseBinaryLog(buffer, file);
    if (["xlsx", "xls", "csv", "tsv"].includes(extension)) return parseSpreadsheet(buffer, file, extension);
    throw new Error("Unsupported file type. Choose a .BIN, .XLSX, .XLS, .CSV or .TSV flight log.");
  }

  function parseBinaryLog(buffer, file) {
    if (buffer.byteLength < HEADER_BYTES) throw new Error("The binary log is too small to contain a Skylabs header.");
    const view = new DataView(buffer);
    if (readMagic(buffer) !== MAGIC) throw new Error("The binary magic does not match SKYLBIN1.");
    const version = view.getUint16(8, true);
    const headerSize = view.getUint16(10, true);
    const recordSize = view.getUint16(12, true);
    const expectedSize = RECORD_SIZES.get(version);
    if (!expectedSize || expectedSize !== recordSize) {
      throw new Error(`Unsupported Skylabs binary schema v${version} with ${recordSize}-byte records.`);
    }
    if (headerSize < HEADER_BYTES || headerSize > buffer.byteLength) throw new Error("The binary header size is invalid.");
    const recordCount = Math.floor((buffer.byteLength - headerSize) / recordSize);
    if (!recordCount) throw new Error("The binary log contains no complete telemetry records.");

    const series = makeSeries();
    let firstTimestamp = null;
    for (let index = 0; index < recordCount; index += 1) {
      const base = headerSize + index * recordSize;
      const u32 = (offset) => view.getUint32(base + offset, true);
      const i32 = (offset) => view.getInt32(base + offset, true);
      const u16 = (offset) => view.getUint16(base + offset, true);
      const u8 = (offset) => view.getUint8(base + offset);
      const f32 = (offset) => view.getFloat32(base + offset, true);
      const timestamp = u32(0);
      if (firstTimestamp === null) firstTimestamp = timestamp;
      const requiredValues = [f32(58), f32(62), f32(66), f32(70), f32(74), f32(78), f32(82), f32(86), f32(90)];
      if (!requiredValues.every(finite)) continue;
      series.time.push((timestamp - firstTimestamp) / 1000);
      series.timestampMs.push(timestamp);
      series.rtcUnix.push(u32(4));
      series.overrun.push(u32(8));
      series.sdErrors.push(u32(12));
      series.lat.push(i32(16) / 1e7);
      series.lon.push(i32(20) / 1e7);
      series.logDt.push(u16(40));
      series.imuSamples.push(u16(42));
      series.imuResets.push(u16(44));
      series.gnssFix.push(u8(47));
      series.sats.push(u8(48));
      series.baroAlt.push(f32(66));
      series.roll.push(f32(70));
      series.pitch.push(f32(74));
      series.yaw.push(f32(78));
      series.accX.push(f32(82));
      series.accY.push(f32(86));
      series.accZ.push(f32(90));
      series.gyroX.push(f32(94));
      series.gyroY.push(f32(98));
      series.gyroZ.push(f32(102));
      series.linX.push(f32(106));
      series.linY.push(f32(110));
      series.linZ.push(f32(114));
      series.airspeed.push(f32(134));
      series.groundSpeedInput.push(NaN);
      series.gnssAlt.push(f32(138));
      series.gnssHAcc.push(f32(142));
      series.gnssVAcc.push(f32(146));
      series.gnssHeading.push(f32(154));
      series.current.push(f32(162));
      series.voltage.push(f32(166));
      series.escTemp.push(f32(170));
      series.throttle.push(f32(178));
      series.rpm.push(f32(182));
      series.ekfHUnc.push(f32(218));
      series.ekfVelUnc.push(f32(226));
    }

    const completeBytes = headerSize + recordCount * recordSize;
    return finalizeModel(series, {
      name: file.name,
      size: file.size,
      format: "SKYLBIN1",
      schema: `v${version}`,
      source: "Skylabs aircraft SD binary",
      headerSize,
      recordSize,
      configuredLogIntervalMs: view.getUint32(20, true),
      createdUnix: view.getUint32(16, true),
      sensorMask: view.getUint8(32),
      sourceRecords: recordCount,
      trailingBytes: buffer.byteLength - completeBytes
    });
  }

  function parseSpreadsheet(buffer, file, extension) {
    if (!window.XLSX) throw new Error("The spreadsheet parser could not be loaded. Check the connection and retry.");
    let workbook;
    try {
      workbook = window.XLSX.read(buffer, { type: "array", dense: true, cellDates: true });
    } catch (error) {
      throw new Error(`The ${extension.toUpperCase()} file could not be decoded: ${error.message}`);
    }
    const sheetName = workbook.SheetNames.find((name) => workbook.Sheets[name]?.["!ref"]);
    if (!sheetName) throw new Error("The workbook does not contain a populated worksheet.");
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
    if (!rows.length) throw new Error("The first populated worksheet has no data rows.");

    const headers = Object.keys(rows[0]);
    const normalizedToOriginal = new Map(headers.map((header) => [normalizeHeader(header), header]));
    const columnFor = (canonical) => {
      const aliases = FIELD_ALIASES[canonical] || [];
      for (const alias of aliases) {
        if (normalizedToOriginal.has(alias)) return normalizedToOriginal.get(alias);
      }
      return null;
    };
    const columns = Object.fromEntries(Object.keys(FIELD_ALIASES).map((key) => [key, columnFor(key)]));
    if (!columns.time && !columns.timeUs && !columns.timestampMs) {
      throw new Error("Spreadsheet format error: add a time_s, time_us or timestamp_ms column.");
    }
    if ((!columns.lat && !columns.latE7) || (!columns.lon && !columns.lonE7)) {
      throw new Error("Spreadsheet format error: add latitude and longitude columns for the flight map.");
    }

    const series = makeSeries();
    const statusHeader = normalizedToOriginal.get("status");
    for (const row of rows) {
      if (statusHeader && String(row[statusHeader] || "").trim() && String(row[statusHeader]).toUpperCase() !== "LOGGING") continue;
      const value = (key) => columns[key] ? number(row[columns[key]]) : NaN;
      const timeSeconds = columns.time ? value("time") : (columns.timeUs ? value("timeUs") / 1e6 : value("timestampMs") / 1000);
      if (!finite(timeSeconds)) continue;
      series.time.push(timeSeconds);
      series.timestampMs.push(columns.timestampMs ? value("timestampMs") : (columns.timeUs ? value("timeUs") / 1000 : timeSeconds * 1000));
      series.rtcUnix.push(value("rtcUnix"));
      const lat = columns.lat ? value("lat") : value("latE7") / 1e7;
      const lon = columns.lon ? value("lon") : value("lonE7") / 1e7;
      series.lat.push(lat);
      series.lon.push(lon);
      for (const key of SERIES_KEYS) {
        if (["time", "timestampMs", "rtcUnix", "lat", "lon"].includes(key)) continue;
        if (key === "gnssFix") series[key].push(columns[key] ? value(key) : (Math.abs(lat) > 0.0001 && Math.abs(lon) > 0.0001 ? 1 : 0));
        else series[key].push(value(key));
      }
    }
    if (series.time.length < 2) throw new Error("The spreadsheet has fewer than two usable telemetry rows.");
    return finalizeModel(series, {
      name: file.name,
      size: file.size,
      format: extension.toUpperCase(),
      schema: "Header mapped",
      source: `Spreadsheet · ${sheetName}`,
      sourceRecords: rows.length,
      mappedColumns: Object.values(columns).filter(Boolean).length,
      worksheet: sheetName
    });
  }

  function reorderSeries(series) {
    const order = series.time.map((time, index) => [Number(time), index]).sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
    for (const key of SERIES_KEYS) series[key] = order.map((index) => series[key][index]);
  }

  function interpolate(values, validPredicate = finite) {
    const output = values.map((value) => validPredicate(value) ? Number(value) : NaN);
    const validIndices = output.map((value, index) => finite(value) ? index : -1).filter((index) => index >= 0);
    if (!validIndices.length) return output;
    const first = validIndices[0];
    const last = validIndices[validIndices.length - 1];
    for (let index = 0; index < first; index += 1) output[index] = output[first];
    for (let index = last + 1; index < output.length; index += 1) output[index] = output[last];
    for (let pair = 0; pair < validIndices.length - 1; pair += 1) {
      const left = validIndices[pair];
      const right = validIndices[pair + 1];
      const span = right - left;
      for (let index = left + 1; index < right; index += 1) {
        const ratio = (index - left) / span;
        output[index] = output[left] + (output[right] - output[left]) * ratio;
      }
    }
    return output;
  }

  function estimateGroundSpeed(time, east, north) {
    const count = time.length;
    const raw = new Array(count).fill(0);
    let left = 0;
    let right = 0;
    for (let index = 0; index < count; index += 1) {
      while (left < count - 1 && time[left] < time[index] - 0.5) left += 1;
      right = Math.max(right, index);
      while (right < count - 1 && time[right + 1] <= time[index] + 0.5) right += 1;
      const elapsed = time[right] - time[left];
      raw[index] = elapsed > 0.001 ? Math.hypot(east[right] - east[left], north[right] - north[left]) / elapsed : 0;
    }
    return raw.map((_, index) => median(raw.slice(Math.max(0, index - 2), Math.min(count, index + 3))));
  }

  function finalizeModel(series, meta) {
    if (series.time.some((time, index) => index > 0 && Number(time) < Number(series.time[index - 1]))) reorderSeries(series);
    const timeOrigin = firstFinite(series.time, 0);
    series.time = series.time.map((time) => Number(time) - timeOrigin);
    const count = series.time.length;
    if (count < 2) throw new Error("The log contains fewer than two usable records.");

    const validGps = series.lat.map((lat, index) => {
      const lon = series.lon[index];
      const fix = series.gnssFix[index];
      return finite(lat) && finite(lon) && Math.abs(lat) > 0.0001 && Math.abs(lon) > 0.0001 && (!finite(fix) || Number(fix) > 0);
    });
    const lat = interpolate(series.lat.map((value, index) => validGps[index] ? value : NaN));
    const lon = interpolate(series.lon.map((value, index) => validGps[index] ? value : NaN));
    const hasGps = validGps.filter(Boolean).length >= 2;
    const firstGpsIndex = validGps.indexOf(true);
    const originLat = hasGps ? lat[firstGpsIndex] : NaN;
    const originLon = hasGps ? lon[firstGpsIndex] : NaN;
    const originLatRad = radians(originLat);
    const east = new Array(count).fill(0);
    const north = new Array(count).fill(0);
    if (hasGps) {
      for (let index = 0; index < count; index += 1) {
        const latRad = radians(lat[index]);
        const lonRad = radians(lon[index]);
        east[index] = (lonRad - radians(originLon)) * Math.cos((latRad + originLatRad) * 0.5) * EARTH_RADIUS_M;
        north[index] = (latRad - originLatRad) * EARTH_RADIUS_M;
      }
    }
    const baroFilled = interpolate(series.baroAlt);
    const gnssAltFilled = interpolate(series.gnssAlt);
    const baroOrigin = firstFinite(baroFilled, 0);
    const gnssAltOrigin = firstFinite(gnssAltFilled, baroOrigin);
    const baroUp = baroFilled.map((value) => finite(value) ? value - baroOrigin : 0);
    const gnssUp = gnssAltFilled.map((value, index) => finite(value) ? value - gnssAltOrigin : baroUp[index]);
    const calculatedGroundSpeed = hasGps ? estimateGroundSpeed(series.time, east, north) : new Array(count).fill(0);
    const groundSpeed = calculatedGroundSpeed.map((value, index) => {
      const supplied = series.groundSpeedInput[index];
      return hasGps || !finite(supplied) ? value : Number(supplied);
    });
    let trackDistance = 0;
    if (hasGps) {
      for (let index = 1; index < count; index += 1) trackDistance += Math.hypot(east[index] - east[index - 1], north[index] - north[index - 1]);
    }
    const firstThreeSeconds = series.time.map((time, index) => time <= 3 ? index : -1).filter((index) => index >= 0);
    const defaultLevel = {
      roll: median(firstThreeSeconds.map((index) => series.roll[index])),
      pitch: median(firstThreeSeconds.map((index) => series.pitch[index])),
      yaw: circularMeanDegrees(firstThreeSeconds.map((index) => series.yaw[index]))
    };
    const positiveDts = series.logDt.filter((value) => finite(value) && Number(value) > 0);
    const derivedDts = series.time.slice(1).map((time, index) => (time - series.time[index]) * 1000).filter((value) => value > 0);
    const logDtMedian = median(positiveDts.length ? positiveDts : derivedDts);
    const baroRange = rangeOf(series.baroAlt);
    const stats = {
      duration: Math.max(0, series.time[count - 1] || 0),
      trackDistance,
      peakGroundSpeed: maxOf(groundSpeed),
      baroMin: baroRange[0],
      baroMax: baroRange[1],
      baroClimb: finite(baroRange[0]) ? baroRange[1] - baroRange[0] : NaN,
      gnssHAccMedian: median(series.gnssHAcc),
      satsMedian: median(series.sats),
      logDtMedian,
      sampleRate: logDtMedian > 0 ? 1000 / logDtMedian : NaN,
      validGpsPercent: validGps.filter(Boolean).length / count * 100,
      sdErrors: lastFinite(series.sdErrors, 0),
      overruns: lastFinite(series.overrun, 0),
      ekfHUncFinal: lastFinite(series.ekfHUnc),
      ekfVelUncFinal: lastFinite(series.ekfVelUnc),
      imuResets: lastFinite(series.imuResets, 0)
    };
    return {
      series,
      meta: { ...meta, usableRecords: count },
      count,
      hasGps,
      validGps,
      lat,
      lon,
      east,
      north,
      baroFilled,
      gnssAltFilled,
      baroUp,
      gnssUp,
      groundSpeed,
      origin: { lat: originLat, lon: originLon, baroAlt: baroOrigin, gnssAlt: gnssAltOrigin },
      defaultLevel,
      stats
    };
  }

  function buildHealthItems(model) {
    const items = [];
    const add = (level, title, detail) => items.push({ level, title, detail });
    if (model.stats.sdErrors > 0) add("critical", "SD write errors recorded", `${formatInteger(model.stats.sdErrors)} write errors accumulated in this log.`);
    else add("good", "Aircraft log recovered", `No SD write errors across ${formatInteger(model.count)} usable records.`);

    if (model.stats.overruns > Math.max(10, model.count * 0.05)) add("warning", "Logging timing pressure", `${formatInteger(model.stats.overruns)} firmware overruns accumulated; median interval was ${formatFixed(model.stats.logDtMedian, 1, " ms")}.`);
    else add("good", "Logging cadence stable", `Median sample interval ${formatFixed(model.stats.logDtMedian, 1, " ms")}.`);

    if (!model.hasGps) add("critical", "No usable GNSS track", "Latitude and longitude are missing or do not contain a valid fix.");
    else if (model.stats.validGpsPercent < 80 || model.stats.gnssHAccMedian > 5) add("warning", "GNSS quality reduced", `${model.stats.validGpsPercent.toFixed(1)}% valid fixes; median HAcc ${formatFixed(model.stats.gnssHAccMedian, 2, " m")}.`);
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
    else if (model.series.roll.some(finite)) add("good", "Attitude stream continuous", "Recorded roll, pitch and yaw are available for replay.");
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
    disposeTerrainViewer();
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
    $("[data-summary-speed]").textContent = formatFixed(model.stats.peakGroundSpeed, 1, " m/s");
    $("[data-summary-speed-kmh]").textContent = finite(model.stats.peakGroundSpeed) ? `${(model.stats.peakGroundSpeed * 3.6).toFixed(1)} km/h` : "Unavailable";
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

    window.requestAnimationFrame(() => {
      disposeLocalViewer();
      state.localViewer = createLocalViewer(model);
      switchView(model.hasGps ? "terrain" : "local");
      updateFrame(0, true);
      if (model.hasGps) initializeTerrainViewer(model);
    });
  }

  function renderHealth(model) {
    const items = buildHealthItems(model);
    const colors = { good: "#62dfb3", warning: "#f4c86a", critical: "#ff8f70", info: "#6bb6ff" };
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
    $("[data-health-count]").textContent = alerts ? `${alerts} alert${alerts === 1 ? "" : "s"}` : "Nominal";
  }

  function renderSourceDetails(model) {
    const details = [
      ["Source", model.meta.source],
      ["Format", `${model.meta.format} ${model.meta.schema}`],
      ["Source rows", formatInteger(model.meta.sourceRecords)],
      ["Usable rows", formatInteger(model.meta.usableRecords)],
      ["Parser", model.meta.format === "SKYLBIN1" ? "Direct little-endian DataView" : "SheetJS header mapping"],
      ["Position", model.hasGps ? "Raw GNSS · local ENU derived" : "No geodetic solution"],
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
    ["latitude", "Latitude", (model, index) => formatFixed(model.lat[index], 7)],
    ["longitude", "Longitude", (model, index) => formatFixed(model.lon[index], 7)],
    ["baroAlt", "Barometric altitude", (model, index) => formatFixed(model.baroFilled[index], 2, " m")],
    ["gnssAlt", "GNSS altitude", (model, index) => formatFixed(model.gnssAltFilled[index], 2, " m")],
    ["speed", "Ground speed", (model, index) => formatFixed(model.groundSpeed[index], 2, " m/s")],
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
    elements.sampleGrid.replaceChildren(...SAMPLE_FIELDS.map(([, label, value]) => {
      const wrapper = document.createElement("div");
      const span = document.createElement("span");
      const strong = document.createElement("strong");
      span.textContent = label;
      strong.textContent = value(model, index);
      wrapper.append(span, strong);
      return wrapper;
    }));
  }

  function sampleObject(index) {
    const model = state.model;
    return {
      sample: index + 1,
      time_s: model.series.time[index],
      latitude: model.lat[index],
      longitude: model.lon[index],
      barometric_altitude_m: model.baroFilled[index],
      gnss_altitude_m: model.gnssAltFilled[index],
      ground_speed_mps: model.groundSpeed[index],
      roll_deg: model.series.roll[index],
      pitch_deg: model.series.pitch[index],
      yaw_deg: model.series.yaw[index],
      satellites: model.series.sats[index],
      gnss_h_acc_m: model.series.gnssHAcc[index],
      log_dt_ms: model.series.logDt[index]
    };
  }

  function setPlaying(playing) {
    state.playing = Boolean(playing);
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

  function updateFrame(index, force = false) {
    const model = state.model;
    if (!model) return;
    const next = clamp(Math.round(index), 0, model.count - 1);
    if (next === state.index && !force) return;
    state.index = next;
    state.playbackTime = model.series.time[next];
    elements.timeline.value = String(next);
    elements.currentTime.textContent = formatTime(model.series.time[next]);
    elements.sampleReadout.textContent = `${formatInteger(next + 1)} / ${formatInteger(model.count)}`;
    $("[data-hud-time]").textContent = formatTime(model.series.time[next]);
    $("[data-hud-speed]").textContent = formatFixed(model.groundSpeed[next], 1, " m/s");
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
    $("[data-fix-status]").textContent = model.validGps[next] ? "3D fix" : "No fix";

    updateSampleInspector(next);
    updateLocalViewer(next);
    updateTerrainViewer(next);
    if (state.view === "charts") drawAllCharts();
  }

  function headingLabel(yaw) {
    if (!finite(yaw)) return "—";
    const normalized = ((Number(yaw) % 360) + 360) % 360;
    const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const degrees = Math.round(normalized) % 360;
    return `${points[Math.round(normalized / 45) % 8]} ${String(degrees).padStart(3, "0")}°`;
  }

  function switchView(view) {
    if (view === "terrain" && state.model && !state.model.hasGps) {
      toast("This log has no usable GNSS coordinates, so terrain replay is unavailable.", true);
      view = "local";
    }
    state.view = view;
    $$('[data-view-button]').forEach((button) => button.setAttribute("aria-selected", String(button.dataset.viewButton === view)));
    $$('[data-view]').forEach((panel) => {
      const active = panel.dataset.view === view;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    const overlayVisible = ["terrain", "local"].includes(view);
    $("[data-flight-hud]").hidden = !overlayVisible;
    $("[data-visual-controls]").hidden = !overlayVisible;
    elements.terrainClearanceControl.hidden = view !== "terrain";
    if (view === "charts") drawAllCharts();
    if (view === "local") state.localViewer?.resize();
    if (view === "terrain" && state.terrainViewer) {
      state.terrainViewer.map.resize();
      updateTerrainViewer(state.index, true);
    }
  }

  function setLevel(level, label) {
    state.level = level;
    state.levelLabel = label;
    updateFrame(state.index, true);
  }

  function drawAllCharts() {
    if (!state.model) return;
    for (const chart of state.charts) drawChart(chart);
  }

  function buildCharts(model) {
    state.charts = [
      {
        canvas: $('[data-chart="attitude"]'),
        series: [
          { values: model.series.roll, color: "#62dfb3", unit: "°" },
          { values: model.series.pitch, color: "#6bb6ff", unit: "°" },
          { values: model.series.yaw, color: "#f4c86a", unit: "°" }
        ]
      },
      {
        canvas: $('[data-chart="altitude"]'),
        series: [
          { values: model.baroFilled, color: "#62dfb3", unit: "m" },
          { values: model.gnssAltFilled, color: "#d4a5ff", unit: "m" }
        ]
      },
      {
        canvas: $('[data-chart="speed"]'),
        series: [
          { values: model.groundSpeed, color: "#f4c86a", unit: "m/s" },
          { values: model.series.airspeed, color: "#ff8f70", unit: "m/s" }
        ]
      },
      {
        canvas: $('[data-chart="quality"]'),
        independentScale: true,
        series: [
          { values: model.series.logDt, color: "#6bb6ff", unit: "ms" },
          { values: model.series.gnssHAcc, color: "#ff8f70", unit: "m" }
        ]
      }
    ];
    if (state.chartResizeObserver) state.chartResizeObserver.disconnect();
    state.chartResizeObserver = new ResizeObserver(() => state.view === "charts" && drawAllCharts());
    for (const chart of state.charts) {
      state.chartResizeObserver.observe(chart.canvas);
      const scrub = (event) => {
        const rect = chart.canvas.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left - 42) / Math.max(1, rect.width - 54), 0, 1);
        setPlaying(false);
        updateFrame(Math.round(ratio * (model.count - 1)), true);
      };
      chart.canvas.onpointerdown = (event) => { chart.canvas.setPointerCapture(event.pointerId); scrub(event); };
      chart.canvas.onpointermove = (event) => { if (event.buttons) scrub(event); };
    }
  }

  function drawChart(chart) {
    const canvas = chart.canvas;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const plot = { left: 42, right: width - 12, top: 8, bottom: height - 23 };
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(204,236,225,.10)";
    context.fillStyle = "#6e837c";
    context.font = "9px SFMono-Regular, Consolas, monospace";
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

    const sharedValues = chart.series.flatMap((series) => series.values.filter(finite));
    const sharedRange = paddedRange(sharedValues);
    const firstRange = chart.independentScale ? paddedRange(chart.series[0].values) : sharedRange;
    context.fillText(`${formatAxis(firstRange[1])}${chart.series[0].unit}`, 2, plot.top + 4);
    context.fillText(`${formatAxis(firstRange[0])}${chart.series[0].unit}`, 2, plot.bottom);
    for (const definition of chart.series) {
      const values = definition.values;
      const [low, high] = chart.independentScale ? paddedRange(values) : sharedRange;
      if (!finite(low) || !finite(high)) continue;
      context.strokeStyle = definition.color;
      context.lineWidth = 1.4;
      context.beginPath();
      const stride = Math.max(1, Math.floor(values.length / Math.max(1, plot.right - plot.left)));
      let started = false;
      for (let index = 0; index < values.length; index += stride) {
        const value = values[index];
        if (!finite(value)) { started = false; continue; }
        const x = plot.left + index / Math.max(1, values.length - 1) * (plot.right - plot.left);
        const y = plot.bottom - (Number(value) - low) / Math.max(1e-9, high - low) * (plot.bottom - plot.top);
        if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
      }
      context.stroke();
    }
    const cursorX = plot.left + state.index / Math.max(1, state.model.count - 1) * (plot.right - plot.left);
    context.strokeStyle = "rgba(237,245,241,.92)";
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(cursorX, plot.top); context.lineTo(cursorX, plot.bottom); context.stroke();
    context.fillStyle = "#edf5f1";
    context.beginPath(); context.arc(cursorX, plot.top + 3, 2.5, 0, Math.PI * 2); context.fill();
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
    scene.background = new THREE.Color(0x07100e);
    scene.fog = new THREE.FogExp2(0x07100e, 0.00038);
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
    const grid = new THREE.GridHelper(gridSize, 20, 0x315148, 0x19302a);
    grid.position.y = 0;
    scene.add(grid);

    const compassMaterial = new THREE.LineBasicMaterial({ color: 0x62dfb3, transparent: true, opacity: 0.8 });
    const northArrowGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0, 0.4, -horizontalSpan * 0.22),
      new THREE.Vector3(0, 0.4, -horizontalSpan * 0.22), new THREE.Vector3(-horizontalSpan * 0.018, 0.4, -horizontalSpan * 0.19),
      new THREE.Vector3(0, 0.4, -horizontalSpan * 0.22), new THREE.Vector3(horizontalSpan * 0.018, 0.4, -horizontalSpan * 0.19)
    ]);
    scene.add(new THREE.LineSegments(northArrowGeometry, compassMaterial));

    const aircraft = new THREE.Group();
    const aircraftMaterial = new THREE.MeshStandardMaterial({ color: 0x7af5c7, emissive: 0x173c30, roughness: 0.35, metalness: 0.12 });
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
      new THREE.MeshBasicMaterial({ color: 0x62dfb3 })
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
      const lowColor = new THREE.Color(0x62dfb3);
      const highColor = new THREE.Color(0xf4c86a);
      for (let index = 0; index < model.count; index += 1) {
        const point = pointAt(index);
        positions[index * 3] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = point.z;
        ground[index * 3] = point.x;
        ground[index * 3 + 1] = 0.25;
        ground[index * 3 + 2] = point.z;
        const color = lowColor.clone().lerp(highColor, index / Math.max(1, model.count - 1));
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
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
      const upRange = rangeOf(upSource.map((value) => value * Number(elements.verticalScale.value)));
      orbitTarget = new THREE.Vector3(xCenter, finite(upRange[0]) ? (upRange[0] + upRange[1]) / 2 : points[1].y, zCenter);
      orbitDistance = Math.max(horizontalSpan * 1.55, (finite(upRange[1]) ? upRange[1] - upRange[0] : 0) * 2.2, 70);
      updateCamera(true);
    };

    const updateCamera = (forceOrbit = false) => {
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
      const point = pointAt(index);
      const attitude = displayedAttitude(index);
      aircraft.position.copy(point);
      aircraft.rotation.order = "YXZ";
      aircraft.rotation.set(radians(attitude.pitch), -radians(attitude.yaw), -radians(attitude.roll));
      if (["follow", "top"].includes(elements.cameraMode.value)) updateCamera();
    };

    const resize = () => {
      const width = Math.max(1, elements.localHost.clientWidth);
      const height = Math.max(1, elements.localHost.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
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

    const animate = () => {
      if (disposed) return;
      renderer.render(scene, camera);
      window.requestAnimationFrame(animate);
    };
    rebuildPath();
    fit();
    resize();
    update(0);
    animate();

    return {
      update,
      resize,
      fit,
      rebuildPath: () => { rebuildPath(); fit(); update(state.index); },
      dispose: () => {
        disposed = true;
        observer.disconnect();
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
    const valid = [];
    for (let index = 0; index < model.count; index += 1) {
      if (finite(model.lat[index]) && finite(model.lon[index])) valid.push(index);
    }
    const first = valid[0] ?? 0;
    const last = valid[valid.length - 1] ?? first;
    const current = finite(model.lat[currentIndex]) && finite(model.lon[currentIndex]) ? currentIndex : first;
    const feature = (index, kind, label) => ({
      type: "Feature",
      properties: { kind, label },
      geometry: { type: "Point", coordinates: [model.lon[index], model.lat[index]] }
    });
    return { type: "FeatureCollection", features: [feature(first, "start", "START"), feature(last, "end", "END"), feature(current, "current", "")] };
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
    let renderer = null;

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

        const aircraftMaterial = new THREE.MeshStandardMaterial({ color: 0x7af5c7, emissive: 0x173c30, roughness: 0.35, metalness: 0.12 });
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
        this.tether = new THREE.Line(this.tetherGeometry, new THREE.LineBasicMaterial({ color: 0x7af5c7, transparent: true, opacity: 0.42 }));
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
        const material = new THREE.MeshBasicMaterial({ color: 0x62dfb3, transparent: true, opacity: 0.94 });
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
        launchTerrain = groundAt(originIndex);
        this.rebuildPath();
        this.update(state.index);
        return indices.length ? available / indices.length : 0;
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
      onTerrainData: null,
      onTerrainIdle: null,
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
            "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "#6bb6ff", 0.55, "#62dfb3", 1, "#f4c86a"]
          }
        }, firstSymbol);
        map.addSource("skylabs-track-points", { type: "geojson", data: terrainMarkerGeoJson(0) });
        map.addLayer({
          id: "skylabs-track-points",
          type: "circle",
          source: "skylabs-track-points",
          paint: {
            "circle-radius": ["match", ["get", "kind"], "current", 7, 5],
            "circle-color": ["match", ["get", "kind"], "start", "#62dfb3", "end", "#f4c86a", "#edf5f1"],
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
        fitTerrainMap(false);
        const refreshTerrain = () => {
          if (state.terrainViewer !== viewer || viewer.aligned && viewer.refreshAttempts >= 4) return;
          viewer.refreshAttempts += 1;
          const coverage = viewer.flightLayer.refreshTerrain();
          if (coverage <= 0) return;
          if (!viewer.aligned) {
            viewer.aligned = true;
            window.clearTimeout(viewer.loadTimer);
            showTerrainStatus("ready");
            updateTerrainViewer(0, true);
            toast("Terrain-aligned 3D replay ready — no API key required.");
          }
          if (coverage >= 0.98 || viewer.refreshAttempts >= 4) {
            map.off("sourcedata", viewer.onTerrainData);
            map.off("idle", viewer.onTerrainIdle);
          }
        };
        const scheduleTerrainRefresh = () => {
          if (viewer.refreshTimer) return;
          viewer.refreshTimer = window.setTimeout(() => {
            viewer.refreshTimer = null;
            refreshTerrain();
          }, 80);
        };
        viewer.onTerrainData = (event) => {
          if (event.sourceId === "skylabs-terrain" && map.isSourceLoaded("skylabs-terrain")) scheduleTerrainRefresh();
        };
        viewer.onTerrainIdle = scheduleTerrainRefresh;
        map.on("sourcedata", viewer.onTerrainData);
        map.on("idle", viewer.onTerrainIdle);
        scheduleTerrainRefresh();
      } catch (error) {
        showTerrainStatus("error", error instanceof Error ? error.message : "The terrain overlay could not be initialized.");
      }
    });
    map.on("error", (event) => {
      if (!viewer.ready && event.error?.message) showTerrainStatus("error", event.error.message);
    });
  }

  function updateTerrainViewer(index, force = false) {
    const viewer = state.terrainViewer;
    if (!viewer?.ready || !state.model?.hasGps) return;
    viewer.flightLayer.update(index);
    viewer.map.getSource("skylabs-track-points")?.setData(terrainMarkerGeoJson(index));
    const now = performance.now();
    if (elements.cameraMode.value === "follow" && (force || now - state.lastMapCameraUpdate > 110)) {
      const model = state.model;
      const heading = finite(model.series.gnssHeading[index]) ? model.series.gnssHeading[index] : model.series.yaw[index];
      viewer.map.jumpTo({
        center: [model.lon[index], model.lat[index]],
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
    elements.terrainClearanceStatus.textContent = `Terrain aligned · ${value} m minimum AGL`;
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

  function exportNormalizedCsv() {
    const model = state.model;
    if (!model) return;
    const headers = [
      "time_s", "timestamp_ms", "gnss_lat", "gnss_lon", "altitude_m", "gnss_alt_m",
      "ground_speed_mps", "airspeed_mps", "roll_deg", "pitch_deg", "yaw_deg", "gnss_siv",
      "gnss_h_acc_m", "log_dt_ms", "esc_current_a", "esc_voltage_v", "esc_rpm",
      "log_overrun_count", "sd_write_error_count"
    ];
    const rows = [headers.join(",")];
    for (let index = 0; index < model.count; index += 1) {
      rows.push([
        model.series.time[index], model.series.timestampMs[index], model.lat[index], model.lon[index],
        model.baroFilled[index], model.gnssAltFilled[index], model.groundSpeed[index], model.series.airspeed[index],
        model.series.roll[index], model.series.pitch[index], model.series.yaw[index], model.series.sats[index],
        model.series.gnssHAcc[index], model.series.logDt[index], model.series.current[index], model.series.voltage[index],
        model.series.rpm[index], model.series.overrun[index], model.series.sdErrors[index]
      ].map(escapeCsv).join(","));
    }
    const base = model.meta.name.replace(/\.[^.]+$/, "");
    downloadBlob(`${base}_normalized.csv`, new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    toast("Normalized CSV export created.");
  }

  function downloadTemplate() {
    const content = [
      "timestamp_ms,gnss_lat,gnss_lon,altitude_m,gnss_alt_m,roll_deg,pitch_deg,yaw_deg,airspeed_mps,gnss_siv,gnss_h_acc_m,log_dt_ms",
      "0,-33.6440810,151.0470890,152.60,200.27,0.0,0.0,0.0,,10,1.20,50",
      "50,-33.6440805,151.0470898,152.65,200.31,0.2,-0.1,0.5,,10,1.20,50"
    ].join("\r\n");
    downloadBlob("skylabs_flight_log_template.csv", new Blob([content], { type: "text/csv;charset=utf-8" }));
  }

  async function handleFlightFile(file) {
    if (!file) return;
    showLoading();
    try {
      const model = await parseFlightFile(file);
      setLoading("Building flight solution", "Deriving local coordinates, speed and diagnostic channels.", 70);
      await new Promise((resolve) => window.setTimeout(resolve, 24));
      setLoading("Preparing review workspace", `${formatInteger(model.count)} usable samples ready.`, 94);
      await new Promise((resolve) => window.setTimeout(resolve, 24));
      populateWorkspace(model);
    } catch (error) {
      showOnboarding();
      toast(error instanceof Error ? error.message : "The flight log could not be read.", true);
    } finally {
      elements.fileInput.value = "";
    }
  }

  function openFilePicker() {
    elements.fileInput.click();
  }

  $$('[data-choose-file]').forEach((button) => button.addEventListener("click", openFilePicker));
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
  elements.timeline.addEventListener("input", () => { setPlaying(false); updateFrame(Number(elements.timeline.value), true); });
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
  $("[data-fit-track]").addEventListener("click", () => state.view === "terrain" ? fitTerrainMap() : state.localViewer?.fit());

  $("[data-level-start]").addEventListener("click", () => setLevel({ ...state.model.defaultLevel }, "Auto-level"));
  $("[data-level-now]").addEventListener("click", () => setLevel({
    roll: state.model.series.roll[state.index],
    pitch: state.model.series.pitch[state.index],
    yaw: state.model.series.yaw[state.index]
  }, `Leveled ${formatTime(state.model.series.time[state.index])}`));
  $("[data-level-reset]").addEventListener("click", () => setLevel(null, "Raw IMU"));

  elements.mapRetry.addEventListener("click", () => initializeTerrainViewer(state.model));

  $("[data-copy-sample]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(sampleObject(state.index), null, 2));
      toast("Current sample copied as JSON.");
    } catch {
      toast("The browser could not copy this sample.", true);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!state.model || elements.workspace.hidden || elements.schemaDialog.open) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
    if (event.code === "Space") { event.preventDefault(); elements.play.click(); }
    if (event.code === "ArrowLeft") { event.preventDefault(); setPlaying(false); updateFrame(state.index - 1, true); }
    if (event.code === "ArrowRight") { event.preventDefault(); setPlaying(false); updateFrame(state.index + 1, true); }
  });

  function animatePlayback(timestamp) {
    if (state.playing && state.model) {
      if (state.lastAnimationTime === null) state.lastAnimationTime = timestamp;
      const elapsed = Math.max(0, (timestamp - state.lastAnimationTime) / 1000) * Number(elements.rate.value);
      state.lastAnimationTime = timestamp;
      state.playbackTime += elapsed;
      if (state.playbackTime >= state.model.stats.duration) {
        updateFrame(state.model.count - 1, true);
        setPlaying(false);
      } else {
        updateFrame(findIndexAtTime(state.playbackTime));
      }
    }
    window.requestAnimationFrame(animatePlayback);
  }

  window.requestAnimationFrame(animatePlayback);
})();
