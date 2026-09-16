import {creatures,spells} from './catalog.js';
const activeRaces={'Blood Fury':2,Stoneform:3,Shadowmeld:4,'Will of the Forsaken':5,Cannibalize:5,'War Stomp':6,'Escape Artist':7,Perception:1,Berserking:8,'Find Treasure':3};
export const racialActiveNames=new Set(Object.keys(activeRaces));
export const racialPassiveNames=new Set(['Endurance','Nature Resistance','Cultivation','Regeneration','Beast Slaying','Throwing Specialization','Bow Specialization','Gun Specialization','Sword Specialization','Mace Specialization','Axe Specialization','Hardiness','Shadow Resistance','Quickness','Wisp Spirit','Expansive Mind','Arcane Resistance','Engineering Specialization','Frost Resistance','The Human Spirit','Diplomacy','Shadowmeld Passive','Command','Underwater Breathing']);
const near=(a,b,d)=>Math.hypot((a.position||0)-(b.position||0),(a.positionY||0)-(b.positionY||0))<=d;
const corpseNear=(s,c)=>(s.combat?.enemies||s.recentCorpses||[]).some(e=>e.hp<=0&&[6,7].includes(e.creatureType||creatures[e.entry]?.CreatureType)&&near(c,e,5));
export function racialModifiers(c){
 const race=c.raceId||1,result={weaponSkillBySubclass:{},resistances:{},stunResistance:0,professionSkill:{},diplomacyPct:0,stealthLevel:0,stealthDetection:0,underwaterBreathingPct:0,ghostSpeedPct:0,meleeHastePct:0,castHastePct:0};
 if(race===1){result.weaponSkillBySubclass={4:5,5:5,7:5,8:5};result.diplomacyPct=.1;}
 if(race===2){result.weaponSkillBySubclass={0:5,1:5};result.stunResistance=.25;}
 if(race===3){result.weaponSkillBySubclass={3:5};result.resistances[4]=10;}
 if(race===4){result.resistances[3]=10;result.stealthLevel=5;result.ghostSpeedPct=.5;}
 if(race===5){result.resistances[5]=10;result.underwaterBreathingPct=3;}
 if(race===6){result.resistances[3]=10;result.professionSkill[182]=15;}
 if(race===7){result.resistances[6]=10;result.professionSkill[202]=15;}
 if(race===8)result.weaponSkillBySubclass={2:5,16:5};
 if(c.racialEffects?.berserking?.until>(c.time||0))result.meleeHastePct=result.castHastePct=c.racialEffects.berserking.haste;
 if(c.racialEffects?.perception?.until>(c.time||0))result.stealthDetection+=50;
 return result;
}
export function racialAbilityBlocked(s,c,sp){const name=sp?.SpellName;if(!racialActiveNames.has(name))return undefined;if(activeRaces[name]!==c.raceId)return'种族不符合';if(name==='Cannibalize'&&!corpseNear(s,c))return'附近没有可供食尸的人型或亡灵尸体';if(name==='Shadowmeld'&&s.combat?.enemies?.some(e=>e.hp>0&&e.target===c.id))return'战斗中无法影遁';return null;}
export function activateRacial(s,c,sp,api={}){
 const name=sp?.SpellName;if(!racialActiveNames.has(name)||racialAbilityBlocked(s,c,sp))return false;const now=s.clock;c.racialEffects??={};
 if(name==='Berserking'){const fraction=c.hp/(api.stats?.(c)?.maxHp||c.maxHp||c.hp);const haste=fraction>=1?.1:fraction<=.4?.3:.1+(.3-.1)*(1-fraction)/.6;c.racialEffects.berserking={until:now+10000,haste};}
 if(name==='Perception')c.racialEffects.perception={until:now+20000};
 if(name==='Shadowmeld'){c.stealthed=true;c.shadowmeld={position:c.position||0,positionY:c.positionY||0};}
 if(name==='Cannibalize'){c.cannibalize={next:now+2000,until:now+10000,position:c.position||0,positionY:c.positionY||0,spell:sp.Id};c.nextAction=now+10000;}
 if(name==='Find Treasure'){c.tracking='treasure';c.trackingSpell=sp.Id;}
 if(name==='Blood Fury')c.racialBuff={kind:'bloodfury',until:now+15000};
 if(name==='Stoneform'){c.racialBuff={kind:'stoneform',until:now+8000};c.racialEffects.stoneform={until:now+8000};for(const key of ['auras','dots'])c[key]=(c[key]||[]).filter(a=>{const source=spells[a.spell??a.spellId];return![3,4].includes(a.dispel??source?.Dispel)&&a.mechanic!==15&&source?.Mechanic!==15;});}
 if(name==='Will of the Forsaken'){c.auras=(c.auras||[]).filter(a=>a.type!==7&&![1,5,10].includes(a.mechanic??spells[a.spell]?.Mechanic));c.racialImmuneFearUntil=now+5000;c.racialEffects.forsaken={until:now+5000};}
 if(name==='Escape Artist'){c.rootUntil=0;c.slowUntil=0;c.movementSlows=[];c.auras=(c.auras||[]).filter(a=>![26,33].includes(a.type));}
 if(name==='War Stomp')for(const target of (api.enemies||s.combat?.enemies||[]).filter(e=>e.hp>0&&near(c,e,8)).slice(0,5)){target.stunUntil=now+2000;target.cast=null;}
 return true;
}
export function tickRacialEffects(s,c,api={}){
 if(c.shadowmeld&&(!c.stealthed||c.position!==c.shadowmeld.position||(c.positionY||0)!==c.shadowmeld.positionY)){c.shadowmeld=null;c.stealthed=false;}
 const cannibal=c.cannibalize;if(cannibal){if(c.hp<=0||c.position!==cannibal.position||(c.positionY||0)!==cannibal.positionY){c.cannibalize=null;return;}while(cannibal.next<=s.clock&&cannibal.next<=cannibal.until){const amount=(api.stats?.(c)?.maxHp||c.maxHp||0)*.07;if(api.healAmount)api.healAmount(s,c,c,amount,cannibal.spell,'食尸');else c.hp=Math.min(c.maxHp||Infinity,c.hp+Math.round(amount));cannibal.next+=2000;}if(cannibal.until<=s.clock)c.cannibalize=null;}
}

