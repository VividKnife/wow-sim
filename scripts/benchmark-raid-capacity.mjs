// In-memory research fixture: no database, saved accounts, or production changes.
// 40-person fixtures bypass recruitment capacity, retaining the current rules.
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Session} from 'node:inspector/promises';
import {advanceOwned,view} from '../packages/game-domain/src/rules/engine.js';
import {createMoltenCoreDemo,defaultRaidTactics} from '../packages/game-domain/src/molten-core-demo.ts';
import {beginMoltenCoreBattle} from '../packages/game-domain/src/rules/molten-core-battle.js';
import {combatMembers} from '../packages/game-domain/src/rules/combat-members.js';
import {combatRole} from '../packages/game-domain/src/rules/combat-roles.js';
import {enterGoldRaid,goldRaidAction,goldRaidView} from '../packages/game-domain/src/rules/gold-raid.js';
import {prepareGoldNpc} from '../packages/game-domain/src/rules/gold-raid-npcs.js';
import {stockGoldReagents} from '../packages/game-domain/src/rules/gold-raid-reagents.js';
import {battlePresentation} from '../packages/game-domain/src/rules/battle-presentation.js';
import {projectCombatPlayback,projectClientSnapshot} from '../packages/game-domain/src/rules/client-snapshot.ts';
import {projectLocalCheckpoint} from '../packages/game-domain/src/rules/local-checkpoint.js';
import {combatCommandView} from '../packages/game-domain/src/rules/combat-command.js';
import {raidCommandView} from '../packages/game-domain/src/rules/raid-command.js';

const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.split('=')[1]??fallback;
const duration=Number(arg('duration','15000')),runs=Number(arg('runs','3'));
const sizes=arg('sizes','25,40').split(',').map(Number);
const bosses=arg('bosses','lucifron,majordomo').split(',');
const rosters=arg('rosters','demo,gold').split(',');
// Explicit scratch cache for profiling the same synthetic state. Use a fresh
// directory after rule/data changes; omitted by default to avoid stale fixtures.
const fixtureDir=arg('fixtures','');
if(fixtureDir)mkdirSync(fixtureDir,{recursive:true});
assert.ok(Number.isSafeInteger(duration)&&duration>=1000&&duration%100===0);
assert.ok(Number.isSafeInteger(runs)&&runs>0);
assert.ok(sizes.every(n=>n===25||n===40));
const round=n=>Math.round(n*100)/100;
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const summary=xs=>{if(!xs.length)return {mean:null,p95:null,max:null};const sorted=[...xs].sort((a,b)=>a-b);return {mean:round(sum(xs)/xs.length),p95:round(sorted[Math.ceil(sorted.length*.95)-1]),max:round(sorted.at(-1))};};
const hash=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');

function fixture(roster,size,boss){
 const cache=fixtureDir&&join(fixtureDir,`${roster}-${size}-${boss}.json`);
 if(cache&&existsSync(cache))return JSON.parse(readFileSync(cache,'utf8'));
 const s=createMoltenCoreDemo().state;
 if(roster==='gold'){
  s.party=[];
  enterGoldRaid(s);goldRaidAction(s,{type:'goldPublish'});goldRaidAction(s,{type:'goldRecommend'});
  const extras=s.goldRaid.applicants.filter(c=>!s.goldRaid.selected.includes(c.id));
  goldRaidAction(s,{type:'goldLaunch'});
  if(size===40){
   for(const [role,count] of [['tank',1],['healer',3],['damage',11]]){
    const candidates=extras.filter(c=>role==='damage'?!['tank','healer'].includes(combatRole(c)):combatRole(c)===role).slice(0,count);
    assert.equal(candidates.length,count,`insufficient ${role} applicants`);
    s.party.push(...candidates);
   }
   s.goldRaid.seats=[s,...s.party].map(c=>({id:c.id,name:c.name,role:combatRole(c),core:!c.goldNpc}));
  }
  for(const c of s.party){stockGoldReagents(s,c);prepareGoldNpc(s,c);}
  s.goldRaid.phase='combat';s.goldRaid.activeBoss=boss;
 }else if(roster==='demo'){
  if(size===40){
   // Add one tank, three healers, eleven damage dealers with existing loadouts.
   const original=[s,...s.party];
   const extra=[original[1],...original.filter(c=>combatRole(c)==='healer').slice(0,3),...original.filter(c=>!['tank','healer'].includes(combatRole(c))).slice(0,11)];
   for(const [i,source]of extra.entries()){
    const c=structuredClone(source===s?{...s,party:[]}:source);
    c.id=`capacity-extra-${i}`;c.name+=` ${i}`;c.raidMainTank=false;
    for(const e of Object.values(c.equipment))e.uid=`${c.id}:${e.uid}`;
    if(c.pet){c.pet.id=`${c.id}:pet`;c.pet.ownerId=c.id;}
    s.party.push(c);
   }
  }
 }else throw new Error(`unknown roster: ${roster}`);
 assert.equal(s.party.length+1,size);
 assert.equal(new Set([s,...s.party].map(c=>c.id)).size,size);
 beginMoltenCoreBattle(s,boss,defaultRaidTactics);
 // Preserve normal enemy health/damage; report deaths and encounter completion.
 if(cache)writeFileSync(cache,JSON.stringify(s));
 return s;
}

