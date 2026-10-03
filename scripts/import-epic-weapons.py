"""Import level-60 weapon dependencies from the pinned, hash-verified ClassicDB."""
import json
import urllib.request
from pathlib import Path
from classic_sql import read_sql, SOURCE_COMMIT, SOURCE_SHA256

ROOT = Path(__file__).resolve().parents[1]
archive = ROOT / '.cache/raid-calibration/ClassicDB.sql.gz'
archive.parent.mkdir(parents=True, exist_ok=True)
if not archive.exists():
    urllib.request.urlretrieve(f'https://raw.githubusercontent.com/cmangos/classic-db/{SOURCE_COMMIT}/Full_DB/ClassicDB_1_12_1_z2815.sql.gz', archive)
_, tables = read_sql(archive, {'item_template', 'spell_template', 'creature_template', 'creature_loot_template', 'quest_template', 'creature_questrelation', 'creature_involvedrelation'})
item_ids = {17182, 17193, 17204, 17203, 18592, 18628, 18608, 18609, 18646, 18659, 18665,
            18703, 18704, 18705, 18707, 18708, 18713, 18714, 18715, 18724,
            18952, 18953, 18954, 18955, 18401, 18489, 18492, 18513, 18348,
            18563, 18564, 19016, 19017, 19018, 19019, 22726, 22727, 22733, 22734, 22737,
            22589, 22630, 22631, 22632}
creature_ids = {14530, 14533, 14534, 14535, 14435, 16387}
quest_ids = {7507, 7508, 7509, 7604, 7621, 7622, 7632, 7633, 7634, 7635, 7636,
             7785, 7786, 7787, 9250, 9251, 9257, 9269, 9270, 9271}
selected_items = [r for r in tables['item_template'] if r['entry'] in item_ids]
spell_ids = {r[f'spellid_{n}'] for r in selected_items for n in range(1, 6)} - {0}
selected_spells = {}
while spell_ids - selected_spells.keys():
    wanted = spell_ids - selected_spells.keys()
    found = {r['Id']: r for r in tables['spell_template'] if r['Id'] in wanted}
    if not found:
        break
    selected_spells.update(found)
    spell_ids.update(r[f'EffectTriggerSpell{n}'] for r in found.values() for n in range(1, 4) if r[f'EffectTriggerSpell{n}'])
selected_creatures = [r for r in tables['creature_template'] if r['Entry'] in creature_ids]
loot_ids = {r['LootId'] for r in selected_creatures}
result = {'meta': {'source': 'https://github.com/cmangos/classic-db', 'commit': SOURCE_COMMIT,
                   'archiveSha256': SOURCE_SHA256, 'note': 'Source records; node adaptations live in epic-weapons.js.'},
          'tables': {'item_template': selected_items, 'spell_template': list(selected_spells.values()),
                     'creature_template': selected_creatures,
                     'creature_loot_template': [r for r in tables['creature_loot_template'] if r['entry'] in loot_ids or r['item'] == 19017],
                     'quest_template': [r for r in tables['quest_template'] if r['entry'] in quest_ids]},
          'questLinks': {}}
for kind, table in [('starts', 'creature_questrelation'), ('ends', 'creature_involvedrelation')]:
    for r in tables[table]:
        if r['quest'] in quest_ids:
            result['questLinks'].setdefault(str(r['quest']), {'starts': [], 'ends': []})[kind].append({'type': 'creature', 'id': r['id']})
for r in selected_items:
    if r['startquest'] in quest_ids:
        result['questLinks'].setdefault(str(r['startquest']), {'starts': [], 'ends': []})['starts'].append({'type': 'item', 'id': r['entry']})
(ROOT / 'packages/game-data/data/epic-weapons-reference.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print({name: len(rows) for name, rows in result['tables'].items()})
