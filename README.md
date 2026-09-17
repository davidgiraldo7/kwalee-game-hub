# Kwalee Game Hub

A portrait-first HTML5 game container. One `index.html` plus a static catalog.
Opening the file directly uses the six built-in games. A live HTTPS deploy on a
global CDN also pulls `games/catalog.json`, so you can add or rotate titles
without editing the hub.

## Run it

Double-click `index.html`, or serve the folder:

```sh
python3 -m http.server 8787
# http://localhost:8787
```

To test on a phone on the same network, serve the folder and open your machine's LAN
address, or drop `index.html` on any static host.

## Structure

The hub has three sections:

- **Game of the week** — rotates automatically each week
- **Top trending** — ranked by a `heat` value on each catalog entry
- **All games** — full catalog with best score and play count

## Menu background

The main menu sits on an animated wall of real Kwalee game icons. Thirteen bands
scroll at different speeds and alternating directions; each band's track holds
two copies of a tileable strip, so sliding it by `-50%` lands on an identical
frame and the loop is invisible. The bands are removed from the DOM when you
leave the menu, so nothing animates while you are playing, and the whole thing
is skipped under `prefers-reduced-motion: reduce`.

Four strips of 15 icons each are stored in `assets/` and inlined into
`index.html` as WebP data URIs (~465 KB total) to keep it a single
self-contained file. To rebuild:

```bash
python3 tools/fetch_icons.py     # downloads the 61 real icons at 512px
python3 tools/build_menu_bg.py   # composes strips and inlines them
```

`fetch_icons.py` pulls the icons from Apple's public lookup API using Kwalee's
developer id, caching them in `assets/icons/` (gitignored, ~14 MB, re-fetchable).
It shells out to `curl` because the system Python has no CA bundle installed.

`build_menu_bg.py` stores each icon at 256 px but displays it at 96 px, so the
wall stays sharp on high-DPI screens with 2.7x headroom. Storing higher costs
bytes for detail nobody sees; note also that it is the *displayed* strip width,
not the stored resolution, that determines how much layer area the compositor
has to animate. App Store artwork is a full square, so the rounded corners are
applied during composition. Each strip gets half an inter-icon gap on its left
and right edge, so repeating it reproduces a full gap at the seam matching the
spacing inside the strip. The `.menu-band-tile` CSS rules are rewritten in place
to match the constants at the top of the script.

Do not source these icons from a contact-sheet image — those thumbnails are
only ~36 px and cannot be sharpened by upscaling.

The menu wordmark is built separately:

```bash
python3 tools/build_logo.py
```

The supplied logo art is an RGB file with a transparency checkerboard painted
into it, so `build_logo.py` keys the background out by flood-filling inwards
from the borders. Selecting every light neutral pixel instead would also punch
holes in the glossy white highlights inside the wordmark, since those are the
same colour as the checkerboard but enclosed by opaque pixels.

For screenshots at a real phone width, open `tools/preview.html`, which frames
`index.html` in a 390x844 iframe. Note that headless Chrome enforces a 500 px
minimum viewport, so pass a window wider than the frame or the capture will be
cropped.

## Go live (GitHub Pages)

This repo is set up for **GitHub Pages**. The hub, `games/catalog.json`, HTML
games, and fonts all come from that one HTTPS origin, so players worldwide hit
GitHub’s hosted site — not git, not `raw.githubusercontent.com` (which blocks
iframes).

1. This repo is already on GitHub (`main`).
2. Repo **Settings → Pages → Build and deployment → Source**: Deploy from a
   branch. Branch `main`, folder `/ (root)`.
3. Wait a minute, then open `https://davidgiraldo7.github.io/kwalee-game-hub/`.

Keep the repo **public** on a free account, or Pages stays private. `.nojekyll`
is in the root so GitHub does not run Jekyll over the files.

HTTPS only. Mixed-content `http://` game URLs are ignored when the hub is on
HTTPS. Game of the week uses UTC (or `featuredId` in the JSON) so every region
sees the same featured title.

The hub does not wait on the catalog. Builtin games render immediately; if
`games/catalog.json` arrives within 8 seconds the list updates. If the fetch
fails, times out, or is blocked, players still get the six baked-in games.

Do not load fonts or the catalog from Google, jsDelivr, or GitHub raw at
runtime. Inter and Unbounded are self-hosted under `assets/fonts/` (SIL OFL).

## Pulling games from somewhere

The cheapest option is the one this repo uses: a static JSON catalog plus optional
HTML game files. Cost is **$0** on GitHub Pages, Cloudflare Pages, Netlify, or any
other static host (including `python3 -m http.server` while you develop).

| Option | Cost | What you get |
| --- | --- | --- |
| **Static `games/catalog.json` + HTML** (this hub) | Free | Edit JSON, refresh; optional `src` games load in an iframe |
| Same files on jsDelivr / GitHub raw | Free | Point `?catalog=` at a CDN URL so the hub and catalog can live in different places |
| Cloudflare R2 / S3 + CloudFront | Pennies | Same static files if you already have a bucket |
| itch.io / a CMS / Google Sheet | Free–low | Extra hop; you still export or proxy to JSON |
| Firebase / Supabase / a custom API | Free tier, then paid | Live CMS, auth, analytics — overkill until you need it |

On `http://` or `https://` the hub fetches same-origin `games/catalog.json`.
A deploy can set `window.KWALEE_CATALOG_URL` to an HTTPS CDN URL; `?catalog=`
only accepts a same-origin path, so a shared link cannot point players at a
third-party catalog. `file://` and the Canvas preview cannot fetch, so they
keep the baked-in six games.

Catalog entries with `src` load in a sandboxed iframe and report a score with:

```js
parent.postMessage({ type: "kwalee.score", score: 12, streak: 0 }, "*");
```

`games/example.html` is a working catalog game (Star Tap). Pin the weekly slot with
`featuredId` in the JSON.

## Games

| Game | Type | Scoring |
| --- | --- | --- |
| Tap Rush | DOM | Taps in 10 seconds |
| Reaction Lab | DOM | Reaction time in ms (lower wins) |
| Snake Sprint | `<canvas>` | Food eaten |
| Bubble Pop | `<canvas>` | Bubbles popped before 3 escape |
| Memory Match | DOM | 100 − 2 × moves |
| Orbit Dodge | `<canvas>` | Survival time |

## Progress

Each game stores `highScore`, `plays`, `bestStreak` and `lastPlayedAt` under the
`localStorage` key `kwalee-game-hub.progress.v1`. If storage is unavailable
(private mode, some `file://` contexts) it falls back to in-memory state for the session.

Reaction Lab is flagged `lowerIsBetter`, so its records compare in the opposite direction.

## Adding a game

**Catalog (preferred).** Add an object to `games/catalog.json`. Built-in ids without
`src` still use the in-page builders. New titles need either:

- `src`: a same-origin or `http(s)` HTML file that posts `kwalee.score`, or
- a builder in `index.html` if you want it baked in.

Optional fields: `cover` (image URL), `lowerIsBetter`, `unit`, and top-level `featuredId`.

**Baked in.** Add an entry to `BUILTIN_GAMES`, register `BUILDERS["your-id"]`, and call
`api.submit(score)` when a run ends. Return a cleanup function that clears timers or
animation frames. This is the fallback when the catalog cannot be fetched.
