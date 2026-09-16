"""Import display-only assets for the checked-in 1–20 journey item scope.

Tooltip names/icon identities are current Classic reference information.
PNG bytes are pinned to the existing 2019 prelaunch archive and verified with
its Git tree. No item stats, prices, drop rates or requirements are imported.
"""
import argparse
import hashlib
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).with_name('journey-item-assets')
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
    scope_raw = (OUT / 'scope.json').read_bytes()
    scope = json.loads(scope_raw)
    tree_raw = args.tree.read_bytes()
    tree = json.loads(tree_raw.decode('utf-8-sig'))
    paths = {r['path'].lower(): r for r in tree['tree'] if r['type'] == 'blob'}
    tooltips = OUT / 'tooltips'
    tooltips.mkdir(exist_ok=True)

    def tooltip(item_id):
        url = f'https://nether.wowhead.com/classic/tooltip/item/{item_id}?locale=4'
        path = tooltips / f'item-{item_id}.json'
        raw = path.read_bytes() if path.exists() else fetch(url)
        data = json.loads(raw)
        if not isinstance(data.get('name'), str) or not re.fullmatch('[a-z0-9_]+', data.get('icon', '').lower()):
            raise ValueError(f'Invalid tooltip for item {item_id}')
        path.write_bytes(raw)
        return item_id, data, {'itemId': item_id, 'url': url, 'file': path.relative_to(ROOT).as_posix(), 'sha256': digest(raw)}

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(tooltip, scope['itemIds']))
    mapping, missing, records = {}, [], []
    unique = sorted({d['icon'].lower() for _, d, _ in rows if d['icon'].lower() + '.png' in paths})

    def asset(icon):
        entry = paths[icon + '.png']
        url = f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{COMMIT}/ICONS/{entry["path"]}'
        path = ROOT / 'apps/web/public/icons/assets' / (icon + '.png')
        raw = path.read_bytes() if path.exists() else fetch(url)
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if blob != entry['sha'] or not raw.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Archive mismatch for {icon}')
        path.write_bytes(raw)
        return {'icon': icon, 'file': path.relative_to(ROOT).as_posix(), 'url': url, 'gitBlobSha1': blob, 'sha256': digest(raw)}

    with ThreadPoolExecutor(max_workers=4) as pool:
        assets = list(pool.map(asset, unique))
    for item_id, data, record in rows:
        icon = data['icon'].lower()
        image = f'assets/{icon}.png' if icon in unique else None
        mapping[str(item_id)] = {'nameZhCN': data['name'], 'icon': image, 'sourceUrl': record['url']}
        records.append({**record, 'icon': icon})
        if image is None:
            missing.append({'itemId': item_id, 'icon': icon, 'reason': 'Not present in pinned 2019 texture archive'})
    result = {'status': 'Display-only current Classic identity and names; pinned 2019 prelaunch PNG bytes; no numeric changes', 'items': mapping}
    manifest = {'commit': COMMIT, 'scopeSha256': digest(scope_raw), 'treeSha256': digest(tree_raw), 'items': records, 'assets': assets, 'missing': missing}
    (ROOT / 'apps/web/data/journey-item-assets.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'items': len(mapping), 'uniqueAssets': len(assets), 'missing': missing}, ensure_ascii=False))


if __name__ == '__main__':
    main()
