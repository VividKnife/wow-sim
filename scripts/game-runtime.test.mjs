import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runGameRuntime} from './game-runtime.mjs';

for(const mode of ['normal','crash','fail','fail-api','timeout','stubborn'])test(`combined runtime lifecycle: ${mode}`,async t=>{
 const directory=await mkdtemp(join(tmpdir(),'wow-runtime-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'events'),signals=new EventEmitter(),children=[],environments=[];
 const result=runGameRuntime({environment:{...process.env,SIMULATION_URL:'',SIMULATION_TOKEN:'',RUNTIME_TEST_LOG:file,RUNTIME_TEST_MODE:mode},signals,startupMs:mode==='timeout'?300:5000,shutdownMs:100,
  launch:(role,env)=>{
   environments.push(env);const child=fork(new URL('./test-support/runtime-child.mjs',import.meta.url),[role],{env,stdio:['ignore','ignore','ignore','ipc']});children.push(child);
   if(role==='api'&&['normal','stubborn'].includes(mode))child.once('message',()=>setTimeout(()=>signals.emit('SIGTERM'),10));
   return child;
  }});
 if(['fail','fail-api','timeout'].includes(mode))await assert.rejects(result,/startup/);else assert.equal(await result,['crash','stubborn'].includes(mode)?1:0);
 assert.ok(children.every(child=>child.exitCode!==null||child.signalCode!==null));
 const events=(await readFile(file,'utf8')).trim().split('\n');assert.equal(events[0],'simulation:start');
 if(mode==='normal')assert.deepEqual(events,['simulation:start','api:start','api:stop','simulation:stop']);
 if(['fail','timeout'].includes(mode))assert.ok(!events.includes('api:start'));
 assert.ok(environments.every(env=>env.SIMULATION_TOKEN===environments[0].SIMULATION_TOKEN));
 assert.match(environments[0].SIMULATION_TOKEN,/^[A-Za-z0-9_-]{32,128}$/);
 assert.equal(signals.listenerCount('SIGTERM'),0);
});
test('combined role rejects remote endpoints before spawning',async()=>{
 await assert.rejects(runGameRuntime({environment:{SIMULATION_URL:'https://remote.test'},launch:()=>assert.fail('must not launch')}),/local SIMULATION_URL/);
});
