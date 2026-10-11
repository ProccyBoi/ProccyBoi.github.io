"""Build v3 interior pages from the public v2 content and working viewers.

The v3 home page is authored separately. This generator changes navigation and
the presentation layer; model assets, viewer hooks and simulation code retain
their existing sources. Run with --check to verify generated files are current.
Only the Python standard library is required.
"""
from argparse import ArgumentParser
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "v2"
DESTINATION = ROOT / "v3"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
ROUTE_PREFIX = re.compile(r"^(https://proccyboi\.github\.io)?/v2/")
PRESENTATION = '''  <script src="/assets/v3.js?v=dark-cases-20261011" defer></script>
  <link rel="stylesheet" href="/assets/v3-evidence.css?v=dark-cases-20261011">
  <link rel="stylesheet" href="/assets/v3.css?v=dark-cases-20261011">
'''
EVIDENCE = json.loads((ROOT / "scripts/content/v3-case-evidence.json").read_text(encoding="utf-8"))
TRAMTRACE_SCRIPTS = (
    "assets/tramtrace-board-data.js",
    "assets/tramtrace-component-data.js",
    "assets/tramtrace-inspector.js?v=20260824b",
)
UTILITY_LINKS = (
    ("Files", "/shared/"),
    ("Book", "/book/"),
    ("CV", "/assets/documents/Andrew_Chung_Public_CV.pdf"),
)


class Element:
    def __init__(self, tag, attrs, start, open_end):
        self.tag, self.attrs = tag, dict(attrs)
        self.start, self.open_end = start, open_end
        self.close_start = self.end = open_end

    def has_class(self, name):
        return name in self.attrs.get("class", "").split()


