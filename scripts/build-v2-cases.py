"""Build the v2 editorial pages from the existing, factual project records.

Only the Python standard library is needed. The original portfolio and shared
applications remain the sources of truth; generated pages keep their interactive
modules and media while using an independent navigation and design layer.
"""
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
HARDWARE_CATALOG = json.loads((ROOT / 'scripts/content/hardware-catalog.json').read_text(encoding='utf-8'))
HARDWARE_PROJECTS = HARDWARE_CATALOG['projects']
HARDWARE_PROJECT_BY_SLUG = {record['slug']: record for record in HARDWARE_PROJECTS}
HARDWARE_ASSEMBLIES = {record['route']: record for record in HARDWARE_CATALOG['assemblies']}
SKYLABS_BOARDS = json.loads((ROOT / 'scripts/content/skylabs-components.json').read_text(encoding='utf-8'))
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
ORDER.insert(1, 'coaster')
LABELS['coaster'] = 'RGB Drink Coaster'
for record in HARDWARE_PROJECTS:
    ORDER.insert(ORDER.index('switch-mode-power-supplies'), record['slug'])
    LABELS[record['slug']] = record['title']
TOOL_ROUTES = {'scopelab', 'lithography-animation', 'mosfet-operating-regions'}
PROJECT_ORDER = [slug for slug in ORDER if slug not in TOOL_ROUTES]
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
    source = re.sub(r'(<meta name="theme-color" content=")[^"]*(">)', r'\g<1>#090b0d\2', source)
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
    if 'data-hardware=' in source:
        source = source.replace('</head>', '<link rel="stylesheet" href="/assets/v2-hardware.css">\n<script src="/assets/v2-hardware.js" defer></script>\n</head>')
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
        if node.tag == 'p' and node.parent and node.parent.has('project-interactive-header') and 'The enclosure halves come from the supplied STEP files' in node.inner(source):
            changes.append((node, '<p>Rotate the board and resin enclosure, or place a cup to see how the light and temperature sensors drive the 24 RGB LEDs. The drink controls simulate the sensor response.</p>'))
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
        'Inside the RGB coaster.': 'Coaster assembly',
        'Source-derived board surfaces': 'Board, lid and base',
        'Black mask and source artwork': 'Black mask and HALO artwork',
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
        links.append(('explore', 'Assembly' if 'data-skylabs-inspector' in source else 'Interactive'))
    if 'id="assembly"' in source and 'data-skylabs-inspector' not in source:
        links.append(('assembly', 'Assembly'))
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
    if slug in TOOL_ROUTES:
        return '<nav class="v2-continue shell" aria-label="Portfolio"><a class="v2-all-work" href="/v2/projects/">View projects <span aria-hidden="true">↗</span></a></nav>'
    if slug == 'skylabs/boards/telemetry':
        prev, nxt = 'skylabs', 'skylabs/boards/ground-station'
    elif slug == 'skylabs/boards/ground-station':
        prev, nxt = 'skylabs/boards/telemetry', 'skylabs'
    else:
        index = PROJECT_ORDER.index(slug)
        prev, nxt = PROJECT_ORDER[(index - 1) % len(PROJECT_ORDER)], PROJECT_ORDER[(index + 1) % len(PROJECT_ORDER)]
    labels = {**LABELS, 'skylabs/boards/telemetry': 'Aircraft telemetry', 'skylabs/boards/ground-station': 'Ground station'}
    return f'''<nav class="v2-continue shell" aria-label="More project stories"><p class="eyebrow">Continue exploring</p><div>
      <a href="/v2/projects/{prev}/"><span>← Previous case study</span><strong>{escape(labels[prev])}</strong></a>
      <a href="/v2/projects/{nxt}/"><span>Next case study →</span><strong>{escape(labels[nxt])}</strong></a>
    </div><a class="v2-all-work" href="/v2/projects/">View the complete collection <span aria-hidden="true">↗</span></a></nav>'''


