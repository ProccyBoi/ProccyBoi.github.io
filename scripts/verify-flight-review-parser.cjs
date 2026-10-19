/* Dependency-free regression checks for the browser/worker parser.
 * Run: node scripts/verify-flight-review-parser.cjs
 * The frozen oracle was extracted from d15883bd3945502c412121e1d434e04588f200d0.
 * Exceptions are explicitly tested: valid geographic zero, bounded GPS, and
 * unavailable diagnostic counters. No source logs or network access required. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const XLSX = require(path.join(root, 'assets/vendor/xlsx.full.min.js'));
const parserSource = fs.readFileSync(path.join(root, 'assets/flight-review-parser.js'), 'utf8');
const baselineSource = fs.readFileSync(path.join(__dirname, 'fixtures/flight-review-parser-baseline.js'), 'utf8');
const constructors = { ArrayBuffer, DataView, Float64Array, Uint8Array, TextDecoder, TextEncoder };
const sandbox = vm.createContext({ ...constructors, XLSX, window: { XLSX } });
vm.runInContext(parserSource, sandbox, { filename: 'flight-review-parser.js' });
vm.runInContext(baselineSource, sandbox, { filename: 'flight-review-parser-baseline.js' });
const parser = sandbox.FlightReviewParser;
const baseline = sandbox.FlightReviewBaseline;
let assertions = 0;

function equalModel(actual, expected, label = 'model') {
  if (Array.isArray(expected) || ArrayBuffer.isView(expected)) {
    assert.equal(actual.length, expected.length, `${label}.length`);
    for (let i = 0; i < expected.length; i += 1) equalModel(actual[i], expected[i], `${label}[${i}]`);
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${label} keys`);
    for (const key of Object.keys(expected)) equalModel(actual[key], expected[key], `${label}.${key}`);
  } else {
    assert.ok(Object.is(actual, expected), `${label}: expected ${expected}, got ${actual}`);
  }
  assertions += 1;
}

function makeBinary(version = 3, count = 120, options = {}) {
  const recordSize = { 1: 238, 2: 250, 3: 282 }[version];
  const headerSize = options.headerSize || 48;
  const buffer = new ArrayBuffer(headerSize + recordSize * count + (options.trailing || 0));
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode('SKYLBIN1'));
  const view = new DataView(buffer);
  view.setUint16(8, version, true);
  view.setUint16(10, headerSize, true);
  view.setUint16(12, recordSize, true);
  view.setUint32(16, 1730000000, true);
  view.setUint32(20, 50, true);
  view.setUint8(32, 127);
  for (let i = 0; i < count; i += 1) {
    const base = headerSize + recordSize * i;
    const sample = options.reversed ? count - i - 1 : i;
    view.setUint32(base, 123456 + sample * 50, true);
    view.setUint32(base + 4, 1730000000 + Math.floor(sample / 20), true);
    view.setUint32(base + 8, Math.floor(sample / 60), true);
    view.setUint32(base + 12, 0, true);
    view.setInt32(base + 16, Math.round((-37.81 + sample * 0.000012) * 1e7), true);
    view.setInt32(base + 20, Math.round((144.96 + sample * 0.000015) * 1e7), true);
    view.setUint16(base + 40, 50, true);
    view.setUint16(base + 42, 20, true);
    view.setUint16(base + 44, 0, true);
    view.setUint8(base + 47, i % 11 === 0 ? 0 : 3);
    view.setUint8(base + 48, 13);
    for (let offset = 58; offset <= 230; offset += 4) view.setFloat32(base + offset, Math.sin(sample * 0.05 + offset) * 10, true);
    view.setFloat32(base + 66, 123.4 + sample * 0.2, true);
    view.setFloat32(base + 78, sample % 2 ? 179 : -179, true);
    view.setFloat32(base + 138, i % 13 ? 145.3 + sample * 0.19 : NaN, true);
    view.setFloat32(base + 142, 1.1, true);
    view.setFloat32(base + 166, 23.4, true);
  }
  if (options.rejectRecord !== undefined) view.setFloat32(headerSize + options.rejectRecord * recordSize + 74, NaN, true);
  return buffer;
}

function fileFor(buffer, name) { return { name, size: buffer.byteLength }; }
function toBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}
function fromRows(rows, extension = 'xlsx', options = {}) {
  const workbook = XLSX.utils.book_new();
  if (options.emptyFirst) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Empty');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Telemetry');
  if (extension === 'csv' || extension === 'tsv') {
    const text = XLSX.utils.sheet_to_csv(workbook.Sheets.Telemetry, { FS: extension === 'tsv' ? '\t' : ',' });
    return new TextEncoder().encode(text).buffer;
  }
  return toBuffer(XLSX.write(workbook, { type: 'buffer', bookType: extension === 'xls' ? 'biff8' : 'xlsx' }));
}
function parityBinary(version, count, options = {}) {
  const buffer = makeBinary(version, count, options);
  const file = fileFor(buffer, `test-v${version}.bin`);
  const expected = baseline.parseBinaryLog(buffer, file);
  const actual = parser.parseBinaryLog(buffer, file);
  equalModel(actual, expected, `binary-v${version}`);
  const prepared = parser.prepareTransfer(actual);
  const bytes = prepared.transferables.reduce((total, value) => total + value.byteLength, 0);
  assert.equal(bytes, actual.count * (parser.SERIES_KEYS.length + parser.DERIVED_NUMERIC_KEYS.length) * 8);
  assert.equal(new Set(prepared.transferables).size, prepared.transferables.length, 'Unique transfer buffers');
  const transferred = structuredClone(prepared.model, { transfer: Array.from(prepared.transferables) });
  assert.ok(prepared.transferables.every(buffer => buffer.byteLength === 0), 'Transfer detaches sender-owned arrays');
  assert.ok(transferred.series.time instanceof Float64Array);
  assert.equal(typeof transferred.validGps[0], 'boolean');
  equalModel(transferred, expected, `transferred-v${version}`);
  return transferred;
}
function equalError(runNew, runOld, pattern) {
  let newMessage, oldMessage;
  try { runNew(); } catch (error) { newMessage = error.message; }
  try { runOld(); } catch (error) { oldMessage = error.message; }
  assert.ok(newMessage, 'New parser must reject malformed input');
  assert.equal(newMessage, oldMessage);
  if (pattern) assert.match(newMessage, pattern);
}

async function workerHarness({ failSheetJs = false } = {}) {
  const messages = [];
  const imports = [];
  const context = vm.createContext({ ...constructors });
  context.self = context;
  context.postMessage = (message, transfer = []) => {
    const delivered = structuredClone(message, { transfer: Array.from(transfer) });
    if (transfer.length) assert.ok(transfer.every(buffer => buffer.byteLength === 0), 'Worker actually transfers every numeric buffer');
    messages.push(delivered);
  };
  context.importScripts = (...urls) => {
    for (const url of urls) {
      imports.push(url);
      if (url.includes('xlsx')) {
        if (failSheetJs) throw new Error('Simulated spreadsheet network failure');
        // Execute the actual browser distribution, as importScripts does.
        vm.runInContext(fs.readFileSync(path.join(root, 'assets/vendor/xlsx.full.min.js'), 'utf8'), context);
      } else {
        assert.match(url, /^\.\/flight-review-parser\.js\?v=20261019-1$/);
        vm.runInContext(parserSource, context);
      }
    }
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/flight-review-worker.js'), 'utf8'), context);
  return { messages, imports, run: data => context.onmessage({ data }) };
}

(async () => {
  for (const version of [1, 2, 3]) {
    parityBinary(version, 120);
    parityBinary(version, 33, { reversed: true, rejectRecord: 0, trailing: 13, headerSize: 56 });
  }
  console.log('PASS binary schemas v1/v2/v3, sorting, rejected records, trailing bytes and Float64 transfer parity');

  const rows = [
    ['Timestamp (ms)', 'GNSS Lat E7', 'GNSS Lon E7', 'Altitude M', 'roll deg', 'pitch deg', 'yaw deg', 'log dt ms', 'sd errors', 'overruns', 'imu resets', 'status', 'GNSS Alt M', 'ESC Voltage V', 'ground speed mps'],
    [200, -378100000, 1449600000, 105, 3, 1, 179, 50, 0, 3, 0, 'LOGGING', 140, 23.5, 4],
    [100, -378100500, 1449600000, 100, 1, 2, -179, 50, 0, 2, 0, 'LOGGING', 130, 23.8, 4],
    [150, 0, 0, null, null, 2, 180, 50, 0, 2, 0, '', null, 23.7, 4],
    [175, -378100200, 1449600002, 102, 2, 3, 178, 50, 0, 2, 0, 'IDLE', 138, 23.7, 4],
    [300, -378099000, 1449602000, 110, 4, 0, -178, 50, 1, 4, 1, 'LOGGING', 145, 23.3, 4],
    ['bad time', -378100500, 1449600000, 112, 1, 2, 179, 50, 1, 4, 1, 'LOGGING', 150, 23.2, 4]
  ];
  for (const extension of ['csv', 'tsv', 'xlsx', 'xls']) {
    const buffer = fromRows(rows, extension, { emptyFirst: extension === 'xlsx' });
    const file = fileFor(buffer, `parity.${extension}`);
    equalModel(parser.parseSpreadsheet(buffer, file, extension), baseline.parseSpreadsheet(buffer, file, extension), extension);
    equalModel(parser.parseFlightBuffer(buffer, file), baseline.parseSpreadsheet(buffer, file, extension), `${extension} dispatched`);
  }
  for (const timeHeader of ['time_s', 'time_us']) {
    const buffer = fromRows([[timeHeader, 'latitude', 'longitude', 'roll', 'sd_errors', 'overruns', 'imu_resets'], [0, 37, -122, 1, 0, 0, 0], [timeHeader === 'time_us' ? 1250000 : 1.25, 37.01, -121.99, 2, 0, 0, 0]], 'csv');
    const file = fileFor(buffer, `${timeHeader}.csv`);
    equalModel(parser.parseSpreadsheet(buffer, file, 'csv'), baseline.parseSpreadsheet(buffer, file, 'csv'), timeHeader);
  }
  console.log('PASS CSV/TSV/XLSX/XLS parity, alias/time mapping, empty worksheets, status filtering and missing optional samples');

  const invalidBinary = [
    [new ArrayBuffer(5), /too small/],
    [new ArrayBuffer(48), /magic/],
    [makeBinary(3, 0), /no complete/],
    [makeBinary(3, 1), /fewer than two/],
    [makeBinary(3, 2, { rejectRecord: 0 }), /fewer than two/]
  ];
  for (const [offset, value, pattern] of [[8, 9, /Unsupported/], [12, 17, /Unsupported/], [10, 47, /header size/], [10, 65535, /header size/]]) {
    const buffer = makeBinary(3, 2);
    new DataView(buffer).setUint16(offset, value, true);
    invalidBinary.push([buffer, pattern]);
  }
  for (const [buffer, pattern] of invalidBinary) {
    const file = fileFor(buffer, 'invalid.bin');
    equalError(() => parser.parseBinaryLog(buffer, file), () => baseline.parseBinaryLog(buffer, file), pattern);
  }
  for (const [data, pattern] of [
    [[['latitude', 'longitude'], [37, -122], [38, -121]], /time_s/],
    [[['time_s', 'latitude'], [0, 37], [1, 38]], /latitude and longitude/],
    [[['time_s', 'latitude', 'longitude'], [0, 37, -122]], /fewer than two/],
    [[['time_s', 'latitude', 'longitude']], /no data rows/],
    [[], /populated worksheet/]
  ]) {
    const buffer = fromRows(data);
    const file = fileFor(buffer, 'invalid.xlsx');
    equalError(() => parser.parseSpreadsheet(buffer, file, 'xlsx'), () => baseline.parseSpreadsheet(buffer, file, 'xlsx'), pattern);
  }
  assert.throws(() => parser.parseFlightBuffer(new ArrayBuffer(0), { name: 'empty.bin', size: 0 }), /empty/);
  assert.throws(() => parser.parseFlightBuffer(makeBinary(), { name: 'huge.bin', size: parser.MAX_FILE_BYTES + 1 }), /150 MB/);
  assert.throws(() => parser.parseFlightBuffer(new ArrayBuffer(80), { name: 'unsupported.json', size: 80 }), /Unsupported file type/);
  assert.throws(() => parser.parseFlightBuffer(null), /binary data/);
  const noSheetJs = vm.createContext({ ...constructors });
  vm.runInContext(parserSource, noSheetJs);
  assert.throws(() => noSheetJs.FlightReviewParser.parseSpreadsheet(new ArrayBuffer(20), { name: 'test.csv' }, 'csv'), /could not be loaded/);
  console.log('PASS malformed binary/workbook validation, empty/oversize/unsupported files and missing spreadsheet dependency');

  // Explicitly approved correctness changes; no other model parity exceptions.
  const gpsRows = [
    ['time_s', 'latitude', 'longitude', 'gnss_fix', 'sd_errors', 'overruns', 'imu_resets'],
    [0, 0, 12, 3, 0, 0, 0], [1, 12, 0, 3, 0, 0, 0], [2, 0, 0, 3, 0, 0, 0],
    [3, 91, 12, 3, 0, 0, 0], [4, 12, 181, 3, 0, 0, 0], [5, 12, 12, 0, 0, 0, 0],
    [6, -90, -180, 3, 0, 0, 0], [7, 90, 180, 3, 0, 0, 0]
  ];
  const gpsBuffer = fromRows(gpsRows, 'csv');
  const gpsFile = fileFor(gpsBuffer, 'coordinates.csv');
  const gpsNew = parser.parseSpreadsheet(gpsBuffer, gpsFile, 'csv');
  const gpsOld = baseline.parseSpreadsheet(gpsBuffer, gpsFile, 'csv');
  assert.deepEqual(Array.from(gpsNew.validGps), [true, true, true, false, false, false, true, true]);
  assert.deepEqual(Array.from(gpsOld.validGps), [false, false, false, true, true, false, true, true]);
  equalModel(gpsNew.series, gpsOld.series, 'raw explicit GPS series preserved');
  const inferredRows = [['time_s', 'latitude', 'longitude'], [0, 0, 12], [1, 12, 0], [2, 0, 0], [3, 91, 12], [4, 12, -181], [5, 12, 12]];
  const inferredBuffer = fromRows(inferredRows, 'csv');
  const inferredFile = fileFor(inferredBuffer, 'inferred.csv');
  const inferred = parser.parseSpreadsheet(inferredBuffer, inferredFile, 'csv');
  const oldInferred = baseline.parseSpreadsheet(inferredBuffer, inferredFile, 'csv');
  assert.deepEqual(Array.from(inferred.series.gnssFix), [1, 1, 0, 0, 0, 1]);
  assert.deepEqual(Array.from(oldInferred.series.gnssFix), [0, 0, 0, 1, 1, 1]);
  for (const key of ['sdErrors', 'overruns', 'imuResets']) {
    assert.ok(Number.isNaN(inferred.stats[key]), `${key} absent remains unavailable`);
    assert.equal(oldInferred.stats[key], 0, `${key} old behavior incorrectly assumed zero`);
  }
  for (const key of parser.SERIES_KEYS.filter(key => key !== 'gnssFix')) equalModel(inferred.series[key], oldInferred.series[key], `${key} raw preserved`);
  for (const missing of [null, undefined, '']) {
    assert.equal(parser.finite(missing), false, 'Missing value is not numeric zero');
    assert.equal(parser.isValidGps(missing, 12, 3), false, 'Missing coordinate cannot create a track');
    assert.equal(parser.isValidGps(12, missing, 3), false, 'Missing coordinate cannot create a track');
  }
  assert.equal(parser.finite(0), true);
  assert.equal(parser.isValidGps(0, 0, NaN), false);
  assert.equal(parser.isValidGps(0, 0, 3), true);
  assert.equal(parser.isValidGps(0, 12, NaN), true);
  assert.equal(parser.isValidGps(12, 0, NaN), true);
  assert.equal(parser.isValidGps(Infinity, 12, 3), false);
  assert.equal(parser.isValidGps(12, -Infinity, 3), false);
  console.log('PASS approved GPS bounds/equator/meridian/fix, missing values and unavailable-counter correctness exceptions');

  const worker = await workerHarness();
  await worker.run({ type: 'ignore', requestId: 'ignored' });
  assert.equal(worker.messages.length, 0);
  const workerBuffer = makeBinary(3, 80);
  const workerFile = fileFor(workerBuffer, 'magic-detection.csv');
  await worker.run({ type: 'parse', requestId: 'binary-1', buffer: workerBuffer, file: workerFile });
  const binaryDone = worker.messages.find(message => message.type === 'complete');
  assert.ok(binaryDone, 'Worker completes binary job');
  equalModel(binaryDone.model, baseline.parseBinaryLog(workerBuffer, workerFile), 'worker binary');
  assert.equal(worker.imports.filter(url => url.includes('xlsx')).length, 0, 'Binary magic bypasses spreadsheet load');
  assert.ok(worker.messages.every(message => message.requestId === 'binary-1'), 'Replies echo request ID');
  const percents = worker.messages.filter(message => message.type === 'progress').map(message => message.percent);
  assert.ok(percents.every((value, i) => !i || value >= percents[i - 1]), 'Progress remains monotonic');
  const csvBuffer = fromRows(rows, 'csv');
  const csvFile = fileFor(csvBuffer, 'worker.csv');
  await worker.run({ type: 'parse', requestId: 'csv-2', buffer: csvBuffer, file: csvFile });
  equalModel(worker.messages.find(message => message.requestId === 'csv-2' && message.type === 'complete').model, baseline.parseSpreadsheet(csvBuffer, csvFile, 'csv'), 'worker CSV');
  await worker.run({ type: 'parse', requestId: 'csv-3', buffer: csvBuffer, file: csvFile });
  assert.equal(worker.imports.filter(url => url.includes('xlsx')).length, 1, 'Spreadsheet library loads once per worker');
  const fileOnly = makeBinary(1, 4);
  await worker.run({ type: 'parse', requestId: 'file-only', file: { ...fileFor(fileOnly, 'worker-file.bin'), arrayBuffer: async () => fileOnly } });
  assert.ok(worker.messages.some(message => message.requestId === 'file-only' && message.type === 'complete'));
  await worker.run({ type: 'parse', requestId: 'empty-error', buffer: new ArrayBuffer(0), file: { name: 'empty.bin', size: 0 } });
  assert.match(worker.messages.find(message => message.requestId === 'empty-error' && message.type === 'error').message, /empty/);
  const failed = await workerHarness({ failSheetJs: true });
  await failed.run({ type: 'parse', requestId: 'dependency-error', buffer: csvBuffer, file: csvFile });
  assert.match(failed.messages.find(message => message.type === 'error').message, /spreadsheet parser could not be loaded/);
  console.log('PASS worker protocol, lazy SheetJS import, transfer detachment, File input, progress, request IDs and recoverable errors');

  const count = Number(process.env.FLIGHT_REVIEW_BENCHMARK_ROWS || 10000);
  const large = makeBinary(3, count);
  const started = performance.now();
  const largeModel = parser.parseBinaryLog(large, fileFor(large, 'benchmark.bin'));
  const parsedMs = performance.now() - started;
  const prepared = parser.prepareTransfer(largeModel);
  const bytes = prepared.transferables.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const transferStarted = performance.now();
  const received = structuredClone(prepared.model, { transfer: Array.from(prepared.transferables) });
  const transferMs = performance.now() - transferStarted;
  assert.equal(received.count, count);
  assert.ok(Number.isFinite(received.stats.trackDistance));
  console.log(JSON.stringify({ benchmark: 'synthetic schema v3', rows: count, parseMs: Math.round(parsedMs), transferMs: Math.round(transferMs * 100) / 100, inputBytes: large.byteLength, transferredNumericBytes: bytes, numericBytesPerSample: bytes / count }));
  console.log(`PASS flight review parser (${assertions.toLocaleString()} exact comparisons)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
