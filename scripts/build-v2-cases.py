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
      <a class="v2-brand" href="/v2/">Andrew Chung</a>
      <nav class="v2-nav" id="v2-navigation" aria-label="Primary navigation" data-v2-nav>
        <a href="/v2/projects/"{' aria-current="page"' if active == 'work' else ''}>Projects</a>
        <a href="/v2/about/"{' aria-current="page"' if active == 'about' else ''}>About</a>
        <a class="v2-nav-contact" href="/v2/about/#contact">Contact <span aria-hidden="true">↗</span></a>
      </nav><button class="v2-menu" data-v2-menu type="button" aria-expanded="false" aria-controls="v2-navigation" aria-label="Open navigation"><span></span><span></span></button>
    </div></header>'''


FOOTER = '''<footer class="v2-footer"><div class="v2-shell"><a class="v2-footer-name" href="/v2/">Andrew Chung</a><div class="v2-footer-links"><a href="/v2/projects/">Projects</a><a href="/v2/about/#contact">Contact</a><a href="https://github.com/ProccyBoi" target="_blank" rel="noreferrer">GitHub ↗</a><a href="https://www.linkedin.com/in/22anc/" target="_blank" rel="noreferrer">LinkedIn ↗</a></div><p>Sydney, Australia</p><p>© <span data-current-year>2026</span> Andrew Chung</p></div></footer>'''

ORDER = ['tramtrace', 'skylabs', 'framework-dual-usb', 'framework-expansion-card', 'framework-raspberry-pi', 'lora-receiver', 'rf-test-board', 'metroboard', 'switch-mode-power-supplies', 'scopelab', 'lithography-animation', 'mosfet-operating-regions', 'runswift', 'lora-talkie', 'dash']
LABELS = {'tramtrace': 'TramTrace', 'skylabs': 'Skylabs', 'framework-dual-usb': 'Dual USB-C Framework Card', 'framework-expansion-card': 'Framework ESP32 Card', 'lora-receiver': 'LoRa Receiver + GNSS', 'rf-test-board': 'RF Test Board', 'metroboard': 'Metroboard', 'switch-mode-power-supplies': 'Switchmode Power Supplies', 'scopelab': 'ScopeLab', 'lithography-animation': 'Lithography Animation', 'mosfet-operating-regions': 'MOSFET Region Explorer', 'runswift': 'rUNSWift', 'lora-talkie': 'LoRa Talkie', 'dash': 'Dash'}
LABELS['framework-raspberry-pi'] = 'Raspberry Pi Expansion Card'
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
    return route_links(clean_display_copy(source))


def clean_display_copy(source):
    """Keep useful operating instructions and specifications, without UI boilerplate."""
    tree = Tree(source)
    changes = []
    for node in tree.nodes:
        if node.tag == 'p' and node.has('eyebrow'):
            ancestor = node.parent
            in_viewer = False
            while ancestor:
                in_viewer = in_viewer or ancestor.has('project-interactive')
                ancestor = ancestor.parent
            if in_viewer:
                if 'data-board-eyebrow' in node.attrs:
                    changes.append((node, node.outer(source).replace('<p ', '<p hidden ', 1)))
                else:
                    changes.append((node, ''))
        if node.has('tramtrace-3d-source'):
            changes.append((node, '<div class="tramtrace-3d-source"><span>116 RGB pixels</span><span>28 controller and support parts</span></div>'))
        if node.tag == 'span' and node.parent and node.parent.has('project-list-row'):
            changes.append((node, ''))
        if node.tag == 'span' and node.parent and node.parent.tag == 'figcaption' and re.fullmatch(r'\d+\s*/\s*\d+', text(node.inner(source))):
            changes.append((node, ''))
    source = replace_nodes(source, changes)
    replacements = {
        'Continue exploring': 'More projects',
        'Previous case study': 'Previous project',
        'Next case study': 'Next project',
        'View the complete collection': 'All projects',
        'Explore the production board.': 'TramTrace in 3D',
        'Orbit the production board.': 'Assembly',
        'Inside the ESP32 card.': 'ESP32 card assembly',
        'Inside the dual USB-C card.': 'Dual USB-C assembly',
        'Explore the RF test structures.': 'RF test structures',
        'Explore the rail-map PCB.': 'Metroboard in 3D',
        'Explore the flight hardware.': 'Flight hardware',
        'The assembled view, copper layers and LED order come from the production KiCad source. Inspect a part, rotate the board or play one frame through its real electrical path.': 'Inspect the assembly, copper layers and LED order. Select a component or follow a data frame through the board.',
        'Drag through a full 360&deg; orbit, inspect the underside, or separate the populated assembly. <strong>The assembly comes from the production KiCad design, including all 144 physical parts.</strong>': 'Drag to rotate, inspect the underside or separate the 144-part assembly.',
        'Hover a component to inspect its source reference, package and exact KiCad placement.': 'Hover a component to see its reference and package.',
        'TramTrace production board': 'TramTrace',
        '<span>Production board</span><span>KiCad source / Rev 1</span>': '<span>TramTrace</span><span>Rev 1</span>',
        '<span>Exported directly from the fabrication layers</span>': '',
        '<span>Populated render from the production board</span>': '',
        'A board for questions': 'Test setup',
        'A map, not another app': 'Sydney rail display',
        'Why two?': 'Two ports in one bay',
        'Flight data starts here.': 'Aircraft telemetry',
        'The other end of the link.': 'Ground station',
        'The other end of the link': 'Ground station receiver',
        'Sensors with somewhere to go': 'Sensors and logging',
        'The firmware underneath': 'Firmware',
        'The finished object.': 'Assembly',
        'Two layers carry the map.': 'Copper layers',
        'Position becomes address.': 'LED data order',
        'Start with the board as it was designed to be seen. Select a marked component to find out what it contributes.': 'Select a marked component to see its role in the circuit.',
        "The enclosure is Framework's mechanical STL and the populated PCB is exported from the working KiCad design. Orbit the assembly, remove the shell or pull the two apart.": 'Rotate the card, remove its Framework enclosure or separate the assembly.',
        'The PCB outline, drilled features, pads, silkscreen and footprint positions come from the working KiCad board. Orbit it in the real Framework enclosure, identify a part or separate the assembly.': 'Rotate the card in its Framework enclosure, identify a part or separate the assembly.',
    }
    for old, new in replacements.items():
        source = source.replace(old, new)
    return source


def case_navigation(source, slug, title):
    tree = Tree(source)
    links = [('overview', 'Overview')]
    if 'id="explore"' in source:
        links.append(('explore', 'Interactive'))
    if 'id="details"' in source:
        links.append(('details', 'Details'))
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


def make_case(path, slug=None, source=None):
    slug = slug or path.parent.relative_to(ROOT / 'projects').as_posix()
    source = source if source is not None else path.read_text(encoding='utf-8')
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
    copy_intro = re.sub(r'<p class="eyebrow"[^>]*>.*?</p>', '', copy_intro, flags=re.S)
    cad_assets = {
        'tramtrace': ('tramtrace-cad.webp', 'Source-derived KiCad rendering of the TramTrace light-rail display PCB'),
        'framework-expansion-card': ('framework-cad.webp', 'Source-derived CAD rendering of the populated Framework ESP32 card'),
    }
    hero_media = media.outer(source)
    if slug in cad_assets:
        asset, alt = cad_assets[slug]
        hero_media = f'<figure class="project-hero-media v2-cad-media"><img src="/assets/images/v2/{asset}" width="1600" height="1200" alt="{alt}" fetchpriority="high"></figure>'
    elif slug.startswith('skylabs'):
        board = 'ground' if slug.endswith('ground-station') else 'telemetry'
        width, height = (1376, 984) if board == 'telemetry' else (1400, 1000)
        hero_media = f'<figure class="project-hero-media v2-cad-media"><img src="/assets/images/interactive/skylabs/skylabs-{board}-turn-02.webp" width="{width}" height="{height}" alt="KiCad rendering of the assembled Skylabs {board} board" fetchpriority="high"></figure>'
    has_explorer = 'id="explore"' in source
    hero_actions = f'<div class="project-hero-actions"><a href="/v2/projects/{slug}/#explore">Explore the board <span aria-hidden="true">↗</span></a><a href="/v2/projects/{slug}/#details">Design details <span aria-hidden="true">↓</span></a></div>' if has_explorer else f'<div class="project-hero-actions"><a href="/v2/projects/{slug}/#details">Project details <span aria-hidden="true">↓</span></a></div>'
    new_hero = f'''<section class="project-hero" id="overview" aria-labelledby="{tree.find('h1').attrs['id']}">
    <div class="project-hero-grid"><div class="project-hero-copy"><div>{copy_intro}</div>{hero_actions}</div>{hero_media}</div>
    <div class="v2-case-specs shell">{meta.outer(source) if meta else ''}</div></section>'''
    changes = [(hero, new_hero)]
    old_next = tree.find('a', 'next-project')
    if old_next:
        changes.append((old_next, continuation(slug)))
    source = replace_nodes(source, changes)
    if not old_next:
        source = source.replace('</main>', continuation(slug) + '\n</main>', 1)
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


def make_pi_case():
    """The new card has a maintained content record rather than an original page."""
    fragment = (ROOT / 'scripts/content/framework-raspberry-pi.html').read_text(encoding='utf-8')
    fragment = fragment.replace('Raspberry Pi silicon, in a laptop expansion slot. A compact RP2354B controller board designed around the Framework card format.', 'An RP2354B microcontroller board designed for a Framework laptop expansion bay.')
    fragment = fragment.replace('A closer look.', 'RP2354B assembly').replace('A small board with a defined place.', 'Board layout').replace('Designed as an assembly.', 'Mechanical fit')
    fragment_tree = Tree(fragment)
    fragment = replace_nodes(fragment, [(node, '') for node in fragment_tree.nodes if node.has('engineering-brief') or node.has('pi-viewer-topline')])
    source = '''<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="/">
  <title>Raspberry Pi Expansion Card | Andrew Chung</title>
  <meta name="description" content="An RP2354B microcontroller board designed for the Framework expansion-card format. Explore the board and enclosure in 3D.">
  <meta name="theme-color" content="#f5f5f2">
  <meta property="og:type" content="website"><meta property="og:title" content="Raspberry Pi Expansion Card | Andrew Chung">
  <meta property="og:description" content="An RP2354B microcontroller board in the Framework expansion-card format.">
  <meta property="og:url" content="https://proccyboi.github.io/v2/projects/framework-raspberry-pi/">
  <meta property="og:image" content="https://proccyboi.github.io/assets/images/v2/framework-pi-cad.webp">
  <link rel="canonical" href="https://proccyboi.github.io/v2/projects/framework-raspberry-pi/">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/project-integrated.css">
  <link rel="stylesheet" href="/assets/v2-pi.css">
  <link rel="preload" as="image" href="/assets/images/v2/framework-pi-cad.webp" type="image/webp">
  <script src="/assets/site.js" defer></script>
  <script src="/assets/v2-pi.js" defer></script>
