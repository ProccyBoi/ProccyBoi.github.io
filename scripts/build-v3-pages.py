#!/usr/bin/env python3
"""Keep v3 interior routes current without overwriting the authored homepage.

The homepage is authored separately as the Orbital Workshop. This generator
never rewrites it, production assets, or rendering code. It derives interior
HTML, rebases portfolio routes, and adds v3-only reading-room styling. Kiku uses
its accepted frozen source so subsequent v2 design work stays isolated.
Run without arguments to regenerate or with --check for deployment verification.
"""
from argparse import ArgumentParser
from pathlib import Path
import json
import re
from v3_interior_source import source as interior_source

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'scripts/v3-webgpu/baseline-manifest.json').read_text())
ROUTE = re.compile(r'''(?<![\w./:-])(?P<origin>https?://proccyboi\.github\.io|//proccyboi\.github\.io)?/v2(?=[/?#"'\s<>]|$)''', re.I)
def copy_html(source, relative):
    result = ROUTE.sub(lambda m: (m['origin'] or '') + '/v3', source)
    for name in sorted(MANIFEST['clonedAssets'], key=len, reverse=True):
        result = result.replace('/assets/' + name, '/v3/assets/' + name)
    if relative != 'index.html':
        result = result.replace('</head>', '  <link rel="stylesheet" href="/v3/assets/orbital-interiors.css">\n</head>', 1)
    return result

def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    errors = []
    # This manufacturing study is deliberately v2-only; do not clone it into v3.
    v2_only = {'projects/skylabs/reflow/index.html'}
    sources = sorted(p for p in (ROOT / 'v2').rglob('*.html')
                     if p.relative_to(ROOT / 'v2').as_posix() not in v2_only)
    expected_paths = {str(p.relative_to(ROOT / 'v2')) for p in sources}
    actual_paths = {str(p.relative_to(ROOT / 'v3')) for p in (ROOT / 'v3').rglob('*.html') if 'assets' not in p.relative_to(ROOT / 'v3').parts}
    if actual_paths - expected_paths:
        errors.append('Unexpected old v3 routes: ' + ', '.join(sorted(actual_paths - expected_paths)))
    for path in sources:
        relative = str(path.relative_to(ROOT / 'v2'))
        target = ROOT / 'v3' / relative
        if relative == 'index.html':
            if not target.is_file():
                errors.append('Authored v3 homepage is missing')
            continue
        expected = copy_html(interior_source(relative), relative)
        if args.check:
            if not target.is_file() or target.read_text(encoding='utf-8') != expected:
                errors.append('Generated route differs: v3/' + relative)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(expected, encoding='utf-8')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'{len(sources)} routes {"verified" if args.check else "maintained"} (authored home preserved); all production assets remain unchanged.')

if __name__ == '__main__':
    main()
