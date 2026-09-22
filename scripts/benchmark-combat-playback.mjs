// Synthetic in-memory characters only. Never connects to player saves.
import {gzipSync} from 'node:zlib';
import {cpus} from 'node:os';
import assert from 'node:assert/strict';
import {createGame,act,stats,advance} from '../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../packages/game-domain/src/rules/combat.js';
import {abilities} from '../packages/game-domain/src/rules/catalog.js';
import {simulateCombatRecording} from '../packages/game-domain/src/combat-playback.ts';
import {buildGameResponse} from '../packages/game-domain/src/rules/server-response.js';

let state=createGame('回放基准',283,0);
state.level=20;state.learned=abilities.filter(a=>a.requiredLevel<=20).map(a=>a.spellId);
state.hp=stats(state).maxHp;state.mana=stats(state).maxMana;
state.completed[900001]=1;state.location='stormwind';
 for(const id of ['warrior','priest','rogue','mage'])state=act(state,{type:'recruit',id},0);
startCombat(state,[636,636,1729],true);
const coldStart=performance.now();
const result=simulateCombatRecording(state,{id:'benchmark',contentVersion:'test'});
const coldMs=performance.now()-coldStart,json=JSON.stringify(result.recording),samples=[];
for(let i=0;i<3;i++){
 const start=performance.now();
 const repeated=simulateCombatRecording(state,{id:'benchmark',contentVersion:'test'});
 samples.push(performance.now()-start);
 // Equality checking is outside the timed section.
 assert.deepEqual(repeated,result);
}
const recordingMs=samples.reduce((sum,value)=>sum+value,0)/samples.length;
let current=state,bytes=0,snapshots=0;const responses=[];
const liveStart=performance.now();
while(current.wallAt<result.recording.endsAt){
 current=advance(current,Math.min(current.wallAt+200,result.recording.endsAt)).state;
 const response=JSON.stringify(buildGameResponse(current,++snapshots,{scope:'combat'}));
 bytes+=Buffer.byteLength(response);responses.push(response);
}
const liveMs=performance.now()-liveStart;
console.log(JSON.stringify({cpu:cpus()[0]?.model,node:process.version,durationMs:result.recording.endsAt,recorded:{computeMs:+recordingMs.toFixed(2),coldMs:+coldMs.toFixed(2),samplesMs:samples.map(value=>+value.toFixed(2)),frames:result.recording.frames.length,bytes:Buffer.byteLength(json),gzipBytes:gzipSync(json).length},realtime:{computeAndSerializeMs:+liveMs.toFixed(2),snapshots,bytes,gzipBytes:responses.reduce((n,response)=>n+gzipSync(response).length,0)},note:'Synthetic fixture; excludes database/network and compression CPU. Recording computeMs averages three runs after one warmup, including delta construction. Live timing is one run including response serialization. Not a capacity test.'},null,2));
