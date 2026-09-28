// Record/compare every simulation slice and presentation frame. Run against the
// same synthetic fixtures before and after a performance-only rules change.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {advanceOwned} from '../packages/game-domain/src/rules/engine.js';
import {battlePresentation} from '../packages/game-domain/src/rules/battle-presentation.js';
import {projectCombatPlayback} from '../packages/game-domain/src/rules/client-snapshot.ts';
import {combatCommandView} from '../packages/game-domain/src/rules/combat-command.js';
import {raidCommandView} from '../packages/game-domain/src/rules/raid-command.js';
import {goldRaidView} from '../packages/game-domain/src/rules/gold-raid.js';
import {projectLocalCheckpoint} from '../packages/game-domain/src/rules/local-checkpoint.js';

const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const fixtures=arg('fixtures'),tracePath=arg('trace'),expectedPath=arg('expected');
assert.ok(fixtures&&tracePath,'--fixtures=DIR and --trace=FILE are required');
const duration=Number(arg('duration')||15000);
assert.ok(Number.isSafeInteger(duration)&&duration>=1000&&duration%100===0);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const trace={duration,cases:{}};
for(const boss of ['lucifron','majordomo'])for(const size of [25,40]){
 const name=`gold-${size}-${boss}`,state=JSON.parse(readFileSync(join(fixtures,`${name}.json`),'utf8'));
 const result={initial:hash(state),slices:[]};trace.cases[name]=result;
 let cachedRaid;
 for(let at=50;at<=duration;at+=50){
  assert.ok(advanceOwned(state,at,{maxTicks:20}).complete);
  const sample={at};
  if(at%100===0){
   const frame=projectCombatPlayback(state,battlePresentation(state),state.wallAt);
   if(!cachedRaid||at%1000===0)cachedRaid={combatCommand:combatCommandView(state),raidCommand:raidCommandView(state),...(state.goldRaid?{goldRaid:goldRaidView(state)}:{})};
   Object.assign(frame.view,cachedRaid);sample.frame=hash(frame);
  }
  if(at%10000===0)sample.checkpoint=hash(projectLocalCheckpoint(state));
  sample.state=hash(state);result.slices.push(sample);
 }
 console.error(`Traced ${name}: ${result.slices.length} slices`);
}
writeFileSync(tracePath,JSON.stringify(trace));
if(expectedPath){
 assert.deepEqual(trace,JSON.parse(readFileSync(expectedPath,'utf8')),'state, frames and checkpoints must match at every slice');
 console.log(`Equivalent: ${Object.keys(trace.cases).length} scenarios, ${4*duration/50} states, ${4*duration/100} frames`);
}
