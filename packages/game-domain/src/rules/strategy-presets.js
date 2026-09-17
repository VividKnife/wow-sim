import {classTalentTrees,spells} from './catalog.js';
import {strategySpellIds} from './combat-strategy.js';
import {dominantTalentTree} from './combat-roles.js';

const r=(name,condition='always',value=0,...and)=>({name,condition,value,...(and.length?{and:and.map(([condition,value=0])=>({condition,value}))}:{})});
const heal=(name,value=65)=>r(name,'allyHealthBelow',value);
const dot=name=>r(name,'targetHealthAbove',35);
const aoe=(name,count=3,mana=35)=>r(name,'enemyCountAtLeast',count,['manaAbove',mana]);
const shoot=r('Shoot','manaBelow',20);
const nova=r('Frost Nova','enemyNear',8);
const sheep=r('Polymorph','combatEnemyCountAtMost',2);
const evocation=r('Evocation','manaBelow',20,['enemyFar',20]);
const kick=r('Kick','targetCasting');
const evasion=r('Evasion','healthBelow',40,['underAttack']);
const eviscerate=r('Eviscerate','comboAtLeast',4);
const pet=[r('Call Pet'),r('Revive Pet')];
const hawk=r('Aspect of the Hawk');
const sting=r('Serpent Sting','enemyFar',8,['targetHealthAbove',35]);
const arcaneShot=r('Arcane Shot','enemyFar',8,['manaAbove',25]);
const multi= r('Multi-Shot','enemyCountAtLeast',2,['enemyFar',8],['manaAbove',35]);
const slow=r('Concussive Shot','enemyNear',15,['underAttack']);
const tap=r('Life Tap','manaBelow',25,['healthAbove',60]);
const profiles={
 161:{role:'melee',description:'武器：战斗姿态，打断优先；压制触发就用，长血量目标维持撕裂。三怪雷霆一击，双怪顺劈；怒气富余才排英勇打击。',rules:[r('Battle Stance'),r('Shield Bash','targetCasting'),r('Overpower'),r('Bloodrage','manaBelow',30,['healthAbove',60]),r('Battle Shout'),aoe('Thunder Clap',3,30),dot('Rend'),aoe('Cleave',2,45),r('Heroic Strike','manaAbove',60)]},
 164:{role:'melee',description:'狂怒：20 级以双持平砍为核心，保持战斗怒吼，血性狂暴补怒；双怪顺劈，单怪高怒气英勇打击，压制与打断优先。',rules:[r('Battle Stance'),r('Shield Bash','targetCasting'),r('Overpower'),r('Bloodrage','manaBelow',35,['healthAbove',60]),r('Battle Shout'),aoe('Cleave',2,40),r('Heroic Strike','manaAbove',55)]},
 163:{role:'tank',description:'防护：防御姿态接怪，嘲讽救援、盾击打断；危险时破釜沉舟/盾牌格挡。复仇优先，群怪挫志与顺劈，再用破甲稳定仇恨。',rules:[r('Defensive Stance'),r('Taunt'),r('Shield Bash','targetCasting'),r('Last Stand','healthBelow',30),r('Shield Block','healthBelow',65,['underAttack']),r('Revenge'),r('Bloodrage','manaBelow',30,['healthAbove',50]),r('Battle Shout'),aoe('Demoralizing Shout',2,20),aoe('Cleave',2,45),r('Sunder Armor'),r('Heroic Strike','manaAbove',70)]},
 382:{role:'healer',description:'神圣：圣疗救命，重伤圣光术，中轻伤圣光闪现；优先净化，保持智慧祝福和虔诚光环，预留法力治疗。',rules:[heal('Lay on Hands',20),heal('Holy Light',40),heal('Flash of Light',80),r('Purify'),r('Divine Protection','healthBelow',25,['underAttack']),r('Blessing of Wisdom'),r('Devotion Aura')]},
 383:{role:'tank',description:'防护：虔诚光环与正义之怒建立坦克基础，维持正义圣印；制裁打断，审判补仇恨，双怪以上使用已学奉献。圣疗和低血圣光自救。',rules:[heal('Lay on Hands',20),r('Devotion Aura'),r('Righteous Fury'),r('Hammer of Justice','targetCasting'),r('Seal of Righteousness'),aoe('Consecration',2,35),r('Judgement','manaAbove',30),r('Holy Light','healthBelow',35),r('Blessing of Might')]},
 381:{role:'melee',description:'惩戒：优先命令圣印，未学则用正义圣印；力量祝福强化平砍，制裁打断，审判消耗多余法力，圣疗与圣光救急。',rules:[heal('Lay on Hands',20),r('Hammer of Justice','targetCasting'),heal('Holy Light',30),r('Blessing of Might'),r('Retribution Aura'),r('Seal of Command'),r('Seal of Righteousness'),r('Judgement','manaAbove',35)]},
 361:{role:'ranged',description:'野兽掌握：宠物低于 60% 生命先治疗；保持雄鹰守护，近身震荡减速。双怪多重射击，长血量目标毒蛇钉刺，奥术射击配合自动射击。',rules:[...pet,r('Mend Pet','petHealthBelow',60,['enemyFar',15]),hawk,slow,multi,sting,arcaneShot,r('Auto Shot','enemyFar',8),r('Raptor Strike','enemyNear',5)]},
 363:{role:'ranged',description:'射击：双怪多重射击优先，单体以已学瞄准射击为核心，配合毒蛇钉刺、奥术射击；预留低蓝自动射击，宠物濒危时治疗。',rules:[...pet,r('Mend Pet','petHealthBelow',35,['enemyFar',15]),hawk,slow,multi,sting,r('Aimed Shot','enemyFar',8,['manaAbove',25]),arcaneShot,r('Auto Shot','enemyFar',8),r('Raptor Strike','enemyNear',5)]},
 362:{role:'ranged',description:'生存：保持远程输出；敌人贴身时摔绊，低血遭攻击时威慑，再用震荡射击拉开距离。多重射击处理双怪，毒蛇钉刺与奥术射击处理单体。',rules:[...pet,r('Deterrence','healthBelow',35,['underAttack']),r('Wing Clip','enemyNear',5),slow,r('Mend Pet','petHealthBelow',40,['enemyFar',15]),hawk,multi,sting,arcaneShot,r('Auto Shot','enemyFar',8),r('Raptor Strike','enemyNear',5)]},
 182:{role:'melee',description:'刺杀：脚踢打断、闪避自救；四星以上对高血量目标割裂，残血或割裂已存在时剔骨。背刺需匕首和背面条件，不满足则邪恶攻击攒星。',rules:[kick,evasion,r('Rupture','comboAtLeast',4,['targetHealthAbove',55]),eviscerate,r('Backstab'),r('Sinister Strike')]},
 181:{role:'melee',description:'战斗：脚踢和闪避优先，还击在招架后使用；两星以上维持切割，四星剔骨，邪恶攻击攒星。短命目标不浪费连击点补切割。',rules:[kick,evasion,r('Riposte'),r('Slice and Dice','comboAtLeast',2,['targetHealthAbove',40]),eviscerate,r('Sinister Strike')]},
 183:{role:'melee',description:'敏锐：开场潜行伏击（需要匕首），脚踢打断；四星剔骨，鬼魅攻击按冷却使用，背刺条件不满足时回退邪恶攻击。',rules:[r('Stealth','combatTimeBelow',1),r('Ambush'),kick,evasion,eviscerate,r('Ghostly Strike'),r('Backstab'),r('Sinister Strike')]},
 201:{role:'healer',description:'戒律：低血盾与快速治疗救急，治疗术填大缺口，恢复维持轻伤；驱散优先，心灵专注留给重伤。低蓝用魔杖，70% 以上法力才惩击。',rules:[r('Inner Focus','allyHealthBelow',40),heal('Power Word: Shield',40),heal('Flash Heal',30),heal('Heal',65),heal('Lesser Heal',65),heal('Renew',85),r('Dispel Magic'),r('Cure Disease'),r('Inner Fire'),shoot,r('Smite','manaAbove',70)]},
 202:{role:'healer',description:'神圣：快速治疗抢救濒危，治疗术处理重伤，恢复处理轻伤；盾作应急缓冲，驱散疾病与魔法。法力富余才输出，低蓝魔杖节能。',rules:[heal('Flash Heal',35),heal('Power Word: Shield',25),heal('Heal',65),heal('Lesser Heal',65),heal('Renew',85),r('Dispel Magic'),r('Cure Disease'),r('Inner Fire'),shoot,r('Smite','manaAbove',70)]},
 203:{role:'ranged',description:'暗影：仅重伤救急，长血量目标维持暗言术：痛，心灵震爆后精神鞭笞；法力不足用魔杖。未学鞭笞时以惩击补位。',rules:[heal('Power Word: Shield',30),heal('Flash Heal',25),r('Dispel Magic'),shoot,dot('Shadow Word: Pain'),r('Mind Blast','manaAbove',25),r('Mind Flay','manaAbove',20),r('Smite','manaAbove',25)]},
 261:{role:'ranged',description:'元素：治疗波仅救急，敌人进入 20 码时地震术打断、烈焰震击持续伤害；正常后排距离以闪电箭输出，保留 20% 法力应急。',rules:[heal('Lesser Healing Wave',30),heal('Healing Wave',40),r('Earth Shock','targetCasting'),r('Purge'),r('Lightning Shield'),r('Flame Shock','enemyNear',20,['targetHealthAbove',40]),r('Lightning Bolt','manaAbove',20)]},
 263:{role:'melee',description:'增强：石化武器、闪电之盾和大地之力支援近战；地震术打断，长血量目标烈焰震击，灼热图腾补伤害；低血治疗，低蓝保留平砍。',rules:[heal('Lesser Healing Wave',30),r('Earth Shock','targetCasting'),r('Rockbiter Weapon'),r('Lightning Shield'),r('Strength of Earth Totem','manaAbove',30),r('Searing Totem','manaAbove',40),dot('Flame Shock'),r('Earth Shock','manaAbove',50),heal('Healing Wave',40)]},
 262:{role:'healer',description:'恢复：次级治疗波处理濒危，治疗波处理重伤，清毒优先；治疗之泉在已学时维持。法力超过 75% 才施放闪电箭。',rules:[heal('Lesser Healing Wave',35),heal('Healing Wave',75),r('Cure Poison'),r('Healing Stream Totem','manaAbove',30),r('Lightning Shield','manaAbove',60),r('Lightning Bolt','manaAbove',75)]},
 41:{role:'ranged',description:'火焰：三怪聚集时烈焰风暴，地面火焰持续期间转单体；小规模战斗开场炎爆，火球主攻，残血火冲。贴身冰环、低蓝唤醒，少量敌人可变形控场。',rules:[nova,evocation,aoe('Flamestrike'),sheep,r('Pyroblast','combatTimeBelow',6,['targetHealthAbove',70],['combatEnemyCountAtMost',2]),r('Fire Blast','targetHealthBelow',20),shoot,r('Fireball')]},
 61:{role:'ranged',description:'冰霜：三怪以上聚集且法力至少 35% 时引导暴风雪，单体寒冰箭，残血火冲；双怪优先羊副目标。贴身冰环，低血且冰环冷却时急速冷却，安全距离低蓝唤醒。',rules:[nova,r('Cold Snap','enemyNear',8,['healthBelow',50]),evocation,aoe('Blizzard'),sheep,r('Fire Blast','targetHealthBelow',20),shoot,r('Frostbolt')]},
 81:{role:'ranged',description:'奥术：安全距离以奥术飞弹打单体；三怪远程暴风雪，三怪贴身且自身健康时魔爆解围。冰环脱身、低蓝唤醒，少量敌人变形控场。',rules:[nova,evocation,r('Arcane Explosion','enemyCountAtLeast',3,['enemyNear',10],['healthAbove',60],['manaAbove',40]),aoe('Blizzard',3,40),sheep,r('Fire Blast','targetHealthBelow',20),shoot,r('Arcane Missiles')]},
 302:{role:'ranged',description:'痛苦：恶魔护甲与小鬼常驻，生命充足才分流；优先吸取生命自救，高血量目标维持痛苦诅咒和腐蚀术，三怪火焰之雨，低蓝魔杖。',rules:[r('Summon Imp'),r('Demon Armor'),r('Drain Life','healthBelow',55),tap,aoe('Rain of Fire',3,45),r('Amplify Curse','targetHealthAbove',60),dot('Curse of Agony'),dot('Corruption'),shoot,r('Shadow Bolt')]},
 303:{role:'ranged',description:'恶魔学识：优先虚空行者，缺少召唤技能时小鬼补位；宠物重伤且自身安全时生命通道，低血吸取生命，高血分流。群怪火焰之雨，单体腐蚀、献祭与暗影箭。',rules:[r('Summon Voidwalker'),r('Summon Imp'),r('Demon Armor'),r('Health Funnel','petHealthBelow',40,['healthAbove',65]),r('Drain Life','healthBelow',50),tap,aoe('Rain of Fire',3,45),dot('Corruption'),dot('Immolate'),shoot,r('Shadow Bolt')]},
 301:{role:'ranged',description:'毁灭：三怪火焰之雨，残血暗影灼烧（需碎片），单体献祭与暗影箭；吸取生命自救、生命充足时分流。避免默认灼热之痛持续制造高仇恨。',rules:[r('Summon Imp'),r('Demon Armor'),r('Drain Life','healthBelow',45),tap,r('Shadowburn','targetHealthBelow',20),aoe('Rain of Fire',3,40),dot('Immolate'),shoot,r('Shadow Bolt')]},
 283:{role:'ranged',description:'平衡：治疗之触救急，高血量目标月火；星火用于健康目标，残血改用愤怒缩短读条。保留 20% 法力应急，20 级尚无飓风群攻。',rules:[heal('Healing Touch',35),r('Remove Curse'),r('Cure Poison'),dot('Moonfire'),r('Starfire','targetHealthAbove',45,['manaAbove',25]),r('Wrath','manaAbove',20)]},
 281:{role:'melee',description:'野性猫：猫形态近战攒星，四星以上且目标血量超过 50% 才撕扯；猛虎之怒强化输出，爪击攒星。20 级没有凶猛撕咬，短命目标继续爪击。',rules:[r('Cat Form'),r('Rip','comboAtLeast',4,['targetHealthAbove',50]),r("Tiger's Fury",'targetHealthAbove',40),r('Claw')]},
 282:{role:'healer',description:'恢复：愈合抢救重伤，治疗之触处理较大缺口，回春维护轻伤；先解诅咒与毒，法力富余时虫群或愤怒输出。',rules:[heal('Regrowth',35),heal('Healing Touch',65),heal('Rejuvenation',85),r('Remove Curse'),r('Cure Poison'),r('Insect Swarm','targetHealthAbove',40,['manaAbove',75]),r('Wrath','manaAbove',80)]},
 '281-bear':{role:'tank',description:'野性熊：熊形态低怒气激怒，低血停用激怒；低吼救援、重击打断。群怪挫志咆哮，双怪挥击，怒气富余重殴。',rules:[r('Bear Form'),r('Growl'),r('Bash','targetCasting'),r('Enrage','manaBelow',25,['healthAbove',70]),aoe('Demoralizing Roar',2,20),aoe('Swipe',2,20),r('Maul','manaAbove',25)]},
};
const treeNames={41:'火焰',61:'冰霜',81:'奥术'};
const defaultTrees={1:163,2:381,3:361,4:181,5:202,7:261,8:61,9:302,11:283};
export function strategyPresets(c){
 const available=new Map(strategySpellIds(c).map(id=>[spells[id].SpellName,id]));
 return classTalentTrees.filter(t=>t.classId===c.classId).flatMap(tree=>{
  const variants=[{id:String(tree.id),name:treeNames[tree.id]||tree.name}];
  if(tree.id===281)variants.push({id:'281-bear',name:'野性战斗 · 熊坦'});
  return variants.map(({id,name})=>{
   const {role,description,rules}=profiles[id];
   const priority=rules.filter(row=>available.has(row.name)&&!(row.name==='Seal of Righteousness'&&available.has('Seal of Command')&&tree.id===381)&&!(row.name==='Lesser Heal'&&available.has('Heal'))&&!(row.name==='Summon Imp'&&available.has('Summon Voidwalker')&&tree.id===303));
   return {id,name:`20级 · ${name}`,level:20,role,description,
    recommended:id===String(dominantTalentTree(c)||defaultTrees[c.classId]),
    rules:priority.map(({name,...conditions})=>({spell:available.get(name),...conditions,enabled:true})),
    policy:{role,protectCC:true,waitForTank:role!=='tank',pullDelaySeconds:3},
    autoBuffs:{enabled:true,armor:true,int:true,sta:true,targets:'party',refreshSeconds:30},
    potions:{enabled:true,health:35,mana:20,healthItem:0,manaItem:0},
   };
  });
 });
}
