"""Import the pinned ClassicDB 1-40 world into the node-based simulation.

Run node scripts/export-world-geography.mjs, then this script. Source records
are packed without inventing quest text, enemy stats, or loot probabilities.
"""
import json, math
from pathlib import Path
from collections import defaultdict
from classic_sql import read_sql, SOURCE_SHA256, SOURCE_COMMIT

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'packages/game-data/data'
geo = json.loads((ROOT / '.cache/world-geography.json').read_text(encoding='utf8'))
nodes = geo['nodes']
journal = json.loads((OUT / 'dungeon-journal.json').read_text(encoding='utf8'))['dungeons']
dungeons = {d['id']: d for d in geo['dungeons']}
maps = {d['map'] for d in dungeons.values()} | {0, 1, 34, 36}
wanted = set('quest_template creature creature_template creature_spawn_entry spawn_group spawn_group_entry spawn_group_spawn gameobject gameobject_spawn_entry gameobject_template creature_questrelation creature_involvedrelation gameobject_questrelation gameobject_involvedrelation item_template creature_loot_template reference_loot_template gameobject_loot_template conditions npc_vendor npc_vendor_template creature_ai_scripts spell_template creature_template_classlevelstats areatrigger_teleport playercreateinfo'.split())
schemas, t = read_sql(ROOT / '.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz', wanted)
creatures = {c['Entry']: c for c in t['creature_template']}
alternatives = defaultdict(set)
for r in t['creature_spawn_entry']: alternatives[r['guid']].add(r['entry'])
groups = defaultdict(set)
creature_groups = {r['Id'] for r in t['spawn_group'] if r['Type'] == 0}
for r in t['spawn_group_entry']: groups[r['Id']].add(r['Entry'])
for r in t['spawn_group_spawn']:
    if r['Id'] in creature_groups: alternatives[r['Guid']].update(groups[r['Id']])

def nearest(r):
    pool = [n for n in nodes.values() if n.get('map', 0) == r['map'] and n.get('x') is not None and n['kind'] != 'dungeon']
    if not pool: return None
    n = min(pool, key=lambda n: (n['x']-r['position_x'])**2+(n['y']-r['position_y'])**2)
    return n['id'] if math.hypot(n['x']-r['position_x'], n['y']-r['position_y']) < 2200 else None

spawns=[]
placements=defaultdict(set)
for r in t['creature']:
    if r['map'] not in maps: continue
    choices = {r['id']} if r['id'] else alternatives[r['guid']]
    choices = {i for i in choices if i in creatures}
    node = nearest(r) if r['map'] in (0,1) else None
    if r['map'] in (0,1) and (not node or not any(creatures[i]['MinLevel'] <= 45 or creatures[i]['NpcFlags'] for i in choices)): continue
    for entry in sorted(choices):
        spawns.append({**r,'id':entry})
        if node: placements[entry].add(node)

links=defaultdict(lambda:{'starts':[],'ends':[]})
for name,kind,field in [('creature_questrelation','creature','starts'),('creature_involvedrelation','creature','ends'),('gameobject_questrelation','gameobject','starts'),('gameobject_involvedrelation','gameobject','ends')]:
    for r in t[name]: links[r['quest']][field].append({'type':kind,'id':r['id']})
for r in t['item_template']:
    if r['startquest']: links[r['startquest']]['starts'].append({'type':'item','id':r['entry']})
# All source quests through level 40, plus prerequisites. Quest levels above 40
# belonging to in-scope dungeons remain available at their original minimum.
instance_zones={2437,718,209,719,721,491,796,722,1337,1581,717}
allq={q['entry']:q for q in t['quest_template']}
qids={q['entry'] for q in allq.values() if q['MinLevel']<=40 and (0<q['QuestLevel']<=40 or q['QuestLevel']==-1 or q['ZoneOrSort'] in instance_zones and q['QuestLevel']<=50) and links[q['entry']]['starts'] and links[q['entry']]['ends']}
while True:
    deps={abs(allq[i]['PrevQuestId']) for i in qids} & allq.keys()
    if deps <= qids: break
    qids |= deps
quests=[allq[i] for i in sorted(qids)]

