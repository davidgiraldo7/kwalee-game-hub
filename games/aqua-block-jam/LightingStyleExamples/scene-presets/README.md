# Soft 3D Template Preset

This folder contains a static, minimal 3D starter preset for quickly kicking off toy-like games.

## Files

- `soft-3d-template-preset.js` - reusable scene setup utilities and a static showcase scene.
- `../soft-3d-template-bridge.js` - lightweight registry used by pages to opt in by flag.
- `../Soft3DTemplate.html` - lean starter page with static primitives and polished lighting.

## One-Flag Opt-In

Set this before your game bootstrap script:

```html
<script>
  window.SOFT_3D_TEMPLATE_PRESET = "soft-3d-template-v1";
</script>
```

Then create the preset instance via the bridge:

```js
const sceneRunner = window.Soft3DTemplateBridge.createActive({
  container: document.getElementById("canvas-container"),
  THREE: window.THREE,
  OrbitControls: window.THREE.OrbitControls || window.OrbitControls
});
```

Render once:

```js
sceneRunner.render();
```

And on resize:

```js
sceneRunner.resize();
```

## Notes

- This preset is intentionally static: no built-in simulation loop and no moving test pieces.
- It preserves camera, color-space, soft shadows, and lighting character.
- The primitives are examples only and are safe to delete when starting gameplay work.

## Debug Panel

- A built-in debug panel appears in `Soft3DTemplate.html`.
- Press `D` to show or hide it.
- It includes a wide set of camera and lighting controls.
- `Save` stores current values in localStorage.
- `Load` restores saved values.
- `Reset` returns to default preset values.
