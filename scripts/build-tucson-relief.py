"""Build the static Projects terrain, no runtime tile access. Requires Pillow.
Run from repo root: python scripts/build-tucson-relief.py [cache-directory]
Source/coordinate details: assets/models/tucson-mountains/README.md.
"""
from functools import lru_cache
from pathlib import Path
from urllib.request import urlretrieve
from PIL import Image
import math as m
import struct
import numpy as np
import sys
import tempfile

Z, SIZE = 11, 256
WORLD = SIZE * 2**Z
LAT, LON = map(m.radians, (32.217, -111.153))
BEARING = m.radians(67)
CACHE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.gettempdir()) / 'tucson-terrarium'
OUTPUT = Path(__file__).resolve().parents[1] / 'assets/models/tucson-mountains/relief.bin'
CACHE.mkdir(exist_ok=True, parents=True)

@lru_cache(None)
def tile(tx, ty):
    path = CACHE / f'{Z}-{tx}-{ty}.png'
    if not path.exists():
        urlretrieve(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png', path)
    with Image.open(path) as im:
        return im.convert('RGB')

def pixel(x, y):
    tx, px = divmod(x, SIZE)
    ty, py = divmod(y, SIZE)
    r, g, b = tile(tx, ty).getpixel((px, py))
    return r * 256 + g + b / 256 - 32768

def height(x, d):
    bearing = BEARING + m.atan2(x, d)
    angular = m.hypot(x, d) / 6371008.8
    sl, cl = m.sin(LAT), m.cos(LAT)
    sa, ca = m.sin(angular), m.cos(angular)
    lat = m.asin(sl * ca + cl * sa * m.cos(bearing))
    lon = LON + m.atan2(m.sin(bearing) * sa * cl, ca - sl * m.sin(lat))
    u = (lon / (2 * m.pi) + .5) * WORLD - .5
    v = (.5 - m.asinh(m.tan(lat)) / (2 * m.pi)) * WORLD - .5
    i, j = m.floor(u), m.floor(v)
    a, b = u-i, v-j
    return (1-b)*((1-a)*pixel(i,j)+a*pixel(i+1,j)) + b*((1-a)*pixel(i,j+1)+a*pixel(i+1,j+1))

if __name__ == '__main__':
    cells = [round(height(x,d)) for d in range(-3000,24601,150) for x in range(-14400,14401,150)]
    assert len(cells) == 193*185 and 0 < min(cells) <= max(cells) < 65536
    OUTPUT.parent.mkdir(exist_ok=True, parents=True)
    OUTPUT.write_bytes(struct.pack(f'<{len(cells)}H', *cells))
    print(f'{len(cells)} samples, range {min(cells)}..{max(cells)} m, origin {height(0,0):.1f} m, {tile.cache_info().currsize} tiles')


    # A local slope/illumination map is derived from the DEM, not aerial
    # imagery. The red channel follows the side light and the green channel
    # describes local ridge convexity. This retains ravines below mesh LOD.
    step = 37.5
    xs = np.arange(-14400,14401,step)
    ds = np.arange(-3000,24601,step)
    grid = np.array([[height(x,d) for x in xs] for d in ds],dtype=np.float32)
    hd,hx = np.gradient(grid,step,step)
    # Horizontal light travels from camera-right and a little behind camera.
    n = np.sqrt(1+hd**2+hx**2)
    light = np.clip((.39-hx*.98+hd*.11)/n, -1, 1)
    occlusion = np.zeros_like(grid)
    for distance in [2,4,7,11,16,24]:
        # Determine topographic shade from a higher shoulder to the right.
        displaced = np.roll(grid,(-round(distance*-.11),-distance),(0,1))
        occlusion = np.maximum(occlusion,(displaced-grid)/(distance*step))
    lambert=np.clip((light+.28)/1.08,0,1)
    shaded=lambert*(1-.63*np.clip((occlusion-.30)/.30,0,1))
    broad=(np.roll(grid,2,0)+np.roll(grid,-2,0)+np.roll(grid,2,1)+np.roll(grid,-2,1))/4
    convex=np.clip(.5+(grid-broad)/18,0,1)
    img=np.uint8(np.clip(np.stack([shaded,convex,shaded],axis=-1)*255,0,255))
    Image.fromarray(img).save(OUTPUT.with_name('surface.webp'),'WEBP',quality=84,method=6)
    print('Terrain material map:',xs.size,'×',ds.size,OUTPUT.with_name('surface.webp').stat().st_size,'bytes')
