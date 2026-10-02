import {createRoster} from './molten-core-roster.ts';
import {grantRaidReadyAttunements} from './rules/raid-attunement.js';
import {newState,characterRules,persistAssets,rebaseSimulation} from './context.ts';
import {makeItem,log,stats} from './rules/character.js';
import {boostMount} from './rules/mounts.js';
import type {GameService} from './service.ts';
import type {Transaction} from '../../persistence/src/store.ts';
import type {Character,Rules} from './model.ts';

export async function provisionRaidHero(service:GameService,tx:Transaction,accountId:string,hero:Rules,partyId:string,now:number){
 const template=createRoster()[0],id=hero.id,name=hero.name;
 rebaseSimulation(Object.assign(template,{clock:0}),now);
 const state:Rules={...newState(name,template.classId,template.raceId,service.seed(),now,id),...template,id,name,gender:hero.gender,clock:now,time:now,wallAt:now};
 delete state.growthPolicy;delete state.roleId;delete state.joinedAt;
 state.professions={};state.money=1000000;state.mounts=[boostMount.id];state.riding.horse=true;
 state.party=[];state.bag=[];state.pending=[];state.bank=[];state.auctions=[];state.bags=Array.from({length:4},()=>makeItem(state,14046));
 grantRaidReadyAttunements(state);
 state.location='goldshire';state.hearth='goldshire';state.visited=['northshire','goldshire'];state.activity={type:'idle'};
 // The roster is a template; each provisioned character owns newly issued items.
 for(const [slot,item] of Object.entries(state.equipment) as [string,Rules][])state.equipment[slot]={...item,...makeItem(state,item.id,item.count),ownerId:id};
 const attributes=stats(state);state.hp=attributes.maxHp;state.mana=attributes.maxMana;
 log(state,'60级金团已整备：蓝装、职业技能就绪，可通过公共池招募队友。队长已完成熔火之心门任务并持有龙火护符。','raid');
 const row:Character={id,accountId,kind:'hero',rules:characterRules(state),professionReadyAt:{},resourceReadyAt:{}};
 await tx.put('characters',row);await persistAssets(tx,row,state,`raid-ready:${accountId}:${id}`);
 await tx.put('parties',{id:partyId,accountId,characterIds:[id]});
}
