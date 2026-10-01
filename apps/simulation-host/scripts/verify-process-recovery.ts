import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {SimulationClient} from '../../game-server/src/simulation-client.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
import {PostgresStore} from '../../../packages/persistence/src/postgres.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {context,persistCharacter} from '../../../packages/game-domain/src/context.ts';
import {companionSkills} from '../../../packages/game-domain/src/rules/party.js';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import type {Character} from '../../../packages/game-domain/src/model.ts';
import type {SimulationCommand} from '../../../packages/protocol/src/simulation.ts';

// Opt-in integration check against a local PostgreSQL server. Each run owns a
// fresh schema; existing schemas and game data are never updated or dropped.
const database=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost','[::1]'].includes(database.hostname))throw new Error('Recovery verification requires local PostgreSQL');
const schema='sim2_recovery_'+randomBytes(8).toString('hex');
const setup=new pg.Pool({connectionString:database.href,connectionTimeoutMillis:5000,query_timeout:5000});
await setup.query(`CREATE SCHEMA ${schema}`);
database.searchParams.set('options','-c search_path='+schema);
const sql=new pg.Pool({connectionString:database.href,connectionTimeoutMillis:5000,query_timeout:5000});
const token=randomBytes(32).toString('base64url');
const reservation=createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const address=reservation.address();if(!address||typeof address==='string')throw new Error('No port');
const port=address.port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));
const client=new SimulationClient({url:`http://127.0.0.1:${port}`,token});
let child:ChildProcess|undefined,exit:Promise<unknown>|undefined,errors='';
async function start(){
 child=fork(new URL('../src/main.ts',import.meta.url),[],{env:{...process.env,DATABASE_URL:database.href,SIMULATION_TOKEN:token,SIMULATION_PORT:String(port)},stdio:['ignore','pipe','pipe','ipc']});
 exit=once(child,'exit');
 child.stderr!.on('data',chunk=>{errors+=chunk;});
 let output='';
 let timer:NodeJS.Timeout|undefined;
 try{await Promise.race([
  new Promise<void>(resolve=>child!.stdout!.on('data',chunk=>{output+=chunk;if(output.includes('Simulation host listening'))resolve();})),
  exit.then(()=>{throw new Error('Host startup failed: '+errors);}),
  new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Host startup timed out')),15_000);}),
 ]);}finally{if(timer)clearTimeout(timer);}
}
async function stop(signal:NodeJS.Signals){
 if(child&&child.exitCode===null&&child.signalCode===null)child.kill(signal);
 await exit;
}
const began=Date.now();
try{
 const store=new PostgresStore(sql);await store.initialize();
 const guarded=residentStore(store),game=new GameService(guarded,{contentVersion:'recovery-fixture',seed:()=>283});
 const actor=(await game.createAccount('qa-account',{name:'恢复验收法师',classId:8,raceId:1},'create')).state;
 await guarded.transaction(async tx=>{
  const c=(await tx.get<Character>('characters',actor.id))!,s=await context(tx,c,Date.now(),false);
  s.level=20;s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
  await persistCharacter(tx,c,s,s.wallAt,'test-level');
 });
 const state=localScenarios().dungeon;
 const admission={instanceId:'recovery-room',state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}]};
 await start();
 const initial=await client.open(admission);
 const input={instanceId:admission.instanceId,actorId:state.id,controllerGeneration:1,clientSequence:1,requestId:'durable-pause',command:{kind:'pause' as const,encounterId:state.combat.id}};
 const receipt=await client.input('alice',input);assert.equal(receipt.durable,true);assert.equal(receipt.status,'applied');
 const characterRoom=await client.openCharacter('qa-account',actor.id);
 let sequence=0;
 const intent=(command:SimulationCommand)=>({instanceId:characterRoom.instanceId,actorId:actor.id,controllerGeneration:1,
  clientSequence:++sequence,requestId:`intent-${sequence}`,command});
 const send=async(command:SimulationCommand)=>{const input=intent(command),receipt=await client.input('qa-account',input);
  assert.equal(receipt.status,'applied',receipt.reason);assert.equal(receipt.durable,true);return {input,receipt};};
 await send({kind:'questAccept',questId:783});await send({kind:'questTurnIn',questId:783,choiceId:null});
 await send({kind:'hunt',monsterId:299});await delay(6100);await send({kind:'stop'});
 const characterCheckpoint=async()=>JSON.parse((await sql.query('SELECT data FROM simulation_checkpoints WHERE id=$1',[characterRoom.instanceId])).rows[0].data.encodedCheckpoint);
 let hunted=await characterCheckpoint();assert.ok(hunted.state.totals.kills>0);assert.ok(hunted.state.pending.length>0);
 if(hunted.state.combat)await send({kind:'pause',encounterId:hunted.state.combat.id});
 const dropIds=hunted.state.pending.map((item:any)=>item.uid);
 const pickup=await send({kind:'loot',itemIds:dropIds});
 hunted=await characterCheckpoint();
 const gameAssets=()=>guarded.read(async tx=>({character:await tx.get<Character>('characters',actor.id),
  wallet:await tx.get('wallets',actor.id),items:await tx.list('items',{ownerCharacterId:actor.id}),ledger:await tx.list('ledger',{characterId:actor.id})}));
 const committedAssets=await gameAssets();assert.ok(committedAssets.character!.rules.completed[783]);
 for(const id of dropIds)assert.ok(committedAssets.items.some(item=>item.id===id&&item.container==='bag'));
 const before=(await sql.query('SELECT data FROM simulation_checkpoints WHERE id=$1',[admission.instanceId])).rows[0].data;
 const checkpoint=JSON.parse(before.encodedCheckpoint);assert.equal(checkpoint.inputSequence,1);
 await stop('SIGKILL');await start();
 await assert.rejects(client.open(admission),/held/,'a replacement cannot steal the unexpired lease');
 await assert.rejects(client.openCharacter('qa-account',actor.id),/held/);
 const owner=(await sql.query('SELECT data FROM simulation_owners WHERE id=$1',[admission.instanceId])).rows[0].data;
 const characterOwner=(await sql.query('SELECT data FROM simulation_owners WHERE id=$1',[characterRoom.instanceId])).rows[0].data;
 // Wait out the real durable lease, without manipulating timestamps in SQL.
 await delay(Math.max(0,Math.max(owner.expiresAt,characterOwner.expiresAt)-Date.now()+100));
 const restored=await client.open(admission);assert.equal(restored.ownerEpoch,initial.ownerEpoch+1);
 assert.deepEqual(await client.input('alice',input),receipt);
 const after=(await sql.query('SELECT data FROM simulation_checkpoints WHERE id=$1',[admission.instanceId])).rows[0].data;
 const recovered=JSON.parse(after.encodedCheckpoint);
 assert.equal(recovered.inputSequence,1);assert.equal(recovered.state.rngState,checkpoint.state.rngState);
 assert.equal(recovered.state.clock,checkpoint.state.clock,'paused simulation does not advance during recovery');
 assert.equal((await client.project(admission.instanceId,true)).ownerEpoch,restored.ownerEpoch);
 const characterRestored=await client.openCharacter('qa-account',actor.id);
 assert.equal(characterRestored.ownerEpoch,characterRoom.ownerEpoch+1);
 assert.deepEqual(await client.input('qa-account',pickup.input),pickup.receipt);
 const recoveredAssets=await gameAssets();
 assert.deepEqual(recoveredAssets.items,committedAssets.items);assert.deepEqual(recoveredAssets.wallet,committedAssets.wallet);assert.deepEqual(recoveredAssets.ledger,committedAssets.ledger);
 assert.deepEqual(recoveredAssets.character!.rules.completed,committedAssets.character!.rules.completed);
 assert.equal(recoveredAssets.character!.rules.xp,committedAssets.character!.rules.xp);
 await client.remove(admission.instanceId);await client.remove(characterRoom.instanceId);await stop('SIGTERM');
 assert.equal(errors,'');
 const report={passed:true,at:new Date().toISOString(),schema,elapsedMs:Date.now()-began,originalEpoch:initial.ownerEpoch,recoveredEpoch:restored.ownerEpoch,
  character:{id:actor.id,instanceId:characterRoom.instanceId,originalEpoch:characterRoom.ownerEpoch,recoveredEpoch:characterRestored.ownerEpoch,questId:783,dropIds},
  checks:['real PostgreSQL checkpoint','SIGKILL after durable receipt','unexpired lease rejects takeover','actual lease expiry','new process restores','duplicate input returns original receipt','RNG and paused clock preserved',
   'database character admission','server Worker hunting without polling','quest and loot assets commit with checkpoint','pickup identities survive process death','repeated pickup cannot duplicate ledger, items, wallet or quest XP'],
  limits:['Personal residency only; multiplayer asset binding still pending','No public WebSocket/client gameplay test','No capacity claim']};
 await mkdir('.cache',{recursive:true});await writeFile('.cache/simulation-process-recovery.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{
 await stop('SIGTERM');await sql.end();await setup.end();
}
