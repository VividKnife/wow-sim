"""Import pet family diets and training costs from the pinned Classic client DBCs."""
from pathlib import Path
import hashlib,json,struct,urllib.request
ROOT=Path(__file__).resolve().parents[3]
HASHES={'CreatureFamily':'8aad31f39db46773cf309e90d14a7e53a6ab7a7988331d4296ab52275a018503','SkillLineAbility':'3c09ed367dfbbc9e249e493ccc4dcd4d27cf1b781bed8f49ee2190dd612e586b','CreatureSpellData':'73fbb130f1cb465f2e802d726fc4ffc399037dd4e616f403dd9764afbb0b673a'}
COMMIT='93b11b73ee4e483ce414f3d5f99a9047d23a9e48'
def rows(name):
 p=ROOT/'.cache/source-data/professions'/f'{name}.dbc';p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists():p.write_bytes(urllib.request.urlopen(f'https://raw.githubusercontent.com/soyalu/cmangos-classic-map/{COMMIT}/dbc/{name}.dbc',timeout=30).read())
 b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==HASHES[name],f'{name} provenance mismatch'
 magic,n,f,z,_=struct.unpack_from('<4s4I',b);assert magic==b'WDBC'
 return[struct.unpack_from('<'+str(f)+'I',b,20+i*z) for i in range(n)]
result={'source':f'https://github.com/soyalu/cmangos-classic-map/tree/{COMMIT}/dbc','sha256':HASHES,'families':{str(r[0]):{'skillLines':list(r[5:7]),'petFoodMask':r[7]} for r in rows('CreatureFamily')},'training':{str(r[2]):r[14] for r in rows('SkillLineAbility') if r[14]>0}}
result['creatureSpellData']={str(r[0]):[sid for sid in r[1:5] if sid] for r in rows('CreatureSpellData')}
(ROOT/'apps/web/data/pet-family-reference.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf8')
