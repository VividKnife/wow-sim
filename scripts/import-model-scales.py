"""Import Classic display/body scales without rebaking GLBs. Cached and reproducible."""
import concurrent.futures
import hashlib
import json
import math
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'packages/game-data/data'
CACHE = ROOT / '.cache/model-scales'
BASE = 'https://wow.zamimg.com/modelviewer/classic/meta/'


def read(name):
    return json.loads((DATA / f'{name}.json').read_text())


def fetch(key):
    path = CACHE / f'{key}.json'
    if not path.exists():
        for attempt in range(4):
            try:
                request = urllib.request.Request(BASE + key + '.json', headers={'User-Agent': 'wow-sim-model-scales/1.0'})
                with urllib.request.urlopen(request, timeout=30) as response:
                    raw = response.read()
                json.loads(raw)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(raw)
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(attempt + 1)
    raw = path.read_bytes()
    scale = json.loads(raw)['Scale']
    assert isinstance(scale, (int, float)) and math.isfinite(scale) and scale > 0, key
    return key, scale, hashlib.sha256(raw).hexdigest()


def main():
    displays = set(read('classic-battle-models-manifest')['models']) | set(read('molten-core-models-manifest')['models'])
    bodies = read('classic-characters-manifest')['bodies']
    body_ids = {key: (int(key.split('-')[0])-1)*2+int(key.split('-')[1])+1 for key in bodies}
    # Classic playable CreatureDisplayInfo IDs; verify against each baked body.
    player_displays = dict(zip(['1-0','1-1','2-0','2-1','3-0','3-1','4-0','4-1',
                                '5-0','5-1','6-0','6-1','7-0','7-1','8-0','8-1'],
                               [49,50,51,52,53,54,55,56,57,58,59,60,1563,1564,1478,1479]))
    keys = sorted({f'npc/{display}' for display in displays | set(map(str, player_displays.values()))})
    keys += sorted(f'character/{value}' for value in body_ids.values())
    records = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        for index, (key, scale, digest) in enumerate(pool.map(fetch, keys)):
            records[key] = (scale, digest)
            if index % 250 == 0:
                print(f'{index + 1}/{len(keys)} scales', flush=True)
    for body, display in player_displays.items():
        metadata = json.loads((CACHE / f'npc/{display}.json').read_text())
        assert metadata['Model'] == bodies[body]['modelId'], body
    # Match catalog precedence; zero means use the display scale, not zero size.
    entries = {}
    bundles = ['classic-reference', 'quest-supplement-reference', 'deadmines-reference', 'stockades-reference',
               'classes-reference', 'professions-templates', 'class-demons-reference', 'dungeon-script-reference',
               'molten-core-loot', 'world-reference', 'raid-combat-reference']
    for name in bundles:
        bundle = read(name)
        rows = bundle.get('tables', {}).get('creature_template', [])
        if 'creature_template' in bundle.get('tableData', {}):
            rows = json.loads(bundle['tableData']['creature_template'])
        for row in rows:
            if isinstance(row, list):
                row = dict(zip(bundle['schemas']['creature_template'], row))
            entries.setdefault(str(row['Entry']), row.get('Scale', 0))
    output = {
        'schemaVersion': 1,
        'source': BASE + '{npc/displayId|character/chrModelId}.json',
        'sourceSha256': hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest(),
        'templateSources': bundles,
        'displays': {key: records[f'npc/{key}'][0] for key in sorted(displays, key=int)},
        'characterDisplays': player_displays,
        'characters': {key: records[f'npc/{display}'][0] * records[f'character/{body_ids[key]}'][0]
                       for key, display in player_displays.items()},
        'entries': {key: value for key, value in sorted(entries.items(), key=lambda item: int(item[0])) if value > 0},
    }
    (DATA / 'model-scales.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(displays)} displays, {len(bodies)} bodies and {len(output["entries"])} template overrides.')


if __name__ == '__main__':
    main()
