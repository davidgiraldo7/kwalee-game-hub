# Performance Pass Guidelines

Use this document when the performance-pass gate in `ARCHITECTURE.md` is triggered.

## Goals

- Keep gameplay responsive and thermally reasonable on supported Android and iOS devices.
- Preserve visual fidelity and quality while finding performance improvements.
- Consider CPU, GPU, memory, battery, and sustained-session heat rather than only short tests.

## Review Checklist

### Update and Rendering Work

- Keep constant update work lightweight.
- Do not place expensive calculations, repeated queries, or unnecessary allocations in the per-frame update path.
- Use the template's `updateGame(dt)` loop for continuous gameplay work.
- Keep delta-time movement frame-rate independent.
- Stop or pause continuous work when the game is idle, paused, or showing a terminal result.
- Batch compatible rendering or mesh work where the rendering technology supports it.
- Avoid overly complex meshes and unnecessary polygon density.
- Preserve render scale and visual fidelity; optimize code, assets, batching, visibility, and effects before reducing resolution.

### Memory and Object Lifetime

- Reuse frequently created gameplay objects through object pools where practical.
- Avoid repeated spawn/destroy or allocate/discard cycles for particles, projectiles, effects, tiles, and temporary entities.
- Reuse arrays, vectors, buffers, and temporary objects in hot paths where practical.
- Remove references to completed effects and inactive entities so they can be reclaimed.
- Check texture, audio, mesh, and level-data memory usage on mobile devices.

### Physics

- Keep collision checks scoped to bodies that can interact.
- Use a sleep system for physics bodies that are not required to remain active.
- Avoid unnecessary per-frame physics queries and repeated broad-phase work.
- Profile physics cost with representative level content, not only an empty or small test level.

### Frame Rate

- Keep the first performance pass capped at 60 FPS using the template loop.
- If the game still has sustained performance or thermal issues after the first pass, evaluate a second pass with a 30 FPS cap.
- Choose a 30 FPS cap only after checking input feel, animation quality, physics behavior, and user experience on target devices.
- Do not add a separate `requestAnimationFrame` loop or `setInterval` render loop.

### Device and Thermal Testing

- Test on representative low, mid, and high-range mobile devices when available.
- Test a sustained gameplay session, not only initial boot.
- Check frame pacing, input latency, memory growth, battery impact, and device temperature.
- Test the largest expected level, busiest scene, highest entity count, and most demanding effect combination.
- Record device model, OS version, FPS behavior, and observed heat or throttling.

## Required Decision

Before making a performance tradeoff that reduces visual quality, discuss the balance with the user. Do not reduce render scale as the first response to performance problems.

When the pass is complete, re-test normal gameplay, level transitions, result overlays, audio, and mobile input so optimizations do not break the template contract.
