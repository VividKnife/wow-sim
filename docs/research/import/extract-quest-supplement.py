import sys,json,gzip,re
from pathlib import Path
sys.path.insert(0,'C:/workspace/wow-sim-research/data')
from extract_classic import read_sql
root=Path('C:/workspace/wow-sim-research/quest-audit')
archive='C:/workspace/wow-sim/.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz'
sql=gzip.open(archive,'rt',encoding='utf8').read()
names=re.findall(r'CREATE TABLE `([^`]+)`',sql)
wanted=[n for n in names if 'script' in n or 'spawn' in n or n in ['creature','gameobject','quest_template','item_template','gameobject_template','gameobject_loot_template','npc_vendor','npc_vendor_template','spell_template','areatrigger_involvedrelation']]
schemas,t=read_sql(archive,set(wanted))
required={3898,7206,7207,7247,7292,7308,7249}
out={}
out['quest_template']=[q for q in t['quest_template'] if any(q.get(k)==3898 for k in ['SrcItemId','RewItemId1','RewItemId2','RewItemId3','RewItemId4'])]
missing={392,1343,1228,7312,6569,6492,97,478,46,732,626,623,624,625,126}
out['creature']=[r for r in t['creature'] if r['id'] in missing]
for n in wanted:
 if 'spawn' in n: out[n]=[r for r in t[n] if r.get('entry') in missing or r.get('id') in missing]
missing_guids={r['guid'] for r in out.get('creature_spawn_entry',[])}
out['missingCreatureGuidSpawns']=[r for r in t['creature'] if r['guid'] in missing_guids]
original=json.loads(Path('C:/workspace/wow-sim/apps/web/data/classic-reference.json').read_text(encoding='utf8'))
ci=original['schemas']['creature'].index('guid')
regional_guids={r[ci] for r in original['tables']['creature']}
out['regionalCreatureSpawnEntry']=[r for r in t['creature_spawn_entry'] if r['guid'] in regional_guids]
groups={r['Id'] for r in t['spawn_group_entry'] if r['Entry'] in missing}
groups.update(r['Id'] for r in t['spawn_group_spawn'] if r['Guid'] in regional_guids)
for n in ['spawn_group','spawn_group_entry','spawn_group_spawn']:
 out[n]=[r for r in t[n] if r['Id'] in groups]
group_guids={r['Guid'] for r in out['spawn_group_spawn']}
out['groupCreatureGuidSpawns']=[r for r in t['creature'] if r['guid'] in group_guids]
loot=[r for r in t['gameobject_loot_template'] if r['item'] in required]
out['gameobject_loot_template']=loot
gids={r['entry'] for r in t['gameobject_template'] if r['data1'] in {v['entry'] for v in loot} and r['type'] in (3,25)}|{33,34}
out['gameobject_template']=[r for r in t['gameobject_template'] if r['entry'] in gids]
out['gameobject']=[r for r in t['gameobject'] if r['id'] in gids]
out['item_template']=[r for r in t['item_template'] if r['entry'] in required]
out['spell_template']=[r for r in t['spell_template'] if r['Id'] in {8919,9082,9095,9093,9096,9738,9032,9012,9010} or any(r.get('EffectItemType'+str(i)) in required for i in range(1,4))]
for n in wanted:
 if 'script' in n: out[n]=[r for r in t[n] if r.get('id') in {1920,1921,1941,155,8919,9082,9095} or r.get('entry')==467 or r.get('creature_id')==6492 or any(str(v).lower().find('rift spawn')>=0 for v in r.values())]
out['areatrigger_involvedrelation']=[r for r in t['areatrigger_involvedrelation'] if r.get('quest') in {62,76}]
(root/'supplement-source.json').write_text(json.dumps({'sourceSha':'4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0','tables':out},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:len(v) for k,v in out.items()}))
