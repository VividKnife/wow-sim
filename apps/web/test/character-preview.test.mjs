import test from 'node:test';
import assert from 'node:assert/strict';
import {characterPreview} from '../lib/character-preview.js';
import {classDefinitions} from '../../../packages/game-domain/src/rules/catalog.js';
import {modelEquipment} from '../lib/model-viewer.js';

test('every legal race/class has starter and boosted equipment for the shared viewer',()=>{
 for(const cls of classDefinitions)for(const raceId of cls.races)for(const boost of [false,true]){
  const preview=characterPreview(raceId,cls.id,boost);
  assert.equal(preview.raceId,raceId);assert.equal(preview.classId,cls.id);
  const attachments=modelEquipment(preview.equipment,preview.items);
  assert.ok(attachments.length>0,`${raceId}/${cls.id}/${boost}`);
  assert.ok(attachments.every(item=>item.id>0));
  assert.ok(attachments.length<=19);
 }
 assert.throws(()=>characterPreview(2,2,false));
});
