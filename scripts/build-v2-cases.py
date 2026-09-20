"""Build the v2 editorial pages from the existing, factual project records.

Only the Python standard library is needed. The original portfolio and shared
applications remain the sources of truth; generated pages keep their interactive
modules and media while using an independent navigation and design layer.
"""
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


class Node:
    def __init__(self, tag, attrs, start, open_end, parent=None):
        self.tag, self.attrs, self.start, self.open_end = tag, dict(attrs), start, open_end
        self.close_start = self.end = open_end
        self.parent, self.children = parent, []

    def has(self, name):
        return name in self.attrs.get('class', '').split()

    def outer(self, source):
        return source[self.start:self.end]

    def inner(self, source):
        return source[self.open_end:self.close_start]


class Tree(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0]
        for match in re.finditer('\n', source):
            self.lines.append(match.end())
        self.nodes, self.stack = [], []
        self.feed(source)

    def position(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        start = self.position()
        node = Node(tag, attrs, start, start + len(self.get_starttag_text()), self.stack[-1] if self.stack else None)
        if node.parent:
            node.parent.children.append(node)
        self.nodes.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag:
                node = self.stack[index]
                node.close_start = self.position()
                node.end = self.source.index('>', node.close_start) + 1
                self.stack = self.stack[:index]
                break

    def find(self, tag=None, cls=None):
        return next((node for node in self.nodes if (not tag or node.tag == tag) and (not cls or node.has(cls))), None)


def text(html):
    return unescape(re.sub('<[^>]+>', '', html)).strip()


def replace_nodes(source, changes):
    for node, replacement in sorted(changes, key=lambda entry: entry[0].start, reverse=True):
        source = source[:node.start] + replacement + source[node.end:]
    return source


def header(active='work'):
    return f'''<header class="v2-header"><div class="v2-nav-shell">
      <a class="v2-brand" href="/v2/">Andrew Chung <span>ENGINEERING</span></a>
      <nav class="v2-nav" id="v2-navigation" aria-label="Primary navigation" data-v2-nav>
        <a href="/v2/projects/"{' aria-current="page"' if active == 'work' else ''}>Work</a>
        <a href="/v2/about/"{' aria-current="page"' if active == 'about' else ''}>About</a>
        <a class="v2-nav-contact" href="/v2/about/#contact">Let’s talk <span aria-hidden="true">↗</span></a>
      </nav><button class="v2-menu" data-v2-menu type="button" aria-expanded="false" aria-controls="v2-navigation" aria-label="Open navigation"><span></span><span></span></button>
    </div></header>'''


FOOTER = '''<footer class="v2-footer"><div class="v2-shell"><a class="v2-footer-name" href="/v2/">Andrew Chung.</a><div class="v2-footer-links"><a href="/v2/projects/">Work</a><a href="/v2/about/#contact">Get in touch ↗</a><a href="https://github.com/ProccyBoi" target="_blank" rel="noreferrer">GitHub ↗</a><a href="https://www.linkedin.com/in/22anc/" target="_blank" rel="noreferrer">LinkedIn ↗</a></div><p>Electrical engineering. Sydney, Australia.</p><p>© <span data-current-year>2026</span> Andrew Chung</p></div></footer>'''

ORDER = ['tramtrace', 'skylabs', 'framework-dual-usb', 'framework-expansion-card', 'lora-receiver', 'rf-test-board', 'metroboard', 'switch-mode-power-supplies', 'scopelab', 'lithography-animation', 'mosfet-operating-regions', 'runswift', 'lora-talkie', 'dash']
LABELS = {'tramtrace': 'TramTrace', 'skylabs': 'Skylabs', 'framework-dual-usb': 'Dual USB-C Framework Card', 'framework-expansion-card': 'Framework ESP32 Card', 'lora-receiver': 'LoRa Receiver + GNSS', 'rf-test-board': 'RF Test Board', 'metroboard': 'Metroboard', 'switch-mode-power-supplies': 'Switchmode Power Supplies', 'scopelab': 'ScopeLab', 'lithography-animation': 'Lithography Animation', 'mosfet-operating-regions': 'MOSFET Region Explorer', 'runswift': 'rUNSWift', 'lora-talkie': 'LoRa Talkie', 'dash': 'Dash'}
BRIEFS = {
 'lora-receiver': [('The system', 'An ESP32 receiver combining 915 MHz LoRa with u-blox GNSS.'), ('The constraint', 'Radio and navigation on one PCB, with a feedline worth measuring.'), ('What I learned', 'At least 1 km in testing; VNA measurements informed the RF Test Board.')],
 'metroboard': [('The interface', 'A physical Sydney rail map with 291 individually addressable LEDs.'), ('The hardware', 'A 300 × 305.7 mm PCB driven by an ESP32.'), ('The connection', 'Live transport data becomes something visible across a room.')],
 'dash': [('The interaction', 'Animated eyes, gestures and a focus timer in an ESP32 desk companion.'), ('The firmware', 'A coordinating state machine with separate sensing, display and audio tasks.'), ('The workflow', 'A local Wi-Fi captive portal for sessions, settings and recent statistics.')],
 'lora-talkie': [('The interaction', 'Write, edit and send a complete Morse message with one button.'), ('The link', '915 MHz LoRa on a Heltec V3 board with an SX126x radio.'), ('The field workflow', 'Continuous receive, message recall, a status page and beacon mode.')],
 'runswift': [('My contribution', 'Robot behaviours, hardware integration and competition preparation.'), ('The stack', 'Python, C++ and ROS2 across NAO V5/6 and Booster K1 hardware.'), ('In competition', 'Prepared and led the Sydney team at RoboCup 2025 in Salvador, Brazil.')],
 'scopelab': [('The learner', 'Students working through GPIO, UART, I2C and SPI fundamentals.'), ('The workflow', 'Edit, compile and flash, then verify the signal at the bench.'), ('The platform', 'BBC micro:bit V2, the official MakeCode editor and browser-based WebUSB.')],
 'switch-mode-power-supplies': [('The context', 'Electronics Engineer Trainee at Switchmode Power Supplies.'), ('The work', 'Maintenance, testing and repair of power supplies and other equipment.'), ('Shown here', 'Isolated Glitch Tester V03 and Isolated Glitch Tester Bus V02.')],
}


def route_links(source):
    source = re.sub(r'(href=["\'])/?(projects/|about/)', r'\1/v2/\2', source)
    source = source.replace('href="./"', 'href="/v2/"')
    source = source.replace('https://proccyboi.github.io/projects/', 'https://proccyboi.github.io/v2/projects/')
    source = source.replace('https://proccyboi.github.io/about/', 'https://proccyboi.github.io/v2/about/')
    return source


def common(source, body_class, active='work'):
    tree = Tree(source)
    changes = []
    old_header = tree.find('header', 'site-header') or tree.find('header', 'lab-chrome')
    if old_header:
        changes.append((old_header, header(active)))
    old_footer = tree.find('footer', 'site-footer')
    if old_footer:
        changes.append((old_footer, FOOTER))
    source = replace_nodes(source, changes)
    source = re.sub(r'<body(?: class="([^"]*)")?>', lambda match: '<body class="v2 ' + body_class + (' ' + match[1] if match[1] else '') + '">', source, count=1)
    source = re.sub(r'<script[^>]+src="assets/site-enhancements.js"[^>]*></script>', '', source)
    source = source.replace('content="#111210"', 'content="#f5f5f2"')
    if '<base' not in source:
        source = source.replace('<head>', '<head>\n<base href="/">', 1)
    source = source.replace('</head>', '''<link rel="stylesheet" href="/assets/v2.css">
  <link rel="stylesheet" href="/assets/v2-case.css">
  <link rel="stylesheet" href="/assets/v2-motion.css">
  <script src="/assets/v2.js" defer></script><script src="/assets/v2-cases.js" defer></script>
  <script src="/assets/v2-motion.js" defer></script>
</head>''')
    if not old_footer:
        source = source.replace('</body>', FOOTER + '\n</body>')
    return route_links(source)


def case_navigation(source, slug, title):
    tree = Tree(source)
    links = [('overview', 'Overview')]
    if 'id="explore"' in source:
        links.append(('explore', 'Interactive'))
    if 'id="details"' in source:
        links.append(('details', 'Engineering'))
    if 'id="build"' in source:
        links.append(('build', 'Build'))
    if slug == 'skylabs':
        links.append(('boards', 'Boards'))
    path = '/v2/projects/' + slug + '/'
    markup = f'<nav class="v2-case-nav" aria-label="Case study sections"><div class="shell"><a class="v2-case-back" href="/v2/projects/">← <span>All work</span></a><span class="v2-case-nav-title">{escape(title)}</span><div class="v2-case-nav-links">'
    markup += ''.join(f'<a href="{path}#{anchor}" data-v2-section>{label}</a>' for anchor, label in links)
    markup += '</div></div><span class="v2-reading-progress" data-v2-progress aria-hidden="true"></span></nav>'
    old = tree.find('nav', 'project-flow')
    if old:
        return replace_nodes(source, [(old, markup)])
    return source.replace('<main ', markup + '\n<main ', 1)


def continuation(slug):
    if slug == 'skylabs/boards/telemetry':
        prev, nxt = 'skylabs', 'skylabs/boards/ground-station'
    elif slug == 'skylabs/boards/ground-station':
        prev, nxt = 'skylabs/boards/telemetry', 'skylabs'
    else:
        index = ORDER.index(slug)
        prev, nxt = ORDER[(index - 1) % len(ORDER)], ORDER[(index + 1) % len(ORDER)]
    labels = {**LABELS, 'skylabs/boards/telemetry': 'Aircraft telemetry', 'skylabs/boards/ground-station': 'Ground station'}
    return f'''<nav class="v2-continue shell" aria-label="More project stories"><p class="eyebrow">Continue exploring</p><div>
      <a href="/v2/projects/{prev}/"><span>← Previous case study</span><strong>{escape(labels[prev])}</strong></a>
      <a href="/v2/projects/{nxt}/"><span>Next case study →</span><strong>{escape(labels[nxt])}</strong></a>
    </div><a class="v2-all-work" href="/v2/projects/">View the complete collection <span aria-hidden="true">↗</span></a></nav>'''


def make_case(path):
    slug = path.parent.relative_to(ROOT / 'projects').as_posix()
    source = path.read_text(encoding='utf-8')
    if slug == 'skylabs/flight-review':
        return source
    if slug in ('lithography-animation', 'mosfet-operating-regions'):
        source = source.replace('<meta name="theme-color" content="#2b6cb0">', '<meta name="theme-color" content="#f5f5f2">')
        source = common(source, 'v2-lab')
        source = source.replace('<a class="lab-skip" href="#lab-main">', f'<a class="lab-skip" href="/v2/projects/{slug}/#lab-main">')
        source = source.replace(FOOTER, continuation(slug) + FOOTER)
        return source
    tree = Tree(source)
    hero, copy, media, meta = (tree.find(cls=name) for name in ['project-hero', 'project-hero-copy', 'project-hero-media', 'project-meta'])
    title = text(tree.find('h1').inner(source))
    copy_intro = copy.children[0].inner(source)
    copy_intro = re.sub(r'<ol class="crumbs".*?</ol>', '', copy_intro, flags=re.S)
    project_number = ORDER.index(slug.split('/')[0]) + 1
    cad_assets = {
        'tramtrace': ('tramtrace-cad.webp', 'Source-derived KiCad rendering of the TramTrace light-rail display PCB'),
        'framework-expansion-card': ('framework-cad.webp', 'Source-derived CAD rendering of the populated Framework ESP32 card'),
    }
    hero_media = media.outer(source)
    if slug in cad_assets:
        asset, alt = cad_assets[slug]
        hero_media = f'<figure class="project-hero-media v2-cad-media"><img src="/assets/images/v2/{asset}" width="1600" height="1200" alt="{alt}" fetchpriority="high"><figcaption class="v2-cad-caption">Source-derived geometry / engineering render</figcaption></figure>'
    elif slug.startswith('skylabs'):
        board = 'ground' if slug.endswith('ground-station') else 'telemetry'
        width, height = (1376, 984) if board == 'telemetry' else (1400, 1000)
        hero_media = f'<figure class="project-hero-media v2-cad-media"><img src="/assets/images/interactive/skylabs/skylabs-{board}-turn-02.webp" width="{width}" height="{height}" alt="KiCad rendering of the assembled Skylabs {board} board" fetchpriority="high"><figcaption class="v2-cad-caption">Working KiCad design / assembled board</figcaption></figure>'
    has_explorer = 'id="explore"' in source
    hero_actions = f'<div class="project-hero-actions"><a href="/v2/projects/{slug}/#{"explore" if has_explorer else "details"}">{"Explore the hardware" if has_explorer else "Read the story"} <span aria-hidden="true">↗</span></a><a href="/v2/projects/{slug}/#details">Engineering details <span aria-hidden="true">↓</span></a></div>' if has_explorer else f'<div class="project-hero-actions"><a href="/v2/projects/{slug}/#details">Read the story <span aria-hidden="true">↓</span></a></div>'
    new_hero = f'''<section class="project-hero" id="overview" aria-labelledby="{tree.find('h1').attrs['id']}">
    <div class="project-hero-grid"><div class="project-hero-copy"><p class="v2-case-number">Selected work <span>{project_number:02d} / {len(ORDER):02d}</span></p><div>{copy_intro}</div>{hero_actions}</div>{hero_media}</div>
    <div class="v2-case-specs shell">{meta.outer(source) if meta else ''}</div></section>'''
    changes = [(hero, new_hero)]
    old_next = tree.find('a', 'next-project')
    if old_next:
        changes.append((old_next, continuation(slug)))
    source = replace_nodes(source, changes)
    if slug in cad_assets:
        source = re.sub(r'<link rel="preload" as="image"[^>]*>', '', source)
        source = source.replace('</head>', f'<link rel="preload" as="image" href="/assets/images/v2/{cad_assets[slug][0]}" type="image/webp">\n</head>')
    source = re.sub(r'<div class="project-body shell"(?! id=)', '<div class="project-body shell" id="details"', source, count=1)
    if 'id="build"' not in source and 'class="project-gallery"' in source:
        source = source.replace('class="project-gallery"', 'class="project-gallery" id="build"', 1)
    if 'class="engineering-brief' not in source and slug in BRIEFS:
        brief = '<dl class="engineering-brief shell" aria-label="Engineering brief">' + ''.join(f'<div><dt>{escape(a)}</dt><dd>{escape(b)}</dd></div>' for a, b in BRIEFS[slug]) + '</dl>'
        source = source.replace('</section>', '</section>\n' + brief, 1)
    source = common(source, 'v2-case')
    return case_navigation(source, slug, title)


def make_index():
    source = (ROOT / 'projects/index.html').read_text(encoding='utf-8')
    tree = Tree(source)
    hero = tree.find('section', 'page-hero')
    new_hero = '''<section class="v2-collection-hero shell"><p class="eyebrow">The work / 14 projects</p><div><h1>Made to work.<br><span>Built to explore.</span></h1><p>Custom boards, connected systems and tools for understanding them. A collection of things I have designed, built and tested.</p></div><a href="/v2/projects/#hardware">Explore the collection <span aria-hidden="true">↓</span></a></section>'''
    jump = tree.find('nav', 'project-jumpbar')
    controls = '''<div class="v2-collection-controls"><div class="shell"><nav class="v2-collection-categories" aria-label="Project categories"><a href="/v2/projects/#hardware" data-v2-category="all" aria-current="true">All work <span>14</span></a><a href="/v2/projects/#hardware" data-v2-category="hardware">Hardware <span>8</span></a><a href="/v2/projects/#interactive" data-v2-category="interactive">Tools <span>3</span></a><a href="/v2/projects/#robotics" data-v2-category="robotics">Robotics <span>1</span></a><a href="/v2/projects/#archive" data-v2-category="archive">Archive <span>2</span></a></nav><div class="v2-project-search" hidden data-v2-search-wrap><label for="v2-project-search">Find a project</label><input type="search" id="v2-project-search" placeholder="Search work…" autocomplete="off" data-v2-search></div></div></div><p class="v2-search-status shell" data-v2-search-status aria-live="polite" hidden></p>'''
    source = replace_nodes(source, [(hero, new_hero), (jump, controls)])
    source = source.replace('id="hardware"', 'id="hardware" data-v2-project-group="hardware"', 1).replace('id="interactive"', 'id="interactive" data-v2-project-group="interactive"', 1).replace('id="robotics"', 'id="robotics" data-v2-project-group="robotics"', 1).replace('id="archive"', 'id="archive" data-v2-project-group="archive"', 1)
    source = re.sub(r'(<a class="(?:catalog-card|project-list-row)[^"]*")', r'\1 data-v2-project', source)
    source = source.replace('href="shared/flight-review/"', 'href="/shared/flight-review/"')
    source = source.replace('<small>Skylabs / browser tool</small>', '<small>Part of Skylabs / browser tool ↗</small>')
    source = source.replace('class="catalog-card wide"', 'class="catalog-card wide v2-featured-card"', 2)
    source = source.replace('class="project-list tool-list"', 'class="project-list tool-list v2-related-tool"')
    return common(source, 'v2-collection')


def make_about():
    source = (ROOT / 'about/index.html').read_text(encoding='utf-8')
    source = source.replace('Andrew Chung / background', 'Andrew Chung / Sydney, Australia')
    source = source.replace('Engineering, in practice.', 'Curiosity.<br>Made tangible.')
    source = source.replace('My projects cover PCB design, embedded software, telemetry and robotics.', 'I work across the boundary between hardware and software: from a schematic and PCB layout to the firmware, measurements and interface that make a system useful.')
    source = source.replace('Contact sheet', 'Start a conversation')
    source = source.replace('Let&rsquo;s talk hardware.', 'Let’s build something<br>worth understanding.')
    source = source.replace('<h2 id="experience-title">Experience</h2>', '<div class="v2-about-section-label"><p class="eyebrow">01 / In practice</p><h2 id="experience-title">Experience.</h2><p>At the bench, in the classroom and out in the field.</p></div>')
    source = source.replace('<h2 id="education-title">Education</h2>', '<div class="v2-about-section-label"><p class="eyebrow">02 / Foundations</p><h2 id="education-title">Education.</h2></div>')
    source = source.replace('<h2 id="tools-title">Tools</h2>', '<div class="v2-about-section-label"><p class="eyebrow">03 / The toolkit</p><h2 id="tools-title">Across the stack.</h2></div>')
    source = source.replace('<h2 id="other-title">Awards and music</h2>', '<div class="v2-about-section-label"><p class="eyebrow">04 / Beyond the bench</p><h2 id="other-title">Awards &amp; music.</h2></div>')
    source = source.replace('</figure>', '<figcaption>Skylabs aircraft telemetry / component detail</figcaption></figure>', 1)
    source = source.replace('Download my CV', 'View my CV ↗')
    return common(source, 'v2-about', 'about')


def normalized(content):
    return '\n'.join(line.rstrip() for line in content.splitlines()).rstrip() + '\n'


def main():
    generated = []
    for path in sorted((ROOT / 'projects').rglob('index.html')):
        if path.parent == ROOT / 'projects':
            continue
        output = ROOT / 'v2' / path.relative_to(ROOT)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(normalized(make_case(path)), encoding='utf-8')
        generated.append(output.relative_to(ROOT))
    for relative, content in [('projects/index.html', make_index()), ('about/index.html', make_about())]:
        output = ROOT / 'v2' / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(normalized(content), encoding='utf-8')
        generated.append(output.relative_to(ROOT))
    print('Generated', len(generated), 'v2 pages:')
    print('\n'.join(str(path) for path in generated))


if __name__ == '__main__':
    main()
