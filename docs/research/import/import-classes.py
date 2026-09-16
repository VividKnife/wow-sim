"""Build the compact all-class reference used by the level 1-60 simulator.

The importer reads the pinned ClassicDB archive through extract_classic.read_sql,
validates each client DBC against dbc-provenance.json, and uses the pinned 2019
talent spell archive for names and rank descriptions. It exports only records
needed by class creation, progression, starting outfits, abilities, and talents.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

from extract_classic import SOURCE_COMMIT, SOURCE_SHA256, read_sql

REPO = Path(__file__).resolve().parents[3]
DEFAULT_SQL = REPO / '.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz'
DEFAULT_RESEARCH = Path('C:/workspace/wow-sim-research')
DEFAULT_OUT = REPO / 'apps/web/data/classes-reference.json'
ARCHIVE_SPELLS_SHA256 = '17f16dc43c9678eb76ee88deb774d34960fa0a528a34157218d46be88b2d9c42'
EXTRA_DBC_HASHES = {
    'SkillLineAbility': '3c09ed367dfbbc9e249e493ccc4dcd4d27cf1b781bed8f49ee2190dd612e586b',
    'SkillLine': 'a861b8e02c70a15f3566f214780c1fb21af2d7ef76fd2dbf228185dfbc9b057c',
    'SpellItemEnchantment': 'dcf78cf1fd3e29aed17103c19b1ab0fbb995a0bc086c40664484572a834966b4',
    'Spell': 'be197208c231129d63854c33943953010c4977481870e88b3fcc58ea6e3ac930',
    'SpellIcon': '938e8c333fe914938994fc331c04655d7eb5719bc2d1b29eaf5fad4239abdfdc',
    'Lock': 'ee245f22f5623d5737d281411bc7df28d9b210fca5937abfe68d04c3223a8a8d',
}


def extra_dbc(name: str) -> tuple[list[tuple], bytes]:
    path = REPO / '.cache/source-data/professions' / (name + '.dbc')
    if path.exists():
        data = path.read_bytes()
    else:
        url = f'https://raw.githubusercontent.com/soyalu/cmangos-classic-map/93b11b73ee4e483ce414f3d5f99a9047d23a9e48/dbc/{name}.dbc'
        data = urllib.request.urlopen(url, timeout=40).read()
    if hashlib.sha256(data).hexdigest() != EXTRA_DBC_HASHES[name]:
        raise ValueError(f'{name} SHA256 mismatch')
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    magic, count, fields, size, string_size = struct.unpack('<4s4I', data[:20])
    if magic != b'WDBC' or size != fields * 4 or len(data) != 20 + count * size + string_size:
        raise ValueError(f'{name} invalid WDBC envelope')
    return [struct.unpack_from('<' + str(fields) + 'I', data, 20 + i * size)
            for i in range(count)], data[20 + count * size:]

CLASSES = [
    {'id': 1, 'name': '战士', 'nameEn': 'Warrior', 'power': 'rage'},
    {'id': 2, 'name': '圣骑士', 'nameEn': 'Paladin', 'power': 'mana'},
    {'id': 3, 'name': '猎人', 'nameEn': 'Hunter', 'power': 'mana'},
    {'id': 4, 'name': '潜行者', 'nameEn': 'Rogue', 'power': 'energy'},
    {'id': 5, 'name': '牧师', 'nameEn': 'Priest', 'power': 'mana'},
    {'id': 7, 'name': '萨满祭司', 'nameEn': 'Shaman', 'power': 'mana'},
    {'id': 8, 'name': '法师', 'nameEn': 'Mage', 'power': 'mana'},
    {'id': 9, 'name': '术士', 'nameEn': 'Warlock', 'power': 'mana'},
    {'id': 11, 'name': '德鲁伊', 'nameEn': 'Druid', 'power': 'mana'},
]
RACES = [
    {'id': 1, 'name': '人类', 'nameEn': 'Human', 'faction': 'Alliance'},
    {'id': 2, 'name': '兽人', 'nameEn': 'Orc', 'faction': 'Horde'},
    {'id': 3, 'name': '矮人', 'nameEn': 'Dwarf', 'faction': 'Alliance'},
    {'id': 4, 'name': '暗夜精灵', 'nameEn': 'Night Elf', 'faction': 'Alliance'},
    {'id': 5, 'name': '亡灵', 'nameEn': 'Undead', 'faction': 'Horde'},
    {'id': 6, 'name': '牛头人', 'nameEn': 'Tauren', 'faction': 'Horde'},
    {'id': 7, 'name': '侏儒', 'nameEn': 'Gnome', 'faction': 'Alliance'},
    {'id': 8, 'name': '巨魔', 'nameEn': 'Troll', 'faction': 'Horde'},
]
SPELL_FAMILY = {1: 4, 2: 10, 3: 9, 4: 8, 5: 6, 7: 11, 8: 3, 9: 5, 11: 7}
CLASS_QUEST_UNLOCKS = {
    1: [(71, 10), (355, 10), (7386, 10)],
    2: [(7328, 12)],
    3: [(1515, 10), (883, 10), (982, 10)],
    7: [(8071, 4), (3599, 10), (5394, 20)],
    9: [(688, 1), (697, 10)],
    11: [(5487, 10), (6807, 10), (6795, 10)],
}
# These records are referenced by class mechanics through aura/enchant/core
# relationships rather than spell_template EffectTriggerSpell fields.
SUPPORTING_SPELL_IDS = {
    20187, 20280, 20281, 25742,   # paladin judgement and seal hits through level 60
    3606, 6350,                  # Searing Totem attacks through level 60
    8072, 8156, 8076, 8162, 5672, # totem-applied auras through level 60
    10400, 15567, 15568,         # Rockbiter AP/threat enchant auras, ranks 1-3
    20860, 20865, 20866,         # Rockbiter threat procs, ranks 1-3
    27873, 27874, 18790, 18792, # Lightwell higher ranks; sacrifice regeneration
    3026, 20758, 20759, 20760, 20761, # Player.cpp soulstone resurrection map
}
SPELL_NAME_ZH = {
    'Teleport: Stormwind': '暴风城传送', 'Teleport: Ironforge': '铁炉堡传送',
    'Fireball': '火球术', 'Frostbolt': '寒冰箭', 'Fire Blast': '火焰冲击',
    'Frost Armor': '霜甲术', 'Arcane Intellect': '奥术智慧', 'Conjure Food': '造食术',
    'Conjure Water': '造水术', 'Frost Nova': '冰霜新星', 'Arcane Explosion': '魔爆术',
    'Flamestrike': '烈焰风暴', 'Blizzard': '暴风雪', 'Arcane Missiles': '奥术飞弹',
    'Polymorph': '变形术', 'Pyroblast': '炎爆术', 'Cold Snap': '急速冷却',
    'Heroic Strike': '英勇打击', 'Cleave': '顺劈斩', 'Sunder Armor': '破甲攻击',
    'Taunt': '嘲讽', 'Battle Stance': '战斗姿态', 'Defensive Stance': '防御姿态',
    'Rend': '撕裂', 'Battle Shout': '战斗怒吼', 'Thunder Clap': '雷霆一击',
    'Bloodrage': '血性狂暴', 'Sinister Strike': '邪恶攻击', 'Eviscerate': '剔骨',
    'Gouge': '凿击', 'Kick': '脚踢', 'Evasion': '闪避', 'Sprint': '疾跑',
    'Stealth': '潜行', 'Backstab': '背刺', 'Ambush': '伏击', 'Smite': '惩击',
    'Lesser Heal': '次级治疗术', 'Heal': '治疗术', 'Flash Heal': '快速治疗',
    'Renew': '恢复', 'Power Word: Shield': '真言术：盾',
    'Power Word: Fortitude': '真言术：韧', 'Shadow Word: Pain': '暗言术：痛',
    'Mind Blast': '心灵震爆', 'Resurrection': '复活术', 'Holy Light': '圣光术',
    'Flash of Light': '圣光闪现', 'Seal of Righteousness': '正义圣印',
    'Judgement': '审判', 'Blessing of Might': '力量祝福', 'Devotion Aura': '虔诚光环',
    'Hammer of Justice': '制裁之锤', 'Redemption': '救赎', 'Arcane Shot': '奥术射击',
    'Serpent Sting': '毒蛇钉刺', 'Raptor Strike': '猛禽一击', 'Auto Shot': '自动射击',
    'Concussive Shot': '震荡射击', 'Aspect of the Hawk': '雄鹰守护',
    'Call Pet': '召唤宠物', 'Revive Pet': '复活宠物', 'Tame Beast': '驯服野兽',
    'Lightning Bolt': '闪电箭', 'Earth Shock': '大地震击', 'Flame Shock': '烈焰震击',
    'Frost Shock': '冰霜震击', 'Healing Wave': '治疗波',
    'Lesser Healing Wave': '次级治疗波', 'Searing Totem': '灼热图腾',
    'Strength of Earth Totem': '大地之力图腾', 'Stoneskin Totem': '石肤图腾',
    'Healing Stream Totem': '治疗之泉图腾', 'Rockbiter Weapon': '石化武器',
    'Ancestral Spirit': '先祖之魂', 'Shadow Bolt': '暗影箭', 'Immolate': '献祭',
    'Corruption': '腐蚀术', 'Curse of Agony': '痛苦诅咒', 'Life Tap': '生命分流',
    'Summon Imp': '召唤小鬼', 'Summon Voidwalker': '召唤虚空行者',
    'Demon Skin': '恶魔皮肤', 'Fear': '恐惧术', 'Wrath': '愤怒', 'Moonfire': '月火术',
    'Healing Touch': '治疗之触', 'Regrowth': '愈合', 'Rejuvenation': '回春术',
    'Bear Form': '熊形态', 'Cat Form': '猎豹形态', 'Maul': '重殴', 'Claw': '爪击',
    'Rip': '撕扯', 'Growl': '低吼', 'Entangling Roots': '纠缠根须',
    'Thorns': '荆棘术', 'Mark of the Wild': '野性印记',
}
TALENT_NAME_ZH = {
    'Arcane Subtlety': '奥术精妙', 'Arcane Focus': '奥术集中',
    'Arcane Concentration': '奥术专注', 'Arcane Mind': '奥术心智',
    'Improved Fireball': '强化火球术', 'Impact': '冲击', 'Ignite': '点燃',
    'Improved Fire Blast': '强化火焰冲击', 'Burning Soul': '燃烧之魂',
    'Pyroblast': '炎爆术', 'Improved Frostbolt': '强化寒冰箭',
    'Elemental Precision': '元素精准', 'Ice Shards': '寒冰碎片',
    'Frostbite': '霜寒刺骨', 'Permafrost': '永冻',
    'Improved Frost Nova': '强化冰霜新星', 'Piercing Ice': '刺骨寒冰',
    'Frost Channeling': '冰霜导能', 'Cold Snap': '急速冷却',
    'Improved Heroic Strike': '强化英勇打击', 'Improved Rend': '强化撕裂',
    'Deflection': '偏斜', 'Cruelty': '残忍', 'Toughness': '坚韧',
    'Anticipation': '预知', 'Defiance': '挑衅', 'Improved Eviscerate': '强化剔骨',
    'Booming Voice': '震耳嗓音', 'Improved Battle Shout': '强化战斗怒吼',
    'Unbridled Wrath': '怒不可遏', 'Improved Cleave': '强化顺劈斩',
    'Malice': '恶意', 'Ruthlessness': '无情',
    'Improved Sinister Strike': '强化邪恶攻击', 'Lightning Reflexes': '闪电反射',
    'Precision': '精确', 'Improved Gouge': '强化凿击', 'Opportunity': '伺机而动',
    'Camouflage': '欺诈高手', 'Unbreakable Will': '坚定意志',
    'Initiative': '先发制人',
    'Improved Power Word: Fortitude': '强化真言术：韧',
    'Improved Power Word: Shield': '强化真言术：盾', 'Meditation': '冥想',
    'Improved Renew': '强化恢复', 'Holy Specialization': '神圣专精',
    'Divine Fury': '神圣之怒', 'Spell Warding': '法术屏障', 'Spirit Tap': '精神分流',
    'Shadow Affinity': '暗影亲和', 'Improved Shadow Word: Pain': '强化暗言术：痛',
    'Shadow Focus': '暗影集中', 'Improved Mind Blast': '强化心灵震爆',
    'Divine Strength': '神圣力量', 'Divine Intellect': '神圣智慧',
    'Spiritual Focus': '精神集中', 'Improved Seal of Righteousness': '强化正义圣印',
    'Healing Light': '治疗之光', 'Improved Devotion Aura': '强化虔诚光环',
    'Redoubt': '盾牌壁垒', 'Improved Blessing of Might': '强化力量祝福',
    'Benediction': '祈福', 'Improved Judgement': '强化审判',
    'Improved Aspect of the Hawk': '强化雄鹰守护', 'Endurance Training': '耐久训练',
    'Thick Hide': '厚皮', 'Unleashed Fury': '狂怒释放', 'Lethal Shots': '致命射击',
    'Efficiency': '效率', 'Improved Arcane Shot': '强化奥术射击', 'Hawk Eye': '鹰眼',
    'Monster Slaying': '怪物杀手', 'Humanoid Slaying': '人型生物杀手',
    'Savage Strikes': '野蛮打击', 'Survivalist': '生存专家', 'Convection': '传导',
    'Concussion': '震荡', 'Call of Flame': '烈焰召唤', 'Reverberation': '回响',
    'Ancestral Knowledge': '先祖知识', 'Shield Specialization': '盾牌专精',
    'Thundering Strikes': '雷鸣猛击', 'Improved Healing Wave': '强化治疗波',
    'Tidal Focus': '潮汐集中', 'Healing Focus': '治疗专注', 'Totemic Focus': '图腾集中',
    'Suppression': '镇压', 'Improved Corruption': '强化腐蚀术',
    'Improved Life Tap': '强化生命分流', 'Improved Curse of Agony': '强化痛苦诅咒',
    'Demonic Embrace': '恶魔之拥', 'Improved Imp': '强化小鬼', 'Fel Stamina': '恶魔耐力',
    'Improved Voidwalker': '强化虚空行者', 'Cataclysm': '灾变', 'Bane': '灾祸',
    'Devastation': '毁灭', 'Improved Wrath': '强化愤怒', 'Improved Moonfire': '强化月火术',
    'Natural Weapons': '天生武器', 'Natural Shapeshifter': '自然变形', 'Ferocity': '凶暴',
    'Feral Instinct': '野性本能', 'Improved Mark of the Wild': '强化野性印记',
    'Furor': '激怒', 'Improved Healing Touch': '强化治疗之触',
    "Nature's Focus": '自然集中', 'Improved Rejuvenation': '强化回春术',
}


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_dbc(path: Path, provenance: dict) -> tuple[list[bytes], bytes]:
    data = path.read_bytes()
    expected = provenance['files'][path.stem]
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected['sha256']:
        raise ValueError(f'{path.name} SHA256 mismatch: {digest}')
    magic, count, fields, record_size, string_size = struct.unpack('<4s4I', data[:20])
    if magic != b'WDBC' or len(data) != 20 + count * record_size + string_size:
        raise ValueError(f'{path.name} has an invalid WDBC envelope')
    if (count, fields, record_size, string_size) != (
        expected['rows'], expected['fields'], expected['recordSize'], expected['stringSize']
    ):
        raise ValueError(f'{path.name} layout does not match pinned provenance')
    start = 20 + count * record_size
    return [data[20+i*record_size:20+(i+1)*record_size] for i in range(count)], data[start:]


def dbc_text(strings: bytes, offset: int) -> str:
    if not offset:
        return ''
    return strings[offset:strings.index(0, offset)].decode('utf8')


def decode_client_rules(rules_dir: Path) -> tuple[list[dict], list[dict]]:
    provenance = json.loads((rules_dir / 'dbc-provenance.json').read_text(encoding='utf8'))
    outfit_rows, _ = read_dbc(rules_dir / 'CharStartOutfit.dbc', provenance)
    outfits = []
    for row in outfit_rows:
        values = struct.unpack('<I4B36i', row)
        outfits.append({
            'id': values[0], 'race': values[1], 'class': values[2],
            'gender': values[3], 'outfitId': values[4],
            'itemIds': list(values[5:17]), 'displayIds': list(values[17:29]),
            'inventoryTypes': list(values[29:41]),
        })

    tab_rows, tab_strings = read_dbc(rules_dir / 'TalentTab.dbc', provenance)
    tabs = []
    for row in tab_rows:
        values = struct.unpack('<15I', row)
        localized = [dbc_text(tab_strings, offset) for offset in values[1:9]]
        tabs.append({
            'id': values[0], 'name': next((name for name in localized if name), ''),
            'localizedNames': localized, 'classMask': values[12],
            'orderIndex': values[13], 'background': dbc_text(tab_strings, values[14]),
        })

    talent_rows, _ = read_dbc(rules_dir / 'Talent.dbc', provenance)
    talents = []
    for row in talent_rows:
        values = struct.unpack('<21I', row)
        talents.append({
            'id': values[0], 'tabId': values[1], 'row': values[2], 'col': values[3],
            'ranks': [spell_id for spell_id in values[4:9] if spell_id],
            'dependsOnTalentId': values[13], 'dependsOnRankIndex': values[16],
            'dependsOnSpellId': values[20],
        })
    return outfits, [{'tabs': tabs, 'talents': talents, 'provenance': provenance}][0]


def class_id_from_mask(mask: int) -> int:
    ids = [row['id'] for row in CLASSES if mask & (1 << (row['id'] - 1))]
    if len(ids) != 1:
        raise ValueError(f'TalentTab class mask {mask} does not identify one vanilla class')
    return ids[0]


def ability_record(actual: dict, class_id: int, *, level: int, cost: int,
                   teaching_spell_id: int | None, starting: bool,
                   previous_spell_id: int, starting_races: list[int] | None = None,
                   acquisition: str | None = None, source: str | None = None) -> dict:
    result = {
        'spellId': actual['Id'], 'name': actual['SpellName'], 'rank': actual['Rank1'],
        'requiredLevel': level, 'costCopper': cost, 'classId': class_id,
        'previousSpellId': previous_spell_id, 'startingSpell': starting,
        'acquisition': acquisition or ('starting' if starting else 'trainer'),
        'manaCost': actual['ManaCost'], 'manaCostPercentage': actual['ManaCostPercentage'],
        'recoveryTimeMs': actual['RecoveryTime'], 'castingTimeIndex': actual['CastingTimeIndex'],
        'rangeIndex': actual['RangeIndex'], 'durationIndex': actual['DurationIndex'],
    }
    if teaching_spell_id is not None:
        result['teachingSpellId'] = teaching_spell_id
    if starting_races:
        result['startingRaces'] = sorted(starting_races)
    if source:
        result['source'] = source
    return result


def acquisition_inventory(tables, spells, items, chains, valid_pairs, abilities, trees):
    """Enumerate concrete acquisitions and the client skill inventory separately.

    SkillLineAbility is the completeness boundary, not proof of learnability.
    Rows without a trainer/quest/book/start/talent source retain acquisition=reference.
    """
    skill_rows, _ = extra_dbc('SkillLineAbility')
    skills, _ = extra_dbc('SkillLine')
    categories = {r[0]: r[1] for r in skills}
    # Client pet skill lines identify demon families, hunter beast families and
    # pet talents; they have no player class mask in SkillLineAbility.
    demon_lines = {188, 189, 204, 205, 206, 207}
    pet_lines = demon_lines | {203, 208, 209, 210, 211, 212, 213, 214, 215, 217, 218, 236, 251, 270, 653, 654, 655, 656}
    racial_lines = {101, 124, 125, 126, 220, 733, 753, 754}
    racial_line_masks = {101: 8, 124: 32, 125: 2, 126: 4, 220: 16, 733: 128, 753: 64, 754: 1}
    skill_by_spell = defaultdict(list)
    for row in skill_rows:
        skill_by_spell[row[2]].append(row)
    talent_ids = {sid for tree in trees for t in tree['talents'] for sid in t['ranks']}
    entries = {}
    selected_items, selected_spells, selected_quests = set(), set(), set()
    item_sources = defaultdict(list)
    for tab in ['npc_vendor', 'npc_vendor_template', 'creature_loot_template', 'reference_loot_template',
                'gameobject_loot_template', 'item_loot_template']:
        for r in tables[tab]:
            item_sources[r['item']].append({'table': tab, 'id': r['entry']})
    for q in tables['quest_template']:
        for key, value in q.items():
            if key.startswith(('RewItemId', 'RewChoiceItemId')) and value:
                item_sources[value].append({'table': 'quest_template', 'id': q['entry']})

    def races_for(class_id, mask=0):
        return sorted(r for r, c in valid_pairs if c == class_id and (not mask or mask & (1 << (r-1))))

    def owner_classes(spell_id):
        result = set()
        for row in skill_by_spell[spell_id]:
            result.update(cid for cid in SPELL_FAMILY if row[4] & (1 << (cid-1)))
            if row[1] in pet_lines:
                result.add(9 if row[1] in demon_lines else 3)
        if not result:
            family = spells.get(spell_id, {}).get('SpellFamilyName')
            result.update(cid for cid, fid in SPELL_FAMILY.items() if fid == family)
        return result

    def learned(spell_id):
        spell = spells.get(spell_id, {})
        taught = [spell.get(f'EffectTriggerSpell{i}') for i in range(1, 4)
                  if spell.get(f'Effect{i}') in (36, 57)]
        return [sid for sid in taught if sid in spells]

    def add(cid, sid, kind, level, source, *, race_mask=0, race_ids=None, item_id=None,
            quest_id=None, talent_id=None, pet=False, cost=0, teaching=None):
        spell = spells.get(sid)
        races = race_ids or races_for(cid, race_mask)
        if not spell or not races or level > 60:
            return
        key = f'{cid}:{sid}:{kind}'
        entry = entries.setdefault(key, {
            'id': key, 'classId': cid, 'spellId': sid, 'name': spell['SpellName'],
            'requiredLevel': max(1, level), 'raceIds': [], 'acquisition': kind,
            'previousSpellId': chains.get(sid, {}).get('prev_spell', 0),
            'sources': [], 'dataStatus': 'complete', 'executionStatus': 'unverified',
            'actor': 'pet' if pet else 'player',
        })
        entry['raceIds'] = sorted(set(entry['raceIds']) | set(races))
        entry['requiredLevel'] = min(entry['requiredLevel'], max(1, level))
        if source not in entry['sources']:
            entry['sources'].append(source)
        for field, value in [('itemIds', item_id), ('questIds', quest_id)]:
            if value:
                entry[field] = sorted(set(entry.get(field, [])) | {value})
        if talent_id:
            entry['talentId'] = talent_id
        selected_spells.add(sid)
        if teaching:
            selected_spells.add(teaching)
        if item_id:
            selected_items.add(item_id)
        if quest_id:
            selected_quests.add(quest_id)
        return entry

    for cid, rows in abilities.items():
        for a in rows:
            race_rows = [r for r in skill_by_spell[a['spellId']] if r[4] & (1 << (int(cid)-1))]
            race_mask = 0
            if race_rows and all(r[3] for r in race_rows):
                for r in race_rows:
                    race_mask |= r[3]
            if race_mask:
                a['raceIds'] = races_for(int(cid), race_mask)
            entry = add(int(cid), a['spellId'], a['acquisition'], a['requiredLevel'],
                {'table': 'playercreateinfo_spell' if a['startingSpell'] else 'spell_template',
                 'id': a.get('teachingSpellId', a['spellId']), 'role': 'starting' if a['startingSpell'] else 'teaching-spell'},
                race_ids=a.get('startingRaces') or a.get('raceIds'), teaching=a.get('teachingSpellId'))
            if entry and a.get('trainerSource'):
                entry['sources'].append(a['trainerSource'])

    for start in tables['playercreateinfo_spell']:
        cid, race, sid = start['class'], start['race'], start['Spell']
        if (race, cid) not in valid_pairs or sid not in spells:
            continue
        sl = skill_by_spell[sid]
        kind = 'racial' if any(r[1] in racial_lines for r in sl) else 'weapon' if any(categories.get(r[1]) == 6 for r in sl) else 'passive' if spells[sid]['Attributes'] & 64 else 'starting'
        add(cid, sid, kind, 1, {'table': 'playercreateinfo_spell', 'id': sid, 'race': race, 'class': cid}, race_ids=[race])

    for quest in tables['quest_template']:
        if quest['MinLevel'] > 60:
            continue
        rewards = set(learned(quest['RewSpellCast'])) | set(learned(quest['SrcSpell']))
        if quest['RewSpell']:
            rewards.update(learned(quest['RewSpell']) or [quest['RewSpell']])
        for sid in rewards:
            owners = owner_classes(sid)
            if quest['RequiredClasses']:
                owners = {cid for cid in SPELL_FAMILY if quest['RequiredClasses'] & (1 << (cid-1))}
            for cid in owners:
                add(cid, sid, 'classQuest', max(quest['MinLevel'], spells[sid]['SpellLevel']),
                    {'table': 'quest_template', 'id': quest['entry'], 'rewardSpellId': quest['RewSpell'],
                     'rewardCastSpellId': quest['RewSpellCast'], 'requiredRaces': quest['RequiredRaces']},
                    race_mask=quest['RequiredRaces'], quest_id=quest['entry'], teaching=quest['RewSpellCast'])
                if quest['SrcSpell'] and sid in learned(quest['SrcSpell']):
                    entries[f'{cid}:{sid}:classQuest']['sources'][-1]['acceptSpellId'] = quest['SrcSpell']
                    selected_spells.add(quest['SrcSpell'])

    for item in items.values():
        for n in range(1, 6):
            teaching = item[f'spellid_{n}']
            for sid in learned(teaching):
                # Profession recipes are deliberately outside the class inventory.
                owners = owner_classes(sid)
                for cid in owners:
                    if item['AllowableClass'] > 0 and not item['AllowableClass'] & (1 << (cid-1)):
                        continue
                    pet = any(r[1] in pet_lines for r in skill_by_spell[sid])
                    entry = add(cid, sid, 'book', max(item['RequiredLevel'], spells[sid]['SpellLevel']),
                        {'table': 'item_template', 'id': item['entry'], 'teachingSpellId': teaching,
                         'spellSlot': n, 'itemSources': item_sources[item['entry']]}, race_mask=max(0, item['AllowableRace']),
                        item_id=item['entry'], pet=pet, teaching=teaching)
                    if entry:
                        entry['obtainableItemIds'] = sorted(set(entry.get('obtainableItemIds', [])) | ({item['entry']} if item_sources[item['entry']] else set()))

    for tree in trees:
        for talent in tree['talents']:
            for rank, sid in enumerate(talent['ranks'], 1):
                add(tree['classId'], sid, 'talent', talent['earliestLevel'] + rank - 1,
                    {'table': 'Talent.dbc', 'id': talent['id'], 'rank': rank}, talent_id=talent['id'])

    # Include trainer acquisitions outside class trainer templates: weapons and
    # pet trainers. Ownership comes from the DBC class mask / pet skill line.
    def terminal_learned(spell_id, seen=None):
        seen = set() if seen is None else seen
        if spell_id in seen:
            return []
        seen.add(spell_id)
        taught = learned(spell_id)
        return [leaf for child in taught for leaf in (terminal_learned(child, seen.copy()) or [child])]

    for tab in ['npc_trainer', 'npc_trainer_template']:
        for trainer in tables[tab]:
            for sid in terminal_learned(trainer['spell']):
                for cid in owner_classes(sid):
                    relevant = [r for r in skill_by_spell[sid] if r[4] & (1 << (cid-1)) or r[1] in pet_lines]
                    pet = bool(relevant) and all(r[1] in pet_lines for r in relevant)
                    weapon = any(categories.get(r[1]) == 6 for r in relevant)
                    if not (pet or weapon):
                        continue
                    add(cid, sid, 'pet' if pet else 'weapon', max(trainer['reqlevel'], spells[sid]['SpellLevel']),
                        {'table': tab, 'id': trainer['entry'], 'teachingSpellId': trainer['spell'],
                         'requiredSkill': trainer['reqskill'], 'requiredSkillValue': trainer['reqskillvalue'],
                         'costCopper': trainer['spellcost'], 'requiredLevel': trainer['reqlevel'],
                         'ownerTeachingSpellId': next((child for child in learned(trainer['spell']) if learned(child)), trainer['spell'])}, teaching=trainer['spell'], pet=pet)

    # Compare all player class, racial, weapon and pet skill rows to acquisition
    # sources. This catches omissions without treating a client record as a grant.
    inventory = []
    for row in skill_rows:
        sid, skill, race_mask, class_mask = row[2], row[1], row[3], row[4]
        if skill in racial_lines:
            race_mask = race_mask or racial_line_masks[skill]
        spell = spells.get(sid)
        if not spell or spell['SpellLevel'] > 60 or learned(sid):
            continue
        if not (class_mask and categories.get(skill) in (6, 7) or skill in racial_lines or skill in pet_lines):
            continue
        owners = owner_classes(sid)
        if skill in racial_lines and not class_mask:
            owners = set(SPELL_FAMILY)
        for cid in owners:
            races = races_for(cid, race_mask)
            if not races:
                continue
            inventory.append({'id': row[0], 'skillId': skill, 'spellId': sid, 'classId': cid,
                              'raceIds': races, 'classMask': class_mask, 'raceMask': race_mask,
                              'learnOnGetSkill': row[9], 'forwardSpellId': row[8]})
            matched = [e for e in entries.values() if e['classId'] == cid and e['spellId'] == sid]
            if not matched:
                pet = skill in pet_lines
                kind = 'pet' if pet else 'racial' if skill in racial_lines else 'reference'
                add(cid, sid, kind, spell['SpellLevel'], {'table': 'SkillLineAbility.dbc', 'id': row[0], 'skillId': skill,
                    'learnOnGetSkill': row[9]}, race_ids=races, pet=pet)
            else:
                for e in matched:
                    e['sources'].append({'table': 'SkillLineAbility.dbc', 'id': row[0], 'skillId': skill,
                                         'raceMask': race_mask, 'classMask': class_mask})

    # Server-side companion spell grants (for example hunter training and rogue
    # poisons) are actual learn relationships, distinct from triggered effects.
    for link in tables['spell_learn_spell']:
        for parent in list(entries.values()):
            if parent['spellId'] != link['entry']:
                continue
            add(parent['classId'], link['SpellID'], parent['acquisition'], parent['requiredLevel'],
                {'table': 'spell_learn_spell', 'id': link['entry'], 'active': link['Active']},
                race_ids=parent['raceIds'])

    # Preserve the established shared-route quest adaptation, but retain original
    # quest IDs and race constraints so acquisition is reviewable, not invented.
    for entry in list(entries.values()):
        if entry['acquisition'] == 'reference' and any(e['classId'] == entry['classId'] and e['spellId'] == entry['spellId'] and e['acquisition'] != 'reference' for e in entries.values()):
            del entries[entry['id']]
    for entry in entries.values():
        sid, cid = entry['spellId'], entry['classId']
        spell = spells[sid]
        first_rank = chains.get(sid, {}).get('first_spell', sid)
        matching_skill = any(r[4] & (1 << (cid-1)) for r in skill_by_spell[sid] + skill_by_spell[first_rank]) or first_rank in talent_ids
        engine_implicit = spell['SpellFamilyName'] == 0 and not matching_skill and entry['acquisition'] in ('starting', 'passive')
        entry['availability'] = 'source-backed'
        entry['contentRole'] = 'pet-ability' if entry['actor'] == 'pet' else 'talent' if entry['acquisition'] == 'talent' else 'ability'
        if entry['actor'] == 'pet' and spell['Attributes'] & 192 == 192:
            entry.update(contentRole='hidden-pet-reference', availability='hidden-client-passive-not-player-training')
        elif entry['acquisition'] == 'reference':
            entry.update(contentRole='supporting-or-orphan-reference', availability='not-directly-learnable')
        elif entry['acquisition'] == 'talent' and not entry.get('talentId'):
            entry.update(contentRole='talent-grant-effect', availability='implicit-talent-grant')
        elif entry['acquisition'] == 'classQuest' and spell['SpellName'] == 'Riding':
            # Class mount quest scripts award this skill wrapper alongside the
            # actual summon spell; it is not a separate castable class ability.
            entry.update(contentRole='quest-script-effect', availability='implicit-mount-quest-grant')
        elif entry['acquisition'] == 'classQuest' and not matching_skill and not any(s['table'] == 'spell_learn_spell' for s in entry['sources']) and all(spell[f'Effect{i}'] in (0, 3, 5) for i in range(1, 4)):
            entry.update(contentRole='quest-script-effect', availability='quest-cast-not-player-spell')
        elif entry['acquisition'] == 'book' and not entry.get('obtainableItemIds'):
            entry.update(contentRole='unavailable-book-reference', availability='no-item-source-in-pinned-database')
        elif entry['acquisition'] == 'trainer' and spell['SpellFamilyName'] != SPELL_FAMILY[cid] and not matching_skill:
            entry.update(contentRole='orphan-trainer-reference', availability='trainer-class-skill-mismatch')
        elif entry['acquisition'] == 'racial' and not any(s['table'] == 'playercreateinfo_spell' for s in entry['sources']):
            entry.update(contentRole='supporting-racial-effect', availability='not-directly-learnable')
        elif engine_implicit or '(DND)' in spell['SpellName']:
            entry.update(contentRole='engine-implicit', availability='implicit')

    for cid, rows in abilities.items():
        for entry in entries.values():
            active_talent = entry['contentRole'] == 'talent' and not spells[entry['spellId']]['Attributes'] & 64
            if entry['classId'] != int(cid) or not (entry['contentRole'] == 'ability' or active_talent):
                continue
            matches = [r for r in rows if r['spellId'] == entry['spellId']]
            if matches:
                for a in matches:
                    if entry['acquisition'] == 'classQuest':
                        a.update(acquisition='classQuest', costCopper=0, source='shared-route class quest adaptation',
                                 originalQuestIds=entry.get('questIds', []))
                        a['raceIds'] = entry['raceIds']
                    elif a['acquisition'] == 'reference' and entry['acquisition'] != 'reference':
                        a['acquisition'] = entry['acquisition']
            else:
                a = ability_record(spells[entry['spellId']], int(cid), level=entry['requiredLevel'], cost=0,
                    teaching_spell_id=None, starting=False, previous_spell_id=entry['previousSpellId'],
                    acquisition=entry['acquisition'], source='source-backed acquisition inventory')
                if entry['acquisition'] == 'classQuest':
                    a.update(source='shared-route class quest adaptation', originalQuestIds=entry.get('questIds', []))
                starts = sorted({s['race'] for s in entry['sources'] if s['table'] == 'playercreateinfo_spell' and s.get('race')})
                if starts:
                    a.update(startingSpell=True, startingRaces=starts)
                costs = [s['costCopper'] for s in entry['sources'] if 'costCopper' in s]
                if costs:
                    a['costCopper'] = min(costs)
                a['raceIds'] = entry['raceIds']
                if entry.get('itemIds'):
                    a['itemIds'] = entry.get('obtainableItemIds', entry['itemIds'])
                rows.append(a)
        rows[:] = [a for a in rows if any(e['classId'] == int(cid) and e['spellId'] == a['spellId'] and (e['contentRole'] == 'ability' or e['contentRole'] == 'talent' and not spells[e['spellId']]['Attributes'] & 64) for e in entries.values())]
        rows.sort(key=lambda a: (a['requiredLevel'], a['spellId']))
    result = {'schemaVersion': 1, 'levelCap': 60, 'entries': sorted(entries.values(), key=lambda e: (e['classId'], e['requiredLevel'], e['spellId'], e['acquisition'])),
              'skillLineInventory': inventory,
              'status': 'Acquisition source inventory; execution must be reconciled against runtime behavior tests.'}
    return result, selected_spells, selected_items, selected_quests


def build(sql_path: Path, research_root: Path) -> dict:
    wanted = {
        'playercreateinfo', 'player_levelstats', 'player_classlevelstats',
        'playercreateinfo_action', 'playercreateinfo_spell', 'playercreateinfo_skills',
        'creature_template', 'npc_trainer', 'npc_trainer_template',
        'spell_template', 'spell_chain', 'item_template', 'player_xp_for_level',
        'quest_template', 'spell_learn_spell', 'spell_affect', 'spell_proc_event',
        'spell_pet_auras', 'petcreateinfo_spell', 'pet_levelstats', 'pet_familystats',
        'creature_template_spells', 'npc_vendor', 'npc_vendor_template',
        'creature_loot_template', 'reference_loot_template', 'gameobject_loot_template', 'item_loot_template',
        'pickpocketing_loot_template',
    }
    schemas, tables = read_sql(sql_path, wanted)
    spells = {row['Id']: row for row in tables['spell_template']}
    localized_spell_rows, localized_strings = extra_dbc('Spell')
    localized_names = {r[0]: dbc_text(localized_strings, r[124]) for r in localized_spell_rows if r[124]}
    icon_rows, icon_strings = extra_dbc('SpellIcon')
    icon_names = {r[0]: dbc_text(icon_strings, r[1]).replace('\\', '/').rsplit('/', 1)[-1].lower() for r in icon_rows}
    localized_english = dict(SPELL_NAME_ZH)
    for sid, name in localized_names.items():
        if sid in spells:
            localized_english.setdefault(spells[sid]['SpellName'], name)
    items = {row['entry']: row for row in tables['item_template']}
    chains = {row['spell_id']: row for row in tables['spell_chain']}
    valid_pairs = {(row['race'], row['class']) for row in tables['playercreateinfo']
                   if row['race'] <= 8 and row['class'] in SPELL_FAMILY}
    if len(valid_pairs) != 40:
        raise ValueError(f'Expected 40 playable race/class pairs, got {len(valid_pairs)}')

    class_definitions = []
    for definition in CLASSES:
        races = sorted(race for race, class_id in valid_pairs if class_id == definition['id'])
        class_definitions.append({**definition, 'races': races})

    trainers_by_class = defaultdict(set)
    trainer_templates_by_class = defaultdict(set)
    for creature in tables['creature_template']:
        class_id = creature['TrainerClass']
        if class_id not in SPELL_FAMILY or creature['TrainerType'] != 0 or creature['Name'].startswith(('[UNUSED]', 'World ')):
            continue
        trainers_by_class[class_id].add(creature['Entry'])
        if creature['TrainerTemplateId']:
            trainer_templates_by_class[class_id].add(creature['TrainerTemplateId'])

    trainer_rows = defaultdict(list)
    for row in tables['npc_trainer']:
        for class_id, entries in trainers_by_class.items():
            if row['entry'] in entries:
                trainer_rows[class_id].append({**row, 'sourceTable': 'npc_trainer'})
    for row in tables['npc_trainer_template']:
        for class_id, entries in trainer_templates_by_class.items():
            if row['entry'] in entries:
                trainer_rows[class_id].append({**row, 'sourceTable': 'npc_trainer_template'})

    class_abilities = {}
    selected_spell_ids = set()
    for class_id in SPELL_FAMILY:
        abilities = []
        starting_races_by_spell = defaultdict(set)
        for start in tables['playercreateinfo_spell']:
            if (start['race'], start['class']) not in valid_pairs or start['class'] != class_id:
                continue
            actual = spells.get(start['Spell'])
            if actual and actual['SpellFamilyName'] == SPELL_FAMILY[class_id] and actual['SpellLevel'] > 0:
                starting_races_by_spell[actual['Id']].add(start['race'])
        for spell_id, races in starting_races_by_spell.items():
            actual = spells[spell_id]
            abilities.append(ability_record(
                actual, class_id, level=1, cost=0, teaching_spell_id=None, starting=True,
                previous_spell_id=chains.get(spell_id, {}).get('prev_spell', 0),
                starting_races=sorted(races),
            ))
            selected_spell_ids.add(spell_id)

        candidates = {}
        for trainer in trainer_rows[class_id]:
            if trainer['reqlevel'] > 60:
                continue
            wrapper = spells.get(trainer['spell'])
            if not wrapper:
                continue
            selected_spell_ids.add(wrapper['Id'])
            for effect in range(1, 4):
                if wrapper[f'Effect{effect}'] != 36:
                    continue
                actual = spells.get(wrapper[f'EffectTriggerSpell{effect}'])
                if not actual:
                    continue
                required_level = max(trainer['reqlevel'], actual['SpellLevel'])
                if required_level > 60:
                    continue
                candidate = ability_record(
                    actual, class_id, level=required_level, cost=trainer['spellcost'],
                    teaching_spell_id=wrapper['Id'], starting=False,
                    previous_spell_id=chains.get(actual['Id'], {}).get('prev_spell', 0),
                )
                candidate['trainerSource'] = {'table': trainer['sourceTable'], 'id': trainer['entry'],
                    'teachingSpellId': trainer['spell'], 'costCopper': trainer['spellcost'],
                    'requiredLevel': trainer['reqlevel'], 'conditionId': trainer['condition_id'],
                    'requiredSkill': trainer['reqskill'], 'requiredSkillValue': trainer['reqskillvalue']}
                old = candidates.get(actual['Id'])
                if old is None or (candidate['requiredLevel'], candidate['costCopper']) < (old['requiredLevel'], old['costCopper']):
                    candidates[actual['Id']] = candidate
                selected_spell_ids.add(actual['Id'])
        for spell_id, level in CLASS_QUEST_UNLOCKS.get(class_id, []):
            actual = spells.get(spell_id)
            if not actual:
                raise ValueError(f'Missing class quest spell {spell_id} for class {class_id}')
            candidates[spell_id] = ability_record(
                actual, class_id, level=level, cost=0, teaching_spell_id=None,
                starting=False, previous_spell_id=chains.get(spell_id, {}).get('prev_spell', 0),
                acquisition='classQuest', source='shared-route class quest adaptation',
            )
            selected_spell_ids.add(spell_id)
        if class_id == 2 and 21084 in candidates:
            # The level-4 Judgement wrapper also teaches this alternate Rank 1
            # Seal record; Human and Dwarf paladins already know source spell 20154.
            candidates[21084]['knownEquivalentSpellId'] = 20154
        # A few valid initial class spells use SpellFamilyName 0 (notably
        # Demon Skin Rank 1). Retain them when a sourced <=60 trainer rank
        # explicitly chains from that known starting spell.
        source_starting_races = defaultdict(set)
        for start in tables['playercreateinfo_spell']:
            if start['class'] == class_id and (start['race'], class_id) in valid_pairs:
                source_starting_races[start['Spell']].add(start['race'])
        already = {row['spellId'] for row in abilities} | set(candidates)
        pending_previous = {row['previousSpellId'] for row in candidates.values()} - {0}
        while pending_previous:
            previous_spell_id = pending_previous.pop()
            if previous_spell_id in already:
                continue
            actual = spells.get(previous_spell_id)
            if not actual or actual['SpellLevel'] > 60:
                continue
            if previous_spell_id in source_starting_races:
                abilities.append(ability_record(
                    actual, class_id, level=1, cost=0, teaching_spell_id=None, starting=True,
                    previous_spell_id=chains.get(previous_spell_id, {}).get('prev_spell', 0),
                    starting_races=sorted(source_starting_races[previous_spell_id]),
                ))
            else:
                candidates[previous_spell_id] = ability_record(
                    actual, class_id, level=max(1, actual['SpellLevel']), cost=0,
                    teaching_spell_id=None, starting=False,
                    previous_spell_id=chains.get(previous_spell_id, {}).get('prev_spell', 0),
                    acquisition='reference',
                    source='spell_chain prerequisite reference; acquisition not implemented',
                )
            already.add(previous_spell_id)
            selected_spell_ids.add(previous_spell_id)
            chained_previous = chains.get(previous_spell_id, {}).get('prev_spell', 0)
            if chained_previous:
                pending_previous.add(chained_previous)
        abilities.extend(candidates.values())
        class_abilities[str(class_id)] = sorted(
            abilities, key=lambda row: (row['requiredLevel'], row['spellId'], not row['startingSpell'])
        )

    rules_dir = research_root / 'rules'
    outfits, talent_dbc = decode_client_rules(rules_dir)
    outfit_by_pair = {}
    for outfit in outfits:
        pair = (outfit['race'], outfit['class'])
        if pair in valid_pairs and (pair not in outfit_by_pair or outfit['gender'] == 0):
            outfit_by_pair[pair] = outfit
    if set(outfit_by_pair) != valid_pairs:
        raise ValueError(f'Missing CharStartOutfit pairs: {sorted(valid_pairs-set(outfit_by_pair))}')

    class_starting_items = {}
    starting_item_ids = set()
    for race, class_id in sorted(valid_pairs):
        rows = []
        for item_id in outfit_by_pair[(race, class_id)]['itemIds']:
            if item_id <= 0:
                continue
            item = items[item_id]
            count = item['BuyCount']
            count_rule = 'item_template.BuyCount'
            if item['class'] == 0 and item['subclass'] == 0:
                if item['spellcategory_1'] == 11 and item['stackable'] > 4:
                    count, count_rule = 4, 'Player.cpp starting food override'
                if item['spellcategory_1'] == 59 and item['stackable'] > 2:
                    count, count_rule = 2, 'Player.cpp starting drink override'
            rows.append({'itemId': item_id, 'name': item['name'], 'count': count,
                         'countRule': count_rule, 'source': item})
            starting_item_ids.add(item_id)
        class_starting_items[f'{race}:{class_id}'] = rows

    archive_path = research_root / 'talents/archive-spells.json'
    archive_digest = file_sha256(archive_path)
    if archive_digest != ARCHIVE_SPELLS_SHA256:
        raise ValueError(f'archive-spells.json SHA256 mismatch: {archive_digest}')
    archive_spells = json.loads(archive_path.read_text(encoding='utf8'))
    tabs = {tab['id']: tab for tab in talent_dbc['tabs']}
    raw_talents = defaultdict(list)
    for talent in talent_dbc['talents']:
        if talent['tabId'] in tabs:
            raw_talents[talent['tabId']].append(talent)

    class_trees = []
    for tab in talent_dbc['tabs']:
        class_id = class_id_from_mask(tab['classMask'])
        tree_talents = []
        for raw in sorted(raw_talents[tab['id']], key=lambda row: (row['row'], row['col'], row['id'])):
            ranks = raw['ranks']
            selected_spell_ids.update(ranks)
            rank_effects = []
            for rank, spell_id in enumerate(ranks, 1):
                archived = archive_spells.get(str(spell_id), {})
                rank_effects.append({'rank': rank, 'spellId': spell_id,
                                     'descriptionEn': archived.get('description', '')})
            first = archive_spells.get(str(ranks[0]), {}) if ranks else {}
            name = first.get('name') or spells.get(ranks[0], {}).get('SpellName', str(raw['id']))
            prerequisites = []
            if raw['dependsOnTalentId']:
                prerequisite = next((row for row in talent_dbc['talents']
                                     if row['id'] == raw['dependsOnTalentId']), None)
                prerequisite_name = ''
                if prerequisite and prerequisite['ranks']:
                    prerequisite_name = archive_spells.get(str(prerequisite['ranks'][0]), {}).get('name', '')
                prerequisites.append({'talentId': raw['dependsOnTalentId'],
                                      'requiredRank': raw['dependsOnRankIndex'] + 1,
                                      'name': prerequisite_name})
            tree_talents.append({
                'id': raw['id'], 'row': raw['row'], 'col': raw['col'], 'ranks': ranks,
                'name': name, 'nameZhCN': TALENT_NAME_ZH.get(name, name), 'maxRank': len(ranks),
                'requiredTreePoints': raw['row'] * 5, 'earliestLevel': 10 + raw['row'] * 5,
                'rankEffects': rank_effects, 'prerequisites': prerequisites,
                'tree': tab['id'], 'classId': class_id, 'icon': first.get('icon'),
            })
        class_trees.append({
            'id': tab['id'], 'name': tab['name'], 'nameZhCN': tab['name'],
            'classId': class_id, 'orderIndex': tab['orderIndex'],
            'background': tab['background'], 'talents': tree_talents,
        })

    # The existing hand-curated mage bundle contains verified zhCN names and must
    # remain byte-for-field compatible for its talent records.
    mage_bundle = json.loads((REPO / 'apps/web/data/mage-talents-2019.json').read_text(encoding='utf8'))
    mage_trees = []
    for tree in mage_bundle['trees']:
        talents = [{**talent, 'tree': tree['id'], 'classId': 8} for talent in tree['talents']]
        mage_trees.append({**tree, 'classId': 8, 'talents': talents})
        selected_spell_ids.update(spell_id for talent in talents for spell_id in talent['ranks'])
    replacements = {tree['id']: tree for tree in mage_trees}
    class_trees = [replacements.get(tree['id'], tree) for tree in class_trees]
    class_trees.sort(key=lambda tree: (tree['classId'], tree.get('orderIndex', 0), tree['id']))
    for tree in class_trees:
        for talent in tree['talents']:
            if not any('\u3400' <= ch <= '\u9fff' for ch in talent.get('nameZhCN', '')):
                talent['nameZhCN'] = localized_names.get(talent['ranks'][0], talent['name'])

    manifest, acquisition_spells, acquisition_items, acquisition_quests = acquisition_inventory(
        tables, spells, items, chains, valid_pairs, class_abilities, class_trees)
    selected_spell_ids.update(acquisition_spells)
    selected_item_ids = starting_item_ids | acquisition_items
    # Healthstone creation is a script effect (77), not CREATE_ITEM (24), so
    # its base and Improved Healthstone variants have no EffectItemType edge.
    selected_item_ids.update(i['entry'] for i in items.values() if 'Healthstone' in i['name'] and i['RequiredLevel'] <= 60)
    selected_item_ids.update(i['entry'] for i in items.values() if any(word in i['name'] for word in ('Junkbox', 'Lockbox')) and i['RequiredLevel'] <= 60)
    loot_references = set()
    for row in tables['pickpocketing_loot_template']:
        if row['mincountOrRef'] < 0:
            loot_references.add(-row['mincountOrRef'])
        elif row['item']:
            selected_item_ids.add(row['item'])
    changed = True
    while changed:
        before = (len(selected_item_ids), len(loot_references))
        for tab, entries in [('item_loot_template', selected_item_ids), ('reference_loot_template', loot_references)]:
            for row in tables[tab]:
                if row['entry'] not in entries:
                    continue
                if row['mincountOrRef'] < 0:
                    loot_references.add(-row['mincountOrRef'])
                elif row['item']:
                    selected_item_ids.add(row['item'])
        changed = before != (len(selected_item_ids), len(loot_references))
    lock_rows, _ = extra_dbc('Lock')
    locks = {str(r[0]): {'id': r[0], 'requirements': [
        {'type': r[1+i], 'index': r[9+i], 'skill': r[17+i], 'action': r[25+i]}
        for i in range(8) if r[1+i]], 'source': 'Lock.dbc'} for r in lock_rows}
    selected_item_ids.update(r[9+i] for r in lock_rows for i in range(8) if r[1+i] == 1 and r[9+i] in items)
    class_quests = [q for q in tables['quest_template'] if q['RequiredClasses'] and q['MinLevel'] <= 60]
    acquisition_quests.update(q['entry'] for q in class_quests)
    for quest in class_quests:
        for key, value in quest.items():
            if value and (key == 'SrcItemId' or key.startswith(('RewItemId', 'RewChoiceItemId', 'ReqItemId', 'ReqSourceId'))):
                selected_item_ids.add(value)
    enchant_rows, enchant_strings = extra_dbc('SpellItemEnchantment')
    enchants = {r[0]: r for r in enchant_rows}
    selected_enchants, selected_creatures = set(), set()
    creature_spells = defaultdict(set)
    for row in tables['creature_template_spells']:
        creature_spells[row['entry']].update(row[f'spell{i}'] for i in range(1, 11) if row[f'spell{i}'])
    for row in tables['petcreateinfo_spell']:
        creature_spells[row['entry']].update(row[f'Spell{i}'] for i in range(1, 5) if row[f'Spell{i}'])
        # Tamed beasts carry only their own source skills. Retain the complete
        # beast acquisition inventory without granting every family skill.
        raw = next((c for c in tables['creature_template'] if c['Entry'] == row['entry']), None)
        if raw and raw['CreatureType'] == 1 and raw['CreatureTypeFlags'] & 1:
            selected_creatures.add(row['entry'])
            selected_spell_ids.update(creature_spells[row['entry']])
    learned_links = defaultdict(set)
    for row in tables['spell_learn_spell']:
        learned_links[row['entry']].add(row['SpellID'])
    for row in tables['spell_pet_auras']:
        learned_links[row['spell']].add(row['aura'])

    # Same-family ranks and hidden core-dispatched effects are selected as data,
    # never automatically advertised as learned player abilities.
    selected_spell_ids.update(sid for sid, s in spells.items()
                              if s['SpellFamilyName'] in SPELL_FAMILY.values() and s['SpellLevel'] <= 60)

    # Include effects recursively triggered by selected spells, but never import
    # the whole spell table into the web startup module.
    missing_support = SUPPORTING_SPELL_IDS - set(spells)
    if missing_support:
        raise ValueError(f'Missing supporting spell records: {sorted(missing_support)}')
    selected_spell_ids.update(SUPPORTING_SPELL_IDS)
    pending = set(selected_spell_ids)
    pending_items = set(selected_item_ids)
    processed_items = set()
    loot_by_item, loot_by_reference = defaultdict(list), defaultdict(list)
    for r in tables['item_loot_template']:
        loot_by_item[r['entry']].append(r)
    for r in tables['reference_loot_template']:
        loot_by_reference[r['entry']].append(r)
    while pending or pending_items:
        if pending_items:
            item_id = pending_items.pop()
            if item_id in processed_items or item_id not in items:
                continue
            processed_items.add(item_id)
            loot_pending = list(loot_by_item[item_id])
            visited_refs = set()
            while loot_pending:
                loot = loot_pending.pop()
                if loot['mincountOrRef'] < 0:
                    reference = -loot['mincountOrRef']
                    loot_references.add(reference)
                    if reference not in visited_refs:
                        visited_refs.add(reference)
                        loot_pending.extend(loot_by_reference[reference])
                elif loot['item'] and loot['item'] not in selected_item_ids:
                    selected_item_ids.add(loot['item'])
                    pending_items.add(loot['item'])
            for i in range(1, 6):
                sid = items[item_id][f'spellid_{i}']
                if sid > 0 and sid not in selected_spell_ids:
                    selected_spell_ids.add(sid)
                    pending.add(sid)
            continue
        spell_id = pending.pop()
        spell = spells.get(spell_id)
        if not spell:
            continue
        extra = set(learned_links[spell_id])
        for i in range(1, 9):
            item_id = spell[f'Reagent{i}']
            if item_id > 0 and item_id not in selected_item_ids:
                selected_item_ids.add(item_id)
                pending_items.add(item_id)
        for i in range(1, 3):
            item_id = spell[f'Totem{i}']
            if item_id > 0 and item_id not in selected_item_ids:
                selected_item_ids.add(item_id)
                pending_items.add(item_id)
        for effect in range(1, 4):
            triggered = spell[f'EffectTriggerSpell{effect}']
            if triggered:
                extra.add(triggered)
            item_id = spell[f'EffectItemType{effect}']
            if spell[f'Effect{effect}'] in (24, 66) and item_id > 0 and item_id not in selected_item_ids:
                selected_item_ids.add(item_id)
                pending_items.add(item_id)
            if spell[f'Effect{effect}'] in (53, 54, 92):
                eid = spell[f'EffectMiscValue{effect}']
                if eid in enchants:
                    selected_enchants.add(eid)
                    row = enchants[eid]
                    extra.update(row[10+i] for i in range(3) if row[1+i] in (1, 3, 7) and row[10+i])
            if spell[f'Effect{effect}'] in (28, 56, 73, 74, 75, 76, 87, 88, 89, 90, 97, 104, 105, 106, 107, 112):
                creature_id = spell[f'EffectMiscValue{effect}']
                if creature_id > 0:
                    selected_creatures.add(creature_id)
                    extra.update(creature_spells[creature_id])
        for triggered in extra - selected_spell_ids:
            if triggered in spells:
                selected_spell_ids.add(triggered)
                pending.add(triggered)

    class_item_inventory = []
    for item_id in sorted(selected_item_ids):
        if item_id not in items:
            continue
        item_sources = [{'table': tab, 'id': r['entry']} for tab in ['npc_vendor', 'npc_vendor_template']
                        for r in tables[tab] if r['item'] == item_id]
        class_item_inventory.append({'itemId': item_id, 'name': items[item_id]['name'],
                                     'sources': item_sources, 'dataStatus': 'complete'})
    enchantments = {}
    for eid in sorted(selected_enchants):
        row = enchants[eid]
        name = next((dbc_text(enchant_strings, offset) for offset in row[13:21] if offset), '')
        enchantments[str(eid)] = {'id': eid, 'name': name, 'effects': [
            {'type': row[1+i], 'amount': row[4+i], 'spellId': row[10+i]}
            for i in range(3) if row[1+i]], 'source': 'SpellItemEnchantment.dbc'}

    selected_tables = {
        'playercreateinfo': [row for row in tables['playercreateinfo']
                             if (row['race'], row['class']) in valid_pairs],
        'player_levelstats': [row for row in tables['player_levelstats']
                              if (row['race'], row['class']) in valid_pairs and row['level'] <= 60],
        'player_classlevelstats': [row for row in tables['player_classlevelstats']
                                   if row['class'] in SPELL_FAMILY and row['level'] <= 60],
        'playercreateinfo_action': [row for row in tables['playercreateinfo_action']
                                    if (row['race'], row['class']) in valid_pairs],
        'playercreateinfo_spell': [row for row in tables['playercreateinfo_spell']
                                   if (row['race'], row['class']) in valid_pairs],
        'playercreateinfo_skills': [row for row in tables['playercreateinfo_skills']
                                    if any((not row['raceMask'] or row['raceMask'] & (1 << (race-1))) and
                                           (not row['classMask'] or row['classMask'] & (1 << (class_id-1)))
                                           for race, class_id in valid_pairs)],
        'spell_chain': [row for row in tables['spell_chain'] if row['spell_id'] in selected_spell_ids],
        'spell_template': [spells[spell_id] for spell_id in sorted(selected_spell_ids) if spell_id in spells],
        'item_template': [items[item_id] for item_id in sorted(selected_item_ids) if item_id in items],
        'player_xp_for_level': [r for r in tables['player_xp_for_level'] if r['lvl'] <= 60],
        'spell_affect': [{**r, 'SpellFamilyMask': str(r['SpellFamilyMask'])} for r in tables['spell_affect']],
        'spell_proc_event': [{**r, **{k: str(v) for k, v in r.items() if k.startswith('SpellFamilyMask')}} for r in tables['spell_proc_event']],
        'spell_learn_spell': [r for r in tables['spell_learn_spell'] if r['entry'] in selected_spell_ids],
        'spell_pet_auras': [r for r in tables['spell_pet_auras'] if r['spell'] in selected_spell_ids],
        'petcreateinfo_spell': [r for r in tables['petcreateinfo_spell'] if r['entry'] in selected_creatures],
        'pet_levelstats': [r for r in tables['pet_levelstats'] if r['level'] <= 60],
        'pet_familystats': tables['pet_familystats'],
        'creature_template': [r for r in tables['creature_template'] if r['Entry'] in selected_creatures],
        'creature_template_spells': [r for r in tables['creature_template_spells'] if r['entry'] in selected_creatures],
        'pickpocketing_loot_template': tables['pickpocketing_loot_template'],
        'item_loot_template': [r for r in tables['item_loot_template'] if r['entry'] in selected_item_ids],
        'reference_loot_template': [r for r in tables['reference_loot_template'] if r['entry'] in loot_references],
    }
    compact_tables = {
        name: [[row.get(column) for column in schemas[name]] for row in rows]
        for name, rows in selected_tables.items()
    }
    return {
        'meta': {
            'dataset': 'WoW Classic all-class level 1-60 reference extract',
            'status': 'reference-only; not official verified', 'schemaVersion': 2,
            'classicDbCommit': SOURCE_COMMIT, 'classicDbArchiveSha256': SOURCE_SHA256,
            'dbcProvenance': talent_dbc['provenance'],
            'additionalDbcProvenance': {'repository': 'https://github.com/soyalu/cmangos-classic-map',
                'commit': '93b11b73ee4e483ce414f3d5f99a9047d23a9e48', 'sha256': EXTRA_DBC_HASHES,
                'status': 'third-party client DBC mirror; exact build unverified'},
            'talentArchive': {'path': 'talents/archive-spells.json',
                              'sha256': ARCHIVE_SPELLS_SHA256, 'snapshot': '2019'},
            'selection': 'All 40 vanilla race/class combinations; levels 1-60; all class trainer abilities through level 60; all 27 talent trees. Spell and item records are dependency-selected.',
            'counts': {name: len(rows) for name, rows in selected_tables.items()},
        },
        'encoding': 'rows-v1',
        'schemas': {name: schemas[name] for name in selected_tables},
        'tables': compact_tables,
        'classDefinitions': class_definitions, 'raceDefinitions': RACES,
        'classAbilities': class_abilities, 'classStartingItems': class_starting_items,
        'classTalentTrees': class_trees,
        'classContentManifest': manifest,
        'classEnchantments': enchantments,
        'classSpellIconNames': {str(sid): icon_names[spells[sid]['SpellIconID']] for sid in sorted(selected_spell_ids) if sid in spells and spells[sid]['SpellIconID'] in icon_names},
        'preciseSpellFamilyFlags': {str(sid): str(spells[sid]['SpellFamilyFlags']) for sid in sorted(selected_spell_ids) if sid in spells},
        'classQuestSources': [q for q in tables['quest_template'] if q['entry'] in acquisition_quests],
        'classItemInventory': class_item_inventory,
        'classLocks': locks,
        'translations': {
            'status': 'manually reviewed zhCN display fallback; source IDs and mechanics remain pinned records',
            'spellNamesByEnglish': localized_english, 'talentNamesByEnglish': TALENT_NAME_ZH,
        },
    }


def self_test(bundle: dict) -> None:
    assert len(bundle['classDefinitions']) == 9
    assert len(bundle['raceDefinitions']) == 8
    assert sum(len(row['races']) for row in bundle['classDefinitions']) == 40
    assert bundle['meta']['counts']['player_levelstats'] == 2400
    assert bundle['meta']['counts']['player_classlevelstats'] == 540
    assert len(bundle['classStartingItems']) == 40
    assert len(bundle['classTalentTrees']) == 27
    assert all(len([tree for tree in bundle['classTalentTrees'] if tree['classId'] == row['id']]) == 3
               for row in bundle['classDefinitions'])
    assert all(any(ability['startingSpell'] for ability in abilities)
               for abilities in bundle['classAbilities'].values())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, default=DEFAULT_SQL)
    parser.add_argument('--research-root', type=Path, default=DEFAULT_RESEARCH)
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    result = build(args.archive, args.research_root)
    self_test(result)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(json.dumps({'out': str(args.out), 'bytes': args.out.stat().st_size,
                      'counts': result['meta']['counts'],
                      'abilities': {key: len(value) for key, value in result['classAbilities'].items()},
                      'talentTrees': len(result['classTalentTrees'])}, indent=2))
