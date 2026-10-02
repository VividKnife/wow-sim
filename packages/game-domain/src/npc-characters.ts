import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {ReadView,Transaction} from '../../persistence/src/store.ts';
import {requireThat,type Rules,type Item,type Wallet} from './model.ts';
import {persistAssets} from './context.ts';
import type {CharacterClaim} from './resident-store.ts';

const containers=['bag','bags','bank','pending','auctions','raidCollection','raidPendingEquipment'];
export type NpcCharacter={id:string;accountId:null;realm:'public';rules:Rules;profile:Rules;assetHash:string};
/** A public character owns its assets. A human account never owns this row. */
export async function loadNpcResident(tx:ReadView,row:NpcCharacter):Promise<Rules>{
 const wallet=await tx.get<Wallet>('wallets',row.id);
 requireThat(row.realm==='public'&&row.accountId===null&&wallet?.accountId===null,'NPC_STATE','公共 NPC 资产记录无效');
 const unit:Rules={...structuredClone(row.rules),id:row.id,money:wallet.balance,equipment:{}};
 for(const container of containers)unit[container]=[];
 for(const item of (await tx.list<Item>('items',{ownerCharacterId:row.id})).sort((a,b)=>a.position-b.position)){
  requireThat(item.accountId===null,'NPC_STATE','公共 NPC 物品归属无效');
  const data:Rules={...structuredClone(item.data),uid:item.id};
  if(item.container==='equipment')unit.equipment[item.slot!]=data;
  else if(item.container==='auctions')unit.auctions.push({...data,item:{...data.item,uid:item.id}});
  else{requireThat(containers.includes(item.container),'NPC_STATE','公共 NPC 物品容器无效');unit[item.container].push(data);}
 }
 return {...structuredClone(row.profile),id:row.id,unit,wallet:wallet.balance};
}
export async function persistNpcResident(tx:Transaction,resident:Rules,key:string,instanceId?:string){
 const {unit,wallet,id,...profile}=resident;
 const assigned=await tx.get<CharacterClaim>('simulation_characters',id);
 requireThat(instanceId?assigned?.instanceId===instanceId&&assigned.accountId===null:!assigned,'SIMULATION_FENCED','公共 NPC 已由活动实例管理');
 requireThat(typeof id==='string'&&/^npc:realm:\d+$/.test(id)&&unit?.id===id&&unit.npcPlayer===true,'NPC_OWNER','公共 NPC 身份无效');
 const previous=await tx.get<NpcCharacter>('npc_characters',id);
 requireThat(!previous||previous.realm==='public'&&previous.accountId===null,'NPC_OWNER','公共 NPC 身份无效');
 const rules=structuredClone(unit);
 for(const field of ['id','money','equipment',...containers])delete rules[field];
 const assets={money:wallet,equipment:unit.equipment,...Object.fromEntries(containers.map(c=>[c,unit[c]??[]]))};
 const assetHash=createHash('sha256').update(JSON.stringify(assets)).digest('hex');
 const row:NpcCharacter={id,accountId:null,realm:'public',rules,profile,assetHash};
 if(!previous||!isDeepStrictEqual(previous,JSON.parse(JSON.stringify(row))))await tx.put('npc_characters',row);
 if(previous?.assetHash!==assetHash)await persistAssets(tx,row,{...unit,...assets},key,'npc_characters');
}
