# Transformation sprite provenance

Generated 2026-09-19 using the built-in `image_gen` tool, which does not expose model selection.

- Runtime file: `forms.png`, **768 × 384 RGBA**, 6 columns × 3 rows.
- Cell dimensions: **128 × 128**.
- Foot anchor: **(64,112)** / **(0.5,0.875)**, verified on all 18 solid-alpha content bounds.
- Rows: 0 bear, 1 cat (panther), 2 sheep.
- Columns: 0 idle, 1 walk1, 2 walk2, 3 attack, 4 cast/ability, 5 hurt.
- Facing: right. Use horizontal flip for left-facing units.
- Use nearest-neighbor filtering and disable mipmaps.
- `forms-source.png` is the original unmodified **1774 × 887 RGBA** generation.
- `forms-atlas.json` records exact metadata and source crops.
- `forms-preview.jpg` is the opaque inspection contact sheet, not a runtime asset.

Normalization follows the character atlas process: detect 18 connected components with alpha > 50 and component area > 300, group by foot baseline then horizontal position, expand content bounds by four pixels, apply a single shared scale (**0.36363636363636365**) using nearest-neighbor resampling, preserve sampled alpha, center in cells, and align every solid foot baseline at 112. The original source is preserved. No character drawing or texture content was fabricated by code.

All 18 poses were inspected against an opaque background. Tails, ears, paws and fur fit inside their cells with transparent gutters. Bear, feline and sheep have distinct silhouettes. The ability pose is a roar, stealth crouch, or alert pose respectively, with no baked spell glow.

## Generation prompt

```text
Use case: stylized-concept. Asset type: production transparent pixel-art animation sprite atlas for an HD-2D fantasy RPG battle. Make one PNG with genuine transparent RGBA background. EXACTLY SIX COLUMNS and THREE ROWS, total 18 separate full-body quadruped animal sprites. Invisible regular grid, each cell with generous empty gutters. ROW 1: the SAME massive dark brown druid bear, powerful shoulders, tawny muzzle, subtle green-gold nature bracer on front ankle, broad readable bear silhouette, quadruped throughout. ROW 2: the SAME sleek dark violet-black druid panther cat, golden eyes, long curved tail, muscular feline silhouette, subtle green-gold ankle adornment. ROW 3: the SAME small ivory sheep, soft wool curls, black face and black hooves, no horns, clearly a sheep silhouette. All eighteen sprites face RIGHT in three-quarter side view. The six columns are: 1 combat idle standing, 2 walking left front paw forward, 3 walking right front paw forward, 4 lunging attack toward right with open mouth (sheep headbutt), 5 ability pose (bear roar, cat low stealth-ready crouch, sheep alert with head lifted), 6 hurt recoil. Preserve exact animal identity, coat colors, shape and proportions within each row. No humans, riders, equipment beyond specified ankle band, humanoid limbs or background. Style: exquisite classic 32-bit RPG pixel art, crisp pixel clusters, detailed fur and wool, strong dark pixel outline, nuanced warm highlights upper-left, 5-tone color ramps, beautiful readable animal anatomy, never smooth vector or soft painted illustration. Bear should be large and heavy, cat lower and longer, sheep clearly smaller. Each animal, including tail and every paw, must fit fully inside its cell with at least 20% empty transparent margin on all sides. No tail, paw, hair or effect may cross between cells. All feet aligned at 80% of cell height. Transparent margins around entire canvas. No labels, text, numbers, outlines of grid, checkerboard, ground, shadows, scenery, spell glows or solid-color background. EXACTLY 18 sprites, complete and uncropped, neatly separated on real transparent alpha.
```

