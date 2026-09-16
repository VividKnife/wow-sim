import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeltaEvent,applyGameEvent,type GameSnapshotEvent} from '../src/events.ts';
import {GameService} from '../../game-domain/src/service.ts';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {buildGameResponse} from '../../game-domain/src/rules/server-response.js';
import {CONTENT_VERSION} from '../../game-domain/src/rules/client-content.js';

test('real shared battle projections round-trip through consecutive delta events',async()=>{
 const service=new GameService(new MemoryStore(),{contentVersion:CONTENT_VERSION,now:()=>1000,seed:()=>12345});
 await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create');
 const formed=await service.command('a',{type:'createInstance',requestId:'form'});
 await service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});
 const project=async():Promise<GameSnapshotEvent>=>{
  const result=await service.snapshot('a');
  return{type:'snapshot',sequence:result.instance?.sequence??0,...buildGameResponse(result.state,result.revision,result)} as GameSnapshotEvent;
 };
 let previous=await project();
 for(const now of [2000,4000]){
  assert.deepEqual((await service.work(now)).errors,[]);
  const next=await project(),delta=createDeltaEvent(previous,next);
  const encoded=JSON.stringify(delta);assert.equal(encoded.includes('rngState'),false);assert.equal(encoded.includes('engineActivity'),false);
  assert.deepEqual(applyGameEvent(previous,JSON.parse(encoded)),JSON.parse(JSON.stringify(next)));
  assert.ok(Buffer.byteLength(encoded)<Buffer.byteLength(JSON.stringify(next)));
  previous=next;
 }
});
