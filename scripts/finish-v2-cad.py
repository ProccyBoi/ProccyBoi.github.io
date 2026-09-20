"""Verify CAD captures, write transparent WebP posters, then remove capture PNGs."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep-png", action="store_true", help="Retain the verified PNG captures for inspection.")
    arguments = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "assets" / "images" / "v2"

    for model in ("framework", "tramtrace"):
        capture = output / f"{model}-cad.png"
        destination = output / f"{model}-cad.webp"
        temporary = output / f"{model}-cad.rendering.webp"
        with Image.open(capture) as source:
            source.load()
            if source.size != (1600, 1200) or source.mode != "RGBA":
                raise ValueError(f"Unexpected capture size or mode: {capture.name}")
            if source.getextrema()[3] != (0, 255):
                raise ValueError(f"Capture must contain transparent background and opaque geometry: {capture.name}")
            source.save(temporary, "WEBP", quality=88, method=6, exact=True)

        with Image.open(temporary) as encoded:
            encoded.load()
            if encoded.size != (1600, 1200) or encoded.mode != "RGBA" or encoded.getextrema()[3] != (0, 255):
                raise ValueError(f"Encoded poster failed verification: {temporary.name}")
        temporary.replace(destination)
        if not arguments.keep_png:
            # Delete only this known generated capture, after its WebP is verified.
            capture.unlink()
        print(f"{destination.name}: {destination.stat().st_size:,} bytes; 1600 x 1200; alpha verified")


if __name__ == "__main__":
    main()
