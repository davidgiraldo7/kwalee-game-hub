# KPF — Development Rules

> **This file travels with the template.** Read it at the start of every session.

---

## First Steps (Every Session)

1. Read `memory.md` before making any changes. Create One if not present, and use it to update the memory after each major change.
2. Read `ARCHITECTURE.md` before any structural changes.
3. Never assume — ask the user for clarification when requirements are ambiguous.

## Memory Protocol

- **Update `memory.md`** after every feature implementation or significant change.
- Append to the Session Log — never erase history.
- Record: what changed, key decisions, any open questions.

## General Rules

- **Never assume** — if a requirement is unclear, ask the user before implementing.
- **Single-file constraint** — all game code stays in `index.html`. No separate JS/CSS files. CDN libs are OK..
- **Update memory** — Update `memory.md` after each implementation.

## Asset Paths

**All asset paths must be written as full literal paths in code.** This applies to sprites, audio, meshes, textures, and anything else loaded from disk.

Do **not** build paths by concatenating folder variables:

```js
// ❌ FORBIDDEN
var folder = "game-assets/";
var path = folder + "test.png";
```

Always write the full path inline:

```js
// ✅ REQUIRED
var path = "game-assets/test.png";
```

No exceptions — never assemble paths from base folders, prefixes, or helpers.
