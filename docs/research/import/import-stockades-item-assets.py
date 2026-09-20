"""Display-only Chinese item identities and verified 2019 icon bytes.

No live tooltip numeric fields are imported into the simulation. Scope follows
the pinned Stockades quest bundle plus its three unique boss equipment drops.
"""
import argparse
import hashlib
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).with_name('stockades-item-assets')
COMMIT = 'b852b560442b31579e77ef3967b3c2d594832da8'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'wow-sim-reference-import/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', type=Path, default=Path('C:/workspace/wow-sim-research/icons/source-tree.json'))
    args = parser.parse_args()
    source_raw = (ROOT / 'packages/game-data/data/stockades-reference.json').read_bytes()
    source = json.loads(source_raw)
    ids = {2941, 2942, 3228}
    for quest in source['tables']['quest_template']:
        ids.update(value for key, value in quest.items() if value and re.fullmatch(r'(SrcItemId|ReqItemId[1-4]|RewItemId[1-4]|RewChoiceItemId[1-6])', key))
    tree_raw = args.tree.read_bytes()
    paths = {r['path'].lower(): r for r in json.loads(tree_raw.decode('utf-8-sig'))['tree'] if r['type'] == 'blob'}
    tooltips = OUT / 'tooltips'
    tooltips.mkdir(parents=True, exist_ok=True)

    def tooltip(item_id):
        url = f'https://nether.wowhead.com/classic/tooltip/item/{item_id}?locale=4'
        path = tooltips / f'item-{item_id}.json'
        raw = path.read_bytes() if path.exists() else fetch(url)
        data = json.loads(raw)
        if not re.search(r'[\u3400-\u9fff]', data.get('name', '')) or not re.fullmatch('[a-z0-9_]+', data.get('icon', '').lower()):
            raise ValueError(f'Invalid Chinese display identity for item {item_id}')
        path.write_bytes(raw)
        return item_id, data, {'itemId': item_id, 'url': url, 'file': path.relative_to(ROOT).as_posix(), 'sha256': digest(raw)}

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(tooltip, sorted(ids)))
    icons = sorted({data['icon'].lower() for _, data, _ in rows})

    def asset(icon):
        entry = paths.get(icon + '.png')
        if not entry:
            raise ValueError(f'Icon absent from pinned archive: {icon}')
        url = f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{COMMIT}/ICONS/{entry["path"]}'
        path = ROOT / 'apps/web/public/icons/assets' / (icon + '.png')
        raw = path.read_bytes() if path.exists() else fetch(url)
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if blob != entry['sha'] or not raw.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Icon archive mismatch: {icon}')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        return {'icon': icon, 'file': path.relative_to(ROOT).as_posix(), 'url': url, 'gitBlobSha1': blob, 'sha256': digest(raw)}

    with ThreadPoolExecutor(max_workers=4) as pool:
        assets = list(pool.map(asset, icons))
    items = {str(item_id): {'nameZhCN': data['name'], 'icon': f'assets/{data["icon"].lower()}.png', 'sourceUrl': record['url']} for item_id, data, record in rows}
    result = {'status': 'Display-only current Classic Chinese identities; verified pinned 2019 prelaunch PNG bytes; no numeric changes', 'items': items}
    manifest = {'commit': COMMIT, 'scopeSourceSha256': digest(source_raw), 'treeSha256': digest(tree_raw), 'items': [record for _, _, record in rows], 'assets': assets}
    (ROOT / 'packages/game-data/data/stockades-item-assets.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(items)} Chinese item identities and {len(assets)} verified icons.')


if __name__ == '__main__':
    main()
