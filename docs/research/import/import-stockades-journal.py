"""Rebuild Stockades and the Classic dungeon journal from the SHA-pinned SQL.

Run from any directory: python docs/research/import/import-stockades-journal.py
Boss membership and Chinese display names are curated; numeric records are SQL.
Reference/group loot retains its source path; unknown effective rates stay null.
"""
import json, math, re
from pathlib import Path
from collections import defaultdict
from extract_classic import read_sql, SOURCE_SHA256, SOURCE_COMMIT

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'packages/game-data/data'
# Explicit encounter roster includes optional, summoned and rare bosses. Wings
# are browsing subdivisions, not separate assertions about original map IDs.
ROSTER=[
 ('ragefire-chasm','怒焰裂谷','奥格瑞玛',8,'13–18',389,[11517,11518,11519,11520]),
 ('wailing-caverns','哀嚎洞穴','贫瘠之地',10,'17–24',43,[3671,3669,3670,3673,3653,3654,3674,5775,3655,3652,3672]),
 ('deadmines','死亡矿井','西部荒野',10,'18–23',36,[644,3586,643,642,1763,646,647,639,645]),
 ('shadowfang-keep','影牙城堡','银松森林',14,'22–30',33,[3914,3886,3887,4278,4279,3872,4274,3927,4275,14682]),
 ('blackfathom-deeps','黑暗深渊','灰谷',15,'24–32',48,[4887,4831,6243,12902,12876,4830,4832,4829]),
 ('stockades','暴风城监狱','暴风城',15,'24–30',34,[1696,1666,1717,1663,1716,1720]),
 ('gnomeregan','诺莫瑞根','丹莫罗',19,'29–38',90,[6231,7361,6215,7079,6235,6229,7800,6228]),
 ('razorfen-kraul','剃刀沼泽','贫瘠之地',17,'29–38',47,[4421,4420,4422,4424,4428,4842,6168]),
 ('scarlet-monastery-graveyard','血色修道院·墓地','提瑞斯法林地',20,'28–35',189,[3983,4543,6488,6489,6490]),
 ('scarlet-monastery-library','血色修道院·图书馆','提瑞斯法林地',20,'32–39',189,[3974,6487]),
 ('scarlet-monastery-armory','血色修道院·武器库','提瑞斯法林地',20,'35–42',189,[3975]),
 ('scarlet-monastery-cathedral','血色修道院·大教堂','提瑞斯法林地',20,'38–45',189,[3976,3977,4542]),
 ('razorfen-downs','剃刀高地','贫瘠之地',25,'37–46',129,[7355,7356,7357,7354,8567,7358]),
 ('uldaman','奥达曼','荒芜之地',30,'40–50',70,[6910,6906,6907,6908,7291,7228,7023,7206,2748,4854,7057]),
 ('zul-farrak','祖尔法拉克','塔纳利斯',35,'44–54',209,[8127,7272,10082,7271,7796,7795,7275,7267,7797,7273,10080,10081]),
 ('maraudon-purple','玛拉顿·紫色水晶','凄凉之地',30,'45–52',349,[12236,12237,13718]),
 ('maraudon-orange','玛拉顿·橙色水晶','凄凉之地',30,'45–52',349,[13282,12258]),
 ('maraudon-inner','玛拉顿·内殿','凄凉之地',30,'48–55',349,[12225,12203,13601,13596,12201]),
 ('sunken-temple','沉没的神庙','悲伤沼泽',35,'50–60',109,[5712,5713,5714,5715,5716,5717,8580,5709,5710,5721,5720,5722,5719,8443,5711]),
 ('blackrock-depths','黑石深渊','黑石山',40,'52–60',230,[9018,9025,9016,9319,10096,9024,9031,9029,9028,9030,9027,9032,9026,9041,9042,9437,9438,9439,9441,9442,9443,9476,9056,9017,9156,9033,8983,9537,9543,9499,9502,8923,9938,8929,9019,9040,9034,9035,9036,9037,9038,9039]),
 ('lower-blackrock-spire','黑石塔下层','黑石山',45,'55–60',229,[9196,9236,9237,10596,10376,10584,9736,10220,10268,9718,9218,9219,9217,9596,16080,9568]),
 ('upper-blackrock-spire','黑石塔上层','黑石山',45,'58–60',229,[9816,10264,10509,10899,10430,10429,10339,10263,16042,10363]),
 ('dire-maul-east','厄运之槌·东','菲拉斯',45,'55–60',429,[14354,14327,14349,13280,11490,16097,11492]),
 ('dire-maul-west','厄运之槌·西','菲拉斯',45,'57–60',429,[11489,11487,11488,11496,11486,14506,14502,11467]),
 ('dire-maul-north','厄运之槌·北','菲拉斯',45,'57–60',429,[14326,14322,14321,14323,14325,14324,11501]),
 ('scholomance','通灵学院','西瘟疫之地',45,'58–60',289,[14861,10506,10503,11622,10433,10432,14516,16118,10508,10505,11261,10901,10507,10504,10502,1853]),
 ('stratholme-live','斯坦索姆·血色区','东瘟疫之地',45,'58–60',329,[10393,16101,16102,11058,10558,10516,11143,11032,10997,10808,10811,10812,10813]),
 ('stratholme-undead','斯坦索姆·亡灵区','东瘟疫之地',45,'58–60',329,[10435,10809,10437,10438,10436,10439,10440]),
]
NPC_ZH={1696:'可怕的塔格尔',1666:'卡姆·深怒',1717:'哈姆霍克',1663:'迪克斯特·瓦德',1716:'巴基尔·斯瑞德',1720:'布鲁高·铁拳',1706:'迪菲亚囚徒',1707:'迪菲亚罪犯',1708:'迪菲亚狱友',1711:'迪菲亚俘虏',1715:'迪菲亚叛军',1719:'典狱官塞尔沃特',1721:'尼科瓦·拉斯克',270:'议员米尔斯迪普',859:'卫兵伯尔顿',1074:'莫特雷·加玛森',1646:'巴隆斯·阿历克斯顿',332:'马迪亚斯·肖尔',482:'埃林·提亚斯',7766:'泰里恩',1749:'女伯爵卡特拉娜·普瑞斯托',1754:'格雷戈·莱斯科瓦公爵',1755:'沉默之刃马尔松',8856:'泰里恩的间谍机器人'}
QUEST_ZH={303:'黑铁战争',377:'罪与罚',378:'深怒的卡姆',386:'伸张正义',387:'镇压暴动',388:'鲜血的颜色',373:'未寄出的信',389:'巴基尔·斯瑞德',391:'监狱暴动',392:'好奇的访客',393:'往日的阴影',350:'老朋友',2745:'潜入城堡',2746:'必备物品',434:'袭击！',394:'禽兽的首级',395:'兄弟会的灭亡',396:'觐见国王'}

