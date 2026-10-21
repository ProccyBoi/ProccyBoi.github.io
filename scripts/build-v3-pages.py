#!/usr/bin/env python3
"""Keep v3 routes as a current v2 copy with isolated experiment assets.

The old v3 was archived at backup/v3-before-webgpu-20261019. This generator
never rewrites production assets or experimental JS. It only derives HTML,
rebases internal portfolio routes, and adds the two opt-in v3 experiments.
Run without arguments to regenerate or with --check for deployment verification.
"""
from argparse import ArgumentParser
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'scripts/v3-webgpu/baseline-manifest.json').read_text())
ROUTE = re.compile(r'''(?<![\w./:-])(?P<origin>https?://proccyboi\.github\.io|//proccyboi\.github\.io)?/v2(?=[/?#"'\s<>]|$)''', re.I)
EXPERIMENTS = '''  <link rel="stylesheet" href="/v3/assets/v3-inspection.css?v=webgpu-20261019">
  <script src="/v3/assets/v3-inspection.js?v=webgpu-20261019" defer></script>
'''

AIRCRAFT_LAB = '''    <aside class="v3-renderer-lab v2-shell" id="webgpu-lab" aria-labelledby="webgpu-lab-title">
      <div><h2 id="webgpu-lab-title">WebGPU lab</h2><p>Try the aircraft’s experimental renderer. Surface shading can differ and it may be slower on your device. Standard WebGL remains the default.</p></div>
      <nav aria-label="Aircraft renderer"><a class="v2-text-link" data-webgpu-experiment href="/v3/?renderer=webgpu#skylabs-aircraft">Try WebGPU <span aria-hidden="true">↗</span></a><a class="v2-text-link" data-webgpu-standard href="/v3/?renderer=webgl#skylabs-aircraft">Use standard rendering <span aria-hidden="true">↗</span></a></nav>
    </aside>
'''

def copy_html(source, relative):
    result = ROUTE.sub(lambda m: (m['origin'] or '') + '/v3', source)
    for name in sorted(MANIFEST['clonedAssets'], key=len, reverse=True):
        result = result.replace('/assets/' + name, '/v3/assets/' + name)
    if relative == 'index.html':
        result = result.replace('</head>', EXPERIMENTS + '</head>', 1)
        aircraft = '    <section class="v3-aircraft v2-aircraft-feature"'
        assert result.count(aircraft) == 1, 'Expected one aircraft section'
        result = result.replace(aircraft, AIRCRAFT_LAB + aircraft, 1)
    return result

def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    errors = []
    sources = sorted((ROOT / 'v2').rglob('*.html'))
    expected_paths = {str(p.relative_to(ROOT / 'v2')) for p in sources}
    actual_paths = {str(p.relative_to(ROOT / 'v3')) for p in (ROOT / 'v3').rglob('*.html') if 'assets' not in p.relative_to(ROOT / 'v3').parts}
    if actual_paths - expected_paths:
        errors.append('Unexpected old v3 routes: ' + ', '.join(sorted(actual_paths - expected_paths)))
    for path in sources:
        relative = str(path.relative_to(ROOT / 'v2'))
        target = ROOT / 'v3' / relative
        expected = copy_html(path.read_text(), relative)
        if args.check:
            if not target.is_file() or target.read_text() != expected:
                errors.append('Generated route differs: v3/' + relative)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(expected)
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'{len(sources)} current v2 routes {"verified" if args.check else "copied"}; all production assets remain unchanged.')

if __name__ == '__main__':
    main()
