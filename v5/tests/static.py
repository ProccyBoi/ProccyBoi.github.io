"""Validate published v5 navigation, assets, metadata and generated records."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import re, subprocess, sys
ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.links=[]; self.ids=[]; self.images=[]; self.h1=0; self.canonical=[]; self.lang=None; self.skip=False
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.append(a['id'])
        if tag=='html': self.lang=a.get('lang')
        if tag=='h1': self.h1+=1
        if tag=='img': self.images.append(a)
        if tag=='a' and a.get('href')=='#main': self.skip=True
        if tag=='link' and a.get('rel')=='canonical': self.canonical.append(a.get('href',''))
        for key in ('href','src','poster'):
            if key in a:self.links.append(a[key])
        if 'srcset' in a:
            self.links += [part.strip().split()[0] for part in a['srcset'].split(',')]
errors=[]; count=0; targets={}
for path in sorted(ROOT.rglob('*.html')):
    page=Page(path.read_text(encoding='utf-8')); count+=1
    def fail(message):errors.append(f'{path.relative_to(REPO)}: {message}')
    if page.lang!='en':fail('missing English language declaration')
    if page.h1!=1:fail(f'expected one H1, got {page.h1}')
    if not page.skip or 'main' not in page.ids:fail('missing skip target')
    if len(set(page.ids))!=len(page.ids):fail('duplicate IDs')
    expected='https://proccyboi.github.io/'+path.relative_to(REPO).as_posix().removesuffix('index.html')
    if page.canonical!=[expected]:fail(f'canonical mismatch {page.canonical}')
    for img in page.images:
        if 'alt' not in img:fail('image missing alt attribute')
        if not img.get('width') or not img.get('height'):fail('image missing reserved dimensions')
    for link in page.links:
        url=urlsplit(link)
        if url.scheme or url.netloc:continue
        dest=REPO / unquote(url.path).lstrip('/') if url.path.startswith('/') else path.parent / unquote(url.path) if url.path else path
        if dest.is_dir():dest=dest/'index.html'
        if not dest.is_file():fail(f'broken local link {link}');continue
        if url.fragment and dest.suffix=='.html':
            if dest not in targets:targets[dest]=Page(dest.read_text(encoding='utf-8')).ids
            if unquote(url.fragment) not in targets[dest]:fail(f'broken fragment {link}')
for css in ROOT.rglob('*.css'):
    for url in re.findall(r'url\([\"\']?([^\)\"\']+)',css.read_text(encoding='utf-8')):
        if url.startswith('/') and not (REPO/url.lstrip('/')).is_file():errors.append(f'{css.name}: missing {url}')
if errors:print('\n'.join(errors));sys.exit(1)
subprocess.run([sys.executable,str(ROOT/'build-pages.py'),'--check'],check=True)
print(f'V5 static audit passed: {count} pages, local assets, fragments, metadata and generated records.')
