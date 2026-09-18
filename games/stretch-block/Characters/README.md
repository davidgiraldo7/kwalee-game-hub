# Block Character Overlays

Cosmetic Head / Mask / Feet / Tail sprites on **expanded** Soft-3D blocks.
Sprites are children of each block mesh (`b._mesh`), so they ride jelly squash,
expand lerp, drag lift, and board intro/win transforms automatically.

This folder is self-contained (JS + this doc). Assets live under
`Assets/Characters/<Name>/` at the game root. Host games load the three scripts
and call `attach` / `update` from the Three.js board builder (Stretch Block
already wires this in `js/game-render.js`).

---

## Folder layout

```
Characters/
├── README.md                      ← this file (contract)
└── js/
    ├── block-characters-config.js ← BLOCK_CHARACTERS_CFG (offsets, selection)
    ├── block-characters-data.js   ← CharacterId + CHARACTER_CATALOG
    └── block-characters.js        ← runtime → window.BlockCharacters

Assets/Characters/                 ← game-root art (not inside Characters/)
└── Cat/
    ├── Head/Spine/CatFace1.{json,atlas,png}  ← face expressions as Spine anims
    ├── Mask/Cat_EarMask_1.png
    ├── Feet/Cat_Feet_1.png
    └── Tail/Cat_Tail_1.png
```

Asset paths in the catalog are **from the game root** (e.g.
`Assets/Characters/Cat/Head/Spine/CatFace1.json`).

---

## When characters appear

| Footprint | Characters |
|-----------|------------|
| `1×1` (unexpanded normal block) | Hidden — size decal only |
| Larger than `1×1` (including `preExpanded`) | Shown per placement rules below |

Visibility uses **logical** `b.w` / `b.h`, not the cosmetic `renderW` / `renderH`.

---

## Placement rules

```
                     ┌─ w==1 && h==1 ─► hide
block w×h ───────────┼─ w==1 && h>=2 ─► vertical: head top, feet bottom
                     ├─ h==1 && w>=2 ─► horizontal: head L/R, tail opposite end
                     └─ w>=2 && h>=2 ─► large: head top corner, feet under head,
                                        tail opposite bottom (when art exists)
```

| Shape | Head | Feet | Tail | Mirror |
|-------|------|------|------|--------|
| `1×1` | hidden | hidden | hidden | — |
| `1×2` | top cell | bottom cell | never | no |
| `1×H` (H≥3) | top cell | bottom cell **+** second paws in cell under head | never | no |
| `W×1` (W≥2) | leftmost **or** rightmost | never | opposite end from head | yes when on left |
| `W×H` (both ≥2) | top-left **or** top-right | bottom cell, **same column as head**, same 1×1 size | bottom opposite of feet (if `tails[]` non-empty) | yes when head on left |

### Facing (left vs right)

Deterministic per block so expands/shrinks do not flip the face:

```
hash(block.id + "|" + colorKey) & 1  →  left or right
```

Configured via `BLOCK_CHARACTERS_CFG.facingRightBit` (which bit value means “right”).
Horizontal strips and large blocks both use this facing. Vertical `1×H` strips
do not mirror.

Cell axes (block-local, after Soft-3D slab orientation):

- **Col 0** = left (−X), **col w−1** = right (+X)
- **Row 0** = top (−Z / smaller grid `y`), **row h−1** = bottom (+Z)

---

## Layering & mask contract

Each expanded block gets a `THREE.Group` (`b._character.group`) with four planes:

1. **mask** (under) — white→alpha from the mask PNG; **lit** `MeshStandardMaterial`
   uses the block’s linear albedo + the same `BLOCK_EMISSIVE` glow as Soft-3D slabs
   so outer ears match the **lit top face**, not a flat unlit hex
2. **head** — unlit expression art on top; light pink inner ears / nose
   **lighten** the block colour (`headFeatureBlend: "lighten"` default; also
   `"multiply"` / `"additive"` / `"none"`) so they read as a soft tint of the
   slab. Eyes, mouth, and sparkles stay as authored.
3. **feet** — black silhouettes → white+alpha, lit + tinted (optional `feetTintShade`)
4. **tail** — same silhouette pipeline as feet; horizontal + large shapes (not vertical)

Mask uses the **exact same** cell, offsets, scale, and mirror as the head.

**Why not bake the hex into the mask texture?** Soft-3D blocks are lit; an unlit
baked colour always reads darker than the slab top. Mask/feet/tail share the block
roughness / metalness / emissive instead.

---

## Offsets (ear overlap)

