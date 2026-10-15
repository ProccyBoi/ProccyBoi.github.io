#!/usr/bin/env python3
"""Build the real Kiku display renderer as a freestanding WebAssembly module.

Requires LLVM clang and wasm-ld. The checked-in vendor snapshot is the default;
--refresh-from /path/to/Walkman-.../Firmware explicitly refreshes owned sources.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[1]
VENDOR = HERE / "vendor"


def refresh(firmware):
    firmware = firmware.resolve()
    roots = [firmware / p for p in ("UI/Inc", "App/Inc", "Drivers/Inc", "Audio/Inc")]
    queue = [firmware / p for p in ("UI/Src/ui_renderer.c", "UI/Inc/ui_renderer.h",
             "App/Inc/ui_state.h", "App/Inc/ui_theme.h", "App/Inc/fm_state.h", "App/Src/fm_state.c")]
    visited = set()
    records = []
    VENDOR.mkdir(parents=True, exist_ok=True)
    while queue:
        source = queue.pop(0)
        if source.name in visited:
            continue
        visited.add(source.name)
        data = source.read_bytes()
        (VENDOR / source.name).write_bytes(data)
        records.append({"file": source.name, "firmware_path": source.relative_to(firmware).as_posix(),
                        "sha256": hashlib.sha256(data).hexdigest()})
        for include in re.findall(r'^#include "([^"]+)"', data.decode("utf-8"), re.M):
            match = next((root / include for root in roots if (root / include).is_file()), None)
            if match is None:
                raise SystemExit(f"Missing owned firmware header: {include}")
            queue.append(match)
    manifest = {"description": "Unmodified Kiku firmware renderer and its owned header dependencies.",
                "snapshot_date": "2026-10-15", "sources": sorted(records, key=lambda r: r["file"])}
    (HERE / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-from", type=Path)
    parser.add_argument("--clang", default=os.environ.get("CLANG"))
    args = parser.parse_args()
    if args.refresh_from:
        refresh(args.refresh_from)
    compiler = args.clang or shutil.which("clang")
    if not compiler and Path("C:/Program Files/LLVM/bin/clang.exe").is_file():
        compiler = "C:/Program Files/LLVM/bin/clang.exe"
    if not compiler:
        raise SystemExit("Install LLVM with clang and wasm-ld, or pass --clang.")
    for item in json.loads((HERE / "provenance.json").read_text())["sources"]:
        if hashlib.sha256((VENDOR / item["file"]).read_bytes()).hexdigest() != item["sha256"]:
            raise SystemExit(f"Vendor snapshot changed: {item['file']}")
    output = SITE / "assets/kiku/firmware-ui.wasm"
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [compiler, "--target=wasm32", "-std=c11", "-Oz", "-ffreestanding", "-fno-builtin",
               "-nostdlib", "-Wall", "-Wextra", "-Werror", f"-I{HERE / 'shim'}", f"-I{VENDOR}",
               str(VENDOR / "ui_renderer.c"), str(VENDOR / "fm_state.c"),
               str(HERE / "libc.c"), str(HERE / "bridge.c"), "-Wl,--no-entry", "-Wl,--export-memory",
               "-Wl,--initial-memory=524288", "-Wl,--max-memory=1048576", "-Wl,-z,stack-size=65536",
               "-Wl,--strip-all", "-o", str(output)]
    subprocess.run(command, check=True)
    print(f"Built {output.relative_to(SITE)} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
