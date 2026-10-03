import {items,classAbilities,classDefinitions} from './catalog.js';
import {setCombatStrategy} from './strategy-revision.js';
import {newCharacter,stats,canEquip,slotOf,makeItem} from './character.js';
import {npcBuildPlan,allocateNpcTalents} from './npc-builds.js';
import {npcStrategy} from './npc-strategies.js';
import {grantHunterTrainingLinks} from './pet-knowledge.js';

export const roles=[
 {id:'warrior',name:'加瑞克',classId:1,roles:['tank','melee']},
 {id:'paladin',name:'罗兰',classId:2,roles:['tank','healer','melee']},
 {id:'hunter',name:'艾拉',classId:3,roles:['ranged']},
 {id:'rogue',name:'洛恩',classId:4,roles:['melee']},
 {id:'priest',name:'艾琳',classId:5,roles:['healer','ranged']},
 {id:'shaman',name:'纳鲁',classId:7,roles:['healer','melee','ranged']},
 {id:'mage',name:'米拉',classId:8,roles:['ranged']},
 {id:'warlock',name:'塞拉',classId:9,roles:['ranged']},
 {id:'druid',name:'伊森',classId:11,roles:['tank','healer','ranged','melee']},
];
export const roleNames={tank:'坦克',healer:'治疗',melee:'近战输出',ranged:'远程输出'};
export function companionSkills(c){
 const learned=new Set(c.learned||[]),available=(classAbilities[c.classId]||[]).filter(a=>a.requiredLevel<=c.level&&!['talent','petTrainer'].includes(a.acquisition)&&(!(a.raceIds||a.startingRaces)?.length||(a.raceIds||a.startingRaces).includes(c.raceId||1)));
 // Trainer ranks must not bypass a missing talent root through previousSpellId.
 let changed=true;
 while(changed){changed=false;for(const a of available)if(!learned.has(a.spellId)&&(!a.previousSpellId||learned.has(a.previousSpellId))&&(!a.requiredTalentSpellId||learned.has(a.requiredTalentSpellId))){learned.add(a.spellId);changed=true;}}
 return [...learned];
}
function starterGear(c,role){
 const kind=['healer','ranged'].includes(role)&&c.classId!==3?'caster':[1,2].includes(c.classId)?'tank':'melee';
 const gear=Object.fromEntries(Object.values(items).filter(i=>i.companionKit===kind&&canEquip(c,i)).map(i=>[i.companionSlot,i.entry]));
 const pool=Object.values(items).filter(i=>!i.companionKit&&i.Quality===2&&i.ItemLevel<=25&&canEquip(c,i)&&!i.requiredhonorrank&&!i.RequiredCityRank&&!i.RequiredReputationFaction&&!i.requiredspell);
 const score=i=>i.ItemLevel+(i.armor||0)*(role==='tank'?.05:0);
 for(const slot of [1,3,5,6,7,8,9,10,15,16,17,18]){
  if(slot<16&&gear[slot])continue;
  if(slot===17&&items[gear[16]]?.InventoryType===17)continue;
  const eligible=pool.filter(i=>slotOf(i)===slot&&(slot!==16||i.class===2&&(role!=='tank'||c.classId===11||i.InventoryType!==17))&&(slot!==17||role==='tank'&&i.InventoryType===14));
  eligible.sort((a,b)=>score(b)-score(a)||a.entry-b.entry);if(eligible[0])gear[slot]=eligible[0].entry;
 }
 return gear;
}
// Internal character factory used by persistent residents and combat fixtures.
export function createNpcMember(s,id,options={}){
 const candidate=roles.find(c=>c.id===id);
 if(!candidate)throw new Error('未知 NPC 职业。');
 const role=options.role||candidate.roles[0];if(!candidate.roles.includes(role))throw new Error('这个职业无法承担所选职责。');
 const def=classDefinitions.find(d=>d.id===candidate.classId),raceId=options.raceId||def.races[0];
 if(!def.races.includes(raceId))throw new Error('这个种族与职业组合不可用。');
 const name=options.name??candidate.name;
 const c={...newCharacter(name,candidate.classId,s.level,raceId),id:'npc-template-'+id+'-'+s.itemSequence,growthPolicy:'npcPlayer',roleId:id,role:roleNames[role],location:s.location,professions:{}};
 if(c.classId===3)delete c.ammoPolicy;
 if(c.classId===3)c.hunterPet={entry:299,name:'森林狼',level:c.level,loyalty:6,happiness:1000000,learned:[2649]};
 c.learned=companionSkills(c);for(const spell of [...c.learned])grantHunterTrainingLinks(c,spell);
 const plan=npcBuildPlan(c,role,options.behavior);allocateNpcTalents(c,plan);
 // Talent grants unlock trainable higher ranks (e.g. Aimed Shot and Mind Flay).
 c.learned=companionSkills(c);
 const preset=npcStrategy(c,plan),{priorities,...build}=plan;c.npcBuild={...build,name:preset.name};
 setCombatStrategy(c,{rules:preset.rules,strategyPolicy:preset.policy});c.autoBuffs=preset.autoBuffs;setCombatStrategy(c,{potions:preset.potions});
 for(const [slot,item]of Object.entries(starterGear(c,role)))c.equipment[slot]={...makeItem(s,item),issued:true,bound:true,ownerId:c.id};
 const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;
 s.party.push(c);return c;
}
