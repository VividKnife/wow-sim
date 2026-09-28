import {talents} from './catalog.js';
import {supportedTalentNames} from './class-support.js';
import {grantTalentRank} from './talent-acquisition.js';

export const npcLevelBands=[10,20,30,40,50,60];
export const npcSkillNames={novice:'新手',regular:'普通玩家',expert:'优秀玩家'};
export const npcBand=level=>Math.max(10,Math.min(60,Math.floor(level/10)*10));
// Authored priorities, not tree-coordinate filling. A locked priority waits for
// its actual source prerequisites; all filler is explicitly chosen for this role.
const plans={
 '1:tank':[163,'shield',`Shield Slam|Concussion Blow|Last Stand|Defiance:5|One-Handed Weapon Specialization:5|Improved Shield Block:1|Shield Specialization:5|Improved Bloodrage:2|Toughness:5|Improved Sunder Armor:3|Improved Revenge:3|Anticipation:5|Cruelty:5|Deflection:5|Improved Heroic Strike:3|Improved Taunt:2`],
 '1:melee':[164,'dual',`Bloodthirst|Death Wish|Flurry:5|Cruelty:5|Unbridled Wrath:5|Improved Battle Shout:5|Enrage:5|Dual Wield Specialization:5|Improved Execute:2|Improved Heroic Strike:3|Deflection:2|Tactical Mastery:5|Improved Overpower:2|Anger Management|Improved Rend:3|Deep Wounds:3|Impale:2|Booming Voice:5`],
 '2:tank':[383,'shield',`Holy Shield|Blessing of Sanctuary|Improved Righteous Fury:3|Shield Specialization:3|Redoubt:5|Precision:3|Toughness:5|Blessing of Kings|One-Handed Weapon Specialization:5|Anticipation:5|Improved Hammer of Justice:2|Divine Intellect:5|Spiritual Focus:5|Consecration|Improved Devotion Aura:5|Improved Seal of Righteousness:5`],
 '2:healer':[382,'caster',`Divine Favor|Holy Power:5|Holy Shock|Divine Intellect:5|Spiritual Focus:5|Healing Light:3|Illumination:5|Improved Blessing of Wisdom:2|Improved Lay on Hands:2|Unyielding Faith:2|Consecration|Lasting Judgement:3|Blessing of Kings|Redoubt:5|Precision:3|Guardian's Favor:2|Improved Blessing of Might:5|Benediction:5`],
 '2:melee':[381,'twoHand',`Seal of Command|Sanctity Aura|Vengeance:5|Conviction:5|Benediction:5|Improved Judgement:2|Improved Blessing of Might:5|Pursuit of Justice:2|Two-Handed Weapon Specialization:3|Improved Retribution Aura:2|Deflection:5|Divine Strength:5|Divine Intellect:5|Improved Seal of Righteousness:5|Consecration|Precision:3|Redoubt:5`],
 '3:ranged':[361,'ranged',`Bestial Wrath|Intimidation|Frenzy:5|Ferocity:5|Unleashed Fury:5|Improved Aspect of the Hawk:5|Endurance Training:5|Bestial Discipline:2|Improved Mend Pet:2|Bestial Swiftness|Spirit Bond:2|Aimed Shot|Mortal Shots:5|Lethal Shots:5|Efficiency:5|Hawk Eye:3|Improved Hunter's Mark:5`],
 '3:marksman':[363,'ranged',`Trueshot Aura|Aimed Shot|Barrage:3|Mortal Shots:5|Ranged Weapon Specialization:5|Efficiency:5|Lethal Shots:5|Hawk Eye:3|Improved Hunter's Mark:4|Improved Aspect of the Hawk:5|Endurance Training:5|Unleashed Fury:5|Ferocity:5`],
 '4:melee':[181,'dual',`Adrenaline Rush|Blade Flurry|Weapon Expertise:2|Aggression:3|Precision:5|Dual Wield Specialization:5|Improved Sinister Strike:2|Improved Gouge:3|Deflection:5|Riposte|Endurance:2|Improved Sprint:2|Malice:5|Improved Slice and Dice:3|Ruthlessness:3|Relentless Strikes|Lethality:5|Improved Eviscerate:3|Murder:2`],
 '5:healer':[202,'caster',`Spiritual Healing:5|Spiritual Guidance:5|Inspiration:3|Improved Healing:3|Holy Specialization:5|Divine Fury:5|Healing Focus:2|Improved Renew:3|Improved Prayer of Healing:2|Meditation:3|Inner Focus|Wand Specialization:5|Improved Power Word: Fortitude:2|Improved Power Word: Shield:3|Mental Agility:5|Silent Resolve:5`],
 '5:ranged':[203,'caster',`Shadowform|Mind Flay|Vampiric Embrace|Darkness:5|Shadow Weaving:5|Spirit Tap:5|Improved Shadow Word: Pain:2|Shadow Focus:5|Improved Mind Blast:5|Shadow Reach:3|Shadow Affinity:3|Meditation:3|Inner Focus|Wand Specialization:5|Improved Power Word: Fortitude:2|Improved Power Word: Shield:3|Mental Agility:5|Silent Resolve:5`],
 '7:healer':[262,'caster',`Mana Tide Totem|Nature's Swiftness|Purification:5|Healing Way:3|Improved Healing Wave:5|Tidal Focus:5|Ancestral Healing:3|Totemic Focus:2|Restorative Totems:5|Tidal Mastery:5|Totemic Mastery|Healing Focus:5|Healing Grace:3|Ancestral Knowledge:5|Shield Specialization:5|Nature's Guidance:3`],
 '7:melee':[263,'twoHand',`Stormstrike|Flurry:5|Elemental Weapons:3|Weapon Mastery:5|Ancestral Knowledge:5|Thundering Strikes:5|Two-Handed Axes and Maces|Enhancing Totems:2|Improved Lightning Shield:3|Improved Weapon Totems:2|Parry|Nature's Guidance:3|Improved Healing Wave:5|Tidal Focus:5|Totemic Focus:5|Concussion:5|Convection:5`],
 '7:ranged':[261,'caster',`Elemental Mastery|Elemental Fury|Lightning Mastery:5|Call of Thunder:5|Elemental Focus|Convection:5|Concussion:5|Reverberation:5|Storm Reach:2|Elemental Warding:3|Eye of the Storm:3|Nature's Guidance:3|Tidal Focus:5|Improved Healing Wave:5|Totemic Focus:5|Tidal Mastery:5`],
 '8:ranged':[61,'caster',`Ice Barrier|Ice Block|Winter's Chill:5|Piercing Ice:3|Frost Channeling:3|Improved Frostbolt:5|Elemental Precision:3|Ice Shards:5|Cold Snap|Arctic Reach:2|Improved Blizzard:3|Improved Frost Nova:2|Arcane Concentration:5|Arcane Subtlety:2|Arcane Focus:3|Arcane Meditation:3|Magic Absorption:5|Improved Arcane Explosion:3`],
 '9:ranged':[302,'caster',`Shadow Mastery:5|Siphon Life|Nightfall:2|Improved Corruption:5|Improved Life Tap:2|Suppression:3|Improved Curse of Agony:3|Fel Concentration:5|Grim Reach:2|Amplify Curse|Improved Drain Soul:1|Dark Pact|Bane:5|Improved Shadow Bolt:5|Devastation:5|Destructive Reach:2|Shadowburn|Cataclysm:5`],
 '11:tank':[281,'feral',`Leader of the Pack|Heart of the Wild:5|Faerie Fire (Feral)|Primal Fury:2|Sharpened Claws:3|Ferocity:5|Feral Instinct:5|Thick Hide:5|Predatory Strikes:3|Savage Fury:2|Feral Charge|Brutal Impact:2|Furor:5|Improved Enrage:2|Improved Mark of the Wild:5|Natural Weapons:5|Improved Wrath:5`],
 '11:melee':[281,'feral',`Leader of the Pack|Heart of the Wild:5|Faerie Fire (Feral)|Improved Shred:2|Blood Frenzy:2|Sharpened Claws:3|Ferocity:5|Feral Aggression:5|Predatory Strikes:3|Savage Fury:2|Feline Swiftness:2|Feral Charge|Brutal Impact:2|Furor:5|Natural Weapons:5|Omen of Clarity|Improved Wrath:5|Natural Shapeshifter:3|Improved Mark of the Wild:5`],
 '11:ranged':[283,'caster',`Moonkin Form|Moonfury:5|Nature's Grace|Vengeance:5|Improved Starfire:5|Improved Wrath:5|Improved Moonfire:5|Nature's Reach:2|Moonglow:3|Natural Shapeshifter:3|Reflection:3|Improved Mark of the Wild:5|Improved Healing Touch:5|Subtlety:5|Nature's Focus:5`],
 '11:healer':[282,'caster',`Swiftmend|Nature's Swiftness|Gift of Nature:5|Improved Mark of the Wild:5|Improved Healing Touch:5|Reflection:3|Insect Swarm|Subtlety:3|Tranquil Spirit:5|Improved Rejuvenation:3|Improved Regrowth:5|Nature's Focus:5|Moonglow:3|Improved Wrath:5|Improved Moonfire:5|Natural Shapeshifter:3|Nature's Reach:2|Improved Tranquility:2`],
};
export const npcRoles=Object.keys(plans).filter(key=>!key.endsWith('marksman'));
const byClass=new Map();
function choices(classId){
 if(!byClass.has(classId))byClass.set(classId,new Map(Object.values(talents).filter(t=>t.classId===classId).map(t=>[t.name,t])));
 return byClass.get(classId);
}
export function npcBuildPlan(c,role,behavior={}){
 const skill=behavior.skill||'regular',temperament=behavior.temperament||'steady',spending=behavior.spending||'value';
 if(!npcSkillNames[skill]||!['steady','keen','collector'].includes(temperament)||!['saver','value','collector','whale','impulsive'].includes(spending))throw new Error('无效的 NPC 行为档案');
 const key=c.classId===3&&skill==='expert'?'3:marksman':`${c.classId}:${role}`;
 const plan=plans[key];if(!plan)throw new Error('缺少 NPC 职业职责方案');
 let priorities=plan[2].split('|');
 // Beginners favor a little survivability without losing their core rotation.
 if(skill==='novice'){
  const first={1:role==='tank'?'Anticipation:5':'Booming Voice:5',2:role==='healer'?'Spiritual Focus:5':null,3:'Endurance Training:5',4:'Deflection:5',5:role==='healer'?'Healing Focus:2':'Spirit Tap:5',7:null,8:'Improved Frostbolt:5',9:'Fel Concentration:5',11:role==='tank'?'Thick Hide:5':null}[c.classId];
  if(first)priorities=[first,...priorities.filter(p=>p!==first)];
 }
 if(c.classId===9&&skill==='expert')priorities=['Ruin',...priorities.filter(p=>p!=='Dark Pact').map(p=>p==='Cataclysm:5'?'Cataclysm:3':p)];
 return {id:`npc-${c.classId}-${role}-${npcBand(c.level)}-${skill}-${temperament}`,levelBand:npcBand(c.level),skill,temperament,spending,role,tree:plan[0],weaponStyle:c.classId===1&&role==='melee'&&c.level<20?'twoHand':plan[1],priorities};
}
export function allocateNpcTalents(c,plan){
 const catalogue=choices(c.classId),pool=plan.priorities.map(entry=>{
  const match=entry.match(/^(.*):(\d+)$/),name=match?match[1]:entry,talent=catalogue.get(name),rank=match?Number(match[2]):1;
  if(!talent||!supportedTalentNames.has(name)||rank<1||rank>talent.maxRank)throw new Error(`无效 NPC 天赋优先项：${c.classId} ${entry}`);
  return {talent,rank};
 });
 for(let used=0;used<Math.max(0,Math.min(60,c.level)-9);used++){
  const next=pool.find(({talent:t,rank})=>(c.talents[t.id]||0)<rank&&Object.entries(c.talents).filter(([id])=>talents[id].tree===t.tree).reduce((n,[,r])=>n+r,0)>=t.requiredTreePoints&&(t.prerequisites||[]).every(p=>(c.talents[p.talentId]||0)>=p.requiredRank));
  if(!next)throw new Error(`NPC 天赋方案无法分配第 ${used+1} 点：${plan.id}`);
  grantTalentRank(c,next.talent,(c.talents[next.talent.id]||0)+1);
 }
}
