"""Download real Kwalee app icons at full resolution.

The collection sheet only holds ~36px thumbnails, which cannot be sharpened by
upscaling. Apple's public lookup API exposes the same icons at 512px, keyed off
Kwalee's developer id, so we pull them from there instead.

Writes assets/icons/<slug>.png and a manifest for build_menu_bg.py.

Usage: python3 tools/fetch_icons.py
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "icons"
MANIFEST = OUT / "manifest.json"

DEVELOPER_ID = 497961736  # Kwalee Ltd on the App Store
LOOKUP = (f"https://itunes.apple.com/lookup?id={DEVELOPER_ID}"
          "&entity=software&limit=200&country=us")
SIZE = 512
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"


def get(url, timeout=45):
    """Fetch via curl -- this Python has no CA bundle installed."""
    out = subprocess.run(
        ["curl", "-sSL", "--fail", "--max-time", str(timeout), "-A", UA, url],
        capture_output=True, check=True)
    return out.stdout


def slug(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:48]


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    data = json.loads(get(LOOKUP))
    apps = [r for r in data.get("results", []) if r.get("wrapperType") == "software"]
    print(f"{len(apps)} Kwalee apps listed")

    manifest = []
    for app in sorted(apps, key=lambda a: a["trackName"].lower()):
        art = app.get("artworkUrl512") or app.get("artworkUrl100")
        if not art:
            continue

        # mzstatic serves any size from the same thumb path; ask for png so the
        # icons stay lossless until we compose the strips.
        url = re.sub(r"/\d+x\d+[a-z]{0,3}\.(jpg|png)$", f"/{SIZE}x{SIZE}bb.png", art)
        name = slug(app["trackName"])
        dest = OUT / f"{name}.png"

        if dest.exists():
            manifest.append({"title": app["trackName"], "file": dest.name})
            continue

        try:
            blob = get(url)
        except Exception as exc:
            print(f"  skip {app['trackName']}: {exc}")
            continue

        dest.write_bytes(blob)
        manifest.append({"title": app["trackName"], "file": dest.name})
        print(f"  {app['trackName'][:40]:42} {len(blob) // 1024}KB")

    MANIFEST.write_text(json.dumps(manifest, indent=2))
    total = sum((OUT / m["file"]).stat().st_size for m in manifest)
    print(f"\n{len(manifest)} icons in {OUT} ({total // 1024}KB on disk)")


if __name__ == "__main__":
    main()