references={}
boss_orders={
 'ragefire-chasm':[11517,11520,11518,11519],
 'wailing-caverns':[3655,3652,3672,3671,3669,3653,3670,3674,3673,5775,3654],
 'razorfen-kraul':[4424,4428,6168,4420,4842,4422,4421],
 'scarlet-monastery-cathedral':[4542,3976,3977],
 'uldaman':[6906,6907,6908,6910,7228,7023,7206,7291,4854,7057,2748],
}
for jid,d in dungeons.items():
    j=next(j for j in journal if j['id']==jid)
    bosses={b['id']:b for b in j['bosses']}
    entrance_candidates=[r for r in t['areatrigger_teleport'] if r['target_map']==d['map']]
    if d['map']==189:
        word=jid.split('-')[-1]
        entrance_candidates=[r for r in entrance_candidates if word in r['name'].lower()]
    entrance=entrance_candidates[0]
    origin={'position_x':entrance['target_position_x'],'position_y':entrance['target_position_y'],'position_z':entrance['target_position_z'],'minimumLevel':d['minimumLevel']}
    raw=[r for r in spawns if r['map']==d['map']]
    if d['map']==189:
        entrances=[r for r in t['areatrigger_teleport'] if r['target_map']==189]
        raw=[r for r in raw if min(entrances,key=lambda e:(r['position_x']-e['target_position_x'])**2+(r['position_y']-e['target_position_y'])**2)['id']==entrance['id']]
    byguid=defaultdict(list)
    for r in raw:
        c=creatures[r['id']]
        if (c['NpcFlags'] or c['Civilian'] or c['CreatureType'] in (8,10,12) or c['Faction'] in (1,35)) and r['id'] not in bosses: continue
        byguid[r['guid']].append(r)
    packs=[]; used=set()
    # Bosses keep their journal order. Nearby source trash forms small pulls;
    # omitted scripted summons are explicit adapted spawns, never fake source GUIDs.
    ordered=sorted(j['bosses'],key=lambda b:boss_orders[jid].index(b['id'])) if jid in boss_orders else j['bosses']
    for b in ordered:
        candidates=[r for r in raw if r['id']==b['id']]
        if candidates:
            chosen=min(candidates,key=lambda r:r['guid'])
            for r in candidates: used.add(r['guid'])
        else:
            chosen={'guid':f"adapted:{jid}:{b['id']}",'id':b['id'],'map':d['map'],**origin}
        packs.append(('boss',b['name'],[chosen]))
    trash=[rs for g,rs in sorted(byguid.items()) if g not in used and not any(r['id'] in bosses for r in rs)]
    # Preserve every source trash GUID, grouped into manageable three-mob pulls.
    trash.sort(key=lambda rs:(rs[0]['position_x']-origin['position_x'])**2+(rs[0]['position_y']-origin['position_y'])**2)
    trash_packs=[('trash',f"{j['name']} · 巡逻队 {i//3+1}",trash[i:i+3]) for i in range(0,len(trash),3)]
    route=[]
    chunk=max(1,math.ceil(len(trash_packs)/max(1,len(packs))))
    for i,boss in enumerate(packs): route.extend(trash_packs[i*chunk:(i+1)*chunk]);route.append(boss)
    if not packs: route=trash_packs
    encounters=[]
    for i,(kind,name,rows) in enumerate(route):
        sources=[]
        for row in rows:
            options=row if isinstance(row,list) else [row]
            sources.append({**options[0],'templateChoices':[{'entry':r['id']} for r in options]})
        entries=sorted({v['entry'] for r in sources for v in r['templateChoices']})
        rare=kind=='boss' and any(bosses.get(e,{}).get('rare') for e in entries)
        encounter={'id':f'{jid}-{i+1:03}','nameZh':name,'kind':kind,'optional':rare,'sourceGuids':[r['guid'] for r in sources],'creatureTemplateIds':entries,'sourceSpawns':sources,'sourceCentroid':{key:sum(r[key] for r in sources)/len(sources) for key in ['position_x','position_y','position_z']}}
        if set(entries)&{6906,6907,6908}:encounter['faction']='Horde'
        encounters.append(encounter)
    references[jid]={'id':jid,'name':j['name'],'zone':nodes[d['parent']]['region'],'entrance':jid,'minimumLevel':d['minimumLevel'],'recommendedLevel':d['min'],'description':'经典旧世节点式副本：按改编路线清理守卫、挑战首领并获取原始掉落。','rareEntries':{str(b['id']):.2 for b in j['bosses'] if b.get('rare')},'reference':{'entrance':origin,'encounters':encounters}}
    for e in encounters:
        for entry in e['creatureTemplateIds']: placements[entry].add(jid)

cids={r['id'] for r in spawns}|{i for d in references.values() for e in d['reference']['encounters'] for i in e['creatureTemplateIds']}
for q in quests:
    cids.update(e['id'] for e in links[q['entry']]['starts']+links[q['entry']]['ends'] if e['type']=='creature')
    cids.update(q['ReqCreatureOrGOId'+str(n)] for n in (1,2,3,4) if q['ReqCreatureOrGOId'+str(n)]>0)
# These source NPCs/objects are script summons or on the tram instance map;
# their node placements are explicitly adapted, not asserted source spawns.
placements[5895].add('ambermill')
placements[12997].add('dwarven')
placements[13018].add('ironforge')
# Retain objects only in reachable regions/instances.
object_entries=defaultdict(set)
for r in t['gameobject_spawn_entry']: object_entries[r['guid']].add(r['entry'])
objects=[]
for r in t['gameobject']:
    if r['map'] not in maps or r['map'] in (0,1) and not nearest(r):continue
    for entry in ({r['id']} if r['id'] else object_entries[r['guid']]):objects.append({**r,'id':entry})