def build(t):
 cs={r['Entry']:r for r in t['creature_template']}; items={r['entry']:r for r in t['item_template']}; qs={r['entry']:r for r in t['quest_template']}
 locale=json.loads((OUT/'localization.json').read_text(encoding='utf-8'))
 icons=json.loads((OUT/'icon-map.json').read_text(encoding='utf-8'))
 def name(kind,id,english):return (locale.get(kind,{}).get(str(id),{}).get('nameZhCN') or (NPC_ZH.get(id) if kind=='npcs' else None) or english)
 loot=defaultdict(list); refs=defaultdict(list); objectloot=defaultdict(list)
 for r in t['gameobject_loot_template']:objectloot[r['entry']].append(r)
 chest_rewards={9039:12260,11501:16577,11032:13580,16101:17919,16102:17919}
 for r in t['creature_loot_template']:loot[r['entry']].append(r)
 for r in t['reference_loot_template']:refs[r['entry']].append(r)
 def expand(rows,path=(),seen=frozenset(),group=0):
  for r in rows:
   if group and r['groupid']!=group:continue
   step={'entry':r['entry'],'item':r['item'],'chance':r['ChanceOrQuestChance'],'group':r['groupid'],'mincountOrRef':r['mincountOrRef'],'maxcount':r['maxcount'],'condition':r.get('condition_id',0)}
   p=path+(step,)
   if r['mincountOrRef']<0:
    ref=-r['mincountOrRef']
    if ref in seen: raise ValueError('Recursive reference loot')
    yield from expand(refs[ref],p,seen|{ref},r['groupid'])
   elif r['item'] in items:yield items[r['item']],p
 def presentation(item,path):
  id=item['entry']; simple=len(path)==1 and not path[0]['group'] and not path[0]['condition'] and path[0]['chance']>0
  return {'id':id,'name':name('items',id,item['name']),'icon':'/icons/'+icons['items'][str(id)] if str(id) in icons.get('items',{}) else None,'quality':item['Quality'],'level':item['RequiredLevel'],'itemLevel':item['ItemLevel'],'slot':item['InventoryType'],'armor':item['armor'],'damage':[{'min':item[f'dmg_min{n}'],'max':item[f'dmg_max{n}'],'school':item[f'dmg_type{n}']} for n in range(1,6) if item[f'dmg_max{n}']],'speed':item['delay']/1000,'stats':[{'type':item[f'stat_type{n}'],'value':item[f'stat_value{n}']} for n in range(1,11) if item[f'stat_value{n}']],'source':{'table':'creature_loot_template','paths':[list(path)],'probabilityNote':'原始独立掉落率' if simple else '参考表、分组或任务条件掉落；不推断最终概率'},'chance':path[0]['chance'] if simple else None}
 journal=[]
 for id,zh,zone,minimum,recommended,mapid,bids in ROSTER:
  bosses=[]
  for bid in bids:
   c=cs[bid]; drops={}
   for item,path in list(expand(loot[c['LootId']]))+list(expand(objectloot[chest_rewards[bid]]) if bid in chest_rewards else []):
    # Journal includes equipment, quest items and recipes, but not every shared
    # grey/food/currency trash roll from world reference tables.
    if not(item['InventoryType'] or item['class'] in (9,12) or item['Quality']>=2):continue
    if item['entry'] in drops:drops[item['entry']]['source']['paths'].append(list(path));drops[item['entry']]['chance']=None
    else:drops[item['entry']]=presentation(item,path)
    if bid in chest_rewards and path[0]['entry']==chest_rewards[bid]:
     drops[item['entry']]['source']['table']='gameobject_loot_template'
     drops[item['entry']]['source']['reward']='Encounter chest; conditions and tribute eligibility apply'
     drops[item['entry']]['chance']=None
   bosses.append({'id':bid,'name':name('npcs',bid,c['Name']),'rare':c['Rank'] in (2,4),'description':f"{zh} · {c['Name']} · 等级 {c['MinLevel']}–{c['MaxLevel']}"+(' · 副本入口区域' if bid in (3655,3652,3672,6231,7057,13718,9026) else ''),'loot':sorted(drops.values(),key=lambda i:(-i['quality'],i['id']))})
  journal.append({'id':id,'name':zh,'zone':zone,'minimumLevel':minimum,'recommendedLevel':recommended,'description':f'{zone}的经典旧世地下城。建议等级 {recommended}；可浏览固定、可选及稀有首领的来源掉落。','playable':id in ('deadmines','stockades'),'bosses':bosses})
 sources={'database':{'commit':SOURCE_COMMIT,'sha256':SOURCE_SHA256,'url':f'https://github.com/cmangos/classic-db/tree/{SOURCE_COMMIT}'},'roster':'Curated Classic 1.12 dungeon boss roster; includes Upper Blackrock Spire (Classic 10-player dungeon).','loot':'Equipment, recipes, quest and uncommon+ items, recursively expanded reference loot. Raw source paths retained; null chance means effective probability not calculated. Random enchantments are not rolled in journal.','localization':'Existing project Chinese names plus curated Stockades translations; exact source English fallback.'}
 guids={r['guid']:r for r in t['creature'] if r['map']==34}; choices=defaultdict(list)
 for r in t['creature_spawn_entry']:
  if r['guid'] in guids: choices[r['guid']].append(r['entry'])
 qids=set(QUEST_ZH); npcids=set(NPC_ZH)|{1051,1052,1053,1054}; links={i:{'starts':[],'ends':[]} for i in qids}
 for table,key in [('creature_questrelation','starts'),('creature_involvedrelation','ends')]:
  for r in t[table]:
   if r['quest'] in qids:links[r['quest']][key].append({'type':'creature','id':r['id']});npcids.add(r['id'])
 for i in items.values():
  if i['startquest'] in qids:links[i['startquest']]['starts'].append({'type':'item','id':i['entry']})
 for s in guids.values():npcids.update(choices[s['guid']] or [s['id']])
 encounters=[]; bossids={1663,1666,1696,1716,1717,1720}
 def encounter(spawns,boss=None):
  cooked=[]
  for s in spawns:
   ids=choices[s['guid']] or [s['id']]
   cooked.append({**s,'templateChoices':[{'entry':i,'name':cs[i]['Name'],'chancePercent':100/len(ids),'probabilityEvidence':'fixed template' if len(ids)==1 else 'creature_spawn_entry uniform source selection'} for i in ids]})
  sequence=len(encounters)+1
  encounters.append({'id':f'stockades-{sequence:02d}','nameZh':NPC_ZH[boss] if boss else f'监狱囚室 {sequence}','kind':'boss' if boss else 'trash','sequence':sequence,'classification':'2D route adaptation; one canonical location per boss; original coordinates retained','optional':boss==1720,'rareChancePercent':20 if boss==1720 else None,'sourceGuids':[s['guid'] for s in spawns],'creatureTemplateIds':sorted({c['entry'] for s in cooked for c in s['templateChoices']}),'sourceSpawns':cooked,'sourceCentroid':{k:sum(s[k] for s in spawns)/len(spawns) for k in ['position_x','position_y','position_z']}})
 trash=sorted([s for s in guids.values() if s['id'] not in bossids and s['guid'] not in range(3400105,3400109)],key=lambda s:(s['position_x'],s['position_y'],s['guid']))
 # Small pulls preserve all ordinary SQL GUIDs. Spatial grouping is an explicit
 # simulation adaptation, not an assertion of original aggro/navmesh geometry.
 for n in range(0,len(trash),3):encounter(trash[n:n+3])
 for bid in [1696,1666,1717,1663,1720,1716]:encounter([min((s for s in guids.values() if s['id']==bid),key=lambda s:s['guid'])],bid)
 out={}; out['quest_template']=[qs[i] for i in sorted(qids)]
 out['creature_template']=[cs[i] for i in sorted(npcids)]
 out['creature']=[s for s in t['creature'] if s['id'] in npcids or s['guid'] in guids]
 out['creature_spawn_entry']=[r for r in t['creature_spawn_entry'] if r['guid'] in guids]
 for table in ['creature_questrelation','creature_involvedrelation']:out[table]=[r for r in t[table] if r['quest'] in qids]
 out['creature_loot_template']=[r for r in t['creature_loot_template'] if r['entry'] in {c['LootId'] for c in out['creature_template']}]
 neededrefs={-r['mincountOrRef'] for r in out['creature_loot_template'] if r['mincountOrRef']<0}
 while True:
  more={-r['mincountOrRef'] for i in neededrefs for r in refs[i] if r['mincountOrRef']<0}-neededrefs
  if not more:break
  neededrefs|=more
 out['reference_loot_template']=[r for i in sorted(neededrefs) for r in refs[i]]
 itemids={r['item'] for k in ['creature_loot_template','reference_loot_template'] for r in out[k] if r['mincountOrRef']>=0}
 for q in out['quest_template']:
  itemids.update(v for k,v in q.items() if k=='SrcItemId' or re.match(r'(ReqItemId|ReqSourceId|RewChoiceItemId|RewItemId)\d+$',k))
 itemids.update(i['entry'] for i in items.values() if i['startquest'] in qids)
 out['item_template']=[items[i] for i in sorted(itemids) if i in items]
 out['creature_ai_scripts']=[r for r in t['creature_ai_scripts'] if r['creature_id'] in npcids]
 out['creature_equip_template']=[r for r in t['creature_equip_template'] if r['entry'] in {c['EquipmentTemplateId'] for c in out['creature_template']}]
 spellids={r[f'action{n}_param1'] for r in out['creature_ai_scripts'] for n in range(1,4) if r[f'action{n}_type']==11}
 spellids.update(r[f'spellid_{n}'] for r in out['item_template'] for n in range(1,6) if r[f'spellid_{n}']>0)
 # NPC stance forms use the core warrior passives; fear and Thrash invoke
 # child spells. Retain the full dependency closure, not just direct AI casts.
 spellids.update({7376,21156})
 allspells={r['Id']:r for r in t['spell_template']}
 while True:
  more={allspells[i][f'EffectTriggerSpell{n}'] for i in spellids if i in allspells for n in range(1,4) if allspells[i][f'EffectTriggerSpell{n}']}-spellids
  if not more:break
  spellids|=more
 out['spell_template']=[r for r in t['spell_template'] if r['Id'] in spellids]
 # Clara's apple gathering source and full source location are retained.
 out['gameobject_loot_template']=[r for r in t['gameobject_loot_template'] if r['item']==8683]
 gids={r['entry'] for r in t['gameobject_template'] if r['type']==3 and r['data1'] in {l['entry'] for l in out['gameobject_loot_template']}}
 out['gameobject_template']=[r for r in t['gameobject_template'] if r['entry'] in gids]
 out['gameobject']=[r for r in t['gameobject'] if r['id'] in gids]
 entrance=next(r for r in t['areatrigger_teleport'] if r['id']==101)
 xp={i:[math.ceil(qs[i]['RewMoneyMaxLevel']/.6*(1 if p-qs[i]['QuestLevel']<=5 else {6:.8,7:.6,8:.4,9:.2}.get(p-qs[i]['QuestLevel'],.1))-1e-10) for p in range(1,61)] for i in sorted(qids)}
 placements={270:['lakeshire'],859:['darkshire'],1074:['dunmodr'],1719:['stockades'],1721:['oldtown'],1646:['cathedral'],332:['oldtown'],482:['stormwind'],7766:['keep'],1749:['keep']}
 result={'meta':{'map':34,'sourceCount':len(guids),'routeCombatSpawnCount':sum(len(e['sourceGuids']) for e in encounters),'encounterCount':len(encounters),'rareHandling':'Bruegal pool45103: 4 substitutes at20% each, remaining20% divided over4 rare positions. Runtime selects one canonical position and persists seeded20% presence.','grouping':'All ordinary source GUIDs preserved; canonical boss positions, route order and pull grouping are 2D adaptations.'},'sources':sources,'entranceRaw':entrance,'entrance':{'areaTriggerId':101,'minimumLevel':entrance['required_level'],'map':34,'position_x':entrance['target_position_x'],'position_y':entrance['target_position_y'],'position_z':entrance['target_position_z']},'encounters':encounters,'ambientSpawns':[],'tables':out,'questLinks':links,'questXpByPlayerLevel':xp,'localization':{'quests':{i:{'nameZhCN':v} for i,v in QUEST_ZH.items()},'npcs':{i:{'nameZhCN':v} for i,v in NPC_ZH.items()}},'npcPlacements':placements}
 return result,{'dungeons':journal,'sources':sources}

if __name__=='__main__':
 names={'creature_template','creature','creature_spawn_entry','quest_template','creature_questrelation','creature_involvedrelation','item_template','creature_loot_template','reference_loot_template','creature_ai_scripts','creature_equip_template','spell_template','areatrigger_teleport','gameobject_template','gameobject_loot_template','gameobject'}
 _,tables=read_sql(ROOT/'.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz',names)
 stock,journal=build(tables)
 for filename,data in [('stockades-reference.json',stock),('dungeon-journal.json',journal)]:
  path=OUT/filename;path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8');print(filename,path.stat().st_size)
 print('encounters',len(stock['encounters']),'dungeons',len(journal['dungeons']),'bosses',sum(len(d['bosses']) for d in journal['dungeons']))
