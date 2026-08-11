import argparse
from pathlib import Path

from PIL import Image


parser = argparse.ArgumentParser(description="Create WebP copies of project JPEGs.")
parser.add_argument(
    "names",
    nargs="*",
    help="Optional JPEG filenames to convert. Converts every responsive JPEG when omitted.",
)
args = parser.parse_args()

root = Path(__file__).resolve().parents[1] / "assets" / "images" / "projects"
sources = [root / name for name in args.names] if args.names else sorted(root.glob("*.jpg"))

for source in sources:
    if not source.is_file() or source.suffix.lower() != ".jpg":
        raise SystemExit(f"Missing JPEG source: {source}")

    # Approved legacy images remain JPEG-only; their source files are already compact.
    if source.name.endswith("-web.jpg"):
        continue

    destination = source.with_suffix(".webp")
    with Image.open(source) as image:
        image.convert("RGB").save(
            destination,
            "WEBP",
            quality=74,
            method=6,
            exif=b"",
        )
    print(f"Wrote {destination}")
