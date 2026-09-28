"""Import pinned WoWSims Classic gear presets; never infer missing phases/specs."""
import concurrent.futures, hashlib, json, pathlib, re, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
REV = '7779ebbf79dc7f1341e6ab939b28a3402c9a730a'
REPO = 'https://github.com/wowsims/classic'
RAW = f'https://raw.githubusercontent.com/wowsims/classic/{REV}/'
# id, class, role, localized spec, icon. Separate weapon variants remain distinct.
SPECS = {
 'warrior': ('warrior-fury', 1, 'melee', '狂暴战', 'ability_warrior_innerrage'),
 'tank_warrior': ('warrior-protection', 1, 'tank', '防护战', 'ability_warrior_defensivestance'),
 'hunter': ('hunter', 3, 'ranged', '猎人', 'ability_hunter_aimedshot'),
 'mage': ('mage-frost', 8, 'ranged', '冰霜法师', 'spell_frost_frostbolt02'),
 'warlock': ('warlock', 9, 'ranged', '术士', 'spell_shadow_shadowbolt'),
 'shadow_priest': ('priest-shadow', 5, 'ranged', '暗影牧师', 'spell_shadow_shadowwordpain'),
 'elemental_shaman': ('shaman-elemental', 7, 'ranged', '元素萨满', 'spell_nature_lightning'),
 'enhancement_shaman': ('shaman-enhancement', 7, 'melee', '增强萨满', 'spell_nature_lightningshield'),
 'balance_druid': ('druid-balance', 11, 'ranged', '平衡德鲁伊', 'spell_nature_starfall'),
 'feral_druid': ('druid-feral', 11, 'melee', '野性德鲁伊', 'ability_druid_catform'),
 'rogue': ('rogue-combat', 4, 'melee', '战斗盗贼', 'ability_backstab'),
}
def fetch(path):
 return urllib.request.urlopen(RAW+path, timeout=40).read()
tree = json.load(urllib.request.urlopen(f'https://api.github.com/repos/wowsims/classic/git/trees/{REV}?recursive=1'))
paths = sorted(x['path'] for x in tree['tree'] if '/gear_sets/' in x['path'] and x['path'].endswith('.json') and 'blank' not in x['path'])
records=[];specs={};sources=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for path, raw in zip(paths, pool.map(fetch, paths)):
  folder=path.split('/')[1]
  if folder not in SPECS: continue
  stem=path.split('/')[-1];base, cls, role, name, icon=SPECS[folder]
  phase_match=re.search(r'(?:phase_|p)([0-6])', stem)
  phase=int(phase_match[1]) if phase_match else 0 if 'prebis' in stem else 1 if stem=='mc.gear.json' else None
  if phase is None: raise ValueError(path)
  if 'pre-bis' in stem: continue # P2 pre-raid is not P2 raid BiS.
  if folder=='rogue':
   dagger='backstab' in stem;base+='-dagger' if dagger else '-sword';name+='·匕首' if dagger else '·剑'
  specs[base]={'classId':cls,'role':role,'name':name,'icon':'/icons/assets/'+icon+'.png'}
  source_id=len(sources)
  sources.append({'url':REPO+'/blob/'+REV+'/'+path,'sha256':hashlib.sha256(raw).hexdigest()})
  for entry in json.loads(raw)['items']:
   if entry.get('id',0)>0: records.append({'itemId':entry['id'],'spec':base,'phase':phase,'source':source_id})
data={'edition':'Classic Era · 60级','revision':REV,'sourceName':'WoWSims Classic','phases':{'0':'团本前','1':'熔火之心 / 奥妮克希亚','2':'厄运之槌 / 世界首领','3':'黑翼之巢','4':'祖尔格拉布','5':'安其拉','6':'纳克萨玛斯'},'specs':specs,'sources':sources,'entries':sorted(records,key=lambda r:(r['itemId'],r['spec'],r['phase']))}
(ROOT/'packages/game-data/data/classic-bis.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(ROOT/'docs/research/import/classic-bis/LICENSE.wowsims.txt').write_bytes(fetch('LICENSE'))
print(f'Imported {len(records)} memberships, {len(specs)} specs, {len(sources)} presets')
