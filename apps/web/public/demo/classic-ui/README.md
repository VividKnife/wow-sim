# Classic UI concept demo

Run `npm run demo:classic-ui` from the repository root after installing the web app dependencies. Open http://127.0.0.1:5198/classic-ui.html.

This standalone React/Vite preview uses a temporary level-20 five-person party. It never accesses account storage. Movement, mounting, two region presets, eight menu windows, responsive HUDs, and the existing combat renderer can be tried without changing the main game. Combat and damage meters use the actual simulation engine, with durable, low-damage practice enemies. Quest, inventory and PvP windows demonstrate interactions only. The 25-person grid is a layout preview, not a 25-person simulation. Changing scenes rebuilds the preview party; page refresh resets the demo.

Desktop: party frames at left, tracked quest and DPS at right. Below 800px: the playfield and action/menu bars remain; detailed party and DPS panels are available by scrolling. Menu shortcuts: N/L/C/B/I/H/P/M. Escape closes windows using Radix dialog focus handling.

## Background asset

`elwynn.jpg` was generated with the built-in image generation tool and converted to JPEG for the project. It is a concept landscape, not an extracted game screenshot.

Final prompt:

> Use case: stylized-concept. Asset type: wide 16:9 background for a playable classic World of Warcraft inspired game HUD. Create a lush Elwynn Forest / Goldshire landscape in the hand-painted stylized 3D aesthetic of the classic 2004 game: giant oak trees framing left and right, warm afternoon light filtering through green canopies, golden dirt path curving from foreground center toward a small medieval half-timber inn with blue slate roof in the middle distance on the right, wooden fences, grass and tiny wildflowers, distant hazy forest. Ground-level third-person camera, open unobstructed foreground center to overlay a 3D player character. Rich organic foliage, game environment screenshot feel, atmospheric depth, muted forest green and warm amber, no people, no characters, no interface, no lettering, no logos. Panoramic 1536x864 or similar widescreen.

Other icons, portraits, maps, animations and models reuse the existing project assets. External model requests use the same local proxy as the world-scene preview. The demo displays model loading and retry states if those assets are unavailable.

## Verification

- Web app TypeScript check and preview ESLint check passed.
- Existing `world-scene.test.mjs`: 9 tests passed.
- Browser checked at 1440×900 and 390×844: character/mounted model rendering,
  eight menu windows, quest acceptance, Escape focus restoration, 25-frame toggle,
  real combat rendering and changing DPS, scrollable details, map switching,
  mobile dialog bounds and absence of horizontal overflow/native selects.
