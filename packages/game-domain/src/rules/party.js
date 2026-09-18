import {items,classAbilities,classDefinitions,talents} from './catalog.js';
import {newCharacter,stats,canEquip,slotOf,makeItem,log,bagCapacity,equipmentBlockedReason} from './character.js';
import {strategyPresets} from './strategy-presets.js';
import {grantTalentRank} from './talent-acquisition.js';
import {supportedTalentNames} from './class-support.js';
import {professions} from './profession-data.js';
import {grantHunterTrainingLinks} from './pet-knowledge.js';
import {partyUnlocked,PARTY_REPLACEMENT_COST} from './party-unlock.js';

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
export function candidates(s){return roles.map(r=>({...r,role:roleNames[r.roles[0]],level:s.level,gearCap:20,canRecruit:partyUnlocked(s)&&s.growthPolicy!=='companion'&&s.location==='stormwind'&&!s.dungeon}));}
function allocateTalents(c,tree){
 const pool=Object.values(talents).filter(t=>t.classId===c.classId&&t.tree===tree&&supportedTalentNames.has(t.name)).sort((a,b)=>a.row-b.row||a.col-b.col||a.id-b.id);
 for(let used=0;used<Math.max(0,c.level-9);used++){
  const next=pool.find(t=>(c.talents[t.id]||0)<t.maxRank&&used>=t.requiredTreePoints&&(t.prerequisites||[]).every(p=>(c.talents[p.talentId]||0)>=p.requiredRank));
  if(!next)break;grantTalentRank(c,next,(c.talents[next.id]||0)+1);
 }
}
function starterGear(c,role){
 const kind=['healer','ranged'].includes(role)&&c.classId!==3?'caster':[1,2].includes(c.classId)?'tank':'melee';
 const gear=Object.fromEntries(Object.values(items).filter(i=>i.companionKit===kind).map(i=>[i.companionSlot,i.entry]));
 const pool=Object.values(items).filter(i=>!i.companionKit&&i.Quality===2&&i.ItemLevel<=25&&canEquip(c,i)&&!i.requiredhonorrank&&!i.RequiredCityRank&&!i.RequiredReputationFaction&&!i.requiredspell);
 const score=i=>i.ItemLevel+(i.armor||0)*(role==='tank'?.05:0);
 for(const slot of [16,17,18]){
  if(slot===17&&items[gear[16]]?.InventoryType===17)continue;
  const eligible=pool.filter(i=>slotOf(i)===slot&&(slot!==16||i.class===2&&(role!=='tank'||c.classId===11||i.InventoryType!==17))&&(slot!==17||role==='tank'&&i.InventoryType===14));
  eligible.sort((a,b)=>score(b)-score(a)||a.entry-b.entry);if(eligible[0])gear[slot]=eligible[0].entry;
 }
 return gear;
}
export function recruit(s,id,options={}){
 const candidate=candidates(s).find(c=>c.id===id),previous=options.replaceId?s.party.find(c=>c.id===options.replaceId):null;
 if(!candidate?.canRecruit)throw new Error('18级完成「同路人」任务后，请在暴风城旅店招募队友。');
 if(options.replaceId&&(!previous||previous.growthPolicy!=='companion'))throw new Error('请选择要更换的队友。');
 if(!previous&&s.party.length>=4)throw new Error('队伍最多五人。');
 if(previous&&s.money<PARTY_REPLACEMENT_COST)throw new Error('更换队友需要10金币。');
 const role=options.role||candidate.roles[0];if(!candidate.roles.includes(role))throw new Error('这个职业无法承担所选职责。');
 const selected=options.professions||['herbalism','alchemy'];
 if(!Array.isArray(selected)||selected.length!==2||new Set(selected).size!==2||selected.some(id=>!professions.some(p=>p.id===id)))throw new Error('请选择两个不同的生活职业。');
 const def=classDefinitions.find(d=>d.id===candidate.classId),raceId=options.raceId||def.races[0];
 if(!def.races.includes(raceId))throw new Error('这个种族与职业组合不可用。');
 const name=options.name===undefined?candidate.name:options.name;
 if(typeof name!=='string'||!name.trim()||name.length>16)throw new Error('角色名需要1—16字。');
 const c={...newCharacter(name.trim(),candidate.classId,s.level,raceId),id:previous?.id||'companion-'+id+'-'+s.itemSequence,growthPolicy:'companion',recruitmentGeneration:(previous?.recruitmentGeneration||0)+1,roleId:id,role:roleNames[role],joinedAt:s.clock,location:s.location,professions:Object.fromEntries(selected.map(id=>[id,{skill:75,cap:75}]))};
 if(c.classId===3)c.hunterPet={entry:299,name:'森林狼',level:c.level,loyalty:6,happiness:166500,learned:[2649]};
 c.learned=companionSkills(c);for(const spell of [...c.learned])grantHunterTrainingLinks(c,spell);
 const tree=candidate.trees[role];allocateTalents(c,tree);
 const preset=strategyPresets(c).find(p=>p.id===(c.classId===11&&(role==='tank'||role==='melee'&&c.level<20)?'281-bear':String(tree)));
 c.rules=structuredClone(preset.rules).filter(r=>role==='tank'||![355,6795].includes(r.spell));c.strategyPolicy={...preset.policy,role};c.autoBuffs={...preset.autoBuffs};c.potions={...preset.potions};
 const initial=starterGear(c,role),returned=[];
 if(previous){
  for(const [slot,item]of Object.entries(previous.equipment).sort((a,b)=>Number(a[0])-Number(b[0]))){
   if(equipmentBlockedReason(c,item,Number(slot),s))returned.push({...item,ownerId:s.id});else c.equipment[slot]=item;
  }
  if(s.bag.length+returned.length>bagCapacity(s))throw new Error(`背包需要${returned.length}个空位存放无法继承的装备。`);
 }
 for(const [slot,item]of Object.entries(initial))if(!c.equipment[slot]&&!(+slot===17&&items[c.equipment[16]?.id]?.InventoryType===17))c.equipment[slot]={...makeItem(s,item),issued:true,bound:true,ownerId:c.id};
 // A retained offhand cannot coexist with an issued two-handed main hand.
 if(c.equipment[17]&&items[c.equipment[16]?.id]?.InventoryType===17){returned.push({...c.equipment[17],ownerId:s.id});delete c.equipment[17];}
 if(s.bag.length+returned.length>bagCapacity(s))throw new Error('背包空间不足，无法更换队友。');
 const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;
 if(previous){s.party[s.party.indexOf(previous)]=c;s.bag.push(...returned);s.money-=PARTY_REPLACEMENT_COST;}else s.party.push(c);
 log(s,c.name+(previous?' 接替了 '+previous.name+'，花费10金币。':' 加入了小队。'),'party');
 return c;
}
