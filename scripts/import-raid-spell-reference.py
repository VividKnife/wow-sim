"""Extract unscaled raid spell effects from the pinned ClassicDB and script snapshot."""
import concurrent.futures,hashlib,json,re,urllib.request
from pathlib import Path
from classic_sql import read_sql,SOURCE_COMMIT,SOURCE_SHA256
ROOT=Path(__file__).resolve().parents[1]
CORE='8ec338a1704e7dcb1c0213eb7ed58f9231ade40f'
CACHE=ROOT/'work/raid-reference';CACHE.mkdir(parents=True,exist_ok=True)
names=['lucifron','magmadar','gehennas','garr','baron_geddon','shazzrah','sulfuron_harbinger','golemagg','majordomo_executus','ragnaros','onyxia']
def fetch(name):
 region='kalimdor/onyxias_lair' if name=='onyxia' else 'eastern_kingdoms/molten_core'
 path=f'src/game/AI/ScriptDevAI/scripts/{region}/boss_{name}.cpp'
 url=f'https://raw.githubusercontent.com/cmangos/mangos-classic/{CORE}/{path}'
 file=CACHE/f'{name}.cpp'
 if not file.exists():file.write_bytes(urllib.request.urlopen(url).read())
 raw=file.read_bytes()
 return raw.decode(),{'url':f'https://github.com/cmangos/mangos-classic/blob/{CORE}/{path}','sha256':hashlib.sha256(raw).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(6) as pool:sources=list(pool.map(fetch,names))
_,tables=read_sql(ROOT/'.cache/raid-calibration/ClassicDB.sql.gz',{'spell_template'})
spells={s['Id']:s for s in tables['spell_template']}
ids={19428}
for raw,_ in sources:ids.update(map(int,re.findall(r'^\s*(?://\s*)?SPELL_\w+\s*=\s*(\d+)',raw,re.M)))
while True:
 before=len(ids)
 for i in list(ids):
  if i in spells:ids.update(spells[i][f'EffectTriggerSpell{n}'] for n in [1,2,3] if spells[i][f'EffectTriggerSpell{n}'])
 if before==len(ids):break
out={'sourceCommit':SOURCE_COMMIT,'sourceSha256':SOURCE_SHA256,'coreCommit':CORE,'sources':[s for _,s in sources],
 'spells':{i:{k:v for k,v in spells[i].items() if k in ['Id','School','Dispel','DurationIndex','SpellName','CastingTimeIndex'] or k.startswith('Effect')} for i in sorted(ids) if i in spells}}
(ROOT/'packages/game-data/data/raid-spell-reference.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print('Extracted',len(out['spells']),'spells from pinned sources')
