import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {view} from '../src/rules/engine.js';

test('a fresh account earns training money through quests and kills and retains training after service restart',async(t)=>{
 const store=new MemoryStore();let now=1000,sequence=0;
 const options={contentVersion:'training-validation',now:()=>now,seed:()=>12345,id:()=>`training-${++sequence}`};
 const service=new GameService(store,options);
 let snapshot=await service.createAccount('training-account',{name:'学习者',classId:8,raceId:1},'create');
 const command=async(value:Record<string,unknown>)=>snapshot=await service.command('training-account',{...value,requestId:`request-${++sequence}`});
 assert.equal(snapshot.state.money,0);
 await command({type:'accept',id:783});await command({type:'turnin',id:783});
 await command({type:'accept',id:7});await command({type:'travel',to:'northwood'});
 now+=snapshot.state.activity.endsAt-snapshot.state.clock;
 assert.deepEqual((await service.work()).errors,[]);
 await command({type:'hunt',id:6});
 for(let step=0;step<60;step++){
  now+=10000;assert.deepEqual((await service.work()).errors,[]);
  snapshot=await service.snapshot('training-account');
  if(view(snapshot.state).quests.find((q:any)=>q.id===7)?.complete)break;
 }
 await command({type:'stop'});
 assert.ok(snapshot.state.totals.kills>0);
 await command({type:'travel',to:'northshire'});
 now+=snapshot.state.activity.endsAt-snapshot.state.clock;
 assert.deepEqual((await service.work()).errors,[]);
 snapshot=await service.snapshot('training-account');
 const skill=view(snapshot.state).skills.find((a:any)=>a.canTrain&&a.costCopper>0);
 assert.ok(skill,'natural quest rewards must fund a trainable spell');
 const before=snapshot.state.money;
 const payload={type:'train',id:skill.spellId,requestId:'paid-training'};
 snapshot=await service.command('training-account',payload);
 assert.ok(snapshot.state.learned.includes(skill.spellId));
 assert.equal(snapshot.state.money,before-skill.costCopper);
 const restarted=new GameService(store,options);
 const fresh=await restarted.snapshot('training-account');
 assert.ok(fresh.state.learned.includes(skill.spellId));
 assert.equal(fresh.state.money,before-skill.costCopper);
 const replay=await restarted.command('training-account',payload);
 assert.equal(replay.state.money,fresh.state.money);
 assert.equal(replay.state.learned.filter((id:number)=>id===skill.spellId).length,1);
 t.diagnostic(JSON.stringify({level:fresh.state.level,kills:fresh.state.totals.kills,completedQuests:Object.keys(fresh.state.completed),spellId:skill.spellId,costCopper:skill.costCopper,moneyBefore:before,moneyAfter:fresh.state.money}));
});
