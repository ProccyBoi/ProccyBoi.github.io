#!/usr/bin/env python3
"""Reproduce or verify the byte-identical v2 gzip transport candidate.

Verification uses only Python's standard library:
    python3 scripts/recompress-v2-packs.py --verify

Writing requires the pinned build-only encoder, installed separately:
    python3 -m venv /tmp/v2-zopfli
    /tmp/v2-zopfli/bin/pip install --index-url https://pypi.org/simple zopfli==0.4.3
    /tmp/v2-zopfli/bin/python scripts/recompress-v2-packs.py --write

Run after the original pack builders. The encoding report deliberately pins
the original source payloads; changed CAD needs a new explicit parity review
and encoding report. This script never updates source provenance or formats.
"""

import argparse
import copy
import gzip
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import sys
import zlib


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/v2-transport-encoding.json"
PACKS = (
    ("hero", "pi"), ("hero", "telemetry"), ("hero", "tramtrace"),
    ("selected", "dual"), ("selected", "esp32"),
    ("selected", "logic"), ("selected", "metro"),
)
ENCODER = {
    "package": "zopfli",
    "version": "0.4.3",
    "format": "gzip",
    "options": {
        "numiterations": 5,
        "blocksplitting": 1,
        "blocksplittinglast": 0,
        "blocksplittingmax": 15,
    },
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def restore_container(transport):
    """Undo existing V2HIDX1 index byte lanes, without changing other bytes."""
    require(len(transport) >= 32 and transport[:8] == b"V2HIDX1\0",
            "Invalid V2HIDX1 signature")
    require(int.from_bytes(transport[8:12], "little") == len(transport) - 16,
            "Invalid V2HIDX1 length")
    original = transport[16:]
    require(original[:8] == b"V2HERO1\0", "Invalid wrapped V2HERO1 signature")
    header_size = int.from_bytes(original[8:12], "little")
    data_start = int.from_bytes(original[12:16], "little")
    require(data_start % 4 == 0 and 16 <= data_start <= len(original)
            and header_size <= data_start - 16, "Invalid V2HERO1 header range")
    header = json.loads(original[16:16 + header_size])
    require(header["version"] == 1, "Unsupported V2HERO1 version")
    restored = bytearray(original)
    for geometry in header["geometries"]:
        index = geometry["index"]
        width = {"Uint16Array": 2, "Uint32Array": 4}.get(index["arrayType"])
        require(width is not None, "Unsupported index component width")
        start = data_start + index["byteOffset"]
        length = index["byteLength"]
        require(length >= 0 and length % width == 0 and start >= data_start
                and start + length <= len(original), "Invalid index byte range")
        count = length // width
        # Read every lane from the immutable input, like the runtime decoder.
        for lane in range(width):
            restored[start + lane:start + length:width] = original[
                start + lane * count:start + (lane + 1) * count]
    return bytes(restored)


def check_payload(compressed, record, model):
    transport = gzip.decompress(compressed)
    expected = record["transport"]
    require(len(transport) == expected["bytes"]
            and sha256(transport) == expected["sha256"],
            record["path"] + ": gzip-inflated transport differs from source")
    container = restore_container(transport)
    expected = record["container"]
    require(len(container) == expected["bytes"] == model["bytes"]
            and sha256(container) == expected["sha256"] == model["sha256"],
            record["path"] + ": restored container differs from source/manifest")
    if "transportBytes" in model:
        require(len(transport) == model["transportBytes"], "Manifest transport size differs")
    return transport


def load_state():
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    require(report["format"] == 1 and report["encoder"] == ENCODER,
            "Encoding report does not match the pinned encoder contract")
    expected_paths = {f"assets/models/{group}/{name}.idx.bin.gz" for group, name in PACKS}
    records = {item["path"]: item for item in report["assets"]}
    require(len(report["assets"]) == len(PACKS) and set(records) == expected_paths,
            "Encoding report must describe exactly the seven authorized packs")
    manifests = {}
    for group in ("hero", "selected"):
        path = ROOT / f"assets/models/{group}/manifest.json"
        original = path.read_bytes()
        value = json.loads(original)
        for key, preserved in report["baselineManifests"][group]["preservedSourceFields"].items():
            require(value.get(key) == preserved, f"{group}: original source field changed: {key}")
        manifests[group] = {"path": path, "original": original, "value": value}
    for group, name in PACKS:
        record = records[f"assets/models/{group}/{name}.idx.bin.gz"]
        model = manifests[group]["value"]["models"][name]
        preserved = {k: v for k, v in model.items() if k not in ("gzipBytes", "compressedSha256")}
        require(preserved == record["preservedModel"], f"{group}/{name}: model provenance changed")
        require(model["compressedUrl"] == "/" + record["path"], "Compressed URL changed")
        require(("compressedSha256" in model) == (group == "selected"),
                "Preserve the original compressed-hash field contract")
    for item in report["compatibilityArtifacts"]:
        path = ROOT / item["path"]
        require(path.resolve().is_relative_to(ROOT), "Compatibility path escapes repository")
        data = path.read_bytes()
        if "decodedSha256" in item:
            # Original builders can vary the legacy gzip OS header by host.
            # Retain its baseline gzip SHA in the report, but verify payload
            # identity and unchanged size instead of requiring that OS byte.
            decoded = gzip.decompress(data)
            require(len(data) == item["bytes"] and len(decoded) == item["decodedBytes"]
                    and sha256(decoded) == item["decodedSha256"],
                    item["path"] + ": compatibility artifact changed")
        else:
            require(len(data) == item["bytes"] and sha256(data) == item["sha256"],
                    item["path"] + ": compatibility artifact changed")
    return report, records, manifests


def patch_manifest(original, updates):
    """Replace only existing gzip metadata tokens; preserve all other text."""
    text = original.decode("utf-8")
    expected = copy.deepcopy(json.loads(text))
    for name, fields in updates.items():
        pattern = re.compile(r'(^    "' + re.escape(name) + r'": \{\n)(.*?)(^    \},?\n)',
                             re.MULTILINE | re.DOTALL)
        matches = list(pattern.finditer(text))
        require(len(matches) == 1, "Cannot locate unique manifest model: " + name)
        match = matches[0]
        body = match.group(2)
        for field, value in fields.items():
            line = re.compile(r'(^      "' + field + r'": )([^\n,]+)(,?\n)', re.MULTILINE)
            body, count = line.subn(lambda m: m.group(1) + json.dumps(value) + m.group(3), body)
            require(count == 1, "Cannot locate unique existing field: " + name + "/" + field)
            expected["models"][name][field] = value
        replacement = match.group(1) + body + match.group(3)
        text = text[:match.start()] + replacement + text[match.end():]
    require(json.loads(text) == expected, "Unexpected manifest change")
    return text.encode("utf-8")


def verify():
    report, records, manifests = load_state()
    total = 0
    for group, name in PACKS:
        record = records[f"assets/models/{group}/{name}.idx.bin.gz"]
        model = manifests[group]["value"]["models"][name]
        data = (ROOT / record["path"]).read_bytes()
        check_payload(data, record, model)
        expected = record["encoded"]
        require(len(data) == expected["gzipBytes"] == model["gzipBytes"],
                record["path"] + ": encoded/manifest byte count mismatch")
        require(sha256(data) == expected["sha256"], record["path"] + ": encoded SHA mismatch")
        if "compressedSha256" in model:
            require(model["compressedSha256"] == expected["sha256"], "Manifest gzip SHA mismatch")
        total += len(data)
    baseline = sum(item["baseline"]["gzipBytes"] for item in report["assets"])
    print(f"PASS: {len(PACKS)} exact transports and restored containers; "
          f"{total} gzip bytes; {baseline - total} fewer than recorded baseline; "
          "original source provenance and compatibility artifacts retained.")


def write():
    # Import only here: --verify must work without a third-party dependency.
    try:
        version = importlib.metadata.version("zopfli")
    except importlib.metadata.PackageNotFoundError as error:
        raise ValueError("--write requires build-only zopfli==0.4.3; see this script's header") from error
    require(version == ENCODER["version"], "--write requires exactly zopfli==0.4.3")
    import zopfli.gzip

    _, records, manifests = load_state()
    staged = {}
    inputs = {}
    updates = {"hero": {}, "selected": {}}
    for group, name in PACKS:
        record = records[f"assets/models/{group}/{name}.idx.bin.gz"]
        model = manifests[group]["value"]["models"][name]
        path = ROOT / record["path"]
        original = path.read_bytes()
        inputs[path] = original
        transport = check_payload(original, record, model)
        encoded = zopfli.gzip.compress(transport, **ENCODER["options"])
        expected = record["encoded"]
        require(len(encoded) == expected["gzipBytes"] and sha256(encoded) == expected["sha256"],
                record["path"] + ": encoder output differs from the reviewed candidate")
        check_payload(encoded, record, model)
        staged[path] = encoded
        fields = {"gzipBytes": len(encoded)}
        if "compressedSha256" in model:
            fields["compressedSha256"] = expected["sha256"]
        updates[group][name] = fields
    for group, manifest in manifests.items():
        inputs[manifest["path"]] = manifest["original"]
        staged[manifest["path"]] = patch_manifest(manifest["original"], updates[group])
    # Validate every candidate before any write, and never overwrite concurrent edits.
    for path, original in inputs.items():
        require(path.read_bytes() == original, str(path.relative_to(ROOT)) + ": changed during encoding; retry")
    changed = 0
    for path, data in staged.items():
        if inputs[path] != data:
            path.write_bytes(data)
            changed += 1
    verify()
    print(f"Wrote {changed} changed files; all other files and the encoding report were untouched.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--verify", action="store_true", help="Standard-library-only parity and metadata verification")
    mode.add_argument("--write", action="store_true", help="Reproduce all seven gzip files with the pinned encoder")
    args = parser.parse_args()
    try:
        write() if args.write else verify()
    except (ValueError, KeyError, TypeError, OSError, EOFError, zlib.error) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
