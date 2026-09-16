"""Import obtainable vanilla professions, without importing any world spawns.

python docs/research/import/import-professions.py
Downloads are immutable and hash checked. SQL is parsed, never executed.
"""
import collections, hashlib, json, struct, urllib.request
from pathlib import Path
from extract_classic import read_sql, SOURCE_COMMIT, SOURCE_SHA256, INSERT, tuples_at

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / '.cache/source-data/professions'
CACHE.mkdir(parents=True, exist_ok=True)
DBC_COMMIT = '93b11b73ee4e483ce414f3d5f99a9047d23a9e48'
DBC_HASH = {'SkillLineAbility': '3c09ed367dfbbc9e249e493ccc4dcd4d27cf1b781bed8f49ee2190dd612e586b', 'SpellItemEnchantment': 'dcf78cf1fd3e29aed17103c19b1ab0fbb995a0bc086c40664484572a834966b4'}

def download(name, url, digest=None):
    p=CACHE/name
    if not p.exists(): p.write_bytes(urllib.request.urlopen(url).read())
    data=p.read_bytes()
    if digest: assert hashlib.sha256(data).hexdigest()==digest, name
    return data

def dbc(name):
    b=download(name+'.dbc', f'https://raw.githubusercontent.com/soyalu/cmangos-classic-map/{DBC_COMMIT}/dbc/{name}.dbc', DBC_HASH[name])
    magic,n,fields,size,strings=struct.unpack('<4s4I',b[:20]); assert magic==b'WDBC'
    return [struct.unpack_from('<'+str(fields)+'I',b,20+i*size) for i in range(n)], b[20+n*size:]

tables={'spell_template','item_template','npc_trainer','npc_trainer_template','quest_template','creature_template','conditions','npc_vendor','npc_vendor_template','creature_loot_template','reference_loot_template','gameobject_loot_template','item_loot_template','disenchant_loot_template'}
archive=ROOT/'.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz'
if not archive.exists(): archive.write_bytes(urllib.request.urlopen(f'https://raw.githubusercontent.com/cmangos/classic-db/{SOURCE_COMMIT}/Full_DB/{archive.name}').read())
_,T=read_sql(archive,tables)
S={s['Id']:s for s in T['spell_template']}; I={i['entry']:i for i in T['item_template']}; C={c['Entry']:c for c in T['creature_template']}
P={171:'alchemy',164:'blacksmithing',165:'leatherworking',197:'tailoring',202:'engineering',333:'enchanting',185:'cooking',129:'firstaid',186:'mining',182:'herbalism',393:'skinning',356:'fishing'}
abilities,_=dbc('SkillLineAbility'); enchant_rows,strings=dbc('SpellItemEnchantment'); E={r[0]:r for r in enchant_rows}
locale=download('locales_item.sql',f'https://raw.githubusercontent.com/cmangos/classic-db/{SOURCE_COMMIT}/locales/Chinese/locales_item.sql','e1a5f654c2bae0815470852643a790d0bdcf35b8725d2570c3e1f8b40e267f21').decode('utf-8')
names={}
for m in INSERT.finditer(locale):
    for row in tuples_at(locale,m.end()): names[row[0]]=row[1]

def taught(id):
    s=S.get(id,{})
    return [s.get('EffectTriggerSpell'+str(n)) for n in range(1,4) if s.get('Effect'+str(n))==36]

train=collections.defaultdict(list); books=collections.defaultdict(list); quests=collections.defaultdict(list); item_sources=collections.defaultdict(set)
for tab,label in [('npc_vendor','商人'),('npc_vendor_template','商人'),('creature_loot_template','掉落'),('reference_loot_template','掉落'),('gameobject_loot_template','宝箱'),('item_loot_template','礼包')]:
    for row in T[tab]: item_sources[row['item']].add(label)
for q in T['quest_template']:
    for k,v in q.items():
        if k.startswith(('RewItemId','RewChoiceItemId')): item_sources[v].add('任务奖励')
    for k in ['RewSpell','RewSpellCast']:
        for id in [q[k]]+taught(q[k]): quests[id].append(q)
