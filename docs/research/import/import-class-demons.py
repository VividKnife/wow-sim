"""Import the pinned world records required by Inferno and Ritual of Doom."""
from pathlib import Path
import json
from extract_classic import read_sql,SOURCE_COMMIT,SOURCE_SHA256
ROOT=Path(__file__).resolve().parents[3]
_,tables=read_sql(ROOT/'.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz',{'gameobject_template','creature_ai_scripts','creature_template_spells','spell_template','spell_scripts'})
ids={1122,18540,18541,20625,22703,22707,19483,19474,19482,89,21949}
selected={'gameobject_template':[r for r in tables['gameobject_template'] if r['entry']==177193],'creature_ai_scripts':[r for r in tables['creature_ai_scripts'] if r['creature_id'] in [89,11859]],'creature_template_spells':[r for r in tables['creature_template_spells'] if r['entry'] in [89,11859]]}
allsp={r['Id']:r for r in tables['spell_template']}
for _ in range(6):
 old=len(ids)
 for sid in list(ids):
  for n in range(1,4):
   x=allsp.get(sid,{}).get(f'EffectTriggerSpell{n}',0)
   if x:ids.add(x)
 if len(ids)==old:break
selected['spell_template']=[allsp[sid] for sid in sorted(ids) if sid in allsp]
(ROOT/'apps/web/data/class-demons-reference.json').write_text(json.dumps({'source':{'commit':SOURCE_COMMIT,'sha256':SOURCE_SHA256,'core':'8ec338a1704e7dcb1c0213eb7ed58f9231ade40f'},'tables':selected},separators=(',',':')),encoding='utf8')
