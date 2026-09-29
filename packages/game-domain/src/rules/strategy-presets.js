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
// Level milestones describe rotations; learned ranks are resolved when applied.
const execute=r('Execute','targetHealthBelow',20);
const counterspell=r('Counterspell','targetCasting');
const rapid=r('Rapid Fire','targetHealthAbove',60,['enemyFar',8]);
const mark=r("Hunter's Mark",'targetHealthAbove',50);
const fade=r('Fade','underAttack');
const profiles40={
 161:{description:'武器：战斗姿态下以致死打击和压制为核心，20% 以下斩杀；双怪横扫、顺劈，长血量目标撕裂，富余怒气才英勇打击。',rules:[r('Battle Stance'),r('Shield Bash','targetCasting'),execute,r('Overpower'),r('Bloodrage','manaBelow',30,['healthAbove',60]),r('Battle Shout'),r('Sweeping Strikes','enemyCountAtLeast',2,['manaAbove',30]),r('Mortal Strike'),aoe('Thunder Clap',3,40),dot('Rend'),aoe('Cleave',2,55),r('Heroic Strike','manaAbove',70)]},
 164:{description:'狂怒：狂暴姿态下拳击打断、嗜血主攻，双怪旋风斩；健康且目标耐打时死亡之愿，残血斩杀，高怒顺劈或英勇打击。',rules:[r('Berserker Stance'),r('Pummel','targetCasting'),execute,r('Bloodrage','manaBelow',30,['healthAbove',65]),r('Battle Shout'),r('Death Wish','healthAbove',75,['targetHealthAbove',60]),r('Bloodthirst'),aoe('Whirlwind',2,35),aoe('Cleave',2,60),r('Heroic Strike','manaAbove',70)]},
 163:{description:'防护：防御姿态下嘲讽救援、盾击打断；盾墙和破釜沉舟救命，盾牌格挡应对受击。盾牌猛击、复仇与破甲建立仇恨，群怪挫志顺劈。',rules:[r('Defensive Stance'),r('Taunt'),r('Shield Bash','targetCasting'),r('Shield Wall','healthBelow',25,['underAttack']),r('Last Stand','healthBelow',35),r('Shield Block','underAttack'),r('Revenge'),r('Shield Slam'),r('Bloodrage','manaBelow',30,['healthAbove',55]),r('Battle Shout'),aoe('Demoralizing Shout',2,20),r('Sunder Armor'),aoe('Cleave',2,55),r('Heroic Strike','manaAbove',75)]},
 382:{description:'神圣：圣疗抢救，神恩术配合重伤圣光术，圣光闪现维护血线；净化毒病，专注光环减少治疗干扰，智慧祝福续航。',rules:[heal('Lay on Hands',20),r('Divine Shield','healthBelow',25,['underAttack']),heal('Divine Favor',40),heal('Holy Light',45),heal('Flash of Light',80),r('Purify'),r('Concentration Aura'),r('Blessing of Wisdom')]},
 383:{description:'防护：正义之怒、虔诚光环和庇护祝福常驻；受击时神圣之盾，双怪奉献。维持正义圣印与审判，制裁打断，圣疗救急。',rules:[heal('Lay on Hands',20),r('Devotion Aura'),r('Righteous Fury'),r('Hammer of Justice','targetCasting'),r('Holy Shield','underAttack',0,['manaAbove',25]),r('Blessing of Sanctuary'),r('Seal of Righteousness'),aoe('Consecration',2,35),r('Judgement','manaAbove',40),r('Holy Light','healthBelow',35)]},
 381:{description:'惩戒：圣洁光环、力量祝福和命令圣印强化近战；制裁打断，审判输出，双怪且法力充裕时奉献。圣疗、圣盾与圣光术救急。',rules:[heal('Lay on Hands',20),r('Divine Shield','healthBelow',25,['underAttack']),r('Hammer of Justice','targetCasting'),heal('Holy Light',30),r('Blessing of Might'),r('Sanctity Aura'),r('Retribution Aura'),r('Seal of Command'),r('Seal of Righteousness'),r('Judgement','manaAbove',35),aoe('Consecration',2,55)]},
 361:{description:'野兽掌握：治疗宠物，胁迫打断；长血量目标开启狂野怒火和急速射击。猎人印记后多重、毒蛇与奥术射击，低蓝自动射击。',rules:[...pet,r('Mend Pet','petHealthBelow',55,['enemyFar',15]),r('Intimidation','targetCasting'),hawk,slow,mark,r('Bestial Wrath','targetHealthAbove',60),rapid,multi,sting,arcaneShot,r('Auto Shot','enemyFar',8),r('Raptor Strike','enemyNear',5)]},
 363:{description:'射击：强击光环和猎人印记支援远程，长血量目标急速射击；双怪多重、单体瞄准，毒蛇与奥术补伤，低蓝自动射击。',rules:[...pet,r('Mend Pet','petHealthBelow',35,['enemyFar',15]),hawk,r('Trueshot Aura'),slow,mark,rapid,multi,sting,r('Aimed Shot','enemyFar',8,['manaAbove',30]),arcaneShot,r('Auto Shot','enemyFar',8),r('Raptor Strike','enemyNear',5)]},
 362:{description:'生存：威慑自保、摔绊与反击应对贴身，震荡减速；保持印记和雄鹰守护，急速射击配合多重、毒蛇、奥术，低蓝自动射击。',rules:[...pet,r('Deterrence','healthBelow',35,['underAttack']),r('Counterattack','enemyNear',5),r('Wing Clip','enemyNear',5),slow,r('Mend Pet','petHealthBelow',40,['enemyFar',15]),hawk,mark,rapid,multi,sting,arcaneShot,r('Auto Shot','enemyFar',8),r('Raptor Strike','enemyNear',5)]},
 182:{description:'刺杀：脚踢打断、闪避救急；维持切割，四星长血量割裂，冷血配合剔骨。背刺需要匕首和背面，否则邪恶攻击攒星。',rules:[kick,evasion,r('Slice and Dice','comboAtLeast',2,['targetHealthAbove',60]),r('Rupture','comboAtLeast',4,['targetHealthAbove',60]),r('Cold Blood','comboAtLeast',4),eviscerate,r('Backstab'),r('Sinister Strike')]},
 181:{description:'战斗：双怪剑刃乱舞，低能量且目标耐打时冲动；还击优先，切割维持攻速，四星剔骨，邪恶攻击攒星。',rules:[kick,evasion,r('Riposte'),r('Blade Flurry','enemyCountAtLeast',2),r('Adrenaline Rush','manaBelow',35,['targetHealthAbove',50]),r('Slice and Dice','comboAtLeast',2,['targetHealthAbove',40]),eviscerate,r('Sinister Strike')]},
 183:{description:'敏锐：潜行预谋后伏击，维持切割，四星剔骨；鬼魅攻击与出血攒星，未学出血时回退背刺或邪恶攻击。',rules:[r('Stealth','combatTimeBelow',1),r('Premeditation','combatTimeBelow',6),r('Ambush'),kick,evasion,r('Slice and Dice','comboAtLeast',2,['targetHealthAbove',50]),eviscerate,r('Ghostly Strike'),r('Hemorrhage'),r('Backstab'),r('Sinister Strike')]},
 201:{description:'戒律：心灵专注配合盾与快速治疗抢救，强效治疗处理重伤，恢复维护血线；渐隐自保，驱散与祛病支援，低蓝魔杖。',rules:[r('Inner Focus','allyHealthBelow',40),heal('Power Word: Shield',40),heal('Flash Heal',30),heal('Greater Heal',65),heal('Heal',65),heal('Renew',85),fade,r('Dispel Magic'),r('Abolish Disease'),r('Inner Fire'),shoot,r('Smite','manaAbove',80)]},
 202:{description:'神圣：快速治疗与盾处理危急，强效治疗填补缺口，恢复维护轻伤；渐隐减压，驱散与祛病优先于富蓝输出。',rules:[heal('Flash Heal',35),heal('Power Word: Shield',25),heal('Greater Heal',65),heal('Heal',65),heal('Renew',85),fade,r('Dispel Magic'),r('Abolish Disease'),r('Inner Fire'),shoot,r('Smite','manaAbove',80)]},
 203:{description:'暗影：暗影形态下维持吸血鬼拥抱与痛，沉默打断，震爆和鞭笞输出；危急时盾与快速治疗，治疗后恢复暗影形态，低蓝魔杖。',rules:[heal('Power Word: Shield',30),heal('Flash Heal',25),r('Silence','targetCasting'),fade,r('Dispel Magic'),r('Shadowform'),r('Vampiric Embrace','targetHealthAbove',50),shoot,dot('Shadow Word: Pain'),r('Mind Blast','manaAbove',30),r('Mind Flay','manaAbove',20)]},
 261:{description:'元素：地震术打断，元素掌握配合双怪闪电链；法力之泉续航，闪电箭单体，烈焰震击仅近距离长血量目标，预留法力救急。',rules:[heal('Lesser Healing Wave',30),heal('Healing Wave',40),r('Earth Shock','targetCasting'),r('Purge'),r('Lightning Shield'),r('Mana Spring Totem','manaAbove',25),r('Elemental Mastery','targetHealthAbove',60,['manaAbove',40]),aoe('Chain Lightning',2,40),r('Flame Shock','enemyNear',20,['targetHealthAbove',50]),r('Lightning Bolt','manaAbove',25)]},
 263:{description:'增强：风怒武器、力量图腾与闪电之盾支援近战；地震术打断，风暴打击主攻，烈焰震击和灼热图腾补伤。次级治疗波救急。',rules:[heal('Lesser Healing Wave',30),r('Earth Shock','targetCasting'),r('Windfury Weapon'),r('Rockbiter Weapon'),r('Lightning Shield'),r('Strength of Earth Totem','manaAbove',35),r('Searing Totem','manaAbove',45),r('Stormstrike','manaAbove',25),dot('Flame Shock'),r('Earth Shock','manaAbove',55),heal('Healing Wave',40)]},
 262:{description:'恢复：自然迅捷配合重伤治疗波，次级治疗波抢救，治疗链恢复队伍血线；法力之泉常驻，低蓝法力之潮，清毒祛病后再考虑输出。',rules:[heal("Nature's Swiftness",25),heal('Healing Wave',30),heal('Lesser Healing Wave',40),r('Mana Tide Totem','manaBelow',30),heal('Chain Heal',65),heal('Healing Wave',75),r('Cure Poison'),r('Cure Disease'),r('Mana Spring Totem','manaAbove',20),r('Lightning Bolt','manaAbove',85)]},
 41:{description:'火焰：反制打断、冰环解围，燃烧强化长血量目标；三怪烈焰风暴，贴身群怪冲击波，小规模开场炎爆，火球主攻、火冲收尾。',rules:[counterspell,nova,evocation,r('Combustion','targetHealthAbove',60,['manaAbove',40]),r('Blast Wave','enemyCountAtLeast',3,['enemyNear',10],['manaAbove',40]),aoe('Flamestrike'),sheep,r('Pyroblast','combatTimeBelow',6,['targetHealthAbove',70],['combatEnemyCountAtMost',2]),r('Fire Blast','targetHealthBelow',20),shoot,r('Fireball')]},
 61:{description:'冰霜：寒冰屏障救命、寒冰护体吸收伤害，反制打断；冰环与急速冷却解围，三怪暴风雪，双怪变羊，单体寒冰箭。',rules:[r('Ice Block','healthBelow',20,['underAttack']),counterspell,nova,r('Cold Snap','healthBelow',40,['underAttack']),r('Ice Barrier','manaAbove',25),evocation,aoe('Blizzard'),sheep,r('Fire Blast','targetHealthBelow',20),shoot,r('Frostbolt')]},
 81:{description:'奥术：奥术强化在高蓝长血量目标开启，奥术飞弹单体；三怪暴风雪，贴身且健康时魔爆。反制、冰环与安全距离唤醒优先。',rules:[counterspell,nova,evocation,r('Arcane Power','manaAbove',65,['targetHealthAbove',60]),r('Arcane Explosion','enemyCountAtLeast',3,['enemyNear',10],['healthAbove',60],['manaAbove',45]),aoe('Blizzard',3,45),sheep,r('Fire Blast','targetHealthBelow',20),shoot,r('Arcane Missiles')]},
 302:{description:'痛苦：小鬼与恶魔护甲常驻，低蓝先黑暗契约再安全分流；吸取生命自救，长血量目标维持痛苦诅咒、腐蚀和生命虹吸，三怪火焰之雨。',rules:[r('Summon Imp'),r('Demon Armor'),r('Drain Life','healthBelow',55),r('Dark Pact','manaBelow',30),tap,aoe('Rain of Fire',3,45),r('Amplify Curse','targetHealthAbove',60),dot('Curse of Agony'),dot('Corruption'),r('Siphon Life','targetHealthAbove',55),shoot,r('Shadow Bolt')]},
 303:{description:'恶魔学识：虚空行者与灵魂链接分担伤害，生命通道照顾宠物；吸血自救、安全分流，双持续伤害配合暗影箭，三怪火焰之雨。',rules:[r('Summon Voidwalker'),r('Summon Imp'),r('Demon Armor'),r('Soul Link'),r('Health Funnel','petHealthBelow',40,['healthAbove',65]),r('Drain Life','healthBelow',50),tap,aoe('Rain of Fire',3,45),dot('Corruption'),dot('Immolate'),shoot,r('Shadow Bolt')]},
 301:{description:'毁灭：献祭后燃烧，暗影箭填充，残血暗影灼烧；三怪火焰之雨，吸取生命自救，高血低蓝分流。小鬼与恶魔护甲常驻。',rules:[r('Summon Imp'),r('Demon Armor'),r('Drain Life','healthBelow',45),tap,r('Shadowburn','targetHealthBelow',20),aoe('Rain of Fire',3,40),r('Conflagrate'),dot('Immolate'),shoot,r('Shadow Bolt')]},
 283:{description:'平衡：枭兽形态下精灵之火、月火与星火主攻，残血愤怒；三怪飓风，低蓝激活，治疗之触救急后回到枭兽形态。',rules:[heal('Healing Touch',35),r('Remove Curse'),r('Abolish Poison'),r('Innervate','manaBelow',25),r('Moonkin Form'),r('Faerie Fire','targetHealthAbove',60),aoe('Hurricane',3,50),dot('Moonfire'),r('Starfire','targetHealthAbove',45,['manaAbove',30]),r('Wrath','manaAbove',20)]},
 281:{description:'野性猫：猫形态精灵之火削甲，高血量目标维持扫击；四星长血量撕扯，其余凶猛撕咬。背后撕碎，不满足位置时爪击攒星。',rules:[r('Cat Form'),r('Faerie Fire (Feral)','targetHealthAbove',50),r('Rip','comboAtLeast',4,['targetHealthAbove',55]),r('Ferocious Bite','comboAtLeast',4),r("Tiger's Fury",'targetHealthAbove',50),r('Rake','targetHealthAbove',55),r('Shred'),r('Claw')]},
 282:{description:'恢复：自然迅捷配合危急治疗之触，迅捷治愈消耗已有持续治疗抢救；愈合、触、回春分级治疗，激活续航，解除诅咒与毒。',rules:[heal("Nature's Swiftness",25),heal('Swiftmend',35),heal('Healing Touch',30),heal('Regrowth',45),heal('Healing Touch',65),heal('Rejuvenation',85),r('Innervate','manaBelow',30),r('Remove Curse'),r('Abolish Poison'),r('Insect Swarm','targetHealthAbove',40,['manaAbove',85]),r('Wrath','manaAbove',90)]},
 '281-bear':{description:'野性熊：巨熊形态接怪，低吼救援、重击打断，低血狂暴回复；精灵之火削甲，群怪挫志，双怪挥击，富怒重殴。',rules:[r('Dire Bear Form'),r('Bear Form'),r('Growl'),r('Bash','targetCasting'),r('Frenzied Regeneration','healthBelow',40,['manaAbove',30]),r('Enrage','manaBelow',25,['healthAbove',75]),r('Faerie Fire (Feral)','targetHealthAbove',50),aoe('Demoralizing Roar',2,20),aoe('Swipe',2,25),r('Maul','manaAbove',35)]},
};
// Level 60 retains the mature rotation and changes only the listed priorities.
function endgame(id,description,{before={},replace={}}={}){
 return {description,rules:profiles40[id].rules.flatMap(row=>[...(before[row.name]||[]),...(replace[row.name]||[row])])};
}
const profiles60={
 161:endgame(161,'武器：致死打击与压制优先，20% 以下斩杀；横扫处理双怪，撕裂仅用于耐打目标，怒气充裕才顺劈或英勇打击。',{replace:{Rend:[r('Rend','targetHealthAbove',60)],'Heroic Strike':[r('Heroic Strike','manaAbove',80)]}}),
 164:endgame(164,'狂怒：狂暴姿态拳击打断，嗜血和旋风斩组成循环，斩杀收尾；健康时死亡之愿，保留核心技能怒气，富余才顺劈或英勇打击。',{replace:{Whirlwind:[aoe('Whirlwind',1,40)],'Heroic Strike':[r('Heroic Strike','manaAbove',80)]}}),
 163:endgame(163,'防护：盾墙、破釜沉舟与盾牌格挡保命；嘲讽接怪，盾击或震荡猛击阻止施法，复仇、盾猛和破甲优先，富怒顺劈与英勇打击。',{before:{Revenge:[r('Concussion Blow','targetCasting')]},replace:{'Heroic Strike':[r('Heroic Strike','manaAbove',85)]}}),
 382:endgame(382,'神圣：圣疗抢救，神恩术配合圣光术处理重伤，圣光闪现持续治疗；清洁术解除魔法、毒和疾病，专注光环与智慧祝福保障续航。',{replace:{Purify:[r('Cleanse'),r('Purify')],'Holy Light':[heal('Holy Light',50)]}}),
 383:endgame(383,'防护：神圣之盾与庇护祝福应对受击，正义之怒下奉献处理群怪；圣印审判维持仇恨，愤怒之锤收尾，清洁术支援，圣疗救急。',{before:{Judgement:[r('Hammer of Wrath','targetHealthBelow',20,['manaAbove',30])],'Holy Light':[r('Cleanse')]}}),
 381:endgame(381,'惩戒：圣洁光环与命令圣印主攻，愤怒之锤斩杀，审判配合富蓝奉献；清洁术支援，圣疗、圣盾与圣光术救急。',{before:{Judgement:[r('Hammer of Wrath','targetHealthBelow',20,['manaAbove',25])],'Blessing of Might':[r('Cleanse')]}}),
 361:endgame(361,'野兽掌握：宠物生存与胁迫打断优先，狂野怒火配合急速射击；四怪乱射、双怪多重，长血量毒蛇钉刺，低蓝保留自动射击。',{before:{'Multi-Shot':[aoe('Volley',4,60)]},replace:{'Arcane Shot':[r('Arcane Shot','enemyFar',8,['manaAbove',40])]}}),
 363:endgame(363,'射击：强击光环与印记支援，急速射击强化耐打目标；四怪乱射、双怪多重，单体瞄准优先，奥术射击仅富蓝补位。',{before:{'Multi-Shot':[aoe('Volley',4,60)]},replace:{'Arcane Shot':[r('Arcane Shot','enemyFar',8,['manaAbove',50])]}}),
 362:endgame(362,'生存：威慑、反击与摔绊应对近身，保持震荡减速；四怪乱射、双怪多重，单体印记、毒蛇与富蓝奥术，急速射击用于耐打目标。',{before:{'Multi-Shot':[aoe('Volley',4,65)]},replace:{'Arcane Shot':[r('Arcane Shot','enemyFar',8,['manaAbove',45])]}}),
 182:endgame(182,'刺杀：长战斗维持切割，五星且目标耐打时割裂，其余冷血配合五星剔骨；脚踢与闪避优先，背刺条件不足用邪恶攻击。',{replace:{Rupture:[r('Rupture','comboAtLeast',5,['targetHealthAbove',60])],'Cold Blood':[r('Cold Blood','comboAtLeast',5)],Eviscerate:[r('Eviscerate','comboAtLeast',5)]}}),
 181:endgame(181,'战斗：切割保持攻速，双怪剑刃乱舞，低能量开启冲动；脚踢、闪避与还击优先，五星剔骨，邪恶攻击攒星。',{replace:{Eviscerate:[r('Eviscerate','comboAtLeast',5)],'Slice and Dice':[r('Slice and Dice','comboAtLeast',3,['targetHealthAbove',40])]}}),
 183:endgame(183,'敏锐：潜行预谋伏击起手，切割维持攻速，出血或鬼魅攻击攒星，五星剔骨；危险时闪避与预备提供下一轮防御。',{before:{'Slice and Dice':[r('Preparation','healthBelow',30,['underAttack'])]},replace:{Eviscerate:[r('Eviscerate','comboAtLeast',5)]}}),
 201:endgame(201,'戒律：心灵专注配合危急盾与快速治疗，强效治疗和恢复维持队伍；渐隐、驱散、祛病支援，法力充裕时能量灌注配合输出。',{before:{Smite:[r('Power Infusion','manaAbove',80,['targetHealthAbove',60])]},replace:{'Greater Heal':[heal('Greater Heal',70)]}}),
 202:endgame(202,'神圣：快速治疗与盾抢救，危急时治疗祷言兼顾队伍，强效治疗与恢复维持血线；渐隐、驱散和祛病支援，预留法力。',{before:{'Greater Heal':[r('Prayer of Healing','allyHealthBelow',45,['manaAbove',50])]},replace:{Smite:[r('Smite','manaAbove',90)]}}),
 203:endgame(203,'暗影：沉默打断、渐隐减压，暗影形态保持吸血鬼拥抱与痛；震爆、鞭笞持续输出，保留法力补盾与急救，低蓝魔杖。',{replace:{'Mind Blast':[r('Mind Blast','manaAbove',40)],'Shadow Word: Pain':[r('Shadow Word: Pain','targetHealthAbove',45)]}}),
 261:endgame(261,'元素：地震术打断，元素掌握配合闪电链爆发，闪电箭单体；高蓝时闪电链也用于单体，法力之泉续航，低血优先治疗。',{replace:{'Chain Lightning':[aoe('Chain Lightning',2,40),r('Chain Lightning','manaAbove',70,['targetHealthAbove',50])],'Lightning Bolt':[r('Lightning Bolt','manaAbove',30)]}}),
 263:endgame(263,'增强：风怒武器和风怒图腾支援近战，力量图腾与闪电盾常驻；风暴打击、震击输出，地震术打断，治疗救急并保留法力。',{before:{'Strength of Earth Totem':[r('Windfury Totem','manaAbove',40)]},replace:{Stormstrike:[r('Stormstrike','manaAbove',35)]}}),
 262:endgame(262,'恢复：自然迅捷与治疗波抢救，次级治疗波应急，治疗链处理队伍伤势；法力之潮用于低蓝，法力之泉续航，清毒祛病后保留法力治疗。',{replace:{'Chain Heal':[heal('Chain Heal',75)],'Lightning Bolt':[r('Lightning Bolt','manaAbove',95)]}}),
 41:endgame(41,'火焰：反制与解诅咒支援，燃烧配合长血量目标；三怪烈焰风暴，贴身冲击波，小规模炎爆起手，火球主攻，火冲收尾。',{before:{Combustion:[r('Remove Lesser Curse')]},replace:{Combustion:[r('Combustion','targetHealthAbove',70,['manaAbove',50])]}}),
 61:endgame(61,'冰霜：屏障、护体和急速冷却保障生存，反制与解诅咒支援；三怪暴风雪，贴身冰锥减速，双怪变羊，单体寒冰箭，低蓝安全唤醒。',{before:{Blizzard:[r('Remove Lesser Curse'),r('Cone of Cold','enemyNear',8,['underAttack'],['manaAbove',35])]}}),
 81:endgame(81,'奥术：反制与解诅咒支援，法师护甲续航，高蓝奥术强化；飞弹持续输出，三怪暴风雪，贴身健康时魔爆。',{before:{'Arcane Power':[r('Remove Lesser Curse'),r('Mage Armor')]},replace:{'Arcane Power':[r('Arcane Power','manaAbove',70,['targetHealthAbove',60])]}}),
 302:endgame(302,'痛苦：死亡缠绕与吸血自救，黑暗契约优先于安全分流；耐打目标维持痛苦诅咒、腐蚀与生命虹吸，群怪火焰之雨，单体暗影箭。',{before:{'Drain Life':[r('Death Coil','healthBelow',30)]},replace:{'Siphon Life':[r('Siphon Life','targetHealthAbove',65)]}}),
 303:endgame(303,'恶魔学识：虚空行者和灵魂链接保命，生命通道照顾宠物；死亡缠绕与吸血救急，安全分流，耐打目标腐蚀、献祭，暗影箭填充。',{before:{'Drain Life':[r('Death Coil','healthBelow',30)]},replace:{Corruption:[r('Corruption','targetHealthAbove',45)],Immolate:[r('Immolate','targetHealthAbove',45)]}}),
 301:endgame(301,'毁灭：死亡缠绕和吸血救急，高血低蓝分流；小规模战斗灵魂之火起手，献祭燃烧循环，暗影灼烧斩杀，群怪火焰之雨。',{before:{'Drain Life':[r('Death Coil','healthBelow',30)],Conflagrate:[r('Soul Fire','combatTimeBelow',6,['targetHealthAbove',80],['combatEnemyCountAtMost',2],['manaAbove',60])]}}),
 283:endgame(283,'平衡：树皮术自保、激活续航，危急治疗后恢复枭兽；精灵之火与月火支援，三怪飓风，星火主攻、愤怒收尾，保留法力救急。',{before:{'Healing Touch':[r('Barkskin','healthBelow',40,['underAttack'])]},replace:{Hurricane:[aoe('Hurricane',3,60)]}}),
 281:endgame(281,'野性猫：精灵之火与扫击维持，五星长血量目标撕扯，其余五星凶猛撕咬；背后撕碎优先，爪击补位，猛虎之怒用于耐打目标。',{replace:{Rip:[r('Rip','comboAtLeast',5,['targetHealthAbove',60])],'Ferocious Bite':[r('Ferocious Bite','comboAtLeast',5)]}}),
 282:endgame(282,'恢复：树皮术自保，自然迅捷与迅捷治愈抢救，愈合、治疗之触与回春维持队伍；激活、解诅咒和祛毒支援，极高蓝才输出。',{before:{"Nature's Swiftness":[r('Barkskin','healthBelow',40,['underAttack'])]},replace:{Wrath:[r('Wrath','manaAbove',95)]}}),
 '281-bear':endgame('281-bear','野性熊：巨熊形态低吼接怪、重击打断，狂暴回复处理重伤；挫志咆哮也用于耐打单体，精灵之火削甲，双怪挥击，高怒重殴。',{replace:{'Demoralizing Roar':[r('Demoralizing Roar','targetHealthAbove',50,['manaAbove',20])],Maul:[r('Maul','manaAbove',45)]}}),
};
const profilesByLevel={20:profiles,40:profiles40,60:profiles60};
const presetLevels=[20,40,60];
// Do not alternate mutually exclusive forms, enchants, auras or fallback skills.
const replacements={'Seal of Righteousness':'Seal of Command','Lesser Heal':'Heal','Heal':'Greater Heal','Summon Imp':'Summon Voidwalker','Bear Form':'Dire Bear Form','Rockbiter Weapon':'Windfury Weapon','Retribution Aura':'Sanctity Aura','Purify':'Cleanse'};

