"""Inline the unchanged homepage CSS to remove four first-paint request waits.

The CSS files remain the editable source. Run after editing them; --check is
used by deployment to prevent the inline copy from becoming stale.
"""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ('v2.css', 'v2-assembly.css', 'v2-selected-work.css', 'v2-home-controls.css')
START = '<!-- Generated homepage styles: scripts/build-v2-home-styles.py -->'
END = '<!-- End generated homepage styles -->'

def build(source):
    css = '\n'.join(f'/* Source: assets/{name} */\n' + (ROOT / 'assets' / name).read_text(encoding='utf-8').strip() for name in SOURCES)
    if '</style' in css.lower():
        raise ValueError('Unsafe style terminator in stylesheet')
    block = START + '\n<style data-v2-home-styles>\n' + css + '\n</style>\n' + END
    if START in source:
        return re.sub(re.escape(START) + r'.*?' + re.escape(END), lambda _: block, source, count=1, flags=re.S)
    for index, name in enumerate(SOURCES):
        pattern = r'<link rel="stylesheet" href="/assets/' + re.escape(name) + r'(?:\?[^"<>]*)?">'
        source, count = re.subn(pattern, lambda _: block if index == 0 else '', source, count=1)
        if count != 1:
            raise ValueError(f'Missing source stylesheet: {name}')
    return source

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args = parser.parse_args()
    path = ROOT / 'v2/index.html'; source = path.read_text(encoding='utf-8'); result = build(source)
    if args.check:
        if result != source:
            raise SystemExit('Homepage styles are stale: run python scripts/build-v2-home-styles.py')
        print('Homepage inline CSS matches all four source files exactly.')
    else:
        path.write_text(result, encoding='utf-8', newline='\n')
