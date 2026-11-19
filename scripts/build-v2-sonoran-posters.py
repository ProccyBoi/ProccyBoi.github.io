"""Extract the trainer from its original CAD renders, without repainting logos.

Run from the repo with Pillow + NumPy. The keyed trimaps follow the published CAD
silhouettes. The propellers, gear and tail booms are separately traced because
their black pixels overlap the original background's color range.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
POSTERS = ROOT / 'assets/images'
SPECS = {
    'stopped': [
        [(218,277),(320,263),(265,245),(269,233),(302,228),(330,226),(361,231),(422,248),(457,254),(469,265),(569,297),(566,306),(465,319),(409,299),(227,315)],
        [(490,245),(535,240),(539,186),(591,186),(587,258),(634,272),(636,281),(587,284),(539,271),(490,254)],
        [[(206,235),(208,245),(210,285),(215,286),(217,281),(224,281),(229,288),(234,288),(234,293),(230,294),(229,303),(232,306),(231,310),(226,307),(222,311),(217,310),(211,306),(210,358),(207,358),(208,305),(204,301),(200,299),(201,297),(205,297),(205,284),(204,279)],
         [(467,266),(540,260),(544,266),(482,276),(467,274)],
         [(259,304),(262,304),(265,344),(272,345),(269,358),(263,361),(257,358),(254,352),(256,346),(263,345)],
         [(354,298),(360,298),(359,315),(363,319),(363,325),(359,329),(352,329),(347,326),(347,321),(349,316),(353,313)],
         [(368,297),(375,297),(394,328),(400,336),(406,333),(411,335),(415,340),(415,349),(410,355),(403,354),(397,353),(393,348),(392,339),(391,332)]],
        [(195,375),(256,350),(329,351),(400,320),(492,315),(555,302),(634,321),(617,337),(564,340),(534,333),(493,335),(432,356),(580,399),(485,429),(459,430),(351,368),(193,410)],
    ],
    'approach': [
        [(399,189),(443,185),(405,181),(406,175),(420,164),(443,166),(514,174),(570,186),(597,194),(605,199),(542,209),(506,205),(407,213),(400,208)],
        [(544,181),(572,180),(574,140),(607,141),(604,173),(603,180),(633,188),(634,198),(609,203),(582,192),(544,188)],
        [[(396,166),(398,166),(400,186),(404,186),(410,194),(408,205),(402,208),(398,205),(396,236),(393,236),(395,205),(391,203),(392,197),(394,196)],
         [(425,209),(428,209),(428,232),(429,235),(427,239),(423,238),(422,236),(423,233),(425,231)],
         [(475,204),(479,204),(474,217),(474,219),(475,221),(474,225),(472,227),(468,227),(465,224),(465,220),(467,217),(471,216)],
         [(485,204),(490,203),(500,223),(505,224),(507,228),(506,232),(504,235),(499,235),(496,232),(496,228),(497,224)],
         [(550,187),(573,186),(576,190),(570,191),(554,190)]],
        [(429,342),(477,339),(492,352),(525,351),(566,342),(593,337),(614,351),(547,359),(476,358),(435,353)],
    ],
    'stopped-mobile': [
        [(61,349),(111,335),(73,316),(72,307),(85,301),(118,301),(127,305),(170,326),(177,326),(187,333),(185,337),(237,359),(239,369),(190,380),(150,358),(67,371)],
        [(209,312),(232,308),(232,283),(263,278),(264,282),(261,317),(288,329),(287,337),(259,344),(230,331),(207,318)],
        [[(55,332),(58,332),(58,353),(61,351),(65,352),(70,358),(69,365),(64,368),(59,367),(57,365),(55,389),(53,389),(54,364),(52,357),(54,355)],
         [(184,332),(228,325),(234,326),(234,330),(186,339)],
         [(85,366),(88,366),(88,383),(90,385),(89,390),(85,392),(82,390),(81,388),(82,385),(85,382)],
         [(132,356),(135,356),(134,364),(138,368),(136,372),(130,373),(127,371),(127,367),(130,363)],
         [(143,356),(149,355),(156,372),(161,374),(163,376),(162,381),(156,384),(152,382),(150,377),(151,373)]],
        [(52,398),(118,375),(144,365),(180,368),(237,343),(261,338),(289,361),(274,372),(228,373),(199,375),(238,415),(208,429),(181,430),(137,395),(106,402),(50,410),(48,406)],
    ],
    'approach-mobile': [
        [(149,292),(182,285),(154,277),(155,269),(167,265),(183,266),(202,273),(218,278),(226,283),(261,299),(261,304),(232,312),(211,302),(154,306),(150,305)],
        [(235,270),(250,270),(252,257),(270,253),(273,255),(272,279),(286,285),(289,289),(271,293),(241,281),(235,278)],
        [[(148,282),(150,282),(150,296),(155,297),(157,301),(155,307),(152,308),(149,307),(148,319),(146,319),(146,306),(144,304),(146,298)],
         [(166,303),(168,303),(168,314),(169,316),(168,319),(165,319),(164,317),(166,313)],
         [(194,301),(197,301),(194,308),(194,311),(192,311),(191,309),(192,306)],
         [(197,303),(201,302),(207,310),(209,311),(210,314),(208,315),(206,315),(205,312)],
         [(222,282),(249,277),(252,278),(253,281),(223,287)]],
        [(177,373),(212,369),(227,377),(249,369),(265,366),(276,371),(274,380),(174,381)],
    ],
}


def build(name, airframe, tail, hardware, shadow):
    img = Image.open(POSTERS / 'v3' / f'skylabs-{name}.webp').convert('RGB')
    w, h = img.size
    grid = (305, 600) if name.endswith('mobile') else (800, 500)
    rgb = np.array(img, dtype=np.float32)

    def mask(paths):
        # 4x ensures antialiasing of fine propeller and wire detail.
        layer = Image.new('L', (w * 4, h * 4))
        paint = ImageDraw.Draw(layer)
        for path in paths:
            paint.polygon([(round(x*w*4/grid[0]), round(y*h*4/grid[1])) for x,y in path], fill=255)
        return np.array(layer.resize(img.size, Image.Resampling.LANCZOS), dtype=np.float32) / 255

    def ramp(v, low, high):
        return np.clip((v - low) / (high - low), 0, 1)

    r,g,b = rgb.transpose(2,0,1)
    # Blue and white surfaces are distinct inside their hand-registered trimaps.
    # A locally selected luminance range prevents the older sky entering the matte.
    y = .2126*r + .7152*g + .0722*b
    blue = ramp(b-r, 36, 90)
    # Restrict bright-white finishing to each polygon. The clouds in the older
    # render reach 126 in the desktop approach and sit near the right tail.
    hull_floor = 128 if name == 'approach' else 100 if name == 'stopped' else 78
    hull = mask([airframe]) * np.maximum(ramp(y, hull_floor, 183), blue)
    fin_floor = 148 if not name.endswith('mobile') else 85
    fins = mask([tail]) * np.maximum(ramp(y, fin_floor, 198), blue)
    details = mask(hardware)
    # Key the black prop/boom before combining with the gray wheel and wire shapes.
    # The latter remain CAD-colored; their compact apertures are traced separately.
    all_dark = [hardware[i] for i in (0, 4 if name.startswith('approach') else 1)]
    black = mask(all_dark)
    hardware_floor = 35 if name == 'approach' else 25
    details = np.clip(details - black, 0, 1) + black * (1-ramp(y, hardware_floor-9, hardware_floor+9))
    alpha = 1 - (1-hull)*(1-fins)*(1-details)

    # Remove blue/gray spill in the partly covered silhouette without changing
    # pixel colors in the fully opaque CAD. This especially keeps the white
    # solarfilm and its actual UNSW / Skylabs / ANSYS marks untouched.
    edge = (alpha > .025) & (alpha < .996) & (details < .025)
    backdrop = np.array([34, 45, 51], dtype=np.float32)
    yrgb = rgb.copy()
    # Residual runway cast on the black tyres/wires is not actual livery.
    dark = (details > np.maximum(hull, fins)) & (y < 102)
    yrgb[dark] = np.clip(y[dark,None] + np.array([-1,0,2]), 0, 255)
    yrgb[edge] = np.clip((rgb[edge] - (1-alpha[edge,None])*backdrop) / alpha[edge,None], 0, 255)

    # Convert the original ground umbra to translucent neutral black so it
    # takes on the color of the new ground instead of importing old scenery.
    shade = mask([shadow]) * .38 * (1-ramp(y, 19, 31))
    final_alpha = alpha + shade*(1-alpha)
    colors = yrgb * np.divide(alpha, final_alpha, out=np.zeros_like(alpha), where=final_alpha>0)[...,None]
    rgba = np.dstack((colors, final_alpha * 255)).round().astype(np.uint8)
    out = POSTERS / 'v2' / f'trainer-{name}.webp'
    mobile = name.endswith('mobile')
    plate_name = 'trainer-sonoran-field-mobile.webp' if mobile else 'trainer-sonoran-field.webp'
    plate = Image.open(POSTERS / 'v2' / plate_name).convert('RGBA')
    if plate.width * h != plate.height * w:
        raise ValueError(f'{plate_name} is not registered to {name}')
    if plate.size != img.size:
        plate = plate.resize(img.size, Image.Resampling.LANCZOS)
    # The fallback is a self-contained poster: its original single responsive
    # fetch still contains both CAD and scenery even without JS or WebGL.
    plate.alpha_composite(Image.fromarray(rgba, 'RGBA'))
    plate.convert('RGB').save(out, 'WEBP', quality=79 if mobile else 75, method=6)
    print(f'{out.relative_to(ROOT)} {out.stat().st_size:,} bytes')


if __name__ == '__main__':
    for label, spec in SPECS.items():
        build(label, *spec)
