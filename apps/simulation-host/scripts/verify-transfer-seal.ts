import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {PostgresStore} from '../../../packages/persistence/src/postgres.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {residentStore,withResidentAuthority} from '../../../packages/game-domain/src/resident-store.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {residentPartyFixture} from '../../../packages/game-domain/test/support/resident-party.ts';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import {runtimeVersion} from '../src/version.ts';

const database=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost','[::1]'].includes(database.hostname))throw new Error('Transfer verification requires local PostgreSQL');
const schema='sim2_transfer_'+randomBytes(8).toString('hex');
const setup=new pg.Pool({connectionString:database.href,connectionTimeoutMillis:5000,query_timeout:10000});
await setup.query(`CREATE SCHEMA ${schema}`);
database.searchParams.set('options','-c search_path='+schema);
const leftPool=new pg.Pool({connectionString:database.href,max:4,connectionTimeoutMillis:5000,query_timeout:10000});
const rightPool=new pg.Pool({connectionString:database.href,max:4,connectionTimeoutMillis:5000,query_timeout:10000});
const left=residentStore(new PostgresStore(leftPool)),right=residentStore(new PostgresStore(rightPool));
const host=new SimulationHost(),replacementHost=new SimulationHost();
let session:SimulationSession|undefined,unblock=()=>{},racing:Promise<unknown>|undefined;
const began=Date.now();
try{
 await new PostgresStore(leftPool).initialize();
 const {admission,ids}=await residentPartyFixture(left,Date.now());
 const characters=new ResidentCharacters(left,{version:runtimeVersion});
 const repo=new SimulationRepository(left,Date.now,characters.commit),other=new SimulationRepository(right,Date.now,characters.commit);
 session=await SimulationSession.open(host,repo,'source',admission,{checkpointMs:10000});
 const prepared=await session.prepareTransfer('verified-transfer');
 const assets=()=>left.read(async tx=>({items:await tx.list('items'),wallets:await tx.list('wallets'),ledger:await tx.list('ledger')}));
 const before=await assets();
 await assert.rejects(other.commit(prepared.owner,prepared.owner.commitSequence+1,prepared.checkpoint),/sealed/);
 await assert.rejects(right.transaction(tx=>withResidentAuthority(tx,prepared.owner,()=>tx.put('wallets',{
  id:ids[1],characterId:ids[1],accountId:'bob',balance:999999
 }))),/失效/);
 assert.deepEqual(await other.seal(prepared.owner,'verified-transfer'),prepared.owner);
 await left.transaction(tx=>tx.put('simulation_owners',{...prepared.owner,expiresAt:Date.now()-1}));
 const replacement=await other.acquire(admission.instanceId,'replacement');
 await assert.rejects(session.abortTransfer('verified-transfer'),/fenced/);
 assert.equal(host.inspect()[0].instances,0);
 await replacementHost.restore(prepared.checkpoint,replacement.epoch,{realtime:false});
 await other.commit(replacement,replacement.commitSequence+1,await replacementHost.checkpoint(admission.instanceId));
 assert.deepEqual(await assets(),before,'real PostgreSQL takeover must not duplicate or remove committed participant assets');

 // A writer that read the old ownership row before sealing must still lose.
 // PostgreSQL's serializable retry must re-read the seal, not publish its stale
 // transaction snapshot after the control plane has fenced the owner.
 let entered=()=>{},first=true;
 const enteredPromise=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{unblock=resolve;});
 const raceRepo=new SimulationRepository(left,Date.now,async tx=>{
  await tx.put('wallets',{id:'race-probe',characterId:'race-probe',balance:1});
  if(first){first=false;entered();await gate;}
 });
 const raceOwner=await other.acquire('race','source-race');
 const checkpoint={instanceId:'race',ownerEpoch:raceOwner.epoch,...runtimeVersion};
 await other.commit(raceOwner,1,checkpoint);raceOwner.commitSequence=1;
 racing=raceRepo.commit(raceOwner,2,checkpoint);
 await enteredPromise;
 await other.seal(raceOwner,'concurrent-seal');
 unblock();
 await assert.rejects(racing,/sealed/);
 assert.equal(await left.read(tx=>tx.get('wallets','race-probe')),null);
 assert.equal((await other.load('race'))!.sequence,1);

 const output='.cache/qa/transfer-seal-'+Date.now()+'.json';
 const report={schema,...runtimeVersion,durationMs:Date.now()-began,node:process.version,
  result:'passed',connections:'Two independent PostgreSQL pools',
  assertions:['sealed owner rejects checkpoint from another connection','sealed owner rejects direct participant wallet write',
   'stale abort cannot resume after takeover','takeover preserves both participants items/wallets/ledger',
   'in-flight pre-seal writer rolls back and re-reads the seal on serializable retry'],
  limitations:['local isolated schema, retained for inspection','no production join/leave UI path exercised','no capacity claim']};
 await mkdir('.cache/qa',{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({result:'passed',schema,report:output,durationMs:report.durationMs}));
}finally{
 unblock();await racing?.catch(()=>{});await session?.close().catch(()=>{});
 await host.close();await replacementHost.close();await Promise.allSettled([left.close(),right.close(),setup.end()]);
}
