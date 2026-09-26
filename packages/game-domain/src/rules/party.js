import {items,classAbilities,classDefinitions,talents} from './catalog.js';
import {newCharacter,stats,canEquip,slotOf,makeItem} from './character.js';
import {strategyPresets} from './strategy-presets.js';
import {grantTalentRank} from './talent-acquisition.js';
import {supportedTalentNames} from './class-support.js';
import {grantHunterTrainingLinks} from './pet-knowledge.js';

export const roles=[
 {id:'warrior',name:'加瑞克',classId:1,roles:['tank','melee'],trees:{tank:163,melee:161}},
 {id:'paladin',name:'罗兰',classId:2,roles:['tank','healer','melee'],trees:{tank:383,healer:382,melee:381}},
 {id:'hunter',name:'艾拉',classId:3,roles:['ranged'],trees:{ranged:361}},
 {id:'rogue',name:'洛恩',classId:4,roles:['melee'],trees:{melee:181}},
 {id:'priest',name:'艾琳',classId:5,roles:['healer','ranged'],trees:{healer:202,ranged:203}},
 {id:'shaman',name:'纳鲁',classId:7,roles:['healer','melee','ranged'],trees:{healer:262,melee:263,ranged:261}},
 {id:'mage',name:'米拉',classId:8,roles:['ranged'],trees:{ranged:61}},
 {id:'warlock',name:'塞拉',classId:9,roles:['ranged'],trees:{ranged:302}},
 {id:'druid',name:'伊森',classId:11,roles:['tank','healer','ranged','melee'],trees:{tank:281,healer:282,ranged:283,melee:281}},
];
export const roleNames={tank:'坦克',healer:'治疗',melee:'近战输出',ranged:'远程输出'};
export function companionSkills(c){return [...new Set([...(c.learned||[]),...(classAbilities[c.classId]||[]).filter(a=>a.requiredLevel<=c.level&&!['talent','petTrainer'].includes(a.acquisition)&&(!(a.raceIds||a.startingRaces)?.length||(a.raceIds||a.startingRaces).includes(c.raceId||1))&&(!a.requiredTalentSpellId||c.learned?.includes(a.requiredTalentSpellId))).map(a=>a.spellId)])];}
function allocateTalents(c,tree){
 const pool=Object.values(talents).filter(t=>t.classId===c.classId&&supportedTalentNames.has(t.name)).sort((a,b)=>Number(b.tree===tree)-Number(a.tree===tree)||a.row-b.row||a.col-b.col||a.id-b.id);
 for(let used=0;used<Math.max(0,c.level-9);used++){
  const next=pool.find(t=>(c.talents[t.id]||0)<t.maxRank&&Object.entries(c.talents).filter(([id])=>talents[id].tree===t.tree).reduce((n,[,rank])=>n+rank,0)>=t.requiredTreePoints&&(t.prerequisites||[]).every(p=>(c.talents[p.talentId]||0)>=p.requiredRank));
  if(!next)break;grantTalentRank(c,next,(c.talents[next.id]||0)+1);
 }
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
 if(c.classId===3)c.hunterPet={entry:299,name:'森林狼',level:c.level,loyalty:6,happiness:166500,learned:[2649]};
 c.learned=companionSkills(c);for(const spell of [...c.learned])grantHunterTrainingLinks(c,spell);
 const tree=candidate.trees[role];allocateTalents(c,tree);
 const preset=strategyPresets(c).find(p=>p.id===(c.classId===11&&(role==='tank'||role==='melee'&&c.level<20)?'281-bear':String(tree)));
 c.rules=structuredClone(preset.rules).filter(r=>role==='tank'||![355,6795].includes(r.spell));c.strategyPolicy={...preset.policy,role};c.autoBuffs={...preset.autoBuffs};c.potions={...preset.potions};
 for(const [slot,item]of Object.entries(starterGear(c,role)))c.equipment[slot]={...makeItem(s,item),issued:true,bound:true,ownerId:c.id};
 const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;
 s.party.push(c);return c;
}
