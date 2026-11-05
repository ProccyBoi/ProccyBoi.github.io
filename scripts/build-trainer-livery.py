"""Build trainer-only livery from the checked-in logo sources.

The sponsor gaps on the fuselage remain blank where source artwork was not
available. Wing coordinates are expressed in metres along each half-span;
side coordinates are normalized along the physical fuselage (rear to nose).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/fixtures/skylabs-livery'
DEST = ROOT / 'assets/models/aircraft/skylabs-trainer/livery'
DEST.mkdir(parents=True, exist_ok=True)
R = Image.Resampling.LANCZOS

def load(name): return Image.open(SOURCE / name).convert('RGBA')
def fit(image, size):
    ratio = min(size[0] / image.width, size[1] / image.height)
    return image.resize((max(1, round(image.width * ratio)), max(1, round(image.height * ratio))), R)

unsw = load('unsw.png')
# Recompose the supplied crest and wordmark as the horizontal lockup.
crest = unsw.crop((145, 0, 344, 312)); word = unsw.crop((0, 323, 489, 512))
crest = fit(crest, (250, 360)); word = fit(word, (710, 280))
unsw_horizontal = Image.new('RGBA', (crest.width + word.width + 24, max(crest.height, word.height)), (255,255,255,0))
unsw_horizontal.alpha_composite(crest, (0, (unsw_horizontal.height-crest.height)//2))
unsw_horizontal.alpha_composite(word, (crest.width+24, (unsw_horizontal.height-word.height)//2))
sky = load('skylabs.png').crop((43, 152, 414, 295))
bird = load('skylabs.png').crop((43, 152, 169, 295))
original = load('arc.png').convert('RGB'); arc = Image.new('RGBA', original.size, (0,0,0,0)); mask = Image.new('L', original.size, 0)
ImageDraw.Draw(mask).polygon([(9,19),(383,19),(383,399),(196,484),(9,399)],fill=255)
pixels, source, inside = arc.load(), original.load(), mask.load()
for y in range(arc.height):
    for x in range(arc.width):
        if inside[x,y]:
            r,g,b=source[x,y]
            if max(r,g,b)-min(r,g,b)<12:
                # Arc lettering is dark; CLUBS and the supporting text remain
                # white. The source image's glyphs contain a checker pattern.
                pixels[x,y] = (28,36,33,255) if 45 <= x <= 325 and 60 <= y <= 230 else (255,255,255,255)
            else: pixels[x,y] = (r,g,b,255)
arc=arc.crop((9,19,384,485)); ansys=load('ansys.png'); flag=load('australia.png'); leap=load('leap.png')
# The monochrome Simple Icons vector supplies the authentic silhouette. Restore
# the amber A used by the brand while retaining its antialiased alpha mask.
for x in range(round(ansys.width * .29)):
    for y in range(ansys.height):
        r,g,b,a=ansys.getpixel((x,y))
        if a: ansys.putpixel((x,y),(255,183,27,a))
# This sponsor asset has an opaque white margin; trim it before sizing.
background=Image.new('RGB',leap.size,'white')
bbox=ImageChops.difference(leap.convert('RGB'),background).getbbox()
if bbox: leap=leap.crop(bbox)


# Each map covers a split fixed-wing film sheet. U starts at the leading
# edge, V runs root to tip. Draw the same physical logo into both maps at the
# join so a marking can cross that join without distortion or duplication.
half_span=.7504; seam=.3744; W=H=1024
wing_marks=[(bird,.12,.075,.075),(unsw_horizontal,.48,.145,.065),(arc,.84,.115,.100)]
for name,start,end,chord in [('left-inner',0,seam,.441089),('left-outer',seam,half_span,.305522),
                             ('right-inner',0,seam,.441089),('right-outer',seam,half_span,.305522)]:
    out=Image.new('RGBA',(W,H),'white')
    for image,centre,span_size,chord_size in wing_marks:
        # Upright artwork: top faces leading edge; writing runs root to tip.
        # Preserve physical proportions, which differ from the UV canvas ratio.
        logical=fit(image,(round(span_size*10000),round(chord_size*10000)))
        span_m=logical.width/10000; chord_m=logical.height/10000
        rotated=logical.rotate(90,expand=True)
        # Opposing span directions require opposite artwork orientation so
        # both printed faces read correctly from above.
        if name.startswith('left-'): rotated=rotated.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        rotated=rotated.resize((max(1,round(chord_m/chord*W)),max(1,round(span_m/(end-start)*H))),R)
        u = (.325 if name.endswith('inner') or centre != .48 else .440)
        x=round(u*W-rotated.width/2); y=round((1-(centre*half_span-start)/(end-start))*H-rotated.height/2)
        out.alpha_composite(rotated,(x,y))
    out.convert('RGB').save(DEST/(name+'.png'),optimize=True)

# Fuselage maps use U=(x+0.3405)/0.995, V=(y-0.1905)/0.14503.
# The port viewer sees X decreasing left-to-right; flip that side's artwork in
# texture space so it reads naturally from outside. Position remains physical.
W,H=2048,512; length=.995; height=.14503
for name,marks,mirror in [
    ('side-negative',[(unsw_horizontal,.88,.125,.070),(sky,.68,.205,.064),(ansys,.47,.145,.045),(flag,.105,.140,.080)],True),
    ('side-positive',[(sky,.74,.205,.064),(leap,.40,.100,.060),(flag,.105,.140,.080)],False),
]:
    out=Image.new('RGBA',(W,H),'white')
    for image,centre,width_m,height_m in marks:
        logical=fit(image,(round(width_m*10000),round(height_m*10000))) if image is not flag else image.resize((round(width_m*10000),round(height_m*10000)),R)
        physical_w=logical.width/10000;physical_h=logical.height/10000
        logo=logical.resize((max(1,round(physical_w/length*W)),max(1,round(physical_h/height*H))),R)
        if mirror: logo=logo.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        row_centre = .59 * H if image is flag else .5 * H
        out.alpha_composite(logo,(round(centre*W-logo.width/2),round(row_centre-logo.height/2)))
    out.convert('RGB').save(DEST/(name+'.png'),optimize=True)
