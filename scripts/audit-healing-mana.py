"""Export independently parsed healing costs from SHA-verified ClassicDB."""
import json
from pathlib import Path
from classic_sql import read_sql,SOURCE_COMMIT,SOURCE_SHA256
root=Path(__file__).resolve().parents[1]
_,tables=read_sql(root/'.cache/raid-calibration/ClassicDB.sql.gz',{'spell_template'})
names={'Lesser Heal','Heal','Greater Heal','Flash Heal','Renew','Prayer of Healing','Holy Nova','Holy Light','Flash of Light','Healing Wave','Lesser Healing Wave','Chain Heal','Healing Touch','Regrowth','Rejuvenation','Tranquility','Swiftmend'}
keys=['Id','SpellName','SpellLevel','ManaCost','ManaCostPerlevel','ManaCostPercentage','PowerType']
rows=[{k:s[k] for k in keys} for s in tables['spell_template'] if s['SpellName'] in names and s['SpellFamilyName'] in [6,7,10,11] and s['SpellLevel']<=60]
output=root/'work/healing-mana-source.json';output.parent.mkdir(exist_ok=True);output.write_text(json.dumps({'commit':SOURCE_COMMIT,'sha256':SOURCE_SHA256,'spells':rows},indent=2))
print(f'Extracted {len(rows)} healing spell cost records: {output}')
