import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {stats} from '../src/rules/character.js';
import {items} from '../src/rules/catalog.js';

test('warmed item metadata preserves equipment, enchant, durability and aura changes',()=>{
 const actor:any=createGame('属性缓存',283,0,{classId:1,raceId:1});
 actor.level=20;actor.equipment={};
 const naked=stats(actor);
 const item:any=Object.values(items).find((item:any)=>item.MaxDurability>0&&item.stat_type1===4&&item.stat_value1>0);
 assert.ok(item);
 actor.equipment[9]={id:item.entry,durability:item.MaxDurability};
 const equipped=stats(actor);
 assert.ok(equipped.str>naked.str);
 assert.deepEqual(stats(actor),equipped);

 actor.equipment[9].enchant='13661'; // +5 strength
 const enchanted=stats(actor);
 assert.equal(enchanted.str,equipped.str+5);
 actor.equipment[9].durability=0;
 assert.deepEqual(stats(actor),naked);
 actor.equipment[9].durability=item.MaxDurability;
 assert.deepEqual(stats(actor),enchanted);
 delete actor.equipment[9].enchant;
 assert.deepEqual(stats(actor),equipped);

 actor.auras=[{type:29,misc:0,amount:7,until:1000}];
 assert.equal(stats(actor).str,equipped.str+7);
 actor.time=1000;
 assert.deepEqual(stats(actor),equipped);
 delete actor.equipment[9];
 assert.deepEqual(stats(actor),naked);
});