for s in S.values():
    for n in range(1,4):
        if s['Effect'+str(n)]==24: item_sources[s['EffectItemType'+str(n)]].add('制造')
for tab in ['npc_trainer','npc_trainer_template']:
    for row in T[tab]:
        for id in [row['spell']]+taught(row['spell']): train[id].append({**row,'template':tab.endswith('_template')})
for i in I.values():
    for n in range(1,6):
        for id in taught(i.get('spellid_'+str(n))): books[id].append(i)

# Script/gossip teaching is outside npc_trainer tables. Explicit vanilla sources.
world={14891:(230,'七贤之墓：熔炼黑铁'),22967:(300,'黑翼之巢：大元素师克里希克'),22813:(275,'厄运之槌：诺特·希姆加克'),22815:(275,'厄运之槌：诺特·希姆加克'),24266:(300,'祖尔格拉布：疯狂之缘石碑'),23489:(260,'加基森：传送器专精'),23486:(260,'永望镇：空间撕裂器专精'),22704:(300,'黑石深渊：修理机器人图纸'),23066:(150,'工程训练师：红色焰火'),26086:(280,'厄运之槌：诺特的箱子'),27586:(300,'塞纳里奥议会声望图纸'),27590:(300,'塞纳里奥议会声望图纸'),28327:(275,'暗月马戏团：蒸汽坦克控制器')}
for spell in [28205,28207,28208,28209,28219,28220,28221,28222,28223,28224,28242,28243,28244]:world[spell]=(300,'纳克萨玛斯：工匠威尔海姆／银色黎明')
world[26011]=(250,'冬泉谷：机械雪人任务')
# These have book definitions but were never obtainable in vanilla.
unavailable_books={2404,2405,2554,2599,2600,2602,4295,4997,5577,5641,6273,6734,6736,7093,7977,7994,8388,8547,10303,10304,10313,10319,10322,10324,12816,12817,12818,12826,12831,12832,13500,13517,15780,23689,23690,2556,6222,6343,6345}
spec_ids={9787,9788,17039,17040,17041,10656,10658,10660,20219,20222}
trainer_specs={7406:20219,7944:20219,8126:20222,8738:20222,7866:10656,7867:10656,7868:10658,7869:10658,7870:10660,7871:10660}
specializations=[
 [9788,'blacksmithing','护甲锻造',200,40,0],[9787,'blacksmithing','武器锻造',200,40,0],
 [17039,'blacksmithing','铸剑大师',250,50,9787],[17040,'blacksmithing','铸锤大师',250,50,9787],[17041,'blacksmithing','铸斧大师',250,50,9787],
 [10656,'leatherworking','龙鳞制皮',225,40,0],[10658,'leatherworking','元素制皮',225,40,0],[10660,'leatherworking','部族制皮',225,40,0],
 [20219,'engineering','侏儒工程学',200,30,0],[20222,'engineering','地精工程学',200,30,0]]
specs=[dict(zip(['id','profession','name','skill','level','parent'],row)) for row in specializations]

