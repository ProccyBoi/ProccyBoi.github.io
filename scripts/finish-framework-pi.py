"""Convert the rendered Pi card to transparent WebP and remove its intermediate PNG."""
from pathlib import Path
from PIL import Image

directory = Path(__file__).resolve().parents[1] / "assets/images/v2"
source = directory / "framework-pi-cad.png"
target = directory / "framework-pi-cad.webp"
with Image.open(source) as image:
    assert image.size == (1600, 1200), "Unexpected render dimensions"
    assert image.mode == "RGBA", "The render must preserve transparency"
    image.save(target, "WEBP", quality=90, method=6)
with Image.open(target) as image:
    image.load()
    assert image.size == (1600, 1200) and image.mode == "RGBA"
    assert image.getchannel("A").getextrema() == (0, 255)
source.unlink()
print(f"Verified {target.name}: {target.stat().st_size:,} bytes, transparent 1600 × 1200")
