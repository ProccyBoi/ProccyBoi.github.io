"""Keep the accepted 3311a49 Kiku interior while v2 evolves independently."""
from pathlib import Path
from hashlib import sha256
ROOT = Path(__file__).resolve().parents[1]
def source(relative):
    if Path(relative).as_posix() != "projects/kiku/index.html":
        return (ROOT / "v2" / relative).read_text(encoding="utf-8")
    # Normalize checkout line endings before verifying the immutable UTF-8 text.
    text = (ROOT / "scripts/content/v3-kiku-3311a49.html").read_text(encoding="utf-8")
    if sha256(text.encode("utf-8")).hexdigest() != "3f0a0cc9e0ba498dbd914364eaeb80220fc986b4f77b57bdf5608efdef93af2b":
        raise ValueError("Frozen Kiku v3 source changed; explicit review required")
    return text
