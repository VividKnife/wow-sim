"""Import the pinned, audited Deadmines research without large SQL caches."""
import hashlib
import json
import sys
from pathlib import Path
from extract_classic import read_sql

root = Path(__file__).resolve().parents[3]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / 'wow-sim-research/deadmines-reference'
names = ['deadmines-route.json', 'deadmines-mechanics.json', 'deadmines-raw.json', 'sources.json']
data = {n: json.loads((source / n).read_text(encoding='utf-8')) for n in names}
route = data[names[0]]
guids = [g for e in route['encounters'] for g in e['sourceGuids']]
assert len(guids) == len(set(guids)) == 198
assert len(route['encounters']) == 58
assert len(route['ambientSpawns']) == 9
raw = data[names[2]]['tables']
archive = root / '.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == data['sources.json']['database']['sha256']
_, entrance_tables = read_sql(str(archive), {'areatrigger_teleport', 'creature_equip_template'})
entrance = next(row for row in entrance_tables['areatrigger_teleport'] if row['id'] == 78)
equip_ids = {r['EquipmentTemplateId'] for r in raw['creature_template']}
raw['creature_equip_template'] = [r for r in entrance_tables['creature_equip_template'] if r['entry'] in equip_ids]
result = {
    'meta': route['meta'],
    'sources': data['sources.json'],
    'inputSha256': {n: hashlib.sha256((source / n).read_bytes()).hexdigest() for n in names},
    'entranceRaw': entrance,
    'entrance': {'areaTriggerId': 78, 'minimumLevel': entrance['required_level'], 'map': 36,
                 'position_x': -14.5732, 'position_y': -385.475, 'position_z': 62.4561,
                 'source': 'same pinned SQL areatrigger_teleport entry 78'},
    'encounters': route['encounters'],
    'ambientSpawns': route['ambientSpawns'],
    'scriptObjects': {'smiteChest': next(r for r in raw['gameobject'] if r['id'] == 144111),
                      'smiteSpawn': next(r for r in raw['creature'] if r['id'] == 646)},
    'mechanics': data[names[1]],
    'tables': {k: raw[k] for k in ['spell_template', 'item_template', 'creature_template',
                                  'creature_loot_template', 'reference_loot_template', 'creature_ai_scripts',
                                  'creature_equip_template']},
}
target = root / 'apps/web/data/deadmines-reference.json'
target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{target}: {target.stat().st_size} bytes; 58 encounters, 198 unique combat GUIDs')
