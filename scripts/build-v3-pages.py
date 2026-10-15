"""Copy the maintained v2 interiors into the independently styled v3 routes.

The homepage is authored separately. All other current v2 HTML, including Book,
teaching tools, the Flight Review redirect and the internal CAD capture surface,
is inherited without editorial changes. Only route prefixes and page chrome are
changed. Shared assets and tool controllers remain read-only and keep their
URLs; the v3 presentation script replaces only v2's shared navigation script.

Run with --check to verify all 26 generated pages and their inherited content,
viewer hooks, scripts, styles and engineering evidence. Standard library only.
"""
from argparse import ArgumentParser
from collections import Counter
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from v3_interior_source import source as interior_source
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "v2"
DESTINATION = ROOT / "v3"
EXPECTED_INTERIORS = 26
EXPECTED_PROJECTS = 16
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
# Require a URL boundary: /assets/images/v2/ and third-party /v2/ paths are
# immutable asset/external references, not portfolio routes. This also covers
# canonical/OG URLs, JSON-LD, refresh redirects and inline navigation strings.
ROUTE_PREFIX = re.compile(
    r"(?<![\w./:-])(?P<origin>https?://proccyboi\.github\.io|//proccyboi\.github\.io)?/v2(?=[/?#\"'\s<>]|$)",
    re.I,
)
PRESENTATION_CSS = "/assets/v3-product.css?v=white-20261012"
INTERIORS_CSS = "/assets/v3-product-light-interiors.css?v=white-20261012"
PRESENTATION_JS = "/assets/v3-product.js?v=white-20261012"
PRESENTATION = (
    f'  <link rel="stylesheet" href="{PRESENTATION_CSS}">\n'
    f'  <link rel="stylesheet" href="{INTERIORS_CSS}">\n'
    f'  <script src="{PRESENTATION_JS}" defer></script>\n'
)
MENU_BUTTON = (
    '<button class="v2-menu" data-v3-menu type="button" aria-expanded="false" '
    'aria-controls="v3-navigation" aria-label="Open navigation">'
    '<span class="v3-menu-label">Menu</span><span class="v3-menu-icon" aria-hidden="true">+</span></button>'
)
UTILITY_LINKS = (
    ("CV", "/assets/documents/Andrew_Chung_Public_CV.pdf"),
    ("Book", "/v3/book/"),
)


class Element:
    def __init__(self, tag, attrs, start, open_end):
        self.tag, self.attrs = tag, dict(attrs)
        self.start, self.open_end = start, open_end
        self.close_start = self.end = open_end

    def has_class(self, name):
        return name in (self.attrs.get("class") or "").split()


class Document(HTMLParser):
    """Record exact spans rather than reserializing functional HTML or scripts."""

    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0] + [match.end() for match in re.finditer("\n", source)]
        self.elements, self.stack = [], []
        self.feed(source)
        self.close()

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


def route(source):
    """Rewrite portfolio URLs without changing asset paths or factual content."""
    return ROUTE_PREFIX.sub(lambda match: (match["origin"] or "") + "/v3", source)


def light_metadata(source):
    return re.sub(r'(\<meta\s+name="theme-color"\s+content=")[^"]*(")', r'\g<1>#fff\2', source)


def raw_node(source, node):
    return source[node.start:node.end]


def primary_navigation(relative):
    work_current = ' aria-current="page"' if relative.parts[0] == "projects" else ""
    about_current = ' aria-current="page"' if relative.as_posix() == "about/index.html" else ""
    book_current = ' aria-current="page"' if relative.as_posix() == "book/index.html" else ""
    return (
        f'\n        <a href="/v3/projects/" data-v3-project-link{work_current}>Projects</a>\n'
        f'        <a href="/v3/about/"{about_current}>About</a>\n'
        '        <a href="/assets/documents/Andrew_Chung_Public_CV.pdf" aria-label="Public CV (PDF)">CV</a>\n'
        f'        <a href="/v3/book/"{book_current}>Book</a>\n'
        '        <a class="v2-nav-contact" href="/v3/about/#contact">Contact <span aria-hidden="true">↗</span></a>\n      '
    )


def shared_v2_navigation_script(node):
    return node.tag == "script" and (node.attrs.get("src") or "").split("?", 1)[0].lstrip("/") == "assets/v2.js"


