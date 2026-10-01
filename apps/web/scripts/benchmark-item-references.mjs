import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createItemReferenceReader} from '../lib/content-loader.js';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
import {ResidentInstance} from '../../simulation-host/src/instance.ts';
let source=execFileSync('git',['show',`${process.argv[2]||'c69a0ee2'}:apps/web/lib/content-loader.js`],{encoding:'utf8'});
source=source.replaceAll("'../../../packages/sim-core/src/content-request.js'",JSON.stringify(new URL('../../../packages/sim-core/src/content-request.js',import.meta.url).href)).replaceAll("'./auction-content.js'",JSON.stringify(new URL('../lib/auction-content.js',import.meta.url).href));
const {referencedItemIds:oldRead}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const state=localScenarios().raid;
const room=new ResidentInstance({instanceId:'reference-bench',ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'preview',generation:1,canPause:true}]});
const snapshot=room.presentation('preview',state.id,'full').snapshot;
const snapshots=Array.from({length:100},(_,i)=>({...snapshot,player:{...snapshot.player,hp:Math.max(1,snapshot.player.hp-i%100)}}));
const result={node:process.version,platform:process.platform,arch:process.arch,scenario:'40-person raid, 100 copy-on-write health updates; item lookup only',rounds:[]};
function run(read){const at=performance.now();for(const snapshot of snapshots)read(snapshot);return performance.now()-at;}
const reader=createItemReferenceReader();assert.deepEqual(reader(snapshot),oldRead(snapshot));
for(let i=0;i<9;i++){const fresh=createItemReferenceReader();const pair=i%2?[run(fresh),run(oldRead)]:[run(oldRead),run(fresh)];if(i>1)result.rounds.push(i%2?{before:pair[1],after:pair[0]}:{before:pair[0],after:pair[1]});}
const median=key=>result.rounds.map(r=>r[key]).sort((a,b)=>a-b)[3];result.medianMs={before:median('before'),after:median('after')};
console.log(JSON.stringify(result,null,2));
