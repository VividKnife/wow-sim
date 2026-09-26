import test from 'node:test';
import assert from 'node:assert/strict';
import {characterPreview} from '../lib/character-preview.js';
import {classDefinitions} from '../../../packages/game-domain/src/rules/catalog.js';
import {modelEquipment} from '../lib/model-viewer.js';

test('every legal race/class has starter and boosted equipment for the shared viewer',()=>{
 for(const cls of classDefinitions)for(const raceId of cls.races)for(const level of [1,20]){
  const preview=characterPreview(raceId,cls.id,level);
  assert.equal(preview.raceId,raceId);assert.equal(preview.classId,cls.id);
  const attachments=modelEquipment(preview.equipment,preview.items);
  assert.ok(attachments.length>0,`${raceId}/${cls.id}/${level}`);
  assert.ok(attachments.every(item=>item.id>0));
  assert.ok(attachments.length<=19);
 }
 assert.throws(()=>characterPreview(2,2,1));
});

 test('raid preview matches persisted level-60 hero equipment',async()=>{
  const {GameService}=await import('../../../packages/game-domain/src/service.ts');
  const {MemoryStore}=await import('../../../packages/persistence/src/memory.ts');
  const service=new GameService(new MemoryStore(),{contentVersion:'test',now:()=>1000,seed:()=>123});
  const {id}=await service.createSave('preview',{name:'预览',raceId:1,classId:8,raidReady:true},'raid');
  const state=(await service.snapshot(id)).state;
  assert.deepEqual(characterPreview(1,8,60).equipment,Object.fromEntries(Object.entries(state.equipment).map(([slot,item])=>[slot,{id:item.id}])));
  assert.throws(()=>characterPreview(2,8,60));
  assert.throws(()=>characterPreview(1,1,60));
  assert.throws(()=>characterPreview(1,8,30));
 });
