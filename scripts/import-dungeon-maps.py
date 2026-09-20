"""Assemble unmodified Blizzard map tiles from the pinned Classic texture mirror.
Requires Pillow. Run from the repository root; outputs lossless maps + provenance.
"""
import concurrent.futures
import hashlib
import io
import json
import urllib.request
from pathlib import Path
from PIL import Image

revision = 'b852b560442b31579e77ef3967b3c2d594832da8'
root = Path(__file__).resolve().parents[1]
output = root / 'apps/web/public/maps/dungeons'
output.mkdir(parents=True, exist_ok=True)
manifest = {'revision': revision, 'copyright': 'Blizzard Entertainment', 'assets': []}

for name, floors in [('TheDeadmines', [1, 2]), ('TheStockade', [1])]:
    listing = json.load(urllib.request.urlopen(
        f'https://api.github.com/repos/Gethe/wow-ui-textures/contents/WorldMap/{name}?ref={revision}', timeout=30))
    indexed = {row['name']: row for row in listing}
    for floor in floors:
        def fetch(n):
            row = indexed[f'{name}{floor}_{n}.PNG']
            data = urllib.request.urlopen(row['download_url'], timeout=30).read()
            blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
            assert blob == row['sha'], 'Texture bytes do not match pinned Git blob'
            tile = Image.open(io.BytesIO(data)).convert('RGB')
            assert tile.size == (256, 256)
            return n, tile, {'url': row['download_url'], 'gitBlob': blob, 'sha256': hashlib.sha256(data).hexdigest()}
        with concurrent.futures.ThreadPoolExecutor(6) as pool:
            tiles = list(pool.map(fetch, range(1, 13)))
        canvas = Image.new('RGB', (1024, 768))
        for n, tile, _ in tiles:
            canvas.paste(tile, (((n - 1) % 4) * 256, ((n - 1) // 4) * 256))
        # The game displays the tiled texture through a 1002 x 668 map viewport.
        canvas = canvas.crop((0, 0, 1002, 668))
        filename = f'{name.lower()}-{floor}.webp'
        canvas.save(output / filename, lossless=True)
        manifest['assets'].append({
            'file': filename, 'floor': floor, 'width': 1002, 'height': 668,
            'sha256': hashlib.sha256((output / filename).read_bytes()).hexdigest(),
            'tiles': [row for _, _, row in tiles],
            'transformation': '4 columns x 3 rows of original 256px tiles; viewport crop to 1002x668; lossless WebP',
        })
        print(filename, (output / filename).stat().st_size)

(root / 'docs/research/import/dungeon-maps-manifest.json').write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
