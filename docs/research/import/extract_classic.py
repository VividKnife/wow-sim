"""Reproducible stdlib extraction from the pinned CMaNGOS ClassicDB SQL dump.

This parses MySQL INSERT VALUES, not arbitrary SQL. Strings respect MySQL
backslash escapes, doubled quotes, commas, semicolons and embedded newlines.
It never executes SQL. Source records retain their original column names.
"""
from __future__ import annotations
import argparse, gzip, hashlib, json, re
from pathlib import Path
from collections import defaultdict

SOURCE_SHA256 = '4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0'
SOURCE_COMMIT = '22b51464f1625f6ef6275771de1f5466c6f5d19e'
TOKEN = re.compile(r"\s*('(?:\\.|''|[^'\\])*'|NULL|0x[0-9A-Fa-f]+|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|[(),;])", re.S)
INSERT = re.compile(r'(?m)^INSERT INTO `([^`]+)`(?:\s*\(([^\n]*?)\))? VALUES\s*')
ESCAPES = {'0':'\0','b':'\b','n':'\n','r':'\r','t':'\t','Z':'\x1a'}

def scalar(token):
    if token == 'NULL': return None
    if token.startswith("'"):
        s=token[1:-1]; out=[]; i=0
        while i<len(s):
            if s[i]=='\\':
                i+=1; out.append(ESCAPES.get(s[i],s[i])); i+=1
            elif s[i]=="'" and i+1<len(s) and s[i+1]=="'": out.append("'"); i+=2
            else: out.append(s[i]); i+=1
        return ''.join(out)
    if token.startswith('0x'): return int(token,16)
    return float(token) if any(x in token for x in '.eE') else int(token)

def tuples_at(sql, position):
    row=None; expect='row'; need_value=False
    while True:
        m=TOKEN.match(sql,position)
        if not m: raise ValueError(f'Unsupported SQL VALUES token at {position}: {sql[position:position+80]!r}')
        token=m[1]; position=m.end()
        if token==';':
            if row is not None or expect=='row': raise ValueError('Incomplete INSERT')
            return
        if token=='(':
            if expect!='row': raise ValueError('Unexpected tuple start')
            row=[]; expect='value'; need_value=True
        elif token==')':
            if row is None or need_value: raise ValueError('Unexpected tuple end')
            yield row; row=None; expect='separator'
        elif token==',':
            if row is None:
                if expect!='separator': raise ValueError('Unexpected row separator')
                expect='row'
            else:
                if need_value: raise ValueError('Unexpected value separator')
                need_value=True
        else:
            if row is None or not need_value: raise ValueError('Unexpected scalar')
            row.append(scalar(token)); need_value=False

def read_sql(path, wanted=None):
    raw=Path(path).read_bytes()
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=SOURCE_SHA256: raise ValueError(f'Archive SHA256 mismatch: {digest}')
    sql=gzip.decompress(raw).decode('utf-8')
    schemas={n:re.findall(r'^  `([^`]+)`',b,re.M) for n,b in re.findall(r'CREATE TABLE `([^`]+)` \((.*?)\) ENGINE=',sql,re.S)}
    tables=defaultdict(list)
    for m in INSERT.finditer(sql):
        name=m[1]
        if wanted is not None and name not in wanted: continue
        columns=re.findall(r'`([^`]+)`',m[2]) if m[2] else schemas[name]
        for row in tuples_at(sql,m.end()):
            if len(row)!=len(columns): raise ValueError(f'{name} columns {len(columns)} != values {len(row)}')
            tables[name].append(dict(zip(columns,row)))
    return schemas,tables

def self_test():
    sample="(1,'a,b; (c)',NULL,'O\\'Brien','doubled''quote','line\\nnext',-2,1.5),(2,'\\\\',0,'x','y','z',3,4);"
    r=list(tuples_at(sample,0))
    assert r[0]==[1,'a,b; (c)',None,"O'Brien","doubled'quote",'line\nnext',-2,1.5]
    assert r[1][1]=='\\'

