import {extendedSpellNames} from './class-spell-registry.js';
import {utilitySpellNames,passiveSpellNames} from './class-utility-data.js';
import {talentActiveNames} from './talent-runtime.js';
import {talents,spells} from './catalog.js';
import {racialActiveNames,racialPassiveNames} from './racial-effects.js';
// Explicit executable mechanics allowlist. Reference-only entries remain visible
// but cannot take a player's money or talent points.
export const supportedSpellNames=new Set([
 ...extendedSpellNames,...utilitySpellNames,...passiveSpellNames,...talentActiveNames,...racialActiveNames,...racialPassiveNames,
 'Teleport: Stormwind','Teleport: Ironforge','Fireball','Frostbolt','Fire Blast','Frost Armor','Arcane Intellect','Conjure Food','Conjure Water','Frost Nova','Arcane Explosion','Flamestrike','Blizzard','Arcane Missiles','Polymorph','Pyroblast','Cold Snap',
 'Heroic Strike','Cleave','Sunder Armor','Taunt','Battle Stance','Defensive Stance','Rend','Battle Shout','Thunder Clap','Bloodrage',
 'Sinister Strike','Eviscerate','Gouge','Kick','Evasion','Sprint','Stealth','Backstab','Ambush',
 'Smite','Lesser Heal','Heal','Flash Heal','Renew','Power Word: Shield','Power Word: Fortitude','Shadow Word: Pain','Mind Blast','Resurrection',
 'Holy Light','Flash of Light','Seal of Righteousness','Judgement','Blessing of Might','Devotion Aura','Hammer of Justice','Redemption',
 'Arcane Shot','Serpent Sting','Raptor Strike','Auto Shot','Concussive Shot','Aspect of the Hawk','Call Pet','Revive Pet','Tame Beast',
 'Lightning Bolt','Earth Shock','Flame Shock','Frost Shock','Healing Wave','Lesser Healing Wave','Searing Totem','Strength of Earth Totem','Stoneskin Totem','Healing Stream Totem','Rockbiter Weapon','Ancestral Spirit',
 'Shadow Bolt','Immolate','Corruption','Curse of Agony','Life Tap','Summon Imp','Summon Voidwalker','Demon Skin','Fear',
 'Wrath','Moonfire','Healing Touch','Regrowth','Rejuvenation','Bear Form','Cat Form','Maul','Claw','Rip','Growl','Entangling Roots','Thorns','Mark of the Wild',
]);

export const supportedTalentNames=new Set([
 'Arcane Subtlety','Arcane Focus','Arcane Concentration','Arcane Mind','Improved Fireball','Impact','Ignite','Improved Fire Blast','Burning Soul','Pyroblast','Improved Frostbolt','Elemental Precision','Ice Shards','Frostbite','Permafrost','Improved Frost Nova','Piercing Ice','Frost Channeling','Cold Snap',
 'Improved Heroic Strike','Improved Rend','Deflection','Cruelty','Toughness','Anticipation','Defiance','Booming Voice','Improved Battle Shout','Unbridled Wrath','Improved Cleave',
 'Improved Eviscerate','Malice','Ruthlessness','Improved Sinister Strike','Lightning Reflexes','Precision','Improved Gouge','Opportunity','Camouflage','Initiative',
 'Unbreakable Will','Improved Power Word: Fortitude','Improved Power Word: Shield','Meditation','Improved Renew','Holy Specialization','Divine Fury','Spell Warding','Spirit Tap','Shadow Affinity','Improved Shadow Word: Pain','Shadow Focus','Improved Mind Blast',
 'Divine Strength','Divine Intellect','Spiritual Focus','Improved Seal of Righteousness','Healing Light','Improved Devotion Aura','Precision','Improved Blessing of Might','Benediction','Improved Judgement',
 'Improved Aspect of the Hawk','Endurance Training','Thick Hide','Unleashed Fury','Lethal Shots','Efficiency','Improved Arcane Shot','Hawk Eye','Monster Slaying','Humanoid Slaying','Savage Strikes','Survivalist',
 'Convection','Concussion','Call of Flame','Reverberation','Ancestral Knowledge','Shield Specialization','Thundering Strikes','Improved Healing Wave','Tidal Focus','Healing Focus','Totemic Focus',
 'Suppression','Improved Corruption','Improved Life Tap','Improved Curse of Agony','Demonic Embrace','Improved Imp','Fel Stamina','Improved Voidwalker','Cataclysm','Bane','Devastation',
 'Improved Wrath','Improved Moonfire','Natural Weapons','Natural Shapeshifter','Ferocity','Feral Instinct','Thick Hide','Improved Mark of the Wild','Furor','Improved Healing Touch','Nature\'s Focus','Improved Rejuvenation',
]);

