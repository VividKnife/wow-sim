import test from 'node:test';
import assert from 'node:assert/strict';
import {commandServiceFixture} from '../../../apps/web/test/support/command-service-fixture.mjs';
import {advance} from '../src/rules/engine.js';
import {GameService} from '../src/service.ts';

test('command mode survives server restart and local pause checkpoints with no timer gain',async()=>{
 let now=1000;const f=await commandServiceFixture({now:()=>now});
 assert.equal(f.started.state.combat.command.paused,true);assert.equal(f.started.combatMode,'realtime');
 const base={ownerId:f.started.instanceId,characterId:f.started.state.id,clientId:'command-browser',contentVersion:'test'};
 const claimed=await f.service.localSimulation(f.save.id,{...base,type:'claim',requestId:'claim'});
 now=11000;const frozen=advance(claimed.state,now).state;
 const saved=await f.service.localSimulation(f.save.id,{...base,type:'checkpoint',sessionId:claimed.session.id,sequence:1,state:frozen,requestId:'checkpoint'});
 assert.equal(saved.state.clock,claimed.state.clock);assert.equal(saved.state.combat.pull.startsAt,claimed.state.combat.pull.startsAt);
 const credentials={localClientId:base.clientId,localSessionId:saved.session.id};
 const enemy=saved.state.combat.enemies[0];
 const marked=await f.send({type:'combatCommand',order:'mark',encounterId:saved.state.combat.id,targetId:enemy.id,mark:'skull',...credentials});
 assert.equal(marked.state.combat.command.marks[enemy.id],'skull');
 await assert.rejects(f.service.localSimulation(f.save.id,{...base,type:'checkpoint',sessionId:claimed.session.id,sequence:2,state:frozen,requestId:'stale'}),{code:'LOCAL_STALE'});
 const restarted=new GameService(f.store,{contentVersion:'test',now:()=>now,seed:()=>747});
 assert.equal((await restarted.snapshot(f.save.id)).state.combat.command.paused,true);
 const resumed=await restarted.command(f.save.id,{type:'combatCommand',order:'resume',encounterId:saved.state.combat.id,requestId:'resume'});
 assert.equal(resumed.state.combat.command.paused,false);assert.equal(resumed.state.clock,saved.state.clock);
});
