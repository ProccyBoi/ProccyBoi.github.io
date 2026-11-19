"""Build/check lossless WebP transports for the ten existing Skylabs decals.

Build: python scripts/build-skylabs-livery-transport.py --build
Check: python scripts/build-skylabs-livery-transport.py
Requires Pillow with libwebp support. The source PNGs are never changed.
"""
from argparse import ArgumentParser
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
AIRCRAFT = ROOT / 'assets/models/aircraft'
ATLASES = {
    'skylabs-competition': ('left-blue', 'left-white', 'right-blue', 'right-white'),
    'skylabs-trainer': ('left-inner', 'left-outer', 'right-inner', 'right-outer', 'side-negative', 'side-positive'),
}


def convert(aircraft, name, *, build):
    source = AIRCRAFT / aircraft / 'livery' / (name + '.png')
    target = source.with_suffix('.webp')
    png = source.read_bytes()
    with Image.open(BytesIO(png)) as original:
        # All current atlases are plain opaque RGB. Fail on new color
        # metadata (ICC, gamma, sRGB, chromaticity, etc.) or alpha instead
        # of silently changing a future decal's browser appearance.
        if original.format != 'PNG' or original.mode != 'RGB' or original.info:
            raise ValueError(f'{source.name}: expected profile-free, metadata-free opaque RGB PNG')
        expected = original.tobytes()
        dimensions = original.size
        if build:
            encoded = BytesIO()
            original.save(encoded, 'WEBP', lossless=True, method=6, exact=True)
            webp = encoded.getvalue()
        else:
            webp = target.read_bytes()

    with Image.open(BytesIO(webp)) as decoded:
        if decoded.format != 'WEBP' or decoded.mode != 'RGB' or decoded.size != dimensions:
            raise ValueError(f'{target.name}: WebP format, mode or dimensions differ')
        if getattr(decoded, 'n_frames', 1) != 1 or decoded.info.get('icc_profile'):
            raise ValueError(f'{target.name}: expected one frame and no embedded profile')
        if decoded.tobytes() != expected:
            raise ValueError(f'{target.name}: decoded RGB pixels differ from the source')
    if len(webp) >= len(png):
        raise ValueError(f'{target.name}: transport is not smaller than PNG')
    if build:
        target.write_bytes(webp)

    return {
        'asset': str(target.relative_to(ROOT)),
        'dimensions': dimensions,
        'source_bytes': len(png),
        'webp_bytes': len(webp),
        'saved_bytes': len(png) - len(webp),
        'source_sha256': sha256(png).hexdigest(),
        'webp_sha256': sha256(webp).hexdigest(),
        'decoded_rgb_sha256': sha256(expected).hexdigest(),
    }


def main():
    cli = ArgumentParser(description=__doc__)
    cli.add_argument('--build', action='store_true', help='write the exact WebP assets before checking')
    args = cli.parse_args()
    if not features.check('webp'):
        raise RuntimeError('Installed Pillow does not support WebP')
    groups = {}
    for aircraft, names in ATLASES.items():
        assets = [convert(aircraft, name, build=args.build) for name in names]
        groups[aircraft] = {
            field: sum(asset[field] for asset in assets)
            for field in ('source_bytes', 'webp_bytes', 'saved_bytes')
        }
        groups[aircraft]['assets'] = assets
    print(json.dumps({'libwebp': features.version('webp'), 'groups': groups}, indent=2))


if __name__ == '__main__':
    main()
