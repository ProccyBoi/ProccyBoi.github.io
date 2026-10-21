"""Build the independent v4 portfolio. Python standard library; no runtime framework."""
from pathlib import Path
from html import escape
import json,re,sys
ROOT=Path(__file__).resolve().parent
DATA=json.loads((ROOT/'content/projects.json').read_text())
BY={r['slug']:r for r in DATA}
BASE='https://proccyboi.github.io'
ARROW='<span aria-hidden="true">↗</span>'
OUT={}
def e(v):return escape(str(v),quote=True)
def href(slug):return '/v4/projects/'+slug+'/'
def link(url,label,cls='text-link'):return f'<a class="{cls}" href="{e(url)}">{e(label)} {ARROW}</a>'
def image(img, eager=False, sizes='100vw',cls=''):
 src=img['src']; width=img.get('width',1600); height=img.get('height',1200)
 small=src.replace('-1920.','-960.')
 srcset=f' srcset="{small} 960w, {src} 1920w" sizes="{sizes}"' if small!=src and (ROOT.parent/small.lstrip('/')).is_file() else ''
 return f'<img class="{cls}" src="{e(src)}"{srcset} width="{width}" height="{height}" alt="{e(img["alt"])}" loading="{"eager" if eager else "lazy"}" decoding="async"'+(' fetchpriority="high"' if eager else '')+'>'
def nav(active=''):
 items=[('/v4/#work','Selected work'),('/v4/projects/','Project index'),('/v4/about/','About')]
 links=''.join(f'<a href="{u}"'+(' aria-current="page"' if active==u else '')+f'>{l}</a>' for u,l in items)
 return f'''<a class="skip" href="#main">Skip to content</a><header class="header"><a class="brand" href="/v4/" aria-label="Andrew Chung home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>Andrew Chung</a><nav class="desktop-nav" aria-label="Primary">{links}</nav><div class="header-actions"><a class="cv-link" href="/assets/documents/Andrew_Chung_Public_CV.pdf">CV {ARROW}</a><a class="contact-link" href="/v4/about/#contact">Get in touch {ARROW}</a><button class="menu-toggle" type="button" aria-haspopup="dialog" aria-controls="navigation-dialog" aria-expanded="false" hidden>Menu <span aria-hidden="true">+</span></button></div></header><dialog id="navigation-dialog" class="navigation-dialog" aria-labelledby="menu-title"><div class="menu-head"><p id="menu-title">Navigation</p><button class="menu-close" type="button" aria-label="Close navigation">Close ×</button></div><nav aria-label="Mobile primary">{links}<a href="/assets/documents/Andrew_Chung_Public_CV.pdf">Download CV {ARROW}</a></nav><div class="menu-foot"><p>Electrical engineering<br>Sydney, Australia</p>{link('/v4/about/#contact','Get in touch')}</div></dialog>'''
def footer():return f'''<footer class="footer"><div class="footer-top"><a href="/v4/" class="footer-name">Andrew Chung</a><p>Electrical engineering.<br>Board to firmware. Idea to object.</p><nav aria-label="Footer">{link('/v4/projects/','Projects')}{link('/v4/about/','About')}{link('/book/','Book a time')}</nav><nav aria-label="Social">{link('https://github.com/ProccyBoi','GitHub')}{link('https://www.linkedin.com/in/22anc/','LinkedIn')}{link('/assets/documents/Andrew_Chung_Public_CV.pdf','Public CV')}</nav></div><div class="footer-bottom"><span>© 2026 Andrew Chung</span><span>Sydney, Australia</span><a href="#main">Back to top ↑</a></div></footer>'''
def page(path,title,desc,body,active='',hero=None,bodyclass=''):
 url=BASE+'/v4/'+path; og=hero['src'] if hero else '/assets/images/projects/skylabs-telemetry-macro-1920.webp'
 OUT[path+'index.html']=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>{e(title)}</title><meta name="description" content="{e(desc)}"><meta name="theme-color" content="#080a0c"><link rel="canonical" href="{url}"><meta property="og:type" content="website"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{BASE}{og}"><meta property="og:image:alt" content="{e(hero['alt'] if hero else 'Skylabs telemetry circuit board detail')}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/archivo-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/v4/assets/site.css"><script src="/v4/assets/site.js" defer></script></head><body class="{bodyclass}">{nav(active)}<main id="main" tabindex="-1">{body}</main>{footer()}<p class="sr-only" role="status" aria-live="polite" data-status></p></body></html>\n'''