def hardware_viewer(model, title, identifier, manifest=None, poster=None):
    title = escape(title)
    manifest = manifest or f'/assets/models/hardware/{model}/assembly.json'
    poster = poster or f'/assets/images/v2/hardware/{model}.webp'
    return f'''<figure data-hardware="{manifest}" data-hardware-title="{title}">
      <div class="hardware-stage" data-hardware-stage><img data-hardware-poster src="{poster}" width="1600" height="1200" alt="{title}" loading="lazy"><canvas data-hardware-canvas hidden></canvas></div>
      <div class="hardware-start"><button type="button" data-hardware-start>Explore in 3D ↗</button></div>
      <div class="hardware-controls"><div class="hardware-views" role="group" aria-label="Camera"><button type="button" data-hardware-view="iso" aria-pressed="true">Perspective</button><button type="button" data-hardware-view="top" aria-pressed="false">Top</button><button type="button" data-hardware-view="bottom" aria-pressed="false">Underside</button></div><button type="button" data-hardware-explode aria-pressed="false">Explode</button><button type="button" data-hardware-scroll aria-pressed="false">Follow scroll</button><button type="button" data-hardware-reset>Reset</button><label class="hardware-range">Assembled <input data-hardware-range type="range" min="0" max="100" value="0" aria-label="Assembly separation"> Exploded</label></div>
      <div class="hardware-parts"><label for="{identifier}-parts">Component</label><select id="{identifier}-parts" data-hardware-selection><option value="">All components</option></select></div>
      <p data-hardware-part hidden></p><p data-hardware-status role="status" aria-live="polite"></p>
    </figure>'''


def hardware_section(model, title, identifier='explore', facts='', note=''):
    return f'''<section class="project-interactive v2-hardware-section" id="{identifier}" aria-labelledby="{identifier}-title"><div class="project-interactive-inner">
      <header class="project-interactive-header"><div><h2 id="{identifier}-title">{escape(title)}</h2></div><p>Rotate the board, select a component or separate the assembly.</p></header>
      {hardware_viewer(model, title, identifier)}
      {f'<p class="v2-hardware-note">{escape(note)}</p>' if note else ''}{facts}
    </div></section>'''


def skylabs_section(slug):
    selected = 'ground' if slug.endswith('ground-station') else 'telemetry'
    board = SKYLABS_BOARDS[selected]
    keys = list(SKYLABS_BOARDS) if slug == 'skylabs' else [selected]
    selector = ''
    if slug == 'skylabs':
        selector = '<nav class="hardware-boards" aria-label="Skylabs board">' + ''.join(
            f'<a href="/v2/projects/{record["route"]}/" data-hardware-board="{key}" data-hardware-model="/assets/models/hardware/{record["model"]}/assembly.json" data-hardware-poster-src="/assets/images/v2/hardware/{record["model"]}.webp" data-hardware-title="{escape(record["title"])}"{chr(32) + "aria-current=\"true\"" if key == selected else ""}>{escape(record["title"])}</a>'
            for key, record in SKYLABS_BOARDS.items()) + '</nav>'
    components = ''
    for key in keys:
        record = SKYLABS_BOARDS[key]
        items = ''.join(f'<details data-hardware-component data-hardware-refs="{escape(" ".join(part["refs"]))}"><summary><span>{escape(" / ".join(part["refs"]))}</span><strong>{escape(part["name"])}</strong></summary><p>{escape(part["description"])}</p></details>' for part in record['components'])
        components += f'<section class="hardware-components" data-hardware-components="{key}" aria-labelledby="components-{key}"><h3 id="components-{key}">{escape(record["title"])} components</h3><div>{items}</div></section>'
    viewer = hardware_viewer(board['model'], board['title'], 'skylabs')
    viewer = viewer.replace('<figure ', f'<figure data-skylabs-inspector data-hardware-board-key="{selected}" ', 1)
    viewer = viewer.replace('>\n      <div class="hardware-stage"', '>\n' + selector + '\n      <div class="hardware-stage"', 1)
    viewer = viewer.replace('</figure>', components + '</figure>')
    return f'''<section class="project-interactive v2-hardware-section" id="explore" aria-labelledby="skylabs-assembly-title"><span id="assembly" class="v2-anchor-alias" aria-hidden="true"></span><div class="project-interactive-inner">
      <header class="project-interactive-header"><div><h2 id="skylabs-assembly-title">{'Flight hardware' if slug == 'skylabs' else escape(board['title'])}</h2></div><p>Rotate the board, select a component or separate the assembly.</p></header>
      {viewer}
    </div></section>'''


def integrate_skylabs(source, slug):
    tree = Tree(source)
    existing = tree.find('section', 'project-interactive')
    source = replace_nodes(source, [(existing, skylabs_section(slug))])
    tree = Tree(source)
    obsolete = {'assets/skylabs-object.js', 'assets/skylabs-object.css'}
    source = replace_nodes(source, [(node, '') for node in tree.nodes if node.tag in ('script', 'link') and (node.attrs.get('src') or node.attrs.get('href', '')).split('?')[0].lstrip('/') in obsolete])
    source = re.sub(r' data-object-(?:inspector|live)| data-(?:view|board|annotations)="[^"]*"', '', source)
    source = source.replace(' class="object-main"', '')
    return source


