// Classic Era archetypes, adapted to the skills supported by this simulation.
// Exact allocations and their validation are owned here, not by UI templates.
const r=(name,condition='always',value=0)=>({name,condition,value,enabled:true});
const heal=(name,value)=>r(name,'allyHealthBelow',value);
export const pvpPresets=[
 {id:'arms',classId:1,name:'武器压制 · 31/20/0',role:'melee',description:'致死打击制造治疗压力，断筋留人；盾击打断，保留恐惧用于接控或援护。沿用实际装备，双手武器更适合此方案。',
  talents:[[127,3],[130,2],[641,5],[131,2],[121,3],[137,1],[662,2],[136,3],[133,1],[132,5],[129,3],[135,1],[157,5],[159,5],[160,1],[661,3],[154,1],[155,5]],
  rules:[r('Battle Stance'),r('Shield Wall','healthBelow',25),r('Shield Bash','targetCasting'),r('Pummel','targetCasting'),r('Intimidating Shout'),r('Bloodrage','manaBelow',30),r('Battle Shout'),r('Hamstring'),r('Mortal Strike'),r('Overpower'),r('Execute','targetHealthBelow',20),r('Heroic Strike','manaAbove',75)]},
 {id:'holy-paladin',classId:2,name:'神圣援护 · 31/20/0',role:'healer',description:'抗打断治疗、神恩术与神圣震击救急；自由祝福协助队友脱离减速，制裁参与控制链。',
  talents:[[1449,5],[1432,5],[1444,3],[1628,2],[1461,5],[1433,1],[1446,2],[1443,2],[1627,5],[1502,1],[1421,5],[1425,2],[1630,3],[1442,1],[1423,4],[1521,3],[1626,2]],
  rules:[r('Divine Shield','healthBelow',25),heal('Divine Favor',40),heal('Holy Shock',35),heal('Lay on Hands',15),heal('Flash of Light',80),heal('Holy Light',55),r('Cleanse'),r('Blessing of Freedom'),r('Hammer of Justice'),r('Concentration Aura'),r('Blessing of Wisdom')]},
 {id:'marksman',classId:3,name:'射击牵制 · 0/31/20',role:'ranged',description:'驱散射击与威慑提供反压制空间；瞄准射击配合队伍爆发，震荡射击与摔绊限制追击。',
  talents:[[1341,5],[1344,5],[1345,1],[1352,3],[1342,1],[1349,5],[1353,1],[1347,3],[1342,1],[1362,5],[1361,1],[1301,3],[1311,2],[1305,5],[1308,1],[1622,4],[1310,3],[1309,2]],
  rules:[r('Call Pet'),r('Revive Pet'),r('Deterrence','healthBelow',35),r('Scatter Shot'),r('Concussive Shot'),r('Wing Clip','enemyNear',5),r('Mend Pet','petHealthBelow',35),r('Aspect of the Hawk'),r('Rapid Fire'),r('Aimed Shot'),r('Arcane Shot'),r('Auto Shot'),r('Raptor Strike','enemyNear',5)]},
 {id:'hemo',classId:4,name:'出血冷血 · 21/0/30',role:'melee',description:'预备与冷血提供多轮进攻；出血攒星、肾击接控，脚踢切断治疗。默认不铺割裂，降低误破控制风险。',
  talents:[[270,5],[276,3],[273,3],[274,2],[281,1],[269,5],[682,1],[280,1],[241,5],[244,5],[245,3],[303,1],[247,2],[1123,3],[262,1],[284,1],[681,1],[265,2],[1701,2],[1702,4]],
  rules:[r('Stealth','combatTimeBelow',1),r('Cheap Shot'),r('Kick','targetCasting'),r('Evasion','healthBelow',35),r('Vanish','healthBelow',20),r('Blind'),r('Kidney Shot'),r('Gouge'),r('Preparation','healthBelow',50),r('Cold Blood','comboAtLeast',4),r('Eviscerate','comboAtLeast',4),r('Hemorrhage'),r('Sinister Strike')]},
 {id:'discipline',classId:5,name:'戒律救援 · 31/20/0',role:'healer',description:'强化盾、抗打断与法术防护维持治疗；心灵尖啸为队友解围，能量灌注支持爆发，驱散解除控制。',
  talents:[[342,5],[321,2],[343,3],[344,2],[347,3],[348,1],[341,5],[350,2],[351,1],[1201,5],[346,1],[322,1],[410,2],[401,3],[411,5],[1181,5],[361,3],[1636,2]],
  rules:[heal('Inner Focus',40),heal('Power Word: Shield',55),heal('Flash Heal',35),r('Dispel Magic'),r('Psychic Scream'),heal('Greater Heal',65),heal('Heal',65),heal('Renew',85),r('Power Infusion'),r('Inner Fire'),r('Mana Burn','manaAbove',75),r('Shoot','manaBelow',20),r('Smite','manaAbove',80)]},
 {id:'elemental',classId:7,name:'元素爆发 · 30/0/21',role:'ranged',description:'元素之怒与闪电掌握制造爆发窗口，自然迅捷保留救急；地震术打断、净化移除增益。',
  talents:[[563,5],[564,5],[1640,3],[574,1],[562,5],[1642,3],[565,1],[1641,2],[721,5],[586,5],[593,5],[595,5],[587,5],[591,1]],
  rules:[heal("Nature's Swiftness",30),heal('Lesser Healing Wave',30),r('Earth Shock','targetCasting'),r('Purge'),r('Grounding Totem'),r('Tremor Totem'),r('Lightning Shield'),r('Frost Shock','enemyNear',20),r('Chain Lightning'),r('Lightning Bolt')]},
 {id:'frost',classId:8,name:'深冰反制 · 17/0/34',role:'ranged',description:'强化反制封锁施法，变形术接控；寒冰屏障、寒冰护体和急速冷却提高生存，冰环援护后恢复寒冰箭压制。',
  talents:[[37,5],[1649,3],[38,3],[62,2],[65,3],[69,1],[73,5],[67,5],[741,2],[72,1],[71,1],[64,3],[74,2],[76,3],[75,5],[1650,5],[88,2]],
  rules:[r('Ice Block','healthBelow',25),r('Counterspell','targetCasting'),r('Polymorph'),r('Frost Nova','enemyNear',8),r('Ice Barrier'),r('Cold Snap','healthBelow',50),r('Remove Lesser Curse'),r('Fire Blast','targetHealthBelow',25),r('Cone of Cold','enemyNear',8),r('Shoot','manaBelow',15),r('Frostbolt')]},
 {id:'soul-link',classId:9,name:'灵魂链接 · 20/31/0',role:'ranged',description:'恶魔支援与灵魂链接维持生存；恐惧参与接控，死亡缠绕用于反压制。持续伤害集中在击杀目标。',
  talents:[[1223,5],[1221,2],[1242,3],[1226,1],[1241,5],[1262,5],[1227,2],[1281,1],[1243,1],[1244,5],[1282,1],[1003,5],[1005,2],[1007,2],[1004,1],[1001,5],[1002,2],[1021,2],[1061,1]],
  rules:[r('Summon Felhunter'),r('Demon Armor'),r('Soul Link'),r('Death Coil','healthBelow',40),r('Fear'),r('Drain Life','healthBelow',50),r('Life Tap','manaBelow',25),r('Corruption','targetHealthAbove',40),r('Curse of Agony','targetHealthAbove',50),r('Shadow Bolt'),r('Shoot','manaBelow',15)]},
 {id:'restoration',classId:11,name:'迅捷恢复 · 8/11/32',role:'healer',description:'迅捷治愈和自然迅捷处理集火，回春与愈合维持血线；自然之握、纠缠根须提供脱身与援护。',
  talents:[[761,1],[921,4],[781,3],[796,5],[797,2],[799,3],[804,1],[822,5],[824,5],[823,5],[827,1],[829,3],[843,5],[830,1],[831,1],[828,5],[844,1]],
  rules:[heal("Nature's Swiftness",30),heal('Swiftmend',40),heal('Regrowth',40),heal('Rejuvenation',85),heal('Healing Touch',65),r('Remove Curse'),r('Abolish Poison'),r("Nature's Grasp",'underAttack'),r('Entangling Roots'),r('Barkskin','healthBelow',45),r('Moonfire','manaAbove',85)]},
];
