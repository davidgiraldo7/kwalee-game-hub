# Color Smash

Clone of the Color Stretch H5 prototype with the same Soft 3D UI, lighting, drag feel, and celebration flow — but a different puzzle mechanic.

## Mechanic

- Drag colourful polyomino slabs (rects, L-shapes, etc.) on a board.
- When **two pieces of the same colour share an edge**, they smash into chunky rubble and tumble off the board.
- Optional **smash edges**: mark specific faces in the editor — that piece only smashes when joined on a marked face.
- Clear every piece to win.

## Levels

Drop any level JSON into **`levels/`**. Filename sort order = play order (level 1, 2, 3…). Play **loops** when you reach the end.

**Local server** (e.g. `python -m http.server`): the game scans the folder automatically — no manifest edit needed.

**HTML compiler** (often can't list folders): after adding/removing levels, run:

```bash
node sync-levels.js
```

That rebuilds `levels/manifest.json`, `LEVELS.json`, and the inline level list inside `index.html` from whatever is in `levels/`. Then recompile — you only need to ship the updated `index.html` (or include `LEVELS.json` / the `levels/` folder if your compiler fetches them).

### Level JSON shape

```json
{
  "title": "First Clash",
  "grid": [[1,1,1,1,1,1], "..."],
  "blocks": [
    { "id": "1", "color": "green", "cells": [[0,0],[1,0],[0,1],[1,1]] }
  ],
  "winArt": [[null, "yellow", "..."], "..."]
}
```

`cells` are absolute `[col, row]` grid positions (orthogonally connected). Colours are palette names (`red`, `blue`, `green`, `yellow`, …).

## Level editor

Open **`LevelEditor.html`** (same folder, via a static server):

1. Paint **1×1** cells in a colour — touching same-colour cells auto-combine into one piece.
2. Carve floor / void, optional win-art tiles.
3. **Download level** or **Download all + manifest**, then copy the files into `levels/`.

## Run

Open `index.html` via a local static server (needed for `levels/` / fonts), or use your internal HTML compiler.

## Notes

- UI chrome, Soft 3D look, audio routing, and KPF lifecycle hooks are preserved from Color Stretch.
- Expand / shrink / fill-progress gameplay from Color Stretch has been removed.
