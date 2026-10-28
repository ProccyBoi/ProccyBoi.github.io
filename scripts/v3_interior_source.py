"""Use accepted v3 interior sources independently of later v2 presentation work."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def source(relative):
    if Path(relative).as_posix() != "projects/kiku/index.html":
        return (ROOT / "scripts/content/v3-interiors" / relative).read_text(encoding="utf-8")
    # This is a separately authored page, seeded from the shared editorial
    # design. The generator rebases its v2-format route and asset references.
    # Earlier immutable snapshots remain available as historical source records.
    return (ROOT / "scripts/content/v3-kiku-page.html").read_text(encoding="utf-8")
