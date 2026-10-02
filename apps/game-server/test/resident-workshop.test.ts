import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {randomBytes} from 'node:crypto';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import type {Character} from '../../../packages/game-domain/src/model.ts';
import {runtimeVersion} from '../../simulation-host/src/version.ts';
import {SimulationDirectory} from '../../simulation-host/src/directory.ts';
import {createSimulationServer} from '../../simulation-host/src/server.ts';
import {SimulationClient} from '../src/simulation-client.ts';
import {ResidentGameService} from '../src/resident-game-service.ts';
import {createGameServer} from '../src/server.ts';
import {accounts,issueSession,appOrigin} from './session-fixture.ts';

test('resident HTTP workshop loads all professions and leatherworking and gathering can learn, produce and gain skill',async t=>{
 const store=residentStore(new MemoryStore());
 const domain=new GameService(store,{contentVersion:runtimeVersion.contentHash,seed:()=>283});
 const created=await domain.createAccount('workshop-account',{name:'制皮验收',classId:8,raceId:1},'create');
 const hero=created.account!.primaryCharacterId;
 // Only level and bankroll are fixtures; learning, purchasing and manufacturing
 // use authenticated HTTP commands and the real resident simulation worker.
 await store.transaction(async tx=>{
  const c=(await tx.get<Character>('characters',hero))!;c.rules.level=10;await tx.put('characters',c);
  await tx.put('wallets',{id:hero,characterId:hero,accountId:'workshop-account',balance:100000});
 });
 const characters=new ResidentCharacters(store,{version:runtimeVersion});
 const directory=new SimulationDirectory(new SimulationRepository(store,Date.now,characters.commit),{characters,workers:1});
 const token=randomBytes(32).toString('base64url');
 const simulation=createSimulationServer(directory,{token});simulation.server.listen(0,'127.0.0.1');await once(simulation.server,'listening');
 t.after(()=>simulation.close());
 const client=new SimulationClient({url:`http://127.0.0.1:${(simulation.server.address() as any).port}`,token});
 const service=new ResidentGameService(domain,client);
 const game=createGameServer({service,accounts,appOrigin});game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());
 const origin=`http://127.0.0.1:${(game.server.address() as any).port}`;
 const headers={origin:appOrigin,cookie:`wow_session=${await issueSession({sub:'workshop-account'})}`,'content-type':'application/json'};
 const read=async()=>{const response=await fetch(origin+'/api/game',{headers});assert.equal(response.status,200);return response.json() as Promise<any>;};
 const workshop=async(profession:string,extra='')=>{
  const response=await fetch(`${origin}/api/game/workshop?characterId=${hero}&profession=${profession}${extra}`,{headers});
  const body=await response.json() as any;assert.equal(response.status,200,JSON.stringify(body));return body;
 };
 for(const id of ['leatherworking','alchemy','blacksmithing','tailoring','engineering','enchanting','cooking','firstaid','mining']){
  const page=await workshop(id);assert.ok(page.total>0,id);assert.ok(page.recipes.length>0);assert.ok(page.recipes.length<=24);
  assert.ok(Number.isInteger(page.revision));assert.ok(page.contentVersion);assert.ok(page.recipes.every((r:any)=>!r.known));
 }
 assert.equal((await workshop('leatherworking','&filter=known')).total,0);
 const send=async(action:any)=>{
  const current=await read(),owner=current.execution;
  const response=await fetch(origin+'/api/game',{method:'POST',headers,body:JSON.stringify({...action,characterId:hero,requestId:randomBytes(12).toString('hex'),execution:{...owner,clientSequence:owner.clientSequence+1}})});
  const body=await response.json() as any;assert.equal(response.status,200,JSON.stringify(body));
 };
 const until=async(predicate:(state:any)=>boolean)=>{
  const deadline=Date.now()+10000;
  while(true){const current=await read();if(predicate(current.snapshot.player))return current.snapshot.player;assert.ok(Date.now()<deadline,'resident command settled');await delay(50);}
 };
 await send({type:'learnProfession',id:'leatherworking'});
 await until(s=>s.professions.leatherworking?.skill===1);
 const page=await workshop('leatherworking','&filter=known');assert.ok(page.total>0);
 const recipe=page.recipes.find((r:any)=>r.skill===1&&!r.tools.length&&r.skillUpChance===1);assert.ok(recipe);
 const before=await until(s=>s.professions.leatherworking.skill===1);
 await send({type:'craft',id:recipe.id,count:1,buyMissing:true});
 const after=await until(s=>s.professions.leatherworking.skill===2);
 assert.ok(after.bag.some((i:any)=>i.id===recipe.item&&i.count>=recipe.output));assert.ok(after.money<before.money);
 const updated=await workshop('leatherworking','&filter=known');assert.ok(updated.revision>=page.revision);
 await send({type:'learnProfession',id:'herbalism'});
 await until(s=>s.professions.herbalism?.skill===1);
 const resources=(await read()).snapshot.view.resources;
 const resource=resources.find((r:any)=>r.profession==='herbalism'&&r.available);assert.ok(resource);
 await send({type:'gatherResource',id:resource.id});
 const gathered=await until(s=>s.professions.herbalism.skill===2&&s.activity.type==='idle');
 assert.ok(gathered.bag.some((i:any)=>i.id===resource.item));
 await send({type:'gatherAll'});await until(s=>s.professions.herbalism.skill>=3);
 await send({type:'stop'});await until(s=>s.activity.type==='idle');
 const other={...headers,cookie:`wow_session=${await issueSession({sub:'not-owner'})}`};
 assert.notEqual((await fetch(`${origin}/api/game/workshop?characterId=${hero}&profession=leatherworking`,{headers:other})).status,200);
 assert.equal((await fetch(`${origin}/api/game/workshop?profession=leatherworking&version=wrong`,{headers})).status,409);
});