def remove_chrome_node(source, node):
    """Remove a standalone chrome line without leaving its indentation behind."""
    start = source.rfind("\n", 0, node.start) + 1
    end = source.find("\n", node.end)
    end = len(source) if end < 0 else end
    if not source[start:node.start].strip() and not source[node.end:end].strip():
        return start, min(end + 1, len(source)), ""
    return node.start, node.end, ""


def footer_utilities(document, footer):
    existing = {
        node.attrs.get("href") for node in document.elements
        if footer.open_end <= node.start < footer.close_start and node.tag == "a"
    }
    return "".join(
        f'<a href="{href}"' + (' aria-label="Public CV (PDF)"' if label == "CV" else "") + f'>{label}</a>'
        for label, href in UTILITY_LINKS if href not in existing
    )


def inherited_nodes(source, document, predicate):
    return [raw_node(source, node) for node in document.elements if predicate(node)]


def hook_inventory(document):
    """Keep all content hooks; the new presentation owns only primary nav."""
    return Counter(
        (node.tag, key, value) for node in document.elements
        if not node.has_class("v2-nav") and not node.has_class("v2-menu")
        for key, value in node.attrs.items()
        if (key == "id" or key.startswith("data-") or key in {"aria-controls", "aria-labelledby", "aria-describedby"})
        and key != "data-v3-project-link"
    )


def validate_inheritance(original, generated, relative):
    expected = light_metadata(route(original))
    before, after = Document(expected), Document(generated)

    def same(label, predicate):
        if inherited_nodes(expected, before, predicate) != inherited_nodes(generated, after, predicate):
            raise ValueError(f"{relative}: inherited {label} changed")

    # Full region parity protects prose, evidence, images, inputs, WebGL controls,
    # fallback markup and teaching simulations, not merely their hook counts.
    same("main content / viewer markup", lambda node: node.tag == "main")
    same("inline and tool scripts", lambda node: node.tag == "script" and node.attrs.get("src") != PRESENTATION_JS and not shared_v2_navigation_script(node))
    same("inline styles", lambda node: node.tag == "style")
    same("shared assets / canonical metadata", lambda node: node.tag in {"base", "meta", "link"} and node.attrs.get("href") not in {PRESENTATION_CSS, INTERIORS_CSS})
    same("engineering evidence", lambda node: "data-v2-engineering-evidence" in node.attrs or node.has_class("engineering-brief"))
    if hook_inventory(before) != hook_inventory(after):
        raise ValueError(f"{relative}: an inherited ID, data hook or accessibility relationship changed")
    if ROUTE_PREFIX.search(generated):
        raise ValueError(f"{relative}: contains a portfolio route returning to v2")

    bodies = [node for node in after.elements if node.tag == "body"]
    if len(bodies) != 1 or not all(bodies[0].has_class(name) for name in ["v3-product", "v3-interior"]):
        raise ValueError(f"{relative}: missing scoped v3 body classes")
    if sum(node.tag == "script" and node.attrs.get("src") == PRESENTATION_JS for node in after.elements) != 1:
        raise ValueError(f"{relative}: expected one v3 presentation script")
    if sum(node.tag == "link" and node.attrs.get("href") == PRESENTATION_CSS for node in after.elements) != 1:
        raise ValueError(f"{relative}: expected one v3 presentation stylesheet")
    if sum(node.tag == "link" and node.attrs.get("href") == INTERIORS_CSS for node in after.elements) != 1:
        raise ValueError(f"{relative}: expected one v3 interior light stylesheet")
    if any(shared_v2_navigation_script(node) for node in after.elements):
        raise ValueError(f"{relative}: legacy v2 navigation controller must not run alongside v3")
    if any(node.has_class("v2-nav") for node in before.elements):
        nav = [node for node in after.elements if node.has_class("v2-nav")]
        menu = [node for node in after.elements if node.has_class("v2-menu")]
        if len(nav) != 1 or nav[0].attrs.get("id") != "v3-navigation" or "data-v3-nav" not in nav[0].attrs:
            raise ValueError(f"{relative}: missing v3 primary navigation")
        if len(menu) != 1 or menu[0].attrs.get("aria-controls") != "v3-navigation" or "data-v3-menu" not in menu[0].attrs:
            raise ValueError(f"{relative}: missing labelled v3 navigation menu")
        if any("data-v2-nav" in node.attrs or "data-v2-menu" in node.attrs for node in after.elements):
            raise ValueError(f"{relative}: legacy primary navigation hooks remain")

    if relative.as_posix() == "projects/index.html":
        cards_before = [node.attrs.get("href") for node in before.elements if "data-v2-project" in node.attrs]
        cards_after = [node.attrs.get("href") for node in after.elements if "data-v2-project" in node.attrs]
        if len(cards_before) != EXPECTED_PROJECTS or cards_before != cards_after:
            raise ValueError(f"{relative}: expected the complete, ordered {EXPECTED_PROJECTS}-project collection")