recipes=[]; excluded=[]; enchants={}; used=set(); used_spells=set()
unique={r[2]:r for r in abilities if r[1] in P and any(S.get(r[2],{}).get('Effect'+str(n)) in [24,53] for n in range(1,4))}
for id,r in sorted(unique.items()):
    s=S[id]; ts=train[id]; bs=books[id]; qs=quests[id]; obtainable=[b for b in bs if b['entry'] not in unavailable_books and item_sources[b['entry']]]
    if not (ts or qs or obtainable or r[9]==1 or id in world):
        excluded.append({'spell':id,'name':s['SpellName'],'reason':'No obtainable vanilla trainer/book/quest/script source'});continue
    n=next(n for n in range(1,4) if s['Effect'+str(n)] in [24,53]); enchant=s['Effect'+str(n)]==53
    required=min([x['reqskillvalue'] for x in ts if x['reqskillvalue']]+[x['RequiredSkillRank'] for x in bs if x['RequiredSkillRank']]+[world[id][0]] if id in world else [x['reqskillvalue'] for x in ts if x['reqskillvalue']]+[x['RequiredSkillRank'] for x in bs if x['RequiredSkillRank']]+[q['RequiredSkillValue'] for q in qs if q['RequiredSkillValue']] or [max(1,r[7])])
    if r[9]==1: required=1
    if required>300: excluded.append({'spell':id,'name':s['SpellName'],'reason':'Above vanilla skill cap'});continue
    spec=next((b['requiredspell'] for b in bs if b['requiredspell'] in spec_ids),0)
    if not spec:
        candidates={trainer_specs.get(x['entry'],C.get(x['entry'],{}).get('TrainerSpell',0)) for x in ts if not x['template']}
        spec=next((v for v in candidates if v in spec_ids),0)
    if id in [23489,23486]: spec=20219 if id==23489 else 20222
    tools=[s['Totem'+str(n)] for n in range(1,3) if s['Totem'+str(n)]]
    mats=[{'id':s['Reagent'+str(n)],'count':s['ReagentCount'+str(n)]} for n in range(1,9) if s['Reagent'+str(n)]>0 and s['ReagentCount'+str(n)]>0]
    output=max(1,s['EffectBasePoints'+str(n)]+1); maximum=max(output,s['EffectBasePoints'+str(n)]+max(1,s['EffectDieSides'+str(n)]))
    item=900000+id if enchant else s['EffectItemType'+str(n)]
    if not enchant and item not in I: raise ValueError((id,item))
    name=names.get(item,I.get(item,{}).get('name',s['SpellName']))
    source='训练师' if ts else '初始技能' if r[9]==1 else world[id][1] if id in world else '任务奖励' if qs else ' / '.join(sorted(set().union(*(item_sources[b['entry']] for b in obtainable))))+'配方'
    if enchant:
        book=next((b for b in bs if b['entry'] in names),None)
        name=names[book['entry']].removeprefix('公式：') if book else s['SpellName']
        # Trainer-only spells get translated from their slot and enchant descriptor.
        translations={'Enchant':'附魔','Weapon':'武器','2H Weapon':'双手武器','Chest':'胸甲','Bracer':'护腕','Gloves':'手套','Boots':'靴子','Shield':'盾牌','Cloak':'披风','Minor':'初级','Lesser':'次级','Greater':'强效','Superior':'超强','Major':'特效','Health':'生命','Mana':'法力','Stamina':'耐力','Strength':'力量','Agility':'敏捷','Intellect':'智力','Spirit':'精神','Protection':'防护','Defense':'防御','Stats':'属性','Impact':'冲击','Striking':'打击','Speed':'速度','Resistance':'抗性','Fire':'火焰','Frost':'冰霜','All':'全','Lifestealing':'生命偷取','Crusader':'十字军','Unholy':'邪恶','Demonslaying':'屠魔','Beastslayer':'屠兽','Beast Slaying':'屠兽','Deflection':'偏斜','Lesser Deflection':'次级偏斜','Parry':'招架','Stealth':'潜行','Riding Skill':'骑乘','Mining':'采矿','Herbalism':'采药','Fishing':'钓鱼','Skinning':'剥皮','Threat':'威胁','Healing Power':'治疗能量','Spellpower':'法术能量','Dodge':'躲闪','Mana Regeneration':'法力回复'}
        if not book:
            name=s['SpellName']
            for en,zh in sorted(translations.items(),key=lambda x:-len(x[0])):name=name.replace(en,zh)
        row=E[s['EffectMiscValue'+str(n)]]; stats={}; effects=[]
        for j in range(3):
            typ,amount,arg=row[1+j],row[4+j],row[10+j]
            if not typ:continue
            effects.append({'type':typ,'amount':amount,'spell':arg})
            if typ==5:
                key={0:'mana',1:'health',3:'agi',4:'str',5:'int',6:'spi',7:'sta'}.get(arg)
                if key:stats[key]=stats.get(key,0)+amount
            elif typ==4 and arg==0:stats['armor']=stats.get('armor',0)+amount
            elif typ==2:stats['weaponDamage']=stats.get('weaponDamage',0)+amount
            elif typ==3 and arg in S:
                aura=S[arg];used_spells.add(arg)
                for j2 in range(1,4):
                    a=aura['EffectApplyAuraName'+str(j2)]; val=aura['EffectBasePoints'+str(j2)]+1; misc=aura['EffectMiscValue'+str(j2)]
                    key={13:'spellPower',34:'health',35:'mana',135:'healing',99:'attackPower',124:'rangedAttackPower',10:'threat',29:'str',85:'manaRegen',47:'defense',49:'dodge',52:'crit',54:'hit',57:'spellCrit'}.get(a)
                    if a==13 and misc not in [126,127]:key='schoolPower'+str(misc)
                    if a==29:
                        if misc==-1:
                            for st in ['str','agi','sta','int','spi']:stats[st]=stats.get(st,0)+val
                            key=None
                        else:key={0:'str',1:'agi',2:'sta',3:'int',4:'spi'}.get(misc)
                    if key:stats[key]=stats.get(key,0)+val
        en=s['SpellName']; slots=[16,17] if 'Weapon' in en else [17] if 'Shield' in en else [5] if 'Chest' in en else [9] if 'Bracer' in en else [10] if 'Gloves' in en else [8] if 'Boots' in en else [15] if 'Cloak' in en else []
        enchants[str(id)]={'name':name,'description':name,'slots':slots,'stats':stats,'effects':effects,'class':s['EquippedItemClass'],'subclassMask':s['EquippedItemSubClassMask'],'inventoryMask':s['EquippedItemInventoryTypeMask'],'enchantmentId':row[0]}
    recipe={'id':'spell-'+str(id),'spell':id,'profession':P[r[1]],'name':name,'nameEn':s['SpellName'],'skill':max(1,required),'yellow':r[11],'gray':r[10],'item':item,'output':output,'outputMax':maximum,'materials':mats,'tools':tools,'focus':s['RequiresSpellFocus'],'specialization':spec,'cooldown':max(s['RecoveryTime'],s['CategoryRecoveryTime']),'cooldownGroup':'category-'+str(s['Category']) if s['CategoryRecoveryTime'] else 'spell-'+str(id),'source':source,'recipeItems':[b['entry'] for b in bs if b['entry'] not in unavailable_books]}
    recipes.append(recipe);used.update(m['id'] for m in mats);used.update(tools);used.update(recipe['recipeItems']);used_spells.add(id)
    if not enchant:used.add(item)

