import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act} from '../../../packages/game-domain/src/rules/engine.js';

test('equipment commands target the selected persistent character id',()=>{
 const s=createGame('独立角色',1,0);s.id='character-9ad7';
 const equipped=Object.values(s.equipment).find(item=>item.id===35)||Object.values(s.equipment)[0];
 const slot=Object.keys(s.equipment).find(key=>s.equipment[key]===equipped);
 delete s.equipment[slot];s.bag.push(equipped);
 const changed=act(s,{type:'equip',uid:equipped.uid,target:s.id},0);
 assert.equal(changed.equipment[slot].uid,equipped.uid);
});
