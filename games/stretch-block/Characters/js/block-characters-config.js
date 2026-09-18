// OWNER: shared — Block character behaviour + placement offsets.
// Edit by hand. Catalog/enum: block-characters-data.js. Runtime: block-characters.js.
"use strict";

/**
 * Module behaviour knobs (override in BlockCharacters.init() if needed).
 *
 * enabled:
 *   Master switch. When false, attach/update no-op (no sprites).
 *
 * useSpine:
 *   When true (default), Spine heads animate via a shared WebGL player.
 *   When false, heads use the static fallback PNG instead (no Spine WebGL /
 *   RAF / getImageData). Debug A/B for Capacitor perf. Toggle at runtime via
 *   BlockCharacters.setUseSpine(bool, { blocks }).
 *
 * spineFreezeAfterIntro:
 *   When true (default), play Intro once on expand then freeze on an Idle still
 *   and drop the block from the Spine RAF. Stops live cost growing with every
 *   expanded cat across a long session. Set false to keep looping Idle.
 *
 * spineIdlePulse:
 *   When true (default) and freeze-after-intro is on: after a random delay,
 *   play Idle once, freeze again, repeat. Faces stay static most of the time
 *   but still feel alive. Tunables: spineIdlePulseMinMs / MaxMs /
 *   spineIdlePulseMaxConcurrent (how many faces may pulse at once).
 *
 * selectedCharacterId:
 *   Active character key in CHARACTER_CATALOG (default "Cat").
 *   Switch later via BlockCharacters.setSelectedCharacter(id).
 *
 * expressionMode:
 *   "fixed"    — always use expressionIndex
 *   "perBlock" — deal expressions across the level (shuffle bag: every face
 *                once before any reuse). For Spine heads this deals the
 *                head.expressions[] list; for legacy PNG heads it deals
 *                heads[]. Call BlockCharacters.beginLevel(blocks) before
 *                attach. Sticky per block for the level.
 *
 * expressionIndex:
 *   Used when expressionMode === "fixed". Clamped to the expression count
 *   (Spine expressions[] length, or heads.length for legacy PNG packs).
 *
 * storageKey:
 *   localStorage key for unlocked character ids + selected id.
 *
 * offsets.<part>:
 *   offsetX / offsetY — in cell units relative to the target cell centre.
 *     Positive offsetY moves toward the TOP of the board (ear overlap).
 *     Positive offsetX moves toward the RIGHT of the board.
 *   scale — uniform size relative to a 1×1 cell (1 = full cell).
 *   Mask should usually match head offsets exactly.
 *   feetUnderHead — optional; used for the extra paw pair on 1×3+ verticals
 *     (defaults to feet offsets if omitted).
 *
 * yLift:
 *   Local Y above the slab top face (same idea as decals). Slightly above
 *   decals so characters win the depth sort when both are visible.
 *
 * earYLift:
 *   Extra local Y added to mask + head only so ears sit above feet/tail/slab.
 *
 * renderOrder:
 *   Base renderOrder for feet/tail (decals use 2). Ears use earRenderOrder.
 *
 * earRenderOrder:
 *   Mask/head draw order. Keep well above feet/tail/decals so overhanging ears
 *   paint on top of neighbouring geometry (ears also use depthTest:false).
 *
 * blockInteriorScale:
 *   0–1 scale of the coloured fill inside a **preExpanded rigid crate** border.
 *   Ignored for normal expandable blocks. Character overlays (head/mask/feet/tail)
 *   use the same scale so they stay aligned with the inset fill. 1 = default
 *   CRATE_INTERIOR_SCALE only; lower (e.g. 0.82) pulls fill + characters in further.
 *
 * feetTintShade:
 *   Feet and tail assets are black silhouettes with alpha. After converting to
 *   white+alpha we multiply by the block color darkened by this amount in
 *   [-1, 0] (see shade() convention: negative darkens). 0 = exact block color.
 *
 * headFeatureBlend:
 *   How light pink inner-ear / nose pixels on the head art mix with the block
 *   colour (eyes, mouth, and white sparkles are left alone):
 *     "lighten"  — lift the block colour toward white by the pink (default)
 *     "multiply" — feature × block (darkens; usually too muddy on bright slabs)
 *     "additive" — feature + block (clamped; can blow out on light colours)
 *     "none"     — authored pink as-is
 *   Spine live faces apply this in a GPU shader (no per-frame getImageData).
 *   Static PNG heads still bake it once in processToCanvas.
 *
 * facingRightBit:
 *   Hash bit meaning: 0 → prefer right, 1 → prefer left (see README facing).
 *
 * spineHead:
 *   Alignment for Spine face textures vs the square ear mask.
 *   contentScale / contentOffsetX / contentOffsetY — framing when copying the
 *     Spine canvas onto the head mesh (offsets in normalized canvas units,
 *     +Y moves art toward the bottom of the texture / down the face).
 *   viewportCenterX / viewportCenterY / viewportSize — SpinePlayer camera in
 *     skeleton space (y-up). Lower centerY / larger size to keep the chin
 *     inside the frame with padding under it.
 *   viewportPadLeft/Right/Top/Bottom — optional SpinePlayer percent pads.
 *   earBoneOffsetY / earBoneScale — nudge skeleton ear bone(s) once on load
 *     (Spine y-up: negative Y lowers pink inner ears into the mask pockets).
 *   earBones — optional list of bone names to nudge (Dog uses several); falls
 *     back to earBone / "Ears".
 *   hideEarSlots — if true, hide Spine ear attachments and rely on the mask only.
 *
 * Head defs may also set `spineHead: { … }` to override these per skeleton
 * (merged over this global block when that character is active).
 */
