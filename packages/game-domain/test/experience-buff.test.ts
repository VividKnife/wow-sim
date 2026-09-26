import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {experienceMultiplier, applyExperienceBuff} from '../src/rules/experience.js';
import {createGame, advance} from '../src/rules/engine.js';
import {gainXp} from '../src/rules/character.js';
import {questProgress} from '../src/rules/quests.js';

test('server rate validates input; buff scales XP once, rounds down and can be removed',()=>{
 assert.equal(experienceMultiplier(),1);
 assert.equal(experienceMultiplier('2.5'),2.5);
 for(const bad of ['', ' ', 'abc', '-1', 'Infinity', '1001'])assert.throws(()=>experienceMultiplier(bad));
 const s=applyExperienceBuff(createGame('Hero',123,0),2.5);
 gainXp(s,s,11);assert.equal(s.xp,27);assert.equal(s.totals.xp,27);
 applyExperienceBuff(s,2.5);assert.equal(s.serverBuffs.length,1);
 applyExperienceBuff(s,0);gainXp(s,s,11);assert.equal(s.xp,27);
 applyExperienceBuff(s,1);gainXp(s,s,11);assert.equal(s.xp,38);assert.deepEqual(s.serverBuffs,[]);
 gainXp(s,s,10000);assert.ok(s.level>1);
});

async function fixture(rate:number){
 const store=new MemoryStore();let now=1000;
 const service=new GameService(store,{contentVersion:'test',xpMultiplier:rate,now:()=>now,seed:()=>283});
 const initial=await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create');
 return {store,service,initial,time:(t:number)=>{now=t;}};
}
test('quest displays base XP while server buff increases awarded XP without duplicate rewards',async()=>{
 const base=await fixture(1), boosted=await fixture(3);
 for(const f of [base,boosted])await f.service.command('a',{type:'accept',id:783,requestId:'accept'});
 const baseState=(await base.service.snapshot('a')).state, boostedState=(await boosted.service.snapshot('a')).state;
 assert.equal(questProgress(baseState,783)!.xp,questProgress(boostedState,783)!.xp);
 const normal=await base.service.command('a',{type:'turnin',id:783,requestId:'turnin'});
 const extra=await boosted.service.command('a',{type:'turnin',id:783,requestId:'turnin'});
 assert.ok(normal.state.totals.xp>0);assert.equal(extra.state.totals.xp,normal.state.totals.xp*3);
 const retry=await boosted.service.command('a',{type:'turnin',id:783,requestId:'again'});
 assert.equal(retry.state.totals.xp,extra.state.totals.xp);
});
for(const kind of ['personal','instance'])test(`${kind}: local simulation receives buff and rejects modified rate`,async()=>{
 const f=await fixture(2);
 if(kind==='personal')await f.service.command('a',{type:'hunt',id:299,requestId:'hunt'});
 else {const formed=await f.service.command('a',{type:'createInstance',requestId:'form'});await f.service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});}
 const snapshot=await f.service.snapshot('a');
 const base={ownerId:snapshot.localSimulation!.ownerId,characterId:snapshot.state.id,clientId:'browser',contentVersion:'test'};
 const claim=await f.service.localSimulation('a',{...base,type:'claim',requestId:'claim'});
 assert.equal(claim.state.serverBuffs[0].xpMultiplier,2);
 f.time(3000);const next=advance(claim.state,3000).state;
 next.serverBuffs[0].xpMultiplier=10;
 await assert.rejects(f.service.localSimulation('a',{...base,type:'checkpoint',sessionId:claim.session.id,sequence:1,state:next,requestId:'bad'}),/经验增益/);
 next.serverBuffs[0].xpMultiplier=2;
 const saved=await f.service.localSimulation('a',{...base,type:'checkpoint',sessionId:claim.session.id,sequence:1,state:next,requestId:'good'});
 assert.equal(saved.state,undefined);
 assert.equal((await f.service.snapshot('a')).state.serverBuffs[0].xpMultiplier,2);
});
