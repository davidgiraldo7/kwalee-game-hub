/*
 * ============================================================
 *  Physics Timing Config
 * ============================================================
 *  Physics runs on a FIXED timestep, separate from the render
 *  loop's variable frame delta. Tweak these values here — do
 *  not hard-code physics timing inside index.html.
 *
 *  Units are milliseconds, matching updateGame(dt) / updatePhysics(dt).
 *
 *  Guidelines:
 *    - Raise `substeps` for stabler contacts / less tunneling
 *      (cost scales linearly with substeps).
 *    - Lower `fixedDtMs` (e.g. 1000/120) for finer simulation
 *      when paired with enough maxStepsPerFrame budget.
 *    - Raise `maxStepsPerFrame` only if hitch recovery must
 *      catch up; too high risks a spiral of death on slow devices.
 * ============================================================
 */

window.PHYSICS_CONFIG = {
  /** Fixed physics tick length in ms (independent of display Hz). */
  fixedDtMs: 1000 / 60,

  /** How many integration/collision passes run inside one fixed tick. */
  substeps: 1,

  /** Cap on fixed ticks processed per rendered frame (hitch guard). */
  maxStepsPerFrame: 5,

  /** Clamp on frame delta fed into the accumulator (ms). */
  maxFrameDtMs: 100,
};
