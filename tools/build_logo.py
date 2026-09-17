"""Key the checkerboard out of the Kwalee logo and inline it into index.html.

The supplied logo is an RGB file with a transparency checkerboard painted into
it, so the background has to be removed rather than just read from an alpha
channel. The checkerboard is keyed by flood-filling inwards from the borders:
selecting every light neutral pixel instead would also punch holes in the
glossy white highlights inside the wordmark, which are not connected to the
edge.

Usage: python3 tools/build_logo.py
"""
import base64
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
GENERATED = Path.home() / ".cursor/projects/Users-davidgiraldo-Projects-kwalee-game-hub/assets"
HTML = ROOT / "index.html"

SRC = GENERATED / "image-66dca521-fb9d-4097-a089-7a62c86d7ff2.png"
OUT = ROOT / "assets" / "kwalee-logo.webp"

DISPLAY_WIDTH = 160   # css px in the menu (15% smaller than 188)
RETINA = 2
NEUTRAL_TOL = 14      # max channel spread still counted as grey
LIGHT_MIN = 186       # checkerboard is white (255) and grey (~197)


def key_background(im):
    """Alpha mask with the checkerboard removed."""
    a = np.asarray(im).astype(int)
    neutral = (np.ptp(a, axis=2) <= NEUTRAL_TOL) & (a.min(axis=2) >= LIGHT_MIN)

    # Only the checkerboard reaches the image border; highlights inside the
    # badge are enclosed by opaque pixels and must survive.
    lab, _ = ndimage.label(neutral)
    edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    edge.discard(0)
    background = np.isin(lab, list(edge))

    alpha = np.where(background, 0, 255).astype(np.uint8)

    # The badge was antialiased against the checkerboard, leaving a pale fringe.
    # Pull the edge in by a pixel, then soften it so it does not look cut out.
    alpha = ndimage.binary_erosion(alpha > 0, iterations=2).astype(np.uint8) * 255
    return Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.8))


def main():
    if not SRC.exists():
        raise SystemExit(f"missing logo source: {SRC}")

    im = Image.open(SRC).convert("RGB")
    alpha = key_background(im)

    logo = im.convert("RGBA")
    logo.putalpha(alpha)

    box = logo.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
    logo = logo.crop(box)
    print(f"source {im.size} -> trimmed {logo.size}")

    target_w = DISPLAY_WIDTH * RETINA
    target_h = round(logo.height * target_w / logo.width)
    logo = logo.resize((target_w, target_h), Image.LANCZOS)

    OUT.parent.mkdir(exist_ok=True)
    logo.save(OUT, "WEBP", quality=90, method=6)
    css_h = round(target_h / RETINA)
    print(f"stored {target_w}x{target_h}, shown {DISPLAY_WIDTH}x{css_h}, "
          f"{OUT.stat().st_size // 1024}KB")

    uri = "data:image/webp;base64," + base64.b64encode(OUT.read_bytes()).decode()
    rule = (f".menu-logo {{ width: {DISPLAY_WIDTH}px; height: {css_h}px; "
            f"margin: 0 auto 14px; "
            f'background: url("{uri}") center / contain no-repeat; }}')

    html = HTML.read_text()
    html, n = re.subn(r"\.menu-logo \{[^}]*\}", lambda _: rule, html, count=1)
    if not n:
        raise SystemExit("could not find the .menu-logo rule in index.html")

    HTML.write_text(html)
    print(f"inlined logo; index.html now {len(html) // 1024}KB")


if __name__ == "__main__":
    main()
