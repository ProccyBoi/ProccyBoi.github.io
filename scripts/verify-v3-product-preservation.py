#!/usr/bin/env python3
"""Verify the frozen v2/root boundary and faithful v3 copy without a browser.

Defaults to the restored-v2 commit approved for this redesign. Uses Git blob
hashes of actual working-tree bytes, including unstaged edits. A Git diff alone
is insufficient because new untracked production payloads must be checked too.
Run --baseline-only while the independently authored v3 home is being built.
"""
from __future__ import annotations

from argparse import ArgumentParser
from collections import Counter
from hashlib import sha1
from pathlib import Path
import os
import runpy
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASELINE = "0730dbf780288d156b6eb894ab89b1381b286b83"
NON_PRODUCTION = {"scripts", "docs", "output", ".github", ".codex-temp", "tmp"}
DOCUMENTATION = {"README.md", "DESIGN.md"}
BOOK_SITEMAP_ENTRY = b"  <url><loc>https://proccyboi.github.io/v3/book/</loc></url>\n"
BOOK_SITEMAP_ANCHOR = b"  <url><loc>https://proccyboi.github.io/v3/about/</loc></url>\n"


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout


def production(relative):
    path = Path(relative)
    return path.parts[0] not in NON_PRODUCTION and relative not in DOCUMENTATION


def allowed_new_production(relative):
    path = Path(relative)
    light_posters = {f"assets/images/v3-product/skylabs-{pose}{size}.webp" for pose in ("approach", "stopped") for size in ("", "-mobile")}
    return (path.parts[0] == "v3" and path.suffix == ".html") or (path.parent == Path("assets") and path.name.startswith("v3-product") and path.suffix in {".js", ".css"}) or relative in light_posters


def blob_hash(data):
    return sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def baseline_errors(baseline):
    errors, stats = [], Counter()
    tree = {}
    for record in git("ls-tree", "-r", "-z", "--full-tree", baseline).split(b"\0"):
        if not record:
            continue
        metadata, raw_path = record.split(b"\t", 1)
        mode, kind, digest = metadata.decode().split()
        tree[os.fsdecode(raw_path)] = (mode, kind, digest)
    for relative, (mode, kind, digest) in tree.items():
        if not production(relative) or relative.startswith("v3/"):
            continue
        path = ROOT / relative
        try:
            if kind != "blob":
                errors.append(f"{relative}: unsupported frozen Git object type {kind}")
                continue
            data = os.fsencode(os.readlink(path)) if mode == "120000" else path.read_bytes()
        except OSError as exception:
            errors.append(f"{relative}: frozen baseline file missing/unreadable: {exception}")
            continue
        if relative == "sitemap.xml":
            original = git("show", f"{baseline}:sitemap.xml")
            expected = original.replace(BOOK_SITEMAP_ANCHOR, BOOK_SITEMAP_ANCHOR + BOOK_SITEMAP_ENTRY)
            if original.count(BOOK_SITEMAP_ANCHOR) != 1 or data != expected:
                errors.append("sitemap.xml: only the approved /v3/book/ insertion may differ from baseline")
            stats["sitemap additions"] += 1
            continue
        if blob_hash(data) != digest:
            errors.append(f"{relative}: bytes differ from frozen baseline {baseline[:7]}")
        stats["frozen files"] += 1
        stats["frozen bytes"] += len(data)
        if relative.startswith("v2/"):
            stats["v2 files"] += 1
        if relative.startswith("assets/"):
            stats["shared asset files"] += 1
    working_paths = {os.fsdecode(path) for path in git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0") if path}
    for relative in sorted(working_paths - tree.keys()):
        if production(relative):
            if not allowed_new_production(relative):
                errors.append(f"{relative}: new production file is outside v3 HTML or v3-product CSS/JS")
            else:
                stats["new v3 production files"] += 1
    return errors, stats


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default=BASELINE, help="Explicit restored-v2 baseline Git commit")
    parser.add_argument("--baseline-only", action="store_true", help="Check the frozen production boundary without validating unfinished v3 HTML")
    args = parser.parse_args()
    try:
        resolved = git("rev-parse", "--verify", f"{args.baseline}^{{commit}}").decode().strip()
        errors, stats = baseline_errors(resolved)
        copy_stats = Counter()
        if not args.baseline_only:
            audit = runpy.run_path(str(ROOT / "scripts/audit-v3.py"))
            copy_errors, copy_stats = audit["check_copy_preservation"]()
            errors.extend(copy_errors)
    except (OSError, ValueError, subprocess.CalledProcessError) as exception:
        print(f"V3 preservation verification could not run: {exception}")
        return 1
    if errors:
        print("V3 source preservation failed:")
        print("\n".join(dict.fromkeys(errors)))
        return 1
    print(f'Frozen boundary passed against {resolved[:7]}: {stats["frozen files"]} files / {stats["frozen bytes"]:,} bytes, including {stats["v2 files"]} v2 files and {stats["shared asset files"]} shared assets.')
    print("Only approved production changes: v3 HTML, v3-product CSS/JS, four source-rendered light aircraft posters, and the one Book sitemap entry.")
    if args.baseline_only:
        print("Baseline-only mode: the unfinished v3 copy was not checked.")
    else:
        print(f'Copy contracts passed: {copy_stats["routes"]} route counterparts, {copy_stats["interiors"]} preserved interiors, {copy_stats["catalog projects"]} catalog projects; original payloads, viewer hooks, script execution slots, engineering notes and inline tools retained.')
    if not args.baseline_only:
        print("Approved scene-controller clone internals are checked separately by verify-v3-product-controls.cjs; whole-clone byte identity is not claimed.")
    print("Static source checks only. This does not establish browser behavior, visual quality or performance.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
