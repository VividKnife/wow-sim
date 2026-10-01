import test from 'node:test';
import assert from 'node:assert/strict';
import {commandServiceFixture} from '../../../apps/web/test/support/command-service-fixture.mjs';
import {advance} from '../src/rules/engine.js';
import type {Rules} from '../src/model.ts';
import {GameService} from '../src/service.ts';



test('team spell inputs use persisted request idempotency and fence foreign controllers/shared pause',async()=>{
 const f=await commandServiceFixture();const s=f.started.state;
 const member=s.party.find((c:Rules)=>c.classId===5),target=s.id;
 const command={type:'combatCommand',order:'cast',encounterId:s.combat.id,memberId:member.id,spellId:2050,targetId:target,requestId:'one-heal'};
 const first=await f.service.command(f.save.id,command),again=await f.service.command(f.save.id,command);
 assert.equal(first.state.combat.command.inputs.length,1);assert.equal(again.state.combat.command.inputSequence,1);
 await f.service.createAccount('foreign',{name:'访客',classId:8,raceId:1},'create-foreign');
 await f.store.transaction(async tx=>{const instance=await tx.get<any>('instances',f.started.instanceId!);instance.roster.find((r:Rules)=>r.characterId===member.id).accountId='foreign';await tx.put('instances',instance);});
 await assert.rejects(f.service.command(f.save.id,{...command,requestId:'foreign-heal'}),{code:'FORBIDDEN'});
 await assert.rejects(f.service.command(f.save.id,{type:'combatCommand',order:'pause',encounterId:s.combat.id,requestId:'pause-shared'}),{code:'SHARED_CLOCK'});
});

test('server pause survives restart and resumes without advancing combat time',async()=>{
 let now=1000;const f=await commandServiceFixture({now:()=>now});
 const initial=f.started.state;
 assert.equal(initial.combat.command.paused,true);
 now=11000;
 const persisted=(await f.service.snapshot(f.save.id)).state;
 assert.equal(persisted.clock,initial.clock);
 assert.equal(persisted.combat.pull.startsAt,initial.combat.pull.startsAt);
 const enemy=persisted.combat.enemies[0];
 await f.send({type:'combatCommand',order:'mark',encounterId:persisted.combat.id,targetId:enemy.id,mark:'skull'});
 const restarted=new GameService(f.store,{contentVersion:'test',now:()=>now,seed:()=>747});
 const restored=(await restarted.snapshot(f.save.id)).state;
 assert.equal(restored.combat.command.paused,true);
 assert.equal(restored.combat.command.marks[enemy.id],'skull');
 const resumed=await restarted.command(f.save.id,{type:'combatCommand',order:'resume',encounterId:persisted.combat.id,requestId:'resume'});
 assert.equal(resumed.state.combat.command.paused,false);
 assert.equal(resumed.state.clock,persisted.clock);
});