</head><body class="project-page v2-pi-page">
  <a class="skip-link" href="/v2/projects/framework-raspberry-pi/#main">Skip to content</a>
  <header class="site-header"></header>
  <main id="main">''' + fragment + '''
  </main><footer class="site-footer"></footer>
</body></html>'''
    return make_case(None, 'framework-raspberry-pi', source)


def make_index():
    source = (ROOT / 'projects/index.html').read_text(encoding='utf-8')
    tree = Tree(source)
    source = replace_nodes(source, [(node, '') for node in tree.nodes
        if node.tag == 'a' and node.has('catalog-card')
        and node.attrs.get('href', '').lstrip('/') == 'projects/coaster/'])
    tree = Tree(source)
    hero = tree.find('section', 'page-hero')
    new_hero = '''<section class="v2-collection-hero shell"><div><h1>Projects</h1><p>PCBs, embedded systems, robotics and engineering tools.</p></div></section>'''
    jump = tree.find('nav', 'project-jumpbar')
    controls = '''<div class="v2-collection-controls"><div class="shell"><nav class="v2-collection-categories" aria-label="Project categories"><a href="/v2/projects/#hardware" data-v2-category="all" aria-current="true">All work <span>15</span></a><a href="/v2/projects/#hardware" data-v2-category="hardware">Hardware <span>9</span></a><a href="/v2/projects/#interactive" data-v2-category="interactive">Tools <span>3</span></a><a href="/v2/projects/#robotics" data-v2-category="robotics">Robotics <span>1</span></a><a href="/v2/projects/#archive" data-v2-category="archive">Archive <span>2</span></a></nav><div class="v2-project-search" hidden data-v2-search-wrap><label for="v2-project-search">Find a project</label><input type="search" id="v2-project-search" placeholder="Search projects" autocomplete="off" data-v2-search></div></div></div><p class="v2-search-status shell" data-v2-search-status aria-live="polite" hidden></p>'''
    source = replace_nodes(source, [(hero, new_hero), (jump, controls)])
    hardware_catalog = Tree(source).find('div', 'project-catalog')
    pi_card = '''<a class="catalog-card v2-pi-card" href="projects/framework-raspberry-pi/">
      <div class="catalog-card-media v2-catalog-cad"><img src="/assets/images/v2/framework-pi-cad.webp" width="1600" height="1200" alt="Raspberry Pi RP2354B expansion card for a Framework laptop" loading="lazy"></div>
      <div class="catalog-card-copy"><div><span class="catalog-category">Framework / microcontroller</span><h3>Raspberry Pi Expansion Card</h3><p>An RP2354B microcontroller board in the Framework expansion-card format.</p><small>RP2354B · 26 × 30 mm</small></div><span aria-hidden="true">↗</span></div></a>'''
    source = source[:hardware_catalog.open_end] + '\n' + pi_card + source[hardware_catalog.open_end:]
    # Let the hardware occupy the full gallery area without thumbnail framing.
    tree = Tree(source)
    media_changes = []
    card_images = {
        'projects/tramtrace/': ('v2/tramtrace-cad.webp', 1600, 1200, 'TramTrace light-rail display PCB'),
        'projects/framework-expansion-card/': ('v2/framework-cad.webp', 1600, 1200, 'Framework ESP32 expansion card'),
        'projects/skylabs/': ('interactive/skylabs/skylabs-telemetry-turn-02.webp', 1376, 984, 'Skylabs aircraft telemetry PCB'),
    }
    for node in tree.nodes:
        if node.has('catalog-card-media') and node.parent and node.parent.attrs.get('href') in card_images:
            filename, width, height, alt = card_images[node.parent.attrs['href']]
            media_changes.append((node, f'<div class="catalog-card-media v2-catalog-cad"><img src="/assets/images/{filename}" width="{width}" height="{height}" alt="{alt}" loading="lazy"></div>'))
    source = replace_nodes(source, media_changes)
    source = re.sub(r'<p class="eyebrow">0[1-4] / (?:Hardware|Tools|Robotics|Archive)</p>', '', source)
    source = source.replace('Boards and systems', 'Hardware').replace('Software meets hardware', 'Robotics').replace('Earlier builds', 'Earlier projects')
    source = source.replace('207.81 × 94.55 mm &middot; Interactive PCB + copper', '207.81 × 94.55 mm &middot; 116 RGB pixels')
    source = source.replace('Two boards &middot; Interactive boards', 'STM32 + ESP32 &middot; LoRa telemetry')
    source = source.replace('CH334F &middot; Interactive 3D assembly', 'CH334F &middot; USB 2.0')
    source = source.replace('ESP32-S3-MINI-1 &middot; Interactive 3D assembly', 'ESP32-S3-MINI-1 &middot; 0.6 mm PCB')
    source = source.replace('id="hardware"', 'id="hardware" data-v2-project-group="hardware"', 1).replace('id="interactive"', 'id="interactive" data-v2-project-group="interactive"', 1).replace('id="robotics"', 'id="robotics" data-v2-project-group="robotics"', 1).replace('id="archive"', 'id="archive" data-v2-project-group="archive"', 1)
    source = re.sub(r'(<a class="(?:catalog-card|project-list-row)[^"]*")', r'\1 data-v2-project', source)
    source = source.replace('href="shared/flight-review/"', 'href="/shared/flight-review/"')
    source = source.replace('<small>Skylabs / browser tool</small>', '<small>Part of Skylabs / browser tool ↗</small>')
    source = source.replace('class="catalog-card wide"', 'class="catalog-card wide v2-featured-card"', 2)
    source = source.replace('class="project-list tool-list"', 'class="project-list tool-list v2-related-tool"')
    return common(source, 'v2-collection')


def make_about():
    source = (ROOT / 'about/index.html').read_text(encoding='utf-8')
    source = source.replace('Andrew Chung / background', 'Electrical engineering · Sydney')
    source = source.replace('Engineering, in practice.', 'Andrew Chung')
    source = source.replace('My projects cover PCB design, embedded software, telemetry and robotics.', 'I work across the boundary between hardware and software: from a schematic and PCB layout to the firmware, measurements and interface that make a system useful.')
    source = source.replace('<p class="eyebrow">Contact sheet</p>', '')
    source = source.replace('Let&rsquo;s talk hardware.', 'Contact')
    source = source.replace('<h2 id="experience-title">Experience</h2>', '<div class="v2-about-section-label"><h2 id="experience-title">Experience</h2></div>')
    source = source.replace('<h2 id="education-title">Education</h2>', '<div class="v2-about-section-label"><h2 id="education-title">Education</h2></div>')
    source = source.replace('<h2 id="tools-title">Tools</h2>', '<div class="v2-about-section-label"><h2 id="tools-title">Tools</h2></div>')
    source = source.replace('<h2 id="other-title">Awards and music</h2>', '<div class="v2-about-section-label"><h2 id="other-title">Awards &amp; music</h2></div>')
    source = source.replace('</figure>', '<figcaption>Skylabs aircraft telemetry / component detail</figcaption></figure>', 1)
    source = source.replace('Download my CV', 'View CV ↗')
    source = source.replace('I’m Andrew. I study', 'I study')
    return common(source, 'v2-about', 'about')


def normalized(content):
    return '\n'.join(line.rstrip() for line in content.splitlines()).rstrip() + '\n'


def main():
    generated = []
    for path in sorted((ROOT / 'projects').rglob('index.html')):
        if path.parent == ROOT / 'projects':
            continue
        # Coaster is maintained separately on the original site.
        if path.relative_to(ROOT / 'projects').parts[0] == 'coaster':
            continue
        output = ROOT / 'v2' / path.relative_to(ROOT)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(normalized(make_case(path)), encoding='utf-8')
        generated.append(output.relative_to(ROOT))
    for relative, content in [('projects/framework-raspberry-pi/index.html', make_pi_case()), ('projects/index.html', make_index()), ('about/index.html', make_about())]:
        output = ROOT / 'v2' / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(normalized(content), encoding='utf-8')
        generated.append(output.relative_to(ROOT))
    print('Generated', len(generated), 'v2 pages:')
    print('\n'.join(str(path) for path in generated))


if __name__ == '__main__':
    main()
