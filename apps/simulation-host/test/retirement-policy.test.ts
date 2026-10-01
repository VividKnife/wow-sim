import test from 'node:test';
import assert from 'node:assert/strict';
import {inactiveRoom,idleRetireDelay} from '../src/retirement-policy.ts';
const base=()=>({activity:{type:'idle'},party:[],quests:{},auctions:[]});
test('offloading requires an inactive room with no pending activity or asset deadline',()=>{
 assert.equal(inactiveRoom(base()),true);
 assert.equal(inactiveRoom({...base(),activity:{type:'hunt',paused:true}}),true);
 assert.equal(inactiveRoom({...base(),buffs:{fortitude:{until:60000}}}),true,'buff evolution is replayed, not discarded');
 for(const change of [{combat:{}},{rest:{}},{cast:{}},{activity:{type:'travel',endsAt:1000}},{activity:{type:'hunt'}},{dungeon:{autoAdvance:true}},{groupLoot:{pending:[{}]}},{goldRaid:{auctions:[{}]}},{auctions:[{}]},{quests:{1:{expiresAt:1000}}},{arena:{phase:'combat'}},{battleground:{phase:'countdown'}},{party:[{cast:{}}]}])assert.equal(inactiveRoom({...base(),...change}),false,JSON.stringify(change));
 for(const value of [0,99,-1,NaN,Infinity,3_600_001])assert.throws(()=>idleRetireDelay(value));
 assert.equal(idleRetireDelay(60_000),60_000);
});
