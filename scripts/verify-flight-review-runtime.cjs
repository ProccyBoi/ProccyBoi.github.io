#!/usr/bin/env node
/* Independent numerical/lifecycle invariants exercised against production
 * functions. These are Node unit checks, not browser or physical-device QA. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/flight-review.js'), 'utf8');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Production function boundary: ' + start);
  return source.slice(a, b);
}
const node = () => ({ setAttribute() {}, style: {}, textContent: '' });
const count = 10001;
const time = Float64Array.from({ length: count }, (_, i) => i * .05);
const zeros = new Float64Array(count);
const model = {
  count, stats: { duration: time.at(-1) },
  series: { time, sats: zeros, gnssHAcc: zeros },
  groundSpeed: zeros, baroFilled: zeros, gnssAltFilled: zeros,
  east: zeros, north: zeros, baroUp: zeros,
  hasGps: false, validGps: new Array(count).fill(false)
};
let scheduled = 0;
let wallNow = 0;
const state = { model, index: 0, playing: false, playbackTime: 0, lastAnimationTime: null, view: 'charts', playbackFrame: 0 };
const elements = {
  play: node(), playIcon: node(), timeline: node(), currentTime: node(),
  sampleReadout: node(), horizonWorld: node(), heightSource: { value: 'baro' },
  rate: { value: '1' }
};
const scope = {
  state, elements, document: { hidden: false, querySelector: node, querySelectorAll: () => [] },
  performance: { now: () => wallNow },
  window: { requestAnimationFrame() { return ++scheduled; }, cancelAnimationFrame() {} },
  $: node, displayedAttitude: () => ({ roll: 0, pitch: 0, yaw: 0 }),
  headingLabel: String, updateChartCursors() {}, console
};
vm.createContext(scope);
const helpers = source.slice(0, source.indexOf('  const elements ='));
const functions = between('  function setPlaying(', '  function headingLabel(')
  + between('  function animatePlayback(', '  document.addEventListener("visibilitychange"')
  + between('  function chartVertices(', '  function drawChart(')
  + between('  function buildHealthItems(', '  function eulerToQuat(')
  + between('  function terrainMarkerGeoJson(', '  function storedMapTilerKey(')
  + between('  function terrainElevationAt(', '  function createTerrainFlightLayer(');
const api = vm.runInContext(helpers + functions
  + '\nreturn {setPlaying, animatePlayback, updateFrame, findIndexAtTime, chartVertices, buildHealthItems, terrainMarkerGeoJson, terrainElevationAt, finite}; })();', scope);

// Exercise the real playback and sample update functions, not a rewritten clock.
for (const rate of [.25, .5, 1, 2, 4, 8, 16]) {
  api.updateFrame(0, true);
  elements.rate.value = String(rate);
  wallNow = 0;
  api.setPlaying(true);
  for (let frame = 0; frame <= 600; frame++) {
    wallNow = frame * 1000 / 60;
    api.animatePlayback(wallNow);
  }
  assert.ok(Math.abs(state.playbackTime - 10 * rate) < 1e-9, 'Continuous clock at ' + rate + 'x');
  assert.ok(Math.abs(model.series.time[state.index] - 10 * rate) < .051, 'Sample follows time at ' + rate + 'x');
  api.setPlaying(false);
  const before = scheduled;
  api.animatePlayback(10001);
  assert.equal(scheduled, before, 'Paused callback does not reschedule');
}
api.updateFrame(count - 2, true);
elements.rate.value = '1';
wallNow = 0;
api.setPlaying(true);
api.animatePlayback(0);
wallNow = 1000;
api.animatePlayback(1000);
assert.equal(state.index, count - 1);
assert.equal(state.playing, false);
assert.equal(state.playbackTime, model.stats.duration);
api.updateFrame(0, true);
elements.rate.value = '4';
wallNow = 123.4; api.setPlaying(true);
wallNow = 173.4; api.animatePlayback(wallNow);
wallNow = 198.4; api.setPlaying(false);
assert.ok(Math.abs(state.playbackTime - .3) < 1e-12, 'Include first-RAF delay and final fractional pause interval');
api.updateFrame(0, true);
wallNow = 1000; api.setPlaying(true);
wallNow = 1040; api.setPlaying(false);
assert.ok(Math.abs(state.playbackTime - .16) < 1e-12, 'Pause before the first RAF still advances exact elapsed time');
wallNow = 2000; api.setPlaying(true);
wallNow = 2050; api.animatePlayback(wallNow);
wallNow = 2075; api.setPlaying(false);
assert.ok(Math.abs(state.playbackTime - .46) < 1e-12, 'Resume excludes the paused interval without losing fractional progress');
scope.document.hidden = true;
api.setPlaying(true);
assert.equal(state.playing, false, 'Cannot start in a hidden document');
scope.document.hidden = false;
state.model = { series: { time: new Float64Array([0, .05, .1, 10, 10.05, 20]) } };
assert.equal(api.findIndexAtTime(5), 2, 'Irregular time seek uses elapsed time');
assert.equal(api.findIndexAtTime(10), 3);
assert.equal(api.findIndexAtTime(20), 5);
assert.match(source, /queueSeek\(findIndexAtTime\(ratio \* model\.stats\.duration\)\)/, 'Chart scrubbing uses the elapsed-time lookup');
console.log('PASS actual playback controller: 0.25–16x, exact click/RAF/pause endpoints, irregular time, hidden/end behavior');

const equal = (actual, expected, label) => assert.deepEqual(Array.from(actual), expected, label);
equal(api.chartVertices(new Float64Array([1, 50, -20, 5, 8]), new Float64Array([0, .01, .02, .03, 10]), 10, 1), [0, 1, 2, 3, 4], 'Dense time-bucket extrema and endpoints');
equal(api.chartVertices([1, 2, NaN, 4, 5], [0, .1, .2, .3, .4], 1, 1), [0, 1, -1, 3, 4], 'Gap splits a shared bucket');
equal(api.chartVertices([NaN, NaN, 3, NaN], [0, 1, 2, 3], 3, 10), [-1, 2, -1], 'Leading and trailing gaps');
equal(api.chartVertices([1, 2, 3, 4], [0, 0, 0, 0], 0, 10), [0, 3], 'Duplicate timestamps');
const denseCount = 100000;
const values = Float64Array.from({ length: denseCount }, (_, i) => Math.sin(i * .2));
const times = Float64Array.from({ length: denseCount }, (_, i) => i * .05);
values[57501] = 999; values[57502] = -999;
const vertices = api.chartVertices(values, times, times.at(-1), 800);
assert.ok(vertices.includes(57501) && vertices.includes(57502), 'Single-sample spikes survive');
assert.equal(vertices[0], 0); assert.equal(vertices.at(-1), denseCount - 1);
assert.ok(vertices.length <= 4 * 801, 'Bounded vertices for a continuous finite trace');
for (let i = 1; i < vertices.length; i++) assert.ok(vertices[i] >= vertices[i - 1], 'Chronological extrema');
console.log('PASS time-pixel charts: typed arrays, extrema, gaps, duplicate timestamps and 100k-sample spikes');

const absent = new Float64Array([NaN, NaN]);
const unknownModel = {
  count: 2, hasGps: true,
  series: { roll: absent, pitch: absent, yaw: absent, airspeed: absent, voltage: absent, rpm: absent, sdErrors: absent },
  stats: { sdErrors: NaN, overruns: NaN, logDtMedian: 50, validGpsPercent: 100, gnssHAccMedian: NaN, ekfHUncFinal: NaN, ekfVelUncFinal: NaN, imuResets: NaN }
};
const unknownHealth = api.buildHealthItems(unknownModel);
assert.ok(unknownHealth.some(item => /SD.*unavailable/i.test(item.title + ' ' + item.detail)), 'Missing SD counter is explicit');
assert.ok(unknownHealth.some(item => /Attitude incomplete/i.test(item.title)), 'Missing attitude is not continuous');
assert.ok(!unknownHealth.some(item => /No SD write errors|Attitude stream continuous|Logging cadence stable/.test(item.title)), 'No false healthy diagnostic from missing fields');
assert.ok(!unknownHealth.some(item => item.level === 'good' && /GNSS/.test(item.title)), 'Unknown accuracy is not a good-quality assessment');
const resetHealth = api.buildHealthItems({ ...unknownModel, series: { ...unknownModel.series, sdErrors: new Float64Array([7, 0]) }, stats: { ...unknownModel.stats, sdErrors: 0 } });
assert.ok(resetHealth.some(item => item.level === 'critical' && /SD/.test(item.title)), 'Earlier errors are not erased by a counter reset');
console.log('PASS diagnostic integrity: unavailable counters/attitude/accuracy and earlier SD errors');

assert.equal(api.finite(null), false); assert.equal(api.finite(undefined), false); assert.equal(api.finite(''), false); assert.equal(api.finite(0), true);
const flatDem = value => ({ dim: 256, get() { return value; } });
const tile = (z, x, y, dem = flatDem(0)) => ({ tileID: { canonical: { z, x, y } }, dem });
const terrainTiles = new Map();
assert.ok(Number.isNaN(api.terrainElevationAt(terrainTiles, 0, 0)), 'No decoded tiles is no elevation evidence');
terrainTiles.set('world', tile(0, 0, 0));
for (const lon of [-540, -180, 0, 180, 540]) {
  assert.equal(api.terrainElevationAt(terrainTiles, lon, 0), 0, 'Genuine sea-level world wrap at ' + lon);
}
for (const lat of [-90, 90, NaN, null]) assert.ok(Number.isNaN(api.terrainElevationAt(terrainTiles, 0, lat)), 'Invalid/polar terrain query rejected');
assert.ok(Number.isNaN(api.terrainElevationAt(terrainTiles, NaN, 0)));
assert.equal(api.terrainElevationAt(terrainTiles, 0, 85), 0);
assert.equal(api.terrainElevationAt(terrainTiles, 0, -85), 0);
terrainTiles.clear();
terrainTiles.set('north-west', tile(1, 0, 0, flatDem(12)));
assert.equal(api.terrainElevationAt(terrainTiles, -45, 45), 12, 'Coordinate inside decoded tile');
assert.ok(Number.isNaN(api.terrainElevationAt(terrainTiles, 45, 45)), 'Same source does not imply east coverage');
assert.ok(Number.isNaN(api.terrainElevationAt(terrainTiles, -45, -45)), 'Same source does not imply south coverage');
assert.ok(Number.isNaN(api.terrainElevationAt(terrainTiles, -45, 0)), 'Tile border uses the correct south tile');
terrainTiles.get('north-west').dem = null;
assert.ok(Number.isNaN(api.terrainElevationAt(terrainTiles, -45, 45)), 'Evicted decoded data ceases to prove coverage');
terrainTiles.clear();
// A nonconstant 2x2 DEM verifies all four interpolation weights, independently
// of the vendor query that can return a false zero for unavailable tiles.
const pixels = [[0, 10, 20], [20, 30, 40], [40, 50, 60]];
terrainTiles.set('world', tile(0, 0, 0, { dim: 2, get(x, y) { return pixels[y][x]; } }));
const latForY = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;
assert.ok(Math.abs(api.terrainElevationAt(terrainTiles, -135, latForY(.375)) - 17.5) < 1e-10, 'Bilinear weights at pixel (0.25,0.75)');
assert.ok(Math.abs(api.terrainElevationAt(terrainTiles, 135, latForY(.875)) - 52.5) < 1e-10, 'Bilinear weights near tile border');
terrainTiles.set('child', tile(1, 0, 0, flatDem(100)));
assert.equal(api.terrainElevationAt(terrainTiles, -135, latForY(.375)), 100, 'Highest-resolution decoded covering tile wins');
terrainTiles.get('child').dem = null;
assert.ok(Math.abs(api.terrainElevationAt(terrainTiles, -135, latForY(.375)) - 17.5) < 1e-10, 'Evicted child falls back to real decoded parent');
terrainTiles.clear();
let terrainQueries = 0;
const terrainScope = {
  finite: api.finite, terrainElevationAt: api.terrainElevationAt, terrainTiles,
  terrainElevations: new Float64Array([NaN]), model: { lat: [0], lon: [0] },
  map: { isSourceLoaded() { return true; }, queryTerrainElevation() { terrainQueries++; return 0; } }
};
vm.createContext(terrainScope);
const groundAt = vm.runInContext(between('    const groundAt =', '    const flightAltitude =') + ';groundAt;', terrainScope);
assert.ok(Number.isNaN(groundAt(0)), 'Vendor fallback zero without a decoded tile is unavailable');
assert.equal(terrainQueries, 0, 'Do not query the vendor fallback');
assert.ok(Number.isNaN(terrainScope.terrainElevations[0]), 'Vendor fallback zero is never cached');
terrainTiles.set('world', tile(0, 0, 0, flatDem(NaN)));
assert.ok(Number.isNaN(groundAt(0)), 'Invalid decoded elevation is unavailable');
assert.ok(Number.isNaN(terrainScope.terrainElevations[0]), 'Invalid decoded elevation is not cached');
terrainTiles.get('world').dem = flatDem(0);
assert.equal(groundAt(0), 0, 'Real sea-level elevation remains valid');
terrainTiles.get('world').dem = flatDem(20);
assert.equal(groundAt(0), 0, 'Confirmed elevation is cached');
terrainScope.terrainElevations.fill(NaN);
assert.equal(groundAt(0), 20, 'Cache invalidation allows updated decoded elevations');
terrainScope.terrainElevations.fill(NaN);
terrainTiles.get('world').dem = null;
assert.ok(Number.isNaN(groundAt(0)), 'Evicted DEM cannot create new zero elevation evidence');
assert.equal(terrainQueries, 0, 'Ground samples never depend on ambiguous vendor fallback');
console.log('PASS decoded terrain: missing/evicted DEM, partial coverage, wraps/poles, bilinear interpolation, highest zoom and sea level');

let reads = 0;
const coordinates = new Proxy(Array.from({ length: 100000 }, (_, i) => i / 100000), { get(target, key) { if (/^\d+$/.test(String(key))) reads++; return Reflect.get(target, key); } });
state.model = { count: coordinates.length, lat: coordinates, lon: coordinates };
state.index = 50000;
const firstMarkers = api.terrainMarkerGeoJson();
assert.equal(firstMarkers.features.length, 3);
reads = 0;
api.terrainMarkerGeoJson(50001);
assert.ok(reads < 30, 'Marker updates do not rescan 100k coordinates');
equal(state.model.markerEndpoints, [0, 99999], 'Cached first/last endpoints');
console.log('PASS cached terrain markers preserve endpoints without a per-frame full-log scan');

// Chunking must not round values, add/drop rows or introduce extra delimiters.
(async () => {
  const exportButton = { textContent: 'Export CSV', disabled: false };
  const downloads = [];
  const exportState = { model: null };
  const exportScope = {
    state: exportState, Blob, document: { querySelector: () => exportButton },
    window: { setTimeout(resolve) { queueMicrotask(resolve); } },
    downloadBlob(name, blob) { downloads.push({ name, blob }); }, toast() {}
  };
  vm.createContext(exportScope);
  const exportCsv = vm.runInContext(helpers
    + between('  async function exportNormalizedCsv(', '  function downloadTemplate(')
    + '\nreturn exportNormalizedCsv; })();', exportScope);
  const headers = ['time_s', 'timestamp_ms', 'gnss_lat', 'gnss_lon', 'altitude_m', 'gnss_alt_m', 'ground_speed_mps', 'airspeed_mps', 'roll_deg', 'pitch_deg', 'yaw_deg', 'gnss_siv', 'gnss_h_acc_m', 'log_dt_ms', 'esc_current_a', 'esc_voltage_v', 'esc_rpm', 'log_overrun_count', 'sd_write_error_count'];
  for (const rows of [1, 1999, 2000, 2001, 4000, 4001]) {
    downloads.length = 0;
    const values = Float64Array.from({ length: rows }, (_, i) => i % 7 === 0 ? NaN : 1.23456789012345 + i / 10000);
    const series = Object.fromEntries(['time', 'timestampMs', 'airspeed', 'roll', 'pitch', 'yaw', 'sats', 'gnssHAcc', 'logDt', 'current', 'voltage', 'rpm', 'overrun', 'sdErrors'].map(key => [key, values]));
    exportState.model = { count: rows, meta: { name: 'precision-test.csv' }, series, lat: values, lon: values, baroFilled: values, gnssAltFilled: values, groundSpeed: values };
    const first = exportCsv();
    if (rows >= 2000) await exportCsv(); // A duplicate while the first yields is ignored.
    await first;
    assert.equal(downloads.length, 1, 'One export at chunk boundary ' + rows);
    assert.equal(downloads[0].name, 'precision-test_normalized.csv');
    const expected = [headers.join(','), ...Array.from(values, value => new Array(19).fill(Number.isNaN(value) ? '' : String(value)).join(','))].join('\r\n');
    assert.equal(await downloads[0].blob.text(), expected, 'Exact CSV bytes at chunk boundary ' + rows);
    assert.equal(exportButton.disabled, false); assert.equal(exportButton.textContent, 'Export CSV');
  }
  console.log('PASS chunked CSV export: decimal precision, empty cells, exact row delimiters, boundary counts and duplicate guard');

  const created = [], timers = new Map();
  let timerId = 0;
  const loaderWindow = {
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  };
  const loaderScope = {
    window: loaderWindow,
    document: {
      createElement(tag) { return { tag, removed: false, remove() { this.removed = true; } }; },
      head: { append(element) { created.push(element); } }
    }
  };
  vm.createContext(loaderScope);
  const loaders = vm.runInContext(between('  const runtimeLoads =', '  function cancelParsing(')
    + ';({loadRuntime, loadMapStyles});', loaderScope);
  const styles = loaders.loadMapStyles();
  assert.equal(loaders.loadMapStyles(), styles, 'Pending styles are deduplicated');
  created.at(-1).onerror();
  await assert.rejects(styles, /Map styles could not load/);
  assert.equal(created.at(-1).removed, true);
  const retryStyles = loaders.loadMapStyles();
  assert.equal(created.length, 2, 'Failed styles can be requested again');
  created.at(-1).onload(); await retryStyles;
  assert.equal(loaders.loadMapStyles(), retryStyles, 'Successful styles stay cached');

  const library = loaders.loadRuntime('test-runtime.js', 'TEST_RUNTIME');
  assert.equal(loaders.loadRuntime('test-runtime.js', 'TEST_RUNTIME'), library, 'Pending scripts are deduplicated');
  created.at(-1).onload();
  await assert.rejects(library, /could not be initialized/);
  const retryLibrary = loaders.loadRuntime('test-runtime.js', 'TEST_RUNTIME');
  loaderWindow.TEST_RUNTIME = {};
  created.at(-1).onload(); await retryLibrary;
  const loadedCount = created.length;
  await loaders.loadRuntime('test-runtime.js', 'TEST_RUNTIME');
  assert.equal(created.length, loadedCount, 'Existing library does not reload');

  const stalled = loaders.loadRuntime('stalled-runtime.js', 'STALLED_RUNTIME');
  assert.equal(timers.size, 1, 'Successful/failed loader timers were cleared');
  const timeout = [...timers.values()][0]; timeout();
  await assert.rejects(stalled, /too long/);
  assert.equal(created.at(-1).removed, true, 'Timed-out script is removed for retry');
  console.log('PASS lazy dependency recovery: script/style deduplication, failure retry, missing global and timeout cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