const BLOCK_CHARACTERS_CFG = {
    enabled: true,
    useSpine: true,
    spineFreezeAfterIntro: true,
    spineIdlePulse: true,
    spineIdlePulseMinMs: 1000,
    spineIdlePulseMaxMs: 2200,
    spineIdlePulseMaxConcurrent: 3,
    selectedCharacterId: "Cat",
    expressionMode: "perBlock",
    expressionIndex: 0,
    storageKey: "stretchblock_block_characters",
    offsets: {
        head: { offsetX: 0, offsetY: 0.1, scale: 1.2 },
        mask: { offsetX: 0, offsetY: 0.1, scale: 1.2 },
        feet: { offsetX: 0, offsetY: -0.06, scale: 0.92 },
        // Second paw pair on 1×3+ verticals (cell under head).
        // Positive offsetY pulls them toward the top of that cell (near the head).
        feetUnderHead: { offsetX: 0, offsetY: 0.7, scale: 0.92 },
        tail: { offsetX: 0, offsetY: -0.06, scale: 0.92 }
    },
    yLift: 0.014,
    earYLift: 0.02,
    renderOrder: 3,
    earRenderOrder: 28,
    blockInteriorScale: 0.95,
    feetTintShade: -1.0,
    headFeatureBlend: "lighten",
    facingRightBit: 0,
    spineHead: {
        // Square fit like the ear mask (Spine AABB is taller than wide).
        contentScale: 0.92,
        contentOffsetX: 0,
        contentOffsetY: 0.00,
        // CatFace1 AABB ~725×776 centered near (-1.3, -2.6). Extra size + a
        // slightly lower center keeps the chin inside the frame with padding.
        viewportCenterX: -1.3,
        viewportCenterY: -28,
        viewportSize: 860,
        viewportPadLeft: "0%",
        viewportPadRight: "0%",
        viewportPadTop: "0%",
        viewportPadBottom: "0%",
        earBone: "Ears",
        earBoneOffsetY: -29,
        earBoneScale: 0.92,
        hideEarSlots: false,
        earSlotNames: ["Ears"]
    }
};

window.BLOCK_CHARACTERS_CFG = BLOCK_CHARACTERS_CFG;