# Rank trainer/book/quest requirements. Secondary master ranks are quest taught.
rank_spells={171:[2259,3101,3464,11611],164:[2018,3100,3538,9785],165:[2108,3104,3811,10662],197:[3908,3909,3910,12180],202:[4036,4037,4038,12656],333:[7411,7412,7413,13920],185:[2550,3102,3413,18260],129:[3273,3274,7924,10846],186:[2575,2576,3564,10248],182:[2366,2368,3570,11993],393:[8613,8617,8618,10768],356:[7620,7731,7732,18248]}
ranks={}
for prof,ids in rank_spells.items():
    ranks[P[prof]]=[]
    for index,id in enumerate(ids):
        rows=train[id];secondary=prof in [185,129,356];gather=prof in [182,186,393]
        rank_books=[b for b in books[id] if item_sources[b['entry']]]
        rank_quests=quests[id]
        fallback_skill=[0,50,125,225 if secondary else 200][index]
        skill=min((r['reqskillvalue'] for r in rows),default=fallback_skill)
        level=min((r['reqlevel'] for r in rows),default=0 if gather else [5,10,20,35][index])
        cost=min((r['spellcost'] for r in rows),default=[10,500,10000,50000][index])
        if not rows and rank_books:
            skill=min(b['RequiredSkillRank'] for b in rank_books);level=min(b['RequiredLevel'] for b in rank_books);cost=min(b['BuyPrice'] for b in rank_books)
        if secondary and index==3 and rank_quests:
            skill=min(q['RequiredSkillValue'] for q in rank_quests);level=min(q['MinLevel'] for q in rank_quests)
        ranks[P[prof]].append({'cap':(index+1)*75,'skill':skill,'level':level,'cost':cost,'name':['初级','中级','高级','大师级'][index],'spell':id})

