"""Build top-wing Solarfilm maps from the supplied, unmodified logo images.

The Arc upload has a baked checkerboard. Its shield is isolated and neutral
checker pixels inside it are made white. Skylabs is cropped to the artwork;
the UNSW crest retains its original transparency. All three follow film UVs.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/fixtures/skylabs-livery'
DEST = ROOT / 'assets/models/aircraft/skylabs-competition/livery'
DEST.mkdir(parents=True, exist_ok=True)

sky = Image.open(SOURCE / 'skylabs.png').convert('RGBA').crop((43, 152, 414, 295))
unsw = Image.open(SOURCE / 'unsw.png').convert('RGBA')
original = Image.open(SOURCE / 'arc.png').convert('RGB')
arc = Image.new('RGBA', original.size, (0, 0, 0, 0))
mask = Image.new('L', original.size, 0)
ImageDraw.Draw(mask).polygon([(9, 19), (383, 19), (383, 399), (196, 484), (9, 399)], fill=255)
pixels, source, inside = arc.load(), original.load(), mask.load()
for y in range(arc.height):
    for x in range(arc.width):
        if inside[x, y]:
            r, g, b = source[x, y]
            pixels[x, y] = (255, 255, 255, 255) if max(r, g, b) - min(r, g, b) < 12 else (r, g, b, 255)
arc = arc.crop((9, 19, 384, 485))

# The canvas aspect approximates the physical wing chord and span. U is
# chordwise and V is spanwise; Pillow's image Y runs opposite to UV V.
W, H = 512, 1536
def place(canvas, image, centre, maxsize):
    image = image.copy()
    image.thumbnail(maxsize, Image.Resampling.LANCZOS)
    image = image.rotate(90, expand=True, resample=Image.Resampling.BICUBIC)
    # The upper-surface UV basis is reflected relative to its outward normal.
    image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    x = round(centre[0] * W - image.width / 2)
    y = round((1 - centre[1]) * H - image.height / 2)
    canvas.alpha_composite(image, (x, y))

for side in ('left', 'right'):
    for colour, base in [('white', (243, 241, 233, 255)), ('blue', (24, 88, 200, 255))]:
        canvas = Image.new('RGBA', (W, H), base)
        if side == 'left':
            place(canvas, sky, (.35, .49), (420, 155))
        else:
            place(canvas, unsw, (.35, .30), (165, 172))
            place(canvas, arc, (.35, .70), (150, 187))
        canvas.convert('RGB').save(DEST / f'{side}-{colour}.png', optimize=True)

# Trainer wings have separate inner and outer sheets. Their UV V axes run
# root-to-tip on each side, so the left artwork is reflected along that axis.
TRAINER = ROOT / 'assets/models/aircraft/skylabs-trainer/livery'
TRAINER.mkdir(parents=True, exist_ok=True)
for name, image, size, left in [
    ('left-outer', sky, (350, 135), True),
    ('right-inner', unsw, (180, 188), False),
    ('right-outer', arc, (170, 212), False),
]:
    canvas = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
    logo = image.copy()
    logo.thumbnail(size, Image.Resampling.LANCZOS)
    logo = logo.rotate(90, expand=True, resample=Image.Resampling.BICUBIC)
    if left:
        logo = logo.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    canvas.alpha_composite(logo, ((512 - logo.width) // 2, (512 - logo.height) // 2))
    canvas.convert('RGB').save(TRAINER / f'{name}.png', optimize=True)