def build(relative):
    original = interior_source(relative)
    source = light_metadata(route(original))
    document = Document(source)
    edits = []
    for element in document.elements:
        if shared_v2_navigation_script(element):
            edits.append(remove_chrome_node(source, element))
        elif element.tag == "body":
            classes = (element.attrs.get("class") or "").split()
            classes.extend(name for name in ["v3-product", "v3-interior"] if name not in classes)
            opening = source[element.start:element.open_end]
            edits.append((element.start, element.open_end, attribute(opening, "class", " ".join(classes))))
        elif element.tag == "head":
            edits.append((element.close_start, element.close_start, PRESENTATION))
        elif element.has_class("v2-nav"):
            opening = source[element.start:element.open_end].replace("data-v2-nav", "data-v3-nav")
            opening = attribute(opening, "id", "v3-navigation")
            quick_link = '<a class="v3-quick-projects" href="/v3/projects/">Projects</a>\n      '
            edits.append((element.start, element.open_end, quick_link + MENU_BUTTON + "\n      " + opening))
            edits.append((element.open_end, element.close_start, primary_navigation(relative)))
        elif element.has_class("v2-menu"):
            edits.append(remove_chrome_node(source, element))
        elif element.has_class("v2-footer-links"):
            edits.append((element.close_start, element.close_start, footer_utilities(document, element)))
    for start, end, replacement in sorted(edits, reverse=True):
        source = source[:start] + replacement + source[end:]
    validate_inheritance(original, source, relative)
    return source


def validate_route_rewriter():
    """Guard against accidental rewriting of shared CAD paths or external URLs."""
    examples = {
        '/v2/projects/tramtrace/#engineering': '/v3/projects/tramtrace/#engineering',
        'https://proccyboi.github.io/v2/about/': 'https://proccyboi.github.io/v3/about/',
        '//proccyboi.github.io/v2/book/': '//proccyboi.github.io/v3/book/',
        '0;url=/v2/book/': '0;url=/v3/book/',
        'location.replace("/v2/projects/" + location.search)': 'location.replace("/v3/projects/" + location.search)',
        '{"url":"https://proccyboi.github.io/v2/"}': '{"url":"https://proccyboi.github.io/v3/"}',
        '/assets/images/v2/tramtrace-cad.webp': '/assets/images/v2/tramtrace-cad.webp',
        'assets/images/v2/tramtrace-cad.webp': 'assets/images/v2/tramtrace-cad.webp',
        'https://example.org/v2/': 'https://example.org/v2/',
        '/v2-other/': '/v2-other/',
    }
    for original, expected in examples.items():
        if route(original) != expected:
            raise ValueError(f"Unsafe v3 URL rewrite: {original}")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify generated files without writing")
    args = parser.parse_args()
    pages = [path.relative_to(SOURCE) for path in sorted(SOURCE.rglob("*.html")) if path != SOURCE / "index.html"]
    try:
        validate_route_rewriter()
        if len(pages) != EXPECTED_INTERIORS:
            raise ValueError(f"Expected {EXPECTED_INTERIORS} v2 interiors; found {len(pages)}. Review the route inventory.")
        generated = {relative: build(relative) for relative in pages}
        actual = {path.relative_to(DESTINATION) for path in DESTINATION.rglob("*.html") if path != DESTINATION / "index.html"}
        unexpected = actual - set(pages)
        if unexpected:
            raise ValueError("Unexpected v3 interiors without v2 sources: " + ", ".join(path.as_posix() for path in sorted(unexpected)))
    except (OSError, ValueError) as error:
        parser.exit(1, f"Invalid v3 copy: {error}\n")

    changed = []
    for relative, content in generated.items():
        target = DESTINATION / relative
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            changed.append(relative.as_posix())
            if not args.check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8", newline="\n")
    if args.check and changed:
        parser.exit(1, "Outdated v3 pages:\n" + "\n".join(changed) + "\n")
    print(f'{"Verified" if args.check else "Generated"} {len(pages)} v3 interiors; '
          f'{len(changed)} {"outdated" if args.check else "updated"}; '
          f'{EXPECTED_PROJECTS} projects and all inherited viewer/evidence hooks preserved.')


if __name__ == "__main__":
    main()
