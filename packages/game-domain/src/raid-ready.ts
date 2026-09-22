import {createRoster} from './molten-core-roster.ts';
import {newState,characterRules,persistAssets} from './context.ts';
import {makeItem,log} from './rules/character.js';
import type {GameService} from './service.ts';
import type {Transaction} from '../../persistence/src/store.ts';
import type {Character,Rules} from './model.ts';

export async function provisionRaidCore(service:GameService,tx:Transaction,accountId:string,hero:Rules,partyId:string,now:number){
 const templates=createRoster().slice(0,5),ids:string[]=[];
 for(const [index,template]of templates.entries()){
  const id=index===0?hero.id:service.id(),name=index===0?hero.name:template.name;
  const state:Rules={...newState(name,template.classId,template.raceId,service.seed(),now,id),...template,id,name,clock:now,time:now,wallAt:now};
  if(index===0){delete state.growthPolicy;state.gender=hero.gender;state.money=1000000;}
  state.party=[];state.bag=[];state.pending=[];state.bank=[];state.auctions=[];state.bags=Array.from({length:4},()=>makeItem(state,14046));
  state.location='goldshire';state.hearth='goldshire';state.visited=['northshire','goldshire'];state.activity={type:'idle'};
  for(const item of Object.values(state.equipment) as Rules[])item.ownerId=id;
  log(state,'60级公会远征已整备：蓝装、职业技能与核心队就绪。前往地下城的熔火之心开始挑战。','raid');
  const row:Character={id,accountId,kind:index===0?'hero':'companion',rules:characterRules(state),professionReadyAt:{},resourceReadyAt:{}};
  await tx.put('characters',row);await persistAssets(tx,row,state,`raid-ready:${accountId}:${id}`,service.id);
  if(index>0)await tx.insert('companions',{id,characterId:id,accountId,ownerCharacterId:hero.id,growthPolicy:'companion'});
  ids.push(id);
 }
 await tx.put('parties',{id:partyId,accountId,characterIds:ids});
}
