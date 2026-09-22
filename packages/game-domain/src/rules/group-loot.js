import {items,nameOf} from './catalog.js';
import {makeItem,rng,log} from './character.js';
import {equipmentUpgrade,equipNpcItem,canReceiveEquipment} from './npc-equipment.js';
import {npcAward} from './npc-world.js';

export function queueGroupLoot(s,id,count){
 const data=items[id];
 if(!s.dungeon||!s.party.some(c=>c.npcPlayer)||data.Quality<2||![2,4].includes(data.class)||!data.InventoryType||data.startquest||data.bonding===4)return false;
 s.groupLoot??={pending:[],history:[]};
 for(let n=0;n<count;n++){
  const item=makeItem(s,id),members=[s,...s.party].map(c=>{
   const plan=equipmentUpgrade(c,data);
   const eligible=canReceiveEquipment(c,data);
   return {id:c.id,name:c.name,npc:!!c.npcPlayer,eligible,need:eligible&&plan.need,reason:eligible?plan.reason:'已达到唯一物品上限',replaces:plan.replaces,roll:1+Math.floor(rng(s)*100),tie:rng(s)};
  });
  s.groupLoot.pending.push({id:item.uid,item,members,deadline:null});
 }
 return true;
}
export function resolveGroupLoot(s,id,choice){
 if(s.combat)throw new Error('请在战斗结束后分配战利品。');
 const loot=s.groupLoot?.pending.find(l=>l.id===id);if(!loot)throw new Error('这件战利品已经分配。');
 if(!['need','greed','pass'].includes(choice))throw new Error('请选择需求、贪婪或放弃。');
 const self=loot.members.find(m=>m.id===s.id);
 if(choice!=='pass'&&(!self.eligible||!canReceiveEquipment(s,items[loot.item.id])))throw new Error('已达到唯一物品上限，请选择放弃。');
 if(choice==='need'&&(!self.need||!equipmentUpgrade(s,items[loot.item.id]).need))throw new Error('这件装备不提升你的当前职责配装，可以选择贪婪。');
 const votes=loot.members.map(m=>{
  const actor=[s,...s.party].find(c=>c.id===m.id),need=actor&&m.need&&equipmentUpgrade(actor,items[loot.item.id]).need;
  return {...m,choice:!actor||!m.eligible||!canReceiveEquipment(actor,items[loot.item.id])?'pass':m.id===s.id?choice:need?'need':'greed'};
 });
 const candidates=votes.filter(m=>m.choice!=='pass').sort((a,b)=>(b.choice==='need')-(a.choice==='need')||b.roll-a.roll||b.tie-a.tie);
 const winner=candidates[0];
 if(winner){
  const actor=[s,...s.party].find(c=>c.id===winner.id);
  if(actor?.npcPlayer)npcAward(s,actor,loot.item,winner.choice==='need');
  else if(actor&&actor!==s){
   const plan=equipmentUpgrade(actor,items[loot.item.id]);actor.pendingRewards??=[];
   if(winner.choice==='need'&&plan.need){
    const displaced=[actor.equipment[plan.slot],...(items[loot.item.id].InventoryType===17?[actor.equipment[17]]:[])].filter(i=>i&&!i.issued);
    actor.pendingRewards.push(...displaced);equipNpcItem(actor,loot.item,plan);
   }else actor.pendingRewards.push(loot.item);
  }else s.pending.push(loot.item);
  log(s,`${winner.name} ${winner.choice==='need'?'需求':'贪婪'} ${winner.roll} 点，获得${nameOf('items',loot.item.id)}。`,'loot');
 }
 s.groupLoot.pending=s.groupLoot.pending.filter(l=>l.id!==id);
 s.groupLoot.history.unshift({id,name:nameOf('items',loot.item.id),itemId:loot.item.id,winner:winner?.name||'无人领取',votes:votes.map(({roll,tie,...m})=>({...m,roll:m.choice==='pass'?null:roll}))});
 s.groupLoot.history=s.groupLoot.history.slice(0,20);
}
export function tickGroupLoot(s){
 if(s.combat)return;
 for(const loot of [...s.groupLoot?.pending||[]]){
  loot.deadline??=s.clock+60000;
  if(s.npcWorld?.autoLoot||s.clock>=loot.deadline){const need=s.npcWorld?.autoLoot&&loot.members.find(m=>m.id===s.id)?.need&&equipmentUpgrade(s,items[loot.item.id]).need;resolveGroupLoot(s,loot.id,!canReceiveEquipment(s,items[loot.item.id])?'pass':need?'need':'greed');}
 }
}
export function groupLootView(s){return {pending:(s.groupLoot?.pending||[]).map(l=>({id:l.id,item:l.item,remaining:l.deadline===null?60000:Math.max(0,l.deadline-s.clock),canGreed:canReceiveEquipment(s,items[l.item.id]),canNeed:!!l.members.find(m=>m.id===s.id)?.need&&equipmentUpgrade(s,items[l.item.id]).need,members:l.members.map(({roll,tie,...m})=>m)})),history:s.groupLoot?.history||[],auto:!!s.npcWorld?.autoLoot};}