def tile(slug,wide=False,photo=None):
 r=BY[slug]; img=photo or r['hero']; cad=' cad' if ('/v2/' in img['src'] or '/kiku/' in img['src']) else ''
 return f'''<a data-project-slug="{e(slug)}" class="project-tile{' wide' if wide else ''}{cad}" href="{href(slug)}"><div class="tile-image">{image(img,sizes='(max-width: 700px) 100vw, '+('96vw' if wide else '32vw'))}</div><div class="tile-copy"><div><h3>{e(r['name'])}</h3><p>{e(r['description'])}</p></div>{ARROW}</div></a>'''
macro={'src':'/assets/images/projects/skylabs-telemetry-macro-1920.webp','alt':'Close-up of the blue Skylabs telemetry board, showing its STM32 and soldered components','width':1920,'height':1280}
home=f'''<section class="hero" aria-labelledby="hero-title"><div class="hero-media" data-hero-media>{image(macro,True)}</div><div class="hero-shade"></div><div class="hero-top"><span class="eyebrow">Electrical engineering</span><span class="eyebrow">Sydney, Australia</span></div><div class="hero-main"><p class="hero-kicker">Andrew Chung / Selected portfolio</p><h1 id="hero-title">From circuit<br>to system.</h1><p class="hero-intro">Boards, firmware and the things<br>I build with them.</p><a class="hero-cta" href="#work">Explore the work <span aria-hidden="true">↓</span></a></div><div class="hero-bottom"><span class="hero-coordinate"><i aria-hidden="true"></i> Hardware. Software. Connected.</span><a href="/v4/projects/skylabs/boards/telemetry/">In frame / Skylabs telemetry {ARROW}</a></div></section>
<section class="intro section" aria-label="About Andrew"><p class="eyebrow">Andrew Chung</p><div><p class="intro-statement">Electrical engineering at UNSW.<br>Power electronics in industry.<br>Avionics at Skylabs.</p><div class="intro-bottom"><p>I design the hardware, write the firmware and build the tools that connect them.</p>{link('/v4/about/','About my work')}</div></div></section>
<section id="work" class="work section" aria-labelledby="work-title"><header class="section-head"><div><p class="eyebrow">01 / Portfolio</p><h2 id="work-title">Selected work.</h2></div>{link('/v4/projects/','All 16 projects')}</header><div class="work-grid">{tile('skylabs',True)}{tile('kiku')}{tile('framework-raspberry-pi')}{tile('tramtrace')}{tile('framework-dual-usb')}{tile('rf-test-board')}{tile('coaster')}</div></section>
<section class="systems section" id="systems" aria-labelledby="systems-title"><header class="section-head"><div><p class="eyebrow">02 / Engineering, end to end</p><h2 id="systems-title">Follow the signal.</h2></div><p>One connected system, from the<br>aircraft to the ground and back to the bench.</p></header><div class="system-feature"><a href="/v4/projects/skylabs/boards/telemetry/" class="system-photo">{image({'src':'/assets/images/projects/skylabs-telemetry-hero-1920.webp','alt':'The assembled Skylabs telemetry circuit board','width':1920,'height':1280},sizes='(max-width:800px) 100vw, 55vw')}</a><div class="system-stages"><a href="/v4/projects/skylabs/boards/telemetry/"><span>01 / Acquire</span><h3>On the aircraft {ARROW}</h3><p>Sensor acquisition, validity and a local binary flight record.</p></a><a href="/v4/projects/skylabs/boards/ground-station/"><span>02 / Connect</span><h3>On the ground {ARROW}</h3><p>A 915 MHz link, an independent log and a field-ready interface.</p></a><a href="/shared/flight-review/"><span>03 / Understand</span><h3>After the flight {ARROW}</h3><p>Time-aligned replay, attitude and measurements from recorded data.</p></a></div></div></section>
<section class="contact-band section"><p class="eyebrow">Contact</p><div><h2>Get in touch.</h2>{link('/v4/about/#contact','Contact Andrew')}</div></section>'''
page('','Andrew Chung — Electrical Engineering','Electrical engineering, embedded systems and real hardware by Andrew Chung. Explore aircraft telemetry, custom circuit boards and connected products.',home,hero=macro,bodyclass='home')
# Project index: meaningful links and all content work with scripting disabled.
cards=''
for i,r in enumerate(DATA[:16]):
 cards+=f'''<article class="index-card" data-project-slug="{e(r['slug'])}" data-project data-category="{e(r['category'])}" data-search="{e((r['name']+' '+r['description']+' '+r['spec']+' '+r['category']).lower())}"><a href="{href(r['slug'])}"><div class="index-image{' cad' if '/v2/' in r['hero']['src'] or '/kiku/' in r['hero']['src'] else ''}">{image(r['hero'],sizes='(max-width:600px) 100vw, (max-width:1000px) 48vw, 32vw')}</div><div class="index-label"><span>{i+1:02d} / {e(r['category'])}</span>{ARROW}</div><h2>{e(r['name'])}</h2><p>{e(r['description'])}</p></a></article>'''
