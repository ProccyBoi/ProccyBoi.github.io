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
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "v2"
DESTINATION = ROOT / "v3"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
ROUTE_PREFIX = re.compile(r"^(https://proccyboi\.github\.io)?/v2/")
PRESENTATION = '''  <link rel="stylesheet" href="/assets/v3.css?v=aircraft-20261007">
'''


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


def build(relative):
    source = (SOURCE / relative).read_text(encoding="utf-8")
    document = Document(source)
    edits = []
    has_footer = False
    counterpart = "/v2/" + relative.as_posix().removesuffix("index.html")
    comparison = f'<a class="v3-version-link" href="{counterpart}" aria-label="View this page in v2">v2</a>'

    for element in document.elements:
        original = source[element.start:element.open_end]
        updated = original
        attrs = element.attrs
        asset = attrs.get("src", attrs.get("href", "")).split("?", 1)[0].lstrip("/")
        if (element.tag == "script" and asset == "assets/v2-motion.js") or (element.tag == "link" and asset == "assets/v2-motion.css"):
            edits.append((element.start, element.end, ""))
            continue
        if "href" in attrs:
            updated = attribute(updated, "href", route(attrs["href"])) if route(attrs["href"]) != attrs["href"] else updated
        if element.tag == "meta" and attrs.get("property") == "og:url":
            updated = attribute(updated, "content", route(attrs.get("content", "")))
        if element.tag == "meta" and attrs.get("name") == "theme-color":
            updated = attribute(updated, "content", "#101210")
        if element.tag == "body":
            classes = attrs.get("class", "").split()
            classes.extend(name for name in ["v3", "v3-interior"] if name not in classes)
            updated = attribute(updated, "class", " ".join(classes))
        if element.has_class("v2-footer-links"):
            edits.append((element.close_start, element.close_start, comparison))
            has_footer = True
        if element.tag == "head":
            extra = PRESENTATION
            # Redirects retain their shared application's canonical target.
            if not any(node.tag == "meta" and node.attrs.get("name") == "theme-color" for node in document.elements):
                extra = '  <meta name="theme-color" content="#101210">\n' + extra
            edits.append((element.close_start, element.close_start, extra))
        if updated != original:
            edits.append((element.start, element.open_end, updated))

    if not has_footer:
        body = next(element for element in document.elements if element.tag == "body")
        edits.append((body.close_start, body.close_start, f'<footer class="v2-footer"><div class="v2-shell">{comparison}</div></footer>\n'))
    for start, end, replacement in sorted(edits, reverse=True):
        source = source[:start] + replacement + source[end:]

    if relative.as_posix() == "projects/framework-raspberry-pi/index.html":
        source = source.replace("<p>Turn the card, separate the layers, and follow the components that make it work.</p>", "")
        source = source.replace("<p>Component height and connector position matter as much as the copper layout. The interactive view brings the board and reference housing together, then separates the parts to make the arrangement easier to read.</p>", "")
    if relative.as_posix() == "projects/skylabs/index.html":
        source = source.replace('<a class="button" href="/v3/projects/skylabs/#explore">Explore both boards</a>', "")
    return normalized(source)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check output without writing files")
    args = parser.parse_args()
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