objects.append({'guid':-10076,'id':10076,'map':1,'position_x':4580,'position_y':450,'position_z':0,'spawntimesecsmin':30,'spawntimesecsmax':30})
oids={r['id'] for r in objects}
go_templates=[r for r in t['gameobject_template'] if r['entry'] in oids]
lootids={creatures[i]['LootId'] for i in cids if i in creatures}
loot=[r for r in t['creature_loot_template'] if r['entry'] in lootids]
glootids={r['data1'] for r in go_templates if r['type'] in (3,25)}
gloot=[r for r in t['gameobject_loot_template'] if r['entry'] in glootids]
refs={-r['mincountOrRef'] for r in loot+gloot if r['mincountOrRef']<0}
while True:
    deps={-r['mincountOrRef'] for r in t['reference_loot_template'] if r['entry'] in refs and r['mincountOrRef']<0}
    if deps<=refs: break
    refs|=deps
rloot=[r for r in t['reference_loot_template'] if r['entry'] in refs]
iids={r['item'] for r in loot+gloot+rloot if r['mincountOrRef']>0}
for q in quests:
    iids.update(v for k,v in q.items() if k.startswith(('ReqItemId','RewItemId','RewChoiceItemId','ReqSourceId')) or k=='SrcItemId')
vendors=[r for r in t['npc_vendor'] if r['entry'] in cids]
vtemplates={creatures[i]['VendorTemplateId'] for i in cids if i in creatures}
vendor_templates=[r for r in t['npc_vendor_template'] if r['entry'] in vtemplates]
iids.update(r['item'] for r in vendors+vendor_templates)
iids.update(r['entry'] for r in t['item_template'] if r['startquest'] in qids)
itemrows=[r for r in t['item_template'] if r['entry'] in iids]
ai=[r for r in t['creature_ai_scripts'] if r['creature_id'] in cids]
spellids={r['action'+str(n)+'_param1'] for r in ai for n in (1,2,3) if r['action'+str(n)+'_type']==11}
spellids.update(r['spellid_'+str(n)] for r in itemrows for n in range(1,6))
spellids.update(q[k] for q in quests for k in ['SrcSpell','RewSpell','RewSpellCast','ReqSpellCast1','ReqSpellCast2','ReqSpellCast3','ReqSpellCast4'])
allsp={r['Id']:r for r in t['spell_template']}
while True:
    deps={allsp[i].get('EffectTriggerSpell'+str(n),0) for i in spellids if i in allsp for n in (1,2,3)}-{0}
    if deps<=spellids:break
    spellids|=deps
selected={'quest_template':quests,'creature_template':[creatures[i] for i in sorted(cids) if i in creatures],
 'creature':spawns,'gameobject':objects,'gameobject_template':go_templates,'item_template':itemrows,
 'creature_loot_template':loot,'reference_loot_template':rloot,'gameobject_loot_template':gloot,
 'conditions':t['conditions'],'npc_vendor':vendors,'npc_vendor_template':vendor_templates,'creature_ai_scripts':ai,
 'spell_template':[allsp[i] for i in sorted(spellids) if i in allsp],
 'creature_template_classlevelstats':t['creature_template_classlevelstats'],'playercreateinfo':t['playercreateinfo']}
def xp(q,level):
    qlevel=q['QuestLevel'] if q['QuestLevel']>0 else level
    factor=1 if level-qlevel<=5 else {6:.8,7:.6,8:.4,9:.2}.get(level-qlevel,.1)
    return math.ceil(q['RewMoneyMaxLevel']/.6*factor-1e-10)
bundle={'meta':{'source':'CMaNGOS ClassicDB','commit':SOURCE_COMMIT,'sha256':SOURCE_SHA256,'scope':'Classic 1-40 and overlapping dungeon quests','adaptation':'World locations and dungeon routes are a node-based adaptation; scripted events require explicit runtime support.'},'schemas':{k:schemas[k] for k in selected},'tableData':{k:json.dumps([[r.get(c) for c in schemas[k]] for r in rows],ensure_ascii=False,separators=(',',':')) for k,rows in selected.items()},'questLinks':{str(i):links[i] for i in sorted(qids)},'questXpByPlayerLevel':{str(q['entry']):[xp(q,l) for l in range(1,61)] for q in quests},'creaturePlacements':{str(i):sorted(v) for i,v in placements.items()},'dungeons':references}
(OUT/'world-reference.json').write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
(OUT/'world-visuals.json').write_text(json.dumps({'entries':{str(i):{'displayId':creatures[i]['ModelId1'],'creatureType':creatures[i]['CreatureType']} for i in sorted(cids) if i in creatures}},separators=(',',':'))+'\n',encoding='utf8')
print(json.dumps({k:len(v) for k,v in selected.items()}))
print('Dungeons:', {k:len(v['reference']['encounters']) for k,v in references.items()})
