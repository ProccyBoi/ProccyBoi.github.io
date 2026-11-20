#!/usr/bin/env python3
"""Generate v5 project interiors from the established v4 factual content ledger.

Run from any directory. --check compares without writing. Standard library only.
The v5 home, references and interactive tester case are authored separately.
"""
import argparse
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'v4/content/projects.json'
TESTER = ROOT / 'v5/content/isolated-glitch-tester.json'
CV = '/assets/documents/Andrew_Chung_Public_CV.pdf'
HARDWARE_MODELS = {
    'dash': ('dash', 'Dash device assembly'),
    'skylabs/boards/telemetry': ('skylabs-telemetry', 'Aircraft telemetry board assembly'),
    'skylabs/boards/ground-station': ('skylabs-ground-station', 'Ground station board assembly'),
}
HARDWARE_ASSETS = '''<link rel="stylesheet" href="/assets/v2-hardware.css">
<link rel="stylesheet" href="/v5/hardware.css?v=workbench-20261120">
<script src="/assets/v2-hardware.js?v=studio-20261120" defer></script>'''


def esc(value):
    return html.escape(str(value), quote=True)


def link(href, label, cls=''):
    return f'<a href="{esc(href)}"' + (f' class="{esc(cls)}"' if cls else '') + f'>{esc(label)}</a>'


def paragraphs(values):
    return ''.join(f'<p>{esc(p)}</p>' for p in values)


def image(img, eager=False):
    return (f'<img src="{esc(img["src"])}" alt="{esc(img["alt"])}" width="{int(img["width"])}" '
            f'height="{int(img["height"])}" loading="{"eager" if eager else "lazy"}" decoding="async"'
            + (' fetchpriority="high"' if eager else '') + '>')


def cad_attribute(img):
    return ' data-cad' if 'cad' in img['alt'].lower() or '/hardware/' in img['src'] else ''


