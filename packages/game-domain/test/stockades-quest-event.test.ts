import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {stats} from '../src/rules/character.js';
import {rebaseSimulation} from '../src/context.ts';
import type {Character,Rules} from '../src/model.ts';

async function setup(){
 const store=new MemoryStore();let now=1000,request=0;
 const options={contentVersion:'test',now:()=>now,seed:()=>437};let service=new GameService(store,options);
 const created=await service.createAccount('a',{name:'花园调查',classId:8,raceId:1},'create'),id=created.account.primaryCharacterId;
 const edit=async(mutate:(s:Rules)=>void)=>store.transaction(async tx=>{const c=(await tx.get<Character>('characters',id))!;mutate(c.rules);await tx.put('characters',c);});
 await edit(s=>{s.level=40;s.location='keep';s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.quests[434]={kills:{},event:false,acceptedAt:s.clock,expiresAt:0};});
 return{store,id,edit,restart:()=>{service=new GameService(store,options);},send:(command:Rules)=>service.command('a',{...command,requestId:`event-${++request}`}),snapshot:()=>service.snapshot('a'),work:async(ms:number)=>{now+=ms;return service.work();}};
}

test('personal activity worker restores the Attack dialogue and persists real combat completion',async()=>{
 const game=await setup();const started=await game.send({type:'stockadesQuestStart',questId:434});
 assert.equal(started.state.stockadesQuestEvent.stage,'disguise');game.restart();
 for(let i=0;i<23;i++)assert.deepEqual((await game.work(1000)).errors,[]);
 const fighting=await game.snapshot();assert.equal(fighting.state.stockadesQuestEvent.stage,'combat');assert.deepEqual(fighting.state.combat.enemies.map((e:Rules)=>e.entry),[1754,1755]);
 // Only fixture damage is controlled: the worker must perform kill credit,
 // combat finalization, event completion and persistence itself.
 await game.edit(s=>{for(const enemy of s.combat.enemies)enemy.hp=0;});game.restart();
 assert.deepEqual((await game.work(1000)).errors,[]);game.restart();
 const finished=await game.snapshot();assert.equal(finished.state.stockadesQuestEvent,undefined);assert.equal(finished.state.quests[434].event,true);assert.equal(finished.state.quests[434].kills[1754],1);assert.equal(finished.state.quests[434].kills[1755],1);assert.equal(finished.state.stockadesQuestEventLast.outcome,'complete');assert.equal(finished.state.completed[434],undefined);
 await assert.rejects(game.send({type:'stockadesQuestStart',questId:434}));
});

test('worker persists event death failure and restart permits a fresh attempt after recovery',async()=>{
 const game=await setup();const started=await game.send({type:'stockadesQuestStart',questId:434});const attempt=started.state.stockadesQuestEvent.attempt;
 await game.edit(s=>{s.hp=0;});game.restart();assert.deepEqual((await game.work(5000)).errors,[]);game.restart();
 const failed=await game.snapshot();assert.equal(failed.state.stockadesQuestEvent,undefined);assert.equal(failed.state.stockadesQuestEventLast.outcome,'failed');assert.equal(failed.state.quests[434].event,false);
 await game.edit(s=>{s.hp=stats(s).maxHp;});
 const retried=await game.send({type:'stockadesQuestStart',questId:434});assert.ok(retried.state.stockadesQuestEvent.attempt>attempt);assert.equal(retried.state.stockadesQuestEvent.stage,'disguise');
});

test('event stage deadline follows the character simulation clock when rebased',async()=>{
 const game=await setup(),started=await game.send({type:'stockadesQuestStart',questId:434});
 const shifted=rebaseSimulation(structuredClone(started.state),started.state.clock+100000);
 assert.equal(shifted.stockadesQuestEvent.endsAt,shifted.activity.endsAt);
});
