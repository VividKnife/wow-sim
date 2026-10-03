import {items,nameOf} from './catalog.js';
import {makeItem,rng,log} from './character.js';
import {equipmentUpgrade,canReceiveEquipment} from './npc-equipment.js';
import {npcAward} from './npc-world.js';
import {rewardCharacters} from './combat-members.js';

export const GROUP_LOOT_WINDOW = 2;
export const GROUP_LOOT_TIMEOUT_MS = 60000;
const lootEligible=(actor,item)=>item.mountId?!actor.npcPlayer:canReceiveEquipment(actor,item);
const lootNeed=(actor,item)=>item.mountId?!(actor.mounts||[]).includes(item.mountId):equipmentUpgrade(actor,item).need;
const activeLoot=s=>(s.groupLoot?.pending||[]).slice(0,GROUP_LOOT_WINDOW);
function startActiveLoot(s){
 for(const loot of activeLoot(s))if(loot.members.filter(m=>!m.npc).length>1)loot.deadline??=s.clock+GROUP_LOOT_TIMEOUT_MS;
}

export function queueGroupLoot(s,id,count,recipients=rewardCharacters(s)){
 if(!recipients.length)return false;
 const data=items[id];
 if(!s.dungeon||(!s.party.some(c=>c.npcPlayer)&&!s.sharedParty)||!s.party.length||data.Quality<2||(!data.mountId&&(![2,4].includes(data.class)||!data.InventoryType))||data.startquest||data.bonding===4)return false;
 s.groupLoot??={pending:[],history:[]};
 for(let n=0;n<count;n++){
  const item=makeItem(s,id),members=recipients.map(c=>{
   const plan=equipmentUpgrade(c,data),eligible=lootEligible(c,data);
   return {id:c.id,name:c.name,npc:!!c.npcPlayer,eligible,need:eligible&&lootNeed(c,data),reason:data.mountId?(c.npcPlayer?'NPC 不参与坐骑分配':lootNeed(c,data)?'尚未收藏这只坐骑':'已经收藏，可选择贪婪或放弃'):eligible?plan.reason:'已达到唯一物品上限',replaces:plan.replaces,roll:1+Math.floor(rng(s)*100),tie:rng(s),choice:data.mountId&&c.npcPlayer?'pass':null};
  });
  s.groupLoot.pending.push({id:item.uid,item,members,deadline:null});
 }
 startActiveLoot(s);return true;
}
const actorFor=(s,id)=>[s,...s.party].find(c=>c.id===id);
function automaticChoice(actor,member,item,preferNeed){
 if(!actor||!member.eligible||!lootEligible(actor,item))return 'pass';
 return preferNeed&&member.need&&lootNeed(actor,item)?'need':'greed';
}
function finishGroupLoot(s,loot){
 // Each human owns their vote. NPC policy runs only once all humans have
 // decided, preserving the existing single-human decision timing and RNG.
 if(loot.members.some(m=>!m.npc&&!m.choice))return;
 const data=items[loot.item.id],votes=loot.members.map(m=>{
  const actor=actorFor(s,m.id);
  const choice=m.npc?automaticChoice(actor,m,data,true):!actor||!m.eligible||!lootEligible(actor,data)?'pass':
   m.choice==='need'&&!lootNeed(actor,data)?'greed':m.choice;
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
 const loot=s.groupLoot?.pending.find(l=>l.id===id);if(!loot)throw new Error('这件战利品已经分配。');
 if(!activeLoot(s).includes(loot))throw new Error('这件战利品尚在排队，请先处理前面的掉落。');
 if(!['need','greed','pass'].includes(choice))throw new Error('请选择需求、贪婪或放弃。');
 const self=loot.members.find(m=>m.id===actorId),actor=actorFor(s,actorId);
 if(!self||self.npc||!actor||actor.npcPlayer)throw new Error('你不在这件战利品的分配名单中。');
 if(self.choice){if(self.choice===choice)return;throw new Error('你已经选择了分配方式，请等待其他成员。');}
 if(choice!=='pass'&&(!self.eligible||!lootEligible(actor,items[loot.item.id])))throw new Error('已达到唯一物品上限，请选择放弃。');
 if(choice==='need'&&(!self.need||!lootNeed(actor,items[loot.item.id])))throw new Error('这件物品不符合需求条件，可以选择贪婪。');
 self.choice=choice;finishGroupLoot(s,loot);
}
export function tickGroupLoot(s){
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
  canGreed:!!self&&!choice&&self.eligible&&lootEligible(s,items[l.item.id]),
  canNeed:!!self&&!choice&&self.need&&lootEligible(s,items[l.item.id])&&lootNeed(s,items[l.item.id]),
  members:l.members.map(({roll,tie,...m})=>m)};
 }),queued:Math.max(0,(s.groupLoot?.pending.length||0)-GROUP_LOOT_WINDOW),history:s.groupLoot?.history||[],auto:!!s.npcWorld?.autoLoot};}
