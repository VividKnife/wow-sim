// Isolated, full-engine pulls. No persistent account or resident data is used.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createRaidChallenge} from './support/raid-challenge.mjs';
import {moltenCoreBosses} from '../packages/game-domain/src/rules/molten-core-content.js';
import {beginMoltenCoreBattle} from '../packages/game-domain/src/rules/molten-core-battle.js';
import {defaultRaidTactics} from '../packages/game-domain/src/rules/molten-core-encounter.js';
import {advanceOwned} from '../packages/game-domain/src/rules/engine.js';
import {combatMembers} from '../packages/game-domain/src/rules/combat-members.js';
import {raidScaling,raidCreatureStats} from '../packages/game-domain/src/rules/raid-scaling.js';
import {scenePointAllowed} from '../packages/sim-core/src/scene-space.js';
import manifest from '../packages/game-data/manifest.json' with {type:'json'};

const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const bosses=arg('bosses',[...moltenCoreBosses.map(b=>b.id),'onyxia'].join(',')).split(',');
const duration=Number(arg('duration',raidScaling.encounterLimitMs+1000));
assert.ok(Number.isSafeInteger(duration)&&duration>=10000&&duration<=raidScaling.encounterLimitMs+1000);
const gear=arg('gear','fullEpic'),seed=60325;
const template=createRaidChallenge({size:40,tanks:4,healers:10,gear,seed});
const output=arg('output','docs/development/measurements/raid-rooms-2026-10-01.json');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const report={contentVersion:manifest.contentVersion,method:'Independent 40-player full-engine pulls, fixed seed, real challenge equipment, no damage/health multipliers or injected healing. Every 100 ms checks all living participants and enemies against the authored floor. A JSON checkpoint at five seconds must reproduce the entire durable state at ten seconds. Results are single cases, not balance or win-rate certification.',seed,gear,tanks:4,healers:10,durationMs:duration,expectedBosses:bosses,complete:false,results:[]};
for(const id of bosses){
 const s=structuredClone(template);if(id==='onyxia')s.goldRaid={raidId:'onyxias-lair'};
 beginMoltenCoreBattle(s,id,{...defaultRaidTactics,focusAdds:id!=='golemagg'});
 const area=s.combat.area;assert.equal(area.shape,'polygon',`${id}: missing room`);
 for(const e of s.combat.enemies){const source=raidCreatureStats(e.entry);for(const key of ['maxHp','low','high','armor','swing'])assert.equal(e[key],source[key],`${id}: ${e.entry}/${key}`);}
 const initialHash=digest(s),started=performance.now(),phases=new Set(),fields=new Set();
 let checkpoint=null,replayed=false,checkedUnits=0;
 const check=()=>{
  const battle=s.combat||s.lastCombat;
  for(const unit of [...combatMembers(s,battle),...battle.enemies])if(unit.hp>0&&!unit.removed){
   assert.ok(scenePointAllowed(area,unit),`${id}/${unit.id} outside floor at ${s.clock}: ${unit.position}, ${unit.positionY}`);checkedUnits++;
  }
  phases.add(battle.raidEncounter.submerged?'submerged':String(battle.raidEncounter.phase||1));
  for(const f of battle.raidEncounter.fires)fields.add(f.label);
 };
 check();
 while(s.combat&&s.clock<duration){
  advanceOwned(s,s.wallAt+100,{stopWhen:state=>!state.combat});check();
  if(s.clock===5000)checkpoint=JSON.parse(JSON.stringify(s));
  if(checkpoint&&s.clock>5000&&s.clock<=10000)advanceOwned(checkpoint,checkpoint.wallAt+100,{stopWhen:state=>!state.combat});
  if(checkpoint&&(s.clock===10000||!s.combat)){
   assert.deepEqual(JSON.parse(JSON.stringify(s)),JSON.parse(JSON.stringify(checkpoint)),`${id}: checkpoint replay diverged`);replayed=true;checkpoint=null;
  }
 }
 const battle=s.combat||s.lastCombat,boss=battle.enemies[0];
 const result={boss:id,roomId:area.id,geometryHash:area.geometryHash,initialHash,finalHash:digest(s),seconds:s.clock/1000,ended:!s.combat,won:!s.combat&&!battle.abandoned&&battle.enemies.every(e=>e.hp<=0||e.removed),timedOut:!!battle.raidEncounter.timedOut,alive:[s,...s.party].filter(c=>c.hp>0).length,bossRemainingPercent:Math.round(Math.max(0,boss.hp)/boss.maxHp*10000)/100,phases:[...phases],fields:[...fields],checkedUnits,checkpointReplay:replayed,wallMs:Math.round(performance.now()-started)};
 report.results.push(result);report.complete=report.results.length===bosses.length;
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(result));
}