cats=sorted(set(r['category'] for r in DATA[:16]))
index=f'''<section class="index-intro section"><p class="eyebrow">The project archive</p><h1>Ideas, made real.</h1><div class="index-intro-bottom"><p>Hardware, embedded software and systems.<br>Sixteen projects, built from the inside out.</p><a href="/v4/about/">About the engineer {ARROW}</a></div></section><section class="collection section" aria-label="Project collection"><form class="filters" role="search" hidden><label><span>Find a project</span><input type="search" name="q" placeholder="Search projects, components, ideas…" autocomplete="off"></label><label class="category-label"><span>Discipline</span><select name="category"><option value="">All disciplines</option>{''.join('<option>'+e(c)+'</option>' for c in cats)}</select></label><button type="reset">Reset</button></form><p class="result-count" data-count aria-live="polite">16 projects</p><div class="index-grid">{cards}</div><p class="no-results" hidden>No matching projects. Try another term, or clear the filters.</p></section>'''
page('projects/','Projects — Andrew Chung','Explore 16 projects in electronics, embedded systems, robotics and flight telemetry.',index,active='/v4/projects/')
# Editorial case studies, independent of prior visual skins and heavy renderers.
for idx,r in enumerate(DATA):
 ev=r.get('evidence',{}); slug=r['slug']; title=r['name']; notes=''
 rows=[]
 if ev.get('role'):rows.append(('My contribution',[ev['role']]))
 if ev.get('problem'):rows.append(('The constraint',[ev['problem']]))
 if ev.get('decisions'):rows.append(('Design decisions',ev['decisions']))
 if ev.get('challenges'):rows.append(('What needed work',[ev['challenges']]))
 if ev.get('validation'):rows.append(('Evidence & validation',[ev['validation']]))
 if ev.get('outcome'):rows.append(('Current outcome',[ev['outcome']]))
 if ev.get('limit'):rows.append(('What this does not establish',[ev['limit']]))
 for i,(label,paras) in enumerate(rows):notes+=f'<section class="story-row"><h3><span>{i+1:02d}</span>{e(label)}</h3><div>'+''.join(f'<p>{e(p)}</p>' for p in paras)+'</div></section>'
 # Original narrative supplies the smaller projects without invented metrics.
 prose=''
 for sec in r['paragraphs'][:3]:prose+=f'<section class="story-row"><h3>{e(sec["heading"])}</h3><div>'+''.join(f'<p>{e(p)}</p>' for p in sec['paragraphs'])+'</div></section>'
 gallery=[]
 for img in r['images']:
  if img['src']!=r['hero']['src'] and not img['src'].endswith('-960.webp'):gallery.append(img)
 gallery=gallery[:4]
 build='<section class="case-gallery section" id="build"><header class="section-head"><div><p class="eyebrow">A closer look</p><h2>The work, in detail.</h2></div><p>Open an image to inspect it.</p></header><div class="gallery-grid">'
 for i,img in enumerate(gallery):build+=f'<figure><a class="gallery-link" href="{e(img["src"])}" data-gallery aria-label="Enlarge: {e(img["alt"])}">{image(img,sizes="(max-width:700px) 100vw, 48vw")}<span aria-hidden="true">↗</span></a><figcaption>{e(img["alt"])}</figcaption></figure>'
 build+='</div></section>'
 if not gallery:build=''
 resource_links=''.join(link(l['href'],l['label']) for l in r['links'])
 resource_links+=link(r['lab'],'Open the interactive project' if '#explore' in r['lab'] or slug=='kiku' else 'Read the full project record')
 if slug.startswith('skylabs'):
  resource_links+=link('/shared/flight-review/','Open Flight Review')
  resource_links+=link('/shared/projects/skylabs/f110211/diagnostic.html','Read the flight diagnostic')
  resource_links+='<p class="note">The reference flight record includes its exact GPS route. The 40 Hz logging rate is a target, not a demonstrated result in that flight.</p>'
 if slug=='skylabs':
  resource_links+=link(href('skylabs/boards/telemetry'),'Aircraft telemetry')+link(href('skylabs/boards/ground-station'),'Ground station')
 nxt=DATA[(idx+1)%16]
 body=f'''<section class="case-head section"><a class="back-link" href="/v4/projects/">← All projects</a><h1>{e(title)}</h1><div class="case-summary"><p class="eyebrow">{e(r['category'])}</p><p>{e(r['description'])}</p><a class="down-link" href="#engineering" aria-label="Read the engineering story">↓</a></div></section><figure class="case-hero section{' cad' if '/v2/' in r['hero']['src'] or '/kiku/' in r['hero']['src'] else ''}">{image(r['hero'],True)}<figcaption>{e(r['hero']['alt'])}</figcaption></figure><div class="case-specs section">{''.join('<div><span>'+e(s['label'])+'</span><p>'+e(s['value'])+'</p></div>' for s in r['specs'])}</div><section class="case-story section" id="engineering"><header class="story-heading"><p class="eyebrow">Engineering record</p><h2>{e(ev.get('title', 'The thinking behind the build.'))}</h2>{'<p class="maturity">'+e(ev['maturity'])+'</p>' if ev.get('maturity') else ''}</header><div class="story-body">{notes}{prose if not rows or len(rows)<3 else ''}</div></section>{build}<section class="case-resources section"><p class="eyebrow">Go deeper</p><h2>Explore the engineering.</h2><div class="resource-links">{resource_links}</div></section><a class="next-project section" href="{href(nxt['slug'])}"><span class="eyebrow">Next project</span><span class="next-name">{e(nxt['name'])} {ARROW}</span></a>'''
 page('projects/'+slug+'/',title+' — Andrew Chung',r['description'],body,active='/v4/projects/',hero=r['hero'],bodyclass='case-page project-'+slug.replace('/','-'))
