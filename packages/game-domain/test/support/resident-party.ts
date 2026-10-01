import type {Store} from '../../../persistence/src/store.ts';
import {GameService} from '../../src/service.ts';
import type {Residency,CharacterAdmission} from '../../src/resident-characters.ts';
import {runtimeVersion} from '../../../../apps/simulation-host/src/version.ts';
import {context,persistCharacter} from '../../src/context.ts';
import {makeItem} from '../../src/rules/character.js';
import type {Character,Rules} from '../../src/model.ts';

export async function residentPartyFixture(store:Store, now=1000, prepare?:(state:Rules)=>void){
  const game=new GameService(store,{contentVersion:'participants',seed:()=>283,now:()=>now});
  const ids:string[]=[];
  for(const accountId of ['alice','bob']){
    const result=await game.createAccount(accountId,{name:accountId,classId:8,raceId:1},'create');
    ids.push(result.state.id);
  }
  const states:Rules[]=await store.transaction(async tx=>{
    const result=[];
    for(const [index,id]of ids.entries()){
      const c=(await tx.get<Character>('characters',id))!,s=await context(tx,c,now,false);
      s.money=(index+1)*1111;
      s.bag.push(makeItem(s,159));
      s.bank.push(makeItem(s,159));
      s.strategyProfiles=[{name:index?'PRIVATE-BOB':'PRIVATE-ALICE',rules:[],policy:{},autoBuffs:{},potions:{}}];
      await persistCharacter(tx,c,s,now,'private:'+id);result.push(s);
    }
    return result;
  });
  const state=states[0];state.party=[states[1]];prepare?.(state);
  const participants=ids.map((characterId,index)=>({characterId,accountId:index?'bob':'alice'}));
  const admission:CharacterAdmission={instanceId:'shared:participants',state,
    controllers:participants.map(p=>({actorId:p.characterId,accountId:p.accountId,generation:1,canPause:false})),
    presence:{offlineLimitMs:7200000,accounts:[['alice',now],['bob',now]]}};
  // Establish a bound room fixture before either character is resident.
  // Production transfer from two active personal owners is a separate operation.
  await store.transaction(async tx=>{
    await tx.insert('simulation_residencies',{id:admission.instanceId,characterId:state.id,accountId:'alice',
      participants,...runtimeVersion,encodedAdmission:JSON.stringify(admission)} satisfies Residency);
    for(const p of participants)await tx.insert('simulation_characters',{id:p.characterId,accountId:p.accountId,instanceId:admission.instanceId});
  });
  return {admission,ids,participants};
}
