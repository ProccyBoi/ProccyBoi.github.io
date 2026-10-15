"""Kiku v3 keeps the accepted 3a58296 interior while v2 evolves independently."""
from pathlib import Path
from hashlib import sha256
ROOT = Path(__file__).resolve().parents[1]
def source(relative):
    if Path(relative).as_posix() != "projects/kiku/index.html":
        return (ROOT / "v2" / relative).read_text(encoding="utf-8")
    data = (ROOT / "scripts/content/v3-kiku-source.html").read_bytes()
    if sha256(data).hexdigest() != "d0e3f8cf4d67bf6ef3e4eee7473d87e43954c6aee15b317a414c574a921e3a9e":
        raise ValueError("Frozen Kiku v3 source changed; explicit review required")
    return data.decode("utf-8")
