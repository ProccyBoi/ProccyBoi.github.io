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
const state = { model, index: 0, playing: false, playbackTime: 0, lastAnimationTime: null, view: 'charts', playbackFrame: 0 };
const elements = {
  play: node(), playIcon: node(), timeline: node(), currentTime: node(),
  sampleReadout: node(), horizonWorld: node(), heightSource: { value: 'baro' },
  rate: { value: '1' }
};
const scope = {
  state, elements, document: { hidden: false, querySelector: node, querySelectorAll: () => [] },
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
  + between('  function terrainMarkerGeoJson(', '  function storedMapTilerKey(');
const api = vm.runInContext(helpers + functions
  + '\nreturn {setPlaying, animatePlayback, updateFrame, findIndexAtTime, chartVertices, buildHealthItems, terrainMarkerGeoJson, finite}; })();', scope);

// Exercise the real playback and sample update functions, not a rewritten clock.
for (const rate of [.25, .5, 1, 2, 4, 8, 16]) {
  api.updateFrame(0, true);
  elements.rate.value = String(rate);
  api.setPlaying(true);
  for (let frame = 0; frame <= 600; frame++) api.animatePlayback(frame * 1000 / 60);
  assert.ok(Math.abs(state.playbackTime - 10 * rate) < 1e-9, 'Continuous clock at ' + rate + 'x');
  assert.ok(Math.abs(model.series.time[state.index] - 10 * rate) < .051, 'Sample follows time at ' + rate + 'x');
  api.setPlaying(false);
  const before = scheduled;
  api.animatePlayback(10001);
  assert.equal(scheduled, before, 'Paused callback does not reschedule');
}
api.updateFrame(count - 2, true);
elements.rate.value = '1';
api.setPlaying(true);
api.animatePlayback(0);
api.animatePlayback(1000);
assert.equal(state.index, count - 1);
assert.equal(state.playing, false);
assert.equal(state.playbackTime, model.stats.duration);
scope.document.hidden = true;
api.setPlaying(true);
assert.equal(state.playing, false, 'Cannot start in a hidden document');
scope.document.hidden = false;
state.model = { series: { time: new Float64Array([0, .05, .1, 10, 10.05, 20]) } };
assert.equal(api.findIndexAtTime(5), 2, 'Irregular time seek uses elapsed time');
assert.equal(api.findIndexAtTime(10), 3);
assert.equal(api.findIndexAtTime(20), 5);
assert.match(source, /queueSeek\(findIndexAtTime\(ratio \* model\.stats\.duration\)\)/, 'Chart scrubbing uses the elapsed-time lookup');
console.log('PASS actual playback controller: 0.25–16x clock, irregular time lookup, pause/hidden/end behavior');

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
let elevation = null, terrainQueries = 0;
const terrainScope = {
  finite: api.finite, terrainElevations: new Float64Array([NaN]), model: { lat: [0], lon: [0] },
  map: { isSourceLoaded() { return true; }, queryTerrainElevation() { terrainQueries++; return elevation; } }
};
vm.createContext(terrainScope);
const groundAt = vm.runInContext(between('    const groundAt =', '    const flightAltitude =') + ';groundAt;', terrainScope);
assert.ok(Number.isNaN(groundAt(0)), 'Unavailable terrain is not sea level');
assert.ok(Number.isNaN(terrainScope.terrainElevations[0]), 'Unavailable elevation is not cached as zero');
elevation = 0; assert.equal(groundAt(0), 0, 'Real sea-level elevation remains valid');
const queriesBefore = terrainQueries; groundAt(0); assert.equal(terrainQueries, queriesBefore, 'Valid elevation is cached');
console.log('PASS null terrain remains unavailable while real sea-level elevation caches correctly');

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
