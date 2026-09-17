"""Regenerate the Cursor Canvas preview from index.html.

Canvases cannot fetch or use relative imports, so the whole page is embedded as
a string literal and rendered in an iframe at phone dimensions. Run this after
changing index.html so the preview is not stale.

Usage: python3 tools/sync_canvas.py
"""
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"
CANVAS = (Path.home() / ".cursor/projects"
          / "Users-davidgiraldo-Projects-kwalee-game-hub"
          / "canvases" / "kwalee-game-hub.canvas.tsx")

VIEWPORT_WIDTH = 402
VIEWPORT_HEIGHT = 780

TEMPLATE = '''import {{
  Button,
  Row,
  Spacer,
  Text,
  useHostTheme,
  useState,
}} from "cursor/canvas";

/**
 * Live preview of the shipping HTML5 build.
 *
 * Generated from index.html by tools/sync_canvas.py — do not hand-edit.
 * Canvases cannot fetch or use relative imports, so the page is embedded
 * inline and rendered in an iframe at phone dimensions.
 */
const GAME_HTML = {html};

const VIEWPORT_WIDTH = {width};
const VIEWPORT_HEIGHT = {height};

// Regenerated on every sync. Part of the iframe key so a rebuild always
// remounts the frame instead of leaving a stale document on screen.
const BUILD_STAMP = "{stamp}";

export default function KwaleeGameHubPreview() {{
  const theme = useHostTheme();
  // Bumping the key remounts the iframe, which restarts the page at the menu.
  const [instance, setInstance] = useState(0);

  return (
    <div
      style={{{{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        alignItems: "center",
      }}}}
    >
      <Row align="center" style={{{{ width: "100%", maxWidth: VIEWPORT_WIDTH }}}}>
        <Text size="small" tone="secondary">
          {{VIEWPORT_WIDTH}} × {{VIEWPORT_HEIGHT}} portrait
        </Text>
        <Spacer />
        <Button onClick={{() => setInstance((n) => n + 1)}}>Reload</Button>
      </Row>

      <iframe
        key={{`${{BUILD_STAMP}}-${{instance}}`}}
        title="Kwalee Game Hub"
        srcDoc={{GAME_HTML}}
        style={{{{
          width: "100%",
          maxWidth: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          border: `1px solid ${{theme.stroke.secondary}}`,
          borderRadius: 18,
          background: theme.bg.editor,
          display: "block",
        }}}}
      />

      <Text size="small" tone="tertiary" style={{{{ maxWidth: VIEWPORT_WIDTH }}}}>
        Rendered from index.html. Scores persist per browser origin, so the
        preview keeps its own progress separate from a served copy.
      </Text>
    </div>
  );
}}
'''


def main():
    html = HTML.read_text()

    out = TEMPLATE.format(
        # json.dumps yields a valid JS string literal and escapes non-ASCII,
        # so the embedded page survives regardless of source encoding.
        html=json.dumps(html),
        width=VIEWPORT_WIDTH,
        height=VIEWPORT_HEIGHT,
        stamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )

    CANVAS.write_text(out)
    print(f"embedded index.html ({len(html) // 1024}KB)")
    print(f"canvas written: {CANVAS} ({len(out) // 1024}KB)")


if __name__ == "__main__":
    main()