Tune in `block-characters-config.js` → `BLOCK_CHARACTERS_CFG.offsets`:

```js
offsets: {
  head: { offsetX: 0, offsetY: 0.12, scale: 0.92 },
  mask: { offsetX: 0, offsetY: 0.12, scale: 0.92 }, // keep in sync with head
  feet: { offsetX: 0, offsetY: -0.06, scale: 0.92 },
  tail: { offsetX: 0, offsetY: -0.06, scale: 0.92 }
}
```

| Field | Unit | Meaning |
|-------|------|---------|
| `offsetX` | cell | + toward the right of the board |
| `offsetY` | cell | + toward the **top** of the board (raises ears past the cell edge) |
| `scale` | × cell | `1` = full 1×1 cell |

`yLift` raises the whole stack above the slab top (and slightly above decals).
`renderOrder` defaults to `3` (decals use `2`).

Sprites counter non-uniform jelly scale so a character cell stays visually square
while the slab wobbles.

---

## Data model

### `CharacterId` + `CHARACTER_CATALOG` (`block-characters-data.js`)

```js
const CharacterId = { CAT: "Cat", DOG: "Dog" };

CHARACTER_CATALOG.Cat = {
  id: CharacterId.CAT,
  label: "Cat",
  heads: [{
    type: "spine",
    json: "Assets/Characters/Cat/Head/Spine/CatFace1.json",
    atlas: "Assets/Characters/Cat/Head/Spine/CatFace1.atlas",
    fallback: "Assets/Characters/Cat/Head/Spine/CatFace1.png",
    expressions: [
      { id: "Face1", intro: "IntroFace1", idle: "IdleFace1" },
      { id: "Angry", intro: "IntroAngry", idle: "IdleAngry" },
      // … Happy, Wink, …
    ]
  }],
  masks: ["Assets/Characters/Cat/Mask/Cat_EarMask_1.png"],
  feet:  ["Assets/Characters/Cat/Feet/Cat_Feet_1.png"],
  tails: ["Assets/Characters/Cat/Tail/Cat_Tail_1.png"],
  colorVariants: {
    // Optional per-palette packs (keys = PALETTE names: red, blue, …)
    // red: { heads: [...], masks: [...], feet: [...], tails: [...] }
  }
};
```

**Expression pairing:** Spine expressions may set a per-face `mask` path when
the ear silhouette changes (Dog Happy → Droop, Angry/Chad/Wink → Flop).
Otherwise Spine faces share `masks[0]` (and feet/tails[0]). Legacy PNG packs
still pair `heads[i]` with `masks[i]` when `expressions` is absent.

**`colorVariants`:** when a block’s palette name has an entry, those arrays replace
the character defaults for that block only.

### `BLOCK_CHARACTERS_CFG` (`block-characters-config.js`)

| Key | Role |
|-----|------|
| `enabled` | Master switch |
| `selectedCharacterId` | Active catalog key (default `"Cat"`) |
| `expressionMode` | `"fixed"` \| `"perBlock"` (shuffle-bag deal; all faces before reuse) |
| `expressionIndex` | Used when mode is `"fixed"` |
| `storageKey` | localStorage for unlocks + selection |
| `offsets` | Per-part placement (see above) |
| `yLift` / `earYLift` | Plane height; ears get extra `earYLift` |
| `renderOrder` / `earRenderOrder` | Draw order (ears higher + `depthTest: false`) |
| `blockInteriorScale` | PreExpanded crate fill scale inside metal border only |
| `feetTintShade` | Darken feet/tail tint relative to block color |
| `headFeatureBlend` | `"lighten"` \| `"multiply"` \| `"additive"` \| `"none"` — pink ear/nose vs block |
| `facingRightBit` | Which hash bit means “face right” |

---

## How to add a character

1. Add art under `Assets/Characters/<Name>/{Head,Mask,Feet,Tail}/`.
2. Add `CharacterId.NAME = "Name"`.
3. Add `CHARACTER_CATALOG.Name = { id, label, heads, masks, feet, tails, colorVariants: {} }`.
4. Unlock at runtime (later UI): `BlockCharacters.UnlockCharacter(CharacterId.NAME)`.
5. Switch: `BlockCharacters.setSelectedCharacter(CharacterId.NAME)`.

Default unlocked set is `["Cat"]`. Persistence:
`localStorage[storageKey] = { unlocked: string[], selected: string|null }`.

## How to add an expression (same character)