def integrate_hardware(source, slug):
    if slug == 'skylabs' or slug.startswith('skylabs/boards/'):
        return integrate_skylabs(source, slug)
    record = HARDWARE_ASSEMBLIES.get(slug)
    if not record:
        return source
    tree = Tree(source)
    existing = tree.find('section', 'project-interactive')
    identifier = 'assembly' if existing and record['mode'] == 'add' else 'explore'
    facts = ''
    if record['mode'] == 'replace' and existing:
        existing_tree = Tree(existing.outer(source))
        existing_facts = existing_tree.find('dl', 'project-interactive-facts')
        facts = existing_facts.outer(existing.outer(source)) if existing_facts else ''
    section = hardware_section(record['model'], record['title'], identifier, facts, record.get('note', ''))
    if record['mode'] == 'replace' and existing:
        source = replace_nodes(source, [(existing, section)])
    else:
        body = tree.find('div', 'project-body')
        source = source[:body.start] + section + '\n' + source[body.start:]
    tree = Tree(source)
    obsolete_scripts = set(record.get('remove_scripts', []))
    source = replace_nodes(source, [(node, '') for node in tree.nodes if node.tag == 'script' and node.attrs.get('src', '').split('?')[0].lstrip('/') in obsolete_scripts])
    return source


def make_case(path, slug=None, source=None):
    slug = slug or path.parent.relative_to(ROOT / 'projects').as_posix()
    source = source if source is not None else path.read_text(encoding='utf-8')
    source = integrate_hardware(source, slug)
    if slug == 'skylabs/flight-review':
        return source
    if slug in ('lithography-animation', 'mosfet-operating-regions'):
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
        'skylabs': ('hardware/skylabs-telemetry.webp', 'Skylabs aircraft telemetry circuit board'),
    }
    if slug in HARDWARE_ASSEMBLIES:
        model = HARDWARE_ASSEMBLIES[slug]['model']
        cad_assets[slug] = (f'hardware/{model}.webp', f'{title} circuit board assembly')
    hero_media = media.outer(source)
    if slug in cad_assets:
        asset, alt = cad_assets[slug]
        hero_media = f'<figure class="project-hero-media v2-cad-media"><img src="/assets/images/v2/{asset}" width="1600" height="1200" alt="{alt}" fetchpriority="high"></figure>'
    elif slug.startswith('skylabs'):
        board = 'ground' if slug.endswith('ground-station') else 'telemetry'
        width, height = (1376, 984) if board == 'telemetry' else (1400, 1000)
        hero_media = f'<figure class="project-hero-media v2-cad-media"><img src="/assets/images/interactive/skylabs/skylabs-{board}-turn-02.webp" width="{width}" height="{height}" alt="KiCad rendering of the assembled Skylabs {board} board" fetchpriority="high"></figure>'
    has_explorer = 'id="explore"' in source
    explore_anchor = 'assembly' if 'id="assembly"' in source and 'data-skylabs-inspector' not in source else 'explore'
    explore_label = escape(HARDWARE_PROJECT_BY_SLUG.get(slug, {}).get('explore_label', 'Explore the assembly' if explore_anchor == 'assembly' else 'Explore the board'))
    hero_actions = f'<div class="project-hero-actions"><a href="/v2/projects/{slug}/#{explore_anchor}">{explore_label} <span aria-hidden="true">↗</span></a><a href="/v2/projects/{slug}/#details">Design details <span aria-hidden="true">↓</span></a></div>' if has_explorer else f'<div class="project-hero-actions"><a href="/v2/projects/{slug}/#details">Project details <span aria-hidden="true">↓</span></a></div>'
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
  <meta name="theme-color" content="#090b0d">
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


