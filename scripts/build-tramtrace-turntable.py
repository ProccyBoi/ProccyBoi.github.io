"""Render the public TramTrace turntable from its production KiCad board.

The physical board does not carry C83, so its 3D package is removed from a
temporary render copy. The source project itself is never modified.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image


FRAME_COUNT = 24
OMITTED_MODELS = ("C83",)


def balanced_form_end(text: str, start: int) -> int:
    depth = 0
    quoted = False
    escaped = False
    for index in range(start, len(text)):
        character = text[index]
        if quoted:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                quoted = False
            continue
        if character == '"':
            quoted = True
        elif character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
            if depth == 0:
                return index + 1
    raise ValueError("Unbalanced KiCad S-expression")


def omit_component_models(board_text: str, references: tuple[str, ...]) -> str:
    updated = board_text
    for reference in references:
        marker = f'(property "Reference" "{reference}"'
        marker_position = updated.find(marker)
        if marker_position < 0:
            raise ValueError(f"Component {reference} was not found")
        footprint_start = updated.rfind("\n\t(footprint ", 0, marker_position)
        if footprint_start < 0:
            raise ValueError(f"Footprint start for {reference} was not found")
        footprint_start += 1
        footprint_end = balanced_form_end(updated, footprint_start)
        footprint = updated[footprint_start:footprint_end]

        removed = 0
        search_from = 0
        while True:
            model_start = footprint.find("\n\t\t(model ", search_from)
            if model_start < 0:
                break
            form_start = model_start + 3
            model_end = balanced_form_end(footprint, form_start)
            footprint = footprint[:model_start] + footprint[model_end:]
            search_from = model_start
            removed += 1
        if removed == 0:
            raise ValueError(f"No 3D model was attached to {reference}")
        updated = updated[:footprint_start] + footprint + updated[footprint_end:]
    return updated


def render_turntable(pcb: Path, output_dir: Path, kicad_cli: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tramtrace-render-") as temporary:
        project_copy = Path(temporary) / pcb.stem
        project_copy.mkdir()
        shapes_source = pcb.parent / f"{pcb.stem}.3dshapes"
        if shapes_source.is_dir():
            shutil.copytree(shapes_source, project_copy / shapes_source.name)

        render_board = project_copy / pcb.name
        board_text = pcb.read_text(encoding="utf-8")
        render_board.write_text(omit_component_models(board_text, OMITTED_MODELS), encoding="utf-8")

        for frame in range(FRAME_COUNT):
            angle = frame * 15
            png_path = project_copy / f"tramtrace-turn-{frame:02d}.png"
            command = [
                str(kicad_cli),
                "pcb",
                "render",
                "--output",
                str(png_path),
                "--width",
                "1200",
                "--height",
                "1200",
                "--quality",
                "high",
                "--background",
                "transparent",
                "--perspective",
                "--zoom",
                "0.78",
                "--rotate",
                f"28,0,{angle}",
                str(render_board),
            ]
            print(f"Rendering frame {frame:02d} ({angle} degrees)", flush=True)
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            if result.returncode:
                raise RuntimeError(result.stderr or result.stdout)

            webp_path = output_dir / f"tramtrace-turn-{frame:02d}.webp"
            with Image.open(png_path) as image:
                image.save(webp_path, "WEBP", quality=78, method=4, exact=True)
            with Image.open(webp_path) as rendered:
                rendered.verify()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pcb", type=Path, help="Path to TramTrace.kicad_pcb")
    parser.add_argument("output_dir", type=Path, help="Destination for the WebP frames")
    parser.add_argument(
        "--kicad-cli",
        type=Path,
        default=Path(r"C:\Program Files\KiCad\9.0\bin\kicad-cli.exe"),
    )
    arguments = parser.parse_args()
    if not arguments.pcb.is_file():
        raise SystemExit(f"PCB not found: {arguments.pcb}")
    if not arguments.kicad_cli.is_file():
        raise SystemExit(f"KiCad CLI not found: {arguments.kicad_cli}")
    render_turntable(arguments.pcb.resolve(), arguments.output_dir.resolve(), arguments.kicad_cli.resolve())


if __name__ == "__main__":
    main()