# Concise factual profile, clearly separating personal and team work.
roles=[('Jun. 2026 — present','Electronics Engineer Trainee','Switchmode Power Supplies','Maintenance, testing and repair of low- and high-voltage power supplies and other equipment.'),('May 2026 — present','Avionics & Payload Team Lead','UNSW Skylabs','Aircraft telemetry, flight-data hardware and replay tools. Joined Mission Systems in August 2025.'),('Dec. 2023 — present','Senior Lab Demonstrator','UNSW','Teaching and assessing practical electrical engineering and design classes.'),('Dec. 2024 — present','Behaviours / Hardware Team Member','rUNSWift','Python, C++ and ROS2 for humanoid robots. Prepared and led the Sydney team at RoboCup 2025 in Salvador, Brazil.'),('Sep. 2024 — Jan. 2026','President','UNSW Electrical Engineering & Telecommunications Society','Led a team of more than 50 students. In 2025, the society ran 100+ events and delivered 4,000 hours of course support.')]
about=f'''<section class="about-head section"><p class="eyebrow">Electrical engineering / Sydney</p><h1>Andrew Chung.</h1><div class="about-lead"><h2>I like building<br>the whole thing.</h2><div><p>From a schematic and PCB layout to the firmware, measurements and interface that make a system useful.</p><p>I study electrical engineering at UNSW, work in power electronics and lead avionics and payload work at UNSW Skylabs.</p>{link('/assets/documents/Andrew_Chung_Public_CV.pdf','Download public CV')}</div></div></section><section class="experience section" aria-labelledby="experience-title"><div class="section-head"><p class="eyebrow">Experience</p><h2 id="experience-title">In the lab.<br>In the field.</h2></div>{''.join('<article class="experience-row"><p class="eyebrow">'+e(d)+'</p><div><h3>'+e(t)+'</h3><p class="place">'+e(p)+'</p></div><p>'+e(s)+'</p></article>' for d,t,p,s in roles)}</section><section class="education section"><p class="eyebrow">Education & tools</p><div><h2>UNSW, 2023–2027.</h2><p>Bachelor of Electrical Engineering (Honours)<br>Master of Electrical Engineering</p><div class="skills-list"><p>C / C++ / Python / Assembly</p><p>KiCad / LTspice / MATLAB / Simulink / ROS2</p><p>PCB design / Embedded systems / RF & GNSS / Electronics testing</p></div></div></section><section class="contact-section section" id="contact"><p class="eyebrow">Engineering, project questions or collaboration</p><h2>Let’s talk.</h2><a class="email" href="mailto:andrew.noah.chung@gmail.com">andrew.noah.chung@gmail.com {ARROW}</a><div class="contact-actions">{link('/book/','Book a time')}{link('https://www.linkedin.com/in/22anc/','LinkedIn')}<button type="button" class="text-link" data-copy-email hidden>Copy email <span aria-hidden="true">+</span></button></div></section>'''
page('about/','About — Andrew Chung','Electrical engineering at UNSW, power electronics, avionics, robotics and embedded systems.',about,active='/v4/about/')
failed=[]
for path,content in OUT.items():
 dest=ROOT/path
 if '--check' in sys.argv:
  if not dest.exists() or dest.read_text()!=content:failed.append(path)
 else:dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(content)
if failed:raise SystemExit('Generated pages differ: '+', '.join(failed))
print(('Checked' if '--check' in sys.argv else 'Built')+f' {len(OUT)} independent v4 pages.')