def make_hardware_case(record):
    slug, title = record['slug'], escape(record['title'])
    poster = record.get('hero_poster', f'/assets/images/v2/hardware/{record["model"]}.webp')
    metadata = ''.join(f'<div><dt>{escape(label)}</dt><dd>{escape(value)}</dd></div>' for label, value in record['metadata'])
    if record.get('models'):
        viewers = ''.join(f'<div class="v2-hardware-cover"><h3>{escape(model["title"])}</h3>{hardware_viewer(model["slug"], record["title"] + " — " + model["title"], model["slug"], model.get("manifest"), model.get("poster"))}</div>' for model in record['models'])
        explorer = f'<section class="project-interactive v2-hardware-section" id="explore" aria-labelledby="explore-title"><div class="project-interactive-inner"><header class="project-interactive-header"><div><h2 id="explore-title">{escape(record.get("viewer_title", "Assembly"))}</h2></div><p>{escape(record.get("viewer_intro", "Rotate the assembly or separate its parts."))}</p></header>{viewers}</div></section>'
    else:
        explorer = hardware_section(record['model'], record['title'] + ' assembly', note=record.get('viewer_note', ''))
    sections = ''.join(f'<section class="project-summary"><h2>{escape(section["title"])}</h2><div class="project-prose">' + ''.join(f'<p>{escape(paragraph)}</p>' for paragraph in section['paragraphs']) + '</div></section>' for section in record['sections'])
    attribution = record.get('attribution')
    if attribution:
        sections += f'<p class="v2-hardware-credit">Based on the <a href="{escape(attribution["url"])}">{escape(attribution["name"])}</a> template, licensed under <a href="{escape(attribution["license_url"])}">{escape(attribution["license"])}</a>.</p>'
    source = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="/">
  <title>{title} | Andrew Chung</title><meta name="description" content="{escape(record['summary'])}"><meta name="theme-color" content="#090b0d">
  <meta property="og:type" content="website"><meta property="og:title" content="{title} | Andrew Chung"><meta property="og:description" content="{escape(record['summary'])}">
  <meta property="og:url" content="https://proccyboi.github.io/v2/projects/{slug}/"><meta property="og:image" content="https://proccyboi.github.io{poster}">
  <link rel="canonical" href="https://proccyboi.github.io/v2/projects/{slug}/"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/project-integrated.css">
  <link rel="preload" as="image" href="{poster}" type="image/webp">
</head><body class="project-page v2-hardware-page"><a class="skip-link" href="/v2/projects/{slug}/#main">Skip to content</a><header class="site-header"></header><main id="main">
  <section class="project-hero" id="overview" aria-labelledby="project-title"><div class="project-hero-grid"><div class="project-hero-copy"><div><h1 id="project-title">{title}</h1><p>{escape(record['summary'])}</p></div><dl class="project-meta">{metadata}</dl></div><figure class="project-hero-media v2-cad-media"><img src="{poster}" width="1600" height="1200" alt="{title}" fetchpriority="high"></figure></div></section>
  {explorer}<div class="project-body shell" id="details">{sections}</div>
