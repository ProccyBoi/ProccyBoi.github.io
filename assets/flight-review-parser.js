/* Flight review data parser. No DOM, rendering or network dependencies.
 * The worker supplies SheetJS only for spreadsheet imports. Numerical arrays
 * remain ordinary arrays until prepareTransfer, preserving calculation order. */
(function (root) {
  "use strict";

  const MAX_FILE_BYTES = 150 * 1024 * 1024;
  const EARTH_RADIUS_M = 6_371_000;
  const MAGIC = "SKYLBIN1";
  const HEADER_BYTES = 48;
  const RECORD_SIZES = new Map([[1, 238], [2, 250], [3, 282]]);
  const number = (value) => {
    if (value === null || value === undefined || value === "") return NaN;
    const parsed = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const radians = (degrees) => Number(degrees || 0) * Math.PI / 180;
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

  function readMagic(buffer) {
    if (buffer.byteLength < MAGIC.length) return "";
    return new TextDecoder("ascii").decode(new Uint8Array(buffer, 0, MAGIC.length));
  }

  function parseBinaryLog(buffer, file, onProgress) {
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
      if (onProgress && index % 32768 === 0) {
        onProgress({ title: "Decoding telemetry", detail: `${index.toLocaleString()} of ${recordCount.toLocaleString()} records`, percent: 30 + index / recordCount * 40 });
      }
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
    }, onProgress);
  }

  function parseSpreadsheet(buffer, file, extension, onProgress) {
    if (!root.XLSX) throw new Error("The spreadsheet parser could not be loaded. Check the connection and retry.");
    let workbook;
    try {
      workbook = root.XLSX.read(buffer, { type: "array", dense: true, cellDates: true });
    } catch (error) {
      throw new Error(`The ${extension.toUpperCase()} file could not be decoded: ${error.message}`);
    }
    const sheetName = workbook.SheetNames.find((name) => workbook.Sheets[name]?.["!ref"]);
    if (!sheetName) throw new Error("The workbook does not contain a populated worksheet.");
    onProgress?.({ title: "Mapping telemetry columns", detail: sheetName, percent: 48 });
    const rows = root.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
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
        if (key === "gnssFix") series[key].push(columns[key] ? value(key) : (isValidGps(lat, lon, NaN) ? 1 : 0));
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
    }, onProgress);
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

  function finalizeModel(series, meta, onProgress) {
    onProgress?.({ title: "Preparing flight data", detail: "Aligning samples and filling telemetry gaps", percent: 72 });
    if (series.time.some((time, index) => index > 0 && Number(time) < Number(series.time[index - 1]))) reorderSeries(series);
    const timeOrigin = firstFinite(series.time, 0);
    series.time = series.time.map((time) => Number(time) - timeOrigin);
    const count = series.time.length;
    if (count < 2) throw new Error("The log contains fewer than two usable records.");

    const validGps = series.lat.map((lat, index) => {
      const lon = series.lon[index];
      const fix = series.gnssFix[index];
      return isValidGps(lat, lon, fix);
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
    onProgress?.({ title: "Calculating flight track", detail: "Deriving distance, ground speed and flight statistics", percent: 80 });
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
      sdErrors: lastFinite(series.sdErrors),
      overruns: lastFinite(series.overrun),
      ekfHUncFinal: lastFinite(series.ekfHUnc),
      ekfVelUncFinal: lastFinite(series.ekfVelUnc),
      imuResets: lastFinite(series.imuResets)
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


  // Geographic zero is valid on either axis. The all-zero placeholder needs an
  // explicit positive fix so an absent/default position does not become a track.
  function isValidGps(lat, lon, fix) {
    if (!finite(lat) || !finite(lon) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return false;
    if (finite(fix)) return Number(fix) > 0;
    return Number(lat) !== 0 || Number(lon) !== 0;
  }

  function parseFlightBuffer(buffer, file = {}, extension, onProgress) {
    if (!(buffer instanceof ArrayBuffer)) throw new Error("The flight log could not be read as binary data.");
    if (!buffer.byteLength) throw new Error("The selected file is empty.");
    if (buffer.byteLength > MAX_FILE_BYTES || file.size > MAX_FILE_BYTES) throw new Error("This file is larger than the 150 MB browser limit.");
    const metadata = { name: String(file.name || "flight.bin"), size: file.size ?? buffer.byteLength };
    const type = String(extension || metadata.name.split(".").pop()).toLowerCase();
    if (type === "bin" || readMagic(buffer) === MAGIC) return parseBinaryLog(buffer, metadata, onProgress);
    if (["xlsx", "xls", "csv", "tsv"].includes(type)) return parseSpreadsheet(buffer, metadata, type, onProgress);
    throw new Error("Unsupported file type. Choose a .BIN, .XLSX, .XLS, .CSV or .TSV flight log.");
  }

  const DERIVED_NUMERIC_KEYS = ["lat", "lon", "east", "north", "baroFilled", "gnssAltFilled", "baroUp", "gnssUp", "groundSpeed"];

  // Conversion happens only after calculations, so Array.map/filter semantics
  // and IEEE-754 double precision match the original parser. Transfer ownership
  // instead of cloning millions of numeric values back to the UI thread.
  // validGps intentionally stays a boolean Array; typed booleans change equality.
  function prepareTransfer(model) {
    const transferables = [];
    for (const key of SERIES_KEYS) {
      const values = Float64Array.from(model.series[key]);
      model.series[key] = values;
      transferables.push(values.buffer);
    }
    for (const key of DERIVED_NUMERIC_KEYS) {
      const values = Float64Array.from(model[key]);
      model[key] = values;
      transferables.push(values.buffer);
    }
    return { model, transferables };
  }

  root.FlightReviewParser = Object.freeze({ MAX_FILE_BYTES, MAGIC, HEADER_BYTES, RECORD_SIZES, SERIES_KEYS, FIELD_ALIASES, number, finite, normalizeHeader, readMagic, makeSeries, parseBinaryLog, parseSpreadsheet, reorderSeries, interpolate, estimateGroundSpeed, finalizeModel, isValidGps, parseFlightBuffer, prepareTransfer, DERIVED_NUMERIC_KEYS });
})(globalThis);
