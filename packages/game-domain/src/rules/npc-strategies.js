import {spells} from './catalog.js';
import {strategySpellIds} from './combat-strategy.js';
import {npcSkillNames} from './npc-builds.js';

// Rows are in execution priority order. Gates introduce tactics at each decade;
// learned-rank resolution separately prevents unavailable spells from entering AI.
const r=(name,level=10,skill=0,condition='always',value=0,...and)=>({name,level,skill,condition,value,...(and.length?{and:and.map(([condition,value=0])=>({condition,value}))}:{})});
const heal=(name,level,value,skill=0)=>r(name,level,skill,'allyHealthBelow',value);
const burst=(name,level,skill=1)=>r(name,level,skill,'targetHealthAbove',40,['combatTimeAbove',3]);
const aoe=(name,level,skill=1,count=3)=>r(name,level,skill,'enemyCountAtLeast',count,['manaAbove',35]);
const interrupt=(name,level=10)=>r(name,level,1,'targetCasting');
const dot=(name,level=10)=>r(name,level,0,'targetHealthAbove',35);
const guard=(name,level=10)=>r(name,level,0,'healthBelow',35,['underAttack']);
const wand=r('Shoot',10,0,'manaBelow',15);
const pet=[r('Call Pet'),r('Revive Pet'),r('Mend Pet',10,0,'petHealthBelow',40,['enemyFar',15])];
const profiles={
 '1:tank':[
  r('Defensive Stance'),r('Taunt'),interrupt('Shield Bash'),guard('Last Stand',20),guard('Shield Wall',30),r('Shield Block',20,1,'underAttack'),
  r('Bloodrage',10,0,'manaBelow',30,['healthAbove',60]),r('Battle Shout'),r('Revenge'),r('Shield Slam',40),
  aoe('Demoralizing Shout',20),r('Sunder Armor'),aoe('Cleave',20,1,2),r('Heroic Strike',10,0,'manaAbove',70),
 ],
 '1:melee':[
  r('Berserker Stance',30),r('Battle Stance'),interrupt('Pummel',40),guard('Retaliation',20),
  r('Bloodrage',10,0,'manaBelow',35,['healthAbove',60]),r('Battle Shout'),burst('Death Wish',30),r('Berserker Rage',40,2,'manaBelow',50),
  r('Execute',30,0,'targetHealthBelow',20),r('Bloodthirst',40),r('Whirlwind',40,1),r('Overpower'),
  aoe('Cleave',20,1,2),r('Heroic Strike',10,0,'manaAbove',65),
 ],
 '2:tank':[
  heal('Lay on Hands',10,20),guard('Divine Protection'),r('Devotion Aura'),r('Righteous Fury',20),interrupt('Hammer of Justice'),
  r('Blessing of Sanctuary',30),r('Blessing of Might'),r('Seal of Righteousness'),r('Holy Shield',40,0,'underAttack'),
  aoe('Consecration',50,0,2),r('Judgement',10,0,'manaAbove',35),heal('Holy Light',10,30),
 ],
 '2:healer':[
  heal('Lay on Hands',10,20),r('Divine Favor',30,1,'allyHealthBelow',40),heal('Holy Light',10,45),heal('Flash of Light',20,82),
  r('Cleanse',50,1),r('Purify',10,1),guard('Divine Protection'),r('Blessing of Wisdom',20),r('Concentration Aura',30),r('Devotion Aura'),
 ],
 '2:melee':[
  heal('Lay on Hands',10,20),guard('Divine Protection'),interrupt('Hammer of Justice'),heal('Holy Light',10,25),
  r('Blessing of Might'),r('Sanctity Aura',30),r('Retribution Aura',20),r('Devotion Aura'),r('Seal of Command',20),r('Seal of Righteousness'),
  r('Hammer of Wrath',50,0,'targetHealthBelow',20),r('Judgement',10,0,'manaAbove',35),aoe('Consecration',50,2),
 ],
 '3:ranged':[
  ...pet,guard('Feign Death',30),r('Aspect of the Hawk'),r("Hunter's Mark",10,1,'targetHealthAbove',50),r('Trueshot Aura',40),
  burst('Bestial Wrath',40,0),burst('Rapid Fire',30),r('Concussive Shot',10,0,'enemyNear',15,['underAttack']),
  r('Multi-Shot',20,2,'enemyFar',8,['manaAbove',35]),r('Multi-Shot',20,1,'enemyCountAtLeast',2,['enemyFar',8],['manaAbove',35]),
  dot('Serpent Sting'),r('Aimed Shot',20,0,'enemyFar',8,['manaAbove',20]),r('Arcane Shot',10,0,'enemyFar',8,['manaAbove',25]),
  r('Auto Shot',10,0,'enemyFar',8),r('Raptor Strike',10,0,'enemyNear',5),
 ],
 '4:melee':[
  interrupt('Kick',20),guard('Evasion'),r('Riposte',20),burst('Adrenaline Rush',40),burst('Blade Flurry',30),
  r('Slice and Dice',10,0,'comboAtLeast',2,['targetHealthAbove',40]),r('Eviscerate',10,0,'comboAtLeast',4),r('Sinister Strike'),
 ],
 '5:healer':[
  r('Inner Focus',50,1,'allyHealthBelow',45),heal('Power Word: Shield',10,25),heal('Flash Heal',20,35),heal('Greater Heal',40,65),
  heal('Heal',20,65),heal('Lesser Heal',10,65),heal('Prayer of Healing',30,75,2),heal('Renew',10,80),
  r('Dispel Magic',20,1),r('Abolish Disease',40,1),r('Cure Disease',10,1),r('Inner Fire'),wand,r('Smite',10,0,'manaAbove',80),
 ],
 '5:ranged':[
  heal('Power Word: Shield',10,25),heal('Flash Heal',20,20),r('Dispel Magic',20,1),interrupt('Silence',30),
  r('Inner Fire'),r('Shadowform',40),r('Inner Focus',50,1,'manaBelow',60),r('Vampiric Embrace',30,2,'targetHealthAbove',50),
  wand,dot('Shadow Word: Pain'),r('Mind Blast',10,0,'manaAbove',20),r('Mind Flay',20,0,'manaAbove',10),r('Smite',10,0,'manaAbove',25),
 ],
 '7:healer':[
  r("Nature's Swiftness",30,1,'allyHealthBelow',30),heal('Lesser Healing Wave',20,35),heal('Healing Wave',10,65),heal('Chain Heal',40,80,1),
  r('Cure Poison',20,1),r('Cure Disease',30,1),r('Mana Tide Totem',40,1,'manaBelow',45),r('Mana Spring Totem',30,1),r('Healing Stream Totem',20),
  r('Lightning Shield',10,0,'manaAbove',60),r('Lightning Bolt',10,0,'manaAbove',80),
 ],
 '7:melee':[
  heal('Lesser Healing Wave',20,25),interrupt('Earth Shock'),r('Purge',10,2),r('Windfury Weapon',30),r('Rockbiter Weapon'),
  r('Lightning Shield'),r('Strength of Earth Totem'),r('Windfury Totem',40,1),r('Mana Spring Totem',30,1),r('Searing Totem',10,1,'manaAbove',40),
  r('Stormstrike',40),dot('Flame Shock',10),r('Earth Shock',10,0,'manaAbove',45),heal('Healing Wave',10,25),
 ],
 '7:ranged':[
  heal('Lesser Healing Wave',20,25),interrupt('Earth Shock'),r('Purge',10,2),r('Lightning Shield'),burst('Elemental Mastery',40),
  r('Mana Spring Totem',30,1),r('Searing Totem',20,2,'manaAbove',50),aoe('Chain Lightning',40),
  r('Flame Shock',10,1,'enemyNear',20,['targetHealthAbove',40]),r('Lightning Bolt',10,0,'manaAbove',10),heal('Healing Wave',10,25),
 ],
 '8:ranged':[
  r('Frost Nova',10,0,'enemyNear',8),guard('Ice Block',30),guard('Ice Barrier',40),r('Cold Snap',20,2,'healthBelow',30,['enemyNear',8]),
  interrupt('Counterspell',30),r('Remove Lesser Curse',20,1),r('Evocation',20,0,'manaBelow',20,['enemyFar',20]),
  aoe('Blizzard',20,1),r('Fire Blast',10,0,'targetHealthBelow',15),wand,r('Frostbolt'),
 ],
 '9:ranged':[
  r('Summon Imp'),r('Demon Armor',20),r('Demon Skin'),r('Drain Life',20,0,'healthBelow',45),
  r('Dark Pact',40,1,'manaBelow',35),r('Life Tap',10,0,'manaBelow',25,['healthAbove',60]),
  aoe('Rain of Fire',20),r('Amplify Curse',30,1,'targetHealthAbove',60),dot('Curse of Agony'),dot('Corruption'),r('Siphon Life',30,1,'targetHealthAbove',60),
  wand,r('Shadow Bolt'),
 ],
 '11:tank':[
  r('Dire Bear Form',40),r('Bear Form'),r('Growl'),interrupt('Bash',20),r('Frenzied Regeneration',40,0,'healthBelow',35),
  r('Enrage',20,0,'manaBelow',25,['healthAbove',70]),r('Faerie Fire (Feral)',30,1),aoe('Demoralizing Roar',10),aoe('Swipe',20,0,2),r('Maul'),r('Wrath'),
 ],
 '11:melee':[
  r('Omen of Clarity',50,2),r('Cat Form',20),r('Faerie Fire (Feral)',30,1),r('Rip',20,0,'comboAtLeast',4,['targetHealthAbove',55]),
  r('Ferocious Bite',40,0,'comboAtLeast',4),r("Tiger's Fury",30,1,'targetHealthAbove',40),r('Shred',30,1),r('Claw',20),r('Wrath'),
 ],
 '11:ranged':[
  heal('Healing Touch',10,25),r('Remove Curse',30,1),r('Abolish Poison',30,1),r('Cure Poison',20,1),
  r('Innervate',40,1,'manaBelow',25),r('Moonkin Form',40),aoe('Hurricane',40,2),dot('Moonfire'),
  r('Starfire',20,0,'targetHealthAbove',35,['manaAbove',15]),r('Wrath',10,0,'manaAbove',10),
 ],
 '11:healer':[
  r("Nature's Swiftness",30,1,'allyHealthBelow',25),heal('Swiftmend',40,40,1),heal('Regrowth',10,35),heal('Healing Touch',10,65),heal('Rejuvenation',10,80),
  r('Remove Curse',30,1),r('Abolish Poison',30,1),r('Cure Poison',20,1),r('Innervate',40,0,'manaBelow',30),
  r('Insect Swarm',20,1,'targetHealthAbove',50,['manaAbove',80]),r('Wrath',10,0,'manaAbove',85),
 ],
};
// Exclusive maintained buffs/forms must not alternate each time the AI thinks.
const alternatives=[['Berserker Stance','Battle Stance'],['Dire Bear Form','Bear Form'],['Seal of Command','Seal of Righteousness'],['Sanctity Aura','Retribution Aura','Devotion Aura'],['Concentration Aura','Devotion Aura'],['Blessing of Sanctuary','Blessing of Might'],['Windfury Weapon','Rockbiter Weapon'],['Demon Armor','Demon Skin'],['Mana Spring Totem','Healing Stream Totem'],['Greater Heal','Heal','Lesser Heal'],['Abolish Disease','Cure Disease'],['Abolish Poison','Cure Poison']];
export function npcStrategy(c,plan){
 const tier=['novice','regular','expert'].indexOf(plan.skill),available=new Map(strategySpellIds(c).map(id=>[spells[id].SpellName,id]));
 let rows=profiles[`${c.classId}:${plan.role}`].filter(row=>row.level<=plan.levelBand&&row.skill<=tier&&available.has(row.name));
 for(const names of alternatives){const chosen=names.find(name=>rows.some(row=>row.name===name));if(chosen)rows=rows.filter(row=>!names.includes(row.name)||row.name===chosen);}
 if(rows.some(row=>row.name==='Aimed Shot'))rows=rows.filter(row=>row.name!=='Arcane Shot');
 if(rows.some(row=>row.name==='Mind Flay'))rows=rows.filter(row=>row.name!=='Smite');
 if(rows.some(row=>row.name==='Cat Form'||row.name==='Bear Form'||row.name==='Dire Bear Form'))rows=rows.filter(row=>row.name!=='Wrath');
 // Expert Multi-Shot is also used on one target, so retain only its first rule.
 const used=new Set();rows=rows.filter(row=>!used.has(row.name)&&used.add(row.name));
 const rules=rows.map(({name,condition,value,and})=>{
  if(condition==='healthBelow')value=Math.min(40,value+(tier===0?5:0)+(plan.temperament==='steady'?5:0));
  if(condition==='allyHealthBelow'&&plan.temperament==='keen')value=Math.min(90,value+5);
  return {spell:available.get(name),condition,value,enabled:true,...(and?{and:structuredClone(and)}:{})};
 });
 return {
  rules,policy:{role:plan.role,protectCC:true,waitForTank:plan.role!=='tank',pullDelaySeconds:Math.min(5,(tier===0?3:tier===1?2:1)+(plan.temperament==='steady'?1:0))},
  autoBuffs:{enabled:true,armor:true,int:true,sta:true,targets:'party',refreshSeconds:plan.temperament==='keen'?45:30},
  potions:{enabled:plan.spending!=='saver',health:plan.spending==='impulsive'?45:35,mana:plan.spending==='impulsive'?35:20,healthItem:0,manaItem:0},
  name:`${plan.levelBand}级 · ${npcSkillNames[plan.skill]}`,
 };
}
