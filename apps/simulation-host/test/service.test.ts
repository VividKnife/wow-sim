import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {SimulationClient} from '../../game-server/src/simulation-client.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';

test('independent host process: authenticated gateway, resident execution, durable input, restore, capacity', {timeout:30_000},async()=>{
 // Build the CPU-heavy fixtures before opening an HTTP keep-alive connection.
 const state=localScenarios().dungeon;
 const token=randomBytes(32).toString('base64url');
 const processHost=fork(new URL('./support/service-process.ts',import.meta.url),[],{env:{...process.env,SIMULATION_TOKEN:token},stdio:['ignore','ignore','pipe','ipc']});
 let stderr='';processHost.stderr!.on('data',chunk=>{stderr+=chunk;});
 const exited=once(processHost,'exit');
 try{
  const ready=await Promise.race([
   once(processHost,'message').then(([value])=>value as {port:number;pid:number}),
   exited.then(()=>{throw new Error('Host exited during startup: '+stderr);}),
  ]);
  assert.notEqual(ready.pid,process.pid);
  const url=`http://127.0.0.1:${ready.port}`,client=new SimulationClient({url,token});
  const unauthorized=await fetch(url+'/rpc',{method:'POST',body:JSON.stringify({operation:'inspect'})});
  assert.equal(unauthorized.status,403);
  const malformed=await fetch(url+'/rpc',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({operation:'inspect',accountId:'forged'})});
  assert.equal(malformed.status,400);
  const admission={instanceId:'http-room',state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}]};
  const [first,duplicate]=await Promise.all([client.open(admission),client.open(admission)]);
  assert.deepEqual(first,duplicate);assert.equal(first.ownerEpoch,1);
  await assert.rejects(client.open({...admission,controllers:[]}),/different state/);
  const initial=await client.project('http-room',true);
  await delay(220);
  const running=await client.project('http-room');
  assert.ok(running.simTime>initial.simTime,'the host advances while the gateway is idle');
  assert.equal(running.baselineSequence,initial.baselineSequence);
  assert.equal(running.streamSequence,initial.streamSequence+1);
  assert.equal('rngState' in running,false);assert.equal('state' in running,false);
  const input={instanceId:'http-room',actorId:state.id,controllerGeneration:1,clientSequence:1,requestId:'pause',command:{kind:'pause' as const,encounterId:state.combat.id}};
  await assert.rejects(client.input('bob',input),/Controller fenced/);
  const receipt=await client.input('alice',input);
  assert.equal(receipt.status,'applied');assert.equal(receipt.durable,true);
  assert.deepEqual(await client.input('alice',input),receipt);
  await client.open({...admission,instanceId:'http-room-2'});
  await assert.rejects(client.open({...admission,instanceId:'too-many'}),/capacity/);
  assert.equal((await client.inspect()).instances,2);
  await client.remove('http-room');
  const restored=await client.open(admission);
  assert.equal(restored.ownerEpoch,2);
  assert.deepEqual(await client.input('alice',input),receipt,'request identities survive a resident unload/reload');
  assert.equal((await client.project('http-room',true)).ownerEpoch,2);
  await client.remove('http-room');await client.remove('http-room-2');
  assert.equal((await client.inspect()).instances,0);
 }finally{
  if(processHost.exitCode===null&&processHost.signalCode===null)processHost.kill('SIGTERM');
  await exited;
 }
 assert.equal(stderr,'');
});

test('service credentials cannot be sent over a remote plaintext transport',()=>{
 assert.throws(()=>new SimulationClient({url:'http://remote.example',token:'a'.repeat(32)}),/HTTPS/);
 assert.throws(()=>new SimulationClient({url:'http://127.0.0.1',token:'short'}),/token/);
});
