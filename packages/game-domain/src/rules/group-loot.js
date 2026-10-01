import {items,nameOf} from './catalog.js';
import {makeItem,rng,log} from './character.js';
import {equipmentUpgrade,canReceiveEquipment} from './npc-equipment.js';
import {npcAward} from './npc-world.js';
import {rewardCharacters} from './combat-members.js';

export const GROUP_LOOT_WINDOW = 2;
export const GROUP_LOOT_TIMEOUT_MS = 60000;
const activeLoot=s=>(s.groupLoot?.pending||[]).slice(0,GROUP_LOOT_WINDOW);
function startActiveLoot(s){
 if(s.combat)return;
 for(const loot of activeLoot(s))if(loot.members.filter(m=>!m.npc).length>1)loot.deadline??=s.clock+GROUP_LOOT_TIMEOUT_MS;
}

export function queueGroupLoot(s,id,count,recipients=rewardCharacters(s)){
 if(!recipients.length)return false;
 const data=items[id];
 if(!s.dungeon||(!s.party.some(c=>c.npcPlayer)&&!s.sharedParty)||!s.party.length||data.Quality<2||![2,4].includes(data.class)||!data.InventoryType||data.startquest||data.bonding===4)return false;
 s.groupLoot??={pending:[],history:[]};
 for(let n=0;n<count;n++){
  const item=makeItem(s,id),members=recipients.map(c=>{
   const plan=equipmentUpgrade(c,data),eligible=canReceiveEquipment(c,data);
   return {id:c.id,name:c.name,npc:!!c.npcPlayer,eligible,need:eligible&&plan.need,reason:eligible?plan.reason:'已达到唯一物品上限',replaces:plan.replaces,roll:1+Math.floor(rng(s)*100),tie:rng(s),choice:null};
  });
  s.groupLoot.pending.push({id:item.uid,item,members,deadline:null});
 }
 startActiveLoot(s);return true;
}
const actorFor=(s,id)=>[s,...s.party].find(c=>c.id===id);
function automaticChoice(actor,member,item,preferNeed){
 if(!actor||!member.eligible||!canReceiveEquipment(actor,item))return 'pass';
 return preferNeed&&member.need&&equipmentUpgrade(actor,item).need?'need':'greed';
}
function finishGroupLoot(s,loot){
 // Each human owns their vote. NPC policy runs only once all humans have
 // decided, preserving the existing single-human decision timing and RNG.
 if(loot.members.some(m=>!m.npc&&!m.choice))return;
 const data=items[loot.item.id],votes=loot.members.map(m=>{
  const actor=actorFor(s,m.id);
  const choice=m.npc?automaticChoice(actor,m,data,true):!actor||!m.eligible||!canReceiveEquipment(actor,data)?'pass':
   m.choice==='need'&&!equipmentUpgrade(actor,data).need?'greed':m.choice;
  return {...m,choice};
 });
 const candidates=votes.filter(m=>m.choice!=='pass').sort((a,b)=>(b.choice==='need')-(a.choice==='need')||b.roll-a.roll||b.tie-a.tie);
 const winner=candidates[0];
 if(winner){
  const actor=actorFor(s,winner.id);
  if(actor.npcPlayer)npcAward(s,actor,loot.item,winner.choice==='need');
  else actor.pending.push(loot.item); // Humans choose when to equip their award.
  log(s,`${winner.name} ${winner.choice==='need'?'需求':'贪婪'} ${winner.roll} 点，获得${nameOf('items',loot.item.id)}。`,'loot');
 }
 s.groupLoot.pending=s.groupLoot.pending.filter(l=>l.id!==loot.id);
 s.groupLoot.history.unshift({id:loot.id,name:nameOf('items',loot.item.id),itemId:loot.item.id,winner:winner?.name||'无人领取',votes:votes.map(({roll,tie,...m})=>({...m,roll:m.choice==='pass'?null:roll}))});
 s.groupLoot.history=s.groupLoot.history.slice(0,20);
 startActiveLoot(s);
}
export function resolveGroupLoot(s,id,choice,actorId=s.id){
 if(s.combat)throw new Error('请在战斗结束后分配战利品。');
 const loot=s.groupLoot?.pending.find(l=>l.id===id);if(!loot)throw new Error('这件战利品已经分配。');
 if(!activeLoot(s).includes(loot))throw new Error('这件战利品尚在排队，请先处理前面的掉落。');
 if(!['need','greed','pass'].includes(choice))throw new Error('请选择需求、贪婪或放弃。');
 const self=loot.members.find(m=>m.id===actorId),actor=actorFor(s,actorId);
 if(!self||self.npc||!actor||actor.npcPlayer)throw new Error('你不在这件战利品的分配名单中。');
 if(self.choice){if(self.choice===choice)return;throw new Error('你已经选择了分配方式，请等待其他成员。');}
 if(choice!=='pass'&&(!self.eligible||!canReceiveEquipment(actor,items[loot.item.id])))throw new Error('已达到唯一物品上限，请选择放弃。');
 if(choice==='need'&&(!self.need||!equipmentUpgrade(actor,items[loot.item.id]).need))throw new Error('这件装备不提升你的当前职责配装，可以选择贪婪。');
 self.choice=choice;finishGroupLoot(s,loot);
}
export function tickGroupLoot(s){
 if(s.combat)return;
 startActiveLoot(s);
 for(const loot of activeLoot(s)){
  for(const member of loot.members){
   if(member.npc||member.choice)continue;
   const actor=actorFor(s,member.id),auto=!!actor?.npcWorld?.autoLoot;
   if(!actor||auto||loot.deadline!==null&&s.clock>=loot.deadline)member.choice=automaticChoice(actor,member,items[loot.item.id],auto);
  }
  finishGroupLoot(s,loot);
 }
}
export function groupLootView(s){return {pending:activeLoot(s).map(l=>{
 const self=l.members.find(m=>m.id===s.id),choice=self?.choice??null;
 return {id:l.id,item:l.item,remaining:l.members.filter(m=>!m.npc).length<=1?null:l.deadline===null?GROUP_LOOT_TIMEOUT_MS:Math.max(0,l.deadline-s.clock),choice,
  waiting:l.members.filter(m=>!m.npc&&!m.choice).length,
  canGreed:!!self&&!choice&&self.eligible&&canReceiveEquipment(s,items[l.item.id]),
  canNeed:!!self&&!choice&&self.need&&canReceiveEquipment(s,items[l.item.id])&&equipmentUpgrade(s,items[l.item.id]).need,
  members:l.members.map(({roll,tie,...m})=>m)};
 }),queued:Math.max(0,(s.groupLoot?.pending.length||0)-GROUP_LOOT_WINDOW),history:s.groupLoot?.history||[],auto:!!s.npcWorld?.autoLoot};}
