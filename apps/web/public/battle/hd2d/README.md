# HD-2D battle character assets

Created 2026-09-19 with the built-in `image_gen` tool. The tool does not expose a model-selection parameter; no claim is made that a particular named image model generated these files.

## Runtime atlas

- `characters.png`: **768 × 1024 RGBA**, six columns and eight rows, 128 × 128 pixels per cell.
- Facing: right, three-quarter side view. Flip horizontally for enemies.
- Shared bottom-center anchor: **(64, 112)**, normalized **(0.5, 0.875)**.
- Columns (zero-based): 0 idle, 1 walk-left-step, 2 walk-right-step, 3 attack, 4 cast/ability, 5 hurt.
- Rows (zero-based): 0 knight, 1 ranger, 2 rogue, 3 wizard, 4 priest, 5 shaman, 6 wolf, 7 goblin.
- Knight can also represent paladins, shaman can represent druids, and goblin is a fallback hostile humanoid.
- `atlas.json` records every source crop and destination rectangle.
- Use nearest-neighbor texture filtering. Avoid mipmaps so adjacent animation frames do not bleed.

## Source and processing

`characters-source.png` is the unmodified selected image-generation output, **1086 × 1448 RGBA**.
`characters-preview.jpg` composites the normalized atlas on a dark green inspection background; it is not a runtime transparency asset.

The initial output had inconsistent gutters and a cropped raised sword. A single targeted edit restored the complete sword and wider spacing. The selected source still uses irregular row spacing, so it is **not** suitable for direct grid sampling.

Deterministic normalization (Pillow, no hand-drawn replacement art):
1. Locate solid connected components using alpha > 50 and four-neighbor connectivity. Discard detection components of 300 pixels or less. Exactly 48 complete sprites remain.
2. Group by measured foot baseline into eight groups of six, then sort each group left-to-right.
3. Expand each detected content bounding box by four pixels to retain generated edge alpha.
4. Resize all 48 crops with one shared scale, **0.5517241379310345**, using nearest-neighbor resampling. Original alpha values are retained by this sampling.
5. Pack in fixed 128 × 128 cells with horizontal bottom-center alignment at (64,112).
6. Inspect the complete atlas against an opaque dark background. All 48 poses are populated, including complete raised weapons and spell effects; no sprite touches a cell edge.

The six columns are six authored poses, not a six-frame walk loop. Runtime animation should sequence the two walk poses (with idle as a rest pose), and use separate attack/cast/hurt poses with its existing timing.

## Generation prompt

```text
Use case: stylized-concept. Asset type: production transparent pixel-art animation atlas for an HD-2D fantasy RPG battle. Create a single RGBA PNG sprite sheet on a truly transparent background, 1536 pixels wide by 2048 pixels tall. EXACT uniform grid of SIX columns and EIGHT rows, each cell 256x256, total 48 separate full-body sprites. No visible grid. Each row repeats the SAME character in six different poses. Columns from left to right: 1 calm combat idle, 2 walking with left foot forward, 3 walking with right foot forward, 4 distinct weapon attack extended toward right, 5 raising hand or weapon for magic/ability, 6 recoiling hurt. Rows top to bottom: 1 stout human knight with blue tabard, steel plate, broad sword and shield; 2 red-haired elven ranger with dark green hood, leather armor and bow; 3 agile human rogue with burgundy scarf, dark leather and twin daggers; 4 aged human wizard with blue robes, blue pointed hat and wooden staff with cyan crystal; 5 female priest with ivory gold robes, hood and golden staff; 6 orc shaman with green skin, ochre fur shoulders, leather armor and wooden totem staff; 7 gray fantasy wolf with pale muzzle and thick fur (quadruped in all poses, column 5 howling); 8 hostile goblin with green skin, rust-red ragged armor, oversized ears, curved dagger. All face right in three-quarter side view. Consistent identity, proportions, costume, colors and scale WITHIN each row. Crisp exquisite old-school 32-bit JRPG pixel art, nuanced 5-tone color ramps, strong dark pixel outlines, clean clustered pixels, warm upper-left highlights, beautiful detailed readable equipment, absolutely no vector outlines or soft painterly strokes. Each figure occupies roughly 160 pixels tall in its 256-pixel cell, wolf roughly 120 pixels tall, with full weapons and ears contained inside its own cell. Center each figure horizontally. Feet exactly at y=220 within every cell, plenty of clear transparent gutter surrounding every figure. Keep every sprite strictly inside its uniform cell. No text, labels, numbers, borders, ground, scenery, drop shadows, checkerboard, background color or opaque background. Real transparent alpha essential. Full atlas, all 48 sprites visible and uncropped.
```

## Targeted edit prompt

```text
Edit this supplied sprite atlas for production use. Preserve EXACTLY the same 8 characters, their outfits, colors, style and six poses. Fix ONLY layout, clipping and spacing: every one of the 48 sprites must fit wholly inside its own cell with a large transparent gutter. Use exactly six equal-width columns and eight equal-height rows. Scale EVERY character down to 65% of its current size WITHIN each cell, so each sprite including weapons and spell effects fits in the central 65% of the cell. Most critically the raised knight sword in row 1 column 5 must be fully visible, with empty space above the complete sword tip. Set every sprite's feet to the same 85%-of-cell-height baseline, with all weapons and spell effects above this baseline. No neighboring sprites or spell glows may touch or cross into adjacent cells. Keep actual transparent background / RGBA alpha, no ground shadows. Exactly 48 sprites. No text, no border, no checkerboard. Crisp readable pixel art and hard pixel edges, not blurry. Transparent margins around the whole sheet. The purpose is a regular game spritesheet where fixed rectangular cells never clip any body or equipment.
```

