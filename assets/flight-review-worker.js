/* One import job per worker. The UI terminates this worker to cancel any stage.
 * Request:  { type: "parse", requestId, buffer, file: { name, size }, extension? }
 * A File may also be supplied instead of buffer for worker-side file reading.
 * Replies:  progress { title, detail, percent }, complete { model }, error { message }
 * Every reply echoes requestId; all model numeric buffers are transferred. */
"use strict";

importScripts("./flight-review-parser.js?v=20261019-1");

self.onmessage = async ({ data }) => {
  if (!data || data.type !== "parse") return;
  const { requestId } = data;
  const report = (progress) => self.postMessage({ type: "progress", requestId, ...progress });
  try {
    const file = data.file || {};
    if (file.size > FlightReviewParser.MAX_FILE_BYTES) throw new Error("This file is larger than the 150 MB browser limit.");
    report({ title: "Reading flight log", detail: String(file.name || "Flight log"), percent: 20 });
    const buffer = data.buffer || (typeof file.arrayBuffer === "function" ? await file.arrayBuffer() : null);
    if (!(buffer instanceof ArrayBuffer)) throw new Error("The flight log could not be read as binary data.");
    if (!buffer.byteLength) throw new Error("The selected file is empty.");
    if (buffer.byteLength > FlightReviewParser.MAX_FILE_BYTES) throw new Error("This file is larger than the 150 MB browser limit.");
    const extension = String(data.extension || file.name?.split(".").pop() || "bin").toLowerCase();
    const isBinary = extension === "bin" || FlightReviewParser.readMagic(buffer) === FlightReviewParser.MAGIC;
    if (!isBinary && ["xlsx", "xls", "csv", "tsv"].includes(extension) && !self.XLSX) {
      report({ title: "Loading spreadsheet parser", detail: "Preparing local spreadsheet import", percent: 26 });
      try {
        importScripts("./vendor/xlsx.full.min.js");
      } catch (error) {
        throw new Error("The spreadsheet parser could not be loaded. Check the connection and retry.");
      }
    }
    report({ title: "Decoding telemetry", detail: String(file.name || "Flight log"), percent: 30 });
    const model = FlightReviewParser.parseFlightBuffer(buffer, file, extension, report);
    report({ title: "Preparing review workspace", detail: `${model.count.toLocaleString()} usable samples ready.`, percent: 90 });
    const prepared = FlightReviewParser.prepareTransfer(model);
    self.postMessage({ type: "complete", requestId, model: prepared.model }, prepared.transferables);
  } catch (error) {
    self.postMessage({ type: "error", requestId, message: error?.message || "The flight log could not be parsed." });
  }
};
