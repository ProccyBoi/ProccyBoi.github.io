"""Encode transparent browser CAD captures as web assets."""
from pathlib import Path
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / '.codex-temp/hardware-posters'
output = ROOT / 'assets/images/v2/hardware'
output.mkdir(parents=True, exist_ok=True)
paths = [source / (slug + '.png') for slug in sys.argv[1:]] or sorted(source.glob('*.png'))
for path in paths:
    image = Image.open(path).convert('RGBA')
    if image.size != (1600, 1200):
        raise ValueError(f'Unexpected capture size: {path}: {image.size}')
    target = output / (path.stem + '.webp')
    image.save(target, 'WEBP', quality=92, method=6)
    with Image.open(target) as check:
        assert check.size == (1600, 1200) and check.mode == 'RGBA'
    print(target.relative_to(ROOT), target.stat().st_size)