Append an entry to the Spine head’s `expressions[]` list with matching Spine
animation names (`IntroHappy` / `IdleHappy`, etc.). With
`expressionMode: "perBlock"`, `beginLevel(blocks)` deals a shuffled bag of
expression indices so every face is used before any is reused (then the bag
refills). With `"fixed"`, set `expressionIndex` or call `setExpressionIndex(i)`.
Switch a live block with `setBlockExpression(b, i)` or `setBlockHappyFace(b)`.

## How to add color-specific art

```js
colorVariants: {
  red: {
    heads: [{
      type: "spine",
      json: "Assets/Characters/Cat/Head/Spine/CatFace1.json",
      atlas: "Assets/Characters/Cat/Head/Spine/CatFace1.atlas",
      expressions: [ /* … */ ]
    }],
    masks: ["Assets/Characters/Cat/Mask/Cat_EarMask_1.png"],
    feet:  ["Assets/Characters/Cat/Feet/Cat_Feet_1.png"],
    tails: ["Assets/Characters/Cat/Tail/Cat_Tail_1.png"]
  }
}
```

Resolve uses the palette **name** (reverse-mapped from the block’s hex via
`window.PALETTE`).

## Tail notes

- Catalog path: `Assets/Characters/Cat/Tail/Cat_Tail_1.png`
- Placement when `tails[]` is non-empty:
  - **vertical (`1×H`)** — no tail; feet at the bottom instead
  - **horizontal (`W×1`)** — opposite end from the head
  - **large (`W×H`)** — bottom corner opposite the feet
- Same silhouette tint pipeline as feet (`feetTintShade`)
- Tune with `offsets.tail` in config

---

## Host integration (Stretch Block)

Load order in `index.html` (after `game-sim.js`, before ProgressRewards):

```html
<script src="Characters/js/block-characters-config.js"></script>
<script src="Characters/js/block-characters-data.js"></script>
<script src="Characters/js/block-characters.js"></script>
```

`js/game-render.js` hooks:

- `cs3dBuildLevel` — `BlockCharacters.detach` all blocks, build meshes, then
  `BlockCharacters.beginLevel(blocks)` + `attach(b)` for each
- `cs3dUpdateBlock` — after mesh scale / decal scale → `BlockCharacters.update(b)`

Detach runs **before** `cs3dClearGroup` so shared character textures/geometry are
not disposed with the board.

Optional init (e.g. from `kpf-app.js`):

```js
BlockCharacters.init({ expressionMode: "perBlock" });
```

---

## Public API (`window.BlockCharacters`)

| Method | Role |
|--------|------|
| `init(overrides?)` | Merge into `BLOCK_CHARACTERS_CFG`; reload persistence |
| `beginLevel(blocks?)` | Reset expression deal (seeded from blocks); call before attach |
| `attach(b)` / `update(b)` / `detach(b)` | Lifecycle on a sim block |
| `setSelectedCharacter(id)` / `getSelectedCharacter()` | Switch active character (must be unlocked) |
| `setExpressionMode("fixed"\|"perBlock")` | Expression pick policy |
| `setExpressionIndex(i)` | Index for `"fixed"` mode |
| `setBlockExpression(b, i, opts?)` | Force expression; Spine switches Intro/Idle in place |
| `setBlockHappyFace(b, opts?)` | Match expression id (default `"Happy"`) and play it |
| `findExpressionIndex(b, match)` | Index of expression id / anim / path containing match |
| `getCatalog()` | `CHARACTER_CATALOG` |
| `resolveParts(characterId, blockOrColorName, expressionIndex?)` | `{ head, mask, feet, tail, expressionIndex, expressionId }` |
| `HasUnlockedCharacter(id)` | Unlock query |
| `UnlockCharacter(id)` | Persist unlock |
| `getUnlockedCharacters()` | List unlocked ids present in the catalog |
| `layoutForSize(w, h, preferLeft)` | Pure placement helper (also for tests) |
| `facingLeft(b)` | Facing helper |

---

## Parenting / animation notes

- Parent = `b._mesh` (same pattern as top-face decals and lock bolts).
- Planes use `PlaneGeometry` rotated onto XZ, `depthWrite: false`, `raycast` no-op.
- Logical expand still drives placement cells; cosmetic `render*` / jelly only
  affect mesh scale (compensated for square sprites).
- Characters are **render-only** — they never affect collision, expand validity,
  or win checks.

---

## Out of scope (stubs ready)

- Character picker UI
- Progress Rewards / Daily Streak wiring for unlocks
- Populated `colorVariants`
- Settings toggle chrome (`CFG.enabled` only)
