from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin,urlparse,unquote
import json,subprocess,hashlib
ROOT=Path(__file__).resolve().parents[2]; V4=ROOT/'v4'
class Page(HTMLParser):
 def __init__(self,text):super().__init__();self.tags=[];self.feed(text)
 def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs)))
problems=[];pages=list(V4.rglob('index.html'));cache={}
for p in pages:
 rel=p.relative_to(ROOT);raw=p.read_text();parsed=Page(raw);cache[p]=parsed
 ids=[a['id'] for _,a in parsed.tags if a.get('id')]
 if len(ids)!=len(set(ids)):problems.append(f'{rel}: duplicate IDs')
 if sum(t=='h1' for t,a in parsed.tags)!=1:problems.append(f'{rel}: expected one h1')
 if 'id="main"' not in raw or 'class="skip"' not in raw:problems.append(f'{rel}: skip link missing')
 if 'Anduril' in raw:problems.append(f'{rel}: reference branding leaked into site')
 base='https://proccyboi.github.io/'+str(rel).replace('index.html','')
 for tag,attrs in parsed.tags:
  attr='href' if tag in ['a','link'] else 'src' if tag in ['img','script'] else None
  if not attr or not attrs.get(attr):continue
  u=urlparse(urljoin(base,attrs[attr]))
  if u.scheme not in ['http','https'] or u.netloc!='proccyboi.github.io':continue
  target=ROOT/unquote(u.path.lstrip('/'))
  if target.is_dir():target/= 'index.html'
  if not target.is_file():problems.append(f'{rel}: missing {attrs[attr]}');continue
  if tag=='a' and u.fragment and target.suffix=='.html':
   pt=cache.setdefault(target,Page(target.read_text()))
   if not any(a.get('id')==u.fragment for _,a in pt.tags):problems.append(f'{rel}: missing fragment {attrs[attr]}')
  if tag=='img' and not all(attrs.get(k) for k in ['alt','width','height']):problems.append(f'{rel}: image metadata missing')
assert len(pages)==21,len(pages)
data=json.loads((V4/'content/projects.json').read_text());assert len(data)==18
assert len([a for t,a in Page((V4/'projects/index.html').read_text()).tags if 'data-project' in a])==16
for f,max_bytes in [('assets/site.js',12000),('assets/site.css',40000)]:assert (V4/f).stat().st_size<max_bytes
assert 'requestAnimationFrame' in (V4/'assets/site.js').read_text()
subprocess.run(['python3',str(V4/'build.py'),'--check'],check=True)
# No modifications to root, v2, shared assets, old scripts or v3.
changes=subprocess.check_output(['git','diff','e21ffc8a18c27b84abcc40fb6a3efe9132ba8391','--name-only'],cwd=ROOT,text=True).splitlines()
assert all(p.startswith('v4/') or p=='.github/workflows/verify-v4-cinematic.yml' for p in changes),changes
if problems:raise SystemExit('\n'.join(problems))
print(f'PASS: {len(pages)} pages, all local links/assets/fragments, project inventory, source budgets and isolation.')