const rule=(spell,condition='always',value=0)=>({spell,condition,value,enabled:true});
export function defaultClassRules(classId){
 const rules={
  1:[rule(6673),rule(772),rule(7386),rule(845,'enemyCountAtLeast',3),rule(78)],
  2:[rule(635,'healthBelow',55),rule(465),rule(19740),rule(21084),rule(20271)],
  3:[rule(883),rule(982),rule(13165),rule(1978),rule(3044),rule(2973,'enemyNear',5)],
  4:[rule(2098),rule(1752)],
  5:[rule(17,'healthBelow',55),rule(139,'healthBelow',75),rule(2050,'healthBelow',55),rule(589),rule(8092),rule(585)],
  7:[rule(331,'healthBelow',55),rule(8017),rule(3599),rule(8050),rule(8042,'enemyNear',20),rule(403)],
  8:[rule(122,'enemyNear',8),rule(2136,'targetHealthBelow',25),rule(116),rule(133)],
  9:[rule(688),rule(687),rule(1454,'manaBelow',25),rule(172),rule(980),rule(348),rule(686)],
  11:[rule(5185,'healthBelow',50),rule(774,'healthBelow',75),rule(1126),rule(8921),rule(5176)],
 };
 return rules[classId]||[];
}

export {racialTraits} from '../../../game-data/racial-traits.js';

// Coverage is reconciled against executable aura operations, not a blanket list of
// all data nodes. Script-only effects require a named event handler below.
const talentAuraExecutors=new Set([10,30,31,35,117,122,123,47,49,51,52,54,55,71,79,87,98,132,133,134,137,138,142,150,166,167,168,169,174,175,182]);
const talentSpellOperations=new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,18,19,22,23,24,27,28]);
const talentEventExecutors=new Set(['Deep Wounds','Sword Specialization','Mace Specialization','Improved Hamstring','Improved Revenge','Improved Shield Bash','Enrage','Flurry','Anger Management','Blood Craze','Improved Berserker Rage','Tactical Mastery','Shield Specialization','Improved Kick','Improved Sprint','Setup','Remorseless Attacks','Relentless Strikes','Seal Fate','Martyrdom','Inspiration','Shadow Weaving','Blackout','Ancestral Healing','Elemental Focus','Improved Starfire',"Nature's Grace",'Blood Frenzy','Primal Fury','Predatory Strikes','Leader of the Pack','Improved Enrage','Improved Shadow Bolt','Aftermath','Nightfall','Improved Drain Mana','Entrapment','Improved Wing Clip','Improved Concussive Shot','Spirit Bond','Vengeance','Redoubt','Reckoning','Illumination','Eye for an Eye','Vindication','Blessed Recovery','Master of Elements','Eye of the Storm','Elemental Devastation','Healing Way','Improved Scorch',"Winter's Chill",'Improved Counterspell','Improved Fire Ward','Improved Blizzard','Shatter','Frost Warding','Improved Sap','Improved Nature\'s Grasp','Pyroclasm','Improved Drain Soul','Improved Mend Pet','Improved Scorpid Sting','Improved Lay on Hands','Spirit of Redemption','Frenzy','Improved Healthstone','Pursuit of Justice','Master of Deception','Master Demonologist','Magic Absorption','Sleight of Hand','Heightened Senses']);
export function talentExecutionCoverage(t){
 const source=spells[t.ranks?.[0]];if(!source)return{supported:false,path:'missing-source'};
 if(!(source.Attributes&64))return{supported:supportedSpellNames.has(source.SpellName)||[1,2,3].some(i=>source['Effect'+i]===36),path:'active-spell'};
 if(talentEventExecutors.has(t.name))return{supported:true,path:'talent-event'};
 const effects=[1,2,3].filter(i=>source['Effect'+i]);
 const generic=effects.every(i=>talentAuraExecutors.has(source['EffectApplyAuraName'+i])||[107,108].includes(source['EffectApplyAuraName'+i])&&talentSpellOperations.has(source['EffectMiscValue'+i]));
 if(generic)return{supported:true,path:'source-aura'};
 if(supportedTalentNames.has(t.name))return{supported:true,path:'legacy-class-handler'};
 return{supported:false,path:'unimplemented-special',effects:effects.map(i=>({effect:source['Effect'+i],aura:source['EffectApplyAuraName'+i],operation:source['EffectMiscValue'+i]}))};
}
for(const t of Object.values(talents))if(talentExecutionCoverage(t).supported)supportedTalentNames.add(t.name);