const treeNames={41:'火焰',61:'冰霜',81:'奥术'};
const defaultTrees={1:163,2:381,3:361,4:181,5:202,7:261,8:61,9:302,11:283};
export function strategyPresets(c){
 const available=new Map(strategySpellIds(c).map(id=>[spells[id].SpellName,id]));
 const recommendedLevel=presetLevels.filter(level=>level<=c.level).at(-1)||20;
 const recommendedTree=String(dominantTalentTree(c)||defaultTrees[c.classId]);
 return classTalentTrees.filter(t=>t.classId===c.classId).flatMap(tree=>{
  const variants=[{id:String(tree.id),name:treeNames[tree.id]||tree.name}];
  if(tree.id===281)variants.push({id:'281-bear',name:'野性战斗 · 熊坦'});
  return presetLevels.flatMap(level=>variants.map(({id,name})=>{
   const {role}=profiles[id];
   const {description,rules}=profilesByLevel[level][id];
   const included=new Set(rules.filter(row=>available.has(row.name)).map(row=>row.name));
   const priority=rules.filter(row=>included.has(row.name)&&!included.has(replacements[row.name]));
   return {id:`${level}-${id}`,name:`${level}级 · ${name}`,level,role,description,
    recommended:level===recommendedLevel&&id===recommendedTree,
    rules:priority.map(({name,...conditions})=>({spell:available.get(name),...structuredClone(conditions),enabled:true})),
    policy:{role,protectCC:true,waitForTank:role!=='tank',pullDelaySeconds:3},
    autoBuffs:{enabled:true,armor:true,int:true,sta:true,targets:'party',refreshSeconds:30},
    potions:{enabled:true,health:35,mana:20,healthItem:0,manaItem:0},
   };
  }));
 });
}