def build(schemas,t):
    classes={1,4,5,8}; zones={9,12,40,1519,1581}
    def eligible(q): return (not q['RequiredClasses'] or q['RequiredClasses']&128) and (not q['RequiredRaces'] or q['RequiredRaces']&1)
    def regional(r):
        if r['map']==36: return True
        if r['map']!=0: return False
        x,y=r['position_x'],r['position_y']
        return (-10200<=x<=-8500 and -1600<=y<=1000) or (-11400<=x<=-9800 and 0<=y<=2400) or (-9200<=x<=-7900 and 200<=y<=2200)
    spawns=[r for r in t['creature'] if regional(r)]
    local_npcs={r['id'] for r in spawns}
    qstarts=defaultdict(list); qends=defaultdict(list)
    for table,kind,dest in [('creature_questrelation','creature',qstarts),('creature_involvedrelation','creature',qends),('gameobject_questrelation','gameobject',qstarts),('gameobject_involvedrelation','gameobject',qends)]:
        for r in t[table]: dest[r['quest']].append({'type':kind,'id':r['id']})
    for r in t['item_template']:
        if r['startquest']: qstarts[r['startquest']].append({'type':'item','id':r['entry']})
    allq={r['entry']:r for r in t['quest_template']}
    qids={r['entry'] for r in allq.values() if eligible(r) and r['MinLevel']<=20 and (r['QuestLevel']<=20 or r['ZoneOrSort']==1581 and r['QuestLevel']<=22) and (r['ZoneOrSort'] in zones or r['ZoneOrSort']==-161 and any(x['type']=='creature' and x['id'] in local_npcs for x in qstarts[r['entry']]))}
    # A Deadmines boss drop starts its immediately following level-22 quest.
    if 373 in allq: qids.add(373)
    scope={i:'regional_quest' for i in qids}; scope[373]='deadmines_aftermath'
    changed=True
    while changed:
        changed=False
        for i in list(qids):
            q=allq[i]; deps={abs(q['PrevQuestId'])} if q['PrevQuestId'] else set()
            deps.update(r['entry'] for r in allq.values() if abs(r['NextQuestId'])==i or r['NextQuestInChain']==i)
            for dep in deps:
                if dep in allq and dep not in qids:
                    qids.add(dep); scope[dep]='prerequisite'; changed=True
    quests=[allq[i] for i in sorted(qids)]
    npcids={r['Entry'] for r in t['creature_template'] if r['MinLevel']<=25}
    npcids.update(local_npcs)
    goids={r['id'] for r in t['gameobject'] if regional(r)}
    for i in qids:
        for endpoint in qstarts[i]+qends[i]:
            if endpoint['type']=='creature': npcids.add(endpoint['id'])
            elif endpoint['type']=='gameobject': goids.add(endpoint['id'])
        for n in range(1,5):
            v=allq[i][f'ReqCreatureOrGOId{n}']
            if v>0: npcids.add(v)
            elif v<0: goids.add(-v)
    creatures=[r for r in t['creature_template'] if r['Entry'] in npcids]
    gos=[r for r in t['gameobject_template'] if r['entry'] in goids]
    out={'quest_template':quests,'creature_template':creatures,'creature':[r for r in spawns if r['id'] in npcids], 'gameobject_template':gos,'gameobject':[r for r in t['gameobject'] if regional(r) and r['id'] in goids]}
    for table in ['creature_questrelation','creature_involvedrelation','gameobject_questrelation','gameobject_involvedrelation']:
        out[table]=[r for r in t[table] if r['quest'] in qids]
    for table in ['player_levelstats','player_classlevelstats','player_xp_for_level','playercreateinfo','playercreateinfo_action','playercreateinfo_item','playercreateinfo_spell']:
        out[table]=[r for r in t[table] if r.get('race',1)==1 and r.get('class',1) in classes and r.get('level',r.get('lvl',1))<=20]
    out['playercreateinfo_skills']=[r for r in t['playercreateinfo_skills'] if (not r['raceMask'] or r['raceMask']&1) and (not r['classMask'] or r['classMask']&153)]
    out['creature_template_classlevelstats']=[r for r in t['creature_template_classlevelstats'] if r['Level']<= max(c['MaxLevel'] for c in creatures)]
    vendors={c['VendorTemplateId'] for c in creatures if c['Entry'] in local_npcs and c['VendorTemplateId']}
    trainers={c['TrainerTemplateId'] for c in creatures if c['Entry'] in local_npcs and c['TrainerClass'] in classes and c['TrainerTemplateId']}
    out['npc_vendor']=[r for r in t['npc_vendor'] if r['entry'] in local_npcs]
    out['npc_vendor_template']=[r for r in t['npc_vendor_template'] if r['entry'] in vendors]
    out['npc_trainer']=[r for r in t['npc_trainer'] if r['entry'] in local_npcs and r['reqlevel']<=20]
    out['npc_trainer_template']=[r for r in t['npc_trainer_template'] if r['entry'] in trainers and r['reqlevel']<=20]
    lootids={'creature_loot_template':{c['LootId'] for c in creatures},'pickpocketing_loot_template':{c['PickpocketLootId'] for c in creatures},'skinning_loot_template':{c['SkinningLootId'] for c in creatures},'gameobject_loot_template':{g['data1'] for g in gos if g['type'] in (3,25)}}
    itemids={r['item'] for table in ['npc_vendor','npc_vendor_template'] for r in out[table]}
    itemids.update(r['itemid'] for r in out['playercreateinfo_item'])
    for q in quests:
        for key,value in q.items():
            if key=='SrcItemId' or re.match(r'(ReqItemId|ReqSourceId|RewChoiceItemId|RewItemId)\d+$',key):
                if value: itemids.add(value)
    itemids.update(r['entry'] for r in t['item_template'] if r['startquest'] in qids)
    # Include low-level equipment options for the party, including vendor choices.
    itemids.update(r['entry'] for r in t['item_template'] if r['RequiredLevel']<=20 and r['ItemLevel']<=25 and r['InventoryType'] and (r['AllowableClass']==-1 or r['AllowableClass']&153))
    refs=set()
    for table,ids in lootids.items():
        out[table]=[r for r in t[table] if r['entry'] in ids and r['entry']!=0]
        for r in out[table]:
            if r['item'] and r['mincountOrRef']>=0: itemids.add(r['item'])
            if r['mincountOrRef']<0: refs.add(-r['mincountOrRef'])
    allitems={r['entry']:r for r in t['item_template']}
    seen_refs=set(); seen_items=set()
    out['reference_loot_template']=[]; out['item_loot_template']=[]; out['disenchant_loot_template']=[]
    while refs-seen_refs or itemids-seen_items:
        newrefs=refs-seen_refs; seen_refs.update(newrefs)
        rows=[r for r in t['reference_loot_template'] if r['entry'] in newrefs]
        out['reference_loot_template'].extend(rows)
        newitems=itemids-seen_items; seen_items.update(newitems)
        disenchantids={allitems[i]['DisenchantID'] for i in newitems if i in allitems}-{0}
        for table,ids in [('item_loot_template',newitems),('disenchant_loot_template',disenchantids)]:
            existing={r['entry'] for r in out[table]}
            newrows=[r for r in t[table] if r['entry'] in ids-existing]
            out[table].extend(newrows); rows.extend(newrows)
        for r in rows:
            if r['item'] and r['mincountOrRef']>=0: itemids.add(r['item'])
            if r['mincountOrRef']<0: refs.add(-r['mincountOrRef'])
    out['item_template']=[allitems[i] for i in sorted(itemids) if i in allitems]
    spellids={r['Spell'] for r in out['playercreateinfo_spell']}
    spellids.update(r['spell'] for table in ['npc_trainer','npc_trainer_template'] for r in out[table])
    # Family 3 mage,4 warrior,6 priest,8 rogue. Includes reference ranks/talents,
    # not an assertion that all such spells are player-learnable by this level.
    spellids.update(r['Id'] for r in t['spell_template'] if r['SpellFamilyName'] in (3,4,6,8) and 0<r['SpellLevel']<=20)
    spellids.update(q[k] for q in quests for k in ['SrcSpell','RewSpell','RewSpellCast'] if q[k])
    spellids.update(r[f'spellid_{n}'] for r in out['item_template'] for n in range(1,6) if r[f'spellid_{n}']>0)
    for table in ['creature_template_spells','creature_spell_list','creature_cooldowns']:
        if table=='creature_template_spells':
            out[table]=[r for r in t[table] if r['entry'] in npcids]
            spellids.update(r[f'spell{n}'] for r in out[table] for n in range(1,11) if r[f'spell{n}'])
        else:
            ids={c['SpellList'] for c in creatures} if table=='creature_spell_list' else npcids
            out[table]=[r for r in t[table] if r['Id' if table=='creature_spell_list' else 'Entry'] in ids]
            spellids.update(r['SpellId'] for r in out[table])
    allspells={r['Id']:r for r in t['spell_template']}; seen=set()
    while spellids-seen:
        new=spellids-seen; seen.update(new)
        for i in new:
            if i in allspells:
                for n in range(1,4):
                    for key in [f'EffectTriggerSpell{n}']:
                        if allspells[i][key]: spellids.add(allspells[i][key])
    out['spell_template']=[allspells[i] for i in sorted(spellids) if i in allspells]
    # Include conjured items even when they do not drop and cannot be bought.
    itemids.update(r[f'EffectItemType{n}'] for r in out['spell_template'] for n in range(1,4) if r[f'Effect{n}']==24 and r[f'EffectItemType{n}'])
    out['item_template']=[allitems[i] for i in sorted(itemids) if i in allitems]
    for table in ['spell_chain','spell_learn_spell','spell_bonus_data','spell_threat','spell_proc_event','spell_affect']:
        key=schemas[table][0]; out[table]=[r for r in t[table] if r[key] in spellids]
    out['conditions']=t['conditions']
    for table in ['quest_poi','quest_poi_points']:
        out[table]=[r for r in t[table] if r['questId'] in qids]
    for table in ['dbscripts_on_quest_start','dbscripts_on_quest_end']:
        scriptids={q['StartScript' if table.endswith('start') else 'CompleteScript'] for q in quests}-{0}
        out[table]=[r for r in t[table] if r['id'] in scriptids]
    meta={'dataset':'CMaNGOS ClassicDB 1.12.1 reference extract','status':'reference-only; not official verified','sourceRepository':'https://github.com/cmangos/classic-db','sourceCommit':SOURCE_COMMIT,'archiveSha256':SOURCE_SHA256,'schemaVersion':1,'race':1,'partyClasses':[1,4,5,8],'zones':{'9':'Northshire Valley','12':'Elwynn Forest','40':'Westfall','1519':'Stormwind City','1581':'The Deadmines'},'instanceMap':36,'selection':'Human/mage eligible QuestLevel <=20 in target zones and regional mage class quests; Deadmines <=22 plus quest373; recursively includes prerequisites. All creature templates MinLevel<=25 plus bounding-region NPCs and quest targets. Coordinates preserve the source but rectangular regional spawn selection is approximate and includes nearby boundary areas.','gaps':['No Talent.dbc or talent-tree placement/prerequisite definitions in SQL.','No SpellCastTimes.dbc, SpellDuration.dbc or SpellRange.dbc tables: corresponding spell fields are indices, not resolved milliseconds/yards.','playercreateinfo_item has no rows; standard starting outfit requires client CharStartOutfit.dbc.','No direct quest XP amount field; RewMoneyMaxLevel must not be interpreted as XP without core conversion rules.','No client area polygons; spawn inclusion uses explicitly documented approximate rectangles.','Creature stat multipliers and spell effect fields require CMaNGOS core semantics; raw data is not a complete combat rules engine.'],'counts':{k:len(v) for k,v in out.items()}}
    links={'quests':{str(i):{'starts':qstarts[i],'ends':qends[i],'scope':scope[i]} for i in sorted(qids)},'missingItemIds':sorted(itemids-set(allitems)),'missingSpellIds':sorted(spellids-set(allspells)),'regionalCreatureIds':sorted(local_npcs)}
    return {'meta':meta,'schemas':{k:schemas[k] for k in out},'tables':out,'links':links}

