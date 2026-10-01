"""Import the complete spell_threat table from the project's pinned ClassicDB.

The original regional/level-20 extract omits higher ranks. Do not infer those
values from rank 1 or silently manufacture threat for missing source rows.
"""
import argparse
import json
from pathlib import Path

from extract_classic import read_sql, SOURCE_COMMIT, SOURCE_SHA256

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive', type=Path)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
schemas, tables = read_sql(args.archive, {'spell_threat'})
rows = sorted(tables['spell_threat'], key=lambda row: row['entry'])
assert len(rows) == len({row['entry'] for row in rows})
payload = {
    'sourceRepository': 'https://github.com/cmangos/classic-db',
    'sourceCommit': SOURCE_COMMIT,
    'archiveSha256': SOURCE_SHA256,
    'status': 'Complete community Classic 1.12 reference table; not official 2019 certification',
    'schemas': {'spell_threat': schemas['spell_threat']},
    'tables': {'spell_threat': rows},
}
root = Path(__file__).resolve().parents[3]
destination = root / 'packages/game-data/data/spell-threat-reference.json'
output = json.dumps(payload, ensure_ascii=False, indent=2) + '\n'
if args.check:
    if destination.read_text(encoding='utf8') != output:
        raise SystemExit('Spell threat reference is stale; rerun this extractor.')
else:
    destination.write_text(output, encoding='utf8')
print(f'{"Verified" if args.check else "Extracted"} {len(rows)} spell threat records')