</main><footer class="site-footer"></footer></body></html>'''
    return make_case(None, slug, source)


def hardware_card(record):
    poster = record.get('hero_poster', f'/assets/images/v2/hardware/{record["model"]}.webp')
    return f'''<a class="catalog-card" href="projects/{record['slug']}/"><div class="catalog-card-media v2-catalog-cad"><img src="{poster}" width="1600" height="1200" alt="{escape(record['title'])}" loading="lazy"></div><div class="catalog-card-copy"><div><span class="catalog-category">{escape(record['category'])}</span><h3>{escape(record['title'])}</h3><p>{escape(record['summary'])}</p><small>{escape(record['card_specs'])}</small></div><span aria-hidden="true">↗</span></div></a>'''


def make_index():
    source = (ROOT / 'projects/index.html').read_text(encoding='utf-8')
    tree = Tree(source)
    tools = next(node for node in tree.nodes if node.tag == 'section' and node.attrs.get('id') == 'interactive')
    source = replace_nodes(source, [(tools, '')])
    tree = Tree(source)
    hero = tree.find('section', 'page-hero')
    new_hero = '''<section class="v2-collection-hero shell"><div><h1>Projects</h1><p>PCBs, embedded systems and robotics.</p></div></section>'''
    jump = tree.find('nav', 'project-jumpbar')
    controls = '''<div class="v2-collection-controls"><div class="shell"><nav class="v2-collection-categories" aria-label="Project categories"><a href="/v2/projects/#hardware" data-v2-category="all" aria-current="true">All work <span>15</span></a><a href="/v2/projects/#hardware" data-v2-category="hardware">Hardware <span>12</span></a><a href="/v2/projects/#robotics" data-v2-category="robotics">Robotics <span>1</span></a><a href="/v2/projects/#archive" data-v2-category="archive">Archive <span>2</span></a></nav><div class="v2-project-search" hidden data-v2-search-wrap><label for="v2-project-search">Find a project</label><input type="search" id="v2-project-search" placeholder="Search projects" autocomplete="off" data-v2-search></div></div></div><p class="v2-search-status shell" data-v2-search-status aria-live="polite" hidden></p>'''
    source = replace_nodes(source, [(hero, new_hero), (jump, controls)])
    hardware_catalog = Tree(source).find('div', 'project-catalog')
    pi_card = '''<a class="catalog-card v2-pi-card" href="projects/framework-raspberry-pi/">
      <div class="catalog-card-media v2-catalog-cad"><img src="/assets/images/v2/framework-pi-cad.webp" width="1600" height="1200" alt="Raspberry Pi RP2354B expansion card for a Framework laptop" loading="lazy"></div>
      <div class="catalog-card-copy"><div><span class="catalog-category">Framework / microcontroller</span><h3>Raspberry Pi Expansion Card</h3><p>An RP2354B microcontroller board in the Framework expansion-card format.</p><small>RP2354B · 26 × 30 mm</small></div><span aria-hidden="true">↗</span></div></a>'''
    source = source[:hardware_catalog.open_end] + '\n' + pi_card + source[hardware_catalog.open_end:]
    hardware_catalog = Tree(source).find('div', 'project-catalog')
    source = source[:hardware_catalog.close_start] + '\n' + '\n'.join(hardware_card(record) for record in HARDWARE_PROJECTS) + '\n' + source[hardware_catalog.close_start:]
    # Let the hardware occupy the full gallery area without thumbnail framing.
    tree = Tree(source)
    media_changes = []
    card_images = {
        'projects/tramtrace/': ('v2/tramtrace-cad.webp', 1600, 1200, 'TramTrace light-rail display PCB'),
        'projects/framework-expansion-card/': ('v2/framework-cad.webp', 1600, 1200, 'Framework ESP32 expansion card'),
        'projects/skylabs/': ('v2/hardware/skylabs-telemetry.webp', 1600, 1200, 'Skylabs aircraft telemetry PCB'),
    }
    for route, record in HARDWARE_ASSEMBLIES.items():
        if '/' not in route:
            card_images[f'projects/{route}/'] = (f'v2/hardware/{record["model"]}.webp', 1600, 1200, LABELS[route] + ' circuit board assembly')
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
    tree = Tree(source)
    counts = {name: 0 for name in ['all', 'hardware', 'interactive', 'robotics', 'archive']}
    for node in tree.nodes:
        if 'data-v2-project' not in node.attrs or not re.fullmatch(r'/?(?:v2/)?projects/[^/]+/', node.attrs.get('href', '')):
            continue
        ancestor = node.parent
        while ancestor and 'data-v2-project-group' not in ancestor.attrs:
            ancestor = ancestor.parent
        if ancestor:
            counts[ancestor.attrs['data-v2-project-group']] += 1
            counts['all'] += 1
    source = replace_nodes(source, [(node, re.sub(r'<span>\d+</span>', f'<span>{counts[node.attrs["data-v2-category"]]}</span>', node.outer(source))) for node in tree.nodes if 'data-v2-category' in node.attrs])
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


def update_sitemap(generated):
    path = ROOT / 'sitemap.xml'
    source = path.read_text(encoding='utf-8')
    urls = ['https://proccyboi.github.io/' + name.as_posix().removesuffix('index.html') for name in generated if name.as_posix() != 'v2/projects/skylabs/flight-review/index.html']
    source = re.sub(r'\s*<url>\s*<loc>(https://proccyboi\.github\.io/v2/projects/[^<]*)</loc>.*?</url>', lambda match: match[0] if match[1] in urls else '', source, flags=re.S)
    existing = {node.text for node in ET.fromstring(source).iter() if node.tag.rsplit('}', 1)[-1] == 'loc'}
    additions = [f'  <url><loc>{url}</loc></url>' for url in urls if url not in existing]
    if additions:
        source = source.replace('</urlset>', '\n'.join(additions) + '\n</urlset>')
    path.write_text(normalized(source), encoding='utf-8')


def main():
    generated = []
    for path in sorted((ROOT / 'projects').rglob('index.html')):
        if path.parent == ROOT / 'projects':
            continue
        output = ROOT / 'v2' / path.relative_to(ROOT)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(normalized(make_case(path)), encoding='utf-8')
        generated.append(output.relative_to(ROOT))
    new_pages = [(f'projects/{record["slug"]}/index.html', make_hardware_case(record)) for record in HARDWARE_PROJECTS]
    for relative, content in [('projects/framework-raspberry-pi/index.html', make_pi_case()), *new_pages, ('projects/index.html', make_index()), ('about/index.html', make_about())]:
        output = ROOT / 'v2' / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(normalized(content), encoding='utf-8')
        generated.append(output.relative_to(ROOT))
    update_sitemap(generated)
    print('Generated', len(generated), 'v2 pages:')
    print('\n'.join(str(path) for path in generated))


if __name__ == '__main__':
    main()