disenchant=T['disenchant_loot_template']
used.update(r['item'] for r in disenchant)
# Full material tiers can be stocked before future maps arrive.
used.update([2318,2319,4234,4304,8170,783,4232,4235,8169,8171,2770,2771,2772,3858,10620,12359,2447,765,6291,4496,4498])
potions={};bandages={}
for id in sorted(used):
    i=I[id]
    for n in range(1,6):
        spell=S.get(i['spellid_'+str(n)],{})
        if i['class']==0 and i['spelltrigger_'+str(n)]==0:
            for j in range(1,4):
                eff=spell.get('Effect'+str(j));base=spell.get('EffectBasePoints'+str(j),0);dice=max(1,spell.get('EffectDieSides'+str(j),0))
                if eff in [10,30] and (eff!=30 or spell.get('EffectMiscValue'+str(j))==0) and 'Potion' in i['name'] and id not in [9144,18253]:
                    potions[id]={'kind':'health' if eff==10 else 'mana','min':base+1,'max':base+dice}
            if 'Bandage' in i['name'] and i['RequiredSkill']==129:
                heal=sum(spell.get('EffectBasePoints'+str(j),0)+1 for j in range(1,4) if spell.get('EffectApplyAuraName'+str(j))==8)
                seconds=6 if spell.get('DurationIndex')==32 else 7 if spell.get('DurationIndex')==165 else 8
                if heal:bandages[id]={'heal':heal*seconds,'skill':i['RequiredSkillRank']}
        for j in range(1,4):
            if i['spellid_'+str(n)]:used_spells.add(i['spellid_'+str(n)])
    # Only retain nonzero fields; runtime treats absent template fields as zero.
items=[I[id] for id in sorted(used)]
# Include item aura trigger references, bounded to the necessary effect graph.
for _ in range(4):
    used_spells.update(S[id]['EffectTriggerSpell'+str(j)] for id in list(used_spells) if id in S for j in range(1,4) if S[id]['EffectTriggerSpell'+str(j)])
meta={'databaseCommit':SOURCE_COMMIT,'databaseSha256':SOURCE_SHA256,'dbcCommit':DBC_COMMIT,'dbcSha256':DBC_HASH,'localeSha256':hashlib.sha256(locale.encode()).hexdigest(),'scope':'Vanilla 1.12, skill 1–300, all phases; no SoD or expansions','counts':dict(collections.Counter(r['profession'] for r in recipes)),'adaptations':['Automatic recipe unlock at required skill','Unlimited professions','Stationary crafting facilities available in towns','Tradable synthetic enchanting scrolls','Fixed-price remote materials market'],'excluded':excluded}
out={'meta':meta,'recipes':recipes,'ranks':ranks,'specializations':specs,'enchants':enchants,'names':{id:names[id] for id in sorted(used) if id in names},'disenchant':disenchant,'potions':potions,'bandages':bandages}
path=ROOT/'apps/web/data/professions-reference.json';path.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
templates={'schemas':{},'tables':{}}
for tab,rows in [('item_template',items),('spell_template',[S[id] for id in sorted(used_spells) if id in S])]:
    columns=list(rows[0]);templates['schemas'][tab]=columns;templates['tables'][tab]=[[r.get(k,0) for k in columns] for r in rows]
(ROOT/'apps/web/data/professions-templates.json').write_text(json.dumps(templates,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print(json.dumps({'recipes':len(recipes),'counts':meta['counts'],'excluded':len(excluded),'items':len(items),'bytes':path.stat().st_size}))

