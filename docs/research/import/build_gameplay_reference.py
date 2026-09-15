"""Derived convenience data; original source records remain untouched."""
import json, math
from pathlib import Path
ROOT=Path(__file__).parent
b=json.loads((ROOT/'classic-reference.objects.json').read_text(encoding='utf8'))
t=b['tables']; spells={r['Id']:r for r in t['spell_template']}
def quest_xp(q, player_level):
    qlevel=q['QuestLevel']; money=q['RewMoneyMaxLevel']
    if not money or qlevel<=0: return None if qlevel<=0 else 0
    divisor={61:1.2,62:2.4,63:3.6,64:4.8}.get(qlevel,6 if qlevel>=65 else .6)
    difference=player_level-qlevel
    factor=1 if difference<=5 else {6:.8,7:.6,8:.4,9:.2}.get(difference,.1)
    return math.ceil(money/divisor*factor-1e-10)
abilities=[]
mage_trainers={r['Entry'] for r in t['creature_template'] if r['TrainerClass']==8}
seen=set()
for trainer in t['npc_trainer']:
    if trainer['entry'] not in mage_trainers: continue
    wrapper=spells.get(trainer['spell'])
    if not wrapper: continue
    for i in range(1,4):
        # Effect 36 is LEARN_SPELL, distinct from combat proc triggers.
        if wrapper[f'Effect{i}']!=36: continue
        actual=spells.get(wrapper[f'EffectTriggerSpell{i}'])
        if not actual: continue
        signature=(actual['Id'],trainer['reqlevel'],trainer['spellcost'])
        if signature in seen: continue
        seen.add(signature)
        abilities.append({'spellId':actual['Id'],'name':actual['SpellName'],'rank':actual['Rank1'],'requiredLevel':trainer['reqlevel'],'costCopper':trainer['spellcost'],'teachingSpellId':wrapper['Id'],'manaCost':actual['ManaCost'],'manaCostPercentage':actual['ManaCostPercentage'],'recoveryTimeMs':actual['RecoveryTime'],'castingTimeIndex':actual['CastingTimeIndex'],'rangeIndex':actual['RangeIndex'],'durationIndex':actual['DurationIndex']})
for start in t['playercreateinfo_spell']:
    if start['class']==8 and start['Spell'] in spells:
        s=spells[start['Spell']]
        if s['SpellFamilyName']==3 and s['SpellLevel']>0:
            abilities.append({'spellId':s['Id'],'name':s['SpellName'],'rank':s['Rank1'],'requiredLevel':1,'costCopper':0,'startingSpell':True,'manaCost':s['ManaCost'],'manaCostPercentage':s['ManaCostPercentage'],'recoveryTimeMs':s['RecoveryTime']})
result={'status':'derived reference, not official verified','core':json.loads((ROOT/'core-provenance.json').read_text()),'questXpByPlayerLevel':{str(q['entry']):[quest_xp(q,level) for level in range(1,21)] for q in t['quest_template']},'questXpArrayIndex':'index0 is player level1; index19 is level20; unmodified server rate1; qLevel<=0 unresolved','mageAbilitiesThrough20':sorted(abilities,key=lambda x:(x['requiredLevel'],x['spellId']))}
(ROOT/'gameplay-reference.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(len(abilities),'mage starting/trainer records; quest783 XP',result['questXpByPlayerLevel']['783'][0])
