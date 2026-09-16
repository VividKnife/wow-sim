import hashlib,json
from pathlib import Path
from extract_classic import read_sql

root=Path(__file__).resolve().parents[3]
archive=root/'.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz'
_,tables=read_sql(str(archive),{'spell_template'})
rows=[r for r in tables['spell_template'] if r['Id'] in {7376,21156}]
assert len(rows)==2
payload={'sourceCommit':'22b51464f1625f6ef6275771de1f5466c6f5d19e','archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'status':'Community 1.12 reference, not official 2019 certification','spells':rows}
(root/'apps/web/data/companion-passive-reference.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Extracted Defensive Stance Passive and Battle Stance Passive')
