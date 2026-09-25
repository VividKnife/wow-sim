import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileItemIdentities,itemIdentityChanges,remapItemReferences} from '../lib/local-item-identities.js';
test('acknowledged loot IDs are reconciled after more ticks, inventory movement and consumption',()=>{
 const submitted={clock:100,bag:[{uid:'new-loot',count:4}],equipment:{},party:[{equipment:{hand:{uid:'new-weapon'}}}]};
 const canonical={clock:100,bag:[{uid:'server-loot',count:4}],equipment:{},party:[{equipment:{hand:{uid:'server-weapon'}}}]};
 const current={clock:200,hp:17,money:42,bag:[{uid:'later-loot',count:1}],pending:[{uid:'new-loot',count:2}],party:[{equipment:{hand:{uid:'new-weapon'}}}],cast:{itemUid:'new-loot'}};
 reconcileItemIdentities(current,submitted,canonical);
 assert.deepEqual(current,{clock:200,hp:17,money:42,bag:[{uid:'later-loot',count:1}],pending:[{uid:'server-loot',count:2}],party:[{equipment:{hand:{uid:'server-weapon'}}}],cast:{itemUid:'server-loot'}});
 assert.equal(submitted.bag[0].uid,'new-loot');
});
test('an acknowledgement never resurrects loot already consumed by later simulation',()=>{
 const current={bag:[],clock:300};
 reconcileItemIdentities(current,{bag:[{uid:'temp'}]},{bag:[{uid:'saved'}]});
 assert.deepEqual(current,{bag:[],clock:300});
});
test('a queued click on newly generated loot uses its acknowledged ID',()=>{
 const changes=itemIdentityChanges({pending:[{uid:'drop-1'}]},{pending:[{uid:'asset-uuid'}]});
 assert.deepEqual(remapItemReferences({type:'loot',uids:['drop-1']},changes),{type:'loot',uids:['asset-uuid']});
});
