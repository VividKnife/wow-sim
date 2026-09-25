import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Item} from '../src/model.ts';

test('level-one hunters receive race-appropriate weapons, proficiency and matching ammunition',async()=>{
 const store=new MemoryStore();
 let sequence=0;
 const service=new GameService(store,{contentVersion:'hunter-starter-bow',now:()=>1000,seed:()=>12345,id:()=>`hunter-${++sequence}`});
 for(const raceId of [2,3,4,6,8]){
  const accountId=`hunter-race-${raceId}`;
  const snapshot=await service.createAccount(accountId,{name:`Hunter${raceId}`,classId:3,raceId},'create');
  assert.equal(snapshot.state.level,1);
  const gun=raceId===3||raceId===6,weaponId=gun?2508:2504;
  assert.equal(snapshot.state.equipment[18]?.id,weaponId);
  assert.ok(snapshot.state.learned.includes(gun?266:264));
  assert.equal(snapshot.state.ammunition[gun?2516:2512],200);
  const items=await store.transaction(tx=>tx.list<Item>('items',{ownerCharacterId:snapshot.state.id}));
  assert.equal(items.filter(item=>item.data.id===weaponId&&item.container==='equipment'&&item.slot==='18').length,1);
 }
});
