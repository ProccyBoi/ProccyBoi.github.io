"""Write direct, responsive browser captures from the live Three.js Projects scene.

Start the repository's static server, then run:
  python scripts/build-v2-sonoran-posters.py http://127.0.0.1:8000
Requires Playwright (Chromium + WebGL) and Pillow. Never substitutes another scene: a missing
renderer or non-presented frame aborts the build rather than baking a fallback.
"""
import argparse
from io import BytesIO
import base64
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/images/v2"
if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base",help="Static server origin for this checkout")
    parser.add_argument("--chromium",help="Optional Chromium executable path")
    args=parser.parse_args()
    with sync_playwright() as pw:
        options={"headless":True,"args":["--use-angle=swiftshader","--enable-unsafe-swiftshader"]}
        if args.chromium: options["executable_path"]=args.chromium
        browser=pw.chromium.launch(**options)
        for mobile,w,h,dpr in [(False,1280,800,1),(True,390,770,2)]:
            page=browser.new_page(viewport={"width":w,"height":h},device_scale_factor=dpr)
            page.goto(args.base.rstrip("/")+"/v2/projects/?capture",wait_until="domcontentloaded")
            page.wait_for_function("!!window.__v3Aircraft?.scene.getObjectByName('Tucson Mountain District')",timeout=120000)
            for name,method in [("approach","seekLanding"),("stopped","seekProgress")]:
                prev=page.evaluate("Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftCompletedFrames||0)")
                page.evaluate("(method) => window.__v3Aircraft[method](0)",method)
                page.wait_for_function("""([prev,name]) => {const d=document.querySelector('[data-aircraft-hero]').dataset;
                    return +d.aircraftCompletedFrames>prev && d.aircraftWarmMask==='false' &&
                    d.aircraftGPUPending==='false' && d.aircraftPhase===(name==='approach'?'approach':'stopped') &&
                    +d.aircraftRenderedProgress===0;}""",arg=[prev,name],timeout=120000)
                encoded=page.evaluate("""() => {const {scene,renderer,camera}=window.__v3Aircraft;
                    renderer.clear(); renderer.render(scene,camera);
                    return renderer.domElement.toDataURL('image/png').split(',')[1];}""")
                image=Image.open(BytesIO(base64.b64decode(encoded))).convert("RGB")
                if mobile: image.thumbnail((585,1200),Image.Resampling.LANCZOS)
                dest=OUT/("tucson-trainer-"+name+("-mobile" if mobile else "")+".webp")
                for quality in [83,78,72,66]:
                    image.save(dest,"WEBP",quality=quality,method=6)
                    if dest.stat().st_size < (58000 if mobile else 100000): break
                else: raise ValueError(f"Poster over transfer budget: {dest}")
                print(dest.name,image.size,dest.stat().st_size)
            page.close()
        browser.close()
