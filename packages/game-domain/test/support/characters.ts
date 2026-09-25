import type {GameService} from '../../src/service.ts';
import type {Rules, Character} from '../../src/model.ts';
import {account,newState,characterRules,persistAssets} from '../../src/context.ts';
// Persistence/lease tests seed actors directly; recruitment policy is covered separately.
export async function seedCompanion(service:GameService, accountId:string, cmd:Rules){
 await service.store.transaction(async tx=>{
  const a=await account(tx,accountId),id=service.id();
  const s=newState(cmd.name,cmd.classId,cmd.raceId||1,service.seed(),service.now(),id);
  const c:Character={id,accountId,kind:'companion',rules:characterRules(s),professionReadyAt:{},resourceReadyAt:{}};
  await tx.insert('characters',c);
  await tx.insert('companions',{id,characterId:id,accountId,ownerCharacterId:a.primaryCharacterId,growthPolicy:'independent'});
  await persistAssets(tx,c,s,`fixture:${id}`,service.id);
 });
 return service.snapshot(accountId);
}
