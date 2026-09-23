import source from '../../../game-data/data/molten-core-loot.json' with {type:'json'};
import {items,creatures,creatureLoot,referenceLoot} from './catalog.js';
import {canEquip,rng} from './character.js';
import {meetsCondition,needsQuestItem} from './quests.js';
import {moltenCoreRoute,moltenCoreTrash} from './molten-core-content.js';

const tables=Object.fromEntries(Object.entries(source.tables).filter(([key])=>key.endsWith('_loot_template')).map(([key,rows])=>[key,Object.groupBy(rows,r=>r.entry)]));
const references=tables.reference_loot_template;
function possible(rows,group=0){return [...new Set((rows||[]).filter(r=>!group||r.groupid===group).flatMap(r=>r.mincountOrRef<0?possible(references[-r.mincountOrRef],r.groupid):[r.item]))];}
export const raidLoot=Object.fromEntries(Object.entries(source.bossSources).map(([id,s])=>[id,possible(tables[s.table][s.entry])]));
function worldPossible(rows,group=0,depth=0){return depth>16?[]:[...new Set((rows||[]).filter(r=>(!group||r.groupid===group)&&r.mincountOrRef>-60000).flatMap(r=>r.mincountOrRef<0?worldPossible(referenceLoot[-r.mincountOrRef],r.groupid,depth+1):[r.item]))];}
// References 34002/34003 are world-wide blue/green dragon loot, not signature boss loot.
raidLoot.onyxia=worldPossible((creatureLoot[creatures[10184]?.LootId]||[]).filter(r=>![-34002,-34003].includes(r.mincountOrRef)));

// In this pinned SQL schema a reference groupid selects a group INSIDE the
// referenced template. References sharing group 1 are independent rolls.
export function rollClassicLoot(rows,references,random,eligible=()=>true,group=0,depth=0){
 if(depth>16)throw new Error('循环掉落引用');
 const result=[],groups=new Map();
 const award=row=>{
  if(row.mincountOrRef<0){for(let n=0;n<row.maxcount;n++)result.push(...rollClassicLoot(references[-row.mincountOrRef]||[],references,random,eligible,row.groupid,depth+1));}
  else result.push({itemId:row.item,count:row.mincountOrRef+Math.floor(random()*(row.maxcount-row.mincountOrRef+1)),quest:row.ChanceOrQuestChance<0});
 };
 for(const row of rows||[]){
  if(group&&(row.mincountOrRef<0||row.groupid!==group)||!eligible(row))continue;
  if(row.mincountOrRef<0||!row.groupid){if(random()*100<Math.abs(row.ChanceOrQuestChance))award(row);}
  else{if(!groups.has(row.groupid))groups.set(row.groupid,[]);groups.get(row.groupid).push(row);}
 }
 for(const rows of groups.values()){
  let chance=random()*100,selected;
  for(const row of rows.filter(r=>r.ChanceOrQuestChance!==0)){chance-=Math.abs(row.ChanceOrQuestChance);if(chance<0){selected=row;break;}}
  const equal=rows.filter(r=>r.ChanceOrQuestChance===0);
  if(!selected&&equal.length)selected=equal[Math.floor(random()*equal.length)];
  if(selected)award(selected);
 }
 return result;
}
export function rollRaidLoot(s,encounterId){
 if(encounterId==='onyxia'||encounterId==='onyxia-warders')return (encounterId==='onyxia'?[10184]:[12129,12129]).flatMap(entry=>rollClassicLoot(creatureLoot[creatures[entry]?.LootId],referenceLoot,()=>rng(s),row=>(!row.condition_id||[3,4].includes(row.condition_id)||meetsCondition(s,row.condition_id))&&(row.ChanceOrQuestChance>=0||needsQuestItem(s,row.item))));
 const boss=source.bossSources[encounterId],node=moltenCoreRoute.find(n=>n.id===encounterId);
 const roots=boss?[boss]:(node?.types||[]).map(type=>({table:'creature_loot_template',entry:source.creatureLootIds[moltenCoreTrash[type].entry]}));
 const eligible=row=>{
  // Both factions raid together here, so paladin AND shaman loot is available.
  if(row.condition_id&&![3,4].includes(row.condition_id)&&!meetsCondition(s,row.condition_id))return false;
  return row.ChanceOrQuestChance>=0||needsQuestItem(s,row.item);
 };
 return roots.flatMap(root=>rollClassicLoot(tables[root.table][root.entry],references,()=>rng(s),eligible));
}
export function canReceiveRaidLoot(c,item){
 if(!item)return false;
 if(item.InventoryType)return canEquip(c,item);
 return (!item.AllowableClass||item.AllowableClass===-1||!!(item.AllowableClass&(1<<(c.classId-1))))&&c.level>=item.RequiredLevel;
}
export const raidItemIsEquipment=id=>!!items[id]?.InventoryType&&[2,4].includes(items[id].class);
