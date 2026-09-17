"""Build the animated menu background strips from the real Kwalee app icons.

Composes the 512px icons fetched by tools/fetch_icons.py into a few horizontal
strips and inlines them into index.html as WebP data URIs.

Three details matter:

* Each strip carries half an inter-icon gap on its left and right edge, so
  repeating it reproduces a full gap at the seam that matches the spacing
  inside the strip. That is what makes the marquee loop invisible.
* Icons are stored at 256px but displayed at 96px, so they stay sharp on
  high-DPI screens with headroom to spare. The displayed strip width is what
  determines how much layer area the compositor animates, and that is kept
  modest regardless of the stored resolution.
* App Store artwork is a full square; the rounded corners are applied here so
  the icons read as app icons against the menu background.

Inlining keeps index.html a single self-contained file that works offline and
from file:// with no asset paths to resolve.

Usage: python3 tools/fetch_icons.py && python3 tools/build_menu_bg.py
"""
import base64
import json
import random
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "assets" / "icons"
HTML = ROOT / "index.html"

STORED_ICON = 256          # px each icon is stored at
STORED_GAP = 32            # px between icons, at stored scale
STORED_PAD = 16            # px above/below the icons, at stored scale
DISPLAY_ICON = 96          # css px each icon is rendered at
PLATE = (26, 26, 26)       # --bg, so the strips sit flush on the menu
STRIPS = "abcd"
PER_STRIP = 15
QUALITY = 78
SEED = 11

SCALE = DISPLAY_ICON / STORED_ICON
STORED_HEIGHT = STORED_ICON + STORED_PAD * 2
BAND_HEIGHT = round(STORED_HEIGHT * SCALE)


def rounded(path):
    """One icon as a rounded tile on the menu background colour."""
    icon = Image.open(path).convert("RGB")
    if icon.size != (STORED_ICON, STORED_ICON):
        icon = icon.resize((STORED_ICON, STORED_ICON), Image.LANCZOS)

    mask = Image.new("L", (STORED_ICON, STORED_ICON), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, STORED_ICON - 1, STORED_ICON - 1),
        radius=round(STORED_ICON * 0.22), fill=255)

    tile = Image.new("RGB", (STORED_ICON, STORED_ICON), PLATE)
    tile.paste(icon, (0, 0), mask)
    return tile


def build_strip(files):
    """Lay icons in a row with half a gap on each edge so the strip tiles."""
    half = STORED_GAP // 2
    width = (len(files) * STORED_ICON + (len(files) - 1) * STORED_GAP
             + half + (STORED_GAP - half))
    strip = Image.new("RGB", (width, STORED_HEIGHT), PLATE)

    x = half
    for f in files:
        strip.paste(rounded(f), (x, STORED_PAD))
        x += STORED_ICON + STORED_GAP
    return strip


def seam_gap(strip):
    """Gap across the seam vs the gaps inside the strip, in stored px."""
    a = np.asarray(strip).astype(int)
    plate = np.abs(a - np.array(PLATE)).max(axis=2) < 10
    gap_col = plate.all(axis=0)

    runs, x = [], 0
    while x < len(gap_col):
        if gap_col[x]:
            s = x
            while x < len(gap_col) and gap_col[x]:
                x += 1
            runs.append((s, x - s))
        else:
            x += 1

    lead = runs[0][1] if runs and runs[0][0] == 0 else 0
    tail = runs[-1][1] if runs and runs[-1][0] + runs[-1][1] == len(gap_col) else 0
    inner = [n for s, n in runs if s != 0 and s + n != len(gap_col)]
    return lead + tail, (sum(inner) / len(inner) if inner else 0)


def main():
    manifest = ICONS / "manifest.json"
    if not manifest.exists():
        raise SystemExit("no icons yet -- run: python3 tools/fetch_icons.py")

    entries = json.loads(manifest.read_text())
    files = [ICONS / e["file"] for e in entries if (ICONS / e["file"]).exists()]
    print(f"{len(files)} icons available, using {len(STRIPS) * PER_STRIP}")

    if len(files) < len(STRIPS) * PER_STRIP:
        raise SystemExit(f"need {len(STRIPS) * PER_STRIP} icons, have {len(files)}")

    # Shuffle so neighbouring bands do not read alphabetically, but keep it
    # seeded so rebuilds are reproducible.
    order = files[:]
    random.Random(SEED).shuffle(order)

    html = HTML.read_text()

    # Keep the band height in CSS in step with the constants above.
    html, n = re.subn(
        r"\.menu-band-tile \{ flex: none; height: \d+px; background-repeat: repeat-x; \}",
        f".menu-band-tile {{ flex: none; height: {BAND_HEIGHT}px; "
        "background-repeat: repeat-x; }",
        html, count=1)
    if not n:
        raise SystemExit("could not find the .menu-band-tile height rule")

    total = 0
    for i, key in enumerate(STRIPS):
        chosen = order[i * PER_STRIP:(i + 1) * PER_STRIP]
        strip = build_strip(chosen)

        out = ROOT / "assets" / f"kwalee-game-strip-{key}.webp"
        out.parent.mkdir(exist_ok=True)
        strip.save(out, "WEBP", quality=QUALITY, method=6)
        total += out.stat().st_size

        seam, inner = seam_gap(strip)
        flag = "ok" if abs(seam - inner) <= 2 else f"SEAM OFF (inner {inner:.1f})"

        css_w = round(strip.width * SCALE)
        uri = "data:image/webp;base64," + base64.b64encode(out.read_bytes()).decode()
        rule = (f".menu-band-tile.strip-{key} {{ width: {css_w}px; "
                f'background-image: url("{uri}"); '
                f"background-size: {css_w}px {BAND_HEIGHT}px; }}")

        html, hit = re.subn(rf"\.menu-band-tile\.strip-{key} \{{[^}}]*\}}",
                            lambda _: rule, html, count=1)
        if not hit:
            raise SystemExit(f"could not find .menu-band-tile.strip-{key} rule")

        print(f"strip-{key}: {len(chosen)} icons, stored {strip.width}x{strip.height}, "
              f"shown {css_w}x{BAND_HEIGHT}, {out.stat().st_size // 1024}KB, "
              f"seam {seam}px {flag}")

    HTML.write_text(html)
    print(f"\nicons stored at {STORED_ICON}px, displayed at {DISPLAY_ICON}px "
          f"({STORED_ICON / DISPLAY_ICON:.1f}x headroom)")
    print(f"inlined {total // 1024}KB of art; index.html now {len(html) // 1024}KB")


if __name__ == "__main__":
    main()