if __name__=='__main__':
    self_test()
    ap=argparse.ArgumentParser(); ap.add_argument('archive'); ap.add_argument('--out',default=str(Path(__file__).parent)); args=ap.parse_args()
    wanted={'quest_template','creature_template','creature','gameobject','gameobject_template','creature_questrelation','creature_involvedrelation','gameobject_questrelation','gameobject_involvedrelation','player_levelstats','player_classlevelstats','player_xp_for_level','playercreateinfo','playercreateinfo_action','playercreateinfo_item','playercreateinfo_spell','playercreateinfo_skills','creature_template_classlevelstats','npc_vendor','npc_vendor_template','npc_trainer','npc_trainer_template','creature_loot_template','pickpocketing_loot_template','skinning_loot_template','gameobject_loot_template','reference_loot_template','item_loot_template','disenchant_loot_template','item_template','spell_template','creature_template_spells','creature_spell_list','creature_cooldowns','spell_chain','spell_learn_spell','spell_bonus_data','spell_threat','spell_proc_event','spell_affect','conditions','quest_poi','quest_poi_points','dbscripts_on_quest_start','dbscripts_on_quest_end'}
    schemas,tables=read_sql(args.archive,wanted)
    bundle=build(schemas,tables); out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    (out/'classic-reference.objects.json').write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    compact={**bundle,'encoding':'rows-v1','tables':{table:[[r.get(c) for c in bundle['schemas'][table]] for r in rows] for table,rows in bundle['tables'].items()}}
    (out/'classic-reference.json').write_text(json.dumps(compact,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    (out/'quests.inspect.json').write_text(json.dumps({'quests':bundle['tables']['quest_template'],'links':bundle['links']['quests']},ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(bundle['meta'],indent=2))
    print({p.name:p.stat().st_size for p in out.glob('*.json')})