def index_thumbnail(img):
    smaller = img['src'].removesuffix('-1920.webp') + '-960.webp'
    if img['src'].endswith('-1920.webp') and (ROOT / smaller.lstrip('/')).is_file():
        img = {**img, 'src': smaller, 'width': img['width'] // 2, 'height': img['height'] // 2}
    return {**img, 'alt': ''}


def shell(title, description, route, content, active='', script=False, social=None, hardware=False):
    nav = [('/v5/projects/', 'Projects'), ('/v5/#bench', 'Demos'), ('/v5/references/', 'Notebook'), ('/v5/about/', 'About'), (CV, 'CV')]
    navigation = ''.join(f'<a href="{esc(url)}"' + (' aria-current="page"' if active == url else '') + f'>{name}</a>' for url, name in nav)
    social = social or '/assets/images/projects/skylabs-telemetry-macro-1920.webp'
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><title>{esc(title)} — Andrew Chung</title>
<meta name="description" content="{esc(description)}"><meta name="theme-color" content="#f5f3ff">
<link rel="canonical" href="https://proccyboi.github.io{route}">
<meta property="og:type" content="website"><meta property="og:title" content="{esc(title)} — Andrew Chung">
<meta property="og:description" content="{esc(description)}"><meta property="og:url" content="https://proccyboi.github.io{route}">
<meta property="og:image" content="https://proccyboi.github.io{esc(social)}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/archivo-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/v5/site.css?v=workbench-20261120"><link rel="stylesheet" href="/v5/interiors.css?v=workbench-20261120">
{'<script src="/v5/interiors.js" defer></script>' if script else ''}{HARDWARE_ASSETS if hardware else ''}
</head>
<body class="interior v5-records">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><a class="brand" href="/v5/" aria-label="Andrew Chung home"><span class="brand-mark" aria-hidden="true">ac</span>Andrew Chung</a><nav aria-label="Primary navigation">{navigation}</nav></header>
<main id="main" tabindex="-1">{content}</main>
<footer class="site-footer"><a href="/v5/">Andrew Chung</a><span>Electrical engineering · Sydney</span><nav aria-label="Footer">{link('/v5/about/#contact', 'Contact')}{link('https://github.com/ProccyBoi', 'GitHub')}{link(CV, 'Public CV')}<a href="#main">Back to top</a></nav></footer>
</body></html>
'''


def hardware_panel(asset, title, poster):
    return f'''<section id="explore" class="v5-hardware-panel" aria-labelledby="v5-hardware-title">
  <header><h2 id="v5-hardware-title">Inspect the assembly</h2><p>Rotate the model and select a part to identify it. Disassemble to see where the parts sit.</p></header>
  <figure data-hardware="/assets/models/hardware/{esc(asset)}/assembly.json" data-hardware-title="{esc(title)}">
    <div class="hardware-stage" data-hardware-stage>
      <img data-hardware-poster src="{esc(poster['src'])}" width="{int(poster['width'])}" height="{int(poster['height'])}" alt="{esc(poster['alt'])}" loading="lazy" decoding="async">
      <canvas data-hardware-canvas hidden></canvas>
      <output class="v2-part-readout" data-hardware-part aria-live="polite" hidden></output>
    </div>
    <div class="hardware-start"><button type="button" data-hardware-start>Explore in 3D</button></div>
    <div class="hardware-controls"><button type="button" data-hardware-explode aria-pressed="false">Disassemble</button></div>
    <p data-hardware-status role="status" aria-live="polite"></p>
  </figure>
  <noscript><p class="v5-hardware-note">Enable JavaScript to rotate or disassemble the model.</p></noscript>
</section>
'''


def render_case(project, projects):
    p = project
    e = p.get('evidence') or {}
    slug = p['slug']
    route = f'/v5/projects/{slug}/'
    hero = p.get('hero') or p['images'][0]
    crumbs = '<a href="/v5/projects/">All projects</a>'
    if '/boards/' in slug:
        crumbs += ' <span aria-hidden="true">/</span> <a href="/v5/projects/skylabs/">Skylabs</a>'
    crumbs += f' <span aria-hidden="true">/</span> <span aria-current="page">{esc(p["name"])}</span>'
    hardware = HARDWARE_MODELS.get(slug)
    lab = p.get('lab')
    # #details identifies an article, not an interactive viewer.
    action_label = 'Open interactive viewer' if lab and not lab.endswith('#details') else 'Read original project'
    actions = '<a class="interior-button" href="#explore">Inspect in 3D</a>' if hardware else link(lab or p['source'], action_label, 'interior-button')
    if slug == 'kiku':
        actions += link('/v3/projects/kiku/#explore', 'Inspect the assembly', 'interior-text-link')
    if slug == 'skylabs':
        actions += link('/v5/projects/skylabs/boards/telemetry/', 'Aircraft board', 'interior-text-link')
        actions += link('/v5/projects/skylabs/boards/ground-station/', 'Ground station', 'interior-text-link')
    # A project-level media label may describe its photo gallery, not this hero.
    # Keep the image-specific source description beside the image it describes.
    caption = hero['alt']
    specs = ''.join(f'<div><dt>{esc(s["label"])}</dt><dd>{esc(s["value"])}</dd></div>' for s in p.get('specs', []))
    intro = p.get('intro') or p['description']
    content = f'''<div class="interior-wrap">
<nav class="breadcrumbs" aria-label="Breadcrumb">{crumbs}</nav>
<header class="case-heading"><p class="interior-kicker">{esc(p['category'])}</p><h1>{esc(p['name'])}</h1><div class="case-heading-summary"><p class="interior-lead">{esc(intro)}</p><div class="case-actions">{actions}</div></div></header>
<figure class="case-hero"><div class="case-hero-media"{cad_attribute(hero)}>{image(hero, eager=True)}</div><figcaption>{esc(caption)}</figcaption></figure>
<dl class="case-specs">{specs}</dl>
'''
    if hardware:
        content += hardware_panel(*hardware, hero)
    if e:
        overview = ''
        if e.get('maturity'):
            overview += f'<p class="case-maturity">{esc(e["maturity"])}</p>'
        if e.get('role'):
            overview += f'<h3>My contribution</h3><p>{esc(e["role"])}</p>'
        if e.get('problem'):
            overview += f'<h3>The task</h3><p>{esc(e["problem"])}</p>'
        if e.get('decisions'):
            overview += '<h3>Design decisions</h3>' + paragraphs(e['decisions'])
        if overview:
            content += f'<section class="case-section"><div><p class="interior-kicker">The work</p><h2>{esc(e.get("title") or "Inside the project")}</h2></div><div class="case-prose">{overview}</div></section>'
        evidence_blocks = ''.join(f'<div><h3>{label}</h3><p>{esc(e[key])}</p></div>' for key, label in [('validation', 'What has been checked'), ('challenges', 'Constraints and challenges'), ('outcome', 'Result and next step'), ('limit', 'What remains unverified')] if e.get(key))
        if evidence_blocks:
            content += f'<section class="case-section case-evidence"><div><p class="interior-kicker">Evidence</p><h2>What the work shows.</h2></div><div class="case-prose">{evidence_blocks}</div></section>'
    notes = ''.join(f'<section><h3>{esc(s["heading"])}</h3>{paragraphs(s["paragraphs"])}</section>' for s in p.get('paragraphs', []))
    if notes:
        if e:
            content += f'<details class="case-notes"><summary>Read the detailed project notes</summary><div class="case-prose">{notes}</div></details>'
        else:
            content += f'<section class="case-section"><div><h2>Project notes</h2></div><div class="case-prose">{notes}</div></section>'
    photos = [im for im in p.get('images', []) if im['src'].split('?')[0] != hero['src'].split('?')[0]]
    if photos:
        gallery = ''.join(f'<figure><a href="{esc(im["src"])}" aria-label="Open full image: {esc(im["alt"])}">{image(im)}</a><figcaption>{esc(im["alt"])}</figcaption></figure>' for im in photos)
        content += f'<section class="case-gallery" aria-labelledby="gallery-title"><div class="interior-section-head"><p class="interior-kicker">A closer look</p><h2 id="gallery-title">{esc(p.get("gallery_title") or "On the bench.")}</h2><p>Open an image to view it at full size.</p></div><div class="case-gallery-grid">{gallery}</div></section>'
    resources = []
    seen = set()
    for item in p.get('links', []) + e.get('links', []) + e.get('sources', []):
        if item['href'] not in seen:
            resources.append(item)
            seen.add(item['href'])
    if p['source'] not in seen:
        resources.append({'href': p['source'], 'label': 'Original project record'})
    content += '<section class="case-resources"><h2>Explore further.</h2><ul>' + ''.join(f'<li>{link(r["href"], r["label"])}</li>' for r in resources) + '</ul></section>'
    if '/boards/' in slug:
        next_p = projects[0]
    else:
        main_projects = [x for x in projects if '/boards/' not in x['slug']]
        next_p = main_projects[(main_projects.index(p) + 1) % len(main_projects)]
    content += f'<nav class="case-next" aria-label="More projects"><a href="/v5/projects/">All projects</a>{link("/v5/projects/" + next_p["slug"] + "/", "Next: " + next_p["name"])}</nav></div>'
    return route, shell(p['name'], p['description'], route, content, social=hero['src'], hardware=bool(hardware))


def collection(projects):
    main = [p for p in projects if '/boards/' not in p['slug']]
    project_count = len(main)
    categories = sorted({p['category'] for p in main})
    options = ''.join(f'<option value="{esc(c)}">{esc(c)}</option>' for c in categories)
    entries = []
    for p in main:
        hero = p.get('hero') or p['images'][0]
        search = ' '.join([p['name'], p['description'], p['spec'], p['category'], (p.get('evidence') or {}).get('maturity', '')])
        entries.append(f'''<article class="project-entry" data-project data-category="{esc(p['category'])}" data-search="{esc(search.lower())}">
<div class="project-entry-image"{cad_attribute(hero)}>{image(index_thumbnail(hero))}</div>
<div class="project-entry-copy"><h2><a href="/v5/projects/{p['slug']}/">{esc(p['name'])}</a></h2><p>{esc(p['description'])}</p></div>
<div class="project-entry-meta"><p class="project-entry-discipline">{esc(p['category'])}</p><p class="project-entry-spec">{esc(p['spec'])}</p></div>
</article>''')
    content = f'''<div class="interior-wrap"><header class="collection-heading"><h1>Project<br>index.</h1><p class="interior-lead">Circuit boards, embedded software and the tools I use to build and test them.</p></header>
<form class="project-filters" data-filters hidden role="search" aria-label="Find a project"><div><label for="project-query">Search projects</label><input id="project-query" name="q" type="search" placeholder="Try PCB, radio or STM32" autocomplete="off"></div><div><label for="project-discipline">Discipline</label><select id="project-discipline" name="discipline"><option value="">All disciplines</option>{options}</select></div><button type="reset">Reset filters</button></form>
<div class="collection-status"><p data-count role="status" aria-live="polite" aria-atomic="true">{project_count} projects</p><a href="#board-records">Skylabs board records</a></div>
<div class="project-index-labels" aria-hidden="true"><span>Preview</span><span>Project</span><span>Discipline and details</span></div>
<div class="project-list">{''.join(entries)}</div><div class="project-empty" data-empty hidden><h2>No projects match.</h2><p>Try a different keyword or select all disciplines.</p><button type="button" data-reset>Show all projects</button></div>
<section class="board-records" id="board-records" aria-labelledby="boards-title"><h2 id="boards-title">Skylabs<br>board records.</h2><div>{''.join(f'<article><h3>{link("/v5/projects/" + p["slug"] + "/", p["name"])}</h3><p>{esc(p["description"])}</p></article>' for p in projects if '/boards/' in p['slug'])}</div></section>
</div>'''
    return shell('Projects', f'Explore {project_count} electrical engineering projects, plus the Skylabs aircraft and ground-station board records.', '/v5/projects/', content, active='/v5/projects/', script=True)


def about():
    roles = [
        ('Jun. 2026 — present', 'Electronics Engineer Trainee', 'Switchmode Power Supplies', 'I maintain, test and repair low- and high-voltage power supplies and other equipment.'),
        ('May 2026 — present', 'Avionics & Payload Team Lead', 'UNSW Skylabs', 'I joined Mission Systems in August 2025 and became team lead in May 2026. I work on the aircraft logger, ground-station hardware and post-flight replay, and represented UNSW at AIAA Design/Build/Fly 2026 in Wichita.'),
        ('Dec. 2023 — present', 'Senior Lab Demonstrator', 'UNSW', 'I teach and assess practical classes in electrical engineering and design.'),
        ('Dec. 2024 — present', 'Behaviours / Hardware Team Member', 'rUNSWift', 'I develop and test Python and C++ ROS2 software for NAO and Booster K1 humanoid robots. I prepared and led the Sydney team at RoboCup 2025 in Salvador, Brazil.'),
        ('Sep. 2024 — Jan. 2026', 'President', 'UNSW Electrical Engineering & Telecommunications Society', 'I led a team of more than 50 students. In 2025, the society ran over 100 events and delivered 4,000 hours of course support.'),
    ]
    teaching_anchor = ' id="teaching"'
    rows = ''.join(f'<article class="experience-entry"{teaching_anchor if role == "Senior Lab Demonstrator" else ""}><p class="interior-kicker">{esc(date)}</p><div><h3>{esc(role)}</h3><p class="experience-place">{esc(place)}</p></div><p>{esc(description)}</p></article>' for date, role, place, description in roles)
    content = f'''<div class="interior-wrap"><header class="about-heading"><p class="interior-kicker">Electrical engineering / Sydney</p><h1>Andrew Chung.</h1><div class="about-intro"><h2>From the bench<br>to the field.</h2><div><p class="interior-lead">I study electrical engineering at UNSW, work on power supplies at Switchmode, and lead avionics and payload work at UNSW Skylabs.</p><p>On the bench, I test and repair power supplies. For Skylabs, I work on the whole data path, from the STM32 aircraft logger through a LoRa ground station to the replay tools we use after landing.</p><p>I also teach engineering labs at UNSW, where students turn a circuit or design into something they can build and measure.</p><div class="case-actions">{link(CV, 'Download public CV', 'interior-button')}{link('/v5/projects/skylabs/', 'Explore Skylabs', 'interior-text-link')}{link('/v5/projects/isolated-glitch-tester/', 'Explore the tester', 'interior-text-link')}</div></div></div></header>
<section class="experience" aria-labelledby="experience-title"><div class="interior-section-head"><p class="interior-kicker">Experience</p><h2 id="experience-title">In the lab.<br>In the field.</h2></div>{rows}</section>
<section class="case-section education"><div><p class="interior-kicker">Education & tools</p><h2>UNSW,<br>2023–2027.</h2></div><div class="case-prose"><p>Bachelor of Electrical Engineering (Honours)<br>Master of Electrical Engineering</p><ul class="tools-list"><li>C / C++ / Python / Assembly</li><li>KiCad / LTspice / MATLAB / Simulink / ROS2</li><li>PCB design / Embedded systems / RF & GNSS / Electronics testing</li></ul><p>My music background includes AMEB Grade 8 Piano and Grade 6 Clarinet.</p></div></section>
<section class="interior-contact" id="contact" aria-labelledby="contact-title"><p class="interior-kicker">Engineering, project questions or collaboration</p><h2 id="contact-title">Let's talk.</h2><a class="interior-email" href="mailto:andrew.noah.chung@gmail.com">andrew.noah.chung@gmail.com</a><div class="case-actions">{link('/book/', 'Book a time', 'interior-button')}{link('https://www.linkedin.com/in/22anc/', 'LinkedIn', 'interior-text-link')}{link('https://github.com/ProccyBoi', 'GitHub', 'interior-text-link')}</div></section></div>'''
    return shell('About', 'Electrical engineering at UNSW, power electronics, avionics, robotics and embedded systems.', '/v5/about/', content, active='/v5/about/')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    cases = json.loads(DATA.read_text(encoding='utf-8'))
    tester = json.loads(TESTER.read_text(encoding='utf-8'))
    projects = cases + [tester]
    if len(cases) != 18 or len({project['slug'] for project in projects}) != 19:
        raise SystemExit('Expected 17 projects and two unique Skylabs board records.')
    outputs = {ROOT / 'v5/projects/index.html': collection(projects), ROOT / 'v5/about/index.html': about()}
    for project in cases:
        route, page = render_case(project, cases)
        outputs[ROOT / route.lstrip('/') / 'index.html'] = page
    mismatches = []
    for path, content in outputs.items():
        if args.check:
            if not path.exists() or path.read_text(encoding='utf-8') != content:
                mismatches.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding='utf-8', newline='\n')
    if mismatches:
        raise SystemExit('Generated files are stale: ' + ', '.join(mismatches))
    print(f'{"Checked" if args.check else "Generated"} {len(outputs)} v5 pages: 16 generated projects, two board records, About and the 17-project collection.')


if __name__ == '__main__':
    main()
