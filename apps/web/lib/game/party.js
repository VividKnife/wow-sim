import {items,spells,abilities,nodes,classAbilities} from './catalog.js';
import {newCharacter,stats,canEquip,slotOf,makeItem,log} from './character.js';

export const roles=[{id:'warrior',name:'加瑞克',classId:1,role:'坦克',weapon:25},{id:'priest',name:'艾琳',classId:5,role:'治疗',weapon:36},{id:'rogue',name:'洛恩',classId:4,role:'近战输出',weapon:2092},{id:'mage',name:'米拉',classId:8,role:'远程输出',weapon:35}];
export const classSpells={1:[78,284,285,71,355,7386,845],5:[2050,2052,2053,2054,2061,139,6074,6075,585,591,598,2006,1243,1244,17,592,600,586,9578],4:[1752,1757,1758,2098,6760,6761]};
export function companionSkills(c){return [...new Set([...(c.learned||[]),...(c.classId===8?abilities.map(a=>a.spellId):classSpells[c.classId]||[]).filter(id=>spells[id]?.SpellLevel<=c.level),...(classAbilities[c.classId]||[]).filter(a=>a.requiredLevel<=c.level&&(a.acquisition==='weapon'||['Plate Mail','Mail','Dual Wield','Parry'].includes(a.name))&&(!a.raceIds?.length||a.raceIds.includes(c.raceId||1))).map(a=>a.spellId)])];}
const itemPool=Object.values(items).filter(i=>[2,4].includes(i.class)&&i.Quality<=2&&i.ItemLevel>0&&i.ItemLevel<=25&&!i.requiredhonorrank&&!i.RequiredCityRank&&!i.RequiredReputationFaction&&!i.requiredspell);
export function gearLevel(c){const gear=Object.values(c.equipment).map(e=>items[e.id]).filter(i=>i&&![4,19].includes(i.InventoryType));return gear.length?gear.reduce((n,i)=>n+i.ItemLevel,0)/gear.length:1;}
export function candidates(s){
 const cap=Math.max(5,Math.ceil(gearLevel(s))+2);
 return roles.filter(r=>!s.party.some(c=>c.roleId===r.id)).map(r=>{
  const c=newCharacter(r.name,r.classId,s.level),equipment={};c.learned=companionSkills(c);
  // Recruitment is a 2D adaptation; all generated equipment uses source items.
  // Its budget follows the player's current gear, not the player's level alone.
  for(const slot of [3,5,6,7,8,9,10,16,17]){
   const eligible=itemPool.filter(i=>canEquip(c,i)&&i.ItemLevel<=cap&&slotOf(i)===slot&&(slot!==17||r.classId===1&&i.InventoryType===14)&&(slot!==16||i.class===2&&i.subclass===({1:7,4:15,5:4,8:10}[r.classId])));
   eligible.sort((a,b)=>b.ItemLevel-a.ItemLevel||a.entry-b.entry);if(eligible[0])equipment[slot]=eligible[0].entry;
  }
  if(!equipment[16]&&canEquip(c,items[r.weapon])&&items[r.weapon].ItemLevel<=cap)equipment[16]=r.weapon;
  return {...r,level:s.level,gearCap:cap,equipment,canRecruit:['town','city'].includes(nodes[s.location]?.kind)&&!s.dungeon};
 });
}
export function recruit(s,id){
 const candidate=candidates(s).find(c=>c.id===id);if(!candidate||!candidate.canRecruit||s.party.length>=4)throw new Error('请在城镇招募可用队友，队伍最多五人。');
 const c={...newCharacter(candidate.name,candidate.classId,candidate.level),id:'companion-'+id,roleId:id,role:candidate.role,recruitedGearCap:candidate.gearCap,joinedAt:s.clock,rage:0,energy:100,combo:0};
 // Combat ranks supplement racial and class starting proficiencies; replacing
 // the starting list made recruits unable to wield their issued equipment.
 c.learned=[...new Set([...c.learned,...companionSkills(c)])];
 for(const[slot,item]of Object.entries(candidate.equipment))c.equipment[slot]={...makeItem(s,item),issued:true,bound:true,ownerId:c.id};
 const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;s.party.push(c);log(s,c.name+' 加入了小队。','party');
}