function run(initial){
 const s=structuredClone(initial),timings={tick:[],frame:[],aux:[],transportClone:[],checkpoint:[],slice:[]};
 let cachedRaid=null,minAlive=s.party.length+1,maxUnits=combatMembers(s).length,activeTicks=0;
 const cpuStart=process.cpuUsage(),start=performance.now();
 for(let at=50;at<=duration;at+=50){
  const sliceStart=performance.now(),tickDue=s.nextTick<=at,tickStart=performance.now();
  const result=advanceOwned(s,at,{maxTicks:20});
  assert.ok(result.complete);
  if(tickDue)timings.tick.push(performance.now()-tickStart);
  if(at%100===0){
   if(s.combat)activeTicks++;
   const frameStart=performance.now();
   const frame=projectCombatPlayback(s,battlePresentation(s),s.wallAt);
   timings.frame.push(performance.now()-frameStart);
   if(!cachedRaid||at%1000===0){
    const auxStart=performance.now();
    cachedRaid={combatCommand:combatCommandView(s),raidCommand:raidCommandView(s),...(s.goldRaid?{goldRaid:goldRaidView(s)}:{})};
    timings.aux.push(performance.now()-auxStart);
   }
   Object.assign(frame.view,cachedRaid);
   const transportStart=performance.now();structuredClone(frame);timings.transportClone.push(performance.now()-transportStart);
  }
  if(at%10000===0){const saveStart=performance.now();structuredClone(projectLocalCheckpoint(s));timings.checkpoint.push(performance.now()-saveStart);}
  timings.slice.push(performance.now()-sliceStart);
  minAlive=Math.min(minAlive,[s,...s.party].filter(c=>c.hp>0).length);
  maxUnits=Math.max(maxUnits,combatMembers(s).length);
 }
 const elapsed=performance.now()-start;
 const cpu=process.cpuUsage(cpuStart);
 return {s,timings,elapsed,cpuMs:(cpu.user+cpu.system)/1000,minAlive,maxUnits,activeTicks,hash:hash(s)};
}

console.log(JSON.stringify({kind:'environment',node:process.version,cpu:cpus()[0].model,duration,runs,sizes,bosses,rosters,
 method:'50ms calls, 100ms rule ticks + frames, 1s raid views, 10s checkpoints; synchronous structuredClone approximates transport; no browser/GPU/network/DB'}));
const cases=rosters.flatMap(roster=>bosses.flatMap(boss=>sizes.map(size=>{
 console.error(`Building ${roster}/${boss}/${size}`);
 return {roster,boss,size,initial:fixture(roster,size,boss),measurements:[]};
})));
for(const c of cases){c.warmHash=run(c.initial).hash;console.error(`Warmed ${c.roster}/${c.boss}/${c.size}`);}
const profilePath=arg('profile','');
let session;
if(profilePath){session=new Session();session.connect();await session.post('Profiler.enable');await session.post('Profiler.start');}
for(let i=0;i<runs;i++){
 for(const c of i%2?[...cases].reverse():cases){
  const measurement=run(c.initial);c.measurements.push(measurement);
  console.error(`Measured ${i+1}/${runs} ${c.roster}/${c.boss}/${c.size}: wall ${round(measurement.elapsed)} ms, CPU ${round(measurement.cpuMs)} ms`);
 }
}
if(session){const {profile}=await session.post('Profiler.stop');writeFileSync(profilePath,JSON.stringify(profile));session.disconnect();}
for(const c of cases){
 const ms=c.measurements,last=ms.at(-1),s=last.s;
 assert.ok(ms.every(m=>m.hash===last.hash)&&c.warmHash===last.hash,'warm and measured runs must be deterministic');
 const full=[];let snapshot;
 // Full view is separate: emitted at boundaries, and every second if battle is not watched.
 for(let i=0;i<3;i++){const start=performance.now();snapshot=projectClientSnapshot(s,view(s));structuredClone(snapshot);full.push(performance.now()-start);}
 const frame=projectCombatPlayback(s,battlePresentation(s),s.wallAt);
 Object.assign(frame.view,{combatCommand:combatCommandView(s),raidCommand:raidCommandView(s),...(s.goldRaid?{goldRaid:goldRaidView(s)}:{})});
 const times=Object.fromEntries(Object.keys(last.timings).map(k=>[k,summary(ms.flatMap(m=>m.timings[k]))]));
 console.log(JSON.stringify({kind:'result',roster:c.roster,boss:c.boss,size:c.size,roles:Object.fromEntries(['tank','healer','melee','ranged'].map(role=>[role,[s,...s.party].filter(c=>combatRole(c)===role).length])),
  totalMs:ms.map(m=>round(m.elapsed)),processCpuMs:ms.map(m=>round(m.cpuMs)),wallBudgetPercent:round(sum(ms.map(m=>m.elapsed))/runs/duration*100),timings:times,
  componentTotalMs:Object.fromEntries(Object.keys(last.timings).filter(k=>k!=='slice').map(k=>[k,round(sum(ms.map(m=>sum(m.timings[k])))/runs)])),
  minAlive:last.minAlive,maxFriendlyUnits:last.maxUnits,activeTicks:last.activeTicks,expectedTicks:duration/100,combatStillActive:!!s.combat,enemyCount:(s.combat||s.lastCombat).enemies.length,
  fullSnapshotMs:summary(full),frameBytes:Buffer.byteLength(JSON.stringify(frame)),checkpointBytes:Buffer.byteLength(JSON.stringify(projectLocalCheckpoint(s))),fullSnapshotBytes:Buffer.byteLength(JSON.stringify(snapshot)),
  raidCommandVisible:!!raidCommandView(s),hash:last.hash}));
}
