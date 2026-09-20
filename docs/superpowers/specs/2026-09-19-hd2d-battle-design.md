# HD-2D battle presentation

The user authorized automatic implementation of the Three.js / React Three Fiber route. The renderer remains a consumer of authoritative battle snapshots and playback, never a second simulation.

## Experience

Replace the Pixi effects canvas and SVG miniatures with one orthographic 3D battlefield. Use pixel-art billboard characters, animated poses, directional lighting, contact shadows, layered environmental props, fog, atmospheric particles, and bounded spell effects. Support every existing ground preset: grass, dirt, cave, deck and water. Character roles and creature silhouettes must remain readable, including companions, totems, transformed, dead and removed units.

Retain the battle dialog, accessible roster selection, health/cast bars, damage numbers, skill names, zoom, sound, event history, strategy, low-effects toggle and reduced-motion preference. The scene occupies the main visual area; labels use DOM overlays anchored to the same world coordinates. Loading, unavailable WebGL and context loss have explicit recoverable UI, not silent blank canvases.

## Boundaries

- `battle.tsx` constructs a typed presentation scene including the captured ground preset.
- `battle-hd2d.tsx` owns lazy client loading, canvas lifecycle and accessible fallback.
- `battle-hd2d/` contains environment, unit, effects, overlay and shared frame context components.
- `lib/battle-hd2d.js` contains pure coordinate, theme, animation and clock helpers with node tests.
- Simulation coordinates map to the XZ floor; the authoritative snapshot and encounter identity determine interpolation resets. No RNG or gameplay mutation occurs in render callbacks.
- Pixel art is local and licensed/generated with source and prompt records. No runtime remote image dependencies.

## Performance and validation

Cap DPR and effect counts, share atlas textures/geometries where practical, avoid per-frame React state updates, stop rendering while hidden and unmount when closed. Low quality reduces shadows/effects/DPR; reduced motion suppresses bobbing, shaking and decorative particles while preserving combat information. Verify coordinate alignment, non-mutating event selection, bounded timing, encounter resets and asset paths with tests, then typecheck/build and inspect the real-engine browser fixture at desktop and mobile widths. Existing unrelated uncommitted changes must not be overwritten or committed.
