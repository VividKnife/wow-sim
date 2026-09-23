"""Extract spell and summoned creature dependencies for dungeon scripts."""
import json,re
from pathlib import Path
from classic_sql import read_sql,SOURCE_COMMIT,SOURCE_SHA256
ROOT=Path(__file__).resolve().parents[1]
_,tables=read_sql(ROOT/'.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz',{'spell_template','creature_template','creature_ai_scripts'})
spells={s['Id']:s for s in tables['spell_template']}
ids=set()
for path in (ROOT/'.cache/classic-boss-scripts').glob('*.cpp'):
    ids.update(map(int,re.findall(r'^\s*SPELL_\w+\s*=\s*(\d+)',path.read_text(encoding='utf8'),re.M)))
creatures={7915,6575,7076,10120,7309,7077}
ais=[r for r in tables['creature_ai_scripts'] if r['creature_id'] in creatures]
for r in ais:
    ids.update(r[f'action{n}_param1'] for n in [1,2,3] if r[f'action{n}_type']==11)
while True:
    before=len(ids)
    for entry in list(ids):
        if entry in spells:ids.update(spells[entry][f'EffectTriggerSpell{n}'] for n in [1,2,3] if spells[entry][f'EffectTriggerSpell{n}'])
    if len(ids)==before:break
result={'sourceCommit':SOURCE_COMMIT,'sourceSha256':SOURCE_SHA256,'tables':{'spell_template':[spells[i] for i in sorted(ids) if i in spells],'creature_template':[r for r in tables['creature_template'] if r['Entry'] in creatures],'creature_ai_scripts':ais}}
(ROOT/'packages/game-data/data/dungeon-script-reference.json').write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf8')
print({k:len(v) for k,v in result['tables'].items()})