class Document(HTMLParser):
    """Record spans so unrelated HTML, inline tools and JSON remain untouched."""

    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0] + [match.end() for match in re.finditer("\n", source)]
        self.elements, self.stack = [], []
        self.feed(source)

    def position(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        start = self.position()
        element = Element(tag, attrs, start, start + len(self.get_starttag_text()))
        self.elements.append(element)
        if tag not in VOID:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            element = self.stack[index]
            if element.tag == tag:
                element.close_start = self.position()
                element.end = self.source.index(">", element.close_start) + 1
                self.stack = self.stack[:index]
                return


def attribute(tag, name, value):
    pattern = re.compile(r"(?<![\w:-])" + re.escape(name) + r"\s*=\s*([\"'])(.*?)\1", re.I | re.S)
    replacement = f'{name}="{escape(value, quote=True)}"'
    if pattern.search(tag):
        return pattern.sub(lambda _: replacement, tag, count=1)
    return tag[:-1] + " " + replacement + ">"


def route(value):
    return ROUTE_PREFIX.sub(lambda match: (match[1] or "") + "/v3/", value)


def normalized(source):
    return "\n".join(line.rstrip() for line in source.splitlines()).rstrip() + "\n"


def utility_navigation():
    return "".join(f'<a href="{escape(href, quote=True)}"' +
                   (' aria-label="Public CV (PDF)"' if label == "CV" else "") +
                   f'>{escape(label)}</a>' for label, href in UTILITY_LINKS)


def evidence_section(record):
    """Keep substantive constraints and limits in a readable project narrative."""
    links = "".join(
        f'<a href="{escape(link["href"], quote=True)}">{escape(link["label"])} <span aria-hidden="true">↗</span></a>'
        for link in record["links"]
    )
    disclosure = f'<p class="v3-evidence-disclosure">{escape(record["disclosure"])}</p>' if record.get("disclosure") else ""
    detail = ""
    if record["title"] == "The map is also the circuit board":
        detail = '''<figure class="v3-design-photo"><a href="/v3/projects/tramtrace/#build" aria-label="See full-size TramTrace controller photographs"><picture><source type="image/webp" srcset="/assets/images/projects/tramtrace-controller-960.webp 960w, /assets/images/projects/tramtrace-controller-1920.webp 1920w" sizes="(max-width: 800px) 100vw, 52vw"><img src="/assets/images/projects/tramtrace-controller-1920.jpg" width="1920" height="1280" alt="ESP32 module, CH340C USB interface and level-shifting circuitry on the assembled TramTrace board" loading="lazy"></picture></a><figcaption><span>Controller detail</span><span>ESP32 · USB · Level shifting</span></figcaption></figure>'''
    return f'''
    <section class="v3-evidence shell{' v3-design-illustrated' if detail else ''}" id="engineering" aria-labelledby="v3-evidence-title">
      <header class="v3-evidence-heading"><p>Inside the design</p><h2 id="v3-evidence-title">{escape(record["title"])}</h2></header>
      {detail}
      <div class="v3-design-copy"><p>{escape(record["constraint"])}</p><p>{escape(record["decision"])}</p>
        <div class="v3-evidence-links">{links}</div>{disclosure}
      </div>
      <div class="v3-build-result"><p>{escape(record["test"])}</p><p>{escape(record["limit"])}</p></div>
    </section>
'''


def photograph(hero):
    source = hero["src"]
    stem = source.removesuffix("-1920.jpg")
    responsive = source.endswith("-1920.jpg") and (ROOT / (stem.lstrip("/") + "-960.webp")).is_file()
    sizes = '(max-width: 900px) 100vw, 58vw'
    webp = f'<source type="image/webp" srcset="{stem}-960.webp 960w, {stem}-1920.webp 1920w" sizes="{sizes}">' if responsive else ""
    return (f'<figure class="project-hero-media v3-case-photograph"><picture>{webp}'
            f'<img src="{escape(source, quote=True)}" width="{hero["width"]}" height="{hero["height"]}" '
            f'alt="{escape(hero["alt"], quote=True)}" fetchpriority="high"></picture></figure>')


def validate_evidence():
    """Keep the source ledger tied to actual public pages and stable fragments."""
    documents = {}
    for relative, record in EVIDENCE.items():
        if not (SOURCE / relative).is_file():
            raise ValueError(f"Evidence has no case-study source: {relative}")
        for key in ["title", "role", "constraint", "decision", "test", "limit", "sources", "links"]:
            if not record.get(key):
                raise ValueError(f"Evidence is missing {key}: {relative}")
        for reference in record["sources"]:
            url = urlsplit(reference)
            path = ROOT / url.path.lstrip("/")
            if url.path.endswith("/"):
                path /= "index.html"
            if not path.is_file():
                raise ValueError(f"Evidence source does not exist: {reference}")
            if url.fragment:
                if path not in documents:
                    documents[path] = Document(path.read_text(encoding="utf-8"))
                if not any(node.attrs.get("id") == url.fragment for node in documents[path].elements):
                    raise ValueError(f"Evidence source fragment does not exist: {reference}")


def tramtrace_workbench_source():
    """Import only the complete 2D workbench, never the root's 3D viewer."""
    source = (ROOT / "projects/tramtrace/index.html").read_text(encoding="utf-8")
    document = Document(source)
    workbenches = [node for node in document.elements if node.has_class("inspector-workbench")]
    if len(workbenches) != 1:
        raise ValueError("Expected one canonical TramTrace inspector workbench")
    node = workbenches[0]
    return source[node.start:node.end]


def tramtrace_workbench():
    return '''
    <section class="project-interactive v3-tramtrace-workbench inspector-main" id="copper-data" aria-labelledby="v3-copper-data-title" data-board-inspector data-mode="assembled" data-view="inspect" data-chain="l1" data-hotspots="visible">
      <div class="project-interactive-inner">
        <header class="project-interactive-header"><div><h2 id="v3-copper-data-title">Copper and LED data</h2></div><p>Inspect the production-board copper, identify a component or follow one frame through any of the five LED chains. The layers and electrical order come from the same KiCad source as the board above.</p></header>
''' + tramtrace_workbench_source() + '''
        <p class="v3-tramtrace-note">Frame playback is slowed for inspection. Wire time is calculated from 24 bits per pixel at 800 kbit/s; it is not a measurement of live vehicle-update latency.</p>
        <noscript><p class="inspector-noscript">The assembled board image remains visible. Enable JavaScript to inspect copper layers, select components and step through a data frame.</p></noscript>
      </div>
    </section>
'''


def validate_tramtrace_import(source):
    """Exact markup parity preserves root hooks, IDs, controls and 2D fallback."""
    document = Document(source)
    imported = [node for node in document.elements if node.has_class("inspector-workbench")]
    if len(imported) != 1 or normalized(source[imported[0].start:imported[0].end]) != normalized(tramtrace_workbench_source()):
        raise ValueError("The v3 TramTrace workbench must match the canonical root workbench")
    if len([node for node in document.elements if "data-pcb-object" in node.attrs]) != 1:
        raise ValueError("TramTrace must retain exactly one original 3D assembly")
    if any(node.tag == "main" and node.has_class("inspector-main") for node in document.elements):
        raise ValueError("TramTrace inspector mode CSS must be scoped to its 2D wrapper")


def build(relative):
    source = (SOURCE / relative).read_text(encoding="utf-8")
    # V2's new assessment notes/navigation are independent of the accepted v3
    # editorial records. Exclude explicitly scoped additions before rewriting.
    for node in reversed([node for node in Document(source).elements if "data-v2-engineering-evidence" in node.attrs or "data-v2-only" in node.attrs]):
        start = node.start - 1 if ("data-v2-engineering-evidence" in node.attrs or "data-v2-added-block" in node.attrs) and source[node.start-1:node.start] == "\n" else node.start
        source = source[:start] + source[node.end:]
    if relative.as_posix() == "about/index.html":
        source = source.replace('class="button button-primary" href="/v2/book/"', 'class="button button-primary" href="book/"')
    source = source.replace("<dd>40 Hz target · binary log</dd>", "<dd>40 Hz binary</dd>")
    source = source.replace('v2-case.css?v=review-20261012', 'v2-case.css?v=physical-20261007')
    document = Document(source)
    edits = []
    has_footer = False
    record = EVIDENCE.get(relative.as_posix())
    is_tramtrace = relative.as_posix() == "projects/tramtrace/index.html"
    counterpart = "/v2/" + relative.as_posix().removesuffix("index.html")
    comparison = f'<a class="v3-version-link" href="{counterpart}" aria-label="View this page in v2">v2</a>'

    for element in document.elements:
        original = source[element.start:element.open_end]
        updated = original
        attrs = element.attrs
        asset = attrs.get("src", attrs.get("href", "")).split("?", 1)[0].lstrip("/")
        if record and element.has_class("engineering-brief"):
            # Replace the short inherited brief, rather than repeating it.
            edits.append((element.start, element.end, ""))
            continue
        if record and record.get("hero") and element.has_class("project-hero-media"):
            edits.append((element.start, element.end, photograph(record["hero"])))
            continue
        if record and record.get("hero") and element.tag == "link" and attrs.get("rel") == "preload" and attrs.get("as") == "image":
            # A photograph should not race an unused hero CAD poster to load.
            edits.append((element.start, element.end, ""))
            continue
        if (element.tag == "script" and asset == "assets/v2-motion.js") or (element.tag == "link" and asset == "assets/v2-motion.css"):
            edits.append((element.start, element.end, ""))
            continue
        if "href" in attrs:
            updated = attribute(updated, "href", route(attrs["href"])) if route(attrs["href"]) != attrs["href"] else updated
        if element.tag == "meta" and attrs.get("property") == "og:url":
            updated = attribute(updated, "content", route(attrs.get("content", "")))
        if element.tag == "meta" and attrs.get("name") == "theme-color":
            updated = attribute(updated, "content", "#141412")
        if element.tag == "body":
            classes = attrs.get("class", "").split()
            classes.extend(name for name in ["v3", "v3-interior"] if name not in classes)
            updated = attribute(updated, "class", " ".join(classes))
        if is_tramtrace and element.tag == "main" and element.has_class("inspector-main"):
            # Mode selectors must not also match an unconfigured outer ancestor.
            classes = [name for name in attrs.get("class", "").split() if name != "inspector-main"]
            updated = attribute(updated, "class", " ".join(classes))
        if element.has_class("v2-footer-links"):
            edits.append((element.close_start, element.close_start, utility_navigation() + comparison))
            has_footer = True
        if element.has_class("v2-nav-contact"):
            edits.append((element.start, element.start, utility_navigation()))
        if record and element.has_class("project-hero"):
            edits.append((element.end, element.end, evidence_section(record)))
        if record and element.tag == "a" and "data-v2-section" in attrs and attrs.get("href", "").endswith("#overview"):
            href = route(attrs["href"]).removesuffix("#overview") + "#engineering"
            edits.append((element.end, element.end, f'<a href="{href}" data-v2-section>Engineering</a>'))
        if is_tramtrace and element.attrs.get("id") == "explore":
            edits.append((element.end, element.end, tramtrace_workbench()))
        if is_tramtrace and element.tag == "a" and "data-v2-section" in attrs and attrs.get("href", "").endswith("#explore"):
            edits.append((element.end, element.end, '<a href="/v3/projects/tramtrace/#copper-data" data-v2-section>Copper &amp; data</a>'))
        if element.tag == "head":
            extra = PRESENTATION
            if is_tramtrace:
                extra = "".join(f'  <script src="{asset}" defer></script>\n' for asset in TRAMTRACE_SCRIPTS) + extra
            # Redirects retain their shared application's canonical target.
            if not any(node.tag == "meta" and node.attrs.get("name") == "theme-color" for node in document.elements):
                extra = '  <meta name="theme-color" content="#141412">\n' + extra
            edits.append((element.close_start, element.close_start, extra))
        if updated != original:
            edits.append((element.start, element.open_end, updated))

    if not has_footer:
        body = next(element for element in document.elements if element.tag == "body")
        edits.append((body.close_start, body.close_start, f'<footer class="v2-footer"><div class="v2-shell"><div class="v2-footer-links">{utility_navigation()}{comparison}</div></div></footer>\n'))
    for start, end, replacement in sorted(edits, reverse=True):
        source = source[:start] + replacement + source[end:]

    if relative.as_posix() == "projects/framework-raspberry-pi/index.html":
        source = source.replace("<p>Turn the card, separate the layers, and follow the components that make it work.</p>", "")
        source = source.replace("<p>Component height and connector position matter as much as the copper layout. The interactive view brings the board and reference housing together, then separates the parts to make the arrangement easier to read.</p>", "")
    if relative.as_posix() == "projects/skylabs/index.html":
        source = source.replace('<a class="button" href="/v3/projects/skylabs/#explore">Explore both boards</a>', "")
        source = source.replace("Aircraft and ground hardware targeting 40 Hz onboard logging,", "Aircraft and ground hardware for 40 Hz onboard logging,")
        source = source.replace("Aircraft and ground hardware for 40 Hz onboard logging, live 915 MHz telemetry and post-flight replay.",
                                "Aircraft and ground hardware for onboard logging, live 915 MHz telemetry and post-flight replay.")
        source = source.replace("scheduled at 40 Hz", "with a 40 Hz target")
        source = source.replace("STM32G474 sensor acquisition, 40 Hz binary logging", "STM32G474 sensor acquisition, a 40 Hz binary logging target")
    if relative.as_posix() == "projects/skylabs/boards/telemetry/index.html":
        source = source.replace("<dd>40 Hz binary</dd>", "<dd>40 Hz target / binary</dd>")
    if is_tramtrace:
        source = source.replace('<a class="button button-primary" href="/v3/projects/tramtrace/#explore">Inspect the PCB</a>',
                                '<a class="button button-primary" href="/v3/projects/tramtrace/#copper-data">Inspect copper and LED data order ↓</a>')
        validate_tramtrace_import(source)
    return normalized(dark_interiors(source, relative))



# Editorial opening copy is drawn from each maintained case study. CAD-only
# projects are labelled as designs rather than presented as tested hardware.
CASE_OPENINGS = {
    'tramtrace': ('PCB + firmware', 'I designed the PCB, display firmware and vehicle-position service behind this 116-pixel light-rail map.', 'Assembled board · Rev 1.0'),
    'skylabs': ('Avionics + telemetry', 'I developed the STM32 aircraft logger, ESP32 LoRa ground station and post-flight replay tools.', 'Aircraft telemetry · Assembled PCB'),
    'skylabs/boards/telemetry': ('Avionics + firmware', 'My work covers the STM32G474 aircraft PCB, sensor acquisition, binary logging and aircraft-side SX1262 link.', 'Aircraft telemetry · Component side'),
    'skylabs/boards/ground-station': ('Radio + field tools', 'I designed the ESP32 receiver board around the SX1262 radio, local logging and field controls.', 'Ground station · Assembled PCB'),
    'framework-dual-usb': ('USB + PCB design', 'I designed a two-port USB hub PCB to fit the standard Framework expansion-card enclosure.', 'Assembled card · Clear enclosure'),
    'framework-expansion-card': ('Embedded + mechanical integration', 'I integrated USB serial, power and automatic boot/reset circuitry around an ESP32-S3 module in a Framework bay.', 'Assembled card · Black PCB revision'),
    'framework-raspberry-pi': ('Microcontroller + PCB design', 'My 26 × 30 mm RP2354B board fits around the USB-C plug and reference enclosure. This is a CAD design, not an electrically tested card.', 'RP2354B board · CAD assembly'),
    'coaster': ('Sensors + embedded firmware', 'I designed the 80 mm PCB, integrated the resin enclosure and wrote the STM32 firmware for cup sensing and RGB lighting.', '24-pixel coaster · USB-C power'),
    'metroboard': ('PCB + live data', 'I designed the Sydney rail-map PCB and a service that sends TfNSW vehicle positions to its 291 RGB pixels.', 'Assembled board · Illuminated network'),
    'rf-test-board': ('RF + measurement', 'I designed a two-layer comparison board and measured it with a VNA to check feedlines against the PCB process I was using.', 'RF test coupon · Two-layer FR-4'),
    'lora-receiver': ('Radio + GNSS', 'I brought ESP32, LoRa and GNSS onto one receiver PCB, then used range testing and a VNA to investigate the RF path.', 'Rev A · Assembled receiver'),
    'framework-logic-analyser': ('Instrumentation + PCB design', 'Four-channel logic, serial-bus and passive CAN capture on a 26 × 30 mm, four-layer STM32G474 board.', 'Logic analyser · CAD assembly'),
    'tamagotchi-sd-card': ('Embedded + storage', 'A two-layer STM32F072 design with a full-size SD socket, USB-C, reset and boot controls, and a seven-pin interface.', 'SD-card interface · CAD assembly'),
    'dash': ('Embedded interaction', 'I rebuilt the firmware around a focus timer, animated character and gesture controls, with a local Wi-Fi portal for sessions and settings.', 'Earlier vehicle-mounted prototype'),
    'lora-talkie': ('Radio + interface firmware', 'I wrote the single-button Morse composer, message recall and field controls for a Heltec V3 LoRa radio.', 'Handheld build · Heltec V3'),
    'runswift': ('Robotics + integration', 'I develop and test Python/C++ ROS2 software, integrate robot hardware and prepare the team for competition.', 'rUNSWift · Robot soccer lab'),
    'scopelab': ('Engineering education', 'A browser-first bench for GPIO, UART, I²C and SPI: edit a program, flash a micro:bit, then measure the signal.', 'ScopeLab · Teaching interface'),
    'switch-mode-power-supplies': ('Industry + test hardware', 'I maintain, test and repair power supplies and other equipment. These are two isolated test boards from my trainee engineering role.', 'Isolated Glitch Tester · V03'),
}
PHOTO_OPENINGS = {
    'framework-expansion-card': ('framework-black-hero', 'Assembled black ESP32 Framework expansion card in its clear enclosure'),
    'rf-test-board': ('rf-test-hero', 'The manufactured RF comparison board with feedlines and connector test structures'),
    'lora-receiver': ('lora-receiver-hero', 'The assembled LoRa receiver with ESP32, radio module and u-blox GNSS receiver'),
}


def apply_edits(source, edits):
    for start, end, replacement in sorted(edits, reverse=True):
        source = source[:start] + replacement + source[end:]
    return source


def raw_node(source, node):
    return source[node.start:node.end]


def inside(source, node):
    return source[node.open_end:node.close_start]


def within(document, node, predicate):
    return [child for child in document.elements if node.open_end <= child.start < node.close_start and predicate(child)]


def dark_interiors(source, relative):
    """Apply the approved photo-led presentation without serializing viewers."""
    document = Document(source)
    edits = []
    slug = relative.as_posix().removeprefix('projects/').removesuffix('/index.html')
    for node in document.elements:
        if node.has_class('v2-nav'):
            current = ' aria-current="page"' if relative.parts[0] == 'projects' else ''
            edits.append((node.open_end, node.close_start,
                f'\n        <a href="/v3/projects/"{current}>Projects</a>\n'
                '        <a href="/assets/documents/Andrew_Chung_Public_CV.pdf" aria-label="Public CV (PDF)">CV</a>\n'
                '        <a class="v2-nav-contact" href="mailto:andrew.noah.chung@gmail.com">Contact <span aria-hidden="true">↗</span></a>\n      '))
        if node.has_class('v2-footer-links'):
            counterpart = '/v2/' + relative.as_posix().removesuffix('index.html')
            edits.append((node.open_end, node.close_start,
                '<a href="/v3/about/">About</a><a href="/assets/documents/Andrew_Chung_Public_CV.pdf" aria-label="Public CV (PDF)">CV</a>'
                '<a href="mailto:andrew.noah.chung@gmail.com">Contact ↗</a><a href="/shared/">Files</a><a href="/book/">Book</a>'
                '<a href="https://github.com/ProccyBoi" target="_blank" rel="noreferrer">GitHub ↗</a>'
                '<a href="https://www.linkedin.com/in/22anc/" target="_blank" rel="noreferrer">LinkedIn ↗</a>'
                f'<a class="v3-version-link" href="{counterpart}" aria-label="View this page in v2">v2</a>'))
        if node.has_class('engineering-brief'):
            # These repeat the opening, specifications and retained full story.
            edits.append((node.start, node.end, ''))
    source = apply_edits(source, edits)
    document = Document(source)
    heroes = [node for node in document.elements if node.has_class('project-hero')]
    if heroes:
        hero = heroes[0]
        title = within(document, hero, lambda n: n.tag == 'h1')[0]
        copy = within(document, hero, lambda n: n.has_class('project-hero-copy'))[0]
        paragraphs = within(document, copy, lambda n: n.tag == 'p' and not n.has_class('eyebrow'))
        description = inside(source, paragraphs[0])
        if slug == 'tramtrace': description = 'A live light-rail map for Sydney and Parramatta.'
        media = within(document, hero, lambda n: n.has_class('project-hero-media'))[0]
        photo = inside(source, media)
        is_cad = media.has_class('v2-cad-media')
        if slug in PHOTO_OPENINGS:
            stem, alt = PHOTO_OPENINGS[slug]
            image = photograph({'src': f'/assets/images/projects/{stem}-1920.jpg', 'width': 1920, 'height': 1280, 'alt': alt})
            photo_doc = Document(image)
            photo = inside(image, photo_doc.elements[0])
            is_cad = False
        photo = re.sub(r'sizes="[^"]*"', 'sizes="(max-width: 800px) 100vw, 72vw"', photo)
        photo = re.sub(r'(<img\b[^>]*)(>)', lambda m: attribute(m[1] + m[2], 'fetchpriority', 'high'), photo)
        if not photo.lstrip().startswith('<picture'): photo = '<picture>' + photo.strip() + '</picture>'
        category, contribution, caption = CASE_OPENINGS[slug]
        path = '/v3/' + relative.as_posix().removesuffix('index.html')
        ids = {node.attrs.get('id') for node in document.elements}
        has_build = 'build' in ids
        has_design = 'engineering' in ids
        destination = path + ('#build' if has_build else '#explore' if 'explore' in ids else '#details')
        destination_label = 'Build photographs' if has_build else 'Inspect the design' if is_cad else 'Project details'
        specs = within(document, hero, lambda n: n.has_class('v2-case-specs'))[0]
        nav = next(node for node in document.elements if node.has_class('v2-case-nav'))
        navigation = raw_node(source, nav).replace('All work', 'All projects').replace('>Engineering</a>', '>Design</a>').replace('>Interactive</a>', '>3D assembly</a>')
        # Original section anchors and progress hooks remain in the same order.
        new_hero = f'''<section class="project-hero v3-case-opening" id="overview" aria-labelledby="project-title">
      <div class="project-hero-grid">
        <div class="project-hero-copy">
          <p class="v3-case-category">{escape(category)}</p>
          {raw_node(source, title)}
          <p class="v3-case-description">{description}</p>
          <p class="v3-case-contribution">{escape(contribution)}</p>
          <div class="project-hero-actions"><a href="{path}{'#engineering' if has_design else '#details'}">Inside the {'design' if is_cad else 'build'} <span aria-hidden="true">↓</span></a></div>
        </div>
        <figure class="project-hero-media {'v2-cad-media' if is_cad else 'v3-case-photograph'}">
          <a class="v3-case-image-link" href="{destination}" aria-label="{escape(destination_label + ': ' + re.sub('<[^>]+>', '', inside(source, title)), quote=True)}">{photo}</a>
          <figcaption><span>{escape(caption)}</span><a href="{destination}">{destination_label} <span aria-hidden="true">↗</span></a></figcaption>
        </figure>
      </div>
    </section>
    {navigation}
    {raw_node(source, specs)}'''
        header = next(node for node in document.elements if node.has_class('v2-header'))
        identity = '<p class="v3-identity"><span>Electrical engineering student</span>UNSW, Sydney</p>'
        source = apply_edits(source, [(hero.start, hero.end, new_hero), (nav.start, nav.end, ''), (header.end, header.end, '\n  ' + identity)])
    if relative.as_posix() == 'projects/index.html':
        document = Document(source)
        catalog = next(node for node in document.elements if node.has_class('project-catalog'))
        cards = within(document, catalog, lambda n: 'data-v2-project' in n.attrs)
        markup = {}
        for card in cards:
            value = raw_node(source, card)
            key = card.attrs['href'].strip('/').split('/')[-1]
            record = EVIDENCE.get(f'projects/{key}/index.html', {})
            image_record = record.get('hero')
            if key in PHOTO_OPENINGS:
                stem, alt = PHOTO_OPENINGS[key]
                image_record = {'src': f'/assets/images/projects/{stem}-1920.jpg', 'width': 1920, 'height': 1280, 'alt': alt}
            if image_record:
                d = Document(value)
                frame = next(n for n in d.elements if n.has_class('catalog-card-media'))
                image = photograph(image_record)
                image_doc = Document(image)
                image = inside(image, image_doc.elements[0]).replace('fetchpriority="high"', 'loading="lazy"')
                value = apply_edits(value, [(frame.open_end, frame.close_start, image)])
                value = value.replace('catalog-card-media v2-catalog-cad', 'catalog-card-media v3-catalog-photograph')
            markup[key] = value
        order = ['tramtrace', 'skylabs', 'framework-dual-usb', 'framework-raspberry-pi', 'coaster', 'lora-receiver', 'rf-test-board', 'framework-expansion-card', 'switch-mode-power-supplies', 'metroboard', 'framework-logic-analyser', 'tamagotchi-sd-card']
        assert set(order) == set(markup), 'Hardware inventory changed; review the editorial order'
        markup['tramtrace'] = markup['tramtrace'].replace('loading="lazy"', 'fetchpriority="high"')
        source = apply_edits(source, [(catalog.open_end, catalog.close_start, '\n' + '\n\n'.join(markup[key] for key in order) + '\n')])
    # Correct only presentation text. Tool routes and teaching apps stay intact.
    if relative.as_posix() == 'about/index.html':
        source = source.replace('<h2 id="tools-title">Tools</h2>', '<h2 id="tools-title">Skills &amp; methods</h2>')
    return source

def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check output without writing files")
    args = parser.parse_args()
    try:
        validate_evidence()
    except (OSError, ValueError) as error:
        parser.exit(1, f"Invalid v3 evidence: {error}\n")
    pages = [path.relative_to(SOURCE) for path in sorted(SOURCE.rglob("index.html")) if path.parent != SOURCE and path.relative_to(SOURCE).parts[0] not in {"render", "book"}]
    changed = []
    for relative in pages:
        content = build(relative)
        target = DESTINATION / relative
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            changed.append(relative.as_posix())
            if not args.check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8", newline="\n")
    if args.check and changed:
        parser.exit(1, "Outdated v3 pages:\n" + "\n".join(changed) + "\n")
    print(f'{"Verified" if args.check else "Generated"} {len(pages)} v3 interior pages; {len(changed)} {"outdated" if args.check else "updated"}.')


if __name__ == "__main__":
    main()
