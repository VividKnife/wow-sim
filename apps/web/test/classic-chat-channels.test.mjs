import test from 'node:test';
import assert from 'node:assert/strict';
import {chatChannelLogs} from '../lib/classic-chat-channels.js';

test('classic chat keeps rewards and travel visible despite dense combat logs',()=>{
 const logs=[{id:1,kind:'travel',text:'抵达暴风城'},{id:2,kind:'loot',text:'拾取布料'},{id:3,kind:'xp',text:'获得 25 点经验'},...Array.from({length:40},(_,index)=>({id:index+4,kind:'damage',text:'造成伤害'}))];
 assert.deepEqual(chatChannelLogs(logs,'general').map(log=>log.id),[3,2,1]);
 assert.equal(chatChannelLogs(logs,'combat').length,30);
 assert.equal(chatChannelLogs(logs,'combat')[0].id,43);
});

test('combat status and spell logs stay in combat details',()=>{
 const logs=[{id:1,kind:'combat',text:'遭遇敌人'},{id:2,kind:'cast',text:'施放法术'},{id:3,kind:'incoming',text:'受到伤害'},{id:4,kind:'info',encounterId:'battle-1',text:'集火目标'},{id:5,kind:'quest',text:'任务完成'}];
 assert.deepEqual(chatChannelLogs(logs,'combat').map(log=>log.id),[4,3,2,1]);
 assert.deepEqual(chatChannelLogs(logs,'general').map(log=>log.id),[5]);
});

test('general categories are independent of combat and unknown events remain visible',async()=>{
 const {chatLogCategory}=await import('../lib/classic-chat-channels.js');
 assert.equal(chatLogCategory({kind:'loot'}).id,'reward');
 assert.equal(chatLogCategory({kind:'quest'}).id,'quest');
 assert.equal(chatLogCategory({kind:'travel'}).id,'travel');
 assert.equal(chatLogCategory({kind:'info',encounterId:'fight'}).id,'combat');
 assert.equal(chatLogCategory({kind:'new-event'}).id,'system');
 const logs=Array.from({length:150},(_,id)=>({id,kind:'loot'}));
 assert.equal(chatChannelLogs(logs,'general',100).length,100);
 assert.equal(chatChannelLogs(logs,'general',100).at(-1).id,50);
 assert.equal(logs[0].id,0);
});
