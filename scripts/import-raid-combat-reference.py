"""Import complete coefficients and raid templates from the pinned ClassicDB.

Run: python3 scripts/import-raid-combat-reference.py
Downloads are cached; the archive is verified before parsing.
"""
import hashlib
import json
import urllib.request
from pathlib import Path
from classic_sql import read_sql, SOURCE_COMMIT, SOURCE_SHA256

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/raid-calibration'
CORE = '8ec338a1704e7dcb1c0213eb7ed58f9231ade40f'
CACHE.mkdir(parents=True, exist_ok=True)
archive = CACHE / 'ClassicDB.sql.gz'
if not archive.exists():
    urllib.request.urlretrieve(f'https://raw.githubusercontent.com/cmangos/classic-db/{SOURCE_COMMIT}/Full_DB/ClassicDB_1_12_1_z2815.sql.gz', archive)
assert hashlib.sha256(archive.read_bytes()).hexdigest() == SOURCE_SHA256
_, tables = read_sql(archive, {'creature_template', 'creature_template_classlevelstats', 'spell_bonus_data', 'spell_chain', 'spell_template'})
entries = {12118,11982,12259,12057,12056,12264,12098,11988,12018,11502,10184,
           12129,11658,11659,11671,11673,11669,12101,11665,11668,11661,11662,12076,
           12119,12099,11672,11663,11664,12143,11262}
creatures = [r for r in tables['creature_template'] if r['Entry'] in entries]
assert {r['Entry'] for r in creatures} == entries
result = {
    'source': {'repository': 'https://github.com/cmangos/classic-db', 'commit': SOURCE_COMMIT,
               'archiveSha256': SOURCE_SHA256, 'coreCommit': CORE,
               'status': 'Community 1.12 reference, not Blizzard server measurements'},
    'tables': {'creature_template': sorted(creatures, key=lambda r: r['Entry']),
               'creature_template_classlevelstats': tables['creature_template_classlevelstats'],
               'spell_bonus_data': tables['spell_bonus_data'], 'spell_chain': tables['spell_chain'],
               'spell_template': [r for r in tables['spell_template'] if r['SpellName'] in {'Judgement of Command', 'Seal of Command', 'Judgement of Righteousness', 'Holy Shield'}]},
}
destination = ROOT / 'packages/game-data/data/raid-combat-reference.json'
destination.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print({k: len(v) for k, v in result['tables'].items()})
