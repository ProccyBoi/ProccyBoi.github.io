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
PRESENTATION = '''  <link rel="stylesheet" href="/assets/v3-evidence.css?v=field-notebook-20261010">
  <link rel="stylesheet" href="/assets/v3.css?v=field-notebook-20261010">
'''
EVIDENCE = json.loads((ROOT / "scripts/content/v3-case-evidence.json").read_text(encoding="utf-8"))
UTILITY_LINKS = (
    ("Tools", "/projects/#interactive"),
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
    """Editorial summaries have their own provenance; never alter viewer data."""
    entries = "\n".join(
        f'        <div class="v3-evidence-{key}"><dt>{label}</dt><dd>{escape(record[key])}</dd></div>'
        for key, label in [("role", "My role"), ("constraint", "Constraint"),
                           ("decision", "Design decision"), ("test", "Test & evidence"),
                           ("limit", "Evidence limits")]
    )
    path = ""
    if record.get("path"):
        steps = "".join(f'<li>{escape(step)}</li>' for step in record["path"])
        path = f'      <ul class="v3-evidence-path" aria-label="System components">{steps}</ul>\n'
    links = "".join(
        f'<a href="{escape(link["href"], quote=True)}">{escape(link["label"])} <span aria-hidden="true">↗</span></a>'
        for link in record["links"]
    )
    disclosure = f'<p class="v3-evidence-disclosure">{escape(record["disclosure"])}</p>' if record.get("disclosure") else ""
    return f'''
    <section class="v3-evidence shell" id="engineering" aria-labelledby="v3-evidence-title">
      <header class="v3-evidence-heading"><p>Engineering record</p><h2 id="v3-evidence-title">{escape(record["title"])}</h2></header>
{path}      <dl class="v3-evidence-entries">
{entries}
      </dl>
      <div class="v3-evidence-links">{links}</div>
      {disclosure}
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


def build(relative):
    source = (SOURCE / relative).read_text(encoding="utf-8")
    document = Document(source)
    edits = []
    has_footer = False
    record = EVIDENCE.get(relative.as_posix())
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
            updated = attribute(updated, "content", "#f3f2eb")
        if element.tag == "body":
            classes = attrs.get("class", "").split()
            classes.extend(name for name in ["v3", "v3-interior"] if name not in classes)
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
        if element.tag == "head":
            extra = PRESENTATION
            # Redirects retain their shared application's canonical target.
            if not any(node.tag == "meta" and node.attrs.get("name") == "theme-color" for node in document.elements):
                extra = '  <meta name="theme-color" content="#f3f2eb">\n' + extra
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
        source = source.replace("Aircraft and ground hardware for 40 Hz onboard logging, live 915 MHz telemetry and post-flight replay.",
                                "Aircraft and ground hardware for onboard logging, live 915 MHz telemetry and post-flight replay.")
        source = source.replace("scheduled at 40 Hz", "with a 40 Hz target")
        source = source.replace("STM32G474 sensor acquisition, 40 Hz binary logging", "STM32G474 sensor acquisition, a 40 Hz binary logging target")
    if relative.as_posix() == "projects/skylabs/boards/telemetry/index.html":
        source = source.replace("<dd>40 Hz binary</dd>", "<dd>40 Hz target / binary</dd>")
    if relative.as_posix() == "projects/tramtrace/index.html":
        source = source.replace('<a class="button button-primary" href="/v3/projects/tramtrace/#explore">Inspect the PCB</a>',
                                '<a class="button button-primary" href="/projects/tramtrace/#tramtrace-workbench-title">Inspect copper and LED data order ↗</a>')
    return normalized(source)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check output without writing files")
    args = parser.parse_args()
    try:
        validate_evidence()
    except (OSError, ValueError) as error:
        parser.exit(1, f"Invalid v3 evidence: {error}\n")
    pages = [path.relative_to(SOURCE) for path in sorted(SOURCE.rglob("index.html")) if path.parent != SOURCE and path.relative_to(SOURCE).parts[0] != "render"]
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
