from pathlib import Path

from PIL import Image


root = Path(__file__).resolve().parents[1] / "assets" / "images" / "projects"

for source in sorted(root.glob("*.jpg")):
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
